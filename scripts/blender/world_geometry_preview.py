"""Render exact Three.js vertex/normal studies, without exporting runtime GLBs.

Input: JSON with variants [{name, parts:[{positions, normals, color}]}],
spacing and camera/target. Normals and positions come from the real constructors.
Rendering requires scripts/lib/capture-lock.mjs; --save-only performs CPU-only authoring.
This is geometry evidence, not game lighting.
"""
import argparse
import json
import math
import pathlib
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--save-only', action='store_true', help='Save an editable .blend without rendering or using the GPU')
parser.add_argument('--turnaround', action='store_true', help='Also render square front/left/back/right views for Tripo multiview')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
data = json.loads(pathlib.Path(args.input).read_text())

def z_up(values):
    return (values[0], -values[2], values[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
materials = {}
for index, variant in enumerate(data['variants']):
    for part_index, part in enumerate(variant['parts']):
        values = part['positions']
        vertices = [z_up(values[i:i + 3]) for i in range(0, len(values), 3)]
        faces = [list(range(i, i + 3)) for i in range(0, len(vertices), 3)]
        mesh = bpy.data.meshes.new(variant['name'])
        mesh.from_pydata(vertices, [], faces)
        n = part['normals']
        mesh.normals_split_custom_set_from_vertices([z_up(n[i:i + 3]) for i in range(0, len(n), 3)])
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        key = (tuple(part['color']), part.get('image'))
        if key not in materials:
            mat = bpy.data.materials.new(str(key))
            mat.diffuse_color = (*part['color'], 1)
            if part.get('image'):
                mat.use_nodes = True
                tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
                tex.image = bpy.data.images.load(str(pathlib.Path(part['image']).resolve()))
                mat.node_tree.nodes.active = tex
                mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
            materials[key] = mat
        mesh.materials.append(materials[key])
        if part.get('uv'):
            uv = mesh.uv_layers.new()
            for loop in mesh.loops:
                j = loop.vertex_index * 2
                uv.data[loop.index].uv = part['uv'][j:j + 2]
        ob = bpy.data.objects.new(f'{variant["name"]}-{part_index}', mesh)
        bpy.context.collection.objects.link(ob)
        ob.location.x = index * data['spacing']
    text = bpy.data.curves.new('caption', 'FONT')
    text.body = variant['name']
    text.align_x = 'CENTER'
    text.size = data.get('labelSize', 0.65)
    ob = bpy.data.objects.new('caption', text)
    bpy.context.collection.objects.link(ob)
    ob.location = (index * data['spacing'], -1, data.get('labelY', -2))
    ob.rotation_euler.x = math.pi / 2
scene = bpy.context.scene
cam_data = bpy.data.cameras.new('Matched study camera')
cam = bpy.data.objects.new('Matched study camera', cam_data)
scene.collection.objects.link(cam)
cam.location = z_up(data['camera'])
cam.rotation_euler = (Vector(z_up(data['target'])) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.type = 'ORTHO'
cam_data.ortho_scale = data['scale']
scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = data.get('colorType', 'MATERIAL')
scene.display.shading.show_cavity = True
scene.display.shading.background_type = 'WORLD'
scene.world = bpy.data.worlds.new('Study background')
scene.world.color = (0.10, 0.12, 0.15)
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
out = pathlib.Path(args.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(out)
bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
if not args.save_only:
    bpy.ops.render.render(write_still=True)
if args.turnaround and not args.save_only:
    # Four views at the study camera's distance and elevation, for
    # scripts/tripo-world-queue.mjs multiview jobs (docs/TURNAROUND_PIPELINE.md).
    # Assets face Three +Z, which is Blender -Y. An object facing +Z has its own
    # left on Three +X, so the left view looks at it from +X. Same ortho scale and
    # lighting for all four, as Tripo asks for consistent views.
    # Frame the geometry itself, not the study camera's wider shot, on a light
    # plain ground, so the object fills each view and separates from it.
    corners = [ob.matrix_world @ Vector(c) for ob in scene.objects if ob.type == 'MESH' for c in ob.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    target = (low + high) / 2
    cam_data.ortho_scale = max(high - low) * 1.15
    radius = max(high - low) * 4
    # A slight downward look, so roofs and tops read as surfaces, not lines.
    height = radius * math.tan(math.radians(12))
    cam_data.clip_end = radius * 3
    scene.world.color = (0.82, 0.82, 0.80)
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    for view, (dx, dy) in (('front', (0, -1)), ('left', (1, 0)), ('back', (0, 1)), ('right', (-1, 0))):
        cam.location = target + Vector((dx * radius, dy * radius, height))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(out.with_name(f'{out.stem}-{view}.png'))
        bpy.ops.render.render(write_still=True)
    print('Turnaround views written: front, left, back, right.')
print('Exact Three.js geometry saved; game-lighting acceptance remains separate.')
