function decode(value = '') {
  return String(value)
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function field(item, name) {
  return decode(item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]);
}

function freshEnough(value, sinceDays, now) {
  if (!value || sinceDays == null) return true;
  const timestamp = new Date(value).valueOf();
  return Number.isNaN(timestamp) || timestamp >= now - Number(sinceDays) * 86_400_000;
}

export function parseTwoSigmaFeed(xml, { sinceDays, now = Date.now() } = {}) {
  const jobs = [];
  for (const match of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = field(match[1], 'title');
    const location = field(match[1], 'description');
    const sourceUrl = field(match[1], 'link') || field(match[1], 'guid');
    const postedAt = field(match[1], 'pubDate');
    if (!title || !sourceUrl || !/hong kong/i.test(location)) continue;
    if (!freshEnough(postedAt, sinceDays, now)) continue;
    jobs.push({
      company: 'Two Sigma',
      title,
      location,
      source: 'two-sigma',
      source_key: sourceUrl.match(/\/(\d+)\/?(?:[?#].*)?$/)?.[1] || sourceUrl,
      source_url: sourceUrl,
      application_url: sourceUrl,
      posted_at: postedAt ? new Date(postedAt).toISOString() : null,
      description: '',
    });
  }
  return jobs;
}

export async function fetchTwoSigma({ sinceDays } = {}) {
  const url = 'https://careers.twosigma.com/careers/OpenRoles/feed/?jobRecordsPerPage=100';
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'application/rss+xml, application/xml', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return parseTwoSigmaFeed(await response.text(), { sinceDays });
}
