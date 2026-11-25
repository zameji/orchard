import * as THREE from 'three';
import { $, clamp, GOLD, TAU, pct } from '../util.js';
import { noise } from '../sim/random.js';
import { exposures, sunDir } from '../sim/light.js';
import type {
  Branch,
  Caps,
  CutPlan,
  Model,
  Profile,
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
import {
  billboards,
  contact,
  invalidate,
  markers,
  treeGroup,
} from './scene.js';

export interface RenderCtx {
  t: TreeState;
  m: Model;
  profile: Profile;
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

let woodG: THREE.CylinderGeometry,
  leafG: THREE.BufferGeometry,
  fruitG: THREE.BufferGeometry;
export let wood: THREE.InstancedMesh | null = null,
  foliage: THREE.InstancedMesh | null = null,
  fruitMesh: THREE.InstancedMesh | null = null,
  stems: THREE.InstancedMesh | null = null,
  extra: THREE.Mesh | null = null;
export let pieces: Piece[] = [];
let baseColors = new Float32Array(),
  instant: Float32Array = new Float32Array();

function disposeInstances() {
  for (const m of [wood, foliage, fruitMesh, stems])
    if (m) {
      treeGroup.remove(m);
      m.dispose();
    }
  if (extra) treeGroup.remove(extra);
  wood = foliage = fruitMesh = stems = extra = null;
}

export function resetGeometries(profile: Profile, caps: Caps) {
  disposeInstances();
  for (const g of [woodG, leafG, fruitG]) if (g) g.dispose();
  woodG = new THREE.CylinderGeometry(0.72, 1, 1, caps.sides, 1, false);
  leafG = leafGeometry(profile, caps);
  fruitG = fruitGeometry(profile, caps);
  fruitMat.roughness =
    profile.sp === 'Cherry' ? 0.24 : profile.sp === 'Peach' ? 0.83 : 0.46;
}

function instances(g: THREE.BufferGeometry, m: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(g, m, Math.max(1, count));
  mesh.count = count;
  treeGroup.add(mesh);
  return mesh;
}

export function rebuild(ctx: RenderCtx) {
  const { t, m, profile, caps, showLeaves, showFruit } = ctx;
  disposeInstances();
  pieces = [];
  for (const q of m.list)
    pieces.push({ q, a: q.a, b: q.b, r: q.r, main: true, at: 0 });
  for (const q of m.list)
    for (const b of q.buds) {
      if (pieces.length >= caps.max) break;
      const a = atPoint(q, b.at),
        d = new THREE.Vector3(Math.cos(b.az), 0.58, Math.sin(b.az)).normalize();
      pieces.push({
        q,
        a,
        b: a.clone().addScaledVector(d, q.r + 0.025 + b.len * 0.5),
        r: Math.min(0.008, q.r * 0.52),
        main: false,
        at: b.at,
      });
    }
  wood = instances(woodG, barkMat, pieces.length);
  baseColors = new Float32Array(pieces.length * 3);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    wood.setMatrixAt(i, stickMatrix(p.a, p.b, p.r));
  }
  wood.instanceMatrix.needsUpdate = true;
  wood.computeBoundingSphere();
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
  foliage = instances(leafG, leafMat, sites.length);
  const leafHue =
    profile.sp === 'Peach' ? 0.263 : profile.sp === 'Cherry' ? 0.302 : 0.252;
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
    foliage.setMatrixAt(i, obj.matrix);
    col.setHSL(
      leafHue + (r(5) - 0.5) * 0.053,
      0.37 + 0.17 * r(6),
      0.19 + 0.108 * r(7) + 0.063 * q.light,
      THREE.SRGBColorSpace,
    );
    foliage.setColorAt(i, col);
  }
  foliage.visible = showLeaves;
  foliage.computeBoundingSphere();
  fruitMesh = instances(fruitG, fruitMat, m.fruitCount);
  stems = instances(woodG, stemMat, m.fruitCount);
  let ix = 0;
  for (const q of m.list)
    for (const f of q.fruits) {
      const rad = f.d * 0.5,
        ch = profile.sp === 'Cherry',
        pe = profile.sp === 'Peach';
      const anchor = atPoint(q, f.at),
        side = new THREE.Vector3(Math.cos(f.az), 0, Math.sin(f.az));
      anchor.addScaledVector(side, q.r * 0.8 + (f.spur ? 0.03 : 0));
      anchor.y += f.spur ? 0.019 : 0;
      const end = anchor
        .clone()
        .addScaledVector(side, (ch ? 0.023 : rad * 0.68) + 0.009);
      end.y -= ch ? 0.039 + 0.018 * f.shade : 0.014;
      stems.setMatrixAt(
        ix,
        stickMatrix(anchor, end, ch ? 0.00155 : 0.0021, false),
      );
      obj.position.copy(end);
      obj.position.y -= rad * (ch ? 0.92 : pe ? 0.95 : 0.73);
      obj.rotation.set(0.08 * Math.cos(f.az), f.az, 0.1 * Math.sin(f.az));
      obj.scale.set(rad, rad, rad);
      obj.updateMatrix();
      fruitMesh.setMatrixAt(ix, obj.matrix);
      if (ch)
        col.setHSL(
          0.987 + 0.012 * f.shade,
          0.72,
          0.17 + 0.19 * f.ex + (profile.mode === 'tart' ? 0.056 : 0),
          THREE.SRGBColorSpace,
        );
      else if (pe)
        col.setHSL(
          0.046 + 0.064 * f.shade,
          0.86,
          0.53 + 0.084 * f.ex,
          THREE.SRGBColorSpace,
        );
      else if (profile.mode === 'tip')
        col.setHSL(
          0.196 + 0.039 * f.shade,
          0.54,
          0.38 + 0.092 * f.ex,
          THREE.SRGBColorSpace,
        );
      else if (profile.mode === 'mixed' && f.shade < 0.57)
        col.setHSL(
          0.1 + 0.036 * f.shade,
          0.52,
          0.38 + 0.083 * f.ex,
          THREE.SRGBColorSpace,
        );
      else
        col.setHSL(
          0.009 + 0.052 * (1 - f.ex) + 0.014 * f.shade,
          0.6 + 0.16 * f.ex,
          0.34 + 0.113 * f.ex,
          THREE.SRGBColorSpace,
        );
      fruitMesh.setColorAt(ix++, col);
    }
  fruitMesh.visible = stems.visible = showFruit;
  fruitMesh.computeBoundingSphere();
  stems.computeBoundingSphere();
  contact.scale.setScalar(Math.max(0.85, m.spread * 1.1));
  updateExposure(ctx);
  invalidate();
}

