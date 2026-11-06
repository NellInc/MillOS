"""Petrol-pump cabinet shell (world-fuel-pump-shell), built from scratch.

What it builds
--------------
The pump cabinet that stands in pairs on the gas-station island: 0.70 m wide
(X) x 1.80 m tall (Y) x 0.60 m deep (Z), origin at the ground centre, +Z
(three.js) front. One node `Fuel-pump-shellBody`, one mesh, one material, two
textures. Parts, bottom to top:

* plinth: a charcoal kick base on the full 0.70 x 0.60 footprint, 0.12 m tall,
  tapering 2 cm per side to its top, chamfered corners;
* body: the off-white 0.60 x 0.50 upright with small (3 cm) smoothed corner
  chamfers. Each pump face (+Z and -Z) has two recessed panels 10 mm deep: a
  lower service door and an upper grey display bay. Each side (+X, -X) has a
  recessed access hatch. Every panel joint is a modelled bevelled reveal
  (16 mm wide on the face, sloping to the floor) painted as a shadow gap,
  charcoal round the display, so the seams read in shade, not only in sun. The body's top is a visible 1.5-2.5 cm ledge around
  the neck;
* neck: a dark recessed band (4 cm visible) between body and cap, so the cap
  no longer butts straight onto the body;
* cap: the orange 0.70 x 0.60 x 0.20 hood with a large (5.5 x 4 cm) rolled top
  edge and a 2.5 x 3 cm rolled underside lip, chamfered corners. Its corner,
  top and lip radii all differ from the body's.

Parts nest instead of butting: the body is sunk 1 cm into the plinth, the neck
runs 1 cm into the body and 2 cm into the cap, so no two faces of different
colour lie flush (glb-self-coplanar), and every part is a closed shell.

What the runtime does with it (src/components/scenery/AuthoredPropTrim.tsx)
-------------------------------------------------------------------------
`createPosterStationGeometry(_, 'fuelPumpShell')` discards this geometry and
draws its own rounded terracotta cabinet in the same envelope, provided the
source carries COLOR_0. It reads only: the bounds of the local mesh, the node
transform (it undoes the +90 degree Y rotation and derives its scale from the
local height / 1.8), and the UVs, which `projectStationUV` samples from the
nearest triangle of this mesh. So this script keeps exactly the delivered node
(translation (0, 0.9, 0), rotation +90 degrees about Y, uniform scale 1.8,
geometry in that local frame), a float32 VEC3 COLOR_0, and the delivered
normal and occlusion-roughness-metal JPEGs byte for byte (both are near-uniform:
a flat normal map and enamel roughness), so the in-game cabinet's material is
unchanged. UVs are one linear box projection per axis in metres, spanning the
full height on every side, so the projection cannot pick up a stray island.

Contract (public/models/asset-manifest.json): maxRenderVertices 700 counts
indices, so the mesh is a non-indexed triangle soup (as delivered) of at most
233 triangles; this build uses 224. Smooth-looking corners come from custom
normals on single chamfer quads (the chamfer's vertices take the normal of the
flat face they touch), not from extra segments.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/fuel-pump-shell.py -- <out.glb> [atlas-source.glb]

atlas-source.glb defaults to assets/source/models/world/fuel-pump-shell-atlas-e24d2734.glb; only its
two images are read. Re-runnable and deterministic: writes only <out.glb>. Plain
Python (struct, math), so Blender's bundled interpreter runs it headless; the
GLB is written directly rather than through Blender's exporter, which would emit
COLOR_0 as VEC4 and reorder the soup.
"""

import json
import math
import os
import struct
import sys

