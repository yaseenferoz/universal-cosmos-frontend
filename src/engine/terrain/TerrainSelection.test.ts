import { describe, expect, it } from "vitest";
import { Frustum, Matrix4, PerspectiveCamera } from "three";
import { geodeticToCartesian, tileDirection, tileId } from "./coordinates";
import { horizonVisible, selectTerrainTiles, terrainBudget, tileBounds, type SelectionContext } from "./TerrainSelection";

function context(height: number): SelectionContext {
  return {
    positionM: geodeticToCartesian(20.1908, 30.7717, height, 1_737_400),
    radiusM: 1_737_400, minElevationM: -9000, maxElevationM: 11000,
    viewportHeight: 900, fovRadians: Math.PI / 3, heightAt: () => 0,
    budget: terrainBudget("medium"),
  };
}

describe("cube-sphere quadtree selection", () => {
  it("respects mobile/desktop tile budgets while refining to ground scale", () => {
    for (const quality of ["low", "medium", "high"] as const) {
      const selectionContext = context(1.7);
      selectionContext.budget = terrainBudget(quality);
      const selection = selectTerrainTiles(selectionContext);
      expect(selection.tiles.length).toBeLessThanOrEqual(selectionContext.budget.maxTiles);
      expect(Math.max(...selection.tiles.map((tile) => tile.level))).toBe(16);
      expect(new Set(selection.tiles.map(tileId)).size).toBe(selection.tiles.length);
    }
  });

  it("keeps refinements stable for centimeter observer jitter", () => {
    const before = context(1000);
    const selection = selectTerrainTiles(before);
    const after = { ...before, positionM: before.positionM.clone().addScalar(0.01), previousSplits: selection.splitIds };
    const next = selectTerrainTiles(after);
    const overlap = next.tiles.filter((tile) => selection.tiles.some((prior) => tileId(prior) === tileId(tile))).length;
    expect(overlap / selection.tiles.length).toBeGreaterThan(0.8);
  });

  it("conservatively culls the back hemisphere without losing the observer tile", () => {
    const selectionContext = context(100_000);
    const near = { face: 0 as const, level: 5, x: 25, y: 22 };
    selectionContext.positionM.copy(tileDirection(near, 0.5, 0.5)).multiplyScalar(1_837_400);
    expect(horizonVisible(tileBounds(near, selectionContext), selectionContext)).toBe(true);
    const far = { face: 1 as const, level: 5, x: 16, y: 16 };
    expect(horizonVisible(tileBounds(far, selectionContext), selectionContext)).toBe(false);
  });

  it("uses the camera frustum in local meter coordinates", () => {
    const selectionContext = context(100_000);
    const camera = new PerspectiveCamera(50, 1, 0.1, 10_000_000);
    camera.lookAt(selectionContext.positionM.clone().negate());
    camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const visible = selectTerrainTiles({ ...selectionContext, frustum });
    expect(visible.tiles.length).toBeGreaterThan(0);
    camera.lookAt(selectionContext.positionM);
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(selectTerrainTiles({ ...selectionContext, frustum }).tiles.length).toBe(0);
  });
});
