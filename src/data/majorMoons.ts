import type { CelestialObject, ObjectId } from "../types/celestial";

// JPL satellite physical parameters (GM in km³/s², mean radius in km) and
// mean elements (a in km, period in days), retrieved 2026-11-23.
// Elements have epoch J2000: SAT441 Laplace / URA182 equatorial frames.
// We use only a and period; rendered planes/phases are illustrative.
const rows: readonly [ObjectId, string, "saturn" | "uranus", number, number, number, number, number][] = [
  ["mimas", "Mimas", "saturn", 198.2, 2.50349, 186000, 0.942422, 2.8],
  ["tethys", "Tethys", "saturn", 531.1, 41.21353, 295000, 1.887802, 3.65],
  ["dione", "Dione", "saturn", 561.4, 73.11607, 377700, 2.736916, 4.2],
  ["rhea", "Rhea", "saturn", 763.5, 153.94175, 527200, 4.517503, 4.8],
  ["iapetus", "Iapetus", "saturn", 734.3, 120.51511, 3561700, 79.331002, 7.3],
  ["miranda", "Miranda", "uranus", 235.8, 4.3, 129846, 1.413479, 1.55],
  ["ariel", "Ariel", "uranus", 578.9, 83.5, 190929, 2.520379, 1.95],
  ["umbriel", "Umbriel", "uranus", 584.7, 85.1, 265986, 4.144177, 2.35],
  ["oberon", "Oberon", "uranus", 761.4, 205.3, 583511, 13.463237, 3.4],
];

export const majorMoons: CelestialObject[] = rows.map(
  ([id, name, parentId, radiusKm, gm, semiMajorAxisKm, orbitalPeriodDays, orbitRadius], index) => ({
    id, name, parentId, radiusKm, semiMajorAxisKm, orbitalPeriodDays,
    category: "Natural satellite",
    description: `${name} is an icy moon of ${parentId === "saturn" ? "Saturn" : "Uranus"}. This destination currently provides orbital exploration with an illustrative sphere; a verified surface map is not installed.`,
    massKg: gm / 6.67430e-20,
    gravityMs2: gm * 1000 / radiusKm ** 2,
    rotationPeriodHours: orbitalPeriodDays * 24,
    axialTiltDeg: 0,
    color: "#aaa9a5",
    source: { label: "JPL satellite physical parameters", url: "https://ssd.jpl.nasa.gov/sats/phys_par/" },
    display: { radius: Math.max(0.1, radiusKm / 4000), orbitRadius, initialPhase: (index * 2.4 + 0.6) % (Math.PI * 2), inclination: 0 },
    facts: [
      { label: "Size and gravity", value: "Mean radius; mass derived from JPL GM using G = 6.67430 × 10⁻²⁰ km³ kg⁻¹ s⁻². Gravity is spherical GM/r²." },
      { label: "Rotation model", value: "Synchronous period approximation; zero axial tilt is a display assumption, not a measured pole." },
      { label: "Orbit reference", value: "JPL mean elements at J2000; only mean distance and period are used. Circular paths, phases and planes are illustrative." },
    ],
  }),
);
