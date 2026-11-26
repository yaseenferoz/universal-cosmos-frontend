import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import type { TerrainDataProvider } from "../../types/terrain";
import { cartesianToGeodetic, tileDirection, type TerrainTileKey } from "./coordinates";

export interface TerrainGeometry {
  geometry: BufferGeometry;
  centerM: Vector3;
  key: TerrainTileKey;
  segments: number;
  surfaceIndexCount: number;
  sourceResolutionM: number;
  sourceId: string;
  byteLength: number;
}

/** Shared grid posts and identical height sampling make equal-LOD boundaries exact. */
export function buildTerrainGeometry(key: TerrainTileKey, segments: number, provider: TerrainDataProvider): TerrainGeometry {
  const datum = provider.manifest.radiusM;
  const middle = tileDirection(key, 0.5, 0.5);
  const middleCoordinates = cartesianToGeodetic(middle, 1);
  const middleHeight = provider.sampleHeight(middleCoordinates.latDeg, middleCoordinates.lonDeg);
  const centerM = middle.multiplyScalar(datum + middleHeight.heightM);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const elevations: number[] = [], slopes: number[] = [];
  const direction = new Vector3(), point = new Vector3();
  let sourceResolutionM = 0;
  let sourceId = middleHeight.sourceId;
  const heightAt = (vector: Vector3): number => {
    const coordinates = cartesianToGeodetic(vector, 1);
    return provider.sampleHeight(coordinates.latDeg, coordinates.lonDeg).heightM;
  };
  const edgeM = tileDirection(key, 0, 0.5).angleTo(tileDirection(key, 1, 0.5)) * datum;
  const spacingM = edgeM / segments;
  // Skirts close different-LOD edges without fabricating terrain above the DEM.
  const reliefClosureM = provider.manifest.reconstruction
    ? Math.min(provider.manifest.maxElevationM - provider.manifest.minElevationM, spacingM * 3)
    : Math.min(50, spacingM * 0.3);
  const skirtDepthM = Math.max(0.25, Math.min(4000, 4 * spacingM ** 2 / datum + reliefClosureM));
  // Analytic reconstructions: sample each grid post once (plus a one-post border
  // ring shared with neighbouring tiles) and derive normals from the grid. That is
  // ~4x fewer height evaluations than per-vertex finite differences.
  if (provider.manifest.reconstruction)
    return buildReconstructedTile(key, segments, provider, centerM, middleHeight, middleCoordinates.lonDeg, skirtDepthM);
  for (let y = 0; y <= segments; y++) {
    for (let x = 0; x <= segments; x++) {
      tileDirection(key, x / segments, y / segments, direction);
      const coordinates = cartesianToGeodetic(direction, 1);
      const sample = provider.sampleHeight(coordinates.latDeg, coordinates.lonDeg);
      sourceResolutionM = Math.max(sourceResolutionM, sample.resolutionM);
      if (sample.resolutionM < middleHeight.resolutionM) sourceId = sample.sourceId;
      point.copy(direction).multiplyScalar(datum + sample.heightM).sub(centerM);
      positions.push(point.x, point.y, point.z);
      elevations.push(sample.heightM);
      let longitude = coordinates.lonDeg;
      while (longitude - middleCoordinates.lonDeg > 180) longitude -= 360;
      while (longitude - middleCoordinates.lonDeg < -180) longitude += 360;
      uvs.push(0.5 + longitude / 360, 0.5 + coordinates.latDeg / 180);
      // Normals use the same measured elevation field as collision. The finite
      // difference is bounded by native resolution; no invented normal noise.
      const stepM = Math.max(1, Math.min(sample.resolutionM * 0.5, spacingM));
      const east = new Vector3(-Math.sin(coordinates.lonDeg * Math.PI / 180), 0, -Math.cos(coordinates.lonDeg * Math.PI / 180));
      const north = new Vector3().crossVectors(direction, east);
      const eastPlus = direction.clone().addScaledVector(east, stepM / datum).normalize();
      const eastMinus = direction.clone().addScaledVector(east, -stepM / datum).normalize();
      const northPlus = direction.clone().addScaledVector(north, stepM / datum).normalize();
      const northMinus = direction.clone().addScaledVector(north, -stepM / datum).normalize();
      const slopeEast = (heightAt(eastPlus) - heightAt(eastMinus)) / (2 * stepM);
      const slopeNorth = (heightAt(northPlus) - heightAt(northMinus)) / (2 * stepM);
      slopes.push(Math.hypot(slopeEast, slopeNorth));
      const normal = direction.clone().addScaledVector(east, -slopeEast).addScaledVector(north, -slopeNorth).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  return assembleTile({ key, segments, centerM, skirtDepthM, sourceResolutionM, sourceId, positions, normals, uvs, elevations, slopes });
}

interface TileArrays {
  key: TerrainTileKey;
  segments: number;
  centerM: Vector3;
  skirtDepthM: number;
  sourceResolutionM: number;
  sourceId: string;
  positions: number[];
  normals: number[];
  uvs: number[];
  elevations: number[];
  slopes: number[];
}

/** Triangulates the grid, adds edge skirts and builds the BufferGeometry. */
function assembleTile(tile: TileArrays): TerrainGeometry {
  const { key, segments, centerM, skirtDepthM, sourceResolutionM, sourceId, positions, normals, uvs, elevations, slopes } = tile;
  const count = (segments + 1) ** 2;
  const point = new Vector3();
  const indices: number[] = [];
  for (let y = 0; y < segments; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const edges = [
    Array.from({ length: segments + 1 }, (_, x) => x),
    Array.from({ length: segments + 1 }, (_, y) => y * (segments + 1) + segments),
    Array.from({ length: segments + 1 }, (_, x) => segments * (segments + 1) + segments - x),
    Array.from({ length: segments + 1 }, (_, y) => (segments - y) * (segments + 1)),
  ];
  for (const edge of edges) {
    const start = positions.length / 3;
    for (const index of edge) {
      point.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]).add(centerM);
      point.addScaledVector(point.clone().normalize(), -skirtDepthM).sub(centerM);
      positions.push(point.x, point.y, point.z);
      normals.push(normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]);
      uvs.push(uvs[index * 2], uvs[index * 2 + 1]);
      elevations.push(elevations[index]);
      slopes.push(slopes[index]);
    }
    for (let i = 0; i < segments; i++) {
      const a = edge[i], b = edge[i + 1], c = start + i, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("terrainElevationM", new BufferAttribute(new Float32Array(elevations), 1));
  geometry.setAttribute("terrainSlope", new BufferAttribute(new Float32Array(slopes), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData.surfaceVertexCount = count;
  return {
    geometry, centerM, key, segments, surfaceIndexCount: segments * segments * 6, sourceResolutionM, sourceId,
    byteLength: positions.length * 4 + normals.length * 4 + uvs.length * 4 + (elevations.length + slopes.length) * 4 + indices.length * 2,
  };
}

/**
 * Reconstruction tile: one height sample per grid post on a (segments + 3)² grid
 * (the outer ring belongs to neighbouring tiles at the same level, so normals match
 * across tile edges) and normals from central differences of the 3D grid.
 */
function buildReconstructedTile(
  key: TerrainTileKey, segments: number, provider: TerrainDataProvider, centerM: Vector3,
  middleHeight: { resolutionM: number; sourceId: string }, middleLonDeg: number, skirtDepthM: number,
): TerrainGeometry {
  const datum = provider.manifest.radiusM;
  const side = segments + 3;
  const grid = new Float64Array(side * side * 3);
  const heights = new Float64Array(side * side);
  const direction = new Vector3();
  let sourceResolutionM = 0;
  const sourceId = middleHeight.sourceId;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      tileDirection(key, (i - 1) / segments, (j - 1) / segments, direction);
      direction.normalize();
      const coordinates = cartesianToGeodetic(direction, 1);
      const sample = provider.sampleHeight(coordinates.latDeg, coordinates.lonDeg);
      sourceResolutionM = Math.max(sourceResolutionM, sample.resolutionM);
      const index = j * side + i;
      heights[index] = sample.heightM;
      const radius = datum + sample.heightM;
      grid[index * 3] = direction.x * radius;
      grid[index * 3 + 1] = direction.y * radius;
      grid[index * 3 + 2] = direction.z * radius;
    }
  }
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const elevations: number[] = [], slopes: number[] = [];
  const du = new Vector3(), dv = new Vector3(), normal = new Vector3(), up = new Vector3();
  const at = (i: number, j: number, target: Vector3) => {
    const k = (j * side + i) * 3;
    return target.set(grid[k], grid[k + 1], grid[k + 2]);
  };
  const a = new Vector3(), b = new Vector3();
  for (let y = 0; y <= segments; y++) {
    for (let x = 0; x <= segments; x++) {
      const i = x + 1, j = y + 1;
      const center = at(i, j, new Vector3());
      positions.push(center.x - centerM.x, center.y - centerM.y, center.z - centerM.z);
      elevations.push(heights[j * side + i]);
      up.copy(center).normalize();
      const coordinates = cartesianToGeodetic(up, 1);
      let longitude = coordinates.lonDeg;
      while (longitude - middleLonDeg > 180) longitude -= 360;
      while (longitude - middleLonDeg < -180) longitude += 360;
      uvs.push(0.5 + longitude / 360, 0.5 + coordinates.latDeg / 180);
      du.subVectors(at(i + 1, j, a), at(i - 1, j, b));
      dv.subVectors(at(i, j + 1, a), at(i, j - 1, b));
      normal.crossVectors(du, dv).normalize();
      if (normal.dot(up) < 0) normal.negate();
      normals.push(normal.x, normal.y, normal.z);
      const cosine = Math.min(1, Math.max(1e-6, normal.dot(up)));
      slopes.push(Math.sqrt(1 - cosine * cosine) / cosine);
    }
  }
  return assembleTile({ key, segments, centerM, skirtDepthM, sourceResolutionM, sourceId, positions, normals, uvs, elevations, slopes });
}