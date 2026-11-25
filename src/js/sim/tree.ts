import type { Vector3 } from 'three';
import { DEG, GOLD, TAU, UP, V, clamp } from '../util.js';
import { mulberry32, noise } from './random.js';
import { forms } from './systems.js';
import type { TrainingForm, TreeSpec } from './axes.js';
import type {
  Branch,
  Caps,
  CutFork,
  CutPlan,
  Edge,
  Model,
  Role,
  TreeState,
  UndoEntry,
} from './types.js';

function cone(d: Vector3, angle: number, az: number) {
  const u = V()
      .crossVectors(Math.abs(d.y) > 0.91 ? V(1, 0, 0) : UP, d)
      .normalize(),
    v = V().crossVectors(d, u);
  return d
    .clone()
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(u, Math.sin(angle) * Math.cos(az))
    .addScaledVector(v, Math.sin(angle) * Math.sin(az))
    .normalize();
}

interface Bid {
  q: Branch;
  at: number;
  d: Vector3;
  role: Role;
  order: number;
  fork: boolean;
  len: number;
  priority: number;
}

/**
 * Per-year growth context. `r` is the year's mulberry32 stream: its draw order
 * is part of the behavior, so phase methods must draw through `g.r` in the
 * established sequence and never reorder statements around draws.
 */
interface Growth {
  yr: number;
  r: () => number;
  bid: (
    q: Branch,
    at: number,
    d: Vector3,
    role: Role,
    order: number,
    fork: boolean,
    len: number,
    priority: number,
  ) => void;
  spec: TreeSpec;
  form: TrainingForm;
  rooted: Branch;
  rootAz: number;
  taper: number;
}

/**
 * Graph state owner. Edges are plain data in parent-before-child order;
 * rest directions never accumulate display deformations. Each edge is one
 * annual extension. Tree is the only place that mutates the edge list.
 */
export class Tree implements TreeState {
  seed: number;
  year: number;
  nextId: number;
  edges: Edge[];
  removed: number;
  base: number;
  stress: number;

  /** Plant a rooted leader stem; every tree starts as one annual extension. */
  constructor(seed: number) {
    this.seed = seed;
    this.year = 1;
    this.nextId = 1;
    this.edges = [];
    this.removed = 0;
    this.base = 1;
    this.stress = 0;
    const r = mulberry32(seed);
    this.append(
      0,
      1,
      V((r() - 0.5) * 0.095, 1, (r() - 0.5) * 0.095),
      0.63 + 0.11 * r(),
      'leader',
      0,
      false,
      1,
    );
  }

  append(
    p: number,
    at: number,
    d: Vector3,
    len: number,
    role: Role,
    order: number,
    fork: boolean,
    born: number,
  ): Edge {
    const s: Edge = {
      id: this.nextId++,
      p,
      at,
      d: d.normalize().toArray() as [number, number, number],
      len,
      role,
      order,
      fork,
      born,
      load: 0,
      dead: false,
      head: -10,
      release: -10,
    };
    this.edges.push(s);
    return s;
  }

  advance(m: Model, spec: TreeSpec, caps: Caps): number {
    const yr = this.year + 1,
      r = mulberry32((this.seed ^ Math.imul(yr, 0x9e3779b1)) >>> 0);
    const heavy = this.removed / Math.max(0.01, this.base) > spec.species.budget;
    const want: Bid[] = [];
    const bid: Growth['bid'] = (q, at, d, role, order, fork, len, priority) => {
      want.push({
        q,
        at,
        d,
        role,
        order,
        fork,
        len,
        priority: priority + r() * 0.8,
      });
    };
    const taper = clamp(1 - 0.048 * Math.max(0, yr - 4), 0.36, 1);
    const capacity = Math.max(
      8,
      Math.round((7 + 1.35 * yr ** 1.56) * spec.cultivar.vigor),
    );
    // Growth shape follows the habit for now; the training form drives it
    // once form-driven growth lands (then this indirection goes away).
    const form = spec.habit.growsOpen ? forms.vase : forms.leader;
    const rooted = m.list[0],
      rootAz = noise(this.seed, 0, 47) * TAU;
    const g: Growth = { yr, r, bid, spec, form, rooted, rootAz, taper };
    this.extend(m, g);
    if (heavy) this.surge(m, g);
    const sprouts = this.allocate(want, capacity, caps, yr);
    this.restock(m, g);
    return sprouts;
  }

  /** One pass per branch: mortality, then bids. Draws run in this order. */
  private extend(m: Model, g: Growth) {
    for (const q of m.list) {
      const s = q.s;
      s.load = q.fruits.length;
      if (s.dead) continue;
      if (q.age >= 2 && !q.kids.length && q.light < 0.34 && g.r() < 0.15) {
        s.dead = true;
        continue;
      }
      this.branchBid(q, s, g);
    }
  }

