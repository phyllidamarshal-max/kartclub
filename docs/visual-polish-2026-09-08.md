# KART CLUB 视觉完善交付记录 · 2026-09-08

本轮将界面、赛车模型、轮胎运动和道路可读性整合到已有游戏，保留原有驾驶、输入、赛道玩法、联机与模拟经济。用户最后明确：**本任务不负责特效**。粒子、尾焰、漂移痕迹、声音与后处理不属于本轮修改范围。

状态：代码与资产已接入；构建、65项视觉相关测试、双客户端比赛与结算、4/8客户端网络验证、十局资源检查已完成。最新完整测试391/392通过，唯一断线到期测试并行运行超时，隔离复测通过。直接查看 [图片、录屏与数据对照页](../output/visual-polish-20260908/review.html)。

## 设计规范与真实状态

- 品牌颜色：奶油白 `#F5F1E6`、深绿 `#173E30`、青柠 `#C0FA67`。沿用 KART CLUB 原始标志与原创头盔车手，不引入新的产品身份。
- 间距基数4px；控件/面板/弹窗圆角8/12/16px；说明文字至少12px、正文14–16px，比赛主数字32–44px。720p、1080p、超宽及横屏适配须以最终真实页面检验，不能仅靠CSS存在判为通过。
- 集气槽、已存瓶与正在释放的计时分别表达。正式UI状态来自真实 `Car` 和当前驾驶配置：集气中、满槽待收、库存满、释放中；暂停和完赛禁用动作，氮气仅在真实末段缓冲窗口允许再次按键。
- 奖励展示区分取消、免费、等待、已分配、可领取与已确认入账。比赛结果、结果摘要、账户pending和真实领取回执各有自己的来源，不使用预测金额伪装余额；本项目仍全部为模拟资产。
- 车库展示现有标准赛车的前/侧/后视图，不虚构额外性能车型、解锁条件或经济权益。对焦、按钮待处理、错误和禁用状态沿用实际交互。
- 本地轮胎转向消费当前输入；远端由实际航向变化估计；滚动使用真实纵向位移/轮胎半径。只改视觉节点，不回写 `Car`、速度、碰撞体或输入。
- 稀疏弯道箭头来自现有路线曲率，并检查主路、邻路与近道的空隙。追尾机位提高以减少起跑前景车手遮挡；保留既有机位模式和镜头强度控制。

## 已证实的问题与改动

| 问题 | 本轮处理 | 可用证据与验收边界 |
| --- | --- | --- |
| 起跑追尾视角被后排近景头盔大面积遮挡 | 提高追尾相机，保留真实起跑格和车数 | before/after/grid-720.png 可见道路遮挡差异；机位本身是改动项，不能标成同机位截图 |
| 轮胎缺少独立转向/滚动表现 | 分离四轮转向挂点与滚动子节点，加入只读 KartMotion | 初始red-tests与最终65项通过日志，10秒实机录像 |
| 模型车身与头盔比例、材质层次需完善 | 较低头盔、连续鼻锥/侧舱体块、保险杠和独立PBR材质，交付运行GLB及编辑源 | 前/侧/后固定相机截图与资产manifest；不宣称商业级品质或物理改进 |
| 集气、库存、释放及奖励阶段不够分明 | 只读派生状态与分区UI，保留名次/并列/DNF语义 | 8项状态测试、HUD/实际DNF截图；特殊动态状态未逐一录像 |
| 资产替换可能留下临时模型或晚到资源 | World缓存单次加载，加载后prune回退模型，切图释放模板，失败保留可用回退 | 生命周期测试通过、十局资源计数一致 |

历史独立审查中的负发车进度、邻路投影、障碍切向卡死、小喷窗口、道具重复命中、教学串入联机、重连延长窗口及旧资源销毁问题均已有关闭记录，不将其重新列为本轮新发现。真实协议仍以Snapshot为核心，没有可直接消费的通用客户端RaceEvent消息流；本轮未改该接口。

## 资产、来源与统计

赛车及车手为项目原创几何和材质，没有下载的第三方模型或纹理。可编辑源：`art/kart/club-kart.blend`；拆分中转源：`art/kart/club-kart-source.glb`；确定性制作代码：`client/kart-model.ts`；运行资产：`public/models/kart/club-kart.glb`。来源说明及再生成入口见 [资产README](../art/kart/README.md)，统计见 [manifest.json](../public/models/kart/manifest.json)。

