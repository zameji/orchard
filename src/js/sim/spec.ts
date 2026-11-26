import type {
  Cultivar,
  Habit,
  HabitId,
  Species,
  SpeciesId,
  TrainingSystem,
  TreeSpec,
} from './axes.js';
import { habitList, habits } from './habits.js';
import { cultivarsFor } from './cultivars.js';
import { species } from './species.js';
import { forms } from './systems.js';

/** Habit advice with the optional cultivar note appended. */
export function foodOf(habit: Habit, cultivar: Cultivar): string {
  return cultivar.note ? habit.text + ' ' + cultivar.note : habit.text;
}

export function habitsFor(sp: SpeciesId): Habit[] {
  return habitList.filter((h) => h.species.includes(sp));
}

export function defaultCultivar(sp: SpeciesId, habitId: HabitId): Cultivar {
  const list = cultivarsFor(sp),
    found = list.find((c) => c.classicHabit === habitId) ?? list[0];
  if (!found) throw new Error(`no cultivars registered for ${sp}`);
  return found;
}

/** Pack the four axis choices into the value the simulation consumes. */
export function resolve(
  sp: SpeciesId,
  habitId: HabitId,
  cultivarId: string,
  formId: TrainingSystem,
): TreeSpec {
  const spRec: Species = species[sp],
    habit = habits[habitId],
    cultivar = cultivarsFor(sp).find((c) => c.id === cultivarId);
  if (!spRec || !habit || !cultivar)
    throw new Error(`unknown tree spec: ${sp}/${habitId}/${cultivarId}`);
  if (!habit.species.includes(sp))
    throw new Error(`habit ${habitId} does not apply to ${sp}`);
  return {
    species: spRec,
    habit,
    cultivar,
    form: forms[formId],
    food: foodOf(habit, cultivar),
    naturalFit: formId === habit.naturalForm,
  };
}

/** Same tree under a different training-system form. */
export function withForm(spec: TreeSpec, formId: TrainingSystem): TreeSpec {
  return {
    ...spec,
    form: forms[formId],
    naturalFit: formId === spec.habit.naturalForm,
  };
}
