import type { CelestialObject, ObjectId } from "../../types/celestial";

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

/** A display-only circular orbit. Initial phase is composed for legibility, not an ephemeris. */
export function displayOrbitAt(
  object: CelestialObject,
  days: number,
): Cartesian {
  if (!object.parentId || object.orbitalPeriodDays <= 0)
    return { x: 0, y: 0, z: 0 };
  const phase =
    object.display.initialPhase +
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
 * A distance-preserving MODEL, not an ephemeris: measured mean parent distance and
 * period, with the explicitly illustrative phase and plane used by this release.
 * Kilometer positions remain CPU doubles; display values never enter this radius.
 */
export function modeledRelativePositionKm(
  object: CelestialObject,
  days: number,
): Cartesian {
  if (!object.parentId || object.orbitalPeriodDays <= 0)
    return { x: 0, y: 0, z: 0 };
  const phase =
    object.display.initialPhase +
    ((days % object.orbitalPeriodDays) / object.orbitalPeriodDays) * TAU;
  const z = Math.sin(phase) * object.semiMajorAxisKm;
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
): Map<ObjectId, Cartesian> {
  return resolveHierarchy(objects, (object) =>
    modeledRelativePositionKm(object, days),
  );
}

export function overviewPositions(
  objects: readonly CelestialObject[],
  days: number,
): Map<ObjectId, Cartesian> {
  return resolveHierarchy(objects, (object) => displayOrbitAt(object, days));
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
