import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BoxGeometry, Matrix4, Quaternion, Vector3 } from "three";
import { measuredAppearance } from "../../data/bodyAppearance";
import { shapeModelFor, shapeModelIds } from "../../data/shapeModels";
import { normalizeShapeGeometry, symmetricEigen } from "./ShapeModel";

describe("principal-axis normalization of shape models", () => {
  it("diagonalizes a symmetric matrix", () => {
    const { values, vectors } = symmetricEigen([[4, 1, 0], [1, 3, 0], [0, 0, 1]]);
    const sorted = [...values].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(1, 10);
    expect(sorted[1]).toBeCloseTo(3.5 - Math.sqrt(5) / 2, 10);
    expect(sorted[2]).toBeCloseTo(3.5 + Math.sqrt(5) / 2, 10);
    vectors.forEach((v) => expect(v.length()).toBeCloseTo(1, 10));
  });

  it("puts the long axis on +X and the short (spin) axis on +Y without mirroring", () => {
    // A 4 x 1 x 2 box, arbitrarily rotated and displaced, with one marked corner.
    const box = new BoxGeometry(4, 1, 2);
    const turn = new Quaternion().setFromEuler({ x: 0.7, y: -1.1, z: 0.4, order: "XYZ" } as never);
    box.applyMatrix4(new Matrix4().compose(new Vector3(5, -3, 2), turn, new Vector3(1, 1, 1)));
    const { semiAxes, extent } = normalizeShapeGeometry(box);
    const radius = Math.cbrt((3 * 8) / (4 * Math.PI));
    expect(semiAxes[0]).toBeCloseTo(2 / radius, 5);
    expect(semiAxes[1]).toBeCloseTo(1 / radius, 5);
    expect(semiAxes[2]).toBeCloseTo(0.5 / radius, 5);
    expect(extent).toBeCloseTo(Math.hypot(2, 0.5, 1) / radius, 5);
    const size = box.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(size.z);
    expect(size.z).toBeGreaterThan(size.y);
    // Proper rotation: the triple product of the box's edge directions keeps its sign.
    const p = box.getAttribute("position");
    const corner = (i: number) => new Vector3().fromBufferAttribute(p, i);
    const volumeSign = Math.sign(corner(0).clone().sub(corner(1)).cross(corner(2).clone().sub(corner(1))).dot(corner(4).clone().sub(corner(1))));
    const reference = new BoxGeometry(4, 1, 2).getAttribute("position");
    const ref = (i: number) => new Vector3().fromBufferAttribute(reference, i);
    expect(volumeSign).toBe(Math.sign(ref(0).clone().sub(ref(1)).cross(ref(2).clone().sub(ref(1))).dot(ref(4).clone().sub(ref(1)))));
  });
});

describe("installed NASA shape models", () => {
  it("are compact glTF binaries with web-encoded textures", () => {
    expect(shapeModelIds()).toEqual(expect.arrayContaining(["eros", "bennu", "itokawa", "vesta", "phobos", "deimos"]));
    for (const id of shapeModelIds()) {
      const asset = shapeModelFor(id)!;
      const file = readFileSync(new URL(`../../../public${asset.url}`, import.meta.url));
      expect(file.toString("ascii", 0, 4), id).toBe("glTF");
      expect(file.length, id).toBe(asset.bytes);
      expect(file.length, id).toBeLessThan(2_500_000);
      const jsonLength = file.readUInt32LE(12);
      const gltf = JSON.parse(file.toString("utf8", 20, 20 + jsonLength)) as { images?: { mimeType: string }[] };
      for (const image of gltf.images ?? []) expect(["image/jpeg", "image/png"], id).toContain(image.mimeType);
      expect(asset.credit, id).toMatch(/NASA/);
      expect(asset.sourceUrl, id).toMatch(/^https:\/\/science\.nasa\.gov\/resource\//);
    }
  });

  it("match the published dimensions of each body", () => {
    for (const id of ["eros", "itokawa", "vesta", "phobos", "deimos", "bennu", "arrokoth"]) {
      const published = measuredAppearance(id)?.axes;
      expect(published, id).toBeDefined();
      const [a, , c] = [...published!].sort((x, y) => y - x);
      const [ma, , mc] = shapeModelFor(id)!.semiAxes;
      // Long-to-short axis ratio of the mesh vs the database extent, within 25%.
      expect((ma / mc) / (a / c), id).toBeGreaterThan(0.75);
      expect((ma / mc) / (a / c), id).toBeLessThan(1.25);
    }
  });
});
