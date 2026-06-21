---
title: Qualifiers — run-scoped assurance for the decision system (supersedes the "certification" framing)
type: feat
status: active
date: 2026-06-21
origin: PLAN_3.md (design lineage) + GPT-Pro extended ontology consult (2026-06-21) — supersedes docs/plans/qualifiers-anchors-certification.md
branch: feat/qualifiers-anchors-certification
---

# Qualifiers — run-scoped assurance for the decision system

> **Supersedes `docs/plans/qualifiers-anchors-certification.md`.** A GPT-Pro extended second-opinion
> (0.87–0.98 confidence per claim) challenged the *ontology* of that plan. Verdict: *"the engineering
> is stronger than the ontology — you are building a good regression/assurance system and calling it a
> certification system."* The fix is **not less rigor** — it is putting the rigor around the right
> **object** and making only the inference the evidence earns. **Nothing merged is wasted:** U19
> `EVALUATOR_CONFIG` (#3), U20 `ledgerLookup`/`SOURCE_PACKET` (#6), U21 `anchorbank.js` (#7) all survive
> — the change is the *object* and the *claims*, plus one real structural addition (fresh run-scoped probes).

## Architecture Decision

**Approach: qualify the RUN, not certify the judge.** The first-class object becomes the **decision
system** `D = (author, source packet, generator, field, evaluator config, comparison protocol,
tournament, escalation, human)`, qualified **within a stated operating envelope for THIS run** — not a
durable property of a config in isolation.

**Rationale (Simplicity + honest inference, criteria #2/#4).** Three first principles forced it (this
section is ADR-ready):

1. **Falsifier, not verifier.** The durable anchor bank can *demonstrate a known defect* (a config that
   fails an anchor is bad); it **cannot establish a general property called "judge quality."** Passing
   the bank proves only the *absence of the defects you thought to test*. So the strongest honest claim
   is *"config E satisfied requirements R on corpus B under operating conditions C,"* never *"E is
   trustworthy."*
2. **Specification tests, not statistical samples.** Curated MFT/INV/DIR anchors are hand-authored
   obligations, not random draws from a population. Reporting a **Wilson/Bernoulli confidence interval**
   over them answers a sampling question the data-generating process doesn't support — *increasing n
   does not fix an undefined sampling frame.* So: **exact pass/fail**, reported as *"passed 26/27
   required conformance cases; failed the implied-causality family,"* **not** *"fabrication recall
   certified ≥ 0.75."*
3. **Authorization, not truth.** `ledgerLookup`'s `SUPPORTED`/`UNSUPPORTED` does **not** mean
   true/false — it means **AUTHORIZED/UNAUTHORIZED relative to the operator's packet.** A detail can be
   true in the author's life yet `UNAUTHORIZED` (not in the packet) → a false fabrication accusation /
   an irreversible false DQ. The mechanical layer establishes *compatibility with an evidentiary
   boundary*, not factuality.

**Rejected — "certify the judge" (the prior plan + PLAN_3 U12 framing): Wilson-gated certification →
a `certified E*` + a `calibration card`.** It overstates what the evidence establishes (falsifier ≠
verifier), imports ML-eval assumptions (a natural population, stable ground truth) that don't hold for
a single-author / single-incumbent / synthetic-mutation setting, and contains an **opt-in
contradiction**: certification cannot honestly be off-by-default (either the default judge is unfit —
then qualification can't be optional — or it's fine, and "certification" is too strong). This is an
**opt-in run-assurance diagnostic**, stated plainly.

**Trade-offs accepted.** We give up the appealing-but-false story of a portable "certified judge." In
return the claims are defensible, the Wilson machinery is *deleted* (a simplification), and assurance
moves into the live operating context where the real signal is (the actual generator's failure modes,
the actual quality gaps, the actual borderline decisions).

**What survives, re-framed (do not rebuild):** first-class `EVALUATOR_CONFIG`; structured
`SOURCE_PACKET`; the durable versioned `anchorbank` — now a **regression/conformance corpus**, not a
statistical sample; the MFT/INV/DIR taxonomy; the mandatory **DIR positive controls**
(`I≻O, T≻B, I≻L, O≻C, I₂≻I₁`); mirrored/counterbalanced presentation; **noncompensatory** mandatory
constraints (any mandatory construct fails ⇒ `BLOCKED`, no averaging — this part of the old Stage-1
stays, just without the CI); ABSTAIN/ESCALATE; the adversarial audit (still the real final, downstream).

## The authority-status contract (the truth reframe, concretely)

Replace the implicit "supported = true" with an explicit authority vocabulary on truth anchors and in
the assurance card. `ledgerLookup` stays **binary in code** (`AUTHORIZED` iff the span traces to the
packet; `UNAUTHORIZED` otherwise — only the *claim language* changes, in U20's docs), while the **item
card** carries the richer status so an anchor's *expected* semantics are honest:

```
authority_status ∈ {
  ASSERTED_TRUE,       // the operator's packet says this happened
  AUTHORIZED,          // a variant MAY use this detail (in the packet)
  UNKNOWN,             // not established either way — NOT an accusation of fabrication
  FORBIDDEN,           // the operator explicitly bars it
  EXTERNALLY_VERIFIED  // supported by a cited source (target packet)
}
```

A tightly source-bound rewrite using an *absent* detail is `UNKNOWN`/`UNAUTHORIZED`, **not** "false."
The gate DQs on `UNAUTHORIZED used as load-bearing lived fact`, never on "untrue." (Enriching
`ledgerLookup`'s *return* enum beyond binary is **deferred** — adopt the language + the item-card field
now; the merged primitive is unchanged.)

**Taste authority — the author is the principal.** The product promise is *"the best version in the
author's real voice."* So "blinded multi-editor consensus" is **disaggregated evidence**, never a
collapsed "known answer," and the **author holds veto** over taste-gold. Taste metrics are reported as
*"agreement with named adjudicators,"* **not** "accuracy." (`anchorbank` already carries
`item.human_adjudicated` + `unadjudicated()`.)

## High-Level Technical Design

Three layers, opt-in (`QUALIFY` off ⇒ byte-identical default run; `p1` 73/73 is the guard). Directional
guidance for review, not a spec:

```
DURABLE (built once, committed) ── the conformance CORPUS
  Workflow: buildAnchors(packet, incumbent) → MFT/INV/DIR truth(authority-status)+taste(per-editor votes)
    → items[]            orchestrator(qualify.js): persistAnchors → anchorbank.write  (regression corpus)

PER-RUN (opt-in) ── the run ASSURANCE loop
  orchestrator: load corpus partition (readForPacket) ─┐
  Workflow:                                            ├─ U12 CONFORMANCE: exact pass/fail vs corpus
    buildProbes(live packet/context/incumbent/gen) ────┘     (noncompensatory ⇒ BLOCKED; ABSTAIN/ESCALATE)
      → fresh ecological probes (persona-drift, omission, structural-improve, A/B reversal, judge-bait)
    qualify(config, conformance, probes, perturbations) → run STATUS + assurance-card payload
      → (opt-in) validateEvaluatorConfig(E); EVALUATOR = E  // "qualified within THIS run's envelope"
  orchestrator(qualify.js): writeCard(payload) → anchors/<pid>/assurance-v<runid>.json

RUN STATUS (state machine, the headline output):
  BLOCKED                 — a mandatory truth / positive-control obligation FAILED
  QUALIFIED_FOR_THIS_RUN  — required conformance + fresh probes passed within the named envelope
  UNSTABLE                — a decisive outcome FLIPS under a permissible perturbation
                            (mirrored order | alt judge model | prompt paraphrase | bracket reseed)
  HUMAN_REVIEW_REQUIRED   — evidence insufficient OR material author/editor value-disagreement
```

**Assurance card** (replaces the "calibration card", a separate orchestrator-side artifact):
`{ run_status, operating_envelope:{packet_completeness, packet_provenance, field_diversity,
generator_identity, evaluator_config_id, gate_false_dq_behavior, pair_order_stability,
paraphrase_stability, preference_cycles, bracket_seed_sensitivity, escalation}, conformance:{passed,
failed_families:[...]}, fresh_probes:{passed, drift:[...]}, taste:{agreement_with_named_adjudicators,
author_vetoes:[...]}, known_blind_spots, anchor_bank_version, judge_models, expires_on:{model_or_prompt_change}, top_set?:[...] }`.

## Implementation Units

### U11a. Conformance-corpus generation (sandbox `buildAnchors`)

- **Goal:** From the incumbent + structured packet, generate the MFT/INV/DIR item cards — truth anchors
  carrying the **authority-status** contract (not "truth"), taste anchors carrying **per-editor
  disaggregated votes + author-veto status**. Returns `items[]`. (Was the prior U11a; reframed: a
  *conformance corpus*, the falsifier, not a statistical sample.)
- **Requirements:** Falsifier framing; authority contract; mandatory DIR controls; author-as-principal.
- **Dependencies:** None new (consumes merged U20 `ledgerLookup`/`SOURCE_PACKET`).
- **Files:** Modify `worldcup/references/workflow-template.js` (`buildAnchors`, behind `QUALIFY`/anchor-build
  mode — a default run never calls it). Create `probes/p4-anchors.mjs`.
- **Approach:** Minimal single-span mutations from an eligible base. Item card:
  `{ construct, test_type:'MFT'|'INV'|'DIR', authority_status, source_packet_id, base_id,
  mutation:{span,operator}, expected:{gate, taste_comparison}, proof:{ledger_lookup}, editor_votes:[...],
  author_veto:bool, known_confounds, difficulty, provenance, kind:'truth'|'taste', human_adjudicated,
  family }`. Truth anchors use `ledgerLookup(span)` → `AUTHORIZED|UNAUTHORIZED` (the *authorization*
  check, recorded in `proof`). Mandatory DIR controls `I≻O,T≻B,I≻L,O≻C,I₂≻I₁`. Counterbalance shortcuts;
  strip `Original/Fabricated/Bland` labels.
- **Patterns to follow:** `screenAll`/`ledgerLookup` in `workflow-template.js`; opt-in flag mirrors `LIVE_BEACONS`.
- **Test scenarios:**
  - **Deterministic (probe `p4`, mock `agent`):** every card has a non-empty string `family` + an
    `authority_status`; truth cards: `ledgerLookup(span)` is `UNAUTHORIZED` for a planted absent span and
    `AUTHORIZED` for a packet-present span, recorded in `proof`, **no `agent()` call**; DIR cards exist
    for every quality construct; taste cards carry `editor_votes[]` (disaggregated, not collapsed) + an
    `author_veto` field; no `Original|Fabricated` literal leaks. *Edge:* no incumbent → `[]`, no throw.
  - **Stochastic (NOT asserted — structural only):** LLM-generated mutation/taste *content* quality is
    not probe-asserted; only card *structure*.
- **Verification:** returns family-tagged cards with authority status; planted-absent spans read
  `UNAUTHORIZED` (not "false") with no LLM call; taste cards keep editor votes disaggregated; a default
  run never calls it (`p1` green).

### U11b. Orchestrator corpus bridge + assurance-card writer (`qualify.js`)

- **Goal:** Persist the corpus into the durable, committed bank; load partitions to feed a run; **write
  the assurance card**. The fs half the sandbox can't do.
- **Requirements:** Durable corpus ("built once, reused"); assurance-card artifact.
- **Dependencies:** U11a (its `items[]`); U21 `anchorbank.js`.
- **Files:** Create `worldcup/references/qualify.js` (standalone CJS, orchestrator-side):
  `persistAnchors(...)` (→ `anchorbank.buildBank`/`write`), `loadCorpusForRun(bankFile, livePacket)`
  (→ `readForPacket` + `assertCertifiable` + `itemsInPartition`), `writeCard(card, baseDir)` (atomic).
  Create `probes/p5-qualify.mjs`. Modify `worldcup/references/qualifiers.md` (the corpus-build + run-assurance
  launch recipes).
- **Approach:** Thin composition over `anchorbank.js` — no new bank primitive. `writeCard` mirrors
  `anchorbank.write`'s atomic temp+rename. `created`/timestamps stamped here (orchestrator has `Date`).
- **Patterns to follow:** `live-view.js`/`anchorbank.js` module shape; `anchorbank.write` atomic pattern.
- **Test scenarios (deterministic, real fs in tmp):** `persistAnchors` round-trips; `loadCorpusForRun`
  withholds certification/canary families + throws on stale packet (`readForPacket`); `writeCard`
  round-trips + atomic (no `.tmp` left). *Error:* corrupt bank → tagged error.
- **Verification:** corpus persists to a verifiable committed bank; a run gets only its allowed
  partition; the assurance card writes atomically and reads back.

### U12. Conformance qualification (sandbox `qualifyConformance`)

- **Goal:** Run a config against the durable conformance corpus with **exact pass/fail** — the
  noncompensatory spec-test gate. Emits a per-construct scorecard + a `BLOCKED|PASS` conformance verdict;
  reassigns `EVALUATOR` (opt-in) only when conformance + (U23) probes pass. **No Wilson/CI math.**
- **Requirements:** Spec-test-not-sample; noncompensatory BLOCKED; falsifier framing.
- **Dependencies:** U11a/U11b (the corpus via `args`), U19 `validateEvaluatorConfig`, U20 `ledgerLookup`.
- **Files:** Modify `worldcup/references/workflow-template.js` (`qualifyConformance(config, corpus)` + read
  `args.anchorBank`; assign `EVALUATOR` only under `QUALIFY`). Create `probes/p6-conformance.mjs`. Modify
  `worldcup/references/qualifiers.md`.
- **Approach:** Each mandatory construct is an **obligation**: pass iff the config meets it on every
  required item (no averaging, no CI). A config failing any mandatory construct ⇒ `BLOCKED` with the
  failed **family** named. Report *"passed N/M required cases; failed family X."* ABSTAIN/ESCALATE on
  low-confidence. Reassign `EVALUATOR = E` only after `validateEvaluatorConfig(E)`.
- **Patterns to follow:** `screenAll`/`playMatch`/`tally` (the surfaces `E` runs through);
  `validateEvaluatorConfig` (call before reassign); `p1` threading proof.
- **Test scenarios:**
  - **Deterministic (probe `p6`, mock `agent` with controlled verdicts):** a config that misses a
    mandatory fabrication family ⇒ `BLOCKED` (no averaging rescues it); a config hugging the incumbent
    fails the DIR gate; the scorecard reports failed families by name; **no Wilson interval anywhere**;
    a reassigned `E` passes `validateEvaluatorConfig`; `QUALIFY` off ⇒ `EVALUATOR` byte-identical (`p1`).
  - **Stochastic (documented):** the *real* pass-rate of a model on real anchors is observed live, not
    probe-asserted; `p6` proves the *gate logic* with controlled inputs.
- **Verification:** a blind config (no integrity lens) is `BLOCKED`; conformance output names failed
  families, never a recall CI; reassigned `E` threads through every surface (assert `ev`, not just
  `criteriaBlock`).

### U23. Fresh run-scoped ecological probes (sandbox `buildProbes`)

- **Goal:** The structural upgrade. Generate **fresh probes inside the EXACT live packet / context-length
  / incumbent / generator regime** — the multi-edit interactions the durable single-span corpus
  structurally cannot test: distributed persona-drift, omission/implication, a genuine structural
  improvement, supported vividness, A/B reversal, harmless length/format, 1–2 adversarial judge-bait.
  Detect local **drift**, not broad validity.
- **Requirements:** H6 answer (synthetic single-span ⇒ only local conformance); test the actual regime.
- **Dependencies:** U12 (shares the qualification harness), the live packet/incumbent/generator.
- **Files:** Modify `worldcup/references/workflow-template.js` (`buildProbes` + judge them through the live
  config). Create `probes/p7-ecological.mjs`. Modify `worldcup/references/qualifiers.md`.
- **Approach:** Probes are **run-scoped** (regenerated per run, never persisted to the durable bank — so
  they can't be optimized against). Each probe has an expected direction (a real structural improvement
  should win; a persona-drift fabrication should be caught even with no single unauthorized span). Frame
  output as drift detection.
- **Test scenarios:**
  - **Deterministic (probe `p7`, mock `agent`):** the probe set covers all probe types incl. ≥1
    distributed-persona-drift and ≥1 A/B-reversal; probes are NOT written to the durable bank (assert no
    `anchorbank.write`); the harness records pass/drift per probe.
  - **Stochastic (documented):** whether the live judge *catches* persona drift is observed, not asserted.
- **Verification:** fresh probes are built in the live regime, judged by the live config, and reported as
  drift signals; they never enter the durable corpus.

### U24. Run envelope + assurance card + run status (`qualifyRun`)

- **Goal:** Assemble the **operating envelope**, run the **stability perturbations** (mirrored order, alt
  judge model, prompt paraphrase, bracket reseed) to detect `UNSTABLE`, compute the **run status**
  (`BLOCKED|QUALIFIED_FOR_THIS_RUN|UNSTABLE|HUMAN_REVIEW_REQUIRED`), and emit the **assurance-card
  payload** (written by `qualify.writeCard`).
- **Requirements:** Whole-run qualification; honest run status; assurance card (renamed calibration card).
- **Dependencies:** U12 (conformance) + U23 (probes); U11b (`writeCard`).
- **Files:** Modify `worldcup/references/workflow-template.js` (`qualifyRun(...)` → status + card payload).
  Create `probes/p8-assurance.mjs`. Modify `worldcup/references/qualifiers.md`.
- **Approach:** A state machine, not a score. `BLOCKED` dominates (a failed mandatory obligation can't be
  averaged away); `UNSTABLE` when a decisive outcome flips under any permissible perturbation;
  `HUMAN_REVIEW_REQUIRED` on insufficient evidence or material author/editor disagreement; else
  `QUALIFIED_FOR_THIS_RUN`. The envelope records the run's actual conditions so the status is scoped to
  them. Taste numbers are labeled "agreement with named adjudicators."
- **Test scenarios:**
  - **Deterministic (probe `p8`, mock perturbation outcomes):** a failed mandatory obligation ⇒ `BLOCKED`
    (dominates everything); a champion that flips under mirrored-order ⇒ `UNSTABLE`; material
    author/editor disagreement ⇒ `HUMAN_REVIEW_REQUIRED`; an all-pass stable run ⇒
    `QUALIFIED_FOR_THIS_RUN`; the card serializes with the envelope + `anchor_bank_version` + `expires_on`;
    taste field reads "agreement", never "accuracy".
  - **Stochastic (documented):** real perturbation flip-rates are observed live.
- **Verification:** the run status correctly reflects the 4-state machine on controlled inputs; the
  assurance card carries the full envelope; no "certified"/"accuracy"/"recall ≥" language anywhere.

## Scope Boundaries

- **Non-goal — robust top-SET as the tournament's output.** U24 *detects* `UNSTABLE` (the finalist flips
  under perturbation) and records it. **Changing the engine to return a top-set instead of a single
  champion** touches the `renderReportV2`/champion path (a wider blast radius than the opt-in qualifier)
  — **deferred** to a follow-up unit. For now an `UNSTABLE` status + the candidate trade-offs in the
  assurance card is the deliverable; the author reads them and decides.
- **Non-goal — enrich `ledgerLookup`'s return enum** beyond binary. Adopt the authority *language* + the
  item-card `authority_status` field now; the richer 5-status *return* is a later U11/U20 change.
- **Non-goal — Wilson/statistical certification.** Explicitly deleted, not deferred.
- **Non-goal — U12b adversarial audit, U13 weighted tally (already wired via U19), U14a/b axes, U15
  report panel + judging.md §8 answer-key update.** Downstream/out of scope (U14b stays blocked on
  PLAN_2 `finalizeField`, still pending).
- **Non-goal — changing the engine/gate/seeding with `QUALIFY` off.** Byte-identical default.

### Deferred to Follow-Up Work
- **Robust top-set output** (engine returns a set + author chooses; the override becomes preference data) — its own unit/PR after this loop lands.
- **judging.md §8 answer-key update** (DIR counter-anchors in prose) — U15.
- **U12b adversarial audit** (the real final) — after U12/U24.

## System-Wide Impact

- **Interaction graph:** `buildAnchors`/`buildProbes`/`qualifyConformance`/`qualifyRun` are *new opt-in*
  sandbox functions — nothing in the default tournament path calls them. The one shared-surface change is
  the `ARGS` envelope reading `args.anchorBank` (additive; legacy array/`liveNonce` args unaffected —
  mirror U20's `ARGS`/`GIVEN_ITEMS`/`LIVE_NONCE`).
- **Error propagation:** orchestrator fs/integrity errors surface via `anchorbank`'s tagged errors;
  `qualifyRun` never silently certifies — a failed mandatory obligation is `BLOCKED`, insufficient
  evidence is `HUMAN_REVIEW_REQUIRED`. A failed candidate fails the candidate, not the run.
- **State lifecycle risks:** the corpus is built once and committed; a run reads a partition it did not
  author (held-out). Fresh probes are run-scoped and **never persisted** (un-gameable). `readForPacket`
  refuses a stale-packet bank.
- **API surface parity:** `qualify.js` is the only new orchestrator entry point; composes `anchorbank.js`.
- **Unchanged invariants:** default `EVALUATOR` (QUALIFY off) byte-identical; the gate veto path is
  independent of `lensWeight`; `ledgerLookup` semantics unchanged (only its *claim language* is corrected).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Reverting to rigor-theater** (re-introducing CI/recall language) | Architecture Decision deletes Wilson; `p6`/`p8` assert *no* CI language and exact pass/fail; the card schema bans "certified"/"accuracy"/"recall ≥". |
| **Stochastic asserted as deterministic** (flaky probes) | Every unit splits test scenarios: `ledgerLookup`/corpus/envelope-state-machine are probe-asserted with mocked `agent`; LLM content/flip-rates are documented-not-asserted. |
| **False fabrication accusation** (UNAUTHORIZED read as "false") | Authority-status contract: `UNKNOWN`/`UNAUTHORIZED` ≠ false; the gate DQs only on *unauthorized load-bearing lived fact*; docs reframed. |
| **Taste politics laundered as fact** | Editor votes stay disaggregated; author veto; taste reported as "agreement with named adjudicators". |
| **Fresh probes become game-able** | Run-scoped, regenerated per run, **never written to the durable bank** (`p7` asserts no `anchorbank.write`). |
| **Sandbox seam** (corpus/card can't cross) | JSON-only bridge: Workflow returns items / emits card; `qualify.js` persists. Proven live-view `args` pattern; `p5` covers it with real fs. |
| **Default run drift** | `QUALIFY` opt-in; `p1` (73/73) byte-identity guard. |
| **/gate's recurring blind spot** (last 3 units each leaked past a green probe) | Bake adversarial *executed* counterexamples into `p4`–`p8` from the start; `/gate` (`/invariance`+`/failure-mode`) per unit. |

## Confidence cross-check (consult finding → plan clause)

| GPT-Pro finding (conf) | Plan clause | Addressed? |
|---|---|---|
| Bank is falsifier not verifier (0.97) | Arch Decision #1; conformance reports failed families, not "trustworthy" | ✓ |
| SUPPORTED≠true → AUTHORIZED (0.95) | Authority-status contract; U20 doc reframe; gate DQs on unauthorized-as-lived-fact | ✓ |
| Config is wrong epistemic unit (0.96) | Object = the run/decision-system; U24 envelope; UNSTABLE on perturbation | ✓ |
| Wilson = rigor-theater; spec-test not sample (0.87) | Arch Decision #2; U12 exact pass/fail; Wilson deleted | ✓ |
| Judge isn't proven the 80% bottleneck (0.93) | Envelope records packet completeness + field diversity + generator identity (not just the judge) | ✓ |
| Synthetic single-span ⇒ only local conformance (0.98) | U23 fresh ecological probes (multi-edit, live regime) | ✓ |
| Goodhart / un-gameable holdout | Fresh probes never persisted; corpus held-out by family; framed as falsifier | partial (adaptive reuse acknowledged) |
| Author is the principal (0.98) | Editor votes disaggregated; author veto; "agreement with named adjudicators" | ✓ |
| Opt-in contradiction | Named an opt-in *diagnostic*, not certification | ✓ |

## Build order

`U11a → U11b → U12 → U23 → U24` — corpus generated → persisted/bridged → conformance-qualified → fresh
probes → run envelope + assurance card. Each its own `/gate`'d commit on
`feat/qualifiers-anchors-certification`; ship the connected effort as one PR (the units only make sense
together — the corpus, the conformance gate, the live probes, and the run status are one assurance loop).
