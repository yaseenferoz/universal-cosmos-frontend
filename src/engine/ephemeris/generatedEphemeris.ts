import type { ObjectId } from "../../types/celestial";
import type { Cartesian } from "../coordinates/CoordinateSystem";
import { generatedOrbits, GENERATED_EPOCH_TDB_MS } from "../../data/generatedBodies";
import samplesIndex from "../../data/generated/bodySamples.json";
import { DEG, keplerianToEcliptic } from "./kepler";
import { MS_PER_DAY } from "./time";

interface SampleEntry { offset: number; count: number; stepDays: number }
const index = samplesIndex as unknown as {
  startTdb: string; stopTdb: string; asset: string; bytes: number;
  bodies: Record<string, SampleEntry>;
};
export const SAMPLES_START_TDB_MS = Date.parse(index.startTdb);
export const SAMPLES_STOP_TDB_MS = Date.parse(index.stopTdb);

let samples: Float32Array | null = null;
let loading: Promise<void> | null = null;

/** Install sampled Horizons positions (tests, or after a fetch). */
export function setBodySamples(buffer: ArrayBuffer | null): void {
  if (buffer && buffer.byteLength !== index.bytes)
    throw new Error(`Body sample asset has ${buffer.byteLength} bytes; expected ${index.bytes}.`);
  samples = buffer ? new Float32Array(buffer) : null;
}

export function hasSampledPositions(id: ObjectId): boolean {
  return samples !== null && id in index.bodies;
}

export function isSampled(id: ObjectId): boolean {
  return id in index.bodies;
}

/**
 * Fetch the local sampled-ephemeris asset once (~1 MB, same origin). Until it
 * arrives, or if it fails, bodies fall back to their fitted elements.
 */
export function loadBodySamples(baseUrl = import.meta.env?.BASE_URL ?? "/"): Promise<void> {
  if (samples || loading) return loading ?? Promise.resolve();
  const url = `${baseUrl.replace(/\/$/, "")}${index.asset}`;
  loading = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => setBodySamples(buffer))
    .catch((error: unknown) => {
      loading = null;
      console.warn("Sampled body positions unavailable; using fitted elements.", error);
    });
  return loading;
}

/** Four-point Lagrange interpolation of uniformly sampled positions. */
function sampledEclipticKm(entry: SampleEntry, tdbMs: number): Cartesian | null {
  if (!samples) return null;
  const f = (tdbMs - SAMPLES_START_TDB_MS) / (entry.stepDays * MS_PER_DAY);
  if (!(f >= 0 && f <= entry.count - 1)) return null;
  const i = Math.min(entry.count - 3, Math.max(1, Math.floor(f)));
  const t = f - i;
  const weights = [
    (-t * (t - 1) * (t - 2)) / 6,
    ((t + 1) * (t - 1) * (t - 2)) / 2,
    (-(t + 1) * t * (t - 2)) / 2,
    ((t + 1) * t * (t - 1)) / 6,
  ];
  const result = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 4; k++) {
    // `offset` counts float32 values (not 3-vectors) from the start of the asset.
    const base = entry.offset + (i - 1 + k) * 3;
    result.x += weights[k] * samples[base];
    result.y += weights[k] * samples[base + 1];
    result.z += weights[k] * samples[base + 2];
  }
  return result;
}

function elementsEclipticKm(id: ObjectId, tdbMs: number, depth = 0): Cartesian | null {
  const orbit = generatedOrbits.get(id);
  if (!orbit || depth > 2) return null;
  const days = (tdbMs - GENERATED_EPOCH_TDB_MS) / MS_PER_DAY;
  const el = orbit.elements;
  const local = keplerianToEcliptic({
    semiMajorAxis: el.a,
    eccentricity: el.e,
    inclination: el.i * DEG,
    ascendingNode: (el.node + el.nNode * days) * DEG,
    argumentOfPeriapsis: (el.peri + el.nPeri * days) * DEG,
    meanAnomaly: (el.M + el.nM * days) * DEG,
  });
  const m = orbit.frameToEcliptic;
  const position = {
    x: m[0][0] * local.x + m[0][1] * local.y + m[0][2] * local.z,
    y: m[1][0] * local.x + m[1][1] * local.y + m[1][2] * local.z,
    z: m[2][0] * local.x + m[2][1] * local.y + m[2][2] * local.z,
  };
  if (orbit.companionOffset) {
    const companion = generatedEclipticKm(orbit.companionOffset.id, tdbMs, depth + 1);
    if (companion) {
      position.x += orbit.companionOffset.factor * companion.x;
      position.y += orbit.companionOffset.factor * companion.y;
      position.z += orbit.companionOffset.factor * companion.z;
    }
  }
  return position;
}

/**
 * Parent-relative J2000 ecliptic km (astronomical axes) for a generated body:
 * interpolated Horizons samples inside 2024–2030 when loaded, else fitted elements.
 */
export function generatedEclipticKm(id: ObjectId, tdbMs: number, depth = 0): Cartesian | null {
  const entry = index.bodies[id];
  if (entry) {
    const sampled = sampledEclipticKm(entry, tdbMs);
    if (sampled) return sampled;
  }
  return elementsEclipticKm(id, tdbMs, depth);
}
