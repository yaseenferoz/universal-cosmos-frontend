import type {
  CelestialObject,
  EphemerisResult,
  ObjectId,
  SolarSystem,
} from "../../types/celestial";
import { CelestialApiError } from "./errors";

const objectIds = new Set<string>([
  "sun",
  "mercury",
  "venus",
  "earth",
  "moon",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
]);

function invalid(field: string): never {
  throw new CelestialApiError(`The celestial API returned invalid ${field}.`);
}

export function record(
  value: unknown,
  field = "response",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid(field);
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(field);
  return value;
}

function number(value: unknown, field: string, minimum = -Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum)
    invalid(field);
  return value;
}

function id(value: unknown, field: string): ObjectId {
  if (typeof value !== "string" || !objectIds.has(value)) invalid(field);
  return value as ObjectId;
}

function sourceUrl(value: unknown): string {
  const url = string(value, "source URL");
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol))
      invalid("source URL");
  } catch {
    invalid("source URL");
  }
  return url;
}

export function parseObject(value: unknown): CelestialObject {
  const data = record(value, "object");
  const display = record(data.display, "display parameters");
  const source = record(data.source, "source");
  if (!Array.isArray(data.facts)) invalid("facts");
  const objectId = id(data.id, "object ID");
  const parentId =
    data.parentId === null ? null : id(data.parentId, "parent ID");
  if (parentId === objectId) invalid("self-referencing parent");
  const color = string(data.color, "color");
  if (!/^#[0-9a-f]{6}$/i.test(color)) invalid("color");
  const period = number(data.orbitalPeriodDays, "orbital period", 0);
  if (parentId !== null && period === 0) invalid("orbital period");
  const rotation = number(data.rotationPeriodHours, "rotation period");
  if (rotation === 0) invalid("rotation period");
  return {
    id: objectId,
    name: string(data.name, "name"),
    category: string(data.category, "category"),
    description: string(data.description, "description"),
    parentId,
    radiusKm: number(data.radiusKm, "radius", Number.MIN_VALUE),
    massKg: number(data.massKg, "mass", Number.MIN_VALUE),
    gravityMs2: number(data.gravityMs2, "gravity", 0),
    orbitalPeriodDays: period,
    rotationPeriodHours: rotation,
    semiMajorAxisKm: number(data.semiMajorAxisKm, "mean orbital distance", 0),
    axialTiltDeg: number(data.axialTiltDeg, "axial tilt"),
    color,
    source: {
      label: string(source.label, "source label"),
      url: sourceUrl(source.url),
    },
    display: {
      radius: number(display.radius, "display radius", Number.MIN_VALUE),
      orbitRadius: number(display.orbitRadius, "display orbital radius", 0),
      initialPhase: number(display.initialPhase, "initial phase"),
      inclination: number(display.inclination, "inclination"),
    },
    facts: data.facts.map((fact: unknown) => {
      const item = record(fact, "fact");
      return {
        label: string(item.label, "fact label"),
        value: string(item.value, "fact value"),
      };
    }),
  };
}

export function parseObjects(value: unknown): CelestialObject[] {
  if (!Array.isArray(value)) invalid("object list");
  const objects = value.map(parseObject);
  if (new Set(objects.map((object) => object.id)).size !== objects.length)
    invalid("duplicate object IDs");
  return objects;
}

/** Full catalogs must form an acyclic forest; search results may omit their parents. */
export function parseCatalog(value: unknown): CelestialObject[] {
  const objects = parseObjects(value);
  const byId = new Map(objects.map((object) => [object.id, object]));
  const complete = new Set<ObjectId>();
  const visit = (object: CelestialObject, path: Set<ObjectId>): void => {
    if (complete.has(object.id)) return;
    if (path.has(object.id)) invalid("cyclic parent hierarchy");
    path.add(object.id);
    if (object.parentId !== null) {
      const parent = byId.get(object.parentId);
      if (!parent) invalid("missing parent object");
      visit(parent, path);
    }
    path.delete(object.id);
    complete.add(object.id);
  };
  for (const object of objects) visit(object, new Set());
  return objects;
}

export function parseSystem(value: unknown): SolarSystem {
  const data = record(value, "system");
  if (
    data.id !== "solar" ||
    data.referenceObject !== "sun" ||
    data.model !== "illustrative-circular"
  )
    invalid("system model");
  if (!Array.isArray(data.objectIds)) invalid("system object IDs");
  const ids = data.objectIds.map((object: unknown) =>
    id(object, "system object ID"),
  );
  const uniqueIds = new Set(ids);
  // This renderer's initial catalog promises all ten bodies, including Earth's Moon.
  // A self-consistent subset would otherwise make default focus/search silently fail.
  if (uniqueIds.size !== ids.length) invalid("duplicate system object IDs");
  if (uniqueIds.size !== objectIds.size)
    invalid("incomplete Solar System catalog");
  const epoch = string(data.visualizationEpoch, "visualization epoch");
  if (!Number.isFinite(Date.parse(epoch))) invalid("visualization epoch");
  return {
    id: "solar",
    name: string(data.name, "system name"),
    objectIds: ids,
    referenceObject: "sun",
    visualizationEpoch: epoch,
    model: "illustrative-circular",
    notice: string(data.notice, "model notice"),
  };
}

export function parseEphemeris(value: unknown): EphemerisResult {
  const data = record(value, "ephemeris");
  const objectId = id(data.objectId, "ephemeris object ID");
  const epoch = string(data.epoch, "ephemeris epoch");
  if (!Number.isFinite(Date.parse(epoch))) invalid("ephemeris epoch");
  if (data.status === "unavailable") {
    if (data.position !== null) invalid("unavailable ephemeris position");
    return {
      status: "unavailable",
      objectId,
      epoch,
      position: null,
      reason: string(data.reason, "ephemeris reason"),
    };
  }
  if (data.status !== "available") invalid("ephemeris status");
  const position = record(data.position, "scientific position");
  const provenance = record(data.provenance, "ephemeris provenance");
  if (position.unit !== "km") invalid("position units");
  return {
    status: "available",
    objectId,
    epoch,
    position: {
      x: number(position.x, "position x"),
      y: number(position.y, "position y"),
      z: number(position.z, "position z"),
      unit: "km",
      referenceObject: id(
        position.referenceObject,
        "position reference object",
      ),
      frame: string(position.frame, "coordinate frame"),
    },
    provenance: {
      source: string(provenance.source, "ephemeris source"),
      url: sourceUrl(provenance.url),
      model: string(provenance.model, "ephemeris model"),
    },
  };
}
