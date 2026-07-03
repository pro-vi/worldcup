# Live view (Tier-1) — `live-view.js`

Watch a running worldcup fill in **live** — group standings forming, eliminations landing, the
bracket advancing — while the background Workflow is still running. Dependency-free (Node stdlib only).

Two output modes (mutually exclusive — pick one):

- **File mode (default):** writes a self-contained, auto-refreshing `worldcup-live.html` (`<meta refresh>`).
  No server, no sockets — works anywhere, but every refresh is a full reload, so it white-flashes.
  `--once` writes a single static snapshot and exits. Flags: `--out <file>`, `--theme`, `--switcher`, `--once`.
- **Serve mode (`--serve [--port N]`):** hosts the view on `http://127.0.0.1` (Node stdlib HTTP server, loopback
  only) and updates the bracket **in place** (the page polls `/frame` and swaps it in) — no reload, no flash,
  scroll preserved. Default port is ephemeral; `--serve` and `--once` are mutually exclusive (a usage error).
  The HTTP server is unauthenticated read-only loopback (the `--nonce` authenticates the event journal, not the
  server) — it exposes the rendered tournament to local users/processes; don't `--serve` a private journal.

```
WORKFLOW (producer)                 the run's LIVE SPINE                 live-view.js (consumer)
  emit(ev): log()  +  beacon agent()  ──▶  subagents/workflows/<runId>/  ──tail/fold──▶  worldcup-live.html
  whose tight-schema result IS ev          journal.jsonl  (streams live)   (<meta refresh> auto-updates)
```

