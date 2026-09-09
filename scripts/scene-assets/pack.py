"""Encode baked atlases as browser-native RGB8 PNG and repack GLB buffer views.

Editable Blender files retain their full procedural materials. This delivery step
does not resize textures or recompress geometry. Decoded RGB8 pixels are checked
for exact equality before replacing any generated runtime asset.
"""
import io
import json
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT/'public/art/coast-rebuild'


def png8(data):
    source = Image.open(io.BytesIO(data))
    source = source.convert('RGBA' if 'A' in source.getbands() else 'RGB')
    output = io.BytesIO()
    source.save(output, format='PNG', optimize=True)
    encoded = output.getvalue()
    check = Image.open(io.BytesIO(encoded)).convert(source.mode)
    assert check.size == source.size and check.tobytes() == source.tobytes()
    return encoded


def pack_glb(path):
    data = path.read_bytes()
    assert data[:4] == b'glTF'
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    binary_start = 20+size+8
    binary = data[binary_start:]
    image_views = {i['bufferView'] for i in doc.get('images', []) if i.get('mimeType') == 'image/png'}
    output = bytearray()
    for index, view in enumerate(doc['bufferViews']):
        assert view['buffer'] == 0
        offset, length = view.get('byteOffset', 0), view['byteLength']
        raw = binary[offset:offset+length]
        payload = png8(raw) if index in image_views else raw
        output.extend(b'\0' * (-len(output) % 4))
        view['byteOffset'], view['byteLength'] = len(output), len(payload)
        output.extend(payload)
    doc['buffers'][0]['byteLength'] = len(output)
    output.extend(b'\0' * (-len(output) % 4))
    encoded_json = json.dumps(doc, separators=(',', ':')).encode()
    encoded_json += b' ' * (-len(encoded_json) % 4)
    length = 12+8+len(encoded_json)+8+len(output)
    result = struct.pack('<4sII', b'glTF', 2, length)
    result += struct.pack('<I4s', len(encoded_json), b'JSON')+encoded_json
    result += struct.pack('<I4s', len(output), b'BIN\0')+output
    assert len(result) == length
    temporary = path.with_suffix('.tmp.glb')
    temporary.write_bytes(result)
    temporary.replace(path)
    return len(data), len(result)


if __name__ == '__main__':
    before = after = 0
    for path in sorted(PUBLIC.glob('*.glb')):
        a,b = pack_glb(path); before += a; after += b
        print(f'{path.name}: {a/1e6:.2f} -> {b/1e6:.2f} MB')
    for path in sorted(PUBLIC.glob('*.png')):
        data = path.read_bytes(); packed = png8(data)
        if path.name.endswith('-indirect.png'):
            before += len(data); after += len(packed)
        path.write_bytes(packed)
    report = {'runtimeBytesBefore': before, 'runtimeBytesAfter': after,
              'textureDelivery': 'RGB8 PNG; no resizing; decoded RGB8 channels verified',
              'geometry': 'unchanged buffer-view bytes'}
    (ROOT/'output/coast-rebuild/pack-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
