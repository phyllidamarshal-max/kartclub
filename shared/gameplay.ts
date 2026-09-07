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
}
const themes = [
  ["coast", "晴湾", 190, 125],
  ["city", "街区", 225, 150],
  ["mountain", "云岭", 240, 165],
] as const;
export const CHALLENGES: Challenge[] = themes.flatMap(
  ([trackId, name, limit, gold], chapter) => [
    {
      id: `${trackId}-race`,
      title: `${name}杯 · 突围`,
      description: "与三名 AI 竞速，进入前三名。",
      trackId,
      mode: "race",
      difficulty: chapter === 0 ? "easy" : chapter === 1 ? "normal" : "hard",
      laps: 3,
      limit: 0,
      gold,
      rank: 3,
      uses: 0,
    },
    {
      id: `${trackId}-time`,
      title: `${name}计时 · 极限`,
      description: `在 ${limit} 秒内跑完三圈，挑战自己的最佳影子。`,
      trackId,
      mode: "time",
      difficulty: "normal",
      laps: 3,
      limit,
      gold,
      rank: 0,
      uses: 0,
    },
    {
      id: `${trackId}-items`,
      title: `${name}道具 · 反击`,
      description: "使用至少 3 次道具，并进入前两名。",
      trackId,
      mode: "items",
      difficulty: chapter === 0 ? "easy" : chapter === 1 ? "normal" : "hard",
      laps: 3,
      limit: 0,
      gold,
      rank: 2,
      uses: 3,
    },
  ],
);
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
    uses < q.uses
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
