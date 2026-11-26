import { afterEach, describe, expect, it } from "vitest";
import { Group, PerspectiveCamera, Vector3 } from "three";
import { celestialObjects } from "../../data/catalog";
import type { CelestialObject, ObjectId } from "../../types/celestial";
import { FloatingOrigin } from "../coordinates/FloatingOrigin";
import { CelestialBody } from "../objects/CelestialBody";
import { UniverseEngine } from "./UniverseEngine";

/**
 * Minor-body culling regression: a culled body must leave the scene graph with its
 * label hidden, and anything left in the graph must have a current world transform.
 * A stale (identity) transform once drew Pluto, Eris, Charon … as giant black spheres
 * at the camera, with their labels stacked on top of each other.
 */
const IDS: ObjectId[] = ["sun", "earth", "moon", "jupiter", "himalia", "pluto", "charon", "eris", "nix"];

interface Harness {
  engine: UniverseEngine;
  bodies: Map<ObjectId, CelestialBody>;
  labels: Map<ObjectId, { hidden: boolean; style: { transform: string } }>;
  solarRoot: Group;
  update(): void;
  dispose(): void;
}

function harness(selected: ObjectId = "earth"): Harness {
  const objects = IDS.map((id) => celestialObjects.find((object) => object.id === id)!) as CelestialObject[];
  const bodies = new Map(objects.map((object) => [object.id, new CelestialBody(object)]));
  const solarRoot = new Group();
  for (const body of bodies.values()) solarRoot.add(body.anchor);
  const labels = new Map(objects.map((object) => [object.id, { hidden: false, style: { transform: "" } }]));
  const camera = new PerspectiveCamera(45, 1915 / 853, 0.0001, 1e9);
  const engine = Object.create(UniverseEngine.prototype) as UniverseEngine;
  Object.assign(engine, {
    options: { objects, simulationEpoch: "2026-01-01T00:00:00.000Z" },
    days: 328.3,
    viewMode: "exploration",
    bodies,
    labels,
    solarRoot,
    camera,
    origin: new FloatingOrigin(100),
    globalPositions: new Map(),
    modeledKm: new Map(),
    height: 853,
    width: 1915,
    selected,
    followed: selected,
    orbitsVisible: true,
    labelScratch: new Vector3(),
    labelDirection: new Vector3(),
    curatedObjects: [],
    curatedBodies: [],
    minor: [],
    minorCursor: 0,
    minorMode: null,
  });
  const internal = engine as unknown as {
    partitionBodies(objects: readonly CelestialObject[]): void;
    updateBodies(): void;
    globalPositions: Map<ObjectId, Vector3>;
    origin: FloatingOrigin;
  };
  internal.partitionBodies(objects);
  // Camera 3 Earth radii from Earth, as in the default exploration view.
  const update = () => {
    internal.updateBodies();
    const earth = internal.origin.toLocal(internal.globalPositions.get("earth")!);
    camera.position.copy(earth).add(new Vector3(0, 0, 3 * bodies.get("earth")!.renderRadius));
    camera.lookAt(earth);
    camera.updateMatrixWorld();
    internal.updateBodies();
  };
  return { engine, bodies, labels, solarRoot, update, dispose: () => bodies.forEach((body) => body.dispose()) };
}

function expectCurrentTransforms(h: Harness): void {
  const internal = h.engine as unknown as { globalPositions: Map<ObjectId, Vector3>; origin: FloatingOrigin };
  for (const [id, body] of h.bodies) {
    if (body.anchor.parent !== h.solarRoot) continue;
    const expected = internal.origin.toLocal(internal.globalPositions.get(id)!);
    const world = body.anchor.getWorldPosition(new Vector3());
    expect(world.distanceTo(expected), `${id} world transform is stale`).toBeLessThan(1e-6 * Math.max(1, expected.length()));
  }
}

