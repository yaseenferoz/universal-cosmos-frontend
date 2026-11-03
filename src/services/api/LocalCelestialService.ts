import { celestialObjects, solarSystem } from "../../data/catalog";
import type {
  CelestialObject,
  CelestialService,
  EphemerisResult,
  ObjectId,
  RequestOptions,
  SolarSystem,
} from "../../types/celestial";
import { assertActive, CelestialApiError, normalizeEpoch } from "./errors";

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** In-memory data, with no artificial latency or fetch requests. */
export class LocalCelestialService implements CelestialService {
  async getObjects(options?: RequestOptions): Promise<CelestialObject[]> {
    assertActive(options?.signal);
    return structuredClone(celestialObjects);
  }

  async getObject(
    id: string,
    options?: RequestOptions,
  ): Promise<CelestialObject | null> {
    assertActive(options?.signal);
    const object = celestialObjects.find((candidate) => candidate.id === id);
    return object ? structuredClone(object) : null;
  }

  async search(
    query: string,
    options?: RequestOptions,
  ): Promise<CelestialObject[]> {
    assertActive(options?.signal);
    const term = normalize(query);
    const tokens = term.split(/\s+/);
    const matches = celestialObjects.filter((object) => {
      const searchable = normalize(`${object.name} ${object.category}`);
      return tokens.every((token) => searchable.includes(token));
    });
    // Exact names take priority over category matches, then preserve catalog order.
    matches.sort(
      (a, b) =>
        Number(normalize(b.name) === term) - Number(normalize(a.name) === term),
    );
    return structuredClone(matches);
  }

  async getSystem(id: "solar", options?: RequestOptions): Promise<SolarSystem> {
    assertActive(options?.signal);
    if (id !== "solar")
      throw new CelestialApiError(
        "This system is not in the local catalog.",
        404,
      );
    return structuredClone(solarSystem);
  }

  async getEphemeris(
    id: ObjectId,
    isoDate: string,
    options?: RequestOptions,
  ): Promise<EphemerisResult> {
    assertActive(options?.signal);
    if (!celestialObjects.some((object) => object.id === id))
      throw new CelestialApiError(
        "This object is not in the local catalog.",
        404,
      );
    return {
      status: "unavailable",
      objectId: id,
      epoch: normalizeEpoch(isoDate),
      position: null,
      reason:
        "The local catalog has no scientific ephemeris. Animated circular paths and chosen phases are display illustrations, not measured positions.",
    };
  }
}
