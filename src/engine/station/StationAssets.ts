import { Box3, Euler, Group, Light, Material, Mesh, MeshPhongMaterial, SRGBColorSpace, Texture, Vector3, LoadingManager, DoubleSide } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { stationModules } from "./StationLayout";

export function disposeStationObject(root: Group): void {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const geometries = new Set<Mesh["geometry"]>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  textures.forEach((texture) => {
    // GLTFLoader can use ImageBitmap, whose memory isn't released by texture.dispose().
    const source: unknown = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
    texture.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export async function loadStationExterior(signal: AbortSignal): Promise<Group> {
  const response = await fetch("/models/iss-nasa.glb", { signal });
  if (!response.ok) throw new Error("NASA exterior model could not be loaded.");
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "/models/");
  const root = gltf.scene;
  if (signal.aborted) { disposeStationObject(root); signal.throwIfAborted(); }
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  root.position.sub(center);
  const wrapper = new Group();
  wrapper.add(root);
  wrapper.scale.setScalar(109 / Math.max(size.x, size.y, size.z));
  return wrapper;
}

/** Preserve the NASA simulator geometry and registered transforms; load only on entry. */
export async function loadStationInterior(signal: AbortSignal, progress: (message: string) => void): Promise<Group> {
  const root = new Group();
  root.rotation.x = Math.PI / 2;
  root.position.y = 4.85;
  try {
    for (const module of stationModules) {
      signal.throwIfAborted();
      progress(`Loading ${module.name} (${stationModules.indexOf(module) + 1}/7)…`);
      const response = await fetch(`/models/iss-interior/${module.id}.dae`, { signal });
      if (!response.ok) throw new Error(`${module.name} model could not be loaded.`);
      const xml = await response.text();
      const manager = new LoadingManager();
      let textureFailed = false;
      const ready = new Promise<void>((resolve) => { manager.onLoad = resolve; });
      manager.onError = () => { textureFailed = true; };
      // Sentinel keeps onLoad reliable even when a model has no textures.
      manager.itemStart("module");
      const parsed = new ColladaLoader(manager).parse(xml, "/models/iss-interior/");
      if (!parsed) throw new Error(`${module.name} model is invalid.`);
      const model = parsed.scene;
      const placement = new Group();
      root.add(placement); placement.add(model);
      // ColladaLoader applies Z_UP -> Y_UP. URDF transforms use the native Z_UP frame.
      model.rotation.set(0, 0, 0);
      placement.position.set(...module.origin);
      placement.quaternion.setFromEuler(new Euler(module.rpy[0], module.rpy[1], module.rpy[2], "ZYX"));
      placement.scale.setScalar(module.scale);
      const remove: Light[] = [];
      model.traverse((node) => {
        if (node instanceof Light) remove.push(node);
        if (!(node instanceof Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          material.side = DoubleSide;
          if (material.name === "Cupola_Glass") {
            material.transparent = true; material.opacity = 0.08; material.depthWrite = false;
          }
          if (material instanceof MeshPhongMaterial) {
            material.shininess = 8;
            material.specular.setScalar(0.06);
            if (material.map) { material.map.colorSpace = SRGBColorSpace; material.map.anisotropy = 4; }
            // IGOAL packs window openings into the diffuse alpha channel.
            // Cutouts must write depth only where the cabin geometry is opaque.
            if (material.name === "Cupola_Diffuse") {
              material.transparent = false; material.alphaTest = 0.5;
              // IGOAL packs painted stars AND closed shutter faces into four islands.
              // Hide these pane/shutter islands for an open-window observation view;
              // cabin frames/hardware retain their original NASA texture coordinates.
              material.onBeforeCompile = (shader) => {
                shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `
                  #include <alphatest_fragment>
                  #ifdef USE_MAP
                    bool sidePane = vMapUv.x > 0.17 && vMapUv.x < 0.335 && vMapUv.y < 0.166;
                    bool centerPane = vMapUv.x > 0.51 && vMapUv.x < 0.67 && vMapUv.y < 0.19;
                    bool sideShutter = vMapUv.x < 0.17 && vMapUv.y < 0.166;
                    bool centerShutter = vMapUv.x > 0.335 && vMapUv.x < 0.51 && vMapUv.y < 0.19;
                    if (sidePane || centerPane || sideShutter || centerShutter) discard;
                  #endif
                `);
              };
              material.customProgramCacheKey = () => "iss-cupola-open-window-islands-v2";
            }
          }
        }
      });
      remove.forEach((light) => light.removeFromParent());
      manager.itemEnd("module");
      await ready;
      signal.throwIfAborted();
      if (textureFailed) throw new Error(`${module.name} texture failed to load. Please retry the interior.`);
    }
    return root;
  } catch (error) {
    disposeStationObject(root);
    throw error;
  }
}
