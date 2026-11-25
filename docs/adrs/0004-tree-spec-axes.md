# 0004. Tree specs composed from four axis vocabularies

Date: 2026-11-25
Status: Accepted

## Context

The simulation parameterized on `Profile`: hand-authored rows pairing a
species label, a fruiting mode, six growth numbers and a training system
(`config.ts` `profiles`). Adding a species or habit meant editing mode
ternaries scattered through `tree.ts`, `model.ts`, `plan.ts`, `advice.ts`
and the render layer, and every cross-combination had to be spelled out as
its own row. The UI selected rows, not concepts.

## Decision

A tree is composed from four axis vocabularies, resolved into one
`TreeSpec` value (`sim/spec.ts` `resolve`):

- **Species** (`sim/species.ts`) — biology and display traits: pruning
  budget, bearing year, fruit density/diameter/clusters, heading advice,
  and the `SpeciesRender` block (leaf, fruit shape/stem/roughness).
- **Habit** (`sim/habits.ts`) — bearing strategy: spur intensity and
  stations, shoot-potential rules (`ShootOne`/`ShootStations`/
  `ShootPlacement` discriminated unions), floral share, stress response,
  advice text and fruit color palettes.
- **Cultivar** (`sim/cultivars.ts`) — the growth-parameter set: vigor,
  dominance, union angle, heading response, sag, caliper, plus an optional
  advice note composed into `food`.
- **Training system** (`sim/systems.ts`) — the form: open-center flag,
  scaffold angle and extension constants. Renovation is a separate
  `PracticeMode` axis owned by the advisor, not a third form.

Consumers read trait fields; no module outside the registries branches on
species or habit ids. UI selectors filter habit and cultivar by species and
preselect each habit's classic cultivar; the training form stays a free
choice so "alternative form" remains a teaching case.

## Consequences

- Adding a species, habit or cultivar is a registry row (plus any new
  palettes/traits) — no consumer edits.
- The characterization goldens stayed byte-identical through the flip;
  numeric literals moved into records with unchanged float-op order.
- `Profile`/`FruitingMode` are gone; `config.ts` shrank to `caps.ts`.
