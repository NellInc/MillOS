"""Paired authored PBR atlas review. Run only under capture-lock.mjs.
Working if paired views use identical cameras, light, palette and material scale.
"""
import bpy, json, pathlib, sys, math
from mathutils import Vector
root=pathlib.Path.cwd(); folder=root/'output/asset-upgrade-20260926/authored-preview';folder.mkdir(exist_ok=True)
rows=json.loads((root/'output/asset-upgrade-20260926/authored-surfaces-result.json').read_text())['results']
chosen=['world-fuel-pump-shell','world-grain-silo-small-shell','world-wooden-bollard','world-oak-trunk-unit','world-factory-concrete-unit','world-city-masonry-unit','world-dock-bumper-rubber']
report=[]
for id in chosen:
 row=next(r for r in rows if r['id']==id)
 for arm in ['source','derivative']:
  bpy.ops.wm.read_factory_settings(use_empty=True)
  bpy.ops.import_scene.gltf(filepath=str(root/row[arm]))
  scene=bpy.context.scene; meshes=[o for o in scene.objects if o.type=='MESH']
  points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
  lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);centre=(lo+hi)/2;size=max(hi-lo)
  for mat in bpy.data.materials:
   if mat.use_nodes:
    for node in mat.node_tree.nodes:
     if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=row['verification']['normalScale']
  scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False;scene.cycles.seed=19
  scene.world=bpy.data.worlds.new('Neutral PBR review');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.18,.18,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
  for label,pos,energy,area in [('key',(2,-3,4),450,2.0),('edge',(-2,1,2),180,1.8)]:
   data=bpy.data.lights.new(label,'AREA');data.energy=energy*size*size;data.shape='DISK';data.size=size*area;ob=bpy.data.objects.new(label,data);scene.collection.objects.link(ob);ob.location=centre+Vector(pos)*size;ob.rotation_euler=(centre-ob.location).to_track_quat('-Z','Y').to_euler()
  data=bpy.data.cameras.new('Paired camera');cam=bpy.data.objects.new('Paired camera',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=size*1.25;data.clip_end=max(1000,size*10)
  scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
  for view,direction in [('front',(1,-1.7,.8)),('back',(-1,1.7,.8))]:
   cam.location=centre+Vector(direction).normalized()*size*3;cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update();projected=[cam.matrix_world.inverted()@p for p in points];data.ortho_scale=max(max(p[i] for p in projected)-min(p[i] for p in projected) for i in [0,1])*1.12;scene.render.filepath=str(folder/f'{id}-{arm}-{view}.png');bpy.ops.render.render(write_still=True)
  report.append({'id':id,'arm':arm,'family':row['verification']['family'],'normalScale':row['verification']['normalScale'],'views':['front','back'],'scope':'PBR model only; original procedural runtime material remains a separate integration gate'})
  (folder/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('AUTHORED_PBR_PREVIEW_COMPLETE',flush=True)
