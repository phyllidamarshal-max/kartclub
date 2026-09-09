# 好友公网联机部署

2026-09-09：已实现可部署版本。尚未创建托管账户、购买服务器或发布公网地址。当前的多人测试运行于本机实际 HTTP / WebSocket 服务；真实公网延迟和跨设备体验仍需部署后验收。

## kartclub.xyz 的部署步骤

2026-09-09 实测：`https://kartclub.xyz` 目前由 Netlify 返回网页；同站的 `/api/health` 返回的是 HTML 网页，不是联机服务的健康检查 JSON。建议保留这个游戏入口，用 Render 承载赛事服务。玩家仍通过 `https://kartclub.xyz` 创建房间、分享邀请链接，首次部署不需要修改现有域名解析。

### 1. 先把部署版本上传到 GitHub

仓库地址：<https://github.com/phyllidamarshal-max/kartclub>。检查时本地位于 `codex/pons-kart` 分支，新增的 `render.yaml`、`Dockerfile` 和部分联机代码尚未提交。必须先整理、提交并推送完整可构建版本；只上传部署配置不够。仓库还有其他游戏功能和素材的改动，整理时不要遗漏代码实际引用的文件。

本仓库的 Netlify 发布工作流仅在 `main` 推送时触发。因此下面以部署版本已合入并推送到 `main` 为前提；前后端都选择包含同一套游戏规则、地图和联机代码的提交。

### 2. 在 Render 创建联机服务器

打开 <https://dashboard.render.com>，登录并连接 GitHub。选择 **New → Blueprint**，连接上面的 `kartclub` 仓库，选择已更新的 `main` 分支，Blueprint Path 使用根目录的 `render.yaml`。操作入口参考 [Render Blueprint 文档](https://render.com/docs/infrastructure-as-code)。

