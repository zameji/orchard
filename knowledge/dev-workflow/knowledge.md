# Dev workflow — facts and patterns

- `current_state.md` and `knowledge/` are local-only bookkeeping (see the
  working agreement); never commit them. A worktree copy of
  `current_state.md` must be synced back to the main checkout before the
  worktree is pruned, or the record is lost with the tree.
- EnterWorktree names branches `worktree-<name>`; rename to the naming rule
  (`[a-z][a-z0-9-]+`, e.g. `fix-pages-deploy-race`) with
  `git branch -m` from inside the worktree.
- Precedent: "work in a worktree, then merge into a feature/fix branch and
  prune the tree" = the worktree branch **is** the feature/fix branch; keep
  the branch, delete the worktree; `main` never receives commits directly.
