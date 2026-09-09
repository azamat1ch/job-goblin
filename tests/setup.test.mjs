import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { APP_ROOT } from '../src/lib/paths.mjs';
import { DEFAULT_CAMPAIGN } from '../src/lib/campaign.mjs';
import { validateSources } from '../src/lib/sources.mjs';

function workspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'job kit onboarding '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (script, args = [], extra = {}) => spawnSync(process.execPath, [path.join(APP_ROOT, script), ...args], {
    cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, JOBS_ROOT: root, JOBS_CAMPAIGN: '', JOBS_DB: '', ...extra },
  });
  assert.equal(run('scripts/setup.mjs').status, 0);
  return { root, run };
}
function configure(root, role = 'Credit Analyst', market = 'hk') {
  const c = structuredClone(DEFAULT_CAMPAIGN);
  c.name = 'Synthetic campaign'; c.roles.primary = [role];
  c.markets = [{ id: market, label: 'Target market', location_terms: ['Hong Kong'], remote: false }];
  writeFileSync(path.join(root, 'config/private/campaign.yml'), yaml.dump(c));
  writeFileSync(path.join(root, 'config/sources.yml'), yaml.dump({ automated: [{ name: 'finance', kind: 'efinancialcareers', market, queries: [role], max_pages: 5 }], linkedin: [], browser: [] }));
}

test('setup is resumable, protects candidate facts, and readiness is explicit', t => {
  const { root, run } = workspace(t);
  assert.equal(run('scripts/configure.mjs', ['--draft']).status, 0);
  assert.notEqual(run('scripts/configure.mjs', ['--check']).status, 0);
  const evidence = path.join(root, 'config/private/cv.md');
  writeFileSync(evidence, 'Confirmed applicant evidence');
  assert.equal(run('scripts/setup.mjs').status, 0);
  assert.equal(readFileSync(evidence, 'utf8'), 'Confirmed applicant evidence');
  configure(root);
  assert.equal(run('scripts/configure.mjs', ['--check']).status, 0);
});

test('configured connector discovery stores finance, ranks it, and reports truncation', t => {
  const { root, run } = workspace(t); configure(root);
  const mock = path.join(root, 'mock-fetch.mjs');
  writeFileSync(mock, `globalThis.fetch = async input => {
    if (!String(input).includes('efinancialcareers.com')) throw new Error('Unexpected source');
    return new Response(JSON.stringify({ data: Array.from({length:50}, (_, i) => ({title:'Credit Analyst', companyName:'Example Bank '+i, detailsPageUrl:'/jobs/'+i, jobLocation:{displayName:'Hong Kong'}, postedDate:new Date().toISOString()})) }), {status:200});
  };`);
  const result = run('src/cli/jobs.mjs', ['find', '--json', '--pages', '1'], { NODE_OPTIONS: `--import=${JSON.stringify(mock)}` });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.inserted, 50);
  assert.equal(report.fetched, 50);
  assert.equal(report.sources[0].status, 'partial');
  const rows = JSON.parse(run('src/cli/jobs.mjs', ['list', '--json']).stdout);
  assert.equal(rows[0].priority, 'strong');
  assert.equal(rows[0].market, 'hk');
});

test('readiness catches unknown providers and repeated nested source identities', t => {
  const { root, run } = workspace(t); configure(root);
  const portal = { tracked_companies: [{ name: 'same-source', provider: 'not-a-provider', careers_url: 'https://example.invalid/jobs' }] };
  writeFileSync(path.join(root, 'config/boards.yml'), yaml.dump(portal));
  writeFileSync(path.join(root, 'config/sources.yml'), yaml.dump({ automated: [{ name: 'boards', kind: 'structured', market: 'hk', config: 'config/boards.yml' }], browser: [{ name: 'same-source', market: 'hk' }] }));
  const result = run('scripts/configure.mjs', ['--check']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate active source identity/);
  assert.match(result.stderr, /no automated provider resolves/);
});

test('malformed remote and query configuration fails before fetching', () => {
  assert.throws(() => validateSources({ linkedin: [{ name: 'x', market: 'ca', keywords: 'Designer' }] }), /location/);
  assert.throws(() => validateSources({ linkedin: [{ name: 'x', market: 'ca', keywords: 'Designer', location: 'Canada', remote: 'false' }] }), /remote/);
  assert.throws(() => validateSources({ automated: [{ name: 'x', market: 'hk', kind: 'efinancialcareers', queries: [''] }] }), /queries/);
});

