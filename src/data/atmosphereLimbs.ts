import type { CoreObjectId } from "../types/celestial";

/**
 * Optical parameters for the thin atmospheric limb seen from space, including the
 * bright forward-scattering ring of a backlit world (e.g. Venus near inferior
 * conjunction, Earth during a lunar eclipse, Titan in Cassini images).
 *
 * Scale heights are NASA/NSSDCA fact-sheet values (km) divided by the catalog
 * radius. Single-scattering albedos, phase asymmetries, colours and column optical
 * depths are representative literature-scale values for a display model — not a
 * radiative-transfer solution and not measurements at the displayed date.
 */
export interface AtmosphereLimb {
  /** Density scale height / planet radius. */
  scaleHeight: number;
  /** Shell top above the rendered surface / planet radius (fade-out region). */
  shellHeight: number;
  /** Vertical optical depth above the rendered surface (green channel). */
  verticalDepth: number;
  /** Per-channel extinction relative to green: reddens light crossing the limb. */
  extinction: readonly [number, number, number];
  /** Molecular (Rayleigh-like) scattering colour and weight. */
  rayleighColor: readonly [number, number, number];
  rayleighWeight: number;
  /** Aerosol/haze scattering colour, weight and Henyey–Greenstein asymmetry g. */
  aerosolColor: readonly [number, number, number];
  aerosolWeight: number;
  asymmetry: number;
}

const RAYLEIGH_RGB = [0.18, 0.41, 1.0] as const; // λ^-4 at 680/550/440 nm, normalised to blue

export const atmosphereLimbs: Partial<Record<CoreObjectId, AtmosphereLimb>> = {
  earth: {
    scaleHeight: 8.5 / 6378.1, shellHeight: 0.016, verticalDepth: 0.12,
    extinction: [0.45, 1, 2.4], rayleighColor: RAYLEIGH_RGB, rayleighWeight: 1,
    aerosolColor: [1, 0.97, 0.94], aerosolWeight: 0.3, asymmetry: 0.76,
  },
  // The rendered Venus sphere is its cloud deck; the limb is the sulphuric-acid
  // haze above it, strongly forward scattering (the ring seen during transits).
  venus: {
    scaleHeight: 15.9 / 6051.8, shellHeight: 0.014, verticalDepth: 0.5,
    extinction: [0.9, 1, 1.15], rayleighColor: [0.9, 0.86, 0.72], rayleighWeight: 0.15,
    aerosolColor: [1, 0.92, 0.78], aerosolWeight: 1.3, asymmetry: 0.72,
  },
  mars: {
    scaleHeight: 11.1 / 3396.2, shellHeight: 0.02, verticalDepth: 0.4,
    extinction: [0.85, 1, 1.2], rayleighColor: [0.45, 0.6, 1], rayleighWeight: 0.12,
    aerosolColor: [0.95, 0.76, 0.6], aerosolWeight: 0.8, asymmetry: 0.7,
  },
  // Titan's photochemical haze extends hundreds of kilometres (Cassini limb images).
  titan: {
    scaleHeight: 45 / 2574.7, shellHeight: 0.2, verticalDepth: 2.5,
    extinction: [0.6, 1, 1.6], rayleighColor: [0.6, 0.75, 1], rayleighWeight: 0.15,
    aerosolColor: [1, 0.66, 0.32], aerosolWeight: 1.5, asymmetry: 0.7,
  },
  jupiter: {
    scaleHeight: 27 / 71492, shellHeight: 0.004, verticalDepth: 0.4,
    extinction: [0.7, 1, 1.3], rayleighColor: [0.6, 0.72, 1], rayleighWeight: 0.45,
    aerosolColor: [1, 0.94, 0.84], aerosolWeight: 0.6, asymmetry: 0.62,
  },
  saturn: {
    scaleHeight: 59.5 / 60268, shellHeight: 0.007, verticalDepth: 0.4,
    extinction: [0.7, 1, 1.3], rayleighColor: [0.66, 0.74, 1], rayleighWeight: 0.4,
    aerosolColor: [1, 0.92, 0.76], aerosolWeight: 0.6, asymmetry: 0.62,
  },
  // Methane absorbs red, so the ice giants' scattered limb light is cyan/blue.
  uranus: {
    scaleHeight: 27.7 / 25559, shellHeight: 0.009, verticalDepth: 0.5,
    extinction: [1.4, 1, 0.85], rayleighColor: [0.45, 0.85, 0.95], rayleighWeight: 0.9,
    aerosolColor: [0.8, 0.95, 1], aerosolWeight: 0.3, asymmetry: 0.6,
  },
  neptune: {
    scaleHeight: 19.7 / 24764, shellHeight: 0.008, verticalDepth: 0.5,
    extinction: [1.4, 1, 0.85], rayleighColor: [0.35, 0.6, 1], rayleighWeight: 0.9,
    aerosolColor: [0.75, 0.88, 1], aerosolWeight: 0.3, asymmetry: 0.6,
  },
};
