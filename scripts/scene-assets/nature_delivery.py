"""Pack and verify only the four tree keys; preserve other manifest records."""
import hashlib
import io
import json
import math
import os
import struct
import sys
from pathlib import Path
import bpy
sys.path.append(str(Path(sys.base_prefix)/'Lib/site-packages'))
from PIL import Image
from pack import pack_glb, png8

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT/'public/art/coast-rebuild'
KEYS = ['tree-round','tree-oak','tree-blossom','tree-slender']
dimensions = json.loads((ROOT/'output/reference-match-20260908/foliage-source-dimensions.json').read_text())
report = {}
for key in KEYS:
    path = PUBLIC/f'{key}.glb'
    pack_glb(path)
    for suffix in ['color','normal','orm','indirect']:
        texture = PUBLIC/f'{key}-{suffix}.png'
        packed = png8(texture.read_bytes())
        temporary = texture.with_suffix('.tmp.png')
        temporary.write_bytes(packed)
        temporary.replace(texture)
    data = path.read_bytes()
    assert struct.unpack_from('<I',data,8)[0] == len(data)
    size = struct.unpack_from('<I',data,12)[0]
    doc = json.loads(data[20:20+size]); binary = data[28+size:]
    primitive = doc['meshes'][0]['primitives'][0]
    assert {'POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1'} <= set(primitive['attributes'])
    assert len(doc['materials']) == 1
    images = []
    for img in doc['images']:
        view = doc['bufferViews'][img['bufferView']]
        texture = Image.open(io.BytesIO(binary[view['byteOffset']:view['byteOffset']+view['byteLength']]))
        assert texture.mode in ('RGB','RGBA')
        assert texture.size == (512,512)
        images.append({'bytes':view['byteLength'],'dimensions':list(texture.size),'mode':texture.mode})
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/coast-rebuild'/f'{key}.blend'))
    selected = [obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.get('asset_key')==key]
    assert selected
    for obj in selected:
        assert obj.matrix_world.determinant() > 0
        assert {'UVMap','LightmapUV'} <= {uv.name for uv in obj.data.uv_layers}
        assert obj.get('geometry_version') == 'reference-match-20260908-v2'
        assert all((obj.matrix_world @ v.co).z >= -1e-6 for v in obj.data.vertices)
    sourcePieces = len(selected)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    coords = [obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
    radius = max(math.hypot(p.x,p.y) for p in coords)
    assert abs(radius-dimensions[key]['runtimeXZRadius']) < 1e-5
    assert min(p.z for p in coords) >= -1e-6
    meta = json.loads((PUBLIC/f'{key}.json').read_text())
    meta.update({'version':'reference-match-20260908-v2','radius':radius,
                 'materialCount':len(doc['materials']),'modelBytes':len(data),
                 'textureBytes':sum(x['bytes'] for x in images)+(PUBLIC/f'{key}-indirect.png').stat().st_size,
                 'modelSha256':hashlib.sha256(data).hexdigest(),
                 'indirectSha256':hashlib.sha256((PUBLIC/f'{key}-indirect.png').read_bytes()).hexdigest()})
    (PUBLIC/f'{key}.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
    report[key] = {**meta,'sourceReopened':True,'sourceMeshPieces':sourcePieces,
                   'glbReimported':True,'uvChannels':['UVMap','LightmapUV'],
                   'embeddedImages':images,'sourceDimensions':dimensions[key]}
manifest_path = PUBLIC/'manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['assets'] = [json.loads((PUBLIC/f"{entry['key']}.json").read_text()) if entry['key'] in KEYS else entry for entry in manifest['assets']]
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(ROOT/'output/reference-match-20260908/foliage-validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report),flush=True)
sys.stdout.flush();sys.stderr.flush();os._exit(0)
