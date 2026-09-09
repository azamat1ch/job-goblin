# Architecture

A local job-search workspace assembled by an agent after interviewing its user.
No server account, hosted service, model API, scheduler, or framework is required.

## Ownership

- `AGENTS.md` routes agents; `CLAUDE.md` imports it for Claude Code.
- `templates/agent/` supplies one shared directive and generic/goblin identity
  and voice. Setup copies the selected mode into three private Markdown files;
  AGENTS.md loads them every session. The directive is a persona-independent
  covenant: agents may amend it only on explicit user instruction. Personalization
  otherwise updates identity, voice and campaign context. No runtime persona
  engine is involved.
- `SETUP.md` owns the adaptive onboarding procedure and readiness criteria.
- `skills/` owns eleven operational procedures plus bootstrap. The agent supplies judgment,
  browser interaction, document tools and authorized external communications.
- `src/connectors/` contains native site connectors and `providers/` contains
  the incorporated CareerOps providers. `structured.mjs` handles their registry.
  There is no runtime dependency on another repo or a vendor directory.
- `src/lib/campaign.mjs` owns validated campaign settings and literal matching.
  `src/lib/jobs.mjs` owns normalization and ranking; `pre-review.mjs` applies
  only explicit hard exclusions. `sources.mjs` validates source configuration.
- `src/db/` owns SQLite, deduplication, events, review, stages and application
  recording invariants. `src/cli/jobs.mjs` orchestrates these components.
- `src/web/` serves a read-only dashboard on loopback. Markets come from the
  campaign. Statistics use UTC dates. The API exposes no candidate profile.
- `catalog/` holds disabled source recipes and honest coverage limitations.
  `examples/` holds synthetic campaign configurations, never active defaults.
- `scripts/setup.mjs` creates missing private files and the database. Re-running
  never overwrites candidate files. `configure.mjs` checks configuration;
  `install-agent.mjs` optionally links all canonical skills into the selected runtime directories after
  preflighting the full set for conflicts. Private files are never install targets.

## Private instance

One checkout normally equals one person. `config/`, `data/`, and `artifacts/`
are ignored. `config/private/agent/{directive,identity,voice}.md` owns the
shared purpose, selected character and assistant voice. `config/private/campaign.yml` is machine-readable policy;
`profile.yml` holds candidate facts; `cv.md` holds evidence; `answers.md`
holds reusable form answers; `preferences.md` holds campaign judgment, candidate professional voice and
working permissions; `onboarding.md` records interview coverage and decision provenance;
`state.md` is the short next-action handoff. Do not duplicate these facts in
tracked instructions. Fresh setup has no candidate and no enabled sources.

`JOBS_ROOT` optionally selects an isolated workspace root. Code and static
assets always resolve relative to this checkout. `JOBS_DB` can override the
SQLite path and `JOBS_CAMPAIGN` can override the campaign YAML for tests or
explicit advanced use; normal operation needs neither. A new process reads
changed settings. Restart the dashboard after changes.

## Data flow

Configured source queries → connectors → normalized jobs → SQLite → agent fit
review → selected jobs → application artifacts and browser confirmation →
pipeline. Browser/manual discoveries enter through the same import command.
The dashboard reads this database, never a second tracker. `import --format
wellfound` normalizes browser page snapshots through the existing Wellfound
parser; ordinary import accepts normalized job records.

Role terms rank but do not discard unfamiliar titles. Missing location, dates,
salary, language or authorization information is not a rejection. Explicit
hard title/company/location/age exclusions become recorded pre-review skips.
Source-side queries and location_terms can limit what is fetched; onboarding
must explain and calibrate those boundaries. Retention defaults to 30 days and
is configurable; it controls discovery/view windows, not application eligibility.
Only the explicit max posting-age filter expires dated new-stage rows. Undated
applications require a verified date only when that age filter is enabled.
Neither setting deletes applied history. `restore` reactivates only unsubmitted
policy-expired rows after a relaxed age limit, preserving original dates.

Canonical URLs, employer application routes and conservative company/title/
location matching deduplicate jobs; distinct employer requisitions and LinkedIn
posting IDs remain distinct. Trusted later ATS publication dates clear old
reviews. Hydration clears reviews when descriptions change. Campaign policy
changes require reclassify and review of existing new-stage decisions; do not
silently reuse verdicts produced under the former policy.

Application recording requires a queued role, recent preflight, exact upload
and answers within its artifact directory, and visible success evidence.
Duplicate submission protection is mandatory. Company volume and mixed-seniority
limits are configurable, disabled by default. None of these commands grants
permission to send messages or submit applications.

`history` records a past application on a new record with the supplied real date,
known stage and evidence. It bypasses current-submission preparation because no
new submission occurs. Historical events carry provenance; undated historical
stage changes count toward lifetime progress but not daily activity. Repeated
history ingestion cannot overwrite an established application.

`applications.follow_up_days` is nullable and controls the first application
follow-up due queue and its status count through one query. Outreach follow-up
dates stay per contact. Neither mechanism schedules a background process.

## Extension and checks

Add a site parser beside the existing connectors, with mocked fixtures. Add a
native dispatch case only when a provider cannot serve the site; add its kind
to `SOURCE_KINDS`. Prefer explicit source parameters over changing common code.
Preserve the incorporated MIT notice when editing providers.

Run `npm run check` for syntax and offline behavior tests. Source liveness is a
separate, recorded discovery check; offline tests do not imply global coverage.
