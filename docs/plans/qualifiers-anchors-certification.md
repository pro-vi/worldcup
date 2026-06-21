---
title: Qualifiers — anchor bank + evaluator certification (U11 + U12, connected effort)
type: feat
status: active
date: 2026-06-21
origin: PLAN_3.md (design artifact); reshaped from PLAN_3 U11/U12 after a /provision validation against the merged U19/U20/U21 infra
branch: feat/qualifiers-anchors-certification
---

# Qualifiers — anchor bank + evaluator certification

Build the **anchor bank** (U11) and the **evaluator certification** (U12) **together** — the first real
consumer of the merged preconditions: U19 `EVALUATOR_CONFIG` (P1, #3), U20 `ledgerLookup`/`SOURCE_PACKET`
(P2, #6), U21 `anchorbank.js` (P3, #7). PLAN_3 remains the **design artifact** (the hardened decisions
— DIR positive controls, certify-config-not-text, Wilson feasibility, leave-one-family-out, independent
roots — all stand). This file is the **execution plan**, reshaped where PLAN_3's unit decomposition
collided with the real architecture.

## The reshape (why this isn't PLAN_3's U11/U12 verbatim)

PLAN_3 U11 says *"Modify `workflow-template.js` (`anchorBank()` — reads P2, **writes P3**)."* A
`/provision` validation against the merged code proved that **impossible**: `anchorbank.js` (P3) does
`fs`/`crypto` and runs **orchestrator-side**; `workflow-template.js` is the **sandboxed Workflow** (no
`fs`, no `Date.now`, no `Math.random`). The validation's other findings — all confirmed against
file:line — are folded in below: the **stochastic-gate seam** (the mechanical proof is deterministic,
the LLM gate is not), U12's certification algorithm is **greenfield** (config threading is already
FULL), and the **calibration card** must be a separate artifact (`EVALUATOR` has no field for it, by
design). Good news from the same validation: **the merged infra fits** — `ledgerLookup`, the
`anchorbank` API, and the reassignable `EVALUATOR let` provide exactly what U11/U12 need. The infra
didn't need reshaping; the plan's decomposition did.

## Architecture Decision

**Approach:** Split each PLAN_3 unit along the **sandbox ↔ orchestrator boundary**, and bridge the two
halves with the **same `args`-in / run-output-out channel** the live view and per-run nonce already use.

- **Sandbox side** (`workflow-template.js`, no fs): LLM work + deterministic logic that needs the run
  harness — anchor *generation* (`buildAnchors`, U11a) and the certification *algorithm* (`certify`,
  U12). Both gated behind an opt-in flag so a default run is **byte-identical**.
- **Orchestrator side** (`qualify.js`, a new standalone CJS module like `live-view.js`/`anchorbank.js`,
  has fs): persist a run's returned anchors into the durable bank, load a bank's held-out partition to
  feed the next run via `args`, and write the calibration card to disk (U11b).
- **The bridge:** anchors and the certification result cross the boundary as **JSON** — the Workflow
  *returns* generated items / *emits* the card payload; the orchestrator persists them. The held-out
  partition crosses *into* a certifying run as `args.anchorBank` (parsed by the U20 `ARGS` envelope).

