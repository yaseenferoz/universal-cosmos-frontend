import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExoplanetFile, searchPlanets } from "./exoplanets";
import { mergeExoplanets, parseStarCatalog, searchStars, starDisplayName, starDistancePc, type StarNames } from "./starCatalog";

const bin = readFileSync(new URL("../../../public/stars/hyg-v41.bin", import.meta.url));
const meta = JSON.parse(readFileSync(new URL("../../../public/stars/hyg-v41-names.json", import.meta.url), "utf8")) as {
  names: Record<string, StarNames>; attribution: string; license: string;
};
const hyg = parseStarCatalog(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta.names, meta.attribution, meta.license);
const file: unknown = JSON.parse(readFileSync(new URL("../../../public/stars/exoplanets.json", import.meta.url), "utf8"));
const data = parseExoplanetFile(file, hyg.count);
const catalog = mergeExoplanets(hyg, data);
const LY_PER_PC = 3.261563777;

function system(name: string) {
  const [star] = searchStars(catalog, name, 1);
  if (star === undefined) throw new Error(`${name} not found`);
  const found = catalog.systems.get(star);
  if (!found) throw new Error(`${name} has no planets`);
  return found;
}

describe("installed exoplanet systems (NASA Exoplanet Archive)", () => {
  it("covers thousands of confirmed planets and credits the archive", () => {
    expect(data.planetCount).toBeGreaterThan(6000);
    expect(catalog.systems.size).toBeGreaterThan(4500);
    expect(catalog.exoplanets?.acknowledgement).toContain("NASA Exoplanet Archive");
    // HYG stars keep their indices; archive-only hosts are appended after them.
    expect(catalog.hygCount).toBe(hyg.count);
    expect(catalog.count).toBe(hyg.count + data.appended.length);
    expect(starDisplayName(catalog, 0)).toBe("Sun");
  });

  it("attaches planets to nearby HYG stars", () => {
    const proxima = system("Proxima Centauri");
    expect(proxima.inHyg).toBe(true);
    expect(proxima.planets.map((p) => p.name)).toContain("Proxima Cen b");
    expect(starDistancePc(catalog, proxima.star) * LY_PER_PC).toBeCloseTo(4.24, 1);
    const pegasi = system("51 Pegasi");
    expect(pegasi.planets[0].name).toBe("51 Peg b");
    expect(pegasi.planets[0].periodDays).toBeCloseTo(4.23, 2);
    expect(system("Barnard's Star").planets.length).toBeGreaterThanOrEqual(1);
  });

  it("places hosts missing from HYG at their archive distance, with measured stellar parameters", () => {
    const trappist = system("TRAPPIST-1");
    expect(trappist.inHyg).toBe(false);
    expect(trappist.star).toBeGreaterThanOrEqual(catalog.hygCount);
    expect(trappist.planets.map((p) => p.name.slice(-1))).toEqual(["b", "c", "d", "e", "f", "g", "h"]);
    expect(starDistancePc(catalog, trappist.star)).toBeCloseTo(12.43, 1);
    expect(catalog.temperatureK[trappist.star]).toBeCloseTo(2566, 0);
    // Absolute V from V = 17.02 at 12.43 pc: an ultracool dwarf.
    expect(catalog.absMag[trappist.star]).toBeGreaterThan(16);
    const e = trappist.planets[3];
    expect(e.semiMajorAxisAu).toBeCloseTo(0.029, 3);
    expect(e.transiting).toBe(true);
    expect(e.conjunctionJd).toBeGreaterThan(2457000);
  });

  it("finds systems by planet name and planets by name", () => {
    const trappist = system("TRAPPIST-1");
    expect(searchStars(catalog, "TRAPPIST-1 e", 3)).toContain(trappist.star);
    expect(searchPlanets(catalog.systems, "trappist-1 e")).toEqual([[trappist.star, 3]]);
  });

  it("rejects files that are not exoplanet tables and skips malformed entries", () => {
    expect(() => parseExoplanetFile({ systems: [] }, 10)).toThrow();
    const parsed = parseExoplanetFile({
      meta: { methods: ["Transit"] },
      systems: [
        { host: "Bad index", star: 99, planets: [{ n: "b" }] },
        { host: "No planets", star: 1, planets: [] },
        { host: "No position", planets: [{ n: "b" }] },
        { host: "Good", pos: [1, 2, 3], mv: 5, planets: [{ n: "b", a: 0.1, e: 1.5, method: 0 }, { a: 1 }] },
      ],
    }, 10);
    expect(parsed.matched.size).toBe(0);
    expect(parsed.appended).toHaveLength(1);
    expect(parsed.appended[0].system.planets).toHaveLength(1);
    expect(parsed.appended[0].system.planets[0]).toMatchObject({ name: "Good b", semiMajorAxisAu: 0.1, eccentricity: undefined, method: "Transit" });
  });
});
