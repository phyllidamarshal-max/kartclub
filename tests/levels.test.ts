import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS, getTrack, trackPoint } from "../shared/track.ts";
import { getLevel, drivingZoneAt } from "../shared/levels.ts";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";

test("nine selectable routes expose nine different worlds and driving briefs", () => {
  assert.equal(new Set(TRACKS.map((t) => getLevel(t.id).biome)).size, 9);
  assert.equal(new Set(TRACKS.map((t) => getLevel(t.id).brief)).size, 9);
  for (const track of TRACKS) {
    const level = getLevel(track.id);
    assert.ok(Object.isFrozen(level));
    assert.ok(level.name.length && level.landmark.length);
    for (const zone of level.zones) {
      assert.ok(zone.start >= 0 && zone.end <= 1 && zone.start < zone.end);
      assert.ok(zone.halfWidth > 1 && zone.halfWidth <= track.width / 2);
    }
  }
});

test("driving zones only affect their marked strip on the main road", () => {
  for (const track of TRACKS)
    for (const zone of getLevel(track.id).zones) {
      const t = (zone.start + zone.end) / 2;
      assert.equal(
        drivingZoneAt(track.id, t, zone.lateral, "main")?.kind,
        zone.kind,
      );
      assert.equal(
        drivingZoneAt(track.id, t, zone.lateral + zone.halfWidth + 0.1, "main"),
        undefined,
      );
      assert.equal(
        drivingZoneAt(track.id, t, zone.lateral, "shortcut"),
        undefined,
      );
      assert.equal(
        drivingZoneAt(track.id, zone.end + 0.0001, zone.lateral, "main"),
        undefined,
      );
    }
});

test("marked boost, sand and ice change real physics without consuming earned nitro", () => {
  for (const [id, kind] of [
    ["city-nightshift", "boost"],
    ["coast-breakwater", "sand"],
    ["mountain-pass", "ice"],
  ] as const) {
    const track = getTrack(id),
      zone = getLevel(id).zones.find((z) => z.kind === kind)!;
    assert.ok(zone);
    const p = trackPoint((zone.start + zone.end) / 2, track);
    const car = spawnCar(0, "zone", track);
    Object.assign(car, {
      x: p.x + Math.cos(p.heading) * zone.lateral,
      z: p.z - Math.sin(p.heading) * zone.lateral,
      lastT: p.t,
      heading: p.heading,
      speed: 30,
      vx: Math.sin(p.heading) * 30 + Math.cos(p.heading) * 4,
      vz: Math.cos(p.heading) * 30 - Math.sin(p.heading) * 4,
      storedNitro: 1,
    });
    car.lastX = car.x;
    car.lastZ = car.z;
    const control = structuredClone(car),
      inert = { ...track, id: "tide-coast-v1" };
    const input = { ...EMPTY_INPUT, throttle: 1 };
    stepCar(car, input, 1 / 60, track);
    stepCar(control, input, 1 / 60, inert);
    if (kind === "boost") assert.ok(car.speed > control.speed);
    if (kind === "sand") assert.ok(car.speed < control.speed);
    if (kind === "ice") {
      const lateral = (c: typeof car) =>
        c.vx * Math.cos(p.heading) - c.vz * Math.sin(p.heading);
      assert.ok(Math.abs(lateral(car)) > Math.abs(lateral(control)));
    }
    assert.equal(car.storedNitro, control.storedNitro);
  }
});

test("server and local stepping remain deterministic across level surfaces", () => {
  for (const track of TRACKS) {
    const local = spawnCar(0, "deterministic", track),
      server = structuredClone(local);
    const first = getLevel(track.id).zones[0],
      p = trackPoint(first.start + 0.001, track);
    for (const c of [local, server])
      Object.assign(c, {
        x: p.x,
        z: p.z,
        lastX: p.x,
        lastZ: p.z,
        lastT: p.t,
        heading: p.heading,
        speed: 20,
        vx: Math.sin(p.heading) * 20,
        vz: Math.cos(p.heading) * 20,
      });
    for (let i = 0; i < 60; i++) {
      const input = {
        ...EMPTY_INPUT,
        throttle: 1,
        steer: Math.sin(i * 0.1) * 0.1,
      };
      stepCar(local, input, 1 / 60, track);
      stepCar(server, input, 1 / 60, track);
    }
    assert.deepEqual(local, server);
    assert.ok(Number.isFinite(local.speed));
  }
});
