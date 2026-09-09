import { mapPickerMarkup, mapTagsMarkup, parseMapRatingFilter, type MapRatingFilter } from "./map-picker.ts";
import { garageMarkup, readSelectedKart, saveSelectedKart, type GarageTab } from "./kart-garage.ts";
import { readDriverAppearance, saveDriverAppearance } from './driver-customization.ts';
import { driverForSlot, getDriverOutfit, sanitizeDriverColor } from '../shared/drivers.ts';
import { sanitizeKartId, kartForSlot } from "../shared/karts.ts";
import { createSoloOpponents } from './solo-opponents.ts';
import "./brand.css";
import "./kart-garage.css";
import './driver-customization.css';
import "./gameplay.css";
import "./vfx/podium.css";
import { PodiumGate, podiumRank, type PodiumContext } from "./vfx/podium.ts";
import { mountPodium } from "./vfx/podium-view.ts";
import "./vfx/hud.css";
import { HudVfx, mountResultFeedback } from "./vfx/hud.ts";
import { ObstacleHud } from './obstacle-hud.ts';
import './obstacle-hud.css';
import type { CourseTarget } from "./vfx/course.ts";
import {
  ChallengeRun,
  CAREER_EVENT_VERSION,
  type ChallengeMetrics,
} from "../shared/challenge-events.ts";
import { CornerPractice, practiceCorners } from "./practice.ts";
import {
  drivingAdvice,
  sectorComparison,
  sectorDuration,
} from "./race-feedback.ts";
import { driftEfficiency } from "../shared/driving-skills.ts";
import { incomingThreat } from "../shared/items.ts";
import {
  nitroDisplay,
  rewardDisplay,
  type ClaimConfirmation,
} from "./visual-state.ts";
import {
  brandLogo,
  button,
  dialog,
  focusDialog,
  releaseDialog,
  withPending,
} from "./ui.ts";
import { icon, type Icon } from "./icons.ts";
import { LANGUAGES, language, setLanguage, tr, localize } from "./i18n.ts";
import { World, loadContent, type Content } from "./world.ts";
import { getLevel, drivingZoneAt } from "../shared/levels.ts";
import { GameAudio } from "./audio.ts";
import { mountUiAudio } from "./ui-audio.ts";
import { DEFAULT_AUDIO, audioPreferences } from "./audio-mix.ts";
import { preloadCountdownVoice } from "./countdown-voice.ts";
import { CollisionSoundEvents } from "./collision-feedback.ts";
import { Network } from "./network.ts";
import { copyInvitation, invitationUrl, parseRoomCode } from './multiplayer.ts';
import { friendRoomMarkup, serviceMarkup, waitingTime } from './multiplayer-ui.ts';
import './multiplayer.css';
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
  trackWidth,
  trackWidthRange,
  getTrack,
  TRACKS,
  type Track,
  TRACK_POINTS,
  TRACK_LENGTH,
  angleDiff,
} from "../shared/track.ts";
import type { Snapshot } from "../shared/protocol.ts";
import { DEFAULT_BINDINGS, readInput, type Binding } from "./controls.ts";
import { canOpenPause, soloRaceComplete, soloSessionDeadline } from "./lifecycle.ts";
import { classicRecords, classicHistoryMarkup } from "./career-history.ts";
import {
  careerBestTime,
  updateCareerProgress,
  type CareerProgress,
} from "./career-progress.ts";
import { paintMinimap } from "./minimap.ts";
import {
  capturePose,
  interpolateCar,
  type RenderPose,
} from "./render-motion.ts";

import {
  CHALLENGES,
  MODE_NAMES,
  DIFFICULTY_NAMES,
  starsFor,
  isUnlocked,
  matchForSelection,
  type RaceMode,
  type Difficulty,
} from "../shared/gameplay.ts";
import { Training } from "./training.ts";
import {
  VERSIONS,
  recordKey,
  classify,
} from "../shared/rules.ts";
import { aiInput, aiProfile, AI_NAMES } from "../shared/ai.ts";
import {
  createItems,
  stepItems,
  ITEM_NAMES,
  ITEM_ICONS,
  type ItemWorld,
} from "../shared/items.ts";
import { validGhost, ghostAt, type Ghost } from "../shared/ghost.ts";

const marketingQuery = new URLSearchParams(location.search);
let roomInput = marketingQuery.get('room') || '';
const marketingTrackParam = marketingQuery.get("track");
const marketingShotParam = marketingQuery.get("shot") || "rear";
let lobbyShot = marketingShotParam;
let garageReturnShot: string | null = null;
let selectedKart = readSelectedKart(undefined);
let selectedDriver = readDriverAppearance();
let garageTab: GarageTab = 'karts';
const claimConfirmations = new Map<string, ClaimConfirmation>();
const autoStartRace =
  marketingQuery.get("autostart") === "1" || marketingQuery.get("auto") === "1";
const hideHud = marketingQuery.get("hud") === "0";
const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const app = $("#app");
const hudVfx = new HudVfx(app);
const obstacleHud = new ObstacleHud(app);
const vfxReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const audio = new GameAudio(),
  net = new Network();
const collisionSounds = new CollisionSoundEvents();
let world: World, content: Content;
const podiumGate = new PodiumGate();
let clearPodium = () => {};
let clearResultVfx = () => {};
let soloVfxRun = 0;
let pbVfxSerial = 0, sectorVfxSerial = 0;
function showPodium(context: PodiumContext, stars = 0) {
  clearPodium();
  clearResultVfx();
  clearPodium = mountPodium($("#modal-root"), context, {
    quality: settings.quality === "low" ? "low" : "high",
    motion: Number(settings.motion ?? 1),
  }, podiumGate);
  const finished = context.results.find(r => r.id === context.playerId)?.finished ?? false;
  clearResultVfx = mountResultFeedback($("#modal-root"), {
    raceId: JSON.stringify([context.raceId, context.playerId]),
    finished, failed: Boolean(context.failed || context.phase === "cancelled" || !finished),
    stars, motion: vfxReducedMotion.matches ? 0 : Number(settings.motion ?? 1),
    podium: podiumRank(context) !== null,
    pb: mode === "solo" && selection.raceMode === "time" && pbVfxSerial > 0,
  });
}
let activeTrack: Track = getTrack("coast");
let selection = {
  trackId: "coast",
  raceMode: "race" as RaceMode,
  difficulty: "normal" as Difficulty,
  laps: 3,
  opponents: 5,
};
if (marketingTrackParam) {
  try {
    const t = getTrack(marketingTrackParam);
    activeTrack = t;
    selection.trackId = t.id;
  } catch {
    // Ignore invalid track query values.
  }
}
let soloCars: Car[] = [],
  itemWorld: ItemWorld | null = null;
let soloProgressAt: Record<string, number> = {};
// Physics patches version ghost times separately; earned career access/stars persist.
const careerKey =
  "pons-career-" +
  recordKey("all", {
    trackVersion: "routes-0.2.0",
    rulesVersion: "pons-rules-0.3.0",
  });
const oldCareerProgress = stored<
  Record<string, { stars: number; time: number }>
>("pons-career-v2", {});
let challengeRun: ChallengeRun | null = null;
let cornerPractice: CornerPractice | null = null;
const careerTimingKey = () => recordKey("all") + "-" + CAREER_EVENT_VERSION;
let training: Training | null = null,
  currentSplits: number[] = [],
  correctionDistance = 0;
let debugSample: {
  id: string;
  time: number;
  progress: number;
  drift: number;
  forward: number;
  gain: number;
} | null = null;
let freeOnline = true;
let careerProgress: Record<string, CareerProgress> = stored(careerKey, {});
let bestGhost: Ghost | null = null,
  ghostFrames: number[][] = [],
  lapStart = 0,
  lastRecorded = 0,
  observedLap = 0;
