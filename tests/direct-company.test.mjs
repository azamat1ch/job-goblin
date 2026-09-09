import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMillennium, parseOptiver, parseSig } from '../src/connectors/direct-company.mjs';

test('Millennium preserves its canonical role link and requisition', () => {
  const jobs = parseMillennium([{
    id: 42, name: 'AI Data Scientist', location: 'Hong Kong, Hong Kong',
    ats_job_id: 'REQ-42', t_create: 1787788800,
    canonicalPositionUrl: 'https://mlp.eightfold.ai/careers/job/42',
  }]);
  assert.equal(jobs[0].source_key, 'REQ-42');
  assert.equal(jobs[0].posted_at, new Date(1787788800 * 1000).toISOString());
});

test('SIG preserves its direct iCIMS application link and description', () => {
  const jobs = parseSig([{ data: {
    slug: '11315', req_id: '11315', title: 'Security Engineer',
    full_location: 'Hong Kong, Hong Kong', posted_date: '2026-08-25T01:15:00+0000',
    hiring_organization: 'SIG', apply_url: 'https://careers-sig.icims.com/jobs/11315/login',
    description: '<p>Build <strong>secure</strong> systems.</p>',
  } }]);
  assert.equal(jobs[0].application_url, 'https://careers-sig.icims.com/jobs/11315/login');
  assert.equal(jobs[0].description, 'Build secure systems.');
});

test('Optiver joins list records to structured page detail', () => {
  const url = 'https://www.optiver.com/join-us/jobs/technology/hong-kong/ai-engineer/';
  const jobs = parseOptiver([{ title: 'AI Engineer', location: 'Hong Kong', href: new URL(url).pathname, componentID: 7 }], new Map([[url, {
    posted_at: '2026-09-01', description: 'Build models.', application_url: url,
  }]]));
  assert.equal(jobs[0].description, 'Build models.');
  assert.equal(jobs[0].source_url, url);
});
