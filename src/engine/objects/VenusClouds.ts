import type { MeshStandardMaterial } from "three";

/** Low-contrast visible-light cloud reconstruction. No radar/UV map is called true color. */
export function configureVenusClouds(material: MeshStandardMaterial): void {
  material.color.set("#e7d9b5");
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 cloudDirection;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ncloudDirection = normalize(position);");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 cloudDirection;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 p = normalize(cloudDirection);
        float flow = sin(p.y * 23.0 + 2.0 * sin(p.x * 5.0 + p.z * 4.0));
        float fine = sin(p.x * 31.0 + p.y * 19.0) * sin(p.z * 29.0 - p.y * 11.0);
        diffuseColor.rgb *= 0.96 + 0.028 * flow + 0.012 * fine;`);
  };
  material.customProgramCacheKey = () => "venus-visible-cloud-reconstruction-v1";
}
