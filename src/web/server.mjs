import { createServer } from 'node:http';
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../db/store.mjs';
import yaml from 'js-yaml';

import { ROOT, APP_ROOT } from '../lib/paths.mjs';
import { loadCampaign } from '../lib/campaign.mjs';
import { loadSources } from '../lib/sources.mjs';
const PUBLIC = path.join(APP_ROOT, 'src/web/public');
const ARTIFACTS = path.join(ROOT, 'artifacts');
const FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export function currentSourceHealth(config, recorded, loadPortal) {
  const configured = [...(config.browser || []), ...(config.linkedin || [])].filter(s => s.enabled !== false);
  for (const source of config.automated || []) {
    if (source.enabled === false) continue;
    if (source.kind === 'structured') {
      const portal = loadPortal(source.config) || {};
      configured.push(...(portal.tracked_companies || []), ...(portal.job_boards || []));
    } else configured.push(source);
  }

  const latest = new Map(recorded.map((item) => [item.name.toLowerCase(), item]));
  const seen = new Set();
  return configured.flatMap((source) => {
    const key = source.name?.toLowerCase();
    if (source.enabled === false || !key || seen.has(key)) return [];
    seen.add(key);
    const existing = latest.get(key);
    return [existing || {
      name: source.name, provider: source.kind || source.provider || 'browser', status: 'due', count: 0,
      reason: 'Not checked yet', cadence_days: source.cadence_days || 1, checked_at: null, due: true,
    }];
  });
}

export function startDashboard({ port = 4173 } = {}) {
  const server = createServer((request, response) => {
    try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/config') {
      const campaign = loadCampaign();
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ name: campaign.name, markets: campaign.markets.map(({ id, label }) => ({ id, label })) }));
      return;
    }
    if (url.pathname === '/api/dashboard') {
      const store = new Store(process.env.JOBS_DB ? path.resolve(process.env.JOBS_DB) : undefined);
      try {
        const data = store.dashboard({
          market: url.searchParams.get('market'), stage: url.searchParams.get('stage'),
          priority: url.searchParams.get('priority'), fit: url.searchParams.get('fit'), view: url.searchParams.get('view'),
          query: url.searchParams.get('query'), company: url.searchParams.get('company'), sort: url.searchParams.get('sort') || 'fit',
          limit: Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 20, 5000)),
          offset: Math.max(0, Number(url.searchParams.get('offset')) || 0),
        });
        const config = loadSources();
        data.sourceHealth = currentSourceHealth(config, data.sourceHealth, (file) => (
          yaml.load(readFileSync(path.resolve(ROOT, file), 'utf8')) || {}
        ));
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(data));
      } finally { store.close(); }
      return;
    }
    if (url.pathname === '/api/stats') {
      const store = new Store(process.env.JOBS_DB ? path.resolve(process.env.JOBS_DB) : undefined);
      try {
        const data = store.stats({ days: Math.max(7, Math.min(Number(url.searchParams.get('days')) || 30, 180)) });
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(data));
      } finally { store.close(); }
      return;
    }
    if (url.pathname.startsWith('/api/job/')) {
      const store = new Store(process.env.JOBS_DB ? path.resolve(process.env.JOBS_DB) : undefined);
      try {
        const data = store.detail(url.pathname.split('/').pop());
        if (data) {
          const folder = path.join(ARTIFACTS, String(data.job.id));
          try {
            data.artifacts = readdirSync(folder, { withFileTypes: true })
              .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
              .map((entry) => ({ name: entry.name, url: `/artifacts/${data.job.id}/${encodeURIComponent(entry.name)}` }));
          } catch { data.artifacts = []; }
        }
        response.writeHead(data ? 200 : 404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(data || { error: 'Job not found' }));
      } finally { store.close(); }
      return;
    }
    const artifactMatch = url.pathname.match(/^\/artifacts\/(\d+)\/([^/]+)$/);
    if (artifactMatch) {
      let name;
      try { name = decodeURIComponent(artifactMatch[2]); } catch { name = ''; }
      if (!name || name !== path.basename(name) || name.startsWith('.')) { response.writeHead(404); response.end('Not found'); return; }
      const file = path.join(ARTIFACTS, artifactMatch[1], name);
      try {
        const root = realpathSync(path.join(ARTIFACTS, artifactMatch[1]));
        if (lstatSync(file).isSymbolicLink() || !realpathSync(file).startsWith(`${root}${path.sep}`)) throw new Error('unsafe artifact path');
        const type = new Map([['.pdf', 'application/pdf'], ['.md', 'text/markdown; charset=utf-8'], ['.txt', 'text/plain; charset=utf-8'], ['.json', 'application/json; charset=utf-8']]).get(path.extname(name).toLowerCase()) || 'application/octet-stream';
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        response.end(readFileSync(file));
      } catch { response.writeHead(404); response.end('Not found'); }
      return;
    }
    const file = FILES.get(url.pathname);
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(PUBLIC, file[0])));
    } catch (error) {
      console.error(`Dashboard request failed: ${error.message}`);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: 'Unable to load workspace. Check the dashboard terminal and configuration.' }));
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Job dashboard: http://127.0.0.1:${port}`));
  return server;
}
