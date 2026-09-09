import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installAgent } from '../scripts/install-agent.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'job kit spaces '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'skills/job-search-bootstrap'), { recursive: true });
  await writeFile(path.join(root, 'skills/job-search-bootstrap/SKILL.md'), 'canonical skill');
  await writeFile(path.join(root, 'AGENTS.md'), 'user instructions');
  await writeFile(path.join(root, 'CLAUDE.md'), 'claude instructions');
  return root;
}
test('both runtimes install idempotently in paths with spaces and share canonical skill', async t => {
  const root = await fixture(t);
  assert.deepEqual((await installAgent({ root, agent: 'both' })).map(x => x.status), ['installed', 'installed']);
  assert.deepEqual((await installAgent({ root, agent: 'both' })).map(x => x.status), ['already-installed', 'already-installed']);
  for (const dir of ['.agents', '.claude']) {
    assert.equal(await realpath(path.join(root, dir, 'skills/job-search-bootstrap')), path.join(root, 'skills/job-search-bootstrap'));
  }
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), 'user instructions');
  assert.equal(await readFile(path.join(root, 'CLAUDE.md'), 'utf8'), 'claude instructions');
});
test('conflicting skill is preserved and both installation is preflighted', async t => {
  const root = await fixture(t);
  const conflict = path.join(root, '.claude/skills/job-search-bootstrap');
  await mkdir(conflict, { recursive: true });
  await writeFile(path.join(conflict, 'SKILL.md'), 'user skill');
  await assert.rejects(installAgent({ root, agent: 'both' }), /Preserving existing skill/);
  assert.equal(await readFile(path.join(conflict, 'SKILL.md'), 'utf8'), 'user skill');
  await assert.rejects(lstat(path.join(root, '.agents')), { code: 'ENOENT' });
});
test('dangling links and linked destination directories are not replaced or traversed', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.agents/skills'), { recursive: true });
  const target = path.join(root, '.agents/skills/job-search-bootstrap');
  await symlink('missing', target);
  await assert.rejects(installAgent({ root, agent: 'codex' }), /Preserving existing skill/);
  assert.equal((await lstat(target)).isSymbolicLink(), true);
  await symlink(path.join(root, '.agents'), path.join(root, '.claude'));
  await assert.rejects(installAgent({ root, agent: 'claude' }), /linked destination/);
});
test('invalid runtime is rejected without mutation', async t => {
  const root = await fixture(t);
  await assert.rejects(installAgent({ root, agent: 'unknown' }), /Choose --agent/);
  await assert.rejects(lstat(path.join(root, '.agents')), { code: 'ENOENT' });
});

test('all skills share canonical files and a late conflict prevents every new link', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'skills/job-interview'));
  await writeFile(path.join(root, 'skills/job-interview/SKILL.md'), 'interview procedure');
  const conflict = path.join(root, '.claude/skills/job-search-bootstrap');
  await mkdir(conflict, { recursive: true });
  await writeFile(path.join(conflict, 'SKILL.md'), 'personal skill');
  await assert.rejects(installAgent({ root, agent: 'both' }), /Preserving existing skill/);
  await assert.rejects(lstat(path.join(root, '.agents')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(root, '.claude/skills/job-interview')), { code: 'ENOENT' });
  await rm(conflict, { recursive: true });
  const results = await installAgent({ root, agent: 'both' });
  assert.equal(results.length, 4);
  for (const entry of results) {
    assert.equal(await realpath(entry.path), path.join(root, 'skills', entry.skill));
  }
  await writeFile(path.join(root, 'skills/job-interview/SKILL.md'), 'updated procedure');
  assert.equal(await readFile(path.join(root, '.claude/skills/job-interview/SKILL.md'), 'utf8'), 'updated procedure');
  assert.ok((await installAgent({ root, agent: 'both' })).every(x => x.status === 'already-installed'));
});
