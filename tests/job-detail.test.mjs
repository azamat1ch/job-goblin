import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobPage, parseLinkedInJobPage, parseRemote3JobPage, parseStructuredJobPage } from '../src/connectors/job-detail.mjs';

test('LinkedIn detail keeps the description and employer apply route', () => {
  const html = `<div class="show-more-less-html__markup relative"><p>Build RAG.</p><ul><li>Use Python</li></ul></div>
    <a href="https://company.example/apply?id=7&amp;src=li" data-tracking-control-name="public_jobs_apply-link-offsite">Apply</a>`;
  const detail = parseLinkedInJobPage(html, 'https://linkedin.com/jobs/view/7');
  assert.equal(detail.description, 'Build RAG.\n• Use Python');
  assert.equal(detail.application_url, 'https://company.example/apply?id=7&src=li');
});

test('JSON-LD job pages provide description, date, location, and direct URL', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting', description: '<p>Ship ML systems.</p>', datePosted: '2026-09-02',
    url: '/apply/1', jobLocation: { address: { addressLocality: 'Dubai', addressCountry: 'AE' } },
  })}</script>`;
  const detail = parseStructuredJobPage(html, 'https://company.example/jobs/1');
  assert.equal(detail.description, 'Ship ML systems.');
  assert.equal(detail.posted_at, '2026-09-02');
  assert.equal(detail.location, 'Dubai, AE');
  assert.equal(detail.application_url, 'https://company.example/apply/1');
});

test('detail parser follows the current page URL', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting', description: '<p>Employer detail.</p>', url: '/apply',
  })}</script>`;
  assert.equal(parseJobPage(html, 'https://company.example/jobs/1').description, 'Employer detail.');
  assert.equal(parseJobPage('<div class="show-more-less-html__markup">LinkedIn detail.</div>', 'https://www.linkedin.com/jobs/view/1').description, 'LinkedIn detail.');
});

test('Remote3 detail reads streamed JSON-LD and the direct employer apply URL', () => {
  const posting = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'JobPosting',
    description: '<p>Operate secure cloud systems.</p>', datePosted: '2026-09-01T10:00:00Z',
    applicantLocationRequirements: { '@type': 'Country', name: 'US' },
  });
  const payload = `16:T${Buffer.byteLength(posting).toString(16)},${posting}\n6:["job",{"location":"Worldwide","apply_url":"https://company.example/jobs/7?src=remote3"}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
  const detail = parseRemote3JobPage(html, 'https://remote3.co/remote-jobs/example');
  assert.equal(detail.description, 'Operate secure cloud systems.');
  assert.equal(detail.posted_at, '2026-09-01T10:00:00Z');
  assert.equal(detail.location, 'Worldwide');
  assert.equal(detail.application_url, 'https://company.example/jobs/7?src=remote3');
});
