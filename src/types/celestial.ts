/** Hand-curated catalog IDs with bundled imagery and exploration profiles. */
export type CoreObjectId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "moon"
  | "iss"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "phobos"
  | "deimos"
  | "io"
  | "europa"
  | "ganymede"
  | "callisto"
  | "enceladus"
  | "titan"
  | "titania"
  | "mimas"
  | "tethys"
  | "dione"
  | "rhea"
  | "iapetus"
  | "miranda"
  | "ariel"
  | "umbriel"
  | "oberon"
  | "triton"
  | "ceres"
  | "vesta"
  | "bennu";

/**
 * Any catalog object. Generated bodies (JPL satellites, dwarf planets, asteroids and
 * comets) use slug IDs; code that needs per-object assets must handle a missing entry.
 * Synthetic background stars have no IDs.
 */
export type ObjectId = CoreObjectId | (string & {});

export type Quality = "auto" | "low" | "medium" | "high";

export interface CelestialObject {
  id: ObjectId;
  /** Connected identity UUID; physical/display values remain bundled references. */
  backendId?: string;
  name: string;
  category: string;
  description: string;
  parentId: ObjectId | null;
  /** Equatorial radius for planets/Moon; mean for Sun; ISS uses half its reference span. */
  radiusKm: number;
  massKg: number;
  /** Surface gravity; giants use atmospheric reference level. ISS uses zero as N/A, displayed as orbital free fall. */
  gravityMs2: number;
  /** Sidereal orbital period about parent. Zero means not modeled (Sun). */
  orbitalPeriodDays: number;
  /** Signed sidereal rotation: negative indicates retrograde rotation. */
  rotationPeriodHours: number;
  /** Approximate mean distance to parent; not a current measured separation. */
  semiMajorAxisKm: number;
  axialTiltDeg: number;
  color: string;
  source: { label: string; url: string };
  /** Arbitrary display units. Angles are radians; phases are invented for composition. */
  display: {
    radius: number;
    orbitRadius: number;
    initialPhase: number;
    inclination: number;
  };
  facts: { label: string; value: string }[];
  /** Quantities with no published measurement; their numeric fields are display placeholders. */
  unmeasured?: ("radius" | "mass" | "rotation")[];
}

export interface SolarSystem {
  id: "solar";
  name: string;
  objectIds: ObjectId[];
  referenceObject: "sun";
  /** Visualization clock origin, not an epoch of measured orbital elements. */
  visualizationEpoch: string;
  model: "illustrative-circular";
  notice: string;
}

export interface ScientificPosition {
  x: number;
  y: number;
  z: number;
  unit: "km";
  referenceObject: ObjectId;
  frame: string;
}

export type EphemerisResult =
  | {
      status: "unavailable";
      objectId: ObjectId;
      epoch: string;
      position: null;
      reason: string;
    }
  | {
      status: "available";
      objectId: ObjectId;
      epoch: string;
      position: ScientificPosition;
      provenance: { source: string; url: string; model: string };
    };

/** Actual backend wire contracts. Adapters normalize these into the domain above. */
export interface BackendObjectSummary {
  id: string;
  slug: string;
  name: string;
  objectType: string;
  description: string | null;
  parentObjectId: string | null;
  catalogue: { name: string; identifier: string | null } | null;
}
export interface ApiPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: { source: string; timestamp: string; pagination?: ApiPagination };
}
export type ObjectsResponse = ApiSuccessResponse<BackendObjectSummary[]>;
export type SearchResponse = ObjectsResponse;
export type ObjectResponse = ApiSuccessResponse<
  BackendObjectSummary & {
    physicalProperties: Record<string, unknown> | null;
    orbitalElements: Record<string, unknown>[];
    coordinates: Record<string, unknown>[];
    sources: Record<string, unknown>[];
  }
>;
export type SystemResponse = ApiSuccessResponse<{
  name: string;
  rootObjectId: string;
  objects: BackendObjectSummary[];
}>;
/** Backend windows are TDB vectors, not the normalized UTC single-position contract. */
export type EphemerisResponse = ApiSuccessResponse<{
  objectId: string;
  targetId: string;
  center: string;
  timeScale: "TDB";
  referenceFrame: "ICRF";
  referencePlane: "FRAME";
  correction: "NONE";
  units: { position: "km"; velocity: "km/s"; epoch: "Julian day (TDB)" };
  start: string;
  stop: string;
  step: string;
  samples: {
    julianDateTdb: number;
    calendarDateTdb: string;
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
  }[];
  source: {
    provider: string;
    sourceUrl: string;
    dataVersion: string | null;
    retrievedAt: string;
    attribution: string;
  };
}>;

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface CelestialService {
  getObjects(options?: RequestOptions): Promise<CelestialObject[]>;
  getObject(
    id: string,
    options?: RequestOptions,
  ): Promise<CelestialObject | null>;
  search(query: string, options?: RequestOptions): Promise<CelestialObject[]>;
  getSystem(id: "solar", options?: RequestOptions): Promise<SolarSystem>;
  getEphemeris(
    id: ObjectId,
    isoDate: string,
    options?: RequestOptions,
  ): Promise<EphemerisResult>;
}
