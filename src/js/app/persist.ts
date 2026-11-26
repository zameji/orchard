import { caps } from '../sim/caps.js';
import { resolve } from '../sim/spec.js';
import { edgeErrors, isBool, isInt, isNum, treeErrors } from '../sim/state.js';
import type { TreeState, UndoEntry } from '../sim/types.js';
import type { Config } from './ui.js';

export const SAVE_KEY = 'orchard.session';
export const SAVE_VERSION = '1.0.0';

/** Display toggles and solar time; restored with the session. */
export interface Prefs {
  leaves: boolean;
  fruit: boolean;
  overlay: boolean;
  guideSun: boolean;
  learning: boolean;
  panOnly: boolean;
  hour: number;
}

/** Everything needed to continue a session; derived state is rebuilt. */
export interface Session {
  config: Config;
  tree: TreeState;
  undoLog: UndoEntry[];
  renovationStart: number;
  prefs: Prefs;
}

interface Envelope {
  version: string;
  session: Session;
}

/** Serialize a session into a versioned envelope. */
export function encodeSession(s: Session): string {
  const env: Envelope = { version: SAVE_VERSION, session: s };
  return JSON.stringify(env);
}

/**
 * Parse and validate a stored envelope. Any parse error, structural problem
 * or version outside the current major warns and yields null: a session we
 * cannot fully trust is worse than a fresh start.
 */
export function decodeSession(raw: string): Session | null {
  let env: unknown;
  try {
    env = JSON.parse(raw);
  } catch {
    console.warn('orchard: saved session is not valid JSON — starting fresh');
    return null;
  }
  const e = env as Partial<Envelope> | null;
  if (!e || typeof e !== 'object')
    return warn('saved session is not an object');
  const major = /^(\d+)\.\d+\.\d+$/.exec(String(e.version))?.[1];
  if (major !== SAVE_VERSION.split('.')[0])
    return warn(`saved session version ${String(e.version)} is not compatible`);
  const problems = sessionErrors(e.session);
  if (problems.length) return warn(problems.join('; '));
  return e.session as Session;
}

/** Read the stored session; storage failures fall back to a fresh start. */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? decodeSession(raw) : null;
  } catch (err) {
    console.warn('orchard: saved session unreadable — starting fresh', err);
    return null;
  }
}

/** Store the session; quota or storage failures never break the app. */
export function saveSession(s: Session): void {
  try {
    localStorage.setItem(SAVE_KEY, encodeSession(s));
  } catch (err) {
    console.warn('orchard: could not save session', err);
  }
}

/** Structural problems in a decoded session; empty means usable. */
export function sessionErrors(s: unknown): string[] {
  if (typeof s !== 'object' || s === null) return ['session must be an object'];
  const c = s as Partial<Session>;
  const treeProblems = treeErrors(c.tree);
  const err = [...configErrors(c.config), ...treeProblems];
  if (!Array.isArray(c.undoLog)) err.push('undoLog must be an array');
  else
    c.undoLog.forEach((u: unknown, i: number) =>
      err.push(...undoErrors(u, `undoLog[${i}]`)),
    );
  if (
    !treeProblems.length &&
    Array.isArray(c.undoLog) &&
    !err.some((e) => e.startsWith('undoLog'))
  )
    err.push(...undoCrossErrors(c.undoLog, c.tree as TreeState));
  if (!isInt(c.renovationStart) || (c.renovationStart as number) < 1)
    err.push('renovationStart must be a positive integer');
  err.push(...prefsErrors(c.prefs));
  return err;
}

/**
 * Undo entries reattach `lost` edges and remap `originals` by id, so their
 * ids must stay coherent with the live tree: lost edges absent (an edge is
 * lost at most once per log), originals never lost by an earlier cut, and
 * every referenced id inside the allocator's range.
 */
function undoCrossErrors(log: UndoEntry[], t: TreeState): string[] {
  const err: string[] = [];
  const ids = new Set(t.edges.map((e) => e.id));
  const gone = new Set<number>();
  log.forEach((u, i) => {
    for (const s of u.lost) {
      if (ids.has(s.id) || gone.has(s.id))
        err.push(
          `undoLog[${i}].lost: edge ${s.id} is not absent from the tree`,
        );
      if (s.id >= t.nextId)
        err.push(`undoLog[${i}].lost: edge ${s.id} exceeds nextId ${t.nextId}`);
      gone.add(s.id);
    }
    for (const s of u.originals) {
      if (gone.has(s.id))
        err.push(
          `undoLog[${i}].originals: edge ${s.id} was lost by an earlier cut`,
        );
      if (s.id >= t.nextId)
        err.push(
          `undoLog[${i}].originals: edge ${s.id} exceeds nextId ${t.nextId}`,
        );
    }
  });
  return err;
}

function configErrors(c: unknown): string[] {
  if (typeof c !== 'object' || c === null) return ['config must be an object'];
  const p = c as Partial<Config>;
  try {
    resolve(
      p.species as Config['species'],
      p.habit as Config['habit'],
      p.cultivar as Config['cultivar'],
      p.form as Config['form'],
    );
  } catch {
    return [
      `config is not a registered axis combination: ${String(p.species)}/${String(p.habit)}/${String(p.cultivar)}/${String(p.form)}`,
    ];
  }
  const err: string[] = [];
  if (p.practice !== 'normal' && p.practice !== 'renovate')
    err.push(
      `config.practice: ${String(p.practice)} must be normal or renovate`,
    );
  if (!(typeof p.detail === 'string' && Object.hasOwn(caps, p.detail)))
    err.push(`config.detail: ${String(p.detail)} is not a quality tier`);
  if (!isInt(p.start) || (p.start as number) < 1 || (p.start as number) > 15)
    err.push(`config.start: ${String(p.start)} must be an integer in 1..15`);
  if (
    !isInt(p.seed) ||
    (p.seed as number) < 0 ||
    (p.seed as number) > 0xffffffff
  )
    err.push(`config.seed: ${String(p.seed)} must be a uint32`);
  return err;
}

function undoErrors(u: unknown, label: string): string[] {
  if (typeof u !== 'object' || u === null)
    return [`${label} must be an object`];
  const e = u as Partial<UndoEntry>;
  const err: string[] = [];
  if (!isNum(e.removed) || (e.removed as number) < 0)
    err.push(`${label}.removed must be a non-negative finite number`);
  for (const k of ['originals', 'lost'] as const) {
    if (!Array.isArray(e[k])) err.push(`${label}.${k} must be an array`);
    else
      e[k]!.forEach((s: unknown, i: number) =>
        err.push(...edgeErrors(s, `${label}.${k}[${i}]`)),
      );
  }
  return err;
}

function prefsErrors(p: unknown): string[] {
  if (typeof p !== 'object' || p === null) return ['prefs must be an object'];
  const e = p as Partial<Prefs>;
  const err: string[] = [];
  for (const k of [
    'leaves',
    'fruit',
    'overlay',
    'guideSun',
    'learning',
    'panOnly',
  ] as const) {
    if (!isBool(e[k])) err.push(`prefs.${k}: ${String(e[k])} must be boolean`);
  }
  if (!isNum(e.hour) || (e.hour as number) < 6 || (e.hour as number) > 18)
    err.push(`prefs.hour: ${String(e.hour)} must be in 6..18`);
  return err;
}

function warn(reason: string): null {
  console.warn(`orchard: ignoring saved session — ${reason}`);
  return null;
}
