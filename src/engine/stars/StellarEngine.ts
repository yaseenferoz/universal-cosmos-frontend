import {
  AdditiveBlending, Color, MathUtils, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial,
  SphereGeometry, Vector3,
} from "three";
import type { Quality } from "../../types/celestial";
import { initialLunarTelemetry, type LunarTelemetry } from "../../types/lunar";
import { starDisplayName, type StarCatalog } from "../../data/stars/starCatalog";
import type { DeepRef, DeepSkyCatalog } from "../../data/deep/deepSky";
import { RendererManager } from "../core/RendererManager";
import { DeepSkyLayer, photographicSkyWeight } from "../deep/DeepSkyLayer";
import { DeepSky } from "../effects/DeepSky";
import { ExoplanetDescent } from "./ExoplanetDescent";
import { HostMarkers } from "./HostMarkers";
import { julianDate } from "./keplerOrbit";
import { LabelPool } from "./LabelPool";
import { PlanetarySystemView } from "./PlanetarySystemView";
import { StarCloud, starVisibility } from "./StarCloud";
import { StellarCamera } from "./StellarCamera";
import { apparentMagnitude, blackbodyLinearRgb } from "./stellarPhysics";

export { LY_PER_PC } from "./stellarPhysics";
const STAR_LABELS = 22;
const PLANET_LABELS = 12;
/** Simulated days per real second when time runs at its natural rate. */
export const REAL_TIME_RATE = 1 / 86400;

export interface StellarTelemetry {
  /** Camera distance from the Sun, parsecs. */
  fromSunPc: number;
  /** Camera distance from the focused star or planet, parsecs. */
  fromFocusPc: number;
  focused: number;
  /** Index of the focused planet within the focused star's system. */
  focusedPlanet: number | null;
  /** Focused galaxy, nebula or the Milky Way (then `focused` is the last star visited). */
  focusedDeep: DeepRef | null;
  /** Auto-exposure brightening of galaxies far from any large one, magnitudes. */
  exposureMag: number;
  flying: boolean;
  /** A descent to (or exploration of) the focused planet is under way. */
  descending: boolean;
  fps: number;
  /** Simulated Julian date for planet positions. */
  jd: number;
}

export interface StellarEngineOptions {
  catalog: StarCatalog;
  quality: Quality;
  onSelect: (index: number, planet: number | null) => void;
  /** A galaxy, nebula or the Milky Way was picked. */
  onSelectDeep?: (ref: DeepRef) => void;
  onTelemetry: (telemetry: StellarTelemetry) => void;
  /** Descent/surface telemetry (shared format with Solar System descents). */
  onDescentTelemetry?: (telemetry: LunarTelemetry) => void;
  onReady: () => void;
}

interface Flight {
  start: number;
  duration: number;
  /** Unit vectors from the destination to the camera, at departure and on arrival. */
  fromDirection: Vector3;
  toDirection: Vector3;
  lookFrom: Vector3;
  fromDistance: number;
  toDistance: number;
}

/** Comfortable arrival distance: the stellar disk spans about 8 degrees. */
export function arrivalDistancePc(radiusPc: number): number {
  return Math.max(radiusPc * 14, 1e-9);
}

/** Arrival at a star with planets: far enough to frame the whole system. */
export function systemArrivalDistancePc(radiusPc: number, extentPc: number): number {
  return Math.max(arrivalDistancePc(radiusPc), extentPc * 2.6);
}

/** Arrival at a galaxy or nebula: it fills most of the view. */
export function deepArrivalDistancePc(radiusPc: number): number {
  return Math.max(radiusPc * 2.4, 1e-3);
}

/** Arrival at a planet: the disk spans about 16 degrees. */
export function planetArrivalDistancePc(radiusPc: number): number {
  return Math.max(radiusPc * 7, 1e-15);
}

/**
 * Interstellar view: the catalogue's stars at their 3D positions (parsecs), seen from a
 * free camera, and the confirmed planets of the focused star. Separate from the Solar System
 * engine (kilometre scale), like the ISS visit.
 */
export class StellarEngine {
  readonly camera = new PerspectiveCamera(50, 1, 1e-6, 1e4);
  private readonly scene = new Scene();
  private readonly renderManager: RendererManager;
  private readonly cloud: StarCloud;
  private readonly markers: HostMarkers;
  private readonly deepSky = new DeepSky();
  private readonly deep: DeepSkyLayer;
  private focusedDeep: DeepRef | null = null;
  private pendingDeepFly: { ref: DeepRef; distancePc?: number } | null = null;
  private readonly maxPointSize: number;
  private readonly controls: StellarCamera;
  private readonly body: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly glare: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly planetSphere = new SphereGeometry(1, 64, 32);
  private readonly systems = new Map<number, PlanetarySystemView>();
  private readonly labelRoot = document.createElement("div");
  private readonly starLabels: LabelPool;
  private readonly planetLabels: LabelPool;
  private planetLabelKeys: number[] = [];
  private hiddenPlanets: boolean[] = [];
  private readonly observer: ResizeObserver;
  private readonly abort = new AbortController();
  private frame = 0;
  private lastFrame = 0;
  private lastLabels = 0;
  private lastTelemetry = 0;
  private frames = 0;
  private fps = 60;
  private width = 1;
  private height = 1;
  private focused = 0;
  private focusedPlanet: number | null = null;
  private selected: number | null = null;
  private selectedPlanet: number | null = null;
  private flight: Flight | null = null;
  private descent: ExoplanetDescent | null = null;
  /** Descend once the current flight to the focused planet arrives. */
  private pendingDescent = false;
  private quality: Quality;
  private eyeHeightM = 1.7;
  private hostMarkersWanted = false;
  private jd = julianDate(Date.now());
  private timeRate = REAL_TIME_RATE;
  private disposed = false;
  private pointer: { id: number; x: number; y: number; moved: boolean; time: number } | null = null;
  private readonly projected = new Vector3();
  private readonly focusPoint = new Vector3();

