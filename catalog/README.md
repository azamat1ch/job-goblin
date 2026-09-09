# Connector inventory

These are inactive building blocks, not a ready-made source plan. Copy selected
entries to `config/sources.yml` and selected structured entries to a file under
`config/`; set `enabled: true` only after tailoring and a small live check.
`catalog/sources.yml` lists native/browser source shapes. `portals-*.yml` list
reusable employer endpoints and boards. `coverage.yml` states geographic limits.

The inventory grew from a Hong Kong technology search. Employer choices are
therefore biased toward finance/technology and Hong Kong; their presence is not
a recommendation. Many ATS providers work internationally, but that does not
make the configured employer inventory comprehensive. The agent must identify
missing local/professional sources during setup and record gaps. Endpoint
availability and access restrictions must be tested; no catalog entry is a
promise that a site currently works.

## Configuration contract

- Native `kind: structured` entries point `config` at a YAML file containing
  `tracked_companies` and/or `job_boards`. Entries accept an explicit `provider`
  or a supported `careers_url` for detection. Their provider module documents
  additional options; inspect it before assembling an unfamiliar entry.
- `location_terms` is an optional list of literal location alternatives matched
  at word boundaries. Without it, the structured wrapper does not filter
  geography. Missing/count-only locations always survive for review. Use city,
  country, and region aliases appropriate to the user's scope. A market label
  never implies work authorization or imposes the old global country list.
- Workday accepts `search_text`, or `search_terms` for separate deduplicated
  searches; absent either it searches broadly. `location_text` optionally
  selects a Workday location facet; `max_pages` caps requests. Truncation is
  reported as partial. Large employers need targeted queries after onboarding.
- Eightfold accepts `queries` and `location`; absent them it searches broadly.
- eFinancialCareers requires a non-empty `queries` list and currently requests
  Hong Kong jobs. Queries can be credit analyst, treasury, accounting, or any
  other confirmed role. It does not require engineering titles.
- JobsDB/Jobstreet/SEEK use `searchKeywords`; set it before enabling the example.
  WTTJ needs `wttj.queries`; VDAB needs `vdab.keywords`. There is no implicit
  candidate-profile read inside provider selection.
- LinkedIn entries need `keywords` and `location`; remote entries may set
  `remote: true`. Guest search availability and pagination limits vary.
- Web3.Career defaults to `/remote-jobs`; optional `paths` narrow the board.
  A crypto-focused board remains crypto-focused regardless of query breadth.
- Browser sources are manual extraction work for the agent and its available
  browser tools. They are not automated or installed browser connectors.

Source-level query/location/category choices affect recall before review. Show
those choices during setup calibration, including what is excluded. Soft
preferences belong in campaign ranking, not hidden connector filters.

## Provider implementation and attribution

All fetch implementations live in `src/connectors/`. `providers/` contains the
upstream CareerOps provider implementations (with local modifications), alongside
native connectors. This is one source tree, with no runtime vendor dependency.
Provider files retain source comments and per-provider configuration examples.
Custom browser extraction uses the import command and browser-job-source skill.
There is no configured local-command provider or automatic script-execution shim.
