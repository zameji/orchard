import { describe, expect, it } from 'vitest';
import { Advisor } from '../src/js/app/advice.js';
import { plant, specs } from './helpers.js';

describe('Advisor', () => {
  it('refuses the rooted stem', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    expect(
      new Advisor(specs.appleSpur, 'normal', 5).recommend(m.list[0], m, t),
    ).toBeNull();
  });

  it('calls dead wood first with its union advice', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    const dead = m.list.find(
      (x) => x.par && x.s.role !== 'leader' && x.subLive / m.live <= 0.19,
    )!;
    dead.s.dead = true;
    const rec = new Advisor(specs.appleSpur, 'normal', 5).recommend(dead, m, t);
    expect(rec).not.toBeNull();
    expect(rec!.reason).toBe('Remove dead wood back at its union.');
  });

  it('stays silent past the annual removal budget', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    t.removed = t.base;
    const advisor = new Advisor(specs.appleSpur, 'normal', 5);
    const any = m.list.map((q) => advisor.recommend(q, m, t)).filter(Boolean);
    expect(any).toHaveLength(0);
  });

  it('avoids unrelated picks in guide text for vase habit', () => {
    const text = new Advisor(specs.appleTip, 'normal', 5).guide(5);
    expect(text).toContain('sunny bowl');
    expect(text).toContain(specs.appleTip.food);
  });

  it('narrates renovation stages', () => {
    const text = new Advisor(specs.appleSpur, 'renovate', 5).guide(7);
    expect(text).toContain('Renovation 3/3');
    expect(new Advisor(specs.appleSpur, 'renovate', 5).guide(5)).toContain(
      'Renovation 1/3',
    );
    expect(new Advisor(specs.appleSpur, 'renovate', 5).guide(20)).toContain(
      'Renovation 3/3',
    );
  });
});

describe('Advisor.related', () => {
  it('detects ancestor relations in both directions', () => {
    const { m } = plant(74129, specs.appleSpur, 5);
    const root = m.list[0];
    const grandkid = m.list.find((x) => x.par?.par)!;
    expect(grandkid).toBeTruthy();
    expect(Advisor.related(root, grandkid)).toBe(true);
    expect(Advisor.related(grandkid, root)).toBe(true);
    const unrelated = m.list.find(
      (x) => x.par && !Advisor.related(x, grandkid),
    )!;
    expect(Advisor.related(grandkid, unrelated)).toBe(false);
  });
});
