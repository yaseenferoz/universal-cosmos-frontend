import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { fetchImageTexture } from "../loaders/ScientificTextureLoader";

/** CC0 terrestrial samples. Original 2K photographs are opt-in at desktop high quality. */
export class SurfaceDetailMaps {
  readonly color = { value: null as Texture | null };
  readonly height = { value: null as Texture | null };
  readonly enabled = { value: 0 };
  private disposed = false;
  private generation = 0;
  private requestKey = "";
  private pending: Promise<void> = Promise.resolve();

  load(rock: boolean, mobile: boolean, high = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const size = high && !mobile ? 2048 : 1024;
    const key = `${rock}-${mobile}-${size}`;
    if (this.requestKey === key) return this.pending;
    this.requestKey = key;
    const generation = ++this.generation;
    this.pending = this.replace(rock, mobile, size, generation).catch(error => {
      if (generation === this.generation) this.requestKey = "";
      throw error;
    });
    return this.pending;
  }

  private async replace(rock: boolean, mobile: boolean, size: number, generation: number): Promise<void> {
    const name = rock ? "rock_boulder_dry" : "dry_ground_rocks";
    const results = await Promise.allSettled(["color", "height"].map(kind =>
      fetchImageTexture(`/textures/${name}-${kind}${size === 2048 ? "-2048" : ""}.jpg`)));
    const textures = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    const failure = results.find(result => result.status === "rejected");
    if (this.disposed || generation !== this.generation || failure) {
      textures.forEach(texture => this.release(texture));
      if (failure?.status === "rejected" && !this.disposed && generation === this.generation) throw failure.reason;
      return;
    }
    const [color, height] = textures;
    textures.forEach((texture, index) => {
      texture.colorSpace = index === 0 ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = mobile ? 2 : 8;
      texture.needsUpdate = true;
    });
    // Publish a matched pair atomically; quality changes cannot mix source tiers.
    const old = [this.color.value, this.height.value];
    this.color.value = color;
    this.height.value = height;
    this.enabled.value = 1;
    old.forEach(texture => { if (texture) this.release(texture); });
  }

  private release(texture: Texture): void {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.enabled.value = 0;
    if (this.color.value) this.release(this.color.value);
    if (this.height.value) this.release(this.height.value);
    this.color.value = this.height.value = null;
  }
}
