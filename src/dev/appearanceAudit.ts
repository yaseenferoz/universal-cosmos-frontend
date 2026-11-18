import { ACESFilmicToneMapping, PCFShadowMap, Scene, Vector3, WebGLRenderer } from "three";
import { LocalCelestialService } from "../services/api/LocalCelestialService";
import { explorationProfile } from "../data/explorationProfiles";
import { PlanetaryExploration } from "../engine/core/PlanetaryExploration";
import { DeepSky } from "../engine/effects/DeepSky";
import { Starfield } from "../engine/effects/Starfield";
import { BrightStarField } from "../engine/effects/BrightStarField";
import { geodeticToCartesian } from "../engine/terrain/coordinates";
import type { Quality } from "../types/celestial";
import { qualityConfig } from "../engine/core/quality";

// Dev entry only: not imported by the application or included in its build entry.
const pause = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));
const output = document.querySelector<HTMLElement>("#results")!;
const status = document.querySelector<HTMLElement>("#status")!;
const requestedQuality = new URLSearchParams(location.search).get("quality");
const quality: Quality = requestedQuality === "medium" || requestedQuality === "high" || requestedQuality === "auto" ? requestedQuality : "low";
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(600, 360);
renderer.setPixelRatio(1);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.type = PCFShadowMap;
renderer.shadowMap.enabled = qualityConfig(quality, 1, false).shadowMapSize > 0;
renderer.setClearColor(0x000000);
const background = new Scene();
const deepSky = new DeepSky();
deepSky.setQuality(quality, false);
const stars = new Starfield(1600);
const brightStars = new BrightStarField();
brightStars.load();
background.add(deepSky.mesh, stars.points, brightStars.points);
let current: PlanetaryExploration | null = null;
let stopped = false;
window.addEventListener("pagehide", () => {
  stopped = true;
  current?.dispose();
  deepSky.dispose();
  stars.dispose();
  brightStars.dispose();
  renderer.dispose();
}, { once: true });

async function audit(): Promise<void> {
  let completed = 0;
  let failed = 0;
  const bodies = await new LocalCelestialService().getObjects();
  for (const body of bodies.filter(body => body.id !== "sun")) {
    if (stopped) return;
    const section = document.createElement("section");
    const title = document.createElement("h2");
    title.textContent = body.name;
    section.append(title);
    output.append(section);
    const profile = explorationProfile(body.id);
    if (profile.modes.surface !== "available" && profile.modes.surface !== "demonstration" && profile.modes.atmospheric !== "demonstration") {
      const note = document.createElement("p");
      note.textContent = "Orbit only — surface, daylight and night sky cannot be rendered by the installed local environment packages.";
      section.append(note);
      continue;
    }
    status.textContent = `Rendering ${body.name}…`;
    const element = document.createElement("div");
    const direction = body.id === "moon" ? geodeticToCartesian(20.19, 30.77, 0, 1) : new Vector3(1, 0, 0);
    const session = new PlanetaryExploration(element, {
      body, landingDirection: direction, quality, mobile: false,
      eyeHeightM: 1.7, onTelemetry: () => {},
    });
    current = session;
    try {
      await session.prepare({ positionM: direction.clone().multiplyScalar(body.radiusKm * 1000 + 120000), forward: direction.clone().negate(), up: new Vector3(0, 1, 0) }, 5 / 3, 360);
      if (session.error) throw new Error(session.error);
      // Yield during descent so measured tiles and photographs can finish loading.
      for (let step = 0; step < 220 && !stopped; step++) {
        session.update(0.1, direction, 1, 5 / 3, 360);
        if (step % 10 === 0) await pause(20);
      }
      if (stopped) return;
      if (!session.ready || session.navigation.phase !== "surface") throw new Error("Descent did not reach the local environment.");
      await pause(1800);
      if (stopped) return;
      const up = session.navigation.positionM.clone().normalize();
      const north = new Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
      const views = document.createElement("div");
      views.className = "views";
      section.append(views);
      for (const [label, degrees] of [["Daylight", 45], ["Sunset", 0], ["Night", -45]] as const) {
        const angle = degrees * Math.PI / 180;
        const sun = up.clone().multiplyScalar(Math.sin(angle)).addScaledVector(north, Math.cos(angle));
        for (let step = 0; step < 5; step++) session.update(0, sun, 1, 5 / 3, 360);
        const camera = session.navigation.camera;
        camera.up.copy(up);
        camera.lookAt(north.clone().addScaledVector(up, -0.09));
        camera.updateMatrixWorld();
        deepSky.update(camera.position, session.backgroundVisibility, 1, session.backgroundAdaptation);
        brightStars.update(camera.position, deepSky.ready ? session.backgroundVisibility : 0, 1, 1, session.backgroundAdaptation);
        stars.update(camera.position, 1, 1);
        stars.points.visible = !deepSky.ready || !brightStars.ready;
        stars.points.material.uniforms.exposureVisibility.value *= session.backgroundVisibility * session.backgroundAdaptation;
        renderer.render(background, camera);
        session.render(renderer);
        const figure = document.createElement("figure");
        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 360;
        canvas.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
        const caption = document.createElement("figcaption");
        caption.textContent = `${label} · Sun ${degrees}° · ${session.atmospheric ? "cloud-level; no ground" : "local terrain"}`;
        figure.append(canvas, caption);
        views.append(figure);
      }
      completed++;
    } catch (error) {
      failed++;
      const note = document.createElement("p");
      note.textContent = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
      section.append(note);
    } finally {
      session.dispose();
      current = null;
      renderer.renderLists.dispose();
    }
  }
  status.textContent = `Complete (${quality}): ${completed} environments × 3 solar angles; ${failed} failed. Remaining destinations are orbit-only.`;
  deepSky.dispose();
  stars.dispose();
  brightStars.dispose();
  renderer.dispose();
}

if (import.meta.env.DEV) void audit().catch(error => { status.textContent = `Audit failed: ${String(error)}`; });
