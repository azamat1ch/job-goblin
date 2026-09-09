import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWellfoundPage, parseWellfoundPages } from '../src/connectors/wellfound-page.mjs';

test('Wellfound page data becomes canonical remote jobs', () => {
  const page = {
    props: { pageProps: { apolloState: { data: {
      'JobListingSearchResult:42': {
        __typename: 'JobListingSearchResult',
        id: '42',
        slug: 'machine-learning-engineer',
        title: 'Machine Learning Engineer',
        locationNames: [],
        acceptedRemoteLocationNames: ['Asia'],
        liveStartAt: 1788293954,
        compensation: '$80k – $120k',
        description: 'Build production models.',
      },
      'StartupResult:7': {
        __typename: 'StartupResult',
        id: '7',
        name: 'Example AI',
        slug: 'example-ai',
        highlightedJobListings: [{ __ref: 'JobListingSearchResult:42' }],
      },
    } } } },
  };

  assert.deepEqual(parseWellfoundPage(page), [{
    company: 'Example AI',
    title: 'Machine Learning Engineer',
    location: 'Remote',
    source: 'wellfound',
    source_key: 'example-ai',
    source_url: 'https://wellfound.com/jobs/42-machine-learning-engineer',
    application_url: 'https://wellfound.com/jobs/42-machine-learning-engineer',
    posted_at: new Date(1788293954 * 1000).toISOString(),
    salary_text: '$80k – $120k',
    remote_scope: 'Remote hiring locations: Asia',
    description: 'Build production models.',
  }]);
});

test('Wellfound jobs without a company link are ignored', () => {
  const page = { props: { pageProps: { apolloState: { data: {
    'JobListingSearchResult:42': {
      __typename: 'JobListingSearchResult', id: '42', slug: 'role', title: 'AI Engineer',
    },
  } } } } };
  assert.deepEqual(parseWellfoundPage(page), []);
});

test('Wellfound preserves onsite jobs and does not mislabel them as remote', () => {
  const page = { props: { pageProps: { apolloState: { data: {
    'JobListingSearchResult:42': {
      __typename: 'JobListingSearchResult', id: '42', slug: 'ai-engineer',
      title: 'AI Engineer', locationNames: ['Hong Kong'], remote: true, remoteConfig: { kind: 'ONSITE' },
    },
    'StartupResult:7': {
      __typename: 'StartupResult', id: '7', name: 'Example AI',
      highlightedJobListings: [{ __ref: 'JobListingSearchResult:42' }],
    },
  } } } } };

  const jobs = parseWellfoundPage(page);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, 'Hong Kong');
  assert.equal(jobs[0].remote_scope, '');
});

test('Wellfound pagination is flattened and deduplicated', () => {
  const job = {
    __typename: 'JobListingSearchResult', id: '42', slug: 'ai-engineer',
    title: 'AI Engineer', liveStartAt: 1788293954,
  };
  const company = {
    __typename: 'StartupResult', id: '7', name: 'Example AI', slug: 'example-ai',
    highlightedJobListings: [{ __ref: 'JobListingSearchResult:42' }],
  };
  const page = { props: { pageProps: { apolloState: { data: {
    'JobListingSearchResult:42': job,
    'StartupResult:7': company,
  } } } } };
  const jobs = parseWellfoundPages([page, page]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, '');
  assert.equal(jobs[0].remote_scope, '');
});
