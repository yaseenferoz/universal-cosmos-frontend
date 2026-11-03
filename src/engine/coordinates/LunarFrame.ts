import { Quaternion, Vector3 } from "three";
import { KM_PER_EXPLORATION_UNIT } from "./CoordinateSystem";

export const METERS_PER_EXPLORATION_UNIT = KM_PER_EXPLORATION_UNIT * 1000;

/** Subtract large CPU doubles before scaling/rotation; never upload these positions. */
export function toMoonFixedMeters(
  globalPosition: Vector3,
  moonPosition: Vector3,
  rotation: Quaternion,
): Vector3 {
  return globalPosition
    .clone()
    .sub(moonPosition)
    .multiplyScalar(METERS_PER_EXPLORATION_UNIT)
    .applyQuaternion(rotation.clone().invert());
}

export function fromMoonFixedMeters(
  bodyPositionM: Vector3,
  moonPosition: Vector3,
  rotation: Quaternion,
): Vector3 {
  return bodyPositionM
    .clone()
    .applyQuaternion(rotation)
    .divideScalar(METERS_PER_EXPLORATION_UNIT)
    .add(moonPosition);
}

export function lunarSunDirection(
  moonPosition: Vector3,
  rotation: Quaternion,
): Vector3 {
  return moonPosition
    .clone()
    .negate()
    .normalize()
    .applyQuaternion(rotation.clone().invert());
}

export { relativeSolarIrradiance } from "../solar/solarMath";
