import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchRemote3, parseRemote3Feed } from '../src/connectors/remote3.mjs';

const feed = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[Job Application for Lead AI Engineer at Example Labs at Example Labs]]></title>
    <link>https://www.remote3.co/remote-jobs/lead-ai-engineer-example-labs</link>
    <pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate>
    <description><![CDATA[at Example Labs - Full-Time - Worldwide]]></description>
  </item>
  <item>
    <title>Old Backend Engineer at Old Co</title>
    <link>https://www.remote3.co/remote-jobs/old-backend-engineer</link>
    <pubDate>Sat, 01 Aug 2026 00:00:00 GMT</pubDate>
    <description>at Old Co - Full-Time - Europe</description>
  </item>
</channel></rss>`;

test('Remote3 RSS normalizes company, title, geography, and freshness', () => {
  const jobs = parseRemote3Feed(feed, {
    sinceDays: 21,
    now: new Date('2026-09-04T00:00:00Z').valueOf(),
  });
  assert.deepEqual(jobs.map((job) => ({ company: job.company, title: job.title, location: job.location })), [
    { company: 'Example Labs', title: 'Lead AI Engineer', location: 'Worldwide' },
  ]);
  assert.equal(jobs[0].remote_scope, 'Remote hiring location: Worldwide');
  assert.equal(jobs[0].posted_at, '2026-09-01T00:00:00.000Z');
});

test('Remote3 fetch rejects a non-RSS response', async () => {
  await assert.rejects(() => fetchRemote3({
    fetchImpl: async () => ({ ok: true, text: async () => '<html>blocked</html>' }),
  }), /unexpected feed/);
});
