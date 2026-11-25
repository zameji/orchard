import * as THREE from 'three';
import { $, clamp, GOLD, TAU, pct } from '../util.js';
import { noise } from '../sim/random.js';
import { exposures, sunDir } from '../sim/light.js';
import type { TreeSpec } from '../sim/axes.js';
import type {
  Branch,
  Caps,
  CutPlan,
  Model,
  TreeState,
} from '../sim/types.js';
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
  obj,
  planeMat,
  ringG,
  ringMat,
  stemMat,
  stickMatrix,
} from './geometry.js';
import type { Stage } from './scene.js';

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

export interface Piece {
  q: Branch;
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
  main: boolean;
  at: number;
}

/** Instanced tree display: wood, foliage, fruit, cut preview, markers. */
export class TreeMesh {
  wood: THREE.InstancedMesh | null = null;
  foliage: THREE.InstancedMesh | null = null;
  fruitMesh: THREE.InstancedMesh | null = null;
  stems: THREE.InstancedMesh | null = null;
  extra: THREE.Mesh | null = null;
  pieces: Piece[] = [];
  private woodG!: THREE.CylinderGeometry;
  private leafG!: THREE.BufferGeometry;
  private fruitG!: THREE.BufferGeometry;
  private baseColors = new Float32Array();
  private instant: Float32Array = new Float32Array();

  constructor(private readonly stage: Stage) {}

  private disposeInstances() {
    for (const m of [this.wood, this.foliage, this.fruitMesh, this.stems])
      if (m) {
        this.stage.treeGroup.remove(m);
        m.dispose();
      }
    if (this.extra) this.stage.treeGroup.remove(this.extra);
    this.wood = this.foliage = this.fruitMesh = this.stems = this.extra = null;
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

  rebuild(ctx: RenderCtx) {
    const { t, m, spec, caps, showLeaves, showFruit } = ctx;
    this.disposeInstances();
    this.pieces = [];
    for (const q of m.list)
      this.pieces.push({ q, a: q.a, b: q.b, r: q.r, main: true, at: 0 });
    for (const q of m.list)
      for (const b of q.buds) {
        if (this.pieces.length >= caps.max) break;
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
          main: false,
          at: b.at,
        });
      }
    this.wood = this.instances(this.woodG, barkMat, this.pieces.length);
    this.baseColors = new Float32Array(this.pieces.length * 3);
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      this.wood.setMatrixAt(i, stickMatrix(p.a, p.b, p.r));
    }
    this.wood.instanceMatrix.needsUpdate = true;
    this.wood.computeBoundingSphere();
    // Choose clusters uniformly across shoot wood if the GPU budget is full.
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
          .addScaledVector(side, stem.sideConst + stem.sideRadMul * rad + 0.009);
        end.y -= stem.dropConst + stem.dropShade * f.shade;
        this.stems.setMatrixAt(
          ix,
          stickMatrix(anchor, end, stem.width, false),
        );
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
          pal.l.base +
            pal.l.ex * f.ex +
            pal.l.shade * f.shade +
            pal.l.boost,
          THREE.SRGBColorSpace,
        );
        this.fruitMesh.setColorAt(ix++, col);
      }
    this.fruitMesh.visible = this.stems.visible = showFruit;
    this.fruitMesh.computeBoundingSphere();
    this.stems.computeBoundingSphere();
    this.stage.contact.scale.setScalar(Math.max(0.85, m.spread * 1.1));
    this.updateExposure(ctx);
    this.stage.invalidate();
  }

  updateExposure(ctx: RenderCtx) {
    const { t, m, hour, overlay, selected } = ctx;
    const n = (q: Branch, k: number) => noise(t.seed, q.s.id, k);
    this.instant = exposures(m.list, sunDir(hour));
    let avg = 0;
    for (const x of this.instant) avg += x;
    $('lightReading').textContent = '· mean ' + pct(avg / this.instant.length);
    for (let i = 0; i < this.pieces.length; i++) {
      const { q, main } = this.pieces[i],
        e = this.instant[q.i];
      if (overlay) {
        if (e < 0.48) col.copy(heatA).lerp(heatB, e / 0.48);
        else col.copy(heatB).lerp(heatC, (e - 0.48) / 0.52);
      } else if (q.s.dead) col.setHex(0x817f71);
      else if (!main) col.setHex(0x796240);
      else
        col.setHSL(
          0.063 + 0.014 * n(q, 90),
          0.26 + 0.15 * Math.min(1, q.age / 4),
          0.254 + 0.085 * n(q, 91) + 0.04 * (q.age === 0 ? 1 : 0),
          THREE.SRGBColorSpace,
        );
      col.toArray(this.baseColors, i * 3);
    }
    this.paintWood(selected);
  }

  private removedPiece(p: Piece, selected: CutPlan | null) {
    return (
      selected &&
      (selected.ids.has(p.q.s.id) ||
        (selected.id === p.q.s.id && !p.main && p.at >= selected.at))
    );
  }

  paintWood(selected: CutPlan | null) {
    if (!this.wood) return;
    if (this.extra) {
      this.stage.treeGroup.remove(this.extra);
      this.extra = null;
    }
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      col.fromArray(this.baseColors, i * 3);
      if (this.removedPiece(p, selected)) col.copy(coral);
      this.wood.setColorAt(i, col);
      // Restore original transforms even when cancelling a partial-shoot cut.
      if (p.main) {
        let end = p.b;
        if (selected && p.q.s.id === selected.id && selected.at > 0) {
          end = atPoint(p.q, selected.at);
          this.extra = new THREE.Mesh(this.woodG, cutMat);
          this.extra.matrixAutoUpdate = false;
          this.extra.matrix.copy(
            stickMatrix(end, p.b, p.r * (1 - 0.28 * selected.at)),
          );
          this.stage.treeGroup.add(this.extra);
        }
        this.wood.setMatrixAt(i, stickMatrix(p.a, end, p.r));
      }
    }
    this.wood.instanceColor!.needsUpdate = true;
    this.wood.instanceMatrix.needsUpdate = true;
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
