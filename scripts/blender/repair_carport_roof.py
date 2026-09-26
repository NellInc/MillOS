"""Replace only the generated carport's folded roof skin, retaining its atlas and piers.

The provider top has thousands of near-coplanar, inverted triangles. A clean
bevelled cap preserves the authored flat-roof silhouette and uses a warm tile
from the existing atlas, with no new texture or draw call.
"""
import argparse, json, pathlib, sys
import bpy, bmesh
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=pathlib.Path(a.output).resolve()
if out.exists():raise RuntimeError('Choose a new derivative; original evidence is immutable')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(pathlib.Path(a.input).resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if len(meshes)!=1:raise RuntimeError('Expected one carport mesh')
o=meshes[0];mesh=o.data
lo=[min(v.co[k] for v in mesh.vertices) for k in range(3)]
hi=[max(v.co[k] for v in mesh.vertices) for k in range(3)]
if not (.205<hi[2]<.215):raise RuntimeError('Source roof datum changed')
mat=mesh.materials[0]
node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and any(l.to_socket.name=='Base Color' for l in n.outputs['Color'].links))
im=node.image;w,h=im.size;px=list(im.pixels)
# Select an opaque warm brown already present in the provider's atlas.
# Use the centre of a low-gradient 5x5 patch to avoid mipmap edge contamination.
target=(.40,.19,.085);best=None
for y in range(4,h-4,4):
 for x in range(4,w-4,4):
  samples=[px[((y+dy)*w+x+dx)*4:((y+dy)*w+x+dx)*4+3] for dx,dy in [(0,0),(-2,0),(2,0),(0,-2),(0,2)]]
  c=samples[0]
  score=sum((c[k]-target[k])**2 for k in range(3))+4*sum((v[k]-c[k])**2 for v in samples for k in range(3))
  if best is None or score<best[0]:best=(score,x,y,c)
uv=((best[1]+.5)/w,(best[2]+.5)/h)
bm=bmesh.new();bm.from_mesh(mesh);before=len(bm.faces)
failed=[f for f in bm.faces if any(v.co.z>.203 for v in f.verts)]
if len(failed)<4000:raise RuntimeError('Roof selection unexpectedly small')
bmesh.ops.delete(bm,geom=failed,context='FACES')
loose=[v for v in bm.verts if not v.link_faces]
if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
# Add the cap to the same mesh. The existing underside and fascia remain intact.
cap=bmesh.ops.create_cube(bm,size=1)['verts']
for v in cap:
 v.co.x=(lo[0]+hi[0])/2+v.co.x*(hi[0]-lo[0])
 v.co.y=(lo[1]+hi[1])/2+v.co.y*(hi[1]-lo[1])
 v.co.z=hi[2]-.003+v.co.z*.006
edges=list({e for v in cap for e in v.link_edges})
new=bmesh.ops.bevel(bm,geom=edges,offset=.001,segments=1,affect='EDGES')
# New vertices are disconnected from the retained structure, so identify cap faces
# by their lower bound, including the new bevel faces.
layer=bm.loops.layers.uv.verify()
count=0
for f in bm.faces:
 if all(v.co.z>=hi[2]-.0061 for v in f.verts):
  f.smooth=False;f.material_index=0;count+=1
  # Non-degenerate per-face UVs keep tangent-space normal mapping defined.
  axes=sorted(range(3),key=lambda k:max(v.co[k] for v in f.verts)-min(v.co[k] for v in f.verts),reverse=True)[:2]
  bounds=[(min(v.co[k] for v in f.verts),max(v.co[k] for v in f.verts)) for k in axes]
  for loop in f.loops:
   loop[layer].uv=tuple(uv[j]+((loop.vert.co[k]-bounds[j][0])/(bounds[j][1]-bounds[j][0])-.5)*2/(w if j==0 else h) for j,k in enumerate(axes))
bm.normal_update();bm.to_mesh(mesh);bm.free()
mesh.normals_split_custom_set([(0,0,0)]*len(mesh.loops))
mesh.update()
bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True)
report={'removedFoldedRoofFaces':len(failed),'originalFaces':before,'retainedAndCapFaces':len(mesh.polygons),'capFaces':count,'sourceBounds':[lo,hi],'atlasUV':uv,'atlasPixel':best[3],'materialCount':len(mesh.materials),'note':'Original provider GLB untouched. Only folded roof skin replaced; clean cap reuses provider atlas.'}
out.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
