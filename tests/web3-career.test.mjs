import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchWeb3Career, parseWeb3CareerPage } from '../src/connectors/web3-career.mjs';

const row = ({ id, slug, title, company, location, date, salary = '' }) => `
  <tr data-jobid=${id} onclick="tableTurboRowClick(event, '/${slug}/${id}')" class="job-row-grid table_row">
    <td><a href="/${slug}/${id}"><h2 class="job-title-truncate">${title}</h2></a>
      <h3>${company}</h3><span class=job-location-mobile><span>📍</span><a href="/web3-jobs-anywhere">${location}</a></span></td>
    <td><time datetime="${date}">today</time></td>
    <td><p class="mb-0 text-salary">${salary}</p></td>
  </tr>`;

test('Web3.Career parses its server-rendered job rows', () => {
  const jobs = parseWeb3CareerPage(row({
    id: 42,
    slug: 'ai-platform-engineer-example',
    title: 'AI Platform Engineer',
    company: 'Example &amp; Labs',
    location: 'Worldwide',
    date: '2026-09-03 09:09:38+07:00',
    salary: '$100k - $140k',
  }));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Example & Labs');
  assert.equal(jobs[0].source_key, '42');
  assert.equal(jobs[0].source_url, 'https://web3.career/ai-platform-engineer-example/42');
  assert.equal(jobs[0].remote_scope, 'Remote hiring location: Worldwide');
  assert.equal(jobs[0].salary_text, '$100k - $140k');
  assert.equal(jobs[0].posted_at, '2026-09-03T02:09:38.000Z');
});

test('Web3.Career fetch deduplicates categories and stops once a page crosses the window', async () => {
  const calls = [];
  const fresh = row({ id: 7, slug: 'backend-engineer-example', title: 'Backend Engineer', company: 'Example', location: 'Remote', date: '2026-09-03 00:00:00+00:00' });
  const old = row({ id: 8, slug: 'old-engineer-example', title: 'Old Engineer', company: 'Example', location: 'Remote', date: '2026-07-01 00:00:00+00:00' });
  const jobs = await fetchWeb3Career({
    sinceDays: 21,
    paths: ['/backend+remote-jobs', '/ai+remote-jobs'],
    maxPages: 2,
    now: new Date('2026-09-04T00:00:00Z').valueOf(),
    sleep: async () => {},
    fetchImpl: async (url) => {
      calls.push(String(url));
      return { ok: true, text: async () => fresh + old };
    },
  });
  assert.equal(jobs.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((url) => url.includes('page=2')), false);
});
