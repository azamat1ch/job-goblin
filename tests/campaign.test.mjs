import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCampaign, DEFAULT_CAMPAIGN } from '../src/lib/campaign.mjs';
import { classify, normalizeJob } from '../src/lib/jobs.mjs';
import { Store } from '../src/db/store.mjs';

const hk = { id: 'hong-kong', label: 'Hong Kong', location_terms: ['Hong Kong', 'HK'], remote: false };
const ai = validateCampaign({ version: 1, name: 'AI candidate', markets: [hk], roles: { primary: ['AI', 'LLM Engineer'], adjacent: ['Backend Engineer'] } });
const finance = validateCampaign({ version: 1, name: 'Finance candidate', markets: [hk], roles: { primary: ['Financial Analyst', 'Accountant'], adjacent: ['Business Analyst'] } });
const berlin = validateCampaign({ version: 1, name: 'Germany applicant', markets: [{ id: 'berlin', label: 'Berlin', location_terms: ['Berlin'], remote: false }], roles: { primary: ['Product Designer'] } });

test('AI/HK, finance/HK and a non-HK candidate use the same configurable classifier', () => {
  assert.equal(classify({ title: 'Senior AI Engineer', location: 'Hong Kong' }, ai).priority, 'strong');
  assert.equal(classify({ title: 'Financial Analyst', location: 'Hong Kong' }, finance).priority, 'strong');
  assert.equal(classify({ title: 'Financial Analyst', location: 'Hong Kong' }, ai).priority, 'possible');
  const designer = classify({ title: 'Product Designer', location: 'Berlin, Germany' }, berlin);
  assert.equal(designer.market, 'berlin');
  assert.equal(designer.priority, 'strong');
  assert.equal(classify({ title: 'Retail Manager', location: 'Hong Kong' }, ai).priority, 'possible');
});

test('neutral campaign imposes no role, location or seniority exclusions', () => {
  const config = validateCampaign({});
  assert.deepEqual(config, DEFAULT_CAMPAIGN);
  for (const title of ['Chief Financial Officer', 'AI Intern', 'Art Teacher']) {
    const result = classify({ title, location: 'Hong Kong' }, config);
    assert.equal(result.market, 'unknown');
    assert.equal(result.priority, 'possible');
  }
});

test('campaign validation rejects typoed filters, invalid types and contradictory windows', () => {
  for (const input of [null, [], { version: 2 }, { roles: { primary: 'AI' } },
    { filters: { exclude_title: ['Intern'] } }, { filters: { exclude_titles: [1] } },
    { filters: { max_posting_age_days: -1 } }, { applications: { allow_seniority_mix: 'false' } },
    { applications: { max_per_company_30_days: 0 } }, { applications: { follow_up_days: 0 } }, { discovery: { query_days: 40 } },
    { discovery: { overlap_days: 22 } }, { markets: [hk, hk] },
    { markets: [{ ...hk, id: 'all' }] }, { markets: [{ ...hk, remote: 'false' }] }]) {
    assert.throws(() => validateCampaign(input), undefined, JSON.stringify(input));
  }
});

test('workspace campaign loading is independent of the CLI installation and explicit errors fail closed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-root-'));
  const moduleUrl = new URL('../src/lib/campaign.mjs', import.meta.url).href;
  const run = (extra = {}) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {loadCampaign} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(loadCampaign()));`],
    { encoding: 'utf8', cwd: tmpdir(), env: { ...process.env, JOBS_ROOT: root, JOBS_CAMPAIGN: '', ...extra } });
  try {
    assert.deepEqual(JSON.parse(run().stdout), DEFAULT_CAMPAIGN);
    mkdirSync(path.join(root, 'config/private'), { recursive: true });
    writeFileSync(path.join(root, 'config/private/campaign.yml'), 'version: 1\nname: Workspace campaign\nroles:\n  primary: [Accountant]\n');
    assert.equal(JSON.parse(run().stdout).name, 'Workspace campaign');
    const explicit = path.join(root, 'override.yml');
    writeFileSync(explicit, 'version: 1\nname: Explicit campaign\n');
    assert.equal(JSON.parse(run({ JOBS_CAMPAIGN: explicit }).stdout).name, 'Explicit campaign');
    assert.notEqual(run({ JOBS_CAMPAIGN: path.join(root, 'missing.yml') }).status, 0);
    writeFileSync(explicit, 'filters:\n  exclude_title: [Intern]\n');
    assert.notEqual(run({ JOBS_CAMPAIGN: explicit }).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('neutral store keeps unknown geography and soft constraints in review and permits seniority mixing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-store-'));
  const config = validateCampaign({});
  const store = new Store(path.join(root, 'jobs.db'), config);
  try {
    const add = (title, suffix, posted_at = new Date().toISOString()) => store.upsert(normalizeJob({
      company: 'Neutral Co', title, location: '', posted_at,
      description: 'Visa sponsorship unavailable; 10+ years preferred; salary undisclosed; Mandarin required.',
      url: `https://example.com/${suffix}`,
    }, {}, config)).id;
    const junior = add('Junior Accountant', 'junior');
    const senior = add('Senior Accountant', 'senior');
    const third = add('Director of Finance', 'director');
    const unknownDate = add('Financial Analyst', 'unknown', null);
    assert.equal(store.canQueue(unknownDate).ok, true);
    const old = add('Treasury Analyst', 'old', '2020-01-01');
    assert.equal(store.expireStaleNew(), 0);
    assert.equal(store.canQueue(old).ok, true);
    store.campaign.filters.max_posting_age_days = 14;
    assert.equal(store.canQueue(unknownDate).ok, false);
    assert.equal(store.canQueue(old).ok, false);
    store.campaign.filters.max_posting_age_days = null;
    store.queue(junior);
    assert.equal(store.canQueue(senior).ok, true);
    store.queue(senior);
    assert.equal(store.canQueue(third).ok, true);
    assert.ok(store.fitBatch().some(row => row.job_id === unknownDate));
    assert.ok(store.preReviewCandidates({ market: 'all' }).some(row => row.id === unknownDate));
    store.queue(unknownDate);
    assert.equal(store.canSubmit(unknownDate).ok, true);
    store.recordPreflight(unknownDate, { browserConfirmed: true });
    assert.equal(store.hasRecentPreflight(unknownDate), true);
    assert.equal(store.get(unknownDate).posted_at, null);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});


