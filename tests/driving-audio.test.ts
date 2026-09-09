import { test } from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "../client/audio.ts";
import {
  DrivingSounds,
  type DrivingSoundFrame,
} from "../client/driving-audio.ts";

class Param {
  value = 0;
  events: number[] = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.events.push(v, t);
  }
  setTargetAtTime(v: number, t: number, d: number) {
    this.value = v;
    this.events.push(v, t, d);
  }
  cancelScheduledValues(_t: number) {}
}
class Node {
  disconnected = false;
  connections: unknown[] = [];
  connect(n: unknown) {
    this.connections.push(n);
    return n as Node;
  }
  disconnect() {
    this.disconnected = true;
  }
}
class Source extends Node {
  buffer: unknown;
  loop = false;
  playbackRate = new Param();
  started = 0;
  stopped = 0;
  ended: (() => void) | null = null;
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  addEventListener(_type: string, callback: () => void) {
    this.ended = callback;
  }
}
class Context {
  currentTime = 0;
  state = "running";
  sampleRate = 12000;
  sources: Source[] = [];
  nodes: Node[] = [];
  data: Float32Array[] = [];
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    this.data.push(data);
    return { duration: length / this.sampleRate, getChannelData: () => data };
  }
  createBufferSource() {
    const n = new Source();
    this.sources.push(n);
    this.nodes.push(n);
    return n;
  }
  createGain() {
    const n = Object.assign(new Node(), { gain: new Param() });
    this.nodes.push(n);
    return n;
  }
  createBiquadFilter() {
    const n = Object.assign(new Node(), {
      type: "lowpass",
      frequency: new Param(),
      Q: new Param(),
    });
    this.nodes.push(n);
    return n;
  }
}
const idle: DrivingSoundFrame = {
  active: true,
  speed: 0,
  drifting: false,
  boosting: false,
  slipAngle: 0,
  nitroUses: 0,
  miniUses: 0,
};
function setup() {
  const context = new Context(),
    output = new Node();
  const audio = new DrivingSounds(
    context as unknown as BaseAudioContext,
    output as unknown as GainNode,
  );
  return { context, output, audio };
}

test("tires require motion and real side slip, then fade through drift recovery", () => {
  const { audio } = setup();
  audio.update({ ...idle, drifting: true, slipAngle: 0.5 });
  assert.equal(audio.status.driftLevel, 0);
  audio.update({ ...idle, speed: 40, drifting: true });
  assert.equal(audio.status.driftLevel, 0);
  audio.update({ ...idle, speed: 40, drifting: true, slipAngle: 0.4 });
  const level = audio.status.driftLevel;
  assert.ok(level > 0.4);
  audio.update({ ...idle, speed: 40, drifting: false, slipAngle: 0.25 });
  assert.ok(audio.status.driftLevel > 0 && audio.status.driftLevel < level);
  audio.update(idle);
  assert.equal(audio.status.driftLevel, 0);
});

test("sustained drift and boost reuse their buffers and voices at any frame rate", () => {
  const { audio, context } = setup();
  audio.update(idle);
  audio.update({
    ...idle,
    speed: 43,
    drifting: true,
    boosting: true,
    nitroUses: 1,
    slipAngle: 0.4,
  });
  const sources = context.sources.length,
    buffers = context.data.length;
  for (let i = 0; i < 600; i++) {
    context.currentTime += 1 / 120;
    audio.update({
      ...idle,
      speed: 43,
      drifting: true,
      boosting: true,
      nitroUses: 1,
      slipAngle: 0.4,
    });
  }
  assert.equal(context.sources.length, sources);
  assert.equal(context.data.length, buffers);
  assert.equal(audio.status.nitroReleases, 1);
});

test("chained nitro retriggers once, rollback and inactive updates do not replay releases", () => {
  const { audio } = setup();
  audio.update(idle);
  audio.update({ ...idle, boosting: true, nitroUses: 1 });
  audio.update({ ...idle, boosting: true, nitroUses: 2 });
  audio.update({ ...idle, boosting: true, nitroUses: 1 });
  audio.update({ ...idle, boosting: false, nitroUses: 1 });
  audio.update({ ...idle, boosting: true, nitroUses: 2 });
  assert.equal(audio.status.nitroReleases, 2);
  audio.update({ ...idle, active: false, boosting: true, nitroUses: 3 });
  audio.update({ ...idle, boosting: true, nitroUses: 3 });
  assert.equal(audio.status.nitroReleases, 2);
  audio.quiet();
  audio.update({ ...idle, boosting: true, nitroUses: 4 });
  assert.equal(audio.status.nitroReleases, 2);
  audio.update({ ...idle, boosting: true, nitroUses: 5 });
  assert.equal(audio.status.nitroReleases, 3);
});

