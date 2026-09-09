/** Original tire and nitro textures. Buffers are created once per audio session. */
export interface DrivingSoundDetails {
  slipAngle?: number;
  nitroUses?: number;
  miniUses?: number;
  miniBoost?: boolean;
  resetting?: boolean;
}
export interface DrivingSoundFrame extends DrivingSoundDetails {
  active: boolean;
  speed: number;
  drifting: boolean;
  boosting: boolean;
}

const TAU = Math.PI * 2;
const clamp = (n: number, lo = 0, hi = 1) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
type Texture = "rubber" | "squeal" | "jet" | "nitro" | "mini";

function texture(context: BaseAudioContext, kind: Texture): AudioBuffer {
  const duration = kind === "nitro" ? 0.68 : kind === "mini" ? 0.28 : 2;
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 9137,
    smooth = 0,
    peak = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    smooth += 0.16 * (noise - smooth);
    const t = i / context.sampleRate;
    // Both loop boundaries and one-shot endpoints meet silence without a step.
    const edge = Math.min(
      1,
      t / 0.008,
      (samples.length - 1 - i) / (context.sampleRate * 0.012),
    );
    let value: number;
    if (kind === "rubber") {
      value =
        (noise * 0.72 + smooth * 0.28) * (0.84 + 0.16 * Math.sin(TAU * 19 * t));
    } else if (kind === "squeal") {
      value =
        0.65 * Math.sin(TAU * 710 * t + 0.7 * Math.sin(TAU * 7 * t)) +
        0.28 * Math.sin(TAU * 1130 * t + 0.4 * Math.sin(TAU * 13 * t));
    } else if (kind === "jet") {
      value =
        (smooth * 1.6 + noise * 0.15 + 0.13 * Math.sin(TAU * 155 * t)) *
        (0.88 + 0.12 * Math.sin(TAU * 36 * t));
    } else {
      const mini = kind === "mini";
      const decay = Math.exp(-t / (mini ? 0.065 : 0.15));
      const phase =
        TAU *
        ((mini ? 100 : 52) * t + (mini ? 5 : 10) * (1 - Math.exp(-t / 0.065)));
      value =
        (smooth * 2.5 + noise * 0.35) * decay +
        0.65 * Math.sin(phase) * Math.exp(-t / 0.085) +
        noise * 0.16 * Math.exp(-t / 0.025);
    }
    samples[i] = value * edge;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const scale = Math.min(1, 0.9 / Math.max(peak, 0.001));
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return buffer;
}

interface Layer {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class DrivingSounds {
  private rubber: Layer;
  private squeal: Layer;
  private jet: Layer;
  private bursts = new Map<AudioBufferSourceNode, GainNode>();
  private nitroBuffer: AudioBuffer;
  private miniBuffer: AudioBuffer;
  private disposed = false;
  private boosting = false;
  private miniBoosting = false;
  private nitroCount: number | undefined;
  private miniCount: number | undefined;
  private suppressAttack = false;
  private driftLevel = 0;
  private boostLevel = 0;
  private nitroReleases = 0;
  private miniReleases = 0;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly output: GainNode,
  ) {
    this.rubber = this.layer("rubber", "bandpass", 1700, 0.6);
    this.squeal = this.layer("squeal", "lowpass", 2100, 0.5);
    this.jet = this.layer("jet", "lowpass", 1800, 0.6);
    this.nitroBuffer = texture(context, "nitro");
    this.miniBuffer = texture(context, "mini");
  }

  get status() {
    return {
      driftLevel: this.driftLevel,
      boostLevel: this.boostLevel,
      nitroReleases: this.nitroReleases,
      miniReleases: this.miniReleases,
      activeBursts: this.bursts.size,
    };
  }

