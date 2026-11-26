import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Minimal structural view of a derived `Branch` for chain decomposition. */
export interface ChainNode {
  s: { id: number; at: number; fork: boolean; len: number };
  par?: ChainNode;
  kids: ChainNode[];
}

/** One edge's straight display segment and pipe-model radius. */
export interface Seg {
  id: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}

/** Contiguous vertex or triangle range owned by one edge. */
export interface Range {
  edgeId: number;
  start: number;
  count: number;
}

/** One loft ring: centerline point, radius, owning edge index, transport frame. */
export interface Ring {
  pos: THREE.Vector3;
  r: number;
  owner: number;
  t: THREE.Vector3;
  f: THREE.Vector3;
  b: THREE.Vector3;
}

/** Indexed ring-loft tube for one tip-continuation chain. */
export interface ChainGeometry {
  edgeIds: number[];
  rings: Ring[];
  positions: Float32Array;
  normals: Float32Array;
  index: Uint32Array;
  vertRanges: Range[];
  triRanges: Range[];
  vertexCount: number;
  triangleCount: number;
}

/** One chain's geometry re-merged with its siblings into a single mesh. */
export interface MergedLoft {
  geometry: THREE.BufferGeometry;
  vertRanges: Range[];
  triRanges: Range[];
}

/** Heading-cut preview: truncate the chain at `at` along `edgeId`. */
export interface ChainCut {
  edgeId: number;
  at: number;
}

/** Blend rings either side of a radius-change joint. */
const BLENDS = 2;

const smooth = (x: number) => x * x * (3 - 2 * x);

interface Draft {
  pos: THREE.Vector3;
  r: number;
  owner: number;
  seg: number;
}

interface Frame {
  t: THREE.Vector3;
  f: THREE.Vector3;
  b: THREE.Vector3;
}

interface Run {
  owner: number;
  start: number;
  end: number;
}

/** Ring rewrite result of a heading preview. */
interface Trunc {
  rings: Draft[];
  cutIdx: number;
  cutOwner: number;
}

/** Vertex-buffer layout: ring blocks, cap centres, truncation shift. */
interface Layout {
  vertexCount: number;
  cutIdx: number;
  cutOwner: number;
  cappedCut: boolean;
  cutCenter: number;
  tipCenter: number;
  base: (k: number) => number;
}

/** A child continues its parent's chain through the tip, never across a fork. */
export function isContinuation(parent: ChainNode, child: ChainNode): boolean {
  return !child.s.fork && child.s.at > 0.95;
}

function bestContinuation<T extends ChainNode>(q: T): T | undefined {
  let best: T | undefined;
  for (const k of q.kids as T[]) {
    if (!isContinuation(q, k)) continue;
    if (!best || k.s.len > best.s.len) best = k;
  }
  return best;
}

/**
 * Maximal tip-continuation paths over a parent-before-child edge list. The
 * longer of several tip continuations stays in the chain; the rest root
 * side chains at their own base points.
 */
export function decomposeChains<T extends ChainNode>(
  list: readonly T[],
): T[][] {
  const cont = new Map<T, T>();
  for (const q of list) {
    const best = bestContinuation(q);
    if (best) cont.set(q, best);
  }
  const chains: T[][] = [];
  for (const q of list) {
    if (q.par && cont.get(q.par as T) === q) continue;
    const chain: T[] = [];
    for (let n: T | undefined = q; n; n = cont.get(n)) chain.push(n);
    chains.push(chain);
  }
  return chains;
}

