import { describe, expect, it, vi } from "vitest";
import { Texture, Vector3 } from "three";
import { DETAIL_PERIOD_M, SurfaceDetailMaps, wrappedDetailOrigin } from "./SurfaceDetailMaterial";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";

vi.mock("../loaders/ScientificTextureLoader", () => ({ fetchImageTexture: vi.fn() }));

describe("surface detail precision and ownership", () => {
  it("uses 2K only for desktop high and atomically disposes replaced maps", async () => {
    const textures: Texture[] = [];
    vi.mocked(fetchImageTexture).mockImplementation(async () => { const texture = new Texture(); textures.push(texture); return texture; });
    const maps = new SurfaceDetailMaps();
    await maps.load(false, false);
    const release = textures.map(texture => vi.spyOn(texture, "dispose"));
    await maps.load(false, false, true);
    expect(fetchImageTexture).toHaveBeenCalledWith("/textures/dry_ground_rocks-color-2048.jpg");
    expect(maps.color.value).toBe(textures[2]);
    release.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    await maps.load(false, true, true);
    expect(vi.mocked(fetchImageTexture).mock.calls.at(-2)?.[0]).toBe("/textures/dry_ground_rocks-color.jpg");
    maps.dispose();
  });
  it("keeps the last complete tier on failure and discards superseded quality loads", async () => {
    const maps = new SurfaceDetailMaps();
    vi.mocked(fetchImageTexture).mockImplementation(async () => new Texture());
    await maps.load(true, false);
    const old = maps.color.value;
    const partial = new Texture();
    const release = vi.spyOn(partial, "dispose");
    vi.mocked(fetchImageTexture).mockResolvedValueOnce(partial).mockRejectedValueOnce(new Error("missing HD height"));
    await expect(maps.load(true, false, true)).rejects.toThrow("missing HD height");
    expect(maps.color.value).toBe(old);
    expect(maps.enabled.value).toBe(1);
    expect(release).toHaveBeenCalledOnce();
    const pending: ((texture: Texture) => void)[] = [];
    vi.mocked(fetchImageTexture).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const high = maps.load(true, false, true);
    const low = maps.load(true, true);
    const stale = [new Texture(), new Texture()];
    const disposals = stale.map(texture => vi.spyOn(texture, "dispose"));
    pending[2](new Texture()); pending[3](new Texture());
    await low;
    const current = maps.color.value;
    pending[0](stale[0]); pending[1](stale[1]);
    await high;
    expect(maps.color.value).toBe(current);
    disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    maps.dispose();
  });
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
