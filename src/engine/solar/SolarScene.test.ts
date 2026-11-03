import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Vector3,
  type WebGLRenderer,
} from "three";
import { celestialObjects, objectById } from "../../data/catalog";
import type { ObjectId } from "../../types/celestial";
import { KM_PER_EXPLORATION_UNIT } from "../coordinates/CoordinateSystem";
import { FloatingOrigin } from "../coordinates/FloatingOrigin";
import { UniverseEngine } from "../core/UniverseEngine";
import { LunarExploration } from "../core/LunarExploration";
import { CelestialBody } from "../objects/CelestialBody";
import { SolarScene } from "./SolarScene";
import { ASTRONOMICAL_UNIT_KM, angularDiameterRad } from "./solarMath";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function setup() {
  const objects = celestialObjects.filter((object) =>
    ["sun", "earth", "moon", "jupiter"].includes(object.id),
  );
  const bodies = new Map(
    objects.map((object) => [object.id, new CelestialBody(object)]),
  );
  const group = new Group();
  for (const body of bodies.values()) {
    body.setRenderRadius(body.data.radiusKm / KM_PER_EXPLORATION_UNIT);
    group.add(body.anchor);
  }
  cleanups.push(() => bodies.forEach((body) => body.dispose()));
  // The coordinator only needs exposure and pixel ratio; no WebGL context is faked.
  const renderer = {
    toneMappingExposure: 1,
    getPixelRatio: () => 1,
  } as WebGLRenderer;
  const solar = new SolarScene(objects, bodies, renderer);
  const camera = new PerspectiveCamera(38, 16 / 9, 0.01, 1_200_000);
  const origin = new FloatingOrigin(32);
  const positionsKm = new Map<ObjectId, Vector3>([
    ["sun", new Vector3()],
    ["earth", new Vector3(ASTRONOMICAL_UNIT_KM, 500_000, 0)],
    ["moon", new Vector3(ASTRONOMICAL_UNIT_KM, 0, 0)],
    ["jupiter", new Vector3(0, 0, 5.2 * ASTRONOMICAL_UNIT_KM)],
  ]);
  const renderPositions = new Map(
    [...positionsKm].map(([id, point]) => [
      id,
      point.clone().divideScalar(KM_PER_EXPLORATION_UNIT),
    ]),
  );
  const prepare = (observerKm: Vector3) => {
    origin.toLocal(
      observerKm.clone().divideScalar(KM_PER_EXPLORATION_UNIT),
      camera.position,
    );
    for (const [id, body] of bodies)
      origin.toLocal(renderPositions.get(id)!, body.anchor.position);
    group.updateMatrixWorld(true);
    camera.lookAt(origin.toLocal(renderPositions.get("sun")!));
    camera.updateMatrixWorld(true);
    return {
      positionsKm,
      renderPositions,
      origin,
      camera,
      viewMode: "exploration" as const,
      referenceId: "moon" as const,
      delta: 0.016,
      viewportHeight: 800,
    };
  };
  return {
    solar,
    bodies,
    camera,
    origin,
    positionsKm,
    renderPositions,
    prepare,
  };
}

