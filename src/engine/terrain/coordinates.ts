import { Vector3 } from "three";
import type { TerrainCubeFace as CubeFace, TerrainTileKey } from "../../types/terrain";

export type { CubeFace, TerrainTileKey };

const DEG = Math.PI / 180;

/** Moon-fixed meters: +Y north, +X prime meridian, +Z west 90 degrees. */
export function geodeticToCartesian(
  latDeg: number,
  lonDeg: number,
  heightM: number,
  radiusM: number,
  target = new Vector3(),
): Vector3 {
  const latitude = latDeg * DEG;
  const longitude = lonDeg * DEG;
  const radius = radiusM + heightM;
  return target.set(
    radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    -radius * Math.cos(latitude) * Math.sin(longitude),
  );
}

export function cartesianToGeodetic(positionM: Vector3, radiusM: number) {
  const radius = positionM.length();
  return {
    latDeg: radius > 0 ? Math.asin(positionM.y / radius) / DEG : 0,
    lonDeg: Math.atan2(-positionM.z, positionM.x) / DEG,
    heightM: radius - radiusM,
  };
}

/** Face order and orientation are specified in PLANETARY_ENGINE.md. */
export function cubeDirection(face: CubeFace, u: number, v: number, target = new Vector3()): Vector3 {
  switch (face) {
    case 0: target.set(1, v, -u); break;
    case 1: target.set(-1, v, u); break;
    case 2: target.set(u, 1, -v); break;
    case 3: target.set(u, -1, v); break;
    case 4: target.set(u, v, 1); break;
    case 5: target.set(-u, v, -1); break;
  }
  return target.normalize();
}

export function tileDirection(key: TerrainTileKey, x: number, y: number, target = new Vector3()): Vector3 {
  const count = 2 ** key.level;
  return cubeDirection(key.face, 2 * (key.x + x) / count - 1, 2 * (key.y + y) / count - 1, target);
}

export function directionToCube(direction: Vector3): { face: CubeFace; u: number; v: number } {
  const { x, y, z } = direction;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az)
    return x >= 0 ? { face: 0, u: -z / ax, v: y / ax } : { face: 1, u: z / ax, v: y / ax };
  if (ay >= az)
    return y >= 0 ? { face: 2, u: x / ay, v: -z / ay } : { face: 3, u: x / ay, v: z / ay };
  return z >= 0 ? { face: 4, u: x / az, v: y / az } : { face: 5, u: -x / az, v: y / az };
}

export function tileId(key: TerrainTileKey): string {
  return `${key.face}/${key.level}/${key.x}/${key.y}`;
}

export function tileChildren(key: TerrainTileKey): TerrainTileKey[] {
  return [0, 1, 2, 3].map((index) => ({
    face: key.face, level: key.level + 1,
    x: key.x * 2 + index % 2, y: key.y * 2 + Math.floor(index / 2),
  }));
}

export function tileParent(key: TerrainTileKey): TerrainTileKey | null {
  return key.level === 0 ? null : {
    face: key.face, level: key.level - 1, x: Math.floor(key.x / 2), y: Math.floor(key.y / 2),
  };
}

export const CUBE_ROOTS: TerrainTileKey[] = [0, 1, 2, 3, 4, 5].map((face) => ({
  face: face as CubeFace, level: 0, x: 0, y: 0,
}));
