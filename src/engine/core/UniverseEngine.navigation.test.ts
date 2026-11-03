import { describe, expect, it, vi } from "vitest";
import { Group, PerspectiveCamera, Vector3 } from "three";
import {
  KM_PER_AU,
  KM_PER_EXPLORATION_UNIT,
} from "../coordinates/CoordinateSystem";
import { FloatingOrigin } from "../coordinates/FloatingOrigin";
import { orbitalCameraDistance } from "../navigation/CameraComposition";
import { CameraLookController } from "../navigation/CameraLookController";
import { FlightController } from "../navigation/FlightController";
import { UniverseEngine } from "./UniverseEngine";

/** Exercise mode/target commands without pretending a node process renders WebGL. */
function navigationHarness(
  mode: "exploration" | "overview",
  selected: "saturn" | null,
) {
  const engine = Object.create(UniverseEngine.prototype) as UniverseEngine;
  const focusObject = vi.fn();
  const cancelFlight = vi.fn();
  const configureCoordinateMode = vi.fn(
    (viewMode: "exploration" | "overview") =>
      Object.assign(engine, { viewMode }),
  );
  Object.assign(engine, {
    viewMode: mode,
    selected,
    referenceId: "saturn",
    followed: selected,
    flight: { cancel: cancelFlight },
    look: { cancel: vi.fn() },
    bodies: new Map(),
    labels: new Map(),
    controller: { controls: { minDistance: 1 } },
    focusObject,
    configureCoordinateMode,
  });
  return { engine, focusObject, cancelFlight, configureCoordinateMode };
}

