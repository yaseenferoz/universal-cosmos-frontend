/**
 * Stellar quantities derived from catalogue magnitudes and colours. These are standard
 * empirical relations, so values for individual stars are estimates:
 * - B−V → effective temperature: Ballesteros 2012, EPL 97:34001 (blackbody fit, valid
 *   roughly 3000–40000 K; poor for very red giants and reddened stars).
 * - Bolometric correction: Torres 2010, AJ 140:1158 (Flower 1996 polynomials, corrected).
 * - Luminosity: L/L☉ = 10^(−0.4 (M_V + BC − M_bol,☉)), M_bol,☉ = 4.74 (IAU 2015 B2).
 * - Radius: Stefan–Boltzmann, R/R☉ = √(L/L☉) (T☉/T)², T☉ = 5772 K (IAU 2015 B3).
 * - Colour: Planck spectrum integrated against the CIE 1931 2° observer (analytic fit of
 *   Wyman, Sloan & Shirley 2013), converted to linear sRGB and normalised.
 */
export const SOLAR_TEMPERATURE_K = 5772;
/** Light-years per parsec (IAU 2015). */
export const LY_PER_PC = 3.261563777;
export const SOLAR_MBOL = 4.74;

/** Ballesteros 2012. Returns NaN for an unknown colour index. */
export function bvToTemperature(bv: number): number {
  if (!Number.isFinite(bv)) return Number.NaN;
  const c = Math.max(-0.4, Math.min(2.2, bv));
  return 4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62));
}

/** Rough effective temperature from a spectral class letter when no colour is catalogued. */
export function spectralClassTemperature(spectralType: string | undefined): number {
  const letter = spectralType?.trim().charAt(0).toUpperCase();
  const table: Record<string, number> = { O: 35000, B: 15000, A: 9000, F: 6750, G: 5600, K: 4450, M: 3200, L: 2000, T: 1200, Y: 500, D: 15000, W: 50000, C: 3000, S: 3100 };
  return letter && table[letter] ? table[letter] : 5800;
}

/** Torres 2010 bolometric correction in V (mag), from effective temperature. */
export function bolometricCorrection(temperatureK: number): number {
  const t = Math.log10(Math.max(2000, Math.min(60000, temperatureK)));
  if (t < 3.7)
    return -0.190537291496456e5 + 0.155144866764412e5 * t - 0.421278819301717e4 * t ** 2 + 0.381476328422343e3 * t ** 3;
  if (t < 3.9)
    return -0.370510203809015e5 + 0.385672629965804e5 * t - 0.150651486316025e5 * t ** 2
      + 0.261724637119416e4 * t ** 3 - 0.170623810323864e3 * t ** 4;
  return -0.118115450538963e6 + 0.137145973583929e6 * t - 0.636233812100225e5 * t ** 2
    + 0.147412923562646e5 * t ** 3 - 0.170587278406872e4 * t ** 4 + 0.788731721804990e2 * t ** 5;
}

/** Bolometric luminosity in solar units. */
export function luminositySolar(absoluteV: number, temperatureK: number): number {
  return 10 ** (-0.4 * (absoluteV + bolometricCorrection(temperatureK) - SOLAR_MBOL));
}

/** Radius in solar radii from luminosity and temperature. */
export function radiusSolar(luminosity: number, temperatureK: number): number {
  return Math.sqrt(Math.max(0, luminosity)) * (SOLAR_TEMPERATURE_K / temperatureK) ** 2;
}

/** Apparent magnitude at a distance in parsecs. */
export function apparentMagnitude(absoluteMag: number, distancePc: number): number {
  return absoluteMag + 5 * Math.log10(Math.max(distancePc, 1e-12)) - 5;
}

// Wyman, Sloan & Shirley 2013, multi-lobe fit to the CIE 1931 2° colour matching functions.
function g(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
function cieXYZ(lambdaNm: number): [number, number, number] {
  const x = 1.056 * g(lambdaNm, 599.8, 37.9, 31.0) + 0.362 * g(lambdaNm, 442.0, 16.0, 26.7) - 0.065 * g(lambdaNm, 501.1, 20.4, 26.2);
  const y = 0.821 * g(lambdaNm, 568.8, 46.9, 40.5) + 0.286 * g(lambdaNm, 530.9, 16.3, 31.1);
  const z = 1.217 * g(lambdaNm, 437.0, 11.8, 36.0) + 0.681 * g(lambdaNm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** Linear sRGB chromaticity of a blackbody, normalised so the largest channel is 1. */
export function blackbodyLinearRgb(temperatureK: number): [number, number, number] {
  const t = Math.max(1000, Math.min(60000, Number.isFinite(temperatureK) ? temperatureK : 5800));
  let X = 0, Y = 0, Z = 0;
  for (let lambda = 380; lambda <= 780; lambda += 5) {
    const m = lambda * 1e-9;
    const planck = 1 / (m ** 5 * (Math.exp(0.0143877735 / (m * t)) - 1));
    const [x, y, z] = cieXYZ(lambda);
    X += planck * x; Y += planck * y; Z += planck * z;
  }
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const gr = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const rgb = [r, gr, b].map((channel) => Math.max(0, channel));
  const peak = Math.max(...rgb, 1e-30);
  return rgb.map((channel) => channel / peak) as [number, number, number];
}

const LUT_SIZE = 512;
const LUT_MIN = Math.log(1000), LUT_MAX = Math.log(60000);
let lut: Float32Array | null = null;

/** blackbodyLinearRgb via a log-temperature lookup table (for catalogue-wide colouring). */
export function blackbodyLinearRgbFast(temperatureK: number, target: Float32Array | number[] = [0, 0, 0], offset = 0): void {
  if (!lut) {
    lut = new Float32Array(LUT_SIZE * 3);
    for (let i = 0; i < LUT_SIZE; i++)
      lut.set(blackbodyLinearRgb(Math.exp(LUT_MIN + ((LUT_MAX - LUT_MIN) * i) / (LUT_SIZE - 1))), i * 3);
  }
  const t = Number.isFinite(temperatureK) ? Math.min(60000, Math.max(1000, temperatureK)) : 5800;
  const position = ((Math.log(t) - LUT_MIN) / (LUT_MAX - LUT_MIN)) * (LUT_SIZE - 1);
  const i = Math.min(LUT_SIZE - 2, Math.floor(position)), f = position - i;
  for (let c = 0; c < 3; c++) target[offset + c] = lut[i * 3 + c] * (1 - f) + lut[(i + 1) * 3 + c] * f;
}

export interface StellarEstimate {
  temperatureK: number;
  luminosity: number;
  radiusSolar: number;
  /** True when the temperature came from the spectral class instead of B−V. */
  temperatureFromClass: boolean;
}

export function stellarEstimate(absoluteV: number, bv: number, spectralType?: string): StellarEstimate {
  let temperatureK = bvToTemperature(bv);
  const temperatureFromClass = !Number.isFinite(temperatureK);
  if (temperatureFromClass) temperatureK = spectralClassTemperature(spectralType);
  const luminosity = luminositySolar(absoluteV, temperatureK);
  return { temperatureK, luminosity, radiusSolar: radiusSolar(luminosity, temperatureK), temperatureFromClass };
}
