import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCurrentHkstpTalentJobs, normalizeHkstpTalentJob } from '../src/connectors/hkstp-talent.mjs';

const current = {
  id: 104122,
  slug: 'AI-R-D-Engineer',
  job_title: 'AI R&D Engineer',
  company: { company_name: 'Example Science Park Company' },
  location_id: [24],
  work_mode_id: 2,
  publish_at: '2026-08-18T04:41:18Z',
  expire_at: '2026-11-16T23:59:59Z',
  job_description: '<p>Build production AI systems.</p><ul><li>Own delivery &amp; testing.</li></ul>',
};

test('HKSTP Talent records include dates and a direct public job link', () => {
  const job = normalizeHkstpTalentJob(current);
  assert.equal(job.market, 'hk');
  assert.equal(job.location, 'Hong Kong SAR · Hybrid');
  assert.equal(job.source_url, 'https://talentjobseeker.hkstp.org/job/104122/AI-R-D-Engineer');
  assert.equal(job.posted_at, '2026-08-18T04:41:18Z');
  assert.equal(job.description, 'Build production AI systems.\n• Own delivery & testing.');
});

test('HKSTP Talent freshness rejects expired, old, and non-HK records', () => {
  const rows = [
    current,
    { ...current, id: 2, publish_at: '2026-07-01T00:00:00Z' },
    { ...current, id: 3, expire_at: '2026-08-20T00:00:00Z' },
    { ...current, id: 4, location_id: [23] },
  ];
  const result = filterCurrentHkstpTalentJobs(rows, { now: new Date('2026-09-03T04:00:00Z') });
  assert.deepEqual(result.map((row) => row.id), [104122]);
});
