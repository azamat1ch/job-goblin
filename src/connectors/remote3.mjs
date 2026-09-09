const FEED_URL = 'https://www.remote3.co/api/rss';

function decode(value = '') {
  return String(value)
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function field(block, name) {
  return decode(block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]);
}

function freshEnough(value, sinceDays, now) {
  if (!value || sinceDays == null) return true;
  const timestamp = new Date(value).valueOf();
  return Number.isNaN(timestamp) || timestamp >= now - Number(sinceDays) * 86_400_000;
}

function cleanTitle(rawTitle, company) {
  let title = rawTitle.replace(/^Job Application for\s+/i, '').trim();
  if (!company) return title;
  const suffix = new RegExp(`\\s+at\\s+${company.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'i');
  while (suffix.test(title)) title = title.replace(suffix, '').trim();
  return title;
}

export function parseRemote3Feed(xml, { sinceDays, now = Date.now() } = {}) {
  const jobs = [];
  for (const match of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const sourceUrl = field(block, 'link') || field(block, 'guid');
    const postedAt = field(block, 'pubDate');
    const summary = field(block, 'description');
    const company = summary.match(/^at\s+(.+?)\s+-\s+/i)?.[1]?.trim() || 'Remote3 employer';
    const parts = summary.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
    const location = parts.length >= 3 ? parts.at(-1) : 'Remote';
    const title = cleanTitle(field(block, 'title'), company);
    if (!title || !sourceUrl || !freshEnough(postedAt, sinceDays, now)) continue;
    jobs.push({
      company,
      title,
      location,
      remote_scope: `Remote hiring location: ${location || 'geography unspecified'}`,
      source: 'remote3',
      source_key: sourceUrl,
      source_url: sourceUrl,
      application_url: sourceUrl,
      posted_at: postedAt ? new Date(postedAt).toISOString() : null,
      description: '',
      market: 'remote',
    });
  }
  return jobs;
}

export async function fetchRemote3({ sinceDays, fetchImpl = fetch, now = Date.now() } = {}) {
  const response = await fetchImpl(FEED_URL, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'application/rss+xml, application/xml', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
  });
  if (!response.ok) throw new Error(`Remote3 HTTP ${response.status}`);
  const xml = await response.text();
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) throw new Error('Remote3 returned an unexpected feed');
  return parseRemote3Feed(xml, { sinceDays, now });
}
