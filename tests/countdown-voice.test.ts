import { test } from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "../client/audio.ts";

class Node {
  connections: unknown[] = [];
  disconnected = false;
  connect(target: unknown) {
    this.connections.push(target);
    return target as Node;
  }
  disconnect() {
    this.disconnected = true;
  }
}
class Source extends Node {
  buffer: AudioBuffer | null = null;
  starts = 0;
  stops = 0;
  ended: (() => void) | null = null;
  start() {
    this.starts++;
  }
  stop() {
    this.stops++;
  }
  addEventListener(_type: string, fn: () => void) {
    this.ended = fn;
  }
}
class Param {
  value = 0;
  cancelScheduledValues() {}
  setValueAtTime() {}
  setTargetAtTime() {}
  exponentialRampToValueAtTime() {}
}
class Context {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = new Node();
  sources: Source[] = [];
  oscillators: Source[] = [];
  gains: Array<Node & { gain: Param }> = [];
  createGain() {
    const g = Object.assign(new Node(), { gain: new Param() });
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new Source();
    this.sources.push(s);
    return s;
  }
  createOscillator() {
    const oscillator = Object.assign(new Source(), {
      frequency: new Param(),
      type: "sine",
    });
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBiquadFilter() {
    return Object.assign(new Node(), {
      frequency: new Param(),
      type: "lowpass",
    });
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}
const buffer = (cue: number) =>
  ({ duration: 0.5, cue }) as unknown as AudioBuffer;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup(
  loader: (cue: number) => Promise<AudioBuffer> = async (cue) => buffer(cue),
) {
  assert.equal(
    typeof GameAudio.prototype.countdown,
    "function",
    "voiced countdown API is missing",
  );
  const context = new Context();
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    countdownLoader: loader,
  });
  audio.start();
  return { context, audio };
}
const played = (c: Context) =>
  c.sources.map((s) => (s.buffer as unknown as { cue: number }).cue);

test("actual countdown edges say 3, 2, 1, GO once, despite duplicate or older snapshots", async () => {
  const { audio, context } = setup();
  await flush();
  for (const remaining of [3, 2.95, 2.2, 2, 2.4, 1.9, 1, 1.1, 0.05, 0, -0.02])
    audio.countdown(remaining);
  assert.deepEqual(played(context), [3, 2, 1, 0]);
  assert.equal(audio.countdownStatus.played, 4);
  assert.equal(audio.countdownStatus.lastCue, 0);
  assert.equal(audio.countdownStatus.loaded, 4);
  assert.equal(
    context.oscillators.length,
    1,
    "loaded speech should not have an electronic beep layered over it",
  );
  assert.ok(
    context.sources.slice(0, -1).every((s) => s.stops === 1 && s.disconnected),
  );
  audio.dispose();
});

test("fresh racing snapshots do not say GO; countdown skips and new races remain correct", async () => {
  const { audio, context } = setup();
  await flush();
  audio.countdown(0);
  assert.deepEqual(played(context), []);
  audio.resetCountdown();
  audio.countdown(3);
  audio.countdown(0);
  assert.deepEqual(played(context), [3, 0]);
  audio.resetCountdown();
  for (const n of [2, 1, 0]) audio.countdown(n);
  assert.deepEqual(played(context), [3, 0, 2, 1, 0]);
  audio.countdown(null);
  audio.countdown(0);
  assert.equal(context.sources.length, 5);
  audio.dispose();
});

test("late decoded numbers never replace a newer cue or a reset session", async () => {
  const pending = new Map<number, (b: AudioBuffer) => void>();
  const { audio, context } = setup(
    (cue) => new Promise((resolve) => pending.set(cue, resolve)),
  );
  audio.countdown(3);
  audio.countdown(2);
  pending.get(3)!(buffer(3));
  await flush();
  assert.equal(context.sources.length, 0);
  pending.get(2)!(buffer(2));
  await flush();
  assert.deepEqual(played(context), [2]);
  audio.countdown(1);
  audio.resetCountdown();
  pending.get(1)!(buffer(1));
  await flush();
  assert.deepEqual(played(context), [2]);
  audio.dispose();
});

test("slow loads and suspended contexts cannot play stale speech", async () => {
  const pending = new Map<number, (b: AudioBuffer) => void>();
  const { audio, context } = setup(
    (cue) => new Promise((resolve) => pending.set(cue, resolve)),
  );
  audio.countdown(3);
  context.currentTime = 0.6;
  pending.get(3)!(buffer(3));
  await flush();
  assert.equal(context.sources.length, 0);
  audio.countdown(2);
  audio.suspend();
  pending.get(2)!(buffer(2));
  await flush();
  assert.equal(context.sources.length, 0);
  audio.resume();
  audio.countdown(0);
  assert.equal(context.sources.length, 0);
  audio.dispose();
});

test("pause cancels speech without replaying the same count; disposal cancels pending GO", async () => {
  let finish!: (b: AudioBuffer) => void;
  const { audio, context } = setup((cue) =>
    cue === 0
      ? new Promise((resolve) => (finish = resolve))
      : Promise.resolve(buffer(cue)),
  );
  await flush();
  audio.countdown(3);
  audio.stopCountdown();
  audio.countdown(2.7);
  assert.deepEqual(played(context), [3]);
  assert.equal(context.sources[0].stops, 1);
  audio.countdown(0);
  audio.dispose();
  finish(buffer(0));
  await flush();
  assert.deepEqual(played(context), [3]);
  assert.equal(context.state, "closed");
});

test("speech shares the effects volume bus and failed voice loads are safe", async () => {
  const { audio, context } = setup();
  await flush();
  audio.setVolumes(0.8, 0.25);
  audio.countdown(3);
  const voiceGain = context.sources[0].connections[0] as Node & { gain: Param };
  assert.equal(
    voiceGain.gain.value,
    1.8,
    "speech stays clear without the old 4x boost",
  );
  assert.equal(voiceGain.connections[0], audio.effects);
  assert.equal(audio.effects!.gain.value, 0.25 * 0.16);
  audio.setVolumes(0.8, 0);
  assert.equal(audio.effects!.gain.value, 0);
  assert.equal(audio.music!.gain.value, 0.8 * 0.25);
  audio.dispose();
  const failed = setup(async () => {
    throw Error("voice unavailable");
  });
  await flush();
  assert.doesNotThrow(() => {
    failed.audio.countdown(3);
    failed.audio.countdown(0);
  });
  await flush();
  assert.equal(failed.context.sources.length, 0);
  assert.equal(
    failed.context.oscillators.length,
    3,
    "unavailable speech retains both countdown fallback cues",
  );
  failed.audio.dispose();
});
