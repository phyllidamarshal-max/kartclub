import {
  collisionSoundProfile,
  type CollisionKind,
} from "./collision-audio.ts";

export class GameAudio {
  context: AudioContext | null = null;
  music: GainNode | null = null;
  effects: GainNode | null = null;
  engine: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  step = 0;
  timer: ReturnType<typeof setInterval> | null = null;
  musicVolume = 0.35;
  sfxVolume = 0.4;
  external: HTMLAudioElement | null = null;
  private lastCollisionTime = -Infinity;
  start(url: string | null = null) {
    if (this.context) {
      void this.context.resume();
      if (this.external) void this.external.play().catch(() => {});
      return;
    }
    const c = (this.context = new AudioContext());
    this.music = c.createGain();
    this.music.connect(c.destination);
    this.effects = c.createGain();
    this.effects.connect(c.destination);
    this.setVolumes(this.musicVolume, this.sfxVolume);
    this.engine = c.createOscillator();
    this.engine.type = "sawtooth";
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 230;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engine.connect(filter).connect(this.engineGain).connect(this.effects);
    this.engine.start();
    if (url) {
      this.external = new Audio(url);
      this.external.loop = true;
      this.external.volume = this.musicVolume * 0.3;
      void this.external.play().catch(() => {});
    } else this.timer = setInterval(() => this.sequence(), 60000 / 132 / 4);
  }
  setVolumes(m: number, s: number) {
    this.musicVolume = m;
    this.sfxVolume = s;
    if (this.music) this.music.gain.value = m * 0.18;
    if (this.effects) this.effects.gain.value = s * 0.16;
    if (this.external) this.external.volume = m * 0.3;
  }
  private tone(
    freq: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    bus: GainNode,
  ) {
    const c = this.context!;
    const o = c.createOscillator(),
      v = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    v.gain.setValueAtTime(gain, c.currentTime);
    v.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(v).connect(bus);
    o.start();
    o.stop(c.currentTime + duration + 0.01);
  }
  private sequence() {
    if (!this.context || this.context.state !== "running") return;
    const i = this.step++ % 64,
      roots = [130.81, 164.81, 110, 146.83],
      root = roots[Math.floor(i / 16)],
      melody = [0, 7, 12, 7, 4, 12, 14, 7, 0, 7, 16, 12, 4, 7, 14, 19];
    if (i % 4 === 0) this.tone(60, 0.16, 1, "sine", this.music!);
    if (i % 4 === 2) this.tone(175, 0.055, 0.3, "triangle", this.music!);
    if (i % 2 === 0)
      this.tone(
        root * (i % 8 === 6 ? 2 : 1),
        0.18,
        0.48,
        "triangle",
        this.music!,
      );
    this.tone(
      root * 2 ** (melody[i % 16] / 12) * 2,
      0.13,
      0.12,
      "sine",
      this.music!,
    );
    if (i % 2) this.tone(4500, 0.018, 0.025, "square", this.music!);
  }
  update(speed: number, drift: boolean, boost: boolean, active: boolean) {
    if (!this.context || !this.engine || !this.engineGain) return;
    this.engine.frequency.setTargetAtTime(
      42 + Math.abs(speed) * 2.2 + (boost ? 45 : 0),
      this.context.currentTime,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(
      active ? 0.2 : 0,
      this.context.currentTime,
      0.1,
    );
    if (drift && Math.random() < 0.08)
      this.tone(
        350 + Math.random() * 180,
        0.05,
        0.025,
        "sawtooth",
        this.effects!,
      );
  }
  beep(final = false) {
    if (this.context)
      this.tone(final ? 880 : 440, 0.2, 0.4, "sine", this.effects!);
  }
  collision(strength: number, kind: CollisionKind) {
    const c = this.context;
    if (!c || c.state !== "running" || !this.effects) return;
    const profile = collisionSoundProfile(strength, kind);
    if (profile.strength <= 0 || c.currentTime - this.lastCollisionTime < 0.12)
      return;
    this.lastCollisionTime = c.currentTime;

    const body = c.createOscillator(),
      bodyFilter = c.createBiquadFilter(),
      bodyGain = c.createGain(),
      bodyEnd = c.currentTime + profile.bodyDuration;
    body.type = "sine";
    body.frequency.setValueAtTime(profile.bodyFrequency * 1.35, c.currentTime);
    body.frequency.exponentialRampToValueAtTime(profile.bodyFrequency, bodyEnd);
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = 320;
    bodyGain.gain.setValueAtTime(profile.bodyGain, c.currentTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, bodyEnd);
    body.connect(bodyFilter).connect(bodyGain).connect(this.effects);
    body.addEventListener(
      "ended",
      () => {
        body.disconnect();
        bodyFilter.disconnect();
        bodyGain.disconnect();
      },
      { once: true },
    );
    body.start(c.currentTime);
    body.stop(bodyEnd + 0.01);

    const sampleCount = Math.max(
        1,
        Math.ceil(c.sampleRate * profile.contactDuration),
      ),
      buffer = c.createBuffer(1, sampleCount, c.sampleRate),
      samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    const contact = c.createBufferSource(),
      contactFilter = c.createBiquadFilter(),
      contactGain = c.createGain(),
      contactEnd = c.currentTime + profile.contactDuration;
    contact.buffer = buffer;
    contactFilter.type = "lowpass";
    contactFilter.frequency.value = profile.contactLowpass;
    contactGain.gain.setValueAtTime(profile.contactGain, c.currentTime);
    contactGain.gain.exponentialRampToValueAtTime(0.001, contactEnd);
    contact.connect(contactFilter).connect(contactGain).connect(this.effects);
    contact.addEventListener(
      "ended",
      () => {
        contact.disconnect();
        contactFilter.disconnect();
        contactGain.disconnect();
      },
      { once: true },
    );
    contact.start(c.currentTime);
    contact.stop(contactEnd + 0.01);
  }
  resetCollisionSound() {
    this.lastCollisionTime = -Infinity;
  }
}
