# Persistence — rules (confirmed, apply by default)

- Persist plain data only; rebuild all derived state on load. Any new
  persisted field ships with its validator in `sessionErrors` and a
  corrupt-value test.
- Registry lookups keyed by user- or storage-supplied ids use `Object.hasOwn`
  — never a bare `registry[id]`.
- The decode boundary is the only trust line: nothing reaches the sim without
  passing `treeErrors`/`sessionErrors`; failures warn and start fresh.
- Saves trigger from one place (the hook facade), not per-mutation call sites
  a future mutator could forget.
