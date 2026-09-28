# Derived experiment, immutable provider original remains untouched.
import bpy,bmesh,pathlib,argparse,sys
parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--output',required=True);a=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);output=pathlib.Path(a.output).resolve()
if output.exists():raise RuntimeError('Preserve existing derivative; choose a new output path')
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(a.input).resolve()))
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':continue
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(o.data);bm.free()
 o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
 for p in o.data.polygons:p.use_smooth=True
 bpy.context.view_layer.objects.active=o
 modifier=o.modifiers.new('Area weighted architectural normals','WEIGHTED_NORMAL');modifier.mode='FACE_AREA';modifier.weight=75;modifier.keep_sharp=True
 bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True)
