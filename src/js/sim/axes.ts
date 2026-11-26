/**
 * The four axis vocabularies a tree is composed from: species, habit,
 * cultivar and training system (plus the renovation practice mode).
 * Registries live in ./species, ./habits, ./cultivars, ./systems;
 * `resolve` in ./spec packs them into a TreeSpec.
 */

import type { Branch, Model } from './types.js';

export type SpeciesId = 'apple' | 'cherry' | 'peach';
export type HabitId = 'spur' | 'tip' | 'mixed' | 'sweet' | 'tart' | 'renewal';
export type TrainingSystem = 'leader' | 'vase';
export type PracticeMode = 'normal' | 'renovate';

/** Year-one shoot potential shape: constant, terminal-split, or length-split. */
export type ShootOne =
  | { kind: 'always'; v: number }
  | { kind: 'terminal'; terminal: number; lateral: number }
  | { kind: 'short'; limit: number; short: number; long: number };

/** Shoot-borne fruiting stations per shoot: fixed or scaled by length. */
export type ShootStations =
  | { kind: 'const'; n: number }
  | { kind: 'perLength'; min: number; perM: number };

/** Where shoot-borne stations sit along the shoot. */
export type ShootPlacement =
  | { kind: 'tip' }
  | { kind: 'firstAt'; at: number }
  | { kind: 'spread'; base: number; span: number };

/** Linear HSL palette in (exposure, shade); evaluated in fixed term order. */
export interface FruitPalette {
  /** Applies to fruits whose shade draw is below this (else the next entry). */
  maxShade?: number;
  h: { base: number; oneMinusEx: number; ex: number; shade: number };
  s: { base: number; ex: number };
  l: { base: number; ex: number; shade: number; boost: number };
}

export interface SpeciesRender {
  leafHue: number;
  leaf: { length: number; widthRatio: number };
  fruitRoughness: number;
  fruitShape: {
    widthSlope: number;
    yScale: number;
    topDimple: [number, number];
    bottomDimple: [number, number];
  };
  fruitStem: {
    sideConst: number;
    sideRadMul: number;
    dropConst: number;
    dropShade: number;
    width: number;
    hang: number;
  };
}

/** Species biology: crop, sizing and pruning budget, plus display traits. */
export interface Species {
  id: SpeciesId;
  label: string;
  budget: number;
  bearingYear: number;
  fruitDensity: number;
  fruitDiameter: number;
  /** Fruits per cluster: `base + floor(r * span)`, or a single fruit. */
  fruitClusters: { base: number; span: number } | null;
  headingAdvice: string;
  headingStructurePenalty: number;
  render: SpeciesRender;
}

/** Habit: crop-bearing strategy and the advice that comes with it. */
export interface Habit {
  id: HabitId;
  label: string;
  text: string;
  naturalForm: TrainingSystem;
  species: SpeciesId[];
  spurIntensity: number;
  spurGoodMaxAge: number;
  spurStationsPerM: number;
  shootOne: ShootOne;
  shootStations: ShootStations;
  shootPlacement: ShootPlacement;
  doubleFruitThreshold?: number;
  fruitDiameter?: number;
  floralShare: number;
  stress: { on: number; gain: number; cap: number };
  youngHeadingPenalty: number;
  youngAdviceGuard: number;
  yieldZoneLabel: string;
  render: { fruitPalettes: FruitPalette[] };
}

/** Cultivar: the growth-parameter set, independent of habit and form. */
export interface Cultivar {
  id: string;
  label: string;
  note: string;
  species: SpeciesId;
  classicHabit: HabitId;
  vigor: number;
  dominance: number;
  unionAngle: number;
  headingResponse: number;
  sag: number;
  caliper: number;
}

/** One weighted recommendation rule of a training form. */
export interface RecRule {
  /** Positive weights compete for the headline reason; negative ones only nudge. */
  w: number;
  msg: string;
  when: (q: Branch, m: Model) => boolean;
}

/** Training-system form: the architecture growth and grading follow. */
export interface TrainingForm {
  id: TrainingSystem;
  label: string;
  openCenter: boolean;
  /** Fixed scaffold cull angle, or null to derive from the cultivar union angle. */
  scaffoldAngleDeg: number | null;
  leaderLateralLen: number;
  scaffoldExtLen: number;
  rootedSideCount: number;
  /** Structure penalty for a cut that takes leader-chain wood. */
  leaderCutPenalty: number;
  /** Advice line for training to this form. */
  guide: string;
  /** Cut recommendations applied outside the renovation program. */
  rec: { protectLeader: boolean; rules: RecRule[] };
}

/** Resolved specification handed to the simulation and display. */
export interface TreeSpec {
  species: Species;
  habit: Habit;
  cultivar: Cultivar;
  form: TrainingForm;
  /** Composed habit text plus optional cultivar note. */
  food: string;
  /** The form is the habit's natural form. */
  naturalFit: boolean;
}
