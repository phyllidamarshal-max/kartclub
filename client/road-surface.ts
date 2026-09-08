import * as THREE from "three";
import {
  angleDiff,
  trackPoint,
  trackWidth,
  type Track,
} from "../shared/track.ts";

/** Fine, distance-filtered aggregate changes the surface lighting, without a second texture. */
export function enhanceAsphalt(material: THREE.MeshStandardMaterial) {
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.vertexShader =
      "varying vec3 kcRoadPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n kcRoadPosition=(modelMatrix*vec4(transformed,1.)).xyz;",
    );
    shader.fragmentShader =
      `varying vec3 kcRoadPosition;
      float kcRoadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float kcRoadNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(kcRoadHash(i),kcRoadHash(i+vec2(1.,0.)),f.x),
          mix(kcRoadHash(i+vec2(0.,1.)),kcRoadHash(i+vec2(1.,1.)),f.x),f.y);}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #include <map_fragment>
      vec2 kcP=kcRoadPosition.xz;
      float kcFootprint=max(length(dFdx(kcP)),length(dFdy(kcP)));
      float kcDetail=1.-smoothstep(.055,.28,kcFootprint);
      float kcGrain=kcRoadNoise(kcP*17.7);
      float kcChip=kcRoadNoise(kcP*41.3);
      float kcMacro=kcRoadNoise(kcP*.19);
      diffuseColor.rgb*=mix(1.,.91+kcGrain*.15,kcDetail)*(.965+kcMacro*.07);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor-.065*kcMacro+.035*kcGrain*kcDetail,.79,.99);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      float kcHeight=(kcGrain*.011+kcChip*.004)*kcDetail;
      vec3 kcDx=normalize(dFdx(-vViewPosition));
      vec3 kcDy=normalize(dFdy(-vViewPosition));
      vec3 kcR1=cross(kcDy,normal),kcR2=cross(normal,kcDx);
      float kcDet=dot(kcDx,kcR1)*faceDirection;
      vec3 kcGradient=sign(kcDet)*(dFdx(kcHeight)*kcR1+dFdy(kcHeight)*kcR2);
      normal=normalize(max(abs(kcDet),.0001)*normal-kcGradient);
    `,
    );
  };
  material.customProgramCacheKey = () => "kart-coast-asphalt-aggregate-v1";
  material.needsUpdate = true;
}

/** Static rubber traces on bends. No colliders, no per-frame work, one material. */
export function addRoadWear(scene: THREE.Scene, track: Track) {
  const vertices: number[] = [],
    colors: number[] = [];
  const count = Math.max(240, Math.ceil(track.length / 1.5));
  function point(t: number, lane: number, width: number, edge: number) {
    const p = trackPoint(t, track),
      limit = trackWidth(t, track) / 2 - 1;
    const side = Math.max(-limit, Math.min(limit, lane + edge * width));
    return [
      p.x + Math.cos(p.heading) * side,
      p.y + 0.072,
      p.z - Math.sin(p.heading) * side,
    ];
  }
  for (let i = 0; i < count; i++) {
    const t = i / count,
      q = (i + 1) / count;
    const a = trackPoint(t - 0.012, track),
      b = trackPoint(t + 0.012, track);
    const turn = angleDiff(b.heading, a.heading);
    const amount = Math.min(0.32, Math.max(0, (Math.abs(turn) - 0.05) * 0.55));
    if (amount <= 0.006) continue;
    const line =
      -Math.sign(turn) * Math.min(1.9, Math.abs(turn) * 2.5) +
      Math.sin(t * 37) * 0.4;
    for (const tire of [-0.88, 0.88]) {
      const width = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(t * 83));
      const p0 = point(t, line + tire, width, -1),
        p1 = point(t, line + tire, width, 1);
      const p2 = point(q, line + tire, width, -1),
        p3 = point(q, line + tire, width, 1);
      vertices.push(...p0, ...p2, ...p1, ...p2, ...p3, ...p1);
      const fade = amount * (0.58 + 0.42 * Math.sin(t * 263) ** 2);
      for (let j = 0; j < 6; j++) colors.push(0.025, 0.03, 0.028, fade);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const wear = new THREE.Mesh(geometry, material);
  wear.name = "coast-road-wear";
  wear.castShadow = false;
  wear.receiveShadow = false;
  scene.add(wear);
}
