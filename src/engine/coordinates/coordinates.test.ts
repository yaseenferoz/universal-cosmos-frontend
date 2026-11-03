import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { objectById } from "../../data/catalog";
import type { ObjectId } from "../../types/celestial";
import {
  displayOrbitAt,
  KM_PER_AU,
  kmToAu,
  resolveScientificCoordinate,
  modeledPositionsKm,
  overviewPositions,
  explorationPosition,
  renderRadiusFor,
  type ScientificCoordinate,
} from "./CoordinateSystem";
import { FloatingOrigin } from "./FloatingOrigin";

describe("display orbital model", () => {
  it("returns each body to its initial position after its own orbital period", () => {
    for (const object of Object.values(objectById)) {
      if (!object.parentId) continue;
      const initial = displayOrbitAt(object, 0);
      const completed = displayOrbitAt(object, object.orbitalPeriodDays);
      expect(completed.x).toBeCloseTo(initial.x, 10);
      expect(completed.y).toBeCloseTo(initial.y, 10);
      expect(completed.z).toBeCloseTo(initial.z, 10);
    }
  });
  it("keeps inclined circular positions at the display radius, independent of scientific km", () => {
    const mercury = objectById.mercury;
    for (const day of [0, 24, 800, -19]) {
      const p = displayOrbitAt(mercury, day);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(
        mercury.display.orbitRadius,
        10,
      );
      expect(Math.hypot(p.x, p.y, p.z)).not.toBeCloseTo(
        mercury.semiMajorAxisKm,
      );
    }
  });
  it("places the Sun at the root and resolves Moon orbits relative to Earth", () => {
    expect(displayOrbitAt(objectById.sun, 50)).toEqual({ x: 0, y: 0, z: 0 });
    expect(objectById.moon.parentId).toBe("earth");
    const moon = displayOrbitAt(objectById.moon, 2);
    expect(Math.hypot(moon.x, moon.y, moon.z)).toBeCloseTo(
      objectById.moon.display.orbitRadius,
    );
  });
});

describe("separate exploration and overview mappings", () => {
  const bodies = Object.values(objectById);
  it("preserves the measured Moon/Earth distance-to-radius ratio in exploration", () => {
    const positions = modeledPositionsKm(bodies, 5);
    const earth = positions.get("earth")!;
    const moon = positions.get("moon")!;
    const distanceKm = Math.hypot(
      moon.x - earth.x,
      moon.y - earth.y,
      moon.z - earth.z,
    );
    expect(distanceKm).toBeCloseTo(objectById.moon.semiMajorAxisKm, 5);
    const e = explorationPosition(earth),
      m = explorationPosition(moon);
    const ratio =
      Math.hypot(m.x - e.x, m.y - e.y, m.z - e.z) /
      renderRadiusFor(objectById.earth, "exploration");
    expect(ratio).toBeCloseTo(
      objectById.moon.semiMajorAxisKm / objectById.earth.radiusKm,
      8,
    );
  });
  it("keeps compressed overview parameters out of physical model dimensions", () => {
    const physical = modeledPositionsKm(bodies, 0);
    const modified = bodies.map((body) => ({
      ...body,
      display: { ...body.display, radius: 999, orbitRadius: 999 },
    }));
    expect(modeledPositionsKm(modified, 0)).toEqual(physical);
    expect(renderRadiusFor(modified[3], "exploration")).toBe(
      renderRadiusFor(bodies[3], "exploration"),
    );
    expect(overviewPositions(modified, 0)).not.toEqual(
      overviewPositions(bodies, 0),
    );
  });
  it("resolves hierarchy even when Moon precedes Earth", () => {
    expect(modeledPositionsKm([...bodies].reverse(), 10)).toEqual(
      modeledPositionsKm(bodies, 10),
    );
  });
});

describe("hierarchical scientific coordinates", () => {
  const coordinate = (
    parentId: ObjectId | null,
    x: number,
  ): ScientificCoordinate => ({
    parentId,
    offsetKm: { x, y: 0, z: 0 },
    epoch: "2026-01-01T00:00:00.000Z",
    frame: "parent-centered-ecliptic",
  });
  it("sums parent-relative km without applying visualization compression", () => {
    const hierarchy = new Map<ObjectId, ScientificCoordinate>([
      ["sun", coordinate(null, 0)],
      ["earth", coordinate("sun", KM_PER_AU)],
      ["moon", coordinate("earth", 384400)],
    ]);
    expect(resolveScientificCoordinate("moon", hierarchy).x).toBe(
      KM_PER_AU + 384400,
    );
    expect(kmToAu(KM_PER_AU)).toBe(1);
  });
  it("rejects incomplete and cyclic hierarchies", () => {
    expect(() => resolveScientificCoordinate("earth", new Map())).toThrow(
      "Missing coordinate",
    );
    const cyclic = new Map<ObjectId, ScientificCoordinate>([
      ["earth", coordinate("moon", 0)],
      ["moon", coordinate("earth", 0)],
    ]);
    expect(() => resolveScientificCoordinate("earth", cyclic)).toThrow("cycle");
  });
  it("rejects coordinates sampled at incompatible reference epochs", () => {
    const parent = {
      ...coordinate(null, 0),
      epoch: "2000-01-01T12:00:00.000Z",
    };
    const hierarchy = new Map<ObjectId, ScientificCoordinate>([
      ["sun", parent],
      ["earth", coordinate("sun", KM_PER_AU)],
    ]);
    expect(() => resolveScientificCoordinate("earth", hierarchy)).toThrow(
      "reference epochs",
    );
  });
});

describe("floating origin", () => {
  it("preserves global camera coordinates and object distance when rebasing", () => {
    const origin = new FloatingOrigin(100);
    const camera = new Vector3(120, 30, -50);
    const objectGlobal = new Vector3(150, -4, 60);
    const expectedDistance = camera.distanceTo(objectGlobal);
    const originalCamera = camera.clone();
    const shift = origin.rebase(camera);
    expect(shift).not.toBeNull();
    camera.sub(shift!);
    expect(origin.toGlobal(camera)).toEqual(originalCamera);
    expect(camera.distanceTo(origin.toLocal(objectGlobal))).toBeCloseTo(
      expectedDistance,
      10,
    );
    expect(camera.length()).toBe(0);
  });
  it("does not rebase small coordinates and accumulates multiple origins", () => {
    const origin = new FloatingOrigin(100);
    expect(origin.rebase(new Vector3(1, 2, 3))).toBeNull();
    origin.rebase(new Vector3(150, 0, 0));
    origin.rebase(new Vector3(-50, 120, 0));
    expect(origin.offset).toEqual(new Vector3(100, 120, 0));
    expect(origin.toLocal(new Vector3(101, 122, 3))).toEqual(
      new Vector3(1, 2, 3),
    );
  });
});