describe("solar scene physical and local observer integration", () => {
  it("does not meter a Sun above the viewport but inside its diagonal cone", () => {
    const { solar, camera, prepare } = setup();
    const frame = prepare(new Vector3(0, 0, ASTRONOMICAL_UNIT_KM));
    const meter = vi.spyOn(solar.exposure, "update");
    solar.update(frame);
    expect(meter.mock.lastCall![0].sunInView).toBe(true);
    camera.rotateX(Math.PI / 6);
    camera.updateMatrixWorld(true);
    solar.update(frame);
    expect(meter.mock.lastCall![0].sunInView).toBe(false);
    expect(solar.telemetry.visibleFraction).toBe(1); // Visibility and framing are distinct.
  });
  it("uses scientific distances for illumination independently of render coordinates", () => {
    const { solar, bodies, positionsKm, renderPositions, prepare } = setup();
    positionsKm.set("earth", new Vector3(ASTRONOMICAL_UNIT_KM, 0, 0));
    const earth = vi.spyOn(bodies.get("earth")!.solarLighting, "update");
    const jupiter = vi.spyOn(bodies.get("jupiter")!.solarLighting, "update");
    const observer = new Vector3(ASTRONOMICAL_UNIT_KM, 100_000, 0);
    solar.update(prepare(observer));
    expect(earth.mock.lastCall![0].irradiance).toBeCloseTo(1, 12);
    expect(jupiter.mock.lastCall![0].irradiance).toBeCloseTo(1 / 5.2 ** 2, 12);
    renderPositions.set("jupiter", new Vector3(8, 2, 3));
    solar.update(prepare(observer));
    expect(jupiter.mock.lastCall![0].irradiance).toBeCloseTo(1 / 5.2 ** 2, 12);
    solar.update({ ...prepare(observer), viewMode: "overview" });
    expect(jupiter.mock.lastCall![0].irradiance).toBe(1);
    expect(jupiter.mock.lastCall![0].occluders).toEqual([]);
    expect(solar.telemetry.physicalScale).toBe(false);
  });

  it("keeps physical angular size and eclipse visibility unchanged across an origin rebase", () => {
    const { solar, origin, prepare } = setup();
    const observer = new Vector3(ASTRONOMICAL_UNIT_KM, 100_000, 50_000);
    solar.update(prepare(observer));
    const before = { ...solar.telemetry };
    origin.offset.set(14_000, 45, -80);
    solar.update(prepare(observer));
    expect(solar.telemetry.distanceAu).toBeCloseTo(before.distanceAu, 12);
    expect(solar.telemetry.angularDiameterDeg).toBeCloseTo(
      before.angularDiameterDeg,
      12,
    );
    expect(solar.telemetry.visibleFraction).toBeCloseTo(
      before.visibleFraction,
      12,
    );
  });

  it("uses the local lunar ground radius for a below-datum valley observer", () => {
    const { solar, positionsKm, prepare } = setup();
    const localRadiusKm = 1737.4 - 2.627;
    const observer = positionsKm
      .get("moon")!
      .clone()
      .add(new Vector3(-localRadiusKm - 0.0017, 0, 0));
    const frame = prepare(observer);
    solar.update(frame);
    expect(solar.telemetry.visibleFraction).toBe(0); // Inside the coarse catalog sphere.
    const localFrame = {
      ...frame,
      observerSurface: { bodyId: "moon" as const, radiusKm: localRadiusKm },
    };
    solar.update(localFrame);
    expect(solar.telemetry.visibleFraction).toBe(1);
    expect(solar.telemetry.distanceAu).toBeCloseTo(
      observer.length() / ASTRONOMICAL_UNIT_KM,
      12,
    );
  });

  it("retains lunar horizon and orbital occultation without dimming every body", () => {
    const { solar, bodies, positionsKm, prepare } = setup();
    const localRadiusKm = 1737.4 - 2.627;
    const nightObserver = positionsKm
      .get("moon")!
      .clone()
      .add(new Vector3(localRadiusKm + 0.0017, 0, 0));
    const earth = vi.spyOn(bodies.get("earth")!.solarLighting, "update");
    const localFrame = {
      ...prepare(nightObserver),
      observerSurface: { bodyId: "moon" as const, radiusKm: localRadiusKm },
    };
    solar.update(localFrame);
    expect(solar.telemetry.visibleFraction).toBe(0);
    expect(earth.mock.lastCall![0].irradiance).toBeGreaterThan(0.99);
    solar.update(
      prepare(
        positionsKm
          .get("moon")!
          .clone()
          .add(new Vector3(5000, 0, 0)),
      ),
    );
    expect(solar.telemetry.visibleFraction).toBe(0);
  });

  it("separates the observer's lunar horizon from external eclipse lighting", () => {
    const { solar, positionsKm, prepare } = setup();
    const observer = positionsKm
      .get("moon")!
      .clone()
      .add(new Vector3(5000, 0, 0));
    solar.update(prepare(observer));
    expect(solar.telemetry.visibleFraction).toBe(0); // Moon hides the Sun from this camera.
    expect(solar.lunarIlluminationFraction).toBe(1); // Its visible lit crescent must remain illuminated.

    // Earth, unlike the receiving Moon itself, can eclipse the lunar terrain.
    positionsKm.set("earth", new Vector3(ASTRONOMICAL_UNIT_KM - 400_000, 0, 0));
    solar.update(prepare(observer));
    expect(solar.lunarIlluminationFraction).toBe(0);
    expect(solar.telemetry.visibleFraction).toBe(0);
  });

  it("evaluates solar apparent diameter at the selected physical distances", () => {
    const { solar, prepare } = setup();
    for (const au of [0.387, 1, 1.524, 5.2, 30.1]) {
      const frame = prepare(new Vector3(0, au * ASTRONOMICAL_UNIT_KM, 0));
      solar.update({ ...frame, referenceId: "sun" });
      expect(solar.telemetry.distanceAu).toBeCloseTo(au, 10);
      expect(solar.telemetry.angularDiameterDeg).toBeCloseTo(
        (angularDiameterRad(
          objectById.sun.radiusKm,
          au * ASTRONOMICAL_UNIT_KM,
        ) *
          180) /
          Math.PI,
        10,
      );
      expect(solar.telemetry.irradianceWm2).toBeCloseTo(1361 / au ** 2, 8);
    }
  });
});