/** Ring list along the chain: joints, blend rings at radius changes, tip. */
function draftRings(segs: readonly Seg[]): {
  drafts: Draft[];
  dirs: THREE.Vector3[];
} {
  const m = segs.length;
  const joints: THREE.Vector3[] = [segs[0].a.clone()];
  for (let i = 1; i < m; i++) joints.push(segs[i].a.clone());
  joints.push(segs[m - 1].b.clone());
  const dirs = joints.map((p, i) =>
    i < m
      ? new THREE.Vector3().subVectors(joints[i + 1], p).normalize()
      : new THREE.Vector3().subVectors(p, joints[i - 1]).normalize(),
  );
  const drafts: Draft[] = [{ pos: joints[0], r: segs[0].r, owner: 0, seg: 0 }];
  for (let i = 0; i < m - 1; i++) {
    const r0 = segs[i].r,
      r1 = segs[i + 1].r,
      at = joints[i + 1];
    const w =
      0.25 * Math.min(at.distanceTo(joints[i]), joints[i + 2].distanceTo(at));
    if (Math.abs(r0 - r1) > 1e-9 && w > 1e-6) {
      // Smoothstep flare across the joint: blend rings either side pin the
      // exact edge radii at the zone edges.
      for (let k = BLENDS; k >= 1; k--) {
        const s = (-w * k) / BLENDS;
        drafts.push({
          pos: at.clone().addScaledVector(dirs[i], s),
          r: r0 + (r1 - r0) * smooth((s + w) / (2 * w)),
          owner: i,
          seg: i,
        });
      }
      drafts.push({
        pos: at.clone(),
        r: (r0 + r1) / 2,
        owner: i + 1,
        seg: i + 1,
      });
      for (let k = 1; k <= BLENDS; k++) {
        const s = (w * k) / BLENDS;
        drafts.push({
          pos: at.clone().addScaledVector(dirs[i + 1], s),
          r: r0 + (r1 - r0) * smooth((s + w) / (2 * w)),
          owner: i + 1,
          seg: i + 1,
        });
      }
    } else {
      drafts.push({ pos: at.clone(), r: r1, owner: i + 1, seg: i + 1 });
    }
  }
  drafts.push({
    pos: joints[m],
    r: segs[m - 1].r,
    owner: m - 1,
    seg: m - 1,
  });
  return { drafts, dirs };
}

/** Rotation-minimizing frames along the ring polyline: minimal rotations only. */
function transport(drafts: readonly Draft[], dirs: readonly THREE.Vector3[]) {
  const first = dirs[drafts[0].seg];
  const ref =
    Math.abs(first.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const f = new THREE.Vector3().crossVectors(first, ref).normalize();
  const frames: Frame[] = [];
  let prev = first;
  for (const d of drafts) {
    const t = dirs[d.seg];
    if (t !== prev) {
      f.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(prev, t));
      prev = t;
    }
    frames.push({
      t: t.clone(),
      f: f.clone(),
      b: new THREE.Vector3().crossVectors(t, f),
    });
  }
  return frames;
}

/** True when the cut lies past the chain band's distal joint. */
function beyondBand(
  drafts: readonly Draft[],
  dirs: readonly THREE.Vector3[],
  c: number,
  point: THREE.Vector3,
) {
  const joint = drafts.find((d) => d.seg > c);
  return !!joint && point.clone().sub(joint.pos).dot(dirs[c]) > 1e-9;
}

/**
 * Heading-preview rewrite: keep the chain up to the cut, drop the cut band's
 * rings past it and leave the later bands in place for the coral overlay. A
 * cut past a surviving continuation's joint lies off the band and leaves it
 * whole (cutIdx -1).
 */
function truncateRings(
  segs: readonly Seg[],
  drafts: readonly Draft[],
  dirs: readonly THREE.Vector3[],
  cut: ChainCut,
): Trunc {
  const c = segs.findIndex((s) => s.id === cut.edgeId);
  if (c < 0) throw new Error(`chainGeometry: no edge ${cut.edgeId} in chain`);
  const at = Math.min(Math.max(cut.at, 1e-4), 1 - 1e-4);
  const point = segs[c].a.clone().lerp(segs[c].b, at);
  if (beyondBand(drafts, dirs, c, point))
    return { rings: drafts.slice(), cutIdx: -1, cutOwner: c };
  const beyond = (d: Draft) =>
    d.seg === c && d.pos.clone().sub(point).dot(dirs[c]) > 1e-9;
  const rings = drafts.filter((d) => !beyond(d));
  const last = rings.reduce((acc, d, k) => (d.seg === c ? k : acc), -1);
  const insert = { pos: point, r: segs[c].r, owner: c, seg: c };
  if (last >= 0 && rings[last].pos.distanceTo(point) <= 1e-7)
    return { rings, cutIdx: last, cutOwner: c };
  rings.splice(last + 1, 0, insert);
  return { rings, cutIdx: last + 1, cutOwner: c };
}

/** Owner runs (one per edge) over the ring list, in chain order. */
function buildRuns(rings: readonly Draft[]): Run[] {
  const runs: Run[] = [];
  for (let k = 0; k < rings.length; k++) {
    const last = runs[runs.length - 1];
    if (last && last.owner === rings[k].owner) last.end = k + 1;
    else runs.push({ owner: rings[k].owner, start: k, end: k + 1 });
  }
  return runs;
}

/**
 * Vertex-buffer layout. A mid-chain cut caps its ring; the cut ring of a
 * terminal cut becomes the chain tip and reuses the tip cap. Ring k's spoke
 * block shifts past the cut cap centre so each edge's range stays contiguous.
 */
