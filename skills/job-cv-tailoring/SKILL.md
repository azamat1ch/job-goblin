---
name: job-cv-tailoring
description: Create or tailor a candidate CV for a role using their evidence and chosen format, checking the final upload artifact.
---

# CV tailoring

Read the actual posting, `config/private/cv.md`, profile and candidate-voice
preferences. Establish the desired artifact and whether an existing reference
CV already makes the case. A user can request tailoring, a general rewrite or
a new base CV; no selected-job prerequisite or fixed edit budget applies.

Map the role's central needs to specific evidence before writing. Foreground
relevant scope and results, use equivalent industry terminology where accurate,
and explain transferable work. Distinguish team outcomes from personal actions,
prototypes from production, and measured results from estimates. Preserve true
employment titles/dates while explaining their functional meaning if useful.

Use the requested layout, language, length and degree of rewriting. Keep a good
reference unchanged when adaptation adds nothing. Multiple role-lane versions
are useful when their audiences genuinely need different evidence. A finance
candidate need not inherit engineering skill labels, a one-page rule or a limit
of two rewritten bullets.

For a job packet save source and uploadable output under `artifacts/<job-id>/`.
A general CV can live in a clearly named private artifact directory. Compare
changed claims against evidence, inspect extracted text and visually check the
actual rendered file for clipping, broken headings, dates and links. Use the
runtime's document tools; this kit does not bundle the original private repo's
`cv:render` or `cv:check` commands. If no renderer exists, produce a usable
source and name the remaining format step accurately.

An unchanged previously verified file can be reused without rerendering. A
factual correction invalidates an older reference until synchronized. Preserve
submitted versions so future interviews use what the employer actually saw.
