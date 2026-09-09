# Build your campaign

This is an instruction for the agent and a readable guide for the candidate.
Start with conversation: “Help me set up my job search.” Resume existing setup
instead of replacing it. There is no built-in ideal candidate or target market.


## The contract before the interview

Build the user's system. The interview is how you discover it, not a test they
must pass before you help. Read the whole conversation and existing local files
first. Keep their exact instructions, including emotional stakes and language.
Ask deeply enough to understand consequential choices; research what you can
research yourself. Do not keep asking the user for facts already in their CV.

If the user supplies a directive, store it verbatim in
`config/private/agent/directive.md`. A quoted or pasted directive is their text,
not a draft for you to tone down. When they provide additions, preserve those
words as additions unless they asked for a rewrite. If they ask you to draft it,
use their own stakes and intensity, show the draft, and incorporate corrections.
The bundled Covenant is the persona-independent default. Once installed, it
is protected from autonomous editing just like a user-supplied directive. Only
an explicit request to amend the directive authorizes a change. Interview answers
update campaign context; they do not authorize rewriting the covenant. Existing
directives survive setup reruns, skill installation, persona changes and upgrades.

Generic and goblin share the same mission and level of effort. The user chooses
how the assistant talks; generic mode does not weaken their directive. Ask what
success would mean in their life and what they want the agent to take off their
shoulders. Financial urgency may be real, modest or absent. Use their account.

The latest user instruction overrides repository defaults and earlier campaign
choices. Reconcile a conflicting saved setting at its owner instead of obeying
stale YAML behind the user's back. Runtime capability and factual accuracy are
not adjustable preferences: name a real limitation accurately and find a useful
available route. Do not add an approval ritual because a template suggests one.

## How to conduct a thorough interview

Start with a short orientation: the kit finds and tracks jobs, the agent does
research and writing, and available browser/account tools determine external
execution. Explain that the library grew from an HK search and needs calibration
for their profession and markets. Then ask a small coherent batch, listen, and
follow the answer. Depth comes from useful follow-ups, not a wall of questions.

For every domain record one of: answered, not relevant (why), deferred (until
when), or unresolved (what depends on it). "Not discussed" is not consent or a
negative answer. At the end, account for every domain below. New questions can
emerge from a real posting or form; setup cannot predict every employer's form.
Tell the user what remains unknown and collect it when it matters.

Use this conversational loop:

1. Extract facts and existing choices from supplied material.
2. State your understanding briefly, separating fact from a proposed strategy.
3. Ask related questions that could change the next decision.
4. Translate the answers into the smallest owning private files.
5. Show a concrete consequence: a role lane, an example verdict, a draft or query.
6. Accept corrections, save progress and move to the next unanswered domain.

If they ask to start now, do useful work from the known context and finish the
interview alongside it. Do not treat optional personal details, every skill's
configuration or a formal sign-off as prerequisites to discovery.

## 1. Choose your assistant and establish the starting point

Early in the first conversation ask whether they want a generic assistant or
job goblin. Keep it concrete and short, for example:

> plain assistant or job goblin
> same job either way
> goblin sounds like “yes master, me find good work”

Do not repeat the choice if they already gave it. If they do not care, use
generic. If unanswered, stay plain and leave the question pending while working
on other setup context. After choosing, run one of:

```bash
npm ci
npm run setup -- --persona generic
# or
npm run setup -- --persona goblin
```

This creates exactly three private agent files from `templates/agent/`:
`config/private/agent/directive.md`, `identity.md`, and `voice.md`. Both modes
use the identical directive: help the user earn a living, follow what they ask,
and finish useful work with initiative. Generic has a plain assistant identity
and voice; goblin has a full character and its own speech, not occasional jokes.
Read the directive in full, then identity and voice, and continue setup in the
chosen voice. Keep character grammar out of the directive. CLAUDE.md routes
to the same AGENTS.md so the choice works in both runtimes without another skill.

Ask language, preferred form of address and banter preferences alongside the
normal interview, using existing answers rather than an extra questionnaire.
Goblin uses lowercase, fragments, sparse punctuation and me/master.
Personalize identity and voice with the user's corrections. Connect the
shared directive to their actual goal and priorities through the existing
candidate context; never invent financial distress or copy another user's stakes.
The candidate's public/professional writing voice remains in preferences.md.

