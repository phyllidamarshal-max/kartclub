import * as THREE from 'three';
import {trackPoint} from '../shared/track.ts';
import {REFERENCE_COURSE as track,REFERENCE_SHOTS} from './reference-course.ts';

export type ReferenceView='front'|'rear';
export const REFERENCE_CAMERAS={
  front:{distance:8.525,height:3.5,lateral:.3575,aimLateral:-.1875,aimHeight:2.02,fov:44.625,width:1536,heightPixels:1024},
  rear:{distance:-9.55,height:3.9775,lateral:2.8075,aimLateral:4.9325,aimHeight:2.35125,fov:48,width:1983,heightPixels:793},
} as const;

/** Authored staging uses real road positions and the normal vehicle model. */
export function referencePhotoPose(slot:number,view:ReferenceView){
  const front=view==='front',distance=slot?(front?(slot===1?-10:-13.5):(slot===1?18:62.2152)):0;
  const p=trackPoint(REFERENCE_SHOTS[view]+distance/track.length,track);
  const lateral=front?(slot===0?1.5:slot===1?-1.1:5.6):(slot===1?-3.2:slot===2?-5.2748:0);
  return{...p,x:p.x+Math.cos(p.heading)*lateral,z:p.z-Math.sin(p.heading)*lateral};
}
export function frameReferencePhoto(camera:THREE.PerspectiveCamera,view:ReferenceView){
  const p=referencePhotoPose(0,view),s=REFERENCE_CAMERAS[view];
  const f=new THREE.Vector3(Math.sin(p.heading),0,Math.cos(p.heading)),r=new THREE.Vector3(Math.cos(p.heading),0,-Math.sin(p.heading));
  const a=new THREE.Vector3(p.x,p.y,p.z);
  camera.position.copy(a).addScaledVector(f,s.distance).addScaledVector(r,s.lateral);camera.position.y+=s.height;
  const aim=a.clone().addScaledVector(f,view==='front'?-2:10).addScaledVector(r,s.aimLateral);aim.y+=s.aimHeight;
  camera.lookAt(aim);camera.fov=s.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
