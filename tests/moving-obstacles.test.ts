import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DEFAULT_TRACK, type Track } from "../shared/track.ts";
import { KART_FOOTPRINT } from "../shared/kart-contact.ts";
import * as movingObstacleModule from "../shared/moving-obstacles.ts";
import {
  MOVING_OBSTACLE_KART_RADIUS,
  movingObstacleClearance,
  movingObstacleFootprint,
  pendulumLength,
  movingObstaclesAt,
  resolveMovingObstacles,
  type MovingObstacleSpec,
} from "../shared/moving-obstacles.ts";
import { buildMovingObstacles } from "../client/moving-obstacles.ts";

const spec: MovingObstacleSpec = {
  id: "test-shuttle",
  kind: "shuttle",
  x: 0,
  y: 1,
  z: 0,
  heading: 0,
  radius: 1.5,
  amplitude: 4,
  period: 8,
  phase: 0,
};
const track = (obstacle = spec): Track => ({
  ...DEFAULT_TRACK,
  movingObstacles: [obstacle],
});
const car = (x: number, z: number, vx = 0, vz = 0) => ({
  x,
  z,
  vx,
  vz,
  speed: vz,
  heading: 0,
});
const near = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);

test("obstacle clearance encloses every nose and wheel support point at every heading", () => {
  assert.ok(MOVING_OBSTACLE_KART_RADIUS >= 2.4);
  assert.ok(MOVING_OBSTACLE_KART_RADIUS < 2.5);
  for (const heading of [0, 0.17, 1.1, Math.PI / 2, 2.7]) {
    for (const [x, z] of KART_FOOTPRINT) {
      const rotatedX = x * Math.cos(heading) + z * Math.sin(heading);
      const rotatedZ = -x * Math.sin(heading) + z * Math.cos(heading);
      assert.ok(
        Math.hypot(rotatedX, rotatedZ) <= MOVING_OBSTACLE_KART_RADIUS + 1e-10,
      );
    }
  }
});

test("clock-only recovery separates a pushed kart without velocity, damage, or clock changes", () => {
  assert.equal(
    typeof movingObstacleModule.constrainMovingObstacles,
    "function",
  );
  const t = track(),
    clock = 1.73,
    pose = movingObstaclesAt(t, clock)[0];
  const body = {
    ...car(pose.x + 0.4, pose.z - 0.3, -15, 23),
    energy: 82,
    collisionCount: 4,
    impact: 0.17,
  };
  const before = { ...body };
  assert.equal(
    movingObstacleModule.constrainMovingObstacles(body, t, clock),
    true,
  );
  assert.ok(movingObstacleClearance(body, pose).distance >= 0);
  for (const key of [
    "vx",
    "vz",
    "speed",
    "heading",
    "energy",
    "collisionCount",
    "impact",
  ] as const)
    assert.equal(body[key], before[key]);
  const recovered = { ...body };
  assert.equal(
    movingObstacleModule.constrainMovingObstacles(body, t, clock),
    false,
  );
  assert.deepEqual(body, recovered);
  assert.deepEqual(movingObstaclesAt(t, clock)[0], pose);
});

test("clock-only coincident recovery is finite and clears the complete kart footprint", () => {
  assert.equal(
    typeof movingObstacleModule.constrainMovingObstacles,
    "function",
  );
  const t = track({ ...spec, heading: 1.7 }),
    clock = 2.31,
    pose = movingObstaclesAt(t, clock)[0];
  const body = car(pose.x, pose.z, 12, -6);
  assert.equal(
    movingObstacleModule.constrainMovingObstacles(body, t, clock),
    true,
  );
  for (const value of Object.values(body)) assert.ok(Number.isFinite(value));
  near(movingObstacleClearance(body, pose).distance, 0, 1e-4);
  near(body.vx, 12);
  near(body.vz, -6);
});

