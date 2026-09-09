import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RaceVfx } from "../client/vfx/race.ts";
import { vfxBudget } from "../client/vfx/budgets.ts";
import { createItems, stepItems } from "../shared/items.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { recordVfx } from "../shared/vfx-events.ts";
import {
  DEFAULT_TRACK,
  getTrack,
  trackPoint,
  continuousTrack,
} from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";
import { CourseVfx } from "../client/vfx/course.ts";

test("global particle allocations add up to the approved budget", () => {
  for (const quality of ["low", "high"]) {
    const b = vfxBudget(quality);
    assert.equal(
      b.smoke + b.sparks + b.combat + b.environment,
      quality === "low" ? 192 : 768,
    );
  }
});
test("confirmed hit bursts once, expiry emits nothing, and pause/reset/disposal cleanly own resources", () => {
  const scene = new THREE.Scene(),
    fx = new RaceVfx(scene, DEFAULT_TRACK),
    c = spawnCar(),
    w = createItems([c.id]);
  const f = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [c],
  };
  fx.update([c], c.id, w, 1 / 60, f);
  recordVfx(w, {
    kind: "hit",
    item: "missile",
    actor: "rival",
    target: c.id,
    x: c.x,
    y: 0,
    z: c.z,
  });
  fx.update([c], c.id, w, 1 / 60, f);
  assert.ok(fx.stats.particles > 0);
  const before = { ...fx.stats };
  fx.update([c], c.id, w, 1 / 60, f);
  assert.equal(fx.stats.particles, before.particles);
  fx.update([c], c.id, w, 1, { ...f, paused: true });
  assert.equal(fx.stats.particles, before.particles);
  fx.reset();
  assert.equal(fx.stats.particles, 0);
  w.missiles = [];
  fx.update([c], c.id, w, 1 / 60, f);
  assert.equal(fx.stats.particles, 0);
  let disposed = 0;
  fx.group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points)
      o.geometry.addEventListener("dispose", () => disposed++);
  });
  const count = fx.group.children.length;
  fx.dispose();
  fx.dispose();
  assert.equal(disposed, count);
  assert.equal(fx.group.parent, null);
});
test("recovery shell differs from active shield, and low-motion hit produces no particles", () => {
  const fx = new RaceVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar(),
    w = createItems([c.id]);
  const f = {
    active: true,
    paused: false,
    quality: "low",
    motion: 0,
    authoritative: [c],
  };
  w.players[c.id].shield = 2;
  fx.update([c], c.id, w, 1 / 60, f);
  assert.equal(fx.stats.shields, 1);
  assert.equal(fx.stats.protection, 0);
  w.players[c.id].shield = 0;
  w.players[c.id].hitProtection = 1;
  fx.update([c], c.id, w, 1 / 60, f);
  assert.equal(fx.stats.shields, 0);
  assert.equal(fx.stats.protection, 1);
  recordVfx(w, {
    kind: "hit",
    item: "trap",
    actor: "rival",
    target: c.id,
    x: c.x,
    y: 0,
    z: c.z,
  });
  fx.update([c], c.id, w, 1 / 60, f);
  assert.equal(fx.stats.particles, 0);
  fx.dispose();
});

test("configured ground-zone feedback survives lap two and later", () => {
  const track = getTrack("coast-breakwater"),
    zone = getLevel(track.id).zones.find((z) => z.kind === "sand")!,
    t = (zone.start + zone.end) / 2,
    p = trackPoint(t, track);
  const counts = [0, 1, 2].map((lap) => {
    const c = spawnCar(0, "local", track);
    Object.assign(c, {
      x: p.x + Math.cos(p.heading) * zone.lateral,
      z: p.z - Math.sin(p.heading) * zone.lateral,
      lastT: t,
      progress: t + lap,
      speed: 20,
    });
    const fx = new RaceVfx(new THREE.Scene(), track);
    fx.update([c], c.id, null, 0.1, {
      active: true,
      paused: false,
      quality: "high",
      motion: 1,
      authoritative: [c],
    });
    const count = fx.stats.particles;
    fx.dispose();
    return count;
  });
  assert.ok(counts[0] > 0);
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]]);
});