function buildLayout(
  n: number,
  sides: number,
  trunc: Trunc | undefined,
  m: number,
): Layout {
  const cutIdx = trunc ? trunc.cutIdx : -1;
  const cutOwner = trunc ? trunc.cutOwner : -1;
  const cappedCut = cutIdx >= 0 && cutOwner < m - 1;
  const vertexCount = n * sides + 2 + (cappedCut ? 1 : 0);
  return {
    vertexCount,
    cutIdx,
    cutOwner,
    cappedCut,
    cutCenter: cappedCut ? 1 + (cutIdx + 1) * sides : -1,
    tipCenter: vertexCount - 1,
    base: (k: number) => 1 + k * sides + (cappedCut && k > cutIdx ? 1 : 0),
  };
}

/** Radial spoke direction on a ring from its transport frame. */
function spoke(f: THREE.Vector3, b: THREE.Vector3, j: number, sides: number) {
  const a = (j * Math.PI * 2) / sides;
  return f.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
}

/** Ring vertices and analytic normals: radial on walls, axial on caps. */
function emitVertices(
  rings: readonly Draft[],
  frames: readonly Frame[],
  lay: Layout,
  sides: number,
) {
  const positions = new Float32Array(lay.vertexCount * 3);
  const normals = new Float32Array(lay.vertexCount * 3);
  const put = (vi: number, p: THREE.Vector3, nrm: THREE.Vector3) => {
    p.toArray(positions, vi * 3);
    nrm.toArray(normals, vi * 3);
  };
  // Root cap centre faces back down the chain.
  put(0, rings[0].pos, frames[0].t.clone().negate());
  for (let k = 0; k < rings.length; k++) {
    const { pos, r } = rings[k];
    const { t, f, b } = frames[k];
    for (let j = 0; j < sides; j++) {
      const radial = spoke(f, b, j, sides);
      put(lay.base(k) + j, pos.clone().addScaledVector(radial, r), radial);
    }
    if (k === lay.cutIdx && lay.cappedCut)
      put(lay.cutCenter, pos.clone(), t.clone());
    if (k === rings.length - 1) put(lay.tipCenter, pos.clone(), t.clone());
  }
  return { positions, normals };
}

/** Cap fan: outward when flip, into the tube when not. */
function pushFan(
  index: number[],
  center: number,
  ringBase: number,
  sides: number,
  flip: boolean,
) {
  for (let j = 0; j < sides; j++) {
    const a = ringBase + j,
      b = ringBase + ((j + 1) % sides);
    if (flip) index.push(center, b, a);
    else index.push(center, a, b);
  }
}

/** Last ring of edge i's band: the cut ring truncates, the tip closes. */
function bandEnd(
  i: number,
  m: number,
  n: number,
  runs: readonly Run[],
  lay: Layout,
) {
  if (i === m - 1) return n - 1;
  if (lay.cappedCut && i === lay.cutOwner) return lay.cutIdx;
  return runs[i + 1].start;
}

/**
 * Triangle layout: root fan, band strips in edge order with the cut fan
 * inside the cut edge's range, tip fan at the end. Returns the index buffer
 * and each band's strip start so triangle ranges stay per edge.
 */
function emitTriangles(
  m: number,
  n: number,
  sides: number,
  runs: readonly Run[],
  lay: Layout,
) {
  const index: number[] = [];
  pushFan(index, 0, lay.base(0), sides, true);
  const stripStart: number[] = [];
  for (let i = 0; i < m; i++) {
    stripStart.push(index.length / 3);
    const end = bandEnd(i, m, n, runs, lay);
    for (let k = runs[i].start; k < end; k++)
      for (let j = 0; j < sides; j++) {
        const a = lay.base(k) + j,
          a2 = lay.base(k) + ((j + 1) % sides),
          c2 = lay.base(k + 1) + j,
          c3 = lay.base(k + 1) + ((j + 1) % sides);
        index.push(a, a2, c2, a2, c3, c2);
      }
    if (lay.cappedCut && i === lay.cutOwner)
      pushFan(index, lay.cutCenter, lay.base(lay.cutIdx), sides, false);
  }
  pushFan(index, lay.tipCenter, lay.base(n - 1), sides, false);
  return { index, stripStart };
}

