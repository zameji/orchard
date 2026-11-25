import { expect } from 'vitest';
import { caps } from '../src/js/sim/config.js';
import { derive } from '../src/js/sim/model.js';
import { advance, fresh } from '../src/js/sim/tree.js';
import type { Caps, Model, Profile, TreeState } from '../src/js/sim/types.js';

export { caps, derive, advance, fresh };

/** Mirrors studio plant(): grow to `start` completed seasons, then derive. */
export function plant(
  seed: number,
  profile: Profile,
  start: number,
  cap: Caps = caps.medium,
): { t: TreeState; m: Model } {
  const t = fresh(seed);
  t.base = t.edges[0].len;
  for (let i = 1; i < start; i++) advance(t, derive(t, profile), profile, cap);
  const m = derive(t, profile);
  t.base = m.live;
  return { t, m };
}

export function growYears(
  t: TreeState,
  profile: Profile,
  years: number,
  cap: Caps = caps.medium,
): Model {
  let m = derive(t, profile);
  for (let i = 0; i < years; i++) {
    advance(t, m, profile, cap);
    m = derive(t, profile);
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
