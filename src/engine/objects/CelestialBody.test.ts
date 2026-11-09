import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial, Texture } from "three";
import { objectById } from "../../data/catalog";
import {
  scientificTextures,
  type TextureLease,
} from "../loaders/ScientificTextureLoader";
import { CelestialBody } from "./CelestialBody";
import { loadDeimosModel } from "./DeimosModel";

vi.mock("./DeimosModel", () => ({ loadDeimosModel: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(loadDeimosModel).mockReset();
});

describe("body scale and asynchronous resource lifecycle", () => {
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

  it("uses the irregular Deimos mesh at every LOD and clears its GPU resources", async () => {
    const geometry = new BoxGeometry(0.15, 0.12, 0.105);
    const material = new MeshStandardMaterial();
    const dispose = vi.fn();
    vi.mocked(loadDeimosModel).mockResolvedValue({ geometry, material, dispose });
    const deimos = new CelestialBody(objectById.deimos);
    expect(deimos.outerRenderRadius).toBeCloseTo(deimos.renderRadius * 1.3);
    await deimos.ensureTexture(512);
    expect(loadDeimosModel).toHaveBeenCalledWith(0.07, 6.2);
    expect(deimos.surface.levels).toHaveLength(3);
    deimos.surface.levels.forEach(({ object }) => {
      expect(object).toBeInstanceOf(Mesh);
      expect((object as Mesh).geometry).toBe(geometry);
      expect((object as Mesh).material).toBe(material);
    });
    deimos.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a Deimos model that finishes loading after the body is gone", async () => {
    let finish!: (model: {
      geometry: BoxGeometry;
      material: MeshStandardMaterial;
      dispose: () => void;
    }) => void;
    vi.mocked(loadDeimosModel).mockImplementation(
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
