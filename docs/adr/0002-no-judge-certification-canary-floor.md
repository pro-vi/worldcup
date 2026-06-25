# ADR 0002: No per-run judge certification; a bounded canary is the assurance floor

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** maintainer; two GPT Pro consults (endorsed the revert; a retrospective flagged the over-correction)
- **Supersedes:** the "qualifier / evaluator certification" frame (PLAN_3, reverted in PR #9)

## Context

A "qualifier" subsystem was built (~1944 lines) then reverted: it certified the evaluator before each
tournament via an anchor-bank (known-outcome pairs), common-item gates + a held-out utility set, an
adversarial audit, drift probes, and a durable tamper-evident bank. Two consults endorsed the revert as
speculative infra for a pick-a-winner tool. A later retrospective added the correction: deleting **every**
behavioral check — and subsequently the dev probe suite — **slightly over-corrected** the engine to *zero*
automated assurance.

## Decision

Do **not** certify the evaluator before each tournament (no anchor-bank, no held-out split, no durable
results, no drift dashboard, no per-run blocking). The assurance floor is a single bounded **judge canary**
(~6 obvious cases) run on **release** and when the evaluator changes (prompt / model / schema / gate / panel),
**not** before every real tournament.

## Rationale

The bracket and reference-challenge *exercise* the judge but do not establish it is *functioning* — they
miss a dropped rubric, reversed A/B labels, broken structured-output parsing, or ignored lens instructions,
and pairwise judges have task-dependent position sensitivity. The fabrication gate assures only the
fabrication dimension. Per-run certification solved a real risk at the wrong granularity and cost; a canary
catches "obviously broken" with no state, lifecycle, or policy.

## Consequences

Positive:
- Minimal; catches catastrophic judge breakage on exactly the surfaces that change it.

Negative:
- No nuanced ranking-quality assurance — passing means "not obviously broken," never "certified."
- **Current state: the canary is NOT yet built** (after the probes were removed, automated assurance is
  zero). This ADR records the decided floor; building it is the open follow-up.

## The canary contract (the boundary that stops it regrowing into the qualifier)

One fixture file, Boolean assertions, ~6 cases: (1) unsupported fabrication loses or is gated; (2) a claim
contradicting the source packet is gated; (3) an obviously defective candidate loses to an adequate one;
(4) swapping A/B preserves the substantive winner; (5) an invalid judge-response schema fails closed;
(6) an unknown/missing source reference does not silently pass. **No** aggregate score, **no** certification
status, **no** held-out split, **no** durable results, **no** trend dashboard, **no** adversarial generator,
**no** automatic growth. Cases have overwhelming quality gaps; retries cover transport failures only.

## Revisit Triggers

- An escaped judge failure in production → add exactly one case (the only way the suite grows).
- A provider/model change shipped without a canary run → the gap this ADR exists to close.
- The canary acquiring state / a lifecycle / pass-rate scoring → you are rebuilding the qualifier; stop.

## References

- Reverted work: PLAN_3 / `docs/plans/qualifiers-run-assurance.md` (both deleted; in git history).
- Retrospective consult (2026-06): "slightly over-corrected; add the bounded six-case judge_canary."
- The deleted dev probe suite (git history through commit `294e45b`).
