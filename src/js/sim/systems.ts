import type { TrainingForm, TrainingSystem } from './axes.js';

/** Growth constants and advice of each training-system form. */
export const forms: Record<TrainingSystem, TrainingForm> = {
  leader: {
    id: 'leader',
    label: 'Central leader / spindle',
    openCenter: false,
    scaffoldAngleDeg: null,
    leaderLateralLen: 1.03,
    scaffoldExtLen: 1.04,
    rootedSideCount: 3,
    leaderCutPenalty: 18,
    guide: 'Keep one leader, stagger wide scaffolds and taper the upper crown.',
    rec: {
      protectLeader: true,
      rules: [
        {
          w: 7,
          msg: 'Remove an upright competitor and keep one dominant leader.',
          when: (q) => q.rival,
        },
        {
          w: 3,
          msg: 'Thin crowded upper wood to keep the spindle tapered.',
          when: (q, m) => q.mid.y > m.height * 0.65 && q.light < 0.53,
        },
      ],
    },
  },
  vase: {
    id: 'vase',
    label: 'Open center / vase',
    openCenter: true,
    scaffoldAngleDeg: 38,
    leaderLateralLen: 1.26,
    scaffoldExtLen: 1.22,
    rootedSideCount: 4,
    leaderCutPenalty: 0,
    guide: 'Build a sunny bowl around three or four outward primary limbs.',
    rec: {
      protectLeader: false,
      rules: [
        {
          w: 6,
          msg: 'Open the central bowl to light for lower fruiting shoots.',
          when: (q, m) => q.rival || (q.inward && q.b.y > 0.45 * m.height),
        },
        {
          w: -5,
          msg: '',
          when: (q) => q.s.role === 'scaffold' && q.par?.s.role === 'leader',
        },
      ],
    },
  },
};

export const formList: TrainingForm[] = [forms.leader, forms.vase];
