import { Quaternion, Vector3 } from "three";

const DEG = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const NORTH = new Vector3(0, 1, 0);
const EQUINOX = new Vector3(1, 0, 0);
const wrap = (value: number, period: number) => ((value % period) + period) % period;

/**
 * USNO approximate solar coordinates and Greenwich mean sidereal time.
 * UTC substitutes for UT1/TT; no Earth-orientation parameters or nutation feed.
 * https://aa.usno.navy.mil/faq/sun_approx
 * https://aa.usno.navy.mil/faq/GAST
 */
export function earthOrientationAt(utcMs: number, modelSunDirection?: Vector3) {
  if (!Number.isFinite(utcMs)) throw new RangeError("Earth orientation requires a finite UTC instant.");
  const days = (utcMs - J2000_MS) / 86_400_000;
  // Previous UTC midnight relative to J2000 noon, including dates before J2000.
  const midnightDays = Math.floor(days + 0.5) - 0.5;
  const hours = (days - midnightDays) * 24;
  const centuries = days / 36525;
  const siderealHours = wrap(6.697375 + 0.065709824279 * midnightDays
    + 1.0027379 * hours + 0.0000258 * centuries ** 2, 24);
  const spinRadians = siderealHours * 15 * DEG;
  const anomaly = wrap(357.529 + 0.98560028 * days, 360) * DEG;
  const longitude = wrap(280.459 + 0.98564736 * days
    + 1.915 * Math.sin(anomaly) + 0.020 * Math.sin(2 * anomaly), 360) * DEG;
  const obliquity = (23.439 - 0.00000036 * days) * DEG;
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude));
  const subsolarLatitudeDeg = Math.asin(Math.sin(obliquity) * Math.sin(longitude)) / DEG;
  const subsolarLongitudeDeg = wrap((rightAscension - spinRadians) / DEG + 180, 360) - 180;

  // Equatorial-of-date -> ecliptic-of-date, expressed in the engine's +Y north,
  // +X equinox, -Z east axes. Body longitude zero is +X (texture u=0.5).
  const poleRotation = new Quaternion().setFromAxisAngle(EQUINOX, -obliquity);
  if (modelSunDirection) {
    if (![modelSunDirection.x, modelSunDirection.y, modelSunDirection.z].every(Number.isFinite)
      || modelSunDirection.lengthSq() < 1e-20) throw new RangeError("Invalid modeled Sun direction.");
    // The orbit phase is illustrative. Rotate this local reference frame to its
    // Sun so UTC geography/seasonal daylight stay correct without calling the
    // circular orbit an ephemeris. The background stars are not recalibrated.
    const azimuth = Math.atan2(-modelSunDirection.z, modelSunDirection.x);
    const yaw = new Quaternion().setFromAxisAngle(NORTH, azimuth - longitude);
    const elevation = Math.atan2(modelSunDirection.y, Math.hypot(modelSunDirection.x, modelSunDirection.z));
    const tangent = new Vector3(Math.sin(azimuth), 0, Math.cos(azimuth));
    const pitch = new Quaternion().setFromAxisAngle(tangent, elevation);
    poleRotation.premultiply(yaw).premultiply(pitch);
  }
  return { spinRadians, poleRotation, subsolarLatitudeDeg, subsolarLongitudeDeg };
}
