export interface Content {
  version: string;
  trackName: string;
  subtitle: string;
  kartName: string;
  palette: string[];
  ocean: string;
  grass: string;
  characterModel: string | null;
  sceneModel: string | null;
  musicUrl: string | null;
  modelScale: number;
  roadTexture?: string;
  grassTexture?: string;
  challenges: {
    id: string;
    title: string;
    description: string;
    laps: number;
    limit: number;
    drift: number;
  }[];
}
export function validateContent(value: unknown): Content {
  const c = value as Content;
  const text = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 && v.length < 160;
  const color = (v: unknown) =>
    typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
  const asset = (v: unknown) =>
    v === null ||
    (typeof v === "string" && v.startsWith("/") && !v.startsWith("//"));
  if (
    !c ||
    c.version !== "tide-coast-v1" ||
    !text(c.trackName) ||
    !text(c.subtitle) ||
    !text(c.kartName) ||
    !Array.isArray(c.palette) ||
    c.palette.length !== 4 ||
    !c.palette.every(color) ||
    !color(c.ocean) ||
    !color(c.grass) ||
    !Number.isFinite(c.modelScale) ||
    c.modelScale <= 0 ||
    c.modelScale >= 100 ||
    ![c.characterModel, c.sceneModel, c.musicUrl].every(asset) ||
    ![c.roadTexture, c.grassTexture].every(
      (v) => v === undefined || (typeof v === "string" && asset(v)),
    )
  )
    throw Error(
      "content.json 无效：需要正确版本、名称、4 种十六进制颜色、有效比例和本地资源路径",
    );
  if (
    !Array.isArray(c.challenges) ||
    c.challenges.length !== 3 ||
    new Set(c.challenges.map((q) => q?.id)).size !== 3
  )
    throw Error("content.json 需要 3 个不同 ID 的挑战");
  for (const q of c.challenges)
    if (
      !q ||
      !text(q.id) ||
      !text(q.title) ||
      !text(q.description) ||
      !Number.isInteger(q.laps) ||
      q.laps < 1 ||
      q.laps > 5 ||
      !Number.isFinite(q.limit) ||
      q.limit < 0 ||
      !Number.isFinite(q.drift) ||
      q.drift < 0
    )
      throw Error("关卡配置无效：检查圈数、时间和集气目标");
  return c;
}
