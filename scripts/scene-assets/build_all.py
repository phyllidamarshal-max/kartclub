"""Run independent Blender workers and publish a manifest only when all exist."""
import argparse
import json
import subprocess
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT/'public/art/coast-rebuild'
LOGS = ROOT/'output/coast-rebuild'
ARCHITECTURE = ['cottage-hero','cottage-gable','cottage-low','lighthouse']
NATURE = ['tree-oak','tree-round','tree-slender','tree-blossom','rock-cluster','meadow-patch','shrub-cluster']

parser = argparse.ArgumentParser()
parser.add_argument('--group', choices=['architecture','nature','all'], default='all')
args = parser.parse_args()
keys = ARCHITECTURE if args.group == 'architecture' else NATURE if args.group == 'nature' else ARCHITECTURE+NATURE
runtime = ROOT/'output/blender-runtime/Scripts/python.exe'
LOGS.mkdir(parents=True, exist_ok=True)
for key in keys:
    size = 2048 if key == 'cottage-hero' else 1024 if key in ARCHITECTURE else 512
    print('BUILD '+key, flush=True)
    with (LOGS/f'bake-{key}.log').open('w', encoding='utf-8') as log:
        result = subprocess.run([str(runtime),str(ROOT/'scripts/scene-assets/build.py'),
                                 '--asset',key,'--size',str(size),'--samples','16'],
                                 cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        print('FAILED '+key+' '+str(result.returncode), flush=True)
        sys.exit(1)
    print('DONE '+key, flush=True)
records = []
for key in ARCHITECTURE+NATURE:
    path = PUBLIC/f'{key}.json'
    if not path.exists():
        print('GROUP_DONE; remaining group has not exported '+key, flush=True)
        sys.exit(0)
    records.append(json.loads(path.read_text(encoding='utf-8')))
manifest = {'version':'reference-coast-assets-v1','assets':records}
subprocess.run([sys.executable, str(ROOT/'scripts/scene-assets/pack.py')], cwd=ROOT, check=True)
temporary = PUBLIC/'manifest.tmp.json'
temporary.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
temporary.replace(PUBLIC/'manifest.json')
print('MANIFEST_READY '+str(len(records)), flush=True)
