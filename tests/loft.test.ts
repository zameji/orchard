import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  chainGeometry,
  decomposeChains,
  type ChainNode,
  type LoftNode,
  type Range,
  type Seg,
} from '../src/js/render/loft.js';
import {
  edgeAtFace,
  fillEdgeColors,
  LoftCache,
  mergeChains,
  type MergedLoft,
} from '../src/js/render/loft-cache.js';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function node(
  id: number,
  opts: { at?: number; fork?: boolean; len?: number } = {},
): ChainNode {
  return {
    s: { id, at: opts.at ?? 1, fork: opts.fork ?? false, len: opts.len ?? 1 },
    kids: [],
  };
}

function attach(parent: ChainNode, child: ChainNode): ChainNode {
  child.par = parent;
  parent.kids.push(child);
  return child;
}

/** Chain node carrying one edge's straight display segment. */
function segNode(
  id: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  opts: { at?: number; fork?: boolean } = {},
): LoftNode {
  return {
    s: { id, at: opts.at ?? 1, fork: opts.fork ?? false, len: a.distanceTo(b) },
    a,
    b,
    r,
    kids: [],
  };
}

/** Chain of straight edges with per-edge radii and a gentle bend per joint. */
function makeSegs(radii: number[], bend = 0.15, id0 = 10): Seg[] {
  const segs: Seg[] = [];
  let a = v(0, 0, 0);
  for (let i = 0; i < radii.length; i++) {
    const b = v(bend * i, i + 1, bend * i * 0.5);
    segs.push({ id: id0 + i, a, b, r: radii[i] });
    a = b;
  }
  return segs;
}

function triArea(g: THREE.BufferGeometry, tri: number) {
  const ix = g.index!,
    p = g.attributes.position;
  const a = v(0, 0, 0).fromBufferAttribute(p, ix.getX(tri * 3));
  const b = v(0, 0, 0).fromBufferAttribute(p, ix.getX(tri * 3 + 1));
  const c = v(0, 0, 0).fromBufferAttribute(p, ix.getX(tri * 3 + 2));
  return b.sub(a).cross(c.sub(a)).length() * 0.5;
}

/** Widest stretch of radius change around step k in a ring radius list. */
function runAround(rs: number[], k: number): number[] {
  let i = k - 1,
    j = k;
  while (i > 0 && Math.abs(rs[i] - rs[i - 1]) > 1e-9) i--;
  while (j + 1 < rs.length && Math.abs(rs[j + 1] - rs[j]) > 1e-9) j++;
  return rs.slice(i, j + 1);
}

function partitions(ranges: readonly Range[], total: number) {
  let at = 0;
  for (const r of ranges) {
    expect(r.start).toBe(at);
    expect(r.count).toBeGreaterThan(0);
    at += r.count;
  }
  expect(at).toBe(total);
}

