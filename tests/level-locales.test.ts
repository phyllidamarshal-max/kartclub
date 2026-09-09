import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, tr } from "../client/i18n.ts";
import { CATALOG } from "../client/locales/catalog.ts";
import { MAP_CATALOG } from "../client/locales/maps.ts";
import { LEVELS } from "../shared/levels.ts";

const worldInterface = [
  "九种世界 · 九种挑战",
  "每条赛道，都有自己的玩法。",
  "选择世界，开始下一段旅程",
  "主题地标",
  "驾驶要点",
  "加速带",
  "松沙减速",
  "冰面低抓地",
  "森林杯 · 木桥争锋",
  "冰川九曲 · 控车驾照",
  "矿山试炼 · 最终决赛",
  "星环空间站 · 道具争冠",
  "沙漠遗迹 · 连弯反击",
  "在最窄的矿道击败七名专家 AI，夺冠并使用 6 次道具。",
  "第一章 · 世界启程",
  "第二章 · 机械狂飙",
  "第三章 · 极境挑战",
  "当前路面",
  "普通路面",
  "{min}–{max} 米变宽赛道",
  "宽道超车 · 窄路控线",
  "技术近道",
  "前方收窄",
  "宽道超车区",
  "近道 · 精准控线",
  "渐变路宽，让每个弯都有选择",
  "宽阔路段争取超车，收窄路段提前调整走线。",
  "近道更短，但需要更精准的转向。",
];

test("all world metadata and interface phrases translate into all six languages", () => {
  const phrases = new Set([
    ...Object.values(LEVELS).flatMap(({ name, label, brief, landmark }) => [
      name,
      label,
      brief,
      landmark,
    ]),
    ...worldInterface,
  ]);
  for (const source of phrases) {
    assert.ok(
      CATALOG[source] ?? MAP_CATALOG[source],
      `missing world phrase: ${source}`,
    );
    for (const { code } of LANGUAGES) {
      const translated = tr(source, {}, code);
      assert.ok(translated.trim(), `${source}: empty ${code}`);
      if (code === "zh")
        assert.equal(translated, (MAP_CATALOG[source] ?? CATALOG[source]).zh);
      else
        assert.doesNotMatch(
          translated,
          /[\u3400-\u9fff]/u,
          `${source}: ${code}`,
        );
      assert.deepEqual(
        translated.match(/\{[^}]+\}/g) ?? [],
        source.match(/\{[^}]+\}/g) ?? [],
        `${source}: placeholders changed in ${code}`,
      );
    }
  }
});

test("variable track width translates templates and rendered values consistently", () => {
  const source = "{min}–{max} 米变宽赛道";
  for (const { code } of LANGUAGES) {
    const translated = tr(source, { min: 6.5, max: 14 }, code);
    assert.doesNotMatch(translated, /\{[^}]+\}/, code);
    if (code !== "zh")
      assert.doesNotMatch(translated, /[\u3400-\u9fff]/u, code);
    assert.match(translated, /6\.5/, code);
    assert.match(translated, /14/, code);
    assert.equal(tr("6.5–14 米变宽赛道", {}, code), translated, code);
  }
});

test("the mine finale retains the seven opponents and six item uses in every translation", () => {
  const source = "在最窄的矿道击败七名专家 AI，夺冠并使用 6 次道具。";
  for (const code of ["en", "fr", "hi", "es", "ar"] as const) {
    const translated = tr(source, {}, code);
    assert.match(translated, /7/, code);
    assert.match(translated, /6/, code);
  }
});
