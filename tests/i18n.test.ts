import { test } from "node:test";
import assert from "node:assert/strict";

test("specific dynamic sentences take precedence over generic count suffixes", () => {
  const value = tr("经典挑战历史 · 1 / 3 已完成", {}, "en");
  assert.doesNotMatch(value, /[\u4e00-\u9fff]/);
  assert.match(value, /1 \/ 3/);
});

import {
  LANGUAGES,
  language,
  localize,
  setLanguage,
  tr,
} from "../client/i18n.ts";
import { CATALOG, SOURCE_KEYS } from "../client/locales/catalog.ts";
import { STRUCTURAL_CATALOG } from "../client/locales/brand.ts";
import { MAP_CATALOG } from "../client/locales/maps.ts";
import { Training } from "../client/training.ts";
import {
  CHALLENGES,
  DIFFICULTY_NAMES,
  MODE_NAMES,
} from "../shared/gameplay.ts";
import { ITEM_NAMES } from "../shared/items.ts";
import { EXTRA_ROUTES } from "../shared/route-data.ts";
import { TRACKS } from "../shared/track.ts";

const REQUIRED_NEW_PHRASES = [
  "集气中断",
  "气槽已满 · 结束漂移收气",
  "碰撞损失 {loss} 点集气",
  "集满100点后结束漂移，收成一瓶氮气，最多存2瓶。保持速度和有效侧滑可更快集气；贴墙和低速无法刷气。",
  "仅漂移或尚未拉正的漂移余滑中碰撞，才按力度扣除当前气槽12–60点并短暂中断集气。普通行驶碰撞不扣气，已存氮气保留。",
  "赛事大厅",
  "选择玩法，即刻开跑",
  "开始比赛",
  "与好友竞速",
  "调整赛事",
  "单人模式免费",
  "当前赛道",
  "语言",
  "模拟余额",
  "排名",
  "比赛时间",
  "圈数",
  "氮气",
  "漂移集气",
  "第一章 · 海岸启程",
  "第二章 · 城市竞逐",
  "第三章 · 山巅试炼",
  "已完成",
  "未解锁",
  "选择赛道",
  "赛事设置",
  "继续驾驶",
  "返回大厅",
  "比赛成绩",
  "个人表现",
  "最佳单圈",
  "准备出发",
  "当前目标",
  "暂停",
  "设置",
  "{n} 圈",
  "{n} 名 AI",
  "{n} / {total} 已完成",
  "{n} 米路宽",
  "{n} km",
  "漂移集气 {n} / 100",
  "氮气 {n} / 2",
  "圈数 {n} / {total}",
  "教学 {n} / 5",
  "正在复位 {n} 秒 · 计时继续",
  "碰撞 {collisions} 次 · 氮气 {nitro} 次 · 小喷 {mini} 次",
  "累计集气 {drift} / {target}",
  "道具 {uses} / {target}",
  "最佳 {time}",
  "金星参考 {time} 秒",
  "差值 {delta} 秒",
  "{time} 秒",
  "练习中",
  "等待冲线",
  "海岸",
  "城市",
  "山地",
  "流畅",
  "高画质",
  "玩法",
  "AI 难度",
  "比赛圈数",
  "AI 对手",
  "查看赛道",
  "重连中",
  "免费比赛",
  "模拟奖金场",
] as const;

function placeholders(value: string) {
  return [...value.matchAll(/\{([a-z][a-z0-9]*)\}/gi)]
    .map((match) => match[1])
    .sort();
}

test("language metadata exposes the six supported locales and Arabic direction", () => {
  assert.deepEqual(
    LANGUAGES.map(({ code, dir }) => [code, dir]),
    [
      ["en", "ltr"],
      ["fr", "ltr"],
      ["hi", "ltr"],
      ["es", "ltr"],
      ["ar", "rtl"],
      ["zh", "ltr"],
    ],
  );
  assert.deepEqual(
    LANGUAGES.map(({ label }) => label),
    ["English", "French", "Hindi", "Spanish", "Arabic", "Chinese"],
  );
});

