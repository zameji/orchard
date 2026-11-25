import { describe, expect, it } from 'vitest';
import { habitList, habits } from '../src/js/sim/habits.js';
import { cultivarList, cultivarsFor } from '../src/js/sim/cultivars.js';
import {
  defaultCultivar,
  habitsFor,
  resolve,
  withForm,
} from '../src/js/sim/spec.js';
import { speciesList, species } from '../src/js/sim/species.js';
import { forms } from '../src/js/sim/systems.js';

describe('tree spec resolution', () => {
  it('composes the six classic advice strings byte-identically', () => {
    expect(resolve('apple', 'spur', 'upright', 'leader').food).toBe(
      'Keep bright, compact spurs on two- to four-year wood.',
    );
    expect(resolve('apple', 'tip', 'spreading', 'vase').food).toBe(
      'Preserve last year’s lateral terminals; heading removes their crop.',
    );
    expect(resolve('apple', 'mixed', 'vigorous', 'leader').food).toBe(
      'Retain mixed spurs and terminals. Large cuts provoke strong watersprouts.',
    );
    expect(resolve('cherry', 'sweet', 'upright', 'leader').food).toBe(
      'Save short laterals and bright two- to five-year spurs.',
    );
    expect(resolve('cherry', 'tart', 'bush', 'vase').food).toBe(
      'Keep both young terminals and illuminated spur-bearing wood.',
    );
    expect(resolve('peach', 'renewal', 'standard', 'vase').food).toBe(
      'Renew sunlit one-year shoots in the lower and middle bowl; old spurs do not crop.',
    );
  });

  it('resolves each axis record', () => {
    const spec = resolve('apple', 'mixed', 'vigorous', 'vase');
    expect(spec.species.fruitDensity).toBe(880);
    expect(spec.habit.spurIntensity).toBe(0.62);
    expect(spec.cultivar.vigor).toBe(1.15);
    expect(spec.form.id).toBe('vase');
  });

  it('rejects habits outside the species filter', () => {
    expect(() => resolve('apple', 'sweet', 'upright', 'leader')).toThrow();
    expect(() => resolve('peach', 'spur', 'standard', 'vase')).toThrow();
    expect(() => resolve('apple', 'spur', 'bush', 'leader')).toThrow();
  });

  it('switches form without touching the rest of the spec', () => {
    const spec = resolve('apple', 'spur', 'upright', 'leader');
    const vase = withForm(spec, 'vase');
    expect(vase.form.id).toBe('vase');
    expect(vase.food).toBe(spec.food);
    expect(vase.cultivar).toBe(spec.cultivar);
  });
});

describe('selector filtering', () => {
  it('offers only the species-appropriate habits', () => {
    expect(habitsFor('apple').map((h) => h.id)).toEqual([
      'spur',
      'tip',
      'mixed',
    ]);
    expect(habitsFor('cherry').map((h) => h.id)).toEqual(['sweet', 'tart']);
    expect(habitsFor('peach').map((h) => h.id)).toEqual(['renewal']);
  });

  it('pairs each habit with its classic cultivar', () => {
    expect(defaultCultivar('apple', 'spur').id).toBe('upright');
    expect(defaultCultivar('apple', 'tip').id).toBe('spreading');
    expect(defaultCultivar('apple', 'mixed').id).toBe('vigorous');
    expect(defaultCultivar('cherry', 'sweet').id).toBe('upright');
    expect(defaultCultivar('cherry', 'tart').id).toBe('bush');
    expect(defaultCultivar('peach', 'renewal').id).toBe('standard');
  });
});

describe('registry invariants', () => {
  const speciesIds = new Set(speciesList.map((s) => s.id));
  const habitIds = new Set(habitList.map((h) => h.id));

  it('references only known species and forms', () => {
    for (const h of habitList) {
      expect(h.species.length).toBeGreaterThan(0);
      for (const sp of h.species) expect(speciesIds.has(sp)).toBe(true);
      expect(forms[h.naturalForm]).toBeTruthy();
    }
    for (const c of cultivarList) expect(speciesIds.has(c.species)).toBe(true);
  });

  it('keeps every classic habit pairing valid for its species', () => {
    for (const c of cultivarList) {
      expect(habitIds.has(c.classicHabit)).toBe(true);
      expect(habits[c.classicHabit].species).toContain(c.species);
    }
  });

  it('gives every species at least one habit and one cultivar', () => {
    for (const s of speciesList) {
      expect(habitsFor(s.id).length).toBeGreaterThan(0);
      expect(cultivarsFor(s.id).length).toBeGreaterThan(0);
      expect(species[s.id]).toBe(s);
    }
  });
});
