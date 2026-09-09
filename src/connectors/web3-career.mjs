const BASE_URL = 'https://web3.career';

export const DEFAULT_PATHS = ['/remote-jobs'];

function decode(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateValue(value) {
  if (!value) return null;
  const normalized = value.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  const timestamp = new Date(normalized).valueOf();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function rowLocation(row) {
  const start = row.search(/job-location-mobile/i);
  if (start < 0) return '';
  const block = row.slice(start);
  const linked = block.match(/href=(?:"|')?\/web3-jobs-[^\s"'>]+(?:"|')?[^>]*>([\s\S]*?)<\/a>/i)?.[1];
  if (linked) return decode(linked);
  const plain = block.match(/<span[^>]+style=(?:"|')[^"']*font-size:\s*12px[^"']*(?:"|')[^>]*>([\s\S]*?)<\/span>/i)?.[1];
  return decode(plain);
}

export function parseWeb3CareerPage(html) {
  const jobs = [];
  for (const match of String(html).matchAll(/<tr\b([^>]*\bdata-jobid=(?:"|')?(\d+)(?:"|')?[^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const [attributes, sourceKey, row] = [match[1], match[2], match[3]];
    if (!/\bjob-row-grid\b|\btable_row\b/i.test(attributes)) continue;
    const path = attributes.match(/tableTurboRowClick\(event,\s*'([^']+)'\)/i)?.[1]
      || row.match(/href=(?:"|')([^"']+\/\d+)(?:"|')/i)?.[1];
    const title = decode(row.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
    const company = decode(row.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    if (!path || !title || !company) continue;
    const sourceUrl = new URL(path, BASE_URL).toString();
    const postedRaw = row.match(/<time\b[^>]*datetime=(?:"|')([^"']+)(?:"|')/i)?.[1] || '';
    const postedTimestamp = dateValue(postedRaw);
    const location = rowLocation(row) || 'Remote';
    jobs.push({
      company,
      title,
      location,
      remote_scope: `Remote hiring location: ${location || 'geography unspecified'}`,
      salary_text: decode(row.match(/<p\b[^>]*\bclass=(?:"|')[^"']*text-salary[^"']*(?:"|')[^>]*>([\s\S]*?)<\/p>/i)?.[1]),
      source: 'web3-career',
      source_key: sourceKey,
      source_url: sourceUrl,
      application_url: sourceUrl,
      posted_at: postedTimestamp == null ? null : new Date(postedTimestamp).toISOString(),
      description: '',
      market: 'remote',
    });
  }
  return jobs;
}

export async function fetchWeb3Career({
  sinceDays,
  paths = DEFAULT_PATHS,
  maxPages = 2,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now(),
} = {}) {
  const cutoff = sinceDays == null ? null : now - Number(sinceDays) * 86_400_000;
  const byUrl = new Map();
  for (const path of paths) {
    for (let page = 1; page <= maxPages; page += 1) {
      if (page > 1 || byUrl.size) await sleep(200);
      const url = new URL(path, BASE_URL);
      if (page > 1) url.searchParams.set('page', String(page));
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
      });
      if (!response.ok) throw new Error(`Web3.Career HTTP ${response.status}: ${url}`);
      const html = await response.text();
      const rows = parseWeb3CareerPage(html);
      if (!rows.length) {
        if (page === 1) throw new Error(`Web3.Career parsed 0 jobs: ${url.pathname}`);
        break;
      }
      for (const job of rows) {
        const timestamp = dateValue(job.posted_at);
        if (cutoff == null || timestamp == null || timestamp >= cutoff) byUrl.set(job.source_url, job);
      }
      const dated = rows.map((job) => dateValue(job.posted_at)).filter((value) => value != null);
      if (cutoff != null && dated.some((value) => value < cutoff)) break;
    }
  }
  return [...byUrl.values()];
}
