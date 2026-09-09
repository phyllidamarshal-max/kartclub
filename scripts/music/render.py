"""Original KART CLUB scores rendered with licensed instruments and synthesis.

Python 3 + numpy/scipy and ffmpeg on PATH. Run from any directory:
  python scripts/music/render.py [--only coast]
Each independently authored score uses A/A+/B/B+ sections. Instrument and
reverb tails wrap circularly, producing a musical loop without a silent outro.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import numpy as np
from scipy.io import wavfile
from arcade_arrangements import SCENES

ROOT = Path(__file__).resolve().parents[2]
SR = 44100
BARS = 32
SCORES = json.loads(Path(__file__).with_name('scores.json').read_text('utf-8'))
PUBLIC = ROOT / 'public/audio/music'
OUT = ROOT / 'output/music'


from arranger import render


def run(command):
    subprocess.run(command,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)


def measure(audio):
    rms = np.sqrt(np.mean(audio.astype(np.float64)**2))
    blocks = [np.sqrt(np.mean(x.astype(np.float64)**2)) for x in np.array_split(audio, round(len(audio)/SR)*2)]
    boundary = float(np.max(np.abs(audio[0]-audio[-1])))
    return {'peak':float(np.max(np.abs(audio))), 'rmsDbFS':round(float(20*np.log10(max(rms,1e-12))),2),
            'quietestHalfSecondDbFS':round(float(20*np.log10(max(min(blocks),1e-12))),2),
            'boundaryStep':round(boundary,6), 'finite':bool(np.isfinite(audio).all())}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--only',choices=[s['id'] for s in SCORES])
    args=parser.parse_args()
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg: raise RuntimeError('ffmpeg is required on PATH')
    PUBLIC.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    selected=[s for s in SCORES if not args.only or s['id']==args.only]
    report_path=OUT/'render-report.json'
    reports=json.loads(report_path.read_text('utf-8')) if args.only and report_path.exists() else {}
    for score in selected:
        print('Rendering '+score['id']+' / '+score['title'],flush=True)
        audio=render(score)
        metrics=measure(audio)
        assert metrics['finite'] and metrics['peak']<.99 and metrics['quietestHalfSecondDbFS']>-35, metrics
        with tempfile.TemporaryDirectory(prefix='kart-music-') as temp:
            wav=Path(temp)/'master.wav'
            wavfile.write(wav,SR,audio)
            common=[ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(wav)]
            run(common+['-c:a','libvorbis','-q:a','5',str(PUBLIC/(score['id']+'.ogg'))])
            run(common+['-c:a','aac','-b:a','160k','-movflags','+faststart',str(PUBLIC/(score['id']+'.m4a'))])
            decoded=Path(temp)/'decoded.wav'
            run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(PUBLIC/(score['id']+'.ogg')),'-c:a','pcm_f32le',str(decoded)])
            rate,samples=wavfile.read(decoded)
            assert rate==SR and samples.shape==audio.shape, (rate,samples.shape,audio.shape)
            decoded_metrics=measure(samples)
            assert decoded_metrics['finite'] and decoded_metrics['peak']<.99, decoded_metrics
        # A short listenable WAV is convenient for local media preview, while the
        # actual game loads only the compressed loop.
        wavfile.write(OUT/(score['id']+'-excerpt.wav'),SR,(audio[:SR*12]*32767).astype(np.int16))
        peak_start=round(18*4*60/score['bpm']*SR)
        wavfile.write(OUT/(score['id']+'-highlight.wav'),SR,
                      (audio[peak_start:peak_start+SR*16]*32767).astype(np.int16))
        reports[score['id']]={'title':score['title'],'scene':SCENES[score['id']]['biome'],'arrangement':SCENES[score['id']], 'frames':len(audio),'duration':len(audio)/SR,
                            'master':metrics,'decodedOgg':decoded_metrics,
                            'sha256':hashlib.sha256((PUBLIC/(score['id']+'.ogg')).read_bytes()).hexdigest(),
                            'oggBytes':(PUBLIC/(score['id']+'.ogg')).stat().st_size,
                            'aacBytes':(PUBLIC/(score['id']+'.m4a')).stat().st_size}
        report_path.write_text(json.dumps(reports,indent=2)+'\n','utf-8')
        print(json.dumps(reports[score['id']]),flush=True)
    manifest={'version':5,'sampleRate':SR,'bars':BARS,'creditsUrl':'/audio/music/CREDITS.txt','tracks':[
        {**{k:s[k] for k in ('id','title','bpm','palette')},
         **{k:SCENES[s['id']][k] for k in ('biome','landmark','description','style')},
         'url':'/audio/music/'+s['id']+'.ogg?v=5','fallbackUrl':'/audio/music/'+s['id']+'.m4a?v=5',
         'loopStart':0,'loopEnd':round(BARS*4*60/s['bpm']*SR)/SR}
        for s in SCORES]}
    (PUBLIC/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n','utf-8')
    print('Completed '+str(len(selected))+' original scores.',flush=True)


if __name__=='__main__':main()