test("English system copy removes the legacy brand and describes test points honestly", () => {
  assert.doesNotMatch(
    SOURCE_KEYS.map((source) => CATALOG[source].en).join("\n"),
    /\$?PONS\b/i,
  );
  const visibleEnglish = SOURCE_KEYS.map((source) =>
    tr(source, undefined, "en"),
  );
  assert.doesNotMatch(visibleEnglish.join("\n"), /\$?PONS\b/i);
  assert.equal(
    tr("奖金 100 PONS", undefined, "en"),
    "100 simulated reward points",
  );
  assert.equal(
    tr("模拟 5,000 PONS 应税交易额，奖池增加 100 PONS", undefined, "en"),
    "Recorded 5,000 test-ledger points; the simulated reward pool gained 100 points",
  );
  assert.equal(tr("100 $PONS", undefined, "en"), "100 points");
  assert.equal(tr("PONS", undefined, "en"), "points");
});

test("tr reverse-maps branded English UI copy for language switching", () => {
  assert.equal(tr("Race lobby", undefined, "fr"), "Hall des courses");
  assert.equal(
    tr("Prize 100 PONS", undefined, "en"),
    "100 simulated reward points",
  );
  assert.equal(tr("Prize 100 PONS", undefined, "es"), "Premio 100 points");
});

test("core English shell, setup, settings, and HUD labels switch languages", () => {
  const labels = [
    "Lobby",
    "Career",
    "Rewards",
    "RACE LOBBY",
    "Your next lap starts here.",
    "RACE MODE",
    "CURRENT TRACK",
    "CHOOSE YOUR TRACK",
    "Track selection",
    "Race options",
    "AI opponents",
    "DONE",
    "SETTINGS",
    "Audio",
    "Sound effects",
    "Graphics",
    "Render quality",
    "Camera motion",
    "Controls",
    "Select a key to rebind",
    "Display language",
    "Changes saved automatically",
    "RACE TIME",
    "POSITION",
    "TRACK MAP",
    "Nitro charge",
    "Reset to checkpoint",
  ];
  for (const label of labels) {
    assert.ok(tr(label, undefined, "fr").trim(), label);
    assert.notEqual(tr(label, undefined, "zh"), label, label);
  }
  assert.equal(tr("KART CLUB", undefined, "fr"), "KART CLUB");
  for (const [source, entry] of Object.entries(STRUCTURAL_CATALOG)) {
    assert.deepEqual(Object.keys(entry).sort(), [
      "ar",
      "en",
      "es",
      "fr",
      "hi",
      "zh",
    ]);
    for (const locale of LANGUAGES.map(({ code }) => code)) {
      assert.ok(entry[locale].trim(), `${source}: empty ${locale}`);
      assert.deepEqual(placeholders(entry[locale]), placeholders(source));
    }
  }
});

test("new race reports, practice copy, challenge events, and AI names render in English", () => {
  const sources = [
    "弯道猎手",
    "直线先锋",
    "稳健领航",
    "夜行快客",
    "山路游侠",
    "极限追风",
    "终点守望",
    "驾驶复盘",
    "干净漂移",
    "连续衔接",
    "错过小喷",
    "有效攻击",
    "先减速入弯，减少碰撞",
    "拉正后及时松按油门，抓住小喷窗口",
    "减少过度转向，完成漂移后拉正",
    "出弯后使用已储存的氮气",
    "保持干净走线，挑战更快的分段成绩",
    "弯道训练",
    "选择弯道",
    "计时门超时 · 挑战结束",
  ];
  for (const source of sources) {
    const english = tr(source, undefined, "en");
    assert.doesNotMatch(english, /[\u3400-\u9fff]/u, source);
    for (const locale of LANGUAGES.map(({ code }) => code))
      assert.ok(
        tr(source, undefined, locale).trim(),
        `${source}: empty ${locale}`,
      );
  }
});

test("brand cleanup preserves placeholders and never translates user names", () => {
  assert.deepEqual(
    placeholders(
      tr(
        "{name} 获得 {amount} PONS",
        { name: "{name}", amount: "{amount}" },
        "en",
      ),
    ),
    ["amount", "name"],
  );
  assert.equal(
    tr("{name} 已准备", { name: "Race lobby PONS" }, "fr"),
    "Race lobby PONS est prêt",
  );
});

