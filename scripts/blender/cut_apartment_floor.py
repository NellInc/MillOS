"""Remove one middle storey, keeping the entrance, roof and every remaining window at full size."""
import bpy, bmesh, pathlib, json
root = pathlib.Path('test-results/tripo-world-20260907').resolve()
output = root / 'office-apartment-three-blender-cleanup.glb'
if output.exists():
    raise RuntimeError('Refusing to overwrite an existing derivative')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'office-apartment-blender-cleanup.glb'))
# Measured repeating floor bands in provider coordinates are centred near
# -0.05 and +0.17. Cut in the plain wall immediately below each band.
lower = -0.066
upper = lower + 3.5 / 16.1
report = []
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    before = len(bm.faces)
    for height in (lower, upper):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(0,0,height), plane_no=(0,0,1), dist=1e-7,
            clear_inner=False, clear_outer=False)
    removed = [f for f in bm.faces if lower+1e-7 < f.calc_center_median().z < upper-1e-7]
    bmesh.ops.delete(bm, geom=removed, context='FACES')
    for vertex in bm.verts:
        if vertex.co.z >= upper - 1e-6:
            vertex.co.z -= upper - lower
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.normals_split_custom_set([(0,0,0)] * len(obj.data.loops))
    for face in obj.data.polygons:
        face.use_smooth = True
    modifier = obj.modifiers.new('Area weighted architectural normals', 'WEIGHTED_NORMAL')
    modifier.mode = 'FACE_AREA'
    modifier.weight = 75
    modifier.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    report.append({'mesh':obj.name, 'facesBefore':before, 'facesAfter':len(obj.data.polygons)})
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True)
(root / 'apartment-floor-cut.json').write_text(json.dumps({'cut':[lower,upper], 'removedMetres':3.5, 'meshes':report},indent=2))
