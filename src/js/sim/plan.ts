import { clamp } from '../util.js';
import { budget } from './config.js';
import { derive } from './model.js';
import type {
  Branch,
  CutPlan,
  Edge,
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

// Make a non-mutating hypothetical graph. Only children attached above
// a heading cut are lost; lower attachments are reparameterized in place.
export function cutPlan(
  t: TreeState,
  q: Branch,
  at: number,
  profile: Profile,
): CutPlan {
  const ids = new Set<number>(),
    stack = at === 0 ? [q] : q.kids.filter((k) => k.s.at >= at);
  while (stack.length) {
    const k = stack.pop()!;
    ids.add(k.s.id);
    for (const c of k.kids) stack.push(c);
  }
  const edges: Edge[] = [],
    originals: Edge[] = [],
    lost: Edge[] = [];
  let length = 0;
  for (const s of t.edges) {
    if (ids.has(s.id)) {
      lost.push(s);
      if (!s.dead) length += s.len;
      continue;
    }
    let next = s;
    if (s.id === q.s.id && at > 0) {
      if (!s.dead) length += s.len * (1 - at);
      next = { ...s, len: s.len * at, head: t.year, load: s.load * at };
    } else if (at > 0 && s.p === q.s.id) next = { ...s, at: s.at / at };
    else if (at === 0 && s.id === q.s.p) next = { ...s, release: t.year };
    if (next !== s) originals.push(s);
    edges.push(next);
  }
  const after = { ...t, edges, removed: t.removed + length },
    model = derive(after, profile);
  return { id: q.s.id, at, ids, length, lost, originals, after, model };
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
