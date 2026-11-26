import * as THREE from 'three';
import { clamp, V } from '../util.js';
import type { Branch, Model, Rec } from '../sim/types.js';
import { tmp } from './geometry.js';
import { edgeAtFace } from './loft.js';
import type { Stage } from './scene.js';
import type { TreeMesh } from './tree-mesh.js';

export interface PickDeps {
  m: Model;
  recs: Rec[];
  learning: boolean;
  propose: (q: Branch, at: number, reason?: string) => void;
}

/** Screen-space segment capsules complement exact instanced-frustum hits. */
export class Picker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly pa = V();
  private readonly pb = V();

  constructor(
    private readonly stage: Stage,
    private readonly treeMesh: TreeMesh,
  ) {}

  private screenPoint(
    p: THREE.Vector3,
    out: THREE.Vector3,
    w: number,
    h: number,
  ) {
    out.copy(p).project(this.stage.camera);
    out.x = (out.x + 1) * w * 0.5;
    out.y = (1 - out.y) * h * 0.5;
    return out;
  }

  /** Merged-loft face or sprout instance to its edge and along-edge hit t. */
  private resolveHit(
    hit: THREE.Intersection | undefined,
    m: Model,
  ): { q: Branch; t: number } | null {
    if (!hit) return null;
    if (hit.object === this.treeMesh.wood && this.treeMesh.merged) {
      const id = edgeAtFace(
        this.treeMesh.merged.triRanges,
        hit.faceIndex ?? -1,
      );
      const q = id !== undefined ? m.map.get(id) : undefined;
      return q
        ? { q, t: clamp(tmp.subVectors(hit.point, q.a).dot(q.dir) / q.s.len) }
        : null;
    }
    const p =
      hit.instanceId !== undefined
        ? this.treeMesh.pieces[hit.instanceId]
        : undefined;
    return p ? { q: p.q, t: p.at } : null;
  }

  /** Nearest learning-mode marker within slack in screen space. */
  private bestRec(
    recs: readonly Rec[],
    x: number,
    y: number,
    w: number,
    h: number,
    slack: number,
  ): Rec | null {
    let hit: Rec | null = null,
      min = slack * 0.75;
    for (const rec of recs) {
      this.screenPoint(rec.q.a, this.pa, w, h);
      const dist = Math.hypot(this.pa.x - x, this.pa.y - y);
      if (this.pa.z >= -1 && this.pa.z < 1 && dist < min) {
        min = dist;
        hit = rec;
      }
    }
    return hit;
  }

  /** Closest edge segment in screen space within slack, ranked by depth. */
  private bestScreenHit(
    m: Model,
    x: number,
    y: number,
    w: number,
    h: number,
    slack: number,
  ): { q: Branch; t: number } | null {
    let hit: { q: Branch; t: number } | null = null,
      best = Infinity;
    for (const k of m.list) {
      this.screenPoint(k.a, this.pa, w, h);
      this.screenPoint(k.b, this.pb, w, h);
      if (this.pa.z < -1 || this.pa.z >= 1 || this.pb.z < -1 || this.pb.z >= 1)
        continue;
      const dx = this.pb.x - this.pa.x,
        dy = this.pb.y - this.pa.y,
        st = clamp(
          ((x - this.pa.x) * dx + (y - this.pa.y) * dy) /
            Math.max(0.001, dx * dx + dy * dy),
        );
      const dist = Math.hypot(this.pa.x + st * dx - x, this.pa.y + st * dy - y);
      const rank = dist + 0.095 * this.stage.camera.position.distanceTo(k.mid);
      if (dist <= slack && rank < best) {
        best = rank;
        hit = { q: k, t: st };
      }
    }
    return hit;
  }

  /**
   * Snap to the nearest union along the picked piece: its proximal base, or
   * the nearest side collar (at a distal fork a continuation also removes
   * cleanly at the junction). Null when the pick stands on its own.
   */
  private snapCollar(q: Branch, t: number): Branch | null {
    if (t <= 0.25 && q.par) return q;
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
    return collar;
  }

  pick(ev: PointerEvent, deps: PickDeps) {
    const { m, recs, learning, propose } = deps;
    const canvas = this.stage.renderer.domElement;
    const rect = canvas.getBoundingClientRect(),
      w = rect.width,
      h = rect.height,
      x = ev.clientX - rect.left,
      y = ev.clientY - rect.top;
    const slack = ev.pointerType === 'mouse' ? 12 : 24;
    this.stage.camera.updateMatrixWorld();
    this.stage.treeGroup.updateMatrixWorld(true);
    if (learning) {
      const hit = this.bestRec(recs, x, y, w, h, slack);
      if (hit) {
        propose(hit.q, 0, hit.reason);
        return;
      }
    }
    this.ndc.set((2 * x) / w - 1, 1 - (2 * y) / h);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    const targets: THREE.Object3D[] = [];
    if (this.treeMesh.wood) targets.push(this.treeMesh.wood);
    if (this.treeMesh.sprouts) targets.push(this.treeMesh.sprouts);
    const hits = this.raycaster.intersectObjects(targets, false);
    const found =
      this.resolveHit(hits[0], m) ?? this.bestScreenHit(m, x, y, w, h, slack);
    if (!found) return;
    const snapped = this.snapCollar(found.q, found.t);
    if (snapped) {
      propose(snapped, 0);
      return;
    }
    propose(found.q, clamp(found.t, 0.04, 0.985));
  }
}
