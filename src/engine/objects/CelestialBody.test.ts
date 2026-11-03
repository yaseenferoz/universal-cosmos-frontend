import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import { objectById } from "../../data/catalog";
import {
  scientificTextures,
  type TextureLease,
} from "../loaders/ScientificTextureLoader";
import { CelestialBody } from "./CelestialBody";

afterEach(() => vi.restoreAllMocks());

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
});
