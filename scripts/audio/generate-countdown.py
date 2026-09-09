"""Generate bright, playful female countdown speech; game playback stays offline."""
import asyncio
import json
import shutil
import subprocess
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "output/countdown-voice-20260908/arcade-girl-source-v4"
VOICE = "en-US-EmmaNeural"
CALLS = [
    dict(cue=3, text="Three!", rate="+24%", pitch="+32Hz", peak=0.78, rms=0.20),
    dict(cue=2, text="Two!", rate="+26%", pitch="+36Hz", peak=0.80, rms=0.215),
    dict(cue=1, text="One!", rate="+28%", pitch="+40Hz", peak=0.82, rms=0.225),
    dict(cue=0, text="Go!", rate="+32%", pitch="+48Hz", peak=0.86, rms=0.25),
]

async def main():
    STAGING.mkdir(parents=True, exist_ok=True)
    previous = ROOT / "output/countdown-voice-20260908/previous-v3"
    previous.mkdir(parents=True, exist_ok=True)
    for name in ["3.wav", "2.wav", "1.wav", "0.wav", "manifest.json"]:
        old = ROOT / "public/audio/countdown/en" / name
        if old.exists() and not (previous / name).exists():
            shutil.copy2(old, previous / name)
    old_preview = ROOT / "output/countdown-voice-20260908/preview.wav"
    if old_preview.exists() and not (previous / "preview.wav").exists():
        shutil.copy2(old_preview, previous / "preview.wav")
    # Supported neural prosody controls: quicker articulation and a pitch lift.
    # No time expansion or reverb: GO should be a short, clear start signal.
    # This service has no emotion-style parameter; none is claimed or bypassed.
    for call in CALLS:
        cue = call["cue"]
        mp3 = STAGING / f"{cue}.mp3"
        await edge_tts.Communicate(call["text"], VOICE, rate=call["rate"],
                                   pitch=call["pitch"]).save(str(mp3))
        filters = ("highpass=f=130,equalizer=f=420:t=q:w=0.65:g=-2.4,"
                   "equalizer=f=3200:t=q:w=0.8:g=2.4,treble=g=1.5:f=6500,"
                   "acompressor=threshold=0.12:ratio=2:attack=4:release=45:makeup=1.1")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(mp3),
                        "-af", filters, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le",
                        str(STAGING / f"{cue}.wav")], check=True)
    (STAGING / "generation.json").write_text(json.dumps(dict(version=4, voice=VOICE,
        style="Bright arcade countdown: light female tone, quick articulation and a crisp GO",
        calls=CALLS), indent=2), encoding="utf-8")
    subprocess.run(["node", str(ROOT / "scripts/audio/prepare-countdown.mjs"),
                    "--input=output/countdown-voice-20260908/arcade-girl-source-v4/"], cwd=ROOT, check=True)

if __name__ == "__main__":
    asyncio.run(main())
