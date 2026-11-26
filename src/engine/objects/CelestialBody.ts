import {
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LinearSRGBColorSpace,
  LineLoop,
  LOD,
  Material,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RingGeometry,
  RGBADepthPacking,
  SphereGeometry,
  TangentSpaceNormalMap,
  Texture,
  Vector3,
  Quaternion,
} from "three";
import { hasCuratedImagery, imageryById, imageryFor, type TextureAsset } from "../../data/imagery";
import { atmosphereLimbs } from "../../data/atmosphereLimbs";
import { compressedSolarDistance, generatedOrbits, usesTrueOverviewShape, type GeneratedOrbit } from "../../data/generatedBodies";
import { eclipticToEngine, keplerianToEcliptic } from "../ephemeris/kepler";
import type { CelestialObject } from "../../types/celestial";
import {
  scientificTextures,
  textureTierForHeight,
  type TextureLease,
  type TextureTier,
} from "../loaders/ScientificTextureLoader";
import {
  configureNightSide,
  configurePartialCoverage,
  createLimbAtmosphereMaterial,
} from "./PlanetShaders";
import { SunRenderer } from "../solar/SunRenderer";
import { SolarMaterialLighting } from "../solar/PlanetSolarLighting";
import { configureVenusClouds } from "./VenusClouds";
import { loadShapeModel, type LoadedShapeModel } from "./ShapeModel";
import { shapeModelFor, type ShapeModelAsset } from "../../data/shapeModels";
import { SIMULATION_EPOCH } from "../../data/catalog";
import { simulationUtcMs } from "../../utils/simulationTime";
import { earthOrientationAt } from "../coordinates/EarthOrientation";
import { iauPoleQuaternion, iauRotationAngles, iauSpinRadians } from "../ephemeris/orientation";
import { utcToTdbMs } from "../ephemeris/time";
import { configureSaturnClouds, configureSaturnLighting, SATURN_POLAR_RATIO } from "./SaturnAppearance";
import { createStationMarker } from "../station/StationMarker";
import { bodyAppearance, displayAlbedo, measuredAppearance } from "../../data/bodyAppearance";
import {
  buildIrregularShape,
  defaultAxes,
  roughnessForRadius,
  shapeSeed,
  type IrregularShapeParameters,
} from "./IrregularShape";

/** Mesh detail for seeded shapes: coarse once visible, fine when inspected. */
const SHAPE_DETAIL = { coarse: 10, fine: 40 } as const;
const PLANET_CATEGORIES = ["Terrestrial planet", "Gas giant", "Ice giant"];

type Layer = "surface" | "clouds" | "night" | "normal" | "roughness" | "rings";
export interface BodyTextureStatus {
  state: "unloaded" | "loading" | "ready" | "partial" | "missing";
  messages: string[];
}

/** A body's geometry can change display scale without changing its physical catalog data. */
const Y_AXIS = new Vector3(0, 1, 0);

let sharedMinorGeometry: SphereGeometry | null = null;
let sharedMinorUsers = 0;
/** Unit sphere shared by all minor bodies, reference-counted and disposed with the last one. */
function minorBodyGeometry(): SphereGeometry {
  // Only drawn bodies render (culled ones are detached), so a smooth sphere is affordable.
  sharedMinorGeometry ??= new SphereGeometry(1, 48, 24);
  sharedMinorUsers++;
  return sharedMinorGeometry;
}
function releaseMinorBodyGeometry(): void {
  if (sharedMinorUsers === 0) return;
  sharedMinorUsers--;
  if (sharedMinorUsers === 0) {
    sharedMinorGeometry?.dispose();
    sharedMinorGeometry = null;
  }
}

