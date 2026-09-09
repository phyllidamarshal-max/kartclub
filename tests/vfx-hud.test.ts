import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, type Car } from "../shared/race.ts";
import { createItems, type ItemWorld } from "../shared/items.ts";
import {
  BoundedResultGate,
  HudVfxState,
  type HudVfxFrame,
} from "../client/vfx/hud-state.ts";
import { HudVfx, mountResultFeedback } from "../client/vfx/hud.ts";

class FakeClassList {
  private values = new Set<string>();
  add(...names: string[]) {
    names.forEach((name) => this.values.add(name));
  }
  remove(...names: string[]) {
    names.forEach((name) => this.values.delete(name));
  }
  contains(name: string) {
    return this.values.has(name);
  }
  toggle(name: string, force?: boolean) {
    const add = force ?? !this.values.has(name);
    add ? this.values.add(name) : this.values.delete(name);
    return add;
  }
}

class FakeStyle {
  readonly values = new Map<string, string>();
  setProperty(name: string, value: string) {
    this.values.set(name, value);
  }
  removeProperty(name: string) {
    return this.values.delete(name) ? name : "";
  }
}

class FakeElement {
  private _className = "";
  classList = new FakeClassList();
  dataset: Record<string, string> = {};
  style = new FakeStyle();
  hidden = false;
  textContent = "";
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  ownerDocument: FakeDocument;
  rect = { left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 };
  constructor(ownerDocument: FakeDocument, classes = "") {
    this.ownerDocument = ownerDocument;
    this.className = classes;
  }
  get className() {
    return this._className;
  }
  set className(value: string) {
    this.classList.remove(...this._className.split(" ").filter(Boolean));
    this._className = value;
    value
      .split(" ")
      .filter(Boolean)
      .forEach((name) => this.classList.add(name));
  }
  get isConnected() {
    return this.parentElement !== null;
  }
  get offsetWidth() {
    return 1;
  }
  getBoundingClientRect() {
    return this.rect;
  }
  setAttribute(name: string, value: string) {
    this.dataset[name] = value;
  }
  append(...nodes: FakeElement[]) {
    nodes.forEach((node) => {
      node.parentElement = this;
      this.children.push(node);
    });
  }
  prepend(node: FakeElement) {
    node.parentElement = this;
    this.children.unshift(node);
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(
        (n) => n !== this,
      );
      this.parentElement = null;
    }
  }
  querySelector(selector: string): FakeElement | null {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    for (const child of this.children) {
      if (className && child.classList.contains(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    for (const child of this.children) {
      if (className && child.classList.contains(className)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
}

class FakeDocument {
  createElement() {
    return new FakeElement(this);
  }
}

function fakeHost(classes: string[]) {
  const document = new FakeDocument(),
    host = new FakeElement(document, "host");
  const nodes = new Map<string, FakeElement>();
  for (const name of classes) {
    const node = new FakeElement(document, name);
    host.append(node);
    nodes.set(name, node);
  }
  return { document, host, nodes };
}

function frame(car: Car, patch: Partial<HudVfxFrame> = {}): HudVfxFrame {
  return {
    raceId: "race-a",
    active: true,
    paused: false,
    car,
    confirmed: car,
    items: null,
    countdown: 0,
    releaseRemaining: 0,
    totalLaps: 3,
    trainingStep: null,
    gate: null,
    completedCorners: 0,
    failed: false,
    pbSerial: 0,
    sectorSerial: 0,
    motion: 1,
    quality: "high",
    ...patch,
  };
}

test("confirmed nitro totals preserve both use and collection in one snapshot", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  Object.assign(car, { nitroUses: 2, storedNitro: 1, boostTime: 0.1 });
  assert.deepEqual(state.update(frame(car), 1 / 60).nitro, {
    used: 0,
    collected: 0,
    chained: false,
  });

  Object.assign(car, { nitroUses: 3, storedNitro: 1, boostTime: 3 });
  assert.deepEqual(state.update(frame(car), 1 / 60).nitro, {
    used: 1,
    collected: 1,
    chained: true,
  });

  Object.assign(car, { nitroUses: 2, storedNitro: 0 });
  assert.deepEqual(state.update(frame(car), 1 / 60).nitro, {
    used: 0,
    collected: 0,
    chained: false,
  });
  Object.assign(car, { nitroUses: 3, storedNitro: 1 });
  assert.deepEqual(state.update(frame(car), 1 / 60).nitro, {
    used: 0,
    collected: 0,
    chained: false,
  });
});

test("full charge sweep fires once on the confirmed threshold crossing", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  car.energy = 99;
  state.update(frame(car), 1 / 60);
  car.energy = 100;
  assert.equal(state.update(frame(car), 1 / 60).chargeFilled, true);
  assert.equal(state.update(frame(car), 1 / 60).chargeFilled, false);
  car.energy = 80;
  state.update(frame(car), 1 / 60);
  car.energy = 100;
  assert.equal(
    state.update(frame(car, { confirmed: null }), 1 / 60).chargeFilled,
    false,
  );
});

test("predicted counters never emit and become cues only after confirmation", () => {
  const state = new HudVfxState(),
    car = spawnCar(),
    confirmed = { ...car };
  const items = createItems([car.id]);
  state.update(frame(car, { confirmed, items }), 1 / 60);

  car.nitroUses = 1;
  items.players[car.id].usefulHits = 1;
  assert.deepEqual(
    state.update(frame(car, { confirmed: null, items }), 1 / 60).nitro,
    { used: 0, collected: 0, chained: false },
  );
  assert.equal(
    state.update(frame(car, { confirmed: null, items }), 1 / 60).hitDelta,
    0,
  );

  confirmed.nitroUses = 1;
  const cues = state.update(frame(car, { confirmed, items }), 1 / 60);
  assert.equal(cues.nitro.used, 1);
  assert.equal(cues.hitDelta, 1);
});

test("item totals detect a use and replacement pickup in the same frame", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  const items = createItems([car.id]);
  items.players[car.id].held = "boost";
  state.update(frame(car, { items }), 1 / 60);

  Object.assign(items.players[car.id], {
    held: "shield",
    uses: 1,
    usefulHits: 2,
    blocks: 1,
  });
  const cues = state.update(frame(car, { items }), 1 / 60);
  assert.equal(cues.itemUsed, "boost");
  assert.equal(cues.itemPicked, "shield");
  assert.equal(cues.hitDelta, 2);
  assert.equal(cues.blockDelta, 1);
});

test("HUD arbitration keeps one highest-priority burst and never queues losers", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  const items = createItems([car.id]);
  items.players[car.id].held = "boost";
  state.update(frame(car, { items }), 1 / 60);
  Object.assign(car, {
    nitroUses: 1,
    storedNitro: 1,
    collisionCount: 1,
    lastCollisionStrength: 8,
    lastCollisionKind: "kart",
    lastEnergyLoss: 12,
  });
  Object.assign(items.players[car.id], { held: "shield", uses: 1 });
  let cues = state.update(frame(car, { items }), 1 / 60);
  assert.equal(cues.primary, "impact-heavy");
  assert.equal(cues.itemUsed, "boost");
  assert.equal(cues.itemPicked, "shield");
  assert.equal(state.update(frame(car, { items }), 1 / 60).primary, null);
});

test("an active resource burst is preempted by next-frame damage and blocks later low priority restarts", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  state.update(frame(car), 1 / 60);
  car.nitroUses = 1;
  assert.equal(state.update(frame(car), 1 / 60).primary, "nitro-use");
  car.collisionCount = 1;
  car.lastCollisionStrength = 8;
  assert.equal(state.update(frame(car), 1 / 60).primary, "impact-heavy");
  car.storedNitro = 1;
  assert.equal(state.update(frame(car), 1 / 60).primary, null);
});

