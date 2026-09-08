import fs from 'node:fs';
const path='client/main.ts';let s=fs.readFileSync(path,'utf8');
fs.writeFileSync('output/gameplay-main-before.ts',s);
const replace=(a,b)=>{if(!s.includes(a))throw Error('Missing anchor '+a.slice(0,100));s=s.replace(a,b);};
replace('import "./brand.css";',`import "./brand.css";
import './gameplay.css';
import { ChallengeRun, CAREER_EVENT_VERSION, type ChallengeMetrics } from '../shared/challenge-events.ts';
import { CornerPractice, practiceCorners } from './practice.ts';
import { drivingAdvice, sectorComparison } from './race-feedback.ts';
import { driftEfficiency } from '../shared/driving-skills.ts';
import { incomingThreat } from '../shared/items.ts';`);
replace('let training: Training | null = null,',`let challengeRun: ChallengeRun | null = null;
let cornerPractice: CornerPractice | null = null;
const careerTimingKey = () => recordKey('all') + '-' + CAREER_EVENT_VERSION;
let training: Training | null = null,`);
replace('function clearSoloRun() {',`function clearSoloRun() {
  challengeRun=null;
  cornerPractice=null;`);
replace('careerBestTime(p, recordKey("all"))','careerBestTime(p, careerTimingKey())');
replace('      recordKey("all"),','      careerTimingKey(),');
replace('  challengeIndex = index;','  challengeIndex = index;\n  challengeRun = q ? new ChallengeRun(q) : null;');
replace('  bestGhost = null;\n  const g = stored<unknown>',`  if(q?.event==='defense' && itemWorld) itemWorld.players.local.held='shield';
  bestGhost = null;
  const g = stored<unknown>`);
replace('        localCar.finished,\n      )','        localCar.finished,\n        careerMetrics(rank),\n      )');
replace('function soloResult() {',`function careerMetrics(rank:number):ChallengeMetrics {
  return {finished:localCar.finished,time:localCar.finished?localCar.time:elapsed,rank,
    collisions:localCar.collisionCount,cleanDrifts:localCar.cleanDrifts,miniUses:localCar.miniUses,
    driftChains:localCar.driftChains,usefulHits:itemWorld?.players.local?.usefulHits??0,
    blocks:itemWorld?.players.local?.blocks??0,failed:challengeRun?.failed??false};
}
function eventStatus():string {
  const q=challengeRun?.challenge;
  if(!q)return '';
  if(challengeRun!.failed)return tr('计时门超时 · 挑战结束');
  const wait=challengeRun!.releaseRemaining(elapsed);
  if(wait>0)return tr('追击发车倒计时 {n} 秒',{n:wait.toFixed(1)});
  const remaining=challengeRun!.remaining(elapsed);
  if(remaining!==null)return tr('计时门 {n} / 3 · 剩余 {time} 秒',{n:challengeRun!.gate,time:remaining.toFixed(1)});
  if(q.event==='technique')return tr('干净漂移 {drifts} / 4 · 小喷 {mini} / 2',{drifts:localCar.cleanDrifts,mini:localCar.miniUses});
  if(q.event==='attack'||q.event==='defense'||q.event==='final')return tr('有效攻击 {hits} · 成功防御 {blocks}',{hits:itemWorld?.players.local?.usefulHits??0,blocks:itemWorld?.players.local?.blocks??0});
  if(q.event==='clean')return tr('碰撞 {n} / 8',{n:localCar.collisionCount});
  return '';
}
function performanceMarkup() {
  return '<section class="performance-review"><h3>'+tr('驾驶复盘')+'</h3><p>'+tr(drivingAdvice(localCar))+'</p><div class="performance-grid">'+
    [[tr('干净漂移'),localCar.cleanDrifts],[tr('连续衔接'),localCar.driftChains],[tr('错过小喷'),localCar.missedMini],[tr('有效攻击'),itemWorld?.players.local?.usefulHits??0]]
      .map(([label,value])=>'<div><span>'+label+'</span><b>'+value+'</b></div>').join('')+'</div></section>';
}
function openCornerPractice() {
  if(mode==='multi')return;
  if(mode==='solo')paused=true;
  modal='corner-practice';
  const track=mode==='solo'?activeTrack:getTrack(selection.trackId);
  $('#modal-root').innerHTML='<div class="modal-backdrop"><section class="modal"><span class="eyebrow">'+tr('弯道训练')+'</span><h2>'+tr('练好一个弯，再快一整圈')+'</h2><p>'+tr('从弯道前静止出发，每次重练清空资源，练习不计入比赛纪录。')+'</p><label>'+tr('选择弯道')+'<select id="practice-corner">'+practiceCorners(track).map((t,i)=>'<option value="'+i+'">'+tr('弯道 {n}',{n:i+1})+' · '+Math.round(t*100)+'%</option>').join('')+'</select></label><div class="modal-actions"><button class="button outline" data-action="close">'+tr('返回')+'</button><button class="button primary" data-action="corner-start">'+tr('开始弯道训练')+'</button></div></section></div>';
  keys.clear();translateScreen();focusDialog($('#modal-root'));
}
function beginCornerPractice(index:number) {
  const track=mode==='solo'?activeTrack:getTrack(selection.trackId);
  selection={trackId:track.id,raceMode:'practice',difficulty:'easy',laps:1,opponents:0};
  beginSolo(-1);
  cornerPractice=new CornerPractice(track,index);
  localCar=cornerPractice.restart();soloCars=[localCar];bestGhost=null;ghostFrames=[];
  countdown=2;lastBeep=3;raceUI();
}
function soloResult() {`);
replace('<p class="form-note">单人模式免费 · 不发放代币奖励</p><div class="hero-buttons">','${performanceMarkup()}${challengeRun?.failed?`<p class="event-failed">${tr("计时门超时 · 挑战结束")}</p>`:""}<p class="form-note">单人模式免费 · 不发放代币奖励</p><div class="hero-buttons">');
replace('data-action="retry">再跑一次 ↗</button><button', 'data-action="retry">${cornerPractice?tr("重练这个弯"):tr("再跑一次 ↗")}</button>${cornerPractice?`<button class="button outline" data-action="corner-next">${tr("下一个弯道")}</button>`:""}<button');
replace('async function act(action: string) {',`async function act(action: string) {
  if(action==='corner-practice'){openCornerPractice();return;}
  if(action==='corner-start'){beginCornerPractice(Number((document.querySelector('#practice-corner'))?.value??0));return;}
  if(action==='corner-next'){beginCornerPractice(((cornerPractice?.corner??0)+1)%practiceCorners(activeTrack).length);return;}`.replace("document.querySelector('#practice-corner')","document.querySelector<HTMLSelectElement>('#practice-corner')"));
