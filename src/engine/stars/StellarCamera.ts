import { MathUtils, PerspectiveCamera, Vector3 } from "three";

/** Pointer travel (CSS px) that turns a press into a drag. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * Orbit around a target with logarithmic zoom, for distances from a few stellar radii
 * (~1e-7 pc) to kiloparsecs. Pointer drag rotates, wheel/pinch and +/− keys zoom, arrow
 * keys rotate. Motion is damped; the engine calls update() every frame.
 */
export class StellarCamera {
  readonly target = new Vector3();
  distance = 2;
  yaw = 0.6;
  pitch = 0.25;
  minDistance = 1e-9;
  maxDistance = 5000;
  enabled = true;
  /** Goals that input moves; the camera eases toward them (frame-rate independent). */
  private goalYaw = this.yaw;
  private goalPitch = this.pitch;
  private goalLogDistance = Math.log(this.distance);
  private readonly pointers = new Map<number, { x: number; y: number; startX: number; startY: number; captured: boolean }>();
  private pinch = 0;
  private readonly abort = new AbortController();

  constructor(readonly camera: PerspectiveCamera, readonly element: HTMLElement) {
    const options = { signal: this.abort.signal };
    element.addEventListener("pointerdown", (event) => {
      if (!this.enabled) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, captured: false });
      this.pinch = this.pinchDistance();
    }, options);
    element.addEventListener("pointermove", (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous || !this.enabled) return;
      // Capture only once this is a drag: capturing on pointerdown would retarget the
      // pointerup/click of a plain click to the container, so stars and labels could not be picked.
      if (!previous.captured) {
        // Click jitter neither turns the view nor shifts the star under the cursor. Once past
        // the threshold, the whole movement since pointerdown applies.
        if (Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) <= DRAG_THRESHOLD_PX) return;
        previous.captured = true;
        element.setPointerCapture?.(event.pointerId);
      }
      if (this.pointers.size === 1) {
        // A full-height drag turns the view by about 150 degrees.
        const scale = 2.6 / Math.max(1, element.clientHeight);
        this.goalYaw -= (event.clientX - previous.x) * scale;
        this.goalPitch = MathUtils.clamp(this.goalPitch + (event.clientY - previous.y) * scale, -1.55, 1.55);
      }
      previous.x = event.clientX;
      previous.y = event.clientY;
      if (this.pointers.size === 2) {
        const pinch = this.pinchDistance();
        if (this.pinch > 0 && pinch > 0) this.zoomBy(Math.log(this.pinch / pinch) * 1.5);
        this.pinch = pinch;
      }
    }, options);
    const release = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      this.pinch = this.pinchDistance();
    };
    element.addEventListener("pointerup", release, options);
    element.addEventListener("pointercancel", release, options);
    element.addEventListener("wheel", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      const delta = MathUtils.clamp(event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY, -240, 240);
      // 1.5× per 100-pixel wheel notch: a star's surface to kiloparsecs in about fifty notches.
      this.zoomBy((delta / 100) * Math.log(1.5));
    }, { ...options, passive: false });
    element.addEventListener("keydown", (event) => {
      if (!this.enabled) return;
      const step = 0.06;
      if (event.key === "ArrowLeft") this.goalYaw += step * 2;
      else if (event.key === "ArrowRight") this.goalYaw -= step * 2;
      else if (event.key === "ArrowUp") this.goalPitch = MathUtils.clamp(this.goalPitch + step * 2, -1.55, 1.55);
      else if (event.key === "ArrowDown") this.goalPitch = MathUtils.clamp(this.goalPitch - step * 2, -1.55, 1.55);
      else if (event.key === "+" || event.key === "=" || event.key === "PageUp") this.zoomBy(-Math.log(1.5));
      else if (event.key === "-" || event.key === "_" || event.key === "PageDown") this.zoomBy(Math.log(1.5));
      else return;
      event.preventDefault();
    }, options);
  }

  /** Change the goal distance by a factor e^logFactor, within the limits. */
  zoomBy(logFactor: number): void {
    this.goalLogDistance = MathUtils.clamp(this.goalLogDistance + logFactor, Math.log(this.minDistance), Math.log(this.maxDistance));
  }

  /** Jump to a distance (and keep it as the goal). */
  setDistance(distance: number): void {
    this.distance = MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    this.goalLogDistance = Math.log(this.distance);
  }

  /** Jump to an orientation (and keep it as the goal). */
  setOrientation(yaw: number, pitch: number): void {
    this.yaw = this.goalYaw = yaw;
    this.pitch = this.goalPitch = MathUtils.clamp(pitch, -1.55, 1.55);
  }

  private pinchDistance(): number {
    if (this.pointers.size !== 2) return 0;
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Point the orbit so the camera looks along `direction` (unit, from camera to target). */
  setViewDirection(fromTargetToCamera: Vector3): void {
    const d = fromTargetToCamera.clone().normalize();
    this.setOrientation(Math.atan2(d.x, d.z), Math.asin(MathUtils.clamp(d.y, -1, 1)));
  }

  /** Camera offset from the target for the current yaw, pitch and distance. */
  offset(target = new Vector3()): Vector3 {
    const c = Math.cos(this.pitch);
    return target.set(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c).multiplyScalar(this.distance);
  }

  update(delta: number): void {
    // Exponential approach: smooth, and independent of the frame rate.
    const follow = 1 - Math.exp(-delta * 10);
    this.goalLogDistance = MathUtils.clamp(this.goalLogDistance, Math.log(this.minDistance), Math.log(this.maxDistance));
    this.yaw += (this.goalYaw - this.yaw) * follow;
    this.pitch += (this.goalPitch - this.pitch) * follow;
    this.distance = Math.exp(Math.log(this.distance) + (this.goalLogDistance - Math.log(this.distance)) * follow);
    this.apply();
  }

  /** Place the camera from the current orbit state (no damping step). */
  apply(): void {
    this.camera.position.copy(this.target).add(this.offset());
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    // Depth range follows the zoom: a star body a few radii away and kiloparsecs behind.
    this.camera.near = Math.max(1e-13, this.distance * 1e-3);
    this.camera.far = Math.max(1e4, this.distance * 10);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.abort.abort();
    this.pointers.clear();
  }
}
