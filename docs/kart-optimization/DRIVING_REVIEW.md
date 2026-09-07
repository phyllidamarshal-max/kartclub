# 共享驾驶独立复核

日期：2026-09-07。首次审查对象：提交 `a5635c117f0950b73c30836bc34d3941b9a72b4e` 及 `artifacts/driving-review.diff`；最终复核对象：修复提交 `16345a39bd5c4ee85f6070fb4548f913ad20b88d` 与当前工作区。已核对当前 `shared/race.ts`、`shared/track.ts`、`tests/adjacent-road.test.ts`、`tests/driving-resources.test.ts` 与修复提交一致。两轮均只写本报告，未修改实现、测试或 `output/`。

## 最终规格结论：本次共享驾驶审查范围通过

修复后独立执行44项相关回归，全部通过。原R1邻路投影、R2小喷窗口以及主任务追加的 finished 状态残留 `boostTime` 均已关闭；AC04/AC13在本项目平面街机物理和已测灰盒边界内通过。首次审查发现及原复现保留在下方，属于已修复的历史证据，不表示当前版本仍失败。

已确认的正向证据：真实速度方向侧滑、速度和合法前进门槛；2瓶加100槽转换；氮气新按去重、150ms缓存、优先级及撞墙持续计时；复位等待1.5秒、保留资源、向后安全进度及1秒车车保护；真实近路进入/合流；固定60Hz输入在30/60/120渲染调度下状态一致；跨步圈末插值。集中配置已冻结，集气系数300的调整有报告中的单一变量依据。九路线全难度与八车完赛结果属于实现者已有证据，本次未重复该全套模拟。

## 最终质量结论：通过，无未关闭的本次审查问题

修复直接处理原因：投影由当前路段沿相接路段追踪局部最小距离，碰撞与进度继续共用结果；真实拉正条件不再附加松漂移要求；finished 早退明确清理氮气。新增回归覆盖原失败情形，并保护连接弯正反向通行、合法近路、原法线碰撞及圈末插值。没有扩充Car接口或改动配置、正式路线、资产系统。未发现新的阻断问题；这不是对任意赛道拓扑或真实3D碰撞的普遍证明。

### R1 · P1 · 已关闭：局部最近点会选中未驶达的相邻道路（首次审查记录）

位置：`shared/track.ts:311–330`；受影响调用：`shared/race.ts:466–475`。

`continuousTrack` 用30世界单位的进度窗口排除远处道路后，仍按XZ距离挑最小值，并没有保证车辆只从当前路段沿端点走入相邻路段。窗口内的发卡弯回程或高架段可以因此替换当前道路。更关键的是，道路碰撞先使用这个错误投影；之后的进度物理预算虽拒绝跳进度，也不能恢复本路墙体碰撞。

实测合成路线：左路中心x=0向前，右路中心x=4反向、y=20；两处最近位置相差20世界单位的沿线进度，均在30窗口内。车辆从左路合法边缘x=1.9开始，以40世界单位/秒向右运动一个60Hz步。车半径1.05、路宽6，左路车辆中心上限应为x=1.95。实际结果：

```text
x = 2.5672268205102684   （穿过左路中心边界1.95）
projectedRoadX = 4
projectedHeight = 20
projectedArc = 22
legalArc = 2            （进度预算拒绝了跳跃）
impact = 0             （本路道路碰撞被绕过）
```

这是合成灰盒边界复现，不代表已在九条现成路线发现同一跨层位置。即使把回程y改成0，抢投影逻辑仍存在；不需要新增3D腾空物理才能修复。现有AC13把邻路设在约半圈之外，天然被搜索窗口排除，没有覆盖本问题。

在仓库根目录以 PowerShell 执行以下代码可复现（仅内存构造赛道，不生成文件）：

```powershell
@'
import {spawnCar, stepCar, EMPTY_INPUT} from "./shared/race.ts";
import {continuousTrack, DEFAULT_TRACK} from "./shared/track.ts";
const coords = [[0,0],[0,10],[4,10],[4,0],[100,0],[100,-100],[0,-100],[0,0]];
const ds = coords.slice(1).map((p,i) => Math.hypot(p[0]-coords[i][0],p[1]-coords[i][1]));
const length = ds.reduce((a,b) => a+b,0);
const points = Array.from({length:720},(_,i) => {
  let d=i/720*length,k=0;
  while(d>ds[k]) d-=ds[k++];
  const a=coords[k],b=coords[k+1],f=d/ds[k];
  return {x:a[0]+(b[0]-a[0])*f,z:a[1]+(b[1]-a[1])*f,
    y:k===2?20:0,t:i/720,heading:Math.atan2(b[0]-a[0],b[1]-a[1])};
});
const track={...DEFAULT_TRACK,length,points,width:6,shortcut:[],obstacles:[]};
const c=spawnCar(0,"review",track);
Object.assign(c,{x:1.9,z:2,lastX:1.9,lastZ:2,progress:2/length,
  lastT:2/length,speed:40,vx:40,vz:0,heading:Math.PI/2});
stepCar(c,{...EMPTY_INPUT,throttle:1},1/60,track);
const p=continuousTrack(c.x,c.z,c.lastT,track,"main");
console.log({x:c.x,z:c.z,allowedLeftRoadX:1.95,projectedRoadX:p.x,
  projectedHeight:p.y,projectedArc:p.t*length,legalArc:c.progress*length,impact:c.impact});
'@ | npx tsx --input-type=module
```

