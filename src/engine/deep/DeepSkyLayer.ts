import { Group, MathUtils, Matrix3, Matrix4, Vector3, type PerspectiveCamera, type WebGLRenderer } from "three";
import { MILKY_WAY_REF, sameDeep, type DeepRef, type DeepSkyCatalog } from "../../data/deep/deepSky";
import { MILKY_WAY, milkyWayFrame } from "../../data/deep/milkyWay";
import type { Quality } from "../../types/celestial";
import { LabelPool } from "../stars/LabelPool";
import { DeepVolumes, type GalaxyVolumeSpec, type NebulaVolumeSpec } from "./DeepVolumes";
import { displayLuminosity, NEBULA_SURFACE_BRIGHTNESS, REFERENCE_PIXEL_SR } from "./deepPhotometry";
import { GalaxyField, galaxyShapes, MAX_DETAILED } from "./GalaxyField";
import { ARCHETYPE, GalaxyMaps } from "./galaxyMaps";
import { bulgeScaledIntegral, bulgeShape, diskHeights, milkyWayHeights } from "./galaxyModel";
import { NebulaField, nebulaSeed } from "./NebulaField";
import { nebulaShaderKind } from "./nebulaShaders";
import { createNoiseVolume } from "./noiseVolume";

const GALAXY_LABELS = 14;
const NEBULA_LABELS = 10;
/** Apparent radius (CSS px) at which a sprite starts handing over to a volume, and is fully replaced. */
const VOLUME_FROM_PX = 36;
const VOLUME_FULL_PX = 80;
/** The Milky Way model replaces the photographic sky beyond about this distance from the Sun (pc). */
export const MILKY_WAY_MODEL_FROM_PC = 600;
export const MILKY_WAY_MODEL_FULL_PC = 2500;

export interface DeepSkyLayerOptions {
  renderer: WebGLRenderer;
  quality: Quality;
  mobile: boolean;
  labelRoot: HTMLElement;
  signal: AbortSignal;
  onSelect: (ref: DeepRef) => void;
  onOpen: (ref: DeepRef) => void;
}

/** Fraction of the photographic sky (seen from the Sun) to keep at this distance from the Sun. */
export function photographicSkyWeight(distanceFromSunPc: number): number {
  return 1 - MathUtils.smoothstep(distanceFromSunPc, 300, 1500);
}

/**
 * Galaxies, nebulae and the Milky Way model for the star map: sprites for everything, a few
 * ray-marched volumes for what is large on screen, labels and picking. Positions are kept
 * relative to the stellar engine's floating origin.
 */
export class DeepSkyLayer {
  readonly group = new Group();
  private readonly maps: GalaxyMaps;
  private readonly noise = createNoiseVolume();
  private readonly volumes: DeepVolumes;
  private galaxies: GalaxyField;
  private nebulae: NebulaField | null = null;
  private catalog: DeepSkyCatalog | null = null;
  private readonly origin = new Vector3();
  private readonly frame = milkyWayFrame();
  private readonly mapTexels: [number, number];
  private readonly galaxyLabels: LabelPool;
  private readonly nebulaLabels: LabelPool;
  private galaxyLabelKeys: number[] = [];
  private nebulaLabelKeys: number[] = [];
  private selected: DeepRef | null = null;
  private focused: DeepRef | null = null;
  private chosenGalaxies: number[] = [];
  private chosenNebulae: number[] = [];
  private lastChoice = -Infinity;
  private exposure = 0;
  private exposureGoal = 0;
  private milkyWayFade = 0;
  private magnitudeLimit = 6.5;
  private skyVisibility = 1;
  private readonly scratch = new Vector3();

  constructor(options: DeepSkyLayerOptions) {
    const compact = options.mobile || options.quality === "low";
    this.maps = new GalaxyMaps(options.renderer, compact);
    this.mapTexels = [compact ? 256 : 512, compact ? 1024 : 2048];
    this.volumes = new DeepVolumes(this.maps.atlas, this.maps.milkyWay, this.mapTexels, this.noise);
    this.volumes.setQuality(options.quality);
    this.galaxies = new GalaxyField(null, galaxyShapes(null), this.maps.atlas, this.maps.milkyWay, this.mapTexels);
    this.group.add(this.galaxies.points, this.volumes.group);
    this.group.name = "deep-sky";
    this.galaxyLabels = new LabelPool(options.labelRoot, GALAXY_LABELS, "celestial-label star-label deep-label galaxy-label", options.signal, {
      select: (key) => options.onSelect(this.galaxyRef(key)),
      open: (key) => options.onOpen(this.galaxyRef(key)),
    });
    this.nebulaLabels = new LabelPool(options.labelRoot, NEBULA_LABELS, "celestial-label star-label deep-label nebula-label", options.signal, {
      select: (key) => options.onSelect({ kind: "nebula", index: key }),
      open: (key) => options.onOpen({ kind: "nebula", index: key }),
    });
  }

