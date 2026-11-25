import { describe, expect, it } from 'vitest';
import { exposures, sunDir } from '../src/js/sim/light.js';
import { Canopy } from '../src/js/sim/model.js';
import { plant, specs } from './helpers.js';

describe('Canopy', () => {
  it('does not mutate the tree state', () => {
    const { t } = plant(74129, specs.appleSpur, 5);
    const snapshot = JSON.stringify(t);
    void new Canopy(t, specs.appleSpur);
    void new Canopy(t, specs.appleSpur);
    expect(JSON.stringify(t)).toBe(snapshot);
  });

  it('is deterministic and order-independent to read', () => {
    const { t } = plant(74129, specs.appleSpur, 5);
    const a = new Canopy(t, specs.appleSpur),
      b = new Canopy(t, specs.appleSpur);
    expect(a.score).toBe(b.score);
    expect(a.fruitCount).toBe(b.fruitCount);
    expect(a.list.map((q) => q.light)).toEqual(b.list.map((q) => q.light));
    expect(a.list.map((q) => q.r)).toEqual(b.list.map((q) => q.r));
  });

  it('computes parent-child geometry consistently', () => {
    const { m } = plant(74129, specs.appleSpur, 5);
    for (const q of m.list) {
      expect(q.r).toBeGreaterThan(0);
      if (q.par)
        expect(q.a.distanceTo(q.par.b)).toBeLessThan(q.par.s.len + 1e-9);
      expect(q.b.distanceTo(q.a)).toBeCloseTo(q.s.len, 6);
      expect(q.subCount).toBeGreaterThanOrEqual(1);
      if (q.par) expect(q.par.subCount).toBeGreaterThan(q.subCount);
    }
  });

  it('scores stay within 0..100 and light within bounds', () => {
    const { m } = plant(74129, specs.appleSpur, 5);
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
    for (const q of m.list) {
      expect(q.light).toBeGreaterThanOrEqual(0.075);
      expect(q.light).toBeLessThanOrEqual(1);
    }
    expect(m.avg).toBeGreaterThan(0);
    expect(m.health).toBeGreaterThan(0);
    expect(m.removal).toBe(0);
  });
});

describe('exposures', () => {
  it('returns bounded, deterministic values', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    const s = sunDir(12);
    const a = exposures(m.list, s),
      b = exposures(m.list, s);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const x of a) {
      expect(x).toBeGreaterThanOrEqual(0.075);
      expect(x).toBeLessThanOrEqual(1);
    }
    expect(a).toHaveLength(t.edges.length);
  });

  it('brightens the sunward side of the canopy', () => {
    const { m } = plant(74129, specs.appleSpur, 8);
    const s = sunDir(12);
    const lit = exposures(m.list, s);
    let sunward = 0,
      shaded = 0;
    for (const q of m.list) {
      if (q.mid.dot(s) > 0.35) sunward += lit[q.i];
      else if (q.mid.dot(s) < -0.35) shaded += lit[q.i];
    }
    expect(sunward).toBeGreaterThan(shaded);
  });
});
