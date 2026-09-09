import test from 'node:test';
import assert from 'node:assert/strict';
import { preReviewDecision, preReviewJobs } from '../src/lib/pre-review.mjs';
import { validateCampaign } from '../src/lib/campaign.mjs';

const job = (overrides = {}) => ({ id: 1, company: 'Example Co', title: 'Senior AI Engineer',
  location: 'London', market: 'uk', source: 'greenhouse', priority: 'possible', description: '', ...overrides });
const campaign = (filters = {}) => validateCampaign({ version: 1, name: 'Explicit filters', filters });
const now = new Date('2026-09-10T12:00:00Z');

test('neutral pre-review retains professions, seniority, languages and geographic uncertainty', () => {
  for (const market of ['hk', 'remote', 'uk', 'unknown']) {
    for (const title of ['Finance Intern', 'Director of AI', 'Network Engineer', 'Ingénieur DevOps',
      'Low Latency C++ Engineer', 'Assistant Manager, Transfer Pricing, Tax']) {
      assert.equal(preReviewDecision(job({ market, title }), campaign()), null);
    }
    assert.equal(preReviewDecision(job({ market, location: 'Paris, France', eligibility: 'likely_incompatible',
      description: 'Must have the right to work without sponsorship. Requires 10+ years. Fluent Mandarin. Salary negotiable.' }), campaign()), null);
  }
});

test('only configured literal whole title terms are excluded in every market', () => {
  const config = campaign({ exclude_titles: ['intern', 'C++'] });
  for (const market of ['hong-kong', 'remote', 'uk', 'unknown']) {
    assert.ok(preReviewDecision(job({ market, title: 'Finance INTERN' }), config));
    assert.ok(preReviewDecision(job({ market, title: 'C++ Engineer' }), config));
    assert.equal(preReviewDecision(job({ market, title: 'International Finance Analyst' }), config), null);
    assert.equal(preReviewDecision(job({ market, title: 'C Engineer' }), config), null);
  }
});

test('company and location filters are explicit and do not search unrelated prose', () => {
  const config = campaign({ exclude_companies: ['Example Co'], exclude_locations: ['Paris'] });
  assert.ok(preReviewDecision(job(), config));
  assert.ok(preReviewDecision(job({ company: 'Other', location: 'Paris, France' }), config));
  assert.equal(preReviewDecision(job({ company: 'Other', location: 'London', description: 'Partners with Example Co in Paris.' }), config), null);
  assert.equal(preReviewDecision(job({ company: 'Example Company', location: 'Parisville' }), config), null);
});

test('age filter is opt-in, exact, and honors a trusted repost', () => {
  const config = campaign({ max_posting_age_days: 14 });
  assert.equal(preReviewDecision(job({ posted_at: '2020-01-01' }), campaign(), now), null);
  assert.equal(preReviewDecision(job({ posted_at: '2026-08-27T12:00:00Z' }), config, now), null);
  assert.ok(preReviewDecision(job({ posted_at: '2026-08-27T11:59:59Z' }), config, now));
  assert.equal(preReviewDecision(job({ posted_at: '2020-01-01', reposted_at: '2026-09-09' }), config, now), null);
  assert.equal(preReviewDecision(job({ posted_at: null }), config, now), null);
});

test('pre-review produces persisted-review shape and rule totals', () => {
  const config = campaign({ exclude_titles: ['Intern'] });
  const result = preReviewJobs([job({ id: 7, title: 'Finance Intern' }), job({ id: 8 })], config, now);
  assert.equal(Object.values(result.rules).reduce((a, b) => a + b, 0), 1);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].job_id, 7);
  assert.equal(result.reviews[0].verdict, 'skip');
  assert.ok(result.reviews[0].reason);
});
