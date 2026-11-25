import { describe, expect, it } from 'vitest';
import { profiles } from '../src/js/sim/config.js';
import { guideText, recommendation, related } from '../src/js/app/advice.js';
import { plant } from './helpers.js';

describe('recommendation', () => {
  it('refuses the rooted stem', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    expect(
      recommendation(m.list[0], m, t, 'leader', profiles[0], 5),
    ).toBeNull();
  });

  it('calls dead wood first with its union advice', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    const dead = m.list.find(
      (x) => x.par && x.s.role !== 'leader' && x.subLive / m.live <= 0.19,
    )!;
    dead.s.dead = true;
    const rec = recommendation(dead, m, t, 'leader', profiles[0], 5);
    expect(rec).not.toBeNull();
    expect(rec!.reason).toBe('Remove dead wood back at its union.');
  });

  it('stays silent past the annual removal budget', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    t.removed = t.base;
    const any = m.list
      .map((q) => recommendation(q, m, t, 'leader', profiles[0], 5))
      .filter(Boolean);
    expect(any).toHaveLength(0);
  });

  it('avoids unrelated picks in guide text for vase habit', () => {
    const text = guideText(profiles[1], 'vase', 5, 5);
    expect(text).toContain('sunny bowl');
    expect(text).toContain(profiles[1].food);
  });

  it('narrates renovation stages', () => {
    const text = guideText(profiles[0], 'renovate', 7, 5);
    expect(text).toContain('Renovation 3/3');
    expect(guideText(profiles[0], 'renovate', 5, 5)).toContain(
      'Renovation 1/3',
    );
    expect(guideText(profiles[0], 'renovate', 20, 5)).toContain(
      'Renovation 3/3',
    );
  });
});

describe('related', () => {
  it('detects ancestor relations in both directions', () => {
    const { m } = plant(74129, profiles[0], 5);
    const root = m.list[0];
    const grandkid = m.list.find((x) => x.par?.par)!;
    expect(grandkid).toBeTruthy();
    expect(related(root, grandkid)).toBe(true);
    expect(related(grandkid, root)).toBe(true);
    const unrelated = m.list.find((x) => x.par && !related(x, grandkid))!;
    expect(related(grandkid, unrelated)).toBe(false);
  });
});