test("confirmed received hit journal cue is distinct from own useful hit and outranks boost", () => {
  const state = new HudVfxState(),
    car = spawnCar(),
    items = createItems([car.id, "rival"]);
  state.update(frame(car, { items }), 1 / 60);
  items.time = 1;
  items.vfx = {
    sequence: 1,
    events: [
      {
        seq: 1,
        time: 1,
        kind: "hit",
        item: "missile",
        actor: "rival",
        target: car.id,
        x: 0,
        y: 0,
        z: 0,
      },
    ],
  };
  car.nitroUses = 1;
  const cues = state.update(frame(car, { items }), 1 / 60);
  assert.equal(cues.receivedHit, true);
  assert.equal(cues.hitDelta, 0);
  assert.equal(cues.primary, "received-hit");
  assert.equal(state.update(frame(car, { items }), 1 / 60).receivedHit, false);
});

test("mini opportunity and confirmed use are separate, and a miss hides immediately", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  car.miniWindow = 0.4;
  state.update(frame(car), 1 / 60);
  car.miniWindow = 0.2;
  assert.equal(state.update(frame(car), 1 / 60).miniSuccess, false);
  car.miniUses = 1;
  let cues = state.update(frame(car), 1 / 60);
  assert.equal(cues.miniSuccess, true);
  assert.equal(cues.primary, "mini-success");
  car.miniWindow = 0;
  cues = state.update(frame(car), 1 / 60);
  assert.equal(cues.miniWindow, 0);
});

