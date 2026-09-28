"""Craft asset-specific architecture derivatives, preserving immutable provider sources.

Roof replacements are measured in the ORIGINAL Blender Z-up source coordinates.
The existing atlas, one material, original UVs outside the repair, apartment floor
cuts and carport cap survive. Working if the report records changed geometry for
every selected asset, unchanged source digests, and no coordinate-system change.
Run with Blender --background --python-exit-code 1 --python this-file -- [--only comma,separated,ids].
"""
import argparse, hashlib, json, math, pathlib, sys
import bpy, bmesh, numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'output/asset-upgrade-20260926'
OUT.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--only');p.add_argument('--staging',action='store_true');p.add_argument('--report-dir');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
if a.report_dir:
 OUT=ROOT/a.report_dir;OUT.mkdir(parents=True,exist_ok=True)
SOURCE_PATHS = {
 'farm-barn': 'assets/source/models/farm/barn-tripo-original.glb',
 'farm-coop': 'assets/source/models/farm/coop-tripo-original.glb',
 'farm-farmhouse': 'assets/source/models/farm/farmhouse-tripo-original.glb',
 'farm-windmill': 'assets/source/models/farm/windmill-tripo-original.glb',
 'village-cottage': 'assets/source/models/village/cottage-tripo-original.glb',
 'village-shop': 'assets/source/models/village/shop-tripo-original.glb',
 'village-church': 'assets/source/models/village/church-tripo-original.glb',
 'village-townhall': 'assets/source/models/village/townhall-tripo-original.glb',
 'village-pub': 'assets/source/models/village/pub-tripo-original.glb',
 'village-school': 'assets/source/models/village/school-tripo-original.glb',
 'village-forge': 'assets/source/models/village/forge-tripo-original.glb',
 'village-castle': 'assets/source/models/village/castle-tripo-original.glb',
 'world-nissen-hut': 'assets/source/models/world/nissen-hut-tripo-original.glb',
 'world-small-office': 'assets/source/models/world/small-office-blender-cleanup.glb',
 'world-kiosk-cafe': 'assets/source/models/world/kiosk-cafe-blender-cleanup.glb',
 'world-office-apartment': 'assets/source/models/world/office-apartment-blender-cleanup.glb',
 'world-office-apartment-three': 'assets/source/models/world/office-apartment-three-blender-cleanup.glb',
 'world-brick-carport': 'assets/source/models/world/brick-carport-roof-repaired.glb',
}
SOURCES=[{'id':id,'source':str(ROOT/relative)} for id,relative in SOURCE_PATHS.items()]
REPORT=[]

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def bounds(mesh):return [[min(v.co[k] for v in mesh.vertices) for k in range(3)],[max(v.co[k] for v in mesh.vertices) for k in range(3)]]

