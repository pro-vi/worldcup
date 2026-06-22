# Qualifiers — run-scoped assurance for the decision system

预选赛 / Qualifiers **qualify the RUN, not certify the judge** (PLAN_3 — see
`docs/plans/qualifiers-run-assurance.md`, which supersedes the "certification" framing). A GPT-Pro
ontology consult was decisive: the durable anchor bank is a **falsifier, not a verifier** — passing it
proves only the *absence of the defects you thought to test*, never a portable property called "judge
quality." So the strongest honest claim is *"config E satisfied requirements R on corpus B under
operating conditions C for THIS run,"* and the headline output is a 4-state **run status** inside a
stated **operating envelope**, not a `certified E*`. There is **no Wilson/Bernoulli/CI math** — a
curated obligation set is not a random sample, so it is reported as **exact pass/fail**.

The ground truth still must not be another LLM call, and it must be **held out** from the session under
test, or "hidden held-out" is just a same-run smoke test. This file documents the **durable anchor bank**
(U21/P3) — now a **regression/conformance CORPUS**, not a statistical sample — and the opt-in **QUALIFY
lifecycle** (U11a–U24) that consumes it. `QUALIFY=false` by default ⇒ the tournament path never calls any
of it and the evaluator is byte-identical (probes/p1 73/73 is the guard).

## Why the bank must be durable

If the bank is regenerated each run by the session under certification, the "certification partition"
was authored by the thing it's supposed to test. So the bank is built **once**, persisted to disk,
and **reused across runs**: the certifying run reads a certification partition it did not author.
`anchorbank.js` (PLAN_3 U21) is the read/write/version/verify layer for that artifact.

## The artifact

```
anchors/<packet_id>/bank-v<version>.json
```

```jsonc
{
  "schema": "worldcup/anchor-bank@1",
  "packet_id": "<16-hex content fingerprint of the U20 SOURCE_PACKET this bank certifies>",
  "version":   "<16-hex fingerprint of (packet_id, items checksum)>",   // stamped into the U12 calibration card as anchor_bank_version
  "created":   "<ISO timestamp, caller-supplied>",                    // advisory build metadata — NOT in the content-address
  "provenance": { "constructor": "...", "verifier_models": ["..."], "human": "..." },  // advisory — audit trail, not integrity-critical
  "manifest":  { "<family>": "dev" | "selection" | "certification" | "canary", ... },  // DERIVED from (packet_id, items); verify() recomputes it
  "checksum":  "<16-hex fingerprint of items>",
  "items":     [ /* item cards — U11's shape; anchorbank reads only .family / .kind / .human_adjudicated */ ]
}
```

- **Content-addressed.** `packet_id = fingerprint(SOURCE_PACKET)`, `version = fingerprint(packet_id,
  checksum)`. So **changing the packet (or the items) bumps the version** automatically, and a bank
  built for one ledger can never silently certify against another — `isStaleFor(bank, packet)` is true
  the moment the active packet differs.
- **Reproducible.** Same packet + same items ⇒ same `version`, `checksum`, and `manifest`, on any
  machine, independent of the `created` timestamp.
- **Tamper-evident.** `read()`/`verify()` recompute the item checksum, the version, **and the manifest
  from `(packet_id, items)`**, throwing on any mismatch — so a hand-edited bank can't silently move a
  certification (held-out) family into an authorable partition. `created`/`provenance` are *advisory*
  build metadata, deliberately outside the content-address (so the same anchors are reproducible
  regardless of when/who built them). `packet_id`/`version` are validated as 16-hex (also path-safety).
  Writes are atomic (temp + rename, with the temp cleaned up on a failed write).
- **Consumer contract.** A bank stores no copy of the packet, so it can't self-check its `packet_id`.
  The consumer MUST call `isStaleFor(bank, activePacket)` against the *real* live `SOURCE_PACKET` before
  using a bank — that, plus the content-address, is what prevents certifying against the wrong ledger.

## Held out BY FAMILY (not a random split)

Each **family** (a mutation family / source doc / genre / generator family — never a single item) lands
in exactly one of four partitions, assigned deterministically from `(packet_id, family)`:

| Partition | Share | Role |
|---|---|---|
| `dev` | ~50% | construction feedback allowed |
| `selection` | ~20% | hidden tuning between candidate configs |
| `certification` | ~20% | **held out** — scored once, by family, never authored in the certifying run |
| `canary` | ~10% | **held out** — drift detection across runs |

