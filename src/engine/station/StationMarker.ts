import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";

/** Lightweight, explicitly illustrative marker. The visit loads NASA's detailed model. */
export function createStationMarker(radius: number): Group {
  const root = new Group();
  const metal = new MeshStandardMaterial({ color: "#d4d7d5", roughness: 0.65 });
  const panel = new MeshStandardMaterial({ color: "#8c6d36", roughness: 0.7, metalness: 0.25 });
  const truss = new Mesh(new BoxGeometry(85, 1, 1), metal);
  root.add(truss);
  const core = new Mesh(new CylinderGeometry(2.2, 2.2, 32, 16), metal);
  core.rotation.x = Math.PI / 2;
  root.add(core);
  for (const x of [-45, -31, 31, 45]) {
    for (const z of [-14, 14]) {
      const wing = new Mesh(new BoxGeometry(9, 0.12, 24), panel);
      wing.position.set(x, 0, z);
      root.add(wing);
    }
  }
  root.scale.setScalar(radius / 56);
  root.traverse((node) => { if (node instanceof Mesh) node.userData.objectId = "iss"; });
  return root;
}
