import { describe, expect, it } from 'vitest';
import { CutPlanner } from '../src/js/sim/plan.js';
import { cloneState, treeErrors } from '../src/js/sim/state.js';
import { Tree } from '../src/js/sim/tree.js';
import type { TreeState } from '../src/js/sim/types.js';
import { caps, growYears, plant, specs } from './helpers.js';

const grown = () => {
  const { t } = plant(74129, specs.appleSpur, 5);
  growYears(t, specs.appleSpur, 2);
  return t;
};

describe('Tree.snapshot / Tree.restore', () => {
  it('round-trips tree state exactly', () => {
    const t = grown();
    const s = t.snapshot();
    expect(JSON.stringify(s)).toBe(JSON.stringify(t));
    expect(Tree.restore(s)).toEqual(t);
  });

  it('detaches restored state from its source', () => {
    const s = grown().snapshot();
    const r = Tree.restore(s);
    r.edges[0].len = 99;
    r.edges[0].d[0] = 99;
    expect(s.edges[0].len).not.toBe(99);
    expect(s.edges[0].d[0]).not.toBe(99);
  });

  it('continues growth identically after restore', () => {
    const t = grown();
    const restored = Tree.restore(t.snapshot());
    const a = growYears(t, specs.appleSpur, 3, caps.medium);
    const b = growYears(restored, specs.appleSpur, 3, caps.medium);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(t));
    expect([b.score, b.live, b.fruitCount]).toEqual([
      a.score,
      a.live,
      a.fruitCount,
    ]);
  });

  it('supports persisted undo entries after restore', () => {
    const { t, m } = plant(74129, specs.appleSpur, 5);
    const before = JSON.stringify(t);
    const q = m.list.find((x) => x.par && x.kids.length > 0)!;
    const c = new CutPlanner(t, specs.appleSpur).plan(q, 0);
    const entry = { removed: t.removed, originals: c.originals, lost: c.lost };
    t.applyCut(c);
    const restored = Tree.restore(t.snapshot());
    restored.undo(entry);
    expect(JSON.stringify(restored)).toBe(before);
  });
});

describe('cloneState', () => {
  it('copies edges deeply', () => {
    const t = grown();
    const s = cloneState(t);
    s.edges[0].len = 99;
    s.edges[0].d[1] = 99;
    expect(t.edges[0].len).not.toBe(99);
    expect(t.edges[0].d[1]).not.toBe(99);
  });
});

describe('treeErrors', () => {
  const bad = (mut: (t: TreeState) => void): string => {
    const s = grown().snapshot();
    mut(s);
    return treeErrors(s).join('; ');
  };

  it('accepts a grown tree', () => {
    expect(treeErrors(grown().snapshot())).toEqual([]);
    expect(treeErrors(null)).not.toEqual([]);
  });

  it('rejects non-positive and duplicate edge ids', () => {
    expect(bad((t) => (t.edges[1].id = 0))).toContain('edges[1].id: 0');
    expect(bad((t) => (t.edges[1].id = 1))).toContain('edges[1].id: 1');
  });

  it('rejects a parent that does not precede the child', () => {
    expect(bad((t) => (t.edges[0].p = 7))).toContain('edges[0].p: 7');
    expect(bad((t) => (t.edges[1].p = 2))).toContain('edges[1].p: 2');
  });

  it('rejects a self-parent even before its id joins the seen set', () => {
    expect(bad((t) => (t.edges[1].p = t.edges[1].id))).toContain('edges[1].p');
  });

  it('rejects edge ids that break the sorted-by-id order', () => {
    expect(
      bad((t) => {
        const a = t.edges[1].id;
        t.edges[1].id = t.edges[2].id;
        t.edges[2].id = a;
      }),
    ).toContain('breaks the sorted-by-id order');
  });

  it('rejects out-of-range geometry and length', () => {
    expect(bad((t) => (t.edges[2].at = 0))).toContain('edges[2].at: 0');
    expect(bad((t) => (t.edges[2].at = 1.2))).toContain('edges[2].at: 1.2');
    expect(bad((t) => (t.edges[2].len = -1))).toContain('edges[2].len: -1');
    expect(bad((t) => (t.edges[2].d = [1, NaN, 0]))).toContain('edges[2].d');
    expect(bad((t) => (t.edges[2].d = [0, 0, 0]))).toContain('edges[2].d');
    expect(bad((t) => (t.edges[2].d = [1, 2] as never))).toContain(
      'edges[2].d',
    );
  });

  it('rejects unknown roles and non-boolean flags', () => {
    expect(bad((t) => (t.edges[2].role = 'trunk' as never))).toContain(
      'edges[2].role',
    );
    expect(bad((t) => (t.edges[2].dead = 1 as never))).toContain(
      'edges[2].dead',
    );
  });

  it('rejects a nextId that collides with existing ids', () => {
    expect(bad((t) => (t.nextId = t.edges[1].id))).toContain('nextId');
  });

  it('rejects invalid scalar fields', () => {
    expect(bad((t) => (t.year = 0))).toContain('year');
    expect(bad((t) => (t.seed = -3))).toContain('seed');
    expect(bad((t) => (t.stress = NaN))).toContain('stress');
    expect(bad((t) => (t.removed = Infinity))).toContain('removed');
    expect(bad((t) => (t.base = -1))).toContain('base');
    expect(bad((t) => (t.nextId = 1.5))).toContain('nextId');
  });
});