const previewCars = [0, 1, 2].map((i) => spawnCar(i, "preview" + i, undefined, i === 0 ? selectedKart : kartForSlot(i), i === 0 ? selectedDriver : driverForSlot(i)));
const trackPreviews = new Map<string, string>();
const previousPoses = new Map<string, RenderPose>();
const modeIcons: Record<RaceMode, Icon> = {
  race: "flag",
  items: "rocket",
  time: "timer",
  practice: "wheel",
};
const modeDescriptions: Record<RaceMode, string> = {
  race: "Race wheel to wheel against AI drivers.",
  items: "Race with four tactical items and AI rivals.",
  time: "Set a best lap and race your own ghost.",
  practice: "Learn the route at your own pace, without rivals.",
};
function languageMarkup() {
  return `<label class="language-picker">${icon("globe")}<select data-language aria-label="语言">${LANGUAGES.map((l) => `<option value="${l.code}" ${l.code === language() ? "selected" : ""}>${l.label}</option>`).join("")}</select></label>`;
}
function translateScreen(root: HTMLElement = app) {
  localize(root);
}
function starsMarkup(count: number) {
  return `<div class="stars" aria-label="${count} / 3">${[0, 1, 2].map((i) => icon("star", i < count ? "earned" : "unearned")).join("")}</div>`;
}
function trackImage(track: Track, className = "") {
  const image = trackPreviews.get(track.id);
  return `<div class="track-photo ${className}" data-preview="${track.id}">${image ? `<img src="${image}" alt="">` : ""}<span class="track-theme">${tr(getLevel(track.id).label)}</span></div>`;
}
function saveTrackPreview(id: string, data: string) {
  trackPreviews.set(id, data);
  document.querySelectorAll<HTMLElement>("[data-preview]").forEach((node) => {
    if (node.dataset.preview !== id) return;
    let img = node.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      img.alt = "";
      node.prepend(img);
    }
    img.src = data;
  });
}
async function prepareTrackPreviews() {
  // Reuse one context for the whole catalog. Nineteen detached canvases can
  // exhaust WebGL's active-context limit before the browser collects them.
  const previewCanvas = document.createElement("canvas");
  for (const track of TRACKS) {
    while (mode !== "lobby")
      await new Promise((resolve) => setTimeout(resolve, 1500));
    if (trackPreviews.has(track.id)) continue;
    let preview: World | undefined;
    try {
      preview = new World(
        previewCanvas,
        content,
        track,
        true,
      );
      await preview.loadAssets();
      preview.render([], "", 0, true);
      saveTrackPreview(track.id, preview.captureThumbnail());
    } catch (error) {
      console.warn("Track preview unavailable", track.id, error);
    } finally {
      preview?.dispose();
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("浏览器存储空间不足，本次纪录未保存");
    return false;
  }
}
function activateTrack(id: string) {
  const next = getTrack(id);
  audio.setTrack(next.id);
  if (world && activeTrack.id === id) return;
  activeTrack = next;
  if (world) world.dispose();
  world = new World($("#scene") as HTMLCanvasElement, content, next);
  world.setShotMode(lobbyShot);
  world.setQuality(settings.quality);
  world.motion = Number(settings.motion ?? 1);
  void world.loadAssets().catch((e) => toast(e.message));
}
function roadWidthLabel(track: (typeof TRACKS)[number]) {
  const { min, max } = trackWidthRange(track);
  return tr("{min}–{max} 米变宽赛道", {
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
  });
}
let mapRatingFilter: MapRatingFilter = "all";
function setupMarkup(online = false) {
  const hasRivals =
    selection.raceMode === "race" || selection.raceMode === "items";
  return `<div class="modal-heading"><span class="eyebrow">KART CLUB / RACE SETUP</span><h2>CHOOSE YOUR TRACK</h2><p>${tr("Find a track for your next challenge.")}</p></div><div class="modal-scroll"><section class="setup-section">${mapPickerMarkup(TRACKS, selection.trackId, mapRatingFilter, trackImage, roadWidthLabel)}</section><section class="setup-section race-options"><div class="section-heading"><h3>Race options</h3></div><div class="selection-grid"><label>Mode<select id="mode-select" data-config="raceMode">${(online ? ["race", "items"] : ["race", "items", "time", "practice"]).map((m) => `<option value="${m}" ${selection.raceMode === m ? "selected" : ""}>${tr(MODE_NAMES[m as RaceMode])}</option>`).join("")}</select></label>${
    online
      ? ""
      : `<label>AI difficulty<select id="difficulty-select" data-config="difficulty" ${hasRivals ? "" : 'disabled aria-describedby="mode-applicability"'}>${Object.entries(
          DIFFICULTY_NAMES,
        )
          .map(
            ([v, n]) =>
              `<option value="${v}" ${selection.difficulty === v ? "selected" : ""}>${tr(n)}</option>`,
          )
          .join(
            "",
          )}</select></label><label>AI opponents<select id="opponents-select" data-config="opponents" ${hasRivals ? "" : 'disabled aria-describedby="mode-applicability"'}>${[3, 5, 7].map((n) => `<option value="${n}" ${selection.opponents === n ? "selected" : ""}>${tr("{n} 名 AI · {cars} 车赛", { n, cars: n + 1 })}</option>`).join("")}</select></label>`
  }<label>Laps<select id="laps-select" data-config="laps">${[1, 2, 3].map((n) => `<option value="${n}" ${selection.laps === n ? "selected" : ""}>${tr("{n} 圈", { n })}</option>`).join("")}</select></label></div>${!online && !hasRivals ? `<p class="mode-applicability" id="mode-applicability">${tr("Solo lap · AI options do not apply")}</p>` : ""}<p class="form-note">${online ? "Free races need no tickets. Simulation races use test tickets when everyone is ready." : "Race and Item Race support AI opponents. Time Trial records your best lap ghost. Free Practice has no opponents."}</p></section></div><div class="modal-actions"><span class="selection-summary">${escape(tr(getTrack(selection.trackId).name))}</span>${button(online ? "DONE" : "BACK", "close", "outline")}${online ? "" : button(`START RACE ${icon("arrow")}`, "start-custom", "accent")}</div>`;
}

type Page = "home" | "career" | "online" | "vault" | "garage";
let page: Page = roomInput ? 'online' : "home",
  mode: "lobby" | "solo" | "multi" = "lobby",
  modal = "",
  busy = false,
  paused = false,
  localCar = spawnCar(),
  countdown = 3,
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
interface Settings {
  music: number;
  effects: number;
  quality: string;
  motion: number;
}
const savedSettings = stored<Partial<Settings> | null>("pons-settings", null);
const settings: Settings = {
  quality: "high",
  motion: 1,
  ...savedSettings,
  ...audioPreferences(savedSettings),
};
const progress: unknown = stored("pons-progress", {});
let rebinding: Binding | null = null;
let returnToPause = false;
let nickname = localStorage.getItem("pons-name") || "Club Racer";
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
  t.textContent = tr(message);
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4500);
}
function startAudio() {
  audio.setVolumes(settings.music, settings.effects);
  audio.setTrack(activeTrack.id);
  audio.start();
}
function simulated() {
  return '<span class="sim"><i></i> 模拟经济 · 无真实资金</span>';
}
function header() {
  return `<header class="header"><button class="brand" data-page="home" aria-label="KART CLUB home">${brandLogo()}<span>KART CLUB</span></button><nav aria-label="Main navigation">${(["home", "career", "online", "vault"] as Page[]).map((p, i) => `<button data-page="${p}" class="${page === p ? "active" : ""}" ${page === p ? 'aria-current="page"' : ""}>${["Lobby", "Career", "Multiplayer", "Rewards"][i]}</button>`).join("")}</nav><div class="header-actions"><button class="wallet" data-action="wallet" aria-label="Simulation account"><b id="wallet-value" dir="ltr">${net.account ? money(net.account.tickets) : "—"}</b><span>TICKETS<small>Test account</small></span></button><button class="icon-button" data-action="settings" aria-label="Settings">${icon("gear")}</button></div></header>`;
}
function footer() {
  return `<footer class="footer"><span><i class="status-dot ${net.account ? "" : "off"}"></i> ${net.account ? "赛事服务已连接" : "Single player ready"}</span><a href="/reference.html">${tr("海岸参考试驾 ↗")}</a><a class="footer-social" href="https://x.com/KartClubGame" target="_blank" rel="noopener noreferrer" aria-label="KART CLUB on X (opens in a new tab)">${icon("xLogo")}<span dir="ltr">@KartClubGame</span></a><button data-action="help">Driving guide ${icon("arrow")}</button></footer>`;
}
function clearSoloRun() {
  hudVfx.reset();
  clearResultVfx();
  clearResultVfx = () => {};
  pbVfxSerial = sectorVfxSerial = 0;
  audio.resetCountdown();
  audio.resetDrivingSound();
  clearPodium();
  clearPodium = () => {};
  world?.resetVfx();
  challengeRun = null;
  cornerPractice = null;
  debugSample = null;
  document.querySelector("#driving-debug")?.remove();
  training = null;
  challengeIndex = -1;
  bestGhost = null;
  ghostFrames = [];
  currentSplits = [];
  soloProgressAt = {};
  soloCars = [];
  soloDone = false;
  lapStart = 0;
  lastRecorded = 0;
  observedLap = 0;
}
function lobby() {
  if (page !== "garage") restoreLobbyShot();
  mode = "lobby";
  audio.setMusicScene("lobby");
  paused = false;
  clearSoloRun();
  app.className = `lobby page-${page} biome-${getLevel(selection.trackId).biome}`;
  app.innerHTML =
    header() +
    `<main class="lobby-main">${page === "home" ? home() : page === "garage" ? garage() : page === "career" ? career() : page === "online" ? online() : vault()}</main>` +
    footer() +
    `<div id="modal-root"></div>`;
  roomStamp = "";
  translateScreen();
}
function restoreLobbyShot() {
  if (garageReturnShot === null) return;
  lobbyShot = garageReturnShot;
  garageReturnShot = null;
  world.setShotMode(lobbyShot);
}
function garage() {
  return garageMarkup(selectedKart, lobbyShot, {tab:garageTab,driver:selectedDriver,customDriver:!!content?.characterModel});
}
function home() {
  const track = getTrack(selection.trackId);
  const rivals =
    selection.raceMode === "race" || selection.raceMode === "items";
  return `<div class="home-content"><section class="lobby-panel" aria-label="Race lobby"><div class="panel-brand">${brandLogo()}<b>KART CLUB</b><button class="kart-preview-link" data-action="garage">${icon("wheel")}<span>${tr("GARAGE")}</span></button></div><div class="lobby-panel-heading"><span class="eyebrow">SEE YOU ON THE GRID</span><h1>RACE LOBBY</h1><p>Your next lap starts here.</p></div><div class="field-heading"><span>RACE MODE</span></div><div class="quick-modes" role="group" aria-label="Race mode" aria-describedby="mode-description">${(Object.keys(MODE_NAMES) as RaceMode[]).map((m) => `<button class="quick-mode ${selection.raceMode === m ? "selected" : ""}" data-mode="${m}" aria-pressed="${selection.raceMode === m}">${icon(modeIcons[m])}<span>${tr(MODE_NAMES[m])}</span><span class="mode-check" aria-hidden="true">${selection.raceMode === m ? "✓" : ""}</span></button>`).join("")}</div><p class="mode-description" id="mode-description">${tr(modeDescriptions[selection.raceMode])}</p><div class="field-heading"><span>CURRENT TRACK</span><span>${String(TRACKS.findIndex((t) => t.id === track.id) + 1).padStart(2, "0")} / ${String(TRACKS.length).padStart(2, "0")}</span></div><button class="selected-track" data-action="practice" aria-label="Choose track">${trackImage(track)}<span class="selected-track-info"><b>${escape(tr(track.name))}</b><small>${tr("{n} 圈", { n: selection.laps })}${rivals ? ` · ${tr("{n} 名 AI", { n: selection.opponents })}` : ` · ${tr(MODE_NAMES[selection.raceMode])}`}</small>${mapTagsMarkup(track)}</span>${icon("arrow")}</button>${button(`<span>START RACE</span>${icon("arrow")}`, "start-custom", "accent lobby-start")}<button class="button outline full" data-page="online">${icon("user")}<span>Race with friends</span></button><p class="lobby-free">Single player · Free to race</p></section></div><div class="lobby-scene-caption"><span class="eyebrow">${getLevel(track.id).biome.toUpperCase()} / ${String(TRACKS.findIndex((t) => t.id === track.id) + 1).padStart(2, "0")}</span><b>${tr(getLevel(track.id).name)}</b><span>${tr(getLevel(track.id).brief)}</span></div>`;
}
function career() {
  return `<section class="page-heading compact"><span class="eyebrow">CAREER / 3 CHAPTERS · 9 CHALLENGES</span><h1>九种世界 · 九种挑战</h1><p>赢取星级解锁下一关。自由比赛可提前练习所有赛道。</p><button class="button primary" data-action="training">驾驶教学 · 五步练习</button> <button class="button outline" data-action="practice">自由比赛与练习 ↗</button></section><section class="challenge-grid">${CHALLENGES.map(
    (q, i) => {
      const p = careerProgress[q.id],
        best = careerBestTime(p, careerTimingKey()),
        unlocked = isUnlocked(i, { ...oldCareerProgress, ...careerProgress });
      const chapter =
        i % 3 === 0
          ? `<div class="chapter-heading"><h2>${["第一章 · 世界启程", "第二章 · 机械狂飙", "第三章 · 极境挑战"][Math.floor(i / 3)]}</h2><span>${tr("{n} / {total} 已完成", { n: CHALLENGES.slice(i, i + 3).filter((c) => (careerProgress[c.id]?.stars || 0) > 0).length, total: 3 })}</span></div>`
          : "";
      return `${chapter}<article class="challenge-tile ${unlocked ? "" : "locked"}">${trackImage(getTrack(q.trackId))}<div class="challenge-content"><div class="challenge-meta"><span class="challenge-number">${String(i + 1).padStart(2, "0")}</span><span class="tag">${MODE_NAMES[q.mode]}</span>${!unlocked ? icon("lock") : ""}</div><h2>${q.title}</h2><p>${q.description}</p>${starsMarkup(p?.stars || 0)}<div class="challenge-detail"><span>${tr("{n} 圈", { n: q.laps })} · ${tr(DIFFICULTY_NAMES[q.difficulty])}</span><span>${best !== undefined ? `${tr("最佳")} ${time(best)}` : tr("金星参考 {time} 秒", { time: q.gold })}</span></div><button class="button ${unlocked ? "primary" : "outline"}" data-challenge="${i}" ${unlocked ? "" : "disabled"}><span>${unlocked ? "开始挑战" : "先完成上一关"}</span>${icon(unlocked ? "arrow" : "lock")}</button></div></article>`;
    },
  ).join("")}</section>${
    Object.keys(oldCareerProgress).length
      ? `<section class="glass legacy-records"><h2>0.2 历史生涯</h2><p>旧规则成绩保留，已获得的关卡访问资格延续；本轮成绩按新规则重新记录。</p>${CHALLENGES.filter(
          (q) => oldCareerProgress[q.id],
        )
          .map(
            (q) =>
              `<p>${escape(tr(q.title))} · ${tr("{n} 星", { n: oldCareerProgress[q.id].stars })} · ${time(oldCareerProgress[q.id].time)}</p>`,
          )
          .join("")}</section>`
      : ""
  }${classicHistoryMarkup(progress)}`;
}
function online() {
  const match = { ...matchForSelection(selection), free: freeOnline };
  return `<section class="page-heading"><span class="eyebrow">REAL-TIME MULTIPLAYER / 02</span><h1>一起出发，<br>各凭本事领跑。</h1><p>真实玩家，实时较量。创建房间，把房间码分享给好友。</p></section><section class="online-layout"><div class="glass form-panel">${serviceMarkup(net.serviceState, net.serviceError)}<label for="nickname">你的车手名</label><input id="nickname" maxlength="16" value="${escape(nickname)}" placeholder="输入车手名"><div class="two-col"><div><h3>发起一场比赛</h3><p>普通免费场 2–8 人 · 模拟奖金场 2–4 人</p><label>参赛类型<select data-config="freeOnline"><option value="true" ${freeOnline ? "selected" : ""}>普通免费赛 · 无代币奖励</option><option value="false" ${!freeOnline ? "selected" : ""}>模拟奖金赛 · 每人10 TICKET</option></select></label><button class="button outline" data-action="room-config">赛事设置</button><p>${escape(tr(getTrack(selection.trackId).name))} · ${tr(MODE_NAMES[match.mode])} · ${tr("{n} 圈", { n: match.laps })}</p><button class="button primary" data-action="create">创建房间 <span>＋</span></button></div><div><h3>加入好友的房间</h3><label for="room-code">${tr("房间码或邀请链接")}</label><input id="room-code" value="${escape(roomInput)}" placeholder="${tr("房间码或邀请链接")}" maxlength="2048" autocomplete="off" spellcheck="false" dir="ltr"><button class="button outline" data-action="join">加入房间 <span>→</span></button></div></div><p class="form-note">${tr("好友打开邀请链接，输入车手名后加入。全部准备后自动发车。")}</p></div><aside class="glass race-rules"><span class="eyebrow">RACE BRIEF</span><h2>这一场，为荣誉。</h2><div><span>每人门票</span><b>${freeOnline ? "免费" : "10 TICKET"}</b></div><div><span>本场奖金</span><b>${freeOnline ? "无代币奖励" : "100 points"}</b></div>${freeOnline ? "<div><span>参赛人数</span><b>2–8 人</b></div><p>普通房间保留10分钟。至少2人全部准备后发车，无需扣票，不发放代币奖励。</p>" : "<div><span>4 人场前三名</span><b>60 / 30 / 10%</b></div><p>30秒内凑齐至少2人并全部准备。模拟奖金场此时才扣票，起跑前取消退票。并列车手均分所占名次奖金，不足最小单位的零头留在奖池。</p>"}${simulated()}</aside></section>`;
}
function vault() {
  const p = net.pool;
  return `<section class="page-heading"><span class="eyebrow">THE REWARD VAULT / 03</span><h1>${escape(tr("每一次冲线，都有回响。"))}</h1><p>查看模拟税收积累和比赛奖励。当前所有数字均为测试数据。</p></section><section class="vault-grid"><div class="glass balance-panel"><span class="eyebrow">AVAILABLE PRIZE POOL</span><h2>${p ? money(p.available) : "—"} <small>points</small></h2><div class="pool-stats"><div><span>累计税收入账</span><b>${p ? money(p.received) : "—"}</b></div><div><span>比赛已预留</span><b>${p ? money(p.reserved) : "—"}</b></div><div><span>待车手领取</span><b>${p ? money(p.pending) : "—"}</b></div><div><span>累计已发放</span><b>${p ? money(p.paid) : "—"}</b></div></div><p class="form-note">初始模拟税收基金为 12,840 PONS。每次模拟 5,000 PONS 应税交易额，按 2% 注入 100 PONS；门票收入独立记账。</p><button class="button outline" data-action="tax">模拟一笔税收入账 <span>＋ 100</span></button></div><div class="glass rewards-panel"><span class="eyebrow">YOUR REWARDS</span><h2>我的比赛奖励</h2><div class="balance-row"><span>已领取奖励</span><b>${net.account ? money(net.account.pons) : "—"} points</b></div><div id="claim-list">${claims()}</div></div></section>`;
}
function claims() {
  if (!net.account)
    return `<div class="empty-state"><p>Account unavailable</p><small>Connect to the race service to view your actual rewards.</small></div>`;
  const confirmedClaims = [...claimConfirmations.values()].filter(
    (receipt) => receipt.id === net.account!.id,
  );
  const unclaimed = net.account.pending.filter(
    (award) =>
      !confirmedClaims.some((receipt) => receipt.matchId === award.matchId),
  );
  const confirmations = confirmedClaims
    .map(
      (receipt) =>
        `<p class="claim-confirmation" role="status">${tr("Confirmed claim · {amount} points", { amount: money(receipt.amount) })}<small data-no-i18n dir="ltr">${escape(receipt.matchId)}</small></p>`,
    )
    .join("");
  return (
    confirmations +
    (unclaimed.length
      ? unclaimed
          .map(
            (a) =>
              `<div class="claim-row"><div><b>${money(a.amount)} points</b><small>赛事 ${escape(a.matchId)}</small></div><button class="button primary small" data-claim="${escape(a.matchId)}">领取</button></div>`,
          )
          .join("")
      : confirmations
        ? ""
        : `<div class="empty-state">${icon("trophy")}<p>你的领奖台，虚位以待。</p><small>${tr("Only simulation prize races can award points.")}</small></div>`)
  );
}
function showModal(kind: string) {
  if (kind === "settings" && modal === "pause") returnToPause = true;
  if (kind === "setup" || kind === "room-config") {
    if (![3, 5, 7].includes(selection.opponents)) selection.opponents = 5;
    if (![1, 2, 3].includes(selection.laps)) selection.laps = 3;
  }
  modal = kind;
  if (mode === "solo") {
    paused = true;
    audio.stopCountdown();
  }
  const root = $("#modal-root");
  const markup =
    kind === "setup"
      ? setupMarkup()
      : kind === "room-config"
        ? setupMarkup(true)
        : kind === "settings"
          ? settingsMarkup()
          : kind === "wallet"
            ? walletMarkup()
            : kind === "room"
              ? roomMarkup()
              : helpMarkup();
  root.innerHTML = dialog(
    markup,
    kind === "setup" || kind === "room-config"
      ? "Race setup"
      : kind === "settings"
        ? "Settings"
        : kind === "room"
          ? "Multiplayer room"
          : "KART CLUB",
    kind === "room"
      ? "room-modal"
      : kind === "setup" || kind === "room-config"
        ? "setup-modal"
        : kind === "settings"
          ? "settings-modal"
          : "",
  );
  keys.clear();
  translateScreen(root);
  focusDialog(root);
}
function settingsMarkup() {
  return `<div class="modal-heading"><span class="eyebrow">KART CLUB / PIT STOP</span><h2>SETTINGS</h2><p>Make yourself comfortable on the grid.</p></div><div class="modal-scroll settings-scroll"><section class="settings-group"><h3>Audio</h3><div class="setting-row"><label for="music-volume">Music volume</label><div class="range-control"><input id="music-volume" data-setting="music" type="range" min="0" max="1" step=".01" value="${settings.music}"><output for="music-volume">${Math.round(settings.music * 100)}%</output></div></div><div class="setting-row"><label for="effects-volume">Sound effects</label><div class="range-control"><input id="effects-volume" data-setting="effects" type="range" min="0" max="1" step=".01" value="${settings.effects}"><output for="effects-volume">${Math.round(settings.effects * 100)}%</output></div></div>${button("Restore recommended audio", "audio-defaults", "text-button")}</section><section class="settings-group"><h3>Graphics</h3><div class="setting-row"><label for="quality">Render quality</label><select id="quality" data-setting="quality"><option value="high" ${settings.quality === "high" ? "selected" : ""}>High · Full shadows</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>Performance · Lower resolution</option></select></div><div class="setting-row"><label for="motion">Camera motion</label><div class="range-control"><input id="motion" data-setting="motion" type="range" min="0" max="1" step="0.1" value="${settings.motion ?? 1}"><output for="motion">${Math.round((settings.motion ?? 1) * 100)}%</output></div></div></section><section class="settings-group"><div class="section-heading"><h3>Controls</h3><span>Select a key to rebind</span></div><div class="binding-grid">${Object.entries(
    bindings,
  )
    .map(
      ([action, key]) =>
        `<div><span id="binding-label-${action}">${({ throttle: "Accelerate", brake: "Brake / Reverse", left: "Steer left", right: "Steer right", drift: "Drift", boost: "Nitro", reset: "Reset to checkpoint", item: "Use item" } as Record<string, string>)[action]}</span><button class="key-button" id="binding-key-${action}" data-no-i18n aria-labelledby="binding-label-${action} binding-key-${action}" data-binding="${action}">${keyName(key)}</button></div>`,
    )
    .join(
      "",
    )}</div><p class="form-note">Arrow keys always work. Esc ${mode === "multi" ? "opens the menu; online races continue." : "pauses single player races."}</p>${button("Restore default keys", "defaults", "text-button")}</section><section class="settings-group"><h3>Language</h3><div class="setting-row"><span>Display language</span>${languageMarkup()}</div></section></div><div class="modal-actions"><span class="form-note">Changes saved automatically</span>${button("DONE", "close", "primary")}</div>`;
}
function walletMarkup() {
  return `<span class="eyebrow">SIMULATION ACCOUNT</span><h2>你的模拟账户</h2>${simulated()}<div class="wallet-balances"><div><span>门票余额</span><b>${net.account ? money(net.account.tickets) : "—"} <small>TICKET</small></b></div><div><span>已领取奖励</span><b>${net.account ? money(net.account.pons) : "—"} <small>points</small></b></div></div><p>每个标签页使用独立的模拟车手身份，刷新后保留。本阶段无需连接钱包。</p>${claims()}`;
}
function helpMarkup() {
  return `<span class="eyebrow">DRIVER'S HANDBOOK</span><h2>第一圈，从这里开始。</h2><div class="help-list"><p><kbd data-no-i18n>${keyName(bindings.throttle)}</kbd> / 方向键加速，<kbd data-no-i18n>${keyName(bindings.brake)}</kbd> 刹车与倒车。</p><p>入弯时按住 <kbd data-no-i18n>${keyName(bindings.drift)}</kbd> + 方向键，漂移积累能量。</p><p>集满100点后结束漂移，收成一瓶氮气，最多存2瓶。保持速度和有效侧滑可更快集气；贴墙和低速无法刷气。</p><p>有效漂移后拉正，松开再按油门触发一次小喷。按 <kbd data-no-i18n>${keyName(bindings.boost)}</kbd> 释放，在出弯直道超越对手。</p><p>仅漂移或尚未拉正的漂移余滑中碰撞，才按力度扣除当前气槽12–60点并短暂中断集气。普通行驶碰撞不扣气，已存氮气保留。</p><p>撞墙后可按 <kbd data-no-i18n>${keyName(bindings.reset)}</kbd> 回到已通过的检查点。</p><p>沿赛道前进，顺序通过检查点。回头穿越终点不会增加圈数。</p></div><button class="button primary" data-action="training">进入五步驾驶教学</button><button class="button outline" data-action="corner-practice">弯道训练</button><button class="button outline" data-action="close">准备好了 <span>→</span></button>`;
}
function roomMarkup() {
  return friendRoomMarkup(latest, net.room?.sessionId, net.room?.roomId || '', location.href, content.palette, net.connected);
}
function closeModal() {
  if (modal === "settings" && returnToPause) {
    returnToPause = false;
    rebinding = null;
    modal = "";
    void act("pause");
    return;
  }
  if (modal === "room") {
    void exitRace();
    return;
  }
  const fields = [
    ...document.querySelectorAll<HTMLInputElement>("#nickname,#room-code"),
  ].map((field) => ({ id: field.id, value: field.value }));
  modal = "";
  rebinding = null;
  $("#modal-root").innerHTML = "";
  if (mode === "solo") paused = false;
  if (mode === "lobby") {
    lobby();
    for (const field of fields) {
      const input = document.getElementById(
        field.id,
      ) as HTMLInputElement | null;
      if (input) input.value = field.value;
    }
  }
  keys.clear();
  releaseDialog();
}
function raceUI() {
  hudVfx.reset();
  clearResultVfx();
  releaseDialog(false);
  collisionSounds.reset(localCar.collisionCount);
  audio.resetCollisionSound();
  const raceMode =
    mode === "multi" ? latest?.raceMode || "race" : selection.raceMode;
  app.className = `in-race mode-${raceMode}`;
  app.innerHTML = `<div class="race-top"><div class="race-title hud-panel"><span>${escape(tr(activeTrack.name))}</span><b id="lap-count">LAP 1 / ${targetLaps()}</b></div><div class="race-top-end"><div class="race-time hud-panel"><span>RACE TIME</span><b id="timer" dir="ltr">00:00<small>.00</small></b></div><button class="race-menu icon-button hud-panel" data-action="pause" aria-label="Pause">${icon("pause")}</button></div></div><div class="race-position hud-panel"><label>${raceMode === "practice" ? "PRACTICE" : raceMode === "time" ? "TIME TRIAL" : "POSITION"}</label><div dir="ltr"><b id="position">1</b><span id="position-total">/ ${soloCars.length || latest?.cars.length || 1}</span></div><small id="race-status"></small></div><p id="objective" class="race-objective hud-panel"></p><div id="road-condition" class="road-condition hud-panel" hidden></div><div class="race-bottom"><div class="minimap-box hud-panel"><span>TRACK MAP</span><canvas id="minimap" width="230" height="180"></canvas></div><div class="hud-driving-rail"><div class="race-feedback-stack"><div class="race-feedback hud-panel" id="race-feedback" aria-live="polite"></div><div class="skill-feedback hud-panel" id="skill-feedback"></div></div><div class="driving-instruments hud-panel"><div class="speedometer"><span id="boost-label"></span><div dir="ltr"><b id="speed">0</b><small>KM/H</small></div></div><div class="nitro-box"><div class="energy-label"><b id="nitro-label">DRIFT CHARGE</b><small id="drift-total" dir="ltr">0 / 100</small></div><div class="nitro-track" role="meter" aria-label="Nitro charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="nitro-fill"></i></div><div class="nitro-inventory"><span><span>STORED NITRO</span> <kbd data-no-i18n dir="ltr">${keyName(bindings.boost)}</kbd></span><b id="nitro-count" dir="ltr">0 / 2</b><span class="nitro-charges" dir="ltr"><i class="nitro-charge"></i><i class="nitro-charge"></i></span></div><div class="nitro-status"><span id="nitro-state"></span><small id="nitro-detail"></small></div><div class="nitro-release" hidden><i id="nitro-release-fill"></i></div></div></div></div></div><div class="race-hint"><kbd data-no-i18n dir="ltr">${keyName(bindings.throttle)}</kbd><span>Accelerate</span><kbd data-no-i18n dir="ltr">${keyName(bindings.drift)}</kbd><span>Drift</span><kbd data-no-i18n dir="ltr">${keyName(bindings.reset)}</kbd><span>Reset</span></div><div class="item-hud hud-panel" id="item-hud"></div><div class="countdown" id="countdown"></div><div class="race-sim"><span id="net-ping" dir="ltr"></span></div><div id="modal-root"></div>`;
  translateScreen();
  world.resetCamera();
  world.resetVfx();
  if (mode === "solo") soloVfxRun++;
  previousPoses.clear();
}
function beginSolo(index: number) {
  restoreLobbyShot();
  returnToPause = false;
  releaseDialog(false);
  if (
    index >= 0 &&
    !isUnlocked(index, { ...oldCareerProgress, ...careerProgress })
  ) {
    toast("先完成上一关");
    return;
  }
  clearSoloRun();
  const q = index >= 0 ? CHALLENGES[index] : null;
  if (q)
    selection = {
      trackId: q.trackId,
      raceMode: q.mode,
      difficulty: q.difficulty,
      laps: q.laps,
      opponents: q.opponents,
    };
  activateTrack(selection.trackId);
  startAudio();
  challengeIndex = index;
  challengeRun = q ? new ChallengeRun(q) : null;
  mode = "solo";
  audio.setMusicScene("race");
  audio.prepareDrivingSound();
  modal = "";
  localCar = spawnCar(0, "local", activeTrack, selectedKart, selectedDriver);
  soloCars = [localCar];
  soloProgressAt = {};
  if (selection.raceMode === "race" || selection.raceMode === "items")
    soloCars.push(...createSoloOpponents(selection.opponents,activeTrack,localCar));
  itemWorld =
    selection.raceMode === "items"
      ? createItems(
          soloCars.map((c) => c.id),
          activeTrack,
        )
      : null;
  if (q?.startingItem && itemWorld)
    itemWorld.players.local.held = q.startingItem;
  bestGhost = null;
  const g = stored<unknown>("pons-ghost-v3-" + recordKey(activeTrack.id), null);
  if (validGhost(g, activeTrack.id)) bestGhost = g;
  ghostFrames = [[0, localCar.x, localCar.z, localCar.heading]];
  lapStart = 0;
  lastRecorded = -1;
  observedLap = 0;
  countdown = 3;
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
  returnToPause = false;
  releaseDialog(false);
  keys.clear();
  modal = "";
  paused = true;
  clearSoloRun();
  await net.leave();
  latest = null;
  page = "home";
  activateTrack(selection.trackId);
  lobby();
}
function careerMetrics(rank: number): ChallengeMetrics {
  return {
    finished: localCar.finished,
    time: localCar.finished ? localCar.time : elapsed,
    rank,
    collisions: localCar.collisionCount,
    cleanDrifts: localCar.cleanDrifts,
    miniUses: localCar.miniUses,
    driftChains: localCar.driftChains,
    usefulHits: itemWorld?.players.local?.usefulHits ?? 0,
    blocks: itemWorld?.players.local?.blocks ?? 0,
    failed: challengeRun?.failed ?? false,
    techniqueCorners: challengeRun?.completedCorners.length ?? 0,
  };
}
function eventStatus(): string {
  const q = challengeRun?.challenge;
  if (!q) return "";
  if (challengeRun!.failed) return tr("计时门超时 · 挑战结束");
  const wait = challengeRun!.releaseRemaining(elapsed);
  if (wait > 0) return tr("追击发车倒计时 {n} 秒", { n: wait.toFixed(1) });
  const remaining = challengeRun!.remaining(elapsed);
  if (remaining !== null)
    return tr("计时门 {n} / 3 · 剩余 {time} 秒", {
      n: challengeRun!.gate,
      time: remaining.toFixed(1),
    });
  if (q.event === "technique")
    return tr("指定弯道 {n} / 2 · 小喷 {mini} / 2 · 弯道位置 {targets}%", {
      n: challengeRun!.completedCorners.length,
      mini: localCar.miniUses,
      targets: q
        .techniqueCorners!.map(
          (t, i) =>
            `${Math.round(t * 100)}${challengeRun!.completedCorners.includes(i) ? " ✓" : ""}`,
        )
        .join("% / "),
    });
  if (q.event === "attack" || q.event === "defense" || q.event === "final")
    return tr("有效攻击 {hits} · 成功防御 {blocks}", {
      hits: itemWorld?.players.local?.usefulHits ?? 0,
      blocks: itemWorld?.players.local?.blocks ?? 0,
    });
  if (q.event === "clean")
    return tr("碰撞 {n} / 8", { n: localCar.collisionCount });
  return "";
}
function performanceMarkup() {
  return (
    '<section class="performance-review"><h3>' +
    tr("驾驶复盘") +
    "</h3><p>" +
    tr(drivingAdvice(localCar)) +
    '</p><div class="performance-grid">' +
    [
      [tr("干净漂移"), localCar.cleanDrifts],
      [tr("连续衔接"), localCar.driftChains],
      [tr("错过小喷"), localCar.missedMini],
      [tr("有效攻击"), itemWorld?.players.local?.usefulHits ?? 0],
    ]
      .map(
        ([label, value]) =>
          "<div><span>" + label + "</span><b>" + value + "</b></div>",
      )
      .join("") +
    "</div>" +
    (challengeRun ? '<p class="event-summary">' + eventStatus() + "</p>" : "") +
    "</section>"
  );
}
function openCornerPractice() {
  if (mode === "multi") return;
  if (mode === "solo") {
    paused = true;
    audio.stopCountdown();
  }
  modal = "corner-practice";
  const track = mode === "solo" ? activeTrack : getTrack(selection.trackId);
  $("#modal-root").innerHTML =
    '<div class="modal-backdrop"><section class="modal"><span class="eyebrow">' +
    tr("弯道训练") +
    "</span><h2>" +
    tr("练好一个弯，再快一整圈") +
    "</h2><p>" +
    tr("从弯道前静止出发，每次重练清空资源，练习不计入比赛纪录。") +
    "</p><label>" +
    tr("选择弯道") +
    '<select id="practice-corner">' +
    practiceCorners(track)
      .map(
        (t, i) =>
          '<option value="' +
          i +
          '">' +
          tr(
            track.bends?.[i]?.kind === "V"
              ? "V 弯 · 制动后切入"
              : track.bends?.[i]?.kind === "S"
                ? "S 弯 · 拉正再反打"
                : track.bends?.[i]?.kind === "U"
                  ? "U 弯 · 保持漂移弧线"
                  : "弯道 {n}",
            { n: i + 1 },
          ) +
          " · " +
          Math.round(t * 100) +
          "%</option>",
      )
      .join("") +
    '</select></label><div class="modal-actions"><button class="button outline" data-action="close">' +
    tr("返回") +
    '</button><button class="button primary" data-action="corner-start">' +
    tr("开始弯道训练") +
    "</button></div></section></div>";
  keys.clear();
  translateScreen();
  focusDialog($("#modal-root"));
}
function beginCornerPractice(index: number) {
  const track = mode === "solo" ? activeTrack : getTrack(selection.trackId);
  selection = {
    trackId: track.id,
    raceMode: "practice",
    difficulty: "easy",
    laps: 1,
    opponents: 0,
  };
  beginSolo(-1);
  cornerPractice = new CornerPractice(track, index);
  localCar = cornerPractice.restart();
  localCar.kartId = selectedKart;
  localCar.driverOutfit = selectedDriver.outfitId;
  localCar.driverColor = selectedDriver.colorId;
  soloCars = [localCar];
  bestGhost = null;
  ghostFrames = [];
  countdown = 2;
  audio.resetCountdown();
  raceUI();
}
function soloResult() {
  if (soloDone) return;
  soloDone = true;
  const q = challengeIndex >= 0 ? CHALLENGES[challengeIndex] : null;
  const ranks = classify(soloCars, soloProgressAt);
  const rank = ranks.find((r) => r.car.id === localCar.id)?.rank || 0;
  const uses = itemWorld?.players.local.uses || 0;
  const stars = q
    ? starsFor(
        q,
        localCar.finished ? localCar.time : elapsed,
        rank,
        localCar.driftTotal,
        uses,
        localCar.finished,
        careerMetrics(rank),
      )
    : localCar.finished
      ? 3
      : 0;
  if (q && stars) {
    const old = careerProgress[q.id];
    careerProgress[q.id] = updateCareerProgress(
      old,
      stars,
      localCar.time,
      careerTimingKey(),
    );
    save(careerKey, careerProgress);
  }
  modal = "result";
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal result-modal"><div class="result-scroll"><span class="eyebrow">${tr("比赛成绩")} / ${tr(MODE_NAMES[selection.raceMode])}</span><div class="result-emblem">${icon(stars ? "trophy" : "flag")}</div><h2>${tr(localCar.finished ? "RACE COMPLETE" : "RUN ENDED")}</h2>${q ? `<div class="stars">${[0, 1, 2].map((i) => icon("star", i < stars ? "earned" : "unearned")).join("")}</div><p>${stars ? (challengeIndex < 8 ? "下一关已解锁，可在生涯中继续。" : "九关已完成，继续挑战全金星！") : q.description}</p>` : ""}<div class="result-stats"><div><span>比赛用时</span><b>${time(localCar.finished ? localCar.time : elapsed)}</b></div><div><span>${soloCars.length > 1 ? tr("FINISH POSITION") : tr("干净漂移")}</span><b>${soloCars.length > 1 ? rank || "DNF" : localCar.cleanDrifts}</b></div></div>${soloCars.length > 1 ? `<div class="classification">${ranks.map(({ car: c, rank }) => `<div class="${c.id === "local" ? "you" : ""}"><b>${rank || "—"}</b><span>${c.id === "local" ? "你" : AI_NAMES[c.slot - 1] || c.id}</span><span>${c.finished ? time(c.time) : "DNF · 未完赛"}</span></div>`).join("")}</div>` : ""}${selection.raceMode === "time" && bestGhost ? `<p>${tr("最佳单圈")} ${time(bestGhost.time)}</p>` : ""}<p>碰撞 ${localCar.collisionCount} 次 · 氮气 ${localCar.nitroUses} 次 · 小喷 ${localCar.miniUses} 次</p>${training ? `<p>${training.step === 5 ? "五步教学完成！" : "教学未完成，可重新练习"}</p>` : ""}${performanceMarkup()}${challengeRun?.failed ? `<p class="event-failed">${tr("计时门超时 · 挑战结束")}</p>` : ""}<p class="form-note">单人模式免费 · 不发放代币奖励</p></div><div class="modal-actions result-actions"><button class="button primary" data-action="retry">${cornerPractice ? tr("重练这个弯") : tr("再跑一次 ↗")}</button>${cornerPractice ? `<button class="button outline" data-action="corner-next">${tr("下一个弯道")}</button>` : ""}<button class="button outline" data-action="exit">返回大厅</button></div></section></div>`;
  translateScreen();
  focusDialog($("#modal-root"));
  audio.beep(true);
  showPodium({
    raceId: `solo-${soloVfxRun}`,
    playerId: localCar.id,
    mode: training || cornerPractice ? "practice" : selection.raceMode,
    phase: "finished",
    failed: challengeRun?.failed ?? false,
    results: ranks.map(({ car, rank }) => ({ id: car.id, rank, finished: car.finished })),
  }, q ? stars : 0);
}

