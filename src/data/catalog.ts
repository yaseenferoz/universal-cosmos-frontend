import type {
  CelestialObject,
  ObjectId,
  SolarSystem,
} from "../types/celestial";

/** Chosen visualization origin. Initial phases are NOT observed positions on this date. */
export const SIMULATION_EPOCH = "2026-01-01T00:00:00.000Z";
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7;

const planetarySource = {
  label: "NASA / NSSDCA Planetary Fact Sheet",
  url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/",
};

/**
 * Approximate physical properties: NASA metric fact sheet (18 March 2025 revision),
 * retrieved 2 November 2026. Sun: 9 May 2024 fact sheet. Planet/Moon radius values
 * are half the table's equatorial diameters. This is not an ephemeris catalog.
 * The nested display values are hand-selected visual composition parameters.
 * Distances and radii use DIFFERENT nonlinear scales, not a common km conversion.
 */
export const celestialObjects: CelestialObject[] = [
  {
    id: "sun",
    name: "Sun",
    category: "G-type main-sequence star",
    parentId: null,
    description:
      "Our nearest star anchors the Solar System. Its light connects every world in this neighborhood, from rocky Mercury to distant Neptune.",
    radiusKm: 695_700,
    massKg: 1.9884e30,
    gravityMs2: 274,
    orbitalPeriodDays: 0,
    rotationPeriodHours: 609.12,
    semiMajorAxisKm: 0,
    axialTiltDeg: 7.25,
    color: "#ffcc80",
    source: {
      label: "NASA / NSSDCA Sun Fact Sheet",
      url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html",
    },
    display: { radius: 5, orbitRadius: 0, initialPhase: 0, inclination: 0 },
    facts: [
      { label: "Spectral class", value: "G2 V" },
      { label: "Effective temperature", value: "5,772 K" },
    ],
  },
  {
    id: "mercury",
    name: "Mercury",
    category: "Terrestrial planet",
    parentId: "sun",
    description:
      "The smallest planet follows the shortest path around the Sun. A cratered, rocky world, Mercury offers an encounter with the inner Solar System.",
    radiusKm: 2_439.5,
    massKg: 3.3e23,
    gravityMs2: 3.7,
    orbitalPeriodDays: 88,
    rotationPeriodHours: 1407.6,
    semiMajorAxisKm: 57.9e6,
    axialTiltDeg: 0.034,
    color: "#b9afa5",
    source: planetarySource,
    display: {
      radius: 0.48,
      orbitRadius: 10,
      initialPhase: 2.4,
      inclination: (7 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "167 °C" },
      { label: "Orbit eccentricity", value: "0.206" },
    ],
  },
  {
    id: "venus",
    name: "Venus",
    category: "Terrestrial planet",
    parentId: "sun",
    description:
      "A bright, cloud-covered neighbor with a dense atmosphere. Venus rotates slowly in the opposite direction to most planets.",
    radiusKm: 6_052,
    massKg: 4.87e24,
    gravityMs2: 8.9,
    orbitalPeriodDays: 224.7,
    rotationPeriodHours: -5832.5,
    semiMajorAxisKm: 108.2e6,
    axialTiltDeg: 177.4,
    color: "#d2af78",
    source: planetarySource,
    display: {
      radius: 0.85,
      orbitRadius: 14,
      initialPhase: 4.4,
      inclination: (3.4 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "464 °C" },
      { label: "Surface pressure", value: "92 bar" },
    ],
  },
  {
    id: "earth",
    name: "Earth",
    category: "Terrestrial planet",
    parentId: "sun",
    description:
      "Our home among the stars. Oceans, continents, and a thin atmosphere make this small rocky planet a remarkable place to begin exploring.",
    radiusKm: 6_378,
    massKg: 5.97e24,
    gravityMs2: 9.8,
    orbitalPeriodDays: 365.2,
    rotationPeriodHours: 23.9,
    semiMajorAxisKm: 149.6e6,
    axialTiltDeg: 23.4,
    color: "#79b9e9",
    source: planetarySource,
    display: {
      radius: 0.9,
      orbitRadius: 19,
      initialPhase: 0.65,
      inclination: 0,
    },
    facts: [
      { label: "Mean temperature", value: "15 °C" },
      { label: "Surface pressure", value: "1 bar" },
    ],
  },
  {
    id: "moon",
    name: "Moon",
    category: "Natural satellite",
    parentId: "earth",
    description:
      "Earth’s companion is a rocky world of bright highlands and dark plains. It completes one rotation in approximately the time it takes to orbit Earth.",
    radiusKm: 1_737.5,
    massKg: 7.3e22,
    gravityMs2: 1.6,
    orbitalPeriodDays: 27.3,
    rotationPeriodHours: 655.7,
    semiMajorAxisKm: 384_000,
    axialTiltDeg: 6.7,
    color: "#bcbec4",
    source: planetarySource,
    display: {
      radius: 0.245,
      orbitRadius: 2.3,
      initialPhase: 1.5,
      inclination: (5.1 * Math.PI) / 180,
    },
    facts: [
      { label: "Reference body", value: "Earth" },
      { label: "Orbit eccentricity", value: "0.055" },
    ],
  },
  {
    id: "mars",
    name: "Mars",
    category: "Terrestrial planet",
    parentId: "sun",
    description:
      "The red planet marks the outer edge of the rocky inner worlds. Its dusty surface and polar regions invite a closer look.",
    radiusKm: 3_396,
    massKg: 6.42e23,
    gravityMs2: 3.7,
    orbitalPeriodDays: 687,
    rotationPeriodHours: 24.6,
    semiMajorAxisKm: 228e6,
    axialTiltDeg: 25.2,
    color: "#d98969",
    source: planetarySource,
    display: {
      radius: 0.65,
      orbitRadius: 25,
      initialPhase: 3.65,
      inclination: (1.8 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "−65 °C" },
      { label: "Surface pressure", value: "0.01 bar" },
    ],
  },
  {
    id: "jupiter",
    name: "Jupiter",
    category: "Gas giant",
    parentId: "sun",
    description:
      "The largest planet carries sweeping bands of clouds across its atmosphere. Its immense scale changes the character of the outer Solar System.",
    radiusKm: 71_492,
    massKg: 1.898e27,
    gravityMs2: 23.1,
    orbitalPeriodDays: 4331,
    rotationPeriodHours: 9.9,
    semiMajorAxisKm: 778.5e6,
    axialTiltDeg: 3.1,
    color: "#d4b397",
    source: planetarySource,
    display: {
      radius: 2.5,
      orbitRadius: 37,
      initialPhase: 5.55,
      inclination: (1.3 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "−110 °C" },
      { label: "Mean density", value: "1,326 kg/m³" },
    ],
  },
  {
    id: "saturn",
    name: "Saturn",
    category: "Gas giant",
    parentId: "sun",
    description:
      "A pale gas giant framed by an extraordinary ring system. Travel closer to see its tilted rings against the darkness.",
    radiusKm: 60_268,
    massKg: 5.68e26,
    gravityMs2: 9,
    orbitalPeriodDays: 10747,
    rotationPeriodHours: 10.7,
    semiMajorAxisKm: 1432e6,
    axialTiltDeg: 26.7,
    color: "#dac79e",
    source: planetarySource,
    display: {
      radius: 2.1,
      orbitRadius: 49,
      initialPhase: 2.5,
      inclination: (2.5 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "−140 °C" },
      { label: "Mean density", value: "687 kg/m³" },
    ],
  },
  {
    id: "uranus",
    name: "Uranus",
    category: "Ice giant",
    parentId: "sun",
    description:
      "A cool cyan world with an unusually tilted rotation axis. Uranus turns almost on its side as it travels through the outer Solar System.",
    radiusKm: 25_559,
    massKg: 8.68e25,
    gravityMs2: 8.7,
    orbitalPeriodDays: 30589,
    rotationPeriodHours: -17.2,
    semiMajorAxisKm: 2867e6,
    axialTiltDeg: 97.8,
    color: "#9dd9df",
    source: planetarySource,
    display: {
      radius: 1.35,
      orbitRadius: 61,
      initialPhase: 4.75,
      inclination: (0.8 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "−195 °C" },
      { label: "Mean density", value: "1,270 kg/m³" },
    ],
  },
  {
    id: "neptune",
    name: "Neptune",
    category: "Ice giant",
    parentId: "sun",
    description:
      "The most distant planet in this explorer. Neptune moves slowly around the Sun, completing an orbit over generations on Earth.",
    radiusKm: 24_764,
    massKg: 1.02e26,
    gravityMs2: 11,
    orbitalPeriodDays: 59800,
    rotationPeriodHours: 16.1,
    semiMajorAxisKm: 4515e6,
    axialTiltDeg: 28.3,
    color: "#6a8de0",
    source: planetarySource,
    display: {
      radius: 1.3,
      orbitRadius: 73,
      initialPhase: 0.4,
      inclination: (1.8 * Math.PI) / 180,
    },
    facts: [
      { label: "Mean temperature", value: "−200 °C" },
      { label: "Mean density", value: "1,638 kg/m³" },
    ],
  },
];

export const objectById = Object.fromEntries(
  celestialObjects.map((object) => [object.id, object]),
) as Record<ObjectId, CelestialObject>;

export const solarSystem: SolarSystem = {
  id: "solar",
  name: "Solar System",
  objectIds: celestialObjects.map(({ id }) => id),
  referenceObject: "sun",
  visualizationEpoch: SIMULATION_EPOCH,
  model: "illustrative-circular",
  notice:
    "Circular orbits, chosen initial phases, compressed distances, and exaggerated radii are illustrative. The clock does not represent observed celestial positions. Background stars and surfaces are procedural.",
};