There is no persona engine, score, lore database or extra memory. These three
Markdown files are the runtime personality. Plain `npm run setup` preserves
them, and repeating the same `--persona` fills missing files without overwriting
personalization. An existing different persona is preserved with guidance to
switch manually; see the last section. Do not rename this shared repo or alter
campaign filters to change a voice.

Read AGENTS.md, inspect the working tree, and run `npm ci` then `npm run setup`
from the repository root. Setup creates missing local files without replacing
existing ones. Read those files before editing. Use the scope the user gave you for live work. A setup-only request creates
configuration; an accompanying scan or application request should be carried
through using available tools and existing authorization.
Explain what the engine can automate and what requires the available agent,
browser or candidate. Ask which runtime they use only if it changes tooling.
Optional skill installation is described in README; setup itself needs no skill.

Invite an existing CV, portfolio, job-search notes, or a few example postings.
Use volunteered material first and return a brief understood-so-far summary.
Do not require a CV to begin: an interview can build an evidence bank. Ask for relevant context and explain why it changes the campaign. Let the user
choose how much detail to share and when to supply application-only fields.
Keep credentials in the account tooling rather than the repository.

## 2. Interview adaptively

Cover the domains below, but do not dump this entire questionnaire into chat.
Ask a small batch of related questions, use each answer to choose the next
batch, and skip already answered or irrelevant branches. A short first batch
can establish target work, locations, urgency, and available evidence. Follow
up on ambiguity that would change a recommendation. Never turn “unknown” into
“no”, a preference into an exclusion, or an agent suggestion into a confirmed
fact. Record each unresolved item with its consequence and when it must be
resolved. Save progress after every meaningful batch so another session can
continue without repetition.

### Outcome, stakes, and time

- What outcome counts as success: first offer, career change, compensation,
  return to work, specific craft, leadership, stability, or a combination?
- Is there a deadline, notice period, earliest start, or important dependency?
  Distinguish desired offer date from last viable start date; do not invent
  immigration timelines. Ask how urgent the income need is and whether a rough runway or deadline
  would help prioritization; accept the level of detail they choose.
- How much time and energy can the candidate spend each week? Which tasks
  should the agent do, which should be handed over, and at what cadence?

### Role direction and evidence

- Desired functions, example titles and title aliases, industries, seniority,
  work they want more/less of, and adjacent roles they would seriously consider.
- Actual responsibilities and scope: execution, ownership, mentoring, people
  management, budget, scale, research, customers, or commercial outcomes.
- Work and education chronology, employment types, projects, credentials,
  tools, languages, and strongest defensible accomplishments. Separate what
  they built from what a team did and confirmed measurements from estimates.
- Public links or work samples they want to share; confidentiality restrictions,
  unverified claims, gaps, career transitions, and constraints on employer names.
  A gap is context to handle honestly, not an automatic rejection.
- Assess experience against duties and evidence. Do not universally reject
  graduate roles or manager titles, add years from overlapping jobs, or turn a
  missing preferred tool into a hard filter.

### Geography and working arrangements

- Current base, acceptable countries/cities, remote/hybrid/on-site preferences,
  travel/commute limits, and whether relocation is possible and under what terms.
- Remote employment jurisdiction and workable time zones/overlap: “remote” is
  not “work anywhere”. Ask about contractor or employer-of-record arrangements
  only when relevant, without assuming they are acceptable.
- Confirm work authorization and sponsorship needs per target jurisdiction in
  the candidate's own terms, with relevant expiry dates only if needed. Unknown
  legal eligibility remains unknown. Refer uncertain legal interpretation to
  authoritative current guidance or qualified advice; do not derive it from
  nationality, residence, schooling, or the previous repository's candidate.
- Spoken/written language capability and how they want language requirements
  handled: strict prerequisite, discuss case by case, or accept screening risk.
  Never silently impose a universal language exclusion or ignore policy.

### Tradeoffs and exclusions

- Employment types (permanent, fixed-term, contract, part-time, internship),
  company stages/sizes, sectors, values, accessibility or schedule needs, and
  any named organizations to avoid. Ask for the practical accommodation or
  schedule constraint, not a diagnosis.
