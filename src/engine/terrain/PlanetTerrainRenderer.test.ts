import { describe, expect, it, vi } from "vitest";
import { BufferGeometry, Mesh, PerspectiveCamera, Texture, Vector3 } from "three";
import { PlanetTerrainRenderer } from "./PlanetTerrainRenderer";
import { geodeticToCartesian } from "./coordinates";
import { testTerrainProvider } from "./terrainTestProvider";

vi.mock("../loaders/ScientificTextureLoader", () => ({
  scientificTextures: { acquire: async () => ({ texture: new Texture(), release: vi.fn() }) },
  fetchImageTexture: async () => new Texture(),
}));

describe("terrain lifecycle and rendered collision", () => {
  it("keeps complete coarse coverage while bounded refinement catches up", async () => {
    const renderer = new PlanetTerrainRenderer(testTerrainProvider(), "low");
    await renderer.prepare();
    expect(renderer.status.ready).toBe(true);
    expect(renderer.status.residentTiles).toBe(6);
    const position = geodeticToCartesian(20.1908, 30.7717, 121.7, 1_737_400);
    const camera = new PerspectiveCamera(55, 1.5, 0.05, 10_000_000);
    camera.lookAt(position.clone().negate());
    for (let frame = 0; frame < 130; frame++) {
      renderer.update(position, camera, 700);
      expect(renderer.status.visibleTiles).toBeGreaterThan(0);
      expect(renderer.sampleSurfaceHeight(20.1908, 30.7717)).not.toBeNull();
    }
    expect(renderer.status.residentTiles).toBeLessThanOrEqual(160);
    expect(renderer.status.maxLevel).toBe(16);
    expect(renderer.sampleSurfaceHeight(20.1908, 30.7717)).toBeCloseTo(120, 3);
    const geometries = renderer.group.children.map((child) => "geometry" in child ? child.geometry : null)
      .filter((geometry): geometry is { dispose(): void } => !!geometry && typeof geometry === "object" && "dispose" in geometry);
    const disposal = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
    renderer.dispose(); renderer.dispose();
    expect(disposal.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(renderer.status.residentTiles).toBe(0);
    expect(renderer.group.children).toHaveLength(0);
  });

  it("does not instantiate terrain after disposal during pending initialization", async () => {
    let resolve: () => void = () => undefined;
    const provider = testTerrainProvider();
    provider.initialize = () => new Promise<void>((done) => { resolve = done; });
    const renderer = new PlanetTerrainRenderer(provider);
    const ready = renderer.prepare();
    renderer.dispose();
    resolve(); await ready;
    renderer.update(new Vector3(), new PerspectiveCamera(), 700);
    expect(renderer.status.ready).toBe(false);
    expect(renderer.group.children).toHaveLength(0);
  });

  it("evicts unused tile geometry while retaining roots and collision coverage", async () => {
    const renderer = new PlanetTerrainRenderer(testTerrainProvider(), "low");
    await renderer.prepare();
    const disposed = vi.spyOn(BufferGeometry.prototype, "dispose");
    const camera = new PerspectiveCamera(55, 1.5, 0.05, 10_000_000);
    for (let region = 0; region < 6; region++) {
      const position = geodeticToCartesian(10 + region * 5, 10 + region * 8, 121.7, 1_737_400);
      camera.lookAt(position.clone().negate());
      for (let frame = 0; frame < 100; frame++) renderer.update(position, camera, 700);
      expect(renderer.status.ready).toBe(true);
      expect(renderer.status.residentTiles).toBeLessThanOrEqual(160);
      expect(renderer.sampleSurfaceHeight(10 + region * 5, 10 + region * 8)).not.toBeNull();
    }
    expect(disposed.mock.calls.length).toBeGreaterThan(100);
    renderer.dispose();
    disposed.mockRestore();
  });

  it("rebases same-frame collision corrections without replacing geometry", async () => {
    const renderer = new PlanetTerrainRenderer(testTerrainProvider(), "low");
    await renderer.prepare();
    const position = geodeticToCartesian(20, 30, 200, 1_737_400);
    const camera = new PerspectiveCamera(55, 1.5, 0.05, 10_000_000);
    camera.lookAt(position.clone().negate());
    renderer.update(position, camera, 700);
    const visible = renderer.group.children.find((child) => child.visible);
    expect(visible).toBeDefined();
    const before = visible!.position.clone();
    const count = renderer.status.residentTiles;
    renderer.updateOrigin(position.clone().add(new Vector3(0.2, 0.3, -0.1)));
    expect(visible!.position.distanceTo(before.sub(new Vector3(0.2, 0.3, -0.1)))).toBeLessThan(1e-8);
    expect(renderer.status.residentTiles).toBe(count);
    renderer.dispose();
  });

  it("reduces Auto budgets under load but preserves the ground-depth floor and explicit choices", async () => {
    const renderer = new PlanetTerrainRenderer(testTerrainProvider(), "auto");
    expect(renderer.status.tileBudget).toBe(120);
    renderer.adapt(45);
    expect(renderer.status.tileBudget).toBe(120);
    renderer.adapt(20);
    expect(renderer.status.tileBudget).toBe(72);
    renderer.adapt(60);
    expect(renderer.status.tileBudget).toBe(72);
    renderer.setQuality("auto");
    expect(renderer.status.tileBudget).toBe(120);
    renderer.setQuality("high");
    renderer.adapt(10);
    expect(renderer.status.tileBudget).toBe(192);
    renderer.dispose();
  });

  it("casts shadows from observed surface triangles and restores skirts for the color pass", async () => {
    const renderer = new PlanetTerrainRenderer(testTerrainProvider(), "low");
    await renderer.prepare();
    const mesh = renderer.group.children.find((child): child is Mesh => child instanceof Mesh)!;
    const fullIndexCount = mesh.geometry.index!.count;
    const surfaceIndexCount = 16 * 16 * 6;
    expect(fullIndexCount).toBeGreaterThan(surfaceIndexCount);
    expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    const beforeShadow = mesh.onBeforeShadow as () => void;
    const afterShadow = mesh.onAfterShadow as () => void;
    for (let light = 0; light < 2; light++) {
      beforeShadow();
      expect(mesh.geometry.drawRange).toEqual({ start: 0, count: surfaceIndexCount });
      for (let index = 0; index < surfaceIndexCount; index++)
        expect(mesh.geometry.index!.getX(index)).toBeLessThan(17 ** 2);
      afterShadow();
      expect(mesh.geometry.drawRange).toEqual({ start: 0, count: Infinity });
    }
    mesh.geometry.setDrawRange(3, fullIndexCount - 3);
    beforeShadow(); afterShadow();
    expect(mesh.geometry.drawRange).toEqual({ start: 3, count: fullIndexCount - 3 });
    renderer.dispose();
  });
});
