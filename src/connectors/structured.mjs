import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadProviders, resolveProvider } from './providers/_registry.mjs';
import { makeHttpCtx } from './providers/_http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROVIDERS = path.join(ROOT, 'src', 'connectors', 'providers');
const REMOTE_PROVIDERS = new Set([
  '4dayweek', 'agentic-jobs', 'cryptocurrencyjobs', 'echojobs', 'hackernews',
  'himalayas', 'jobicy', 'nodesk', 'remoteok', 'remotive', 'weworkremotely',
  'workingnomads',
]);
// Source geography is an explicit campaign choice, never inferred from a market label.
// Missing and Workday count-only locations survive for later detail/review.
export function keepForMarket(job, entry, _market) {
  const location = String(job.location || '').trim();
  const terms = Array.isArray(entry.location_terms) ? entry.location_terms : [];
  if (!location || /^(?:\d+\s+locations?|multiple locations?|hybrid|in[- ]office|on[- ]site|remote|distributed|flexible)$/i.test(location) || !terms.length) return true;
  return terms.some((term) => {
    const value = String(term).trim();
    if (!value) return false;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(location);
  });
}

function entriesFrom(config) {
  return [...(config.tracked_companies || []), ...(config.job_boards || [])]
    .filter((entry) => entry && entry.enabled !== false);
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function workdayDetailUrl(jobUrl) {
  try {
    const url = new URL(jobUrl);
    const [site, ...rest] = url.pathname.split('/').filter(Boolean);
    const tenant = url.hostname.split('.')[0];
    if (!site || rest[0] !== 'job' || !tenant) return null;
    return `${url.origin}/wday/cxs/${tenant}/${site}/${rest.join('/')}`;
  } catch {
    return null;
  }
}

async function enrichWorkdayLocations(jobs, ctx) {
  return mapLimit(jobs, 6, async (job) => {
    if (job.location && !/^\d+\s+locations?$/i.test(job.location)) return job;
    const detailUrl = workdayDetailUrl(job.url);
    if (!detailUrl) return job;
    try {
      const detail = await ctx.fetchJson(detailUrl, { headers: { accept: 'application/json' } });
      const info = detail?.jobPostingInfo || {};
      const locations = [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      return {
        ...job,
        location: locations.join(' / ') || job.location,
        description: plainText(info.jobDescription) || job.description,
        postedAt: job.postedAt || (info.startDate ? Date.parse(info.startDate) : undefined),
        applyUrl: info.externalUrl || job.applyUrl || job.url,
      };
    } catch {
      return job;
    }
  });
}

export async function fetchCareerOps({ configPath, sourceFilter, market = 'unknown', concurrency = 8, sinceDays = null, sinceDaysForSource = null }) {
  const absolute = path.resolve(ROOT, configPath);
  const config = yaml.load(readFileSync(absolute, 'utf8')) || {};
  const providers = await loadProviders(PROVIDERS);
  const baseCtx = makeHttpCtx();
  let entries = entriesFrom(config);
  if (sourceFilter) {
    const needle = sourceFilter.toLowerCase();
    entries = entries.filter((entry) =>
      String(entry.name || '').toLowerCase().includes(needle)
      || String(entry.provider || '').toLowerCase() === needle);
  }

  const results = await mapLimit(entries, concurrency, async (entry) => {
    const entryDays = sinceDaysForSource ? sinceDaysForSource(entry.name) : sinceDays;
    const ctx = {
      ...baseCtx,
      sinceMs: Number.isFinite(Number(entryDays))
        ? Date.now() - Number(entryDays) * 86_400_000
        : undefined,
      includeUndated: true,
    };
    const resolved = resolveProvider(entry, providers);
    if (!resolved?.provider) {
      return { sourceKey: entry.name, provider: entry.provider || null, queryDays: Number(entryDays), status: 'browser_required', jobs: [], error: resolved?.error || 'no provider' };
    }
    try {
      let jobs;
      let partial = false;
      if (resolved.provider.id === 'workday' && !entry.search_text && entry.search_terms?.length) {
        const terms = entry.search_terms;
        const batches = await Promise.all(terms.map((searchText) =>
          resolved.provider.fetch({
            ...entry,
            search_text: searchText,
            location_text: entry.location_text,
            max_pages: Math.min(Number(entry.max_pages || entry.maxPages || 10), 50),
          }, ctx)));
        partial = batches.some((batch) => batch.workdayTruncated);
        const byUrl = new Map();
        for (const job of batches.flat()) byUrl.set(job.url, job);
        jobs = [...byUrl.values()];
      } else {
        jobs = await resolved.provider.fetch(entry, ctx);
        partial = Boolean(jobs.workdayTruncated);
      }
      if (resolved.provider.id === 'workday') jobs = await enrichWorkdayLocations(jobs, ctx);
      jobs = (Array.isArray(jobs) ? jobs : []).filter((job) => keepForMarket(job, entry, market));
      return {
        sourceKey: entry.name,
        provider: resolved.provider.id,
        queryDays: Number(entryDays),
        status: partial ? 'partial' : 'ok',
        jobs: jobs.map((job) => ({
          ...job,
          source: resolved.provider.id,
          source_key: entry.name,
          market: market !== 'unknown' ? market
            : REMOTE_PROVIDERS.has(resolved.provider.id) ? 'remote' : 'unknown',
          remote_scope: REMOTE_PROVIDERS.has(resolved.provider.id)
            ? (job.remote_scope || job.remoteScope || job.location || 'Remote; geography unspecified')
            : (job.remote_scope || job.remoteScope || ''),
          source_url: job.url,
          application_url: job.applyUrl || job.url,
        })),
      };
    } catch (error) {
      return { sourceKey: entry.name, provider: resolved.provider.id, queryDays: Number(entryDays), status: 'failed', jobs: [], error: error.message };
    }
  });

  return results;
}
