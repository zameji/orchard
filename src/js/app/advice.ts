import { clamp } from '../util.js';
import { budget } from '../sim/config.js';
import type {
  Branch,
  Model,
  Profile,
  Rec,
  TrainingSystem,
  TreeState,
} from '../sim/types.js';

export function stage(year: number, renovationStart: number) {
  return clamp(1 + year - renovationStart, 1, 3);
}

export function guideText(
  profile: Profile,
  system: TrainingSystem,
  year: number,
  renovationStart: number,
) {
  const fit =
    system === profile.sys
      ? 'A natural match for this habit.'
      : system === 'renovate'
        ? 'Spread correction over several seasons.'
        : 'An alternative form; do not force it with large cuts.';
  const text =
    system === 'leader'
      ? 'Keep one leader, stagger wide scaffolds and taper the upper crown.'
      : system === 'vase'
        ? 'Build a sunny bowl around three or four outward primary limbs.'
        : `Renovation ${stage(year, renovationStart)}/3: ${
            [
              'remove 3Ds first; leave major height changes for later',
              'thin crowding and competing uprights in stages',
              'renew aging fruiting zones and reassess height',
            ][stage(year, renovationStart) - 1]
          }.`;
  return fit + ' ' + text + ' ' + profile.food;
}

export function recommendation(
  q: Branch,
  m: Model,
  t: TreeState,
  system: TrainingSystem,
  profile: Profile,
  renovationStart: number,
): Rec | null {
  if (!q.par || (!q.s.fork && !q.s.dead && !q.bad) || q.subLive / m.live > 0.19)
    return null;
  if ((t.removed + q.subLive) / t.base > budget(profile)) return null;
  let weight = 0,
    reason = '',
    best = 0;
  const add = (x: number, msg: string) => {
    if (x > 0) {
      if (x > best) {
        best = x;
        reason = msg;
      }
      weight += x;
    }
  };
  add(q.s.dead ? 12 : 0, 'Remove dead wood back at its union.');
  add(
    q.weak ? 6 : 0,
    'This weak, shaded shoot has little productive extension.',
  );
  add(q.cross ? 7 : 0, 'These intersecting shoot paths risk rubbing.');
  add(q.inward ? 4 : 0, 'This inward shoot crowds the interior.');
  add(q.down ? 4.6 : 0, 'Thin the low, downward-growing limb.');
  add(
    q.narrow ? 3.8 : 0,
    'A narrow V union competes with wider scaffold attachments.',
  );
  add(
    q.s.role === 'sprout' ? 5 : 0,
    'Thin a vigorous upright instead of heading it again.',
  );
  if (system === 'leader') {
    if (q.s.role === 'leader') return null;
    add(
      q.rival ? 7 : 0,
      'Remove an upright competitor and keep one dominant leader.',
    );
    add(
      q.mid.y > m.height * 0.65 && q.light < 0.53 ? 3 : 0,
      'Thin crowded upper wood to keep the spindle tapered.',
    );
  } else if (system === 'vase') {
    add(
      q.rival || (q.inward && q.b.y > 0.45 * m.height) ? 6 : 0,
      'Open the central bowl to light for lower fruiting shoots.',
    );
    if (q.s.role === 'scaffold' && q.par.s.role === 'leader') weight -= 5;
  } else {
    const st = stage(t.year, renovationStart);
    if (st === 1 && q.bad) weight += 3;
    if (st === 2)
      add(
        q.rival || q.cross ? 4 : 0,
        'Relieve one congested upper zone this season.',
      );
    if (st === 3)
      add(
        q.age >= 4 && q.light < 0.56 ? 4 : 0,
        'Renew this aging, shaded fruiting zone in stages.',
      );
  }
  weight -=
    (4 * q.subFruit) / Math.max(1, m.fruitCount) + (3 * q.subLive) / m.live;
  if (profile.sp === 'Peach' && q.age === 1 && q.light > 0.65) weight -= 2;
  if (q.angle >= 45 && q.angle <= 60 && !q.bad && q.s.role === 'scaffold')
    weight -= 2;
  return weight > 1.15 ? { q, weight, reason } : null;
}

export function related(a: Branch, b: Branch) {
  for (let p: Branch | undefined = a; p; p = p.par) if (p === b) return true;
  for (let p: Branch | undefined = b; p; p = p.par) if (p === a) return true;
  return false;
}
