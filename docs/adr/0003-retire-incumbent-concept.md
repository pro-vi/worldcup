# ADR 0003: Retire the "incumbent" concept; field the original as a contestant

- **Status:** Proposed
- **Date:** 2026-07-10
- **Deciders:** maintainer; design validated by Fable analysis lanes (patterns / integration /
  representation-integrity) + a Fable simplification pressure-test

## Context

worldcup shipped an "incumbent" concept that bundled two roles under one name:

1. A **truth** role — the reference original the fact ledger describes (what is actually true),
   which the fabrication gate reads. This role already lives in separate machinery (`SOURCE_PACKET`
   / `renderLedger` / `BASE`).
2. A **bar** role — the *reference challenge*: after the bracket, the champion had to beat the
   original head-to-head by a supermajority, or the verdict was "keep the original." This was
   implemented as `USE_INCUMBENT` / `INCUMBENT` / `INCUMBENT_CLAUSE`, a post-bracket match, a
   `referenceChallenge` result object, a keep-original recommendation branch, and dedicated report
   rendering.

Run 1 (the real README-pitch dogfood, 32 Sonnet-judged variants) surfaced two problems with the
bar role. First, it was **miscalibrated**: in the common "improve this draft" case, running
worldcup already means the current version is up for replacement, so a supermajority handicap on
the champion is the wrong default. Second — and worse — `INCUMBENT_CLAUSE` **pasted the original's
full text into every lens prompt** (~250 votes). Entries are shown to jurors unlabeled, so a juror
could identify which entry *was* the original by matching it against the clause: a systemic anchor
bias, and the single blinding exception the bias-controls doctrine had to admit.

The clarifying insight: the only load-bearing part of the incumbent machinery was never the
incumbent — it was the fact ledger, and that already lives in `SOURCE_PACKET`, which stays.

## Decision

**Retire the incumbent-as-bar concept entirely; keep the fact ledger.** Concretely:

- Delete `USE_INCUMBENT`, `INCUMBENT`, `INCUMBENT_CLAUSE`, the reference-challenge match, the
  keep-original recommendation branch, the playoff-vs-original leg, the `referenceChallenge` return
  field, and all its report rendering.
- The original, **when you want it judged, is a contestant**: `INCLUDE_BASE = true` fields the
  `BASE` verbatim as one cell of a generate field (it *replaces* a generated cell, never appends —
  `pool.length` stays `FIELD`), or you include it among your `given` items. It is then screened,
  seeded, rated, and plays the bracket like any entry.
- "Keep the original" becomes **"the original won its bracket (or out-rates the champion)"** — same
  information, zero special code; surfaced by the existing trust machinery (bracket-variance → top-4
  runoff already fires a guaranteed head-to-head when the original out-rates the champion).
- The conservative "don't replace unless clearly better" bias moves to a **reporting-doctrine line**
  (SKILL.md Output / judging.md §12), NOT the criteria (which reach every juror and would handicap
  all entries) and NOT engine mechanism.
- The rare precious-original case that wants a *guaranteed* supermajority head-to-head is served by a
  **post-run exhibition match from the main loop** — the same pattern the repo documents for
  cross-model finals jurors — one doctrine paragraph, zero engine code.

## Rationale

ADR 0001's principle ("the simpler, already-shipped design wins under uncertainty") cuts directly
toward deletion, and the removal is motivated by **observed miscalibration** (frozen length
exploration + the every-prompt anchor leak), exactly the kind of evidence ADR 0001's revisit
discipline asks for. Net **−6 concepts, ~−60 lines, +1 boolean**, plus two quality wins: deleting
`INCUMBENT_CLAUSE` **de-anchors all ~250 lens votes**, and a fielded original that gets DQ'd is a
**free gate canary** (the ledger IS the original's truth, so an original DQ means the ledger is
misconfigured or the gate is broken — a loud trust warning).

**Rejected alternative:** an `INCUMBENT_MODE: 'protected' | 'open-field' | 'absent'` enum plus a
structured verdict object and explicit role-unbundling. It *adds* ~3 concepts and +100–200 lines
threaded through config / validation / prompts / report to reach the same outcome the two existing
primitives already reach. The three enum states collapse into primitives that exist: *absent* =
don't field it; *open-field* = a `given` item or `INCLUDE_BASE`; *protected* = the post-run
exhibition doctrine.

## Consequences

Positive:
- Leaner engine; one fewer named concept spanning config, prompts, and report.
- Every lens vote is now blind (no original-text anchor in the prompt).
- Free gate canary on the fielded original; free length exploration once the length pin is gone
  (shipped alongside, see the free-length change).
- `INCLUDE_BASE` adds no agent calls — the base replaces a generated cell.

Negative / trade-off accepted:
- We lose the **guaranteed** champion-vs-original head-to-head (fielded, they meet only by draw
  luck). Assessed as mostly redundant: the fielded original gets *more* evidence than before (group
  matches + a knockout run + a global Elo position + a full info sheet, vs one noisy post-bracket
  panel), and the trust machinery already forces a runoff when the original out-rates the champion.
  The only distinct residue — the asymmetric "a narrow win still keeps the original" threshold —
  matters just for the precious-original case, preserved via the post-run exhibition doctrine.

## Revisit Triggers

- A real run needs a *guaranteed, mechanized* protected head-to-head that the post-run exhibition
  pattern cannot serve (e.g. the decision must be made inside the Workflow, headless, with no main
  loop to fire the exhibition).
- Evidence that fielding the original systematically distorts seeding or the effects analysis (e.g.
  in an axes design, the base-as-non-grid-contestant materially skews the response surface) — then
  reconsider whether the base should be excluded from rating, not just from effect buckets.

## References

- Superseded behavior: the reference challenge in ADR 0001 / ADR 0002 context (both remain accurate
  as of their dates; this ADR retires the bar role they mention).
- Implementation: `worldcup/references/workflow-template.js` (`INCLUDE_BASE`, `BASE`, `BASE_LABEL`);
  doctrine in `worldcup/references/judging.md` §12, `worldcup/SKILL.md` input #4 + Output.
- Design validation: Fable analysis lanes + simplification pressure-test (2026-07-09).
