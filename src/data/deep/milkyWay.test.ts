import { describe, expect, it } from "vitest";
import { armRadiusPc, armWidthPc, equatorialToEngine, equatorialUnit, MILKY_WAY, milkyWayFrame, SPIRAL_ARMS, type Vec3 } from "./milkyWay";

const angleDeg = (a: Vec3, b: Vec3) => {
  const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
};

describe("Milky Way frame", () => {
  const frame = milkyWayFrame();

  it("puts the Galactic centre toward Sagittarius A* at R0", () => {
    // Sgr A*: RA 17h45m40.04s, Dec −29°00′28.2″ (lies 0.05° from l = b = 0).
    expect(angleDeg(frame.centre, equatorialToEngine(equatorialUnit(266.41683, -29.00781)))).toBeLessThan(0.2);
    expect(Math.hypot(...frame.centre)).toBeCloseTo(MILKY_WAY.r0Pc, -1);
  });

  it("uses the IAU north Galactic pole and the direction of rotation at l = 90°", () => {
    expect(angleDeg(frame.normal, equatorialToEngine(equatorialUnit(192.85948, 27.12825)))).toBeLessThan(0.01);
    // l = 90°, b = 0: RA 21h12m01s, Dec +48°19′47″.
    expect(angleDeg(frame.zAxis, equatorialToEngine(equatorialUnit(318.0043, 48.3297)))).toBeLessThan(0.05);
  });

  it("is a right-handed orthonormal frame with the Sun at beta = 0", () => {
    const [x, n, z] = [frame.xAxis, frame.normal, frame.zAxis];
    const cross: Vec3 = [x[1] * n[2] - x[2] * n[1], x[2] * n[0] - x[0] * n[2], x[0] * n[1] - x[1] * n[0]];
    expect(angleDeg(cross, z)).toBeLessThan(1e-5);
    expect(angleDeg(x, n)).toBeCloseTo(90, 6);
    // From the centre the Sun lies along +x, 20.8 pc above the plane.
    const sun: Vec3 = [-frame.centre[0], -frame.centre[1], -frame.centre[2]];
    const height = sun[0] * n[0] + sun[1] * n[1] + sun[2] * n[2];
    expect(height).toBeCloseTo(MILKY_WAY.sunHeightPc, 6);
    expect(angleDeg(sun.map((c, i) => c - n[i] * height) as Vec3, x)).toBeLessThan(1e-5);
  });
});

describe("spiral arms (Reid et al. 2019)", () => {
  it("pass through R_kink at beta_kink and wind inward with rotation", () => {
    for (const arm of SPIRAL_ARMS) {
      expect(armRadiusPc(arm, arm.betaKinkDeg)).toBeCloseTo(arm.rKinkPc, 6);
      if (arm.pitchAboveDeg > 0) expect(armRadiusPc(arm, arm.betaKinkDeg + 30)).toBeLessThan(arm.rKinkPc);
    }
  });

  it("place the Sun at the inner edge of the Local arm, inside the Perseus arm", () => {
    const local = SPIRAL_ARMS.find((arm) => arm.name === "Local arm")!;
    const perseus = SPIRAL_ARMS.find((arm) => arm.name === "Perseus arm")!;
    const offset = armRadiusPc(local, 0) - MILKY_WAY.r0Pc;
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(1.5 * armWidthPc(local, MILKY_WAY.r0Pc));
    expect(armRadiusPc(perseus, 0)).toBeGreaterThan(armRadiusPc(local, 0) + 1000);
  });
});
