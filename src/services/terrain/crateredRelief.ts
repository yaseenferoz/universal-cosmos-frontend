/**
 * Seeded, illustrative relief for airless worlds without a measured DEM.
 *
 * Simple impact craters at several size octaves (depth/diameter ≈ 0.2, raised rims and
 * a short ejecta apron) over gentle long-wavelength undulation. Crater density is a
 * per-body choice (heavily cratered Callisto vs. resurfaced Europa or volcanic Io).
 * Positions are body-fixed meters; the same seed always gives the same landscape, so
 * descending twice to one site shows the same terrain. Not a measurement.
 */
export interface CrateredReliefParameters {
  seed: number;
  /** Largest relief amplitude, meters. */
  reliefM: number;
  /** Smallest crater spacing, meters (finest resolved landform scale). */
  featureScaleM: number;
  /** Body radius, meters (limits the largest crater size). */
  radiusM: number;
  /** 0 = smooth resurfaced plains, 1 = saturated cratering. */
  craterDensity: number;
}

function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz, seed);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), sx), lerp(corner(0, 1, 0), corner(1, 1, 0), sx), sy),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), sx), lerp(corner(0, 1, 1), corner(1, 1, 1), sx), sy),
    sz,
  );
}

/** Crater relief (meters) of one size octave at point p (meters). */
function craterOctave(x: number, y: number, z: number, cell: number, octave: number, parameters: CrateredReliefParameters): number {
  const px = x / cell, py = y / cell, pz = z / cell;
  // Crater radii stay below half a cell: only the 2×2×2 nearest cells can reach p.
  const bx = Math.floor(px - 0.5), by = Math.floor(py - 0.5), bz = Math.floor(pz - 0.5);
  const seed = parameters.seed + octave * 7919;
  let relief = 0;
  for (let corner = 0; corner < 8; corner++) {
    const cx = bx + (corner & 1), cy = by + ((corner >> 1) & 1), cz = bz + ((corner >> 2) & 1);
    if (hash(cx, cy, cz, seed ^ 0x51ed27) > parameters.craterDensity * 0.75) continue;
    const fx = cx + hash(cx, cy, cz, seed ^ 0x1b873593);
    const fy = cy + hash(cx, cy, cz, seed ^ 0x2c1b3c6d);
    const fz = cz + hash(cx, cy, cz, seed ^ 0x297a2d39);
    const radius = 0.12 + 0.3 * hash(cx, cy, cz, seed ^ 0x6c8e9cf5);
    const d = Math.hypot(px - fx, py - fy, pz - fz) / radius;
    if (d >= 1.8) continue;
    // Depth/diameter ≈ 0.2 for simple craters; degraded (older) craters are shallower.
    // Large basins are relaxed and infilled: depth saturates well below the relief bound.
    const depth = Math.min(0.4 * radius * cell, parameters.reliefM * 0.8)
      * (0.45 + 0.55 * hash(cx, cy, cz, seed ^ 0x3cd0b2ad));
    const rim = depth * 0.2;
    if (d < 1) relief += depth * (d * d - 1) + rim * d * d * d * d;
    else {
      const apron = 1 - (d - 1) / 0.8;
      relief += rim * apron * apron;
    }
  }
  return relief;
}

export function crateredReliefM(x: number, y: number, z: number, parameters: CrateredReliefParameters): number {
  const { reliefM, featureScaleM, radiusM } = parameters;
  if (!(reliefM > 0) || !(featureScaleM > 0)) return 0;
  // Gentle long-wavelength undulation: wavelengths ≥ 15× the relief keep slopes of a few
  // degrees, so craters (not noise) dominate local roughness, as on airless worlds.
  const broad = Math.max(featureScaleM * 400, reliefM * 15);
  let undulation = 0, amplitude = 0.5, frequency = 1 / broad;
  for (let octave = 0; octave < 4; octave++) {
    undulation += amplitude * (valueNoise(x * frequency, y * frequency, z * frequency, parameters.seed + octave) - 0.5);
    frequency *= 2.1;
    amplitude *= 0.5;
  }
  let relief = undulation * reliefM * 0.3;
  // Crater octaves from the feature scale up to ~1/6 of the radius, cell ×4 per octave.
  let cell = featureScaleM * 2;
  for (let octave = 0; octave < 6 && cell < radiusM / 3; octave++) {
    relief += craterOctave(x, y, z, cell, octave, parameters);
    cell *= 4;
  }
  return Math.max(-reliefM, Math.min(reliefM, relief));
}
