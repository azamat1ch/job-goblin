const PAGE = 20;
let markets = [];
const FIT_VALUES = ['recommended', 'maybe', 'needs_answer', 'unreviewed', 'skip'];
const DEFAULT_FIT = FIT_VALUES.filter((value) => value !== 'skip').join(',');
const DEFAULTS = { view: 'explore', market: 'all', stage: 'new', fit: DEFAULT_FIT, query: '', company: '', sort: 'fit', page: 1 };
const VIEW_DEFAULTS = { explore: { ...DEFAULTS }, applications: { ...DEFAULTS, market: 'all', stage: 'all' }, stats: { ...DEFAULTS } };
const state = { ...DEFAULTS };
let requestVersion = 0;
let dashboardController;
let statsController;
const $ = (selector) => document.querySelector(selector);
const safe = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeUrl = (value = '') => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};
const num = (value) => Number(value || 0).toLocaleString();
const daysSince = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86400000)) : null;
};
const ago = (value) => { const days = daysSince(value); return days === null ? '—' : days === 0 ? '0d' : `${days}d`; };
const sourceLabel = (source = '') => source.replace(/_guest$/, '').replace(/[-_]/g, ' ');
const VERDICT = { recommended: 'recommended', maybe: 'maybe', needs_answer: 'needs answer', skip: 'skip', unreviewed: 'unreviewed' };
const STAGE = { new: 'new', selected: 'selected', queued: 'selected', applied: 'applied', replied: 'replied', interview: 'interview', final_round: 'final round', offer: 'offer', closed: 'closed' };
const fitValues = (value = state.fit) => FIT_VALUES.filter((item) => String(value).split(',').includes(item));
const normalizeFit = (value) => {
  if (value === 'all') return FIT_VALUES.join(',');
  const selected = fitValues(value);
  return selected.length ? selected.join(',') : DEFAULT_FIT;
};

