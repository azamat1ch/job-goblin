const DAY_MS = 86_400_000;
const PAGE_SIZE = 10; // Eightfold silently caps both APIs at ten rows.

export const EIGHTFOLD_COMPANIES = {
  hsbc: {
    company: 'HSBC',
    source: 'hsbc',
    host: 'https://hsbc.eightfold.ai',
    domain: 'hsbc.com',
    api: 'legacy',
  },
  'morgan-stanley': {
    company: 'Morgan Stanley',
    source: 'morgan-stanley',
    host: 'https://morganstanley.eightfold.ai',
    domain: 'morganstanley.com',
    api: 'pcsx',
  },
};

function plainText(value = '') {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function payloadData(payload = {}) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload;
}

function epoch(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function customDate(position) {
  const value = position?.custom_JD?.data_fields?.postingStartDate?.[0]
    || position?.custom_data?.postedDate;
  if (!value) return null;
  const date = new Date(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(value) ? `${value} UTC` : value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function directUrl(position, company) {
  const value = position.publicUrl || position.canonicalPositionUrl || position.positionUrl;
  if (!value) return `${company.host}/careers/job/${position.id}?domain=${encodeURIComponent(company.domain)}`;
  return new URL(value, company.host).toString();
}

function applicationUrl(position, company) {
  return position.apply_redirect_url || position.applicationUrl || position.applyUrl
    || directUrl(position, company);
}

function postedAt(position) {
  return customDate(position)
    || epoch(position.postedTs)
    || epoch(position.t_create)
    || epoch(position.creationTs);
}

function isRecent(dateValue, sinceDays, now) {
  if (sinceDays == null || !dateValue) return true;
  const timestamp = new Date(dateValue).valueOf();
  return Number.isNaN(timestamp) || timestamp >= now.valueOf() - Number(sinceDays) * DAY_MS;
}

function mayBeRecentlyPosted(position, company, sinceDays, now) {
  if (sinceDays == null) return true;
  if (company.api !== 'legacy') return isRecent(postedAt(position), sinceDays, now);
  const changed = Math.max(Number(position.t_create || 0), Number(position.t_update || 0));
  return !changed || isRecent(epoch(changed), sinceDays, now);
}

function resolveCompany(position, company) {
  return position?.custom_JD?.data_fields?.brand?.[0]
    || position?.custom_data?.brand
    || company.company;
}

export function parseEightfoldSearch(payload, company, { sinceDays, now = new Date() } = {}) {
  const data = payloadData(payload);
  return (data.positions || []).map((position) => {
    const sourceUrl = directUrl(position, company);
    const date = postedAt(position);
    return {
      company: resolveCompany(position, company),
      title: position.name || position.posting_name,
      location: position.location || (position.locations || []).join(', '),
      source: company.source,
      source_key: String(position.atsJobId || position.ats_job_id || position.displayJobId
        || position.display_job_id || position.id),
      source_url: sourceUrl,
      application_url: applicationUrl(position, company),
      posted_at: date,
      remote_scope: position.workLocationOption || position.work_location_option
        || position.locationFlexibility || position.location_flexibility || '',
      description: plainText(position.jobDescription || position.job_description),
    };
  }).filter((job) => job.title && job.source_url && isRecent(job.posted_at, sinceDays, now));
}

export function parseEightfoldDetail(payload, company) {
  return parseEightfoldSearch({ positions: [payloadData(payload)] }, company)[0] || null;
}

export function eightfoldSearchCount(payload) {
  return Number(payloadData(payload).count || 0);
}

function endpoint(company, kind, params = {}) {
  const path = company.api === 'pcsx'
    ? kind === 'search' ? '/api/pcsx/search' : '/api/pcsx/position_details'
    : kind === 'search' ? '/api/apply/v2/jobs' : `/api/apply/v2/jobs/${params.positionId}`;
  const url = new URL(path, company.host);
  url.searchParams.set('domain', company.domain);
  if (kind === 'search') {
    url.searchParams.set('start', String(params.start || 0));
    url.searchParams.set('num', String(PAGE_SIZE));
    url.searchParams.set('query', params.query || '');
    url.searchParams.set('location', params.location || '');
  } else if (company.api === 'pcsx') {
    url.searchParams.set('position_id', String(params.positionId));
  }
  return url;
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
  });
  if (!response.ok) throw new Error(`Eightfold HTTP ${response.status}: ${url}`);
  return response.json();
}

async function inBatches(items, size, operation) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(...await Promise.all(items.slice(index, index + size).map(operation)));
  }
  return output;
}

async function fetchSearch(company, query, location, fetchImpl) {
  const first = await getJson(endpoint(company, 'search', { query, location }), fetchImpl);
  const count = eightfoldSearchCount(first);
  const starts = [];
  for (let start = PAGE_SIZE; start < count; start += PAGE_SIZE) starts.push(start);
  const pages = [first, ...await inBatches(starts, 5, (start) =>
    getJson(endpoint(company, 'search', { query, location, start }), fetchImpl))];
  return pages.flatMap((page) => payloadData(page).positions || []);
}

export async function fetchEightfoldCompany(provider, {
  sinceDays = 21,
  query = '',
  queries,
  location = '',
  hydrate = true,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const company = typeof provider === 'string' ? EIGHTFOLD_COMPANIES[provider] : provider;
  if (!company?.host || !company?.domain || !company?.api) {
    throw new Error(`unknown Eightfold company: ${typeof provider === 'string' ? provider : 'invalid config'}`);
  }

  const searchTerms = Array.isArray(queries) && queries.length ? queries : [query];
  const positions = (await Promise.all(searchTerms.map((term) =>
    fetchSearch(company, term, location, fetchImpl)))).flat();
  const unique = [...new Map(positions.map((position) => [String(position.id), position])).values()];
  const parsed = parseEightfoldSearch({ positions: unique }, company);
  if (!hydrate) return parsed.filter((job) => isRecent(job.posted_at, sinceDays, now));

  // Classic tenants expose the authoritative posting date only on the detail
  // record. t_update is a deliberately broad prefilter so a newly published
  // requisition with an older creation timestamp is not silently missed.
  const byId = new Map(unique.map((position) => [String(position.id), position]));
  const candidates = parsed.filter((job) => {
    const positionId = job.source_url.match(/\/job\/(\d+)/)?.[1];
    return mayBeRecentlyPosted(byId.get(String(positionId)) || {}, company, sinceDays, now);
  });

  const hydrated = await inBatches(candidates, 5, async (job) => {
    const positionId = job.source_url.match(/\/job\/(\d+)/)?.[1];
    if (!positionId) throw new Error(`Eightfold job URL has no position id: ${job.source_url}`);
    const detail = await getJson(endpoint(company, 'detail', { positionId }), fetchImpl);
    const parsed = parseEightfoldDetail(detail, company);
    return parsed && isRecent(parsed.posted_at, sinceDays, now) ? parsed : null;
  });
  return hydrated.filter(Boolean);
}
