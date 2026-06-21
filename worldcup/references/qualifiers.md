# Qualifiers — certifying the evaluator (the durable anchor bank)

预选赛 / Qualifiers certify the **judge** before the tournament runs (PLAN_3). Certification needs a
ground truth that isn't another LLM call — and it needs that ground truth to be **held out** from the
session being certified, or "hidden held-out" is just a same-run smoke test. This file documents the
**durable anchor bank** (U21/P3), the persistent artifact that makes held-out real. The anchors
themselves (U11) and the certification protocol (U12) build on top of it.

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
   calibration card so the certified config provably names the bank it was scored on.

`anchorbank.js` provides: `packetId`, `buildBank`, `write`, `read`, **`readForPacket`**, `verify`,
`isStaleFor`, `partitionOf`, `itemsInPartition`, `heldOutFamilies`, `authoredFamilies`,
`certificationFamilies`, `unadjudicated`, `partitionCounts`, **`assertCertifiable`**. CLI: `node
anchorbank.js verify|inspect <bank.json>`.

Two identity notes: (1) the content checksum is **order-independent** — the anchor set is unordered, so
reordering item cards does not mint a new version. (2) `created`/`provenance` are outside the
content-address, so a rebuild of the same anchors **overwrites** them last-writer-wins (content is
identical; provenance is advisory audit metadata, not integrity-critical — if a unit needs durable
build history, write a sidecar rather than relying on the bank file).

## Commit policy

Banks are **committed** — they are reviewed, versioned ground truth, and content-addressed so diffs are
meaningful. Only the atomic-write temp files (`anchors/**/*.tmp`) are gitignored. If a future unit
generates large raw mutant pools, gitignore those under a `_scratch/` subdir rather than the bank.

## Tested

`probes/p3-anchorbank.mjs` (52 assertions): reproducibility, packet/item change bumps version,
held-out-by-family disjointness, partition stability, and tamper-evidence (edited items / forged
version / forged checksum / unknown schema all throw on read).

## Scope (U21 vs U11/U12)

U21 establishes the **artifact + lifecycle**: format, content-addressed versioning, deterministic
family partition, checksums, atomic persistence, integrity verification. The **item cards** (MFT/INV/DIR
truth + taste anchors) are U11; the **certification protocol** that consumes the held-out partition is
U12. `item.kind` / `item.human_adjudicated` are carried through here so U12 can refuse to certify on
un-adjudicated taste gold (`unadjudicated(bank)`).
