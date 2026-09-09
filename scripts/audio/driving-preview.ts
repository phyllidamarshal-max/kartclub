import type { GameAudio } from "../../client/audio.ts";
import { preloadCountdownVoice } from "../../client/countdown-voice.ts";

/** Listening harness deliberately drives the production sound system, not copies. */
export function mountDrivingPreview(
  root: HTMLElement,
  getAudio: () => GameAudio,
  unlock: () => void,
) {
  void preloadCountdownVoice();
  let frame = 0,
    generation = 0,
    scenario = "idle",
    elapsed = 0,
    running = false;
  let analyser: AnalyserNode | null = null,
    context: AudioContext | null = null;
  let signalPeak = 0,
    maxRms = 0,
    rms = 0;
  const samples = new Float32Array(2048);
  const label = root.querySelector<HTMLOutputElement>("output")!;
  function stop() {
    generation++;
    cancelAnimationFrame(frame);
    running = false;
    getAudio().resetDrivingSound();
    getAudio().resetCountdown();
    label.textContent =
      scenario === "idle" ? "Choose a driving effect." : "Preview complete.";
  }
  function measure() {
    analyser?.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const n of samples) {
      sum += n * n;
      signalPeak = Math.max(signalPeak, Math.abs(n));
    }
    rms = Math.sqrt(sum / samples.length);
    maxRms = Math.max(maxRms, rms);
  }
  root.addEventListener("click", async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "[data-driving-sound]",
    );
    if (!button) return;
    stop();
    scenario = button.dataset.drivingSound!;
    if (scenario === "stop") {
      label.textContent = "Effects stopped.";
      return;
    }
    const token = generation;
    unlock();
    const audio = getAudio();
    await audio.context?.resume();
    if (generation !== token || !audio.context) return;
    if (context !== audio.context) {
      analyser?.disconnect();
      context = audio.context;
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      audio.effects?.connect(analyser);
    }
    signalPeak = maxRms = 0;
    running = true;
    const start = performance.now();
    let impacted = false;
    const tick = () => {
      if (!running) return;
      elapsed = (performance.now() - start) / 1000;
      const release = elapsed >= 0.25;
      const chain = scenario === "chain" && elapsed >= 1.6;
      const boost =
        ["nitro", "chain"].includes(scenario) && release && elapsed < 3.3;
      const drift = scenario === "drift" && elapsed > 0.3 && elapsed < 2.8;
      const mini = scenario === "mini" && release && elapsed < 0.6;
      audio.update(
        38,
        drift,
        boost,
        scenario !== "countdown" && elapsed < 3.6,
        {
          slipAngle: drift ? 0.3 + Math.sin(elapsed * 2) * 0.1 : 0,
          nitroUses: boost ? (chain ? 2 : 1) : 0,
          miniUses: mini ? 1 : 0,
          miniBoost: mini,
        },
      );
      if (scenario === "countdown" && elapsed >= 0.25)
        audio.countdown(Math.max(0, 3.25 - elapsed));
      if (
        ["wall", "kart", "obstacle"].includes(scenario) &&
        release &&
        !impacted
      ) {
        impacted = true;
        audio.collision(
          scenario === "kart" ? 0.65 : 0.8,
          scenario as "wall" | "kart" | "obstacle",
        );
      }
      measure();
      label.textContent =
        scenario === "countdown"
          ? elapsed < 0.25
            ? "Ready…"
            : elapsed < 3.25
              ? String(Math.ceil(3.25 - elapsed))
              : "GO!"
          : `${button.textContent} · ${elapsed.toFixed(1)} s`;
      if (elapsed >= 4.2) {
        stop();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
  });
  return {
    stop,
    get status() {
      return {
        scenario,
        running,
        elapsed: +elapsed.toFixed(2),
        effectsRms: +rms.toFixed(6),
        maxRms: +maxRms.toFixed(6),
        signalPeak: +signalPeak.toFixed(6),
      };
    },
    dispose() {
      stop();
      analyser?.disconnect();
      analyser = null;
      context = null;
    },
  };
}
