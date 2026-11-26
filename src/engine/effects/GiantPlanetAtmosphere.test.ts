import { describe, expect, it } from "vitest";
import { Texture, Vector3 } from "three";
import { deckHitDistanceKm, GIANT_ATMOSPHERES, GiantPlanetAtmosphere } from "./GiantPlanetAtmosphere";

describe("giant-planet cloud deck view", () => {
  it("has a profile for each giant, with cyan ice-giant skies", () => {
    for (const id of ["jupiter", "saturn", "uranus", "neptune"]) expect(GIANT_ATMOSPHERES[id], id).toBeDefined();
    const blueRatio = (hex: string) => parseInt(hex.slice(5, 7), 16) / Math.max(1, parseInt(hex.slice(1, 3), 16));
    // Methane absorbs red light: ice-giant zeniths are bluer than Jupiter's.
    expect(blueRatio(GIANT_ATMOSPHERES.neptune!.zenithColor)).toBeGreaterThan(blueRatio(GIANT_ATMOSPHERES.jupiter!.zenithColor));
  });

  it("finds the deck straight below and the horizon distance, and misses above the horizon", () => {
    const deck = 71_492 + 10, observer = deck + 15;
    expect(deckHitDistanceKm(observer, deck, -1)).toBeCloseTo(15, 6);
    const horizon = Math.sqrt(observer ** 2 - deck ** 2);
    // Just below the geometric horizon the ray still meets the deck near the horizon distance.
    const grazing = -Math.sqrt(1 - (deck / observer) ** 2) - 1e-7;
    expect(deckHitDistanceKm(observer, deck, grazing)).toBeCloseTo(horizon, -1);
    expect(deckHitDistanceKm(observer, deck, 0.1)).toBe(Infinity);
    expect(deckHitDistanceKm(observer, deck, -0.001)).toBe(Infinity);
  });

  it("tracks the observer and Sun, samples band colours, and releases resources", () => {
    const sky = new GiantPlanetAtmosphere(GIANT_ATMOSPHERES.jupiter!, 71_492);
    const position = new Vector3(0, (71_492 + 25) * 1000, 0);
    sky.update(position, new Vector3(0, 1, 0), 25_000, 1 / 27);
    const u = sky.mesh.material.uniforms;
    expect(u.observerHeightKm.value).toBeCloseTo(15, 3);
    expect(u.daylight.value).toBe(1);
    expect(u.irradiance.value).toBeCloseTo(1 / 27);
    sky.update(position, new Vector3(0, -1, 0), 25_000, 1 / 27);
    expect(u.daylight.value).toBe(0);
    expect(u.hasBandMap.value).toBe(0);
    sky.setBandMap(new Texture());
    expect(u.hasBandMap.value).toBe(1);
    // Premultiplied blending: the sky adds light and the air dims what lies behind.
    expect(sky.mesh.material.depthTest).toBe(false);
    sky.dispose();
  });
});
