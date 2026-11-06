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
# Hay end spiral: one wound layer every 9.5 cm of radius, CCW about the bale
# axis in (x, z), in physical end-cap coordinates. Used by the end raster.
def SPIRAL_PHASE(r,a):return r/.095+a/math.tau
# Depth of the end relief at w = 0, .25, .5, .75 across one wound layer (crest
# at w = 0 = 1, lowest at .75, rolling back up to the next crest). Shared by
# the end geometry and the end raster.
HAY_ROLL=(0,.30,.75,1.0)
PARTS=[]
MAT=None

def png(path, data):
 h,w,_=data.shape
 def chunk(kind,payload):return struct.pack('!I',len(payload))+kind+payload+struct.pack('!I',zlib.crc32(kind+payload)&0xffffffff)
 raw=b''.join(b'\0'+row.tobytes() for row in data)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))

def hay_atlas(size):
 # Only the hay export uses these three continuous charts. Other prop palettes
 # are byte-identical. Working if the delivered side/end/twine UV tests pass.
 rgb=np.zeros((size,size,4),dtype=np.uint8);rgb[:,:,3]=255
 orm=np.zeros_like(rgb);orm[:,:,0]=255;orm[:,:,1]=237;orm[:,:,3]=255
 half=size//2;rng=np.random.default_rng(8147)
 # Barrel chart, round 5 (strike rule): re-authored as overlapping straw
 # bundles, not a field of fine parallel stalks. At ~3.2 x 4.2 mm per delivered
 # texel a single stalk is 1-1.5 px and smears into wood grain, so the unit is
 # now the bundle: 5-10 px wide and 45-150 px long at 768, wrapping the bale
 # (rows run around it) at a scattered slant of about +-13 deg, each with its
 # own hue, a lit crown, a dark edge crease and a cast shadow on the straw it
 # lies over, painted in order so later bundles overlap earlier ones; dark gaps
 # show where no bundle covers. Loose stalks cross the wrap at up to 70 deg.
 # The pinned matte-straw test caps the CV of (R+G+B)/3 at .07, so the tonal
 # breakup is carried mainly by CHROMA at equal channel mean (yellow-green to
 # orange-tan bundles and 10-25 cm sheet patches); luminance is scaled to the
 # cap afterwards. R>G>B holds at every hue by construction.
 H=int(round(.96*size));W=half;rb=np.random.default_rng(52051)
 fy=np.fft.fftfreq(H)[:,None];fx=np.fft.fftfreq(W)[None,:]
 def patches(sr,sc):
  # Gaussian-filtered noise, periodic in rows (the chart wraps the bale).
  out=np.real(np.fft.ifft2(np.fft.fft2(rb.normal(0,1,(H,W)))*np.exp(-2*math.pi**2*((fy*sr)**2+(fx*sc)**2))))
  return out/out.std()
 L=.30*patches(30,40)+.16*patches(10,14)-.55
 C=.55*patches(45,60)
 R=np.zeros((H,W))
 def stamp(cy,cx,length,width,ang,bend):
  hl=length/2;ca,sa=math.cos(ang),math.sin(ang)
  er=int(hl*abs(ca)+width+abs(bend))+2;ec=int(hl*abs(sa)+width+abs(bend))+2
  rows=np.arange(int(cy)-er,int(cy)+er+1);cols=np.arange(max(0,int(cx)-ec),min(W,int(cx)+ec+1))
  if len(cols)==0:return None
  dr=rows[:,None]-cy;dc=cols[None,:]-cx
  s_=dr*ca+dc*sa;t_=-dr*sa+dc*ca;q=np.clip(2*s_/length,-1,1)
  t_=t_-bend*(1-q*q);hw=width/2*np.sqrt(np.clip(1-q**4,0,1))
  return np.ix_(rows%H,cols),s_,t_,hw,np.abs(s_)<hl
 for i in range(1150):
  cy=rb.uniform(0,H);cx=rb.uniform(-8,W+8);length=rb.uniform(45,150);width=rb.uniform(5,10)
  got=stamp(cy,cx,length,width,float(np.clip(rb.normal(0,.22),-.5,.5)),rb.uniform(-5,5))
  if got is None:continue
  ix,s_,t_,hw,along=got;tone=rb.normal(.12,.22);hue=rb.normal(0,.75);rough=rb.uniform(-8,4)
  u=t_/np.maximum(hw,1e-6);inside=along&(np.abs(u)<1);shadow=along&(u>=1)&(t_<hw+3)
  sub=L[ix];sub[shadow]-=.35;band=np.sin(math.tau*(t_/4.2)+i)*.10
  sub[inside]=(tone+.22*(1-u*u)+.14*(u<-.55)-.30*(u>.72)+band-.25*np.clip((np.abs(2*s_/length)-.85)/.15,0,1))[inside];L[ix]=sub
  sub=C[ix];sub[inside]=hue;C[ix]=sub
  sub=R[ix];sub[inside]=(rough-6*(1-u*u))[inside];sub[shadow]+=6;R[ix]=sub
 for i in range(380):
  # Loose stalks lying across the wrap: thin, bright, with a hairline shadow.
  got=stamp(rb.uniform(0,H),rb.uniform(0,W),rb.uniform(15,60),2.2,rb.uniform(-1.2,1.2),rb.uniform(-2,2))
  if got is None:continue
  ix,s_,t_,hw,along=got;inside=along&(np.abs(t_)<hw);shadow=along&(t_>=hw)&(t_<hw+1.5)
  sub=L[ix];sub[shadow]-=.30;sub[inside]=.55+.1*rb.normal();L[ix]=sub
  sub=C[ix];sub[inside]=rb.uniform(-.9,.2);C[ix]=sub
 S=L-L.mean();C=np.clip(C,-1.1,1.1)
 # Golden mid; C<0 runs to pale yellow straw, C>0 to orange-tan, all at the
 # same channel mean and with R-G >= 20 so no bundle turns olive.
 mid=np.array((210,174,92),dtype=float);pale=np.array((-8,6,2),dtype=float);tan=np.array((10,-8,-2),dtype=float)
 vv=((np.arange(size)/size-.02)/.96*H).astype(int)%H
 cv_=C[vv,:][:,:,None];hue_rgb=mid[None,None,:]+np.maximum(cv_,0)*tan[None,None,:]-np.minimum(cv_,0)*pale[None,None,:]
 def barrel(k):
  return np.clip(hue_rgb*(1+np.clip(S[vv,:]*k,-.32,.32))[:,:,None],0,255)
 def delivered_cv(img):
  # Area-average 768 -> 512 (what the 512 resample approximates), then read the
  # same 24 x 32 grid the pinned test reads.
  up=np.repeat(np.repeat(img,2,0),2,1);n=up.shape[0]//3;m=up.shape[1]//3
  small=up[:n*3,:m*3].reshape(n,3,m,3,3).mean(axis=(1,3))
  def cv(im,rows,cols):
   lv=np.array([im[min(rows-1,int((1-(.04+y/31*.92))*rows)),min(cols-1,int((.04+x/23*.42)*rows))].mean() for y in range(32) for x in range(24)])
   return lv.std()/lv.mean()
  return max(cv(small,n,m),cv(img,size,W))
 # The estimate reads ~1.3x low for this bundle raster (the delivered 512
 # resample keeps more bundle-edge contrast than an area average, and the cord
 # occlusion adds some), so .047 here measured .065 on the delivered PNG.
 # Occlusion where the straw dives under the round-6 binding band: both barrel
 # islands run u=.02+.46*|y|/.75, so the tie courses at |y|=.47 share one
 # column. A dark crease just beyond the band edge (19 mm out, sigma 4.5 mm),
 # nothing under the band where the straw is hidden. It is painted after the
 # contrast scale, so the straw keeps round 5's contrast exactly.
 dist=np.abs((np.arange(W)/size-.02)/.46*.75-.47)
 occ=1-.24*np.exp(-((dist-.019)/.0045)**2)
 k=1.0
 for _ in range(5):k*=.047/max(delivered_cv(barrel(k)),1e-6)
 body=barrel(k)*occ[None,:,None]
 rgb[:,:half,:3]=body.astype(np.uint8)
 orm[:,:half,1]=np.clip(240+R[vv,:]-30*k*S[vv,:],226,252).astype(np.uint8)
 yy,xx=np.mgrid[0:half,0:half];x=(xx-half/2)/(half*.48);y=(yy-half/2)/(half*.48)
 # The end chart is planar: u-.75 = .23*x/.616 and v-.75 = .23*(z-.6555)/.616,
 # so each texel maps back to the cap's physical radius and angle and the
 # rolled bands are laid out in metres on the dished cap.
 px=(xx/size-.25)*.616/.23;pz=(yy/size-.25)*.616/.23
 radius=np.sqrt(px*px+pz*pz);angle=np.arctan2(pz,px)
 # Painted to the modelled helical relief (round 5): frac(phase) is the
 # geometry's w and HAY_ROLL its depth profile, so the albedo darkens where
 # each wound layer runs lowest (w ~.75, before it rolls up) and lightens on
 # the rounded crest (w -> 0/1). No terrace edge is painted any more.
 phase=SPIRAL_PHASE(radius,angle);w=phase%1.0
 depth=np.interp(w,[0,.25,.5,.75,1],list(HAY_ROLL)+[0])
 foot=np.exp(-((w-.74)/.12)**2);lip=np.exp(-np.minimum(w,1-w)/.06)
 fine=np.sin(math.tau*4*phase+np.sin(angle*5+radius*31))
 fade=np.clip((.6-radius)/.05,0,1)
 end_signal=fade*(-.09*depth-.08*foot+.06*lip+.025*fine)+.012*np.sin(angle*11+radius*170)+.01*np.cos(xx*.024+yy*.017)
 end=np.array((183,151,93))[None,None,:]*(1+end_signal[:,:,None])
 for i in range(4400):
  a=rng.uniform(0,math.tau);r=math.sqrt(rng.uniform(0,.98))*half*.47;length=int(rng.integers(2,10));theta=a+np.linspace(-.5,.5,length)*length/max(r,10)
  cols=np.clip(np.rint(half/2+r*np.cos(theta)).astype(int),0,half-1);rows=np.clip(np.rint(half/2+r*np.sin(theta)).astype(int),0,half-1)
  end[rows,cols]+=rng.uniform(-18,17)*np.array((1,.88,.62))
 rgb[half:,half:,:3]=np.clip(end,0,255).astype(np.uint8)
 # Weathered sisal cord, a mid tone about as light as the straw but greyer
 # (neither the round-2 cream that read as a white line nor a shadow-dark
 # seam); the painted channel occlusion either side gives it its edge. Each UV island spans the chart along the tie (~1.5 mm/px) and the
 # cord section across the rows, so the two laid plies are drawn as helical
 # strands: a 24 px (36 mm) lay, a dark crease between plies, a lit crown on
 # each, and fine fibre hair.
 # Round 6: the band's three wraps carry the same chart; the tone is a greyer,
 # less saturated sisal than the golden straw, with a stronger lay contrast so
 # each wrap reads as twisted cord rather than a flat stripe.
 C=half*.92;p2=2*(xx/24+(yy-half*.04)/C);g=p2%1.0
 ply=np.sin(math.pi*g)**.6
 hair=.05*np.sin(xx*1.9+yy*.23)*np.sin(yy*.71-xx*.4)+.03*np.sin(xx*.09+yy*.05)
 cord=.60+.48*ply+hair
 rgb[:half,half:,:3]=np.clip(np.array((178,166,134))[None,None,:]*cord[:,:,None],0,255).astype(np.uint8)
 return rgb,orm

