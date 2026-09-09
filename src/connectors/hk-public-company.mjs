import { randomUUID } from 'node:crypto';

const GOLDMAN_API = 'https://api-higher.gs.com/gateway/api/v1/graphql';
const GOLDMAN_SITE = 'https://higher.gs.com';
const GOLDMAN_ORACLE = 'https://hdpc.fa.us2.oraclecloud.com';
const BYTEDANCE_API = 'https://jobs.bytedance.com/api/v1/public/supplier';
const BYTEDANCE_SITE = 'https://joinbytedance.com';
const CATHAY_SITE = 'https://careers.cathaypacific.com';

function plainText(value = '') {
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

function recent(value, sinceDays, now = Date.now()) {
  if (sinceDays == null) return true;
  if (!value) return false;
  const time = new Date(value).valueOf();
  return Number.isFinite(time) && time >= Number(now) - Number(sinceDays) * 86_400_000;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    ...options,
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response;
}

async function json(url, options) {
  return (await request(url, options)).json();
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

export function parseGoldmanRoles(rows, { details = new Map(), dates = new Map(), sinceDays = null, now = Date.now() } = {}) {
  return (rows || []).map((row) => {
    const sourceId = String(row?.externalSource?.sourceId || '');
    const detail = details.get(sourceId) || row;
    const postedAt = dates.get(sourceId) || null;
    const locations = detail.locations || row.locations || [];
    const location = locations.map((item) => [item.city, item.state, item.country]
      .filter(Boolean).join(', ')).filter(Boolean).join(' / ');
    const sourceUrl = sourceId ? `${GOLDMAN_SITE}/roles/${sourceId}` : '';
    return {
      company: 'Goldman Sachs',
      title: detail.jobTitle || row.jobTitle,
      location,
      source: 'goldman-sachs',
      source_key: sourceId,
      source_url: sourceUrl,
      application_url: detail.externalSource?.externalApplicationUrl || sourceUrl,
      posted_at: postedAt,
      description: plainText(detail.descriptionHtml),
      salary_text: detail.compensation?.minSalary && detail.compensation?.maxSalary
        ? `${detail.compensation.minSalary}-${detail.compensation.maxSalary} ${detail.compensation.currency || ''}`.trim()
        : '',
      market: 'hk',
      active: detail.applyActive !== false && (detail.status || row.status) === 'POSTED',
    };
  }).filter((job) => job.title && job.source_key && job.active && recent(job.posted_at, sinceDays, now))
    .map(({ active, ...job }) => job);
}

export function parseByteDanceJobs(rows) {
  return (rows || []).map((row) => {
    const id = String(row?.id || '');
    return {
      company: 'ByteDance',
      title: row.title,
      location: row.city_info?.en_name || row.city_info?.i18n_name || '',
      source: 'bytedance',
      source_key: id,
      source_url: id ? `${BYTEDANCE_SITE}/search/${id}` : '',
      application_url: id ? `https://jobs.bytedance.com/en/resume/${id}/apply` : '',
      posted_at: null,
      description: [row.description, row.requirement].filter(Boolean).join('\n\n'),
      market: 'hk',
    };
  }).filter((job) => job.title && job.source_key && /hong kong/i.test(job.location));
}

export function parseCathayDetail(html, pageUrl) {
  const main = String(html).match(/<div[^>]+class=["'][^"']*job-detail__grid__main[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div[^>]+class=["'][^"']*job-detail__grid__sidebar/i)?.[1] || '';
  const applyAnchor = String(html).match(/<a\b[^>]*\btitle=["']Apply Now["'][^>]*>/i)?.[0]
    || String(html).match(/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]{0,100}<span>Apply Now<\/span>/i)?.[0]
    || '';
  const apply = applyAnchor.match(/\bhref=["']([^"']+)["']/i)?.[1];
  return {
    description: plainText(main),
    application_url: apply ? new URL(apply, pageUrl).href : pageUrl,
  };
}

export function parseCathayJobs(rows, { details = new Map(), sinceDays = null, now = Date.now() } = {}) {
  return (rows || []).map((row) => {
    const sourceUrl = row?.url ? new URL(row.url, CATHAY_SITE).href : '';
    const detail = details.get(sourceUrl) || {};
    return {
      company: 'Cathay Pacific',
      title: row.title,
      location: plainText(row.location),
      source: 'cathay-pacific',
      source_key: row.localId || sourceUrl,
      source_url: sourceUrl,
      application_url: detail.application_url || sourceUrl,
      posted_at: row.applicationStartDate_s || null,
      description: [
        detail.description,
        [row.jobFunction && `Job function: ${row.jobFunction}`, row.contractType && `Employment type: ${row.contractType}`]
          .filter(Boolean).join('. '),
      ].filter(Boolean).join(' '),
      market: 'hk',
    };
  }).filter((job) => job.title && job.source_url && /hong kong/i.test(job.location)
    && recent(job.posted_at, sinceDays, now));
}

async function goldmanGraphql(operationName, query, variables) {
  const body = await json(GOLDMAN_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: GOLDMAN_SITE,
      'x-higher-request-id': randomUUID(),
    },
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (body.errors?.length) throw new Error(`Goldman GraphQL: ${body.errors[0].message}`);
  return body.data;
}

const GOLDMAN_SEARCH = `
  query GetRoles($searchQueryInput: RoleSearchQueryInput!) {
    roleSearch(searchQueryInput: $searchQueryInput) {
      totalCount
      items {
        roleId corporateTitle jobTitle jobFunction status division skills
        locations { primary state country city }
        jobType { code description }
        externalSource { sourceId }
      }
    }
  }
`;

const GOLDMAN_DETAIL = `
  query GetRoleById($externalSourceId: String!, $externalSourceFetch: Boolean) {
    role(externalSourceId: $externalSourceId, externalSourceFetch: $externalSourceFetch) {
      roleId corporateTitle jobTitle jobFunction division descriptionHtml skillset applyActive status
      locations { primary state country city }
      jobType { code description }
      compensation { minSalary maxSalary currency }
      externalSource { externalApplicationUrl applyInExternalSource sourceId secondarySourceId }
    }
  }
`;

async function goldmanDates(sinceDays, now) {
  const url = new URL('/hcmRestApi/resources/latest/recruitingCEJobRequisitions', GOLDMAN_ORACLE);
  url.searchParams.set('onlyData', 'true');
  url.searchParams.set('expand', 'requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations');
  const cutoff = sinceDays == null ? '' : new Date(Number(now) - Number(sinceDays) * 86_400_000).toISOString().slice(0, 10);
  const finder = ['siteNumber=CX_3002', 'limit=100', 'offset=0', 'location=Hong Kong'];
  if (cutoff) finder.push(`postingStartDate=${cutoff}`);
  url.searchParams.set('finder', `findReqs;${finder.join(',')}`);
  const body = await json(url);
  return new Map((body.items?.[0]?.requisitionList || []).map((row) => [String(row.Id), row.PostedDate || null]));
}

async function fetchGoldman({ sinceDays = 21, now = Date.now() } = {}) {
  const data = await goldmanGraphql('GetRoles', GOLDMAN_SEARCH, {
    searchQueryInput: {
      page: { pageSize: 100, pageNumber: 0 },
      sort: { sortStrategy: 'POSTED_DATE', sortOrder: 'DESC' },
      filters: [{ filterCategoryType: 'LOCATION', filters: [{ filter: 'Hong Kong', subFilters: [] }] }],
      experiences: ['EARLY_CAREER', 'PROFESSIONAL'],
      searchTerm: '',
    },
  });
  const rows = data.roleSearch?.items || [];
  const dates = await goldmanDates(sinceDays, now);
  const freshRows = rows.filter((row) => dates.has(String(row.externalSource?.sourceId || '')));
  const detailRows = await mapLimit(freshRows, 6, async (row) => {
    const sourceId = String(row.externalSource.sourceId);
    const detail = await goldmanGraphql('GetRoleById', GOLDMAN_DETAIL, {
      externalSourceId: sourceId,
      externalSourceFetch: true,
    });
    return [sourceId, detail.role];
  });
  return parseGoldmanRoles(rows, { details: new Map(detailRows), dates, sinceDays, now });
}

const BYTEDANCE_HEADERS = {
  accept: 'application/json',
  'accept-language': 'en-US',
  'content-type': 'application/json',
  origin: BYTEDANCE_SITE,
  'website-path': 'en',
  'x-tt-env': 'boe_epam_api',
};

async function fetchByteDance() {
  const filters = await json(`${BYTEDANCE_API}/config/job/filters`, {
    method: 'POST', headers: BYTEDANCE_HEADERS, body: '{}',
  });
  const cities = filters.data?.city_list || [];
  const hongKong = cities.find((city) => /^hong kong(?: \(china\))?$/i.test(city.en_name || city.i18n_name || ''));
  if (!hongKong?.code) throw new Error('ByteDance Hong Kong location code not found');

  const rows = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const body = await json(`${BYTEDANCE_API}/search/job/posts`, {
      method: 'POST',
      headers: BYTEDANCE_HEADERS,
      body: JSON.stringify({ keyword: '', limit, offset, location_code_list: [hongKong.code] }),
    });
    const page = body.data?.job_post_list || [];
    rows.push(...page);
    if (rows.length >= Number(body.data?.count || 0) || page.length < limit) break;
  }
  return parseByteDanceJobs(rows);
}

export function cathayApiFromHtml(html) {
  const block = String(html).match(/<[^>]+class=["'][^"']*\bjob-listing\b[^"']*["'][^>]*>/i)?.[0] || '';
  const path = block.match(/\bdata-api=["']([^"']+)["']/i)?.[1];
  const key = block.match(/\bdata-api-key=["']([^"']+)["']/i)?.[1];
  if (!path || !key) throw new Error('Cathay public job API metadata not found');
  return { url: new URL(path, CATHAY_SITE).href, key };
}

async function fetchCathay({ sinceDays = 21, now = Date.now() } = {}) {
  const landing = await (await request(`${CATHAY_SITE}/en/careers/jobs`)).text();
  const api = cathayApiFromHtml(landing);
  const url = new URL(api.url);
  url.searchParams.set('page', '1');
  url.searchParams.set('itemperpage', '100');
  const body = await json(url, { headers: { accept: 'application/json', 'x-api-key': api.key } });
  const fresh = parseCathayJobs(body.items, { sinceDays, now });
  const detailRows = await mapLimit(fresh, 6, async (job) => {
    const html = await (await request(job.source_url)).text();
    return [job.source_url, parseCathayDetail(html, job.source_url)];
  });
  return parseCathayJobs(body.items, { details: new Map(detailRows), sinceDays, now });
}

export async function fetchHkPublicCompany(provider, options = {}) {
  if (provider === 'goldman-sachs') return fetchGoldman(options);
  if (provider === 'bytedance') return fetchByteDance(options);
  if (provider === 'cathay-pacific') return fetchCathay(options);
  throw new Error(`unknown HK public company provider: ${provider}`);
}
