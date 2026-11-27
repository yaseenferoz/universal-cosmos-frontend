import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { StellarCamera } from "./StellarCamera";
import { arrivalDistancePc } from "./StellarEngine";
import { PC_PER_SOLAR_RADIUS, starVisibility } from "./StarCloud";

/** Minimal DOM stand-in (tests run in Node): events plus the size the camera reads. */
function element(captures: number[] = []): HTMLElement {
  return Object.assign(new EventTarget(), { clientHeight: 800, setPointerCapture: (id: number) => captures.push(id) }) as unknown as HTMLElement;
}
function pointer(type: string, x: number, y: number): Event {
  return Object.assign(new Event(type), { pointerId: 7, clientX: x, clientY: y, button: 0 });
}
function wheel(deltaY: number): Event {
  return Object.assign(new Event("wheel", { cancelable: true }), { deltaY, deltaMode: 0 });
}

describe("interstellar camera", () => {
  it("zooms exactly 1.5× per wheel notch and eases there independent of frame rate", () => {
    const target = element();
    const camera = new StellarCamera(new PerspectiveCamera(), target);
    camera.setDistance(1);
    for (let i = 0; i < 4; i++) target.dispatchEvent(wheel(100));
    for (let i = 0; i < 120; i++) camera.update(1 / 60);
    expect(camera.distance).toBeCloseTo(1.5 ** 4, 3);
    // The same input at 20 fps reaches the same place.
    const slow = new StellarCamera(new PerspectiveCamera(), element());
    slow.setDistance(1);
    slow.zoomBy(4 * Math.log(1.5));
    for (let i = 0; i < 40; i++) slow.update(1 / 20);
    expect(slow.distance).toBeCloseTo(camera.distance, 3);
    camera.dispose();
    slow.dispose();
  });

  it("never goes inside the focused star or beyond the catalogue", () => {
    const camera = new StellarCamera(new PerspectiveCamera(), element());
    camera.minDistance = 1e-7;
    camera.maxDistance = 6000;
    camera.zoomBy(-100);
    for (let i = 0; i < 200; i++) camera.update(1 / 60);
    expect(camera.distance).toBeCloseTo(1e-7, 12);
    camera.zoomBy(200);
    for (let i = 0; i < 400; i++) camera.update(1 / 60);
    expect(camera.distance).toBeCloseTo(6000, 6);
    camera.dispose();
  });

  it("leaves clicks to the stars and labels: the pointer is captured only for a drag", () => {
    const captures: number[] = [];
    const target = element(captures);
    const camera = new StellarCamera(new PerspectiveCamera(), target);
    camera.setOrientation(0, 0);
    // A click with a little jitter: no capture (pointerup/click stay on the star or label), no turn.
    target.dispatchEvent(pointer("pointerdown", 100, 100));
    target.dispatchEvent(pointer("pointermove", 102, 101));
    target.dispatchEvent(pointer("pointerup", 102, 101));
    expect(captures).toEqual([]);
    for (let i = 0; i < 60; i++) camera.update(1 / 60);
    expect(camera.yaw).toBe(0);
    // A drag captures once and turns the view by the whole movement.
    target.dispatchEvent(pointer("pointerdown", 100, 100));
    target.dispatchEvent(pointer("pointermove", 140, 100));
    target.dispatchEvent(pointer("pointermove", 200, 100));
    target.dispatchEvent(pointer("pointerup", 200, 100));
    expect(captures).toEqual([7]);
    for (let i = 0; i < 120; i++) camera.update(1 / 60);
    expect(camera.yaw).toBeCloseTo(-(100 * 2.6) / 800, 3);
    camera.dispose();
  });

  it("looks at the target from the requested side", () => {
    const view = new PerspectiveCamera();
    const camera = new StellarCamera(view, element());
    camera.setDistance(2);
    camera.setViewDirection(new Vector3(1, 0, 0));
    camera.apply();
    expect(view.position.x).toBeCloseTo(2, 10);
    expect(view.getWorldDirection(new Vector3()).x).toBeCloseTo(-1, 10);
    camera.dispose();
  });
});

describe("star display brightness", () => {
  it("scales by 2.512 per magnitude and frames a resolved disk on arrival", () => {
    expect(starVisibility(6.5, 6.5)).toBeCloseTo(0.05, 10);
    expect(starVisibility(5.5, 6.5) / starVisibility(6.5, 6.5)).toBeCloseTo(10 ** 0.4, 10);
    // Arrival at 14 radii: the disk spans ~8 degrees.
    const sun = PC_PER_SOLAR_RADIUS;
    expect(2 * Math.atan(sun / arrivalDistancePc(sun)) * 180 / Math.PI).toBeCloseTo(8.2, 1);
  });
});
