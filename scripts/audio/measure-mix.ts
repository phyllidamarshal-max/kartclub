import { readFileSync, writeFileSync } from "node:fs";
import { AUDIO_MIX, DEFAULT_AUDIO } from "../../client/audio-mix.ts";

const root = new URL("../../", import.meta.url);
const read = (file: string) => JSON.parse(readFileSync(new URL(file, root), "utf8"));
const db = (gain: number) => 20 * Math.log10(gain);
const round = (value: number) => +value.toFixed(3);
const musicGain = DEFAULT_AUDIO.music * AUDIO_MIX.musicBus;
const voiceGain = DEFAULT_AUDIO.effects * AUDIO_MIX.effectsBus * AUDIO_MIX.countdownVoice;
const maps = read("output/music/render-report.json");
const music = Object.entries(maps).map(([id, value]) => {
  const row = value as { decodedOgg: { rmsDbFS: number; peak: number } };
  return { id, outputRmsDbFS: round(row.decodedOgg.rmsDbFS + db(musicGain)),
    outputPeak: round(row.decodedOgg.peak * musicGain) };
});
const lobby = read("output/music/lobby-validation.json").formats.ogg;
music.push({ id: "lobby", outputRmsDbFS: round(lobby.rmsDbFS + db(musicGain)), outputPeak: round(lobby.peak * musicGain) });

const voice = [3, 2, 1, 0].map(cue => {
  const bytes = readFileSync(new URL(`public/audio/countdown/en/${cue}.wav`, root));
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    const name = bytes.toString("ascii", offset, offset + 4);
    if (name === "fmt ") {
      if (bytes.readUInt16LE(offset + 8) !== 1 || bytes.readUInt16LE(offset + 22) !== 16)
        throw Error("Expected PCM16 voice");
    }
    if (name === "data") { pcm = bytes.subarray(offset + 8, offset + 8 + size); break; }
    offset += 8 + size + size % 2;
  }
  if (!pcm?.length) throw Error("No voice data");
  let energy = 0, peak = 0;
  for (let i=0; i<pcm.length; i+=2) {
    const value = pcm.readInt16LE(i) / 32768;
    energy += value * value; peak = Math.max(peak, Math.abs(value));
  }
  const sourceRms = Math.sqrt(energy / (pcm.length / 2));
  const outputRmsDbFS = db(sourceRms * voiceGain);
  return { cue, sourceRmsDbFS: round(db(sourceRms)), outputRmsDbFS: round(outputRmsDbFS),
    aboveRaceRmsDb: round(outputRmsDbFS - music[0].outputRmsDbFS), outputPeak: round(peak * voiceGain) };
});
const report = {
  defaults: DEFAULT_AUDIO, gains: AUDIO_MIX, music, voice,
  note: "Predicted individual digital bus levels from decoded assets, not LUFS, speaker SPL, subjective listening or a worst-case simultaneous mix test. Music figures use existing validated render reports; voice PCM is read directly.",
};
writeFileSync(new URL("output/music/balance-levels.json", root), JSON.stringify(report, null, 2)+"\n");
console.log(JSON.stringify({ music: music[0], lobby: music.at(-1), voice, defaults: DEFAULT_AUDIO }));
