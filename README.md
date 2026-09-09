# Job Goblin

A reusable job-search workspace for Codex or Claude Code. An agent interviews
you, builds your private campaign, and uses a local CLI/database to discover,
review and track jobs. The repository supplies procedures and connectors;
you supply the facts, priorities and permission for external actions.

## Start

Use Node.js 24 or newer and npm. Clone the repository:

```bash
git clone https://github.com/azamat1ch/job-goblin.git
cd job-goblin
```

Open its root folder in Codex or Claude Code, then say:

> Read AGENTS.md and help me set up my job search. Use what I already know,
> interview me for consequential gaps, and build a campaign that fits me.

The agent follows [SETUP.md](SETUP.md), an adaptive interview covering evidence,
roles, markets, constraints, preferences, sources and working permissions.
You can also initialize the empty local workspace yourself:

```bash
npm ci
npm run setup
npm run configure -- --draft
```

Setup preserves existing files. No source is enabled and no application is
submitted by initialization. Resume the interview any time; a perfect CV and
all possible application answers are not prerequisites to useful progress.
When the campaign is configured, run `npm run configure -- --check` for readiness
validation. See [ARCHITECTURE.md](ARCHITECTURE.md) for engine contracts.

## Plain assistant or job goblin

Setup asks which one you want. Both pursue the same goal: help you earn a living
and do the work you ask for. The difference is personality and conversation.

> yes master
> me check the boards

Goblin is resourceful, opinionated and loyal, with lowercase fragments and very
little punctuation. It remembers your real work, collects useful evidence, and
owns mistakes. CVs and recruiter messages still
sound like you. Generic mode stays a plain assistant.

```bash
npm run setup -- --persona goblin
# or --persona generic
```

Three private files live under `config/private/agent/`: the governing directive,
identity and voice. The [Covenant](templates/agent/directive.md) is shared by both
personas and protected from autonomous edits. Only your explicit request to amend
it authorizes a change. Setup personalizes identity, voice and campaign context;
your own directive text is preserved verbatim. Re-running setup preserves existing
files. Switching modes changes identity and voice while preserving the directive
and search history. No extra skill or service.

## Agent integration

The repository works without installing a skill: Codex uses `AGENTS.md` and
Claude Code uses `CLAUDE.md`, which imports the same canonical instructions.
Start your agent in this repository so project instructions are discoverable.
These integration paths follow the official [Codex instructions guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [Claude Code memory guide](https://code.claude.com/docs/en/memory).

For named invocation of all twelve skills, optionally run one of:

```bash
npm run install:agent -- --agent codex
npm run install:agent -- --agent claude
npm run install:agent -- --agent both
```

This links each canonical skill under `skills/` into the
project's `.agents/skills/` and/or `.claude/skills/`. It changes no user/global
settings and never replaces existing instructions or skills. Rerunning is safe;
conflicting paths produce an actionable error. The installer supports repository
paths containing spaces. Symlink creation must be available (Windows may require
Developer Mode or an appropriate shell); if unavailable, use AGENTS/CLAUDE startup
without the optional skill. Reopen the agent session if it does not discover the
new skill, then use `$job-search-bootstrap` in Codex or `/job-search-bootstrap`
in Claude Code. See official [Codex skills](https://learn.chatgpt.com/docs/build-skills)
and [Claude skills](https://code.claude.com/docs/en/skills) for current discovery
behavior. Installation does not select a model or grant account/tool access.

## Daily use

Ask in ordinary language: “Find roles in my agreed markets”, “Review these
postings”, “Prepare applications for these jobs”, “Check replies”, “Help me
prepare for this interview”, or “What should I do next?” The skills route
through the same job IDs and preserve what was actually done.

```bash
npm run jobs -- --help
npm run jobs -- status
npm run jobs -- audit
npm run dashboard
npm run check
```

Use per-command `--help` for flags and [browser extraction](skills/browser-job-source/references/extraction.md) for
import shapes. The CLI performs
repeatable data work and records actions; judgment, browser applications,
writing and account access depend on your agent's available tools. The dashboard
is a local read-only view of the same database. Choosing a job does not submit
it unless you have explicitly established that authorization.

## Coverage and privacy

The connector collection originated in a Hong Kong campaign and remains
strongest there, with some remote and international ATS support. It is a
starting catalog, not universal coverage. Setup maps your own roles/markets to
working sources, leaves unsupported areas visible, and can use direct employer
links or manual imports. It never silently makes Hong Kong your location,
infers your work authorization, or adopts another candidate's filtering rules.

Your private files live in `config/private/`; your source selections in
`config/sources.yml`; jobs in `data/`; submission files and notes in `artifacts/`.
These are ignored by Git. Keep local backups appropriate to their sensitivity:
Git ignore does not encrypt files or prevent your agent/provider from receiving
content you ask it to process. Do not add credentials or private campaign data
to public instructions or commits. The shared repository contains no real
candidate profile or active search configuration.

The public files own reusable behavior: `AGENTS.md` routes startup, `SETUP.md`
owns onboarding, `skills/` owns the eleven reusable operational procedures plus bootstrap,
`src/` owns the engine. Private preferences/configuration
own your tailored strategy.

See [configuration fields](docs/configuration.md), [synthetic examples](examples/),
and [verification results](docs/validation.md) for concrete setup and test evidence.

See the [skill map](skills/README.md) and [capability audit and research](docs/reusable-core-audit.md)
for what was preserved, generalized and deliberately left to the agent runtime.
