import * as THREE from 'three';

export interface PreviewRegion { left:number; right:number; top:number; bottom:number }

/** Fit the actual model into the unobscured UI region while preserving view direction. */
export function fitKartPreview(
  camera:THREE.PerspectiveCamera,
  bounds:THREE.Box3,
  viewport:{width:number;height:number},
  region:PreviewRegion,
):void {
  if(bounds.isEmpty()||region.right<=region.left||region.bottom<=region.top)return;
  const center=bounds.getCenter(new THREE.Vector3());
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const back=new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion);
  const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/camera.zoom,tanX=tanY*camera.aspect;
  const left=region.left/viewport.width*2-1,rightEdge=region.right/viewport.width*2-1;
  const bottom=1-region.bottom/viewport.height*2,top=1-region.top/viewport.height*2;
  const cx=(left+rightEdge)/2,cy=(bottom+top)/2;
  let distance=camera.near*2;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const relative=new THREE.Vector3(x,y,z).sub(center);
    const rx=relative.dot(right),uy=relative.dot(up),bz=relative.dot(back);
    distance=Math.max(distance,bz+camera.near*2,
      (rx/tanX+rightEdge*bz)/(rightEdge-cx),(-rx/tanX-left*bz)/(cx-left),
      (uy/tanY+top*bz)/(top-cy),(-uy/tanY-bottom*bz)/(cy-bottom));
  }
  camera.position.copy(center).addScaledVector(back,distance)
    .addScaledVector(right,-cx*distance*tanX).addScaledVector(up,-cy*distance*tanY);
  camera.updateMatrixWorld(true);
}
