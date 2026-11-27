import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial, SphereGeometry, type Vector3 } from "three";
import { STATION_ALTITUDE_KM } from "./StationOrbit";

/**
 * The Sun seen from the ISS. No atmosphere lies between them, so the Sun is white (5772 K),
 * 0.53° across and far brighter than anything else in view; cameras show it with glare.
 * Earth hides it below its limb, which from 400 km sits 19.8° below the local horizontal.
 * Close to the limb the light grazes the atmosphere and is reddened and dimmed.
 */
const EARTH_RADIUS_KM = 6378.137;
/** Dip of Earth's limb below the station's local horizontal, degrees (≈19.8°). */
export const EARTH_LIMB_DIP_DEG = (Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + STATION_ALTITUDE_KM)) * 180) / Math.PI;
export const SUN_ANGULAR_RADIUS_DEG = 0.2666;
/** Above the limb by less than this, sunlight crosses enough atmosphere to be visibly reddened. */
const GRAZING_DEG = 2.5;
/** Linear sRGB of a 5772 K blackbody, normalised to its brightest channel. */
export const SUN_COLOR: [number, number, number] = [1, 0.949, 0.906];
/** Direct sunlight above the atmosphere, in the renderer's light units (the station and Earth share it). */
export const STATION_SUNLIGHT_INTENSITY = 3.6;

/** Altitude of the Sun above the station's local horizontal, degrees, from its unit direction (y up). */
export function sunAltitudeDeg(direction: Vector3): number {
  return (Math.asin(Math.max(-1, Math.min(1, direction.y))) * 180) / Math.PI;
}

/** Fraction of the solar disk above Earth's limb (area of a circular segment). */
export function sunVisibleFraction(altitudeDeg: number): number {
  const h = Math.max(-1, Math.min(1, (altitudeDeg + EARTH_LIMB_DIP_DEG) / SUN_ANGULAR_RADIUS_DEG));
  return (Math.acos(-h) + h * Math.sqrt(1 - h * h)) / Math.PI;
}

/**
 * Colour multiplier for sunlight crossing the limb's atmosphere: blue is scattered out first
 * (Rayleigh), so the setting Sun turns orange-red and dims. 1 well above the limb.
 */
export function sunAtmosphereTint(altitudeDeg: number): [number, number, number] {
  const above = altitudeDeg + EARTH_LIMB_DIP_DEG;
  const t = 1 - Math.min(1, Math.max(0, above / GRAZING_DEG));
  const s = t * t * (3 - 2 * t);
  const dim = 1 - 0.55 * s;
  return [dim, dim * (1 - 0.45 * s), dim * (1 - 0.8 * s)];
}

/** Sunlight reaching the station: colour (linear RGB) and a 0–1 intensity factor. */
export function stationSunlight(direction: Vector3): { color: [number, number, number]; intensity: number } {
  const altitude = sunAltitudeDeg(direction);
  const tint = sunAtmosphereTint(altitude);
  return { color: [SUN_COLOR[0] * tint[0], SUN_COLOR[1] * tint[1], SUN_COLOR[2] * tint[2]], intensity: sunVisibleFraction(altitude) };
}

/** Limb-darkened solar disk plus camera glare and diffraction spikes, as sky-proxy meshes. */
export class StationSunVisual {
  readonly disk: Mesh<SphereGeometry, ShaderMaterial>;
  readonly glare: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly color = new Color();

  constructor(diskRadius: number, glareSize: number) {
    this.disk = new Mesh(new SphereGeometry(diskRadius, 48, 24), new ShaderMaterial({
      uniforms: { sunColor: { value: new Color(...SUN_COLOR) } },
      vertexShader: `varying vec3 vNormalView; varying vec3 vView;
        void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vView = -p.xyz; vNormalView = normalMatrix * normal; gl_Position = projectionMatrix * p; }`,
      fragmentShader: `uniform vec3 sunColor; varying vec3 vNormalView; varying vec3 vView;
        void main() {
          float mu = max(dot(normalize(vNormalView), normalize(vView)), 0.0);
          // Visible-light limb darkening (u ≈ 0.6); far above display white, so it reads as a white disk with a warm rim.
          gl_FragColor = vec4(sunColor * 8.0 * (1.0 - 0.6 * (1.0 - mu)), 1.0);
        }`,
    }));
    this.glare = new Mesh(new PlaneGeometry(glareSize, glareSize), new ShaderMaterial({
      uniforms: { sunColor: { value: new Color(...SUN_COLOR) }, intensity: { value: 1 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 sunColor; uniform float intensity; varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;
          // Glare from a camera looking near the Sun (scatter in the optics): a blinding core,
          // a bright inner glow, a wide faint halo and six faint diffraction spikes.
          float core = exp(-r * r * 2500.0) * 4.0;
          float glow = exp(-r * 16.0) * 0.9;
          float halo = exp(-r * 3.5) * 0.14;
          float angle = atan(p.y, p.x);
          float spikes = pow(abs(cos(3.0 * angle)), 600.0) * exp(-r * 5.0) * 0.35;
          float a = (core + glow + halo + spikes) * (1.0 - smoothstep(0.75, 1.0, r)) * intensity;
          gl_FragColor = vec4(sunColor * a, 1.0);
        }`,
      transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    this.glare.renderOrder = 10;
  }

  /** Place both at `position` (sky proxy) and colour/fade them for the Sun's altitude. */
  update(position: Vector3, direction: Vector3): void {
    this.disk.position.copy(position);
    this.glare.position.copy(position);
    const { color, intensity } = stationSunlight(direction);
    this.color.setRGB(...color);
    this.disk.material.uniforms.sunColor.value.copy(this.color);
    this.glare.material.uniforms.sunColor.value.copy(this.color);
    // The disk is hidden by Earth through the depth test; the glare (drawn on top) fades with the visible fraction.
    this.glare.material.uniforms.intensity.value = intensity;
  }

  dispose(): void {
    this.disk.geometry.dispose();
    this.disk.material.dispose();
    this.glare.geometry.dispose();
    this.glare.material.dispose();
  }
}
