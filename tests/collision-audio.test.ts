import { test } from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "../client/audio.ts";
import { collisionSoundProfile } from "../client/collision-audio.ts";

class FakeParam {
  value = 0;
  events: number[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push(value, time);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push(value, time);
  }
}

class FakeNode {
  connections: unknown[] = [];
  disconnected = false;
  ended: (() => void) | null = null;
  connect(target: unknown) {
    this.connections.push(target);
    return target as FakeNode;
  }
  disconnect() {
    this.disconnected = true;
  }
  addEventListener(type: string, listener: () => void) {
    if (type === "ended") this.ended = listener;
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  startTimes: number[] = [];
  stopTimes: number[] = [];
  start(time = 0) {
    this.startTimes.push(time);
  }
  stop(time: number) {
    this.stopTimes.push(time);
  }
}

class FakeOscillator extends FakeSource {
  type = "sine";
  frequency = new FakeParam();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam();
}

class FakeContext {
  state: AudioContextState = "running";
  currentTime = 1;
  sampleRate = 1000;
  oscillators: FakeOscillator[] = [];
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const node = new FakeSource();
    this.sources.push(node);
    return node;
  }
}

function audioWith(context: FakeContext) {
  const audio = new GameAudio(),
    effects = new FakeGain();
  audio.context = context as unknown as AudioContext;
  audio.effects = effects as unknown as GainNode;
  return { audio, effects };
}

test("collision profile clamps unsafe input and scales heavy impacts", () => {
  const weak = collisionSoundProfile(0.1, "wall"),
    heavy = collisionSoundProfile(2, "wall"),
    kart = collisionSoundProfile(1, "kart"),
    invalid = collisionSoundProfile(Number.NaN, "obstacle");
  assert.equal(heavy.strength, 1);
  assert.equal(invalid.strength, 0);
  assert.ok(heavy.bodyFrequency < weak.bodyFrequency);
  assert.ok(heavy.bodyGain > weak.bodyGain);
  assert.ok(heavy.bodyDuration > weak.bodyDuration);
  assert.ok(kart.bodyGain < heavy.bodyGain);
  assert.ok(Object.values(heavy).every(Number.isFinite));
});

test("collision is silent without a running context", () => {
  assert.doesNotThrow(() => new GameAudio().collision(1, "wall"));
  const context = new FakeContext(),
    { audio } = audioWith(context);
  context.state = "suspended";
  audio.collision(1, "wall");
  assert.equal(context.oscillators.length, 0);
  assert.equal(context.sources.length, 0);
});

test("collision debounces contact episodes and reset permits a fresh sound", () => {
  const context = new FakeContext(),
    { audio } = audioWith(context);
  audio.collision(0.7, "wall");
  audio.collision(0.9, "obstacle");
  assert.equal(context.oscillators.length, 1);
  context.currentTime += 0.12;
  audio.collision(0.9, "obstacle");
  assert.equal(context.oscillators.length, 2);
  audio.resetCollisionSound();
  audio.collision(0.4, "kart");
  assert.equal(context.oscillators.length, 3);
});

test("collision schedules finite bounded voices through effects and cleans up", () => {
  const context = new FakeContext(),
    { audio, effects } = audioWith(context);
  audio.collision(0.8, "wall");
  const body = context.oscillators[0],
    contact = context.sources[0];
  assert.equal(context.gains.length, 2);
  assert.equal(context.filters.length, 2);
  assert.equal(context.gains[0].connections[0], effects);
  assert.equal(context.gains[1].connections[0], effects);
  for (const value of [
    ...body.frequency.events,
    ...context.gains.flatMap((gain) => gain.gain.events),
    ...body.stopTimes,
    ...contact.stopTimes,
  ])
    assert.ok(Number.isFinite(value));
  assert.ok(body.stopTimes[0] - context.currentTime < 0.25);
  assert.ok(contact.stopTimes[0] - context.currentTime < 0.15);
  body.ended?.();
  contact.ended?.();
  assert.ok(body.disconnected && contact.disconnected);
  assert.ok(context.filters.every((node) => node.disconnected));
  assert.ok(context.gains.every((node) => node.disconnected));
});
