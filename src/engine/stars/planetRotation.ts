import { Matrix4, Quaternion, Vector3 } from "three";
import { J2000_JD } from "./keplerOrbit";

const basis = new Matrix4();
const x = new Vector3(), y = new Vector3(), z = new Vector3();

/**
 * Body-fixed frame of an exoplanet as a rotation from body-fixed axes to the system's axes.
 * Body +Y (latitude +90°) is the spin axis, taken along the orbit normal (zero obliquity,
 * which is illustrative). A tidally locked planet keeps body +X (0°, 0°, the substellar
 * point) toward its star. Otherwise the planet turns once per `rotationHours`, prograde,
 * from `reference` at J2000.
 */
export function planetBodyFrame(
  orbitNormal: Vector3, toStar: Vector3, reference: Vector3, locked: boolean, rotationHours: number, jd: number,
  target = new Quaternion(),
): Quaternion {
  y.copy(orbitNormal).normalize();
  const along = locked ? toStar : reference;
  x.copy(along).addScaledVector(y, -along.dot(y));
  if (x.lengthSq() < 1e-20) x.set(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  if (!locked && rotationHours > 0) {
    const turns = ((jd - J2000_JD) * 24) / rotationHours;
    x.applyAxisAngle(y, (turns % 1) * 2 * Math.PI);
  }
  z.crossVectors(x, y);
  return target.setFromRotationMatrix(basis.makeBasis(x, y, z));
}
