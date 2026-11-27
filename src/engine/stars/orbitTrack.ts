import { Vector3 } from "three";
import { analyticRelativePositionKm } from "../ephemeris/analyticEphemeris";
import { KM_PER_AU } from "../ephemeris/planets";
import { orbitNormal, orbitPathAu, orbitPositionAu, type OrbitElements, type OrbitFrame } from "./keplerOrbit";

/** Where a planet is around its host: positions in AU, engine axes, relative to the host. */
export interface OrbitTrack {
  semiMajorAxisAu: number;
  eccentricity: number;
  periodDays: number;
  positionAu(jd: number, target: Vector3): Vector3;
  /** Unit orbit normal (orbital angular momentum direction). */
  normal(target: Vector3): Vector3;
  /** Closed outline, flat xyz triples in AU. */
  pathAu(segments?: number): Float32Array;
}

/** An exoplanet's Keplerian orbit in its sky frame (see keplerOrbit.ts). */
export function keplerTrack(elements: OrbitElements, frame: OrbitFrame): OrbitTrack {
  return {
    semiMajorAxisAu: elements.semiMajorAxisAu,
    eccentricity: elements.eccentricity,
    periodDays: elements.periodDays,
    positionAu: (jd, target) => orbitPositionAu(elements, frame, jd, target),
    normal: (target) => orbitNormal(elements, frame, target),
    pathAu: (segments = 256) => orbitPathAu(elements, frame, segments),
  };
}

const msOfJd = (jd: number) => (jd - 2440587.5) * 86_400_000;

/**
 * A Solar System planet from the same analytic model as the Solar System view (JPL's
 * approximate Keplerian elements, Standish; heliocentric, J2000 ecliptic, engine axes). Star
 * mode shows these as an overview; the Solar System view has the full ephemeris and maps.
 */
export function solarPlanetTrack(id: string, periodDays: number, epochJd: number): OrbitTrack | null {
  const at = (jd: number, target: Vector3): Vector3 | null => {
    const km = analyticRelativePositionKm(id, msOfJd(jd));
    return km ? target.set(km.x, km.y, km.z).divideScalar(KM_PER_AU) : null;
  };
  const probe = at(epochJd, new Vector3());
  if (!probe || !(periodDays > 0)) return null;
  const samples = (segments: number) => {
    const points = new Float32Array(segments * 3);
    const v = new Vector3();
    for (let i = 0; i < segments; i++) {
      at(epochJd + (i / segments) * periodDays, v);
      points.set([v.x, v.y, v.z], i * 3);
    }
    return points;
  };
  const quarter = at(epochJd + periodDays / 4, new Vector3())!;
  const normal = new Vector3().crossVectors(probe, quarter).normalize();
  const outline = samples(128);
  let near = Infinity, far = 0;
  for (let i = 0; i < outline.length; i += 3) {
    const r = Math.hypot(outline[i], outline[i + 1], outline[i + 2]);
    near = Math.min(near, r);
    far = Math.max(far, r);
  }
  return {
    semiMajorAxisAu: (near + far) / 2,
    eccentricity: (far - near) / (far + near),
    periodDays,
    positionAu: (jd, target) => at(jd, target) ?? target.set(0, 0, 0),
    normal: (target) => target.copy(normal),
    pathAu: (segments = 256) => samples(segments),
  };
}
