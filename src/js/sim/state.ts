import type { Edge, Role, TreeState } from './types.js';

const ROLES: readonly Role[] = ['leader', 'scaffold', 'side', 'sprout'];

export const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
export const isInt = (v: unknown): v is number => Number.isInteger(v);
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * Deep copy of a tree state: edge objects and direction tuples are detached,
 * field order matches the Tree class so `JSON.stringify` round-trips.
 */
export function cloneState(t: TreeState): TreeState {
  return {
    seed: t.seed,
    year: t.year,
    nextId: t.nextId,
    edges: t.edges.map((s) => ({ ...s, d: [s.d[0], s.d[1], s.d[2]] })),
    removed: t.removed,
    base: t.base,
    stress: t.stress,
  };
}

/** Structural problems in a plain-data tree state; empty means usable. */
export function treeErrors(t: unknown): string[] {
  if (typeof t !== 'object' || t === null) return ['state must be an object'];
  const s = t as Partial<TreeState>;
  const err: string[] = [];
  if (!isInt(s.seed) || (s.seed as number) < 0)
    err.push(`seed: ${String(s.seed)} must be a non-negative integer`);
  if (!isInt(s.year) || (s.year as number) < 1)
    err.push(`year: ${String(s.year)} must be a positive integer`);
  if (!Array.isArray(s.edges)) {
    err.push(`edges: ${String(s.edges)} must be an array`);
  } else {
    const seen = new Set<number>();
    let prev = 0;
    s.edges.forEach((e: unknown, i: number) => {
      err.push(...edgeErrors(e, `edges[${i}]`, seen));
      const id = (e as Partial<Edge>)?.id;
      if (isInt(id)) {
        if ((id as number) <= prev)
          err.push(
            `edges[${i}]: id ${String(id)} breaks the sorted-by-id order`,
          );
        prev = id as number;
      }
    });
  }
  if (!isInt(s.nextId) || (s.nextId as number) < 1)
    err.push(`nextId: ${String(s.nextId)} must be a positive integer`);
  else if (Array.isArray(s.edges)) {
    const max = s.edges.reduce(
      (a: number, e: unknown) =>
        Math.max(a, ((e as Partial<Edge>)?.id as number) || 0),
      0,
    );
    if ((s.nextId as number) <= max)
      err.push(
        `nextId: ${String(s.nextId)} must exceed the largest edge id ${max}`,
      );
  }
  for (const k of ['removed', 'base', 'stress'] as const) {
    if (!isNum(s[k]) || (s[k] as number) < 0)
      err.push(`${k}: ${String(s[k])} must be a non-negative finite number`);
  }
  return err;
}

/**
 * Structural problems in one edge. With `seen` (ids of earlier edges), also
 * checks id uniqueness and parent precedence; a valid edge's id joins `seen`.
 * Without it, only edge-local shape is checked (for undo-log entries, whose
 * parents live in the tree rather than in the entry).
 */
export function edgeErrors(
  e: unknown,
  label: string,
  seen?: Set<number>,
): string[] {
  if (typeof e !== 'object' || e === null)
    return [`${label}: must be an object`];
  const s = e as Partial<Edge>;
  const err: string[] = [];
  if (!isInt(s.id) || (s.id as number) < 1)
    err.push(`${label}.id: ${String(s.id)} must be a positive integer`);
  else if (seen && seen.has(s.id as number))
    err.push(`${label}.id: ${String(s.id)} is a duplicate`);
  if (!isInt(s.p) || (s.p as number) < 0)
    err.push(`${label}.p: ${String(s.p)} must be a non-negative integer`);
  else if (seen && (s.p as number) !== 0 && !seen.has(s.p as number))
    err.push(`${label}.p: ${String(s.p)} must reference an earlier edge`);
  if (isInt(s.id) && (s.id as number) >= 1) seen?.add(s.id as number);
  if (!isNum(s.at) || (s.at as number) <= 0 || (s.at as number) > 1)
    err.push(`${label}.at: ${String(s.at)} must be in (0, 1]`);
  if (!isNum(s.len) || (s.len as number) <= 0)
    err.push(`${label}.len: ${String(s.len)} must be positive`);
  if (
    !Array.isArray(s.d) ||
    s.d.length !== 3 ||
    !s.d.every(isNum) ||
    !s.d.some((v: number) => v !== 0)
  )
    err.push(
      `${label}.d: ${String(s.d)} must be 3 finite numbers with non-zero length`,
    );
  if (!ROLES.includes(s.role as Role))
    err.push(
      `${label}.role: ${String(s.role)} must be one of ${ROLES.join(', ')}`,
    );
  for (const k of ['order', 'born', 'load', 'head', 'release'] as const) {
    if (!isNum(s[k]))
      err.push(`${label}.${k}: ${String(s[k])} must be a finite number`);
  }
  for (const k of ['fork', 'dead'] as const) {
    if (!isBool(s[k]))
      err.push(`${label}.${k}: ${String(s[k])} must be boolean`);
  }
  return err;
}
