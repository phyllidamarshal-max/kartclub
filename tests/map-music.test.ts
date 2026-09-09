import { test } from "node:test";
import assert from "node:assert/strict";
import { MUSIC_TRACKS, musicTrack } from "../client/music-catalog.ts";
import { NEW_MAPS } from "../shared/map-expansion.ts";
import {
  BufferMusicPlayer,
  type MusicBufferLoader,
  webAudioLoader,
} from "../client/music-player.ts";
import { GameAudio } from "../client/audio.ts";

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: Error) => void;
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeParam {
  value = 0;
  events: Array<[string, number, number]> = [];
  cancelScheduledValues(time: number) {
    this.events.push(["cancel", 0, time]);
  }
  setValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push(["set", value, time]);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push(["linear", value, time]);
  }
  setTargetAtTime(value: number, time: number, _constant: number) {
    this.value = value;
    this.events.push(["target", value, time]);
  }
}

class FakeNode {
  disconnected = false;
  connect(_target: unknown) {
    return _target;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopEnd = 0;
  starts: number[] = [];
  stops: number[] = [];
  private ended: (() => void) | null = null;
  addEventListener(type: string, listener: () => void) {
    if (type === "ended") this.ended = listener;
  }
  start(time = 0) {
    this.starts.push(time);
  }
  stop(time = 0) {
    this.stops.push(time);
  }
  end() {
    this.ended?.();
  }
}

class FakeContext {
  state: AudioContextState = "running";
  currentTime = 4;
  sampleRate = 44_100;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: { value: 0, setTargetAtTime() {} },
      connect(target: unknown) {
        return target as FakeNode;
      },
      start() {},
      stop() {},
      disconnect() {},
    };
  }
  createBiquadFilter() {
    return {
      type: "lowpass",
      frequency: { value: 0 },
      connect(target: unknown) {
        return target as FakeNode;
      },
      disconnect() {},
    };
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

const fakeBuffer = (name: string) =>
  ({ duration: 100, name }) as unknown as AudioBuffer;

const instrumentalCue = (id: string) => ({
  ...musicTrack(id)!,
  environment: undefined,
});

test("environment and music wait for both stems and start on the same clock", async () => {
  const context = new FakeContext();
  const bed = new Deferred<AudioBuffer>();
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    async (urls) =>
      urls[0] === "forest-bed.ogg" ? bed.promise : fakeBuffer("theme"),
  );
  const cue = {
    id: "layered-forest",
    title: "Forest",
    urls: ["theme.ogg"],
    loopEnd: 72,
    environment: { urls: ["forest-bed.ogg"], loopEnd: 72 },
  };
  const pending = player.select(cue);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    context.sources.length,
    0,
    "partial loading must not start a lone stem",
  );
  bed.resolve(fakeBuffer("birds"));
  await pending;
  assert.equal(context.sources.length, 2);
  assert.deepEqual(
    context.sources.map((s) => s.starts),
    [[4.02], [4.02]],
  );
  assert.deepEqual(
    context.sources.map((s) => s.loopEnd),
    [72, 72],
  );
  assert.equal(player.status.stems, 2);
  await player.select({
    id: "lobby-test",
    title: "Lobby",
    urls: ["lobby.ogg"],
  });
  assert.deepEqual(
    context.sources.slice(0, 2).map((s) => s.stops),
    [[4.8], [4.8]],
  );
  player.dispose();
  assert.ok(context.sources.every((s) => s.disconnected));
});

test("a failed environment load retains both stems of the current map", async () => {
  const context = new FakeContext();
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    async (urls) => {
      if (urls[0] === "broken.ogg") throw Error("environment unavailable");
      return fakeBuffer(urls[0]);
    },
  );
  await player.select({
    id: "a",
    title: "A",
    urls: ["a.ogg"],
    environment: { urls: ["a-bed.ogg"], loopEnd: 72 },
    loopEnd: 72,
  });
  await player.select({
    id: "b",
    title: "B",
    urls: ["b.ogg"],
    environment: { urls: ["broken.ogg"], loopEnd: 72 },
    loopEnd: 72,
  });
  assert.equal(player.status.trackId, "a");
  assert.match(player.status.error ?? "", /environment unavailable/);
  assert.equal(context.sources.length, 2);
  assert.ok(context.sources.every((s) => s.stops.length === 0));
  player.dispose();
});

