const ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

function decode(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function match(block, regex) {
  return decode(block.match(regex)?.[1] || '');
}

export function parseLinkedInCards(html, sourceKey, market, { remote = false } = {}) {
  const blocks = html.split(/<li>/i).slice(1);
  const jobs = [];
  for (const block of blocks) {
    const url = match(block, /<a[^>]+(?:base-card__full-link|base-card__full-link[^>]*)[^>]+href="([^"]+)"/i)
      || match(block, /<a[^>]+href="([^"]+)"[^>]+(?:base-card__full-link)/i);
    const title = match(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!url || !title) continue;
    const location = match(block, /<span[^>]+job-search-card__location[^>]*>([\s\S]*?)<\/span>/i);
    jobs.push({
      title,
      company: match(block, /<h4[^>]*>([\s\S]*?)<\/h4>/i),
      location,
      remote_scope: remote ? `Remote hiring location: ${location || 'geography unspecified'}` : '',
      posted_at: block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] || null,
      source: 'linkedin_guest',
      source_key: sourceKey,
      source_url: url,
      application_url: url,
      market,
    });
  }
  return jobs;
}

export function linkedinPageBudget(days) {
  const window = Math.max(1, Number(days) || 1);
  if (window <= 1) return 10;
  if (window <= 7) return 25;
  return 50;
}

async function requestPage(url, fetchImpl, sleep) {
  let lastStatus;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return response;
    lastStatus = response.status;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30_000)
      : 2_000 * 2 ** attempt);
  }
  throw new Error(`LinkedIn HTTP ${lastStatus}`);
}

export async function fetchLinkedInQuery(query, {
  days = 1,
  maxPages = linkedinPageBudget(days),
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const seconds = Math.min(Math.max(Number(days), 1), 30) * 86_400;
  const jobs = [];
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('keywords', query.keywords);
    url.searchParams.set('location', query.location);
    url.searchParams.set('f_TPR', `r${seconds}`);
    if (query.remote) url.searchParams.set('f_WT', '2');
    url.searchParams.set('start', String(page * 10));
    if (page > 0) await sleep(350);
    const response = await requestPage(url, fetchImpl, sleep);
    const pageJobs = parseLinkedInCards(await response.text(), query.name, query.market, { remote: Boolean(query.remote) });
    jobs.push(...pageJobs);
    if (pageJobs.length < 10) return jobs;
  }
  jobs.truncated = true;
  return jobs;
}
