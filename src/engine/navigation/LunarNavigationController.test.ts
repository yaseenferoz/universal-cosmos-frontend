import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import type { HeightSample } from "../../types/terrain";
import {
  cartesianToGeodetic,
  geodeticToCartesian,
} from "../terrain/coordinates";
import {
  interpolateRadialDirection,
  LunarNavigationController,
} from "./LunarNavigationController";

const radiusM = 1_737_400;
const site = { latDeg: 20.1908, lonDeg: 30.7717 };
const observedHeight = -2624.525;
const sample = (heightM = observedHeight): HeightSample => ({
  heightM,
  available: true,
  resolutionM: 5,
  sourceId: "lroc-apollo17-5m",
});

function setup(
  sampleHeight: (latDeg: number, lonDeg: number) => HeightSample = () =>
    sample(),
  surfaceHeightAt?: (latDeg: number, lonDeg: number) => number | null,
) {
  const element = new EventTarget() as unknown as HTMLElement;
  element.focus = vi.fn();
  const controller = new LunarNavigationController(element, sampleHeight, {
    radiusM,
    surfaceHeightAt,
  });
  const positionM = geodeticToCartesian(5, -15, 3_000_000, radiusM);
  const forward = positionM.clone().negate().normalize();
  const up = new Vector3(0, 1, 0)
    .addScaledVector(forward, -forward.y)
    .normalize();
  const pose = { positionM, forward, up };
  return { controller, element, pose };
}

function advance(controller: LunarNavigationController, seconds: number): void {
  for (let index = 0; index < Math.ceil(seconds * 10); index++)
    controller.update(0.1);
}

