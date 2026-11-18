import { beforeEach, describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import type { TerrainImagery } from "../../types/terrain";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";
import { TerrainImageryLayers } from "./TerrainImageryLayers";

vi.mock("../loaders/ScientificTextureLoader", () => ({ fetchImageTexture: vi.fn() }));
const context: TerrainImagery = { url: "/context.webp", bounds: { west: 28, east: 32, south: 18, north: 22 }, sourceResolutionM: 40, sourceId: "measured" };
const local: TerrainImagery = { ...context, url: "/local.webp", sourceResolutionM: 5 };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("registered terrain imagery ownership", () => {
  beforeEach(() => { vi.mocked(fetchImageTexture).mockReset(); });

  it("keeps context loaded when detail arrives and avoids frame-by-frame requests", async () => {
    const textures = [new Texture(), new Texture()];
    const disposals = textures.map(texture => vi.spyOn(texture, "dispose"));
    vi.mocked(fetchImageTexture).mockResolvedValueOnce(textures[0]).mockResolvedValueOnce(textures[1]);
    const layers = new TerrainImageryLayers(vi.fn());
    layers.update([context]);
    await flush();
    layers.update([local, context]); // Provider order is not required.
    await flush();
    for (let frame = 0; frame < 20; frame++) layers.update([context, local]);
    expect(fetchImageTexture).toHaveBeenCalledTimes(2);
    disposals.forEach(dispose => expect(dispose).not.toHaveBeenCalled());
    layers.dispose(); layers.dispose();
    disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
  });

  it("releases late images after the requested region changes or the renderer is disposed", async () => {
    const pending: ((texture: Texture) => void)[] = [];
    vi.mocked(fetchImageTexture).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const layers = new TerrainImageryLayers(vi.fn());
    layers.update([context]);
    layers.update([]);
    layers.update([context]); // Same URL again must not accept the first stale request.
    const stale = new Texture(), latest = new Texture();
    const staleDispose = vi.spyOn(stale, "dispose"), latestDispose = vi.spyOn(latest, "dispose");
    pending[0](stale);
    await flush();
    expect(staleDispose).toHaveBeenCalledOnce();
    layers.dispose();
    pending[1](latest);
    await flush();
    expect(latestDispose).toHaveBeenCalledOnce();
  });

  it("retains valid context if landing detail fails, and reports the failed source", async () => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, "dispose");
    const onError = vi.fn();
    vi.mocked(fetchImageTexture).mockResolvedValueOnce(texture).mockRejectedValueOnce(new Error("Missing local image"));
    const layers = new TerrainImageryLayers(onError);
    layers.update([context, local]);
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Missing local image" }));
    expect(dispose).not.toHaveBeenCalled();
    layers.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