test("collision cue exposes confirmed kind, strength tier and exact loss", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  state.update(frame(car), 1 / 60);
  Object.assign(car, {
    collisionCount: 1,
    lastCollisionKind: "obstacle",
    lastCollisionStrength: 4.5,
    lastEnergyLoss: 0,
  });
  let cues = state.update(frame(car), 1 / 60);
  assert.deepEqual(cues.collision, {
    kind: "obstacle",
    strength: 4.5,
    severity: "medium",
    loss: 0,
  });
  assert.equal(cues.energyLoss, 0);
  Object.assign(car, {
    collisionCount: 2,
    lastCollisionKind: "wall",
    lastCollisionStrength: 1.5,
    lastEnergyLoss: 6,
  });
  cues = state.update(frame(car), 1 / 60);
  assert.equal(cues.collision?.severity, "light");
  assert.equal(cues.energyLoss, 6);
});

test("confirmed energy loss is exposed on the local nitro HUD", () => {
  const { host, nodes } = fakeHost(["nitro-box", "speedometer"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  fx.update(frame(car), 1 / 60);
  Object.assign(car, {
    collisionCount: 1,
    lastCollisionStrength: 4,
    lastEnergyLoss: 7.4,
  });
  fx.update(frame(car), 1 / 60);
  assert.equal(nodes.get("nitro-box")?.dataset.energyLoss, "7.4");
  assert.equal(
    nodes.get("nitro-box")?.style.values.get("--vfx-energy-loss-width"),
    "7.4%",
  );
  fx.dispose();
});

test("shield expansion and block are distinct and danger wins arbitration", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  const items = createItems([car.id]);
  state.update(frame(car, { items }), 1 / 60);
  items.players[car.id].shield = 2;
  let cues = state.update(frame(car, { items }), 1 / 60);
  assert.equal(cues.shieldOpened, true);
  assert.equal(cues.primary, "shield-open");
  items.players[car.id].blocks = 1;
  cues = state.update(frame(car, { items }), 1 / 60);
  assert.equal(cues.primary, "block");
});

test("inactive, paused and suspended frames consume baselines without replay", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  state.update(frame(car), 1 / 60);
  car.nitroUses = 1;
  assert.equal(
    state.update(frame(car, { active: false }), 1 / 60).nitro.used,
    0,
  );
  assert.equal(state.update(frame(car), 1 / 60).nitro.used, 0);
  car.nitroUses = 2;
  assert.equal(
    state.update(frame(car, { paused: true }), 1 / 60).nitro.used,
    0,
  );
  assert.equal(state.update(frame(car), 1 / 60).nitro.used, 0);
  car.nitroUses = 3;
  assert.equal(state.update(frame(car), 0.4).nitro.used, 0);
  assert.equal(state.update(frame(car), 1 / 60).nitro.used, 0);
});

