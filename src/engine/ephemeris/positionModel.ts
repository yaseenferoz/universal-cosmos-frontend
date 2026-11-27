/**
 * Which position model is actually in use for an object at the displayed time, so labels
 * never call a fallback or an extrapolation a JPL position. The engine always draws the
 * analytic models (also outside their validity windows) and gives bodies without one an
 * illustrative circular orbit; this reports which case applies.
 */
import type { CelestialObject } from "../../types/celestial";
import { GENERATED_EPOCH_TDB_MS } from "../../data/generatedBodies";
import { analyticParentOf, ephemerisCoverage } from "./analyticEphemeris";
import { hasSampledPositions, isSampled, SAMPLES_START_TDB_MS, SAMPLES_STOP_TDB_MS } from "./generatedEphemeris";
import { STANDISH_VALID_FROM_MS, STANDISH_VALID_UNTIL_MS } from "./planets";

export type PositionModelKind = "reference" | "ephemeris" | "fallback" | "extrapolated" | "modeled";

export interface PositionModelStatus {
  kind: PositionModelKind;
  /** Short caption, e.g. "JPL Horizons positions" or "Modeled circular orbit". */
  caption: string;
  /** One-sentence explanation for the information panel. */
  detail: string;
}

const YEAR_MS = 365.25 * 86_400_000;
const year = (ms: number) => new Date(ms).getUTCFullYear();

/** Displayed UTC dates covered by the planetary mean elements (JPL Standish, 1800–2050). */
export function withinPlanetaryEphemeris(utcMs: number): boolean {
  return utcMs >= STANDISH_VALID_FROM_MS && utcMs <= STANDISH_VALID_UNTIL_MS;
}

export function positionModelAt(object: CelestialObject, utcMs: number): PositionModelStatus {
  if (!object.parentId)
    return { kind: "reference", caption: "Solar System reference body", detail: "The Sun is the origin of the Solar System view." };
  const coverage = ephemerisCoverage(object.id);
  if (!coverage || object.parentId !== analyticParentOf(object.id))
    return {
      kind: "modeled", caption: "Modeled circular orbit",
      detail: "No ephemeris covers this object here: its circular path uses the measured mean distance and period with an illustrative phase, not a measured position.",
    };
  const inside = utcMs >= coverage.validFromMs && utcMs <= coverage.validUntilMs;
  const span = `${year(coverage.validFromMs)}–${year(coverage.validUntilMs)}`;
  switch (coverage.model) {
    case "jpl-fitted-elements": {
      const sampledWindow = utcMs >= SAMPLES_START_TDB_MS && utcMs <= SAMPLES_STOP_TDB_MS;
      if (isSampled(object.id) && sampledWindow && hasSampledPositions(object.id))
        return { kind: "ephemeris", caption: "JPL Horizons positions", detail: "Interpolated from positions sampled from JPL Horizons." };
      const fittedInside = Math.abs(utcMs - GENERATED_EPOCH_TDB_MS) <= 3 * YEAR_MS;
      // Bodies without Horizons samples use the fitted elements as their model (not a fallback).
      if (!isSampled(object.id))
        return fittedInside
          ? { kind: "ephemeris", caption: "JPL-fitted orbital elements", detail: `${coverage.label}.` }
          : { kind: "extrapolated", caption: "Fitted elements, extrapolated", detail: `${coverage.label}; far outside the years they were fitted to, the position is approximate.` };
      const reason = isSampled(object.id) && sampledWindow
        ? "the sampled Horizons positions have not loaded"
        : `the date is outside the sampled ${year(SAMPLES_START_TDB_MS)}–${year(SAMPLES_STOP_TDB_MS)} window`;
      return fittedInside
        ? { kind: "fallback", caption: "JPL-fitted elements (fallback)", detail: `Orbital elements fitted to JPL Horizons are used because ${reason}.` }
        : { kind: "extrapolated", caption: "Fitted elements, extrapolated", detail: `Elements fitted to JPL Horizons, far outside the years they were fitted to: the position is approximate.` };
    }
    case "jpl-keplerian-approx":
      return inside
        ? { kind: "ephemeris", caption: "JPL mean orbital elements", detail: `${coverage.label} (${coverage.source.label}), valid ${span}.` }
        : { kind: "extrapolated", caption: "JPL mean elements, extrapolated", detail: `${coverage.label} are only valid ${span}; outside that range the position is approximate.` };
    case "meeus-elp":
      return inside
        ? { kind: "ephemeris", caption: "Lunar theory (Meeus, ELP-2000/82)", detail: `${coverage.label}. Not a JPL ephemeris.` }
        : { kind: "extrapolated", caption: "Lunar theory, extrapolated", detail: `${coverage.label} is used outside ${span}; the position is approximate.` };
    case "sbdb-two-body":
      return inside
        ? { kind: "ephemeris", caption: "JPL osculating elements", detail: `${coverage.label}.` }
        : { kind: "extrapolated", caption: "JPL elements, extrapolated", detail: `${coverage.label}, propagated beyond ${span}: planetary perturbations are ignored and the position is approximate.` };
    default:
      return { kind: inside ? "ephemeris" : "extrapolated", caption: inside ? coverage.label : `${coverage.label}, extrapolated`, detail: coverage.label };
  }
}
