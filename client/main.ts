import "./style.css";
import { World, loadContent, type Content } from "./world.ts";
import { GameAudio } from "./audio.ts";
import { Network } from "./network.ts";
import {
  spawnCar,
  separateCars,
  stepCar,
  EMPTY_INPUT,
  type Car,
  type Input,
} from "../shared/race.ts";
import {
  trackPoint,
  getTrack,
  TRACKS,
  type Track,
  TRACK_POINTS,
  TRACK_LENGTH,
  angleDiff,
} from "../shared/track.ts";
import type { Snapshot } from "../shared/protocol.ts";
import { DEFAULT_BINDINGS, readInput, type Binding } from "./controls.ts";
import { canOpenPause } from "./lifecycle.ts";

import {
  CHALLENGES,
  MODE_NAMES,
  DIFFICULTY_NAMES,
  starsFor,
  isUnlocked,
  type RaceMode,
  type Difficulty,
} from "../shared/gameplay.ts";
import { aiInput } from "../shared/ai.ts";
import {
  createItems,
  stepItems,
  ITEM_NAMES,
  ITEM_ICONS,
  type ItemWorld,
} from "../shared/items.ts";
import { validGhost, ghostAt, type Ghost } from "../shared/ghost.ts";
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const app = $("#app");
const audio = new GameAudio(),
  net = new Network();
let world: World, content: Content;
let activeTrack: Track = getTrack("coast");
let selection = {
  trackId: "coast",
  raceMode: "race" as RaceMode,
  difficulty: "normal" as Difficulty,
  laps: 3,
};
let soloCars: Car[] = [],
  itemWorld: ItemWorld | null = null;
let careerProgress: Record<string, { stars: number; time: number }> = stored(
  "pons-career-v2",
  {},
);
let bestGhost: Ghost | null = null,
  ghostFrames: number[][] = [],
  lapStart = 0,
  lastRecorded = 0,
  observedLap = 0;
