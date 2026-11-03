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
  const count = (segments + 1) ** 2;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
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
  const skirtDepthM = Math.max(0.25, Math.min(4000, 4 * spacingM ** 2 / datum + Math.min(50, spacingM * 0.3)));
  for (let y = 0; y <= segments; y++) {
    for (let x = 0; x <= segments; x++) {
      tileDirection(key, x / segments, y / segments, direction);
      const coordinates = cartesianToGeodetic(direction, 1);
      const sample = provider.sampleHeight(coordinates.latDeg, coordinates.lonDeg);
      sourceResolutionM = Math.max(sourceResolutionM, sample.resolutionM);
      if (sample.resolutionM < middleHeight.resolutionM) sourceId = sample.sourceId;
      point.copy(direction).multiplyScalar(datum + sample.heightM).sub(centerM);
      positions.push(point.x, point.y, point.z);
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
      const normal = direction.clone().addScaledVector(east, -slopeEast).addScaledVector(north, -slopeNorth).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }
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
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData.surfaceVertexCount = count;
  return {
    geometry, centerM, key, segments, surfaceIndexCount: segments * segments * 6, sourceResolutionM, sourceId,
    byteLength: positions.length * 4 + normals.length * 4 + uvs.length * 4 + indices.length * 2,
  };
}
