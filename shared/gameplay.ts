import {
  challengeGrade,
  type ChallengeMetrics,
  type EventKind,
} from "./challenge-events.ts";
import { getTrack } from "./track.ts";
import type { Item } from "./items.ts";
export type RaceMode = "race" | "items" | "time" | "practice";
export type Difficulty = "easy" | "normal" | "hard";
export interface MatchConfig {
  trackId: string;
  mode: "race" | "items";
  laps: number;
  free?: boolean;
}
export function validateMatch(raw: Record<string, unknown> = {}): MatchConfig {
  const trackId =
    raw.trackId === undefined ? "tide-coast-v1" : String(raw.trackId);
  getTrack(trackId);
  const mode = raw.mode === undefined ? "race" : raw.mode;
  const laps = raw.laps === undefined ? 1 : raw.laps;
  if (
    (mode !== "race" && mode !== "items") ||
    !Number.isInteger(laps) ||
    Number(laps) < 1 ||
    Number(laps) > 3
  )
    throw Error("比赛模式或圈数无效");
  if (raw.free !== undefined && typeof raw.free !== "boolean")
    throw Error("无效参赛类型");
  return {
    trackId,
    mode,
    laps: Number(laps),
    ...(raw.free === true ? { free: true } : {}),
  };
}
export interface Challenge {
  event?: EventKind;
  startDelay?: number;
  sectorSeconds?: number[];
  techniqueCorners?: readonly number[];
  techniqueRanges?: readonly { start: number; end: number }[];
  startingItem?: Item;
  id: string;
  title: string;
  description: string;
  trackId: string;
  mode: RaceMode;
  difficulty: Difficulty;
  laps: number;
  limit: number;
  gold: number;
  rank: number;
  uses: number;
  drift: number;
  opponents: number;
}
// Nine actual routes; each chapter increases precision, rival count and required technique.
export const CHALLENGES: Challenge[] = [
  {
    id: "coast-race",
    title: "海岸启程 · 干净争先",
    description: "完成三圈并进入前三。加星：达到目标时间；碰撞不超过两次。",
    trackId: "coast",
    mode: "race",
    difficulty: "normal",
    laps: 3,
    rank: 3,
    opponents: 3,
    event: "race",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "coast-time",
    title: "港口时钟 · 分段冲刺",
    description: "一圈通过三个计时门，每段必须在倒计时结束前到达。",
    trackId: "coast-harbor",
    mode: "time",
    difficulty: "normal",
    laps: 1,
    rank: 0,
    opponents: 0,
    event: "sectors",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "coast-items",
    title: "沙漠反击 · 精准出手",
    description:
      "携带一枚导弹出发。两圈进入前三，并用道具成功减速对手至少一次。",
    trackId: "coast-breakwater",
    mode: "items",
    difficulty: "normal",
    laps: 2,
    rank: 3,
    opponents: 3,
    event: "attack",
    startingItem: "missile",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "city-race",
    title: "街区追击 · 延迟出发",
    description: "对手提前四秒出发，两圈追回前三。",
    trackId: "city",
    mode: "race",
    difficulty: "easy",
    laps: 2,
    rank: 3,
    opponents: 5,
    event: "pursuit",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
    startDelay: 4,
  },
  {
    id: "city-time",
    title: "工业驾照 · 漂移衔接",
    description:
      "两圈内在指定的两个弯道各完成一次干净漂移，并使用两次小喷。连弯衔接可获额外星级。",
    trackId: "city-factory",
    mode: "time",
    difficulty: "hard",
    laps: 2,
    rank: 0,
    opponents: 0,
    event: "technique",
    techniqueCorners: getTrack("city-factory")
      .bends!.filter((b) => b.kind === "V" || b.kind === "U")
      .map((b) => b.apex),
    techniqueRanges: getTrack("city-factory")
      .bends!.filter((b) => b.kind === "V" || b.kind === "U")
      .map((b) => ({
        start: b.start,
        end: b.end + 65 / getTrack("city-factory").length,
      })),
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "city-items",
    title: "星环防线 · 防守突围",
    description: "两圈进入前四。用护盾挡住一次攻击可获额外星级。",
    trackId: "city-nightshift",
    mode: "items",
    difficulty: "normal",
    laps: 2,
    rank: 4,
    opponents: 5,
    event: "defense",
    startingItem: "shield",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "mountain-race",
    title: "森林试炼 · 稳定控车",
    description: "三圈进入前三，碰撞不超过八次。",
    trackId: "mountain",
    mode: "race",
    difficulty: "normal",
    laps: 3,
    rank: 3,
    opponents: 3,
    event: "clean",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "mountain-time",
    title: "冰川耐力 · 四圈考验",
    description: "四圈限时挑战，稳定完成长距离驾驶；连弯衔接可获额外星级。",
    trackId: "mountain-pass",
    mode: "time",
    difficulty: "hard",
    laps: 4,
    rank: 0,
    opponents: 0,
    event: "endurance",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
  {
    id: "mountain-items",
    title: "矿山决赛 · 专家争冠",
    description: "三圈击败七名专家夺冠。成功攻击或防御两次可获额外星级。",
    trackId: "mountain-summit",
    mode: "items",
    difficulty: "hard",
    laps: 3,
    rank: 1,
    opponents: 7,
    event: "final",
    limit: 0,
    gold: 0,
    uses: 0,
    drift: 0,
  },
];
// Recalibrated for the longer routes; see track-mastery-report.md for measured runs.
const goldSeconds = [190, 64, 206, 138, 206, 207, 196, 248, 310];
CHALLENGES.forEach((q, i) => {
  q.gold = goldSeconds[i];
});
CHALLENGES[1].sectorSeconds = [26, 26, 26];
CHALLENGES[1].limit = 78;
CHALLENGES[4].limit = 260;
CHALLENGES[7].limit = 330;

export function isUnlocked(
  index: number,
  progress: Record<string, { stars: number }>,
) {
  return (
    index === 0 ||
    (index > 0 &&
      index < CHALLENGES.length &&
      (progress[CHALLENGES[index - 1].id]?.stars || 0) > 0)
  );
}
export function starsFor(
  q: Challenge,
  time: number,
  rank: number,
  drift: number,
  uses: number,
  finished: boolean,
  metrics?: ChallengeMetrics,
) {
  return challengeGrade(
    q,
    metrics ?? {
      finished,
      time,
      rank,
      collisions: 99,
      cleanDrifts: 0,
      miniUses: 0,
      driftChains: 0,
      usefulHits: 0,
      blocks: 0,
      failed: false,
    },
  );
}

export const MODE_NAMES: Record<RaceMode, string> = {
  race: "竞速赛",
  items: "道具赛",
  time: "计时挑战",
  practice: "自由练习",
};
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: "新手",
  normal: "进阶",
  hard: "专家",
};

export function matchForSelection(selection: {
  trackId: string;
  raceMode: RaceMode;
  laps: number;
}): MatchConfig {
  return validateMatch({
    trackId: selection.trackId,
    mode: selection.raceMode === "items" ? "items" : "race",
    laps: [1, 2, 3].includes(selection.laps) ? selection.laps : 3,
  });
}
