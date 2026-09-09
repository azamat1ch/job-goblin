---
name: job-apply
description: Prepare and complete requested job applications with the chosen handoff, exact materials, browser verification and truthful outcome tracking.
---

# CV and applications

Start with a named job and the current campaign's handoff/authorization policy.
Read `show <id>`, the full employer posting, candidate evidence and reusable
answers. Use `prepare --help`, `preflight --help`, and `apply --help` before
recording results. These commands track and guard work; they do not submit a
browser form or grant permission to do so.

## Prepare the strongest supported application

Use `job-cv-tailoring` for the CV and `candidate-voice` for external prose. Read
[form and salary handling](references/forms.md) for conditional questions.

Verify the role is live on its exact application page. Check duplicates and
configured company/freshness limits with `prepare`. Respect reservations so
only one worker handles a job. If a guard fails, investigate the actual cause;
do not invent a repost date or override a user constraint to force progress.

Tailor emphasis and ordering to the role's actual requirements. Keep employer
names, titles, dates, degrees and attributable outcomes exact. Count relevant
research, internships and projects when evidence supports them; explain the
basis of a forced experience number and never double-count overlapping dates.
Do not invent metrics, team ownership, credentials or legal answers. Group
missing consequential facts into one short question when needed. Use the
candidate's voice and strongest defensible framing; don't mechanically replace
keywords throughout a CV. Reuse a checked CV when suitable. Write a cover
letter only when required or useful under the campaign's preferences.

Save the exact upload file and exact answers beneath `artifacts/<job-id>/`.
Verify generated documents visually and check extracted text, names, dates,
page breaks and ATS readability with tools available in the runtime. Keep
private originals and submission versions distinct. Do not claim a PDF exists
until an actual uploadable file has been produced and checked.

## Fill and verify

Follow the configured handoff: give the candidate exact files, answers and the
open form, or fill it when authorized and browser tools are available. Inspect
labels and visible state, especially custom dropdowns, phone-country selectors,
location suggestions, mandatory consent, and uploads. A successful click or
file selection does not prove the form stored the value. Recheck persisted
fields before final submission. Use confirmed scoped answers; never infer
citizenship, authorization, salary, background checks or demographic choices.
Research role-specific compensation if requested; distinguish a negotiable
expectation from a confirmed floor and record exactly what was answered.

Use the user’s chosen account workflow. Reuse an available authenticated session;
ask for user involvement when a credential or human challenge actually needs it. If an
unknown required answer blocks the form, preserve the completed work and ask
for that answer. Do other authorized work while waiting. Do not restart a form
or generate duplicate submissions after an ambiguous response.

Immediately before submission, verify the exact role/form is still live and
record `preflight <id> --browser-live`. Carry out the requested submission under the agreed handoff. A user-reported submission is useful evidence, but inspect the
confirmation when possible. Record `apply` success only with the exact CV,
answers and observed success text/confirmation ID required by engine guards.
If confirmation is ambiguous, inspect existing applications or email rather
than submitting again. Failures remain beside the last valid stage with the
specific reason; `retry` clears a failure without pretending the job advanced.

Finish with what was actually submitted, what remains prepared/blocked, and the
next agreed action. Offer or prepare relevant outreach with `job-outreach`, following the user’s instructions. Preserve one-off form facts in the job
artifact and only add repeated general lessons to this workflow.
