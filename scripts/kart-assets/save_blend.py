"""Save separated original meshes, materials and named pivots in an editable .blend.

Run with the existing output/blender-runtime/Scripts/python.exe interpreter.
The glTF importer converts runtime +Y up / +Z forward to Blender +Z up / -Y forward.
"""
import os
import sys
import json
import hashlib
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art" / "kart"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.import_scene.gltf(filepath=str(SOURCE / "club-kart-source.glb"))
scene = bpy.context.scene
scene['source'] = 'Original client/kart-model.ts; regenerate with scripts/kart-assets/build.ts'
scene['coordinates'] = 'Blender: metres, +Z up, -Y forward. Runtime glTF: +Y up, +Z forward.'
scene['editing'] = 'Separated named meshes and animation pivots. Runtime is batched independently.'
scene['license'] = 'Original project authored geometry and materials; no third-party assets.'
scene['asset_version'] = 'club-kart-reference-v3'
scene['source_glb_sha256'] = hashlib.sha256((SOURCE / 'club-kart-source.glb').read_bytes()).hexdigest()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "club-kart.blend"), check_existing=False)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / "club-kart.blend"))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
for obj in meshes:
    obj.data.calc_loop_triangles()
validation = {
    'blenderVersion': bpy.app.version_string,
    'assetVersion': bpy.context.scene['asset_version'],
    'sourceGlbSha256': bpy.context.scene['source_glb_sha256'],
    'blendFileBytes': (SOURCE / 'club-kart.blend').stat().st_size,
    'meshes': len(meshes),
    'triangles': sum(len(obj.data.loop_triangles) for obj in meshes),
    'materials': len(bpy.data.materials),
    'meshesWithVertexColors': sum(bool(obj.data.color_attributes) for obj in meshes),
    'wheelPivots': sorted(obj.name for obj in bpy.context.scene.objects if obj.name.startswith('wheel-') and not obj.name.startswith('wheel-spin-')),
    'reopenedSuccessfully': True,
}
(SOURCE / 'blender-validation.json').write_text(json.dumps(validation, indent=2) + '\n', encoding='utf-8')
print(f'SAVED {SOURCE / "club-kart.blend"}', flush=True)
sys.stdout.flush()
# Existing Windows bpy worker requires explicit exit after completed file writes.
os._exit(0)
