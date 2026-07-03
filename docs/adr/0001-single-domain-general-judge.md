# ADR 0001: Ship a single domain-general judge; defer profiles & veto

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** maintainer; GPT-5 Pro consults (proposed-then-retracted the profiles/veto)

## Context

worldcup is a public, multi-domain best-of-N judge (essays, code, plans, configs…). A consult
proposed carving the judge by how the winner is *consumed* — Communicative / Operational / Executable
profiles — plus a **noncompensable veto tier** (a "critical" lens that eliminates unilaterally). There
is no eval harness and no labeled data; every alternative judge design is argument, not measurement.

## Decision

Ship **one domain-general judge** ("General": lenses `substance` · `fit` · `craft` · `integrity`,
+ `coherence` for assembled artifacts; the deterministic fabrication gate; the reference-challenge).
**Defer** the consume-mode taxonomy, the Operational/code/design profiles, and the noncompensable veto
tier. Domain taste plugs in via a swappable profile. Prose is documented as the
sharpest example doctrine, but no profile file ships as an engine default.

## Rationale

Two unproven judges → the simpler, already-shipped one wins under uncertainty — the same discipline
that reverted the qualifier (ADR 0002). The veto is the most dangerous deferral: under single-elimination
a wrong veto **irreversibly** kills a good entry. The consultant itself retracted the profiles/veto
proposal when pushed for evidence.

## Consequences

Positive:
- Lean engine, no speculative surface; prose peculiarities quarantined to a profile.
- The kept foundation — the `EvaluatorSpec` config object and the structured fact-ledger (ADR 0002
  context) — is justified independently (many consumers; the ledger feeds an enforced gate).

Negative:
- General may underperform on **operational** artifacts (plans/specs) — a known, documented uncertainty,
  not a hidden one.

## Revisit Triggers

Reopen a deferral only on a **planted-defect** result (inject one explicit defect → original must win,
both A/B orientations; no human labels):
- **Operational profile / taxonomy:** a 16-pair read-vs-act crossover shows Operational beats General
  *specifically* on act-artifacts (a large interaction, not equal gains); or an 8-dev + 16-frozen battery
  hits ≥14/16 + paired McNemar p<.05 + gains in ≥3/4 defect families.
- **Veto tier:** only after ~59 zero-false-positive hard negatives (for a <5% false-positive bound);
  prefer "trigger reconsideration" over "eliminate" even then.

## References

- Retracted proposal + its retraction: GPT-5 Pro consults (2026-06), domain-profiles thread.
- Kept foundation: `worldcup/references/workflow-template.js` (`EVALUATOR`, `renderLedger`).
- Untrusted-content isolation (sibling hardening): merged pre-launch.
