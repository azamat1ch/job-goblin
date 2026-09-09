import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTwoSigmaFeed } from '../src/connectors/two-sigma.mjs';

const feed = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[Machine Learning Engineer &amp; Researcher]]></title>
    <description><![CDATA[Hong Kong SAR Hong Kong]]></description>
    <guid isPermaLink="true">https://careers.twosigma.com/careers/JobDetail/Hong-Kong-Machine-Learning-Engineer/14001</guid>
    <link>https://careers.twosigma.com/careers/JobDetail/Hong-Kong-Machine-Learning-Engineer/14001</link>
    <pubDate>Tue, 01 Sep 2026 00:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Old Data Engineer</title><description>Hong Kong</description>
    <link>https://careers.twosigma.com/careers/JobDetail/Hong-Kong-Old-Data-Engineer/13001</link>
    <pubDate>Sat, 01 Aug 2026 00:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Software Engineer</title><description>United States New York</description>
    <link>https://careers.twosigma.com/careers/JobDetail/New-York-Software-Engineer/14002</link>
    <pubDate>Tue, 01 Sep 2026 00:00:00 +0000</pubDate>
  </item>
</channel></rss>`;

test('Two Sigma RSS keeps fresh Hong Kong roles and direct links', () => {
  const jobs = parseTwoSigmaFeed(feed, {
    sinceDays: 21,
    now: new Date('2026-09-03T00:00:00Z').valueOf(),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Machine Learning Engineer & Researcher');
  assert.equal(jobs[0].source_key, '14001');
  assert.equal(jobs[0].source_url, jobs[0].application_url);
  assert.equal(jobs[0].posted_at, '2026-09-01T00:00:00.000Z');
});
