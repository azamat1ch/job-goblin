#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadProviders, resolveProvider } from '../src/connectors/providers/_registry.mjs';
import { APP_ROOT, ROOT } from '../src/lib/paths.mjs';
import { loadCampaign } from '../src/lib/campaign.mjs';
import { loadSources } from '../src/lib/sources.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: npm run configure -- --check | --draft\n--check (default): validate campaign and sources, including discovery readiness.\n--draft: validate configuration while allowing unfinished roles/markets/sources.\nSee docs/configuration.md for fields. This command does not run a network scan.');
  process.exit(0);
}
for (const arg of process.argv.slice(2)) if (!['--check', '--draft'].includes(arg)) { console.error(`Unknown option: ${arg}`); process.exit(1); }

try {
  const campaign = loadCampaign(), sources = loadSources();
  const active = Object.values(sources).flat().filter(s => s.enabled !== false);
  const providers = await loadProviders(path.join(APP_ROOT, 'src/connectors/providers'));
  const identities = new Set(active.filter(s => s.kind !== 'structured').map(s => s.name.toLowerCase()));
  const ids = new Set(campaign.markets.map(m => m.id));
  const problems = [];
  for (const source of active) {
    if (!ids.has(source.market)) problems.push(`${source.name}: market ${source.market} is absent from campaign.markets`);
    if (source.kind === 'structured') {
      const file = path.resolve(ROOT, source.config);
      if (!existsSync(file)) problems.push(`${source.name}: missing portal config ${source.config}`);
      else {
        const portal = yaml.load(readFileSync(file, 'utf8'));
        const entries = [...(portal?.tracked_companies || []), ...(portal?.job_boards || [])].filter(e => e.enabled !== false);
        if (!entries.length) problems.push(`${source.name}: no enabled portal entries`);
        for (const entry of entries) {
          if (!entry.name || (!entry.provider && !entry.careers_url)) problems.push(`${source.name}: every portal entry needs a name and provider or careers_url`);
          const identity = String(entry.name || '').toLowerCase();
          if (identities.has(identity)) problems.push(`Duplicate active source identity: ${entry.name}; use a market suffix`);
          identities.add(identity);
          const resolved = resolveProvider(entry, providers);
          if (!resolved?.provider) problems.push(`${entry.name}: no automated provider resolves; configure a browser source instead`);
          for (const key of ['location_terms', 'search_terms', 'keywords']) if (entry[key] !== undefined && (!Array.isArray(entry[key]) || entry[key].some(v => typeof v !== 'string' || !v.trim()))) problems.push(`${entry.name}: ${key} must be a list of non-empty strings`);
        }
      }
    }
  }
  if (!process.argv.includes('--draft')) {
    if (!campaign.name.trim()) problems.push('campaign.name is required before the first search');
    if (!campaign.roles.primary.length) problems.push('at least one primary target role is required');
    if (!campaign.markets.length) problems.push('at least one market is required');
    if (!active.length) problems.push('enable at least one relevant automated, LinkedIn, or browser source');
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`Configuration valid${process.argv.includes('--draft') ? ' (draft; readiness not checked)' : ' for discovery'}. ${active.length} enabled sources. This does not verify live source coverage or complete the interview.`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
