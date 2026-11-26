import * as THREE from 'three';
import { $, clamp, GOLD, TAU, pct } from '../util.js';
import { noise } from '../sim/random.js';
import { exposures, sunDir } from '../sim/light.js';
import type { TreeSpec } from '../sim/axes.js';
import type { Branch, Caps, CutPlan, Model, TreeState } from '../sim/types.js';
import {
  atPoint,
  axisZ,
  barkMat,
  col,
  coral,
  cutMat,
  diskG,
  fruitGeometry,
  fruitMat,
  guideInner,
  guideMat,
  heatA,
  heatB,
  heatC,
  leafGeometry,
  leafMat,
  loftMat,
  obj,
  planeMat,
  ringG,
  ringMat,
  stemMat,
  stickMatrix,
} from './geometry.js';
import type { ChainCut } from './loft.js';
import { fillEdgeColors, LoftCache, type MergedLoft } from './loft-cache.js';
import type { Stage } from './scene.js';

/** Flat default tone of an instanced sprout stick. */
const SPROUT_TONE = new THREE.Color(0x796240);

export interface RenderCtx {
  t: TreeState;
  m: Model;
  spec: TreeSpec;
  caps: Caps;
  hour: number;
  overlay: boolean;
  showLeaves: boolean;
  showFruit: boolean;
  selected: CutPlan | null;
}

/** One instanced sprout stick; main limbs live in the merged ring loft. */
export interface Piece {
  q: Branch;
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
  at: number;
}

/** Tree display: merged ring-loft wood, sprouts, foliage, fruit, markers. */
export class TreeMesh {
  wood: THREE.Mesh | null = null;
  sprouts: THREE.InstancedMesh | null = null;
  foliage: THREE.InstancedMesh | null = null;
  fruitMesh: THREE.InstancedMesh | null = null;
  stems: THREE.InstancedMesh | null = null;
  extra: THREE.Mesh | null = null;
  pieces: Piece[] = [];
  private cache = new LoftCache();
  private woodG!: THREE.CylinderGeometry;
  private leafG!: THREE.BufferGeometry;
  private fruitG!: THREE.BufferGeometry;
  private baseColors = new Float32Array();
  private edgeColors = new Float32Array();
  private instant: Float32Array = new Float32Array();
  private byId: ReadonlyMap<number, Branch> = new Map();

  constructor(private readonly stage: Stage) {}

  /** Current merged loft and its per-edge range maps. */
  get merged(): MergedLoft | null {
    return this.cache.merged;
  }

  private disposeInstances() {
    for (const m of [this.sprouts, this.foliage, this.fruitMesh, this.stems])
      if (m) {
        this.stage.treeGroup.remove(m);
        m.dispose();
      }
    if (this.wood) {
      this.stage.treeGroup.remove(this.wood);
      this.wood.geometry.dispose();
    }
    if (this.extra) this.stage.treeGroup.remove(this.extra);
    this.wood = this.sprouts = this.foliage = null;
    this.fruitMesh = this.stems = this.extra = null;
  }

  resetGeometries(spec: TreeSpec, caps: Caps) {
    this.disposeInstances();
    for (const g of [this.woodG, this.leafG, this.fruitG]) if (g) g.dispose();
    const render = spec.species.render;
    this.woodG = new THREE.CylinderGeometry(0.72, 1, 1, caps.sides, 1, false);
    this.leafG = leafGeometry(render, caps);
    this.fruitG = fruitGeometry(render, caps);
    fruitMat.roughness = render.fruitRoughness;
  }

  private instances(g: THREE.BufferGeometry, m: THREE.Material, count: number) {
    const mesh = new THREE.InstancedMesh(g, m, Math.max(1, count));
    mesh.count = count;
    this.stage.treeGroup.add(mesh);
    return mesh;
  }

  /** One welded ring-loft chain per tip-continuation path of main limbs. */
  private buildLoft(m: Model, caps: Caps) {
    this.byId = m.map;
    const merged = this.cache.build(m.list, caps.sides);
    this.edgeColors = new Float32Array(m.list.length * 3);
    this.wood = new THREE.Mesh(merged.geometry, loftMat);
    this.wood.geometry.computeBoundingSphere();
    this.stage.treeGroup.add(this.wood);
  }

