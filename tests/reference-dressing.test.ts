import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { REFERENCE_COURSE } from '../client/reference-course.ts';
import { createCoastLayout, coastCottageApproach } from '../client/coast-layout.ts';
import { referenceGroundHeight } from '../client/reference-layout.ts';
import { roadsideClear } from '../client/scenery.ts';
import { buildReferenceDressing } from '../client/reference-dressing.ts';

const layout=createCoastLayout(REFERENCE_COURSE);
test('reference dressing is bounded, deterministic, and absent from standard tracks',()=>{
  const scene=new THREE.Scene();
  const group=buildReferenceDressing(scene,REFERENCE_COURSE,layout);
  const repeat=buildReferenceDressing(new THREE.Scene(),REFERENCE_COURSE,layout);
  assert.ok(group.children.length>0&&group.children.length<=4);
  assert.ok(group.userData.stats.flowers>250);
  assert.ok(group.userData.stats.triangles<90000);
  assert.deepEqual(group.userData.stats,repeat.userData.stats);
  const low=buildReferenceDressing(new THREE.Scene(),REFERENCE_COURSE,layout,true);
  assert.ok(low.userData.stats.flowers<group.userData.stats.flowers*.6);
  assert.ok(low.userData.stats.triangles<group.userData.stats.triangles*.6);
  assert.equal(low.userData.stats.posts,group.userData.stats.posts);
  const unrelated=new THREE.Scene();
  buildReferenceDressing(unrelated,{...REFERENCE_COURSE,id:'coast'},layout);
  assert.equal(unrelated.children.length,0);
});

test('every plant and garden post is road-clear and supported above the actual terrain',()=>{
  const group=buildReferenceDressing(new THREE.Scene(),REFERENCE_COURSE,layout);
  for(const item of group.userData.placements){
    assert.ok(roadsideClear(REFERENCE_COURSE,item.x,item.z,item.radius),item.kind+' road conflict');
    assert.ok(Math.abs(item.y-referenceGroundHeight(item.x,item.z,REFERENCE_COURSE))<1e-5,item.kind+' ground mismatch');
    for(const house of layout.filter(h=>h.asset.startsWith('cottage'))){
      const door=coastCottageApproach(house),dx=item.x-door.x,dz=item.z-door.z;
      const front=dx*Math.sin(house.heading)+dz*Math.cos(house.heading);
      const side=dx*Math.cos(house.heading)-dz*Math.sin(house.heading);
      assert.ok(!(front>3.5*house.scale&&front<18&&Math.abs(side)<1.05+item.radius),'door approach obstructed');
    }
  }
  for(const child of group.children){
    const mesh=child as THREE.Mesh,geometry=mesh.geometry;
    const position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++)assert.ok(position.getY(i)>=referenceGroundHeight(position.getX(i),position.getZ(i),REFERENCE_COURSE)-.055,'unsupported decoration vertex');
  }
});