  /** Heading response, extension bid and lateral scaffolds for one branch. */
  private branchBid(q: Branch, s: Edge, g: Growth) {
    const young = q.age === 0;
    const released = s.release === this.year;
    // Competing bud sinks share a finite whole-tree extension budget below.
    // A remaining scaffold with a released union gets preferential flow.
    const supply = clamp(
      0.76 +
        0.29 * q.light +
        0.14 * (released ? 1 : 0) -
        0.035 * Math.min(4, s.load),
      0.63,
      1.17,
    );
    const ext = 0.535 * g.spec.cultivar.vigor * g.taper * supply;
    if (s.head === this.year) {
      this.headingSprouts(q, s, g);
      return;
    }
    if (!young && !released && q.age > 2) return;
    const ax = q.kids.some((k) => !k.s.fork && k.s.at > 0.95);
    this.extensionBid(q, s, g, ext, young, released, ax);
    this.lateralBids(q, s, g, ext, young, released, ax);
  }

  /** Watersprouts spawned by this year's heading cut. */
  private headingSprouts(q: Branch, s: Edge, g: Growth) {
    const count = 2 + Math.floor(g.r() * 2 * g.spec.cultivar.headingResponse);
    for (let j = 0; j < count; j++) {
      const a = g.rootAz + s.id * GOLD + j * GOLD,
        tilt = 0.13 + g.r() * 0.34;
      g.bid(
        q,
        0.79 + (0.19 * (j + 0.5)) / count,
        V(tilt * Math.cos(a), 1, tilt * Math.sin(a)).normalize(),
        'sprout',
        s.order + 1,
        true,
        (0.43 + g.r() * 0.25) *
          g.spec.cultivar.vigor *
          clamp(g.taper + 0.22, 0.65, 1.1),
        12,
      );
    }
  }

  /** Annual extension from the tip, when the branch may extend at all. */
  private extensionBid(
    q: Branch,
    s: Edge,
    g: Growth,
    ext: number,
    young: boolean,
    released: boolean,
    ax: boolean,
  ) {
    const leader = s.role === 'leader',
      scaf = s.role === 'scaffold';
    // Tip-bearing habits leave a larger share of lateral terminal buds floral.
    const floral = g.spec.habit.floralShare;
    const mayExtend = young || released || (!q.kids.length && g.r() < 0.17);
    if (
      !ax &&
      mayExtend &&
      !(g.form.openCenter && q === g.rooted) &&
      q.b.y < 5.9 &&
      (leader || scaf || g.r() < (1 - floral) * (0.48 + 0.52 * q.light))
    ) {
      let d = q.dir.clone();
      if (leader) d.lerp(UP, 0.69 * g.spec.cultivar.dominance);
      else if (scaf) {
        const az = Math.atan2(d.z, d.x) + (g.r() - 0.5) * 0.33,
          angle =
            (g.form.scaffoldAngleDeg ?? g.spec.cultivar.unionAngle - 5) +
            (g.r() - 0.5) * 15;
        d.lerp(
          V(
            Math.sin(angle * DEG) * Math.cos(az),
            Math.cos(angle * DEG),
            Math.sin(angle * DEG) * Math.sin(az),
          ),
          0.52,
        );
      } else d = cone(d, (5 + g.r() * 16) * DEG, g.r() * TAU);
      d.z -= 0.045 + (1 - q.light) * 0.085;
      d.y += 0.035;
      d.normalize();
      g.bid(
        q,
        1,
        d,
        s.role,
        s.order,
        false,
        ext *
          (leader ? 1 : scaf ? g.form.scaffoldExtLen : 0.69 + g.r() * 0.3) *
          (0.94 + 0.12 * g.r()),
        leader ? 9 : scaf ? 6 : 2.25 + q.light,
      );
    }
  }

  /** Scaffold and side shoots placed along the branch. */
  private lateralBids(
    q: Branch,
    s: Edge,
    g: Growth,
    ext: number,
    young: boolean,
    released: boolean,
    ax: boolean,
  ) {
    const leader = s.role === 'leader',
      scaf = s.role === 'scaffold';
    const { yr, r, form, rooted, rootAz } = g;
    let sides = 0;
    if (young) {
      if (leader)
        sides = q === rooted ? form.rootedSideCount : r() < 0.55 ? 2 : 1;
      else if (scaf) sides = 1 + (r() < 0.53 ? 1 : 0);
      else sides = r() < (0.32 + q.light * 0.43) / (1 + 0.13 * s.order) ? 1 : 0;
    } else if (released || (!ax && q.age <= 2 && r() < 0.16 * q.light))
      sides = 1;
    for (let j = 0; j < sides; j++) {
      let at, d;
      if (leader) {
        const a =
          rootAz +
          (yr - 2) * GOLD +
          (q === rooted ? (j * TAU) / sides : j * GOLD) +
          (r() - 0.5) * 0.31;
        const angle =
          (g.spec.cultivar.unionAngle +
            (r() - 0.5) * 20 -
            (r() < 0.09 ? 18 : 0)) *
          DEG;
        d = V(
          Math.cos(a) * Math.sin(angle),
          Math.cos(angle),
          Math.sin(a) * Math.sin(angle),
        );
        at =
          (q === rooted ? 0.61 : 0.21) +
          (j * (q === rooted ? 0.34 : 0.58)) / Math.max(1, sides - 1) +
          0.025 * r();
      } else {
        at = 0.29 + (0.56 * (j + 0.25 + r() * 0.4)) / sides;
        const angle = (r() < 0.12 ? 19 + r() * 12 : 39 + r() * 34) * DEG;
        d = cone(q.dir, angle, r() * TAU);
        d.y = Math.max(-0.31, d.y + 0.075);
        d.z -= 0.08 * (1.12 - q.light);
        d.normalize();
      }
      const role: Role = leader ? 'scaffold' : 'side';
      g.bid(
        q,
        clamp(at, 0.12, 0.97),
        d,
        role,
        s.order + 1,
        true,
        ext *
          (leader ? form.leaderLateralLen : 0.47 + 0.43 * r()) *
          (0.91 + 0.16 * r()),
        leader ? 5.4 : 1.55 + 0.82 * q.light,
      );
    }
  }

