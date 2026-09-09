import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cathayApiFromHtml,
  parseByteDanceJobs,
  parseCathayDetail,
  parseCathayJobs,
  parseGoldmanRoles,
} from '../src/connectors/hk-public-company.mjs';

const NOW = Date.parse('2026-09-03T12:00:00Z');

test('Goldman joins list, date, detail, and direct application records', () => {
  const rows = [{
    jobTitle: 'FICC Software Engineer', status: 'POSTED',
    locations: [{ country: 'Hong Kong' }], externalSource: { sourceId: '177051' },
  }];
  const details = new Map([['177051', {
    ...rows[0], applyActive: true,
    descriptionHtml: '<p>Build <strong>low latency</strong> systems.</p>',
    externalSource: {
      sourceId: '177051',
      externalApplicationUrl: 'https://oracle.example/job/177051/apply',
    },
  }]]);
  const dates = new Map([['177051', '2026-09-01']]);
  const jobs = parseGoldmanRoles(rows, { details, dates, sinceDays: 21, now: NOW });
  assert.equal(jobs[0].source_url, 'https://higher.gs.com/roles/177051');
  assert.equal(jobs[0].application_url, 'https://oracle.example/job/177051/apply');
  assert.equal(jobs[0].description, 'Build low latency systems.');
  assert.equal(jobs[0].posted_at, '2026-09-01');
});

test('Goldman drops closed and stale roles from a dated window', () => {
  const base = { jobTitle: 'Engineer', locations: [{ country: 'Hong Kong' }] };
  const rows = [
    { ...base, status: 'POSTED', externalSource: { sourceId: 'old' } },
    { ...base, status: 'CLOSED', externalSource: { sourceId: 'closed' } },
  ];
  const dates = new Map([['old', '2026-07-01'], ['closed', '2026-09-02']]);
  assert.deepEqual(parseGoldmanRoles(rows, { dates, sinceDays: 21, now: NOW }), []);
});

test('ByteDance keeps full text and exact public and apply links', () => {
  const jobs = parseByteDanceJobs([{
    id: '7658202948652402997', title: 'Solutions Architect (AI) - BytePlus',
    description: 'Design AI platforms.', requirement: 'Python required.',
    city_info: { en_name: 'Hong Kong (China)' },
  }]);
  assert.equal(jobs[0].source_url, 'https://joinbytedance.com/search/7658202948652402997');
  assert.equal(jobs[0].application_url, 'https://jobs.bytedance.com/en/resume/7658202948652402997/apply');
  assert.match(jobs[0].description, /Python required/);
  assert.equal(jobs[0].posted_at, null);
});

test('Cathay discovers its public API path and key from the landing page', () => {
  const html = '<div data-api-key="fresh-key" class="job-listing wide" data-api="/api/jobs?lang=en"></div>';
  assert.deepEqual(cathayApiFromHtml(html), {
    url: 'https://careers.cathaypacific.com/api/jobs?lang=en',
    key: 'fresh-key',
  });
});

test('Cathay extracts the full description and external application link', () => {
  const pageUrl = 'https://careers.cathaypacific.com/en/careers/jobs/hong-kong/data-role-1';
  const html = `
    <div class="job-detail__grid__main"><h2>Role</h2><p>Build data products.</p></div></div>
    <div class="job-detail__grid__sidebar"><a title="Apply Now" href="https://apply.example/1">Apply Now</a></div>
  `;
  assert.deepEqual(parseCathayDetail(html, pageUrl), {
    description: 'Role Build data products.',
    application_url: 'https://apply.example/1',
  });
});

test('Cathay keeps fresh Hong Kong roles and removes stale or overseas rows', () => {
  const rows = [
    { title: 'Digital Analyst', location: 'Hong Kong', url: '/en/jobs/1', localId: '1', applicationStartDate_s: '2026-09-01', jobFunction: 'Digital' },
    { title: 'Old Analyst', location: 'Hong Kong', url: '/en/jobs/2', localId: '2', applicationStartDate_s: '2026-07-01' },
    { title: 'Tokyo Analyst', location: 'Tokyo, Japan', url: '/en/jobs/3', localId: '3', applicationStartDate_s: '2026-09-02' },
  ];
  const details = new Map([['https://careers.cathaypacific.com/en/jobs/1', {
    description: 'Build analytics products.', application_url: 'https://apply.example/1',
  }]]);
  const jobs = parseCathayJobs(rows, { details, sinceDays: 21, now: NOW });
  assert.deepEqual(jobs.map((job) => job.title), ['Digital Analyst']);
  assert.equal(jobs[0].source_url, 'https://careers.cathaypacific.com/en/jobs/1');
  assert.equal(jobs[0].application_url, 'https://apply.example/1');
  assert.equal(jobs[0].description, 'Build analytics products. Job function: Digital');
});
