"""Validate delivered GLB/atlas bindings independently of the authoring process."""
import io
import json
import math
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT/'public/art/coast-rebuild'
records = json.loads((PUBLIC/'manifest.json').read_text(encoding='utf-8'))['assets']
report = []
for record in records:
    path = PUBLIC/(record['key']+'.glb')
    data = path.read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<I',data,8)[0] == len(data)
    json_size = struct.unpack_from('<I',data,12)[0]
    doc = json.loads(data[20:20+json_size])
    binary = data[28+json_size:]
    for view in doc['bufferViews']:
        assert view['byteOffset'] % 4 == 0
        assert view['byteOffset']+view['byteLength'] <= len(binary)
    primitives = [p for mesh in doc['meshes'] for p in mesh['primitives']]
    for primitive in primitives:
        assert {'POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1'} <= primitive['attributes'].keys()
        for semantic, index in primitive['attributes'].items():
            accessor = doc['accessors'][index]
            if accessor['componentType'] != 5126:
                continue
            components = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
            view = doc['bufferViews'][accessor['bufferView']]
            base = view['byteOffset']+accessor.get('byteOffset',0)
            stride = view.get('byteStride',components*4)
            assert accessor.get('byteOffset',0)+(accessor['count']-1)*stride+components*4 <= view['byteLength']
            values = [struct.unpack_from('<'+'f'*components,binary,base+i*stride) for i in range(accessor['count'])]
            assert all(math.isfinite(v) for row in values for v in row)
            if semantic.startswith('TEXCOORD'):
                assert all(-.001 <= v <= 1.001 for row in values for v in row)
        mat = doc['materials'][primitive['material']]
        assert 'baseColorTexture' in mat['pbrMetallicRoughness']
        assert 'metallicRoughnessTexture' in mat['pbrMetallicRoughness']
        assert 'normalTexture' in mat and mat['occlusionTexture'].get('texCoord') == 1
    for image in doc['images']:
        view = doc['bufferViews'][image['bufferView']]
        raw = binary[view['byteOffset']:view['byteOffset']+view['byteLength']]
        assert raw[:8] == b'\x89PNG\r\n\x1a\n' and raw[24] == 8
        decoded = Image.open(io.BytesIO(raw)); decoded.load()
        assert decoded.size == (record['atlasSize'],record['atlasSize'])
    light = PUBLIC/(record['key']+'-indirect.png')
    Image.open(light).verify()
    assert (ROOT/'art/coast-rebuild'/(record['key']+'.blend')).exists()
    report.append({'key':record['key'],'triangles':record['triangles'],'bytes':len(data)+light.stat().st_size})
result = {'validatedAssets':len(report),'runtimeBytes':sum(x['bytes'] for x in report),'assets':report}
(ROOT/'output/coast-rebuild/asset-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