const previewCars = [0, 1, 2].map((i) => spawnCar(i, "preview" + i));
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast("浏览器存储空间不足，本次纪录未保存");
  }
}
function activateTrack(id: string) {
  const next = getTrack(id);
  if (world && activeTrack.id === id) return;
  activeTrack = next;
  if (world) world.dispose();
  world = new World($("#scene") as HTMLCanvasElement, content, next);
  world.setQuality(settings.quality);
  void world.loadAssets().catch((e) => toast(e.message));
}
function setupMarkup(online = false) {
  return `<span class="eyebrow">RACE DIRECTOR / 0.2</span><h2>选择你的下一场挑战</h2><div class="track-picker">${TRACKS.map(
    (t) =>
      `<button class="track-option ${selection.trackId === t.id ? "selected" : ""}" data-track="${t.id}"><svg viewBox="-330 -330 660 660" aria-hidden="true"><polyline points="${t.points
        .filter((_, i) => i % 5 === 0)
        .map((p) => p.x + "," + p.z)
        .join(
          " ",
        )}"/></svg><b>${t.name}</b><small>${(t.length / 1000).toFixed(2)} km · ${t.theme === "coast" ? "宽阔 / 入门" : t.theme === "city" ? "连续弯 / 进阶" : "坡道与近道 / 专家"}</small></button>`,
  ).join(
    "",
  )}</div><div class="selection-grid"><label>比赛模式<select id="mode-select" data-config="raceMode">${(online ? ["race", "items"] : ["race", "items", "time", "practice"]).map((m) => `<option value="${m}" ${selection.raceMode === m ? "selected" : ""}>${MODE_NAMES[m as RaceMode]}</option>`).join("")}</select></label>${
    online
      ? ""
      : `<label>AI 难度<select id="difficulty-select" data-config="difficulty">${Object.entries(
          DIFFICULTY_NAMES,
        )
          .map(
            ([v, n]) =>
              `<option value="${v}" ${selection.difficulty === v ? "selected" : ""}>${n}</option>`,
          )
          .join("")}</select></label>`
  }<label>比赛圈数<select id="laps-select" data-config="laps">${[1, 2, 3].map((n) => `<option value="${n}" ${selection.laps === n ? "selected" : ""}>${n} 圈${n === 3 ? " · 标准赛事" : ""}</option>`).join("")}</select></label></div><p class="form-note">${online ? "多人比赛仅实际玩家参赛，全部准备后扣票。" : "竞速 / 道具模式有三名 AI；计时模式记录每圈最佳影子；自由练习没有对手。所有单人玩法免费。"}</p>${online ? "" : '<button class="button primary full" data-action="start-custom">开始比赛 →</button>'}`;
}

type Page = "home" | "career" | "online" | "vault";
let page: Page = "home",
  mode: "lobby" | "solo" | "multi" = "lobby",
  modal = "",
  busy = false,
  paused = false,
  localCar = spawnCar(),
  countdown = 3,
  lastBeep = 4,
  challengeIndex = 0,
  soloDone = false,
  elapsed = 0,
  latest: Snapshot | null = null;
let accumulator = 0,
  previous = 0,
  hudTick = 0,
  pingTick = 0,
  renderCars: Car[] = [],
  pending: { seq: number; input: Input }[] = [],
  roomStamp = "",
  lastPhase = "";
const keys = new Set<string>();
const icons = {
  flag: "⚑",
  arrow: "↗",
  play: "▶",
  coin: "◈",
  gear: "⚙",
  close: "×",
};
const defaults = DEFAULT_BINDINGS;
function stored<T>(key: string, defaultValue: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? defaultValue;
  } catch {
    return defaultValue;
  }
}
const bindings = { ...defaults, ...stored("pons-controls", defaults) };
const settings = stored("pons-settings", {
  music: 0.24,
  effects: 0.4,
  quality: "high",
});
let progress: Record<string, { time: number; drift: number }> = stored(
  "pons-progress",
  {},
);
let rebinding: Binding | null = null;
let nickname = localStorage.getItem("pons-name") || "逐浪车手";
function escape(text: string) {
  return String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function money(v = 0) {
  return (v / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function time(v: number) {
  if (!Number.isFinite(v)) return "--:--";
  const m = Math.floor(v / 60),
    s = Math.floor(v % 60),
    ms = Math.floor((v % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}<small>.${String(ms).padStart(2, "0")}</small>`;
}
function keyName(key: string) {
  return key
    .replace("Key", "")
    .replace("Digit", "")
    .replace("Left", "")
    .replace("Right", "")
    .replace("Control", "Ctrl")
    .replace("Arrow", "");
}
function toast(message: string) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4500);
}
function startAudio() {
  audio.setVolumes(settings.music, settings.effects);
  audio.start(content.musicUrl);
}
function simulated() {
  return '<span class="sim"><i></i> 模拟经济 · 无真实资金</span>';
}
function header() {
  return `<header class="header"><button class="brand" data-page="home" aria-label="返回首页"><span class="brand-mark">P<span>↗</span></span><span>PONS<span class="brand-light">KART</span><small>CHASE THE TIDE.</small></span></button><nav>${(["home", "career", "online", "vault"] as Page[]).map((p, i) => `<button data-page="${p}" class="${page === p ? "active" : ""}">${["赛事大厅", "单人挑战", "多人联机", "奖励金库"][i]}${p === "online" ? '<span class="nav-dot"></span>' : ""}</button>`).join("")}</nav><div class="header-actions">${simulated()}<button class="wallet" data-action="wallet"><span class="coin">◈</span> <span id="wallet-value">${net.account ? money(net.account.tickets) : "—"}</span> <span class="wallet-unit">TICKET</span></button><button class="icon-button" data-action="settings" aria-label="设置">${icons.gear}</button></div></header>`;
}
function footer() {
  return `<footer class="footer"><span><i class="status-dot ${net.account ? "" : "off"}"></i> ${net.account ? "本地赛事服务已连接" : "单人模式就绪"} <span class="footer-divider">/</span> PROTOTYPE 0.2</span><span>原创赛道 · 原创配乐 · 为每一次漂移而生</span><button data-action="help">操作指南 <span>↗</span></button></footer>`;
}
function lobby() {
  mode = "lobby";
  app.className = "lobby";
  app.innerHTML =
    header() +
    `<main class="lobby-main">${page === "home" ? home() : page === "career" ? career() : page === "online" ? online() : vault()}</main>` +
    footer() +
    `<div id="modal-root"></div>`;
  roomStamp = "";
}
function home() {
  return `<section class="hero"><div class="eyebrow"><span class="season">SEASON 00</span><span>THE COAST IS CALLING</span></div><h1>逐浪而行<span>弯道，由你定义。</span></h1><p class="hero-copy">把海风甩在身后。<br>漂移、蓄能、冲线，下一位领跑者就是你。</p><div class="hero-buttons"><button class="button primary" data-action="practice">即刻试驾 <span>↗</span></button><button class="button outline" data-page="online">与好友竞速 <span>→</span></button></div><div class="hero-meta"><span><b>03</b> 多主题赛道</span><span><b>04</b> 同场竞技席位</span><span><b>∞</b> 漂移可能</span></div></section><aside class="track-tag"><span class="live-pill"><i></i> CIRCUIT 001</span><h2>${escape(activeTrack.name)}</h2><p>${escape(activeTrack.subtitle)}</p><div><span>↝ ${(activeTrack.length / 1000).toFixed(2)} km</span><span>☀ 晴朗</span><span>技术型</span></div></aside><section class="mode-grid"><button class="mode-card practice" data-action="practice"><span class="card-index">01 / FREE DRIVE</span><div class="card-row"><h3>自由试驾</h3><span class="card-arrow">↗</span></div><p>熟悉每一个弯，找到你的节奏。</p><div class="card-bottom"><span class="badge">免费体验</span><span>随时出发 →</span></div></button><button class="mode-card challenge" data-page="career"><span class="card-index">02 / SOLO CHALLENGE</span><div class="card-row"><h3>单人挑战</h3><span class="card-arrow">↗</span></div><p>从第一圈，到属于你的最佳纪录。</p><div class="card-bottom"><span class="badge">${Object.keys(careerProgress).filter((k) => careerProgress[k].stars > 0).length} / 9 已完成</span><span>查看挑战 →</span></div></button><button class="mode-card multiplayer" data-page="online"><span class="card-index">03 / MULTIPLAYER</span><div class="card-row"><h3>多人竞速</h3><span class="card-arrow">↗</span></div><p>邀请好友，用实力争夺领奖台。</p><div class="card-bottom"><span class="badge">2–4 人实时联机</span><span>进入房间 →</span></div></button><button class="pool-card" data-page="vault"><span class="card-index">SIMULATED PRIZE POOL</span><div class="pool-value">${net.pool ? money(net.pool.available) : "—"} <small>$PONS</small></div><p><i></i> 模拟交易税 2% · 可用奖池</p><span class="pool-link">探索奖励金库 ↗</span></button></section>`;
}
function career() {
  return `<section class="page-heading compact"><span class="eyebrow">CAREER / 3 CHAPTERS · 9 CHALLENGES</span><h1>从海岸出发，向山巅进阶。</h1><p>赢取星级解锁下一关。自由比赛可提前练习所有赛道。</p><button class="button outline" data-action="practice">自由比赛与练习 ↗</button></section><section class="challenge-grid">${CHALLENGES.map(
    (q, i) => {
      const p = careerProgress[q.id],
        unlocked = isUnlocked(i, careerProgress);
      return `<article class="challenge-tile ${unlocked ? "" : "locked"}"><span class="challenge-number">${String(i + 1).padStart(2, "0")}</span><span class="tag">${getTrack(q.trackId).name} · ${MODE_NAMES[q.mode]}</span><h2>${q.title}</h2><p>${q.description}</p><div class="stars">${"★".repeat(p?.stars || 0)}${"☆".repeat(3 - (p?.stars || 0))}</div><div class="challenge-detail"><span>${q.laps} 圈 · ${DIFFICULTY_NAMES[q.difficulty]}</span><span>${p ? "最佳 " + time(p.time) : "金星参考 " + q.gold + " 秒"}</span></div><button class="button ${unlocked ? "primary" : "outline"}" data-challenge="${i}" ${unlocked ? "" : "disabled"}>${unlocked ? "开始挑战 ↗" : "先完成上一关"}</button></article>`;
    },
  ).join("")}</section>`;
}
function online() {
  return `<section class="page-heading"><span class="eyebrow">REAL-TIME MULTIPLAYER / 02</span><h1>一起出发，<br>各凭本事领跑。</h1><p>真实玩家，实时较量。创建房间，把房间码分享给好友。</p></section><section class="online-layout"><div class="glass form-panel"><label for="nickname">你的车手名</label><input id="nickname" maxlength="16" value="${escape(nickname)}" placeholder="输入车手名"><div class="two-col"><div><h3>发起一场比赛</h3><p>2–4 位车手 · 可选赛道与模式</p><button class="button outline" data-action="room-config">赛事设置</button><p>${getTrack(selection.trackId).name} · ${MODE_NAMES[selection.raceMode]} · ${selection.laps} 圈</p><button class="button primary" data-action="create">创建房间 <span>＋</span></button></div><div><h3>加入好友的房间</h3><input id="room-code" placeholder="输入房间码" maxlength="32" autocomplete="off"><button class="button outline" data-action="join">加入房间 <span>→</span></button></div></div><p class="form-note">本机可用两个独立标签页联机；同一局域网设备需能访问赛事服务器。</p></div><aside class="glass race-rules"><span class="eyebrow">RACE BRIEF</span><h2>这一场，为荣誉。</h2><div><span>每人门票</span><b>10 TICKET</b></div><div><span>本场奖金</span><b>100 $PONS</b></div><div><span>4 人场前三名</span><b>60 / 30 / 10%</b></div><p>凑齐至少 2 人并全部准备后才扣票。开赛前取消退票。奖金仅分配给有效完赛车手。</p>${simulated()}</aside></section>`;
}
function vault() {
  const p = net.pool;
  return `<section class="page-heading"><span class="eyebrow">THE REWARD VAULT / 03</span><h1>每一次冲线，<br>都有回响。</h1><p>查看模拟税收积累和比赛奖励。当前所有数字均为测试数据。</p></section><section class="vault-grid"><div class="glass balance-panel"><span class="eyebrow">AVAILABLE PRIZE POOL</span><h2>${p ? money(p.available) : "—"} <small>$PONS</small></h2><div class="pool-stats"><div><span>累计税收入账</span><b>${money(p?.received)}</b></div><div><span>比赛已预留</span><b>${money(p?.reserved)}</b></div><div><span>待车手领取</span><b>${money(p?.pending)}</b></div><div><span>累计已发放</span><b>${money(p?.paid)}</b></div></div><p class="form-note">初始模拟税收基金为 12,840 PONS。每次模拟 5,000 PONS 应税交易额，按 2% 注入 100 PONS；门票收入独立记账。</p><button class="button outline" data-action="tax">模拟一笔税收入账 <span>＋ 100</span></button></div><div class="glass rewards-panel"><span class="eyebrow">YOUR REWARDS</span><h2>我的比赛奖励</h2><div class="balance-row"><span>已领取</span><b>${money(net.account?.pons)} PONS</b></div><div id="claim-list">${claims()}</div></div></section>`;
}
function claims() {
  return net.account?.pending.length
    ? net.account.pending
        .map(
          (a) =>
            `<div class="claim-row"><div><b>${money(a.amount)} PONS</b><small>赛事 ${escape(a.matchId)}</small></div><button class="button primary small" data-claim="${escape(a.matchId)}">领取</button></div>`,
        )
        .join("")
    : '<div class="empty-state"><span>⚑</span><p>你的领奖台，虚位以待。</p><small>在多人竞速中完赛，奖励会出现在这里。</small></div>';
}
function showModal(kind: string) {
  modal = kind;
  if (mode === "solo") paused = true;
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-backdrop"><section class="modal ${kind === "room" ? "room-modal" : ""}" role="dialog" aria-modal="true"><button class="modal-close" data-action="close" aria-label="关闭">×</button>${kind === "setup" ? setupMarkup() : kind === "room-config" ? setupMarkup(true) : kind === "settings" ? settingsMarkup() : kind === "wallet" ? walletMarkup() : kind === "room" ? roomMarkup() : helpMarkup()}</section></div>`;
}
function settingsMarkup() {
  return `<span class="eyebrow">PIT STOP / SETTINGS</span><h2>找到你的驾驶节奏</h2><div class="setting-row"><label for="music-volume">音乐音量</label><input id="music-volume" data-setting="music" type="range" min="0" max="1" step=".01" value="${settings.music}"></div><div class="setting-row"><label for="effects-volume">音效音量</label><input id="effects-volume" data-setting="effects" type="range" min="0" max="1" step=".01" value="${settings.effects}"></div><div class="setting-row"><label for="quality">画面质量</label><select id="quality" data-setting="quality"><option value="high" ${settings.quality === "high" ? "selected" : ""}>高 · 阴影与高清渲染</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>流畅 · 降低分辨率</option></select></div><h3 class="controls-title">键位设置 <small>点击按键后按下新键</small></h3><div class="binding-grid">${Object.entries(
    bindings,
  )
    .map(
      ([action, key]) =>
        `<div><span>${({ throttle: "加速", brake: "刹车 / 倒车", left: "左转", right: "右转", drift: "漂移", boost: "氮气", reset: "回检查点", item: "使用道具" } as Record<string, string>)[action]}</span><button data-binding="${action}">${keyName(key)}</button></div>`,
    )
    .join(
      "",
    )}</div><p class="form-note">方向键始终可用。Esc ${mode === "multi" ? "打开菜单，在线比赛继续" : "暂停单人比赛"}。</p><button class="button outline" data-action="defaults">恢复默认键位</button>`;
}
function walletMarkup() {
  return `<span class="eyebrow">SIMULATION ACCOUNT</span><h2>你的模拟账户</h2>${simulated()}<div class="wallet-balances"><div><span>门票余额</span><b>${money(net.account?.tickets)} <small>TICKET</small></b></div><div><span>已领取奖励</span><b>${money(net.account?.pons)} <small>PONS</small></b></div></div><p>每个标签页使用独立的模拟车手身份，刷新后保留。本阶段无需连接钱包。</p>${claims()}`;
}
function helpMarkup() {
  return `<span class="eyebrow">DRIVER'S HANDBOOK</span><h2>第一圈，从这里开始。</h2><div class="help-list"><p><kbd>${keyName(bindings.throttle)}</kbd> / 方向键加速，<kbd>${keyName(bindings.brake)}</kbd> 刹车与倒车。</p><p>入弯时按住 <kbd>${keyName(bindings.drift)}</kbd> + 方向键，漂移积累能量。</p><p>每 100 点能量可用一次氮气。按 <kbd>${keyName(bindings.boost)}</kbd> 释放，在出弯直道超越对手。</p><p>撞墙后可按 <kbd>${keyName(bindings.reset)}</kbd> 回到已通过的检查点。</p><p>沿赛道前进，顺序通过检查点。回头穿越终点不会增加圈数。</p></div><button class="button primary" data-action="close">准备好了 <span>→</span></button>`;
}
function roomMarkup() {
  const s = latest;
  return `<span class="eyebrow">PADDOCK / MULTIPLAYER</span><h2>发车前的最后准备</h2><div class="room-code">房间码 <b>${escape(s?.roomId || net.room?.roomId || "连接中")}</b><button class="text-button" data-action="copy">复制 ↗</button></div><div class="room-slots">${Array.from(
    { length: 4 },
    (_, i) => {
      const p = s?.players.find((p) => p.slot === i);
      return `<div class="slot ${p ? "occupied" : ""}"><span class="slot-avatar" style="--slot-color:${content.palette[i]}">${p ? "◉" : "＋"}</span><b>${p ? escape(p.name) : "等待车手"}</b><small>${p ? (p.connected ? (p.ready ? "✓ 已准备" : "准备中") : "重连中") : "空席"}</small></div>`;
    },
  ).join(
    "",
  )}</div><div class="room-summary"><span>${s?.laps || selection.laps} 圈 · ${escape(s ? getTrack(s.trackId).name : getTrack(selection.trackId).name)} · ${MODE_NAMES[s?.raceMode || "race"]}</span><span>10 TICKET / 人</span><span>奖金 100 PONS</span></div><p class="form-note">至少 2 人全部准备后自动扣票发车。关闭此面板将离开房间。</p><button class="button primary full" data-action="ready">${s?.players.find((p) => p.id === net.room?.sessionId)?.ready ? "取消准备" : "准备出发"} <span>→</span></button>`;
}
function closeModal() {
  if (modal === "room") {
    void exitRace();
    return;
  }
  modal = "";
  rebinding = null;
  $("#modal-root").innerHTML = "";
  if (mode === "solo") paused = false;
  if (mode === "lobby" && page === "online") lobby();
  keys.clear();
}
function raceUI() {
  app.className = "in-race";
  app.innerHTML = `<div class="race-top"><div class="race-brand"><b>PONS KART</b><span>${mode === "solo" ? (challengeIndex < 0 ? MODE_NAMES[selection.raceMode] : CHALLENGES[challengeIndex].title) : MODE_NAMES[latest?.raceMode || "race"]}</span></div><div class="race-title"><span>${escape(activeTrack.name)}</span><b id="lap-count">LAP 1 / 1</b></div><button class="race-menu" data-action="pause">☰ <span>ESC</span></button></div><div class="race-position"><b id="position">01</b><span id="position-total">/ 01</span><small id="race-status">SOLO RUN</small></div><div class="race-time"><span>RACE TIME</span><b id="timer">00:00<small>.00</small></b><small id="objective"></small></div><div class="race-bottom"><div class="minimap-box"><canvas id="minimap" width="230" height="180"></canvas><span>${activeTrack.subtitle}</span></div><div class="nitro-box"><span>◈ NITRO ENERGY <kbd>${keyName(bindings.boost)}</kbd></span><div class="nitro-track"><i id="nitro-fill"></i><span></span></div><div><b id="nitro-label">漂移集气</b><small id="drift-total">0 / 200</small></div></div><div class="speedometer"><span id="boost-label">KEEP YOUR FLOW</span><div><b id="speed">000</b><small>KM/H</small></div><div class="speed-bars">${"<i></i>".repeat(18)}</div></div></div><div class="race-hint"><kbd>${keyName(bindings.throttle)}</kbd> 加速 <kbd>${keyName(bindings.drift)}</kbd> 漂移 <kbd>${keyName(bindings.boost)}</kbd> 氮气 <kbd>${keyName(bindings.reset)}</kbd> 重置</div><div class="item-hud" id="item-hud"></div><div class="race-feedback" id="race-feedback" aria-live="polite"></div><div class="countdown" id="countdown"></div><div class="race-sim">${simulated()} <span id="net-ping"></span></div><div id="modal-root"></div>`;
  world.resetCamera();
}
function beginSolo(index: number) {
  if (index >= 0 && !isUnlocked(index, careerProgress)) {
    toast("先完成上一关");
    return;
  }
  const q = index >= 0 ? CHALLENGES[index] : null;
  if (q)
    selection = {
      trackId: q.trackId,
      raceMode: q.mode,
      difficulty: q.difficulty,
      laps: q.laps,
    };
  activateTrack(selection.trackId);
  startAudio();
  challengeIndex = index;
  mode = "solo";
  modal = "";
  localCar = spawnCar(0, "local", activeTrack);
  soloCars = [localCar];
  if (selection.raceMode === "race" || selection.raceMode === "items")
    for (let i = 1; i < 4; i++)
      soloCars.push(spawnCar(i, "AI-" + i, activeTrack));
  itemWorld =
    selection.raceMode === "items"
      ? createItems(
          soloCars.map((c) => c.id),
          activeTrack,
        )
      : null;
  bestGhost = null;
  const g = stored<unknown>("pons-ghost-v2-" + activeTrack.id, null);
  if (validGhost(g, activeTrack.id)) bestGhost = g;
  ghostFrames = [];
  lapStart = 0;
  lastRecorded = -1;
  observedLap = 0;
  countdown = 3;
  lastBeep = 4;
  paused = false;
  soloDone = false;
  elapsed = 0;
  latest = null;
  pending = [];
  accumulator = 0;
  keys.clear();
  raceUI();
}
async function exitRace() {
  keys.clear();
  modal = "";
  paused = false;
  await net.leave();
  latest = null;
  page = "home";
  lobby();
}
function soloResult() {
  if (soloDone) return;
  soloDone = true;
  const q = challengeIndex >= 0 ? CHALLENGES[challengeIndex] : null;
  const sorted = [...soloCars].sort((a, b) =>
    a.finished && b.finished
      ? a.time - b.time
      : a.finished
        ? -1
        : b.finished
          ? 1
          : b.progress - a.progress,
  );
  const rank = sorted.findIndex((c) => c.id === localCar.id) + 1;
  const uses = itemWorld?.players.local.uses || 0;
  const stars = q
    ? starsFor(q, elapsed, rank, localCar.driftTotal, uses, localCar.finished)
    : localCar.finished
      ? 3
      : 0;
  if (q && stars) {
    const old = careerProgress[q.id];
    careerProgress[q.id] = {
      stars: Math.max(stars, old?.stars || 0),
      time: Math.min(elapsed, old?.time || Infinity),
    };
    save("pons-career-v2", careerProgress);
  }
  modal = "result";
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal result-modal"><span class="eyebrow">RACE COMPLETE / ${MODE_NAMES[selection.raceMode]}</span><div class="result-emblem">${stars ? "⚑" : "↻"}</div><h2>${stars ? "冲线，继续向前！" : "差一点，再挑战一次。"}</h2>${q ? `<div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div><p>${stars ? (challengeIndex < 8 ? "下一关已解锁，可在生涯中继续。" : "九关已完成，继续挑战全金星！") : q.description}</p>` : ""}<div class="result-stats"><div><span>比赛用时</span><b>${time(elapsed)}</b></div><div><span>排名 / 道具使用</span><b>${rank}<small> / ${uses} 次</small></b></div></div>${soloCars.length > 1 ? `<div class="classification">${sorted.map((c, i) => `<div class="${c.id === "local" ? "you" : ""}"><b>${i + 1}</b><span>${c.id === "local" ? "你" : c.id}</span><span>${c.finished ? time(c.time) : "尚未完赛"}</span></div>`).join("")}</div>` : ""}${selection.raceMode === "time" && bestGhost ? `<p>赛道最佳单圈：${time(bestGhost.time)}</p>` : ""}<p class="form-note">单人模式免费 · 不发放代币奖励</p><div class="hero-buttons"><button class="button primary" data-action="retry">再跑一次 ↗</button><button class="button outline" data-action="exit">返回大厅</button></div></section></div>`;
  audio.beep(true);
}

