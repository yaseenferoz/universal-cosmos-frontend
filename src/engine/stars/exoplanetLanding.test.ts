import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { parseExoplanetFile, type PlanetarySystem } from "../../data/stars/exoplanets";
import { registerLanding } from "../../data/landingRegistry";
import { environmentFor } from "../../data/planetaryEnvironments";
import { localAtmosphereModel } from "../../data/localAtmosphereModels";
import { surfaceProfileFor } from "../../data/surfaceProfiles";
import { giantAtmosphereFor } from "../effects/GiantPlanetAtmosphere";
import { expectedTidallyLocked, exoplanetLanding, scaleHeightKm, starlightTint } from "./exoplanetLanding";
import { planetBodyFrame } from "./planetRotation";
import { J2000_JD } from "./keplerOrbit";

const data = parseExoplanetFile(JSON.parse(readFileSync(new URL("../../../public/stars/exoplanets.json", import.meta.url), "utf8")), 200_000);
function system(host: string): PlanetarySystem {
  const matched = [...data.matched.entries()].find(([, s]) => s.host === host);
  if (matched) return { ...matched[1], star: matched[0], inHyg: true };
  const appended = data.appended.find((h) => h.system.host === host);
  if (!appended) throw new Error(`${host} not found`);
  return { ...appended.system, star: -1, inHyg: false };
}
const planet = (s: PlanetarySystem, name: string) => s.planets.findIndex((p) => p.name === name);
const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("exoplanet landings from archive values", () => {
  it("puts you on bare rock on TRAPPIST-1 e, tidally locked, in orange starlight at Earth-like brightness", () => {
    const trappist = system("TRAPPIST-1");
    const landing = exoplanetLanding(trappist, planet(trappist, "TRAPPIST-1 e"));
    expect(landing.mode).toBe("surface");
    expect(landing.descriptor.environment.skyColor).toBe("#000000");
    expect(landing.descriptor.surface?.kind).toBe("regolith");
    expect(landing.tidallyLocked).toBe(true);
    expect(landing.insolationEarth).toBeCloseTo(0.65, 1);
    // g = 9.81 × 0.692 / 0.92² ≈ 0.82 g.
    expect(landing.gravityMs2 / 9.807).toBeCloseTo(0.82, 2);
    const [r, g, b] = landing.starlight;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(luminance(landing.starlight)).toBeCloseTo(1, 6);
    expect(landing.assumptions.join(" ")).toMatch(/airless/);
  });

  it("flies above the cloud deck of 51 Peg b with a scale height from its temperature and gravity", () => {
    const peg = system("51 Peg");
    const landing = exoplanetLanding(peg, 0);
    expect(landing.mode).toBe("atmosphere");
    expect(landing.descriptor.giant).toBeDefined();
    // T ≈ 1330 K, g ≈ 9.6 m/s², μ = 2.3 → H ≈ 500 km.
    expect(landing.scaleHeightKm).toBeGreaterThan(400);
    expect(landing.scaleHeightKm).toBeLessThan(600);
    expect(landing.tidallyLocked).toBe(true);
  });

  it("lands on 55 Cnc e: above the radius valley but rock-dense, and molten-hot", () => {
    const cancri = system("55 Cnc");
    const landing = exoplanetLanding(cancri, planet(cancri, "55 Cnc e"));
    expect(landing.mode).toBe("surface");
    expect(landing.descriptor.surface?.kind).toBe("volcanic");
  });

  it("gives distant giants an illustrative day instead of tidal locking", () => {
    const hr = system("HR 8799");
    const landing = exoplanetLanding(hr, planet(hr, "HR 8799 b"));
    expect(landing.tidallyLocked).toBe(false);
    expect(landing.rotationHours).toBe(10);
    expect(landing.assumptions.join(" ")).toMatch(/illustrative 10-hour day/);
  });

  it("uses standard physics for scale height, tidal locking and starlight colour", () => {
    // Jupiter at 165 K, 24.79 m/s²: about 24 km (NSSDCA lists 27 km).
    expect(scaleHeightKm(165, 24.79)).toBeCloseTo(24, 0);
    expect(expectedTidallyLocked(1, 1)).toBe(false);
    expect(expectedTidallyLocked(0.05, 1)).toBe(true);
    expect(expectedTidallyLocked(0.2, 0.2)).toBe(true);
    starlightTint(5772).forEach((c) => expect(c).toBeCloseTo(1, 6));
    expect(starlightTint(9000)[2]).toBeGreaterThan(starlightTint(9000)[0]);
  });
});

describe("landing registry", () => {
  it("serves a registered exoplanet to the shared exploration lookups, and forgets it after", () => {
    const peg = system("51 Peg");
    const giant = exoplanetLanding(peg, 0);
    const trappist = system("TRAPPIST-1");
    const rocky = exoplanetLanding(trappist, planet(trappist, "TRAPPIST-1 e"));
    const releaseGiant = registerLanding(giant.id, giant.descriptor);
    const releaseRocky = registerLanding(rocky.id, rocky.descriptor);
    expect(environmentFor(giant.id)?.mode).toBe("atmosphere");
    expect(giantAtmosphereFor(giant.id)).toBe(giant.descriptor.giant);
    expect(localAtmosphereModel(giant.id).directOpticalDepth).toBe(8);
    expect(surfaceProfileFor(rocky.id)).toBe(rocky.descriptor.surface);
    expect(localAtmosphereModel(rocky.id).directOpticalDepth).toBe(0);
    releaseGiant();
    releaseRocky();
    expect(environmentFor(giant.id)).toBeUndefined();
    expect(surfaceProfileFor(rocky.id)).toBeUndefined();
    // Solar System bodies are unaffected.
    expect(giantAtmosphereFor("jupiter")?.deckAltitudeKm).toBe(10);
  });
});

describe("exoplanet spin frame", () => {
  const normal = new Vector3(0.2, 1, -0.3).normalize();
  const toStar = new Vector3(1, 0, 0).sub(normal.clone().multiplyScalar(normal.x)).normalize();

  it("keeps the substellar point (0°, 0°) facing the star when tidally locked", () => {
    const frame = planetBodyFrame(normal, toStar.clone().multiplyScalar(3), new Vector3(0, 0, 1), true, 0, J2000_JD + 123.4);
    expect(new Vector3(1, 0, 0).applyQuaternion(frame).dot(toStar)).toBeCloseTo(1, 10);
    expect(new Vector3(0, 1, 0).applyQuaternion(frame).dot(normal)).toBeCloseTo(1, 10);
  });

  it("turns once per rotation period otherwise", () => {
    const reference = new Vector3(0, 0, 1);
    const a = planetBodyFrame(normal, toStar, reference, false, 10, J2000_JD + 5);
    const b = planetBodyFrame(normal, toStar, reference, false, 10, J2000_JD + 5 + 10 / 24);
    const half = planetBodyFrame(normal, toStar, reference, false, 10, J2000_JD + 5 + 5 / 24);
    const x = new Vector3(1, 0, 0);
    expect(x.clone().applyQuaternion(a).dot(x.clone().applyQuaternion(b))).toBeCloseTo(1, 6);
    expect(x.clone().applyQuaternion(a).dot(x.clone().applyQuaternion(half))).toBeCloseTo(-1, 6);
  });
});
