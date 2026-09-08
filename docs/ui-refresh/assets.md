# 本轮视觉资源来源

| 资源 | 来源及用途 |
| --- | --- |
| KART CLUB Logo | 用户提供的 Logo，保留既有透明裁切及网站强调色 `#C0FA67` |
| 车辆/车手外形 | 用户提供的海岸后视图和正面近景；实际网格位于 `client/kart-model.ts`，不是截图背景 |
| UI 构图 | 用户确认的 `output/ui-concepts-20260907/01-赛事大厅.png` 与 `02-比赛界面.png` |
| `public/textures/coast-asphalt.png` | 本轮由内置 ImageGen 生成，1254×1254；细颗粒暖灰沥青，不含车道线，作为重复铺设的表面颜色纹理 |
| `public/textures/coast-grass.png` | 本轮由内置 ImageGen 生成，1254×1254；橄榄绿色短草纹理，花卉由实时场景另行建模 |
| UI 图标 | 官方 `@phosphor-icons/core` 2.1.1 包，按包许可使用；入口 `client/icons.ts` |
| 场景几何 | `client/scenery.ts` 与 `client/world.ts` 的实时 Three.js 几何；道路遵循现有真实赛道数据 |

参考原图未改动。视觉对照页的 `reference-front.png`、`reference-rear.png` 是用户原图副本。纹理不能被描述为经过像素级无缝认证；实际场景中已进行重复铺设的视觉检查。

角色、场景和纹理仍可通过 `public/content.json` 中 `characterModel`、`sceneModel`、`roadTexture`、`grassTexture` 字段替换。碰撞和计圈继续使用原有赛道/物理定义，视觉资源不承担赛事权威逻辑。
