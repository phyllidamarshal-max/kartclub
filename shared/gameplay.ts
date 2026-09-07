import { getTrack } from "./track.ts";
export type RaceMode = "race" | "items" | "time" | "practice";
export type Difficulty = "easy" | "normal" | "hard";
export interface MatchConfig {
  trackId: string;
  mode: "race" | "items";
  laps: number;
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
  return { trackId, mode, laps: Number(laps) };
}
export interface Challenge {
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
    title: "晴湾杯 · 起步争先",
    description: "三圈竞速进入前两名，累计有效漂移集气 100 点。",
    trackId: "coast",
    mode: "race",
    difficulty: "normal",
    laps: 3,
    limit: 0,
    gold: 112,
    rank: 2,
    uses: 0,
    drift: 100,
    opponents: 3,
  },
  {
    id: "coast-time",
    title: "港口驾照 · 刹车入弯",
    description: "港口折返三圈 ≤ 165 秒，累计漂移集气 160 点。",
    trackId: "coast-harbor",
    mode: "time",
    difficulty: "normal",
    laps: 3,
    limit: 165,
    gold: 135,
    rank: 0,
    uses: 0,
    drift: 160,
    opponents: 0,
  },
  {
    id: "coast-items",
    title: "防波堤 · 连弯反击",
    description: "连续 S 弯道具赛进入前两名，使用至少 4 次道具。",
    trackId: "coast-breakwater",
    mode: "items",
    difficulty: "normal",
    laps: 3,
    limit: 0,
    gold: 145,
    rank: 2,
    uses: 4,
    drift: 0,
    opponents: 3,
  },
  {
    id: "city-race",
    title: "街区杯 · 六车混战",
    description: "对抗五名 AI，三圈进入前两名，漂移集气 200 点。",
    trackId: "city",
    mode: "race",
    difficulty: "normal",
    laps: 3,
    limit: 0,
    gold: 153,
    rank: 2,
    uses: 0,
    drift: 200,
    opponents: 5,
  },
  {
    id: "city-time",
    title: "工业折返 · 精准驾照",
    description: "窄路折返三圈 ≤ 205 秒，累计漂移集气 240 点。",
    trackId: "city-factory",
    mode: "time",
    difficulty: "hard",
    laps: 3,
    limit: 205,
    gold: 173,
    rank: 0,
    uses: 0,
    drift: 240,
    opponents: 0,
  },
  {
    id: "city-items",
    title: "午夜高架 · 道具争冠",
    description: "对抗五名 AI 并夺冠，使用至少 5 次道具。",
    trackId: "city-nightshift",
    mode: "items",
    difficulty: "hard",
    laps: 3,
    limit: 0,
    gold: 163,
    rank: 1,
    uses: 5,
    drift: 0,
    opponents: 5,
  },
  {
    id: "mountain-race",
    title: "云岭杯 · 八车争锋",
    description: "挑战七名专家 AI，进入前两名，漂移集气 260 点。",
    trackId: "mountain",
    mode: "race",
    difficulty: "hard",
    laps: 3,
    limit: 0,
    gold: 153,
    rank: 2,
    uses: 0,
    drift: 260,
    opponents: 7,
  },
  {
    id: "mountain-time",
    title: "云岭九曲 · 耐力驾照",
    description: "连续发卡弯四圈 ≤ 250 秒，漂移集气 360 点。",
    trackId: "mountain-pass",
    mode: "time",
    difficulty: "hard",
    laps: 4,
    limit: 250,
    gold: 215,
    rank: 0,
    uses: 0,
    drift: 360,
    opponents: 0,
  },
  {
    id: "mountain-items",
    title: "巅峰试炼 · 最终决赛",
    description: "在最窄的山路击败七名专家 AI，夺冠并使用 6 次道具。",
    trackId: "mountain-summit",
    mode: "items",
    difficulty: "hard",
    laps: 3,
    limit: 0,
    gold: 178,
    rank: 1,
    uses: 6,
    drift: 0,
    opponents: 7,
  },
];
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
) {
  if (
    !finished ||
    !Number.isFinite(time) ||
    (q.limit > 0 && time > q.limit) ||
    (q.rank > 0 && rank > q.rank) ||
    uses < q.uses ||
    drift < q.drift
  )
    return 0;
  if (time <= q.gold && (q.rank === 0 || rank === 1)) return 3;
  if (time <= q.gold * 1.2 && (q.rank === 0 || rank <= 2)) return 2;
  return 1;
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
