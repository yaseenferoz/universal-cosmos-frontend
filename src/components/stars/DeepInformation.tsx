import { ArrowLeft, ExternalLink, Navigation, Orbit, X } from "lucide-react";
import type { ReactNode } from "react";
import { MILKY_WAY_REF, type DeepRef, type DeepSkyCatalog } from "../../data/deep/deepSky";
import { GALAXY_FLAGS, galaxyDistancePc, morphologyLabel } from "../../data/deep/galaxies";
import { MILKY_WAY, milkyWayFrame, SPIRAL_ARMS } from "../../data/deep/milkyWay";
import { NEBULA_KIND_LABEL } from "../../data/deep/nebulae";
import { DEEP_SKY_GAIN_MAG } from "../../engine/deep/deepPhotometry";
import { apparentMagnitude } from "../../engine/stars/stellarPhysics";
import { useStellarStore } from "../../stores/stellarStore";
import { distanceText, formatNumber, sizeText } from "./format";
import { useDeepSkyCatalog } from "./useDeepSkyCatalog";

interface Fact { label: string; value: string }

function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="physical-grid star-facts">
      {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl>
  );
}

function Reference({ bibcode }: { bibcode: string }) {
  if (!/^\d{4}[A-Za-z&.]/.test(bibcode)) return <>{bibcode}</>;
  return (
    <a className="text-link" href={`https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(bibcode)}/abstract`} target="_blank" rel="noopener noreferrer">
      {bibcode} <ExternalLink size={10} aria-hidden="true" />
    </a>
  );
}

function Panel({ eyebrow, title, subtitle, children, label }: { eyebrow: string; title: string; subtitle: string; label: string; children: ReactNode }) {
  return (
    <section className="object-information is-expanded glass star-information deep-information" aria-label={`${label} information`}>
      <div className="panel-eyebrow">
        <span>{eyebrow}</span>
        <button className="icon-button" aria-label="Close information" onClick={() => useStellarStore.getState().selectDeep(null)}>
          <X size={14} />
        </button>
      </div>
      <h2>{title}</h2>
      <p className="star-designations">{subtitle}</p>
      {children}
    </section>
  );
}

const luminosityText = (absMag: number) => `${formatNumber(10 ** (-0.4 * (absMag - 4.83)), 2)} × Sun (visual, estimated)`;

function MilkyWayInformation() {
  const { r0Pc, sunHeightPc, thinDisk, thickDisk, bar, stellarMassSolar } = MILKY_WAY;
  return (
    <Panel eyebrow="OUR GALAXY" title="Milky Way" subtitle="Barred spiral galaxy (SBbc) · home of the Sun" label="Milky Way">
      <Facts facts={[
        { label: "Sun from the centre", value: `${distanceText(r0Pc)} (${formatNumber(r0Pc / 1000, 2)} kpc)` },
        { label: "Sun above the mid-plane", value: `${sunHeightPc} pc` },
        { label: "Disk scale length", value: `${formatNumber(thinDisk.scaleLengthPc / 1000, 1)} kpc (thick disk ${formatNumber(thickDisk.scaleLengthPc / 1000, 1)} kpc)` },
        { label: "Disk scale height", value: `${thinDisk.scaleHeightPc} pc (thick disk ${thickDisk.scaleHeightPc} pc)` },
        { label: "Bar", value: `${formatNumber(bar.halfLengthPc / 1000, 1)} kpc half-length, ${bar.angleDeg}° from the Sun–centre line` },
        { label: "Stellar mass", value: `${formatNumber(stellarMassSolar / 1e10, 1)} × 10¹⁰ × Sun` },
      ]} />
      <p className="star-system">Spiral arms: {SPIRAL_ARMS.map((arm) => arm.name).join(", ")}.</p>
      <div className="star-actions">
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyToDeep(MILKY_WAY_REF, 60_000)}>
          <Orbit size={14} /> View our Galaxy from outside
        </button>
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyTo(0)}>
          <ArrowLeft size={14} /> Fly home to the Sun
        </button>
      </div>
      <p className="star-provenance">
        Model of our Galaxy, not an image: the Sun's position and the spiral arms follow Reid et al. 2019 (maser parallaxes; arms are
        measured on our side of the Galaxy and extrapolated beyond), the Sun's height Bennett &amp; Bovy 2019, and the disk, bar and mass
        Bland-Hawthorn &amp; Gerhard 2016. Star clouds and dust are illustrative. Near the Sun the photographic sky (NASA SVS) is shown instead.
      </p>
    </Panel>
  );
}

