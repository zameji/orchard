# Render — rules (confirmed, apply by default)

- Never copy chain-local indices into a shared buffer without rebasing by the
  destination vertex offset. `mergeGeometries` rebases for you; a hand-rolled
  `TypedArray.set` does not, and the failure is silent — geometry from the
  second chain onward draws over the first.
- Any test of a persistent/shared buffer asserts the block invariant (each
  owner's triangles reference only vertices inside its own range), not just
  positions. Position-only assertions passed while the index buffer was
  corrupt.
- Lofted tubes get analytic radial normals, never `computeVertexNormals()`.
- Main-limb radius is constant per edge; radius transitions are blend rings
  at joints, never a per-segment taper.
- Cut previews rewrite the touched chain's range in place; they never
  re-merge, reallocate, or touch another chain's vertices.
- New instanced geometry respects the `caps` tiers (`caps.max` budget,
  `caps.sides` ring resolution).
- The sim layer stays headless: loft code takes plain segments
  (`{id, a, b, r}`) and never imports `Canopy`, the DOM, or the renderer.