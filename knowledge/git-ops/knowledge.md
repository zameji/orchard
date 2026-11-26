# Git ops — facts and patterns

## History rewrites

- `git filter-branch --env-filter '...' -- <ref>` rewrites only the named ref even when
  its commits are shared with other branches. The other refs keep the old SHAs (and the
  old metadata) — deliberate when only one branch is in scope, but merging them later
  reintroduces the purged commits.
- Rewrites create new commit objects: author/committer dates and messages survive
  (env-filter changes only exported variables), but GPG/SSH signatures drop unless the
  history is re-signed afterwards.
- filter-branch keeps its own copy of the pre-rewrite refs under `refs/original/` —
  delete after the rewrite is published.
- `git filter-branch` runs on commit-tree plumbing, so husky/lint-staged pre-commit
  hooks do not fire during a rewrite.

## Rewrites and remotes

- After rewriting a branch that `refs/remotes/origin/*` points at, leave the
  remote-tracking refs stale (pointing at the old SHAs). `git push --force-with-lease`
  compares the remote against those tracking refs; if they are rewritten locally the
  lease is wrong and the push gets rejected.
- Publishing a rewritten branch needs a force push; push a backup ref first so the old
  history stays recoverable server-side.
