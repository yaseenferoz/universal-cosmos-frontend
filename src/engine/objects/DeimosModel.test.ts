import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("installed Deimos model", () => {
  it("contains a materially irregular shape at roughly Deimos's known dimensions", () => {
    const file = readFileSync(new URL("../../../public/models/deimos-nasa.glb", import.meta.url));
    expect(file.toString("ascii", 0, 4)).toBe("glTF");
    const jsonLength = file.readUInt32LE(12);
    const gltf = JSON.parse(file.toString("utf8", 20, 20 + jsonLength)) as {
      accessors: Array<{ min?: number[]; max?: number[]; count: number }>;
      meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
    };
    const positions = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
    const widths = positions.min!.map((minimum, index) => positions.max![index] - minimum);
    expect(positions.count).toBeGreaterThan(10000);
    expect(widths[0]).toBeGreaterThan(14);
    expect(widths[0]).toBeLessThan(16);
    expect(widths[0] / widths[2]).toBeGreaterThan(1.3);
  });
});
