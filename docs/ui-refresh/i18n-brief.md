# Independent task: six-language UI localization

User requires switchable English/French/Hindi/Spanish/Arabic/Chinese during the approved whole-game UI refresh. Main agent changes `client/main.ts`, CSS and World. You exclusively own `client/i18n.ts`, `client/locales/*`, `tests/i18n.test.ts`, and `docs/ui-refresh/i18n-report.md`. Do not edit any other source, do not use browser, do not commit shared changes.

## Public API (implement exactly)

```ts
export type Language = 'en'|'fr'|'hi'|'es'|'ar'|'zh';
export const LANGUAGES: readonly {code:Language; label:string; dir:'ltr'|'rtl'}[];
export function language(): Language;
export function setLanguage(code:string): void;
export function tr(source:string, values?:Record<string,string|number>, locale?:Language): string;
export function localize(root:HTMLElement): void;
```

`tr` uses current Chinese UI source phrases as keys, supports `{name}` named interpolation, and optionally exact dynamic sentence patterns (e.g. `'{n} 圈'`). No network translation. Locale defaults to Chinese for this existing product, safely reads/writes `kart-language` localStorage only when available, and sets documentElement.lang/dir. Invalid language values fall back safely. Functions must import safely in Node tests without window/document/storage.

`localize(root)` translates visible text nodes and display attributes (placeholder, aria-label, title) with the catalog, without destroying elements/events. Preserve original text so switching from one translated language to another works on the same nodes. If a HUD node is changed externally to new Chinese text, detect and use that as the new source. Skip script/style, user input values and descendants of `[data-no-i18n]`. Whitespace is retained. Avoid arbitrary substring replacement that corrupts names or produces grammatically broken fragments. Main code will use `tr` explicitly for complex dynamic text; catalog/pattern support should cover existing HTML fragments as well. No injection through interpolated variables into HTML: translations are strings; localize uses textContent.

## Coverage

Read current `client/main.ts`, `client/training.ts`, `client/career-history.ts`, `client/network.ts`, `shared/gameplay.ts`, `shared/track.ts`, `shared/route-data.ts`, `shared/items.ts`, and server errors displayed through toast. Catalog all player-facing existing strings, chapter/track/challenge names and descriptions, item feedback, settings/help, race/room/connection states, results and simulated-economy explanations in six languages. Preserve KART CLUB, PONS, TICKET, user nicknames, IDs and numbers. Proper complete sentences in French, Hindi, Spanish, Arabic, English. Do not merely translate navigation.

Also include these NEW UI phrases/patterns: 赛事大厅; 选择玩法，即刻开跑; 开始比赛; 与好友竞速; 调整赛事; 单人模式免费; 当前赛道; 语言; 模拟余额; 排名; 比赛时间; 圈数; 氮气; 漂移集气; 第一章 · 海岸启程; 第二章 · 城市竞逐; 第三章 · 山巅试炼; 已完成; 未解锁; 选择赛道; 赛事设置; 继续驾驶; 返回大厅; 比赛成绩; 个人表现; 最佳单圈; 准备出发; 当前目标; 暂停; 设置; '{n} 圈'; '{n} 名 AI'; '{n} / {total} 已完成'; '{n} 米路宽'; '{n} km'; '漂移集气 {n} / 100'; '氮气 {n} / 2'; '圈数 {n} / {total}'; '教学 {n} / 5'; '正在复位 {n} 秒 · 计时继续'; '碰撞 {collisions} 次 · 氮气 {nitro} 次 · 小喷 {mini} 次'; '累计集气 {drift} / {target}'; '道具 {uses} / {target}'; '最佳 {time}'; '金星参考 {time} 秒'; '差值 {delta} 秒'; '{time} 秒'; '练习中'; '等待冲线'; '海岸'; '城市'; '山地'; '流畅'; '高画质'; '玩法'; 'AI 难度'; '比赛圈数'; 'AI 对手'; '查看赛道'; '重连中'; '免费比赛'; '模拟奖金场'.

Prefer a maintainable catalog with one complete entry per source shared across all languages and test parity; no duplicated massive code branches. Export extra test helpers if needed, but keep the public interface above stable. Tests should prove six-locale coverage, interpolation, Arabic RTL metadata, invalid locale handling, runtime-safe imports and switching; DOM tests only if available without adding dependencies. Report catalog gaps explicitly. Do not add a translation SaaS or change server/shared logic.

Write report `docs/ui-refresh/i18n-report.md` including files, APIs, coverage, command/results and integration notes. Return DONE/DONE_WITH_CONCERNS with compact results. Main agent will integrate and visually verify.
