import fs from 'node:fs';
const path='shared/gameplay.ts';
let source=fs.readFileSync(path,'utf8');
source=source.replace('import { getTrack }', "import { challengeGrade, type ChallengeMetrics, type EventKind } from './challenge-events.ts';\nimport { getTrack }");
source=source.replace('export interface Challenge {','export interface Challenge {\n  event?: EventKind;\n  startDelay?: number;\n  sectorSeconds?: number[];');
const a=source.indexOf('export const CHALLENGES: Challenge[] = ['),b=source.indexOf('\nexport function isUnlocked',a);
if(a<0||b<a)throw Error('challenge array anchors missing');
const definitions=[
 ['coast-race','海岸启程 · 干净争先','完成三圈并进入前三。加星：达到目标时间；碰撞不超过两次。','coast','race','normal',3,3,3,'race'],
 ['coast-time','港口时钟 · 分段冲刺','一圈通过三个计时门，每段必须在倒计时结束前到达。','coast-harbor','time','normal',1,0,0,'sectors'],
 ['coast-items','沙漠反击 · 精准出手','两圈进入前三，并用道具成功减速对手至少一次。','coast-breakwater','items','normal',2,3,3,'attack'],
 ['city-race','街区追击 · 延迟出发','对手提前四秒出发，两圈追回前三。','city','race','normal',2,3,5,'pursuit'],
 ['city-time','工业驾照 · 漂移衔接','两圈内完成四次干净漂移和两次小喷。连弯衔接可获额外星级。','city-factory','time','hard',2,0,0,'technique'],
 ['city-items','星环防线 · 防守突围','两圈进入前四。用护盾挡住一次攻击可获额外星级。','city-nightshift','items','normal',2,4,5,'defense'],
 ['mountain-race','森林试炼 · 稳定控车','三圈进入前三，碰撞不超过八次。','mountain','race','hard',3,3,7,'clean'],
 ['mountain-time','冰川耐力 · 四圈考验','四圈限时挑战，稳定完成长距离驾驶；连弯衔接可获额外星级。','mountain-pass','time','hard',4,0,0,'endurance'],
 ['mountain-items','矿山决赛 · 专家争冠','三圈击败七名专家夺冠。成功攻击或防御两次可获额外星级。','mountain-summit','items','hard',3,1,7,'final'],
];
const rows=definitions.map(([id,title,description,trackId,mode,difficulty,laps,rank,opponents,event])=>({id,title,description,trackId,mode,difficulty,laps,rank,opponents,event,limit:0,gold:0,uses:0,drift:0,...(event==='pursuit'?{startDelay:4}:{})}));
source=source.slice(0,a)+'export const CHALLENGES: Challenge[] = '+JSON.stringify(rows,null,2)+';\n'+
`// Initial pace targets are tied to actual current route lengths, then checked by the AI benchmark.
for (const q of CHALLENGES) {
  const length=getTrack(q.trackId).length;
  q.gold=Math.ceil(length*q.laps/29+5+(q.startDelay??0));
  if(q.event==='sectors') {
    q.sectorSeconds=[Math.ceil(length/3/21+5),Math.ceil(length/3/21+3),Math.ceil(length/3/21+3)];
    q.limit=q.sectorSeconds.reduce((a,b)=>a+b,0);
  }
  if(q.event==='technique'||q.event==='endurance')q.limit=Math.min(290,Math.ceil(length*q.laps/20+15));
}
`+source.slice(b);
const start=source.indexOf('export function starsFor('),end=source.indexOf('\nexport ',start+10);
if(start<0||end<start)throw Error('stars anchors missing');
source=source.slice(0,start)+`export function starsFor(q:Challenge,time:number,rank:number,drift:number,uses:number,finished:boolean,metrics?:ChallengeMetrics) {
  return challengeGrade(q, metrics??{finished,time,rank,collisions:99,cleanDrifts:0,miniUses:0,driftChains:0,usefulHits:0,blocks:0,failed:false});
}
`+source.slice(end);
fs.writeFileSync(path,source);