# ---------------------------------------------------------------- identity
NODE_NAME = 'Fuel-pump-shellBody'
MESH_NAME = 'fuel-pump-shell-mesh'
MATERIAL_NAME = 'fuel-pump-shell-surface'
SCENE_NAME = 'MillOS_World_Fuel-pump-shell'
NORMAL_NAME = 'fuel-pump-shell-normal'
ORM_NAME = 'fuel-pump-shell-orm'
NODE_TRANSLATION = [0, 0.9, 0]
NODE_ROTATION = [0, 0.7071067811865475, 0, 0.7071067811865476]  # +90 deg about Y
NODE_SCALE = 1.8
TRIANGLE_BUDGET = 233  # 700 indices

# ---------------------------------------------------------------- dimensions (world metres)
HX, HZ, H = 0.35, 0.30, 1.80  # envelope half-width, half-depth, height

PLINTH_TOP = 0.12
PLINTH_TAPER = 0.02
PLINTH_CHAMFER = 0.04

BODY_HX, BODY_HZ = 0.30, 0.25
BODY_CHAMFER = 0.03
BODY_Y0 = PLINTH_TOP - 0.01  # sunk into the plinth
BODY_Y1 = 1.56
INSET = 0.010  # reveal depth
REVEAL_W = 0.016  # reveal (bevel) width on the face, > depth so the slope faces outward

NECK_HX, NECK_HZ = 0.275, 0.225
NECK_Y0, NECK_Y1 = BODY_Y1 - 0.01, 1.62

CAP_Y0 = 1.60
CAP_CHAMFER = 0.05
CAP_LIP = (0.025, 0.03)  # underside roll: inset, height
CAP_ROLL = (0.04, 0.055)  # top roll: inset, height

# Pump faces (+-Z): lower service door and upper display bay, same width.
FACE_PANEL_U = 0.21
DOOR_V = (0.20, 0.92)
DISPLAY_V = (1.02, 1.48)
# Sides (+-X): one access hatch.
HATCH_U = 0.15
HATCH_V = (0.30, 1.30)


