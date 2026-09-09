import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeJob as normalizeInput, classify, canonicalUrl, normalizeDate, isFresh } from '../src/lib/jobs.mjs';
import { Store as BaseStore } from '../src/db/store.mjs';

// Explicit campaign fixture: the engine itself has no personal defaults.
const campaign = {
  version: 1, name: 'AI in Hong Kong',
  markets: [{ id: 'hk', label: 'Hong Kong', location_terms: ['Hong Kong', 'HK'], remote: false },
    { id: 'remote', label: 'Remote', location_terms: ['Remote', 'APAC', 'CET'], remote: true }],
  roles: { primary: ['AI Engineer', 'Machine Learning Engineer', 'LLM', 'Data Engineer'], adjacent: ['Backend Engineer'] },
  filters: { exclude_titles: [], exclude_companies: [], exclude_locations: [], max_posting_age_days: 30 },
  applications: { max_per_company_30_days: 2, allow_seniority_mix: false, follow_up_days: 7 },
  discovery: { retention_days: 30, query_days: 21, overlap_days: 3 },
};
const normalizeJob = (input, defaults = {}) => normalizeInput(input, defaults, campaign);
class Store extends BaseStore { constructor(file) { super(file, campaign); } }

test('normalization removes tracking and deduplicates the same role across sources', () => {
  const first = normalizeJob({
    company: 'Example AI', title: 'Senior AI Engineer', location: 'Hong Kong',
    url: 'https://example.com/jobs/1?utm_source=linkedin', source: 'linkedin_guest',
  });
  const second = normalizeJob({
    company: 'Example AI', title: 'Senior AI Engineer', location: 'Hong Kong',
    url: 'https://example.com/jobs/1?ref=board', source: 'greenhouse',
  });
  assert.equal(first.canonical_key, second.canonical_key);
  assert.equal(canonicalUrl('https://example.com/a?utm_source=x&ok=1'), 'https://example.com/a?ok=1');
  assert.equal(canonicalUrl('http://example.com/a'), 'https://example.com/a');
  assert.equal(canonicalUrl('https://linkedin.com/jobs/view/123?position=2&pageNum=1&refId=x'), 'https://www.linkedin.com/jobs/view/123');
});

test('distinct employer requisitions with the same title remain distinct', () => {
  const a = normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong', url: 'https://example.com/a' });
  const b = normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong SAR', url: 'https://example.com/b' });
  assert.notEqual(a.canonical_key, b.canonical_key);
});

test('an aggregator cannot replace an employer application route', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  const direct = normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong', source: 'greenhouse', url: 'https://boards.greenhouse.io/example/1' });
  const board = normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong SAR', source: 'linkedin_guest', url: 'https://linkedin.com/jobs/view/1' });
  const { id } = store.upsert(direct); store.upsert(board);
  assert.equal(store.get(id).source, 'greenhouse');
  assert.equal(store.get(id).application_url, direct.application_url);
  store.close(); rmSync(dir, { recursive: true });
});