describe("lunar descent and surface navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("arrives at measured elevation plus eye height with a camera-relative GPU pose", () => {
    const { controller, pose } = setup();
    expect(controller.enter(pose, site)).toBe(true);
    advance(controller, 14.5);
    expect(controller.phase).toBe("surface");
    const telemetry = controller.getTelemetry();
    expect(telemetry.latDeg).toBeCloseTo(site.latDeg, 8);
    expect(telemetry.lonDeg).toBeCloseTo(site.lonDeg, 8);
    expect(telemetry.elevationM).toBe(observedHeight);
    expect(telemetry.altitudeM).toBeCloseTo(1.7, 6);
    expect(controller.camera.position).toEqual(new Vector3());
    expect(controller.camera.near).toBeLessThan(1.7);
    expect(
      controller
        .getPose()
        .forward.dot(controller.positionM.clone().normalize()),
    ).toBeCloseTo(Math.sin((6 * Math.PI) / 180));
    controller.setEyeHeight(2.1);
    expect(controller.getTelemetry().altitudeM).toBeCloseTo(2.1, 6);
    controller.dispose();
  });

  it("uses a radial approach even from the opposite hemisphere", () => {
    const { controller, pose } = setup();
    pose.positionM = geodeticToCartesian(
      -site.latDeg,
      site.lonDeg + 180,
      3_000_000,
      radiusM,
    );
    controller.enter(pose, site);
    for (let index = 0; index < 145; index++) {
      controller.update(0.1);
      expect(controller.positionM.length()).toBeGreaterThanOrEqual(
        radiusM + observedHeight + 1.7 - 1e-6,
      );
      expect(controller.positionM.toArray().every(Number.isFinite)).toBe(true);
    }
    const midpoint = interpolateRadialDirection(
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      0.5,
    );
    expect(midpoint.length()).toBeCloseTo(1);
    expect(Math.abs(midpoint.x)).toBeLessThan(0.01);
    controller.dispose();
  });

  it("walks in meters on the spherical surface and rechecks terrain collision", () => {
    const sampler = (latDeg: number) =>
      sample(observedHeight + (latDeg - site.latDeg) * 1000);
    const { controller, pose } = setup(sampler);
    controller.enter(pose, site);
    advance(controller, 14.5);
    const before = controller.positionM.clone();
    controller.setMoveInput(1, 0);
    controller.update(0.1);
    expect(controller.positionM.distanceTo(before)).toBeGreaterThan(0.19);
    expect(controller.positionM.distanceTo(before)).toBeLessThan(0.21);
    expect(controller.getTelemetry().latDeg).toBeGreaterThan(site.latDeg);
    expect(controller.getTelemetry().altitudeM).toBeCloseTo(1.7, 6);
    controller.dispose();
  });

  it("keeps the observer above the rendered triangle during refinement", () => {
    const { controller, pose } = setup(
      () => sample(),
      () => observedHeight + 3,
    );
    controller.enter(pose, site);
    advance(controller, 14.5);
    expect(controller.getTelemetry().altitudeM).toBeCloseTo(4.7, 6);
    expect(
      cartesianToGeodetic(controller.positionM, radiusM).heightM,
    ).toBeCloseTo(observedHeight + 3 + 1.7, 6);
    controller.dispose();
  });

  it("resolves a new triangle before rendering without a second movement step", () => {
    let renderedHeight = observedHeight;
    const { controller, pose } = setup(
      () => sample(),
      () => renderedHeight,
    );
    controller.enter(pose, site);
    advance(controller, 14.5);
    controller.setMoveInput(1, 0);
    const before = controller.getTelemetry();
    renderedHeight += 7;
    controller.resolveTerrainCollision();
    const corrected = controller.getTelemetry();
    expect(corrected.altitudeM).toBeCloseTo(8.7, 6);
    expect(corrected.latDeg).toBeCloseTo(before.latDeg, 10);
    expect(corrected.lonDeg).toBeCloseTo(before.lonDeg, 10);
    expect(controller.phase).toBe("surface");
    controller.resolveTerrainCollision();
    expect(controller.getTelemetry().altitudeM).toBeCloseTo(8.7, 6);
    controller.dispose();
  });

  it("leaves descent altitude unchanged while it is above new geometry", () => {
    let renderedHeight = observedHeight;
    const { controller, pose } = setup(
      () => sample(),
      () => renderedHeight,
    );
    controller.enter(pose, site);
    advance(controller, 6);
    expect(controller.phase).toBe("descending");
    const before = controller.positionM.clone();
    renderedHeight += 7;
    controller.resolveTerrainCollision();
    expect(controller.positionM).toEqual(before);
    controller.dispose();
  });

  it("blocks walking beyond measured fine coverage instead of inventing terrain", () => {
    const { controller, pose } = setup((latitude) =>
      latitude <= site.latDeg + 0.000002
        ? sample()
        : { ...sample(), resolutionM: 40 },
    );
    controller.enter(pose, site);
    advance(controller, 14.5);
    const before = controller.positionM.clone();
    controller.setMoveInput(1, 0);
    controller.update(0.1);
    expect(controller.positionM).toEqual(before);
    expect(controller.getTelemetry().coverageNotice).toContain(
      "Edge of measured",
    );
    controller.dispose();
  });

  it("releases keyboard and touch movement on blur", () => {
    const { controller, element, pose } = setup();
    controller.enter(pose, site);
    advance(controller, 14.5);
    element.dispatchEvent(
      Object.assign(new Event("keydown"), { code: "KeyW" }),
    );
    controller.setMoveInput(0, 1);
    controller.update(0.1);
    const before = controller.positionM.clone();
    element.dispatchEvent(new Event("blur"));
    controller.update(0.1);
    expect(controller.positionM.distanceTo(before)).toBeLessThan(1e-8);
    controller.dispose();
  });

  it("holds descent if measured landing data disappears", () => {
    let ready = false;
    const { controller, pose } = setup(() => ({
      ...sample(),
      available: ready,
    }));
    expect(controller.enter(pose, site)).toBe(false);
    expect(controller.active).toBe(false);
    ready = true;
    expect(controller.enter(pose, site)).toBe(true);
    advance(controller, 6);
    const before = controller.positionM.clone();
    ready = false;
    advance(controller, 2);
    expect(controller.phase).toBe("descending");
    expect(controller.positionM).toEqual(before);
    expect(controller.getTelemetry().coverageNotice).toContain("holding");
    controller.dispose();
  });

  it("ascends without an initial jump and restores the exact orbital pose", () => {
    const { controller, pose } = setup();
    controller.enter(pose, site);
    advance(controller, 14.5);
    controller.returnToOrbit();
    const before = controller.positionM.clone();
    controller.update(0.1);
    expect(controller.positionM.distanceTo(before)).toBeLessThan(5);
    advance(controller, 8.1);
    expect(controller.phase).toBe("inactive");
    expect(controller.positionM).toEqual(pose.positionM);
    expect(controller.getPose().forward.dot(pose.forward)).toBeCloseTo(1, 10);
    expect(controller.getPose().up.dot(pose.up)).toBeCloseTo(1, 10);
    controller.dispose();
  });
});