| 资产形式 | Mesh数 | 三角面 | 顶点 | 材质 | 几何缓冲字节 | 文件字节 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 分离制作源GLB | 116 | 26,644 | 35,636 | 8 | 1,255,008 | 1,381,976 |
| 运行GLB | 23 | 26,644 | 16,115 | 8 | 563,128 | 586,144 |

此表比较同一新版资产的制作形式与运行形式，**不是旧版与新版性能对照**。运行资产0纹理；Blender源文件4,052,504字节。几何/材质统计不含场景、灯光、阴影或World现有尾焰，Mesh数也不等同整帧绘制调用。

旧版实际合批模型为22个mesh、35,012三角面、2,352,768几何缓冲字节；新版为23个mesh、26,644三角面、563,128字节，三角面减少23.9%，几何缓冲减少76.1%。独立轮胎层级和材质带来少量绘制调用增加，不能由面数下降推导整体帧率提升。

运行坐标为米制、+Y向上、+Z向前；Blender导入坐标为+Z向上、-Y向前。轮胎半径0.52m，静态底部y=0.1m，运行模型包围尺寸约2.840×2.685×3.870m。四轮挂点沿局部Y转向，`wheel-spin-*`子节点沿局部X滚动；原排气口挂点与角色替换契约保留。外观尺寸不会生成或修改驾驶碰撞形状。

## 测量方法与可比边界

性能表由真实浏览器采样的JSON整理，并复算分位数。设备为Intel Core i7-12700KF、Windows 11专业版、Node v24.16.0（device.json）。16份记录时间为2026-09-08 12:19:38–12:21:44 UTC（北京时间20:19:38–20:21:44）。Windows Chrome/Chromium 152；实际WebGL renderer：ANGLE / NVIDIA GeForce RTX 5060 Ti / Direct3D11。视口1280×720，屏幕2560×1440，设备DPR约1.96；渲染器强制pixelRatio=1，缓冲独立固定1280×720或1920×1080，CSS画布约1280×720。高/低画质分别使用现有设置；未将高画质降档后冒充同条件结果。

每次8辆专家AI、种子537，零初始赠送氮气/道具资源，使用真实AI输入、60Hz共享物理、车车碰撞和道具逻辑。120个rAF帧预热，随后360个rAF帧测量，每个rAF固定推进一个物理tick，合计8秒模拟工作量。因此它是固定工作量的渲染循环实验，不是正常实时调度比赛，也不据此提供显示FPS或全局净提升结论。未调用账户、网络房间、音频、成绩写入或奖励接口；保留World已有视觉表现但不单独评估/修改特效。

每个JSON保留原始帧间隔、同步CPU时间与逐帧资源计数。分位数使用排序后最近秩 `ceil(n×q)-1`；报告已只读复算16份文件的P50/P95/P99，与记录一致。全部记录360个样本、`invalidVisibility=false`、超过250ms帧数0；`valid=true`只表示这些采样条件，不等于性能全面达标。

- **rAF间隔**：相邻回调时间差，含调度与可能的等待，既非GPU计时也非显示器刷新率。
- **物理+渲染提交CPU**：同步AI/物理/碰撞/道具及渲染提交的主线程耗时，不等待GPU完成。
- **渲染提交CPU**：同步World绘制提交子区间。未使用GPU timer query，不能将其标为GPU时间。
- before使用冻结的 `baseline/client`；两版本模拟均使用冻结的 `baseline/shared`。物理配置SHA256为 `512a7ba440c9d11448cb85dab58dd421dc40e209fede093d66d31548a3ed260b`；基线规则 `pons-rules-0.4.1`、路线 `routes-0.4.0`、物理 `driving-v3.2`。海岸/城市track hash在对应前后记录中一致。
- 采样时after来自关闭监视的5175服务所缓存的World及依赖。之后从该服务的源映射提取27份实际加载源码至 `verified/client`、`verified/shared`，验证页after现固定读取这份快照，避开其他任务后来接入的VFX。正式游戏仍使用当前 `client`。**public资源没有冻结**，两侧共用public；`verified/assets.sha256.json`记录交付时GLB、海岸manifest与content的哈希，不是完整历史资源快照。当前特效/音乐/地图任务的后续改变不包含在本次16份测量中。
- 追尾相机是本轮改动的一部分，会改变视锥与可见物体；整帧三角面/调用变化不能单独归因于模型合批。随机痕迹/运行缓存也没有作为独立变量固定。

