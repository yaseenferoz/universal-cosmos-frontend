import { LY_PER_PC } from "../../engine/stars/stellarPhysics";

const AU_PER_PC = 206264.806;
const KM_PER_AU = 149_597_870.7;

/** Compact number: exponent form for very large or tiny values. */
export function formatNumber(value: number, digits = 2): string {
  return value >= 1e5 || (value > 0 && value < 1e-2) ? value.toExponential(1) : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Distance in km, AU or light-years, whichever reads best. */
export function distanceText(pc: number): string {
  const ly = pc * LY_PER_PC;
  const au = pc * AU_PER_PC;
  if (au < 0.05) return `${Math.round(au * KM_PER_AU).toLocaleString("en-US")} km`;
  if (ly < 0.01) return `${au < 10 ? au.toFixed(2) : Math.round(au).toLocaleString("en-US")} AU`;
  if (ly >= 1e9) return `${(ly / 1e9).toFixed(ly < 1e10 ? 2 : 1)} billion light-years`;
  if (ly >= 1e6) return `${(ly / 1e6).toFixed(ly < 1e7 ? 2 : 1)} million light-years`;
  return `${ly < 10 ? ly.toFixed(2) : Math.round(ly).toLocaleString("en-US")} light-years`;
}

/** Size in light-years (or parsecs below a light-year), for nebulae and galaxies. */
export function sizeText(pc: number): string {
  const ly = pc * LY_PER_PC;
  if (ly >= 1e5) return `${Math.round(ly / 1000).toLocaleString("en-US")} thousand light-years`;
  if (ly >= 10) return `${Math.round(ly).toLocaleString("en-US")} light-years`;
  return `${ly.toFixed(ly < 1 ? 2 : 1)} light-years`;
}

/** Orbital period in hours, days or years. */
export function periodText(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)} hours`;
  if (days < 730) return `${formatNumber(days, days < 10 ? 3 : 1)} days`;
  return `${formatNumber(days / 365.25, 1)} years`;
}

/** Calendar date (UTC) of a Julian date. */
export function dateText(jd: number): string {
  const date = new Date((jd - 2440587.5) * 86_400_000);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
