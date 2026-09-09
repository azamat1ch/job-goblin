#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync, chmodSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Store } from '../db/store.mjs';
import { normalizeJob, ageDays, isFresh } from '../lib/jobs.mjs';
import { preReviewJobs } from '../lib/pre-review.mjs';
import { fetchCareerOps } from '../connectors/structured.mjs';
import { fetchLinkedInQuery } from '../connectors/linkedin-guest.mjs';
import { fetchEfinancialCareers } from '../connectors/efinancialcareers.mjs';
import { fetchJobDetail } from '../connectors/job-detail.mjs';
import { fetchDirectCompany } from '../connectors/direct-company.mjs';
import { fetchHkHtmlCompany } from '../connectors/hk-html-company.mjs';
import { fetchEightfoldCompany } from '../connectors/eightfold-company.mjs';
import { fetchHkPublicCompany } from '../connectors/hk-public-company.mjs';
import { fetchTwoSigma } from '../connectors/two-sigma.mjs';
import { fetchUbs } from '../connectors/ubs.mjs';
import { fetchHkstpTalent } from '../connectors/hkstp-talent.mjs';
import { fetchHuawei } from '../connectors/huawei.mjs';
import { fetchRemote3 } from '../connectors/remote3.mjs';
import { parseWellfoundPages } from '../connectors/wellfound-page.mjs';
import { fetchWeb3Career } from '../connectors/web3-career.mjs';
import { startDashboard, currentSourceHealth } from '../web/server.mjs';

import { ROOT } from '../lib/paths.mjs';
import { loadSources } from '../lib/sources.mjs';

const COMMANDS = [
  ['init', 'Initialize the local database and print its path.'],
  ['find [--scope market-id|all] [--source name] [--days N] [--pages N] [--force] [--limit N] [--json]', 'Scan configured sources and store new jobs.'],
  ['review-batch [--market market-id] [--limit N] [--hydrate]', 'Return a stable job batch for fit review, optionally fetching missing details first.'],
  ['pre-review [--market market-id|all] [--json]', 'Apply deterministic token-free skips before fit review.'],
  ['review-import <file|->', 'Store a fit-review result batch.'],
  ['hydrate <id> [id...]', 'Fetch missing details for stored jobs.'],
  ['link <id> --application-url URL', 'Store a resolved employer application URL while preserving the discovery link.'],
  ['reclassify', 'Refresh stored market and eligibility classifications.'],
  ['list [--stage name] [--market market-id] [--fit recommended|maybe|needs_answer|skip|unreviewed] [--priority strong|possible|low] [--source name] [--company name] [--days N] [--limit N] [--json]', 'List the current working set.'],
  ['show <id> [--json]', 'Show one stored job.'],
  ['import <file|-> [--format jobs|wellfound] [--source name] [--market market-id] [--days N]', 'Import normalized browser-source JSON.'],
  ['prepare <id> [--verified-date YYYY-MM-DD] [--browser-live]', 'Check guards, create an application packet, and select the job.'],
  ['preflight <id> --browser-live', 'Record the final liveness check before submission.'],
  ['apply <id> [--success --cv path --answers path] [--confirmation text] [--cv-version name] [--channel name] [--fail reason]', 'Inspect an application or record its result.'],
  ['history <id> --applied-at date --evidence text [--stage applied|replied|interview|final_round|offer|closed] [--channel name]', 'Record a past application with its real date; does not submit anything.'],
  ['restore <id>', 'Restore an unsubmitted age-expired job after relaxing the campaign age limit.'],
  ['retry <id>', 'Clear a retryable failure without changing pipeline stage.'],
  ['reopen <id> --reposted-date YYYY-MM-DD', 'Reopen an old role after a confirmed repost.'],
  ['mark <id> <replied|interview|final_round|offer|closed>', 'Record a post-application pipeline change.'],
  ['note <id> --text "note"', 'Add a factual note to job history.'],
  ['outreach add <job-id> --name text --channel email|linkedin [options]', 'Save a job-linked outreach draft.'],
  ['outreach mark <outreach-id> <sent|replied|closed> [--follow-up date]', 'Advance an outreach message.'],
  ['outreach follow-up <outreach-id> --message path [--follow-up date]', 'Record an approved follow-up in the same outreach thread.'],
  ['followups [--due date] [--json]', 'Show due outreach and configured application follow-ups.'],
  ['followup <job-id> --sent [--note text]', 'Record that a due application follow-up was sent.'],
  ['experiment add --hypothesis text --change text --cohort text --metric text', 'Start one measurable campaign experiment.'],
  ['experiment close <id> --result text --decision text', 'Close an experiment with its result and decision.'],
  ['experiments [--status active|closed] [--json]', 'List campaign experiments.'],
  ['status [--json]', 'Show pipeline and source totals.'],
  ['audit [--json]', 'Show pipeline state and source health.'],
  ['source <name> <ok|partial|blocked|failed> [--count N] [--reason text]', 'Record a browser-source result.'],
  ['dashboard [--port N]', 'Start the read-only local dashboard.'],
];

