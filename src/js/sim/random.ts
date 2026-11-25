export function mulberry32(s: number): () => number {
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless draws keep bud sites stable across inspection, undo and redraw.
export function noise(seed: number, id: number, k: number): number {
  let v =
    (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(k + 31, 0x85ebca6b)) >>>
    0;
  v = Math.imul(v ^ (v >>> 16), 0x7feb352d);
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}
