const CLASSIC_CHALLENGES = [
  { id: "tour", title: "初见晴湾" },
  { id: "time", title: "追赶海风" },
  { id: "drift", title: "弯道艺术家" },
] as const;

export function classicRecords(progress: unknown) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress))
    return [];
  return CLASSIC_CHALLENGES.flatMap((challenge) => {
    const record = (progress as Record<string, unknown>)[challenge.id];
    if (!record || typeof record !== "object") return [];
    const { time, drift } = record as Record<string, unknown>;
    if (
      typeof time !== "number" ||
      !Number.isFinite(time) ||
      time < 0 ||
      typeof drift !== "number" ||
      !Number.isFinite(drift) ||
      drift < 0
    )
      return [];
    return [{ ...challenge, time, drift }];
  });
}

export function classicHistoryMarkup(progress: unknown): string {
  const records = classicRecords(progress);
  const time = (seconds: number) => {
    const hundredths = Math.round(seconds * 100);
    return `${String(Math.floor(hundredths / 6000)).padStart(2, "0")}:${String(Math.floor(hundredths / 100) % 60).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}`;
  };
  return `<section aria-labelledby="classic-history-title"><div class="page-heading compact"><span class="eyebrow">CLASSIC / v0.1 HISTORY</span><h2 id="classic-history-title">经典挑战历史 · ${records.length} / 3 已完成</h2><p>保留原版海岸挑战的最佳用时与该次漂移集气纪录。经典成绩独立保存，不计入新版生涯星级。</p></div>${records.length ? `<div class="challenge-grid">${records.map((record) => `<article class="challenge-tile"><span class="tag">✓ 经典已通关</span><h3>${record.title}</h3><div class="challenge-detail"><span>最佳用时 ${time(record.time)}</span><span>漂移集气 ${Math.floor(record.drift)} 点</span></div></article>`).join("")}</div>` : '<p class="form-note">暂无经典挑战纪录。新版生涯从第一关开始。</p>'}</section>`;
}
