import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LunarTerrainProvider } from "./LunarTerrainProvider";
import { moonTerrainManifest } from "./moonManifest";

function grid(url: string): Float32Array {
  const bytes = new Uint8Array(readFileSync(new URL(`../../../public${url}`, import.meta.url)));
  return new Float32Array(bytes.buffer);
}

describe("packaged lunar measurements", () => {
  it("preserves identical boundary posts between adjacent regional tiles", () => {
    for (const tier of ["context", "local"]) {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const tile = moonTerrainManifest.tiles.find(item => item.id === `apollo17-${tier}-${x}-${y}`)!;
        const values = grid(tile.url);
        expect(values.length).toBe(tile.width * tile.height);
        if (x < 3) {
          const right = grid(`/terrain/moon/apollo17-${tier}-${x + 1}-${y}.f32`);
          for (let row = 0; row < 129; row++) expect(Object.is(values[row * 129 + 128], right[row * 129])).toBe(true);
        }
        if (y < 3) {
          const below = grid(`/terrain/moon/apollo17-${tier}-${x}-${y + 1}.f32`);
          for (let column = 0; column < 129; column++) expect(Object.is(values[128 * 129 + column], below[column])).toBe(true);
        }
      }
    }
  });

  it("lands on measured meter elevations using the DEM datum and registered imagery", async () => {
    const provider = new LunarTerrainProvider({ fetcher: async input => {
      const bytes = new Uint8Array(readFileSync(new URL(`../../../public${String(input)}`, import.meta.url)));
      return new Response(bytes.buffer);
    } });
    await provider.ensureRegion(moonTerrainManifest.landingRegion);
    const { latDeg, lonDeg } = moonTerrainManifest.landingRegion;
    const sample = provider.sampleHeight(latDeg, lonDeg);
    expect(provider.manifest.radiusM).toBe(1737400);
    expect(sample.available).toBe(true);
    expect(sample.resolutionM).toBe(5);
    expect(sample.heightM).toBeGreaterThan(-2630);
    expect(sample.heightM).toBeLessThan(-2620);
    expect(provider.getImagery(latDeg, lonDeg)?.sourceResolutionM).toBe(5);
    expect(provider.getCacheStats().residentBytes).toBeLessThan(7 * 1024 * 1024);
    provider.dispose();
  });
});
