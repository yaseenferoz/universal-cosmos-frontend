import { Color, DirectionalLight, Group, HemisphereLight, Mesh, Quaternion, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer } from "three";
import { imageryById } from "../../data/imagery";
import type { Quality } from "../../types/celestial";
import { disposeStationObject } from "./StationAssets";
import { STATION_INITIAL_SUN_DIRECTION, type StationOrbitSnapshot } from "./StationOrbit";
import { STATION_SUNLIGHT_INTENSITY, StationSunVisual, SUN_COLOR } from "./StationSun";
import { ATMOSPHERE_SHELL_RADIUS, atmosphereLimbMaterial, injectAerialPerspective, type AtmosphereUniforms } from "./StationAtmosphere";

const EARTH_CENTER = new Vector3(0, -67.78137, 0);
/** Cloud tops are bright but not perfectly white (visible albedo ~0.8-0.9). */
const CLOUD_ALBEDO = "#eef1f4";
/** Width of the blended border of the high-resolution Africa patch, as a fraction of its UV span. */
const DETAIL_FEATHER = 0.14;

/** Separate depth pass: a 400km-altitude Earth cannot degrade meter-scale station depth.
 * Units here are 100km. Geography and lighting follow the illustrative orbit.
 */
export const STATION_SUN_DIRECTION = STATION_INITIAL_SUN_DIRECTION;
export const STATION_SUN_SKY_DISTANCE = 150;
export const STATION_SUN_SKY_RADIUS = 0.695;
export function stationEarthTexturePath(quality: Quality, maxTextureSize: number, mobile: boolean): string {
  if ((quality === "high" || quality === "auto") && maxTextureSize >= 8192 && !mobile)
    return "/textures/iss-earth-day-8192.webp";
  return imageryById.earth.surface!.variants[quality === "low" ? "medium" : "high"];
}
export function stationEarthDetailEnabled(quality: Quality, maxTextureSize: number, mobile: boolean): boolean {
  return (quality === "high" || quality === "auto") && maxTextureSize >= 4096 && !mobile;
}
export class StationBackdrop {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.01, 200);
  private readonly group = new Group();
  private readonly earthSurface = new Group();
  /** The same unfiltered sunlight that reaches the station; the atmosphere shader reddens it per point. */
  private readonly sunlight = new DirectionalLight(new Color(...SUN_COLOR), STATION_SUNLIGHT_INTENSITY);
  private readonly sun: StationSunVisual;
  private readonly sunDirection = { value: STATION_SUN_DIRECTION.clone() };
  /** Sun direction and Earth's centre in view space for the surface shaders (updated per frame). */
  private readonly sunView = { value: new Vector3() };
  private readonly centerView = { value: new Vector3() };
  private readonly irradiance = { value: new Vector3(...SUN_COLOR).multiplyScalar(STATION_SUNLIGHT_INTENSITY) };
  private readonly surfaceAtmosphere: AtmosphereUniforms = { atmoCenter: this.centerView, atmoSun: this.sunView, atmoIrradiance: this.irradiance };
  private disposed = false;
  constructor(quality: Quality, maxTextureSize: number) {
    this.scene.background = new Color("#010205");
    const earth = new Mesh(new SphereGeometry(63.78137, 160, 96), new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
    // Black Marble city lights, shown only on the night side (masked by the Sun's direction).
    earth.material.emissive.set("#ffd9a0");
    earth.material.emissiveIntensity = 0;
    earth.material.onBeforeCompile = (shader) => {
      injectAerialPerspective(shader, this.surfaceAtmosphere);
      shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance *= smoothstep(0.08, -0.18, dot(normalize(vNormal), atmoSun));`);
    };
    earth.material.customProgramCacheKey = () => "station-earth-atmosphere-v2";
    const nightUrl = imageryById.earth.night?.variants[quality === "low" ? "medium" : "high"];
    if (nightUrl) new TextureLoader().load(nightUrl, (texture) => {
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = SRGBColorSpace;
      earth.material.emissiveMap = texture;
      earth.material.emissiveIntensity = 1.4;
      earth.material.needsUpdate = true;
    });
    // Blue Marble cloud cover, ~9 km up (a static composite, not live weather). The map's faint
    // values are mostly thin haze; a contrast curve keeps cloud decks opaque without a grey veil.
    const clouds = new Mesh(new SphereGeometry(63.87, 160, 96), new MeshStandardMaterial({ color: CLOUD_ALBEDO, roughness: 1, transparent: true, depthWrite: false }));
    clouds.visible = false;
    clouds.material.onBeforeCompile = (shader) => {
      injectAerialPerspective(shader, this.surfaceAtmosphere);
      shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", `#include <alphamap_fragment>
          diffuseColor.a = smoothstep(0.06, 0.78, diffuseColor.a);`);
    };
    clouds.material.customProgramCacheKey = () => "station-clouds-atmosphere-v2";
    const cloudUrl = imageryById.earth.clouds?.variants[quality === "low" ? "medium" : "high"];
    if (cloudUrl) new TextureLoader().load(cloudUrl, (texture) => {
      if (this.disposed) { texture.dispose(); return; }
      texture.anisotropy = quality === "low" ? 2 : 8;
      clouds.material.alphaMap = texture;
      clouds.material.needsUpdate = true;
      clouds.visible = true;
    });
    this.earthSurface.position.copy(EARTH_CENTER);
    this.earthSurface.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -0.35));
    this.earthSurface.add(earth, clouds);
    // Glow beyond the limb, from each line of sight's tangent altitude (see StationAtmosphere);
    // the haze over the disk is computed in the surface shaders above.
    const atmosphere = new Mesh(new SphereGeometry(ATMOSPHERE_SHELL_RADIUS, 192, 96), atmosphereLimbMaterial({
      atmoCenter: { value: EARTH_CENTER.clone() }, atmoSun: this.sunDirection, atmoIrradiance: this.irradiance,
    }));
    atmosphere.position.copy(EARTH_CENTER);
    this.group.add(this.earthSurface, atmosphere);
    if (stationEarthDetailEnabled(quality, maxTextureSize, matchMedia("(max-width: 700px)").matches)) {
      // NASA BMNG July 2004, 10–30°E and 10°N–10°S. SphereGeometry's phi
      // starts at longitude -180°; UVs run west-east and north-south here.
      const extent = Math.PI / 9;
      const detail = new Mesh(
        new SphereGeometry(63.82, 96, 64, Math.PI + Math.PI / 18, extent, Math.PI / 2 - Math.PI / 18, extent),
        new MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, depthWrite: false }),
      );
      // Same air as the globe beneath it, and a soft border so the sharper imagery has no seam.
      detail.material.onBeforeCompile = (shader) => {
        injectAerialPerspective(shader, this.surfaceAtmosphere);
        shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", `#include <alphamap_fragment>
          #ifdef USE_MAP
            vec2 detailEdge = min(vMapUv, 1.0 - vMapUv);
            diffuseColor.a *= smoothstep(0.0, ${DETAIL_FEATHER.toFixed(2)}, detailEdge.x) * smoothstep(0.0, ${DETAIL_FEATHER.toFixed(2)}, detailEdge.y);
          #endif`);
      };
      detail.material.customProgramCacheKey = () => "station-earth-detail-atmosphere-v2";
      detail.visible = false;
      this.earthSurface.add(detail);
      new TextureLoader().load("/textures/iss-earth-africa-4096.webp", (texture) => {
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        detail.material.map = texture;
        detail.material.needsUpdate = true;
        detail.visible = true;
      }, undefined, () => { detail.visible = false; });
    }
    // A faint fill standing in for moon- and starlight, so night-side clouds are not pure black.
    this.scene.add(this.group, new HemisphereLight("#b9d4ef", "#04070d", 0.15));
    this.sunlight.position.copy(STATION_SUN_DIRECTION); this.scene.add(this.sunlight);
    // A 0.53° solar disk at 1 AU. Position is a camera-centered sky proxy;
    // its angular size/direction are preserved, not its astronomical distance.
    // The glare spans ~14° in radius, like a camera exposed for the station.
    this.sun = new StationSunVisual(STATION_SUN_SKY_RADIUS, 2 * STATION_SUN_SKY_DISTANCE * Math.tan((14 * Math.PI) / 180));
    this.sun.update(STATION_SUN_DIRECTION.clone().multiplyScalar(STATION_SUN_SKY_DISTANCE), STATION_SUN_DIRECTION);
    this.group.add(this.sun.disk, this.sun.glare);
    const url = stationEarthTexturePath(quality, maxTextureSize, matchMedia("(max-width: 700px)").matches);
    const highDetail = url.includes("8192");
    if (url) new TextureLoader().load(url, (texture) => {
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = quality === "low" ? 2 : 8;
      earth.material.map = texture; earth.material.needsUpdate = true;
    }, undefined, () => {
      if (this.disposed) return;
      // Retain a local 4K fallback if the optional 8K asset cannot be decoded.
      const fallback = imageryById.earth.surface?.variants.high;
      if (highDetail && fallback) new TextureLoader().load(fallback, (texture) => {
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
        earth.material.map = texture; earth.material.needsUpdate = true;
      });
      else earth.material.color.set("#427896");
    });
  }
  setOrbit(sample: StationOrbitSnapshot): void {
    this.earthSurface.quaternion.copy(sample.earthOrientation);
    this.sunlight.position.copy(sample.sunDirection);
    this.sunDirection.value.copy(sample.sunDirection);
    this.sun.update(this.sunPosition.copy(sample.sunDirection).multiplyScalar(STATION_SUN_SKY_DISTANCE), sample.sunDirection);
  }
  private readonly sunPosition = new Vector3();
  render(renderer: WebGLRenderer, camera: PerspectiveCamera): void {
    this.camera.fov = camera.fov; this.camera.aspect = camera.aspect;
    this.camera.quaternion.copy(camera.quaternion);
    this.sun.glare.quaternion.copy(camera.quaternion);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.sunView.value.copy(this.sunDirection.value).transformDirection(this.camera.matrixWorldInverse);
    this.centerView.value.copy(EARTH_CENTER).applyMatrix4(this.camera.matrixWorldInverse);
    renderer.render(this.scene, this.camera);
    renderer.clearDepth();
  }
  dispose(): void { this.disposed = true; this.sun.dispose(); disposeStationObject(this.group); }
}
