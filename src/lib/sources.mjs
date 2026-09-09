import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ROOT } from './paths.mjs';

export const SOURCE_KINDS = ['structured', 'efinancialcareers', 'direct_company', 'hk_html', 'eightfold_company', 'hk_public_company', 'ubs', 'two_sigma', 'hkstp_talent', 'huawei', 'remote3', 'web3_career'];
export function validateSources(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('sources must be a mapping');
  for (const key of Object.keys(config)) if (!['automated', 'linkedin', 'browser'].includes(key)) throw new Error(`Unknown sources section: ${key}`);
  const result = { automated: [], linkedin: [], browser: [], ...config };
  const names = new Set();
  for (const section of Object.keys(result)) {
    if (!Array.isArray(result[section])) throw new Error(`sources.${section} must be a list`);
    for (const source of result[section]) {
      if (!source || typeof source !== 'object' || typeof source.name !== 'string' || !source.name.trim()) throw new Error('Every source needs a name');
      if (names.has(source.name.toLowerCase())) throw new Error(`Duplicate source name: ${source.name}`);
      names.add(source.name.toLowerCase());
      if (source.enabled !== undefined && typeof source.enabled !== 'boolean') throw new Error(`${source.name}: enabled must be boolean`);
      if (source.enabled === false) continue;
      for (const field of ['queries', 'paths']) if (source[field] !== undefined && (!Array.isArray(source[field]) || source[field].some(v => typeof v !== 'string' || !v.trim()))) throw new Error(`${source.name}: ${field} must be a list of non-empty strings`);
      if (section === 'linkedin' && (typeof source.location !== 'string' || !source.location.trim())) throw new Error(`${source.name}: LinkedIn location is required`);
      if (source.remote !== undefined && typeof source.remote !== 'boolean') throw new Error(`${source.name}: remote must be boolean`);
      if (source.max_pages !== undefined && (!Number.isInteger(source.max_pages) || source.max_pages < 1 || source.max_pages > 100)) throw new Error(`${source.name}: max_pages must be an integer 1–100`);
      if (source.location !== undefined && typeof source.location !== 'string') throw new Error(`${source.name}: location must be text`);
      if (typeof source.market !== 'string' || !source.market) throw new Error(`${source.name}: market is required`);
      if (section === 'automated' && !SOURCE_KINDS.includes(source.kind)) throw new Error(`${source.name}: unsupported kind ${source.kind}`);
      if (section === 'automated' && source.kind === 'structured' && typeof source.config !== 'string') throw new Error(`${source.name}: structured sources need a config path`);
      if ((section === 'linkedin' && !source.keywords?.trim()) || (source.kind === 'efinancialcareers' && (!Array.isArray(source.queries) || !source.queries.length))) throw new Error(`${source.name}: explicit search queries are required`);
    }
  }
  return result;
}
export function loadSources(root = ROOT) {
  const file = path.join(root, 'config/sources.yml');
  return existsSync(file) ? validateSources(yaml.load(readFileSync(file, 'utf8'))) : { automated: [], linkedin: [], browser: [] };
}