test("a missile fired on a slope remains above its own road and points toward its target", () => {
  const track = getTrack("mountain"),
    owner = spawnCar(0, "owner", track),
    target = spawnCar(1, "target", track);
  for (const [c, t] of [
    [owner, 0.4],
    [target, 0.45],
  ] as const) {
    const p = trackPoint(t, track);
    Object.assign(c, {
      x: p.x,
      z: p.z,
      heading: p.heading,
      lastT: t,
      progress: t,
    });
  }
  const w = createItems([owner.id, target.id], track);
  w.players.owner.held = "missile";
  stepItems(
    w,
    [owner, target],
    { owner: { ...EMPTY_INPUT, item: true } },
    1 / 60,
    track,
  );
  assert.equal(w.missiles.length, 1);
  const fx = new RaceVfx(new THREE.Scene(), track);
  fx.update([owner, target], owner.id, w, 1 / 60, {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [owner, target],
  });
  const mesh = fx.group.children.find(
    (o) =>
      o instanceof THREE.InstancedMesh && o.geometry.type === "ConeGeometry",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix),
    m = w.missiles[0];
  const ground = continuousTrack(
    m.x,
    m.z,
    owner.lastT,
    track,
    owner.routeBranch,
  ).y;
  assert.ok(
    Math.abs(position.y - ground - 1.25) < 0.001,
    `missile ${position.y}, ground ${ground}`,
  );
  const direction = new THREE.Vector3(0, 1, 0).transformDirection(matrix),
    expected = new THREE.Vector3(target.x - m.x, 0, target.z - m.z).normalize();
  assert.ok(direction.dot(expected) > 0.999);
  fx.dispose();
});

test("eight-car shields, hit rings and course markers share the auxiliary instance ceiling", () => {
  for (const quality of ["high", "low"]) {
    const scene = new THREE.Scene(),
      race = new RaceVfx(scene, DEFAULT_TRACK),
      course = new CourseVfx(scene, DEFAULT_TRACK),
      cars = Array.from({ length: 8 }, (_, i) => spawnCar(i, `c${i}`)),
      w = createItems(cars.map((c) => c.id));
    const f = {
      active: true,
      paused: false,
      motion: 1,
      quality,
      authoritative: cars,
    };
    for (const c of cars) {
      c.miniWindow = 0.5;
      w.players[c.id].shield = 2;
      w.players[c.id].slow = 1;
    }
    race.update(cars, cars[0].id, w, 0.1, f);
    for (let i = 0; i < 30; i++)
      recordVfx(w, {
        kind: "hit",
        item: "trap",
        actor: "rival",
        target: cars[0].id,
        x: cars[0].x,
        y: 0,
        z: cars[0].z,
      });
    race.update(cars, cars[0].id, w, 0.1, f);
    course.update(
      {
        ...f,
        failed: false,
        targets: [0.1, 0.2, 0.3].map((t) => ({
          t,
          complete: false,
          kind: "gate" as const,
        })),
      },
      0.1,
    );
    const courseRings = course.group.children.find(
      (o) =>
        o instanceof THREE.InstancedMesh && o.geometry.type === "RingGeometry",
    ) as THREE.InstancedMesh;
    assert.ok(
      race.stats.rings +
        race.stats.shields +
        race.stats.protection +
        courseRings.count +
        vfxBudget(quality).environmentInstances <=
        vfxBudget(quality).rings,
    );
    assert.ok(race.stats.particles <= vfxBudget(quality).combat);
    race.dispose();
    course.dispose();
  }
});

test("missing item state does not invent a shield-expiry event", () => {
  const c = spawnCar(),
    w = createItems([c.id]),
    fx = new RaceVfx(new THREE.Scene(), DEFAULT_TRACK);
  w.boxes = [];
  w.players[c.id].shield = 2;
  const f = {
    active: true,
    paused: false,
    motion: 1,
    quality: "high",
    authoritative: [c],
  };
  fx.update([c], c.id, w, 0.05, f);
  fx.update([c], c.id, null, 0.05, f);
  fx.update([c], c.id, null, 0.05, f);
  assert.equal(fx.stats.rings, 0);
  fx.dispose();
});

test("confirmed shield block leaves a short centered shell wave without claiming active protection", () => {
  const fx = new RaceVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar(),
    w = createItems([c.id]);
  w.boxes = [];
  const f = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [c],
  };
  w.players[c.id].shield = 2;
  fx.update([c], c.id, w, 0.02, f);
  w.players[c.id].shield = 0;
  recordVfx(w, {
    kind: "block",
    item: "missile",
    actor: "rival",
    target: c.id,
    x: c.x,
    y: 0,
    z: c.z,
  });
  fx.update([c], c.id, w, 0.02, f);
  const shell = fx.group.children.find(
    (o) =>
      o instanceof THREE.InstancedMesh && o.geometry.type === "SphereGeometry",
  ) as THREE.InstancedMesh;
  assert.equal(fx.stats.shields, 0);
  assert.equal(fx.stats.protection, 0);
  assert.equal(shell.count, 1);
  assert.equal(shell.geometry.getAttribute("phase").getX(0), 2);
  assert.equal(fx.impactPressure, true);
  fx.update([c], c.id, w, 0.2, { ...f, paused: true });
  assert.equal(shell.count, 1);
  for (let n = 0; n < 25; n++) fx.update([c], c.id, w, 0.02, f);
  assert.equal(shell.count, 0);
  assert.equal(fx.impactPressure, false);
  fx.reset();
  fx.update([c], c.id, w, 0.02, f);
  assert.equal(shell.count, 0);
  fx.dispose();
});