function rewardMarkup(s: Snapshot) {
  const playerId = net.room?.sessionId || localCar.id;
  const state = rewardDisplay(
    s,
    playerId,
    net.account,
    claimConfirmations.get(s.raceId),
  );
  const title = {
    cancelled: "Race cancelled",
    free: "Free race · No reward payout",
    pending: "Result pending",
    claimable: "Ready to claim",
    allocated: "Allocated · Credit unconfirmed",
    credited: "Credited to balance",
    none: "No reward for this result",
    unavailable: "Reward status unavailable",
  }[state.kind];
  const detail = {
    cancelled: "No reward is issued for a cancelled race.",
    free: "",
    pending: "Wait for the race service to confirm the result.",
    claimable:
      "Claim the confirmed amount from Rewards to add it to your balance.",
    allocated:
      "Check Rewards for the current claim status. Allocation alone does not confirm wallet credit.",
    credited: "Claim confirmed by the race service.",
    none: "",
    unavailable: "",
  }[state.kind];
  return `<section class="reward-status" data-state="${state.kind}"><span class="eyebrow">${tr("SIMULATED REWARD")}</span><div><h3>${tr(title)}</h3>${state.amount !== null && state.amount > 0 ? `<b dir="ltr">${money(state.amount)} <small>points</small></b>` : ""}</div>${detail ? `<p>${tr(detail)}</p>` : ""}${state.audit === "recorded" || state.audit === "unavailable" ? `<small class="audit-status">${tr(state.audit === "recorded" ? "Race record saved" : "Audit record unavailable")}</small>` : ""}</section>`;
}
function multiResult(s: Snapshot) {
  modal = "result";
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal result-modal"><div class="result-scroll"><span class="eyebrow">RACE CLASSIFICATION</span><h2>${tr(s.phase === "cancelled" ? "Race cancelled" : "RACE COMPLETE")}</h2>${s.reason ? `<p class="result-notice">${escape(tr(s.reason))}</p>` : ""}${s.phase === "cancelled" ? "" : `<div class="classification">${s.results.map((r) => `<div class="${r.id === (net.room?.sessionId || localCar.id) ? "you" : ""}"><b>${r.rank ? String(r.rank).padStart(2, "0") : "—"}</b><span><bdi data-no-i18n>${escape(r.name)}</bdi>${r.id === (net.room?.sessionId || localCar.id) ? " · 你" : ""}</span><span dir="ltr">${r.time === null ? "DNF · " + escape(tr(r.reason || "未完赛")) : time(r.time)}</span>${s.free ? "" : `<strong dir="ltr">${money(r.award)} <small>points</small></strong>`}</div>`).join("")}</div>`}<div id="result-reward">${rewardMarkup(s)}</div></div><div class="modal-actions result-actions">${net.room && net.connected ? `<button class="button primary" data-action="rematch">${tr("和好友再来一局")}</button>` : ""}<button class="button outline" data-action="exit">${tr("BACK TO LOBBY")}${icon("arrow")}</button></div></section></div>`;
  translateScreen();
  focusDialog($("#modal-root"));
  showPodium({
    raceId: s.raceId,
    playerId: net.room?.sessionId || localCar.id,
    mode: s.raceMode,
    phase: s.phase,
    results: s.results.map(r => ({ id: r.id, rank: r.rank, finished: r.time !== null && r.status !== "DNF" })),
  });
  void net
    .refresh()
    .then(() => {
      const reward = document.querySelector<HTMLElement>("#result-reward");
      if (modal === "result" && latest?.raceId === s.raceId && reward) {
        reward.innerHTML = rewardMarkup(s);
        translateScreen(reward);
      }
    })
    .catch(() => {
      // The confirmed result remains readable even when the account service is unavailable.
    });
}
function handleSnapshot(s: Snapshot) {
  latest = s;
  if (activeTrack.id !== s.trackId) activateTrack(s.trackId);
  itemWorld = s.items;
  if (mode === "lobby" && modal === "room") {
    const timer = document.getElementById('room-wait');
    if (timer) timer.textContent = waitingTime(s.waitingRemaining);
    const stamp = JSON.stringify([s.players, s.phase]);
    if (stamp !== roomStamp) {
      roomStamp = stamp;
      showModal("room");
    }
  }
  if (
    (s.phase === "cancelled" || s.phase === "finished") &&
    mode === "lobby" &&
    modal === "room"
  ) {
    multiResult(s);
    return;
  }
  if ((s.phase === "countdown" || s.phase === "racing") && mode !== "multi") {
    clearSoloRun();
    mode = "multi";
    audio.setMusicScene("race");
    audio.prepareDrivingSound();
    paused = false;
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
      correctionDistance = Math.hypot(
        localCar.x - authoritative.x,
        localCar.z - authoritative.z,
      );
      localCar = structuredClone(authoritative);
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
net.onNotice = message => {
  toast(message);
  if (mode === 'lobby' && modal === 'room') showModal('room');
};
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
  translateScreen();
  focusDialog($("#modal-root"));
};

async function act(action: string) {
  if (action === "audio-defaults") {
    Object.assign(settings, DEFAULT_AUDIO);
    audio.setVolumes(settings.music, settings.effects);
    save("pons-settings", settings);
    showModal("settings");
    document.querySelector<HTMLElement>('[data-action="audio-defaults"]')?.focus();
    return;
  }
  if (action === "garage" && mode === "lobby") {
    garageReturnShot = lobbyShot;
    lobbyShot = "side";
    world.setShotMode(lobbyShot);
    page = "garage";
    lobby();
    document.querySelector<HTMLElement>(".garage-panel h1")?.focus();
    return;
  }
  if (action === "corner-practice") {
    openCornerPractice();
    return;
  }
  if (action === "corner-start") {
    beginCornerPractice(
      Number(
        document.querySelector<HTMLSelectElement>("#practice-corner")?.value ??
          0,
      ),
    );
    return;
  }
  if (action === "corner-next") {
    beginCornerPractice(
      ((cornerPractice?.corner ?? 0) + 1) % practiceCorners(activeTrack).length,
    );
    return;
  }
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
  if (action === "training") {
    selection = {
      trackId: "coast",
      raceMode: "practice",
      difficulty: "easy",
      laps: 3,
      opponents: 0,
    };
    beginSolo(-1);
    training = new Training();
    return;
  }
  if (action === "retry") {
    if (cornerPractice) {
      beginCornerPractice(cornerPractice.corner);
      return;
    }
    const wasTraining = !!training;
    beginSolo(challengeIndex);
    if (wasTraining) training = new Training();
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
    if (mode === "solo") {
      paused = true;
      audio.stopCountdown();
    }
    modal = "pause";
    $("#modal-root").innerHTML =
      `<div class="modal-backdrop"><section class="modal pause-modal"><span class="eyebrow">PIT STOP</span><h2>${mode === "solo" ? "稍作停留，精彩继续。" : "比赛仍在进行"}</h2><p>${mode === "solo" ? "计时已暂停。" : "在线比赛不会暂停，车辆将自然减速。"}</p><div class="pause-summary"><span>${escape(tr(activeTrack.name))}</span><b dir="ltr">${time(mode === "solo" ? elapsed : latest?.elapsed || 0)}</b><small>${tr("圈数 {n} / {total}", { n: Math.min(localCar.lap + 1, targetLaps()), total: targetLaps() })}</small></div><div class="stack"><button class="button primary" data-action="close">继续驾驶 →</button><button class="button outline" data-action="settings">操作与声音设置</button>${mode === "solo" ? '<button class="button outline" data-action="retry">重新开始</button><button class="button outline" data-action="corner-practice">弯道训练</button>' : ""}<button class="text-button" data-action="exit">${mode === "multi" ? "退出比赛（未完赛不获奖）" : "返回大厅"}</button></div></section></div>`;
    keys.clear();
    translateScreen();
    focusDialog($("#modal-root"));
    return;
  }
  if (action === "defaults") {
    Object.assign(bindings, defaults);
    localStorage.setItem("pons-controls", JSON.stringify(bindings));
    showModal("settings");
    return;
  }
  if (action === 'copy' || action === 'copy-invite') {
    if (!net.room) return;
    const value = action === 'copy' ? net.room.roomId : invitationUrl(location.href, net.room.roomId);
    if (await copyInvitation(value)) toast(action === 'copy' ? '房间码已复制' : '邀请链接已复制');
    else {
      const input = document.querySelector<HTMLInputElement>('#invite-link');
      input?.focus(); input?.select();
      toast('请复制选中的邀请链接发送给好友');
    }
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
        ($("#nickname") as HTMLInputElement).value.trim() || "Club Racer";
      localStorage.setItem("pons-name", nickname);
      const roomId =
        action === "join"
          ? ($("#room-code") as HTMLInputElement).value.trim()
          : undefined;
      if (action === "join") parseRoomCode(roomId || "");
      toast("正在连接赛事服务器…");
      startAudio();
      latest = null;
      await net.join(nickname, roomId, {
        ...matchForSelection(selection),
        free: freeOnline,
      }, selectedKart, selectedDriver);
      roomInput = '';
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('room');
      history.replaceState(null, '', cleanUrl);
      showModal('room');
    }
    if (action === 'reconnect-service') {
      try { await net.init(); }
      finally { if (mode === 'lobby' && !modal) lobby(); }
    }
    if (action === 'rematch') {
      await net.nextRace(nickname, selectedKart, selectedDriver);
      latest = net.snapshot;
      modal = '';
      page = 'online';
      pending = [];
      lobby();
      showModal('room');
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
document.addEventListener('keydown', event => {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-garage-tab]') : null;
  if (!target || page !== 'garage' || mode !== 'lobby' || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  garageTab = event.key === 'Home' ? 'karts' : event.key === 'End' ? 'driver' : garageTab === 'karts' ? 'driver' : 'karts';
  lobby();
  document.querySelector<HTMLElement>(`[data-garage-tab="${garageTab}"]`)?.focus({preventScroll:true});
}, true);
document.addEventListener("click", (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>("button");
  if (!el) return;
  if (page === 'garage' && mode === 'lobby' && el.dataset.garageTab) {
    garageTab = el.dataset.garageTab === 'driver' ? 'driver' : 'karts';
    lobby();
    document.querySelector<HTMLElement>(`[data-garage-tab="${garageTab}"]`)?.focus({preventScroll:true});
    return;
  }
  if (page === 'garage' && mode === 'lobby' && (el.dataset.driverOutfit || el.dataset.driverColor)) {
    if (el.hasAttribute('disabled')) return;
    if (el.dataset.driverOutfit) {
      const outfit = getDriverOutfit(el.dataset.driverOutfit);
      selectedDriver = {outfitId:outfit.id,colorId:outfit.recommendedColor};
    } else selectedDriver = {...selectedDriver,colorId:sanitizeDriverColor(el.dataset.driverColor)};
    previewCars[0].driverOutfit = selectedDriver.outfitId;
    previewCars[0].driverColor = selectedDriver.colorId;
    const scroll = document.querySelector('.kart-garage-content')?.scrollTop ?? 0;
    const saved = saveDriverAppearance(undefined, selectedDriver);
    lobby();
    const area = document.querySelector('.kart-garage-content');
    if (area) area.scrollTop = scroll;
    const selector = el.dataset.driverOutfit ? `[data-driver-outfit="${selectedDriver.outfitId}"]` : `[data-driver-color="${selectedDriver.colorId}"]`;
    document.querySelector<HTMLElement>(selector)?.focus({preventScroll:true});
    if (!saved) toast('Driver selected for this session. Browser storage is unavailable.');
    return;
  }
  if (el.dataset.kart && page === 'garage' && mode === 'lobby') {
    selectedKart = sanitizeKartId(el.dataset.kart);
    previewCars[0].kartId = selectedKart;
    const scroll = document.querySelector('.kart-garage-content')?.scrollTop ?? 0;
    const saved = saveSelectedKart(undefined, selectedKart);
    lobby();
    const content = document.querySelector('.kart-garage-content');
    if (content) content.scrollTop = scroll;
    document.querySelector<HTMLElement>(`[data-kart="${selectedKart}"]`)?.focus({preventScroll:true});
    if (!saved) toast('Kart selected for this session. Browser storage is unavailable.');
    return;
  }
  if (el.dataset.view && page === "garage") {
    lobbyShot = el.dataset.view;
    world.setShotMode(lobbyShot);
    lobby();
    document.querySelector<HTMLElement>(`[data-view="${lobbyShot}"]`)?.focus();
    return;
  }
  if (el.dataset.mode) {
    selection.raceMode = el.dataset.mode as RaceMode;
    if (![3, 5, 7].includes(selection.opponents)) selection.opponents = 5;
    lobby();
    document
      .querySelector<HTMLElement>(`[data-mode="${selection.raceMode}"]`)
      ?.focus();
    return;
  }
  const rating = parseMapRatingFilter(el.dataset.mapRating);
  if (rating !== undefined) {
    mapRatingFilter = rating;
    showModal(modal);
    document.querySelector<HTMLElement>(`[data-map-rating="${rating}"]`)?.focus();
    return;
  }
  if (el.dataset.track) {
    selection.trackId = el.dataset.track;
    const openModal = modal;
    const scrollTop = document.querySelector(".modal-scroll")?.scrollTop || 0;
    if (!net.room) {
      activateTrack(selection.trackId);
      lobby();
    }
    showModal(openModal);
    const scroll = document.querySelector(".modal-scroll");
    if (scroll) scroll.scrollTop = scrollTop;
    document
      .querySelector<HTMLElement>(`[data-track="${selection.trackId}"]`)
      ?.focus({ preventScroll: true });
    return;
  }
  if (el.dataset.page) {
    if (net.room) {
      toast("请先离开当前房间");
      return;
    }
    page = el.dataset.page as Page;
    lobby();
  } else if (el.dataset.action) {
    const action = el.dataset.action;
    const operation = ["create", "join", "tax", "rematch", "reconnect-service"].includes(action)
      ? withPending(el, () => act(action))
      : act(action);
    void operation.catch((e) => toast((e as Error).message));
  } else if (el.dataset.challenge) beginSolo(Number(el.dataset.challenge));
  else if (el.dataset.binding) {
    rebinding = el.dataset.binding as Binding;
    el.textContent = tr("请按键…");
  } else if (el.dataset.claim)
    void withPending(el, async () => {
      const receipt = await net.request<ClaimConfirmation>(
        "claim/" + el.dataset.claim,
        "POST",
      );
      claimConfirmations.set(receipt.matchId, receipt);
      try {
        await net.refresh();
      } finally {
        // A completed claim keeps its real receipt even if the subsequent balance refresh fails.
        if (modal === "wallet") showModal("wallet");
        else lobby();
      }
      toast(
        tr("Confirmed claim · {amount} points", {
          amount: money(receipt.amount),
        }),
      );
    }).catch((e) => toast(e.message));
});
document.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.id === 'nickname') nickname = el.value;
  if (el.id === 'room-code') roomInput = el.value;
  if (el.hasAttribute("data-language")) {
    const oldModal = modal;
    const fields = [
      ...document.querySelectorAll<HTMLInputElement>("#nickname,#room-code"),
    ].map((n) => ({ id: n.id, value: n.value }));
    setLanguage(el.value);
    if (mode === "lobby") {
      lobby();
      if (oldModal) showModal(oldModal);
      for (const field of fields) {
        const input = document.getElementById(
          field.id,
        ) as HTMLInputElement | null;
        if (input) input.value = field.value;
      }
    } else {
      translateScreen();
      if (oldModal === "settings") showModal("settings");
      hud();
    }
    document
      .querySelectorAll<HTMLSelectElement>("[data-language]")
      .forEach((select) => (select.value = language()));
    return;
  }
  if (el.dataset.config) {
    const k = el.dataset.config;
    if (k === "freeOnline") {
      freeOnline = el.value === "true";
      lobby();
    }
    if (k === "opponents") selection.opponents = Number(el.value);
    else if (k === "trackId") selection.trackId = el.value;
    else if (k === "raceMode") {
      selection.raceMode = el.value as RaceMode;
      if (modal === "setup") {
        const scroll = document.querySelector(".modal-scroll")?.scrollTop || 0;
        showModal("setup");
        const content = document.querySelector(".modal-scroll");
        if (content) content.scrollTop = scroll;
        document
          .querySelector<HTMLElement>("#mode-select")
          ?.focus({ preventScroll: true });
      }
    } else if (k === "difficulty")
      selection.difficulty = el.value as Difficulty;
    else if (k === "laps") selection.laps = Number(el.value);
    return;
  }
  if (!el.dataset.setting) return;
  const output = el.parentElement?.querySelector("output");
  if (output) output.value = `${Math.round(Number(el.value) * 100)}%`;
  const k = el.dataset.setting as keyof Settings;
  if (k === "quality") {
    settings.quality = el.value;
    world.setQuality(el.value);
  } else if (k === "motion") {
    settings.motion = Number(el.value);
    world.motion = settings.motion;
  } else settings[k] = Number(el.value);
  audio.setVolumes(settings.music, settings.effects);
  localStorage.setItem("pons-settings", JSON.stringify(settings));
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Tab" && modal) {
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(
        '.modal button:not(:disabled),.modal input,.modal select,.modal [tabindex="0"]',
      ),
    ].filter((n) => n.getClientRects().length);
    const first = nodes[0],
      last = nodes.at(-1);
    if (
      first &&
      last &&
      (!nodes.includes(document.activeElement as HTMLElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last))
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
  }
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
  if (modal) {
    if (event.code === "Escape" && !event.repeat && modal !== "result") {
      event.preventDefault();
      closeModal();
    }
    return;
  }
  if ((event.target as HTMLElement).matches("input,select,textarea")) return;
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
  if (document.hidden) audio.suspend();
  else audio.resume();
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) { audio.dispose(); hudVfx.dispose(); obstacleHud.destroy(); clearResultVfx(); clearPodium(); }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) audio.resume();
});
function input(): Input {
  if (modal || paused) return { ...EMPTY_INPUT };
  return readInput(keys, bindings);
}
function raceVfxTargets(): CourseTarget[] {
  const q = challengeRun?.challenge;
  return (
    q?.techniqueCorners?.map((t, i) => ({
      t,
      kind: "corner" as const,
      complete: challengeRun!.completedCorners.includes(i),
    })) ??
    q?.sectorSeconds?.map((_, i) => ({
      t: (i + 1) / 3,
      kind: "gate" as const,
      complete: challengeRun!.gate > i + 1,
    })) ??
    (cornerPractice
      ? [{ t: cornerPractice.endProgress, complete: localCar.finished, kind: "practice" as const }]
      : []));
}
function drawMinimap(cars: Car[]) {
  const cv = document.querySelector<HTMLCanvasElement>("#minimap");
  if (!cv) return;
  const ctx = cv.getContext("2d")!;
  const targets = raceVfxTargets();
  paintMinimap(ctx, activeTrack, cars, localCar.id, content.palette, targets);
}
function targetLaps() {
  return mode === "multi" ? latest?.laps || 1 : selection.laps;
}
function qForRun() {
  return challengeIndex >= 0 ? CHALLENGES[challengeIndex] : null;
}
function soloDeadline() {
  const q = challengeIndex >= 0 ? CHALLENGES[challengeIndex] : null;
  return soloSessionDeadline(soloCars, {
    trackId: activeTrack.id,
    laps: selection.laps,
    raceMode: selection.raceMode,
    training: !!training,
    limit: q?.limit,
  });
}
function hud() {
  if (mode === "lobby") return;
  const activeTraining = mode === "solo" ? training : null;
  const c = localCar,
    activeCountdown =
      mode === "solo"
        ? countdown
        : latest?.phase === "countdown"
          ? latest.countdown
          : 0;
  if (!document.hidden && !(mode === "solo" && paused)) {
    audio.countdown(
      mode === "solo"
        ? soloDone
          ? null
          : activeCountdown
        : latest?.phase === "countdown" || latest?.phase === "racing"
          ? activeCountdown
          : null,
    );
  }
  $("#speed").textContent = String(Math.round(Math.abs(c.speed) * 3.6));
  const surfacePoint = trackPoint(c.lastT, activeTrack);
  const lateral =
    (c.x - surfacePoint.x) * Math.cos(surfacePoint.heading) -
    (c.z - surfacePoint.z) * Math.sin(surfacePoint.heading);
  const zone = drivingZoneAt(activeTrack.id, c.lastT, lateral, c.routeBranch);
  const condition = $("#road-condition");
  const widthNow = trackWidth(c.lastT, activeTrack);
  const widthAhead = trackWidth(
    c.lastT + (18 + Math.max(0, c.speed) * 0.8) / activeTrack.length,
    activeTrack,
  );
  const roadHint =
    activeTrack.layout === "ab" && c.lastT >= activeTrack.shortcut[0].t && c.lastT <= activeTrack.shortcut.at(-1)!.t
      ? c.routeBranch === "shortcut" ? "ROUTE B" : "ROUTE A"
      : c.routeBranch === "shortcut"
      ? "近道 · 精准控线"
      : widthAhead < widthNow - 2.5 || widthNow < 10
        ? "前方收窄"
        : widthNow >= 20
          ? "宽道超车区"
          : "";
  condition.hidden = (!zone && !roadHint) || activeCountdown > 0;
  condition.dataset.surface =
    zone?.kind ?? (roadHint === "前方收窄" ? "sand" : "boost");
  condition.textContent = zone
    ? tr({ boost: "加速带", sand: "松沙减速", ice: "冰面低抓地" }[zone.kind])
    : tr(roadHint);
  $("#timer").innerHTML = time(
    mode === "solo" ? elapsed : latest?.elapsed || 0,
  );
  $("#lap-count").textContent = activeTraining
    ? tr("教学 {n} / 5", { n: Math.min(activeTraining.step + 1, 5) })
    : tr("圈数 {n} / {total}", {
        n: Math.min(c.lap + 1, targetLaps()),
        total: targetLaps(),
      });
  const nitro = nitroDisplay(c, mode === "solo" && paused);
  $("#nitro-fill").style.width = `${(nitro.energy / nitro.capacity) * 100}%`;
  $(".nitro-track").setAttribute(
    "aria-valuenow",
    String(Math.round(nitro.energy)),
  );
  $(".nitro-track").setAttribute(
    "aria-valuetext",
    tr("Charge {energy} of {capacity}. {bottles} nitro bottles stored.", {
      energy: Math.floor(nitro.energy),
      capacity: nitro.capacity,
      bottles: nitro.bottles,
    }),
  );
  $("#nitro-fill").classList.toggle("charge-penalty", nitro.interrupted);
  $(".nitro-box").dataset.state = nitro.state;
  $(".nitro-status").hidden = c.finished || c.resetTime > 0;
  $("#nitro-label").textContent = tr("DRIFT CHARGE");
  $("#nitro-state").textContent = tr(
    nitro.paused
      ? "Nitro paused"
      : {
          charging: nitro.interrupted
            ? "Charge interrupted"
            : "Charge building",
          collect: "End drift to collect",
          full: "Inventory full",
          releasing: "Nitro active",
        }[nitro.state],
  );
  $("#nitro-detail").textContent =
    nitro.remaining > 0
      ? tr("{seconds}s remaining", { seconds: nitro.remaining.toFixed(1) })
      : nitro.bottles > 0
        ? tr("{count} ready", { count: nitro.bottles })
        : "";
  $(".nitro-release").hidden = nitro.remaining <= 0;
  $("#nitro-release-fill").style.width = `${nitro.releaseRatio * 100}%`;
  $("#drift-total").textContent =
    `${Math.floor(nitro.energy)} / ${nitro.capacity}`;
  $("#nitro-count").textContent = `${nitro.bottles} / ${nitro.bottleCapacity}`;
  document
    .querySelectorAll<HTMLElement>(".nitro-charge")
    .forEach((charge, i) => charge.classList.toggle("full", i < nitro.bottles));
  $("#boost-label").textContent = tr(
    c.boostTime > 0
      ? "NITRO ON!"
      : c.miniTime > 0
        ? "MINI BOOST!"
        : c.miniWindow > 0
          ? "松开再按油门 · 小喷"
          : "",
  );
  $(".speedometer").classList.toggle("boosting", c.boostTime > 0);
  $(".nitro-box").classList.toggle("ready", nitro.usable);
  document
    .querySelectorAll<HTMLElement>(".speed-bars i")
    .forEach((bar, i) =>
      bar.classList.toggle("lit", i < (Math.abs(c.speed) / 63) * 18),
    );
  const cars = mode === "multi" ? latest?.cars || [] : soloCars;
  const ranks = classify(cars, mode === "solo" ? soloProgressAt : {});
  const classified = ranks.find((r) => r.car.id === c.id);
  const finalResult =
    mode === "multi" ? latest?.results.find((r) => r.id === c.id) : undefined;
  const raceEnded = mode === "solo" ? soloDone : latest?.phase === "finished";
  const position = finalResult
    ? finalResult.rank
    : c.finished
      ? classified?.rank || 0
      : raceEnded
        ? 0
        : Math.max(1, ranks.findIndex((r) => r.car.id === c.id) + 1);
  $("#position").textContent = position ? String(position) : "—";
  $("#position-total").textContent = "/ " + String(cars.length);
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
  $("#objective").textContent = activeTraining
    ? `${Math.min(activeTraining.step + 1, 5)}/5 · ${tr(activeTraining.hints[activeTraining.step]).replace("Shift", keyName(bindings.drift)).replace("Ctrl", keyName(bindings.boost))}`
    : c.finished && !raceEnded
      ? "已完赛，等待其他车手…"
      : cornerPractice
        ? tr("弯道 {n} · 完成后可立即重练", { n: cornerPractice.corner + 1 })
        : q
          ? [tr(q.description), eventStatus()].filter(Boolean).join(" · ")
          : selection.raceMode === "time" && mode === "solo"
            ? bestGhost
              ? tr("最佳单圈") + " " + bestGhost.time.toFixed(2) + " s"
              : "完成一圈即可生成自己的影子"
            : c.finished
              ? "已完赛，等待其他车手…"
              : "";
  const item = itemWorld?.players[c.id];
  const threat = itemWorld ? incomingThreat(itemWorld, c) : null;
  const skill = $("#skill-feedback");
  skill.hidden =
    activeCountdown > 0 ||
    c.finished ||
    (threat === null && c.miniWindow <= 0 && !c.drifting);
  skill.dataset.warning = String(threat !== null);
  skill.textContent =
    threat !== null
      ? tr("导弹来袭 · {n} 秒", { n: threat.toFixed(1) })
      : c.miniWindow > 0
        ? tr("小喷窗口 {n} 秒", { n: c.miniWindow.toFixed(2) })
        : c.drifting
          ? tr("漂移效率 {n}%", {
              n: Math.round(
                driftEfficiency(c.speed, c.slipAngle, c.driftDuration) * 100,
              ),
            })
          : tr("干净漂移 {n} · 连续衔接 {chains}", {
              n: c.cleanDrifts,
              chains: c.driftChains,
            });
  const itemHud = $("#item-hud");
  const markup = item
    ? `${icon(item.held ? ({ boost: "lightning", shield: "shield", missile: "rocket", trap: "warning" } as const)[item.held] : "rocket")}<b>${tr(item.held ? ITEM_NAMES[item.held] : "拾取赛道上的道具箱")}</b><kbd data-no-i18n>${keyName(bindings.item)}</kbd>${item.shield > 0 ? `<small>${tr("能量护盾")} ${item.shield.toFixed(1)} s</small>` : ""}`
    : "";
  if (itemHud.innerHTML !== markup) itemHud.innerHTML = markup;
  $("#race-feedback").textContent =
    c.resetTime > 0
      ? `正在复位 ${c.resetTime.toFixed(1)} 秒 · 计时继续`
      : c.energyLockTime > 0 && c.lastEnergyLoss > 0
        ? tr("碰撞损失 {loss} 点集气", { loss: Math.round(c.lastEnergyLoss) })
        : c.energy >= 100 && c.storedNitro < 2
          ? tr("气槽已满 · 结束漂移收气")
          : c.miniWindow > 0
            ? "拉正成功 · 松开再按油门小喷"
            : c.ghostTime > 0
              ? "重置保护 · 暂时不会与其他车碰撞"
              : item && item.noticeTime > 0
                ? item.notice
                : c.impact > 0.25
                  ? "接触碰撞 · 保持方向"
                  : "";
  if (
    mode === "solo" &&
    selection.raceMode === "time" &&
    !q &&
    !training &&
    currentSplits.length
  ) {
    const i = currentSplits.length - 1,
      delta = sectorComparison(currentSplits, bestGhost?.sectors ?? []);
    $("#objective").textContent +=
      ` · S${i + 1} ${(sectorDuration(currentSplits) ?? 0).toFixed(2)}s${delta === null ? "" : ` / ${tr("差值")} ${delta > 0 ? "+" : ""}${delta.toFixed(2)}s`}`;
  }
  if (
    import.meta.env.DEV &&
    new URLSearchParams(location.search).has("debug")
  ) {
    let el = document.querySelector<HTMLPreElement>("#driving-debug");
    if (!el) {
      el = document.createElement("pre");
      el.id = "driving-debug";
      document.body.append(el);
    }
    const debugClock = mode === "multi" ? (latest?.elapsed ?? 0) : elapsed;
    if (
      !debugSample ||
      debugSample.id !== c.id ||
      debugClock < debugSample.time
    ) {
      debugSample = {
        id: c.id,
        time: debugClock,
        progress: c.progress,
        drift: c.driftTotal,
        forward: 0,
        gain: 0,
      };
    } else if (debugClock - debugSample.time >= 0.25) {
      debugSample = {
        id: c.id,
        time: debugClock,
        progress: c.progress,
        drift: c.driftTotal,
        forward: Math.max(
          0,
          (c.progress - debugSample.progress) * activeTrack.length,
        ),
        gain: Math.max(0, c.driftTotal - debugSample.drift),
      };
    }
    el.textContent = `tick ${latest?.serverTick ?? Math.round(elapsed * 60)} seq ${c.ack}\nspeed ${c.speed.toFixed(2)} slip ${((c.slipAngle * 180) / Math.PI).toFixed(1)}°\nsegment ${c.checkpoint} progress ${c.progress.toFixed(4)}\nΔ0.25s forward ${debugSample.forward.toFixed(2)}m gain ${debugSample.gain.toFixed(2)}\nenergy ${c.energy.toFixed(1)} bottles ${c.storedNitro} ${c.driftState}\nboost ${c.boostTime.toFixed(2)} mini ${c.miniTime.toFixed(2)}\nRTT ${net.ping}ms correction ${correctionDistance.toFixed(2)}m`;
  }
  drawMinimap(cars);
  for (const id of ["objective", "race-feedback", "race-status", "boost-label"])
    localize($("#" + id));
}
function frame(ms: number) {
  requestAnimationFrame(frame);
  // The menu needs fewer GPU frames; physics remains fixed at 60 Hz during races.
  if (mode === "lobby" && ms - previous < 1000 / 30 - 0.5) return;
  const measuredMs = ms - previous;
  const dt = Math.min(measuredMs / 1000 || 0, 0.06);
  previous = ms;
  if (measuredMs > 250) {
    accumulator = 0;
    if (mode === "multi") {
      pending = [];
      keys.clear();
    }
  }
  accumulator += dt;
  while (accumulator >= 1 / 60) {
    accumulator -= 1 / 60;
    for (const c of mode === "solo"
      ? soloCars
      : mode === "multi"
        ? [localCar]
        : [])
      previousPoses.set(c.id, capturePose(c));
    if (mode === "solo" && !paused && !soloDone) {
      if (countdown > 0) countdown -= 1 / 60;
      else {
        const tickDt = Math.min(1 / 60, Math.max(0, soloDeadline() - elapsed));
        const playerFrozenThisTick =
          (challengeRun?.releaseRemaining(elapsed) ?? 0) > 0;
        elapsed += tickDt;
        const commands: Record<string, Input> = { local: input() };
        for (const c of soloCars) {
          if (c.id !== "local")
            commands[c.id] = aiInput(
              c,
              activeTrack,
              selection.difficulty,
              elapsed,
              soloCars,
              itemWorld,
            );
          const before = c.progress;
          if (c.id === "local" && playerFrozenThisTick) {
            c.time = elapsed;
            continue;
          }
          stepCar(c, commands[c.id], tickDt, activeTrack, elapsed - tickDt);
          if (c.id === "local") {
            challengeRun?.update(before, c.progress, elapsed);
            challengeRun?.observeTechnique(c);
          }
          if (c.progress !== before) soloProgressAt[c.id] = elapsed;
          if (
            !training &&
            !cornerPractice &&
            c.lap >= targetLaps() &&
            !c.finished
          ) {
            c.finished = true;
            c.time = c.lastLapTime || elapsed;
            stepCar(c, EMPTY_INPUT, 0, activeTrack);
          }
        }
        separateCars(
          playerFrozenThisTick
            ? soloCars.filter((c) => c.id !== "local")
            : soloCars,
          activeTrack,
          elapsed,
        );
        if (itemWorld)
          stepItems(itemWorld, soloCars, commands, tickDt, activeTrack);
        training?.update(localCar);
        if (cornerPractice?.complete(localCar) && !localCar.finished) {
          localCar.finished = true;
          stepCar(localCar, EMPTY_INPUT, 0, activeTrack);
        }
        if (training?.step === 5) {
          localCar.finished = true;
          stepCar(localCar, EMPTY_INPUT, 0, activeTrack);
        }
        if (
          selection.raceMode === "time" &&
          !qForRun() &&
          !cornerPractice &&
          !training
        ) {
          const lapTime =
            (localCar.lap > observedLap ? localCar.lastLapTime : elapsed) -
            lapStart;
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
              version: 3,
              ...VERSIONS,
              sectors: [...currentSplits, lapTime],
              trackId: activeTrack.id,
              time: lapTime,
              frames: ghostFrames,
            };
            if (
              (!bestGhost || lapTime < bestGhost.time) &&
              validGhost(g, activeTrack.id)
            ) {
              bestGhost = g;
              if (save("pons-ghost-v3-" + recordKey(activeTrack.id), g)) pbVfxSerial++;
            }
            ghostFrames = [[0, localCar.x, localCar.z, localCar.heading]];
            lapStart = localCar.lastLapTime;
            currentSplits = [];
            lastRecorded = 0;
            observedLap = localCar.lap;
          } else {
            const freshSector = localCar.sectorTimes.length > currentSplits.length;
            currentSplits = [...localCar.sectorTimes];
            const delta = freshSector ? sectorComparison(currentSplits, bestGhost?.sectors ?? []) : null;
            if (delta !== null && delta < 0) sectorVfxSerial++;
          }
        }
        if (
          challengeRun?.failed ||
          soloRaceComplete(
            soloCars,
            elapsed,
            soloDeadline(),
            !training &&
              (selection.raceMode === "race" || selection.raceMode === "items"),
          )
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
    cars = page === "garage" ? previewCars.slice(0, 1) : previewCars;
    for (let i = 0; i < cars.length; i++) {
      const anchor = world.previewPoint(),
        direction = lobbyShot === "front" ? -1 : 1,
        p = trackPoint(
          anchor.t + (i * 8 * direction) / activeTrack.length,
          activeTrack,
        ),
        lateral = i === 1 ? -2.6 : i === 2 ? 2.6 : 0,
        c = cars[i];
      c.x = p.x + Math.cos(p.heading) * lateral;
      c.z = p.z - Math.sin(p.heading) * lateral;
      c.heading = p.heading;
      c.speed = 0;
      c.ghostTime = 0;
    }
  } else if (mode === "solo") {
    cars = [...soloCars];
    if (selection.raceMode === "time" && bestGhost) {
      const p = ghostAt(bestGhost, elapsed - lapStart);
      if (p)
        cars.push({
          ...spawnCar(0, "ghost", activeTrack, selectedKart, selectedDriver),
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
      return interpolateCar(c, old, a);
    });
  }
  renderCars = cars;
  const visibleCars = cars.map((c) =>
    (mode === "solo" && c.id !== "ghost") ||
    (mode === "multi" && c.id === localCar.id)
      ? interpolateCar(c, previousPoses.get(c.id), accumulator * 60)
      : c,
  );
  world.renderItems(mode === "lobby" ? null : itemWorld);
  world.render(
    visibleCars,
    localCar.id,
    dt,
    mode === "lobby",
    measuredMs,
    mode === "lobby" || paused ? 0 : input().steer,
    {
      active: mode === "solo" ? countdown <= 0 && !soloDone : mode === "multi" && latest?.phase === "racing",
      paused: mode === "solo" && paused,
      authoritative: mode === "multi" ? latest?.cars ?? [] : soloCars,
      targets: mode === "solo" ? raceVfxTargets() : [],
      failed: challengeRun?.failed ?? false,
      raceClock: mode === "solo" ? elapsed : Math.max(latest?.elapsed ?? 0, localCar.time),
    },
  );
  const confirmedSoundCar = mode === "multi" ? latest?.cars.find(c => c.id === localCar.id) : localCar;
  obstacleHud.update({
    car: localCar, track: activeTrack,
    clock: mode === 'solo' ? elapsed : Math.max(latest?.elapsed ?? 0, localCar.time),
    active: !hideHud && !modal && (mode === 'solo' ? !soloDone : mode === 'multi' && latest?.phase === 'racing'),
    paused: mode === 'solo' && paused,
    countdown: mode === 'solo' ? countdown > 0 : latest?.phase === 'countdown',
  });
  const soundCar = confirmedSoundCar ?? localCar;
  const soundActive = !paused && !soundCar.finished && soundCar.resetTime <= 0 &&
    (mode === "solo" ? countdown <= 0 && !soloDone : mode === "multi" && latest?.phase === "racing");
  const collisionCue = collisionSounds.take(
    localCar,
    confirmedSoundCar ?? null,
    mode === "multi",
    soundActive,
  );
  if (collisionCue) audio.collision(collisionCue.strength, collisionCue.kind);
  if (!soundActive) audio.resetCollisionSound();
  audio.update(
    soundCar.speed,
    soundCar.drifting,
    soundCar.boostTime > 0,
    soundActive,
    { slipAngle: soundCar.slipAngle, nitroUses: soundCar.nitroUses, miniUses: soundCar.miniUses,
      miniBoost: soundCar.miniTime > 0, resetting: soundCar.resetTime > 0 },
  );
  if (ms - hudTick > 70) {
    hudTick = ms;
    hud();
  }
  hudVfx.update({
    raceId: mode === "multi" ? latest?.raceId ?? "" : `solo-${soloVfxRun}`,
    active: mode === "solo" ? !soloDone : mode === "multi" && (latest?.phase === "countdown" || latest?.phase === "racing"),
    paused: mode === "solo" && paused, car: localCar,
    confirmed: mode === "multi" ? latest?.cars.find(c => c.id === localCar.id) ?? null : mode === "solo" ? localCar : null,
    items: mode === "lobby" ? null : itemWorld,
    countdown: mode === "multi" ? latest?.countdown ?? 0 : countdown,
    releaseRemaining: challengeRun?.releaseRemaining(elapsed) ?? 0,
    totalLaps: targetLaps(), trainingStep: training?.step ?? null,
    gate: challengeRun?.gate ?? null, completedCorners: challengeRun?.completedCorners.length ?? 0,
    failed: challengeRun?.failed ?? false, pbSerial: pbVfxSerial, sectorSerial: sectorVfxSerial,
    motion: vfxReducedMotion.matches ? 0 : Number(settings.motion ?? 1),
    quality: settings.quality === "low" ? "low" : "high",
  }, measuredMs / 1000);
  if (ms - pingTick > 2000) {
    pingTick = ms;
    net.measurePing();
  }
}
async function boot() {
  void preloadCountdownVoice();
  setLanguage(language());
  app.innerHTML = `<div class="loading">${brandLogo()}<h2>KART CLUB</h2><p>Preparing your next race…</p></div>`;
  translateScreen();
  try {
    content = await loadContent();
    world = new World($("#scene") as HTMLCanvasElement, content, activeTrack);
    world.setQuality(settings.quality);
    world.motion = Number(settings.motion ?? 1);
    world.setShotMode(marketingShotParam);
    await world.loadAssets();
    lobby();
    if (autoStartRace) {
      beginSolo(-1);
    }
    const unmountUiAudio = mountUiAudio(document, audio, startAudio);
    if (import.meta.env.DEV && marketingQuery.has("audioDebug")) {
      const { mountAudioDebug } = await import("./audio-debug.ts");
      mountAudioDebug(audio);
    }
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) unmountUiAudio();
    });
    if (hideHud) {
      app.style.display = "none";
      const toastEl = $("#toast");
      if (toastEl) toastEl.style.display = "none";
    }
    requestAnimationFrame(frame);
    setTimeout(() => {
      void prepareTrackPreviews();
    }, 600);
    try {
      await net.init();
      if (mode === "lobby" && !modal) lobby();
    } catch {
      if (mode === 'lobby' && !modal) lobby();
      if (page === 'online') toast(net.serviceError);
    }
  } catch (e) {
    app.innerHTML = `<div class="loading"><h2>赛道加载失败</h2><p>${escape((e as Error).message)}</p><p>请检查浏览器 WebGL 支持与 content.json 资源配置。</p><button class="button primary" onclick="location.reload()">重新加载</button></div>`;
    translateScreen();
    console.error(e);
  }
}
void boot();
