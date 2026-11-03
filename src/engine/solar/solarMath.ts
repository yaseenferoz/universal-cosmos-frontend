/** Nominal IAU model inputs; see SOLAR_SOURCES.md for units and limitations. */
export const NOMINAL_SOLAR_RADIUS_KM = 695_700;
export const NOMINAL_SOLAR_IRRADIANCE_W_M2 = 1_361;
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7;
export const MIN_SOLAR_DISTANCE_AU =
  NOMINAL_SOLAR_RADIUS_KM / ASTRONOMICAL_UNIT_KM;

/** Renderer-relative display normalization, NOT radiance in physical units. */
export const SOLAR_DISPLAY_RADIANCE = 16_384;
/** Gray illustrative coefficient, not a wavelength-calibrated observation. */
export const SOLAR_LIMB_DARKENING = 0.6;

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SolarOccludingSphere {
  readonly positionKm: Vec3Like;
  readonly radiusKm: number;
}

const clampUnit = (value: number): number => Math.max(-1, Math.min(1, value));
const clampFraction = (value: number): number => Math.max(0, Math.min(1, value));
const finiteVector = (vector: Vec3Like): boolean =>
  Number.isFinite(vector.x) &&
  Number.isFinite(vector.y) &&
  Number.isFinite(vector.z);

/** Exterior sphere diameter in radians. Interior distances saturate at pi. */
export function angularDiameterRad(radiusKm: number, distanceKm: number): number {
  if (
    !Number.isFinite(radiusKm) ||
    !Number.isFinite(distanceKm) ||
    radiusKm <= 0 ||
    distanceKm <= 0
  ) return 0;
  return 2 * Math.asin(Math.min(1, radiusKm / distanceKm));
}

export function solarAngularDiameterRad(distanceKm: number): number {
  return angularDiameterRad(NOMINAL_SOLAR_RADIUS_KM, distanceKm);
}

/** Exterior inverse-square model; positive interior distances clamp to R_sun. */
export function relativeSolarIrradiance(distanceAu: number): number {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return 0;
  const inverseDistance = 1 / Math.max(MIN_SOLAR_DISTANCE_AU, distanceAu);
  return inverseDistance * inverseDistance;
}

/** Bolometric irradiance on a normal receiver, before occultation/extinction. */
export function solarIrradianceWm2(distanceAu: number): number {
  return NOMINAL_SOLAR_IRRADIANCE_W_M2 * relativeSolarIrradiance(distanceAu);
}

/** Unit-circle segment area; the series avoids cancellation near tangency. */
function circleSegment(cosine: number): number {
  const angle = Math.acos(clampUnit(cosine));
  if (angle < 0.01) {
    const squared = angle * angle;
    return angle * squared * (2 / 3 + squared * (-2 / 15 + squared * 4 / 315));
  }
  return angle - Math.sin(angle) * Math.cos(angle);
}

/**
 * Unobscured area of one finite circular disk in angular coordinates.
 * This planar angular-disk approximation does not weight limb darkening.
 */
export function visibleDiskFraction(
  solarAngularRadiusRad: number,
  occluderAngularRadiusRad: number,
  separationRad: number,
): number {
  const sun = solarAngularRadiusRad;
  const occulter = occluderAngularRadiusRad;
  if (
    !Number.isFinite(sun) || !Number.isFinite(occulter) ||
    !Number.isFinite(separationRad) || sun <= 0 || occulter <= 0 ||
    separationRad < 0 || sun > Math.PI / 2 || occulter > Math.PI / 2 ||
    separationRad > Math.PI
  ) return 1;
  if (separationRad >= sun + occulter) return 1;
  if (occulter >= separationRad + sun) return 0;
  const ratio = occulter / sun;
  if (sun >= separationRad + occulter) return clampFraction(1 - ratio * ratio);
  // A huge occulting circle is locally a straight edge, with vanishing error.
  if (ratio > 1e12) {
    return clampFraction(1 - circleSegment((separationRad - occulter) / sun) / Math.PI);
  }
  const distance = separationRad / sun;
  const solarChord = ((distance - ratio) * (distance + ratio) + 1) / (2 * distance);
  const occulterChord = (distance * distance + ratio * ratio - 1) / (2 * distance * ratio);
  const overlap = circleSegment(solarChord) + ratio * ratio * circleSegment(occulterChord);
  return clampFraction(1 - overlap / Math.PI);
}

interface ApparentSphere {
  direction: Vec3Like;
  distanceKm: number;
  radiusKm: number;
  ratio: number;
  angularRadius: number;
}