/** True Keplerian ellipse (epoch elements) with log-compressed heliocentric radius. */
function compressedOrbitPath(orbit: GeneratedOrbit): Vector3[] {
  const { a, e, i, node, peri } = orbit.elements;
  const m = orbit.frameToEcliptic;
  return Array.from({ length: 256 }, (_, k) => {
    const meanAnomaly = (k / 256) * Math.PI * 2;
    const p = keplerianToEcliptic({
      semiMajorAxis: a, eccentricity: e, inclination: i * Math.PI / 180,
      ascendingNode: node * Math.PI / 180, argumentOfPeriapsis: peri * Math.PI / 180,
      // Sample eccentric anomaly uniformly so perihelion stays smooth: M = E − e sin E.
      meanAnomaly: meanAnomaly - e * Math.sin(meanAnomaly),
    });
    const ecliptic = eclipticToEngine({
      x: m[0][0] * p.x + m[0][1] * p.y + m[0][2] * p.z,
      y: m[1][0] * p.x + m[1][1] * p.y + m[1][2] * p.z,
      z: m[2][0] * p.x + m[2][1] * p.y + m[2][2] * p.z,
    });
    const distance = Math.hypot(ecliptic.x, ecliptic.y, ecliptic.z);
    const scale = compressedSolarDistance(distance) / distance;
    return new Vector3(ecliptic.x * scale, ecliptic.y * scale, ecliptic.z * scale);
  });
}

export class CelestialBody {
  readonly anchor = new Group();
  readonly tilted = new Group();
  readonly surface = new LOD();
  readonly pickables: Mesh[] = [];
  /** `undefined` until first needed: minor bodies build their orbit line lazily. */
  private orbitLine: LineLoop<BufferGeometry, LineBasicMaterial> | null | undefined;
  private readonly material: MeshStandardMaterial | null;
  private readonly towardSun = new Vector3(1, 0, 0);
  readonly solarLighting = new SolarMaterialLighting(this.towardSun);
  readonly sunRenderer: SunRenderer | null;
  private readonly leases = new Map<Layer, TextureLease>();
  private readonly failures = new Map<Layer | "shape", string>();
  /** Published NASA shape model, once loaded (replaces the sphere at every LOD). */
  private shapeModel: LoadedShapeModel | null = null;
  private readonly shapeModelAsset: ShapeModelAsset | undefined;
  /** Seeded illustrative shape inputs for small bodies without a map or model. */
  private readonly shapeParameters: Omit<IrregularShapeParameters, "detail"> | null = null;
  private shapeDetail = 0;
  private shapeMesh: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;
  /** Holds a reference to the shared placeholder sphere until it is replaced. */
  private usesSharedSphere = false;
  /** Largest extent of the shape in mean radii (1 for spheres). */
  private shapeExtent = 1;
  private clouds: Mesh<SphereGeometry, MeshStandardMaterial> | null = null;
  private rings: Mesh<RingGeometry, MeshStandardMaterial> | null = null;
  private cloudDepth: MeshDepthMaterial | null = null;
  private limbAtmosphere: Mesh | null = null;
  private textureSize = 0;
  private requestGeneration = 0;
  private textureRequest: Promise<void> = Promise.resolve();
  private loading = false;
  private disposed = false;
  private radius: number;
  private readonly saturnInverse = new Matrix4();

  /** Hand-curated body with full rendering; false for JPL-generated minor bodies. */
  readonly curated: boolean;