test('two direct requisitions with the same title are both retained', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  store.upsert(normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong', source: 'greenhouse', url: 'https://boards.greenhouse.io/example/1' }));
  store.upsert(normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong', source: 'greenhouse', url: 'https://boards.greenhouse.io/example/2' }));
  assert.equal(store.countJobs(), 2);
  store.close(); rmSync(dir, { recursive: true });
});

test('same aggregator duplicate slugs merge conservatively', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  store.upsert(normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Anywhere in the World', source: 'weworkremotely', url: 'https://example.com/ai-engineer' }));
  store.upsert(normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Anywhere in the World', source: 'weworkremotely', url: 'https://example.com/ai-engineer-1' }));
  assert.equal(store.countJobs(), 1);
  store.close(); rmSync(dir, { recursive: true });
});

test('a new LinkedIn job ID remains visible as a fresh unreviewed posting', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-linkedin-repost-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const first = store.upsert(normalizeJob({
      company: 'Example AI', title: 'AI Engineer', location: 'Hong Kong', source: 'linkedin_guest',
      posted_at: '2026-08-01', url: 'https://www.linkedin.com/jobs/view/111',
    })).id;
    store.recordFitReviews([{ job_id: first, verdict: 'skip', reason: 'Previously skipped.' }]);
    const repost = store.upsert(normalizeJob({
      company: 'Example AI', title: 'AI Engineer', location: 'Hong Kong', source: 'linkedin_guest',
      posted_at: '2026-09-01', url: 'https://www.linkedin.com/jobs/view/222',
    }));
    assert.equal(repost.inserted, true);
    assert.notEqual(repost.id, first);
    assert.equal(store.get(first).fit_verdict, 'skip');
    assert.equal(store.get(repost.id).fit_verdict, null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the same LinkedIn job ID does not become a repost when its title slug changes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-linkedin-id-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const first = store.upsert(normalizeJob({
      company: 'Example AI', title: 'AI Engineer', location: 'Hong Kong', source: 'linkedin_guest',
      posted_at: '2026-09-01', url: 'https://www.linkedin.com/jobs/view/ai-engineer-at-example-4455875126',
    })).id;
    store.recordFitReviews([{ job_id: first, verdict: 'skip', reason: 'Previously skipped.' }]);
    const repeat = store.upsert(normalizeJob({
      company: 'Example AI', title: 'Senior AI Engineer', location: 'Hong Kong', source: 'linkedin_guest',
      posted_at: '2026-09-02', url: 'https://www.linkedin.com/jobs/view/senior-ai-engineer-at-example-4455875126',
    }));
    assert.equal(repeat.inserted, false);
    assert.equal(repeat.id, first);
    assert.equal(store.countJobs(), 1);
    assert.equal(store.get(first).fit_verdict, 'skip');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a newer trusted ATS publication date resurfaces the same requisition once', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-ats-repost-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const input = {
      company: 'Example AI', title: 'AI Engineer', location: 'Hong Kong', source: 'greenhouse',
      description: 'Build production AI systems.', url: 'https://job-boards.greenhouse.io/example/jobs/123',
    };
    const id = store.upsert(normalizeJob({ ...input, posted_at: '2026-08-01' })).id;
    store.recordFitReviews([{ job_id: id, verdict: 'skip', reason: 'Previously skipped.' }]);
    const repost = store.upsert(normalizeJob({ ...input, posted_at: '2026-09-01' }));
    assert.equal(repost.inserted, false);
    assert.equal(store.get(id).fit_verdict, null);
    assert.equal(store.get(id).reposted_at, '2026-09-01T00:00:00.000Z');

    store.recordFitReviews([{ job_id: id, verdict: 'skip', reason: 'Skipped again.' }]);
    store.upsert(normalizeJob({ ...input, posted_at: '2026-09-01' }));
    assert.equal(store.get(id).fit_verdict, 'skip');
    assert.equal(store.db.prepare("SELECT COUNT(*) count FROM events WHERE job_id=? AND kind='reposted'").get(id).count, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a changed relative ATS date does not masquerade as a repost', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-relative-date-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const input = {
      company: 'Example AI', title: 'AI Engineer', location: 'Hong Kong', source: 'workday',
      url: 'https://example.wd5.myworkdayjobs.com/jobs/job/AI-Engineer/R123',
    };
    const id = store.upsert(normalizeJob({ ...input, posted_at: '2026-08-01' })).id;
    store.recordFitReviews([{ job_id: id, verdict: 'skip', reason: 'Previously skipped.' }]);
    store.upsert(normalizeJob({ ...input, posted_at: '2026-08-02' }));
    assert.equal(store.get(id).fit_verdict, 'skip');
    assert.equal(store.get(id).reposted_at, null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('provider millisecond timestamps become ISO dates', () => {
  assert.equal(normalizeDate(1788321450000), '2026-09-02T03:57:30.000Z');
});

test('normalization rejects records without a company', () => {
  assert.throws(() => normalizeJob({ title: 'AI Engineer', url: 'https://example.com/job' }), /company/);
});

test('jobs older than 30 days cannot be queued', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  const job = normalizeJob({ company: 'Old Co', title: 'AI Engineer', url: 'https://example.com/old', location: 'Hong Kong', posted_at: '2026-01-01' });
  const { id } = store.upsert(job);
  assert.match(store.canQueue(id).reason, /days old/);
  store.close();
  rmSync(dir, { recursive: true });
});

test('freshness uses the exact cutoff rather than a rounded day count', () => {
  const now = new Date('2026-09-03T12:00:00Z');
  assert.equal(isFresh({ posted_at: '2026-08-04T12:00:00Z' }, 30, now), true);
  assert.equal(isFresh({ posted_at: '2026-08-04T11:59:59Z' }, 30, now), false);
});

test('stale new jobs leave the active queue but pipeline history remains', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-expiry-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const old = store.upsert(normalizeJob({ company: 'Old', title: 'AI Engineer', location: 'Hong Kong', posted_at: '2026-01-01', url: 'https://old.example/job' })).id;
    const applied = store.upsert(normalizeJob({ company: 'Applied', title: 'AI Engineer', location: 'Hong Kong', posted_at: '2026-01-01', url: 'https://applied.example/job' })).id;
    store.transition(applied, 'queued');
    store.transition(applied, 'applied');
    assert.equal(store.expireStaleNew(30), 1);
    assert.equal(store.get(old).stage, 'closed');
    assert.equal(store.get(applied).stage, 'applied');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a stale date discovered during enrichment removes the job from the active queue', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-enriched-stale-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const id = store.upsert(normalizeJob({
      company: 'Late Date Co', title: 'AI Engineer', location: 'Hong Kong',
      url: 'https://late-date.example/job', posted_at: null,
    })).id;
    store.enrichJob(id, { posted_at: '2025-01-01' });
    assert.equal(store.expireStaleNew(30), 1);
    assert.equal(store.get(id).stage, 'closed');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an authoritative hydrated date replaces a newer source-card estimate', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-corrected-date-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const id = store.upsert(normalizeJob({
      company: 'Corrected Date Co', title: 'AI Engineer', location: 'Hong Kong',
      url: 'https://corrected-date.example/job', posted_at: new Date().toISOString(),
    })).id;
    store.enrichJob(id, { posted_at: '2025-01-01' });
    assert.match(store.get(id).posted_at, /^2025-01-01/);
    assert.equal(store.expireStaleNew(30), 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('enrichment updates location without silently excluding unmatched geography', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-enriched-location-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'Remote Co', title: 'AI Engineer', location: '',
      url: 'https://remote.example/job' })).id;
    assert.equal(store.get(id).market, 'unknown');
    store.enrichJob(id, { location: 'Remote - India' });
    assert.equal(store.get(id).market, 'remote');
    assert.equal(store.fitBatch().some((row) => row.job_id === id), true);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('list understands all and unreviewed filters', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  store.upsert(normalizeJob({ company: 'Example', title: 'AI Engineer', location: 'Hong Kong', url: 'https://example.com/1' }));
  assert.equal(store.list({ stage: 'all', market: 'all', fit: 'all' }).length, 1);
  assert.equal(store.list({ fit: 'unreviewed' }).length, 1);
  store.close(); rmSync(dir, { recursive: true });
});

