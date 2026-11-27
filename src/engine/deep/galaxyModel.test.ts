import { describe, expect, it } from "vitest";
import { apparentAxisRatio, displayFlux, displayLuminosity, meanSurfaceBrightness } from "./deepPhotometry";
import { ARCHETYPE, galaxyArchetype } from "./galaxyMaps";
import { bulgeSegmentIntegral, bulgeShape, diskHeights, inPlaneAxis, milkyWayBulge, type BulgeShape } from "./galaxyModel";

/** Total light of a bulge from its projected columns on a grid (lines of sight along z). */
function projectedTotal(shape: BulgeShape, extent: number, cells = 120): number {
  let total = 0;
  const step = (2 * extent) / cells;
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const x = -extent + (i + 0.5) * step, y = -extent + (j + 0.5) * step;
      total += bulgeSegmentIntegral([x, y, -extent], [x, y, extent], shape) * step * step;
    }
  return total;
}

describe("galaxy bulges", () => {
  it("hold exactly their light fraction (closed-form column integrates to the normalisation)", () => {
    const sb = bulgeShape(3, ARCHETYPE.Sb, 0.12);
    expect(sb.fraction).toBeCloseTo(0.22, 6);
    expect(projectedTotal(sb, 0.36)).toBeCloseTo(sb.fraction, 2);
    const elliptical = bulgeShape(-5, ARCHETYPE.Spheroid, 0.7);
    expect(elliptical.fraction).toBe(1);
    expect(projectedTotal(elliptical, 1.01, 160)).toBeCloseTo(1, 1);
  });

  it("vanish outside the truncation and are brightest through the centre", () => {
    const shape = bulgeShape(1, ARCHETYPE.Sa, 0.12);
    const edge = shape.radius * shape.truncation;
    expect(bulgeSegmentIntegral([edge * 1.01, 0, -1], [edge * 1.01, 0, 1], shape)).toBe(0);
    const centre = bulgeSegmentIntegral([0, 0, -1], [0, 0, 1], shape);
    expect(centre).toBeGreaterThan(bulgeSegmentIntegral([edge * 0.5, 0, -1], [edge * 0.5, 0, 1], shape) * 5);
    // Splitting a line of sight does not change its column.
    const halves = bulgeSegmentIntegral([0, 0, -1], [0, 0, 0.1], shape) + bulgeSegmentIntegral([0, 0, 0.1], [0, 0, 1], shape);
    expect(halves).toBeCloseTo(centre, 9);
  });

  it("models the Milky Way's bulge to the bar's 5 kpc half-length", () => {
    const shape = milkyWayBulge();
    expect(shape.radius * shape.truncation * 20000).toBeCloseTo(5000, 6);
    expect(shape.fraction).toBe(0.3);
  });
});

describe("galaxy shapes", () => {
  it("chooses map archetypes from the Hubble type and bar", () => {
    expect(galaxyArchetype(-5, 0, 0.7)).toBe(ARCHETYPE.Spheroid);
    expect(galaxyArchetype(-2, 0, 0.2)).toBe(ARCHETYPE.S0);
    expect(galaxyArchetype(3, 2, 0.12)).toBe(ARCHETYPE.SBb);
    expect(galaxyArchetype(5, 0, 0.12)).toBe(ARCHETYPE.Sc);
    expect(galaxyArchetype(10, 0, 0.35)).toBe(ARCHETYPE.Irregular);
    expect(galaxyArchetype(Number.NaN, 0, 0.15)).toBe(ARCHETYPE.Sb);
  });

  it("builds a unit in-plane axis perpendicular to the normal", () => {
    for (const normal of [[0, 1, 0], [1, 0, 0], [0.6, 0, 0.8]] as [number, number, number][]) {
      const axis = inPlaneAxis(normal, 1.234);
      expect(Math.hypot(...axis)).toBeCloseTo(1, 9);
      expect(axis[0] * normal[0] + axis[1] * normal[1] + axis[2] * normal[2]).toBeCloseTo(0, 9);
    }
  });

  it("keeps thin disks inside their bounding box", () => {
    const h = diskHeights(0.12);
    expect(h.dust).toBeLessThan(h.young);
    expect(h.young).toBeLessThan(h.old);
    expect(h.box).toBeGreaterThan(h.thick * 3);
  });
});

describe("deep-sky photometry", () => {
  it("dims point sources with the square of distance but keeps surface brightness", () => {
    expect(displayFlux(-21, 6.5, 2e6) / displayFlux(-21, 6.5, 1e6)).toBeCloseTo(0.25, 9);
    // Five magnitudes brighter = 100× the luminosity.
    expect(displayLuminosity(-21, 6.5) / displayLuminosity(-16, 6.5)).toBeCloseTo(100, 6);
    // Surface brightness depends on size and luminosity only (no distance argument exists).
    expect(meanSurfaceBrightness(-21, 6.5, 2e4, 1) / meanSurfaceBrightness(-21, 6.5, 1e4, 1)).toBeCloseTo(0.25, 9);
  });

  it("projects an oblate disk to its apparent axis ratio", () => {
    expect(apparentAxisRatio(1, 0.12)).toBeCloseTo(1, 9);
    expect(apparentAxisRatio(0, 0.12)).toBeCloseTo(0.12, 9);
    expect(apparentAxisRatio(Math.cos(Math.PI / 3), 0)).toBeCloseTo(0.5, 9);
  });
});
