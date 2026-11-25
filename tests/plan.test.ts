import { describe, expect, it } from 'vitest';
import { profiles } from '../src/js/sim/config.js';
import { assess, cutPlan } from '../src/js/sim/plan.js';
import type { Edge } from '../src/js/sim/types.js';
import { plant } from './helpers.js';

describe('cutPlan', () => {
  it('never mutates the tree it plans against', () => {
    const { t } = plant(74129, profiles[0], 5);
    const snapshot = JSON.stringify(t);
    const q = plant(74129, profiles[0], 5).m.list[1];
    cutPlan(t, q, 0, profiles[0]);
    cutPlan(t, q, 0.5, profiles[0]);
    expect(JSON.stringify(t)).toBe(snapshot);
  });

  it('removes exactly the subtree on a thinning cut', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    const q = m.list.find((x) => x.kids.length > 0)!;
    const subtree = new Set<number>();
    const stack = [q];
    while (stack.length) {
      const k = stack.pop()!;
      subtree.add(k.s.id);
      stack.push(...k.kids);
    }
    const plan = cutPlan(t, q, 0, profiles[0]);
    expect(plan.ids).toEqual(subtree);
    expect(plan.lost.map((s) => s.id).sort()).toEqual([...subtree].sort());
    for (const s of plan.after.edges) expect(subtree.has(s.id)).toBe(false);
    expect(plan.after.removed).toBeGreaterThan(t.removed);
  });

  it('keeps lower children and retimes them on a heading cut', () => {
    const { t, m } = plant(74129, profiles[0], 8);
    const q = m.list.find((x) => x.kids.some((k) => k.s.at < 0.5))!;
    const at = 0.5;
    const plan = cutPlan(t, q, at, profiles[0]);
    const kept = plan.after.edges.find((s) => s.id === q.s.id)!;
    expect(kept.len).toBeCloseTo(q.s.len * at, 9);
    expect(kept.head).toBe(t.year);
    for (const k of q.kids) {
      const next = plan.after.edges.find((s) => s.id === k.s.id);
      if (k.s.at >= at) expect(next).toBeUndefined();
      else expect(next!.at).toBeCloseTo(k.s.at / at, 9);
    }
    expect(plan.lost.some((s) => s.id === q.s.id)).toBe(false);
  });

  it('supports exact undo through its recorded originals', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    const q = m.list.find((x) => x.kids.length > 0)!;
    const before = JSON.stringify(t.edges);
    const plan = cutPlan(t, q, 0, profiles[0]);
    const map = new Map(plan.originals.map((s) => [s.id, s] as [number, Edge]));
    const restored = plan.after.edges
      .map((s) => map.get(s.id) || s)
      .concat(plan.lost)
      .sort((a, b) => a.id - b.id);
    expect(JSON.stringify(restored)).toBe(before);
  });
});

describe('assess', () => {
  it('grades within fixed bounds', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    const q = m.list.find((x) => x.kids.length > 0)!;
    const plan = cutPlan(t, q, 0, profiles[0]);
    const grade = assess(q, plan, m, t, 'leader', profiles[0]);
    expect(grade.pts).toHaveLength(4);
    expect(grade.score).toBeGreaterThanOrEqual(0);
    expect(grade.score).toBeLessThanOrEqual(100);
    expect(grade.delta).toBe(plan.model.score - m.score);
    for (const p of grade.pts) expect(Number.isInteger(p)).toBe(true);
  });

  it('penalizes cutting the leader in a leader-trained system', () => {
    const { t, m } = plant(74129, profiles[0], 5);
    const leader = m.list.find((x) => x.s.role === 'leader' && x.kids.length)!;
    const plan = cutPlan(t, leader, 0, profiles[0]);
    const grade = assess(leader, plan, m, t, 'leader', profiles[0]);
    const vaseGrade = assess(leader, plan, m, t, 'vase', profiles[0]);
    expect(grade.pts[1]).toBe(vaseGrade.pts[1] - 18);
    expect(grade.pts[1]).toBe(-15);
  });
});