test("new races and explicit resets establish fresh baselines", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  state.update(frame(car), 1 / 60);
  car.nitroUses = 1;
  assert.equal(state.update(frame(car), 1 / 60).nitro.used, 1);
  assert.equal(
    state.update(frame(car, { raceId: "race-b" }), 1 / 60).nitro.used,
    0,
  );
  car.nitroUses = 2;
  state.reset();
  assert.equal(
    state.update(frame(car, { raceId: "race-b" }), 1 / 60).nitro.used,
    0,
  );
});

test("countdown, delayed release, laps, training, PB and failure cue once", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  state.update(
    frame(car, { countdown: 3, releaseRemaining: 4, trainingStep: 0 }),
    1 / 60,
  );
  let cues = state.update(
    frame(car, { countdown: 1.9, releaseRemaining: 2, trainingStep: 2 }),
    1 / 60,
  );
  assert.equal(cues.countdownTick, true);
  assert.equal(cues.start, false);
  assert.equal(cues.trainingDelta, 2);

  car.lap = 1;
  cues = state.update(
    frame(car, {
      countdown: 0,
      releaseRemaining: 0,
      trainingStep: 2,
      pbSerial: 1,
      sectorSerial: 1,
      failed: true,
      totalLaps: 2,
    }),
    1 / 60,
  );
  assert.equal(cues.start, true);
  assert.equal(cues.release, true);
  assert.equal(cues.lapDelta, 1);
  assert.equal(cues.finalLap, true);
  assert.equal(cues.pb, true);
  assert.equal(cues.sector, true);
  assert.equal(cues.failed, true);
  cues = state.update(
    frame(car, {
      trainingStep: 2,
      failed: true,
      pbSerial: 1,
      sectorSerial: 1,
      totalLaps: 2,
    }),
    1 / 60,
  );
  assert.equal(cues.failed, false);
  assert.equal(cues.pb, false);
  assert.equal(cues.finalLap, true);
});

test("threat arrow selects the missile whose impact time survives shield filtering", () => {
  const state = new HudVfxState(),
    car = spawnCar();
  Object.assign(car, { x: 0, z: 0, heading: 0 });
  const items: ItemWorld = createItems([car.id]);
  items.players[car.id].shield = 0.3;
  items.missiles.push(
    { x: 17, z: 0, owner: "a", target: car.id, ttl: 2 },
    { x: -49.5, z: 0, owner: "b", target: car.id, ttl: 2 },
  );
  const cues = state.update(frame(car, { items }), 1 / 60);
  assert.ok(Math.abs((cues.threatTime ?? 0) - 0.7) < 1e-9);
  assert.ok(Math.abs((cues.threatAngle ?? 0) + 90) < 1e-9);
});

test("state updates leave frame, car and item inputs untouched", () => {
  const state = new HudVfxState(),
    car = spawnCar(),
    items = createItems([car.id]);
  const input = frame(car, { items, countdown: 2.2 });
  const before = JSON.stringify(input);
  state.update(input, 1 / 60);
  assert.equal(JSON.stringify(input), before);
});

test("result feedback gate deduplicates flags and evicts old races", () => {
  const gate = new BoundedResultGate(3);
  assert.equal(gate.take("a", "finish"), true);
  assert.equal(gate.take("a", "finish"), false);
  assert.equal(gate.take("a", "stars"), true);
  gate.take("b", "finish");
  gate.take("c", "finish");
  gate.take("d", "finish");
  assert.equal(gate.size, 3);
  assert.equal(gate.take("a", "finish"), true);
  gate.clear();
  assert.equal(gate.size, 0);
});

