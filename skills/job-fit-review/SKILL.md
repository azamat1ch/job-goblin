---
name: job-fit-review
description: Review actual job duties against confirmed candidate evidence and compare employer siblings, persisting recommendations, maybes and exclusions.
---

# Fit review

Read current evidence and candidate preferences. Machine pre-review owns only
configured deterministic exclusions. Use `review-batch --hydrate` for survivors;
missing descriptions need retrieval, not a title-only recommendation. If they
remain unavailable, retain the uncertainty rather than inventing duties.

Review duties, scope, central requirements, transferable evidence and candidate
tradeoffs. Corporate grades are not universal seniority: a finance VP may have
no reports; a startup lead may own an entire function. Count relevant dated
experience without counting overlapping calendar periods twice. Unknown salary,
language or authorization is not automatically a failure.

Compare a company's active candidates and selected/applied jobs with
`list --company`, inspecting known aliases. Carry sibling context across chunks.
A staffing agency can represent unrelated clients: compare clients only when
identified. Apply company concentration limits only if this candidate chose them.

- `recommended`: a concrete case for applying now under this user's strategy,
  supported by the central responsibilities and actual evidence.
- `maybe`: plausible stretch, weaker proof or missing job information. Explain
  what would improve the decision; don't quietly bury the user's chosen stretch.
- `needs_answer`: a consequential personal fact only the candidate can supply.
- `skip`: a clear mismatch or chosen exclusion, with its specific reason.

Persist via `review-import` (see help): JSON array or JSONL with `job_id`,
`verdict`, `reason`, `gap`, `eligibility_note`. Check exactly one result per
assigned ID, supporting evidence, and cross-chunk comparisons. If a new role
changes an older sibling's verdict, persist both. A candidate correction can
invalidate a review even when the job description has not changed.

No fixed shortlist size, score threshold, model choice or application ceiling
belongs in this skill. Respect the user's breadth and risk appetite. If they
change a hard constraint, update its owning config, validate and reassess the
affected pool instead of arguing with their instruction through a stale filter.
