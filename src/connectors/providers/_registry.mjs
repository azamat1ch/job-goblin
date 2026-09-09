// Load provider modules and resolve explicit IDs or detected endpoints.

import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Load every provider plugin in a directory into an id→provider Map.
 *
 * Alphabetical order so detect() priority is deterministic across machines.
 * Malformed modules (wrong shape, duplicate id, import error) are logged and
 * skipped, never fatal.
 *
 * @param {string} dir - Absolute path to the providers directory.
 * @returns {Promise<Map<string, object>>}
 */
export async function loadProviders(dir) {
  const providers = new Map();
  if (!existsSync(dir)) return providers;
  const entries = readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort();
  for (const file of entries) {
    const full = path.join(dir, file);
    let mod;
    try {
      mod = await import(pathToFileURL(full).href);
    } catch (err) {
      console.error(`⚠️  ${file}: failed to load — ${err.message}`);
      continue;
    }
    const p = mod.default;
    if (!p || typeof p.fetch !== 'function' || !p.id) {
      console.error(`⚠️  ${file}: skipping — default export must be { id, fetch }`);
      continue;
    }
    if (providers.has(p.id)) {
      console.error(`⚠️  ${file}: duplicate provider id "${p.id}" — keeping first`);
      continue;
    }
    providers.set(p.id, p);
  }
  return providers;
}

/**
 * Resolve which provider handles a tracked_companies entry.
 *   1. Explicit `provider:` field wins (skips detect()).
 *   2. Otherwise each provider's detect() runs in load order; first hit wins.
 *
 * @param {object} entry - tracked_companies entry.
 * @param {Map<string, object>} providers - id→provider Map from loadProviders().
 * @returns {{provider: object}|{error: string}|null}
 */
export function resolveProvider(entry, providers) {
  if (entry.provider) {
    const p = providers.get(entry.provider);
    if (!p) return { error: `unknown provider: ${entry.provider}` };
    return { provider: p };
  }

  for (const p of providers.values()) {
    let hit;
    try {
      hit = p.detect?.(entry);
    } catch (err) {
      console.error(`⚠️  ${p.id}: detect() threw for "${entry.name}" — ${err.message}`);
      continue;
    }
    if (hit) return { provider: p };
  }
  return null;
}
