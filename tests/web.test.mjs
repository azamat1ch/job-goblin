import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { currentSourceHealth, startDashboard } from '../src/web/server.mjs';
import { Store } from '../src/db/store.mjs';
import { normalizeJob } from '../src/lib/jobs.mjs';

test('dashboard reports only configured sources and matches names case-insensitively', () => {
  const config = {
    browser: [{ name: 'Cyberport', cadence_days: 2 }],
    automated: [{ kind: 'direct_company', name: 'Example Board', market: 'hk' }],
  };
  const recorded = [
    { name: 'cyberport', status: 'ok', count: 1 },
    { name: 'removed-source', status: 'failed', count: 0 },
  ];
  const result = currentSourceHealth(config, recorded, () => ({
    tracked_companies: [{ name: 'Example Board' }],
  }));

  assert.deepEqual(result.map((source) => source.name), ['cyberport', 'Example Board']);
  assert.equal(result[0].status, 'ok');
  assert.equal(result[1].status, 'due');
});

test('dashboard deduplicates the same configured source', () => {
  const config = {
    browser: [{ name: 'Example' }],
    automated: [{ name: 'example', kind: 'custom' }],
  };
  assert.equal(currentSourceHealth(config, [], () => ({})).length, 1);
});

test('dashboard HTTP API honors bounded result limits and rejects artifact traversal', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'job-search-web-'));
  const previous = process.env.JOBS_DB;
  process.env.JOBS_DB = path.join(dir, 'jobs.db');
  const store = new Store(process.env.JOBS_DB);
  for (let index = 1; index <= 3; index += 1) {
    store.upsert(normalizeJob({
      company: `Company ${index}`, title: 'AI Engineer', location: 'Hong Kong', market: 'hk',
      posted_at: new Date().toISOString(), url: `https://example.com/jobs/${index}`,
    }));
  }
  store.close();
  const server = startDashboard({ port: 0 });
  try {
    await once(server, 'listening');
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard?market=hk&stage=new&limit=2`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.total, 3);
    assert.equal(data.jobs.length, 2);
    assert.equal(data.truncated, true);
    const traversal = await fetch(`http://127.0.0.1:${port}/artifacts/1/%2E%2E%2Fconfig%2Fprivate%2Fprofile.yml`);
    assert.equal(traversal.status, 404);
  } finally {
    server.close();
    if (previous === undefined) delete process.env.JOBS_DB; else process.env.JOBS_DB = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
