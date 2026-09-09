"""Install nineteen independently validated cues, preserving existing audio bytes."""
import hashlib
import json
from pathlib import Path
import shutil
from expansion_scores import EXPANSION_SCORES

ROOT=Path(__file__).resolve().parents[2]
STAGING=ROOT/'output/music/expansion-v7'
DEST=ROOT/'public/audio/music'

def install(source,destination):
    assert source.resolve().is_relative_to(ROOT)
    assert destination.resolve().is_relative_to(ROOT)
    pending=destination.with_name(destination.name+'.expansion-v7.tmp')
    shutil.copy2(source,pending)
    pending.replace(destination)

def main():
    read=lambda name:json.loads((STAGING/name).read_text('utf-8'))
    manifest=read('manifest.json')
    validation=read('validation.json')
    reports=read('render-report.json')
    composition=read('composition-check.json')
    assert manifest['version']==composition['revision']==7
    assert len(manifest['tracks'])==len(validation['tracks'])==len(reports)==19
    assert composition['newTracks']==10 and validation['validatedFiles']==38
    old=json.loads((ROOT/'output/music/world-v6/validation.json').read_text('utf-8'))
    preserved=[]
    assets=[]
    for track in manifest['tracks']:
        checked=next(row for row in validation['tracks'] if row['id']==track['id'])
        assert checked['duration']==track['loopEnd']==reports[track['id']]['duration']
        for extension in ('.ogg','.m4a'):
            source=STAGING/(track['id']+extension)
            digest=hashlib.sha256(source.read_bytes()).hexdigest()
            assert digest==checked['formats'][extension]['sha256']
            if track['id'] in EXPANSION_SCORES:
                assets.append((source,DEST/source.name))
            else:
                prior=next(row for row in old['tracks'] if row['id']==track['id'])
                assert digest==prior['formats'][extension]['sha256']
                assert digest==hashlib.sha256((DEST/source.name).read_bytes()).hexdigest()
                preserved.append(dict(file=source.name,sha256=digest))
    for source,destination in assets: install(source,destination)
    for source,destination in (
        ('music-score-data.ts',ROOT/'client/music-score-data.ts'),
        ('manifest.json',DEST/'manifest.json'),
        ('render-report.json',ROOT/'output/music/render-report.json'),
        ('validation.json',ROOT/'output/music/validation.json')):
        install(STAGING/source,destination)
    (STAGING/'preserved-v6.json').write_text(json.dumps(preserved,indent=2)+'\n','utf-8')
    print(f'Installed {len(assets)} new compressed assets; retained {len(preserved)} revision-6 assets byte for byte. Catalog: 19 maps.')

if __name__=='__main__': main()
