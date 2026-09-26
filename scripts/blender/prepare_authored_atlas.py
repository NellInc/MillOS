"""Pack an exported authored mesh into one material before Tripo texture treatment.

No geometry reconstruction. A one-material UV atlas prevents the provider's
per-material texture multiplication. Run baking under the capture lock.
Working if output contains one mesh/material and retains source triangle positions.
"""
import argparse
import bpy
import pathlib
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--size', type=int, default=1024)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
output = pathlib.Path(args.output).resolve()
if output.exists():
    raise RuntimeError('Refusing to overwrite authored atlas')
data = json.loads(pathlib.Path(args.input).read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
materials = {}
source_triangles = 0
omitted_zero_area_triangles = 0
for variant in data['variants']:
    for part in variant['parts']:
        # Explicit export metadata, not a colour heuristic, excludes shadow planes.
        if part.get('transparent'):
            continue
        points = part['positions']
        normals = part['normals']
        # Reconnect only identical position/normal corners within one material
        # part. Disconnected triangles produce thin, under-covered UV islands.
        # Keeping the normal in the key preserves hard edges without a weld.
        # Working if the emitted triangle-corner positions/normals match source
        # exactly while coplanar neighbours share their UV chart.
        vertices, vertex_normals, corners, unique = [], [], [], {}
        for i in range(0, len(points), 3):
            position = (points[i], -points[i+2], points[i+1])
            normal = (normals[i], -normals[i+2], normals[i+1])
            # Leaf cards deliberately retain both windings. Keep their triangle
            # corners separate so Blender cannot merge away the back face.
            # Working if both source windings survive the atlas verification.
            side_key = (i // 9,) if part.get('preserveOppositeWinding') else ()
            key = position + normal + side_key
            if key not in unique:
                unique[key] = len(vertices)
                vertices.append(position)
                vertex_normals.append(normal)
            corners.append(unique[key])
        faces = [corners[i:i+3] for i in range(0, len(corners), 3)]
        source_triangles += len(faces)
        kept = []
        for face in faces:
            a, b, c = [vertices[i] for i in face]
            u = [b[k] - a[k] for k in range(3)]
            v = [c[k] - a[k] for k in range(3)]
            cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
            if all(value == 0 for value in cross):
                omitted_zero_area_triangles += 1
            else:
                kept.append(face)
        if not kept:
            continue
        used = sorted({index for face in kept for index in face})
        remap = {old: new for new, old in enumerate(used)}
        faces = [[remap[index] for index in face] for face in kept]
        vertices = [vertices[index] for index in used]
        vertex_normals = [vertex_normals[index] for index in used]
        mesh = bpy.data.meshes.new('Authored surface')
        mesh.from_pydata(vertices, [], faces)
        if mesh.validate(clean_customdata=False):
            raise RuntimeError('Unexpected invalid source topology after exact zero-area removal')
        mesh.normals_split_custom_set_from_vertices(vertex_normals)
        for face in mesh.polygons:
            face.use_smooth = True
        key = tuple(part['color'])
        if key not in materials:
            material = bpy.data.materials.new('Authored palette')
            material.use_nodes = True
            nodes = material.node_tree.nodes
            nodes.clear()
            emission = nodes.new('ShaderNodeEmission')
            emission.inputs['Color'].default_value = (*key,1)
            out = nodes.new('ShaderNodeOutputMaterial')
            material.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
            materials[key] = material
        mesh.materials.append(materials[key])
        obj = bpy.data.objects.new('Authored surface',mesh)
        bpy.context.collection.objects.link(obj)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()
obj = bpy.context.object
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.151917, island_margin=0.012)
bpy.ops.object.mode_set(mode='OBJECT')
atlas = bpy.data.images.new('Authored palette atlas',width=args.size,height=args.size)
atlas.colorspace_settings.name = 'sRGB'
for material in obj.data.materials:
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = atlas
    material.node_tree.nodes.active = node
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.render.bake.margin = 8
bpy.ops.object.bake(type='EMIT')
atlas.pack()
material = bpy.data.materials.new('Single authored atlas')
material.use_nodes = True
nodes = material.node_tree.nodes
texture = nodes.new('ShaderNodeTexImage')
texture.image = atlas
shader = nodes.get('Principled BSDF')
material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
shader.inputs['Roughness'].default_value = 0.65
obj.data.materials.clear()
obj.data.materials.append(material)
for face in obj.data.polygons:
    face.material_index = 0
obj.data.calc_loop_triangles()
if len(obj.data.loop_triangles) != source_triangles - omitted_zero_area_triangles:
    raise RuntimeError('Triangle count changed during atlas preparation')
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True)
output.with_suffix('.json').write_text(json.dumps({'source':str(pathlib.Path(args.input).resolve()),'triangles':len(obj.data.loop_triangles),'sourceTriangles':source_triangles,'omittedExactZeroAreaTriangles':omitted_zero_area_triangles,'materials':1,'atlasSize':args.size},indent=2))
