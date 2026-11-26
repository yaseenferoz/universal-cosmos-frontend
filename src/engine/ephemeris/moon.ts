import type { Cartesian } from "../coordinates/CoordinateSystem";
import { DEG } from "./kepler";
import { tdbJulianCenturies } from "./time";

/**
 * Geocentric Moon after J. Meeus, "Astronomical Algorithms" (2nd ed.), ch. 47,
 * a truncation of Chapront's ELP-2000/82. Table 47.A is used in full; Table 47.B
 * keeps its 30 largest latitude terms. Expected error ≈ 10″ in longitude, a few
 * arcseconds in latitude and ~10 km in distance near the present.
 *
 * Rows: D, M, M′, F, Σl [1e-6 deg], Σr [1e-3 km].
 */
const LONGITUDE_DISTANCE: readonly (readonly number[])[] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

/** Rows: D, M, M′, F, Σb [1e-6 deg]. */
const LATITUDE: readonly (readonly number[])[] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
];

const poly = (t: number, c: readonly number[]) =>
  c.reduce((sum, coefficient, power) => sum + coefficient * t ** power, 0);

export interface LunarSpherical {
  /** Geometric longitude and latitude, mean ecliptic and equinox of date, degrees. */
  longitudeOfDateDeg: number;
  latitudeDeg: number;
  distanceKm: number;
}

export function meeusMoonOfDate(tdbMs: number): LunarSpherical {
  const t = tdbJulianCenturies(tdbMs);
  const lp = poly(t, [218.3164477, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000]);
  const d = poly(t, [297.8501921, 445267.1114034, -0.0018819, 1 / 545868, -1 / 113065000]) * DEG;
  const m = poly(t, [357.5291092, 35999.0502909, -0.0001536, 1 / 24490000]) * DEG;
  const mp = poly(t, [134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000]) * DEG;
  const f = poly(t, [93.272095, 483202.0175233, -0.0036539, -1 / 3526000, 1 / 863310000]) * DEG;
  const a1 = (119.75 + 131.849 * t) * DEG;
  const a2 = (53.09 + 479264.29 * t) * DEG;
  const a3 = (313.45 + 481266.484 * t) * DEG;
  const eccentricityFactor = 1 - 0.002516 * t - 0.0000074 * t * t;
  const lpRad = lp * DEG;

  let sl = 0, sr = 0, sb = 0;
  for (const [cd, cm, cmp, cf, l, r] of LONGITUDE_DISTANCE) {
    const arg = cd * d + cm * m + cmp * mp + cf * f;
    const e = eccentricityFactor ** Math.abs(cm);
    sl += l * e * Math.sin(arg);
    sr += r * e * Math.cos(arg);
  }
  for (const [cd, cm, cmp, cf, b] of LATITUDE) {
    sb += b * eccentricityFactor ** Math.abs(cm) * Math.sin(cd * d + cm * m + cmp * mp + cf * f);
  }
  sl += 3958 * Math.sin(a1) + 1962 * Math.sin(lpRad - f) + 318 * Math.sin(a2);
  sb += -2235 * Math.sin(lpRad) + 382 * Math.sin(a3) + 175 * Math.sin(a1 - f)
    + 175 * Math.sin(a1 + f) + 127 * Math.sin(lpRad - mp) - 115 * Math.sin(lpRad + mp);

  return {
    longitudeOfDateDeg: lp + sl / 1e6,
    latitudeDeg: sb / 1e6,
    distanceKm: 385000.56 + sr / 1000,
  };
}

/**
 * Geocentric Moon in J2000 ecliptic km (astronomical axes). The of-date longitude
 * is referred back to J2000 with the IAU 1976 general precession in longitude;
 * the ~47″/century motion of the ecliptic itself is neglected.
 */
export function moonGeocentricKm(tdbMs: number): Cartesian {
  const t = tdbJulianCenturies(tdbMs);
  const { longitudeOfDateDeg, latitudeDeg, distanceKm } = meeusMoonOfDate(tdbMs);
  const precessionDeg = (5029.0966 * t + 1.11113 * t * t) / 3600;
  const lon = (longitudeOfDateDeg - precessionDeg) * DEG;
  const lat = latitudeDeg * DEG;
  return {
    x: distanceKm * Math.cos(lat) * Math.cos(lon),
    y: distanceKm * Math.cos(lat) * Math.sin(lon),
    z: distanceKm * Math.sin(lat),
  };
}
