import {
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  LOD,
  Material,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RingGeometry,
  RGBADepthPacking,
  SphereGeometry,
  TangentSpaceNormalMap,
  Texture,
  Vector3,
} from "three";
import { imageryById, type TextureAsset } from "../../data/imagery";
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
  createAtmosphereMaterial,
} from "./PlanetShaders";
import { SunRenderer } from "../solar/SunRenderer";
import { SolarMaterialLighting } from "../solar/PlanetSolarLighting";
import { configureVenusClouds } from "./VenusClouds";

type Layer = "surface" | "clouds" | "night" | "normal" | "roughness" | "rings";
export interface BodyTextureStatus {
  state: "unloaded" | "loading" | "ready" | "partial" | "missing";
  messages: string[];
}

/** A body's geometry can change display scale without changing its physical catalog data. */
export class CelestialBody {
  readonly anchor = new Group();
  readonly tilted = new Group();
  readonly surface = new LOD();
  readonly pickables: Mesh[] = [];
  readonly orbit: LineLoop<BufferGeometry, LineBasicMaterial> | null;
  private readonly material: MeshStandardMaterial | null;
  private readonly towardSun = new Vector3(1, 0, 0);
  readonly solarLighting = new SolarMaterialLighting(this.towardSun);
  readonly sunRenderer: SunRenderer | null;
  private readonly leases = new Map<Layer, TextureLease>();
  private readonly failures = new Map<Layer, string>();
  private clouds: Mesh<SphereGeometry, MeshStandardMaterial> | null = null;
  private rings: Mesh<RingGeometry, MeshStandardMaterial> | null = null;
  private cloudDepth: MeshDepthMaterial | null = null;
  private ringDepth: MeshDepthMaterial | null = null;
  private textureSize = 0;
  private requestGeneration = 0;
  private textureRequest: Promise<void> = Promise.resolve();
  private loading = false;
  private disposed = false;
  private radius: number;

  constructor(readonly data: CelestialObject) {
    this.radius = data.display.radius;
    this.anchor.name = data.id;
    this.anchor.add(this.tilted);
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
      this.orbit = null;
      return;
    }
    // Missing measurements remain disclosed; Venus has an explicit cloud reconstruction.
    this.material = new MeshStandardMaterial({
      color: "#777b80",
      roughness: 1,
      metalness: 0,
    });
    if (data.id === "venus") configureVenusClouds(this.material);
    const surfaceAsset = imageryById[data.id].surface;
    if (
      surfaceAsset?.partialCoverage &&
      this.material instanceof MeshStandardMaterial
    ) {
      configurePartialCoverage(this.material, data.id === "neptune" ? "#82b9b8" : data.id === "uranus" ? "#b5d5d3" : "#777b80", data.id === "neptune" ? 0.73 : 1);
    }
    for (const [segments, multiple] of [
      [128, 0],
      [48, 20],
      [20, 60],
    ]) {
      const mesh = new Mesh(
        new SphereGeometry(data.display.radius, segments, segments / 2),
        this.material,
      );
      mesh.userData.objectId = data.id;
      mesh.castShadow = data.id !== "sun";
      mesh.receiveShadow = data.id !== "sun";
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
      const atmosphere = new Mesh(
        new SphereGeometry(
          data.display.radius * (1 + 80 / data.radiusKm),
          96,
          48,
        ),
        createAtmosphereMaterial(this.towardSun),
      );
      atmosphere.renderOrder = 2;
      this.tilted.add(atmosphere);
    }
    const ringAsset = imageryById[data.id].rings;
    if (data.id === "saturn" && ringAsset) this.createRings(ringAsset);
    this.solarLighting.attach(this.material);
    if (this.clouds) this.solarLighting.attach(this.clouds.material);
    if (this.rings) this.solarLighting.attach(this.rings.material);
    this.orbit = data.parentId ? this.createOrbit() : null;
  }

  get renderRadius(): number {
    return this.radius;
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
    const missing = imageryById[this.data.id].missing;
    const messages = [...missing, ...this.failures.values()];
    if (this.loading) return { state: "loading", messages };
    if (!imageryById[this.data.id].surface)
      return { state: "missing", messages };
    if (this.textureSize === 0) return { state: "unloaded", messages };
    if (this.failures.size > 0 || missing.length > 0)
      return { state: "partial", messages };
    return { state: "ready", messages };
  }
  private createOrbit(): LineLoop<BufferGeometry, LineBasicMaterial> {
    const points = Array.from({ length: 256 }, (_, i) => {
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
    const geometry = new RingGeometry(inner, outer, 192, 1);
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
      alphaTest: 0.025,
      depthWrite: true,
    });
    this.rings = new Mesh(geometry, material);
    this.rings.rotation.x = -Math.PI / 2;
    this.rings.userData.objectId = this.data.id;
    this.rings.castShadow = true;
    this.rings.receiveShadow = true;
    this.rings.visible = false;
    // Alpha-tested shadows approximate the measured profile's opacity, not a solid annulus.
    this.ringDepth = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
      side: DoubleSide,
      alphaTest: 0.15,
    });
    this.rings.customDepthMaterial = this.ringDepth;
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
    const imagery = imageryById[this.data.id];
    const tier = textureTierForHeight(size);
    const tasks = (
      ["surface", "clouds", "night", "normal", "roughness", "rings"] as Layer[]
    ).flatMap((layer) =>
      imagery[layer]
        ? [this.loadLayer(layer, imagery[layer], tier, generation)]
        : [],
    );
    this.textureRequest = Promise.all(tasks).then(() => {
      if (!this.disposed && generation === this.requestGeneration)
        this.loading = false;
    });
    return this.textureRequest;
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
    } else if (layer === "rings" && this.rings && this.ringDepth) {
      this.rings.material.map = texture;
      this.rings.material.needsUpdate = true;
      this.ringDepth.map = texture;
      this.ringDepth.needsUpdate = true;
      this.rings.visible = true;
    }
  }
  rotate(days: number): void {
    const period = Math.abs(this.data.rotationPeriodHours) / 24;
    if (period === 0) return;
    // Pole obliquity encodes retrograde spin; cloud composite rotates with the globe.
    this.surface.rotation.y = 0.5 + ((days % period) / period) * Math.PI * 2;
    if (this.clouds) this.clouds.rotation.y = this.surface.rotation.y;
  }
  setSelected(selected: boolean): void {
    if (this.orbit) this.orbit.material.opacity = selected ? 0.3 : 0.12;
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
    this.tilted.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      (Array.isArray(node.material) ? node.material : [node.material]).forEach(
        (material) => materials.add(material),
      );
    });
    this.cloudDepth?.dispose();
    this.ringDepth?.dispose();
    materials.forEach((material) => material.dispose());
    this.leases.forEach((lease) => lease.release());
    this.leases.clear();
    this.orbit?.geometry.dispose();
    this.orbit?.material.dispose();
  }
}
