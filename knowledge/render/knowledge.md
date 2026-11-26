# Render — facts and patterns

## Main-limb wood is one merged ring loft

- Main limbs are a single `BufferGeometry` built by `render/loft.ts` +
  `render/loft-cache.ts`, not one instanced cylinder per edge. Instancing
  remains only for geometry too small for topology artifacts to read:
  sprouts, fruit stems, the coral cut stub (`stickMatrix`/`woodG`), plus
  leaves and fruit.
- A chain is a maximal path of tip continuations: a child continues its
  parent iff `!child.s.fork && child.s.at > 0.95` — the same predicate the
  sim uses (`sim/tree.ts`). Mid-parent children (laterals, sprouts, heading
  sprouts, `s.at` spanning 0.12–0.97) root their own chain at
  `atPoint(parent, s.at)`, buried inside the parent tube. Two continuations
  on one edge: the longer (`s.len`) stays, the other roots a side chain.
- Centerline is the exact joint polyline (`Branch.a`/`Branch.b` from
  `Canopy`). No spline: cut math and capsule picking act on those same
  straight edges, so a smoothed centerline would desync preview from pick.
- Frames are parallel transport (rotation-minimizing), never raw Frenet —
  Frenet twists where curvature approaches zero, which is most of a tree.
- Normals are analytic radial normals from the ring frames. Not
  `computeVertexNormals()`: that averages across the cap/wall boundary and
  rounds the silhouette.
- Radius is constant per edge at the pipe-model `q.r`. The old 0.72→1
  cylinder taper is gone for main limbs. Radius changes only at joints, over
  2 blend rings either side with a smoothstep interpolation.
- No UVs and no vertex-color textures: per-edge color is a `color`
  attribute painted through the vertex-range map.

## Cut preview on a merged mesh

- Thinning (whole edge removed) recolors that edge's vertex range coral;
  geometry is untouched.
- Heading (partial, `selected.at > 0`) rewrites only the affected chain:
  the cut edge's band truncates at a ring on the cut point, later bands stay
  in place and go coral, matching the old coral-in-place overlay. Cancel
  restores the chain byte-exact.
- `LoftCache` holds one persistent buffer set per build with fixed per-chain
  slots; `applyCut` copies only the touched chains and never reallocates.
  A returned `MergedLoft` aliases live buffers — snapshot anything kept
  across a rewrite.
- Slot slack is `previewSlack(sides)` = one ring's spokes plus a cap centre
  of vertices and one cap fan of triangles (the `truncateRings` insert case,
  the only rewrite that grows a chain). Slack triangles collapse onto the
  chain's first vertex: degenerate, in-block, never picked.

## Picking

- The merged wood mesh resolves a raycast `faceIndex` to an edge through the
  triangle-range map (`edgeAtFace`); the sprout mesh still resolves
  `instanceId` to a piece. The screen-space capsule fallback over `m.list`
  is unchanged and remains the authority for tap selection.

## Determinism

- All display randomness stays `noise(seed, edgeId, channel)` — a running RNG
  would move bud sites between preview, undo and redraw.