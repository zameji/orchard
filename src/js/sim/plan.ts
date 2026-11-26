import { clamp } from '../util.js';
import { Canopy } from './model.js';
import type { Tree } from './tree.js';
import type { TreeSpec } from './axes.js';
import type { Branch, CutPlan, Grade, Model, TreeState } from './types.js';

export const partNames = [
  'Light gain',
  'Structure / angles',
  'Canopy balance',
  '3Ds removed',
];

/** Plans non-mutating hypothetical cuts against one tree. */
export class CutPlanner {
  constructor(
    private readonly t: Tree,
    private readonly spec: TreeSpec,
  ) {}

  /** Non-mutating hypothetical cut: forked tree plus derived model. */
  plan(q: Branch, at: number): CutPlan {
    const f = this.t.forkCut(q, at);
    return {
      id: q.s.id,
      at,
      ids: f.ids,
      length: f.length,
      lost: f.lost,
      originals: f.originals,
      after: f.after,
      model: new Canopy(f.after, this.spec),
    };
  }
}

/** Grades candidate cuts into integer parts and a 0-100 score. */
export class Grader {
  constructor(
    private readonly t: TreeState,
    private readonly spec: TreeSpec,
  ) {}

  assess(q: Branch, c: CutPlan, m: Model): Grade {
    const thin = c.at === 0,
      a = c.model,
      frac = a.removal;
    // Compare the same surviving sites, not the means of two different sets.
    let lg = 0,
      w = 0;
    for (const k of a.list) {
      const old = m.map.get(k.s.id)!;
      lg += (k.light - old.light) * k.s.len;
      w += k.s.len;
    }
    lg /= Math.max(0.01, w);
    const opened = lg > 0.00005;
    const light = Math.round(
      clamp(lg * 830 + (thin && opened ? 2 : 0), -9, 16),
    );
    let structure = thin ? 3 : -9;
    if (thin && (q.narrow || q.rival)) structure += 8;
    if (thin && q.s.role === 'sprout') structure += 5;
    if (q.s.role === 'leader') structure -= this.spec.form.leaderCutPenalty;
    if (
      q.s.role === 'scaffold' &&
      q.s.fork &&
      q.angle >= 43 &&
      q.angle <= 63 &&
      !q.bad
    )
      structure -= 9;
    if (!thin) structure -= this.spec.species.headingStructurePenalty;
    const damaged =
      c.lost.reduce((v, s) => v + (m.map.get(s.id)!.bad ? s.len : 0), 0) +
      (q.bad && c.at ? q.s.len * (1 - c.at) : 0);
    const ds = Math.round(
      clamp(
        damaged /
          Math.max(
            0.02,
            c.lost.reduce((x, s) => x + s.len, 0) +
              (c.at ? q.s.len * (1 - c.at) : 0),
          ),
      ) * 15,
    );
    const fruitLoss = (m.fruitCount - a.fruitCount) / Math.max(1, m.fruitCount);
    const zoneLoss =
      Math.max(0, m.productive - a.productive) / Math.max(1, m.productive);
    let balance = Math.round(
      5 -
        42 * Math.max(0, fruitLoss) -
        22 * zoneLoss -
        (22 * c.length) / this.t.base -
        150 * Math.max(0, frac - this.spec.species.budget),
    );
    if (!thin && q.age <= 1) balance -= this.spec.habit.youngHeadingPenalty;
    const pts = [light, structure, balance, ds],
      score = clamp(58 + pts.reduce((x, y) => x + y, 0), 0, 100);
    return { pts, score, delta: a.score - m.score, lg };
  }
}
