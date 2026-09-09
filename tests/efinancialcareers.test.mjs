import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEfcJob, fetchEfinancialCareers } from '../src/connectors/efinancialcareers.mjs';

test('eFinancialCareers records normalize into the canonical input shape', () => {
  const job = normalizeEfcJob({
    title: 'AI Engineer',
    companyName: 'Example Bank',
    detailsPageUrl: '/jobs-Hong_Kong-AI_Engineer.id123',
    jobLocation: { displayName: 'Hong Kong' },
    postedDate: '2026-09-02T00:00:00Z',
    salary: 'HKD 40k–50k',
  });
  assert.equal(job.company, 'Example Bank');
  assert.equal(job.source_url, 'https://www.efinancialcareers.hk/jobs-Hong_Kong-AI_Engineer.id123');
  assert.equal(job.salary_text, 'HKD 40k–50k');
});

test('eFinancialCareers does not label a foreign result as Hong Kong', () => {
  const job = normalizeEfcJob({
    title: 'AI Engineer', companyName: 'Example Bank',
    detailsPageUrl: '/jobs-London-AI_Engineer.id124',
    jobLocation: { displayName: 'London, United Kingdom' },
  });
  assert.equal(job.market, 'unknown');
});


test('eFinancialCareers flags any capped query even after stale results are filtered', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    requests.push([url.searchParams.get('q'), url.searchParams.get('page')]);
    const data = url.searchParams.get('q') === 'credit analyst'
      ? [1, 2].map(id => ({ title: 'Credit Analyst', companyName: 'Example Bank',
        detailsPageUrl: `/jobs/credit-${id}`, postedDate: '2000-01-01' }))
      : [{ title: 'Accountant', companyName: 'Example Bank', detailsPageUrl: '/jobs/accountant' }];
    return { ok: true, json: async () => ({ data }) };
  });
  const jobs = await fetchEfinancialCareers({ queries: ['credit analyst', 'accountant'], maxPages: 2, pageSize: 2 });
  assert.deepEqual(requests, [['credit analyst', '1'], ['credit analyst', '2'], ['accountant', '1']]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Accountant');
  assert.equal(jobs.truncated, true);
});

test('eFinancialCareers marks a query complete when a short page ends pagination', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return { ok: true, json: async () => ({ data: requests === 1 ? [1, 2].map(id => ({
      title: 'Treasury Analyst', companyName: 'Example Bank', detailsPageUrl: `/jobs/treasury-${id}`,
    })) : [] }) };
  });
  const jobs = await fetchEfinancialCareers({ queries: ['treasury analyst'], maxPages: 2, pageSize: 2 });
  assert.equal(requests, 2);
  assert.equal(jobs.length, 2);
  assert.equal(Boolean(jobs.truncated), false);
});
