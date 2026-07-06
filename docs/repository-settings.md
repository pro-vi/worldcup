# Repository Settings For Launch

These settings live in GitHub, not in the git tree. This file is the
repository's launch-configuration record: each item states a setting and pairs
it with the command that confirms it. Run the command to verify any line.

## Clean-History Launch

The public repository ships from a single clean root commit,
`fd2a970 "worldcup v0.1.0 — open-source launch"`. The pre-launch working
history (plans, probes, internal notes) is not part of the announced history;
`docs/adr/` summarizes anything from that period worth keeping. The remote
carries only `refs/heads/main`; the pre-squash `launch-pass` branch is retired
both locally and on the remote.

Confirm the default clone is clean:

```bash
git ls-remote --heads origin         # lists only refs/heads/main
git log --oneline origin/main | tail -1   # the clean root commit fd2a970 at the base of history
```

Honest scope note: the clean-history launch produces a clean default clone — a
fresh `git clone` only ever sees the single root commit on `main` — not total
unreachability. GitHub also keeps `refs/pull/N/head` refs pointing into the
pre-squash history, which the repo owner cannot delete, and the orphaned
pre-squash commits stay fetchable by SHA until GitHub's garbage collection
eventually purges them. If a total scrub is required, ask GitHub support to
purge the repository's history, or delete and recreate the repository instead.

## Metadata

- **Description:** `Best-of-N selection engine wearing a World Cup-style tournament`
- **Homepage:** `https://pro-vi.github.io/worldcup/` — the GitHub Pages site that
  serves the rendered interactive reports (Pages source: branch `main`, folder
  `/docs`).
- **Topics** (ten): `agent-skill`, `claude-code`, `codex`, `llm`, `tournament`,
  `bracket`, `evaluation`, `workflow`, `best-of-n`, `llm-judge`.
- **Social preview:** the 1280x640 hero crop (`docs/media/social-preview.png`),
  uploaded under Settings > General > Social preview — the link unfurl on
  HN/X/Slack is decided by this image, not by the README. GitHub exposes no API
  for this upload, so it is a manual step.

Confirm:

```bash
gh repo view pro-vi/worldcup --json description,homepageUrl,repositoryTopics
gh repo view pro-vi/worldcup --json usesCustomOpenGraphImage   # true once the social preview is uploaded
gh api repos/pro-vi/worldcup/pages --jq '{status,source}'      # built from main:/docs
```

## Security

- **Private Vulnerability Reporting** is enabled. The clickable security-contact
  link lives in `.github/ISSUE_TEMPLATE/config.yml` and points to
  `https://github.com/pro-vi/worldcup/security/advisories/new`, which resolves
  only when Private Vulnerability Reporting is on. (`SECURITY.md` states the
  private-reporting policy in prose; it does not itself carry that link.)
- **Secret scanning** and **push protection** are enabled.

Confirm:

```bash
gh api repos/pro-vi/worldcup/private-vulnerability-reporting   # {"enabled":true}
curl -sS -o /dev/null -w '%{http_code}\n' https://github.com/pro-vi/worldcup/security/advisories/new   # not 404
```

## Branch Protection

`main` is protected:

- pull request required before merge;
- required status check: the Linux / Node 20 CI job — its check-run name is
  `check (ubuntu-latest, node 20)` (the matrix also runs Node 22/24 on Linux and
  Node 20 on Windows). Read the exact live names before wiring protection (do
  not guess them):
  `gh api repos/pro-vi/worldcup/commits/main/check-runs --jq '.check_runs[].name'`;
- branches required to be up to date before merge (strict mode);
- force pushes blocked — the clean-history rewrite was the last one;
- admins included (`enforce_admins`): the owner accepts the friction as the
  guarantee that the rewrite was final.

Confirm:

```bash
gh api repos/pro-vi/worldcup/branches/main/protection \
  --jq '{pr: .required_pull_request_reviews != null, checks: .required_status_checks.contexts, strict: .required_status_checks.strict, force_pushes_blocked: (.allow_force_pushes.enabled | not), enforce_admins: .enforce_admins.enabled}'
```

## Continuous Integration

`.github/workflows/ci.yml` runs `npm run check` on every pull request and on
pushes to `main`, across the matrix: Node 20/22/24 on `ubuntu-latest` plus Node
20 on `windows-latest` (four jobs). The launch checks byte-compare the rendered
sample reports against their committed copies, so a drift is a red build.

## Community Profile

The community-health files are present:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`

## Releases

`v0.1.0` is tagged and released from the CI-green launch HEAD. The release
prerequisite — a real-judge canary record, committed and validated — is met:
`canary/records/2026-07-v0.1.0.json`. Validate it with:

```bash
node scripts/judge-canary.js --record canary/records/2026-07-v0.1.0.json
```

Confirm the release:

```bash
gh release view v0.1.0
```

See `canary/README.md` for the record shape and rules.
