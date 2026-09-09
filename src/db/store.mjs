import { readFileSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { keyText, classify, canonicalUrl, normalizeDate } from '../lib/jobs.mjs';

import { ROOT, APP_ROOT } from '../lib/paths.mjs';
import { loadCampaign } from '../lib/campaign.mjs';
const AGGREGATORS = new Set([
  'jobstreet', 'linkedin_guest', 'efinancialcareers', 'remoteok', 'remotive',
  'himalayas', 'workingnomads', 'weworkremotely', 'hackernews', 'agentic-jobs',
  'cryptocurrencyjobs', 'jobicy', 'nodesk', '4dayweek', 'wellfound', 'yc-jobs',
  'ycombinator', 'jobsdb', 'jobsdb_hk', 'hkstp_talent', 'cyberport', 'ctgoodjobs',
]);
const DISTINCT_AGGREGATOR_POSTINGS = new Set(['linkedin_guest']);
const TRUSTED_REPOST_DATE_SOURCES = new Set([
  'ashby', 'greenhouse', 'lever', 'oraclecloud', 'successfactors',
]);
const FIT_VERDICTS = new Set(['recommended', 'maybe', 'needs_answer', 'skip']);

function trustedRepostDate(existing, incoming) {
  if (existing.stage !== 'new' || existing.source !== incoming.source
    || !TRUSTED_REPOST_DATE_SOURCES.has(incoming.source) || !incoming.posted_at) return null;
  const incomingTime = new Date(incoming.posted_at).valueOf();
  const priorTimes = [existing.posted_at, existing.reposted_at]
    .map((value) => new Date(value || '').valueOf())
    .filter(Number.isFinite);
  if (!Number.isFinite(incomingTime) || priorTimes.length === 0
    || incomingTime <= Math.max(...priorTimes)) return null;
  return new Date(incomingTime).toISOString();
}

function linkedinJobId(value) {
  try {
    return new URL(value).pathname.match(/\/jobs\/view\/(?:.*-)?(\d{6,})\/?$/i)?.[1] || null;
  } catch {
    return null;
  }
}

function genericApplicationUrl(value) {
  try {
    const pathName = new URL(value).pathname.toLowerCase().replace(/\/+$/, '');
    return !pathName || /^\/(?:careers?|jobs?|job-search|openings?|opportunities?|apply|search)$/.test(pathName);
  } catch {
    return true;
  }
}

export class Store {
  constructor(file = path.join(ROOT, 'data', 'jobs.db'), campaign = loadCampaign()) {
    this.campaign = campaign;
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout = 10000;');
    chmodSync(file, 0o600);
    this.db.exec(readFileSync(path.join(APP_ROOT, 'src/db/schema.sql'), 'utf8'));
    const columns = new Set(this.db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name));
    for (const [name, type] of [
      ['fit_verdict', 'TEXT'], ['fit_reason', 'TEXT'], ['fit_gap', 'TEXT'],
      ['fit_eligibility_note', 'TEXT'], ['fit_reviewed_at', 'TEXT'],
      ['fit_description_hash', 'TEXT'], ['cv_version', 'TEXT'],
      ['application_channel', 'TEXT'],
    ]) {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
    }
    this.db.exec(`UPDATE jobs SET posted_at = datetime(CAST(posted_at AS INTEGER) / 1000, 'unixepoch')
      WHERE posted_at GLOB '[0-9]*' AND CAST(posted_at AS REAL) > 100000000000;
      UPDATE jobs SET reposted_at = datetime(CAST(reposted_at AS INTEGER) / 1000, 'unixepoch')
      WHERE reposted_at GLOB '[0-9]*' AND CAST(reposted_at AS REAL) > 100000000000;`);
  }

  close() { this.db.close(); }

  event(kind, { jobId = null, runId = null, details = {} } = {}) {
    this.db.prepare(`INSERT INTO events(job_id, kind, created_at, run_id, details_json)
      VALUES (?, ?, ?, ?, ?)`).run(jobId, kind, new Date().toISOString(), runId, JSON.stringify(details));
  }

  upsert(job, { runId = null } = {}) {
    const now = new Date().toISOString();
    let existing = this.db.prepare(`SELECT id, canonical_key, stage, source, source_key, source_url, application_url,
      location, remote_scope, market, description, description_hash, posted_at, reposted_at
      FROM jobs WHERE canonical_key = ?`).get(job.canonical_key);
    if (!existing) {
      existing = this.db.prepare(`SELECT id, canonical_key, stage, source, source_key, source_url, application_url,
        location, remote_scope, market, description, description_hash, posted_at, reposted_at
        FROM jobs WHERE source_url=? LIMIT 1`).get(job.source_url);
    }
    if (!existing && !genericApplicationUrl(job.application_url)) {
      existing = this.db.prepare(`SELECT id, canonical_key, stage, source, source_key, source_url, application_url,
        location, remote_scope, market, description, description_hash, posted_at, reposted_at
        FROM jobs WHERE application_url=? AND application_url != source_url LIMIT 1`).get(job.application_url);
    }
    const linkedinId = job.source === 'linkedin_guest' ? linkedinJobId(job.source_url) : null;
    if (!existing && linkedinId) {
      existing = this.db.prepare(`SELECT id, canonical_key, stage, source, source_key, source_url, application_url,
        location, remote_scope, market, description, description_hash, posted_at, reposted_at
        FROM jobs WHERE source='linkedin_guest' AND source_url LIKE ? LIMIT 1`).get(`%${linkedinId}`);
    }
    if (!existing) {
      const candidates = this.db.prepare(`SELECT id, canonical_key, stage, source, source_key, source_url, application_url,
        location, remote_scope, market, description, description_hash, posted_at, reposted_at
        FROM jobs WHERE company_key=? AND title_key=? AND market=?`).all(job.company_key, job.title_key, job.market)
        .filter((row) => {
          const crossSource = row.source !== job.source && (AGGREGATORS.has(row.source) || AGGREGATORS.has(job.source));
          const sameAggregator = row.source === job.source && AGGREGATORS.has(job.source)
            && !DISTINCT_AGGREGATOR_POSTINGS.has(job.source);
          const sameLocation = keyText(row.location) === keyText(job.location);
          return (crossSource || sameAggregator) && sameLocation;
        });
      if (candidates.length === 1) existing = candidates[0];
    }
    if (existing) {
      const repostedAt = trustedRepostDate(existing, job);
      const keepDirectRoute = !AGGREGATORS.has(existing.source) && AGGREGATORS.has(job.source);
      const description = (existing.description && existing.description.length > job.description.length)
        ? existing.description : job.description;
      const location = existing.location || job.location;
      const remoteScope = existing.remote_scope || job.remote_scope;
      const effective = { ...job, description, location, remote_scope: remoteScope };
      const classification = classify(effective, this.campaign);
      const resolvedApplication = AGGREGATORS.has(job.source)
        && existing.application_url && existing.application_url !== existing.source_url
        ? existing.application_url : job.application_url;
      this.db.prepare(`UPDATE jobs SET
        canonical_key=?, company=?, company_key=?, title=?, title_key=?, seniority=?, location=?, market=?,
        remote_scope=?, salary_text=?, source=?, source_key=?, source_url=?, application_url=?,
        description=COALESCE(NULLIF(?, ''), description),
        description_hash=COALESCE(?, description_hash), posted_at=COALESCE(?, posted_at),
        reposted_at=COALESCE(?, reposted_at), last_seen_at=?, eligibility=?,
        eligibility_reason=?, priority=?, raw_json=?, updated_at=? WHERE id=?`).run(
        keepDirectRoute ? existing.canonical_key : job.canonical_key,
        job.company, job.company_key, job.title, job.title_key, classification.seniority, location,
        classification.market, remoteScope, job.salary_text,
        keepDirectRoute ? existing.source : job.source,
        keepDirectRoute ? existing.source_key : job.source_key,
        keepDirectRoute ? existing.source_url : job.source_url,
        keepDirectRoute ? existing.application_url : resolvedApplication,
        description, description ? createHash('sha256').update(description).digest('hex') : null,
        existing.posted_at || job.posted_at, repostedAt || existing.reposted_at || job.reposted_at, now,
        classification.eligibility, classification.eligibility_reason,
        classification.priority, job.raw_json, now, existing.id,
      );
      const nextDescriptionHash = description ? createHash('sha256').update(description).digest('hex') : null;
      if (repostedAt || (nextDescriptionHash && nextDescriptionHash !== existing.description_hash)) {
        this.db.prepare(`UPDATE jobs SET fit_verdict=NULL, fit_reason=NULL, fit_gap=NULL,
          fit_eligibility_note=NULL, fit_reviewed_at=NULL, fit_description_hash=NULL WHERE id=?`).run(existing.id);
      }
      if (repostedAt) {
        this.event('reposted', { jobId: existing.id, runId, details: {
          source: job.source, prior_posted_at: existing.reposted_at || existing.posted_at, reposted_at: repostedAt,
        } });
      }
      this.event('seen_again', { jobId: existing.id, runId, details: { source: job.source } });
      return { id: existing.id, inserted: false };
    }

    const result = this.db.prepare(`INSERT INTO jobs(
      canonical_key, company, company_key, title, title_key, seniority, location, market,
      remote_scope, salary_text, source, source_key, source_url, application_url,
      description, description_hash, posted_at, reposted_at, first_seen_at, last_seen_at,
      eligibility, eligibility_reason, priority, raw_json, updated_at
    ) VALUES (${Array(25).fill('?').join(',')})`).run(
      job.canonical_key, job.company, job.company_key, job.title, job.title_key,
      job.seniority, job.location, job.market, job.remote_scope, job.salary_text,
      job.source, job.source_key, job.source_url, job.application_url, job.description,
      job.description_hash, job.posted_at, job.reposted_at, now, now, job.eligibility,
      job.eligibility_reason, job.priority, job.raw_json, now,
    );
    const id = Number(result.lastInsertRowid);
    this.event('discovered', { jobId: id, runId, details: { source: job.source } });
    return { id, inserted: true };
  }

  get(id) { return this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(id)); }

  countJobs() { return Number(this.db.prepare('SELECT COUNT(*) count FROM jobs').get().count); }

  list({ stage, market, priority, fit, source, company, limit = 50, freshDays = this.campaign.discovery.retention_days } = {}) {
    const clauses = [];
    const values = [];
    if (stage && stage !== 'all') { clauses.push('stage = ?'); values.push(stage); }
    if (market && market !== 'all') { clauses.push('market = ?'); values.push(market); }
    if (priority && priority !== 'all') { clauses.push('priority = ?'); values.push(priority); }
    if (fit && fit !== 'all') {
      if (fit === 'unreviewed') clauses.push('fit_verdict IS NULL');
      else { clauses.push('fit_verdict = ?'); values.push(fit); }
    }
    if (source) { clauses.push('source = ?'); values.push(source); }
    if (company) { clauses.push('company_key = ?'); values.push(keyText(company)); }
    if (!stage || stage === 'new') {
      clauses.push("julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', ?)");
      values.push(`-${Number(freshDays)} days`);
    }
    values.push(Number(limit));
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.prepare(`SELECT * FROM jobs ${where}
      ORDER BY CASE priority WHEN 'strong' THEN 0 WHEN 'possible' THEN 1 ELSE 2 END,
      COALESCE(reposted_at, posted_at, first_seen_at) DESC LIMIT ?`).all(...values);
  }

  fitBatch({ market, limit = 20 } = {}) {
    const clauses = [
      "stage='new'",
      "priority!='low'",
      "eligibility!='likely_incompatible'",
      `julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days')`,
      "(fit_verdict IS NULL OR COALESCE(fit_description_hash, '') != COALESCE(description_hash, ''))",
    ];
    const values = [];
    if (market && market !== 'all') { clauses.push('market=?'); values.push(market); }
    values.push(Math.max(1, Math.min(Number(limit), 20)));
    return this.db.prepare(`SELECT id AS job_id, company, company_key, title, location, market, seniority,
      source, posted_at, reposted_at, eligibility, eligibility_reason, description, description_hash,
      application_url, source_url FROM jobs WHERE ${clauses.join(' AND ')}
      ORDER BY company_key, CASE priority WHEN 'strong' THEN 0 ELSE 1 END,
      COALESCE(reposted_at, posted_at, first_seen_at) DESC, id LIMIT ?`).all(...values);
  }

  preReviewCandidates({ market = 'all' } = {}) {
    const clauses = [
      "stage='new'", "COALESCE(fit_verdict, '')!='skip'", "priority!='low'",
      "eligibility!='likely_incompatible'",
      `julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days')`,
    ];
    const values = [];
    if (market && market !== 'all') { clauses.push('market=?'); values.push(market); }
    return this.db.prepare(`SELECT * FROM jobs WHERE ${clauses.join(' AND ')}
      ORDER BY id`).all(...values);
  }

  fitRecords(jobIds) {
    const select = this.db.prepare(`SELECT id AS job_id, company, company_key, title, location, market, seniority,
      source, posted_at, reposted_at, eligibility, eligibility_reason, description, description_hash,
      application_url, source_url FROM jobs WHERE id=?`);
    return jobIds.map((id) => select.get(Number(id))).filter(Boolean);
  }

  recordFitReviews(reviews) {
    if (!Array.isArray(reviews) || reviews.length === 0) throw new Error('fit review must contain at least one result');
    const normalized = reviews.map((review) => {
      const jobId = Number(review.job_id);
      if (!Number.isInteger(jobId) || jobId < 1) throw new Error(`invalid job_id: ${review.job_id}`);
      if (!FIT_VERDICTS.has(review.verdict)) throw new Error(`invalid verdict for job ${jobId}: ${review.verdict}`);
      const job = this.get(jobId);
      if (!job) throw new Error(`job not found: ${jobId}`);
      const text = (value) => String(value || '').trim();
      return { job, jobId, verdict: review.verdict, reason: text(review.reason), gap: text(review.gap), eligibilityNote: text(review.eligibility_note) };
    });
    if (new Set(normalized.map((row) => row.jobId)).size !== normalized.length) throw new Error('fit review contains duplicate job IDs');

    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      const update = this.db.prepare(`UPDATE jobs SET fit_verdict=?, fit_reason=?, fit_gap=?,
        fit_eligibility_note=?, fit_reviewed_at=?, fit_description_hash=?, updated_at=? WHERE id=?`);
      for (const row of normalized) {
        update.run(row.verdict, row.reason, row.gap, row.eligibilityNote, now,
          row.job.description_hash || '', now, row.jobId);
        this.event('fit_reviewed', { jobId: row.jobId, details: {
          verdict: row.verdict, reason: row.reason, gap: row.gap,
          eligibility_note: row.eligibilityNote,
        } });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return normalized.length;
  }

  enrichJob(jobId, details = {}) {
    const job = this.get(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    const description = String(details.description || '').trim() || job.description;
    const location = String(details.location || '').trim() || job.location;
    const postedAt = normalizeDate(details.posted_at ?? details.postedAt ?? details.datePosted);
    const applicationUrl = canonicalUrl(details.application_url || details.applicationUrl || '');
    const descriptionHash = description
      ? createHash('sha256').update(description).digest('hex') : job.description_hash;
    const changed = Boolean(descriptionHash && descriptionHash !== job.description_hash);
    const classification = classify({ ...job, description, location }, this.campaign);
    this.db.prepare(`UPDATE jobs SET description=?, description_hash=?,
      posted_at=COALESCE(?, posted_at), location=COALESCE(NULLIF(?, ''), location),
      application_url=COALESCE(NULLIF(?, ''), application_url),
      market=?, eligibility=?, eligibility_reason=?, priority=?, seniority=?,
      fit_verdict=CASE WHEN ? THEN NULL ELSE fit_verdict END,
      fit_reason=CASE WHEN ? THEN NULL ELSE fit_reason END,
      fit_gap=CASE WHEN ? THEN NULL ELSE fit_gap END,
      fit_eligibility_note=CASE WHEN ? THEN NULL ELSE fit_eligibility_note END,
      fit_reviewed_at=CASE WHEN ? THEN NULL ELSE fit_reviewed_at END,
      fit_description_hash=CASE WHEN ? THEN NULL ELSE fit_description_hash END,
      updated_at=? WHERE id=?`).run(
      description, descriptionHash, postedAt, details.location || '',
      applicationUrl, classification.market, classification.eligibility,
      classification.eligibility_reason, classification.priority, classification.seniority,
      changed ? 1 : 0, changed ? 1 : 0,
      changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0,
      new Date().toISOString(), Number(jobId),
    );
    this.event('detail_enriched', { jobId: Number(jobId), details: {
      description: Boolean(details.description), date: Boolean(postedAt),
      location: Boolean(details.location), direct_application: Boolean(applicationUrl),
    } });
    return this.get(jobId);
  }

  refreshClassifications() {
    const rows = this.db.prepare(`SELECT id, title, location, market, remote_scope, description,
      eligibility, eligibility_reason, priority, seniority, raw_json FROM jobs`).all();
    const update = this.db.prepare(`UPDATE jobs SET market=?, eligibility=?, eligibility_reason=?,
      priority=?, seniority=?, updated_at=? WHERE id=?`);
    let changed = 0;
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        let original = {};
        try { original = JSON.parse(row.raw_json || '{}'); } catch {}
        const next = classify({
          ...row,
          market: row.market === 'unknown' ? (original.market || row.market) : row.market,
          remote_scope: original.remote_scope || original.remoteScope || row.remote_scope,
        }, this.campaign);
        if (next.market === row.market && next.eligibility === row.eligibility
          && next.eligibility_reason === row.eligibility_reason
          && next.priority === row.priority && next.seniority === row.seniority) continue;
        update.run(next.market, next.eligibility, next.eligibility_reason,
          next.priority, next.seniority, now, row.id);
        changed++;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { checked: rows.length, changed };
  }

  expireStaleNew(days = this.campaign.filters.max_posting_age_days) {
    if (days === null) return 0;
    const rows = this.db.prepare(`SELECT id FROM jobs WHERE stage='new'
      AND COALESCE(reposted_at, posted_at) IS NOT NULL
      AND julianday(COALESCE(reposted_at, posted_at)) < julianday('now', ?)`).all(`-${Number(days)} days`);
    if (!rows.length) return 0;
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      const update = this.db.prepare("UPDATE jobs SET stage='closed', updated_at=? WHERE id=?");
      for (const row of rows) {
        update.run(now, row.id);
        this.event('stale_expired', { jobId: row.id, details: { max_days: Number(days) } });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return rows.length;
  }

  canQueue(jobId) {
    const job = this.get(jobId);
    if (!job) return { ok: false, reason: 'job not found' };
    if (job.stage === 'closed') return { ok: false, reason: 'job is closed; confirm a genuine repost before reopening it' };
    const verifiedDate = job.reposted_at || job.posted_at;
    const maxAge = this.campaign.filters.max_posting_age_days;
    if (maxAge !== null) {
      if (!verifiedDate) return { ok: false, reason: 'posting date is unknown; verify it to satisfy the configured posting-age limit' };
      const exactAge = (Date.now() - new Date(verifiedDate).valueOf()) / 86_400_000;
      if (exactAge > maxAge) return { ok: false, reason: `job is ${Math.floor(exactAge)} days old; exceeds the configured ${maxAge}-day posting-age limit` };
    }
    if (['applied', 'replied', 'interview', 'final_round', 'offer'].includes(job.stage)) {
      return { ok: false, reason: `job is already ${job.stage}` };
    }
    const recent = this.db.prepare(`SELECT id, title, seniority FROM jobs
      WHERE company_key=? AND id<>? AND (
        julianday(applied_at) >= julianday('now', '-30 days') OR
        (stage='queued' AND EXISTS (
          SELECT 1 FROM events e WHERE e.job_id=jobs.id AND e.kind='stage:queued'
          AND julianday(e.created_at) >= julianday('now', '-30 days')
        ))
      )`).all(job.company_key, Number(jobId));
    if (this.campaign.applications.max_per_company_30_days !== null && recent.length >= this.campaign.applications.max_per_company_30_days) return { ok: false, reason: `already applied to ${this.campaign.applications.max_per_company_30_days} roles at this company in the last 30 days` };
    const priorSeniority = this.db.prepare(`SELECT seniority FROM jobs WHERE company_key=? AND id<>?
      AND (applied_at IS NOT NULL OR stage='queued')`).all(job.company_key, Number(jobId));
    if (!this.campaign.applications.allow_seniority_mix && priorSeniority.some((row) => row.seniority !== job.seniority && [row.seniority, job.seniority].includes('junior') && [row.seniority, job.seniority].includes('senior'))) {
      return { ok: false, reason: 'would mix junior and senior applications at the same company' };
    }
    return { ok: true, job };
  }

  canSubmit(jobId) {
    const allowed = this.canQueue(jobId);
    if (!allowed.ok) return allowed;
    if (allowed.job.stage !== 'queued') return { ok: false, reason: 'job must be prepared and queued before submission' };
    if (allowed.job.failure_reason) return { ok: false, reason: 'clear the recorded failure and run a new preflight before submission' };
    return allowed;
  }

  setPostedDate(jobId, value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new Error(`invalid verified date: ${value}`);
    if (date.valueOf() > Date.now() + 86_400_000) throw new Error('verified date cannot be in the future');
    const result = this.db.prepare('UPDATE jobs SET posted_at=?, updated_at=? WHERE id=?')
      .run(date.toISOString(), new Date().toISOString(), Number(jobId));
    if (!result.changes) throw new Error(`job not found: ${jobId}`);
    this.event('date_verified', { jobId: Number(jobId), details: { posted_at: date.toISOString() } });
  }

  setApplicationUrl(jobId, value) {
    const applicationUrl = canonicalUrl(value);
    if (!applicationUrl || !applicationUrl.startsWith('https://')) throw new Error('application URL must be a valid HTTPS URL');
    const result = this.db.prepare('UPDATE jobs SET application_url=?, updated_at=? WHERE id=?')
      .run(applicationUrl, new Date().toISOString(), Number(jobId));
    if (!result.changes) throw new Error(`job not found: ${jobId}`);
    this.event('application_url_resolved', { jobId: Number(jobId), details: { application_url: applicationUrl } });
    return this.get(jobId);
  }

  reopen(jobId, repostedAt) {
    const job = this.get(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    if (job.stage !== 'closed') throw new Error('only a closed job needs reopening');
    if (job.applied_at) throw new Error('an applied requisition cannot be reopened; use a new posting URL for a genuine new requisition');
    const date = new Date(repostedAt);
    if (Number.isNaN(date.valueOf())) throw new Error('a valid confirmed repost date is required');
    if (date.valueOf() > Date.now() + 86_400_000) throw new Error('repost date cannot be in the future');
    this.db.prepare("UPDATE jobs SET stage='new', reposted_at=?, failure_reason=NULL, updated_at=? WHERE id=?")
      .run(date.toISOString(), new Date().toISOString(), Number(jobId));
    this.event('reopened', { jobId: Number(jobId), details: { reposted_at: date.toISOString() } });
  }

  recordPreflight(jobId, details = {}) {
    this.event('preflight', { jobId: Number(jobId), details });
  }

  hasRecentPreflight(jobId, minutes = 15) {
    return Boolean(this.db.prepare(`SELECT 1 FROM events p WHERE p.job_id=? AND p.kind='preflight'
      AND julianday(p.created_at) >= julianday('now', ?)
      AND NOT EXISTS (SELECT 1 FROM events r WHERE r.job_id=p.job_id
        AND r.kind IN ('stage:queued','failed','retry_requested','reopened')
        AND r.id > p.id) LIMIT 1`)
      .get(Number(jobId), `-${Number(minutes)} minutes`));
  }

  queue(jobId, details = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const allowed = this.canQueue(jobId);
      if (!allowed.ok) throw new Error(allowed.reason);
      const now = new Date().toISOString();
      const result = this.db.prepare(`UPDATE jobs SET stage='queued', failure_reason=NULL,
        updated_at=? WHERE id=? AND stage='new'`).run(now, Number(jobId));
      if (result.changes !== 1) throw new Error('job is no longer new; refresh its pipeline state');
      this.event('stage:queued', { jobId: Number(jobId), details });
      this.db.exec('COMMIT');
      return this.get(jobId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordApplication(jobId, details = {}) {
    const confirmationId = String(details.confirmationId || '').trim();
    if (!confirmationId) throw new Error('visible submission confirmation is required');
    if (!details.cvPath || !details.answersPath) throw new Error('CV and answers paths are required');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const allowed = this.canSubmit(jobId);
      if (!allowed.ok) throw new Error(allowed.reason);
      if (!this.hasRecentPreflight(jobId)) throw new Error('run preflight immediately before submitting, then record success');
      const now = new Date().toISOString();
      const result = this.db.prepare(`UPDATE jobs SET stage='applied', failure_reason=NULL,
        applied_at=?, confirmation_id=?, cv_path=?, cv_version=COALESCE(?, cv_version),
        answers_path=?, application_channel=COALESCE(?, application_channel), updated_at=?
        WHERE id=? AND stage='queued'`).run(
        now, confirmationId, details.cvPath, details.cvVersion || null,
        details.answersPath, details.channel || null, now, Number(jobId),
      );
      if (result.changes !== 1) throw new Error('job is no longer queued; refresh its pipeline state');
      this.event('stage:applied', { jobId: Number(jobId), details: { ...details, confirmationId } });
      this.db.exec('COMMIT');
      return this.get(jobId);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordHistory(jobId, { appliedAt, stage = 'applied', evidence, channel } = {}) {
    const value = String(appliedAt || '');
    const date = new Date(value);
    const calendar = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
        || Number.isNaN(date.valueOf()) || new Date(calendar).toISOString().slice(0, 10) !== calendar
        || date.valueOf() > Date.now()) throw new Error('history requires a real, non-future applied-at date');
    if (!['applied', 'replied', 'interview', 'final_round', 'offer', 'closed'].includes(stage)) throw new Error('invalid historical application stage');
    if (!String(evidence || '').trim()) throw new Error('history requires evidence or the user report supporting the record');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const now = new Date().toISOString();
      const result = this.db.prepare(`UPDATE jobs SET stage=?, applied_at=?,
        application_channel=?, failure_reason=NULL, updated_at=?
        WHERE id=? AND stage='new' AND applied_at IS NULL`)
        .run(stage, date.toISOString(), channel || null, now, Number(jobId));
      if (result.changes !== 1) throw new Error('history import requires a new job without an existing application');
      const record = (kind, at, occurredAt) => this.db.prepare(`INSERT INTO events
        (job_id, kind, created_at, details_json) VALUES (?, ?, ?, ?)`)
        .run(Number(jobId), kind, at, JSON.stringify({ historical: true,
          occurred_at: occurredAt, evidence: String(evidence).trim(),
          text: `Historical record: ${String(evidence).trim()}` }));
      record('stage:applied', date.toISOString(), date.toISOString());
      // The current stage is known, but its transition date was not supplied.
      // Keep that distinction out of daily activity totals.
      if (stage !== 'applied') record(`stage:${stage}`, now, null);
      record('history_imported', now, null);
      this.db.exec('COMMIT');
      return this.get(jobId);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  restoreExpired(jobId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const job = this.get(jobId);
      if (!job || job.stage !== 'closed' || job.applied_at) throw new Error('restore requires an unsubmitted job closed by the age policy');
      const closure = this.db.prepare(`SELECT kind FROM events WHERE job_id=?
        AND kind IN ('stale_expired', 'stage:closed', 'restored', 'reopened')
        ORDER BY id DESC LIMIT 1`).get(Number(jobId));
      if (closure?.kind !== 'stale_expired') throw new Error('job was not closed by the age policy');
      const maxAge = this.campaign.filters.max_posting_age_days;
      const date = job.reposted_at || job.posted_at;
      if (maxAge !== null && (!date || (Date.now() - new Date(date).valueOf()) / 86400000 > maxAge)) {
        throw new Error('job still exceeds the configured posting-age limit; update the campaign first');
      }
      this.db.prepare(`UPDATE jobs SET stage='new', failure_reason=NULL,
        fit_verdict=NULL, fit_reason=NULL, fit_gap=NULL, fit_eligibility_note=NULL,
        fit_reviewed_at=NULL, fit_description_hash=NULL, updated_at=? WHERE id=?`)
        .run(new Date().toISOString(), Number(jobId));
      this.event('restored', { jobId: Number(jobId), details: { reason: 'age policy changed; original posting dates preserved' } });
      this.db.exec('COMMIT');
      return this.get(jobId);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  transition(jobId, stage, details = {}) {
    const order = ['new', 'queued', 'applied', 'replied', 'interview', 'final_round', 'offer'];
    if (![...order, 'closed'].includes(stage)) throw new Error(`invalid stage: ${stage}`);
    const current = this.get(jobId);
    if (!current) throw new Error(`job not found: ${jobId}`);
    if (current.stage === 'closed') throw new Error('closed jobs cannot change stage; use reopen for a confirmed repost');
    if (stage !== 'closed' && order.indexOf(stage) <= order.indexOf(current.stage)) {
      throw new Error(`cannot move pipeline backward from ${current.stage} to ${stage}`);
    }
    const now = new Date().toISOString();
    const appliedAt = stage === 'applied' ? now : null;
    const result = this.db.prepare(`UPDATE jobs SET stage=?, failure_reason=NULL,
      applied_at=COALESCE(?, applied_at), confirmation_id=COALESCE(?, confirmation_id),
      cv_path=COALESCE(?, cv_path), cv_version=COALESCE(?, cv_version),
      answers_path=COALESCE(?, answers_path), application_channel=COALESCE(?, application_channel),
      updated_at=? WHERE id=?`)
      .run(stage, appliedAt, details.confirmationId || null, details.cvPath || null,
        details.cvVersion || null, details.answersPath || null, details.channel || null,
        now, Number(jobId));
    this.event(`stage:${stage}`, { jobId: Number(jobId), details });
  }

  fail(jobId, reason) {
    const job = this.get(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    if (!['new', 'queued'].includes(job.stage)) {
      throw new Error(`cannot record an application failure after the job reached ${job.stage}`);
    }
    const result = this.db.prepare('UPDATE jobs SET failure_reason=?, updated_at=? WHERE id=?')
      .run(String(reason), new Date().toISOString(), Number(jobId));
    this.event('failed', { jobId: Number(jobId), details: { reason: String(reason) } });
  }

  retry(jobId) {
    const result = this.db.prepare('UPDATE jobs SET failure_reason=NULL, updated_at=? WHERE id=? AND failure_reason IS NOT NULL')
      .run(new Date().toISOString(), Number(jobId));
    if (!result.changes) throw new Error(`job ${jobId} has no retryable failure`);
    this.event('retry_requested', { jobId: Number(jobId) });
  }

  status() {
    const stages = this.db.prepare('SELECT stage, COUNT(*) count FROM jobs GROUP BY stage ORDER BY stage').all();
    const failures = this.db.prepare('SELECT COUNT(*) count FROM jobs WHERE failure_reason IS NOT NULL').get().count;
    const sources = this.db.prepare(`SELECT source, COUNT(*) total,
      SUM(CASE WHEN applied_at IS NOT NULL THEN 1 ELSE 0 END) applied,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM events e WHERE e.job_id=jobs.id AND e.kind IN ('stage:replied','stage:interview','stage:final_round','stage:offer')) THEN 1 ELSE 0 END) responses
      FROM jobs GROUP BY source ORDER BY total DESC`).all();
    const outreachFollowUpsDue = this.db.prepare(`SELECT COUNT(*) count FROM outreach
      WHERE status='sent' AND follow_up_at IS NOT NULL AND datetime(follow_up_at) <= datetime('now')`).get().count;
    const applicationFollowUpsDue = this.applicationFollowUps().length;
    const outreachPending = this.db.prepare(`SELECT COUNT(*) count FROM jobs j
      WHERE j.applied_at IS NOT NULL AND j.stage='applied'
      AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.job_id=j.id)`).get().count;
    return {
      stages, failures, sources, outreach_pending: outreachPending,
      outreach_follow_ups_due: outreachFollowUpsDue,
      application_follow_ups_due: applicationFollowUpsDue,
      follow_ups_due: outreachFollowUpsDue + applicationFollowUpsDue,
    };
  }

  addOutreach(jobId, details = {}) {
    if (!this.get(jobId)) throw new Error(`job not found: ${jobId}`);
    const name = String(details.contactName || '').trim();
    const channel = String(details.channel || '').trim().toLowerCase();
    if (!name) throw new Error('contact name is required');
    if (!['email', 'linkedin'].includes(channel)) throw new Error('channel must be email or linkedin');
    const duplicate = this.db.prepare(`SELECT id FROM outreach WHERE job_id=? AND channel=?
      AND (lower(contact_name)=lower(?) OR (? IS NOT NULL AND lower(COALESCE(address, ''))=lower(?))
        OR (? IS NOT NULL AND contact_url=?)) LIMIT 1`).get(
      Number(jobId), channel, name, details.address || null, details.address || null,
      details.contactUrl || null, details.contactUrl || null,
    );
    if (duplicate) throw new Error(`outreach already exists for this contact and role: ${duplicate.id}`);
    const followUpAt = details.followUpAt ? new Date(details.followUpAt) : null;
    if (followUpAt && Number.isNaN(followUpAt.valueOf())) throw new Error(`invalid follow-up date: ${details.followUpAt}`);
    const now = new Date().toISOString();
    const result = this.db.prepare(`INSERT INTO outreach(
      job_id, contact_name, contact_role, contact_url, address, channel, status,
      message_path, drafted_at, follow_up_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`).run(
      Number(jobId), name, details.contactRole || null, details.contactUrl || null,
      details.address || null, channel, details.messagePath || null, now,
      followUpAt?.toISOString() || null, now,
    );
    const id = Number(result.lastInsertRowid);
    this.event('outreach:draft', { jobId: Number(jobId), details: { outreach_id: id, channel, contact_name: name } });
    return this.db.prepare('SELECT * FROM outreach WHERE id=?').get(id);
  }

  markOutreach(id, status, details = {}) {
    const next = String(status || '').toLowerCase();
    const order = ['draft', 'sent', 'replied', 'closed'];
    if (!order.includes(next)) throw new Error(`invalid outreach status: ${status}`);
    const current = this.db.prepare('SELECT * FROM outreach WHERE id=?').get(Number(id));
    if (!current) throw new Error(`outreach not found: ${id}`);
    if (order.indexOf(next) <= order.indexOf(current.status)) throw new Error(`cannot move outreach backward from ${current.status} to ${next}`);
    const followUpAt = details.followUpAt ? new Date(details.followUpAt) : null;
    if (followUpAt && Number.isNaN(followUpAt.valueOf())) throw new Error(`invalid follow-up date: ${details.followUpAt}`);
    const now = new Date().toISOString();
    const sentAt = next === 'sent' ? now : null;
    const repliedAt = next === 'replied' ? now : null;
    this.db.prepare(`UPDATE outreach SET status=?, sent_at=COALESCE(?, sent_at),
      replied_at=COALESCE(?, replied_at), follow_up_at=COALESCE(?, follow_up_at),
      updated_at=? WHERE id=?`).run(next, sentAt, repliedAt, followUpAt?.toISOString() || null, now, Number(id));
    this.event(`outreach:${next}`, { jobId: current.job_id, details: { outreach_id: Number(id), channel: current.channel, contact_name: current.contact_name } });
    return this.db.prepare('SELECT * FROM outreach WHERE id=?').get(Number(id));
  }

  recordOutreachFollowUp(id, details = {}) {
    const current = this.db.prepare('SELECT * FROM outreach WHERE id=?').get(Number(id));
    if (!current) throw new Error(`outreach not found: ${id}`);
    if (current.status !== 'sent') throw new Error('only sent outreach can receive a follow-up');
    const messagePath = String(details.messagePath || '').trim();
    if (!messagePath) throw new Error('follow-up message path is required');
    const followUpAt = details.followUpAt ? new Date(details.followUpAt) : null;
    if (followUpAt && Number.isNaN(followUpAt.valueOf())) throw new Error(`invalid follow-up date: ${details.followUpAt}`);
    const now = new Date().toISOString();
    this.db.prepare('UPDATE outreach SET follow_up_at=?, updated_at=? WHERE id=?')
      .run(followUpAt?.toISOString() || null, now, Number(id));
    this.event('outreach:follow_up_sent', { jobId: current.job_id, details: {
      outreach_id: Number(id), channel: current.channel, contact_name: current.contact_name,
      message_path: messagePath,
    } });
    return this.db.prepare('SELECT * FROM outreach WHERE id=?').get(Number(id));
  }

  followUps(asOf = new Date().toISOString()) {
    const date = new Date(asOf);
    if (Number.isNaN(date.valueOf())) throw new Error(`invalid follow-up date: ${asOf}`);
    return this.db.prepare(`SELECT 'outreach' kind, o.*, j.company, j.title,
      o.follow_up_at AS next_action_at FROM outreach o
      JOIN jobs j ON j.id=o.job_id
      WHERE o.status='sent' AND o.follow_up_at IS NOT NULL
      AND datetime(o.follow_up_at) <= datetime(?) ORDER BY o.follow_up_at, o.id`).all(date.toISOString());
  }

  applicationFollowUps(asOf = new Date().toISOString(), days = this.campaign.applications.follow_up_days ?? null) {
    const date = new Date(asOf);
    if (Number.isNaN(date.valueOf())) throw new Error(`invalid follow-up date: ${asOf}`);
    if (days === null) return [];
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('follow-up days must be an integer from 1 to 3650 or null');
    return this.db.prepare(`SELECT 'application' kind, j.*,
      datetime(j.applied_at, ?) AS next_action_at FROM jobs j
      WHERE j.stage='applied' AND j.applied_at IS NOT NULL
      AND datetime(j.applied_at, ?) <= datetime(?)
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.job_id=j.id
        AND e.kind='application_follow_up_sent' AND datetime(e.created_at) >= datetime(j.applied_at))
      ORDER BY j.applied_at, j.id`).all(`+${Number(days)} days`, `+${Number(days)} days`, date.toISOString());
  }

  recordApplicationFollowUp(jobId, details = {}) {
    const job = this.get(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    if (job.stage !== 'applied' || !job.applied_at) throw new Error('application follow-up requires an applied job without a reply');
    this.event('application_follow_up_sent', { jobId: Number(jobId), details: {
      note: String(details.note || '').trim(),
    } });
  }

  addExperiment(details = {}) {
    const text = (value, label) => {
      const result = String(value || '').trim();
      if (!result) throw new Error(`${label} is required`);
      return result;
    };
    const now = new Date().toISOString();
    const result = this.db.prepare(`INSERT INTO experiments(
      hypothesis, change_text, cohort, metric, status, started_at
    ) VALUES (?, ?, ?, ?, 'active', ?)`).run(
      text(details.hypothesis, 'hypothesis'), text(details.change, 'change'),
      text(details.cohort, 'cohort'), text(details.metric, 'metric'), now,
    );
    return this.db.prepare('SELECT * FROM experiments WHERE id=?').get(Number(result.lastInsertRowid));
  }

  closeExperiment(id, details = {}) {
    const experiment = this.db.prepare('SELECT * FROM experiments WHERE id=?').get(Number(id));
    if (!experiment) throw new Error(`experiment not found: ${id}`);
    if (experiment.status === 'closed') throw new Error(`experiment ${id} is already closed`);
    const result = String(details.result || '').trim();
    const decision = String(details.decision || '').trim();
    if (!result || !decision) throw new Error('result and decision are required');
    this.db.prepare(`UPDATE experiments SET status='closed', ended_at=?, result=?, decision=? WHERE id=?`)
      .run(new Date().toISOString(), result, decision, Number(id));
    return this.db.prepare('SELECT * FROM experiments WHERE id=?').get(Number(id));
  }

  listExperiments(status) {
    if (status && !['active', 'closed'].includes(status)) throw new Error(`invalid experiment status: ${status}`);
    return status
      ? this.db.prepare('SELECT * FROM experiments WHERE status=? ORDER BY id DESC').all(status)
      : this.db.prepare('SELECT * FROM experiments ORDER BY id DESC').all();
  }

  dashboard({ market, stage = 'new', priority, fit, view = 'explore', query, company, sort = 'fit', limit = 100, offset = 0 } = {}) {
    const clauses = [];
    const values = [];
    if (market && market !== 'all') { clauses.push('market=?'); values.push(market); }
    if (priority && priority !== 'all') { clauses.push('priority=?'); values.push(priority); }
    if (fit && fit !== 'all') {
      const allowed = new Set(['recommended', 'maybe', 'needs_answer', 'unreviewed', 'skip']);
      const requested = [...new Set(String(fit).split(',').map((item) => item.trim()).filter((item) => allowed.has(item)))];
      if (requested.length) {
        const filters = requested.map((item) => {
          if (item === 'unreviewed') return 'fit_verdict IS NULL';
          values.push(item);
          return 'fit_verdict=?';
        });
        clauses.push(`(${filters.join(' OR ')})`);
      }
    }
    if (query) {
      clauses.push('(company LIKE ? OR title LIKE ? OR location LIKE ? OR description LIKE ?)');
      const needle = `%${String(query).trim()}%`;
      values.push(needle, needle, needle, needle);
    }
    if (company) { clauses.push('company=?'); values.push(String(company)); }
    if (view === 'applications') clauses.push("(stage='queued' OR applied_at IS NOT NULL)");
    if (stage === 'failed') clauses.push('failure_reason IS NOT NULL');
    else if (stage && stage !== 'all') { clauses.push('stage=?'); values.push(stage); }
    if (view !== 'applications') {
      clauses.push("eligibility!='likely_incompatible'");
      if (!stage || stage === 'new') clauses.push(`julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days')`);
      else if (stage === 'all') clauses.push(`(stage!='new' OR julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days'))`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) count FROM jobs ${where}`).get(...values).count;
    const fitOrder = `CASE WHEN fit_verdict='recommended' THEN 0 WHEN fit_verdict='maybe' THEN 1
        WHEN fit_verdict='needs_answer' THEN 2 WHEN fit_verdict IS NULL THEN 3 ELSE 4 END,
      CASE priority WHEN 'strong' THEN 0 WHEN 'possible' THEN 1 ELSE 2 END,
      COALESCE(reposted_at, posted_at, first_seen_at) DESC`;
    const order = ({
      age: 'COALESCE(reposted_at, posted_at, first_seen_at) DESC, id DESC',
      company: 'company COLLATE NOCASE ASC, id DESC',
      updated: 'updated_at DESC, id DESC',
    })[sort] || fitOrder;
    values.push(Number(limit), Math.max(0, Number(offset) || 0));
    const jobs = this.db.prepare(`SELECT id, company, title, location, market, source, priority,
      fit_verdict, fit_reason, fit_gap, fit_eligibility_note, fit_reviewed_at,
      eligibility, eligibility_reason, stage, failure_reason, salary_text, posted_at,
      reposted_at, first_seen_at, applied_at, application_channel, updated_at, application_url, source_url,
      (SELECT COUNT(*) FROM jobs j2 WHERE j2.company_key=jobs.company_key AND j2.applied_at IS NOT NULL
        AND julianday(j2.applied_at) >= julianday('now', '-30 days')) company_recent_applications
      FROM jobs ${where}
      ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values);
    const metricClauses = [];
    const metricValues = [];
    if (market && market !== 'all') { metricClauses.push('market=?'); metricValues.push(market); }
    if (view !== 'applications') metricClauses.push("eligibility!='likely_incompatible'");
    const metricWhere = metricClauses.length ? `WHERE ${metricClauses.join(' AND ')}` : '';
    const metrics = this.db.prepare(`SELECT
      SUM(CASE WHEN stage='new' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) new_roles,
      SUM(CASE WHEN stage='new' AND priority='strong' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) strong_new,
      SUM(CASE WHEN stage='new' AND priority='possible' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) possible_new,
      SUM(CASE WHEN stage='new' AND fit_verdict='recommended' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) recommended_new,
      SUM(CASE WHEN stage='new' AND fit_verdict='maybe' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) maybe_new,
      SUM(CASE WHEN stage='new' AND fit_verdict='needs_answer' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) needs_answer_new,
      SUM(CASE WHEN stage='new' AND fit_verdict IS NULL AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) unreviewed_new,
      SUM(CASE WHEN stage='queued' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN stage='applied' THEN 1 ELSE 0 END) applied,
      SUM(CASE WHEN stage='replied' THEN 1 ELSE 0 END) responses,
      SUM(CASE WHEN stage='interview' THEN 1 ELSE 0 END) interviews,
      SUM(CASE WHEN stage='offer' THEN 1 ELSE 0 END) offers,
      SUM(CASE WHEN failure_reason IS NOT NULL AND (stage='queued' OR applied_at IS NOT NULL) THEN 1 ELSE 0 END) failures,
      SUM(CASE WHEN market='unknown' AND stage='new' AND julianday(COALESCE(reposted_at, posted_at, first_seen_at)) >= julianday('now', '-${this.campaign.discovery.retention_days} days') THEN 1 ELSE 0 END) unresolved
      FROM jobs ${metricWhere}`).get(...metricValues);
    for (const key of Object.keys(metrics)) metrics[key] ??= 0;
    const shown = Number(offset) + jobs.length;
    return { jobs, total, offset: Number(offset) || 0, limit: Number(limit), truncated: total > shown, metrics, status: this.status(), sourceHealth: this.sourceHealth() };
  }

  stats({ days = 30 } = {}) {
    const window = Number(days) || 30;
    const perDay = this.db.prepare(`SELECT date(created_at) day,
      SUM(CASE WHEN kind='stage:applied' THEN 1 ELSE 0 END) applied,
      SUM(CASE WHEN kind='stage:queued' THEN 1 ELSE 0 END) selected,
      SUM(CASE WHEN kind='discovered' THEN 1 ELSE 0 END) discovered,
      SUM(CASE WHEN kind='fit_reviewed' THEN 1 ELSE 0 END) reviewed,
      SUM(CASE WHEN kind IN ('stage:replied','stage:interview','stage:final_round','stage:offer') THEN 1 ELSE 0 END) responses,
      SUM(CASE WHEN kind='outreach:sent' THEN 1 ELSE 0 END) outreach_sent
      FROM events WHERE julianday(created_at) >= julianday('now', ?)
      AND (json_extract(details_json, '$.historical') IS NOT 1
        OR json_extract(details_json, '$.occurred_at') IS NOT NULL) GROUP BY day ORDER BY day`).all(`-${window} days`);
    const reached = (kinds) => this.db.prepare(`SELECT COUNT(DISTINCT job_id) count FROM events
      WHERE kind IN (${kinds.map(() => '?').join(',')})`).get(...kinds).count;
    const funnel = {
      selected: reached(['stage:queued', 'stage:applied', 'stage:replied', 'stage:interview', 'stage:final_round', 'stage:offer']),
      applied: reached(['stage:applied', 'stage:replied', 'stage:interview', 'stage:final_round', 'stage:offer']),
      replied: reached(['stage:replied', 'stage:interview', 'stage:final_round', 'stage:offer']),
      interview: reached(['stage:interview', 'stage:final_round', 'stage:offer']),
      final_round: reached(['stage:final_round', 'stage:offer']),
      offer: reached(['stage:offer']),
      closed: this.db.prepare("SELECT COUNT(*) count FROM jobs WHERE stage='closed'").get().count,
    };
    const bySource = this.db.prepare(`SELECT source, COUNT(*) total,
      SUM(CASE WHEN fit_verdict='recommended' THEN 1 ELSE 0 END) recommended,
      SUM(CASE WHEN applied_at IS NOT NULL THEN 1 ELSE 0 END) applied,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM events e WHERE e.job_id=jobs.id AND e.kind IN ('stage:replied','stage:interview','stage:final_round','stage:offer')) THEN 1 ELSE 0 END) responses
      FROM jobs GROUP BY source HAVING applied > 0 OR recommended > 0 ORDER BY applied DESC, recommended DESC, total DESC LIMIT 25`).all();
    const byChannel = this.db.prepare(`SELECT COALESCE(application_channel, 'unknown') channel, COUNT(*) applied,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM events e WHERE e.job_id=jobs.id AND e.kind IN ('stage:replied','stage:interview','stage:final_round','stage:offer')) THEN 1 ELSE 0 END) responses
      FROM jobs WHERE applied_at IS NOT NULL GROUP BY channel ORDER BY applied DESC`).all();
    const last24h = this.db.prepare(`SELECT kind, COUNT(*) count FROM events
      WHERE julianday(created_at) >= julianday('now', '-1 day')
      AND (json_extract(details_json, '$.historical') IS NOT 1
        OR json_extract(details_json, '$.occurred_at') IS NOT NULL) GROUP BY kind ORDER BY count DESC`).all();
    const noise = ['discovered', 'seen_again', 'detail_enriched', 'detail_enrichment_failed', 'fit_reviewed', 'source_scan', 'scan_run', 'stale_expired', 'date_verified', 'application_url_resolved', 'preflight'];
    const recent = this.db.prepare(`SELECT e.kind, e.created_at, e.details_json, e.job_id, j.company, j.title
      FROM events e LEFT JOIN jobs j ON j.id=e.job_id
      WHERE e.kind NOT IN (${noise.map(() => '?').join(',')}) ORDER BY e.created_at DESC, e.id DESC LIMIT 60`).all(...noise)
      .map((row) => ({ kind: row.kind, created_at: row.created_at, job_id: row.job_id, company: row.company, title: row.title, details: JSON.parse(row.details_json || '{}') }));
    return { days: window, per_day: perDay, funnel, by_source: bySource, by_channel: byChannel, last_24h: last24h, recent };
  }

  detail(jobId) {
    const job = this.get(jobId);
    if (!job) return null;
    const events = this.db.prepare(`SELECT kind, created_at, details_json FROM events
      WHERE job_id=? ORDER BY created_at DESC LIMIT 30`).all(Number(jobId))
      .map((row) => ({ kind: row.kind, created_at: row.created_at, details: JSON.parse(row.details_json || '{}') }));
    const outreach = this.db.prepare(`SELECT * FROM outreach WHERE job_id=?
      ORDER BY updated_at DESC, id DESC`).all(Number(jobId));
    return { job, events, outreach };
  }

  note(jobId, text) {
    if (!this.get(jobId)) throw new Error(`job not found: ${jobId}`);
    const value = String(text || '').trim();
    if (!value) throw new Error('note text is required');
    this.event('note', { jobId: Number(jobId), details: { text: value } });
  }

  recentSourceRuns(limit = 30) {
    return this.db.prepare(`SELECT created_at, run_id, details_json FROM events
      WHERE kind='source_scan' ORDER BY created_at DESC LIMIT ?`).all(Number(limit))
      .map((row) => ({ ...row, details: JSON.parse(row.details_json || '{}') }));
  }

  sourceHealth(limit = 5000) {
    const latest = new Map();
    for (const row of this.recentSourceRuns(limit)) {
      const name = row.details.name;
      if (name && !latest.has(name)) latest.set(name, row);
    }
    return [...latest.values()].map((row) => {
      const cadence = Number(row.details.cadence_days || 1);
      const elapsed = Date.now() - new Date(row.created_at).valueOf() > cadence * 86_400_000;
      const due = ['partial', 'failed'].includes(row.details.status) || elapsed;
      return {
        name: row.details.name, provider: row.details.provider,
        status: due && row.details.status === 'ok' ? 'due' : row.details.status,
        count: row.details.count, error: row.details.error || null,
        reason: row.details.reason || null, cadence_days: cadence,
        checked_at: row.created_at, due,
      };
    });
  }

  hasSuccessfulScan(name) {
    return Boolean(this.lastSuccessfulScan(name));
  }

  lastSuccessfulScan(name) {
    return this.db.prepare(`SELECT created_at, details_json FROM events WHERE kind='scan_run'
      AND json_extract(details_json, '$.name')=?
      AND json_extract(details_json, '$.status') IN ('ok','partial')
      ORDER BY created_at DESC LIMIT 1`).get(name) || null;
  }

  lastSuccessfulSourceScan(name) {
    return this.db.prepare(`SELECT created_at, details_json FROM events WHERE kind='source_scan'
      AND json_extract(details_json, '$.name')=?
      AND json_extract(details_json, '$.status') IN ('ok','partial')
      ORDER BY created_at DESC LIMIT 1`).get(name) || null;
  }

  sourceScanWindowDays(name, options = {}) {
    return this.windowDaysSince(this.lastSuccessfulSourceScan(name), options);
  }

  windowDaysSince(last, { now = new Date(), launchDays = this.campaign.discovery.query_days, overlapDays = this.campaign.discovery.overlap_days, maxDays = this.campaign.discovery.query_days } = {}) {
    if (!last) return launchDays;
    const elapsed = Math.ceil((new Date(now).valueOf() - new Date(last.created_at).valueOf()) / 86_400_000);
    if (!Number.isFinite(elapsed) || elapsed < 0) return overlapDays;
    return Math.max(overlapDays, Math.min(maxDays, elapsed));
  }

  scanWindowDays(name, options = {}) {
    return this.windowDaysSince(this.lastSuccessfulScan(name), options);
  }
}
