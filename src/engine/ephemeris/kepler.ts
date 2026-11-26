import type { Cartesian } from "../coordinates/CoordinateSystem";

export const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Wrap an angle in radians to (-π, π]. */
export function wrapPi(angle: number): number {
  const wrapped = ((angle % TAU) + TAU) % TAU;
  return wrapped > Math.PI ? wrapped - TAU : wrapped;
}

/** Solve Kepler's equation M = E − e·sin E for elliptic orbits (0 ≤ e < 1). */
export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  if (!(eccentricity >= 0 && eccentricity < 1))
    throw new RangeError("Only elliptic orbits are supported.");
  const m = wrapPi(meanAnomaly);
  let e = eccentricity < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let i = 0; i < 30; i++) {
    const delta = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e));
    e -= delta;
    if (Math.abs(delta) < 1e-14) break;
  }
  return e;
}

/** Classical elements: angles in radians, semi-major axis in any length unit. */
export interface KeplerianElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  ascendingNode: number;
  argumentOfPeriapsis: number;
  meanAnomaly: number;
}

/**
 * Position in the elements' reference plane (here J2000 mean ecliptic and equinox),
 * standard astronomical axes: +x equinox, +z ecliptic north. Same unit as `a`.
 */
export function keplerianToEcliptic(elements: KeplerianElements): Cartesian {
  const { semiMajorAxis: a, eccentricity: e, inclination: i } = elements;
  const anomaly = solveKepler(elements.meanAnomaly, e);
  const xp = a * (Math.cos(anomaly) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(anomaly);
  const cw = Math.cos(elements.argumentOfPeriapsis), sw = Math.sin(elements.argumentOfPeriapsis);
  const cn = Math.cos(elements.ascendingNode), sn = Math.sin(elements.ascendingNode);
  const ci = Math.cos(i), si = Math.sin(i);
  return {
    x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

/**
 * Astronomical ecliptic (+z north, +y 90° east of equinox) → engine axes
 * (+X equinox, +Y north, −Z east). A proper rotation, so handedness and
 * prograde motion are preserved.
 */
export function eclipticToEngine(position: Cartesian): Cartesian {
  return { x: position.x, y: position.z, z: -position.y };
}
