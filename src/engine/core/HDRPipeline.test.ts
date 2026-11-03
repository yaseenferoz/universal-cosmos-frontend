import { afterEach, describe, expect, it, vi } from "vitest";
import { HalfFloatType, LinearSRGBColorSpace, Vector2, WebGLRenderTarget, type WebGLRenderer } from "three";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { boundedRenderPixelRatio, HDRPipeline, hdrPixelBudget } from "./HDRPipeline";

function rendererFixture(supported = true, complete = true) {
  let target: WebGLRenderTarget | null = null;
  const dimensions = new Vector2(800, 600);
  const renderer = {
    extensions: { has: () => supported }, capabilities: { maxSamples: 4 },
    getDrawingBufferSize: (result: Vector2) => result.copy(dimensions),
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: WebGLRenderTarget | null) => { target = value; }),
    getContext: () => ({ FRAMEBUFFER: 1, FRAMEBUFFER_COMPLETE: 2, checkFramebufferStatus: () => complete ? 2 : 0 }),
    clear: vi.fn(), clearDepth: vi.fn(),
  };
  return { renderer: renderer as unknown as WebGLRenderer, dimensions, clear: renderer.clear };
}

afterEach(() => vi.restoreAllMocks());

describe("single-output linear HDR pipeline", () => {
  it("composes distant and local passes in one half-float target before one output transform", () => {
    const output = vi.spyOn(OutputPass.prototype, "render").mockImplementation((renderer) => { renderer.setRenderTarget(null); });
    const { renderer, clear } = rendererFixture();
    const pipeline = new HDRPipeline(renderer, "medium");
    pipeline.beginFrame();
    const distantTarget = renderer.getRenderTarget()!;
    renderer.clearDepth(); // The lunar overlay resets only depth in the current target.
    const localTarget = renderer.getRenderTarget();
    expect(localTarget).toBe(distantTarget);
    expect(distantTarget.texture.type).toBe(HalfFloatType);
    expect(distantTarget.texture.colorSpace).toBe(LinearSRGBColorSpace);
    expect(distantTarget.samples).toBe(2);
    expect(clear).toHaveBeenCalledWith(true, true, false);
    pipeline.endFrame();
    expect(output).toHaveBeenCalledOnce();
    expect(output.mock.calls[0][2]).toBe(distantTarget);
    expect(renderer.getRenderTarget()).toBeNull();
    pipeline.dispose();
  });

  it("restores an existing destination even if final output fails", () => {
    vi.spyOn(OutputPass.prototype, "render").mockImplementation(() => { throw new Error("Output failure"); });
    const { renderer } = rendererFixture();
    const destination = new WebGLRenderTarget(2, 2);
    renderer.setRenderTarget(destination);
    const pipeline = new HDRPipeline(renderer);
    pipeline.beginFrame();
    expect(() => pipeline.endFrame()).toThrow("Output failure");
    expect(renderer.getRenderTarget()).toBe(destination);
    pipeline.dispose(); destination.dispose();
  });

  it("degrades to direct rendering when float targets are unsupported or incomplete", () => {
    for (const [supported, complete] of [[false, false], [true, false]]) {
      const { renderer } = rendererFixture(supported, complete);
      const pipeline = new HDRPipeline(renderer);
      pipeline.beginFrame(); pipeline.endFrame();
      expect(pipeline.enabled).toBe(false);
      expect(pipeline.status).toContain("Direct output");
      expect(renderer.getRenderTarget()).toBeNull();
      pipeline.dispose();
    }
  });

  it("resizes to the actual drawing buffer, reduces multisampling and disposes once per allocation", () => {
    vi.spyOn(OutputPass.prototype, "render").mockImplementation(() => undefined);
    const outputDispose = vi.spyOn(OutputPass.prototype, "dispose");
    const { renderer, dimensions } = rendererFixture();
    const pipeline = new HDRPipeline(renderer, "high");
    pipeline.beginFrame();
    const target = renderer.getRenderTarget()!;
    pipeline.endFrame();
    const dispose = vi.spyOn(target, "dispose");
    pipeline.resize();
    expect(dispose).not.toHaveBeenCalled();
    dimensions.set(640, 360);
    pipeline.resize();
    expect([target.width, target.height]).toEqual([640, 360]);
    expect(dispose).toHaveBeenCalledTimes(1);
    pipeline.setQuality("low");
    expect(target.samples).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(2);
    pipeline.dispose(); pipeline.dispose();
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(outputDispose).toHaveBeenCalledOnce();
  });

  it("caps total framebuffer pixels and dimensions without mismatching render resolution", () => {
    for (const quality of ["low", "medium", "high", "auto"] as const) {
      const ratio = boundedRenderPixelRatio(quality, 3, true, 3840, 2160);
      expect(3840 * ratio * 2160 * ratio).toBeLessThanOrEqual(hdrPixelBudget(quality, true) + 0.01);
      expect(ratio).toBeLessThanOrEqual(2);
    }
    expect(boundedRenderPixelRatio("high", 2, false, 10_000, 100, Infinity, 2048) * 10_000).toBeLessThanOrEqual(2048);
    expect(boundedRenderPixelRatio("high", 2, false, 800, 600, 0.75)).toBe(0.75);
  });
});
