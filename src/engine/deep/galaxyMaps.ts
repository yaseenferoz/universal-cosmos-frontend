import {
  LinearFilter, LinearMipmapLinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial,
  UnsignedByteType, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from "three";
import { GALAXY_FLAGS } from "../../data/deep/galaxies";
import { MILKY_WAY, SPIRAL_ARMS } from "../../data/deep/milkyWay";

/**
 * Face-on maps used to shade galaxies: R = young stars (arms, clusters), G = old stars (disk,
 * bar), B = dust, A = HII regions. One atlas of illustrative archetypes for other galaxies,
 * chosen from each galaxy's measured Hubble type, and one map of the Milky Way following the
 * Reid et al. 2019 arm fits (measured stretches drawn at full strength, extrapolations
 * fainter) with the bar of Bland-Hawthorn & Gerhard 2016. Generated once on the GPU.
 */
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 2;
export const MILKY_WAY_CELL = 8;
/** Cells: Sa, Sb, Sc, SBa, SBb, SBc, irregular/Magellanic, S0; −1 = spheroid (analytic, no map). */
export const ARCHETYPE = { Sa: 0, Sb: 1, Sc: 2, SBa: 3, SBb: 4, SBc: 5, Irregular: 6, S0: 7, Spheroid: -1 } as const;

/** Map cell for a galaxy's T-type and bar flag. */
export function galaxyArchetype(tType: number, flags: number, flattening: number): number {
  const barred = (flags & GALAXY_FLAGS.barMask) === 2;
  if (!Number.isFinite(tType)) return flattening < 0.3 ? ARCHETYPE.Sb : ARCHETYPE.Spheroid;
  if (tType <= -4) return ARCHETYPE.Spheroid;
  if (tType <= 0) return ARCHETYPE.S0;
  if (tType >= 9) return ARCHETYPE.Irregular;
  if (tType <= 2) return barred ? ARCHETYPE.SBa : ARCHETYPE.Sa;
  if (tType <= 4) return barred ? ARCHETYPE.SBb : ARCHETYPE.Sb;
  return barred ? ARCHETYPE.SBc : ARCHETYPE.Sc;
}

// Per cell: (arm count, pitch deg, bar half-length, arm contrast), (arm start, clumpiness, dust, seed).
const CELL_A = [
  [2, 8, 0, 0.35], [2, 13, 0, 0.6], [2, 21, 0, 0.75], [2, 9, 0.32, 0.45],
  [2, 13, 0.28, 0.65], [2, 18, 0.22, 0.75], [0, 0, 0, 0], [0, 0, 0.18, 0],
];
const CELL_B = [
  [0.2, 0.3, 0.6, 1.3], [0.13, 0.55, 0.85, 2.7], [0.08, 0.85, 0.7, 4.1], [0.32, 0.35, 0.65, 5.9],
  [0.28, 0.55, 0.85, 7.3], [0.22, 0.8, 0.75, 8.6], [0, 1, 0.3, 9.9], [0, 0, 0.12, 11.2],
];

const NOISE = `
  float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.1, 9.2); a *= 0.5; }
    return v;
  }`;

const VERTEX = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ATLAS_FRAGMENT = `
  uniform vec4 cellA[8];
  uniform vec4 cellB[8];
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 grid = vec2(${ATLAS_COLUMNS}.0, ${ATLAS_ROWS}.0);
    vec2 cellXY = floor(vUv * grid);
    int cell = int(cellXY.x + cellXY.y * grid.x);
    // A little margin so mipmaps do not bleed between cells.
    vec2 p = (fract(vUv * grid) * 2.0 - 1.0) * 1.06;
    vec4 a = cellA[cell], b = cellB[cell];
    float seed = b.w;
    float r = length(p), phi = atan(p.y, p.x);
    float edge = 1.0 - smoothstep(0.82, 1.0, r);
    float disk = exp(-r / 0.22) * edge;
    float bar = 0.0;
    if (a.z > 0.0) {
      vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * p;
      bar = exp(-pow(abs(q.x) / a.z, 3.0) - pow(abs(q.y) / (a.z * 0.3), 2.0)) * 0.9;
    }
    float young = 0.0, dust = 0.0, hii = 0.0, old = disk;
    if (a.x > 0.0) {
      float warp = (fbm(p * 2.5 + seed) - 0.5) * (0.8 + 1.4 * b.y);
      float phase = a.x * (phi - log(max(r, 0.02)) / tan(radians(a.y))) + warp;
      float wave = 0.5 + 0.5 * cos(phase);
      float arms = pow(wave, mix(1.0, 4.0, a.w));
      float region = smoothstep(b.x * 0.8, b.x + 0.12, r) * (1.0 - smoothstep(0.62, 0.95, r));
      old = disk * (1.0 - 0.3 * a.w + 0.6 * a.w * arms * region);
      float flocculent = fbm(p * 9.0 + seed * 3.0);
      young = exp(-r / 0.34) * region * (arms * a.w * (0.35 + 0.9 * flocculent) + 0.25 * b.y * smoothstep(0.55, 0.8, flocculent));
      float lane = pow(0.5 + 0.5 * cos(phase + 0.75), 3.0);
      dust = exp(-r / 0.32) * region * lane * (0.35 + 1.1 * fbm(p * 15.0 + 7.0)) * b.z;
      hii = smoothstep(0.68, 0.82, fbm(p * 26.0 + seed * 5.0)) * arms * region * b.y;
    } else if (b.y > 0.5) {
      // Irregular: lumpy, off-centre star formation, little dust.
      vec2 c = p + vec2(0.12, -0.06);
      float lumps = fbm(c * 3.5 + seed);
      old = exp(-length(c * vec2(1.0, 1.5)) / 0.3) * (0.5 + 0.9 * lumps) * edge;
      young = old * smoothstep(0.45, 0.75, fbm(c * 7.0 + seed * 2.0)) * 1.5;
      hii = smoothstep(0.62, 0.8, fbm(c * 16.0 + seed * 4.0)) * old * 2.0;
      dust = old * fbm(c * 10.0) * b.z;
    } else {
      // S0: smooth disk with a faint lens and a weak dust ring.
      old = disk + exp(-pow(r / 0.3, 4.0)) * 0.25;
      dust = exp(-pow((r - 0.28) / 0.05, 2.0)) * b.z * (0.5 + fbm(p * 12.0));
    }
    gl_FragColor = clamp(vec4(young, old + bar, dust, hii), 0.0, 1.0);
  }`;

const ARMS = SPIRAL_ARMS.length;
const MILKY_WAY_FRAGMENT = `
  uniform vec4 armA[${ARMS}];   // beta kink (deg), R kink (kpc), tan pitch below, tan pitch above
  uniform vec4 armB[${ARMS}];   // measured beta from, to (deg), width at kink (kpc), weight in old stars
  uniform float radiusKpc, barHalfLength, barAngle;
  varying vec2 vUv;
  ${NOISE}
  const float DEG = 0.017453292519943295;
  float armSum(vec2 p, float R, float betaDeg, float offset, out float oldSum) {
    float sum = 0.0;
    oldSum = 0.0;
    for (int i = 0; i < ${ARMS}; i++) {
      vec4 a = armA[i], b = armB[i];
      // Drawn somewhat beyond the measured stretch, fading: the far side is extrapolated.
      for (int k = -1; k <= 1; k++) {
        float beta = betaDeg + 360.0 * float(k);
        float from = b.x - 70.0, to = b.y + 150.0;
        if (beta < from || beta > to) continue;
        float t = beta < a.x ? a.z : a.w;
        float Ra = a.y * exp(-(beta - a.x) * DEG * t);
        // Fade in and out over 40 degrees and toward the bar and the disk edge.
        float taper = smoothstep(from, from + 40.0, beta) * (1.0 - smoothstep(to - 40.0, to, beta))
          * smoothstep(2.6, 3.8, Ra) * (1.0 - smoothstep(15.0, 18.0, Ra));
        if (taper <= 0.0) continue;
        float w = max(0.12, b.z + 0.042 * (R - a.y)) * 1.8;
        float g = exp(-0.5 * pow((R - Ra + offset * w) / w, 2.0)) * taper;
        float measured = 1.0 - 0.45 * max(smoothstep(b.y, b.y + 60.0, beta), 1.0 - smoothstep(b.x - 40.0, b.x, beta));
        sum += g * measured;
        oldSum += g * measured * b.w;
      }
    }
    return sum;
  }
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * radiusKpc;   // kpc; x toward the Sun, y toward beta = 90 deg
    float R = length(p);
    float betaDeg = atan(p.y, p.x) / DEG;
    float edge = 1.0 - smoothstep(13.0, 19.0, R);
    float disk = exp(-R / 2.6) * edge;
    vec2 q = mat2(cos(barAngle), -sin(barAngle), sin(barAngle), cos(barAngle)) * p;
    float bar = exp(-pow(abs(q.x) / (barHalfLength * 0.8), 3.0) - pow(abs(q.y) / 1.3, 2.0)) * smoothstep(0.0, 0.5, R + 0.3);
    float oldArms;
    float arms = armSum(p, R, betaDeg, 0.0, oldArms);
    float dustOld;
    float lanes = armSum(p, R, betaDeg, 0.55, dustOld);
    float clumps = fbm(p * 1.6 + 3.0);
    float young = exp(-R / 5.0) * edge * min(arms, 1.5) * (0.45 + 0.9 * clumps) * 1.1;
    float old = disk * (0.7 + 0.7 * oldArms) + bar * 0.8;
    float barLanes = exp(-pow((abs(q.y) - 0.45) / 0.25, 2.0) - pow(abs(q.x) / 4.0, 4.0)) * smoothstep(0.3, 1.2, abs(q.x));
    float dust = (exp(-R / 5.0) * edge * lanes * (0.35 + 1.2 * fbm(p * 2.8 + 11.0)) + barLanes * 0.45) * 0.9;
    float hii = smoothstep(0.7, 0.84, fbm(p * 5.0 + 21.0)) * min(arms, 1.0) * edge * 0.8;
    gl_FragColor = clamp(vec4(young, old, dust, hii), 0.0, 1.0);
  }`;

function target(width: number, height: number): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, {
    format: RGBAFormat, type: UnsignedByteType, generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, depthBuffer: false,
  });
}