期望：投影继续属于左路，法线碰撞将中心限制到左路可通行宽度，既不切换道路也不产生跳跃进度。修复应覆盖道路碰撞和进度共用的投影选择，单独收紧 `legal` 判断不足以解决。

### R2 · P2 · 已关闭：已拉正的漂移可储存超过500ms再开启小喷资格（首次审查记录）

位置：`shared/race.ts:377–382`。

恢复条件额外要求 `!requestedDrift`。所以按住漂移并保留略大于0.15的转向时，即使真实侧滑已经回到8度以内，也不会结束本次漂移或开启窗口，`driftDuration` 继续保存。之后松漂移才给予新的完整500ms。这让窗口相对实际拉正时刻任意延后，违反“一次合格漂移，随后拉正，开启500ms”的规则。

采用已有资源测试相同的“加宽现有路线以排除墙体”方法，起步速度35，25步 throttle=1/drift=true/steer=1，然后120步 throttle=1/drift=true/steer=0.16。实测：1.05秒时已拉正到8度内；2.4166667秒时侧滑0.100309弧度（约5.75度），impact=0，miniWindow仍为0、driftDuration仍为0.7333333。下一步松漂移，miniWindow反而变为0.5。

```powershell
@'
import {spawnCar,stepCar,EMPTY_INPUT} from "./shared/race.ts";
import {DEFAULT_TRACK} from "./shared/track.ts";
const c=spawnCar(),track={...DEFAULT_TRACK,width:2000,obstacles:[]};
Object.assign(c,{speed:35,vx:Math.sin(c.heading)*35,vz:Math.cos(c.heading)*35});
let recovered=-1;
function drive(n,input){
  for(let j=0;j<n;j++){
    stepCar(c,{...EMPTY_INPUT,...input},1/60,track);
    if(c.driftDuration>=.25 && Math.abs(c.slipAngle)<=8*Math.PI/180 && recovered<0)
      recovered=c.time;
  }
}
drive(25,{throttle:1,drift:true,steer:1});
drive(120,{throttle:1,drift:true,steer:.16});
console.log({recovered,time:c.time,impact:c.impact,driftDuration:c.driftDuration,
  slip:c.slipAngle,window:c.miniWindow});
drive(1,{throttle:1});
console.log({releasedWindow:c.miniWindow,impact:c.impact});
'@ | npx tsx --input-type=module
```

期望：首次合法拉正时消费本次漂移时长并开启500ms窗口；等待超过窗口后，单独松漂移不能重新生成资格。持键本身不应阻止由真实侧滑恢复判断结束动作。

## 首次验证命令与范围

实际执行：`npx tsx --test tests/driving-resources.test.ts tests/lap.test.ts tests/tracks.test.ts`。结果22测试、22通过、0失败、退出码0。另实际执行了上述两个内存构造复现的等价 `npx tsx -e` 版本，并记录了输出数值。

本次不重复实现者53项全套，不修改产品代码，不替代主任务的服务器固定步调度、输入序号去重、完成清理、网络延迟、真实浏览器及UI验证。真人手感、真实互联网和完整3D跨层物理均不据此宣称通过。

## 修复提交16345a39的独立复核证据

已读取 `DRIVING_REPORT.md` 最后的修复记录，并检查提交及新增测试实现。报告所述先红后绿属于实现者记录；以下为复核者亲自执行的结果。

实际命令：`npx tsx --test tests/adjacent-road.test.ts tests/driving-resources.test.ts tests/lap.test.ts tests/collision.test.ts tests/tracks.test.ts`。结果：44测试、44通过、0失败、退出码0。

- R1关闭：两个高度（0和20）的原合成邻路均保持左路投影；一个60Hz物理步后车辆中心仍受1.95边界限制，产生道路碰撞，无跳进度和集气。沿真实连接弯向前及倒退的保护用例通过。原山地近路通行及合流回归亦通过，原碰撞断言没有放宽。
- R2关闭：25步强漂移后，持键0.16转向的首次真实拉正立即得到0.5秒窗口并把 `driftDuration` 归零；继续持键超过窗口后资格到期，松漂移不续期，新的油门按下也不再触发。原正常小喷触发、按住去重和氮气优先回归通过。
- 追加finished问题关闭：已有完成回归现在断言 `boostTime=0`，2瓶库存与80能量保持不变。本轮另独立使用 `npx tsx -e` 构造 finished=true、boostTime=2、miniTime=0.25、miniWindow=0.4、nitroBuffer=0.1、driftDuration=0.5、time=40、energy=80、storedNitro=2，先调用 `stepCar` 的dt=0清理，再带油门/氮气按下调用dt=1/60。断言全部通过，输出 boostTime/miniTime/miniWindow/nitroBuffer 均为0、time=40、energy=80、storedNitro=2、nitroUses=miniUses=0。证明零步完成清理及重复调用均不触发资源事件。

本轮没有重复实现者57项全套与类型检查，没有重新运行九路线三难度/八车全局模拟；相关证据仍引用实现者报告。共享接口要求仍是主任务标记finished后调用 `stepCar(c, EMPTY_INPUT, 0)` 或等效同步清理，本复核不代替调用方集成验收。无需为关闭这三项修改参数或扩大测试容差。
