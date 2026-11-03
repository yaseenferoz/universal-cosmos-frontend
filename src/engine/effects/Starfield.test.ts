import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Starfield } from "./Starfield";

describe("starfield exposure through HDR and direct output", () => {
  it("lets output expose stars once while canceling only gains above unity", () => {
    const stars = new Starfield(16);
    for (const exposure of [0.001, 1, 512]) {
      stars.update(new Vector3(), 1, exposure);
      const compensation = stars.points.material.uniforms.exposureVisibility.value as number;
      expect(compensation * exposure).toBeCloseTo(Math.min(1, exposure));
    }
    expect(stars.points.material.toneMapped).toBe(true);
    expect(stars.points.material.fragmentShader.match(/#include <tonemapping_fragment>/g)).toHaveLength(1);
    stars.dispose();
  });
});
