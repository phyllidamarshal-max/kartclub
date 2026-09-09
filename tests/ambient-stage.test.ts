import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TRACKS } from "../shared/track.ts";
import { roadsideClear } from "../client/scenery.ts";
import {
  AMBIENT_DIRECTIONS,
  ambientDirection,
  ambientTravel,
} from "../client/ambient-direction.ts";
import { AmbientStage } from "../client/ambient-stage.ts";

test("music-derived visual profiles cover all actual maps and include breathing space", () => {
  assert.deepEqual(
    Object.keys(AMBIENT_DIRECTIONS).sort(),
    TRACKS.map((t) => t.id).sort(),
  );
  for (const d of Object.values(AMBIENT_DIRECTIONS)) {
    assert.ok(d.active > 0 && d.cycle > d.active);
    assert.equal(ambientTravel(d.active, d.cycle, d.active), 0);
    assert.equal(ambientTravel(d.cycle, d.cycle, d.active), 0);
    assert.ok(
      Math.abs(ambientTravel(d.active - 1e-5, d.cycle, d.active)) < 1e-8,
    );
  }
});
test("all mechanical stages clear the complete road, remain finite and release their scene-local resources once", () => {
  for (const track of TRACKS) {
    const scene = new THREE.Scene(),
      stage = new AmbientStage(scene, track, { groundHeight: () => -1 });
    const expected = !!ambientDirection(track.id)?.stage;
    assert.equal(stage.root.children.length > 0, expected, track.id);
    for (const actor of stage.root.children) {
      const p = actor.userData.placement;
      assert.ok(roadsideClear(track, p.x, p.z, p.radius + 1), track.id);
      assert.equal(actor.position.y, -1);
    }
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    stage.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    const counts = new Map<object, number>();
    for (const r of [...geometries, ...materials])
      r.addEventListener("dispose", () =>
        counts.set(r, (counts.get(r) || 0) + 1),
      );
    const camera =
      stage.root.children[0]?.position.clone() || new THREE.Vector3();
    for (const time of [0, 1, 6, 12, 60, 1000]) {
      stage.update(time, camera, false);
      stage.root.updateMatrixWorld(true);
      stage.root.traverse((o) =>
        assert.ok(o.matrixWorld.elements.every(Number.isFinite)),
      );
    }
    stage.update(8, camera, true);
    assert.ok(stage.root.children.filter((o) => o.visible).length <= 1);
    stage.update(8, new THREE.Vector3(1e5, 0, 1e5), false);
    assert.ok(stage.root.children.every((o) => !o.visible));
    stage.update(10, camera, false, true);
    stage.root.updateMatrixWorld(true);
    const a = stage.root.toJSON();
    stage.update(20, camera, false, true);
    stage.root.updateMatrixWorld(true);
    assert.deepEqual(stage.root.toJSON(), a);
    stage.dispose();
    stage.dispose();
    assert.equal(stage.root.parent, null);
    for (const r of counts.keys()) assert.equal(counts.get(r), 1);
    assert.equal(counts.size, geometries.size + materials.size);
  }
});

test('minecart wheels stay on railheads and piston stays engaged throughout its stroke',()=>{
 for(const id of ['mountain-summit','mine-transit','city-factory']){
  const stage=new AmbientStage(new THREE.Scene(),TRACKS.find(t=>t.id===id)!,{groundHeight:()=>0});
  const actor=stage.root.children[0],camera=actor.position.clone();
  for(let i=0;i<=40;i++){
   stage.update(i/40*ambientDirection(id)!.cycle,camera,false);
   if(id==='city-factory'){
    const rod=actor.getObjectByName('piston-rod') as THREE.Mesh,head=actor.getObjectByName('piston-head') as THREE.Mesh;
    assert.ok(rod.position.y+rod.scale.y*.5>=2.7,'rod stays inside the fixed cylinder');
    assert.ok(rod.position.y-rod.scale.y*.5<=head.position.y+.25,'rod meets piston head');
   }else{
    const cart=actor.getObjectByName('rail-cart')!;
    const wheels=cart.children.filter(o=>o.userData.ambientAnimated) as THREE.Mesh[];
    assert.equal(wheels.length,4);
    for(const wheel of wheels){
     wheel.updateMatrix();const bounds=wheel.geometry.clone().applyMatrix4(wheel.matrix);bounds.computeBoundingBox();
     // 12-sided stylized wheel is within 1.1cm of its circular contact envelope.
     assert.ok(Math.abs(cart.position.y+bounds.boundingBox!.min.y-.57)<.011);bounds.dispose();
    }
   }
  }
  stage.dispose();
 }
});
