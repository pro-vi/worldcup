# How worldcup's token cost came down — and what it cost us

Three instrumented 32-team dogfood runs on the same field family (README
pitch-block variants, all agents on Sonnet, `INCLUDE_BASE` fielding the
original) bound this document. Every number below is measured from run
transcripts by `scripts/run-cost-report.js`, not estimated. Dollar figures use
July 2026 Sonnet list prices per MTok: $3 input, $3.75 cache write, $0.30 cache
read, $15 output.

| Run | Template state | Agents | Requests | Logical input | Output | Est. cost |
|-----|----------------|-------:|---------:|--------------:|-------:|----------:|
| 1 (`wf_473cb3a8`) | pre-refactor | 394 | 865 | 26.33M | 3.09M | $85.12 |
| 2 (`wf_fbf2b7a4`) | refactor arc | 365 | 521 | 15.44M | 2.89M | $72.19 |
| 3 (`wf_9854236a`) | + hermetic judges | 363 | 419 | 5.81M | 2.19M | $45.47 |

End to end: **−78% logical input, −29% output, −52% requests, −47% dollars per
run** — with the fabrication gate, panel structure, and trust machinery
unchanged throughout. (Logical input = input + cache write + cache read; the
dollar column is the honest summary because cache reads cost a tenth of fresh
input and output dominates the bill.)

## Step 0 — measure before optimizing

The first change was not an optimization: it was `scripts/run-cost-report.js`,
which joins workflow agent labels to transcript token usage per role. Every
subsequent decision cites its output. Two proposed optimizations died at this
step because measurement refuted them (see "Refuted and refused" below) —
that is the reporter paying for itself.

## Step 1 — the refactor arc (Run 1 → Run 2: −41% input, −40% requests)

What changed, and the trade taken with each:

- **Generation discipline.** Run 1's generators averaged 9.16 requests each,
  mostly `wc`-style length-check loops against a ±30% length pin. Retiring the
  pin (length is free, judged on earnedness) and telling generators not to
  tool-measure length cut generation to 2.71 requests/agent. The instruction is
  now baked into every artifact-producing prompt in the template
  (`GENERATION_DISCIPLINE`). *Trade:* freeing length surfaced a real failure —
  a champion optimized into an unstated container intent (a ~450-word
  mini-README). The cost of free length is that criteria must now state the
  container's intent explicitly; that doctrine lives in `worldcup/SKILL.md`
  and `worldcup/references/judging.md` §10.
- **Juror reason cap.** One decisive sentence per vote instead of a summary.
  Cut group-lens output ~9.5% per agent. *Trade:* terser match reasons in the
  report. Deciding factors survive; narrative color doesn't.
- **Live beacons off for unattended runs.** Saves ~26 low-effort agent calls.
  *Trade:* no Tier-1 live bracket while the run happens; `/workflows` (Tier-0)
  still works. Beacons stay on by default and are a one-line knob.
- **Incumbent retirement.** The original now competes as one of the N
  (`INCLUDE_BASE`) instead of being pasted into every juror prompt as a
  privileged bar. Removed the reference-challenge machinery and its calls, and
  removed an anchor bias at the same time. *Trade:* none found — this was a
  quality improvement that happened to save tokens.

## Step 2 — hermetic judges (Run 2 → Run 3: −62% input, −24% output, −37% dollars)

PR #17 shipped an optional custom agent type (`worldcup-judge`) whose
documented `disallowedTools` denylist strips every ordinary tool from judge
surfaces. It was shipped for **integrity**, with its cost verdict honestly
marked inconclusive; the completed Run-3 dogfood then measured the cost effect,
and it was much larger than anyone claimed:

- **Every judge role ran at exactly 1.0 requests per invocation** (Run 2:
  1.04–1.41). All 103 judge-surface tool detours are gone — mechanically, not
  by instruction. Zero ordinary tool calls across all 332 typed transcripts
  (the 331 scoring judge surfaces plus the pre-generation sentinel).
