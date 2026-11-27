import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3, type Data3DTexture } from "three";
import type { NebulaCatalog } from "../../data/deep/nebulae";
import { NEBULA_SURFACE_BRIGHTNESS } from "./deepPhotometry";
import { MAX_DETAILED } from "./GalaxyField";
import { NEBULA_COMMON, nebulaShaderKind } from "./nebulaShaders";

/** Repeatable offset into the noise volume per nebula. */
export function nebulaSeed(index: number): [number, number, number] {
  const f = (k: number) => {
    const x = Math.sin(index * 91.17 + k * 47.3) * 24634.6345;
    return x - Math.floor(x);
  };
  return [f(1), f(2), f(3)];
}

/** Every nebula as a sprite with its catalogued outline; large ones hand over to volumes. */
export class NebulaField {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly positions: Float32Array;

  constructor(private readonly catalog: NebulaCatalog, noise: Data3DTexture) {
    const count = catalog.nebulae.length;
    this.positions = new Float32Array(count * 3);
    const radius = new Float32Array(count), axis = new Float32Array(count * 3), ratio = new Float32Array(count);
    const kind = new Float32Array(count), brightness = new Float32Array(count), seed = new Float32Array(count * 3), index = new Float32Array(count);
    catalog.nebulae.forEach((nebula, i) => {
      radius[i] = nebula.radiusPc;
      axis.set(nebula.majorAxis, i * 3);
      ratio[i] = nebula.axisRatio;
      kind[i] = nebulaShaderKind(nebula.kind, nebula.filled);
      brightness[i] = NEBULA_SURFACE_BRIGHTNESS[nebula.kind];
      seed.set(nebulaSeed(i), i * 3);
      index[i] = i;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("radiusPc", new BufferAttribute(radius, 1));
    geometry.setAttribute("majorAxis", new BufferAttribute(axis, 3));
    geometry.setAttribute("axisRatio", new BufferAttribute(ratio, 1));
    geometry.setAttribute("kind", new BufferAttribute(kind, 1));
    geometry.setAttribute("brightness", new BufferAttribute(brightness, 1));
    geometry.setAttribute("seed", new BufferAttribute(seed, 3));
    geometry.setAttribute("nebulaIndex", new BufferAttribute(index, 1));
    const material = new ShaderMaterial({
      uniforms: {
        noiseVolume: { value: noise }, focalPx: { value: 1000 }, pixelRatio: { value: 1 }, maxSizePx: { value: 256 },
        visibility: { value: 1 }, highlight: { value: -1 },
        detailIndex: { value: new Array<number>(MAX_DETAILED).fill(-1) }, detailFade: { value: new Array<number>(MAX_DETAILED).fill(0) },
      },
      vertexShader: /* glsl */ `
        attribute float radiusPc, axisRatio, kind, brightness, nebulaIndex;
        attribute vec3 majorAxis, seed;
        uniform float focalPx, pixelRatio, maxSizePx, visibility, highlight;
        uniform float detailIndex[${MAX_DETAILED}];
        uniform float detailFade[${MAX_DETAILED}];
        varying vec2 vMajor;
        varying vec3 vSeed;
        varying float vSizePx, vRho, vRatio, vKind, vBrightness, vHighlight;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          float d = length(view.xyz);
          float fade = visibility;
          for (int i = 0; i < ${MAX_DETAILED}; i++) if (abs(detailIndex[i] - nebulaIndex) < 0.5) fade *= 1.0 - detailFade[i];
          float rho = radiusPc / d * focalPx;
          vHighlight = abs(nebulaIndex - highlight) < 0.5 ? 1.0 : 0.0;
          // Below a pixel the light fades with the shrinking area (surface brightness × area).
          vBrightness = brightness * fade * min(1.0, rho * rho / 2.25) * (1.0 - smoothstep(0.8, 1.0, 2.0 * rho / maxSizePx));
          if ((view.z > -radiusPc * 0.2 || vBrightness < 0.002 || (kind > 3.5 && kind < 4.5)) && vHighlight < 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;
          }
          vec3 major = mat3(modelViewMatrix) * majorAxis;
          vec2 m = major.xy + view.xy * (major.z / -view.z);
          vMajor = dot(m, m) > 1e-12 ? normalize(m) : vec2(1.0, 0.0);
          vRho = max(rho, 1.5);
          vRatio = axisRatio;
          vKind = kind;
          vSeed = seed;
          vSizePx = min(2.0 * vRho + 2.0, maxSizePx);
          if (vHighlight > 0.5) vSizePx = max(vSizePx, 14.0);
          gl_PointSize = vSizePx * pixelRatio;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        ${NEBULA_COMMON}
        varying vec2 vMajor;
        varying vec3 vSeed;
        varying float vSizePx, vRho, vRatio, vKind, vBrightness, vHighlight;
        void main() {
          vec2 off = (gl_PointCoord - 0.5) * vSizePx;
          off.y = -off.y;
          vec2 p = vec2(dot(off, vMajor), dot(off, vec2(-vMajor.y, vMajor.x)) / vRatio) / vRho;
          vec3 color = nebulaSprite(vKind, p, vSeed) * vBrightness;
          if (vHighlight > 0.5 && vRho < 40.0) color += vec3(0.45, 0.75, 1.0) * smoothstep(1.5, 0.0, abs(length(off) - (vSizePx * 0.5 - 2.0))) * 0.5;
          if (max(color.r, max(color.g, color.b)) < 0.0015) discard;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      blending: AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -940;
    this.rebase(new Vector3());
  }

  rebase(origin: Vector3): void {
    this.catalog.nebulae.forEach((nebula, i) => {
      this.positions[i * 3] = nebula.position[0] - origin.x;
      this.positions[i * 3 + 1] = nebula.position[1] - origin.y;
      this.positions[i * 3 + 2] = nebula.position[2] - origin.z;
    });
    this.points.geometry.getAttribute("position").needsUpdate = true;
  }

  setView(focalPx: number, pixelRatio: number, maxSizePx: number): void {
    const u = this.points.material.uniforms;
    u.focalPx.value = focalPx;
    u.pixelRatio.value = pixelRatio;
    u.maxSizePx.value = maxSizePx;
  }

  setVisibility(visibility: number): void {
    this.points.material.uniforms.visibility.value = visibility;
  }

  setHighlight(index: number | null): void {
    this.points.material.uniforms.highlight.value = index ?? -1;
  }

  setDetailed(entries: { index: number; fade: number }[]): void {
    const u = this.points.material.uniforms;
    const indices = u.detailIndex.value as number[], fades = u.detailFade.value as number[];
    for (let i = 0; i < MAX_DETAILED; i++) {
      indices[i] = entries[i]?.index ?? -1;
      fades[i] = entries[i]?.fade ?? 0;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
