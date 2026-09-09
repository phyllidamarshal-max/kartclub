import { test } from "node:test";
import assert from "node:assert/strict";
import { audioPreferences, DEFAULT_AUDIO } from "../client/audio-mix.ts";
import { GameAudio } from "../client/audio.ts";

test("new settings and GameAudio use the same balanced baseline", () => {
  const audio = new GameAudio();
  assert.deepEqual(audioPreferences(null), { music: 0.45, effects: 0.65 });
  assert.equal(audio.musicVolume, DEFAULT_AUDIO.music);
  assert.equal(audio.sfxVolume, DEFAULT_AUDIO.effects);
});

test("saved mute/custom choices survive defaults and missing values use the baseline", () => {
  assert.deepEqual(audioPreferences({ music: 0, effects: 0.18 }), {
    music: 0,
    effects: 0.18,
  });
  assert.deepEqual(audioPreferences({ music: 0.8 }), {
    music: 0.8,
    effects: 0.65,
  });
  assert.deepEqual(audioPreferences({ effects: 0 }), {
    music: 0.45,
    effects: 0,
  });
});

test("invalid volumes are repaired and live gains never receive non-finite or out-of-range values", () => {
  assert.deepEqual(
    audioPreferences({ music: NaN, effects: "0.5" }),
    DEFAULT_AUDIO,
  );
  assert.deepEqual(audioPreferences({ music: -1, effects: 2 }), {
    music: 0,
    effects: 1,
  });
  const audio = new GameAudio();
  audio.setVolumes(Infinity, NaN);
  assert.equal(audio.musicVolume, DEFAULT_AUDIO.music);
  assert.equal(audio.sfxVolume, DEFAULT_AUDIO.effects);
  audio.setVolumes(-5, 2);
  assert.equal(audio.musicVolume, 0);
  assert.equal(audio.sfxVolume, 1);
});
