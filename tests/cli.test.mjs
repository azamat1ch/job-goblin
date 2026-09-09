import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/db/store.mjs';
import { normalizeJob } from '../src/lib/jobs.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
function writeCampaign(root) {
  mkdirSync(path.join(root, 'config/private'), { recursive: true });
  writeFileSync(path.join(root, 'config/private/campaign.yml'), `version: 1
name: Test campaign
markets:
  - id: global
    label: UK
    location_terms: [London]
    remote: false
  - id: hk
    label: Hong Kong
    location_terms: [Hong Kong]
    remote: false
filters:
  exclude_titles: [Intern, Mechanical Engineer, Network Engineer]
  max_posting_age_days: 14
`);
}


test('subcommand help does not initialize state or run the command', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'job-search-help-'));
  const dbPath = path.join(tempDir, 'jobs.db');
  writeCampaign(tempDir);

  try {
    const result = spawnSync(process.execPath, ['src/cli/jobs.mjs', 'find', '--help'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, JOBS_DB: dbPath, JOBS_ROOT: tempDir },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^jobs find /);
    assert.match(result.stdout, /Scan configured sources/);
    assert.equal(existsSync(dbPath), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function addGlobal(store, title, suffix) {
  return store.upsert(normalizeJob({
    company: 'Example Co', title, location: 'London', market: 'global',
    posted_at: new Date().toISOString(), source: 'greenhouse',
    url: `https://example.com/jobs/${suffix}`,
  })).id;
}

test('pre-review command persists deterministic skips', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'job-search-pre-review-'));
  const dbPath = path.join(tempDir, 'jobs.db');
  writeCampaign(tempDir);
  let store = new Store(dbPath);
  const internship = addGlobal(store, 'AI Engineer Intern', 'intern');
  const senior = addGlobal(store, 'Senior AI Engineer', 'senior');
  store.close();

  try {
    const result = spawnSync(process.execPath, ['src/cli/jobs.mjs', 'pre-review', '--market', 'global', '--json'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, JOBS_DB: dbPath, JOBS_ROOT: tempDir },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).skipped, 1);
    store = new Store(dbPath);
    assert.equal(store.get(internship).fit_verdict, 'skip');
    assert.equal(store.get(senior).fit_verdict, null);
    store.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('review-batch automatically applies token-free pre-review', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'job-search-review-batch-'));
  const dbPath = path.join(tempDir, 'jobs.db');
  writeCampaign(tempDir);
  let store = new Store(dbPath);
  const unrelated = addGlobal(store, 'Mechanical Engineer', 'mechanical');
  const manager = addGlobal(store, 'Engineering Manager, Applied AI', 'manager');
  const engineer = addGlobal(store, 'Machine Learning Engineer', 'engineer');
  store.close();

  try {
    const result = spawnSync(process.execPath, ['src/cli/jobs.mjs', 'review-batch', '--market', 'global'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, JOBS_DB: dbPath, JOBS_ROOT: tempDir },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(new Set(JSON.parse(result.stdout).map((row) => row.job_id)), new Set([engineer, manager]));
    store = new Store(dbPath);
    assert.equal(store.get(unrelated).fit_verdict, 'skip');
    assert.equal(store.get(manager).fit_verdict, null);
    store.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('pre-review cleans reviewed new roles without rewriting selected roles or repeating skips', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'job-search-reviewed-cleanup-'));
  const dbPath = path.join(tempDir, 'jobs.db');
  writeCampaign(tempDir);
  let store = new Store(dbPath);
  const add = (title, suffix, days = 1) => store.upsert(normalizeJob({
    company: 'Example Co', title, location: 'Hong Kong', market: 'hk',
    posted_at: new Date(Date.now() - days * 86_400_000).toISOString(),
    source: 'greenhouse', url: `https://example.com/jobs/${suffix}`,
  })).id;
  const lead = add('Lead AI Engineer', 'lead');
  const irrelevant = add('Network Engineer', 'network');
  const stale = add('AI Engineer', 'old', 16);
  const selected = add('Staff AI Engineer', 'selected');
  store.recordFitReviews([lead, stale, selected, irrelevant].map((job_id) => ({ job_id, verdict: 'recommended' })));
  store.queue(selected);
  store.close();
  const run = () => spawnSync(process.execPath, ['src/cli/jobs.mjs', 'pre-review', '--market', 'hk', '--json'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, JOBS_DB: dbPath, JOBS_ROOT: tempDir },
  });
  try {
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).skipped, 2);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).skipped, 0);
    store = new Store(dbPath);
    assert.equal(store.get(lead).fit_verdict, 'recommended');
    assert.equal(store.get(irrelevant).fit_verdict, 'skip');
    assert.equal(store.get(stale).fit_verdict, 'skip');
    assert.equal(store.get(selected).fit_verdict, 'recommended');
    assert.equal(store.get(selected).stage, 'queued');
    store.close();
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
});

