# Reusable core audit

Reviewed 10 September 2026 against the original campaign's eleven skills and
the requested constructor-repo design. The first extraction retained the engine
and broad workflows but compressed several useful procedures too aggressively.
They now have distinct canonical skills, with private inputs supplied by setup.

## What similar repositories do

[Career Ops onboarding](https://career-ops.org/docs) scaffolds a workspace
idempotently, then uses conversation to gather a CV, role direction,
compensation and location. Its first evaluation combines candidate evidence
with a real posting. We retain conversational construction and concrete
calibration, while making the interview more thorough and resumable.

[Career Ops agent instructions](https://github.com/career-ops-hq/career-ops/blob/main/AGENTS.md)
route among separate modes and shared utilities. They distinguish board
verification from content coverage, and retain interview and application
history. This supports loading focused procedures and checking actual source
results rather than counting installed connectors.

[Job Application Skill](https://github.com/privacydied/job-application-skill)
separates applicant profile, role targets, reusable form answers and optional
role-family resume positioning. Its [skill entry point](https://github.com/privacydied/job-application-skill/blob/main/SKILL.md)
keeps shared browser primitives and site-specific lessons, including failures
where visible form values do not persist. We retain separate private inputs,
verified form outcomes and narrow reusable lessons. We do not import its browser
backend, credential storage or profession-specific title policy.

These are design observations from documentation, not benchmark results or
live end-to-end tests of those projects. The changes here are our implementation;
no external setup scripts were executed as part of research.

## Capability accounting

All paths below are relative to `skills/` and contain `SKILL.md`.

| Original capability | Reusable owner | What survived / became candidate-specific |
| --- | --- | --- |
| Personal outbound voice | `candidate-voice` | Writing samples, registers, correction memory; personal style becomes private preferences |
| Browser job source | `browser-job-source` | Full-window extraction, stable IDs, import shape, honest source health; browser and role lanes are user choices |
| Discovery | `job-discovery` | Source diagnosis, deduplication, full survivor review, coverage audit; no default HK-first order |
| Fit review | `job-fit-review` | Hydration, evidence, contextual seniority, sibling comparison, persisted verdicts; no fixed employer quota or model |
| CV tailoring | `job-cv-tailoring` | Evidence mapping, checked-file reuse, source and final-file verification; format and edit scope are user choices |
| Application execution | `job-apply` | Exact form/answers/upload, conditional fields, salary strategy, live preflight, confirmation and retries; no universal manual handoff |
| Outreach | `job-outreach` | Evidence-backed contact selection, role-to-proof message, exact artifacts and follow-ups; user controls channel, scope and cadence |
| Inbox | `job-inbox` | Thread/requisition matching, ambiguity retention, actual-stage updates and deadlines; no Gmail-only assumption |
| Interview | `job-interview` | Exact submitted material, evidence stories, role-specific practice, logistics and debrief |
| Pipeline | `job-pipeline` | One SQLite authority, status, retries, notes and continuity |
| Research | `job-research` | Current sources, concrete decisions, measurable cohorts and keep/change/stop experiments |

`job-search-bootstrap` is the twelfth skill. It points to SETUP.md rather than
maintaining a second interview. The redundant workflow directory was removed;
entry points and CLI guidance now refer directly to skills. Both runtime installers link the same
canonical skill directories; setup supplies private context without making
personalized copies of every procedure.

## Constructor and directive

SETUP accounts for every interview domain, including professional voice,
evidence, role aliases, finance-specific scope, source gaps, compensation
strategy, execution scope, existing processes and learning. Each domain can be
answered, irrelevant, deferred or unresolved. A request to start work permits
progress alongside remaining interview questions.

The private directive preserves the user's words. Repository defaults sit below
the user's latest instruction and their directive. The bundled Covenant supplies persona-independent governing principles, while
private identity/voice determine how the assistant speaks. Agents may amend any
installed directive only on explicit user instruction; routine personalization
and learning do not authorize it. A persona change does not rewrite the directive.
Runtime system/tool requirements remain runtime requirements; Markdown cannot
change them or create missing account access.

The audit also found an engine leak: application preparation inherited a
mandatory publication date and discovery-retention age ceiling. Application
age checks now follow only `filters.max_posting_age_days`; null allows undated
and older stored roles through normal liveness checks. Discovery/view windows
remain separately configurable and are explained during setup.

## Real limits and intentionally absent machinery

- Connectors and dashboard remain under `src/`, including the incorporated
  providers. HK-specific providers still have HK-specific reach; generic role
  filters do not turn them into global sources.
- The skills are agent procedures, not a bundled autonomous browser or document
  service. Browser access, inbox tools and PDF rendering depend on the runtime.
  The original personal CV renderer/template was not ported as a universal CV
  design; the skill explicitly describes the available-tool workflow.
- No scheduler runs after the agent session ends. No messages or applications
  are sent by the tracking CLI itself.
- No fixed application volume, shortlist ceiling, CV rewrite budget, salary
  figure, language policy or contact interval is imposed by the skill library.
  Source paging/windows and engine settings still have concrete semantics;
  setup must configure and disclose them rather than promise unlimited coverage.

The goal is transferable working methods with honest capability boundaries,
not an assertion that every future source or employer form will work unchanged.

## Constitutional directive follow-up

[Ouroboros BIBLE.md](https://github.com/razzant/ouroboros/blob/main/BIBLE.md)
uses numbered principles, constitutional continuity and protection against
incremental erosion. It also prioritizes its own agency and permits reviewed
constitutional evolution. Our adaptation uses a different mission: the user's
success, with directive amendments reserved to explicit user instruction.
The resulting Covenant is independent of character voice and lives at the
existing directive path; no duplicate bible or additional personality file was
introduced. Its protection is an agent instruction plus non-overwriting setup,
not a claim of filesystem immutability or control over the hosting runtime.

## Independent completeness re-audit

A fresh independent agent compared the original skills/references, native
adapters, provider inventory, setup promises and working CLI against this kit.
It reproduced a historical-import gap using a temporary synthetic database.
It confirmed substantive coverage of all eleven original skill capabilities and
all fourteen native adapter modules. The original provider directory had 74
`.mjs` files; 71 remain, including helpers. The removed local-script executor,
unused trust helper and personal keyword helper were intentional removals.

Four substantive fixes resulted:

1. Application follow-up timing now comes from nullable
   `applications.follow_up_days`, shared by status and the due queue.
2. Wellfound snapshots now have a working `import --format wellfound` route.
   Onsite jobs survive extraction, and unknown geography is not labeled remote.
3. `history` records existing applications with their real dates, known stages
   and supporting evidence. It does not pretend a fresh submission occurred.
   Undated historical stage changes contribute to lifetime counts, not today's
   activity. Existing applications cannot be overwritten through this route.
4. `restore` lets a relaxed age policy reactivate its own unsubmitted closures
   without inventing a repost. Manual closures and submitted history are excluded.

The reviewer then examined the fixes and caught an accidental formatter in
review-import and rejection of valid timezone offsets in history dates. Both
were corrected; regression tests cover actual CLI history/restore flows.

### Refreshed comparison and judgment

[DaKheera47 Job Ops](https://github.com/DaKheera47/job-ops) presents an integrated
search, scoring, CV export and Gmail tracking application. Its documentation
helps distinguish bundled application features from the procedures that this
kit delegates to the host agent. We make those runtime dependencies explicit;
we did not add a service stack or mailbox watcher to claim feature parity.

[yuyao-wang Jobops](https://github.com/yuyao-wang/Jobops) emphasizes resumable ATS
execution, historical migration, exact outcome evidence and a separate private
workspace. It also documents incomplete production wiring. The relevant lesson
here is to validate executable paths and preservation of history, rather than
infer completeness from a skill list or passing parser fixtures.

[Career Ops](https://github.com/career-ops-hq/career-ops) continues to organize
its interface around shared skills and focused modes. The kit already follows
that separation, so this audit did not justify another routing layer.

These comparisons are documentation reviews, not live reliability benchmarks.
The original bespoke CV renderer/checker remains intentionally unbundled: its
one-page/layout assumptions would reintroduce personal policy. Its useful
techniques—evidence comparison, exact-file reuse, rendering, extraction and
visual inspection—remain in job-cv-tailoring, using available runtime tools.
The Covenant was not modified during this audit.
