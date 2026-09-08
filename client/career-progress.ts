export interface CareerProgress {
  stars: number;
  time: number;
  timingVersion?: string;
  historicalTimes?: Record<string, number>;
}
export function careerBestTime(
  record: CareerProgress | undefined,
  version: string,
) {
  return record?.timingVersion === version ? record.time : undefined;
}
export function updateCareerProgress(
  previous: CareerProgress | undefined,
  stars: number,
  time: number,
  version: string,
): CareerProgress {
  const historicalTimes = { ...previous?.historicalTimes };
  if (previous && previous.timingVersion !== version)
    historicalTimes[previous.timingVersion ?? "legacy"] = previous.time;
  return {
    stars: Math.max(previous?.stars ?? 0, stars),
    time: Math.min(careerBestTime(previous, version) ?? Infinity, time),
    timingVersion: version,
    historicalTimes,
  };
}
