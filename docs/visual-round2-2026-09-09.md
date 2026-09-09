# 第二轮场景与模型交付 · 2026-09-09

已接入主项目：三栋海岸房屋的建筑连接、工业管架的承重结构、19张地图的环境模型动画。沿用上一轮风格化材质和现有HUD。本轮新增的是场景与模型表现；音频、驾驶事件特效及比赛规则由各自模块维护。

预览：`http://localhost:5185/evidence/review.html`。页面全部主图与短片来自真实World渲染器；最初两张生成图只作方向参考，不混入实机证据。

## 主要修复

- 门廊立柱、石座、承梁和椽条连接；瓦屋面/墙体沿同一坡度，檐口、雨槽、落水管连续；三栋门口的三级台阶相邻接地。低矮住宅后翼改为合理的附属单坡屋顶。
- 入户步道从实际导出末级台阶开始，去掉台阶下多余铺装；在原栏杆处配上有铰链的闭合木门。保持赛道边界。
- 工业结构有基础、底板、柱梁承托、斜撑、管道鞍座与法兰；纵向构件随相邻门架真实方向衔接。
- 骆驼腿根嵌入真实身体表面，脚底采样地形；路线绕开仙人掌等小型障碍。鸟翼展开/收拢连续，矿车轮面与独立轨道相接，活塞行程内保持连接。
- 实机发现连续切图继承WebGL上下文状态：在旧renderer释放前与新renderer构造后重置，修复纯白画面和纹理上传1282错误。

## 简洁视觉规范

继承现有HUD与第一轮的温暖主光、冷色填充和克制PBR。海岸使用蓝灰石板、浅暖石墙和木色；工业部件区分深钢、暖金属和浅混凝土；动物使用低对比自然色。道路与警告高于装饰，新增模型全程位于行车区域之外。

主要体块完整，局部倒角表达边缘，重复紧固件限于能读出的连接位置。房屋继续使用已有分辨率：hero 2048²，其余1024²；保留间接光、法线、粗糙度与金属度通道。独立部件允许结构性嵌入，不以布尔合并整个建筑作为质量指标。

动态参考用户提供的19张地图音乐/环境声方向，但没有曲目标记，故不声称节拍同步。长周期内保留静止窗口；同类地图以动作幅度、高度、速度和留白区分。详见 `output/visual-round2-20260909/music-visual-direction.md`，其中另行标明的船体/浮冰建议不属于已实现内容。

## 动态覆盖与实机记录

| 地图 | 实际模型类型 | 高画质实例 | 8车固定步进 |
| --- | --- | ---: | --- |
| 晴湾环海 | whale | 2 | 360 × 8，正常 |
| 落日货运港 | winch | 2 | 360 × 8，正常 |
| 赤金沙漠 | camel | 3 | 360 × 8，正常 |
| 霓虹街区 | ventilation | 2 | 360 × 8，正常 |
| 钢铁工厂 | piston | 2 | 360 × 8，正常 |
| 星环空间站 | orrery | 2 | 360 × 8，正常 |
| 巨木森林 | bird | 3 | 360 × 8，正常 |
| 极光冰川 | wind-banner | 2 | 360 × 8，正常 |
| 熔岩矿山 | minecart | 2 | 360 × 8，正常 |
| Orchard Run | bird | 3 | 360 × 8，正常 |
| Coastal Causeway | whale | 2 | 360 × 8，正常 |
| City Switchbacks | ventilation | 2 | 360 × 8，正常 |
| Treetop Divide | bird | 3 | 360 × 8，正常 |
| Canyon Slalom | camel | 3 | 360 × 8，正常 |
| Frozen Lagoon | wind-banner | 2 | 360 × 8，正常 |
| Dockside Divide | winch | 2 | 360 × 8，正常 |
| Clockwork Works | gears | 2 | 360 × 8，正常 |
| Orbital Interchange | orrery | 2 | 360 × 8，正常 |
| Mine Transit | minecart | 2 | 360 × 8，正常 |

鲸鱼34/40秒周期内跃起5秒；骆驼32/38秒周期，森林鸟群19–32秒周期。其他地图使用绞盘、风机、活塞、齿轮、仪器环、风向旗、矿车，共七种机械模型。每张地图都有实际实例，既有布局未改变。

## 可编辑资产与预算

| 模型 | 三角面前→后 | 实际运行字节前→后 |
| --- | ---: | ---: |
| cottage-hero | 10,440 → 11,136 | 5,311,684 → 5,211,711 |
| cottage-gable | 8,204 → 8,860 | 2,699,752 → 2,695,838 |
| cottage-low | 9,616 → 9,812 | 2,740,296 → 2,698,971 |

运行字节为GLB加单独载入的indirect PNG。三个Blender源文件保留1,078个可编辑部件。真实导出检查覆盖法线、UV、PBR、边界、接触几何和资源大小；细节在cottages-report.md。

