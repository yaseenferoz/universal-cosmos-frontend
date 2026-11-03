import { HalfFloatType, LinearFilter, LinearSRGBColorSpace, Vector2, WebGLRenderTarget, type WebGLRenderer } from "three";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { Quality } from "../../types/celestial";
import { qualityConfig } from "./quality";

/** One RGBA16F color target plus depth; no pyramid or full-resolution ping-pong buffers. */
export function hdrPixelBudget(quality: Quality, mobile = false): number {
  const resolved = quality === "auto" ? mobile ? "low" : "medium" : quality;
  return { low: 750_000, medium: 1_800_000, high: 3_000_000 }[resolved];
}

export function boundedRenderPixelRatio(
  quality: Quality, devicePixelRatio: number, mobile: boolean,
  width: number, height: number, adaptiveLimit = Infinity, maxTextureSize = 8192,
): number {
  const w = Math.max(1, width), h = Math.max(1, height);
  return Math.min(
    qualityConfig(quality, devicePixelRatio, mobile).pixelRatio,
    Math.sqrt(hdrPixelBudget(quality, mobile) / (w * h)),
    maxTextureSize / Math.max(w, h), adaptiveLimit,
  );
}

/**
 * Both world and meter-scale lunar scenes render into the same linear target.
 * Three skips material tone mapping for offscreen targets; OutputPass applies
 * the renderer's ACES/exposure and sRGB transfer exactly once after composition.
 */
export class HDRPipeline {
  private target: WebGLRenderTarget | null = null;
  private output: OutputPass | null = null;
  private previousTarget: WebGLRenderTarget | null = null;
  private activeFrame = false;
  private needsValidation = true;
  private disposed = false;
  private reason = "";
  private readonly size = new Vector2();

  constructor(private readonly renderer: WebGLRenderer, quality: Quality = "auto", mobile = false) {
    if (!renderer.extensions.has("EXT_color_buffer_float") && !renderer.extensions.has("EXT_color_buffer_half_float")) {
      this.reason = "floating-point color buffers unavailable";
      return;
    }
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType, colorSpace: LinearSRGBColorSpace,
      minFilter: LinearFilter, magFilter: LinearFilter,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    this.target.texture.name = "Linear HDR scene including lunar overlay";
    this.output = new OutputPass();
    this.output.renderToScreen = true;
    this.setQuality(quality, mobile);
  }

  get enabled(): boolean { return this.target !== null && !this.disposed; }
  get status(): string {
    return this.enabled ? "Linear HDR · one ACES/sRGB output" : `Direct output · ${this.reason || "disposed"}`;
  }

  setQuality(quality: Quality, mobile = false): void {
    if (!this.target || this.disposed) return;
    const resolved = quality === "auto" ? mobile ? "low" : "medium" : quality;
    const samples = resolved === "low" ? 0 : Math.min(2, this.renderer.capabilities.maxSamples);
    if (this.target.samples === samples) return;
    this.target.dispose();
    this.target.samples = samples;
    this.needsValidation = true;
  }

  resize(): void {
    if (!this.target || this.disposed) return;
    this.renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, Math.floor(this.size.x)), height = Math.max(1, Math.floor(this.size.y));
    if (this.target.width === width && this.target.height === height) return;
    this.target.setSize(width, height);
    this.needsValidation = true;
  }

  beginFrame(): void {
    if (this.activeFrame) throw new Error("HDR frame is already active.");
    if (!this.target || this.disposed) return;
    this.resize();
    this.previousTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(this.target);
      if (this.needsValidation) {
        const context = this.renderer.getContext();
        if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE)
          throw new Error("half-float framebuffer is incomplete");
        this.needsValidation = false;
      }
      this.renderer.clear(true, true, false);
      this.activeFrame = true;
    } catch (error) {
      this.renderer.setRenderTarget(this.previousTarget);
      this.reason = error instanceof Error ? error.message : "HDR framebuffer initialization failed";
      this.releaseTargets();
    }
  }

  endFrame(): void {
    if (!this.activeFrame || !this.target || !this.output) return;
    try {
      this.output.render(this.renderer, this.target, this.target, 0, false);
    } finally {
      this.renderer.setRenderTarget(this.previousTarget);
      this.activeFrame = false;
    }
  }

  private releaseTargets(): void {
    this.target?.dispose();
    this.output?.dispose();
    this.target = null;
    this.output = null;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.activeFrame) this.renderer.setRenderTarget(this.previousTarget);
    this.activeFrame = false;
    this.disposed = true;
    this.releaseTargets();
  }
}
