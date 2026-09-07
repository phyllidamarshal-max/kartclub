import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { continuousTrack, DEFAULT_TRACK } from "../shared/track.ts";

function adjacentTrack(height: number) {
  const coords = [
    [0, 0],
    [0, 10],
    [4, 10],
    [4, 0],
    [100, 0],
    [100, -100],
    [0, -100],
    [0, 0],
  ];
  const distances = coords
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - coords[i][0], p[1] - coords[i][1]));
  const length = distances.reduce((a, b) => a + b, 0);
  const points = Array.from({ length: 720 }, (_, i) => {
    let d = (i / 720) * length,
      k = 0;
    while (d > distances[k]) d -= distances[k++];
    const a = coords[k],
      b = coords[k + 1],
      f = d / distances[k];
    return {
      x: a[0] + (b[0] - a[0]) * f,
      z: a[1] + (b[1] - a[1]) * f,
      y: k === 2 ? height : 0,
      t: i / 720,
      heading: Math.atan2(b[0] - a[0], b[1] - a[1]),
    };
  });
  return {
    ...DEFAULT_TRACK,
    length,
    points,
    width: 6,
    shortcut: [],
    obstacles: [],
  };
}

for (const height of [0, 20]) {
  test(`AC13 nearby return road at height ${height} cannot replace the current road or its wall`, () => {
    const track = adjacentTrack(height),
      c = spawnCar(0, "adjacent", track);
    Object.assign(c, {
      x: 1.9,
      z: 2,
      lastX: 1.9,
      lastZ: 2,
      progress: 2 / track.length,
      lastT: 2 / track.length,
      speed: 40,
      vx: 40,
      vz: 0,
      heading: Math.PI / 2,
    });
    // Both left and right projections fall inside the original 30-unit window.
    const projection = continuousTrack(2.56, 2, c.lastT, track, "main");
    assert.equal(
      projection.x,
      0,
      "projection must remain on the connected left leg",
    );
    assert.equal(projection.y, 0);
    assert.ok(Math.abs(projection.t * track.length - 2) < 1e-7);
    stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60, track);
    assert.ok(c.x <= 1.95 + 1e-7, `left wall must constrain the car: ${c.x}`);
    assert.ok(
      c.impact > 0,
      "crossing the left boundary must produce a collision",
    );
    assert.ok(Math.abs(c.progress * track.length - 2) < 1e-7);
    assert.equal(c.energy, 0);
  });
}

test("continuous projection follows the connecting bend and can reverse through it", () => {
  const track = adjacentTrack(20);
  let lastT = 2 / track.length;
  const path = [
    [0, 8],
    [0, 9.8],
    [1, 10],
    [3, 10],
    [4, 9.8],
    [4, 7],
    [4, 2],
  ];
  for (const [x, z] of [...path, ...path.slice(0, -1).reverse()]) {
    const p = continuousTrack(x, z, lastT, track, "main");
    assert.ok(
      p.distance < 0.5,
      `connected bend lost at ${x},${z}: ${p.distance}`,
    );
    lastT = p.t;
  }
  assert.ok(Math.abs(lastT * track.length - 8) < 1e-7);
});