## 1080p海岸三次结果

单位均为毫秒。单元格格式为 **三次统计量的中位数 [三次最小–最大]**；这不是把1080个帧混合后重算分位数，也不是置信区间。所有原始单次结果保留于后文。

| 画质·版本 | 测量 | 均值 | P50 | P95 | P99 | 单次最大值 |
| --- | --- | --- | --- | --- | --- | --- |
| high · before | rAF间隔 | 3.177 [3.151–3.542] | 3.1 [3.1–3.1] | 3.2 [3.2–3.3] | 6.3 [3.3–18.8] | 9.4 [6.3–25] |
| high · before | 物理+渲染提交CPU | 1.874 [1.723–1.934] | 1.7 [1.6–1.7] | 2.7 [2.1–2.7] | 7.9 [5.5–8.1] | 9.1 [8.6–26.7] |
| high · before | 渲染提交CPU | 1.674 [1.537–1.759] | 1.5 [1.4–1.5] | 2.3 [2–2.4] | 7.7 [5.3–7.8] | 8.8 [8.4–26.5] |
| high · after | rAF间隔 | 3.194 [3.16–3.594] | 3.1 [3.1–3.1] | 3.2 [3.2–6.3] | 6.3 [6.1–21.9] | 9.4 [6.3–22] |
| high · after | 物理+渲染提交CPU | 1.927 [1.864–2.075] | 1.8 [1.8–1.9] | 2.6 [2.2–3.1] | 6.7 [6.7–6.9] | 8.8 [8.7–9.5] |
| high · after | 渲染提交CPU | 1.768 [1.699–1.899] | 1.7 [1.6–1.7] | 2.3 [2–2.7] | 6.6 [6.6–6.8] | 8.6 [8.6–9.4] |
| low · before | rAF间隔 | 3.16 [3.16–3.507] | 3.1 [3.1–3.1] | 3.2 [3.2–3.2] | 6.2 [6.2–18.7] | 6.3 [6.3–21.9] |
| low · before | 物理+渲染提交CPU | 1.379 [1.353–1.445] | 1.2 [1.2–1.4] | 1.9 [1.8–2] | 5.7 [5.3–6.2] | 8.1 [7.8–8.4] |
| low · before | 渲染提交CPU | 1.196 [1.181–1.278] | 1.1 [1.1–1.2] | 1.6 [1.5–1.8] | 5.5 [5–6] | 8 [7.6–8.3] |
| low · after | rAF间隔 | 3.177 [3.16–3.846] | 3.1 [3.1–3.1] | 3.2 [3.2–6.2] | 6.3 [6.2–24.9] | 6.3 [6.3–28.2] |
| low · after | 物理+渲染提交CPU | 1.517 [1.503–1.61] | 1.4 [1.4–1.5] | 2.1 [1.8–2.2] | 6.2 [5.3–6.4] | 8 [7.9–9.8] |
| low · after | 渲染提交CPU | 1.341 [1.323–1.431] | 1.2 [1.2–1.3] | 1.8 [1.6–1.9] | 6.1 [5.2–6.2] | 7.8 [7.8–9.7] |

高画质前后三次rAF P95中位数均3.2ms，但新版P95范围扩大到3.2–6.3ms；新版低画质某次P99达到24.9ms、最大28.2ms。同步CPU与绘制调用也并非全部下降。这些短时样本只展示本机当前条件下的观察，不支持普遍更流畅、净加速或低配保证。

## 全部单次rAF帧间隔

720p海岸高画质和720p城市高画质仅各测一次，不计算重复样本中位数。R1对应无run后缀文件，R2/R3对应文件名后缀。

