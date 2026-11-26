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

function sameCut(a: ChainCut | null, b: ChainCut | null): boolean {
  return (
    a === b ||
    (a !== null && b !== null && a.edgeId === b.edgeId && a.at === b.at)
  );
}

/**
 * Chain-geometry cache behind the merged main-limb loft: builds every chain
 * once and rewrites only the chain a heading preview touches. The only state
 * in the loft modules lives here. Ownership: every `MergedLoft.geometry` this
 * cache hands out is allocated here and disposed by `TreeMesh`, which swaps
 * and disposes `wood.geometry` on each rewrite and on rebuild.
 */
export class LoftCache {
  private chainSegs: Seg[][] = [];
  private baseGeoms: ChainGeometry[] = [];
  private chainGeoms: ChainGeometry[] = [];
  private chainOf = new Map<number, number>();
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
    this.chainGeoms = this.baseGeoms.slice();
    this.chainOf = new Map();
    chains.forEach((chain, i) => {
      for (const q of chain) this.chainOf.set(q.s.id, i);
    });
    this.appliedCut = null;
    return this.remerge();
  }

  /**
   * Heading-preview rewrite: truncate the cut chain at `cut`, leave the rest
   * in place and restore every chain when `cut` is null. Returns the merged
   * geometry, or null when `cut` is the applied preview (nothing rewritten).
   */
  applyCut(cut: ChainCut | null): MergedLoft | null {
    if (sameCut(cut, this.appliedCut)) return null;
    const touched = new Set<number>();
    for (const c of [this.appliedCut, cut]) {
      const i = c ? this.chainOf.get(c.edgeId) : undefined;
      if (i !== undefined) touched.add(i);
    }
    for (const k of touched)
      this.chainGeoms[k] =
        cut && this.chainOf.get(cut.edgeId) === k
          ? chainGeometry(this.chainSegs[k], this.sides, cut)
          : this.baseGeoms[k];
    this.appliedCut = cut;
    return this.remerge();
  }

  /** Per-edge vertex ranges of the current merged geometry. */
  get vertRanges(): readonly Range[] {
    return this.merged ? this.merged.vertRanges : [];
  }

  /** Per-edge triangle ranges of the current merged geometry. */
  get triRanges(): readonly Range[] {
    return this.merged ? this.merged.triRanges : [];
  }

  private remerge(): MergedLoft {
    this.merged = mergeChains(this.chainGeoms);
    return this.merged;
  }
}
