import { clamp } from '../util.js';
import { budget } from './config.js';
import { Canopy } from './model.js';
import type { Tree } from './tree.js';
import type {
  Branch,
  CutPlan,
  Grade,
  Model,
  Profile,
  TrainingSystem,
  TreeState,
} from './types.js';

export const partNames = [
  'Light gain',
  'Structure / angles',
  'Canopy balance',
  '3Ds removed',
];

/** Non-mutating hypothetical cut: forked tree plus derived model. */
export function cutPlan(
  t: Tree,
  q: Branch,
  at: number,
  profile: Profile,
): CutPlan {
  const f = t.forkCut(q, at);
  return {
    id: q.s.id,
    at,
    ids: f.ids,
    length: f.length,
    lost: f.lost,
    originals: f.originals,
    after: f.after,
    model: new Canopy(f.after, profile),
  };
}

export function assess(
  q: Branch,
  c: CutPlan,
  m: Model,
  t: TreeState,
  system: TrainingSystem,
  profile: Profile,
): Grade {
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
  const light = Math.round(clamp(lg * 830 + (thin && opened ? 2 : 0), -9, 16));
  let structure = thin ? 3 : -9;
  if (thin && (q.narrow || q.rival)) structure += 8;
  if (thin && q.s.role === 'sprout') structure += 5;
  if (q.s.role === 'leader' && system === 'leader') structure -= 18;
  if (
    q.s.role === 'scaffold' &&
    q.s.fork &&
    q.angle >= 43 &&
    q.angle <= 63 &&
    !q.bad
  )
    structure -= 9;
  if (!thin && profile.sp !== 'Apple') structure -= 7;
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
      (22 * c.length) / t.base -
      150 * Math.max(0, frac - budget(profile)),
  );
  if (
    !thin &&
    (profile.mode === 'tip' || profile.mode === 'peach') &&
    q.age <= 1
  )
    balance -= 6;
  const pts = [light, structure, balance, ds],
    score = clamp(58 + pts.reduce((x, y) => x + y, 0), 0, 100);
  return { pts, score, delta: a.score - m.score, lg };
}