  get ready(): boolean {
    return this.catalog !== null;
  }

  /** Brightening (magnitudes) far from any large galaxy, like a camera's auto-exposure. */
  get exposureMag(): number {
    return this.exposure;
  }

  private galaxyRef(key: number): DeepRef {
    return key === this.galaxies.milkyWayIndex ? MILKY_WAY_REF : { kind: "galaxy", index: key };
  }

  private galaxyIndex(ref: DeepRef): number | null {
    if (ref.kind === "milky-way") return this.galaxies.milkyWayIndex;
    if (ref.kind === "galaxy" && this.catalog && ref.index >= 0 && ref.index < this.catalog.galaxies.count) return ref.index;
    return null;
  }

  setCatalog(catalog: DeepSkyCatalog): void {
    if (this.catalog) return;
    this.catalog = catalog;
    this.group.remove(this.galaxies.points);
    this.galaxies.dispose();
    this.galaxies = new GalaxyField(catalog.galaxies, galaxyShapes(catalog.galaxies), this.maps.atlas, this.maps.milkyWay, this.mapTexels);
    this.nebulae = new NebulaField(catalog.nebulae, this.noise);
    this.group.add(this.galaxies.points, this.nebulae.points);
    this.rebase(this.origin);
    this.select(this.selected);
    this.setSkyVisibility(this.skyVisibility);
    this.lastChoice = -Infinity;
  }

  setQuality(quality: Quality): void {
    this.volumes.setQuality(quality);
    this.lastChoice = -Infinity;
  }

  setMagnitudeLimit(limit: number): void {
    this.magnitudeLimit = limit;
  }

  /** Daylight or an atmosphere dims the deep sky like the stars (1 = space). */
  setSkyVisibility(visibility: number): void {
    this.skyVisibility = Math.max(0, visibility);
    this.galaxies.setVisibility(this.skyVisibility);
    this.nebulae?.setVisibility(this.skyVisibility);
  }

  rebase(origin: Vector3): void {
    this.origin.copy(origin);
    this.galaxies.rebase(origin);
    this.nebulae?.rebase(origin);
  }

  select(ref: DeepRef | null): void {
    this.selected = ref;
    this.galaxies.setHighlight(ref ? this.galaxyIndex(ref) : null);
    this.nebulae?.setHighlight(ref?.kind === "nebula" ? ref.index : null);
  }

  setFocus(ref: DeepRef | null): void {
    this.focused = ref;
  }

  /** Heliocentric position, parsecs. */
  heliocentric(ref: DeepRef, target = new Vector3()): Vector3 | null {
    const galaxy = this.galaxyIndex(ref);
    if (galaxy !== null) return this.galaxies.heliocentric(galaxy, target);
    const nebula = ref.kind === "nebula" ? this.catalog?.nebulae.nebulae[ref.index] : undefined;
    return nebula ? target.set(...nebula.position) : null;
  }

  localPosition(ref: DeepRef, target = new Vector3()): Vector3 | null {
    return this.heliocentric(ref, target)?.sub(this.origin) ?? null;
  }

  radiusPc(ref: DeepRef): number {
    if (ref.kind === "milky-way") return MILKY_WAY.displayRadiusPc;
    if (ref.kind === "galaxy") return this.catalog?.galaxies.radiusPc[ref.index] ?? 1;
    return this.catalog?.nebulae.nebulae[ref.index]?.radiusPc ?? 1;
  }

  /** Disk normal of a galaxy (null for nebulae and spheroids' arbitrary axes). */
  normal(ref: DeepRef, target = new Vector3()): Vector3 | null {
    if (ref.kind === "milky-way") return target.set(...this.frame.normal);
    if (ref.kind !== "galaxy" || !this.catalog) return null;
    const n = this.catalog.galaxies.normals;
    return target.set(n[ref.index * 3], n[ref.index * 3 + 1], n[ref.index * 3 + 2]);
  }

