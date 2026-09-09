import * as THREE from "three";

/** Grain follows each instanced beam, in metres, including its nonuniform scale. */
export function enhanceCoastTimber(
  material: THREE.MeshStandardMaterial,
  upright = false,
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 timberLocal;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      timberLocal=position;
      #ifdef USE_INSTANCING
        timberLocal*=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      #endif
    `,
    );
    shader.fragmentShader =
      `varying vec3 timberLocal;
      float timberHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float timberNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(timberHash(i),timberHash(i+vec2(1.,0.)),f.x),mix(timberHash(i+vec2(0.,1.)),timberHash(i+1.),f.x),f.y);}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #include <map_fragment>
      vec2 timberUV=vec2(${upright ? "timberLocal.x+timberLocal.z,timberLocal.y" : "timberLocal.x+timberLocal.y,timberLocal.z"});
      float timberFootprint=max(length(dFdx(timberUV)),length(dFdy(timberUV)));
      float timberDetail=1.-smoothstep(.02,.13,timberFootprint);
      float timberGrain=timberNoise(timberUV*vec2(67.,2.5));
      float timberBroad=timberNoise(timberUV*vec2(15.,.7));
      diffuseColor.rgb*=mix(1.,.84+timberGrain*.25,timberDetail)*(.94+timberBroad*.09);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      float timberHeight=(timberGrain-.5)*.007*timberDetail;
      vec3 timberDx=normalize(dFdx(-vViewPosition)),timberDy=normalize(dFdy(-vViewPosition));
      vec3 timberR1=cross(timberDy,normal),timberR2=cross(normal,timberDx);
      float timberDet=dot(timberDx,timberR1)*faceDirection;
      normal=normalize(max(abs(timberDet),.0001)*normal-sign(timberDet)*(dFdx(timberHeight)*timberR1+dFdy(timberHeight)*timberR2));
    `,
    );
  };
  material.customProgramCacheKey = () => `coast-timber-v1-${upright}`;
}
