"""Author MillOS's Neuschwanstein-inspired palace, independently of the retired Tripo mesh.

Blender --background --python-exit-code 1 --python scripts/blender/build_neuschwanstein_castle.py
Single material/mesh, deterministic authored atlas, metre coordinates, an open stepped court.
Working if the delivered rays see the court and gateway, the palas stays elongated,
and the 25,200 render-vertex / 621,000-byte resource limits remain unchanged.
"""
import hashlib
import json
import math
import pathlib
import struct
import zlib
import bpy
import bmesh
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/castle-white-blue-20260927'
DEST = ROOT / 'assets/source/models/village/castle-neuschwanstein-authored.glb'
OUT.mkdir(parents=True, exist_ok=True)
ORIGINAL = ROOT / 'assets/source/models/village/castle-tripo-original.glb'
original_hash = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)

# Atlas swatches are display-space RGB. The PNG is tagged sRGB at material load.
PALETTE = [
    ('plaster', (246, 247, 242)), ('limestone', (215, 225, 230)),
    ('roof', (48, 100, 150)), ('glass', (40, 65, 85)),
    ('shutter', (175, 135, 66)), ('timber', (84, 64, 46)),
    ('paving', (195, 198, 190)), ('rock', (134, 140, 140)),
    ('roof-small', (52, 109, 165)), ('dark-metal', (48, 61, 74)),
    ('stone-light', (230, 238, 242)), ('plaster-warm', (238, 243, 242)),
    ('water', (57, 78, 73)), ('gate-white', (239, 245, 246)),
    ('tile-ridge', (76, 128, 170)), ('masonry', (206, 218, 223)),
]
SLOTS = {name: i for i, (name, _) in enumerate(PALETTE)}
rng = np.random.default_rng(270927)
tile = 256
atlas = np.zeros((1024, 1024, 4), dtype=np.uint8)
yy, xx = np.mgrid[0:tile, 0:tile] / tile
for i, (name, color) in enumerate(PALETTE):
    grain = rng.normal(0, 0.007, (tile, tile))
    macro = .017 * np.sin(xx * 17 + yy * 3) * np.cos(yy * 13 - xx * 4)
    rgb = np.broadcast_to(np.array(color, dtype=float), (tile, tile, 3)).copy()
    signal = grain + macro
    if name in ['roof', 'roof-small']:
        cols, rows = (38, 19) if name == 'roof' else (12, 15)
        row = np.floor(yy * rows).astype(int)
        col = np.floor(xx * cols + (row % 2) * .5).astype(int)
        phase = (xx * cols + (row % 2) * .5) % 1
        horizontal = (yy * rows) % 1
        wear = rng.uniform(-.075, .075, (rows + 1, cols + 2))[row, col]
        signal += wear + .07 * np.sin(phase * math.pi)
        signal -= .14 * ((phase < .065) | (horizontal < .095))
        signal += .08 * ((horizontal > .82) & (horizontal < .94))
    elif name in ['plaster', 'gate-white', 'limestone', 'stone-light', 'paving', 'masonry']:
        rows, cols = (44, 20) if name in ['plaster','gate-white'] else ((3, 24) if name == 'masonry' else ((8, 5) if name != 'paving' else (22, 18)))
        row = np.floor(yy * rows)
        mortar = ((yy * rows) % 1 < .025) | ((xx * cols + row % 2 * .5) % 1 < .018)
        signal -= mortar * (.055 if name in ['plaster','gate-white'] else .09)
    elif name == 'shutter':
        red = ((xx * 2.5 + yy * 2.5) % 1) < .46
        rgb[red] = (139, 55, 37)
        signal -= (((xx * 8) % 1) < .055) * .1
    elif name == 'timber':
        signal += .045 * np.sin(xx * 78 + np.sin(yy * 8))
    elif name == 'glass':
        signal += .12 * xx + .07 * np.sin(xx * 18 + yy * 5)
    elif name == 'rock':
        signal += .08 * np.sin(yy * 12 + xx * 5)
    x, y = i % 4 * tile, i // 4 * tile
    atlas[y:y+tile, x:x+tile, :3] = np.clip(rgb * (1 + signal[..., None]), 0, 255)
    atlas[y:y+tile, x:x+tile, 3] = 255

