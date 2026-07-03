# Contributing

Thanks for improving `worldcup`. Keep changes small and evidence-backed: this
repo is mostly a skill plus reference templates, so docs and contracts matter as
much as code.

A note on history: the public announcement will ship from a clean-history root
commit (see the launch procedure in `docs/repository-settings.md`), so
pre-launch scratch (plans, probes, private notes) is not part of the announced
history; the ADRs in `docs/adr/` summarize anything from that period worth keeping.

## Local Checks

Run the launch checks before opening a pull request:

```bash
npm run check
```

That command syntax-checks the executable JavaScript, runs the live-view and
canary-validator tests, runs the fake-judge end-to-end tournament harness
(`tests/workflow-run.test.js` — the whole bracket with deterministic stub
judges, including a completion-order-invariance check), and validates the
judge-canary fixture contract.

## Change Guidelines

- Preserve the skill contract in `worldcup/SKILL.md`: it should remain
  taste-neutral and domain-general by default.
- Update `worldcup/references/live-view.md` when changing event shapes consumed
  by `live-view.js`.
- Update `worldcup/references/brackets.md` when changing tournament math.
- Keep generated run artifacts out of git (`worldcup-report*.html`,
  `worldcup-live*.html`, `*.jsonl`).
- Do not commit private notes, local agent state, or source packets that contain
  unpublished user material.

## Pull Requests

Use the PR template and include:

- What changed.
- Why it is safe.
- Which checks you ran.
- Screenshots or generated HTML only when the visual output changed.

## Release Canary

Before release, run the six-case judge canary described by
`canary/judge-canary.json` through the skill host and validate the recorded
results (see `canary/README.md` for the record shape; recorded runs live in
`canary/records/`, one file per tag):

```bash
node scripts/judge-canary.js --record canary/records/<date>-<tag>.json
```
