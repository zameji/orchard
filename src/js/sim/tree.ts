import type { Vector3 } from 'three';
import { DEG, GOLD, TAU, UP, V, clamp } from '../util.js';
import { budget } from './config.js';
import { mulberry32, noise } from './random.js';
import type {
  Branch,
  Caps,
  Edge,
  Model,
  Profile,
  Role,
  TreeState,
} from './types.js';

// Graph state is plain data, in parent-before-child order. Rest directions
// never accumulate display deformations. Each edge is one annual extension.
export function append(
  t: TreeState,
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
    id: t.next++,
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
  t.edges.push(s);
  return s;
}

export function fresh(seed: number): TreeState {
  const t: TreeState = {
    seed,
    year: 1,
    next: 1,
    edges: [],
    removed: 0,
    base: 1,
    stress: 0,
  };
  const r = mulberry32(seed);
  append(
    t,
    0,
    1,
    V((r() - 0.5) * 0.095, 1, (r() - 0.5) * 0.095),
    0.63 + 0.11 * r(),
    'leader',
    0,
    false,
    1,
  );
  return t;
}

export function cone(d: Vector3, angle: number, az: number) {
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

export function advance(
  t: TreeState,
  m: Model,
  profile: Profile,
  caps: Caps,
): number {
  const yr = t.year + 1,
    r = mulberry32((t.seed ^ Math.imul(yr, 0x9e3779b1)) >>> 0);
  const heavy = t.removed / Math.max(0.01, t.base) > budget(profile);
  const want: {
    q: Branch;
    at: number;
    d: Vector3;
    role: Role;
    order: number;
    fork: boolean;
    len: number;
    priority: number;
  }[] = [];
  let sprouts = 0;
  const taper = clamp(1 - 0.048 * Math.max(0, yr - 4), 0.36, 1);
  const capacity = Math.max(8, Math.round((7 + 1.35 * yr ** 1.56) * profile.v));
  function bid(
    q: Branch,
    at: number,
    d: Vector3,
    role: Role,
    order: number,
    fork: boolean,
    len: number,
    priority: number,
  ) {
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
  }
  const vase = profile.mode === 'peach' || profile.mode === 'tart';
  const rooted = m.list[0],
    rootAz = noise(t.seed, 0, 47) * TAU;
  for (const q of m.list) {
    const s = q.s;
    s.load = q.fruits.length;
    if (s.dead) continue;
    if (q.age >= 2 && !q.kids.length && q.light < 0.34 && r() < 0.15) {
      s.dead = true;
      continue;
    }
    const leader = s.role === 'leader',
      scaf = s.role === 'scaffold',
      young = q.age === 0;
    const released = s.release === t.year;
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
    const ext = 0.535 * profile.v * taper * supply;
    if (s.head === t.year) {
      const count = 2 + Math.floor(r() * 2 * profile.react);
      for (let j = 0; j < count; j++) {
        const a = rootAz + s.id * GOLD + j * GOLD,
          tilt = 0.13 + r() * 0.34;
        bid(
          q,
          0.79 + (0.19 * (j + 0.5)) / count,
          V(tilt * Math.cos(a), 1, tilt * Math.sin(a)).normalize(),
          'sprout',
          s.order + 1,
          true,
          (0.43 + r() * 0.25) * profile.v * clamp(taper + 0.22, 0.65, 1.1),
          12,
        );
      }
      continue;
    }
    if (!young && !released && q.age > 2) continue;
    const ax = q.kids.some((k) => !k.s.fork && k.s.at > 0.95);
    // Tip-bearing habits leave a larger share of lateral terminal buds floral.
    const floral =
      profile.mode === 'tip'
        ? 0.55
        : profile.mode === 'tart'
          ? 0.34
          : profile.mode === 'mixed'
            ? 0.25
            : 0.13;
    const mayExtend = young || released || (!q.kids.length && r() < 0.17);
    if (
      !ax &&
      mayExtend &&
      !(vase && q === rooted) &&
      q.b.y < 5.9 &&
      (leader || scaf || r() < (1 - floral) * (0.48 + 0.52 * q.light))
    ) {
      let d = q.dir.clone();
      if (leader) d.lerp(UP, 0.69 * profile.ap);
      else if (scaf) {
        const az = Math.atan2(d.z, d.x) + (r() - 0.5) * 0.33,
          angle = (vase ? 38 : profile.angle - 5) + (r() - 0.5) * 15;
        d.lerp(
          V(
            Math.sin(angle * DEG) * Math.cos(az),
            Math.cos(angle * DEG),
            Math.sin(angle * DEG) * Math.sin(az),
          ),
          0.52,
        );
      } else d = cone(d, (5 + r() * 16) * DEG, r() * TAU);
      d.z -= 0.045 + (1 - q.light) * 0.085;
      d.y += 0.035;
      d.normalize();
      bid(
        q,
        1,
        d,
        s.role,
        s.order,
        false,
        ext *
          (leader ? 1 : scaf ? (vase ? 1.22 : 1.04) : 0.69 + r() * 0.3) *
          (0.94 + 0.12 * r()),
        leader ? 9 : scaf ? 6 : 2.25 + q.light,
      );
    }
    let sides = 0;
    if (young) {
      if (leader) sides = q === rooted ? (vase ? 4 : 3) : r() < 0.55 ? 2 : 1;
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
          (profile.angle + (r() - 0.5) * 20 - (r() < 0.09 ? 18 : 0)) * DEG;
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
      bid(
        q,
        clamp(at, 0.12, 0.97),
        d,
        role,
        s.order + 1,
        true,
        ext *
          (leader ? (vase ? 1.26 : 1.03) : 0.47 + 0.43 * r()) *
          (0.91 + 0.16 * r()),
        leader ? 5.4 : 1.55 + 0.82 * q.light,
      );
    }
  }
  if (heavy) {
    const c = m.list
      .filter(
        (q) => !q.s.dead && q.age >= 1 && q.s.order <= 2 && q.s.head !== t.year,
      )
      .sort((a, b) => b.r - a.r);
    const count = Math.min(
      c.length,
      Math.ceil((3 + yr * 0.38) * profile.react),
    );
    for (let j = 0; j < count; j++) {
      const q = c[j],
        a = r() * TAU;
      bid(
        q,
        0.36 + 0.57 * r(),
        V(0.23 * Math.cos(a), 1, 0.23 * Math.sin(a)).normalize(),
        'sprout',
        q.s.order + 1,
        true,
        0.43 + 0.26 * r(),
        11,
      );
    }
  }
  want.sort((a, b) => b.priority - a.priority);
  const slots = Math.max(0, Math.min(caps.max - t.edges.length, capacity));
  const allocation = clamp(capacity / Math.max(1, want.length), 0.77, 1.04);
  for (let i = 0; i < Math.min(want.length, slots); i++) {
    const w = want[i];
    append(
      t,
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
  const load = m.fruitCount / Math.max(1, m.live);
  t.stress =
    profile.mode === 'spur'
      ? clamp((load - 0.78) * 0.63, 0, 0.82)
      : clamp((load - 2.1) * 0.1, 0, 0.17);
  t.year = yr;
  t.removed = 0;
  t.base = t.edges.reduce((a, s) => a + (s.dead ? 0 : s.len), 0);
  return sprouts;
}
