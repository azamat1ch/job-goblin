---
name: job-pipeline
description: Show job-search progress, update evidenced stages, reconcile failures and due actions, and maintain continuity in the shared SQLite pipeline.
---

# Pipeline

SQLite is the operational owner; use the CLI rather than a second stage tracker.
Read per-command help for exact arguments.

| Need | Command after `npm run jobs --` |
| --- | --- |
| Funnel totals | `status` |
| Source failures and health | `audit` |
| Working set / exact record | `list` / `show <id>` |
| Supported stage transition | `mark <id> <stage>` |
| Factual context | `note <id> --text "..."` |
| Clear retryable failure without changing stage | `retry <id>` |
| Due actions | `followups` |
| Application follow-up event | `followup <id> --sent` |

Lead with applications, replies, interviews, offers and actionable failures.
Listing counts diagnose coverage; drafts and preparations are not submissions.
Inspect ambiguous outcomes before retrying. Source outages and empty searches
need different remedies. Keep previously valid stages and submitted artifacts.

For conversion analysis include cohort size, dates and response time. Use
`job-research` when a bottleneck calls for a measured change. Save actual results,
unresolved decisions and the next concrete move in private state, reading it
before editing to preserve concurrent changes. Scheduling and notifications
follow the user's request; this CLI is not a background worker.

## Bring an existing campaign with you

For an application made before this workspace, import the actual posting through
`import` to obtain its job ID, then use:

```bash
npm run jobs -- history <id> --applied-at YYYY-MM-DD --stage interview --evidence "User-supplied tracker or confirmation reference"
```

The supported historical stages are applied, replied, interview, final_round,
offer and closed. Read command help for the optional channel. Use the real
application date and a supplied record or user report. If the date is unknown,
keep the process in private onboarding notes until it can be established; never
substitute today. A source posting date is separate from an application date.
For older known postings, choose an explicit `import --days N` window sufficient
for that history rather than changing their dates.

History recording works only on a new job without a previous application. It
preserves the supplied date, establishes the known stage and records its evidence.
It does not submit a form, fabricate a confirmation or require recreating lost
CVs. Keep any supplied old materials privately and link them in a note. Historical
stage transitions with unknown dates count in the lifetime funnel but not as
new replies today. Existing application records are preserved on repeat attempts.

If the user relaxes a posting-age exclusion, use `restore <id>` for affected
unsubmitted roles closed by that policy. It clears stale fit decisions while
preserving publication dates. It does not reopen manually closed or submitted
processes. Review the restored role under the new preferences.

The due queue follows `applications.follow_up_days`; null means no application
follow-up queue. Learn this choice during setup. Explicit outreach follow-up
dates remain attached to the contact and are independent of that setting.
