import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TRACKS} from '../shared/track.ts';
import {getLevel} from '../shared/levels.ts';
import {buildLandscape,roadsideClear} from '../client/scenery.ts';
import {buildLevelLandscape} from '../client/level-scenery.ts';
import {buildVergeDetails,updateVergeDetails} from '../client/verge-details.ts';

for(const track of TRACKS)test(`${track.id}: static verge plants stay off both roads and rest on the actual terrain`,()=>{
 const scene=new THREE.Scene(),groundMaterial=new THREE.MeshStandardMaterial(),biome=getLevel(track.id).biome;
 if(biome==='coast')buildLandscape(scene,track,groundMaterial);else buildLevelLandscape(scene,track,groundMaterial);
 scene.updateMatrixWorld(true);const ground=[...scene.children];const group=buildVergeDetails(scene,track),data=group.userData.vergeDetails;
 if(!data){assert.ok(['harbor','city','factory','space'].includes(biome));return;}
 assert.ok(data.patches>100&&data.patches<=600);assert.equal(data.patches,data.placements.length);
 const ray=new THREE.Raycaster();ray.far=12;
 for(const [i,p] of data.placements.entries()){
  assert.ok(roadsideClear(track,p.x,p.z,p.radius+.4));
  if(i%25===0){ray.set(new THREE.Vector3(p.x,p.y+6,p.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(ground,true)[0];assert.ok(hit,'plant must have ground');assert.ok(Math.abs(hit.point.y-p.y)<.015,`${track.id}: grounding ${hit.point.y-p.y}`);}
 }
 const camera=new THREE.Vector3(track.points[0].x,6,track.points[0].z);updateVergeDetails(group,camera,false);const high=group.children.filter(m=>m.visible).length;updateVergeDetails(group,camera,true);assert.ok(group.children.filter(m=>m.visible).length<=high);
 const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();group.traverse(m=>{if(m instanceof THREE.Mesh){geos.add(m.geometry);for(const mat of [m.material].flat())mats.add(mat);assert.equal(m.castShadow,false);assert.ok(m instanceof THREE.InstancedMesh)}});assert.equal(geos.size,1);assert.equal(mats.size,1);geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
});
