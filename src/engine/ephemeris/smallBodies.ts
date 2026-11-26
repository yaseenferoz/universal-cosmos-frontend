import type { Cartesian } from "../coordinates/CoordinateSystem";
import { DEG, keplerianToEcliptic } from "./kepler";
import { KM_PER_AU } from "./planets";
import { tdbJulianDate } from "./time";

/**
 * Osculating heliocentric elements (J2000 ecliptic and equinox, TDB epoch), retrieved
 * 2026-11-25: Ceres and Vesta from the JPL Small-Body Database API
 * (https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=<number>&full-prec=1), Bennu from
 * JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api).
 *
 * Propagated here as an unperturbed two-body orbit, so error grows with distance
 * from the epoch (planetary perturbations, and for Bennu Earth encounters and the
 * Yarkovsky effect). Suitable for visualization, not for observation planning.
 */
export const SMALL_BODY_ELEMENTS = {
  ceres: {
    designation: "1 Ceres", solution: "JPL 48", epochJd: 2461200.5,
    a: 2.765552595034094, e: 0.07969229514816586, i: 10.58802780183462,
    node: 80.24862682043221, peri: 73.29421453021587, meanAnomaly: 274.4193463761342,
    meanMotionDegPerDay: 0.21430445064843,
  },
  vesta: {
    designation: "4 Vesta", solution: "JPL 36", epochJd: 2461200.5,
    a: 2.361365965127599, e: 0.09020374382834395, i: 7.143925545058711,
    node: 103.701293265032, peri: 151.4686478221564, meanAnomaly: 81.19015607686903,
    meanMotionDegPerDay: 0.2716183613599909,
  },
  // SBDB's Bennu solution has a 2011 epoch, which drifts by degrees under two-body
  // propagation; these are Horizons osculating elements (EPHEM_TYPE=ELEMENTS,
  // CENTER=500@10) at 2026-07-01 TDB, which include perturbations up to that epoch.
  bennu: {
    designation: "101955 Bennu", solution: "Horizons osculating 2026-07-01", epochJd: 2461222.5,
    a: 1.125937276466878, e: 0.2036778844695292, i: 6.032987508845963,
    node: 1.966542940602868, peri: 66.40749592778279, meanAnomaly: 90.6044499151801,
    meanMotionDegPerDay: 0.8249597838060837,
  },
} as const;

export type SmallBodyId = keyof typeof SMALL_BODY_ELEMENTS;

export function smallBodyHeliocentricKm(id: SmallBodyId, tdbMs: number): Cartesian {
  const body = SMALL_BODY_ELEMENTS[id];
  const elapsedDays = tdbJulianDate(tdbMs) - body.epochJd;
  return keplerianToEcliptic({
    semiMajorAxis: body.a * KM_PER_AU,
    eccentricity: body.e,
    inclination: body.i * DEG,
    ascendingNode: body.node * DEG,
    argumentOfPeriapsis: body.peri * DEG,
    meanAnomaly: (body.meanAnomaly + body.meanMotionDegPerDay * elapsedDays) * DEG,
  });
}
