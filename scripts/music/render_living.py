"""Stage nineteen new paired scores and soundscapes; production stays intact."""
import argparse,hashlib,json,shutil,tempfile
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from living_scores import SCORES
from living_arrangements import PROFILES,drum_pattern
from environment_audio import render_environment,ELEMENTS
from world_arranger import render,melody_reference
from mastering import master
from render import measure
from render_worlds import run
from instruments import SR

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/music/living-v8'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--only',choices=list(SCORES));args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    prior=json.loads((ROOT/'output/music/expansion-v7/manifest.json').read_text('utf-8'))
    prior={t['id']:t for t in prior['tracks']}
    reports_file=OUT/'render-report.json'
    reports=json.loads(reports_file.read_text('utf-8')) if reports_file.exists() else {}
    manifest=dict(version=8,sampleRate=SR,creditsUrl='/audio/music/CREDITS.txt',tracks=[])
    catalog=[];ffmpeg=shutil.which('ffmpeg');assert ffmpeg
    for key,s in SCORES.items():
        entry=dict(id=key,title=s['title'],bpm=s['bpm'],bars=len(s['form'])*8,beatsPerBar=4,
                   loopEnd=round(len(s['form'])*32*60/s['bpm']*SR)/SR)
        catalog.append(entry)
        env=dict(url=f'/audio/music/{key}-environment.ogg?v=8',
                 fallbackUrl=f'/audio/music/{key}-environment.m4a?v=8',loopEnd=entry['loopEnd'])
        manifest['tracks'].append({**prior[key],**entry,'meter':s['meter'],'mode':s['mode'],
            'form':s['form'],'authoredBars':20,'displayBpm':s['bpm'],
            'style':PROFILES[key]['style'],'elements':ELEMENTS[key],
            'description':PROFILES[key]['style']+'. '+', '.join(ELEMENTS[key])+'.',
            'url':f'/audio/music/{key}.ogg?v=8','fallbackUrl':f'/audio/music/{key}.m4a?v=8',
            'environment':env,'previewPath':'/output/music/living-v8'})
        if args.only and args.only!=key:continue
        print('Rendering '+key+' / '+s['title'],flush=True)
        instrument=render(s,key,profile=PROFILES[key],percussion_pattern=drum_pattern)*.96
        environment,events=render_environment(key,s)
        raw=instrument+environment
        mixed=master(raw,SR)
        energy=np.sum(raw.astype(np.float64)**2,axis=1)
        gain=np.sum(mixed.astype(np.float64)*raw,axis=1)/np.maximum(energy,1e-15)
        instrument=(instrument*gain[:,None]).astype(np.float32)
        environment=(environment*gain[:,None]).astype(np.float32)
        assert np.max(np.abs(instrument+environment-mixed))<1e-6
        # A tiny shared seam feather suppresses AAC startup ringing on the
        # volcanic brass transient. Both stems retain their exact frame counts.
        feather=round(PROFILES[key].get('loopFeatherMs',0)*SR/1000)
        if feather:
            for stem in (instrument,environment):
                stem[:feather]*=np.linspace(0,1,feather)[:,None]
                stem[-feather:]*=np.linspace(1,0,feather)[:,None]
            mixed=instrument+environment
        decoded={};assets={}
        with tempfile.TemporaryDirectory(prefix='kart-living-score-') as tmp:
            for name,pcm in ((key,instrument),(key+'-environment',environment)):
                source=Path(tmp)/'source.wav';wavfile.write(source,SR,pcm)
                for ext,codec in (('.ogg',['-c:a','libvorbis','-q:a','5']),('.m4a',['-c:a','aac','-b:a','160k','-movflags','+faststart'])):
                    dest=OUT/(name+ext)
                    run([ffmpeg,'-v','error','-y','-i',str(source),*codec,str(dest)])
                    assets[name+ext]=dict(bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
                dest=Path(tmp)/'decode.wav'
                run([ffmpeg,'-v','error','-y','-i',str(OUT/(name+'.ogg')),'-c:a','pcm_f32le',str(dest)])
                rate,x=wavfile.read(dest);assert rate==SR and x.shape==pcm.shape
                decoded[name]=x
        loop=decoded[key]+decoded[key+'-environment']
        assert np.isfinite(loop).all() and np.max(np.abs(loop))<.99
        previews={'excerpt':mixed[:12*SR],'highlight':mixed[round(s['form'].index('b')*32*60/s['bpm']*SR):][:16*SR],
                  'instrumental':instrument[:16*SR],'environment':environment[:16*SR],
                  'melody':melody_reference(s)}
        for label,pcm in previews.items():
            wavfile.write(OUT/(key+'-'+label+'.wav'),SR,(pcm*32767).astype(np.int16))
        # Full combined preview is for sharing; runtime plays independent stems.
        with tempfile.TemporaryDirectory(prefix='kart-living-preview-') as tmp:
            path=Path(tmp)/'mix.wav';wavfile.write(path,SR,mixed)
            run([ffmpeg,'-v','error','-y','-i',str(path),'-c:a','libvorbis','-q:a','5',str(OUT/(key+'-mix.ogg'))])
        reports[key]=dict(title=s['title'],frames=len(mixed),duration=len(mixed)/SR,
            master=measure(mixed),instrumental=measure(instrument),environment=measure(environment),
            decodedOgg=measure(loop),assets=assets,environmentEvents=events,
            note='decodedOgg measures the sum of the two decoded stems at their intended shared start.')
        reports_file.write_text(json.dumps(reports,indent=2)+'\n','utf-8')
        print(json.dumps(dict(id=key,mix=measure(loop),environment=measure(environment),events=len(events))),flush=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n','utf-8')
    (OUT/'music-score-data.ts').write_text('// Generated revision-8 scores.\nexport const MUSIC_SCORE_DATA = '+json.dumps(catalog,indent=2)+' as const;\n','utf-8')

if __name__=='__main__':main()
