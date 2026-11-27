import type { SurfaceKind } from "../../data/surfaceProfiles";
import { crateredReliefM, hash, valueNoise, type CrateredReliefParameters } from "./crateredRelief";

/**
 * Landing-scale relief for each surface class (see surfaceProfiles.ts), plus a material
 * value in [0, 1] that the ground shader maps to the class's accent colour: ridge margins
 * on Europa, black lava on patera floors on Io, frost on Callisto's knobs, tholins in
 * Pluto's cell troughs, fine-gravel "seas" on rubble piles, dust ponds on comets.
 *
 * Landforms are scaled to the body's relief and feature scale; sizes are compressed so
 * that each class's signature features fall inside the few-kilometre landing view. All of
 * it is procedural and seeded per body, never a map of a real site.
 */
export interface SurfaceReliefParameters extends CrateredReliefParameters {
  kind: SurfaceKind;
}

export interface SurfaceSample {
  heightM: number;
  material: number;
}

function fbm(x: number, y: number, z: number, scaleM: number, seed: number, octaves = 4): number {
  let value = 0, amplitude = 0.5, frequency = 1 / scaleM, total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += amplitude * valueNoise(x * frequency, y * frequency, z * frequency, seed + octave * 101);
    total += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value / total;
}

interface Cell {
  /** Distance to the nearest and second-nearest feature points, in cell units. */
  f1: number;
  f2: number;
  /** Random value of the nearest cell (selects size/kind per feature). */
  id: number;
}

/** 3D Worley noise with one jittered feature point per cell. */
function cellular(x: number, y: number, z: number, cellM: number, seed: number): Cell {
  const px = x / cellM, py = y / cellM, pz = z / cellM;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let f1 = Infinity, f2 = Infinity, id = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const fx = cx + hash(cx, cy, cz, seed ^ 0x1b873593);
    const fy = cy + hash(cx, cy, cz, seed ^ 0x2c1b3c6d);
    const fz = cz + hash(cx, cy, cz, seed ^ 0x297a2d39);
    const d = Math.hypot(px - fx, py - fy, pz - fz);
    if (d < f1) {
      f2 = f1;
      f1 = d;
      id = hash(cx, cy, cz, seed ^ 0x6c8e9cf5);
    } else if (d < f2) f2 = d;
  }
  return { f1, f2, id };
}

/** Deterministic unit direction for a ridge/groove family. */
function familyDirection(seed: number, family: number): [number, number, number] {
  const z = hash(family, 1, 3, seed) * 2 - 1;
  const azimuth = hash(family, 7, 11, seed) * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(azimuth), z, r * Math.sin(azimuth)];
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function rubble(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  // Itokawa-style smooth "seas" of fine gravel collect in low, flat areas.
  const sea = smoothstep(0.56, 0.66, fbm(x, y, z, f * 60, p.seed + 5));
  let mounds = 0;
  for (const [scale, gain] of [[f * 2, 0.45], [f * 7, 0.4]] as const) {
    const cell = cellular(x, y, z, scale, p.seed + scale);
    // Partly buried boulders: domes of random size in each cell.
    const radius = 0.35 + 0.3 * cell.id;
    const dome = Math.max(0, 1 - (cell.f1 / radius) ** 2);
    mounds += Math.sqrt(dome) * scale * gain * (0.4 + 0.6 * cell.id);
  }
  const craters = crateredReliefM(x, y, z, { ...p, craterDensity: p.craterDensity * 0.35 });
  return { heightM: craters + mounds * (1 - 0.85 * sea), material: sea };
}

function comet(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM, levels = 5;
  // Terraced layering with steep scarps between terraces (67P's Hathor/Seth cliffs).
  const n = fbm(x, y, z, f * 90, p.seed + 3) * levels;
  const step = Math.floor(n) + smoothstep(0.82, 1, n - Math.floor(n));
  let height = (step / levels - 0.5) * p.reliefM * 0.9;
  // Circular active pits with near-vertical walls.
  const pit = cellular(x, y, z, f * 45, p.seed + 9);
  if (pit.id < 0.25) height -= p.reliefM * 0.25 * (1 - smoothstep(0.22, 0.28, pit.f1));
  height += crateredReliefM(x, y, z, { ...p, craterDensity: p.craterDensity * 0.2, reliefM: p.reliefM * 0.3 });
  // Smooth dust deposits blanket the flat terrace treads.
  const dust = (1 - smoothstep(0.7, 0.82, n - Math.floor(n))) * smoothstep(0.4, 0.6, fbm(x, y, z, f * 25, p.seed + 4));
  return { heightM: height, material: dust };
}