describe("Sun distance preset command", () => {
  it("converts AU to physical rendering units even with an existing floating origin", () => {
    const engine = Object.create(UniverseEngine.prototype) as UniverseEngine;
    const origin = new FloatingOrigin(32);
    origin.offset.set(1200, -20, 10);
    const camera = new PerspectiveCamera();
    const sunCenter = new Vector3(10, 20, 30);
    const focusObject = vi.fn(() =>
      origin.toLocal(
        sunCenter.clone().add(new Vector3(0, 0, 500)),
        camera.position,
      ),
    );
    const controls = { target: new Vector3(), update: vi.fn() };
    Object.assign(engine, {
      origin,
      camera,
      controller: { controls },
      focusObject,
      globalPositions: new Map([["sun", sunCenter]]),
    });
    for (const au of [0.387, 1, 5.2, 30.1]) {
      engine.observeSunAtDistance(au);
      const measuredKm =
        origin.toGlobal(camera.position).distanceTo(sunCenter) *
        KM_PER_EXPLORATION_UNIT;
      expect(measuredKm / ASTRONOMICAL_UNIT_KM).toBeCloseTo(au, 12);
      expect(origin.toGlobal(controls.target)).toEqual(sunCenter);
    }
    expect(focusObject).toHaveBeenCalledTimes(4);
    for (const invalid of [NaN, -1, 0.001, 51])
      engine.observeSunAtDistance(invalid);
    expect(focusObject).toHaveBeenCalledTimes(4);
  });
});

describe("local lunar horizon during return", () => {
  it("keeps the local datum through early ascent and restores the mean sphere aloft", () => {
    const lunar = Object.create(LunarExploration.prototype) as LunarExploration;
    let altitudeM = 1.7;
    const groundRadiusM = 1_737_400 - 2627;
    const positionM = new Vector3(groundRadiusM + altitudeM, 0, 0);
    Object.assign(lunar, {
      entered: true,
      navigation: {
        positionM,
        getTelemetry: () => ({ phase: "ascending", altitudeM }),
      },
    });
    expect(lunar.observerSurface?.radiusKm).toBeCloseTo(
      groundRadiusM / 1000,
      8,
    );
    altitudeM = 12_000;
    positionM.setLength(groundRadiusM + altitudeM);
    expect(lunar.observerSurface).toBeUndefined();
  });

  it("applies new external eclipse visibility before the current terrain frame renders", () => {
    const lunar = Object.create(LunarExploration.prototype) as LunarExploration;
    const sunlight = new DirectionalLight("#ffffff", 1.55);
    Object.assign(lunar, {
      sunlight,
      baseSolarIntensity: 1.55,
      solarVisibility: 1,
    });
    lunar.setSolarVisibility(0.25);
    expect(sunlight.intensity).toBeCloseTo(1.55 * 0.25, 12);
    lunar.setSolarVisibility(1);
    expect(sunlight.intensity).toBe(1.55);
  });
});
