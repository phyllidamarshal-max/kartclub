"""Render ten new scores; retain the nine revision-6 masters byte for byte."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import numpy as np
from scipy.io import wavfile
from instruments import SR
from expansion_scores import EXPANSION_SCORES
from expansion_arrangements import PROFILES, drum_pattern
from world_arranger import render, melody_reference
from render import measure
from render_worlds import run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/music/expansion-v7'
OLD=ROOT/'output/music/world-v6'
OLD_NAMES=['Sunlit Coast','Sunset Harbor','Golden Desert','Neon City','Steel Factory',
           'Orbital Station','Giantwood Forest','Aurora Glacier','Lava Mine']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--only',choices=list(EXPANSION_SCORES))
    args=parser.parse_args()
    maps={m['id']:m for m in json.loads((OUT/'maps.json').read_text('utf-8'))}
    manifest=json.loads((OLD/'manifest.json').read_text('utf-8'))
    manifest['version']=7
    reports=json.loads((OLD/'render-report.json').read_text('utf-8'))
    report_file=OUT/'render-report.json'
    if args.only and report_file.exists():
        reports.update(json.loads(report_file.read_text('utf-8')))
    catalog=[]
    for name,entry in zip(OLD_NAMES,manifest['tracks']):
        entry.update(mapName=name,isNew=False,previewPath='/output/music/world-v6')
        entry['url']=entry['url'].replace('?v=6','?v=7')
        entry['fallbackUrl']=entry['fallbackUrl'].replace('?v=6','?v=7')
        catalog.append({k:entry[k] for k in ('id','title','bpm','bars','beatsPerBar','loopEnd')})
        for ext in ('.ogg','.m4a'):
            shutil.copy2(OLD/(entry['id']+ext),OUT/(entry['id']+ext))
    base_entries={e['id']:e for e in manifest['tracks']}
    ffmpeg=shutil.which('ffmpeg')
    assert ffmpeg
    for key,score in EXPANSION_SCORES.items():
        scene=maps[key]
        profile=PROFILES[key]
        bars=len(score['form'])*8
        loop_end=round(bars*score['beats']*60/score['bpm']*SR)/SR
        entry=dict(id=key,title=score['title'],bpm=score['bpm'],bars=bars,
                   beatsPerBar=score['beats'],loopEnd=loop_end)
        catalog.append(entry)
        manifest['tracks'].append({**entry,'mapName':scene['name'],'isNew':True,
            'previewPath':'/output/music/expansion-v7','palette':base_entries[scene['baseId']]['palette'],
            'biome':scene['biome'],'landmark':scene['landmark'],
            'description':profile['description'],'style':profile['style'],
            'meter':score['meter'],'mode':score['mode'],'form':score['form'],
            'displayBpm':score.get('displayBpm',score['bpm']),
            'authoredBars':24,'url':f'/audio/music/{key}.ogg?v=7',
            'fallbackUrl':f'/audio/music/{key}.m4a?v=7','loopStart':0})
        if args.only and key!=args.only: continue
        print(f'Rendering {key}: {score["title"]} ({score["meter"]})',flush=True)
        audio=render(score,key,profile=profile,percussion_pattern=drum_pattern)
        metrics=measure(audio)
        assert metrics['finite'] and metrics['peak']<.99 and metrics['quietestHalfSecondDbFS']>-35,metrics
        with tempfile.TemporaryDirectory(prefix='kart-expansion-score-') as tmp:
            master=Path(tmp)/'master.wav'
            wavfile.write(master,SR,audio)
            base=[ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(master)]
            run(base+['-c:a','libvorbis','-q:a','5',str(OUT/(key+'.ogg'))])
            run(base+['-c:a','aac','-b:a','160k','-movflags','+faststart',str(OUT/(key+'.m4a'))])
            decoded=Path(tmp)/'decoded.wav'
            run([ffmpeg,'-v','error','-y','-i',str(OUT/(key+'.ogg')),'-c:a','pcm_f32le',str(decoded)])
            rate,pcm=wavfile.read(decoded)
            assert rate==SR and pcm.shape==audio.shape
            decoded_metrics=measure(pcm)
            assert decoded_metrics['finite'] and decoded_metrics['peak']<.99
        wavfile.write(OUT/(key+'-excerpt.wav'),SR,(audio[:SR*12]*32767).astype(np.int16))
        hook_start=round(score['form'].index('b')*8*score['beats']*60/score['bpm']*SR)
        wavfile.write(OUT/(key+'-highlight.wav'),SR,(audio[hook_start:hook_start+SR*16]*32767).astype(np.int16))
        piano=melody_reference(score)
        wavfile.write(OUT/(key+'-melody.wav'),SR,(piano*32767).astype(np.int16))
        reports[key]={'title':score['title'],'scene':scene['biome'],'frames':len(audio),
            'duration':len(audio)/SR,'meter':score['meter'],'form':score['form'],
            'master':metrics,'decodedOgg':decoded_metrics,
            'sha256':hashlib.sha256((OUT/(key+'.ogg')).read_bytes()).hexdigest(),
            'oggBytes':(OUT/(key+'.ogg')).stat().st_size,'aacBytes':(OUT/(key+'.m4a')).stat().st_size}
        report_file.write_text(json.dumps(reports,indent=2)+'\n','utf-8')
        print(json.dumps(reports[key]),flush=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n','utf-8')
    (OUT/'music-score-data.ts').write_text('// Generated from validated revision-7 scene scores.\nexport const MUSIC_SCORE_DATA = '+json.dumps(catalog,indent=2)+' as const;\n','utf-8')
    print('Staged 19 themes. Independent decode validation is required before installation.',flush=True)

if __name__=='__main__': main()
