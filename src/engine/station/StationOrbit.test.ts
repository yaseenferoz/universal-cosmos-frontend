import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { nearestDaylightPass, STATION_INCLINATION_DEG, STATION_ORBIT_PERIOD_SECONDS, StationOrbitModel } from "./StationOrbit";
import { stationRegions } from "../../data/stationRegions";

describe("illustrative ISS orbit", () => {
  it("keeps a 400 km circular orbit within the 51.6° latitude band", () => {
    expect(STATION_ORBIT_PERIOD_SECONDS / 60).toBeGreaterThan(90);
    expect(STATION_ORBIT_PERIOD_SECONDS / 60).toBeLessThan(93);
    const model = new StationOrbitModel();
    expect(model.sample(STATION_ORBIT_PERIOD_SECONDS / 4).latitudeDeg).toBeCloseTo(STATION_INCLINATION_DEG, 5);
    expect(model.sample(STATION_ORBIT_PERIOD_SECONDS * 3 / 4).latitudeDeg).toBeCloseTo(-STATION_INCLINATION_DEG, 5);
  });

  it("shifts the ground track west as Earth turns beneath successive orbits", () => {
    const model = new StationOrbitModel();
    expect(model.sample(0).longitudeDeg).toBeCloseTo(20, 5);
    const nextLongitude = model.sample(STATION_ORBIT_PERIOD_SECONDS).longitudeDeg;
    expect(nextLongitude).toBeLessThan(0);
    expect(nextLongitude).toBeGreaterThan(-6);
  });

  it("centers the modeled nadir on the displayed geography", () => {
    const model = new StationOrbitModel();
    for (const fraction of [0, 0.18, 0.45, 0.8, 1.4]) {
      const sample = model.sample(STATION_ORBIT_PERIOD_SECONDS * fraction);
      const latitude = sample.latitudeDeg * Math.PI / 180;
      const longitude = sample.longitudeDeg * Math.PI / 180;
      const ground = new Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), -Math.cos(latitude) * Math.sin(longitude));
      ground.applyQuaternion(sample.earthOrientation);
      expect(ground.y).toBeCloseTo(1, 6);
    }
  });

  it("finds future daylight passes near the named regions", () => {
    const model = new StationOrbitModel();
    for (const region of stationRegions) {
      const time = nearestDaylightPass(model, 0, region);
      const pass = model.sample(time);
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThanOrEqual(2 * 86400);
      expect(pass.sunDirection.y).toBeGreaterThanOrEqual(0.1);
      const latA = pass.latitudeDeg * Math.PI / 180;
      const lonA = pass.longitudeDeg * Math.PI / 180;
      const latB = region.latitudeDeg * Math.PI / 180;
      const lonB = region.longitudeDeg * Math.PI / 180;
      const separation = Math.acos(Math.min(1, Math.max(-1, Math.sin(latA) * Math.sin(latB) + Math.cos(latA) * Math.cos(latB) * Math.cos(lonA - lonB)))) * 180 / Math.PI;
      expect(separation, region.name).toBeLessThan(15);
    }
  });
});
