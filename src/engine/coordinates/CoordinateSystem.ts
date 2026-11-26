import type { CelestialObject, ObjectId } from "../../types/celestial";
import { Vector3 } from "three";
import { earthOrientationAt } from "./EarthOrientation";
import { analyticParentOf, analyticRelativePositionKm } from "../ephemeris/analyticEphemeris";
import { compressedSolarDistance, usesTrueOverviewShape } from "../../data/generatedBodies";

export interface Cartesian {
  x: number;
  y: number;
  z: number;
}
export interface ScientificCoordinate {
  parentId: ObjectId | null;
  offsetKm: Cartesian;
  epoch: string;
  frame: "parent-centered-ecliptic";
}

export const KM_PER_AU = 149_597_870.7;
/** A uniform scale used only by exploration; overview deliberately uses another mapping. */
export const KM_PER_EXPLORATION_UNIT = 10_000;
export type ViewMode = "exploration" | "overview";
const TAU = Math.PI * 2;
const MS_PER_DAY = 86_400_000;
/** Matches the bundled SIMULATION_EPOCH; kept local to avoid a data-layer import. */
const DEFAULT_EPOCH = "2026-01-01T00:00:00.000Z";

/**
 * Analytic parent-relative position (engine axes, km) when a published model covers
 * this object AND the catalog parent matches that model's center; otherwise null.
 */
export function ephemerisRelativePositionKm(
  object: CelestialObject,
  days: number,
  epoch = DEFAULT_EPOCH,
): Cartesian | null {
  if (!object.parentId || object.parentId !== analyticParentOf(object.id)) return null;
  const utcMs = Date.parse(epoch) + days * MS_PER_DAY;
  // Physical and Overview layouts query the same instant each frame; compute once.
  if (utcMs !== cachedUtcMs) {
    cachedUtcMs = utcMs;
    ephemerisCache.clear();
  }
  const cached = ephemerisCache.get(object.id);
  if (cached !== undefined) return cached;
  const position = analyticRelativePositionKm(object.id, utcMs);
  ephemerisCache.set(object.id, position);
  return position;
}
let cachedUtcMs = Number.NaN;
const ephemerisCache = new Map<ObjectId, Cartesian | null>();

/**
 * Overview orbit: compressed radius on the display ring. Bodies with an analytic
 * ephemeris sit at their real parent-relative longitude; others keep a composed phase.
 */
export function displayOrbitAt(
  object: CelestialObject,
  days: number,
  epoch = DEFAULT_EPOCH,
): Cartesian {
  if (!object.parentId || object.orbitalPeriodDays <= 0)
    return { x: 0, y: 0, z: 0 };
  const real = ephemerisRelativePositionKm(object, days, epoch);
  if (real && usesTrueOverviewShape(object.id)) {
    // Eccentric small bodies: real direction, log-compressed real distance.
    const distance = Math.hypot(real.x, real.y, real.z);
    const scale = distance > 0 ? compressedSolarDistance(distance) / distance : 0;
    return { x: real.x * scale, y: real.y * scale, z: real.z * scale };
  }
  // Engine longitude is atan2(−z, x); the ring formula below uses phase = −longitude.
  const phase = real
    ? Math.atan2(real.z, real.x)
    : object.display.initialPhase +
      ((days % object.orbitalPeriodDays) / object.orbitalPeriodDays) * TAU;
  const z = Math.sin(phase) * object.display.orbitRadius;
  return {
    x: Math.cos(phase) * object.display.orbitRadius,
    y: z * Math.sin(object.display.inclination),
    z: z * Math.cos(object.display.inclination),
  };
}

/** Resolve parent-relative scientific km coordinates on CPU; never upload them raw to a GPU. */
export function resolveScientificCoordinate(
  id: ObjectId,
  coordinates: Map<ObjectId, ScientificCoordinate>,
): Cartesian {
  const result = { x: 0, y: 0, z: 0 };
  const seen = new Set<ObjectId>();
  const expectedEpoch = coordinates.get(id)?.epoch;
  let cursor: ObjectId | null = id;
  while (cursor) {
    if (seen.has(cursor))
      throw new Error("Coordinate hierarchy contains a cycle.");
    seen.add(cursor);
    const coordinate = coordinates.get(cursor);
    if (!coordinate) throw new Error(`Missing coordinate for ${cursor}.`);
    if (coordinate.epoch !== expectedEpoch)
      throw new Error("Coordinate hierarchy mixes reference epochs.");
    result.x += coordinate.offsetKm.x;
    result.y += coordinate.offsetKm.y;
    result.z += coordinate.offsetKm.z;
    cursor = coordinate.parentId;
  }
  return result;
}