test('configured role terms rank matches without excluding other professions', () => {
  assert.equal(classify({ title: 'Senior AI Engineer', location: 'Hong Kong' }, campaign).priority, 'strong');
  assert.equal(classify({ title: 'Backend Engineer' }, campaign).priority, 'possible');
  assert.equal(classify({ title: 'Retail Manager' }, campaign).priority, 'possible');
  assert.equal(classify({ title: 'Chief Financial Officer' }, campaign).priority, 'possible');
});

test('an unknown location remains unknown rather than defaulting to Hong Kong', () => {
  const job = normalizeJob({ company: 'GlobalCo', title: 'AI Engineer', location: '', url: 'https://example.com/job' });
  assert.equal(job.market, 'unknown');
  assert.equal(job.eligibility, 'uncertain');
});

test('fit review is persisted and invalidated only when the description changes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-fit-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const input = { company: 'FitCo', title: 'AI Engineer', location: 'Hong Kong',
      posted_at: new Date().toISOString(), url: 'https://fit.example/job', description: 'Build production RAG systems.' };
    const id = store.upsert(normalizeJob(input)).id;
    assert.deepEqual(store.fitBatch().map((row) => row.job_id), [id]);
    assert.deepEqual(store.fitRecords([id]).map((row) => row.job_id), [id]);
    assert.deepEqual(store.fitRecords([999_999]), []);
    assert.equal(store.recordFitReviews([{ job_id: id, verdict: 'recommended', reason: 'Direct production RAG match.', gap: '', eligibility_note: '' }]), 1);
    assert.equal(store.get(id).fit_verdict, 'recommended');
    assert.equal(store.dashboard({ fit: 'recommended' }).total, 1);
    assert.equal(store.dashboard({ fit: 'recommended,maybe' }).total, 1);
    assert.equal(store.dashboard({ fit: 'maybe,unreviewed' }).total, 0);
    assert.equal(store.dashboard().metrics.recommended_new, 1);
    store.enrichJob(id, { description: input.description, posted_at: input.posted_at, application_url: 'https://fit.example/direct' });
    assert.equal(store.get(id).posted_at, input.posted_at);
    assert.equal(store.get(id).application_url, 'https://fit.example/direct');
    assert.equal(store.fitBatch().length, 0);
    store.upsert(normalizeJob(input));
    assert.equal(store.get(id).fit_verdict, 'recommended');
    store.upsert(normalizeJob({ ...input, description: 'Build production computer vision systems.' }));
    assert.equal(store.get(id).fit_verdict, null);
    assert.deepEqual(store.fitBatch().map((row) => row.job_id), [id]);
    assert.throws(() => store.recordFitReviews([{ job_id: id, verdict: 'high' }]), /invalid verdict/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('fit batches keep company ordering and company lookup includes reviewed siblings', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-company-review-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const add = (company, title, suffix) => store.upsert(normalizeJob({
      company, title, location: 'Hong Kong', posted_at: new Date().toISOString(),
      url: `https://example.com/jobs/${suffix}`,
    })).id;
    const z = add('Zeta Co', 'AI Engineer', 'z');
    const a1 = add('Alpha Co', 'Backend Engineer', 'a1');
    const a2 = add('Alpha Co', 'Data Engineer', 'a2');
    const reviewed = add('Alpha Co', 'ML Engineer', 'a3');
    store.recordFitReviews([{ job_id: reviewed, verdict: 'recommended' }]);
    assert.deepEqual(store.fitBatch({ limit: 2 }).map((r) => r.job_id), [a2, a1]);
    assert.deepEqual(store.fitBatch().map((r) => r.job_id), [a2, a1, z]);
    assert.deepEqual(new Set(store.list({ company: 'ALPHA CO', stage: 'all' }).map((r) => r.id)),
      new Set([a1, a2, reviewed]));
    assert.equal(store.fitRecords([a1])[0].company_key, 'alpha co');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard fit filter accepts multiple verdicts and can exclude skips', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-dashboard-fit-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const ids = ['Recommended', 'Maybe', 'Unreviewed', 'Skip'].map((company) => store.upsert(normalizeJob({
      company, title: 'AI Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(),
      url: `https://${company.toLowerCase()}.example/job`,
    })).id);
    store.recordFitReviews([
      { job_id: ids[0], verdict: 'recommended' },
      { job_id: ids[1], verdict: 'maybe' },
      { job_id: ids[3], verdict: 'skip' },
    ]);
    assert.equal(store.dashboard({ fit: 'recommended,maybe' }).total, 2);
    assert.equal(store.dashboard({ fit: 'maybe,unreviewed' }).total, 2);
    assert.equal(store.dashboard({ fit: 'recommended,maybe,needs_answer,unreviewed' }).total, 3);
    assert.equal(store.dashboard({ fit: 'skip' }).total, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('store waits briefly for another worker instead of failing immediately on a lock', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-lock-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    assert.equal(store.db.prepare('PRAGMA busy_timeout').get().timeout, 10_000);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('stored classifications can be refreshed after the campaign changes', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-classify-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'RegionCo', title: 'AI Engineer', location: 'Hong Kong', url: 'https://region.example/job' })).id;
    store.db.prepare("UPDATE jobs SET market='unknown', priority='possible' WHERE id=?").run(id);
    assert.equal(store.refreshClassifications().changed, 1);
    assert.equal(store.get(id).market, 'hk');
    assert.equal(store.get(id).priority, 'strong');
    assert.equal(store.refreshClassifications().changed, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('store upserts, tracks stages, and enforces company limits', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const add = (title, location = 'Hong Kong') => store.upsert(normalizeJob({ company: 'Example', title, location, posted_at: new Date().toISOString(), url: `https://example.com/${encodeURIComponent(title)}`, source: 'test' })).id;
    const one = add('AI Engineer');
    const two = add('Data Engineer');
    const three = add('Backend Engineer');
    store.transition(one, 'queued');
    store.transition(one, 'applied', {
      cvPath: 'artifacts/1/cv.pdf', cvVersion: 'ai-backend-v1',
      answersPath: 'artifacts/1/answers.md', channel: 'direct',
    });
    store.transition(two, 'queued');
    store.transition(two, 'applied');
    store.transition(one, 'replied');
    assert.match(store.canQueue(three).reason, /(?:two|2) roles/);
    assert.equal(store.status().sources[0].applied, 2);
    assert.equal(store.get(one).stage, 'replied');
    assert.equal(store.get(one).cv_path, 'artifacts/1/cv.pdf');
    assert.equal(store.get(one).cv_version, 'ai-backend-v1');
    assert.equal(store.get(one).application_channel, 'direct');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('junior and senior applications cannot be mixed at one company', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const junior = store.upsert(normalizeJob({ company: 'MixedCo', title: 'Junior Backend Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://mixed.example/junior' })).id;
    const senior = store.upsert(normalizeJob({ company: 'MixedCo', title: 'Senior Backend Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://mixed.example/senior' })).id;
    store.transition(junior, 'queued');
    store.transition(junior, 'applied');
    assert.match(store.canQueue(senior).reason, /junior and senior/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('queued roles reserve company capacity and retry preserves stage', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const add = (title) => store.upsert(normalizeJob({ company: 'ReserveCo', title, location: 'Hong Kong', posted_at: new Date().toISOString(), url: `https://reserve.example/${encodeURIComponent(title)}` })).id;
    const one = add('AI Engineer'); const two = add('Data Engineer'); const three = add('Backend Engineer');
    store.transition(one, 'queued'); store.transition(two, 'queued');
    assert.match(store.canQueue(three).reason, /(?:two|2) roles/);
    store.fail(one, 'temporary'); store.retry(one);
    assert.equal(store.get(one).stage, 'queued');
    assert.equal(store.get(one).failure_reason, null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('application failures cannot overwrite submitted or replied roles', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-failure-stage-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'AppliedCo', title: 'Graduate Software Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://applied.example/graduate' })).id;
    store.transition(id, 'queued');
    store.transition(id, 'applied');
    assert.throws(() => store.fail(id, 'late automation error'), /after the job reached applied/);
    store.transition(id, 'replied');
    assert.throws(() => store.fail(id, 'late automation error'), /after the job reached replied/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('atomic queue and application recording reject stale concurrent state', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-concurrent-'));
  const file = path.join(dir, 'jobs.db');
  const first = new Store(file);
  const second = new Store(file);
  try {
    const id = first.upsert(normalizeJob({
      company: 'Concurrent Co', title: 'AI Engineer', location: 'Hong Kong',
      posted_at: new Date().toISOString(), url: 'https://concurrent.example/job',
    })).id;
    first.queue(id);
    assert.throws(() => second.queue(id), /no longer new/);
    first.recordPreflight(id, { browserConfirmed: true });
    first.recordApplication(id, {
      confirmationId: 'visible-success', cvPath: `artifacts/${id}/cv.pdf`,
      answersPath: `artifacts/${id}/answers.md`, channel: 'web',
    });
    assert.throws(() => second.recordApplication(id, {
      confirmationId: 'duplicate', cvPath: `artifacts/${id}/cv.pdf`,
      answersPath: `artifacts/${id}/answers.md`, channel: 'web',
    }), /already applied/);
  } finally {
    first.close(); second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown dates and submission without queue or preflight are refused', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'DateCo', title: 'AI Engineer', location: 'Hong Kong', url: 'https://date.example/job' })).id;
    assert.match(store.canQueue(id).reason, /date is unknown/);
    store.setPostedDate(id, new Date().toISOString());
    assert.match(store.canSubmit(id).reason, /prepared and queued/);
    store.transition(id, 'queued');
    assert.equal(store.canSubmit(id).ok, true);
    assert.equal(store.hasRecentPreflight(id), false);
    store.recordPreflight(id, { browserConfirmed: true });
    assert.equal(store.hasRecentPreflight(id), true);
    store.fail(id, 'temporary');
    assert.equal(store.hasRecentPreflight(id), false);
    assert.match(store.canSubmit(id).reason, /clear the recorded failure/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('a resolved employer application link does not erase the discovery link', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-link-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'LinkCo', title: 'AI Engineer', location: 'Hong Kong',
      posted_at: new Date().toISOString(), source: 'linkedin_guest', url: 'https://linkedin.example/job/1' })).id;
    store.setApplicationUrl(id, 'http://employer.example/apply/1?utm_source=linkedin');
    assert.equal(store.get(id).source_url, 'https://linkedin.example/job/1');
    assert.equal(store.get(id).application_url, 'https://employer.example/apply/1');
    assert.throws(() => store.setApplicationUrl(id, 'javascript:alert(1)'), /valid HTTPS/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('closed jobs require an explicit confirmed repost to reopen', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'RepostCo', title: 'AI Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://repost.example/job' })).id;
    store.transition(id, 'closed');
    assert.match(store.canQueue(id).reason, /closed/);
    store.reopen(id, new Date().toISOString());
    assert.equal(store.canQueue(id).ok, true);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('an applied requisition cannot be reopened and future dates are refused', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'OnceCo', title: 'AI Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://once.example/job' })).id;
    store.transition(id, 'queued'); store.transition(id, 'applied'); store.transition(id, 'closed');
    assert.throws(() => store.reopen(id, new Date().toISOString()), /cannot be reopened/);
    assert.throws(() => store.setPostedDate(id, '2099-01-01'), /future/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('dashboard metrics follow market and retain old active applications', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const old = store.upsert(normalizeJob({ company: 'Old Active', title: 'AI Engineer', location: 'Hong Kong', posted_at: '2026-01-01', url: 'https://active.example/job' })).id;
    store.transition(old, 'queued'); store.transition(old, 'applied', { channel: 'direct' });
    store.upsert(normalizeJob({ company: 'Old Unseen', title: 'AI Engineer', location: 'Hong Kong', posted_at: '2026-01-01', url: 'https://old-unseen.example/job' }));
    store.upsert(normalizeJob({ company: 'Remote New', title: 'AI Engineer', location: 'Remote - APAC', posted_at: new Date().toISOString(), url: 'https://remote.example/job' }));
    store.upsert(normalizeJob({ company: 'US Only', title: 'AI Engineer', location: 'United States', remote_scope: 'Remote in the United States only', posted_at: new Date().toISOString(), url: 'https://us-only.example/job' }));
    const hk = store.dashboard({ market: 'hk', stage: 'applied' });
    assert.equal(hk.total, 1);
    assert.equal(hk.jobs[0].id, old);
    assert.equal(hk.jobs[0].application_channel, 'direct');
    assert.equal(hk.metrics.applied, 1);
    assert.equal(store.dashboard({ market: 'hk', stage: 'all' }).total, 1);
    assert.equal(store.dashboard({ market: 'remote', stage: 'new' }).metrics.applied, 0);
    assert.equal(store.dashboard({ market: 'unknown', stage: 'new' }).metrics.new_roles, 0);
    assert.equal(store.dashboard({ view: 'applications', market: 'all', stage: 'all' }).total, 1);
    assert.equal(store.dashboard({ view: 'applications', market: 'all', stage: 'queued' }).total, 0);
    const paged = store.dashboard({ market: 'all', stage: 'all', limit: 1, offset: 1, sort: 'company' });
    assert.equal(paged.jobs.length, 1);
    assert.equal(paged.offset, 1);
    assert.equal(paged.truncated, paged.total > 2);
    assert.equal(store.dashboard({ market: 'all', stage: 'all', company: 'Remote New' }).total, 1);
    assert.equal(store.dashboard({ market: 'all', stage: 'all', query: 'apac' }).total, 1);
    const stats = store.stats({ days: 30 });
    assert.equal(stats.funnel.applied, 1);
    assert.equal(stats.funnel.selected, 1);
    assert.equal(stats.per_day.reduce((sum, day) => sum + day.applied, 0), 1);
    assert.equal(stats.recent[0].kind, 'stage:applied');
    assert.equal(store.detail(old).events.some((event) => event.kind === 'stage:applied'), true);
    store.note(old, 'Recruiter screen booked');
    assert.equal(store.detail(old).events[0].details.text, 'Recruiter screen booked');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('outreach stays linked to a job and exposes due follow-ups', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const jobId = store.upsert(normalizeJob({ company: 'ContactCo', title: 'AI Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://contact.example/job' })).id;
    const draft = store.addOutreach(jobId, {
      contactName: 'Hiring Manager', contactRole: 'AI Lead', contactUrl: 'https://example.com/person',
      channel: 'linkedin', messagePath: `artifacts/${jobId}/linkedin.md`, followUpAt: '2026-09-01T00:00:00.000Z',
    });
    assert.equal(draft.status, 'draft');
    assert.throws(() => store.addOutreach(jobId, {
      contactName: 'HIRING MANAGER', contactUrl: 'https://example.com/person', channel: 'linkedin',
    }), /already exists/);
    store.markOutreach(draft.id, 'sent');
    assert.equal(store.followUps('2026-09-03T00:00:00.000Z')[0].job_id, jobId);
    assert.equal(store.status().follow_ups_due, 1);
    assert.equal(store.detail(jobId).outreach[0].contact_role, 'AI Lead');
    store.recordOutreachFollowUp(draft.id, { messagePath: `artifacts/${jobId}/linkedin-follow-up.md` });
    assert.equal(store.followUps('2026-09-03T00:00:00.000Z').length, 0);
    const detail = store.detail(jobId);
    assert.equal(detail.outreach[0].message_path, `artifacts/${jobId}/linkedin.md`);
    assert.equal(detail.events[0].kind, 'outreach:follow_up_sent');
    assert.equal(detail.events[0].details.message_path, `artifacts/${jobId}/linkedin-follow-up.md`);
    store.markOutreach(draft.id, 'replied');
    assert.equal(store.followUps('2026-09-03T00:00:00.000Z').length, 0);
    assert.throws(() => store.markOutreach(draft.id, 'sent'), /cannot move outreach backward/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('applications without replies surface a seven-day follow-up and missing outreach', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-application-follow-up-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const jobId = store.upsert(normalizeJob({
      company: 'Follow Co', title: 'AI Engineer', location: 'Hong Kong',
      posted_at: new Date().toISOString(), url: 'https://follow.example/job',
    })).id;
    store.transition(jobId, 'queued');
    store.transition(jobId, 'applied');
    store.db.prepare('UPDATE jobs SET applied_at=? WHERE id=?').run('2026-08-20T00:00:00.000Z', jobId);
    assert.equal(store.applicationFollowUps('2026-09-03T00:00:00.000Z')[0].id, jobId);
    assert.equal(store.status().application_follow_ups_due, 1);
    assert.equal(store.status().outreach_pending, 1);
    store.addOutreach(jobId, { contactName: 'Recruiter', channel: 'email' });
    assert.equal(store.status().outreach_pending, 0);
    store.recordApplicationFollowUp(jobId, { note: 'Sent a concise status check' });
    assert.equal(store.applicationFollowUps('2026-09-03T00:00:00.000Z').length, 0);
    assert.equal(store.status().application_follow_ups_due, 0);
    store.transition(jobId, 'replied');
    assert.equal(store.applicationFollowUps('2026-09-03T00:00:00.000Z').length, 0);
    assert.equal(store.status().outreach_pending, 0);
    const repliedId = store.upsert(normalizeJob({
      company: 'Already Replied Co', title: 'ML Engineer', location: 'Hong Kong',
      posted_at: new Date().toISOString(), url: 'https://already-replied.example/job',
    })).id;
    store.transition(repliedId, 'queued');
    store.transition(repliedId, 'applied');
    store.transition(repliedId, 'replied');
    assert.equal(store.status().outreach_pending, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('experiments keep one hypothesis, cohort, metric, result, and decision', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-experiment-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const experiment = store.addExperiment({
      hypothesis: 'A short proof link raises replies', change: 'Add one relevant GitHub link',
      cohort: 'Next 10 approved LinkedIn messages', metric: 'Replies within 7 days',
    });
    assert.equal(store.listExperiments('active')[0].id, experiment.id);
    const closed = store.closeExperiment(experiment.id, { result: '3 of 10 replied', decision: 'Keep the proof link' });
    assert.equal(closed.status, 'closed');
    assert.equal(store.listExperiments('active').length, 0);
    assert.throws(() => store.closeExperiment(experiment.id, { result: 'x', decision: 'y' }), /already closed/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('completed orchestrator scans are remembered separately from source health', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    assert.equal(store.hasSuccessfulScan('scope:hk:all'), false);
    store.event('scan_run', { details: { name: 'scope:hk:all', status: 'partial' } });
    assert.equal(store.hasSuccessfulScan('scope:hk:all'), true);
    assert.equal(store.sourceHealth().length, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('partial and failed browser checks remain due until a full scan succeeds', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    store.event('source_scan', { details: { name: 'partial-source', status: 'partial', cadence_days: 7 } });
    store.event('source_scan', { details: { name: 'failed-source', status: 'failed', cadence_days: 7 } });
    store.event('source_scan', { details: { name: 'healthy-source', status: 'ok', cadence_days: 7 } });
    const health = new Map(store.sourceHealth().map((source) => [source.name, source]));
    assert.equal(health.get('partial-source').due, true);
    assert.equal(health.get('failed-source').due, true);
    assert.equal(health.get('healthy-source').due, false);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('pipeline transitions only move forward and closed is terminal', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-test-'));
  const store = new Store(path.join(dir, 'test.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'FlowCo', title: 'AI Engineer', location: 'Hong Kong', posted_at: new Date().toISOString(), url: 'https://flow.example/job' })).id;
    store.transition(id, 'queued'); store.transition(id, 'applied'); store.transition(id, 'interview');
    assert.throws(() => store.transition(id, 'replied'), /cannot move pipeline backward/);
    store.transition(id, 'closed');
    assert.throws(() => store.transition(id, 'interview'), /closed jobs cannot change stage/);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('neutral classification retains technical and nontechnical professions and Unicode titles', () => {
  for (const title of ['Quantitative Researcher', 'Sales Engineer', 'Quantity Surveyor', '机器学习工程师']) {
    assert.equal(classify({ title }).priority, 'possible', title);
  }
  assert.notEqual(normalizeJob({ company: '中文公司', title: '机器学习工程师', url: 'https://example.com/中文' }).title_key, '');
});

test('thin rescans preserve hydrated fields and canonicalize hydrated details', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-precedence-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const id = store.upsert(normalizeJob({ company: 'Detail Co', title: 'AI Engineer', location: 'Hong Kong', posted_at: '2026-09-03', description: 'A detailed description with enough useful context for review.', source: 'linkedin_guest', url: 'https://hk.linkedin.com/jobs/view/1' })).id;
    store.enrichJob(id, { posted_at: 1788321450000, location: 'Hong Kong / Kowloon', description: 'A substantially longer authoritative detail page description that should survive later thin card rescans.', application_url: 'http://employer.example/apply/1?utm_source=board' });
    const hydrated = store.get(id);
    store.upsert(normalizeJob({ company: 'Detail Co', title: 'AI Engineer', location: 'Remote', posted_at: '2026-09-04', description: 'Thin card', source: 'linkedin_guest', url: 'https://www.linkedin.com/jobs/view/1' }));
    const rescanned = store.get(id);
    assert.equal(rescanned.posted_at, hydrated.posted_at);
    assert.equal(rescanned.location, hydrated.location);
    assert.equal(rescanned.description, hydrated.description);
    assert.equal(rescanned.application_url, 'https://employer.example/apply/1');
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});

test('scan windows cover elapsed time with overlap and failed runs do not establish a baseline', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-window-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    assert.equal(store.scanWindowDays('scope:hk:all'), 21);
    store.event('scan_run', { details: { name: 'scope:hk:all', status: 'failed' } });
    assert.equal(store.scanWindowDays('scope:hk:all'), 21);
    store.event('scan_run', { details: { name: 'scope:hk:all', status: 'ok' } });
    const last = store.lastSuccessfulScan('scope:hk:all').created_at;
    assert.equal(store.scanWindowDays('scope:hk:all', { now: new Date(new Date(last).valueOf() + 86_400_000) }), 3);
    assert.equal(store.scanWindowDays('scope:hk:all', { now: new Date(new Date(last).valueOf() + 10 * 86_400_000) }), 10);
    assert.equal(store.scanWindowDays('scope:hk:all', { now: new Date(new Date(last).valueOf() + 40 * 86_400_000) }), 21);
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});

test('one failed source catches up independently while other sources keep succeeding', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-source-window-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    const insert = store.db.prepare(`INSERT INTO events(kind, created_at, details_json)
      VALUES ('source_scan', ?, ?)`);
    insert.run('2026-08-30T00:00:00.000Z', JSON.stringify({ name: 'source-a', status: 'ok' }));
    insert.run('2026-09-03T00:00:00.000Z', JSON.stringify({ name: 'source-b', status: 'ok' }));
    insert.run('2026-09-03T00:00:00.000Z', JSON.stringify({ name: 'source-a', status: 'failed' }));
    const now = new Date('2026-09-04T00:00:00.000Z');
    assert.equal(store.sourceScanWindowDays('source-a', { now }), 5);
    assert.equal(store.sourceScanWindowDays('source-b', { now }), 3);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('stats group activity by UTC calendar day', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'job-search-hkt-stats-'));
  const store = new Store(path.join(dir, 'jobs.db'));
  try {
    store.db.prepare(`INSERT INTO events(kind, created_at, details_json)
      VALUES ('note', '2026-09-03T17:00:00.000Z', '{}')`).run();
    assert.equal(store.stats({ days: 30 }).per_day[0].day, '2026-09-03');
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});