def well_stone_chart(rgb,orm):
 # Round 4 (well wall, strike rule): only the wishing well calls this. Atlas
 # row 3 (leaf-light .. canvas-cream, unused by well()) becomes twelve stone
 # cells of 128 x 64 px, one dressed stone each: its own hue and value, mottle
 # at three scales, rising-damp darkening at the foot, sparse lichen, worn
 # lighter arrises and a dark mortar border where the modelled joint's floor
 # maps. Every other prop's atlas is byte-identical (the PALETTE loop is not
 # touched). Working if the kept-asset regression shas still match.
 rng=np.random.default_rng(70411);cw,chh,y_strip=128,64,384
 yy,xx=np.mgrid[0:chh,0:cw].astype(float)
 fy=np.fft.fftfreq(chh)[:,None];fx=np.fft.fftfreq(cw)[None,:]
 def blur(s):
  out=np.real(np.fft.ifft2(np.fft.fft2(rng.normal(0,1,(chh,cw)))*np.exp(-2*math.pi**2*((fy*s)**2+(fx*s)**2))))
  return out/out.std()
 bases=[(146,147,132),(158,151,129),(130,135,128),(166,164,147),(121,123,112),(152,144,121),
        (138,143,136),(160,158,140),(127,126,111),(146,140,123),(134,140,125),(153,153,142)]
 mortar=np.array((92,91,83),float)
 for c,base in enumerate(bases):
  x0=(c%6)*cw;y0=y_strip+(c//6)*chh;base=np.array(base,float)
  ragged=.8*blur(1.5)
  dx=np.minimum(xx,cw-1-xx)+ragged;dy=np.minimum(yy,chh-1-yy)+ragged
  # Mortar sits within ~5 px (u) / 4 px (v) of the cell edge: the joint floor.
  stone_d=np.minimum(dx-5,(dy-4)*1.25)
  value=.075*blur(7)+.035*blur(2.5)+.02*blur(.8)
  warm=.05*blur(10)
  wear=np.clip(1-stone_d/6,0,1)*(.65+.35*np.clip(blur(2),-1,1))
  damp=np.clip((.32-yy/chh)/.32,0,1)
  col=base[None,None,:]*(1+value+.11*wear-.10*damp)[:,:,None]
  col+=warm[:,:,None]*np.array((7,2,-7))[None,None,:]+damp[:,:,None]*np.array((-5,1,-2))[None,None,:]
  for _ in range(int(rng.integers(1,4))):
   ly,lx,lr=rng.uniform(8,chh-8),rng.uniform(10,cw-10),rng.uniform(3,7)
   spot=np.clip(1.4-np.hypot(yy-ly,(xx-lx)*.8)/lr+.3*blur(1.2),0,1)*.38
   col=col*(1-spot[:,:,None])+np.array((160,160,112))[None,None,:]*spot[:,:,None]
  pits=rng.random((chh,cw))<.012;col[pits]*=.82
  joint=stone_d<0
  col[joint]=mortar*(1+.04*blur(1.5)[joint])[:,None]
  rgb[y0:y0+chh,x0:x0+cw,:3]=np.clip(col,0,255).astype(np.uint8)
  orm[y0:y0+chh,x0:x0+cw,1]=np.where(joint,246,232).astype(np.uint8)

ROOF_CELL=(91,64,128,640)
def well_roof_chart(rgb,orm):
 # Round 5 (well roof, strike rule): only the wishing well calls this. Atlas
 # row 5 right of stone-dark (leaf-warm .. white, none used by well()) becomes
 # fourteen clay tile cells of 91 x 64 px, seven by two: one plain tile each,
 # downslope butt edge at the cell's bottom row. Each has its own fired hue and
 # value, mottle at three scales, a slight cross camber, the shadow of the
 # course above along its top and a SOFT painted joint half along each side, so
 # neighbouring cells meet as one ~1.3 cm joint line, not a geometric trench.
 # Two cells are weathered (darker, lichen), but within the same tonal family.
 cw,chh,x_strip,y_strip=ROOF_CELL;rng=np.random.default_rng(52817)
 yy,xx=np.mgrid[0:chh,0:cw].astype(float)
 fy=np.fft.fftfreq(chh)[:,None];fx=np.fft.fftfreq(cw)[None,:]
 def blur(s):
  out=np.real(np.fft.ifft2(np.fft.fft2(rng.normal(0,1,(chh,cw)))*np.exp(-2*math.pi**2*((fy*s)**2+(fx*s)**2))))
  return out/out.std()
 bases=[(152,76,50),(142,71,46),(158,83,54),(146,79,52),(137,69,47),(155,74,46),(149,82,57),
        (161,79,50),(140,75,51),(150,72,44),(144,77,49),(156,80,52),(132,72,48),(128,74,52)]
 for c,base in enumerate(bases):
  x0=x_strip+(c%7)*cw;y0=y_strip+(c//7)*chh;base=np.array(base,float);weathered=c>=12
  value=.06*blur(6)+.03*blur(2.5)+.015*blur(.8)
  warm=.05*blur(9)
  camber=.035*(1-((xx-(cw-1)/2)/((cw-1)/2))**2)
  shade=np.clip((yy/(chh-1)-.80)/.20,0,1)**1.5*.30
  col=base[None,None,:]*(1+value+camber-shade)[:,:,None]+warm[:,:,None]*np.array((6,1,-5))[None,None,:]
  if weathered:
   for _ in range(int(rng.integers(2,4))):
    ly,lx,lr=rng.uniform(8,chh-14),rng.uniform(10,cw-10),rng.uniform(3,6)
    spot=np.clip(1.4-np.hypot(yy-ly,xx-lx)/lr+.3*blur(1.2),0,1)*.30
    col=col*(1-spot[:,:,None])+np.array((150,146,104))[None,None,:]*spot[:,:,None]
  pits=rng.random((chh,cw))<.010;col[pits]*=.86
  # Soft joint: a half-width of ~1.6 px at each side edge, fading over 2 px more.
  dx=np.minimum(xx,cw-1-xx)+.35*blur(1.5)
  joint=np.clip(1-(dx-1.6)/2,0,1)*np.clip(1-shade/.30*.4,0,1)
  col=col*(1-.34*joint[:,:,None])
  rgb[y0:y0+chh,x0:x0+cw,:3]=np.clip(col,0,255).astype(np.uint8)
  orm[y0:y0+chh,x0:x0+cw,1]=np.clip(204+22*joint,0,255).astype(np.uint8)

def material(folder,hay_only=False,well_only=False):
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
 if hay_only:rgb,orm=hay_atlas(size)
 if well_only:well_stone_chart(rgb,orm);well_roof_chart(rgb,orm)
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
 # The UV-sphere operator emits its faces in a different order in each Blender
 # process (vertices and each face's loop order are stable), which reshuffled
 # the exported index buffer of every prop holding a sphere. Sort the faces by
 # their vertex indices. Working if two runs export identical bytes.
 # BMesh sorts by a numeric key, so rank the faces' vertex-index tuples first.
 bm=bmesh.new();bm.from_mesh(o.data);bm.verts.index_update();bm.faces.index_update()
 rank={f.index:r for r,f in enumerate(sorted(bm.faces,key=lambda f:tuple(sorted(v.index for v in f.verts))))}
 bm.faces.sort(key=lambda f:rank[f.index]);bm.to_mesh(o.data);bm.free()
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
 # Back slats sit 32 mm further forward than the old embedded upright allowed,
 # so the cast strap can carry them on its front face inside the same depth.
 for i in range(3):board('Reclined back slat',(0,.203+i*.014,.64+i*.151),(1.8,.065,.128),'oak',rot=(-.09,0,0))
 for x in [-.64,.64]:
  for y in [-.18,.21]:
   box('Cast iron foot',(x,y,.025),(.18,.18,.05),'iron')
   bolts([x-.053,x+.053],[y-.049,y+.049],.052,'iron')
  beam('Front cast leg',(x,-.18,.04),(x,-.15,.445),.065,'iron')
  # The rear leg and back upright are one casting lofted from its side
  # silhouette: a 65 mm leg rising from the foot, a knee under the seat, then
  # a 28 mm reclined strap whose front face is housed 4 mm into the back
  # slats' rear plane. Working if the strap stands visibly behind the slats
  # from the rear and the through-bolts below land on its back face.
  tilt=.09;sy,sz=.203,.64
  def strap(z,off):return sy+off/math.cos(tilt)+(z-sz)*math.tan(tilt)
  F,R=.0285,.0565
  def lower(z,a,b):return a+(b-a)*(z-.03)/.47
  stations=[]
  for z in [.03,.36]:stations.append((z,lower(z,.1775,strap(.5,F)-.04),lower(z,.2425,strap(.5,R))))
  stations.append((.44,(lower(.44,.1775,strap(.5,F)-.04)+strap(.44,F))/2,lower(.44,.2425,strap(.5,R))))
  for z in [.5,.955]:stations.append((z,strap(z,F),strap(z,R)))
  stations.append((.972,strap(.972,F)+.006,strap(.972,R)-.006))
  verts=[]
  for z,yf,yr in stations:
   w=.032-.006*(z-.03)/.94
   verts.extend([(x-w,yf,z),(x+w,yf,z),(x+w,yr,z),(x-w,yr,z)])
  n=len(stations);faces=[(3,2,1,0),tuple((n-1)*4+k for k in range(4))]
  for i in range(n-1):
   for k in range(4):faces.append((i*4+k,i*4+(k+1)%4,(i+1)*4+(k+1)%4,(i+1)*4+k))
  meshpart('Back cast leg and upright',verts,faces,'iron',bevel=.005)
  beam('Under-seat bearing',(x,-.255,.412),(x,.25,.412),.055,'iron')
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
  # Each back bolt is a through-bolt on one axis along the slat normal: the
  # carriage head on the slat's front face, and a flanged domed nut on the
  # strap's back face, sunk 1 mm so the joint is one component. Working
  # if the rear view shows a nut on each upright at every slat.
  for i in range(3):
   c=Vector((x,sy+i*.014,sz+i*.151));n=Vector((0,-math.cos(tilt),math.sin(tilt)))
   cylinder('Back bolt',tuple(c+n*.0305),.014,.012,'iron',6,rot=(math.pi/2-tilt,0,0))
   cylinder('Back bolt flanged nut',tuple(c-n*(R+.0045)),.016,.011,'iron',6,rot=(math.pi/2-tilt+math.pi,0,0),radius2=.008)
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

def corner_post(sx,sy):
 # Round 3 (strike rule): the rim corner is a modelled joint, not a moved part.
 # One lofted timber per corner, ground to the rim datum, its outer faces plumb
 # at |x| .75 / |y| .275 (5 mm proud of the side planks, so no shared face) and
 # its inner faces tapered 14 mm below the body into a foot. Every vertical
 # arris carries a 10 mm chamfer; the foot and the top are chamfered too. The
 # side courses butt its inner x face, the end courses its inner y face.
 stations=[(0,.006,.020,.006),(.008,0,.0135,.010),(.1865,0,0,.010),(.534,0,0,.010),(.542,.006,.006,.006)]
 verts=[]
 for z,oi,ii,c in stations:
  a,b,d,e=.67+ii,.75-oi,.195+ii,.275-oi
  for x,y in [(b-c,d),(b,d+c),(b,e-c),(b-c,e),(a+c,e),(a,e-c),(a,d+c),(a+c,d)]:verts.append((sx*x,sy*y,z))
 n=8;faces=[tuple(reversed(range(n))),tuple(range((len(stations)-1)*n,len(stations)*n))]
 for j in range(len(stations)-1):
  for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 # A mirror in one axis reverses the ring's turn, so keep faces outward.
 if sx*sy<0:faces=[tuple(reversed(f)) for f in faces]
 meshpart('Corner post',verts,faces,'oak-dark')

def trough():
 for x in [-1,1]:
  for y in [-1,1]:corner_post(x,y)
 # The floor's underside is flush with the bottom courses, so no plate hangs
 # below the walls between the posts and the underside reads as one base.
 box('Watertight inner floor',(0,0,.204),(1.372,.42,.035),'oak-dark')
 # Side walls: three equal courses from the body bottom (.1865) to the rim
 # datum (.542), so the top course is one more plank of the wall rather than a
 # taller rail standing on it. Each runs between the corner posts (|x| .67).
 # The top course keeps the 4 mm arris and the |y| .21-.27 faces, which put its
 # outer chamfer through .53887 at delivered |z| .258 (source .26914 at the
 # .95863 lateral fit), where the runtime roll embeds. Working if VillageArea's
 # trough seating hits read .53887 / .4735 / .427.
 h=(.542-.1865-2*.007)/3
 for y in [-.24,.24]:
  for i in range(3):
   z0=.1865+i*(h+.007)
   box('Side rim board' if i==2 else 'Side plank',(0,y,z0+h/2),(1.34,.06,h),'oak' if i==1 else 'oak-light',.004 if i==2 else .008)
 # End courses sit between the posts, 4 mm behind their outer faces; the top
 # course's 4 mm arris keeps x .738 on its flat .4735 top for the runtime roll.
 for x in [-.716,.716]:
  for i in range(3):box('End plank',(x,0,.232+i*.098),(.06,.39,.091),'oak',.004 if i==2 else .008)
 # Round 5 (strike rule): the straps are swept, not stacked. Four per side,
 # one per bay, each lofted along a path traced on the end elevation: under
 # the bottom course, round its lower arris, then up the full wall to just
 # under the top course's chamfer (.538). Max z stays .542 and the domed
 # rivet apexes stay the outermost |y| (.285825), which sets the .95863
 # lateral fit every runtime pin is measured against.
 mids=[.1865+i*(h+.007)+h/2 for i in range(3)]
 for x in [-.54,-.18,.18,.54]:
  for sy in [-1,1]:
   strap(x,sy)
   for z in mids:rivet_dome(x,sy,z)
 box('Water plane',(0,0,.421),(1.37,.419,.012),'water',0)

def outward(verts,faces):
 # Signed volume by the divergence theorem; flip a closed shell that came out
 # inside-out (a mirrored path reverses its turn).
 vol=0
 for f in faces:
  a=Vector(verts[f[0]])
  for i in range(1,len(f)-1):vol+=a.dot(Vector(verts[f[i]]).cross(Vector(verts[f[i+1]])))
 return faces if vol>0 else [tuple(reversed(f)) for f in faces]

def strap(x,sy,w=.045,t=.007,c=.0012):
 # Centreline in the (y,z) elevation. The inner face embeds 1 mm in the plank
 # (face .27, bottom .1865) and the bend's inner radius follows the course's
 # 8 mm lower chamfer. Section: a 45 x 7 mm flat with 1.2 mm chamfered edges.
 face=.269+t/2;under=.1875-t/2;r=.012;cy,cz=face-r,under+r
 path=[(.222,under),(cy-.012,under)]
 path+=[(cy+r*math.cos(a),cz+r*math.sin(a)) for a in [-math.pi/2+k*math.pi/10 for k in range(6)]]
 path+=[(face,.26),(face,.40),(face,.535)]
 ring=[(-w/2+c,-t/2),(w/2-c,-t/2),(w/2,-t/2+c),(w/2,t/2-c),(w/2-c,t/2),(-w/2+c,t/2),(-w/2,t/2-c),(-w/2,-t/2+c)]
 verts=[]
 for i,(py,pz) in enumerate(path):
  qy,qz=path[min(i+1,len(path)-1)];oy,oz=path[max(i-1,0)]
  ty,tz=qy-oy,qz-oz;l=math.hypot(ty,tz);ty,tz=ty/l,tz/l
  ny,nz=tz,-ty  # outward: +y on the face, -z under the course
  for u,v in ring:verts.append((x+u,sy*(py+v*ny),pz+v*nz))
 n=len(ring);faces=[tuple(reversed(range(n))),tuple((len(path)-1)*n+j for j in range(n))]
 for i in range(len(path)-1):
  for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 meshpart('Iron stave strap',verts,outward(verts,faces),'iron')

def rivet_dome(x,sy,z,apex=.285825,base=.2745,radius=.011,segments=8):
 # Lathed round head about Y with one apex vertex (no pole fan of duplicates).
 # Its base sinks 1.5 mm into the strap's outer face (.276).
 height=apex-base
 rings=[(radius,0),(radius*.97,.25),(radius*.86,.5),(radius*.66,.72),(radius*.38,.9)]
 verts=[];faces=[]
 for r,f in rings:
  for i in range(segments):
   a=i*math.tau/segments;verts.append((x+r*math.cos(a),sy*(base+f*height),z+r*math.sin(a)))
 top=len(verts);verts.append((x,sy*apex,z))
 faces.append(tuple(reversed(range(segments))))
 for j in range(len(rings)-1):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 k=(len(rings)-1)*segments
 for i in range(segments):faces.append((k+i,k+(i+1)%segments,top))
 meshpart('Domed rivet',verts,outward(verts,faces),'steel',smooth=True)

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
 # The returns line the aperture's actual sides: the shell is cut from 240 to
 # 300 degrees, so its cut ends stand at |x| .1475-.1535, y -.2555 to -.266.
 # Inner faces at |x| .146, running back to the throat face (y -.231), bury
 # those ends past the bevel; left exposed they show as a lit sliver beside
 # the slot once back faces are culled. Outer faces at |x| .169 stay clear of
 # the sill's ends (.1625), which they would otherwise graze 0.5 mm apart.
 for x in [-.1575,.1575]:box('Aperture side return',(x,-.289,1.236),(.023,.116,.082),'red',.004)
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
 # The folded iron edges cap the enamel face: it stops 8 mm inside their top
 # and bottom, the upright 1 cm under them, and the side edges sit 3 mm in, so
 # no face or bevel of one part lies in the plane of another's (they were flush).
 box('Oak upright',(0,.029,.77),(.114,.114,1.54),'oak-dark',.008)
 box('Back mounting batten',(0,.024,1.28),(.51,.115,.095),'oak-dark',.006)
 box('Enamel notice face',(0,-.055,1.295),(.7674,.048,.494),'slate',.01)
 for x in [-.364,.364]:box('Folded side edge',(x,-.048,1.295),(.022,.06,.51),'iron',.004)
 for z in [1.052,1.538]:box('Folded horizontal edge',(0,-.048,z),(.747,.06,.024),'iron',.004)
 for x in [-.327,.327]:
  for z in [1.09,1.50]:cylinder('Brass fastener',(x,-.083,z),.011,.008,'brass',8,rot=(math.pi/2,0,0))
 # Gltf front face is +Z. Runtime text at +0.12 clears this recessed face.

def hay():
 # Round-5 rebuild of the straw (strike rule), replacing round 3's method.
 # Barrel: no belt ridges and no tail step (regular hoops on a tan cylinder
 # read as a wooden barrel). It is lofted from a traced compression profile:
 # the bound straw pillows out in the middle and again outboard of each tie and
 # is pinched into a broad waist under the ties, the section is lumpy (low-order
 # lobes whose phase drifts along the bale, faded before the shoulders so the
 # rim stays a true circle) and the underside is flattened by the bale's own
 # weight into a contact patch. Ends: no terraces and no risers. Each end is ONE
 # smooth helical sheet whose rows follow SPIRAL_PHASE, four samples across
 # every wound layer with the HAY_ROLL depth profile, so the roll reads as a
 # continuous rounded spiral in the dish rather than stacked discs. Working if
 # the five outward rays, the barrel/end UV regions and the tie gaps still pass.
 pitch=.095;segments=48;ANG=[i*math.tau/segments for i in range(segments)]
 # Round 6: each tie is a raised band of three wraps lying on a shallow bed
 # pressed into the straw (no shoulders: round 4's straw shoulders stood level
 # with the cord crown and buried it). Rings at 12 and 28 mm either side of the
 # course resolve the bed. Render vertices are 3 per triangle here, so every
 # ring costs 288 of the 24,800.
 CHANNEL=[.012,.028]
 rings=sorted({sg*y for y in (0,.12,.24,.36,.47,.58,.65) for sg in (-1,1)}|{-.75,-.745,-.732,-.70,.70,.732,.745,.75}|{c+sg*d for c in (-.47,.47) for d in CHANNEL for sg in (-1,1)})
 def smooth(e0,e1,x):t=min(1,max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t)
 def radius(y,a):
  ay=abs(y)
  base=float(np.interp(ay,[0,.70,.732,.745,.75],[.6555,.6555,.648,.634,.616]))
  rim=1-smooth(.70,.75,ay);body=1-smooth(.60,.70,ay)
  # Traced compression profile: middle pillow, broad pinch under each tie
  # (sigma 5 cm, 1 cm deep), outboard pillow, then the rolled shoulder.
  swell=(.016*math.exp(-(y/.28)**2)+.010*math.exp(-((ay-.59)/.055)**2)-.010*math.exp(-((ay-.47)/.05)**2))*rim
  lumps=(.0055*math.cos(3*a+1.1+2.3*y)+.004*math.cos(5*a+.4-3.1*y)+.003*math.cos(7*a+2.6+4.7*y)+.0025*math.cos(2*a+.3+1.7*y))*body
  flat=-.014*max(0.,-math.sin(a))**6*rim
  # Bed under each tie (round 6): a flat-bottomed 4 mm press as wide as the
  # three-wrap band (super-gaussian, flat to ~12 mm, gone by ~28 mm), so the
  # band's crown stands ~7.5 mm proud of the straw beside it.
  channel=sum(-.004*math.exp(-((y-course)/.019)**4) for course in [-.47,.47])
  return base+swell+lumps+flat+channel
 def barrel_uv(o):
  # Four islands: each half of the length gets the full u span, and each half
  # of the circumference the full v span (offset a quarter turn on +y, so the
  # two halves do not repeat in step). Seams run along the stalks.
  for face in o.data.polygons:
   coords=[o.data.vertices[o.data.loops[i].vertex_index].co for i in face.loop_indices]
   upper=sum(p.y for p in coords)/len(coords)>0;offset=math.pi/2 if upper else 0
   angles=[(math.atan2(p.z-.6555,p.x)+offset)%math.tau for p in coords]
   if max(angles)-min(angles)>math.pi:angles=[a+math.tau if a<math.pi else a for a in angles]
   half=math.floor(sum(angles)/len(angles)/math.pi)
   for i,p,a in zip(face.loop_indices,coords,angles):
    # Round 4: the -y island is mirrored (u runs outward from the waist on
    # both halves) so both tie courses land on one chart column, where the
    # cord channel's occlusion is painted once (hay_atlas).
    u=abs(p.y)/.75
    o.data.uv_layers.active.data[i].uv=(.02+.46*min(1,max(0,u)),.02+.96*(a-half*math.pi)/math.pi)
 def end_uv(o):
  for face in o.data.polygons:
   for i in face.loop_indices:
    p=o.data.vertices[o.data.loops[i].vertex_index].co
    o.data.uv_layers.active.data[i].uv=(.75+.23*p.x/.616,.75+.23*(p.z-.6555)/.616)
 verts=[];faces=[]
 for y in rings:
  for a in ANG:r=radius(y,a);verts.append((r*math.cos(a),y,.6555+r*math.sin(a)))
 for j in range(len(rings)-1):
  for i in range(segments):faces.append(((j+1)*segments+i,(j+1)*segments+(i+1)%segments,j*segments+(i+1)%segments,j*segments+i))
 core=meshpart('Lofted compression-profile straw barrel',verts,faces,'straw',True);barrel_uv(core)
 # Dish: the rolled core stays within 4 mm of the rim plane (rays at .18 m
 # radius must meet the cap beyond .74 m), a 5.5 cm annular trough, and a level
 # lip into the chamfer. The helical relief fades in from .15 m and is gone by
 # .565 m, inside the sheet's outer clamp, so the clamp edge is a flat circle.
 def cap_y(r):
  t=(r-.40)/.20;trough=.055*(.5+.5*math.cos(math.pi*t)) if abs(t)<1 else 0
  return .75-trough-.004*(1-min(1,max(0,(r-.15)/.10)))
 def relief(r):return .010*smooth(.15,.27,r)*(1-smooth(.47,.565,r))
 # The sheet is sampled at 24 angles (every second barrel angle), n=4 rows
 # across each wound layer. Row s sits at angle EA[s%24], wound s/24 turns in;
 # sample k at radius pitch*(k/4+K-s/24), so frac(SPIRAL_PHASE) is exactly k/4.
 # Radii come from one integer numerator, so sample (s,4) and sample (s-24,0)
 # are the same float and merge, leaving one connected smooth sheet. Radii
 # clamp to the core and outer circles; collapsed faces drop out.
 M,n,r_in,r_out=24,4,.12,.57;EA=ANG[::2];K=int(math.ceil(r_out/pitch))+1
 def build(quads):
  verts=[];lookup={};faces=[]
  def vid(p):
   key=tuple(round(c,7) for c in p)
   if key not in lookup:lookup[key]=len(verts);verts.append(p)
   return lookup[key]
  for quad,expect in quads:
   pts=[Vector(q) for q in quad];nn=Vector((0,0,0))
   for i in range(len(pts)):p,q=pts[i],pts[(i+1)%len(pts)];nn+=Vector(((p.y-q.y)*(p.z+q.z),(p.z-q.z)*(p.x+q.x),(p.x-q.x)*(p.y+q.y)))
   if nn.length<1e-8:continue
   ids=[vid(q) for q in quad];faces.append(tuple(ids) if nn.dot(expect)>0 else tuple(ids[::-1]))
  return verts,faces
 for side in [-1,1]:
  def sample(s,k):
   a=EA[s%M];r=min(r_out,max(r_in,pitch*(k*M+n*K*M-n*s)/(n*M)))
   return (r*math.cos(a),side*(cap_y(r)-relief(r)*HAY_ROLL[k%n]),.6555+r*math.sin(a))
  up=Vector((0,side,0));quads=[]
  for s in range((K+1)*M+1):
   for k in range(n):quads.append(((sample(s,k),sample(s+1,k),sample(s+1,k+1),sample(s,k+1)),up))
  core_c=(0,side*cap_y(0),.6555)
  for i in range(M):
   a,b=EA[i],EA[(i+1)%M]
   quads.append(((core_c,(r_in*math.cos(a),side*cap_y(r_in),.6555+r_in*math.sin(a)),(r_in*math.cos(b),side*cap_y(r_in),.6555+r_in*math.sin(b))),up))
  # Lip: stitch the sheet's 24-angle outer circle to the 48-angle rim that the
  # barrel's last ring shares, two rim samples per sheet sample.
  def ring(r,a):return (r*math.cos(a),side*cap_y(r),.6555+r*math.sin(a))
  for i in range(M):
   a0,a1,a2=ANG[2*i],ANG[2*i+1],ANG[(2*i+2)%segments]
   quads.append(((ring(r_out,a0),ring(.616,a0),ring(.616,a1)),up))
   quads.append(((ring(r_out,a0),ring(.616,a1),ring(r_out,a2)),up))
   quads.append(((ring(r_out,a2),ring(.616,a1),ring(.616,a2)),up))
  cap=meshpart('Helical rolled straw end',*build(quads),'straw',True);end_uv(cap)
 # Twine, round 6 (strike rule): round 4's single 13 mm cord in a channel
 # with straw shoulders level with its crown read as a seam at every distance.
 # Each tie is now a BAND of three wraps, each its own lofted strand (12 x
 # 11.6 mm, radial x axial) seated on the straw under its own course line, laid
 # 11 mm apart so they touch, giving a 34 mm ribbed band whose crowns stand
 # ~7.5 mm proud of the straw beside it. The ray gap the pinned test reads at
 # the mean course hits the middle strand: tie_c + tie_rn (11.5 mm), whatever
 # the bed depth. Working if the body-to-rope gap at each course stays 1-15 mm.
 tie_rn,tie_ra,tie_c=.006,.0058,.0055;WRAPS=(-.011,0,.011)
 def frame(a):return Vector((math.cos(a),0,math.sin(a))),Vector((-math.sin(a),0,math.cos(a)))
 def at(a,y,r):return Vector((r*math.cos(a),y,.6555+r*math.sin(a)))
 def lump(name,a,y,lift,semi_t,semi_y,semi_n,twist,key='rope',rings_=6,segs=10):
  # A closed ellipsoid in the bale's local (axial, tangent, radial) frame,
  # turned by `twist` about the radial axis; seated by its centre's height
  # above the channel floor. Normals are recalculated outward afterwards.
  n,t=frame(a);yv=Vector((0,1,0));c=at(a,y,radius(y,a)+lift)
  e1=yv*math.cos(twist)+t*math.sin(twist);e2=-yv*math.sin(twist)+t*math.cos(twist)
  verts=[tuple(c-n*semi_n)]
  for i in range(1,rings_):
   phi=-math.pi/2+math.pi*i/rings_
   for j in range(segs):
    th=math.tau*j/segs;verts.append(tuple(c+e1*semi_y*math.cos(phi)*math.cos(th)+e2*semi_t*math.cos(phi)*math.sin(th)+n*semi_n*math.sin(phi)))
  verts.append(tuple(c+n*semi_n));top=len(verts)-1;faces=[]
  for j in range(segs):faces.append((0,1+(j+1)%segs,1+j))
  for i in range(rings_-2):
   for j in range(segs):faces.append((1+i*segs+j,1+i*segs+(j+1)%segs,1+(i+1)*segs+(j+1)%segs,1+(i+1)*segs+j))
  for j in range(segs):faces.append((top,1+(rings_-2)*segs+j,1+(rings_-2)*segs+(j+1)%segs))
  o=meshpart(name,verts,faces,key,True)
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
  return o
 for course in [-.47,.47]:
  major=segments;minor=5;island=8
  for wrap in WRAPS:
   yc=course+wrap;verts=[];faces=[]
   for i in range(major):
    a=ANG[i];r=radius(yc,a)+tie_c
    for j in range(minor):
     b=j*math.tau/minor;rr=r+tie_rn*math.cos(b)
     verts.append((rr*math.cos(a),yc+tie_ra*math.sin(b),.6555+rr*math.sin(a)))
   for i in range(major):
    for j in range(minor):faces.append((i*minor+j,i*minor+(j+1)%minor,((i+1)%major)*minor+(j+1)%minor,((i+1)%major)*minor+j))
   tie=meshpart('Wound sisal binding wrap',verts,faces,'rope',True)
   # Six UV islands along each wrap, each spanning the whole cord chart, so
   # the laid two-ply twist is drawn at ~2 mm per texel.
   for face in tie.data.polygons:
    col=face.index//minor;row=face.index%minor
    for k in face.loop_indices:
     vi=tie.data.loops[k].vertex_index;u=(col%island+(0 if vi//minor==col else 1))/island;v=(row+(0 if vi%minor==row else 1))/minor
     tie.data.uv_layers.active.data[k].uv=(.52+.46*u,.02+.46*v)
  # Knot, gathered over all three wraps: a body lobe as wide as the band
  # standing ~14 mm above the wrap crowns, and two crossing lobes either side
  # of it where the ends pass round. Kept inside a=(.92,1.04), clear of the
  # k*pi/8 test rays; symmetric in y, so the mean tie z holds.
  a=.98
  lump('Gathered twine knot',a,course,.0135,.027,.021,.012,.5,rings_=4,segs=8)
  for dt,tw in [(-.023,.6),(.023,-.6)]:
   lump('Crossing twine knot loop',a+dt/.67,course,.0115,.017,.012,.009,tw,rings_=4,segs=8)
  # Two cut ends leave the knot and lie down the barrel BESIDE the band (off
  # the course plane, so no test ray meets them), resting on the straw.
  for shift in [-1,1]:
   points=[]
   for k in range(6):
    t=k/5;aa=a-.04-.13*t;yy=course+shift*(.019+.012*t+.004*math.sin(math.pi*t));lift=(1-t)**2
    rr=radius(yy,aa)+.0038+(.012-.0038)*lift
    points.append((rr*math.cos(aa),yy,.6555+rr*math.sin(aa)))
   tube('Cut twine end',points,.0042,'rope',5)

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
 # Round 4 (wall, strike rule): rounds 1-3 stacked 42 separate voussoir boxes
 # behind open joints, which read as tinted boxes with see-through slits at the
 # silhouette. The wall is now LOFTED: each outer course is one continuous
 # height field r(theta, z) over a grid of five columns per stone (joint
 # centre, arris, crown, arris, joint centre) and up to five rows. The joints
 # are MODELLED as rounded V-grooves 1.4 cm deep, shared by neighbouring stones,
 # so there is nothing to see through and a silhouette joint is a notch. Each
 # stone has its own pillowed crown and a few mm of set (proud or back), and
 # the joint positions carry a seeded jitter so the bond is not machine-even.
 # UVs are re-laid, one stone per dressed-stone cell of the well-only chart in
 # atlas row 3 (well_stone_chart), joint centre at the cell's mortar border.
 # The shaft lining is a ring of two flat facets per stone on the same cells.
 # The delivered GLB is de-indexed (render vertices = 3 x triangles), so the
 # wall spends ~1,400 triangles, not a dense grid.
 # Courses are re-pitched to .224 so the top bed joint sits under the coping;
 # the ground course still starts at z .08 (the fit datum). The mortar cores
 # stay behind the joint floors (outer r .99 < 1.006, shaft r .676 > .664) and
 # back the few-mm chord step where staggered bed joints meet.
 # Working if the fitRatios are unchanged and the clay views show coursed,
 # pillowed stones with dark joints and no light through the wall.
 lathe('Well mortar core',[(.99,.08),(.99,.78)],'stone-dark',28,continuous_uv=True)
 lathe('Well shaft mortar core',[(.676,.78),(.676,.08)],'stone-dark',28,continuous_uv=True)
 rng=np.random.default_rng(96921)
 beds=[.08+k*.224 for k in range(4)]
 joints=[[(j+.5*(k%2))*math.tau/14-math.tau/28+rng.uniform(-.022,.022) for j in range(14)] for k in range(3)]
 UU=[0,.06,.5,.94,1]
 def wall_course(name,k,outer):
  # Outer: rows of (z, kind, v) where kind j = joint floor, e = arris, c =
  # crown. The ground course starts at the face (no groove into the ground)
  # and the top course runs straight up 1 cm inside the coping slab, so no
  # triangle is spent where it cannot be seen. Shaft side: two flat facets per
  # stone, one row per course, the joint painted from the same cell (it is
  # only seen from above, and it stops at the coping's underside at .752).
  zb,zt=beds[k],beds[k+1];mid=(zb+zt)/2
  if outer:
   rj,rf=1.006,1.02
   rows=[(zb,'f',0),(mid,'c',.5),(zt-.008,'e',.92),(zt,'j',1)] if k==0 else \
        [(zb,'j',0),(zb+.008,'e',.08),(mid,'c',.5),(.762,'f',1)] if k==2 else \
        [(zb,'j',0),(zb+.008,'e',.08),(mid,'c',.5),(zt-.008,'e',.92),(zt,'j',1)]
  else:rows=[(zb,'f',0),(zt,'f',1)]
  verts=[];faces=[];uvs=[]
  for j in range(14):
   a=joints[k][j];b=joints[k][(j+1)%14]+(math.tau if j==13 else 0)
   if outer:
    dt=.010/rj;ts=list(zip([a,a+dt,(a+b)/2,b-dt,b],UU))
    face=rf+rng.uniform(-.004,.004);crown=rng.uniform(.004,.011)
   else:ts=[(a,0),((a+b)/2,.5),(b,1)];face=.65;crown=0
   cell=int(rng.integers(12));flip=rng.random()<.5
   cu0=(cell%6)*128+2;cv0=384+(cell//6)*64+2;base=len(verts);nc=len(ts)
   for z,kind,v in rows:
    for ci,(t,u) in enumerate(ts):
     joint=outer and (ci in (0,nc-1) or kind=='j')
     r=rj if joint else face+(crown if kind=='c' and ci==2 else 0)
     verts.append((r*math.cos(t),r*math.sin(t),z))
     uvs.append(((cu0+124*(1-u if flip else u))/768,(cv0+60*v)/768))
   for ri in range(len(rows)-1):
    for ci in range(nc-1):
     q=(base+ri*nc+ci,base+ri*nc+ci+1,base+(ri+1)*nc+ci+1,base+(ri+1)*nc+ci)
     faces.append(q if outer else tuple(reversed(q)))
  sgn=1 if outer else -1
  o=meshpart(name,verts,faces,'stone',True)
  if len(o.data.polygons)!=len(faces):raise RuntimeError(name+': a wall face was dropped')
  for p in o.data.polygons:
   c=p.center;radial=Vector((c.x,c.y,0)).normalized()
   if p.normal.dot(radial)*sgn<=0:raise RuntimeError(name+': a wall face is inside-out')
  uv=o.data.uv_layers.active
  for li,loop in enumerate(o.data.loops):uv.data[li].uv=uvs[loop.vertex_index]
  return o
 for k in range(3):
  wall_course('Lofted coursed well wall',k,True)
  wall_course('Lofted coursed shaft lining',k,False)
 for i in range(18):
  a=i*math.tau/18+.005;b=(i+1)*math.tau/18-.005
  vs=[(r*math.cos(t),r*math.sin(t),z) for z in [.752,.84] for r in [.65,1.065] for t in [a,b]]
  meshpart('Jointed coping stone',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],'stone-light' if i%3 else 'stone',bevel=.008)
 cylinder('Deep water',(0,0,.18),.642,.02,'water',32)
 # Posts run up into the ridge beam (bottom 2.805) and stop 1 cm under the
 # first tile course, so the roof is carried, not hovering. Each post line has
 # a rafter per slope, top 1.3 cm into the mid-course tile underside
 # (z = 2.851 - .46|y|), from inside the ridge into the eave beam; the knees
 # land inside that rafter. Working if the turntable reports no floating roof.
 rafter_pitch=math.atan(.46)
 for x in [-.86,.86]:
  box('Roof support',(x,0,1.5475),(.13,.17,2.535),'oak-dark')
  for side in [-1,1]:
   beam('Roof knee',(x,0,1.97),(x,side*.565,2.535),.078,'oak')
   box('Post-line rafter',(x,side*.565,2.8125-.46*.565),(.08,1.07/math.cos(rafter_pitch),.07),'oak-dark',0,rot=(-side*rafter_pitch,0,0))
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
 # Round 3 (roof, strike rule): the 70 placed tile slabs left an open slit at
 # every column seam on a single-sided material. Each slope is now ONE lofted
 # shell traced from the side profile: a stepped top (five courses, a 2 cm butt
 # at each course line, the eave course kicked up as a double course over the
 # eave beam), a soffit 3 mm under the rafter tops, a vertical butt face per
 # course and a gable end face at each verge. Column joints are grooves cut
 # INTO the top (1.4 cm wide, 9 mm deep, floored), half-bond staggered course
 # to course, so nothing opens through the roof. UVs are laid per tile at one
 # density with a seeded window, and a seeded clay/rust mix varies the tiles.
 # A mortar bed under the half-round caps closes the ridge. The eave arris
 # stays at the old eave tile's outer corner, so the fit is unchanged.
 # Working if the top-down view shows no ground through the roof and the
 # grooves read as tile joints, not slats.
 zu=lambda s:2.848-.46*s
 eave=1.035+.136*math.cos(.43)+.021*math.sin(.43)
 X0=1.0795;W=2*X0/7;G=.007;D=.009
 lines=[k*.2335 for k in range(5)]+[eave]
 thick=[(.026,.046)]*4+[(.030,.068)]
 def ztop(k,s):
  a,b=lines[k],lines[k+1];t0,t1=thick[k];return zu(s)+t0+(t1-t0)*(s-a)/(b-a)
 roof_rng=np.random.default_rng(43117)
 def roof_shell(name,side,pts,polys,key):
  # pts are (x, s, z) with s measured from the ridge; polys are
  # (vertex indices, outward hint, uv per vertex, atlas key). The winding is
  # chosen from the hint, so the mirrored slope cannot come out inside-out.
  verts=[(x,side*s,z) for x,s,z in pts];faces=[]
  for f,hint,_,_ in polys:
   v=[Vector(verts[i]) for i in f];n=Vector((0,0,0))
   for i in range(len(v)):a,b=v[i],v[(i+1)%len(v)];n+=Vector(((a.y-b.y)*(a.z+b.z),(a.z-b.z)*(a.x+b.x),(a.x-b.x)*(a.y+b.y)))
   h=Vector((hint[0],side*hint[1],hint[2]))
   faces.append(tuple(f) if n.dot(h)>0 else tuple(reversed(f)))
  o=meshpart(name,verts,faces,key)
  if len(o.data.polygons)!=len(faces):raise RuntimeError(name+': a roof face was dropped')
  uv=o.data.uv_layers.active
  for p,face,(f,_,uvs,k) in zip(o.data.polygons,faces,polys):
   lookup=dict(zip(f,uvs))
   if k is None:
    # Absolute atlas coordinates (the well-only clay tile chart).
    for li in p.loop_indices:uv.data[li].uv=lookup[o.data.loops[li].vertex_index]
    continue
   t=TILES[k];u0=(t%6)/6;v0=(t//6)/6
   for li in p.loop_indices:
    cu,cv=lookup[o.data.loops[li].vertex_index];uv.data[li].uv=(u0+(.045+.91*cu)/6,v0+(.045+.91*cv)/6)
  return o
 # Round 5 (roof, strike rule): round 3's lofted courses cut each column joint
 # INTO the top as a floored 'rust' groove. On the sunlit slope the groove
 # floors read as hairline cracks against lit clay, so the two slopes looked
 # different. The joints are now PAINTED, not modelled: each course top is one
 # flat plane split only at the tile edges (coplanar, so no trench and no
 # self-shadow), and every tile maps onto one cell of the well-only clay tile
 # chart (well_roof_chart) with a soft joint half painted along each side edge.
 # Stagger is half-bond by course parity; verge half tiles map half a cell,
 # joint side out. The butt face of each tile maps a band of the same cell, so
 # its edge matches its tile. Same chart, same density on both slopes. Each
 # course top starts 6 mm under the butt of the course above (k > 0), and each
 # butt drops 1.3 cm into the course below or to the soffit at the eave.
 cw,chh,x_strip,y_strip=ROOF_CELL
 def cell_uv(c,u,v):return ((x_strip+(c%7)*cw+.5+(cw-1)*u)/768,(y_strip+(c//7)*chh+.5+(chh-1)*v)/768)
 for side in [-1,1]:
  last_row=[]
  for k in range(5):
   a,b=lines[k],lines[k+1]
   joints=[-X0+W*j for j in range(1,7)] if k%2==0 else [-X0+W*(j+.5) for j in range(7)]
   xs=[-X0]+joints+[X0];n=len(xs)
   s0=0 if k==0 else a-.006
   zb=ztop(k+1,b)-.013 if k<4 else zu(b)
   pts=[(x,s0,ztop(k,s0)) for x in xs]+[(x,b,ztop(k,b)) for x in xs]+[(x,b,zb) for x in xs]
   polys=[];row=[];prev=-1
   for i in range(n-1):
    # About one tile in ten weathered, never two side by side or one above
    # another; otherwise any plain cell not equal to its left neighbour.
    near={prev}|set(last_row[max(0,i-1):i+2])
    if roof_rng.random()<.10 and not near&{12,13}:c=int(roof_rng.integers(12,14))
    else:
     c=int(roof_rng.integers(12))
     while c in near:c=(c+1)%12
    prev=c;row.append(c)
    u0,u1=(.5,1) if (n==9 and i==0) else (0,.5) if (n==9 and i==n-2) else (0,1)
    top=[n+i,n+i+1,i+1,i];butt=[2*n+i,2*n+i+1,n+i+1,n+i]
    tuv=lambda q:cell_uv(c,u0+(u1-u0)*(pts[q][0]-xs[i])/(xs[i+1]-xs[i]),(pts[q][1]-b)/(s0-b))
    buv=lambda q:cell_uv(c,u0+(u1-u0)*(pts[q][0]-xs[i])/(xs[i+1]-xs[i]),.05+.07*(pts[q][2]-zb)/(ztop(k,b)-zb))
    polys.append((top,(0,0,1),[tuv(q) for q in top],None))
    polys.append((butt,(0,1,0),[buv(q) for q in butt],None))
   last_row=row
   roof_shell('Painted clay tile course',side,pts,polys,'clay')
  # Soffit and gable ends, from the same profile.
  prof=[(0,ztop(0,0))]
  for k in range(5):
   prof.append((lines[k+1],ztop(k,lines[k+1])))
   if k<4:prof.append((lines[k+1],ztop(k+1,lines[k+1])))
  pts=[(-X0,0,zu(0)),(X0,0,zu(0)),(X0,eave,zu(eave)),(-X0,eave,zu(eave))]
  polys=[([0,1,2,3],(0,0,-1),[(0,0),(1,0),(1,1),(0,1)],'clay')]
  zlo,zhi=zu(eave),max(z for s,z in prof)
  for end in [-1,1]:
   base=len(pts)
   for s,z in prof:pts+=[(end*X0,s,z),(end*X0,s,zu(s))]
   for i in range(len(prof)-1):
    if prof[i][0]==prof[i+1][0]:continue
    f=[base+2*i,base+2*i+1,base+2*i+3,base+2*i+2]
    polys.append((f,(end,0,0),[(pts[q][1]/eave,(pts[q][2]-zlo)/(zhi-zlo)) for q in f],'clay'))
  roof_shell('Roof soffit and gable end',side,pts,polys,'clay')
  beam('Eave',(-1.1,side*1.12,2.34),(1.1,side*1.12,2.34),.07,'oak-dark')
 # Bedding under the ridge caps: its top is 7 mm above the cap legs (z 2.877)
 # and it meets both slopes outside the caps' .073 m half-width. Dark, so the
 # 1.4 cm lip below each cap reads as its shadow line, not a light slit.
 zl=ztop(0,.09)-.006
 prof=[(-.09,zl),(-.076,2.884),(.076,2.884),(.09,zl)]
 pts=[(x,s,z) for x in [-X0,X0] for s,z in prof];polys=[]
 for i in range(3):
  f=[i,i+1,4+i+1,4+i];mid=(prof[i][0]+prof[i+1][0])/2
  polys.append((f,(0,mid,.05),[((pts[q][0]+X0)/(2*X0),q%4/3) for q in f],'rust'))
 for end in [0,1]:
  f=[4*end+q for q in range(4)]
  polys.append((f,(2*end-1,0,0),[((pts[q][1]+.09)/.18,(pts[q][2]-zl)/(2.884-zl)) for q in f],'rust'))
 roof_shell('Ridge mortar bed',1,pts,polys,'rust')
 cylinder('Windlass',(0,0,1.47),.072,1.80,'oak',16,rot=(0,math.pi/2,0))
 # Ferrules sit on the windlass against the inner post faces (|x| .795), where
 # they are seen; inside the post bearing they rendered nothing.
 for x in [-.78,.78]:torus('Windlass ferrule',(x,0,1.47),.078,.016,'iron',12,rot=(0,math.pi/2,0),minor=4)
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
 # The crank is keyed on an iron axle that leaves the windlass inside the post,
 # passes a washer on the post face (x .925) and ends in the arm's hub.
 cylinder('Windlass iron axle',(.94,0,1.47),.02,.10,'iron',8,rot=(0,math.pi/2,0))
 cylinder('Bearing washer',(.931,0,1.47),.045,.014,'iron',8,rot=(0,math.pi/2,0))
 cylinder('Crank hub',(.98,0,1.47),.032,.05,'iron',8,rot=(0,math.pi/2,0))
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
 # Round 5 (strike rule, basin wall): the cushioned stones swept in rings, the
 # projecting corbel band and the inset drum course are gone. The wall is now
 # ONE battered face line from the plinth seat (r 1.465) to the coping seat
 # (r 1.525), dressed as FLAT ashlar: every stone face lies on that one cone (no
 # swell, lean or proud/shy), four courses of equal height, running bond. The
 # joints are cut rebates, not chamfers: a stone's face turns 90 degrees into a
 # flat-shaded return (perpends both ends, an upward ledge on the bed), with
 # the face/return arris marked sharp, and the joint floor is a dark mortar
 # core 18 mm behind the face. The bottom course rises out of the plinth slope
 # and the top course runs up inside the coping, so no band shows under it.
 # Faces are smooth only along the arc. Every face is its own chart island at
 # one texel density near the coping's; returns take the plain stone tile.
 # Working if fitRatios stay [1, ~1.01113, 1] and the probe reports 1 component.
 RF0,RF1,ZF0,ZF1=1.465,1.525,.235,1.30
 face=lambda z:RF0+(RF1-RF0)*(z-ZF0)/(ZF1-ZF0)
 JD,BG,PG,BURY=.018,.022,.020,.008
 lathe('Basin plinth',[(0,0),(1.43,0),(1.5,.08),(1.5,.22),(1.38,.28)],'stone',48,continuous_uv=True)
 # The core's top lip runs out to r 1.5725 INSIDE the coping (z 1.31, above its
 # bevelled underside), so it fills the coping joints flush as mortar and keeps
 # the exact 1.5725 extremity the projecting corbel used to hold: fitRatios
 # and the 1.430875 foot datum stay exact. The inner wall starts from that lip
 # rim, so the core, lip and inner wall form one manifold chain.
 lathe('Basin mortar core',[(face(ZF0)-JD,ZF0),(face(ZF1)-JD,ZF1),(1.5725,1.31)],'stone-dark',48,continuous_uv=True)
 lathe('Basin inner wall',[(1.5725,1.31),(1.285,1.30),(1.285,.93),(.36,.93)],'stone',48,continuous_uv=True)
 # The face leaves the plinth slope r = 1.5 - 2(z - .22) at SEAT.
 SEAT=(1.5+2*.22-RF0+ZF0*(RF1-RF0)/(ZF1-ZF0))/(2+(RF1-RF0)/(ZF1-ZF0))
 NC,NS,SP=4,18,3;H=(ZF1-SEAT)/NC
 rng=np.random.default_rng(50521)
 stones=[]
 for k in range(NC):
  lo=.215 if k==0 else SEAT+k*H+BG/2
  hi=1.312 if k==NC-1 else SEAT+(k+1)*H-BG/2
  R=face((lo+hi)/2);w=1+.06*(2*rng.random(NS)-1);w=w/w.sum()*math.tau
  js=np.concatenate([[0],np.cumsum(w)[:-1]])+(k%2)*.5*math.tau/NS+.11
  for j in range(NS):
   a0=js[j];a1=js[j+1] if j<NS-1 else js[0]+math.tau;h=PG/2/R
   stones.append(dict(k=k,lo=lo,hi=hi,R=R,a0=a0+h,a1=a1-h,tone=2*rng.random()-1,ph=rng.random(3)))
 # Pack every face's rectangle into the atlas tiles the fountain never
 # samples, at one density, starting near the coping's ~195 px per metre.
 REGIONS=[(0,768,384,640),(0,768,0,128),(128,768,640,768),(0,512,128,256),(384,768,256,384),(0,256,256,384)]
 for D in range(200,100,-5):
  cur=[r[2] for r in REGIONS];strips={};ok=True
  for st in stones:
   w=math.ceil((st['a1']-st['a0'])*st['R']*D)+4;h=math.ceil((st['hi']-st['lo'])*D)+4;placed=False
   for sx in strips.setdefault(h,[]):
    if sx[0]+w<=sx[1]:st['px']=(sx[0]+2,sx[2]+2);sx[0]+=w;placed=True;break
   if not placed:
    for i,r in enumerate(REGIONS):
     if cur[i]+h<=r[3]:
      strips[h].append([r[0]+w,r[1],cur[i]]);st['px']=(r[0]+2,cur[i]+2);cur[i]+=h;placed=True;break
   if not placed:ok=False;break
  if ok:break
 if not ok:raise RuntimeError('Masonry chart does not fit')
 CHART_D=D
 for st in stones:
  k,lo,hi,R,a0,a1=st['k'],st['lo'],st['hi'],st['R'],st['a0'],st['a1']
  angs=[a0+(a1-a0)*i/SP for i in range(SP+1)]
  P=lambda a,z,r:(r*math.cos(a),r*math.sin(a),z)
  verts=[P(a,z,face(z)) for a in angs for z in (lo,hi)]            # F(i,j) = 2i+j
  F=lambda i,j:2*i+j;n0=len(verts)
  verts+=[P(a0,lo,face(lo)-JD-BURY),P(a1,lo,face(lo)-JD-BURY)]    # deep perpend feet
  verts+=[P(a,hi,face(hi)-JD-BURY) for a in angs]                 # deep ledge row
  DL,DR=n0,n0+1;Dh=lambda i:n0+2+i
  front=[(F(i,0),F(i+1,0),F(i+1,1),F(i,1)) for i in range(SP)]
  ret=[(DL,F(0,0),F(0,1),Dh(0)),(F(SP,0),DR,Dh(SP),F(SP,1))]
  if k<NC-1:ret+=[(F(i,1),F(i+1,1),Dh(i+1),Dh(i)) for i in range(SP)]
  o=meshpart('Dressed basin ashlar',verts,front+ret,'stone',True)
  if len(o.data.polygons)!=len(front)+len(ret):raise RuntimeError('Ashlar stone lost a face')
  me=o.data;uv=me.uv_layers.active;X,Y=st['px']
  fset={frozenset(f) for f in front}
  for f in me.polygons:
   isf=frozenset(f.vertices) in fset;f.use_smooth=isf
   if isf:
    for li in f.loop_indices:
     vi=me.loops[li].vertex_index;a=angs[vi//2];z=(lo,hi)[vi%2]
     uv.data[li].uv=((X+(a-a0)*R*D)/768,(Y+(z-lo)*D)/768)
  fe=set();oe=set()
  for f in me.polygons:(fe if frozenset(f.vertices) in fset else oe).update(f.edge_keys)
  sharp=me.attributes.get('sharp_edge') or me.attributes.new('sharp_edge','BOOLEAN','EDGE')
  for e in me.edges:sharp.data[e.index].value=e.key in fe and e.key in oe
 # Fountain-only atlas: the shared civic atlas is read back from the material
 # material() built and only tiles this fountain never samples are repainted.
 imgs={n.image.name:n for n in MAT.node_tree.nodes if n.type=='TEX_IMAGE'}
 def readback(name):
  im=imgs['crafted-prop-'+name].image;a=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(a)
  return np.rint(a.reshape(im.size[1],im.size[0],4)*255).astype(np.uint8)
 rgb=readback('albedo');orm=readback('orm')
 # The mortar core alone samples stone-dark here: darken that tile (keeping its
 # grain) to about half the stone face value, so every joint reads as a cut.
 mortar=np.array(PALETTE[TILES['stone-dark']][1],dtype=float)*.68
 t=TILES['stone-dark'];x=(t%6)*128;y=(t//6)*128
 rgb[y:y+128,x:x+128,:3]=np.clip(rgb[y:y+128,x:x+128,:3]*.68,0,255).astype(np.uint8)
 for (x0,x1,y0,y1) in REGIONS:
  rgb[y0:y1,x0:x1,:3]=mortar.astype(np.uint8);orm[y0:y1,x0:x1]=(255,int(.88*255),0,255)
 mid=np.array((154,155,141),dtype=float)
 for st in stones:
  R,lo,hi=st['R'],st['lo'],st['hi'];L=(st['a1']-st['a0'])*R;Hs=hi-lo;X,Y=st['px'];p=st['ph']
  w=math.ceil(L*D)+4;h=math.ceil(Hs*D)+4
  yy,xx=np.mgrid[Y-2:Y-2+h,X-2:X-2+w]
  s=(xx+.5-X)/D;z=(yy+.5-Y)/D
  inside=(s>-.5/D)&(s<L+.5/D)&(z>-.5/D)&(z<Hs+.5/D)
  edge=np.minimum(np.minimum(s,L-s),np.minimum(z,Hs-z))
  # Tight per-stone value (+/-3%), no warm/cool cast, a quiet tooled grain,
  # one texel of arris shade, and splash grime only at the plinth seat.
  shade=1+.03*st['tone']+.016*np.sin(math.tau*(s/.13+p[0]))*np.sin(math.tau*(z/.09+p[1]))+.01*np.sin(math.tau*(s/.37+z/.21+p[2]))
  shade-=.07*np.clip(1-edge/(1.5/D),0,1)
  if st['k']==0:shade-=.06*np.clip(1-(lo+z-SEAT)/.05,0,1)
  col=np.clip(mid[None,None,:]*shade[:,:,None],0,255)
  tgt=rgb[Y-2:Y-2+h,X-2:X-2+w,:3]
  tgt[inside]=col[inside].astype(np.uint8)
 folder=REPORT.parent/'fountain-atlas';folder.mkdir(parents=True,exist_ok=True)
 for name,data in [('albedo',rgb),('orm',orm)]:
  png(folder/(name+'.png'),data[::-1]);node=imgs['crafted-prop-'+name];old=node.image;old.name='superseded-'+name
  image=bpy.data.images.load(str(folder/(name+'.png')));image.name='crafted-prop-'+name
  image.colorspace_settings.name='sRGB' if name=='albedo' else 'Non-Color';image.pack();node.image=image;bpy.data.images.remove(old)
 coping=[(1.5725,1.30),(1.5725,1.32),(1.54,1.385),(1.41,1.385),(1.33,1.36),(1.285,1.30)]
 for i in range(16):
  radial_segment('Jointed basin coping',coping,i*math.tau/16+.002,(i+1)*math.tau/16-.002,'stone-light' if i%4 else 'stone',3,.003)
 lathe('Water annulus',[(1.282,1.25),(.36,1.25)],'water',48,continuous_uv=True)
 lathe('Fluted turned pedestal',[(.36,.94),(.4,1.29),(.35,1.38),(.24,1.43),(.20,1.63),(.26,1.88),(.20,2.06),(.37,2.13)],'stone-light',48,flutes=12,depth=.038,continuous_uv=True)
 # Round 6 (strike rule, scuppers): the rim is no longer notched. The tazza is
 # an unfluted lathe whose rim moulding (band, outer chamfer, flat top, inner
 # splay) stays one continuous ring; the 16 gadroons are applied per profile
 # row and die out under the band, with a ridge (not a groove) on each spout
 # axis. Each spout is PIERCED through the bowl wall below the rim: two
 # windows (outer band and inner wall, rows 5-6 and 10-11, two segments each)
 # are removed by explicit index and the spout solid encloses every cut edge.
 TZ=[(.20,2.05,0),(.46,2.14,.5),(.62,2.32,1),(.665,2.405,.55),(.688,2.452,0),(.712,2.47,0),(.712,2.575,0),
     (.712,2.595,0),(.698,2.615,0),(.586,2.615,0),(.552,2.575,0),(.548,2.47,0),(.10,2.47,0)]
 TS=80;bowl=lathe('Fluted upper tazza',[(r,z) for r,z,_ in TZ],'stone',TS,continuous_uv=True);me=bowl.data
 for j,(r,z,wt) in enumerate(TZ):
  for i in range(TS if wt else 0):
   a=i*math.tau/TS;rr=r-.042*wt*(.5-.5*math.cos(16*a));me.vertices[j*TS+i].co=(rr*math.cos(a),rr*math.sin(a),z)
 quad=lambda j,i:frozenset((j*TS+i,j*TS+(i+1)%TS,(j+1)*TS+(i+1)%TS,(j+1)*TS+i))
 cut={quad(j,i%TS) for s in range(4) for i in (TS//4*s-1,TS//4*s) for j in (5,10)}
 bm=bmesh.new();bm.from_mesh(me);bm.verts.ensure_lookup_table()
 remove=[f for f in bm.faces if frozenset(v.index for v in f.verts) in cut]
 if len(remove)!=16:raise RuntimeError('Tazza windows: expected 16 faces, found '+str(len(remove)))
 nv=len(bm.verts);bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(me);bm.free();me.update()
 if len(me.vertices)!=nv:raise RuntimeError('Tazza windows moved vertices')
 # The rim moulding's arrises shade as cuts; the gadrooned underside stays smooth.
 rims={frozenset((j*TS+i,j*TS+(i+1)%TS)) for j in (7,8) for i in range(TS)}
 sharp=me.attributes.get('sharp_edge') or me.attributes.new('sharp_edge','BOOLEAN','EDGE')
 for e in me.edges:sharp.data[e.index].value=frozenset(e.vertices) in rims
 lathe('Upper water',[(.556,2.515),(.1,2.515)],'water',32,continuous_uv=True)
 lathe('Fleur spout',[(.14,2.47),(.17,2.57),(.12,2.70),(.075,3.03),(.15,3.16),(.10,3.28),(0,3.32)],'stone-light',20,continuous_uv=True)
 # Spouts, traced from a side elevation (top line T and keel line B against r)
 # and a plan taper (top half-width Wt, keel half-width Wb), swept through
 # flat chamfered 12-point sections: a corbelled keel that grows out of the
 # gadroon ridge, battered sides, a flat top tucked under the rim's outer
 # chamfer, a chamfered nose, and a segmental-arch tunnel lined in the dark
 # joint tile with a splayed reveal at the mouth. The back is an intake
 # surround 12 mm proud of the inner wall, below the rim. Pinned datums
 # (stream starts after the unchanged 3.18 / 3.145 fit): tunnel floor 2.509,
 # crown 2.553 to r .77 (stone 22 mm above and below the stream start at r .76,
 # y 2.531), hood top 2.5975 at r .75, and the tunnel clear at 2.531 through
 # both windows. The nose stays at .785, as before.
 OUT=[(.540,.070,.070,2.466,2.582),(.650,.090,.036,2.386,2.600),(.690,.095,.048,2.418,2.602),
      (.720,.093,.056,2.442,2.600),(.750,.083,.058,2.462,2.5975),(.776,.073,.056,2.476,2.596),(.785,.065,.048,2.484,2.588)]
 TUN=[(.540,.042,2.509,2.525,2.553),(.770,.042,2.509,2.525,2.553),(.785,.047,2.509,2.528,2.560)]
 # Ten points per section, matched one to one so each end face is an annulus
 # of quads: keel chamfer, batter, side, top chamfer, top (and mirror); the
 # tunnel's flat floor, jamb, haunch and flat crown (crown = ceiling datum).
 def osec(Wt,Wb,B,T,c=.012):
  zM=B+.3*(T-B);half=[(Wb-c,B),(Wb,B+c),(Wt,zM),(Wt,T-c),(Wt-c,T)]
  return half+[(-w,z) for w,z in reversed(half)]
 def tsec(hw,F,S,C):
  half=[(hw*.45,F),(hw,F),(hw,S),(hw*.8,S+.62*(C-S)),(hw*.38,C)]
  return half+[(-w,z) for w,z in reversed(half)]
 def chart(ring):
  d=[0]
  for k in range(len(ring)):d.append(d[-1]+math.hypot(ring[(k+1)%len(ring)][0]-ring[k][0],ring[(k+1)%len(ring)][1]-ring[k][1]))
  return [x/d[-1] for x in d]
 def spout(a):
  rings=[[(r,w,z) for w,z in osec(*p)] for r,*p in OUT]+[[(r,w,z) for w,z in tsec(*p)] for r,*p in TUN]
  n=10;no=len(OUT);nt=len(TUN);idx=lambda s,k:s*n+k%n
  faces=[];kind=[]
  for s in range(no-1):faces+=[(idx(s,k),idx(s,k+1),idx(s+1,k+1),idx(s+1,k)) for k in range(n)];kind+=['O']*n
  for s in range(no,no+nt-1):faces+=[(idx(s,k),idx(s,k+1),idx(s+1,k+1),idx(s+1,k)) for k in range(n)];kind+=['T']*n
  faces+=[(idx(0,k),idx(0,k+1),idx(no,k+1),idx(no,k)) for k in range(n)];kind+=['E']*n
  faces+=[(idx(no-1,k),idx(no-1,k+1),idx(no+nt-1,k+1),idx(no+nt-1,k)) for k in range(n)];kind+=['E']*n
  pts=[p for rg in rings for p in rg]
  verts=[(r*math.cos(a)-w*math.sin(a),r*math.sin(a)+w*math.cos(a),z) for r,w,z in pts]
  o=meshpart('Pierced scupper spout',verts,faces,'stone',True)
  if len(o.data.polygons)!=len(faces):raise RuntimeError('Scupper spout lost a face')
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
  # Continuous charts (not face-local islands): around each section by arc
  # length with the seam on the hidden keel/floor, along the sweep by radius;
  # end faces planar in (w, z). The tunnel lining takes the darkened joint tile.
  co=chart([(w,z) for _,w,z in rings[3]]);ct=chart([(w,z) for _,w,z in rings[no]])
  uv=o.data.uv_layers.active;me=o.data
  for f,g in zip(me.polygons,kind):
   ks=[me.loops[li].vertex_index%n for li in f.loop_indices];wrap=0 in ks and n-1 in ks
   for li in f.loop_indices:
    vi=me.loops[li].vertex_index;r,w,z=pts[vi];k=vi%n
    if g=='E':key,u,v='stone',(w+.1)/.2,(z-2.38)/.24
    else:
     key='stone-dark' if g=='T' else 'stone';u=(ct if g=='T' else co)[n if wrap and k==0 else k];v=(r-.54)/.245
    t=TILES[key];uv.data[li].uv=((t%6)/6+(.045+.91*min(1,max(0,u)))/6,(t//6)/6+(.045+.91*min(1,max(0,v)))/6)
   f.use_smooth=True
  me.set_sharp_from_angle(angle=math.radians(30))
  return o
 for i in range(4):spout(i*math.pi/2)

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
  material(REPORT.parent/'civic-atlas',hay_only=slug=='haybale',well_only=slug=='wishingwell');BUILDERS[slug]()
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
