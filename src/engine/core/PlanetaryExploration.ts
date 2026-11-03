import {
  AmbientLight,
  DirectionalLight,
  MathUtils,
  Scene,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { CelestialObject, ObjectId, Quality } from "../../types/celestial";
import type { TerrainDataProvider } from "../../types/terrain";
import { ReconstructedTerrainProvider } from "../../services/terrain/ReconstructedTerrainProvider";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";
import { cartesianToGeodetic } from "../terrain/coordinates";
import { PlanetarySky } from "../effects/PlanetarySky";
import { initialLunarTelemetry, type LunarTelemetry } from "../../types/lunar";
import { LunarTerrainProvider } from "../../services/terrain/LunarTerrainProvider";
import {
  LunarNavigationController,
  type LunarPose,
} from "../navigation/LunarNavigationController";
import { PlanetTerrainRenderer } from "../terrain/PlanetTerrainRenderer";
import { relativeSolarIrradiance } from "../coordinates/LunarFrame";
import { qualityConfig } from "./quality";

interface LunarOptions {
  body?: CelestialObject;
  landingDirection?: Vector3;
  quality: Quality;
  mobile: boolean;
  eyeHeightM: number;
  onTelemetry: (telemetry: LunarTelemetry) => void;
}

/** One local scene shares the main renderer and loop, but all distances here are meters. */
export class PlanetaryExploration {
  readonly bodyId: ObjectId;
  readonly atmospheric: boolean;
  readonly scene = new Scene();
  readonly navigation: LunarNavigationController;
  private readonly provider: TerrainDataProvider;
  private readonly sky: PlanetarySky | null;
  private readonly skyScene = new Scene();
  private readonly ambient = new AmbientLight("#ffffff", 0.008);
  private terrain: PlanetTerrainRenderer | null = null;
  private readonly sunlight = new DirectionalLight("#ffffff", 3.1);
  private solarVisibility = 1;
  private baseSolarIntensity = 3.1;
  private readonly abort = new AbortController();
  private readonly sunDirection = new Vector3();
  private startPose: LunarPose | null = null;
  private loading = true;
  private entered = false;
  private disposed = false;
  private failure: string | null = null;
  private quality: Quality;
  private aspect = 1;
  private viewportHeight = 1;

  constructor(
    element: HTMLElement,
    private readonly options: LunarOptions,
  ) {
    this.quality = options.quality;
    this.bodyId = options.body?.id ?? "moon";
    const environment = planetaryEnvironments[this.bodyId];
    this.atmospheric = environment?.mode === "atmosphere";
    const site = cartesianToGeodetic(options.landingDirection ?? new Vector3(1, 0, 0), 1);
    this.provider = this.bodyId !== "moon" && options.body
      ? new ReconstructedTerrainProvider(options.body, { ...site, radiusM: 1000 })
      : new LunarTerrainProvider({
      maxCacheBytes: options.mobile ? 12 * 1048576 : 24 * 1048576,
      maxConcurrentRequests: options.mobile ? 2 : 4,
    });
    this.sky = environment ? new PlanetarySky(environment) : null;
    if (this.sky) this.skyScene.add(this.sky.mesh);
    this.navigation = new LunarNavigationController(
      element,
      (lat, lon) => this.provider.sampleHeight(lat, lon),
      {
        radiusM: this.provider.manifest.radiusM,
        reconstruction: this.provider.manifest.reconstruction,
        hoverHeightM: this.atmospheric ? 25000 : undefined,
        eyeHeightM: options.eyeHeightM,
        surfaceHeightAt: (lat, lon) =>
          this.terrain?.sampleSurfaceHeight(lat, lon) ?? null,
      },
    );
    this.scene.add(
      this.sunlight,
      this.sunlight.target,
      this.ambient,
    );
    this.sunlight.shadow.bias = -0.000002;
    this.sunlight.shadow.normalBias = 0.02;
    this.setQuality(options.quality);
    this.report();
  }

  async prepare(
    pose: LunarPose,
    aspect: number,
    viewportHeight: number,
  ): Promise<void> {
    this.startPose = {
      positionM: pose.positionM.clone(),
      forward: pose.forward.clone(),
      up: pose.up.clone(),
    };
    this.aspect = aspect;
    this.viewportHeight = viewportHeight;
    this.navigation.setAspect(aspect);
    this.navigation.camera.up.copy(pose.up);
    this.navigation.camera.lookAt(pose.forward);
    try {
      await this.provider.initialize(this.abort.signal);
      await this.provider.ensureRegion(
        this.provider.manifest.landingRegion,
        this.abort.signal,
      );
      if (this.disposed) return;
      if (!this.atmospheric) this.terrain = new PlanetTerrainRenderer(
        this.provider,
        this.quality,
        this.options.mobile,
      );
      if (this.terrain) {
        this.scene.add(this.terrain.group);
        await this.terrain.prepare();
      }
      if (this.disposed) return;
      this.loading = false;
    } catch (error) {
      if (this.disposed || this.abort.signal.aborted) return;
      this.failure =
        error instanceof Error
          ? error.message
          : "Exploration environment could not be loaded.";
      this.report();
    }
  }

  get error(): string | null {
    return this.failure;
  }
  get ready(): boolean {
    return this.entered;
  }
  get complete(): boolean {
    return this.entered && !this.navigation.active;
  }
  get pose(): LunarPose {
    return this.entered ? this.navigation.getPose() : this.startPose!;
  }
  /** Local spherical horizon for exposure; detailed terrain remains responsible for hill silhouettes. */
  get observerSurface(): { bodyId: ObjectId; radiusKm: number } | undefined {
    if (!this.entered) return undefined;
    const nav = this.navigation.getTelemetry();
    if (nav.altitudeM > 10_000 || !["surface", "descending", "ascending"].includes(nav.phase)) return undefined;
    return { bodyId: this.bodyId, radiusKm: (this.navigation.positionM.length() - nav.altitudeM) / 1000 };
  }

  update(
    delta: number,
    sunDirection: Vector3,
    distanceAu: number,
    aspect: number,
    viewportHeight: number,
  ): void {
    if (this.disposed || this.failure || !this.startPose) return;
    this.sunDirection.copy(sunDirection);
    this.aspect = aspect;
    this.viewportHeight = viewportHeight;
    this.navigation.setAspect(this.aspect);
    if (!this.entered && !this.loading) {
      this.terrain?.update(
        this.startPose.positionM,
        this.navigation.camera,
        this.viewportHeight,
      );
      if (this.atmospheric || this.terrain?.status.ready) {
        this.entered = this.navigation.enter(
          this.startPose,
          this.provider.manifest.landingRegion,
        );
        if (!this.entered)
          this.failure =
            "Landing terrain is unavailable at this region. Return to orbit and retry.";
      }
    }
    if (!this.entered) return;
    this.navigation.update(delta);
    this.terrain?.update(
      this.navigation.positionM,
      this.navigation.camera,
      this.viewportHeight,
    );
    // Refinement can raise a rendered triangle after movement sampled the old LOD.
    this.navigation.resolveTerrainCollision();
    this.terrain?.updateOrigin(this.navigation.positionM);
    const observer = this.navigation.positionM;
    const altitude = Math.max(0, this.navigation.getTelemetry().altitudeM);
    const environment = planetaryEnvironments[this.bodyId];
    const irradiance = relativeSolarIrradiance(distanceAu);
    this.sky?.update(observer, sunDirection, altitude, irradiance);
    const daylight = Math.max(0, observer.clone().normalize().dot(sunDirection));
    const haze = environment ? Math.max(0, 1 - altitude / Math.max(1, environment.hazeHeightM)) : 0;
    this.ambient.intensity = irradiance * (0.008 + haze * daylight * 0.6);
    if (environment) this.ambient.color.set(environment.horizonColor);
    // A kilometer-wide shadow map has no useful surface precision at orbital altitude.
    this.sunlight.castShadow =
      altitude < 20_000 &&
      qualityConfig(this.quality, 1, this.options.mobile).shadowMapSize > 0;
    const radius = this.provider.manifest.radiusM;
    const ground = observer
      .clone()
      .normalize()
      .multiplyScalar(radius + this.navigation.getTelemetry().elevationM);
    const target = ground.sub(observer);
    const extent = Math.max(120, Math.min(radius * 1.1, altitude * 2 + 500));
    const distance = extent * 2 + 1000;
    this.baseSolarIntensity = 3.1 * relativeSolarIrradiance(distanceAu);
    this.sunlight.intensity = this.baseSolarIntensity * this.solarVisibility;
    this.sunlight.position.copy(target).addScaledVector(sunDirection, distance);
    this.sunlight.target.position.copy(target);
    const shadowCamera = this.sunlight.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 1;
    shadowCamera.far = distance * 3;
    const shadowTexelM = (2 * extent) / this.sunlight.shadow.mapSize.x;
    this.sunlight.shadow.normalBias = MathUtils.clamp(
      shadowTexelM * 0.1,
      0.05,
      1.5,
    );
    this.sunlight.shadow.bias = -Math.max(
      0.000002,
      0.05 / (shadowCamera.far - shadowCamera.near),
    );
    shadowCamera.updateProjectionMatrix();
  }

  render(renderer: WebGLRenderer): void {
    if (!this.ready || this.disposed) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    if (this.sky) renderer.render(this.skyScene, this.navigation.camera);
    renderer.render(this.scene, this.navigation.camera);
    renderer.autoClear = autoClear;
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.terrain?.setQuality(quality, this.options.mobile);
    const size = qualityConfig(quality, 1, this.options.mobile).shadowMapSize;
    this.sunlight.castShadow = size > 0;
    if (size > 0 && this.sunlight.shadow.mapSize.x !== size) {
      this.sunlight.shadow.map?.dispose();
      this.sunlight.shadow.map = null;
      this.sunlight.shadow.mapSize.set(size, size);
    }
  }

  adapt(fps: number): void {
    this.terrain?.adapt(fps);
  }

  report(): void {
    if (this.disposed) return;
    const nav = this.navigation.getTelemetry();
    const terrain = this.terrain?.status;
    const cache = this.provider.getCacheStats();
    const solarCosine = this.entered
      ? this.navigation.positionM.clone().normalize().dot(this.sunDirection)
      : 0;
    this.options.onTelemetry({
      ...initialLunarTelemetry,
      phase: this.failure
        ? "error"
        : !this.entered
          ? "loading"
          : nav.phase === "inactive"
            ? "orbit"
            : nav.phase,
      latDeg: this.entered
        ? nav.latDeg
        : this.provider.manifest.landingRegion.latDeg,
      lonDeg: this.entered
        ? nav.lonDeg
        : this.provider.manifest.landingRegion.lonDeg,
      elevationM: this.entered ? nav.elevationM : 0,
      altitudeM: this.entered ? nav.altitudeM : 0,
      resolutionM: this.entered ? nav.resolutionM : 0,
      sourceId: nav.sourceId,
      bodyId: this.bodyId,
      reconstruction: this.bodyId !== "moon",
      atmospheric: this.atmospheric,
      coverageNotice: [nav.coverageNotice, terrain?.error]
        .filter(Boolean)
        .join(" "),
      visibleTiles: terrain?.visibleTiles ?? 0,
      pendingTiles: (terrain?.pendingTiles ?? 0) + cache.pendingRequests,
      residentBytes: cache.residentBytes,
      solarAltitudeDeg: MathUtils.radToDeg(
        Math.asin(MathUtils.clamp(solarCosine, -1, 1)),
      ),
      error: this.failure,
    });
  }

  returnToOrbit(): void {
    this.navigation.returnToOrbit();
  }
  setSolarVisibility(fraction: number): void {
    this.solarVisibility = MathUtils.clamp(Number.isFinite(fraction) ? fraction : 1, 0, 1);
    this.sunlight.intensity = this.baseSolarIntensity * this.solarVisibility;
  }
  release(): void {
    this.navigation.release();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.navigation.dispose();
    this.terrain?.dispose();
    this.sky?.dispose();
    this.skyScene.clear();
    this.provider.dispose();
    this.sunlight.shadow.dispose();
    this.scene.clear();
  }
}
