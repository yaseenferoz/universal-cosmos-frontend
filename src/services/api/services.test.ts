import { describe, expect, it } from "vitest";
import {
  celestialObjects,
  objectById,
  SIMULATION_EPOCH,
  solarSystem,
} from "../../data/catalog";
import { LocalCelestialService } from "./LocalCelestialService";
import {
  parseCatalog,
  parseEphemeris,
  parseObjects,
  parseSystem,
} from "./validation";

describe("local celestial service", () => {
  const service = new LocalCelestialService();

  it("finds real objects with case, whitespace, and accent-insensitive search", async () => {
    expect(
      (await service.search("  \u00c9ARTH  ")).map((object) => object.id),
    ).toEqual(["earth", "bennu"]);
    expect(
      (await service.search("gas giant")).map((object) => object.id),
    ).toEqual(["jupiter", "saturn"]);
    expect(await service.search("not a catalog object")).toEqual([]);
    expect(await service.search("")).toHaveLength(23);
    expect((await service.search("Europa")).map(({ id }) => id)).toEqual(["europa"]);
    expect((await service.search("asteroid")).map(({ id }) => id)).toEqual(["ceres", "vesta", "bennu"]);
  });

  it("does not expose mutable catalog objects to consumers", async () => {
    const earth = await service.getObject("earth");
    expect(earth).not.toBeNull();
    if (earth) {
      earth.display.radius = 900;
      earth.facts.push({ label: "Injected", value: "Not real" });
    }
    expect((await service.getObject("earth"))?.display.radius).toBe(0.9);
    expect(
      objectById.earth.facts.some(({ label }) => label === "Injected"),
    ).toBe(false);
    expect(await service.getObject("unknown")).toBeNull();
  });

  it("distinguishes a visualization epoch from unavailable scientific ephemerides", async () => {
    const result = await service.getEphemeris("earth", SIMULATION_EPOCH);
    expect(result).toMatchObject({
      status: "unavailable",
      position: null,
      epoch: SIMULATION_EPOCH,
    });
    await expect(service.getEphemeris("earth", "not a date")).rejects.toThrow(
      "valid ephemeris date",
    );
    const system = await service.getSystem("solar");
    expect(system.model).toBe("illustrative-circular");
    expect(system.objectIds).toHaveLength(23);
  });

  it("honors already aborted requests without performing work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.search("Earth", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("scientific catalog integrity", () => {
  it("requires every supported Solar System body while retaining a backend epoch", () => {
    const remoteSystem = {
      ...solarSystem,
      visualizationEpoch: "2027-02-03T00:00:00.000Z",
    };
    expect(parseSystem(remoteSystem)).toEqual(remoteSystem);
    expect(() => parseSystem({ ...solarSystem, objectIds: ["sun"] })).toThrow(
      "incomplete Solar System",
    );
    expect(() => parseSystem({ ...solarSystem, objectIds: [] })).toThrow(
      "incomplete Solar System",
    );
    expect(() => parseSystem({ ...solarSystem, objectIds: solarSystem.objectIds.slice(0, 11) })).toThrow(
      "incomplete Solar System",
    );
    expect(() =>
      parseSystem({
        ...solarSystem,
        objectIds: [...solarSystem.objectIds, "earth"],
      }),
    ).toThrow("duplicate system");
  });

  it("validates all source data, signed spin, and finite geometry", () => {
    expect(parseCatalog(celestialObjects)).toEqual(celestialObjects);
    expect(objectById.venus.rotationPeriodHours).toBeLessThan(0);
    expect(objectById.moon.parentId).toBe("earth");
    expect(objectById.moon.semiMajorAxisKm).toBe(384_000);
    expect(objectById.europa.parentId).toBe("jupiter");
    expect(objectById.enceladus.parentId).toBe("saturn");
    expect(objectById.titania.parentId).toBe("uranus");
    expect(objectById.triton.parentId).toBe("neptune");
    expect(objectById.ceres.category).toContain("asteroid belt");
    expect(objectById.sun.orbitalPeriodDays).toBe(0);
    expect(() =>
      parseObjects([
        {
          ...objectById.earth,
          display: { ...objectById.earth.display, radius: NaN },
        },
      ]),
    ).toThrow("display radius");
    expect(() =>
      parseObjects([{ ...objectById.earth, orbitalPeriodDays: 0 }]),
    ).toThrow("orbital period");
    expect(() => parseObjects([objectById.earth, objectById.earth])).toThrow(
      "duplicate",
    );
  });

  it("rejects missing parents and cycles only for complete catalogs", () => {
    expect(() => parseCatalog([objectById.earth])).toThrow("missing parent");
    expect(parseObjects([objectById.earth])).toHaveLength(1);
    expect(() =>
      parseCatalog([
        { ...objectById.earth, parentId: "moon" },
        objectById.moon,
      ]),
    ).toThrow("cyclic parent");
  });

  it("requires units, frame, provenance and finite positions for a real ephemeris", () => {
    const result = {
      status: "available",
      objectId: "earth",
      epoch: SIMULATION_EPOCH,
      position: {
        x: 1,
        y: 2,
        z: 3,
        unit: "km",
        referenceObject: "sun",
        frame: "ICRF",
      },
      provenance: {
        source: "Fixture",
        url: "https://example.test/source",
        model: "Test only",
      },
    };
    expect(parseEphemeris(result)).toEqual(result);
    expect(() =>
      parseEphemeris({
        ...result,
        position: { ...result.position, unit: "display" },
      }),
    ).toThrow("units");
    expect(() =>
      parseEphemeris({
        ...result,
        position: { ...result.position, x: Infinity },
      }),
    ).toThrow("position x");
  });
});
