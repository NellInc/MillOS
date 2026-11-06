"""Yard guard shack body (world-yard-guard-shack-body), built from scratch in headless Blender.

What it builds
--------------
The gatehouse at both truck-yard entrances (TruckBay.tsx GuardShack, GLB placed
at x -0.089559436 inside the component group). Delivered at its final metric
size, 6.5791 W x 3.10 H x 3.50 D m, origin at the ground centre, three.js +Z =
front. Everything is authored in the component frame (the fallback primitives'
frame, TruckBay.tsx:2370-2401) and shifted by X_SHIFT on export, so the runtime
anchors can be read off directly. One node `Yard-guard-shack-bodyBody`, one
material (single-sided), one primitive.

Round 4 construction: punched openings framed by corner piers
--------------------------------------------------------------
* walls   each glazed face (front, +X, -X) is one U-shaped skin polygon at r 1.62:
          the lower wall (y 0 to 0.92) and two 0.38 m corner piers rising into the
          roof slab, round a full-height opening |c| <= 1.24. In the opening a
          sloped sill falls outward from the glazing plane, two jambs line the
          sides, and the glazing panel is set back (front 120 mm at z 1.50, so the
          runtime pane at z 1.51 and the SECURITY text at 1.52 sit just proud of it;
          sides 200 mm at x +-1.42, with the runtime panes at +-1.51 inside the
          reveal). The roof slab closes each opening head.
* back    one polygon at z -1.62 with the door notch; the reveal splays 60 mm and
          runs 0.25 m deep to the leaf, down to the ground (no step slab).
* roof    a slab: one soffit quad at y 2.85 (every wall part runs 20 mm up into
          it), a vertical fascia to 3.02, an 80 mm coping chamfer to the flat top
          at 3.10.
* post    a plain 150 mm square post up to 2.98, behind the sign, with a cap.
* sign    a vertical regular octagon facing +Z (flat top, 0.758 m across the
          flats), centred x -3, y 2.721, front face z 0.025. Its back is an
          eight-facet pyramid 85 mm deep at the centre, exported with flat -Z
          normals; it intersects the post.
* pedestal  the barrier cabinet, tapered from the 0.4 m footprint (x 2.8-3.2) to
          0.31 m at y 1.88, with a hipped cap to y 2.05. The runtime arm pivots
          at (3, 1.1, 0).

Triangle budget (contract 336 render vertices = 112 triangles):

  3 glazed walls x (U skin 6, sill 2, jambs 4, glazing 2)   42
  back wall with door notch                                   6
  door reveal (jambs, head) and leaf                          8
  roof: soffit 2, fascia 8, chamfer 8, top 2                 20
  pedestal sides and hipped cap                              12
  post (four sides, cap)                                     10
  sign front and pyramidal back                              14
  total                                                     112

Finer detail lives in the two allowed textures, one atlas laid out per face at
a constant texel density:

* base colour (JPEG): satin off-white cladding with seams, corner trims, an
  aluminium opening trim and a slate kick band; aluminium glazing units with
  mullions, transom and dark matte glass (the runtime panes cover the central
  lights), a light sign panel behind the SECURITY text, slate side spandrels; the steel door with vision panel, lever and kick plate; a
  slate soffit and fascia with a drip groove; a metal coping chamfer; a single-ply
  membrane roof with low-amplitude isotropic noise only; a red cabinet; a red sign face
  with a white border (the runtime prints STOP); a galvanised sign back with
  two stiffener rails; a slate post with a galvanised sleeve behind the sign.
* tangent-space normal map (JPEG) from height fields in metres.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-guard-shack-body.py -- <out.glb>

Re-runnable and deterministic (seeded noise). Writes only <out.glb>; textures
are staged in a temporary directory that is removed afterwards.
"""

import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
import numpy as np

NODE_NAME = 'Yard-guard-shack-bodyBody'
MESH_NAME = 'yard-guard-shack-body-mesh'
MATERIAL_NAME = 'yard-guard-shack-body-surface'
SCENE_NAME = 'MillOS_World_Yard-guard-shack-body'

MAX_TRIANGLES = 112
TEX = 512
SUPERSAMPLE = 2
GUTTER = 3
COLOUR_QUALITY = 78
NORMAL_QUALITY = 78
MAX_SLOPE = 1.2

# ---------------------------------------------------------------- dimensions (component frame)
R_O = 1.62                    # wall skin (booth 3.24 m square)
GLAZE_R = {'front': 1.50, 'px': 1.42, 'nx': 1.42}  # glazing plane in each opening
OPEN_C = 1.24                 # openings run |c| <= 1.24 along each glazed wall; piers 0.38 wide
SILL_OUT_Y, SILL_IN_Y = 0.92, 0.95  # sill at the skin and at the glazing plane (falls outward)
SOFFIT_Y = 2.85               # roof underside; the openings run up to it
WALL_TOP = 2.87               # every wall part runs 20 mm up into the roof slab
KICK_Y = 0.15
ROOF_H = 1.75
FASCIA_Y1, ROOF_Y1 = 3.02, 3.10
CHAMFER = 0.08                # coping chamfer: inset 80 mm over the top 80 mm
DOOR_X = 0.45                 # door leaf x +-0.45 on the back wall
DOOR_TOP = 2.25
DOOR_DEPTH = 0.25             # leaf set back from the wall face
DOOR_SPLAY = 0.06             # reveal splay: the opening is 60 mm wider/taller at the wall face
DOOR_DY = 0.0                 # door furniture offset (the leaf runs to the ground)
PED_X, PED_H, PED_H1, PED_Y1, PED_APEX = 3.0, 0.2, 0.155, 1.88, 2.05  # tapered cabinet
POST_X, POST_TOP = -3.0, 2.98
POST_HW = 0.075               # post 150 mm square
POST_ZF = 0.015               # post front face, 10 mm behind the sign face
POST_ZB = POST_ZF - 2 * POST_HW
SIGN_HALF = 0.3791192         # half across the flats; sets the -X extreme (width 6.5791192)
SIGN_R = SIGN_HALF / math.cos(math.pi / 8)
SIGN_CY = ROOF_Y1 - SIGN_HALF  # flat top level with the roof top
SIGN_Z1, SIGN_APEX_Z = 0.025, -0.06  # front face; apex of the pyramidal back (85 mm deep)

# Runtime glazing: panes 2 x 1.2 m centred on each wall, y 1.0-2.2 (|c| <= 1 along the wall).
GLASS_C = 1.0
GLASS_Y = (1.0, 2.2)
MULLION = 0.05
TRANSOM_Y = (2.2, 2.27)
SIGN_PANEL = (0.98, 2.31, 2.70)  # front transom: light panel behind the SECURITY text

