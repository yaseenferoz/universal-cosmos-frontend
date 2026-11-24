import { AdditiveBlending, BackSide, Color, DirectionalLight, Group, HemisphereLight, Mesh, ShaderMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, TextureLoader, WebGLRenderer } from "three";
import { imageryById } from "../../data/imagery";
import type { Quality } from "../../types/celestial";
import { disposeStationObject } from "./StationAssets";

/** Separate depth pass: a 400km-altitude Earth cannot degrade meter-scale station depth.
 * Units here are 100km. Geographic attitude/daylight is an illustrative fixed snapshot.
 */
export class StationBackdrop {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.01, 200);
  private readonly group = new Group();
  private disposed = false;
  constructor(quality: Quality) {
    this.scene.background = new Color("#010205");
    const earth = new Mesh(new SphereGeometry(63.78137, 96, 64), new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
    earth.position.y = -67.78137;
    earth.rotation.y = 1.2;
    earth.rotation.z = Math.PI / 2;
    const atmosphere = new Mesh(new SphereGeometry(63.94, 128, 80), new ShaderMaterial({
      vertexShader: "varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }",
      fragmentShader: "varying vec3 n; varying vec3 v; void main(){ float rim=pow(1.-abs(dot(normalize(n),normalize(v))),4.); gl_FragColor=vec4(.18,.45,.8,rim*.38); }",
      side: BackSide, transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
    atmosphere.position.copy(earth.position);
    this.group.add(earth, atmosphere);
    this.scene.add(this.group, new HemisphereLight("#b9d4ef", "#04070d", 0.3));
    const sun = new DirectionalLight("#fff7eb", 2.4);
    sun.position.set(-3, 5, 4); this.scene.add(sun);
    const tier = quality === "low" ? "low" : quality === "high" ? "high" : "medium";
    const url = imageryById.earth.surface?.variants[tier];
    if (url) new TextureLoader().load(url, (texture) => {
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = SRGBColorSpace;
      earth.material.map = texture; earth.material.needsUpdate = true;
    }, undefined, () => { if (!this.disposed) earth.material.color.set("#427896"); });
    const clouds = new Mesh(new SphereGeometry(63.83, 96, 64), new MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.88, depthWrite: false }));
    clouds.position.copy(earth.position); clouds.quaternion.copy(earth.quaternion);
    clouds.visible = false; this.group.add(clouds);
    const cloudUrl = imageryById.earth.clouds?.variants[tier];
    if (cloudUrl) new TextureLoader().load(cloudUrl, (texture) => {
      if (this.disposed) { texture.dispose(); return; }
      clouds.material.alphaMap = texture; clouds.material.needsUpdate = true; clouds.visible = true;
    });
  }
  render(renderer: WebGLRenderer, camera: PerspectiveCamera): void {
    this.camera.fov = camera.fov; this.camera.aspect = camera.aspect;
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
    renderer.clearDepth();
  }
  dispose(): void { this.disposed = true; disposeStationObject(this.group); }
}
