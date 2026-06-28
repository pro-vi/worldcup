# Launch History Strategy

## Problem

The current public `main` branch has a clean tip, but its history contains files
that were later removed: `.inbox/`, `PLAN_*`, `docs/plans/`, probes, and
personal/profile artifacts. Current-tree and simple history secret-pattern scans
found no obvious token/key patterns, but deleted private working notes are still
part of the public git history.

This cannot be fixed by a normal commit. A commit can remove files from the tip;
it cannot remove them from history.

## Recommendation

For a real open-source announcement, publish a clean-history branch made from the
current reviewed tree as one squashed root commit, then replace `main` with that
branch or use it as the initial commit in a fresh repository.

Preferred path for the existing repository:

```bash
# 1. Finish and review launch-pass.
git switch launch-pass
npm run check

# 2. Create a clean root branch from the final tree.
git switch --orphan public-main
git add .
git commit -m "chore: prepare open-source launch"

# 3. Inspect exactly what will be public.
git ls-files
git grep -n -I -E 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN .*PRIVATE KEY-----'

# 4. Replace main only after coordination.
git push origin public-main:main --force-with-lease
```

Alternative path:

1. Create a fresh public repository.
2. Push the clean root commit there.
3. Archive or make private the current repository if its history should stop
   being discoverable.

## Why Squash Instead Of Filter

History filtering can remove specific paths, but this repository is young and
the launch state is small. A single clean root commit is easier to inspect and
harder to get subtly wrong than path-based filtering across many scratch commits.

## Release Checklist

- Review historical private notes manually before deciding whether current
  public history is acceptable.
- Rotate anything sensitive discovered in history; deletion or rewriting is not
  enough for a real secret.
- Run `npm run check` on the final tree.
- Push with `--force-with-lease`, never plain `--force`.
- Tell contributors to re-clone after the rewrite.
