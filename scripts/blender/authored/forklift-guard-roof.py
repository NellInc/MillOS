"""Forklift overhead-guard roof, built from scratch in headless Blender.

Replaces the flat plate `forklift-roof-28` of public/models/forklift/forklift.glb (a
judge's note: "the overhead guard roof is a flat plate") with a slatted guard: a deep
perimeter channel with a chamfered top edge on the old plate's outline, transverse slats
set 10 mm below it at varied pitch with open gaps, two longitudinal stiffeners crossing
them flush with the rim, and a raised pad under the rotating beacon (src/components/models/forkliftBeacon.ts:
lamp centred at x 0, z -0.30, base 0.1 m radius, its underside at y 1.785).

Like scripts/blender/authored/forklift-chassis-unit.py it is written in the MESH-LOCAL
frame of the mesh it replaces (rig = R_y(90 deg) * S * local + T), snapped to that mesh's
int16 grid, with the old local envelope exactly (X +-32279/32767, Y +-3020/32767, Z +-1),
so normalizeForklift can swap the primitive's accessors and nothing else in the rig moves.
The runtime paints this node structural graphite (STRUCTURAL_PAINT_NODES); no textures.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/forklift-guard-roof.py -- <out.glb>
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

S = 0.36710685343236676
TX, TY, TZ = 0.0000036463466184244453, 1.7601068770659791, -0.23864734871717097
Q = 32767
LX, LY, LZ = 32279 / Q, 3020 / Q, 1.0
XMAX = S * LZ  # 0.36711 half width
YMIN, YMAX = TY - S * LY, TY + S * LY  # 1.72627 .. 1.79394
ZMIN, ZMAX = TZ - S * LX, TZ + S * LX  # -0.60028 .. 0.12299

RIM = 0.05  # perimeter channel width
CHAMFER = 0.012  # rim's outer top edge
SLAT_W = 0.04
SLAT_DROP = 0.010  # slats sit 10 mm below the raised rim and ribs
SLAT_DEPTH = 0.030
# Wider spacing over the beacon pad, tighter over the operator's head (front).
SLAT_CENTRES = (-0.52, -0.43, -0.32, -0.20, -0.115, -0.045, 0.025)
RIBS = (-0.17, 0.17)  # two longitudinal stiffeners crossing the slats, flush with the rim
RIB_W = 0.03
BEACON_PLATE = dict(x=0.13, z0=-0.40, z1=-0.20, depth=0.028)
BEACON_Z, BEACON_FOOT = -0.30, 1.785
NODE_NAME = 'forklift-guard-roof'


def g2b(x, y, z):
    return (x, -z, y)


def box(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x = x0 if v.co.x < 0 else x1
        y = y0 if v.co.z < 0 else y1
        z = z0 if v.co.y > 0 else z1
        v.co = g2b(x, y, z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def boolean(target, tool, operation):
    mod = target.modifiers.new('bool', 'BOOLEAN')
    mod.operation = operation
    mod.solver = 'EXACT'
    mod.object = tool
    mesh = bpy.data.meshes.new_from_object(target.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    target.modifiers.remove(mod)
    old = target.data
    target.data = mesh
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(tool)


def prism(name, profile, axis, lo, hi):
    """Extrude a closed polygon: axis 'x' takes (z, y) points, axis 'z' takes (x, y)."""
    def place(p, t):
        return g2b(t, p[1], p[0]) if axis == 'x' else g2b(p[0], p[1], t)
    bm = bmesh.new()
    a = [bm.verts.new(place(p, lo)) for p in profile]
    b = [bm.verts.new(place(p, hi)) for p in profile]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(len(profile)):
        j = (i + 1) % len(profile)
        bm.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def chamfered(lo, hi):
    """(a, y) section of a rim whose outer top edges are chamfered."""
    return [(lo, YMIN), (hi, YMIN), (hi, YMAX - CHAMFER), (hi - CHAMFER, YMAX),
            (lo + CHAMFER, YMAX), (lo, YMAX - CHAMFER)]


def build():
    roof = prism('rim', chamfered(-XMAX, XMAX), 'z', ZMIN - 0.05, ZMAX + 0.05)
    boolean(roof, prism('rim-ends', chamfered(ZMIN, ZMAX), 'x', -XMAX - 0.05, XMAX + 0.05),
            'INTERSECT')
    # Hollow the channel from the top and bottom alike: the rim is a closed ring.
    boolean(roof, box('opening', -XMAX + RIM, XMAX - RIM, YMIN - 0.1, YMAX + 0.1,
                      ZMIN + RIM, ZMAX - RIM), 'DIFFERENCE')
    reach = XMAX - RIM / 2  # slats run into the rim, never to its outer face
    for z in SLAT_CENTRES:
        boolean(roof, box('slat', -reach, reach, YMAX - SLAT_DROP - SLAT_DEPTH, YMAX - SLAT_DROP,
                          z - SLAT_W / 2, z + SLAT_W / 2), 'UNION')
    p = BEACON_PLATE
    boolean(roof, box('beacon-plate', -p['x'], p['x'], YMAX - p['depth'], YMAX, p['z0'], p['z1']),
            'UNION')
    # Two longitudinal stiffeners cross over the slats, flush with the rim, into its ends.
    for x in RIBS:
        boolean(roof, box('rib', x - RIB_W / 2, x + RIB_W / 2, YMAX - SLAT_DROP - SLAT_DEPTH - 0.012,
                          YMAX, ZMIN + RIM / 2, ZMAX - RIM / 2), 'UNION')
    roof.name = NODE_NAME
    return roof


def finish(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts, edges=bm.edges,
                             delimit=set())
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(obj.data)
    bm.free()
    # Blender rig -> Blender local: local glTF (lx, ly, lz) = (-(z - TZ), y - TY, x - TX) / S.
    obj.data.transform(Matrix((
        (0.0, 1.0 / S, 0.0, TZ / S),
        (-1.0 / S, 0.0, 0.0, TX / S),
        (0.0, 0.0, 1.0 / S, -TY / S),
        (0.0, 0.0, 0.0, 1.0),
    )))
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    obj.data.vertices.foreach_set('co', np.round(co * Q) / Q)
    obj.data.update()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.5 / Q)
    bad = [e for e in bm.edges if len(e.link_faces) != 2]
    assert not bad, f'{len(bad)} non-manifold or boundary edges'
    assert min(f.calc_area() for f in bm.faces) > 1e-10, 'degenerate triangle'
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = False  # flat steel: every face shades flat
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    gl = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)
    want = np.array([LX, LY, LZ])
    assert np.allclose(gl.min(0), -want, atol=0.5 / Q) and np.allclose(gl.max(0), want, atol=0.5 / Q), \
        f'local envelope {gl.min(0)} {gl.max(0)} != +-{want}'
    # The beacon's base (0.1 m radius) must sit on solid roof all round.
    rig = np.stack([S * gl[:, 2] + TX, S * gl[:, 1] + TY, -S * gl[:, 0] + TZ], 1)
    bvh = BVHTree.FromPolygons([Vector(g2b(*p)) for p in rig],
                               [tuple(p.vertices) for p in obj.data.polygons])
    for ang in range(0, 360, 45):
        x, z = 0.095 * math.cos(math.radians(ang)), BEACON_Z + 0.095 * math.sin(math.radians(ang))
        hit = bvh.ray_cast(Vector(g2b(x, 3.0, z)), Vector((0, 0, -1)))
        assert hit[0] is not None and abs(hit[0].z - YMAX) < 1e-4, f'beacon base unsupported at {x, z}'
    assert 0 < YMAX - BEACON_FOOT < 0.012, 'beacon base no longer seated in the roof'
    return len(obj.data.polygons)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P forklift-guard-roof.py -- <out.glb>')
    out = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = build()
    tris = finish(obj)
    obj.data.materials.clear()
    mat = bpy.data.materials.new('roof')
    obj.data.materials.append(mat)
    for other in list(bpy.context.scene.collection.objects):
        if other.name != obj.name:
            bpy.data.objects.remove(other)
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_normals=True, export_tangents=False,
        export_texcoords=False, export_vertex_color='NONE', export_yup=True, export_apply=False,
        export_animations=False, export_cameras=False, export_lights=False, export_extras=False,
        export_copyright='MillOS authored geometry (scripts/blender/authored/forklift-guard-roof.py)',
    )
    print(f'FORKLIFT_ROOF_WROTE {out} {os.path.getsize(out)} bytes, {tris} triangles')


main()
