/** Shared starting mix. Saved user volume choices always take precedence. */
export const DEFAULT_AUDIO = Object.freeze({ music: 0.45, effects: 0.65 });

export const AUDIO_MIX = Object.freeze({
  musicBus: 0.25,
  effectsBus: 0.16,
  // With current voice assets, average spoken cues sit roughly 6–8 dB above
  // the race music at the defaults, without the previous 4x voice boost.
  countdownVoice: 1.8,
});

function volume(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function audioPreferences(
  saved?: { music?: unknown; effects?: unknown } | null,
) {
  return {
    music: volume(saved?.music, DEFAULT_AUDIO.music),
    effects: volume(saved?.effects, DEFAULT_AUDIO.effects),
  };
}
