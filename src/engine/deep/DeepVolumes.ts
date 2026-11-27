import {
  BackSide, BoxGeometry, CustomBlending, Group, Matrix3, Matrix4, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial,
  Vector3, type Data3DTexture, type PerspectiveCamera, type Texture,
} from "three";
import type { Quality } from "../../types/celestial";
import { NEBULA_SURFACE_BRIGHTNESS } from "./deepPhotometry";
import { GALAXY_COMMON } from "./galaxyShaders";
import { NEBULA_COMMON } from "./nebulaShaders";

// The box geometry spans ±1; object units are the galaxy radius (or the nebula outline).
const VERTEX = /* glsl */ `
  uniform vec3 boxHalf;
  varying vec3 vObj;
  void main() { vObj = position * boxHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RAY = /* glsl */ `
  uniform vec3 camObj, boxHalf;
  varying vec3 vObj;
  float gradientNoise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  /** Ray (object units) through the box: returns false when it misses. */
  bool boxSpan(out vec3 ro, out vec3 rd, out float tn, out float tf) {
    ro = camObj;
    rd = normalize(vObj - camObj);
    vec3 safe = sign(rd) * max(abs(rd), vec3(1e-7)) + step(vec3(0.0), -abs(rd)) * 1e-7;
    vec3 ta = (-boxHalf - ro) / safe, tb = (boxHalf - ro) / safe;
    vec3 lo = min(ta, tb), hi = max(ta, tb);
    tn = max(max(lo.x, lo.y), max(lo.z, 0.0));
    tf = min(min(hi.x, hi.y), hi.z);
    return tf > tn;
  }`;

/** Ray-marched disk galaxy (face-on map × exponential heights, analytic bulge) or spheroid. */
function galaxyMaterial(atlas: Texture, milkyWayMap: Texture, mapTexels: [number, number]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      atlas: { value: atlas }, milkyWayMap: { value: milkyWayMap }, mapTexels: { value: mapTexels },
      camObj: { value: new Vector3() }, boxHalf: { value: new Vector3(1, 0.2, 1) },
      cell: { value: 0 }, brightness: { value: 0 }, oldColor: { value: new Vector3(1, 0.85, 0.65) },
      heights: { value: [0.03, 0.09, 0.012, 0.01] }, thickFraction: { value: 0.25 },
      bulgeFraction: { value: 0.2 }, bulgeK: { value: 0 }, bulgeTruncation: { value: 7 }, bulgeMatrix: { value: new Matrix3() },
      steps: { value: 40 }, pixelAngle: { value: 0.001 }, dustScale: { value: 0.9 }, opacity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      ${GALAXY_COMMON}
      ${RAY}
      uniform vec3 oldColor;
      uniform float cell, brightness, thickFraction, bulgeFraction, bulgeK, bulgeTruncation, steps, pixelAngle, dustScale, opacity;
      uniform float heights[4];
      uniform mat3 bulgeMatrix;
      void main() {
        vec3 ro, rd;
        float tn, tf;
        if (!boxSpan(ro, rd, tn, tf)) discard;
        vec3 color = vec3(0.0), T = vec3(1.0);
        if (cell < -0.5) {
          // Elliptical: optically thin, one exact integral.
          color = oldColor * bulgeK * bulgeSegment(ro + rd * tn, ro + rd * tf, bulgeMatrix, bulgeTruncation);
        } else {
          float dt = (tf - tn) / steps;
          float jitter = gradientNoise(gl_FragCoord.xy);
          // Segment boundaries are dithered per pixel, so layering shows as fine noise, not bands.
          for (int i = 0; i <= 128; i++) {
            if (float(i) > steps) break;
            float t0 = max(tn, tn + dt * (float(i) - 1.0 + jitter)), t1 = min(tf, tn + dt * (float(i) + jitter));
            if (t1 <= t0) continue;
            vec3 a = ro + rd * t0, b = ro + rd * t1;
            // Sample the map where the segment meets the mid-plane, else near its lower end.
            vec3 s = a.y * b.y <= 0.0 ? mix(a, b, clamp(a.y / (a.y - b.y + 1e-12), 0.0, 1.0))
              : mix(a, b, abs(a.y) < abs(b.y) ? 0.3 * jitter : 1.0 - 0.3 * jitter);
            vec4 m = faceOn(cell, s.xz, 2.0 / max(t0 * pixelAngle, 1e-9));
            float len = t1 - t0;
            float thin = heightIntegral(a.y, b.y, len, heights[0]) / (2.0 * heights[0]);
            float thick = heightIntegral(a.y, b.y, len, heights[1]) / (2.0 * heights[1]);
            float young = heightIntegral(a.y, b.y, len, heights[2]) / (2.0 * heights[2]);
            float dust = heightIntegral(a.y, b.y, len, heights[3]) / (2.0 * heights[3]);
            vec3 emit = (m.g * oldColor * mix(thin, thick, thickFraction) + (m.r * YOUNG_COLOR * 0.9 + m.a * HII_COLOR * 0.5) * young)
              * (1.0 - bulgeFraction) / MAP_NORMALISATION;
            emit += BULGE_COLOR * bulgeK * bulgeSegment(a, b, bulgeMatrix, bulgeTruncation);
            vec3 tau = dustScale * m.b * dust * DUST_REDDENING;
            vec3 trans = exp(-tau);
            vec3 weight = mix(vec3(1.0), (1.0 - trans) / max(tau, vec3(1e-4)), step(vec3(1e-4), tau));
            color += T * emit * weight;
            T *= trans;
            if (max(T.r, max(T.g, T.b)) < 0.01) break;
          }
        }
        // Premultiplied: emitted light plus how much of the background the dust hides.
        gl_FragColor = vec4(color * brightness, (1.0 - (T.r + T.g + T.b) / 3.0) * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: BackSide, transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
  });
}

/** Ray-marched nebula: procedural interior inside the catalogued outline. */
function nebulaMaterial(noise: Data3DTexture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      noiseVolume: { value: noise }, camObj: { value: new Vector3() }, boxHalf: { value: new Vector3(1, 1, 1) },
      kind: { value: 0 }, seed: { value: new Vector3() }, brightness: { value: 0 }, steps: { value: 48 }, opacity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: /* glsl */ `
      ${NEBULA_COMMON}
      ${RAY}
      uniform float kind, brightness, steps, opacity;
      uniform vec3 seed;
      void main() {
        vec3 ro, rd;
        float tn, tf;
        if (!boxSpan(ro, rd, tn, tf)) discard;
        float dt = (tf - tn) / steps;
        float t = tn + dt * gradientNoise(gl_FragCoord.xy);
        vec3 color = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < 128; i++) {
          if (float(i) >= steps) break;
          vec4 s = nebulaAt(kind, ro + rd * t, seed);
          float tau = s.a * dt;
          float trans = exp(-tau);
          color += T * s.rgb * dt * (tau > 1e-4 ? (1.0 - trans) / tau : 1.0);
          T *= trans;
          t += dt;
          if (T < 0.01) break;
        }
        gl_FragColor = vec4(color * brightness * 0.5, (1.0 - T) * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: BackSide, transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
  });
}

