import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const dir = new URL("public/audio/countdown/en/", root);
const input = new URL(
  process.argv.find((a) => a.startsWith("--input="))?.slice(8) ??
    "output/countdown-voice-20260908/arcade-girl-source-v4/",
  root,
);
const prepared = new Map();
const rate = 22050;
const words = { 3: "Three", 2: "Two", 1: "One", 0: "Go!" };
const generation = JSON.parse(
  readFileSync(new URL("generation.json", input), "utf8"),
);
function masterVoice(samples, rms, ceiling) {
  const lookahead = Math.round(rate * 0.006),
    release = Math.exp(-1 / (rate * 0.06));
  const peaks = samples.map((_, i) => {
    let peak = 0;
    for (let j = i; j < Math.min(samples.length, i + lookahead); j++)
      peak = Math.max(peak, Math.abs(samples[j]));
    return peak;
  });
  const render = (level) => {
    let gain = 1;
    return samples.map((sample, i) => {
      const target = Math.min(
        1,
        ceiling / Math.max(0.000001, peaks[i] * level),
      );
      gain = target < gain ? target : target + release * (gain - target);
      return sample * level * gain;
    });
  };
  const inputRms = Math.sqrt(
    samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
  );
  let lo = 0,
    hi = Math.max(20, (rms / Math.max(0.000001, inputRms)) * 2);
  for (let pass = 0; pass < 16; pass++) {
    const mid = (lo + hi) / 2,
      candidate = render(mid);
    const measured = Math.sqrt(
      candidate.reduce((sum, n) => sum + n * n, 0) / candidate.length,
    );
    if (measured < rms) lo = mid;
    else hi = mid;
  }
  return render((lo + hi) / 2);
}
function wav(samples) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write("RIFF");
  out.writeUInt32LE(out.length - 8, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => out.writeInt16LE(s, 44 + i * 2));
  return out;
}
const report = [],
  preview = new Int16Array(Math.ceil(rate * 3.8));
for (const cue of [3, 2, 1, 0]) {
  const path = new URL(cue + ".wav", dir),
    b = readFileSync(new URL(cue + ".wav", input));
  let offset = 12,
    data;
  while (offset + 8 <= b.length) {
    const size = b.readUInt32LE(offset + 4),
      id = b.toString("ascii", offset, offset + 4);
    if (
      id === "fmt " &&
      (b.readUInt16LE(offset + 8) !== 1 ||
        b.readUInt16LE(offset + 10) !== 1 ||
        b.readUInt32LE(offset + 12) !== rate ||
        b.readUInt16LE(offset + 22) !== 16)
    )
      throw Error("Expected mono PCM16 at 22050 Hz");
    if (id === "data") {
      data = b.subarray(offset + 8, offset + 8 + size);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!data) throw Error("Missing WAV data");
  const samples = Array.from({ length: data.length / 2 }, (_, i) =>
    data.readInt16LE(i * 2),
  );
  const first = samples.findIndex((s) => Math.abs(s) > 160),
    last = samples.findLastIndex((s) => Math.abs(s) > 160);
  if (first < 0) throw Error("Silent voice");
  const clean = samples.slice(
    Math.max(0, first - Math.round(rate * 0.012)),
    Math.min(samples.length, last + Math.round(rate * 0.04)),
  );
  const fade = Math.round(rate * 0.005);
  const call = generation.calls.find((call) => call.cue === cue);
  const mastered = masterVoice(
    clean.map((s) => s / 32768),
    call.rms,
    call.peak,
  );
  const normalized = mastered.map((s, i) =>
    Math.round(
      s * 32767 * Math.min(1, i / fade, (clean.length - 1 - i) / fade),
    ),
  );
  const maxSeconds = generation.version >= 4 ? (cue === 0 ? 0.36 : 0.43) : 0.8;
  if (normalized.length / rate > maxSeconds)
    throw Error("Spoken cue exceeds its countdown slot");
  prepared.set(path, wav(normalized));
  preview.set(normalized, (3 - cue) * rate);
  report.push({
    cue,
    text: words[cue],
    seconds: normalized.length / rate,
    sampleRate: rate,
    peak: Math.max(...normalized.map(Math.abs)) / 32768,
    rms: Math.sqrt(
      normalized.reduce((sum, sample) => sum + (sample / 32768) ** 2, 0) /
        normalized.length,
    ),
    bytes: 44 + normalized.length * 2,
  });
}
const output = new URL("output/countdown-voice-20260908/", root);
mkdirSync(output, { recursive: true });
mkdirSync(dir, { recursive: true });
for (const [path, bytes] of prepared) writeFileSync(path, bytes);
const previewEnd = Math.ceil(
  (Math.max(...report.map((clip) => 3 - clip.cue + clip.seconds)) + 0.08) * rate,
);
const sequence = wav([...preview.subarray(0, previewEnd)]);
writeFileSync(new URL("preview.wav", output), sequence);
writeFileSync(
  new URL(`preview-v${generation.version}.wav`, output),
  sequence,
);
writeFileSync(
  new URL("manifest.json", dir),
  JSON.stringify(
    {
      version: generation.version,
      voice: generation.voice,
      style: generation.style,
      calls: generation.calls,
      language: "en-US",
      generator: "scripts/audio/generate-countdown.py",
      clips: report,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(report, null, 2));
