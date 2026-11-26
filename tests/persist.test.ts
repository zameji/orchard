import { describe, expect, it, vi } from 'vitest';
import {
  decodeSession,
  encodeSession,
  sessionErrors,
  SAVE_VERSION,
  type Session,
} from '../src/js/app/persist.js';
import { CutPlanner } from '../src/js/sim/plan.js';
import { plant, specs } from './helpers.js';

/** A session with one confirmed cut still inside its undo window. */
const session = (): Session => {
  const { t, m } = plant(74129, specs.appleSpur, 5);
  const q = m.list.find((x) => x.par && x.kids.length > 0)!;
  const c = new CutPlanner(t, specs.appleSpur).plan(q, 0);
  const entry = { removed: t.removed, originals: c.originals, lost: c.lost };
  t.applyCut(c);
  return {
    config: {
      species: 'apple',
      habit: 'spur',
      cultivar: 'upright',
      form: 'leader',
      practice: 'normal',
      start: 5,
      seed: 74129,
      detail: 'medium',
    },
    tree: t.snapshot(),
    undoLog: [entry],
    renovationStart: 5,
    prefs: {
      leaves: true,
      fruit: true,
      overlay: false,
      guideSun: false,
      learning: false,
      panOnly: false,
      hour: 12,
    },
  };
};

describe('encode/decode', () => {
  it('round-trips a session', () => {
    const s = session();
    expect(decodeSession(encodeSession(s))).toEqual(s);
    expect(sessionErrors(s)).toEqual([]);
  });

  it('reads same-major versions and rejects others', () => {
    const s = session();
    expect(
      decodeSession(JSON.stringify({ version: '1.4.7', session: s })),
    ).toEqual(s);
    expect(
      decodeSession(JSON.stringify({ version: '2.0.0', session: s })),
    ).toBeNull();
    expect(
      decodeSession(JSON.stringify({ version: '1.0', session: s })),
    ).toBeNull();
  });

  it('rejects garbage and empty envelopes', () => {
    expect(decodeSession('nope')).toBeNull();
    expect(decodeSession('[]')).toBeNull();
    expect(decodeSession(JSON.stringify({ version: SAVE_VERSION }))).toBeNull();
    expect(
      decodeSession(JSON.stringify({ version: SAVE_VERSION, session: 42 })),
    ).toBeNull();
  });

  it('rejects corrupt tree state', () => {
    const s = session();
    s.tree.edges[1].p = 99999;
    expect(decodeSession(encodeSession(s))).toBeNull();
  });

  it('rejects unregistered config axes and fields', () => {
    const a = session();
    (a.config as { species: string }).species = 'plum';
    expect(decodeSession(encodeSession(a))).toBeNull();
    const b = session();
    (b.config as { detail: string }).detail = 'extreme';
    expect(decodeSession(encodeSession(b))).toBeNull();
    const c = session();
    (c.config as { practice: string }).practice = 'extreme';
    expect(decodeSession(encodeSession(c))).toBeNull();
    const d = session();
    (d.config as { start: number }).start = 26;
    expect(decodeSession(encodeSession(d))).toBeNull();
    const e = session();
    (e.config as { form: string }).form = 'hedge';
    expect(decodeSession(encodeSession(e))).toBeNull();
  });

  it('rejects prototype-polluting registry ids', () => {
    const a = session();
    (a.config as { form: string }).form = 'constructor';
    expect(decodeSession(encodeSession(a))).toBeNull();
    const b = session();
    (b.config as { detail: string }).detail = '__proto__';
    expect(decodeSession(encodeSession(b))).toBeNull();
    const c = session();
    (c.config as { species: string }).species = 'constructor';
    expect(decodeSession(encodeSession(c))).toBeNull();
    const d = session();
    (d.config as { habit: string }).habit = '__proto__';
    expect(decodeSession(encodeSession(d))).toBeNull();
  });

  it('rejects undo logs incoherent with the tree', () => {
    const a = session();
    a.undoLog[0].lost[0].id = a.tree.edges[0].id;
    expect(decodeSession(encodeSession(a))).toBeNull();
    const b = session();
    b.undoLog[0].lost[0].id = 99999;
    expect(decodeSession(encodeSession(b))).toBeNull();
    const c = session();
    c.undoLog[0].originals[0].id = c.undoLog[0].lost[0].id;
    expect(decodeSession(encodeSession(c))).toBeNull();
    const d = session();
    d.undoLog[0].originals[0].id = 99999;
    expect(decodeSession(encodeSession(d))).toBeNull();
  });

  it('rejects corrupt undo entries and prefs', () => {
    const a = session();
    a.undoLog[0].originals[0].len = -1;
    expect(decodeSession(encodeSession(a))).toBeNull();
    const b = session();
    (b.undoLog[0] as { lost: unknown }).lost = 7;
    expect(decodeSession(encodeSession(b))).toBeNull();
    const c = session();
    c.prefs.hour = 26;
    expect(decodeSession(encodeSession(c))).toBeNull();
    const d = session();
    d.prefs.leaves = 'yes' as never;
    expect(decodeSession(encodeSession(d))).toBeNull();
    const e = session();
    (e as { renovationStart: unknown }).renovationStart = 'five';
    expect(decodeSession(encodeSession(e))).toBeNull();
  });

  it('warns instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(decodeSession('garbage')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