- Compensation expectations: currency, period, base versus total, negotiable
  target versus genuine floor, equity/benefits, contractor equivalence. Store
  what is confirmed; do not infer a hard salary floor from a target.
- For every exclusion ask what makes it hard and what exceptions are possible.
  Distinguish a hard requirement, soft preference, and unresolved question.
  Do not encode free-text exclusions as broad keyword filters without testing
  their false positives. Leave nuanced judgments to review.
- Selective versus broader application approach, willingness to stretch,
  recruiter/agency preferences, company concentration, duplicate applications,
  recency tolerance and follow-up cadence. Record the chosen first application
  follow-up delay in `applications.follow_up_days` (null disables the due queue);
  outreach follow-up dates are per contact. Offer sensible proposals with
  reasons, then record the candidate's decision; do not import someone else's
  quotas, deadline or intensity.

### Voice, materials, and operating permissions

- Preferred professional name, contact details to put in applications, CV
  language and format, writing samples, tone, wording they dislike, and what
  level of tailoring is worth their time. Contact details can wait until use.
- Existing applications, interviews, recruiter contacts, do-not-contact names,
  and accounts already in use. Import a minimal existing pipeline if supplied
  using the historical-record procedure in `skills/job-pipeline/SKILL.md`;
  do not fabricate historical stages from a CV or assume access to an inbox.
- Decide the normal handoff: draft-only, candidate fills/submits, or agent
  execution when explicitly authorized. Clarify what selection means; learn whether
  selecting a job means prepare, fill, or complete the application. Record any standing authorization
  with its scope, exclusions, and revocation. Carry out authorized work without requiring an extra approval for each item.
  When scope is unclear, resolve that specific ambiguity rather than restarting
  the permissions interview.
- Browser and connector availability, account access, budget or usage limits,
  notifications and review cadence. Use the user’s selected account workflow. Identify actual human-only steps
  such as MFA when encountered; do not assume every account flow is blocked.

## 3. Construct, do not just transcribe

Progressively fill the private files created by setup. Follow the actual
schema in the generated YAML and `npm run configure -- --help`; do not add
invented engine keys and assume they work. Put richer decisions in Markdown.

| Owner | Contents |
| --- | --- |
| `config/private/agent/{directive,identity,voice}.md` | Protected governing directive; identity and voice personalized during setup |
| `config/private/campaign.yml` | Machine-supported role/market policy, constraints, discovery and application settings |
| `config/private/profile.yml` | Confirmed candidate identity, location and reusable structured facts |
| `config/private/cv.md` | Dated evidence bank with precise roles, outcomes and unresolved claims |
| `config/private/answers.md` | Confirmed reusable form answers, scope and date; blank means unknown |
| `config/private/preferences.md` | Voice, decision tradeoffs, workflow/handoff and permission preferences |
| `config/private/onboarding.md` | Covered domains, decisions, unknowns, deferred questions and readiness |
| `config/private/state.md` | Current objective, blockers, outstanding decisions and next concrete action |
| `config/sources.yml` | Locally selected sources and parameters; private even if URLs are public |

Produce a concise tailored campaign brief in preferences: primary and adjacent
role lanes, evidence to lead with in each, market ordering, hard constraints,
soft preferences, handling of unknowns, source coverage, application handoff,
outreach approach, and weekly review cadence. Reference canonical facts rather
than copying them. Explain which requested policies the engine enforces and
which the agent must apply during review. Record each hard setting in
onboarding with the candidate statement or decision that authorized it and the
date; an agent proposal alone is insufficient. Generic workflows remain shared;
tailored choices belong in private configuration, not rewrites of AGENTS.md.

### Build each capability from the interview

Read [the skill map](skills/README.md). All eleven methods are available from
startup; installing them only adds named invocation. Personalize their inputs
in the existing private files. Do not create another policy file per skill.