describe('chain decomposition', () => {
  it('chains tip continuations and roots mid-parent children', () => {
    const root = node(1);
    const tip = attach(root, node(2));
    const third = attach(tip, node(3));
    const lateral = attach(root, node(4, { at: 0.5 }));
    const sprout = attach(tip, node(5, { at: 0.8 }));
    const chains = decomposeChains([root, tip, third, lateral, sprout]);
    expect(chains.map((c) => c.map((n) => n.s.id))).toEqual([
      [1, 2, 3],
      [4],
      [5],
    ]);
  });

  it('continues only past the 0.95 threshold and only without fork', () => {
    const root = node(1);
    const below = attach(root, node(2, { at: 0.95 }));
    const above = attach(root, node(3, { at: 0.951 }));
    const forked = attach(root, node(4, { at: 1, fork: true }));
    const chains = decomposeChains([root, below, above, forked]);
    expect(chains.map((c) => c.map((n) => n.s.id))).toEqual([[1, 3], [2], [4]]);
  });

  it('keeps the longer of two tip continuations in the chain', () => {
    const root = node(1);
    const short = attach(root, node(2, { at: 0.96, len: 3 }));
    const long = attach(root, node(3, { at: 1, len: 5 }));
    const chains = decomposeChains([root, short, long]);
    expect(chains.map((c) => c.map((n) => n.s.id))).toEqual([[1, 3], [2]]);
  });

  it('picks the first of equal-length continuations deterministically', () => {
    const root = node(1);
    const first = attach(root, node(2, { len: 4 }));
    const second = attach(root, node(3, { len: 4 }));
    const chains = decomposeChains([root, first, second]);
    expect(chains.map((c) => c.map((n) => n.s.id))).toEqual([[1, 2], [3]]);
  });

  it('covers every edge exactly once', () => {
    const root = node(1);
    const a = attach(root, node(2));
    const spur = attach(a, node(3, { at: 0.4 }));
    const cont = attach(a, node(4));
    const other = attach(root, node(5, { at: 0.99, len: 2 }));
    const seen = decomposeChains([root, a, spur, cont, other])
      .flat()
      .map((n) => n.s.id);
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('ring loft geometry', () => {
  it('welds rings through the index buffer with no duplicated rings', () => {
    const sides = 6,
      segs = makeSegs([0.1, 0.08, 0.08]);
    const g = chainGeometry(segs, sides);
    const geom = mergeChains([g]).geometry;
    // One vertex block per ring plus the two cap centers: no duplicated
    // boundary rings anywhere.
    expect(g.vertexCount).toBe(g.rings.length * sides + 2);
    // The joint ring between edge 0 and edge 1 is referenced by triangles on
    // both sides of the joint (shared via indices, not copied).
    const joint = g.rings.findIndex((r, k) => k > 0 && r.seg === 1);
    expect(joint).toBeGreaterThan(0);
    const below = new Set<number>(),
      above = new Set<number>();
    const inRing = (k: number, vi: number) =>
      vi >= 1 + k * sides && vi < 1 + (k + 1) * sides;
    for (let t = 0; t < g.triangleCount; t++) {
      const vi = [0, 1, 2].map((j) => g.index[t * 3 + j]);
      if (!vi.some((x) => inRing(joint, x))) continue;
      if (vi.some((x) => inRing(joint - 1, x))) below.add(t);
      if (vi.some((x) => inRing(joint + 1, x))) above.add(t);
    }
    expect(below.size).toBeGreaterThan(0);
    expect(above.size).toBeGreaterThan(0);
    // Index buffer in range and no degenerate triangles.
    for (let t = 0; t < g.triangleCount * 3; t++)
      expect(g.index[t]).toBeLessThan(g.vertexCount);
    for (let t = 0; t < g.triangleCount; t++)
      expect(triArea(geom, t)).toBeGreaterThan(1e-9);
    expect(geom.attributes.position.count).toBe(g.vertexCount);
    expect(geom.attributes.normal.count).toBe(g.vertexCount);
    fillEdgeColors(geom, g.vertRanges, () => new THREE.Color(1, 1, 1));
    expect(geom.attributes.color.count).toBe(g.vertexCount);
  });

  it('keeps transport frames orthonormal without flips', () => {
    const sides = 7,
      segs = makeSegs([0.1, 0.07, 0.09, 0.05], 0.35);
    const { rings } = chainGeometry(segs, sides);
    expect(rings.length).toBeGreaterThan(3);
    for (const r of rings) {
      expect(r.t.length()).toBeCloseTo(1, 6);
      expect(r.f.length()).toBeCloseTo(1, 6);
      expect(r.b.length()).toBeCloseTo(1, 6);
      expect(r.f.dot(r.b)).toBeCloseTo(0, 6);
      expect(r.f.dot(r.t)).toBeCloseTo(0, 6);
      expect(r.b.dot(r.t)).toBeCloseTo(0, 6);
    }
    for (let k = 1; k < rings.length; k++) {
      expect(rings[k].f.dot(rings[k - 1].f)).toBeGreaterThan(0);
      expect(rings[k].b.dot(rings[k - 1].b)).toBeGreaterThan(0);
    }
  });

  it('does not twist along a straight run', () => {
    const segs = makeSegs([0.1, 0.1, 0.1], 0);
    const { rings } = chainGeometry(segs, 5);
    for (let k = 1; k < rings.length; k++) {
      expect(rings[k].f.dot(rings[k - 1].f)).toBeCloseTo(1, 6);
      expect(rings[k].b.dot(rings[k - 1].b)).toBeCloseTo(1, 6);
    }
  });

  it('emits unit radial normals from the ring frames', () => {
    const sides = 6,
      segs = makeSegs([0.1, 0.06], 0.2);
    const g = chainGeometry(segs, sides);
    const merged = mergeChains([g]).geometry;
    const p = merged.attributes.position,
      n = merged.attributes.normal;
    for (let k = 0; k < g.rings.length; k++) {
      const ring = g.rings[k];
      for (let j = 0; j < sides; j++) {
        const vi = 1 + k * sides + j;
        const pos = v(0, 0, 0).fromBufferAttribute(p, vi);
        const nor = v(0, 0, 0).fromBufferAttribute(n, vi);
        const radial = pos.sub(ring.pos).normalize();
        expect(nor.length()).toBeCloseTo(1, 6);
        expect(nor.dot(radial)).toBeCloseTo(1, 5);
      }
    }
    // Cap centers carry analytic axial normals.
    const rootN = v(0, 0, 0).fromBufferAttribute(n, 0);
    expect(Math.abs(rootN.dot(g.rings[0].t))).toBeCloseTo(1, 6);
    const tipN = v(0, 0, 0).fromBufferAttribute(n, g.vertexCount - 1);
    expect(Math.abs(tipN.dot(g.rings[g.rings.length - 1].t))).toBeCloseTo(1, 6);
  });

  it('blends radii monotonically across joints with no jump', () => {
    const sides = 5,
      radii = [0.1, 0.05, 0.09],
      segs = makeSegs(radii, 0.12);
    const { rings } = chainGeometry(segs, sides);
    const rs = rings.map((r) => r.r);
    expect(rs[0]).toBeCloseTo(0.1, 9);
    expect(rs[rs.length - 1]).toBeCloseTo(0.09, 9);
    // Radii never leave the range spanned by the edge radii (no overshoot),
    // and no single step is a ledge: the blend is continuous.
    const lo = Math.min(...radii),
      hi = Math.max(...radii);
    for (const r of rs) {
      expect(r).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(r).toBeLessThanOrEqual(hi + 1e-9);
    }
    for (let k = 1; k < rs.length; k++)
      expect(Math.abs(rs[k] - rs[k - 1])).toBeLessThan(0.5 * 0.05);
    // Each radius-change joint blends through a monotone run that starts and
    // ends exactly on the neighbouring edge radii.
    for (let k = 1; k < rs.length; k++) {
      if (Math.abs(rs[k] - rs[k - 1]) < 1e-9) continue;
      const run = runAround(rs, k),
        d = run[run.length - 1] - run[0];
      for (let x = 1; x < run.length; x++)
        expect(Math.sign(run[x] - run[x - 1])).toBe(Math.sign(d));
      // The run starts and ends exactly on the two edge radii of its joint.
      for (const end of [run[0], run[run.length - 1]])
        expect(radii.some((x) => Math.abs(x - end) < 1e-9)).toBe(true);
      expect(Math.abs(run[0] - run[run.length - 1])).toBeGreaterThan(1e-9);
    }
    // Per changed joint the radius moves on four steps across the five-ring
    // blend window (the zone-edge rings pin the exact edge radii).
    const changed = rings.filter(
      (r, k) => k > 0 && Math.abs(r.r - rings[k - 1].r) > 1e-9,
    ).length;
    expect(changed).toBe(8);
  });
});

describe('vertex-range maps', () => {
  it('partitions the merged buffer by edge, ordered', () => {
    const sides = 5;
    const a = chainGeometry(makeSegs([0.1, 0.08]), sides);
    const b = chainGeometry(makeSegs([0.06, 0.05], 0.15, 30), sides);
    const merged = mergeChains([a, b]);
    partitions(merged.vertRanges, a.vertexCount + b.vertexCount);
    partitions(merged.triRanges, a.triangleCount + b.triangleCount);
    expect(merged.vertRanges.map((r) => r.edgeId)).toEqual([10, 11, 30, 31]);
    expect(merged.triRanges.map((r) => r.edgeId)).toEqual([10, 11, 30, 31]);
    for (const r of merged.triRanges) {
      expect(edgeAtFace(merged.triRanges, r.start)).toBe(r.edgeId);
      expect(edgeAtFace(merged.triRanges, r.start + r.count - 1)).toBe(
        r.edgeId,
      );
    }
    expect(edgeAtFace(merged.triRanges, -1)).toBeUndefined();
    expect(
      edgeAtFace(merged.triRanges, a.triangleCount + b.triangleCount),
    ).toBeUndefined();
  });

  it('fills per-edge colors through the vertex ranges', () => {
    const sides = 5;
    const g = chainGeometry(makeSegs([0.1, 0.07]), sides);
    const merged = mergeChains([g]);
    const red = new THREE.Color(1, 0, 0),
      blue = new THREE.Color(0, 0, 1);
    fillEdgeColors(merged.geometry, merged.vertRanges, (id) =>
      id === 10 ? red : blue,
    );
    const c = merged.geometry.attributes.color;
    expect(c.count).toBe(g.vertexCount);
    const first = merged.vertRanges[0],
      second = merged.vertRanges[1];
    for (let i = first.start; i < first.start + first.count; i++)
      expect(c.getX(i)).toBeCloseTo(1, 6);
    for (let i = second.start; i < second.start + second.count; i++)
      expect(c.getX(i)).toBeCloseTo(0, 6);
  });
});

describe('preview rewrite', () => {
  it('truncates a chain at the cut point and restores exactly', () => {
    const sides = 6,
      segs = makeSegs([0.1, 0.08]);
    const full = chainGeometry(segs, sides);
    const cut = chainGeometry(segs, sides, { edgeId: 11, at: 0.1 });
    const point = segs[1].a.clone().lerp(segs[1].b, 0.1);
    const dir = segs[1].b.clone().sub(segs[1].a).normalize();
    // Rings end at the cut point.
    expect(cut.rings[cut.rings.length - 1].pos.distanceTo(point)).toBeLessThan(
      1e-9,
    );
    expect(cut.rings[cut.rings.length - 1].seg).toBe(1);
    expect(cut.rings[cut.rings.length - 1].r).toBeCloseTo(0.08, 9);
    // Rings of the cut band after the cut are dropped.
    expect(
      cut.rings.filter(
        (r) => r.seg === 1 && r.pos.clone().sub(point).dot(dir) > 1e-9,
      ),
    ).toHaveLength(0);
    expect(cut.vertexCount).toBeLessThan(full.vertexCount);
    // Restoring brings back the original vertex count and positions.
    const back = chainGeometry(segs, sides);
    expect(back.vertexCount).toBe(full.vertexCount);
    expect(Array.from(back.positions)).toEqual(Array.from(full.positions));
  });

  it('keeps later bands in place while dropping cut-band rings', () => {
    const sides = 5,
      segs = makeSegs([0.1, 0.06, 0.09], 0.2);
    const full = chainGeometry(segs, sides);
    const cut = chainGeometry(segs, sides, { edgeId: 11, at: 0.8 });
    const point = segs[1].a.clone().lerp(segs[1].b, 0.8);
    const dir = segs[1].b.clone().sub(segs[1].a).normalize();
    // A ring sits at the cut point, owned by the cut edge.
    const at = cut.rings.filter((r) => r.pos.distanceTo(point) < 1e-9);
    expect(at).toHaveLength(1);
    expect(at[0].seg).toBe(1);
    // Rings after the cut within the cut band are gone...
    expect(
      cut.rings.filter(
        (r) => r.seg === 1 && r.pos.clone().sub(point).dot(dir) > 1e-9,
      ),
    ).toHaveLength(0);
    // ...while the next edge's rings are kept in place.
    const kept = (rs: typeof full.rings) =>
      rs.filter((r) => r.seg === 2).map((r) => r.pos.toArray());
    expect(kept(cut.rings)).toEqual(kept(full.rings));
    // One blend ring lies past the cut; the cut ring and its cap replace it.
    expect(cut.vertexCount).toBe(full.vertexCount + 1);
  });

  it('ends the chain at the cut point when cutting the last edge', () => {
    const sides = 5,
      segs = makeSegs([0.1, 0.08]);
    const cut = chainGeometry(segs, sides, { edgeId: 11, at: 0.3 });
    const point = segs[1].a.clone().lerp(segs[1].b, 0.3);
    expect(cut.rings[cut.rings.length - 1].pos.distanceTo(point)).toBeLessThan(
      1e-9,
    );
    for (const r of cut.rings)
      expect(segs[1].b.distanceTo(r.pos)).toBeGreaterThan(1e-9);
    // Triangle ranges stay consistent with the vertex ranges after a rewrite.
    partitions(cut.vertRanges, cut.vertexCount);
    partitions(cut.triRanges, cut.triangleCount);
    expect(cut.vertRanges.map((r) => r.edgeId)).toEqual(
      cut.triRanges.map((r) => r.edgeId),
    );
  });

  it('keeps the band whole when the cut is past the chain joint', () => {
    // Continuation attached at 0.96 of its parent: the chain band ends at the
    // joint, so a cut at 0.98 lies past it and cannot truncate the band.
    const sides = 5;
    const segs: Seg[] = [
      { id: 10, a: v(0, 0, 0), b: v(0, 1, 0), r: 0.1 },
      { id: 11, a: v(0, 0.96, 0), b: v(0.3, 1.7, 0), r: 0.08 },
    ];
    const full = chainGeometry(segs, sides);
    const cut = chainGeometry(segs, sides, { edgeId: 10, at: 0.98 });
    expect(cut.rings.length).toBe(full.rings.length);
    expect(cut.vertexCount).toBe(full.vertexCount);
    expect(Array.from(cut.positions)).toEqual(Array.from(full.positions));
  });
});

describe('loft cache', () => {
  /** Tip continuation [10, 11] plus a mid-parent side chain [12]. */
  function nodes(): LoftNode[] {
    const root = segNode(10, v(0, 0, 0), v(0, 1, 0), 0.1);
    const tip = segNode(11, v(0, 1, 0), v(0, 2, 0), 0.08);
    const side = segNode(12, v(1, 1, 0), v(2, 1, 0), 0.05, { at: 0.5 });
    attach(root, tip);
    attach(root, side);
    return [root, tip, side];
  }

  /** Position coordinates of one edge's vertex range in a merged geometry. */
  function slice(m: MergedLoft, edgeId: number): number[] {
    const r = m.vertRanges.find((x) => x.edgeId === edgeId)!;
    return Array.from(
      m.geometry.attributes.position.array.slice(
        r.start * 3,
        (r.start + r.count) * 3,
      ),
    );
  }

  it('builds per-edge ranges across chains in order', () => {
    const cache = new LoftCache();
    const merged = cache.build(nodes(), 5);
    partitions(cache.vertRanges, merged.geometry.attributes.position.count);
    partitions(cache.triRanges, merged.geometry.index!.count / 3);
    expect(cache.vertRanges.map((r) => r.edgeId)).toEqual([10, 11, 12]);
    expect(cache.triRanges.map((r) => r.edgeId)).toEqual([10, 11, 12]);
  });

  it('rewrites only the cut chain and restores exactly', () => {
    const cache = new LoftCache();
    const full = cache.build(nodes(), 5);
    // The merged buffers are persistent and rewritten in place: snapshot
    // whatever a test keeps across an applyCut.
    const fullPos = Array.from(full.geometry.attributes.position.array);
    const fullCut = slice(full, 11);
    const fullSide = slice(full, 12);
    const cut = cache.applyCut({ edgeId: 11, at: 0.5 });
    expect(cut).not.toBeNull();
    // One persistent geometry per build; previews never re-merge or reallocate.
    expect(cut!.geometry).toBe(full.geometry);
    // The cut chain's geometry changes; the side chain's is untouched.
    expect(slice(cut!, 11)).not.toEqual(fullCut);
    expect(slice(cut!, 12)).toEqual(fullSide);
    // Restoring brings back the exact base geometry.
    const back = cache.applyCut(null);
    expect(Array.from(back!.geometry.attributes.position.array)).toEqual(
      fullPos,
    );
    expect(slice(back!, 11)).toEqual(fullCut);
    expect(slice(back!, 12)).toEqual(fullSide);
  });

  it('fits a preview that inserts a ring inside the chain reservation', () => {
    // Cut inside the distal gap of the first edge: the cut ring is inserted
    // without dropping a ring, so the preview is one ring (plus its cap
    // centre) larger than the base chain and must still fit the fixed
    // per-chain offsets and restore byte-exact.
    const cache = new LoftCache();
    const full = cache.build(nodes(), 5);
    const fullPos = Array.from(full.geometry.attributes.position.array);
    const fullSide = slice(full, 12);
    const cut = cache.applyCut({ edgeId: 10, at: 0.93 });
    expect(cut).not.toBeNull();
    expect(cut!.geometry.attributes.position.array.length).toBe(fullPos.length);
    expect(slice(cut!, 12)).toEqual(fullSide);
    const back = cache.applyCut(null);
    expect(Array.from(back!.geometry.attributes.position.array)).toEqual(
      fullPos,
    );
  });

  it('skips a rewrite when the preview is unchanged', () => {
    const cache = new LoftCache();
    cache.build(nodes(), 5);
    expect(cache.applyCut({ edgeId: 11, at: 0.5 })).not.toBeNull();
    expect(cache.applyCut({ edgeId: 11, at: 0.5 })).toBeNull();
    expect(cache.applyCut(null)).not.toBeNull();
    expect(cache.applyCut(null)).toBeNull();
  });

  it('draws each chain inside its own vertex block', () => {
    const cache = new LoftCache();
    const merged = cache.build(nodes(), 5);
    // Chain-local indices must be rebased into each chain's slot: every
    // triangle of an edge may only reference vertices inside the block its
    // chain owns (its edges' ranges, reservation slack included).
    const assertBlocks = (m: MergedLoft) => {
      const idx = m.geometry.index!;
      for (const r of m.triRanges) {
        const ids = r.edgeId === 12 ? [12] : [10, 11];
        const rs = ids.map((i) => m.vertRanges.find((x) => x.edgeId === i)!);
        const lo = Math.min(...rs.map((x) => x.start));
        const hi = Math.max(...rs.map((x) => x.start + x.count));
        for (let t = r.start; t < r.start + r.count; t++)
          for (let k = 0; k < 3; k++) {
            const vi = idx.getX(t * 3 + k);
            expect(vi).toBeGreaterThanOrEqual(lo);
            expect(vi).toBeLessThan(hi);
          }
      }
    };
    assertBlocks(merged);
    assertBlocks(cache.applyCut({ edgeId: 11, at: 0.5 })!);
    assertBlocks(cache.applyCut(null)!);
  });
});
