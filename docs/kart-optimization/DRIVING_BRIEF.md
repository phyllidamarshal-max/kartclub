# 共享驾驶任务要求

先读此文件，这是该子任务范围；用户全文在 USER_SPEC_v1.0.md，可重点查4–7节与AC02–14。现有仓库为TypeScript浏览器卡丁车，九路线/物理已工作，但资源和进度有缺口。

拥有文件：shared/race.ts、shared/track.ts（不要修改route-data）、新增shared/driving-config.ts、tests/race.test.ts/lap.test.ts/collision.test.ts/tracks.test.ts和新增tests/driving-resources.test.ts。可以调整 shared/ai.ts 和 tests/ai.test.ts 使AI适应新资源。不要改client/server/ghost/gameplay/items/protocol。不要碰output/。

目标：固定60Hz，保留原碰撞求解；真实侧滑(heading vs velocity)、合法向前进度、足够速度才集气；低角度/静止/卡墙/倒车/投影跳跃不集气。配置集中冻结。实现2瓶库存+0–100能量、满槽转换，3s氮气1.2速度/1.35加速度、150ms新按缓存、按住不重复。一次>=250ms有效漂移且拉正到8度内获得500ms小喷资格，新的油门按下触发350ms1.08速度/1.15加速度，氮气优先，无叠乘。严重碰撞/复位/完赛取消资格和buffer；资源库存/能量保留。1500ms复位等待计时，不能前移合法进度，1s车车保护；等待时不移动或产生资源。完成标记后的资源计时可冻结但不触发事件。

约定供主任务集成的Car字段：storedNitro:number, miniTime:number, miniWindow:number, resetTime:number, slipAngle:number(弧度), driftState:'grip'|'entering'|'drifting'|'recovering', nitroUses:number, miniUses:number, collisionCount:number, lastLapTime:number(权威穿越时刻), sectorTimes:number[](本圈已过三等分区段的累计圈内时间，可主任务另做若不方便)。保留旧字段 energy/boostTime/driftTotal/checkpoint/progress/lap/time/ack 等；stepCar同签名。无序列的单机由Car按键held去重，联机主任务会锁存边沿，不要改变Input必需字段。

进度：解决仅XZ最近点吸到临近发卡弯/桥面的风险；用连续路段/lastT约束投影，合法山地shortcut必须仍可跑通。法线碰撞也用连续投影避免瞬移到别路。前进增量必须符合本步物理距离，不能简单0.04圈。advanceProgress公共回归API可保留用于纯连续点测试，但实车使用严格检查；合法圈末计算跨步插值穿越时刻 lastLapTime，主任务服务器/单机用它作finish time。复位不能把倒车玩家传送向前（初始发车负进度可回原格，记录明确）。旧instantreset测试按新规格合理更新，不能放宽碰撞保障。

验证：先红后绿有意义回归，重点AC02–14，全部九路线三难度3圈与8车专家能完赛。AC02同输入60Hz物理在30/60/120fps调度结果位置/时间容差1e-7，资源/圈/事件相同。测试场沿用九图与测试自定义直道/邻路，不增正式美术。集气系数可据真实路线调整，记录，不能为了测试让无侧滑集气。

交付 docs/kart-optimization/DRIVING_REPORT.md 包含修改、参数、红绿验证命令结果、限制与接口。只提交拥有文件及报告（git -c user.name=Codex -c user.email=codex@local commit）。不要直接结束整个主任务。若sectorTimes接口难以安全添加先发消息协调。不要另开子代理。
