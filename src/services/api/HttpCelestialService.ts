import type {
  CelestialObject,
  CelestialService,
  EphemerisResult,
  ObjectId,
  RequestOptions,
  SolarSystem,
} from "../../types/celestial";
import { assertActive, CelestialApiError, normalizeEpoch } from "./errors";
import {
  isSupportedSlug,
  mapBackendIdentity,
  parseBackendCatalog,
  parseBackendIdentities,
  parseBackendIdentity,
  type BackendCatalog,
} from "./backendCatalog";
import { record } from "./validation";

interface ApiPayload {
  data: unknown;
  meta: Record<string, unknown>;
}
const SEARCH_PAGE_SIZE = 100;
const MAX_SEARCH_PAGES = 10;
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export class HttpCelestialService implements CelestialService {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private catalog: BackendCatalog | undefined;

  constructor(
    baseUrl: string,
    fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    const rawBase = baseUrl.trim();
    const base = rawBase.replace(/\/+$/, "");
    if (
      (!base && rawBase !== "/") ||
      (rawBase !== "/" &&
        !/^https?:\/\//i.test(base) &&
        !/^\/(?!\/)/.test(base))
    ) {
      throw new CelestialApiError(
        "VITE_API_BASE_URL must be an HTTP(S) URL or a same-origin path.",
      );
    }
    this.baseUrl = base;
    this.fetcher = fetcher;
  }

  private async request(
    path: string,
    options?: RequestOptions,
  ): Promise<ApiPayload> {
    assertActive(options?.signal);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/api/v1${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: options?.signal,
      });
    } catch (error) {
      if (
        options?.signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        throw error;
      throw new CelestialApiError(
        "The celestial service could not be reached. Check the backend URL and connection.",
        null,
        { cause: error },
      );
    }
    let body: Record<string, unknown>;
    try {
      const json: unknown = await response.json();
      assertActive(options?.signal);
      body = record(json);
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      if (!response.ok)
        throw new CelestialApiError(
          `The celestial service returned HTTP ${response.status}.`,
          response.status,
        );
      if (error instanceof CelestialApiError) throw error;
      throw new CelestialApiError(
        "The celestial service returned unreadable JSON.",
        response.status,
        { cause: error },
      );
    }
    if (!response.ok || body.success === false) {
      const error =
        typeof body.error === "object" && body.error !== null
          ? record(body.error)
          : null;
      const detail =
        typeof error?.message === "string"
          ? ` ${error.message.slice(0, 200)}`
          : "";
      throw new CelestialApiError(
        `The celestial service returned HTTP ${response.status}.${detail}`,
        response.status,
      );
    }
    if (body.success !== true || !("data" in body))
      throw new CelestialApiError(
        "The celestial API returned an invalid success envelope.",
      );
    return { data: body.data, meta: record(body.meta, "response metadata") };
  }

  private async loadCatalog(options?: RequestOptions): Promise<BackendCatalog> {
    assertActive(options?.signal);
    if (this.catalog) return this.catalog;
    // This bounded rooted endpoint avoids losing a required planet through list pagination.
    // Concurrent callers retain independent abort signals; only successful results are cached.
    const payload = await this.request("/systems/solar", options);
    const catalog = parseBackendCatalog(payload.data);
    assertActive(options?.signal);
    this.catalog = catalog;
    return catalog;
  }

  async getObjects(options?: RequestOptions): Promise<CelestialObject[]> {
    return structuredClone((await this.loadCatalog(options)).objects);
  }

  async getObject(
    id: string,
    options?: RequestOptions,
  ): Promise<CelestialObject | null> {
    const catalog = await this.loadCatalog(options);
    const identity = [...catalog.identities.values()].find(
      (object) => object.slug === id || object.id === id.toLowerCase(),
    );
    if (!identity) return null;
    try {
      const payload = await this.request(
        `/objects/${encodeURIComponent(identity.id)}`,
        options,
      );
      const detail = parseBackendIdentity(payload.data);
      if (detail.id !== identity.id || detail.slug !== identity.slug)
        throw new CelestialApiError(
          "The celestial API returned a different object than requested.",
        );
      return mapBackendIdentity(detail, catalog);
    } catch (error) {
      if (error instanceof CelestialApiError && error.status === 404)
        return null;
      throw error;
    }
  }

  async search(
    query: string,
    options?: RequestOptions,
  ): Promise<CelestialObject[]> {
    assertActive(options?.signal);
    const term = query.trim();
    const hasControlCharacter = [...term].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    );
    if (term.length > 100 || hasControlCharacter)
      throw new CelestialApiError(
        "Search must contain at most 100 characters and no control characters.",
      );
    const catalog = await this.loadCatalog(options);
    if (term.length < 2) {
      const needle = normalize(term);
      return structuredClone(
        catalog.objects.filter((object) =>
          normalize(`${object.name} ${object.category}`).includes(needle),
        ),
      );
    }
    const results = new Map<ObjectId, CelestialObject>();
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const payload = await this.request(
        `/search?q=${encodeURIComponent(term)}&page=${page}&pageSize=${SEARCH_PAGE_SIZE}`,
        options,
      );
      const pagination = record(payload.meta.pagination, "search pagination");
      const pages = pagination.totalPages;
      if (
        pagination.page !== page ||
        pagination.pageSize !== SEARCH_PAGE_SIZE ||
        typeof pages !== "number" ||
        !Number.isInteger(pages) ||
        pages < 0
      )
        throw new CelestialApiError(
          "The celestial API returned invalid search pagination.",
        );
      if (pages > MAX_SEARCH_PAGES)
        throw new CelestialApiError(
          "This search matches too many records. Please use a more specific object name.",
        );
      totalPages = pages;
      for (const identity of parseBackendIdentities(payload.data)) {
        // The renderer supports the initial ten worlds; other catalog results stay out.
        if (!isSupportedSlug(identity.slug)) continue;
        results.set(identity.slug, mapBackendIdentity(identity, catalog));
      }
    }
    return [...results.values()];
  }

  async getSystem(id: "solar", options?: RequestOptions): Promise<SolarSystem> {
    if (id !== "solar")
      throw new CelestialApiError(
        "This system is not supported by the explorer.",
        404,
      );
    return structuredClone((await this.loadCatalog(options)).system);
  }

  async getEphemeris(
    id: ObjectId,
    isoDate: string,
    options?: RequestOptions,
  ): Promise<EphemerisResult> {
    assertActive(options?.signal);
    if (!isSupportedSlug(id))
      throw new CelestialApiError(
        "This object is not supported by the explorer.",
        404,
      );
    return {
      status: "unavailable",
      objectId: id,
      epoch: normalizeEpoch(isoDate),
      position: null,
      reason:
        "The backend exposes sampled JPL Horizons windows in TDB. This explorer needs an explicit UTC/TDB and sampled-vector adapter before scientific positions can be used. Display orbits remain illustrative; no ephemeris request was made.",
    };
  }
}
