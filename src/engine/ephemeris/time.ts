/**
 * Time scales for the analytic ephemeris.
 *
 * Inputs arrive as UTC milliseconds. TT = UTC + 37 leap seconds + 32.184 s,
 * valid from 2017-01-01 until the next IERS leap second. TDB differs from TT by
 * under 2 ms, which is negligible at this model's accuracy, so TDB ≈ TT.
 * Before 1972 this constant is only an approximation of ΔT.
 */
export const TT_MINUS_UTC_SECONDS = 69.184;
export const MS_PER_DAY = 86_400_000;
/** J2000.0 = 2000-01-01T12:00:00 TT, expressed as a JavaScript millisecond count on that scale. */
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const JD_J2000 = 2_451_545.0;
export const DAYS_PER_JULIAN_CENTURY = 36_525;

/** Convert a UTC instant to a TDB millisecond count on the same Unix-style axis. */
export function utcToTdbMs(utcMs: number): number {
  return utcMs + TT_MINUS_UTC_SECONDS * 1000;
}

export function tdbJulianDate(tdbMs: number): number {
  return JD_J2000 + (tdbMs - J2000_MS) / MS_PER_DAY;
}

export function tdbJulianCenturies(tdbMs: number): number {
  return (tdbJulianDate(tdbMs) - JD_J2000) / DAYS_PER_JULIAN_CENTURY;
}