test("obstacle phase, analytic velocity, and full-period repeat share one clock", () => {
  const t = track();
  const [zero] = movingObstaclesAt(t, 0),
    [quarter] = movingObstaclesAt(t, 2),
    [half] = movingObstaclesAt(t, 4);
  near(zero.x, 0);
  near(zero.vx, Math.PI);
  near(quarter.x, 4);
  near(quarter.vx, 0);
  near(half.x, 0);
  near(half.vx, -Math.PI);
  const rotated = movingObstaclesAt(
    track({ ...spec, heading: Math.PI / 2 }),
    2,
  )[0];
  near(rotated.x, 0);
  near(rotated.z, -4);
  for (const clock of [0.17, 2.9, 13.1]) {
    const a = movingObstaclesAt(t, clock)[0],
      b = movingObstaclesAt(t, clock + spec.period)[0];
    for (const key of ["x", "y", "z", "vx", "vz"] as const)
      near(a[key], b[key]);
  }
});

test("fast karts cannot tunnel through a barrier even with both endpoints clear", () => {
  const t = track({ ...spec, amplitude: 0 });
  const body = car(0, 25, 0, 250);
  const impacts = resolveMovingObstacles(body, t, 0, 0.2, 0, -25);
  assert.ok(body.z <= -spec.radius - 2.12 + 1e-5);
  assert.ok(body.vz <= 1e-7);
  assert.equal(impacts.length, 1);
  assert.ok(impacts[0] > 0 && impacts[0] <= 1);
});

test("a moving barrier strikes a stationary kart during its sweep", () => {
  const body = car(0, 0),
    t = track({ ...spec, amplitude: 7, phase: -Math.PI / 2 });
  const impacts = resolveMovingObstacles(body, t, 0, 4, 0, 0);
  const obstacle = movingObstaclesAt(t, 4)[0];
  assert.ok(impacts.length >= 1);
  assert.ok(body.vx > 0);
  assert.ok(movingObstacleClearance(body, obstacle).distance >= -1e-4);
  assert.ok(
    body.x >= obstacle.x + spec.radius + 1.6 - 1e-4,
    "an accelerating solid must keep the kart on the original contact side",
  );
});

test("tangent, outward, and nearby clear travel do not produce repeat damage", () => {
  const t = track({ ...spec, amplitude: 0 });
  const radius = spec.radius + 1.6;
  for (const body of [car(radius, 4, 0, 20), car(radius + 4, 0, 20, 0)]) {
    assert.deepEqual(resolveMovingObstacles(body, t, 0, 0.2, radius, 0), []);
  }
  const passing = car(radius + 0.02, 25, 0, 250);
  assert.deepEqual(
    resolveMovingObstacles(passing, t, 0, 0.2, radius + 0.02, -25),
    [],
  );
  near(passing.z, 25);
});

test("a moving barrier passing exactly tangent to a parked kart causes no contact", () => {
  const radius = spec.radius + 1.79;
  const body = car(0, radius);
  const t = track({ ...spec, amplitude: 7, phase: -Math.PI / 2 });
  assert.deepEqual(resolveMovingObstacles(body, t, 0, 4, 0, radius), []);
  near(body.x, 0);
  near(body.z, radius);
});

test("zero time and empty tracks leave bodies unchanged without events", () => {
  const body = car(0, 0, 12, 8),
    before = { ...body };
  assert.deepEqual(resolveMovingObstacles(body, track(), 1, 0, -2, 0), []);
  assert.deepEqual(body, before);
  assert.deepEqual(movingObstaclesAt(DEFAULT_TRACK, 1), []);
  assert.deepEqual(
    resolveMovingObstacles(body, DEFAULT_TRACK, 1, 0.1, -2, 0),
    [],
  );
  assert.deepEqual(body, before);
});

test("coincident recovery stays finite and translates only enough to separate", () => {
  const body = car(0, 0),
    t = track({ ...spec, amplitude: 0 });
  const impacts = resolveMovingObstacles(body, t, 0, 0.05, 0, 0);
  for (const value of Object.values(body)) assert.ok(Number.isFinite(value));
  near(
    movingObstacleClearance(body, movingObstaclesAt(t, 0.05)[0]).distance,
    0,
    1e-4,
  );
  assert.deepEqual(impacts, []);
});