/** What a volume shows; the layer fills these from the catalogue. */
export interface GalaxyVolumeSpec {
  key: number;
  /** Centre relative to the floating origin, parsecs. */
  center: Vector3;
  radiusPc: number;
  /** Object → system rotation: columns are the in-plane axis, the normal, and their cross product. */
  basis: Matrix4;
  cell: number;
  brightness: number;
  oldColor: [number, number, number];
  heights: [number, number, number, number];
  thickFraction: number;
  boxHalf: [number, number, number];
  bulgeFraction: number;
  bulgeK: number;
  bulgeTruncation: number;
  /** Object coordinates → bulge-scaled coordinates. */
  bulgeMatrix: Matrix3;
}

export interface NebulaVolumeSpec {
  key: number;
  center: Vector3;
  radiusPc: number;
  basis: Matrix4;
  /** Box half-extents in units of the radius (outline major, minor, depth). */
  scale: [number, number, number];
  kind: number;
  nebulaKind: keyof typeof NEBULA_SURFACE_BRIGHTNESS;
  seed: [number, number, number];
}

const STEPS: Record<Quality, [number, number]> = { low: [24, 32], medium: [36, 48], high: [52, 72], auto: [36, 48] };
const POOL: Record<Quality, [number, number]> = { low: [2, 1], medium: [4, 2], high: [6, 3], auto: [4, 2] };

/** A small pool of ray-marched volumes for the galaxies and nebulae that are large on screen. */
export class DeepVolumes {
  readonly group = new Group();
  private readonly box = new BoxGeometry(2, 2, 2);
  private readonly galaxies: Mesh<BoxGeometry, ShaderMaterial>[] = [];
  private readonly nebulae: Mesh<BoxGeometry, ShaderMaterial>[] = [];
  private galaxyKeys: number[] = [];
  private nebulaKeys: number[] = [];
  private quality: Quality = "auto";
  private readonly camLocal = new Vector3();
  private readonly inverse = new Matrix4();

  constructor(private readonly atlas: Texture, private readonly milkyWayMap: Texture, private readonly mapTexels: [number, number],
    private readonly noise: Data3DTexture) {
    this.group.name = "deep-sky-volumes";
  }

  get galaxyCapacity(): number {
    return POOL[this.quality][0];
  }

  get nebulaCapacity(): number {
    return POOL[this.quality][1];
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
  }

  private mesh(list: Mesh<BoxGeometry, ShaderMaterial>[], index: number, create: () => ShaderMaterial): Mesh<BoxGeometry, ShaderMaterial> {
    while (list.length <= index) {
      const mesh = new Mesh(this.box, create());
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      list.push(mesh);
    }
    return list[index];
  }

