import { describe, expect, it } from "vitest";
import {
  absoluteV, CATALOGUE_LIMIT_V, imfCount, imfInverse, IMF_MAX, IMF_MIN, livingMassLimit, mainSequenceLuminosity,
  mainSequenceTemperature, massForCount, meanVisualLuminosity, plummerRadius, sampleStars, totalStars, turnoffMass, type ClusterModel,
} from "./clusterPopulation";

const pleiades: ClusterModel = {
  kind: "open", distancePc: 134.8, logAge: 8.085, metallicity: 0, extinctionV: 0.12,
  halfRadiusPc: 2.7, coreRadiusPc: 1.3, tidalRadiusPc: 11, members: 1721,
};
const omegaCentauri: ClusterModel = {
  kind: "globular", distancePc: 5181, logAge: 10.1, metallicity: -1.53, extinctionV: 0.37,
  halfRadiusPc: 6.3, coreRadiusPc: 3.6, tidalRadiusPc: 70, absMagV: -10.24,
};

describe("cluster stellar populations", () => {
  it("inverts the Kroupa IMF across its break", () => {
    for (const target of [0.1, 1, 3, imfCount(IMF_MIN, 2)]) expect(imfCount(IMF_MIN, imfInverse(IMF_MIN, target))).toBeCloseTo(target, 9);
    expect(imfInverse(IMF_MIN, 1e9)).toBe(IMF_MAX);
    // Most stars are low-mass: half are below ~0.4 M☉ (from 0.1 M☉).
    expect(imfInverse(IMF_MIN, imfCount(IMF_MIN, IMF_MAX) / 2)).toBeLessThan(0.45);
  });

  it("puts a solar-mass star at the Sun's magnitude and sets turnoffs by age", () => {
    expect(mainSequenceLuminosity(1)).toBe(1);
    expect(mainSequenceTemperature(1)).toBeCloseTo(5772, 0);
    expect(absoluteV(1, 5772)).toBeCloseTo(4.81, 1);
    expect(turnoffMass(10)).toBeCloseTo(1, 6);
    // Pleiades (~120 Myr): late-B stars at the turnoff.
    expect(turnoffMass(8.085)).toBeGreaterThan(4);
    expect(turnoffMass(8.085)).toBeLessThan(7);
  });

  it("scales open clusters from their Gaia members and globulars from their luminosity", () => {
    const pleiadesTotal = totalStars(pleiades);
    expect(pleiadesTotal).toBeGreaterThanOrEqual(1721);
    // Gaia reaches M dwarfs there, so only the faintest (0.1–0.3 M☉) are added: a few thousand stars in all.
    expect(pleiadesTotal).toBeLessThan(1721 * 3);
    const omega = totalStars(omegaCentauri);
    // ~10^6 L☉ at under one solar V-luminosity per star: millions of stars.
    expect(omega).toBeGreaterThan(1e6);
    expect(omega).toBeLessThan(2e7);
    expect(meanVisualLuminosity({ kind: "globular", logAge: 10.1, metallicity: -1.5 })).toBeLessThan(1);
  });

  it("samples stars within the tidal radius and leaves catalogue-bright stars to HYG", () => {
    const top = livingMassLimit(pleiades.logAge);
    const sample = sampleStars(pleiades, massForCount(totalStars(pleiades), 300, top), top, 300, 42);
    expect(sample.count).toBeGreaterThan(0);
    for (let i = 0; i < sample.count; i++) {
      const r = Math.hypot(sample.positions[i * 3], sample.positions[i * 3 + 1], sample.positions[i * 3 + 2]);
      expect(r).toBeLessThanOrEqual(pleiades.tidalRadiusPc + 1e-6);
      expect(sample.absMag[i] + 5 * Math.log10(pleiades.distancePc / 10) + pleiades.extinctionV).toBeGreaterThanOrEqual(CATALOGUE_LIMIT_V);
    }
    // Same seed, same cluster.
    expect(sampleStars(pleiades, 0.5, 1, 50, 7).absMag).toEqual(sampleStars(pleiades, 0.5, 1, 50, 7).absMag);
    // A Plummer sphere holds half its mass within 1.305 scale radii.
    expect(plummerRadius(1, 0.5)).toBeCloseTo(1.305, 3);
  });
});
