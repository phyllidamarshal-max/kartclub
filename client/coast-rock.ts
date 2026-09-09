import * as THREE from "three";

/** Continuous strata on the existing cliff shell; the authored ledges provide its silhouette. */
export function enhanceCoastCliff(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 coastRockPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n coastRockPosition=(modelMatrix*vec4(transformed,1.)).xyz;",
    );
    shader.fragmentShader =
      `varying vec3 coastRockPosition;
      float coastRockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float coastRockNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(coastRockHash(i),coastRockHash(i+vec3(1,0,0)),f.x),mix(coastRockHash(i+vec3(0,1,0)),coastRockHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(coastRockHash(i+vec3(0,0,1)),coastRockHash(i+vec3(1,0,1)),f.x),mix(coastRockHash(i+vec3(0,1,1)),coastRockHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #include <map_fragment>
      vec3 rockP=coastRockPosition;
      float rockMacro=coastRockNoise(rockP*vec3(.28,.75,.28));
      float rockGrain=coastRockNoise(rockP*13.);
      float rockDetail=1.-smoothstep(.06,.3,max(length(dFdx(rockP)),length(dFdy(rockP))));
      float rockStrata=sin(rockP.y*8.+rockMacro*2.4);
      diffuseColor.rgb*=.83+.17*rockMacro+.045*rockStrata+.07*rockGrain*rockDetail;
      diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb,smoothstep(-7.2,-4.3,rockP.y));
    `,
    );
  };
  material.customProgramCacheKey = () => "coast-cliff-strata-v1";
}
