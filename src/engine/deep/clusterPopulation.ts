/**
 * Statistical star populations for clusters. A cluster's measured distance, size, age, member
 * count (open clusters, Gaia) or integrated magnitude (globulars) fix how many stars it has
 * and how bright they are; the individual stars drawn are a seeded random sample, not the
 * real members. Approximations (documented in ASSET_SOURCES.md):
 *  - Kroupa (2001) initial mass function from 0.1 M☉;
 *  - textbook main-sequence mass–luminosity and mass–radius relations;
 *  - main-sequence lifetime 10 Gyr × M^−2.5 sets the turnoff mass; stars up to 4% above the
 *    turnoff are giants (red giant branch, red clump or blue horizontal branch, supergiants
 *    in young clusters), heavier ones are faint remnants and are not drawn;
 *  - Plummer (open) or core + halo Plummer (globular) spatial profiles.
 */
import { bolometricCorrection, SOLAR_MBOL, SOLAR_TEMPERATURE_K } from "../stars/stellarPhysics";

export const IMF_MIN = 0.1;
export const IMF_BREAK = 0.5;
export const IMF_MAX = 120;
/** Post-main-sequence life is ~10% of the main sequence: Δt/t = 2.5 Δm/m → 4% in mass. */
const GIANT_SPAN = 0.04;
/** Gaia membership effectively reaches about G = 18 (taken as V). */
export const MEMBER_LIMIT_V = 18;
/** Stars brighter than this from Earth are in the HYG catalogue already; samples leave them out. */
export const CATALOGUE_LIMIT_V = 7.5;

/** ∫ ξ(M) dM for the Kroupa IMF (ξ ∝ M^−1.3 below 0.5 M☉, ∝ M^−2.3 above, continuous). */
export function imfCount(m1: number, m2: number): number {
  const a = Math.max(IMF_MIN, Math.min(m1, m2)), b = Math.min(IMF_MAX, Math.max(m1, m2));
  if (b <= a) return 0;
  let total = 0;
  if (a < IMF_BREAK) total += (Math.min(b, IMF_BREAK) ** -0.3 - a ** -0.3) / -0.3;
  if (b > IMF_BREAK) total += 0.5 * (b ** -1.3 - Math.max(a, IMF_BREAK) ** -1.3) / -1.3;
  return total;
}

/** Mass m such that imfCount(low, m) = target (target ≤ imfCount(low, IMF_MAX)). */
export function imfInverse(low: number, target: number): number {
  const a = Math.max(IMF_MIN, low);
  if (a < IMF_BREAK) {
    const below = imfCount(a, IMF_BREAK);
    if (target <= below) return (a ** -0.3 - 0.3 * target) ** (-1 / 0.3);
    return imfInverse(IMF_BREAK, target - below);
  }
  const base = a ** -1.3 - (1.3 * target) / 0.5;
  return base <= IMF_MAX ** -1.3 ? IMF_MAX : base ** (-1 / 1.3);
}

/** Main-sequence luminosity (L☉): 0.23 M^2.3, M^4, 1.4 M^3.5, 32 000 M. */
export function mainSequenceLuminosity(mass: number): number {
  if (mass < 0.43) return 0.23 * mass ** 2.3;
  if (mass < 2) return mass ** 4;
  if (mass < 55) return 1.4 * mass ** 3.5;
  return 32_000 * mass;
}

export function mainSequenceTemperature(mass: number): number {
  const radius = mass < 1 ? mass ** 0.8 : mass ** 0.57;
  return SOLAR_TEMPERATURE_K * (mainSequenceLuminosity(mass) / (radius * radius)) ** 0.25;
}

/** Turnoff mass for an age (log10 years): t_MS = 10 Gyr × M^−2.5. */
export function turnoffMass(logAge: number): number {
  return Math.min(IMF_MAX, Math.max(0.7, (10 ** logAge / 1e10) ** -0.4));
}

export function absoluteV(luminosity: number, temperatureK: number): number {
  return SOLAR_MBOL - 2.5 * Math.log10(luminosity) - bolometricCorrection(temperatureK);
}

/** Seeded generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PopulationSpec {
  kind: "open" | "globular";
  logAge: number;
  /** [Fe/H] (globulars; 0 for open clusters). */
  metallicity: number;
}

