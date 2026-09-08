# Netlify 部署说明（最简）

当前仓库已新增：

- `netlify.toml`（静态构建配置）
- `.github/workflows/deploy-netlify.yml`（GitHub 推送自动部署）

## 一键部署前提（先做这 2 步）

1. 把本地代码提交到 GitHub 仓库（分支 `main`）。
2. 在 Netlify 建立站点并进入站点设置，获取：
   - `Site ID`
   - `Access token`（Personal access token，建议创建只读+部署权限）

## 配置 GitHub Secret（仓库设置）

在 GitHub 仓库：
`Settings -> Secrets and variables -> Actions`  
新增两项：

- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`

## 推送自动部署

把代码 push 到 `main` 后：

- GitHub Action 会自动执行 `npm ci --include=dev`
- 执行 `npm run build`
- 自动执行 `netlify deploy --prod --dir dist`

完成后可在 Actions 和 Netlify 的 Deploys 看部署结果。

## 已购域名接入

在 Netlify：

1. 进入站点 `Domain settings -> Domains`
2. 点击 `Add custom domain` 添加你的域名
3. 按 Netlify 提示更新 DNS：
   - `www` 用 CNAME 指向 `<your-site>.netlify.app`
   - 根域名用 Netlify 指定的 A/CNAME/ALIAS 记录（按你的 DNS 控制台支持选择）

## 当前项目说明

你现在这个仓库除了静态前端外，还有联机与 `/api` 逻辑，需要 Node 服务（端口 2567）处理比赛与账号；  
Netlify 只负责前端静态页。如果你要完整可玩版本，建议再给服务端加一个独立托管（如 Render / Railway / VPS），再在前端地址里把接口和 WS 目标改为你的服务端域名。
