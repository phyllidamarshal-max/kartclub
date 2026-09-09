import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitKartPreview } from '../client/visual-camera.ts';

test('garage camera keeps every kart corner inside the visible inspection area', () => {
  const bounds=new THREE.Box3(new THREE.Vector3(-1.5,.1,-1.8),new THREE.Vector3(1.5,2.8,2.1));
  for(const [width,height] of [[1280,720],[1920,1080],[2520,1080],[540,850]])
    for(const rtl of [false,true]) for(const position of [[.6,3.9,9.5],[8.2,4.1,5.8],[-3.6,4.3,-10.5]]){
      const camera=new THREE.PerspectiveCamera(44,width/height,.2,2400);
      camera.position.fromArray(position);camera.lookAt(0,1.3,0);
      const region=width<600?{left:16,right:width-16,top:100,bottom:330}:rtl?{left:32,right:width-374,top:110,bottom:height-62}:{left:374,right:width-32,top:110,bottom:height-62};
      const rotation=camera.quaternion.clone();fitKartPreview(camera,bounds,{width,height},region);
      assert.ok(camera.quaternion.angleTo(rotation)<1e-6);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
        const p=new THREE.Vector3(x,y,z).project(camera),px=(p.x+1)*width/2,py=(1-p.y)*height/2;
        assert.ok(px>=region.left-1e-4&&px<=region.right+1e-4&&py>=region.top-1e-4&&py<=region.bottom+1e-4,`${width} ${height} ${rtl} corner ${px},${py}`);
      }
    }
});
