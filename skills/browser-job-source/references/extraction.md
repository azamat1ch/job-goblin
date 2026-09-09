# Extraction and import

Inspect visible page structure before interacting. Prefer DOM text and links;
use screenshots when the available structured state omits needed information.
Virtual lists recycle nodes: collect stable posting IDs/URLs while scrolling,
merge across pages and detect repeated pages. A visible total is not a count
of records actually inspected. Record queries, filters, pages and any cap.

Follow detail links for plausible jobs. Preserve direct employer application
URLs and separate requisitions even if titles match. Keep unknown dates absent;
a retrieval timestamp is not a posting date. Verify suspected closures at the
employer when possible. A network failure is not evidence of closure.

`npm run jobs -- import --help` describes input flags. JSON arrays and JSONL
are supported; `-` reads stdin. Each record needs `company`, `title`,
`source_url`. Include observed `application_url`, `location`, `description`,
`posted_at`, `salary_text`, `source`, and the configured `market` ID when known.
The exact field contract lives in `src/lib/jobs.mjs` (`normalizeJob`).

Inspect import counts and errors. Record partial/blocked health AFTER import
so an automatic import success does not disguise incomplete coverage. Keep
credentials in the runtime's account/session mechanism, not extraction files.

## Wellfound browser snapshots

When the available browser exposes Wellfound's Next.js `__NEXT_DATA__` page
state, save that JSON object (or an array of page objects) privately. Use browser
APIs permitted by the runtime to read observed page data; this is not an HTTP
scraper or an assumption that every live page still exposes this structure.

```bash
npm run jobs -- import artifacts/wellfound-pages.json --format wellfound --source wellfound
```

The shared Wellfound parser flattens observed pages, resolves company references
and deduplicates posting URLs. It retains onsite roles and unknown geography;
remote labels require evidence in the snapshot. Apply the candidate's preferences
during review. If the current page uses a different structure, extract normalized
records from the observed content and use ordinary `import` instead. Record any
partial source status after import, as for other browser sources.
