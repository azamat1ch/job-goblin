const SEARCH_URL = 'https://jobs.ubs.com/TGnewUI/Search/Home/HomeWithPreLoad?PageType=searchResults&partnerid=25008&siteid=5012';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function plainText(value = '') {
  return decodeHtml(value)
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function input(html, id) {
  return decodeHtml(html.match(new RegExp(`<input\\b(?=[^>]*\\bid=["']${id}["'])[^>]*?\\bvalue="([^"]*)"`, 'i'))?.[1]);
}

function requestToken(html) {
  return decodeHtml(html.match(/<input\b(?=[^>]*\bname=["']__RequestVerificationToken["'])[^>]*\bvalue=["']([^"']*)["']/i)?.[1]);
}

export function parseUbsBootstrap(html) {
  const preloadValue = input(html, 'preLoadJSON');
  const cookieValue = input(html, 'CookieValue');
  const token = requestToken(html);
  if (!preloadValue || !cookieValue || !token) throw new Error('UBS bootstrap fields missing');
  const preload = JSON.parse(preloadValue);
  const initial = JSON.parse(preload.SmartSearchJSONValue);
  return {
    token,
    request: {
      PartnerId: 25008,
      SiteId: 5012,
      Keyword: '',
      Location: 'Hong Kong SAR',
      KeywordCustomSolrFields: initial.KeywordCustomSolrFields,
      LocationCustomSolrFields: initial.LocationCustomSolrFields,
      TurnOffHttps: false,
      Latitude: 0,
      Longitude: 0,
      PowerSearchOptions: { PowerSearchOption: [] },
      encryptedsessionvalue: cookieValue,
    },
  };
}

function questionMap(job) {
  return new Map((job?.Questions || []).map((question) => [String(question.QuestionName).toLowerCase(), question.Value]));
}

function freshEnough(value, sinceDays, now) {
  if (!value || sinceDays == null) return true;
  const timestamp = new Date(value).valueOf();
  return Number.isNaN(timestamp) || timestamp >= now - Number(sinceDays) * 86_400_000;
}

function ubsDate(value) {
  const match = String(value || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return value ? new Date(value).toISOString() : null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString();
}

export function parseUbsJobs(response, { sinceDays, now = Date.now() } = {}) {
  return (response?.Jobs?.Job || []).map((raw) => {
    const fields = questionMap(raw);
    const requisition = String(fields.get('reqid') || '');
    const siteId = String(fields.get('siteid') || '5012');
    const updated = ubsDate(fields.get('lastupdated'));
    const url = `https://jobs.ubs.com/TGnewUI/Search/home/HomeWithPreLoad?partnerid=25008&siteid=${siteId}&PageType=JobDetails&jobid=${requisition}`;
    return {
      company: 'UBS',
      title: plainText(fields.get('jobtitle')),
      location: plainText(fields.get('formtext23')),
      source: 'ubs',
      source_key: requisition,
      source_url: url,
      application_url: url,
      posted_at: updated,
      description: plainText(fields.get('jobdescription')),
    };
  }).filter((job) => job.title && job.source_key && /hong kong/i.test(job.location) && freshEnough(job.posted_at, sinceDays, now));
}

export async function fetchUbs({ sinceDays } = {}) {
  const headers = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' };
  const bootstrapResponse = await fetch(SEARCH_URL, { signal: AbortSignal.timeout(20_000), headers });
  if (!bootstrapResponse.ok) throw new Error(`HTTP ${bootstrapResponse.status}: ${SEARCH_URL}`);
  const html = await bootstrapResponse.text();
  const { token, request } = parseUbsBootstrap(html);
  const cookies = bootstrapResponse.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const endpoint = 'https://jobs.ubs.com/TgNewUI/Search/Ajax/MatchedJobs';
  const response = await fetch(endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json; charset=utf-8',
      cookie: cookies,
      referer: SEARCH_URL,
      RFT: token,
      'user-agent': headers['user-agent'],
      'x-requested-with': 'XMLHttpRequest',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${endpoint}`);
  return parseUbsJobs(await response.json(), { sinceDays });
}
