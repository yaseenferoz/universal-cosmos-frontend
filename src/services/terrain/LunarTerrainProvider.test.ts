import { describe, expect, it, vi } from "vitest";
import type { TerrainManifest, TerrainRasterTile } from "../../types/terrain";
import { LunarTerrainProvider, sampleTerrainRaster, terrainCubeLatLon } from "./LunarTerrainProvider";

const globalTile: TerrainRasterTile = {
  id: "base", url: "/base.f32", bounds: { west: -135, east: 135, south: -45, north: 45 },
  width: 4, height: 2, resolutionM: 7500, sourceId: "base-source", byteLength: 32, tier: "global",
};
const regionTile: TerrainRasterTile = {
  id: "regional", url: "/regional.f32", bounds: { west: 29, east: 31, south: 19, north: 21 },
  width: 2, height: 2, resolutionM: 5, sourceId: "measured", byteLength: 16, tier: "local",
};
const manifest: TerrainManifest = {
  id: "test", version: "1", bodyId: "moon", radiusM: 1737400, minElevationM: -10000,
  maxElevationM: 10000, globalResolutionM: 7500, coordinates: "planetocentric/east-positive",
  elevationUnits: "meters", encoding: "float32-le", sources: [],
  landingRegion: { id: "site", label: "Site", latDeg: 20, lonDeg: 30, radiusM: 500 },
  tiles: [globalTile, regionTile], localBounds: regionTile.bounds, contextBlendM: 100, localBlendM: 100,
};
const constantGrid = (count: number, value: number) => new Float32Array(count).fill(value).buffer;