  /** Per frame: exposure, sprite uniforms, which objects are volumes, and their fades. */
  update(camera: PerspectiveCamera, focalPx: number, pixelRatio: number, maxPointSize: number, sunLocal: Vector3, now: number, delta: number): void {
    const eye = camera.position;
    this.milkyWayFade = MathUtils.smoothstep(eye.distanceTo(sunLocal), MILKY_WAY_MODEL_FROM_PC, MILKY_WAY_MODEL_FULL_PC);
    if (now - this.lastChoice > 200) {
      this.lastChoice = now;
      this.choose(eye, focalPx);
    }
    this.exposure += (this.exposureGoal - this.exposure) * (1 - Math.exp(-delta * 2));
    const maxSize = Math.min(512, maxPointSize / Math.max(1, pixelRatio));
    this.galaxies.setView(this.magnitudeLimit, this.exposure, focalPx, pixelRatio, maxSize);
    this.nebulae?.setView(focalPx, pixelRatio, maxSize);
    const galaxySpecs = this.chosenGalaxies.map((index) => this.galaxySpec(index, eye, focalPx)).filter((s) => s !== null);
    const nebulaSpecs = this.chosenNebulae.map((index) => this.nebulaSpec(index, eye, focalPx)).filter((s) => s !== null);
    this.volumes.setGalaxies(galaxySpecs, camera, focalPx);
    this.volumes.setNebulae(nebulaSpecs, camera);
    const milkyWay = this.galaxies.milkyWayIndex;
    // The Milky Way's sprite also fades near the Sun, where the photographic sky shows it.
    const handoff = (spec: { key: number; fade: number }) => spec.key === milkyWay
      ? 1 - (1 - spec.fade / Math.max(this.milkyWayFade, 1e-6)) * this.milkyWayFade : spec.fade;
    this.galaxies.setDetailed([
      ...galaxySpecs.map((spec) => ({ index: spec.key, fade: handoff(spec) })),
      ...(galaxySpecs.some((spec) => spec.key === milkyWay) ? [] : [{ index: milkyWay, fade: 1 - this.milkyWayFade }]),
    ].slice(0, MAX_DETAILED));
    this.nebulae?.setDetailed(nebulaSpecs.map((s) => ({ index: s.key, fade: s.fade })));
  }

  private apparentRadius(center: Vector3, radius: number, eye: Vector3, focalPx: number): number {
    const distance = center.distanceTo(eye);
    return distance < radius * 1.5 ? Infinity : (radius / distance) * focalPx;
  }

  /** Pick the galaxies and nebulae that are largest on screen for the volume pool, and set the exposure goal. */
  private choose(eye: Vector3, focalPx: number): void {
    const local = this.scratch;
    const galaxyCandidates: { index: number; rho: number }[] = [];
    let largest = 0;
    const count = this.catalog?.galaxies.count ?? 0;
    const positions = this.catalog?.galaxies.positions;
    const radii = this.catalog?.galaxies.radiusPc;
    for (let i = 0; i < count; i++) {
      local.set(positions![i * 3] - this.origin.x, positions![i * 3 + 1] - this.origin.y, positions![i * 3 + 2] - this.origin.z);
      const rho = this.apparentRadius(local, radii![i], eye, focalPx);
      largest = Math.max(largest, rho);
      if (rho > VOLUME_FROM_PX) galaxyCandidates.push({ index: i, rho });
    }
    const milkyWay = this.galaxies.milkyWayIndex;
    this.galaxies.heliocentric(milkyWay, local).sub(this.origin);
    const milkyWayRho = this.apparentRadius(local, MILKY_WAY.displayRadiusPc, eye, focalPx);
    largest = Math.max(largest, milkyWayRho);
    if (milkyWayRho > VOLUME_FROM_PX && this.milkyWayFade > 0) galaxyCandidates.push({ index: milkyWay, rho: milkyWayRho });
    galaxyCandidates.sort((a, b) => b.rho - a.rho);
    this.chosenGalaxies = galaxyCandidates.slice(0, this.volumes.galaxyCapacity).map((c) => c.index);
    // Far from every large galaxy the view brightens, up to nine magnitudes.
    this.exposureGoal = MathUtils.clamp(2.5 * Math.log10(60 / Math.max(largest, 1e-3)), 0, 9);
    const nebulaCandidates: { index: number; rho: number }[] = [];
    this.catalog?.nebulae.nebulae.forEach((nebula, i) => {
      if (nebula.kind === "dark" && !sameDeep(this.focused, { kind: "nebula", index: i })) return;
      local.set(nebula.position[0] - this.origin.x, nebula.position[1] - this.origin.y, nebula.position[2] - this.origin.z);
      const rho = this.apparentRadius(local, nebula.radiusPc, eye, focalPx);
      if (rho > VOLUME_FROM_PX) nebulaCandidates.push({ index: i, rho });
    });
    nebulaCandidates.sort((a, b) => b.rho - a.rho);
    this.chosenNebulae = nebulaCandidates.slice(0, this.volumes.nebulaCapacity).map((c) => c.index);
  }

