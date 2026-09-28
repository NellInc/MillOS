"""Craft the farm and civic props with explicit joinery and retained runtime envelopes.

Single mesh/material per prop, with an authored sRGB colour and linear roughness
atlas. No provider source is overwritten. The pond is independently authored too.
Working if exported bounds match the recorded envelope and runtime water, sign and
shelter-overlay datums remain unchanged. Run renders separately under capture-lock.
"""
import argparse, hashlib, json, math, pathlib, struct, sys, zlib
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

P = argparse.ArgumentParser()
P.add_argument('--only', default='')
P.add_argument('--baseline-dir', help='Optional immutable pre-refinement delivery snapshot; otherwise use preserved provider sources.')
P.add_argument('--out', default='assets/source/models')
P.add_argument('--report', required=True)
A = P.parse_args(sys.argv[sys.argv.index('--') + 1:])
OUT = pathlib.Path(A.out).resolve()
BASE = pathlib.Path(A.baseline_dir).resolve() if A.baseline_dir else None
REPORT = pathlib.Path(A.report).resolve()
# Runtime dimensions, in metres, after the existing normalization decisions.
ENVELOPES = {
 'farm-haybale': (1.346,1.311,1.5), 'farm-watertrough':(1.5,.542,.548),
 'farm-gardenbed':(3,1.233,2.177), 'farm-fence':(1.636,1.05,.196),
 'village-wishingwell':(2.2085,2.934,2.4), 'village-marketstall':(1.56,2.249,2.8),
 'village-postbox':(.712,1.5,.708), 'village-fountain':(3.145,3.32,3.18),
 'village-duckpond':(11,2.195,10.956), 'world-bus-shelter':(4.4,2.99,2.3),
 'world-park-bench':(1.8,.995,.61), 'world-picnic-table':(1.8,.81,1.415),
 'world-waste-bin':(.56,.8,.56), 'world-path-lamp-victorian':(.6705,4.45,.5486),
 'world-path-lamp-modern':(.5406,4.25,.524), 'world-info-sign':(.7674,1.55,.1941),
}
# Six by six tiles, all colours authored as sRGB display values. Atlas rows are
# bottom-up for UV coordinates and flipped exactly once when written as PNG.
PALETTE = [
 ('oak',(132,86,48),.74,'wood'), ('oak-light',(155,106,62),.72,'wood'),
 ('oak-dark',(98,65,41),.8,'wood'), ('weathered',(131,126,104),.84,'wood'),
 ('iron',(38,47,45),.52,'paint'), ('green',(36,73,57),.54,'paint'),
 ('steel',(135,149,146),.38,'metal'), ('brass',(171,141,68),.42,'metal'),
 ('red',(169,43,33),.5,'paint'), ('black',(23,28,29),.65,'paint'),
 ('stone',(142,144,130),.88,'stone'), ('stone-light',(165,167,150),.84,'stone'),
 ('clay',(149,74,48),.8,'stone'), ('soil',(74,52,37),.97,'stone'),
 ('water',(54,115,132),.2,'water'), ('straw',(185,151,70),.92,'straw'),
 ('rope',(141,114,67),.9,'wood'), ('leaf',(62,101,39),.84,'leaf'),
 ('leaf-light',(110,144,66),.8,'leaf'), ('leaf-dark',(37,76,41),.9,'leaf'),
 ('fruit',(182,73,30),.62,'paint'), ('produce',(144,162,81),.8,'leaf'),
 ('canvas-red',(145,45,38),.9,'cloth'), ('canvas-cream',(218,201,157),.9,'cloth'),
 ('lens',(225,214,170),.28,'paint'), ('slate',(49,66,70),.83,'stone'),
 ('concrete',(142,142,126),.94,'stone'), ('rust',(119,65,35),.9,'stone'),
 ('wood-end',(126,83,47),.85,'end'), ('leather',(107,65,34),.88,'cloth'),
 ('stone-dark',(108,113,104),.94,'stone'), ('leaf-warm',(93,127,46),.9,'leaf'),
 ('cream',(231,223,197),.65,'paint'), ('gravel',(120,115,98),.96,'stone'),
 ('bark',(85,70,46),.94,'wood'), ('white',(199,204,194),.65,'paint'),
]
TILES={v[0]:i for i,v in enumerate(PALETTE)}
PARTS=[]
MAT=None

def png(path, data):
 h,w,_=data.shape
 def chunk(kind,payload):return struct.pack('!I',len(payload))+kind+payload+struct.pack('!I',zlib.crc32(kind+payload)&0xffffffff)
 raw=b''.join(b'\0'+row.tobytes() for row in data)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))

def material(folder):
 global MAT
 size=768;tile=128;yy,xx=np.mgrid[0:tile,0:tile]/tile
 rgb=np.zeros((size,size,4),dtype=np.uint8);orm=rgb.copy()
 for i,(_,colour,rough,kind) in enumerate(PALETTE):
  fine=np.sin(xx*37+yy*19)*np.sin(yy*29-xx*13)
  if kind=='wood':signal=.045*np.sin(yy*43+1.8*np.sin(xx*5))+.025*np.sin(yy*91+xx*9)+.012*fine
  elif kind=='end':signal=.055*np.sin(np.sqrt((xx-.45)**2+(yy-.55)**2)*72)+.014*fine
  elif kind=='straw':signal=.08*np.sin(xx*58+np.sin(yy*11))+.025*np.sin(xx*107+yy*15)
  elif kind=='cloth':signal=.015*(np.sin(xx*90)+np.sin(yy*90))+.012*fine
  elif kind=='stone':signal=.04*np.sin(xx*19+yy*7)*np.sin(yy*23-xx*9)+.012*fine
  elif kind=='leaf':signal=.035*np.sin(xx*15+yy*17)+.015*fine
  else:signal=.012*fine
  x=(i%6)*tile;y=(i//6)*tile
  rgb[y:y+tile,x:x+tile,:3]=np.clip(np.array(colour)[None,None,:]*(1+signal[:,:,None]),0,255).astype(np.uint8)
  rgb[y:y+tile,x:x+tile,3]=255
  orm[y:y+tile,x:x+tile]=np.stack([np.full_like(xx,255),np.clip((rough+signal*.3)*255,0,255),np.zeros_like(xx),np.full_like(xx,255)],axis=2).astype(np.uint8)
 folder.mkdir(parents=True,exist_ok=True)
 for name,data in [('albedo',rgb),('orm',orm)]:png(folder/(name+'.png'),data[::-1])
 MAT=bpy.data.materials.new('Crafted prop atlas');MAT.use_nodes=True
 nodes=MAT.node_tree.nodes;links=MAT.node_tree.links;shader=nodes.get('Principled BSDF')
 for name in ['albedo','orm']:
  image=bpy.data.images.load(str(folder/(name+'.png')));image.name='crafted-prop-'+name
  image.colorspace_settings.name='sRGB' if name=='albedo' else 'Non-Color';image.pack()
  tex=nodes.new('ShaderNodeTexImage');tex.image=image
  if name=='albedo':links.new(tex.outputs['Color'],shader.inputs['Base Color']);nodes.active=tex
  else:
   sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],shader.inputs['Roughness'])
 shader.inputs['Metallic'].default_value=0


