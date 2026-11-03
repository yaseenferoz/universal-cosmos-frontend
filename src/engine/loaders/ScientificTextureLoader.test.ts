import { afterEach, describe, expect, it, vi } from "vitest";
import { NoColorSpace, SRGBColorSpace, Texture } from "three";
import { imageryById, type TextureAsset } from "../../data/imagery";
import {
  ScientificTextureLoader,
  fetchImageTexture,
  textureTierForHeight,
} from "./ScientificTextureLoader";

const surface = imageryById.earth.surface as TextureAsset;
const clouds = imageryById.earth.clouds as TextureAsset;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("scientific texture ownership", () => {
  it("settles stalled image requests with a timeout instead of hanging startup", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const pending = fetchImageTexture("/textures/unreachable.webp", 25);
    const assertion = expect(pending).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(26);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("deduplicates active downloads and disposes only when the final owner releases", async () => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, "dispose");
    const fetcher = vi.fn(async () => texture);
    const pool = new ScientificTextureLoader(fetcher);
    const [first, second] = await Promise.all([
      pool.acquire(surface, "low"),
      pool.acquire(surface, "low"),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.texture.colorSpace).toBe(SRGBColorSpace);
    first.release();
    first.release();
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pool.activeTextureCount).toBe(0);
  });

  it("does not gamma-decode opacity data and reloads after a failed request", async () => {
    const texture = new Texture();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(texture);
    const pool = new ScientificTextureLoader(fetcher);
    await expect(pool.acquire(clouds, "low")).rejects.toThrow("missing");
    expect(pool.activeTextureCount).toBe(0);
    const lease = await pool.acquire(clouds, "low");
    expect(lease.texture.colorSpace).toBe(NoColorSpace);
    expect(fetcher).toHaveBeenCalledTimes(2);
    lease.release();
  });

  it("keeps low-resolution requests inside device budgets", () => {
    expect(textureTierForHeight(512)).toBe("low");
    expect(textureTierForHeight(1024)).toBe("medium");
    expect(textureTierForHeight(2048)).toBe("high");
  });
});
