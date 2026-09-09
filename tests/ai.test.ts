import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS } from "../shared/track.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";
import { raceHardLimit } from "../shared/rules.ts";
test("AI completes three legal-input laps on each track at every difficulty", () => {
  for (const t of TRACKS)
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const c = spawnCar(1, "ai", t);
      for (let i = 0; i < 60 * raceHardLimit(t.id, 3) && c.lap < 3; i++)
        stepCar(c, aiInput(c, t, difficulty, i / 60), 1 / 60, t);
      assert.equal(
        c.lap,
        3,
        `${t.id}/${difficulty}: ${c.progress} in ${c.time}s`,
      );
      console.log(t.id, difficulty, c.time.toFixed(1));
    }
});
import { separateCars } from "../shared/race.ts";
import { createItems, stepItems } from "../shared/items.ts";
test("four AI race with actual collisions and all item mechanics on every circuit", () => {
  for (const t of TRACKS) {
    const cars = [0, 1, 2, 3].map((i) => spawnCar(i, "ai" + i, t)),
      w = createItems(
        cars.map((c) => c.id),
        t,
      );
    let now = 0;
    while (now < 360 && cars.some((c) => !c.finished)) {
      now += 1 / 60;
      const inputs = Object.fromEntries(
        cars.map((c) => [c.id, aiInput(c, t, "normal", now, cars, w)]),
      );
      for (const c of cars) {
        stepCar(c, inputs[c.id], 1 / 60, t);
        if (c.lap >= 3) c.finished = true;
      }
      separateCars(cars, t);
      stepItems(w, cars, inputs, 1 / 60, t);
    }
    assert.equal(
      cars.filter((c) => c.finished).length,
      4,
      `${t.id}: ${cars.map((c) => c.progress)}`,
    );
    assert.ok(Object.values(w.players).reduce((n, p) => n + p.uses, 0) > 10);
    console.log(
      "four-item-race",
      t.id,
      now.toFixed(1),
      "uses",
      Object.values(w.players).map((p) => p.uses),
    );
  }
});
test("AI reacts to a nearby rival with an overtaking lane and safe closing speed", () => {
  const t = TRACKS[0],
    c = spawnCar(1, "chaser", t),
    front = spawnCar(1, "leader", t);
  c.speed = 30;
  c.vx = Math.sin(c.heading) * 30;
  c.vz = Math.cos(c.heading) * 30;
  front.x = c.x + Math.sin(c.heading) * 4;
  front.z = c.z + Math.cos(c.heading) * 4;
  front.speed = 20;
  const clear = aiInput(c, t, "hard", 10),
    traffic = aiInput(c, t, "hard", 10, [c, front]);
  assert.notEqual(traffic.steer, clear.steer);
  assert.ok(traffic.throttle < 0);
});
test("eight expert AI complete the narrow summit final with overtaking, contacts and items", () => {
  const t = TRACKS.find((t) => t.id === "mountain-summit")!,
    cars = Array.from({ length: 8 }, (_, i) => spawnCar(i, "final" + i, t)),
    w = createItems(
      cars.map((c) => c.id),
      t,
    );
  let now = 0;
  while (now < 360 && cars.some((c) => !c.finished)) {
    now += 1 / 60;
    const inputs = Object.fromEntries(
      cars.map((c) => [c.id, aiInput(c, t, "hard", now, cars, w)]),
    );
    for (const c of cars) {
      stepCar(c, inputs[c.id], 1 / 60, t);
      if (c.lap >= 3) c.finished = true;
    }
    separateCars(cars, t);
    stepItems(w, cars, inputs, 1 / 60, t);
  }
  assert.equal(
    cars.filter((c) => c.finished).length,
    8,
    `final positions ${cars.map((c) => c.progress)}`,
  );
  console.log("eight-car summit final", now.toFixed(1));
});