test("a kart pushed into a barrier is recovered without damage while moving outward", () => {
  const t = track({ ...spec, amplitude: 0 });
  const body = car(2.9, 0, 6, 0);
  assert.deepEqual(resolveMovingObstacles(body, t, 0, 1 / 60, 2.8, 0), []);
  assert.ok(body.x >= spec.radius + 1.6);
  near(body.vx, 6);
});

test("sustained pushing remains outside the visible circle across small simulation ticks", () => {
  const t = track({ ...spec, amplitude: 7, phase: -Math.PI / 2 }),
    body = car(0, 0);
  for (let step = 0; step < 240; step++) {
    const dt = 1 / 60,
      previousX = body.x,
      previousZ = body.z;
    body.x += body.vx * dt;
    body.z += body.vz * dt;
    resolveMovingObstacles(body, t, step * dt, dt, previousX, previousZ);
    const pose = movingObstaclesAt(t, (step + 1) * dt)[0];
    assert.ok(movingObstacleClearance(body, pose).distance >= -1e-5);
  }
});

test("local playback and authoritative simulation produce identical obstacle contacts", () => {
  const t = track({ ...spec, amplitude: 5, period: 5 });
  const server = car(1, -12, 0, 19),
    playback = { ...server };
  const events: number[][] = [];
  for (const body of [server, playback]) {
    const strengths: number[] = [];
    for (let step = 0; step < 120; step++) {
      const previousX = body.x,
        previousZ = body.z,
        dt = 1 / 60;
      body.x += body.vx * dt;
      body.z += body.vz * dt;
      strengths.push(
        ...resolveMovingObstacles(body, t, step * dt, dt, previousX, previousZ),
      );
    }
    events.push(strengths);
  }
  assert.deepEqual(playback, server);
  assert.deepEqual(events[0], events[1]);
  assert.ok(events[0].length > 0, "replay must include an actual collision");
});

test("both visible obstacle bodies remain inside their collision footprints at every phase", () => {
  for (const kind of ["shuttle", "sweeper"] as const) {
    const t = track({ ...spec, kind, heading: 1.1 }),
      scene = new THREE.Scene();
    const rendered = buildMovingObstacles(scene, t);
    const body = scene.getObjectByName(`moving-obstacle:${spec.id}`)!;
    assert.ok(body);
    const point = new THREE.Vector3();
    const resources = new Set<unknown>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        resources.add(object.geometry);
        resources.add(object.material);
      }
    });
    for (const clock of [0, 1, 2, 3, 4, 6, 8]) {
      rendered.update(clock);
      scene.updateMatrixWorld(true);
      const pose = movingObstaclesAt(t, clock)[0];
      near(body.position.x, pose.x);
      near(body.position.z, pose.z);
      assert.equal(body.visible, true);
      body.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          point
            .fromBufferAttribute(positions, i)
            .applyMatrix4(object.matrixWorld);
          assert.ok(
            Math.hypot(point.x - pose.x, point.z - pose.z) <=
              spec.radius + 1e-5,
            `${kind}: ${object.name} exceeds collider`,
          );
        }
      });
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          assert.ok(resources.has(object.geometry));
          assert.ok(resources.has(object.material));
        }
      });
    }
  }
});

