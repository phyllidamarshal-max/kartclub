/** Short original interface cues, routed only through the effects volume bus. */
export type UiSound = "tap" | "select" | "confirm" | "back";

export function uiSoundFor(data: Record<string, string | undefined>): UiSound {
  if (["close", "exit", "back"].includes(data.action ?? "")) return "back";
  if (
    [
      "start-custom",
      "retry",
      "next",
      "ready",
      "create",
      "join",
      "training",
    ].includes(data.action ?? "") ||
    data.challenge !== undefined
  )
    return "confirm";
  if (data.page || data.track || data.mode || data.view || data.binding)
    return "select";
  return "tap";
}

// MIDI pitches, relative start time, duration, level. Soft attack and short
// releases prevent clicks; perfect intervals keep the feedback simple.
const CUES: Record<
  UiSound,
  readonly (readonly [number, number, number, number])[]
> = {
  tap: [[84, 0, 0.085, 0.4]],
  select: [
    [79, 0, 0.08, 0.31],
    [84, 0.045, 0.11, 0.32],
  ],
  confirm: [
    [72, 0, 0.11, 0.31],
    [76, 0.06, 0.13, 0.3],
    [79, 0.12, 0.19, 0.34],
  ],
  back: [
    [79, 0, 0.075, 0.29],
    [72, 0.05, 0.105, 0.27],
  ],
};

export class UiSounds {
  private lastAt = -Infinity;
  private voices = new Map<OscillatorNode, GainNode>();
  private disposed = false;
  private played = 0;
  private lastCue: UiSound | null = null;
  constructor(
    private readonly context: AudioContext,
    private readonly output: GainNode,
  ) {}

  get status() {
    return {
      played: this.played,
      lastCue: this.lastCue,
      activeVoices: this.voices.size,
    };
  }

  play(kind: UiSound) {
    const c = this.context;
    if (
      this.disposed ||
      c.state !== "running" ||
      c.currentTime - this.lastAt < 0.075
    )
      return;
    this.lastAt = c.currentTime;
    this.played++;
    this.lastCue = kind;
    for (const [note, delay, duration, level] of CUES[kind]) {
      while (this.voices.size >= 8)
        this.release(this.voices.keys().next().value!);
      const osc = c.createOscillator(),
        gain = c.createGain();
      const start = c.currentTime + delay,
        end = start + duration;
      osc.type = "sine";
      osc.frequency.setValueAtTime(440 * 2 ** ((note - 69) / 12), start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.gain.linearRampToValueAtTime(0, end + 0.008);
      osc.connect(gain).connect(this.output);
      this.voices.set(osc, gain);
      osc.addEventListener("ended", () => this.release(osc, false), {
        once: true,
      });
      osc.start(start);
      osc.stop(end + 0.012);
    }
  }

  private release(osc: OscillatorNode, stop = true) {
    const gain = this.voices.get(osc);
    if (!gain) return;
    this.voices.delete(osc);
    if (stop) {
      try {
        osc.stop();
      } catch {}
    }
    osc.disconnect();
    gain.disconnect();
  }

  dispose() {
    this.disposed = true;
    for (const osc of this.voices.keys()) this.release(osc);
  }
}

/** Delegate at document level so screen replacement and keyboard clicks work. */
export function mountUiAudio(
  root: Document,
  audio: { ui(kind: UiSound): void },
  unlock: () => void,
) {
  const enabled = (el: Element) =>
    !el.matches(":disabled,[aria-disabled=true],[aria-busy=true]") &&
    !el.closest("[inert]");
  const activate = (event: Event) => {
    if (!event.isTrusted) return;
    if (
      event instanceof KeyboardEvent &&
      (event.repeat || event.ctrlKey || event.metaKey || event.altKey)
    )
      return;
    unlock();
  };
  const click = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const el = event.target.closest<HTMLElement>(
      "button,a[href],[role=button]",
    );
    if (!el || !enabled(el)) return;
    unlock();
    audio.ui(uiSoundFor(el.dataset));
  };
  let lastRangeAt = -Infinity;
  const input = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const el = event.target;
    if (
      !enabled(el) ||
      !el.matches(
        "select,input[type=range],input[type=checkbox],input[type=radio]",
      )
    )
      return;
    if (el.matches("input[type=range]")) {
      const now = performance.now();
      if (now - lastRangeAt < 140) return;
      lastRangeAt = now;
    }
    unlock();
    audio.ui("select");
  };
  root.addEventListener("pointerdown", activate, true);
  root.addEventListener("keydown", activate, true);
  root.addEventListener("click", click, true);
  // Bubble after settings writes the new gain, so muting suppresses feedback.
  root.addEventListener("input", input);
  return () => {
    root.removeEventListener("pointerdown", activate, true);
    root.removeEventListener("keydown", activate, true);
    root.removeEventListener("click", click, true);
    root.removeEventListener("input", input);
  };
}
