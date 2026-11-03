import { celestialObjects, objectById, solarSystem } from "../../data/catalog";
import type {
  BackendObjectSummary,
  CelestialObject,
  ObjectId,
  SolarSystem,
} from "../../types/celestial";
import { CelestialApiError } from "./errors";
import { record } from "./validation";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(field: string): never {
  throw new CelestialApiError(`The celestial API returned invalid ${field}.`);
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(field);
  return value;
}
function uuid(value: unknown, field: string): string {
  const valueText = text(value, field);
  if (!uuidPattern.test(valueText)) invalid(field);
  return valueText.toLowerCase();
}
export function isSupportedSlug(value: string): value is ObjectId {
  return Object.hasOwn(objectById, value);
}
export function parseBackendIdentity(value: unknown): BackendObjectSummary {
  const data = record(value, "object identity");
  const catalogue =
    data.catalogue === null
      ? null
      : record(data.catalogue, "identity catalogue");
  if (data.description !== null && typeof data.description !== "string")
    invalid("identity description");
  return {
    id: uuid(data.id, "object UUID"),
    slug: text(data.slug, "object slug"),
    name: text(data.name, "object name"),
    objectType: text(data.objectType, "object type"),
    description: data.description,
    parentObjectId:
      data.parentObjectId === null
        ? null
        : uuid(data.parentObjectId, "parent UUID"),
    catalogue:
      catalogue === null
        ? null
        : {
            name: text(catalogue.name, "catalogue name"),
            identifier:
              catalogue.identifier === null
                ? null
                : text(catalogue.identifier, "catalogue identifier"),
          },
  };
}
export function parseBackendIdentities(value: unknown): BackendObjectSummary[] {
  if (!Array.isArray(value) || value.length > 1000)
    invalid("bounded object list");
  const identities = value.map(parseBackendIdentity);
  if (new Set(identities.map(({ id }) => id)).size !== identities.length)
    invalid("duplicate object UUIDs");
  if (new Set(identities.map(({ slug }) => slug)).size !== identities.length)
    invalid("duplicate object slugs");
  return identities;
}
export interface BackendCatalog {
  objects: CelestialObject[];
  system: SolarSystem;
  identities: Map<ObjectId, BackendObjectSummary>;
}
function assertMatchingIdentity(
  identity: BackendObjectSummary,
  catalog: BackendCatalog,
): ObjectId {
  if (!isSupportedSlug(identity.slug)) invalid("unsupported object slug");
  const registered = catalog.identities.get(identity.slug);
  if (!registered || registered.id !== identity.id)
    invalid("object identity mapping");
  const reference = objectById[identity.slug];
  const expectedType =
    identity.slug === "sun"
      ? "STAR"
      : identity.slug === "moon"
        ? "MOON"
        : "PLANET";
  if (identity.objectType !== expectedType) invalid("object type for its slug");
  const parent =
    reference.parentId === null
      ? null
      : catalog.identities.get(reference.parentId)?.id;
  if (identity.parentObjectId !== parent)
    invalid("Solar System parent mapping");
  return identity.slug;
}
/** Identity comes from the backend; no unvalidated measurement replaces a reference value. */
export function mapBackendIdentity(
  identity: BackendObjectSummary,
  catalog: BackendCatalog,
): CelestialObject {
  const slug = assertMatchingIdentity(identity, catalog);
  return {
    ...structuredClone(objectById[slug]),
    backendId: identity.id,
    name: identity.name,
    description: identity.description || objectById[slug].description,
  };
}
export function parseBackendCatalog(value: unknown): BackendCatalog {
  const data = record(value, "Solar System");
  const name = text(data.name, "system name");
  const identities = parseBackendIdentities(data.objects);
  const supported = new Map<ObjectId, BackendObjectSummary>();
  for (const identity of identities) {
    if (isSupportedSlug(identity.slug)) supported.set(identity.slug, identity);
  }
  if (supported.size !== celestialObjects.length)
    invalid("incomplete Solar System catalog");
  if (uuid(data.rootObjectId, "system root UUID") !== supported.get("sun")?.id)
    invalid("Solar System root");
  const catalog: BackendCatalog = {
    objects: [],
    identities: supported,
    system: {
      ...structuredClone(solarSystem),
      name,
      notice: `${solarSystem.notice} This scene includes the ten supported Solar System bodies. Identities are connected to the backend; physical values remain bundled NASA references.`,
    },
  };
  catalog.objects = celestialObjects.map(({ id }) => {
    const identity = supported.get(id);
    if (!identity) invalid("incomplete Solar System catalog");
    return mapBackendIdentity(identity, catalog);
  });
  return catalog;
}
