import * as THREE from 'three';
import { trackPoint, nearestTrack, type Track } from '../shared/track.ts';
import {REFERENCE_COURSE} from './reference-course.ts';
import type { CoastPlacement } from './coast-layout.ts';
import { roadsideClear, worldUV } from './scenery.ts';
import {coastalShoreMargin} from './coast-details.ts';

/** Raised village headland, outside the driveable ribbon. */
const HILL_BUILDINGS=[
  {asset:'lighthouse',x:-24,z:110,scale:1.2,heading:Math.PI,radius:3.84},
  // Stagger rooflines across the photographed headland; every pad follows its
  // actual building, rather than leaving a hidden house behind a front facade.
  {asset:'cottage-gable',x:-35.4,z:111,scale:1.3,heading:Math.PI-.12,radius:7.02},
  {asset:'cottage-low',x:-44.5,z:100.5,scale:1.02,heading:Math.PI+.08,radius:5.712},
  {asset:'cottage-hero',x:-57,z:112,scale:1.35,heading:Math.PI-.10,radius:7.425},
  {asset:'cottage-gable',x:-72,z:115,scale:1.05,heading:Math.PI+.15,radius:5.67},
];
function rawHill(x:number,z:number){
  const r2=((x+39)/47)**2+((z-109)/30)**2;
  return -.18+9.5*Math.max(0,1-r2)**2;
}
export function referenceGroundHeight(x:number,z:number,track:Track=REFERENCE_COURSE) {
  let height=rawHill(x,z);
  if(height<=-.18)return height;
  // Level each complete footprint; a short shoulder blends the pad into the hill.
  const pads=HILL_BUILDINGS.map(b=>({b,d:Math.hypot(b.x-x,b.z-z)-b.radius})).filter(p=>p.d<3);
  const inside=pads.find(p=>p.d<=0);
  if(inside)height=rawHill(inside.b.x,inside.b.z);
  else{
    // Continuous overlapping shoulders: choosing only the nearest pad creates
    // a vertical seam when two differently elevated gardens meet.
    let total=1,blended=height;
    for(const pad of pads){const u=1-pad.d/3,w=u*u*(3-2*u),weight=w/Math.max(1e-7,1-w);total+=weight;blended+=rawHill(pad.b.x,pad.b.z)*weight;}
    height=blended/total;
  }
  // The 5 m shoulder also protects against triangle interpolation crossing a road.
  const d=nearestTrack(x,z,track).distance,u=Math.max(0,Math.min(1,(d-12)/3));
  return -.18+(height+.18)*u*u*(3-2*u);
}
export function buildReferenceHeadland(scene:THREE.Scene,grass:THREE.Material,track:Track=REFERENCE_COURSE) {
  const geometry=new THREE.RingGeometry(0,1,72,20);
  geometry.rotateX(-Math.PI/2);geometry.scale(47,1,30);geometry.translate(-39,0,109);
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setY(i,referenceGroundHeight(p.getX(i),p.getZ(i),track)+.003);
  geometry.computeVertexNormals();worldUV(geometry,6);
  const mesh=new THREE.Mesh(geometry,grass);mesh.name='reference-village-headland';
  mesh.receiveShadow=true;scene.add(mesh);
}

/** Authored composition in world metres; both photo views use the same assets. */
export function createReferenceLayout(track:Track,footprints:Record<string,number>):CoastPlacement[] {
  const result:CoastPlacement[]=[];
  const solid=(asset:string)=>/^(cottage|tree)|lighthouse/.test(asset);
  function add(asset:string,x:number,z:number,scale=1,heading=0,y=referenceGroundHeight(x,z,track)) {
    const radius=footprints[asset]*scale;
    if(!roadsideClear(track,x,z,radius+.35))return;
    if(solid(asset)&&result.some(o=>solid(o.asset)&&Math.hypot(o.x-x,o.z-z)<footprints[o.asset]*o.scale+radius+.3))return;
    const item={asset,x,y,z,scale,heading};result.push(item);return item;
  }
  // The front view follows a shallow row of cottages on the landward side.
  for(const [asset,metres,setback,scale,angle] of [
    ['cottage-hero',-8,14.5,1.8,.10],['cottage-gable',-29,12,1.48,-.08],
    ['cottage-hero',-48,10.5,1.22,.04],['cottage-low',-65,10,1.15,-.10],
    ['cottage-gable',-83,9.8,1.15,.04],['cottage-low',-100,9,.98,0],
    ['cottage-hero',-117,9.1,.98,0],
  ] as const){
    const p=trackPoint(.5+metres/track.length,track),d=7+setback;
    add(asset,p.x-Math.cos(p.heading)*d,p.z+Math.sin(p.heading)*d,scale,p.heading+Math.PI/2+angle);
  }
  // The rear view reveals the same island's distant lighthouse village.
  for(const b of HILL_BUILDINGS)add(b.asset,b.x,b.z,b.scale,b.heading);
  add('tree-round',-16,-42,2.15,Math.PI*.9);
  add('tree-oak',-33,-14,1.55,Math.PI*.85);
  // Actual GLB-vertex fit against the fixed rear camera, with uniform scale.
  add('tree-round',16.4324,23.7332,2.25646,3.38526);
  add('tree-blossom',-37.0535,46.6658,2.30830,.20315);
  add('tree-oak',-71,118,1.25,Math.PI);
  add('tree-round',-3,99,.82,Math.PI);
  add('tree-round',-69,91,.9,Math.PI);
  add('tree-round',-16,121,.9,Math.PI);
  let seed=28161;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<68;i++){
    const t=i/68,p=trackPoint(t,track);
    if(t>.36&&t<.73)continue;
    const d=17+random()*15;
    add(i%3?'tree-round':'tree-oak',p.x-Math.cos(p.heading)*d,p.z+Math.sin(p.heading)*d,.8+random()*.4,random()*6.28);
  }
  // Clustered beds leave quiet gaps and keep the road edge readable.
  for(let i=0;i<660;i++){
    const t=i<430?.38+random()*.36:random(),p=trackPoint(t,track),side=i%3===0?-1:1;
    const d=8.8+random()*4.7,x=p.x+Math.cos(p.heading)*side*d,z=p.z-Math.sin(p.heading)*side*d;
    const asset=i%9===0?'shrub-cluster':'meadow-patch',scale=.48+random()*.36;
    if(result.some(o=>solid(o.asset)&&Math.hypot(o.x-x,o.z-z)<footprints[o.asset]*o.scale+.9))continue;
    add(asset,x,z,scale,random()*6.28);
  }
  for(let i=0;i<58;i++){
    const t=i/58,p=trackPoint(t,track),d=7.9+coastalShoreMargin(t,track);
    if(t>.62&&t<.74)continue;
    const scale=2.5+random()*.7;
    add('rock-cluster',p.x+Math.cos(p.heading)*d,p.z-Math.sin(p.heading)*d,scale,random()*6.28,-1.742078*scale-.3);
  }
  return result;
}
