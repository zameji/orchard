import { describe, expect, it } from 'vitest';
import { mulberry32, noise } from '../src/js/sim/random.js';

describe('noise', () => {
  it('matches golden draws for a fixed identity', () => {
    expect(noise(74129, 1, 100)).toBe(0.45117543055675924);
    expect(noise(74129, 1, 101)).toBe(0.46572091430425644);
    expect(noise(74129, 2, 100)).toBe(0.6233874820172787);
    expect(noise(1, 0, 47)).toBe(0.6204644006211311);
  });

  it('is stateless: identical calls give identical results', () => {
    const a = noise(74129, 5, 600),
      b = noise(74129, 5, 600);
    expect(a).toBe(b);
  });

  it('separates channels', () => {
    expect(noise(74129, 1, 1)).not.toBe(noise(74129, 1, 2));
    expect(noise(74129, 1, 1)).not.toBe(noise(74129, 2, 1));
    expect(noise(74129, 1, 1)).not.toBe(noise(74130, 1, 1));
  });

  it('stays in [0, 1)', () => {
    for (let id = 0; id < 50; id++)
      for (const k of [0, 1, 99, 600]) {
        const v = noise(74129, id, k);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
  });
});

describe('mulberry32', () => {
  it('matches a golden sequence', () => {
    const r = mulberry32(74129);
    expect(r()).toBe(0.6157275349833071);
    expect(r()).toBe(0.31782227009534836);
    expect(r()).toBe(0.9381986008957028);
  });

  it('replays identically from the same seed', () => {
    const a = mulberry32(99),
      b = mulberry32(99);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});
