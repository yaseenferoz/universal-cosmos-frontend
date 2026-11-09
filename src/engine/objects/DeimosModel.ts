import { BufferGeometry, Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface DeimosModel {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  dispose(): void;
}

/**
 * NASA/JPL-Caltech Deimos model, https://science.nasa.gov/resource/deimos-mars-moon-3d-model/.
 * Source vertex extents are about 15.0 x 11.9 x 10.5 units, treated as km.
 * Its atlas and geometry must stay together; the separate JPL equirectangular
 * mosaic does not match these UVs. The atlas has baked source illumination.
 */
export async function loadDeimosModel(
  displayRadius: number,
  meanRadiusKm: number,
): Promise<DeimosModel> {
  const gltf = await new GLTFLoader().loadAsync("/models/deimos-nasa.glb");
  let source: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;
  gltf.scene.traverse((node) => {
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial)
      source = node as Mesh<BufferGeometry, MeshStandardMaterial>;
  });
  if (!source) throw new Error("The Deimos model has no supported surface mesh.");
  const mesh: Mesh<BufferGeometry, MeshStandardMaterial> = source;
  const geometry = mesh.geometry;
  geometry.center();
  geometry.scale(
    displayRadius / meanRadiusKm,
    displayRadius / meanRadiusKm,
    displayRadius / meanRadiusKm,
  );
  geometry.computeBoundingSphere();
  const material = mesh.material;
  material.metalness = 0;
  material.roughness = 1;
  material.needsUpdate = true;
  return {
    geometry,
    material,
    dispose() {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
  };
}