  constructor(readonly data: CelestialObject) {
    this.curated = hasCuratedImagery(data.id);
    this.shapeModelAsset = shapeModelFor(data.id);
    // Frame and clear the camera for the published model before it has loaded.
    if (this.shapeModelAsset) this.shapeExtent = this.shapeModelAsset.extent;
    this.radius = data.display.radius;
    this.anchor.name = data.id;
    this.anchor.add(this.tilted);
    // Placeholder obliquity; rotate() replaces it with the IAU pole where one is published.
    this.tilted.rotation.z = (data.axialTiltDeg * Math.PI) / 180;
    this.tilted.add(this.surface);
    this.sunRenderer =
      data.id === "sun" ? new SunRenderer(data.display.radius) : null;
    if (this.sunRenderer) {
      this.material = null;
      this.tilted.remove(this.surface);
      this.surface = this.sunRenderer.surface;
      this.tilted.add(this.surface, this.sunRenderer.corona);
      this.pickables.push(...this.sunRenderer.pickables);
      this.orbitLine = null;
      return;
    }
    if (data.id === "iss") {
      this.material = null;
      const marker = createStationMarker(data.display.radius);
      marker.traverse((node) => { if (node instanceof Mesh) this.pickables.push(node); });
      this.surface.addLevel(marker, 0);
      this.orbitLine = this.createOrbit();
      return;
    }
    // Missing measurements remain disclosed; Venus has an explicit cloud reconstruction.
    this.material = new MeshStandardMaterial({
      color: data.color,
      roughness: 1,
      metalness: 0,
    });
    if (data.id === "venus") configureVenusClouds(this.material);
    const surfaceAsset = imageryFor(data.id).surface;
    // Unmapped small bodies: measured albedo/colour and a seeded shape at measured
    // proportions where published (family defaults otherwise, disclosed in the UI).
    if (!surfaceAsset && !PLANET_CATEGORIES.includes(data.category)) {
      const appearance = bodyAppearance(data, {
        irregularOrbit: generatedOrbits.get(data.id)?.referencePlane === "ecliptic",
      });
      this.material.color.setRGB(...appearance.rgb, LinearSRGBColorSpace);
      const seed = shapeSeed(data.id);
      this.shapeParameters = {
        seed,
        axes: appearance.axes ?? defaultAxes(seed, data.radiusKm, appearance.icy),
        roughness: roughnessForRadius(data.radiusKm, appearance.icy),
        // Surfaces of large unexplored worlds are unknown: no invented craters there.
        craters: data.radiusKm > 450 ? 0 : data.radiusKm > 100 ? 45 : 70,
      };
    }
    if (
      surfaceAsset?.partialCoverage &&
      this.material instanceof MeshStandardMaterial
    ) {
      // Mean colour of each map's observed pixels (measured from the installed textures),
      // mottling strength, and crater density of the illustrative continuation: heavily
      // cratered Titania and Charon; young, nearly crater-free Triton and volcanic Io.
      const continuation: Partial<Record<string, [string, number, number]>> = {
        titania: ["#929292", 0.35, 1], charon: ["#828282", 0.3, 0.6], pluto: ["#8b7a73", 0.35, 0.25],
        triton: ["#9fa294", 0.3, 0], io: ["#b09a64", 0.35, 0],
        saturn: ["#c3b395", 0, 0], jupiter: ["#b4ada2", 0, 0],
      };
      const [fill, variation, craters] = continuation[data.id] ?? [data.color, 0.25, 0.5];
      configurePartialCoverage(this.material, fill, 1, variation, craters);
    }
    if (data.id === "saturn") configureSaturnClouds(this.material);
    const detailed = data.category.includes("planet") || ["sun", "moon", "titan", "saturn"].includes(data.id);
    // Hundreds of JPL-generated moons/small bodies share one sphere geometry,
    // skip shadow passes and need no LOD switching: they are rarely more than a few pixels.
    const minor = !hasCuratedImagery(data.id);
    const singleMesh = minor || this.shapeParameters !== null;
    if (singleMesh) {
      const mesh = new Mesh<BufferGeometry, MeshStandardMaterial>(minorBodyGeometry(), this.material);
      this.usesSharedSphere = true;
      mesh.scale.setScalar(data.display.radius);
      mesh.userData.objectId = data.id;
      this.surface.addLevel(mesh, 0);
      this.pickables.push(mesh);
      this.shapeMesh = mesh;
    }
    for (const [segments, multiple] of singleMesh ? [] : [
      [detailed ? 128 : 48, 0],
      [detailed ? 48 : 24, 20],
      [detailed ? 20 : 12, 60],
    ]) {
      const mesh = new Mesh(
        new SphereGeometry(data.display.radius, segments, segments / 2),
        this.material,
      );
      mesh.userData.objectId = data.id;
      mesh.castShadow = data.id !== "sun";
      mesh.receiveShadow = data.id !== "sun";
      if (data.id === "saturn") {
        mesh.geometry.scale(1, SATURN_POLAR_RATIO, 1);
        // Analytic ring shadows work in every quality preset, without binary alpha shadows.
        mesh.receiveShadow = false;
        mesh.onBeforeRender = () => this.saturnInverse.copy(this.tilted.matrixWorld).invert();
      }
      this.surface.addLevel(mesh, multiple * this.radius);
      this.pickables.push(mesh);
    }
    if (data.id === "earth" && this.material instanceof MeshStandardMaterial) {
      configureNightSide(this.material, this.towardSun);
      const cloudMaterial = new MeshStandardMaterial({
        color: "#ffffff",
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.94,
        alphaTest: 0.015,
        depthWrite: false,
      });
      this.clouds = new Mesh(
        new SphereGeometry(
          data.display.radius * (1 + 12 / data.radiusKm),
          96,
          48,
        ),
        cloudMaterial,
      );
      this.clouds.visible = false;
      this.clouds.castShadow = true;
      this.clouds.receiveShadow = true;
      this.cloudDepth = new MeshDepthMaterial({
        depthPacking: RGBADepthPacking,
        alphaTest: 0.45,
      });
      this.clouds.customDepthMaterial = this.cloudDepth;
      this.tilted.add(this.clouds);
    }
    // Atmospheric limb (all worlds with a profile): bright forward-scattering ring
    // when backlit, thin haze on the day-side limb.
    const limb = atmosphereLimbs[data.id as keyof typeof atmosphereLimbs];
    if (limb) {
      const atmosphere = new Mesh(
        new SphereGeometry(data.display.radius * (1 + Math.max(limb.shellHeight * 1.05, 0.03)), 96, 48),
        createLimbAtmosphereMaterial({
          profile: limb,
          towardSun: this.towardSun,
          irradiance: this.solarLighting.irradianceUniform,
          localPlanetRadius: data.display.radius,
          polarRatio: data.id === "saturn" ? SATURN_POLAR_RATIO : 1,
        }),
      );
      atmosphere.name = `${data.name} atmospheric limb`;
      atmosphere.renderOrder = 2;
      this.tilted.add(atmosphere);
      this.limbAtmosphere = atmosphere;
    }
    const ringAsset = imageryFor(data.id).rings;
    if (data.id === "saturn" && ringAsset) this.createRings(ringAsset);
    this.solarLighting.attach(this.material);
    if (this.clouds) this.solarLighting.attach(this.clouds.material);
    if (this.rings) this.solarLighting.attach(this.rings.material);
    if (data.id === "saturn") {
      configureSaturnLighting(this.material, this.saturnInverse, data.display.radius, false);
      if (this.rings) configureSaturnLighting(this.rings.material, this.saturnInverse, data.display.radius, true);
    }
    // Curated bodies show orbits often; hundreds of minor bodies build theirs on demand.
    this.orbitLine = !data.parentId ? null : minor ? undefined : this.createOrbit();
  }