describe("minor-body culling", () => {
  let current: Harness | null = null;
  afterEach(() => {
    current?.dispose();
    current = null;
  });

  it("detaches sub-pixel minor bodies and hides their labels; curated bodies stay", () => {
    current = harness();
    current.update();
    // Pluto and Charon now have maps (full renderer); Eris and Nix remain minor bodies.
    for (const id of ["himalia", "eris", "nix"]) {
      const body = current.bodies.get(id)!;
      expect(body.curated).toBe(false);
      expect(body.culled, id).toBe(true);
      expect(body.anchor.parent, id).toBeNull();
      expect(current.labels.get(id)!.hidden, id).toBe(true);
    }
    for (const id of ["earth", "moon", "jupiter"]) expect(current.bodies.get(id)!.anchor.parent).toBe(current.solarRoot);
    expectCurrentTransforms(current);
  });

  it("never leaves a drawn body at a stale transform near the camera", () => {
    current = harness();
    current.update();
    const camera = (current.engine as unknown as { camera: PerspectiveCamera }).camera;
    for (const [id, body] of current.bodies) {
      if (body.anchor.parent !== current.solarRoot || id === "earth") continue;
      // Everything else is at least the Moon's distance away (~36 render units).
      expect(body.anchor.getWorldPosition(new Vector3()).distanceTo(camera.position), id).toBeGreaterThan(10);
    }
  });

  it("re-attaches a selected minor body at its true position", () => {
    current = harness("himalia");
    current.update();
    const himalia = current.bodies.get("himalia")!;
    expect(himalia.culled).toBe(false);
    expect(himalia.anchor.parent).toBe(current.solarRoot);
    expectCurrentTransforms(current);
    // Himalia orbits Jupiter at ~11.4 million km (≈1,140 render units).
    const jupiter = current.bodies.get("jupiter")!.anchor.getWorldPosition(new Vector3());
    const distance = himalia.anchor.getWorldPosition(new Vector3()).distanceTo(jupiter);
    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1400);
  });

  it("builds no orbit lines for minor bodies outside Overview", () => {
    current = harness("himalia");
    current.update();
    for (const id of ["himalia", "eris", "nix"]) expect(current.bodies.get(id)!.hasOrbitLine, id).toBe(false);
  });

  it("extends the exploration camera bound to reach bodies beyond ~67 AU (Eris)", () => {
    current = harness();
    const internal = current.engine as unknown as {
      explorationBound(): number;
      globalPositions: Map<ObjectId, Vector3>;
      followed: ObjectId | null;
      selected: ObjectId | null;
    };
    expect(internal.explorationBound()).toBe(1_000_000);
    // Eris is ~95 AU away in 2026: 1.43 million render units, past the old fixed bound.
    internal.globalPositions.set("eris", new Vector3(1_430_000, 0, 0));
    internal.followed = "eris";
    internal.selected = "eris";
    expect(internal.explorationBound()).toBeGreaterThan(1_430_000 * 1.2);
  });

  it("resolves a moon of a minor parent (Charon around Pluto) parent-first", () => {
    current = harness("charon");
    current.update();
    const pluto = current.bodies.get("pluto")!;
    const charon = current.bodies.get("charon")!;
    expect(charon.anchor.parent).toBe(current.solarRoot);
    const separationKm = charon.anchor.getWorldPosition(new Vector3())
      .distanceTo(pluto.anchor.getWorldPosition(new Vector3())) * 10_000;
    // Pluto is culled (detached) but its position is still current: Charon's offset
    // is added to it, so the separation is the real ~19,600 km orbit.
    const internal = current.engine as unknown as { globalPositions: Map<ObjectId, Vector3>; origin: FloatingOrigin };
    const plutoLocal = internal.origin.toLocal(internal.globalPositions.get("pluto")!);
    const charonLocal = charon.anchor.getWorldPosition(new Vector3());
    expect(charonLocal.distanceTo(plutoLocal) * 10_000).toBeGreaterThan(17_000);
    expect(charonLocal.distanceTo(plutoLocal) * 10_000).toBeLessThan(22_000);
    expect(Number.isFinite(separationKm)).toBe(true);
  });
});