export function updateExposure(ctx: RenderCtx) {
  const { t, m, hour, overlay, selected } = ctx;
  const n = (q: Branch, k: number) => noise(t.seed, q.s.id, k);
  instant = exposures(m.list, sunDir(hour));
  let avg = 0;
  for (const x of instant) avg += x;
  $('lightReading').textContent = '· mean ' + pct(avg / instant.length);
  for (let i = 0; i < pieces.length; i++) {
    const { q, main } = pieces[i],
      e = instant[q.i];
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
    col.toArray(baseColors, i * 3);
  }
  paintWood(selected);
}

function removedPiece(p: Piece, selected: CutPlan | null) {
  return (
    selected &&
    (selected.ids.has(p.q.s.id) ||
      (selected.id === p.q.s.id && !p.main && p.at >= selected.at))
  );
}

export function paintWood(selected: CutPlan | null) {
  if (!wood) return;
  if (extra) {
    treeGroup.remove(extra);
    extra = null;
  }
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    col.fromArray(baseColors, i * 3);
    if (removedPiece(p, selected)) col.copy(coral);
    wood.setColorAt(i, col);
    // Restore original transforms even when cancelling a partial-shoot cut.
    if (p.main) {
      let end = p.b;
      if (selected && p.q.s.id === selected.id && selected.at > 0) {
        end = atPoint(p.q, selected.at);
        extra = new THREE.Mesh(woodG, cutMat);
        extra.matrixAutoUpdate = false;
        extra.matrix.copy(
          stickMatrix(end, p.b, p.r * (1 - 0.28 * selected.at)),
        );
        treeGroup.add(extra);
      }
      wood.setMatrixAt(i, stickMatrix(p.a, end, p.r));
    }
  }
  wood.instanceColor!.needsUpdate = true;
  wood.instanceMatrix.needsUpdate = true;
  invalidate();
}

function mark(q: Branch, at: number, primary: boolean, m: Model) {
  const p = atPoint(q, at),
    r = Math.max(q.r * 1.75, clamp(m.height * 0.018, 0.029, 0.11));
  const ring = new THREE.Mesh(ringG, primary ? ringMat : guideMat);
  ring.position.copy(p);
  ring.scale.setScalar(primary ? r * 1.22 : r);
  ring.renderOrder = primary ? 9 : 6;
  markers.add(ring);
  billboards.push(ring);
  if (primary) {
    const disk = new THREE.Mesh(diskG, planeMat);
    disk.position.copy(p);
    disk.scale.setScalar(q.r * 1.32);
    disk.quaternion.setFromUnitVectors(axisZ, q.dir);
    markers.add(disk);
  } else {
    const inner = new THREE.Mesh(ringG, guideInner);
    inner.scale.setScalar(ring.scale.x * 0.72);
    inner.position.copy(p);
    inner.renderOrder = 7;
    markers.add(inner);
    billboards.push(inner);
  }
}

export function drawMarkers(
  recs: { q: Branch }[],
  learning: boolean,
  selected: CutPlan | null,
  m: Model,
) {
  markers.clear();
  billboards.length = 0;
  if (learning)
    for (const r of recs)
      if (!selected || !selected.ids.has(r.q.s.id)) mark(r.q, 0, false, m);
  if (selected) mark(m.map.get(selected.id)!, selected.at, true, m);
  invalidate();
}
