import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { celestialObjects, objectById } from "./catalog";
import { displayName, generatedOrbits, PLACEHOLDER_RADIUS_KM } from "./generatedBodies";
import samplesIndex from "./generated/bodySamples.json";
import { eclipticRelativeKm, ephemerisCoverage } from "../engine/ephemeris/analyticEphemeris";
import { hasSampledPositions, setBodySamples } from "../engine/ephemeris/generatedEphemeris";
import type { ObjectId } from "../types/celestial";

/**
 * TEST FIXTURES: Horizons geometric vectors, ecliptic J2000, km, 2026-01-01 00:00 TDB
 * (an epoch used neither for fitting nor for the stored hold-out check).
 */
const HORIZONS_2026_01_01: Record<string, [number, number, number]> = {
  titan: [1111851.3568692, -404179.0123461955, 97784.02521876342],
  io: [371182.9634758106, -201293.5663765975, -1969.156881940231],
  triton: [-284586.6431494902, -30217.3206486218, 209607.3948503085],
  charon: [10162.77278327551, 608.3625155146601, -16742.49446062912],
  nix: [16257.6383106653, 35162.6613156629, 28081.59646350454],
  himalia: [5300109.118495416, 7913606.956736071, 1774940.808312756],
  "s2004-s-31": [-14218828.32149862, -8157148.157867026, 10555769.53896841],
  pluto: [2876454611.935341, -4435932980.402722, -357166891.4301288],
  halley: [-2917189260.941471, 4103229383.10374, -1479132076.134079],
  eris: [12747847163.67557, 5903656383.393162, -2617918130.13437],
};
const TDB = Date.parse("2026-01-01T00:00:00Z");

const angleDeg = (id: ObjectId) => {
  const p = eclipticRelativeKm(id, TDB)!;
  const r = HORIZONS_2026_01_01[id];
  const cos = (p.x * r[0] + p.y * r[1] + p.z * r[2]) / (Math.hypot(p.x, p.y, p.z) * Math.hypot(...r));
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
};

function loadSamples() {
  const bytes = readFileSync(new URL("../../public/ephemeris/body-samples.bin", import.meta.url));
  setBodySamples(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

describe("JPL-generated Solar System bodies", () => {
  afterEach(() => setBodySamples(null));

  it("adds hundreds of moons plus dwarf planets, asteroids and comets, each with a real parent", () => {
    const generated = celestialObjects.filter(({ id }) => generatedOrbits.has(id));
    expect(generated.length).toBeGreaterThan(450);
    expect(new Set(celestialObjects.map(({ id }) => id)).size).toBe(celestialObjects.length);
    for (const object of celestialObjects) if (object.parentId) expect(objectById[object.parentId], object.id).toBeDefined();
    for (const id of ["pluto", "charon", "eris", "haumea", "makemake", "halley", "churyumov-gerasimenko", "himalia", "hyperion", "proteus"])
      expect(objectById[id], id).toBeDefined();
    expect(celestialObjects.filter(({ parentId }) => parentId === "saturn").length).toBeGreaterThan(250);
  });

  it("never presents a placeholder size as a measurement", () => {
    for (const object of celestialObjects) {
      if (!object.unmeasured?.includes("radius")) continue;
      expect(object.radiusKm).toBe(PLACEHOLDER_RADIUS_KM);
      expect(object.facts.find(({ label }) => label === "Size")?.value).toMatch(/Not measured/);
    }
    expect(objectById.pluto?.unmeasured ?? []).not.toContain("radius");
    expect(objectById.pluto?.radiusKm).toBeCloseTo(1188.3, 1);
  });

  it("formats provisional designations", () => {
    expect(displayName("S2004_S_31")).toBe("S/2004 S 31");
    expect(displayName("S2023_U1")).toBe("S/2023 U 1");
    expect(displayName("Titan")).toBe("Titan");
  });

  it("places regular moons, Pluto and comets from fitted elements within their published hold-out error", () => {
    expect(angleDeg("titan")).toBeLessThan(0.05);
    expect(angleDeg("charon")).toBeLessThan(0.01);
    expect(angleDeg("io")).toBeLessThan(0.6);
    expect(angleDeg("halley")).toBeLessThan(0.1);
    expect(angleDeg("eris")).toBeLessThan(0.1);
    expect(angleDeg("pluto")).toBeLessThan(0.3);
    expect(angleDeg("triton")).toBeLessThan(2.5);
  });

  it("interpolates sampled Horizons positions for solar-perturbed irregular moons", () => {
    expect(hasSampledPositions("himalia")).toBe(false);
    loadSamples();
    expect(hasSampledPositions("himalia")).toBe(true);
    for (const id of ["himalia", "s2004-s-31", "nix"]) {
      expect(id in samplesIndex.bodies, id).toBe(true);
      expect(angleDeg(id), id).toBeLessThan(0.01);
    }
    expect(ephemerisCoverage("himalia")?.label).toMatch(/sampled/);
  });

  it("rejects a corrupted sample asset", () => {
    expect(() => setBodySamples(new ArrayBuffer(12))).toThrow(/expected/);
  });
});
