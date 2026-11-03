import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { ObjectId } from "../../types/celestial";
import {
  KM_PER_AU,
  KM_PER_EXPLORATION_UNIT,
} from "../coordinates/CoordinateSystem";
import { FloatingOrigin } from "../coordinates/FloatingOrigin";
import { sampleSceneDiagnostics } from "./SceneDiagnostics";

function frame() {
  const sun = new Vector3(600_000, -900_000, 50_000);
  const earth = sun.clone().add(new Vector3(KM_PER_AU, 0, 0));
  const observer = earth.clone().add(new Vector3(-4 * 6378, 0, 0));
  const origin = new FloatingOrigin(32);
  const camera = new PerspectiveCamera(38, 16 / 9);
  camera.position.copy(observer).divideScalar(KM_PER_EXPLORATION_UNIT);
  const positionsKm = new Map<ObjectId, Vector3>([
    ["sun", sun],
    ["earth", earth],
  ]);
  const renderPositions = new Map(
    [...positionsKm].map(([id, position]) => [
      id,
      position.clone().divideScalar(KM_PER_EXPLORATION_UNIT),
    ]),
  );
  return {
    camera,
    origin,
    positionsKm,
    renderPositions,
    sunRenderRadius: 695700 / KM_PER_EXPLORATION_UNIT,
    selectedId: "earth" as const,
    viewMode: "exploration" as const,
    effectiveExposureEv: -0.25,
    automaticExposure: true,
    lunarActive: false,
  };
}

describe("scientific navigation diagnostics", () => {
  it("uses explicit Sun-relative vectors, CPU kilometers and the actual camera FOV", () => {
    const input = frame();
    input.camera.zoom = 2;
    const result = sampleSceneDiagnostics(input);
    expect(result.cameraSunDistanceKm).toBeCloseTo(KM_PER_AU - 4 * 6378, 6);
    expect(result.planetSunDirection).toEqual({ x: -1, y: 0, z: 0 });
    expect(result.cameraSunDirection.x).toBeCloseTo(-1, 12);
    expect(result.selectedPhaseAngleDeg).toBeCloseTo(0, 10);
    expect(result.sunAngularDiameterRad).toBeCloseTo(
      2 * Math.asin(695700 / (KM_PER_AU - 4 * 6378)),
      12,
    );
    expect(result.cameraFovDeg).toBeCloseTo(input.camera.getEffectiveFOV(), 12);
    expect(result.selectedPositionKm).toEqual(input.positionsKm.get("earth"));
    expect(result.effectiveExposureEv).toBe(-0.25);
    expect(result.canLookAtSun).toBe(true);
    expect(result.canGoToDaySide).toBe(true);
  });
  it("is invariant under floating-origin rebasing and camera orientation changes", () => {
    const input = frame();
    const before = sampleSceneDiagnostics(input);
    const observer = input.origin.toGlobal(input.camera.position);
    input.origin.offset.set(14000, -60, 70);
    input.origin.toLocal(observer, input.camera.position);
    input.camera.lookAt(
      input.camera.position.clone().add(new Vector3(0, 1, 0)),
    );
    const after = sampleSceneDiagnostics(input);
    expect(after.cameraSunDistanceKm).toBeCloseTo(
      before.cameraSunDistanceKm!,
      6,
    );
    expect(after.sunAngularDiameterRad).toBeCloseTo(
      before.sunAngularDiameterRad,
      12,
    );
    expect(after.planetSunDirection).toEqual(before.planetSunDirection);
    expect(after.selectedPhaseAngleDeg).toBeCloseTo(
      before.selectedPhaseAngleDeg!,
      10,
    );
  });
  it("does not present overview display camera coordinates as measured kilometers", () => {
    const result = sampleSceneDiagnostics({ ...frame(), viewMode: "overview" });
    expect(result.cameraPositionKm).toBeNull();
    expect(result.cameraSunDistanceKm).toBeNull();
    expect(result.selectedPhaseAngleDeg).toBeNull();
    expect(result.selectedPositionKm).not.toBeNull();
    expect(result.canLookAtSun).toBe(false);
    expect(result.canGoToDaySide).toBe(false);
  });
  it("keeps lunar navigation isolated and excludes a day-side action on the Sun", () => {
    expect(
      sampleSceneDiagnostics({ ...frame(), lunarActive: true }).canLookAtSun,
    ).toBe(false);
    expect(
      sampleSceneDiagnostics({ ...frame(), lunarActive: true }).canGoToDaySide,
    ).toBe(false);
    const sun = sampleSceneDiagnostics({ ...frame(), selectedId: "sun" });
    expect(sun.canGoToDaySide).toBe(false);
    expect(sun.planetSunDirection).toBeNull();
  });
});
