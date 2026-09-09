import { loadCampaign, matchesAny } from './campaign.mjs';

/** Only explicit candidate hard exclusions produce deterministic skips. */
export function preReviewDecision(job, campaign = loadCampaign(), now = new Date()) {
  const filters = campaign.filters;
  const rules = [
    ['excluded_title', job.title, filters.exclude_titles, 'title'],
    ['excluded_company', job.company, filters.exclude_companies, 'company'],
    ['excluded_location', job.location, filters.exclude_locations, 'location'],
  ];
  for (const [rule, value, terms, label] of rules) {
    if (matchesAny(value, terms)) return { rule, verdict: 'skip', reason: `Explicit campaign exclusion matches the ${label}.`, gap: 'User-confirmed hard constraint.', eligibility_note: '' };
  }
  const date = new Date(job.reposted_at || job.posted_at || '').valueOf();
  if (filters.max_posting_age_days !== null && Number.isFinite(date)
      && new Date(now).valueOf() - date > filters.max_posting_age_days * 86400000) {
    return { rule: 'posting_age', verdict: 'skip', reason: 'Posting exceeds the configured maximum age.', gap: 'User-confirmed freshness constraint.', eligibility_note: '' };
  }
  return null;
}

export function preReviewJobs(jobs, campaign = loadCampaign(), now = new Date()) {
  const reviews = [], rules = {};
  for (const job of jobs) {
    const result = preReviewDecision(job, campaign, now);
    if (!result) continue;
    rules[result.rule] = (rules[result.rule] || 0) + 1;
    reviews.push({ job_id: Number(job.id || job.job_id), ...result });
  }
  return { reviews, rules };
}
