"""Restore red rear lamps through vertex colour, preserving the Tripo atlas.

No extra material or triangles. Working if each rear lamp receives red vertices,
front vertices remain white, and the exported GLB retains a single material.
"""
import argparse
import bpy
import json
import pathlib
import sys
from array import array

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
output = pathlib.Path(args.output).resolve()
if output.exists():
    raise RuntimeError('Refusing to overwrite an existing derivative')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(args.input).resolve()))
reports = []
for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    mesh = obj.data
    assert len(mesh.materials) == 1
    material = mesh.materials[0]
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    texture = bsdf.inputs['Base Color'].links[0].from_node
    image = texture.image
    pixels = array('f', [0]) * (image.size[0] * image.size[1] * 4)
    image.pixels.foreach_get(pixels)
    colors = mesh.color_attributes.new(name='RearLampTint', type='FLOAT_COLOR', domain='CORNER')
    mesh.color_attributes.active_color = colors
    uv = mesh.uv_layers.active
    corrected = [0, 0]
    for loop in mesh.loops:
        # Blender import converts glTF Y-up to Z-up, rear remains negative X.
        pos = mesh.vertices[loop.vertex_index].co
        u, v = uv.data[loop.index].uv
        x = min(image.size[0]-1, max(0, round(u * image.size[0])))
        y = min(image.size[1]-1, max(0, round(v * image.size[1])))
        i = (y * image.size[0] + x) * 4
        rgb = pixels[i:i+3]
        neutral_bright = min(rgb) > 0.16 and max(rgb)-min(rgb) < 0.12
        rear_lamp = pos.x < -0.46 and -0.12 < pos.z < 0.045 and abs(pos.y) > 0.075
        color = (1, 0.025, 0.02, 1) if rear_lamp and neutral_bright else (1, 1, 1, 1)
        colors.data[loop.index].color = color
        if color[1] < 1:
            corrected[int(pos.y > 0)] += 1
        assert pos.x < 0 or color == (1, 1, 1, 1)
    assert min(corrected) > 10, corrected
    reports.append({'mesh': obj.name, 'rearLampCornersPerSide': corrected, 'materials': 1})
    # A multiply node makes the vertex finish visible in Blender as well.
    vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = colors.name
    multiply = material.node_tree.nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    material.node_tree.links.new(texture.outputs['Color'], multiply.inputs[1])
    material.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[2])
    material.node_tree.links.new(multiply.outputs['Color'], bsdf.inputs['Base Color'])
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
                         export_vertex_color='ACTIVE', export_all_vertex_colors=False)
output.with_suffix('.json').write_text(json.dumps(reports, indent=2))
print(json.dumps(reports))