  /** Watersprout surge after over-pruning. */
  private surge(m: Model, g: Growth) {
    const c = m.list
      .filter(
        (q) =>
          !q.s.dead && q.age >= 1 && q.s.order <= 2 && q.s.head !== this.year,
      )
      .sort((a, b) => b.r - a.r);
    const count = Math.min(
      c.length,
      Math.ceil((3 + g.yr * 0.38) * g.spec.cultivar.headingResponse),
    );
    for (let j = 0; j < count; j++) {
      const q = c[j],
        a = g.r() * TAU;
      g.bid(
        q,
        0.36 + 0.57 * g.r(),
        V(0.23 * Math.cos(a), 1, 0.23 * Math.sin(a)).normalize(),
        'sprout',
        q.s.order + 1,
        true,
        0.43 + 0.26 * g.r(),
        11,
      );
    }
  }

  /** Award the winning bids within the extension budget. */
  private allocate(want: Bid[], capacity: number, caps: Caps, yr: number) {
    want.sort((a, b) => b.priority - a.priority);
    const slots = Math.max(0, Math.min(caps.max - this.edges.length, capacity));
    const allocation = clamp(capacity / Math.max(1, want.length), 0.77, 1.04);
    let sprouts = 0;
    for (let i = 0; i < Math.min(want.length, slots); i++) {
      const w = want[i];
      this.append(
        w.q.s.id,
        w.at,
        w.d,
        w.len * (w.priority > 5 ? 1 : allocation),
        w.role,
        w.order,
        w.fork,
        yr,
      );
      if (w.role === 'sprout' && w.fork) sprouts++;
    }
    return sprouts;
  }

  /** Season bookkeeping: crop stress, new year, live length base. */
  private restock(m: Model, g: Growth) {
    const load = m.fruitCount / Math.max(1, m.live),
      stress = g.spec.habit.stress;
    this.stress = clamp((load - stress.on) * stress.gain, 0, stress.cap);
    this.year = g.yr;
    this.removed = 0;
    this.base = this.edges.reduce((a, s) => a + (s.dead ? 0 : s.len), 0);
  }

  /**
   * Non-mutating hypothetical graph. Only children attached above a heading
   * cut are lost; lower attachments are reparameterized in place.
   */
  forkCut(q: Branch, at: number): CutFork {
    const ids = new Set<number>(),
      stack = at === 0 ? [q] : q.kids.filter((k) => k.s.at >= at);
    while (stack.length) {
      const k = stack.pop()!;
      ids.add(k.s.id);
      for (const c of k.kids) stack.push(c);
    }
    const edges: Edge[] = [],
      originals: Edge[] = [],
      lost: Edge[] = [];
    let length = 0;
    for (const s of this.edges) {
      if (ids.has(s.id)) {
        lost.push(s);
        if (!s.dead) length += s.len;
        continue;
      }
      let next = s;
      if (s.id === q.s.id && at > 0) {
        if (!s.dead) length += s.len * (1 - at);
        next = { ...s, len: s.len * at, head: this.year, load: s.load * at };
      } else if (at > 0 && s.p === q.s.id) next = { ...s, at: s.at / at };
      else if (at === 0 && s.id === q.s.p) next = { ...s, release: this.year };
      if (next !== s) originals.push(s);
      edges.push(next);
    }
    return {
      ids,
      length,
      lost,
      originals,
      after: {
        seed: this.seed,
        year: this.year,
        nextId: this.nextId,
        edges,
        removed: this.removed + length,
        base: this.base,
        stress: this.stress,
      },
    };
  }

  /** Adopt the hypothetical state of a confirmed cut. */
  applyCut(plan: CutPlan): void {
    this.year = plan.after.year;
    this.nextId = plan.after.nextId;
    this.edges = plan.after.edges;
    this.removed = plan.after.removed;
    this.base = plan.after.base;
    this.stress = plan.after.stress;
  }

  /** Restore the reworked and lost edges recorded before a cut. */
  undo(entry: UndoEntry): void {
    const map = new Map(
      entry.originals.map((s) => [s.id, s] as [number, Edge]),
    );
    this.edges = this.edges
      .map((s) => map.get(s.id) || s)
      .concat(entry.lost)
      .sort((a, b) => a.id - b.id);
    this.removed = entry.removed;
  }
}
