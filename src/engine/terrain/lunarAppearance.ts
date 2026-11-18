/** Display reflectance limits, not an albedo retrieval from the LROC photograph. */
export const LUNAR_DISPLAY_DARK = 0.04;
export const LUNAR_DISPLAY_RANGE = 0.18;

/** Compress baked photographic contrast before applying current scene lighting. */
export function lunarDisplayReflectance(linearLuminance: number): number {
  const value = Number.isFinite(linearLuminance) ? Math.max(0, Math.min(1, linearLuminance)) : 0;
  return LUNAR_DISPLAY_DARK + LUNAR_DISPLAY_RANGE * Math.sqrt(value);
}
