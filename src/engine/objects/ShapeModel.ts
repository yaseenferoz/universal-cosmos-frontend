import { BufferGeometry, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ShapeModelAsset } from "../../data/shapeModels";

export interface LoadedShapeModel {
  /** Unit volume-equivalent radius, principal axes on X (longest), Y (shortest), Z. */
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  dispose(): void;
}

/** Eigen-decomposition of a symmetric 3×3 matrix by cyclic Jacobi rotations. */
export function symmetricEigen(input: number[][]): { values: number[]; vectors: Vector3[] } {
  const a = input.map((row) => [...row]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-24) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: [0, 1, 2].map((column) => new Vector3(v[0][column], v[1][column], v[2][column]).normalize()),
  };
}

function triangleIndices(geometry: BufferGeometry): ArrayLike<number> {
  const index = geometry.getIndex();
  if (index) return index.array;
  return Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i);
}

/**
 * Re-express a closed mesh in principal axes (longest → +X, shortest → +Y spin axis,
 * intermediate → +Z), centred on its volume centroid and scaled to unit
 * volume-equivalent radius. The rotation is proper, so the model is never mirrored;
 * the sign of each axis is not physically determined (prime meridian approximate).
 */
export function normalizeShapeGeometry(geometry: BufferGeometry): { semiAxes: [number, number, number]; extent: number } {
  const position = geometry.getAttribute("position");
  const indices = triangleIndices(geometry);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), cross = new Vector3();
  let volume = 0;
  const centroid = new Vector3();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    a.fromBufferAttribute(position, indices[i]);
    b.fromBufferAttribute(position, indices[i + 1]);
    c.fromBufferAttribute(position, indices[i + 2]);
    const signed = a.dot(cross.crossVectors(b, c)) / 6;
    volume += signed;
    centroid.addScaledVector(a.clone().add(b).add(c), signed / 4);
  }
  if (!(Math.abs(volume) > 0)) throw new Error("Shape model is not a closed volume.");
  centroid.divideScalar(volume);
  const radius = Math.cbrt((3 * Math.abs(volume)) / (4 * Math.PI));
  const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(centroid);
    const v = [p.x, p.y, p.z];
    for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) covariance[r][s] += v[r] * v[s];
  }
  const { values, vectors } = symmetricEigen(covariance);
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
  const long = vectors[order[0]], middle = vectors[order[1]], short = vectors[order[2]];
  // Rows: new X = long, new Y = short (spin), new Z = middle; keep det = +1.
  if (new Vector3().crossVectors(long, short).dot(middle) < 0) middle.negate();
  const rotation = new Matrix4().set(
    long.x, long.y, long.z, 0,
    short.x, short.y, short.z, 0,
    middle.x, middle.y, middle.z, 0,
    0, 0, 0, 1,
  );
  geometry.applyMatrix4(new Matrix4().makeTranslation(-centroid.x, -centroid.y, -centroid.z));
  geometry.applyMatrix4(rotation);
  geometry.scale(1 / radius, 1 / radius, 1 / radius);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const box = geometry.boundingBox!;
  let extent = 0;
  for (let i = 0; i < position.count; i++) extent = Math.max(extent, p.fromBufferAttribute(position, i).length());
  return {
    semiAxes: [(box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2, (box.max.y - box.min.y) / 2],
    extent,
  };
}

/** Load an installed NASA visualization model at unit mean radius in principal axes. */
export async function loadShapeModel(asset: ShapeModelAsset): Promise<LoadedShapeModel> {
  const gltf = await new GLTFLoader().loadAsync(asset.url);
  gltf.scene.updateMatrixWorld(true);
  let source: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;
  gltf.scene.traverse((node) => {
    if (!source && node instanceof Mesh && node.material instanceof MeshStandardMaterial)
      source = node as Mesh<BufferGeometry, MeshStandardMaterial>;
  });
  if (!source) throw new Error(`${asset.title} has no supported surface mesh.`);
  const mesh: Mesh<BufferGeometry, MeshStandardMaterial> = source;
  const geometry = mesh.geometry;
  geometry.applyMatrix4(mesh.matrixWorld);
  normalizeShapeGeometry(geometry);
  const material = mesh.material;
  // Regolith: diffuse-dominated. Source atlases carry baked illumination.
  material.metalness = 0;
  material.roughness = 1;
  material.needsUpdate = true;
  return {
    geometry,
    material,
    dispose() {
      geometry.dispose();
      material.map?.dispose();
      material.normalMap?.dispose();
      material.dispose();
    },
  };
}
