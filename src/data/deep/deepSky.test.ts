import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDeepSkyCatalog, deepDisplayName, MILKY_WAY_REF, searchDeepSky } from "./deepSky";
import { GALAXY_FLAGS, GALAXY_RECORD_BYTES, galaxyDistancePc, galaxyMorphology, morphologyLabel, parseGalaxyFile } from "./galaxies";
import { parseNebulaFile } from "./nebulae";

const bin = readFileSync(new URL("../../../public/deep/galaxies.bin", import.meta.url));
const meta: unknown = JSON.parse(readFileSync(new URL("../../../public/deep/galaxies.json", import.meta.url), "utf8"));
const nebulaFile: unknown = JSON.parse(readFileSync(new URL("../../../public/deep/nebulae.json", import.meta.url), "utf8"));
const galaxies = parseGalaxyFile(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), meta);
const catalog = createDeepSkyCatalog(galaxies, parseNebulaFile(nebulaFile));

function galaxy(query: string): number {
  const ref = searchDeepSky(catalog, query, 1)[0];
  if (ref?.kind !== "galaxy") throw new Error(`${query} is not a catalogued galaxy`);
  return ref.index;
}

function nebula(query: string) {
  const ref = searchDeepSky(catalog, query, 1)[0];
  if (ref?.kind !== "nebula") throw new Error(`${query} is not a catalogued nebula`);
  return catalog.nebulae.nebulae[ref.index];
}

describe("installed galaxy catalogue (UNGC + 2MRS + Cosmicflows-4)", () => {
  it("covers the 2MASS Redshift Survey and the Local Volume with credited sources", () => {
    expect(galaxies.count).toBeGreaterThan(40_000);
    let local = 0;
    for (let i = 0; i < galaxies.count; i++) if (galaxies.flags[i] & GALAXY_FLAGS.localVolume) local++;
    expect(local).toBeGreaterThan(800);
    expect(galaxies.sources.join(" ")).toMatch(/Karachentsev.*Huchra.*Tully/s);
    expect(galaxies.hubbleConstant).toBeCloseTo(74.6, 1);
  });

  it("places well-measured galaxies at their published distances", () => {
    const m31 = galaxy("Andromeda Galaxy");
    expect(galaxyDistancePc(galaxies, m31) / 1e6).toBeGreaterThan(0.7);
    expect(galaxyDistancePc(galaxies, m31) / 1e6).toBeLessThan(0.82);
    expect(galaxies.methods[galaxies.method[m31]]).toMatch(/Cepheid/);
    expect(galaxyMorphology(galaxies.tType[m31])).toBe("spiral");
    const lmc = galaxy("Large Magellanic Cloud");
    expect(galaxyDistancePc(galaxies, lmc) / 1e3).toBeCloseTo(50, -1);
    // Virgo cluster (M 87) ~16.5 Mpc; Coma (NGC 4889) ~100 Mpc.
    expect(galaxyDistancePc(galaxies, galaxy("M 87")) / 1e6).toBeGreaterThan(14);
    expect(galaxyDistancePc(galaxies, galaxy("M 87")) / 1e6).toBeLessThan(19);
    expect(galaxyDistancePc(galaxies, galaxy("NGC 4889")) / 1e6).toBeGreaterThan(85);
    expect(galaxyDistancePc(galaxies, galaxy("NGC 4889")) / 1e6).toBeLessThan(115);
  });

  it("stores unit disk normals, positive sizes and finite positions for every galaxy", () => {
    for (let i = 0; i < galaxies.count; i += 97) {
      const n = Math.hypot(galaxies.normals[i * 3], galaxies.normals[i * 3 + 1], galaxies.normals[i * 3 + 2]);
      expect(n).toBeCloseTo(1, 5);
      expect(galaxies.radiusPc[i]).toBeGreaterThan(0);
      expect(Number.isFinite(galaxyDistancePc(galaxies, i))).toBe(true);
      expect(galaxies.names[i].length).toBeGreaterThan(0);
    }
  });

  it("rejects truncated files", () => {
    expect(() => parseGalaxyFile(new ArrayBuffer(GALAXY_RECORD_BYTES * 2), { count: 3, recordBytes: GALAXY_RECORD_BYTES, names: [[], [], []] })).toThrow();
    expect(() => parseGalaxyFile(new ArrayBuffer(0), null)).toThrow();
  });

  it("labels Hubble types", () => {
    expect(morphologyLabel(3, 2)).toBe("Barred spiral galaxy (SBb)");
    expect(morphologyLabel(5, 0)).toBe("Spiral galaxy (Sc)");
    expect(morphologyLabel(-5, 0)).toBe("Elliptical galaxy (E)");
    expect(morphologyLabel(10, 0)).toBe("Irregular galaxy (Im)");
    expect(morphologyLabel(Number.NaN, 0)).toBe("Galaxy (type not classified)");
  });
});

describe("installed nebula catalogue", () => {
  it("adopts published distances with their sources", () => {
    const orion = nebula("Orion Nebula");
    expect(orion.kind).toBe("emission");
    expect(orion.distancePc).toBeGreaterThan(380);
    expect(orion.distancePc).toBeLessThan(450);
    expect(orion.reference).toMatch(/^\d{4}/);
    const ring = nebula("Ring Nebula");
    expect(ring.kind).toBe("planetary");
    expect(ring.method).toMatch(/Gaia/);
    // The catalogued 1.3′ outline at ~790 pc is about a light-year across.
    expect(ring.radiusPc * 2 * 3.2616).toBeGreaterThan(0.6);
    expect(ring.radiusPc * 2 * 3.2616).toBeLessThan(1.5);
    const crab = nebula("Crab Nebula");
    expect(crab.kind).toBe("supernova");
    expect(crab.filled).toBe(true);
    expect(nebula("Cygnus Loop").names).toContain("Veil Nebula");
    // Members of the Large Magellanic Cloud take its eclipsing-binary distance.
    expect(nebula("Tarantula Nebula").distancePc / 1e3).toBeCloseTo(49.6, 1);
  });

  it("skips malformed entries rather than guessing", () => {
    const parsed = parseNebulaFile({ meta: {}, nebulae: [{ names: ["x"], kind: "emission", p: [1, 2], r: 1, d: 10, axis: [1, 0, 0] }, { names: [], kind: "emission" }, null] });
    expect(parsed.nebulae).toHaveLength(0);
    expect(() => parseNebulaFile({})).toThrow();
  });
});

describe("deep-sky search", () => {
  it("finds objects by common name, Messier and NGC designations, spacing-insensitively", () => {
    expect(deepDisplayName(catalog, searchDeepSky(catalog, "M31", 1)[0])).toBe("Andromeda Galaxy");
    expect(deepDisplayName(catalog, searchDeepSky(catalog, "NGC 224", 1)[0])).toBe("Andromeda Galaxy");
    expect(deepDisplayName(catalog, searchDeepSky(catalog, "m 42", 1)[0])).toBe("Orion Nebula");
    expect(searchDeepSky(catalog, "milky way", 1)[0]).toEqual(MILKY_WAY_REF);
    expect(searchDeepSky(catalog, "x", 5)).toEqual([]);
  });
});
