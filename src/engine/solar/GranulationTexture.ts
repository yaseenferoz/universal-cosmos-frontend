import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat } from "three";

export const GRANULE_TILE_CELLS = 16;
export const GRANULE_SCALE_KM = 1000;

function randomCell(x: number, y: number, channel: number): number {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 53, 668265263) ^ Math.imul(channel + 7, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Seeded, periodic convection-cell illustration. This texture is NOT solar imagery. */
export function createGranulationTexture(size: number): DataTexture {
  const cells = GRANULE_TILE_CELLS;
  const centers = Array.from({ length: cells * cells }, (_, index) => {
    const x = index % cells, y = Math.floor(index / cells);
    return { x: 0.1 + randomCell(x, y, 0) * 0.8, y: 0.1 + randomCell(x, y, 1) * 0.8, brightness: 0.88 + randomCell(x, y, 2) * 0.12 };
  });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size * cells, py = (y + 0.5) / size * cells;
      const cellX = Math.floor(px), cellY = Math.floor(py);
      let closest = Infinity, second = Infinity, brightness = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = cellX + dx, cy = cellY + dy;
        const cell = centers[((cy + cells) % cells) * cells + (cx + cells) % cells];
        const distance = Math.hypot(cx + cell.x - px, cy + cell.y - py);
        if (distance < closest) { second = closest; closest = distance; brightness = cell.brightness; }
        else if (distance < second) second = distance;
      }
      const edge = Math.max(0, Math.min(1, (second - closest - 0.015) / 0.18));
      const value = Math.round(255 * (0.12 + 0.88 * edge * edge * (3 - 2 * edge) * brightness));
      const offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.name = "Procedural solar granulation illustration; not an observation";
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
