import {
  BufferGeometry, Color, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, Vector3,
} from "three";
import type { ObjectId, Quality } from "../../types/celestial";
import type { TerrainDataProvider } from "../../types/terrain";
import { cartesianToGeodetic } from "./coordinates";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { configureSurfaceDetail, SurfaceDetailMaps } from "./SurfaceDetailMaterial";
import { hexToLinear, surfaceProfileFor, type SurfaceProfile } from "../../data/surfaceProfiles";
import type { Linear } from "./siteColor";
import type { SurfaceAtmosphere } from "../effects/SurfaceAtmosphere";

const UP = new Vector3(0, 1, 0);
const ROCK_RADIUS_M = 65;
const RECENTER_M = 28;
const ROCK_COUNTS = { low: 90, medium: 180, high: 320 } as const;
/** Instance capacity: dense classes (rubble piles, Titan's pebbles) exceed the preset count. */
const MAX_ROCKS = 480;

function rockCount(quality: Quality, mobile: boolean): number {
  return ROCK_COUNTS[mobile || quality === "low" ? "low" : quality === "high" ? "high" : "medium"];
}

function siteSeed(bodyId: ObjectId, anchor: Vector3): number {
  let hash = 2166136261;
  for (const character of bodyId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  for (const component of anchor.toArray()) hash = Math.imul(hash ^ Math.round(component / RECENTER_M), 16777619);
  return hash >>> 0;
}

function randomSequence(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Display-scale stones. Their placements are generated, never mapped observations. */
export class SurfaceScatter {
  readonly group = new Group();
  readonly rocks: InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  private readonly detailMaps = new SurfaceDetailMaps();
  private readonly anchor = new Vector3();
  private initialized = false;
  private disposed = false;
  private count: number;
  /** Surface class for synthesized sites; undefined keeps the dedicated Moon/Mars/Earth rocks. */
  private readonly profile: SurfaceProfile | undefined;
  private groundLinear: Linear = [0.2, 0.2, 0.2];

  constructor(private readonly provider: TerrainDataProvider, quality: Quality, mobile: boolean, atmosphere?: SurfaceAtmosphere) {
    this.profile = surfaceProfileFor(provider.manifest.bodyId);
    if (this.profile) this.groundLinear = hexToLinear(this.profile.groundColor);
    // Weld before recalculating normals: nonindexed icosahedra otherwise shade as flat facets.
    const source = new IcosahedronGeometry(1, 3);
    source.deleteAttribute("normal");
    source.deleteAttribute("uv");
    const geometry = mergeVertices(source);
    source.dispose();
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      // Rounded fracture faces instead of a uniformly spherical pebble silhouette.
      const exponent = this.profile?.rocks.shapeExponent ?? (provider.manifest.bodyId === "mars" ? 4 : 2.8);
      const face = 1 / Math.pow(Math.abs(x) ** exponent + Math.abs(y) ** exponent + Math.abs(z) ** exponent, 1 / exponent);
      const variation = 0.88 + 0.11 * Math.sin(x * 5.3 + z * 3.7 + y * 4.1)
        + 0.045 * Math.sin(x * 13.1 - z * 9.4 + y * 7.3);
      positions.setXYZ(i, x * variation * face, Math.max(-0.7, y * variation * face), z * variation * face);
    }
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
    configureSurfaceDetail(material, this.detailMaps, new Vector3(), provider.manifest.bodyId, true);
    atmosphere?.configure(material);
    // The neutral shaded geometry remains usable if the optional texture cannot load.
    void this.detailMaps.load(true, mobile || quality === "low", quality === "high").catch(() => undefined);
    this.rocks = new InstancedMesh(geometry, material, MAX_ROCKS);
    this.rocks.name = `${provider.manifest.bodyId} illustrative surface stones`;
    this.rocks.castShadow = this.rocks.receiveShadow = true;
    this.rocks.frustumCulled = false;
    this.count = this.scaledCount(quality, mobile);
    this.rocks.count = this.count;
    this.group.visible = false;
    this.group.add(this.rocks);
  }

  setQuality(quality: Quality, mobile: boolean): void {
    void this.detailMaps.load(true, mobile || quality === "low", quality === "high").catch(() => undefined);
    this.count = this.scaledCount(quality, mobile);
    this.rocks.count = this.count;
    if (this.initialized) this.placeRocks();
  }

  private scaledCount(quality: Quality, mobile: boolean): number {
    const density = this.profile?.rocks.density ?? 1;
    return Math.min(MAX_ROCKS, Math.round(rockCount(quality, mobile) * density));
  }

  /** Landing-site ground colour from the global map: rocks take related colours. */
  setGroundColor(linear: Linear): void {
    if (!this.profile || this.disposed) return;
    this.groundLinear = linear;
    if (this.initialized) this.placeRocks();
  }

  update(observerM: Vector3, altitudeM: number): void {
    if (this.disposed) return;
    this.group.visible = altitudeM < 250;
    if (!this.group.visible) return;
    if (!this.initialized || this.anchor.distanceTo(observerM) > RECENTER_M) {
      const direction = observerM.clone().normalize();
      const coordinates = cartesianToGeodetic(direction, 1);
      const height = this.provider.sampleHeight(coordinates.latDeg, coordinates.lonDeg).heightM;
      this.anchor.copy(direction).multiplyScalar(this.provider.manifest.radiusM + height);
      this.placeRocks();
      this.initialized = true;
    }
    this.group.position.copy(this.anchor).sub(observerM);
  }

  private placeRocks(): void {
    const coordinates = cartesianToGeodetic(this.anchor, this.provider.manifest.radiusM);
    const lon = coordinates.lonDeg * Math.PI / 180;
    const radial = this.anchor.clone().normalize();
    const east = new Vector3(-Math.sin(lon), 0, -Math.cos(lon));
    const north = new Vector3().crossVectors(radial, east).normalize();
    const random = randomSequence(siteSeed(this.provider.manifest.bodyId, this.anchor));
    const martian = this.provider.manifest.bodyId === "mars";
    const base = new Color(martian ? "#7d746c"
      : this.provider.manifest.bodyId === "moon" ? "#656563"
      : this.provider.manifest.bodyId === "earth" ? "#978976" : "#96918b");
    const direction = new Vector3(), position = new Vector3(), scale = new Vector3();
    const orientation = new Quaternion(), spin = new Quaternion();
    const matrix = new Matrix4(), color = new Color();
    const population = this.profile?.rocks;
    for (let i = 0; i < this.count; i++) {
      const angle = random() * Math.PI * 2;
      const range = population?.rangeM ?? ROCK_RADIUS_M;
      // Small pebble fields start closer to the observer than metre-scale blocks.
      let distance = (population ? Math.min(1.8, range * 0.08) : 1.8) + random() ** 0.7 * (i < 12 ? Math.min(14, range) : range);
      // Class populations draw the size first so a boulder's footprint never covers the
      // landing point; the dedicated Moon/Mars/Earth sequence keeps its original order.
      const populationWidth = population
        ? population.minWidthM + (population.maxWidthM - population.minWidthM) * random() ** population.sizeExponent
        : 0;
      if (population) distance = Math.max(distance, populationWidth * 0.8 + 1.2);
      direction.copy(radial).multiplyScalar(this.provider.manifest.radiusM)
        .addScaledVector(east, Math.cos(angle) * distance)
        .addScaledVector(north, Math.sin(angle) * distance).normalize();
      const geo = cartesianToGeodetic(direction, 1);
      const height = this.provider.sampleHeight(geo.latDeg, geo.lonDeg).heightM;
      const width = population ? populationWidth : 0.055 + (martian ? 1.1 : 0.7) * random() ** 5;
      const depth = width * (0.55 + random() * 0.7);
      const rockHeight = population
        ? width * (population.flatness[0] + random() * (population.flatness[1] - population.flatness[0]))
        : width * (martian ? 0.18 + random() * 0.38 : 0.35 + random() * 0.55);
      position.copy(direction).multiplyScalar(this.provider.manifest.radiusM + height + rockHeight * 0.25).sub(this.anchor);
      orientation.setFromUnitVectors(UP, direction);
      spin.setFromAxisAngle(UP, random() * Math.PI * 2);
      orientation.multiply(spin);
      scale.set(width, rockHeight, depth);
      matrix.compose(position, orientation, scale);
      this.rocks.setMatrixAt(i, matrix);
      if (population) {
        const shade = population.brightness * (1 + population.brightnessSpread * (random() - 0.5) * 2);
        color.setRGB(...this.groundLinear).multiplyScalar(Math.max(0.05, shade));
      } else color.copy(base).multiplyScalar(0.78 + random() * 0.45);
      this.rocks.setColorAt(i, color);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rocks.geometry.dispose();
    this.rocks.material.dispose();
    this.detailMaps.dispose();
    this.group.clear();
  }
}
