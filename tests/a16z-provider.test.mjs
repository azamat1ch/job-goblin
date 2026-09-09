import test from 'node:test';
import assert from 'node:assert/strict';
import provider from '../src/connectors/providers/a16z-speedrun-talent.mjs';

function row(id) {
  return { id, title: `Engineer ${id}`, company: 'Example', url: `https://speedrun-talent-network.com/jobs/${id}`, location: 'London' };
}

test('a16z feed follows current 50-row pagination and sends configured filters', async () => {
  const urls = [];
  const jobs = await provider.fetch({
    name: 'a16z', max_pages: 3, fn: 'engineering,research', sort: 'new', remote: true,
  }, {
    async fetchJson(url) {
      urls.push(new URL(url));
      return urls.length === 1
        ? { jobs: Array.from({ length: 50 }, (_, index) => row(index)), total: 51, total_pages: 2 }
        : { jobs: [row(50)], total: 51, total_pages: 2 };
    },
  });
  assert.equal(jobs.length, 51);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get('fn'), 'engineering,research');
  assert.equal(urls[0].searchParams.get('sort'), 'new');
  assert.equal(urls[0].searchParams.get('remote'), '1');
  assert.equal(urls[1].searchParams.get('page'), '1');
});
