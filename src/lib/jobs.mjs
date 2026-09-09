import { createHash } from 'node:crypto';

import { loadCampaign, matchesAny } from './campaign.mjs';

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function keyText(value) {
  return cleanText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function canonicalUrl(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (/^(?:[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname)) url.hostname = 'www.linkedin.com';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|referrer$|source$|trk$|tracking|position$|pagenum$|refid$|trackingid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

export function normalizeDate(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function seniorityFor(title) {
  const text = keyText(title);
  if (/\b(intern|internship|graduate|junior|entry level|trainee)\b/.test(text)) return 'junior';
  if (/\b(senior|staff|principal|lead|head|director|vp|vice president)\b/.test(text)) return 'senior';
  return 'mid';
}

export function classify(job, campaign = loadCampaign()) {
  const location = `${job.location || ''} ${job.remote_scope || ''}`;
  const remote = /\b(remote|worldwide|anywhere|everywhere)\b/i.test(location);
  const matched = campaign.markets.find(m => m.remote === remote && matchesAny(location, m.location_terms))
    || campaign.markets.find(m => m.remote === remote && m.remote && m.location_terms.length === 0);
  const market = matched?.id || job.market || 'unknown';
  const primary = matchesAny(job.title, campaign.roles.primary);
  // Role terms rank; absence of a keyword does not establish irrelevance.
  return {
    market, eligibility: 'uncertain',
    eligibility_reason: 'Work authorization and hiring geography require candidate-specific review',
    priority: primary ? 'strong' : 'possible',
    seniority: seniorityFor(job.title),
  };
}

export function normalizeJob(input, defaults = {}, campaign = loadCampaign()) {
  const company = cleanText(input.company || defaults.company);
  const title = cleanText(input.title);
  const sourceUrl = canonicalUrl(input.source_url || input.url || input.application_url);
  if (!company || !title || !sourceUrl) throw new Error('job requires company, title, and source URL');
  const description = cleanText(input.description);
  const base = {
    company,
    company_key: keyText(company),
    title,
    title_key: keyText(title),
    location: cleanText(input.location),
    market: input.market || defaults.market || 'unknown',
    remote_scope: cleanText(input.remote_scope || input.remoteScope),
    salary_text: cleanText(input.salary_text || input.salary),
    source: cleanText(input.source || defaults.source || 'manual'),
    source_key: cleanText(input.source_key || defaults.source_key),
    source_url: sourceUrl,
    application_url: canonicalUrl(input.application_url || input.applyUrl || sourceUrl),
    description,
    description_hash: description ? createHash('sha256').update(description).digest('hex') : null,
    posted_at: normalizeDate(input.posted_at || input.postedAt || input.datePosted),
    reposted_at: normalizeDate(input.reposted_at),
    raw_json: JSON.stringify(input),
  };
  const classification = classify(base, campaign);
  const canonicalKey = createHash('sha256')
    .update(base.source_url)
    .digest('hex');
  return { ...base, ...classification, canonical_key: canonicalKey };
}

export function ageDays(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.valueOf())) return null;
  return Math.floor((now.valueOf() - date.valueOf()) / 86_400_000);
}

export function isFresh(job, maxDays = 30, now = new Date()) {
  const value = job.reposted_at || job.posted_at || job.first_seen_at;
  if (!value) return true;
  const timestamp = new Date(value).valueOf();
  if (Number.isNaN(timestamp)) return true;
  return timestamp >= now.valueOf() - Number(maxDays) * 86_400_000;
}
