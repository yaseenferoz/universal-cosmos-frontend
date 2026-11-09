import { MathUtils, Vector3 } from "three";

/** Fit a physical sphere to the narrower viewport dimension, keeping mobile usable. */
export function orbitalCameraDistance(
  radius: number,
  aspect: number,
  fovDegrees = 38,
  occupancy = 0.74,
): number {
  const halfVertical = MathUtils.degToRad(fovDegrees) / 2;
  const halfHorizontal = Math.atan(
    Math.tan(halfVertical) * Math.max(aspect, 0.1),
  );
  const halfAngle = Math.min(halfVertical, halfHorizontal);
  return radius / Math.sin(halfAngle * occupancy);
}

/** About 55 degrees of phase: geographical detail and a visible night terminator. */
export function orbitalCameraOffset(
  radius: number,
  aspect: number,
  towardSun: Vector3,
  rings = false,
  ringPole = new Vector3(0, 1, 0),
): Vector3 {
  const sun = towardSun.clone().normalize();
  if (rings) {
    const pole = ringPole.clone().normalize();
    const solarLatitude = sun.dot(pole);
    const equatorialSun = sun.clone().addScaledVector(pole, -solarLatitude);
    // View the illuminated face at 25 degrees to the actual tilted ring plane.
    const latitude = MathUtils.degToRad(25) * (solarLatitude < 0 ? -1 : 1);
    const equatorialLength = equatorialSun.length();
    if (equatorialLength < 0.0001) {
      equatorialSun.crossVectors(pole, new Vector3(0, 0, 1));
      if (equatorialSun.lengthSq() < 0.0001)
        equatorialSun.crossVectors(pole, new Vector3(1, 0, 0));
    }
    equatorialSun.normalize();
    const azimuth = Math.acos(
      MathUtils.clamp(
        (Math.cos(MathUtils.degToRad(55)) -
          Math.sin(latitude) * solarLatitude) /
          Math.max(Math.cos(latitude) * equatorialLength, 0.0001),
        -1,
        1,
      ),
    );
    const side = new Vector3().crossVectors(equatorialSun, pole).normalize();
    return equatorialSun
      .multiplyScalar(Math.cos(latitude) * Math.cos(azimuth))
      .addScaledVector(side, Math.cos(latitude) * Math.sin(azimuth))
      .addScaledVector(pole, Math.sin(latitude))
      .normalize()
      .multiplyScalar(orbitalCameraDistance(radius * 2.4, aspect));
  }
  const side = new Vector3().crossVectors(sun, new Vector3(0, 1, 0));
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  side.normalize();
  const direction = sun.multiplyScalar(0.57).addScaledVector(side, 0.8);
  direction.y += 0.16;
  return direction
    .normalize()
    .multiplyScalar(orbitalCameraDistance(radius, aspect));
}

/** Favor a side view of an irregular body's long axis while retaining sunlit detail. */
export function irregularBodyCameraOffset(
  radius: number,
  aspect: number,
  towardSun: Vector3,
  longAxis: Vector3,
): Vector3 {
  const axis = longAxis.clone().normalize();
  const side = new Vector3().crossVectors(axis, new Vector3(0, 1, 0));
  if (side.lengthSq() < 0.01)
    side.crossVectors(axis, new Vector3(0, 0, 1));
  side.normalize();
  const sun = towardSun.clone().normalize();
  if (side.dot(sun) < 0) side.negate();
  return sun.multiplyScalar(0.35).addScaledVector(side, 0.94)
    .normalize().multiplyScalar(orbitalCameraDistance(radius, aspect));
}