function usage(command) {
  if (command) {
    const detail = COMMANDS.find(([synopsis]) => synopsis.split(' ')[0] === command);
    if (!detail) throw new Error(`unknown command: ${command}`);
    console.log(`jobs ${detail[0]}\n\n${detail[1]}`);
    return;
  }

  console.log('jobs <command> [options]\n');
  for (const [synopsis, description] of COMMANDS) {
    console.log(`  ${synopsis}\n      ${description}`);
  }
  console.log('\nRun jobs <command> --help for one command.');
}

function options(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (!value.startsWith('--')) { out._.push(value); continue; }
    const [rawKey, inline] = value.slice(2).split('=', 2);
    if (inline !== undefined) out[rawKey] = inline;
    else if (args[i + 1] && !args[i + 1].startsWith('--')) out[rawKey] = args[++i];
    else out[rawKey] = true;
  }
  return out;
}

function sourceConfig() {
  return loadSources();
}

function printRows(rows) {
  if (!rows.length) return console.log('No matching jobs.');
  for (const row of rows) {
    const flags = [row.market, row.priority, row.eligibility, row.stage].filter(Boolean).join(', ');
    const age = ageDays(row.reposted_at || row.posted_at);
    console.log(`${row.id}. ${row.company} | ${row.title}`);
    console.log(`   ${row.location || 'location unclear'} | ${flags} | ${age == null ? 'date unclear' : `${age}d old`}`);
    console.log(`   ${row.application_url || row.source_url}`);
    if (row.failure_reason) console.log(`   failed: ${row.failure_reason}`);
  }
}

