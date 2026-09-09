"""Tree-only source preview and geometry audit for the reference fidelity pass."""
import json
import math
import os
import sys
from pathlib import Path
import bpy
from mathutils import Vector
from nature import build_assets
from common import configure_cycles, box, material

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'output/reference-match-20260908'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = configure_cycles(16)
assets = build_assets()
keys = ['tree-round','tree-oak','tree-blossom','tree-slender']
active = {obj for key in keys for obj in assets[key]}
for obj in list(scene.objects):
    if obj not in active:
        bpy.data.objects.remove(obj, do_unlink=True)
stats = {}
for index,key in enumerate(keys):
    objects = assets[key]
    coordinates = [obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
    lower = [min(p[i] for p in coordinates) for i in range(3)]
    upper = [max(p[i] for p in coordinates) for i in range(3)]
    for obj in objects:
        obj.data.calc_loop_triangles()
        assert obj.matrix_world.determinant() > 0
    assert lower[2] >= 0
    stats[key] = {'sourceMin':lower,'sourceMax':upper,
                  'width':upper[0]-lower[0],'height':upper[2]-lower[2],
                  'depth':upper[1]-lower[1],
                  'runtimeXZRadius': max(math.hypot(p.x,p.y) for p in coordinates),
                  'triangles':sum(len(obj.data.loop_triangles) for obj in objects)}
    for obj in objects:
        obj.location.x += (index-1.5)*6.9
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'foliage-source-dimensions.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats),flush=True)
box('preview-ground',(0,0,-.09),(50,30,.18),material('preview-sand','C5BEA1',.9))
scene.world = bpy.data.worlds.new('Neutral review world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.78,.82,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
light=bpy.data.lights.new('Review daylight','AREA'); light.energy=2300;light.size=10
lamp=bpy.data.objects.new('Review daylight',light);scene.collection.objects.link(lamp)
lamp.location=(-9,-8,15);lamp.rotation_euler=(Vector((0,0,3))-lamp.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('Source geometry review')
cam=bpy.data.objects.new('Source geometry review',camera);scene.collection.objects.link(cam)
cam.location=(0,-30,10);cam.rotation_euler=(Vector((0,0,3.7))-cam.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO';camera.ortho_scale=28
scene.camera=cam
scene.render.resolution_x=1920;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'foliage-source-neutral.png')
bpy.ops.render.render(write_still=True)
sys.stdout.flush();sys.stderr.flush();os._exit(0)
