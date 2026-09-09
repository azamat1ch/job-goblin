# Configuration contract

The agent writes settings after SETUP.md. `npm run configure -- --check`
validates discovery readiness. `--draft` allows unfinished roles and sources.
Neither command proves interview completion or live source coverage.

## Campaign: config/private/campaign.yml

```yaml
version: 1
name: Finance search
markets:
  - id: hk
    label: Hong Kong
    location_terms: [Hong Kong, HK, Kowloon, New Territories]
    remote: false
roles:
  primary: [Credit Analyst, Investment Analyst]
  adjacent: [Risk Analyst, Treasury Analyst]
filters:
  exclude_titles: []
  exclude_companies: []
  exclude_locations: []
  max_posting_age_days: null
applications:
  max_per_company_30_days: null
  allow_seniority_mix: true
discovery:
  retention_days: 30
  query_days: 21
  overlap_days: 3
```

This is a synthetic example, not an active default. Field names are validated;
unknown fields and wrong types fail. `markets` is any list of unique identifiers
and labels; `all` and `unknown` are reserved. Location terms classify geography,
not legal eligibility. `remote` distinguishes remote market matching. Native
HK connectors still only fetch HK regardless of a market label.

Role phrases are literal, case-insensitive with word boundaries. Primary matches
rank strong; all other roles remain possible. Adjacent roles guide query
construction and agent review. They are not an allowlist. Hard filters match
literal phrases, not regex. Do not use a broad term such as “analyst” to exclude
one narrow analyst specialty. Missing data survives. Maximum posting age is
optional; trusted repost dates take precedence. Salary, experience, licenses,
spoken languages, sponsorship and nuanced role scope belong in human-confirmed
preferences and contextual review, not unsupported YAML fields.

Positive day/limit values are integers 1–3650. Query days cannot exceed retention,
and overlap cannot exceed query days. Retention sets discovery and view windows; it does not impose application
eligibility. Only the explicit maximum posting-age setting closes dated stale
unselected rows; history remains in SQLite. The company limit counts the rolling 30-day
window, regardless of the retention setting. Unknown publication dates require
verification before queueing only when a maximum posting age is configured.
With no age restriction, undated roles can proceed through normal liveness checks. Dates in statistics are UTC.

## Sources: config/sources.yml

Top-level lists: `automated`, `linkedin`, `browser`. Each source has a unique
`name`, a configured `market` id, and optional `enabled: false`. Sources omitted
or disabled are not run. Source queries constrain discovery, so validate them
against actual returned jobs rather than assuming title synonyms suffice.

```yaml
automated:
  - name: finance-hk
    kind: efinancialcareers
    market: hk
    queries: [Credit Analyst, Investment Research]
linkedin:
  - name: linkedin-hk-credit
    market: hk
    keywords: Credit Analyst
    location: Hong Kong
browser: []
```

See [catalog](../catalog/README.md) for every native kind and source limitations.
For ATS/provider sources, use `kind: structured`, with `config: config/boards.yml`.
Copy only selected catalog entries into that private file; explicitly enable
them. It contains `tracked_companies` and/or `job_boards` lists. Each entry
needs a name and either a `provider` or an autodetectable `careers_url`.
Provider-specific parameters are documented beside the incorporated providers.
`search_terms`, `search_text`, `searchKeywords` or `keywords` vary by provider;
they are not interchangeable. `location_terms` explicitly limits structured
results but retains missing/count-only locations. Prefer broad retrieval and
review if local location aliases are uncertain. A browser source is a tracked
manual task, not an automated fetch.

Eightfold accepts `queries` and `location`; blank location searches broadly.
eFinancialCareers requires explicit queries and remains HK-only. Web3 accepts
`paths` and `max_pages`, with a broad remote default. Source health records
failures and partial responses; an empty result is not proof of market coverage.

## Assistant personality

Choose in SETUP.md or initialize with `npm run setup -- --persona generic|goblin`
(using one value, not the literal pipe). No option leaves an existing choice
unchanged. Setup creates three files in `config/private/agent/`: directive.md,
identity.md and voice.md. They are agent instructions, not YAML engine settings.
Their absence does not stop CLI data work; the agent asks for the mode during
onboarding. Repeating a mode preserves edits and fills missing identity/voice
files. If an established persona has lost its directive, setup reports the
missing file and requires recovery rather than silently installing a default.
Changing an existing mode happens through the agent following SETUP.md, so
personalization survives. Both modes use the same shared directive template.

## Other private files

`profile.yml` stores confirmed identity/contact details and jurisdiction-specific
authorization; arbitrary factual fields may be added by the agent. The engine
does not infer eligibility from citizenship or a city. `cv.md`, `answers.md`,
`preferences.md`, `onboarding.md`, and `state.md` have the ownership described in
[ARCHITECTURE.md](../ARCHITECTURE.md). Keep personal facts out of tracked examples.

After policy changes, run `jobs reclassify`, inspect existing new-stage verdicts,
and re-review affected jobs. A classifier refresh alone does not erase historical
AI judgments. Restart long-lived processes after changing configuration.

Active source identities must also be unique across nested portal entries and
other source lists. Suffix employer names by market when scanning multiple
regions, so their health records and query windows remain independent.

## Application follow-up cadence

`applications.follow_up_days` is null by default: application follow-ups do not
enter the due queue until the user chooses a cadence. Set a positive integer
(1–3650) to make an unanswered application due after that many days. Status and
`followups` use the same setting. The queue tracks the first application follow-up;
subsequent personal outreach can use explicitly dated outreach records. This
setting schedules no background work and sends nothing. Outreach dates remain
per-contact choices.
