# Contributing

Thanks for improving `worldcup`. Keep changes small and evidence-backed: this
repo is mostly a skill plus reference templates, so docs and contracts matter as
much as code.

## Local Checks

Run the launch checks before opening a pull request:

```bash
npm run check
```

That command syntax-checks the executable JavaScript, runs the live-view tests,
and validates the judge-canary fixture contract.

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
results:

```bash
node scripts/judge-canary.js --record path/to/canary-results.json
```
