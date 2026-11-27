/**
 * Our Galaxy as a structural model, for viewing it from outside. Measured parameters:
 *  - Distance to the Galactic centre R0 = 8.15 kpc and the spiral-arm fits: Reid et al. 2019,
 *    ApJ 885, 131 (maser parallaxes; log-periodic arms with kinks, Table 2).
 *  - Height of the Sun above the plane 20.8 pc: Bennett & Bovy 2019, MNRAS 482, 1417.
 *  - Disk scale lengths and heights, bar length and angle, stellar mass: Bland-Hawthorn &
 *    Gerhard 2016, ARA&A 54, 529 (review of consensus values).
 * The arms are measured only where masers trace them (the `measured` azimuth range); the
 * rendered pattern beyond, the far side of the disk, dust and star clouds are illustrative.
 *
 * Galactocentric azimuth β follows Reid et al.: 0 toward the Sun, increasing in the sense of
 * Galactic rotation (clockwise seen from the north Galactic pole).
 */

export type Vec3 = [number, number, number];

export const MILKY_WAY = {
  /** Sun–Galactic centre distance, parsecs (Reid et al. 2019, fit A5). */
  r0Pc: 8150,
  /** Sun above the Galactic mid-plane, parsecs (Bennett & Bovy 2019). */
  sunHeightPc: 20.8,
  /** Thin and thick disk exponential scale lengths and heights, parsecs (Bland-Hawthorn & Gerhard 2016). */
  thinDisk: { scaleLengthPc: 2600, scaleHeightPc: 300 },
  thickDisk: { scaleLengthPc: 2000, scaleHeightPc: 900, localFraction: 0.12 },
  /** Long bar: half-length and angle between its near end (at positive longitude) and the Sun–centre line. */
  bar: { halfLengthPc: 5000, angleDeg: 27 },
  /** Stellar mass, solar masses (Bland-Hawthorn & Gerhard 2016: 5 ± 1 × 10^10). */
  stellarMassSolar: 5e10,
  /** Rendered radius of the disk, parsecs (stars thin out beyond ~15 kpc; HI extends further). */
  displayRadiusPc: 20000,
  /**
   * Estimated absolute visual magnitude from the stellar mass with a mass-to-light ratio of
   * about 2 (L_V ≈ 2.5 × 10^10 L☉): an estimate for display brightness, not a measurement.
   */
  absMagV: 4.83 - 2.5 * Math.log10(2.5e10),
} as const;

export interface SpiralArm {
  name: string;
  /** Azimuth range of the maser parallaxes that define the fit, degrees. */
  measured: [number, number];
  betaKinkDeg: number;
  rKinkPc: number;
  /** Pitch angle below and above the kink, degrees. */
  pitchBelowDeg: number;
  pitchAboveDeg: number;
  /** Intrinsic Gaussian (1σ) width at the kink, parsecs; grows ~42 pc per kpc of radius. */
  widthPc: number;
}

/** Reid et al. 2019, Table 2 (models assume R0 = 8.15 kpc). */
export const SPIRAL_ARMS: readonly SpiralArm[] = [
  { name: "3-kpc arm", measured: [15, 18], betaKinkDeg: 15, rKinkPc: 3520, pitchBelowDeg: -4.2, pitchAboveDeg: -4.2, widthPc: 180 },
  { name: "Norma arm", measured: [5, 54], betaKinkDeg: 18, rKinkPc: 4460, pitchBelowDeg: -1.0, pitchAboveDeg: 19.5, widthPc: 140 },
  { name: "Scutum–Centaurus arm", measured: [0, 104], betaKinkDeg: 23, rKinkPc: 4910, pitchBelowDeg: 14.1, pitchAboveDeg: 12.1, widthPc: 230 },
  { name: "Sagittarius–Carina arm", measured: [2, 97], betaKinkDeg: 24, rKinkPc: 6040, pitchBelowDeg: 17.1, pitchAboveDeg: 1.0, widthPc: 270 },
  { name: "Local arm", measured: [-8, 34], betaKinkDeg: 9, rKinkPc: 8260, pitchBelowDeg: 11.4, pitchAboveDeg: 11.4, widthPc: 310 },
  { name: "Perseus arm", measured: [-23, 115], betaKinkDeg: 40, rKinkPc: 8870, pitchBelowDeg: 10.3, pitchAboveDeg: 8.7, widthPc: 350 },
  { name: "Outer arm", measured: [-16, 71], betaKinkDeg: 18, rKinkPc: 12240, pitchBelowDeg: 3.0, pitchAboveDeg: 9.4, widthPc: 650 },
];

const DEG = Math.PI / 180;

/** Galactocentric radius of an arm at azimuth β (degrees): ln(R/R_kink) = −(β − β_kink) tan ψ. */
export function armRadiusPc(arm: SpiralArm, betaDeg: number): number {
  const pitch = betaDeg < arm.betaKinkDeg ? arm.pitchBelowDeg : arm.pitchAboveDeg;
  return arm.rKinkPc * Math.exp(-(betaDeg - arm.betaKinkDeg) * DEG * Math.tan(pitch * DEG));
}

/** Arm 1σ width at radius R, parsecs (Reid et al. 2019: dw/dR ≈ 42 pc/kpc). */
export function armWidthPc(arm: SpiralArm, radiusPc: number): number {
  return Math.max(80, arm.widthPc + 0.042 * (radiusPc - arm.rKinkPc));
}

// Equatorial (ICRS) → galactic rotation (Hipparcos, ESA 1997, eq. 1.5.11); rows are galactic axes.
const GALACTIC: readonly Vec3[] = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];
const OBLIQUITY = 23.4392911 * DEG;

/** J2000 equatorial → engine axes (+X equinox, +Y ecliptic north, −Z ecliptic east). */
export function equatorialToEngine([x, y, z]: Vec3): Vec3 {
  const yEcl = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
  const zEcl = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  return [x, zEcl, -yEcl];
}

/** Galactic cartesian (x toward l = 0, y toward l = 90°, z north) → equatorial. */
export function galacticToEquatorial([gx, gy, gz]: Vec3): Vec3 {
  return [0, 1, 2].map((c) => GALACTIC[0][c] * gx + GALACTIC[1][c] * gy + GALACTIC[2][c] * gz) as Vec3;
}

export function galacticToEngine(v: Vec3): Vec3 {
  return equatorialToEngine(galacticToEquatorial(v));
}

export function equatorialUnit(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

export interface GalaxyFrame {
  /** Galactic centre, heliocentric parsecs, engine axes. */
  centre: Vec3;
  /** In-plane unit vector from the centre toward the Sun (β = 0). */
  xAxis: Vec3;
  /** North Galactic pole (the disk's symmetry axis). */
  normal: Vec3;
  /** In-plane unit vector toward β = 90° (the direction of rotation at the Sun, l = 90°). */
  zAxis: Vec3;
}

/** The Milky Way's frame in the stars' heliocentric engine axes. */
export function milkyWayFrame(): GalaxyFrame {
  const toCentre = galacticToEngine([1, 0, 0]);
  const normal = galacticToEngine([0, 0, 1]);
  const zAxis = galacticToEngine([0, 1, 0]);
  const { r0Pc, sunHeightPc } = MILKY_WAY;
  return {
    centre: [0, 1, 2].map((i) => toCentre[i] * r0Pc - normal[i] * sunHeightPc) as Vec3,
    xAxis: toCentre.map((c) => -c) as Vec3,
    normal,
    zAxis,
  };
}
