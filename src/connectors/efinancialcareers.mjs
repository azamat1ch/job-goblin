const API = 'https://job-search-api.efinancialcareers.com/v3/efc/jobs/search';
const SITE = 'https://www.efinancialcareers.hk';

export function normalizeEfcJob(job, sourceKey = 'efinancialcareers-hk') {
  if (!job?.title || !job?.detailsPageUrl) return null;
  const location = job.jobLocation?.displayName || '';
  return {
    company: job.companyName || job.clientBrandName || 'Unknown company',
    title: job.title,
    location,
    salary_text: job.salary || '',
    source: 'efinancialcareers',
    source_key: sourceKey,
    source_url: new URL(job.detailsPageUrl, SITE).toString(),
    application_url: new URL(job.detailsPageUrl, SITE).toString(),
    description: job.description || job.summary || '',
    posted_at: job.postedDate || null,
    market: /hong\s*kong|香港/i.test(location) ? 'hk' : 'unknown',
  };
}

export async function fetchEfinancialCareers({ queries, days = 21, maxPages = 5, pageSize = 50 }) {
  if (!Array.isArray(queries) || !queries.length || queries.some((query) => typeof query !== 'string' || !query.trim())) {
    throw new Error('eFinancialCareers requires non-empty queries from the campaign');
  }
  const output = [];
  let truncated = false;
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(API);
      url.searchParams.set('countryCode2', 'HK');
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('culture', 'en');
      url.searchParams.set('includeRemote', 'false');
      url.searchParams.set('includeUnspecifiedSalary', 'true');
      url.searchParams.set('q', query);
      const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`eFinancialCareers HTTP ${response.status}`);
      const body = await response.json();
      const rows = Array.isArray(body?.data) ? body.data : [];
      for (const row of rows) {
        const job = normalizeEfcJob(row, `efc:${query}`);
        if (job) output.push(job);
      }
      if (rows.length < pageSize) break;
      if (page === maxPages) truncated = true;
    }
  }
  const cutoff = Date.now() - Number(days) * 86_400_000;
  const jobs = output.filter((job) => !job.posted_at || new Date(job.posted_at).valueOf() >= cutoff);
  if (truncated) jobs.truncated = true;
  return jobs;
}