function multiResult(s: Snapshot) {
  modal = "result";
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal result-modal"><span class="eyebrow">RACE CLASSIFICATION</span><h2>${s.phase === "cancelled" ? "本场比赛已取消" : "终点见，车手。"}</h2>${s.phase === "cancelled" ? `<p>${escape(s.reason)}</p>` : `<div class="classification">${s.results.map((r) => `<div class="${r.id === net.room?.sessionId ? "you" : ""}"><b>${r.rank ? String(r.rank).padStart(2, "0") : "—"}</b><span>${escape(r.name)}${r.id === net.room?.sessionId ? " · 你" : ""}</span><span>${r.time === null ? "未完成" : time(r.time)}</span><strong>${money(r.award)} PONS</strong></div>`).join("")}</div>`}<p class="form-note">模拟赛事奖励可在「奖励金库」领取。</p><button class="button primary full" data-action="exit">返回大厅 <span>→</span></button></section></div>`;
  void net.refresh();
}
function handleSnapshot(s: Snapshot) {
  latest = s;
  if (activeTrack.id !== s.trackId) activateTrack(s.trackId);
  itemWorld = s.items;
  if (mode === "lobby" && modal === "room") {
    const stamp = JSON.stringify(s.players);
    if (stamp !== roomStamp) {
      roomStamp = stamp;
      showModal("room");
    }
  }
  if (s.phase === "countdown" && mode !== "multi") {
    mode = "multi";
    modal = "";
    lastPhase = "";
    pending = [];
    localCar = { ...s.cars.find((c) => c.id === net.room?.sessionId)! };
    raceUI();
  }
  if (mode === "multi") {
    const authoritative = s.cars.find((c) => c.id === net.room?.sessionId);
    if (authoritative) {
      pending = pending.filter((p) => p.seq > authoritative.ack).slice(-120);
      localCar = { ...authoritative };
      if (s.phase === "racing")
        for (const p of pending)
          stepCar(localCar, p.input, 1 / 60, activeTrack);
    }
    if (
      (s.phase === "finished" || s.phase === "cancelled") &&
      lastPhase !== s.phase
    )
      multiResult(s);
    lastPhase = s.phase;
  }
}
net.onSnapshot = handleSnapshot;
net.onNotice = toast;
net.onTerminal = (finalSnapshot) => {
  latest = null;
  pending = [];
  if (
    finalSnapshot &&
    (finalSnapshot.phase === "finished" || finalSnapshot.phase === "cancelled")
  ) {
    latest = finalSnapshot;
    if (mode === "multi") multiResult(finalSnapshot);
    return;
  }
  mode = "lobby";
  page = "online";
  lobby();
  modal = "connection-ended";
  $("#modal-root").innerHTML =
    '<div class="modal-backdrop"><section class="modal"><span class="eyebrow">CONNECTION ENDED</span><h2>联机赛事已结束</h2><p>重连时限已结束或赛事服务器已关闭。席位已释放，账户状态会在服务恢复后刷新。</p><button class="button primary full" data-action="exit">返回赛事大厅 <span>→</span></button></section></div>';
};

