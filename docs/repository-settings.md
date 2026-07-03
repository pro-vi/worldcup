# Repository Settings For Launch

These settings live in GitHub, not in the git tree. Apply them when the
`launch-pass` branch is ready and before announcing the repository.

## Clean-History Squash (REQUIRED before announcing)

The pre-launch history on `main`/`launch-pass` still contains removed private
scratch (plans, probes, internal notes). A normal merge keeps all of it
publicly reachable; the announcement must ship from a single clean root
commit instead. After `launch-pass` is reviewed and green:

```bash
git switch launch-pass && npm run check
git checkout --orphan public-main   # checkout, NOT `switch --orphan`: switch empties the
                                    # working tree/index; checkout keeps every file staged
git commit -m "worldcup v0.1.0 — open-source launch"
git diff --stat launch-pass public-main   # must be EMPTY — same tree, new root
git push origin public-main:main --force-with-lease
git branch -f main public-main && git switch main && git branch -D public-main
git branch -D launch-pass              # required: retire the pre-squash branch locally
git push origin --delete launch-pass   # required: retire it on the remote too
```

Verify before announcing:

```bash
git ls-remote --heads origin    # must list only refs/heads/main
git log --oneline origin/main   # must show exactly the single clean root commit
```

Until this squash lands, do not tag, announce, or link the repository —
CONTRIBUTING.md's clean-root note describes the post-squash state. After it
lands, enable "block force pushes" on `main` (below) so the rewrite is the
last one.

Honest scope note: this procedure produces a clean default clone — a fresh
`git clone` only ever sees the single root commit on `main` — not total
unreachability. GitHub also keeps `refs/pull/N/head` refs pointing into the
pre-squash history, which the repo owner cannot delete, and the orphaned
pre-squash commits stay fetchable by SHA until GitHub's garbage collection
eventually purges them. If a total scrub is required, ask GitHub support to
purge the repository's history, or delete and recreate the repository instead.

## Metadata

- Description: `Best-of-N selection engine wearing a World Cup-style tournament`
- Topics: `agent-skill`, `claude-code`, `codex`, `llm`, `tournament`, `bracket`,
  `evaluation`, `workflow`, `best-of-n`, `llm-judge`
- Social preview: upload the 1280x640 hero crop
  (`docs/media/social-preview.png`) under Settings > General > Social preview
  before announcing — the link unfurl on HN/X/Slack is decided by this image,
  not by the README.

## Security

- Enable **Private Vulnerability Reporting** (Settings > Code security) —
  `SECURITY.md` and the issue-template contact link both point to
  `security/advisories/new`, which 404s until this is on.
- Enable secret scanning and push protection.

## Branch Protection

Protect `main` with:

- require pull request before merge;
- require the CI matrix checks — with the node/OS matrix the required status
  names are `CI / check (ubuntu-latest, node 20)` (and 22/24, plus
  `CI / check (windows-latest, node 20)`); at minimum require the
  ubuntu/node-20 job;
- require branches to be up to date before merge;
- block force pushes after any clean-history launch rewrite is complete.

## CI Housekeeping At Squash Time

`.github/workflows/ci.yml` triggers on pushes to `main` only (the `launch-pass`
trigger was removed in the clean-history root commit, since that branch retires
at squash time).

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

Tag the clean-history launch commit as `v0.1.0` only after the release canary is
run through the skill host and its record is committed and validated:

```bash
node scripts/judge-canary.js --record canary/records/2026-07-v0.1.0.json
```

See `canary/README.md` for the record shape and rules.