test("every catalog source has a complete six-locale entry with matching placeholders", () => {
  assert.ok(
    SOURCE_KEYS.length >= 150,
    `catalog only has ${SOURCE_KEYS.length} keys`,
  );
  for (const source of REQUIRED_NEW_PHRASES)
    assert.ok(source in CATALOG, source);

  for (const source of SOURCE_KEYS) {
    const entry = CATALOG[source];
    assert.deepEqual(Object.keys(entry).sort(), [
      "ar",
      "en",
      "es",
      "fr",
      "hi",
      "zh",
    ]);
    if (/[\u3400-\u9fff]/u.test(source))
      assert.equal(
        entry.zh,
        source,
        `${source}: Chinese must remain the source phrase`,
      );
    for (const locale of LANGUAGES.map(({ code }) => code)) {
      assert.ok(entry[locale].trim(), `${source}: empty ${locale}`);
      assert.deepEqual(
        placeholders(entry[locale]),
        placeholders(source),
        `${source}: placeholder mismatch in ${locale}`,
      );
    }
  }
});

test("all exported tracks, challenges, modes, difficulties, items, and training hints are localized", () => {
  const playerContent = [
    ...TRACKS.map(({ name }) => name),
    ...EXTRA_ROUTES.map(({ name }) => name),
    ...CHALLENGES.flatMap(({ title, description }) => [title, description]),
    ...Object.values(MODE_NAMES),
    ...Object.values(DIFFICULTY_NAMES),
    ...Object.values(ITEM_NAMES),
    ...new Training().hints,
  ];
  for (const source of playerContent) {
    assert.ok(
      CATALOG[source] ?? MAP_CATALOG[source],
      `missing player content: ${source}`,
    );
    for (const locale of ["en", "fr", "hi", "es", "ar"] as const)
      if (!(locale === "en" && MAP_CATALOG[source]))
        assert.notEqual(
          tr(source, undefined, locale),
          source,
          `${source}: untranslated ${locale}`,
        );
  }
});

test("tr translates exact phrases, interpolates names safely, and matches dynamic source patterns", () => {
  assert.equal(tr("赛事大厅", undefined, "en"), "Race lobby");
  assert.equal(tr("赛事大厅", undefined, "fr"), "Hall des courses");
  assert.equal(tr("赛事大厅", undefined, "hi"), "रेस लॉबी");
  assert.equal(tr("赛事大厅", undefined, "es"), "Sala de carreras");
  assert.equal(tr("赛事大厅", undefined, "ar"), "ردهة السباقات");
  assert.equal(tr("赛事大厅", undefined, "zh"), "赛事大厅");
  assert.equal(
    tr("{name} 已准备", { name: "A<kart>" }, "en"),
    "A<kart> is ready",
  );
  assert.equal(
    tr("圈数 {n} / {total}", { n: 2, total: 3 }, "fr"),
    "Tours 2 / 3",
  );
  assert.equal(tr("4 圈", undefined, "en"), "4 laps");
  assert.equal(tr("{n} 圈", { n: 1 }, "en"), "1 lap");
  assert.equal(tr("{n} 圈", { n: 1 }, "fr"), "1 tour");
  assert.equal(tr("1 圈", undefined, "es"), "1 vuelta");
  assert.equal(tr("{width} 米路宽", { width: 18 }, "fr"), "18 m de large");
  assert.equal(tr("浪潮 · MK I", undefined, "es"), "MAREA · MK I");
  assert.equal(tr("获得 能量护盾", undefined, "en"), "Picked up Energy shield");
  assert.equal(
    tr("3 圈 · 晴湾环海 · 竞速赛", undefined, "en"),
    "3 laps · Sunny Bay Circuit · Race",
  );
  assert.equal(tr("未知 {value}", { value: 7 }, "en"), "未知 7");
});

test("tr localizes English economy errors while preserving account identifiers", () => {
  assert.equal(tr("unknown account", undefined, "zh"), "未知账户");
  assert.equal(
    tr("insufficient tickets: acct-42", undefined, "fr"),
    "Billets insuffisants : acct-42",
  );
});

test("tr localizes driving controls and English HUD states", () => {
  assert.equal(tr("重置", undefined, "hi"), "रीसेट");
  assert.equal(tr("SOLO RUN", undefined, "ar"), "سباق فردي");
  assert.equal(tr("LIVE RACE", undefined, "fr"), "COURSE EN DIRECT");
  assert.equal(tr("MINI BOOST!", undefined, "es"), "¡MINITURBO!");
});

