import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getTrack,
  trackWidth,
  continuousTrack,
  junctionContains,
} from "../shared/track.ts";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";

for (const [id, index, side] of [
  ["coast-harbor", 140, -1],
  ["coast-breakwater", 136, 1],
  ["city-factory", 147, 1],
  ["city-nightshift", 137, -1],
  ["mountain", 75, -1],
] as const)
  test(`${id} has no invisible side wall inside the open shortcut merge`, () => {
    const track = getTrack(id),
      p = track.shortcut[index];
    const lane = ((track.shortcutWidth ?? 7) / 2 - 1.1) * side;
    const c = spawnCar(0, "merge", track),
      heading = p.heading + (side * Math.PI) / 6;
    Object.assign(c, {
      x: p.x + Math.cos(p.heading) * lane,
      z: p.z - Math.sin(p.heading) * lane,
      heading,
      lastT: p.t,
      progress: p.t,
      routeBranch: "shortcut",
      speed: 24,
      vx: Math.sin(heading) * 24,
      vz: Math.cos(heading) * 24,
    });
    c.lastX = c.x;
    c.lastZ = c.z;
    const expectedX = c.x + c.vx / 60,
      expectedZ = c.z + c.vz / 60;
    const main = continuousTrack(expectedX, expectedZ, p.t, track, "main");
    assert.ok(
      main.distance < trackWidth(main.t, track) / 2 - 1.05,
      "reproduction must fit on the connecting main road",
    );
    const oldX = c.x,
      oldZ = c.z;
    stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60, track);
    assert.equal(c.collisionCount, 0);
    assert.ok(c.speed > 24, "an open merge cannot remove speed");
    assert.ok(
      (c.x - oldX) * Math.cos(p.heading) * side -
        (c.z - oldZ) * Math.sin(p.heading) * side >
        0.15,
    );
  });

test("forest bridge retains real outer boundaries away from the junctions", () => {
  const track = getTrack("mountain"),
    p = track.shortcut[40],
    c = spawnCar(0, "bridge", track);
  Object.assign(c, {
    x: p.x + Math.cos(p.heading) * 4,
    z: p.z - Math.sin(p.heading) * 4,
    lastT: p.t,
    progress: p.t,
    routeBranch: "shortcut",
  });
  c.lastX = c.x;
  c.lastZ = c.z;
  stepCar(c, EMPTY_INPUT, 1 / 60, track);
  assert.ok(continuousTrack(c.x, c.z, p.t, track, "shortcut").distance < 2.46);
});

test("a kart straddling the paved junction is legal even when neither road alone contains its body", () => {
  const track = getTrack("city-factory"),
    x = -126.603198,
    z = 152.472712,
    t = 0.6592;
  for (const branch of ["main", "shortcut"] as const) {
    const p = continuousTrack(x, z, t, track, branch);
    assert.ok(
      p.distance > p.roadWidth / 2 - 1.05,
      "reproduction must span both road strips",
    );
  }
  assert.equal(junctionContains(x, z, t, track, "main", 1.05), true);
  assert.equal(junctionContains(x, z, t, track, "shortcut", 1.05), true);
});

for (const [index, lane] of [
  [70, -2.4],
  [70, 0],
  [70, 2.4],
  [75, 2.4],
  [79, 2.4],
])
  test(`forest exit keeps progressing without reset from bridge point ${index}, lane ${lane}`, () => {
    const track = getTrack("mountain"),
      p = track.shortcut[index],
      c = spawnCar(0, "forest-exit", track);
    Object.assign(c, {
      x: p.x + Math.cos(p.heading) * lane,
      z: p.z - Math.sin(p.heading) * lane,
      heading: p.heading,
      routeBranch: "shortcut",
      speed: 24,
      vx: Math.sin(p.heading) * 24,
      vz: Math.cos(p.heading) * 24,
      lastT: p.t,
      progress: p.t,
    });
    c.lastX = c.x;
    c.lastZ = c.z;
    for (let i = 0; i < 60 * 20; i++) {
      // Driver follows the main-road exit using ordinary inputs; never reset.
      const input = aiInput(
        { ...c, routeBranch: "main" },
        track,
        "normal",
        i / 60,
      );
      stepCar(c, { ...input, reset: false }, 1 / 60, track);
    }
    assert.equal(c.routeBranch, "main");
    assert.ok(c.progress > 0.9, `exit progress frozen at ${c.progress}`);
    assert.ok(c.speed > 10, `stopped behind an invisible wall at ${c.lastT}`);
  });
