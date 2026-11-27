/**
 * Shape parameters shared by the galaxy sprites and volumes, so a galaxy looks the same when
 * it hands over from one to the other. Units: the galaxy's radius (R = 1).
 *
 * Bulges are truncated softened isothermal spheroids,
 *   ρ = K (1 / (r'² + c²) − 1 / (Rt'² + c²)),  r' = |M x|,
 * whose line integral has a closed form (no ray-marching noise at the core). Disks are
 * exponential in height; their face-on pattern comes from the archetype maps.
 */
import { MILKY_WAY } from "../../data/deep/milkyWay";
import { bulgeFraction } from "./deepPhotometry";
import { ARCHETYPE } from "./galaxyMaps";

/** Core of the bulge profile in units of its scale radius. */
export const BULGE_CORE = 0.3;
/** ∫∫ of the face-on old-star map over the unit disk (exp(−r/0.22) ≈ 2π·0.22²). */
export const MAP_NORMALISATION = 0.3;

export interface BulgeShape {
  /** Fraction of the galaxy's light. */
  fraction: number;
  /** Scale radius (in R) along the disk plane and the flattening of the bulge. */
  radius: number;
  flattening: number;
  /** Truncation radius in scaled units (Rt / radius). */
  truncation: number;
  /** Density normalisation so that ∫ρ dV = fraction (R³ units). */
  k: number;
}

/** Volume of the truncated profile in scaled units: 4π[Rt − c·atan(Rt/c)] − (4π/3)·Rt³/(Rt² + c²). */
export function bulgeScaledIntegral(truncation: number, core = BULGE_CORE): number {
  return 4 * Math.PI * (truncation - core * Math.atan(truncation / core)) - ((4 * Math.PI) / 3) * truncation ** 3 / (truncation ** 2 + core ** 2);
}

export function bulgeShape(tType: number, archetype: number, flattening: number): BulgeShape {
  const spheroid = archetype === ARCHETYPE.Spheroid;
  const fraction = spheroid ? 1 : bulgeFraction(tType);
  const radius = spheroid ? 0.06 : archetype === ARCHETYPE.S0 ? 0.09 : archetype === ARCHETYPE.Sa || archetype === ARCHETYPE.SBa ? 0.07
    : archetype === ARCHETYPE.Sc || archetype === ARCHETYPE.SBc ? 0.035 : 0.05;
  const shapeFlattening = spheroid ? Math.max(0.3, flattening) : 0.6;
  const truncation = (spheroid ? 1 : 0.35) / radius;
  const k = fraction > 0 ? fraction / (radius ** 3 * shapeFlattening * bulgeScaledIntegral(truncation)) : 0;
  return { fraction, radius, flattening: shapeFlattening, truncation, k };
}

/**
 * The Milky Way's bulge/bar: about 30% of the stellar light (bulge mass ~1.5×10^10 M☉ of
 * 5×10^10, Bland-Hawthorn & Gerhard 2016), scale ~1.2 kpc, truncated at its 5 kpc half-length.
 * Volumes stretch it along the bar; sprites treat it as round.
 */
export function milkyWayBulge(): BulgeShape {
  const radius = 1200 / MILKY_WAY.displayRadiusPc, flattening = 0.5;
  const truncation = MILKY_WAY.bar.halfLengthPc / MILKY_WAY.displayRadiusPc / radius;
  return { fraction: 0.3, radius, flattening, truncation, k: 0.3 / (radius ** 3 * flattening * bulgeScaledIntegral(truncation)) };
}

/**
 * Column through the bulge along a straight segment from a to b (object units, R = 1),
 * for an axisymmetric bulge (scaled coordinates x/r, y/(r q), z/r). Mirrors the GLSL.
 */
export function bulgeSegmentIntegral(a: [number, number, number], b: [number, number, number], shape: BulgeShape, core = BULGE_CORE): number {
  const s = [1 / shape.radius, 1 / (shape.radius * shape.flattening), 1 / shape.radius];
  const o = a.map((v, i) => v * s[i]);
  const d = b.map((v, i) => (v - a[i]) * s[i]);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const A = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, B = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], C = o[0] ** 2 + o[1] ** 2 + o[2] ** 2;
  const rt2 = shape.truncation ** 2, c2 = core * core;
  if (A < 1e-20) return 0;
  const disc = B * B - A * (C - rt2);
  if (disc <= 0) return 0;
  const root = Math.sqrt(disc);
  const s1 = Math.max(0, (-B - root) / A), s2 = Math.min(1, (-B + root) / A);
  if (s2 <= s1) return 0;
  const s0 = B / A, k = Math.sqrt(Math.max((C + c2) / A - s0 * s0, 1e-24));
  const first = (Math.atan((s2 + s0) / k) - Math.atan((s1 + s0) / k)) / (A * k);
  const second = (s2 - s1) / (rt2 + c2);
  return shape.k * length * Math.max(0, first - second);
}

export interface DiskHeights {
  /** Exponential scale heights (R units): old thin disk, thick disk, young stars and HII, dust. */
  old: number;
  thick: number;
  young: number;
  dust: number;
  /** Share of the old disk light in the thick disk. */
  thickFraction: number;
  /** Half-height of the bounding box (R units). */
  box: number;
}

export function diskHeights(flattening: number): DiskHeights {
  const old = Math.max(0.008, 0.25 * flattening);
  // Tall enough for the thick disk and the bulge (truncated at 0.35 R, flattened 0.6).
  return { old, thick: old * 3, young: old * 0.4, dust: old * 0.33, thickFraction: 0.25, box: Math.min(1, Math.max(old * 3 * 3.5, 0.35 * 0.6)) };
}

/** The Milky Way's heights in units of its display radius (Bland-Hawthorn & Gerhard 2016; dust ~100 pc). */
export function milkyWayHeights(): DiskHeights {
  const r = MILKY_WAY.displayRadiusPc;
  return {
    old: MILKY_WAY.thinDisk.scaleHeightPc / r, thick: MILKY_WAY.thickDisk.scaleHeightPc / r,
    young: 100 / r, dust: 90 / r, thickFraction: 0.25, box: 0.2,
  };
}

/** A stable in-plane reference axis for a disk normal, turned by `angle` about it. */
export function inPlaneAxis(normal: [number, number, number], angle: number): [number, number, number] {
  const [nx, ny, nz] = normal;
  const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  // e = normalize(ref × n)
  let ex = ref[1] * nz - ref[2] * ny, ey = ref[2] * nx - ref[0] * nz, ez = ref[0] * ny - ref[1] * nx;
  const length = Math.hypot(ex, ey, ez) || 1;
  ex /= length; ey /= length; ez /= length;
  // f = n × e
  const fx = ny * ez - nz * ey, fy = nz * ex - nx * ez, fz = nx * ey - ny * ex;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [ex * c + fx * s, ey * c + fy * s, ez * c + fz * s];
}

/** Repeatable pseudo-random angle per catalogue index (the arms' phase is not measured). */
export function seedAngle(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * Math.PI * 2;
}