export class GalaxyMaps {
  private readonly atlasTarget: WebGLRenderTarget;
  private readonly milkyWayTarget: WebGLRenderTarget;

  constructor(renderer: WebGLRenderer, compact: boolean) {
    const cell = compact ? 256 : 512;
    this.atlasTarget = target(cell * ATLAS_COLUMNS, cell * ATLAS_ROWS);
    this.milkyWayTarget = target(compact ? 1024 : 2048, compact ? 1024 : 2048);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new Mesh(new PlaneGeometry(2, 2));
    const scene = new Scene();
    scene.add(quad);
    const atlas = new ShaderMaterial({
      uniforms: { cellA: { value: CELL_A.flat() }, cellB: { value: CELL_B.flat() } },
      vertexShader: VERTEX, fragmentShader: ATLAS_FRAGMENT, depthTest: false, depthWrite: false,
    });
    const milkyWay = new ShaderMaterial({
      uniforms: {
        armA: { value: SPIRAL_ARMS.flatMap((arm) => [arm.betaKinkDeg, arm.rKinkPc / 1000, Math.tan((arm.pitchBelowDeg * Math.PI) / 180), Math.tan((arm.pitchAboveDeg * Math.PI) / 180)]) },
        // The two major stellar arms (Scutum–Centaurus, Perseus) also stand out in old stars (GLIMPSE counts).
        armB: { value: SPIRAL_ARMS.flatMap((arm) => [arm.measured[0], arm.measured[1], arm.widthPc / 1000, /Scutum|Perseus/.test(arm.name) ? 0.8 : 0.25]) },
        radiusKpc: { value: MILKY_WAY.displayRadiusPc / 1000 },
        barHalfLength: { value: MILKY_WAY.bar.halfLengthPc / 1000 },
        barAngle: { value: (MILKY_WAY.bar.angleDeg * Math.PI) / 180 },
      },
      vertexShader: VERTEX, fragmentShader: MILKY_WAY_FRAGMENT, depthTest: false, depthWrite: false,
    });
    const previous = renderer.getRenderTarget();
    try {
      quad.material = atlas;
      renderer.setRenderTarget(this.atlasTarget);
      renderer.render(scene, camera);
      quad.material = milkyWay;
      renderer.setRenderTarget(this.milkyWayTarget);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(previous);
      quad.geometry.dispose();
      atlas.dispose();
      milkyWay.dispose();
    }
    this.atlasTarget.texture.anisotropy = 4;
    this.milkyWayTarget.texture.anisotropy = 4;
  }

  get atlas(): Texture {
    return this.atlasTarget.texture;
  }

  get milkyWay(): Texture {
    return this.milkyWayTarget.texture;
  }

  dispose(): void {
    this.atlasTarget.dispose();
    this.milkyWayTarget.dispose();
  }
}
