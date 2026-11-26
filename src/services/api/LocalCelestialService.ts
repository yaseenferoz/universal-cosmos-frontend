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
import { searchCatalog } from "./searchCatalog";
import {
  analyticParentOf,
  eclipticRelativeKm,
  ephemerisCoverage,
  isWithinCoverage,
} from "../../engine/ephemeris/analyticEphemeris";
import { utcToTdbMs } from "../../engine/ephemeris/time";

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
    return structuredClone(searchCatalog(celestialObjects, query));
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
    const epoch = normalizeEpoch(isoDate);
    const utcMs = Date.parse(epoch);
    const coverage = ephemerisCoverage(id);
    const parent = analyticParentOf(id);
    const position = coverage && parent && isWithinCoverage(id, utcMs)
      ? eclipticRelativeKm(id, utcToTdbMs(utcMs))
      : null;
    if (!coverage || !parent || !position)
      return {
        status: "unavailable",
        objectId: id,
        epoch,
        position: null,
        reason: coverage
          ? `${coverage.label} is only used between ${new Date(coverage.validFromMs).toISOString().slice(0, 10)} and ${new Date(coverage.validUntilMs).toISOString().slice(0, 10)}.`
          : "No analytic ephemeris covers this object locally. Its animated circular path and chosen phase are display illustrations, not measured positions.",
      };
    return {
      status: "available",
      objectId: id,
      epoch,
      position: {
        ...position,
        unit: "km",
        referenceObject: parent,
        frame: "Geometric, mean ecliptic and equinox of J2000 (+x equinox, +z ecliptic north), TDB = UTC + 69.184 s",
      },
      provenance: { source: coverage.source.label, url: coverage.source.url, model: coverage.label },
    };
  }
}