function ridged(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  let height = crateredReliefM(x, y, z, p);
  let margin = 0;
  const warp = (fbm(x, y, z, f * 60, p.seed + 21) - 0.5) * 0.6;
  for (let family = 0; family < 5; family++) {
    const [dx, dy, dz] = familyDirection(p.seed, family);
    const spacing = f * (25 + 70 * hash(family, 2, 5, p.seed));
    const width = spacing * 0.06;
    const u = (x * dx + y * dy + z * dz) / spacing + warp * (1 + family * 0.3);
    const t = Math.abs(u - Math.round(u)) * spacing;
    // Double ridge: two crests flanking a central trough (Europa's dominant landform).
    const crest = Math.exp(-(((t - width * 0.55) / (width * 0.35)) ** 2));
    // Europa's ridges stand ~100–300 m high: scale with the landform size, not total relief.
    const amplitude = f * (0.7 + 1.3 * hash(family, 3, 9, p.seed));
    height += amplitude * crest;
    // Only the youngest ridge families keep dark brown margins (a sparse lineae network).
    if (family < 3) margin = Math.max(margin, 0.85 * Math.exp(-((t / (width * 0.75)) ** 2)));
  }
  // Chaos terrain: disrupted ice blocks in a reddish matrix.
  const chaos = smoothstep(0.64, 0.72, fbm(x, y, z, f * 160, p.seed + 31));
  if (chaos > 0) {
    const block = cellular(x, y, z, f * 4, p.seed + 33);
    const raft = block.f2 - block.f1 > 0.12 ? f * 0.8 * (0.3 + block.id) : 0;
    height = height * (1 - chaos) + chaos * (raft - f * 0.3);
    margin = Math.max(margin, chaos * (block.f2 - block.f1 > 0.12 ? 0.1 : 0.55));
  }
  return { heightM: height, material: margin };
}

function grooved(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  // Bright grooved swaths cut through dark, older, more cratered terrain (Ganymede).
  const swath = smoothstep(0.46, 0.54, fbm(x, y, z, f * 220, p.seed + 41));
  const turn = fbm(x, y, z, f * 400, p.seed + 43);
  const [ax, ay, az] = familyDirection(p.seed, 10);
  const [bx, by, bz] = familyDirection(p.seed, 11);
  const s = turn < 0.5 ? (x * ax + y * ay + z * az) : (x * bx + y * by + z * bz);
  const wavelength = f * 18;
  // Ganymede's grooves: ~3 km wavelength, a few hundred meters of relief.
  const grooves = Math.sin((2 * Math.PI * s) / wavelength) * f * 1.6;
  const craters = crateredReliefM(x, y, z, p) * (0.35 + 0.65 * (1 - swath));
  return { heightM: craters + grooves * swath, material: 1 - swath };
}

function darkLag(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  let height = crateredReliefM(x, y, z, p);
  // Callisto's knobs: eroded pinnacles capped with bright frost, in fields.
  const field = smoothstep(0.45, 0.6, fbm(x, y, z, f * 120, p.seed + 51));
  const knob = cellular(x, y, z, f * 2, p.seed + 53);
  let frost = 0;
  if (field > 0 && knob.id > 0.45) {
    const shape = Math.max(0, 1 - knob.f1 / 0.42) ** 1.6;
    // Callisto's knobs rise ~50–150 m.
    height += shape * f * 0.6 * (0.5 + knob.id) * field;
    frost = smoothstep(0.35, 0.75, shape) * field;
  }
  return { heightM: height, material: frost };
}