function apparentSphere(
  observer: Vec3Like,
  position: Vec3Like,
  radiusKm: number,
): ApparentSphere | null {
  if (!finiteVector(position) || !Number.isFinite(radiusKm) || radiusKm <= 0) return null;
  const x = position.x - observer.x;
  const y = position.y - observer.y;
  const z = position.z - observer.z;
  const distanceKm = Math.hypot(x, y, z);
  if (!Number.isFinite(distanceKm)) return null;
  const ratio = distanceKm > 0 ? Math.min(1, radiusKm / distanceKm) : 1;
  return {
    direction: distanceKm > 0 ? { x: x / distanceKm, y: y / distanceKm, z: z / distanceKm } : { x: 0, y: 0, z: 0 },
    distanceKm,
    radiusKm,
    ratio,
    angularRadius: Math.asin(ratio),
  };
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function angularSeparation(a: Vec3Like, b: Vec3Like): number {
  const product = cross(a, b);
  return Math.atan2(Math.hypot(product.x, product.y, product.z), clampUnit(dot(a, b)));
}

/** First forward ray/sphere intersection; normalized inputs avoid large squares. */
function rayIntersection(ray: Vec3Like, sphere: ApparentSphere): number {
  const projection = dot(ray, sphere.direction);
  if (projection <= 0) return Infinity;
  const product = cross(ray, sphere.direction);
  const perpendicular = Math.hypot(product.x, product.y, product.z);
  if (perpendicular > sphere.ratio) return Infinity;
  const root = Math.sqrt(Math.max(0, (sphere.ratio - perpendicular) * (sphere.ratio + perpendicular)));
  return Math.max(0, sphere.distanceKm * (projection - root));
}

/**
 * Geometric visibility at one observer, using positions in the same km frame.
 * Exclude the receiving body's own sphere when calculating its illumination.
 * Camera visibility must NOT be reused for other bodies' illumination.
 * Small single disks use analytic overlap; large/multiple disks use 512 bounded
 * equal-solid-angle rays and an actual foreground union. Invalid inputs fail open.
 */
export function solarVisibility(
  observerKm: Vec3Like,
  sunCenterKm: Vec3Like,
  occluders: readonly SolarOccludingSphere[],
  sunRadiusKm = NOMINAL_SOLAR_RADIUS_KM,
): number {
  if (!finiteVector(observerKm)) return 1;
  const sun = apparentSphere(observerKm, sunCenterKm, sunRadiusKm);
  if (!sun || sun.distanceKm <= sunRadiusKm || sun.angularRadius === 0) return 1;
  const candidates: ApparentSphere[] = [];
  for (const occluder of occluders) {
    const sphere = apparentSphere(observerKm, occluder.positionKm, occluder.radiusKm);
    if (!sphere) continue;
    if (sphere.distanceKm <= sphere.radiusKm) return 0;
    if (sphere.distanceKm - sphere.radiusKm >= sun.distanceKm + sun.radiusKm) continue;
    const separation = angularSeparation(sun.direction, sphere.direction);
    if (separation >= sun.angularRadius + sphere.angularRadius) continue;
    if (
      sphere.distanceKm + sphere.radiusKm < sun.distanceKm - sun.radiusKm &&
      separation + sun.angularRadius <= sphere.angularRadius
    ) return 0;
    candidates.push(sphere);
  }
  if (candidates.length === 0) return 1;
  const first = candidates[0];
  if (
    candidates.length === 1 &&
    Math.max(sun.angularRadius, first.angularRadius) <= 0.05 &&
    first.distanceKm + first.radiusKm < sun.distanceKm - sun.radiusKm
  ) return visibleDiskFraction(sun.angularRadius, first.angularRadius, angularSeparation(sun.direction, first.direction));

  const reference = Math.abs(sun.direction.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const horizontalRaw = cross(sun.direction, reference);
  const length = Math.hypot(horizontalRaw.x, horizontalRaw.y, horizontalRaw.z);
  const horizontal = { x: horizontalRaw.x / length, y: horizontalRaw.y / length, z: horizontalRaw.z / length };
  const vertical = cross(sun.direction, horizontal);
  const capDepth = 2 * Math.sin(sun.angularRadius / 2) ** 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const sampleCount = 512;
  let visible = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const depth = capDepth * (i + 0.5) / sampleCount;
    const axial = 1 - depth;
    const radial = Math.sqrt(depth * (2 - depth));
    const horizontalWeight = radial * Math.cos(i * goldenAngle);
    const verticalWeight = radial * Math.sin(i * goldenAngle);
    const ray = {
      x: sun.direction.x * axial + horizontal.x * horizontalWeight + vertical.x * verticalWeight,
      y: sun.direction.y * axial + horizontal.y * horizontalWeight + vertical.y * verticalWeight,
      z: sun.direction.z * axial + horizontal.z * horizontalWeight + vertical.z * verticalWeight,
    };
    const solarHit = rayIntersection(ray, sun);
    if (!candidates.some((sphere) => rayIntersection(ray, sphere) < solarHit)) visible += 1;
  }
  return visible / sampleCount;
}

/** Time-based adaptation in EV; policy and EV limits belong to the controller. */
export function adaptExposureEv(
  currentEv: number,
  targetEv: number,
  deltaSeconds: number,
  brightenSeconds = 1.2,
  darkenSeconds = 0.25,
): number {
  const current = Number.isFinite(currentEv) ? currentEv : 0;
  const target = Number.isFinite(targetEv) ? targetEv : current;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const duration = target > current ? brightenSeconds : darkenSeconds;
  if (duration === 0) return target;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const fraction = -Math.expm1(-deltaSeconds / safeDuration);
  // Convex form avoids overflow in target-current for very large finite inputs.
  return current * (1 - fraction) + target * fraction;
}
