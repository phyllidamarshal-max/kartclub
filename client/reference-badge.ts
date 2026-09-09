import * as THREE from 'three';
import type {ReferenceView} from './reference-camera.ts';

/** Editable vector construction of the reference photo's road/checker badge. */
export function createReferenceBadge(scene:THREE.Scene){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d')!;c.scale(512/120,512/120);
  c.fillStyle='#103d29';c.beginPath();c.roundRect(0,0,120,120,22);c.fill();
  c.save();c.beginPath();c.roundRect(0,0,120,120,22);c.clip();c.fillStyle='#f5f0df';
  c.fill(new Path2D('M0 37 C38 38 64 42 60 55 C58 61 46 66 41 73 C33 85 62 96 117 115 L101 125 L61 125 C30 105 12 91 17 79 C20 69 40 59 42 53 C44 46 23 44 0 43 Z'));
  c.restore();
  c.fillStyle='#f5f0df';
  for(const [x,y]of[[75,13],[95,13],[85,23],[75,33],[95,33]])c.fillRect(x,y,10,10);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.name='reference-photo-badge';sprite.renderOrder=10000;sprite.frustumCulled=false;sprite.userData.dynamic=true;scene.add(sprite);
  let disposed=false;
  return{
    sprite,
    dispose(){if(disposed)return;disposed=true;sprite.removeFromParent();material.dispose();texture.dispose();},
    frame(camera:THREE.PerspectiveCamera,view:ReferenceView){
      sprite.visible=true;const w=view==='front'?1536:1983,h=view==='front'?1024:793,s=view==='front'?118:165,left=view==='front'?44:131,top=view==='front'?42:120;
      const distance=camera.near+.1,worldHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance;
      const local=new THREE.Vector3(((left+s/2)/w*2-1)*worldHeight*camera.aspect/2,(1-(top+s/2)/h*2)*worldHeight/2,-distance);
      camera.updateMatrixWorld(true);sprite.position.copy(local.applyMatrix4(camera.matrixWorld));sprite.scale.setScalar(s/h*worldHeight);
    },
  };
}
