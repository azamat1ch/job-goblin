import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT } from './paths.mjs';

export const DEFAULT_CAMPAIGN = {
  version: 1, name: '', markets: [], roles: { primary: [], adjacent: [] },
  filters: { exclude_titles: [], exclude_companies: [], exclude_locations: [], max_posting_age_days: null },
  applications: { max_per_company_30_days: null, allow_seniority_mix: true, follow_up_days: null },
  discovery: { retention_days: 30, query_days: 21, overlap_days: 3 },
};

function object(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a mapping`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
function strings(value, label) {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) throw new Error(`${label} must be a list of non-empty strings`);
}
function positive(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || value < 1 || value > 3650) throw new Error(`${label} must be an integer from 1 to 3650${nullable ? ' or null' : ''}`);
}
export function validateCampaign(input) {
  object(input, 'campaign', Object.keys(DEFAULT_CAMPAIGN));
  const c = { ...structuredClone(DEFAULT_CAMPAIGN), ...input };
  if (c.version !== 1) throw new Error('campaign.version must be 1');
  if (typeof c.name !== 'string') throw new Error('campaign.name must be text');
  for (const key of ['roles', 'filters', 'applications', 'discovery']) {
    object(c[key], key, Object.keys(DEFAULT_CAMPAIGN[key]));
    c[key] = { ...DEFAULT_CAMPAIGN[key], ...c[key] };
  }
  for (const key of ['primary', 'adjacent']) strings(c.roles[key], `roles.${key}`);
  for (const key of ['exclude_titles', 'exclude_companies', 'exclude_locations']) strings(c.filters[key], `filters.${key}`);
  positive(c.filters.max_posting_age_days, 'filters.max_posting_age_days', true);
  positive(c.applications.max_per_company_30_days, 'applications.max_per_company_30_days', true);
  positive(c.applications.follow_up_days, 'applications.follow_up_days', true);
  if (typeof c.applications.allow_seniority_mix !== 'boolean') throw new Error('applications.allow_seniority_mix must be true or false');
  for (const key of ['retention_days', 'query_days', 'overlap_days']) positive(c.discovery[key], `discovery.${key}`);
  if (c.discovery.query_days > c.discovery.retention_days) throw new Error('discovery.query_days cannot exceed retention_days');
  if (c.discovery.overlap_days > c.discovery.query_days) throw new Error('discovery.overlap_days cannot exceed query_days');
  if (!Array.isArray(c.markets)) throw new Error('markets must be a list');
  const ids = new Set();
  for (const market of c.markets) {
    object(market, 'market', ['id', 'label', 'location_terms', 'remote']);
    if (!/^[a-z][a-z0-9_-]*$/.test(market.id) || ['all', 'unknown'].includes(market.id) || ids.has(market.id)) throw new Error('market.id must be a unique lowercase identifier, excluding all/unknown');
    ids.add(market.id);
    if (typeof market.label !== 'string' || !market.label.trim()) throw new Error('market.label is required');
    strings(market.location_terms, 'market.location_terms');
    if (typeof market.remote !== 'boolean') throw new Error('market.remote must be true or false');
  }
  return c;
}
export function loadCampaign() {
  const file = process.env.JOBS_CAMPAIGN || path.join(ROOT, 'config/private/campaign.yml');
  if (!existsSync(file)) {
    if (process.env.JOBS_CAMPAIGN) throw new Error(`Campaign file does not exist: ${file}`);
    return structuredClone(DEFAULT_CAMPAIGN);
  }
  return validateCampaign(yaml.load(readFileSync(file, 'utf8')));
}

// Literal phrase matching, not executable user regex. Token boundaries avoid
// matching "AI" inside "retail", while preserving punctuation such as C++.
export function matchesTerm(value, term) {
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(term.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(String(value || ''));
}
export function matchesAny(value, terms = []) { return terms.some(term => matchesTerm(value, term)); }
