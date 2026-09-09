"""Independently decode and validate all delivered map loops using ffmpeg."""
import hashlib
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit
import numpy as np
from scipy.io import wavfile

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--staging',action='store_true')
parser.add_argument('--expansion',action='store_true')
args=parser.parse_args()
asset_dir=ROOT/('output/music/expansion-v7' if args.expansion else 'output/music/world-v6' if args.staging else 'public/audio/music')
manifest=json.loads((asset_dir/'manifest.json').read_text('utf-8'))
if manifest['version']>=8:
    from validate_living import main
    main(asset_dir)
    raise SystemExit(0)
scores=json.loads((ROOT/'scripts/music/scores.json').read_text('utf-8'))
expected_ids={s['id'] for s in scores}
if manifest['version']>=7:
    from expansion_scores import EXPANSION_SCORES
    expected_ids.update(EXPANSION_SCORES)
assert expected_ids == {s['id'] for s in manifest['tracks']}
assert len(manifest['tracks']) == len(expected_ids)
ffmpeg=shutil.which('ffmpeg')
assert ffmpeg, 'ffmpeg not found'
hashes=set()
report=[]
for track in manifest['tracks']:
    expected=round(track['loopEnd']*manifest['sampleRate'])
    row={'id':track['id'],'duration':track['loopEnd'],'formats':{}}
    for key in ('url','fallbackUrl'):
        source=asset_dir/Path(urlsplit(track[key]).path).name
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        assert digest not in hashes, 'Two delivered tracks are identical'
        hashes.add(digest)
        with tempfile.TemporaryDirectory(prefix='kart-audio-check-') as tmp:
            output=Path(tmp)/'decoded.wav'
            result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(source),'-c:a','pcm_f32le',str(output)],capture_output=True)
            assert result.returncode==0, result.stderr.decode(errors='replace')
            rate,pcm=wavfile.read(output)
        assert rate==44100 and pcm.ndim==2 and pcm.shape[1]==2
        # AAC decoders may expose padding after the intended musical loop;
        # runtime loopEnd deliberately excludes this padding.
        assert len(pcm)>=expected and len(pcm)-expected<2048, (track['id'],key,len(pcm),expected)
        pcm=pcm[:expected]
        assert np.isfinite(pcm).all()
        peak=float(np.max(np.abs(pcm)))
        assert .3<peak<.99, (track['id'],key,peak)
        rms=float(np.sqrt(np.mean(pcm.astype(np.float64)**2)))
        assert .09<rms<.3
        blocks=[float(np.sqrt(np.mean(x.astype(np.float64)**2))) for x in np.array_split(pcm,100)]
        assert min(blocks)>.035, (track['id'],'long silence',min(blocks))
        boundary=float(np.max(np.abs(pcm[0]-pcm[-1])))
        # Compare the loop seam against ordinary neighbouring high-frequency
        # sample deltas; a waveform need not end on the same sample value.
        local=max(float(np.max(np.abs(np.diff(pcm[-2048:],axis=0)))),
                  float(np.max(np.abs(np.diff(pcm[:2048],axis=0)))))
        assert boundary<.06 and boundary<=local+1e-6, (track['id'],key,boundary)
        row['formats'][source.suffix]={'bytes':source.stat().st_size,'decodedFrames':expected,
                                      'peak':round(peak,5),'rmsDbFS':round(20*np.log10(rms),2),
                                      'boundaryStep':round(boundary,6),
                                      'ordinaryNeighbourMaxStep':round(local,6),'sha256':digest}
    report.append(row)
out=asset_dir/'validation.json' if args.staging or args.expansion else ROOT/'output/music/validation.json'
out.write_text(json.dumps({'tracks':report,'validatedFiles':len(hashes)},indent=2)+'\n','utf-8')
print(json.dumps({'tracks':len(report),'files':len(hashes),'totalBytes':sum(f['bytes'] for r in report for f in r['formats'].values())}))
