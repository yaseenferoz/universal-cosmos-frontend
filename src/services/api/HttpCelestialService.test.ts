import { describe, expect, it, vi } from "vitest";
import {
  celestialObjects,
  objectById,
  SIMULATION_EPOCH,
} from "../../data/catalog";
import type { BackendObjectSummary } from "../../types/celestial";
import { HttpCelestialService } from "./HttpCelestialService";
import { parseBackendCatalog } from "./backendCatalog";

// Explicit test identities, not provider records or scientific measurements.
const backendObjects = celestialObjects.filter((object) =>
  ["sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"].includes(object.id),
);
const ids = new Map(
  backendObjects.map((object, index) => [
    object.id,
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);
const identities: BackendObjectSummary[] = backendObjects.map((object) => ({
  id: ids.get(object.id)!,
  slug: object.id,
  name: object.name,
  objectType:
    object.id === "sun" ? "STAR" : object.id === "moon" ? "MOON" : "PLANET",
  description: `${object.name} identity fixture`,
  parentObjectId: object.parentId ? ids.get(object.parentId)! : null,
  catalogue: { name: "FIXTURE", identifier: object.id },
}));
const identity = (slug: string) =>
  identities.find((object) => object.slug === slug)!;
const system = {
  name: "Solar System",
  rootObjectId: ids.get("sun"),
  objects: identities,
};
const reply = (data: unknown, pagination?: Record<string, number>) =>
  new Response(
    JSON.stringify({
      success: true,
      data,
      meta: {
        source: "Fixture",
        timestamp: SIMULATION_EPOCH,
        ...(pagination ? { pagination } : {}),
      },
    }),
  );
const pagination = (page: number, totalPages: number) => ({
  page,
  pageSize: 100,
  total: totalPages,
  totalPages,
});

describe("backend catalog mapping", () => {
  it("keeps physical/display references attributed while mapping connected UUIDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(system));
    const service = new HttpCelestialService("https://example.test", fetcher);
    const objects = await service.getObjects();
    expect(objects).toHaveLength(celestialObjects.length);
    expect(objects.find((object) => object.id === "earth")).toMatchObject({
      backendId: ids.get("earth"),
      radiusKm: objectById.earth.radiusKm,
      source: objectById.earth.source,
      description: "Earth identity fixture",
    });
    objects[0].display.radius = 900;
    expect((await service.getObjects())[0].display.radius).toBe(5);
    expect((await service.getSystem("solar")).visualizationEpoch).toBe(
      SIMULATION_EPOCH,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://example.test/api/v1/systems/solar",
    );
  });

  it("scopes the scene to supported bodies and validates identities and hierarchy", () => {
    const extra = {
      ...identity("moon"),
      slug: "europa",
      name: "Europa",
      id: "00000000-0000-4000-8000-000000000099",
      parentObjectId: ids.get("jupiter"),
    };
    expect(
      parseBackendCatalog({ ...system, objects: [...identities, extra] })
        .objects,
    ).toHaveLength(celestialObjects.length);
    expect(() =>
      parseBackendCatalog({ ...system, objects: identities.slice(1) }),
    ).toThrow("incomplete");
    expect(() =>
      parseBackendCatalog({
        ...system,
        objects: [...identities, identity("earth")],
      }),
    ).toThrow("duplicate");
    expect(() =>
      parseBackendCatalog({ ...system, rootObjectId: ids.get("earth") }),
    ).toThrow("root");
    expect(() =>
      parseBackendCatalog({
        ...system,
        objects: identities.map((object) =>
          object.slug === "moon"
            ? { ...object, parentObjectId: ids.get("sun") }
            : object,
        ),
      }),
    ).toThrow("parent mapping");
    expect(() =>
      parseBackendCatalog({
        ...system,
        objects: identities.map((object) =>
          object.slug === "earth" ? { ...object, objectType: "STAR" } : object,
        ),
      }),
    ).toThrow("object type");
  });
});

describe("connected search and detail", () => {
  it("retains bundled destinations in HTTP mode without inventing backend identities or detail requests", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply(system))
      .mockResolvedValueOnce(reply([], pagination(1, 0)))
      .mockResolvedValueOnce(reply([], pagination(1, 0)));
    const service = new HttpCelestialService("https://example.test", fetcher);
    const loaded = await service.getObjects();
    expect((await service.getSystem("solar")).objectIds).toEqual(loaded.map(({ id }) => id));
    expect((await service.search("asteroids")).map(({ id }) => id)).toEqual(expect.arrayContaining(["ceres", "vesta", "bennu", "pallas", "eros"]));
    expect(await service.search("Saturn moons")).toHaveLength(celestialObjects.filter(({ parentId, category }) => parentId === "saturn" && category === "Natural satellite").length);
    for (const id of ["bennu", "europa", "mimas", "oberon"]) {
      const object = await service.getObject(id);
      expect(object?.id).toBe(id);
      expect(object?.backendId).toBeUndefined();
      if (object) object.display.radius = 1000;
      expect((await service.getObject(id))?.display.radius).toBeLessThan(1);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await service.getEphemeris("mimas", SIMULATION_EPOCH)).toMatchObject({ status: "unavailable", position: null });
  });

  it("handles initial and one-character searches from the loaded backend catalog", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(system));
    const service = new HttpCelestialService("https://example.test", fetcher);
    expect(await service.search("")).toHaveLength(celestialObjects.length);
    expect((await service.search("j")).map((object) => object.id)[0]).toBe("jupiter");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("encodes real searches, follows bounded pagination, and preserves the signal", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(system))
      .mockResolvedValueOnce(reply([identity("earth")], pagination(1, 2)))
      .mockResolvedValueOnce(reply([identity("moon")], pagination(2, 2)));
    const service = new HttpCelestialService("https://example.test/", fetcher);
    const controller = new AbortController();
    expect(
      (await service.search("Earth & Moon", { signal: controller.signal })).map(
        (object) => object.id,
      ),
    ).toEqual(["earth", "moon"]);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://example.test/api/v1/search?q=Earth%20%26%20Moon&page=1&pageSize=100",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    expect(fetcher.mock.calls[2][0]).toContain("page=2");
  });

  it("rejects search identity substitution and unbounded pagination", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(system))
      .mockResolvedValueOnce(
        reply(
          [{ ...identity("earth"), id: ids.get("mars") }],
          pagination(1, 1),
        ),
      )
      .mockResolvedValueOnce(reply([], pagination(1, 11)));
    const service = new HttpCelestialService("https://example.test", fetcher);
    await expect(service.search("earth")).rejects.toThrow("identity mapping");
    await expect(service.search("moon")).rejects.toThrow("too many records");
    await expect(service.search("a".repeat(101))).rejects.toThrow(
      "100 characters",
    );
  });

  it("uses UUID detail paths, validates identity, and never silently imports measurements", async () => {
    const detail = {
      ...identity("earth"),
      physicalProperties: { radius: { value: 1, unit: "fictional" } },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(system))
      .mockResolvedValueOnce(reply(detail))
      .mockResolvedValueOnce(reply(identity("mars")))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, error: { message: "Not found" } }),
          { status: 404 },
        ),
      );
    const service = new HttpCelestialService("https://example.test", fetcher);
    expect((await service.getObject("earth"))?.radiusKm).toBe(
      objectById.earth.radiusKm,
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      `https://example.test/api/v1/objects/${ids.get("earth")}`,
    );
    await expect(service.getObject(ids.get("earth")!)).rejects.toThrow(
      "different object",
    );
    expect(await service.getObject("earth")).toBeNull();
    expect(await service.getObject("unsupported")).toBeNull();
  });

  it("does not request or mislabel TDB vectors as a UTC ephemeris", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new HttpCelestialService("https://example.test", fetcher);
    expect(await service.getEphemeris("earth", SIMULATION_EPOCH)).toMatchObject(
      { status: "unavailable", position: null, epoch: SIMULATION_EPOCH },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("backend failures and cancellation", () => {
  it("surfaces failed responses and never caches failed loads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { message: "Database unavailable" },
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(new Response("{bad json"))
      .mockResolvedValueOnce(reply(system));
    const service = new HttpCelestialService("https://example.test", fetcher);
    await expect(service.getObjects()).rejects.toMatchObject({ status: 503 });
    await expect(service.getObjects()).rejects.toThrow("unreadable JSON");
    expect(await service.getObjects()).toHaveLength(celestialObjects.length);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("honors aborted cached reads and never lets an aborted load poison the cache", async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => {
        controller.abort();
        return reply(system);
      })
      .mockResolvedValueOnce(reply(system));
    const service = new HttpCelestialService("https://example.test", fetcher);
    await expect(
      service.getObjects({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await service.getObjects()).toHaveLength(celestialObjects.length);
    await expect(
      service.getObjects({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not silently fall back to local mode after connection failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Offline"));
    await expect(
      new HttpCelestialService("https://example.test", fetcher).getObjects(),
    ).rejects.toThrow("could not be reached");
  });

  it("defers configuration failures until awaited calls so UI errors can render", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "http");
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();
    try {
      const { celestialService } = await import("./index");
      await expect(celestialService.getObjects()).rejects.toThrow(
        "VITE_API_BASE_URL",
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("catalogue files over HTTP", () => {
  it("downloads catalogues rebuilt by the backend from its database", async () => {
    const bytes = new Uint8Array([85, 67, 83, 84]);
    const fetcher = vi.fn(async () => new Response(bytes, { status: 200 }));
    const service = new HttpCelestialService("http://localhost:4000/", fetcher);
    const buffer = await service.getCatalogueFile("stars/hyg-v41.bin");
    expect(new Uint8Array(buffer)).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/api/v1/datasets/files/stars/hyg-v41.bin", expect.objectContaining({ method: "GET" }));
  });

  it("explains a catalogue that was never imported and refuses unknown paths", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 }));
    const service = new HttpCelestialService("/", fetcher);
    await expect(service.getCatalogueFile("deep/nebulae.json")).rejects.toThrow(/not been imported/);
    // @ts-expect-error: only the published catalogue files can be requested.
    await expect(service.getCatalogueFile("../.env")).rejects.toThrow(/Unknown catalogue file/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Solar System measurements over HTTP", () => {
  it("uses the backend's measurements (with units checked) and keeps bundled values otherwise", async () => {
    const withMeasurements = {
      ...system,
      objects: identities.map((item) => item.slug === "mars"
        ? { ...item, measurements: {
          radius: { value: 3389.5, unit: "km", uncertainty: null }, mass: { value: 6.4171e23, unit: "kg", uncertainty: null },
          surfaceGravity: { value: 3.71, unit: "m/s2", uncertainty: null }, siderealRotationPeriod: { value: 24.6229, unit: "h", uncertainty: null },
          axialTilt: { value: 25.19, unit: "deg", uncertainty: null }, semiMajorAxis: { value: 1.524, unit: "au", uncertainty: null },
          orbitalPeriod: { value: 686.98, unit: "day", uncertainty: null }, source: "Fixture fact sheet",
        } }
        : item),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(withMeasurements));
    const objects = await new HttpCelestialService("https://example.test", fetcher).getObjects();
    const mars = objects.find((object) => object.id === "mars")!;
    expect(mars).toMatchObject({ radiusKm: 3389.5, massKg: 6.4171e23, gravityMs2: 3.71, rotationPeriodHours: 24.6229, axialTiltDeg: 25.19, orbitalPeriodDays: 686.98, measurementSource: "Fixture fact sheet" });
    // An unexpected unit (au where km is required) is ignored, not converted silently.
    expect(mars.semiMajorAxisKm).toBe(objectById.mars.semiMajorAxisKm);
    expect(objects.find((object) => object.id === "venus")!.measurementSource).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
