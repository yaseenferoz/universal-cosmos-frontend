import { Vector3 } from "three";
import type { Exoplanet } from "../../data/stars/exoplanets";
import { equatorialToEngine } from "../effects/skyOrientation";

/**
 * Two-body Keplerian orbits for exoplanets, oriented relative to our line of sight.
 *
 * What is measured and what is not:
 * - Size, shape and period (a, e, P) come from the archive (a from Kepler's third law if absent).
 * - Inclination i is measured relative to the plane of the sky (i = 90° is edge-on from Earth);
 *   transiting planets are near 90°. When unknown it is assumed (60°, the median for random
 *   orientations) and flagged.
 * - The longitude of the ascending node (rotation about our line of sight) is almost never
 *   known; it is set to 0 (node along celestial north), so that rotation is illustrative.
 * - Position along the orbit follows the transit/conjunction time or periastron time when
 *   published; otherwise the phase is illustrative.
 * Planet-planet interactions (e.g. TRAPPIST-1's timing variations) are not modelled.
 */
export const PC_PER_AU = 4.84813681109536e-6;
export const PC_PER_EARTH_RADIUS = 6371.0 / 3.085677581491367e13;
export const J2000_JD = 2451545.0;
const DAYS_PER_YEAR = 365.25;
/** Median inclination for isotropic orbit orientations. */
const ASSUMED_INCLINATION = (60 * Math.PI) / 180;

export interface OrbitElements {
  semiMajorAxisAu: number;
  eccentricity: number;
  inclination: number;
  /** Argument of periastron (rad). */
  periastronArgument: number;
  /** Longitude of the ascending node on the sky (rad); unknown, so 0. */
  node: number;
  periodDays: number;
  meanAnomalyAtEpoch: number;
  epochJd: number;
  semiMajorAxisFrom: "archive" | "calculated" | "kepler-law";
  inclinationFrom: "measured" | "transit" | "assumed";
  phaseFrom: "transit" | "conjunction" | "periastron" | "illustrative";
}

