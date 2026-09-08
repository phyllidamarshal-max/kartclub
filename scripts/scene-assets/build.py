"""Bake reference-authored Blender assets and export repeatable glTF resources.

Run with output/blender-runtime/Scripts/python.exe scripts/scene-assets/build.py
      --asset cottage-hero --size 1024 --samples 16
"""
import argparse
import json
import os
import struct
import sys
from pathlib import Path
import time
import bpy
from mathutils import Vector
from common import box, material, isolate, configure_cycles

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public' / 'art' / 'coast-rebuild'
SOURCE = ROOT / 'art' / 'coast-rebuild'
ARCHITECTURE = ['cottage-hero', 'cottage-gable', 'cottage-low', 'lighthouse']
NATURE = ['tree-oak', 'tree-round', 'tree-slender', 'tree-blossom', 'rock-cluster', 'meadow-patch', 'shrub-cluster']


def image_target(objects, image):
    for mat in {m for obj in objects for m in obj.data.materials if m}:
        nodes = mat.node_tree.nodes
        node = nodes.get('AtlasBakeTarget') or nodes.new('ShaderNodeTexImage')
        node.name = 'AtlasBakeTarget'
        node.image = image
        for item in nodes:
            item.select = False
        node.select = True
        nodes.active = node


def bake(objects, name, size, bake_type, **kwargs):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'sRGB' if bake_type == 'DIFFUSE' and kwargs.get('pass_filter') == {'COLOR'} else 'Non-Color'
    image.generated_color = (0, 0, 0, 1)
    image_target(objects, image)
    isolate(objects)
    print(f'BAKE {name} {size}', flush=True)
    bpy.ops.object.bake(type=bake_type, margin=8, use_clear=True, **kwargs)
    return image


def save_image(image, path, color=False, depth='8'):
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    # Image.save preserves the assigned color space, unlike a display render.
    bpy.context.scene.render.image_settings.color_depth = depth
    image.save()


