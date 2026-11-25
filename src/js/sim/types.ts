import type { Vector3 } from 'three';

export type Role = 'leader' | 'scaffold' | 'side' | 'sprout';
export type CapsKey = 'low' | 'medium' | 'high' | 'ultra';

/** One annual extension; edges stay sorted by id, parents precede children. */
export interface Edge {
  id: number;
  p: number;
  at: number;
  d: [number, number, number];
  len: number;
  role: Role;
  order: number;
  fork: boolean;
  born: number;
  load: number;
  dead: boolean;
  head: number;
  release: number;
}

/** Plain-data tree state; the only mutable simulation record (class Tree). */
export interface TreeState {
  seed: number;
  year: number;
  nextId: number;
  edges: Edge[];
  removed: number;
  base: number;
  stress: number;
}

/** Bookkeeping needed to restore a cut: what was reworked and what was lost. */
export interface UndoEntry {
  removed: number;
  originals: Edge[];
  lost: Edge[];
}

export interface Bud {
  at: number;
  az: number;
  len: number;
}

export interface Fruit {
  at: number;
  az: number;
  d: number;
  ex: number;
  shade: number;
  spur: boolean;
}

/** Per-edge derived node produced by Canopy. */
export interface Branch {
  s: Edge;
  par: Branch | undefined;
  i: number;
  kids: Branch[];
  age: number;
  rest: Vector3;
  pipe: number;
  burden: number;
  cross: boolean;
  r: number;
  a: Vector3;
  dir: Vector3;
  b: Vector3;
  mid: Vector3;
  angle: number;
  inward: boolean;
  narrow: boolean;
  rival: boolean;
  light: number;
  buds: Bud[];
  fruits: Fruit[];
  diameter: number;
  potential: number;
  weak: boolean;
  down: boolean;
  bad: boolean;
  subLive: number;
  subFruit: number;
  subCount: number;
}

/** Derived model M; recompute via `new Canopy(t, spec)` after any state change. */
export interface Model {
  list: Branch[];
  map: Map<number, Branch>;
  height: number;
  spread: number;
  fruitCount: number;
  diam: number;
  kg: number;
  avg: number;
  live: number;
  health: number;
  score: number;
  struct: number;
  productive: number;
  removal: number;
}

/** Quality tier bounding segment/leaf budgets and pixel ratio. */
export interface Caps {
  max: number;
  sides: number;
  density: number;
  clusters: number;
  dpr: number;
  leaves: number;
}

export interface Grade {
  pts: number[];
  score: number;
  delta: number;
  lg: number;
}

/** Non-mutating hypothetical graph surgery for one cut. */
export interface CutFork {
  ids: Set<number>;
  length: number;
  lost: Edge[];
  originals: Edge[];
  after: TreeState;
}

/** Non-mutating hypothetical cut: forked tree plus derived model. */
export interface CutPlan {
  id: number;
  at: number;
  ids: Set<number>;
  length: number;
  lost: Edge[];
  originals: Edge[];
  after: TreeState;
  model: Model;
  grade?: Grade;
}

export interface Rec {
  q: Branch;
  weight: number;
  reason: string;
}
