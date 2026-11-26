# Git ops — rules (confirmed, apply by default)

- History rewrite procedure, in order: snapshot all refs, create a backup tag on the
  pre-rewrite tip, rewrite, verify parity (commit count, trees identical, dates +
  messages identical, target identity on every commit, untouched refs unmoved), then
  hand over force-push commands.
- Never let a rewrite touch `refs/remotes/origin/*` — stale tracking refs are what makes
  `--force-with-lease` safe.
- Purge identity from both author and committer fields; a work-profile committer on an
  otherwise correct commit is still a leak.
