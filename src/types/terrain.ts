import type { ObjectId } from "./celestial";

/** Planetocentric degrees, east-positive longitude; all distances/elevations in meters. */
export interface HeightSample {
  heightM: number;
  available: boolean;
  resolutionM: number;
  sourceId: string;
}

export interface TerrainRegion {
  latDeg: number;
  lonDeg: number;
  radiusM: number;
  desiredResolutionM?: number;
}

export interface TerrainBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface TerrainSource {
  id: string;
  title: string;
  sourceUrl: string;
  assetUrl: string;
  attribution: string;
  license: string;
  nativeResolutionM: number;
  notes: string;
  relativePrecisionM?: number;
  lolaComparisonRmsM?: number;
}

export interface TerrainImagery {
  url: string;
  bounds: TerrainBounds;
  sourceResolutionM: number;
  sourceId: string;
}

/** Inclusive grid posts: row zero is north; columns run west to east. NaN means no observation. */
export interface TerrainRasterTile {
  id: string;
  url: string;
  bounds: TerrainBounds;
  width: number;
  height: number;
  resolutionM: number;
  sourceId: string;
  byteLength: number;
  tier: "global" | "context" | "local";
  imagery?: TerrainImagery;
}

export interface TerrainManifest {
  /** Analytic fallback: resolution describes feature scale, never measured source spacing. */
  reconstruction?: boolean;
  id: string;
  version: string;
  /** Destination identity; provider implementations must validate their own datum and coverage. */
  bodyId: ObjectId;
  radiusM: number;
  minElevationM: number;
  maxElevationM: number;
  globalResolutionM: number;
  coordinates: string;
  elevationUnits: "meters";
  encoding: "float32-le";
  landingRegion: TerrainRegion & { id: string; label: string };
  sources: TerrainSource[];
  tiles: TerrainRasterTile[];
  contextBounds?: TerrainBounds;
  localBounds?: TerrainBounds;
  contextBlendM: number;
  localBlendM: number;
}

export type TerrainCubeFace = 0 | 1 | 2 | 3 | 4 | 5;
export interface TerrainTileKey {
  face: TerrainCubeFace;
  level: number;
  x: number;
  y: number;
}

export interface TerrainTileData {
  key: TerrainTileKey;
  segments: number;
  heightsM: Float32Array;
  sourceResolutionM: number;
  sourceId: string;
  coverage: "measured" | "coarse" | "missing";
  revision: number;
  imageryUrl?: string;
}

export interface TerrainCacheStats {
  residentTiles: number;
  residentBytes: number;
  pendingRequests: number;
  revision: number;
}

export interface TerrainDataProvider {
  readonly manifest: TerrainManifest;
  readonly revision: number;
  initialize(signal?: AbortSignal): Promise<void>;
  ensureRegion(region: TerrainRegion, signal?: AbortSignal): Promise<void>;
  sampleHeight(latDeg: number, lonDeg: number): HeightSample;
  loadTile(key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainTileData>;
  getImagery(latDeg: number, lonDeg: number): TerrainImagery | undefined;
  getCacheStats(): TerrainCacheStats;
  dispose(): void;
}
