import type {
  HeightSample, TerrainBounds, TerrainCacheStats, TerrainDataProvider, TerrainImagery,
  TerrainManifest, TerrainRasterTile, TerrainRegion, TerrainTileData, TerrainTileKey,
} from "../../types/terrain";
import { moonTerrainManifest } from "./moonManifest";

interface ResidentTile { descriptor: TerrainRasterTile; heights: Float32Array; accessed: number }
export interface LunarTerrainProviderOptions {
  maxCacheBytes?: number;
  maxConcurrentRequests?: number;
  manifest?: TerrainManifest;
  fetcher?: typeof fetch;
}
const radians = Math.PI / 180;
const missing: HeightSample = { heightM: 0, available: false, resolutionM: Infinity, sourceId: "missing" };
const normalizeLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
const smoothstep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function terrainBoundsContain(bounds: TerrainBounds, latDeg: number, lonDeg: number): boolean {
  return latDeg >= bounds.south - 1e-9 && latDeg <= bounds.north + 1e-9 && lonDeg >= bounds.west - 1e-9 && lonDeg <= bounds.east + 1e-9;
}

/** Bilinear interpolation preserves NaN holes; it does not invent a height across nodata. */
export function sampleTerrainRaster(tile: TerrainRasterTile, heights: Float32Array, latDeg: number, lonDeg: number): number | undefined {
  const { width, height, bounds } = tile;
  const global = tile.tier === "global";
  if (!global && !terrainBoundsContain(bounds, latDeg, lonDeg)) return undefined;
  const rawX = global ? ((normalizeLongitude(lonDeg) + 180) / 360) * width - 0.5 : (lonDeg - bounds.west) / (bounds.east - bounds.west) * (width - 1);
  const rawY = global ? ((90 - latDeg) / 180) * height - 0.5 : (bounds.north - latDeg) / (bounds.north - bounds.south) * (height - 1);
  const x = global ? rawX : Math.max(0, Math.min(width - 1, rawX));
  const y = Math.max(0, Math.min(height - 1, rawY));
  const floorX = Math.floor(x), y0 = Math.floor(y), y1 = Math.min(height - 1, y0 + 1);
  const x0 = global ? ((floorX % width) + width) % width : floorX;
  const x1 = global ? (x0 + 1) % width : Math.min(width - 1, x0 + 1);
  const a = heights[y0 * width + x0], b = heights[y0 * width + x1];
  const c = heights[y1 * width + x0], d = heights[y1 * width + x1];
  if (![a, b, c, d].every(Number.isFinite)) return undefined;
  const tx = x - floorX, ty = y - y0;
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function intersectsRegion(bounds: TerrainBounds, region: TerrainRegion, radiusM: number): boolean {
  const latRadius = region.radiusM / radiusM / radians;
  const lonRadius = latRadius / Math.max(0.05, Math.cos(region.latDeg * radians));
  return region.latDeg + latRadius >= bounds.south && region.latDeg - latRadius <= bounds.north && region.lonDeg + lonRadius >= bounds.west && region.lonDeg - lonRadius <= bounds.east;
}

function edgeWeight(bounds: TerrainBounds | undefined, latitude: number, longitude: number, marginM: number, radiusM: number): number {
  if (!bounds || marginM <= 0) return 1;
  const northSouth = Math.min(latitude - bounds.south, bounds.north - latitude) * radians * radiusM;
  const eastWest = Math.min(longitude - bounds.west, bounds.east - longitude) * radians * radiusM * Math.cos(latitude * radians);
  return smoothstep(Math.min(northSouth, eastWest) / marginM);
}

/** Face ordering/formulas are shared with PLANETARY_ENGINE.md; +Z is west longitude 90. */
export function terrainCubeLatLon(face: number, u: number, v: number): { latDeg: number; lonDeg: number } {
  const directions = [[1, v, -u], [-1, v, u], [u, 1, -v], [u, -1, v], [u, v, 1], [-u, v, -1]];
  const direction = directions[face];
  if (!direction) throw new Error("Invalid terrain cube face");
  const [x, y, z] = direction;
  return { latDeg: Math.atan2(y, Math.hypot(x, z)) / radians, lonDeg: Math.atan2(-z, x) / radians };
}

export class LunarTerrainProvider implements TerrainDataProvider {
  readonly manifest: TerrainManifest;
  revision = 0;
  private readonly resident = new Map<string, ResidentTile>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly controller = new AbortController();
  private readonly waiters: Array<{ resolve: () => void; reject: (reason: Error) => void }> = [];
  private readonly fetcher: typeof fetch;
  private readonly maxCacheBytes: number;
  private readonly maxConcurrentRequests: number;
  private activeRequests = 0;
  private residentBytes = 0;
  private clock = 0;
  private disposed = false;

  constructor(options: LunarTerrainProviderOptions = {}) {
    this.manifest = options.manifest ?? moonTerrainManifest;
    // Browser fetch must keep its Window receiver when called from a class.
    this.fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    const globalBytes = this.manifest.tiles.filter(tile => tile.tier === "global").reduce((sum, tile) => sum + tile.byteLength, 0);
    this.maxCacheBytes = Math.max(globalBytes + 512 * 1024, options.maxCacheBytes ?? 12 * 1024 * 1024);
    this.maxConcurrentRequests = Math.max(1, Math.min(6, options.maxConcurrentRequests ?? 3));
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    this.assertActive(signal);
    const globals = this.manifest.tiles.filter(tile => tile.tier === "global");
    if (!globals.length) throw new Error("Lunar terrain dataset is not prepared");
    await Promise.all(globals.map(tile => this.request(tile, signal)));
  }

  async ensureRegion(region: TerrainRegion, signal?: AbortSignal): Promise<void> {
    this.assertActive(signal);
    if (!Number.isFinite(region.latDeg) || !Number.isFinite(region.lonDeg) || !Number.isFinite(region.radiusM) || region.radiusM < 0) throw new Error("Invalid lunar terrain region");
    await this.initialize(signal);
    const desiredResolution = region.desiredResolutionM ?? (region.radiusM > 5000 ? 40 : 5);
    const candidates = this.manifest.tiles.filter(tile => tile.tier !== "global" && (tile.tier !== "local" || desiredResolution < 40) && intersectsRegion(tile.bounds, region, this.manifest.radiusM));
    // Coarse parents arrive before fine data, retaining a continuous surface after failures.
    for (const tier of ["context", "local"] as const) {
      await Promise.all(candidates.filter(tile => tile.tier === tier).map(tile => this.request(tile, signal)));
    }
  }

  sampleHeight(latDeg: number, lonDeg: number): HeightSample {
    if (this.disposed || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg) || Math.abs(latDeg) > 90) return { ...missing };
    const longitude = normalizeLongitude(lonDeg);
    let result = { ...missing };
    for (const tier of ["global", "context", "local"] as const) {
      for (const resident of this.resident.values()) {
        const tile = resident.descriptor;
        if (tile.tier !== tier) continue;
        const heightM = sampleTerrainRaster(tile, resident.heights, latDeg, longitude);
        if (heightM === undefined) continue;
        resident.accessed = ++this.clock;
        const bounds = tier === "local" ? this.manifest.localBounds : tier === "context" ? this.manifest.contextBounds : undefined;
        const margin = tier === "local" ? this.manifest.localBlendM : this.manifest.contextBlendM;
        const weight = result.available ? edgeWeight(bounds, latDeg, longitude, margin, this.manifest.radiusM) : 1;
        if (weight > 0) result = {
          heightM: result.available ? result.heightM + (heightM - result.heightM) * weight : heightM,
          available: true,
          resolutionM: weight >= 1 - 1e-8 ? tile.resolutionM : Math.max(result.resolutionM, tile.resolutionM),
          sourceId: weight >= 1 - 1e-8 ? tile.sourceId : `${tile.sourceId}:boundary-blend`,
        };
        break;
      }
    }
    return result;
  }

  getImagery(latDeg: number, lonDeg: number): TerrainImagery | undefined {
    const longitude = normalizeLongitude(lonDeg);
    let imagery: TerrainImagery | undefined;
    for (const tile of this.manifest.tiles) {
      if (this.resident.has(tile.id) && tile.imagery && terrainBoundsContain(tile.imagery.bounds, latDeg, longitude) && (!imagery || tile.imagery.sourceResolutionM < imagery.sourceResolutionM)) imagery = tile.imagery;
    }
    return imagery;
  }

  async loadTile(key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainTileData> {
    const count = 2 ** key.level;
    if (!Number.isInteger(key.level) || key.level < 0 || key.level > 24 || !Number.isInteger(key.x) || !Number.isInteger(key.y) || key.x < 0 || key.y < 0 || key.x >= count || key.y >= count) throw new Error("Invalid lunar terrain tile key");
    await this.initialize(signal);
    const u0 = key.x / count * 2 - 1, v0 = key.y / count * 2 - 1;
    const center = terrainCubeLatLon(key.face, u0 + 1 / count, v0 + 1 / count);
    if (key.level >= 7) {
      await this.ensureRegion({ ...center, radiusM: this.manifest.radiusM * 2 / count, desiredResolutionM: key.level >= 11 ? 5 : 40 }, signal);
    }
    const segments = 32, heightsM = new Float32Array((segments + 1) ** 2);
    let sourceResolutionM = 0, sourceId = "missing", available = true;
    for (let y = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) {
      const location = terrainCubeLatLon(key.face, u0 + x / segments * 2 / count, v0 + y / segments * 2 / count);
      const sample = this.sampleHeight(location.latDeg, location.lonDeg);
      heightsM[y * (segments + 1) + x] = sample.heightM;
      available &&= sample.available;
      sourceResolutionM = Math.max(sourceResolutionM, sample.resolutionM);
      sourceId = sample.sourceId;
    }
    return { key, segments, heightsM, sourceResolutionM, sourceId, revision: this.revision, coverage: !available ? "missing" : sourceResolutionM > 40 ? "coarse" : "measured" };
  }

  getCacheStats(): TerrainCacheStats {
    return { residentTiles: this.resident.size, residentBytes: this.residentBytes, pendingRequests: this.pending.size, revision: this.revision };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    for (const waiter of this.waiters.splice(0)) waiter.reject(new DOMException("Terrain provider disposed", "AbortError"));
    this.resident.clear();
    this.residentBytes = 0;
    this.revision++;
  }

  private assertActive(signal?: AbortSignal): void {
    if (this.disposed || signal?.aborted) throw new DOMException("Lunar terrain request aborted", "AbortError");
  }

  private request(tile: TerrainRasterTile, signal?: AbortSignal): Promise<void> {
    this.assertActive(signal);
    const cached = this.resident.get(tile.id);
    if (cached) { cached.accessed = ++this.clock; return Promise.resolve(); }
    const pending = this.pending.get(tile.id);
    if (pending) return pending;
    const operation = this.fetchTile(tile, signal).finally(() => this.pending.delete(tile.id));
    this.pending.set(tile.id, operation);
    return operation;
  }

  private async fetchTile(tile: TerrainRasterTile, signal?: AbortSignal): Promise<void> {
    if (this.activeRequests >= this.maxConcurrentRequests) {
      await new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    } else {
      this.activeRequests++;
    }
    try {
      this.assertActive(signal);
      const combinedSignal = signal ? AbortSignal.any([this.controller.signal, signal]) : this.controller.signal;
      const response = await this.fetcher(tile.url, { signal: combinedSignal });
      if (!response.ok) throw new Error(`Lunar terrain ${tile.id}: HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      this.assertActive(signal);
      if (buffer.byteLength !== tile.byteLength || buffer.byteLength !== tile.width * tile.height * 4) throw new Error(`Lunar terrain ${tile.id}: invalid grid size`);
      const heights = new Float32Array(buffer);
      for (const height of heights) if (!Number.isNaN(height) && (!Number.isFinite(height) || height < -15000 || height > 15000)) throw new Error(`Lunar terrain ${tile.id}: invalid elevation units`);
      this.resident.set(tile.id, { descriptor: tile, heights, accessed: ++this.clock });
      this.residentBytes += buffer.byteLength;
      this.revision++;
      this.evict();
    } finally {
      // Transfer the occupied slot directly; queued work cannot race a new request.
      const next = this.waiters.shift();
      if (next) next.resolve();
      else this.activeRequests--;
    }
  }

  private evict(): void {
    while (this.residentBytes > this.maxCacheBytes) {
      const candidate = [...this.resident.values()].filter(tile => tile.descriptor.tier !== "global").sort((a, b) => a.accessed - b.accessed)[0];
      if (!candidate) break;
      this.resident.delete(candidate.descriptor.id);
      this.residentBytes -= candidate.heights.byteLength;
      this.revision++;
    }
  }
}