# Component frame -> GLB frame: bounds centre (3.2 + -3.3791192) / 2 = -0.0895596.
X_SHIFT = 0.0895596
EXPECTED_BOUNDS = ((-3.2895596, 3.2895596), (0.0, 3.1), (-1.75, 1.75))  # GLB x, y, z

# Paint, sRGB 0-255.
WALL = np.array([214, 220, 228], np.float32)   # #e2e8f0 a touch down so sun does not clip it
TRIM = np.array([198, 205, 214], np.float32)
KICK = np.array([84, 92, 104], np.float32)
FRAME = np.array([62, 70, 82], np.float32)
ALU = np.array([150, 156, 164], np.float32)
GLASS_LO = np.array([22, 30, 42], np.float32)
GLASS_HI = np.array([72, 88, 106], np.float32)
SILL_C = np.array([158, 164, 170], np.float32)
PANEL = np.array([228, 233, 240], np.float32)
DOOR = np.array([55, 65, 81], np.float32)      # #374151
STEEL = np.array([170, 174, 178], np.float32)
PLINTH = np.array([116, 118, 120], np.float32)
ROOF = np.array([84, 96, 114], np.float32)
COPING = np.array([136, 147, 162], np.float32)
FASCIA = np.array([100, 116, 139], np.float32)  # #64748b
SOFFIT = np.array([88, 98, 112], np.float32)
RED = np.array([208, 40, 40], np.float32)       # #dc2626, a touch down
CAP = np.array([52, 57, 66], np.float32)
POST = np.array([100, 116, 139], np.float32)
SIGN_RED = np.array([196, 28, 32], np.float32)
WHITE = np.array([238, 238, 234], np.float32)
GALV = np.array([156, 162, 168], np.float32)
GRIME = np.array([104, 98, 88], np.float32)
BLACK = np.array([16, 18, 22], np.float32)
YELLOW = np.array([230, 184, 40], np.float32)

# Softened edges painted per part: (radius m, drop m). Walls, band, leaf and the roof
# top are handled explicitly instead, so split faces show no seam.
EDGE = {
    'sill': (0.012, 0.004), 'jamb': (0.010, 0.003), 'reveal': (0.012, 0.004),
    'fascia': (0.02, 0.006), 'chamfer': (0.012, 0.004), 'ped': (0.02, 0.006),
    'pedcap': (0.015, 0.004), 'post': (0.012, 0.004), 'sfront': (0.012, 0.004),
}


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


_LATTICE = np.random.default_rng(20261106).random((64, 64, 64)).astype(np.float32)


def noise3(p, cell, offset=0):
    """Seeded trilinear value noise over world metres (continuous across faces)."""
    g = p / cell + offset * 17.31
    i = np.floor(g).astype(np.int64)
    f = g - i
    f = f * f * (3 - 2 * f)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (np.where(dx, f[..., 0], 1 - f[..., 0]) * np.where(dy, f[..., 1], 1 - f[..., 1])
                     * np.where(dz, f[..., 2], 1 - f[..., 2]))
                out = out + w * _LATTICE[(i[..., 0] + dx) % 64, (i[..., 1] + dy) % 64, (i[..., 2] + dz) % 64]
    return out


def mix(rgb, colour, amount):
    a = np.clip(amount, 0.0, 1.0)[..., None]
    return rgb * (1 - a) + colour * a


def box_sdf(a, b, lo_a, hi_a, lo_b, hi_b, r=0.0):
    """Signed distance to a (rounded) rectangle in a 2D plane; negative inside."""
    ca, cb = (lo_a + hi_a) / 2, (lo_b + hi_b) / 2
    ha, hb = (hi_a - lo_a) / 2 - r, (hi_b - lo_b) / 2 - r
    qa, qb = np.abs(a - ca) - ha, np.abs(b - cb) - hb
    outside = np.sqrt(np.maximum(qa, 0) ** 2 + np.maximum(qb, 0) ** 2)
    return outside + np.minimum(np.maximum(qa, qb), 0) - r


def inside(sd, soft=0.002):
    return smoothstep(soft, -soft, sd)


def groove(d, width, depth):
    """Height of a groove centred on the zero line of distance field d."""
    return -depth * (1 - smoothstep(0, width / 2, np.abs(d)))


def dome(d, radius, height):
    t = np.clip(1 - (d / radius) ** 2, 0, 1)
    return height * np.sqrt(t)


def quarter_round(d, r):
    """Height of an eased edge: 0 beyond r, falling to -r * 0.35 at the edge (d = 0)."""
    d = np.clip(d, 0.0, r)
    return (np.sqrt(np.maximum(r * r - (r - d) ** 2, 0.0)) - r) * 0.35


# ---------------------------------------------------------------- geometry
FACES = []  # dicts: pts (k,3) component frame, part, tag, n, density, share


def add_face(pts, part, tag, outward, density=1.0, share=None):
    pts = np.array(pts, dtype=np.float64)
    n = np.zeros(3)
    for i in range(len(pts)):  # Newell normal
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    if np.dot(n, outward) < 0:
        pts = pts[::-1]
        n = -n
    n /= np.linalg.norm(n)
    FACES.append({'pts': pts, 'part': part, 'tag': tag, 'n': n, 'density': density, 'share': share})


UP = np.array([0.0, 1.0, 0.0])
# (outward n, a_dir) for the four sides; a_dir x up = n, so a runs left to right seen from outside.
SIDES = {
    'front': (np.array([0.0, 0.0, 1.0]), np.array([1.0, 0.0, 0.0])),
    'back': (np.array([0.0, 0.0, -1.0]), np.array([-1.0, 0.0, 0.0])),
    'px': (np.array([1.0, 0.0, 0.0]), np.array([0.0, 0.0, -1.0])),
    'nx': (np.array([-1.0, 0.0, 0.0]), np.array([0.0, 0.0, 1.0])),
}
for _n, _ad in SIDES.values():
    assert np.allclose(np.cross(_ad, UP), _n)


def side_quad(centre, n, ad, half_n, a0, a1, y0, y1):
    bl = centre + n * half_n + ad * a0 + UP * y0
    return [bl, centre + n * half_n + ad * a1 + UP * y0, centre + n * half_n + ad * a1 + UP * y1,
            centre + n * half_n + ad * a0 + UP * y1]


def side_point(tag, r, c, y):
    """Point on wall side `tag` at distance r from the centre, c along the wall (left to
    right seen from outside), height y."""
    n, ad = SIDES[tag]
    return n * r + ad * c + UP * y