仓库的 Blueprint 配置会创建一个 Docker Web Service、一个实例和挂载在 `/app/data` 的 1 GB 持久化盘，健康检查路径为 `/api/health`。按当前官方命名，入门付费计算规格是 `0.5c-512mb`，配置已同步使用该标识；参考 [Blueprint 配置规范](https://render.com/docs/blueprint-spec)。

创建时填写环境变量 `ALLOWED_ORIGINS`，值为下面这一整行（英文逗号分隔，不加引号或末尾斜杠）：

```text
https://kartclub.xyz,https://www.kartclub.xyz,https://kartclubgame.netlify.app
```

`NODE_ENV=production`、`PONS_DATA_DIR=/app/data` 已由配置提供；端口使用平台给出的 `PORT`，无需手动填构建或启动命令。

核对资源清单和账单后点击 **Deploy Blueprint**。当前计算实例标价 $7/月，1 GB 磁盘 $0.25/月，二者基础费用合计约 $7.25/月；不含可能的流量超额、税费或其他付费项目，以创建页面的费用为准。参考 [Render 价格](https://render.com/pricing)。本说明没有执行购买或创建服务。

### 3. 确认服务器可访问

等待服务显示 **Live**，复制 Render 分配的完整 HTTPS 地址。下文的“服务器地址”均指此实际地址，不能照抄示例占位内容，也不需要附加端口。

在这个地址后加 `/api/health` 并打开，应显示包含 `"ok":true` 的 JSON。这里检查的是 **Render 服务器地址**；保留 Netlify 的分离部署下，`kartclub.xyz/api/health` 仍可能返回网页，不用拿它判断后端是否启动。

### 4. 让 kartclub.xyz 使用新服务器

本仓库已配置 GitHub Actions 构建并发布到 Netlify。在 GitHub 仓库进入 **Settings → Secrets and variables → Actions → Variables → New repository variable**：

| Name | Value |
| --- | --- |
| `VITE_GAME_SERVER_URL` | 刚才复制的完整 HTTPS 服务器地址 |

值只填写服务器根地址，不加 `/api`、`/api/health` 或房间路径。这是公开地址，放在 **Variables**。现有工作流另需已配置的 `NETLIFY_AUTH_TOKEN`、`NETLIFY_SITE_ID` 两项 Secrets；缺失时工作流会明确报错，凭据应自行填入 GitHub，不能放进代码或聊天。

保存变量不会自动发布网页。在 **Actions → Deploy to Netlify** 中打开包含最新部署代码的 `main` 运行记录，选择 **Re-run all jobs**，等待成功。也可以在设置变量后再将部署版本推送到 `main`，由推送触发工作流。

如果实际使用 Netlify 自己拉取仓库并构建，则还需在 Netlify 项目环境变量中设置相同的 `VITE_GAME_SERVER_URL`，让它对生产构建生效，再触发一次重新构建部署。仅在 Netlify 设置变量不会改变 GitHub Actions 已构建并上传的网页文件。参考 [Netlify 构建环境变量](https://docs.netlify.com/build/configure-builds/environment-variables/)。

### 5. 用不同网络验收

电脑打开 `https://kartclub.xyz` 并强制刷新，进入「多人联机」创建普通免费房；手机关闭 Wi-Fi、使用移动网络打开邀请链接。两端分别填写名字、加入并准备，完成一场比赛及「和好友再来一局」。这一步通过后，才能确认实际跨网络联机可用。

若不能连接：先检查 Render 的健康检查 JSON；再检查前端是否已重新构建、变量地址是否正确；遇到 403 时检查 `ALLOWED_ORIGINS` 是否包含浏览器实际访问的完整 origin。前后端版本不一致时，部署同一提交并刷新网页。

当前配置关闭了服务的代码自动部署。后续更新在无比赛时手动发布后端，再发布对应版本的前端；服务器重启会结束仍在内存中的房间。

## 部署后怎么玩

1. 所有玩家打开同一个 HTTPS 游戏网址，进入「多人联机」。
2. 房主填写车手名，选择赛道、竞速/道具、圈数，创建普通免费房。
3. 点击「复制邀请链接」发给好友。好友打开链接，房间码会自动填入，填写自己的名字后加入；也可粘贴链接或 8 位房间码。
4. 2–8 人全部准备后自动倒计时。普通房最多等待 10 分钟。模拟门票房保持 2–4 人、30 秒准备及原有退票规则。
5. 比赛中短暂断线保留席位 10 秒，恢复后继续原来的比赛；比赛计时不会暂停。超时退出记 DNF。
6. 成绩页点击「和好友再来一局」，选择继续的玩家会进入同一个新房间，再次准备。每场使用独立赛事编号，上一场结果与模拟账本保留。

同一电脑测试时新建标签页并输入邀请链接；不要通过浏览器的「复制标签页」复制模拟身份。邀请链接只包含房间码，不包含身份令牌。

## 方案 A：一个服务同时承载网页和联机（推荐）

网页、API 和 WebSocket 共用一个公网 HTTPS 域名，不需要填写 `VITE_GAME_SERVER_URL`。Node 服务会提供 `dist` 目录。需要 Node.js 24+、一个持续运行的进程和可持久化目录。

本机验证生产模式：

```powershell
npm.cmd ci --include=dev
npm.cmd run build
npm.cmd start
```

打开 `http://localhost:2567`。`npm start` 会设置生产模式；必须先完成构建。开发模式仍用 `npm run dev` 打开 5173，API 和 WebSocket 都从网页端口代理，不再要求浏览器直连 2567。

### Render

仓库提供 `render.yaml` 和 `Dockerfile`。在 Render 新建 Blueprint，选择**包含这次修改的分支/提交**，查看资源清单后再创建。文件声明了一个 `0.5c-512mb` 付费服务和 1 GB 持久化磁盘，会产生平台费用，本次没有替你创建。

- 服务类型：Docker Web Service，实例数 **1**。
- 健康检查：`/api/health`。
- 持久化磁盘：`/app/data`；环境变量 `PONS_DATA_DIR=/app/data`。
- `PORT` 由平台提供，服务监听 `0.0.0.0`。
- `ALLOWED_ORIGINS` 可先留空；取得地址后填写完整网页 origin，例如 `https://kart-club-xxxx.onrender.com`。如果还保留 Netlify 网页，逗号分隔填写两个 origin。
- 首次部署后，打开平台给出的 HTTPS 地址，并确认「赛事服务已连接」。
- 已关闭自动部署，避免每次代码推送中断进行中的比赛。更新后在无比赛时手动部署。

Render 支持公网 WebSocket；实例更换或部署仍会关闭现有连接。SQLite 必须位于持久化盘，平台默认临时文件系统不能保存重启后的身份和账本。参考：[WebSocket 文档](https://render.com/docs/websocket)、[持久化磁盘文档](https://render.com/docs/disks)。

### 自有服务器 / Docker

```sh
docker build -t kart-club .
docker run -d --name kart-club --restart unless-stopped \
  -p 127.0.0.1:2567:2567 \
  -v kart-data:/app/data \
  -e ALLOWED_ORIGINS=https://race.example.com \
  kart-club
```

将 `race.example.com` 的 DNS 指向服务器，在 HTTPS 反向代理中转发所有请求到 `127.0.0.1:2567`，包括 WebSocket Upgrade。例如已安装 Caddy 的服务器可使用：

```caddyfile
race.example.com {
  reverse_proxy 127.0.0.1:2567
}
```

将示例域名替换为自己的域名。当前 Dockerfile 使用非 root 用户；命名卷自动初始化权限。若改为宿主机目录挂载，需要让容器中的 `node` 用户可写。当前机器 Docker 引擎未运行，镜像构建未在本次本机验收中执行；生产 Node 启动与同端口 HTTP/WS 已单独验证。

## 方案 B：保留 Netlify 网页

仍须先按方案 A 部署常驻赛事服务。Netlify 静态站点本身不运行此项目的 Node/Colyseus 进程。

1. 确认后端 `https://你的赛事域名/api/health` 返回 JSON 和 `ok: true`。
2. 在 Netlify 构建环境设置 `VITE_GAME_SERVER_URL=https://你的赛事域名`，**重新构建发布**网页。这是公开服务地址，不是密钥；不要填房间码、`/api` 路径或 WebSocket 房间路径。
3. 如果使用本仓库的 GitHub Actions 发布，在仓库 Settings → Secrets and variables → Actions → **Variables** 添加同名 `VITE_GAME_SERVER_URL`，工作流已将它传入构建步骤。
4. 后端设置 `ALLOWED_ORIGINS=https://你的站点.netlify.app,https://你的赛事域名`。自定义域名和预览域名必须分别列出；不支持通配符。配置变更需要重启服务。
5. 使用 HTTPS 后端。HTTPS 网页连接 HTTP 后端会被拒绝，并在游戏中提示配置错误。

前端账户请求、匹配请求和比赛 WebSocket 使用同一后端地址；身份令牌按服务地址存储，切换服务器不会把旧令牌发送给新服务器。未配置后端时，静态站点回退 HTML 会被识别为「赛事服务尚未配置」，单人模式仍可使用。

## 更新与运维

- 运行一个服务器进程/实例。房间保存在内存，SQLite 数据保存在磁盘；不要直接增加副本或多个进程共享当前数据目录。多实例需要额外的共享匹配/房间路由设计，见 [Colyseus 部署说明](https://docs.colyseus.io/deployment)。
- 定期备份持久化目录中的三个 SQLite 数据库。停服后完整备份目录，避免遗漏 WAL 文件。
- 前后端使用同一提交构建，版本不匹配会拒绝加入。更新规则、地图后应同时更新两端并刷新网页。
- 服务重启不恢复进行中的房间；现有恢复机制会取消未结算的模拟门票比赛并退款。玩家需重新创建房间。
- `ALLOWED_ORIGINS` 限制浏览器跨域访问，不是用户登录机制。当前是公开试玩的模拟身份系统；上线大量流量前应在入口增加请求限流和监控。
- 所有 TICKET/PONS 为模拟数据，未加入真实钱包或支付。

## 验收

```powershell
npm.cmd run validate:multiplayer
node --import tsx --test tests/network.test.ts tests/reconnect-expiry.test.ts tests/room-*.test.ts
npm.cmd test
npm.cmd run build
npm.cmd start
```

本次实际测试范围与结果见 [联机验收记录](multiplayer-verification-2026-09-09.md)。

部署后用两个不同网络的设备打开同一 HTTPS 邀请链接，完成加入、准备、驾驶、断线恢复和再来一局；观察浏览器中的 API/匹配请求是否成功、WebSocket 是否为 `wss`。本机多客户端测试不替代这一步。