/** Per-edge vertex and triangle ranges: cap centres join their ring's edge. */
function buildRanges(
  segs: readonly Seg[],
  runs: readonly Run[],
  lay: Layout,
  stripStart: readonly number[],
  total: number,
) {
  const m = segs.length;
  const triRanges: Range[] = [];
  const vertRanges: Range[] = [];
  for (let i = 0; i < m; i++) {
    const t0 = i === 0 ? 0 : stripStart[i],
      t1 = i + 1 < m ? stripStart[i + 1] : total;
    triRanges.push({ edgeId: segs[i].id, start: t0, count: t1 - t0 });
    const v0 = i === 0 ? 0 : lay.base(runs[i].start),
      v1 = i === m - 1 ? lay.vertexCount : lay.base(runs[i].end);
    vertRanges.push({ edgeId: segs[i].id, start: v0, count: v1 - v0 });
  }
  return { triRanges, vertRanges };
}

/**
 * Ring-loft tube along one chain: parallel transport frames, analytic radial
 * normals, smoothstep blend flares, welded rings, capped ends. With `cut` the
 * chain is rewritten for a heading preview: the cut edge's band truncates at
 * the cut fraction and later bands stay in place for the coral overlay.
 */
export function chainGeometry(
  segs: readonly Seg[],
  sides: number,
  cut?: ChainCut,
): ChainGeometry {
  if (!segs.length) throw new Error('chainGeometry: empty chain');
  const m = segs.length;
  const { drafts, dirs } = draftRings(segs);
  const trunc = cut ? truncateRings(segs, drafts, dirs, cut) : undefined;
  const rings = trunc ? trunc.rings : drafts;
  const frames = transport(rings, dirs);
  const runs = buildRuns(rings);
  const lay = buildLayout(rings.length, sides, trunc, m);
  const { positions, normals } = emitVertices(rings, frames, lay, sides);
  const { index, stripStart } = emitTriangles(
    m,
    rings.length,
    sides,
    runs,
    lay,
  );
  const total = index.length / 3;
  const { triRanges, vertRanges } = buildRanges(
    segs,
    runs,
    lay,
    stripStart,
    total,
  );
  return {
    edgeIds: segs.map((s) => s.id),
    rings: rings.map((d, k) => ({
      pos: d.pos,
      r: d.r,
      owner: d.owner,
      t: frames[k].t,
      f: frames[k].f,
      b: frames[k].b,
    })),
    positions,
    normals,
    index: new Uint32Array(index),
    vertRanges,
    triRanges,
    vertexCount: lay.vertexCount,
    triangleCount: total,
  };
}

/** Merge per-chain lofts into one draw call with merged edge-range maps. */
export function mergeChains(chains: readonly ChainGeometry[]): MergedLoft {
  if (!chains.length)
    return {
      geometry: new THREE.BufferGeometry(),
      vertRanges: [],
      triRanges: [],
    };
  const geometries = chains.map((c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(c.normals, 3));
    g.setIndex(new THREE.BufferAttribute(c.index, 1));
    return g;
  });
  const geometry =
    mergeGeometries(geometries, false) ?? new THREE.BufferGeometry();
  for (const g of geometries) g.dispose();
  const vertRanges: Range[] = [],
    triRanges: Range[] = [];
  let vo = 0,
    to = 0;
  for (const c of chains) {
    for (const r of c.vertRanges)
      vertRanges.push({
        edgeId: r.edgeId,
        start: r.start + vo,
        count: r.count,
      });
    for (const r of c.triRanges)
      triRanges.push({ edgeId: r.edgeId, start: r.start + to, count: r.count });
    vo += c.vertexCount;
    to += c.triangleCount;
  }
  return { geometry, vertRanges, triRanges };
}

/** Resolve a raycast `faceIndex` to its owning edge id. */
export function edgeAtFace(
  triRanges: readonly Range[],
  faceIndex: number,
): number | undefined {
  for (const r of triRanges)
    if (faceIndex >= r.start && faceIndex < r.start + r.count) return r.edgeId;
  return undefined;
}

/** Paint per-edge colors through the vertex-range map onto a merged geometry. */
export function fillEdgeColors(
  geometry: THREE.BufferGeometry,
  vertRanges: readonly Range[],
  colorOf: (edgeId: number) => THREE.Color,
): void {
  const count = geometry.attributes.position.count;
  let attr = geometry.getAttribute('color') as
    THREE.BufferAttribute | undefined;
  if (!attr || attr.count !== count) {
    attr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', attr);
  }
  const arr = attr.array as Float32Array;
  for (const r of vertRanges) {
    const c = colorOf(r.edgeId);
    for (let i = r.start; i < r.start + r.count; i++) c.toArray(arr, i * 3);
  }
  attr.needsUpdate = true;
}