test("late environment loading cannot resurrect a replaced or disposed map", async () => {
  const context = new FakeContext();
  const bed = new Deferred<AudioBuffer>();
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    async (urls) =>
      urls[0] === "slow-bed.ogg" ? bed.promise : fakeBuffer(urls[0]),
  );
  const pending = player.select({
    id: "a",
    title: "A",
    urls: ["a.ogg"],
    environment: { urls: ["slow-bed.ogg"], loopEnd: 72 },
    loopEnd: 72,
  });
  await player.select({ id: "b", title: "B", urls: ["b.ogg"] });
  player.dispose();
  bed.resolve(fakeBuffer("late bed"));
  await pending;
  assert.equal(context.sources.length, 1);
  assert.equal(player.status.state, "disposed");
  assert.ok(context.sources[0].disconnected);
});

test("scene scores retain their own meter, form length and exact loop boundaries", () => {
  assert.deepEqual(
    MUSIC_TRACKS.map((track) => track.id),
    [
      "coast",
      "coast-harbor",
      "coast-breakwater",
      "city",
      "city-factory",
      "city-nightshift",
      "mountain",
      "mountain-pass",
      "mountain-summit",
      ...NEW_MAPS.map((map) => map.id),
    ],
  );
  for (const track of MUSIC_TRACKS) {
    const frames = Math.round(
      (track.bars * track.beatsPerBar * 60 * 44_100) / track.bpm,
    );
    assert.equal(track.loopEnd, frames / 44_100);
    assert.deepEqual(track.urls, [
      `/audio/music/${track.id}.ogg?v=8`,
      `/audio/music/${track.id}.m4a?v=8`,
    ]);
    assert.equal(musicTrack(track.id), track);
  }
  assert.equal(musicTrack("mountain")!.beatsPerBar, 4);
  assert.equal(musicTrack("mountain-pass")!.beatsPerBar, 4);
  assert.equal(musicTrack("city")!.beatsPerBar, 4);
});

test("latest selection wins when loads resolve out of order", async () => {
  const context = new FakeContext();
  const loads = new Map<string, Deferred<AudioBuffer>>();
  const loader: MusicBufferLoader = (urls) => {
    const request = new Deferred<AudioBuffer>();
    loads.set(urls[0], request);
    return request.promise;
  };
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    loader,
  );

  const first = player.select(instrumentalCue("coast")!);
  const second = player.select(instrumentalCue("city")!);
  loads.get("/audio/music/city.ogg?v=8")!.resolve(fakeBuffer("city"));
  await second;
  loads.get("/audio/music/coast.ogg?v=8")!.resolve(fakeBuffer("coast"));
  await first;

  assert.equal(player.status.trackId, "city");
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].loopEnd, musicTrack("city")!.loopEnd);
});

test("same selection is idempotent and a failed replacement keeps current cue", async () => {
  const context = new FakeContext();
  let calls = 0;
  const loader: MusicBufferLoader = async (urls) => {
    calls++;
    if (urls[0].includes("mountain")) throw new Error("decode failed");
    return fakeBuffer("coast");
  };
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    loader,
  );
  await player.select(instrumentalCue("coast")!);
  await player.select(instrumentalCue("coast")!);
  await player.select(instrumentalCue("mountain")!);

  assert.equal(calls, 2);
  assert.equal(context.sources.length, 1);
  assert.equal(player.status.trackId, "coast");
  assert.match(player.status.error ?? "", /decode failed/);
});

test("crossfade stops the old cue and dispose releases every active node", async () => {
  const context = new FakeContext();
  const loader: MusicBufferLoader = async (urls) => fakeBuffer(urls[0]);
  const output = new FakeGain();
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    output as unknown as GainNode,
    loader,
  );
  await player.select(instrumentalCue("coast")!);
  await player.select(instrumentalCue("city")!);

  assert.deepEqual(context.sources[0].stops, [context.currentTime + 0.8]);
  assert.ok(
    context.gains[0].gain.events.some(
      ([kind, value, time]) =>
        kind === "linear" && value === 0 && time === context.currentTime + 0.8,
    ),
  );
  assert.equal(context.sources[0].disconnected, false);
  player.dispose();
  assert.ok(context.sources.every((source) => source.stops.length > 0));
  assert.ok(context.sources.every((source) => source.disconnected));
  assert.ok(context.gains.every((gain) => gain.disconnected));
  assert.equal(player.status.state, "disposed");
});

