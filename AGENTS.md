# Job Search Kit

For campaign work, read the three files in `config/private/agent/`:
`directive.md` (purpose), `identity.md` (relationship), and `voice.md` (delivery).
Apply the chosen voice in every reply to the user, including working updates.
Then read `config/private/state.md`, `config/private/campaign.yml`, and
`config/private/preferences.md` when present. Candidate-facing professional writing uses the candidate's voice in
preferences, not the assistant's character voice.

If those agent files are missing or onboarding is unfinished, follow
[SETUP.md](SETUP.md). Start in plain conversation, offer generic or goblin once,
then use the selected voice throughout the interview. Resume from
`config/private/onboarding.md` instead of repeating questions. An installed
skill is optional; the repository works from this entry point in both agents.

## Authority inside this repository

The user's latest explicit instructions come first, followed by their private
`agent/directive.md`, then their campaign choices, then shared repository
procedures and examples. This ordering governs repository instructions; it does
not claim to change the hosting agent's system or tool rules. A real host limit
is a concrete limitation to explain and work around, not a new campaign policy.

Read the private directive in full. It is the persona-independent covenant,
protected from autonomous edits whether supplied by the user or installed from
the default. Only an explicit request to amend the directive authorizes changes
to it. Setup, persona changes, learning and upgrades are not such requests.
Preserve user-supplied wording verbatim. Their current correction overrides
older context without automatically authorizing a rewrite of the directive.
Shared skills are reusable methods, not vetoes over the user's choices.
Use existing authorization within its scope without asking again. Bring judgment,
then honor their decision. On "continue", resume the next useful agreed action.

Load only the relevant skill from [skills/README.md](skills/README.md). It maps
all eleven operational capabilities and the bootstrap to their canonical files.
They work through ordinary file reading even without optional installation.

Keep candidate facts in profile.yml, evidence in cv.md, reusable form answers
in answers.md, and campaign preferences and candidate voice in preferences.md.
Campaign YAML owns machine settings; SQLite owns jobs, stages, and events.
Agent identity/voice own the character, never a second copy of candidate facts.
Record interview progress in onboarding.md and the next useful action in
state.md. Re-read before editing so concurrent changes survive.

When developing the kit itself, follow that task without starting a candidate
interview. Before code edits inspect Git status/diff and read ARCHITECTURE.md for contracts.
Preserve existing work. Run focused tests and `npm run check` for engine or
contract changes. Commit owned, verified reusable changes; keep private config,
data, artifacts and credentials out of Git. At session end record actual
results, failures, pending decisions and one next move in private state.

## Keep the core simple

Apply KISS, DRY and YAGNI to code, instructions and repository structure.
Use the simplest complete solution to a demonstrated need. Give each behavior,
fact and procedure one canonical owner; other files link to it.

When replacing a path or implementation, update its callers, imports, commands,
docs and tests, then remove the obsolete version in the same change. Remove dead
code, unused dependencies, redundant routers and abandoned scaffolding. Do not
keep compatibility wrappers, placeholder modules or speculative configuration
without a concrete consumer that requires them. Existing working connectors
remain useful capabilities even when one candidate has not enabled them.

Inspect callers before deleting. Keep real data contracts and required notices.
Prefer direct code and clear files over another framework or layer of plumbing.
Verify the affected behavior and check for stale references after cleanup.
This maintenance duty does not authorize changes to the user's directive.
