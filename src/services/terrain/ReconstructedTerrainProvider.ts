import { Vector3 } from "three";
import type { CelestialObject } from "../../types/celestial";
import type { TerrainDataProvider, TerrainManifest, TerrainRegion, TerrainTileData, TerrainTileKey } from "../../types/terrain";
import { craterDensityFor, environmentFor } from "../../data/planetaryEnvironments";
import { crateredReliefM, type CrateredReliefParameters } from "./crateredRelief";
import { shapeSeed } from "../../engine/objects/IrregularShape";
import { geodeticToCartesian } from "../../engine/terrain/coordinates";
import { martianReliefM } from "./martianRelief";
import { terrestrialReliefM } from "./terrestrialRelief";

/** Seam-free analytic terrain, explicitly a reconstruction rather than a measured DEM. */
export class ReconstructedTerrainProvider implements TerrainDataProvider {
  readonly manifest: TerrainManifest;
  readonly revision = 1;
  private disposed = false;
  private readonly point = new Vector3();
  private readonly environment;
  /** Seeded crater field for airless worlds without a dedicated relief model. */
  private readonly craters: CrateredReliefParameters | null;

  constructor(body: CelestialObject, site: TerrainRegion) {
    const environment = environmentFor(body.id);
    if (!environment) throw new Error(`No reconstruction profile for ${body.name}.`);
    this.environment = environment;
    this.craters = environment.mode === "surface" && !["mars", "earth", "venus", "mercury"].includes(body.id)
      ? { seed: shapeSeed(body.id), reliefM: environment.reliefM, featureScaleM: environment.featureScaleM,
          radiusM: body.radiusKm * 1000, craterDensity: craterDensityFor(body) }
      : null;
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
    if (this.disposed || !Number.isFinite(latDeg) || Math.abs(latDeg) > 90 || !Number.isFinite(lonDeg))
      return { heightM: 0, available: false, resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id };
    const p = geodeticToCartesian(latDeg, lonDeg, 0, this.manifest.radiusM, this.point);
    if (this.manifest.bodyId === "mars") return {
      heightM: martianReliefM(p.x, p.y, p.z, this.environment.reliefM), available: true,
      resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id,
    };
    const body = this.manifest.bodyId;
    if (body === "earth" || body === "venus" || body === "mercury") return {
      heightM: terrestrialReliefM(body as "earth" | "venus" | "mercury", p.x, p.y, p.z, this.environment.reliefM), available: true,
      resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id,
    };
    if (this.craters) return {
      heightM: crateredReliefM(p.x, p.y, p.z, this.craters), available: true,
      resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id,
    };
    // Atmospheric destinations have no solid terrain; the navigation datum is not a ground mesh.
    return { heightM: 0, available: true, resolutionM: this.environment.featureScaleM, sourceId: this.manifest.id };
  }
  async loadTile(_key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainTileData> {
    this.check(signal);
    throw new Error("Analytic terrain is sampled directly by the shared geometry builder.");
  }
  getImagery() { return undefined; }
  getCacheStats() { return { residentTiles: 0, residentBytes: 0, pendingRequests: 0, revision: this.revision }; }
  dispose(): void { this.disposed = true; }
}
