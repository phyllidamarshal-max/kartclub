import * as THREE from 'three';
import { nearestTrack, trackPoint, trackWidth, type Track } from '../shared/track.ts';
import { roadsideClear } from './scenery.ts';
import { coastalShoreMargin } from './coast-details.ts';
import { coastCottageApproach, type CoastPlacement } from './coast-layout.ts';
import { referenceGroundHeight } from './reference-layout.ts';

type Point=[number,number,number];
type Placement={kind:string;x:number;y:number;z:number;radius:number};
class Batch {
  positions:number[]=[];
  colors:number[]=[];
  triangle(a:Point,b:Point,c:Point,color:THREE.Color){
    this.positions.push(...a,...b,...c);
    for(let i=0;i<3;i++)this.colors.push(color.r,color.g,color.b);
  }
  quad(a:Point,b:Point,c:Point,d:Point,color:THREE.Color){this.triangle(a,b,c,color);this.triangle(a,c,d,color);}
  mesh(name:string,doubleSide=false){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:doubleSide?THREE.DoubleSide:THREE.FrontSide}));
    mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;
    return mesh;
  }
}

/** A bounded foreground flower/verge and cottage-garden pass for the art circuit. */
export function buildReferenceDressing(scene:THREE.Scene,track:Track,layout:CoastPlacement[],lowQuality=false):THREE.Group {
  const group=new THREE.Group();group.name='reference-dressing';
  if(track.id!=='reference-coast-v1')return group;
  const leaf=new Batch(),petal=new Batch(),wood=new Batch();
  const greens=['#6a7d3c','#819248','#a1a453'].map(c=>new THREE.Color(c));
  const ivory=new THREE.Color('#f8edcc'),gold=new THREE.Color('#ebbd45'),pollen=new THREE.Color('#c99524');
  const timber=new THREE.Color('#d2c3a0'),timberLight=new THREE.Color('#e3d5b5');
  const placements:Placement[]=[];
  const houses=layout.filter(h=>h.asset.startsWith('cottage'));
  let seed=70639,flowers=0,tufts=0,posts=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function safe(x:number,z:number,radius:number){
    if(!roadsideClear(track,x,z,radius))return false;
    const n=nearestTrack(x,z,track),dx=x-n.x,dz=z-n.z;
    const shoreSide=dx*Math.cos(n.heading)-dz*Math.sin(n.heading)>0;
    if(shoreSide&&n.distance+radius>trackWidth(n.t,track)/2+coastalShoreMargin(n.t,track)-.7)return false;
    for(const house of houses){
      const d=coastCottageApproach(house),a=x-d.x,b=z-d.z;
      const forward=a*Math.sin(house.heading)+b*Math.cos(house.heading);
      const sideways=a*Math.cos(house.heading)-b*Math.sin(house.heading);
      if(forward>3.5*house.scale&&forward<18&&Math.abs(sideways)<1.05+radius)return false;
      const hx=x-house.x,hz=z-house.z;
      if(Math.abs(hx*Math.cos(house.heading)-hz*Math.sin(house.heading))<3.65*house.scale+radius&&
         Math.abs(hx*Math.sin(house.heading)+hz*Math.cos(house.heading))<4.38*house.scale+radius)return false;
    }
    return !layout.some(p=>p.asset.startsWith('tree')&&Math.hypot(p.x-x,p.z-z)<.62*p.scale+radius);
  }
  const ground=(x:number,z:number)=>referenceGroundHeight(x,z,track);
  function record(kind:string,x:number,z:number,radius:number){placements.push({kind,x,y:ground(x,z),z,radius});}
  function blade(x:number,z:number,angle:number,h:number,width:number,bend:number,color:THREE.Color){
    const c=Math.cos(angle),s=Math.sin(angle);
    const p=(distance:number,side:number,height:number):Point=>{
      const px=x+c*distance-s*side,pz=z+s*distance+c*side;
      return [px,ground(px,pz)+height,pz];
    };
    const a=p(0,-width*.30,.015),b=p(0,width*.30,.015);
    const m=p(bend*.32,0,h*.57+.027),l=p(bend*.29,-width,h*.52),r=p(bend*.29,width,h*.52),tip=p(bend,0,h*.88);
    leaf.triangle(a,l,m,color);leaf.triangle(a,m,b,color);leaf.triangle(b,m,r,color);
    leaf.triangle(l,tip,m,color);leaf.triangle(m,tip,r,color);
  }
  function tuft(x:number,z:number,scale=1){
    if(!safe(x,z,.43*scale))return;
    record('grass',x,z,.43*scale);tufts++;
    const phase=random()*6.28;
    for(let i=0;i<6;i++)blade(x,z,phase+i*2.399,(.43+random()*.34)*scale,(.065+random()*.035)*scale,(.21+random()*.12)*scale,greens[i%3]);
  }
  function flower(x:number,z:number,large=1){
    const radius=.29*large;
    if(!safe(x,z,radius))return;
    record('flower',x,z,radius);flowers++;
    const base=ground(x,z),h=(.37+random()*.32)*large,angle=random()*6.28;
    const cx=x+.055*Math.cos(angle),cz=z+.055*Math.sin(angle),cy=base+h;
    const color=flowers%3===0?gold:ivory;
    // Crossed stems are broad enough to survive the reference camera sampling.
    leaf.quad([x-.013,base,z],[x+.013,base,z],[cx+.013,cy,cz],[cx-.013,cy,cz],greens[0]);
    leaf.quad([x,base,z-.013],[x,base,z+.013],[cx,cy,cz+.013],[cx,cy,cz-.013],greens[0]);
    blade(x,z,angle+1.1,h*.55,.048*large,.19*large,greens[1]);
    const size=(.13+random()*.055)*large;
    for(let j=0;j<5;j++){
      const a=angle+j*Math.PI*2/5,c=Math.cos(a),s=Math.sin(a);
      const p=(r:number,w:number,y:number):Point=>[cx+c*r-s*w,cy+y,cz+s*r+c*w];
      const root=p(.023,0,0),left=p(size*.64,-size*.40,.026),endL=p(size,-size*.22,.046),tip=p(size*1.12,0,.060),endR=p(size,size*.22,.046),right=p(size*.64,size*.40,.026),middle=p(size*.62,0,.048);
      petal.triangle(root,left,middle,color);petal.quad(left,endL,tip,middle,color);
      petal.quad(middle,tip,endR,right,color);petal.triangle(root,middle,right,color);
    }
    for(let j=0;j<6;j++){
      const a=j*Math.PI/3,b=(j+1)*Math.PI/3;
      petal.triangle([cx,cy+.055,cz],[cx+Math.cos(a)*.034,cy+.032,cz+Math.sin(a)*.034],[cx+Math.cos(b)*.034,cy+.032,cz+Math.sin(b)*.034],pollen);
    }
  }
  function bed(x:number,z:number,count:number,scale=1){
    for(let j=0;j<count;j++){
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*1.0;
      flower(x+Math.cos(angle)*r,z+Math.sin(angle)*r,scale);
    }
    tuft(x-.54,z+.24,scale);tuft(x+.58,z-.29,scale*.87);
  }
  // Only the photographed S-bend: clustered islands and intervening quiet gaps.
  for(let m=-68;m<=90;m+=lowQuality?4.2:2.35){
    const t=.5+m/track.length,p=trackPoint(t,track);
    for(const side of [-1,1]){
      if(random()<.12)continue;
      const d=trackWidth(t,track)/2+2.15+random()*3.35;
      bed(p.x+Math.cos(p.heading)*side*d,p.z-Math.sin(p.heading)*side*d,lowQuality?3:6,1);
    }
  }
  function box(cx:number,cz:number,width:number,height:number,depth:number,heading:number,bottom:number){
    const c=Math.cos(heading),s=Math.sin(heading);
    const points:Point[]=[];
    for(const y of [bottom,bottom+height])for(const [x,z] of [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]){
      const px=cx+x*c+z*s,pz=cz-x*s+z*c;
      points.push([px,ground(px,pz)+y,pz]);
    }
    for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])wood.quad(points[a],points[b],points[c],points[d],a===4?timberLight:timber);
  }
  for(const house of houses.slice(0,7)){
    const approach=coastCottageApproach(house),c=Math.cos(house.heading),s=Math.sin(house.heading);
    const local=(side:number,front:number)=>({x:approach.x+c*side+s*front,z:approach.z-s*side+c*front});
    // The open central corridor follows each modeled door's local offset.
    const start=1.52,end=Math.min(4.6,3.5*house.scale),front=4.45*house.scale+1.5;
    for(const side of [-1,1]){
      for(const distance of [front-1.0,front-2.0]){
        const b=local(side*(2.3+house.scale*.65),distance);
        bed(b.x,b.z,lowQuality?3:7,.95);
      }
      const span=end-start,steps=Math.max(3,Math.ceil(span/.48));
      for(let i=0;i<=steps;i++){
        const q=local(side*(start+span*i/steps),front);
        if(!safe(q.x,q.z,.16))continue;
        record('garden-post',q.x,q.z,.16);posts++;
        box(q.x,q.z,.13,.90,.16,house.heading,.012);
        // A shallow pointed cap, still within the same single timber batch.
        const y=ground(q.x,q.z)+.912;
        const a:Point=[q.x-c*.065,y,q.z+s*.065],b:Point=[q.x+c*.065,y,q.z-s*.065],top:Point=[q.x,y+.12,q.z];
        wood.triangle(a,top,b,timberLight);
      }
      // Short rail spans remain on either side of the open door approach.
      for(let i=0;i<steps;i++){
        const length=span/steps,q=local(side*(start+length*(i+.5)),front);
        const radius=length*.5+.07;
        if(!safe(q.x,q.z,radius))continue;
        record('garden-rail',q.x,q.z,radius);
        box(q.x,q.z,length+.07,.085,.075,house.heading,.31);
        box(q.x,q.z,length+.07,.085,.075,house.heading,.65);
      }
    }
  }
  for(const [batch,name,double] of [[leaf,'reference-folded-grass',true],[petal,'reference-five-petal-flowers',true],[wood,'reference-cream-garden-fences',false]] as const){
    if(batch.positions.length)group.add(batch.mesh(name,double));
  }
  group.userData.dynamic=true;
  group.userData.placements=placements;
  group.userData.stats={flowers,tufts,posts,drawCalls:group.children.length,triangles:(leaf.positions.length+petal.positions.length+wood.positions.length)/9,lowQuality};
  scene.add(group);return group;
}
