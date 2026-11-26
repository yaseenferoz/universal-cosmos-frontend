# Ephemeris model

Universal Cosmos places Solar System bodies with offline analytic models in
`src/engine/ephemeris/`. The code runs on the CPU for each frame in double precision and makes no network requests.

| Bodies | Model | Source | Accuracy (near the present) | Valid range used |
| --- | --- | --- | --- | --- |
| Mercury–Neptune | Mean Keplerian elements plus linear rates (Table 1) | [JPL, Standish](https://ssd.jpl.nasa.gov/planets/approx_pos.html) | 15″–600″ (Saturn worst) | 1800–2050 |
| Earth | Earth–Moon barycenter from Table 1, minus the lunar offset (Earth/Moon mass ratio 81.30056) | Same | ≈ 20″ | 1800–2050 |
| Moon | Truncated ELP-2000/82: all of Meeus Table 47.A, the 30 largest terms of 47.B | Meeus, *Astronomical Algorithms*, 2nd ed., ch. 47 | ≈ 10″ longitude, a few arcseconds latitude, ≈ 10 km distance | 1500–2500 |
| Ceres, Vesta | Two-body propagation of osculating elements (epoch JD 2461200.5) | [JPL SBDB](https://ssd-api.jpl.nasa.gov/sbdb.api) | ≲ 0.01° near the epoch, grows with time | Epoch ± 5 years |
| Bennu | Two-body propagation of Horizons osculating elements (2026-07-01 TDB) | [JPL Horizons](https://ssd.jpl.nasa.gov/api/horizons.api) | ≲ 0.05° within about 6 months, grows with time (Earth encounters, Yarkovsky effect) | Epoch ± 5 years |
| 458 natural satellites (all JPL-listed moons of Mars, Jupiter, Saturn, Uranus, Neptune and Pluto except two), dwarf planets, asteroids and comets | Osculating elements in each moon's JPL reference plane (ecliptic, or Laplace/equatorial with the JPL/IAU pole), fitted to Horizons in 2026–27 with secular node/apsis precession; **or** Horizons positions sampled 2024–2030 and interpolated (4-point Lagrange) for bodies whose fit misses held-out epochs by > 0.25° | [JPL SSD satellites](https://ssd.jpl.nasa.gov/sats/elem/), [Horizons](https://ssd.jpl.nasa.gov/api/horizons.api) | Per body: `holdoutErrorDeg` in `src/data/generated/solarSystemBodies.json`; sampled bodies < 0.01° | Fitted: 2023-07–2029-07; sampled: 2024–2030 |

The ISS keeps its labeled circular model orbit.

## Generated bodies

`scripts/prepare-solar-system-bodies.py` (standard library only) rebuilds the data:
`python scripts/prepare-solar-system-bodies.py` then `--samples`. It requests Horizons
vectors at ten epochs per body, fits elements with progressive revolution unwrapping,
and stores the error at two held-out epochs (2025-01-01, 2028-01-01) for every body.
394 solar-perturbed (mostly irregular) moons are additionally sampled every 1–10 days;
the 1.2 MB `public/ephemeris/body-samples.bin` loads after start-up, with fitted elements
as the fallback. Pluto's small moons orbit the Pluto–Charon barycenter; Pluto itself is
offset from the barycenter by Charon's mass fraction (0.1086).

Not included: Daphnis (Horizons has no ephemeris after 2018) and S/2025 U 1 (its
osculating orbit came back non-elliptic). Moons of dwarf planets other than Pluto and
of asteroids (Dysnomia, Hiʻiaka, Dactyl, Dimorphos …) are not yet included.

Only 90 bodies have a published radius here. Others are drawn at a 2 km placeholder
and listed as "Not measured"; their mass, gravity or spin are likewise marked unmeasured
rather than estimated.

Outside a body's valid range, the scene still animates, but `getEphemeris`
returns `unavailable`.

## Frames and time

- **Output frame:** geometric (no light-time or aberration correction) positions on the mean ecliptic and equinox of J2000. Planets and small bodies are heliocentric (Sun center); the Moon is geocentric; other moons are centred on their planet (Pluto's small moons on Pluto, via the barycenter offset).
- **Engine axes:** astronomical (x, y, z) maps to the engine's (x, z, −y). +X points to the equinox, +Y to ecliptic north, and −Z to the east. This is a proper rotation, so motion stays prograde.
- **Moon precession:** Meeus gives the lunar longitude of date. It is referred back to J2000 with the IAU 1976 general precession in longitude, neglecting ecliptic motion (about 47″ per century).
- **Time:** the UTC simulation clock is converted with TT = UTC + 69.184 s (37 leap seconds, valid from 2017 until the next leap second), and TDB is treated as equal to TT (difference under 2 ms).

## Orientation

Body orientation uses the IAU WGCCRE 2015 rotation models (Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22) as encoded in the NAIF generic text PCK `pck00011.tpc`. `scripts/prepare-rotation-elements.py` reads only its `\begindata` assignments and writes `src/data/generated/rotationElements.json` for the 73 catalog bodies that have published elements: the Sun, planets, the Moon (with its 13 E-terms), Mars's moons, the Galilean and inner Jovian moons, Saturn's regular moons, the Uranian and Neptunian moons (Triton's precessing pole), Pluto, Charon and the spacecraft-visited asteroids and comets. `src/engine/ephemeris/orientation.ts` evaluates alpha0, delta0 and W at TDB (T in Julian centuries, d in days from J2000, with the periodic nutation/precession terms of each system, including Mars's quadratic phase angles) and composes the body-fixed to engine rotation Rx(-90 deg - epsilon) * Rz(alpha0 + 90 deg) * Rx(180 deg - delta0) * Ry(W). Mesh +Y is the north pole, +X the prime meridian (texture u = 0.5) and -Z 90 deg east, matching maps centred on 0 deg longitude with east to the right. Earth keeps its dedicated orientation model. Bodies without published elements keep an illustrative pole and spin phase.

Tests in `orientation.test.ts` check the convention against the Earth model, keep the Moon's sub-Earth point within optical libration (|lon| < 8.5 deg, |lat| < 7.5 deg) and Io's sub-Jupiter point near 0 deg, and reproduce published seasons: Saturn's equinoxes (2009-08-11, 2025-05-06), Uranus's equinox (2007-12-07) with its north pole sunlit at about +70 deg in late 2026, and Mars Year 37's equinox (2022-12-26) and northern summer solstice (2023-07-12, +25.2 deg).

## Validation

`src/engine/ephemeris/ephemeris.test.ts` compares the model with JPL Horizons
vectors for 2026-01-01 and 1990-06-15 (fixtures in `horizonsFixtures.ts`,
used only by tests) and with Meeus example 47.a. The tests set tolerances from
the published accuracy, not by fitting them to this model's own output.

This is not an observation-planning or navigation ephemeris. For higher
precision, the backend's Horizons vector windows are the intended upgrade path.
