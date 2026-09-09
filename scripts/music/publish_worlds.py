"""Install locally staged scores only when their decoded-file checks match."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[2]
STAGING=ROOT/'output/music/world-v6'
DEST=ROOT/'public/audio/music'

def install(source,destination):
    assert source.resolve().is_relative_to(ROOT)
    assert destination.resolve().is_relative_to(ROOT)
    pending=destination.with_name(destination.name+'.world-v6.tmp')
    shutil.copy2(source,pending)
    pending.replace(destination)

def main():
    manifest=json.loads((STAGING/'manifest.json').read_text('utf-8'))
    validation=json.loads((STAGING/'validation.json').read_text('utf-8'))
    reports=json.loads((STAGING/'render-report.json').read_text('utf-8'))
    composition=json.loads((STAGING/'composition-check.json').read_text('utf-8'))
    assert manifest['version']==composition['revision']==6
    assert len(manifest['tracks'])==len(validation['tracks'])==len(reports)==9
    assets=[]
    for track in manifest['tracks']:
        checked=next(row for row in validation['tracks'] if row['id']==track['id'])
        assert checked['duration']==track['loopEnd']==reports[track['id']]['duration']
        for extension in ('.ogg','.m4a'):
            source=STAGING/(track['id']+extension)
            assert hashlib.sha256(source.read_bytes()).hexdigest()==checked['formats'][extension]['sha256']
            assets.append((source,DEST/source.name))
    for source,destination in assets: install(source,destination)
    install(STAGING/'music-score-data.ts',ROOT/'client/music-score-data.ts')
    install(STAGING/'manifest.json',DEST/'manifest.json')
    install(STAGING/'render-report.json',ROOT/'output/music/render-report.json')
    install(STAGING/'validation.json',ROOT/'output/music/validation.json')
    print('Installed 9 validated scene scores / 18 compressed assets. Lobby and effects retained.')

if __name__=='__main__': main()