def build_window_wall(tag):
    """One glazed wall: a U-shaped skin polygon (lower wall plus two corner piers) round a
    full-height opening, the sloped sill, two jambs and the glazing panel set back in the
    opening. The roof slab closes the opening head."""
    n, _ = SIDES[tag]
    rg = GLAZE_R[tag]
    oc = OPEN_C
    sp = lambda r, c, y: side_point(tag, r, c, y)
    add_face([sp(R_O, -R_O, 0.0), sp(R_O, R_O, 0.0), sp(R_O, R_O, WALL_TOP), sp(R_O, oc, WALL_TOP),
              sp(R_O, oc, SILL_OUT_Y), sp(R_O, -oc, SILL_OUT_Y), sp(R_O, -oc, WALL_TOP),
              sp(R_O, -R_O, WALL_TOP)], 'wall', tag, n)
    o_r, o_y = profile_outward(rg, SILL_IN_Y, R_O, SILL_OUT_Y)
    add_face([sp(rg, -oc, SILL_IN_Y), sp(rg, oc, SILL_IN_Y), sp(R_O, oc, SILL_OUT_Y), sp(R_O, -oc, SILL_OUT_Y)],
             'sill', tag, n * abs(o_r) + UP * abs(o_y), density=1.5, share='sill-' + ('f' if tag == 'front' else 's'))
    for sc in (-1, 1):
        c = sc * oc
        add_face([sp(rg, c, SILL_IN_Y), sp(R_O, c, SILL_OUT_Y), sp(R_O, c, WALL_TOP), sp(rg, c, WALL_TOP)],
                 'jamb', tag, -sc * SIDES[tag][1], density=1.5,
                 share='jamb-' + ('f' if tag == 'front' else 's'))
    add_face([sp(rg, -oc, SILL_IN_Y), sp(rg, oc, SILL_IN_Y), sp(rg, oc, WALL_TOP), sp(rg, -oc, WALL_TOP)],
             'glaze', tag, n)


def profile_outward(r0, y0, r1, y1):
    dr, dy = r1 - r0, y1 - y0
    v = np.array([dy, -dr])
    return v / np.linalg.norm(v)


def build_booth():
    for tag in ('front', 'px', 'nx'):
        build_window_wall(tag)
    zw = -R_O
    # Back wall: one polygon with the door notch, up into the roof slab.
    ox = DOOR_X + DOOR_SPLAY
    otop = DOOR_TOP + DOOR_SPLAY
    add_face([(R_O, 0.0, zw), (ox, 0.0, zw), (ox, otop, zw), (-ox, otop, zw), (-ox, 0.0, zw),
              (-R_O, 0.0, zw), (-R_O, WALL_TOP, zw), (R_O, WALL_TOP, zw)], 'back', 'back', (0, 0, -1))
    # Door: splayed reveal 0.25 m deep to the leaf; the reveal runs to the ground.
    zl = zw + DOOR_DEPTH
    add_face([(DOOR_X, 0.0, zl), (-DOOR_X, 0.0, zl), (-DOOR_X, DOOR_TOP, zl), (DOOR_X, DOOR_TOP, zl)],
             'leaf', 'leaf', (0, 0, -1))
    for sx in (-1, 1):
        add_face([(sx * ox, 0.0, zw), (sx * DOOR_X, 0.0, zl), (sx * DOOR_X, DOOR_TOP, zl),
                  (sx * ox, otop, zw)], 'reveal', 'jamb', (-sx, 0, -0.6), density=1.5)
    add_face([(ox, otop, zw), (-ox, otop, zw), (-DOOR_X, DOOR_TOP, zl), (DOOR_X, DOOR_TOP, zl)],
             'reveal', 'head', (0, -1, -0.6), density=1.5)


def build_roof():
    """Slab: one soffit quad (the walls run 20 mm up into it), a vertical fascia ring, a
    chamfered coping ring, and the flat top."""
    r, ri = ROOF_H, ROOF_H - CHAMFER
    add_face([(-r, SOFFIT_Y, -r), (r, SOFFIT_Y, -r), (r, SOFFIT_Y, r), (-r, SOFFIT_Y, r)],
             'soffit', 'soffit', (0, -1, 0), density=0.4)
    for n, ad in SIDES.values():
        add_face(side_quad(np.zeros(3), n, ad, r, -r, r, SOFFIT_Y, FASCIA_Y1),
                 'fascia', 'fascia', n, density=1.25, share='fascia')
        add_face([n * r - ad * r + UP * FASCIA_Y1, n * r + ad * r + UP * FASCIA_Y1,
                  n * ri + ad * ri + UP * ROOF_Y1, n * ri - ad * ri + UP * ROOF_Y1],
                 'chamfer', 'chamfer', n + UP, density=1.25, share='chamfer')
    add_face([(-ri, ROOF_Y1, -ri), (-ri, ROOF_Y1, ri), (ri, ROOF_Y1, ri), (ri, ROOF_Y1, -ri)],
             'rtop', 'top', (0, 1, 0), density=0.5)


def build_pedestal():
    c = np.array([PED_X, 0.0, 0.0])
    apex = np.array([PED_X, PED_APEX, 0.0])
    h0, h1 = PED_H, PED_H1
    for name, (n, ad) in SIDES.items():
        # Tapered: full 0.4 m footprint on the ground (x 3.2 holds the +X extreme), 0.31 m at the cap.
        add_face([c + n * h0 - ad * h0, c + n * h0 + ad * h0, c + n * h1 + ad * h1 + UP * PED_Y1,
                  c + n * h1 - ad * h1 + UP * PED_Y1], 'ped', name, n, density=1.4)
        add_face([c + n * h1 - ad * h1 + UP * PED_Y1, c + n * h1 + ad * h1 + UP * PED_Y1, apex],
                 'pedcap', 'cap', n + UP, density=1.4, share='pedcap')


def build_post():
    """A plain 150 mm square post that runs up behind the sign to 0.12 m under its top.
    The sign's pyramidal back intersects it, so the two read as one fixing."""
    xs, h = POST_X, POST_HW
    yt = POST_TOP
    add_face([(xs - h, 0.0, POST_ZF), (xs + h, 0.0, POST_ZF), (xs + h, yt, POST_ZF), (xs - h, yt, POST_ZF)],
             'post', 'front', (0, 0, 1))
    add_face([(xs + h, 0.0, POST_ZB), (xs - h, 0.0, POST_ZB), (xs - h, yt, POST_ZB), (xs + h, yt, POST_ZB)],
             'post', 'back', (0, 0, -1))
    for sx in (-1, 1):
        add_face([(xs + sx * h, 0.0, POST_ZF), (xs + sx * h, 0.0, POST_ZB), (xs + sx * h, yt, POST_ZB),
                  (xs + sx * h, yt, POST_ZF)], 'post', 'side', (sx, 0, 0), share='post-side')
    add_face([(xs - h, yt, POST_ZF), (xs + h, yt, POST_ZF), (xs + h, yt, POST_ZB), (xs - h, yt, POST_ZB)],
             'post', 'cap', (0, 1, 0))


