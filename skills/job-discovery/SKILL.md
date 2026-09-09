---
name: job-discovery
description: Find, import and deduplicate roles for the candidate’s chosen lanes and markets, then complete fit review and report source coverage.
---

# Discovery

Read campaign settings, preferences, state and source configuration. The user's
requested scope controls this run. `status` and `audit` show pipeline and source
health; use `find --help` for current options. Choose the configured market IDs.

1. Scan enabled sources appropriate to the requested lanes. Inspect source-side
   title, location, date and page filters: they can hide jobs before fit review.
   Track coverage for each lane, not merely the number of working connectors.
2. Diagnose failures and use `browser-job-source` for uncovered custom sites.
   Import through the shared engine; retain canonical employer links and real
   requisition identities. A new board ID can represent a fresh posting;
   a repeated sighting alone does not prove a repost.
3. Run pre-review, hydrate surviving incomplete descriptions, and run pre-review
   again. `review-batch --hydrate` performs this boundary. Read `job-fit-review`
   and complete the new/changed survivor pool within the user's scope.
4. Present IDs, employer, role, direct link, specific evidence, material gaps
   and next action. State which sources were partial or unavailable. Persist
   every completed decision so the next run resumes rather than redoing work.

Chunks are an execution choice, not an excuse to stop at the first handful.
If the user requests a quick sample, honor that scope and label it as a sample.
Priority, breadth, freshness and whether selected applications come first are
candidate decisions, not inherited quotas. For a coverage diagnosis read
[coverage audit](references/coverage.md).
