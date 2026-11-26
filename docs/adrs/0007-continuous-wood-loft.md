# 0007. Continuous wood loft for main limbs

Date: 2026-11-26
Status: Accepted

## Context

Main-limb wood was drawn as one instanced tapered cylinder per edge
(`stickMatrix` + `woodG`, 0.72→1 taper). Each edge floated as its own
capsule: joints showed seams and gaps, the taper faked branch thickening
only within one annual extension, and picking had to resolve an instance
back to an edge. Cut previews worked by truncating an instance matrix and
adding a coral stub mesh.

## Decision

- Every maximal tip-continuation chain of tree edges becomes ONE welded
  ring-loft `BufferGeometry` tube; all chains merge via `mergeGeometries`
  (`three/addons/utils/BufferGeometryUtils.js`) into a single mesh
  (`src/js/render/loft.ts`).
- Continuation rule mirrors the sim's axis test (`tree.ts`): a child
  continues its parent's chain when `!child.s.fork && child.s.at > 0.95`;
  among several continuations the longer `s.len` stays in the chain, the
  rest root their own chains at their base points. Mid-parent children
  root their own chains; junction overlap between chains is accepted (no
  blended fork surfaces).
- The centerline is the exact polyline of chain joint points
  (`Branch.a`/`Branch.b`); rings use parallel-transport
  (rotation-minimizing) frames, never Frenet, and analytic radial
  normals — never `computeVertexNormals`. No UVs.
- Radius is constant per edge at the pipe-model `q.r` (the per-edge
  0.72→1 taper is gone for main limbs); radius-change joints get 2–3
  smoothstep blend rings either side, monotone and continuous.
- Per-edge coloring and picking go through vertex/triangle range maps
  (`Range {edgeId, start, count}`) partitioning the merged buffers; a
  raycast `faceIndex` resolves to its edge via the triangle map. Sprouts
  and fruit stems stay instanced (`stickMatrix`, `woodG`).
- Cut previews keep their semantics: thinning recolors the removed
  edges' vertex ranges coral (0xff7258) with geometry unchanged; a
  heading regenerates only the affected chain (cut band truncates at the
  cut fraction, later bands stay in place colored coral) and keeps the
  coral `extra` stub. A cut past a surviving continuation's joint lies
  off the chain band and leaves it whole.

## Consequences

- Main-limb wood is one draw call with welded joints; segment budgets
  now bound edges (`caps.max`) while ring vertices follow `caps.sides`.
- Picking parity: merged-mesh hits resolve through the face map with the
  same along-edge `t` formula; the screen-space capsule fallback over
  `m.list` is unchanged.
- Preview rewrites recompute only the touched chain's rings and re-merge
  the cached per-chain buffers, so other chains' vertex data is
  untouched; welded rings mean a hard color change at a thinning
  boundary bleeds one strip across the joint (accepted).
- `src/js/render/loft.ts` is pure (no DOM, no scene objects) and unit
  tested in `tests/loft.test.ts`; browser smoke covers the render layer.
