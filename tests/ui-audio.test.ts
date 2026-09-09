import { test } from "node:test";
import assert from "node:assert/strict";
import { UiSounds, uiSoundFor } from "../client/ui-audio.ts";

class Param {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
  }
}
class Node {
  gain = new Param();
  frequency = new Param();
  type = "sine";
  disconnected = false;
  stops: number[] = [];
  ended = () => {};
  connect(target: unknown) {
    return target;
  }
  disconnect() {
    this.disconnected = true;
  }
  addEventListener(_name: string, listener: () => void) {
    this.ended = listener;
  }
  start(_at: number) {}
  stop(at = 0) {
    this.stops.push(at);
  }
}
class Context {
  currentTime = 1;
  state = "running";
  oscillators: Node[] = [];
  gains: Node[] = [];
  createOscillator() {
    const n = new Node();
    this.oscillators.push(n);
    return n;
  }
  createGain() {
    const n = new Node();
    this.gains.push(n);
    return n;
  }
}

test("interface sounds distinguish navigation, selection, launch and back", () => {
  assert.equal(uiSoundFor({ action: "settings" }), "tap");
  assert.equal(uiSoundFor({ mode: "items" }), "select");
  assert.equal(uiSoundFor({ track: "city" }), "select");
  assert.equal(uiSoundFor({ action: "start-custom" }), "confirm");
  assert.equal(uiSoundFor({ action: "close" }), "back");
  assert.equal(
    uiSoundFor({ claim: "123" }),
    "tap",
    "click is not a successful claim",
  );
});

test("UI feedback is throttled, bounded, silent when suspended and releases its nodes", () => {
  const context = new Context();
  const sounds = new UiSounds(
    context as unknown as AudioContext,
    new Node() as unknown as GainNode,
  );
  sounds.play("confirm");
  const firstCount = context.oscillators.length;
  assert.ok(firstCount >= 2 && firstCount <= 3);
  sounds.play("confirm");
  assert.equal(context.oscillators.length, firstCount);
  context.currentTime += 0.1;
  context.state = "suspended";
  sounds.play("select");
  assert.equal(context.oscillators.length, firstCount);
  context.state = "running";
  context.oscillators[0].ended();
  assert.equal(context.oscillators[0].disconnected, true);
  for (let i = 0; i < 20; i++) {
    context.currentTime += 0.1;
    sounds.play("confirm");
  }
  assert.ok(context.oscillators.filter((n) => !n.disconnected).length <= 8);
  sounds.dispose();
  assert.ok(context.oscillators.every((n) => n.disconnected && n.stops.length));
  assert.ok(context.gains.every((n) => n.disconnected));
  const count = context.oscillators.length;
  sounds.play("tap");
  assert.equal(context.oscillators.length, count);
});
