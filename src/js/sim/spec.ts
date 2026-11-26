import type {
  Cultivar,
  CultivarId,
  Habit,
  HabitId,
  Species,
  SpeciesId,
  TrainingForm,
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
  cultivarId: CultivarId,
  formId: TrainingSystem,
): TreeSpec {
  // Own-property lookups: registry ids are data, never prototype keys.
  const spRec: Species | undefined = Object.hasOwn(species, sp)
      ? species[sp]
      : undefined,
    habit: Habit | undefined = Object.hasOwn(habits, habitId)
      ? habits[habitId]
      : undefined,
    form: TrainingForm | undefined = Object.hasOwn(forms, formId)
      ? forms[formId]
      : undefined,
    cultivar = cultivarsFor(sp).find((c) => c.id === cultivarId);
  if (!spRec || !habit || !cultivar || !form)
    throw new Error(
      `unknown tree spec: ${sp}/${habitId}/${cultivarId}/${formId}`,
    );
  if (!habit.species.includes(sp))
    throw new Error(`habit ${habitId} does not apply to ${sp}`);
  return {
    species: spRec,
    habit,
    cultivar,
    form,
    food: foodOf(habit, cultivar),
    naturalFit: formId === habit.naturalForm,
  };
}

/** Same tree under a different training-system form. */
export function withForm(spec: TreeSpec, formId: TrainingSystem): TreeSpec {
  const form: TrainingForm | undefined = Object.hasOwn(forms, formId)
    ? forms[formId]
    : undefined;
  if (!form) throw new Error(`unknown training form: ${formId}`);
  return {
    ...spec,
    form,
    naturalFit: formId === spec.habit.naturalForm,
  };
}