describe("measured lunar raster sampling", () => {
  it("interpolates inclusive posts and preserves source nodata", () => {
    expect(sampleTerrainRaster(regionTile, new Float32Array([100, 200, 300, 400]), 20, 30)).toBe(250);
    expect(sampleTerrainRaster(regionTile, new Float32Array([100, NaN, 300, 400]), 20, 30)).toBeUndefined();
    expect(sampleTerrainRaster(regionTile, new Float32Array([100, 200, 300, 400]), 22, 30)).toBeUndefined();
  });

  it("wraps the global antimeridian and clamps polar interpolation", () => {
    const heights = new Float32Array([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(sampleTerrainRaster(globalTile, heights, 45, 180)).toBe(25);
    expect(sampleTerrainRaster(globalTile, heights, 45, -180)).toBe(25);
    expect(sampleTerrainRaster(globalTile, heights, 90, -135)).toBe(10);
  });

  it("matches the documented cube orientation at face centers and seams", () => {
    expect(terrainCubeLatLon(0, 0, 0)).toEqual({ latDeg: 0, lonDeg: 0 });
    expect(terrainCubeLatLon(5, 0, 0).lonDeg).toBe(90);
    expect(terrainCubeLatLon(4, 0, 0).lonDeg).toBe(-90);
    expect(terrainCubeLatLon(0, 1, 0)).toEqual(terrainCubeLatLon(5, -1, 0));
  });
});

describe("LunarTerrainProvider lifecycle and coverage", () => {
  it("preserves the browser global receiver for native fetch", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(constantGrid(8, 0)));
    });
    const provider = new LunarTerrainProvider({ manifest });
    try {
      await provider.initialize();
      expect(provider.sampleHeight(0, 0).available).toBe(true);
    } finally {
      provider.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("deduplicates requests and streams measured heights only after region preparation", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new Response(input === "/base.f32" ? constantGrid(8, -2000) : constantGrid(4, -2624)));
    const provider = new LunarTerrainProvider({ manifest, fetcher });
    expect(provider.sampleHeight(20, 30).available).toBe(false);
    await Promise.all([provider.initialize(), provider.initialize()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(provider.sampleHeight(20, 30).resolutionM).toBe(7500);
    await provider.ensureRegion({ latDeg: 20, lonDeg: 30, radiusM: 500 });
    expect(provider.sampleHeight(20, 30)).toEqual({ heightM: -2624, available: true, resolutionM: 5, sourceId: "measured" });
    expect(provider.revision).toBe(2);
    expect(provider.sampleHeight(10, 30).sourceId).toBe("base-source");
    provider.dispose();
    expect(provider.getCacheStats().residentBytes).toBe(0);
    expect(provider.sampleHeight(20, 30).available).toBe(false);
  });

  it("keeps global height after missing fine data and failed tile fetch", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => input === "/base.f32" ? new Response(constantGrid(8, -2000)) : new Response("missing", { status: 404 }));
    const provider = new LunarTerrainProvider({ manifest, fetcher });
    await expect(provider.ensureRegion({ latDeg: 20, lonDeg: 30, radiusM: 100 })).rejects.toThrow("HTTP 404");
    expect(provider.sampleHeight(20, 30).heightM).toBe(-2000);
    provider.dispose();
  });

  it("fades regional coverage to its parent at the dataset edge", async () => {
    const provider = new LunarTerrainProvider({ manifest, fetcher: async input => new Response(input === "/base.f32" ? constantGrid(8, 0) : constantGrid(4, 100)) });
    await provider.ensureRegion({ latDeg: 20, lonDeg: 30, radiusM: 100 });
    expect(provider.sampleHeight(20, 29).heightM).toBe(0);
    const inside = provider.sampleHeight(20, 29.001);
    expect(inside.heightM).toBeGreaterThan(0);
    expect(inside.heightM).toBeLessThan(100);
    expect(inside.resolutionM).toBe(7500);
    provider.dispose();
  });

  it("rejects incorrect byte lengths and implausible kilometer/meter data", async () => {
    const malformed = new LunarTerrainProvider({ manifest, fetcher: async () => new Response(new ArrayBuffer(4)) });
    await expect(malformed.initialize()).rejects.toThrow("invalid grid size");
    malformed.dispose();
    const invalid = new LunarTerrainProvider({ manifest, fetcher: async () => new Response(constantGrid(8, 1737400)) });
    await expect(invalid.initialize()).rejects.toThrow("invalid elevation units");
    invalid.dispose();
  });

  it("does not fetch fine tiles for six distant cube roots", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(constantGrid(8, 0)));
    const provider = new LunarTerrainProvider({ manifest, fetcher });
    const tile = await provider.loadTile({ face: 0, level: 0, x: 0, y: 0 });
    expect(tile.heightsM).toHaveLength(33 * 33);
    expect(tile.coverage).toBe("coarse");
    expect(fetcher).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it("bounds concurrent loads and evicts regional grids while retaining the global parent", async () => {
    const manyTiles = Array.from({ length: 12 }, (_, index) => ({ ...regionTile, id: `tile-${index}`, url: `/tile-${index}`, width: 129, height: 129, byteLength: 129 * 129 * 4 }));
    let active = 0, peak = 0;
    const fetcher: typeof fetch = async input => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return new Response(input === "/base.f32" ? constantGrid(8, 0) : constantGrid(129 * 129, 10));
    };
    const provider = new LunarTerrainProvider({ manifest: { ...manifest, tiles: [globalTile, ...manyTiles] }, fetcher, maxConcurrentRequests: 2, maxCacheBytes: 512 * 1024 + 32 });
    await provider.ensureRegion({ latDeg: 20, lonDeg: 30, radiusM: 500 });
    expect(peak).toBeLessThanOrEqual(2);
    expect(provider.getCacheStats().residentBytes).toBeLessThanOrEqual(512 * 1024 + 32);
    expect(provider.sampleHeight(-20, 0).available).toBe(true);
    expect(provider.getCacheStats().pendingRequests).toBe(0);
    provider.dispose();
  });

  it("aborts pending loads and clears memory on teardown", async () => {
    const fetcher: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    const provider = new LunarTerrainProvider({ manifest, fetcher });
    const pending = provider.initialize();
    provider.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(provider.getCacheStats().residentBytes).toBe(0);
    expect(provider.getCacheStats().pendingRequests).toBe(0);
  });
});
