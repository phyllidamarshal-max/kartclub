# 新增地图配乐 · revision 7

为十张新增地图制作独立原创配乐并接入游戏。现在全部 19 张可玩地图均对应自身 ID、音频 URL 和播放缓冲，不再通过 `baseId` 复用旧曲目。

| 地图 | 曲名 | 场景编曲 | 循环时长 |
|---|---|---|---|
| Orchard Run | Applewood Dash | 班卓琴、小提琴与原声节奏，果园蓝草风格 | 72.00 s |
| Coastal Causeway | Causeway Carnival | 马林巴、钢琴与交错手打击乐，海岸桑巴 | 74.81 s |
| City Switchbacks | Switchback Swing | 手风琴、单簧管与摇摆八分音符，城市电子摇摆 | 70.24 s |
| Treetop Divide | Canopy Crossroads | 五声音阶马林巴、排箫与木质打击乐，林冠碎拍 | 72.91 s |
| Canyon Slalom | Sandstone Flamenco | 快速尼龙吉他、拍手与奔跑节奏，沙岩峡谷拉力 | 69.40 s |
| Frozen Lagoon | Prismatic Current | 颤音琴、竖琴与晶莹长和弦，冰湖高速碎拍 | 66.98 s |
| Dockside Divide | Twin Pier Fanfare | 小号与手风琴呼应，6/8 航海进行曲 | 66.21 s |
| Clockwork Works | Cogwheel Carnival | 羽管键琴、拨奏弦乐与机械电子节奏 | 68.57 s |
| Orbital Interchange | Starlane Slingshot | 方波主题、跳跃音区与快速琶音，太空芯片音乐 | 64.72 s |
| Mine Transit | Ore Cart Express | 口琴、清音吉他与 12/8 火车摇摆节奏 | 68.57 s |

每首写有独立的 A、B、桥段各 8 小节，共新增 240 小节。不同曲式排列形成完整循环。矿车曲按 12/8 的附点四分音符标示 168 BPM；渲染与循环计算使用四分音符 252 BPM。

## 接入与试听

- 游戏通过 `client/music-catalog.ts` 和生成的 `client/music-score-data.ts` 选择全部 19 首配乐；音频版本号为 7。
- `public/audio/music/manifest.json` 记录地图、场景、风格、拍号、曲式和准确循环终点。
- 试听入口：`http://localhost:5173/output/music/review.html#new-maps`。新增地图单独置顶，提供完整曲目、高潮片段和统一钢琴/调性/四分音符速度的旋律比较。
- 新配乐使用现有 FluidR3 GM 授权音色和原创合成器。许可说明保留在 `public/audio/music/CREDITS.txt`。
- 原有 9 首曲目的 18 个压缩文件保持逐字节相同，核对结果在 `output/music/expansion-v7/preserved-v6.json`。

## 验证结果

- 作曲检查通过：19 首之间最大移调小节复用比例 0.0667，最大音程/时值序列相似度 0.2996；19 种独立低音和鼓组模式。这是乐谱结构指标，不代表主观听感评分。
- 独立解码全部 38 个 Ogg/AAC 文件：44.1 kHz 双声道、有限采样、循环帧数、编码填充、峰值余量、持续音量和首尾接缝均通过检查。总大小 52,683,816 字节；游戏按需加载，保留最多 3 首解码缓存。
- 十首新曲 Ogg 平均电平为 -15.51 至 -15.47 dBFS，峰值均低于 0.90。沿用音乐 45%、音效 65% 默认值；用户保存的设置优先。
- 43 项音频测试全部通过，覆盖各地图独立 ID/URL/缓冲、从原地图到新地图的切换、大厅切换、重复解锁、淡入淡出、缓存与现有音效。
- `npm run build` 通过；保留既有的大型代码分块提示。
- 在内置浏览器通过真实 `GameAudio` 逐首播放新增十曲，均显示 revision 7、自身地图 ID、playing 状态和非零输出信号。浏览器 AudioContext 为 48 kHz，已实际进行重采样播放；检查时无浏览器错误。随后停止了试听。

原始报告：`output/music/expansion-v7/composition-check.json`、`render-report.json`、`validation.json`、`browser-playback.json`。默认混音数字电平报告：`output/music/balance-levels.json`。音频信号检查不等于听觉评价，可用试听页判断风格与听感。

## 重建命令

```powershell
npx tsx scripts/music/export_expansion_maps.ts
python scripts/music/check_expansion_composition.py
python scripts/music/render_expansion.py
python scripts/music/validate.py --expansion
python scripts/music/publish_expansion.py
npx tsx scripts/audio/measure-mix.ts
```

`render_expansion.py --only <map-id>` 可单独重渲染。原有九曲无需重新合成；脚本从已验证的 `output/music/world-v6` 暂存副本复制，并在安装时核对原始校验值。revision-6 的发布脚本用于历史版本重建，不用于安装当前 19 图版本。