  rebuild(ctx: RenderCtx) {
    const { t, m, spec, caps, showLeaves, showFruit } = ctx;
    this.disposeInstances();
    this.pieces = [];
    this.buildLoft(m, caps);
    this.buildSprouts(m, caps);
    this.buildFoliage(t, m, spec, caps, showLeaves);
    this.buildFruit(m, spec, showFruit);
    this.stage.contact.scale.setScalar(Math.max(0.85, m.spread * 1.1));
    this.updateExposure(ctx);
    this.stage.invalidate();
  }

  /** One instanced bud stub per bud, within the whole-tree segment budget. */
  private buildSprouts(m: Model, caps: Caps) {
    // Main limbs consume one budget slot each; bud stubs share the rest.
    const budget = caps.max - m.list.length;
    for (const q of m.list)
      for (const b of q.buds) {
        if (this.pieces.length >= budget) break;
        const a = atPoint(q, b.at),
          d = new THREE.Vector3(
            Math.cos(b.az),
            0.58,
            Math.sin(b.az),
          ).normalize();
        this.pieces.push({
          q,
          a,
          b: a.clone().addScaledVector(d, q.r + 0.025 + b.len * 0.5),
          r: Math.min(0.008, q.r * 0.52),
          at: b.at,
        });
      }
    this.sprouts = this.instances(this.woodG, barkMat, this.pieces.length);
    this.baseColors = new Float32Array(this.pieces.length * 3);
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      this.sprouts.setMatrixAt(i, stickMatrix(p.a, p.b, p.r));
    }
    this.sprouts.instanceMatrix.needsUpdate = true;
    this.sprouts.computeBoundingSphere();
  }

  /**
   * Choose clusters uniformly across shoot wood if the GPU budget is full,
   * then place them by noise-driven station, azimuth, tilt, scale and tint.
   */
  private buildFoliage(
    t: TreeState,
    m: Model,
    spec: TreeSpec,
    caps: Caps,
    showLeaves: boolean,
  ) {
    const sites: [Branch, number, number][] = [];
    let requested = 0;
    for (const q of m.list) {
      if (q.s.dead) continue;
      const k = Math.max(
        0,
        Math.round(
          caps.density *
            (q.age <= 1
              ? 3 + q.s.len * 13
              : q.age <= 4
                ? 1 + q.s.len * 5
                : q.buds.length * 0.7),
        ),
      );
      for (let j = 0; j < k; j++) {
        requested++;
        const item: [Branch, number, number] = [q, j, k];
        if (sites.length < caps.clusters) sites.push(item);
        else {
          const idx = Math.floor(noise(t.seed, q.s.id, 570 + j) * requested);
          if (idx < caps.clusters) sites[idx] = item;
        }
      }
    }
    this.foliage = this.instances(this.leafG, leafMat, sites.length);
    const leafHue = spec.species.render.leafHue;
    const n = (q: Branch, k: number) => noise(t.seed, q.s.id, k);
    for (let i = 0; i < sites.length; i++) {
      const [q, j, k] = sites[i],
        r = (s: number) => n(q, 600 + j * 8 + s);
      const station =
        q.age > 2 && q.buds.length
          ? q.buds[j % q.buds.length].at
          : clamp((j + 0.25 + 0.48 * r(0)) / k);
      const az =
        (q.buds.length && q.age > 2
          ? q.buds[j % q.buds.length].az
          : j * GOLD + TAU * n(q, 541)) +
        0.55 * r(1);
      const off = q.r + (q.age > 1 ? 0.029 : 0.015);
      obj.position.copy(q.a).lerp(q.b, station);
      obj.position.x += off * Math.cos(az);
      obj.position.z += off * Math.sin(az);
      obj.rotation.set((r(2) - 0.5) * 1.65, az, (r(3) - 0.5) * 1.5);
      obj.scale.setScalar((0.78 + 0.41 * r(4)) * (0.84 + q.light * 0.23));
      obj.updateMatrix();
      this.foliage.setMatrixAt(i, obj.matrix);
      col.setHSL(
        leafHue + (r(5) - 0.5) * 0.053,
        0.37 + 0.17 * r(6),
        0.19 + 0.108 * r(7) + 0.063 * q.light,
        THREE.SRGBColorSpace,
      );
      this.foliage.setColorAt(i, col);
    }
    this.foliage.visible = showLeaves;
    this.foliage.computeBoundingSphere();
  }

  /** Fruit and stem instances, tinted by the habit's shade palette. */
  private buildFruit(m: Model, spec: TreeSpec, showFruit: boolean) {
    this.fruitMesh = this.instances(this.fruitG, fruitMat, m.fruitCount);
    this.stems = this.instances(this.woodG, stemMat, m.fruitCount);
    let ix = 0;
    const stem = spec.species.render.fruitStem;
    for (const q of m.list)
      for (const f of q.fruits) {
        const rad = f.d * 0.5;
        const anchor = atPoint(q, f.at),
          side = new THREE.Vector3(Math.cos(f.az), 0, Math.sin(f.az));
        anchor.addScaledVector(side, q.r * 0.8 + (f.spur ? 0.03 : 0));
        anchor.y += f.spur ? 0.019 : 0;
        const end = anchor
          .clone()
          .addScaledVector(
            side,
            stem.sideConst + stem.sideRadMul * rad + 0.009,
          );
        end.y -= stem.dropConst + stem.dropShade * f.shade;
        this.stems.setMatrixAt(ix, stickMatrix(anchor, end, stem.width, false));
        obj.position.copy(end);
        obj.position.y -= rad * stem.hang;
        obj.rotation.set(0.08 * Math.cos(f.az), f.az, 0.1 * Math.sin(f.az));
        obj.scale.set(rad, rad, rad);
        obj.updateMatrix();
        this.fruitMesh.setMatrixAt(ix, obj.matrix);
        // Linear palette in (exposure, shade); evaluated in fixed term order.
        const pal =
          spec.habit.render.fruitPalettes.find(
            (p) => p.maxShade === undefined || f.shade < p.maxShade,
          ) ?? spec.habit.render.fruitPalettes[0];
        col.setHSL(
          pal.h.base +
            pal.h.oneMinusEx * (1 - f.ex) +
            pal.h.ex * f.ex +
            pal.h.shade * f.shade,
          pal.s.base + pal.s.ex * f.ex,
          pal.l.base + pal.l.ex * f.ex + pal.l.shade * f.shade + pal.l.boost,
          THREE.SRGBColorSpace,
        );
        this.fruitMesh.setColorAt(ix++, col);
      }
    this.fruitMesh.visible = this.stems.visible = showFruit;
    this.fruitMesh.computeBoundingSphere();
    this.stems.computeBoundingSphere();
  }

  /** Exposure heat palette in place of bark tone. */
  private heatColor(e: number) {
    if (e < 0.48) col.copy(heatA).lerp(heatB, e / 0.48);
    else col.copy(heatB).lerp(heatC, (e - 0.48) / 0.52);
  }

  /** Heat overlay, dead grey or the caller's default tone, resolved in `col`. */
  private tone(q: Branch, e: number, overlay: boolean, fallback: THREE.Color) {
    if (overlay) this.heatColor(e);
    else if (q.s.dead) col.setHex(0x817f71);
    else col.copy(fallback);
    return col;
  }

  updateExposure(ctx: RenderCtx) {
    const { t, m, hour, overlay, selected } = ctx;
    const n = (q: Branch, k: number) => noise(t.seed, q.s.id, k);
    this.instant = exposures(m.list, sunDir(hour));
    let avg = 0;
    for (const x of this.instant) avg += x;
    $('lightReading').textContent = '· mean ' + pct(avg / this.instant.length);
    const bark = new THREE.Color();
    for (const q of m.list) {
      bark.setHSL(
        0.063 + 0.014 * n(q, 90),
        0.26 + 0.15 * Math.min(1, q.age / 4),
        0.254 + 0.085 * n(q, 91) + 0.04 * (q.age === 0 ? 1 : 0),
        THREE.SRGBColorSpace,
      );
      this.tone(q, this.instant[q.i], overlay, bark).toArray(
        this.edgeColors,
        q.i * 3,
      );
    }
    for (let i = 0; i < this.pieces.length; i++) {
      const { q } = this.pieces[i];
      this.tone(q, this.instant[q.i], overlay, SPROUT_TONE).toArray(
        this.baseColors,
        i * 3,
      );
    }
    this.paintWood(selected);
  }

  private removedPiece(p: Piece, selected: CutPlan | null) {
    return (
      selected &&
      (selected.ids.has(p.q.s.id) ||
        (selected.id === p.q.s.id && p.at >= selected.at))
    );
  }

  /** Heading previews rewrite geometry; collar cuts only recolor. */
  private previewCut(selected: CutPlan | null): ChainCut | null {
    return selected && selected.at > 0
      ? { edgeId: selected.id, at: selected.at }
      : null;
  }

  /** Bark, dead or coral tone for one main edge through the range map. */
  private edgeColor(id: number, selected: CutPlan | null) {
    if (selected && selected.ids.has(id)) return coral;
    const q = this.byId.get(id);
    if (q) col.fromArray(this.edgeColors, q.i * 3);
    return col;
  }

  /** Coral stub over the dropped rings of a heading cut. */
  private addStub(selected: CutPlan | null) {
    if (!selected || selected.at <= 0) return;
    const q = this.byId.get(selected.id);
    if (!q) return;
    const end = atPoint(q, selected.at);
    this.extra = new THREE.Mesh(this.woodG, cutMat);
    this.extra.matrixAutoUpdate = false;
    this.extra.matrix.copy(
      stickMatrix(end, q.b, q.r * (1 - 0.28 * selected.at)),
    );
    this.stage.treeGroup.add(this.extra);
  }

  private paintSprouts(selected: CutPlan | null) {
    if (!this.sprouts) return;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      col.fromArray(this.baseColors, i * 3);
      if (this.removedPiece(p, selected)) col.copy(coral);
      this.sprouts.setColorAt(i, col);
    }
    if (this.sprouts.instanceColor)
      this.sprouts.instanceColor.needsUpdate = true;
  }

  paintWood(selected: CutPlan | null) {
    if (!this.wood || !this.merged) return;
    if (this.extra) {
      this.stage.treeGroup.remove(this.extra);
      this.extra = null;
    }
    const merged = this.cache.applyCut(this.previewCut(selected));
    if (merged) {
      // The cache rewrites persistent buffers in place; swap only when a
      // rebuild has handed us a new geometry since the last paint.
      if (this.wood.geometry !== merged.geometry) {
        this.wood.geometry.dispose();
        this.wood.geometry = merged.geometry;
      }
      this.wood.geometry.computeBoundingSphere();
    }
    // Thinning and heading removals recolor through the vertex-range map;
    // a heading preview rewrites only the cut chain's geometry.
    fillEdgeColors(this.wood.geometry, this.cache.vertRanges, (id) =>
      this.edgeColor(id, selected),
    );
    this.addStub(selected);
    this.paintSprouts(selected);
    this.stage.invalidate();
  }

  private mark(q: Branch, at: number, primary: boolean, m: Model) {
    const p = atPoint(q, at),
      r = Math.max(q.r * 1.75, clamp(m.height * 0.018, 0.029, 0.11));
    const ring = new THREE.Mesh(ringG, primary ? ringMat : guideMat);
    ring.position.copy(p);
    ring.scale.setScalar(primary ? r * 1.22 : r);
    ring.renderOrder = primary ? 9 : 6;
    this.stage.markers.add(ring);
    this.stage.billboards.push(ring);
    if (primary) {
      const disk = new THREE.Mesh(diskG, planeMat);
      disk.position.copy(p);
      disk.scale.setScalar(q.r * 1.32);
      disk.quaternion.setFromUnitVectors(axisZ, q.dir);
      this.stage.markers.add(disk);
    } else {
      const inner = new THREE.Mesh(ringG, guideInner);
      inner.scale.setScalar(ring.scale.x * 0.72);
      inner.position.copy(p);
      inner.renderOrder = 7;
      this.stage.markers.add(inner);
      this.stage.billboards.push(inner);
    }
  }

  drawMarkers(
    recs: { q: Branch }[],
    learning: boolean,
    selected: CutPlan | null,
    m: Model,
  ) {
    this.stage.markers.clear();
    this.stage.billboards.length = 0;
    if (learning)
      for (const r of recs)
        if (!selected || !selected.ids.has(r.q.s.id))
          this.mark(r.q, 0, false, m);
    if (selected) this.mark(m.map.get(selected.id)!, selected.at, true, m);
    this.stage.invalidate();
  }
}
