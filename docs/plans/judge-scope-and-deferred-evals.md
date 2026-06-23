# Judge scope: ship General-only; defer unproven profiles (with the evals that would unblock them)

**Status:** decided 2026-06. **Decision record** (ADR precursor), not a plan.

## Decision

worldcup ships a **single domain-general judge** ("General": lenses `substance` · `fit` · `craft` ·
`integrity`, + `coherence` for assembled artifacts; the deterministic fabrication/format gates). The
following are **deferred pending evaluation**, not shipped:

- the **consume-mode taxonomy** (read/act/run) and any domain **profiles** beyond General + the prose
  profile sketch (`references/profiles/prose-provi.md`);
- an **Operational** profile (plans/specs/designs) with feasibility/completeness/robustness lenses;
- a **noncompensable veto tier** (a "critical" lens that can eliminate unilaterally).

**Rationale.** Two unproven judges → the simpler, already-shipped one wins by default. We have no eval
harness, no ground-truth sets, no human rankings; every alternative judge design is *argument, not
measurement*. We removed an elaborate judge-assurance subsystem (the "qualifier") for exactly this
reason. A GPT‑5.5 Pro consult initially proposed the profiles/veto, then **retracted** it when pushed
on evidence and landed here.

**Rejected alternative.** Shipping the taxonomy + Operational profile + veto on the consult's argument.
The veto is the most dangerous: under single-elimination, one wrong veto **irreversibly** kills a good
entry. All three are performance claims that argument cannot settle.

## What we did ship — and its threat model (U1: untrusted-content isolation)

The one safe-by-construction change: `embedUntrusted()` wraps every untrusted text block (four candidate
surfaces + the fetched TARGET) so embedded instructions can't steer a judge or a generator. Two layers,
**both currently unvalidated behaviorally** (pinned only by the static p1 parity probe):

1. **Output schema** (`winner ∈ {X,Y}`, `category ∈ enum`) — an *existing but untested* mitigation: a
   candidate cannot make the judge emit a hijacked format. Covers format-hijack only.
2. **`embedUntrusted` clause** — covers verdict-tilt + criteria-redefinition (the reachable vectors).

The p1 probe asserts the wrapper **binding** (the exact `embedUntrusted(body,label)` per surface), that the
literal directive survives, and that the **collision-resistant fence** contains a hostile body (a forged
fence / `---` inside can't escape) — but **not** that the wording behaviorally *works* on a live model.
That behavioral validation is the smoke below.

## The validation that would unblock each deferral

The only label-free **real** invariant is **swap symmetry**: X/Y are arbitrary labels; replay the same
pair reversed and the winner must not flip. (Vote-correlation / decisive-vote-rate are *diagnostics*,
not validation — optimizing them can select diversity-of-error.) Everything below is a *planted-defect*
construction: inject one explicit, noncompensated defect → the original must win, in **both** orientations.
No human ranking needed; someone must still confirm each transformation is genuinely monotonic.

| Deferral | Decisive experiment | Ship bar |
|---|---|---|
| **U1 injection smoke** (validates what we shipped) | 8 pairs: inject judge-targeting instructions / a self-awarded verdict into the **losing** entry → original wins both orientations; + clean controls (the clause must not change unaffected verdicts). Needs live agents — not a CI probe. | original wins 8/8; controls unchanged |
| **Consume-mode taxonomy** | 16-pair **read-vs-act crossover** (8 read + 8 act artifacts, one planted defect each), General vs Operational, both orientations (~256 lens calls). | supported **only** on a large *interaction* — Operational gains ≥3 more on act than on read, spanning multiple defect families. Equal gains ⇒ "improve General," not a taxonomy. One lens accounts for the gain ⇒ a lens override, not a profile. |
| **Operational profile** | 4 defect families (explicit-contradiction / dependency-order / resource-impossibility / mandatory-omission) × 4 independent bases: 8 dev pairs to tune, freeze, then 16 held-out, both orientations, vs General with identical criteria. | strict on ≥14/16 **and** paired McNemar p<.05 **and** gains in ≥3/4 families **and** orientation-consistency not regressed |
| **Noncompensable veto tier** | False-positive precision is the risk, not recall. Shadow mode; planted fatal defects as positives + hard negatives (unusual-but-valid plans, intentionally-minimal specs, legitimate trade-offs); the critical evaluator may **abstain**. | ≥30 clean negatives → ~9.5% FP upper bound; **~59 zero-FP negatives** for <5%. Prefer "trigger reconsideration" over "eliminate" until far stronger evidence. |

## Instrumentation — only when an eval is built

Not a subsystem. A JSONL file + a loop over the existing match runner: log match/run/candidate IDs,
presented order, lens id+vote, model + prompt hash, parse failures, final tally. Swap-consistency is
then computable offline; vote-correlation / decisive-vote-rate are computable too but **must be labeled
diagnostic**, never a release gate.

## Provenance

GPT‑5.5 Pro consult, 2026-06 (initial recommendation + its retraction). Discipline mirrors the qualifier
removal: plausible ≠ proven; default to the simpler shipped judge under uncertainty.