test("rapid switch fades out from the previous cue's interpolated level", async () => {
  const context = new FakeContext();
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    async (urls) => fakeBuffer(urls[0]),
  );
  await player.select(instrumentalCue("coast")!);
  context.currentTime += 0.4;
  await player.select(instrumentalCue("city")!);

  const outgoing = context.gains[0].gain.events;
  const heldLevel = outgoing.find(
    ([kind, _value, time]) => kind === "set" && time === context.currentTime,
  );
  assert.ok(heldLevel);
  assert.ok(Math.abs(heldLevel[1] - 0.5) < 1e-9);
  assert.ok(
    outgoing.some(
      ([kind, value, time]) =>
        kind === "linear" && value === 0 && time === context.currentTime + 0.8,
    ),
  );
});

test("dispose aborts in-flight loading and ignores a late custom-loader result", async () => {
  const context = new FakeContext();
  const request = new Deferred<AudioBuffer>();
  let signal: AbortSignal | undefined;
  const loader: MusicBufferLoader = (_urls, loadSignal) => {
    signal = loadSignal;
    return request.promise;
  };
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    loader,
  );
  const selection = player.select(instrumentalCue("coast")!);
  player.dispose();
  assert.equal(signal?.aborted, true);
  request.resolve(fakeBuffer("late"));
  await selection;
  assert.equal(context.sources.length, 0);
  assert.equal(player.status.state, "disposed");
});

test("default loader does not decode or try a fallback after abort", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let fetches = 0;
  let decodes = 0;
  globalThis.fetch = (async () => {
    fetches++;
    return {
      ok: true,
      arrayBuffer: async () => {
        controller.abort();
        return new ArrayBuffer(8);
      },
    } as Response;
  }) as typeof fetch;
  const context = {
    decodeAudioData: async () => {
      decodes++;
      return fakeBuffer("decoded");
    },
  } as unknown as AudioContext;
  try {
    await assert.rejects(
      webAudioLoader(context)(["first.ogg", "fallback.m4a"], controller.signal),
      { name: "AbortError" },
    );
    assert.equal(fetches, 1);
    assert.equal(decodes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("decoded cache is bounded and evicts the least recently used cue", async () => {
  const context = new FakeContext();
  const requested: string[] = [];
  const loader: MusicBufferLoader = async (urls) => {
    requested.push(urls[0]);
    return fakeBuffer(urls[0]);
  };
  const player = new BufferMusicPlayer(
    context as unknown as AudioContext,
    new FakeGain() as unknown as GainNode,
    loader,
    2,
  );
  await player.select(instrumentalCue("coast")!);
  await player.select(instrumentalCue("city")!);
  await player.select(instrumentalCue("mountain")!);
  await player.select(instrumentalCue("coast")!);
  assert.equal(
    requested.filter((url) => url === "/audio/music/coast.ogg?v=8").length,
    2,
  );
});

test("GameAudio remembers a map without loading until user activation", async () => {
  const context = new FakeContext();
  let loads = 0;
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    musicLoader: async () => {
      loads++;
      return fakeBuffer("coast");
    },
  });
  audio.setTrack("coast");
  audio.setVolumes(0.6, 0.7);
  assert.equal(loads, 0);
  assert.equal(audio.musicStatus.trackId, "coast");
  assert.equal(audio.musicStatus.state, "idle");

  audio.start(null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 2);
  assert.equal(audio.musicStatus.state, "playing");
  assert.equal(context.gains[0].gain.value, 0.6 * 0.25);
  assert.equal(context.gains[1].gain.value, 0.7 * 0.16);
  audio.dispose();
  assert.equal(context.state, "closed");
});

test("each map keeps its own soundtrack even when legacy global music is supplied", async () => {
  const context = new FakeContext();
  const requested: string[] = [];
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    musicLoader: async (urls) => {
      requested.push(urls[0]);
      return fakeBuffer(urls[0]);
    },
  });
  audio.setTrack("coast");
  audio.start("/custom/theme.mp3");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "coast");
  audio.setTrack("city");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "city");

  audio.start("/custom/theme.mp3");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requested, [
    "/audio/music/coast.ogg?v=8",
    "/audio/music/coast-environment.ogg?v=8",
    "/audio/music/city.ogg?v=8",
    "/audio/music/city-environment.ogg?v=8",
  ]);
  audio.dispose();
});

