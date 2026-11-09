import {
  BackSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import type { Quality } from "../../types/celestial";
import { skyExposureCompensation } from "./skyExposure";

const SKY_TEXTURES = {
  compact: "/textures/deep-sky-2048.webp?v=2020ha2",
  desktop: "/textures/deep-sky-4096.webp?v=2020ha2",
} as const;

/** NASA SVS J2000 Milky Way and enhanced measured H-alpha; body axes remain illustrative. */
export class DeepSky {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private texture: Texture | null = null;
  private requestedUrl = "";
  private generation = 0;
  private disposed = false;

  constructor() {
    const material = new ShaderMaterial({
      uniforms: {
        skyMap: { value: null as Texture | null },
        visibility: { value: 0 },
        exposureCompensation: { value: 1 },
      },
      vertexShader: `varying vec2 skyUv;
        void main() {
          skyUv = uv;
          vec4 projected = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = projected.xyww;
        }`,
      fragmentShader: `uniform sampler2D skyMap;
        uniform float visibility;
        uniform float exposureCompensation;
        varying vec2 skyUv;
        void main() {
          // Diffuse Milky Way and dust lanes; bright stars use a separate point layer.
          vec3 diffuse = texture2D(skyMap, skyUv).rgb;
          // Keep the large-scale cloud structure below the crisp point stars.
          diffuse = diffuse / (vec3(1.0) + diffuse * 2.0);
          gl_FragColor = vec4(diffuse * visibility * exposureCompensation * 0.85, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 32, 16), material);
    this.mesh.renderOrder = -2000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  get ready(): boolean {
    return this.texture !== null;
  }

  setQuality(quality: Quality, mobile: boolean): void {
    if (this.disposed) return;
    const url = mobile || quality === "low" ? SKY_TEXTURES.compact : SKY_TEXTURES.desktop;
    if (url === this.requestedUrl) return;
    this.requestedUrl = url;
    const generation = ++this.generation;
    void new TextureLoader().loadAsync(url).then((texture) => {
      if (this.disposed || generation !== this.generation) {
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = quality === "high" ? 4 : 2;
      this.texture?.dispose();
      this.texture = texture;
      this.mesh.material.uniforms.skyMap.value = texture;
    }).catch(() => {
      // Keep the fallback star points without retrying the same URL every frame.
    });
  }

  update(cameraPosition: Vector3, visibility: number, exposure = 1, adaptation = 1): void {
    this.mesh.position.copy(cameraPosition);
    this.mesh.material.uniforms.visibility.value = Math.max(0, Math.min(1, visibility));
    this.mesh.material.uniforms.exposureCompensation.value = skyExposureCompensation(exposure) * Math.max(1, Math.min(3, adaptation));
    this.mesh.visible = this.ready;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.texture?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
