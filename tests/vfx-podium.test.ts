import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PodiumGate,
  podiumRank,
  type PodiumContext,
} from "../client/vfx/podium.ts";
import { mountPodium } from "../client/vfx/podium-view.ts";

function context(overrides: Partial<PodiumContext> = {}): PodiumContext {
  return {
    raceId: "race-1",
    playerId: "local",
    mode: "race",
    phase: "finished",
    results: [
      { id: "local", rank: 1, finished: true },
      { id: "rival", rank: 2, finished: true },
    ],
    ...overrides,
  };
}

test("podiumRank accepts final race and item podium results, including official ties", () => {
  assert.equal(podiumRank(context()), 1);
  assert.equal(
    podiumRank(
      context({
        mode: "items",
        playerId: "rival",
        results: [
          { id: "local", rank: 1, finished: true },
          { id: "rival", rank: 1, finished: true },
          { id: "third", rank: 3, finished: true },
        ],
      }),
    ),
    1,
  );
});

test("podiumRank rejects non-final, failed, DNF, non-podium and unsupported modes", () => {
  assert.equal(podiumRank(context({ phase: "racing" })), null);
  assert.equal(podiumRank(context({ phase: "cancelled" })), null);
  assert.equal(podiumRank(context({ failed: true })), null);
  assert.equal(
    podiumRank(
      context({
        results: [
          { id: "local", rank: 1, finished: false },
          { id: "rival", rank: 2, finished: true },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    podiumRank(
      context({
        results: [
          { id: "local", rank: 4, finished: true },
          { id: "rival", rank: 1, finished: true },
        ],
      }),
    ),
    null,
  );
  for (const mode of ["time", "practice", "training", "corner-training"])
    assert.equal(podiumRank(context({ mode })), null);
});

test("podiumRank requires two unique real competitors and never counts ghosts", () => {
  assert.equal(
    podiumRank(
      context({ results: [{ id: "local", rank: 1, finished: true }] }),
    ),
    null,
  );
  assert.equal(
    podiumRank(
      context({
        results: [
          { id: "local", rank: 1, finished: true },
          { id: "local", rank: 1, finished: true },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    podiumRank(
      context({
        results: [
          { id: "local", rank: 1, finished: true },
          { id: "ghost", rank: 2, finished: true },
          { id: "ghost-best", rank: 3, finished: true },
        ],
      }),
    ),
    null,
  );
});

test("PodiumGate deduplicates by race and player while retaining the official rank", () => {
  const gate = new PodiumGate();
  assert.deepEqual(gate.take(context()), { rank: 1, animate: true });
  assert.deepEqual(
    gate.take(
      context({
        results: [
          { id: "local", rank: 3, finished: true },
          { id: "rival", rank: 1, finished: true },
        ],
      }),
    ),
    { rank: 3, animate: false },
  );
  assert.deepEqual(gate.take(context({ raceId: "race-2" })), {
    rank: 1,
    animate: true,
  });
  assert.deepEqual(gate.take(context({ playerId: "rival" })), {
    rank: 2,
    animate: true,
  });
  assert.equal(gate.take(context({ phase: "racing" })), null);
});

test("PodiumGate has a 64-identity lifecycle cap and clear permits a fresh animation", () => {
  const gate = new PodiumGate();
  for (let i = 0; i < 65; i++)
    assert.equal(gate.take(context({ raceId: `race-${i}` }))?.animate, true);
  assert.equal(gate.take(context({ raceId: "race-0" }))?.animate, true);
  assert.equal(gate.take(context({ raceId: "race-0" }))?.animate, false);
  gate.clear();
  assert.equal(gate.take(context({ raceId: "race-0" }))?.animate, true);
});

test("PodiumGate shares its 64 identities without standings consuming the medal bit", () => {
  const gate = new PodiumGate();
  assert.equal(gate.takeStandings(context()), true);
  assert.equal(gate.takeStandings(context()), false);
  assert.equal(gate.take(context())?.animate, true);
  assert.equal(gate.take(context())?.animate, false);

  for (let i = 0; i < 65; i++) {
    const fourth = context({
      raceId: `standings-${i}`,
      results: [
        { id: "winner", rank: 1, finished: true },
        { id: "local", rank: 4, finished: true },
      ],
    });
    assert.equal(gate.takeStandings(fourth), true);
  }
  assert.equal(
    gate.takeStandings(
      context({
        raceId: "standings-0",
        results: [
          { id: "winner", rank: 1, finished: true },
          { id: "local", rank: 4, finished: true },
        ],
      }),
    ),
    true,
  );
});

class FakeClassList {
  readonly values = new Set<string>();
  add(...names: string[]) {
    names.forEach((name) => this.values.add(name));
  }
  remove(...names: string[]) {
    names.forEach((name) => this.values.delete(name));
  }
  contains(name: string) {
    return this.values.has(name);
  }
}

class FakeStyle {
  readonly values = new Map<string, string>();
  setProperty(name: string, value: string) {
    this.values.set(name, value);
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly style = new FakeStyle();
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}
  set className(value: string) {
    this.classList.values.clear();
    value
      .split(/\s+/)
      .filter(Boolean)
      .forEach((name) => this.classList.add(name));
  }
  get className() {
    return [...this.classList.values].join(" ");
  }
  append(...nodes: FakeElement[]) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  prepend(...nodes: FakeElement[]) {
    for (const node of [...nodes].reverse()) {
      node.parentElement = this;
      this.children.unshift(node);
    }
  }
  insertBefore(node: FakeElement, before: FakeElement) {
    const index = this.children.indexOf(before);
    node.parentElement = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
  }
  querySelector(selector: string): FakeElement | null {
    const matches = selector.startsWith(".")
      ? (node: FakeElement) => node.classList.contains(selector.slice(1))
      : (node: FakeElement) =>
          node.tagName.toLowerCase() === selector.toLowerCase();
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
}

class FakeDocument {
  createElement(tagName: string) {
    return new FakeElement(tagName, this);
  }
}

function resultHost(withEmblem = true) {
  const doc = new FakeDocument();
  const host = doc.createElement("section");
  const scroll = doc.createElement("div");
  const heading = doc.createElement("h2");
  const classification = doc.createElement("div");
  classification.className = "classification";
  if (withEmblem) {
    const emblem = doc.createElement("div");
    emblem.className = "result-emblem";
    scroll.append(emblem);
  }
  scroll.append(heading, classification);
  for (let i = 0; i < 3; i++) classification.append(doc.createElement("div"));
  host.append(scroll);
  return { host, heading, classification };
}

function countClass(node: FakeElement, name: string): number {
  return (
    Number(node.classList.contains(name)) +
    node.children.reduce((sum, child) => sum + countClass(child, name), 0)
  );
}

test("mountPodium creates a missing emblem, accents actual result ranks, and cleanup is complete", () => {
  const { host, heading, classification } = resultHost(false);
  const tied = context({
    results: [
      { id: "local", rank: 1, finished: true },
      { id: "rival", rank: 1, finished: true },
      { id: "third", rank: 3, finished: true },
    ],
  });
  const cleanup = mountPodium(
    host as unknown as HTMLElement,
    tied,
    { quality: "low", motion: 1 },
    new PodiumGate(),
  );
  const emblem = host.querySelector(".result-emblem");
  assert.ok(emblem);
  const emblemParent = emblem.parentElement;
  assert.ok(emblemParent);
  assert.equal(
    emblemParent.children.indexOf(emblem),
    emblemParent.children.indexOf(heading) - 1,
  );
  assert.equal(countClass(host, "vfx-podium-particle"), 24);
  assert.deepEqual(
    classification.children.map((row) => row.dataset.podiumRank),
    ["1", "1", "3"],
  );
  cleanup();
  cleanup();
  assert.equal(countClass(host, "vfx-podium-medallion"), 0);
  assert.equal(countClass(host, "vfx-podium-overlay"), 0);
  assert.deepEqual(
    classification.children.map((row) => row.dataset.podiumRank),
    [undefined, undefined, undefined],
  );
  assert.equal(host.classList.contains("vfx-podium"), false);
});

test("mountPodium keeps repeated and reduced-motion renders static", () => {
  const gate = new PodiumGate();
  const first = resultHost();
  const cleanupFirst = mountPodium(
    first.host as unknown as HTMLElement,
    context(),
    { quality: "high", motion: 1 },
    gate,
  );
  assert.equal(countClass(first.host, "vfx-podium-particle"), 96);

  const repeated = resultHost();
  const cleanupRepeated = mountPodium(
    repeated.host as unknown as HTMLElement,
    context(),
    { quality: "high", motion: 1 },
    gate,
  );
  assert.equal(countClass(repeated.host, "vfx-podium-medallion"), 1);
  assert.equal(countClass(repeated.host, "vfx-podium-overlay"), 0);

  const reduced = resultHost();
  const cleanupReduced = mountPodium(
    reduced.host as unknown as HTMLElement,
    context({ raceId: "reduced" }),
    { quality: "high", motion: 0 },
    gate,
  );
  assert.equal(countClass(reduced.host, "vfx-podium-medallion"), 1);
  assert.equal(countClass(reduced.host, "vfx-podium-overlay"), 0);
  cleanupFirst();
  cleanupRepeated();
  cleanupReduced();
});

test("mountPodium only accents finished official top-three rows", () => {
  const { host, classification } = resultHost();
  classification.append(host.ownerDocument.createElement("div"));
  const cleanup = mountPodium(
    host as unknown as HTMLElement,
    context({
      results: [
        { id: "local", rank: 1, finished: true },
        { id: "dnf", rank: 2, finished: false },
        { id: "third", rank: 3, finished: true },
        { id: "fourth", rank: 4, finished: true },
      ],
    }),
    { quality: "low", motion: 0 },
    new PodiumGate(),
  );
  assert.deepEqual(
    classification.children.map((row) => row.dataset.podiumRank),
    ["1", undefined, "3", undefined],
  );
  cleanup();
});

test("mountPodium animates standings when the local player finishes fourth without a medal burst", () => {
  const { host, classification } = resultHost();
  classification.append(host.ownerDocument.createElement("div"));
  const cleanup = mountPodium(
    host as unknown as HTMLElement,
    context({
      results: [
        { id: "winner", rank: 1, finished: true },
        { id: "second", rank: 2, finished: true },
        { id: "third", rank: 3, finished: true },
        { id: "local", rank: 4, finished: true },
      ],
    }),
    { quality: "high", motion: 1 },
    new PodiumGate(),
  );
  assert.deepEqual(
    classification.children.map((row) => row.dataset.podiumRank),
    ["1", "2", "3", undefined],
  );
  assert.equal(host.classList.contains("vfx-podium-rows-animated"), true);
  assert.equal(countClass(host, "vfx-podium-medallion"), 0);
  assert.equal(countClass(host, "vfx-podium-particle"), 0);
  cleanup();
  assert.equal(host.classList.contains("vfx-podium"), false);
});

test("standings for a local DNF animate once per race and player, then remain static", () => {
  const gate = new PodiumGate();
  const dnf = context({
    results: [
      { id: "winner", rank: 1, finished: true },
      { id: "second", rank: 2, finished: true },
      { id: "local", rank: 0, finished: false },
    ],
  });
  const first = resultHost();
  const cleanupFirst = mountPodium(
    first.host as unknown as HTMLElement,
    dnf,
    { quality: "low", motion: 1 },
    gate,
  );
  assert.deepEqual(
    first.classification.children.map((row) => row.dataset.podiumRank),
    ["1", "2", undefined],
  );
  assert.equal(first.host.classList.contains("vfx-podium-rows-animated"), true);
  cleanupFirst();

  const repeated = resultHost();
  const cleanupRepeated = mountPodium(
    repeated.host as unknown as HTMLElement,
    dnf,
    { quality: "low", motion: 1 },
    gate,
  );
  assert.deepEqual(
    repeated.classification.children.map((row) => row.dataset.podiumRank),
    ["1", "2", undefined],
  );
  assert.equal(
    repeated.host.classList.contains("vfx-podium-rows-animated"),
    false,
  );
  assert.equal(countClass(repeated.host, "vfx-podium-medallion"), 0);
  cleanupRepeated();
});

test("standings remain undecorated outside successful final race and item results", () => {
  for (const overrides of [
    { phase: "cancelled" },
    { phase: "racing" },
    { mode: "time" },
    { mode: "practice" },
    { failed: true },
  ]) {
    const { host } = resultHost();
    mountPodium(
      host as unknown as HTMLElement,
      context(overrides),
      { quality: "low", motion: 1 },
      new PodiumGate(),
    );
    assert.equal(countClass(host, "vfx-podium-row"), 0);
    assert.equal(host.classList.contains("vfx-podium"), false);
  }
});