function readRecords(file) {
  const text = file === '-' ? readFileSync(0, 'utf8') : readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function artifactFile(jobId, candidate, label) {
  if (!candidate) return null;
  const artifactRoot = path.resolve(ROOT, 'artifacts', String(jobId));
  const resolved = path.resolve(process.cwd(), candidate);
  if (!(resolved === artifactRoot || resolved.startsWith(`${artifactRoot}${path.sep}`))) {
    throw new Error(`${label} must be inside artifacts/${jobId}/`);
  }
  const info = lstatSync(resolved);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label} must be a regular file, not a link`);
  const realRoot = realpathSync(artifactRoot);
  const realFile = realpathSync(resolved);
  if (!realFile.startsWith(`${realRoot}${path.sep}`)) throw new Error(`${label} resolves outside artifacts/${jobId}/`);
  chmodSync(resolved, 0o600);
  return path.relative(ROOT, resolved);
}

async function checkLive(url) {
  try {
    const response = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
    });
    if ([404, 410].includes(response.status)) return { live: false, status: response.status };
    if (!response.ok) return { live: null, status: response.status, browserCheckRecommended: true };
    return { live: true, status: response.status };
  } catch (error) {
    return { live: null, error: error.message, browserCheckRecommended: true };
  }
}

async function hydrateJobs(store, jobs, { skipComplete = false, concurrency = 4 } = {}) {
  const results = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor++;
      const job = jobs[index];
      if (!job || job.missing) { results[index] = { id: job?.id, status: 'failed', error: 'job not found' }; continue; }
      if (skipComplete && String(job.description || '').trim().length >= 200 && job.posted_at && job.application_url) {
        results[index] = { id: job.id || job.job_id, status: 'unchanged' };
        continue;
      }
      try {
        const detail = await fetchJobDetail(job);
        const enriched = store.enrichJob(job.id || job.job_id, detail);
        results[index] = { id: enriched.id, status: detail.description || detail.application_url ? 'ok' : 'unchanged',
          description_length: (enriched.description || '').length, application_url: enriched.application_url };
      } catch (error) {
        const id = job.id || job.job_id;
        store.event('detail_enrichment_failed', { jobId: id, details: { error: error.message } });
        results[index] = { id, status: 'failed', error: error.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  store.expireStaleNew();
  return results;
}

function runPreReview(store, { market = 'all' } = {}) {
  const candidates = store.preReviewCandidates({ market });
  const { reviews, rules } = preReviewJobs(candidates);
  if (reviews.length) store.recordFitReviews(reviews);
  return { market, checked: candidates.length, skipped: reviews.length, rules };
}

async function findJobs(store, opts) {
  const config = sourceConfig();
  if (!store.campaign.roles.primary.length || !store.campaign.markets.length) throw new Error('Complete SETUP.md: configure target roles and markets before discovery');
  const scope = opts.scope || 'all';
  const sourceNeedle = opts.source ? String(opts.source).toLowerCase() : null;
  const scanKey = `scope:${scope}:${sourceNeedle || 'all'}`;
  const explicitDays = opts.days ? Number(opts.days) : null;
  const queryDays = explicitDays || store.scanWindowDays(scanKey);
  const sourceDays = (name) => explicitDays || store.sourceScanWindowDays(name);
  const retentionDays = store.campaign.discovery.retention_days;
  const runId = `find-${new Date().toISOString()}`;
  const collected = [];
  const summaries = [];

  const nativeFetchers = {
    efinancialcareers: (s, days) => fetchEfinancialCareers({ queries: s.queries, days, maxPages: Number(opts.pages || s.max_pages || 5) }),
    direct_company: (s, days) => fetchDirectCompany(s.provider, { sinceDays: days }),
    hk_html: s => fetchHkHtmlCompany(s.provider),
    eightfold_company: (s, days) => fetchEightfoldCompany(s.provider, { sinceDays: days, queries: s.queries, location: s.location }),
    hk_public_company: (s, days) => fetchHkPublicCompany(s.provider, { sinceDays: days }),
    ubs: (_s, days) => fetchUbs({ sinceDays: days }),
    two_sigma: (_s, days) => fetchTwoSigma({ sinceDays: days }),
    hkstp_talent: (_s, days) => fetchHkstpTalent({ days }),
    huawei: (_s, days) => fetchHuawei({ days }),
    remote3: (_s, days) => fetchRemote3({ sinceDays: days }),
    web3_career: (s, days) => fetchWeb3Career({ sinceDays: days, paths: s.paths, maxPages: Number(s.max_pages || 2) }),
  };
  const recordSource = detail => {
    summaries.push(detail);
    store.event('source_scan', { runId, details: detail });
  };
  for (const source of config.automated || []) {
    if (source.enabled === false || (scope !== 'all' && source.market !== scope)) continue;
    if (source.kind === 'structured') {
      try {
        const results = await fetchCareerOps({
          configPath: path.resolve(ROOT, source.config),
          sourceFilter: sourceNeedle && source.name.toLowerCase().includes(sourceNeedle) ? null : sourceNeedle,
          market: source.market, sinceDays: queryDays, sinceDaysForSource: sourceDays,
        });
        for (const result of results) {
          collected.push(...result.jobs);
          recordSource({ name: result.sourceKey, provider: result.provider, status: result.status, count: result.jobs.length, error: result.error || null, query_days: result.queryDays, cadence_days: source.cadence_days || 1 });
        }
      } catch (error) {
        recordSource({ name: source.name, provider: source.kind, status: 'failed', count: 0, error: error.message, query_days: sourceDays(source.name), cadence_days: source.cadence_days || 1 });
      }
      continue;
    }
    if (sourceNeedle && !source.name.toLowerCase().includes(sourceNeedle) && source.provider !== sourceNeedle && source.kind !== sourceNeedle) continue;
    const days = sourceDays(source.name);
    try {
      const jobs = await nativeFetchers[source.kind](source, days);
      collected.push(...jobs.map(job => ({ ...job, market: source.market })));
      recordSource({ name: source.name, provider: source.provider || source.kind, status: jobs.truncated ? 'partial' : 'ok', count: jobs.length, query_days: days, cadence_days: source.cadence_days || 1, reason: jobs.truncated ? 'Result window ended before the source did' : null });
    } catch (error) {
      recordSource({ name: source.name, provider: source.provider || source.kind, status: 'failed', count: 0, error: error.message, query_days: days, cadence_days: source.cadence_days || 1 });
    }
  }

  for (const query of config.linkedin || []) {
    if (query.enabled === false) continue;
    if (scope !== 'all' && query.market !== scope) continue;
    if (sourceNeedle && !query.name.toLowerCase().includes(sourceNeedle) && sourceNeedle !== 'linkedin') continue;
    const days = sourceDays(query.name);
    try {
      const jobs = await fetchLinkedInQuery(query, {
        days,
        maxPages: opts.pages ? Number(opts.pages) : undefined,
      });
      collected.push(...jobs.map(job => ({ ...job, market: query.market })));
      const detail = {
        name: query.name, provider: 'linkedin_guest', status: jobs.truncated ? 'partial' : 'ok', count: jobs.length,
        truncated: Boolean(jobs.truncated), reason: jobs.truncated ? 'Result window ended before the source did' : null,
        query_days: days, cadence_days: 1,
      };
      summaries.push(detail);
      store.event('source_scan', { runId, details: detail });
    } catch (error) {
      const detail = { name: query.name, provider: 'linkedin_guest', status: 'failed', count: 0, error: error.message, query_days: days, cadence_days: 1 };
      summaries.push(detail);
      store.event('source_scan', { runId, details: detail });
    }
  }

  let inserted = 0;
  let seen = 0;
  let invalid = 0;
  let irrelevant = 0;
  let stale = 0;
  let incompatible = 0;
  const insertedIds = [];
  for (const raw of collected) {
    try {
      const job = normalizeJob(raw);


      if (!isFresh(job, retentionDays)) { stale++; continue; }
      const result = store.upsert(job, { runId });
      if (result.inserted) { inserted++; insertedIds.push(result.id); } else seen++;
    } catch {
      invalid++;
    }
  }

  const expired = store.expireStaleNew();
  const browserHealth = new Map(store.sourceHealth().map((source) => [source.name.toLowerCase(), source]));
  const browserDue = (config.browser || []).filter((source) =>
    source.enabled !== false && (scope === 'all' || source.market === scope)
    && (!sourceNeedle || source.name.toLowerCase().includes(sourceNeedle))
    && (opts.force || !browserHealth.get(source.name.toLowerCase())
      || browserHealth.get(source.name.toLowerCase()).due));
  const usefulSources = summaries.filter((item) => ['ok', 'partial'].includes(item.status));
  const scanStatus = usefulSources.length === 0 ? 'failed'
    : summaries.every((item) => item.status === 'ok') ? 'ok' : 'partial';
  store.event('scan_run', { runId, details: {
    name: scanKey, provider: 'orchestrator', status: scanStatus, count: collected.length,
    retained: inserted + seen, inserted, seen, stale, incompatible, irrelevant, invalid,
    browser_due: browserDue.map((source) => source.name),
  } });
  const newJobs = insertedIds.slice(0, Number(opts.limit || 50)).map((id) => {
    const job = store.get(id);
    return { id: job.id, company: job.company, title: job.title, location: job.location, market: job.market,
      source: job.source, priority: job.priority, eligibility: job.eligibility, eligibility_reason: job.eligibility_reason,
      posted_at: job.posted_at, application_url: job.application_url };
  });
  const result = { runId, query_days: queryDays, retention_days: retentionDays, fetched: collected.length, inserted, seen, stale, expired, incompatible, irrelevant, invalid, sources: summaries, browserDue, new_jobs: newJobs };
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Fetched ${collected.length}. New ${inserted}. Seen before ${seen}. Stale ${stale}. Expired ${expired}. Incompatible ${incompatible}. Clearly irrelevant ${irrelevant}. Invalid ${invalid}.`);
    const failed = summaries.filter((item) => item.status !== 'ok');
    if (failed.length) console.log(`${failed.length} automated sources need repair or browser fallback.`);
    if (browserDue.length) console.log(`Browser sources still due: ${browserDue.map((item) => item.name).join(', ')}`);
    printRows(insertedIds.slice(0, Number(opts.limit || 30)).map((id) => store.get(id)));
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ['--help', '-h'].includes(command)) return usage();
  if (command === 'help') return usage(rest[0]);
  if (rest.includes('--help') || rest.includes('-h')) return usage(command);
  const opts = options(rest);
  const store = new Store(process.env.JOBS_DB ? path.resolve(process.env.JOBS_DB) : undefined);
  try {
    if (command === 'init') return console.log(`Ready: ${path.relative(ROOT, process.env.JOBS_DB || path.join(ROOT, 'data', 'jobs.db'))}`);
    if (command === 'find') return await findJobs(store, opts);
    if (command === 'pre-review') {
      const result = runPreReview(store, { market: opts.market || 'all' });
      if (opts.json) return console.log(JSON.stringify(result, null, 2));
      return console.log(`Pre-reviewed ${result.checked} jobs; skipped ${result.skipped}.`);
    }
    if (command === 'review-batch') {
      runPreReview(store, { market: opts.market || 'all' });
      let batch = store.fitBatch({ market: opts.market, limit: opts.limit || 20 });
      if (opts.hydrate) {
        const ids = batch.map((job) => job.job_id);
        await hydrateJobs(store, batch.map((row) => store.get(row.job_id)), { skipComplete: true });
        runPreReview(store, { market: opts.market || 'all' });
        batch = store.fitRecords(ids).filter((row) => {
          const job = store.get(row.job_id);
          return job?.stage === 'new' && job.priority !== 'low'
            && job.eligibility !== 'likely_incompatible' && job.fit_verdict == null;
        });
      }
      return console.log(JSON.stringify(batch, null, 2));
    }
    if (command === 'review-import') {
      const records = readRecords(opts._[0]);
      const count = store.recordFitReviews(records);
      return console.log(`Stored ${count} fit reviews.`);
    }
    if (command === 'hydrate') {
      const ids = opts._.map(Number);
      if (!ids.length || ids.some((id) => !Number.isInteger(id))) throw new Error('usage: jobs hydrate <id> [id...]');
      const results = await hydrateJobs(store, ids.map((id) => store.get(id) || { id, missing: true }));
      return console.log(JSON.stringify(results, null, 2));
    }
    if (command === 'link') {
      const row = store.setApplicationUrl(opts._[0], opts['application-url']);
      return console.log(`Job ${row.id} employer application link saved.`);
    }
    if (command === 'reclassify') {
      const result = store.refreshClassifications();
      const expired = store.expireStaleNew();
      return console.log(`Reclassified ${result.changed} of ${result.checked} stored jobs. Expired ${expired} stale new jobs.`);
    }
    if (command === 'list') {
      const rows = store.list({ stage: opts.stage, market: opts.market, priority: opts.priority, fit: opts.fit, source: opts.source, company: opts.company, limit: opts.limit || 50, freshDays: opts.days || store.campaign.discovery.retention_days });
      return opts.json ? console.log(JSON.stringify(rows, null, 2)) : printRows(rows);
    }
    if (command === 'show') {
      const row = store.get(opts._[0]);
      if (!row) throw new Error(`job not found: ${opts._[0]}`);
      return opts.json ? console.log(JSON.stringify(row, null, 2)) : printRows([row]);
    }
    if (command === 'import') {
      const format = opts.format || 'jobs';
      if (!['jobs', 'wellfound'].includes(format)) throw new Error('import --format must be jobs or wellfound');
      const input = readRecords(opts._[0]);
      const records = format === 'wellfound' ? parseWellfoundPages(input) : input;
      let inserted = 0;
      let stale = 0;
      let irrelevant = 0;
      let invalid = 0;
      let incompatible = 0;
      const days = Number(opts.days || store.campaign.discovery.retention_days);
      for (const raw of records) {
        try {
          const job = normalizeJob(raw, { source: opts.source, market: opts.market });


          if (!isFresh(job, days)) { stale++; continue; }
          const result = store.upsert(job);
          if (result.inserted) inserted++;
        } catch { invalid++; }
      }
      if (opts.source) {
        const source = (sourceConfig().browser || []).find((item) => item.name === opts.source);
        store.event('source_scan', { runId: `browser-${new Date().toISOString()}`, details: {
        name: opts.source, provider: 'browser', status: 'ok', count: records.length,
        retained: inserted, inserted, stale, incompatible, irrelevant, invalid, cadence_days: source?.cadence_days || 7,
      } });
      }
      const expired = store.expireStaleNew();
      return console.log(`Imported ${records.length}. New ${inserted}. Stale ${stale}. Expired ${expired}. Incompatible ${incompatible}. Clearly irrelevant ${irrelevant}. Invalid ${invalid}.`);
    }
    if (command === 'prepare') {
      const id = opts._[0];
      if (opts['verified-date']) store.setPostedDate(id, opts['verified-date']);
      const allowed = store.canQueue(id);
      if (!allowed.ok) throw new Error(allowed.reason);
      const live = await checkLive(allowed.job.application_url || allowed.job.source_url);
      if (live.live === false && !opts['browser-live']) { store.fail(id, `role is no longer live (${live.status})`); throw new Error(`role is no longer live (${live.status})`); }
      if (live.live !== true && !opts['browser-live']) {
        store.fail(id, `HTTP liveness was inconclusive${live.status ? ` (${live.status})` : ''}; confirm in the browser`);
        throw new Error('liveness is inconclusive; confirm the exact role in the browser, then rerun with --browser-live');
      }
      const dir = path.join(ROOT, 'artifacts', String(id));
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const packet = { job: allowed.job, liveness: live, prepared_at: new Date().toISOString(), missing_answers: [] };
      const packetPath = path.join(dir, 'application.json');
      writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
      chmodSync(packetPath, 0o600);
      store.queue(id, { liveness: live });
      return console.log(`Prepared job ${id}. Browser application is ready to start.`);
    }
    if (command === 'preflight') {
      const id = opts._[0];
      const allowed = store.canSubmit(id);
      if (!allowed.ok) throw new Error(allowed.reason);
      if (!opts['browser-live']) throw new Error('confirm the exact open application form in the browser, then rerun with --browser-live');
      const live = await checkLive(allowed.job.application_url || allowed.job.source_url);
      if (live.live === false && !opts['browser-live']) { store.fail(id, `role is no longer live (${live.status})`); throw new Error(`role is no longer live (${live.status})`); }
      store.recordPreflight(id, { liveness: live, browserConfirmed: Boolean(opts['browser-live']) });
      return console.log(`Job ${id} passed the final liveness check. Submit within 15 minutes.`);
    }
    if (command === 'apply') {
      const id = opts._[0];
      if (opts.fail) { store.fail(id, opts.fail); return console.log(`Job ${id} saved as retryable failure.`); }
      if (opts.success) {
        const allowed = store.canSubmit(id);
        if (!allowed.ok) throw new Error(allowed.reason);
        if (!store.hasRecentPreflight(id)) throw new Error('run preflight immediately before submitting, then record success');
        if (!opts.cv) throw new Error('--cv is required so the submitted CV is recorded');
        if (!opts.answers) throw new Error('--answers is required so the submitted form answers are recorded');
        if (!String(opts.confirmation || '').trim()) throw new Error('--confirmation is required from the visible success page');
        const assertArtifact = (candidate, label) => {
          const stored = artifactFile(id, candidate, label);
          if (label === 'CV' && !/\.(pdf|docx?|rtf)$/i.test(stored)) throw new Error('CV must be an uploadable PDF, DOC, DOCX, or RTF file');
          return stored;
        };
        const cvPath = assertArtifact(opts.cv, 'CV');
        const answersPath = assertArtifact(opts.answers, 'answers');
        store.recordApplication(id, {
          confirmationId: opts.confirmation, cvPath, cvVersion: opts['cv-version'],
          answersPath, channel: opts.channel,
        });
        return console.log(`Job ${id} marked applied.`);
      }
      const allowed = store.canSubmit(id);
      if (!allowed.ok) throw new Error(allowed.reason);
      printRows([allowed.job]);
      return console.log('Read skills/job-apply/SKILL.md. Run preflight just before submission and mark success only after the site confirms it.');
    }
    if (command === 'retry') { store.retry(opts._[0]); return console.log(`Job ${opts._[0]} failure cleared; its pipeline stage was preserved.`); }
    if (command === 'reopen') {
      if (!opts['reposted-date']) throw new Error('--reposted-date is required');
      store.reopen(opts._[0], opts['reposted-date']);
      return console.log(`Job ${opts._[0]} reopened from a confirmed repost.`);
    }
    if (command === 'mark') {
      const id = opts._[0]; const stage = opts._[1]; const job = store.get(id);
      if (!job) throw new Error(`job not found: ${id}`);
      if (['new', 'queued', 'applied'].includes(stage)) throw new Error('use prepare/apply for application stages; mark is for replies, interviews, offers, or closing a role');
      if (stage !== 'closed' && !job.applied_at) throw new Error('cannot record a response before an application');
      store.transition(id, stage); return console.log(`Job ${id} -> ${stage}.`);
    }
    if (command === 'history') {
      const row = store.recordHistory(opts._[0], { appliedAt: opts['applied-at'],
        stage: opts.stage || 'applied', evidence: opts.evidence, channel: opts.channel });
      return console.log(`Historical application recorded for job ${row.id}: ${row.stage}, applied ${row.applied_at}. No new submission was made.`);
    }
    if (command === 'restore') {
      const row = store.restoreExpired(opts._[0]);
      return console.log(`Job ${row.id} restored for review; original posting dates preserved.`);
    }
    if (command === 'note') {
      store.note(opts._[0], opts.text);
      return console.log(`Note added to job ${opts._[0]}.`);
    }
    if (command === 'outreach') {
      const action = opts._[0];
      if (action === 'add') {
        const jobId = opts._[1];
        let messagePath = null;
        if (opts.message) {
          messagePath = artifactFile(jobId, opts.message, 'message');
        }
        const row = store.addOutreach(jobId, {
          contactName: opts.name, contactRole: opts.role, contactUrl: opts.url,
          address: opts.address, channel: opts.channel, messagePath, followUpAt: opts['follow-up'],
        });
        return console.log(`Outreach ${row.id} saved as a draft for ${row.contact_name}.`);
      }
      if (action === 'mark') {
        const row = store.markOutreach(opts._[1], opts._[2], { followUpAt: opts['follow-up'] });
        return console.log(`Outreach ${row.id} -> ${row.status}.`);
      }
      if (action === 'follow-up') {
        if (!opts.message) throw new Error('--message is required so the exact approved follow-up is preserved');
        const current = store.db.prepare('SELECT job_id FROM outreach WHERE id=?').get(Number(opts._[1]));
        if (!current) throw new Error(`outreach not found: ${opts._[1]}`);
        const messagePath = artifactFile(current.job_id, opts.message, 'message');
        const row = store.recordOutreachFollowUp(opts._[1], { messagePath, followUpAt: opts['follow-up'] });
        return console.log(`Outreach ${row.id} follow-up recorded.`);
      }
      throw new Error('use outreach add, outreach mark, or outreach follow-up');
    }
    if (command === 'followups') {
      const due = opts.due || new Date().toISOString();
      const rows = [...store.followUps(due), ...store.applicationFollowUps(due)]
        .sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at)));
      if (opts.json) return console.log(JSON.stringify(rows, null, 2));
      if (!rows.length) return console.log('No follow-ups are due.');
      for (const row of rows) {
        if (row.kind === 'application') console.log(`Job ${row.id}. ${row.company} | ${row.title} | application follow-up due ${row.next_action_at}`);
        else console.log(`Outreach ${row.id}. ${row.company} | ${row.contact_name} via ${row.channel} | due ${row.next_action_at}`);
      }
      return;
    }
    if (command === 'followup') {
      if (!opts.sent) throw new Error('use followup <job-id> --sent after the application follow-up is sent');
      store.recordApplicationFollowUp(opts._[0], { note: opts.note });
      return console.log(`Application follow-up recorded for job ${opts._[0]}.`);
    }
    if (command === 'experiment') {
      const action = opts._[0];
      if (action === 'add') {
        const row = store.addExperiment({ hypothesis: opts.hypothesis, change: opts.change, cohort: opts.cohort, metric: opts.metric });
        return console.log(`Experiment ${row.id} started.`);
      }
      if (action === 'close') {
        const row = store.closeExperiment(opts._[1], { result: opts.result, decision: opts.decision });
        return console.log(`Experiment ${row.id} closed: ${row.decision}`);
      }
      throw new Error('use experiment add or experiment close <id>');
    }
    if (command === 'experiments') {
      const rows = store.listExperiments(opts.status);
      if (opts.json) return console.log(JSON.stringify(rows, null, 2));
      if (!rows.length) return console.log('No matching experiments.');
      for (const row of rows) console.log(`${row.id}. [${row.status}] ${row.hypothesis} | metric: ${row.metric}${row.decision ? ` | decision: ${row.decision}` : ''}`);
      return;
    }
    if (command === 'status') {
      const result = store.status();
      if (opts.json) return console.log(JSON.stringify(result, null, 2));
      console.log(`Jobs: ${result.stages.map((row) => `${row.stage} ${row.count}`).join(', ') || 'none'}. Failures: ${result.failures}.`);
      for (const row of result.sources) console.log(`${row.source}: ${row.total} jobs, ${row.applied} applied, ${row.responses} responses`);
      return;
    }
    if (command === 'audit') {
      const config = sourceConfig();
      const sourceHealth = currentSourceHealth(config, store.sourceHealth(), (file) => (
        yaml.load(readFileSync(path.join(ROOT, file), 'utf8')) || {}
      ));
      const latest = new Map(sourceHealth.map((item) => [item.name.toLowerCase(), item]));
      const browserSources = (config.browser || []).map((source) => ({ ...source, latest: latest.get(source.name.toLowerCase()) || null }));
      const result = { status: store.status(), source_health: sourceHealth, browser_sources: browserSources };
      return opts.json ? console.log(JSON.stringify(result, null, 2)) : console.log(JSON.stringify(result, null, 2));
    }
    if (command === 'source') {
      const [name, status] = opts._;
      if (!name || !['ok', 'partial', 'blocked', 'failed'].includes(status)) throw new Error('usage: jobs source <name> <ok|partial|blocked|failed> [--count N] [--reason text]');
      const configured = (sourceConfig().browser || []).find((item) => item.name === name);
      store.event('source_scan', { runId: `manual-${new Date().toISOString()}`, details: {
        name, provider: 'browser', status, count: Number(opts.count || 0), reason: opts.reason || null,
        cadence_days: configured?.cadence_days || 7,
      } });
      return console.log(`${name}: ${status}${opts.reason ? ` — ${opts.reason}` : ''}`);
    }
    if (command === 'dashboard') {
      return startDashboard({ port: Number(opts.port || process.env.PORT || 4173) });
    }
    throw new Error(`unknown command: ${command}`);
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