replace('  if (action === "retry") {','  if (action === "retry") {\n    if(cornerPractice){beginCornerPractice(cornerPractice.corner);return;}');
replace("'<button class=\"button outline\" data-action=\"retry\">重新开始</button>'", "'<button class=\"button outline\" data-action=\"retry\">重新开始</button><button class=\"button outline\" data-action=\"corner-practice\">弯道训练</button>'");
replace('data-action="training">进入五步驾驶教学</button>', 'data-action="training">进入五步驾驶教学</button><button class="button outline" data-action="corner-practice">弯道训练</button>');
replace('<div class="countdown" id="countdown"></div>', '<div class="skill-feedback hud-panel" id="skill-feedback"></div><div class="countdown" id="countdown"></div>');
replace('          const before = c.progress;\n          stepCar(c, commands[c.id], tickDt, activeTrack);',`          const before = c.progress;
          if(c.id==='local' && challengeRun && challengeRun.releaseRemaining(elapsed-tickDt)>0) {
            c.time=elapsed;
            continue;
          }
          stepCar(c, commands[c.id], tickDt, activeTrack);
          if(c.id==='local')challengeRun?.update(before,c.progress,elapsed);`);
replace('          if (!training && c.lap >= targetLaps() && !c.finished) {','          if (!training && !cornerPractice && c.lap >= targetLaps() && !c.finished) {');
replace('        separateCars(soloCars, activeTrack);',`        separateCars(challengeRun?.releaseRemaining(elapsed)?soloCars.filter(c=>c.id!=='local'):soloCars, activeTrack);`);
replace('        training?.update(localCar);',`        training?.update(localCar);
        if(cornerPractice?.complete(localCar) && !localCar.finished) {
          localCar.finished=true;stepCar(localCar,EMPTY_INPUT,0,activeTrack);
        }`);
replace('        if (selection.raceMode === "time") {','        if (selection.raceMode === "time" && !qForRun() && !cornerPractice && !training) {');
replace('          soloRaceComplete(\n','          challengeRun?.failed || soloRaceComplete(\n');
replace('function soloDeadline() {',`function qForRun(){return challengeIndex>=0?CHALLENGES[challengeIndex]:null;}
function soloDeadline() {`);
const objectiveStart=s.indexOf('      : q\n        ? [',s.indexOf('function hud()'));
const objectiveEnd=s.indexOf('        : selection.raceMode === "time"',objectiveStart);
if(objectiveStart<0||objectiveEnd<0)throw Error('HUD objective anchors');
s=s.slice(0,objectiveStart)+`      : cornerPractice
        ? tr('弯道 {n} · 完成后可立即重练',{n:cornerPractice.corner+1})
      : q
        ? [tr(q.description),eventStatus()].filter(Boolean).join(' · ')
`+s.slice(objectiveEnd);
replace('  const item = itemWorld?.players[c.id];',`  const item = itemWorld?.players[c.id];
  const threat = itemWorld ? incomingThreat(itemWorld,c) : null;
  const skill = $('#skill-feedback');
  skill.hidden=activeCountdown>0 || c.finished;
  skill.dataset.warning=String(threat!==null);
  skill.textContent=threat!==null ? tr('导弹来袭 · {n} 秒',{n:threat.toFixed(1)})
    : c.miniWindow>0 ? tr('小喷窗口 {n} 秒',{n:c.miniWindow.toFixed(2)})
    : c.drifting ? tr('漂移效率 {n}%',{n:Math.round(driftEfficiency(c.speed,c.slipAngle,c.driftDuration)*100)})
    : tr('干净漂移 {n} · 连续衔接 {chains}',{n:c.cleanDrifts,chains:c.driftChains});`);
fs.writeFileSync(path,s);
