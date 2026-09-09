import { readFileSync, writeFileSync } from "node:fs";
import { TRACKS, trackPoint, trackWidth, angleDiff } from "../shared/track.ts";

// A figure from the actual shared geometry, not an alternative game page.
const out = "output/track-design-20260908/";
const measured = JSON.parse(readFileSync(out + "final-ai.json", "utf8"));
const names = [
  "Sunny Bay Circuit",
  "Sunset Cargo Port",
  "Redgold Desert",
  "Neon District",
  "Steelworks",
  "Star Ring Station",
  "Giantwood Forest",
  "Aurora Glacier",
  "Lava Mines",
];
const colors = { V: "#B5683F", S: "#298578", U: "#829B2D", corner: "#173E30" };
const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const summary = TRACKS.map((t, i) => {
  const ds = t.length / t.points.length;
  const maxCurvature = Math.max(
    ...t.points.map(
      (p, j) =>
        Math.abs(
          angleDiff(
            t.points[(j + 1) % t.points.length].heading,
            t.points[(j + t.points.length - 1) % t.points.length].heading,
          ),
        ) /
        (ds * 2),
    ),
  );
  const branch = t.shortcut
    .slice(1)
    .reduce(
      (sum, p, j) =>
        sum + Math.hypot(p.x - t.shortcut[j].x, p.z - t.shortcut[j].z),
      0,
    );
  const bypassed = t.shortcut.length
    ? (t.shortcut.at(-1)!.t - t.shortcut[0].t) * t.length
    : 0;
  const record = measured.records.find(
    (r: { track: string; difficulty: string; personality: string }) =>
      r.track === t.id &&
      r.difficulty === "normal" &&
      r.personality === "technical",
  );
  return {
    id: t.id,
    name: names[i],
    length: t.length,
    minutes: t.raceMinutes,
    normalThreeLaps: record.seconds,
    minimumRadius: 1 / maxCurvature,
    width: [
      Math.min(...t.points.map((p) => trackWidth(p.t, t))),
      Math.max(...t.points.map((p) => trackWidth(p.t, t))),
    ],
    shortcutMetres: branch,
    bypassedMetres: bypassed,
    shortcutSaving: bypassed ? 1 - branch / bypassed : 0,
    bends: t.bends,
  };
});
const cards = TRACKS.map((t, i) => {
  const x = 32 + (i % 3) * 432,
    y = 152 + Math.floor(i / 3) * 326;
  const xs = t.points.map((p) => p.x),
    zs = t.points.map((p) => p.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const scale = Math.min(354 / (maxX - minX), 174 / (maxZ - minZ));
  const ox = x + 208 - ((minX + maxX) / 2) * scale,
    oz = y + 178 - ((minZ + maxZ) / 2) * scale;
  const xy = (p: { x: number; z: number }) =>
    `${(ox + p.x * scale).toFixed(1)},${(oz + p.z * scale).toFixed(1)}`;
  const line = t.points.map(xy).join(" ") + " " + xy(t.points[0]);
  const sections = t
    .bends!.filter((b) => b.kind !== "corner")
    .map((b) => {
      const points = Array.from({ length: 81 }, (_, j) =>
        xy(trackPoint(b.start + ((b.end - b.start) * j) / 80, t)),
      ).join(" ");
      const p = trackPoint(b.apex, t),
        px = ox + p.x * scale,
        pz = oz + p.z * scale;
      return `<polyline points="${points}" fill="none" stroke="${colors[b.kind]}" stroke-width="7" stroke-linecap="round"/><circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="10" fill="${colors[b.kind]}"/><text x="${px.toFixed(1)}" y="${(pz + 4).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">${b.kind}</text>`;
    })
    .join("");
  const start = t.points[0],
    sx = ox + start.x * scale,
    sz = oz + start.z * scale;
  return `<g><rect x="${x}" y="${y}" width="416" height="310" rx="12" fill="#FAF8F1" stroke="#173E30" stroke-opacity=".16"/>
    <text x="${x + 20}" y="${y + 29}" font-weight="700" font-size="18">${String(i + 1).padStart(2, "0")}  ${names[i]}</text>
    <text x="${x + 20}" y="${y + 53}" fill="#5F7065" font-size="13">${(t.length / 1000).toFixed(2)} km / lap · ~${t.raceMinutes} min class</text>
    <polyline points="${line}" fill="none" stroke="#173E30" stroke-width="4.5" stroke-linejoin="round"/>${sections}
    ${t.shortcut.length ? `<polyline points="${t.shortcut.map(xy).join(" ")}" fill="none" stroke="#173E30" stroke-width="2.5" stroke-dasharray="5 4"/>` : ""}
    <rect x="${sx - 4}" y="${sz - 4}" width="8" height="8" fill="#F5F1E6" stroke="#173E30" stroke-width="2"/>
    <text x="${x + 20}" y="${y + 291}" fill="#5F7065" font-size="13">Three-lap reference</text><text x="${x + 394}" y="${y + 291}" text-anchor="end" font-weight="700" font-size="16">${clock(summary[i].normalThreeLaps)}</text></g>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="1190" viewBox="0 0 1360 1190"><rect width="1360" height="1190" fill="#F5F1E6"/><g font-family="Arial,Helvetica,sans-serif" fill="#173E30"><text x="32" y="48" font-size="16" font-weight="700" letter-spacing="2">KART CLUB / ROUTE STUDY</text><text x="32" y="92" font-size="32" font-weight="700">Nine routes. Three corner skills. Two race lengths.</text><text x="32" y="122" font-size="15" fill="#5F7065">Actual routes-0.5.0 geometry · Normal technical controller · Standard vehicle · Three laps</text>${cards}<g font-size="14"><text x="32" y="1161" fill="${colors.V}">V  Brake and turn in</text><text x="245" y="1161" fill="${colors.S}">S  Recover and reverse steer</text><text x="518" y="1161" fill="${colors.U}">U  Hold a steady drift</text><text x="762" y="1161" fill="#5F7065">Dashed: shortcut · Square: start · Each panel scaled independently</text></g></g></svg>`;
writeFileSync(out + "route-layouts.svg", svg);
writeFileSync(out + "layout-summary.json", JSON.stringify(summary, null, 2));
console.log(
  `Wrote ${summary.length} actual route diagrams and their measurements.`,
);
