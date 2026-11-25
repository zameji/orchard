import type { Species, SpeciesId } from './axes.js';

const stoneHeading =
  'Heading stone fruit costs renewal wood and provokes upright regrowth. ';

export const speciesList: Species[] = [
  {
    id: 'apple',
    label: 'Apple',
    budget: 0.27,
    bearingYear: 3,
    fruitDensity: 880,
    fruitDiameter: 0.074,
    fruitClusters: null,
    headingAdvice: 'Heading trades terminal growth for upright regrowth. ',
    headingStructurePenalty: 0,
    render: {
      leafHue: 0.252,
      leaf: { length: 0.091, widthRatio: 0.235 },
      fruitRoughness: 0.46,
      fruitShape: {
        widthSlope: 0.13,
        yScale: 0.88,
        topDimple: [0.15, 16],
        bottomDimple: [0.08, 18],
      },
      fruitStem: {
        sideConst: 0,
        sideRadMul: 0.68,
        dropConst: 0.014,
        dropShade: 0,
        width: 0.0021,
        hang: 0.73,
      },
    },
  },
  {
    id: 'cherry',
    label: 'Cherry',
    budget: 0.27,
    bearingYear: 3,
    fruitDensity: 1000,
    fruitDiameter: 0.024,
    fruitClusters: { base: 2, span: 3 },
    headingAdvice: stoneHeading,
    headingStructurePenalty: 7,
    render: {
      leafHue: 0.302,
      leaf: { length: 0.091, widthRatio: 0.235 },
      fruitRoughness: 0.24,
      fruitShape: {
        widthSlope: 0,
        yScale: 1,
        topDimple: [0, 16],
        bottomDimple: [0, 18],
      },
      fruitStem: {
        sideConst: 0.023,
        sideRadMul: 0,
        dropConst: 0.039,
        dropShade: 0.018,
        width: 0.00155,
        hang: 0.92,
      },
    },
  },
  {
    id: 'peach',
    label: 'Peach',
    budget: 0.32,
    bearingYear: 2,
    fruitDensity: 880,
    fruitDiameter: 0.069,
    fruitClusters: null,
    headingAdvice: stoneHeading,
    headingStructurePenalty: 7,
    render: {
      leafHue: 0.263,
      leaf: { length: 0.121, widthRatio: 0.13 },
      fruitRoughness: 0.83,
      fruitShape: {
        widthSlope: 0.055,
        yScale: 1,
        topDimple: [0, 16],
        bottomDimple: [0, 18],
      },
      fruitStem: {
        sideConst: 0,
        sideRadMul: 0.68,
        dropConst: 0.014,
        dropShade: 0,
        width: 0.0021,
        hang: 0.95,
      },
    },
  },
];

export const species: Record<SpeciesId, Species> = Object.fromEntries(
  speciesList.map((s) => [s.id, s]),
) as Record<SpeciesId, Species>;
