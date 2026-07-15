# 2026-07-14 Reddit-launch dogfood — evidence

> **SUPERSEDED by `../2026-07-15-reddit-launch-v2/`.** This v1 run's fact ledger
> omitted worldcup's true origin story, so 8 otherwise-honest drafts improvised it
> with wrong specifics and were correctly hard-DQ'd, and the taste panels rewarded
> ledger-coverage as a checklist — producing a bland winner. It is kept here because
> it honestly documents that bug. The v2 run fixes the ledger (per-run FILL content
> only; the evaluator mechanism is byte-identical) and is the canonical result.

A single, human-gated pre-launch run: one hermetic canary, one 32-entry tournament
of r/ClaudeAI launch-post drafts, and three predeclared single-call listwise (B1)
baselines over the same field. Nothing was posted, pushed, or committed.

## Frozen config (all three runs)
- Claude Code **2.1.210**; judges = hermetic **worldcup-judge** custom agent on **claude-sonnet-5**
  (bound per agent; orchestrated from an Opus 4.8 session).
- Workflow template SHA-256 `43c641255d8905d7918a8f5cd2f0f519a8d2f3703074766755bbeb94d0987eef`
- Judge-agent SHA-256 `081a9d7b651bdbe47d8188fc12c72c1a26d41a427cb3883ad92c2a29e0a3d99f`
- `generate` / `FIELD=32` / `INCLUDE_BASE=false` / `SCREENERS=3` / panels substance·fit·craft → +integrity from QF.

## Hermetic canary (gate)
- Run `wf_3d7e00f9-ff2`, 19 judge calls, all observed as `worldcup-judge`. All six cases PASS.
- Record: `../../canary/records/2026-07-14-hermetic-sonnet.json` (fixtureVersion 1; validated).

## Tournament (`wf_44029f22-c7b`, 347 agents, ~4.51M tokens, ~18.9 min)
- **Champion: `demo-first`** — *"32 things fight in a bracket. One gets red-carded for lying.
  The champion gets confetti. (clip attached)"* — seed 8, rating 1704, **rating leader**.
- **Trust: robust** (champion = rating leader; final margin decisive). Recommendation: ADOPT.
- **8 disqualifications, all FABRICATION** — mostly for inventing worldcup's origin-story
  anecdote ("a single judge once let a draft win by inventing a stat"), which was NOT in this
  run's fact ledger. (That anecdote is actually true per the repo's own docs; the gate
  correctly rejected it as unsupported-*by-ledger*, which is a property of the supplied
  ledger, not proof of fabrication in the absolute sense.)
- The final was decided by penalizing a draft whose "300–400+ calls" drifted from the
  ledger's real 360–390 figure — the anti-overclaim ledger working as designed.
- Exact winning post: `winning-post-exact.md`. Optional author-edited variant (clearly
  labelled, NOT the exact winner): `winning-post-edited.md`. Report: `worldcup-report.html`.

## B1 single-call baseline (`wf_18bdc84b-2a8`, 3 calls, ~99k tokens)
- fieldHash `8a951ddf4c31cc7112aeff718fabfd152da3c365d57ce84b7a7dcd40009de15d`; three predeclared
  order permutations (rule in `b1-concordance.json`).
- Top choices: **dogfood-meta**, **seriously-built-underbelly**, **visual-tour**.
- Tournament champion `demo-first` appeared in **0/3** B1 top-fives (and was never a B1 top choice).
- B1 top-fives are order-unstable: pairwise overlap 2, 0, 1 (of 5).
- **DQ disagreement:** the tournament gate DQ'd 8 entries (FABRICATION); the B1 calls DQ'd only
  `pick-the-best-of-anything` (PLAGIARISTIC_OR_NON_RESPONSIVE) and did not flag the origin-story
  anecdote — some anecdote drafts were even ranked in B1 top-fives.
- Cost: B1 = 0.86% of the tournament's calls, 2.2% of its tokens.

## What this is and is NOT
This is a **one-field concordance and stability observation, not a benchmark**. There is no
oracle; neither the tournament nor the single-call baseline is established as more correct.
It does **not** show worldcup beats a single/listwise judge, is more accurate/rigorous/reliable,
is academically validated, is certified by its canary, or has broader production use than the
repo supports.

## Files
- `b1-concordance.json` — full machine-readable evidence (identity, hashes, orders, raw B1
  responses, tournament result, computed metrics, limitations).
- `worldcup-report.html` — the self-contained tournament report (gitignored
  generated artifact, not committed; the full result data is in `b1-concordance.json`).
- `winning-post-exact.md` / `winning-post-edited.md` — the champion post (and an optional edit).
- Video (raw + timelapse) and belt frames are in the session scratchpad `capture/` (paths in
  the handoff), kept out of the repo tree to avoid binary bloat.
