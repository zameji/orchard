import { expect } from 'vitest';
import { caps } from '../src/js/sim/caps.js';
import { Canopy } from '../src/js/sim/model.js';
import { resolve } from '../src/js/sim/spec.js';
import { Tree } from '../src/js/sim/tree.js';
import type { TreeSpec } from '../src/js/sim/axes.js';
import type { Caps, TreeState } from '../src/js/sim/types.js';

export { caps };

/** The six classic configurations, one per historic profile row. */
export const specs = {
  appleSpur: resolve('apple', 'spur', 'upright', 'leader'),
  appleTip: resolve('apple', 'tip', 'spreading', 'vase'),
  appleMixed: resolve('apple', 'mixed', 'vigorous', 'leader'),
  cherrySweet: resolve('cherry', 'sweet', 'upright', 'leader'),
  cherryTart: resolve('cherry', 'tart', 'bush', 'vase'),
  peachRenewal: resolve('peach', 'renewal', 'standard', 'vase'),
};

/** Mirrors studio plant(): grow to `start` completed seasons, then derive. */
export function plant(
  seed: number,
  spec: TreeSpec,
  start: number,
  cap: Caps = caps.medium,
): { t: Tree; m: Canopy } {
  const t = new Tree(seed);
  t.base = t.edges[0].len;
  for (let i = 1; i < start; i++) t.advance(new Canopy(t, spec), spec, cap);
  const m = new Canopy(t, spec);
  t.base = m.live;
  return { t, m };
}

export function growYears(
  t: Tree,
  spec: TreeSpec,
  years: number,
  cap: Caps = caps.medium,
): Canopy {
  let m: Canopy = new Canopy(t, spec);
  for (let i = 0; i < years; i++) {
    t.advance(m, spec, cap);
    m = new Canopy(t, spec);
  }
  return m;
}

export function assertInvariants(t: TreeState, cap: Caps) {
  const ids = new Set<number>();
  for (const s of t.edges) {
    expect(t.edges.indexOf(s)).toBeLessThanOrEqual(t.edges.length);
    expect(ids.has(s.id)).toBe(false);
    expect(s.id).toBeGreaterThanOrEqual(1);
    if (s.p !== 0) expect(ids.has(s.p)).toBe(true);
    expect(s.len).toBeGreaterThan(0);
    expect(s.at).toBeGreaterThan(0);
    expect(s.at).toBeLessThanOrEqual(1);
    ids.add(s.id);
  }
  expect(t.edges.length).toBeLessThanOrEqual(cap.max);
}
