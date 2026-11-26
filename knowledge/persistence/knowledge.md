# Persistence — facts and patterns

## Tree state round-trips

- `TreeState` is the serialization unit: seed, year, nextId, edges, removed,
  base, stress. The edge list encodes the whole cut history — seed and year
  cannot reconstruct a pruned tree — so persist it whole, not a recipe.
- Growth is a pure function of `TreeState` plus spec (per-year mulberry32
  streams, `noise(seed, edgeId, channel)`). Restore the state and the tree
  grows identically; nothing else needs storing.
- `Canopy` is not serializable (circular `par` refs) and never should be:
  derived state is rebuilt from the snapshot on load.

## Undo log semantics

- `UndoEntry.originals` are kept-but-modified edges — their ids stay in the
  live tree. `UndoEntry.lost` are removed-subtree edges — absent from it.
- Cross-validation therefore needs a `gone` set: lost ids must be absent from
  the tree and pairwise disjoint across entries; originals must not reference
  an id an *earlier* entry lost (they may reference ids a *later* cut removed).

## Decode boundary

- Validate once, at decode (`treeErrors`/`edgeErrors`/`sessionErrors`); past
  that line the data is trusted. Corrupt input warns and falls back to a
  fresh start — an untrusted session is worse than none.
- Registry lookups keyed by decoded ids must use `Object.hasOwn`:
  `forms['constructor']` and `caps['__proto__']` are truthy prototype values.
- In `edgeErrors`, the edge's id must join `seen` only *after* its `p` check,
  or a self-parent (`p` = own id) passes as a forward reference.
- Edge ids must stay sorted-by-id; `Tree.undo` re-sorts when restoring lost
  edges, so the validator should enforce what the mutator guarantees.

## Browser storage

- One implicit slot, semver envelope (`{ version, session }`): same major
  reads forward with unknown fields ignored; anything else warns and starts
  fresh. No migration code until a schema change earns it.
- Trailing debounce (300 ms) collapses bursts (slider drags) into one write;
  a `pagehide` flush covers the close-mid-drag case.
- `localStorage` failures (quota, private mode) must never break the app:
  every read/write is try/catch, save failures warn and continue.
- Two tabs share the slot with last-writer-wins semantics.

## Testing this layer

- Vitest `toContain` on a string array is exact-element, not substring — join
  error arrays into one string before asserting.
- Compare growth continuation via derived aggregates (`score`, `live`,
  `fruitCount`), not `JSON.stringify` of the model.
