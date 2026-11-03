import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { CameraController } from "./CameraController";

describe("real OrbitControls inertia during camera commands", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const camera = new PerspectiveCamera(38, 16 / 9, 0.001, 1e6);
    camera.position.set(0, 0, 4);
    const element = Object.assign(new EventTarget(), {
      style: {},
      ownerDocument: new EventTarget(),
    }) as unknown as HTMLElement;
    const controller = new CameraController(camera, element, () => undefined);
    // This public method exists in the installed Three release, ahead of its declarations.
    const rotate = Reflect.get(controller.controls, "rotateLeft") as (
      angle: number,
    ) => void;
    return {
      camera,
      controller,
      rotate: (angle: number) => rotate.call(controller.controls, angle),
    };
  }

  it("keeps a restored day-side pose after previously queued orbit rotation", () => {
    const { camera, controller, rotate } = setup();
    try {
      rotate(Math.PI);
      controller.setMode("orbit");
      const restored = new Vector3(0.57, 0.16, 0.8)
        .normalize()
        .multiplyScalar(4);
      camera.position.copy(restored);
      controller.controls.target.set(0, 0, 0);
      for (let index = 0; index < 200; index++) controller.update(1 / 60);
      expect(camera.position.distanceTo(restored)).toBeLessThan(1e-10);
      expect(
        camera.position
          .clone()
          .normalize()
          .dot(new Vector3(1, 0, 0)),
      ).toBeGreaterThan(0.57);
    } finally {
      controller.dispose();
    }
  });

  it("stops motion without changing the current camera position, orientation or pivot", () => {
    const { camera, controller, rotate } = setup();
    try {
      rotate(1.7);
      const position = camera.position.clone();
      const orientation = camera.quaternion.clone();
      const target = controller.controls.target.clone();
      controller.stopMotion();
      expect(camera.position).toEqual(position);
      expect(camera.quaternion.toArray()).toEqual(orientation.toArray());
      expect(controller.controls.target).toEqual(target);
      expect(controller.controls.enableDamping).toBe(true);
      for (let index = 0; index < 100; index++) controller.update(1 / 60);
      expect(camera.position.distanceTo(position)).toBeLessThan(1e-10);
    } finally {
      controller.dispose();
    }
  });
});
