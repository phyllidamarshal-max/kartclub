import * as THREE from 'three';
import type { Track } from '../shared/track.ts';

/** A separate, driveable art-reference circuit. Standard races retain their course. */
export function createReferenceCourse(): Track {
  const controls = [
    [0,-10],[0,8],[-6,28],[-20,52],[-48,77],[-80,92],
    [-128,82],[-164,42],[-163,-16],[-128,-64],[-74,-95],
    [-9,-107],[43,-85],[38,-65],[20,-44],[5,-25],
  ].map(([x,z]) => new THREE.Vector3(x,0,z));
  const curve = new THREE.CatmullRomCurve3(controls,true,'centripetal');
  curve.arcLengthDivisions = 4096;
  const length = curve.getLength(), count = Math.ceil(length);
  const points = Array.from({length:count},(_,i)=>{
    const t=i/count,u=(t+.5)%1,p=curve.getPointAt(u),f=curve.getTangentAt(u);
    return {x:p.x,y:0,z:p.z,t,heading:Math.atan2(f.x,f.z)};
  });
  return Object.freeze({id:'reference-coast-v1',name:'Coast Reference Circuit',subtitle:'REFERENCE COAST',theme:'coast',
    width:14,length,points:Object.freeze(points.map(p=>Object.freeze(p))),obstacles:Object.freeze([]),shortcut:Object.freeze([]),
    radius:Math.max(...points.map(p=>Math.hypot(p.x,p.z)))+35});
}

export const REFERENCE_COURSE = createReferenceCourse();

/** Both reference views photograph the same coastal S bend from opposite sides. */
export const REFERENCE_SHOTS = {front:0.526,rear:0.512} as const;
