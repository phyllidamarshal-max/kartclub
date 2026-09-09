# 剩余特效实施计划

> 使用 subagent-driven-development 按独立模块实施；用户已明确授权「继续剩余工作」。设计依据为 docs/vfx-audit-and-optimization-2026-09-08.md。持续执行，不重复请求方案批准。

**目标：** 补齐剩余驾驶资源、碰撞、攻防、赛道节点、结果及九图环境的第一版可玩特效，并逐项记录实现程度。

**架构：** 保留上一批驾驶/名次模块。新增有界道具展示事件、共用粒子绘制层、世界事件效果、HUD 局部动效、赛道目标与环境模块。所有事件效果仅消费单人真实状态/多人确认快照；状态缺失时不伪造成功。Three.js + TypeScript，零新增依赖。

## 全局约束

- 只做特效及必要显示记录/调用；不改变物理数值、AI、命中判定、赛道/模型、音频、奖励或名次。
- 当前共享工作区有其他任务改动；局部修改，保存本轮基线，不提交或回滚他人工作。
- 总短粒子 high 768 / low 192：驾驶 448/112、事件 192/64、环境 128/16；独立辅助圈 high 64 / low 32，胎印沿用 480/256。高档总新增绘制目标≤18，低档≤10。优先保留本车事件；可选热浪/全屏效果不做。
- motion=0 / 系统减少动态时停风线、纸屑、爆闪和装饰粒子，保留读状态的静态轮廓。暂停冻结，>250ms 长帧重建基线，新赛局/切图清理。
- 道具事件日志至多 64 条，序号单调，保留约 2s；只增加展示元数据，不变更游戏行为。实体到期/丢失目标不生成命中。

## 1. HUD 与资源/比赛节点

文件：client/vfx/hud-state.ts、hud.ts、hud.css；tests/vfx-hud.test.ts。

接口：`HudVfx(host:HTMLElement)`，`update(frame:HudVfxFrame, dt:number)`，`reset()`，`dispose()`。HudVfxFrame 包含 raceId、active、paused、car、confirmed（Car|null；null表示不能确认事件）、items（ItemWorld|null）、countdown、releaseRemaining、totalLaps、trainingStep（number|null）、gate（number|null）、completedCorners:number、failed、pbSerial、sectorSerial、motion、quality。update 不更改输入对象；父控制器负责 main 调用。

- [x] TDD：确认计数高水位、同帧用瓶/入瓶、未确认预测不触发、失败/暂停/重绘/新赛局、两弹护盾威胁过滤。
- [x] A01/A02/A06/A08/A09/A11/A15：倒计时和真实放行、外缘速度线、小喷窗口轮廓、满气/收气/接续/扣气局部动画，数字和机会仍依现有状态。
- [x] B02/B03/B08/B13：道具槽拾取/使用/命中/挡击跳光；incomingThreat过滤后的方向警告（不能挑选被盾抵消的第一颗弹）。
- [x] C07/C08/C09/C11：教学步骤、延迟放行、合法换圈、确认分段提升和 PB 局部光扫。
- [x] 结果辅助 `mountResultFeedback(host,{raceId,finished,failed,stars,motion,podium}):()=>void`：C10/C12/C13 通用完赛、实际星级依次点亮和失败；前三主庆祝启动时不叠加通用粒子。有限去重并完整清理。

## 2. 世界事件与道具链（控制器）

文件：shared/vfx-events.ts、shared/items.ts 的只读展示记录；client/vfx/events.ts、particle-layer.ts、race.ts、budgets.ts；tests/vfx-events.test.ts、vfx-race.test.ts。

- [x] TDD：命中/盾挡/拾取/发射/布置来源，过期不爆炸、事件保留上限、旧快照/重连不补播、容量、清理。
- [x] 展示日志记录位置/高度、actor/target、item、序号和事件时刻，导弹/陷阱增加可选稳定展示id。不改判定分支，只在已执行的动作旁追加记录。
- [x] A12–A16：碰撞种类/强度对应短火花与薄环，真实扣气增加能量碎点；复位等待/目标展开和独立保护轮廓。接触点无法可靠获得时遵循方案使用克制的车侧效果，不虚构精确法线。
- [x] B01–B12：箱体浮光/冷却展开；道具加速来源；护盾展开/边缘壳/到期/挡击；导弹方向和短尾迹；陷阱未激活/激活/触发；减速与恢复保护区分。
- [x] 共用粒子材质与实例环，不分配逐粒子对象，不增加动态灯或后处理。

## 3. 赛道目标及九图环境

文件：client/vfx/course.ts、environment.ts；course.ts 内的流光覆盖材质；tests/vfx-course.test.ts、vfx-environment.test.ts。

- [x] C01–C03：加速带沿真实边界流动、给油入区车底流光；真实 sand/ice 区轮尘/冰屑，离区即停。
- [x] C04–C06：近道入口边缘扫光；港口计时门、指定漂移弯、弯道训练终点依据实际数据挂点，完成/失败状态只读。
- [x] E01–E09：复用已有海面/熔岩/星场；海岸落花/岸外溅点、港口导航/水线、沙漠路外风沙、城市蒸汽、工厂烟/焊点、空间微光、森林落叶/微尘、冰川稀疏雪/远景极光、矿山余烬/晶体弱脉冲。
- [x] 发射器绑定实际命名场景对象或经过道路/近道间距检测的路外位置；无源对象则不伪造建筑烟口。门/弯/洞内前景留白；低档减少环境，所有资源归模块统一释放。

## 4. 接入、复审与验收

- [x] client/world.ts：车辆姿态→世界/道具/目标/环境效果→统一提交；旧道具实体绘制替换/复用，避免双盾/双弹。
- [x] client/main.ts：比赛身份/权威car、PB保存成功、sector改善、教学/挑战/结果状态接入；界面替换前清理特效。
- [x] 保留并扩展 output/vfx-20260908 的交互预览，检查碰撞、攻防、资源、复位及全部九图环境。
- [x] 相关测试→全量一次→构建→独立审查→必要修复复测；更新54项实现状态。性能必须区分CPU采样、绘制预算与尚未实测的完整GPU帧。

验收证据见 `output/vfx-20260908/remaining-validation.md`。本计划基础实现完成；目标设备 GPU 配对测量、浏览器十局资源驻留和九图路线录像仍按验收记录列为未完成实测，不由 CPU 样本或模块测试替代。