def sign_ring():
    ang = [math.pi / 8 + k * math.pi / 4 for k in range(8)]  # flat top
    return [(POST_X + SIGN_R * math.cos(t), SIGN_CY + SIGN_R * math.sin(t)) for t in ang]


def build_sign():
    """Flat front; the back is an eight-facet pyramid 85 mm deep at the centre that is
    exported with flat -Z normals, so it shades as a plate but has depth edge-on."""
    ring = sign_ring()
    add_face([(x, y, SIGN_Z1) for x, y in ring], 'sfront', 'front', (0, 0, 1), density=2.0)
    apex = (POST_X, SIGN_CY, SIGN_APEX_Z)
    for k in range(8):
        (ax, ay), (bx, by) = ring[k], ring[(k + 1) % 8]
        add_face([(ax, ay, SIGN_Z1), (bx, by, SIGN_Z1), apex], 'sback', 'back', (0, 0, -1), density=1.0)
        FACES[-1]['normal_override'] = np.array([0.0, 0.0, -1.0])


def build_geometry():
    counts = {}
    for name, fn in (('booth', build_booth), ('roof', build_roof), ('pedestal', build_pedestal),
                     ('post', build_post), ('sign', build_sign)):
        before = triangle_count()
        fn()
        counts[name] = triangle_count() - before
    expect = {'booth': 56, 'roof': 20, 'pedestal': 12, 'post': 10, 'sign': 14}
    assert counts == expect, counts
    return counts


def triangle_count():
    return sum(len(f['pts']) - 2 for f in FACES)


# ---------------------------------------------------------------- atlas layout
def face_frame(f):
    n = f['n']
    v = UP - n * np.dot(UP, n)
    if np.linalg.norm(v) < 1e-6:  # horizontal face: v runs toward the back
        v = np.array([0.0, 0.0, -1.0]) if n[1] > 0 else np.array([0.0, 0.0, 1.0])
    v /= np.linalg.norm(v)
    u = np.cross(v, n)
    u /= np.linalg.norm(u)
    p0 = f['pts'][0]
    lu = (f['pts'] - p0) @ u
    lv = (f['pts'] - p0) @ v
    f['U'], f['V'] = u, v
    f['origin'] = p0 + u * lu.min() + v * lv.min()
    f['size'] = (lu.max() - lu.min(), lv.max() - lv.min())


def owners():
    """Faces that own a rect: every unshared face and the first face of each share group."""
    seen, out = set(), []
    for f in FACES:
        if f['share'] is None or f['share'] not in seen:
            out.append(f)
            if f['share'] is not None:
                seen.add(f['share'])
    return out


def pack(density):
    items = sorted(owners(), key=lambda f: -f['size'][1] / (density / f['density']))
    x = y = shelf = 0
    for f in items:
        d = density / f['density']
        w = int(math.ceil(f['size'][0] / d)) + 2 * GUTTER
        h = int(math.ceil(f['size'][1] / d)) + 2 * GUTTER
        if w > TEX:
            return False
        if x + w > TEX:
            x, y, shelf = 0, y + shelf, 0
        if y + h > TEX:
            return False
        f['rect'] = (x, y, w, h)
        f['d'] = d
        x += w
        shelf = max(shelf, h)
    return True


def layout():
    for f in FACES:
        face_frame(f)
    density = 0.0220  # floor: finer packs overflow the 50 KB file budget
    while not pack(density):
        density *= 1.02
    groups = {}
    for f in owners():
        if f['share'] is not None:
            groups[f['share']] = f
    for f in FACES:
        if f['share'] is not None and groups[f['share']] is not f:
            src = groups[f['share']]
            assert np.allclose(f['size'], src['size'], atol=1e-6), (f['share'], f['size'], src['size'])
            f['rect'], f['d'] = src['rect'], src['d']
    return density


# ---------------------------------------------------------------- painting
def edge_distance(f, lu, lv):
    """Distance (metres) from a texel to the face's polygon boundary, positive inside."""
    pts = f['pts']
    pu = (pts - f['origin']) @ f['U']
    pv = (pts - f['origin']) @ f['V']
    d = np.full(lu.shape, np.inf)
    ins = np.zeros(lu.shape, bool)
    k = len(pts)
    for i in range(k):
        au, av, bu, bv = pu[i], pv[i], pu[(i + 1) % k], pv[(i + 1) % k]
        eu, ev = bu - au, bv - av
        t = np.clip(((lu - au) * eu + (lv - av) * ev) / (eu * eu + ev * ev), 0, 1)
        d = np.minimum(d, np.hypot(lu - au - t * eu, lv - av - t * ev))
        crosses = ((av > lv) != (bv > lv)) & (lu < au + (lv - av) * eu / np.where(ev == 0, 1e-12, ev))
        ins ^= crosses
    return np.where(ins, d, -d)


def eave(rgb, y):
    """Smooth occlusion under the roof overhang, so the top of a wall reads as shaded."""
    e = np.clip((y - 2.35) / (SOFFIT_Y - 2.35), 0.0, 1.0)
    return rgb * (1 - 0.26 * e ** 1.6)[..., None]


def wall_coord(tag, x, z):
    """Metres along a wall, left to right seen from outside, from the skin corner."""
    if tag == 'front':
        return x + R_O
    if tag == 'px':
        return R_O - z
    if tag == 'nx':
        return z + R_O
    return R_O - x  # back


def along(tag, x, z):
    """Signed position c along a glazed wall, 0 at its centre."""
    return wall_coord(tag, x, z) - R_O


def cladding(a, y, length, mottle, grime_n, seams, seam_top):
    """Off-white cladding: corner trims, seams, slate kick band, splash grime."""
    h = np.zeros(a.shape)
    rgb = WALL * (1 + (mottle - 1) * 0.5)[..., None]
    edge = np.minimum(a, length - a)
    trim = 1 - smoothstep(0.035, 0.04, edge)
    rgb = mix(rgb, TRIM * (1 + (mottle - 1) * 0.5)[..., None], trim)
    h += 0.004 * trim + quarter_round(edge, 0.015)
    h += groove(edge - 0.04, 0.008, 0.003)
    lines = np.full(a.shape, np.inf)
    for s in seams:
        lines = np.minimum(lines, np.where((y > KICK_Y) & (y < seam_top), np.abs(a - s), np.inf))
    h += groove(lines, 0.008, 0.004)
    rgb *= (1 - 0.28 * (1 - smoothstep(0.003, 0.008, lines)))[..., None]
    kick = 1 - smoothstep(KICK_Y - 0.004, KICK_Y + 0.004, y)
    h += groove(np.where(edge > 0.04, y - KICK_Y, np.inf), 0.010, 0.004)
    rgb = mix(rgb, KICK * (1 + (mottle - 1) * 0.8)[..., None], kick)
    splash = (1 - smoothstep(KICK_Y, KICK_Y + 0.40, y)) * (1 - kick) * (0.10 + 0.12 * grime_n)
    rgb = mix(rgb, GRIME, splash)
    rgb = mix(rgb, GRIME * 0.75, (1 - smoothstep(0.0, 0.05, y)) * (0.25 + 0.2 * grime_n))
    return rgb, h