test('persona is an explicit choice and both modes share exactly the same directive', t => {
  const generic = workspace(t), goblin = workspace(t);
  const agentPath = root => path.join(root, 'config/private/agent');
  assert.throws(() => readFileSync(path.join(agentPath(generic.root), 'identity.md')), /ENOENT/);
  assert.equal(generic.run('scripts/setup.mjs', ['--persona', 'generic']).status, 0);
  assert.equal(goblin.run('scripts/setup.mjs', ['--persona', 'goblin']).status, 0);
  for (const [instance, mode] of [[generic, 'generic'], [goblin, 'goblin']]) {
    for (const name of ['directive', 'identity', 'voice']) {
      const template = name === 'directive' ? 'directive.md' : `${mode}/${name}.md`;
      assert.equal(readFileSync(path.join(agentPath(instance.root), `${name}.md`), 'utf8'),
        readFileSync(path.join(APP_ROOT, 'templates/agent', template), 'utf8'));
    }
  }
  assert.equal(readFileSync(path.join(agentPath(generic.root), 'directive.md'), 'utf8'),
    readFileSync(path.join(agentPath(goblin.root), 'directive.md'), 'utf8'));
  assert.notEqual(readFileSync(path.join(agentPath(generic.root), 'voice.md'), 'utf8'),
    readFileSync(path.join(agentPath(goblin.root), 'voice.md'), 'utf8'));
});

test('repeat persona setup preserves edited identity, voice, directive and candidate files', t => {
  const { root, run } = workspace(t);
  assert.equal(run('scripts/setup.mjs', ['--persona', 'goblin']).status, 0);
  const files = ['agent/directive.md', 'agent/identity.md', 'agent/voice.md', 'cv.md', 'preferences.md'];
  const before = new Map(files.map(file => {
    const absolute = path.join(root, 'config/private', file);
    const custom = readFileSync(absolute, 'utf8') + '\nuser correction to preserve\n';
    writeFileSync(absolute, custom);
    return [absolute, custom];
  }));
  assert.equal(run('scripts/setup.mjs').status, 0);
  assert.equal(run('scripts/setup.mjs', ['--persona', 'goblin']).status, 0);
  for (const [file, text] of before) assert.equal(readFileSync(file, 'utf8'), text);
  const switchAttempt = run('scripts/setup.mjs', ['--persona', 'generic']);
  assert.notEqual(switchAttempt.status, 0);
  assert.match(switchAttempt.stderr, /SETUP.md/);
  for (const [file, text] of before) assert.equal(readFileSync(file, 'utf8'), text);
});

test('persona setup fills a missing voice without resetting the chosen identity', t => {
  const { root, run } = workspace(t);
  assert.equal(run('scripts/setup.mjs', ['--persona', 'generic']).status, 0);
  const identity = path.join(root, 'config/private/agent/identity.md');
  const customized = readFileSync(identity, 'utf8') + '\nuse the preferred name Sam\n';
  writeFileSync(identity, customized);
  rmSync(path.join(root, 'config/private/agent/voice.md'));
  assert.equal(run('scripts/setup.mjs', ['--persona', 'generic']).status, 0);
  assert.equal(readFileSync(identity, 'utf8'), customized);
  assert.equal(readFileSync(path.join(root, 'config/private/agent/voice.md'), 'utf8'),
    readFileSync(path.join(APP_ROOT, 'templates/agent/generic/voice.md'), 'utf8'));
});

test('invalid persona arguments fail without creating an agent identity', t => {
  const { root, run } = workspace(t);
  for (const args of [['--persona'], ['--persona', 'gremlin'], ['--force'], ['--persona', 'goblin', '--force']]) {
    assert.notEqual(run('scripts/setup.mjs', args).status, 0);
  }
  assert.throws(() => readFileSync(path.join(root, 'config/private/agent/identity.md')), /ENOENT/);
});

test('missing directive in an established persona is reported without substituting a default', t => {
  const { root, run } = workspace(t);
  assert.equal(run('scripts/setup.mjs', ['--persona', 'generic']).status, 0);
  const dir = path.join(root, 'config/private/agent');
  const identity = readFileSync(path.join(dir, 'identity.md'), 'utf8');
  rmSync(path.join(dir, 'directive.md'));
  for (const args of [[], ['--persona', 'generic']]) {
    const result = run('scripts/setup.mjs', args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Recover the user directive/);
    assert.throws(() => readFileSync(path.join(dir, 'directive.md')), /ENOENT/);
    assert.equal(readFileSync(path.join(dir, 'identity.md'), 'utf8'), identity);
  }
});
