import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRACKS,
  getTrack,
  trackWidth,
  trackPoint,
  angleDiff,
  continuousTrack,
} from "../shared/track.ts";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";

const branches = TRACKS.filter((t) => t.shortcut.length && t.id !== "mountain");
for (const track of branches) {
  test(`${track.id} offers a smooth shorter route that can be entered, driven and rejoined`, () => {
    const entry = track.shortcut[0],
      exit = track.shortcut.at(-1)!;
    const length = track.shortcut
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum +
          Math.hypot(p.x - track.shortcut[i].x, p.z - track.shortcut[i].z),
        0,
      );
    assert.ok(length < (exit.t - entry.t) * track.length * 0.8);
    for (const p of [entry, exit]) {
      const main = trackPoint(p.t, track);
      assert.ok(Math.hypot(main.x - p.x, main.z - p.z) < 0.001);
      assert.ok(Math.abs(angleDiff(p.heading, main.heading)) < 0.002);
      assert.equal(p.y, main.y);
    }
    const c = spawnCar(0, "choose", track);
    Object.assign(c, {
      x: entry.x,
      z: entry.z,
      lastX: entry.x,
      lastZ: entry.z,
      heading: entry.heading,
      speed: 24,
      vx: Math.sin(entry.heading) * 24,
      vz: Math.cos(entry.heading) * 24,
      lastT: entry.t,
      progress: entry.t,
      checkpoint: Math.floor(entry.t * 12),
    });
    let used = false,
      furthest = entry.t;
    for (let i = 0; i < 60 * 30 && c.progress < exit.t + 0.02; i++) {
      let input;
      if (c.lastT >= exit.t - 0.0001)
        input = aiInput(c, track, "normal", 10 + i / 60);
      else {
        const nearest = track.shortcut.reduce((a, b) =>
          Math.hypot(a.x - c.x, a.z - c.z) < Math.hypot(b.x - c.x, b.z - c.z)
            ? a
            : b,
        );
        let index = track.shortcut.indexOf(nearest),
          distance = 0;
        while (index < track.shortcut.length - 1 && distance < 7) {
          const a = track.shortcut[index],
            b = track.shortcut[++index];
          distance += Math.hypot(b.x - a.x, b.z - a.z);
        }
        const aim = track.shortcut[index],
          error = angleDiff(Math.atan2(aim.x - c.x, aim.z - c.z), c.heading);
        input = {
          ...EMPTY_INPUT,
          throttle: c.speed < 24 ? 1 : -0.3,
          steer: Math.max(-1, Math.min(1, error * 2.8)),
        };
      }
      const before = c.progress;
      stepCar(c, input, 1 / 60, track);
      used ||= c.routeBranch === "shortcut";
      furthest = Math.max(furthest, c.progress);
      assert.ok(
        c.progress - before < 0.004,
        "junction must not award disconnected progress",
      );
    }
    assert.ok(used, `did not choose branch; furthest=${furthest}`);
    assert.ok(c.progress > exit.t + 0.01, `stalled at ${c.progress}`);
    assert.equal(c.routeBranch, "main");
    assert.ok(
      c.collisionCount <= 2,
      `${c.collisionCount} collisions along a clean route`,
    );
  });
  test(`${track.id} cannot enter its shortcut through a disconnected middle section`, () => {
    const q = track.shortcut[Math.floor(track.shortcut.length / 2)],
      c = spawnCar(0, "teleport", track);
    Object.assign(c, {
      x: q.x,
      z: q.z,
      lastX: q.x,
      lastZ: q.z,
      heading: q.heading,
      lastT: q.t,
      progress: q.t,
    });
    stepCar(c, EMPTY_INPUT, 1 / 60, track);
    assert.equal(c.routeBranch, "main");
    const p = continuousTrack(c.x, c.z, c.lastT, track, "main");
    assert.ok(p.distance <= p.roadWidth / 2);
  });
}

for (const [id, t] of [
  ["coast-harbor", 0.7805556],
  ["city-factory", 0.6569444],
] as const) {
  test(`${id} permits a late choice anywhere inside the open junction`, () => {
    const track = getTrack(id),
      p = trackPoint(t, track),
      half = trackWidth(t, track) / 2 - 1.05;
    const candidates = [-1, 1].map((side) => ({
      x: p.x + Math.cos(p.heading) * half * side,
      z: p.z - Math.sin(p.heading) * half * side,
    }));
    const q = candidates.sort(
      (a, b) =>
        continuousTrack(a.x, a.z, t, track, "shortcut").distance -
        continuousTrack(b.x, b.z, t, track, "shortcut").distance,
    )[0];
    const branch = continuousTrack(q.x, q.z, t, track, "shortcut");
    for (const forward of [true, false]) {
      const c = spawnCar(0, "junction", track),
        heading = branch.heading + (forward ? 0 : Math.PI);
      Object.assign(c, {
        ...q,
        lastX: q.x,
        lastZ: q.z,
        lastT: t,
        progress: t,
        heading,
        speed: 24,
        vx: Math.sin(heading) * 24,
        vz: Math.cos(heading) * 24,
      });
      for (let i = 0; i < 10; i++)
        stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60, track);
      if (forward) {
        assert.equal(c.routeBranch, "shortcut");
        assert.equal(c.collisionCount, 0);
      } else
        assert.equal(
          c.routeBranch,
          "main",
          "reverse motion must not choose a forward shortcut",
        );
    }
  });
}