def bake_asset(key, size, samples):
    import numpy as np
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = configure_cycles(samples)
    if key in ARCHITECTURE:
        from architecture import build_assets
    else:
        from nature import build_assets
    library = build_assets()
    objects = [obj for obj in library[key] if obj.type == 'MESH']
    active = set(objects)
    for obj in list(scene.objects):
        obj.hide_render = obj not in active
        obj.hide_set(obj not in active)
    isolate(objects)
    for obj in objects:
        # Applied geometry is the editable source of all exported assets.
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        obj.data.uv_layers.active_index = 0
    isolate(objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.007, area_weight=.1,
                             correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # AO explicitly references TEXCOORD_1 so the exporter retains a second UV set.
    for obj in objects:
        source_uv = obj.data.uv_layers[0]
        light_uv = obj.data.uv_layers.get('LightmapUV') or obj.data.uv_layers.new(name='LightmapUV')
        uv_values = np.empty(len(source_uv.data)*2, dtype=np.float32)
        source_uv.data.foreach_get('uv', uv_values)
        light_uv.data.foreach_set('uv', uv_values)
        obj.data.uv_layers.active_index = 0
        obj.data.uv_layers[0].active_render = True

    # Uniform sky plus a warm ground gives asset-local bounced fill. Direct sun
    # remains entirely in the runtime; the baked map is diffuse INDIRECT only.
    scene.world = bpy.data.worlds.new('Reference neutral sky')
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.55, .67, .75, 1)
    background.inputs['Strength'].default_value = .65
    floor = box('Bake-only warm ground', (0,0,-.075), (60,60,.1), material('Bake ground', '#aaa06f', 1))
    floor.hide_set(True)
    floor.hide_render = False
    PUBLIC.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'{key}.blend'), check_existing=False)
    color = bake(objects, key+'-color', size, 'DIFFUSE', pass_filter={'COLOR'})
    normal = bake(objects, key+'-normal', size, 'NORMAL', normal_space='TANGENT')
    roughness = bake(objects, key+'-roughness', size, 'ROUGHNESS')
    ao = bake(objects, key+'-occlusion', size, 'AO')
    indirect = bake(objects, key+'-indirect', max(256,size//2), 'DIFFUSE', pass_filter={'INDIRECT'})
    for suffix, img in [('color',color),('normal',normal),('indirect',indirect)]:
        save_image(img, PUBLIC / f'{key}-{suffix}.png')
    rough_pixels = np.empty(size*size*4, dtype=np.float32)
    ao_pixels = np.empty_like(rough_pixels)
    roughness.pixels.foreach_get(rough_pixels)
    ao.pixels.foreach_get(ao_pixels)
    packed = rough_pixels.reshape(-1,4)
    packed[:,0] = ao_pixels.reshape(-1,4)[:,0]
    packed[:,2] = 0
    packed[:,3] = 1
    orm = bpy.data.images.new(key+'-orm', width=size, height=size, alpha=False)
    orm.colorspace_settings.name = 'Non-Color'
    orm.pixels.foreach_set(packed.ravel())
    save_image(orm, PUBLIC / f'{key}-orm.png')

    baked = bpy.data.materials.new(key+'-baked-pbr')
    baked.use_nodes = True
    nodes, links = baked.node_tree.nodes, baked.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    uv0 = nodes.new('ShaderNodeUVMap'); uv0.uv_map = 'UVMap'
    uv1 = nodes.new('ShaderNodeUVMap'); uv1.uv_map = 'LightmapUV'
    def texture(image, uv):
        node = nodes.new('ShaderNodeTexImage'); node.image = image
        links.new(uv.outputs['UV'], node.inputs['Vector'])
        return node
    albedo_node = texture(color, uv0)
    links.new(albedo_node.outputs['Color'], bsdf.inputs['Base Color'])
    normal_node = texture(normal, uv0)
    tangent = nodes.new('ShaderNodeNormalMap'); tangent.uv_map = 'UVMap'
    links.new(normal_node.outputs['Color'], tangent.inputs['Color'])
    links.new(tangent.outputs['Normal'], bsdf.inputs['Normal'])
    orm_node = texture(orm, uv0)
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(orm_node.outputs['Color'], separate.inputs[0])
    links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    occlusion = texture(orm, uv1)
    occlusion_channels = nodes.new('ShaderNodeSeparateColor')
    links.new(occlusion.outputs['Color'], occlusion_channels.inputs[0])
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    group_node = nodes.new('ShaderNodeGroup'); group_node.node_tree = group
    links.new(occlusion_channels.outputs['Red'], group_node.inputs['Occlusion'])
    for obj in objects:
        obj.data.materials.clear(); obj.data.materials.append(baked)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
    isolate(objects)
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = key
    joined.data.transform(joined.matrix_world)
    joined.matrix_world.identity()
    bounds = [joined.matrix_world @ Vector(c) for c in joined.bound_box]
    joined['assetKey'] = key
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC / f'{key}.glb'), export_format='GLB',
                             use_selection=True, export_apply=True, export_yup=True,
                             export_extras=True, export_materials='EXPORT')
    binary = (PUBLIC / f'{key}.glb').read_bytes()
    assert binary[:4] == b'glTF' and struct.unpack_from('<I', binary, 8)[0] == len(binary)
    json_size = struct.unpack_from('<I', binary, 12)[0]
    exported = json.loads(binary[20:20+json_size])
    primitive = exported['meshes'][0]['primitives'][0]
    assert 'TEXCOORD_1' in primitive['attributes'], 'light UV lost in export'
    exported_material = exported['materials'][primitive['material']]
    assert 'normalTexture' in exported_material and 'occlusionTexture' in exported_material
    assert 'baseColorTexture' in exported_material['pbrMetallicRoughness']
    joined.data.calc_loop_triangles()
    meta = {
        'key': key, 'model': f'/art/coast-rebuild/{key}.glb',
        'indirect': f'/art/coast-rebuild/{key}-indirect.png',
        'lighting': 'asset-local diffuse indirect only; direct sun excluded',
        'triangles': len(joined.data.loop_triangles), 'atlasSize': size,
        'height': max(v.z for v in bounds)-min(v.z for v in bounds),
        'width': max(v.x for v in bounds)-min(v.x for v in bounds),
        'depth': max(v.y for v in bounds)-min(v.y for v in bounds),
    }
    (PUBLIC / f'{key}.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    print('ASSET_DONE '+json.dumps(meta), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--asset', required=True, choices=ARCHITECTURE+NATURE)
    parser.add_argument('--size', type=int, default=1024)
    parser.add_argument('--samples', type=int, default=16)
    options = parser.parse_args()
    begin = time.perf_counter()
    bake_asset(options.asset, options.size, options.samples)
    print(f'ELAPSED {time.perf_counter()-begin:.1f}s', flush=True)
    # All artifacts are closed and validated above. Avoid Blender's C-side
    # interpreter-finalization crash in this isolated Windows worker process.
    sys.stdout.flush(); sys.stderr.flush()
    os._exit(0)
