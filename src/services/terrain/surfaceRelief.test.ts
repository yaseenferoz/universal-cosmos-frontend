import { describe, expect, it } from "vitest";
import { surfaceSample, type SurfaceReliefParameters } from "./surfaceRelief";
import type { SurfaceKind } from "../../data/surfaceProfiles";

const KINDS: SurfaceKind[] = ["regolith", "rubble", "comet", "ice-cratered", "ice-ridged", "ice-grooved",
  "dark-lag", "volcanic", "pebble", "volatile-ice", "cantaloupe"];

function walk(kind: SurfaceKind, overrides: Partial<SurfaceReliefParameters> = {}, count = 600) {
  const p: SurfaceReliefParameters = {
    kind, seed: 1234, reliefM: 8000, featureScaleM: 150, radiusM: 1_600_000,
    craterDensity: kind === "volcanic" || kind === "pebble" ? 0 : 0.8, ...overrides,
  };
  // A 3-km-spaced straight walk across the surface near (R, 0, 0).
  return Array.from({ length: count }, (_, i) => surfaceSample(p.radiusM, i * 37, i * 11, p));
}

describe("surface-class relief and feature material", () => {
  it("is deterministic, bounded and finite for every class", () => {
    for (const kind of KINDS) {
      const a = walk(kind), b = walk(kind);
      expect(a, kind).toEqual(b);
      for (const sample of a) {
        expect(Number.isFinite(sample.heightM), kind).toBe(true);
        expect(Math.abs(sample.heightM), kind).toBeLessThanOrEqual(8000);
        expect(sample.material, kind).toBeGreaterThanOrEqual(0);
        expect(sample.material, kind).toBeLessThanOrEqual(1);
      }
    }
  });

  it("produces different landscapes for different classes", () => {
    // Rocky and icy cratered plains share the crater model; they differ in crater density,
    // ground material and rocks. Every other class has its own landforms.
    const signature = (kind: SurfaceKind) => walk(kind).map((s) => Math.round(s.heightM));
    const distinct = KINDS.filter((kind) => kind !== "ice-cratered");
    const seen = new Set(distinct.map((kind) => signature(kind).join(",")));
    expect(seen.size).toBe(distinct.length);
  });

  it("keeps Europa's brown lineae a sparse network, not a blanket", () => {
    const mean = walk("ice-ridged", {}, 1500).reduce((sum, s) => sum + s.material, 0) / 1500;
    expect(mean).toBeGreaterThan(0.02);
    expect(mean).toBeLessThan(0.3);
  });

  it("puts black lava in Io's paterae, which are depressions", () => {
    const samples = walk("volcanic", {}, 4000);
    const lava = samples.filter((s) => s.material > 0.95);
    const plains = samples.filter((s) => s.material < 0.05);
    expect(lava.length).toBeGreaterThan(20);
    const mean = (list: typeof samples) => list.reduce((sum, s) => sum + s.heightM, 0) / list.length;
    expect(mean(lava)).toBeLessThan(mean(plains) - 200);
  });

  it("makes rubble piles rougher at boulder scale than dusty regolith", () => {
    const small = { reliefM: 36, featureScaleM: 1.5, radiusM: 245, craterDensity: 0.8 };
    const roughness = (kind: SurfaceKind) => {
      const p = { kind, seed: 9, ...small };
      let sum = 0, previous = surfaceSample(245, 0, 0, p).heightM;
      for (let i = 1; i < 800; i++) {
        const height = surfaceSample(245, i * 0.4, i * 0.13, p).heightM;
        sum += Math.abs(height - previous);
        previous = height;
      }
      return sum / 799;
    };
    expect(roughness("rubble")).toBeGreaterThan(roughness("regolith") * 2);
  });
});
