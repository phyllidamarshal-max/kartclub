import type { MusicCue } from "./music-catalog.ts";

export type MusicBufferLoader = (
  urls: readonly string[],
  signal?: AbortSignal,
) => Promise<AudioBuffer>;

export interface MusicStatus {
  trackId: string | null;
  title: string | null;
  state: "idle" | "loading" | "playing" | "disposed";
  error?: string;
  stems?: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  environment?: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
}

const FADE_SECONDS = 0.8;
interface StemBuffers {
  music: AudioBuffer;
  environment?: AudioBuffer;
}

export function webAudioLoader(context: AudioContext): MusicBufferLoader {
  return async (urls, signal) => {
    let lastError: unknown = new Error("No soundtrack URL supplied");
    for (const url of urls) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const response = await fetch(url, { signal });
        if (!response.ok)
          throw new Error(`Soundtrack request failed (${response.status})`);
        const encoded = await response.arrayBuffer();
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const decoded = await context.decodeAudioData(encoded);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return decoded;
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError;
  };
}

export class BufferMusicPlayer {
  private readonly cache = new Map<string, StemBuffers>();
  private readonly pendingLoads = new Map<string, Promise<StemBuffers>>();
  private readonly liveVoices = new Set<Voice>();
  private readonly loadController = new AbortController();
  private voice: Voice | null = null;
  private requestedId: string | null = null;
  private requestVersion = 0;
  private disposed = false;
  private statusValue: MusicStatus = {
    trackId: null,
    title: null,
    state: "idle",
  };

  constructor(
    private readonly context: AudioContext,
    private readonly output: GainNode,
    private readonly loadBuffer: MusicBufferLoader = webAudioLoader(context),
    private readonly cacheLimit = 3,
  ) {}

  get status(): Readonly<MusicStatus> {
    return { ...this.statusValue };
  }

  select(cue: MusicCue): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.requestedId === cue.id) return Promise.resolve();
    this.requestedId = cue.id;
    const version = ++this.requestVersion;
    this.statusValue = {
      ...this.statusValue,
      state: "loading",
      error: undefined,
    };
    return this.bufferFor(cue)
      .then((buffer) => {
        if (this.disposed || version !== this.requestVersion) return;
        this.startVoice(cue, buffer);
      })
      .catch((error: unknown) => {
        if (this.disposed || version !== this.requestVersion) return;
        this.requestedId = this.statusValue.trackId;
        this.statusValue = {
          ...this.statusValue,
          state: this.voice ? "playing" : "idle",
          error: error instanceof Error ? error.message : String(error),
        };
      });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.requestVersion++;
    this.requestedId = null;
    this.loadController.abort();
    for (const voice of [...this.liveVoices]) {
      this.stopVoice(voice, this.context.currentTime);
      this.disconnectVoice(voice);
    }
    this.voice = null;
    this.cache.clear();
    this.pendingLoads.clear();
    this.statusValue = {
      trackId: null,
      title: null,
      state: "disposed",
    };
  }

  private bufferFor(cue: MusicCue) {
    const cached = this.cache.get(cue.id);
    if (cached) {
      this.cache.delete(cue.id);
      this.cache.set(cue.id, cached);
      return Promise.resolve(cached);
    }
    const existing = this.pendingLoads.get(cue.id);
    if (existing) return existing;
    const signal = this.loadController.signal;
    const pending = Promise.all([
      this.loadBuffer(cue.urls, signal),
      cue.environment
        ? this.loadBuffer(cue.environment.urls, signal)
        : undefined,
    ]).then(([music, environment]) => {
      const buffer: StemBuffers = { music, environment };
      this.pendingLoads.delete(cue.id);
      if (this.disposed) return buffer;
      this.cache.set(cue.id, buffer);
      while (this.cache.size > Math.max(1, this.cacheLimit)) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
      return buffer;
    });
    this.pendingLoads.set(cue.id, pending);
    void pending.catch(() => this.pendingLoads.delete(cue.id));
    return pending;
  }

  private startVoice(cue: MusicCue, buffer: StemBuffers) {
    // Leave an audio quantum of headroom so both stems start together even
    // when the render thread advances during source setup.
    const now = this.context.currentTime + (buffer.environment ? 0.02 : 0);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer.music;
    source.loop = true;
    source.loopEnd = cue.loopEnd ?? buffer.music.duration;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
    source.connect(gain).connect(this.output);
    let environment: AudioBufferSourceNode | undefined;
    if (buffer.environment && cue.environment) {
      environment = this.context.createBufferSource();
      environment.buffer = buffer.environment;
      environment.loop = true;
      environment.loopEnd = cue.environment.loopEnd;
      environment.connect(gain);
    }
    const next: Voice = { source, environment, gain, startedAt: now };
    this.liveVoices.add(next);
    source.addEventListener("ended", () => this.disconnectVoice(next), {
      once: true,
    });
    source.start(now);
    environment?.start(now);
    const previous = this.voice;
    this.voice = next;
    if (previous) {
      const level = Math.min(
        1,
        Math.max(0, (now - previous.startedAt) / FADE_SECONDS),
      );
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setValueAtTime(level, now);
      previous.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      previous.source.stop(now + FADE_SECONDS);
      previous.environment?.stop(now + FADE_SECONDS);
    }
    this.statusValue = {
      trackId: cue.id,
      title: cue.title,
      state: "playing",
      stems: environment ? 2 : 1,
    };
  }

  private stopVoice(voice: Voice, when: number) {
    for (const source of [voice.source, voice.environment]) {
      try {
        source?.stop(when);
      } catch {
        /* Other stems still need stopping. */
      }
    }
  }

  private disconnectVoice(voice: Voice) {
    if (!this.liveVoices.delete(voice)) return;
    voice.source.disconnect();
    voice.environment?.disconnect();
    voice.gain.disconnect();
  }
}
