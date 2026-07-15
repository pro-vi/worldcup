# 2026-07-14 Reddit-launch dogfood v2 — evidence

A single, human-gated pre-launch run: one 32-entry tournament of r/ClaudeAI
launch-post drafts, and three predeclared single-call listwise (B1) baselines
over the same field. Nothing was posted, pushed, or committed.

**This run supersedes `../2026-07-14-reddit-launch/` (v1).** v1's fact ledger
omitted worldcup's *true* origin story (an early personal essay that won under a
single tasteless judge by fabricating concrete detail — invented line numbers, a
fake stack trace, a made-up class name). With no true fact to anchor to, 8 honest
drafts improvised that story with WRONG specifics and were correctly hard-DQ'd,
and the taste panels rewarded ledger-coverage as a checklist — so v1's winner was
bland. v2 makes exactly three per-run FILL-content changes: (A) it tells the
panels the ledger is *permission, not a scoring rubric*; (B) it adds the true
origin story to `supported_facts`; (C) it folds one neutral factual sentence of
that story into the base draft. **The evaluator mechanism is byte-identical to v1**
(same template / judge-agent / gate / panels / model SHAs below), so the
2026-07-14 hermetic canary still covers it (ADR 0002 scopes the canary to
mechanism changes, not per-run ledger/criteria content).

## Frozen config (both runs)
- Claude Code **2.1.210**; judges = hermetic **worldcup-judge** custom agent on **claude-sonnet-5**
  (bound per agent; orchestrated from an Opus 4.8 session).
- Workflow template SHA-256 `43c641255d8905d7918a8f5cd2f0f519a8d2f3703074766755bbeb94d0987eef` (unchanged from v1)
- Judge-agent SHA-256 `081a9d7b651bdbe47d8188fc12c72c1a26d41a427cb3883ad92c2a29e0a3d99f` (unchanged from v1)
- v2 filled-script SHA-256 `7d36e51644f94103a61336d7540e9e45218af3c248173e634cb2262059ec7b9f` (pins the exact per-run content)
- `generate` / `FIELD=32` / `INCLUDE_BASE=false` / `SCREENERS=3` / panels substance·fit·craft → +integrity from QF.

## Tournament (`wf_c2760647-7d2`, 400 agents, ~5.14M tokens, ~21.5 min)
- **Champion: `punchy-short`** — *"My Claude Code skill runs your drafts through a
  World Cup. Liars get red-carded."* — seed 13, rating 1697, **rating leader**.
- **Trust: robust** (champion = rating leader; final margin decisive). Recommendation: ADOPT.
- **0 disqualifications** (v1 had 8). With the true origin story in the ledger, the
  best drafts had a real fact to anchor to and survived the gate; the winning draft
  uses it directly ("invented line numbers, a fake stack trace, a class name that
  never existed").
- Exact winning post: `winning-post-exact.md`. Report: `worldcup-report.html`.

## B1 single-call baseline (`wf_63e55133-b98`, 3 calls, ~101k tokens)
- fieldHash `d9b64c176d14b661f47c6d1fe3e789b80851e860a5224f28bee72bf8b34ce094`; three
  predeclared order permutations (rule in `b1-concordance.json`).
- Top choices: **seriously-built-underbelly**, **token-burner**, **problem-to-build**.
- Tournament champion `punchy-short` appeared in **0/3** B1 top-fives (and was never a B1 top choice).
- B1 top-fives are order-unstable: pairwise overlap 1, 2, 3 (of 5).
- **DQ disagreement:** the tournament gate DQ'd **0** entries; the three B1 calls DQ'd
  8 *different* labels between them — and unstably: B1-k1 ranked `seriously-built-underbelly`
  **#1** while B1-k2 DQ'd that same draft as `PLAGIARISTIC_OR_NON_RESPONSIVE`. Reported as a
  divergence, NOT as evidence either gate is correct.
- Cost: B1 = 0.75% of the tournament's calls, 2.0% of its tokens.

## What this is and is NOT
This is a **one-field concordance and stability observation, not a benchmark**. There is no
oracle; neither the tournament nor the single-call baseline is established as more correct.
It does **not** show worldcup beats a single/listwise judge, is more accurate/rigorous/reliable,
is academically validated, is certified by its canary, or has broader production use than the
repo supports.

## Files
- `b1-concordance.json` — full machine-readable evidence (identity, hashes, orders, raw B1
  responses, tournament result, computed metrics, supersession note, limitations).
- `worldcup-report.html` — the self-contained tournament report (gitignored
  generated artifact, not committed; the full result data is in `b1-concordance.json`).
- `winning-post-exact.md` — the verbatim champion post (no human edits).
- Video + champion frame are in the session scratchpad `capture-v2/` (kept out of the repo
  tree to avoid binary bloat):
  - `worldcup-timelapse-v2.mp4` — color-corrected 8× timelapse of the real run (2m32s, 5.3MB).
  - `take-v2.webm` — raw live capture (~20min).
  - `champion-v2.png` — final bracket with `punchy-short` crowned.
