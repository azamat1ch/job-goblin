function decode(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function plainText(value = '') {
  return decode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/tr>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function absolute(value, base) {
  return new URL(decode(value), base).href;
}

function mainText(html) {
  const body = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] || html;
  return plainText(body);
}

export function parseScmpList(html) {
  return [...html.matchAll(/onclick=["']window\.open\(["'](https:\/\/corp\.scmp\.com\/job-detail\/[^"']+)["'][\s\S]*?<div\b[^>]*class=["']title-text["'][^>]*>([\s\S]*?)<\/div>/gi)]
    .map((match) => ({ url: decode(match[1]), title: plainText(match[2]) }));
}

export function parseHkustGaiList(html, pageUrl) {
  const jobs = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const links = [...row[1].matchAll(/<a\b[^>]*href=["']([^"']*\/hkgai\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (links.length < 2) continue;
    jobs.push({ reference: plainText(links[0][2]), title: plainText(links[1][2]), url: absolute(links[1][1], pageUrl) });
  }
  return jobs;
}

async function fetchHtml(url, { allowContentOnError = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
      });
      const body = await response.text();
      if (!response.ok && !(allowContentOnError && body)) throw new Error(`HTTP ${response.status}: ${url}`);
      if (!body) throw new Error(`empty response: ${url}`);
      return body;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

async function withDetails(rows, source, company, options = {}) {
  const relevant = [...new Map(rows.map((job) => [job.url, job])).values()];
  const output = new Array(relevant.length);
  let cursor = 0;
  async function worker() {
    while (cursor < relevant.length) {
      const index = cursor++;
      const job = relevant[index];
      let description = '';
      try { description = mainText(await fetchHtml(job.url, options)); } catch { /* keep the live listing */ }
      output[index] = {
        company,
        title: job.title,
        location: 'Hong Kong',
        source,
        source_key: job.reference || job.url,
        source_url: job.url,
        application_url: job.url,
        posted_at: null,
        description: `${description}${job.closes ? `\nApplication closes: ${job.closes}` : ''}`.trim(),
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, relevant.length) }, worker));
  return output;
}

async function fetchScmp() {
  const url = 'https://corp.scmp.com/work-with-us/';
  return withDetails(parseScmpList(await fetchHtml(url)), 'scmp', 'South China Morning Post', { allowContentOnError: true });
}

async function fetchHkustGai() {
  const url = 'https://hkustcareers.hkust.edu.hk/hong-kong-generative-ai-research-and-development-center-limited';
  return withDetails(parseHkustGaiList(await fetchHtml(url), url), 'hkust-gai', 'Hong Kong Generative AI Research and Development Center');
}

export async function fetchHkHtmlCompany(provider) {
  if (provider === 'scmp') return fetchScmp();
  if (provider === 'hkust-gai') return fetchHkustGai();
  throw new Error(`unknown HK HTML provider: ${provider}`);
}
