#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { APP_ROOT, ROOT } from '../src/lib/paths.mjs';
import { DEFAULT_CAMPAIGN } from '../src/lib/campaign.mjs';
import { Store } from '../src/db/store.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: npm run setup -- [--persona generic|goblin]\nCreates missing private files. Choose a persona during SETUP.md; no option preserves the current choice.\nPersona files live in config/private/agent/. Existing edited files are preserved; switch them using SETUP.md.');
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--persona' || !['generic', 'goblin'].includes(args[1]))) {
  console.error('Use --persona generic or --persona goblin, or --help'); process.exit(1);
}
const persona = args[1];
const agentFiles = {};
const agentDir = path.join(ROOT, 'config/private/agent');
if (!existsSync(path.join(agentDir, 'directive.md'))
    && ['identity.md', 'voice.md'].some(name => existsSync(path.join(agentDir, name)))) {
  console.error('Existing persona is missing its directive. Recover the user directive from a trusted copy or ask the user for replacement text; setup will not substitute the default.');
  process.exit(1);
}
if (persona) {
  for (const name of ['directive', 'identity', 'voice']) {
    const relative = name === 'directive' ? 'directive.md' : `${persona}/${name}.md`;
    agentFiles[`config/private/agent/${name}.md`] = readFileSync(path.join(APP_ROOT, 'templates/agent', relative), 'utf8');
  }
  const identityPath = path.join(ROOT, 'config/private/agent/identity.md');
  if (existsSync(identityPath) && !readFileSync(identityPath, 'utf8').includes(`<!-- persona: ${persona} -->`)) {
    console.error('Existing persona differs. Follow SETUP.md to switch identity.md and voice.md while preserving personal edits.');
    process.exit(1);
  }
}

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required');
for (const dir of ['config/private', ...(persona ? ['config/private/agent'] : []), 'data', 'artifacts']) mkdirSync(path.join(ROOT, dir), { recursive: true, mode: 0o700 });
const files = {
  ...agentFiles,
  'config/private/campaign.yml': yaml.dump(DEFAULT_CAMPAIGN),
  'config/private/profile.yml': yaml.dump({ candidate: { full_name: null, email: null, phone: null, location: null, timezone: null, links: [] }, work: { current_title: null, current_employer: null, notice_period: null, earliest_start_date: null }, authorization: { countries: [], relocation: null } }),
  'config/private/cv.md': '# Evidence bank\n\nNo candidate evidence has been confirmed. Record roles, dates, responsibilities, achievements, qualifications, and the source of each claim during setup.\n',
  'config/private/answers.md': '# Reusable application answers\n\nRecord confirmed answers only. Unknown is not no. Keep legal and authorization answers country-specific.\n',
  'config/private/preferences.md': '# Campaign preferences\n\nNot yet interviewed. Store soft preferences, role-specific review guidance, communication voice, workflow choices, and explicit action permissions here.\n',
  'config/private/onboarding.md': '# Onboarding\n\nStatus: not started\n\nResume SETUP.md. Record coverage of each interview area, confirmed decisions, deferred questions, and why each hard filter exists.\n',
  'config/private/state.md': '# Current state\n\nSetup incomplete. No search has run.\n\nNext: read SETUP.md and start the candidate interview.\n',
  'config/sources.yml': 'automated: []\nlinkedin: []\nbrowser: []\n',
};
for (const [file, content] of Object.entries(files)) {
  const target = path.join(ROOT, file);
  if (existsSync(target)) continue;
  writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
  console.log(`Created ${file}`);
}
const store = new Store(); store.close();
console.log('Workspace initialized without overwriting existing files. Continue with SETUP.md. Initialization does not enable sources.');
if (persona) console.log(`Persona ready: ${persona}. Read config/private/agent/{directive,identity,voice}.md. Preserve the directive; personalize identity, voice and campaign context during the interview.`);
