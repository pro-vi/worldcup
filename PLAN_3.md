---
title: 预选赛 / Qualifiers — certify the evaluator (and axes) before the draw
type: feat
status: build-ready   # /agentify + code-review hardened, /provision-validated (2026-06-20); build order U19→U20→U21→U11… — see Build order
date: 2026-06-18
origin: standalone design dialogue (worldcup) — Idea 2 of the realtime-view + qualifiers exploration
plan: PLAN_3
depends_on: PLAN_1, PLAN_2
---

# 预选赛 / Qualifiers — certify the evaluator (and axes) before the draw

> **预选赛** = the qualification rounds that decide *who enters* the World Cup. Here the
> entrants are decided by two inputs UPSTREAM of the tournament and currently the **least**
> rigorous part of an otherwise ultra-rigorous machine: the **judge** (what winning means)
> and the **axes** (the design space the field is drawn from). This plan makes both *earn*
> their place — before a single real match is played.

> **Headline correction from the second opinion (GPT-5.5-pro, ~9m):**
> *"The worldcup needs a **test suite for the evaluator**, not another worldcup for the
> evaluator."* The theatrical symmetry (bracket the rubrics too) is wrong as experiment
> design. Contestants face a tournament; **judges face certification** — a hidden,
> behaviorally-structured validation suite (eligibility detection, **preference validity**,
> bias resistance, **robustness under adversarial optimization**). Keep "预选赛 / Qualifiers"
> as *product language*; internally it is a common-item validation protocol, not a bracket.

## The asymmetry this fixes (the motivating defect)

The skill's own doctrine names its weak point and then leaves it undefended:

- *"The judge is 80% of this skill."* (SKILL.md:41)
- *"Vague criteria produce a tasteless judge, which is the whole failure mode."* (SKILL.md:72)

Yet the two things that **define** the judge and the field get one paragraph or one call,
while the tournament that **uses** them gets 230–550:

| Input | Defines | Today's rigor | Tournament's rigor |
|---|---|---|---|
| Rubric (`CRITERIA_BASE`, `LENSES`) | what "better" means | one hand-authored block, never validated | 5-lens panels, BT confirmation, trust report |
| Axes (`DESIGN.axes`) | the search space | hand-written, or **one** one-shot `axis-finder` agent | factorial reconcile, effects, estimability probe |

A vague rubric optimizes the **wrong target precisely**; bad axes search the **wrong space
with great rigor**. Garbage-in is not softened by 500 downstream calls — it is *amplified*
by them: **best-of-N is itself an optimizer, so any rubric loophole gets hunted down**. The
founding failure (SKILL.md:37 — a fabricated essay won under a tasteless judge) is a judge
defect, not a bracket defect.

## Architecture Decision

**Approach.** Insert a **Qualifiers** phase between CONFIG and generation. It consumes the
raw user criteria + the incumbent and emits a *certified evaluator configuration* plus a
**calibration card** — and, when U14a/b land, a controllability-checked `DESIGN.axes`.
Downstream is **untouched**: generation, seeding, the gate, and every panel read
`CRITERIA_BLOCK` exactly as today — they just now read a block that *passed certification*.

