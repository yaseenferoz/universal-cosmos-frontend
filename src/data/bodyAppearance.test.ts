import { describe, expect, it } from "vitest";
import { bodyAppearance, displayAlbedo, estimatedVr, reflectanceRgb, SOLAR_BV, SOLAR_VR } from "./bodyAppearance";

const asteroid = (id: string) => ({ id, parentId: "sun", category: "Main-belt asteroid" });

describe("measured small-body appearance", () => {
  it("uses Eros's published albedo, S-type colour and 34.4 x 11.2 x 11.2 km extent", () => {
    const eros = bodyAppearance({ id: "eros", parentId: "sun", category: "Near-Earth asteroid" });
    expect(eros.albedo).toBe(0.25);
    expect(eros.axes).toEqual([34.4, 11.2, 11.2]);
    expect(eros.illustrative).toEqual([]);
    const [r, g, b] = eros.rgb;
    // Stony asteroids are red-sloped: brighter in R than V, darker in B.
    expect(r).toBeGreaterThan(g);
    expect(b).toBeLessThan(g);
    expect(eros.sources.join(" ")).toContain("Small-Body Database");
  });

  it("keeps carbonaceous Hygiea near-neutral and dark, and very red Sedna red", () => {
    const hygiea = bodyAppearance(asteroid("hygiea"));
    expect(hygiea.rgb[0] / hygiea.rgb[1]).toBeCloseTo(1, 1);
    expect(hygiea.rgb[2] / hygiea.rgb[1]).toBeGreaterThan(0.9);
    const sedna = bodyAppearance({ id: "sedna", parentId: "sun", category: "Detached trans-Neptunian object" });
    expect(sedna.rgb[0] / sedna.rgb[2]).toBeGreaterThan(1.5);
    expect(hygiea.rgb[1]).toBeLessThan(bodyAppearance(asteroid("eros")).rgb[1]);
  });

  it("discloses family defaults for an unmeasured captured moon", () => {
    const moon = bodyAppearance({ id: "s2004s12", parentId: "saturn", category: "Natural satellite" }, { irregularOrbit: true });
    expect(moon.illustrative).toEqual(expect.arrayContaining(["albedo", "colour", "shape"]));
    expect(moon.albedo).toBe(0.05);
    expect(moon.axes).toBeNull();
    expect(moon.icy).toBe(true);
    expect(moon.family).toContain("irregular");
  });

  it("orders display brightness by albedo while keeping dark bodies legible", () => {
    const enceladus = displayAlbedo(1.04), bennu = displayAlbedo(0.044), mimas = displayAlbedo(0.6);
    expect(mimas).toBeCloseTo(0.62, 5);
    expect(enceladus).toBeGreaterThan(mimas);
    expect(enceladus / bennu).toBeGreaterThan(4);
    expect(enceladus / bennu).toBeLessThan(25);
    for (let p = 0.01; p < 1.4; p += 0.05) expect(displayAlbedo(p + 0.05)).toBeGreaterThanOrEqual(displayAlbedo(p));
  });

  it("renders solar-coloured reflectance as grey", () => {
    const [r, g, b] = reflectanceRgb(SOLAR_BV, SOLAR_VR, 0.3);
    expect(r).toBeCloseTo(g, 10);
    expect(b).toBeCloseTo(g, 10);
    expect(estimatedVr(0.86)).toBeCloseTo(0.48, 1);
  });
});