鲸鱼每实例4,616面、4材质、5个名义绘制提交；骆驼5,496面、4材质、22提交；鸟1,122面、4材质、6提交。阴影通道另计，实测提交数见CSV。运行动物由 `client/fauna-models.ts` 与 `client/ambient-fauna.ts` 可编辑生成；`public/art/fauna/*.glb` 是静态目录资产，不被运行时加载，未内嵌动画片段。机械的可编辑源为 `client/ambient-stage.ts`。全部新增模型自主程序制作，房屋沿用本项目资产管线；未引入外部付费/授权不明资产。

高/低画质：鲸鱼2/1、骆驼3/2、鸟3/1、机械2/1。高/低距离裁剪：鲸鱼350/250m、骆驼160/110m、鸟130/90m、机械220/130m。减少动态模式使用静态合理姿势。固定数量、预建网格、共享材质、场景局部所有权，无每帧新建几何、音频或监听器；暂停停止视觉时间，切图dispose后释放。

## 同条件性能

设备：Windows11 Pro，i7-12700KF，RTX5060Ti；Chrome152 / ANGLE D3D11；1280×720、DPR1、单客户端、8辆真实赛车。采集时没有Blender烘焙作业。控制版与升级版冻结在同一代码/资产基础，仅开关本轮视觉改动；并行任务的后到障碍修改未混入归因对照。控制版原始截图和升级版机位、分辨率一致。

50次预热、100次采样，MessageChannel + gl.finish；GPU查询通常回收99条。这里计量的是验证场景多次World提交的CPU/GPU成本，**不是屏幕FPS或单次正常游戏帧耗时**。两边都暂时排除驾驶事件VFX更新；其余内容一致。数据受后台任务、缓存和GPU频率影响，负差值不能直接归因于这轮视觉优化。

高画质实际记录，单位ms；低画质、CPU、p95、三角面、样本数在 `performance.csv`。

| 地图 | GPU 前→后 | 差值 | 绘制调用 前→后 |
| --- | ---: | ---: | ---: |
| 晴湾环海 | 6.01 → 5.81 | -0.20 | 500 → 508 |
| 落日货运港 | 5.44 → 4.87 | -0.57 | 535 → 555 |
| 赤金沙漠 | 3.55 → 3.93 | +0.38 | 439 → 505 |
| 霓虹街区 | 5.05 → 4.09 | -0.96 | 485 → 497 |
| 钢铁工厂 | 4.69 → 4.82 | +0.13 | 612 → 627 |
| 星环空间站 | 7.29 → 4.41 | -2.88 | 548 → 562 |
| 巨木森林 | 7.51 → 5.93 | -1.58 | 539 → 563 |
| 极光冰川 | 7.36 → 6.86 | -0.50 | 712 → 748 |
| 熔岩矿山 | 6.77 → 4.42 | -2.36 | 467 → 481 |
| Coastal Causeway | 5.08 → 5.07 | -0.01 | 493 → 497 |
| Canyon Slalom | 4.30 → 5.96 | +1.67 | 544 → 544 |

为显示新增动态的直接开销，另在同一个已加载World、同一活动近景机位依次隐藏/显示模型；仅显示侧更新姿态，单次render，40次预热、100次采样。该测量仍不等于显示FPS。完整记录 `active-cost.csv` 和 `after/active-cost.json`。

| 地图 | 隐藏→显示 GPU | 差值 | 绘制调用 |
| --- | ---: | ---: | ---: |
| 晴湾环海 | 1.13 → 1.15 | +0.02 | 239 → 244 |
| 赤金沙漠 | 0.43 → 1.05 | +0.62 | 272 → 404 |
| Orchard Run | 0.40 → 0.47 | +0.06 | 243 → 249 |
| 落日货运港 | 0.35 → 0.49 | +0.13 | 268 → 278 |
| 霓虹街区 | 0.80 → 0.68 | -0.11 | 363 → 375 |
| 钢铁工厂 | 0.75 → 0.78 | +0.04 | 436 → 450 |
| Clockwork Works | 0.59 → 0.59 | -0.01 | 293 → 315 |
| 星环空间站 | 0.44 → 0.35 | -0.09 | 262 → 276 |
| 极光冰川 | 1.34 → 1.62 | +0.29 | 595 → 619 |
| Mine Transit | 0.49 → 0.48 | -0.00 | 238 → 253 |

## 验收与边界