| Capability | Context to elicit | Concrete output during setup |
| --- | --- | --- |
| Candidate voice | Real writing samples, recipient registers, dislikes, length | A corrected recruiter draft and reply; save style in preferences |
| Discovery | Title aliases, markets, industries, remote terms, time horizon | A query plan mapping each lane to sources |
| Browser extraction | Available browser, accounts already used, inaccessible sites | A usable route or explicit coverage gap per custom source |
| Fit review | Stretch appetite, must-haves, soft tradeoffs, company concentration | Calibrated fit/borderline/skip examples with reasons |
| CV tailoring | Base files, desired format, rewrite freedom, evidence priorities | A lane-to-proof map and reference CV plan |
| Applications | What selection authorizes, form handoff, answer policy | A ready-to-use handoff policy and deferred personal questions |
| Outreach | Who to contact, channels, voice, volume and cadence | A realistic contact strategy and example message |
| Inbox | Account access, known processes, matching evidence, reply scope | Existing pipeline reconciliation plan and next check window |
| Interviews | Target formats, weak points, schedule, practice style | Evidence stories and a preparation plan for the next stage |
| Pipeline | Existing jobs/stages, deadlines, reporting preferences | Imported history when supplied and a concrete next action |
| Research | Current bottleneck, assumptions, desired evidence | A decision to investigate or an explicitly deferred experiment |

"Use it later" is a valid answer for interviews or inbox. A skill's availability
is not an instruction to use it on every run. The goal is a coherent campaign,
not filling every possible artifact with speculative content.

### Follow the profession, not the original author's background

For finance, ask what kind of finance: accounting, FP&A, treasury, investment
research, risk, compliance, corporate finance, operations or another lane.
Explore reporting cycles, models, transactions, products, regulations, client
exposure, systems and credentials only as relevant. Ask which achievements can
be described publicly; confidential deal/client details can be generalized
without inventing numbers. Clarify whether VP/associate/manager is a corporate
grade, scope of ownership or people leadership. Determine which credentials
are completed, in progress or required for a specific role.

For engineering, explore delivered systems, scale, ownership and tools; for
design, research, sales or operations use evidence appropriate to that work.
Ask for duties they enjoy and examples of desired postings before overfitting
to familiar titles. "I work in finance in HK" leaves role, level, work rights,
compensation and goals unanswered; it is not a ready-made campaign preset.

### Explore choices until they are actionable

If they say "anything", ask which work they could demonstrate tomorrow, which
adjacent work they would learn, and what they would refuse. Offer plausible
lanes with reasons and let them choose broad or focused coverage.

If they say "remote", distinguish employment country, working hours, contract
structure and occasional travel. If they say "better pay", distinguish a target
from a walk-away floor, cash from total compensation and desired currency/period.
If they say "senior", ask about actual scope. If they say "apply for me", establish
the selected set or selection rule, account workflow and which unknown fields
need them. Keep already granted authority; do not renegotiate it each form.

For each hard exclusion, test an example it might wrongly remove. A broad title
keyword such as "sales" can exclude sales operations or analytics unintentionally.
Explain that engine filters are literal, and keep nuanced judgments in preferences.
The engine supports named settings in [configuration](docs/configuration.md);
a Markdown wish does not magically become a connector query or database guard.

## 4. Select sources honestly

No source is enabled by default. Inspect `catalog/` and its documented source
configuration before selecting entries. Copy selected portal entries into a private
`config/` file, enable them, and point the structured source’s `config` field
to that file; do not enable or rewrite the shared catalog. The inherited connector collection is
strongest in Hong Kong, with some remote boards and international employer ATS
support. It is not comprehensive coverage of every geography or profession;
a supported parser is not evidence that its board has relevant vacancies.

For each target lane/market, map at least one plausible source or mark a
coverage gap. Validate actual search parameters and available connector types.
Do not rename an HK source to claim another country's coverage. Use direct
employer boards, candidate-supplied URLs, or manual browser import for uncovered
markets. Propose a narrowly scoped adapter only when repeated need justifies
it. Research current sources as part of building the requested campaign; verify
which credentials and browser tools are actually available. Source tests must report blocked, partial, failed and
empty separately; “no results” does not prove no jobs exist.

## 5. Check decisions before scale

Use `npm run configure -- --draft` while the interview is incomplete; it
checks configuration shape without claiming launch readiness. Run
`npm run configure -- --check` for the readiness check. Fix errors in the smallest owning file;
do not hide invalid config by disabling validation. A passing check establishes
structure, not candidate fit or full legal eligibility.