def srgb(hex_code):
    out = []
    for i in (0, 2, 4):
        c = int(hex_code[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# Linear vertex paint. Body ~0.78 linear so the sun does not clip it to 255.
BODY = srgb('E6E2D8')
DOOR = srgb('D3CFC5')  # door and hatch floors, a step below the frame
REVEAL = srgb('6E6B65')  # shadow-gap paint on the door and hatch reveals
BEZEL = srgb('2E2F32')  # the display bay's reveal reads as a bezel
DISPLAY = srgb('9A9C9F')
PLINTH = srgb('3C3D40')
NECK = srgb('4A4B4E')
CAP = (0.791, 0.082, 0.0)  # the delivered orange, unchanged

# ---------------------------------------------------------------- vector helpers


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    length = math.sqrt(dot(a, a))
    return (a[0] / length, a[1] / length, a[2] / length)


# ---------------------------------------------------------------- triangle soup
TRIS = []  # (positions[3], normals[3], colour)


def tri(p, n, colour, outward):
    """Append one triangle, wound counter-clockwise about `outward`."""
    g = cross(sub(p[1], p[0]), sub(p[2], p[0]))
    if math.sqrt(dot(g, g)) < 1e-12:
        raise SystemExit(f'degenerate triangle {p}')
    if dot(g, outward) < 0:
        p = [p[0], p[2], p[1]]
        n = [n[0], n[2], n[1]]
    TRIS.append((list(p), [norm(v) for v in n], colour))


def quad(p, n, colour, outward):
    tri([p[0], p[1], p[2]], [n[0], n[1], n[2]], colour, outward)
    tri([p[0], p[2], p[3]], [n[0], n[2], n[3]], colour, outward)


# ---------------------------------------------------------------- chamfered (octagonal) plans
FLAT = [(1, 0), (0, 1), (-1, 0), (0, -1)]  # +X, +Z, -X, -Z (x, z)


def octagon(ax, az, c):
    """Eight plan points; edge 2k is the flat side FLAT[k], edge 2k+1 the chamfer after it."""
    return [(ax, -(az - c)), (ax, az - c), (ax - c, az), (-(ax - c), az),
            (-ax, az - c), (-ax, -(az - c)), (-(ax - c), -az), (ax - c, -az)]


def offset(ax, az, c, d):
    """The same octagon moved inward by d (flat sides by d, chamfer line by d*sqrt2)."""
    c2 = c - d * (2 - math.sqrt(2))
    if c2 <= 0:
        raise SystemExit('offset swallows the chamfer')
    return ax - d, az - d, c2


def edge_plan_normals(e):
    """Plan normals at the two ends of edge e. A chamfer edge blends the two
    flat sides it joins, so one quad shades as a rounded corner."""
    if e % 2 == 0:
        return FLAT[e // 2], FLAT[e // 2]
    return FLAT[e // 2], FLAT[(e // 2 + 1) % 4]


def ring_normal(plan, phi):
    return (plan[0] * math.cos(phi), math.sin(phi), plan[1] * math.cos(phi))


def loft(rings, bands, colour):
    """rings: [(ax, az, c, y)]; bands: per consecutive ring pair, the normal
    elevation angle (radians) at the lower and the upper ring."""
    for i, (phi_a, phi_b) in enumerate(bands):
        lo, hi = rings[i], rings[i + 1]
        pa, pb = octagon(*lo[:3]), octagon(*hi[:3])
        for e in range(8):
            f = (e + 1) % 8
            na, nb = edge_plan_normals(e)
            p = [(pa[e][0], lo[3], pa[e][1]), (pa[f][0], lo[3], pa[f][1]),
                 (pb[f][0], hi[3], pb[f][1]), (pb[e][0], hi[3], pb[e][1])]
            n = [ring_normal(na, phi_a), ring_normal(nb, phi_a),
                 ring_normal(nb, phi_b), ring_normal(na, phi_b)]
            mid = mul(add(add(n[0], n[1]), add(n[2], n[3])), 0.25)
            quad(p, n, colour, mid)


def octagon_cap(ax, az, c, y, up, colour):
    pts = [(x, y, z) for x, z in octagon(ax, az, c)]
    n = (0, 1 if up else -1, 0)
    for k in range(1, 7):
        tri([pts[0], pts[k], pts[k + 1]], [n, n, n], colour, n)


# ---------------------------------------------------------------- panelled body face


def panelled_face(origin, U, V, N, u_half, v_range, holes, frame_colour):
    """A flat face origin + u*U + v*V (u in +-u_half, v in v_range) with
    rectangular recesses stacked in v: holes = [(a_half, b0, b1, colour, reveal)],
    all with the same a_half, giving each opening at the face. Every recess has
    four sloped reveal walls and a floor INSET deep."""
    P = lambda u, v, depth=0.0: add(add(add(origin, mul(U, u)), mul(V, v)), mul(N, -depth))
    v0, v1 = v_range
    a = holes[0][0]
    for side in (-1, 1):
        uo, ui = side * u_half, side * a
        column = [b for h in holes for b in (h[1], h[2])]
        m = len(column) // 2 - 1
        for k in range(len(column) - 1):
            # lower half of the column fans to the bottom corner, upper half to the top
            corner = v0 if k <= m else v1
            tri([P(uo, corner), P(ui, column[k]), P(ui, column[k + 1])], [N] * 3, frame_colour, N)
            if k == m:
                tri([P(uo, v0), P(ui, column[k + 1]), P(uo, v1)], [N] * 3, frame_colour, N)
    # bottom, top and the bridges between recesses
    quad([P(-u_half, v0), P(u_half, v0), P(a, holes[0][1]), P(-a, holes[0][1])], [N] * 4, frame_colour, N)
    quad([P(-u_half, v1), P(u_half, v1), P(a, holes[-1][2]), P(-a, holes[-1][2])], [N] * 4, frame_colour, N)
    for h0, h1 in zip(holes, holes[1:]):
        quad([P(-a, h0[2]), P(a, h0[2]), P(a, h1[1]), P(-a, h1[1])], [N] * 4, frame_colour, N)
    for a_half, b0, b1, colour, reveal in holes:
        # The joint is modelled, not implied: a bevelled reveal slopes from the
        # opening at the face down to a floor REVEAL_W smaller on every side,
        # INSET deep. The slope faces mostly outward, so it has frontal area,
        # and it carries its own dark paint: the seam reads as a line in shade
        # as well as in sun.
        fa, f0, f1 = a_half - REVEAL_W, b0 + REVEAL_W, b1 - REVEAL_W
        rim = [(-a_half, b0), (a_half, b0), (a_half, b1), (-a_half, b1)]
        floor = [(-fa, f0), (fa, f0), (fa, f1), (-fa, f1)]
        for k in range(4):
            j = (k + 1) % 4
            p = [P(*rim[k]), P(*rim[j]), P(*floor[j], INSET), P(*floor[k], INSET)]
            g = norm(cross(sub(p[1], p[0]), sub(p[3], p[0])))
            if dot(g, N) < 0:
                g = mul(g, -1)
            quad(p, [g] * 4, reveal, g)
        quad([P(*c, INSET) for c in floor], [N] * 4, colour, N)


# ---------------------------------------------------------------- parts


def build_plinth():
    top = offset(HX, HZ, PLINTH_CHAMFER, PLINTH_TAPER)
    phi = math.atan2(PLINTH_TAPER, PLINTH_TOP)  # the leaning wall tilts its normal up
    loft([(HX, HZ, PLINTH_CHAMFER, 0.0), (*top, PLINTH_TOP)], [(phi, phi)], PLINTH)
    octagon_cap(HX, HZ, PLINTH_CHAMFER, 0.0, False, PLINTH)
    octagon_cap(*top, PLINTH_TOP, True, PLINTH)


def build_body():
    c = BODY_CHAMFER
    pts = octagon(BODY_HX, BODY_HZ, c)
    # the four smoothed corner chamfers (odd edges)
    for e in (1, 3, 5, 7):
        f = (e + 1) % 8
        na, nb = edge_plan_normals(e)
        na3, nb3 = (na[0], 0, na[1]), (nb[0], 0, nb[1])
        p = [(pts[e][0], BODY_Y0, pts[e][1]), (pts[f][0], BODY_Y0, pts[f][1]),
             (pts[f][0], BODY_Y1, pts[f][1]), (pts[e][0], BODY_Y1, pts[e][1])]
        quad(p, [na3, nb3, nb3, na3], BODY, norm(add(na3, nb3)))
    up = (0, 1, 0)
    for sign in (1, -1):
        # pump faces (+-Z): service door below, display bay above
        panelled_face((0, 0, sign * BODY_HZ), (1, 0, 0), up, (0, 0, sign), BODY_HX - c,
                      (BODY_Y0, BODY_Y1),
                      [(FACE_PANEL_U, DOOR_V[0], DOOR_V[1], DOOR, REVEAL),
                       (FACE_PANEL_U, DISPLAY_V[0], DISPLAY_V[1], DISPLAY, BEZEL)], BODY)
        # sides (+-X): access hatch
        panelled_face((sign * BODY_HX, 0, 0), (0, 0, 1), up, (sign, 0, 0), BODY_HZ - c,
                      (BODY_Y0, BODY_Y1), [(HATCH_U, HATCH_V[0], HATCH_V[1], DOOR, REVEAL)], BODY)
    octagon_cap(BODY_HX, BODY_HZ, c, BODY_Y1, True, BODY)  # the visible ledge round the neck
    octagon_cap(BODY_HX, BODY_HZ, c, BODY_Y0, False, BODY)  # buried in the plinth


def build_neck():
    x, z = NECK_HX, NECK_HZ
    corners = [(x, -z), (x, z), (-x, z), (-x, -z)]
    for k in range(4):
        (xa, za), (xb, zb) = corners[k], corners[(k + 1) % 4]
        n = (FLAT[k][0], 0, FLAT[k][1])
        quad([(xa, NECK_Y0, za), (xb, NECK_Y0, zb), (xb, NECK_Y1, zb), (xa, NECK_Y1, za)], [n] * 4, NECK, n)
    for y, s in ((NECK_Y0, -1), (NECK_Y1, 1)):
        n = (0, s, 0)
        p = [(cx, y, cz) for cx, cz in corners]
        quad(p, [n] * 4, NECK, n)


def build_cap():
    lip = offset(HX, HZ, CAP_CHAMFER, CAP_LIP[0])
    roll = offset(HX, HZ, CAP_CHAMFER, CAP_ROLL[0])
    rings = [(*lip, CAP_Y0),
             (HX, HZ, CAP_CHAMFER, CAP_Y0 + CAP_LIP[1]),
             (HX, HZ, CAP_CHAMFER, H - CAP_ROLL[1]),
             (*roll, H)]
    half = math.pi / 2
    # Quarter rolls: the underside lip turns from straight down to horizontal,
    # the top from horizontal to straight up, matching the flat faces' normals.
    loft(rings, [(-half, 0.0), (0.0, 0.0), (0.0, half)], CAP)
    octagon_cap(*lip, CAP_Y0, False, CAP)
    octagon_cap(*roll, H, True, CAP)


# ---------------------------------------------------------------- frames, UVs and export


def to_local(p):
    """World metres -> the node's local frame (inverse of T * R(+90 Y) * S)."""
    x, y, z = p[0] - NODE_TRANSLATION[0], p[1] - NODE_TRANSLATION[1], p[2] - NODE_TRANSLATION[2]
    x, y, z = x / NODE_SCALE, y / NODE_SCALE, z / NODE_SCALE
    return (-z, y, x)  # R(-90 about Y)


def dir_to_local(n):
    return (-n[2], n[1], n[0])


def uv_for(p, face_normal):
    """Linear box projection, 0.98/1.8 per metre, centred; the full height spans v 0.01..0.99."""
    k = 0.98 / H
    ax = max(range(3), key=lambda i: abs(face_normal[i]))
    if ax == 0:
        return (0.5 + p[2] * k, 0.99 - p[1] * k)
    if ax == 2:
        return (0.5 + p[0] * k, 0.99 - p[1] * k)
    return (0.5 + p[0] * k, 0.5 + p[2] * k)


def read_atlas(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _version, _total = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise SystemExit(f'{path} is not a GLB')
    jlen, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20 + jlen])
    blen, _ = struct.unpack_from('<II', data, 20 + jlen)
    blob = data[28 + jlen:28 + jlen + blen]
    images = {}
    for image in gltf['images']:
        view = gltf['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        images[image['name']] = (blob[start:start + view['byteLength']], image['mimeType'])
    for name in (NORMAL_NAME, ORM_NAME):
        if name not in images:
            raise SystemExit(f'{path} has no image {name}')
    return images


def write_glb(path, images):
    pos, nor, uv, col = [], [], [], []
    for p3, n3, colour in TRIS:
        g = norm(cross(sub(p3[1], p3[0]), sub(p3[2], p3[0])))
        for p, n in zip(p3, n3):
            pos.append(to_local(p))
            nor.append(norm(dir_to_local(n)))
            uv.append(uv_for(p, g))
            col.append(colour)
    count = len(pos)
    for u, v in uv:
        if not (0.0 <= u <= 1.0 and 0.0 <= v <= 1.0):
            raise SystemExit(f'uv out of range {u} {v}')

    blobs, views, accessors = bytearray(), [], []

    def add_view(data, target=None):
        while len(blobs) % 4:
            blobs.append(0)
        view = {'buffer': 0, 'byteOffset': len(blobs), 'byteLength': len(data)}
        if target:
            view['target'] = target
        blobs.extend(data)
        views.append(view)
        return len(views) - 1

    def add_float(rows, kind, minmax=False):
        width = len(rows[0])
        data = struct.pack(f'<{count * width}f', *[v for r in rows for v in r])
        acc = {'bufferView': add_view(data, 34962), 'componentType': 5126, 'count': count, 'type': kind}
        if minmax:
            floats = struct.unpack(f'<{count * width}f', data)
            acc['min'] = [min(floats[i::width]) for i in range(width)]
            acc['max'] = [max(floats[i::width]) for i in range(width)]
        accessors.append(acc)
        return len(accessors) - 1

    a_pos = add_float(pos, 'VEC3', minmax=True)
    a_nor = add_float(nor, 'VEC3')
    a_uv = add_float(uv, 'VEC2')
    a_col = add_float(col, 'VEC3')
    idx = struct.pack(f'<{count}H', *range(count))
    accessors.append({'bufferView': add_view(idx, 34963), 'componentType': 5123, 'count': count, 'type': 'SCALAR'})
    a_idx = len(accessors) - 1
    v_normal = add_view(images[NORMAL_NAME][0])
    v_orm = add_view(images[ORM_NAME][0])
    while len(blobs) % 4:
        blobs.append(0)

    gltf = {
        'asset': {
            'version': '2.0',
            'generator': 'MillOS scripts/blender/authored/fuel-pump-shell.py',
            'copyright': 'MillOS authored geometry (scripts/blender/authored/fuel-pump-shell.py)',
        },
        'scene': 0,
        'scenes': [{'name': SCENE_NAME, 'nodes': [0]}],
        'nodes': [{'name': NODE_NAME, 'mesh': 0, 'translation': NODE_TRANSLATION,
                   'rotation': NODE_ROTATION, 'scale': [NODE_SCALE] * 3}],
        'meshes': [{'name': MESH_NAME, 'primitives': [{
            'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, 'TEXCOORD_0': a_uv, 'COLOR_0': a_col},
            'indices': a_idx, 'material': 0, 'mode': 4}]}],
        'materials': [{
            'name': MATERIAL_NAME,
            'doubleSided': True,
            'pbrMetallicRoughness': {'metallicFactor': 0, 'metallicRoughnessTexture': {'index': 1}},
            'normalTexture': {'index': 0},
        }],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'textures': [{'source': 0, 'sampler': 0}, {'source': 1, 'sampler': 0}],
        'images': [{'name': NORMAL_NAME, 'bufferView': v_normal, 'mimeType': images[NORMAL_NAME][1]},
                   {'name': ORM_NAME, 'bufferView': v_orm, 'mimeType': images[ORM_NAME][1]}],
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': len(blobs)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blobs)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(blobs), 0x004E4942) + bytes(blobs))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) not in (1, 2):
        raise SystemExit('usage: Blender -b --factory-startup -P fuel-pump-shell.py -- <out.glb> [atlas-source.glb]')
    out_path = os.path.abspath(argv[0])
    repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
    # Default: the preserved pre-install delivery, so a plain re-run reproduces the accepted
    # bytes after the new GLB is installed (reading the live delivery would feed back on itself).
    atlas = os.path.abspath(argv[1]) if len(argv) == 2 else os.path.join(repo, 'assets', 'source', 'models', 'world', 'fuel-pump-shell-atlas-e24d2734.glb')
    images = read_atlas(atlas)
    build_plinth()
    build_body()
    build_neck()
    build_cap()
    if len(TRIS) > TRIANGLE_BUDGET:
        raise SystemExit(f'{len(TRIS)} triangles exceeds the {TRIANGLE_BUDGET}-triangle budget')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    write_glb(out_path, images)
    print(f'FUEL_PUMP_SHELL_WROTE {out_path} {os.path.getsize(out_path)} bytes, '
          f'{len(TRIS)} triangles, {len(TRIS) * 3} indices')


main()