describe("engine mode and reset commands", () => {
  it("keeps the last physical target after Escape then Reset", () => {
    const { engine, focusObject, cancelFlight } = navigationHarness(
      "exploration",
      "saturn",
    );
    engine.clearFocus();
    engine.resetView();
    expect(cancelFlight).toHaveBeenCalledOnce();
    expect(focusObject).toHaveBeenCalledWith("saturn", true);
  });
  it("returns from overview to the previous exploration target", () => {
    const { engine, focusObject, configureCoordinateMode } = navigationHarness(
      "overview",
      null,
    );
    engine.setViewMode("exploration");
    expect(configureCoordinateMode).toHaveBeenCalledWith("exploration");
    expect(focusObject).toHaveBeenCalledWith("saturn", true);
  });
  it("switches scale before overview reset and ignores repeated mode updates", () => {
    const { engine, configureCoordinateMode } = navigationHarness(
      "exploration",
      "saturn",
    );
    const reset = vi.spyOn(engine, "resetView").mockImplementation(() => {});
    engine.setViewMode("overview");
    engine.setViewMode("overview");
    expect(configureCoordinateMode).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(configureCoordinateMode.mock.invocationCallOrder[0]).toBeLessThan(
      reset.mock.invocationCallOrder[0],
    );
  });
  it("republishes missing imagery when the same target is focused again", () => {
    const engine = Object.create(UniverseEngine.prototype) as UniverseEngine;
    const onAssetStatus = vi.fn();
    const body = {
      data: { id: "venus" },
      renderRadius: 1,
      tilted: new Group(),
      textureStatus: {
        state: "missing",
        messages: ["No verified full-sphere map"],
      },
      setSelected: vi.fn(),
      ensureTexture: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(engine, {
      viewMode: "exploration",
      selected: "venus",
      bodies: new Map([["venus", body]]),
      labels: new Map(),
      camera: new PerspectiveCamera(),
      lastFollowPosition: new Vector3(),
      controller: {
        controls: { target: new Vector3() },
        setReferenceRadius: vi.fn(),
        setMode: vi.fn(),
      },
      flight: { start: vi.fn() },
      look: { cancel: vi.fn() },
      origin: { toGlobal: (position: Vector3) => position.clone() },
      getGlobalPosition: () => new Vector3(10, 0, 0),
      currentTextureSize: () => 512,
      options: { onAssetStatus },
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    try {
      engine.focusObject("venus");
      engine.focusObject("venus");
      expect(onAssetStatus).toHaveBeenCalledTimes(2);
      expect(onAssetStatus).toHaveBeenLastCalledWith({
        objectId: "venus",
        ...body.textureStatus,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("observation viewport resizing", () => {
  function resizeHarness(followed: "sun" | "moon") {
    const engine = Object.create(UniverseEngine.prototype) as UniverseEngine;
    const camera = new PerspectiveCamera(38, 16 / 9, 0.01, 1_200_000);
    const origin = new FloatingOrigin(32);
    origin.offset.set(1200, -20, 10);
    const center = new Vector3(10, 20, 30);
    const target = origin.toLocal(center);
    camera.position.copy(target).add(new Vector3(0, 0, 500));
    const container = { clientWidth: 1280, clientHeight: 720 };
    const renderResize = vi.fn();
    const flight = { flying: false, offset: new Vector3(0, 0, 500) };
    Object.assign(engine, {
      camera,
      origin,
      container,
      followed,
      flight,
      viewMode: "exploration",
      controller: { controls: { target, update: vi.fn() } },
      renderManager: { resize: renderResize },
      globalPositions: new Map([["sun", center]]),
      focusObject: vi.fn(),
    });
    const resize = (width: number, height: number) => {
      container.clientWidth = width;
      container.clientHeight = height;
      // Invoke the ResizeObserver callback's production path without a WebGL context.
      const callback = Reflect.get(engine, "resize") as () => void;
      callback.call(engine);
    };
    return {
      engine,
      camera,
      origin,
      center,
      target,
      flight,
      renderResize,
      resize,
    };
  }

  it("preserves each mean-distance Sun viewpoint while updating the portrait projection", () => {
    const { engine, camera, origin, center, target, renderResize, resize } =
      resizeHarness("sun");
    for (const distanceAu of [0.387, 1, 5.2, 30.1]) {
      resize(1280, 720);
      engine.observeSunAtDistance(distanceAu);
      const position = camera.position.clone();
      const oldProjection = camera.projectionMatrix.clone();
      for (const [width, height] of [
        [720, 1280],
        [900, 600],
        [360, 780],
      ]) {
        resize(width, height);
        expect(camera.position).toEqual(position);
        expect(
          (origin.toGlobal(camera.position).distanceTo(center) *
            KM_PER_EXPLORATION_UNIT) /
            KM_PER_AU,
        ).toBeCloseTo(distanceAu, 12);
        expect(origin.toGlobal(target)).toEqual(center);
        expect(camera.aspect).toBe(width / height);
        expect(renderResize).toHaveBeenLastCalledWith(width, height);
      }
      expect(camera.projectionMatrix.equals(oldProjection)).toBe(false);
      expect(camera.view?.enabled).toBe(true);
    }
  });

  it("continues fitting ordinary worlds and their active flight offsets to portrait width", () => {
    const { camera, target, flight, resize } = resizeHarness("moon");
    const distance = camera.position.distanceTo(target);
    flight.flying = true;
    const ratio =
      orbitalCameraDistance(1, 9 / 16) / orbitalCameraDistance(1, 16 / 9);
    resize(720, 1280);
    expect(camera.position.distanceTo(target)).toBeCloseTo(
      distance * ratio,
      10,
    );
    expect(flight.offset.length()).toBeCloseTo(500 * ratio, 10);
  });
});

describe("guided solar navigation commands", () => {
  function setup() {
    const engine = Object.create(UniverseEngine.prototype) as UniverseEngine;
    const camera = new PerspectiveCamera(38, 16 / 9);
    const origin = new FloatingOrigin(32);
    origin.offset.set(14900, 3, -10);
    const center = new Vector3(15000, 3, -10);
    const sun = new Vector3(40, -20, 30);
    origin.toLocal(center.clone().add(new Vector3(4, 0, 0)), camera.position);
    const target = origin.toLocal(center);
    camera.lookAt(target);
    const look = new CameraLookController();
    const flight = new FlightController();
    const controller = {
      controls: { target },
      setMode: vi.fn(),
      setReferenceRadius: vi.fn(),
    };
    Object.assign(engine, {
      camera,
      origin,
      look,
      flight,
      controller,
      selected: "earth",
      referenceId: "earth",
      followed: "earth",
      viewMode: "exploration",
      lunar: null,
      lastFollowPosition: center.clone(),
      bodies: new Map([
        ["earth", { renderRadius: 0.6378 }],
        ["sun", { renderRadius: 69.57 }],
      ]),
      globalPositions: new Map([
        ["earth", center],
        ["sun", sun],
      ]),
    });
    return { engine, camera, origin, center, sun, look, flight, controller };
  }
  it("starts a rotation-only Sun look without changing selection or physical observer position", () => {
    const { engine, camera, origin, look, flight, controller } = setup();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    try {
      const before = origin.toGlobal(camera.position);
      expect(engine.lookAtSun()).toBe(true);
      look.pause();
      expect(origin.toGlobal(camera.position)).toEqual(before);
      expect(Reflect.get(engine, "selected")).toBe("earth");
      expect(controller.setMode).toHaveBeenCalledWith("free");
      expect(look.active).toBe(true);
      expect(flight.flying).toBe(false);
    } finally {
      look.cancel();
      vi.unstubAllGlobals();
    }
  });
  it("ends a day-side arc toward the explicit Sun position in the same physical frame", () => {
    const { engine, origin, center, sun, flight, controller } = setup();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    try {
      const originalOrigin = origin.offset.clone();
      expect(engine.goToDaySide()).toBe(true);
      flight.pause();
      expect(flight.orbiting).toBe(true);
      flight.state.progress = 1;
      const result = flight.sample(center);
      const direction = result.position.clone().sub(center).normalize();
      expect(direction.dot(sun.clone().sub(center).normalize())).toBeCloseTo(
        1,
        12,
      );
      expect(result.target).toEqual(center);
      expect(origin.offset).toEqual(originalOrigin);
      expect(controller.setMode).toHaveBeenCalledWith("orbit");
    } finally {
      flight.cancel();
      vi.unstubAllGlobals();
    }
  });
  it("rejects guidance in overview and during an active lunar session", () => {
    const { engine } = setup();
    Object.assign(engine, { viewMode: "overview" });
    expect(engine.lookAtSun()).toBe(false);
    expect(engine.goToDaySide()).toBe(false);
    Object.assign(engine, { viewMode: "exploration", lunar: {} });
    expect(engine.lookAtSun()).toBe(false);
    expect(engine.goToDaySide()).toBe(false);
  });
});
