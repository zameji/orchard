import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  chainGeometry,
  decomposeChains,
  type ChainCut,
  type ChainGeometry,
  type LoftNode,
  type Range,
  type Seg,
} from './loft.js';

/**
 * One chain's geometry re-merged with its siblings into a single mesh.
 * `vertRanges`/`triRanges` partition the merged buffers exactly, in edge
 * order; `Range.edgeId` values are global tree edge ids.
 */
export interface MergedLoft {
  geometry: THREE.BufferGeometry;
  vertRanges: Range[];
  triRanges: Range[];
}

/** Copy ranges with each start shifted by `off`. */
function offsetRanges(ranges: readonly Range[], off: number): Range[] {
  return ranges.map((x) => ({
    edgeId: x.edgeId,
    start: x.start + off,
    count: x.count,
  }));
}

/**
 * Merge per-chain lofts into one draw call with merged edge-range maps. With
 * no chains the result is the documented empty-MergedLoft contract: empty
 * range maps and a geometry with no attributes. A merge that cannot join the
 * chain geometries throws here instead of failing later in fillEdgeColors.
 */
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
  const geometry = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!geometry) throw new Error('mergeChains: merge failed');
  const vertRanges: Range[] = [],
    triRanges: Range[] = [];
  let vo = 0,
    to = 0;
  for (const c of chains) {
    vertRanges.push(...offsetRanges(c.vertRanges, vo));
    triRanges.push(...offsetRanges(c.triRanges, to));
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

function sameCut(a: ChainCut | null, b: ChainCut | null): boolean {
  return (
    a === b ||
    (a !== null && b !== null && a.edgeId === b.edgeId && a.at === b.at)
  );
}

/** Per-chain reservation inside the persistent merged buffers. */
interface Region {
  vertStart: number;
  vertCap: number;
  triStart: number;
  triCap: number;
}

/**
 * Chain-geometry cache behind the merged main-limb loft: builds every chain
 * once and rewrites only the chain a heading preview touches. The only state
 * in the loft modules lives here.
 *
 * Ownership and aliasing: `build` allocates the merged geometry and its
 * persistent buffers once; `TreeMesh` disposes that geometry on rebuild.
 * `applyCut` copies only the touched chains' bytes into their fixed
 * per-chain slots and never reallocates, so a returned `MergedLoft` aliases
 * live buffers — callers snapshot any values they keep across a rewrite.
 */
export class LoftCache {
  private chainSegs: Seg[][] = [];
  private baseGeoms: ChainGeometry[] = [];
  private chainOf = new Map<number, number>();
  private regions: Region[] = [];
  private chainVertRanges: Range[][] = [];
  private chainTriRanges: Range[][] = [];
  private positions = new Float32Array();
  private normals = new Float32Array();
  private index = new Uint32Array();
  private geometry: THREE.BufferGeometry | null = null;
  private appliedCut: ChainCut | null = null;
  private sides = 6;
  merged: MergedLoft | null = null;

  /** Full geometry for every chain of `list`, replacing any preview. */
  build(list: readonly LoftNode[], sides: number): MergedLoft {
    this.sides = sides;
    const chains = decomposeChains(list);
    this.chainSegs = chains.map((chain) =>
      chain.map((q) => ({ id: q.s.id, a: q.a, b: q.b, r: q.r })),
    );
    this.baseGeoms = this.chainSegs.map((s) => chainGeometry(s, this.sides));
    this.chainOf = new Map();
    chains.forEach((chain, i) => {
      for (const q of chain) this.chainOf.set(q.s.id, i);
    });
    // Fixed per-chain slots sized for the worst preview rewrite: truncation
    // drops every band ring past the cut when it inserts a cut ring, so a
    // rewrite gains at most one ring and one cap centre on the base geometry
    // (see the insert case of `truncateRings`). Slack is folded into the
    // chain's last edge range and kept invisible in `writeChain`.
    let vo = 0,
      to = 0;
    this.regions = this.baseGeoms.map((g) => {
      const region: Region = {
        vertStart: vo,
        vertCap: g.vertexCount + this.sides + 1,
        triStart: to,
        triCap: g.triangleCount + this.sides,
      };
      vo += region.vertCap;
      to += region.triCap;
      return region;
    });
    this.positions = new Float32Array(vo * 3);
    this.normals = new Float32Array(vo * 3);
    this.index = new Uint32Array(to * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(this.index, 1));
    this.geometry = geometry;
    this.chainVertRanges = [];
    this.chainTriRanges = [];
    for (let k = 0; k < this.baseGeoms.length; k++)
      this.writeChain(k, this.baseGeoms[k]);
    this.appliedCut = null;
    return this.rebuildRanges();
  }

  /**
   * Heading-preview rewrite: truncate the cut chain at `cut`, leave the rest
   * in place and restore every chain when `cut` is null. Copies bytes for the
   * touched chains only. Returns the merged geometry, or null when `cut` is
   * the applied preview (nothing rewritten).
   */
  applyCut(cut: ChainCut | null): MergedLoft | null {
    if (sameCut(cut, this.appliedCut)) return null;
    const touched = new Set<number>();
    for (const c of [this.appliedCut, cut]) {
      const i = c ? this.chainOf.get(c.edgeId) : undefined;
      if (i !== undefined) touched.add(i);
    }
    for (const k of touched)
      this.writeChain(
        k,
        cut && this.chainOf.get(cut.edgeId) === k
          ? chainGeometry(this.chainSegs[k], this.sides, cut)
          : this.baseGeoms[k],
      );
    this.appliedCut = cut;
    return this.rebuildRanges();
  }

  /** Per-edge vertex ranges of the current merged geometry. */
  get vertRanges(): readonly Range[] {
    return this.merged ? this.merged.vertRanges : [];
  }

  /** Per-edge triangle ranges of the current merged geometry. */
  get triRanges(): readonly Range[] {
    return this.merged ? this.merged.triRanges : [];
  }

  /** Copy one chain's bytes into its slot; slack stays degenerate and invisible. */
  private writeChain(k: number, g: ChainGeometry): void {
    const r = this.regions[k];
    if (g.vertexCount > r.vertCap || g.triangleCount > r.triCap)
      throw new Error(`LoftCache: chain ${k} overflowed its reservation`);
    this.positions.set(g.positions, r.vertStart * 3);
    this.normals.set(g.normals, r.vertStart * 3);
    // Chain geometry indexes from its own vertex 0: rebase every index into
    // the chain's slot, or its triangles draw over earlier chains.
    const at = r.triStart * 3;
    for (let i = 0; i < g.index.length; i++)
      this.index[at + i] = g.index[i] + r.vertStart;
    const vend = (r.vertStart + r.vertCap) * 3,
      gend = (r.vertStart + g.vertexCount) * 3;
    this.positions.fill(0, gend, vend);
    this.normals.fill(0, gend, vend);
    // Slack triangles collapse onto the chain's first vertex — degenerate
    // and never picked.
    this.index.fill(
      r.vertStart,
      (r.triStart + g.triangleCount) * 3,
      (r.triStart + r.triCap) * 3,
    );
    // Ranges cover the whole slot: the slack joins the chain's last edge so
    // the merged ranges keep partitioning the buffer exactly, and the tail
    // triangles reference a single vertex and are never picked.
    const vertRanges = offsetRanges(g.vertRanges, r.vertStart);
    const triRanges = offsetRanges(g.triRanges, r.triStart);
    vertRanges[vertRanges.length - 1].count += r.vertCap - g.vertexCount;
    triRanges[triRanges.length - 1].count += r.triCap - g.triangleCount;
    this.chainVertRanges[k] = vertRanges;
    this.chainTriRanges[k] = triRanges;
    if (this.geometry) {
      this.geometry.getAttribute('position').needsUpdate = true;
      this.geometry.getAttribute('normal').needsUpdate = true;
      this.geometry.getIndex()!.needsUpdate = true;
    }
  }

  /** Fresh range maps over the persistent buffers. */
  private rebuildRanges(): MergedLoft {
    this.merged = {
      geometry: this.geometry!,
      vertRanges: this.chainVertRanges.flat(),
      triRanges: this.chainTriRanges.flat(),
    };
    return this.merged;
  }
}
