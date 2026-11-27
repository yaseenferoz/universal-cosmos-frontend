import { BackSide, Color, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3, type Texture, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { STATION_ALTITUDE_KM } from "./StationOrbit";
import { SUN_COLOR } from "./StationSun";

const EARTH_RADIUS_KM = 6378.137;
/** Re-filter the environment after the Sun moves this far (radians) or at most this often. */
const REBUILD_ANGLE = (2 * Math.PI) / 180;
const REBUILD_INTERVAL_MS = 250;

/**
 * Image-based light for the station exterior: black space above Earth's limb and Earth below,
 * each point of which is lit by the Sun according to where the station's view meets the globe
 * (bright blue-white day side, dark night side). Metal and white blankets reflect it, and
 * downward-facing parts get earthshine; there is no sky light from above. The Sun itself is the
 * directional light, so it is not in this map (no double counting).
 */
export class StationEnvironment {
  private readonly scene = new Scene();
  private readonly material: ShaderMaterial;
  private readonly generator: PMREMGenerator;
  private target: WebGLRenderTarget | null = null;
  private readonly lastDirection = new Vector3(0, -1, 0);
  private lastBuild = -Infinity;

  constructor(renderer: WebGLRenderer) {
    this.generator = new PMREMGenerator(renderer);
    this.material = new ShaderMaterial({
      uniforms: {
        sunDirection: { value: new Vector3(0, 1, 0) },
        sunColor: { value: new Color(1, 1, 1) },
        stationHeight: { value: 1 + STATION_ALTITUDE_KM / EARTH_RADIUS_KM },
      },
      vertexShader: "varying vec3 vDirection; void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 sunDirection; uniform vec3 sunColor; uniform float stationHeight; varying vec3 vDirection;
        void main() {
          vec3 d = normalize(vDirection);
          // Station at (0, h, 0) above a unit Earth: does this view direction meet the globe?
          vec3 o = vec3(0.0, stationHeight, 0.0);
          float b = dot(o, d), c = dot(o, o) - 1.0, disc = b * b - c;
          vec3 radiance = vec3(0.0);
          if (disc > 0.0 && -b - sqrt(disc) > 0.0) {
            vec3 ground = normalize(o + d * (-b - sqrt(disc)));
            float lit = max(dot(ground, sunDirection), 0.0);
            // Earth's mean albedo ~0.3, ocean-and-cloud blue-white; a little light on the night side.
            radiance = vec3(0.30, 0.36, 0.46) * sunColor * lit + vec3(0.004, 0.005, 0.008);
            // Thin bright atmosphere at the limb.
            radiance += vec3(0.10, 0.18, 0.32) * sunColor * pow(1.0 - clamp(-d.y / 0.4, 0.0, 1.0), 8.0) * max(sunDirection.y + 0.4, 0.0);
          }
          gl_FragColor = vec4(radiance, 1.0);
        }`,
      side: BackSide,
    });
    this.scene.add(new Mesh(new SphereGeometry(10, 64, 32), this.material));
  }

  get texture(): Texture | null {
    return this.target?.texture ?? null;
  }

  /** Rebuild when the Sun has moved enough (returns true when the texture changed). */
  update(sunDirection: Vector3, now = performance.now(), force = false): boolean {
    if (!force && this.target && (this.lastDirection.angleTo(sunDirection) < REBUILD_ANGLE || now - this.lastBuild < REBUILD_INTERVAL_MS)) return false;
    this.lastDirection.copy(sunDirection);
    this.lastBuild = now;
    this.material.uniforms.sunDirection.value.copy(sunDirection);
    // Earth's day side keeps shining after the Sun sets for the station: the ground sees the unoccluded Sun.
    this.material.uniforms.sunColor.value.setRGB(...SUN_COLOR);
    const previous = this.target;
    this.target = this.generator.fromScene(this.scene, 0, 0.1, 100);
    previous?.dispose();
    return true;
  }

  dispose(): void {
    this.target?.dispose();
    this.generator.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
