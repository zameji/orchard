import { UP, V, clamp } from '../util.js';
import type { Branch } from './types.js';

export const sunDir = (h: number) => {
  const a = ((h - 6) * Math.PI) / 12;
  return V(
    Math.cos(a),
    0.075 + 0.98 * Math.sin(a),
    -0.14 - 0.44 * Math.sin(a),
  ).normalize();
};

export const seasonSuns = [sunDir(8.5), sunDir(12), sunDir(15.5)];

// A sun-aligned depth sweep. Sunward foliage deposits optical depth into
// neighboring projected cells. This is independent of the foliage display.
export function exposures(list: Branch[], s: ReturnType<typeof sunDir>) {
  const u = V().crossVectors(UP, s).normalize(),
    v = V().crossVectors(s, u).normalize();
  const order = list.slice().sort((a, b) => b.mid.dot(s) - a.mid.dot(s));
  const map = new Map<number, number>(),
    cell = 0.37,
    out = new Float32Array(list.length);
  const key = (x: number, y: number) => x * 1048576 + y;
  for (const q of order) {
    const x = Math.floor(q.mid.dot(u) / cell),
      y = Math.floor(q.mid.dot(v) / cell),
      k = key(x, y);
    const shade = map.get(k) || 0;
    const face = clamp(0.47 + 0.3 * s.y + 0.24 * (q.dir.dot(s) + 1) * 0.5);
    out[q.i] = clamp(0.095 + face * Math.exp(-shade * 0.72), 0.075, 1);
    if (q.s.dead) continue;
    const w =
      (q.age <= 1 ? 0.75 : q.age < 6 ? 0.46 : 0.23) *
      clamp(q.s.len / 0.4, 0.38, 1.35);
    map.set(k, shade + w);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++)
        if (i || j) {
          const k2 = key(x + i, y + j);
          map.set(k2, (map.get(k2) || 0) + w * (i && j ? 0.12 : 0.28));
        }
  }
  return out;
}