  /** Orbit line, created on first access for minor bodies; null for the Sun. */
  get orbit(): LineLoop<BufferGeometry, LineBasicMaterial> | null {
    if (this.orbitLine === undefined) {
      this.orbitLine = this.createOrbit();
      this.orbitLine.material.opacity = this.selectedState ? 0.3 : 0.12;
    }
    return this.orbitLine;
  }
  /** True once an orbit line exists (never forces creation). */
  get hasOrbitLine(): boolean {
    return !!this.orbitLine;
  }
  private selectedState = false;
  /** Render culling for sub-pixel minor bodies; set by the engine each frame. */
  culled = false;
  get renderRadius(): number {
    return this.radius;
  }
  /** Enclosing radius for camera clearance; irregular shapes exceed their mean radius. */
  get outerRenderRadius(): number {
    return this.radius * this.shapeExtent;
  }
  /** True when this body is drawn with a published or seeded non-spherical shape. */
  get hasIrregularShape(): boolean {
    return this.shapeParameters !== null || this.shapeModelAsset !== undefined;
  }

  /**
   * Replace the placeholder sphere with the seeded shape once the body is visible
   * (coarse) or inspected (fine). Returns true when geometry was built this call, so
   * the engine can limit synchronous builds to one per frame.
   */
  ensureShape(projectedRadiusPx: number, inspected: boolean): boolean {
    const parameters = this.shapeParameters;
    const mesh = this.shapeMesh;
    if (!parameters || !mesh || this.disposed) return false;
    // A published model is preferred; the seeded shape is only its fallback.
    if (this.shapeModelAsset && !this.failures.has("shape")) return false;
    const detail = inspected || projectedRadiusPx > 120 ? SHAPE_DETAIL.fine
      : projectedRadiusPx > 2 ? SHAPE_DETAIL.coarse : 0;
    if (detail <= this.shapeDetail) return false;
    const geometry = buildIrregularShape({ ...parameters, detail });
    const previous = mesh.geometry;
    mesh.geometry = geometry;
    if (this.usesSharedSphere) {
      this.usesSharedSphere = false;
      releaseMinorBodyGeometry();
    } else previous.dispose();
    if (!mesh.material.vertexColors) {
      mesh.material.vertexColors = true;
      mesh.material.needsUpdate = true;
    }
    // Reach from the body centre (the bounding sphere is centred on the box instead).
    this.shapeExtent = typeof geometry.userData.extent === "number" ? geometry.userData.extent : 1;
    this.shapeDetail = detail;
    return true;
  }
  setRenderRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    this.radius = radius;
    // Child orbital anchors remain outside this scaled group (e.g. the Moon).
    this.tilted.scale.setScalar(radius / this.data.display.radius);
    this.surface.levels.forEach((level, index) => {
      level.distance = radius * [0, 20, 60][index];
    });
    this.sunRenderer?.setRenderRadius(radius);
  }
  updateLighting(sunDirection: Vector3): void {
    if (sunDirection.lengthSq() > 0)
      this.towardSun.copy(sunDirection).normalize();
  }
  get textureStatus(): BodyTextureStatus {
    if (this.data.id === "iss") return { state: "partial", messages: imageryById.iss.missing };
    const missing = imageryFor(this.data.id).missing;
    const messages = [...missing, ...this.failures.values()];
    if (this.loading) return { state: "loading", messages };
    if (this.shapeModel && this.shapeModelAsset)
      return {
        state: "partial",
        messages: [
          `${this.shapeModelAsset.title} (${this.shapeModelAsset.credit}): published shape with a baked visualization texture. Axes follow the model's principal axes; prime meridian and spin phase are approximate.`,
          ...this.failures.values(),
        ],
      };
    if (!imageryFor(this.data.id).surface)
      return { state: "missing", messages };
    if (this.textureSize === 0) return { state: "unloaded", messages };
    if (this.shapeModelAsset && !this.shapeModel && !this.leases.has("surface"))
      return { state: "missing", messages };
    if (this.failures.size > 0 || missing.length > 0)
      return { state: "partial", messages };
    return { state: "ready", messages };
  }
  private createOrbit(): LineLoop<BufferGeometry, LineBasicMaterial> {
    const trueShape = usesTrueOverviewShape(this.data.id) ? generatedOrbits.get(this.data.id) : undefined;
    const points = trueShape ? compressedOrbitPath(trueShape) : Array.from({ length: 256 }, (_, i) => {
      const angle = (i / 256) * Math.PI * 2;
      const z = Math.sin(angle) * this.data.display.orbitRadius;
      return new Vector3(
        Math.cos(angle) * this.data.display.orbitRadius,
        z * Math.sin(this.data.display.inclination),
        z * Math.cos(this.data.display.inclination),
      );
    });
    return new LineLoop(
      new BufferGeometry().setFromPoints(points),
      new LineBasicMaterial({
        color: "#87929f",
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
  }
  private createRings(asset: TextureAsset): void {
    const radialRange = asset.radialRangeKm;
    const inner =
      this.data.display.radius *
      (radialRange ? radialRange[0] / this.data.radiusKm : 1.11);
    const outer =
      this.data.display.radius *
      (radialRange ? radialRange[1] / this.data.radiusKm : 2.33);
    const geometry = new RingGeometry(inner, outer, 256, 1);
    const positions = geometry.getAttribute("position");
    const uvs = geometry.getAttribute("uv");
    for (let index = 0; index < positions.count; index++) {
      const distance = Math.hypot(positions.getX(index), positions.getY(index));
      uvs.setXY(index, (distance - inner) / (outer - inner), 0.5);
    }
    const material = new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
      metalness: 0,
      side: DoubleSide,
      transparent: true,
      alphaTest: 0.001,
      depthWrite: false,
      forceSinglePass: true,
    });
    this.rings = new Mesh(geometry, material);
    this.rings.rotation.x = -Math.PI / 2;
    this.rings.userData.objectId = this.data.id;
    this.rings.castShadow = false;
    this.rings.receiveShadow = false;
    this.rings.onBeforeRender = () => this.saturnInverse.copy(this.tilted.matrixWorld).invert();
    this.rings.visible = false;
    this.tilted.add(this.rings);
    this.pickables.push(this.rings);
  }
  needsTexture(size: number): boolean {
    return !this.disposed && this.textureSize !== size;
  }
  ensureTexture(size: number): Promise<void> {
    if (this.disposed || this.textureSize === size) return this.textureRequest;
    this.textureSize = size;
    const generation = ++this.requestGeneration;
    this.loading = true;
    const imagery = imageryFor(this.data.id);
    const tier = textureTierForHeight(size);
    const tasks = (
      ["surface", "clouds", "night", "normal", "roughness", "rings"] as Layer[]
    ).flatMap((layer) =>
      imagery[layer] && !(this.shapeModelAsset && layer === "surface")
        ? [this.loadLayer(layer, imagery[layer], tier, generation)]
        : [],
    );
    if (this.shapeModelAsset && !this.shapeModel && !this.failures.has("shape"))
      tasks.push(this.loadModel(this.shapeModelAsset, generation, tier));
    this.textureRequest = Promise.all(tasks).then(() => {
      if (!this.disposed && generation === this.requestGeneration)
        this.loading = false;
    });
    return this.textureRequest;
  }
  private async loadModel(asset: ShapeModelAsset, generation: number, tier: TextureTier): Promise<void> {
    try {
      const model = await loadShapeModel(asset);
      if (this.disposed || generation !== this.requestGeneration) {
        model.dispose();
        return;
      }
      // NASA visualization textures are brightness-normalized: keep their relative
      // detail, but set level and hue from the measured albedo and colour.
      if (asset.colorTextureMean && model.material.map) {
        const appearance = bodyAppearance(this.data, {
          irregularOrbit: generatedOrbits.get(this.data.id)?.referencePlane === "ecliptic",
        });
        const mean = asset.colorTextureMean;
        const [r, g, b] = appearance.rgb.map((channel) => Math.min(4, channel / mean));
        model.material.color.setRGB(r, g, b, LinearSRGBColorSpace);
      }
      this.solarLighting.attach(model.material);
      for (const level of this.surface.levels) {
        const mesh = level.object;
        if (!(mesh instanceof Mesh)) continue;
        if (mesh.geometry === sharedMinorGeometry) {
          if (this.usesSharedSphere) {
            this.usesSharedSphere = false;
            releaseMinorBodyGeometry();
          }
        } else mesh.geometry.dispose();
        mesh.geometry = model.geometry;
        mesh.material = model.material;
        // The model is at unit mean radius; LOD spheres were built at display radius.
        mesh.scale.setScalar(this.data.display.radius);
      }
      this.shapeModel = model;
      this.shapeExtent = asset.extent;
      this.failures.delete("shape");
    } catch {
      if (this.disposed || generation !== this.requestGeneration) return;
      this.failures.set("shape", `${asset.title} could not be loaded; ${this.shapeParameters ? "a seeded illustrative shape" : "a sphere"} is shown instead.`);
      const fallback = imageryFor(this.data.id).surface;
      if (fallback) await this.loadLayer("surface", fallback, tier, generation);
    }
  }
  private async loadLayer(
    layer: Layer,
    asset: TextureAsset,
    tier: TextureTier,
    generation: number,
  ): Promise<void> {
    const stages: TextureTier[] =
      !this.leases.has(layer) && tier !== "low" ? ["low", tier] : [tier];
    for (const stage of stages) {
      if (this.disposed || generation !== this.requestGeneration) return;
      try {
        const lease = await scientificTextures.acquire(asset, stage);
        if (this.disposed || generation !== this.requestGeneration) {
          lease.release();
          return;
        }
        this.applyTexture(layer, lease.texture);
        this.leases.get(layer)?.release();
        this.leases.set(layer, lease);
        this.failures.delete(layer);
      } catch (error) {
        if (!this.disposed && generation === this.requestGeneration)
          this.failures.set(
            layer,
            `${asset.title} could not be loaded${this.leases.has(layer) ? "; lower resolution retained" : ""}.`,
          );
        // A stalled connection should not restart the same full timeout at each tier.
        if (error instanceof DOMException && error.name === "TimeoutError")
          return;
      }
    }
  }
  private applyTexture(layer: Layer, texture: Texture): void {
    if (layer === "surface" && this.material) {
      this.material.map = texture;
      this.material.color.set("#ffffff");
      // Newer maps carry their mean brightness: scale them to the measured albedo so
      // dark and bright worlds keep their real relationship (e.g. Charon vs Pluto).
      const mean = imageryFor(this.data.id).surface?.meanLinearLuminance;
      const albedo = measuredAppearance(this.data.id)?.albedo;
      if (mean && albedo) this.material.color.setScalar(Math.min(4, displayAlbedo(albedo) / mean));
      this.material.needsUpdate = true;
    } else if (layer === "clouds" && this.clouds && this.cloudDepth) {
      this.clouds.material.alphaMap = texture;
      this.clouds.material.needsUpdate = true;
      this.cloudDepth.alphaMap = texture;
      this.cloudDepth.needsUpdate = true;
      this.clouds.visible = true;
    } else if (
      layer === "night" &&
      this.material instanceof MeshStandardMaterial
    ) {
      this.material.emissiveMap = texture;
      this.material.emissive.set("#ffffff");
      this.material.emissiveIntensity = 0.48;
      this.material.needsUpdate = true;
    } else if (
      layer === "normal" &&
      this.material instanceof MeshStandardMaterial
    ) {
      this.material.normalMap = texture;
      this.material.normalMapType = TangentSpaceNormalMap;
      this.material.normalScale.set(1, 1);
      this.material.needsUpdate = true;
    } else if (
      layer === "roughness" &&
      this.material instanceof MeshStandardMaterial
    ) {
      this.material.roughnessMap = texture;
      this.material.needsUpdate = true;
    } else if (layer === "rings" && this.rings) {
      this.rings.material.map = texture;
      this.rings.material.needsUpdate = true;
      this.rings.visible = true;
    }
  }
  rotate(days: number, epoch = SIMULATION_EPOCH, modelSunDirection?: Vector3): void {
    if (this.data.id === "earth") {
      const orientation = earthOrientationAt(simulationUtcMs(days, epoch), modelSunDirection);
      this.tilted.quaternion.copy(orientation.poleRotation);
      this.surface.rotation.y = orientation.spinRadians;
      if (this.clouds) this.clouds.rotation.y = orientation.spinRadians;
      return;
    }
    const iauSpin = this.iauOrientation(days, epoch, this.tilted.quaternion);
    if (iauSpin !== null) {
      this.surface.rotation.y = iauSpin;
      if (this.clouds) this.clouds.rotation.y = iauSpin;
      return;
    }
    const period = Math.abs(this.data.rotationPeriodHours) / 24;
    if (period === 0) return;
    // No published rotation model: illustrative obliquity and spin phase.
    // Pole obliquity encodes retrograde spin; cloud composite rotates with the globe.
    this.surface.rotation.y = 0.5 + ((days % period) / period) * Math.PI * 2;
    if (this.clouds) this.clouds.rotation.y = this.surface.rotation.y;
  }

  /**
   * IAU WGCCRE pole (written into `pole`) and spin about the mesh +Y axis at `days`,
   * or null when no rotation model is published for this body. Mesh +X is the IAU
   * prime meridian, matching maps centered on 0 deg longitude with east to the right.
   */
  private iauOrientation(days: number, epoch: string, pole: Quaternion): number | null {
    const angles = iauRotationAngles(this.data.id, utcToTdbMs(simulationUtcMs(days, epoch)));
    if (!angles) return null;
    iauPoleQuaternion(angles.alphaDeg, angles.deltaDeg, pole);
    return iauSpinRadians(angles.wDeg);
  }
  /**
   * Body-fixed → engine rotation at `days`, computed without changing the scene.
   * Earth needs the Sun direction (engine axes) for its pole/spin model.
   */
  rotationAt(days: number, epoch = SIMULATION_EPOCH, sunDirection?: Vector3): Quaternion {
    if (this.data.id === "earth") {
      const orientation = earthOrientationAt(simulationUtcMs(days, epoch), sunDirection);
      return orientation.poleRotation.clone()
        .multiply(new Quaternion().setFromAxisAngle(Y_AXIS, orientation.spinRadians));
    }
    const pole = new Quaternion();
    const iauSpin = this.iauOrientation(days, epoch, pole);
    if (iauSpin !== null) return pole.multiply(new Quaternion().setFromAxisAngle(Y_AXIS, iauSpin));
    const period = Math.abs(this.data.rotationPeriodHours) / 24;
    const spin = period === 0 ? this.surface.rotation.y : 0.5 + ((days % period) / period) * Math.PI * 2;
    return this.tilted.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(Y_AXIS, spin));
  }

  /**
   * Inside a giant planet's atmosphere the local cloud deck replaces the globe and its
   * limb glow; rings (children of the tilted frame) stay visible overhead.
   */
  setAtmosphericInterior(inside: boolean): void {
    this.surface.visible = !inside;
    if (this.limbAtmosphere) this.limbAtmosphere.visible = !inside;
  }

  setSelected(selected: boolean): void {
    this.selectedState = selected;
    if (this.orbitLine) this.orbitLine.material.opacity = selected ? 0.3 : 0.12;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.requestGeneration++;
    if (this.sunRenderer) {
      this.tilted.remove(this.sunRenderer.surface, this.sunRenderer.corona);
      this.sunRenderer.dispose();
    }
    const materials = new Set<Material>();
    const geometries = new Set<BufferGeometry>();
    this.tilted.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      if (node.geometry !== this.shapeModel?.geometry && node.geometry !== sharedMinorGeometry)
        geometries.add(node.geometry);
      (Array.isArray(node.material) ? node.material : [node.material]).forEach(
        (material) => {
          if (material !== this.shapeModel?.material) materials.add(material);
        },
      );
    });
    geometries.forEach((geometry) => geometry.dispose());
    if (this.usesSharedSphere) releaseMinorBodyGeometry();
    this.usesSharedSphere = false;
    this.cloudDepth?.dispose();
    materials.forEach((material) => material.dispose());
    if (this.material && !materials.has(this.material)) this.material.dispose();
    this.shapeModel?.dispose();
    this.leases.forEach((lease) => lease.release());
    this.leases.clear();
    this.orbitLine?.geometry.dispose();
    this.orbitLine?.material.dispose();
  }
}