async function act(action: string) {
  if (action === "close") {
    closeModal();
    return;
  }
  if (action === "practice") {
    showModal("setup");
    return;
  }
  if (action === "start-custom") {
    beginSolo(-1);
    return;
  }
  if (action === "room-config") {
    if (selection.raceMode !== "items") selection.raceMode = "race";
    showModal("room-config");
    return;
  }
  if (action === "settings") {
    startAudio();
    showModal("settings");
    return;
  }
  if (action === "help") {
    showModal("help");
    return;
  }
  if (action === "wallet") {
    showModal("wallet");
    return;
  }
  if (action === "retry") {
    beginSolo(challengeIndex);
    return;
  }
  if (action === "exit") {
    await exitRace();
    return;
  }
  if (action === "pause") {
    if (modal) {
      closeModal();
      return;
    }
    if (mode === "solo") paused = true;
    modal = "pause";
    $("#modal-root").innerHTML =
      `<div class="modal-backdrop"><section class="modal"><span class="eyebrow">PIT STOP</span><h2>${mode === "solo" ? "稍作停留，精彩继续。" : "比赛仍在进行"}</h2><p>${mode === "solo" ? "计时已暂停。" : "在线比赛不会暂停，车辆将自然减速。"}</p><div class="stack"><button class="button primary" data-action="close">继续驾驶 →</button><button class="button outline" data-action="settings">操作与声音设置</button>${mode === "solo" ? '<button class="button outline" data-action="retry">重新开始</button>' : ""}<button class="text-button" data-action="exit">${mode === "multi" ? "退出比赛（未完赛不获奖）" : "返回大厅"}</button></div></section></div>`;
    keys.clear();
    return;
  }
  if (action === "defaults") {
    Object.assign(bindings, defaults);
    localStorage.setItem("pons-controls", JSON.stringify(bindings));
    showModal("settings");
    return;
  }
  if (action === "copy") {
    await navigator.clipboard.writeText(net.room?.roomId || "");
    toast("房间码已复制");
    return;
  }
  if (action === "ready") {
    const me = latest?.players.find((p) => p.id === net.room?.sessionId);
    net.ready(!me?.ready);
    return;
  }
  if (busy) return;
  busy = true;
  try {
    if (action === "create" || action === "join") {
      nickname =
        ($("#nickname") as HTMLInputElement).value.trim() || "逐浪车手";
      localStorage.setItem("pons-name", nickname);
      const roomId =
        action === "join"
          ? ($("#room-code") as HTMLInputElement).value.trim()
          : undefined;
      if (action === "join" && !roomId) throw Error("请先输入好友的房间码");
      toast("正在连接赛事服务器…");
      startAudio();
      latest = null;
      await net.join(nickname, roomId, {
        trackId: selection.trackId,
        mode: selection.raceMode === "items" ? "items" : "race",
        laps: selection.laps,
      });
      showModal("room");
    }
    if (action === "tax") {
      await net.request("tax/" + crypto.randomUUID(), "POST");
      await net.refresh();
      lobby();
      toast("模拟 5,000 PONS 应税交易额，奖池增加 100 PONS");
    }
  } finally {
    busy = false;
  }
}
document.addEventListener("click", (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.track) {
    selection.trackId = el.dataset.track;
    showModal(modal);
    return;
  }
  if (el.dataset.page) {
    if (net.room) {
      toast("请先离开当前房间");
      return;
    }
    page = el.dataset.page as Page;
    lobby();
  } else if (el.dataset.action)
    void act(el.dataset.action).catch((e) => toast((e as Error).message));
  else if (el.dataset.challenge) beginSolo(Number(el.dataset.challenge));
  else if (el.dataset.binding) {
    rebinding = el.dataset.binding as Binding;
    el.textContent = "请按键…";
  } else if (el.dataset.claim)
    void net
      .request("claim/" + el.dataset.claim, "POST")
      .then(() => net.refresh())
      .then(() => {
        if (modal === "wallet") showModal("wallet");
        else lobby();
        toast("模拟奖励已领取");
      })
      .catch((e) => toast(e.message));
});
document.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.dataset.config) {
    const k = el.dataset.config;
    if (k === "trackId") selection.trackId = el.value;
    else if (k === "raceMode") selection.raceMode = el.value as RaceMode;
    else if (k === "difficulty") selection.difficulty = el.value as Difficulty;
    else if (k === "laps") selection.laps = Number(el.value);
    return;
  }
  if (!el.dataset.setting) return;
  const k = el.dataset.setting as "music" | "effects" | "quality";
  if (k === "quality") {
    settings.quality = el.value;
    world.setQuality(el.value);
  } else settings[k] = Number(el.value);
  audio.setVolumes(settings.music, settings.effects);
  localStorage.setItem("pons-settings", JSON.stringify(settings));
});
window.addEventListener("keydown", (event) => {
  if (rebinding) {
    event.preventDefault();
    if (event.code === "Escape") {
      rebinding = null;
      showModal("settings");
      return;
    }
    if (
      [
        "Tab",
        "MetaLeft",
        "MetaRight",
        "AltLeft",
        "AltRight",
        "Escape",
      ].includes(event.code) ||
      Object.entries(bindings).some(
        ([k, v]) => k !== rebinding && v === event.code,
      ) ||
      event.code.startsWith("Arrow")
    ) {
      toast("该键已占用或为保留键，请选择其他按键");
      return;
    }
    bindings[rebinding] = event.code;
    localStorage.setItem("pons-controls", JSON.stringify(bindings));
    rebinding = null;
    showModal("settings");
    return;
  }
  if ((event.target as HTMLElement).matches("input,select")) return;
  if (
    mode !== "lobby" &&
    (Object.values(bindings).includes(event.code) ||
      event.code.startsWith("Arrow") ||
      event.code === "Escape")
  )
    event.preventDefault();
  if (event.code === "Escape" && !event.repeat) {
    if (modal && modal !== "result") closeModal();
    else if (canOpenPause(mode, soloDone, modal)) void act("pause");
  }
  keys.add(event.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  if (mode === "solo" && !soloDone && !modal) void act("pause");
});
document.addEventListener("visibilitychange", () => {
  keys.clear();
});
function input(): Input {
  if (modal || paused) return { ...EMPTY_INPUT };
  return readInput(keys, bindings);
}
function drawMinimap(cars: Car[]) {
  const cv = document.querySelector<HTMLCanvasElement>("#minimap");
  if (!cv) return;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, 230, 180);
  const xy = (c: { x: number; z: number }) => [
    c.x * (75 / activeTrack.radius) + 115,
    c.z * (75 / activeTrack.radius) + 88,
  ];
  ctx.beginPath();
  activeTrack.points.forEach((p, i) => {
    const [x, y] = xy(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#ffffff28";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e1eee866";
  ctx.stroke();
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i],
      [x, y] = xy(c);
    ctx.beginPath();
    ctx.arc(x, y, c.id === localCar.id ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = c.id === localCar.id ? "#c0ff59" : content.palette[i % 4];
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function targetLaps() {
  return mode === "multi" ? latest?.laps || 1 : selection.laps;
}
function hud() {
  if (mode === "lobby") return;
  const c = localCar,
    activeCountdown =
      mode === "solo"
        ? countdown
        : latest?.phase === "countdown"
          ? latest.countdown
          : 0;
  $("#countdown").textContent =
    activeCountdown > 0 ? String(Math.ceil(activeCountdown)) : "";
  if (activeCountdown > 0 && Math.ceil(activeCountdown) !== lastBeep) {
    lastBeep = Math.ceil(activeCountdown);
    audio.beep();
  }
  if (activeCountdown <= 0 && lastBeep === 1) {
    lastBeep = 0;
    audio.beep(true);
  }
  $("#speed").textContent = String(
    Math.round(Math.abs(c.speed) * 3.6),
  ).padStart(3, "0");
  $("#timer").innerHTML = time(
    mode === "solo" ? elapsed : latest?.elapsed || 0,
  );
  $("#lap-count").textContent =
    `LAP ${Math.min(c.lap + 1, targetLaps())} / ${targetLaps()}`;
  $("#nitro-fill").style.width = c.energy / 2 + "%";
  $("#nitro-label").textContent =
    c.boostTime > 0
      ? "氮气释放中"
      : c.energy >= 100
        ? "氮气就绪 · 出弯加速"
        : c.drifting
          ? "DRIFTING · 持续集气"
          : "漂移集气";
  $("#drift-total").textContent = `${Math.floor(c.energy)} / 200`;
  $("#boost-label").textContent =
    c.boostTime > 0
      ? "NITRO ON!"
      : c.drifting
        ? "FIND YOUR FLOW"
        : "KEEP YOUR FLOW";
  $(".speedometer").classList.toggle("boosting", c.boostTime > 0);
  $(".nitro-box").classList.toggle("ready", c.energy >= 100);
  document
    .querySelectorAll<HTMLElement>(".speed-bars i")
    .forEach((bar, i) =>
      bar.classList.toggle("lit", i < (Math.abs(c.speed) / 63) * 18),
    );
  const cars = mode === "multi" ? latest?.cars || [] : soloCars;
  const sorted = [...cars].sort((a, b) =>
    a.finished && b.finished
      ? a.time - b.time
      : a.finished
        ? -1
        : b.finished
          ? 1
          : b.progress - a.progress,
  );
  $("#position").textContent = String(
    Math.max(1, sorted.findIndex((v) => v.id === c.id) + 1),
  ).padStart(2, "0");
  $("#position-total").textContent =
    "/ " + String(cars.length).padStart(2, "0");
  $("#race-status").textContent =
    mode === "solo"
      ? "SOLO RUN"
      : net.connectionState === "connected"
        ? "LIVE RACE"
        : net.connectionState === "reconnecting"
          ? "RECONNECTING"
          : "CONNECTION ENDED";
  $("#net-ping").textContent = mode === "multi" ? `${net.ping} ms` : "";
  const q =
    mode === "solo" && challengeIndex >= 0 ? CHALLENGES[challengeIndex] : null;
  $("#objective").textContent = q
    ? q.description
    : selection.raceMode === "time" && mode === "solo"
      ? bestGhost
        ? "最佳单圈 " + bestGhost.time.toFixed(2) + " s"
        : "完成一圈即可生成自己的影子"
      : c.finished
        ? "已完赛，等待其他车手…"
        : "";
  const item = itemWorld?.players[c.id];
  const itemHud = $("#item-hud");
  const markup = item
    ? `<span>${item.held ? ITEM_ICONS[item.held] : "□"}</span><b>${item.held ? ITEM_NAMES[item.held] : "拾取赛道上的道具箱"}</b><kbd>${keyName(bindings.item)}</kbd>${item.shield > 0 ? `<small>护盾 ${item.shield.toFixed(1)} s</small>` : ""}`
    : "";
  if (itemHud.innerHTML !== markup) itemHud.innerHTML = markup;
  $("#race-feedback").textContent =
    c.ghostTime > 0
      ? "重置保护 · 暂时不会碰撞"
      : item && item.noticeTime > 0
        ? item.notice
        : c.impact > 0.25
          ? "接触碰撞 · 保持方向"
          : "";
  drawMinimap(cars);
}
function frame(ms: number) {
  requestAnimationFrame(frame);
  const measuredMs = ms - previous;
  const dt = Math.min(measuredMs / 1000 || 0, 0.06);
  previous = ms;
  accumulator += dt;
  while (accumulator >= 1 / 60) {
    accumulator -= 1 / 60;
    if (mode === "solo" && !paused && !soloDone) {
      if (countdown > 0) countdown -= 1 / 60;
      else {
        elapsed += 1 / 60;
        const commands: Record<string, Input> = { local: input() };
        for (const c of soloCars) {
          if (c.id !== "local")
            commands[c.id] = aiInput(
              c,
              activeTrack,
              selection.difficulty,
              elapsed,
            );
          stepCar(c, commands[c.id], 1 / 60, activeTrack);
          if (c.lap >= targetLaps() && !c.finished) {
            c.finished = true;
            c.time = elapsed;
          }
        }
        separateCars(soloCars, activeTrack);
        if (itemWorld)
          stepItems(itemWorld, soloCars, commands, 1 / 60, activeTrack);
        if (selection.raceMode === "time") {
          const lapTime = elapsed - lapStart;
          if (lapTime - lastRecorded >= 0.1 || localCar.lap > observedLap) {
            ghostFrames.push([
              lapTime,
              localCar.x,
              localCar.z,
              localCar.heading,
            ]);
            lastRecorded = lapTime;
          }
          if (localCar.lap > observedLap) {
            const g: Ghost = {
              version: 2,
              trackId: activeTrack.id,
              time: lapTime,
              frames: ghostFrames,
            };
            if (
              (!bestGhost || lapTime < bestGhost.time) &&
              validGhost(g, activeTrack.id)
            ) {
              bestGhost = g;
              save("pons-ghost-v2-" + activeTrack.id, g);
            }
            ghostFrames = [[0, localCar.x, localCar.z, localCar.heading]];
            lapStart = elapsed;
            lastRecorded = 0;
            observedLap = localCar.lap;
          }
        }
        const q = challengeIndex >= 0 ? CHALLENGES[challengeIndex] : null;
        if (
          localCar.finished ||
          (q?.limit && elapsed > q.limit) ||
          elapsed > 540
        )
          soloResult();
      }
    } else if (
      mode === "multi" &&
      latest?.phase === "racing" &&
      net.connected
    ) {
      const cmd = input();
      net.input(cmd);
      pending.push({ seq: net.seq, input: cmd });
      if (pending.length > 120) pending.shift();
      stepCar(localCar, cmd, 1 / 60, activeTrack);
    }
  }
  let cars: Car[];
  if (mode === "lobby") {
    cars = previewCars;
    for (let i = 0; i < cars.length; i++) {
      const p = trackPoint(((ms / 1000) * 0.007 + i * 0.013) % 1, activeTrack),
        c = cars[i];
      c.x = p.x + Math.cos(p.heading) * (i - 1) * 2;
      c.z = p.z - Math.sin(p.heading) * (i - 1) * 2;
      c.heading = p.heading;
      c.speed = 25;
    }
  } else if (mode === "solo") {
    cars = [...soloCars];
    if (selection.raceMode === "time" && bestGhost) {
      const p = ghostAt(bestGhost, elapsed - lapStart);
      if (p)
        cars.push({
          ...spawnCar(0, "ghost", activeTrack),
          ...p,
          ghostTime: 999,
        });
    }
  } else {
    cars = (latest?.cars || []).map((c) => {
      if (c.id === localCar.id) return localCar;
      const old = renderCars.find((o) => o.id === c.id);
      if (!old) return { ...c };
      const a = 1 - Math.exp(-14 * dt);
      return {
        ...c,
        x: old.x + (c.x - old.x) * a,
        z: old.z + (c.z - old.z) * a,
        heading: old.heading + angleDiff(c.heading, old.heading) * a,
      };
    });
  }
  renderCars = cars;
  world.render(cars, localCar.id, dt, mode === "lobby", measuredMs);
  world.renderItems(mode === "lobby" ? null : itemWorld);
  audio.update(
    localCar.speed,
    localCar.drifting,
    localCar.boostTime > 0,
    mode !== "lobby" && !paused,
  );
  if (ms - hudTick > 70) {
    hudTick = ms;
    hud();
  }
  if (ms - pingTick > 2000) {
    pingTick = ms;
    net.measurePing();
  }
}
async function boot() {
  app.innerHTML =
    '<div class="loading"><span class="brand-mark">P↗</span><h2>正在准备赛事</h2><p>拧紧轮胎，调好电台，马上出发。</p></div>';
  try {
    content = await loadContent();
    world = new World($("#scene") as HTMLCanvasElement, content, activeTrack);
    world.setQuality(settings.quality);
    await world.loadAssets();
    lobby();
    requestAnimationFrame(frame);
    try {
      await net.init();
      if (mode === "lobby" && !modal) lobby();
    } catch {
      toast(
        "赛事服务器尚未连接，仍可免费单人试驾。启动 npm run dev 可开启联机。",
      );
    }
  } catch (e) {
    app.innerHTML = `<div class="loading"><h2>赛道加载失败</h2><p>${escape((e as Error).message)}</p><p>请检查浏览器 WebGL 支持与 content.json 资源配置。</p><button class="button primary" onclick="location.reload()">重新加载</button></div>`;
    console.error(e);
  }
}
void boot();
