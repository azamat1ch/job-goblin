const API = 'https://apigw-dgg-b0.huawei.com/api/apig/channelhw/recruitmentPosition/pub/getJobPage?X-HW-ID=app_000000035886';
const SITE = 'https://career.huawei.com';
const HK_LOCATION = 'China\\Hong Kong-Hong Kong';

export function normalizeHuaweiJob(row) {
  if (!row?.jobName || !row?.advertisementId) return null;
  const sourceUrl = `${SITE}/en/job-details?advertisementId=${encodeURIComponent(row.advertisementId)}`;
  return {
    company: 'Huawei',
    title: row.jobName,
    location: row.workPlace || row.jobAddress || 'Hong Kong',
    source: 'huawei',
    source_key: String(row.advertisementId),
    source_url: sourceUrl,
    application_url: sourceUrl,
    description: [row.mainBusiness, row.jobRequire].filter(Boolean).join('\n\n'),
    posted_at: row.releaseDate || row.lastUpdateDate || null,
    market: /hong[ /-]?kong/i.test(`${row.workPlace || ''} ${row.jobAddress || ''}`) ? 'hk' : 'unknown',
  };
}

export function filterCurrentHuaweiJobs(rows, { days = 21, now = new Date() } = {}) {
  const cutoff = now.valueOf() - Number(days) * 86_400_000;
  return rows.filter((row) => {
    const date = new Date(row.releaseDate || row.lastUpdateDate).valueOf();
    return /hong[ /-]?kong/i.test(`${row.workPlace || ''} ${row.jobAddress || ''}`)
      && Number.isFinite(date) && date >= cutoff;
  });
}

export async function fetchHuawei({ days = 21, now = new Date(), fetchImpl = fetch, pageSize = 100 } = {}) {
  const rows = [];
  let page = 1;
  let total = Infinity;
  do {
    const response = await fetchImpl(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)',
        'x-hw-id': 'app_000000035886',
        'x-jalor-tenantalias': 'hcm',
        'x-language': 'en_US',
        'x-referer': 'https://career.huawei.com/en',
        referer: 'https://career.huawei.com/en/social-recruitment-job-list',
        origin: 'https://career.huawei.com',
        'x-alb-gray': 'prod',
      },
      body: JSON.stringify({ curPage: page, pageSize, jobAddress: HK_LOCATION }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Huawei careers HTTP ${response.status}`);
    const body = await response.json();
    const data = body?.data || body?.result;
    const pageRows = data?.result || data?.data || data?.list || data?.records || [];
    if (!Array.isArray(pageRows)) throw new Error('Huawei careers returned an unexpected response');
    rows.push(...pageRows);
    total = Number(data?.pageVO?.totalRows ?? data?.totalCount ?? data?.total ?? pageRows.length);
    page += 1;
    if (pageRows.length < pageSize) break;
  } while (rows.length < total);

  return filterCurrentHuaweiJobs(rows, { days, now }).map(normalizeHuaweiJob).filter(Boolean);
}
