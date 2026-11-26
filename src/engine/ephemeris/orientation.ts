import { Quaternion, Vector3 } from "three";
import rotation from "../../data/generated/rotationElements.json";
import type { ObjectId } from "../../types/celestial";
import { DAYS_PER_JULIAN_CENTURY, J2000_MS, MS_PER_DAY } from "./time";

/**
 * IAU WGCCRE 2015 rotation models (Archinal et al. 2018), from the NAIF generic PCK
 * pck00011.tpc via scripts/prepare-rotation-elements.py.
 *
 * alpha0/delta0 give the north pole in ICRF (J2000 equatorial); W is the prime
 * meridian angle measured eastward along the body equator from the node of that
 * equator on the ICRF equator. Accuracy is that of the IAU model (the Moon's IAU
 * frame approximates the mean-Earth frame to ~150 m); no physical libration
 * beyond the published periodic terms.
 */
interface RotationEntry {
  naif: number;
  ra: number[];
  dec: number[];
  pm: number[];
  nutRa?: number[];
  nutDec?: number[];
  nutPm?: number[];
  system?: number;
}
interface RotationSystem {
  degree: number;
  angles: number[][];
}

const BODIES = rotation.bodies as Record<string, RotationEntry>;
const SYSTEMS = rotation.systems as Record<string, RotationSystem>;
const DEG = Math.PI / 180;
/** IAU 1976 / J2000 obliquity used by the engine's ecliptic axes. */
const OBLIQUITY = 23.4392911 * DEG;

export interface RotationAngles {
  /** Pole right ascension, ICRF, degrees. */
  alphaDeg: number;
  /** Pole declination, ICRF, degrees. */
  deltaDeg: number;
  /** Prime meridian angle, degrees (unwrapped). */
  wDeg: number;
}

export function hasIauRotation(id: ObjectId): boolean {
  return id in BODIES;
}

/** IAU rotational elements at a TDB instant (ms on the Unix axis), or null if none are published. */
export function iauRotationAngles(id: ObjectId, tdbMs: number): RotationAngles | null {
  const entry = BODIES[id];
  if (!entry || !Number.isFinite(tdbMs)) return null;
  const d = (tdbMs - J2000_MS) / MS_PER_DAY;
  const t = d / DAYS_PER_JULIAN_CENTURY;
  let alphaDeg = entry.ra[0] + entry.ra[1] * t + entry.ra[2] * t * t;
  let deltaDeg = entry.dec[0] + entry.dec[1] * t + entry.dec[2] * t * t;
  let wDeg = entry.pm[0] + entry.pm[1] * d + entry.pm[2] * d * d;
  const system = entry.system === undefined ? undefined : SYSTEMS[String(entry.system)];
  if (system) {
    const count = Math.max(entry.nutRa?.length ?? 0, entry.nutDec?.length ?? 0, entry.nutPm?.length ?? 0);
    for (let i = 0; i < count; i++) {
      const angle = system.angles[i];
      let theta = angle[0] + angle[1] * t;
      if (system.degree >= 2 && angle.length > 2) theta += angle[2] * t * t;
      theta *= DEG;
      const sine = Math.sin(theta);
      alphaDeg += (entry.nutRa?.[i] ?? 0) * sine;
      deltaDeg += (entry.nutDec?.[i] ?? 0) * Math.cos(theta);
      wDeg += (entry.nutPm?.[i] ?? 0) * sine;
    }
  }
  return { alphaDeg, deltaDeg, wDeg };
}

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const scratch = new Quaternion();

/**
 * Pole part of the body-fixed → engine rotation, for the `tilted` group.
 *
 * Mesh axes: +Y north pole, +X prime meridian (texture u = 0.5), −Z 90° east.
 * Chain: mesh→body-fixed Rx(90°); body→ICRF Rz(α+90°)·Rx(90°−δ)·Rz(W);
 * ICRF→ecliptic Rx(−ε); ecliptic→engine Rx(−90°). Since Rz(W)·Rx(90°) =
 * Rx(90°)·Ry(W), the spin separates as a rotation about the mesh +Y axis.
 */
export function iauPoleQuaternion(alphaDeg: number, deltaDeg: number, target = new Quaternion()): Quaternion {
  target.setFromAxisAngle(X_AXIS, -(Math.PI / 2 + OBLIQUITY));
  target.multiply(scratch.setFromAxisAngle(Z_AXIS, (alphaDeg + 90) * DEG));
  target.multiply(scratch.setFromAxisAngle(X_AXIS, (180 - deltaDeg) * DEG));
  return target;
}

/** Spin about the mesh +Y axis that places the IAU prime meridian on mesh +X. */
export function iauSpinRadians(wDeg: number): number {
  const wrapped = ((wDeg % 360) + 360) % 360;
  return wrapped * DEG;
}

/** Full body-fixed (mesh axes) → engine rotation for an IAU body at a TDB instant. */
export function iauBodyQuaternion(id: ObjectId, tdbMs: number, target = new Quaternion()): Quaternion | null {
  const angles = iauRotationAngles(id, tdbMs);
  if (!angles) return null;
  iauPoleQuaternion(angles.alphaDeg, angles.deltaDeg, target);
  return target.multiply(scratch.setFromAxisAngle(Y_AXIS, iauSpinRadians(angles.wDeg)));
}