/* ---------- url state ---------- */
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = ['explore', 'applications', 'stats'].includes(params.get('view')) ? params.get('view') : 'explore';
  Object.assign(state, VIEW_DEFAULTS[view]);
  const allowed = {
    market: [...markets.map(m => m.id), 'unknown', 'all'],
    stage: ['new', 'all', 'queued', 'applied', 'replied', 'interview', 'final_round', 'offer', 'closed', 'failed'],
    sort: ['fit', 'age', 'company', 'updated'],
  };
  state.view = view;
  for (const key of Object.keys(allowed)) if (allowed[key].includes(params.get(key))) state[key] = params.get(key);
  if (params.has('fit')) state.fit = normalizeFit(params.get('fit'));
  if (params.has('query')) state.query = params.get('query').trim();
  if (params.has('company')) state.company = params.get('company');
  if (params.has('page')) state.page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  if (state.view === 'applications') {
    if (!params.has('market')) state.market = 'all';
    if (!params.has('stage')) state.stage = 'all';
  }
}
function writeHash() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value !== DEFAULTS[key] && value !== '' && value !== 1) params.set(key, value);
  const next = params.toString();
  if (location.hash.slice(1) !== next) history.replaceState(null, '', next ? `#${next}` : location.pathname);
}
function syncControls() {
  document.body.dataset.view = state.view;
  const isStats = state.view === 'stats';
  $('#stats').hidden = !isStats;
  $('#kpis').hidden = isStats;
  document.querySelectorAll('.list-only').forEach((element) => { element.hidden = isStats; });
  document.querySelectorAll('.explore-only').forEach((element) => { element.hidden = state.view !== 'explore'; });
  document.querySelectorAll('#views button').forEach((button) => { const active = button.dataset.value === state.view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  document.querySelectorAll('#markets button').forEach((button) => { const active = button.dataset.value === state.market; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#stage').value = state.stage === 'new' ? 'all' : state.stage;
  const selectedFits = fitValues();
  document.querySelectorAll('#fit-options input').forEach((input) => { input.checked = selectedFits.includes(input.value); });
  $('#fit-toggle').textContent = selectedFits.length === FIT_VALUES.length ? 'Fit: all'
    : state.fit === DEFAULT_FIT ? 'Fit: no skips'
      : selectedFits.length === 1 ? `Fit: ${VERDICT[selectedFits[0]]}` : `Fit: ${selectedFits.length} selected`;
  $('#sort').value = state.sort;
  if (document.activeElement !== $('#search') && $('#search').value !== state.query) $('#search').value = state.query;
  const chip = $('#company-chip');
  chip.hidden = !state.company;
  chip.textContent = state.company;
  $('#th-first').textContent = state.view === 'applications' ? 'Stage' : 'Fit';
  $('#th-why').textContent = state.view === 'applications' ? 'Status' : 'Why';

}
function update(patch, { resetPage = true } = {}) {
  Object.assign(state, patch);
  if (resetPage) state.page = 1;
  writeHash();
  syncControls();
  state.view === 'stats' ? loadStats() : load();
}

/* ---------- list ---------- */
function kpi(label, value, color, patch, active) {
  const zero = !Number(value);
  return `<button class="kpi ${zero ? 'zero' : ''} ${active ? 'active' : ''} ${patch ? '' : 'static'}" style="--kpi:var(--${color});--kpi-bg:var(--${color}-bg,var(--surface-2))" ${patch ? `data-patch='${JSON.stringify(patch)}'` : ''}><strong>${num(value)}</strong><span>${label}</span></button>`;
}

function row(job) {
  const href = safeUrl(job.application_url || job.source_url);
  const linkLabel = job.source === 'linkedin_guest' && job.application_url === job.source_url ? 'LinkedIn' : 'Apply';
  const verdict = job.fit_verdict || 'unreviewed';
  const applications = state.view === 'applications';
  const first = applications
    ? `<span class="chip s-${safe(job.failure_reason ? 'failed' : job.stage)}">${safe(job.failure_reason ? 'failed' : STAGE[job.stage] || job.stage)}</span>`
    : `<span class="chip v-${safe(verdict)}" title="${safe(job.fit_gap || '')}">${safe(VERDICT[verdict] || verdict)}</span>`;
  const why = applications
    ? (job.failure_reason ? `<span class="bad">${safe(job.failure_reason)}</span>` : [job.applied_at ? `applied ${ago(job.applied_at)}` : 'not submitted', job.application_channel, job.fit_verdict ? (VERDICT[job.fit_verdict] || job.fit_verdict) : ''].filter(Boolean).map(safe).join(' · '))
    : (job.fit_reason ? safe(job.fit_reason) : job.fit_eligibility_note ? `<span class="note">${safe(job.fit_eligibility_note)}</span>` : job.eligibility === 'uncertain' ? `<span class="note">${safe(job.eligibility_reason)}</span>` : '');
  const tooltip = [job.fit_reason, job.fit_gap ? `Gap: ${job.fit_gap}` : '', job.fit_eligibility_note, job.failure_reason].filter(Boolean).join('\n');
  const recent = Number(job.company_recent_applications || 0);
  return `<tr data-job-id="${job.id}" tabindex="0" aria-label="Open details for ${safe(job.title)} at ${safe(job.company)}">
    <td class="c-verdict">${first}</td>
    <td class="c-role"><b title="${safe(job.title)}">${safe(job.title)}</b><small><button class="co" data-company="${safe(job.company)}">${safe(job.company)}</button>${recent ? `<span class="co-count" title="applications to this company in the last 30 days">${recent}/2</span>` : ''} · ${safe(job.location || 'Location unclear')}</small></td>
    <td class="c-why" title="${safe(tooltip)}">${why}</td>
    <td class="c-age" title="${safe(job.reposted_at || job.posted_at || `first seen ${job.first_seen_at}`)}">${ago(job.reposted_at || job.posted_at)}</td>
    <td class="c-src" title="${safe(job.source)}">${safe(sourceLabel(job.source))}</td>
    <td class="c-sal" title="${safe(job.salary_text || '')}">${safe(job.salary_text || '')}</td>
    <td class="c-link">${href ? `<a href="${safe(href)}" target="_blank" rel="noreferrer">${linkLabel} ↗</a>` : '<span class="bad-link">no link</span>'}</td>
  </tr>`;
}

function pager(total) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const from = total ? (state.page - 1) * PAGE + 1 : 0;
  const to = Math.min(total, state.page * PAGE);
  const window = new Set([1, pages, state.page - 2, state.page - 1, state.page, state.page + 1, state.page + 2].filter((page) => page >= 1 && page <= pages));
  const buttons = [];
  let previous = 0;
  for (const page of [...window].sort((a, b) => a - b)) {
    if (page - previous > 1) buttons.push('<span>…</span>');
    buttons.push(`<button data-page="${page}" class="${page === state.page ? 'active' : ''}">${page}</button>`);
    previous = page;
  }
  $('#pager').innerHTML = `<span>${num(from)}–${num(to)} of ${num(total)}</span>
    <div class="pages"><button data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>‹</button>${buttons.join('')}<button data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>›</button></div>`;
}

async function load() {
  const token = ++requestVersion;
  dashboardController?.abort();
  const controller = new AbortController();
  dashboardController = controller;
  try {
    const params = new URLSearchParams({
      view: state.view, market: state.market, stage: state.stage, fit: state.fit, query: state.query, company: state.company, sort: state.sort,
      limit: PAGE, offset: (state.page - 1) * PAGE,
    });
    const response = await fetch(`/api/dashboard?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`dashboard HTTP ${response.status}`);
    const data = await response.json();
    if (token !== requestVersion || state.view === 'stats') return;
    const failures = data.sourceHealth.filter((source) => ['failed', 'blocked', 'partial'].includes(source.status)).length;
    const pages = Math.max(1, Math.ceil(data.total / PAGE));
    if (state.page > pages) {
      state.page = pages;
      writeHash();
      return load();
    }
    const m = data.metrics;
    $('#kpis').innerHTML = state.view === 'explore' ? [
      kpi('recommended', m.recommended_new, 'rec', { fit: 'recommended' }, state.fit === 'recommended'),
      kpi('worth a look', m.maybe_new, 'maybe', { fit: 'maybe' }, state.fit === 'maybe'),
      kpi('needs an answer', m.needs_answer_new, 'needs', { fit: 'needs_answer' }, state.fit === 'needs_answer'),
      kpi('unreviewed', m.unreviewed_new, 'unrev', { fit: 'unreviewed' }, state.fit === 'unreviewed'),
      kpi('source issues', failures, failures ? 'bad' : 'ok', null),
    ].join('') : [
      kpi('selected', m.queued, 'queued', { stage: 'queued' }, state.stage === 'queued'),
      kpi('applied', m.applied, 'applied', { stage: 'applied' }, state.stage === 'applied'),
      kpi('replied', m.responses, 'replied', { stage: 'replied' }, state.stage === 'replied'),
      kpi('interviews', m.interviews, 'interview', { stage: 'interview' }, state.stage === 'interview'),
      kpi('offers', m.offers, 'offer', { stage: 'offer' }, state.stage === 'offer'),
      kpi('follow-ups due', data.status.follow_ups_due, data.status.follow_ups_due ? 'needs' : 'skip', null),
      kpi('failures', m.failures, m.failures ? 'bad' : 'skip', { stage: 'failed' }, state.stage === 'failed'),
    ].join('');
    $('#jobs').innerHTML = data.jobs.length ? data.jobs.map(row).join('') : '<tr><td colspan="7" class="empty">No jobs in this view.</td></tr>';
    pager(data.total);
    const lastScan = data.sourceHealth.map((item) => item.checked_at ? new Date(item.checked_at) : null).filter((date) => date && Number.isFinite(date.getTime())).sort((a, b) => b - a)[0];
    $('#updated').textContent = lastScan ? `Last scan ${lastScan.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'No scans recorded';
    $('#live').classList.toggle('unhealthy', failures > 0);
    const sourceStatus = (source) => source.status === 'due' && source.provider === 'browser' ? 'browser required' : source.status;
    const sourceRow = (source) => `<div class="source-row"><span class="health-dot ${safe(source.status)}"></span><strong>${safe(source.name)}</strong><span>${safe(sourceStatus(source))}</span><span>${num(source.count)} found</span><span>${safe(source.checked_at ? (source.reason || source.error || '') : 'Never checked')}</span></div>`;
    const attention = data.sourceHealth.filter((source) => source.status !== 'ok');
    const healthy = data.sourceHealth.filter((source) => source.status === 'ok');
    const due = attention.filter((source) => source.status === 'due').length;
    const errors = attention.filter((source) => ['failed', 'blocked'].includes(source.status)).length;
    const partial = attention.filter((source) => source.status === 'partial').length;
    $('#health-summary').textContent = `${errors} errors · ${partial} partial · ${due} due · ${healthy.length} healthy`;
    $('#attention').innerHTML = attention.length ? attention.map(sourceRow).join('') : '<p class="quiet">Nothing needs attention.</p>';
    $('#healthy').innerHTML = healthy.map(sourceRow).join('');
  } catch (error) {
    if (error.name === 'AbortError' || token !== requestVersion) return;
    $('#kpis').innerHTML = '';
    $('#jobs').innerHTML = `<tr><td colspan="7" class="empty">Could not load the dashboard: ${safe(error.message)}</td></tr>`;
    $('#pager').innerHTML = '';
    $('#health-summary').textContent = '';
    $('#attention').innerHTML = '';
    $('#healthy').innerHTML = '';
    $('#updated').textContent = 'Dashboard unavailable'; $('#live').classList.add('unhealthy');
  } finally {
    if (dashboardController === controller) dashboardController = null;
  }
}

/* ---------- stats ---------- */
function bars(days, series, labelFor, { stacked = true } = {}) {
  const totals = days.map((day) => series.reduce((sum, item) => sum + Number(day[item.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const ticks = [max, max >= 2 ? Math.round(max / 2) : '', 0];
  const columns = days.map((day, index) => {
    const parts = series.map((item) => `<i class="${item.second ? 'second' : ''}" style="--bar:var(--${item.color});height:${(Number(day[item.key] || 0) / max) * 100}%"></i>`).join('');
    const value = stacked && totals[index] ? `<em>${num(totals[index])}</em>` : '';
    return `<div data-label="${safe(labelFor(day))}">${value}${parts}</div>`;
  }).join('');
  const labels = days.map((day, index) => `<span>${index % 5 === 0 || index === days.length - 1 ? safe(day.day.slice(5)) : ''}</span>`).join('');
  return `<div class="chart"><div class="grid"><span>${num(ticks[0])}</span><span>${ticks[1] === '' ? '' : num(ticks[1])}</span><span>0</span></div><div class="bars ${stacked ? '' : 'grouped'}">${columns}</div></div><div class="axis">${labels}</div>`;
}

function dayRange(count, rows) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    days.push({ day, applied: 0, selected: 0, discovered: 0, reviewed: 0, responses: 0, outreach_sent: 0, ...(byDay.get(day) || {}) });
  }
  return days;
}

async function loadStats() {
  const container = $('#stats');
  const token = ++requestVersion;
  statsController?.abort();
  const controller = new AbortController();
  statsController = controller;
  if (state.view !== 'stats') return;
  container.hidden = false;
  try {
    const response = await fetch('/api/stats?days=30', { signal: controller.signal });
    if (!response.ok) throw new Error(`stats HTTP ${response.status}`);
    const data = await response.json();
    if (token !== requestVersion || state.view !== 'stats') return;
    const days = dayRange(30, data.per_day);
    $('#updated').textContent = `Updated ${new Date().toLocaleTimeString([], { timeStyle: 'short' })}`; $('#live').classList.remove('unhealthy');
    const f = data.funnel;
    const steps = [['selected', 'queued'], ['applied', 'applied'], ['replied', 'replied'], ['interview', 'interview'], ['final_round', 'final_round'], ['offer', 'offer']];
    const top = Math.max(1, f.selected, f.applied);
    const rate = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '');
    const funnel = steps.map(([key, color], index) => {
      const previous = index ? f[steps[index - 1][0]] : null;
      return `<div><span>${STAGE[key]}</span><div class="track"><i style="--bar:var(--${color});width:${Math.max(f[key] ? 1.5 : 0, (f[key] / top) * 100)}%"></i></div><b>${num(f[key])}</b><small>${previous !== null ? `${rate(f[key], previous) || '–'} of ${STAGE[steps[index - 1][0]]}` : 'from explore'}</small></div>`;
    }).join('');
    const applied7 = days.slice(-7).reduce((sum, day) => sum + Number(day.applied), 0);
    const applied30 = days.reduce((sum, day) => sum + Number(day.applied), 0);
    const noisy = new Set(['discovered', 'seen_again', 'detail_enriched', 'detail_enrichment_failed', 'fit_reviewed', 'source_scan', 'scan_run', 'stale_expired', 'date_verified', 'application_url_resolved', 'preflight']);
    const counts = data.last_24h.filter((item) => !noisy.has(item.kind)).map((item) => `<span>${safe(item.kind.replace('stage:', '').replace('outreach:', 'outreach '))} <b>${num(item.count)}</b></span>`).join('');
    const feed = data.recent.length ? `<ul class="feed">${data.recent.map((event) => {
      const kind = event.kind.replace('stage:', '').replace('outreach:', 'outreach ');
      const text = event.details.text || event.details.reason || event.details.contact_name || event.details.confirmationId || '';
      return `<li><time>${safe(new Date(event.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}</time><span class="what"><b>${safe(kind)}</b> ${event.company ? `${safe(event.company)} · ${safe(event.title)}` : ''} ${text ? `<small>${safe(text)}</small>` : ''}</span><span class="mono">${event.job_id ? `#${event.job_id}` : ''}</span></li>`;
    }).join('')}</ul>` : '<p class="empty-note">No pipeline activity yet. Selections, applications, replies, outreach, notes and failures will show here.</p>';
    const sourceTable = data.by_source.length ? `<table><thead><tr><th>Source</th><th class="n">Stored</th><th class="n">Recommended</th><th class="n">Applied</th><th class="n">Replies</th></tr></thead><tbody>${data.by_source.map((source) => `<tr><td>${safe(sourceLabel(source.source))}</td><td class="n">${num(source.total)}</td><td class="n">${num(source.recommended)}</td><td class="n">${num(source.applied)}</td><td class="n">${num(source.responses)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty-note">No source has produced recommended or applied roles yet.</p>';
    const channelTable = data.by_channel.length ? `<table><thead><tr><th>Channel</th><th class="n">Applied</th><th class="n">Replies</th><th class="n">Rate</th></tr></thead><tbody>${data.by_channel.map((channel) => `<tr><td>${safe(channel.channel)}</td><td class="n">${num(channel.applied)}</td><td class="n">${num(channel.responses)}</td><td class="n">${rate(channel.responses, channel.applied)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty-note">No applications submitted yet.</p>';
    container.innerHTML = `
      <section class="panel"><h2>Funnel <small>jobs that ever reached each stage · ${num(f.closed)} closed or expired</small></h2><div class="funnel">${funnel}</div></section>
      <section class="panel"><h2>Applications per day <small>${num(applied7)} last 7 days · ${num(applied30)} last 30</small></h2>
        <div class="legend"><span><i style="background:var(--applied)"></i>applied</span><span><i style="background:var(--replied)"></i>replies</span></div>
        ${bars(days, [{ key: 'applied', color: 'applied' }, { key: 'responses', color: 'replied', second: true }], (day) => `${day.day}: ${day.applied} applied, ${day.responses} replies`)}</section>
      <section class="panel"><h2>Discovery per day <small>new roles stored · fit reviews (separate bars)</small></h2>
        <div class="legend"><span><i style="background:var(--skip)"></i>discovered</span><span><i style="background:var(--maybe)"></i>reviewed</span></div>
        ${bars(days, [{ key: 'discovered', color: 'skip' }, { key: 'reviewed', color: 'maybe' }], (day) => `${day.day}: ${day.discovered} discovered, ${day.reviewed} reviewed`, { stacked: false })}</section>
      <section class="panel"><h2>By channel <small>reply rate per application route</small></h2>${channelTable}</section>
      <section class="panel"><h2>By source <small>where recommended and applied roles come from</small></h2>${sourceTable}</section>
      <section class="panel"><h2>Activity <small>last 24 hours, then recent pipeline events</small></h2><div class="counts">${counts || '<span>quiet</span>'}</div>${feed}</section>`;
  } catch (error) {
    if (error.name === 'AbortError' || token !== requestVersion) return;
    container.innerHTML = `<p class="empty-note">Could not load stats: ${safe(error.message)}</p>`;
    $('#updated').textContent = 'Stats unavailable';
    $('#live').classList.add('unhealthy');
  } finally {
    if (statsController === controller) statsController = null;
  }
}

/* ---------- detail ---------- */
async function openJob(id) {
  let payload;
  try {
    const response = await fetch(`/api/job/${id}`);
    if (!response.ok) throw new Error(`job HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    $('#job-detail').innerHTML = `<p class="empty-note">Could not load this job: ${safe(error.message)}</p>`;
    $('#job-dialog').showModal();
    return;
  }
  const { job, events, artifacts, outreach = [] } = payload;
  const application = safeUrl(job.application_url);
  const source = safeUrl(job.source_url);
  const field = (label, value) => value ? `<div><dt>${label}</dt><dd>${safe(value)}</dd></div>` : '';
  const verdict = job.fit_verdict || 'unreviewed';
  $('#job-detail').innerHTML = `<p class="detail-kicker"><span class="chip s-${safe(job.stage)}">${safe(STAGE[job.stage] || job.stage)}</span><span class="chip v-${safe(verdict)}">${safe(VERDICT[verdict] || verdict)}</span><span>#${job.id} · ${safe(job.market)} · ${safe(sourceLabel(job.source))}</span></p>
    <h2>${safe(job.title)}</h2><p class="detail-company">${safe(job.company)} · ${safe(job.location || 'Location unclear')}${job.salary_text ? ` · ${safe(job.salary_text)}` : ''}</p>
    <div class="detail-actions">${application ? `<a href="${safe(application)}" target="_blank" rel="noreferrer">Application ↗</a>` : ''}${source && source !== application ? `<a href="${safe(source)}" target="_blank" rel="noreferrer">Source ↗</a>` : ''}</div>
    <dl>${field('Why', job.fit_reason)}${field('Gap', job.fit_gap)}${field('Eligibility', job.fit_eligibility_note || job.eligibility_reason)}${field('Posted', job.reposted_at || job.posted_at)}${field('Failure', job.failure_reason)}${field('Applied', job.applied_at)}${field('Channel', job.application_channel)}${field('CV used', job.cv_path)}${field('CV version', job.cv_version)}${field('Answers', job.answers_path)}${field('Confirmation', job.confirmation_id)}</dl>
    ${artifacts.length ? `<h3>Files</h3><div class="artifact-list">${artifacts.map((file) => `<a href="${safe(file.url)}" target="_blank">${safe(file.name)} ↗</a>`).join('')}</div>` : ''}
    ${outreach.length ? `<h3>Outreach</h3><div class="outreach-list">${outreach.map((item) => {
      const contact = safeUrl(item.contact_url);
      const followUp = item.follow_up_at ? ` · follow up ${safe(new Date(item.follow_up_at).toLocaleDateString())}` : '';
      return `<div><strong>${contact ? `<a href="${safe(contact)}" target="_blank" rel="noreferrer">${safe(item.contact_name)}</a>` : safe(item.contact_name)}</strong><span>${safe(item.contact_role || item.address || '')}</span><small>${safe(item.channel)} · ${safe(item.status)}${followUp}</small></div>`;
    }).join('')}</div>` : ''}
    <h3>Job description</h3><div class="description">${safe(job.description || 'No description stored for this listing.')}</div>
    <h3>History</h3><ol class="history">${events.map((event) => `<li><span>${safe(event.kind.replace('stage:', ''))}${event.details.text ? ` · ${safe(event.details.text)}` : ''}${event.details.reason ? ` · ${safe(event.details.reason)}` : ''}</span><time>${safe(new Date(event.created_at).toLocaleString())}</time></li>`).join('')}</ol>`;
  $('#job-dialog').showModal();
}

/* ---------- events ---------- */
$('#views').addEventListener('click', (event) => {
  const button = event.target.closest('button'); if (!button) return;
  const view = button.dataset.value;
  if (view === state.view) return;
  const patch = { view };
  if (view === 'explore') Object.assign(patch, { market: 'all', stage: 'new', fit: DEFAULT_FIT, company: '' });
  if (view === 'applications') Object.assign(patch, { market: 'all', stage: 'all', fit: DEFAULT_FIT, company: '' });
  if (view === 'stats') Object.assign(patch, { market: 'all', stage: 'new', fit: DEFAULT_FIT, query: '', company: '', sort: 'fit' });
  update(patch);
});
$('#kpis').addEventListener('click', (event) => {
  const button = event.target.closest('.kpi'); if (!button) return;
  if (!button.dataset.patch) { if (state.view === 'explore') $('.source-panel').open = true; return; }
  const patch = JSON.parse(button.dataset.patch);
  const key = Object.keys(patch)[0];
  update(button.classList.contains('active') ? { [key]: key === 'stage' ? (state.view === 'applications' ? 'all' : 'new') : DEFAULT_FIT } : patch);
});
$('#markets').addEventListener('click', (event) => { const button = event.target.closest('button'); if (button) update({ market: button.dataset.value }); });
$('#stage').addEventListener('change', (event) => update({ stage: event.target.value }));
$('#fit-toggle').addEventListener('click', () => {
  const options = $('#fit-options');
  options.hidden = !options.hidden;
  $('#fit-toggle').setAttribute('aria-expanded', String(!options.hidden));
});
$('#fit-options').addEventListener('change', (event) => {
  const selected = [...document.querySelectorAll('#fit-options input:checked')].map((input) => input.value);
  if (!selected.length) { event.target.checked = true; return; }
  update({ fit: FIT_VALUES.filter((value) => selected.includes(value)).join(',') });
});
document.addEventListener('click', (event) => {
  if (event.target.closest('#fit-filter')) return;
  $('#fit-options').hidden = true;
  $('#fit-toggle').setAttribute('aria-expanded', 'false');
});
$('#fit-filter').addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  $('#fit-options').hidden = true;
  $('#fit-toggle').setAttribute('aria-expanded', 'false');
  $('#fit-toggle').focus();
});
$('#sort').addEventListener('change', (event) => update({ sort: event.target.value }));
$('#company-chip').addEventListener('click', () => update({ company: '' }));
let searchTimer;
$('#search').addEventListener('input', (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => update({ query: event.target.value.trim() }), 200); });
$('#pager').addEventListener('click', (event) => { const button = event.target.closest('button[data-page]'); if (button && !button.disabled) { update({ page: Number(button.dataset.page) }, { resetPage: false }); window.scrollTo({ top: 0 }); } });
$('#jobs').addEventListener('click', (event) => {
  if (event.target.closest('a')) return;
  const company = event.target.closest('.co');
  if (company) { update({ company: company.dataset.company }); return; }
  const job = event.target.closest('[data-job-id]'); if (job) openJob(job.dataset.jobId);
});
$('#jobs').addEventListener('keydown', (event) => { if (event.target.closest('a, button')) return; if (['Enter', ' '].includes(event.key)) { const job = event.target.closest('[data-job-id]'); if (job) { event.preventDefault(); openJob(job.dataset.jobId); } } });
$('#job-dialog .close').addEventListener('click', () => $('#job-dialog').close());
window.addEventListener('hashchange', () => { readHash(); writeHash(); syncControls(); state.view === 'stats' ? loadStats() : load(); });

async function initialize() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error(`configuration HTTP ${response.status}`);
    const config = await response.json();
    markets = config.markets;
    $('.brand h1').textContent = config.name || 'Job search';
    $('#markets').innerHTML = [...markets, { id: 'unknown', label: 'Unassigned' }, { id: 'all', label: 'All markets' }].map(m => `<button data-value="${safe(m.id)}" aria-pressed="false">${safe(m.label)}</button>`).join('');
    readHash(); writeHash(); syncControls();
    state.view === 'stats' ? loadStats() : load();
  } catch (error) { $('#jobs').innerHTML = `<tr><td colspan="6">Could not load campaign: ${safe(error.message)}</td></tr>`; }
}
initialize();
