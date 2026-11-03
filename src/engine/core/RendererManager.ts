import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { Quality } from "../../types/celestial";
import { qualityConfig } from "./quality";
import { boundedRenderPixelRatio, HDRPipeline } from "./HDRPipeline";

export class RendererManager {
  readonly renderer: WebGLRenderer;
  private quality: Quality = "auto";
  private pixelRatio = 1;
  private adaptiveLimit = Infinity;
  private width = 1;
  private height = 1;
  private readonly pipeline: HDRPipeline;
  readonly mobile = matchMedia("(pointer: coarse)").matches;
  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "default",
    });
    this.renderer.setClearColor(0x000000);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.pipeline = new HDRPipeline(this.renderer, this.quality, this.mobile);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D Solar System. Drag to orbit, pinch or scroll to zoom, and select a labeled object.",
    );
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);
    this.setQuality("auto");
  }
  setQuality(quality: Quality): void {
    this.quality = quality;
    this.adaptiveLimit = Infinity;
    this.pipeline.setQuality(quality, this.mobile);
    const config = qualityConfig(quality, window.devicePixelRatio, this.mobile);
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = config.shadowMapSize > 0;
  }
  adapt(fps: number): void {
    if (this.quality !== "auto" || fps >= 28 || this.pixelRatio <= 0.5) return;
    this.adaptiveLimit = Math.max(0.5, this.pixelRatio - 0.15);
    this.applyPixelRatio();
  }
  get qualityLabel(): string {
    return `${this.quality} · ${this.pixelRatio.toFixed(2)}× · ${this.pipeline.enabled ? "HDR" : "direct"}`;
  }
  get pipelineStatus(): string { return this.pipeline.status; }
  get hdrEnabled(): boolean { return this.pipeline.enabled; }
  beginFrame(): void { this.pipeline.beginFrame(); }
  endFrame(): void { this.pipeline.endFrame(); }
  private applyPixelRatio(): void {
    this.pixelRatio = boundedRenderPixelRatio(
      this.quality, window.devicePixelRatio, this.mobile, this.width, this.height,
      this.adaptiveLimit, this.renderer.capabilities.maxTextureSize,
    );
    this.renderer.setPixelRatio(this.pixelRatio);
    this.pipeline.resize();
  }
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applyPixelRatio();
    this.renderer.setSize(width, height, false);
    this.pipeline.resize();
  }
  dispose(): void {
    this.pipeline.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
