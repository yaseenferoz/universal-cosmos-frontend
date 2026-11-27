import {
  Frustum, Group, Matrix4, Mesh, MeshStandardMaterial,
  PerspectiveCamera, Ray, Vector3,
} from "three";
import { imageryFor } from "../../data/imagery";
import { environmentFor } from "../../data/planetaryEnvironments";
import type { Quality } from "../../types/celestial";
import type { TerrainDataProvider } from "../../types/terrain";
import { scientificTextures, type TextureLease } from "../loaders/ScientificTextureLoader";
import {
  CUBE_ROOTS, cartesianToGeodetic, directionToCube, geodeticToCartesian,
  tileChildren, tileId, tileParent, type TerrainTileKey,
} from "./coordinates";
import { buildTerrainGeometry, type TerrainGeometry } from "./TerrainGeometry";
import { TerrainImageryLayers } from "./TerrainImageryLayers";
import type { SurfaceAtmosphere } from "../effects/SurfaceAtmosphere";
import { configureSurfaceDetail, SurfaceDetailMaps, updateSurfaceGround, wrappedDetailOrigin, type SurfaceGroundUniforms } from "./SurfaceDetailMaterial";
import { surfaceProfileFor } from "../../data/surfaceProfiles";
import type { Linear } from "./siteColor";
import { selectTerrainTiles, terrainBudget, type TerrainBudget, type TerrainSelection } from "./TerrainSelection";

interface ResidentTile extends TerrainGeometry {
  mesh: Mesh;
  revision: number;
  used: number;
}

export interface TerrainRenderStatus {
  ready: boolean;
  visibleTiles: number;
  residentTiles: number;
  pendingTiles: number;
  gpuBytes: number;
  tileBudget: number;
  maxLevel: number;
  resolutionM: number;
  sourceId: string;
  error: string | null;
}

/** A bounded meter-space terrain pass. The host owns lights, camera, clock and provider. */
/** Main-thread milliseconds per frame spent building terrain tiles. */
const TILE_BUILD_BUDGET_MS = 3;