function volcanic(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  let height = (fbm(x, y, z, f * 120, p.seed + 61) - 0.5) * p.reliefM * 0.05;
  // Lava flow lobes: low steps of fresh, dark lava over the sulfur plains.
  const flowNoise = fbm(x, y, z, f * 35, p.seed + 63);
  const flow = smoothstep(0.58, 0.6, flowNoise);
  height += flow * p.reliefM * 0.004;
  let lava = flow * (0.35 + 0.5 * hash(Math.floor(flowNoise * 20), 1, 1, p.seed));
  // Paterae: flat-floored volcanic depressions with steep walls and black lava lakes.
  const patera = cellular(x, y, z, f * 55, p.seed + 67);
  if (patera.id < 0.4) {
    const rim = 0.28 + 0.15 * patera.id;
    const inside = 1 - smoothstep(rim * 0.9, rim, patera.f1);
    height -= inside * p.reliefM * (0.06 + 0.08 * patera.id);
    lava = Math.max(lava, inside);
  }
  return { heightM: height, material: Math.min(1, lava) };
}

function pebble(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  // Huygens landed on a flat outwash plain: gentle swells and shallow drainage channels.
  let height = (fbm(x, y, z, f * 200, p.seed + 71) - 0.5) * p.reliefM * 0.3;
  const channel = 1 - Math.abs(2 * fbm(x, y, z, f * 60, p.seed + 73) - 1);
  const damp = smoothstep(0.9, 0.97, channel);
  height -= damp * p.reliefM * 0.06;
  return { heightM: height, material: damp };
}

function volatileIce(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  // Convection cells: gently domed polygons bounded by troughs (Sputnik Planitia).
  const cells = cellular(x, y, z, f * 30, p.seed + 81);
  const edge = cells.f2 - cells.f1;
  const trough = Math.exp(-((edge / 0.07) ** 2));
  let height = smoothstep(0, 0.5, edge) * p.reliefM * 0.006 - trough * p.reliefM * 0.01;
  // Sublimation pits pock the cell surfaces.
  const pits = cellular(x, y, z, f * 1.5, p.seed + 83);
  let pit = 0;
  if (pits.id > 0.5) {
    pit = 1 - smoothstep(0.18, 0.32, pits.f1);
    height -= pit * p.reliefM * 0.004;
  }
  height += crateredReliefM(x, y, z, { ...p, reliefM: p.reliefM * 0.4 });
  return { heightM: height, material: Math.max(trough * 0.9, pit * 0.45) };
}

function cantaloupe(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  const f = p.featureScaleM;
  // Triton's cavi: interlocking dimples with raised ridges between them.
  const cells = cellular(x, y, z, f * 15, p.seed + 91);
  const dimple = 1 - smoothstep(0, 0.45, cells.f1);
  const ridge = Math.exp(-(((cells.f2 - cells.f1) / 0.08) ** 2));
  const height = (-dimple + 0.35 * ridge) * p.reliefM * 0.01 + crateredReliefM(x, y, z, { ...p, reliefM: p.reliefM * 0.3 });
  // Dark fan-shaped streaks from nitrogen-gas plumes, aligned by the wind.
  const [wx, wy, wz] = familyDirection(p.seed, 20);
  const [vx, vy, vz] = familyDirection(p.seed, 21);
  const along = (x * wx + y * wy + z * wz) / (f * 50);
  const across = (x * vx + y * vy + z * vz) / (f * 6);
  const streak = smoothstep(0.66, 0.76, valueNoise(along, across, (x + y + z) / (f * 40), p.seed + 93));
  return { heightM: height, material: streak };
}

export function surfaceSample(x: number, y: number, z: number, p: SurfaceReliefParameters): SurfaceSample {
  let sample: SurfaceSample;
  switch (p.kind) {
    case "rubble": sample = rubble(x, y, z, p); break;
    case "comet": sample = comet(x, y, z, p); break;
    case "ice-ridged": sample = ridged(x, y, z, p); break;
    case "ice-grooved": sample = grooved(x, y, z, p); break;
    case "dark-lag": sample = darkLag(x, y, z, p); break;
    case "volcanic": sample = volcanic(x, y, z, p); break;
    case "pebble": sample = pebble(x, y, z, p); break;
    case "volatile-ice": sample = volatileIce(x, y, z, p); break;
    case "cantaloupe": sample = cantaloupe(x, y, z, p); break;
    default: sample = { heightM: crateredReliefM(x, y, z, p), material: 0 };
  }
  return {
    heightM: Math.max(-p.reliefM, Math.min(p.reliefM, sample.heightM)),
    material: Math.max(0, Math.min(1, sample.material)),
  };
}