| 场景·版本·轮次（原始JSON） | 均值 ms | P50 ms | P95 ms | P99 ms | 最大 ms |
| --- | --- | --- | --- | --- | --- |
| [coast · 1080p · high · before · R1](../output/visual-polish-20260908/before/perf-coast-high-1080.json) | 3.151 | 3.1 | 3.2 | 3.3 | 6.3 |
| [coast · 1080p · high · before · R2](../output/visual-polish-20260908/before/perf-coast-high-1080-run2.json) | 3.177 | 3.1 | 3.2 | 6.3 | 9.4 |
| [coast · 1080p · high · before · R3](../output/visual-polish-20260908/before/perf-coast-high-1080-run3.json) | 3.542 | 3.1 | 3.3 | 18.8 | 25 |
| [coast · 1080p · high · after · R1](../output/visual-polish-20260908/after/perf-coast-high-1080.json) | 3.16 | 3.1 | 3.2 | 6.1 | 6.3 |
| [coast · 1080p · high · after · R2](../output/visual-polish-20260908/after/perf-coast-high-1080-run2.json) | 3.194 | 3.1 | 3.2 | 6.3 | 9.4 |
| [coast · 1080p · high · after · R3](../output/visual-polish-20260908/after/perf-coast-high-1080-run3.json) | 3.594 | 3.1 | 6.3 | 21.9 | 22 |
| [coast · 1080p · low · before · R1](../output/visual-polish-20260908/before/perf-coast-low-1080.json) | 3.16 | 3.1 | 3.2 | 6.2 | 6.3 |
| [coast · 1080p · low · before · R2](../output/visual-polish-20260908/before/perf-coast-low-1080-run2.json) | 3.16 | 3.1 | 3.2 | 6.2 | 6.3 |
| [coast · 1080p · low · before · R3](../output/visual-polish-20260908/before/perf-coast-low-1080-run3.json) | 3.507 | 3.1 | 3.2 | 18.7 | 21.9 |
| [coast · 1080p · low · after · R1](../output/visual-polish-20260908/after/perf-coast-low-1080.json) | 3.846 | 3.1 | 6.2 | 24.9 | 28.2 |
| [coast · 1080p · low · after · R2](../output/visual-polish-20260908/after/perf-coast-low-1080-run2.json) | 3.177 | 3.1 | 3.2 | 6.3 | 6.3 |
| [coast · 1080p · low · after · R3](../output/visual-polish-20260908/after/perf-coast-low-1080-run3.json) | 3.16 | 3.1 | 3.2 | 6.2 | 6.3 |
| [coast · 720p · high · before · R1](../output/visual-polish-20260908/before/perf-coast-high-720.json) | 3.151 | 3.1 | 3.2 | 3.3 | 6.3 |
| [coast · 720p · high · after · R1](../output/visual-polish-20260908/after/perf-coast-high-720.json) | 3.151 | 3.1 | 3.2 | 3.3 | 6.3 |
| [city · 720p · high · before · R1](../output/visual-polish-20260908/before/perf-city-high-720.json) | 3.134 | 3.1 | 3.2 | 3.2 | 6.2 |
| [city · 720p · high · after · R1](../output/visual-polish-20260908/after/perf-city-high-720.json) | 3.169 | 3.1 | 3.2 | 3.3 | 9.3 |

## 全部单次同步CPU耗时

前五列为物理+渲染提交；后五列为渲染提交子区间，均为毫秒。

