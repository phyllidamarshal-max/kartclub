import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar } from "../shared/race.ts";
import { CountdownVfx } from "../client/vfx/countdown.ts";
import type { HudVfxFrame } from "../client/vfx/hud-state.ts";
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

test("anticipation follows the actual final 120ms and clears on pause/motion changes and reset", () => {
  const doc = new FakeDocument(),
    root = new FakeElement(doc),
    fx = new CountdownVfx(root as unknown as HTMLElement);
  const car = spawnCar();
  const f = {
    raceId: "a",
    active: true,
    failed: false,
    paused: false,
    confirmed: car,
    countdown: 0.2,
  } as HudVfxFrame;
  fx.update(f, 0.02, false, true);
  assert.equal(root.dataset.compress, "off");
  fx.update({ ...f, countdown: 0.1 }, 0.02, false, true);
  assert.equal(root.dataset.compress, "on");
  fx.update({ ...f, paused: true, countdown: 0 }, 0.02, true, true);
  assert.equal(root.dataset.compress, "on");
  fx.update({ ...f, paused: true, countdown: 0 }, 0.02, true, false);
  assert.equal(root.dataset.compress, "off");
  fx.update({ ...f, countdown: 0 }, 0.02, true, true);
  assert.equal(root.querySelector(".vfx-countdown-value")!.textContent, "GO");
  for (let n = 0; n < 40; n++)
    fx.update({ ...f, countdown: 0 }, 0.02, false, true);
  assert.equal(root.hidden, true);
  fx.reset();
  assert.equal(root.dataset.compress, undefined);
  fx.dispose();
  assert.equal(root.children.length, 0);
});
