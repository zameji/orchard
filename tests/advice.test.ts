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

  it('pins its whole-tree recommendations for a leader form', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    const advisor = new Advisor(specs.appleSpur, 'normal', 5);
    const recs = m.list
      .map((q) => advisor.recommend(q, m, t))
      .filter((r) => r !== null)
      .map((r) => [r!.q.s.id, r!.weight, r!.reason]);
    expect(recs).toEqual([
      [30, 4.5177274882355025, 'Thin the low, downward-growing limb.'],
      [32, 11.52958608581751, 'These intersecting shoot paths risk rubbing.'],
      [34, 17.756086382142186, 'These intersecting shoot paths risk rubbing.'],
      [
        44,
        3.7665546594224524,
        'A narrow V union competes with wider scaffold attachments.',
      ],
      [
        46,
        3.7629735740016157,
        'A narrow V union competes with wider scaffold attachments.',
      ],
      [48, 4.558196965351081, 'Thin the low, downward-growing limb.'],
      [49, 6.953440624853813, 'These intersecting shoot paths risk rubbing.'],
      [
        54,
        6.956442938305673,
        'Remove an upright competitor and keep one dominant leader.',
      ],
      [55, 4.566744119083554, 'Thin the low, downward-growing limb.'],
      [
        56,
        3.7727107572167395,
        'A narrow V union competes with wider scaffold attachments.',
      ],
    ]);
  });

  it('pins its whole-tree recommendations for a vase form', () => {
    const { t, m } = plant(74129, specs.appleTip, 5);
    const advisor = new Advisor(specs.appleTip, 'normal', 5);
    const recs = m.list
      .map((q) => advisor.recommend(q, m, t))
      .filter((r) => r !== null)
      .map((r) => [r!.q.s.id, r!.weight, r!.reason]);
    expect(recs).toEqual([
      [13, 4.4175165093844875, 'Thin the low, downward-growing limb.'],
      [14, 4.468149320065752, 'Thin the low, downward-growing limb.'],
      [22, 4.5444810630724035, 'Thin the low, downward-growing limb.'],
      [23, 4.464838529002059, 'Thin the low, downward-growing limb.'],
      [
        25,
        2.7573466917545293,
        'A narrow V union competes with wider scaffold attachments.',
      ],
      [27, 4.508400625373045, 'Thin the low, downward-growing limb.'],
      [28, 4.5130612146483795, 'Thin the low, downward-growing limb.'],
      [29, 4.461981664597286, 'Thin the low, downward-growing limb.'],
      [30, 4.518538844381755, 'Thin the low, downward-growing limb.'],
      [31, 8.294349936067894, 'Thin the low, downward-growing limb.'],
      [
        32,
        3.702606233944358,
        'A narrow V union competes with wider scaffold attachments.',
      ],
      [37, 4.554141304541135, 'Thin the low, downward-growing limb.'],
      [38, 4.556634528299835, 'Thin the low, downward-growing limb.'],
      [39, 4.551658890787847, 'Thin the low, downward-growing limb.'],
      [42, 4.56532346180527, 'Thin the low, downward-growing limb.'],
      [
        44,
        3.7603403677939715,
        'A narrow V union competes with wider scaffold attachments.',
      ],
      [45, 4.54933674920037, 'Thin the low, downward-growing limb.'],
      [47, 4.543336629313544, 'Thin the low, downward-growing limb.'],
      [49, 4.5556929402296715, 'Thin the low, downward-growing limb.'],
      [51, 4.5617473258571275, 'Thin the low, downward-growing limb.'],
      [52, 4.567777563790791, 'Thin the low, downward-growing limb.'],
      [53, 8.565124249204638, 'Thin the low, downward-growing limb.'],
    ]);
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
