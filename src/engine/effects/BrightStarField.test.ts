import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { BrightStarField } from "./BrightStarField";

afterEach(() => vi.unstubAllGlobals());

describe("source-map bright stars", () => {
  it("loads bounded point data once and follows the landing camera", async () => {
    const records = new Float32Array([0, 0, 1, 1, 0.8, 0.6, 2]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(records.buffer));
    vi.stubGlobal("fetch", fetchMock);
    const field = new BrightStarField();
    field.load();
    field.load();
    await vi.waitFor(() => expect(field.ready).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
    field.update(new Vector3(5, 6, 7), 0.6, 1.5, 64);
    expect(field.points.position.toArray()).toEqual([5, 6, 7]);
    expect(field.points.geometry.getAttribute("position").array).toEqual(new Float32Array([0, 0, 700]));
    expect(field.points.geometry.drawRange.count).toBe(1);
    expect(field.points.material.depthTest).toBe(true);
    expect(field.points.material.uniforms.pixelRatio.value).toBe(1.5);
    expect(field.points.material.uniforms.exposureCompensation.value).toBeCloseTo(1 / 64);
    expect(field.points.visible).toBe(true);
    field.update(new Vector3(), 0.85, 1, 1, 2.2);
    expect(field.points.material.uniforms.exposureCompensation.value).toBeCloseTo(2.2);
    field.update(new Vector3(), 0, 1);
    expect(field.points.visible).toBe(false);
    field.dispose();
  });

  it("rejects malformed records without displaying invalid geometry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(3))));
    const field = new BrightStarField();
    field.load();
    await vi.waitFor(() => expect(field.ready).toBe(false));
    expect(field.points.geometry.drawRange.count).toBe(0);
    field.dispose();
  });
});