def paint_wall(tag, x, y, z, mottle, grime_n):
    """A glazed wall's skin: lower wall and two corner piers round the opening. An
    aluminium edge trim lines the opening; a shadow line sits under the sill."""
    length = 2 * R_O
    a = wall_coord(tag, x, z)
    c = a - R_O
    rgb, h = cladding(a, y, length, mottle, grime_n, (R_O,), SILL_OUT_Y)
    # Horizontal joint across each pier at the transom line.
    pj = np.where(np.abs(c) > OPEN_C + 0.04, np.abs(y - 2.27), np.inf)
    h += groove(pj, 0.008, 0.004)
    rgb *= (1 - 0.25 * (1 - smoothstep(0.003, 0.008, pj)))[..., None]
    # Distance to the opening edge (positive outside the opening, on the wall).
    sd = box_sdf(c, y, -OPEN_C, OPEN_C, SILL_OUT_Y, SOFFIT_Y + 1.0)
    trim = 1 - smoothstep(0.045, 0.05, sd)
    rgb = mix(rgb, ALU * (1 + (mottle - 1) * 0.6)[..., None], trim)
    h += 0.004 * trim + quarter_round(np.maximum(sd, 0), 0.012) + groove(sd - 0.05, 0.008, 0.003)
    # Shadow line under the sill nose, faint run-off below the opening corners.
    under = (np.abs(c) < OPEN_C + 0.05) * (1 - smoothstep(0.0, 0.05, SILL_OUT_Y - 0.05 - y)) * (y < SILL_OUT_Y - 0.045)
    rgb *= (1 - 0.28 * under)[..., None]
    below = smoothstep(SILL_OUT_Y - 0.6, SILL_OUT_Y, y) * (y < SILL_OUT_Y)
    for cx in (-OPEN_C, OPEN_C):
        rgb = mix(rgb, GRIME, np.clip(1 - np.abs(c - cx) / 0.06, 0, 1) * below * 0.10)
    return eave(rgb, y), h


def paint_glaze(tag, x, y, z, mottle, lu, lv, f):
    """The glazing unit set back in an opening: aluminium frame, dark matte glass (the
    runtime panes cover |c| <= 1, y 1.0-2.2), and on the front a light sign panel above
    the transom behind the SECURITY text."""
    c = along(tag, x, z)
    h = np.zeros(x.shape)
    gv = np.clip((y - GLASS_Y[0]) / (GLASS_Y[1] - GLASS_Y[0]), 0, 1)
    rgb = GLASS_LO + (GLASS_HI - GLASS_LO) * np.clip(gv ** 1.5, 0, 1)[..., None] * 0.8
    # A desk edge and a seated-height shelf seen through the central lights.
    desk = inside(box_sdf(c, y, -GLASS_C, GLASS_C, GLASS_Y[0], GLASS_Y[0] + 0.08), 0.004) * 0.5
    rgb = mix(rgb, GLASS_LO * 0.6, desk)
    oc = OPEN_C
    members = [
        (SILL_IN_Y - 0.01, GLASS_Y[0]),        # bottom rail
        (TRANSOM_Y[0], TRANSOM_Y[1]),          # transom
        (SOFFIT_Y - 0.06, WALL_TOP + 0.01),    # head rail
    ]
    frame = np.zeros(x.shape)
    for y0, y1 in members:
        frame = np.maximum(frame, inside(box_sdf(c, y, -oc - 0.1, oc + 0.1, y0, y1), 0.002))
    for cx in (-GLASS_C - MULLION / 2, GLASS_C + MULLION / 2):
        frame = np.maximum(frame, inside(box_sdf(c, y, cx - MULLION / 2, cx + MULLION / 2, SILL_IN_Y, WALL_TOP), 0.002))
    for cx in (-oc, oc):
        frame = np.maximum(frame, inside(box_sdf(c, y, cx - 0.06, cx + 0.06, SILL_IN_Y, WALL_TOP), 0.002))
    if tag == 'front':
        w, p0, p1 = SIGN_PANEL
        panel = inside(box_sdf(c, y, -w, w, p0, p1), 0.002)
        rgb = mix(rgb, PANEL * (1 + (mottle - 1) * 0.4)[..., None], panel)
        rim = inside(box_sdf(c, y, -w, w, p0, p1), 0.002) - inside(box_sdf(c, y, -w + 0.012, w - 0.012,
                                                                              p0 + 0.012, p1 - 0.012), 0.002)
        rgb = mix(rgb, np.array([30, 64, 175], np.float32), np.clip(rim, 0, 1) * 0.9)
        h += 0.006 * panel
        for bx in (-w + 0.03, w - 0.03):
            for by in (p0 + 0.03, p1 - 0.03):
                h += dome(np.hypot(c - bx, y - by), 0.007, 0.002)
                rgb = mix(rgb, STEEL, smoothstep(0.006, 0.004, np.hypot(c - bx, y - by)))
    else:
        # Slate spandrel panel above the transom on the sides (no runtime pane there).
        sp = inside(box_sdf(c, y, -oc, oc, TRANSOM_Y[1], SOFFIT_Y - 0.06), 0.002)
        rgb = mix(rgb, FASCIA * 0.8 * (1 + (mottle - 1) * 0.6)[..., None], sp)
    shade = ALU * (1 + (mottle - 1) * 0.6)[..., None]
    rgb = mix(rgb, shade, frame)
    h += 0.012 * frame - 0.006 * (1 - frame)
    # Cavity occlusion: the reveal and the roof slab shade the glazing near its edges.
    ed = edge_distance(f, lu, lv)
    rgb *= (1 - 0.32 * (1 - smoothstep(0.0, 0.16, ed)))[..., None]
    rgb *= (1 - 0.18 * smoothstep(2.3, SOFFIT_Y, y))[..., None]
    return rgb, h


