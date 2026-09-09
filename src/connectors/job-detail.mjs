function decode(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function plainText(value = '') {
  return decode(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function absoluteUrl(value, base) {
  try { return new URL(decode(value), base).href; } catch { return null; }
}

function locationText(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.map((row) => {
    const address = row?.address || row;
    return [address?.addressLocality, address?.addressRegion, address?.addressCountry?.name || address?.addressCountry]
      .filter(Boolean).join(', ');
  }).filter(Boolean).join(' / ');
}

function jobPostingNodes(value) {
  if (Array.isArray(value)) return value.flatMap(jobPostingNodes);
  if (!value || typeof value !== 'object') return [];
  const ownType = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  return [...(ownType.includes('JobPosting') ? [value] : []), ...jobPostingNodes(value['@graph'])];
}

export function parseStructuredJobPage(html, pageUrl) {
  const nodes = [];
  const script = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = script.exec(html)) !== null) {
    try { nodes.push(...jobPostingNodes(JSON.parse(match[1]))); } catch { /* ignore invalid site data */ }
  }
  const node = nodes[0];
  if (!node) return {};
  const apply = absoluteUrl(node.url || node.sameAs || '', pageUrl);
  return {
    description: plainText(node.description),
    posted_at: node.datePosted || null,
    location: locationText(node.jobLocation),
    application_url: apply,
  };
}

export function parseLinkedInJobPage(html, pageUrl) {
  const description = html.match(/<div class="show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const offsite = html.match(/<a[^>]+href="([^"]+)"[^>]+data-tracking-control-name="public_jobs_apply-link-offsite"/i)?.[1]
    || html.match(/<a[^>]+data-tracking-control-name="public_jobs_apply-link-offsite"[^>]+href="([^"]+)"/i)?.[1];
  return { description: plainText(description), application_url: absoluteUrl(offsite, pageUrl) };
}

function nextFlightText(html) {
  const chunks = [];
  const script = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)<\/script>/g;
  let match;
  while ((match = script.exec(html)) !== null) {
    try { chunks.push(JSON.parse(match[1])); } catch { /* ignore malformed stream chunks */ }
  }
  return chunks.join('');
}

function nextFlightTextRecords(stream) {
  const records = [];
  const buffer = Buffer.from(stream);
  const marker = /(?:^|\n)([0-9a-f]+):T([0-9a-f]+),/gi;
  let match;
  while ((match = marker.exec(stream)) !== null) {
    const start = match.index + match[0].length;
    const byteStart = Buffer.byteLength(stream.slice(0, start));
    const byteLength = Number.parseInt(match[2], 16);
    records.push(buffer.subarray(byteStart, byteStart + byteLength).toString());
  }
  return records;
}

export function parseRemote3JobPage(html, pageUrl) {
  const stream = nextFlightText(html);
  let posting = null;
  for (const record of nextFlightTextRecords(stream)) {
    try {
      const candidate = JSON.parse(record);
      if (jobPostingNodes(candidate).length) {
        posting = jobPostingNodes(candidate)[0];
        break;
      }
    } catch { /* text records also contain HTML descriptions */ }
  }
  const apply = stream.match(/"apply_url":"([^"]+)"/i)?.[1] || '';
  const boardLocation = stream.match(/"location":"([^"]+)"/i)?.[1] || '';
  return {
    description: plainText(posting?.description),
    posted_at: posting?.datePosted || stream.match(/"live_at":"([^"]+)"/i)?.[1] || null,
    location: decode(boardLocation) || locationText(posting?.jobLocation || posting?.applicantLocationRequirements),
    application_url: absoluteUrl(apply, pageUrl),
  };
}

export function parseJobPage(html, pageUrl) {
  const hostname = new URL(pageUrl).hostname;
  if (/linkedin\.com$/i.test(hostname)) return parseLinkedInJobPage(html, pageUrl);
  if (/(?:^|\.)remote3\.co$/i.test(hostname)) return parseRemote3JobPage(html, pageUrl);
  if (/janestreet\.com$/i.test(hostname)) return parseJaneStreetPage(html, pageUrl);
  return parseStructuredJobPage(html, pageUrl);
}

function parseJaneStreetPage(html, pageUrl) {
  const description = html.match(/<div class="job-content row">([\s\S]*?)<div class="footnotes">/i)?.[1] || '';
  const apply = html.match(/<a[^>]+class="[^"]*apply-button[^"]*"[^>]+href="([^"]+)"/i)?.[1];
  return { description: plainText(description), application_url: absoluteUrl(apply, pageUrl) };
}

function workdayDetailUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!/\.myworkdayjobs\.com$/i.test(url.hostname)) return null;
    const [site, ...rest] = url.pathname.split('/').filter(Boolean);
    if (!site || rest[0] !== 'job') return null;
    return `${url.origin}/wday/cxs/${url.hostname.split('.')[0]}/${site}/${rest.join('/')}`;
  } catch { return null; }
}

async function fetchWorkday(pageUrl) {
  const detailUrl = workdayDetailUrl(pageUrl);
  if (!detailUrl) return null;
  const response = await fetch(detailUrl, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Workday detail HTTP ${response.status}`);
  const info = (await response.json())?.jobPostingInfo || {};
  return {
    description: plainText(info.jobDescription),
    posted_at: info.startDate || null,
    location: [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])].filter(Boolean).join(' / '),
    application_url: info.externalUrl || pageUrl,
  };
}

export async function fetchJobDetail(job) {
  const pageUrl = job.application_url || job.source_url;
  if (!pageUrl) return {};
  const workday = await fetchWorkday(pageUrl);
  if (workday) return workday;
  const response = await fetch(pageUrl, {
    redirect: 'follow', signal: AbortSignal.timeout(15_000),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)', accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`job detail HTTP ${response.status}`);
  const html = await response.text();
  return parseJobPage(html, pageUrl);
}
