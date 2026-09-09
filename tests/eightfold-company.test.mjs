import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EIGHTFOLD_COMPANIES,
  eightfoldSearchCount,
  parseEightfoldDetail,
  parseEightfoldSearch,
} from '../src/connectors/eightfold-company.mjs';

const now = new Date('2026-09-03T00:00:00Z');

test('legacy Eightfold rows preserve the employer application redirect and exact posting date', () => {
  const jobs = parseEightfoldSearch({ count: 2, positions: [{
    id: 101,
    name: 'AI Engineer',
    location: 'Central, Hong Kong',
    t_create: 1788134400,
    ats_job_id: 'HSBC-101',
    canonicalPositionUrl: 'https://portal.careers.hsbc.com/careers/job/101',
    apply_redirect_url: 'https://career2.successfactors.eu/job_application?id=HSBC-101',
    custom_JD: { data_fields: { brand: ['Hang Seng Bank'], postingStartDate: ['31 August 2026'] } },
    job_description: '<p>Build <strong>AI</strong> systems &amp; data services.</p>',
  }, {
    id: 102, name: 'Old role', location: 'Hong Kong', t_create: 1782864000,
  }] }, EIGHTFOLD_COMPANIES.hsbc, { sinceDays: 21, now });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Hang Seng Bank');
  assert.equal(jobs[0].source_key, 'HSBC-101');
  assert.equal(jobs[0].posted_at, '2026-08-31T00:00:00.000Z');
  assert.equal(jobs[0].description, 'Build AI systems & data services.');
  assert.equal(jobs[0].application_url, 'https://career2.successfactors.eu/job_application?id=HSBC-101');
});

test('PCSX wrapper rows become direct Morgan Stanley jobs', () => {
  const payload = { status: 200, data: { count: 1, positions: [{
    id: 202,
    displayJobId: 'JR202',
    name: 'Machine Learning Engineer',
    locations: ['Hong Kong, Hong Kong'],
    postedTs: 1788134400,
    workLocationOption: 'hybrid',
    positionUrl: '/careers/job/202',
  }] } };
  const jobs = parseEightfoldSearch(payload, EIGHTFOLD_COMPANIES['morgan-stanley'], { sinceDays: 21, now });

  assert.equal(eightfoldSearchCount(payload), 1);
  assert.equal(jobs[0].company, 'Morgan Stanley');
  assert.equal(jobs[0].source_key, 'JR202');
  assert.equal(jobs[0].source_url, 'https://morganstanley.eightfold.ai/careers/job/202');
  assert.equal(jobs[0].application_url, jobs[0].source_url);
  assert.equal(jobs[0].remote_scope, 'hybrid');
});

test('PCSX detail parser unwraps data and cleans its description', () => {
  const job = parseEightfoldDetail({ status: 200, data: {
    id: 303,
    atsJobId: 'JR303',
    name: 'Data Engineer',
    location: 'Hong Kong, Hong Kong',
    postedTs: 1788220800,
    publicUrl: 'https://morganstanley.eightfold.ai/careers/job/303',
    jobDescription: '<p>Own pipelines.</p><ul><li>Ship reliable data</li></ul>',
  } }, EIGHTFOLD_COMPANIES['morgan-stanley']);

  assert.equal(job.description, 'Own pipelines. • Ship reliable data');
  assert.equal(job.posted_at, '2026-09-01T00:00:00.000Z');
});