test("setLanguage persists valid choices, updates document metadata, and safely falls back from invalid values", () => {
  const writes: [string, string][] = [];
  const root = { lang: "", dir: "" };
  const priorStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: (key: string, value: string) => writes.push([key, value]),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: root },
  });
  try {
    setLanguage("ar");
    assert.equal(language(), "ar");
    assert.deepEqual(root, { lang: "ar", dir: "rtl" });
    assert.deepEqual(writes.at(-1), ["kart-language", "ar"]);

    setLanguage("not-a-locale");
    assert.equal(language(), "en");
    assert.deepEqual(root, { lang: "en", dir: "ltr" });
    assert.deepEqual(writes.at(-1), ["kart-language", "en"]);
  } finally {
    priorStorage
      ? Object.defineProperty(globalThis, "localStorage", priorStorage)
      : Reflect.deleteProperty(globalThis, "localStorage");
    priorDocument
      ? Object.defineProperty(globalThis, "document", priorDocument)
      : Reflect.deleteProperty(globalThis, "document");
    setLanguage("zh");
  }
});

type FakeNode = {
  nodeType: number;
  textContent: string | null;
  childNodes: FakeNode[];
  tagName?: string;
  hasAttribute?: (name: string) => boolean;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  marker?: symbol;
};

function textNode(value: string): FakeNode {
  return { nodeType: 3, textContent: value, childNodes: [] };
}

function element(
  children: FakeNode[] = [],
  attributes: Record<string, string> = {},
  tagName = "DIV",
): FakeNode {
  return {
    nodeType: 1,
    textContent: null,
    childNodes: children,
    tagName,
    hasAttribute: (name) => name in attributes,
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
  };
}

test("localize switches text and attributes in place and recognizes externally refreshed Chinese HUD text", () => {
  const label = textNode(" 赛事大厅 ");
  const attrs = {
    placeholder: "输入车手名",
    "aria-label": "设置",
    title: "查看赛道",
  };
  const root = element([label], attrs);
  root.marker = Symbol("event-listener-placeholder");

  setLanguage("en");
  localize(root as unknown as HTMLElement);
  assert.equal(label.textContent, " Race lobby ");
  assert.deepEqual(attrs, {
    placeholder: "Enter driver name",
    "aria-label": "Settings",
    title: "View track",
  });

  setLanguage("fr");
  localize(root as unknown as HTMLElement);
  assert.equal(label.textContent, " Hall des courses ");
  assert.equal(root.marker?.description, "event-listener-placeholder");

  label.textContent = "开始比赛";
  localize(root as unknown as HTMLElement);
  assert.equal(label.textContent, "Lancer la course");
});

test("localize skips scripts, form values, and data-no-i18n descendants", () => {
  const scriptText = textNode("开始比赛");
  const skippedText = textNode("赛事大厅");
  const inputText = textNode("输入车手名");
  const root = element([
    element([scriptText], {}, "SCRIPT"),
    element([skippedText], { "data-no-i18n": "" }),
    element([inputText], { value: "赛事大厅" }, "INPUT"),
  ]);

  setLanguage("es");
  localize(root as unknown as HTMLElement);
  assert.equal(scriptText.textContent, "开始比赛");
  assert.equal(skippedText.textContent, "赛事大厅");
  assert.equal(inputText.textContent, "输入车手名");
  setLanguage("zh");
});

test("localize translates visible option labels without changing form values", () => {
  const optionLabel = textNode("竞速赛");
  const option = element([optionLabel], { value: "race" }, "OPTION");
  const select = element([option], { value: "race" }, "SELECT");

  setLanguage("en");
  localize(select as unknown as HTMLElement);
  assert.equal(optionLabel.textContent, "Race");
  assert.equal(select.getAttribute?.("value"), "race");
  assert.equal(option.getAttribute?.("value"), "race");
  setLanguage("zh");
});

test("form hints switch languages while entered and default values remain literal", () => {
  const defaultText = textNode("赛事大厅");
  const attrs = {
    placeholder: "输入车手名",
    "aria-label": "设置",
    value: "赛事大厅",
  };
  const input = element([], attrs, "INPUT");
  const textarea = element(
    [defaultText],
    { placeholder: "输入房间码" },
    "TEXTAREA",
  );
  const root = element([input, textarea]);
  for (const locale of ["en", "fr", "hi", "es", "ar", "zh"] as const) {
    setLanguage(locale);
    localize(root as unknown as HTMLElement);
    assert.equal(attrs.placeholder, tr("输入车手名"));
    assert.equal(attrs["aria-label"], tr("设置"));
    assert.equal(textarea.getAttribute?.("placeholder"), tr("输入房间码"));
    assert.equal(attrs.value, "赛事大厅");
    assert.equal(defaultText.textContent, "赛事大厅");
  }
});
