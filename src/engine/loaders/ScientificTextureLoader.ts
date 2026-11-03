import {
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import type { TextureAsset } from "../../data/imagery";

export type TextureTier = "low" | "medium" | "high";
export interface TextureLease {
  texture: Texture;
  release: () => void;
}
interface TextureEntry {
  references: number;
  texture?: Texture;
  promise: Promise<Texture>;
}
export type TextureFetcher = (url: string) => Promise<Texture>;

/** Bound network waits; decode/upload orientation is explicit for ImageBitmap textures. */
export async function fetchImageTexture(
  url: string,
  timeoutMs = 15_000,
): Promise<Texture> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Texture request timed out.", "TimeoutError"),
      ),
    timeoutMs,
  );
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "force-cache",
    });
    if (!response.ok)
      throw new Error(`Texture request returned HTTP ${response.status}.`);
    const blob = await response.blob();
    controller.signal.throwIfAborted();
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    if (controller.signal.aborted) {
      bitmap.close();
      controller.signal.throwIfAborted();
    }
    const texture = new Texture(bitmap);
    texture.flipY = false; // ImageBitmap applies the Y flip while decoding.
    texture.needsUpdate = true;
    return texture;
  } finally {
    clearTimeout(timer);
  }
}

function disposeTexture(texture: Texture): void {
  texture.dispose();
  const source: unknown = texture.image;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
    source.close();
}

/** Existing engine texture budgets are expressed as image height, not globe radius. */
export function textureTierForHeight(height: number): TextureTier {
  return height >= 2048 ? "high" : height >= 1024 ? "medium" : "low";
}

/**
 * Share active requests, not immortal GPU resources. A lease owns one reference;
 * the final release disposes its texture, including a request finishing after teardown.
 */
export class ScientificTextureLoader {
  private readonly entries = new Map<string, TextureEntry>();
  private readonly fetchTexture: TextureFetcher;

  constructor(fetchTexture?: TextureFetcher) {
    this.fetchTexture = fetchTexture ?? fetchImageTexture;
  }

  async acquire(asset: TextureAsset, tier: TextureTier): Promise<TextureLease> {
    const url = asset.variants[tier];
    const key = `${asset.colorSpace}:${url}`;
    let entry = this.entries.get(key);
    if (!entry) {
      const created: TextureEntry = {
        references: 0,
        promise: Promise.resolve().then(() => this.fetchTexture(url)),
      };
      created.promise = created.promise.then(
        (texture) => {
          texture.colorSpace =
            asset.colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
          texture.wrapS = asset.radialRangeKm
            ? ClampToEdgeWrapping
            : RepeatWrapping;
          texture.wrapT = ClampToEdgeWrapping;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = tier === "low" ? 2 : 4;
          texture.name = asset.title;
          texture.needsUpdate = true;
          created.texture = texture;
          return texture;
        },
        (error: unknown) => {
          if (this.entries.get(key) === created) this.entries.delete(key);
          throw error;
        },
      );
      this.entries.set(key, created);
      entry = created;
    }
    entry.references++;
    try {
      const texture = await entry.promise;
      let released = false;
      return {
        texture,
        release: () => {
          if (released) return;
          released = true;
          entry.references--;
          if (entry.references === 0) {
            disposeTexture(texture);
            if (this.entries.get(key) === entry) this.entries.delete(key);
          }
        },
      };
    } catch (error) {
      entry.references--;
      throw error;
    }
  }

  get activeTextureCount(): number {
    return this.entries.size;
  }
}

export const scientificTextures = new ScientificTextureLoader();
