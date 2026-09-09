import * as THREE from "three";
import { roadsideClear } from "./scenery.ts";
import {nearestTrack,roadBoundaryOpen,type Track} from "../shared/track.ts";
import {enhanceCoastTimber} from './coast-timber.ts';
import type { CoastPlacement } from "./coast-layout.ts";
import { COAST_FOOTPRINTS, coastCottageApproach } from "./coast-layout.ts";

/** Short porous stone approaches stop at the verge; they never cross a road. */
export function createCoastPaths(
  track: Track,
  layout: CoastPlacement[],
): THREE.InstancedMesh | undefined {
  const transforms: THREE.Matrix4[] = [];
  for (const house of layout.filter((p) => p.asset.startsWith("cottage"))) {
    // Match the exported outer stair edge (Blender -Y becomes glTF +Z).
    const stairEdge = ({"cottage-hero":4.67,"cottage-gable":5.02,"cottage-low":4.27}[house.asset] ?? 4.67) * house.scale;
    const approach = coastCottageApproach(house);
    const front = new THREE.Vector3(
      Math.sin(house.heading),
      0,
      Math.cos(house.heading),
    );
    for (let step = 0; step < 18; step++) {
      const depth = step === 0 ? .8 * house.scale : .76;
      const distance = stairEdge + depth / 2 + step * .8;
      const x = approach.x + front.x * distance,
        z = approach.z + front.z * distance;
      if (!roadsideClear(track, x, z, 1.2)) break;
      if (
        layout.some(
          (other) =>
            other !== house &&
            (other.asset.startsWith("cottage") ||
              other.asset === "lighthouse") &&
            Math.hypot(x - other.x, z - other.z) <
              COAST_FOOTPRINTS[other.asset] * other.scale + 1,
        )
      )
        break;
      transforms.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, house.y + .025, z),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            house.heading + (step === 0 ? 0 : Math.sin(step * 12.3) * 0.025),
          ),
          new THREE.Vector3(
            1.5 * house.scale + Math.sin(step * 2.7) * 0.06,
            0.05,
            depth,
          ),
        ),
      );
    }
  }
  if (!transforms.length) return;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ color: "#b9ad91", roughness: 1 }),
    transforms.length,
  );
  mesh.name = "coast:cottage-paths";
  transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}

/** Closed garden gates explain the doorway-to-track fence connection visually. */
export function createCoastGates(track:Track,layout:CoastPlacement[]):THREE.Group{
 const root=new THREE.Group();root.name='coast:cottage-gates';
 const geometry=new THREE.BoxGeometry(),wood=new THREE.MeshStandardMaterial({color:'#9d907b',roughness:.9}),iron=new THREE.MeshStandardMaterial({color:'#35413b',roughness:.65,metalness:.4});
 enhanceCoastTimber(wood,true);
 for(const house of layout.filter(p=>p.asset.startsWith('cottage'))){
  const origin=coastCottageApproach(house);let candidate:{x:number;y:number;z:number;heading:number;error:number}|undefined;
  for(let d=4;d<18;d+=.1){
   const x=origin.x+Math.sin(house.heading)*d,z=origin.z+Math.cos(house.heading)*d,p=nearestTrack(x,z,track);
   const lateral=(x-p.x)*Math.cos(p.heading)-(z-p.z)*Math.sin(p.heading),side=lateral<0?-1:1;
   const error=Math.abs(p.distance-p.roadWidth/2-1.25);
   if(roadBoundaryOpen(p,side,track,'main',1.25))continue;
   if(!candidate||error<candidate.error)candidate={x:p.x+Math.cos(p.heading)*side*(p.roadWidth/2+1.25),y:p.y,z:p.z-Math.sin(p.heading)*side*(p.roadWidth/2+1.25),heading:p.heading-Math.PI/2,error};
  }
  if(!candidate||candidate.error>.15)continue;
  const gate=new THREE.Group();gate.name='closed-cottage-gate';gate.position.set(candidate.x,candidate.y,candidate.z);gate.rotation.y=candidate.heading;gate.userData.closed=true;root.add(gate);
  const piece=(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;gate.add(m)};
  for(const x of [-1.06,1.06])piece(wood,x,.82,0,.2,1.64,.3);
  for(const x of [-.75,-.45,-.15,.15,.45,.75])piece(wood,x,.91,0,.13,1.06,.17);
  for(const y of [.64,1.23])piece(iron,-.92,y,.17,.35,.1,.06);
  piece(iron,.91,1.2,.17,.35,.13,.06);
 }
 if(!root.children.length){geometry.dispose();wood.dispose();iron.dispose()}
 return root;
}
