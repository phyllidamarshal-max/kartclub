import './reference.css';
import {World,loadContent} from './world.ts';
import {REFERENCE_COURSE as track} from './reference-course.ts';
import {REFERENCE_CAMERAS,referencePhotoPose,frameReferencePhoto,type ReferenceView} from './reference-camera.ts';
import {spawnCar,stepCar,separateCars,type Car} from '../shared/race.ts';
import {aiInput} from '../shared/ai.ts';
import {DEFAULT_BINDINGS,readInput} from './controls.ts';
import {nitroDisplay} from './visual-state.ts';
import {updateCoastAssets} from './coast-assets.ts';
import {createReferenceBadge} from './reference-badge.ts';

const $=<T extends HTMLElement>(id:string)=>document.querySelector<T>(id)!;
const canvas=$<HTMLCanvasElement>('#scene'),status=$('#status'),keys=new Set<string>();
let world:World|undefined,cars:Car[]=[],view:ReferenceView='rear',manual=false,paused=false,disposed=false,raf=0,last=0,acc=0,elapsed=0;
let badge:ReturnType<typeof createReferenceBadge>|undefined;
const events=new AbortController();
function makeCars(){
  cars=Array.from({length:3},(_,slot)=>{
    const car=spawnCar(slot,`reference-${slot}`,track),p=referencePhotoPose(slot,view);
    Object.assign(car,{x:p.x,z:p.z,lastX:p.x,lastZ:p.z,heading:p.heading,lastT:p.t,progress:p.t,spawnProgress:p.t,resetProgress:p.t,checkpoint:Math.floor(p.t*12)});return car;
  });
}
function size(){
  if(!world)return;
  const host=canvas.parentElement!.getBoundingClientRect(),shot=REFERENCE_CAMERAS[view];
  const width=manual?Math.round(host.width):shot.width,height=manual?Math.round(host.height):shot.heightPixels;
  world.renderer.setPixelRatio(manual?Math.min(devicePixelRatio,world.quality==='low'?1:1.5):1);
  world.renderer.setSize(width,height,false);world.camera.aspect=width/height;world.camera.updateProjectionMatrix();
  canvas.style.width=manual?'100%':`${Math.min(host.width,host.height*width/height)}px`;canvas.style.height=manual?'100%':'auto';
}
function photo(next:ReferenceView){
  if(!world)return;manual=false;paused=false;keys.clear();view=next;cancelAnimationFrame(raf);world.resetVfx();makeCars();
  document.body.classList.remove('driving');$('#hud').hidden=true;$('#pause').hidden=$('#restart').hidden=true;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  size();world.render(cars,cars[0].id,0,false,0,0,{active:false,paused:false});frameReferencePhoto(world.camera,view);
  const assets=world.scene.getObjectByName('coast-authored-assets');if(assets)updateCoastAssets(assets as any,world.camera.position,world.quality==='low');
  badge?.frame(world.camera,view);
  world.renderer.render(world.scene,world.camera);status.textContent=`${view==='front'?'正面':'后方'}参考机位 · 可切换试驾 · ${track.name}`;
}
function start(){
  if(!world)return;cancelAnimationFrame(raf);manual=true;paused=false;elapsed=acc=0;last=performance.now();keys.clear();makeCars();
  if(badge)badge.sprite.visible=false;
  world.resetCamera();world.resetVfx();document.body.classList.add('driving');$('#hud').hidden=false;$('#pause').hidden=$('#restart').hidden=false;$('#paused').hidden=true;$('#pause').textContent='暂停';size();canvas.focus();raf=requestAnimationFrame(tick);
  status.textContent='海岸自由试驾 · 真实驾驶与碰撞';
}
function pause(){if(!manual)return;paused=!paused;keys.clear();$('#paused').hidden=!paused;$('#pause').textContent=paused?'继续':'暂停';last=performance.now();acc=0;}
function tick(now:number){
  if(disposed||!world||!manual)return;const dt=Math.min(.08,(now-last)/1000);last=now;
  const input=readInput(keys,DEFAULT_BINDINGS);
  if(!paused){acc+=dt;while(acc>=1/60){elapsed+=1/60;for(const c of cars)stepCar(c,c.slot===0?input:aiInput(c,track,'normal',elapsed,cars),1/60,track);separateCars(cars,track);acc-=1/60;}}
  world.render(cars,cars[0].id,paused?0:dt,false,dt*1000,input.steer,{active:true,paused});
  const car=cars[0],nitro=nitroDisplay(car,paused);$('#speed').textContent=String(Math.round(Math.abs(car.speed)*3.6));
  $('#clock').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
  $('#distance').textContent=`${Math.round(Math.max(0,car.progress-car.spawnProgress)*track.length)} m`;
  $('#nitro-label').textContent=`${{charging:'正在集气',collect:'已满待转换',full:'库存已满',releasing:paused?'氮气释放 · 已暂停':'正在释放'}[nitro.state]} · 库存 ${nitro.bottles} / ${nitro.bottleCapacity}`;
  const charge=$<HTMLProgressElement>('#charge');charge.max=nitro.capacity;charge.value=nitro.energy;
  $('#drive-status').textContent=car.resetTime>0?'正在复位…':car.ghostTime>0?'复位保护中':`WASD / 方向键 · Shift 漂移 · Ctrl 氮气 · R 复位`;
  raf=requestAnimationFrame(tick);
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.addEventListener('click',()=>photo(b.dataset.view as ReferenceView),{signal:events.signal}));
$('#manual').addEventListener('click',start,{signal:events.signal});$('#restart').addEventListener('click',start,{signal:events.signal});$('#pause').addEventListener('click',pause,{signal:events.signal});
$('#quality').addEventListener('change',()=>{world?.setQuality($<HTMLSelectElement>('#quality').value);size();if(!manual)photo(view);},{signal:events.signal});
addEventListener('keydown',e=>{if(!manual||e.target instanceof HTMLSelectElement)return;if(e.code==='Escape'){if(!e.repeat)pause();e.preventDefault();return;}if([...Object.values(DEFAULT_BINDINGS),'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}},{signal:events.signal});
addEventListener('keyup',e=>keys.delete(e.code),{signal:events.signal});addEventListener('blur',()=>{keys.clear();if(manual&&!paused)pause();},{signal:events.signal});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&manual&&!paused)pause();},{signal:events.signal});
addEventListener('resize',()=>{size();if(!manual)photo(view);},{signal:events.signal});
function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);events.abort();keys.clear();badge?.dispose();badge=undefined;world?.dispose();}
addEventListener('pagehide',dispose,{once:true});
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
try{const content=await loadContent();if(!disposed){world=new World(canvas,content,track,false,true);world.setQuality($<HTMLSelectElement>('#quality').value);await world.loadAssets();if(!disposed){document.querySelectorAll<HTMLButtonElement>("nav button").forEach(b=>b.disabled=false);badge=createReferenceBadge(world.scene);view=new URLSearchParams(location.search).get('view')==='front'?'front':'rear';photo(view);Object.assign(window,{referenceDrive:{get world(){return world},get cars(){return cars},get elapsed(){return elapsed},get paused(){return paused},photo,start,pause,dispose}});}}}catch(error){status.textContent=`场景载入失败：${error instanceof Error?error.message:'请刷新重试'}`;console.error(error);dispose();}
