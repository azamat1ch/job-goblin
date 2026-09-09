import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
for (const file of [...files('src'), ...files('scripts')].filter(f => /\.(mjs|js)$/.test(f))) {
  const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
const result = spawnSync(process.execPath, ['--test', ...files('tests').filter(f => f.endsWith('.test.mjs'))], { stdio: 'inherit' });
process.exitCode = result.status || 0;
