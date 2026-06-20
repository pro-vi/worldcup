# Live view (Tier-1) — `live-view.js`

Watch a running worldcup fill in **live** — group standings forming, eliminations landing, the
bracket advancing — in a self-contained, auto-refreshing HTML artifact, while the background
Workflow is still running. Dependency-free, no server, no sockets.

```
WORKFLOW (producer)                 the run's LIVE SPINE                 live-view.js (consumer)
  emit(ev): log()  +  beacon agent()  ──▶  subagents/workflows/<runId>/  ──tail/fold──▶  worldcup-live.html
  whose tight-schema result IS ev          journal.jsonl  (streams live)   (<meta refresh> auto-updates)
```

## Why beacons (the U18 finding, 2026-06-20)

A workflow is sandboxed (no fs, no sockets). Its `log()` output (the `WCEVENT …` Tier-0 lines) is
folded into `workflows/wf_<runId>.json` — but **that file is written once, at completion**, so `log()`
is **not** live. Empirically (4 sink probes + 3 prior-art viewers — `cc-viewer`,
`Claude-Code-Agent-Monitor`, `claude-code-log`), the **only** egress that persists *incrementally*
during a run is an **agent's result**, which streams into `subagents/workflows/<runId>/journal.jsonl`
the moment that agent completes.

So the producer emits each tournament event **twice**: a Tier-0 `log('WCEVENT …')` line (free, for
`/workflows` + the end run-file) **and** a cheap **beacon** `agent()` whose **tight-schema result IS
the event** (`{__wc:'EVENT', ev:…}`). The beacon streams into `journal.jsonl` live; `live-view.js`
tails it. (A *loose* schema makes the model stringify nested arrays; a tight one forces faithful
nesting — verified.) The beacon result is **discarded** by the orchestrator, so the bracket stays
deterministic; beacons fire-and-forget and any failure is swallowed — a beacon never breaks a run.
Toggle with `LIVE_BEACONS` in `workflow-template.js`; `effort:'low'` keeps the ~9 beacons/run cheap.

## The event schema (producer ↔ consumer contract)

`emit()` in `workflow-template.js` produces these five shapes (each as a tight beacon schema); the
consumer's `parseEvents()` reads `result.__wc==='EVENT'` payloads (non-beacon judge results skip),
then `fold()` reduces them. This is the **only** thing the two halves must agree on.

```
{ ev:'gate',     field, disqualified:[{ label, category }] }                         // after the fabrication gate
{ ev:'draw',     field, groups:[{ group, teams:[{ label, seed }] }] }                // group draw + seeds
{ ev:'groups',   standings:[{ group, table:[{ label, pts }], advanced:[label,…] }] } // group stage done
{ ev:'bracket',  rounds:[{ stakes, matches:[{ slot, a, b }] }] }                     // full KO tree (a/b null = TBD)
{ ev:'round',    stakes, matches:[{ winner, loser, margin }], eliminated:[label,…] } // one KO round result
{ ev:'champion', label, stakes }                                                     // final
```

The knockout view is a **full bracket tree**, not just completed columns: `bracket` paints every round +
slot up front (round-1 matchups known, the rest TBD); each `round` result fills its winners and
`bracketTree()` **advances** each winner into match ⌊i/2⌋ of the next round — so you watch a team move on,
and the round being judged shows as **"● playing"** (both names, no result yet).

Fold is monotonic: `draw` paints the skeleton + seeds → `gate` marks DQs → `groups` fills the group
tables + advancers → each `round` appends a knockout column and crosses out losers → `champion`
crowns. `stakes ∈ {R32,R16,QF,SF,FINAL}` orders the KO columns (32-field starts at R16, 48 at R32).
The fold is **idempotent** — re-reading the growing journal from the top yields the same state
(`round` de-dupes by stakes), so the watcher just re-reads on change; no tail-offset bookkeeping.
`parseEvents()` *also* reads a raw `WCEVENT {…}` line (the Tier-0 framing) — but only off the raw
line, never by un-escaping and scavenging nested JSON string values (the injection guard, below).

## Launching it on a real run (the sink is now resolved)

The `Workflow(...)` launch returns a **Transcript dir** — the live spine for that run lives directly
under it. So the launcher resolves the journal with no guesswork:

```bash
# Workflow(...) → "Transcript dir: …/subagents/workflows/wf_<runId>"
node references/live-view.js --events "<transcript-dir>/journal.jsonl" --out worldcup-live.html &
open worldcup-live.html   # browser auto-refreshes every 2s; the watcher self-exits on `champion`
```

```bash
# one snapshot (a final render, or for the probe):
node references/live-view.js --events <journal.jsonl> --out worldcup-live.html --once
```

- **Tolerant + injection-safe:** `parseEvents` trusts only the structured `result.__wc` (plus a raw
  Tier-0 `WCEVENT ` line) — it never un-escapes and scavenges nested string values, so a judged essay or
  a judge's verdict containing a literal `WCEVENT {…}` cannot forge a live event. Non-beacon results,
  narrator lines, and partial trailing writes skip; a harness format change degrades to a *stale* view,
  never a crash. (Stronger provenance — a per-run nonce so even a structured `__wc` can't be spoofed — is
  the documented next step; today `__wc:'EVENT'` is a structural marker that judge schemas never emit.)
- **Atomic writes:** temp-file + rename, so a watching browser never reads a half-written file.
- **Self-contained:** inline CSS mirroring `renderReportV2`'s palette; zero external requests; live
  snapshots carry `<meta http-equiv="refresh" content="2">`, the final render does not.
- **Transient:** `worldcup-live.html` is the *live* artifact; the post-run `worldcup-report.html`
  (`renderReportV2`) remains the headline deliverable.

## Tier-0 fallback (always available, free)

Even with no live view attached, the producer's `log()` snapshots (group standings table + per-round
eliminations) stream in `/workflows`. The live view is Tier-1: the same information as a refreshing
artifact. If the spine can't be resolved, fall back to Tier-0 — no run ever depends on the live view.

## Tested

`probes/live-view.mjs` (34 assertions, no harness dependency): tolerant parse of both framings
(spine-journal beacon results + legacy raw/wrapped `WCEVENT`), non-beacon/started-event skipping,
nested-beacon fidelity, fold idempotence, full render (groups/DQ/bracket/champion), skeleton-before-
results, gate-only state, empty input. End-to-end: a growing `journal.jsonl` of beacon results renders
empty→draw→groups→SF→champion live, and a real beacon-emitting probe's journal renders every section.
