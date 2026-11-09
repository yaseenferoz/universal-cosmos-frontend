import { describe, expect, it, vi } from "vitest";
import { Matrix4, Vector3 } from "three";
import { geodeticToCartesian } from "./coordinates";
import { SurfaceScatter } from "./SurfaceScatter";
import { testTerrainProvider } from "./terrainTestProvider";

describe("surface stones", () => {
  it("places bounded, deterministic stones on the sampled terrain and rebases as the observer moves", () => {
    const provider = testTerrainProvider();
    const observer = geodeticToCartesian(20.1908, 30.7717, 121.7, provider.manifest.radiusM);
    const scatter = new SurfaceScatter(provider, "high", false);
    scatter.update(observer, 1.7);
    expect(scatter.group.visible).toBe(true);
    expect(scatter.rocks.count).toBe(320);
    const first = new Matrix4();
    scatter.rocks.getMatrixAt(0, first);
    const position = new Vector3().setFromMatrixPosition(first).add(scatter.group.position).add(observer);
    expect(position.length() - provider.manifest.radiusM).toBeGreaterThanOrEqual(120);
    expect(position.distanceTo(observer)).toBeLessThan(70);

    const sameSite = new SurfaceScatter(provider, "high", false);
    sameSite.update(observer, 1.7);
    const matching = new Matrix4();
    sameSite.rocks.getMatrixAt(0, matching);
    expect(matching.elements).toEqual(first.elements);
    const original = scatter.rocks.instanceMatrix.version;
    scatter.update(observer.clone().add(new Vector3(0.5, 0, 0)), 1.7);
    expect(scatter.rocks.instanceMatrix.version).toBe(original);
    scatter.update(observer.clone().add(new Vector3(50, 0, 0)), 1.7);
    expect(scatter.rocks.instanceMatrix.version).toBeGreaterThan(original);
    scatter.setQuality("high", true);
    expect(scatter.rocks.count).toBe(90);
    scatter.update(observer, 300);
    expect(scatter.group.visible).toBe(false);
    scatter.dispose();
    sameSite.dispose();
  });

  it("releases its geometry and material once", () => {
    const scatter = new SurfaceScatter(testTerrainProvider(), "low", false);
    const geometry = vi.spyOn(scatter.rocks.geometry, "dispose");
    const material = vi.spyOn(scatter.rocks.material, "dispose");
    scatter.dispose();
    scatter.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
  });
});