def finish(o,key,bevel=0,smooth=False,bevel_segments=1):
 bpy.context.view_layer.objects.active=o
 if bevel:
  m=o.modifiers.new('Small manufactured arris','BEVEL');m.width=bevel;m.segments=bevel_segments
  bpy.ops.object.modifier_apply(modifier=m.name)
 mesh=o.data
 # Axis projection stays local to a component. Grain follows its long dimension;
 # islands stay inside a 6-pixel tile gutter after minification.
 uv=mesh.uv_layers.active or mesh.uv_layers.new(name='UVMap')
 tile=TILES[key];u0=(tile%6)/6;v0=(tile//6)/6
 for f in mesh.polygons:
  points=[mesh.vertices[mesh.loops[i].vertex_index].co for i in f.loop_indices]
  spans=[max(v[k] for v in points)-min(v[k] for v in points) for k in range(3)]
  axes=sorted(range(3),key=lambda k:spans[k],reverse=True)[:2]
  lows=[min(v[k] for v in points) for k in axes]
  for index,p in zip(f.loop_indices,points):
   coord=[(p[k]-lows[j])/max(spans[k],1e-8) for j,k in enumerate(axes)]
   uv.data[index].uv=(u0+(.045+.91*coord[0])/6,v0+(.045+.91*coord[1])/6)
  f.use_smooth=smooth and len(f.vertices)<=4
 mesh.materials.clear();mesh.materials.append(MAT)
 if bevel:
  n=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=40
  for f in mesh.polygons:f.use_smooth=True
  bpy.ops.object.modifier_apply(modifier=n.name)
 PARTS.append(o);return o

def box(name,loc,dims,key='oak',bevel=.008,rot=None,segments=1):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dims
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 finish(o,key,min(bevel,min(dims)*.24),bevel_segments=segments)
 if rot:o.rotation_euler=rot
 return o

def cylinder(name,loc,radius,depth,key='iron',vertices=16,rot=None,radius2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if radius2 is None else radius2,depth=depth,location=loc)
 o=bpy.context.object;o.name=name;finish(o,key,smooth=True)
 if rot:o.rotation_euler=rot
 return o

def beam(name,a,b,width,key='oak',depth=None):
 a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,depth or width,(b-a).length),key,min(width*.08,.01));o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def torus(name,loc,radius,tube,key='iron',segments=24,rot=None,minor=6):
 bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=minor,location=loc,major_radius=radius,minor_radius=tube)
 o=bpy.context.object;o.name=name;finish(o,key,smooth=True)
 if rot:o.rotation_euler=rot
 return o

def meshpart(name,verts,faces,key,smooth=False,bevel=0):
 clean=[]
 for face in faces:
  unique=[]
  for index in face:
   if not any((Vector(verts[index])-Vector(verts[other])).length<1e-9 for other in unique):unique.append(index)
  if len(unique)<3:continue
  area=sum((Vector(verts[unique[i]])-Vector(verts[unique[0]])).cross(Vector(verts[unique[i+1]])-Vector(verts[unique[0]])).length for i in range(1,len(unique)-1))
  if area>1e-12:clean.append(unique)
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],clean);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);return finish(o,key,bevel=bevel,smooth=smooth)

def sphere(name,loc,scale,key='leaf',segments=12,rings=6):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,key,smooth=True)