def paint_back(x, y, mottle, grime_n):
    a = R_O - x
    length = 2 * R_O
    rgb, h = cladding(a, y, length, mottle, grime_n, (0.62, length - 0.62), 2.55)
    ox = DOOR_X + DOOR_SPLAY
    otop = DOOR_TOP + DOOR_SPLAY
    door = box_sdf(a, y, R_O - ox - 0.05, R_O + ox + 0.05, -0.2, otop + 0.05)
    frame = np.clip(inside(door, 0.003), 0, 1)
    rgb = mix(rgb, FRAME, frame)
    h += 0.012 * frame
    # A horizontal panel joint over the door line.
    hj = np.where((np.abs(a - R_O) > ox + 0.07) & (a > 0.05) & (a < length - 0.05), np.abs(y - 2.55), np.inf)
    h += groove(hj, 0.008, 0.004)
    rgb *= (1 - 0.28 * (1 - smoothstep(0.003, 0.008, hj)))[..., None]
    # Small mounted permit plate beside the door.
    px0, px1 = 2.40, 2.70
    plate = inside(box_sdf(a, y, px0, px1, 1.45, 1.65, 0.01), 0.002)
    rgb = mix(rgb, np.array([226, 230, 236], np.float32), plate)
    rgb = mix(rgb, np.array([30, 64, 175], np.float32), inside(box_sdf(a, y, px0 + 0.02, px1 - 0.02, 1.59, 1.63), 0.0015))
    for ly in (1.53, 1.495):
        rgb = mix(rgb, KICK, inside(box_sdf(a, y, px0 + 0.03, px1 - 0.08 - (1.53 - ly) * 2, ly - 0.007, ly + 0.007), 0.0015))
    h += 0.004 * plate
    for bx in (px0 + 0.02, px1 - 0.02):
        for by in (1.47, 1.63):
            h += dome(np.hypot(a - bx, y - by), 0.008, 0.002)
    return eave(rgb, y), h


