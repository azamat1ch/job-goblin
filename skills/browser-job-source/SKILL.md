---
name: browser-job-source
description: Extract and import jobs from custom, blocked or JavaScript-heavy sources when structured connectors cannot cover the requested search.
---

# Browser source extraction

Read the requested market, role lanes and source recipe. Use the browser tools
actually available in this runtime and the user's chosen session. Consult
[extraction details](references/extraction.md) for paging and import shape.

Prefer a supported public endpoint or existing connector when it supplies the
needed content. Otherwise inspect the live page and follow its real controls.
Search every requested lane, including aliases and adjacent roles; do not add
an engineering-only title screen or assume Hong Kong from this source's history.

Complete the agreed search window or report exactly where it stops. Record
source health with `npm run jobs -- source` using its current help. An opened
landing page is partial. Empty is a successfully searched scope with no matches.
Blocked, partial and failed are different outcomes. Preserve useful extracted
jobs even when the last page fails.

A blocked route deserves diagnosis: inspect the error, session, pagination or
supported alternative. If a human-only challenge actually requires the user,
retain the URL and exact handoff and continue unaffected sources. Save recurring
site lessons with date and observed behavior; don't turn one failure into a
permanent prohibition or assume yesterday's selector still works.
