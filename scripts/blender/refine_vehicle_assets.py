"""Craft the seven provider vehicle derivatives without replacing their identity.

Run Blender -b --python scripts/blender/refine_vehicle_assets.py -- [--render].
Rendering requires the existing capture-lock.mjs owner in the environment.
Original prepared meshes, repaired lamps, upper-body proportions and wheel
vertices are retained. Broad painted panel folds are locally planed, with
purposeful glass, wheel hardware and service details authored in the same
material/three-image atlas. Working if all seven delivery envelopes and protected
lamp colours are exact before export, exported RGB passes a separately measured
0.001 linear-channel tolerance, and the report records moved/added geometry.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/asset-upgrade-20260926/vehicles'
SOURCES = ROOT / 'assets/source/models/world'
SPECS = {
 'caravan': 'caravan-blender-cleanup.glb',
 'cute-car-sedan': 'cute-car-sedan-blender-cleanup.glb',
 'cute-car-suv': 'cute-car-suv-blender-cleanup.glb',
 'cute-car-hatchback': 'cute-car-hatchback-lamps.glb',
 'cute-car-pickup': 'cute-car-pickup-proportioned.glb',
 'food-truck': 'food-truck-proportioned.glb',
 'canal-boat': 'canal-boat-blender-cleanup.glb',
}
# Colours are restrained functional finishes, not a new vehicle livery.
PALETTE = {'rubber': (.055,.064,.068), 'steel': (.58,.64,.66),
 'glass': (.32,.43,.48), 'seal': (.09,.12,.14), 'brass': (.63,.43,.15),
 'ivory': (.72,.71,.63), 'wood': (.27,.16,.085), 'red': (.37,.11,.095),
 'grille': (.12,.14,.15)}
parser = argparse.ArgumentParser()
parser.add_argument('--asset', choices=list(SPECS))
parser.add_argument('--output-dir', type=Path, help='Evidence directory; defaults to the original vehicle refinement run')
parser.add_argument('--render', action='store_true')
parser.add_argument('--geometry-review', action='store_true', help='Fast matched textured geometry pairs; PBR review is a separate pass')
parser.add_argument('--render-after-only', action='store_true', help='Reuse immutable before views when repairing a reviewed candidate')
a = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
if (a.render or a.render_after_only or a.geometry_review) and not os.environ.get('MILLOS_CAPTURE_LOCK_PID'):
 raise RuntimeError('Use scripts/lib/capture-lock.mjs before rendering')
if a.output_dir:OUT=ROOT/a.output_dir
OUT.mkdir(parents=True, exist_ok=True)


def bounds(obj):
 p = [obj.matrix_world @ v.co for v in obj.data.vertices]
 return [[min(v[k] for v in p) for k in range(3)], [max(v[k] for v in p) for k in range(3)]]


def prepare_atlas(obj):
 """Append a dedicated swatch band, never overwrite a provider atlas island."""
 mat = obj.data.materials[0]
 nodes = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
 for node in nodes:
  im = node.image; w,h = im.size
  src = np.empty(w*h*4, dtype=np.float32); im.pixels.foreach_get(src)
  src = src.reshape((h,w,4)); band = h//8; dst = np.ones((h+band,w,4), dtype=np.float32)
  dst[:h] = src
  normal = 'normal' in im.name.lower(); orm = 'orm' in im.name.lower()
  for i,(key,col) in enumerate(PALETTE.items()):
   x0=i*w//len(PALETTE);x1=(i+1)*w//len(PALETTE)
   if normal: value=(.5,.5,1,1)
   elif orm: value=(1,.22 if key=='glass' else .56 if key in ('steel','brass') else .78,0,1)
   else:value=(*col,1)
   dst[h:,x0:x1]=value
   if not normal and not orm and key=='glass':
    # Quiet, continuous glass tonal variation, no painted white slash.
    for j in range(band):dst[h+j,x0:x1,:3]*=.9+.16*j/(band-1)
  new=bpy.data.images.new(im.name+'-crafted-atlas',width=w,height=h+band,alpha=True)
  new.colorspace_settings.name=im.colorspace_settings.name
  new.pixels.foreach_set(dst.ravel());new.pack();node.image=new
 for layer in obj.data.uv_layers:
  for loop in layer.data:loop.uv.y*=8/9
 for n in mat.node_tree.nodes:
  if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.45
 return mat


class DetailMesh:
 def __init__(self,mat,obj):self.v=[];self.f=[];self.c=[];self.mat=mat;self.parts=[];self.source=obj;self.glass_faces=0
 def mesh(self,name,vs,fs,color):
  off=len(self.v);self.v.extend(vs);self.f.extend([tuple(off+i for i in f) for f in fs]);self.c.extend([color]*len(fs));self.parts.append(name)
 def box(self,name,center,size,color,bevel=0):
  bm=bmesh.new();v=bmesh.ops.create_cube(bm,size=1)['verts']
  for p in v:p.co=Vector(center)+Vector([p.co[k]*size[k] for k in range(3)])
  if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=1,affect='EDGES')
  bm.verts.ensure_lookup_table();self.mesh(name,[tuple(v.co) for v in bm.verts],[[v.index for v in f.verts] for f in bm.faces],color);bm.free()
 def bar(self,name,p,q,r,color,segments=6):
  p,q=Vector(p),Vector(q);axis=(q-p).normalized();u=axis.cross(Vector((0,0,1)))
  if u.length<.001:u=axis.cross(Vector((0,1,0)))
  u.normalize();v=axis.cross(u);verts=[]
  for c in (p,q):
   for i in range(segments):verts.append(tuple(c+r*(math.cos(i*math.tau/segments)*u+math.sin(i*math.tau/segments)*v)))
  faces=[tuple(reversed(range(segments))),tuple(range(segments,2*segments))]
  faces.extend([(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)])
  self.mesh(name,verts,faces,color)
 def ring(self,name,center,axis,radius,width,depth,color,segments=16):
  c=Vector(center);n=Vector(axis).normalized();u=n.cross(Vector((0,0,1))).normalized();v=n.cross(u)
  verts=[]
  for r,d in [(radius,0),(radius-width,depth),(radius-width,0)]:
   for i in range(segments):verts.append(tuple(c+n*d+r*(math.cos(i*math.tau/segments)*u+math.sin(i*math.tau/segments)*v)))
  faces=[]
  for j in range(2):
   for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
  self.mesh(name,verts,faces,color)
 def pane(self,name,points):
  c=sum((Vector(v) for v in points),Vector())/len(points)
  inner=[tuple(c+(Vector(v)-c)*.94) for v in points]
  vs=list(points)+inner;faces=[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
  self.mesh(name+' gasket',vs,faces,'seal');self.mesh(name+' glass',inner,[(0,1,2,3)],'glass')
 def finish(self,obj):
  mesh=bpy.data.meshes.new('Purposeful vehicle details');mesh.from_pydata(self.v,[],self.f);mesh.materials.append(self.mat)
  uv=mesh.uv_layers.new(name=obj.data.uv_layers.active.name)
  for face,color in zip(mesh.polygons,self.c):
   i=list(PALETTE).index(color);cx=(i+.5)/len(PALETTE);cy=17/18
   coords=[mesh.vertices[j].co for j in face.vertices]
   axes=sorted(range(3),key=lambda k:max(p[k] for p in coords)-min(p[k] for p in coords),reverse=True)[:2]
   for li in face.loop_indices:
    p=mesh.vertices[mesh.loops[li].vertex_index].co; offsets=[]
    for k in axes:
     lo=min(v[k] for v in coords);hi=max(v[k] for v in coords);offsets.append((p[k]-lo)/(hi-lo)-.5 if hi>lo else 0)
    uv.data[li].uv=(cx+offsets[0]*.06,cy+offsets[1]*.06)
  for existing in obj.data.color_attributes:
   col=mesh.color_attributes.new(name=existing.name,type=existing.data_type,domain=existing.domain)
   for item in col.data:item.color=(1,1,1,1)
  detail=bpy.data.objects.new('Authored fittings',mesh);bpy.context.collection.objects.link(detail)
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);detail.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
  return len(self.v),len(self.f)


def dissolve_suv_cabin(obj,slug):
 """Recover the tight SUV budget only from redundant planar upper-cabin edges.

 UV islands, material seams and the complete lower body/wheels are protected.
 No ratio decimator is used. Original corner normals are restored by position
 and UV after the exact-coplanar operation.
 """
 if slug!='cute-car-suv':return 0
 m=obj.data;m.calc_loop_triangles();before=len(m.loop_triangles)
 uv=m.uv_layers.active
 def key(co,tex):return tuple(round(x,7) for x in (*co,*tex))
 normals={key(m.vertices[l.vertex_index].co,uv.data[l.index].uv):tuple(m.corner_normals[l.index].vector) for l in m.loops}
 protected={tuple(v.co) for v in m.vertices if v.co.z<=.02}
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
 bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=[v for v in bm.verts if v.co.z>.02],edges=[e for e in bm.edges if all(v.co.z>.02 for v in e.verts)],delimit={'UV','MATERIAL','SEAM'},use_dissolve_boundaries=False)
 # Classify atlas colours on the triangles that will actually ship. A dissolved
 # n-gon's UV centroid can cross an island and leave one exported glass corner
 # untreated. Triangulation keeps all vertices/UVs and the existing index budget.
 bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3],quad_method='BEAUTY',ngon_method='BEAUTY')
 bm.to_mesh(m);bm.free();m.update();uv=m.uv_layers.active
 assert protected=={tuple(v.co) for v in m.vertices if v.co.z<=.02}
 m.normals_split_custom_set([normals.get(key(m.vertices[l.vertex_index].co,uv.data[l.index].uv),tuple(m.corner_normals[l.index].vector)) for l in m.loops])
 m.calc_loop_triangles();return before-len(m.loop_triangles)


def plane_body(obj,slug):
 """Local mechanical panel repair. No wheel, lamp or envelope vertex can move."""
 m=obj.data;im=next(n.image for n in m.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and 'Color' in n.image.name)
 w,h=im.size;px=np.empty(w*h*4,dtype=np.float32);im.pixels.foreach_get(px);px=px.reshape(h,w,4)
 colors={}
 for loop in m.loops:
  uv=m.uv_layers.active.data[loop.index].uv;c=px[min(h-1,max(0,int(uv.y*h))),min(w-1,max(0,int(uv.x*w))),:3]
  colors.setdefault(loop.vertex_index,[]).append(c)
 original=bounds(obj);moved=[]
 car='cute-car' in slug
 if car:
  axis=1; targets={'cute-car-sedan':(-.2084,.2123),'cute-car-suv':(-.2397,.2436),'cute-car-hatchback':(-.2495,.2534),'cute-car-pickup':(-.1771,.1967)}[slug]
 else:axis=0;targets={'caravan':(-.183,.183),'food-truck':(-.228,.1614),'canal-boat':(-.091,.091)}[slug]
 for vert in m.vertices:
  p=vert.co;rgb=np.mean(colors[vert.index],axis=0)
  if any(abs(p[k]-original[j][k])<1e-6 for k in range(3) for j in range(2)):continue
  if car:
   if not (-.42<p.x<.42 and -.18<p.z<.009):continue
   # Wheel keep-out encloses every existing wheel, including the prior repair.
   if any((p.x-cx)**2+(p.z-cz)**2<rad**2 for cx,cz,rad in [(-.315,-.16,.115),(.31,-.16,.115)]):continue
   if max(rgb)-min(rgb)<.11:continue  # retain handles, seals and trim
   if slug=='cute-car-pickup' and p.z<=-.2025440335+.78/4.12:continue
  elif slug=='canal-boat':
   if not (-.235<p.y<.34 and -.045<p.z<.065 and rgb[0]>1.6*rgb[1]):continue
  elif slug=='food-truck':
   if not (-.49<p.y<.30 and -.135<p.z<.04 and rgb[0]>1.5*rgb[1]):continue
  else:
   if not (-.22<p.y<.48 and -.115<p.z<.12 and min(rgb)>.25 and max(rgb)-min(rgb)<.18):continue
  target=targets[int(p[axis]>0)];delta=target-p[axis]
  if .0001<abs(delta)<(.009 if car else .012):
   moved.append((vert.index,list(p)));p[axis]=target
 # Recompute only normals on altered paint triangles; imported normals on
 # unmodified tires, lamps and bevels remain intact.
 if moved:
  idx={i for i,_ in moved};normals=[tuple(n.vector) for n in m.corner_normals]
  m.update()
  for f in m.polygons:
   if any(v in idx for v in f.vertices) and abs(f.normal[axis])>.97:
    for i in f.loop_indices:normals[i]=tuple(f.normal)
  m.normals_split_custom_set(normals)
 return moved


def refinish_glass(obj,slug):
 """Refinish the existing glass faces, preserving window boundaries and pillars.

 Only blue-neutral glass faces inside the cabin are repacked to the clean
 optical swatch. The retained seals and columns remain the window frames.
 Source glass colours exceed 0.45 here; the blue-black pillars are below 0.3.
 This explicit measured separation keeps every original window frame intact.
 """
 if 'cute-car' not in slug:return 0
 mesh=obj.data;mat=mesh.materials[0]
 im=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and 'Color' in n.image.name)
 w,h=im.size;px=np.empty(w*h*4,dtype=np.float32);im.pixels.foreach_get(px);px=px.reshape(h,w,4)
 selected=[];front=[]
 ztop={'cute-car-sedan':.19,'cute-car-suv':.233,'cute-car-hatchback':.197,'cute-car-pickup':.145}[slug]
 for face in mesh.polygons:
  p=face.center
  if not (.012<p.z<ztop):continue
  side=abs(face.normal.y)>.68 and abs(p.y)>.14 and -.31<p.x<.28
  windshield=face.normal.x>.65 and .17<p.x<.30 and abs(p.y)<.19
  if not (side or windshield):continue
  uv=sum((mesh.uv_layers.active.data[i].uv for i in face.loop_indices),Vector((0,0)))/len(face.loop_indices)
  c=px[min(h-1,max(0,int(uv.y*h))),min(w-1,max(0,int(uv.x*w))),:3]
  if c.mean()<.45 or c[2]<c[0]*1.015 or c[1]<c[0]*1.01:continue
  selected.append(face)
  if windshield:front.append(face)
 normals=[tuple(n.vector) for n in mesh.corner_normals];mesh.update()
 front_normal=sum((f.normal*f.area for f in front),Vector((0,0,0))).normalized() if front else Vector((1,0,0))
 for face in selected:
  axis=0 if face in front else 1
  for i in face.loop_indices:
   v=mesh.vertices[mesh.loops[i].vertex_index].co
   horizontal=v.y if axis==0 else v.x
   mesh.uv_layers.active.data[i].uv=((list(PALETTE).index('glass')+.5)/len(PALETTE)+horizontal*.065,17/18+(v.z-.1)*.25)
   normals[i]=tuple(front_normal) if axis==0 else (0,1 if face.center.y>0 else -1,0)
 mesh.normals_split_custom_set(normals)
 return len(selected)


def wheel(d,center,axis,r):
 # Original tire profile remains; clean concentric hardware replaces the visual
 # impression of a melted polygonal hub without changing wheel proportions.
 n=Vector(axis);c=Vector(center)
 # Find the actual retained hub face, including provider left/right asymmetry.
 # A sub-millimetre source-space clearance avoids both occlusion and z-fighting.
 ax=max(range(3),key=lambda k:abs(n[k]));side=n[ax]
 candidates=[v.co[ax]*side for v in d.source.data.vertices if sum((v.co[k]-c[k])**2 for k in range(3) if k!=ax)<(r*1.12)**2 and v.co[ax]*side>0.1]
 if candidates:c[ax]=side*(max(candidates)+.0001)
 u=n.cross(Vector((0,0,1))).normalized();v=n.cross(u)
 verts=[tuple(c+n*.0003+radius*(u*math.cos(i*math.tau/10)+v*math.sin(i*math.tau/10))) for radius in (r,r-.004) for i in range(10)]
 d.mesh('machined rim lip',verts,[(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)],'steel')
 # Four flush bolt heads are sufficient at the actual game scale. Keep the
 # original hub centre and tire rather than layering three decorative rings.
 u=n.cross(Vector((0,0,1))).normalized();v=n.cross(u)
 for i in range(4):
  p=c+(u*math.cos(i*math.tau/4)+v*math.sin(i*math.tau/4))*r*.46+n*.0003
  k=r*.072
  d.mesh('flush wheel bolt',[tuple(p+u*k+v*k),tuple(p-u*k+v*k),tuple(p-u*k-v*k),tuple(p+u*k-v*k)],[(0,1,2,3)],'steel')


def car_details(d,slug):
 cfg={
 'cute-car-sedan':{'wheels':(-.322,.298,-.143,.044,(-.251,.255)), 'panes':[(-.277,-.059,.018,.177),(-.034,.192,.018,.177)],'side':(-.193,.197),'wind':(.26,.185,.055,.176)},
 'cute-car-suv':{'wheels':(-.302,.30,-.188,.048,(-.284,.287)), 'panes':[(-.265,-.052,.041,.215),(-.003,.232,.041,.215)],'side':(-.218,.222),'wind':(.275,.222,.045,.218)},
 'cute-car-hatchback':{'wheels':(-.302,.302,-.155,.047,(-.286,.290)), 'panes':[(-.236,-.075,.039,.176),(-.036,.126,.039,.176)],'side':(-.220,.224),'wind':(.25,.18,.025,.191)},
 'cute-car-pickup':{'wheels':(-.326,.325,-.132,.037,(-.219,.234)), 'panes':[(.068,.22,.028,.134)],'side':(-.174,.195),'wind':(.275,.272,.027,.139)},
 }[slug]
 x0,x1,z,r,sides=cfg['wheels']
 for s,y in zip((-1,1),sides):
  for x in (x0,x1):wheel(d,(x,y,z),(0,s,0),r)
 for s,y in zip((-1,1),cfg['side']):
  # Continuous restrained sill trim emphasizes a coherent panel seam.
  ybody={'cute-car-sedan':.214,'cute-car-suv':.245,'cute-car-hatchback':.258,'cute-car-pickup':.20}[slug]*s
  if slug not in ('cute-car-suv','cute-car-hatchback'):d.bar('lower door sill',(-.18,ybody,-.16),(.17,ybody,-.16),.003,'seal')
 xlow,xhigh,zlow,zhigh=cfg['wind']
 def screen(y,z,offset=.004):return (xlow+(xhigh-xlow)*(z-zlow)/(zhigh-zlow)+offset,y,z)
 for y in (-.095,.055):d.bar('windshield wiper',screen(y,zlow+.01),screen(y+.065,zlow+.065),.0026,'seal')


def caravan_details(d):
 for s in (-1,1):
  x=s*.195
  # Under-window fridge/service louvres, retained door and flower boxes.
  d.box('refrigerator service panel',(x,-.105,-.069),(.003,.087,.048),'ivory',.0015)
  for z in (-.079,-.070,-.061):d.bar('service louvre',(x+s*.003,-.139,z),(x+s*.003,-.071,z),.0014,'grille')
  d.bar('awning upper stay',(s*.207,-.07,.141),(s*.207,.36,.141),.0022,'steel')
  wheel(d,(s*.200,.200,-.157),(s,0,0),.028)
  # Keep the provider entrance step and tow coupling: both already read clearly.


def food_details(d):
 # Existing amber/white awning, red body, headlights and upper-body repair stay.
 for s,x in [(-1,-.241),(1,.179)]:
  for y in (-.319,.238):wheel(d,(x,y,-.194),(s,0,0),.029)
 # Work surface and bracket beneath the real +X serving opening.
 d.box('stainless serving counter',(.191,-.165,-.079),(.051,.405,.008),'steel',.002)
 for y in (-.34,.012):d.bar('counter support',(.169,y,-.108),(.207,y,-.083),.0024,'grille')
 # Service door on blank non-serving side, with framed access panel and louvers.
 x=-.233
 d.box('rear service hatch',(x,-.31,-.071),(.004,.118,.114),'red',.002)
 for y in (-.36,-.26):d.bar('service hinge',(x-.003,y,-.09),(x-.003,y,-.066),.002,'steel')
 d.bar('service latch',(x-.004,-.276,-.057),(x-.004,-.276,-.037),.0025,'steel')
 for z in (-.104,-.097,-.09):d.bar('kitchen ventilation',(x-.004,-.35,z),(x-.004,-.287,z),.0018,'grille')
 # The corrected cab and its lamps remain untouched.


def boat_details(d):
 for s in (-1,1):
  # Slim grab rails and stanchions above roof edge, still below original chimney.
  x=s*.073
  d.bar('cabin roof grab rail',(x,-.219,.088),(x,.321,.088),.0022,'brass')
  for y in (-.211,-.045,.12,.312):d.bar('rail stanchion',(x,y,.070),(x,y,.088),.002,'brass')
  # Porthole centre read from the source; concentric ring is intentionally thin.
  for y in (-.113,.006,.12,.24):d.ring('porthole machined rim',(s*.096,y,.024),(s,0,0),.018,.003,.001,'brass',16)
 for y in (-.375,.437):
  d.bar('mooring cleat foot',(-.014,y,-.044),(.014,y,-.044),.003,'steel')
  d.bar('mooring cleat stem',(0,y,-.054),(0,y,-.038),.003,'steel')


def render(obj,slug,arm):
 sc=bpy.context.scene;lo,hi=bounds(obj);mid=(Vector(lo)+Vector(hi))*.5
 cam=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));sc.collection.objects.link(cam);sc.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=1.15
 sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=12;sc.cycles.use_denoising=True
 sc.world=bpy.data.worlds.new('Matched studio');sc.world.use_nodes=True;bg=sc.world.node_tree.nodes.get('Background');bg.inputs[0].default_value=(.3,.35,.4,1);bg.inputs[1].default_value=.6
 lights=[]
 for i,p in enumerate([(2,-3,4),(-3,1,2),(1,3,3)]):
  ld=bpy.data.lights.new('Softbox','AREA');ld.energy=160;ld.size=2;light=bpy.data.objects.new('Softbox',ld);sc.collection.objects.link(light);light.location=mid+Vector(p);light.rotation_euler=(mid-light.location).to_track_quat('-Z','Y').to_euler();lights.append(light)
 if a.geometry_review:
  sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.color_type='TEXTURE';sc.display.shading.show_cavity=True;sc.display.shading.background_type='WORLD';sc.world.color=(.10,.12,.15)
  for material in obj.data.materials:
   material.node_tree.nodes.active=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and 'Color' in n.image.name)
 sc.render.resolution_x=1000;sc.render.resolution_y=720;sc.render.resolution_percentage=100
 dirs=[(.45,-1,.32),(-.45,1,.32)] if 'cute-car' in slug else [(1,-.5,.35),(-1,.5,.35)]
 for label,dr in zip(('front','back'),dirs):
  cam.location=mid+Vector(dr)*3;cam.rotation_euler=(mid-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(OUT/(f'{slug}-{arm}-'+('geometry-' if a.geometry_review else '')+f'{label}.png'));bpy.ops.render.render(write_still=True)
 for ob in lights+[cam]:bpy.data.objects.remove(ob,do_unlink=True)


reports=[]
for slug,source in SPECS.items():
 if a.asset and a.asset!=slug:continue
 bpy.ops.wm.read_factory_settings(use_empty=True);path=SOURCES/source
 bpy.ops.import_scene.gltf(filepath=str(path));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
 obj=meshes[0];bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 assert len(obj.data.materials)==1
 before=bounds(obj);old_count=len(obj.data.vertices);old_faces=len(obj.data.polygons)
 protected_lower=set()
 if slug in ('cute-car-pickup','food-truck'):
  metres,scale=(.78,4.12) if slug=='cute-car-pickup' else (.9,7.975)
  protected_lower={tuple(v.co) for v in obj.data.vertices if v.co.z<=before[0][2]+metres/scale}
 old_colors={c.name:np.array([list(v.color) for v in c.data]) for c in obj.data.color_attributes}
 if a.render or a.geometry_review:render(obj,slug,'before')
 removed_coplanar=dissolve_suv_cabin(obj,slug);moved=plane_body(obj,slug);mat=prepare_atlas(obj);glass_faces=refinish_glass(obj,slug);d=DetailMesh(mat,obj)
 if 'cute-car' in slug:car_details(d,slug)
 elif slug=='caravan':caravan_details(d)
 elif slug=='food-truck':food_details(d)
 else:boat_details(d)
 added_v,added_f=d.finish(obj)
 after=bounds(obj);error=max(abs(before[j][k]-after[j][k]) for j in range(2) for k in range(3));assert error<.0008,(slug,before,after)
 # This checks Blender arrays before export only. GLB byte-colour conversion
 # can quantize them; exported lamp RGB requires a separate 0.001-tolerance check.
 lamp_preserved=True
 for name,values in old_colors.items():
  actual=np.array([list(v.color) for v in obj.data.color_attributes[name].data])
  lamp_preserved &= np.array_equal(values,actual[:len(values)])
 assert lamp_preserved
 assert protected_lower.issubset({tuple(v.co) for v in obj.data.vertices})
 output=SOURCES/(slug+'-crafted.glb')
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
 report={'id':'world-'+slug,'source':str(path.relative_to(ROOT)),'derivative':str(output.relative_to(ROOT)),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'boundsBefore':before,'boundsAfter':after,'maxEnvelopeError':error,'originalVertices':old_count,'originalFaces':old_faces,'redundantCoplanarCabinTrianglesRemoved':removed_coplanar,'locallyPlanedVertices':len(moved),'refinishedExistingGlassFaces':glass_faces,'addedVertices':added_v,'addedFaces':added_f,'retainedLampColorsPreExportExact':lamp_preserved,'protectedLowerSourceVerticesExact':len(protected_lower),'materialCount':len(obj.data.materials),'details':dict((name,d.parts.count(name)) for name in sorted(set(d.parts))),'normalScale':.45,'atlas':'Original pixels retained with one-eighth-height appended authored swatch band, source UVs rescaled, no new material or image slots.','verification':{'blenderTwoView':a.render or a.render_after_only or a.geometry_review,'reviewEngine':'workbench-textured' if a.geometry_review else 'cycles-PBR','normalizedBudgets':False,'inScene':False}}
 (OUT/(slug+'-report.json')).write_text(json.dumps(report,indent=2));reports.append(report)
 if a.render or a.render_after_only or a.geometry_review:render(obj,slug,'after')
all_reports=[json.loads(p.read_text()) for p in sorted(OUT.glob('*-report.json'))]
(OUT.parent/'vehicles-result.json').write_text(json.dumps({'assets':all_reports,'caveats':['Source-space review is not the runtime acceptance gate. Root must normalize, validate budgets and inspect in-scene.','Original provider and prepared repair files remain unmodified.']},indent=2))
print(json.dumps(reports,indent=2))
