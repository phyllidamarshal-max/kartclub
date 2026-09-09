# KART CLUB 视觉完善实施计划

> Execution: isolated UI/model subagents; root owns World, camera, road readability, integration and runtime evidence. Ordinary choices are authorized by the user. No commits or deployment.

**Goal:** 在真实游戏中统一 UI、提高赛车质量与道路可读性，交付源资产、同条件截图和性能记录。

**Architecture:** 延续 Three.js / TypeScript / DOM 界面。客户端只读消费 Car、Input、Snapshot，不修改物理、赛道布局、网络协议或模拟账本。程序模型作为可编辑制作源并导出 glTF/GLB；World 集成运行资产和独立的车轮表现逻辑。

**Tech stack:** Three.js 0.185.1、Vite 8.2.2、Node 24.16、TypeScript、现有 Blender Python；不增加运行时依赖。

## Global Constraints

- 用户最新要求：特效不归本任务负责。不得修改粒子、尾焰、漂移痕迹、声音和后处理特效。
- 保留所有已有未提交修改，尤其海岸资产和地图配乐；不得回滚、提交或部署其他人的工作。
- 不改变驾驶参数、碰撞体、比赛逻辑、输入绑定、赛道路线和联机/奖励协议。
- 奖励为模拟值；界面必须区别免费、取消、审核、已结算与实际确认金额。
- 先运行基线再修改；静态对照同机位/同分辨率，性能相同场景、画质、车数、缓冲尺寸。
- 本次 UI 延续奶油白 #F5F1E6、深绿 #173E30、青柠 #C0FA67 品牌，8px 控件/12px 面板/16px 弹窗，4px 间距基数。说明文字至少12px、正文14–16px、重要比赛数字32–44px；具体布局以720p实机校验。

## 1. 审计与基线

- [x] 分组完整阅读开发文档、规则和客户端/模型资产；未发现仓库或祖先目录 AGENTS.md。
- [x] 保存修改前 client/shared 快照与大厅、模式、起跑 HUD、真实 DNF 结算截图。
- [x] 保存同条件赛车场景/模型统计与帧耗时基线。来源：output/visual-polish-20260908。

## 2. UI（独占范围）

Files: client/main.ts、client/ui.ts、client/brand.css、client/gameplay.css、client/locales/visual.ts、client/i18n.ts、client/visual-state.ts、tests/visual-state.test.ts。

- [x] 从真实状态派生集气、满槽待收、库存满、释放中；能量条/库存/当前释放分开表达，暂停/完赛无错误状态。
- [x] 优化比赛 HUD、危险提示和结算层级；实际检查1280×720、1920×1080、1920×823；保留窄屏布局，未新增触摸驾驶。
- [x] 为现有标准赛车提供外观展示入口与前/侧/后观察操作，不虚构新性能车型或新的解锁经济。
- [x] 保持统一控件状态、键盘焦点、待处理及错误提示；纯状态回归后由 root 实机核验。

## 3. 赛车模型（独占范围）

Files: client/kart-model.ts、client/kart-batching.ts、client/kart-asset.ts、scripts/kart-assets/*、art/kart/*、public/models/kart/*、tests/kart-model.test.ts、tests/kart-batching.test.ts、tests/kart-asset.test.ts。

- [x] 优化主车主要体块、保险杠和驾驶舱比例；保留原创头盔/角色特征，区分烤漆、塑料、金属、橡胶和玻璃。
- [x] 明确米制、Y向上、Z向前，四轮转向/滚动独立枢轴，保留现有排气口兼容位置。
- [x] 合批保持动态节点，导出源文件和GLB，统计真实三角面/顶点/材质/绘制数量。
- [x] 资产与节点契约回归，不修改 World 或 shared。

## 4. 场景、镜头与集成（root 独占）

Files: client/world.ts、client/kart-motion.ts、client/road-readability.ts、tests/kart-motion.test.ts、tests/road-readability.test.ts、tests/world-lifecycle.test.ts；output/visual-polish-20260908/*。

- [x] 根据实测起跑前景遮挡，提高追尾机位可读性，保留原有机位模式和镜头强度设置。
- [x] 加载实际GLB并保留制作源回退；轮胎旋转由真实纵向位移与半径计算，转向使用输入/远端真实航向变化，不回写 Car。
- [x] 代表性海岸弯道增加少量清晰方向标记；沿用现有路线和碰撞边界，避免占用近道/邻路。
- [x] 验证低画质、资源销毁和场景切换。所有新增几何/材质有清晰所有者。

## 5. 运行验收与交付

- [x] 主流程大厅→模式→赛车展示→比赛→暂停→结算→重赛；真实资源/奖励状态与UI一致。
- [x] 独立基准页面固定缓冲尺寸、时间、八车；记录设备/实际WebGL渲染器、质量、P50/P95/P99及draw calls，区分CPU提交时间与帧间隔。
- [x] 构建、相关单测、完整回归及隔离数据联机 smoke；不以旧测试结论替代新验证。
- [x] 代码/资产复核，截图对照、可播放录屏、来源/修改清单、性能对比、未验证事项及启动方法。

## 验收边界

执行结果与未覆盖项目以 docs/visual-polish-2026-09-08.md 为准。65项视觉测试与构建通过；全量391/392，唯一并行SDK超时隔离复测通过。四种氮气状态为纯状态测试覆盖，实机仅直接复现普通集气；未拍全部特殊状态、全部语言与RTL。特效和其他任务后续接入的联合性能不在本轮结论中。
