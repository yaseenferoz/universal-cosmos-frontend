import {
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import type { HeightSample } from "../../types/terrain";
import {
  cartesianToGeodetic,
  geodeticToCartesian,
} from "../terrain/coordinates";

export type LunarNavigationPhase =
  | "inactive"
  | "approach"
  | "descending"
  | "surface"
  | "ascending";

export interface LunarPose {
  positionM: Vector3;
  forward: Vector3;
  up: Vector3;
}

export interface LunarNavigationOptions {
  radiusM: number;
  reconstruction?: boolean;
  /** Atmospheric sessions maintain altitude above a reference radius and have no ground. */
  hoverHeightM?: number;
  eyeHeightM?: number;
  /** The rendered triangle may be above the sampled DEM during a LOD change. */
  surfaceHeightAt?: (latDeg: number, lonDeg: number) => number | null;
}

export interface LunarNavigationTelemetry {
  phase: LunarNavigationPhase;
  latDeg: number;
  lonDeg: number;
  elevationM: number;
  altitudeM: number;
  eyeHeightM: number;
  resolutionM: number;
  sourceId: string;
  coverageNotice: string | null;
}

const UP = new Vector3(0, 1, 0);
const ZERO = new Vector3();
const APPROACH_SECONDS = 4;
const DESCENT_SECONDS = 10;
const ASCENT_SECONDS = 8;
const APPROACH_ALTITUDE_M = 120_000;
const MAX_WALK_RESOLUTION_M = 5;
const movementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

function eased(progress: number): number {
  return MathUtils.smoothstep(MathUtils.clamp(progress, 0, 1), 0, 1);
}

/** A radial path cannot cut through the sphere as a Cartesian chord can. */
export function interpolateRadialDirection(
  start: Vector3,
  end: Vector3,
  progress: number,
): Vector3 {
  const from = start.clone().normalize();
  const rotation = new Quaternion().setFromUnitVectors(
    from,
    end.clone().normalize(),
  );
  return from
    .applyQuaternion(new Quaternion().slerp(rotation, progress))
    .normalize();
}

function logarithmicHeight(
  start: number,
  end: number,
  progress: number,
): number {
  // The offset keeps the final meters smooth instead of an asymptotic crawl.
  return (
    Math.exp(
      MathUtils.lerp(Math.log(start + 200), Math.log(end + 200), progress),
    ) - 200
  );
}

function orientation(forward: Vector3, up: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(ZERO, forward, up),
  );
}

/**
 * Moon-fixed CPU meters. The GPU camera stays at zero; terrain subtracts positionM.
 * Input and flight are independent of the existing Solar System OrbitControls.
 */