**Rationale (Consistency, criterion #1):** this is the *exact* pattern U21's own doc prescribes
(*"the orchestrator builds/persists the bank, then passes the held-out partition INTO the Workflow via
`args`"*) and that PR #4/#5 already proved for the live view. The alternative — `anchorBank()` doing fs
inside the Workflow — is **not implementable** (the sandbox has no fs); it is the rejected option, and
it's *why* U11 splits.

**Trade-offs accepted:** two artifacts per unit (a sandbox function + an orchestrator bridge function)
instead of one; a JSON round-trip at the boundary. In exchange, held-out-ness is *real* (the bank is
authored in a prior run/session, not the certifying one) and the sandbox constraint is honored.

**Integration-shape checks (architect discipline — verified against merged code, not prose):**
1. `buildAnchors` → `items[]` → `anchorbank.buildBank(items)`: `buildBank`/`verify` require every item
   carry a **non-empty string `.family`** (`anchorbank.js` `assertItems`). U11a MUST stamp
   `.family` = the mutation/construct family on every card. **Verified compatible** — the bridge is a
   plain array hand-off, no adapter.
2. `certify` → `E*` → reassign `EVALUATOR`: `E*` must pass `validateEvaluatorConfig` (the merged safety
   contract checks every runtime field + schema enums + panel lenses). U12 composes `E*` from the
   default config + certified modules and **calls `validateEvaluatorConfig(E*)` before reassigning** —
   never a bare reassign. **Verified** — `EVALUATOR` is a `let`, every judge surface reads `ev =
   EVALUATOR`, `p1` proves the threading.
3. `qualify.js` ↔ `anchorbank.js`: `qualify` composes `buildBank`/`write`/`readForPacket`/
   `assertCertifiable`/`itemsInPartition` (all exported) — no new bank primitive needed.

## High-Level Technical Design

Two runs, bridged by the orchestrator (directional guidance for review, not a spec):

```
ANCHOR-BUILD RUN (once, committed)                 CERTIFYING RUN (opt-in, per session)
  Workflow: buildAnchors(packet, incumbent)          orchestrator: readForPacket(bank, livePacket)
    → MFT/INV/DIR truth+taste item cards               + assertCertifiable → held-out partition
    → returns items[]                                  → args.anchorBank = { items, version }
  orchestrator (qualify.js):                         Workflow: certify(candidates, args.anchorBank)
    buildBank({packet, items, provenance})             Stage1 Wilson gates → Stage2 U(E) → Stage3 Pareto
    → write() → anchors/<pid>/bank-v<ver>.json         → E*; validateEvaluatorConfig(E*); EVALUATOR = E*
    (commit the bank)                                  → emits calibration-card payload (log/return)
                                                     orchestrator (qualify.js):
                                                       writeCard(payload) → anchors/<pid>/calib-v<ver>.json
```

Boundary contract: nothing that needs `fs`/`crypto`/`Date`/random runs inside `buildAnchors`/`certify`;
the orchestrator stamps `created`/`provenance`/timestamps and owns all persistence.

## Implementation Units

### U11a. Sandbox-side anchor generation (`buildAnchors`)

- **Goal:** Inside the Workflow, generate a behavioral test suite of item cards — **MFT** (gate
  obligations), **INV** (invariances), **DIR** (directional/positive controls) — across **truth**
  anchors (provenance-rooted, ledger-proved) and **taste** anchors (stakeholder-rooted), from the
  `INCUMBENT` + the structured `SOURCE_PACKET`. Returns `items[]`; persistence is U11b's job.
- **Requirements:** PLAN_3 U11 (anchor construction rules), DIR mandate, independent roots.
- **Dependencies:** None new (consumes merged U20 `ledgerLookup`/`SOURCE_PACKET`, the gate vocabulary).
- **Files:**
  - Modify: `worldcup/references/workflow-template.js` — add `buildAnchors(packet, incumbent, opts)`
    behind an opt-in flag (e.g. `QUALIFY`/anchor-build mode); a default run never calls it (byte-identical).
  - Create: `probes/p4-anchors.mjs` — deterministic-only assertions.
- **Approach:** Minimal **single-span** mutations from an eligible base (match length + surrounding
  polish). Each card: `{ construct, test_type:'MFT'|'INV'|'DIR', source_packet_id, base_id,
  mutation:{span,operator}, expected:{gate, taste_comparison}, proof:{ledger_lookup}, known_confounds,
  difficulty, provenance:{constructor,verifier_models,human_adjudicated}, kind:'truth'|'taste', family }`.
  **`family`** is the mutation/source/genre family (anchorbank partitions by it — must be a non-empty
  string). The **mechanical proof** uses `ledgerLookup(span, packet)` — a planted specific returns
  `{status:'UNSUPPORTED'}`, recorded in `proof`. **Mandatory DIR controls:** `I≻O, T≻B, I≻L, O≻C, I₂≻I₁`.
  Counterbalance shortcuts (longer wins sometimes / shorter sometimes; supported vividness wins /
  fabricated loses; violator appears equally as A and B); **strip `Original`/`Fabricated`/`Bland`
  labels**. LLM-dependent generation (natural mutations, taste pairs) uses `agent()`/`parallel`.
- **Patterns to follow:** `screenAll`/`preflight` structure in `workflow-template.js` (the gate this
  must trip); `ledgerLookup` call shape (`worldcup/references/workflow-template.js`, the U20 block);
  opt-in gating mirrors `LIVE_BEACONS`/`USE_INCUMBENT` flags.
- **Test scenarios** *(separate deterministic from stochastic — the load-bearing discipline)*:
  - **Deterministic (probe `p4`, mock `agent`):**
    - *Happy:* a built suite has all three `test_type`s + both `kind` roots; every card has a non-empty
      string `family`; DIR cards exist for every quality construct.
    - *Mechanical proof:* for each truth card, `ledgerLookup(card.mutation.span, packet).status ===
      'UNSUPPORTED'` and `card.proof.ledger_lookup` records it — **no `agent()` call** (assert capture empty).
    - *Schema:* every card matches the item-card shape; `expected.gate` set for MFT, `expected.taste_comparison`
      set for DIR/taste.
    - *Counterbalance:* across the suite, the violator/longer/supported sides are balanced (A/B parity);
      no `Original|Fabricated|Bland` literal leaks into card text.
    - *Edge:* no incumbent / empty ledger → returns `[]` (or a flagged minimal set), never throws.
  - **Stochastic (NOT asserted deterministically — structural only / documented):** the *content*
    quality of LLM-generated mutations and taste pairs is not probe-asserted; only their *structure*
    (card shape, family present) is. A separate manual/maximal-tier check, multi-trial, owns content.
- **Verification:** `buildAnchors` returns family-tagged cards with all three test types; every truth
  card's planted span is `UNSUPPORTED` by `ledgerLookup` with no LLM call; DIR controls present; a
  default (non-QUALIFY) run never calls it (byte-identical — assert via `p1` still green).

### U11b. Orchestrator-side bank bridge (`qualify.js`)

- **Goal:** Turn a build-run's returned `items[]` into the durable, committed bank, and load a bank's
  partitions to feed a certifying run via `args` — the fs/persistence half U11a can't do.
- **Requirements:** PLAN_3 U11 (durable, persisted, held-out-by-family — "built once, reused").
- **Dependencies:** U11a (consumes its `items[]`); U21 `anchorbank.js` (composes its API).
- **Files:**
  - Create: `worldcup/references/qualify.js` — standalone CJS (Node stdlib), orchestrator-side. Exports
    `persistAnchors({packet, items, provenance, created, baseDir})` (→ `buildBank` → `write`, returns the
    path), `loadPartitionForRun(bankFile, livePacket, {partitions})` (→ `readForPacket` +
    `assertCertifiable` → the `args.anchorBank` payload via `itemsInPartition`), and (for U12)
    `writeCard(cardData, baseDir)`.
  - Create: `probes/p5-qualify.mjs`.
  - Modify: `worldcup/references/qualifiers.md` — the anchor-build + certifying-run launch recipes
    (orchestrator builds bank → commits; passes held-out partition via `args`).
- **Approach:** Thin composition over `anchorbank.js` — no new bank primitive. `loadPartitionForRun`
  returns ONLY the partition(s) a run is allowed to see (certification/canary held out from a certifying
  run's authoring; dev/selection for tuning), stamping `version` so the card can name
  `anchor_bank_version`. `created`/`provenance` stamped here (orchestrator has `Date`).
- **Patterns to follow:** `live-view.js` module shape (CJS, stdlib, CLI + `module.exports`); the
  `args`-payload pattern from the U20/U21 launch recipe in `qualifiers.md`.
- **Test scenarios:**
  - **Deterministic (probe `p5`, real fs in a tmp dir):**
    - *Happy:* `persistAnchors` round-trips through `read`/`verify`; path is `anchors/<pid>/bank-v<ver>.json`.
    - *Held-out:* `loadPartitionForRun` for a certifying run excludes certification+canary families from the
      authorable payload; `assertCertifiable` throws when the cert partition is empty.
    - *Stale:* `loadPartitionForRun` throws if the bank's `packet_id` ≠ the live packet (`readForPacket`).
    - *Error:* missing/corrupt bank → tagged error (delegates to `anchorbank` `read`).
- **Verification:** a build-run's items persist to a verifiable committed bank; a certifying run receives
  only its allowed partition; a packet change refuses the stale bank.

### U12. Certification algorithm (`certify`) + calibration card

- **Goal:** Inside the Workflow, generate **modular** candidate `EVALUATOR_CONFIG`s, score them on the
  passed-in held-out anchors via Wilson-gated stages, pick a certified `E*`, validate + reassign
  `EVALUATOR = E*` (opt-in; default unchanged), and emit a **calibration card** payload for the
  orchestrator to persist.
- **Requirements:** PLAN_3 U12 (Stage 1–3, executable Wilson gates, calibration card), certify-config-not-text.
- **Dependencies:** U11a + U11b (the held-out anchors arrive via `args`), U19 `EVALUATOR_CONFIG`/
  `validateEvaluatorConfig` (the reassign target + safety contract), U20 `ledgerLookup` (mechanical
  scoring of truth constructs).
- **Files:**
  - Modify: `worldcup/references/workflow-template.js` — add `certify(candidates, anchors, opts)` +
    the `args.anchorBank` read in the `ARGS` envelope; assign the resolved `EVALUATOR` when `QUALIFY`
    is on, else the default constant (byte-identical).
  - Create: `probes/p6-certify.mjs`.
  - Modify: `worldcup/references/qualifiers.md` — the certification protocol + card schema.
- **Approach (three stages, per PLAN_3, deterministic math + stochastic judgments):**
  - **Modular generation:** candidates for the gate protocol, each lens, and the aggregation/escalation
    policy *separately*, then compose — not monolithic blobs. Cap live run at **K ≤ 4** candidates.
  - **Stage 1 — mandatory gates (Wilson LB, jointly feasible):** each mandatory construct has a
    threshold on its 95% Wilson score interval, evaluated on the **certification partition**. Feasibility
    rule: pick `n` so a near-perfect config clears with margin — fabrication gates at **n≈20–30, LB≥0.75**;
    softer constructs at **n≥15**. **Any** mandatory construct below its bound ⇒ the config fails (NO
    cross-construct averaging). **Successive halving:** screen on the cheap dev partition, keep the top
    half, spend certification items only on survivors.
  - **Stage 2 — held-out utility:** `U(E)=Σ_c w_c[TPR_c − λ_c·FPR_c] + η·closePairAcc − γ·biasFail −
    δ·exploitRate`; Brier/log-loss for confidence-bearing outputs; risk–coverage with ABSTAIN/ESCALATE;
    per-construct dashboards (never one number).
  - **Stage 3 — ensemble Pareto:** qualify each lens on its own mandate; select by accuracy ×
    complementarity (residual-error correlation) × call-cost; **ablate** (full panel minus each lens) —
    a lens with no positive held-out marginal contribution loses its seat.
  - **Calibration card** (separate artifact, written by `qualify.writeCard`): `{ evaluator_version,
    judge_models, source_packet_schema, certified_domains, not_certified, hard_gate:{fabrication_recall,
    clean_false_dq_rate}, eligible_preferences:{close_pair_accuracy}, bias:{ab_swap_failure,
    length_invariance_failure}, adversarial_exploit_rate, known_blind_spots,
    expires_on:{model_or_prompt_change:true}, anchor_bank_version }`.
- **Patterns to follow:** `screenAll`/`playMatch`/`tally` (the surfaces `E` runs through); `ledgerLookup`
  (mechanical truth scoring); `validateEvaluatorConfig` (call on `E*` before reassign — `workflow-template.js`).
- **Test scenarios** *(separate deterministic from stochastic)*:
  - **Deterministic (probe `p6`, mock `agent` with controlled verdicts):**
    - *Wilson feasibility:* `5/5` does NOT certify (LB≈0.57 < threshold); `20/20` clears (LB≈0.84); a
      construct below its bound fails the whole config (no averaging).
    - *Reassign contract:* `certify` returns an `E*` that **passes `validateEvaluatorConfig`**; with
      `QUALIFY` off, `EVALUATOR` is byte-identical to the default (assert `p1` green).
    - *Halving:* with K candidates and seeded mock verdicts, only survivors reach the certification
      partition; the selected `E*` is the feasible one.
    - *Card schema:* the emitted payload has every required field incl. `anchor_bank_version` +
      `expires_on`; serializes to JSON.
    - *Halt-loud edge:* if NO candidate clears the gates (can't catch fabrication OR can't recognize a
      real improvement), `certify` halts loudly **before** any tournament spend.
  - **Stochastic (documented, not asserted):** the *actual* TPR/FPR of a real model on real anchors is
    measured by a live maximal-tier run, not a probe; `p6` proves the gate *logic* with controlled inputs.
- **Verification:** a blind config (no integrity lens / no fact-ledger clause) fails Stage 1; a config
  that hugs the incumbent fails the DIR gate; a complete config certifies and yields an `E*` whose lens
  set / schema / model / tally are the ones a subsequent run uses (assert via the threaded `ev`, not
  just `criteriaBlock`); the calibration card is emitted + persisted with the bank version.

## Scope Boundaries

- **Non-goal — U12b adversarial exploitation audit:** the red-team generator + `exploit_rate` is the
  *real final* but is a **follow-up after U12** (it consumes `E*`). `U(E)` leaves a `δ·exploitRate` slot;
  this effort does not build the red-teamer.
- **Non-goal — U13 weighted tally:** the `lensWeight`/`lensW`/`tally`/`marginOf` wiring **already merged
  via U19** (verified: `tally` calls `lensW(ev, v.lens)`; default `()=>1` is byte-identical). U12 just
  *emits* real weights into `E*.lensWeight`; no separate U13 build here unless trivial.
- **Non-goal — U14a/U14b axes:** out of scope. U14b stays **blocked** on PLAN_2 `finalizeField` (still
  pending in code).
- **Non-goal — changing the engine/gate/seeding/bracket:** with the default config + `QUALIFY` off,
  behavior is byte-identical. The qualifier only resolves the `EVALUATOR_CONFIG` the engine already consumes.

### Deferred to Follow-Up Work
- **judging.md §8 answer-key update:** §8 still carries the old `O≻F, O≻L, O≻V, B≻F` key. U11a *adds*
  the DIR counter-anchors in code; the **§8 prose update is U15's job** (downstream) — do not absorb here.
- **U12b red-team audit** and **U15 report panel** — separate units after this effort.

## System-Wide Impact

- **Interaction graph:** `buildAnchors`/`certify` are *new opt-in* sandbox functions — nothing in the
  default tournament path calls them, so the default run is unaffected. The one shared-surface change is
  the `ARGS` envelope gaining an `args.anchorBank` read (additive; legacy/array args unaffected — mirror
  the U20 `ARGS`/`GIVEN_ITEMS`/`LIVE_NONCE` parsing).
- **Error propagation:** orchestrator-side fs/integrity errors surface through `anchorbank`'s tagged
  errors (already loud); sandbox-side `certify` **halts loudly** when no config clears (never silently
  certifies). A failed candidate fails the *candidate*, not the run.
- **State lifecycle risks:** the bank is built once and **committed**; a certifying run reads a partition
  it did not author (held-out-ness). `readForPacket` + `assertCertifiable` are the guards; a packet
  change bumps the bank version and refuses the stale bank.
- **API surface parity:** `qualify.js` is the *only* new orchestrator entry point; it composes
  `anchorbank.js` — no parallel bank logic to keep in sync.
- **Unchanged invariants:** default `EVALUATOR` (QUALIFY off) is byte-identical; the fabrication gate
  veto path is independent of `lensWeight`; `ledgerLookup` semantics (whole-value entities, token-run
  facts) are consumed as-is, not modified.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Sandbox/orchestrator seam mishandled** (anchors or card can't cross) | JSON-only bridge: Workflow returns items / emits card; `qualify.js` persists. Mirrors the proven live-view `args`-in / output-out pattern. Probe `p5` covers the bridge with real fs. |
| **Stochastic gate asserted as deterministic** (flaky probe) | Test scenarios split: `ledgerLookup` proof + Wilson math + schema are probe-asserted with mocked `agent`; LLM content quality is documented-not-asserted (maximal-tier/multi-trial). |
| **Certify one thing, run another** (E* not what executes) | `certify` calls `validateEvaluatorConfig(E*)` before reassign; `p6` asserts the threaded `ev` (panel/schema/model/tally), not just `criteriaBlock` — same contract `p1` proves. |
| **Impossible Wilson gate** (threshold a perfect score can't clear at small n) | Feasibility rule baked into Stage 1: n≈20–30, LB≥0.75 for fabrication; `p6` asserts 5/5 fails, 20/20 clears. |
| **Certifying blandness** (answer key rewards the incumbent) | Mandatory DIR positive controls (`I≻O…`) are Stage-1 gates; a config that hugs the incumbent fails. |
| **Same-run smoke test** (bank authored by the certifying run) | `loadPartitionForRun` withholds certification/canary families; the bank is built in a prior run + committed. |
| **Default run drift** | `QUALIFY` opt-in flag; `p1` (73/73) must stay green — the byte-identity guard. |
| **/gate's recurring blind spot** (last 3 units each had a real leak the green probe missed) | Bake **adversarial executed counterexamples** into `p4`/`p5`/`p6` from the start; run `/gate` (`/invariance` + `/failure-mode`) per unit before commit. |

## Confidence cross-check (bug-trace vs the merged code)

| Plan claim | Merged-code clause | Match? |
|---|---|---|
| `EVALUATOR = E*` reassignable | `let EVALUATOR` + every surface `ev = EVALUATOR` (validated by `p1`) | ✓ |
| `ledgerLookup` gives a no-LLM mechanical proof | `ledgerLookup(span,packet)→{status,provenance}`, deterministic (U20) | ✓ |
| `anchorbank` persists + holds out by family | `buildBank/write/readForPacket/assertCertifiable/itemsInPartition` exported (U21) | ✓ |
| anchors cross to orchestrator without fs in sandbox | Workflow returns items / emits via log; `qualify.js` does fs (pattern: live-view) | ✓ |
| calibration card is a separate artifact | `EVALUATOR` has no `calibrationCard` field — emit + `qualify.writeCard` | ✓ |
| `family` required on every item | `anchorbank.assertItems` rejects non-string/empty family | ✓ (U11a stamps it) |

## Build order

`U11a → U11b → U12` (anchors generated → persisted/bridged → certified). Each its own `/gate`'d commit
on `feat/qualifiers-anchors-certification`; ship the connected effort as one PR (the units only make
sense together — the whole point of building the consumer alongside its first real exercise of the infra).
