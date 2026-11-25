import { ACESFilmicToneMapping, AmbientLight, DirectionalLight, Euler, Group, HemisphereLight, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Quality } from "../../types/celestial";
import { disposeStationObject, loadStationExterior, loadStationInterior } from "./StationAssets";
import { moveInStation, stationModules, stationPoint, type StationModuleId } from "./StationLayout";
import { StationBackdrop } from "./StationBackdrop";
import { nearestDaylightPass, STATION_ORBIT_PERIOD_SECONDS, StationOrbitModel } from "./StationOrbit";
import { stationRegions } from "../../data/stationRegions";

export type StationMode = "exterior" | "interior";
export interface StationState {
  mode: StationMode;
  status: "loading" | "ready" | "error";
  message: string;
  moduleId: StationModuleId;
  orbit: StationOrbitTelemetry;
}
export interface StationOrbitTelemetry {
  playing: boolean;
  speed: number;
  elapsedSeconds: number;
  progress: number;
  latitudeDeg: number;
  longitudeDeg: number;
  sunAltitudeDeg: number;
}
export type StationMotion = "forward" | "back" | "left" | "right" | "up" | "down";
const keys: Record<string, StationMotion> = { KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyE: "up", KeyQ: "down" };

/** Meter-scale station viewer. React receives discrete mode/load/location changes only. */
export class StationEngine {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(55, 1, 0.04, 1500);
  private readonly scene = new Scene();
  private readonly controls: OrbitControls;
  private readonly backdrop: StationBackdrop;
  private readonly orbit = new StationOrbitModel();
  private orbitSeconds = 0;
  private orbitSpeed = 60;
  private orbitPlaying = true;
  private orbitReportTime = 0;
  private readonly stationSunlight = new DirectionalLight("#fff7e9", 3.5);
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly exteriorLight = new Group();
  private readonly interiorLight = new Group();
  private readonly sunLabel: HTMLDivElement;
  private readonly skyDirection = new Vector3();
  private readonly inverseCamera = new Quaternion();
  private exterior: Group | null = null;
  private interior: Group | null = null;
  private interiorRequest: Promise<Group> | null = null;
  private state: StationState = { mode: "exterior", status: "loading", message: "Loading NASA station model…", moduleId: "node_1", orbit: {
    playing: true, speed: 60, elapsedSeconds: 0, progress: 0, latitudeDeg: 0, longitudeDeg: 20, sunAltitudeDeg: 45,
  } };
  private readonly held = new Set<StationMotion>();
  private readonly keyboard = new Set<StationMotion>();
  private yaw = -Math.PI / 2;
  private pitch = 0;
  private pointer: { id: number; x: number; y: number } | null = null;
  private frame = 0;
  private lastTime = 0;
  private locationTime = 0;
  private command = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement, quality: Quality, private readonly onState: (state: StationState) => void) {
    this.renderer = new WebGLRenderer({ antialias: quality !== "low", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "low" ? 1 : quality === "high" ? 2 : 1.5));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.autoClear = false;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "3D ISS viewport. Drag to look. Inside, use W A S D or arrows to float, Q and E to move down and up.");
    container.append(canvas);
    this.sunLabel = document.createElement("div");
    this.sunLabel.className = "station-sun-label";
    this.sunLabel.textContent = "SUN · 0.53°";
    this.sunLabel.setAttribute("aria-hidden", "true");
    container.append(this.sunLabel);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 65;
    this.controls.maxDistance = 350;
    this.exteriorLight.add(this.stationSunlight, new HemisphereLight("#c4d8f0", "#405f87", 1.7));
    this.interiorLight.add(new AmbientLight("#ffffff", 1.8));
    this.interiorLight.visible = false;
    this.scene.add(this.exteriorLight, this.interiorLight);
    this.backdrop = new StationBackdrop(quality, this.renderer.capabilities.maxTextureSize);
    this.syncOrbit();
    this.resetExterior();
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clearMotion);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize(); this.publish({});
    void loadStationExterior(this.abort.signal).then((model) => {
      if (this.disposed) { disposeStationObject(model); return; }
      this.exterior = model; this.scene.add(model);
      model.visible = this.state.mode === "exterior";
      if (this.state.mode === "exterior") this.publish({ status: "ready", message: "NASA exterior model · drag to orbit · scroll to approach" });
    }).catch((error: unknown) => { if (!this.disposed && this.state.mode === "exterior") this.fail(error); });
    this.frame = requestAnimationFrame(this.animate);
  }
  private publish(patch: Partial<StationState>): void {
    this.state = { ...this.state, ...patch }; this.onState(this.state);
  }
  private fail(error: unknown): void { this.publish({ status: "error", message: error instanceof Error ? error.message : "Station model could not be loaded." }); }
  private orbitTelemetry(): StationOrbitTelemetry {
    const sample = this.orbit.snapshot;
    return {
      playing: this.orbitPlaying, speed: this.orbitSpeed, elapsedSeconds: this.orbitSeconds,
      progress: sample.progress, latitudeDeg: sample.latitudeDeg, longitudeDeg: sample.longitudeDeg,
      sunAltitudeDeg: Math.asin(sample.sunDirection.y) * 180 / Math.PI,
    };
  }
  private syncOrbit(): void {
    const sample = this.orbit.sample(this.orbitSeconds);
    this.backdrop.setOrbit(sample);
    this.stationSunlight.position.copy(sample.sunDirection).multiplyScalar(180);
    // Earth occults the Sun below roughly -20° apparent altitude at 400 km.
    this.stationSunlight.intensity = 3.5 * Math.max(0, Math.min(1, (sample.sunDirection.y + 0.34) / 0.06));
  }
  setOrbitPlaying(playing: boolean): void { this.orbitPlaying = playing; this.publish({ orbit: this.orbitTelemetry() }); }
  setOrbitSpeed(speed: number): void {
    if (![1, 60, 300, 1200].includes(speed)) return;
    this.orbitSpeed = speed; this.publish({ orbit: this.orbitTelemetry() });
  }
  setOrbitProgress(progress: number): void {
    if (!Number.isFinite(progress)) return;
    const revolution = Math.floor(this.orbitSeconds / STATION_ORBIT_PERIOD_SECONDS);
    this.orbitSeconds = (revolution + Math.max(0, Math.min(1, progress))) * STATION_ORBIT_PERIOD_SECONDS;
    this.syncOrbit(); this.publish({ orbit: this.orbitTelemetry() });
  }
  skipOrbit(count: number): void {
    this.orbitSeconds += Math.sign(count) * STATION_ORBIT_PERIOD_SECONDS;
    this.syncOrbit(); this.publish({ orbit: this.orbitTelemetry() });
  }
  jumpToRegion(id: string): void {
    const region = stationRegions.find((item) => item.id === id);
    if (!region) return;
    this.orbitSeconds = nearestDaylightPass(this.orbit, this.orbitSeconds, region);
    this.syncOrbit(); this.publish({ orbit: this.orbitTelemetry() });
  }
  async showInterior(id: StationModuleId = "node_1"): Promise<void> {
    const request = ++this.command;
    this.clearMotion();
    this.publish({ mode: "interior", status: "loading", message: "Preparing NASA interior models…" });
    this.controls.enabled = false;
    try {
      if (!this.interior) {
        this.interiorRequest ??= loadStationInterior(this.abort.signal, (message) => {
          if (!this.disposed && this.state.mode === "interior") this.publish({ message });
        });
        const interior = await this.interiorRequest;
        if (this.disposed) { disposeStationObject(interior); return; }
        if (!this.interior) { this.interior = interior; interior.visible = false; this.scene.add(interior); }
      }
      if (this.disposed || request !== this.command) return;
      this.interior.visible = true;
      if (this.exterior) this.exterior.visible = false;
      this.interiorLight.visible = true; this.exteriorLight.visible = false;
      this.camera.fov = 68; this.camera.updateProjectionMatrix();
      this.visitModule(id);
      this.publish({ status: "ready", message: "NASA Astrobee interior · reconstructed configuration" });
    } catch (error) {
      this.interiorRequest = null;
      if (!this.disposed && request === this.command) this.fail(error);
    }
  }
  showExterior(): void {
    ++this.command; this.clearMotion();
    if (this.interior) this.interior.visible = false;
    if (this.exterior) this.exterior.visible = true;
    this.interiorLight.visible = false; this.exteriorLight.visible = true;
    this.controls.enabled = true;
    this.resetExterior();
    this.publish({ mode: "exterior", status: this.exterior ? "ready" : "loading", message: this.exterior ? "NASA exterior model · drag to orbit · scroll to approach" : "Loading NASA station model…" });
  }
  resetExterior(): void {
    this.camera.fov = 55; this.camera.updateProjectionMatrix();
    this.camera.position.set(115, 65, 115);
    this.controls.target.set(0, 0, 0); this.controls.update();
  }
  exteriorView(view: "front" | "arrays" | "earth" | "sun"): void {
    if (this.state.mode !== "exterior") return;
    if (view === "sun") {
      // Offset the station so its truss does not cover the Sun in this preset.
      const sun = this.orbit.snapshot.sunDirection;
      const lateral = new Vector3().crossVectors(sun, new Vector3(0, 1, 0)).normalize();
      this.camera.position.copy(sun).multiplyScalar(-135).addScaledVector(lateral, 55);
    }
    else {
      const positions = { front: [0, 16, 125], arrays: [100, 120, 0], earth: [50, 90, 105] } as const;
      const point = positions[view];
      this.camera.position.set(point[0], point[1], point[2]);
    }
    this.controls.update();
  }
  visitModule(id: StationModuleId): void {
    if (!this.interior || this.state.mode !== "interior") return;
    const module = stationModules.find((item) => item.id === id);
    if (!module) return;
    this.clearMotion();
    this.camera.position.copy(stationPoint(...module.viewpoint));
    const direction = new Vector3(module.look[0], -module.look[2], module.look[1]).normalize();
    this.pitch = Math.asin(direction.y);
    this.yaw = Math.atan2(-direction.x, -direction.z);
    this.camera.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0, "YXZ"));
    this.publish({ moduleId: id });
    this.renderer.domElement.focus({ preventScroll: true });
  }
  setMotion(motion: StationMotion, active: boolean): void { if (active) this.held.add(motion); else this.held.delete(motion); }
  private clearMotion = (): void => { this.held.clear(); this.keyboard.clear(); this.pointer = null; };
  private visibilityChanged = (): void => { this.clearMotion(); this.lastTime = 0; };
  private keyDown = (event: KeyboardEvent): void => {
    if (this.state.mode !== "interior" || event.ctrlKey || event.metaKey || event.altKey) return;
    const motion = keys[event.code];
    if (motion) { event.preventDefault(); this.keyboard.add(motion); }
  };
  private keyUp = (event: KeyboardEvent): void => { const motion = keys[event.code]; if (motion) this.keyboard.delete(motion); };
  private pointerDown = (event: PointerEvent): void => {
    this.renderer.domElement.focus({ preventScroll: true });
    if (this.state.mode !== "interior" || event.button !== 0) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent): void => {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    this.yaw -= (event.clientX - this.pointer.x) * 0.003;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - (event.clientY - this.pointer.y) * 0.003));
    this.pointer.x = event.clientX; this.pointer.y = event.clientY;
  };
  private pointerUp = (event: PointerEvent): void => { if (this.pointer?.id === event.pointerId) this.pointer = null; };
  private resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.renderer.setSize(Math.max(1, width), Math.max(1, height));
    this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
  };
  private animate = (time: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0;
    const orbitDt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 1) : 0;
    this.lastTime = time;
    if (this.orbitPlaying) this.orbitSeconds += orbitDt * this.orbitSpeed;
    this.syncOrbit();
    if (time - this.orbitReportTime > 500) { this.orbitReportTime = time; this.publish({ orbit: this.orbitTelemetry() }); }
    if (this.state.mode === "interior" && this.state.status === "ready") {
      this.camera.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0, "YXZ"));
      const held = (motion: StationMotion) => Number(this.held.has(motion) || this.keyboard.has(motion));
      const movement = new Vector3(held("right") - held("left"), held("up") - held("down"), held("back") - held("forward"));
      if (movement.lengthSq()) {
        movement.normalize().applyQuaternion(this.camera.quaternion).multiplyScalar(dt * 1.15);
        moveInStation(this.camera.position, movement);
      }
      if (time - this.locationTime > 500) {
        this.locationTime = time;
        const closest = stationModules.reduce((best, module) => this.camera.position.distanceToSquared(stationPoint(...module.viewpoint)) < this.camera.position.distanceToSquared(stationPoint(...best.viewpoint)) ? module : best);
        if (closest.id !== this.state.moduleId) this.publish({ moduleId: closest.id });
      }
    } else if (this.state.mode === "exterior") this.controls.update();
    this.updateSunLabel();
    this.renderer.clear();
    this.backdrop.render(this.renderer, this.camera);
    this.renderer.render(this.scene, this.camera);
  };
  private updateSunLabel(): void {
    if (this.state.mode !== "exterior") { this.sunLabel.hidden = true; return; }
    this.inverseCamera.copy(this.camera.quaternion).invert();
    const sun = this.orbit.snapshot.sunDirection;
    if (sun.y < -0.34) { this.sunLabel.hidden = true; return; }
    this.skyDirection.copy(sun).applyQuaternion(this.inverseCamera);
    const direction = this.skyDirection;
    if (direction.z >= 0) { this.sunLabel.hidden = true; return; }
    const halfHeight = Math.tan(this.camera.fov * Math.PI / 360);
    const x = (direction.x / -direction.z) / (halfHeight * this.camera.aspect);
    const y = (direction.y / -direction.z) / halfHeight;
    this.sunLabel.hidden = Math.abs(x) > 0.93 || Math.abs(y) > 0.9;
    this.sunLabel.style.left = `${(x + 1) * 50}%`;
    this.sunLabel.style.top = `${(1 - y) * 50}%`;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; ++this.command;
    this.abort.abort(); cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.clearMotion(); this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointercancel", this.pointerUp);
    canvas.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.clearMotion);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    if (this.exterior) disposeStationObject(this.exterior);
    if (this.interior) disposeStationObject(this.interior);
    this.backdrop.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); canvas.remove(); this.sunLabel.remove();
  }
}
