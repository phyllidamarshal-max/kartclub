import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTDOWN_VOICE_REVISION } from "../client/countdown-voice.ts";

test("all four spoken countdown assets are short, audible mono PCM with headroom", () => {
  const pack = JSON.parse(
    readFileSync(
      new URL("../public/audio/countdown/en/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  let bytes = 0;
  for (const cue of [3, 2, 1, 0]) {
    const b = readFileSync(
      new URL(`../public/audio/countdown/en/${cue}.wav`, import.meta.url),
    );
    assert.equal(b.toString("ascii", 0, 4), "RIFF");
    assert.equal(b.toString("ascii", 8, 12), "WAVE");
    assert.equal(b.readUInt16LE(20), 1);
    assert.equal(b.readUInt16LE(22), 1);
    assert.equal(b.readUInt16LE(34), 16);
    const rate = b.readUInt32LE(24),
      count = b.readUInt32LE(40) / 2;
    assert.equal(b.length, 44 + count * 2);
    assert.ok(count / rate > 0.2 && count / rate < 0.8);
    let peak = 0,
      energy = 0,
      first = -1;
    for (let i = 0; i < count; i++) {
      const v = b.readInt16LE(44 + i * 2) / 32768;
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
      if (first < 0 && Math.abs(v) > 0.02) first = i;
    }
    assert.ok(peak > 0.45 && peak < 0.9);
    assert.ok(Math.sqrt(energy / count) > 0.08);
    assert.ok(first / rate < 0.08, "speech begins promptly");
    assert.equal(b.readInt16LE(44), 0);
    assert.equal(b.readInt16LE(b.length - 2), 0);
    const record = pack.clips.find((clip: { cue: number }) => clip.cue === cue);
    assert.ok(Math.abs(record.seconds - count / rate) < 0.000001);
    assert.ok(Math.abs(record.peak - peak) < 0.0001);
    assert.ok(Math.abs(record.rms - Math.sqrt(energy / count)) < 0.0001);
    bytes += b.length;
  }
  assert.ok(bytes < 80000);
});

test("the bright countdown stays crisp and GO ends promptly with vocal headroom", () => {
  const pack = JSON.parse(
    readFileSync(
      new URL("../public/audio/countdown/en/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(pack.version, 4);
  assert.equal(pack.version, COUNTDOWN_VOICE_REVISION);
  const numbers = pack.clips.filter((clip: { cue: number }) => clip.cue !== 0);
  const go = pack.clips.find((clip: { cue: number }) => clip.cue === 0);
  assert.ok(go.seconds <= 0.36, "GO must not trail after the start");
  assert.ok(numbers.every((n: { seconds: number }) => n.seconds <= 0.43));
  assert.ok(
    go.rms > Math.max(...numbers.map((n: { rms: number }) => n.rms)) * 1.10,
  );
});
