import type { ObjectId } from "../../types/celestial";
import type { Cartesian } from "../coordinates/CoordinateSystem";
import { eclipticToEngine } from "./kepler";
import { moonGeocentricKm } from "./moon";
import {
  STANDISH_VALID_FROM_MS,
  STANDISH_VALID_UNTIL_MS,
  standishHeliocentricKm,
  type StandishBody,
} from "./planets";
import { smallBodyHeliocentricKm, SMALL_BODY_ELEMENTS, type SmallBodyId } from "./smallBodies";
import { utcToTdbMs } from "./time";
import { generatedOrbits, GENERATED_EPOCH_TDB_MS } from "../../data/generatedBodies";
import { generatedEclipticKm, isSampled, SAMPLES_START_TDB_MS, SAMPLES_STOP_TDB_MS } from "./generatedEphemeris";

/** IAU 2009 / DE405 Earth-to-Moon mass ratio, used to split the barycenter. */
const EARTH_MOON_MASS_RATIO = 81.30056;

export type EphemerisModel = "jpl-keplerian-approx" | "meeus-elp" | "sbdb-two-body" | "jpl-fitted-elements";

export interface EphemerisCoverage {
  model: EphemerisModel;
  label: string;
  source: { label: string; url: string };
  /** UTC range where published accuracy applies; outside it, positions degrade. */
  validFromMs: number;
  validUntilMs: number;
}

const STANDISH_SOURCE = {
  label: "JPL Approximate Positions of the Planets (Standish)",
  url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
};
const PLANETS: Partial<Record<ObjectId, StandishBody>> = {
  mercury: "mercury", venus: "venus", mars: "mars", jupiter: "jupiter",
  saturn: "saturn", uranus: "uranus", neptune: "neptune",
};
const SMALL_BODIES: Partial<Record<ObjectId, SmallBodyId>> = {
  ceres: "ceres", vesta: "vesta", bennu: "bennu",
};
const YEAR_MS = 365.25 * 86_400_000;
const jdToMs = (jd: number) => (jd - 2440587.5) * 86_400_000;

export function ephemerisCoverage(id: ObjectId): EphemerisCoverage | null {
  if (PLANETS[id] || id === "earth")
    return {
      model: "jpl-keplerian-approx",
      label: id === "earth"
        ? "JPL mean elements (Earth–Moon barycenter) with lunar offset"
        : "JPL mean Keplerian elements and rates",
      source: STANDISH_SOURCE,
      validFromMs: STANDISH_VALID_FROM_MS,
      validUntilMs: STANDISH_VALID_UNTIL_MS,
    };
  if (id === "moon")
    return {
      model: "meeus-elp",
      label: "Truncated ELP-2000/82 lunar theory (Meeus ch. 47)",
      source: { label: "Meeus, Astronomical Algorithms, 2nd ed., ch. 47", url: "https://www.willbell.com/math/mc1.htm" },
      validFromMs: Date.UTC(1500, 0, 1),
      validUntilMs: Date.UTC(2500, 0, 1),
    };
  const small = SMALL_BODIES[id];
  if (small) {
    const epochMs = jdToMs(SMALL_BODY_ELEMENTS[small].epochJd);
    return {
      model: "sbdb-two-body",
      label: `JPL osculating elements (${SMALL_BODY_ELEMENTS[small].solution}), two-body propagation`,
      source: { label: "JPL Small-Body Database", url: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(SMALL_BODY_ELEMENTS[small].designation)}` },
      // Unperturbed propagation is only trustworthy within a few years of the epoch.
      validFromMs: epochMs - 5 * YEAR_MS,
      validUntilMs: epochMs + 5 * YEAR_MS,
    };
  }
  const generated = generatedOrbits.get(id);
  if (generated) {
    const sampled = isSampled(id);
    return {
      model: "jpl-fitted-elements",
      label: sampled
        ? "JPL Horizons positions sampled 2024–2030 (interpolated); fitted elements outside"
        : `JPL elements fitted to Horizons (${generated.referencePlane} plane; held-out error ${generated.holdoutErrorDeg.toFixed(2)}°)`,
      source: { label: "JPL Horizons and SSD satellite elements", url: "https://ssd.jpl.nasa.gov/sats/elem/" },
      validFromMs: sampled ? SAMPLES_START_TDB_MS : GENERATED_EPOCH_TDB_MS - 3 * YEAR_MS,
      validUntilMs: sampled ? SAMPLES_STOP_TDB_MS : GENERATED_EPOCH_TDB_MS + 3 * YEAR_MS,
    };
  }
  return null;
}

/** The center each model is referred to: the Moon is geocentric, generated moons orbit their planet. */
export function analyticParentOf(id: ObjectId): ObjectId | null {
  // Called per body per frame: avoid building the descriptive coverage record.
  if (id === "moon") return "earth";
  if (PLANETS[id] || id === "earth" || SMALL_BODIES[id]) return "sun";
  return generatedOrbits.get(id)?.parentId ?? null;
}

export function isWithinCoverage(id: ObjectId, utcMs: number): boolean {
  const coverage = ephemerisCoverage(id);
  return !!coverage && utcMs >= coverage.validFromMs && utcMs <= coverage.validUntilMs;
}

/** Astronomical-axes positions, all at one TDB instant. Exposed for validation. */
export function eclipticRelativeKm(id: ObjectId, tdbMs: number): Cartesian | null {
  const planet = PLANETS[id];
  if (planet) return standishHeliocentricKm(planet, tdbMs);
  const small = SMALL_BODIES[id];
  if (small) return smallBodyHeliocentricKm(small, tdbMs);
  if (id === "moon") return moonGeocentricKm(tdbMs);
  if (generatedOrbits.has(id)) return generatedEclipticKm(id, tdbMs);
  if (id === "earth") {
    const barycenter = standishHeliocentricKm("earthMoonBarycenter", tdbMs);
    const moon = moonGeocentricKm(tdbMs);
    const k = 1 / (1 + EARTH_MOON_MASS_RATIO);
    return { x: barycenter.x - moon.x * k, y: barycenter.y - moon.y * k, z: barycenter.z - moon.z * k };
  }
  return null;
}

/**
 * Parent-relative position in engine axes (+X equinox, +Y ecliptic north, −Z east)
 * and kilometers, or null when no analytic model covers the object.
 * Planets, Ceres, Vesta and Bennu are heliocentric; the Moon is geocentric.
 */
export function analyticRelativePositionKm(id: ObjectId, utcMs: number): Cartesian | null {
  if (!Number.isFinite(utcMs)) return null;
  const position = eclipticRelativeKm(id, utcToTdbMs(utcMs));
  return position ? eclipticToEngine(position) : null;
}
