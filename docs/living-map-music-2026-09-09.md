# KART CLUB 场景配乐重制 · Revision 8

用户于 2026-09-09 确认逐地图声音元素方案后执行。当前 19 张地图均已重新作曲，并接入独立环境声层。

每张地图都有新写的 A 段、B 段和过渡旋律，共 380 小节原创素材，编排成各自 48 小节、约 65–78 秒的循环。旋律、和声、主奏、节奏与环境声音按地图分别设计。速度为 148–178 BPM，通过鼓组、贝斯和段落变化保持竞速推进感。

| 地图 | 新配乐 | 配器方向与环境声音 |
| --- | --- | --- |
| Sunlit Coast | Where the Waves Run | 钢鼓、清音吉他；海浪、海风、海鸥 |
| Sunset Harbor | Tides at Sundown | 铜管放克；港湾水声、远处汽笛、缆绳、码头机械 |
| Golden Desert | Winds of the Dunes | 簧管色彩、手鼓；飞沙、细砂颗粒、砂岩风鸣 |
| Neon City | Neon Airwaves | 快速合成器、碎拍；城市背景、电流、通风、远处车辆 |
| Steel Factory | Steam and Steel | 工业摇滚；活塞、蒸汽、管道、机械 |
| Orbital Station | Breath of the Orbit | 空间感电子旋律；舱内通风、共鸣、能量脉冲、通信 |
| Giantwood Forest | Voices of the Redwoods | 长笛、弦乐、木质打击；实录鸟鸣、树叶、小动物叫声、林风 |
| Aurora Glacier | Snowlight Pursuit | 钢琴、钢片琴；寒风、飘雪质感、低沉冰鸣、冰洞回声 |
| Lava Mine | Heart of the Caldera | 铜管、弦乐、重鼓；岩浆翻滚、黏稠气泡、地鸣、蒸汽、碎石 |
| Orchard Run | Dawn in the Orchard | 马林巴、木吉他；晨鸟、果树叶、草丛、小动物 |
| Coastal Causeway | Beyond the Breakwater | 开阔吉他、铜管；海上强风、拍岸浪、浪花、海鸥 |
| City Switchbacks | Alleyway Echoes | 手风琴、单簧管摇摆；模糊集市人声、巷道回声、城市气氛 |
| Treetop Divide | Canopy on the Wind | 排箫、马林巴；树冠阵风、鸟鸣呼应、木材吱响、树叶 |
| Canyon Slalom | Sandstone Gale | 快速尼龙吉他、双簧管；峡谷风、沙擦岩石、碎砾、岩壁回声 |
| Frozen Lagoon | Under the Frozen Sky | 颤音琴、钢片琴、竖琴；冰面低风、飘雪、冰晶轻响、冰下共鸣 |
| Dockside Divide | Cargo Tide Chase | 铜管竞速主题；装卸机械、链条、滑轮、港湾水声 |
| Clockwork Works | The Clockwork Circuit | 马林巴、羽管键琴、拨弦电子；齿轮、棘轮、传送带、阀门 |
| Orbital Interchange | Magnetic Slipstream | 快速芯片音乐；磁力机械、能量交换、舱体共鸣、电子通信 |
| Mine Transit | Echoes on the Rails | 吉他、口琴与摇摆节奏；矿车轮、铁轨接缝、洞穴、碎石、机械 |

音乐与环境声为两份独立音频，全部加载成功后，在同一 AudioContext 时间启动，以同一采样精确循环点播放，并一起淡入淡出和停止。环境声采用固定编排的循环声景，目前不随赛车位置作三维定位。

音乐默认 45%、音效默认 65%。环境层原始平均电平约 -28 dBFS，旋律层约 -16 dBFS，混合目标约 -15.5 dBFS。两层同走音乐音量通道；倒计时、氮气、漂移和碰撞仍走原有反馈通道。完整混合与分层片段可在 `http://localhost:5173/output/music/review.html#compare` 对照试听。

## 交付文件

- `public/audio/music/`：19 张地图各两层、Ogg/AAC 两种格式，共 76 个正式文件；manifest 版本 8。
- `output/music/living-v8/`：完整混音、95 个试听片段、渲染事件记录、结构与 PCM 验证报告、浏览器实测报告。
- `output/music/before-living-v7/`：替换前音频备份，保留旧版对比。
- `scripts/music/living_scores.py`、`living_arrangements.py`：新旋律、和声与配器。
- `scripts/music/environment_audio.py`：各地图独立环境声设计与事件编排。
- `scripts/music/render_living.py`、`validate_living.py`、`publish_living.py`：渲染、验证与本地安装。

## 验证结果

- 作曲结构检查通过：19 首、380 小节；最大移调后重复小节比例 0.0714，最大音程节奏相似度 0.3804。这是结构诊断指标，不代表听感评分。
- 76 个压缩音频独立解码通过：44.1 kHz 双声道、无非有限数值、无硬削波、循环衔接与层间长度符合检查阈值；95 个 WAV 试听片段通过。
- 46 项音频回归测试通过，包括成对加载、共同开始时间、切换、失败回退、延迟加载、停止、资源释放及现有反馈音效。
- 浏览器逐张点击 19 张地图，均观测到正确 trackId、playing、stems=2、running 的 AudioContext 和非零音频输出。森林与熔岩纯环境声控件成功播放；浏览器错误日志为空，检查结束已停止播放。
- `npm run build` 最终通过，TypeScript 与 Vite 打包成功。Vite 仍提示既有大型分包体积警告。

以上验证覆盖音频文件、信号和播放行为，不替代玩家对旋律悦耳度、激情感和场景贴合度的主观试听。

## 素材来源

实录素材仅为鸟鸣、海浪与风声：isaiah658 的 Ambient Bird Sounds（CC0）、Barracuda1983 的 Birds forest（作者公有领域授权）、jasinski/qubodup 的 Beach Ocean Waves（CC0）、Ecrivain 的 Icy Heights 中 wind.ogg（CC0）。未使用该页面的第三方背景音乐。额外动物、海鸥、叶草沙雪、岩浆、冰鸣和机械等为原创设计／合成声音。

具体来源链接、许可证、原文件 SHA-256 已写入 `public/audio/music/CREDITS.txt` 与 `public/audio/music/environment-sources.json`。乐器音色沿用具有 MIT 许可的 FluidR3 GM。
