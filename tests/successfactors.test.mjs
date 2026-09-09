import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanCsbLocation, parseCsbDate, parseCsbJobs, parseTiles } from '../src/connectors/providers/successfactors.mjs';

test('SuccessFactors parses slash dates using the response locale', () => {
  assert.equal(new Date(parseCsbDate('6/18/26', 'en_US')).toISOString(), '2026-06-18T00:00:00.000Z');
  assert.equal(new Date(parseCsbDate('17/07/2026', 'en_GB')).toISOString(), '2026-07-17T00:00:00.000Z');
});

test('SuccessFactors passes the locale through while parsing CSB jobs', () => {
  const [job] = parseCsbJobs({
    jobSearchResult: [{ response: {
      id: '56756',
      unifiedStandardTitle: 'Associate Director',
      unifiedUrlTitle: 'Associate-Director',
      unifiedStandardStart: '17/07/2026',
    } }],
  }, { origin: 'https://jobs.standardchartered.com' }, 'en_GB');

  assert.equal(new Date(job.postedAt).toISOString(), '2026-07-17T00:00:00.000Z');
});

test('SuccessFactors normalizes HKG so Hong Kong filtering keeps CSB jobs', () => {
  assert.equal(cleanCsbLocation(['Central, HKG ']), 'Central, Hong Kong');
});

test('SuccessFactors RMK tiles prefer full location and preserve posting date', () => {
  const [job] = parseTiles(`
    <li class="job-tile job-id-123" data-url="/job/Data-Engineer/123/">
      <a class="jobTitle-link">Data Engineer</a>
      <div id="job-123-desktop-section-location-value">Sha Tin, New Territories, HK</div>
      <div id="job-123-desktop-section-city-value">Sha Tin</div>
      <div id="job-123-desktop-section-date-value">Sep 3, 2026</div>
    </li>`, 'https://example.com');

  assert.equal(job.location, 'Sha Tin, New Territories, HK');
  assert.equal(new Date(job.postedAt).toISOString(), '2026-09-03T00:00:00.000Z');
});
