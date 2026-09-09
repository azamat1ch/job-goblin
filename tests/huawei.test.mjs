import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCurrentHuaweiJobs, normalizeHuaweiJob } from '../src/connectors/huawei.mjs';

const row = {
  advertisementId: 34785,
  jobName: 'Research Intern',
  workPlace: 'China/Hong Kong',
  lastUpdateDate: '2026-06-10',
  mainBusiness: 'Research machine learning systems.',
  jobRequire: 'Strong software engineering skills.',
};

test('Huawei records have a direct official detail link', () => {
  const job = normalizeHuaweiJob(row);
  assert.equal(job.market, 'hk');
  assert.equal(job.source_url, 'https://career.huawei.com/en/job-details?advertisementId=34785');
  assert.match(job.description, /software engineering/);
});

test('Huawei uses its release or update date for freshness', () => {
  const fresh = { ...row, advertisementId: 2, releaseDate: '2026-09-01' };
  const result = filterCurrentHuaweiJobs([row, fresh], { now: new Date('2026-09-03T04:00:00Z') });
  assert.deepEqual(result.map((job) => job.advertisementId), [2]);
});
