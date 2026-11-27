/**
 * Display photometry for extended objects. Stars use `starVisibility` (1 at the magnitude
 * limit); galaxies and nebulae use the same scale but are shown brighter, as in a long
 * exposure (DEEP_SKY_GAIN), and their light is spread over their apparent area. Surface
 * brightness therefore does not change with distance, as for real extended sources: a
 * galaxy shrinks with distance but its disk keeps its brightness per unit solid angle.
 */
import type { NebulaKind } from "../../data/deep/nebulae";

/** Extra brightness of deep-sky objects over the eye's view: five magnitudes (×100). */
export const DEEP_SKY_GAIN_MAG = 5;
export const DEEP_SKY_GAIN = 10 ** (0.4 * DEEP_SKY_GAIN_MAG);

/**
 * Solid angle of one display pixel at the reference view (1080 px over a 50° field), steradians.
 * Surface brightness is expressed per reference pixel so it does not depend on the display.
 */
export const REFERENCE_PIXEL_SR = ((2 * Math.tan((25 * Math.PI) / 180)) / 1080) ** 2;

/** Total display flux of a source of absolute magnitude M seen from 10 pc, times pc² (∝ luminosity). */
export function displayLuminosity(absoluteMag: number, magnitudeLimit: number): number {
  return DEEP_SKY_GAIN * 0.05 * 10 ** (0.4 * (magnitudeLimit - absoluteMag)) * 100;
}

/** Display flux (starVisibility units, with the deep-sky gain) at `distancePc`. */
export function displayFlux(absoluteMag: number, magnitudeLimit: number, distancePc: number): number {
  return displayLuminosity(absoluteMag, magnitudeLimit) / Math.max(distancePc, 1e-9) ** 2;
}

/**
 * Mean surface brightness (display units per reference pixel) of a source with the given
 * luminosity spread over an ellipse of radius `radiusPc` and apparent axis ratio `axisRatio`.
 * Independent of distance.
 */
export function meanSurfaceBrightness(absoluteMag: number, magnitudeLimit: number, radiusPc: number, axisRatio: number): number {
  return (displayLuminosity(absoluteMag, magnitudeLimit) * REFERENCE_PIXEL_SR) / (Math.PI * radiusPc * radiusPc * Math.max(0.02, axisRatio));
}

/** Apparent minor/major axis ratio of an oblate body with intrinsic ratio f, seen at cos θ to its axis. */
export function apparentAxisRatio(cosToAxis: number, flattening: number): number {
  const c = Math.min(1, Math.abs(cosToAxis));
  return Math.sqrt(c * c + flattening * flattening * (1 - c * c));
}

/** Apparent radius in pixels (radius/distance × focal length; inside the object: very large). */
export function apparentRadiusPx(radiusPc: number, distancePc: number, focalPx: number): number {
  return (radiusPc / Math.max(distancePc, radiusPc * 1e-3, 1e-12)) * focalPx;
}

/**
 * Illustrative surface brightness of nebulae (display units). Catalogues give sizes and
 * distances but no uniform integrated brightness; planetary nebulae are compact and bright,
 * supernova remnants faint and filamentary.
 */
export const NEBULA_SURFACE_BRIGHTNESS: Record<NebulaKind, number> = {
  planetary: 0.55,
  emission: 0.45,
  supernova: 0.22,
  reflection: 0.22,
  dark: 0,
};

/** Approximate B−V colour by T-type (RC3-era averages; ellipticals red, irregulars blue). */
export function galaxyColorIndex(tType: number): number {
  if (!Number.isFinite(tType)) return 0.75;
  if (tType <= -4) return 0.95;
  if (tType <= 0) return 0.9;
  if (tType <= 2) return 0.8;
  if (tType <= 4) return 0.68;
  if (tType <= 6) return 0.55;
  if (tType <= 8) return 0.5;
  return 0.42;
}

/** Fraction of light in the bulge by T-type (typical photometric decompositions; illustrative). */
export function bulgeFraction(tType: number): number {
  if (!Number.isFinite(tType)) return 0.35;
  if (tType <= -4) return 1;
  if (tType <= 0) return 0.6;
  if (tType <= 2) return 0.4;
  if (tType <= 4) return 0.22;
  if (tType <= 6) return 0.1;
  if (tType <= 8) return 0.04;
  return 0;
}
