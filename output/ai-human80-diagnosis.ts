import {aiInput} from '../shared/ai.ts';
import {getTrack} from '../shared/track.ts';
import {spawnCar,stepCar} from '../shared/race.ts';
const track=getTrack('coast');
const results=[];
for (const difficulty of ['normal','hard'] as const) for(const experiment of ['baseline','no-braking','spend-nitro-early']) {
 const c=spawnCar(1,'diagnose',track);
 let distance=0,brakingSeconds=0,boostSeconds=0,driftSeconds=0,chargeSeconds=0,fullGaugeSeconds=0;
 const sectors=Array.from({length:12},()=>({seconds:0,brake:0,boost:0,energy:0,distance:0}));
 for(let i=0;i<60*180&&c.lap<3;i++) {
  const input=aiInput(c,track,difficulty,i/60),x=c.x,z=c.z,energy=c.driftTotal;
  if(experiment==='no-braking'&&input.throttle<0) input.throttle=1;
  if(experiment==='spend-nitro-early') input.boost=c.storedNitro>0&&!c.boostHeld&&c.boostTime<=.15;
  const s=sectors[Math.min(11,Math.floor(c.lastT*12))];
  stepCar(c,input,1/60,track);
  const travel=Math.hypot(c.x-x,c.z-z);
  distance+=travel;s.distance+=travel;s.seconds+=1/60;s.energy+=c.driftTotal-energy;
  if(input.throttle<0){brakingSeconds+=1/60;s.brake+=1/60;}
  if(c.boostTime>0){boostSeconds+=1/60;s.boost+=1/60;}
  if(c.drifting)driftSeconds+=1/60;
  if(c.driftTotal>energy)chargeSeconds+=1/60;
  if(c.energy>=100)fullGaugeSeconds+=1/60;
 }
 results.push({difficulty,experiment,time:c.time,distance,averageSpeed:distance/c.time,brakingSeconds,boostSeconds,driftSeconds,chargeSeconds,fullGaugeSeconds,collisions:c.collisionCount,nitro:c.nitroUses,mini:c.miniUses,energy:c.driftTotal,sectors});
}
console.log(JSON.stringify({track:track.id,length:track.length,laps:3,playerReportedSeconds:80,results},null,2));
