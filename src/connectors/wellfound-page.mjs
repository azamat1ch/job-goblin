function stateFrom(input) {
  const page = typeof input === 'string' ? JSON.parse(input) : input;
  return page?.props?.pageProps?.apolloState?.data
    || page?.props?.pageProps?.apolloState
    || {};
}

export function parseWellfoundPage(input) {
  const state = stateFrom(input);
  const companies = new Map();

  for (const value of Object.values(state)) {
    if (value?.__typename !== 'StartupResult') continue;
    for (const job of value.highlightedJobListings || []) {
      if (job?.__ref) companies.set(job.__ref, value);
    }
  }

  const jobs = [];
  for (const [key, value] of Object.entries(state)) {
    if (value?.__typename !== 'JobListingSearchResult') continue;
    const company = companies.get(key);
    if (!company?.name || !value.title || !value.id || !value.slug) continue;

    const locations = value.locationNames || [];
    const accepted = value.acceptedRemoteLocationNames || [];
    const onsite = value.remoteConfig?.kind === 'ONSITE';
    const remote = !onsite && (value.remote === true || accepted.length > 0
      || ['REMOTE', 'REMOTE_ONLY'].includes(value.remoteConfig?.kind));
    const sourceUrl = `https://wellfound.com/jobs/${value.id}-${value.slug}`;
    jobs.push({
      company: company.name,
      title: value.title,
      location: remote ? (locations.length ? `Remote · ${locations.join(', ')}` : 'Remote') : locations.join(', '),
      source: 'wellfound',
      source_key: company.slug || company.id || company.name,
      source_url: sourceUrl,
      application_url: sourceUrl,
      posted_at: value.liveStartAt ? new Date(value.liveStartAt * 1000).toISOString() : null,
      salary_text: value.compensation || '',
      remote_scope: remote ? (accepted.length
        ? `Remote hiring locations: ${accepted.join(', ')}`
        : 'Remote; geography unspecified') : '',
      description: value.description || '',
    });
  }

  return jobs;
}

export function parseWellfoundPages(input) {
  const pages = typeof input === 'string' ? JSON.parse(input) : input;
  const records = (Array.isArray(pages) ? pages : [pages]).flatMap(parseWellfoundPage);
  return [...new Map(records.map((job) => [job.source_url, job])).values()];
}