  constructor(private readonly container: HTMLElement, private readonly options: StellarEngineOptions) {
    this.renderManager = new RendererManager(container);
    this.renderManager.setQuality(options.quality);
    this.quality = options.quality;
    const canvas = this.renderManager.renderer.domElement;
    canvas.setAttribute("aria-label", "Interactive 3D map of nearby stars and their planets. Drag to orbit, scroll or pinch to zoom, select a star or planet; double-click to fly to it.");
    this.cloud = new StarCloud(options.catalog);
    this.markers = new HostMarkers(options.catalog);
    // Listen on the container so wheel/drag over star labels still moves the camera.
    this.controls = new StellarCamera(this.camera, container);
    this.deepSky.setQuality(options.quality, this.renderManager.mobile);
    this.body = new Mesh(new SphereGeometry(1, 64, 32), new ShaderMaterial({
      uniforms: { starColor: { value: new Color(1, 1, 1) } },
      vertexShader: `varying vec3 vNormalView; varying vec3 vViewPosition;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = view.xyz; vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `uniform vec3 starColor; varying vec3 vNormalView; varying vec3 vViewPosition;
        void main() {
          float mu = max(dot(normalize(vNormalView), normalize(-vViewPosition)), 0.0);
          // Linear limb darkening (u = 0.6, solar-like); photosphere far above display white.
          float limb = 1.0 - 0.6 * (1.0 - mu);
          // Bright, but below full saturation so colour and limb darkening stay visible.
          gl_FragColor = vec4(starColor * 1.7 * limb, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      // Painter's order with the planets (renderOrder by distance), so background stars stay behind it.
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.body.visible = false;
    this.body.frustumCulled = false;
    this.glare = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
      uniforms: { starColor: { value: new Color(1, 1, 1) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 starColor; varying vec2 vUv;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          // Glare around a resolved star (eye/camera scatter), not a stellar atmosphere.
          float glow = exp(-r * 5.0) * 0.9 + exp(-r * 1.6) * 0.18;
          gl_FragColor = vec4(starColor * glow * (1.0 - r), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
    }));
    this.glare.renderOrder = 50;
    this.glare.visible = false;
    this.glare.frustumCulled = false;
    this.scene.add(this.deepSky.mesh, this.cloud.points, this.markers.points, this.body, this.glare);
    this.labelRoot.className = "celestial-labels star-labels";
    container.appendChild(this.labelRoot);
    const signal = this.abort.signal;
    this.starLabels = new LabelPool(this.labelRoot, STAR_LABELS, "celestial-label star-label", signal, {
      select: (index) => this.options.onSelect(index, null),
      open: (index) => this.flyTo(index),
    });
    this.planetLabels = new LabelPool(this.labelRoot, PLANET_LABELS, "celestial-label star-label planet-label", signal, {
      select: (planet) => this.options.onSelect(this.focused, planet),
      open: (planet) => this.flyTo(this.focused, planet),
    });
    const gl = this.renderManager.renderer.getContext();
    const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    this.maxPointSize = Math.max(64, pointRange?.[1] ?? 256);
    this.deep = new DeepSkyLayer({
      renderer: this.renderManager.renderer, quality: options.quality, mobile: this.renderManager.mobile,
      labelRoot: this.labelRoot, signal,
      onSelect: (ref) => this.options.onSelectDeep?.(ref),
      onOpen: (ref) => this.flyToDeep(ref),
    });
    this.scene.add(this.deep.group);
    this.installPicking(canvas);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    // Start a few light-years out, looking back at the Sun: "you are here".
    this.controls.setOrientation(2.4, 0.35);
    this.focusInstant(0, 1.5);
    this.frame = requestAnimationFrame(this.animate);
    this.options.onReady();
  }

  get catalog(): StarCatalog {
    return this.options.catalog;
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.descent?.exploration.setQuality(quality);
    this.renderManager.setQuality(quality);
    this.deepSky.setQuality(quality, this.renderManager.mobile);
    this.deep.setQuality(quality);
  }

  /** Attach the galaxy and nebula catalogue once it has loaded (the star map works without it). */
  setDeepSky(catalog: DeepSkyCatalog): void {
    this.deep.setCatalog(catalog);
    const pending = this.pendingDeepFly;
    this.pendingDeepFly = null;
    if (pending) this.flyToDeep(pending.ref, pending.distancePc);
  }

  /** Highlight a galaxy, nebula or the Milky Way (null clears). */
  selectDeep(ref: DeepRef | null): void {
    this.deep.select(ref);
    this.lastLabels = 0;
  }

  setMagnitudeLimit(limit: number): void {
    this.cloud.setMagnitudeLimit(MathUtils.clamp(limit, 2, 12));
    this.deep.setMagnitudeLimit(MathUtils.clamp(limit, 2, 12));
  }

  /** Simulated days per real second for planet motion (0 pauses). */
  setTimeRate(daysPerSecond: number): void {
    this.timeRate = Number.isFinite(daysPerSecond) ? MathUtils.clamp(daysPerSecond, 0, 3653) : REAL_TIME_RATE;
  }

  /** Planet positions for now again (after a time-lapse). */
  resetTime(): void {
    this.jd = julianDate(Date.now());
  }

  setHostMarkers(visible: boolean): void {
    this.hostMarkersWanted = visible;
    this.markers.points.visible = visible && !this.descent;
    this.lastLabels = 0;
  }

  select(index: number | null, planet: number | null = null): void {
    this.selected = index;
    this.selectedPlanet = index !== null && planet !== null && (this.catalog.systems.get(index)?.planets.length ?? 0) > planet ? planet : null;
    this.lastLabels = 0;
  }

  /** Jump to a star without animation, at `distancePc` (default: arrival distance). */
  focusInstant(index: number, distancePc?: number): void {
    this.stopDescent();
    this.flight = null;
    this.focused = index;
    this.focusedPlanet = null;
    this.setDeepFocus(null);
    this.rebase(this.starPosition(index));
    this.ensureSystem(index);
    this.pruneSystems();
    this.controls.target.set(0, 0, 0);
    this.updateLimits();
    this.controls.setDistance(distancePc ?? this.arrivalDistance(index, null));
    this.controls.apply();
  }

  /** Fly to a star, or to one of its planets, along a logarithmic-distance path (seconds, not years). */
  flyTo(index: number, planet: number | null = null): void {
    if (index < 0 || index >= this.catalog.count) return;
    this.stopDescent();
    this.pendingDescent = false;
    const system = this.catalog.systems.get(index);
    const planetIndex = planet !== null && system && planet >= 0 && planet < system.planets.length ? planet : null;
    const eye = this.camera.position.clone();
    const lookFrom = this.controls.target.clone();
    // Re-centre on the destination star so precision is best where the flight ends.
    const shift = this.cloud.localPosition(index);
    this.rebase(this.cloud.origin.clone().add(shift));
    eye.sub(shift);
    lookFrom.sub(shift);
    this.focused = index;
    this.focusedPlanet = planetIndex;
    this.setDeepFocus(null);
    const view = this.ensureSystem(index);
    view?.place(this.jd, this.cloud.localPosition(index));
    const destination = this.currentFocusPoint(new Vector3());
    const offset = eye.clone().sub(destination);
    const fromDistance = Math.max(offset.length(), 1e-15);
    const fromDirection = offset.lengthSq() > 0 ? offset.normalize() : new Vector3(0, 0, 1);
    const toDistance = this.arrivalDistance(index, planetIndex);
    const span = Math.abs(Math.log(fromDistance / toDistance));
    this.flight = {
      start: performance.now(), duration: MathUtils.clamp(1200 + span * 160, 1500, 5500),
      fromDirection, toDirection: this.arrivalDirection(fromDirection, view, planetIndex), lookFrom, fromDistance, toDistance,
    };
    this.controls.enabled = false;
  }

  private setDeepFocus(ref: DeepRef | null): void {
    this.focusedDeep = ref;
    this.deep.setFocus(ref);
  }

  /**
   * Fly to a galaxy, a nebula or the Milky Way, arriving at `distancePc` (default: it fills
   * the view). Before the catalogue loads, a galaxy or nebula request waits for it.
   */
  flyToDeep(ref: DeepRef, distancePc?: number): void {
    const target = this.deep.heliocentric(ref);
    if (!target) {
      if (!this.deep.ready && ref.kind !== "milky-way") this.pendingDeepFly = { ref, distancePc };
      return;
    }
    this.stopDescent();
    this.pendingDescent = false;
    const eye = this.camera.position.clone();
    const lookFrom = this.controls.target.clone();
    const shift = target.clone().sub(this.cloud.origin);
    this.rebase(target);
    eye.sub(shift);
    lookFrom.sub(shift);
    this.focusedPlanet = null;
    this.setDeepFocus(ref);
    const fromDistance = Math.max(eye.length(), 1e-12);
    const fromDirection = eye.lengthSq() > 0 ? eye.clone().normalize() : new Vector3(0, 0, 1);
    const radius = this.deep.radiusPc(ref);
    const toDistance = distancePc ?? deepArrivalDistancePc(radius);
    // Arrive along the line of approach (from home, a galaxy looks as it does from Earth). Our
    // own Galaxy, which we leave from inside its disk, is shown from 50 degrees above it.
    const toDirection = fromDirection.clone();
    const normal = ref.kind === "milky-way" ? this.deep.normal(ref) : null;
    if (normal) {
      if (normal.dot(fromDirection) < 0) normal.negate();
      const inPlane = fromDirection.clone().addScaledVector(normal, -normal.dot(fromDirection));
      if (inPlane.lengthSq() < 1e-8) inPlane.set(1, 0, 0).addScaledVector(normal, -normal.x);
      inPlane.normalize();
      const elevation = MathUtils.degToRad(50);
      toDirection.copy(normal).multiplyScalar(Math.sin(elevation)).addScaledVector(inPlane, Math.cos(elevation)).normalize();
    }
    const span = Math.abs(Math.log(fromDistance / toDistance));
    this.flight = {
      start: performance.now(), duration: MathUtils.clamp(1200 + span * 160, 1500, 6500),
      fromDirection, toDirection, lookFrom, fromDistance, toDistance,
    };
    this.controls.enabled = false;
    this.lastLabels = 0;
  }

  /**
   * Descend to the focused planet: its surface for rocky planets, the cloud deck for giants.
   * During a flight to a planet, the descent starts on arrival.
   */
  beginDescent(): boolean {
    if (this.disposed || this.descent) return false;
    if (this.flight) {
      this.pendingDescent = this.focusedPlanet !== null;
      return this.pendingDescent;
    }
    const view = this.systems.get(this.focused);
    const system = this.catalog.systems.get(this.focused);
    const index = this.focusedPlanet;
    // Solar System planets are explored in the Solar System view (real maps and ephemerides).
    if (!view || !system || system.solarSystem || index === null || !view.planets[index]?.track) return false;
    this.controls.enabled = false;
    this.descent = new ExoplanetDescent(this.renderManager.renderer.domElement, this.focused, index, system, view, this.camera,
      this.jd, this.width / this.height, this.height, {
        quality: this.quality, mobile: this.renderManager.mobile, eyeHeightM: this.eyeHeightM,
        onTelemetry: (telemetry) => this.options.onDescentTelemetry?.(telemetry),
      });
    this.markers.points.visible = false;
    this.starLabels.assign([]);
    this.planetLabels.assign([]);
    this.deep.hideLabels();
    this.planetLabelKeys = [];
    // Loading and descending are not representative frame rates.
    this.renderManager.restartAdaptiveGrace();
    return true;
  }

  /** On the surface: turn to face the host star (its azimuth if it is below the horizon). */
  faceStar(): boolean {
    return this.descent?.exploration.lookAtSun() ?? false;
  }

  /** Climb back to orbit (or cancel a descent that is still loading). */
  returnFromSurface(): void {
    this.pendingDescent = false;
    if (!this.descent) return;
    if (!this.descent.exploration.ready) this.stopDescent();
    else this.descent.exploration.returnToOrbit();
  }

  setSurfaceMovement(forward: number, right: number): void {
    this.descent?.exploration.navigation.setMoveInput(forward, right);
  }

  setEyeHeight(heightM: number): void {
    this.eyeHeightM = MathUtils.clamp(Number.isFinite(heightM) ? heightM : 1.7, 0.8, 2.5);
    this.descent?.exploration.navigation.setEyeHeight(this.eyeHeightM);
  }

  /** End the descent and orbit the planet from wherever the explorer is. */
  private stopDescent(report = true): void {
    const descent = this.descent;
    if (!descent) return;
    this.descent = null;
    descent.dispose();
    this.renderManager.restartAdaptiveGrace();
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.markers.points.visible = this.hostMarkersWanted;
    this.cloud.setSkyVisibility(1);
    this.controls.enabled = true;
    const planet = this.systems.get(descent.star)?.planets[descent.planetIndex];
    if (planet && this.focused === descent.star) {
      this.focusedPlanet = descent.planetIndex;
      this.updateLimits();
      const offset = this.camera.position.clone().sub(planet.local);
      this.controls.target.copy(planet.local);
      this.controls.setDistance(Math.max(offset.length(), planetArrivalDistancePc(planet.radiusPc)));
      if (offset.lengthSq() > 0) this.controls.setViewDirection(offset);
      this.controls.apply();
    }
    this.lastLabels = 0;
    if (report) this.options.onDescentTelemetry?.({ ...initialLunarTelemetry });
  }

  private starPosition(index: number): Vector3 {
    const p = this.catalog.positions;
    return new Vector3(p[index * 3], p[index * 3 + 1], p[index * 3 + 2]);
  }

  private rebase(origin: Vector3): void {
    this.cloud.rebase(origin);
    this.markers.rebase(origin);
    this.deep.rebase(origin);
  }

  private ensureSystem(index: number): PlanetarySystemView | undefined {
    const existing = this.systems.get(index);
    if (existing) return existing;
    const system = this.catalog.systems.get(index);
    if (!system) return undefined;
    const color = new Color(...blackbodyLinearRgb(this.cloud.temperatureK[index]));
    const view = new PlanetarySystemView(system, this.starPosition(index), color, this.planetSphere);
    this.systems.set(index, view);
    this.scene.add(view.group);
    view.place(this.jd, this.cloud.localPosition(index));
    return view;
  }

  /** Keep only the focused star's system (others are left behind after a flight). */
  private pruneSystems(): void {
    for (const [index, view] of this.systems) {
      if (index === this.focused) continue;
      view.dispose();
      this.systems.delete(index);
    }
  }

  private arrivalDistance(index: number, planet: number | null): number {
    const view = this.systems.get(index);
    if (planet !== null && view?.planets[planet]) return planetArrivalDistancePc(view.planets[planet].radiusPc);
    return view ? systemArrivalDistancePc(this.cloud.radiusPc[index], view.extentPc) : arrivalDistancePc(this.cloud.radiusPc[index]);
  }

  /** Where to end up: systems from ~35° above their orbits; planets at a gibbous phase. */
  private arrivalDirection(from: Vector3, view: PlanetarySystemView | undefined, planet: number | null): Vector3 {
    if (!view) return from.clone();
    if (planet !== null) {
      const toStar = view.planets[planet].mesh.position.clone().negate();
      if (toStar.lengthSq() === 0) return from.clone();
      toStar.normalize();
      const side = from.clone().sub(toStar.clone().multiplyScalar(from.dot(toStar)));
      if (side.lengthSq() < 1e-8) side.copy(view.framingNormal());
      side.normalize();
      const phase = MathUtils.degToRad(65);
      return toStar.multiplyScalar(Math.cos(phase)).add(side.multiplyScalar(Math.sin(phase))).normalize();
    }
    const normal = view.framingNormal();
    if (normal.dot(from) < 0) normal.negate();
    const inPlane = from.clone().sub(normal.clone().multiplyScalar(normal.dot(from)));
    if (inPlane.lengthSq() < 1e-8) inPlane.copy(view.frame.x);
    inPlane.normalize();
    const elevation = MathUtils.degToRad(35);
    return normal.multiplyScalar(Math.sin(elevation)).add(inPlane.multiplyScalar(Math.cos(elevation))).normalize();
  }

  /** The focused star, planet, galaxy or nebula, relative to the floating origin. */
  private currentFocusPoint(target: Vector3): Vector3 {
    if (this.focusedDeep) return this.deep.localPosition(this.focusedDeep, target) ?? target.set(0, 0, 0);
    const planet = this.focusedPlanet !== null ? this.systems.get(this.focused)?.planets[this.focusedPlanet] : undefined;
    return planet ? target.copy(planet.local) : this.cloud.localPosition(this.focused, target);
  }

  private updateLimits(): void {
    // Out to the edge of the galaxy catalogue (~1 Gpc).
    this.controls.maxDistance = 3e9;
    if (this.focusedDeep) {
      // Close enough to fly into a nebula or a galaxy's disk.
      this.controls.minDistance = this.deep.radiusPc(this.focusedDeep) * 0.02;
      return;
    }
    const planet = this.focusedPlanet !== null ? this.systems.get(this.focused)?.planets[this.focusedPlanet] : undefined;
    // Never inside the focused body; out to the edge of the catalogue.
    this.controls.minDistance = planet ? Math.max(1e-16, planet.radiusPc * 1.3) : Math.max(1e-10, this.cloud.radiusPc[this.focused] * 1.6);
  }

  private readonly animate = (now: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 0;
    this.lastFrame = now;
    this.jd += delta * this.timeRate;
    for (const [index, view] of this.systems) view.place(this.jd, this.cloud.localPosition(index, this.projected));
    this.currentFocusPoint(this.focusPoint);
    if (this.descent) this.stepDescent(delta);
    else if (this.flight) this.stepFlight(now);
    else {
      // The orbit target rides along with a moving planet.
      this.controls.target.copy(this.focusPoint);
      this.controls.update(delta);
    }
    this.camera.updateMatrixWorld();
    const focalPx = this.focalPx();
    const pixelRatio = this.renderManager.renderer.getPixelRatio();
    this.updateBody();
    this.hiddenPlanets = this.planetsBehindStar();
    const descent = this.descent;
    let skyVisibility = 1, skyAdaptation = 1;
    if (descent) {
      // From the planet: siblings as lit disks or points of light, daylight hides faint stars.
      const exploring = descent.exploration.ready;
      skyVisibility = exploring ? descent.exploration.backgroundVisibility : 1;
      skyAdaptation = exploring ? descent.exploration.backgroundAdaptation : 1;
      const limit = this.cloud.points.material.uniforms.magnitudeLimit.value as number;
      this.systems.get(descent.star)?.renderSky(this.camera, focalPx, pixelRatio, descent.planetIndex,
        this.catalog.absMag[descent.star], limit, skyVisibility * skyAdaptation, exploring);
      this.fitDescentClipping();
    } else
      for (const [index, view] of this.systems)
        view.render(this.camera, focalPx, pixelRatio, index === this.selected ? this.selectedPlanet : null, index === this.focused ? this.hiddenPlanets : []);
    this.paintOrder();
    this.markers.points.material.uniforms.pixelRatio.value = pixelRatio;
    this.cloud.setSkyVisibility(skyVisibility * skyAdaptation);
    const sun = this.cloud.localPosition(0, this.projected);
    // The photographic sky is the view from the Sun; the Milky Way model takes over further out.
    this.deepSky.update(this.camera.position, skyVisibility * photographicSkyWeight(this.camera.position.distanceTo(sun)), 1, skyAdaptation);
    this.deep.setSkyVisibility(skyVisibility * skyAdaptation);
    this.deep.update(this.camera, focalPx, pixelRatio, this.maxPointSize, sun, now, delta);
    // Volumes (e.g. the Milky Way seen from inside it) can reach beyond the zoom-based far plane.
    const reach = this.deep.volumeReach(this.camera.position) * 1.05;
    if (reach > this.camera.far) {
      this.camera.far = reach;
      this.camera.updateProjectionMatrix();
    }
    this.cloud.setView(pixelRatio, focalPx);
    if (!descent) {
      if (now - this.lastLabels > 200) {
        this.chooseLabels();
        this.deep.chooseLabels(this.camera, this.width, this.height, focalPx);
        this.lastLabels = now;
      }
      this.positionLabels();
      this.deep.positionLabels(this.camera, this.width, this.height);
    }
    this.renderManager.beginFrame();
    try {
      this.renderManager.renderer.render(this.scene, this.camera);
      descent?.render(this.renderManager.renderer);
    } finally {
      this.renderManager.endFrame();
    }
    this.frames++;
    if (now - this.lastTelemetry > 300) {
      this.fps = Math.round((this.frames * 1000) / Math.max(1, now - this.lastTelemetry));
      this.frames = 0;
      this.lastTelemetry = now;
      this.renderManager.adapt(this.fps);
      if (descent?.exploration.onSurface) descent.exploration.adapt(this.fps);
      descent?.exploration.report();
      this.options.onTelemetry({
        fromSunPc: this.camera.position.distanceTo(this.cloud.localPosition(0)),
        fromFocusPc: this.camera.position.distanceTo(this.focusPoint),
        focused: this.focused,
        focusedPlanet: this.focusedPlanet,
        focusedDeep: this.focusedDeep,
        exposureMag: this.deep.exposureMag,
        flying: !!this.flight,
        descending: !!this.descent,
        fps: this.fps,
        jd: this.jd,
      });
    }
  };

  private stepDescent(delta: number): void {
    const descent = this.descent!;
    descent.update(delta, this.jd, this.camera, this.width / this.height, this.height);
    if (descent.exploration.error) {
      descent.exploration.report();
      this.stopDescent(false);
    } else if (descent.exploration.complete) this.stopDescent();
  }

  /**
   * The main scene only holds distant things during a descent (the local scene draws the
   * ground in meters), so the near plane sits just short of the nearest drawn body.
   */
  private fitDescentClipping(): void {
    const eye = this.camera.position;
    let nearest = this.body.visible ? eye.distanceTo(this.body.position) - this.cloud.radiusPc[this.focused] : Infinity;
    for (const view of this.systems.values())
      for (const entry of view.planets)
        if (entry.mesh.visible) nearest = Math.min(nearest, eye.distanceTo(entry.local) - entry.radiusPc);
    this.camera.near = MathUtils.clamp(nearest * 0.5, 1e-20, 1e-6);
    this.camera.far = 1e4;
    this.camera.updateProjectionMatrix();
  }

  private stepFlight(now: number): void {
    const flight = this.flight!;
    const t = MathUtils.clamp((now - flight.start) / flight.duration, 0, 1);
    const s = t * t * (3 - 2 * t);
    const destination = this.focusPoint;
    // Swing round to the arrival side while closing in (normalised lerp of the two directions).
    const direction = flight.fromDirection.clone().lerp(flight.toDirection, s);
    if (direction.lengthSq() < 1e-8) direction.copy(flight.toDirection);
    direction.normalize();
    const distance = Math.exp(MathUtils.lerp(Math.log(flight.fromDistance), Math.log(flight.toDistance), s));
    this.camera.position.copy(destination).addScaledVector(direction, distance);
    // Turn toward the destination during the first third of the trip.
    const turn = MathUtils.smoothstep(t, 0, 0.35);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(flight.lookFrom.clone().lerp(destination, turn));
    this.camera.near = Math.max(1e-16, distance * 1e-3);
    this.camera.far = Math.max(1e4, distance * 10);
    this.camera.updateProjectionMatrix();
    if (t >= 1) {
      this.flight = null;
      this.controls.enabled = true;
      this.updateLimits();
      this.controls.target.copy(destination);
      this.controls.setDistance(flight.toDistance);
      this.controls.setViewDirection(direction);
      this.controls.apply();
      this.pruneSystems();
      if (this.pendingDescent) {
        this.pendingDescent = false;
        this.beginDescent();
      }
    }
  }

  private focalPx(): number {
    return this.height / (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2));
  }

  /** Resolved disk and glare for the focused star when it spans more than a pixel. */
  private updateBody(): void {
    const index = this.focused;
    const center = this.cloud.localPosition(index);
    const radius = this.cloud.radiusPc[index];
    const distance = this.camera.position.distanceTo(center);
    const diskPx = (radius / Math.max(distance, 1e-15)) * this.focalPx();
    const color = blackbodyLinearRgb(this.cloud.temperatureK[index]);
    const visible = diskPx > 0.8;
    this.body.visible = visible;
    this.glare.visible = visible;
    if (!visible) return;
    this.body.position.copy(center);
    this.body.scale.setScalar(radius);
    this.body.material.uniforms.starColor.value.setRGB(...color);
    this.glare.position.copy(center);
    this.glare.quaternion.copy(this.camera.quaternion);
    this.glare.scale.setScalar(radius * 5);
    this.glare.material.uniforms.starColor.value.setRGB(...color);
  }

  /** Focused-system planets hidden behind the star's disk or a nearer planet's disk, as seen from the camera. */
  private planetsBehindStar(): boolean[] {
    const view = this.systems.get(this.focused);
    if (!view) return [];
    const eye = this.camera.position;
    const disks = [{ center: this.cloud.localPosition(this.focused), radius: this.cloud.radiusPc[this.focused], self: -1 }];
    view.planets.forEach((entry, i) => { if (entry.mesh.visible) disks.push({ center: entry.local, radius: entry.radiusPc, self: i }); });
    const occluders = disks.map((disk) => {
      const direction = disk.center.clone().sub(eye);
      const distance = Math.max(direction.length(), 1e-18);
      return { direction: direction.divideScalar(distance), distance, angle: Math.asin(Math.min(1, disk.radius / distance)), self: disk.self };
    });
    return view.planets.map((entry, i) => {
      const toPlanet = entry.local.clone().sub(eye);
      const planetDistance = toPlanet.length();
      if (planetDistance === 0) return false;
      toPlanet.divideScalar(planetDistance);
      return occluders.some((o) => o.self !== i && planetDistance > o.distance &&
        Math.acos(MathUtils.clamp(toPlanet.dot(o.direction), -1, 1)) < o.angle);
    });
  }

  /** Spheres are drawn back to front (no depth test across 20 orders of magnitude). */
  private paintOrder(): void {
    const eye = this.camera.position;
    const bodies: { distance: number; mesh: Mesh }[] = [];
    if (this.body.visible) bodies.push({ distance: eye.distanceTo(this.body.position), mesh: this.body });
    for (const view of this.systems.values())
      for (const entry of view.planets) if (entry.mesh.visible) bodies.push({ distance: eye.distanceTo(entry.local), mesh: entry.mesh });
    bodies.sort((a, b) => b.distance - a.distance).forEach((body, rank) => { body.mesh.renderOrder = 10 + rank; });
  }

  private apparent(index: number, eye: Vector3): number {
    const p = this.cloud.localPosition(index, this.projected);
    return apparentMagnitude(this.catalog.absMag[index], p.distanceTo(eye));
  }

  /** Brightest named stars in view (planet hosts first when marked), plus the selection and focus; and the focused system's planets. */
  private chooseLabels(): void {
    const limit = this.cloud.points.material.uniforms.magnitudeLimit.value as number;
    const eye = this.camera.position;
    const markHosts = this.markers.points.visible;
    const candidates: { index: number; rank: number }[] = [];
    for (const [index] of this.catalog.names) {
      const magnitude = this.apparent(index, eye);
      const host = markHosts && this.catalog.systems.has(index);
      if (magnitude > limit - 1.5 && !(host && magnitude < limit + 8)) continue;
      this.cloud.localPosition(index, this.projected).project(this.camera);
      if (this.projected.z > 1 || Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1) continue;
      candidates.push({ index, rank: magnitude - (host ? 6 : 0) });
    }
    candidates.sort((a, b) => a.rank - b.rank);
    // Inside a planetary system on screen, background star names would bury the planet labels.
    const view = this.systems.get(this.focused);
    const system = view?.group.visible ? this.screen(this.cloud.localPosition(this.focused)) : null;
    const systemPx = system ? (view!.extentPc / Math.max(eye.distanceTo(this.cloud.localPosition(this.focused)), 1e-15)) * this.focalPx() + 24 : 0;
    const clear = candidates.filter((c) => {
      if (!system || c.index === this.focused) return true;
      const at = this.screen(this.cloud.localPosition(c.index));
      return !at || Math.hypot(at.x - system.x, at.y - system.y) > systemPx;
    });
    const chosen = new Set<number>(clear.slice(0, STAR_LABELS - 2).map((c) => c.index));
    if (this.selected !== null) chosen.add(this.selected);
    // The star we came from stays labelled while viewing our Galaxy from outside ("you are here").
    if (!this.focusedDeep || this.focusedDeep.kind === "milky-way") chosen.add(this.focused);
    this.starLabels.assign([...chosen].map((index) => ({
      key: index, text: starDisplayName(this.catalog, index), selected: index === this.selected && this.selectedPlanet === null,
      variant: this.catalog.systems.has(index) ? "has-planets" : undefined,
    })));
    const focalPx = this.focalPx();
    this.planetLabelKeys = view ? view.planets.map((_, i) => i).filter((i) =>
      i === this.focusedPlanet || (i === this.selectedPlanet && this.selected === this.focused) || view.isSpread(i, this.camera, focalPx, 14)) : [];
    this.planetLabels.assign(this.planetLabelKeys.map((i) => ({
      key: i, text: view!.planets[i].planet.name,
      selected: this.selected === this.focused && this.selectedPlanet === i,
    })));
  }

  private screen(local: Vector3): { x: number; y: number } | null {
    const forward = this.camera.getWorldDirection(new Vector3());
    if (local.clone().sub(this.camera.position).dot(forward) <= 0) return null;
    const p = this.projected.copy(local).project(this.camera);
    if (Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return null;
    return { x: ((p.x + 1) * this.width) / 2, y: ((1 - p.y) * this.height) / 2 };
  }

  /** Resolved disks (the focused star and planets) that hide what lies behind them. */
  private occluders(): { x: number; y: number; radius: number; distance: number }[] {
    const focalPx = this.focalPx();
    const eye = this.camera.position;
    const disks: { x: number; y: number; radius: number; distance: number }[] = [];
    const add = (center: Vector3, radiusPc: number) => {
      const distance = eye.distanceTo(center);
      const radius = (radiusPc / Math.max(distance, 1e-15)) * focalPx;
      const at = radius > 3 ? this.screen(center) : null;
      if (at) disks.push({ ...at, radius, distance });
    };
    if (this.body.visible) add(this.body.position, this.cloud.radiusPc[this.focused]);
    for (const view of this.systems.values()) for (const entry of view.planets) if (entry.mesh.visible) add(entry.local, entry.radiusPc);
    return disks;
  }

  private positionLabels(): void {
    const star = new Vector3();
    const disks = this.occluders();
    const eye = this.camera.position;
    const covered = (at: { x: number; y: number }, distance: number) =>
      disks.some((disk) => distance > disk.distance * 1.000001 && Math.hypot(at.x - disk.x, at.y - disk.y) < disk.radius);
    this.starLabels.place((index) => {
      const local = this.cloud.localPosition(index, star);
      const at = this.screen(local);
      return at && !covered(at, eye.distanceTo(local)) ? at : null;
    });
    const view = this.systems.get(this.focused);
    const focalPx = this.focalPx();
    this.planetLabels.place((i) => {
      const entry = view?.planets[i];
      if (!entry?.track || !view?.group.visible || this.hiddenPlanets[i]) return null;
      const at = this.screen(entry.local);
      if (!at) return null;
      // Beside a resolved disk rather than on top of it.
      const diskPx = (entry.radiusPc / Math.max(eye.distanceTo(entry.local), 1e-15)) * focalPx;
      return { x: at.x + Math.min(diskPx * 0.75, this.width * 0.3), y: at.y - Math.min(diskPx * 0.75, this.height * 0.3) };
    });
  }

  /** Nearest planet marker or disk of the focused system to a click, within a few pixels. */
  pickPlanet(clientX: number, clientY: number): number | null {
    const view = this.systems.get(this.focused);
    if (!view?.group.visible) return null;
    const bounds = this.renderManager.renderer.domElement.getBoundingClientRect();
    const x = clientX - bounds.left, y = clientY - bounds.top;
    const focalPx = this.focalPx();
    let best: number | null = null, bestDistance = Infinity;
    view.planets.forEach((entry, i) => {
      if (!entry.track || this.hiddenPlanets[i]) return;
      const at = this.screen(entry.local);
      if (!at) return;
      const diskPx = (entry.radiusPc / Math.max(this.camera.position.distanceTo(entry.local), 1e-15)) * focalPx;
      const separation = Math.hypot(at.x - x, at.y - y);
      if (separation <= Math.max(10, diskPx + 4) && separation < bestDistance) {
        bestDistance = separation;
        best = i;
      }
    });
    return best;
  }

  /** Brightness-weighted nearest star to a click, within a few pixels (marked planet hosts count as bright). */
  pickStar(clientX: number, clientY: number): number | null {
    const bounds = this.renderManager.renderer.domElement.getBoundingClientRect();
    const x = clientX - bounds.left, y = clientY - bounds.top;
    const limit = this.cloud.points.material.uniforms.magnitudeLimit.value as number;
    const markHosts = this.markers.points.visible;
    const eye = this.camera.position;
    const forward = this.camera.getWorldDirection(new Vector3());
    const local = new Vector3();
    let best: number | null = null, bestScore = Infinity;
    for (let i = 0; i < this.catalog.count; i++) {
      this.cloud.localPosition(i, local);
      if (local.clone().sub(eye).dot(forward) <= 0) continue;
      let visibility = starVisibility(apparentMagnitude(this.catalog.absMag[i], local.distanceTo(eye)), limit);
      if (markHosts && this.catalog.systems.has(i)) visibility = Math.max(visibility, 1);
      if (visibility < 0.02) continue;
      local.project(this.camera);
      const px = ((local.x + 1) * this.width) / 2, py = ((1 - local.y) * this.height) / 2;
      const separation = Math.hypot(px - x, py - y);
      const reach = 8 + 6 * Math.log10(Math.max(1, visibility));
      if (separation > reach) continue;
      const score = separation - 4 * Math.log10(visibility);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  private installPicking(canvas: HTMLCanvasElement): void {
    const options = { signal: this.abort.signal };
    let lastTap = { key: "", time: 0 };
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 0) this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, time: performance.now() };
    }, options);
    canvas.addEventListener("pointermove", (event) => {
      if (this.pointer && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 6) this.pointer.moved = true;
    }, options);
    canvas.addEventListener("pointerup", (event) => {
      const pointer = this.pointer;
      this.pointer = null;
      if (!pointer || pointer.id !== event.pointerId || pointer.moved || performance.now() - pointer.time > 650 || this.descent) return;
      const planet = this.pickPlanet(event.clientX, event.clientY);
      const index = planet !== null ? this.focused : this.pickStar(event.clientX, event.clientY);
      const now = performance.now();
      if (index === null) {
        const bounds = canvas.getBoundingClientRect();
        const ref = this.deep.pick(event.clientX - bounds.left, event.clientY - bounds.top, this.camera, this.width, this.height, this.focalPx());
        if (!ref) return;
        this.options.onSelectDeep?.(ref);
        const key = `deep:${ref.kind}:${ref.index}`;
        if (lastTap.key === key && now - lastTap.time < 400) this.flyToDeep(ref);
        lastTap = { key, time: now };
        return;
      }
      this.options.onSelect(index, planet);
      const key = `${index}:${planet ?? ""}`;
      // Double-click or double-tap flies there.
      if (lastTap.key === key && now - lastTap.time < 400) this.flyTo(index, planet);
      lastTap = { key, time: now };
    }, options);
  }

  private resize(): void {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderManager.resize(this.width, this.height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.descent?.dispose();
    this.descent = null;
    this.abort.abort();
    this.observer.disconnect();
    this.controls.dispose();
    this.cloud.dispose();
    this.markers.dispose();
    for (const view of this.systems.values()) view.dispose();
    this.systems.clear();
    this.planetSphere.dispose();
    this.deepSky.dispose();
    this.deep.dispose();
    this.body.geometry.dispose();
    this.body.material.dispose();
    this.glare.geometry.dispose();
    this.glare.material.dispose();
    this.labelRoot.remove();
    this.renderManager.dispose();
    this.scene.clear();
  }
}