test('application follow-up queue and status share the chosen cadence, including disabled', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-followup-'));
  const config = validateCampaign({ applications: { follow_up_days: 14 } });
  const store = new Store(path.join(root, 'jobs.db'), config);
  try {
    const id = store.upsert(normalizeJob({ company: 'Finance Co', title: 'Analyst',
      url: 'https://example.com/follow-up' }, {}, config)).id;
    store.transition(id, 'queued');
    store.transition(id, 'applied');
    store.db.prepare('UPDATE jobs SET applied_at=? WHERE id=?')
      .run(new Date(Date.now() - 10 * 86400000).toISOString(), id);
    assert.equal(store.applicationFollowUps().length, 0);
    assert.equal(store.status().application_follow_ups_due, 0);
    config.applications.follow_up_days = 3;
    assert.equal(store.applicationFollowUps()[0].id, id);
    assert.equal(store.status().application_follow_ups_due, 1);
    config.applications.follow_up_days = null;
    assert.equal(store.applicationFollowUps().length, 0);
    assert.equal(store.status().application_follow_ups_due, 0);
    config.applications.follow_up_days = 3;
    store.recordApplicationFollowUp(id);
    assert.equal(store.applicationFollowUps().length, 0);
    assert.equal(store.status().application_follow_ups_due, 0);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('past applications retain real dates and stages without inventing current activity', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-history-'));
  const store = new Store(path.join(root, 'jobs.db'), validateCampaign({}));
  try {
    const id = store.upsert(normalizeJob({ company: 'History Co', title: 'Analyst', url: 'https://example.com/history' })).id;
    const appliedAt = new Date(Date.now() - 10 * 86400000).toISOString();
    assert.throws(() => store.recordHistory(id, { appliedAt, stage: 'interview' }), /evidence/);
    assert.throws(() => store.recordHistory(id, { appliedAt: '2026-02-30', evidence: 'user report' }), /real/);
    const row = store.recordHistory(id, { appliedAt, stage: 'interview', evidence: 'User supplied existing tracker', channel: 'direct' });
    assert.equal(row.applied_at, appliedAt);
    assert.equal(row.stage, 'interview');
    assert.equal(row.confirmation_id, null);
    assert.equal(store.hasRecentPreflight(id), false);
    const stats = store.stats();
    assert.equal(stats.funnel.applied, 1);
    assert.equal(stats.funnel.interview, 1);
    assert.equal(stats.per_day.find(d => d.day === appliedAt.slice(0, 10)).applied, 1);
    assert.equal(stats.per_day.reduce((sum, d) => sum + d.responses, 0), 0);
    assert.equal(stats.last_24h.some(e => e.kind === 'stage:applied' || e.kind === 'stage:interview'), false);
    assert.throws(() => store.recordHistory(id, { appliedAt, evidence: 'again' }), /existing application/);
    assert.equal(store.get(id).stage, 'interview');
    const offsetId = store.upsert(normalizeJob({ company: 'Offset Co', title: 'Analyst', url: 'https://example.com/offset' })).id;
    const offset = store.recordHistory(offsetId, { appliedAt: '2025-09-01T00:30:00+08:00', evidence: 'Dated user record' });
    assert.equal(offset.applied_at, '2025-08-31T16:30:00.000Z');
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('relaxed age policy can restore its own unsubmitted closures without a fake repost', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-restore-'));
  const config = validateCampaign({ filters: { max_posting_age_days: 14 } });
  const store = new Store(path.join(root, 'jobs.db'), config);
  try {
    const postedAt = new Date(Date.now() - 20 * 86400000).toISOString();
    const add = suffix => store.upsert(normalizeJob({ company: 'Restore Co', title: 'Analyst',
      posted_at: postedAt, url: `https://example.com/${suffix}` })).id;
    const id = add('expired'), manual = add('manual');
    store.transition(manual, 'closed');
    assert.equal(store.expireStaleNew(), 1);
    assert.throws(() => store.restoreExpired(id), /still exceeds/);
    config.filters.max_posting_age_days = null;
    assert.throws(() => store.restoreExpired(manual), /not closed by the age policy/);
    store.restoreExpired(id);
    assert.equal(store.get(id).stage, 'new');
    assert.equal(store.get(id).posted_at, postedAt);
    assert.equal(store.get(id).reposted_at, null);
    assert.equal(store.canQueue(id).ok, true);
    assert.throws(() => store.restoreExpired(id), /requires an unsubmitted/);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
