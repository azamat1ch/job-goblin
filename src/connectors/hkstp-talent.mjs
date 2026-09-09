const API = 'https://talentjobseeker.hkstp.org/api/position';
const SITE = 'https://talentjobseeker.hkstp.org';

const LOCATION_NAMES = new Map([
  [24, 'Hong Kong SAR'],
  [23, 'China'],
  [44, 'Singapore'],
  [47, 'Thailand'],
]);

const WORK_MODES = new Map([
  [1, 'On-site'],
  [2, 'Hybrid'],
  [3, 'Remote'],
]);

function textFromHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>|<\/(?:p|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

export function normalizeHkstpTalentJob(row) {
  if (!row?.id || !row?.job_title || !row?.company?.company_name) return null;
  const locations = (row.location_id || []).map((id) => LOCATION_NAMES.get(id)).filter(Boolean);
  const workMode = WORK_MODES.get(row.work_mode_id);
  const location = [...locations, workMode].filter(Boolean).join(' · ');
  const sourceUrl = `${SITE}/job/${row.id}/${encodeURIComponent(row.slug || row.job_title).replaceAll('%2F', '-')}`;
  return {
    company: row.company.company_name,
    title: row.job_title,
    location,
    source: 'hkstp_talent',
    source_key: String(row.id),
    source_url: sourceUrl,
    application_url: sourceUrl,
    description: textFromHtml(row.job_description),
    posted_at: row.publish_at || null,
    market: (row.location_id || []).includes(24) ? 'hk' : 'unknown',
  };
}

export function filterCurrentHkstpTalentJobs(rows, { days = 21, now = new Date() } = {}) {
  const cutoff = now.valueOf() - Number(days) * 86_400_000;
  return rows.filter((row) => {
    const published = new Date(row.publish_at).valueOf();
    const expires = new Date(row.expire_at).valueOf();
    return (row.location_id || []).includes(24)
      && Number.isFinite(published) && published >= cutoff
      && (!Number.isFinite(expires) || expires >= now.valueOf());
  });
}

export async function fetchHkstpTalent({ days = 21, now = new Date(), fetchImpl = fetch, pageSize = 100 } = {}) {
  const rows = [];
  let page = 1;
  let lastPage = 1;
  do {
    const url = new URL(API);
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(pageSize));
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; job-search/0.1)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HKSTP Talent HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error('HKSTP Talent returned an unexpected response');
    rows.push(...body.data);
    lastPage = Number(body.meta?.last_page || 1);
    page += 1;
  } while (page <= lastPage);

  return filterCurrentHkstpTalentJobs(rows, { days, now })
    .map(normalizeHkstpTalentJob)
    .filter(Boolean);
}