Because assignment is keyed by `(packet_id, family)` and not by the item set, a family's partition is
**stable across runs** and does not drift when items are added. `heldOutFamilies(bank)` (certification
∪ canary) and `authoredFamilies(bank)` (dev ∪ selection) are **disjoint by construction** — that
disjointness is what U12 relies on to score a partition it didn't build.

## How it's consumed (the sandbox boundary)

The worldcup Workflow is **sandboxed — no filesystem** (the same constraint behind the live view). So
`anchorbank.js` runs **orchestrator-side**, exactly like `live-view.js`:

1. **Build once** (U11): construct item cards → `buildBank({ packet, items, provenance, created })` →
   `write(bank, baseDir)`. Commit it (reviewed taste-gold is versioned data).
2. **Each run** (U12): the orchestrator loads the bank with **`readForPacket(file, livePacket)`** — a
   composed read that does `read` → `isStaleFor` → throw-on-stale, so the packet-binding check can't be
   skipped by forgetting a call — then `assertCertifiable(bank)` (the certification partition must be
   non-empty), and passes the **held-out partition** into the Workflow via `args` (the Workflow cannot
   read disk). The Workflow runs judges against those anchors; `anchor_bank_version` goes into the
   **assurance card** so the qualified config provably names the bank it was scored on.

`anchorbank.js` provides: `packetId`, `buildBank`, `write`, `read`, **`readForPacket`**, `verify`,
`isStaleFor`, `partitionOf`, `itemsInPartition`, `heldOutFamilies`, `authoredFamilies`,
`certificationFamilies`, `unadjudicated`, `partitionCounts`, **`assertCertifiable`**. CLI: `node
anchorbank.js verify|inspect <bank.json>`.

Two identity notes: (1) the content checksum is **order-independent** — the anchor set is unordered, so
reordering item cards does not mint a new version. (2) `created`/`provenance` are outside the
content-address, so a rebuild of the same anchors **overwrites** them last-writer-wins (content is
identical; provenance is advisory audit metadata, not integrity-critical — if a unit needs durable
build history, write a sidecar rather than relying on the bank file).

## The QUALIFY lifecycle (U11a → U24)

Two sandbox functions per stage live in `workflow-template.js` behind `QUALIFY` (default off ⇒ never
called); the fs/Date/crypto half lives orchestrator-side in `qualify.js` (composing `anchorbank.js`).
Only JSON crosses the sandbox seam: corpus items go **in** via `args.anchorBank`; the assurance card
comes **out** via the Workflow return, persisted by `qualify.writeCard`.

| Stage | Sandbox (`workflow-template.js`) | Orchestrator (`qualify.js`) |
|---|---|---|
| **Build corpus** (U11a/U11b) | `buildAnchors({incumbent,packet})` → MFT/INV/DIR mutation-spec cards (deterministic, **zero `agent()`**) | `persistAnchors(...)` → `anchorbank.buildBank`/`write` (the durable, committed bank) |
| **Load held-out** (U11b) | — | `loadCorpusForRun(file, livePacket)` → `readForPacket`+`assertCertifiable`+`itemsInPartition`; `anchorBankArg(loaded)` → the `args.anchorBank` JSON |
| **Conformance** (U12) | `qualifyConformance(corpus, {ev})` → EXACT pass/fail gate floor; any mandatory failure ⇒ `BLOCKED`. `adoptEvaluator(E)` validates **then** reassigns the module `EVALUATOR` | — |
| **Fresh probes** (U23) | `buildProbes(...)` (live regime, never persisted — a probe carries no `family`) + `judgeProbes(...)` → DRIFT report (`scope:'drift'`, `adversarial_audit:'not_run'`) | — |
| **Run status + card** (U24) | `runPerturbations(a,b,…)` (champion-only) + `qualifyRun({conformance,probes,perturbations,…})` → the 4-state status + card payload | `writeCard(card, baseDir)` → `anchors/<pid>/assurance-v<run_id>.json` (atomic) |

