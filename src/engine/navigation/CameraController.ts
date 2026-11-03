import { PerspectiveCamera, Spherical, TOUCH, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class CameraController {
  readonly controls: OrbitControls;
  private keys = new Set<string>();
  private mode: "orbit" | "free" = "orbit";
  private drag: { id: number; x: number; y: number } | null = null;
  private activePointers = new Set<number>();
  private readonly abort = new AbortController();
  private forward = new Vector3();
  private right = new Vector3();
  private referenceRadius = 1;
  private enabled = true;
  constructor(
    readonly camera: PerspectiveCamera,
    readonly element: HTMLElement,
    private readonly onInteraction: () => void,
  ) {
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.zoomSpeed = 0.8;
    this.controls.rotateSpeed = 0.5;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 420;
    this.controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.controls.addEventListener("start", onInteraction);
    const options = { signal: this.abort.signal };
    element.addEventListener(
      "contextmenu",
      (event) => event.preventDefault(),
      options,
    );
    element.addEventListener(
      "keydown",
      (event) => {
        if (!this.enabled) return;
        if (
          !["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(event.code)
        )
          return;
        event.preventDefault();
        this.keys.add(event.code);
        onInteraction();
      },
      options,
    );
    window.addEventListener(
      "keyup",
      (event) => this.keys.delete(event.code),
      options,
    );
    window.addEventListener("blur", () => this.release(), options);
    element.addEventListener("blur", () => this.release(), options);
    document.addEventListener(
      "visibilitychange",
      () => this.release(),
      options,
    );
    element.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.enabled) return;
        this.activePointers.add(event.pointerId);
        if (event.button === 0)
          this.drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        element.focus({ preventScroll: true });
      },
      options,
    );
    element.addEventListener(
      "pointermove",
      (event) => {
        if (
          !this.enabled ||
          this.mode !== "free" ||
          !this.drag ||
          this.activePointers.size !== 1 ||
          this.drag.id !== event.pointerId
        )
          return;
        const dx = event.clientX - this.drag.x,
          dy = event.clientY - this.drag.y;
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        const direction = this.controls.target.clone().sub(camera.position);
        const spherical = new Spherical().setFromVector3(direction);
        spherical.theta -= dx * 0.004;
        spherical.phi = Math.max(
          0.03,
          Math.min(Math.PI - 0.03, spherical.phi + dy * 0.004),
        );
        this.controls.target
          .copy(camera.position)
          .add(direction.setFromSpherical(spherical));
        onInteraction();
      },
      options,
    );
    const endPointer = (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);
      if (this.drag?.id === event.pointerId) this.drag = null;
    };
    element.addEventListener("pointerup", endPointer, options);
    element.addEventListener("pointercancel", endPointer, options);
  }
  setMode(mode: "orbit" | "free"): void {
    this.stopMotion();
    this.mode = mode;
    this.controls.enableRotate = mode === "orbit";
    if (mode === "free") {
      this.camera.getWorldDirection(this.forward);
      this.controls.target
        .copy(this.camera.position)
        .addScaledVector(this.forward, this.referenceRadius * 4);
      this.controls.minDistance = 0.05;
    }
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.controls.enabled = enabled;
    if (!enabled) this.release();
  }
  setReferenceRadius(radius: number): void {
    this.referenceRadius = Math.max(radius, 0.01);
  }
  update(delta: number): void {
    if (!this.enabled) return;
    if (this.keys.size) {
      this.camera.getWorldDirection(this.forward);
      this.right.crossVectors(this.forward, this.camera.up).normalize();
      const step =
        Math.max(
          this.referenceRadius * 0.4,
          this.camera.position.distanceTo(this.controls.target) * 0.45,
        ) * delta;
      const translation = new Vector3();
      if (this.keys.has("KeyW"))
        translation.addScaledVector(this.forward, step);
      if (this.keys.has("KeyS"))
        translation.addScaledVector(this.forward, -step);
      if (this.keys.has("KeyD")) translation.addScaledVector(this.right, step);
      if (this.keys.has("KeyA")) translation.addScaledVector(this.right, -step);
      if (this.keys.has("KeyE")) translation.y += step;
      if (this.keys.has("KeyQ")) translation.y -= step;
      this.camera.position.add(translation);
      this.controls.target.add(translation);
    }
    this.controls.update(delta);
    if (this.mode === "free") {
      // OrbitControls still supplies smooth wheel/pinch dolly and two-finger pan.
      // Re-anchor its target ahead of the eye so repeated dolly keeps travelling
      // instead of converging on a fixed orbit pivot.
      this.camera.getWorldDirection(this.forward);
      this.controls.target
        .copy(this.camera.position)
        .addScaledVector(this.forward, this.referenceRadius * 4);
    }
  }
  release(): void {
    this.keys.clear();
    this.activePointers.clear();
    this.drag = null;
  }
  /** Drain OrbitControls' public update path without carrying old inertia into a new pose. */
  stopMotion(): void {
    this.release();
    const position = this.camera.position.clone();
    const quaternion = this.camera.quaternion.clone();
    const target = this.controls.target.clone();
    const zoom = this.camera.zoom;
    const damping = this.controls.enableDamping;
    const autoRotate = this.controls.autoRotate;
    this.controls.enableDamping = false;
    this.controls.autoRotate = false;
    this.controls.update(0);
    this.camera.position.copy(position);
    this.camera.quaternion.copy(quaternion);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(target);
    this.controls.enableDamping = damping;
    this.controls.autoRotate = autoRotate;
  }
  dispose(): void {
    this.abort.abort();
    this.controls.removeEventListener("start", this.onInteraction);
    this.controls.dispose();
    this.release();
  }
}