  private galaxySpec(index: number, eye: Vector3, focalPx: number): (GalaxyVolumeSpec & { fade: number }) | null {
    const milkyWay = index === this.galaxies.milkyWayIndex;
    const catalog = this.catalog?.galaxies;
    if (!milkyWay && !catalog) return null;
    const center = this.galaxies.heliocentric(index, new Vector3()).sub(this.origin);
    const radiusPc = milkyWay ? MILKY_WAY.displayRadiusPc : catalog!.radiusPc[index];
    const rho = this.apparentRadius(center, radiusPc, eye, focalPx);
    let fade = MathUtils.smoothstep(rho, VOLUME_FROM_PX, VOLUME_FULL_PX) * Math.min(1, this.skyVisibility);
    if (milkyWay) fade *= this.milkyWayFade;
    const shapes = this.galaxies.shapes;
    const axis = new Vector3(shapes.axes[index * 3], shapes.axes[index * 3 + 1], shapes.axes[index * 3 + 2]);
    const normal = milkyWay ? new Vector3(...this.frame.normal) : new Vector3(catalog!.normals[index * 3], catalog!.normals[index * 3 + 1], catalog!.normals[index * 3 + 2]);
    const third = new Vector3().crossVectors(axis, normal).normalize();
    const basis = new Matrix4().makeBasis(axis, normal, third);
    const cell = shapes.cells[index];
    const absMag = milkyWay ? MILKY_WAY.absMagV : catalog!.absMagV[index];
    const brightness = (displayLuminosity(absMag, this.magnitudeLimit + this.exposure) * REFERENCE_PIXEL_SR) / (radiusPc * radiusPc);
    const flattening = milkyWay ? 0.06 : catalog!.flattening[index];
    const oldColor: [number, number, number] = [shapes.oldColors[index * 3], shapes.oldColors[index * 3 + 1], shapes.oldColors[index * 3 + 2]];
    if (milkyWay) {
      // Boxy bulge / long bar: semi-axes 1.6 × 0.7 × 0.5 kpc, truncated at the 5 kpc half-length.
      const r = MILKY_WAY.displayRadiusPc, a = 1600 / r, b = 700 / r, c = 500 / r;
      const angle = MathUtils.degToRad(MILKY_WAY.bar.angleDeg);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const truncation = MILKY_WAY.bar.halfLengthPc / r / a;
      const h = milkyWayHeights();
      return {
        key: index, fade, center, radiusPc, basis, cell, brightness, oldColor,
        heights: [h.old, h.thick, h.young, h.dust], thickFraction: h.thickFraction, boxHalf: [1, h.box, 1],
        bulgeFraction: 0.3, bulgeK: 0.3 / (a * b * c * bulgeScaledIntegral(truncation)), bulgeTruncation: truncation,
        bulgeMatrix: new Matrix3().set(cos / a, 0, sin / a, 0, 1 / c, 0, -sin / b, 0, cos / b),
      };
    }
    const bulge = bulgeShape(catalog!.tType[index], cell, flattening);
    const bulgeMatrix = new Matrix3().set(1 / bulge.radius, 0, 0, 0, 1 / (bulge.radius * bulge.flattening), 0, 0, 0, 1 / bulge.radius);
    if (cell === ARCHETYPE.Spheroid)
      return {
        key: index, fade, center, radiusPc, basis, cell, brightness, oldColor, heights: [1, 1, 1, 1], thickFraction: 0,
        boxHalf: [1, bulge.flattening, 1], bulgeFraction: 1, bulgeK: bulge.k, bulgeTruncation: bulge.truncation, bulgeMatrix,
      };
    const h = diskHeights(flattening);
    return {
      key: index, fade, center, radiusPc, basis, cell, brightness, oldColor,
      heights: [h.old, h.thick, h.young, h.dust], thickFraction: h.thickFraction, boxHalf: [1, h.box, 1],
      bulgeFraction: bulge.fraction, bulgeK: bulge.k, bulgeTruncation: bulge.truncation, bulgeMatrix,
    };
  }