/** Luminosity and temperature of a star of this mass, or null for a remnant. */
export function starAt(mass: number, spec: PopulationSpec, random: () => number): { luminosity: number; temperatureK: number } | null {
  const turnoff = turnoffMass(spec.logAge);
  if (mass < turnoff) return { luminosity: mainSequenceLuminosity(mass), temperatureK: mainSequenceTemperature(mass) };
  if (mass > turnoff * (1 + GIANT_SPAN)) return null;
  const u = random();
  if (turnoff < 2.5) {
    // Low-mass giants: core-helium burning (clump, or blue horizontal branch when metal-poor) or the giant branch.
    if (u < 0.35) {
      if (spec.metallicity < -1.4) return { luminosity: 45, temperatureK: 7500 + 4500 * random() };
      return { luminosity: 45, temperatureK: 4900 };
    }
    // Giant-branch luminosity function dN/dL ∝ L^−1.6 from the subgiants (3 L☉) to the tip (2000 L☉).
    const luminosity = (3 ** -0.6 - random() * (3 ** -0.6 - 2000 ** -0.6)) ** (-1 / 0.6);
    const base = 4800 + 250 * Math.min(2, Math.max(0, -spec.metallicity - 0.5));
    return { luminosity, temperatureK: base - 350 * Math.log10(luminosity / 10) };
  }
  // Young clusters: blue and red supergiants.
  const luminosity = mainSequenceLuminosity(turnoff) * (1.5 + random());
  return { luminosity, temperatureK: u < 0.6 ? 3700 + 800 * random() : 9000 + 15_000 * random() };
}

/** Upper end of the living population (heavier stars are remnants). */
export function livingMassLimit(logAge: number): number {
  return Math.min(IMF_MAX, turnoffMass(logAge) * (1 + GIANT_SPAN));
}

const meanLuminosityCache = new Map<string, number>();

/**
 * Mean V-band luminosity per star (L☉,V) of the living population, by quadrature; memoised
 * with ages binned to 0.05 dex and [Fe/H] to 0.1 dex (it varies slowly with both).
 */
export function meanVisualLuminosity(spec: PopulationSpec): number {
  const logAge = Math.round(spec.logAge * 20) / 20, metallicity = Math.round(spec.metallicity * 10) / 10;
  const key = `${spec.kind}:${logAge}:${metallicity}`;
  const cached = meanLuminosityCache.get(key);
  if (cached !== undefined) return cached;
  const value = integrateVisualLuminosity({ kind: spec.kind, logAge, metallicity });
  meanLuminosityCache.set(key, value);
  return value;
}

function integrateVisualLuminosity(spec: PopulationSpec): number {
  const top = livingMassLimit(spec.logAge), turnoff = turnoffMass(spec.logAge);
  const random = seededRandom(7);
  let weighted = 0, count = 0;
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const m1 = IMF_MIN * (top / IMF_MIN) ** (i / steps), m2 = IMF_MIN * (top / IMF_MIN) ** ((i + 1) / steps);
    const weight = imfCount(m1, m2);
    const mass = Math.sqrt(m1 * m2);
    let luminosityV = 0;
    if (mass < turnoff) {
      luminosityV = 10 ** (-0.4 * (absoluteV(mainSequenceLuminosity(mass), mainSequenceTemperature(mass)) - 4.83));
    } else {
      // Average the giant phases.
      for (let k = 0; k < 16; k++) {
        const star = starAt(mass, spec, random);
        if (star) luminosityV += 10 ** (-0.4 * (absoluteV(star.luminosity, star.temperatureK) - 4.83)) / 16;
      }
    }
    weighted += weight * luminosityV;
    count += weight;
  }
  return weighted / count;
}

/** Least main-sequence mass brighter than absolute magnitude `limit` (bisection). */
export function massBrighterThan(limit: number, top: number): number {
  let low = IMF_MIN, high = top;
  if (absoluteV(mainSequenceLuminosity(low), mainSequenceTemperature(low)) <= limit) return IMF_MIN;
  if (absoluteV(mainSequenceLuminosity(high), mainSequenceTemperature(high)) > limit) return high;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(low * high);
    if (absoluteV(mainSequenceLuminosity(mid), mainSequenceTemperature(mid)) <= limit) high = mid;
    else low = mid;
  }
  return high;
}

export interface ClusterModel {
  kind: "open" | "globular";
  distancePc: number;
  logAge: number;
  metallicity: number;
  extinctionV: number;
  /** Plummer scale radii (pc): half-light (projected) and core; tidal truncation. */
  halfRadiusPc: number;
  coreRadiusPc: number;
  tidalRadiusPc: number;
  /** Gaia members (open clusters) or integrated absolute V magnitude (globulars). */
  members?: number;
  absMagV?: number;
}

