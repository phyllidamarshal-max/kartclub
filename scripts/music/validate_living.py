"""Decode every delivered stem and validate the actual summed playback signal."""
import hashlib,json,shutil,subprocess,tempfile
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from living_scores import SCORES
from environment_audio import ELEMENTS
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/music/living-v8'

def stats(x):
    return dict(rmsDbFS=round(float(20*np.log10(np.sqrt(np.mean(x.astype(np.float64)**2)))),3),
                peak=round(float(np.max(np.abs(x))),6),seam=round(float(np.max(np.abs(x[0]-x[-1]))),6))

def main(asset_dir=None):
    assets_dir=asset_dir or OUT
    manifest=json.loads((assets_dir/'manifest.json').read_text('utf-8'))
    renders=json.loads((OUT/'render-report.json').read_text('utf-8'))
    assert manifest['version']==8 and len(manifest['tracks'])==19
    assert set(t['id'] for t in manifest['tracks'])==set(SCORES)==set(renders)
    hashes=set();rows=[]
    for track in manifest['tracks']:
        key=track['id'];frames=round(track['loopEnd']*44100)
        assert track['environment']['loopEnd']==track['loopEnd'] and frames==renders[key]['frames']
        assert track['elements']==ELEMENTS[key]
        formats={}
        for ext in ('.ogg','.m4a'):
            stems=[];assets=[]
            for suffix in ('','-environment'):
                src=assets_dir/(key+suffix+ext);digest=hashlib.sha256(src.read_bytes()).hexdigest()
                assert digest not in hashes;hashes.add(digest)
                with tempfile.TemporaryDirectory(prefix='kart-stem-validation-') as tmp:
                    decoded=Path(tmp)/'decoded.wav'
                    result=subprocess.run([shutil.which('ffmpeg'),'-v','error','-y','-i',str(src),'-c:a','pcm_f32le',str(decoded)],capture_output=True)
                    assert result.returncode==0,result.stderr
                    sr,x=wavfile.read(decoded)
                assert sr==44100 and x.ndim==2 and x.shape[1]==2
                assert 0<=len(x)-frames<2048,(key,suffix,ext,len(x),frames)
                x=x[:frames];assert np.isfinite(x).all()
                stat=stats(x)
                assert stat['peak']<.99 and stat['seam']<.06,(key,suffix,ext,stat)
                if suffix:
                    assert -30<stat['rmsDbFS']<-24,(key,stat)
                else:assert -18<stat['rmsDbFS']<-14,(key,stat)
                stems.append(x);assets.append(dict(file=src.name,bytes=src.stat().st_size,sha256=digest,**stat))
            mixed=stems[0]+stems[1];stat=stats(mixed)
            assert -.6<stat['rmsDbFS']+15.5<.6 and stat['peak']<.99,(key,ext,stat)
            boundary=float(np.max(np.abs(mixed[0]-mixed[-1])))
            neighbour=max(float(np.max(np.abs(np.diff(mixed[:2048],axis=0)))),float(np.max(np.abs(np.diff(mixed[-2048:],axis=0)))))
            assert boundary<.06 and boundary<=neighbour+1e-6,(key,ext,boundary,neighbour)
            quiet=min(float(np.sqrt(np.mean(a.astype(np.float64)**2))) for a in np.array_split(mixed,100))
            assert quiet>.025,(key,ext,quiet)
            formats[ext]=dict(assets=assets,mixed=stat)
        for label,seconds in (('excerpt',12),('highlight',16),('instrumental',16),('environment',16),('melody',16.15)):
            sr,x=wavfile.read(OUT/(key+'-'+label+'.wav'))
            assert sr==44100 and len(x)==round(seconds*sr) and np.isfinite(x).all()
            assert np.any(x) and np.max(np.abs(x.astype(float)))<32767
        rows.append(dict(id=key,frames=frames,duration=track['loopEnd'],formats=formats))
    report=dict(revision=8,tracks=rows,validatedFiles=len(hashes),validatedPreviews=95)
    report_path=OUT/'validation.json' if asset_dir is None else ROOT/'output/music/validation.json'
    report_path.write_text(json.dumps(report,indent=2)+'\n','utf-8')
    print(json.dumps(dict(tracks=19,stems=38,compressedAssets=len(hashes),previews=95,result='passed')))

if __name__=='__main__':main()