for (const kind of ["sheep", "deer"] as const) {
  test(`${kind} dwells, turns only while stopped, and crosses with analytic velocity`, () => {
    const t = track({ ...spec, kind, period: 20 });
    for (const clock of [
      -100, -0.001, 0, 2.99, 3, 7, 10, 12.99, 13, 17, 20, 100,
    ]) {
      const pose = movingObstaclesAt(t, clock)[0];
      const before = movingObstaclesAt(t, clock - 1e-5)[0],
        after = movingObstaclesAt(t, clock + 1e-5)[0];
      near(pose.vx, (after.x - before.x) / 2e-5, 1e-5);
      near(pose.y, spec.y);
      assert.ok(Math.abs(pose.offset) <= spec.amplitude);
      for (const v of [pose.x, pose.z, pose.facing, pose.stride])
        assert.ok(Number.isFinite(v));
      const repeat = movingObstaclesAt(t, clock + 20)[0];
      near(pose.x, repeat.x);
      near(pose.vx, repeat.vx);
      if (Math.abs(pose.vx) > 1e-4)
        near(Math.sin(after.facing - before.facing), 0, 1e-6);
    }
    for (const clock of [0, 1, 2, 10, 11, 12])
      near(movingObstaclesAt(t, clock)[0].vx, 0);
  });
  test(`${kind} continuously contacts a parked kart and replays deterministically`, () => {
    const t = track({ ...spec, kind, amplitude: 9, period: 20 });
    const a = car(0, 0),
      b = car(0, 0);
    const first = resolveMovingObstacles(a, t, 0, 10, 0, 0),
      second = resolveMovingObstacles(b, t, 0, 10, 0, 0);
    assert.ok(first.length > 0);
    assert.deepEqual(first, second);
    assert.deepEqual(a, b);
    assert.ok(
      movingObstacleClearance(a, movingObstaclesAt(t, 10)[0]).distance >= -1e-5,
    );
  });
}
test("pendulum weight follows a fixed length rod with exact lift", () => {
  const t = track({ ...spec, kind: "pendulum", amplitude: 12 });
  const length = pendulumLength(t.movingObstacles![0]);
  for (const clock of [-9, 0, 1, 2, 3, 4, 9]) {
    const pose = movingObstaclesAt(t, clock)[0];
    near(Math.hypot(pose.offset, length - pose.lift), length);
    near(pose.y, spec.y + pose.lift);
    near(Math.sin(pose.swingAngle) * length, pose.offset);
  }
});
test("side clearance uses the actual kart width, including rotated high-speed sweeps", () => {
  for (const heading of [0, 0.4, 1.3, 2.9]) {
    const c = Math.cos(heading),
      s = Math.sin(heading),
      x = spec.radius + 1.61;
    const t = track({ ...spec, amplitude: 0 });
    const body = {
      ...car(x * c + 25 * s, -x * s + 25 * c, 250 * s, 250 * c),
      heading,
    };
    assert.deepEqual(
      resolveMovingObstacles(body, t, 0, 0.2, x * c - 25 * s, -x * s - 25 * c),
      [],
    );
    const hit = { ...car(25 * s, 25 * c, 250 * s, 250 * c), heading };
    assert.equal(
      resolveMovingObstacles(hit, t, 0, 0.2, -25 * s, -25 * c).length,
      1,
    );
    assert.ok(
      movingObstacleClearance(hit, movingObstaclesAt(t, 0.2)[0]).distance >=
        -1e-5,
    );
  }
});
test("escape recovery clears a blocked lateral contact along the road", () => {
  const t = track({ ...spec, amplitude: 0 }),
    body = car(1, 0);
  assert.equal(
    movingObstacleModule.constrainMovingObstacles(body, t, 0, 0),
    true,
  );
  near(body.x, 1);
  assert.ok(
    movingObstacleClearance(body, movingObstaclesAt(t, 0)[0]).distance >= 0,
  );
});

test("all motion families handle extreme and non-finite clock input deterministically", () => {
  for (const kind of ["shuttle", "pendulum", "sheep", "deer"] as const) {
    const t = track({ ...spec, kind });
    for (const clock of [
      -Number.MAX_VALUE,
      Number.MAX_VALUE,
      NaN,
      Infinity,
      -Infinity,
    ]) {
      const a = movingObstaclesAt(t, clock)[0],
        b = movingObstaclesAt(t, clock)[0];
      assert.deepEqual(a, b);
      for (const key of [
        "x",
        "y",
        "z",
        "vx",
        "vz",
        "facing",
        "stride",
        "lift",
        "swingAngle",
      ] as const)
        assert.ok(Number.isFinite(a[key]), `${kind} ${key} at ${clock}`);
    }
  }
});
test("animal endpoint dwell is C2 continuous with each crossing", () => {
  const t = track({ ...spec, kind: "sheep", period: 20 });
  for (const clock of [0, 3, 10, 13, 20]) {
    const a = movingObstaclesAt(t, clock - 1e-4)[0],
      b = movingObstaclesAt(t, clock + 1e-4)[0];
    near(a.x, b.x, 1e-7);
    near(a.vx, b.vx, 1e-7);
    near((b.vx - a.vx) / 2e-4, 0, 0.001);
  }
});