def png(path, data):
    def chunk(name, payload):
        return struct.pack('>I', len(payload)) + name + payload + struct.pack('>I', zlib.crc32(name + payload) & 0xffffffff)
    h, w, _ = data.shape
    raw = b''.join(b'\0' + row.tobytes() for row in data)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

png(OUT / 'authored-atlas.png', atlas[::-1])
mat = bpy.data.materials.new('Neuschwanstein authored plaster stone and tile')
mat.use_nodes = True
shader = mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .88
shader.inputs['Metallic'].default_value = 0
image = bpy.data.images.load(str(OUT / 'authored-atlas.png'))
image.name = 'neuschwanstein-albedo'
image.colorspace_settings.name = 'sRGB'
image.pack()
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
verts, faces, uvs, smooth_faces = [], [], [], []
features = []
# Radius/half-span and rise fractions: flared eaves soften the v0.30 blue caps.
# Working if intermediate rings sit inside a straight cone while apex/eave stay fixed.
ROOF_PROFILE = [(1, 0), (.74, .15), (.39, .5), (0, 1)]

# Helpers take glTF-style x, height, depth; conversion to Blender is only here.
def poly(points, material='plaster', coords=None, smooth=False):
    start = len(verts)
    verts.extend((x, -z, y) for x, y, z in points)
    faces.append(tuple(range(start, start + len(points))))
    smooth_faces.append(smooth)
    idx = SLOTS[material]
    if coords is None:
        coords = [(0, 0), (1, 0), (1, 1), (0, 1)][:len(points)]
    uvs.append([((idx % 4 + .015 + u * .97) / 4, (idx // 4 + .015 + v * .97) / 4) for u, v in coords])

def box(x, y, z, w, h, d, material='plaster'):
    v = [(x+dx*w/2, y+dy*h/2, z+dz*d/2) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        poly([v[i] for i in f], material)

def transform(p, x, z, yaw=0):
    a, h, b = p
    return (x + a*math.cos(yaw) + b*math.sin(yaw), h, z - a*math.sin(yaw) + b*math.cos(yaw))

def prism(profile, depth, material, x=0, z=0, yaw=0, uv_bounds=None):
    # profile is x,height, with its outward face at positive depth.
    sides = [[transform((a, h, b), x, z, yaw) for a,h in profile] for b in [-depth/2, depth/2]]
    lo,hi,bottom,top = uv_bounds or (min(a for a,h in profile),max(a for a,h in profile),min(h for a,h in profile),max(h for a,h in profile))
    coords=[((a-lo)/max(.01,hi-lo),(h-bottom)/max(.01,top-bottom)) for a,h in profile]
    poly(list(reversed(sides[0])), material, list(reversed(coords)))
    poly(sides[1], material, coords)
    for i in range(len(profile)):
        j=(i+1)%len(profile)
        poly([sides[0][i],sides[0][j],sides[1][j],sides[1][i]], material)

def roof(x, z, w, d, eave, ridge, yaw=0, hip=True):
    material = 'roof' if max(w,d)>8 else 'roof-small'
    v=[(-w/2,eave,-d/2),(w/2,eave,-d/2),(w/2,eave,d/2),(-w/2,eave,d/2)]
    pyramid = hip and max(w,d) < 5.5
    if pyramid:
        apex = transform((0,ridge,0),x,z,yaw)
        for (r0,t0),(r1,t1) in zip(ROOF_PROFILE,ROOF_PROFILE[1:]):
            lower=[transform((a*r0,eave+(ridge-eave)*t0,b*r0),x,z,yaw) for a,_,b in v]
            upper=[transform((a*r1,eave+(ridge-eave)*t1,b*r1),x,z,yaw) for a,_,b in v]
            for i in range(4):
                j=(i+1)%4
                poly([lower[i],lower[j],apex] if r1==0 else [lower[i],lower[j],upper[j],upper[i]],material,[(0,t0),(1,t0),(.5,t1)] if r1==0 else [(0,t0),(1,t0),(1,t1),(0,t1)])
        poly(list(reversed([transform(p,x,z,yaw) for p in v])), 'timber')
        features.append({'kind':'curved-pyramid-roof','centre':[x,z],'eave':eave,'ridge':ridge})
        return
    if not hip:
        section=[(-d*.5*r,eave+(ridge-eave)*t) for r,t in ROOF_PROFILE]
        section += [(d*.5*r,eave+(ridge-eave)*t) for r,t in reversed(ROOF_PROFILE[:-1])]
        ends=[[transform((a,h,b),x,z,yaw) for b,h in section] for a in [-w/2,w/2]]
        for i in range(len(section)-1):
            j=i+1
            poly([ends[0][i],ends[1][i],ends[1][j],ends[0][j]],material,[(0,ROOF_PROFILE[min(i,6-i)][1]),(1,ROOF_PROFILE[min(i,6-i)][1]),(1,(section[j][1]-eave)/(ridge-eave)),(0,(section[j][1]-eave)/(ridge-eave))])
        coords=[(b/d+.5,(h-eave)/(ridge-eave)) for b,h in section]
        poly(ends[0],'plaster',coords)
        poly(list(reversed(ends[1])),'plaster',list(reversed(coords)))
        poly([ends[0][0],ends[0][-1],ends[1][-1],ends[1][0]],'timber')
        if yaw==0:box(x,ridge+.04,z,w,.15,.18,'tile-ridge')
        else:box(x,ridge+.04,z,.18,.15,w,'tile-ridge')
        features.append({'kind':'curved-gable-roof','centre':[x,z],'eave':eave,'ridge':ridge})
        return
    inset = min(d*.7, w*.25) if hip else 0
    v += [(-w/2+inset,ridge,0),(w/2-inset,ridge,0)]
    fs=[(0,1,5,4),(3,4,5,2),(0,4,3),(1,2,5)]
    local=v.copy()
    v=[transform(p,x,z,yaw) for p in v]
    for f in fs:
        pts=[v[i] for i in f]
        gable=not hip and len(f)==3
        coords=[((local[i][2]/d+.5) if gable else (local[i][0]/w+.5),(local[i][1]-eave)/(ridge-eave)) for i in f]
        poly(pts,'plaster' if gable else material,coords)
    poly([v[i] for i in [3,2,1,0]], 'timber')
    # Modest continuous ridge and fascia, no finials.
    a=transform((-w/2+inset,ridge+.04,0),x,z,yaw)
    b=transform((w/2-inset,ridge+.04,0),x,z,yaw)
    if yaw==0:box((a[0]+b[0])/2,ridge+.04,z,max(.12,w-2*inset),.15,.18,'tile-ridge')
    else:box(x,ridge+.04,(a[2]+b[2])/2,.18,.15,max(.12,w-2*inset),'tile-ridge')
    features.append({'kind':'roof','centre':[x,z],'eave':eave,'ridge':ridge,'hip':hip})

def arch_wall(x,z,width,depth,base,spring,top,opening,material='plaster',yaw=0):
 r=opening/2
 for side in [-1,1]:
  profile=[(side*r,base),(side*width/2,base),(side*width/2,top),(side*r,top)]
  prism(profile,depth,material,x,z,yaw,(-width/2,width/2,base,top))
 for i in range(10):
  a=math.pi*i/10;b=math.pi*(i+1)/10
  aa=(math.cos(a)*r,spring+math.sin(a)*r);bb=(math.cos(b)*r,spring+math.sin(b)*r)
  prism([aa,bb,(bb[0],top),(aa[0],top)],depth,material,x,z,yaw,(-width/2,width/2,base,top))
 features.append({'kind':'opening','centre':[x,z],'base':base,'spring':spring,'radius':r,'depth':depth,'yaw':yaw})


BASE=3.2
# Castle plan: elongated palas at west, lower eastern knights' wing, an open
# court and a white gateway. The footprint stays at the existing site size.
outline=[(-19.35,-14.7),(-15.8,-18.35),(8.8,-19.17395),(17.9,-15.9),(19.35,-6),(18.6,12.4),(13.7,19.17395),(-11.5,18.3),(-18.9,12.7)]
for k in range(2):
 lower=[(x*(1-k*.12),k*1.9,z*(1-k*.12)) for x,z in outline]
 upper=[(x*(.88-k*.04),1.9+k*1.2,z*(.88-k*.04)) for x,z in outline]
 for i in range(len(outline)):
  j=(i+1)%len(outline)
  poly([lower[i],lower[j],upper[j],upper[i]],'rock')
 if k==1:poly(upper,'rock',[(0,0)]*len(upper))
poly([(x,0,z) for x,z in reversed(outline)],'rock',[(0,0)]*len(outline))
box(0,2.7,0,31.7,1,31.7,'masonry')
box(0,3.13,0,31.85,.14,31.85,'paving')

# Arched windows use their own sloping stone reveal, dark inset and sill.
# They are surface recess illusions, while gates and gallery are true openings.
def window(x,z,y,w=.76,h=1.85,yaw=0):
 r=w/2; spring=y+h/2-r
 profile=[(-r,y-h/2),(r,y-h/2)]+[(math.cos(a)*r,spring+math.sin(a)*r) for a in np.linspace(0,math.pi,5)]
 outer=[(-r-.10,y-h/2-.10),(r+.10,y-h/2-.10)]+[(math.cos(a)*(r+.10),spring+math.sin(a)*(r+.10)) for a in np.linspace(0,math.pi,5)]
 # UVs span the glass swatch instead of a constant texel.
 poly([transform((a,hh,.022),x,z,yaw) for a,hh in profile],'glass',[(a/w+.5,(hh-y)/h+.5) for a,hh in profile])
 for i in range(len(profile)):
  j=(i+1)%len(profile)
  poly([transform((a,hh,b),x,z,yaw) for a,hh,b in [(outer[i][0],outer[i][1],.11),(outer[j][0],outer[j][1],.11),(profile[j][0],profile[j][1],.024),(profile[i][0],profile[i][1],.024)]],'stone-light')
 features.append({'kind':'arched-window','position':[x,y,z],'yaw':yaw})

def pair(x,z,y,yaw=0,w=.64,h=1.7):
 for a in [-w*.68,w*.68]:
  p=transform((a,y,0),x,z,yaw)
  window(p[0],p[2],y,w,h,yaw)

def drum(x,z,r,low,high,material='plaster',n=16):
 lowring=[(x+r*math.cos(i*2*math.pi/n),low,z+r*math.sin(i*2*math.pi/n)) for i in range(n)]
 highring=[(a,high,b) for a,_,b in lowring]
 for i in range(n):
  j=(i+1)%n;poly([lowring[i],lowring[j],highring[j],highring[i]],material,[(i/n,0),((i+1)/n,0),((i+1)/n,1),(i/n,1)],smooth=True)
 poly(list(reversed(lowring)),material,[(0,0)]*n)
 poly(highring,material,[(0,0)]*n)

def cone(x,z,r,eave,apex,n=20):
 ring=[(x+r*math.cos(i*2*math.pi/n),eave,z+r*math.sin(i*2*math.pi/n)) for i in range(n)]
 for (r0,t0),(r1,t1) in zip(ROOF_PROFILE,ROOF_PROFILE[1:]):
  lower=[(x+r*r0*math.cos(i*2*math.pi/n),eave+(apex-eave)*t0,z+r*r0*math.sin(i*2*math.pi/n)) for i in range(n)]
  upper=[(x+r*r1*math.cos(i*2*math.pi/n),eave+(apex-eave)*t1,z+r*r1*math.sin(i*2*math.pi/n)) for i in range(n)]
  for i in range(n):
   j=(i+1)%n
   poly([lower[i],lower[j],(x,apex,z)] if r1==0 else [lower[i],lower[j],upper[j],upper[i]],'roof-small',[(i/n,t0),((i+1)/n,t0),((i+.5)/n,t1)] if r1==0 else [(i/n,t0),((i+1)/n,t0),((i+1)/n,t1),(i/n,t1)],smooth=True)
 poly(list(reversed(ring)),'dark-metal',[(0,0)]*n)
 features.append({'kind':'curved-spire','centre':[x,z],'eave':eave,'apex':apex,'radius':r})

def round_tower(x,z,r,base,eave,apex,levels=None):
 drum(x,z,r,base,eave)
 drum(x,z,r+.16,eave-1.5,eave-1.25,'stone-light')
 drum(x,z,r+.27,eave-.18,eave,'stone-light')
 # The lower portal turrets have a clean circular cornice, rather than teeth.
 for i in range(12 if levels is None else 0):
  a=i*math.pi/6
  # Small attached stone consoles support the overhanging watch stage.
  box(x+(r+.04)*math.sin(a),eave-1.05,z+(r+.04)*math.cos(a),.18,.6,.18,'limestone')
 cone(x,z,r+.29,eave,apex)
 for a in [0,math.pi/2,math.pi,3*math.pi/2]:
  for y in levels if levels is not None else [eave-2.7,eave-7.5]:
   if y>base+1:window(x+r*math.sin(a),z+r*math.cos(a),y,.5,1.2,a)

# The high palas reads as one long residential volume under a steep slate gable.
box(-5,(BASE+25)/2,-4,13,25-BASE,26)
roof(-5,-4,26.8,13.8,25,34.8,math.pi/2,False)
for y in [6.0,10.8,15.5,20.2,24.45]:
 box(-5,y,-4,13.23,.16,26.2,'stone-light')
for y in [8,12.7,17.4,22.1]:
 for z in [-14,-9.2,-4.4,.4,5.2]:
  pair(-11.5,z,y,-math.pi/2)
  pair(1.5,z,y,math.pi/2)
for z,yaw in [(9,0),(-17,math.pi)]:
 for y in [8,12.7,17.4,22.1]:
  for x in [-8.8,-5,-1.2]:
   if z>0:pair(x,z,y,yaw)
   else:window(x,z,y,.8,1.7,yaw)
 # Front/rear gable windows are physically on the vertical triangular face.
 for x in [-7.2,-2.8]:pair(x,z+(.4 if z>0 else -.4),27.5,yaw,w=.65,h=2)
 window(-5,z+(.4 if z>0 else -.4),30.7,.9,1.9,yaw)
# Stone shafts visually divide the large walls without ornamental needle forests.
for x in [-11.52,1.52]:
 for z in [-16.65,8.65]:box(x,14,z,.24,21.6,.48,'stone-light')
# A single dominant round tower and subordinate, attached stair turrets.
round_tower(2.05,-14.0,1.85,BASE,35.5,41.9)
round_tower(-11.5,8.0,1.03,17.0,29.3,33.8)
round_tower(1.5,8.0,.88,18.0,28.9,32.8)
# Sparse slate dormers and actual roof-seated stone chimneys.
for z in [-11.8,-5,1.8]:
 for side in [-1,1]:
  x=-5+side*4.25
  box(x,28.2,z,1.2,1.6,1.35)
  roof(x,z,1.65,1.7,29,30.1,math.pi/2,False)
  window(x+side*.61,z,28.25,.52,.85,side*math.pi/2)
for z in [-10,1]:
 box(-5,34,z,.68,3.4,.9,'plaster-warm')
 box(-5,35.65,z,.92,.2,1.1,'stone-light')
 box(-5,35.77,z,.59,.04,.77,'dark-metal')

# The lower eastern wing leaves a usable asymmetrical court beside the palas.
box(13,8.1,.7,4.8,9.8,22.0,'plaster-warm')
roof(13,.7,22.8,5.6,13,17.3,math.pi/2,False)
for y in [4.0,8.4,12.8]:box(13,y,.7,5.04,.16,22.2,'stone-light')
for z in [-6.8,-2.8,1.2,5.2,9.2]:
 for y in [6.1,10.4]:
  pair(15.4,z,y,math.pi/2,w=.55,h=1.5)
  pair(10.6,z,y,-math.pi/2,w=.55,h=1.5)
# Square watchtower, deliberately separate from the tall conical palas tower.
box(12.65,14.2,-10.6,4.4,22.0,4.4)
box(12.65,24.3,-10.6,5.5,1.5,5.5,'stone-light')
box(12.65,26.1,-10.6,4.8,2.1,4.8)
roof(12.65,-10.6,5.35,5.35,27.15,29.6)
for side in [-1,1]:
 for a in [-1.7,-.85,0,.85,1.7]:
  box(12.65+a,23.25,-10.6+side*2.27,.32,1.2,.42,'stone-light')
  box(12.65+side*2.27,23.25,-10.6+a,.42,1.2,.32,'stone-light')
 for y in [9,15,20.5,26.1]:
  window(12.65,-10.6+side*(2.4 if y>25 else 2.2),y,.65,1.25,0 if side>0 else math.pi)
  window(12.65+side*(2.4 if y>25 else 2.2),-10.6,y,.65,1.25,side*math.pi/2)

# A lower west court wing and a colonnade articulate the human-scale approach.
box(-9.5,7.3,12.35,10,8.2,5.9)
roof(-9.5,12.35,10.7,6.6,11.4,16,0,False)
for x in [-12.5,-9.5,-6.5]:pair(x,15.3,8.2,w=.64,h=1.6)
# Open covered gallery on the courtyard-facing east wing.
box(9.45,8.35,2,2.3,.18,15.8,'stone-light')
for z in [-4,-1,2,5,8]:
 arch_wall(8.65,z,3,.38,8.45,10.25,12.1,2.24,'stone-light',math.pi/2)
roof(9.6,2,16,2.65,12.1,13.2,math.pi/2)

# The white gatehouse retains its real vaulted passage and walking datum.
arch_wall(7.2,13.65,15.0,3.6,BASE,6.0,11.4,3.7,'gate-white')
roof(7.2,13.65,15.6,4.2,11.4,13.3)
box(7.2,10.8,15.48,15,.18,.18,'stone-light')
for x in [2.65,11.75]:box(x,4.1,15.48,5.9,.18,.18,'stone-light')
for x in [1.6,4,10.4,12.8]:window(x,15.45,9.2,.66,1.3)
for i in range(10):
 a=i*math.pi/10;b=(i+1)*math.pi/10
 profile=[(math.cos(a)*1.85,6+math.sin(a)*1.85),(math.cos(b)*1.85,6+math.sin(b)*1.85),(math.cos(b)*2.25,6+math.sin(b)*2.25),(math.cos(a)*2.25,6+math.sin(a)*2.25)]
 prism(profile,.16,'stone-light',7.2,15.49)
for x in [5.15,9.25]:box(x,4.6,15.52,.4,2.8,.22,'stone-light')
# Rounded blue-capped portal turrets recall v0.30 without changing the gate gap.
for x in [-.5,14.9]:
 round_tower(x,14.1,1.18,BASE,13.1,17.2,levels=[10.4])
# The approach is the shared runtime CastleSteps assembly. Keeping it separate
# preserves the palace pivot and scale when its ground-level approach extends
# beyond the rock envelope. No old ramp may occlude the authored treads.
# Parapets close exposed terrace edges, keeping the principal court open to sky.
for x in [-15.65,15.65]:box(x,3.77,0,.42,1.15,31.2,'masonry')
box(-8.8,3.77,15.7,13.4,1.15,.42,'masonry')

mesh=bpy.data.meshes.new('Neuschwanstein palace authored mesh')
mesh.from_pydata(verts,[],faces)
mesh.update()
uv=mesh.uv_layers.new(name='AuthoredAtlas')
for face, coords, smooth in zip(mesh.polygons,uvs,smooth_faces):
 face.use_smooth = smooth
 for loop, coord in zip(face.loop_indices,coords):uv.data[loop].uv=coord
# Each closed architectural part has explicit surfaces; welding only identical
# points makes outward normals deterministic without changing silhouettes.
bm=bmesh.new();bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001)
bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
bm.to_mesh(mesh);bm.free()
mesh.materials.append(mat)
obj=bpy.data.objects.new('CastleBody',mesh)
bpy.context.collection.objects.link(obj)
obj.select_set(True);bpy.context.view_layer.objects.active=obj
mesh.calc_loop_triangles()
triangles=len(mesh.loop_triangles)
assert triangles*3<=25200, triangles*3
bpy.ops.export_scene.gltf(filepath=str(DEST),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False)
assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==original_hash
report={'source':'fully authored geometry and atlas; retired provider mesh retained separately','originalSha256':original_hash,'preparedFile':str(DEST.relative_to(ROOT)),'triangles':triangles,'renderVertices':triangles*3,'materials':1,'features':features}
(OUT/'source-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('NEUSCHWANSTEIN_AUTHORING',triangles,'triangles',triangles*3,'render vertices')
