# KART CLUB

0.3 浏览器3D赛车：主题赛道、星级生涯、竞速 / 道具 / 计时影子 / 自由练习、三档AI和免费2–8人联机。

## 启动

需要Node.js 24或更新版本：

```powershell
npm.cmd install --include=dev
npm.cmd run dev
```

打开 http://localhost:5173 。命令同时启动网页（5173）和赛事服务（2567），Ctrl+C停止两者。项目`.npmrc`明确安装开发依赖，避免本机全局`omit=dev`导致无法运行。生产模式先 `npm run build`，再 `npm start`，打开 http://localhost:2567 ，网页、API 和 WebSocket 共用同一个端口。

**在线游玩**：[kartclub.xyz](https://kartclub.xyz/)。网页部署于 Netlify，赛事服务部署于 Render；维护步骤见[部署与游玩说明](docs/multiplayer-deployment.md)。

## 游玩

- **自由比赛**：九条不同路线，竞速/道具/计时/练习，3/5/7名AI，三档难度，1–3圈，默认3圈。
- **竞速赛**：AI感知前车、选择超车侧并控制接近速度；专家会入弯漂移和使用赚取的氮气。
- **道具赛**：单道具槽，Space使用加速、护盾、追踪飞弹或地面陷阱。每车每圈每个道具带只能领取一次；命中后有恢复保护，连续攻击不会反复乘算速度。
- **计时挑战**：每圈记录轨迹及分段，刷新个人最佳时保存透明影子。影子不参与碰撞、拾取或比赛计圈。
- **自由练习**：无对手，可熟悉所有路线、窄道和障碍。
- **单人生涯**：三章九关，每关路线不同，道路从18米逐步收窄至11米；后期增加漂移、道具、时间和名次目标。一星解锁下一关，保存于本机浏览器。
- **五步教学**：从生涯或驾驶说明进入，依次完成转向、有效漂移、拉正小喷、氮气使用及合法一圈，可反复练习。
- **多人联机**：免费参与，2–8名实际玩家全部准备后开始。可复制邀请链接，好友打开后自动填入房间码；比赛结束可一起进入下一场房间。

方向键或WASD驾驶，Shift漂移，Ctrl氮气，Space道具，R复位，Esc菜单。单人菜单暂停，联机菜单不暂停。设置支持改键、独立音乐/音效、流畅画质和镜头动态强度。

集气槽0–100点，满槽转成一瓶氮气，库存最多2瓶；满库存时保留至多100点。氮气持续3秒，结束前150毫秒的新按键可缓存下一瓶。合格漂移拉正后有500毫秒小喷窗口，松开再按油门触发350毫秒小喷；与氮气同时触发时使用氮气倍率，不乘算叠加。

侧挤和追尾传递有界动量；擦墙保留切向运动，正面碰撞明显减速，障碍有扫掠检测。复位等待1.5秒，再回已合法到达的位置并提供1秒车车碰撞保护；能量和库存保留，加速及小喷资格清除，等待计入比赛时间。连续路段判定阻止邻近回程道路抢走投影。

联机房间等待最多10分钟；比赛硬上限按赛道规则计算，首位合法完赛后其余车手最多20秒，取更早截止。单机AI竞速/道具使用相同首完窗口，计时/教学/练习豁免首完窗口。断线保留原席位10秒，计时继续，超时记DNF。完赛按穿越时间排序，无法区分时并列，DNF无完赛名次。

同机多人请新建标签页输入网址，避免“复制标签页”复制车手身份。局域网其他设备可访问启动输出中的地址，开发模式只需浏览器能访问5173端口；公网好友直接访问游戏网址。

## 数据保存

身份和比赛记录保存在服务器的 `data/` 目录，数据库不提交 Git。测试使用独立临时数据库；不要让两个生产实例同时使用同一数据目录。生涯进度、驾驶设置和个人影子保存在本机浏览器。

## 替换资源与兼容性

编辑`public/content.json`后刷新：`palette`车手配色；`characterModel`/`sceneModel`指定`public/models/`内glTF/GLB；`modelScale`模型尺寸；`musicUrl`指定`public/audio/`内自有音乐，为空时播放原创程序化电子音乐；`ocean`/`grass`场景颜色。附带原创`/models/sample-driver.gltf`示例。路径以`/`开头，米制、Y向上、Z向前，角色挂点车身上方0.9米，建议高度1.3米。场景装饰模型不自动改变赛道碰撞。

实际路线在`shared/track.ts`及`shared/route-data.ts`，九关目标在`shared/gameplay.ts`的`CHALLENGES`。路线ID：`coast`、`coast-harbor`、`coast-breakwater`、`city`、`city-factory`、`city-nightshift`、`mountain`、`mountain-pass`、`mountain-summit`。旧`tide-coast-v1`保留回归。修改实际路线或规则后同时重启服务并刷新所有客户端，更新相应版本。

新成绩与影子按地图、规则、车辆性能和辅助类别隔离；旧本地记录不删除，旧生涯解锁继续有效，新规则星级/圈速单独记录。当前规则`pons-rules-0.3.0`、路线`routes-0.2.0`、驾驶配置`driving-v2`。

## 验证

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run smoke
npm.cmd run validate:network
$env:NETWORK_EXTENDED='1'
npm.cmd run validate:network
Remove-Item Env:NETWORK_EXTENDED
```

`validate:network`使用4/8个独立SDK，覆盖0/80/150毫秒RTT和2%应用消息丢失。扩展模式使用新海岸3圈，验证实际集气/氮气、5秒断线重连和最终资源一致。应用层模拟不等于真实互联网。

http://localhost:5173/bench.html 提供四条代表赛道八车基准，固定1920×1080缓冲、流畅档，输出帧耗时P95/P99。测试页保持前台，后台节流样本标记无效。另有连续十局八车完赛资源检查，采用加速物理模拟，仅用于清理与资源平台检查，不是实时FPS。开发模式`/?debug`可显示权威tick、序号、侧滑、资源与网络校正。

## 交接与范围

[项目审计](docs/kart-optimization/PROJECT_AUDIT.md)、[实施计划](docs/kart-optimization/IMPLEMENTATION_PLAN.md)、[调参记录](docs/kart-optimization/TUNING_LOG.md)、[验证与验收矩阵](docs/kart-optimization/VALIDATION_REPORT.md)。历史0.2实测在`docs/v02-verification.md`。

这是原创浏览器游戏，当前驾驶为附着道路的2.5D物理，无空中自由飞行。没有声称达到商业版跑跑卡丁车的全部玩法或美术规模。当前机器的基准和本机SDK验证仍需真实玩家手感测试、公网和多设备验证；团队赛事和新道具属于后续范围。

品牌Logo原图位于`public/brand/kart-club-logo.png`；`kart-club-logo.svg`使用新版原图的透明通道保留赛道和棋盘镂空。大厅、比赛HUD和加载页通过CSS遮罩直接使用`--lime`（#C0FA67），浏览器图标使用同色SVG。
