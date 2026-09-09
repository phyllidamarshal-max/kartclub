import {
  collisionSoundProfile,
  type CollisionKind,
} from "./collision-audio.ts";
import {
  CountdownVoice,
  COUNTDOWN_VOICE_REVISION,
  type CountdownLoader,
} from "./countdown-voice.ts";
import { UiSounds, type UiSound } from "./ui-audio.ts";
import { DrivingSounds, type DrivingSoundDetails } from "./driving-audio.ts";
import { AUDIO_MIX, DEFAULT_AUDIO, audioPreferences } from "./audio-mix.ts";
import {
  externalMusicCue,
  LOBBY_MUSIC,
  musicTrack,
  type MusicCue,
} from "./music-catalog.ts";
import {
  BufferMusicPlayer,
  type MusicBufferLoader,
  type MusicStatus,
} from "./music-player.ts";

interface GameAudioOptions {
  createContext?: () => AudioContext;
  musicLoader?: MusicBufferLoader;
  countdownLoader?: CountdownLoader;
}

export class GameAudio {
  context: AudioContext | null = null;
  music: GainNode | null = null;
  effects: GainNode | null = null;
  engine: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  musicVolume: number = DEFAULT_AUDIO.music;
  sfxVolume: number = DEFAULT_AUDIO.effects;
  private musicPlayer: BufferMusicPlayer | null = null;
  private selectedCue: MusicCue | null = null;
  private customCue: MusicCue | null = null;
  private musicScene: "lobby" | "race" = "race";
  private uiSounds: UiSounds | null = null;
  private lastCollisionTime = -Infinity;
  private countdownVoice: CountdownVoice | null = null;
  private drivingSounds: DrivingSounds | null = null;
  private collisionVoices = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private collisionsPlayed = 0;
  private lastCollisionKind: CollisionKind | null = null;

  constructor(private readonly options: GameAudioOptions = {}) {}

  get musicStatus(): Readonly<MusicStatus> {
    if (this.musicPlayer) return this.musicPlayer.status;
    return {
      trackId: this.currentCue?.id ?? null,
      title: this.currentCue?.title ?? null,
      state: "idle",
    };
  }

  private get currentCue(): MusicCue | null {
    return this.musicScene === "lobby"
      ? LOBBY_MUSIC
      : // A legacy global theme must never replace a track's own score.
        (this.selectedCue ?? this.customCue);
  }

  setMusicScene(scene: "lobby" | "race") {
    if (scene === "lobby") this.resetDrivingSound();
    this.musicScene = scene;
    const cue = this.currentCue;
    if (this.musicPlayer && cue) void this.musicPlayer.select(cue);
  }

  setTrack(trackId: string) {
    const cue = musicTrack(trackId);
    if (!cue) return;
    this.selectedCue = cue;
    if (this.musicPlayer && this.currentCue)
      void this.musicPlayer.select(this.currentCue);
  }

  start(url: string | null = null) {
    this.customCue = url ? externalMusicCue(url) : null;
    const cue = this.currentCue;
    if (this.context) {
      void this.context.resume().catch(() => {});
      if (cue) void this.musicPlayer?.select(cue);
      return;
    }
    const c = (this.context =
      this.options.createContext?.() ?? new AudioContext());
    this.music = c.createGain();
    this.music.connect(c.destination);
    this.musicPlayer = new BufferMusicPlayer(
      c,
      this.music,
      this.options.musicLoader,
    );
    this.effects = c.createGain();
    this.effects.connect(c.destination);
    this.uiSounds = new UiSounds(c, this.effects);
    this.countdownVoice = new CountdownVoice(
      c,
      this.effects,
      this.options.countdownLoader,
    );
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
    if (cue) void this.musicPlayer.select(cue);
  }
  setVolumes(m: number, s: number) {
    const levels = audioPreferences({ music: m, effects: s });
    this.musicVolume = levels.music;
    this.sfxVolume = levels.effects;
    if (this.music) this.music.gain.value = levels.music * AUDIO_MIX.musicBus;
    if (this.effects)
      this.effects.gain.value = levels.effects * AUDIO_MIX.effectsBus;
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
    o.addEventListener(
      "ended",
      () => {
        o.disconnect();
        v.disconnect();
      },
      { once: true },
    );
    o.start();
    o.stop(c.currentTime + duration + 0.01);
  }
  suspend() {
    this.resetCountdown();
    this.drivingSounds?.quiet();
    this.resetCollisionSound();
    if (this.engineGain && this.context) {
      this.engineGain.gain.cancelScheduledValues(this.context.currentTime);
      this.engineGain.gain.setValueAtTime(0, this.context.currentTime);
    }
    if (this.context?.state === "running")
      void this.context.suspend().catch(() => {});
  }

