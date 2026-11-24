import type { CelestialObject } from "../types/celestial";

/** Fixed demonstration orbit: 400 km above the equatorial reference radius.
 * Period follows two-body Kepler motion (Earth mu = 398600.4418 km³/s²).
 * Phase/ascending node are invented; no TLE, maneuvers, drag, or live telemetry.
 */
export const ISS_ORBIT_RADIUS_KM = 6378.137 + 400;
export const ISS_PERIOD_DAYS = 2 * Math.PI * Math.sqrt(ISS_ORBIT_RADIUS_KM ** 3 / 398600.4418) / 86400;
export const iss: CelestialObject = {
  id: "iss", name: "International Space Station (ISS)", category: "Orbital space station",
  parentId: "earth",
  description: "An inhabited orbital laboratory. Approach the NASA exterior model or explore seven connected modules using NASA Astrobee interior models. The fixed 400 km orbit and station configuration are illustrative, not live tracking.",
  radiusKm: 0.0545, // Half the published 109 m span, NOT a spherical physical radius.
  massKg: 419725, // NASA reference mass without visiting vehicles; configuration varies.
  gravityMs2: 0, // No standing surface gravity. Crew and station are in free fall.
  orbitalPeriodDays: ISS_PERIOD_DAYS,
  rotationPeriodHours: ISS_PERIOD_DAYS * 24, // Illustrative attitude period, not telemetry.
  semiMajorAxisKm: ISS_ORBIT_RADIUS_KM,
  axialTiltDeg: 0, color: "#dce3e8",
  source: { label: "NASA ISS facts and figures", url: "https://www.nasa.gov/international-space-station/space-station-facts-and-figures/" },
  display: { radius: 0.13, orbitRadius: 1.9, initialPhase: 0.7, inclination: 51.6 * Math.PI / 180 },
  facts: [
    { label: "Reference span", value: "109 m across the station" },
    { label: "Demonstration altitude", value: "400 km (fixed; actual orbit varies)" },
    { label: "Orbital inclination", value: "51.6° to Earth's equator" },
    { label: "Crew environment", value: "Microgravity through orbital free fall" },
    { label: "Model coverage", value: "NASA exterior + seven NASA Astrobee interior modules" },
  ],
};
