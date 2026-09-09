import { parseStructuredJobPage } from './job-detail.mjs';

function text(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function afterCutoff(value, sinceDays) {
  if (!value || sinceDays == null) return true;
  const time = new Date(value).valueOf();
  return Number.isNaN(time) || time >= Date.now() - Number(sinceDays) * 86_400_000;
}

export function parseMillennium(positions, sinceDays) {
  return (positions || []).filter((job) => afterCutoff(job.t_create ? job.t_create * 1000 : null, sinceDays)).map((job) => ({
    company: 'Millennium',
    title: job.name || job.posting_name,
    location: job.location || (job.locations || []).join(', '),
    source: 'millennium',
    source_key: job.ats_job_id || String(job.id),
    source_url: job.canonicalPositionUrl,
    application_url: job.canonicalPositionUrl,
    posted_at: job.t_create ? new Date(job.t_create * 1000).toISOString() : null,
    remote_scope: job.work_location_option || '',
    description: job.job_description || '',
  })).filter((job) => job.title && job.source_url);
}

export function parseSig(items, sinceDays) {
  return (items || []).map((item) => item?.data || item).filter((job) =>
    job && afterCutoff(job.posted_date, sinceDays)).map((job) => ({
    company: job.hiring_organization || 'SIG',
    title: job.title,
    location: job.full_location || [job.city, job.country].filter(Boolean).join(', '),
    source: 'sig',
    source_key: job.req_id || job.slug,
    source_url: `https://careers.sig.com/jobs/${job.slug || job.req_id}`,
    application_url: job.apply_url || `https://careers.sig.com/jobs/${job.slug || job.req_id}`,
    posted_at: job.posted_date || null,
    salary_text: job.salary_value || '',
    description: text(job.description),
  })).filter((job) => job.title && job.source_url);
}

export function parseOptiver(items, details = new Map(), sinceDays) {
  return (items || []).map((job) => {
    const url = new URL(job.href, 'https://www.optiver.com').href;
    const detail = details.get(url) || {};
    return {
      company: 'Optiver',
      title: job.title,
      location: job.location,
      source: 'optiver',
      source_key: String(job.componentID || url),
      source_url: url,
      application_url: detail.application_url || url,
      posted_at: detail.posted_at || null,
      description: detail.description || '',
    };
  }).filter((job) => job.title && job.source_url && afterCutoff(job.posted_at, sinceDays));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

async function fetchMillennium(sinceDays) {
  const positions = [];
  let start = 0;
  let count = 1;
  while (start < count) {
    const url = `https://career.mlp.com/api/apply/v2/jobs?domain=mlp.com&start=${start}&num=10&query=&location=Hong%20Kong`;
    const page = await fetchJson(url);
    positions.push(...(page.positions || []));
    count = Number(page.count || positions.length);
    start += 10;
  }
  const jobs = parseMillennium(positions, sinceDays);
  await Promise.all(jobs.map(async (job) => {
    const detail = parseStructuredJobPage(await fetchHtml(job.source_url), job.source_url);
    job.description = detail.description || job.description;
    job.posted_at = detail.posted_at || job.posted_at;
    job.application_url = detail.application_url || job.application_url;
  }));
  return jobs;
}

async function fetchSig(sinceDays) {
  const data = await fetchJson('https://careers.sig.com/api/jobs?city=Hong%20Kong&page=1&limit=100&sortBy=posted_date&descending=true');
  return parseSig(data.jobs, sinceDays);
}

async function fetchOptiver(sinceDays) {
  const data = await fetchJson('https://optiver.com/en/api/v1/jobs?location=hong-kong');
  const details = new Map();
  await Promise.all((data.items || []).map(async (job) => {
    const url = new URL(job.href, 'https://www.optiver.com').href;
    details.set(url, parseStructuredJobPage(await fetchHtml(url), url));
  }));
  return parseOptiver(data.items, details, sinceDays);
}

export async function fetchDirectCompany(provider, { sinceDays } = {}) {
  if (provider === 'millennium') return fetchMillennium(sinceDays);
  if (provider === 'sig') return fetchSig(sinceDays);
  if (provider === 'optiver') return fetchOptiver(sinceDays);
  throw new Error(`unknown direct company provider: ${provider}`);
}
