import {
  BufferGeometry, Color, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, Vector3,
} from "three";
import type { ObjectId, Quality } from "../../types/celestial";
import type { TerrainDataProvider } from "../../types/terrain";
import { cartesianToGeodetic } from "./coordinates";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { configureSurfaceDetail, SurfaceDetailMaps } from "./SurfaceDetailMaterial";

const UP = new Vector3(0, 1, 0);
const ROCK_RADIUS_M = 65;
const RECENTER_M = 28;
const ROCK_COUNTS = { low: 90, medium: 180, high: 320 } as const;

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

  constructor(private readonly provider: TerrainDataProvider, quality: Quality, mobile: boolean) {
    // Weld before recalculating normals: nonindexed icosahedra otherwise shade as flat facets.
    const source = new IcosahedronGeometry(1, 3);
    source.deleteAttribute("normal");
    source.deleteAttribute("uv");
    const geometry = mergeVertices(source);
    source.dispose();
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const variation = 0.88 + 0.11 * Math.sin(x * 5.3 + z * 3.7 + y * 4.1)
        + 0.045 * Math.sin(x * 13.1 - z * 9.4 + y * 7.3);
      positions.setXYZ(i, x * variation, Math.max(-0.7, y * variation), z * variation);
    }
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
    configureSurfaceDetail(material, this.detailMaps, new Vector3(), provider.manifest.bodyId, true);
    // The neutral shaded geometry remains usable if the optional texture cannot load.
    void this.detailMaps.load(true, mobile || quality === "low").catch(() => undefined);
    this.rocks = new InstancedMesh(geometry, material, ROCK_COUNTS.high);
    this.rocks.name = `${provider.manifest.bodyId} illustrative surface stones`;
    this.rocks.castShadow = this.rocks.receiveShadow = true;
    this.rocks.frustumCulled = false;
    this.count = rockCount(quality, mobile);
    this.rocks.count = this.count;
    this.group.visible = false;
    this.group.add(this.rocks);
  }

  setQuality(quality: Quality, mobile: boolean): void {
    this.count = rockCount(quality, mobile);
    this.rocks.count = this.count;
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
    const base = new Color(this.provider.manifest.bodyId === "mars" ? "#9f7256"
      : this.provider.manifest.bodyId === "earth" ? "#978976" : "#96918b");
    const direction = new Vector3(), position = new Vector3(), scale = new Vector3();
    const orientation = new Quaternion(), spin = new Quaternion();
    const matrix = new Matrix4(), color = new Color();
    for (let i = 0; i < this.count; i++) {
      const angle = random() * Math.PI * 2;
      const distance = 1.5 + Math.sqrt(random()) * ROCK_RADIUS_M;
      direction.copy(radial).multiplyScalar(this.provider.manifest.radiusM)
        .addScaledVector(east, Math.cos(angle) * distance)
        .addScaledVector(north, Math.sin(angle) * distance).normalize();
      const geo = cartesianToGeodetic(direction, 1);
      const height = this.provider.sampleHeight(geo.latDeg, geo.lonDeg).heightM;
      const width = 0.08 + 0.7 * random() ** 5;
      const depth = width * (0.55 + random() * 0.7);
      const rockHeight = width * (0.35 + random() * 0.55);
      position.copy(direction).multiplyScalar(this.provider.manifest.radiusM + height + rockHeight * 0.25).sub(this.anchor);
      orientation.setFromUnitVectors(UP, direction);
      spin.setFromAxisAngle(UP, random() * Math.PI * 2);
      orientation.multiply(spin);
      scale.set(width, rockHeight, depth);
      matrix.compose(position, orientation, scale);
      this.rocks.setMatrixAt(i, matrix);
      color.copy(base).multiplyScalar(0.78 + random() * 0.45);
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
