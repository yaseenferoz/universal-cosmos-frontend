import {
  AmbientLight,
  Group,
  DirectionalLight,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from "three";
import type { CelestialObject, ObjectId, Quality } from "../../types/celestial";
import {
  displayOrbitAt,
  explorationPosition,
  modeledPositionsKm,
  modeledRelativePositionKm,
  overviewPositions,
  renderRadiusFor,
  type ViewMode,
  type Cartesian,
} from "../coordinates/CoordinateSystem";
import { FloatingOrigin } from "../coordinates/FloatingOrigin";
import { Starfield } from "../effects/Starfield";
import { DeepSky } from "../effects/DeepSky";
import { BrightStarField } from "../effects/BrightStarField";
import { AsteroidBelt } from "../effects/AsteroidBelt";
import { CameraController } from "../navigation/CameraController";
import { FlightController } from "../navigation/FlightController";
import { CameraLookController } from "../navigation/CameraLookController";
import { sampleSceneDiagnostics } from "../navigation/SceneDiagnostics";
import type { DiagnosticTelemetry } from "../../types/diagnostics";
import {
  irregularBodyCameraOffset,
  orbitalCameraDistance,
  orbitalCameraOffset,
} from "../navigation/CameraComposition";
import { CelestialBody } from "../objects/CelestialBody";
import { RendererManager } from "./RendererManager";
import { qualityConfig } from "./quality";
import { SolarScene } from "../solar/SolarScene";
import { advanceSimulationDays } from "../../utils/simulationTime";
import type { SolarTelemetry } from "../../types/solar";
import { LunarExploration } from "./LunarExploration";
import { explorationProfile } from "../../data/explorationProfiles";
import { loadBodySamples } from "../ephemeris/generatedEphemeris";
import { environmentFor } from "../../data/planetaryEnvironments";
import { initialLunarTelemetry, type LunarTelemetry } from "../../types/lunar";
import {
  fromMoonFixedMeters,
  toMoonFixedMeters,
} from "../coordinates/LunarFrame";
import {
  KM_PER_AU,
  KM_PER_EXPLORATION_UNIT,
} from "../coordinates/CoordinateSystem";

export interface EngineTelemetry {
  simulationDays: number;
  fps: number;
  cameraDistance: number;
  quality: string;
}
export interface EngineOptions {
  objects: CelestialObject[];
  simulationEpoch: string;
  onSelect: (id: ObjectId) => void;
  onTelemetry: (telemetry: EngineTelemetry) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onLunarTelemetry?: (telemetry: LunarTelemetry) => void;
  onSolarTelemetry?: (telemetry: SolarTelemetry) => void;
  onDiagnostics?: (telemetry: DiagnosticTelemetry) => void;
  onAssetStatus?: (status: {
    objectId: ObjectId;
    state: string;
    messages: string[];
  }) => void;
}

interface MinorBodyRecord {
  object: CelestialObject;
  body: CelestialBody;
  label: HTMLButtonElement | undefined;
  /** Whether this frame recomputes the offset and re-tests culling. */
  evaluate: boolean;
  offsetKm: Cartesian | null;
  displayOffset: Cartesian | null;
  /** Reused per-frame outputs (no allocation per body per frame). */
  km: Cartesian;
  display: Cartesian;
}

/** Minor-body offsets refreshed per frame while hidden (~8 frames for a full pass). */
const MINOR_REFRESH_PER_FRAME = 64;
const ORIGIN: Cartesian = { x: 0, y: 0, z: 0 };
/** Exploration render units (10,000 km): minimum camera bound and base far plane. */
const EXPLORATION_MIN_BOUND = 1_000_000;
const EXPLORATION_FAR = 1_200_000;
/** Generated Sun-orbiters at least this large (dwarf planets) get Overview labels and orbits. */
const OVERVIEW_MINOR_MIN_RADIUS_KM = 400;

export class UniverseEngine {
  private readonly scene = new Scene();
  private readonly solarRoot = new Group();
  private readonly camera = new PerspectiveCamera(38, 1, 0.003, 1_200_000);
  private readonly origin = new FloatingOrigin(32);
  private readonly sunlight = new DirectionalLight("#ffffff", 3.1);
  private readonly solar: SolarScene;
  private modeledKm = new Map<ObjectId, Cartesian>();
  private readonly flight = new FlightController();
  private readonly look = new CameraLookController();
  private readonly renderManager: RendererManager;
  private readonly controller: CameraController;
  private readonly stars = new Starfield();
  private readonly deepSky = new DeepSky();
  private readonly brightStars = new BrightStarField();
  private readonly asteroidBelt = new AsteroidBelt();
  private readonly bodies = new Map<ObjectId, CelestialBody>();
  private readonly labels = new Map<ObjectId, HTMLButtonElement>();
  private readonly labelScratch = new Vector3();
  /** Hand-curated bodies: positions, spin and labels every frame. */
  private curatedObjects: CelestialObject[] = [];
  private curatedBodies: CelestialBody[] = [];
  /** JPL-generated minor bodies, parents before children (e.g. Pluto before Charon). */
  private readonly minor: MinorBodyRecord[] = [];
  private minorCursor = 0;
  private minorMode: ViewMode | null = null;
  private readonly labelDirection = new Vector3();
  private readonly labelRoot = document.createElement("div");
  private readonly observer: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly raycaster = new Raycaster();
  private followed: ObjectId | null = null;
  private selected: ObjectId | null = "earth";
  private referenceId: ObjectId = "earth";
  private lunar: LunarExploration | null = null;
  private observerEyeHeightM = 1.7;
  private viewMode: ViewMode = "exploration";
  private orbitsVisible = true;
  private globalPositions = new Map<ObjectId, Vector3>();
  private lastAssetStatus = "";
  private lastFollowPosition = new Vector3();
  private playing = true;
  private speed = 1;
  private days = 0;
  private quality: Quality = "auto";
  private density = 1;
  private labelsVisible = true;
  private disposed = false;
  private failed = false;
  private pendingMinimum: number | null = null;
  private frame = 0;
  private lastFrame = 0;
  private lastTelemetry = 0;
  private frameCount = 0;
  private fps = 60;
  private lastAdapt = 0;
  private pointer: {
    id: number;
    x: number;
    y: number;
    time: number;
    moved: boolean;
  } | null = null;
  private activePointers = new Set<number>();
  private lastTap: { id: ObjectId; time: number } | null = null;
  private width = 1;
  private height = 1;
  private readonly projected = new Vector3();
  private readonly world = new Vector3();

  constructor(
    private readonly container: HTMLElement,
    private readonly options: EngineOptions,
  ) {
    this.renderManager = new RendererManager(container);
    this.controller = new CameraController(
      this.camera,
      this.renderManager.renderer.domElement,
      () => {
        if (this.lunar) return;
        this.look.cancel();
        if (this.flight.flying) this.followed = null;
        this.flight.cancel();
        this.pendingMinimum = null;
      },
    );
    this.scene.add(
      this.solarRoot,
      this.deepSky.mesh,
      this.brightStars.points,
      this.stars.points,
      new AmbientLight("#ffffff", 0.015),
      this.sunlight,
      this.sunlight.target,
    );
    this.solarRoot.add(this.asteroidBelt.points);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(1024, 1024);
    this.sunlight.shadow.bias = -0.00008;
    for (const object of options.objects)
      this.bodies.set(object.id, new CelestialBody(object));
    // ~1 MB of sampled Horizons positions for irregular moons; elements until it arrives.
    void loadBodySamples();
    this.partitionBodies(options.objects);
    for (const body of this.bodies.values()) {
      // Hierarchy is resolved in CPU kilometers; mesh scaling cannot alter child orbits.
      this.solarRoot.add(body.anchor);
      // Minor-body orbit lines join the scene only while shown (see applyRelativePositions).
      if (body.curated && body.orbit) this.solarRoot.add(body.orbit);
      body.setRenderRadius(renderRadiusFor(body.data, this.viewMode));
    }
    this.solar = new SolarScene(
      options.objects,
      this.bodies,
      this.renderManager.renderer,
    );
    this.labelRoot.className = "celestial-labels";
    Object.assign(this.labelRoot.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden",
    });
    container.appendChild(this.labelRoot);
    for (const body of this.bodies.values()) this.createLabel(body);
    for (const record of this.minor) record.label = this.labels.get(record.object.id);
    this.updateBodies();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.focusObject("earth", true);
    this.installPicking();
    document.addEventListener("visibilitychange", this.visibilityChanged, {
      signal: this.abort.signal,
    });
    this.renderManager.renderer.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.fail(
          "The graphics context was interrupted. Reload the explorer to reconnect to your GPU.",
        );
      },
      { signal: this.abort.signal },
    );
    this.lastTelemetry = performance.now();
    this.lastAdapt = this.lastTelemetry;
    this.frame = requestAnimationFrame(this.animate);
    const startupBody = this.bodies.get("earth");
    void startupBody?.ensureTexture(this.currentTextureSize()).finally(() => {
      if (!this.disposed && !this.failed) {
        this.reportAssetStatus();
        options.onReady();
      }
    });
    if (!startupBody)
      queueMicrotask(() => {
        if (!this.disposed) options.onReady();
      });
  }

  private createLabel(body: CelestialBody): void {
    const label = document.createElement("button");
    label.className = "celestial-label";
    label.type = "button";
    label.textContent = body.data.name;
    label.setAttribute("aria-label", `Explore ${body.data.name}`);
    Object.assign(label.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "auto",
    });
    label.addEventListener("click", () => this.options.onSelect(body.data.id), {
      signal: this.abort.signal,
    });
    label.addEventListener("dblclick", () => this.focusObject(body.data.id), {
      signal: this.abort.signal,
    });
    this.labels.set(body.data.id, label);
    this.labelRoot.appendChild(label);
  }

  /**
   * Split bodies into curated (updated every frame) and JPL-generated minor bodies,
   * ordered parent-first so each offset is added to an already-resolved parent.
   */
  private partitionBodies(objects: readonly CelestialObject[]): void {
    this.curatedObjects = objects.filter(({ id }) => this.bodies.get(id)?.curated);
    this.curatedBodies = this.curatedObjects.map(({ id }) => this.bodies.get(id)!);
    this.minor.length = 0;
    const placed = new Set(this.curatedObjects.map(({ id }) => id));
    const pending = objects.filter(({ id }) => !placed.has(id) && this.bodies.has(id));
    while (pending.length) {
      const index = pending.findIndex(({ parentId }) => !parentId || placed.has(parentId));
      if (index < 0) break; // orphans are not rendered (catalog tests forbid them)
      const [object] = pending.splice(index, 1);
      placed.add(object.id);
      this.minor.push({
        object, body: this.bodies.get(object.id)!, label: this.labels.get(object.id), evaluate: true,
        offsetKm: null, displayOffset: null, km: { x: 0, y: 0, z: 0 }, display: { x: 0, y: 0, z: 0 },
      });
    }
  }

  private updateBodies(): void {
    const epoch = this.options.simulationEpoch;
    const modeledKm = modeledPositionsKm(this.curatedObjects, this.days, epoch);
    this.modeledKm = modeledKm;
    const overview =
      this.viewMode === "overview"
        ? overviewPositions(this.curatedObjects, this.days, epoch)
        : null;
    const sun = modeledKm.get("sun");
    for (const body of this.curatedBodies) {
      const kilometerPosition = modeledKm.get(body.data.id)!;
      const position =
        overview?.get(body.data.id) ?? explorationPosition(kilometerPosition);
      this.globalVector(body.data.id).set(position.x, position.y, position.z);
      body.rotate(this.days, epoch,
        body.data.id === "earth" && sun
          ? new Vector3(sun.x - kilometerPosition.x, sun.y - kilometerPosition.y, sun.z - kilometerPosition.z).normalize()
          : undefined);
    }
    this.updateMinorPositions(modeledKm, overview);
    this.applyRelativePositions();
  }

  private globalVector(id: ObjectId): Vector3 {
    let global = this.globalPositions.get(id);
    if (!global) {
      global = new Vector3();
      this.globalPositions.set(id, global);
    }
    return global;
  }

  /**
   * Minor bodies: offsets from their parent are recomputed round-robin
   * (MINOR_REFRESH_PER_FRAME per frame) unless drawn or focused, then added to the
   * parent's current position. Hidden bodies are at most a few frames stale.
   */
  private updateMinorPositions(modeledKm: Map<ObjectId, Cartesian>, overview: Map<ObjectId, Cartesian> | null): void {
    const count = this.minor.length;
    if (!count) return;
    const epoch = this.options.simulationEpoch;
    if (this.minorMode !== this.viewMode) {
      this.minorMode = this.viewMode;
      for (const record of this.minor) record.displayOffset = null;
    }
    for (let index = 0; index < count; index++) {
      const record = this.minor[index];
      const { object, body } = record;
      const inSlice = (index - this.minorCursor + count) % count < MINOR_REFRESH_PER_FRAME;
      record.evaluate = !body.culled || inSlice || record.offsetKm === null
        || object.id === this.selected || object.id === this.followed;
      if (record.evaluate || record.offsetKm === null)
        record.offsetKm = modeledRelativePositionKm(object, this.days, epoch);
      if (overview && (record.evaluate || record.displayOffset === null))
        record.displayOffset = displayOrbitAt(object, this.days, epoch);
      const parentKm = modeledKm.get(object.parentId!) ?? ORIGIN;
      const offset = record.offsetKm;
      record.km.x = parentKm.x + offset.x;
      record.km.y = parentKm.y + offset.y;
      record.km.z = parentKm.z + offset.z;
      modeledKm.set(object.id, record.km);
      const global = this.globalVector(object.id);
      if (overview) {
        const parentDisplay = overview.get(object.parentId!) ?? ORIGIN;
        const display = record.displayOffset!;
        record.display.x = parentDisplay.x + display.x;
        record.display.y = parentDisplay.y + display.y;
        record.display.z = parentDisplay.z + display.z;
        overview.set(object.id, record.display);
        global.set(record.display.x, record.display.y, record.display.z);
      } else {
        global.set(record.km.x / KM_PER_EXPLORATION_UNIT, record.km.y / KM_PER_EXPLORATION_UNIT, record.km.z / KM_PER_EXPLORATION_UNIT);
      }
      if (!body.culled) body.rotate(this.days, epoch);
    }
    this.minorCursor = (this.minorCursor + MINOR_REFRESH_PER_FRAME) % count;
  }

  private applyRelativePositions(): void {
    for (const body of this.curatedBodies) {
      this.origin.toLocal(this.globalPositions.get(body.data.id)!, body.anchor.position);
      this.updateOrbitLine(body);
    }
    const pixelScale = this.height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2));
    for (const record of this.minor) {
      const { body, object } = record;
      if (record.evaluate) {
        this.origin.toLocal(this.globalPositions.get(object.id)!, body.anchor.position);
        const distance = Math.max(1e-9, body.anchor.position.distanceTo(this.camera.position));
        const focused = object.id === this.selected || object.id === this.followed;
        // Overview shows Sun-orbiting minor bodies only; the hundreds of small moons
        // appear in Exploration (selecting any body switches to Exploration).
        const inContext = this.viewMode !== "overview" || object.parentId === "sun";
        const culled = !(focused || (inContext && (body.renderRadius / distance) * pixelScale > 0.25));
        // Culled bodies leave the scene graph (no matrix updates, traversal, picking or
        // labels); they rejoin with a fresh position, never a stale world matrix.
        if (culled) {
          if (body.anchor.parent) this.solarRoot.remove(body.anchor);
          if (record.label && !record.label.hidden) record.label.hidden = true;
        } else if (!body.anchor.parent) this.solarRoot.add(body.anchor);
        body.culled = culled;
      }
      if (object.parentId === "sun" || object.id === this.selected || body.hasOrbitLine)
        this.updateOrbitLine(body);
    }
    this.solarRoot.updateMatrixWorld(true);
  }

  /** Orbit lines are shown in Overview; minor bodies build theirs on first use. */
  private updateOrbitLine(body: CelestialBody): void {
    const parentId = body.data.parentId;
    if (!parentId) return;
    // Like labels: planets/curated bodies and dwarf planets (≥400 km). Small asteroids,
    // comets and minor moons get no Overview orbit, so the view stays legible.
    const shown = this.viewMode === "overview" && this.orbitsVisible &&
      (body.data.id === this.selected
        || (parentId === "sun" && (body.curated || body.data.radiusKm >= OVERVIEW_MINOR_MIN_RADIUS_KM)));
    if (!body.curated && !shown && !body.hasOrbitLine) return;
    const orbit = body.orbit;
    if (!orbit) return;
    if (!body.curated) {
      if (shown && !orbit.parent) this.solarRoot.add(orbit);
      else if (!shown && orbit.parent) this.solarRoot.remove(orbit);
    }
    if (shown || body.curated)
      this.origin.toLocal(this.globalPositions.get(parentId) ?? this.labelScratch.set(0, 0, 0), orbit.position);
    orbit.visible = shown;
  }

  /** Camera bound in exploration: the classic 1,000,000 units, or 1.25 × the focus distance. */
  private explorationBound(): number {
    const focus = this.followed ?? this.selected;
    const position = focus ? this.globalPositions.get(focus) : undefined;
    return Math.max(EXPLORATION_MIN_BOUND, position ? position.length() * 1.25 : 0);
  }

  private getGlobalPosition(id: ObjectId, target = new Vector3()): Vector3 {
    return target.copy(this.globalPositions.get(id) ?? new Vector3());
  }

  private readonly animate = (now: number): void => {
    if (this.disposed || this.failed || document.hidden) return;
    try {
      this.renderFrame(now);
    } catch (error) {
      this.fail(
        error instanceof Error
          ? `The 3D explorer could not continue: ${error.message}`
          : "The 3D explorer encountered a graphics error.",
      );
    }
  };

  private fail(message: string): void {
    if (this.disposed || this.failed) return;
    this.failed = true;
    cancelAnimationFrame(this.frame);
    this.flight.pause();
    this.look.pause();
    this.controller.release();
    this.lunar?.release();
    this.options.onError(message);
  }

  private renderFrame(now: number): void {
    this.frame = requestAnimationFrame(this.animate);
    const delta = this.lastFrame
      ? Math.min((now - this.lastFrame) / 1000, 0.1)
      : 0;
    this.lastFrame = now;
    this.days = advanceSimulationDays(this.days, delta, this.playing, this.speed, Date.now(), this.options.simulationEpoch);
    this.updateBodies();
    if (this.followed && !this.lunar) {
      const destination = this.getGlobalPosition(this.followed);
      if (this.flight.flying) {
        if (this.flight.orbiting) {
          const distance = this.flight.offset.length();
          this.flight.offset
            .copy(this.getGlobalPosition("sun"))
            .sub(destination)
            .setLength(distance);
        }
        const sampled = this.flight.sample(destination);
        this.origin.toLocal(sampled.position, this.camera.position);
        this.origin.toLocal(sampled.target, this.controller.controls.target);
        if (!this.flight.flying && this.pendingMinimum !== null) {
          this.controller.controls.minDistance = this.pendingMinimum;
          this.pendingMinimum = null;
        }
      } else {
        const movement = destination.clone().sub(this.lastFollowPosition);
        this.camera.position.add(movement);
        this.controller.controls.target.add(movement);
      }
      this.lastFollowPosition.copy(destination);
    }
    if (this.lunar) {
      const rotation = this.bodyRotation(this.lunar.bodyId);
      const moonPosition = this.getGlobalPosition(this.lunar.bodyId);
      this.lunar.update(
        delta,
        this.getGlobalPosition("sun").sub(moonPosition).normalize().applyQuaternion(rotation.clone().invert()),
        (moonPosition.distanceTo(this.getGlobalPosition("sun")) * KM_PER_EXPLORATION_UNIT) / KM_PER_AU,
        this.width / this.height,
        this.height,
      );
      const pose = this.lunar.pose;
      if (pose) {
        this.origin.toLocal(
          fromMoonFixedMeters(pose.positionM, moonPosition, rotation),
          this.camera.position,
        );
        this.camera.quaternion
          .copy(rotation)
          .multiply(this.lunar.navigation.camera.quaternion);
        this.camera.up.copy(pose.up).applyQuaternion(rotation);
        this.controller.controls.target
          .copy(this.camera.position)
          .add(pose.forward.clone().applyQuaternion(rotation));
      }
      if (this.lunar.error) {
        this.lunar.report();
        this.stopLunar(false);
      } else if (this.lunar.complete) this.stopLunar();
    } else {
      if (this.look.active) {
        const towardSun = this.getGlobalPosition("sun").sub(
          this.origin.toGlobal(this.camera.position),
        );
        const direction = this.look.sample(towardSun);
        const radius = this.bodies.get(this.referenceId)?.renderRadius ?? 1;
        this.controller.controls.target
          .copy(this.camera.position)
          .addScaledVector(direction, Math.max(0.01, radius) * 4);
      }
      this.controller.update(delta);
    }
    this.boundAndRebase();
    this.applyRelativePositions();
    this.updateSunlight();
    this.solar.update({
      positionsKm: this.modeledKm,
      renderPositions: this.globalPositions,
      origin: this.origin,
      camera: this.camera,
      viewMode: this.viewMode,
      referenceId: this.referenceId,
      delta,
      viewportHeight: this.height,
      observerSurface: this.lunar?.observerSurface,
      localBodyId: this.lunar?.bodyId,
      targetId: this.viewMode === "exploration" && !this.lunar && this.selected ? this.selected : undefined,
    });
    this.lunar?.setSolarVisibility(this.solar.lunarIlluminationFraction);
    this.stars.update(
      this.camera.position,
      this.renderManager.renderer.getPixelRatio(),
      this.renderManager.renderer.toneMappingExposure,
    );
    this.deepSky.setQuality(this.quality, this.renderManager.mobile);
    this.brightStars.load();
    const skyVisibility = this.lunar?.ready ? this.lunar.backgroundVisibility : 1;
    const skyAdaptation = this.lunar?.ready ? this.lunar.backgroundAdaptation : 1;
    const skyExposure = this.renderManager.renderer.toneMappingExposure;
    this.deepSky.update(this.camera.position, skyVisibility, skyExposure, skyAdaptation);
    this.deepSky.mesh.visible = this.deepSky.ready;
    this.brightStars.update(
      this.camera.position,
      this.deepSky.ready ? skyVisibility : 0,
      this.renderManager.renderer.getPixelRatio(),
      skyExposure,
      skyAdaptation,
    );
    // Seeded placeholder points only until the map glow and its measured star layer load.
    this.stars.points.visible = !this.deepSky.ready || !this.brightStars.ready;
    if (this.lunar?.ready && this.stars.points.visible)
      this.stars.points.material.uniforms.exposureVisibility.value *= this.lunar.backgroundVisibility * skyAdaptation;
    for (const body of this.curatedBodies) {
      const local = !!this.lunar?.ready && body.data.id === this.lunar.bodyId;
      body.anchor.visible = !(local && !this.lunar?.atmospheric);
      body.setAtmosphericInterior(local && !!this.lunar?.atmospheric);
    }
    this.renderManager.beginFrame();
    try {
      this.renderManager.renderer.render(this.scene, this.camera);
      this.lunar?.render(this.renderManager.renderer);
    } finally {
      this.renderManager.endFrame();
    }
    if (this.lunar)
      this.labels.forEach((label) => {
        label.hidden = true;
      });
    else this.updateLabels();
    // Seeded small-body shapes replace placeholder spheres once they span a few
    // pixels; at most one synchronous build per frame.
    const shapeScale = this.height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2));
    for (const body of this.bodies.values()) {
      if (body.culled || !body.hasIrregularShape) continue;
      body.anchor.getWorldPosition(this.world);
      const distance = Math.max(1e-9, this.camera.position.distanceTo(this.world));
      if (body.ensureShape((body.renderRadius / distance) * shapeScale, body.data.id === this.selected)) break;
    }
    // Only the primary body receives a high resolution map. Other visible worlds
    // use the small verified variant; loading is asynchronous, never pixel work per frame.
    for (const body of this.bodies.values()) {
      if (body.culled) continue;
      body.anchor.getWorldPosition(this.world);
      const textureSize =
        body.data.id === this.selected && this.viewMode === "exploration"
          ? this.currentTextureSize()
          : 512;
      if (
        (this.viewMode === "overview" ||
          this.camera.position.distanceTo(this.world) <
            body.renderRadius * 1000) &&
        body.needsTexture(textureSize)
      ) {
        void body.ensureTexture(textureSize);
        break;
      }
    }
    this.frameCount++;
    if (now - this.lastTelemetry >= 400) {
      const elapsed = now - this.lastTelemetry;
      this.fps = Math.round((this.frameCount * 1000) / Math.max(elapsed, 1));
      this.frameCount = 0;
      this.lastTelemetry = now;
      this.reportAssetStatus();
      this.lunar?.report();
      this.options.onSolarTelemetry?.(this.solar.telemetry);
      this.reportDiagnostics();
      this.options.onTelemetry({
        simulationDays: this.days,
        fps: this.fps,
        cameraDistance: this.camera.position.distanceTo(
          this.controller.controls.target,
        ),
        quality: this.renderManager.qualityLabel,
      });
      if (now - this.lastAdapt > 5000) {
        // Descents/ascents (loading, scripted flight) are not representative frames.
        const transitioning = !!this.lunar && !this.lunar.onSurface;
        if (!transitioning) {
          this.renderManager.adapt(this.fps);
          this.lunar?.adapt(this.fps);
        }
        this.lastAdapt = now;
      }
    }
  }

  private boundAndRebase(): void {
    const global = this.origin.toGlobal(this.camera.position);
    if (this.viewMode === "exploration" && !this.flight.flying && !this.lunar) {
      // Translation can move the orbit pivot as well as the eye; prevent either
      // keyboard movement or free-flight dolly from crossing a solid surface.
      for (const body of this.bodies.values()) {
        // A culled minor body is sub-pixel, so the camera cannot be inside it.
        if (body.culled) continue;
        const minimum = body.outerRenderRadius * 1.025;
        const known = this.globalPositions.get(body.data.id);
        if (known && known.distanceToSquared(global) >= minimum * minimum) continue;
        const center = this.getGlobalPosition(body.data.id);
        const displacement = global.clone().sub(center);
        if (displacement.lengthSq() >= minimum * minimum) continue;
        if (displacement.lengthSq() < 1e-12) displacement.set(1, 0, 0);
        const correction = center
          .add(displacement.setLength(minimum))
          .sub(global);
        global.add(correction);
        this.camera.position.add(correction);
        this.controller.controls.target.add(correction);
      }
    }
    // Exploration reaches the focused body even beyond ~67 AU (Eris, Gonggong, Sedna).
    const boundary = this.viewMode === "overview" ? 1000 : this.explorationBound();
    if (global.length() > boundary) {
      const bounded = global.clone().clampLength(0, boundary);
      const delta = bounded.sub(global);
      this.camera.position.add(delta);
      this.controller.controls.target.add(delta);
    }
    const shift = this.origin.rebase(this.camera.position);
    if (!shift) return;
    this.camera.position.sub(shift);
    this.controller.controls.target.sub(shift);
  }

  private currentTextureSize(): number {
    return qualityConfig(
      this.quality,
      window.devicePixelRatio,
      this.renderManager.mobile,
    ).textureSize;
  }

  private reportAssetStatus(): void {
    if (!this.selected) return;
    const status = this.bodies.get(this.selected)?.textureStatus;
    if (!status) return;
    const signature = `${this.selected}:${status.state}:${status.messages.join("|")}`;
    if (signature === this.lastAssetStatus) return;
    this.lastAssetStatus = signature;
    this.options.onAssetStatus?.({ objectId: this.selected, ...status });
  }

  private updateSunlight(): void {
    const focus = this.bodies.get(this.referenceId);
    const radius = focus?.renderRadius ?? 5;
    const global = this.getGlobalPosition(this.referenceId);
    const sunPosition = this.getGlobalPosition("sun");
    const towardSun =
      global.distanceToSquared(sunPosition) > 0.001
        ? sunPosition.clone().sub(global).normalize()
        : new Vector3(0.8, 0.7, 0.4).normalize();
    const target =
      this.viewMode === "overview"
        ? this.origin.toLocal(new Vector3())
        : this.origin.toLocal(global);
    const distance = Math.max(80, radius * 14);
    this.sunlight.target.position.copy(target);
    this.sunlight.position.copy(target).addScaledVector(towardSun, distance);
    this.sunlight.castShadow =
      this.viewMode === "exploration" && this.selected !== "sun";
    const extent = radius * (this.selected === "saturn" ? 3 : 1.6);
    const shadowCamera = this.sunlight.shadow.camera;
    shadowCamera.left = -extent;
    shadowCamera.right = extent;
    shadowCamera.top = extent;
    shadowCamera.bottom = -extent;
    shadowCamera.near = 0.01;
    shadowCamera.far = distance * 2 + radius * 5;
    this.sunlight.shadow.normalBias = radius * 0.001;
    shadowCamera.updateProjectionMatrix();
    this.sunlight.target.updateMatrixWorld();
    this.sunlight.updateMatrixWorld();
    for (const body of this.bodies.values()) {
      if (body.culled) continue; // refreshed in the frame it becomes visible
      const bodyPosition = this.getGlobalPosition(body.data.id);
      body.updateLighting(
        bodyPosition.distanceToSquared(sunPosition) > 0.001
          ? sunPosition.clone().sub(bodyPosition).normalize()
          : towardSun,
      );
    }
  }

  private updateLabels(): void {
    this.camera.updateMatrixWorld();
    const cameraDirection = this.camera.getWorldDirection(this.labelDirection);
    const pixelScale = this.height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2));
    for (const body of this.curatedBodies)
      this.updateLabel(body, this.labels.get(body.data.id), cameraDirection, pixelScale);
    // Culled minor bodies were hidden when they were culled; skip them entirely.
    for (const record of this.minor)
      if (!record.body.culled) this.updateLabel(record.body, record.label, cameraDirection, pixelScale);
  }

  private updateLabel(body: CelestialBody, label: HTMLButtonElement | undefined, cameraDirection: Vector3, pixelScale: number): void {
    if (!label) return;
    const id = body.data.id;
    body.anchor.getWorldPosition(this.world);
    const distance = this.camera.position.distanceTo(this.world);
    const behind =
      this.labelScratch.copy(this.world).sub(this.camera.position).dot(cameraDirection) <= 0;
    this.projected.copy(this.world).project(this.camera);
    const radiusPixels = (body.renderRadius / Math.max(distance, 0.00001)) * pixelScale;
    const show =
      this.labelsVisible &&
      !behind &&
      this.projected.z < 1 &&
      Math.abs(this.projected.x) < 1.1 &&
      Math.abs(this.projected.y) < 1.1 &&
      (this.viewMode === "overview"
        ? id === this.selected || (body.curated
          ? body.data.parentId === "sun" || distance < 25
          // Hundreds of generated moons/small bodies: only large Sun-orbiters by default.
          : body.data.parentId === "sun" && body.data.radiusKm >= OVERVIEW_MINOR_MIN_RADIUS_KM)
        : radiusPixels > 2 && radiusPixels < 65);
    if (label.hidden === show) label.hidden = !show;
    if (show)
      label.style.transform = `translate(${((this.projected.x + 1) * this.width) / 2 + radiusPixels + 12}px,${((1 - this.projected.y) * this.height) / 2 - 8}px)`;
  }

  private installPicking(): void {
    const canvas = this.renderManager.renderer.domElement;
    const eventOptions = { signal: this.abort.signal };
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (this.lunar) return;
        this.activePointers.add(event.pointerId);
        if (this.activePointers.size > 1) {
          if (this.pointer) this.pointer.moved = true;
          return;
        }
        if (event.button === 0)
          this.pointer = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            time: performance.now(),
            moved: false,
          };
      },
      eventOptions,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (
          this.pointer &&
          Math.hypot(
            event.clientX - this.pointer.x,
            event.clientY - this.pointer.y,
          ) > 7
        )
          this.pointer.moved = true;
      },
      eventOptions,
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        if (this.lunar) return;
        this.activePointers.delete(event.pointerId);
        const pointer = this.pointer;
        this.pointer = null;
        if (
          !pointer ||
          pointer.id !== event.pointerId ||
          pointer.moved ||
          performance.now() - pointer.time > 650
        )
          return;
        const bounds = canvas.getBoundingClientRect();
        this.raycaster.setFromCamera(
          new Vector2(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
          ),
          this.camera,
        );
        const meshes = [...this.bodies.values()].flatMap((body) =>
          body.culled ? [] : body.pickables.filter((mesh) => mesh.visible),
        );
        const picked = this.raycaster.intersectObjects(meshes, false)[0]?.object
          .userData.objectId as ObjectId | undefined;
        if (!picked) return;
        const now = performance.now();
        this.options.onSelect(picked);
        if (this.lastTap?.id === picked && now - this.lastTap.time < 350)
          this.focusObject(picked);
        this.lastTap = { id: picked, time: now };
      },
      eventOptions,
    );
    canvas.addEventListener(
      "pointercancel",
      (event) => {
        this.activePointers.delete(event.pointerId);
        this.pointer = null;
      },
      eventOptions,
    );
    canvas.addEventListener(
      "lostpointercapture",
      (event) => {
        // OrbitControls releases capture inside pointerup; let that click finish first.
        queueMicrotask(() => {
          this.activePointers.delete(event.pointerId);
          if (this.pointer?.id === event.pointerId) this.pointer = null;
        });
      },
      eventOptions,
    );
    window.addEventListener(
      "blur",
      () => {
        this.activePointers.clear();
        this.pointer = null;
        this.lastTap = null;
      },
      eventOptions,
    );
  }

  private resize(): void {
    const oldAspect = this.camera.aspect;
    this.width = Math.max(this.container.clientWidth, 1);
    this.height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = this.width / this.height;
    // Solar observation distances are physical measurements; a layout change
    // must not move the observer or alter the Sun's apparent angular diameter.
    if (
      this.followed &&
      this.followed !== "sun" &&
      this.viewMode === "exploration" &&
      !this.lunar
    ) {
      const ratio =
        orbitalCameraDistance(1, this.camera.aspect) /
        orbitalCameraDistance(1, oldAspect);
      this.camera.position
        .sub(this.controller.controls.target)
        .multiplyScalar(ratio)
        .add(this.controller.controls.target);
      if (this.flight.flying) this.flight.offset.multiplyScalar(ratio);
    }
    this.setCompositionOffset();
    this.camera.updateProjectionMatrix();
    this.renderManager.resize(this.width, this.height);
  }

  private setCompositionOffset(): void {
    if (this.lunar) {
      this.camera.clearViewOffset();
      return;
    }
    if (this.camera.aspect < 1 && this.viewMode === "exploration") {
      this.camera.setViewOffset(
        this.width,
        this.height,
        0,
        Math.min(36, this.height * 0.045),
        this.width,
        this.height,
      );
    } else {
      this.camera.clearViewOffset();
    }
  }

  private readonly visibilityChanged = (): void => {
    cancelAnimationFrame(this.frame);
    this.lastFrame = 0;
    this.frameCount = 0;
    this.lastTelemetry = performance.now();
    this.activePointers.clear();
    this.pointer = null;
    this.lastTap = null;
    this.lunar?.release();
    if (document.hidden) {
      this.flight.pause();
      this.look.pause();
    } else if (!this.disposed && !this.failed) {
      this.flight.resume();
      this.look.resume();
      this.frame = requestAnimationFrame(this.animate);
    }
  };

  setPlayback(playing: boolean, speed: number): void {
    this.playing = playing;
    this.speed = MathUtils.clamp(Number.isFinite(speed) ? speed : 1, 0, 365);
  }
  setTime(days: number): void {
    this.days = MathUtils.clamp(
      Number.isFinite(days) ? days : 0,
      -365250,
      365250,
    );
  }
  setQuality(quality: Quality): void {
    this.quality = quality;
    this.renderManager.setQuality(quality);
    this.lunar?.setQuality(quality);
    if (this.lunar) this.deepSky.setQuality(quality, this.renderManager.mobile);
    this.bodies
      .get("sun")
      ?.sunRenderer?.setQuality(quality, this.renderManager.mobile);
    const shadowSize = qualityConfig(
      quality,
      window.devicePixelRatio,
      this.renderManager.mobile,
    ).shadowMapSize;
    if (shadowSize > 0 && this.sunlight.shadow.mapSize.x !== shadowSize) {
      this.sunlight.shadow.map?.dispose();
      this.sunlight.shadow.map = null;
      this.sunlight.shadow.mapSize.set(shadowSize, shadowSize);
    }
    this.setStarDensity(this.density);
  }
  setStarDensity(density: number): void {
    this.density = MathUtils.clamp(
      Number.isFinite(density) ? density : 1,
      0.25,
      2,
    );
    this.stars.setCount(
      qualityConfig(
        this.quality,
        window.devicePixelRatio,
        this.renderManager.mobile,
      ).stars * this.density,
    );
  }
  setOrbitsVisible(visible: boolean): void {
    this.orbitsVisible = visible;
    this.applyRelativePositions();
  }
  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
  }
  setCameraMode(mode: "orbit" | "free"): void {
    if (this.lunar) return;
    this.look.cancel();
    this.flight.cancel();
    this.pendingMinimum = null;
    this.controller.setMode(mode);
    if (mode === "free") this.followed = null;
  }
  focusObject(id: ObjectId, instant = false): void {
    const body = this.bodies.get(id);
    if (!body || this.disposed) return;
    this.look.cancel();
    this.stopLunar();
    this.lastAssetStatus = "";
    if (this.viewMode !== "exploration")
      this.configureCoordinateMode("exploration");
    const previous = this.selected ? this.bodies.get(this.selected) : undefined;
    if (
      previous &&
      previous !== body &&
      previous.textureStatus.state !== "unloaded"
    )
      void previous.ensureTexture(512);
    this.selected = id;
    this.referenceId = id;
    // Build the inspected shape now so framing and clearance use its true extent, and
    // refresh its orientation: a previously culled body was not rotated while hidden.
    body.ensureShape(Number.POSITIVE_INFINITY, true);
    if (body.hasIrregularShape) body.rotate(this.days, this.options.simulationEpoch);
    this.controller.setReferenceRadius(body.outerRenderRadius);
    this.controller.setMode("orbit");
    this.followed = id;
    this.bodies.forEach((candidate) =>
      candidate.setSelected(candidate.data.id === id),
    );
    this.labels.forEach((label, labelId) =>
      label.classList.toggle("is-selected", labelId === id),
    );
    const destination = this.getGlobalPosition(id);
    this.lastFollowPosition.copy(destination);
    // Look from the lit hemisphere, with an oblique angle exposing the terminator.
    const sunPosition = this.getGlobalPosition("sun");
    const towardSun =
      destination.distanceToSquared(sunPosition) > 0.0001
        ? sunPosition.sub(destination).normalize()
        : new Vector3(0.8, 0, 1);
    const offset = orbitalCameraOffset(
      body.outerRenderRadius,
      this.camera.aspect,
      towardSun,
      id === "saturn",
      new Vector3(0, 1, 0).applyQuaternion(body.tilted.quaternion),
    );
    if (body.hasIrregularShape) {
      // Start beside the long axis so a non-spherical outline is actually visible
      // (shape models' prime meridians are approximate).
      const longAxis = new Vector3(1, 0, 0).applyQuaternion(
        body.surface.getWorldQuaternion(new Quaternion()),
      );
      offset.copy(irregularBodyCameraOffset(
        body.outerRenderRadius, this.camera.aspect, towardSun, longAxis,
      ));
    }
    this.controller.controls.minDistance = 0.00001;
    this.controller.controls.maxDistance = 1_000_000;
    this.pendingMinimum = body.outerRenderRadius * (id === "saturn" ? 2.5 : 1.07);
    // Sub-kilometer bodies need a near plane closer than the default 1 km.
    this.camera.near = Math.max(body.renderRadius * 0.005, 1e-7);
    // Keep the Sun and planets inside the frustum when looking back from ~100 AU.
    this.camera.far = EXPLORATION_FAR + destination.length();
    this.camera.updateProjectionMatrix();
    const instantaneous =
      instant || matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.flight.start(
      this.origin.toGlobal(this.camera.position),
      this.origin.toGlobal(this.controller.controls.target),
      offset,
      instantaneous,
    );
    if (instantaneous) {
      const sampled = this.flight.sample(destination);
      this.origin.toLocal(sampled.position, this.camera.position);
      this.origin.toLocal(sampled.target, this.controller.controls.target);
      this.controller.controls.minDistance = this.pendingMinimum;
      this.pendingMinimum = null;
      this.controller.update(0);
      this.boundAndRebase();
      this.applyRelativePositions();
      this.updateSunlight();
      this.camera.updateMatrixWorld();
      this.updateLabels();
    }
    void body.ensureTexture(this.currentTextureSize());
    this.reportAssetStatus();
  }
  clearFocus(): void {
    this.look.cancel();
    this.stopLunar();
    this.followed = null;
    this.selected = null;
    this.flight.cancel();
    this.pendingMinimum = null;
    this.bodies.forEach((body) => body.setSelected(false));
    this.labels.forEach((label) => label.classList.remove("is-selected"));
    this.controller.controls.minDistance =
      this.viewMode === "overview" ? 0.15 : 0.0001;
  }
  private configureCoordinateMode(mode: ViewMode): void {
    this.look.cancel();
    this.stopLunar();
    this.flight.cancel();
    this.followed = null;
    this.pendingMinimum = null;
    this.viewMode = mode;
    this.asteroidBelt.points.visible = mode === "overview";
    this.origin.offset.set(0, 0, 0);
    this.camera.position.set(0, 0, 1);
    this.controller.controls.target.set(0, 0, 0);
    this.bodies.forEach((body) =>
      body.setRenderRadius(renderRadiusFor(body.data, mode)),
    );
    this.updateBodies();
    this.setCompositionOffset();
  }
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.configureCoordinateMode(mode);
    if (mode === "overview") this.resetView();
    else this.focusObject(this.selected ?? this.referenceId, true);
  }
  resetView(): void {
    if (this.viewMode === "exploration") {
      this.focusObject(this.selected ?? this.referenceId, true);
      return;
    }
    this.clearFocus();
    this.controller.setMode("orbit");
    this.controller.setReferenceRadius(5);
    this.controller.controls.maxDistance = 900;
    this.camera.near = 0.05;
    this.camera.far = 2000;
    this.camera.updateProjectionMatrix();
    const fit = Math.max(1, 1.5 / this.camera.aspect);
    this.origin.toLocal(
      new Vector3(0, 100, 145).multiplyScalar(fit),
      this.camera.position,
    );
    this.origin.toLocal(new Vector3(), this.controller.controls.target);
    this.controller.controls.update();
    this.boundAndRebase();
    this.applyRelativePositions();
    this.updateSunlight();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lunar?.dispose();
    this.lunar = null;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.observer.disconnect();
    this.flight.cancel();
    this.controller.dispose();
    this.look.cancel();
    this.bodies.forEach((body) => body.dispose());
    this.stars.dispose();
    this.deepSky.dispose();
    this.brightStars.dispose();
    this.asteroidBelt.dispose();
    this.sunlight.shadow.dispose();
    this.labelRoot.remove();
    this.renderManager.dispose();
    this.scene.clear();
  }

  private bodyRotation(id: ObjectId): Quaternion {
    const body = this.bodies.get(id);
    return body
      ? body.tilted.quaternion.clone().multiply(body.surface.quaternion)
      : new Quaternion();
  }

  beginLunarDescent(): void {
    if (
      this.disposed ||
      this.viewMode !== "exploration" ||
      !this.selected ||
      this.lunar
    )
      return;
    const body = this.bodies.get(this.selected);
    if (!body) return;
    const profile = explorationProfile(body.data.id);
    const environment = environmentFor(body.data.id);
    if (profile.classification === "STAR" || (body.data.id !== "moon" && !environment)) return;
    this.look.cancel();
    if (this.flight.flying) this.focusObject(body.data.id, true);
    const rotation = this.bodyRotation(body.data.id);
    const inverse = rotation.clone().invert();
    const pose = {
      positionM: toMoonFixedMeters(
        this.origin.toGlobal(this.camera.position),
        this.getGlobalPosition(body.data.id),
        rotation,
      ),
      forward: this.camera
        .getWorldDirection(new Vector3())
        .applyQuaternion(inverse),
      up: new Vector3(0, 1, 0)
        .applyQuaternion(this.camera.quaternion)
        .applyQuaternion(inverse),
    };
    this.flight.cancel();
    this.followed = null;
    this.pendingMinimum = null;
    this.controller.setEnabled(false);
    this.lunar = new LunarExploration(this.renderManager.renderer.domElement, {
      body: body.data,
      // Land near the current view; the measured Moon uses its fixed regional site.
      landingDirection: pose.positionM.clone().normalize(),
      quality: this.quality,
      mobile: this.renderManager.mobile,
      eyeHeightM: this.observerEyeHeightM,
      onTelemetry: (telemetry) => this.options.onLunarTelemetry?.(telemetry),
    });
    this.camera.clearViewOffset();
    // Loading and descending are not representative frame rates.
    this.renderManager.restartAdaptiveGrace();
    void this.lunar.prepare(pose, this.camera.aspect, this.height);
  }

  returnFromLunarSurface(): void {
    if (!this.lunar) return;
    if (!this.lunar.ready) this.stopLunar();
    else this.lunar.returnToOrbit();
  }

  setSurfaceMovement(forward: number, right: number): void {
    this.lunar?.navigation.setMoveInput(forward, right);
  }
  setObserverEyeHeight(heightM: number): void {
    this.observerEyeHeightM = MathUtils.clamp(
      Number.isFinite(heightM) ? heightM : 1.7,
      0.8,
      2.5,
    );
    this.lunar?.navigation.setEyeHeight(this.observerEyeHeightM);
  }
  setExposureEv(ev: number): void {
    this.solar.exposure.compensationEv = MathUtils.clamp(
      Number.isFinite(ev) ? ev : 0,
      -20,
      12,
    );
  }

  setAutomaticExposure(automatic: boolean): void {
    this.solar.exposure.automatic = automatic;
  }

  setSolarFilter(enabled: boolean): void {
    this.solar.exposure.solarFilter = enabled;
  }

  setBloomStrength(strength: number): void {
    this.solar.glareStrength = MathUtils.clamp(
      Number.isFinite(strength) ? strength : 0,
      0,
      1,
    );
  }

  setDiagnosticsEnabled(enabled: boolean): void {
    // React owns panel visibility; the engine always publishes the bounded telemetry sample.
    void enabled;
    this.reportDiagnostics();
  }

  private reportDiagnostics(): void {
    // Keep this low-frequency engine sample available even while its panel is
    // closed. The UI can be opened between telemetry ticks, and a stale
    // engine-side toggle must never leave its diagnostics panel empty.
    // This runs with the existing 400 ms telemetry cadence, never per frame.
    if (!this.options.onDiagnostics) return;
    this.options.onDiagnostics(
      sampleSceneDiagnostics({
        camera: this.camera,
        origin: this.origin,
        positionsKm: this.modeledKm,
        renderPositions: this.globalPositions,
        sunRenderRadius: this.bodies.get("sun")?.renderRadius ?? 0,
        selectedId: this.selected,
        viewMode: this.viewMode,
        effectiveExposureEv: this.solar.exposure.valueEv,
        automaticExposure: this.solar.exposure.automatic,
        lunarActive: this.lunar !== null,
      }),
    );
  }

  /** Rotate in place; selecting a planet and its physical illumination are unchanged. */
  /**
   * Advance the clock to the next time the Sun stands at least `altitudeDeg`
   * above the local horizon at the surface site (searching up to 60 days in
   * one-hour steps with the same ephemeris and spin models). Returns success.
   */
  skipToSurfaceDaylight(altitudeDeg = 20): boolean {
    if (!this.lunar?.onSurface) return false;
    const body = this.bodies.get(this.lunar.bodyId);
    if (!body) return false;
    const up = this.lunar.navigation.positionM.clone().normalize();
    const target = Math.sin(MathUtils.degToRad(altitudeDeg));
    const epoch = this.options.simulationEpoch;
    const toSun = new Vector3();
    for (let hours = 1; hours <= 24 * 60; hours++) {
      const days = this.days + hours / 24;
      const positions = modeledPositionsKm(this.curatedObjects, days, epoch);
      const bodyKm = positions.get(body.data.id);
      const sunKm = positions.get("sun");
      if (!bodyKm || !sunKm) return false;
      toSun.set(sunKm.x - bodyKm.x, sunKm.y - bodyKm.y, sunKm.z - bodyKm.z).normalize();
      const local = toSun.clone().applyQuaternion(body.rotationAt(days, epoch, toSun).invert());
      if (local.dot(up) >= target) {
        this.setTime(days);
        return true;
      }
    }
    return false;
  }

  /** True while standing on a planetary/lunar surface. */
  get isOnSurface(): boolean {
    return !!this.lunar?.onSurface;
  }

  /**
   * From a moon's surface, turn toward its planet. Tidally locked moons keep the planet
   * fixed in their sky; from the far hemisphere it never rises, and the view turns to
   * its bearing on the horizon instead.
   */
  lookAtParent(): boolean {
    if (!this.lunar?.onSurface) return false;
    const body = this.bodies.get(this.lunar.bodyId);
    const parentId = body?.data.parentId;
    if (!body || !parentId || parentId === "sun") return false;
    const direction = this.getGlobalPosition(parentId).sub(this.getGlobalPosition(body.data.id));
    if (direction.lengthSq() === 0) return false;
    direction.normalize().applyQuaternion(this.bodyRotation(body.data.id).invert());
    return this.lunar.lookToward(direction);
  }

  lookAtSun(): boolean {
    if (this.lunar) return this.lunar.lookAtSun();
    if (
      this.disposed ||
      this.failed ||
      this.lunar ||
      this.viewMode !== "exploration" ||
      !this.bodies.has("sun")
    )
      return false;
    this.flight.cancel();
    this.pendingMinimum = null;
    this.followed = null;
    this.controller.setMode("free");
    this.look.start(
      this.camera.getWorldDirection(new Vector3()),
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    return true;
  }

  /** Move around the selected world to its illuminated hemisphere, following its modeled motion. */
  goToDaySide(): boolean {
    if (
      this.disposed ||
      this.failed ||
      this.lunar ||
      this.viewMode !== "exploration" ||
      !this.selected ||
      this.selected === "sun"
    )
      return false;
    const body = this.bodies.get(this.selected);
    if (!body || !this.bodies.has("sun")) return false;
    const center = this.getGlobalPosition(this.selected);
    const direction = this.getGlobalPosition("sun").sub(center);
    if (direction.lengthSq() === 0) return false;
    this.look.cancel();
    this.controller.setMode("orbit");
    this.controller.setReferenceRadius(body.outerRenderRadius);
    this.followed = this.selected;
    this.lastFollowPosition.copy(center);
    this.controller.controls.minDistance = 0.00001;
    this.controller.controls.maxDistance = 1_000_000;
    this.pendingMinimum =
      body.outerRenderRadius * (this.selected === "saturn" ? 2.5 : 1.07);
    const fitRadius =
      body.outerRenderRadius * (this.selected === "saturn" ? 2.4 : 1);
    const offset = direction.setLength(
      orbitalCameraDistance(fitRadius, this.camera.aspect),
    );
    this.flight.startOrbit(
      this.origin.toGlobal(this.camera.position),
      this.origin.toGlobal(this.controller.controls.target),
      center,
      offset,
      this.pendingMinimum,
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    return true;
  }

  setSolarCorona(visible: boolean): void {
    this.solar.coronaEnabled = visible;
  }

  observeSunAtDistance(distanceAu: number): void {
    if (!Number.isFinite(distanceAu) || distanceAu < 0.006 || distanceAu > 50)
      return;
    this.focusObject("sun", true);
    const center = this.getGlobalPosition("sun");
    const direction = this.origin.toGlobal(this.camera.position).sub(center);
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);
    const distance = (distanceAu * KM_PER_AU) / KM_PER_EXPLORATION_UNIT;
    this.origin.toLocal(
      center.clone().add(direction.setLength(distance)),
      this.camera.position,
    );
    this.origin.toLocal(center, this.controller.controls.target);
    this.camera.lookAt(this.controller.controls.target);
    this.controller.controls.update();
  }

  private stopLunar(report = true): void {
    if (!this.lunar) return;
    this.renderManager.restartAdaptiveGrace();
    const bodyId = this.lunar.bodyId;
    this.lunar.dispose();
    this.lunar = null;
    const moon = this.bodies.get(bodyId);
    if (moon) {
      moon.anchor.visible = true;
      this.controller.setReferenceRadius(moon.renderRadius);
      this.controller.controls.minDistance = moon.renderRadius * 1.07;
    }
    this.controller.setEnabled(true);
    this.controller.setMode("orbit");
    this.camera.up.set(0, 1, 0);
    this.followed = bodyId;
    this.lastFollowPosition.copy(this.getGlobalPosition(bodyId));
    this.origin.toLocal(
      this.lastFollowPosition,
      this.controller.controls.target,
    );
    this.setCompositionOffset();
    this.controller.release();
    if (report) this.options.onLunarTelemetry?.({ ...initialLunarTelemetry });
  }
}