function GalaxyInformation({ catalog, index }: { catalog: DeepSkyCatalog; index: number }) {
  const galaxies = catalog.galaxies;
  const names = galaxies.names[index] ?? ["Galaxy"];
  const distance = galaxyDistancePc(galaxies, index);
  const flags = galaxies.flags[index];
  const absMag = galaxies.absMagV[index];
  const p = galaxies.positions, n = galaxies.normals;
  const toward = [p[index * 3], p[index * 3 + 1], p[index * 3 + 2]].map((c) => c / Math.max(distance, 1e-9));
  const tilt = (Math.acos(Math.min(1, Math.abs(toward[0] * n[index * 3] + toward[1] * n[index * 3 + 1] + toward[2] * n[index * 3 + 2]))) * 180) / Math.PI;
  const error = galaxies.errorPct[index];
  const method = galaxies.methods[galaxies.method[index]] ?? "Unknown";
  const localVolume = (flags & GALAXY_FLAGS.localVolume) !== 0;
  const facts: Fact[] = [
    { label: "Type", value: `${morphologyLabel(galaxies.tType[index], flags)}${flags & GALAXY_FLAGS.peculiar ? ", peculiar" : ""}` },
    { label: "Distance from the Sun", value: `${distanceText(distance)} (${formatNumber(distance / 1e6, 2)} Mpc)` },
    { label: "Distance from", value: `${method}${Number.isFinite(error) ? ` (±${error}%)` : ""}` },
    { label: "Diameter", value: sizeText(galaxies.radiusPc[index] * 2) },
    { label: "Brightness from Earth", value: `magnitude ${apparentMagnitude(absMag, distance).toFixed(1)} (visual, estimated)` },
    { label: "Luminosity", value: luminosityText(absMag) },
    { label: "Tilt", value: flags & GALAXY_FLAGS.oriented ? `${Math.round(tilt)}° from face-on (from its axis ratio)` : "Orientation on the sky not measured" },
  ];
  return (
    <Panel eyebrow={localVolume ? "GALAXY · LOCAL VOLUME" : "GALAXY"} title={names[0]} subtitle={names.slice(1, 4).join(" · ") || "Galaxy"} label={names[0]}>
      <Facts facts={facts} />
      <div className="star-actions">
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyToDeep({ kind: "galaxy", index })}>
          <Navigation size={14} /> Fly to {names[0]}
        </button>
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyToDeep(MILKY_WAY_REF, 60_000)}>
          <ArrowLeft size={14} /> Milky Way
        </button>
      </div>
      <p className="star-provenance">
        {localVolume
          ? "Position, distance, size, inclination and luminosity from the Updated Nearby Galaxy Catalog (Karachentsev et al. 2013)."
          : `Position, size and axis ratio from the 2MASS Redshift Survey (Huchra et al. 2012)${flags & GALAXY_FLAGS.redshiftDistance
            ? `; distance from its redshift with the Hubble law (H₀ = ${galaxies.hubbleConstant} km/s/Mpc), uncertain by several Mpc because of the galaxy's own motion`
            : "; distance from Cosmicflows-4 (Tully et al. 2023)"}.`}
        {" "}Names, optical sizes and position angles from OpenNGC where listed. Which side of the disk is nearer is not known.
        The spiral pattern, dust and colours are illustrative, chosen from the galaxy's Hubble type. Galaxies are drawn {DEEP_SKY_GAIN_MAG} magnitudes
        brighter than the eye sees them, like a long exposure.
      </p>
    </Panel>
  );
}

function NebulaInformation({ catalog, index }: { catalog: DeepSkyCatalog; index: number }) {
  const nebula = catalog.nebulae.nebulae[index];
  if (!nebula) return null;
  const [sx, sy, sz] = milkyWayFrame().centre;
  const fromCentre = Math.hypot(nebula.position[0] - sx, nebula.position[1] - sy, nebula.position[2] - sz);
  const facts: Fact[] = [
    { label: "Type", value: NEBULA_KIND_LABEL[nebula.kind] },
    { label: "Distance from the Sun", value: `${distanceText(nebula.distancePc)}${nebula.distanceRange ? ` (${formatNumber(nebula.distanceRange[0], 0)}–${formatNumber(nebula.distanceRange[1], 0)} pc)` : ""}` },
    { label: "Distance from", value: nebula.method },
    { label: "Diameter", value: `${sizeText(nebula.radiusPc * 2)} (${formatNumber(nebula.angularSizeArcmin, nebula.angularSizeArcmin < 1 ? 2 : 1)}′ across)` },
    { label: "From the Galactic centre", value: distanceText(fromCentre) },
  ];
  return (
    <Panel eyebrow={NEBULA_KIND_LABEL[nebula.kind].toUpperCase()}
      title={nebula.names[0]} subtitle={nebula.names.slice(1, 4).join(" · ") || NEBULA_KIND_LABEL[nebula.kind]} label={nebula.names[0]}>
      <Facts facts={facts} />
      <div className="star-actions">
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyToDeep({ kind: "nebula", index })}>
          <Navigation size={14} /> Fly to {nebula.names[0]}
        </button>
        <button className="lunar-primary" onClick={() => useStellarStore.getState().flyTo(0)}>
          <ArrowLeft size={14} /> Sun
        </button>
      </div>
      <p className="star-provenance">
        Distance: <Reference bibcode={nebula.reference} />. Position and outline from {nebula.catalogues.join(", ")}. The size is the
        catalogued outline at this distance; the 3D structure inside is not observed and is drawn procedurally, in approximate
        emission-line colours (Hα red, [O III] teal, scattered starlight blue), brighter than the eye sees it.
      </p>
    </Panel>
  );
}

/** Facts and provenance for the selected galaxy, nebula or the Milky Way. */
export function DeepInformation({ selection }: { selection: DeepRef }) {
  const catalog = useDeepSkyCatalog();
  if (selection.kind === "milky-way") return <MilkyWayInformation />;
  if (!catalog) return null;
  return selection.kind === "galaxy" ? <GalaxyInformation catalog={catalog} index={selection.index} /> : <NebulaInformation catalog={catalog} index={selection.index} />;
}