/** Number of living stars from 0.1 M☉ in the cluster. */
export function totalStars(model: ClusterModel): number {
  const spec: PopulationSpec = { kind: model.kind, logAge: model.logAge, metallicity: model.metallicity };
  const top = livingMassLimit(model.logAge), turnoff = turnoffMass(model.logAge);
  if (model.kind === "globular" && model.absMagV !== undefined)
    return 10 ** (-0.4 * (model.absMagV - 4.83)) / meanVisualLuminosity(spec);
  // Open clusters: the Gaia members are the stars brighter than the membership limit.
  const limit = MEMBER_LIMIT_V - 5 * Math.log10(model.distancePc / 10) - model.extinctionV;
  const visibleFrom = Math.min(turnoff, massBrighterThan(limit, turnoff));
  const visible = imfCount(visibleFrom, top);
  return Math.max(model.members ?? 0, ((model.members ?? 0) * imfCount(IMF_MIN, top)) / Math.max(visible, 1e-12));
}

export interface StarSample {
  /** x, y, z relative to the cluster centre, parsecs. */
  positions: Float32Array;
  absMag: Float32Array;
  temperatureK: Float32Array;
  /** Sum of the drawn stars' V-band luminosity (L☉). */
  luminosityV: number;
  /** Light of sampled stars left out because the catalogue already has them (L☉, V). */
  skippedLuminosityV: number;
  count: number;
}

/** Radius of a Plummer sphere (scale a) enclosing fraction u of the mass. */
export function plummerRadius(a: number, u: number): number {
  return a / Math.sqrt(u ** (-2 / 3) - 1);
}

/**
 * Draw the stars between masses `low` and `high`: `count` of them, positions from the
 * cluster's profile, skipping any bright enough from Earth to be a catalogue star.
 */
export function sampleStars(model: ClusterModel, low: number, high: number, count: number, seed: number): StarSample {
  const random = seededRandom(seed);
  const spec: PopulationSpec = { kind: model.kind, logAge: model.logAge, metallicity: model.metallicity };
  const positions = new Float32Array(count * 3), absMag = new Float32Array(count), temperatureK = new Float32Array(count);
  const span = imfCount(low, high);
  const distanceModulus = 5 * Math.log10(model.distancePc / 10) + model.extinctionV;
  const enclosed = (a: number) => {
    const rt = model.tidalRadiusPc;
    return rt > 0 ? rt ** 3 / (rt * rt + a * a) ** 1.5 : 0.99;
  };
  let n = 0, luminosityV = 0, skippedLuminosityV = 0;
  for (let i = 0; i < count; i++) {
    const mass = imfInverse(low, random() * span);
    const star = starAt(mass, spec, random);
    if (!star) continue;
    const magnitude = absoluteV(star.luminosity, star.temperatureK);
    if (magnitude + distanceModulus < CATALOGUE_LIMIT_V) {
      skippedLuminosityV += 10 ** (-0.4 * (magnitude - 4.83));
      continue;
    }
    // Globulars: a dense core inside a wider halo; open clusters: one Plummer sphere.
    const a = model.kind === "globular" && random() < 0.4 ? model.coreRadiusPc : model.halfRadiusPc;
    const r = plummerRadius(a, Math.max(1e-6, random() * enclosed(a)));
    const z = random() * 2 - 1, phi = random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    positions[n * 3] = r * s * Math.cos(phi);
    positions[n * 3 + 1] = r * z;
    positions[n * 3 + 2] = r * s * Math.sin(phi);
    absMag[n] = magnitude;
    temperatureK[n] = star.temperatureK;
    luminosityV += 10 ** (-0.4 * (magnitude - 4.83));
    n++;
  }
  return { positions: positions.subarray(0, n * 3), absMag: absMag.subarray(0, n), temperatureK: temperatureK.subarray(0, n), luminosityV, skippedLuminosityV, count: n };
}

/** Mass above which a population of `total` stars has `wanted` stars (up to `top`). */
export function massForCount(total: number, wanted: number, top: number): number {
  const all = imfCount(IMF_MIN, top);
  if (wanted >= total) return IMF_MIN;
  return imfInverse(IMF_MIN, all * (1 - wanted / total));
}
