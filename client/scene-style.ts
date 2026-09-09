import * as THREE from 'three';
import type { Biome, LevelDefinition } from '../shared/levels.ts';
import { createCoastSky } from './coast-sky.ts';

/** The reference's neutral fill, warm key and restrained surfaces, per biome. */
export function sceneStyle(level: LevelDefinition) {
  const night = ['city', 'space', 'mine'].includes(level.biome);
  const cold = level.biome === 'ice' || level.biome === 'space';
  return {
    version: 'club-world-v1',
    exposure: level.biome === 'coast' ? 1.05 : 1.08,
    hemisphereSky: cold ? '#d6e8ff' : night ? '#b6c4e2' : '#dfebec',
    hemisphereGround: cold ? '#879fb4' : night ? '#887e87' : '#af9e83',
    ambient: night ? 2.15 : 2.05,
    sunColor: cold ? '#e4f2ff' : night ? '#f5d4b5' : '#ffe6bf',
    sun: night ? 2.25 : level.biome === 'forest' ? 3.0 : 3.15,
    environment: night ? 0.72 : 0.58,
    road: ({ coast:'#c4b9aa',harbor:'#c9c1bd',desert:'#ba9a66',city:'#c4cbd8',factory:'#c4bba8',space:'#9eafc5',forest:'#9a8968',ice:'#a4c5d7',mine:'#b8a69d' } satisfies Record<Biome,string>)[level.biome],
    ground: ({ coast:'#b2b765',harbor:'#989b91',desert:'#d7aa6b',city:'#4c5768',factory:'#929183',space:'#586981',forest:'#a4af6c',ice:'#d3e1e8',mine:'#82716b' } satisfies Record<Biome,string>)[level.biome],
  };
}

/** Static sky with the same lighting azimuth as the scene's directional light. */
export function createLevelSky(scene: THREE.Scene, level: LevelDefinition) {
  const sky = createCoastSky(scene), u = sky.material.uniforms;
  sky.name = `${level.biome}-static-sky`;
  sky.material.name = `${level.biome}-directional-atmosphere`;
  const night = ['city','space','mine'].includes(level.biome);
  u.zenith.value.set(level.sky);
  u.coolHorizon.value.set(level.horizon).lerp(new THREE.Color(level.sky), night ? .38 : .10);
  u.warmHorizon.value.set(level.horizon);
  u.cloudLight.value.set(level.biome === 'ice' ? '#f3f7f7' : '#fff0d5');
  u.cloudShade.value.set(level.biome === 'harbor' ? '#c89c9d' : '#a8bec4');
  u.cloudStrength.value = level.biome === 'space' || level.biome === 'mine' ? 0 : night ? .12 : .83;
  u.sunDirection.value.set(52,54,-33).normalize();
  sky.userData.lighting = 'shared fixed world sun: 52,54,-33; per-biome static palette';
  return sky;
}

/** Fine geometric surface cues. No animation, extra texture, or driving state. */
export function enhanceWorldSurface(material: THREE.MeshStandardMaterial, biome: Biome, kind: 'ground'|'road') {
  const slabs = ['city','factory','harbor','space'].includes(biome);
  const frozen = biome === 'ice';
  material.userData.surfaceStyle = { biome, kind };
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 clubSurfacePosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nclubSurfacePosition=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = `varying vec3 clubSurfacePosition;
      float clubHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float clubNoise(vec2 p){vec2 a=floor(p),b=fract(p);b=b*b*(3.-2.*b);return mix(mix(clubHash(a),clubHash(a+vec2(1.,0.)),b.x),mix(clubHash(a+vec2(0.,1.)),clubHash(a+1.),b.x),b.y);}
      ${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 groundUV=clubSurfacePosition.xz;
      float mottling=clubNoise(groundUV*.13)*.65+clubNoise(groundUV*.48)*.35;
      diffuseColor.rgb *= ${kind==='ground' ? (frozen ? '.94+mottling*.10' : '.83+mottling*.26') : '.95+mottling*.09'};
      ${kind==='ground' && slabs ? `vec2 slabCell=abs(fract(groundUV/${biome==='space'?'4.':'6.'})-.5);vec2 slabAA=max(fwidth(groundUV/${biome==='space'?'4.':'6.'}),vec2(.002));float joint=max(smoothstep(.485-slabAA.x,.497,slabCell.x),smoothstep(.485-slabAA.y,.497,slabCell.y));diffuseColor.rgb*=1.-joint*.16;` : ''}
      ${biome==='desert' ? 'float ridge=sin(groundUV.x*.9+clubNoise(groundUV*.055)*8.)*.5+.5;diffuseColor.rgb*=.97+ridge*.06;' : ''}
      ${biome==='coast' ? 'float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=mix(vec3(luma),diffuseColor.rgb,.8);' : ''}
      `);
  };
  material.customProgramCacheKey = () => `club-surface-v1/${biome}/${kind}`;
}
