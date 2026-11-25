import type { FruitPalette, Habit, HabitId } from './axes.js';

const easyStress = { on: 2.1, gain: 0.1, cap: 0.17 };

const redPalette: FruitPalette = {
  h: { base: 0.009, oneMinusEx: 0.052, ex: 0, shade: 0.014 },
  s: { base: 0.6, ex: 0.16 },
  l: { base: 0.34, ex: 0.113, shade: 0, boost: 0 },
};

const cherryFruit: FruitPalette = {
  h: { base: 0.987, oneMinusEx: 0, ex: 0, shade: 0.012 },
  s: { base: 0.72, ex: 0 },
  l: { base: 0.17, ex: 0.19, shade: 0, boost: 0 },
};

export const habitList: Habit[] = [
  {
    id: 'spur',
    label: 'Spur-bearing',
    text: 'Keep bright, compact spurs on two- to four-year wood.',
    naturalForm: 'leader',
    species: ['apple'],
    spurIntensity: 1,
    spurGoodMaxAge: 4,
    spurStationsPerM: 10,
    shootOne: { kind: 'terminal', terminal: 0.1, lateral: 0 },
    shootStations: { kind: 'const', n: 1 },
    shootPlacement: { kind: 'tip' },
    doubleFruitThreshold: 0.71,
    floralShare: 0.13,
    stress: { on: 0.78, gain: 0.63, cap: 0.82 },
    youngHeadingPenalty: 0,
    youngAdviceGuard: 0,
    yieldZoneLabel: 'fruiting zones',
    render: {
      fruitPalettes: [redPalette],
    },
  },
  {
    id: 'tip',
    label: 'Tip-bearing',
    text: 'Preserve last year’s lateral terminals; heading removes their crop.',
    naturalForm: 'vase',
    species: ['apple'],
    spurIntensity: 0.1,
    spurGoodMaxAge: 4,
    spurStationsPerM: 7,
    shootOne: { kind: 'terminal', terminal: 1, lateral: 0.04 },
    shootStations: { kind: 'const', n: 1 },
    shootPlacement: { kind: 'tip' },
    floralShare: 0.55,
    stress: easyStress,
    youngHeadingPenalty: 6,
    youngAdviceGuard: 0,
    yieldZoneLabel: 'renewal wood',
    render: {
      fruitPalettes: [
        {
          h: { base: 0.196, oneMinusEx: 0, ex: 0, shade: 0.039 },
          s: { base: 0.54, ex: 0 },
          l: { base: 0.38, ex: 0.092, shade: 0, boost: 0 },
        },
      ],
    },
  },
  {
    id: 'mixed',
    label: 'Mixed-bearing',
    text: 'Retain mixed spurs and terminals.',
    naturalForm: 'leader',
    species: ['apple'],
    spurIntensity: 0.62,
    spurGoodMaxAge: 4,
    spurStationsPerM: 7,
    shootOne: { kind: 'terminal', terminal: 0.76, lateral: 0.1 },
    shootStations: { kind: 'const', n: 1 },
    shootPlacement: { kind: 'tip' },
    fruitDiameter: 0.088,
    floralShare: 0.25,
    stress: easyStress,
    youngHeadingPenalty: 0,
    youngAdviceGuard: 0,
    yieldZoneLabel: 'fruiting zones',
    render: {
      fruitPalettes: [
        {
          maxShade: 0.57,
          h: { base: 0.1, oneMinusEx: 0, ex: 0, shade: 0.036 },
          s: { base: 0.52, ex: 0 },
          l: { base: 0.38, ex: 0.083, shade: 0, boost: 0 },
        },
        redPalette,
      ],
    },
  },
  {
    id: 'sweet',
    label: 'Sweet cherry',
    text: 'Save short laterals and bright two- to five-year spurs.',
    naturalForm: 'leader',
    species: ['cherry'],
    spurIntensity: 0.94,
    spurGoodMaxAge: 5,
    spurStationsPerM: 7,
    shootOne: { kind: 'short', limit: 0.35, short: 0.46, long: 0.08 },
    shootStations: { kind: 'const', n: 1 },
    shootPlacement: { kind: 'tip' },
    floralShare: 0.13,
    stress: easyStress,
    youngHeadingPenalty: 0,
    youngAdviceGuard: 0,
    yieldZoneLabel: 'fruiting zones',
    render: {
      fruitPalettes: [cherryFruit],
    },
  },
  {
    id: 'tart',
    label: 'Tart cherry',
    text: 'Keep both young terminals and illuminated spur-bearing wood.',
    naturalForm: 'vase',
    species: ['cherry'],
    spurIntensity: 0.48,
    spurGoodMaxAge: 4,
    spurStationsPerM: 7,
    shootOne: { kind: 'terminal', terminal: 0.93, lateral: 0.36 },
    shootStations: { kind: 'const', n: 2 },
    shootPlacement: { kind: 'firstAt', at: 0.62 },
    floralShare: 0.34,
    stress: easyStress,
    youngHeadingPenalty: 0,
    youngAdviceGuard: 0,
    yieldZoneLabel: 'fruiting zones',
    render: {
      fruitPalettes: [
        { ...cherryFruit, l: { ...cherryFruit.l, boost: 0.056 } },
      ],
    },
  },
  {
    id: 'renewal',
    label: 'Renewal on one-year wood',
    text: 'Renew sunlit one-year shoots in the lower and middle bowl; old spurs do not crop.',
    naturalForm: 'vase',
    species: ['peach'],
    spurIntensity: 0,
    spurGoodMaxAge: 4,
    spurStationsPerM: 7,
    shootOne: { kind: 'always', v: 1 },
    shootStations: { kind: 'perLength', min: 2, perM: 8 },
    shootPlacement: { kind: 'spread', base: 0.14, span: 0.72 },
    floralShare: 0.13,
    stress: easyStress,
    youngHeadingPenalty: 6,
    youngAdviceGuard: 2,
    yieldZoneLabel: 'renewal wood',
    render: {
      fruitPalettes: [
        {
          h: { base: 0.046, oneMinusEx: 0, ex: 0, shade: 0.064 },
          s: { base: 0.86, ex: 0 },
          l: { base: 0.53, ex: 0.084, shade: 0, boost: 0 },
        },
      ],
    },
  },
];

export const habits: Record<HabitId, Habit> = Object.fromEntries(
  habitList.map((h) => [h.id, h]),
) as Record<HabitId, Habit>;
