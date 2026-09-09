import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DrivingVfx} from '../client/vfx/driving.ts';
import {RaceVfx} from '../client/vfx/race.ts';
import {CourseVfx} from '../client/vfx/course.ts';
import {EnvironmentVfx} from '../client/vfx/environment.ts';
import {TRACKS} from '../shared/track.ts';
import {spawnCar} from '../shared/race.ts';

test('ten cross-track VFX replacements dispose all owned resources once and keep the source scene',()=>{
  for(let run=0;run<10;run++){
    const track=TRACKS[run%TRACKS.length],scene=new THREE.Scene(),source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());scene.add(source);
    let sourceDisposed=0;source.geometry.addEventListener('dispose',()=>sourceDisposed++);
    const effects=[new DrivingVfx(scene,track),new RaceVfx(scene,track),new CourseVfx(scene,track),new EnvironmentVfx(scene,track)] as const;
    const resources=new Set<THREE.BufferGeometry|THREE.Material>(),counts=new Map<unknown,number>();
    for(const fx of effects)fx.group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.add(m);}});
    for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));}
    const car=spawnCar(0,'local',track),f={active:true,paused:false,motion:1,quality:run%2?'low':'high',authoritative:[car]};
    effects[0].update([car],car.id,1/60,f);effects[1].update([car],car.id,null,1/60,f);effects[2].update({...f,targets:[],failed:false},1/60);effects[3].update(car,1/60,f);
    for(const fx of effects){fx.reset();fx.dispose();fx.dispose();assert.equal(fx.group.parent,null);}
    assert.ok(resources.size>15);assert.ok([...counts.values()].every(n=>n===1),`resource disposal in run ${run}`);
    assert.equal(sourceDisposed,0);assert.deepEqual(scene.children,[source]);source.geometry.dispose();source.material.dispose();
  }
});