/** Eccentric anomaly E from mean anomaly M (Newton iteration; e < 1). */
export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  const M = ((meanAnomaly % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = eccentricity > 0.8 ? Math.PI * Math.sign(M || 1) : M;
  for (let i = 0; i < 30; i++) {
    const step = (E - eccentricity * Math.sin(E) - M) / (1 - eccentricity * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  return E;
}

function trueFromEccentric(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

function meanFromTrue(f: number, e: number): number {
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(f / 2), Math.sqrt(1 + e) * Math.cos(f / 2));
  return E - e * Math.sin(E);
}

/** Deterministic 0..1 from a name, for illustrative phases. */
function nameFraction(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Orbit elements for a planet, or null when neither period nor semi-major axis is known. */
export function resolveOrbit(planet: Exoplanet, starMassSolar: number | undefined): OrbitElements | null {
  const mass = starMassSolar && starMassSolar > 0 ? starMassSolar : 1;
  let a = planet.semiMajorAxisAu, P = planet.periodDays;
  let semiMajorAxisFrom: OrbitElements["semiMajorAxisFrom"] = planet.semiMajorAxisCalculated ? "calculated" : "archive";
  if (a === undefined && P !== undefined) {
    a = Math.cbrt(mass * (P / DAYS_PER_YEAR) ** 2);
    semiMajorAxisFrom = "kepler-law";
  }
  if (a === undefined) return null;
  P ??= DAYS_PER_YEAR * Math.sqrt(a ** 3 / mass);
  const e = Math.min(0.97, Math.max(0, planet.eccentricity ?? 0));
  const inclinationFrom = planet.inclinationDeg !== undefined ? "measured" : planet.transiting ? "transit" : "assumed";
  const inclination = planet.inclinationDeg !== undefined ? (planet.inclinationDeg * Math.PI) / 180
    : planet.transiting ? Math.PI / 2 : ASSUMED_INCLINATION;
  const periastronArgument = ((planet.periastronArgumentDeg ?? 90) * Math.PI) / 180;
  let meanAnomalyAtEpoch: number, epochJd: number, phaseFrom: OrbitElements["phaseFrom"];
  if (planet.conjunctionJd !== undefined) {
    // Inferior conjunction (transit when edge-on) is where ω + f = 90°: in front of the star as seen from Earth.
    meanAnomalyAtEpoch = meanFromTrue(Math.PI / 2 - periastronArgument, e);
    epochJd = planet.conjunctionJd;
    phaseFrom = planet.transiting ? "transit" : "conjunction";
  } else if (planet.periastronJd !== undefined) {
    meanAnomalyAtEpoch = 0;
    epochJd = planet.periastronJd;
    phaseFrom = "periastron";
  } else {
    meanAnomalyAtEpoch = nameFraction(planet.name) * 2 * Math.PI;
    epochJd = J2000_JD;
    phaseFrom = "illustrative";
  }
  return {
    semiMajorAxisAu: a, eccentricity: e, inclination, periastronArgument, node: 0, periodDays: P,
    meanAnomalyAtEpoch, epochJd, semiMajorAxisFrom, inclinationFrom, phaseFrom,
  };
}

/** Sky-plane basis at a host star (engine axes): z toward the Sun, x toward celestial north. */
export interface OrbitFrame {
  x: Vector3;
  y: Vector3;
  z: Vector3;
}

export function orbitFrame(hostHeliocentricPc: Vector3): OrbitFrame {
  const z = hostHeliocentricPc.lengthSq() > 0 ? hostHeliocentricPc.clone().negate().normalize() : new Vector3(0, 1, 0);
  const north = equatorialToEngine(0, 0, 1);
  const x = north.sub(z.clone().multiplyScalar(north.dot(z)));
  if (x.lengthSq() < 1e-12) x.set(1, 0, 0).sub(z.clone().multiplyScalar(z.x));
  x.normalize();
  const y = new Vector3().crossVectors(z, x).normalize();
  return { x, y, z };
}

/** Position relative to the host (AU, engine axes) at argument of latitude u and radius r. */
function place(el: OrbitElements, frame: OrbitFrame, u: number, r: number, target: Vector3): Vector3 {
  const cosO = Math.cos(el.node), sinO = Math.sin(el.node), cosI = Math.cos(el.inclination), sinI = Math.sin(el.inclination);
  const cu = Math.cos(u), su = Math.sin(u);
  const X = cosO * cu - sinO * su * cosI, Y = sinO * cu + cosO * su * cosI, Z = su * sinI;
  return target.set(
    r * (X * frame.x.x + Y * frame.y.x + Z * frame.z.x),
    r * (X * frame.x.y + Y * frame.y.y + Z * frame.z.y),
    r * (X * frame.x.z + Y * frame.y.z + Z * frame.z.z),
  );
}

/** Planet position relative to its host at a Julian date (AU, engine axes). */
export function orbitPositionAu(el: OrbitElements, frame: OrbitFrame, jd: number, target = new Vector3()): Vector3 {
  const M = el.meanAnomalyAtEpoch + (2 * Math.PI * (jd - el.epochJd)) / el.periodDays;
  const E = solveKepler(M, el.eccentricity);
  const f = trueFromEccentric(E, el.eccentricity);
  const r = el.semiMajorAxisAu * (1 - el.eccentricity * Math.cos(E));
  return place(el, frame, el.periastronArgument + f, r, target);
}

/** Unit normal of the orbital plane (direction of the orbital angular momentum). */
export function orbitNormal(el: OrbitElements, frame: OrbitFrame, target = new Vector3()): Vector3 {
  const sinI = Math.sin(el.inclination), cosI = Math.cos(el.inclination);
  const nx = Math.sin(el.node) * sinI, ny = -Math.cos(el.node) * sinI, nz = cosI;
  return target.set(
    nx * frame.x.x + ny * frame.y.x + nz * frame.z.x,
    nx * frame.x.y + ny * frame.y.y + nz * frame.z.y,
    nx * frame.x.z + ny * frame.y.z + nz * frame.z.z,
  ).normalize();
}

/** Closed orbit outline (AU, engine axes) sampled evenly in true anomaly. */
export function orbitPathAu(el: OrbitElements, frame: OrbitFrame, segments = 256): Float32Array {
  const points = new Float32Array(segments * 3);
  const p = el.semiMajorAxisAu * (1 - el.eccentricity ** 2);
  const v = new Vector3();
  for (let i = 0; i < segments; i++) {
    const f = (i / segments) * 2 * Math.PI;
    place(el, frame, el.periastronArgument + f, p / (1 + el.eccentricity * Math.cos(f)), v);
    points.set([v.x, v.y, v.z], i * 3);
  }
  return points;
}

/** Julian date of a JavaScript time (ms since 1970). */
export function julianDate(ms: number): number {
  return ms / 86_400_000 + 2440587.5;
}