| 场景·版本·轮次 | 总均值 | 总P50 | 总P95 | 总P99 | 总最大 | 渲染均值 | 渲染P50 | 渲染P95 | 渲染P99 | 渲染最大 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [coast · 1080p · high · before · R1](../output/visual-polish-20260908/before/perf-coast-high-1080.json) | 1.723 | 1.6 | 2.1 | 5.5 | 8.6 | 1.537 | 1.4 | 2 | 5.3 | 8.4 |
| [coast · 1080p · high · before · R2](../output/visual-polish-20260908/before/perf-coast-high-1080-run2.json) | 1.874 | 1.7 | 2.7 | 7.9 | 9.1 | 1.674 | 1.5 | 2.3 | 7.7 | 8.8 |
| [coast · 1080p · high · before · R3](../output/visual-polish-20260908/before/perf-coast-high-1080-run3.json) | 1.934 | 1.7 | 2.7 | 8.1 | 26.7 | 1.759 | 1.5 | 2.4 | 7.8 | 26.5 |
| [coast · 1080p · high · after · R1](../output/visual-polish-20260908/after/perf-coast-high-1080.json) | 1.864 | 1.8 | 2.2 | 6.7 | 8.8 | 1.699 | 1.6 | 2 | 6.6 | 8.6 |
| [coast · 1080p · high · after · R2](../output/visual-polish-20260908/after/perf-coast-high-1080-run2.json) | 2.075 | 1.9 | 3.1 | 6.9 | 9.5 | 1.899 | 1.7 | 2.7 | 6.8 | 9.4 |
| [coast · 1080p · high · after · R3](../output/visual-polish-20260908/after/perf-coast-high-1080-run3.json) | 1.927 | 1.8 | 2.6 | 6.7 | 8.7 | 1.768 | 1.7 | 2.3 | 6.6 | 8.6 |
| [coast · 1080p · low · before · R1](../output/visual-polish-20260908/before/perf-coast-low-1080.json) | 1.353 | 1.2 | 1.8 | 6.2 | 7.8 | 1.181 | 1.1 | 1.5 | 6 | 7.6 |
| [coast · 1080p · low · before · R2](../output/visual-polish-20260908/before/perf-coast-low-1080-run2.json) | 1.379 | 1.2 | 2 | 5.3 | 8.1 | 1.196 | 1.1 | 1.8 | 5 | 8 |
| [coast · 1080p · low · before · R3](../output/visual-polish-20260908/before/perf-coast-low-1080-run3.json) | 1.445 | 1.4 | 1.9 | 5.7 | 8.4 | 1.278 | 1.2 | 1.6 | 5.5 | 8.3 |
| [coast · 1080p · low · after · R1](../output/visual-polish-20260908/after/perf-coast-low-1080.json) | 1.61 | 1.5 | 2.2 | 5.3 | 9.8 | 1.431 | 1.3 | 1.9 | 5.2 | 9.7 |
| [coast · 1080p · low · after · R2](../output/visual-polish-20260908/after/perf-coast-low-1080-run2.json) | 1.517 | 1.4 | 2.1 | 6.4 | 8 | 1.341 | 1.2 | 1.8 | 6.2 | 7.8 |
| [coast · 1080p · low · after · R3](../output/visual-polish-20260908/after/perf-coast-low-1080-run3.json) | 1.503 | 1.4 | 1.8 | 6.2 | 7.9 | 1.323 | 1.2 | 1.6 | 6.1 | 7.8 |
| [coast · 720p · high · before · R1](../output/visual-polish-20260908/before/perf-coast-high-720.json) | 1.898 | 1.8 | 2.6 | 5.7 | 8 | 1.665 | 1.5 | 2.4 | 5.5 | 7.8 |
| [coast · 720p · high · after · R1](../output/visual-polish-20260908/after/perf-coast-high-720.json) | 1.849 | 1.7 | 2.1 | 6 | 8.7 | 1.678 | 1.6 | 1.9 | 5.9 | 8.5 |
| [city · 720p · high · before · R1](../output/visual-polish-20260908/before/perf-city-high-720.json) | 1.635 | 1.6 | 2 | 2.6 | 6.5 | 1.481 | 1.4 | 1.8 | 2.4 | 6.3 |
| [city · 720p · high · after · R1](../output/visual-polish-20260908/after/perf-city-high-720.json) | 1.891 | 1.9 | 2.1 | 2.3 | 6.6 | 1.713 | 1.7 | 1.9 | 2.1 | 6.5 |

## 资源与绘制计数

下表为测量窗口内最小–最大值。1080p各场景的三轮资源范围相同，列出R1以免重复；720p单次独立保留。数值是整场景渲染器计数，不能据此声明GPU字节级无泄漏。

