import { terrainNoise } from "./martianRelief";

const fade = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const random = (x: number, y: number, z: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

/** Compact, smooth crater bowl and raised rim; normalized radius, illustrative shape. */
export function craterProfile(radius: number): number {
  if (radius >= 1.5 || radius < 0) return 0;
  const bowl = -0.32 * Math.max(0, 1 - radius * radius) ** 2;
  const rim = 0.12 * Math.exp(-(((radius - 1) / 0.14) ** 2)) * (1 - fade((radius - 1.2) / 0.3));
  return bowl + rim;
}

/** Body-fixed 3D fields avoid cube-face, longitude and pole seams. No named geography. */
export function terrestrialReliefM(body: "earth" | "venus" | "mercury", x: number, y: number, z: number, reliefM: number): number {
  const amplitude = Number.isFinite(reliefM) ? Math.max(0, reliefM) : 0;
  if (!amplitude) return 0;
  const broad = terrainNoise(x / 1800, y / 1800, z / 1800);
  if (body === "earth") {
    const hills = terrainNoise(x / 650 + 13, y / 650, z / 650 - 9);
    const ridges = 1 - Math.abs(terrainNoise(x / 210, y / 210 + 31, z / 210));
    const ground = terrainNoise(x / 8, y / 8, z / 8);
    return amplitude * (0.38 * broad + 0.28 * hills + 0.08 * ridges)
      + Math.min(amplitude / 300, 1) * ground * 0.28;
  }
  if (body === "venus") {
    const uplands = terrainNoise(x / 780, y / 780 + 41, z / 780);
    const fractures = Math.abs(terrainNoise(x / 95 + 7, y / 95, z / 95 - 5));
    return amplitude * (0.18 * broad + 0.42 * fade((uplands + 0.12) / 0.65) + 0.018 * fractures);
  }
  // A 3D cellular slice creates irregularly spaced bowls/rims, avoiding a tiled
  // cosine crater grid. Support fits within the 27 neighboring cells.
  const px = x / 1400, py = y / 1400, pz = z / 1400;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let craters = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c;
    const dx = px - cx - 0.25 - 0.5 * random(cx, cy, cz, 17);
    const dy = py - cy - 0.25 - 0.5 * random(cx, cy, cz, 31);
    const dz = pz - cz - 0.25 - 0.5 * random(cx, cy, cz, 47);
    const radius = 0.35 + 0.33 * random(cx, cy, cz, 59);
    craters += craterProfile(Math.hypot(dx, dy, dz) / radius);
  }
  return amplitude * Math.max(-0.9, Math.min(0.9, 0.12 * broad + craters));
}
