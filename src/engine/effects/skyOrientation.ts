import { Vector3 } from "three";

/** IAU 1976 J2000 mean obliquity of the ecliptic, radians. */
export const J2000_OBLIQUITY = (23.4392911 * Math.PI) / 180;

/**
 * Equatorial J2000 unit vector → engine axes (+X equinox, +Y ecliptic north, −Z ecliptic
 * east): rotate to the ecliptic about the equinox, then map (x, y, z) → (x, z, −y).
 */
export function equatorialToEngine(x: number, y: number, z: number, target = new Vector3()): Vector3 {
  const yEcl = y * Math.cos(J2000_OBLIQUITY) + z * Math.sin(J2000_OBLIQUITY);
  const zEcl = -y * Math.sin(J2000_OBLIQUITY) + z * Math.cos(J2000_OBLIQUITY);
  return target.set(x, zEcl, -yEcl);
}

/**
 * The NASA SVS sky assets were built in three.js SphereGeometry sphere coordinates, which
 * place equatorial (x, y, z) at (x, z, y): a mirror image with the celestial pole on the
 * ecliptic pole. Convert such a direction to true engine axes.
 */
export function skyAssetDirectionToEngine(direction: Vector3, target = new Vector3()): Vector3 {
  return equatorialToEngine(direction.x, direction.z, direction.y, target);
}

/** Right ascension / declination (degrees) → engine-axes unit vector. */
export function raDecToEngine(raDeg: number, decDeg: number, target = new Vector3()): Vector3 {
  const ra = (raDeg * Math.PI) / 180, dec = (decDeg * Math.PI) / 180;
  return equatorialToEngine(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), target);
}
