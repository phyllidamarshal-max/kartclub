import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REFERENCE_COURSE} from '../client/reference-course.ts';
import {nearestTrack,trackPoint,trackWidth,DEFAULT_TRACK,TRACKS} from '../shared/track.ts';
import {spawnCar,stepCar,EMPTY_INPUT} from '../shared/race.ts';
import * as THREE from 'three';
import {buildReferenceHeadland,referenceGroundHeight} from '../client/reference-layout.ts';
import {createCoastLayout,COAST_FOOTPRINTS} from '../client/coast-layout.ts';
import {roadsideClear} from '../client/scenery.ts';

test('reference sample uses a smooth closed actual physics ribbon without changing registered races',()=>{
  const track=REFERENCE_COURSE;
  assert.ok(track.length>400&&track.length<900);
  assert.equal(TRACKS.some(t=>t.id===track.id),false);
  assert.notEqual(DEFAULT_TRACK,track);
  for(const p of track.points){
    assert.ok(Number.isFinite(p.x+p.z+p.heading));
    assert.ok(nearestTrack(p.x,p.z,track).distance<.001);
    assert.equal(trackWidth(p.t,track),14);
  }
  const first=trackPoint(0,track),last=trackPoint(1-1/track.length,track);
  assert.ok(Math.hypot(first.x-last.x,first.z-last.z)<1.1);
  assert.ok(Math.abs(Math.atan2(Math.sin(first.heading-last.heading),Math.cos(first.heading-last.heading)))<.15);
  const car=spawnCar(0,'reference',track),start={x:car.x,z:car.z};
  for(let i=0;i<60;i++)stepCar(car,{...EMPTY_INPUT,throttle:1},1/60,track);
  assert.ok(Math.hypot(car.x-start.x,car.z-start.z)>1,'sample must use real driving integration');
});

test('rendered headland stays below the entire real road ribbon, including triangle interpolation',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  buildReferenceHeadland(scene,material,REFERENCE_COURSE);scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(let i=0;i<240;i++){
    const p=trackPoint(.6+i/240*.18,REFERENCE_COURSE);
    for(let lane=-7;lane<=7;lane+=1){
      const x=p.x+Math.cos(p.heading)*lane,z=p.z-Math.sin(p.heading)*lane;
      ray.set(new THREE.Vector3(x,30,z),new THREE.Vector3(0,-1,0));
      for(const hit of ray.intersectObjects(scene.children))assert.ok(hit.point.y<-.12,`road buried at ${p.t}, ${lane}: ${hit.point.y}`);
    }
  }
  (scene.children[0] as THREE.Mesh).geometry.dispose();material.dispose();
});

test('reference assets clear driving surfaces and house foundations sit on level terrain',()=>{
  const layout=createCoastLayout(REFERENCE_COURSE);
  assert.ok(layout.some(o=>o.asset==='tree-blossom'),'pink framing tree must be placed');
  for(const p of layout){assert.ok(roadsideClear(REFERENCE_COURSE,p.x,p.z,COAST_FOOTPRINTS[p.asset]*p.scale+.35));
    if(p.asset.startsWith('cottage')&&p.y>0){
      for(const dx of[-2.9,0,2.9])for(const dz of[-2.8,0,2.8]){
        const x=p.x+(Math.cos(p.heading)*dx+Math.sin(p.heading)*dz)*p.scale,z=p.z+(-Math.sin(p.heading)*dx+Math.cos(p.heading)*dz)*p.scale;
        assert.ok(Math.abs(referenceGroundHeight(x,z,REFERENCE_COURSE)-p.y)<.08,`${p.asset} foundation height mismatch`);
      }
    }
  }
});