test('offline import uses external workspace campaign and retains soft or unknown constraints', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'job-search-external-'));
  mkdirSync(path.join(root, 'config/private'), { recursive: true });
  writeFileSync(path.join(root, 'config/private/campaign.yml'), `version: 1
name: Finance in Singapore
markets:
  - id: singapore
    label: Singapore
    location_terms: [Singapore]
    remote: false
roles:
  primary: [Financial Analyst]
`);
  const input = path.join(root, 'jobs.json');
  writeFileSync(input, JSON.stringify([
    { company: 'Finance Co', title: 'Financial Analyst', location: 'Singapore', url: 'https://example.com/finance', description: 'Mandarin required. No sponsorship. Salary undisclosed.' },
    { company: 'Unknown Co', title: 'Accountant', location: '', url: 'https://example.com/unknown' },
  ]));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'src/cli/jobs.mjs'), ...args], {
    cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, JOBS_ROOT: root, JOBS_DB: '', JOBS_CAMPAIGN: '' },
  });
  try {
    const imported = run('import', input);
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /New 2/);
    assert.equal(existsSync(path.join(root, 'data/jobs.db')), true);
    const listed = run('list', '--json');
    assert.equal(listed.status, 0, listed.stderr);
    const rows = JSON.parse(listed.stdout);
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.company === 'Finance Co').market, 'singapore');
    assert.equal(rows.find(row => row.company === 'Finance Co').priority, 'strong');
    assert.equal(rows.find(row => row.company === 'Unknown Co').market, 'unknown');
    const reviewed = run('review-batch');
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.equal(JSON.parse(reviewed.stdout).length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('Wellfound browser snapshots import through the CLI without remote-only filtering', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'wellfound-import-'));
  const page = { props: { pageProps: { apolloState: { data: {
    'job:1': { __typename: 'JobListingSearchResult', id: '1', slug: 'analyst',
      title: 'Credit Analyst', locationNames: ['Hong Kong'], remoteConfig: { kind: 'ONSITE' } },
    'company:1': { __typename: 'StartupResult', name: 'Finance Co',
      highlightedJobListings: [{ __ref: 'job:1' }] },
  } } } } };
  const input = path.join(root, 'pages.json');
  writeFileSync(input, JSON.stringify([page, page]));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'src/cli/jobs.mjs'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, JOBS_ROOT: root, JOBS_DB: '', JOBS_CAMPAIGN: '' },
  });
  try {
    const imported = run('import', input, '--format', 'wellfound');
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /Imported 1. New 1/);
    const listed = run('list', '--json');
    assert.equal(listed.status, 0, listed.stderr);
    const rows = JSON.parse(listed.stdout);
    assert.equal(rows[0].title, 'Credit Analyst');
    assert.equal(rows[0].location, 'Hong Kong');
    assert.equal(rows[0].source, 'wellfound');
    assert.notEqual(run('import', input, '--format', 'invalid').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI records existing interview history without a fresh application', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'history-cli-'));
  const input = path.join(root, 'job.json');
  writeFileSync(input, JSON.stringify([{ company: 'Past Co', title: 'Analyst', url: 'https://example.com/past' }]));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'src/cli/jobs.mjs'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, JOBS_ROOT: root, JOBS_DB: '', JOBS_CAMPAIGN: '' },
  });
  try {
    assert.equal(run('import', input).status, 0);
    const id = JSON.parse(run('list', '--json').stdout)[0].id;
    const result = run('history', String(id), '--applied-at', '2025-10-01', '--stage', 'interview', '--evidence', 'User supplied tracker');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No new submission/);
    const row = JSON.parse(run('show', String(id), '--json').stdout);
    assert.equal(row.stage, 'interview');
    assert.equal(row.applied_at, '2025-10-01T00:00:00.000Z');
    assert.equal(row.cv_path, null);
    assert.notEqual(run('history', String(id), '--applied-at', '2025-10-02', '--evidence', 'duplicate').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI restores policy-expired roles after an explicit relaxed configuration', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'restore-cli-'));
  writeCampaign(root);
  const input = path.join(root, 'job.json');
  writeFileSync(input, JSON.stringify([{ company: 'Restore Co', title: 'Analyst',
    posted_at: new Date(Date.now() - 20 * 86400000).toISOString(), url: 'https://example.com/restore' }]));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'src/cli/jobs.mjs'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, JOBS_ROOT: root, JOBS_DB: '', JOBS_CAMPAIGN: '' },
  });
  try {
    assert.equal(run('import', input).status, 0);
    const row = JSON.parse(run('list', '--stage', 'all', '--json').stdout)[0];
    assert.equal(row.stage, 'closed');
    assert.notEqual(run('restore', String(row.id)).status, 0);
    writeFileSync(path.join(root, 'config/private/campaign.yml'), 'version: 1\nfilters:\n  max_posting_age_days: null\n');
    const result = run('restore', String(row.id));
    assert.equal(result.status, 0, result.stderr);
    const restored = JSON.parse(run('show', String(row.id), '--json').stdout);
    assert.equal(restored.stage, 'new');
    assert.equal(restored.posted_at, row.posted_at);
    assert.equal(restored.reposted_at, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
