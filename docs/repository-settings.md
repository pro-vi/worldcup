# Repository Settings For Launch

These settings live in GitHub, not in the git tree. Apply them when the
`launch-pass` branch is ready and before announcing the repository.

## Metadata

- Description: `Best-of-N selection engine wearing a World Cup-style tournament`
- Website: `https://github.com/pro-vi/worldcup/tree/main/docs`
- Topics: `agent-skill`, `claude-code`, `codex`, `llm`, `tournament`, `bracket`,
  `evaluation`, `workflow`

## Branch Protection

Protect `main` with:

- require pull request before merge;
- require `CI / check`;
- require branches to be up to date before merge;
- block force pushes after any clean-history launch rewrite is complete.

## Community Profile

Expected files after this launch pass:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`

## Releases

Tag the clean-history launch commit as `v0.1.0` after the branch is reviewed and
the release canary is recorded.