for (const kind of ["sheep", "deer"] as const) {
  test(`${kind} capsule flank allows close passes and its nose remains solid`, () => {
    const obstacle = {
      ...spec,
      kind,
      amplitude: 0,
      period: 0,
      phase: 0.3 * Math.PI * 2,
    };
    const t = track(obstacle),
      pose = movingObstaclesAt(t, 0)[0],
      shape = movingObstacleFootprint(pose);
    const gap = 0.015,
      flank = 2.12 + shape.radius + gap;
    const passing = car(25, -flank, 250, 0);
    assert.deepEqual(
      resolveMovingObstacles(passing, t, 0, 0.2, -25, -flank),
      [],
    );
    near(passing.x, 25);
    const approaching = car(0, -2.12 - shape.radius + 0.1, 0, 50);
    assert.equal(
      resolveMovingObstacles(approaching, t, 0, 0.2, 0, -12).length,
      1,
    );
    near(approaching.z, -2.12 - shape.radius, 2e-5);
    const nose = car(25, 0, 250, 0);
    assert.equal(resolveMovingObstacles(nose, t, 0, 0.2, -25, 0).length, 1);
    near(nose.x, -1.6 - shape.halfLength - shape.radius, 2e-5);
  });
  test(`${kind} rotating capsule contacts a parked kart continuously during offroad dwell`, () => {
    const t = track({ ...spec, kind, amplitude: 0, period: 20 });
    const initial = movingObstaclesAt(t, 0)[0],
      shape = movingObstacleFootprint(initial);
    const z = -2.12 - shape.radius - shape.halfLength * 0.5;
    const a = car(0, z),
      b = car(0, z);
    assert.ok(movingObstacleClearance(a, initial).distance > 0);
    const hits = resolveMovingObstacles(a, t, 0, 3, 0, z);
    assert.ok(hits.length > 0);
    assert.deepEqual(hits, resolveMovingObstacles(b, t, 0, 3, 0, z));
    assert.deepEqual(a, b);
    assert.ok(
      movingObstacleClearance(a, movingObstaclesAt(t, 3)[0]).distance >= -1e-5,
    );
  });
  test(`${kind} fitted capsule encloses every articulated mesh vertex across turns and walking`, () => {
    const t = track({ ...spec, kind, heading: 0.71, period: 20 }),
      scene = new THREE.Scene(),
      rendered = buildMovingObstacles(scene, t);
    const body = scene.getObjectByName(`moving-obstacle:${spec.id}`)!,
      point = new THREE.Vector3();
    for (let frame = 0; frame <= 80; frame++) {
      const clock = frame / 4;
      rendered.update(clock);
      scene.updateMatrixWorld(true);
      const pose = movingObstaclesAt(t, clock)[0],
        shape = movingObstacleFootprint(pose);
      const axisX = Math.sin(pose.facing),
        axisZ = Math.cos(pose.facing);
      body.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          point
            .fromBufferAttribute(positions, i)
            .applyMatrix4(object.matrixWorld);
          const dx = point.x - pose.x,
            dz = point.z - pose.z;
          const along = Math.max(
            -shape.halfLength,
            Math.min(shape.halfLength, dx * axisX + dz * axisZ),
          );
          assert.ok(
            Math.hypot(dx - axisX * along, dz - axisZ * along) <=
              shape.radius + 1e-6,
            `${kind} ${object.name} at ${clock}`,
          );
        }
      });
    }
  });
}
