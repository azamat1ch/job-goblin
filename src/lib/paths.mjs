import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ROOT = process.env.JOBS_ROOT ? path.resolve(process.env.JOBS_ROOT) : APP_ROOT;
