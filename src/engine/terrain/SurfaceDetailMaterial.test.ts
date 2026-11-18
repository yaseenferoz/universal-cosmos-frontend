import { describe, expect, it, vi } from "vitest";
import { Texture, Vector3 } from "three";
import { DETAIL_PERIOD_M, SurfaceDetailMaps, wrappedDetailOrigin } from "./SurfaceDetailMaterial";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";

vi.mock("../loaders/ScientificTextureLoader", () => ({ fetchImageTexture: vi.fn() }));

describe("surface detail precision and ownership", () => {
  it("retains millimeter movement on Earth/Moon/Mars without planet-sized GPU UVs", () => {
    for (const radius of [6371000, 1737400, 3389500]) {
      const origin = wrappedDetailOrigin(new Vector3(radius * 0.7, -radius * 0.4, radius * 0.5));
      for (const coordinate of origin.toArray()) {
        expect(coordinate).toBeGreaterThanOrEqual(0);
        expect(coordinate).toBeLessThan(DETAIL_PERIOD_M);
        expect(Math.fround(coordinate + 0.001) - Math.fround(coordinate)).toBeCloseTo(0.001, 3);
      }
    }
  });
  it("preserves both texture octaves across negative coordinates and origin wrap", () => {
    for (const scale of [0.25, 0.0625]) {
      for (const x of [-4096.125, -0.125, 4095.875, 4096.125]) {
        const before = wrappedDetailOrigin(new Vector3(x, 0, 0)).x;
        const after = wrappedDetailOrigin(new Vector3(x + 0.25, 0, 0)).x;
        const phase = ((after - before) * scale + 1024) % 1;
        expect(phase).toBeCloseTo(0.25 * scale, 8);
      }
    }
  });
  it("releases material textures arriving after teardown and never enables the dead material", async () => {
    const pending: ((texture: Texture) => void)[] = [];
    vi.mocked(fetchImageTexture).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const maps = new SurfaceDetailMaps();
    const loading = maps.load(false, false);
    maps.dispose();
    const textures = pending.map(() => new Texture());
    const disposals = textures.map(texture => vi.spyOn(texture, "dispose"));
    pending.forEach((resolve, i) => resolve(textures[i]));
    await loading;
    disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(maps.enabled.value).toBe(0);
    expect(maps.color.value).toBeNull();
  });
});
