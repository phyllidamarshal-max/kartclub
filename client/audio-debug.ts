import type { GameAudio } from "./audio.ts";

/** Opt-in development probe for real lobby/race transitions and button audio. */
export function mountAudioDebug(audio: GameAudio) {
  const panel = document.createElement("pre");
  panel.id = "audio-diagnostics";
  panel.style.cssText =
    "position:fixed;bottom:8px;right:8px;z-index:10000;pointer-events:none;background:#10251ee8;color:#e6edcf;padding:10px;font:11px monospace;max-height:50vh;overflow:hidden";
  document.body.append(panel);
  let context: AudioContext | null = null;
  let music: AnalyserNode | null = null,
    effects: AnalyserNode | null = null;
  let musicPeak = 0,
    effectsPeak = 0;
  const values = new Float32Array(256);
  const rms = (analyser: AnalyserNode | null) => {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(values);
    return Math.sqrt(values.reduce((sum, n) => sum + n * n, 0) / values.length);
  };
  const tick = setInterval(() => {
    if (audio.context !== context) {
      music?.disconnect();
      effects?.disconnect();
      context = audio.context;
      music = context?.createAnalyser() ?? null;
      effects = context?.createAnalyser() ?? null;
      if (music && effects) {
        music.fftSize = effects.fftSize = 256;
        audio.music?.connect(music);
        audio.effects?.connect(effects);
      }
    }
    const musicRms = rms(music),
      effectsRms = rms(effects);
    musicPeak = Math.max(musicPeak, musicRms);
    effectsPeak = Math.max(effectsPeak, effectsRms);
    panel.textContent = JSON.stringify(
      {
        music: audio.musicStatus,
        context: context?.state ?? "not created",
        musicGain: audio.music?.gain.value ?? 0,
        effectsGain: audio.effects?.gain.value ?? 0,
        musicRms: +musicRms.toFixed(6),
        effectsRms: +effectsRms.toFixed(6),
        musicPeak: +musicPeak.toFixed(6),
        effectsPeak: +effectsPeak.toFixed(6),
        ui: audio.uiStatus,
        driving: audio.drivingStatus,
        collision: audio.collisionStatus,
        countdown: audio.countdownStatus,
      },
      null,
      2,
    );
  }, 50);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      clearInterval(tick);
      music?.disconnect();
      effects?.disconnect();
      panel.remove();
    }
  });
}
