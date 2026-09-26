"""Replace the malformed ladder side with the silo's clean opposite half.

The vessel is rotationally symmetric. The authored access ladder, cage, fill cap
and marking remain runtime attachments rather than retaining Tripo's broken ladder.
Working if no face extends into the discarded half before mirroring, and the
result is symmetric about Y with one material and no added attachment geometry.
"""
import bpy
import bmesh
import json
import pathlib

root = pathlib.Path('test-results/tripo-world-20260907').resolve()
output = root / 'grain-silo-symmetric-body.glb'
if output.exists():
    raise RuntimeError('Refusing to overwrite a reviewed derivative')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'grain-silo-blender-cleanup.glb'))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1
obj = meshes[0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
original_faces = len(obj.data.polygons)
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
    dist=1e-7, plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_outer=True)
assert max(v.co.y for v in bm.verts) < 1e-6, 'Wrong half retained'
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
bm.to_mesh(obj.data)
bm.free()
mirror = obj.modifiers.new('Clean symmetric vessel body', 'MIRROR')
mirror.use_axis = (False, True, False)
mirror.use_mirror_merge = True
mirror.merge_threshold = 1e-6
bpy.ops.object.modifier_apply(modifier=mirror.name)
obj.data.normals_split_custom_set([(0, 0, 0)] * len(obj.data.loops))
for p in obj.data.polygons:
    p.use_smooth = True
weighted = obj.modifiers.new('Area-weighted vessel normals', 'WEIGHTED_NORMAL')
weighted.mode = 'FACE_AREA'
weighted.weight = 75
weighted.keep_sharp = True
bpy.ops.object.modifier_apply(modifier=weighted.name)
obj.data.calc_loop_triangles()
lo = [min(v.co[k] for v in obj.data.vertices) for k in range(3)]
hi = [max(v.co[k] for v in obj.data.vertices) for k in range(3)]
assert abs(lo[1] + hi[1]) < 1e-6
assert len(obj.data.materials) == 1
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True)
output.with_suffix('.json').write_text(json.dumps({'source': 'grain-silo-blender-cleanup.glb',
    'discardedHalf': 'Blender Y > 0, containing the malformed yellow ladder',
    'sourceFaces': original_faces, 'outputTriangles': len(obj.data.loop_triangles),
    'blenderBounds': {'min': lo, 'max': hi}, 'materials': 1,
    'remainingAcceptance': 'Turntable, runtime attachment seating, both authored silo sizes and current aggregate gates'}, indent=2))
