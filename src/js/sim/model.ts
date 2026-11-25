import { DEG, TAU, V, clamp } from '../util.js';
import { budget } from './config.js';
import { exposures, seasonSuns } from './light.js';
import { noise } from './random.js';
import type { Branch, Model, Profile, TreeState } from './types.js';

function potential(q: Branch, profile: Profile) {
  const a = q.age,
    m = profile.mode,
    side = q.s.order > 0;
  if (q.s.dead || !side) return { sp: 0, shoot: 0 };
  const good = a >= 2 && a <= (m === 'sweet' ? 5 : 4),
    old = a >= 2;
  let sp = 0,
    shoot = 0;
  if (old && m !== 'peach') {
    const intensity = {
      spur: 1,
      tip: 0.1,
      mixed: 0.62,
      sweet: 0.94,
      tart: 0.48,
      peach: 0,
    }[m];
    sp = intensity * (good ? 1 : Math.max(0.1, 0.56 - (a - 5) * 0.09));
  }
  if (a === 1) {
    const terminal = !q.kids.some((k) => k.s.at > 0.955);
    if (m === 'peach') shoot = 1;
    else if (m === 'tip') shoot = terminal ? 1 : 0.04;
    else if (m === 'tart') shoot = terminal ? 0.93 : 0.36;
    else if (m === 'mixed') shoot = terminal ? 0.76 : 0.1;
    else if (m === 'sweet') shoot = q.s.len < 0.35 ? 0.46 : 0.08;
    else shoot = terminal ? 0.1 : 0;
  }
  return { sp, shoot };
}

function crop(q: Branch, t: TreeState, profile: Profile) {
  q.buds = [];
  q.fruits = [];
  q.diameter = 0;
  const f = potential(q, profile);
  q.potential = f.sp + f.shoot;
  if (!q.potential) return;
  const m = profile.mode,
    ch = profile.sp === 'Cherry',
    pe = profile.sp === 'Peach';
  const ripe = t.year >= (pe ? 2 : 3);
  // Spur locations depend on identity, not the order of other branches.
  const stations = f.sp
    ? Math.max(2, Math.min(7, Math.round(q.s.len * (m === 'spur' ? 10 : 7))))
    : pe
      ? Math.max(2, Math.round(q.s.len * 8))
      : m === 'tart'
        ? 2
        : 1;
  for (let k = 0; k < stations; k++) {
    const r = (j: number) => noise(t.seed, q.s.id, 100 + k * 19 + j);
    let at = f.sp
      ? 0.14 + (0.73 * (k + 0.27 + 0.42 * r(0))) / stations
      : pe
        ? 0.14 + (0.72 * (k + 0.5)) / stations
        : 1;
    if (!f.sp && m === 'tart' && k === 0) at = 0.62;
    const az = TAU * r(1),
      ex = clamp(q.light + (r(2) - 0.5) * 0.12);
    if (f.sp && r(3) < Math.min(1, f.sp + 0.13))
      q.buds.push({ at, az, len: 0.025 + 0.035 * r(4) });
    const limit =
      Math.max(f.sp, f.shoot) *
      clamp((ex - 0.17) / 0.64) *
      (0.97 - t.stress * 0.64);
    if (!ripe || ex < 0.24 || r(5) > limit) continue;
    const count = ch
      ? 2 + Math.floor(r(6) * 3)
      : f.sp && m === 'spur' && r(6) > 0.71
        ? 2
        : 1;
    for (let j = 0; j < count; j++) {
      const diameter =
        (ch ? 0.024 : pe ? 0.069 : m === 'mixed' ? 0.088 : 0.074) *
        (0.7 + 0.31 * ex + 0.09 * r(7) - 0.027 * (count - 1));
      q.fruits.push({
        at,
        az: az + (j - (count - 1) / 2) * 0.93,
        d: diameter,
        ex,
        shade: r(8),
        spur: !!f.sp,
      });
      q.diameter += diameter;
    }
  }
}

function findCrossings(list: Branch[]) {
  // Test non-adjacent centerlines in local buckets; exclude unions and
  // samples close to endpoints to avoid flagging legitimate scaffolds.
  const bins = new Map<string, Branch[]>(),
    cell = 0.32;
  const hash = (x: number, y: number, z: number) => `${x}/${y}/${z}`;
  for (const q of list) {
    const p = q.mid,
      x = Math.floor(p.x / cell),
      y = Math.floor(p.y / cell),
      z = Math.floor(p.z / cell);
    if (q.s.order)
      for (let a = -1; a <= 1 && !q.cross; a++)
        for (let b = -1; b <= 1 && !q.cross; b++)
          for (let c = -1; c <= 1 && !q.cross; c++) {
            const bin = bins.get(hash(x + a, y + b, z + c));
            if (!bin) continue;
            for (const j of bin) {
              if (
                j === q.par ||
                j.par === q.par ||
                j === q.par?.par ||
                Math.abs(q.dir.dot(j.dir)) > 0.92
              )
                continue;
              const offset = V().subVectors(q.a, j.a),
                dot = q.dir.dot(j.dir),
                u = q.dir.dot(offset),
                v = j.dir.dot(offset);
              const t = clamp((dot * v - u) / (1 - dot * dot), 0, q.s.len),
                s = clamp(v + dot * t, 0, j.s.len);
              if (t < 0.1 * q.s.len || s < 0.1 * j.s.len) continue;
              if (
                offset
                  .addScaledVector(q.dir, t)
                  .addScaledVector(j.dir, -s)
                  .length() <
                0.035 + q.r + j.r
              ) {
                q.cross = true;
                break;
              }
            }
          }
    const k = hash(x, y, z);
    if (!bins.has(k)) bins.set(k, []);
    const bin = bins.get(k)!;
    if (bin.length < 20) bin.push(q);
  }
}

