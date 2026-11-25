import { Matrix4, Quaternion, Vector3 } from "three";
import type { StationRegion } from "../../data/stationRegions";

/** Illustrative circular ISS orbit. Kilometers, seconds, Earth-fixed longitude east.
 * Inertial +Y is Earth's north pole. At each sample station-local +Y points
 * away from Earth's center, +Z follows orbital velocity, and +X is orbit-normal.
 * Elapsed 0 is an arbitrary ascending equator crossing at 20°E, not a UTC epoch.
 * This is a repeatable visualization, not a propagated TLE or live ephemeris.
 */
export const STATION_ALTITUDE_KM = 400;
export const STATION_INCLINATION_DEG = 51.6;
export const STATION_INITIAL_LONGITUDE_DEG = 20;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398600.4355;
const EARTH_SIDEREAL_DAY_SECONDS = 86164.0905;
const TWO_PI = 2 * Math.PI;
export const STATION_ORBIT_PERIOD_SECONDS = TWO_PI * Math.sqrt(
  (EARTH_EQUATORIAL_RADIUS_KM + STATION_ALTITUDE_KM) ** 3 / EARTH_GRAVITATIONAL_PARAMETER_KM3_S2,
);

const initialLongitude = STATION_INITIAL_LONGITUDE_DEG * Math.PI / 180;
const inclination = STATION_INCLINATION_DEG * Math.PI / 180;
const radialStart = new Vector3(Math.cos(initialLongitude), 0, -Math.sin(initialLongitude));
const eastStart = new Vector3(-Math.sin(initialLongitude), 0, -Math.cos(initialLongitude));
const velocityStart = eastStart.multiplyScalar(Math.cos(inclination)).add(new Vector3(0, Math.sin(inclination), 0));
const orbitNormal = new Vector3().crossVectors(radialStart, velocityStart).normalize();
const earthAxis = new Vector3(0, 1, 0);
export const STATION_INITIAL_SUN_DIRECTION = new Vector3(-3, 5, 4).normalize();
const sunInertial = orbitNormal.clone().multiplyScalar(STATION_INITIAL_SUN_DIRECTION.x)
  .addScaledVector(radialStart, STATION_INITIAL_SUN_DIRECTION.y)
  .addScaledVector(velocityStart, STATION_INITIAL_SUN_DIRECTION.z).normalize();

export interface StationOrbitSnapshot {
  readonly earthOrientation: Quaternion;
  readonly sunDirection: Vector3;
  latitudeDeg: number;
  longitudeDeg: number;
  progress: number;
  elapsedSeconds: number;
}

/** Reuses all scratch objects so the animation loop does not allocate per frame. */
export class StationOrbitModel {
  private readonly radial = new Vector3();
  private readonly velocity = new Vector3();
  private readonly earthFixed = new Vector3();
  private readonly basis = new Matrix4();
  private readonly earthSpin = new Quaternion();
  readonly snapshot: StationOrbitSnapshot = {
    earthOrientation: new Quaternion(), sunDirection: new Vector3(),
    latitudeDeg: 0, longitudeDeg: 20, progress: 0, elapsedSeconds: 0,
  };

  sample(elapsedSeconds: number): StationOrbitSnapshot {
    const phase = ((elapsedSeconds / STATION_ORBIT_PERIOD_SECONDS) % 1 + 1) % 1;
    const angle = phase * TWO_PI;
    const spin = elapsedSeconds / EARTH_SIDEREAL_DAY_SECONDS * TWO_PI;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    this.radial.copy(radialStart).multiplyScalar(cosine).addScaledVector(velocityStart, sine);
    this.velocity.copy(velocityStart).multiplyScalar(cosine).addScaledVector(radialStart, -sine);
    this.earthFixed.copy(this.radial).applyAxisAngle(earthAxis, -spin);
    this.basis.makeBasis(orbitNormal, this.radial, this.velocity);
    this.earthSpin.setFromAxisAngle(earthAxis, spin);
    const result = this.snapshot;
    result.earthOrientation.setFromRotationMatrix(this.basis).invert().multiply(this.earthSpin);
    result.sunDirection.set(
      sunInertial.dot(orbitNormal), sunInertial.dot(this.radial), sunInertial.dot(this.velocity),
    ).normalize();
    result.latitudeDeg = Math.asin(Math.max(-1, Math.min(1, this.earthFixed.y))) * 180 / Math.PI;
    result.longitudeDeg = Math.atan2(-this.earthFixed.z, this.earthFixed.x) * 180 / Math.PI;
    result.progress = phase;
    result.elapsedSeconds = elapsedSeconds;
    return result;
  }
}

/** Find the nearest sunlit pass in the next two modeled days. The result is a
 * simulated along-track position and may pass beside, rather than above, a region.
 */
export function nearestDaylightPass(model: StationOrbitModel, startSeconds: number, region: StationRegion): number {
  const latitude = region.latitudeDeg * Math.PI / 180;
  const longitude = region.longitudeDeg * Math.PI / 180;
  const target = new Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), -Math.cos(latitude) * Math.sin(longitude));
  const position = new Vector3();
  let bestTime = startSeconds;
  let bestScore = -Infinity;
  for (let step = 0; step <= 2880; step++) {
    const time = startSeconds + step * 60;
    const sample = model.sample(time);
    if (sample.sunDirection.y < 0.1) continue;
    position.set(
      Math.cos(sample.latitudeDeg * Math.PI / 180) * Math.cos(sample.longitudeDeg * Math.PI / 180),
      Math.sin(sample.latitudeDeg * Math.PI / 180),
      -Math.cos(sample.latitudeDeg * Math.PI / 180) * Math.sin(sample.longitudeDeg * Math.PI / 180),
    );
    const score = position.dot(target);
    if (score > bestScore) { bestScore = score; bestTime = time; }
  }
  const coarse = bestTime;
  for (let offset = -59; offset <= 59; offset++) {
    const time = coarse + offset;
    if (time < startSeconds) continue;
    const sample = model.sample(time);
    if (sample.sunDirection.y < 0.1) continue;
    position.set(
      Math.cos(sample.latitudeDeg * Math.PI / 180) * Math.cos(sample.longitudeDeg * Math.PI / 180),
      Math.sin(sample.latitudeDeg * Math.PI / 180),
      -Math.cos(sample.latitudeDeg * Math.PI / 180) * Math.sin(sample.longitudeDeg * Math.PI / 180),
    );
    const score = position.dot(target);
    if (score > bestScore) { bestScore = score; bestTime = time; }
  }
  model.sample(bestTime);
  return bestTime;
}
