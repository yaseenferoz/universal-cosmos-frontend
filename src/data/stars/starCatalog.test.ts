import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  bayerFlamsteed, parseStarCatalog, searchStars, starDesignations, starDisplayName, starDistancePc,
  type StarNames,
} from "./starCatalog";
import { raDecToEngine } from "../../engine/effects/skyOrientation";

const bin = readFileSync(new URL("../../../public/stars/hyg-v41.bin", import.meta.url));
const meta = JSON.parse(readFileSync(new URL("../../../public/stars/hyg-v41-names.json", import.meta.url), "utf8")) as {
  names: Record<string, StarNames>; attribution: string; license: string; count: number;
};
const catalog = parseStarCatalog(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta.names, meta.attribution, meta.license);
const LY_PER_PC = 3.261563777;

function find(name: string): number {
  const [index] = searchStars(catalog, name, 1);
  if (index === undefined) throw new Error(`${name} not found`);
  return index;
}

describe("installed 3D star catalogue (HYG v4.1)", () => {
  it("has the Sun at the origin and over 100,000 stars with attribution", () => {
    expect(catalog.count).toBe(meta.count);
    expect(catalog.count).toBeGreaterThan(100_000);
    expect(starDisplayName(catalog, 0)).toBe("Sun");
    expect(starDistancePc(catalog, 0)).toBe(0);
    expect(catalog.license).toBe("CC BY-SA 4.0");
    expect(catalog.attribution).toContain("HYG");
  });

  it("places nearby stars at their parallax distances", () => {
    expect(starDistancePc(catalog, find("Proxima Centauri")) * LY_PER_PC).toBeCloseTo(4.24, 1);
    expect(starDistancePc(catalog, find("Sirius")) * LY_PER_PC).toBeCloseTo(8.6, 1);
    expect(starDistancePc(catalog, find("Barnard's Star")) * LY_PER_PC).toBeCloseTo(5.96, 1);
    // A faint red dwarf missing from Hipparcos comes from the Gliese catalogue.
    expect(starDistancePc(catalog, find("Wolf 359")) * LY_PER_PC).toBeCloseTo(7.8, 0);
  });

  it("puts stars in the same engine frame as the planets and the sky map", () => {
    const sirius = find("Sirius");
    const direction = new Vector3(catalog.positions[sirius * 3], catalog.positions[sirius * 3 + 1], catalog.positions[sirius * 3 + 2]).normalize();
    // Sirius: RA 101.287°, Dec −16.716° (J2000).
    expect(direction.angleTo(raDecToEngine(101.287, -16.716)) * 180 / Math.PI).toBeLessThan(0.05);
  });

  it("names stars the way astronomers do and finds them by any designation", () => {
    const rigil = find("Rigil Kentaurus");
    expect(bayerFlamsteed(catalog.names.get(rigil))).toBe("α¹ Centauri");
    expect(find("alpha centauri")).toBe(rigil);
    expect(find("tau ceti")).toBe(find("τ Ceti"));
    expect(searchStars(catalog, "HIP 70890")).toEqual([find("Proxima Centauri")]);
    expect(starDesignations(catalog, rigil)).toEqual(expect.arrayContaining(["Rigil Kentaurus", "α¹ Centauri", "HIP 71683"]));
    expect(find("61 Cygni")).toBeGreaterThan(0);
  });

  it("rejects malformed catalogue files", () => {
    expect(() => parseStarCatalog(new ArrayBuffer(8))).toThrow();
    const truncated = bin.buffer.slice(bin.byteOffset, bin.byteOffset + 16 + 20 * 10);
    expect(() => parseStarCatalog(truncated)).toThrow(/truncated/);
  });
});