export class PlanetTerrainRenderer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ color: "#b5b3af", roughness: 1, metalness: 0 });
  private readonly tiles = new Map<string, ResidentTile>();
  private readonly abort = new AbortController();
  private readonly cameraPositionM = new Vector3();
  private readonly materialOriginM = new Vector3();
  private readonly frustum = new Frustum();
  private readonly imageryLayers = new TerrainImageryLayers(error => {
    this.error = `Regional imagery: ${error instanceof Error ? error.message : "unavailable"}`;
  });
  private readonly detailMaps = new SurfaceDetailMaps();
  private selection: TerrainSelection = { tiles: [], splitIds: new Set() };
  private required = new Map<string, TerrainTileKey>();
  private budget: TerrainBudget;
  private generation = 0;
  private frame = 0;
  private initialized = false;
  private disposed = false;
  private preparing: Promise<void> | null = null;
  private baseLease: TextureLease | null = null;
  private regionRequest = false;
  private requestedResolution = Infinity;
  private selectedRevision = -1;
  private error: string | null = null;
  private quality: Quality;
  private mobile: boolean;
  private autoReduced = false;
  /** Class palette of a synthesized landing site (undefined for dedicated terrain). */
  private readonly ground: SurfaceGroundUniforms | undefined;

  constructor(readonly provider: TerrainDataProvider, quality: Quality = "auto", mobile = false, atmosphere?: SurfaceAtmosphere) {
    this.quality = quality;
    this.mobile = mobile;
    this.budget = terrainBudget(quality, mobile);
    this.group.name = "Body cube-sphere terrain (camera-relative meters)";
    if (provider.manifest.reconstruction)
      this.material.color.set(environmentFor(provider.manifest.bodyId)?.groundColor ?? "#999999");
    this.imageryLayers.configure(this.material);
    this.imageryLayers.setAnisotropy(quality === "low" || mobile ? 2 : 4);
    this.ground = configureSurfaceDetail(this.material, this.detailMaps, this.materialOriginM,
      provider.manifest.bodyId, false, !provider.manifest.reconstruction);
    atmosphere?.configure(this.material);
  }

  /** Landing-site ground colour sampled from the body's global map. */
  setGroundColor(linear: Linear): void {
    const profile = surfaceProfileFor(this.provider.manifest.bodyId);
    if (profile && this.ground && !this.disposed) updateSurfaceGround(this.ground, profile, linear);
  }

  prepare(): Promise<void> {
    if (this.preparing) return this.preparing;
    this.preparing = this.provider.initialize(this.abort.signal).then(() => {
      if (this.disposed) return;
      CUBE_ROOTS.forEach((key) => this.build(key));
      this.initialized = true;
      void this.loadBaseImagery();
      void this.loadReconstructedDetail();
    });
    return this.preparing;
  }

  private async loadBaseImagery(): Promise<void> {
    // Orbital clouds/geography must not be painted as invented surface measurements.
    if (this.provider.manifest.reconstruction) return;
    const asset = imageryFor(this.provider.manifest.bodyId).surface;
    if (!asset) return;
    const generation = this.generation;
    const tier = this.quality === "high" ? "high" : this.quality === "low" || this.mobile || this.autoReduced ? "low" : "medium";
    try {
      const lease = await scientificTextures.acquire(asset, tier);
      if (this.disposed || generation !== this.generation) { lease.release(); return; }
      this.baseLease?.release();
      this.baseLease = lease;
      this.material.map = lease.texture;
      this.material.color.set("#ffffff");
      this.material.needsUpdate = true;
    } catch (error) {
      if (!this.disposed) this.error = `Lunar imagery: ${error instanceof Error ? error.message : "unavailable"}`;
    }
  }

  private async loadReconstructedDetail(): Promise<void> {
    try {
      await this.detailMaps.load(false, this.mobile || this.quality === "low", this.quality === "high");
    } catch (error) {
      if (!this.disposed) this.error = `Ground detail: ${error instanceof Error ? error.message : "unavailable"}`;
    }
  }

  update(positionM: Vector3, camera: PerspectiveCamera, viewportHeight: number): void {
    if (this.disposed || !this.initialized) return;
    this.frame++;
    this.cameraPositionM.copy(positionM);
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sampleCoordinates = cartesianToGeodetic(positionM, this.provider.manifest.radiusM);
    const sample = this.provider.sampleHeight(sampleCoordinates.latDeg, sampleCoordinates.lonDeg);
    const altitude = Math.max(1, sampleCoordinates.heightM - sample.heightM);
    this.requestRegion(sampleCoordinates.latDeg, sampleCoordinates.lonDeg, altitude);
    const { latDeg, lonDeg } = sampleCoordinates;
    const imagery = this.provider.getImagery(latDeg, lonDeg);
    this.imageryLayers.update(this.provider.getImageryLayers?.(latDeg, lonDeg) ?? (imagery ? [imagery] : []));
    if (this.frame % 6 === 1 || this.selectedRevision !== this.provider.revision) {
      this.selection = selectTerrainTiles({
        positionM, radiusM: this.provider.manifest.radiusM,
        minElevationM: this.provider.manifest.minElevationM,
        maxElevationM: this.provider.manifest.maxElevationM,
        viewportHeight, fovRadians: camera.fov * Math.PI / 180, frustum: this.frustum,
        budget: this.budget, previousSplits: this.selection.splitIds,
        heightAt: (direction) => {
          const point = cartesianToGeodetic(direction, 1);
          return this.provider.sampleHeight(point.latDeg, point.lonDeg).heightM;
        },
      });
      this.required.clear();
      for (const tile of this.selection.tiles) {
        let key: TerrainTileKey | null = tile;
        while (key) { this.required.set(tileId(key), key); key = tileParent(key); }
      }
      this.selectedRevision = this.provider.revision;
    }
    const queue = [...this.required.values()].filter((key) => {
      const tile = this.tiles.get(tileId(key));
      return !tile || tile.revision !== this.provider.revision;
    }).sort((a, b) => a.level - b.level);
    // Time-sliced: keep building while under the frame budget (at least one tile),
    // capped so a burst of cheap tiles cannot monopolise a frame either.
    const started = performance.now();
    let built = 0;
    for (const key of queue) {
      if (built >= this.budget.buildsPerFrame * 3) break;
      if (built > 0 && performance.now() - started > TILE_BUILD_BUDGET_MS) break;
      this.build(key);
      built++;
    }
    for (const tile of this.tiles.values()) tile.mesh.visible = false;
    CUBE_ROOTS.forEach((key) => this.showBranch(key));
    for (const tile of this.tiles.values()) {
      if (tile.mesh.visible) {
        tile.used = this.frame;
      }
    }
    this.updateOrigin(positionM);
    this.evict();
  }

  /** Rebase after a same-frame collision correction, without another LOD/build pass. */
  updateOrigin(positionM: Vector3): void {
    this.cameraPositionM.copy(positionM);
    wrappedDetailOrigin(positionM, this.materialOriginM);
    for (const tile of this.tiles.values()) {
      if (tile.mesh.visible) tile.mesh.position.copy(tile.centerM).sub(positionM);
    }
  }

  private requestRegion(latDeg: number, lonDeg: number, altitude: number): void {
    if (this.regionRequest || altitude > 250_000) return;
    const desiredResolutionM = altitude < 8000 ? 5 : 40;
    if (desiredResolutionM >= this.requestedResolution) return;
    this.regionRequest = true;
    this.requestedResolution = desiredResolutionM;
    void this.provider.ensureRegion({ latDeg, lonDeg, radiusM: Math.max(1000, Math.min(20_000, altitude)), desiredResolutionM }, this.abort.signal)
      .catch((error: unknown) => {
        if (!this.disposed) this.error = `Terrain data: ${error instanceof Error ? error.message : "unavailable"}`;
      }).finally(() => { this.regionRequest = false; });
  }

  private build(key: TerrainTileKey): void {
    const data = buildTerrainGeometry(key, this.budget.segments, this.provider);
    const previous = this.tiles.get(tileId(key));
    if (previous) { this.group.remove(previous.mesh); previous.geometry.dispose(); }
    const mesh = new Mesh(data.geometry, this.material);
    mesh.name = `Lunar terrain ${tileId(key)}`;
    mesh.castShadow = mesh.receiveShadow = true;
    // Skirts close visible LOD cracks, but are not observed terrain and must not
    // occlude the Sun. Three brackets each shadow draw with these callbacks.
    let drawStart = 0;
    let drawCount = Infinity;
    mesh.onBeforeShadow = () => {
      drawStart = data.geometry.drawRange.start;
      drawCount = data.geometry.drawRange.count;
      data.geometry.setDrawRange(0, data.surfaceIndexCount);
    };
    mesh.onAfterShadow = () => {
      data.geometry.setDrawRange(drawStart, drawCount);
    };
    mesh.visible = false;
    mesh.position.copy(data.centerM).sub(this.cameraPositionM);
    this.group.add(mesh);
    this.tiles.set(tileId(key), { ...data, mesh, revision: this.provider.revision, used: this.frame });
  }

  private showBranch(key: TerrainTileKey): void {
    const id = tileId(key);
    const tile = this.tiles.get(id);
    if (!tile || !this.required.has(id)) return;
    const children = tileChildren(key).filter((child) => this.required.has(tileId(child)));
    if (this.selection.splitIds.has(id) && children.length && children.every((child) => this.tiles.has(tileId(child)))) {
      children.forEach((child) => this.showBranch(child));
    } else tile.mesh.visible = true;
  }

  /** Radial intersection of the actual visible triangle, excluding visual skirts. */
  sampleSurfaceHeight(latDeg: number, lonDeg: number): number | null {
    const direction = geodeticToCartesian(latDeg, lonDeg, 0, 1);
    const cube = directionToCube(direction);
    let result: number | null = null;
    const ray = new Ray(new Vector3(), direction);
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
    for (const tile of this.tiles.values()) {
      if (!tile.mesh.visible || tile.key.face !== cube.face) continue;
      const count = 2 ** tile.key.level;
      const u = (cube.u + 1) * count / 2 - tile.key.x;
      const v = (cube.v + 1) * count / 2 - tile.key.y;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const x = Math.min(tile.segments - 1, Math.floor(u * tile.segments));
      const y = Math.min(tile.segments - 1, Math.floor(v * tile.segments));
      const first = y * (tile.segments + 1) + x;
      const attribute = tile.geometry.getAttribute("position");
      for (const indices of [[first, first + 1, first + tile.segments + 1], [first + 1, first + tile.segments + 2, first + tile.segments + 1]]) {
        a.fromBufferAttribute(attribute, indices[0]).add(tile.centerM);
        b.fromBufferAttribute(attribute, indices[1]).add(tile.centerM);
        c.fromBufferAttribute(attribute, indices[2]).add(tile.centerM);
        if (ray.intersectTriangle(a, b, c, false, hit)) result = Math.max(result ?? -Infinity, hit.length() - this.provider.manifest.radiusM);
      }
    }
    return result;
  }

  private evict(): void {
    if (this.tiles.size <= this.budget.cacheTiles) return;
    const candidates = [...this.tiles.values()].filter((tile) => tile.key.level > 0 && !tile.mesh.visible && !this.required.has(tileId(tile.key)))
      .sort((a, b) => a.used - b.used);
    for (const tile of candidates) {
      if (this.tiles.size <= this.budget.cacheTiles) break;
      this.group.remove(tile.mesh);
      tile.geometry.dispose();
      this.tiles.delete(tileId(tile.key));
    }
  }

  setQuality(quality: Quality, mobile = this.mobile): void {
    if (quality === this.quality && mobile === this.mobile && !this.autoReduced) return;
    this.quality = quality;
    this.mobile = mobile;
    this.autoReduced = false;
    this.budget = terrainBudget(quality, mobile);
    this.generation++;
    this.selectedRevision = -1;
    for (const tile of this.tiles.values()) tile.revision = -1;
    this.imageryLayers.setAnisotropy(this.quality === "low" || this.mobile || this.autoReduced ? 2 : 4);
    if (this.initialized) { void this.loadBaseImagery(); void this.loadReconstructedDetail(); }
  }

  /** The host supplies its five-second FPS sample; explicit quality resets this reduction. */
  adapt(fps: number): void {
    if (this.quality !== "auto" || this.autoReduced || this.mobile || !Number.isFinite(fps) || fps >= 28) return;
    this.autoReduced = true;
    this.budget = terrainBudget("low", this.mobile);
    this.generation++;
    this.selectedRevision = -1;
    for (const tile of this.tiles.values()) tile.revision = -1;
    this.imageryLayers.setAnisotropy(2);
    if (this.initialized) void this.loadBaseImagery();
  }

  get status(): TerrainRenderStatus {
    const visible = [...this.tiles.values()].filter((tile) => tile.mesh.visible);
    const coordinates = cartesianToGeodetic(this.cameraPositionM, this.provider.manifest.radiusM);
    const sample = this.provider.sampleHeight(coordinates.latDeg, coordinates.lonDeg);
    return {
      ready: this.initialized && CUBE_ROOTS.every((key) => this.tiles.has(tileId(key))),
      visibleTiles: visible.length, residentTiles: this.tiles.size,
      pendingTiles: [...this.required.keys()].filter((id) => !this.tiles.has(id) || this.tiles.get(id)?.revision !== this.provider.revision).length + Number(this.regionRequest),
      gpuBytes: [...this.tiles.values()].reduce((bytes, tile) => bytes + tile.byteLength, 0),
      tileBudget: this.budget.maxTiles,
      maxLevel: visible.reduce((max, tile) => Math.max(max, tile.key.level), 0),
      resolutionM: sample.resolutionM, sourceId: sample.sourceId, error: this.error,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.abort.abort();
    for (const tile of this.tiles.values()) tile.geometry.dispose();
    this.tiles.clear();
    this.group.clear();
    this.material.dispose();
    this.baseLease?.release();
    this.baseLease = null;
    this.imageryLayers.dispose();
    this.detailMaps.dispose();
  }
}