export class LunarNavigationController {
  readonly camera = new PerspectiveCamera(38, 1, 0.05, 10_000_000);
  readonly positionM = new Vector3();
  private currentPhase: LunarNavigationPhase = "inactive";
  private readonly abort = new AbortController();
  private readonly keys = new Set<string>();
  private readonly savedPosition = new Vector3();
  private readonly savedOrientation = new Quaternion();
  private readonly ascentPosition = new Vector3();
  private readonly ascentOrientation = new Quaternion();
  private site = { latDeg: 0, lonDeg: 0 };
  private readonly siteDirection = new Vector3(1, 0, 0);
  private elapsed = 0;
  private heading = 0;
  private pitch = MathUtils.degToRad(6);
  private moveForward = 0;
  private moveRight = 0;
  private eyeHeightM: number;
  private coverageNotice: string | null = null;
  private drag: { id: number; x: number; y: number } | null = null;
  private disposed = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly sampleHeight: (
      latDeg: number,
      lonDeg: number,
    ) => HeightSample,
    private readonly options: LunarNavigationOptions,
  ) {
    this.eyeHeightM = options.hoverHeightM ?? MathUtils.clamp(options.eyeHeightM ?? 1.7, 0.5, 3);
    const listenerOptions = { signal: this.abort.signal };
    element.addEventListener(
      "keydown",
      (event) => {
        if (this.currentPhase !== "surface" || !movementKeys.has(event.code))
          return;
        event.preventDefault();
        this.keys.add(event.code);
      },
      listenerOptions,
    );
    window.addEventListener(
      "keyup",
      (event) => this.keys.delete(event.code),
      listenerOptions,
    );
    window.addEventListener("blur", () => this.release(), listenerOptions);
    element.addEventListener("blur", () => this.release(), listenerOptions);
    document.addEventListener(
      "visibilitychange",
      () => this.release(),
      listenerOptions,
    );
    element.addEventListener(
      "pointerdown",
      (event) => {
        if (this.currentPhase !== "surface" || event.button !== 0 || this.drag)
          return;
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        element.setPointerCapture?.(event.pointerId);
        element.focus({ preventScroll: true });
      },
      listenerOptions,
    );
    element.addEventListener(
      "pointermove",
      (event) => {
        if (
          this.currentPhase !== "surface" ||
          this.drag?.id !== event.pointerId
        )
          return;
        this.heading += (event.clientX - this.drag.x) * 0.003;
        this.pitch = MathUtils.clamp(
          this.pitch - (event.clientY - this.drag.y) * 0.003,
          MathUtils.degToRad(-85),
          MathUtils.degToRad(85),
        );
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
      },
      listenerOptions,
    );
    const endPointer = (event: PointerEvent) => {
      if (this.drag?.id === event.pointerId) this.releasePointer();
    };
    element.addEventListener("pointerup", endPointer, listenerOptions);
    element.addEventListener("pointercancel", endPointer, listenerOptions);
    element.addEventListener("lostpointercapture", endPointer, listenerOptions);
  }

  get active(): boolean {
    return this.currentPhase !== "inactive";
  }
  get phase(): LunarNavigationPhase {
    return this.currentPhase;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = Math.max(0.1, Number.isFinite(aspect) ? aspect : 1);
    this.camera.updateProjectionMatrix();
  }

  enter(pose: LunarPose, site: { latDeg: number; lonDeg: number }): boolean {
    if (this.disposed) return false;
    const height = this.sampleHeight(site.latDeg, site.lonDeg);
    if (!this.canWalk(height)) {
      this.coverageNotice =
        "Measured 5 m landing terrain is not ready. Retry after loading.";
      return false;
    }
    this.release();
    this.site = { ...site };
    this.siteDirection
      .copy(
        geodeticToCartesian(site.latDeg, site.lonDeg, 0, this.options.radiusM),
      )
      .normalize();
    this.savedPosition.copy(pose.positionM);
    this.savedOrientation.copy(orientation(pose.forward, pose.up));
    this.positionM.copy(pose.positionM);
    this.camera.quaternion.copy(this.savedOrientation);
    this.heading = 0;
    this.pitch = MathUtils.degToRad(6);
    this.elapsed = 0;
    this.coverageNotice = null;
    this.currentPhase = "approach";
    this.updateCamera();
    return true;
  }

  returnToOrbit(): void {
    if (!this.active || this.currentPhase === "ascending") return;
    this.release();
    this.ascentPosition.copy(this.positionM);
    this.ascentOrientation.copy(this.camera.quaternion);
    this.elapsed = 0;
    this.coverageNotice = null;
    this.currentPhase = "ascending";
  }

  setMoveInput(forward: number, right: number): void {
    this.moveForward = Number.isFinite(forward)
      ? MathUtils.clamp(forward, -1, 1)
      : 0;
    this.moveRight = Number.isFinite(right) ? MathUtils.clamp(right, -1, 1) : 0;
  }

  setEyeHeight(meters: number): void {
    if (this.options.hoverHeightM !== undefined) return;
    if (!Number.isFinite(meters)) return;
    this.eyeHeightM = MathUtils.clamp(meters, 0.5, 3);
    if (this.currentPhase === "surface") this.updateSurface(0);
  }

  update(deltaSeconds: number): void {
    if (!this.active || this.disposed || !Number.isFinite(deltaSeconds)) return;
    const delta = MathUtils.clamp(deltaSeconds, 0, 0.1);
    if (this.currentPhase === "surface") this.updateSurface(delta);
    else if (this.currentPhase === "ascending") this.updateAscent(delta);
    else this.updateDescent(delta);
    this.updateCamera();
  }

  /** Recheck a freshly refined mesh without consuming flight time or input twice. */
  resolveTerrainCollision(): void {
    if (
      this.disposed ||
      (this.currentPhase !== "surface" && this.currentPhase !== "descending")
    )
      return;
    const coordinate = cartesianToGeodetic(
      this.positionM,
      this.options.radiusM,
    );
    const sample = this.sampleHeight(coordinate.latDeg, coordinate.lonDeg);
    if (!this.canWalk(sample)) return;
    const minimum =
      this.options.radiusM +
      this.collisionHeight(coordinate.latDeg, coordinate.lonDeg, sample) +
      this.eyeHeightM;
    if (this.positionM.length() >= minimum) return;
    this.positionM.setLength(minimum);
    this.updateCamera();
  }

  private updateDescent(delta: number): void {
    const sample = this.sampleHeight(this.site.latDeg, this.site.lonDeg);
    if (!this.canWalk(sample)) {
      this.coverageNotice =
        "Landing terrain is unavailable. Descent is holding; return to orbit or retry.";
      return;
    }
    this.coverageNotice = null;
    this.elapsed += delta;
    const surfaceRadius =
      this.options.radiusM +
      this.collisionHeight(this.site.latDeg, this.site.lonDeg, sample);
    if (this.currentPhase === "approach") {
      const progress = eased(this.elapsed / APPROACH_SECONDS);
      const direction = interpolateRadialDirection(
        this.savedPosition,
        this.siteDirection,
        progress,
      );
      const startHeight = Math.max(
        this.savedPosition.length() - surfaceRadius,
        this.eyeHeightM,
      );
      const altitude = logarithmicHeight(
        startHeight,
        APPROACH_ALTITUDE_M,
        progress,
      );
      this.positionM.copy(direction).multiplyScalar(surfaceRadius + altitude);
      const flightOrientation = this.groundOrientation(
        direction,
        MathUtils.degToRad(-60),
      );
      this.camera.quaternion
        .copy(this.savedOrientation)
        .slerp(flightOrientation, progress);
      if (this.elapsed >= APPROACH_SECONDS) {
        this.currentPhase = "descending";
        this.elapsed = 0;
      }
    } else {
      const progress = eased(this.elapsed / DESCENT_SECONDS);
      const altitude = logarithmicHeight(
        APPROACH_ALTITUDE_M,
        this.eyeHeightM,
        progress,
      );
      this.positionM
        .copy(this.siteDirection)
        .multiplyScalar(surfaceRadius + altitude);
      this.camera.quaternion.copy(
        this.groundOrientation(
          this.siteDirection,
          MathUtils.lerp(MathUtils.degToRad(-60), this.pitch, progress),
        ),
      );
      if (this.elapsed >= DESCENT_SECONDS) {
        this.currentPhase = "surface";
        this.elapsed = 0;
        this.updateSurface(0);
      }
    }
  }

  private updateAscent(delta: number): void {
    this.elapsed += delta;
    const progress = MathUtils.clamp(this.elapsed / ASCENT_SECONDS, 0, 1);
    const angleProgress = eased((progress - 0.5) * 2);
    const direction = interpolateRadialDirection(
      this.ascentPosition,
      this.savedPosition,
      angleProgress,
    );
    const startRadius = this.ascentPosition.length();
    const transferRadius = Math.max(
      this.options.radiusM + APPROACH_ALTITUDE_M,
      startRadius,
    );
    const startCoordinate = cartesianToGeodetic(
      this.ascentPosition,
      this.options.radiusM,
    );
    const startGround = this.sampleHeight(
      startCoordinate.latDeg,
      startCoordinate.lonDeg,
    );
    const baseRadius =
      this.options.radiusM + (startGround.available ? startGround.heightM : 0);
    const radius =
      progress <= 0.5
        ? baseRadius +
          logarithmicHeight(
            Math.max(this.eyeHeightM, startRadius - baseRadius),
            transferRadius - baseRadius,
            eased(progress * 2),
          )
        : baseRadius +
          logarithmicHeight(
            transferRadius - baseRadius,
            Math.max(this.eyeHeightM, this.savedPosition.length() - baseRadius),
            angleProgress,
          );
    this.positionM.copy(direction).multiplyScalar(radius);
    this.camera.quaternion
      .copy(this.ascentOrientation)
      .slerp(this.savedOrientation, eased(progress));
    if (progress >= 1) {
      this.positionM.copy(this.savedPosition);
      this.camera.quaternion.copy(this.savedOrientation);
      this.currentPhase = "inactive";
    }
  }

  private updateSurface(delta: number): void {
    const turn = delta * 1.1;
    if (this.keys.has("ArrowLeft")) this.heading -= turn;
    if (this.keys.has("ArrowRight")) this.heading += turn;
    if (this.keys.has("ArrowUp")) this.pitch += turn;
    if (this.keys.has("ArrowDown")) this.pitch -= turn;
    this.pitch = MathUtils.clamp(
      this.pitch,
      MathUtils.degToRad(-85),
      MathUtils.degToRad(85),
    );
    const coordinate = cartesianToGeodetic(
      this.positionM,
      this.options.radiusM,
    );
    const basis = this.tangentBasis(coordinate.latDeg, coordinate.lonDeg);
    const forward = basis.north
      .clone()
      .multiplyScalar(Math.cos(this.heading))
      .addScaledVector(basis.east, Math.sin(this.heading));
    const right = basis.east
      .clone()
      .multiplyScalar(Math.cos(this.heading))
      .addScaledVector(basis.north, -Math.sin(this.heading));
    let forwardInput =
      this.moveForward +
      Number(this.keys.has("KeyW")) -
      Number(this.keys.has("KeyS"));
    let rightInput =
      this.moveRight +
      Number(this.keys.has("KeyD")) -
      Number(this.keys.has("KeyA"));
    const magnitude = Math.max(1, Math.hypot(forwardInput, rightInput));
    forwardInput /= magnitude;
    rightInput /= magnitude;
    const speed = (this.options.hoverHeightM !== undefined ? 500 : 1) *
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 10 : 2);
    const candidate = this.positionM
      .clone()
      .addScaledVector(forward, forwardInput * speed * delta)
      .addScaledVector(right, rightInput * speed * delta);
    const next = cartesianToGeodetic(candidate, this.options.radiusM);
    const sample = this.sampleHeight(next.latDeg, next.lonDeg);
    if (this.canWalk(sample)) {
      candidate.setLength(
        this.options.radiusM +
          this.collisionHeight(next.latDeg, next.lonDeg, sample) +
          this.eyeHeightM,
      );
      this.positionM.copy(candidate);
      this.coverageNotice = null;
    } else {
      this.coverageNotice =
        "Edge of measured 5 m terrain. Turn back toward the landing region.";
    }
    this.camera.quaternion.copy(
      this.groundOrientation(this.positionM.clone().normalize(), this.pitch),
    );
  }

  private canWalk(sample: HeightSample): boolean {
    return (
      sample.available &&
      Number.isFinite(sample.heightM) &&
      sample.resolutionM > 0 &&
      (this.options.reconstruction || sample.resolutionM <= MAX_WALK_RESOLUTION_M)
    );
  }

  private collisionHeight(
    latDeg: number,
    lonDeg: number,
    sample: HeightSample,
  ): number {
    const rendered = this.options.surfaceHeightAt?.(latDeg, lonDeg);
    return rendered !== null &&
      rendered !== undefined &&
      Number.isFinite(rendered)
      ? Math.max(rendered, sample.heightM)
      : sample.heightM;
  }

  private tangentBasis(
    latDeg: number,
    lonDeg: number,
  ): { north: Vector3; east: Vector3 } {
    const latitude = MathUtils.degToRad(latDeg),
      longitude = MathUtils.degToRad(lonDeg);
    return {
      north: new Vector3(
        -Math.sin(latitude) * Math.cos(longitude),
        Math.cos(latitude),
        Math.sin(latitude) * Math.sin(longitude),
      ),
      east: new Vector3(-Math.sin(longitude), 0, -Math.cos(longitude)),
    };
  }

  private groundOrientation(up: Vector3, pitch: number): Quaternion {
    const coordinate = cartesianToGeodetic(up, 0);
    const basis = this.tangentBasis(coordinate.latDeg, coordinate.lonDeg);
    const forward = basis.north
      .multiplyScalar(Math.cos(this.heading))
      .addScaledVector(basis.east, Math.sin(this.heading));
    forward
      .multiplyScalar(Math.cos(pitch))
      .addScaledVector(up, Math.sin(pitch));
    return orientation(forward, up);
  }

  private updateCamera(): void {
    const coordinate = cartesianToGeodetic(
      this.positionM,
      this.options.radiusM,
    );
    const height = this.sampleHeight(coordinate.latDeg, coordinate.lonDeg);
    const altitude = Math.max(
      0,
      coordinate.heightM - (height.available ? height.heightM : 0),
    );
    this.camera.position.set(0, 0, 0);
    this.camera.up.copy(this.positionM).normalize();
    this.camera.near = Math.max(0.05, Math.min(1000, altitude * 0.0001));
    this.camera.far = Math.max(
      100_000,
      altitude +
        Math.sqrt(altitude * (altitude + 2 * this.options.radiusM)) +
        30_000,
    );
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  getPose(): LunarPose {
    return {
      positionM: this.positionM.clone(),
      forward: this.camera.getWorldDirection(new Vector3()),
      up: UP.clone().applyQuaternion(this.camera.quaternion),
    };
  }

  getTelemetry(): LunarNavigationTelemetry {
    const coordinate = cartesianToGeodetic(
      this.positionM,
      this.options.radiusM,
    );
    const sample = this.sampleHeight(coordinate.latDeg, coordinate.lonDeg);
    return {
      phase: this.currentPhase,
      latDeg: coordinate.latDeg,
      lonDeg: coordinate.lonDeg,
      elevationM: sample.heightM,
      altitudeM: coordinate.heightM - (sample.available ? sample.heightM : 0),
      eyeHeightM: this.eyeHeightM,
      resolutionM: sample.resolutionM,
      sourceId: sample.sourceId,
      coverageNotice: this.coverageNotice,
    };
  }

  private releasePointer(): void {
    const pointerId = this.drag?.id;
    this.drag = null;
    if (pointerId !== undefined && this.element.hasPointerCapture?.(pointerId))
      this.element.releasePointerCapture(pointerId);
  }

  release(): void {
    this.keys.clear();
    this.moveForward = 0;
    this.moveRight = 0;
    this.releasePointer();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    this.abort.abort();
    this.currentPhase = "inactive";
  }
}