- **The uncached tail died.** Every default-type agent's first request carries
  a large, byte-constant uncached input tail — the harness-injected content,
  dominated by tool definitions (9,222 tokens in the Run-1/2 sessions; 10,513
  in the Run-3 session at the same Claude Code version, because the tail grows
  with the session's connected MCP registry). The paired in-run measurement is
  decisive: all 31 default-type generators carried exactly 10,513 uncached
  tokens; all 332 hermetic-typed agents carried exactly 2. For ~330 judge calls
  that's ~3.5M full-price tokens per run that the hermetic type simply does not
  pay — and cannot be regressed by someone connecting more MCP servers.
- **Output fell 24%** because tool-loop turns are output too.

*Trades taken:*

- Judges cannot fact-check outside their prompt. By doctrine this is a feature,
  not a loss: the fact ledger is the evidence boundary, and Run-2 judges
  reading `README.md` while the README block competed as the fielded original
  was a live blinding leak. The gate's job moved fully onto the ledger, where
  it always belonged. Evidence quality held: same-flavor FABRICATION
  disqualification in all three runs, gate canary clean, trust verdict robust.
- Opt-in friction: the agent definition must be installed into a discovered
  `.claude/agents/` location before the session starts; the pre-generation
  sentinel fails closed (one extra agent call per opted-in run).
- The denylist is drift-prone by construction — a host that adds new tools
  widens the judge surface until the next probe. ADR 0004's revisit triggers
  mandate re-probing on host/model/registry change.
- Scope: quality evidence is indicator-level from one completed run on a prose
  field, not a judging-quality benchmark (none exists yet — ADR 0001).

## What we refused to trade at any price

- **Juror count and lens diversity.** No batching multiple lenses into one
  call, no single generalist judge, no cheaper model for late rounds.
  Independence and adversarial diversity are the product.
- **Full entries in every juror prompt.** No judging summaries. The judge reads
  what competes.
- **The three-screener fabrication gate.** `SCREENERS=1` exists as a documented
  budget knob, but it forfeits the same-family majority safeguard and is
  labeled accordingly.
- **Deterministic bracket logic and byte-identical reports.**

## Refuted and refused (so nobody re-litigates them)

- **Cache-first prompt reordering: refuted by measurement.** Judge cache-read
  modes are flat across same-lens calls — the harness caches system/tool
  prefixes only, so moving the byte-identical criteria block to the front of
  user prompts earns nothing. An 8,047-char shared prefix earned zero partial
  credit across 169 warm calls (of 192 judge invocations).
- **Margin-triggered adaptive group panels: refuted by replay.** Historical
  replay over Runs 1–2 (`scripts/replay-group-panels.js`,
  `evidence/group-panel-replay/`) showed jurors' self-reported margins are an
  unreliable escalation trigger (12% disagreement with the panel even at
  "clear"), and every margin-triggered rotated-primary policy still changed
  advancement — 1–6 of 16 advancement positions across the six historical
  rotations.
- **Batching, summary-judging, judge downgrades: refused on doctrine** (see
  above — they save tokens by removing the independence or evidence the engine
  exists to protect).

## Where further savings can come from without sacrificing the judge

In rough order of readiness:

1. **Majority-locked sequential group panels** (proven safe, not yet built).
   Seat two jurors; call the third only when the first two disagree — the
   skipped vote is mathematically irrelevant when they agree. Replay over Runs
   1–2 measured 28–34 of 135 group calls saved per run (~21–25%) with **zero**
   outcome or qualifier changes across all six seat configurations. Costs:
   group-stage wall-clock (two sequential waves instead of one parallel panel)
   and visibly different margins/reasons on locked matches. The deferred-PR
   contract is in `evidence/group-panel-replay/` and ADR-adjacent doctrine.
2. **Hermetic generation** (measurable now, needs quality evidence first).
   Generation is the last multi-request role (2.8 requests/agent in Run 3,
   default-type tail included). The same probe pattern applies, but generators
   may legitimately use reconnaissance in code/critique domains — the free
   pre-test is comparing placement vs request count across existing
   transcripts before denying anything.
3. **Host-level cache economics** (external levers, recorded not actionable):
   cross-agent prompt-prefix caching would let ~330 judges share the
   byte-identical criteria block (today each pays for it fresh); and one-shot
   agents currently write caches nobody reads (Run 3: 2.87M cache-write vs
   2.60M read — at $3.75/M vs $3.00/M, pure overhead for single-request
   agents).
4. **Conditional screener-output compression** (deferred, canary-gated).
   Screener verdicts are verbose; compressing the clean-pass case is plausible
   but touches the gate, so it requires recorded canary parity first.
5. **Output is now the bill.** After Run 3, output tokens are ~72% of run
   dollars. The reason cap took the easy slice; anything further trades
   report legibility directly and should be measured against what readers
   actually use.

## Reproducing these numbers

```bash
node scripts/run-cost-report.js <transcript-dir>   # per-role table + cache modes
node scripts/replay-group-panels.js --help          # group-panel counterfactuals
```

Records: `tests/fixtures/judge-probe/` (probe + dogfood evidence),
`evidence/group-panel-replay/records/` (replay evidence). Decision history:
ADR 0004 (judge capability boundary), the plan docs are local-only by
convention.
