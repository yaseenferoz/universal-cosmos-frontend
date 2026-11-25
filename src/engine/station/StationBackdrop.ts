import { AdditiveBlending, BackSide, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, ShaderMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer } from "three";
import { imageryById } from "../../data/imagery";
import type { Quality } from "../../types/celestial";
import { disposeStationObject } from "./StationAssets";
import { STATION_INITIAL_SUN_DIRECTION, type StationOrbitSnapshot } from "./StationOrbit";

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
  private readonly sunlight = new DirectionalLight("#fff7eb", 2.4);
  private readonly sunDisk: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly sunHalo: Mesh<PlaneGeometry, ShaderMaterial>;
  private disposed = false;
  constructor(quality: Quality, maxTextureSize: number) {
    this.scene.background = new Color("#010205");
    const earth = new Mesh(new SphereGeometry(63.78137, 160, 96), new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
    this.earthSurface.position.y = -67.78137;
    this.earthSurface.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -0.35));
    this.earthSurface.add(earth);
    const atmosphere = new Mesh(new SphereGeometry(63.94, 128, 80), new ShaderMaterial({
      vertexShader: "varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }",
      fragmentShader: "varying vec3 n; varying vec3 v; void main(){ float rim=pow(1.-abs(dot(normalize(n),normalize(v))),4.); gl_FragColor=vec4(.18,.45,.8,rim*.38); }",
      side: BackSide, transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    atmosphere.position.copy(this.earthSurface.position);
    this.group.add(this.earthSurface, atmosphere);
    if (stationEarthDetailEnabled(quality, maxTextureSize, matchMedia("(max-width: 700px)").matches)) {
      // NASA BMNG July 2004, 10–30°E and 10°N–10°S. SphereGeometry's phi
      // starts at longitude -180°; UVs run west-east and north-south here.
      const extent = Math.PI / 9;
      const detail = new Mesh(
        new SphereGeometry(63.82, 96, 64, Math.PI + Math.PI / 18, extent, Math.PI / 2 - Math.PI / 18, extent),
        new MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, depthWrite: false }),
      );
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
    this.scene.add(this.group, new HemisphereLight("#b9d4ef", "#04070d", 0.3));
    this.sunlight.position.copy(STATION_SUN_DIRECTION); this.scene.add(this.sunlight);
    // A 0.53° solar disk at 1 AU. Position is a camera-centered sky proxy;
    // its angular size/direction are preserved, not its astronomical distance.
    const sunPosition = STATION_SUN_DIRECTION.clone().multiplyScalar(STATION_SUN_SKY_DISTANCE);
    this.sunDisk = new Mesh(new SphereGeometry(STATION_SUN_SKY_RADIUS, 32, 16), new MeshBasicMaterial({ color: "#fff9eb", toneMapped: false }));
    this.sunDisk.position.copy(sunPosition);
    this.sunHalo = new Mesh(new PlaneGeometry(32, 32), new ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec2 vUv; void main(){float r=length(vUv-.5)*2.; float core=exp(-r*r*35.); float glow=exp(-r*r*5.); gl_FragColor=vec4(1.,.84,.52,(core*.75+glow*.32)*(1.-smoothstep(.58,1.,r)));}",
      transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.sunHalo.position.copy(sunPosition);
    this.sunHalo.renderOrder = 1;
    this.group.add(this.sunDisk, this.sunHalo);
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
    this.sunDisk.position.copy(sample.sunDirection).multiplyScalar(STATION_SUN_SKY_DISTANCE);
    this.sunHalo.position.copy(this.sunDisk.position);
  }
  render(renderer: WebGLRenderer, camera: PerspectiveCamera): void {
    this.camera.fov = camera.fov; this.camera.aspect = camera.aspect;
    this.camera.quaternion.copy(camera.quaternion);
    this.sunHalo.quaternion.copy(camera.quaternion);
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
    renderer.clearDepth();
  }
  dispose(): void { this.disposed = true; disposeStationObject(this.group); }
}
