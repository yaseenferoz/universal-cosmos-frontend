import { Frustum, Sphere, Vector3 } from "three";
import type { Quality } from "../../types/celestial";
import { CUBE_ROOTS, directionToCube, tileChildren, tileDirection, tileId, type TerrainTileKey } from "./coordinates";

export interface TerrainBudget {
  maxTiles: number;
  cacheTiles: number;
  segments: number;
  maxLevel: number;
  splitPixels: number;
  buildsPerFrame: number;
}

export function terrainBudget(quality: Quality, mobile = false): TerrainBudget {
  const resolved = quality === "auto" ? mobile ? "low" : "medium" : quality;
  const presets = {
    low: { maxTiles: 72, cacheTiles: 160, segments: 16, maxLevel: 16, splitPixels: 3.5, buildsPerFrame: 1 },
    medium: { maxTiles: 120, cacheTiles: 260, segments: 24, maxLevel: 16, splitPixels: 2.5, buildsPerFrame: 2 },
    high: { maxTiles: 192, cacheTiles: 400, segments: 32, maxLevel: 16, splitPixels: 1.8, buildsPerFrame: 2 },
  };
  return presets[resolved];
}

export interface SelectionContext {
  positionM: Vector3;
  radiusM: number;
  minElevationM: number;
  maxElevationM: number;
  viewportHeight: number;
  fovRadians: number;
  frustum?: Frustum;
  heightAt(direction: Vector3): number;
  budget: TerrainBudget;
  previousSplits?: ReadonlySet<string>;
}

export interface TileBounds {
  centerM: Vector3;
  direction: Vector3;
  angularRadius: number;
  surfaceRadiusM: number;
  sphereRadiusM: number;
  edgeM: number;
}

export function tileBounds(key: TerrainTileKey, context: SelectionContext): TileBounds {
  const direction = tileDirection(key, 0.5, 0.5);
  const elevation = context.heightAt(direction);
  let angularRadius = 0;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]])
    angularRadius = Math.max(angularRadius, direction.angleTo(tileDirection(key, x, y)));
  const radius = context.radiusM + elevation;
  const surfaceRadiusM = 2 * radius * Math.sin(angularRadius / 2);
  // Full source extrema make visibility conservative even before finer data arrives.
  const relief = Math.max(Math.abs(context.maxElevationM - elevation), Math.abs(context.minElevationM - elevation));
  return {
    centerM: direction.clone().multiplyScalar(radius), direction, angularRadius,
    surfaceRadiusM, sphereRadiusM: surfaceRadiusM + relief,
    edgeM: angularRadius * radius * Math.SQRT2,
  };
}

/** Reject only when the whole angular cap lies behind a conservative inner sphere. */
export function horizonVisible(bounds: TileBounds, context: SelectionContext): boolean {
  const cameraRadius = context.positionM.length();
  const occluderRadius = context.radiusM + context.minElevationM - 1;
  if (cameraRadius <= occluderRadius) return true;
  const cameraHorizon = Math.acos(Math.min(1, occluderRadius / cameraRadius));
  const terrainHorizon = Math.acos(Math.min(1, occluderRadius / (context.radiusM + context.maxElevationM)));
  const separation = bounds.direction.angleTo(context.positionM);
  return separation <= cameraHorizon + terrainHorizon + bounds.angularRadius;
}

function visible(bounds: TileBounds, context: SelectionContext): boolean {
  if (!horizonVisible(bounds, context)) return false;
  return !context.frustum || context.frustum.intersectsSphere(new Sphere(
    bounds.centerM.clone().sub(context.positionM), bounds.sphereRadiusM,
  ));
}

export function projectedTileError(bounds: TileBounds, context: SelectionContext): number {
  const spacing = bounds.edgeM / context.budget.segments;
  // Curvature plus a conservative relief interpolation proxy. Subdividing this
  // geometry interpolates measured DEM posts; it never creates new observations.
  const geometricError = spacing * spacing / (8 * context.radiusM) + Math.min(1500, spacing * 0.2);
  const distance = Math.max(1, context.positionM.distanceTo(bounds.centerM) - bounds.surfaceRadiusM);
  const focalPixels = context.viewportHeight / (2 * Math.tan(context.fovRadians / 2));
  return geometricError * focalPixels / distance;
}

export interface TerrainSelection {
  tiles: TerrainTileKey[];
  splitIds: Set<string>;
}

/** Priority subdivision spends a bounded tile budget nearest the observer. */
export function selectTerrainTiles(context: SelectionContext): TerrainSelection {
  const observer = directionToCube(context.positionM);
  const altitude = Math.max(1, context.positionM.length() - context.radiusM - context.heightAt(context.positionM.clone().normalize()));
  const groundSpacing = Math.max(2, Math.min(500, altitude / 20));
  const leaves = new Map<string, { key: TerrainTileKey; error: number; groundPriority: boolean }>();
  const splitIds = new Set<string>();
  const leaf = (key: TerrainTileKey, bounds: TileBounds) => {
    const count = 2 ** key.level;
    const u = (observer.u + 1) * count / 2;
    const v = (observer.v + 1) * count / 2;
    return { key, error: projectedTileError(bounds, context), groundPriority:
      altitude < 10_000 && key.face === observer.face && u >= key.x && u <= key.x + 1 && v >= key.y && v <= key.y + 1 && bounds.edgeM / context.budget.segments > groundSpacing };
  };
  const add = (key: TerrainTileKey) => {
    const bounds = tileBounds(key, context);
    if (visible(bounds, context)) leaves.set(tileId(key), leaf(key, bounds));
  };
  CUBE_ROOTS.forEach(add);
  // A quadtree has finite depth; the cap also protects malformed runtime input.
  for (let iteration = 0; iteration < context.budget.maxTiles * context.budget.maxLevel; iteration++) {
    let candidate: { key: TerrainTileKey; error: number } | undefined;
    let priority = 0;
    for (const leaf of leaves.values()) {
      if (leaf.key.level >= context.budget.maxLevel) continue;
      const threshold = context.budget.splitPixels * (context.previousSplits?.has(tileId(leaf.key)) ? 0.65 : 1);
      const score = leaf.error / threshold + (leaf.groundPriority ? 1_000_000 : 0);
      if (score > Math.max(1, priority)) { candidate = leaf; priority = score; }
    }
    if (!candidate) break;
    const children = tileChildren(candidate.key).map((key) => ({ key, bounds: tileBounds(key, context) }))
      .filter(({ bounds }) => visible(bounds, context));
    if (leaves.size - 1 + children.length > context.budget.maxTiles) break;
    leaves.delete(tileId(candidate.key));
    splitIds.add(tileId(candidate.key));
    children.forEach(({ key, bounds }) => leaves.set(tileId(key), leaf(key, bounds)));
  }
  return { tiles: [...leaves.values()].map(({ key }) => key), splitIds };
}