/** Scientific distances and display radii deliberately have no implicit conversion. */
export function kmToAu(km: number): number {
  return km / KM_PER_AU;
}

/**
 * Parent-relative km in engine axes. Planets, the Moon, Ceres, Vesta and Bennu use
 * the analytic ephemeris (see engine/ephemeris). Other moons and the ISS fall back to
 * a circular MODEL: measured mean distance and period with an illustrative phase and
 * plane. Kilometer positions remain CPU doubles; display values never enter here.
 */
export function modeledRelativePositionKm(
  object: CelestialObject,
  days: number,
  epoch = DEFAULT_EPOCH,
): Cartesian {
  if (!object.parentId || object.orbitalPeriodDays <= 0)
    return { x: 0, y: 0, z: 0 };
  const real = ephemerisRelativePositionKm(object, days, epoch);
  if (real) return real;
  const phase =
    object.display.initialPhase +
    ((days % object.orbitalPeriodDays) / object.orbitalPeriodDays) * TAU;
  // +X equinox, -Z east: ISS is prograde relative to Earth's +Y pole.
  const z = Math.sin(phase) * object.semiMajorAxisKm * (object.id === "iss" ? -1 : 1);
  return {
    x: Math.cos(phase) * object.semiMajorAxisKm,
    y: z * Math.sin(object.display.inclination),
    z: z * Math.cos(object.display.inclination),
  };
}

/** Resolve parent offsets independently of scene graph order or mesh scaling. */
function resolveHierarchy(
  objects: readonly CelestialObject[],
  relative: (object: CelestialObject) => Cartesian,
): Map<ObjectId, Cartesian> {
  const records = new Map(objects.map((object) => [object.id, object]));
  const positions = new Map<ObjectId, Cartesian>();
  const visiting = new Set<ObjectId>();
  const resolve = (id: ObjectId): Cartesian => {
    const cached = positions.get(id);
    if (cached) return cached;
    if (visiting.has(id))
      throw new Error("Modeled hierarchy contains a cycle.");
    const object = records.get(id);
    if (!object) throw new Error(`Missing modeled parent ${id}.`);
    visiting.add(id);
    const offset = relative(object);
    const parent = object.parentId
      ? resolve(object.parentId)
      : { x: 0, y: 0, z: 0 };
    const absolute = {
      x: parent.x + offset.x,
      y: parent.y + offset.y,
      z: parent.z + offset.z,
    };
    positions.set(id, absolute);
    visiting.delete(id);
    return absolute;
  };
  objects.forEach((object) => resolve(object.id));
  return positions;
}

export function modeledPositionsKm(
  objects: readonly CelestialObject[],
  days: number,
  epoch = DEFAULT_EPOCH,
): Map<ObjectId, Cartesian> {
  const earth = objects.find(({ id }) => id === "earth");
  return resolveHierarchy(objects, (object) => {
    const offset = modeledRelativePositionKm(object, days, epoch);
    if (object.id !== "iss" || !earth) return offset;
    // ISS's 51.6° is equatorial, unlike the other illustrative ecliptic planes.
    // Share the rendered Earth's pole correction so the displayed orbit stays inclined
    // to that equator. Epoch matches the bundled visualization clock, not a TLE epoch.
    const earthOffset = modeledRelativePositionKm(earth, days, epoch);
    const sun = new Vector3(-earthOffset.x, -earthOffset.y, -earthOffset.z);
    const pole = earthOrientationAt(Date.parse(epoch) + days * 86400000, sun).poleRotation;
    return new Vector3(offset.x, offset.y, offset.z).applyQuaternion(pole);
  });
}

export function overviewPositions(
  objects: readonly CelestialObject[],
  days: number,
  epoch = DEFAULT_EPOCH,
): Map<ObjectId, Cartesian> {
  return resolveHierarchy(objects, (object) => displayOrbitAt(object, days, epoch));
}

export function renderRadiusFor(
  object: CelestialObject,
  mode: ViewMode,
): number {
  return mode === "exploration"
    ? object.radiusKm / KM_PER_EXPLORATION_UNIT
    : object.display.radius;
}

export function explorationPosition(positionKm: Cartesian): Cartesian {
  return {
    x: positionKm.x / KM_PER_EXPLORATION_UNIT,
    y: positionKm.y / KM_PER_EXPLORATION_UNIT,
    z: positionKm.z / KM_PER_EXPLORATION_UNIT,
  };
}
