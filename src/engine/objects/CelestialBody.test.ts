import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial, Texture, Vector3 } from "three";
import { objectById } from "../../data/catalog";
import {
  scientificTextures,
  type TextureLease,
} from "../loaders/ScientificTextureLoader";
import { CelestialBody } from "./CelestialBody";
import { loadShapeModel } from "./ShapeModel";
import { shapeModelFor } from "../../data/shapeModels";
import { earthOrientationAt } from "../coordinates/EarthOrientation";
import { advanceSimulationDays, daysSinceModelEpoch, REAL_TIME_DAYS_PER_SECOND, simulationUtcMs } from "../../utils/simulationTime";

vi.mock("./ShapeModel", () => ({ loadShapeModel: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(loadShapeModel).mockReset();
});

describe("body scale and asynchronous resource lifecycle", () => {
  it("drives Earth, clouds and surface coordinates from the displayed epoch and clock", () => {
    const earth = new CelestialBody(objectById.earth);
    const epoch = "2000-01-01T12:00:00.000Z";
    const now = Date.UTC(2026, 10, 19, 12);
    const sun = new Vector3(1, 0, 0);
    let days = daysSinceModelEpoch(now, epoch);
    earth.rotate(days, epoch, sun);
    const expected = earthOrientationAt(simulationUtcMs(days, epoch), sun);
    expect(earth.surface.rotation.y).toBeCloseTo(expected.spinRadians, 12);
    expect(earth.tilted.quaternion.angleTo(expected.poleRotation)).toBeLessThan(1e-7);
    const clouds = earth.tilted.children.find(child => child instanceof Mesh && child.material instanceof MeshStandardMaterial);
    expect(clouds?.rotation.y).toBeCloseTo(earth.surface.rotation.y, 12);
    const frozen = earth.surface.rotation.y;
    days = advanceSimulationDays(days, 10, false, REAL_TIME_DAYS_PER_SECOND, now + 10000, epoch);
    earth.rotate(days, epoch, sun);
    expect(earth.surface.rotation.y).toBe(frozen);
    // Real-time resumption uses wall UTC; accelerated playback uses simulated UTC.
    days = advanceSimulationDays(days, 1, true, REAL_TIME_DAYS_PER_SECOND, now + 3_600_000, epoch);
    earth.rotate(days, epoch, sun);
    expect(earth.surface.rotation.y).toBeCloseTo(earthOrientationAt(now + 3_600_000).spinRadians, 10);
    days = advanceSimulationDays(days, 2, true, 0.1, now, epoch);
    earth.rotate(days, epoch, sun);
    expect(earth.surface.rotation.y).toBeCloseTo(earthOrientationAt(now + 3_600_000 + 0.2 * 86_400_000).spinRadians, 10);
    earth.dispose();
  });
  it("changes render radius without changing catalog dimensions or child orbit scale", () => {
    const earth = new CelestialBody(objectById.earth);
    const physicalRadius = earth.data.radiusKm;
    earth.setRenderRadius(0.6378);
    expect(earth.renderRadius).toBe(0.6378);
    expect(earth.anchor.scale.x).toBe(1);
    expect(earth.tilted.scale.x).toBeCloseTo(0.6378 / 0.9);
    expect(earth.data.radiusKm).toBe(physicalRadius);
    earth.dispose();
  });

  it("releases textures that arrive after body disposal instead of attaching them", async () => {
    const finish: ((lease: TextureLease) => void)[] = [];
    vi.spyOn(scientificTextures, "acquire").mockImplementation(
      () => new Promise((resolve) => finish.push(resolve)),
    );
    const earth = new CelestialBody(objectById.earth);
    const request = earth.ensureTexture(512);
    const releases = finish.map(() => vi.fn());
    earth.dispose();
    finish.forEach((resolve, index) =>
      resolve({ texture: new Texture(), release: releases[index] }),
    );
    await request;
    expect(releases.length).toBeGreaterThanOrEqual(3);
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
  });

  it("reports a failed source and retains a usable renderer", async () => {
    vi.spyOn(scientificTextures, "acquire").mockRejectedValue(new Error("404"));
    const earth = new CelestialBody(objectById.earth);
    await expect(earth.ensureTexture(512)).resolves.toBeUndefined();
    expect(earth.textureStatus.state).toBe("partial");
    expect(
      earth.textureStatus.messages.some((message) =>
        message.includes("could not be loaded"),
      ),
    ).toBe(true);
    earth.dispose();
  });

  it("uses the published Deimos model at every LOD and clears its GPU resources", async () => {
    const geometry = new BoxGeometry(2.5, 1.8, 1.5);
    const material = new MeshStandardMaterial();
    const dispose = vi.fn();
    vi.mocked(loadShapeModel).mockResolvedValue({ geometry, material, dispose });
    const deimos = new CelestialBody(objectById.deimos);
    const asset = shapeModelFor("deimos")!;
    // Framed for the measured model extent before it loads.
    expect(deimos.outerRenderRadius).toBeCloseTo(deimos.renderRadius * asset.extent);
    expect(deimos.hasIrregularShape).toBe(true);
    await deimos.ensureTexture(512);
    expect(loadShapeModel).toHaveBeenCalledWith(asset);
    expect(deimos.surface.levels).toHaveLength(3);
    deimos.surface.levels.forEach(({ object }) => {
      expect(object).toBeInstanceOf(Mesh);
      expect((object as Mesh).geometry).toBe(geometry);
      expect((object as Mesh).material).toBe(material);
      // Unit-radius model geometry is scaled to the display radius.
      expect((object as Mesh).scale.x).toBeCloseTo(objectById.deimos.display.radius);
    });
    expect(deimos.textureStatus.messages.join(" ")).toContain("NASA/JPL-Caltech");
    deimos.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a shape model that finishes loading after the body is gone", async () => {
    let finish!: (model: {
      geometry: BoxGeometry;
      material: MeshStandardMaterial;
      dispose: () => void;
    }) => void;
    vi.mocked(loadShapeModel).mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    const deimos = new CelestialBody(objectById.deimos);
    const request = deimos.ensureTexture(512);
    deimos.dispose();
    const dispose = vi.fn();
    finish({ geometry: new BoxGeometry(), material: new MeshStandardMaterial(), dispose });
    await request;
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("published rotation models", () => {
  it("points Saturn's pole and ring plane along the IAU pole", () => {
    const saturn = new CelestialBody(objectById.saturn);
    saturn.rotate(330);
    const pole = new Vector3(0, 1, 0).applyQuaternion(saturn.tilted.quaternion);
    // IAU pole: RA 40.589 deg, Dec 83.537 deg (ICRF) -> J2000 ecliptic -> engine axes.
    const ra = (40.589 - 0.036 * 0.2608) * Math.PI / 180, dec = (83.537 - 0.004 * 0.2608) * Math.PI / 180;
    const eq = new Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
    const eps = 23.4392911 * Math.PI / 180;
    const ecl = new Vector3(eq.x, eq.y * Math.cos(eps) + eq.z * Math.sin(eps), -eq.y * Math.sin(eps) + eq.z * Math.cos(eps));
    expect(pole.angleTo(new Vector3(ecl.x, ecl.z, -ecl.y))).toBeLessThan(1e-4);
    saturn.dispose();
  });
});

describe("orientation at an arbitrary time (used to find local daylight)", () => {
  it("matches rotate() exactly for spin-only bodies and Earth, without changing the scene", () => {
    const sun = new Vector3(0.3, 0.1, -0.95).normalize();
    for (const id of ["moon", "mars", "earth"] as const) {
      const body = new CelestialBody(objectById[id]);
      body.rotate(123.4, undefined, id === "earth" ? sun : undefined);
      const expected = body.tilted.quaternion.clone().multiply(body.surface.quaternion);
      body.rotate(7, undefined, id === "earth" ? sun : undefined);
      const before = body.tilted.quaternion.clone().multiply(body.surface.quaternion);
      const computed = body.rotationAt(123.4, undefined, id === "earth" ? sun : undefined);
      expect(computed.angleTo(expected), id).toBeLessThan(1e-6);
      // Pure: the scene still shows day 7.
      expect(body.tilted.quaternion.clone().multiply(body.surface.quaternion).angleTo(before), id).toBeLessThan(1e-6);
      body.dispose();
    }
  });
});
