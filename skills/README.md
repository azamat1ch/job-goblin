# Reusable campaign skills

These are working procedure templates: the agent combines a shared skill with
this user's private evidence, preferences and directive at runtime. Setup builds
the private context rather than forking eleven copies that drift. User decisions
and corrections override repository defaults as described in ../AGENTS.md.
No skill requires a particular profession, country, model or browser product.

| Request | Load |
| --- | --- |
| Start or substantially retarget a campaign | [job-search-bootstrap](job-search-bootstrap/SKILL.md) |
| Write as the candidate | [candidate-voice](candidate-voice/SKILL.md) |
| Find roles and audit coverage | [job-discovery](job-discovery/SKILL.md) |
| Extract a custom site | [browser-job-source](browser-job-source/SKILL.md) |
| Judge roles and employer siblings | [job-fit-review](job-fit-review/SKILL.md) |
| Tailor or rebuild a CV | [job-cv-tailoring](job-cv-tailoring/SKILL.md) |
| Prepare/fill/submit requested applications | [job-apply](job-apply/SKILL.md) |
| Find contacts and handle outreach | [job-outreach](job-outreach/SKILL.md) |
| Reconcile recruiter mail and replies | [job-inbox](job-inbox/SKILL.md) |
| Prepare or practise an interview | [job-interview](job-interview/SKILL.md) |
| Status, stage changes, retries and next actions | [job-pipeline](job-pipeline/SKILL.md) |
| Research a decision or measure an experiment | [job-research](job-research/SKILL.md) |

All skills run in the kit's repository/workspace context. `AGENTS.md` owns
startup and instruction precedence, `SETUP.md` owns the interview, and the CLI
help owns executable command contracts. Supporting references are loaded only
when their topic applies. Procedures have one owner in this collection.

`npm run install:agent -- --agent both` links this entire skill collection into
both project skill directories. Individual skill invocation is optional; normal
requests route here through AGENTS.md. Installation grants no accounts or tools.