test("mini boost is distinct, item boost still has a release, and reset allows a new race", () => {
  const { audio } = setup();
  audio.update(idle);
  audio.update({ ...idle, miniBoost: true, miniUses: 1 });
  audio.update({ ...idle, miniBoost: true, miniUses: 1 });
  assert.equal(audio.status.miniReleases, 1);
  assert.equal(audio.status.nitroReleases, 0);
  audio.update({ ...idle, boosting: true });
  assert.equal(audio.status.nitroReleases, 1);
  audio.reset();
  audio.update(idle);
  audio.update({ ...idle, boosting: true, nitroUses: 1 });
  assert.equal(audio.status.nitroReleases, 2);
});

test("muted or suspended events are consumed without replay, and unsafe input stays finite", () => {
  const { audio, context } = setup();
  audio.update(idle);
  context.state = "suspended";
  audio.update({ ...idle, boosting: true, nitroUses: 1 });
  context.state = "running";
  audio.update({ ...idle, boosting: true, nitroUses: 1 });
  assert.equal(audio.status.nitroReleases, 0);
  audio.update({ ...idle, boosting: true, nitroUses: 2 }, false);
  audio.update({ ...idle, boosting: true, nitroUses: 2 });
  assert.equal(audio.status.nitroReleases, 0);
  audio.update({ ...idle, speed: NaN, slipAngle: Infinity, nitroUses: NaN });
  assert.equal(audio.status.driftLevel, 0);
  assert.ok(Object.values(audio.status).every(Number.isFinite));
});

test("synthesis is finite with soft endpoints; repeated bursts are bounded and dispose cleans all nodes", () => {
  const { audio, context } = setup();
  audio.update(idle);
  for (let i = 1; i <= 40; i++)
    audio.update({ ...idle, boosting: true, nitroUses: i });
  assert.ok(audio.status.activeBursts <= 4);
  for (const data of context.data) {
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some((v) => Math.abs(v) > 0.01));
    assert.ok(data.every((v) => Math.abs(v) <= 0.95));
    assert.ok(
      Math.abs(data[0]) < 0.001 && Math.abs(data[data.length - 1]) < 0.001,
    );
  }
  audio.dispose();
  audio.dispose();
  assert.equal(audio.status.activeBursts, 0);
  assert.ok(context.sources.every((n) => n.stopped > 0));
  assert.ok(context.nodes.every((n) => n.disconnected));
  const count = context.sources.length;
  audio.update({ ...idle, boosting: true });
  assert.equal(context.sources.length, count);
});

test("GameAudio routes driving through effects, respects saved mute and resets all driving layers", () => {
  const c = new Context();
  const audio = new GameAudio();
  audio.context = c as unknown as AudioContext;
  const effects = c.createGain(),
    engineGain = c.createGain();
  audio.effects = effects as unknown as GainNode;
  audio.engineGain = engineGain as unknown as GainNode;
  audio.engine = Object.assign(new Source(), {
    frequency: new Param(),
  }) as unknown as OscillatorNode;
  audio.setVolumes(0.45, 0.65);
  audio.prepareDrivingSound();
  assert.equal(effects.gain.value, 0.65 * 0.16);
  audio.update(40, true, true, true, { slipAngle: 0.4, nitroUses: 1 });
  assert.equal(audio.drivingStatus.nitroReleases, 1);
  assert.ok(audio.drivingStatus.driftLevel > 0);
  assert.ok(c.nodes.filter((n) => n.connections.includes(effects)).length >= 4);
  audio.setVolumes(0.45, 0);
  audio.update(40, true, true, true, { slipAngle: 0.4, nitroUses: 2 });
  assert.equal(effects.gain.value, 0);
  assert.equal(audio.drivingStatus.activeBursts, 0);
  audio.setVolumes(0.45, 0.65);
  audio.update(40, true, true, true, { slipAngle: 0.4, nitroUses: 2 });
  assert.equal(audio.drivingStatus.nitroReleases, 1);
  audio.resetDrivingSound();
  assert.equal(audio.drivingStatus.driftLevel, 0);
  assert.equal(audio.drivingStatus.boostLevel, 0);
  assert.equal(audio.drivingStatus.activeBursts, 0);
  assert.equal(engineGain.gain.value, 0);
});
