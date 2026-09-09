import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRACKS,
  shortcutWidthAt,
  shortcutSurfaceHeight,
  continuousTrack,
  trackPoint,
  angleDiff,
} from "../shared/track.ts";
import {
  shortcutTrial,
  shortcutMetrics,
} from "../scripts/measure-shortcut-risk.ts";
import { shortcutEntrySafe } from "../shared/ai.ts";
import { spawnCar } from "../shared/race.ts";

for (const track of TRACKS.filter((t) => t.shortcut.length && t.layout !== 'ab')) {
  test(`${track.id}: readable funnels and a narrower skill section share physical widths`, () => {
    const points = track.shortcut;
    const widths = points.map((p) => shortcutWidthAt(p.t, track));
    assert.ok(Math.min(...widths) >= 5.4, "room for the actual kart");
    assert.ok(Math.min(...widths) <= 6.2, "interior precision section");
    assert.ok(widths[0] >= 9 && widths.at(-1)! >= 9, "safe connected mouths");
    for (const p of points) {
      const q = continuousTrack(p.x, p.z, p.t, track, "shortcut");
      assert.ok(Math.abs(q.roadWidth - shortcutWidthAt(q.t, track)) < 1e-7);
    }
    for (const p of [points[0], points.at(-1)!]) {
      const q = trackPoint(p.t, track);
      assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 1e-6);
      assert.ok(Math.abs(angleDiff(p.heading, q.heading)) < 0.002);
      assert.ok(Math.abs(p.y - q.y) < 1e-8);
    }
    const metrics = shortcutMetrics(track);
    assert.ok(metrics.savedPercent >= 12 && metrics.savedPercent <= 35);
    assert.ok(metrics.minRadius >= 20, "no pinched, undrivable corner");
  });
  test(`${track.id}: a clean shortcut saves time, a steering mistake costs time without a reset`, () => {
    const main = shortcutTrial(track, false),
      clean = shortcutTrial(track, true),
      mistake = shortcutTrial(track, true, 0.75);
    assert.ok(
      main.finished && !main.selected && !main.collisions && !main.reset,
      JSON.stringify(main),
    );
    assert.ok(
      clean.finished && clean.selected && !clean.collisions && !clean.reset,
      JSON.stringify(clean),
    );
    assert.equal(clean.branch, "main");
    assert.ok(
      clean.seconds < main.seconds - 0.3,
      JSON.stringify({ main, clean }),
    );
    assert.ok(
      mistake.finished && mistake.selected && !mistake.reset,
      JSON.stringify(mistake),
    );
    assert.ok(
      mistake.seconds > clean.seconds + 0.3,
      JSON.stringify({ clean, mistake }),
    );
  });
  test(`${track.id}: AI declines an occupied mouth or an unsettled approach`, () => {
    const p = trackPoint(track.shortcut[0].t - 8 / track.length, track);
    const car = spawnCar(2, "candidate", track);
    Object.assign(car, {
      x: p.x,
      z: p.z,
      lastT: p.t,
      heading: p.heading,
      speed: 40,
    });
    assert.ok(shortcutEntrySafe(car, track));
    const rival = spawnCar(1, "blocker", track);
    Object.assign(rival, {
      x: p.x + Math.sin(p.heading) * 10,
      z: p.z + Math.cos(p.heading) * 10,
      lastT: p.t + 10 / track.length,
    });
    assert.equal(shortcutEntrySafe(car, track, [rival]), false);
    rival.ghostTime = 1;
    assert.equal(shortcutEntrySafe(car, track, [rival]), true);
    car.heading += 0.6;
    assert.equal(shortcutEntrySafe(car, track), false);
    car.heading = p.heading;
    car.boostTime = 1;
    car.speed = 55;
    assert.equal(shortcutEntrySafe(car, track), false);
  });
  test(`${track.id}: same-level crossings match the main surface under the kart and at road edges`, () => {
    for (const p of track.shortcut)
      for (const side of [-1, 0, 1]) {
        const half = shortcutWidthAt(p.t, track) / 2,
          x = p.x + Math.cos(p.heading) * half * side,
          z = p.z - Math.sin(p.heading) * half * side;
        const main = continuousTrack(x, z, p.t, track, "main");
        if (main.distance < main.roadWidth / 2 && Math.abs(main.y - p.y) < 3) {
          assert.ok(
            Math.abs(shortcutSurfaceHeight(x, z, p.t, p.y, track) - main.y) <
              1e-8,
          );
          if (!side)
            assert.ok(
              Math.abs(p.y - main.y) < 1e-8,
              "kart centre must follow the shared surface",
            );
        }
      }
  });
}
