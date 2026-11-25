import type { TrainingForm, TrainingSystem } from './axes.js';

/** Growth constants of each training-system form. */
export const forms: Record<TrainingSystem, TrainingForm> = {
  leader: {
    id: 'leader',
    label: 'Central leader / spindle',
    openCenter: false,
    scaffoldAngleDeg: null,
    leaderLateralLen: 1.03,
    scaffoldExtLen: 1.04,
    rootedSideCount: 3,
  },
  vase: {
    id: 'vase',
    label: 'Open center / vase',
    openCenter: true,
    scaffoldAngleDeg: 38,
    leaderLateralLen: 1.26,
    scaffoldExtLen: 1.22,
    rootedSideCount: 4,
  },
};

export const formList: TrainingForm[] = [forms.leader, forms.vase];