| 场景·版本 | Draw calls | 三角面/帧 | Geometries | Textures | Programs |
| --- | --- | --- | --- | --- | --- |
| [coast · 1080p · high · before · R1](../output/visual-polish-20260908/before/perf-coast-high-1080.json) | 393–524 | 3,060,412–3,673,326 | 226–275 | 43–69 | 28–29 |
| [coast · 1080p · high · after · R1](../output/visual-polish-20260908/after/perf-coast-high-1080.json) | 419–544 | 2,953,604–3,543,006 | 238–285 | 43–69 | 28–29 |
| [coast · 1080p · low · before · R1](../output/visual-polish-20260908/before/perf-coast-low-1080.json) | 182–298 | 1,697,970–2,292,136 | 163–271 | 41–67 | 20–21 |
| [coast · 1080p · low · after · R1](../output/visual-polish-20260908/after/perf-coast-low-1080.json) | 198–310 | 1,657,866–2,225,128 | 179–280 | 41–67 | 20–21 |
| [coast · 720p · high · before · R1](../output/visual-polish-20260908/before/perf-coast-high-720.json) | 393–524 | 3,060,412–3,673,326 | 226–275 | 43–69 | 28–29 |
| [coast · 720p · high · after · R1](../output/visual-polish-20260908/after/perf-coast-high-720.json) | 419–544 | 2,953,604–3,543,006 | 238–285 | 43–69 | 28–29 |
| [city · 720p · high · before · R1](../output/visual-polish-20260908/before/perf-city-high-720.json) | 450–527 | 916,528–1,007,500 | 324–454 | 10–16 | 15–16 |
| [city · 720p · high · after · R1](../output/visual-polish-20260908/after/perf-city-high-720.json) | 470–541 | 811,842–875,498 | 332–461 | 10–16 | 15–16 |

实际十局结果见 [ten-rounds.json](../output/visual-polish-20260908/after/ten-rounds.json)：十局各8/8完赛；每局结束均为280 geometries、58 textures、29 programs、8 carModels、126 sceneChildren。每局33.8秒模拟时间，每rAF最多120tick加速执行，仅验证资源计数和完整性，不参与帧率对比，也不证明长时间GPU字节级无泄漏。

## 实际修改与交付文件

仅列本视觉任务负责的改动，不把共享工作区其他任务的未提交文件算作本轮成果。

| 文件 | 用途 |
| --- | --- |
| client/main.ts、client/ui.ts | 真实状态HUD、结果/奖励表达、赛车展示入口、焦点/待处理及视觉接线 |
| client/brand.css、client/gameplay.css | 品牌变量、面板层级、HUD与结果布局、响应式控件 |
| client/visual-state.ts、client/locales/visual.ts、client/i18n.ts | 只读资源/奖励状态与六语言文案接入 |
| client/kart-model.ts、client/kart-batching.ts、client/kart-asset.ts | 制作几何、动态节点保留合批、GLB加载与独立实例 |
| client/kart-motion.ts、client/road-readability.ts、client/world.ts | 轮胎视觉、弯道标记、追尾相机、资产加载和销毁 |
| scripts/kart-assets/build.ts、scripts/kart-assets/save_blend.py | 可重建运行GLB和Blender编辑源 |
| art/kart/README.md、club-kart.blend、club-kart-source.glb；public/models/kart/club-kart.glb、manifest.json | 资产、来源、坐标约定与统计 |
| tests/visual-state.test.ts、kart-model.test.ts、kart-batching.test.ts、kart-asset.test.ts、kart-motion.test.ts、road-readability.test.ts、world-lifecycle.test.ts | 对应状态、节点、资产与资源生命周期回归 |
| docs/superpowers/plans/2026-09-08-visual-polish.md、本报告 | 范围、设计与证据交接 |
| output/visual-polish-20260908/lab.html、lab.ts、vite-lab.config.ts、review.html、baseline/、before/、after/ | 独立验证页、冻结代码、实测JSON与真实截图 |

World/main文件也包含同期其他任务的变化；最终差异归属应结合冻结基线与任务文件范围，不使用整个git diff总量声称本任务工作量。海岸重建、地图改线、音乐和特效归属其他任务。

## 启动与复现

在项目根目录（已有依赖时）运行正常游戏：

```powershell
npm run dev
```

默认客户端为 http://localhost:5173，服务器为2567；正常游戏使用当前共享逻辑。安装依赖遵循仓库README与锁文件。

独立证据页使用关闭HMR及文件监视的5175端口：

```powershell
npx vite --config output/visual-polish-20260908/vite-lab.config.ts
```

打开 http://127.0.0.1:5175/output/visual-polish-20260908/review.html 查看报告，或打开 http://127.0.0.1:5175/output/visual-polish-20260908/lab.html?version=before&track=coast&quality=high&size=1080 运行验证。version=after切换采样版本的 `verified/client/world.ts`；track支持coast/city/mountain/mountain-summit，quality支持high/low，size支持720/1080。保持页面可见和相同视口/缓冲；关闭源码监视后修改文件需要重启5175验证服务。正常游戏入口使用5173。