  private nebulaSpec(index: number, eye: Vector3, focalPx: number): (NebulaVolumeSpec & { fade: number }) | null {
    const nebula = this.catalog?.nebulae.nebulae[index];
    if (!nebula) return null;
    const center = new Vector3(...nebula.position).sub(this.origin);
    const fade = MathUtils.smoothstep(this.apparentRadius(center, nebula.radiusPc, eye, focalPx), VOLUME_FROM_PX, VOLUME_FULL_PX) * Math.min(1, this.skyVisibility);
    // Outline axes on the sky; depth along the line of sight from the Sun is assumed between the two.
    const sight = new Vector3(...nebula.position).normalize();
    const major = new Vector3(...nebula.majorAxis);
    major.addScaledVector(sight, -major.dot(sight)).normalize();
    const minor = new Vector3().crossVectors(sight, major).normalize();
    const q = nebula.axisRatio;
    return {
      key: index, fade, center, radiusPc: nebula.radiusPc, basis: new Matrix4().makeBasis(major, minor, sight),
      scale: [1, q, (1 + q) / 2], kind: nebulaShaderKind(nebula.kind, nebula.filled), nebulaKind: nebula.kind, seed: nebulaSeed(index),
    };
  }

  private screen(local: Vector3, camera: PerspectiveCamera, width: number, height: number): { x: number; y: number } | null {
    const forward = camera.getWorldDirection(this.scratch.clone());
    if (local.clone().sub(camera.position).dot(forward) <= 0) return null;
    const p = local.clone().project(camera);
    if (Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return null;
    return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
  }

  /** Visible galaxies' apparent radius (px) and display flux at the eye; null when not drawn. */
  private galaxyAppearance(index: number, eye: Vector3, focalPx: number, local: Vector3): { rho: number; flux: number } | null {
    const milkyWay = index === this.galaxies.milkyWayIndex;
    const catalog = this.catalog?.galaxies;
    if (!milkyWay && !catalog) return null;
    this.galaxies.heliocentric(index, local).sub(this.origin);
    const radius = milkyWay ? MILKY_WAY.displayRadiusPc : catalog!.radiusPc[index];
    const distance = Math.max(local.distanceTo(eye), 1e-9);
    const luminosity = displayLuminosity(milkyWay ? MILKY_WAY.absMagV : catalog!.absMagV[index], this.magnitudeLimit + this.exposure);
    if (milkyWay && (this.milkyWayFade < 0.5 || distance < radius * 1.5)) return null;
    const rho = (radius / distance) * focalPx;
    const flux = luminosity / (distance * distance);
    const surface = (luminosity * REFERENCE_PIXEL_SR) / (radius * radius);
    const visible = rho < 1.5 ? flux > 0.05 : surface > 0.01;
    return visible ? { rho, flux } : null;
  }

  /** Nearest galaxy, nebula or the Milky Way to a click (CSS px within the canvas), or null. */
  pick(x: number, y: number, camera: PerspectiveCamera, width: number, height: number, focalPx: number): DeepRef | null {
    const eye = camera.position;
    let best: DeepRef | null = null, bestScore = 1;
    const consider = (ref: DeepRef, local: Vector3, rho: number) => {
      const at = this.screen(local, camera, width, height);
      if (!at) return;
      // Inside the apparent disk (or within a few pixels of a point); smaller objects win ties.
      const score = Math.hypot(at.x - x, at.y - y) / Math.max(rho, 7) + Math.min(rho, 400) * 1e-4;
      if (score < bestScore) {
        bestScore = score;
        best = ref;
      }
    };
    const count = this.catalog?.galaxies.count ?? 0;
    const local = new Vector3();
    for (let i = 0; i <= count; i++) {
      const index = i === count ? this.galaxies.milkyWayIndex : i;
      const look = this.galaxyAppearance(index, eye, focalPx, local);
      if (look) consider(this.galaxyRef(index), local, look.rho);
    }
    this.catalog?.nebulae.nebulae.forEach((nebula, i) => {
      if (nebula.kind === "dark") return;
      const local = new Vector3(...nebula.position).sub(this.origin);
      const rho = (nebula.radiusPc / Math.max(local.distanceTo(eye), 1e-9)) * focalPx;
      if (rho * rho * NEBULA_SURFACE_BRIGHTNESS[nebula.kind] > 1) consider({ kind: "nebula", index: i }, local, rho);
    });
    return best;
  }

  /** Labels for the largest galaxies and nebulae in view, the selection and the focus. */
  chooseLabels(camera: PerspectiveCamera, width: number, height: number, focalPx: number): void {
    const eye = camera.position;
    const galaxies: { key: number; rank: number }[] = [];
    const count = this.catalog?.galaxies.count ?? 0;
    const local = new Vector3();
    for (let i = 0; i <= count; i++) {
      const index = i === count ? this.galaxies.milkyWayIndex : i;
      const look = this.galaxyAppearance(index, eye, focalPx, local);
      if (!look || (look.rho < 6 && look.flux < 8)) continue;
      if (!this.screen(local, camera, width, height)) continue;
      const name = index === this.galaxies.milkyWayIndex ? "Milky Way" : this.catalog?.galaxies.names[index]?.[0] ?? "";
      const designation = /^(2MASX|CGCG|MCG|PGC|ESO|UGC|IC|AGC|KK)/.test(name) ? 0.35 : /^NGC/.test(name) ? 0.7 : 1;
      galaxies.push({ key: index, rank: -Math.max(look.rho, Math.sqrt(look.flux)) * designation });
    }
    galaxies.sort((a, b) => a.rank - b.rank);
    const galaxyKeys = new Set(galaxies.slice(0, GALAXY_LABELS - 2).map((g) => g.key));
    for (const ref of [this.selected, this.focused]) {
      const index = ref ? this.galaxyIndex(ref) : null;
      if (index !== null) galaxyKeys.add(index);
    }
    this.galaxyLabelKeys = [...galaxyKeys];
    this.galaxyLabels.assign(this.galaxyLabelKeys.map((key) => ({
      key, text: key === this.galaxies.milkyWayIndex ? "Milky Way" : this.catalog?.galaxies.names[key]?.[0] ?? "Galaxy",
      selected: sameDeep(this.selected, this.galaxyRef(key)), variant: key === this.galaxies.milkyWayIndex ? "milky-way-label" : undefined,
    })));
    const nebulae: { key: number; rank: number }[] = [];
    this.catalog?.nebulae.nebulae.forEach((nebula, i) => {
      if (nebula.kind === "dark" && !sameDeep(this.selected, { kind: "nebula", index: i })) return;
      const local = new Vector3(...nebula.position).sub(this.origin);
      const rho = (nebula.radiusPc / Math.max(local.distanceTo(eye), 1e-9)) * focalPx;
      if (rho < 8 || !this.screen(local, camera, width, height)) return;
      // Named objects (common names, Messier, NGC) first; survey designations need to be large.
      const named = /Nebula|Loop|^M \d|^NGC|^IC/.test(nebula.names[0]) ? 3 : /^(PN|WISE|G\d|RCW|LBN|Sh2|SNR|RX|MSH|PKS)/.test(nebula.names[0]) ? 0.5 : 1;
      if (named < 1 && rho < 25) return;
      nebulae.push({ key: i, rank: -rho * named });
    });
    nebulae.sort((a, b) => a.rank - b.rank);
    const nebulaKeys = new Set(nebulae.slice(0, NEBULA_LABELS - 2).map((n) => n.key));
    for (const ref of [this.selected, this.focused]) if (ref?.kind === "nebula") nebulaKeys.add(ref.index);
    this.nebulaLabelKeys = [...nebulaKeys];
    this.nebulaLabels.assign(this.nebulaLabelKeys.map((key) => ({
      key, text: this.catalog?.nebulae.nebulae[key]?.names[0] ?? "Nebula", selected: sameDeep(this.selected, { kind: "nebula", index: key }),
    })));
  }

  positionLabels(camera: PerspectiveCamera, width: number, height: number): void {
    const local = new Vector3();
    this.galaxyLabels.place((key) => {
      this.galaxies.heliocentric(key, local).sub(this.origin);
      return this.screen(local, camera, width, height);
    });
    this.nebulaLabels.place((key) => {
      const nebula = this.catalog?.nebulae.nebulae[key];
      return nebula ? this.screen(local.set(...nebula.position).sub(this.origin), camera, width, height) : null;
    });
  }

  hideLabels(): void {
    this.galaxyLabels.assign([]);
    this.nebulaLabels.assign([]);
  }

  dispose(): void {
    this.galaxies.dispose();
    this.nebulae?.dispose();
    this.volumes.dispose();
    this.maps.dispose();
    this.noise.dispose();
    this.group.clear();
  }
}
