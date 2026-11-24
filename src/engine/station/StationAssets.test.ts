import { expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { disposeStationObject } from "./StationAssets";

it("releases shared station geometry, material arrays and texture slots exactly once", () => {
  const root = new Group();
  const geometry = new BoxGeometry();
  const map = new Texture();
  const material = new MeshStandardMaterial({ map, roughnessMap: map });
  const other = new MeshStandardMaterial({ map });
  root.add(new Mesh(geometry, material), new Mesh(geometry, [material, other]));
  const geometryDispose = vi.spyOn(geometry, "dispose");
  const textureDispose = vi.spyOn(map, "dispose");
  const materialDispose = vi.spyOn(material, "dispose");
  const otherDispose = vi.spyOn(other, "dispose");
  disposeStationObject(root);
  for (const dispose of [geometryDispose, textureDispose, materialDispose, otherDispose]) expect(dispose).toHaveBeenCalledTimes(1);
});
