import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movingObstaclesAt,
  movingObstacleFootprint,
  movingObstacleClearance,
  resolveMovingObstacles,
  constrainMovingObstacles,
  type MovingObstacleSpec,
} from "../shared/moving-obstacles.ts";

const spec = (kind: MovingObstacleSpec["kind"]): MovingObstacleSpec => ({
  id: kind,
  kind,
  x: 0,
  y: 1,
  z: 0,
  heading: 0,
  radius: kind === "spinner" ? 3.5 : kind === "minecart" ? 2.1 : 2.4,
  amplitude: kind === "spinner" ? 0 : 4.5,
  period: kind === "spinner" ? 10 : 14,
  phase: 0,
});
const pose = (s: MovingObstacleSpec, t: number) =>
  movingObstaclesAt({ movingObstacles: [s] }, t)[0];
const car = (x: number, z: number, vx = 0, vz = 0) => ({
  x,
  z,
  vx,
  vz,
  speed: vz,
  heading: 0,
});
const near = (a: number, b: number, eps = 1e-7) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("spinner rotates continuously about its fixed center with a fitted padded arm", () => {
  const s = { ...spec("spinner"), amplitude: 7, heading: 0.31, phase: 0.4 };
  for (const t of [-20.01, -2.3, 0, 2.5, 10.01, 200.3]) {
    const p = pose(s, t),
      q = pose(s, t + s.period);
    near(p.x, s.x);
    near(p.z, s.z);
    near(p.vx, 0);
    near(p.vz, 0);
    near(p.lift, 0);
    near(p.yawRate, (2 * Math.PI) / s.period);
    near(
      Math.sin(p.facing - s.heading - s.phase - (t * 2 * Math.PI) / s.period),
      0,
    );
    near(Math.sin(p.facing - q.facing), 0);
    near(movingObstacleFootprint(p).halfLength, 0.8 * s.radius);
    near(movingObstacleFootprint(p).radius, 0.2 * s.radius);
  }
});

for (const kind of ["minecart", "hauler"] as const) {
  test(`${kind} reverses with C2 endpoint dwells and fixed world orientation`, () => {
    const s = { ...spec(kind), heading: 0.73 },
      dwell = kind === "minecart" ? 0.12 : 0.2;
    for (const fraction of [
      -1.9,
      -0.4,
      0,
      0.05,
      dwell,
      0.31,
      0.5,
      0.55,
      0.5 + dwell,
      0.88,
      1,
    ]) {
      const t = fraction * s.period,
        p = pose(s, t),
        q = pose(s, t + s.period);
      near(p.facing, s.heading + Math.PI / 2);
      near(p.yawRate, 0);
      near(p.vx, (pose(s, t + 1e-5).x - pose(s, t - 1e-5).x) / 2e-5, 1e-5);
      near(p.vz, (pose(s, t + 1e-5).z - pose(s, t - 1e-5).z) / 2e-5, 1e-5);
      near(p.x, q.x);
      near(p.vx, q.vx);
      near(p.stride, p.offset + s.amplitude);
    }
    near(pose(s, 0.05 * s.period).offset, -s.amplitude);
    near(pose(s, 0.55 * s.period).offset, s.amplitude);
    near(pose(s, 0.05 * s.period).vx, 0);
    near(pose(s, 0.55 * s.period).vx, 0);
    assert.ok(pose(s, 0.3 * s.period).vx > 0);
    assert.ok(pose(s, 0.8 * s.period).vx < 0);
    near(
      movingObstacleFootprint(pose(s, 0)).halfLength,
      (kind === "minecart" ? 0.45 : 0.3) * s.radius,
    );
    near(
      movingObstacleFootprint(pose(s, 0)).radius,
      (kind === "minecart" ? 0.55 : 0.7) * s.radius,
    );
    for (const f of [0, dwell, 0.5, 0.5 + dwell, 1]) {
      const a = pose(s, f * s.period - 1e-4),
        b = pose(s, f * s.period + 1e-4);
      near(a.x, b.x);
      near(a.vx, b.vx);
      near((b.vx - a.vx) / 2e-4, 0, 0.001);
    }
  });
}

