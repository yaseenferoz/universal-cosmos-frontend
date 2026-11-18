/** Deterministic, continuous 3D value noise. Coordinates are body-fixed meters / feature scale. */
function hash(x: number, y: number, z: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
const smooth = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function terrainNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const u = smooth(x - ix), v = smooth(y - iy), w = smooth(z - iz);
  return mix(
    mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), u), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u), v),
    mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u), v), w,
  );
}

function ramp(low: number, high: number, value: number): number {
  return smooth(Math.max(0, Math.min(1, (value - low) / (high - low))));
}

/**
 * Illustrative sedimentary uplands, eroded benches and shallow wind-shaped sand.
 * Not a Mars DEM or named landing site. No latitude/longitude seams or site-specific reset.
 * Output is bounded within +/- reliefM; every term is shared by mesh and collision.
 */
export function martianReliefM(x: number, y: number, z: number, reliefM: number): number {
  const amplitude = Number.isFinite(reliefM) ? Math.max(0, reliefM) : 0;
  if (amplitude === 0) return 0;
  const basin = terrainNoise(x / 2300, y / 2300, z / 2300);
  const warp = terrainNoise(x / 900 + 37, y / 900 - 19, z / 900 + 11);
  const upland = terrainNoise(x / 580 + warp * 0.6, y / 580 + 14, z / 580 - 23);
  const mesa = ramp(-0.12, 0.35, upland);
  const rawBench = mesa * 14;
  const bench = (Math.floor(rawBench) + ramp(0.15, 0.85, rawBench % 1)) / 14;
  const erosion = terrainNoise(x / 110 + 3, y / 110 + 7, z / 110 - 5);
  const sandMask = 1 - ramp(0.05, 0.5, mesa);
  const dune = Math.sin(x * 0.047 + y * 0.081 + z * 0.027 + erosion * 2);
  const ripples = Math.sin(x * 0.61 + y * 0.83 + z * 0.37 + erosion);
  return amplitude * (basin * 0.22 + bench * 0.38 + erosion * 0.018)
    + Math.min(1, amplitude / 450) * sandMask * (dune * 0.65 + ripples * 0.065);
}
