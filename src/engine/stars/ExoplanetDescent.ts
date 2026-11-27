import { PerspectiveCamera, Quaternion, Vector3, type WebGLRenderer } from "three";
import type { PlanetarySystem } from "../../data/stars/exoplanets";
import { registerLanding } from "../../data/landingRegistry";
import type { Quality } from "../../types/celestial";
import type { LunarTelemetry } from "../../types/lunar";
import { PlanetaryExploration } from "../core/PlanetaryExploration";
import { exoplanetLanding, type ExoplanetLanding } from "./exoplanetLanding";
import type { PlanetarySystemView, SystemPlanet } from "./PlanetarySystemView";
import { planetBodyFrame } from "./planetRotation";

/** Meters per parsec. */
export const M_PER_PC = 3.085677581491367e16;

export interface ExoplanetDescentOptions {
  quality: Quality;
  mobile: boolean;
  eyeHeightM: number;
  onTelemetry: (telemetry: LunarTelemetry) => void;
}

/**
 * A descent to one exoplanet, run by the shared Solar System exploration stack (terrain,
 * rocks, sky, cloud deck, walking/flying navigation) in the planet's body-fixed meters.
 * The stellar engine keeps drawing the star, sibling planets and background stars; this
 * class maps the explorer's pose into that parsec frame every frame.
 */
export class ExoplanetDescent {
  readonly landing: ExoplanetLanding;
  readonly exploration: PlanetaryExploration;
  private readonly unregister: () => void;
  private readonly frame = new Quaternion();
  private readonly inverse = new Quaternion();
  private readonly normal = new Vector3();
  private readonly toStar = new Vector3();
  private readonly offset = new Vector3();

  constructor(
    canvas: HTMLElement,
    readonly star: number,
    readonly planetIndex: number,
    system: PlanetarySystem,
    private readonly view: PlanetarySystemView,
    camera: PerspectiveCamera,
    jd: number,
    aspect: number,
    viewportHeight: number,
    options: ExoplanetDescentOptions,
  ) {
    this.landing = exoplanetLanding(system, planetIndex);
    this.unregister = registerLanding(this.landing.id, this.landing.descriptor);
    this.bodyFrame(jd);
    // Start from wherever the stellar camera is, expressed in body-fixed meters.
    const planet = this.planet;
    const positionM = camera.position.clone().sub(planet.local).multiplyScalar(M_PER_PC).applyQuaternion(this.inverse);
    const forward = camera.getWorldDirection(new Vector3()).applyQuaternion(this.inverse);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(this.inverse);
    this.exploration = new PlanetaryExploration(canvas, {
      body: this.landing.object,
      landingDirection: positionM.clone().normalize(),
      quality: options.quality,
      mobile: options.mobile,
      eyeHeightM: options.eyeHeightM,
      starlightColor: this.landing.starlight,
      onTelemetry: options.onTelemetry,
    });
    void this.exploration.prepare({ positionM, forward, up }, aspect, viewportHeight);
  }

  private get planet(): SystemPlanet {
    return this.view.planets[this.planetIndex];
  }

  /** Body-fixed → system axes at `jd`. */
  private bodyFrame(jd: number): Quaternion {
    const planet = this.planet;
    if (planet.track) planet.track.normal(this.normal);
    else this.normal.set(0, 1, 0);
    this.toStar.copy(planet.mesh.position).negate();
    planetBodyFrame(this.normal, this.toStar, this.view.frame.x, this.landing.tidallyLocked, this.landing.rotationHours, jd, this.frame);
    this.inverse.copy(this.frame).invert();
    return this.frame;
  }

  /**
   * Advance the exploration and place the stellar camera at the explorer's eye. Planet
   * positions for `jd` must already be placed. Lighting is shown fully eye-adapted (as the
   * Solar System's exposure does), so the explorer gets Earth-equivalent irradiance.
   */
  update(delta: number, jd: number, camera: PerspectiveCamera, aspect: number, viewportHeight: number): void {
    const frame = this.bodyFrame(jd);
    const sunDirection = this.toStar.normalize().applyQuaternion(this.inverse);
    this.exploration.update(delta, sunDirection, 1, aspect, viewportHeight);
    const pose = this.exploration.pose;
    if (!pose) return;
    this.offset.copy(pose.positionM).applyQuaternion(frame).divideScalar(M_PER_PC);
    camera.position.copy(this.planet.local).add(this.offset);
    camera.quaternion.copy(frame).multiply(this.exploration.navigation.camera.quaternion);
    camera.up.copy(pose.up).applyQuaternion(frame);
    camera.fov = this.exploration.navigation.camera.fov;
  }

  /** Height of the eye above the planet's reference radius, parsecs. */
  altitudePc(camera: PerspectiveCamera): number {
    return Math.max(0, camera.position.distanceTo(this.planet.local) - this.planet.radiusPc);
  }

  render(renderer: WebGLRenderer): void {
    this.exploration.render(renderer);
  }

  dispose(): void {
    this.exploration.dispose();
    this.unregister();
  }
}
