import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { objectById } from "../../data/catalog";
import { explorationProfile } from "../../data/explorationProfiles";
import { planetaryEnvironments } from "../../data/planetaryEnvironments";
import { ReconstructedTerrainProvider } from "../../services/terrain/ReconstructedTerrainProvider";
import { LunarNavigationController } from "./LunarNavigationController";
import { fromMoonFixedMeters, toMoonFixedMeters } from "../coordinates/LunarFrame";
import { Quaternion } from "three";

describe("catalog planetary descent", () => {
  beforeEach(() => { vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("document", new EventTarget()); });
  afterEach(() => vi.unstubAllGlobals());
  it.each(["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] as const)("enters, moves and returns from %s without crossing its reference ground", id => {
    const body = objectById[id];
    const atmospheric = planetaryEnvironments[id]!.mode === "atmosphere";
    const provider = new ReconstructedTerrainProvider(body, { latDeg: 0, lonDeg: 0, radiusM: 1000 });
    const navigation = new LunarNavigationController(new EventTarget() as HTMLElement, (lat, lon) => provider.sampleHeight(lat, lon), {
      radiusM: provider.manifest.radiusM, reconstruction: true, hoverHeightM: atmospheric ? 25000 : undefined,
    });
    const pose = { positionM: new Vector3(provider.manifest.radiusM * 3, 0, 0), forward: new Vector3(-1, 0, 0), up: new Vector3(0, 1, 0) };
    expect(navigation.enter(pose, { latDeg: 0, lonDeg: 0 })).toBe(true);
    for (let i = 0; i < 150; i++) navigation.update(0.1);
    expect(navigation.phase).toBe("surface");
    expect(navigation.getTelemetry().altitudeM).toBeCloseTo(atmospheric ? 25000 : 1.7, 5);
    navigation.setMoveInput(1, 1);
    for (let i = 0; i < 20; i++) navigation.update(0.1);
    expect(navigation.getTelemetry().altitudeM).toBeCloseTo(atmospheric ? 25000 : 1.7, 5);
    navigation.returnToOrbit();
    for (let i = 0; i < 90; i++) navigation.update(0.1);
    expect(navigation.active).toBe(false);
    expect(navigation.positionM.distanceTo(pose.positionM)).toBe(0);
    if (atmospheric) expect(explorationProfile(id).modes.surface).toBe("not-supported");
    navigation.dispose(); provider.dispose();
  });

  it("keeps the generated terrain continuous across longitude wrap and rejects disposed samples", () => {
    const provider = new ReconstructedTerrainProvider(objectById.mars, { latDeg: 0, lonDeg: 0, radiusM: 1000 });
    expect(provider.sampleHeight(25, -180).heightM).toBeCloseTo(provider.sampleHeight(25, 180).heightM, 8);
    expect(provider.manifest.reconstruction).toBe(true);
    provider.dispose();
    expect(provider.sampleHeight(0, 0).available).toBe(false);
  });

  it("round trips a non-lunar body frame at outer-planet distances", () => {
    const center = new Vector3(450000, 200, -300);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 2.7);
    const local = new Vector3(24765000, 300, -200);
    const world = fromMoonFixedMeters(local, center, rotation);
    expect(toMoonFixedMeters(world, center, rotation).distanceTo(local)).toBeLessThan(0.001);
  });
});