**What we certify (the review's central correction): the whole evaluator configuration,
not rubric text.** Performance is conditional on the entire pipeline
`E = (rubric, lens prompts, judge model, source-packet schema, pair-order policy, decoding,
aggregation, escalation)`. The same rubric works with one model and fails with another, or
works on short copy and dilutes inside a 5k-token packet. So we qualify **versioned
configurations**; changing the judge model, template, aggregation, or model version
invalidates the cert (the calibration card carries `expires_on`).

> ⚠️ **This claim is a lie until the plumbing exists (code-review finding, High).** Today
> the lens set (`LENSES`/`panelFor`), the schemas, the judge model/options, and the
> aggregation are **hardcoded constants** in `workflow-template.js:151`. A qualifier that
> emits only `{ CRITERIA_BLOCK, lensWeights }` would **certify one thing and run another** —
> it certifies a config `E` but the runtime still uses the frozen lenses/schema/policy.
> Making `E` real requires a first-class **`EVALUATOR_CONFIG`** object threaded through every
> judge surface. That is **precondition P1** below, and U12 cannot honestly certify until it
> lands. Likewise the "mechanical proof" (P2) and "hidden held-out" (P3) claims each rest on
> data that does not exist yet. See **⛔ Preconditions**.

**The mechanism: criterion-referenced validation against a behavioral anchor bank** —
organized as CheckList does, not as "5 named ringers":
- **MFT (minimum functionality):** hard-gate obligations — the fabrication families a judge
  *must* catch.
- **INV (invariance):** A/B swap, length, irrelevant-edit — the verdict must **not** move.
- **DIR (directional expectation):** a controlled improvement must move the verdict the
  expected way — the **positive controls** the original design fatally lacked.

> **The single most important fix.** The original answer key was `O≻F, O≻L, O≻V, B≻F` — *all*
> reward the incumbent / the blander option. A trivial classifier ("prefer whatever overlaps
> the original; if unsure pick the less vivid one") **passes it** — and that judge is
> disastrous: it rejects genuine improvement, favors blandness, and makes the **reference
> challenge nearly unwinnable**. Certification MUST include directional counter-anchors:
> `I≻O` (truthful, voice-faithful improvement beats the original), `T≻B` (truthful vividness
> beats bland-but-faithful), `I≻L` (restrained improvement beats uplift), `O≻C` (original
> beats a cleaner-but-authorially-distorted rewrite), `I₂≻I₁` (expert-supported winner among
> two eligible improvements). Without these you certify *aversion to failure*, not *ability
> to find quality*.

**Per-lens, per-construct — not one monolithic answer key.** Forcing every lens to choose
`O≻F` turns each lens into another integrity lens and destroys the diversity the panel
exists for (and the gate should already have removed F). Each seat qualifies on **its own
mandate**: the gate on fabrication + false-positive control; `fidelity` on
authorial-preservation; `argument` on reasoning changes; `anti-gaming` on surface-signal
attacks; `cold-reader` on reader preference; the panel as a whole on mixed trade-offs.

**Rejected — bracket the rubrics (theatrical symmetry).** A bracket gives different
candidates different items, compounds upsets, wastes paired information, and can crown a
rubric that never met its weakest construct. Evaluator selection uses a **common-item paired
design**: every surviving configuration sees the **same** hidden items in balanced order;
compare with paired bootstrap / a hierarchical model, never a knockout.

**Rejected — free-form rubric text search (DSPy/OPRO).** The rubric generator *is* an
automatic prompt optimizer; treating it as one imports every model-selection hazard (small
validation sets, peeking, winner's curse, metric overfitting, no transfer). We bound it:
**low-capacity, modular candidates** (faithful distillations of the user's stated criteria +
lens/aggregation choices, generated per-module then composed — not monolithic blobs), plus
hidden **leave-one-family-out** validation.

**The meta-regress is relocated, not eliminated — and that's fine.** Planted anchors give a
*finite, inspectable* trust root, not objective truth. Two anchor kinds, two roots:
- **Truth anchors** (an unsupported date/name/quote/log inserted; target scope expanded) —
  answer key derives from **mutation provenance + the source ledger**; these approach genuine
  unit tests, and a planted truth-mutation **must** trip the real gate (closure self-check).
- **Taste anchors** (which ending has more pressure; did a revision improve the piece) — **no
  mind-independent answer**; the root is explicit author/editor/stakeholder judgment. Do not
  call these "ground truth." Anchors *terminate* the regress at a reviewable combination of
  source-truth and stakeholder judgment — that is exactly how psychometric validity is framed
  (Messick: an accumulating validity argument, not one magic coefficient).

**Trade-off / cost reality.** The review is blunt: **40–80 calls is a smoke test, not
certification.** A credible maximal qualifier is **~100–250 independent judgments** (8 configs
× directional+invariance+gate families × mirrored order, before panels / held-out /
adversarial). Batching anchors into one call lowers cost but couples context and lets the
judge infer the test pattern — use sparingly. Stays opt-in on the MVP/maximal split: MVP
hand-fills as today; maximal certifies.

## Data flow

```
PRECONDITIONS (own refactor PRs, land FIRST):
  P1 EVALUATOR_CONFIG (first-class, threaded)   P2 structured SOURCE_PACKET/FACT_LEDGER
  P3 durable anchor-bank artifact (versioned, split-manifest, persisted across runs)
   │
CONFIG (raw criteria, INCUMBENT, structured packet+ledger[P2], candidate config-modules)
   │
   ▼  phase('Qualifiers')  ── opt-in (QUALIFY); requires an incumbent + a STRUCTURED ledger[P2]
   ├─ U11 anchorBank(packet[P2]) ─▶ {MFT, INV, DIR} items (truth+taste roots), item cards,
   │        minimal single-span mutations; proof = ledger set-membership[P2]; F-trips-gate self-check
   │        ▶ persisted to the durable bank[P3] (built once, REUSED; that is what makes held-out hidden)
   ├─ U12 certify(configs E[P1], bank[P3])           [common-item paired design, NOT a bracket]
   │        Stage 1 mandatory gates  (per construct; Wilson-LB ≥ threshold; min n/family; stopping rule)
   │        Stage 2 select on held-out utility (Brier/log-loss, risk–coverage w/ ABSTAIN)
   │        Stage 3 ensemble assembly (Pareto lenses by accuracy × complementarity × cost; ablate seats)
   ├─ U12b adversarialAudit(top configs)   ── the REAL final: red-team the rubric, measure exploit-rate
   │        ▶ CERTIFIED EVALUATOR_CONFIG E* { criteriaBlock, lenses, panelPolicy, schemas,
   │                                          model+options, aggregation:{lensWeights}, calibrationCard }
   ▼
EVALUATOR := E*   (the WHOLE config — not just CRITERIA_BLOCK — replaces the hardcoded defaults)
   │
   ▼  (unchanged shape) deriveCandidates ─▶ screenAll ─▶ seed ─▶ groups ─▶ knockout ─▶ reference challenge
                                          ▲ every judge surface reads E* (prompts, panelFor, schema, model, tally[U13])
   │
   ▼  renderReportV2 + a Qualifiers panel (U15): the calibration card + per-construct scorecard
```

## ⛔ Preconditions — make certification *real* before U11/U12 (code-review findings)

The v2 plan was conceptually right but **overclaimed "certification" without the data
lifecycle and runtime plumbing that make it real** (code-review, 2026-06-18). Three
structural extractions must land FIRST, each as **its own refactor PR** (do not bundle into a
feature PR — same rule PLAN_2 set for `finalizeField`). Until they exist, U11/U12 can only
build a same-run smoke test that certifies a config the runtime then ignores.

> **These are first-class build units — `U19`, `U20`, `U21`.** They carry late numbers only
> because the global sequence was already at U18 (PLAN_4); per the established convention
> (unit number is an identifier, not a sequence — cf. PLAN_2's U9/U10), **the Build order is
> authoritative and these build FIRST.** Body text refers to them by mnemonic:
> **U19 = P1**, **U20 = P2**, **U21 = P3**.

### U19 (P1). `EVALUATOR_CONFIG` — make the evaluator a first-class, threaded object
- **Why:** certification claims to qualify `E = (rubric, lens prompts, lens set, judge model +
  options, schemas, pair-order policy, aggregation, escalation)`, but the runtime hardcodes
  `LENSES`/`panelFor` (`workflow-template.js:151`), the `*_SCHEMA`s, the model/options, and the
  tally. A qualifier emitting only `{ CRITERIA_BLOCK, lensWeights }` **certifies one thing and
  runs another.**
- **What:** extract a single `EVALUATOR_CONFIG` object and thread it through **every** judge
  surface — `lensPrompt`/`seedPrompt`/`flawPrompt` (criteria + wording), `LENSES` + `panelFor`
  (the lens set + per-stakes panel policy), `FLAW_SCHEMA`/`LENS_SCHEMA`/`SEED_SCHEMA` (schemas),
  the `DQ_FAMILY` map + `HARD_DQ_CATEGORIES` (the gate's family-DQ vocabulary, landed in PR #2 —
  `workflow-template.js:113` — folds into `EVALUATOR.dqFamily`/`.hardDqCategories`), the
  `agent(..., { model, ... })` options, `tally`/`marginOf` (aggregation), and the even-split
  escalation. Default config = today's constants ⇒ **byte-identical** current behavior (a probe
  proved this feasible this session: extraction + threading + 35/35 byte-identity assertions).
- **Files:** `references/workflow-template.js` (the plumbing); document the shape in
  `references/qualifiers.md`.
- **Gate:** with the default config, a full run reproduces current results exactly; U12's
  certified `E*` then *replaces* the default at every surface (probe: assert `panelFor`,
  schema, model, and tally all read `E*`, not a constant).

### U20 (P2). Structured `SOURCE_PACKET` / `FACT_LEDGER` — so truth-anchor proofs are mechanical
- **Why:** U11's truth anchors claim a **mechanical** `ledger_lookup` proof, but today the fact
  ledger is **prose inside `CRITERIA_BASE`** (`workflow-template.js:71`). Checking a planted
  specific against prose is itself prompt-parsing — not a proof.
- **What:** a structured packet schema — `{ supported_facts:[...], allowed_entities:{dates,
  names, files, quotes, ...}, not_allowed:[...], target?:{claims, scope, quotes, sources} }` —
  so `ledger_lookup(span)` is a real **set-membership / pattern check** returning
  SUPPORTED | UNSUPPORTED with provenance. The prose ledger is *derived from* this for the
  judge prompts (one source of truth), not the other way round.
- **Files:** `references/judging.md` §1 (the packet template → a schema), `workflow-template.js`
  (`CRITERIA_BASE` becomes a render of the structured packet).
- **Gate:** a planted unsupported date/name/file is mechanically flagged UNSUPPORTED with no LLM
  call; the rendered prose ledger matches the structured source.

### U21 (P3). Durable anchor-bank artifact + split manifest + lifecycle — so "hidden" is real
- **Why:** "hidden held-out / leave-one-family-out" certification is meaningless if the anchor
  bank is **regenerated each run by the same session being certified** — that is a same-run
  smoke test, not held-out validation. The review's partitions (development / selection /
  certification / canary) only exist if the bank **persists**.
- **What:** a versioned on-disk bank — `anchors/<packet-id>/bank-v<n>.json` — carrying the
  item cards (U11), a **split manifest** (which families are dev vs selection vs certification
  vs canary), **content checksums**, **provenance** (constructor model/human, verifier models),
  and a **human-adjudication status** per taste anchor. Built once; reused across runs;
  certification reads the *hidden* partitions it did not author this run. Bank version is
  stamped into the calibration card (`anchor_bank_version`).
- **Files:** new `anchors/` artifact + a small `anchorbank` read/write/version helper documented
  in `references/qualifiers.md`; `.gitignore`/commit policy for the bank (taste-gold is reviewed,
  versioned data — likely committed; large generated mutants may be gitignored).
- **Gate:** the certification partition is held out by **family** and was not authored in the
  certifying run; re-running with the same bank version is reproducible (checksums match);
  changing the packet bumps the bank version.

> **Sequencing rule (same as PLAN_2):** a unit built *after* P1–P3 inherits real
> certification; one built *before* repeats the overclaim. Land P1 → P2 → P3 (each its own PR)
> **before** U11/U12. P1 is also reusable beyond qualifiers (it makes the whole judge
> configurable — cross-model panels, per-domain lens sets — so it earns its keep regardless).

## Implementation Units

### U11. Anchor bank — a behavioral test suite (MFT / INV / DIR), not 5 ringers
- **Goal:** From the incumbent + fact ledger, build a versioned **anchor bank** with three
  test types (MFT gate-obligations, INV invariances, **DIR directional/positive controls**),
  spanning **truth anchors** (provenance-rooted) and **taste anchors** (stakeholder-rooted),
  held out by **family** (not a random split). Close the loop: planted truth-mutations must
  trip the real fabrication gate or surface a loud error. The bank is **built once and
  persisted to the durable artifact (P3)** — regenerating it each run defeats "held-out."
- **Dependencies:** **P2** (the structured packet/ledger — without it the "mechanical proof"
  is prose-parsing) and **P3** (the durable bank artifact — without it "hidden held-out" is a
  same-run smoke test); plus existing `screenAll`/`preflight` and `INCUMBENT`.
- **Files:** new `references/qualifiers.md` (the anchor schema + construction rules); Modify
  `references/workflow-template.js` (`anchorBank()` — reads P2, writes P3).
- **Approach / construction rules (from the review):**
  - **Minimal single-span mutations** from an eligible base — not archetypal rewrites that
    differ on many axes at once. Match length and surrounding polish. (e.g. base: *"took
    longer than I expected"* → mutant: *"took three days and ended at line 417 of Parser.ts"*;
    `ledger_lookup("three days")`, `("line 417")`, `("Parser.ts")` all return UNSUPPORTED from
    the **structured ledger (P2)** — a real set-membership check, so the expected gate outcome
    has a **mechanical proof**, not a prose comparison.)
  - **Item card** per anchor: `{construct, test_type(MFT|INV|DIR), source_packet_id, base_id,
    mutation:{span,operator}, expected:{gate, taste_comparison}, proof:{ledger_lookup},
    known_confounds, difficulty, provenance:{constructor, verifier_models, human_adjudicated}}`.
  - **Counterbalance every shortcut:** longer wins sometimes / shorter sometimes; supported
    vividness wins / fabricated vividness loses; a paraphrase wins sometimes (so incumbent-
    overlap is non-predictive); the violator appears equally as A and B; **strip the
    `Original`/`Fabricated`/`Bland` labels** (else you test metadata recognition).
  - **DIR positive controls are mandatory:** `I≻O, T≻B, I≻L, O≻C, I₂≻I₁` (see Architecture).
  - **Independent roots:** don't let one model author the rubric *and* the anchors *and* the
    cert. Truth anchors → mutation provenance + deterministic ledger checks + human
    verification; taste anchors → multiple blinded editors, explicit tie/uncertain labels,
    only consensus treated as gold.
  - **Partitions:** development (feedback allowed) · selection (hidden) · certification (held
    out by source *and* failure family) · production canaries (drift detection). Hold out whole
    **mutation families / source docs / genres / generator families**, never a random split.
- **Test scenarios:** *Happy:* bank built with all three test types + truth/taste roots; a
  planted truth-mutation trips the gate. *Edge:* no incumbent/ledger → bank unavailable,
  qualifiers fall back to hand-fill (logged). *Error:* a truth-mutation passes the gate → throw
  with the span + verdict (anchor or gate is broken; never silent).
- **Verification:** the bank returns family-tagged items with item cards; truth-mutations are
  gate-positive; DIR items exist for every quality construct.

### U12. Evaluator certification — common-item gates + held-out utility (NOT a bracket)
- **Goal:** Generate **modular** candidate `EVALUATOR_CONFIG`s, run them through the anchor bank
  on **common items**, and emit a **certified `EVALUATOR_CONFIG` `E*`** (criteria block, lens
  set, panel policy, schemas, model+options, aggregation/`lensWeights`, escalation, calibration
  card) that *replaces the hardcoded defaults at every judge surface* (via P1). The operator's
  hand config is **candidate #0** (it must certify too; a vague hand-fill failing here is a real,
  useful result). Qualify **configurations** `E`, not rubric text.
- **Dependencies:** **P1** (so the certified config is the one that actually runs), **P3** (so
  validation is on a hidden, persisted partition), and **U11**.
- **Files:** Modify `references/workflow-template.js` (`certify()`; assign the resolved
  `EVALUATOR_CONFIG` from the qualifier when `QUALIFY` is on, else the default);
  `references/qualifiers.md`.
- **Approach (three stages, per the review):**
  - **Modular generation:** generate candidates **separately** for the gate protocol, each lens,
    and the aggregation/escalation policy — then compose promising modules. Not ten monolithic
    "rubric + lens-set" blobs.
  - **Stage 1 — mandatory gates (certification, per construct, *executable* confidence rule):**
    each mandatory construct has a threshold on the **Wilson score lower bound** (95%) of its
    success rate, evaluated on the **certification partition (P3)**, with a **minimum n per
    family** so a bound exists. Concrete v1: `n ≥ 10` items/family; pass requires Wilson-LB ≥
    {fabrication-recall 0.80, clean-false-DQ ≤ 0.10 (upper bound), A/B-reversal ≤ 0.15,
    improvement-recognition 0.70}; **any** mandatory construct below its bound ⇒ config fails
    (no averaging across constructs). **Stopping rule:** successive halving — screen all
    candidates on the dev partition (cheap), keep the top half, spend selection/certification
    items only on survivors. (5/5 raw never certifies — its Wilson-LB is ~0.57.)
  - **Budget reconciliation (code-review finding):** ~100–250 judgments cannot cover {K configs ×
    C constructs × ≥10 items × mirrored × held-out families × adversarial} in one run. Two levers,
    both leaning on P3: (a) the **persistent bank amortizes** anchor authorship across runs — you
    build/adjudicate once, then each certification only *spends judgments*, not generation; (b)
    cap the live run to **K ≤ 4 candidate configs** and **C = the mandatory constructs only**
    (quality-construct dashboards are diagnostic, not gating). Worked budget: 4 configs ×
    successive-halving (4→2 survivors) × ~5 mandatory families × 10 items × mirror ≈ 150–220
    judgments. State the chosen K, n/family, and which constructs gate, per run.
  - **Stage 2 — select among qualified configs on held-out utility:**
    `U(E)=Σ_c w_c[TPR_c − λ_c·FPR_c] + η·closePairAcc − γ·biasFail − δ·exploitRate`. For
    confidence-bearing outputs use **Brier / log-loss** and allow **ABSTAIN/ESCALATE** —
    measure the **risk–coverage curve**, not bare accuracy. Per-construct dashboards (blatant
    vs subtle, eligible vs ineligible, near-tie, short vs long context, same- vs cross-model);
    **never collapse to one qualification number.**
  - **Stage 3 — ensemble assembly (lens panel):** qualify each lens on its own mandate; select
    a small **Pareto set** by accuracy × **complementarity (residual-error correlation)** ×
    call-cost; **ablate** (full panel minus each lens) — a lens with no positive held-out
    marginal contribution loses its ceremonial seat. *Five lenses that fail on the same items
    are one judge repeated five times.*
- **Overfitting controls:** low-capacity modular candidates; **leave-one-family-out** held-out;
  five test distributions (synthetic minimal pairs · mined **historical worldcup failures** ·
  natural near-boundary pairs · cross-source/cross-generator · adversarial — U12b); the live
  field + end-of-run trust report remain the ultimate held-out check.
- **Output — the calibration card:** `{ evaluator_version, judge_models, source_packet_schema,
  certified_domains, not_certified, hard_gate:{fabrication_recall, clean_false_dq_rate},
  eligible_preferences:{close_pair_accuracy}, bias:{ab_swap_failure, length_invariance_failure},
  adversarial_exploit_rate, known_blind_spots, expires_on:{model_or_prompt_change:true},
  anchor_bank_version }`. *More valuable than "Rubric Argentina won the final."*
- **Test scenarios:** *Happy:* a complete config clears the gates with low bias and certifies.
  *Edge:* **no config clears the gates** (can't catch fabrication, OR can't recognize
  improvement) → **halt loudly** ("the criteria cannot distinguish fabrication / cannot
  recognize a real improvement — fix the source packet") before burning the tournament budget.
  *Error:* anchor judgment incomplete after retries → fail the candidate, not the run.
- **Verification (probe):** a blind config (no integrity/anti-gaming lens, no fact-ledger
  clause) fails Stage 1; a config that hugs the incumbent fails the DIR gate; a complete one
  certifies and emits a drop-in `EVALUATOR_CONFIG` whose lens set / schema / model / tally are
  the ones the subsequent run actually uses (assert via P1, not just the criteria block).

### U12b. Adversarial exploitation audit — the real "final"
- **Goal:** Because best-of-N *is* an optimizer that will hunt rubric loopholes, the deciding
  test isn't config-A-vs-config-B on more anchors — it's **which evaluator is hardest for an
  adaptive generator to hack.** Mandatory at the maximal tier.
- **Dependencies:** U12 (run on the top 2 configs).
- **Files:** Modify `references/workflow-template.js` (`adversarialAudit()`); `references/qualifiers.md`.
- **Approach:** Freeze the candidate evaluator; hand its rubric to a **red-team generator**
  told to produce outputs that **win while violating a hidden requirement or staying
  substantively weak**; run 16–32 attempts; an **independent verifier** classifies exploit
  success. Report `exploit_rate = invalid-or-weak-outputs-the-evaluator-preferred / attempts`.
  Pick the harder-to-hack config; feed `exploit_rate` into the calibration card and `U(E)`.
- **Test scenarios:** *Happy:* the config with a fact-ledger + anti-gaming lens has a lower
  exploit rate than a taste-only config. *Edge:* both exploitable → surface it; the field is
  not safe to optimize against this rubric. *Probe:* a known loophole (reward length/vividness)
  is discovered by the red-teamer and reflected in `exploit_rate`.
- **Verification:** `exploit_rate` reported per config; the lower-rate config is selected.

### U13. Weighted tally — keyed to the actual vote shape (consume `lensWeights`)
- **Goal:** The qualifier emits reliability weights; the panel must use them. judging.md §7
  specifies "weight by judge reliability if calibrated" — currently unimplemented (`tally`
  counts 1:1, `workflow-template.js:305`).
- **Vote-shape correction (code-review finding):** votes today carry only
  `{ lens, winner, margin, reason }` (built in `playMatch`'s lens panel) and `tally`
  (`workflow-template.js:305`) counts them 1:1. "Per-construct" weights don't fit that shape — a lens vote isn't tagged with a
  construct. So **weights are keyed by `lens` (optionally × `stakes`)**, which the verdict
  already carries; finer construct-level weighting would require stamping construct metadata on
  each verdict (a larger plumbing change — deferred, noted not silently assumed).
- **Keep the gate out of the taste tally (code-review finding):** the fabrication gate is a
  **veto** (`screenAll` → `playMatch` Stage 0), not a weighted lens vote. Its reliability is
  certified separately (U11/U12 MFT) and must **not** be folded into the lens-vote weighting; a
  high-recall gate doesn't earn a taste lens more votes.
- **Dependencies:** U12 (emits the weights) and **P1** (the tally is part of `EVALUATOR_CONFIG`).
- **Files:** Modify `references/workflow-template.js` (`tally`/`marginOf` take a per-lens(×stakes)
  weight map from `EVALUATOR_CONFIG.aggregation`).
- **Approach:** Per-lens weights **shrunk toward equal weighting** (not one scalar fit on a tiny
  anchor set). Default all-1 ⇒ **byte-identical to today** (degenerate-safe, like `kind:'flat'`);
  ties + even-split escalation preserved.
- **Test scenarios:** *Happy:* a lens downweighted (it was unreliable on its mandate at this
  stakes) no longer flips a split panel. *Edge:* all weights 1 → identical to current tally.
  *Integration:* the gate veto path is unchanged regardless of lens weights.
- **Verification:** all-1 weights reproduce current results exactly; gate-veto decisions are
  independent of `lensWeights`.

### U14a. (now, lightweight) Axis controllability *smoke check* — replace the vacuous test
- **Goal:** Replace the existing orthogonality test, which the review shows is **vacuous**: a
  full-rank one-hot design proves the *coordinates* are combinatorially independent, **not that
  the generator obeyed them** (a 2×2 is full rank even if the model ignores an axis), and
  "corners read different" is too weak (one axis may cause all the difference; lexical ≠
  semantic; one sample confounds with generation randomness). U14a is the **cheap** intervention
  check that ships *now* — explicitly **not** the full qualifier.
- **Dependencies (deliberately light — the order-contradiction fix):** a generator + a *blinded
  recover-the-level* judge only. **Not** `finalizeField`, **not** the full U12 certification.
  (It's a sanity probe on the generator's controllability, not a judged tournament; a rough
  rubric suffices to ask "which level is this?".)
- **Files:** Modify `references/workflow-template.js` (`deriveAxes` dynamic branch: add the
  controllability probe before committing axes); `references/design-pass.md`.
- **Approach:** For each proposed axis *i*: a few matched outputs differing **only** in *i*,
  ≥2 seeds, **blind the judge to the requested coordinate**, compute **Controllability**
  `C_i = P(recovered level = requested)` and a coarse **Cross-talk** `X_ij`. Drop / warn on
  axes with low `C_i` (a fake knob the generator ignores). Cheap: a handful of gens + recovers
  per axis.
- **Test scenarios:** *Happy:* a controllable axis passes; a fake knob (low `C_i`) is dropped.
  *Edge:* all axes low-`C_i` → fall back to the documented single-axis binary. *Probe:* a
  high-determinant-but-ignored axis is caught by `C_i` where the old rank check passed it.
- **Verification:** dropped axes are exactly the low-`C_i` ones; no dependency on U12 or `finalizeField`.

### U14b. (deferred) Full axis qualifier — quality-relevance, search yield, portfolio
- **Goal:** The full intervention-based axis qualifier: beyond `C_i`/`X_ij`, measure
  **replicability** across seeds/models, **quality-relevance** (variation along the **upper
  tail** of real quality, not mere visible difference — an axis can be perfectly controllable yet
  useless), and **search yield** (fraction of pilot candidates reaching the top quartile;
  marginal gain from adding the axis). A **12–24-output replicated fractional-factorial pilot**
  beats one 2×2 corner. **Portfolio option:** allocate field slots across promising axis sets
  (bandit), not a single champion.
- **Dependencies:** **the PLAN_2 `finalizeField` route-guard extraction** (a new generation route
  must inherit the well-formed-field contract) **and a certified evaluator (U12)** — quality-
  relevance and search-yield are *judged*, so the rubric must be trustworthy first. This is why
  U14b is deferred while U14a is not.
- **Files:** `references/workflow-template.js` (`axisQualifier`), `references/design-pass.md`.
- **Test scenarios:** *Happy:* a controllable **and** quality-relevant set beats a controllable-
  but-useless one. *Edge:* no set clears quality-relevance → keep U14a's survivors, log it.
- **Verification:** the chosen axis set has high `C_i`, low cross-talk, **and** positive search yield.

### U15. Qualifiers report panel + SKILL/judging wiring
- **Goal:** Surface 预选赛 in the report and docs: a **Qualifiers panel** in `renderReportV2`
  (the **calibration card**, the per-construct scorecard, the DIR/improvement-recognition row,
  the `exploit_rate`, and which configs failed and why; for U14a/b, the controllability/cross-talk
  table); update SKILL.md ("settle these first" gains a qualifier opt-in + the corrected cost),
  and **generalize judging.md §8** from juror-calibration to evaluator certification.
- **Dependencies:** U12 (+ U12b for the audit row, U14a/b for the axis half).
- **Files:** Modify `references/workflow-template.js` (`renderReportV2`), `SKILL.md`,
  `references/judging.md`, `references/qualifiers.md`.
- **Approach:** Reuse the existing panel CSS; the scorecard is a table (config × construct,
  with the certified row gold, the DIR/improvement column present, the exploit-rate badge).
- **Verification (probe):** mock-render with 3 candidate configs (1 certified, 2 failed) →
  balanced markup, the DIR column + exploit-rate visible, the calibration card rendered.

## Scope Boundaries
- **Non-goal:** internal bracketing of rubrics (the review's core correction — common-item
  validation, not a knockout). "Qualifiers / 预选赛" is product language only.
- **Non-goal:** free-form rubric-text optimization (DSPy/OPRO at full strength). We select among
  low-capacity modular candidates; an auto-optimizer is a future unit gated behind held-out +
  adversarial splits.
- **Non-goal:** qualifiers for runs with **no incumbent / no fact ledger** — the anchor bank
  needs a truth root. Without one, fall back to hand-fill (qualifiers off) or a reduced ringer
  pair; not in this plan.
- **Non-goal:** changing the tournament engine, the gate, seeding, or the bracket math. The
  qualifier resolves the `EVALUATOR_CONFIG` the engine already consumes; with the default config
  and all-1 weights, behavior is byte-identical to today.
- **In scope (added by the code-review pass):** the **data lifecycle and config plumbing** —
  P1/P2/P3 — without which "certification" is overclaim. They are preconditions, not optional.
- **Non-goal (this plan):** the **full** axis qualifier (U14b) ships only after the PLAN_2
  `finalizeField` extraction + U12; until then U14a (the cheap controllability check) is the
  axis story and the dynamic axis-finder otherwise stays one-shot.

## Risks & Dependencies
| Risk | Mitigation |
|---|---|
| **Certify one thing, run another** (emit `CRITERIA_BLOCK` but the runtime keeps hardcoded lenses/schema/model) | **P1 `EVALUATOR_CONFIG`** threaded through every judge surface; probe asserts `panelFor`/schema/model/tally read `E*` |
| **"Mechanical proof" is actually prose-parsing** (fact ledger is prose in `CRITERIA_BASE`) | **P2 structured packet/ledger**; `ledger_lookup` is set-membership, no LLM call |
| **"Hidden held-out" is a same-run smoke test** (bank regenerated by the certifying session) | **P3 durable bank** built once + persisted; certify on a partition held out by family that this run did not author |
| **"Confidence-bounded" is unexecutable** (no thresholds / n / interval / stop) | concrete v1: Wilson-LB ≥ per-construct thresholds, n ≥ 10/family, successive-halving stop; budget reconciled by amortizing P3 + capping K ≤ 4 |
| **Certifying blandness** (the answer key rewards the incumbent; the judge hugs the original and the reference challenge becomes unwinnable) | **DIR positive controls (`I≻O, T≻B, …`) are mandatory Stage-1 gates** — this is the load-bearing fix |
| **Every lens collapses into an integrity lens** (forced to reproduce `O≻F`) | qualify each lens on **its own mandate**, per-construct; the gate, not the taste lenses, owns fabrication |
| **Static ringers ≠ adaptive contestants** (best-of-N hunts loopholes) | **U12b adversarial exploitation audit** as the real final; report `exploit_rate` |
| **Anchor overfitting / metadata recognition** | minimal single-span mutations; strip labels; counterbalance shortcuts; **leave-one-family-out**; five test distributions incl. mined historical failures |
| **Meta-regress relocated, not removed** | finite inspectable root: truth anchors ← provenance+ledger (self-checked against the gate); taste anchors ← blinded multi-editor consensus; never one model authoring rubric+anchors+cert |
| **Qualifying rubric text, not the pipeline** | certify versioned **configurations** `E`; calibration card carries `expires_on` model/prompt change |
| **Cost under-budgeted** | realistic maximal ≈ **100–250 judgments** (not 40–80); successive halving + careful batching; opt-in (MVP off) |
| **Axis check vacuous (rank/corner)** | replace with **intervention**: controllability `C_i`, cross-talk `X_ij`, replicability, quality-relevance, search yield |

## Probe Gates
1. **P1 — certified == run (the High finding):** with `E*` certified, assert every judge surface
   (`panelFor`, schema, model/options, `tally`) reads `E*`, not a constant; default config
   reproduces current results byte-for-byte.
2. **P2 — mechanical proof:** a planted unsupported date/name/file is flagged UNSUPPORTED by
   `ledger_lookup` with **no LLM call**; the prose ledger renders from the structured source.
3. **P3 — real held-out:** the certification partition is held out by family and was not authored
   in the certifying run; same bank version ⇒ reproducible (checksums match).
4. **Executable confidence (U12):** 5/5 raw does **not** certify (Wilson-LB ≈ 0.57 < threshold);
   a construct below its bound fails the whole config (no cross-construct averaging).
5. **DIR / improvement-recognition (U12):** a config that cannot rank a truthful, voice-faithful
   improvement above the original (`I≻O`) is **rejected** — keeps the reference challenge
   winnable and stops certified blandness.
6. **MFT / fabrication recall (U11+U12):** a config that misses a held-out fabrication family is
   rejected; planted truth-mutations must trip the real gate or the anchor/gate contradiction is
   surfaced.
7. **INV / bias (U12):** A/B-swap or length-invariance failure above threshold disqualifies a config.
8. **Adversarial exploit rate (U12b):** the selected config is the harder-to-hack of the finalists.
9. **Degenerate-safety (U13):** all-1 `lensWeights` reproduce current results byte-for-byte; the
   gate veto is independent of lens weights.
10. **Axis controllability (U14a):** a high-determinant-but-ignored axis set is caught by low `C_i`.

## Build order

> **This section is authoritative for `/build` sequencing** (units carry late numbers; build in
> THIS order, not numeric order).

**Preconditions first (each its own refactor PR, not bundled):**
**U19** (`EVALUATOR_CONFIG`) → **U20** (structured packet/ledger) → **U21** (durable anchor bank).
Without these, U11/U12 build a smoke test that certifies a config the runtime ignores. **U19 (P1)
stands alone** (it makes the whole judge configurable, and a probe this session proved the
extraction is byte-identical at 35/35), so it is the natural first focused-refactor PR.
**B (evaluator certification):** U11 → U12 → U12b → U13 → U15(rubric half). Rubric first is
confirmed by the review — *useful-axis evaluation depends on a trustworthy evaluator, and the
rubric also judges the axis pilot*. Closes the founding failure and the certified-blandness trap.
**A (axes):** **U14a now** (the cheap controllability smoke check, light deps — replaces the
vacuous rank/corner test immediately); **U14b deferred** behind the PLAN_2 `finalizeField`
extraction **and** U12. Validation (2026-06-20) confirms `finalizeField` is **still pending** (not
in code), so U14b stays blocked; U14a is unblocked. Then U15(axis half).

**Full sequence:** `U19 → U20 → U21 → U11 → U12 → U12b → U13 → U14a → U15` (U14b deferred).

## Provenance / second opinion
Hardened by an **/agentify (GPT-5.5-pro, extended, ~9m25s) review on 2026-06-18** — full text in
`.inbox/2026-06-18_agentify-review-plan3-qualifiers.md`. Net changes from the v1 draft:
(1) reframed from "rubric-as-tournament-contestant" to **evaluator certification** (common-item
validation, not an internal bracket); (2) added **mandatory directional/positive anchors** — the
v1 answer key would have certified blandness and broken the reference challenge; (3) **per-lens,
per-construct** qualification instead of one monolithic answer key; (4) added the **adversarial
exploitation audit** (U12b) as the real final; (5) certify **versioned configurations + a
calibration card with expiry**, not rubric text; (6) hardened anchor construction (minimal
mutations, item cards, counterbalancing, hold-out-by-family, independent roots); (7) replaced the
**vacuous determinant/rank axis check** with **intervention-based controllability/cross-talk**;
(8) corrected cost to **~100–250 judgments**. Prior-art to borrow: **JudgeBench, RubricEval,
CheckList (MFT/INV/DIR), LLM-Rubric, DSPy/OPRO, many-facet Rasch / Messick validity** (kappa is
*not* central — agreement ≠ validity).

**Then a code-review pass (2026-06-18)** caught that v2 *overclaimed certification without the
data lifecycle + runtime plumbing*. Folded as three explicit **preconditions**: **P1**
`EVALUATOR_CONFIG` (certify the config that actually runs, not just `CRITERIA_BLOCK` — the runtime
hardcodes lenses/schema/model at `workflow-template.js:151`); **P2** structured
`SOURCE_PACKET/FACT_LEDGER` (so the truth-anchor "mechanical proof" is set-membership, not
prose-parsing of `CRITERIA_BASE:70`); **P3** durable, versioned anchor-bank artifact with a split
manifest (so "hidden held-out" isn't a same-run smoke test). Plus: **U12** got an *executable*
confidence rule (Wilson-LB thresholds, min n/family, successive-halving stop) and a budget
reconciliation; **U13** was re-keyed to the real vote shape (`lens`×`stakes`, gate-veto kept out
of taste weighting); **U14** was split into **U14a** (cheap controllability check, light deps,
lands now) and **U14b** (full qualifier, deferred behind `finalizeField` + U12), resolving the
dependency/order contradiction. Build order now leads with P1 → P2 → P3.

**Then a `/provision` validation pass (2026-06-20, against main after PR #2 merged)** re-grounded
the plan: confirmed P1/P2/P3 are all still unbuilt (the real entry point), refreshed drifted line
citations (`LENSES` :138→:151, `tally` :282→:305, `CRITERIA_BASE` :70→:71), folded the merged
`DQ_FAMILY` map into U19's config scope, confirmed `finalizeField` is still pending (U14b stays
blocked), and noted judging.md §8 still carries the old O≻F answer key (U11 adds the directional
anchors; U15 updates §8). Promoted the preconditions to first-class build units **U19/U20/U21** so
`/build` can sequence them. No design changes — the validation *confirmed* the plan's own
preconditions analysis.
