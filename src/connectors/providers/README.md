# Provider modules

These public API, RSS, and HTML connectors are consolidated from CareerOps under
its [MIT license](https://github.com/career-ops-hq/career-ops/blob/main/LICENSE). They require no LLM for fetching. The
current constructor-facing catalog is [catalog/README.md](../../../catalog/README.md).
Provider availability does not guarantee current endpoint health or coverage.

## Contract

Each non-underscore `.mjs` file exports a default object:

```js
export default {
  id: 'provider-name',
  detect(entry) { /* optional: return a match or null */ },
  async fetch(entry, ctx) { /* return jobs */ },
};
```

[`_types.js`](_types.js) documents the job and entry shapes. Jobs contain `title`,
`url`, `company`, `location`, and optionally `description` and epoch-millisecond
`postedAt`. Empty or missing geography must remain unknown. Queries and optional
filters come from the entry; do not embed a profession or candidate policy.

[`_http.mjs`](_http.mjs) supplies `fetchJson` and `fetchText`, with a timeout and
non-2xx errors. The structured wrapper supplies `sinceMs` and `includeUndated`.
Providers should honor supported pagination controls and report truncation rather
than implying complete coverage. Not all inherited providers currently expose
truncation metadata; setup must compare counts/caps and record coverage gaps.

[`_registry.mjs`](_registry.mjs) loads non-underscore modules alphabetically. An
explicit `provider` takes precedence; otherwise `detect` selects the first
match. [`../structured.mjs`](../structured.mjs) executes the resolved provider.
Use the browser-job-source skill and shared import command for custom extraction.
Helpers never register as sources.

## Changes

Read the provider's own configuration comments before using it. Retain endpoint
host checks and redirect restrictions where implemented. Add a focused mocked
fetch/parser test under root `tests/<name>.test.mjs`, and run it with
`node --test tests/<name>.test.mjs`. The full repository check discovers these
tests. For a new provider, document its scope in the catalog and keep candidate
policy in private configuration. No separate vendor scanner or upstream CLI is
part of this repository.
