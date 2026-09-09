"""Install only the validated revision-8 stems and generated music catalog."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/music/living-v8'
DEST=ROOT/'public/audio/music'

def install(source,dest):
    assert source.resolve().is_relative_to(ROOT) and dest.resolve().is_relative_to(ROOT)
    temp=dest.with_name(dest.name+'.living-v8.tmp');shutil.copy2(source,temp);temp.replace(dest)

def main():
    validation=json.loads((OUT/'validation.json').read_text('utf-8'))
    composition=json.loads((OUT/'composition-check.json').read_text('utf-8'))
    manifest=json.loads((OUT/'manifest.json').read_text('utf-8'))
    assert validation['revision']==composition['revision']==manifest['version']==8
    assert validation['validatedFiles']==76 and composition['tracks']==19
    # Keep the exact prior installed catalog and compressed files for comparison.
    backup=ROOT/'output/music/before-living-v7';backup.mkdir(parents=True,exist_ok=True)
    if not (backup/'manifest.json').exists():
        current=json.loads((DEST/'manifest.json').read_text('utf-8'));assert current['version']==7
        for t in current['tracks']:
            for ext in ('.ogg','.m4a'):shutil.copy2(DEST/(t['id']+ext),backup/(t['id']+ext))
        shutil.copy2(DEST/'manifest.json',backup/'manifest.json')
        shutil.copy2(ROOT/'client/music-score-data.ts',backup/'music-score-data.ts')
    assets=[]
    for row in validation['tracks']:
        for group in row['formats'].values():
            for a in group['assets']:
                src=OUT/a['file'];assert hashlib.sha256(src.read_bytes()).hexdigest()==a['sha256']
                assets.append(src)
    for src in assets:install(src,DEST/src.name)
    for file,dest in [('manifest.json',DEST/'manifest.json'),('music-score-data.ts',ROOT/'client/music-score-data.ts'),
                      ('render-report.json',ROOT/'output/music/render-report.json'),('validation.json',ROOT/'output/music/validation.json')]:install(OUT/file,dest)
    print('Installed 19 instrumental/environment pairs, 76 compressed assets; prior audio retained.')

if __name__=='__main__':main()
