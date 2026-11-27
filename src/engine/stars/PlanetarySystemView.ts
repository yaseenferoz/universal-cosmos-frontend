import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineLoop, Mesh, PerspectiveCamera, Points,
  Quaternion, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import type { Exoplanet, PlanetarySystem } from "../../data/stars/exoplanets";
import { J2000_JD, orbitFrame, PC_PER_AU, PC_PER_EARTH_RADIUS, resolveOrbit, type OrbitElements, type OrbitFrame } from "./keplerOrbit";
import { keplerTrack, solarPlanetTrack, type OrbitTrack } from "./orbitTrack";
import { describePlanet, type PlanetLook, type PlanetSize } from "./planetAppearance";

export interface SystemPlanet {
  planet: Exoplanet;
  /** Exoplanets: published Keplerian elements (null for Solar System planets). */
  orbit: OrbitElements | null;
  /** Positions over time (null when the orbit is unknown). */
  track: OrbitTrack | null;
  size: PlanetSize;
  look: PlanetLook;
  equilibriumK: number | undefined;
  radiusPc: number;
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
  line: LineLoop<BufferGeometry, LineBasicMaterial> | null;
  /** Position relative to the floating origin (parsecs), updated every frame. */
  readonly local: Vector3;
}

const UP = new Vector3(0, 1, 0);

/** Procedural, illustrative planet surface lit by its star (see planetAppearance.ts). */
function planetMaterial(look: PlanetLook, seed: number, starColor: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      baseColor: { value: new Color(...look.base) },
      bandColor: { value: new Color(...look.band) },
      emission: { value: new Color(...look.emission) },
      lightColor: { value: starColor.clone() },
      lightDirView: { value: new Vector3(0, 0, 1) },
      banded: { value: look.banded },
      haze: { value: look.haze },
      seed: { value: seed },
    },
    vertexShader: `varying vec3 vNormalView; varying vec3 vViewPosition; varying vec3 vObject;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = view.xyz; vNormalView = normalize(normalMatrix * normal); vObject = position;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `uniform vec3 baseColor, bandColor, emission, lightColor, lightDirView;
      uniform float banded, haze, seed;
      varying vec3 vNormalView; varying vec3 vViewPosition; varying vec3 vObject;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 n = normalize(vNormalView), v = normalize(-vViewPosition), o = normalize(vObject);
        float turbulence = fbm(o * 4.0 + seed);
        float bands = 0.5 + 0.5 * sin(o.y * 22.0 + turbulence * 3.2 + seed);
        float mottle = fbm(o * 6.0 + seed * 1.7);
        vec3 albedo = mix(mix(baseColor, bandColor, smoothstep(0.35, 0.7, mottle)), mix(baseColor, bandColor, bands), banded);
        float ndl = dot(n, normalize(lightDirView));
        // Hazy worlds scatter light past the terminator; bare rock has a sharp one.
        float lit = mix(max(ndl, 0.0), smoothstep(-0.18, 0.65, ndl), haze * 0.6);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * haze * smoothstep(-0.3, 0.4, ndl);
        vec3 night = emission * mix(0.55, 1.45, mottle) * (1.0 - 0.6 * smoothstep(-0.2, 0.4, ndl));
        vec3 color = albedo * lightColor * lit * 1.6 + rim * lightColor * vec3(0.55, 0.7, 1.0) * 0.5 + night;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    // Drawn painter-style (renderOrder by distance): depth precision cannot span planets and kiloparsecs.
    transparent: true, depthTest: false, depthWrite: false,
  });
}

/**
 * One planetary system around its host, drawn relative to the host's floating-origin position.
 * Orbit outlines and markers are navigation aids; planet surfaces are illustrative.
 */
export class PlanetarySystemView {
  readonly group = new Group();
  readonly planets: SystemPlanet[];
  readonly frame: OrbitFrame;
  /** Largest apoapsis (parsecs). */
  readonly extentPc: number;
  private readonly markers: Points<BufferGeometry, ShaderMaterial>;
  private readonly markerPositions: Float32Array;
  private readonly markerFade: Float32Array;
  private readonly temp = new Vector3();

