"""Restore the authored elevator's 9 m maximum depth at 54.75 m height.

Tripo widened the depth in its unseen view. Only that axis changes; the ladder
height, chute angle in elevation and roof elevations stay intact.
Working if the final depth/height ratio equals 9/54.75 and X/Z do not move.
"""
import bpy
import pathlib
import json
root = pathlib.Path('test-results/tripo-world-20260907').resolve()
output = root/'grain-elevator-depth-fit.glb'
if output.exists():
    raise RuntimeError('Preserve existing derivative')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'grain-elevator-blender-cleanup.glb'))
obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
height = max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)
depth = max(v.co.y for v in obj.data.vertices)-min(v.co.y for v in obj.data.vertices)
factor = 9/54.75*height/depth
for vertex in obj.data.vertices:
    x,z = vertex.co.x,vertex.co.z
    vertex.co.y *= factor
    assert vertex.co.x == x and vertex.co.z == z
obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
for polygon in obj.data.polygons:
    polygon.use_smooth = True
modifier = obj.modifiers.new('Area weighted normals after depth correction','WEIGHTED_NORMAL')
modifier.mode = 'FACE_AREA'
modifier.weight = 75
modifier.keep_sharp = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True)
output.with_suffix('.json').write_text(json.dumps({'depthScale':factor,'targetHeight':54.75,'targetDepth':9,'preservedAxes':['X','Z']},indent=2))
