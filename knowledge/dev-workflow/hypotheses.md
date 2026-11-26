# Dev workflow — hypotheses (need more data)

- **husky pre-commit / lint-staged does not fire (or fails silently) in
  EnterWorktree worktrees.** Logged by the previous task ("cause
  unverified"). Candidate causes: worktree lacking `node_modules` at commit
  time, or hook path resolution against the main checkout. Test: observe
  whether lint-staged output appears on commits made in a freshly
  `npm ci`-installed worktree (this fix-pages-deploy-race task runs that
  test).
