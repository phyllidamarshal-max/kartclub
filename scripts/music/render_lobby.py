"""Render the original cheerful lobby theme, independent of map soundtracks."""
import json
import hashlib
import shutil
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
from arranger import add
from instruments import SR, voice, percussion
from phrases import parse_bar, chord_pitches, close_voicing
from mastering import master
from render import measure

ROOT = Path(__file__).resolve().parents[2]
BPM, BARS, KEY = 132, 32, 60
CHORDS = ['0M', '7M', '9m', '5M', '0M', '2m', '5M', '7M']
A = [
    '4:.5 7:.5 12:1 7:.5 4:.5 2:.5 4:.5',
    '2:.5 7:.5 11:1 11:.5 9:.5 r:1',
    '4:.5 9:.5 12:1 9:.5 7:.5 4:1',
    '5:.5 9:.5 12:1 9:.5 7:.5 5:1',
    '7:.5 12:.5 16:1 16:.5 14:.5 7:1',
    '5:.5 9:.5 14:1 14:.5 12:.5 5:1',
    '9:1 12:.5 9:.5 5:1 7:.5 9:.5',
    '11:1 9:.5 7:.5 2:1 r:1',
]
B = [
    '12:.75 16:.25 19:1 16:.5 14:.5 12:1',
    '14:.75 11:.25 7:1 11:.5 14:.5 19:1',
    '16:.5 12:.5 9:1 12:.5 16:.5 21:1',
    '17:1 16:.5 14:.5 12:1 9:1',
    '16:.5 19:.5 24:1 19:.5 16:.5 12:1',
    '17:1 14:.5 12:.5 9:1 5:1',
    '12:1 9:.5 7:.5 5:1 9:.5 12:.5',
    '14:.5 11:.5 7:1 11:.5 9:.5 7:.5 r:.5',
]


def compose():
    for phrase in (A, B):
        for i, bar in enumerate(phrase):
            chord = {p % 12 for p in chord_pitches(CHORDS[i])}
            for at, length, note in parse_bar(bar):
                if note is not None and (at in (0, 2) or length >= 1):
                    assert note % 12 in chord, (i, at, note)
    beat = 60 / BPM
    n = round(BARS * 4 * beat * SR)
    music = np.zeros((n, 2), np.float32)
    drums = np.zeros_like(music)
    wet = np.zeros_like(music)
    rng = np.random.default_rng(1322026)
    cache = {}
    kit = {k: percussion(k, rng) for k in ('kick', 'rim', 'snare', 'hat', 'shaker', 'crash', 'tom')}

    def play(kind, note, at, gate, gain, pan=0, send=.1):
        key = (kind, note, round(gate * beat, 6))
        if key not in cache:
            cache[key] = voice(kind, note, gate * beat, rng)
        add(music, cache[key], at * beat, gain, pan)
        add(wet, cache[key], at * beat, gain * send, pan)

    def hit(kind, at, gain, pan=0):
        add(drums, kit[kind], at * beat, gain, pan)

    previous = None
    for bar in range(BARS):
        section, local, at = bar // 8, bar % 8, bar * 4
        light = section == 2 and local < 4
        bright = section in (1, 3)
        chord = chord_pitches(CHORDS[local])
        notes = close_voicing(KEY, CHORDS[local], previous)
        previous = notes
        for pos in (0, 1.5, 2.5, 3.5):
            for j, pitch in enumerate(notes):
                play('sf_guitar', pitch, at + pos + j * .025, .36, .084, (j-1)*.4)
        if bright or light:
            for j, pitch in enumerate(notes):
                play('sf_ep', pitch, at, 3.65, .025, (j-1)*.3, .13)
        root = KEY + chord[0] - 24
        for j, pos in enumerate((0, .5, 1, 1.5, 2, 2.5, 3, 3.5)):
            if light and j % 2: continue
            pitch = root + (7 if j in (3, 7) else 12 if j in (2, 6) else 0)
            play('sf_bass', pitch, at+pos, .39, .21 if j % 2 == 0 else .15, send=0)
        for pos, length, note in parse_bar((B if bright else A)[local]):
            if note is None:
                play('sf_bell', KEY+chord[2]+12, at+pos, .28, .043, .25)
                continue
            play('sf_piano', KEY+note, at+pos, length*.92, .23 if not light else .18, -.08, .12)
            if bright:
                play('sf_flute', KEY+note, at+pos, length*.87, .09, .12, .12)
        if bright:
            for j in range(4):
                play('sf_pizz', KEY+chord[(0, 1, 2, 1)[j]], at+j+.5, .22, .042, .25)
        for pos in ((0, 2) if light else (0, 1, 2, 3)):
            hit('kick', at+pos, .24 if light else .31)
        for pos in (1, 3):
            hit('rim', at+pos, .17)
            if bright: hit('snare', at+pos, .09)
        for j in range(8):
            hit('shaker' if light else 'hat', at+j*.5, .045 if j % 2 else .061, .22)
        if local == 7:
            for j in range(4): hit('tom', at+3+j*.25, .075+j*.012, -.2+j*.15)
        if local == 0 and bright: hit('crash', at, .06, -.2)
    room = np.zeros_like(wet)
    wet = sosfilt(butter(2, [350, 4800], btype='band', fs=SR, output='sos'),
                  np.concatenate([wet[-SR:], wet]), axis=0)[SR:]
    for delay, gain in ((.027, .34), (.053, .23), (.091, .15)):
        room += np.roll(wet[:, ::-1], round(delay * SR), axis=0) * gain
    mix = music + drums + room
    mix = sosfilt(butter(2, 30, btype='high', fs=SR, output='sos'),
                  np.concatenate([mix[-SR:], mix]), axis=0)[SR:]
    mix -= mix.mean(axis=0)
    return master(np.tanh(mix), SR) * .85


