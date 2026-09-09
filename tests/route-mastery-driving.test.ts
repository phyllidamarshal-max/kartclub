import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, trackPoint, angleDiff } from "../shared/track.ts";
import { aiInput } from "../shared/ai.ts";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { CornerPractice } from "../client/practice.ts";

for (const track of TRACKS) {
  test(`${track.id}: all offered sections permit a clean drift and recovery from a standing start`, () => {
    for (let index = 0; index < track.bends!.length; index++) {
      const practice = new CornerPractice(track, index),
        car = practice.restart();
      const bend = track.bends![index];
      assert.ok(
        Math.abs((bend.start - practice.startProgress) * track.length - 75) <
          1e-6,
      );
      assert.ok(
        Math.abs((practice.endProgress - bend.end) * track.length - 65) < 1e-6,
      );
      let insideMetres = 0,
        driftingMetres = 0,
        leftDrift = 0,
        rightDrift = 0;
      for (let i = 0; i < 2400 && !practice.complete(car); i++) {
        const before = car.progress;
        stepCar(car, aiInput(car, track, "hard", i / 60), 1 / 60, track);
        const distance =
          Math.max(
            0,
            Math.min(car.progress, bend.end) - Math.max(before, bend.start),
          ) * track.length;
        insideMetres += distance;
        if (car.drifting && Math.abs(car.slipAngle) > 0.12) {
          driftingMetres += distance;
          if (car.slipAngle > 0) leftDrift += distance;
          else rightDrift += distance;
        }
      }
      if (bend.kind === "V" || bend.kind === "U")
        assert.ok(
          driftingMetres / insideMetres > 0.8,
          `${bend.id}: drift does not cover the actual bend`,
        );
      if (bend.kind === "S")
        assert.ok(
          leftDrift > 5 && rightDrift > 5,
          `${bend.id}: both directions must support actual drifting`,
        );
      assert.ok(practice.complete(car), bend.id);
      assert.ok(car.cleanDrifts > 0, `${bend.id}: no actual clean drift`);
      assert.equal(car.collisionCount, 0, bend.id);
      assert.equal(car.resetTime, 0, bend.id);
    }
  });
  if (!track.shortcut.length) continue;
  test(`${track.id}: shortcut keeps a meaningful distance saving and continuous joins`, () => {
    const entry = track.shortcut[0],
      exit = track.shortcut.at(-1)!;
    const length = track.shortcut
      .slice(1)
      .reduce(
        (n, p, i) =>
          n + Math.hypot(p.x - track.shortcut[i].x, p.z - track.shortcut[i].z),
        0,
      );
    assert.ok(length < (exit.t - entry.t) * track.length * 0.9);
    for (const p of [entry, exit]) {
      const q = trackPoint(p.t, track);
      assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 0.001);
      assert.ok(Math.abs(angleDiff(p.heading, q.heading)) < 0.002);
      assert.equal(p.y, q.y);
    }
  });
  test(`${track.id}: choosing the branch through its real entry completes without a reset or wall contact`, () => {
    const entry = track.shortcut[0],
      exit = track.shortcut.at(-1)!,
      car = spawnCar(2, "entry", track);
    Object.assign(car, {
      x: entry.x,
      z: entry.z,
      lastX: entry.x,
      lastZ: entry.z,
      heading: entry.heading,
      lastT: entry.t,
      progress: entry.t,
      checkpoint: Math.floor(entry.t * 12),
      speed: 24,
      vx: Math.sin(entry.heading) * 24,
      vz: Math.cos(entry.heading) * 24,
    });
    let selected = false;
    for (
      let i = 0;
      i < 2400 && car.progress < exit.t + 80 / track.length;
      i++
    ) {
      let input = aiInput(car, track, "hard", i / 60);
      if (car.lastT < exit.t - 1e-5) {
        let nearest = 0;
        for (let j = 1; j < track.shortcut.length; j++)
          if (
            Math.hypot(
              car.x - track.shortcut[j].x,
              car.z - track.shortcut[j].z,
            ) <
            Math.hypot(
              car.x - track.shortcut[nearest].x,
              car.z - track.shortcut[nearest].z,
            )
          )
            nearest = j;
        let distance = 0;
        while (nearest < track.shortcut.length - 1 && distance < 8) {
          const p = track.shortcut[nearest],
            q = track.shortcut[++nearest];
          distance += Math.hypot(p.x - q.x, p.z - q.z);
        }
        const aim = track.shortcut[nearest],
          error = angleDiff(
            Math.atan2(aim.x - car.x, aim.z - car.z),
            car.heading,
          );
        input = {
          ...EMPTY_INPUT,
          throttle: car.speed < 24 ? 1 : -0.3,
          steer: Math.max(-1, Math.min(1, error * 2.8)),
        };
      }
      const progress = car.progress,
        branch = car.routeBranch;
      stepCar(car, input, 1 / 60, track);
      selected ||= car.routeBranch === "shortcut";
      // A physically reached junction rebases the two different distance maps
      // within the existing 30 m local projection window. Ordinary ticks cannot.
      assert.ok(
        car.progress - progress <
          (car.routeBranch === branch ? 2 : 30) / track.length,
        "disconnected progress jump",
      );
    }
    assert.ok(selected, "never entered real branch");
    assert.ok(
      car.progress >= exit.t + 80 / track.length,
      "stalled after shortcut exit",
    );
    assert.equal(car.routeBranch, "main");
    assert.equal(car.collisionCount, 0);
  });
  test(`${track.id}: all exit lanes keep advancing for ninety metres without resetting`, () => {
    const exit = track.shortcut.at(-1)!;
    for (const remaining of [45, 20, 4])
      for (const lane of [-2.4, 0, 2.4]) {
        let i = track.shortcut.length - 1,
          d = 0;
        while (i > 0 && d < remaining) {
          const a = track.shortcut[i],
            b = track.shortcut[--i];
          d += Math.hypot(a.x - b.x, a.z - b.z);
        }
        const p = track.shortcut[i],
          car = spawnCar(1, "exit", track);
        Object.assign(car, {
          x: p.x + Math.cos(p.heading) * lane,
          z: p.z - Math.sin(p.heading) * lane,
          heading: p.heading,
          lastT: p.t,
          progress: p.t,
          checkpoint: Math.floor(p.t * 12),
          routeBranch: "shortcut",
          speed: 30,
          vx: Math.sin(p.heading) * 30,
          vz: Math.cos(p.heading) * 30,
        });
        car.lastX = car.x;
        car.lastZ = car.z;
        for (
          let frame = 0;
          frame < 900 && car.progress < exit.t + 90 / track.length;
          frame++
        ) {
          const input = aiInput(car, track, "hard", frame / 60);
          assert.equal(input.reset, false);
          stepCar(car, input, 1 / 60, track);
        }
        assert.ok(
          car.progress >= exit.t + 90 / track.length,
          `${remaining}m / ${lane}m`,
        );
        assert.equal(car.routeBranch, "main");
        assert.equal(car.collisionCount, 0);
      }
  });
}
