import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { insideStation, moduleLampPositions, moveInStation, stationModules, stationPoint } from "./StationLayout";
import { ISS_ORBIT_RADIUS_KM, ISS_PERIOD_DAYS } from "../../data/spacecraft";
import { LocalCelestialService } from "../../services/api/LocalCelestialService";
import { modeledPositionsKm, modeledRelativePositionKm } from "../coordinates/CoordinateSystem";
import { earthOrientationAt } from "../coordinates/EarthOrientation";

describe("ISS navigation and scientific reference", () => {
  it("places every module viewpoint in NASA's navigable interior", () => {
    for (const module of stationModules) expect(insideStation(stationPoint(...module.viewpoint)), module.name).toBe(true);
    expect(insideStation(new Vector3(100, 100, 100))).toBe(false);
  });
  it("hangs every cabin lamp inside the modules, at least one per module", () => {
    const lamps = moduleLampPositions();
    expect(lamps.length).toBeGreaterThanOrEqual(stationModules.length);
    for (const lamp of lamps) expect(insideStation(lamp), lamp.toArray().join(",")).toBe(true);
  });
  it("traverses connected hatches from Unity to Destiny and Harmony", () => {
    const position = stationPoint(-4.46, 0, 4.85);
    for (let i = 0; i < 290; i++) moveInStation(position, new Vector3(0.05, 0, 0));
    expect(position.x).toBeCloseTo(10.04, 2);
    expect(insideStation(position)).toBe(true);
  });
  it("navigates the Tranquility branch and Cupola access", () => {
    const position = stationPoint(-4.46, 0, 4.85);
    for (let i = 0; i < 137; i++) moveInStation(position, new Vector3(0, 0, -0.05));
    expect(position.z).toBeCloseTo(-6.85, 2);
    for (let i = 0; i < 47; i++) moveInStation(position, new Vector3(0, -0.05, 0));
    expect(position.y).toBeCloseTo(-2.35, 2);
  });
  it("stops at walls even under large frame displacements", () => {
    const position = stationPoint(2, 0, 4.85);
    for (let i = 0; i < 15; i++) moveInStation(position, new Vector3(0, 0, 100));
    expect(position.z).toBeLessThan(1.1);
    expect(insideStation(position)).toBe(true);
  });
  it("exposes ISS through the service without conflating it with a moon", async () => {
    const service = new LocalCelestialService();
    expect((await service.search("ISS")).map(({ id }) => id)).toContain("iss");
    expect((await service.search("moons")).map(({ id }) => id)).not.toContain("iss");
    expect(await service.getObject("iss")).toMatchObject({ parentId: "earth", radiusKm: 0.0545 });
    expect(await service.getEphemeris("iss", "2026-01-01T00:00:00Z")).toMatchObject({ status: "unavailable" });
  });
  it("keeps the orbit at 400km, with a Kepler period and equatorial inclination", async () => {
    const objects = await new LocalCelestialService().getObjects();
    expect(ISS_PERIOD_DAYS * 1440).toBeGreaterThan(92);
    expect(ISS_PERIOD_DAYS * 1440).toBeLessThan(93);
    const earth = objects.find(({ id }) => id === "earth")!;
    const station = objects.find(({ id }) => id === "iss")!;
    const first = new Vector3().copy(modeledRelativePositionKm(station, 0));
    const second = new Vector3().copy(modeledRelativePositionKm(station, ISS_PERIOD_DAYS / 4));
    const normal = first.cross(second).normalize();
    expect(normal.y).toBeCloseTo(Math.cos(51.6 * Math.PI / 180), 10);
    for (const days of [0, 0.014, 100]) {
      const positions = modeledPositionsKm(objects, days);
      const position = new Vector3().copy(positions.get("iss")!).sub(new Vector3().copy(positions.get("earth")!));
      expect(position.length()).toBeCloseTo(ISS_ORBIT_RADIUS_KM, 5);
      const earthOffset = modeledRelativePositionKm(earth, days);
      const sun = new Vector3(-earthOffset.x, -earthOffset.y, -earthOffset.z);
      const pole = earthOrientationAt(Date.UTC(2026, 0, 1) + days * 86400000, sun).poleRotation;
      position.applyQuaternion(pole.invert());
      expect(Math.abs(position.y / position.length())).toBeLessThanOrEqual(Math.sin(51.6 * Math.PI / 180) + 1e-8);
    }
  });
});
