"""Deterministic Blender helpers. Coordinates: metres, Z up, front -Y."""
import math
import bpy
from mathutils import Vector


def linear_hex(value):
    value = value.lstrip('#')
    values = [int(value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in values)


def material(name, color, roughness=.85):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    base = (*linear_hex(color), 1) if isinstance(color, str) else tuple(color[:3]) + (1,)
    mat.diffuse_color = base
    principled = mat.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value = base
    principled.inputs['Roughness'].default_value = roughness
    return mat


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def box(name, location, dimensions, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Authored edge bevel', 'BEVEL')
        modifier.width = min(bevel, min(dimensions) * .22)
        modifier.segments = 2
        modifier.affect = 'EDGES'
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        normal = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return obj


def beam(name, a, b, radius, mat, vertices=6):
    a, b = Vector(a), Vector(b)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius*.72,
                                  depth=delta.length, location=(a+b)*.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(mat)
    return obj


def isolate(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def configure_cycles(samples=16):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 2
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    # CPU baking is repeatable across the user's GPU and Blender runtime versions.
    scene.cycles.device = 'CPU'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    return scene
