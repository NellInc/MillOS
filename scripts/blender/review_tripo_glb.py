"""Read-only GLB turntable for Tripo acceptance, run under capture-lock.mjs.
No runtime GLB is exported or overwritten. Blender coordinates: Z up.
Working if four labelled views and a mesh/material report accompany every reviewed GLB.
"""
import argparse
import bpy
import bmesh
import json
import pathlib
import sys
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--outdir', required=True)
parser.add_argument('--recompute-normals', action='store_true')
parser.add_argument('--flat-color', action='store_true')
parser.add_argument('--material-preview', action='store_true', help='Render the actual PBR material, including vertex colour')
parser.add_argument('--smooth-iterations', type=int, default=0)
a = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = pathlib.Path(a.outdir).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(a.input).resolve()))
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
if a.smooth_iterations:
    for o in meshes:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
        bm.to_mesh(o.data)
        bm.free()
        bpy.context.view_layer.objects.active = o
        smooth = o.modifiers.new('Gentle surface cleanup', 'SMOOTH')
        smooth.factor = 0.4
        smooth.iterations = a.smooth_iterations
        bpy.ops.object.modifier_apply(modifier=smooth.name)
if a.recompute_normals:
    for o in meshes:
        o.data.normals_split_custom_set([(0, 0, 0)] * len(o.data.loops))
        for polygon in o.data.polygons:
            polygon.use_smooth = True
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
centre = (lo + hi) * 0.5
size = max(hi - lo)
for mat in bpy.data.materials:
    if mat.use_nodes:
        shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if shader:
            links = shader.inputs['Base Color'].links
            if links and links[0].from_node.type == 'TEX_IMAGE':
                mat.node_tree.nodes.active = links[0].from_node
report = {'file': str(pathlib.Path(a.input).resolve()), 'blenderBounds': {'min': list(lo), 'max': list(hi)}, 'meshes': []}
for o in meshes:
    o.data.calc_loop_triangles()
    report['meshes'].append({'name': o.name, 'vertices': len(o.data.vertices), 'triangles': len(o.data.loop_triangles), 'materials': [m.name for m in o.data.materials]})
report['images'] = [{'name': im.name, 'size': list(im.size)} for im in bpy.data.images]
(out / 'geometry-report.json').write_text(json.dumps(report, indent=2))
cam_data = bpy.data.cameras.new('Review camera')
cam = bpy.data.objects.new('Review camera', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = 'ORTHO'
cam_data.ortho_scale = size * 1.45
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'SINGLE' if a.flat_color else 'TEXTURE'
scene.display.shading.single_color = (0.3, 0.55, 0.3)
scene.display.shading.light = 'STUDIO'
scene.display.shading.show_cavity = True
scene.display.shading.background_type = 'WORLD'
scene.world = bpy.data.worlds.new('Neutral review background')
scene.world.color = (0.10, 0.12, 0.15)
if a.material_preview:
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (0.3, 0.35, 0.4, 1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value = 0.65
    for i, direction in enumerate([(2,-3,4),(-3,1,2),(1,3,3)]):
        light_data = bpy.data.lights.new('Review softbox '+str(i), 'AREA')
        light_data.energy = 180 * size * size
        light_data.shape = 'DISK'
        light_data.size = size * 2
        light = bpy.data.objects.new(light_data.name, light_data)
        scene.collection.objects.link(light)
        light.location = centre + Vector(direction) * size
        light.rotation_euler = (centre-light.location).to_track_quat('-Z','Y').to_euler()

scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
for name, direction in [('front', (0.25, -1, 0.15)), ('back', (-0.25, 1, 0.15)), ('left', (-1, -0.2, 0.2)), ('right', (1, 0.2, 0.2))]:
    cam.location = centre + Vector(direction).normalized() * size * 3
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / (name + '.png'))
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'review.blend'))
print(json.dumps(report))
