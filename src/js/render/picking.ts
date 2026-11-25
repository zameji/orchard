import * as THREE from 'three';
import { $, clamp, V } from '../util.js';
import type { Branch, Model, Rec } from '../sim/types.js';
import { tmp } from './geometry.js';
import { camera, treeGroup } from './scene.js';
import { pieces, wood } from './tree-mesh.js';

const raycaster = new THREE.Raycaster(),
  ndc = new THREE.Vector2(),
  pa = V(),
  pb = V();

function screenPoint(
  p: THREE.Vector3,
  out: THREE.Vector3,
  w: number,
  h: number,
) {
  out.copy(p).project(camera);
  out.x = (out.x + 1) * w * 0.5;
  out.y = (1 - out.y) * h * 0.5;
  return out;
}

export interface PickDeps {
  m: Model;
  recs: Rec[];
  learning: boolean;
  propose: (q: Branch, at: number, reason?: string) => void;
}

// Screen-space segment capsules complement exact instanced-frustum hits.
export function pick(ev: PointerEvent, deps: PickDeps) {
  const { m, recs, learning, propose } = deps;
  const canvas = $('view') as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect(),
    w = rect.width,
    h = rect.height,
    x = ev.clientX - rect.left,
    y = ev.clientY - rect.top;
  const slack = ev.pointerType === 'mouse' ? 12 : 24;
  camera.updateMatrixWorld();
  treeGroup.updateMatrixWorld(true);
  if (learning) {
    let hit: Rec | null = null,
      min = slack * 0.75;
    for (const rec of recs) {
      screenPoint(rec.q.a, pa, w, h);
      const dist = Math.hypot(pa.x - x, pa.y - y);
      if (pa.z >= -1 && pa.z < 1 && dist < min) {
        min = dist;
        hit = rec;
      }
    }
    if (hit) {
      propose(hit.q, 0, hit.reason);
      return;
    }
  }
  ndc.set((2 * x) / w - 1, 1 - (2 * y) / h);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(wood!, false);
  let q: Branch | null = null,
    t = 0,
    best = Infinity;
  if (hits.length) {
    const p = pieces[hits[0].instanceId!];
    q = p.q;
    t = p.main
      ? clamp(tmp.subVectors(hits[0].point, q.a).dot(q.dir) / q.s.len)
      : p.at;
  } else {
    for (const k of m.list) {
      screenPoint(k.a, pa, w, h);
      screenPoint(k.b, pb, w, h);
      if (pa.z < -1 || pa.z >= 1 || pb.z < -1 || pb.z >= 1) continue;
      const dx = pb.x - pa.x,
        dy = pb.y - pa.y,
        st = clamp(
          ((x - pa.x) * dx + (y - pa.y) * dy) /
            Math.max(0.001, dx * dx + dy * dy),
        );
      const dist = Math.hypot(pa.x + st * dx - x, pa.y + st * dy - y);
      const rank = dist + 0.095 * camera.position.distanceTo(k.mid);
      if (dist <= slack && rank < best) {
        best = rank;
        q = k;
        t = st;
      }
    }
  }
  if (!q) return;
  if (t <= 0.25 && q.par) {
    propose(q, 0);
    return;
  }
  // Snap to the nearest side union along the picked piece. At its distal
  // fork a continuation can also be removed cleanly at the junction.
  let collar: Branch | null = null,
    delta = 0.25001;
  for (const k of q.kids) {
    if (!k.s.fork && q.kids.length < 2) continue;
    const diff = Math.abs(k.s.at - t);
    if (diff < delta) {
      delta = diff;
      collar = k;
    }
  }
  if (collar) {
    propose(collar, 0);
    return;
  }
  propose(q, clamp(t, 0.04, 0.985));
}