test("HudVfx binds once, rebinds after the race UI is replaced, and disposes", () => {
  const names = [
    "countdown",
    "speedometer",
    "nitro-box",
    "nitro-track",
    "nitro-charge",
    "item-hud",
    "skill-feedback",
    "lap-count",
    "objective",
    "race-feedback",
  ];
  const { host, nodes } = fakeHost(names);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  fx.update(frame(car), 1 / 60);
  assert.equal(host.classList.contains("vfx-hud-host"), true);
  assert.ok(host.querySelector(".vfx-hud-layer"));
  assert.equal(host.querySelectorAll(".vfx-hud-energy-trail").length, 2);

  car.energy = 100;
  fx.update(frame(car), 1 / 60);
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-charge-filled"),
    true,
  );
  car.storedNitro = 1;
  fx.update(frame(car), 1 / 60);
  assert.equal(
    host
      .querySelector(".vfx-hud-energy-trail")
      ?.classList.contains("vfx-energy-trail-active"),
    true,
  );
  fx.update(frame(car, { paused: true }), 1 / 60);
  assert.equal(host.classList.contains("vfx-hud-paused"), true);
  fx.reset();
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-charge-full"),
    false,
  );
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-inventory-full"),
    false,
  );
  assert.equal(host.querySelector(".vfx-hud-layer")?.hidden, true);

  const oldLayer = host.querySelector(".vfx-hud-layer")!;
  oldLayer.remove();
  fx.update(frame(car), 1 / 60);
  assert.notEqual(host.querySelector(".vfx-hud-layer"), oldLayer);
  fx.dispose();
  assert.equal(host.querySelector(".vfx-hud-layer"), null);
  assert.equal(host.classList.contains("vfx-hud-host"), false);
});

test("collection trail targets the newly occupied cell, while simultaneous use lands on inventory", () => {
  const { host, document } = fakeHost([]);
  const box = new FakeElement(document, "nitro-box");
  const track = new FakeElement(document, "nitro-track");
  const inventory = new FakeElement(document, "nitro-charges");
  const first = new FakeElement(document, "nitro-charge"),
    second = new FakeElement(document, "nitro-charge");
  track.rect = {
    left: 10,
    top: 10,
    right: 110,
    bottom: 30,
    width: 100,
    height: 20,
  };
  first.rect = {
    left: 140,
    top: 10,
    right: 160,
    bottom: 30,
    width: 20,
    height: 20,
  };
  second.rect = {
    left: 180,
    top: 10,
    right: 200,
    bottom: 30,
    width: 20,
    height: 20,
  };
  inventory.append(first, second);
  box.append(track, inventory);
  host.append(box);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  fx.update(frame(car), 1 / 60);
  car.storedNitro = 1;
  fx.update(frame(car), 1 / 60);
  let trail = host.querySelector(".vfx-energy-trail-active")!;
  assert.equal(trail.dataset.slot, "0");
  assert.equal(first.classList.contains("vfx-nitro-collected"), true);
  assert.equal(second.classList.contains("vfx-nitro-collected"), false);
  car.nitroUses = 1;
  fx.update(frame(car), 1 / 60);
  trail = host
    .querySelectorAll(".vfx-hud-energy-trail")
    .find((node) => node.dataset.target === "inventory")!;
  assert.ok(trail);
  assert.equal(trail.classList.contains("vfx-energy-trail-active"), true);
  fx.dispose();
});

