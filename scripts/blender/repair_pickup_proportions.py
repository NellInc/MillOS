"""Correct Tripo's overly tall cute-car-pickup upper body without flattening its wheels.

The exact authored envelope is 4.12 m long and 1.58 m high. Preserve the
lowest 0.78 m, including complete round tires; shorten only the upper body.
Working if final dimensions match those measurements and lower vertices do not move.
"""
import bpy
import bmesh
import pathlib
import json
root = pathlib.Path('test-results/tripo-world-20260907').resolve()
output = root / 'cute-car-pickup-proportioned.glb'
if output.exists():
    raise RuntimeError('Refusing to overwrite an existing derivative')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'cute-car-pickup-lamps.glb'))
obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
z_min = min(v.co.z for v in obj.data.vertices)
z_max = max(v.co.z for v in obj.data.vertices)
scale = 4.12 # provider length is exactly one source unit
threshold = z_min + 0.78 / scale
wanted_max = z_min + 1.58 / scale
factor = (wanted_max - threshold) / (z_max - threshold)
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
    plane_co=(0,0,threshold), plane_no=(0,0,1), dist=1e-7,
    clear_inner=False, clear_outer=False)
protected = [(v, v.co.copy()) for v in bm.verts if v.co.z <= threshold]
for vertex in bm.verts:
    if vertex.co.z > threshold:
        vertex.co.z = threshold + (vertex.co.z-threshold) * factor
assert all((v.co - original).length < 1e-8 for v, original in protected)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(obj.data)
bm.free()
obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
for face in obj.data.polygons:
    face.use_smooth = True
modifier = obj.modifiers.new('Area weighted architectural normals', 'WEIGHTED_NORMAL')
modifier.mode = 'FACE_AREA'
modifier.weight = 75
modifier.keep_sharp = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
assert abs((max(v.co.z for v in obj.data.vertices)-z_min)*scale - 1.58) < 1e-5
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True)
(root/'cute-car-pickup-proportion-repair.json').write_text(json.dumps({'lengthMetres':4.12,'heightMetres':1.58,'protectedLowerMetres':0.78,'upperHeightFactor':factor,'protectedVertices':len(protected)},indent=2))
