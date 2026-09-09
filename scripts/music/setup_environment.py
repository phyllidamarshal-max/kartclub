"""Acquire credited open recordings for game sound design, not remote previews."""
import hashlib,json,urllib.request,subprocess,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/music/environment'
SOURCES=[
 dict(id='birds',file='birds.ogg',author='isaiah658',license='CC0 1.0',
      page='https://opengameart.org/content/ambient-bird-sounds',
      url='https://opengameart.org/sites/default/files/birds-isaiah658_0.ogg'),
 dict(id='wrens',file='wrens.ogg',author='Barracuda1983',license='Public domain dedication',
      page='https://commons.wikimedia.org/wiki/File:Birds_forest.ogg',
      url='https://upload.wikimedia.org/wikipedia/commons/3/38/Birds_forest.ogg'),
 dict(id='wave',file='wave.flac',author='jasinski; excerpt by qubodup',license='CC0 1.0',
      page='https://opengameart.org/content/beach-ocean-waves',
      url='https://opengameart.org/sites/default/files/wave_01_cc0-18363__jasinski__alkaibeach.flac'),
 dict(id='cold-wind',file='cold-wind.ogg',author='Ecrivain',license='CC0 1.0',
      page='https://opengameart.org/content/icy-heights',
      url='https://opengameart.org/sites/default/files/wind.ogg'),
]

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    report=[]
    for source in SOURCES:
        path=OUT/source['file']
        if not path.exists():
            req=urllib.request.Request(source['url'],headers={'User-Agent':'KARTClubAssetBuild/1.0'})
            data=urllib.request.urlopen(req,timeout=40).read()
            assert len(data)>10000
            path.write_bytes(data)
        result=subprocess.run([shutil.which('ffmpeg'),'-v','error','-y','-i',str(path),
            '-ar','44100','-ac','1','-c:a','pcm_f32le',str(OUT/(source['id']+'.wav'))],capture_output=True)
        assert result.returncode==0,result.stderr
        report.append({**source,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                       'use':'Cropped, filtered, faded and spatially arranged in independent environmental stems.'})
        print(source['id'],flush=True)
    (OUT/'sources.json').write_text(json.dumps(report,indent=2)+'\n','utf-8')
if __name__=='__main__': main()