def lathe(name,profile,key='stone',segments=32,loc=(0,0,0),flutes=0,depth=0,continuous_uv=False):
 verts=[]
 for j,(r,z) in enumerate(profile):
  for i in range(segments):
   a=i*math.tau/segments;rr=max(0,r-depth*(.5+.5*math.cos(flutes*a))*math.sin(j*math.pi/(len(profile)-1))**2) if flutes else r
   verts.append((loc[0]+rr*math.cos(a),loc[1]+rr*math.sin(a),loc[2]+z))
 faces=[(j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i) for j in range(len(profile)-1) for i in range(segments)]
 o=meshpart(name,verts,faces,key,True)
 if continuous_uv:
  # One cylindrical chart replaces face-local islands, without removing any
  # fluting or rim geometry. Working if the delivered budget passes unchanged.
  tile=TILES[key];u0=(tile%6)/6;v0=(tile//6)/6
  arc=[0]
  for p,q in zip(profile,profile[1:]):arc.append(arc[-1]+math.hypot(p[0]-q[0],p[1]-q[1]))
  for f in o.data.polygons:
   wrap=any(v%segments==segments-1 for v in f.vertices) and any(v%segments==0 for v in f.vertices)
   for index in f.loop_indices:
    vi=o.data.loops[index].vertex_index;u=(vi%segments)/segments
    if wrap and vi%segments==0:u=1
    o.data.uv_layers.active.data[index].uv=(u0+(.045+.91*u)/6,v0+(.045+.91*arc[vi//segments]/arc[-1])/6)
 return o

def radial_segment(name,profile,a,b,key,steps=4,bevel=0):
 # Closed curved block with real end faces. Working if a joint is visible from
 # above without exposing the underside or changing its fit envelope.
 n=steps+1;verts=[(r*math.cos(a+(b-a)*i/steps),r*math.sin(a+(b-a)*i/steps),z) for r,z in profile for i in range(n)]
 faces=[]
 for j in range(len(profile)):
  k=(j+1)%len(profile)
  for i in range(steps):faces.append((j*n+i,j*n+i+1,k*n+i+1,k*n+i))
 faces.extend([tuple(j*n for j in range(len(profile))),tuple(j*n+steps for j in reversed(range(len(profile))) )])
 return meshpart(name,verts,faces,key,bevel=bevel)

def bolts(xs,ys,z,key='steel'):
 for x in xs:
  for y in ys:cylinder('Recessed carriage bolt',(x,y,z),.013,.008,key,6)

def tube(name,points,radius,key='iron',sides=6):
 # Connected rings, not overlapping cylinders: the rope/runner has a continuous
 # silhouette. Working if every segment shares its boundary ring with the next.
 points=[Vector(p) for p in points];verts=[];previous_u=None
 if any((b-a).length<1e-7 for a,b in zip(points,points[1:])):raise RuntimeError(name+': duplicated tube station')
 for i,p in enumerate(points):
  tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
  ref=Vector((0,0,1)) if abs(tangent.z)<.95 else Vector((0,1,0))
  # Parallel-transport the ring instead of changing its reference axis at
  # a bend. Working if a curved arm has neither a twist nor a zero-length ring.
  u=previous_u-tangent*previous_u.dot(tangent) if previous_u is not None else tangent.cross(ref)
  if u.length<1e-6:u=tangent.cross(ref)
  u.normalize();v=tangent.cross(u).normalized();previous_u=u.copy()
  for j in range(sides):
   a=j*math.tau/sides;verts.append(tuple(p+radius*(u*math.cos(a)+v*math.sin(a))))
 faces=[tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))]
 for i in range(len(points)-1):
  for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 o=meshpart(name,verts,faces,key,True)
 # Continuous atlas coordinates share tube vertices instead of putting every
 # quad in its own UV island. Working if delivery retains one ring per sample.
 tile=TILES[key];u0=(tile%6)/6;v0=(tile//6)/6
 for f in o.data.polygons:
  wrap=any(v%sides==sides-1 for v in f.vertices) and any(v%sides==0 for v in f.vertices)
  for index in f.loop_indices:
   vi=o.data.loops[index].vertex_index;u=(vi%sides)/sides
   if wrap and vi%sides==0:u=1
   o.data.uv_layers.active.data[index].uv=(u0+(.045+.91*u)/6,v0+(.045+.91*(vi//sides)/(len(points)-1))/6)
 return o

def board(name,loc,dims,key='oak',rot=None):
 o=box(name,loc,dims,key,.014,rot=rot,segments=2)
 # Cut ends follow the long axis, including the short Y-aligned arm grips.
 axis=max(range(3),key=lambda i:dims[i]);other=[i for i in range(3) if i!=axis]
 tile=TILES['wood-end'];u0=(tile%6)/6;v0=(tile//6)/6
 for f in o.data.polygons:
  if abs(f.normal[axis])<.8:continue
  for i in f.loop_indices:
   v=o.data.vertices[o.data.loops[i].vertex_index].co
   o.data.uv_layers.active.data[i].uv=(u0+(.5+.84*v[other[0]]/dims[other[0]])/6,v0+(.5+.84*v[other[1]]/dims[other[1]])/6)
 return o

def bench():
 for i in range(4):board('Separate seat slat',(0,-.18+i*.123,.45),(1.8,.108,.055),'oak-light' if i%2 else 'oak')
 for i in range(3):board('Reclined back slat',(0,.235+i*.014,.64+i*.151),(1.8,.065,.128),'oak',rot=(-.09,0,0))
 for x in [-.64,.64]:
  for y in [-.18,.21]:
   box('Cast iron foot',(x,y,.025),(.18,.18,.05),'iron')
   bolts([x-.053,x+.053],[y-.049,y+.049],.052,'iron')
  beam('Front cast leg',(x,-.18,.04),(x,-.15,.445),.065,'iron')
  beam('Back cast leg and upright',(x,.21,.04),(x,.26,.98),.065,'iron')
  beam('Under-seat bearing',(x,-.255,.412),(x,.26,.412),.055,'iron')
  # Radius at the front replaces the sharp right-angle hand contact.
  points=[(x,-.18,.443)]
  for i in range(9):
   a=math.pi-i*math.pi/16;points.append((x,-.08+.10*math.cos(a),.585+.10*math.sin(a)))
  points.extend([(x,.16,.685),(x,.255,.70)])
  tube('Continuous cast arm',points,.032,'iron',8)
  board('Oak hand grip',(x,.055,.704),(.061,.255,.043),'oak-light')
  beam('Diagonal frame brace',(x,-.15,.13),(x,.22,.41),.04,'iron')
  # Each end frame ties into the low longitudinal stretcher.
  beam('Stretcher end bearer',(x,-.17,.18),(x,.22,.18),.035,'iron')
  for z in [.64,.791,.942]:cylinder('Back bolt',(x,.19,z),.014,.012,'steel',6,rot=(math.pi/2,0,0))
 beam('Low longitudinal stretcher',(-.64,.02,.18),(.64,.02,.18),.036,'iron')
 bolts([-.64,.64],[-.18,-.057,.066,.189],.482)

def picnic():
 for y in [-.294,-.147,0,.147,.294]:board('Tabletop slat',(0,y,.7775),(1.8,.135,.065),'oak' if y else 'oak-light')
 for side in [-1,1]:
  for y in [.52,.659]:board('Bench slat',(0,side*y,.425),(1.8,.12,.055),'oak-light')
 for x in [-.58,.58]:
  for side in [-1,1]:beam('Splayed trestle',(x,side*.58,.035),(x,side*.24,.74),.09,'oak-dark')
  box('Seat bearer',(x,0,.365),(.105,1.36,.09),'oak-dark')
  box('Tabletop bearer',(x,0,.727),(.11,.74,.055),'oak-dark')
  # A central member gives the two braces a supported joint; no floating X.
  beam('Longitudinal knee brace',(0,0,.35),(x,0,.705),.065,'oak-dark')
  for side in [-1,1]:
   box('Seat-bearer angle face',(x+(.058 if x>0 else -.058),side*.425,.346),(.014,.19,.095),'iron',.003)
   box('Seat-bearer angle return',(x,side*.425,.399),(.13,.19,.014),'iron',.003)
   for y in [side*.375,side*.475]:cylinder('Trestle bolt',(x+(.067 if x>0 else -.067),y,.345),.015,.014,'steel',8,rot=(0,math.pi/2,0))
   # Upper straps follow the actual leg slope beneath the table bearer.
   beam('Upper joint strap',(x+(.051 if x>0 else -.051),side*.285,.638),(x+(.051 if x>0 else -.051),side*.246,.721),.022,'iron',.072)
  cylinder('Stretcher peg',(x,0,.359),.018,.106,'wood-end',8,rot=(math.pi/2,0,0))
 box('Central timber stretcher',(0,0,.335),(1.31,.085,.10),'oak-dark')
 bolts([-.58,.58],[-.294,-.147,0,.147,.294],.813)
 bolts([-.58,.58],[-.52,-.659,.52,.659],.457)

def waste():
 lathe('Rolled liner',[(.20,.02),(.235,.06),(.25,.69),(.253,.745),(.233,.745),(.229,.09),(.0,.09)],'black',24)
 torus('Rolled rim',(0,0,.772),.252,.028,'iron',24,minor=4)
 torus('Lower strengthening bead',(0,0,.065),.23,.018,'iron',24,minor=4)
 for i in range(20):
  a=i*math.tau/20
  box('Powder-coated stave',(.239*math.cos(a),.239*math.sin(a),.406),(.026,.058,.657),'iron',.005,rot=(0,0,a))
 for z in [.16,.67]:torus('Circumferential strap',(0,0,z),.253,.009,'green',24,minor=4)
 cylinder('Base foot',(0,0,.023),.24,.046,'black',24)

def shelter():
 box('Concrete landing',(0,0,.055),(4.4,2.3,.11),'concrete',.025)
 for x in [-1.98,1.98]:
  for y in [-.9,.9]:
   box('Galvanized base shoe',(x,y,.135),(.18,.18,.05),'steel',.008)
   box('Hollow-section upright',(x,y,1.49),(.08,.08,2.75),'green',.012)
   bolts([x-.06,x+.06],[y-.06,y+.06],.164)
  # End-panel faces retain the existing advert-centre contract at x=+-1.98.
  box('Advertising cabinet',(x,0,1.4),(.044,1.6,2.6),'green',.008)
  for y in [-.84,.84]:box('Panel edge trim',(x,y,1.4),(.074,.03,2.6),'iron',.005)
 box('Roof underside',(0,0,2.90),(4.28,2.26,.08),'green',.015)
 box('Weather cap',(0,0,2.965),(4.4,2.3,.05),'green',.012)
 for x in [-2.14,2.14]:box('End fascia',(x,0,2.885),(.055,2.28,.13),'green',.009)
 for y in [-1.11,1.11]:box('Drip fascia',(0,y,2.875),(4.31,.055,.15),'green',.009)
 for x in [-1.92,1.92]:beam('Roof gusset',(x,-.84,2.44),(x,-.43,2.84),.055,'green')
 # Blender +Y becomes glTF -Z: the seat belongs beside the rear glass at -.92,
 # not across the front approach. Working if front probes hit only the slab.
 for y in [.42,.55,.68]:board('Seat slat',(0,y,.49),(3.5,.112,.064),'oak-light')
 for x in [-1.2,0,1.2]:
  box('Bench bearer',(x,.55,.42),(.07,.4,.07),'green')
  box('Bench pedestal',(x,.55,.27),(.08,.14,.30),'green')
  box('Bench foot',(x,.55,.13),(.18,.33,.035),'iron')
  beam('Backrest upright',(x,.71,.41),(x,.846,.98),.045,'green')
  for z,y in [(.72,.744),(.91,.769)]:cylinder('Backrest bolt',(x,y,z),.013,.014,'steel',8,rot=(math.pi/2,0,0))
 for z,y in [(.72,.775),(.91,.80)]:board('Backrest slat',(0,y,z),(3.5,.055,.155),'oak-light')
 for x in [-1.65,1.65]:
  tube('Rounded bench end arm',[(x,.38,.49),(x,.38,.67),(x,.395,.73),(x,.44,.76),(x,.51,.77),(x,.69,.77),(x,.765,.80)],.024,'green',8)
  bolts([x],[.42,.55,.68],.526)
 for x in [-1.42,-.71,0,.71,1.42]:box('Roof panel joint',(x,0,2.854),(.016,2.16,.014),'iron',.002)
 # Glazing stays in the live assembly; these retain its real -.92m rear plane.
 for x in [-1.90,1.90]:box('Vertical glazing gasket',(x,.92,1.40),(.024,.055,2.48),'black',.003)
 for z in [.165,2.635]:box('Horizontal glazing gasket',(0,.92,z),(3.82,.055,.024),'black',.003)
 for x in [-1.86,0,1.86]:
  for z in [.25,2.54]:
   box('Glazing retaining clip',(x,.882,z),(.085,.036,.105),'green',.004)
   cylinder('Clip screw',(x,.858,z),.009,.008,'steel',6,rot=(math.pi/2,0,0))
 for x in [-1.98,1.98]:
  for z in [.268,2.332]:box('Advert cabinet border',(x,0,z),(.059,1.48,.045),'green',.005)
  for y in [-.728,.728]:box('Advert cabinet border',(x,y,1.30),(.059,.044,2.10),'green',.005)
 # Downpipe behind the rear glass, clear of its x/y plane.
 box('Rear rain gutter',(0,1.064,2.79),(4.18,.115,.10),'green',.012)
 tube('Connected rainwater pipe',[(1.82,1.064,2.79),(1.82,1.064,2.67),(1.82,1.04,2.61),(1.82,1.02,2.56),(1.82,1.02,.24),(1.82,1.035,.19),(1.82,1.09,.15)],.035,'green',10)
 for z in [.55,2.35]:
  torus('Downpipe clamp',(1.82,1.02,z),.038,.008,'iron',12,minor=4)
  box('Downpipe wall cleat',(1.82,.964,z),(.09,.12,.034),'green',.003)

def fence():
 for x in [-.72,.72]:
  cylinder('Hewn post',(x,0,.50),.098,1,'weathered',8,radius2=.087)
  cylinder('Weather cap',(x,0,1.015),.09,.07,'wood-end',8,radius2=.065)
 for z in [.28,.59,.87]:
  box('Mortised rail',(0,0,z),(1.6,.077,.09),'weathered',.008)
  for x in [-.72,.72]:cylinder('Peg',(x,-.085,z),.015,.018,'wood-end',8,rot=(math.pi/2,0,0))

def trough():
 for x in [-.66,.66]:
  for y in [-.2,.2]:box('Corner foot',(x,y,.105),(.09,.09,.21),'oak-dark')
 box('Watertight inner floor',(0,0,.155),(1.34,.42,.035),'oak-dark')
 for y in [-.24,.24]:
  for i in range(3):box('Side plank',(0,y,.232+i*.098),(1.5,.06,.091),'oak' if i%2 else 'oak-light')
 for x in [-.72,.72]:
  for i in range(3):box('End plank',(x,0,.232+i*.098),(.06,.43,.091),'oak')
 for x in [-.58,.58]:
  for y in [-.275,.275]:
   box('Iron stave strap',(x,y,.333),(.045,.012,.37),'iron',.003)
   for z in [.23,.43]:cylinder('Rivet',(x,y*1.023,z),.012,.009,'steel',6,rot=(math.pi/2,0,0))
 box('Water plane',(0,0,.421),(1.37,.419,.012),'water',0)
 for y in [-.24,.24]:box('Rim rail',(0,y,.516),(1.5,.068,.052),'oak-dark')

def postbox():
 lathe('Fluted foot',[(0,0),(.314,0),(.34,.035),(.34,.14),(.315,.18),(.302,.22)],'black',40)
 # The aperture is an absent part of the shell, with a recessed throat behind
 # it. Working if a ray through its centre reaches deeper than either lip.
 lathe('Lower cast pillar',[(.302,.17),(.307,.26),(.307,1.205)],'red',48)
 lathe('Upper cast pillar',[(.307,1.255),(.307,1.25),(.322,1.27)],'red',48)
 for i in range(48):
  a=i*math.tau/48;b=(i+1)*math.tau/48
  if math.sin((a+b)/2)<-.85:continue
  radial_segment('Pillar beside aperture',[(.295,1.205),(.307,1.205),(.307,1.255),(.295,1.255)],a,b,'red',1)
 lathe('Crown moulding',[(.317,1.26),(.342,1.29),(.342,1.32),(.325,1.33),(.327,1.405),(.351,1.43),(.356,1.47),(.33,1.50),(0,1.50)],'red',48)
 torus('Crown casting bead',(0,0,1.342),.328,.008,'red',48,minor=4)
 torus('Plinth casting bead',(0,0,.195),.311,.007,'black',40,minor=4)
 box('Dark letter throat',(0,-.222,1.230),(.325,.018,.054),'black',0)
 box('Throat sill',(0,-.274,1.202),(.325,.11,.008),'red',.002)
 for x in [-.169,.169]:box('Aperture side return',(x,-.300,1.236),(.017,.094,.082),'red',.004)
 # Closed shallow curved hood; its outer lip remains inside the old crown.
 verts=[]
 for x in [-.185,.185]:
  for y,z in [(-.254,1.292),(-.292,1.290),(-.328,1.282),(-.351,1.272),(-.351,1.259),(-.328,1.269),(-.292,1.277),(-.254,1.279)]:verts.append((x,y,z))
 faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 meshpart('Curved rain hood',verts,faces,'red',bevel=.003)
 a=-math.pi/2
 radial_segment('Recessed door reveal',[(.305,.348),(.315,.348),(.315,1.030),(.305,1.030)],a-.60,a+.60,'black',12)
 radial_segment('Curved collection door',[(.308,.359),(.322,.359),(.322,1.019),(.308,1.019)],a-.571,a+.571,'red',12,bevel=.003)
 box('Collection plate surround',(0,-.322,.975),(.235,.026,.152),'black',.006)
 box('Printed collection plate',(0,-.338,.977),(.208,.012,.125),'cream',.002)
 for i in range(4):box('Schedule rule',(0,-.346,.953+i*.018),(.155,.004,.004),'slate',0)
 for x in [-.093,.093]:
  for z in [.925,1.029]:cylinder('Collection-card screw',(x,-.347,z),.008,.007,'steel',6,rot=(math.pi/2,0,0))
 for z in [.46,.88]:
  for dz in [-.028,0,.028]:cylinder('Hinge knuckle',(.174,-.275,z+dz),.016,.026,'red',10)
  for x in [.155,.190]:box('Seated hinge leaf',(x,-.271,z),(.037,.014,.086),'red',.004)
 cylinder('Lock escutcheon',(.102,-.305,.69),.029,.025,'brass',16,rot=(math.pi/2,0,0))
 cylinder('Keyhole circle',(.102,-.320,.695),.006,.004,'black',10,rot=(math.pi/2,0,0))
 box('Key slot',(.102,-.321,.686),(.005,.004,.014),'black',0)
 # Raised cast envelope sits on the curved door, rather than floating above it.
 box('Envelope badge',(0,-.324,.50),(.17,.014,.104),'red',.006)
 for x in [-.073,.073]:beam('Envelope side',(x,-.334,.462),(x,-.334,.538),.006,'red')
 for z in [.462,.538]:beam('Envelope edge',(-.073,-.334,z),(.073,-.334,z),.006,'red')
 for side in [-1,1]:
  beam('Envelope flap',(side*.073,-.335,.538),(0,-.335,.488),.007,'red')
  beam('Envelope fold',(side*.073,-.335,.462),(side*.024,-.335,.503),.005,'red')

def lamp(modern):
 height=4.25 if modern else 4.45
 cylinder('Flanged plinth',(0,0,.045),.18,.09,'iron',12)
 cylinder('Tapered base',(0,0,.27),.135,.40,'iron',12,radius2=.085)
 cylinder('Tapered column',(0,0,2.025),.078,3.3,'iron',12,radius2=.048)
 for z,r in [(.48,.089),(3.62,.076)]:torus('Turned collar',(0,0,z),r,.012,'iron',16)
 for a in range(4):
  angle=math.tau*a/4;cylinder('Anchor head',(.125*math.cos(angle),.125*math.sin(angle),.097),.017,.014,'iron',6)
 if modern:
  cylinder('Optic mounting neck',(0,0,3.72),.10,.14,'iron',12)
  lathe('Luminaire shell',[(.208,3.95),(.23,3.96),(.26,4.22),(.24,4.25),(0,4.25)],'iron',16)
  lathe('Frosted optic',[(.12,3.76),(.153,3.86),(.208,3.95)],'lens',16)
  torus('Optic gasket',(0,0,3.94),.204,.008,'iron',16)
 else:
  cylinder('Lantern stem',(0,0,3.78),.074,.24,'iron',12)
  box('Lantern base',(0,0,3.91),(.43,.39,.07),'iron',.009)
  box('Diffusing lantern',(0,0,4.09),(.32,.28,.31),'lens',.003)
  for x in [-.183,.183]:
   for y in [-.162,.162]:beam('Lantern mullion',(x,y,3.94),(x*1.08,y*1.08,4.28),.024,'iron')
  box('Lantern roof eave',(0,0,4.28),(.59,.49,.045),'iron',.006)
  cylinder('Pyramidal cap',(0,0,4.35),.335,.115,'iron',4,radius2=.1,rot=(0,0,math.pi/4))
  cylinder('Finial',(0,0,4.421),.025,.058,'iron',10,radius2=.012)

def sign():
 box('Oak upright',(0,.029,.775),(.114,.114,1.55),'oak-dark',.008)
 box('Back mounting batten',(0,.024,1.28),(.51,.115,.095),'oak-dark',.006)
 box('Enamel notice face',(0,-.055,1.295),(.7674,.048,.51),'slate',.01)
 for x in [-.367,.367]:box('Folded side edge',(x,-.048,1.295),(.022,.06,.51),'iron',.004)
 for z in [1.052,1.538]:box('Folded horizontal edge',(0,-.048,z),(.747,.06,.024),'iron',.004)
 for x in [-.327,.327]:
  for z in [1.09,1.50]:cylinder('Brass fastener',(x,-.083,z),.011,.008,'brass',8,rot=(math.pi/2,0,0))
 # Gltf front face is +Z. Runtime text at +0.12 clears this recessed face.

def hay():
 # Compressed rounded shoulders and broken straw laminations retain the rolled
 # cylinder and two bindings. Working if both end faces read as straw at eye
 # level without growing the recorded envelope or single-material budget.
 verts=[];faces=[];segments=48
 profile=[(-.75,.616),(-.724,.642),(-.665,.6555),(.665,.6555),(.724,.642),(.75,.616)]
 for y,r in profile:
  for i in range(segments):
   a=i*math.tau/segments;rr=r*(1+.006*math.sin(a*7)+.004*math.sin(a*11+y*3))
   verts.append((rr*math.cos(a),y,.6555+rr*math.sin(a)))
 for j in range(len(profile)-1):
  for i in range(segments):faces.append(((j+1)*segments+i,(j+1)*segments+(i+1)%segments,j*segments+(i+1)%segments,j*segments+i))
 faces += [tuple(range(segments)),tuple((len(profile)-1)*segments+i for i in reversed(range(segments)))]
 core=meshpart('Compressed straw roll',verts,faces,'straw',True)
 # Continuous longitudinal grain rather than restarting the entire atlas on
 # every narrow cylinder quad. Eight repeats wrap the circumference.
 tile=TILES['straw'];u0=(tile%6)/6;v0=(tile//6)/6
 for face in core.data.polygons[:segments*(len(profile)-1)]:
  column=face.index%segments
  for index in face.loop_indices:
   vi=core.data.loops[index].vertex_index;p=core.data.vertices[vi].co
   edge=0 if vi%segments==column else 1
   u=((column%6)+edge)/6;v=(p.y+.75)/1.5
   core.data.uv_layers.active.data[index].uv=(u0+(.045+.91*u)/6,v0+(.045+.91*v)/6)
 for y in [-.47,.47]:torus('Baling twine',(0,y,.6555),.658,.006,'rope',48,rot=(math.pi/2,0,0))
 # Evenly distributed short fibres follow the rolled direction with local
 # angular variation. No single regular spiral or full-width dark ribbon.
 for side in [-1,1]:
  layers={key:([],[]) for key in ['straw','rope']}
  for i in range(900):
   theta=i*2.399963229728653+side*.31;r=.603*math.sqrt((i+.5)/900)
   length=.021+.025*(.5+.5*math.sin(i*2.31));w=.004+.003*(.5+.5*math.cos(i*1.37))
   key='rope' if i%7==0 else 'straw'
   v,f=layers[key];n=len(v);a=theta+.85*math.sin(i*1.51)
   x=r*math.cos(theta);z=.6555+r*math.sin(theta);y=side*(.751+.002*math.sin(i*.47))
   dx=-math.sin(a)*length;dz=math.cos(a)*length
   v.extend([(x-dx,y,z-dz),(x-math.cos(a)*w,y+side*.003,z-math.sin(a)*w),(x+dx,y,z+dz),(x+math.cos(a)*w,y,z+math.sin(a)*w)])
   f.append((n,n+1,n+2,n+3) if side>0 else (n+3,n+2,n+1,n))
  for key,(v,f) in layers.items():meshpart('Broken coiled straw '+key,v,f,key)
 # Sparse raised fibres on the barrel, one joined atlas mesh rather than objects.
 v=[];f=[]
 for i in range(260):
  a=i*2.399963229728653;y=-.66+1.32*((i*.61803398875)%1);r=.660
  x=r*math.cos(a);z=.6555+r*math.sin(a);n=len(v);w=.004
  v.extend([(x,y-.045,z),(x-w*math.sin(a),y,z+w*math.cos(a)),(x,y+.045,z),(x+w*math.sin(a),y,z-w*math.cos(a))])
  f.append((n+3,n+2,n+1,n))
 meshpart('Barrel straw fibres',v,f,'straw')

def leaf(name,loc,length,width,angle,key='leaf'):
 # Closed, cupped lanceolate leaf, intentional low-poly plant language.
 verts=[(0,0,0),(-width*.5,length*.36,.055),(0,length*.47,.10),(width*.5,length*.36,.055),(0,length,.02),(0,length*.47,.078)]
 o=meshpart(name,verts,[(0,1,2),(0,2,3),(1,4,2),(2,4,3),(0,5,1),(0,3,5),(1,5,4),(5,3,4)],key,True);o.location=loc;o.rotation_euler[2]=angle;return o

def cabbage_leaf(name,loc,angle,length,width,height,key,inner=False):
 # Closed cupped blade: curled tip and low central rib are actual geometry.
 verts=[];steps=4
 for layer in [0,1]:
  for i in range(steps+1):
   t=i/steps;r=length*math.sin(t*math.pi*(.84 if inner else .5))
   spread=width*math.sin(math.pi*t)**.72
   for q in [-1,0,1]:
    z=height*(1-math.cos(t*math.pi/2))+.026*(1-abs(q))*math.sin(t*math.pi)+.009*abs(q)*math.sin(t*math.pi*5)-layer*.006
    x=r*math.cos(angle)-q*spread*math.sin(angle);y=r*math.sin(angle)+q*spread*math.cos(angle)
    verts.append((loc[0]+x,loc[1]+y,loc[2]+z))
 n=(steps+1)*3;faces=[]
 for i in range(steps):
  for j in range(2):
   a=i*3+j;faces.extend([(a,a+3,a+4,a+1),(n+a,n+a+1,n+a+4,n+a+3)])
 for j in [0,2]:
  for i in range(steps):
   a=i*3+j;faces.append((a,a+3,n+a+3,n+a) if j==2 else (a,n+a,n+a+3,a+3))
 o=meshpart(name,verts,faces,key,True)
 tile=TILES[key];u0=(tile%6)/6;v0=(tile//6)/6
 for f in o.data.polygons:
  for index in f.loop_indices:
   vi=o.data.loops[index].vertex_index%n
   o.data.uv_layers.active.data[index].uv=(u0+(.045+.91*(vi%3)/2)/6,v0+(.045+.91*(vi//3)/steps)/6)
 return o

def bean_leaf(loc,angle,key):
 # Broad basal lobes, a pointed tip and a hanging blade; both sides are real.
 outline=[(0,0),(-.014,.045),(.025,.102),(.09,.085),(.16,.046),(.205,0),(.16,-.046),(.09,-.085),(.025,-.102),(-.014,-.045)]
 verts=[]
 for layer in [0,1]:
  for r,q in outline+[(.077,0)]:
   verts.append((loc[0]+r*math.cos(angle)-q*math.sin(angle),loc[1]+r*math.sin(angle)+q*math.cos(angle),loc[2]-.50*r+.018*(1-abs(q)/.102)-layer*.006))
 faces=[];n=len(outline);offset=n+1
 for i in range(n):
  j=(i+1)%n;faces.extend([(n,j,i),(offset+n,offset+i,offset+j),(i,j,offset+j,offset+i)])
 o=meshpart('Heart-shaped bean leaf',verts,faces,key,True)
 tile=TILES[key];u0=(tile%6)/6;v0=(tile//6)/6
 for f in o.data.polygons:
  for i in f.loop_indices:
   r,q=(outline+[(.077,0)])[o.data.loops[i].vertex_index%offset]
   o.data.uv_layers.active.data[i].uv=(u0+(.05+.9*(q+.102)/.204)/6,v0+(.05+.9*(r+.014)/.219)/6)
 return o

def garden():
 box('Soil',(0,0,.30),(2.87,2.03,.18),'soil',.015)
 for y in [-1.047,1.047]:
  for z in [.14,.31]:box('Raised-bed long plank',(0,y,z),(3,.083,.16),'oak-dark')
 for x in [-1.459,1.459]:
  for z in [.14,.31]:box('Raised-bed end plank',(x,0,z),(.082,2.02,.16),'oak')
 for x in [-1.41,1.41]:
  for y in [-1,1]:
   box('Corner stake',(x,y,.22),(.105,.105,.44),'oak-dark')
   box('Corner iron front',(x,math.copysign(1.087,y),.24),(.09,.012,.29),'iron',.003)
   for z in [.145,.33]:cylinder('Corner rivet',(x,math.copysign(1.095,y),z),.012,.012,'steel',6,rot=(math.pi/2,0,0))
 # Low discontinuous soil ridges leave furrows visible without covering crops.
 for row,y in enumerate([.41,-.25,-.88]):
  for i in range(8):
   x=-1.23+i*.35;z=.388+.007*math.sin(i*1.7+row)
   meshpart('Broken soil ridge',[(x-.18,y-.03,z-.012),(x+.18,y-.03,z-.012),(x+.18,y+.03,z-.012),(x-.18,y+.03,z-.012),(x-.12,y,z+.025),(x+.13,y+.006,z+.023)],[(1,5,4,0),(2,5,1),(3,4,5,2),(0,4,3),(2,1,0,3)],'soil',True)
 for j,x in enumerate([-.93,0,.93]):
  scale=[.92,1.06,.98][j];base=(x,.66,.386)
  for i in range(7):cabbage_leaf('Cabbage outer leaf',base,i*math.tau/7+j*.31,.34*scale,.17*scale,.17*scale,'leaf' if i%3 else 'leaf-dark')
  for i in range(6):cabbage_leaf('Cabbage folded heart leaf',(x,.66,.415),i*math.tau/6+.23+j*.31,.21*scale,.117*scale,.24*scale,'leaf-light' if i%2 else 'produce',True)
  sphere('Low cabbage heart',(x,.66,.52),(.112*scale,.115*scale,.117*scale),'produce',10,5)
 for j,x in enumerate([-1.05,-.525,0,.525,1.05]):
  y=.05+.025*math.sin(j*2);cylinder('Carrot shoulder',(x,y,.401),.057,.052,'fruit',10,radius2=.046)
  for f in range(4):
   a=f*math.tau/4+j*.47;length=.19+.045*math.sin(f+j);end=(x+math.cos(a)*length,y+math.sin(a)*length,.63+.04*math.sin(j+f))
   start=Vector((x,y,.422));tip=Vector(end)
   tube('Carrot frond stem',[start,start.lerp(tip,.5)+Vector((0,0,.035)),tip],.004,'leaf',5)
   for k in range(1,4):
    c=start.lerp(tip,k/4);c.z+=.02
    for side in [-1,1]:leaf('Carrot leaflet',tuple(c),.055*(1-k*.09),.02,a+side*1.0,'leaf-light' if (k+f)%3==0 else 'leaf')
 for j,x in enumerate([-1.05,0,1.05]):
  y=-.73;beam('Bean cane',(x,y,.36),(x,y,1.225),.022,'rope')
  pts=[]
  for k in range(29):
   t=k/28;a=t*math.tau*2.5+j;pts.append((x+.035*math.cos(a),y+.035*math.sin(a),.40+t*.79))
  tube('Climbing bean runner',pts,.007,'leaf',6)
  for level,z in enumerate([.65,.87,1.07]):
   torus('Cane tie',(x,y,z-.035),.034,.007,'rope',12,minor=4)
   for side in [-1,1]:
    a=.6+j*.4+side*1.1+level*.7
    start=Vector((x,y,z));end=start+Vector((.08*math.cos(a),.08*math.sin(a),.025))
    tube('Bean petiole',[start,end],.005,'leaf',5)
    bean_leaf(tuple(end),a,'leaf-light' if level%2 else 'leaf')
   if level<2:
    for side in [-1,1]:
     px=x+side*.08;py=y-.07
     tube('Pod stalk',[(x,y,z),(px,py,z-.025)],.004,'leaf',5)
     tube('Hanging bean pod',[(px,py,z-.02),(px+side*.018,py-.005,z-.075),(px+side*.025,py-.003,z-.155),(px+side*.012,py,z-.19)],.018,'leaf-warm',6)

def well():
 for row in range(3):
  for i in range(14):
   theta=(i+(row%2)*.5)*math.tau/14
   # Individual shaped voussoir blocks preserve a real opening.
   r0,r1=.65,1.02;z0=.08+row*.245;z1=z0+.229;ang=.205
   vs=[(r*math.cos(a),r*math.sin(a),z) for z in [z0,z1] for r in [r0,r1] for a in [theta-ang,theta+ang]]
   meshpart('Coursed well stone',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],'stone' if i%3 else 'stone-light')
 for i in range(18):
  a=i*math.tau/18+.005;b=(i+1)*math.tau/18-.005
  vs=[(r*math.cos(t),r*math.sin(t),z) for z in [.752,.84] for r in [.65,1.065] for t in [a,b]]
  meshpart('Jointed coping stone',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],'stone-light' if i%3 else 'stone',bevel=.008)
 cylinder('Deep water',(0,0,.18),.642,.02,'water',32)
 for x in [-.86,.86]:
  box('Roof support',(x,0,1.48),(.13,.17,2.4),'oak-dark')
  for side in [-1,1]:beam('Roof knee',(x,0,1.97),(x,side*.43,2.39),.078,'oak')
 beam('Ridge',(-1.02,0,2.855),(1.02,0,2.855),.10,'oak-dark')
 for i in range(7):
  x=-1.07+i*.31;verts=[]
  for dx in [0,.304]:
   for radius in [.073,.047]:
    for j in range(9):
     a=j*math.pi/8;verts.append((x+dx,radius*math.cos(a),2.877+radius*math.sin(a)))
  faces=[]
  for j in range(8):faces.extend([(j,j+1,19+j,18+j),(9+j,27+j,28+j,10+j),(j,9+j,10+j,j+1),(18+j,19+j,28+j,27+j)])
  faces.extend([(0,18,27,9),(8,17,35,26)])
  meshpart('Half-round ridge cap',verts,faces,'clay',True)
 for x in [-1.09,1.09]:
  for side in [-1,1]:beam('Gable verge batten',(x,0,2.863),(x,side*1.12,2.355),.045,'oak-light')
 for side in [-1,1]:
  for row in range(5):
   y=side*(.115+row*.23);z=2.87-abs(y)*.46
   for col in range(7):
    x=-.93+col*.31
    # Only the visible upper arris is rounded; lower tile edges overlap and
    # do not need four-sided bevels. Same closed slab, 20 instead of 44 tris.
    verts=[]
    for zz,inset in [(-.029,0),(.021,0),(.029,.008)]:
     for xx,yy in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append((xx*(.1495-inset),yy*(.136-inset),zz))
    faces=[(3,2,1,0),(8,9,10,11)]
    for ring in [0,4]:
     for j in range(4):faces.append((ring+j,ring+(j+1)%4,ring+4+(j+1)%4,ring+4+j))
    tile=meshpart('Overlapping clay tile',verts,faces,'clay');tile.location=(x,y,z);tile.rotation_euler=(-side*.43,0,0)
  beam('Eave',(-1.1,side*1.12,2.34),(1.1,side*1.12,2.34),.07,'oak-dark')
 cylinder('Windlass',(0,0,1.47),.072,1.80,'oak',16,rot=(0,math.pi/2,0))
 for x in [-.84,.84]:torus('Windlass ferrule',(x,0,1.47),.078,.016,'iron',12,rot=(0,math.pi/2,0))
 # Coil, drop and knot are one connected rope path, attached to the bail.
 points=[]
 for i in range(61):
  t=i/60;a=t*math.tau*6;points.append((-.108+.216*t,.083*math.cos(a),1.47+.083*math.sin(a)))
 points.extend([(.09,.075,1.41),(.04,.025,1.36),(0,0,1.315)])
 tube('Windlass rope coil and drop',points,.012,'rope',6)
 for i in range(2):torus('Bail rope knot',(0,0,1.292+i*.017),.02,.01,'rope',12,rot=(math.pi/2,0,0),minor=5)
 # Real hollow staves, including inner faces and bottom. No top cap.
 for i in range(12):
  a=i*math.tau/12+.004;b=(i+1)*math.tau/12-.004
  vs=[(r*math.cos(t),r*math.sin(t),z) for z,rs in [(.84,[.122,.142]),(1.10,[.168,.188])] for r in rs for t in [a,b]]
  meshpart('Tapered bucket stave',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],'oak' if i%2 else 'oak-light')
 cylinder('Bucket inner bottom',(0,0,.851),.127,.018,'oak-dark',12)
 for z,r in [(.895,.153),(1.056,.181)]:
  lathe('Bucket iron band',[(r-.008,z-.016),(r+.008,z-.016),(r+.008,z+.016),(r-.008,z+.016),(r-.008,z-.016)],'iron',24)
  for i in range(6):
   a=i*math.tau/6;cylinder('Bucket band rivet',(r*math.cos(a),r*math.sin(a),z),.010,.012,'steel',6,rot=(math.pi/2,0,a-math.pi/2))
 points=[(.188*math.cos(i*math.pi/16),0,1.10+.188*math.sin(i*math.pi/16)) for i in range(17)]
 tube('Bucket iron bail',points,.013,'iron',6)
 for x in [-.86,.86]:
  box('Post foot shoe',(x,0,.852),(.164,.202,.027),'iron',0)
  for side in [-1,1]:
   box('Post foot strap',(x,side*.091,.99),(.08,.013,.28),'iron',0)
   box('Bearing mounting strap',(x,side*.091,1.47),(.096,.013,.29),'iron',0)
   for z in [.90,1.08,1.37,1.57]:cylinder('Post strap bolt',(x,side*.104,z),.017,.014,'steel',6,rot=(math.pi/2,0,0))
 beam('Crank arm',(.98,0,1.47),(.98,0,1.22),.035,'iron')
 beam('Crank grip',(.98,0,1.22),(1.09,0,1.22),.055,'oak')

def market():
 # Long axis Z in glTF, front along +X. Preserve original 1.56 x 2.8 footprint.
 for x in [-.54,.54]:
  for y in [-1.17,1.17]:box('Stall post',(x,y,1.007),(.08,.08,2.014),'oak-dark')
 for i in range(7):box('Counter board',(0,-1.2+i*.40,.85),(1.4,.387,.06),'oak',.009)
 for y in [-1.15,1.15]:
  box('Crossbar',(0,y,.79),(1.4,.09,.085),'oak-dark')
  beam('Crossbrace',(-.50,y,.09),(.50,y,.74),.064,'oak-dark')
 # Tailored cloth strips share an arch and sag equally instead of melted folds.
 for i in range(10):
  y0=-1.4+i*.28;y1=y0+.28;verts=[]
  for x in [-.78,-.52,0,.52,.78]:
   z=2.245-abs(x)*.38
   verts.extend([(x,y0,z),(x,y1,z),(x,y0,z-.012),(x,y1,z-.012)])
  faces=[]
  for j in range(4):
   a=j*4;b=a+4;faces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2)])
  meshpart('Striped market canvas',verts,faces,'canvas-red' if i%2==0 else 'canvas-cream')
  for x in [-.78,.78]:box('Canvas valance',(x,(y0+y1)/2,1.902),(.02,.279,.105),'canvas-red' if i%2==0 else 'canvas-cream',.007)
 for y in [-1.15,1.15]:
  for x in [-.54,.54]:beam('Seated canopy rafter',(x,y,1.995),(0,y,2.219),.038,'oak-dark')
 beam('Canopy ridge',(0,-1.32,2.217),(0,1.32,2.217),.039,'oak-dark')
 for y in [-.83,0,.83]:
  box('Produce tray',(0,y,.913),(1.05,.66,.055),'oak-dark')
  for x in [-.5,.5]:box('Tray rim',(x,y,1.015),(.04,.66,.19),'oak-light')
  for ey in [-.32,.32]:box('Tray end',(0,y+ey,1.015),(1.02,.04,.19),'oak-light')
 # Goods are authored per trade in the live assembly. Baking identical produce
 # here hid the bakery and dairy dressings. Working if every tray is empty in
 # this structural GLB and each live stall has exactly one stock dressing.


def fountain():
 # Overlay heights and annular clearances remain exactly as consumed live.
 lathe('Foot and bowl',[(0,0),(1.43,0),(1.5,.08),(1.5,.22),(1.40,.28),(1.43,.90),(1.5725,1.05),(1.5725,1.30),(1.285,1.30),(1.285,.93),(.36,.93)],'stone',48,continuous_uv=True)
 coping=[(1.5725,1.30),(1.5725,1.32),(1.54,1.385),(1.41,1.385),(1.33,1.36),(1.285,1.30)]
 for i in range(16):
  radial_segment('Jointed basin coping',coping,i*math.tau/16+.002,(i+1)*math.tau/16-.002,'stone-light' if i%4 else 'stone',3,.003)
 lathe('Water annulus',[(1.282,1.25),(.36,1.25)],'water',48,continuous_uv=True)
 lathe('Fluted turned pedestal',[(.36,.94),(.4,1.29),(.35,1.38),(.24,1.43),(.20,1.63),(.26,1.88),(.20,2.06),(.37,2.13)],'stone-light',48,flutes=12,depth=.038,continuous_uv=True)
 bowl=lathe('Fluted upper tazza',[(.2,2.05),(.46,2.14),(.62,2.32),(.69,2.48),(.694,2.505),(.70,2.57),(.65,2.62),(.57,2.57),(.548,2.505),(.54,2.47),(.10,2.47)],'stone',64,flutes=16,depth=.042,continuous_uv=True)
 # Real notches connect the upper water to the four scupper channels. Their
 # cut edges are covered by the thick returned mouth sides, never by water.
 bm=bmesh.new();bm.from_mesh(bowl.data)
 remove=[]
 for f in bm.faces:
  c=f.calc_center_median()
  if min(v.co.z for v in f.verts)>=2.5049 and math.hypot(c.x,c.y)>.535 and abs(math.sin(2*math.atan2(c.y,c.x)))<.11:remove.append(f)
 bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(bowl.data);bm.free();bowl.data.update()
 lathe('Upper water',[(.556,2.515),(.1,2.515)],'water',32,continuous_uv=True)
 lathe('Fleur spout',[(.14,2.47),(.17,2.57),(.12,2.70),(.075,3.03),(.15,3.16),(.10,3.28),(0,3.32)],'stone-light',20,continuous_uv=True)
 # Channel mouths align with runtime stream starts after the unchanged Z fit
 # (3.18 / 3.145). The channel floor is level with the upper water.
 for i in range(4):
  a=i*math.pi/2
  for name,r,z,w,d,h in [('Spill channel floor',.674,2.492,.214,.114,.034),('Spill hood',.72,2.575,.12,.15,.045)]:
   box(name,(r*math.cos(a),r*math.sin(a),z),(w,d,h),'stone-light',.003,rot=(0,0,a))
  for side in [-1,1]:
   x=.68*math.cos(a)-side*.064*math.sin(a);y=.68*math.sin(a)+side*.064*math.cos(a)
   box('Spill side return',(x,y,2.535),(.20,.026,.11),'stone-light',.003,rot=(0,0,a))
 for i in range(16):
  a=i*math.tau/16
  beam('Basin course joint',(1.46*math.cos(a),1.46*math.sin(a),.3),(1.515*math.cos(a),1.515*math.sin(a),.88),.016,'stone-dark')

def pond(source):
 # The provider is a preserved reference only. Author courses and coping from
 # true arcs, retaining the 11 x 10.956 m footprint and .80 m water datum.
 # Working if delivery rays find level coping, flat water and outward faces.
 old_palette=list(PALETTE)
 overrides={'water':((36,75,168),.24,'water'),
            'clay':((157,91,65),.88,'stone'),
            'rust':((139,77,57),.9,'stone'),
            'stone-light':((182,174,151),.86,'stone')}
 for i,(key,colour,rough,kind) in enumerate(PALETTE):
  if key in overrides:PALETTE[i]=(key,*overrides[key])
 material(REPORT.parent/'pond-atlas');PALETTE[:]=old_palette
 MAT.name='Authored brick pond mineral and reed atlas';MAT.use_backface_culling=True
 lathe('Pond gravel foundation',[(5.13,0),(5.5,0),(5.5,.45),(5.37,.54),(5.13,.545),(5.13,0)],'gravel',64,continuous_uv=True)
 # Recessed mortar remains behind every open vertical/horizontal brick joint.
 lathe('Recessed lime mortar',[(4.635,.545),(5.115,.545),(5.115,1.03),(4.635,1.03),(4.635,.545)],'stone',64,continuous_uv=True)
 courses,bricks=3,64
 for course in range(courses):
  z=.55+course*.155
  profile=[(4.62,z),(5.13,z),(5.13,z+.131),(5.12,z+.141),(4.62,z+.141)]
  for i in range(bricks):
   a=(i+(course%2)*.5)*math.tau/bricks
   radial_segment('Running bond brick',profile,a+.0016,a+math.tau/bricks-.0016,
                  'rust' if (i*7+course*3)%11<3 else 'clay',steps=1)
 # A softly bevelled stone cap has a true underside and a small water overhang.
 cap=[(4.555,1.055),(4.57,1.04),(5.19,1.04),(5.215,1.095),(5.19,1.12),(4.58,1.12)]
 for i in range(64):
  a=i*math.tau/64
  radial_segment('Level limestone coping',cap,a+.0012,a+math.tau/64-.0012,'stone-light',steps=1)
 cylinder('Flat pond water',(0,0,.77),4.65,.06,'water',64)
 # Small planted shelves sit INSIDE the edge. Keep the central duck/lily area
 # clear and use tapered folded leaves rather than crumpled scanned triangles.
 def leaf(base,angle,height,bend,width,key):
  verts=[];stations=5
  for j in range(stations):
   t=j/(stations-1);w=max(.001,width*math.sin(math.pi*(.12+.88*t)))
   x=base[0]+math.cos(angle)*bend*t*t;y=base[1]+math.sin(angle)*bend*t*t
   z=base[2]+height*t
   verts.extend([(x-math.sin(angle)*w,y+math.cos(angle)*w,z),
                 (x+math.sin(angle)*w,y-math.cos(angle)*w,z),
                 (x,y,z+.018*math.sin(math.pi*t))])
  faces=[(2,1,0),(12,13,14)]
  for j in range(stations-1):
   for k in range(3):faces.append((j*3+k,j*3+(k+1)%3,(j+1)*3+(k+1)%3,(j+1)*3+k))
  meshpart('Folded marginal reed',verts,faces,key,True)
 for cluster,angle in enumerate([.38,1.04,1.88,2.59,3.65,4.9,5.56]):
  x,y=4.27*math.cos(angle),4.27*math.sin(angle)
  sphere('Planted gravel shelf',(x,y,.79),(.30,.24,.08),'soil',12,4)
  for j in range(5):
   a=angle+j*2.4;h=.61+((cluster*5+j*3)%9)*.057
   leaf((x+.07*math.cos(a),y+.07*math.sin(a),.80),a,h,.26+(j%3)*.12,.055+(j%2)*.025,
        ['leaf','leaf-light','leaf-dark'][j%3])
  for j in range(2):
   a=angle+j*1.8;px=x+.08*math.cos(a);py=y+.08*math.sin(a)
   tip=2.195 if cluster==0 and j==0 else 1.7+((cluster+j*2)%5)*.075
   tube('Cattail stem',[(px,py,.8),(px+.035,py,1.24),(px+.085,py+.035,tip-.16)],.014,'leaf-warm',5)
   cylinder('Cattail seed head',(px+.085,py+.035,tip-.115),.045,.18,'oak-dark',8)
   cylinder('Cattail fine tip',(px+.085,py+.035,tip-.0125),.008,.025,'oak-dark',5)
 # Export's coordinate swap maps Blender Y to game Z. Preserve the slightly
 # elliptical footprint explicitly, without rescaling the water's height.
 for o in PARTS:o.location.y*=10.956/11;o.scale.y*=10.956/11
 return {'providerVerticesRetained':0,'brickCourses':courses,'individualBricks':courses*bricks,
         'copingStones':64,'waterDatum':.80,'copingDatum':1.12,'runtimeSink':.45,
         'note':'Independent authored brickwork, limestone coping and planted shelves; original source preserved.'}

BUILDERS={'park-bench':bench,'picnic-table':picnic,'waste-bin':waste,'bus-shelter':shelter,'fence':fence,'watertrough':trough,'postbox':postbox,'path-lamp-victorian':lambda:lamp(False),'path-lamp-modern':lambda:lamp(True),'info-sign':sign,'haybale':hay,'gardenbed':garden,'wishingwell':well,'marketstall':market,'fountain':fountain}
results=[]
for asset,extent in ENVELOPES.items():
 if A.only and asset not in A.only.split(','):continue
 area,slug=asset.split('-',1);source=(BASE/area/(slug+'.glb')) if BASE else (OUT/area/(slug+'-tripo-original.glb'));out=OUT/area/(slug+'-crafted.glb')
 if not source.exists():raise RuntimeError('Missing immutable baseline '+str(source))
 bpy.ops.wm.read_factory_settings(use_empty=True);PARTS=[];details={}
 if slug=='duckpond':details=pond(source)
 else:
  material(REPORT.parent/'civic-atlas');BUILDERS[slug]()
 details['components']={}
 for o in PARTS:
  name=o.name.rsplit('.',1)[0] if o.name.rsplit('.',1)[-1].isdigit() else o.name
  details['components'][name]=details['components'].get(name,0)+1
 bpy.ops.object.select_all(action='DESELECT')
 for o in PARTS:o.select_set(True)
 bpy.context.view_layer.objects.active=PARTS[0];bpy.ops.object.join();obj=bpy.context.object
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 if slug=='duckpond':
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
 if slug!='duckpond':
  lo=Vector([min(v.co[k] for v in obj.data.vertices) for k in range(3)]);hi=Vector([max(v.co[k] for v in obj.data.vertices) for k in range(3)])
  # Normalized authored asset coordinates. No mystery source yaw remains.
  dims=Vector((extent[0],extent[2],extent[1]));ratio=[dims[k]/(hi[k]-lo[k]) for k in range(3)]
  for v in obj.data.vertices:
   for k in range(3):v.co[k]=(v.co[k]-lo[k])*ratio[k]-(dims[k]/2 if k<2 else 0)
  details['fitRatios']=ratio
  if slug=='fountain' and abs(ratio[2]-1)>1e-6:raise RuntimeError('Fountain water height moved')
 obj.name=slug+' crafted';obj.data.name=slug+' crafted geometry'
 obj.data.calc_loop_triangles();tri=len(obj.data.loop_triangles)
 # No new scene-level objects or materials after the single-mesh join.
 out.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
 points=[obj.matrix_world@v.co for v in obj.data.vertices];lo=[min(v[k] for v in points) for k in range(3)];hi=[max(v[k] for v in points) for k in range(3)]
 row={'id':asset,'sourceBaseline':str(source),'baselineSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'preparedSource':out.name,'output':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'triangles':tri,'materials':len(obj.data.materials),'boundsBlender':[lo,hi],'yaw':0,'details':details}
 results.append(row);REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text(json.dumps(results,indent=2)+'\n');print('CRAFTED '+asset+' '+str(tri)+' triangles',flush=True)