def main():
    output = ROOT / 'public/audio/music'
    review = ROOT / 'output/music'
    ffmpeg = shutil.which('ffmpeg')
    assert ffmpeg
    print('Rendering Clubhouse Sunshine / cheerful lobby theme', flush=True)
    pcm = compose()
    report = {'title': 'Clubhouse Sunshine', 'bpm': BPM, 'bars': BARS,
              'frames': len(pcm), 'master': measure(pcm), 'formats': {}}
    with tempfile.TemporaryDirectory(prefix='kart-lobby-') as tmp:
        master_path = Path(tmp) / 'master.wav'
        wavfile.write(master_path, SR, pcm)
        for ext, codec in [('ogg', ['-c:a', 'libvorbis', '-q:a', '5']),
                           ('m4a', ['-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'])]:
            target = output / ('lobby.' + ext)
            subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(master_path), *codec, str(target)], check=True)
            decoded = Path(tmp) / 'decoded.wav'
            subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(target), '-c:a', 'pcm_f32le', str(decoded)], check=True)
            sr, data = wavfile.read(decoded)
            assert sr == SR and len(pcm) <= len(data) < len(pcm)+2048
            metrics = measure(data[:len(pcm)])
            assert metrics['finite'] and metrics['peak'] < .99
            assert metrics['boundaryStep'] < .06 and metrics['quietestHalfSecondDbFS'] > -35
            report['formats'][ext] = {**metrics, 'bytes': target.stat().st_size,
                                      'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    wavfile.write(review / 'lobby-excerpt.wav', SR, (pcm[:SR*16]*32767).astype(np.int16))
    (output / 'lobby.json').write_text(json.dumps({
        'id': 'lobby', 'title': report['title'], 'bpm': BPM, 'bars': BARS,
        'sampleRate': SR, 'version': 1, 'loopEnd': len(pcm)/SR,
        'urls': ['/audio/music/lobby.ogg?v=1', '/audio/music/lobby.m4a?v=1'],
        'creditsUrl': '/audio/music/CREDITS.txt',
    }, indent=2)+'\n', 'utf-8')
    (review / 'lobby-validation.json').write_text(json.dumps(report, indent=2)+'\n', 'utf-8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__': main()