test("all maps switch to their own buffer after lobby browsing and repeated audio unlocks", async () => {
  const context = new FakeContext();
  const requested: string[] = [];
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    musicLoader: async (urls) => {
      requested.push(urls[0]);
      return fakeBuffer(urls[0]);
    },
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const heard = new Set<string>();
  for (const cue of MUSIC_TRACKS) {
    audio.setMusicScene("lobby");
    audio.setTrack(cue.id);
    audio.start("/legacy/global.mp3");
    await settle();
    assert.equal(audio.musicStatus.trackId, "lobby");
    audio.setMusicScene("race");
    audio.start("/legacy/global.mp3");
    await settle();
    assert.equal(audio.musicStatus.trackId, cue.id);
    assert.equal(audio.musicStatus.title, cue.title);
    assert.equal(audio.musicStatus.state, "playing");
    assert.deepEqual(context.sources.at(-2)?.buffer, fakeBuffer(cue.urls[0]));
    assert.deepEqual(
      context.sources.at(-1)?.buffer,
      fakeBuffer(cue.environment!.urls[0]),
    );
    assert.equal(audio.musicStatus.stems, 2);
    heard.add(audio.musicStatus.trackId!);
    const loads = requested.length;
    audio.start("/legacy/global.mp3");
    await settle();
    assert.equal(
      requested.length,
      loads,
      "normal key/click unlock must not restart the map music",
    );
  }
  assert.equal(heard.size, 19);
  assert.ok(!requested.some((url) => url.includes("global.mp3")));
  audio.dispose();
});

test("each expansion map replaces its base scene music with a distinct buffer", async () => {
  const context = new FakeContext();
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    musicLoader: async (urls) => fakeBuffer(urls[0]),
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  for (const map of NEW_MAPS) {
    audio.setTrack(map.baseId);
    audio.start();
    await settle();
    const baseBuffer = context.sources.at(-1)?.buffer;
    audio.setTrack(map.id);
    await settle();
    const cue = musicTrack(map.id)!;
    assert.equal(cue.id, map.id);
    assert.equal(audio.musicStatus.trackId, map.id);
    assert.equal(audio.musicStatus.state, "playing");
    assert.notDeepEqual(context.sources.at(-1)?.buffer, baseBuffer);
    assert.deepEqual(context.sources.at(-2)?.buffer, fakeBuffer(cue.urls[0]));
    assert.deepEqual(
      context.sources.at(-1)?.buffer,
      fakeBuffer(cue.environment!.urls[0]),
    );
    assert.equal(audio.musicStatus.stems, 2);
  }
  audio.dispose();
});

test("lobby browsing keeps its theme, race entry selects the map, return restores lobby", async () => {
  const context = new FakeContext();
  const requested: string[] = [];
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    musicLoader: async (urls) => {
      requested.push(urls[0]);
      return fakeBuffer(urls[0]);
    },
  });
  audio.setMusicScene("lobby");
  audio.setTrack("coast");
  assert.equal(requested.length, 0);
  assert.equal(audio.musicStatus.trackId, "lobby");
  audio.start();
  await new Promise((resolve) => setImmediate(resolve));
  audio.setTrack("city");
  audio.setMusicScene("lobby");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "lobby");
  assert.equal(requested.length, 1);
  audio.setMusicScene("race");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "city");
  assert.ok(
    context.sources[0].stops.includes(context.currentTime + 0.02 + 0.8),
  );
  audio.setMusicScene("lobby");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "lobby");
  assert.equal(requested.length, 3, "return uses cached lobby buffer");
  audio.dispose();
});

test("an unmapped custom preview still works without replacing lobby music", async () => {
  const context = new FakeContext();
  const audio = new GameAudio({
    createContext: () => context as unknown as AudioContext,
    musicLoader: async (urls) => fakeBuffer(urls[0]),
  });
  audio.setMusicScene("lobby");
  audio.start("/custom/theme.mp3");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "lobby");
  audio.setMusicScene("race");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "external:/custom/theme.mp3");
  audio.setMusicScene("lobby");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.musicStatus.trackId, "lobby");
  audio.dispose();
});