- 19地图，逐图8车×360固定步进，加载及驾驶后的画面采样有效，GL错误均0，车辆状态有限。即每图约6秒模拟回归，不等于19条赛道全程完赛。
- 全量789项测试通过；最终上下文修复后51项相关测试再次通过，正式构建通过。现有大JS包告警保留。结构与动物的独立复查问题已修复，复查无重要遗留项。
- 5段1280×720无声实机短片覆盖鲸鱼、骆驼、鸟、活塞、矿车；逐片核验解码帧数。时间由真实渲染模型的独立视觉时钟驱动。
- 主项目大厅、车库、自由练习HUD、暂停/继续/返回大厅实际通过；HUD在1280×720、1920×1080、2560×1080均无页面溢出，关键区域可见。720p大厅允许向下滚动至页脚，车库车型列表使用内部滚动。详见 `after/ui-validation.json`。
- 连续四次相同地图重建，均为302几何/74纹理/132场景子节点；旧场景子节点与几何归零、新增动态根节点脱离。旧renderer纹理计数仍留1，四轮不增长；这不是长时堆内存泄漏证明。详见 `after/lifecycle-validation.json`。本轮没有把AI自动驾驶短测作为联网或奖励到账验收。
- 手机硬件、多客户端联网、长时热稳定、音画精确同步和所有地图整场比赛未在本轮实机复验；不声称1:1像素复刻。未修改驾驶事件特效或制作音乐。
- 第一遍受旧GL状态影响的白图与旧1fps录屏不作为交付证据。有效帧和视频在预览页中明确索引。

## 启动与复现

在项目目录运行 `npm run dev`，打开输出的本地地址（当前主项目5173）。进入单人练习，选择对应地图；海岸在开阔水域观察间歇跃起，沙漠骆驼在路外缓行。动态仅在该地图实例范围内播放；开启减少动态后改为静态姿态。

固定证据预览：`node node_modules/vite/bin/vite.js --config output/visual-round2-20260909/vite-review.config.ts` → `http://localhost:5185/evidence/review.html`。`/lab.html` 可切换19张地图和画质。证据服务需重新采集时才启动：`node output/visual-round2-20260909/evidence-server.mjs`。验证脚本位于runtime，未进入生产UI。

模型重建：`output/blender-runtime/Scripts/python.exe scripts/scene-assets/build.py --asset cottage-hero --size 2048 --samples 16`，其余两栋size1024；然后按 `scripts/scene-assets/validate_junctions.py` 的geometry/source/deliver模式验证。动物目录导出：`node --import tsx scripts/fauna-assets/export.ts`。报告与原始资产统计可追溯到本轮reports目录。

## 修改文件与资源

以下为本轮编辑范围；World、level-scenery、测试、manifest为共享文件，不代表整份Git diff都属于本轮。精确大小与SHA256见 `modified-files.json`。本轮文档、验证脚本、图像、视频另集中在 `output/visual-round2-20260909`，未提交仓库。

- `art/coast-rebuild/cottage-gable.blend`
- `art/coast-rebuild/cottage-hero.blend`
- `art/coast-rebuild/cottage-low.blend`
- `art/fauna/catalog.json`
- `client/ambient-direction.ts`
- `client/ambient-fauna.ts`
- `client/ambient-stage.ts`
- `client/architecture-joints.ts`
- `client/coast-gardens.ts`
- `client/fauna-models.ts`
- `client/level-scenery.ts`
- `client/world.ts`
- `public/art/coast-rebuild/cottage-gable-color.png`
- `public/art/coast-rebuild/cottage-gable-indirect.png`
- `public/art/coast-rebuild/cottage-gable-normal.png`
- `public/art/coast-rebuild/cottage-gable-orm.png`
- `public/art/coast-rebuild/cottage-gable.glb`
- `public/art/coast-rebuild/cottage-gable.json`
- `public/art/coast-rebuild/cottage-hero-color.png`
- `public/art/coast-rebuild/cottage-hero-indirect.png`
- `public/art/coast-rebuild/cottage-hero-normal.png`
- `public/art/coast-rebuild/cottage-hero-orm.png`
- `public/art/coast-rebuild/cottage-hero.glb`
- `public/art/coast-rebuild/cottage-hero.json`
- `public/art/coast-rebuild/cottage-low-color.png`
- `public/art/coast-rebuild/cottage-low-indirect.png`
- `public/art/coast-rebuild/cottage-low-normal.png`
- `public/art/coast-rebuild/cottage-low-orm.png`
- `public/art/coast-rebuild/cottage-low.glb`
- `public/art/coast-rebuild/cottage-low.json`
- `public/art/coast-rebuild/manifest.json`
- `public/art/fauna/bird-catalog.glb`
- `public/art/fauna/camel-catalog.glb`
- `public/art/fauna/whale-catalog.glb`
- `scripts/fauna-assets/export.ts`
- `scripts/scene-assets/architecture.py`
- `scripts/scene-assets/validate_junctions.py`
- `tests/ambient-fauna.test.ts`
- `tests/ambient-stage.test.ts`
- `tests/architecture-joints.test.ts`
- `tests/coast-assets.test.ts`
- `tests/world-lifecycle.test.ts`
