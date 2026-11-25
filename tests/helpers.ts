import { expect } from 'vitest';
import { caps } from '../src/js/sim/config.js';
import { Canopy } from '../src/js/sim/model.js';
import { Tree } from '../src/js/sim/tree.js';
import type { Caps, Profile, TreeState } from '../src/js/sim/types.js';

export { caps };

/** Mirrors studio plant(): grow to `start` completed seasons, then derive. */
export function plant(
  seed: number,
  profile: Profile,
  start: number,
  cap: Caps = caps.medium,
): { t: Tree; m: Canopy } {
  const t = new Tree(seed);
  t.base = t.edges[0].len;
  for (let i = 1; i < start; i++)
    t.advance(new Canopy(t, profile), profile, cap);
  const m = new Canopy(t, profile);
  t.base = m.live;
  return { t, m };
}

export function growYears(
  t: Tree,
  profile: Profile,
  years: number,
  cap: Caps = caps.medium,
): Canopy {
  let m: Canopy = new Canopy(t, profile);
  for (let i = 0; i < years; i++) {
    t.advance(m, profile, cap);
    m = new Canopy(t, profile);
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