  constructor(readonly system: PlanetarySystem, hostHeliocentricPc: Vector3, starColor: Color, sphere: SphereGeometry) {
    this.frame = orbitFrame(hostHeliocentricPc);
    this.planets = system.planets.map((planet, index) => {
      const orbit = system.solarSystem ? null : resolveOrbit(planet, system.massSolar);
      const track = system.solarSystem && planet.objectId ? solarPlanetTrack(planet.objectId, planet.periodDays ?? 0, J2000_JD)
        : orbit ? keplerTrack(orbit, this.frame) : null;
      const { size, equilibriumK, look } = describePlanet(planet, system, track?.semiMajorAxisAu);
      const mesh = new Mesh(sphere, planetMaterial(look, 3.1 + index * 7.7, starColor));
      const radiusPc = size.radiusEarth * PC_PER_EARTH_RADIUS;
      mesh.scale.setScalar(radiusPc);
      mesh.visible = false;
      mesh.frustumCulled = false;
      let line: SystemPlanet["line"] = null;
      if (track) {
        mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, track.normal(new Vector3())));
        const path = track.pathAu().map((c) => c * PC_PER_AU);
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(path, 3));
        line = new LineLoop(geometry, new LineBasicMaterial({
          color: new Color(0.42, 0.6, 0.85), transparent: true, opacity: 0.4, depthTest: false, depthWrite: false,
        }));
        line.renderOrder = 0;
        line.frustumCulled = false;
        this.group.add(line);
      }
      this.group.add(mesh);
      return { planet, orbit, track, size, look, equilibriumK, radiusPc, mesh, line, local: new Vector3() };
    });
    this.extentPc = Math.max(1e-12, ...this.planets.map((p) => (p.track ? p.track.semiMajorAxisAu * (1 + p.track.eccentricity) * PC_PER_AU : 0)));
    this.markerPositions = new Float32Array(this.planets.length * 3);
    this.markerFade = new Float32Array(this.planets.length);
    const tints = new Float32Array(this.planets.length * 3);
    this.planets.forEach((entry, i) => {
      // Reflected light: the planet's colour under its star's light, brightened to display level.
      const c = entry.look.base.map((channel, k) => channel * [starColor.r, starColor.g, starColor.b][k]);
      const peak = Math.max(...c, 1e-6);
      tints.set(c.map((channel) => channel / peak), i * 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.markerPositions, 3));
    geometry.setAttribute("fade", new BufferAttribute(this.markerFade, 1));
    geometry.setAttribute("tint", new BufferAttribute(tints, 3));
    this.markers = new Points(geometry, new ShaderMaterial({
      uniforms: { pixelRatio: { value: 1 }, skyMode: { value: 0 } },
      // Navigation mode: ring markers. Sky mode (seen from a planet): star-like points whose
      // brightness is the planet's reflected light on the stars' magnitude scale.
      vertexShader: `attribute float fade; attribute vec3 tint; uniform float pixelRatio, skyMode; varying float vFade, vSize, vGlow; varying vec3 vTint;
        void main() {
          vFade = fade; vTint = tint;
          vGlow = clamp(log(max(fade, 1.0)) * 0.25, 0.0, 1.5);
          vSize = (skyMode > 0.5 ? min(48.0, 3.0 + 26.0 * vGlow) : 9.0) * pixelRatio;
          gl_PointSize = vSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform float skyMode; varying float vFade, vSize, vGlow; varying vec3 vTint;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          if (skyMode > 0.5) {
            float rPx = r * 0.5 * vSize;
            float core = exp(-rPx * rPx / 1.1);
            float halo = vGlow * 0.35 * exp(-rPx / max(1.0, vSize * 0.16)) * (1.0 - smoothstep(0.6, 1.0, r));
            float a = (core + halo) * min(vFade, 3.0);
            if (a < 0.002) discard;
            gl_FragColor = vec4(vTint * a, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            return;
          }
          float ring = smoothstep(0.55, 0.7, r) * (1.0 - smoothstep(0.85, 1.0, r)) + (1.0 - smoothstep(0.0, 0.3, r)) * 0.9;
          if (ring * vFade < 0.01) discard;
          gl_FragColor = vec4(vec3(0.72, 0.84, 1.0) * ring * vFade, 1.0);
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
    }));
    this.markers.renderOrder = 60;
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
  }

  /** Place the planets for Julian date `jd` around the host at `hostLocal` (floating-origin parsecs). */
  place(jd: number, hostLocal: Vector3): void {
    this.group.position.copy(hostLocal);
    this.group.updateMatrixWorld();
    this.planets.forEach((entry, index) => {
      if (!entry.track) {
        entry.mesh.position.set(0, 0, 0);
        entry.local.copy(hostLocal);
        return;
      }
      entry.track.positionAu(jd, entry.mesh.position).multiplyScalar(PC_PER_AU);
      entry.local.copy(entry.mesh.position).add(hostLocal);
      this.markerPositions.set([entry.mesh.position.x, entry.mesh.position.y, entry.mesh.position.z], index * 3);
    });
    this.markers.geometry.getAttribute("position").needsUpdate = true;
  }

  /** Visibility, fades and lighting for this view. `hidden[i]`: planet is behind the star's disk. */
  render(camera: PerspectiveCamera, focalPx: number, pixelRatio: number, highlight: number | null, hidden: boolean[] = []): void {
    const hostLocal = this.group.position;
    const hostDistance = Math.max(camera.position.distanceTo(hostLocal), 1e-15);
    const extentPx = (this.extentPc / hostDistance) * focalPx;
    this.group.visible = extentPx > 2;
    this.markers.material.uniforms.pixelRatio.value = pixelRatio;
    this.markers.material.uniforms.skyMode.value = 0;
    const viewMatrix = camera.matrixWorldInverse;
    this.planets.forEach((entry, index) => {
      if (!entry.track) {
        entry.mesh.visible = false;
        this.markerFade[index] = 0;
        return;
      }
      const diskPx = (entry.radiusPc / Math.max(camera.position.distanceTo(entry.local), 1e-15)) * focalPx;
      entry.mesh.visible = this.group.visible && diskPx > 0.6;
      // Markers stand in for unresolved planets: they fade as the disk grows, and while the system is tiny.
      this.markerFade[index] = hidden[index] ? 0 : (1 - smoothStep(2, 6, diskPx)) * smoothStep(8, 30, extentPx) * (highlight === index ? 1 : 0.75);
      if (entry.mesh.visible) {
        // Light travels from the host (group origin) to the planet; the shader wants the view-space direction to the star.
        const toStar = this.temp.copy(entry.mesh.position).negate().normalize().transformDirection(viewMatrix);
        entry.mesh.material.uniforms.lightDirView.value.copy(toStar);
      }
      if (entry.line) {
        const orbitPx = ((entry.track.semiMajorAxisAu * PC_PER_AU) / hostDistance) * focalPx;
        entry.line.material.opacity = (highlight === index ? 0.85 : 0.38) * smoothStep(4, 18, orbitPx);
        entry.line.visible = this.group.visible && entry.line.material.opacity > 0.01;
      }
    });
    this.markers.geometry.getAttribute("fade").needsUpdate = true;
  }

  /**
   * The system as seen from one of its planets (`observer`, hidden): no orbit outlines or
   * markers; each other planet is a lit disk when resolved, otherwise a point of light whose
   * brightness follows its reflected starlight (Lambert sphere, geometric albedo from its
   * illustrative colour) relative to the host's apparent magnitude.
   */
  renderSky(camera: PerspectiveCamera, focalPx: number, pixelRatio: number, observer: number, hostAbsMag: number,
    magnitudeLimit: number, skyVisibility: number, hideObserver: boolean): void {
    const hostLocal = this.group.position;
    this.group.visible = true;
    this.markers.material.uniforms.pixelRatio.value = pixelRatio;
    this.markers.material.uniforms.skyMode.value = 1;
    const viewMatrix = camera.matrixWorldInverse;
    const eye = camera.position;
    const starDistance = Math.max(eye.distanceTo(hostLocal), 1e-18);
    const starMagnitude = hostAbsMag + 5 * Math.log10(starDistance) - 5;
    this.planets.forEach((entry, index) => {
      if (entry.line) entry.line.visible = false;
      if (!entry.track || (index === observer && hideObserver)) {
        entry.mesh.visible = false;
        this.markerFade[index] = 0;
        return;
      }
      const distance = Math.max(eye.distanceTo(entry.local), 1e-18);
      const diskPx = (entry.radiusPc / distance) * focalPx;
      entry.mesh.visible = diskPx > 0.6;
      if (entry.mesh.visible) {
        const toStar = this.temp.copy(entry.mesh.position).negate().normalize().transformDirection(viewMatrix);
        entry.mesh.material.uniforms.lightDirView.value.copy(toStar);
      }
      if (index === observer) {
        this.markerFade[index] = 0;
        return;
      }
      const orbitRadius = Math.max(entry.mesh.position.length(), 1e-18);
      const toStarDir = this.temp.copy(entry.mesh.position).negate().divideScalar(orbitRadius);
      const toEye = eye.clone().sub(entry.local).divideScalar(distance);
      const phase = Math.acos(Math.max(-1, Math.min(1, toStarDir.dot(toEye))));
      const lambert = (Math.sin(phase) + (Math.PI - phase) * Math.cos(phase)) / Math.PI;
      const [r, g, b] = entry.look.base;
      const albedo = Math.min(0.7, Math.max(0.03, (0.2126 * r + 0.7152 * g + 0.0722 * b) * 1.2));
      const flux = albedo * (entry.radiusPc / orbitRadius) ** 2 * (starDistance / distance) ** 2 * lambert;
      const magnitude = starMagnitude - 2.5 * Math.log10(Math.max(flux, 1e-30));
      const visibility = 10 ** (0.4 * (magnitudeLimit - magnitude)) * 0.05 * skyVisibility;
      this.markerFade[index] = visibility < 0.02 ? 0 : visibility * (1 - smoothStep(1.5, 4, diskPx));
    });
    this.markers.geometry.getAttribute("fade").needsUpdate = true;
  }

  /** Planets on screen at least `minPx` from the star (labels would pile up on it otherwise). */
  isSpread(index: number, camera: PerspectiveCamera, focalPx: number, minPx: number): boolean {
    const entry = this.planets[index];
    if (!entry?.track || !this.group.visible) return false;
    const separation = entry.mesh.position.length();
    return (separation / Math.max(camera.position.distanceTo(entry.local), 1e-15)) * focalPx >= minPx;
  }

  /** Orbit normal of the outermost planet with an orbit (for framing the system). */
  framingNormal(target = new Vector3()): Vector3 {
    const outer = [...this.planets].reverse().find((p) => p.track);
    return outer?.track ? outer.track.normal(target) : target.copy(this.frame.z);
  }

  dispose(): void {
    for (const entry of this.planets) {
      entry.mesh.material.dispose();
      entry.line?.geometry.dispose();
      entry.line?.material.dispose();
    }
    this.markers.geometry.dispose();
    this.markers.material.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
