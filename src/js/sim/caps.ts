import type { Caps, CapsKey } from './types.js';

/** Quality tiers bounding segment/leaf budgets and pixel ratio. */
export const caps: Record<CapsKey, Caps> = {
  low: {
    max: 1500,
    sides: 5,
    density: 0.85,
    clusters: 5600,
    dpr: 1.5,
    leaves: 4,
  },
  medium: {
    max: 4000,
    sides: 7,
    density: 1.12,
    clusters: 13500,
    dpr: 1.8,
    leaves: 5,
  },
  high: {
    max: 10000,
    sides: 9,
    density: 1.38,
    clusters: 31000,
    dpr: 2.4,
    leaves: 5,
  },
  ultra: {
    max: 20000,
    sides: 12,
    density: 1.65,
    clusters: 56000,
    dpr: 3,
    leaves: 6,
  },
};
