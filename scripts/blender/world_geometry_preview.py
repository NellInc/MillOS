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
print('Exact Three.js geometry saved; game-lighting acceptance remains separate.')
