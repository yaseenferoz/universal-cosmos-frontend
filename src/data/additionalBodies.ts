import type { CelestialObject } from "../types/celestial";

type BodyInput = Pick<CelestialObject,
  "id" | "name" | "category" | "parentId" | "description" | "radiusKm" |
  "massKg" | "gravityMs2" | "orbitalPeriodDays" | "rotationPeriodHours" |
  "semiMajorAxisKm" | "axialTiltDeg" | "color" | "source"> & {
  orbitRadius: number;
  phase: number;
  inclinationDeg: number;
  displayRadius: number;
};

const satelliteSource = {
  label: "JPL Planetary Satellite Physical Parameters and Mean Elements",
  url: "https://ssd.jpl.nasa.gov/sats/phys_par/",
};

/** Mean size/distance/period references rounded for exploration. Phases and planes are illustrative. */
const inputs: BodyInput[] = [
  { id: "phobos", name: "Phobos", category: "Natural satellite", parentId: "mars", description: "The larger, inner moon of Mars is an irregular, heavily cratered body.", radiusKm: 11.1, massKg: 1.066e16, gravityMs2: 0.0057, orbitalPeriodDays: 0.3189, rotationPeriodHours: 7.65, semiMajorAxisKm: 9376, axialTiltDeg: 0, color: "#91877e", source: satelliteSource, orbitRadius: 1.25, phase: 0.8, inclinationDeg: 1, displayRadius: 0.09 },
  { id: "deimos", name: "Deimos", category: "Natural satellite", parentId: "mars", description: "Mars's smaller outer moon has a dark, irregular surface.", radiusKm: 6.2, massKg: 1.476e15, gravityMs2: 0.003, orbitalPeriodDays: 1.2624, rotationPeriodHours: 30.3, semiMajorAxisKm: 23463, axialTiltDeg: 0, color: "#8e877e", source: satelliteSource, orbitRadius: 1.9, phase: 3.1, inclinationDeg: 2, displayRadius: 0.07 },
  { id: "io", name: "Io", category: "Natural satellite", parentId: "jupiter", description: "Jupiter's innermost large moon has an actively volcanic surface.", radiusKm: 1821.5, massKg: 8.93e22, gravityMs2: 1.796, orbitalPeriodDays: 1.7627, rotationPeriodHours: 42.3, semiMajorAxisKm: 421800, axialTiltDeg: 0, color: "#d9bf85", source: satelliteSource, orbitRadius: 3.4, phase: 0.8, inclinationDeg: 0, displayRadius: 0.27 },
  { id: "europa", name: "Europa", category: "Natural satellite", parentId: "jupiter", description: "A bright icy shell covers Europa's global ocean.", radiusKm: 1560.8, massKg: 4.8e22, gravityMs2: 1.314, orbitalPeriodDays: 3.5255, rotationPeriodHours: 84.6, semiMajorAxisKm: 671100, axialTiltDeg: 0, color: "#c9bba0", source: satelliteSource, orbitRadius: 4.4, phase: 2.5, inclinationDeg: 1, displayRadius: 0.24 },
  { id: "ganymede", name: "Ganymede", category: "Natural satellite", parentId: "jupiter", description: "Ganymede is the largest natural satellite in the Solar System.", radiusKm: 2631.2, massKg: 1.48e23, gravityMs2: 1.428, orbitalPeriodDays: 7.1556, rotationPeriodHours: 171.7, semiMajorAxisKm: 1070400, axialTiltDeg: 0, color: "#a59d91", source: satelliteSource, orbitRadius: 5.6, phase: 4.1, inclinationDeg: 1, displayRadius: 0.32 },
  { id: "callisto", name: "Callisto", category: "Natural satellite", parentId: "jupiter", description: "Callisto is a dark, ancient, densely cratered Jovian moon.", radiusKm: 2410.3, massKg: 1.075e23, gravityMs2: 1.236, orbitalPeriodDays: 16.6904, rotationPeriodHours: 400.6, semiMajorAxisKm: 1882700, axialTiltDeg: 0, color: "#77736d", source: satelliteSource, orbitRadius: 7.2, phase: 5.3, inclinationDeg: 1, displayRadius: 0.3 },
  { id: "enceladus", name: "Enceladus", category: "Natural satellite", parentId: "saturn", description: "A bright icy moon with plumes from fractures near its south pole.", radiusKm: 252.1, massKg: 1.08e20, gravityMs2: 0.113, orbitalPeriodDays: 1.3702, rotationPeriodHours: 32.9, semiMajorAxisKm: 238000, axialTiltDeg: 0, color: "#dadce0", source: satelliteSource, orbitRadius: 3.15, phase: 2.7, inclinationDeg: 0, displayRadius: 0.13 },
  { id: "titan", name: "Titan", category: "Natural satellite", parentId: "saturn", description: "Saturn's largest moon is hidden beneath a dense orange atmosphere.", radiusKm: 2574.8, massKg: 1.345e23, gravityMs2: 1.352, orbitalPeriodDays: 15.9454, rotationPeriodHours: 382.7, semiMajorAxisKm: 1221870, axialTiltDeg: 0, color: "#c99762", source: satelliteSource, orbitRadius: 5.5, phase: 4.9, inclinationDeg: 1, displayRadius: 0.34 },
  { id: "titania", name: "Titania", category: "Natural satellite", parentId: "uranus", description: "Titania is the largest of Uranus's moons.", radiusKm: 788.9, massKg: 3.4e21, gravityMs2: 0.38, orbitalPeriodDays: 8.706, rotationPeriodHours: 208.9, semiMajorAxisKm: 436300, axialTiltDeg: 0, color: "#a7a39c", source: satelliteSource, orbitRadius: 2.8, phase: 1.8, inclinationDeg: 2, displayRadius: 0.2 },
  { id: "triton", name: "Triton", category: "Natural satellite", parentId: "neptune", description: "Neptune's largest moon travels in a retrograde orbit.", radiusKm: 1353.4, massKg: 2.14e22, gravityMs2: 0.779, orbitalPeriodDays: 5.8769, rotationPeriodHours: -141, semiMajorAxisKm: 354760, axialTiltDeg: 0, color: "#bbb2aa", source: satelliteSource, orbitRadius: 2.8, phase: 3.4, inclinationDeg: 180, displayRadius: 0.24 },
  { id: "ceres", name: "Ceres", category: "Dwarf planet · asteroid belt", parentId: "sun", description: "The largest body in the main asteroid belt, explored by Dawn.", radiusKm: 476, massKg: 9.39e20, gravityMs2: 0.28, orbitalPeriodDays: 1682, rotationPeriodHours: 9.07, semiMajorAxisKm: 413e6, axialTiltDeg: 4, color: "#8a8580", source: { label: "NASA Ceres Facts", url: "https://science.nasa.gov/dwarf-planets/ceres/facts/" }, orbitRadius: 31.7, phase: 4.2, inclinationDeg: 10.6, displayRadius: 0.24 },
  { id: "vesta", name: "Vesta", category: "Main-belt asteroid", parentId: "sun", description: "A large differentiated asteroid with a giant south polar basin, explored by Dawn.", radiusKm: 262.7, massKg: 2.59e20, gravityMs2: 0.25, orbitalPeriodDays: 1325.8, rotationPeriodHours: 5.34, semiMajorAxisKm: 353e6, axialTiltDeg: 27, color: "#928b82", source: { label: "NASA Vesta overview", url: "https://science.nasa.gov/solar-system/asteroids/4-vesta/" }, orbitRadius: 29.5, phase: 1.5, inclinationDeg: 7.1, displayRadius: 0.18 },
  { id: "bennu", name: "Bennu", category: "Near-Earth asteroid", parentId: "sun", description: "A small near-Earth asteroid sampled by OSIRIS-REx.", radiusKm: 0.246, massKg: 7.33e10, gravityMs2: 0.00008, orbitalPeriodDays: 436.6, rotationPeriodHours: 4.3, semiMajorAxisKm: 168e6, axialTiltDeg: 178, color: "#726c65", source: { label: "NASA Bennu Facts", url: "https://science.nasa.gov/solar-system/asteroids/101955-bennu/facts/" }, orbitRadius: 21.8, phase: 5.1, inclinationDeg: 5, displayRadius: 0.06 },
];

export const additionalBodies: CelestialObject[] = inputs.map(({ orbitRadius, phase, inclinationDeg, displayRadius, ...body }) => ({
  ...body,
  display: { radius: displayRadius, orbitRadius, initialPhase: phase, inclination: inclinationDeg * Math.PI / 180 },
  facts: [{ label: "Orbits", value: body.parentId === "sun" ? "Sun" : body.parentId ?? "—" }],
}));

