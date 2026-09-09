#!/usr/bin/env node
import { mkdir, lstat, realpath, symlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function installAgent({ root, agent }) {
  if (!['codex', 'claude', 'both'].includes(agent)) {
    throw new Error('Choose --agent codex, claude, or both.');
  }
  const repo = await realpath(root);
  const skillsRoot = path.join(repo, 'skills');
  if (!(await lstat(path.join(skillsRoot, 'job-search-bootstrap', 'SKILL.md'))).isFile()) {
    throw new Error('Target is not a Job Search Kit repository: missing bootstrap skill.');
  }
  const skills = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const skill of skills) {
    if (!(await lstat(path.join(skillsRoot, skill, 'SKILL.md'))).isFile()) {
      throw new Error(`Missing SKILL.md: ${skill}`);
    }
  }
  const names = agent === 'both' ? ['codex', 'claude'] : [agent];
  const targets = names.flatMap(name => skills.map(skill => ({ name, skill,
    source: path.join(skillsRoot, skill), target: path.join(repo,
      name === 'codex' ? '.agents' : '.claude', 'skills', skill) })));
  // Validate the complete request first, so a conflict in one runtime does not
  // produce a half-installation in the other. Never replace existing content.
  for (const entry of targets) {
    const ancestor = path.dirname(path.dirname(entry.target));
    for (const dir of [ancestor, path.dirname(entry.target)]) {
      try {
        const st = await lstat(dir);
        if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`Refusing non-directory or linked destination: ${dir}`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    try {
      const st = await lstat(entry.target);
      if (st.isSymbolicLink() && await realpath(entry.target).catch(() => null) === await realpath(entry.source)) {
        entry.exists = true;
      } else throw new Error(`Preserving existing skill: ${entry.target}. Resolve the conflict manually; nothing was overwritten.`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const entry of targets) {
    if (!entry.exists) {
      await mkdir(path.dirname(entry.target), { recursive: true });
      await symlink(path.relative(path.dirname(entry.target), entry.source), entry.target, 'dir');
    }
  }
  return targets.map(({ name, skill, target, exists }) => ({ agent: name, skill, path: target, status: exists ? 'already-installed' : 'installed' }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/install-agent.mjs --agent codex|claude|both [--root "path to kit"]\nInstalls all canonical project skills. Never changes AGENTS.md, CLAUDE.md, or global settings.');
    return;
  }
  let agent;
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (!['--agent', '--root'].includes(option) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Invalid argument ${option}. Use --help.`);
    }
    if (option === '--agent') agent = args[++i];
    else root = path.resolve(args[++i]);
  }
  console.log(JSON.stringify(await installAgent({ root, agent }), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
