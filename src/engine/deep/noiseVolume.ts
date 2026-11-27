import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from "three";

/**
 * A tiling 3D lattice of random values. Trilinear filtering turns it into value noise, and
 * several scaled lookups make fractal noise for nebula volumes: cheap in the shader and
 * instant to build (no per-texel noise evaluation on the CPU).
 */
export function createNoiseVolume(size = 64, seed = 1): Data3DTexture {
  const data = new Uint8Array(size * size * size);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < data.length; i++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[i] = (state >>> 0) & 255;
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
