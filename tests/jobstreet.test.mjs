import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobstreetItem } from '../src/connectors/providers/jobstreet.mjs';

test('JobsDB search cards preserve useful screening text and salary', () => {
  const job = parseJobstreetItem({
    id: '123', title: 'AI Engineer', advertiser: { description: 'Example' },
    locations: [{ label: 'Hong Kong' }], listingDate: '2026-09-03T00:00:00Z',
    bulletPoints: ['Build production RAG', 'Own evaluation'], teaser: 'Python and SQL required',
    salaryLabel: 'HK$40,000 – HK$55,000 per month',
  }, 'https://hk.jobsdb.com', 'fallback');
  assert.equal(job.url, 'https://hk.jobsdb.com/job/123');
  assert.equal(job.description, 'Build production RAG. Own evaluation. Python and SQL required');
  assert.equal(job.salary, 'HK$40,000 – HK$55,000 per month');
});
