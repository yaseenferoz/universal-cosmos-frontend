import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { J2000_OBLIQUITY, raDecToEngine, skyAssetDirectionToEngine } from "./skyOrientation";
import { DeepSky } from "./DeepSky";

const STARS: Record<string, [number, number]> = {
  Sirius: [101.287, -16.716], Canopus: [95.988, -52.696], Arcturus: [213.915, 19.182],
  Vega: [279.234, 38.784], Capella: [79.172, 45.998], Rigel: [78.634, -8.202], Polaris: [37.955, 89.264],
};

describe("celestial sky orientation in the engine frame", () => {
  it("puts the north celestial pole 23.44° from the ecliptic pole, toward −Z (RA 6h side)", () => {
    const pole = raDecToEngine(0, 90);
    expect(pole.angleTo(new Vector3(0, 1, 0))).toBeCloseTo(J2000_OBLIQUITY, 10);
    // RA 90°, Dec 0° lies on the equator at ecliptic longitude 90° (−Z), tilted south.
    const ra90 = raDecToEngine(90, 0);
    expect(ra90.z).toBeLessThan(-0.9);
    expect(ra90.y).toBeLessThan(0);
  });

  it("places the NASA SVS star-peak asset on the true positions of bright stars", () => {
    const file = readFileSync(new URL("../../../public/textures/deep-sky-bright-stars.bin", import.meta.url));
    const records = new Float32Array(file.buffer, file.byteOffset, file.byteLength / 4);
    const peaks: Vector3[] = [];
    for (let i = 0; i < records.length; i += 7)
      if (records[i + 6] > 2.2) peaks.push(skyAssetDirectionToEngine(new Vector3(records[i], records[i + 1], records[i + 2])));
    for (const [name, [ra, dec]] of Object.entries(STARS)) {
      if (name === "Polaris") continue;
      const truth = raDecToEngine(ra, dec);
      const nearest = Math.min(...peaks.map((peak) => peak.angleTo(truth)));
      expect(nearest * 180 / Math.PI, name).toBeLessThan(0.3);
    }
  });

  it("orients the Milky Way dome so each map pixel lands at its RA/Dec", () => {
    const sky = new DeepSky();
    sky.mesh.updateMatrixWorld();
    const rotation = new Matrix4().extractRotation(sky.mesh.matrixWorld);
    for (const [name, [ra, dec]] of Object.entries(STARS)) {
      // Map pixel of this star (SVS plate carrée: RA increases leftward from 0 at centre).
      const uMap = (((0.5 - ra / 360) % 1) + 1) % 1;
      const vFromTop = 0.5 - dec / 180;
      // The vertex shader samples u = 1 − uv.x, so the dome vertex has uv.x = 1 − uMap.
      const phi = (1 - uMap) * Math.PI * 2, theta = vFromTop * Math.PI;
      const local = new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
      expect(local.applyMatrix4(rotation).angleTo(raDecToEngine(ra, dec)), name).toBeLessThan(1e-5);
    }
    sky.dispose();
  });
});