test("spinner hits a stationary kart inside a complete rotation with both endpoint poses clear", () => {
  const s = spec("spinner"),
    track = { movingObstacles: [s] };
  for (const dt of [2.5, 10, 20]) {
    const body = car(4, 0),
      replay = { ...body };
    assert.ok(movingObstacleClearance(body, pose(s, 0)).distance > 0);
    const hits = resolveMovingObstacles(body, track, 0, dt, 4, 0);
    assert.ok(hits.length > 0, `missed rotation over ${dt}`);
    assert.deepEqual(hits, resolveMovingObstacles(replay, track, 0, dt, 4, 0));
    assert.deepEqual(body, replay);
    assert.ok(movingObstacleClearance(body, pose(s, dt)).distance >= -1e-5);
  }
});

for (const kind of ["spinner", "minecart", "hauler"] as const) {
  test(`${kind} fitted flank permits tangent passes while a fast kart hits the solid nose`, () => {
    for (const heading of [0, 0.4, 1.3, 2.9]) {
      const s = {
        ...spec(kind),
        amplitude: 0,
        period: 0,
        heading,
        phase: Math.PI / 2,
      };
      const track = { movingObstacles: [s] },
        shape = movingObstacleFootprint(pose(s, 0));
      const make = (x: number, z: number, vx: number, vz: number) => ({
        ...car(
          x * Math.cos(heading) + z * Math.sin(heading),
          -x * Math.sin(heading) + z * Math.cos(heading),
          vx * Math.cos(heading) + vz * Math.sin(heading),
          -vx * Math.sin(heading) + vz * Math.cos(heading),
        ),
        heading,
      });
      for (const gap of [0, 0.015]) {
        const z = -2.12 - shape.radius - gap,
          before = make(-100, z, 1000, 0),
          after = make(100, z, 1000, 0),
          expected = { ...after };
        assert.deepEqual(
          resolveMovingObstacles(after, track, 0, 0.2, before.x, before.z),
          [],
        );
        assert.deepEqual(after, expected);
      }
      const before = make(-100, 0, 1000, 0),
        after = make(100, 0, 1000, 0);
      assert.equal(
        resolveMovingObstacles(after, track, 0, 0.2, before.x, before.z).length,
        1,
      );
      near(
        after.x * Math.cos(heading) - after.z * Math.sin(heading),
        -1.6 - shape.halfLength - shape.radius,
        2e-5,
      );
      assert.ok(movingObstacleClearance(after, pose(s, 0.2)).distance >= -1e-5);
    }
  });

  test(`${kind} handles clock reset, disabled motion, invalid steps and overlap recovery`, () => {
    const s = spec(kind),
      track = { movingObstacles: [s] },
      original = pose(s, 0);
    for (const t of [
      -Number.MAX_VALUE,
      Number.MAX_VALUE,
      NaN,
      Infinity,
      -Infinity,
    ]) {
      const a = pose(s, t);
      assert.deepEqual(a, pose(s, t));
      for (const key of [
        "x",
        "y",
        "z",
        "vx",
        "vz",
        "facing",
        "yawRate",
        "stride",
      ] as const)
        assert.ok(Number.isFinite(a[key]));
    }
    assert.deepEqual(original, pose(s, 0));
    for (const period of [0, -1]) {
      const disabled = { ...s, period };
      assert.deepEqual(pose(disabled, -100), pose(disabled, 100));
      near(pose(disabled, 20).vx, 0);
      near(pose(disabled, 20).yawRate, 0);
    }
    const body = car(original.x, original.z, 5, -4),
      before = { ...body };
    for (const dt of [0, -1, NaN, Infinity]) {
      assert.deepEqual(
        resolveMovingObstacles(body, track, 0, dt, body.x, body.z),
        [],
      );
      assert.deepEqual(body, before);
    }
    assert.equal(constrainMovingObstacles(body, track, 0, s.heading), true);
    assert.ok(movingObstacleClearance(body, original).distance >= -1e-6);
    near(body.vx, before.vx);
    near(body.vz, before.vz);
    near(body.speed, before.speed);
    assert.equal(constrainMovingObstacles(body, track, 0, s.heading), false);
  });
}

