import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { FlightController } from "./FlightController";

describe("cinematic flight sampling", () => {
  it("finishes at the current destination, even if it moved after flight began", () => {
    const flight = new FlightController();
    const offset = new Vector3(3, 1, 4);
    flight.start(new Vector3(0, 0, 100), new Vector3(), offset, true);
    const movingDestination = new Vector3(10, 0, 20);
    const result = flight.sample(movingDestination);
    expect(result.target).toEqual(movingDestination);
    expect(result.position).toEqual(new Vector3(13, 1, 24));
    expect(flight.flying).toBe(false);
  });
  it("interpolates both position and target and allows interruption", () => {
    const flight = new FlightController();
    flight.start(
      new Vector3(0, 10, 100),
      new Vector3(0, 0, 20),
      new Vector3(4, 0, 0),
      false,
    );
    flight.pause();
    flight.state.progress = 0.5;
    const result = flight.sample(new Vector3(20, 0, 0));
    expect(result.position).toEqual(new Vector3(12, 5, 50));
    expect(result.target).toEqual(new Vector3(10, 0, 10));
    expect(flight.flying).toBe(true);
    flight.cancel();
    expect(flight.flying).toBe(false);
  });
  it("travels from night to day around a moving body without entering its solid interior", () => {
    const flight = new FlightController();
    const center = new Vector3(15000, 2, -40);
    const start = center.clone().add(new Vector3(-4, 0, 0));
    flight.startOrbit(start, center, center, new Vector3(3, 0, 0), 1.07, false);
    flight.pause();
    for (let step = 0; step <= 100; step++) {
      const progress = step / 100;
      flight.state.progress = progress;
      const movingCenter = center.clone().add(new Vector3(0, 0, progress * 50));
      const pose = flight.sample(movingCenter);
      expect(pose.position.distanceTo(movingCenter)).toBeCloseTo(
        4 - progress,
        9,
      );
      expect(pose.position.distanceTo(movingCenter)).toBeGreaterThan(1.07);
      expect(pose.target).toEqual(movingCenter);
    }
    expect(flight.flying).toBe(false);
    flight.cancel();
  });
});