export function derive(t: TreeState, profile: Profile): Model {
  const list: Branch[] = [],
    map = new Map<number, Branch>();
  for (const s of t.edges) {
    const par = map.get(s.p);
    const q: Branch = {
      s,
      par,
      i: list.length,
      kids: [],
      age: t.year - s.born,
      rest: V(...s.d),
      pipe: 0,
      burden: s.load || 0,
      cross: false,
      r: 0,
      a: V(),
      dir: V(),
      b: V(),
      mid: V(),
      angle: 0,
      inward: false,
      narrow: false,
      rival: false,
      light: 0,
      buds: [],
      fruits: [],
      diameter: 0,
      potential: 0,
      weak: false,
      down: false,
      bad: false,
      subLive: 0,
      subFruit: 0,
      subCount: 0,
    };
    list.push(q);
    map.set(s.id, q);
    if (par) par.kids.push(q);
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i],
      base =
        (0.0042 + 0.004 * q.s.len + 0.0012 * Math.min(9, q.age)) * profile.cal;
    q.pipe += base * base;
    q.r = Math.sqrt(q.pipe);
    if (q.par) {
      q.par.pipe += q.pipe * 0.91;
      q.par.burden += q.burden * 0.83;
    }
  }
  let height = 0,
    spread = 0;
  for (const q of list) {
    q.a = q.par ? q.par.a.clone().lerp(q.par.b, q.s.at) : V();
    q.dir = q.rest.clone();
    if (q.par)
      q.dir.addScaledVector(V().subVectors(q.par.dir, q.par.rest), 0.57);
    const arm = Math.sqrt(Math.max(0.015, 1 - q.rest.y * q.rest.y));
    const force =
      (0.04 + 0.135 * Math.log1p(q.burden)) *
      profile.sag *
      arm *
      clamp(0.019 / q.r, 0.14, 1.6) *
      clamp(q.s.len / 0.45, 0.25, 1.7);
    q.dir.y -= Math.min(0.83, force);
    q.dir.normalize();
    q.b = q.a.clone().addScaledVector(q.dir, q.s.len);
    q.mid = q.a.clone().lerp(q.b, 0.56);
    height = Math.max(height, q.b.y);
    spread = Math.max(spread, 2 * Math.hypot(q.b.x, q.b.z));
    q.angle = q.par ? Math.acos(clamp(q.dir.dot(q.par.dir), -1, 1)) / DEG : 0;
    const rad = Math.hypot(q.mid.x, q.mid.z);
    q.inward =
      rad > 0.24 && q.dir.x * q.mid.x + q.dir.z * q.mid.z < -0.19 * rad;
    q.narrow = q.s.fork && q.angle < 30;
    q.rival =
      q.s.order > 0 && q.dir.y > 0.92 && q.s.len > 0.29 && rad < 0.38 * height;
  }
  const lights = seasonSuns.map((s) => exposures(list, s));
  findCrossings(list);
  let fruitCount = 0,
    diam = 0,
    kg = 0,
    lightSum = 0,
    live = 0,
    lightWeight = 0,
    defect = 0,
    productive = 0,
    goodZones = 0,
    zones = 0,
    headings = 0;
  for (const q of list) {
    q.light = (lights[0][q.i] + 1.3 * lights[1][q.i] + lights[2][q.i]) / 3.3;
    crop(q, t, profile);
    fruitCount += q.fruits.length;
    diam += q.diameter;
    for (const f of q.fruits)
      kg += (Math.PI / 6) * f.d ** 3 * (profile.sp === 'Cherry' ? 1000 : 880);
    q.weak = !q.s.dead && !q.kids.length && q.age >= 2 && q.light < 0.4;
    q.down = q.dir.y < -0.17;
    q.bad = q.s.dead || q.weak || q.down || q.cross || q.inward;
    const w = q.s.len * (q.s.order ? 1 : 0.42);
    lightWeight += w;
    lightSum += w * q.light;
    live += q.s.dead ? 0 : q.s.len;
    const flaws =
      (q.bad ? 0.87 : 0) + (q.narrow ? 0.48 : 0) + (q.rival ? 0.5 : 0);
    defect += w * Math.min(1.5, flaws);
    if (q.s.head >= t.year - 1) headings += w;
    if (q.potential) {
      zones += q.potential;
      goodZones += q.potential * q.light;
      productive += q.potential * clamp((q.light - 0.2) / 0.58);
    }
    q.subLive = q.s.dead ? 0 : q.s.len;
    q.subFruit = q.fruits.length;
    q.subCount = 1;
  }
  for (let i = list.length - 1; i > 0; i--) {
    const q = list[i];
    q.par!.subLive += q.subLive;
    q.par!.subFruit += q.subFruit;
    q.par!.subCount += q.subCount;
  }
  const avg = lightSum / Math.max(0.01, lightWeight),
    health = zones ? goodZones / zones : avg;
  const removal = t.removed / Math.max(0.01, t.base),
    struct = clamp(1 - (2 * defect) / Math.max(0.01, lightWeight));
  const cropIndex =
    t.year < 3 ? 0.7 : clamp(productive / Math.max(1, live * 1.1));
  const score = Math.round(
    clamp(
      17 +
        31 * avg +
        23 * struct +
        18 * health +
        10 * cropIndex -
        115 * Math.max(0, removal - budget(profile)) -
        (24 * headings) / lightWeight,
      0,
      100,
    ),
  );
  return {
    list,
    map,
    height,
    spread,
    fruitCount,
    diam: fruitCount ? (1000 * diam) / fruitCount : 0,
    kg,
    avg,
    live,
    health,
    score,
    struct,
    productive,
    removal,
  };
}