**The authority contract (truth, not "true").** Truth-anchor `authority_status ∈ {ASSERTED_TRUE,
AUTHORIZED, UNKNOWN, FORBIDDEN, EXTERNALLY_VERIFIED}`. It is **derived from** the mechanical
`ledgerLookup`, never asserted by a caller — `ASSERTED_TRUE`/`AUTHORIZED`/`FORBIDDEN` carry a real
`proof:{ledger_lookup}`; `UNKNOWN`/`EXTERNALLY_VERIFIED` are **declarative** (`proof:null`). An absent
detail is `UNKNOWN`, **not "false"** — the gate DQs only on *unauthorized load-bearing lived fact*, never
on "untrue." Taste anchors keep **disaggregated `editor_votes[]`** (blinded LLM jurors); the **author
holds veto** out-of-band (sets `human_adjudicated`/`author_veto` when reviewing the committed bank).

**The run status (the headline).** `BLOCKED` (a mandatory truth/control obligation failed — dominates) ·
`QUALIFIED_FOR_THIS_RUN` (conformance + fresh probes passed within the envelope) · `UNSTABLE` (the
**champion** flips **across a margin band** under a **judge-side** perturbation — mirrored order /
paraphrase / alt-model-if-configured; **bracket-reseed is NOT** a signal, it is envelope-only) ·
`HUMAN_REVIEW_REQUIRED` (insufficient evidence or material author/editor disagreement). The card's
`adversarial_audit:'not_run'` is **first-class**: `QUALIFIED_FOR_THIS_RUN` means "passed known-defect
conformance + fresh drift probes," **NOT** "robust against gaming" (the adaptive-exploitation audit is
U12b, deferred). `top_set` is inert forward-compat.

## Commit policy

Banks are **committed** — they are reviewed, versioned ground truth, and content-addressed so diffs are
meaningful. Only the atomic-write temp files (`anchors/**/*.tmp`) are gitignored. If a future unit
generates large raw mutant pools, gitignore those under a `_scratch/` subdir rather than the bank.
Assurance cards (`anchors/<pid>/assurance-v<run_id>.json`) are run outputs — keep or gitignore per taste;
unlike banks they are not content-addressed.

## Tested

- `probes/p3-anchorbank.mjs` (52): bank reproducibility, packet/item change bumps version, held-out-by-
  family disjointness, partition stability, tamper-evidence (edited items / forged version / checksum /
  manifest / unknown schema all throw on read).
- `probes/p4-anchors.mjs` (53): `buildAnchors` is deterministic + zero `agent()`; the authority/proof
  consistency invariant with **executed anti-laundering counterexamples**; DIR coverage + the 5 controls;
  disaggregated taste votes; no answer-key leak; cards compose a verifiable held-out bank.
- `probes/p5-qualify.mjs` (30): `persistAnchors`/`loadCorpusForRun`/`anchorBankArg`/`writeCard` round-trip
  on real fs; executed counterexamples (stale packet, path-traversal `run_id`, tampered bank).
- `probes/p6-conformance.mjs` (27): exact pass/fail; blind gate ⇒ `BLOCKED`, over-eager ⇒ `BLOCKED`; **no
  Wilson/recall/CI** anywhere; ABSTAIN; DIR/INV deferred not silently passed; `adoptEvaluator` validates-then-reassigns.
- `probes/p7-ecological.mjs` (20): probe-type coverage; run-scoped + **anchorbank refuses to ingest a
  probe**; drift surfaced under a drifty judge; A/B reversal swaps arguments (catches position bias).
- `probes/p8-assurance.mjs` (35): the 4-state machine (BLOCKED dominates; across-band-only UNSTABLE;
  reseed envelope-only; alt-model `not_run`; HUMAN_REVIEW); no certified/accuracy/recall language; card writes back.
- `probes/p1-eval-config.mjs` (73): the byte-identity guard — `QUALIFY` off ⇒ the default evaluator and
  every judge surface are unchanged.

## Scope (shipped vs deferred)

U21 established the **artifact + lifecycle** (format, content-addressed versioning, deterministic family
partition, atomic persistence, integrity verification). The run-assurance plan then shipped: **U11a**
`buildAnchors` (the conformance corpus), **U11b** `qualify.js` (orchestrator bridge + card writer),
**U12** `qualifyConformance` (exact pass/fail gate floor), **U23** `buildProbes`/`judgeProbes` (fresh
drift probes), **U24** `qualifyRun` (run status + assurance card). `item.kind`/`item.human_adjudicated`
flow through `anchorbank` so taste gold can't be scored un-adjudicated (`unadjudicated(bank)`).
**Deferred:** the U12b adaptive-exploitation **adversarial audit** (the real final), robust top-SET
output, and enriching `ledgerLookup`'s return enum beyond binary — see the plan's Scope Boundaries.