def paint(f, P, lu, lv):
    part, tag = f['part'], f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    mottle = 1.0 + (noise3(P, 0.35) - 0.5) * 0.05 + (noise3(P, 0.05, 3) - 0.5) * 0.02
    grime_n = noise3(P, 0.2, 5)
    h = np.zeros(x.shape)

    if part in ('back', 'wall'):
        calm = smoothstep(2.35, 2.65, y)
        mottle = mottle * (1 - calm) + calm
    if part == 'wall':
        rgb, h = paint_wall(tag, x, y, z, mottle, grime_n)
    elif part == 'glaze':
        rgb, h = paint_glaze(tag, x, y, z, mottle, lu, lv, f)
    elif part == 'sill':
        rgb = SILL_C * (1 + (mottle - 1) * 0.8)[..., None]
        rgb = mix(rgb, GRIME * 0.9, 0.05 + 0.06 * grime_n)
        # Drip nose along the outer edge (lv runs from the outer, lower edge inward).
        nose = 1 - smoothstep(0.012, 0.018, lv)
        rgb *= (1 + 0.08 * nose)[..., None]
        h += 0.002 * nose
    elif part == 'jamb':
        # Aluminium reveal lining, shaded towards the roof slab.
        rgb = ALU * 0.92 * (1 + (mottle - 1) * 0.6)[..., None]
        rgb *= (1 - 0.28 * smoothstep(2.2, SOFFIT_Y, y))[..., None]
    elif part == 'back':
        rgb, h = paint_back(x, y, mottle, grime_n)
    elif part == 'leaf':
        a = R_O - x
        l0, l1 = R_O - DOOR_X, R_O + DOOR_X
        dy = DOOR_DY
        y0 = 0.0
        rgb = DOOR * (1 + (mottle - 1) * 0.8)[..., None]
        gap = box_sdf(a, y, l0 + 0.012, l1 - 0.012, y0 + 0.012, DOOR_TOP - 0.012)
        h += groove(gap, 0.008, 0.004)
        rgb *= (1 - 0.45 * (1 - smoothstep(0.0, 0.006, np.abs(gap))))[..., None]
        panel = box_sdf(a, y, l0 + 0.10, l1 - 0.10, 0.50 + dy, 1.28 + dy, 0.01)
        h += groove(panel, 0.010, 0.003)
        rgb *= (1 - 0.25 * (1 - smoothstep(0.0, 0.006, np.abs(panel))))[..., None]
        vc = R_O
        vis_frame = inside(box_sdf(a, y, vc - 0.21, vc + 0.21, 1.42 + dy, 1.94 + dy, 0.01), 0.002)
        vis = inside(box_sdf(a, y, vc - 0.18, vc + 0.18, 1.45 + dy, 1.91 + dy, 0.006), 0.002)
        gv = np.clip((y - 1.45 - dy) / 0.46, 0, 1)
        rgb = mix(rgb, STEEL * 0.75, np.clip(vis_frame - vis, 0, 1))
        rgb = mix(rgb, GLASS_LO + (GLASS_HI - GLASS_LO) * (gv ** 1.4)[..., None], vis)
        h += 0.004 * np.clip(vis_frame - vis, 0, 1) - 0.006 * vis
        lx = l1 - 0.09
        back_plate = inside(box_sdf(a, y, lx - 0.022, lx + 0.022, 0.95 + dy, 1.20 + dy, 0.008), 0.002)
        lever = inside(box_sdf(a, y, lx - 0.13, lx + 0.012, 1.075 + dy, 1.105 + dy, 0.012), 0.002)
        rgb = mix(rgb, STEEL, np.maximum(back_plate, lever))
        h += 0.004 * back_plate + 0.03 * lever
        rgb *= (1 - 0.3 * inside(box_sdf(a, y + 0.03, lx - 0.13, lx + 0.012, 1.075 + dy, 1.105 + dy, 0.012), 0.006)
                * (1 - lever))[..., None]
        kp = inside(box_sdf(a, y, l0 + 0.03, l1 - 0.03, y0, 0.32 + dy), 0.002)
        rgb = mix(rgb, STEEL * 0.92 * (1 + (mottle - 1) * 2)[..., None], kp)
        h += 0.002 * kp
        for hy in (0.35, 1.10, 1.85):
            k = inside(box_sdf(a, y, l0, l0 + 0.02, hy + dy - 0.06, hy + dy + 0.06, 0.005), 0.002)
            rgb = mix(rgb, STEEL * 0.8, k)
            h += 0.004 * k
        rgb = mix(rgb, GRIME * 0.7, (1 - smoothstep(y0, y0 + 0.3, y)) * 0.18)
        # The reveal shades the leaf near its edges.
        rgb *= (1 - 0.25 * (1 - smoothstep(0.0, 0.14, -gap)))[..., None]
    elif part == 'reveal':
        rgb = FRAME * mottle[..., None]
        rgb = mix(rgb, GRIME * 0.6, (1 - smoothstep(0.0, 0.25, y)) * 0.25)
    elif part == 'soffit':
        rgb = SOFFIT * mottle[..., None]
        r = np.maximum(np.abs(x), np.abs(z))
        # Occlusion where the slab meets the wall skin; a drip groove near the edge.
        rgb *= (1 - 0.30 * (1 - smoothstep(R_O, R_O + 0.08, r)))[..., None]
        h += groove(r - (ROOF_H - 0.03), 0.008, 0.004)
        rgb *= (1 - 0.3 * (1 - smoothstep(0.002, 0.006, np.abs(r - (ROOF_H - 0.03)))))[..., None]
    elif part == 'fascia':
        rgb = FASCIA * mottle[..., None]
        h += groove(lv - 0.022, 0.008, 0.003)
        rgb *= (1 - 0.3 * (1 - smoothstep(0.002, 0.006, np.abs(lv - 0.022))))[..., None]
    elif part == 'chamfer':
        rgb = COPING * (1 + (mottle - 1) * 0.6)[..., None]
        # Lap joints of the coping run perpendicular to the edge, every 1.2 m.
    elif part == 'rtop':
        # Single-ply membrane: low-amplitude isotropic noise only (no laps, no outlet), a
        # light occlusion band inside the coping.
        d = (ROOF_H - CHAMFER) - np.maximum(np.abs(x), np.abs(z))
        fine = (noise3(P, 0.4, 31) - 0.5) * 0.03 + (noise3(P, 0.08, 33) - 0.5) * 0.01
        rgb = ROOF * (1 + fine)[..., None]
        rgb *= (1 - 0.06 * (1 - smoothstep(0.0, 0.20, d)))[..., None]
        h += quarter_round(d, 0.02)
    elif part == 'ped':
        a = lu
        rgb = RED * (1 + (mottle - 1) * 0.9)[..., None]
        foot = 1 - smoothstep(0.075, 0.08, y)
        cap = smoothstep(1.775, 1.78, y)
        h += groove(y - 0.08, 0.008, 0.003) + groove(y - 1.78, 0.008, 0.003)
        rgb = mix(rgb, BLACK * 2.2 * mottle[..., None], foot)
        rgb = mix(rgb, CAP * mottle[..., None], cap)
        rgb = mix(rgb, GRIME * 0.8, (1 - smoothstep(0.08, 0.45, y)) * (1 - foot) * (0.18 + 0.15 * grime_n))
        if tag == 'px':
            plate = box_sdf(a, y, 0.06, 0.34, 0.96, 1.24, 0.02)
            rgb = mix(rgb, STEEL * 0.62, inside(plate))
            h += 0.006 * inside(plate, 0.004)
            hub = np.hypot(a - 0.2, y - 1.1)
            rgb = mix(rgb, STEEL * 0.85, smoothstep(0.064, 0.058, hub))
            rgb = mix(rgb, BLACK * 1.5, smoothstep(0.022, 0.018, hub))
            h += dome(hub, 0.062, 0.012)
            for bx in (0.09, 0.31):
                for by in (0.99, 1.21):
                    d = np.hypot(a - bx, y - by)
                    rgb = mix(rgb, STEEL, smoothstep(0.010, 0.008, d))
                    h += dome(d, 0.009, 0.003)
        elif tag == 'nx':
            hatch = box_sdf(a, y, 0.05, 0.35, 0.22, 1.55, 0.015)
            h += groove(hatch, 0.008, 0.004)
            rgb *= (1 - 0.4 * (1 - smoothstep(0.0, 0.005, np.abs(hatch))))[..., None]
            d = np.hypot(a - 0.30, y - 1.18)
            rgb = mix(rgb, STEEL, smoothstep(0.016, 0.013, d))
            rgb = mix(rgb, BLACK, (np.abs(a - 0.30) < 0.003) * (d < 0.010))
            h += dome(d, 0.015, 0.004)
            label = box_sdf(a, y, 0.11, 0.29, 1.30, 1.44, 0.006)
            stripes = (np.floor((a + y) / 0.03) % 2 == 0)
            rgb = mix(rgb, np.where(stripes[..., None], YELLOW, BLACK * 1.5), inside(label, 0.0015))
        else:
            for vy in np.arange(1.56, 1.74, 0.03):
                sd = box_sdf(a, y, 0.08, 0.32, vy - 0.006, vy + 0.006, 0.006)
                rgb = mix(rgb, BLACK * 1.8, inside(sd, 0.0015) * 0.85)
                h += groove(sd + 0.006, 0.014, 0.004) * (sd < 0.006)
    elif part == 'pedcap':
        rgb = CAP * mottle[..., None]
        rgb = mix(rgb, GRIME * 0.8, 0.12 + 0.1 * grime_n)
    elif part == 'post':
        rgb = POST * (1 + (mottle - 1) * 1.2)[..., None]
        rgb = mix(rgb, GRIME * 0.7, (1 - smoothstep(0.0, 0.35, y)) * (0.25 + 0.2 * grime_n))
        # Galvanised sleeve where the post meets the sign, base flange at the foot.
        sleeve = smoothstep(SIGN_CY - SIGN_HALF - 0.12, SIGN_CY - SIGN_HALF - 0.11, y)
        rgb = mix(rgb, GALV * (1 + (mottle - 1) * 0.8)[..., None], sleeve)
        h += groove(y - (SIGN_CY - SIGN_HALF - 0.115), 0.010, 0.003)
        flange = 1 - smoothstep(0.035, 0.04, y)
        rgb = mix(rgb, GALV * 0.75 * mottle[..., None], flange)
        h += 0.003 * flange
        if tag == 'back':
            for by in (SIGN_CY - 0.25, SIGN_CY - 0.05):
                d = np.hypot(x - POST_X, y - by)
                rgb = mix(rgb, STEEL * 1.05, smoothstep(0.016, 0.013, d))
                h += dome(d, 0.016, 0.006)
    elif part == 'sfront':
        ed = edge_distance(f, lu, lv)
        rgb = SIGN_RED * (1 + (mottle - 1) * 0.6)[..., None]
        border = smoothstep(0.016, 0.019, ed) * (1 - smoothstep(0.040, 0.043, ed))
        rgb = mix(rgb, WHITE, border)
        rgb *= (1 + 0.03 * (noise3(P, 0.01, 17) - 0.5))[..., None]
    elif part == 'sback':
        rgb = GALV * (1 + (mottle - 1) * 1.4)[..., None]
        rgb *= (1 + 0.05 * (noise3(np.stack([x * 30, y * 0.6, z], -1), 1.0, 19) - 0.5))[..., None]
        # Two horizontal stiffener rails with rivets, and the rim lip round the edge.
        for ry in (SIGN_CY - 0.17, SIGN_CY + 0.17):
            rail = inside(box_sdf(x, y, POST_X - 0.30, POST_X + 0.30, ry - 0.022, ry + 0.022, 0.004), 0.002)
            rgb = mix(rgb, GALV * 0.78, rail)
            h += 0.008 * rail
            for rx in (-0.25, -0.12, 0.12, 0.25):
                d = np.hypot(x - POST_X - rx, y - ry)
                rgb = mix(rgb, STEEL * 1.08, smoothstep(0.008, 0.006, d))
                h += dome(d, 0.007, 0.003)
        ring_d = SIGN_HALF - np.maximum.reduce([np.abs((x - POST_X) * math.cos(t) + (y - SIGN_CY) * math.sin(t))
                                                 for t in (0, math.pi / 4, math.pi / 2, 3 * math.pi / 4)])
        lip = 1 - smoothstep(0.018, 0.024, ring_d)
        rgb *= (1 - 0.10 * lip)[..., None]
        h += groove(ring_d - 0.024, 0.008, 0.003)
    else:
        rgb = np.broadcast_to(np.array([255, 0, 255], np.float32), x.shape + (3,)).copy()

    if part in EDGE:
        er, drop = EDGE[part]
        ed = edge_distance(f, lu, lv)
        roll = 1 - smoothstep(0.0, er, np.maximum(ed, 0))
        h -= drop * roll ** 2
        rgb = rgb * (1 + 0.06 * roll)[..., None]
    return np.clip(rgb, 0, 255), h


