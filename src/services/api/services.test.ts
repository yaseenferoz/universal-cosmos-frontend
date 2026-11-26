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
    const earth = (await service.search("  ÉARTH  ")).map((object) => object.id);
    expect(earth[0]).toBe("earth");
    expect(earth).toEqual(expect.arrayContaining(["bennu", "eros", "apophis"]));
    expect(
      (await service.search("gas giant")).map((object) => object.id),
    ).toEqual(["jupiter", "saturn"]);
    expect(await service.search("not a catalog object")).toEqual([]);
    expect(await service.search("")).toHaveLength(celestialObjects.length);
    expect((await service.search("Europa")).map(({ id }) => id)).toEqual(["europa"]);
    expect((await service.search("asteroid")).map(({ id }) => id)).toEqual(expect.arrayContaining(["ceres", "vesta", "bennu", "pallas", "eros"]));
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

  it("discovers moons by parent and accepts plural collection names", async () => {
    expect((await service.search("asteroids")).map(({ id }) => id)).toEqual(expect.arrayContaining(["ceres", "vesta", "bennu", "pallas", "eros"]));
    const satellites = celestialObjects.filter(({ category }) => category === "Natural satellite");
    expect(await service.search("moons")).toHaveLength(satellites.length);
    expect(satellites.length).toBeGreaterThan(450);
    const saturn = await service.search("Saturn moons");
    expect(saturn.map(({ id }) => id)).toEqual(expect.arrayContaining(["mimas", "tethys", "dione", "rhea", "iapetus", "enceladus", "titan"]));
    expect(saturn).toHaveLength(satellites.filter(({ parentId }) => parentId === "saturn").length);
    expect(saturn.every(({ parentId }) => parentId === "saturn")).toBe(true);
    expect(await service.search("Uranus satellites")).toHaveLength(satellites.filter(({ parentId }) => parentId === "uranus").length);
    expect(await service.search("Mercury moons")).toEqual([]);
    expect(await service.getObject("oberon")).toMatchObject({ parentId: "uranus", radiusKm: 761.4 });
  });

  it("returns analytic ephemerides with provenance, and declines uncovered objects or dates", async () => {
    const earth = await service.getEphemeris("earth", SIMULATION_EPOCH);
    expect(earth).toMatchObject({
      status: "available",
      epoch: SIMULATION_EPOCH,
      position: { unit: "km", referenceObject: "sun" },
      provenance: { url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html" },
    });
    if (earth.status !== "available") throw new Error("expected position");
    const au = Math.hypot(earth.position.x, earth.position.y, earth.position.z) / 149_597_870.7;
    expect(au).toBeGreaterThan(0.983); // perihelion
    expect(au).toBeLessThan(0.984); // Earth is near perihelion on 1 January
    expect(await service.getEphemeris("moon", SIMULATION_EPOCH)).toMatchObject({
      status: "available", position: { referenceObject: "earth" },
    });
    expect(await service.getEphemeris("iss", SIMULATION_EPOCH)).toMatchObject({
      status: "unavailable", position: null,
    });
    expect(await service.getEphemeris("mars", "2300-01-01T00:00:00Z")).toMatchObject({
      status: "unavailable", position: null,
    });
    await expect(service.getEphemeris("earth", "not a date")).rejects.toThrow(
      "valid ephemeris date",
    );
    const system = await service.getSystem("solar");
    expect(system.model).toBe("illustrative-circular");
    expect(system.objectIds).toHaveLength(celestialObjects.length);
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
    expect(objectById.himalia?.unmeasured ?? []).not.toContain("mass");
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
