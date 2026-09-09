import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkedInCards, fetchLinkedInQuery, linkedinPageBudget } from '../src/connectors/linkedin-guest.mjs';

test('LinkedIn guest cards normalize into jobs', () => {
  const html = `<li><div class="base-card"><a class="base-card__full-link" href="https://hk.linkedin.com/jobs/view/123?trk=x"><h3>AI Engineer</h3></a><h4><a>Example &amp; Co</a></h4><span class="job-search-card__location">Hong Kong</span><time datetime="2026-09-03"></time></div></li>`;
  const jobs = parseLinkedInCards(html, 'linkedin-hk', 'hk');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Example & Co');
  assert.equal(jobs[0].title, 'AI Engineer');
  assert.equal(jobs[0].posted_at, '2026-09-03');
});

test('remote LinkedIn cards preserve the remote-work signal', () => {
  const html = `<li><a class="base-card__full-link" href="https://linkedin.com/jobs/view/2"><h3>AI Engineer</h3></a><h4>Example</h4><span class="job-search-card__location">Asia Pacific</span></li>`;
  const [job] = parseLinkedInCards(html, 'linkedin-remote', 'remote', { remote: true });
  assert.equal(job.remote_scope, 'Remote hiring location: Asia Pacific');
});

test('remote LinkedIn search sends the remote-work filter', async () => {
  const original = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => { requested = new URL(url); return new Response(''); };
  try {
    await fetchLinkedInQuery({ name: 'remote', market: 'remote', keywords: 'AI Engineer', location: 'Asia', remote: true });
    assert.equal(requested.searchParams.get('f_WT'), '2');
  } finally { globalThis.fetch = original; }
});

test('LinkedIn page budget grows for launch backfills', () => {
  assert.equal(linkedinPageBudget(1), 10);
  assert.equal(linkedinPageBudget(7), 25);
  assert.equal(linkedinPageBudget(21), 50);
});

test('LinkedIn retries a rate limit before failing the source', async () => {
  let attempts = 0;
  const waits = [];
  const jobs = await fetchLinkedInQuery(
    { name: 'hk', market: 'hk', keywords: 'AI Engineer', location: 'Hong Kong' },
    {
      maxPages: 1,
      fetchImpl: async () => {
        attempts += 1;
        return attempts === 1
          ? new Response('', { status: 429, headers: { 'retry-after': '1' } })
          : new Response('');
      },
      sleep: async (ms) => waits.push(ms),
    },
  );
  assert.equal(jobs.length, 0);
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [1000]);
});
