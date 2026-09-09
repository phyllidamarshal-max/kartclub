import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TRACK,
  getTrack,
  nearestTrack,
  trackPoint,
  type Track,
} from "../shared/track.ts";
import { spawnCar, type Car } from "../shared/race.ts";
import type { MovingObstacleSpec } from "../shared/moving-obstacles.ts";
import { selectObstacleWarning } from "../client/obstacle-hud-state.ts";
import { ObstacleHud } from "../client/obstacle-hud.ts";
import { OBSTACLE_CATALOG } from "../client/locales/obstacles.ts";

function obstacle(
  z = 150,
  extra: Partial<MovingObstacleSpec> = {},
): MovingObstacleSpec {
  return {
    id: `obstacle-${z}`,
    kind: "shuttle",
    x: 0,
    y: 0,
    z,
    heading: 0,
    radius: 1.5,
    amplitude: 0,
    period: 8,
    phase: 0,
    ...extra,
  };
}
function track(
  movingObstacles: readonly MovingObstacleSpec[] = [obstacle()],
): Track {
  return {
    ...DEFAULT_TRACK,
    layout: "ab",
    length: 1000,
    width: 16,
    widthProfile: undefined,
    shortcut: [],
    obstacles: [],
    movingObstacles,
    points: Array.from({ length: 100 }, (_, i) => ({
      x: 0,
      y: 0,
      z: i * 10,
      heading: 0,
      t: i / 100,
    })),
  };
}
function car(t: Track, extra: Partial<Car> = {}): Car {
  return {
    ...spawnCar(0, "hud", t),
    x: 0,
    z: 100,
    lastT: 0.1,
    heading: 0,
    speed: 20,
    vx: 0,
    vz: 20,
    resetTime: 0,
    ...extra,
  };
}
test("selects nearest upcoming warning; rejects passed and distant anchors", () => {
  const t = track([obstacle(90), obstacle(270), obstacle(180), obstacle(150)]);
  assert.equal(selectObstacleWarning(car(t), t, 0)?.id, "obstacle-150");
  assert.equal(
    selectObstacleWarning(
      car(t, { z: 200, lastT: 0.2 }),
      track([obstacle(150)]),
      0,
    ),
    null,
  );
  const distant = track([obstacle(261)]);
  assert.equal(selectObstacleWarning(car(distant), distant, 0), null);
});
test("suppresses reverse heading, other elevation, reset, finish and invalid clocks", () => {
  const t = track();
  for (const c of [
    car(t, { heading: Math.PI }),
    car(t, { finished: true }),
    car(t, { resetTime: 1 }),
    car(t, { resetHeld: true }),
  ])
    assert.equal(selectObstacleWarning(c, t, 0), null);
  const high = track([obstacle(150, { y: 12 })]);
  assert.equal(selectObstacleWarning(car(high), high, 0), null);
  assert.equal(selectObstacleWarning(car(t), t, NaN), null);
});
test("connected uphill and downhill road warnings use elevation at the anchor", () => {
  for (const grade of [-0.12, 0.12]) {
    const base = track([obstacle(200, { y: 200 * grade })]);
    const t = {
      ...base,
      points: base.points.map((p) => ({ ...p, y: p.z * grade })),
    };
    const result = selectObstacleWarning(car(t), t, 0);
    assert.equal(result?.id, "obstacle-200");
    assert.ok(result!.distance > 100 && result!.distance < 102);
    const wrongDeck = {
      ...t,
      movingObstacles: [obstacle(200, { y: 200 * grade + 12 })],
    };
    assert.equal(selectObstacleWarning(car(wrongDeck), wrongDeck, 0), null);
  }
});
test("authored forest and mine hills warn about connected obstacles 100 metres ahead", () => {
  for (const [id, index] of [
    ["forest-ridge", 1],
    ["mine-transit", 0],
    ["mine-transit", 1],
  ] as const) {
    const t = getTrack(id),
      spec = t.movingObstacles![index];
    const anchor = nearestTrack(spec.x, spec.z, t);
    const p = trackPoint(anchor.t - 100 / t.length, t);
    const c = car(t, {
      x: p.x,
      z: p.z,
      lastT: p.t,
      heading: p.heading,
      vx: Math.sin(p.heading) * 20,
      vz: Math.cos(p.heading) * 20,
    });
    const warning = selectObstacleWarning(c, t, 0);
    assert.equal(warning?.id, spec.id, `${id} obstacle ${index} at 100 metres`);
    assert.ok(warning!.distance > 97 && warning!.distance < 103);
  }
});
test("stacked road decks retain their own connected progress", () => {
  const base = track([obstacle(140, { y: 12, heading: Math.PI })]);
  const t = {
    ...base,
    points: base.points.map((p, i) =>
      i < 50 ? p : { ...p, x: 0, z: 990 - i * 10, y: 12, heading: Math.PI },
    ),
  };
  assert.equal(selectObstacleWarning(car(t), t, 0), null);
});
test("static roadside objects stay quiet while real circles on the current line warn", () => {
  const t = {
    ...track([]),
    obstacles: [
      { x: 7, z: 130, radius: 1.5 },
      { x: 0, z: 160, radius: 1.5 },
    ],
  };
  assert.equal(selectObstacleWarning(car(t), t, 0)?.id, "static-1");
  assert.equal(selectObstacleWarning(car(t, { x: 7 }), t, 0)?.id, "static-0");
});
test("arrival risk uses the race clock and current lateral line", () => {
  const t = track([obstacle(140, { amplitude: 7 })]),
    c = car(t);
  assert.equal(selectObstacleWarning(c, t, 0)?.risk, "watch"); // arrival at side at t=2
  assert.equal(selectObstacleWarning(c, t, 2)?.risk, "on-line"); // arrival crossing at t=4
  assert.equal(selectObstacleWarning(c, t, 0)?.direction, "right");
  assert.equal(selectObstacleWarning(c, t, 4)?.direction, "left");
});
test("spinner warning predicts its rotating capsule, not a permanently solid disc", () => {
  const t = track([
      obstacle(140, { kind: "spinner", radius: 3.5, period: 20 }),
    ]),
    c = car(t, { x: 3.5 });
  assert.equal(selectObstacleWarning(c, t, -2)?.risk, "watch");
  assert.equal(selectObstacleWarning(c, t, 3)?.risk, "on-line");
  assert.equal(selectObstacleWarning(c, t, 3)?.direction, "rotating");
});
test("new rail and cargo obstacle families expose real shared poses", () => {
  for (const kind of ["minecart", "hauler"] as const) {
    const t = track([obstacle(140, { kind, amplitude: 5 })]);
    assert.equal(selectObstacleWarning(car(t), t, 0)?.kind, kind);
    assert.equal(selectObstacleWarning(car(t), t, 0)?.direction, "waiting");
  }
});
test("parallel shortcut and main road do not exchange warnings", () => {
  const t = {
    ...track([obstacle(350, { x: 20 })]),
    shortcut: Array.from({ length: 41 }, (_, i) => ({
      x: 20,
      y: 0,
      z: 200 + i * 10,
      heading: 0,
      t: 0.2 + i * 0.01,
    })),
  };
  assert.equal(
    selectObstacleWarning(car(t, { z: 300, lastT: 0.3 }), t, 0),
    null,
  );
  assert.equal(
    selectObstacleWarning(
      car(t, { x: 20, z: 300, lastT: 0.3, routeBranch: "shortcut" }),
      t,
      0,
    )?.id,
    "obstacle-350",
  );
  const main = { ...t, movingObstacles: [obstacle(350)] };
  assert.equal(
    selectObstacleWarning(
      car(main, { x: 20, z: 300, lastT: 0.3, routeBranch: "shortcut" }),
      main,
      0,
    ),
    null,
  );
});
test("nearby opposing hairpin has distant road progress and never triggers", () => {
  const points = Array.from({ length: 100 }, (_, i) =>
    i < 50
      ? { x: 0, y: 0, z: i * 10, heading: 0, t: i / 100 }
      : { x: 8, y: 0, z: 990 - i * 10, heading: Math.PI, t: i / 100 },
  );
  const t = { ...track([obstacle(140, { x: 8, heading: Math.PI })]), points };
  assert.equal(selectObstacleWarning(car(t), t, 0), null);
});
test("shortcut distance is actual road metres, not canonical main distance", () => {
  const t = {
    ...track([obstacle(60, { x: 20 })]),
    shortcut: Array.from({ length: 41 }, (_, i) => ({
      x: 20,
      y: 0,
      z: i * 2,
      heading: 0,
      t: 0.2 + i * 0.01,
    })),
  };
  const result = selectObstacleWarning(
    car(t, { x: 20, z: 20, lastT: 0.3, routeBranch: "shortcut" }),
    t,
    0,
  );
  assert.ok(result);
  assert.ok(Math.abs(result.distance - 40) < 1e-8);
});
test("shortcut can warn about main-road obstacles after its connected exit", () => {
  const t = {
    ...track([obstacle(650)]),
    shortcut: Array.from({ length: 41 }, (_, i) => ({
      x: 0,
      y: 0,
      z: 200 + i * 10,
      heading: 0,
      t: 0.2 + i * 0.01,
    })),
  };
  const result = selectObstacleWarning(
    car(t, { z: 590, lastT: 0.59, routeBranch: "shortcut" }),
    t,
    0,
  );
  assert.ok(result);
  assert.ok(Math.abs(result.distance - 60) < 1e-8);
});
class Element {
  parentElement: Element | null = null;
  children: Element[] = [];
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  hidden = false;
  className = "";
  private content = "";
  writes = 0;
  constructor(readonly ownerDocument: Doc) {}
  set textContent(value: string) {
    this.content = value;
    this.writes++;
  }
  get textContent() {
    return this.content;
  }
  append(...nodes: Element[]) {
    for (const n of nodes) {
      n.remove();
      n.parentElement = this;
      this.children.push(n);
    }
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (n) => n !== this,
      );
    this.parentElement = null;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
}
class Doc {
  count = 0;
  createElement() {
    this.count++;
    return new Element(this);
  }
  createElementNS() {
    return this.createElement();
  }
}
test("HUD reuses nodes and text, suppresses lifecycle states, reattaches after host replacement and disposes", () => {
  const doc = new Doc(),
    host = doc.createElement(),
    hud = new ObstacleHud(host as unknown as HTMLElement),
    t = track();
  const frame = { car: car(t), track: t, clock: 0, active: true };
  hud.update(frame);
  const element = hud.element as unknown as Element,
    count = doc.count,
    texts = element.children[1].children;
  const writes = texts.map((n) => n.writes);
  for (let i = 0; i < 30; i++) hud.update(frame);
  assert.equal(doc.count, count);
  assert.deepEqual(
    texts.map((n) => n.writes),
    writes,
  );
  assert.equal(element.hidden, false);
  for (const patch of [
    { active: false },
    { paused: true },
    { countdown: true },
    { car: null },
    { car: car(t, { finished: true }) },
    { car: car(t, { resetTime: 1 }) },
  ]) {
    hud.update({ ...frame, ...patch });
    assert.equal(element.hidden, true);
  }
  element.remove();
  hud.update(frame);
  assert.equal(element.parentElement, host);
  assert.equal(doc.count, count);
  assert.equal(element.attrs["aria-live"], undefined);
  hud.destroy();
  hud.update(frame);
  assert.equal(host.children.length, 0);
});
test("every obstacle label supplies all six languages", () => {
  for (const value of Object.values(OBSTACLE_CATALOG))
    for (const code of ["en", "fr", "hi", "es", "ar", "zh"] as const)
      assert.ok(value[code]);
});