for (const kind of ["minecart", "hauler"] as const) {
  test(`${kind} contacts a parked kart in either direction and preserves clearance each tick`, () => {
    const s = { ...spec(kind), amplitude: 9 },
      track = { movingObstacles: [s] };
    for (const start of [0, s.period / 2]) {
      const a = car(0, 0),
        b = { ...a };
      assert.ok(movingObstacleClearance(a, pose(s, start)).distance > 0);
      const hits = resolveMovingObstacles(a, track, start, s.period / 2, 0, 0);
      assert.ok(hits.length > 0);
      assert.deepEqual(
        hits,
        resolveMovingObstacles(b, track, start, s.period / 2, 0, 0),
      );
      assert.deepEqual(a, b);
      assert.ok(
        movingObstacleClearance(a, pose(s, start + s.period / 2)).distance >=
          -1e-5,
      );
      assert.ok(start === 0 ? a.vx > 0 : a.vx < 0);
    }
    const body = car(0, 0);
    let hits = 0;
    for (let i = 0; i < s.period * 60; i++) {
      const x = body.x,
        z = body.z;
      body.x += body.vx / 60;
      body.z += body.vz / 60;
      hits += resolveMovingObstacles(body, track, i / 60, 1 / 60, x, z).length;
      assert.ok(
        movingObstacleClearance(body, pose(s, (i + 1) / 60)).distance >= -1e-5,
      );
    }
    assert.ok(hits > 0);
  });
}

test("spinner full-cycle ticking clears contacts without phantom hits outside its swept envelope", () => {
  const s = spec("spinner"),
    track = { movingObstacles: [s] },
    body = car(4, 0),
    clear = car(6.1, 0);
  let hits = 0;
  assert.deepEqual(
    resolveMovingObstacles(clear, track, 0, s.period, clear.x, clear.z),
    [],
  );
  near(clear.x, 6.1);
  near(clear.z, 0);
  for (let i = 0; i < 600; i++) {
    const x = body.x,
      z = body.z;
    body.x += body.vx / 60;
    body.z += body.vz / 60;
    hits += resolveMovingObstacles(body, track, i / 60, 1 / 60, x, z).length;
    assert.ok(
      movingObstacleClearance(body, pose(s, (i + 1) / 60)).distance >= -1e-5,
    );
  }
  assert.ok(hits > 0);
});

test("rail crossings exactly tangent to the kart rear do not damage or move it", () => {
  for (const kind of ["minecart", "hauler"] as const) {
    const s = { ...spec(kind), amplitude: 9 };
    const z = 1.79 + movingObstacleFootprint(pose(s, 0)).radius;
    const body = car(0, z),
      before = { ...body };
    assert.deepEqual(
      resolveMovingObstacles(body, { movingObstacles: [s] }, 0, s.period, 0, z),
      [],
    );
    assert.deepEqual(body, before);
  }
});

test("overlapping new mechanism footprints recover a coincident kart deterministically", () => {
  const track = {
    movingObstacles: (["spinner", "minecart", "hauler"] as const).map(
      (kind) => ({
        ...spec(kind),
        amplitude: 0,
        period: 0,
        phase: Math.PI / 2,
      }),
    ),
  };
  const body = car(0, 0, 4, 8),
    replay = { ...body };
  assert.equal(constrainMovingObstacles(body, track, 0), true);
  assert.equal(constrainMovingObstacles(replay, track, 0), true);
  assert.deepEqual(body, replay);
  for (const p of movingObstaclesAt(track, 0))
    assert.ok(movingObstacleClearance(body, p).distance >= -1e-6);
  near(body.vx, 4);
  near(body.vz, 8);
});