test("countdown owns stable text and frame nodes, with one entry per actual digit", () => {
  const { host, nodes } = fakeHost(["countdown"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  fx.update(frame(car, { countdown: 3 }), 1 / 60);
  const root = nodes.get("countdown")!;
  const value = root.querySelector(".vfx-countdown-value")!;
  assert.ok(value);
  assert.equal(value.textContent, "3");
  assert.equal(root.hidden, false);
  assert.equal(root.querySelectorAll(".vfx-countdown-side").length, 2);
  // A render with the same countdown must retain the actual numeral node.
  fx.update(frame(car, { countdown: 2.9 }), 1 / 60);
  assert.equal(root.querySelector(".vfx-countdown-value"), value);
  assert.equal(value.textContent, "3");
  fx.update(frame(car, { countdown: 1.9 }), 1 / 60);
  assert.equal(value.textContent, "2");
  fx.update(frame(car, { countdown: 0.9 }), 1 / 60);
  assert.equal(value.textContent, "1");
  fx.update(frame(car, { countdown: 0 }), 1 / 60);
  assert.equal(value.textContent, "GO");
  assert.equal(root.dataset.phase, "go");
  for (let i = 0; i < 50; i++) fx.update(frame(car), 1 / 60);
  assert.equal(root.hidden, true);
  fx.dispose();
  assert.equal(root.querySelector(".vfx-countdown-value"), null);
});

test("GO expires on elapsed presentation time at 10 FPS with motion disabled", () => {
  const { host, nodes } = fakeHost(["countdown"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  const root = nodes.get("countdown")!;
  fx.update(frame(car, { countdown: 1, motion: 0 }), 0.1);
  fx.update(frame(car, { motion: 0 }), 0.1);
  for (let i = 0; i < 7; i++) fx.update(frame(car, { motion: 0 }), 0.1);
  assert.equal(root.hidden, false);
  fx.update(frame(car, { motion: 0 }), 0.1);
  assert.equal(root.hidden, true);
  fx.dispose();
});

test("GO waits for actual delayed release and freezes with countdown during pause", () => {
  const { host, nodes } = fakeHost(["countdown"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  const root = nodes.get("countdown")!;
  fx.update(frame(car, { countdown: 1, releaseRemaining: 2 }), 1 / 60);
  fx.update(frame(car, { countdown: 0, releaseRemaining: 1 }), 1 / 60);
  assert.equal(root.hidden, true);
  fx.update(frame(car), 1 / 60);
  const value = root.querySelector(".vfx-countdown-value")!;
  assert.equal(value.textContent, "GO");
  for (let i = 0; i < 120; i++) fx.update(frame(car, { paused: true }), 1 / 60);
  assert.equal(root.hidden, false);
  assert.equal(value.textContent, "GO");
  fx.update(frame(car, { active: false }), 1 / 60);
  assert.equal(root.hidden, true);
  fx.dispose();
});

test("countdown respects static mode and clears GO on long frames or a new race", () => {
  const { host, nodes } = fakeHost(["countdown"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  const root = nodes.get("countdown")!;
  fx.update(frame(car, { countdown: 1, motion: 0 }), 1 / 60);
  assert.equal(root.dataset.motion, "off");
  assert.equal(root.querySelector(".vfx-countdown-value")?.textContent, "1");
  fx.update(frame(car, { motion: 0 }), 1 / 60);
  assert.equal(root.querySelector(".vfx-countdown-value")?.textContent, "GO");
  fx.update(frame(car), 0.8);
  assert.equal(root.hidden, true);
  fx.update(frame(car, { countdown: 1 }), 1 / 60);
  fx.update(frame(car), 1 / 60);
  fx.update(frame(car, { raceId: "new-countdown", countdown: 3 }), 1 / 60);
  assert.equal(root.querySelector(".vfx-countdown-value")?.textContent, "3");
  fx.reset();
  assert.equal(root.hidden, true);
  fx.dispose();
});

test("motion zero keeps static state but skips all one-shot target animation classes", () => {
  const { host, nodes } = fakeHost(["countdown", "nitro-box", "item-hud"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  fx.update(frame(car, { countdown: 3, motion: 0 }), 1 / 60);
  car.energy = 100;
  fx.update(frame(car, { countdown: 1.8, motion: 0 }), 1 / 60);
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-charge-full"),
    true,
  );
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-charge-filled"),
    false,
  );
  assert.equal(
    nodes.get("countdown")?.classList.contains("vfx-countdown-tick"),
    false,
  );
  fx.dispose();
});

test("motion zero preserves real shield state and clears every new one-shot layer", () => {
  const { host } = fakeHost(["nitro-box", "speedometer", "item-hud"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar(),
    items = createItems([car.id]);
  fx.update(frame(car, { items }), 1 / 60);
  items.players[car.id].shield = 2;
  car.nitroUses = 1;
  fx.update(frame(car, { items }), 1 / 60);
  fx.update(frame(car, { items, motion: 0, quality: "low" }), 1 / 60);
  const layer = host.querySelector(".vfx-hud-layer")!;
  assert.equal(
    layer
      .querySelector(".vfx-hud-shield")
      ?.classList.contains("vfx-shield-active"),
    true,
  );
  assert.equal(
    layer
      .querySelector(".vfx-hud-shield")
      ?.classList.contains("vfx-shield-event"),
    false,
  );
  assert.equal(
    layer
      .querySelector(".vfx-hud-burst")
      ?.classList.contains("vfx-burst-active"),
    false,
  );
  assert.equal(
    layer
      .querySelector(".vfx-hud-impact")
      ?.classList.contains("vfx-impact-active"),
    false,
  );
  assert.equal(layer.querySelectorAll(".vfx-energy-trail-active").length, 0);
  fx.dispose();
});

test("switching motion off clears a one-shot animation already in progress", () => {
  const { host, nodes } = fakeHost(["nitro-box"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  car.energy = 99;
  fx.update(frame(car), 1 / 60);
  car.energy = 100;
  fx.update(frame(car), 1 / 60);
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-charge-filled"),
    true,
  );
  fx.update(frame(car, { motion: 0 }), 1 / 60);
  assert.equal(
    nodes.get("nitro-box")?.classList.contains("vfx-charge-filled"),
    false,
  );
  fx.dispose();
});

test("result feedback stays static with motion disabled and cleanup is complete", () => {
  const { host, document } = fakeHost([]);
  const modal = new FakeElement(document, "result-modal");
  const stars = new FakeElement(document, "stars");
  const icons = [
    new FakeElement(document, "ui-icon earned"),
    new FakeElement(document, "ui-icon earned"),
    new FakeElement(document, "ui-icon unearned"),
  ];
  stars.append(...icons);
  modal.append(stars);
  host.append(modal);

  const cleanup = mountResultFeedback(host as unknown as HTMLElement, {
    raceId: "result-a",
    finished: true,
    failed: false,
    stars: 3,
    motion: 0,
    podium: false,
  });
  const layer = host.querySelector(".vfx-result-feedback");
  assert.ok(layer);
  assert.equal(layer.classList.contains("vfx-result-static"), true);
  assert.equal(icons[0].classList.contains("vfx-result-star-earned"), true);
  assert.equal(icons[1].classList.contains("vfx-result-star-earned"), true);
  assert.equal(icons[2].classList.contains("vfx-result-star-earned"), false);
  cleanup();
  cleanup();
  assert.equal(host.querySelector(".vfx-result-feedback"), null);
  assert.equal(icons[0].classList.contains("vfx-result-star-earned"), false);
});

test("result gate is consumed with motion off and podium omits the generic status mark", () => {
  const { host, document } = fakeHost([]);
  host.append(new FakeElement(document, "result-modal"));
  const options = {
    raceId: "result-gate-motion",
    finished: true,
    failed: false,
    stars: 0,
    motion: 0,
    podium: false,
  };
  mountResultFeedback(host as unknown as HTMLElement, options)();
  const cleanup = mountResultFeedback(host as unknown as HTMLElement, {
    ...options,
    motion: 1,
  });
  assert.equal(
    host
      .querySelector(".vfx-result-feedback")
      ?.classList.contains("vfx-result-static"),
    true,
  );
  cleanup();

  const podiumCleanup = mountResultFeedback(host as unknown as HTMLElement, {
    ...options,
    raceId: "result-podium",
    motion: 1,
    podium: true,
  });
  assert.equal(host.querySelector(".vfx-result-status-mark"), null);
  assert.equal(host.querySelector(".vfx-result-fragments"), null);
  podiumCleanup();
});

test("a saved final-lap PB is carried into results and never replays on remount", () => {
  const { host, document } = fakeHost([]);
  host.append(new FakeElement(document, "result-modal"));
  const car = spawnCar(),
    state = new HudVfxState();
  state.update(frame(car), 1 / 60);
  car.finished = true;
  assert.equal(
    state.update(frame(car, { active: false, pbSerial: 1 }), 1 / 60).pb,
    false,
  );
  const options = {
    raceId: "final-lap-pb",
    finished: true,
    failed: false,
    stars: 0,
    motion: 1,
    podium: false,
    pb: true,
  };
  let cleanup = mountResultFeedback(host as unknown as HTMLElement, options);
  assert.ok(host.querySelector(".vfx-result-pb"));
  assert.equal(
    host
      .querySelector(".vfx-result-pb")
      ?.classList.contains("vfx-result-pb-animated"),
    true,
  );
  cleanup();
  cleanup = mountResultFeedback(host as unknown as HTMLElement, options);
  assert.equal(
    host
      .querySelector(".vfx-result-pb")
      ?.classList.contains("vfx-result-pb-animated"),
    false,
  );
  cleanup();
  cleanup = mountResultFeedback(host as unknown as HTMLElement, {
    ...options,
    raceId: "failed-pb",
    failed: true,
  });
  assert.equal(host.querySelector(".vfx-result-pb"), null);
  cleanup();
  cleanup = mountResultFeedback(host as unknown as HTMLElement, {
    ...options,
    raceId: "unsaved-pb",
    pb: false,
  });
  assert.equal(host.querySelector(".vfx-result-pb"), null);
  cleanup();
});

test("clearing motion also clears collection animations from actual bottle children", () => {
  const { host, nodes, document } = fakeHost(["nitro-box"]);
  const rail = new FakeElement(document, "nitro-charges"),
    a = new FakeElement(document, "nitro-charge"),
    b = new FakeElement(document, "nitro-charge");
  rail.append(a, b);
  nodes.get("nitro-box")!.append(rail);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  car.storedNitro = 1;
  fx.update(frame(car), 0.02);
  car.storedNitro = 2;
  fx.update(frame(car), 0.02);
  assert.equal(b.classList.contains("vfx-nitro-collected"), true);
  assert.equal(a.classList.contains("vfx-nitro-collected"), false);
  fx.update(frame(car, { motion: 0 }), 0.02);
  assert.equal(b.classList.contains("vfx-nitro-collected"), false);
  fx.dispose();
});

test("consumption targets the previously filled bottle and chaining skips a second main explosion", () => {
  const { host, nodes } = fakeHost(["speedometer", "nitro-box"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  car.storedNitro = 2;
  fx.update(frame(car), 0.02);
  car.nitroUses++;
  car.storedNitro--;
  car.boostTime = 3;
  fx.update(frame(car), 0.02);
  const layer = host.querySelector(".vfx-hud-layer")!;
  assert.equal(
    layer
      .querySelector(".vfx-hud-burst")!
      .classList.contains("vfx-burst-active"),
    true,
  );
  for (let n = 0; n < 25; n++) fx.update(frame(car), 0.02);
  car.nitroUses++;
  car.storedNitro--;
  fx.update(frame(car), 0.02);
  assert.equal(
    layer
      .querySelector(".vfx-hud-burst")!
      .classList.contains("vfx-burst-active"),
    false,
  );
  assert.equal(
    nodes.get("speedometer")!.classList.contains("vfx-speedometer-chain"),
    true,
  );
  fx.dispose();
  const state = new HudVfxState();
  car.storedNitro = 2;
  state.update(frame(car), 0.02);
  car.nitroUses++;
  car.storedNitro = 1;
  assert.equal(state.update(frame(car), 0.02).nitroUsedSlot, 1);
});
test("successful mini arcs survive the consumed window, freeze on pause and expire without a lingering opportunity", () => {
  const { host } = fakeHost(["skill-feedback"]);
  const fx = new HudVfx(host as unknown as HTMLElement),
    car = spawnCar();
  car.miniWindow = 0.5;
  fx.update(frame(car), 0.02);
  car.miniUses++;
  car.miniWindow = 0;
  fx.update(frame(car), 0.02);
  const mini = host.querySelector(".vfx-hud-mini-window")!;
  assert.equal(mini.hidden, false);
  assert.equal(mini.classList.contains("vfx-mini-success"), true);
  fx.update(frame(car, { paused: true }), 0.2);
  assert.equal(mini.hidden, false);
  for (let n = 0; n < 15; n++) fx.update(frame(car), 0.02);
  assert.equal(mini.hidden, true);
  assert.equal(mini.classList.contains("vfx-mini-success"), false);
  fx.dispose();
});