页面按钮提供静态八车起跑、模型前/侧/后、120+360帧基准、十局加速和录制；`record=1`可自动录制最多10秒。仅验证页暴露 `visualLab.ready / show / configure / benchmark / cycles / record / report / recording`。已保存 [10秒实际速度录屏](../output/visual-polish-20260908/after/race-wheel-motion-720.webm) 和 [录制元数据](../output/visual-polish-20260908/after/recording.json)：1280×720、8辆车、60Hz墙钟累积物理、10.067秒模拟时间、VP9约6.38MB。录屏没有加速播放，也不作为帧率测量。

## UI与最终回归

<!-- ROOT_UI_VALIDATION_START -->
已实际运行大厅→选赛道/圈数/人数→单人及八车道具赛→暂停→设置→返回暂停→DNF结算→大厅；车库前/侧/后按钮选中态与返回机位已核验。真实输入练习读到155 KM/H、45/100漂移能量和0/2库存。单机DNF结果为01:22.10，显示DNF而非第8名，并注明免费、不发代币；七名AI成绩与本人结果分开。

桌面检查1280×720、1920×1080、1920×823（约21:9）。车库和HUD/暂停的三尺寸边界、关键文字无横向溢出记录在 [ui-layout.json](../output/visual-polish-20260908/after/ui-layout.json)。大厅实机720p、宽屏，结算720p、宽屏均可操作；结算按钮固定，长内容在内部滚动。未把未逐页截图的组合声称全部验收。六种语言有单测，实机检查中文、英文；其余语言及RTL全流程未逐屏验证。项目没有触摸驾驶输入，不新增或宣称移动端可玩。

模型PNG为准确1280×720渲染缓冲导出；UI截图是浏览器原生捕获，720p视口捕获约1279×702，宽屏fullPage捕获被浏览器缩小。实际布局尺寸用DOM记录佐证，未将缩小截图冒称原生1920像素截图。早期发生裁切/拼接异常的截图已剔除。

| 检查 | 本次结果与证据 |
| --- | --- |
| `npm run build` | 通过，见build-final.log；主包仍有>800kB既有构建提示，当前全项目主JS约1.25MB，未在视觉任务中改公共构建架构 |
| 视觉、状态、资产、轮胎、生命周期、语言、输入/小地图14个测试文件 | 65/65通过，visual-tests-final.log |
| `node --import tsx --test --test-concurrency=3 tests/*.test.ts` | tests-delivery.log：392项，391通过，断线到期SDK用例等待初始化超时；reconnect-recheck.log隔离复测1/1通过、10.017赛事秒拒绝过期身份。未声称全量一次全绿 |
| `npm run smoke` | 两个真实SDK客户端完赛、分配并领取模拟奖励，约30.326秒；smoke.log |
| `npm run validate:network` | 4客户端0/80/150ms RTT、150ms下2%输入丢包及8客户端150ms/2%四组通过；十房间循环余额不变，network.log。均为本机网络模拟，不等于异地真人测试 |
| 十局渲染资源 | 十局各8/8完赛、计数恒定，after/ten-rounds.json |

集气/满槽待收/库存满/释放、暂停/复位/完赛与真实氮气缓冲窗口共8项纯状态测试覆盖；实机只直接复现了普通集气和一次DNF，不把单测当作每个动态状态的录像。奖励到账文本只由确认回执驱动；本机SDK结算已通过，UI待审/到账的所有异常路径未逐一录像。

只读代码复核：KartMotion不改Car，方向和物理输入一致；路牌只加入Scene且检查道路空隙；当前运行GLB不含纹理，几何/材质克隆独立；加载只一次，晚到释放及失败回退路径存在；新增World集成未修改原有尾焰、漂移痕迹、道具绘制和声音。此结论仅是限定源码复核，不替代动态验收。
<!-- ROOT_UI_VALIDATION_END -->

真实异地网络、隐藏标签页恢复、不同GPU/低配设备、长时GPU字节级泄漏、所有翻译下全部动态消息布局、真人驾驶满意度和商业美术品质仍不据本报告声称通过。特效的启停、竞速反馈与最终联合性能由对应任务验收；本报告不覆盖其他任务随后接入的实现。没有部署公网或修改模拟资金规则。
