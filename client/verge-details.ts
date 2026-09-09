import * as THREE from 'three';
import {getLevel} from '../shared/levels.ts';
import {trackPoint,trackWidth,type Track} from '../shared/track.ts';
import {roadsideClear} from './scenery.ts';
import {coastalShoreMargin} from './coast-details.ts';

type Placement={x:number;y:number;z:number;scale:number;heading:number;radius:number};
/** Sample the actual triangulated terrain, so small props sit on rendered ground. */
export function terrainGroundSampler(scene:THREE.Scene){
 const mesh=scene.getObjectByName('level-terrain') as THREE.Mesh<THREE.PlaneGeometry>|undefined;
 if(!mesh)return ()=>-.18;
 const g=mesh.geometry,p=g.getAttribute('position'),n=g.parameters.widthSegments,w=g.parameters.width,d=g.parameters.height;
 // Retain only heights: static batching disposes the original geometry afterward.
 const heights=Float32Array.from({length:p.count},(_,i)=>p.getY(i));
 return (x:number,z:number)=>{const u=(x/w+.5)*n,v=(z/d+.5)*n,i=Math.max(0,Math.min(n-1,Math.floor(u))),j=Math.max(0,Math.min(n-1,Math.floor(v))),a=j*(n+1)+i,fx=u-i,fz=v-j;
  const ya=heights[a],yb=heights[a+n+1],yc=heights[a+n+2],yd=heights[a+1];
  return fx+fz<=1?ya+(yd-ya)*fx+(yb-ya)*fz:yc+(yb-yc)*(1-fx)+(yd-yc)*(1-fz);
 };
}

/** Small static shoulder plants and stones; no objects enter either driveable ribbon. */
export function buildVergeDetails(scene:THREE.Scene,track:Track):THREE.Group {
 const group=new THREE.Group();group.name='club-verge-details';
 const biome=getLevel(track.id).biome;
 if(!['coast','forest','desert','ice','mine'].includes(biome)||track.id==='reference-coast-v1')return group;
 let seed=91213;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const ground=terrainGroundSampler(scene),placements:Placement[]=[],count=Math.min(600,Math.ceil(track.length/5));
 for(let i=0;i<count;i++){
  const p=trackPoint((i+.23+random()*.54)/count,track),side=i%2?1:-1,scale=.8+random()*.45,radius=1.15*scale,setback=2.8+random()*5;
  if(biome==='coast'&&side>0&&setback+radius>coastalShoreMargin(p.t,track)-.45)continue;
  const offset=trackWidth(p.t,track)/2+setback,x=p.x+Math.cos(p.heading)*offset*side,z=p.z-Math.sin(p.heading)*offset*side;
  if(!roadsideClear(track,x,z,radius+.45))continue;
  placements.push({x,y:ground(x,z),z,scale,heading:random()*6.28,radius});
 }
 if(!placements.length)return group;
 const positions:number[]=[],colors:number[]=[];
 const tri=(a:number[],b:number[],c:number[],color:THREE.Color)=>{positions.push(...a,...b,...c);for(let j=0;j<3;j++)colors.push(color.r,color.g,color.b)};
 const leaves=(biome==='desert'?['#93814b','#c1a36d','#ae955d']:['#667e39','#8d9f4d','#a6ac54']).map(c=>new THREE.Color(c));
 const flowers=['#eee7ca','#d8b54b'].map(c=>new THREE.Color(c));
 if(!['ice','mine'].includes(biome))for(let tuft=0;tuft<3;tuft++){
  const x=(tuft-1)*.5,z=(tuft%2)*.44;
  for(let blade=0;blade<5;blade++){
   const a=blade*2.399+tuft,c=Math.cos(a),s=Math.sin(a),h=.34+(blade%3)*.1,lean=.22;
   tri([x-s*.04,0,z+c*.04],[x+c*.1,h*.5,z+s*.1],[x+s*.04,0,z-c*.04],leaves[blade%3]);
   tri([x-s*.04,0,z+c*.04],[x+c*lean,h,z+s*lean],[x+c*.1,h*.5,z+s*.1],leaves[(blade+1)%3]);
  }
  if(biome!=='desert')for(let bloom=0;bloom<2;bloom++){
   const cx=x+bloom*.22,cz=z-.22,h=.32+bloom*.09;
   tri([cx-.012,0,cz],[cx,h,cz],[cx+.012,0,cz],leaves[0]);
   for(let petal=0;petal<5;petal++){const a=petal*Math.PI*2/5;tri([cx,h,cz],[cx+Math.cos(a-.33)*.13,h+.015,cz+Math.sin(a-.33)*.13],[cx+Math.cos(a+.33)*.13,h+.015,cz+Math.sin(a+.33)*.13],flowers[(tuft+bloom)%2]);}
  }
 }
 const stone=new THREE.IcosahedronGeometry(1,0),sp=stone.getAttribute('position');
 const stoneColor=new THREE.Color(biome==='ice'?'#a2c6d7':biome==='mine'?'#a08b77':biome==='desert'?'#bda074':'#919272');
 for(let i=0;i<sp.count;i+=3){const vertices=[0,1,2].map(j=>[sp.getX(i+j)*.37+.2,(sp.getY(i+j)+.9)*.2,sp.getZ(i+j)*.42-.42]);tri(vertices[0],vertices[1],vertices[2],stoneColor.clone().multiplyScalar(.92+(i%4)*.04));}stone.dispose();
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:biome==='ice'?.5:.97,side:THREE.DoubleSide});material.name=`${biome}-verge-detail`;
 const cells=new Map<string,Placement[]>();for(const p of placements){const key=`${Math.floor(p.x/72)},${Math.floor(p.z/72)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(p)}
 const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 for(const list of cells.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name=`${biome}-verge-patch`;list.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(new THREE.Vector3(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.heading),new THREE.Vector3().setScalar(p.scale))));
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();mesh.receiveShadow=true;mesh.castShadow=false;mesh.userData.vergeCell=true;group.add(mesh);
 }
 group.userData.vergeDetails={placements,patches:placements.length,cells:cells.size,trianglesPerPatch:positions.length/9,biome};scene.add(group);return group;
}

export function updateVergeDetails(group:THREE.Group,camera:THREE.Vector3,low:boolean){
 for(const object of group.children){const mesh=object as THREE.InstancedMesh,s=mesh.boundingSphere!;mesh.visible=Math.hypot(camera.x-s.center.x,camera.z-s.center.z)<(low?85:155)+s.radius;}
}
