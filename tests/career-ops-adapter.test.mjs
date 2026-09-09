import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { loadProviders } from '../src/connectors/providers/_registry.mjs';

import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchCareerOps, keepForMarket } from '../src/connectors/structured.mjs';
import workday from '../src/connectors/providers/workday.mjs';

test('geography is explicit and unknown locations survive', () => {
  for (const location of ['Toronto', 'Tokyo', 'London', '', '4 Locations']) {
    assert.equal(keepForMarket({ location }, {}, 'global'), true);
  }
  const entry = { location_terms: ['Hong Kong', 'Kowloon'] };
  assert.equal(keepForMarket({ location: 'London' }, entry, 'hk'), false);
  assert.equal(keepForMarket({ location: 'Hong Kong / Singapore' }, entry, 'hk'), true);
  assert.equal(keepForMarket({ location: '' }, entry, 'hk'), true);
  assert.equal(keepForMarket({ location: '4 Locations' }, entry, 'hk'), true);
  assert.equal(keepForMarket({ location: 'Canada' }, { location_terms: ['Canada'] }, 'global'), true);
  assert.equal(keepForMarket({ location: 'Dubai' }, { location_terms: ['UK'] }, 'global'), false);
});

test('Workday can discover and apply a Hong Kong country facet before paging', async () => {
  const bodies = [];
  const responses = [
    {
      total: 800,
      jobPostings: [{ title: 'US role', externalPath: '/job/New-York/US-role_1', locationsText: 'New York' }],
      facets: [{ facetParameter: 'country', descriptor: 'Country', values: [
        { descriptor: 'Hong Kong', id: 'hk-id', count: 2 },
      ] }],
    },
    {
      total: 1,
      jobPostings: [{ title: 'AI Engineer', externalPath: '/job/Hong-Kong/AI-Engineer_2', locationsText: 'Hong Kong', postedOn: 'Posted Today' }],
      facets: [],
    },
  ];
  const jobs = await workday.fetch({
    name: 'Example', careers_url: 'https://example.wd1.myworkdayjobs.com/Jobs',
    search_text: 'AI', location_text: 'Hong Kong',
  }, {
    fetchJson: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return responses.shift();
    },
    sleep: async () => {},
  });

  assert.deepEqual(bodies[0].appliedFacets, {});
  assert.deepEqual(bodies[1].appliedFacets, { country: ['hk-id'] });
  assert.deepEqual(jobs.map((job) => job.title), ['AI Engineer']);
});

test('Workday marks a result window that stops at its configured cap', async () => {
  const jobs = await workday.fetch({
    name: 'Example', careers_url: 'https://example.wd1.myworkdayjobs.com/Jobs',
    search_text: 'AI Engineer', max_pages: 1,
  }, {
    fetchJson: async () => ({
      total: 80,
      jobPostings: [{ title: 'AI Engineer', externalPath: '/job/AI-Engineer_2', locationsText: 'London' }],
    }),
    sleep: async () => {},
  });
  assert.equal(jobs.workdayTruncated, true);
});

test('every consolidated provider imports and registers', async () => {
  const dir = new URL('../src/connectors/providers/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.mjs') && !name.startsWith('_'));
  const providers = await loadProviders(dir.pathname);
  assert.equal(providers.size, files.length);
});

test('assembled structured scan preserves finance roles and disables inactive sources', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'connector-scan-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'sources.yml');
  writeFileSync(configPath, JSON.stringify({ tracked_companies: [
    { name: 'Bank', provider: 'greenhouse', careers_url: 'https://boards.greenhouse.io/bank' },
    { name: 'Inactive', enabled: false, provider: 'greenhouse', careers_url: 'https://boards.greenhouse.io/inactive' },
  ] }));
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return { ok: true, json: async () => ({ jobs: [
      { id: 1, title: 'Credit Risk Manager', absolute_url: 'https://example.com/credit', location: { name: 'Toronto' } },
      { id: 2, title: 'Financial Analyst', absolute_url: 'https://example.com/analyst', location: { name: '' } },
    ] }) };
  });
  const result = await fetchCareerOps({ configPath, market: 'global' });
  assert.equal(requests.length, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'ok');
  assert.deepEqual(result[0].jobs.map((job) => job.title), ['Credit Risk Manager', 'Financial Analyst']);
});
