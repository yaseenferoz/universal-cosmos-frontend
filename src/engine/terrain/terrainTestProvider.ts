import type { HeightSample, TerrainDataProvider, TerrainManifest } from "../../types/terrain";

/** Deterministic analytic fixture only; never used by the production terrain engine. */
export function testTerrainProvider(height: (latitude: number, longitude: number) => number = () => 120): TerrainDataProvider {
  const manifest: TerrainManifest = {
    id: "test", version: "test", bodyId: "moon", radiusM: 1_737_400,
    minElevationM: -9000, maxElevationM: 11000, globalResolutionM: 7600,
    coordinates: "test body-fixed", elevationUnits: "meters", encoding: "float32-le",
    landingRegion: { id: "test", label: "test", latDeg: 20.1908, lonDeg: 30.7717, radiusM: 900 },
    sources: [], tiles: [], contextBlendM: 100, localBlendM: 100,
  };
  return {
    manifest, revision: 1,
    initialize: async () => undefined,
    ensureRegion: async () => undefined,
    sampleHeight: (latitude, longitude): HeightSample => ({ heightM: height(latitude, longitude), available: true, resolutionM: 5, sourceId: "test" }),
    loadTile: async () => { throw new Error("Fixture uses resident samples."); },
    getImagery: () => undefined,
    getCacheStats: () => ({ residentTiles: 1, residentBytes: 100, pendingRequests: 0, revision: 1 }),
    dispose: () => undefined,
  };
}