  /** Show these galaxies as volumes (`fade` 0–1), hiding unused meshes. */
  setGalaxies(specs: (GalaxyVolumeSpec & { fade: number })[], camera: PerspectiveCamera, focalPx: number): void {
    this.galaxyKeys = specs.map((s) => s.key);
    specs.forEach((spec, i) => {
      const mesh = this.mesh(this.galaxies, i, () => galaxyMaterial(this.atlas, this.milkyWayMap, this.mapTexels));
      const u = mesh.material.uniforms;
      mesh.matrix.copy(spec.basis).scale(new Vector3(spec.radiusPc * spec.boxHalf[0], spec.radiusPc * spec.boxHalf[1], spec.radiusPc * spec.boxHalf[2]));
      mesh.matrix.setPosition(spec.center);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.updateMatrixWorld(true);
      // Object units are galaxy radii; the box geometry spans ±1, scaled by boxHalf.
      this.inverse.copy(spec.basis).invert();
      this.camLocal.copy(camera.position).sub(spec.center).applyMatrix4(this.inverse).divideScalar(spec.radiusPc);
      u.camObj.value.copy(this.camLocal);
      u.boxHalf.value.set(...spec.boxHalf);
      u.cell.value = spec.cell;
      u.brightness.value = spec.brightness * spec.fade;
      u.opacity.value = spec.fade;
      u.oldColor.value.set(...spec.oldColor);
      u.heights.value = spec.heights;
      u.thickFraction.value = spec.thickFraction;
      u.bulgeFraction.value = spec.bulgeFraction;
      u.bulgeK.value = spec.bulgeK;
      u.bulgeTruncation.value = spec.bulgeTruncation;
      u.bulgeMatrix.value.copy(spec.bulgeMatrix);
      // From inside a disk the rays are long and grazing: more segments.
      const inside = Math.abs(this.camLocal.x) < spec.boxHalf[0] && Math.abs(this.camLocal.y) < spec.boxHalf[1] && Math.abs(this.camLocal.z) < spec.boxHalf[2];
      u.steps.value = STEPS[this.quality][0] * (inside ? 2 : 1);
      u.pixelAngle.value = 1 / Math.max(1, focalPx);
      mesh.visible = spec.fade > 0.001;
    });
    for (let i = specs.length; i < this.galaxies.length; i++) this.galaxies[i].visible = false;
    this.sort(camera);
  }

  setNebulae(specs: (NebulaVolumeSpec & { fade: number })[], camera: PerspectiveCamera): void {
    this.nebulaKeys = specs.map((s) => s.key);
    specs.forEach((spec, i) => {
      const mesh = this.mesh(this.nebulae, i, () => nebulaMaterial(this.noise));
      const u = mesh.material.uniforms;
      const [sx, sy, sz] = spec.scale;
      mesh.matrix.copy(spec.basis).scale(new Vector3(spec.radiusPc * sx, spec.radiusPc * sy, spec.radiusPc * sz));
      mesh.matrix.setPosition(spec.center);
      mesh.updateMatrixWorld(true);
      // Nebula object space is the unit sphere of its outline (each axis normalised).
      this.inverse.copy(mesh.matrix).invert();
      u.camObj.value.copy(camera.position).applyMatrix4(this.inverse);
      u.boxHalf.value.set(1, 1, 1);
      u.kind.value = spec.kind;
      u.seed.value.set(...spec.seed);
      u.brightness.value = NEBULA_SURFACE_BRIGHTNESS[spec.nebulaKind] * spec.fade;
      u.opacity.value = spec.fade;
      u.steps.value = STEPS[this.quality][1];
      mesh.visible = spec.fade > 0.001;
    });
    for (let i = specs.length; i < this.nebulae.length; i++) this.nebulae[i].visible = false;
    this.sort(camera);
  }

  /** Volumes are composited back to front (no depth buffer across these scales). */
  private sort(camera: PerspectiveCamera): void {
    const visible = [...this.galaxies, ...this.nebulae].filter((m) => m.visible);
    const position = new Vector3();
    visible
      .map((mesh) => ({ mesh, distance: position.setFromMatrixPosition(mesh.matrix).distanceTo(camera.position) }))
      .sort((a, b) => b.distance - a.distance)
      .forEach((entry, rank) => { entry.mesh.renderOrder = -900 + rank; });
  }

  /** Distance from the eye to the far side of the farthest visible volume (for the far clipping plane). */
  reach(eye: Vector3): number {
    const center = new Vector3(), scale = new Vector3();
    let far = 0;
    for (const mesh of [...this.galaxies, ...this.nebulae]) {
      if (!mesh.visible) continue;
      center.setFromMatrixPosition(mesh.matrix);
      scale.setFromMatrixScale(mesh.matrix);
      far = Math.max(far, center.distanceTo(eye) + scale.length());
    }
    return far;
  }

  get activeGalaxies(): readonly number[] {
    return this.galaxyKeys;
  }

  get activeNebulae(): readonly number[] {
    return this.nebulaKeys;
  }

  dispose(): void {
    for (const mesh of [...this.galaxies, ...this.nebulae]) mesh.material.dispose();
    this.box.dispose();
    this.group.clear();
  }
}