Calibrate the campaign with three to five real candidate-provided or researched
postings (or clearly labeled fictional roles if network work is not requested):
one obvious fit, one genuine exclusion, and at least one borderline role.
Show the evidence, gaps, hard/soft distinction, and proposed recommended/maybe/
needs-answer/skip decision. Test a missing salary or uncertain sponsorship case
where relevant, and an adjacent title to catch overbroad filters. Ask whether
the result matches their intent. Correct the owning configuration when it does
not. Do not import fictitious jobs into the real pipeline.

Explain the coverage limitation and show a reviewable first action: exact
sources to scan or roles to assess, expected handoff, and unresolved blockers.
A launch-ready campaign has its chosen agent files and needs confirmed target work and markets, usable
candidate evidence for those lanes, agreed hard/soft constraints (including
explicit unknowns), a source/coverage plan, and understood external-action
boundaries. Sensitive optional answers, perfect CV formatting, compensation
research, and every future interview answer need not block discovery.

Summarize the choices and act on the user’s instructions. Record readiness
accurately: validated configuration, calibrated or provisional strategy, and
remaining unknowns. Their request to proceed is sufficient; no separate formal
sign-off is needed. Keep uncertainties visible and continue independent work.
Do not repeat a blanket confirmation request for already approved choices.

## 6. Resume and revise

Finish with next action, not another open-ended questionnaire. Later “continue”
reads private state and resumes the next agreed workflow. Collect deferred
information when it changes a real decision, not on every session start.

When the candidate changes direction, update the smallest owning file, record
what changed, rerun config validation and a relevant calibration example, and
reconsider affected unsubmitted jobs. For roles closed by the old age policy,
use `restore <id>` after relaxing that policy; this preserves actual posting dates. Do not silently erase pipeline history,
resubmit applications, change prior answers, or rewrite confirmed facts. If a
correction affects a sent application, explain the consequence and prepare any
necessary correction for the candidate's decision.

### Change the voice later

When the user asks for a different mode, read the existing three agent files and
the selected identity/voice templates. Update identity.md and voice.md, including
the persona marker at the top of identity.md, to the requested mode. Preserve
applicable personal choices such as language, name/address and brevity; remove
conflicting character rules instead of combining both modes. Keep directive.md,
all candidate files and the pipeline unchanged. This explicit request is enough;
do not ask them to approve the same choice again. A quick “be plain for this
answer” changes that answer, not the saved mode. Save a lasting change when asked.

Check the selected voice on an onboarding question, a routine result, an error
and a recruiter draft. Goblin should remain concise and recognizable through
all user-facing situations, while the recruiter draft stays in the candidate's
professional voice. If the user corrects the style, edit the owning voice file
rather than adding another skill or another layer of instructions.

## 7. Leave a usable campaign, not interview debris

Finish with a short walkthrough in the chosen voice: what the assistant now
understands, what it will do next, what it still needs and where those choices
live. Use the following headings inside the existing onboarding.md; they are
an outline to fill, not another generated file or questionnaire to paste at once.

```markdown
# Onboarding
Status: in progress / provisional / ready

## Coverage
Domain | Answered / not relevant / deferred / unresolved | Owner | Next trigger

## Decisions
User statement or decision | Date | Effect | Owning file/setting

## Source plan
Lane / market | Source / query | Tested status | Gap / fallback

## Calibration
Real or fictional posting | Evidence | Verdict | User correction | Config effect

## Open items
Question | Why it matters | Action it affects | When to ask

## Next action
Exact next useful task and existing authorization
```

A complete construction pass checks:

- directive is the user's exact text or the draft they asked for; character
  preferences did not change mission, permissions or filters
- every interview domain is accounted for, with consequential gaps visible
- professional voice and conversational voice have separate owners
- sources reflect chosen lanes and their actual geographic capabilities
- draft/config readiness validation matches the real state
- calibration includes borderline roles and unknowns, not only obvious matches
- existing pipeline and submitted versions survive imports and revisions
- another agent can resume from state without asking the same questions

Installing or updating shared skills never overwrites private answers or the
user's directive. Campaign corrections belong in their existing owners, not
copied into the directive or every skill. Amend the directive only when the user
explicitly requests that amendment. If a genuinely new reusable technique emerges, improve its one
shared skill while keeping personal decisions private.