def build_textures():
    colour = np.zeros((TEX, TEX, 3), np.float32)
    normal = np.zeros((TEX, TEX, 3), np.float32)
    colour[...] = 128
    normal[..., 2] = 1.0
    s = SUPERSAMPLE
    for f in owners():
        rx, ry, w, h = f['rect']
        d = f['d']
        ju = (np.arange(w * s) + 0.5) / s - GUTTER
        jv = (np.arange(h * s) + 0.5) / s - GUTTER
        lu, lv = np.meshgrid(ju * d, jv * d)
        P = f['origin'] + lu[..., None] * f['U'] + lv[..., None] * f['V']
        rgb, hgt = paint(f, P, lu, lv)
        step = d / s
        dh_du = np.gradient(hgt, step, axis=1)
        dh_dv = np.gradient(hgt, step, axis=0)
        mag = np.sqrt(dh_du ** 2 + dh_dv ** 2)
        k = np.where(mag > MAX_SLOPE, MAX_SLOPE / np.maximum(mag, 1e-9), 1.0)
        n = np.stack([-dh_du * k, -dh_dv * k, np.ones_like(hgt)], axis=-1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        rgb = rgb.reshape(h, s, w, s, 3).mean(axis=(1, 3))
        n = n.reshape(h, s, w, s, 3).mean(axis=(1, 3))
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        colour[ry:ry + h, rx:rx + w] = rgb
        normal[ry:ry + h, rx:rx + w] = n
    colour_px = np.clip(np.round(colour), 0, 255).astype(np.uint8)
    normal_px = np.clip(np.round((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    return colour_px, normal_px


def write_jpeg(path, rgb, quality, name):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as are ours
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


# ---------------------------------------------------------------- scene
def to_blender(p):
    """Component frame (three.js axes) -> GLB frame -> Blender (x, -z, y); a rotation, winding kept."""
    return (float(p[0] + X_SHIFT), float(-p[2]), float(p[1]))


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    for f in FACES:
        verts = [bm.verts.new(to_blender(p)) for p in f['pts']]
        face = bm.faces.new(verts)
        rx, ry, _, _ = f['rect']
        for loop, p in zip(face.loops, f['pts']):
            lu = np.dot(p - f['origin'], f['U'])
            lv = np.dot(p - f['origin'], f['V'])
            u = (rx + GUTTER + lu / f['d']) / TEX
            v = (ry + GUTTER + lv / f['d']) / TEX
            loop[uv_layer].uv = (float(u), float(v))
    bm.normal_update()
    for face, f in zip(bm.faces, FACES):
        n = f['n']
        expect = np.array([n[0], -n[2], n[1]])
        assert np.dot(np.array(face.normal), expect) > 0.99, (f['part'], f['tag'])
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    # Flat shading everywhere, except the sign back facets, which carry one shared -Z
    # normal so the shallow pyramid shades as a flat plate.
    loop_normals = []
    for poly, f in zip(mesh.polygons, FACES):
        override = f.get('normal_override')
        poly.use_smooth = override is not None
        nrm = to_blender(override) if override is not None else None
        if nrm is not None:
            nrm = (nrm[0] - X_SHIFT, nrm[1], nrm[2])
        else:
            nrm = tuple(poly.normal)
        loop_normals.extend([nrm] * poly.loop_total)
    mesh.normals_split_custom_set(loop_normals)
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.6

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-guard-shack-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-guard-shack-body-normal'
    normal_img.colorspace_settings.is_data = True

    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    colour_node.extension = 'EXTEND'
    colour_node.interpolation = 'Linear'
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])

    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_tex.extension = 'EXTEND'
    normal_tex.interpolation = 'Linear'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def check_bounds():
    pts = np.concatenate([f['pts'] for f in FACES]) + np.array([X_SHIFT, 0.0, 0.0])
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    for axis, (elo, ehi) in enumerate(EXPECTED_BOUNDS):
        assert abs(lo[axis] - elo) < 2e-7 and abs(hi[axis] - ehi) < 2e-7, (axis, lo[axis], hi[axis])
    tris = triangle_count()
    assert tris <= MAX_TRIANGLES, tris
    return tris


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-guard-shack-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    build_geometry()
    tris = check_bounds()
    density = layout()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='yard-guard-shack-body-')
    try:
        colour_px, normal_px = build_textures()
        colour_path = os.path.join(stage, 'yard-guard-shack-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-guard-shack-body-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'yard-guard-shack-body-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'yard-guard-shack-body-normal-stage')

        mesh = build_mesh()
        mesh.materials.append(build_material(colour_path, normal_path))
        obj = bpy.data.objects.new(NODE_NAME, mesh)
        obj['authoredCastShadow'] = False
        obj['authoredReceiveShadow'] = False
        scene.collection.objects.link(obj)

        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            export_image_format='AUTO',
            export_vertex_color='NONE',
            export_normals=True,
            export_tangents=False,
            export_extras=True,
            export_yup=True,
            export_apply=False,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-guard-shack-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_GUARD_SHACK_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes '
          f'{tris} triangles, {len(FACES)} faces, {density * 1000:.2f} mm/texel')


main()
