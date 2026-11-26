# 0006. Persist the session in localStorage

Date: 2026-11-26
Status: Accepted

## Context

Every reload threw the pruning session away: config lived in the DOM,
the tree in memory. A pruning study is an investment — cuts, years
advanced, undo history — and losing it on a refresh defeated longer
sessions. No persistence mechanism existed anywhere in the codebase.

## Decision

- One implicit autosave slot under the `localStorage` key
  `orchard.session`, no save management UI. The envelope is
  `{ version, session }` with a semver string; versions outside the
  current major are discarded with a `console.warn`, and no migration
  machinery exists until a schema change needs it.
- A session is exactly `{ config, tree, undoLog, renovationStart,
prefs }` — plain data only. `Tree.snapshot()`/`Tree.restore()`
  round-trip `TreeState` (`sim/state.ts` `cloneState` deep-copies edge
  objects and direction tuples); the full edge list is stored because
  seed and year cannot reconstruct a pruned tree. Derived state
  (`TreeSpec`, `Canopy`, `Advisor`, caps) is always rebuilt on load.
  UI prefs cover the display toggles, one-finger tool and solar time;
  the active tab and camera pose are deliberately not persisted.
- Restore is silent on boot: a saved session loads directly (Plant is
  the fresh-start escape hatch); no save means the previous boot
  behavior. Every user intent reaches `Studio` through the `UiHooks`
  facade, and that facade schedules the save (300 ms trailing debounce,
  flush on `pagehide`) — one trigger instead of per-mutation call sites
  a future mutator could forget.
- Validation at the decode boundary (`treeErrors`/`edgeErrors` in
  `sim/state.ts`, config registry lookups in `app/persist.ts`): any
  structural problem, unregistered axis combination or storage failure
  warns and falls back to a fresh start. `localStorage` reads and
  writes are wrapped in try/catch so quota and private-mode failures
  never break the app.

## Consequences

- Reload continues a session exactly: cuts, undo entries and prefs
  survive, and restored trees grow identically (growth is a function of
  `TreeState` plus spec — pinned by tests).
- The sim layer stays headless: `sim/state.ts` is pure data handling;
  `app/persist.ts` owns the storage boundary. `Studio` keeps the only
  mutation flow (`adopt`/`derive` shared by `plant` and `restore`).
- Same-major envelope versions read forward (unknown fields ignored),
  so additive schema changes ship without migration code; a breaking
  change discards old saves, which is what every load did before.
- Multiple tabs share the one slot with last-writer-wins semantics:
  whichever tab saves most recently owns the slot, and the others do
  not notice. A single tab is the expected use; cross-tab merging or
  `storage`-event arbitration is out of scope until it hurts.
- Persistence is untested in the browser by the suite (DOM-adjacent
  glue) — the pure encode/decode path is unit-tested; the load/save
  shell is covered by browser smoke.
