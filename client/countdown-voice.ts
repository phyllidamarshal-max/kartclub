import { AUDIO_MIX } from "./audio-mix.ts";

export type CountdownCue = 0 | 1 | 2 | 3;
export type CountdownLoader = (cue: CountdownCue) => Promise<AudioBuffer>;
export const COUNTDOWN_VOICE_REVISION = 4;
const cues: readonly CountdownCue[] = [3, 2, 1, 0];
const encoded = new Map<CountdownCue, Promise<ArrayBuffer>>();

function encodedClip(cue: CountdownCue): Promise<ArrayBuffer> {
  const cached = encoded.get(cue);
  if (cached) return cached;
  const request = (async () => {
    const response = await fetch(
      `/audio/countdown/en/${cue}.wav?v=${COUNTDOWN_VOICE_REVISION}`,
    );
    if (!response.ok)
      throw new Error(`Countdown voice unavailable (${response.status})`);
    return response.arrayBuffer();
  })();
  encoded.set(cue, request);
  void request.catch(() => {
    if (encoded.get(cue) === request) encoded.delete(cue);
  });
  return request;
}

/** Fetch only: playback and AudioContext activation still require the start gesture. */
export async function preloadCountdownVoice() {
  await Promise.allSettled(cues.map(encodedClip));
}

/** One actual race countdown. Never queue words or replay a stale network count. */
export class CountdownVoice {
  private last = Infinity;
  private version = 0;
  private disposed = false;
  private source: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;
  private readonly buffers = new Map<CountdownCue, AudioBuffer>();
  private readonly loads = new Map<CountdownCue, Promise<AudioBuffer | null>>();
  private played = 0;
  private lastCue: CountdownCue | null = null;

  constructor(
    private readonly context: AudioContext,
    effects: GainNode,
    loader: CountdownLoader = async (cue) =>
      context.decodeAudioData((await encodedClip(cue)).slice(0)),
  ) {
    this.gain = context.createGain();
    // The effects bus is intentionally quiet for engine tones. This normalizes
    // short spoken cues above the engine while retaining the same volume slider.
    this.gain.gain.value = AUDIO_MIX.countdownVoice;
    this.gain.connect(effects);
    for (const cue of cues) {
      this.loads.set(
        cue,
        (async () => {
          try {
            const buffer = await loader(cue);
            if (!this.disposed) this.buffers.set(cue, buffer);
            return buffer;
          } catch {
            return null;
          }
        })(),
      );
    }
  }

  get status() {
    return {
      revision: COUNTDOWN_VOICE_REVISION,
      loaded: this.buffers.size,
      played: this.played,
      lastCue: this.lastCue,
      active: this.source !== null,
    };
  }

  /** Returns a fallback beep cue only while the corresponding speech is unavailable. */
  update(remaining: number | null): CountdownCue | null {
    if (remaining === null || !Number.isFinite(remaining)) {
      this.reset();
      return null;
    }
    if (this.disposed || this.context.state !== "running") {
      this.stop();
      return null;
    }
    const number = Math.max(0, Math.ceil(remaining));
    if (number > 3 || number >= this.last) return null;
    const armed = this.last !== Infinity;
    this.last = number;
    this.stop();
    if (number === 0 && !armed) return null;
    const cue = number as CountdownCue;
    const version = this.version,
      requestedAt = this.context.currentTime;
    const play = (buffer: AudioBuffer | null) => {
      if (
        !buffer ||
        this.disposed ||
        version !== this.version ||
        this.context.state !== "running" ||
        this.context.currentTime - requestedAt > 0.35
      )
        return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.addEventListener(
        "ended",
        () => {
          source.disconnect();
          if (this.source === source) this.source = null;
        },
        { once: true },
      );
      this.source = source;
      source.start();
      this.played++;
      this.lastCue = cue;
    };
    const buffer = this.buffers.get(cue);
    if (buffer) play(buffer);
    else void this.loads.get(cue)?.then(play);
    return buffer ? null : cue;
  }

  stop() {
    this.version++;
    const source = this.source;
    this.source = null;
    if (source) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
  }
  reset() {
    this.stop();
    this.last = Infinity;
  }
  dispose() {
    this.disposed = true;
    this.reset();
    this.buffers.clear();
    this.loads.clear();
    this.gain.disconnect();
  }
}
