import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchHkHtmlCompany, parseHkustGaiList, parseScmpList } from '../src/connectors/hk-html-company.mjs';

test('SCMP list cards expose stable employer-hosted links', () => {
  const html = `<div class="title" onclick="window.open('https://corp.scmp.com/job-detail/abc/AI-Engineer', '_blank');"><div class="title-text">AI Engineer</div></div>`;
  assert.deepEqual(parseScmpList(html), [{ url: 'https://corp.scmp.com/job-detail/abc/AI-Engineer', title: 'AI Engineer' }]);
});

test('HKUST Generative AI table pairs reference and role', () => {
  const html = `<tr><td><a href="/center/hkgai0006">HKGAI0006</a></td><td><a href="/center/hkgai0006">Research Engineer (Data Engineer)</a></td><td></td></tr>`;
  assert.deepEqual(parseHkustGaiList(html, 'https://hkust.example/center'), [{
    reference: 'HKGAI0006', title: 'Research Engineer (Data Engineer)', url: 'https://hkust.example/center/hkgai0006',
  }]);
});

test('SCMP fetch retains finance roles through detail hydration', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => ({
    ok: true,
    text: async () => String(url).includes('work-with-us')
      ? `<div onclick="window.open('https://corp.scmp.com/job-detail/finance-manager', '_blank');"><div class="title-text">Finance Manager</div></div>`
      : '<main>Financial reporting and budgeting.</main>',
  }));
  const jobs = await fetchHkHtmlCompany('scmp');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Finance Manager');
  assert.match(jobs[0].description, /Financial reporting/);
});
