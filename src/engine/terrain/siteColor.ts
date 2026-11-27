/**
 * Ground colour at a landing site from the body's installed global map: the map's local
 * colour relative to its own mean, applied to the ground colour derived from the measured
 * albedo. Landing on Pluto's bright heart and in its dark Cthulhu region, or on Iapetus's
 * bright and dark hemispheres, therefore gives different ground. The map pixels are
 * kilometre-scale; finer ground structure stays procedural.
 */
export type Linear = [number, number, number];

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Pure core: equirectangular RGBA pixels (0° longitude at the image centre, east to the
 * right, north up), a site in planetocentric degrees, and the target mean ground colour.
 * Returns null when the map does not cover the site (alpha < 50%).
 */
export function siteGroundColor(
  pixels: ArrayLike<number>, width: number, height: number,
  latDeg: number, lonDeg: number, groundLinear: Linear, windowDeg = 6,
): Linear | null {
  let meanR = 0, meanG = 0, meanB = 0, meanW = 0;
  for (let i = 0; i < width * height; i++) {
    const alpha = pixels[i * 4 + 3] / 255;
    if (alpha < 0.5) continue;
    meanR += toLinear(pixels[i * 4]) * alpha;
    meanG += toLinear(pixels[i * 4 + 1]) * alpha;
    meanB += toLinear(pixels[i * 4 + 2]) * alpha;
    meanW += alpha;
  }
  if (meanW === 0) return null;
  const mean: Linear = [meanR / meanW, meanG / meanW, meanB / meanW];
  const halfX = Math.max(1, Math.round((windowDeg / 360) * width / 2));
  const halfY = Math.max(1, Math.round((windowDeg / 180) * height / 2));
  const cx = Math.floor((0.5 + lonDeg / 360) * width);
  const cy = Math.floor((0.5 - latDeg / 180) * height);
  let r = 0, g = 0, b = 0, w = 0, coverage = 0, count = 0;
  for (let dy = -halfY; dy <= halfY; dy++) {
    const y = Math.min(height - 1, Math.max(0, cy + dy));
    for (let dx = -halfX; dx <= halfX; dx++) {
      const x = (((cx + dx) % width) + width) % width;
      const k = (y * width + x) * 4;
      const alpha = pixels[k + 3] / 255;
      count++;
      coverage += alpha;
      if (alpha < 0.5) continue;
      r += toLinear(pixels[k]) * alpha;
      g += toLinear(pixels[k + 1]) * alpha;
      b += toLinear(pixels[k + 2]) * alpha;
      w += alpha;
    }
  }
  if (w === 0 || coverage / count < 0.5) return null;
  const site: Linear = [r / w, g / w, b / w];
  // Keep the site's brightness relative to the map mean (bounded), at the measured-albedo level.
  const scale = luminance(groundLinear) / Math.max(1e-4, luminance(mean));
  return site.map((channel) => Math.min(1, Math.max(0.002, channel * scale))) as Linear;
}

/** Decode a map at low resolution in the browser and sample the site; null when unavailable. */
export async function sampleSiteGroundColor(
  url: string, latDeg: number, lonDeg: number, groundLinear: Linear, signal?: AbortSignal,
): Promise<Linear | null> {
  if (typeof createImageBitmap === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const width = 256, height = 128;
    const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" });
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); return null; }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    return siteGroundColor(data, width, height, latDeg, lonDeg, groundLinear);
  } catch {
    return null;
  }
}
