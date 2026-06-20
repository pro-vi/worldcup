# Live view (Tier-1) — `live-view.js`

Watch a running worldcup fill in **live** — group standings forming, eliminations landing, the
bracket advancing — in a self-contained, auto-refreshing HTML artifact, while the background
Workflow is still running. Dependency-free, no server, no sockets (see PLAN_4 for the design).

```
WORKFLOW (producer, on main)        run's persisted jsonl            live-view.js (consumer)
  emit(ev) = log('WCEVENT {…}')  ───▶  …WCEVENT lines…  ───tail/fold──▶  worldcup-live.html
  (pure logging, no fs)               (the harness writes it)           (<meta refresh> auto-updates)
```

## The event schema (producer ↔ consumer contract)

`emit()` in `workflow-template.js` writes these five shapes; `live-view.js` folds over them. This is
the **only** thing the two halves must agree on.

```
{ ev:'gate',     field, disqualified:[{ label, category }] }                         // after the fabrication gate
{ ev:'draw',     field, groups:[{ group, teams:[{ label, seed }] }] }                // bracket skeleton (deterministic)
{ ev:'groups',   standings:[{ group, table:[{ label, pts }], advanced:[label,…] }] } // group stage done
{ ev:'round',    stakes, matches:[{ winner, loser, margin }], eliminated:[label,…] } // one KO round
{ ev:'champion', label, stakes }                                                     // final
```

Fold is monotonic: `draw` paints the skeleton + seeds → `gate` marks DQs → `groups` fills the group
tables + advancers → each `round` appends a knockout column and crosses out losers → `champion`
crowns. `stakes ∈ {R32,R16,QF,SF,FINAL}` orders the KO columns (32-field starts at R16, 48 at R32).
The fold is **idempotent** — re-reading the growing file from the top yields the same state (`round`
de-dupes by stakes), so the watcher just re-reads on change; no tail-offset bookkeeping.

## Usage

```bash
# one snapshot (used by the probe and for a final render):
node references/live-view.js --events <path-to-run-jsonl> --out worldcup-live.html --once

# watch a live run (re-renders on change; browser auto-refreshes every 2s; exits when champion crowned):
node references/live-view.js --events <path-to-run-jsonl> --out worldcup-live.html
```

- **Tolerant by design:** the parser greps `WCEVENT {…}` out of any line and ignores everything
  else (log/jsonl envelope, narrator lines, a partial trailing write). A harness format change
  degrades to a *stale* view, never a crash.
- **Atomic writes:** temp-file + rename, so a watching browser never reads a half-written file.
- **Self-contained:** inline CSS mirroring `renderReportV2`'s palette; zero external requests; live
  snapshots carry `<meta http-equiv="refresh" content="2">`, the final render does not.
- **Transient:** `worldcup-live.html` is the *live* artifact; the post-run `worldcup-report.html`
  (`renderReportV2`) remains the headline deliverable.

## Tier-0 fallback (always available, free)

Even with no live view attached, the producer's `log()` snapshots (group standings table + per-round
eliminations) are visible in `/workflows`. The live view is Tier-1: the same information as a
refreshing artifact. If the event sink can't be resolved, fall back to Tier-0 — no run ever depends
on the live view.

## Launching it on a real run — deferred to PLAN_4 U18

Wiring `live-view.js` into a live run (resolving *where* the harness persists a workflow's `log()`
output, then launching the watcher as a background process) is **PLAN_4 U18**. That carries the one
load-bearing risk (the sink path is harness-internal). `live-view.js` itself (this unit, U17) stands
alone and is fully tested against a captured fixture (`probes/live-view-fixture.jsonl`,
`probes/live-view.mjs`) with no harness dependency.