class Craft:
 def __init__(self,o):
  self.o=o;self.mesh=o.data;self.original_bounds=bounds(o.data);self.mat=self.mesh.materials[0];self.new=[];self.verts=[];self.faces=[];self.uvs=[];self.actions=[];self.removed=0;self.roof_slabs=[]
  self.im=next(n.image for n in self.mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and any(l.to_socket.name=='Base Color' for l in n.outputs['Color'].links))
  self.w,self.h=self.im.size;px=np.empty(self.w*self.h*4,dtype=np.float32);self.im.pixels.foreach_get(px);self.pix=px.reshape(self.h,self.w,4)
 def patch(self,color):
  # Find a low-gradient opaque patch of the existing atlas. RGB arguments are
  # display-space swatches. These byte-backed provider PNG images expose their
  # stored sRGB channel values through pixels; do not decode them twice.
  c=np.array(color)
  x=self.pix[4:-4:4,4:-4:4,:3];score=((x-c)**2).sum(2)
  for dy,dx in [(2,0),(-2,0),(0,2),(0,-2)]:score+=3*((self.pix[4+dy:self.h-4+dy:4,4+dx:self.w-4+dx:4,:3]-x)**2).sum(2)
  y,x=np.unravel_index(score.argmin(),score.shape);return ((4+x*4+.5)/self.w,(4+y*4+.5)/self.h)
 def poly(self,points,uv):
  st=len(self.verts);self.verts.extend(points);self.faces.append(tuple(range(st,st+len(points))))
  # Nonzero UV area, including narrow seams, keeps tangent maps defined.
  self.uvs.append([(uv[0]+u*2/self.w,uv[1]+v*2/self.h) for u,v in [(0,0),(1,0),(1,1),(0,1)][:len(points)]])
 def panel(self,points,uv):
  if (Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])).z<0:points=list(reversed(points))
  self.poly(points,uv)
 def roof_slab(self,points,uv,thickness=.009):
  # An architectural roof needs opaque material on both of its physical sides.
  # Keep one single-sided atlas material; construct an actual closed thin slab.
  # Working if upward/downward front-face ray probes both hit its shell and
  # culling-enabled low-angle previews show no sky through the roof slopes.
  if (Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])).z<0:points=list(reversed(points))
  bottom=[(v[0],v[1],v[2]-thickness) for v in points]
  self.poly(points,uv)
  self.poly(list(reversed(bottom)),uv)
  for i in range(len(points)):
   j=(i+1)%len(points)
   self.poly([points[i],bottom[i],bottom[j],points[j]],uv)
  self.roof_slabs.append({'top':points,'bottom':bottom,'thickness':thickness})
 def box(self,centre,dimensions,uv):
  x,y,z=centre;dx,dy,dz=[v/2 for v in dimensions];v=[(x+i*dx,y+j*dy,z+k*dz) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:self.poly([v[k] for k in f],uv)
 def beam(self,p,q,r,uv,sides=6):
  p,q=Vector(p),Vector(q);d=(q-p).normalized();side=d.cross(Vector((0,0,1)))
  if side.length<.01:side=d.cross(Vector((0,1,0)))
  side.normalize();up=d.cross(side);v=[[tuple(c+r*(math.cos(i*2*math.pi/sides)*side+math.sin(i*2*math.pi/sides)*up)) for i in range(sides)] for c in [p,q]]
  for i in range(sides):j=(i+1)%sides;self.poly([v[0][i],v[0][j],v[1][j],v[1][i]],uv)
 def remove(self,predicate,keep_vertical=False):
  bm=bmesh.new();bm.from_mesh(self.mesh);kill=[f for f in bm.faces if predicate(f.calc_center_median()) and (not keep_vertical or abs(f.normal.z)>.20)];self.removed+=len(kill);bmesh.ops.delete(bm,geom=kill,context='FACES');loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  bm.to_mesh(self.mesh);bm.free()
 def finish(self,preserve_envelope=False):
  if preserve_envelope and self.verts:
   old_lo,old_hi=self.original_bounds;retained=bounds(self.mesh);v=np.array(self.verts,dtype=float)
   for k in range(3):
    nlo,nhi=float(v[:,k].min()),float(v[:,k].max());full_lo=min(retained[0][k],nlo);full_hi=max(retained[1][k],nhi)
    target_lo=old_lo[k] if full_lo>old_lo[k]+1e-7 or nlo<old_lo[k] else nlo
    target_hi=old_hi[k] if full_hi<old_hi[k]-1e-7 or nhi>old_hi[k] else nhi
    if nhi-nlo>1e-8:v[:,k]=target_lo+(v[:,k]-nlo)*(target_hi-target_lo)/(nhi-nlo)
   self.verts=v.tolist();self.actions.append('Restored the exact original source envelope through authored roof geometry only; retained facade vertices unmoved')
  if self.faces:
   m=bpy.data.meshes.new('Crafted architectural details');m.from_pydata(self.verts,[],self.faces);m.materials.append(self.mat);layer=m.uv_layers.new(name='UVMap')
   for f,uvs in zip(m.polygons,self.uvs):
    for li,uv in zip(f.loop_indices,uvs):layer.data[li].uv=uv
   detail=bpy.data.objects.new('Crafted details',m);bpy.context.collection.objects.link(detail)
   bpy.ops.object.select_all(action='DESELECT');self.o.select_set(True);detail.select_set(True);bpy.context.view_layer.objects.active=self.o;bpy.ops.object.join()
  # Recalculate only the new surface normals; originals retain their source
  # custom split normals through the join. Flat authored tile facets are real.
  self.mesh=self.o.data;self.mesh.update()

# axis is the transverse coordinate, with the ridge along the other axis.
# These are measured from the live imported geometry, not target metre sizes.
ROOFS={
 'village-townhall':dict(axis=0,c=0,e=.271,r=.075,z=-.198,along=(-.420,.422),rows=7,cols=13,color=(.34,.35,.35),kind='tile',protect=[(-.119,.119,-.220,.008)],cross_gable=True,keep_vertical=True),
 'farm-coop':dict(axis=1,c=0,e=.344,r=.421,z=.137,along=(-.49,.125),rows=6,cols=8,color=(.22,.42,.25),kind='metal'),
 'farm-farmhouse':dict(axis=1,c=0,e=.470,r=.380,z=-.030,along=(-.478,.435),rows=9,cols=13,color=(.44,.24,.14),kind='tile',protect=[(-.25,-.075,.125,.31)]),
 'village-shop':dict(axis=0,c=-.052,e=.44,r=.463,z=.142,along=(-.450,.450),rows=7,cols=10,color=(.43,.21,.14),kind='tile'),
 'village-cottage':dict(axis=0,c=0,e=.449,r=.285,z=-.060,along=(-.494,.494),rows=7,cols=15,color=(.59,.46,.22),kind='thatch',protect=[(-.08,.115,-.41,-.20)]),
 'village-pub':dict(axis=1,c=0,e=.261,r=.266,z=-.010,along=(-.459,.208),rows=7,cols=14,color=(.62,.52,.30),kind='thatch',protect=[(.145,.285,-.075,.075)]),
 'village-forge':dict(axis=1,c=.005,e=.354,r=.209,z=-.043,along=(-.329,.203),rows=6,cols=8,color=(.38,.29,.21),kind='tile',protect=[(-.14,.045,-.405,-.255)]),
}

def roof(craft,spec):
 axis=spec['axis'];long=1-axis;centre=spec['c'];e=spec['e'];r=spec['r'];z=spec['z'];along=spec['along'];kind=spec['kind'];uv=craft.patch(spec['color']);dark=craft.patch(tuple(t*.83 for t in spec['color']));light=craft.patch(tuple(min(.95,t*1.11) for t in spec['color']))
 def h(x):return r-(r-z)*abs(x-centre)/e
 def protect(v):return any(x0<v.x<x1 and y0<v.y<y1 for x0,x1,y0,y1 in spec.get('protect',[]))
 def remove(v):
  surface=h(v[axis])
  if spec.get('cross_gable') and -.065<v.y<.192:surface=max(surface,.087-.170*abs(v.y-.064)/.124)
  lower=.040 if spec.get('keep_vertical') else .057;upper=.110 if spec.get('keep_vertical') else .095
  return along[0]-.015<v[long]<along[1]+.015 and abs(v[axis]-centre)<e+.015 and surface-lower<v.z<surface+upper and not protect(v)
 craft.remove(remove,keep_vertical=spec.get('keep_vertical',False))
 def pt(t,l,height):v=[0,0,height];v[axis]=t;v[long]=l;return v
 # Continuous skin beneath staggered courses prevents pinholes; fascia is a
 # closed eave edge rather than a paper-thin single plane.
 for side in [-1,1]:
  edge=centre+side*e
  craft.roof_slab([pt(centre,along[0],r-.004),pt(edge,along[0],z-.004),pt(edge,along[1],z-.004),pt(centre,along[1],r-.004)],uv)
  craft.poly([pt(edge,along[0],z-.02),pt(edge,along[1],z-.02),pt(edge,along[1],z+.004),pt(edge,along[0],z+.004)],dark)
  for row in range(spec['rows']):
   a=row/spec['rows'];b=(row+1)/spec['rows'];t0=centre+side*e*a;t1=centre+side*e*b-side*.0008
   n=spec['cols'];step=(along[1]-along[0])/n
   for col in range(n+1):
    l0=max(along[0],along[0]+(col-(row%2)*.5)*step);l1=min(along[1],along[0]+(col+1-(row%2)*.5)*step)
    if l1-l0<.005:continue
    if kind=='metal':offset=.002;gap=.0008
    elif kind=='thatch':offset=.006+(col%3)*.0006;gap=.0008
    else:offset=.006;gap=.0015
    l0+=gap;l1-=gap
    shade=[uv,uv,light,uv,dark][(col*7+row*3)%5]
    if kind=='thatch':
     # Long rounded bundles with a shallow crown and clean layered eaves.
     lm=(l0+l1)/2
     for aa,bb,raise_a,raise_b in [(l0,lm,0,.003),(lm,l1,.003,0)]:craft.panel([pt(t0,aa,h(t0)+raise_a),pt(t1,aa,h(t1)+offset+raise_a),pt(t1,bb,h(t1)+offset+raise_b),pt(t0,bb,h(t0)+raise_b)],shade)
    else:craft.panel([pt(t0,l0,h(t0)),pt(t1,l0,h(t1)+offset),pt(t1,l1,h(t1)+offset),pt(t0,l1,h(t0))],shade)
    craft.poly([pt(t1,l0,h(t1)-.003),pt(t1,l1,h(t1)-.003),pt(t1,l1,h(t1)+offset),pt(t1,l0,h(t1)+offset)],dark)
  for l in along:craft.beam(pt(centre,l,r),pt(edge,l,z),.006,dark)
 if kind=='metal':
  for col in range(spec['cols']+1):
   l=along[0]+(along[1]-along[0])*col/spec['cols']
   for side in [-1,1]:craft.beam(pt(centre,l,r+.003),pt(centre+side*e,l,z+.005),.0017,light)
 craft.beam(pt(centre,along[0],r+.003),pt(centre,along[1],r+.003),.009,dark,8)
 craft.actions.append(f'Rebuilt measured {kind} roof skin with {spec["rows"]} courses, staggered joints, closed eaves, verge trim and ridge; retained walls/doors/chimneys')

def barn(c):
 uv=c.patch((.12,.135,.15));seam=c.patch((.20,.21,.22));profile=[(0,.303),(.213,.232),(.338,.004),(.463,-.115)]
 def height(x):
  x=abs(x)
  for (x0,z0),(x1,z1) in zip(profile,profile[1:]):
   if x<=x1:return z0+(z1-z0)*(x-x0)/(x1-x0)
  return -.115
 c.remove(lambda v: abs(v.x)<.466 and -.470<v.y<.470 and height(v.x)-.022<v.z<height(v.x)+.025 and not(abs(v.x)<.115 and -.235<v.y<.07))
 for side in [-1,1]:
  for (x0,z0),(x1,z1) in zip(profile,profile[1:]):
   c.roof_slab([(side*x0,-.49,z0),(side*x1,-.49,z1),(side*x1,.49,z1),(side*x0,.49,z0)],uv)
   for n in range(13):
    y=-.485+n*.97/12
    if x0==0 and -.235<y<.07:continue
    c.beam((side*x0,y,z0+.002),(side*x1,y,z1+.002),.0019,seam)
  for x,z in profile[1:-1]:c.beam((side*x,-.49,z+.002),(side*x,.49,z+.002),.0027,seam)
 c.actions.append('Rebuilt three-plane gambrel roof with straight folded joints and standing seams; retained cupola, fascia and barn walls')

def ring(c,center,r,z,uv,tube=.003,n=32):
 for i in range(n):
  a=i*2*math.pi/n;b=(i+1)*2*math.pi/n;c.beam((center[0]+r*math.cos(a),center[1]+r*math.sin(a),z),(center[0]+r*math.cos(b),center[1]+r*math.sin(b),z),tube,uv,4)

def accent(c,id,lo,hi):
 dark=c.patch((.15,.17,.18));metal=c.patch((.36,.38,.38));stone=c.patch((.56,.54,.48))
 if id=='farm-windmill':
  # The cap's measured axis is centred at X -.030; sails live at X +.255 and remain.
  uv=c.patch((.35,.22,.14));cx,cy=-.030,.0003
  def on_cap(r,angle):
   x=cx+r*math.cos(angle);y=cy+r*math.sin(angle)
   hit,pos,normal,index=c.o.ray_cast(Vector((x,y,.31)),Vector((0,0,-1)))
   if not hit or not(.01<pos.z<.28):raise RuntimeError(f'Measured cap surface ray missed: {x}, {y}, {hit}, {list(pos)}')
   return (x,y,pos.z+.0015)
  for i in range(12):
   angle=i*2*math.pi/12;points=[on_cap(r,angle) for r in [.045,.09,.135,.175]]
   for u,v in zip(points,points[1:]):c.beam(u,v,.0015,uv,4)
  points=[on_cap(.175,i*2*math.pi/12) for i in range(13)]
  for u,v in zip(points,points[1:]):c.beam(u,v,.0018,uv,4)
  c.actions.append('Added twelve radial cap battens and continuous drip-ring, leaving sail lattice and stone base untouched')
 elif id=='village-church':
  uv=c.patch((.26,.32,.40));ridge=-.004;e=.279;ez=-.274
  for side in [-1,1]:
   for row in range(1,10):
    t=row/10;y=side*e*t;z=ridge+(ez-ridge)*t+.004;c.beam((-.448,y,z),(.442,y,z),.0015,uv,4)
   c.beam((-.452,side*e,ez),(.445,side*e,ez),.003,dark)
  c.actions.append('Added measured slate-course shadow lines and eave drip edges; preserved tower, spire and rose window')
 elif id=='village-school':
  uv=c.patch((.34,.32,.29));ridge=.239;edge=.255;ez=-.025
  for side in [-1,1]:
   for row in range(1,8):
    t=row/8;y=side*edge*t;z=ridge+(ez-ridge)*t+.006
    # Existing dormer occupies the negative-Y central bay. Leave it clear.
    segments=[(-.19,-.075),(.085,.20)] if side<0 and row<6 else [(-.19,.20)]
    for x0,x1 in segments:c.beam((x0,y,z),(x1,y,z),.0018,uv,4)
   c.beam((-.19,side*edge,ez+.003),(.20,side*edge,ez+.003),.003,uv)
  c.actions.append('Added slate roof coursing around the existing dormer and crisp eave drip edges; school bell and garden retained')
 elif id=='village-castle':
  uv=c.patch((.23,.32,.48));gold=c.patch((.58,.48,.25))
  # Dominant central tower has a coherent conical roof, missing a readable
  # base course. Two physically separate circumferential bands define it.
  ring(c,(-.0418,.0149),.103,.250,uv,.0035,n=16)
  ring(c,(-.0418,.0149),.043,.331,uv,.0024,n=16)
  for i in range(12):
   a=i*2*math.pi/12;c.beam((-.0418+.108*math.cos(a),.0149+.108*math.sin(a),.248),(-.0418+.008*math.cos(a),.0149+.008*math.sin(a),.382),.0015,gold,4)
  # The provider's gold finial begins at z=.397, above the pinched roof apex.
  # A seated neck bridges that transition without moving the ornament or
  # changing the castle envelope. Working if side rays at .385-.395 hit metal.
  c.beam((-.0418,.0149,.362),(-.0418,.0149,.416),.011,gold,8)
  c.actions.append('Seated the floating central finial with an eight-sided gold neck, bridging the pinched provider transition while preserving its tip')
  c.actions.append('Articulated central blue tower roof with two slate bands and twelve narrow radial ribs; all turrets, masonry, flags and gate preserved')
 elif id=='world-nissen-hut':
  # Source hut runs on X, current normalizer rotates it. Transverse rolled
  # hoop joints follow the measured shallow arch, not a forced semicircle.
  for x in [-.195,.195]:
   for i in range(12):
    aa=i*math.pi/12;bb=(i+1)*math.pi/12
    c.beam((x,.235*math.cos(aa),-.108+.239*math.sin(aa)),(x,.235*math.cos(bb),-.108+.239*math.sin(bb)),.0017,metal,3)
  c.actions.append('Added two low-poly transverse rolled arch seams to corrugated shell; preserved entrance and longitudinal profile')
 elif id=='world-kiosk-cafe':
  roof=c.patch((.57,.23,.11));e=.490
  for i in range(8):
   ang=i*math.pi/4;c.beam((.028*math.cos(ang),.028*math.sin(ang),.329),(e*math.cos(ang),e*math.sin(ang),.064),.003,roof)
  c.actions.append('Added eight radial raised roof seams, preserving finial, counter, flower boxes and octagonal roof')
 elif id in ['world-small-office','world-office-apartment','world-office-apartment-three']:
  # Add roof drainage and access pads only. Source wall/window vertices stay
  # bit-for-bit untouched, including the removed apartment middle storey.
  z= .233 if id=='world-small-office' else (.423 if id=='world-office-apartment' else .2056)
  xmin,xmax=lo[0]+.025,(hi[0]-.025 if id=='world-small-office' else .280);ymin,ymax=lo[1]+.035,hi[1]-.035
  for y in [ymin,ymax]:
   for i in range(10):
    x=xmin+(xmax-xmin)*i/10;c.box((x+.017,y,z+.004),(.030,.024,.008),metal)
  corners=[(xmin,ymax),(xmax,ymax)] if id=='world-small-office' else [(-.422,-.442),(-.422,.442)]
  for x,y in corners:
   c.beam((x,y,lo[2]+.025),(x,y,z+.005),.006,dark,8)
   for zz in [lo[2]+.12,z-.08]:c.box((x,y,zz),(.018,.016,.01),metal)
  c.actions.append('Added rear-corner rainwater downpipes with brackets and roof service pavers; original wall/window/floor/entrance geometry untouched')
 elif id=='world-brick-carport':
  # Never alter the repaired cap. Low standing seams and perimeter gutters
  # sit within the existing height envelope (cap's previous bounds retained).
  uv=c.patch((.30,.18,.10));z=hi[2]
  for i in range(1,12):
   x=lo[0]+(hi[0]-lo[0])*i/12;c.box((x,0,z+.0008),(.0025,.782,.0016),uv)
  for y in [-.389,.389]:c.box((0,y,z-.01),(.975,.01,.01),uv)
  c.actions.append('Retained repaired bevelled roof cap and all piers; added twelve standing-seam bays and straight eave gutters')
 else:raise RuntimeError(id)

def facade_finish(o,id):
 # Two measured close-up weaknesses only. Do not move source facade, footing,
 # roof or threshold vertices. Working if old triangles remain an exact subset,
 # source bounds/materials match and the new details intersect their supports.
 if id not in ['farm-farmhouse','village-shop']:return [],0
 c=Craft(o)
 if id=='village-shop':
  timber=c.patch((.28,.20,.16));stone=c.patch((.43,.43,.41))
  # Leaf Y=-.3763; old rounded reveal Y=-.3847; wall Y=-.391.
  # These narrow jambs overlap that reveal, leaving the entire leaf visible.
  for x in [-.140,.052]:c.box((x,-.389,-.305),(.016,.025,.330),timber)
  c.box((-.044,-.396,-.473),(.213,.044,.018),stone)
  c.actions.append('Defined the side-service doorway with two narrow timber jambs and a seated stone threshold; retained leaf, lintel and storefront')
 else:
  lead=c.patch((.23,.24,.25))
  outer=[(-.253,.119),(-.078,.119),(-.078,.281),(-.253,.281)]
  inner=[(-.224,.147),(-.105,.147),(-.105,.255),(-.224,.255)]
  inset=[(-.219,.152),(-.110,.152),(-.110,.250),(-.219,.250)]
  def roof_z(y):
   # Outside the chimney skirt: the rebuilt tile skin is sampled at its own
   # final fitted coordinates rather than duplicating the roof-fit formula.
   hit,pos,normal,index=o.ray_cast(Vector((-.280,y,.6)),Vector((0,0,-1)))
   if not hit or not(.08<pos.z<.32):raise RuntimeError('Farmhouse flashing roof attachment ray missed')
   return pos.z
  def points(ring,offset):return [(x,y,roof_z(y)+offset) for x,y in ring]
  foot=[]
  for x,y in outer:
   hit,pos,normal,index=o.ray_cast(Vector((x,y,.6)),Vector((0,0,-1)))
   if not hit or not(.08<pos.z<.32):raise RuntimeError('Farmhouse apron foot attachment missed')
   foot.append((x,y,pos.z+.006))
  shoulder=points(inner,.030)
  top=points(inner,.055);return_top=points(inset,.055)
  for i in range(4):
   j=(i+1)%4
   c.roof_slab([foot[i],foot[j],shoulder[j],shoulder[i]],lead,.012)
   c.roof_slab([top[i],top[j],return_top[j],return_top[i]],lead,.029)
  c.actions.append('Seated a sloped lead chimney apron and narrow counterflashing upstand on the measured farmhouse roof; retained masonry, cap, flue and full roof shell')
 c.finish()
 return c.actions,len(c.faces)

for row in SOURCES:
 id=row['id']
 if a.only and id not in a.only.split(','):continue
 src=pathlib.Path(row['source']);sha=digest(src);out=(OUT/'architecture-staging'/id.split('-',1)[0] if a.staging else src.parent)/(id.split('-',1)[1]+'-crafted.glb');out.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(src));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 if len(meshes)!=1:raise RuntimeError(id+' expected one source mesh')
 o=meshes[0];before=bounds(o.data);triBefore=len(o.data.polygons);c=Craft(o)
 if id in ROOFS:
  roof(c,ROOFS[id])
  if id=='village-shop':
   # Two detached provider triangles clear the old roof-deletion band's upper
   # threshold. They are above the authored skin, not chimney or ridge detail.
   before_fragments=c.removed
   c.remove(lambda v: -.45<v.y<.45 and -.50<v.x<.40 and v.z>.20 and v.z>.463-.321*abs(v.x+.052)/.44+.095)
   if c.removed-before_fragments!=2:raise RuntimeError('Shop source roof-fragment selection changed')
   c.actions.append('Removed exactly two detached original roof triangles above the authored skin, with no authored geometry or envelope change')
  if id=='village-townhall':
   # The cross-gables were inseparable from folded provider roof scraps. Clear
   # their above-main-roof volume and rebuild their two half-timbered faces.
   c.remove(lambda v: abs(v.x)>.105 and -.090<v.y<.215 and .075-.273*abs(v.x)/.271-.020<v.z<.14 and not(abs(v.x)<.12 and -.22<v.y<.008))
   roof(c,dict(axis=1,c=.064,e=.124,r=.087,z=-.083,along=(-.270,.270),rows=4,cols=8,color=(.34,.35,.35),kind='tile',keep_vertical=True))
   plaster=c.patch((.61,.58,.49));timber=c.patch((.20,.17,.13));glass=c.patch((.15,.18,.19))
   for side in [-1,1]:
    def wall(points,uv):c.poly(points if side>0 else list(reversed(points)),uv)
    x=side*.246;y0,y1=-.045,.173;z0=-.168;ze=-.078;peak=.070
    wall([(x,y0,z0),(x,y1,z0),(x,y1,ze),(x,y0,ze)],plaster)
    wall([(x,y0,ze),(x,y1,ze),(x,.064,peak)],plaster)
    xx=x+side*.001
    for u,v in [((xx,y0,ze),(xx,.064,peak)),((xx,.064,peak),(xx,y1,ze)),((xx,y0,ze),(xx,y1,ze)),((xx,.064,z0),(xx,.064,peak))]:c.beam(u,v,.004,timber,4)
    for yy in [.022,.106]:
     wall([(xx+side*.002,yy-.019,-.130),(xx+side*.002,yy+.019,-.130),(xx+side*.002,yy+.019,-.043),(xx+side*.002,yy-.019,-.043)],glass)
   c.actions.append('Rebuilt both raised cross-gable faces and slate intersections after removing inseparable folded roof scraps')
 elif id=='farm-barn':barn(c)
 else:accent(c,id,*before)
 c.finish(preserve_envelope=id in ROOFS);
 if c.roof_slabs:c.actions.append(f'Built {len(c.roof_slabs)} closed thin roof slabs with upward top, downward underside and sealed edges; single-sided material retained')
 facade_actions,facade_polygons=facade_finish(o,id);c.actions.extend(facade_actions)
 after=bounds(o.data);o.data.calc_loop_triangles();tris=len(o.data.loop_triangles)
 if len(o.data.materials)!=1:raise RuntimeError('Material contract changed')
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_extras=True)
 if digest(src)!=sha:raise RuntimeError('Immutable source changed')
 report={'id':id,'source':str(src.relative_to(ROOT)),'sourceSha256':sha,'output':str(out.relative_to(ROOT)),'sha256':digest(out),'bytes':out.stat().st_size,'sourceBlenderBounds':before,'craftedBlenderBounds':after,'sourceTriangles':triBefore,'craftedTriangles':tris,'removedFaces':c.removed,'newPolygons':len(c.faces)+facade_polygons,'facadePolygons':facade_polygons,'materials':len(o.data.materials),'closedRoofSlabs':len(c.roof_slabs),'roofSlabThicknessSourceUnits':.009 if c.roof_slabs else None,'coordinateSystem':'unchanged source Blender Z-up, GLB Y-up; retain existing normalizer yaw/fit','actions':c.actions,'sourceUnchanged':True}
 REPORT.append(report);(OUT/(id+'-craft.json')).write_text(json.dumps(report,indent=2)+'\n');print('CRAFT_READY '+id,flush=True)
combined=[json.loads((OUT/(r['id']+'-craft.json')).read_text()) for r in SOURCES if (OUT/(r['id']+'-craft.json')).exists()]
(OUT/'architecture-result.json').write_text(json.dumps(combined,indent=2)+'\n')
print('CRAFT_COMPLETE '+str(len(REPORT)),flush=True)
