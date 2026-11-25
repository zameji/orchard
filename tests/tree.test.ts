import { describe, expect, it } from 'vitest';
import { Canopy } from '../src/js/sim/model.js';
import { withForm } from '../src/js/sim/spec.js';
import { Tree } from '../src/js/sim/tree.js';
import { assertInvariants, caps, growYears, plant, specs } from './helpers.js';

describe('Tree', () => {
  it('plants a single rooted leader in year 1', () => {
    const t = new Tree(74129);
    expect(t.year).toBe(1);
    expect(t.edges).toHaveLength(1);
    const e = t.edges[0];
    expect(e.id).toBe(1);
    expect(e.p).toBe(0);
    expect(e.role).toBe('leader');
    expect(e.born).toBe(1);
    expect(e.len).toBeGreaterThan(0.6);
    expect(e.len).toBeLessThan(0.75);
    assertInvariants(t, caps.medium);
  });

  it('is seed-deterministic', () => {
    expect(new Tree(99)).toEqual(new Tree(99));
    expect(new Tree(99).edges[0].len).not.toBe(new Tree(100).edges[0].len);
  });
});

describe('growth', () => {
  it('keeps structural invariants across specs, seeds and years', () => {
    for (const spec of Object.values(specs))
      for (const seed of [1, 74129, 4294967295]) {
        const t = new Tree(seed);
        t.base = t.edges[0].len;
        for (let y = 0; y < 8; y++) {
          t.advance(new Canopy(t, spec), spec, caps.medium);
          assertInvariants(t, caps.medium);
        }
      }
  });

  it('is fully deterministic for a fixed scenario', () => {
    const a = plant(74129, specs.appleSpur, 5);
    const b = plant(74129, specs.appleSpur, 5);
    expect(JSON.stringify(a.t.edges)).toBe(JSON.stringify(b.t.edges));
    expect(a.m.score).toBe(b.m.score);
    expect(a.m.fruitCount).toBe(b.m.fruitCount);
  });

  it('produces a different tree for a different seed', () => {
    const a = plant(1, specs.appleSpur, 5);
    const b = plant(2, specs.appleSpur, 5);
    expect(JSON.stringify(a.t.edges)).not.toBe(JSON.stringify(b.t.edges));
  });

  it('respects the segment cap on a low tier', () => {
    const t = new Tree(74129);
    t.base = t.edges[0].len;
    for (let y = 0; y < 12; y++)
      t.advance(new Canopy(t, specs.appleSpur), specs.appleSpur, caps.low);
    expect(t.edges.length).toBeLessThanOrEqual(caps.low.max);
    assertInvariants(t, caps.low);
  });

  it('matches golden metrics for the default planting card', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    expect(t.year).toBe(5);
    expect(t.edges.length).toBe(57);
    expect(m.score).toBe(49);
    expect(m.fruitCount).toBe(0);
    expect(+m.height.toFixed(2)).toBe(2.89);
    expect(+m.live.toFixed(3)).toBe(23.588);
    expect(t.edges.length).toBeGreaterThan(4);
  });

  it('keeps golden metrics stable through year advance', () => {
    const { t } = plant(74129, specs.appleSpur, 5);
    const m = growYears(t, specs.appleSpur, 3);
    expect(t.year).toBe(8);
    expect(t.edges.length).toBe(162);
    expect(m.score).toBe(49);
    expect(m.fruitCount).toBe(53);
    expect(t.stress).toBe(0);
  });

  it('keeps cherry and peach golden metrics', () => {
    const c = plant(74129, specs.cherrySweet, 5);
    expect(c.m.score).toBe(51);
    expect(c.m.fruitCount).toBe(3);
    const p = plant(74129, specs.peachRenewal, 5);
    expect(p.m.score).toBe(62);
    expect(p.m.fruitCount).toBe(41);
  });

  it('grows the selected form, not the habit default', () => {
    const vase = plant(74129, specs.appleTip, 6);
    const leader = plant(74129, withForm(specs.appleTip, 'leader'), 6);
    expect(JSON.stringify(vase.t.edges)).not.toBe(
      JSON.stringify(leader.t.edges),
    );
    // Open center: the rooted stem never extends; leader form keeps a trunk.
    expect(vase.t.edges.filter((e) => e.role === 'leader')).toHaveLength(1);
    expect(
      leader.t.edges.filter((e) => e.role === 'leader').length,
    ).toBeGreaterThan(1);
  });
});

describe('stress and regrowth', () => {
  it('flags stress when fruit load passes the spur threshold', () => {
    const { t, m } = plant(74129, specs.appleSpur, 6);
    const load = m.fruitCount / Math.max(1, m.live);
    growYears(t, specs.appleSpur, 1);
    if (load > 0.78) expect(t.stress).toBeGreaterThan(0);
    else expect(t.stress).toBe(0);
  });

  it('sprouts watersprouts after a heading cut', () => {
    const { t } = plant(74129, specs.appleSpur, 5);
    const target = t.edges.find((e) => e.role === 'scaffold')!;
    expect(target).toBeTruthy();
    target.head = t.year;
    const before = t.edges.length;
    const m = growYears(t, specs.appleSpur, 1);
    expect(t.edges.length).toBeGreaterThan(before);
    expect(
      t.edges.filter((e) => e.role === 'sprout' && e.born === t.year),
    ).not.toHaveLength(0);
    assertInvariants(t, caps.medium);
    expect(m.list.length).toBeGreaterThan(0);
  });
});
