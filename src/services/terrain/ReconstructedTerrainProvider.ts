import { Vector3 } from "three";
import type { CelestialObject } from "../../types/celestial";
import type { TerrainDataProvider, TerrainManifest, TerrainRegion, TerrainTileData, TerrainTileKey } from "../../types/terrain";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";
import { geodeticToCartesian } from "../../engine/terrain/coordinates";

/** Seam-free analytic terrain, explicitly a reconstruction rather than a measured DEM. */
export class ReconstructedTerrainProvider implements TerrainDataProvider {
  readonly manifest: TerrainManifest;
  readonly revision = 1;
  private disposed = false;
  private readonly point = new Vector3();
  private readonly environment;

  constructor(body: CelestialObject, site: TerrainRegion) {
    const environment = planetaryEnvironments[body.id];
    if (!environment) throw new Error(`No reconstruction profile for ${body.name}.`);
    this.environment = environment;
    this.manifest = {
      id: `${body.id}-reconstruction`, version: "1", bodyId: body.id,
      radiusM: body.radiusKm * 1000, minElevationM: -environment.reliefM, maxElevationM: environment.reliefM,
      globalResolutionM: environment.featureScaleM, coordinates: "Spherical body-fixed meters; planetocentric degrees, east-positive longitude; illustrative orientation.",
      elevationUnits: "meters", encoding: "float32-le", reconstruction: true,
      landingRegion: { ...site, id: "observer-site", label: "Reconstructed exploration region" },
      sources: [], tiles: [], contextBlendM: 0, localBlendM: 0,
    };
  }

  private check(signal?: AbortSignal): void {
    signal?.throwIfAborted();
    if (this.disposed) throw new Error("Terrain provider is disposed.");
  }
  async initialize(signal?: AbortSignal): Promise<void> { this.check(signal); }
  async ensureRegion(_region: TerrainRegion, signal?: AbortSignal): Promise<void> { this.check(signal); }
  sampleHeight(latDeg: number, lonDeg: number) {
    if (this.disposed || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg))
      return { heightM: 0, available: false, resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id };
    const p = geodeticToCartesian(latDeg, lonDeg, 0, this.manifest.radiusM, this.point).divideScalar(this.environment.featureScaleM);
    const hills = Math.sin(p.x * 0.7 + Math.sin(p.z * 0.23)) * Math.cos(p.z * 0.81 + p.y * 0.3);
    const detail = Math.sin(p.x * 2.1 + p.z * 1.7) * Math.cos(p.y * 2.3 - p.z * 0.6);
    // Crater-like bowls are a generated relief field, not named/observed craters.
    const cell = Math.cos(p.x) * Math.cos(p.y) * Math.cos(p.z);
    const crater = -Math.pow(Math.max(0, cell), 12) + 0.18 * Math.exp(-Math.pow((cell - 0.76) * 12, 2));
    const heightM = this.environment.reliefM * (this.manifest.bodyId === "mercury" ? 0.7 * crater + 0.15 * hills : 0.7 * hills + 0.16 * detail);
    return { heightM, available: true, resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id };
  }
  async loadTile(_key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainTileData> {
    this.check(signal);
    throw new Error("Analytic terrain is sampled directly by the shared geometry builder.");
  }
  getImagery() { return undefined; }
  getCacheStats() { return { residentTiles: 0, residentBytes: 0, pendingRequests: 0, revision: this.revision }; }
  dispose(): void { this.disposed = true; }
}
