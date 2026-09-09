import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TRACKS} from '../shared/track.ts';
import {getLevel} from '../shared/levels.ts';
import {createLevelSky,sceneStyle,enhanceWorldSurface} from '../client/scene-style.ts';

test('all registered map styles have finite neutral lighting and preserve distinct skies',()=>{
 const palettes=new Set<string>();
 for(const track of TRACKS){const level=getLevel(track.id),style=sceneStyle(level),a=createLevelSky(new THREE.Scene(),level),b=createLevelSky(new THREE.Scene(),level);
  assert.ok(style.ambient>=2 && style.ambient<=2.5);assert.ok(style.environment>0 && style.exposure<1.2);
  assert.ok(a.material.uniforms.sunDirection.value.distanceTo(new THREE.Vector3(52,54,-33).normalize())<1e-10);
  assert.equal(a.material.uniforms.zenith.value.getHexString(),new THREE.Color(level.sky).getHexString());
  assert.deepEqual(a.material.uniforms,b.material.uniforms);assert.ok(!('clock' in a.material.uniforms));
  if(['mine','space'].includes(level.biome))assert.equal(a.material.uniforms.cloudStrength.value,0);
  palettes.add(style.road);a.geometry.dispose();a.material.dispose();b.geometry.dispose();b.material.dispose();
 }assert.equal(palettes.size,9);
});

test('surface shader variants stay separate through batching and require no allocated textures',()=>{
 const keys=new Set<string>();
 for(const track of TRACKS)for(const kind of ['ground','road'] as const){const material=new THREE.MeshStandardMaterial();enhanceWorldSurface(material,getLevel(track.id).biome,kind);keys.add(material.customProgramCacheKey());assert.equal(material.map,null);assert.equal(material.transparent,false);material.dispose()}
 assert.equal(keys.size,18);
});