## Why beacons (how a sandboxed workflow can stream at all)

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
Toggle with `LIVE_BEACONS` in `workflow-template.js`. Beacons are `effort:'low'` but there are a fair
number — **~26 per 32-field run, ~43 per 48-field** (gate + draw + 3 group snapshots + bracket + one per
knockout *game* + one per knockout *round* + champion). They share the run's concurrency cap, agent-count
cap, and token budget, and `await Promise.allSettled(beacons)` before return waits on any stragglers
(bounded by the harness's per-agent timeout). Determinism is unaffected (results discarded); capacity and
end-of-run timing are not — drop the per-`match` beacons (round-level still works) if a run is tight.

## The event schema (producer ↔ consumer contract)

`emit()` in `workflow-template.js` produces these seven shapes (each as a tight beacon schema); the
consumer's `parseEvents()` reads `result.__wc==='EVENT'` payloads (non-beacon judge results skip),
then `fold()` reduces them. This is the **only** thing the two halves must agree on.

```
{ ev:'gate',     field, disqualified:[{ label, category }] }                         // after the fabrication gate
{ ev:'draw',     field, groups:[{ group, teams:[{ label, seed }] }] }                // group draw + seeds
{ ev:'groups',   standings:[{ group, table:[{ label, pts, w, d, l }], advanced:[label,…] }] } // group table — emitted partial→final (it builds up)
{ ev:'bracket',  rounds:[{ stakes, matches:[{ slot, a, b }] }] }                     // full KO tree (a/b null = TBD)
{ ev:'match',    stakes, slot, winner, loser, margin, reason }                       // ONE knockout game (fills a single slot)
{ ev:'round',    stakes, matches:[{ winner, loser, margin, reason }], eliminated:[label,…] } // KO round summary (backfills the slots)
{ ev:'champion', label, stakes }                                                     // final
```

On top of the shapes above, every beacon carries a **required** monotonic `seq` (emit order; the
consumer sorts by it before folding) and a per-run `nonce` (provenance; events without the launcher's
nonce are dropped when `--nonce` is set) — a producer that omits them yields a blank view.

`margin` is display-only vocabulary, threaded through unchanged: `decisive` (unanimous panel),
`clear` (comfortable majority), `narrow` (one-vote edge), `pens` (the regulation panel split even —
an extra juror and then the rating shootout decided it), plus `draw` in group tables. `reason` is
the deciding juror's short verdict; the consumer shows it as a hover tooltip on decided match
cards (and tolerates producers that omit it).

Granularity is **stepwise**, gated only by parallel play: `groups` is emitted at ~⅓ and ⅔ (points and W-D-L accumulate as matches resolve in waves) before the final table; each knockout game emits a `match` the moment it resolves, so the bracket fills **slot-by-slot** while siblings stay `● playing` (a trailing `round` event backfills the full set). In 48-field runs, the final `groups.advanced` also includes each qualified best third-place team as the third entry for that group.

The knockout view is a **full bracket tree**, not just completed columns: `bracket` paints every round +
slot up front (round-1 matchups known, the rest TBD); each `round` result fills its winners and
`bracketTree()` **advances** each winner into match ⌊i/2⌋ of the next round — so you watch a team move on,
and the round being judged shows as **"● playing"** (both names, no result yet).

**Arrival order ≠ emit order:** beacons are fire-and-forget agents, so they land in *completion* order.
Every event carries a monotonic `seq`; the consumer **sorts by `seq` before folding**, so last-write-wins
is correct (a late `draw`/partial-`groups`/`champion` can't clobber newer state). Logically: `gate` marks DQs
(it fires in the Seed phase, before the draw) → `draw` paints the skeleton + seeds → `groups` fills
the group tables + advancers → `bracket` paints the knockout tree → each `match`/`round` fills slots
and crosses out losers → `champion` crowns. `stakes ∈ {R32,R16,QF,SF,FINAL}` orders the KO columns (32-field starts at R16, 48 at R32).
The fold is **idempotent** — re-reading the growing journal from the top yields the same state
(`round` de-dupes by stakes), so the watcher just re-reads on change; no tail-offset bookkeeping.
`parseEvents()` *also* reads a raw `WCEVENT {…}` line (the Tier-0 framing) — but only off the raw
line, never by un-escaping and scavenging nested JSON string values (the injection guard, below).

## Launching it on a real run (the sink is now resolved)

The `Workflow(...)` launch returns a **Transcript dir** — the live spine for that run lives directly
under it. So the launcher resolves the journal with no guesswork. Pass a **per-run nonce** both into the
Workflow (`args.liveNonce`) and to the watcher (`--nonce`) so only this run's beacons are accepted:

```bash
NONCE=$(openssl rand -hex 8)
# Workflow({ script: …, args: { liveNonce: NONCE } }) → "Transcript dir: …/subagents/workflows/wf_<runId>"
node references/live-view.js --events "<transcript-dir>/journal.jsonl" --out worldcup-live.html --nonce "$NONCE" &
# add --theme <name> to pick the look (default arena). themes: arena, concrete, 2026.
# add --switcher to emit all three + a sticky switcher bar  (run with no --events to print the list)
open worldcup-live.html   # auto-refreshes every 2s; the watcher self-exits when the bracket completes
```

In **given** (bring-your-own) mode `args` already carries the entrant array, so wrap both rather than
replacing it: `args: { items: [...entrants], liveNonce: NONCE }`. (`SKILL.md` step 4 wires this as the
opt-in Tier-1 path.)

```bash
# one snapshot (a final render, or for the probe):
node references/live-view.js --events <journal.jsonl> --out worldcup-live.html --once
```

- **Tolerant + injection-safe:** `parseEvents` trusts only the structured `result.__wc` (plus a raw
  Tier-0 `WCEVENT ` line) — it never un-escapes and scavenges nested string values, so a judged essay or
  a judge's verdict containing a literal `WCEVENT {…}` cannot forge a live event. Non-beacon results,
  narrator lines, and partial trailing writes skip; a harness format change degrades to a *stale* view,
  never a crash.
- **Provenance (per-run nonce):** when the launcher passes `--nonce`, the consumer accepts a beacon ONLY
  if its `result.nonce` matches, **and the legacy raw-`WCEVENT` path is disabled** (raw lines can't carry
  the nonce) — the authenticated channel is spine-only; raw parsing remains for unauthenticated replay /
  Tier-0. The producer reads the same token from `args.liveNonce` (coerced to a string) and stamps every
  event; judges never see it, so even an agent emitting a structured `{__wc:'EVENT'}` can't forge a beacon
  without the (unguessable) nonce. Diagnosable: with no `--nonce` the watcher warns it's unauthenticated;
  if beacons are present but none match, it warns once (a typo'd/mismatched nonce, not "not started").
- **Atomic writes:** temp-file + rename, so a watching browser never reads a half-written file.
- **Self-contained:** inline CSS, system fonts only, zero external requests; live snapshots carry
  `<meta http-equiv="refresh" content="2">`, the final render does not.
- **Themeable (3 curated looks):** `--theme` (or env `WORLDCUP_LIVE_THEME`) selects the visual language;
  default `arena`. The shared bracket draws connectors as a computed **SVG overlay** (per-gap clip, path
  elbows, junction dots — strokes can't protrude onto cards, junctions never gap) and animates only a
  lamp/rail/sheen — never a whole card — so each 2s reload reads as the next broadcast frame, not a restart.
  - `arena` *(default)* — console sports-game UI: steel base, ONE mint system colour (selected/live/active
    route), gold reserved for EARNED outcomes; a progression-rail HUD, a SPECTATOR/AUTO-SIM strip, honest
    group+rank seed tags, and an octagon champion item.
  - `concrete` — brutalist concrete-and-ink match poster: heavy black borders, hard offset shadows, monospace,
    an oversized Arial-Black headline, ONE safety-orange accent tracing the winner's road to a champion box.
  - `2026` — a 2026-inspired poster-scoreboard look: a giant spectrum "26" (pink→orange→yellow→teal→indigo)
    behind a clean WORLD CUP header, on the parameterised scoreboard skeleton with magenta/cyan structure.
- **Theme switcher (`--switcher`):** renders every theme to `<out>-<theme>.html` and makes `--out` a landing
  page; each file carries a sticky top bar (pure HTML links, no JS) linking the others, so you can switch
  looks mid-feed without stopping the watcher.
- **Transient:** `worldcup-live.html` is the *live* artifact; the post-run `worldcup-report.html`
  (`renderReportV2`) remains the headline deliverable.

## Tier-0 fallback (always available, free)

Even with no live view attached, the producer's `log()` snapshots (group standings table + per-round
eliminations) stream in `/workflows`. The live view is Tier-1: the same information as a refreshing
artifact. If the spine can't be resolved, fall back to Tier-0 — no run ever depends on the live view.

## Guarantees

Live-view tolerantly parses both framings (spine-journal beacon results + legacy raw/wrapped `WCEVENT`),
skips non-beacon/started events, preserves nested-beacon fidelity, is fold-idempotent, renders fully
(groups/DQ/bracket/champion), and handles skeleton-before-results, gate-only state, and empty input.
End-to-end: a growing `journal.jsonl` of beacon results renders empty→draw→groups→SF→champion live.