  ui(kind: UiSound = "tap") {
    if (this.sfxVolume > 0) this.uiSounds?.play(kind);
  }

  get uiStatus() {
    return (
      this.uiSounds?.status ?? { played: 0, lastCue: null, activeVoices: 0 }
    );
  }

  resume() {
    if (this.context && this.context.state !== "closed")
      void this.context.resume().catch(() => {});
  }

  dispose() {
    this.drivingSounds?.dispose();
    this.drivingSounds = null;
    this.resetCollisionSound();
    this.uiSounds?.dispose();
    this.uiSounds = null;
    this.countdownVoice?.dispose();
    this.countdownVoice = null;
    this.musicPlayer?.dispose();
    this.musicPlayer = null;
    try {
      this.engine?.stop();
    } catch {}
    this.engine?.disconnect();
    this.engineGain?.disconnect();
    this.music?.disconnect();
    this.effects?.disconnect();
    const context = this.context;
    this.context = null;
    this.music = null;
    this.effects = null;
    this.engine = null;
    this.engineGain = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
  update(
    speed: number,
    drift: boolean,
    boost: boolean,
    active: boolean,
    details: DrivingSoundDetails = {},
  ) {
    if (!this.context || !this.engine || !this.engineGain) return;
    const audible =
      active && !details.resetting && this.context.state === "running";
    const safeSpeed = Number.isFinite(speed)
      ? Math.min(65, Math.abs(speed))
      : 0;
    this.engine.frequency.setTargetAtTime(
      42 + safeSpeed * 2.2 + (boost ? 45 : 0),
      this.context.currentTime,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(
      audible ? 0.2 : 0,
      this.context.currentTime,
      0.1,
    );
    // Lazy initialization avoids allocating loop buffers while browsing the lobby.
    if (audible) this.prepareDrivingSound();
    this.drivingSounds?.update(
      {
        ...details,
        speed: safeSpeed,
        drifting: drift,
        boosting: boost,
        active: audible,
      },
      this.sfxVolume > 0,
    );
  }
  get drivingStatus() {
    return (
      this.drivingSounds?.status ?? {
        driftLevel: 0,
        boostLevel: 0,
        nitroReleases: 0,
        miniReleases: 0,
        activeBursts: 0,
      }
    );
  }
  /** Prepare during race setup/countdown so buffer synthesis never stalls launch. */
  prepareDrivingSound() {
    if (!this.drivingSounds && this.context && this.effects)
      this.drivingSounds = new DrivingSounds(this.context, this.effects);
  }
  resetDrivingSound() {
    this.drivingSounds?.reset();
    this.resetCollisionSound();
    if (this.engineGain && this.context)
      this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
  }
  beep(final = false) {
    if (this.context)
      this.tone(final ? 880 : 440, 0.2, 0.4, "sine", this.effects!);
  }
  countdown(remaining: number | null) {
    const cue = this.countdownVoice?.update(remaining);
    if (cue !== null && cue !== undefined) this.beep(cue === 0);
  }
  stopCountdown() {
    this.countdownVoice?.stop();
  }
  resetCountdown() {
    this.countdownVoice?.reset();
  }
  get countdownStatus() {
    return (
      this.countdownVoice?.status ?? {
        revision: COUNTDOWN_VOICE_REVISION,
        loaded: 0,
        played: 0,
        lastCue: null,
        active: false,
      }
    );
  }
  collision(strength: number, kind: CollisionKind) {
    const c = this.context;
    if (!c || c.state !== "running" || !this.effects || this.sfxVolume <= 0)
      return;
    const profile = collisionSoundProfile(strength, kind);
    if (profile.strength <= 0 || c.currentTime - this.lastCollisionTime < 0.12)
      return;
    this.lastCollisionTime = c.currentTime;
    this.collisionsPlayed++;
    this.lastCollisionKind = kind;
    while (this.collisionVoices.size > 6)
      this.releaseCollision(this.collisionVoices.keys().next().value!);

    const body = c.createOscillator(),
      bodyFilter = c.createBiquadFilter(),
      bodyGain = c.createGain(),
      bodyEnd = c.currentTime + profile.bodyDuration;
    body.type = kind === "obstacle" ? "triangle" : "sine";
    body.frequency.setValueAtTime(profile.bodyFrequency * 1.35, c.currentTime);
    body.frequency.exponentialRampToValueAtTime(profile.bodyFrequency, bodyEnd);
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = profile.bodyLowpass;
    bodyGain.gain.setValueAtTime(0.0001, c.currentTime);
    bodyGain.gain.linearRampToValueAtTime(
      profile.bodyGain,
      c.currentTime + 0.003,
    );
    bodyGain.gain.exponentialRampToValueAtTime(0.001, bodyEnd);
    body.connect(bodyFilter).connect(bodyGain).connect(this.effects);
    this.collisionVoices.set(body, [bodyFilter, bodyGain]);
    body.addEventListener("ended", () => this.releaseCollision(body, false), {
      once: true,
    });
    body.start(c.currentTime);
    body.stop(bodyEnd + 0.01);

    const sampleCount = Math.max(
        1,
        Math.ceil(c.sampleRate * profile.contactDuration),
      ),
      buffer = c.createBuffer(1, sampleCount, c.sampleRate),
      samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / c.sampleRate,
        noise = Math.random() * 2 - 1;
      const edge = Math.min(
        1,
        t / 0.002,
        (samples.length - 1 - i) / (c.sampleRate * 0.005),
      );
      const contact = (noise - previous * 0.65) * 0.5;
      const ring =
        Math.sin(2 * Math.PI * profile.contactRing * t) *
        0.3 *
        Math.exp(-t * 50);
      samples[i] = (contact + ring) * (1 - i / samples.length) * edge;
      previous = noise;
    }
    const contact = c.createBufferSource(),
      contactFilter = c.createBiquadFilter(),
      contactGain = c.createGain(),
      contactEnd = c.currentTime + profile.contactDuration;
    contact.buffer = buffer;
    contactFilter.type = "lowpass";
    contactFilter.frequency.value = profile.contactLowpass;
    contactGain.gain.setValueAtTime(0.0001, c.currentTime);
    contactGain.gain.linearRampToValueAtTime(
      profile.contactGain,
      c.currentTime + 0.002,
    );
    contactGain.gain.exponentialRampToValueAtTime(0.001, contactEnd);
    contact.connect(contactFilter).connect(contactGain).connect(this.effects);
    this.collisionVoices.set(contact, [contactFilter, contactGain]);
    contact.addEventListener(
      "ended",
      () => this.releaseCollision(contact, false),
      { once: true },
    );
    contact.start(c.currentTime);
    contact.stop(contactEnd + 0.01);
  }
  resetCollisionSound() {
    this.lastCollisionTime = -Infinity;
    for (const source of this.collisionVoices.keys())
      this.releaseCollision(source);
  }
  private releaseCollision(source: AudioScheduledSourceNode, stop = true) {
    const nodes = this.collisionVoices.get(source);
    if (!nodes) return;
    this.collisionVoices.delete(source);
    if (stop) {
      try {
        source.stop();
      } catch {}
    }
    source.disconnect();
    for (const node of nodes) node.disconnect();
  }
  get collisionStatus() {
    return {
      played: this.collisionsPlayed,
      lastKind: this.lastCollisionKind,
      activeVoices: this.collisionVoices.size,
    };
  }
}