  private layer(
    kind: Texture,
    type: BiquadFilterType,
    frequency: number,
    q: number,
  ): Layer {
    const c = this.context,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    source.buffer = texture(c, kind);
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.output);
    source.start();
    return { source, filter, gain };
  }

  update(frame: DrivingSoundFrame, audible = true) {
    if (this.disposed) return;
    const c = this.context,
      now = c.currentTime;
    const active =
      frame.active && !frame.resetting && audible && c.state === "running";
    const nitroCount = this.counter(frame.nitroUses),
      miniCount = this.counter(frame.miniUses);
    const newNitro =
      nitroCount !== undefined &&
      this.nitroCount !== undefined &&
      nitroCount > this.nitroCount;
    const newMini =
      miniCount !== undefined &&
      this.miniCount !== undefined &&
      miniCount > this.miniCount;
    const staleNitro =
      nitroCount !== undefined &&
      this.nitroCount !== undefined &&
      nitroCount < this.nitroCount;
    const staleMini =
      miniCount !== undefined &&
      this.miniCount !== undefined &&
      miniCount < this.miniCount;
    if (active && !this.suppressAttack) {
      if (frame.boosting && !staleNitro && (newNitro || !this.boosting))
        this.burst(false);
      else if (frame.miniBoost && !staleMini && (newMini || !this.miniBoosting))
        this.burst(true);
    }
    // High-water marks consume muted/paused events and ignore snapshot rollback.
    if (nitroCount !== undefined)
      this.nitroCount = Math.max(this.nitroCount ?? 0, nitroCount);
    if (miniCount !== undefined)
      this.miniCount = Math.max(this.miniCount ?? 0, miniCount);
    if (!staleNitro) this.boosting = frame.boosting;
    if (!staleMini) this.miniBoosting = !!frame.miniBoost;
    this.suppressAttack = false;

    const speed = clamp(Math.abs(frame.speed), 0, 65);
    const slip =
      frame.slipAngle === undefined
        ? frame.drifting
          ? 0.3
          : 0
        : Math.abs(frame.slipAngle);
    const velocity = clamp((speed - 12) / 28);
    const sideLoad = clamp((slip - 0.12) / 0.4);
    this.driftLevel = active ? velocity * sideLoad : 0;
    this.boostLevel =
      active && frame.boosting ? 0.65 + 0.35 * clamp(speed / 50) : 0;
    this.rubber.gain.gain.setTargetAtTime(
      this.driftLevel * 0.65,
      now,
      this.driftLevel ? 0.035 : 0.065,
    );
    this.squeal.gain.gain.setTargetAtTime(this.driftLevel * 0.085, now, 0.05);
    this.rubber.filter.frequency.setTargetAtTime(
      1100 + velocity * 1500,
      now,
      0.08,
    );
    this.squeal.source.playbackRate.setTargetAtTime(
      0.88 + velocity * 0.2 + sideLoad * 0.12,
      now,
      0.07,
    );
    this.jet.gain.gain.setTargetAtTime(
      this.boostLevel * 0.48,
      now,
      this.boostLevel ? 0.045 : 0.1,
    );
    this.jet.filter.frequency.setTargetAtTime(1100 + speed * 22, now, 0.1);
    if (!active && this.bursts.size) this.stopBursts();
  }

  private counter(value: number | undefined) {
    return value !== undefined && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : undefined;
  }

  private burst(mini: boolean) {
    while (this.bursts.size >= 4)
      this.release(this.bursts.keys().next().value!);
    const c = this.context,
      source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = mini ? this.miniBuffer : this.nitroBuffer;
    gain.gain.value = mini ? 0.48 : 0.85;
    source.connect(gain).connect(this.output);
    this.bursts.set(source, gain);
    source.addEventListener("ended", () => this.release(source, false), {
      once: true,
    });
    source.start();
    source.stop(c.currentTime + source.buffer.duration + 0.01);
    if (mini) this.miniReleases++;
    else this.nitroReleases++;
  }

  private release(source: AudioBufferSourceNode, stop = true) {
    const gain = this.bursts.get(source);
    if (!gain) return;
    this.bursts.delete(source);
    if (stop) {
      try {
        source.stop();
      } catch {}
    }
    source.disconnect();
    gain.disconnect();
  }
  private stopBursts() {
    for (const source of this.bursts.keys()) this.release(source);
  }

  /** Hide/suspend must silence immediately and must not replay a launch on return. */
  quiet() {
    this.suppressAttack = true;
    this.driftLevel = this.boostLevel = 0;
    for (const layer of [this.rubber, this.squeal, this.jet]) {
      layer.gain.gain.cancelScheduledValues(this.context.currentTime);
      layer.gain.gain.setValueAtTime(0, this.context.currentTime);
    }
    this.stopBursts();
  }
  reset() {
    this.quiet();
    this.boosting = this.miniBoosting = this.suppressAttack = false;
    this.nitroCount = this.miniCount = undefined;
  }
  dispose() {
    if (this.disposed) return;
    this.quiet();
    this.disposed = true;
    for (const layer of [this.rubber, this.squeal, this.jet]) {
      try {
        layer.source.stop();
      } catch {}
      layer.source.disconnect();
      layer.filter.disconnect();
      layer.gain.disconnect();
    }
  }
}
