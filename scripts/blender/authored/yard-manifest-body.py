"""Yard shipping-manifest holder (world-yard-manifest-body), built from scratch in headless Blender.

What it builds
--------------
The wall-mounted manifest holder beside each dock door
(src/components/TruckBay.tsx `ManifestHolder`, two instances, rotation 0).
Delivered scale, three.js metres, origin at ground centre, +Z front:
0.500 W x 0.700 H x 0.185 D (z -0.0925..+0.0925).

* Housing: a dark-grey (#374151) powder-coated steel box 0.50 x 0.70 x 0.12 m
  (z -0.0925..0.0275), its front edges chamfered 12 mm in geometry and its back
  plate drawn in 6 mm so the sides lean to it (a back-edge draft at no face
  cost). The normal map rounds every other edge, sets four screw heads in the
  front corners and a raised data plate under the tray, presses a seam round the
  sides 16 mm in from the back edge, and gives the back a raised mounting flange
  with two keyhole slots and two screw holes.
* Document tray: a darker (#1f2937) pressed-steel pocket 0.35 m wide standing
  22 mm proud of the housing face. One seven-point profile extruded across x:
  drafted underside, a forward-leaning lower retaining LIP with a chamfered top
  corner, a ledge the clipboard stands behind, and a drafted top. Its side caps
  lean in 12 % (x linear in z, so each cap stays planar).
* Clipboard: a brown (#92400e) hardboard board 0.30 x 0.40 x 13 mm with its top
  corners cut 22 mm; the front outline is drawn in 4 mm so every visible edge is
  one bevelled face. Its foot stands inside the lip.
* Paper: a warm off-white manifest form (~#e2dbc5) lying 0.8 mm proud of the
  board, printed in the atlas: slate header band, a ruled table with blue
  handwritten entries, a signature line, a soft darker edge and the clip's
  contact shadow.
* Clip: a steel lever clip, one five-point profile extruded 0.17 m across the
  board top: a rear foot on the board, a rounded crown (smooth-shaded) that
  owns the +Z bound, and a jaw that comes down onto the paper.
* Pen cup: a lighter (#7b8494) half-hexagonal cup on the housing face below the
  tray at the right, 54 mm wide, smooth-shaded round its front so it reads as a
  round cup, with a lip that flares 8 mm out over the body and a dark open mouth
  painted into its top. It holds a blue (#1e40af lifted to #2a4fc4) marker pen,
  18 mm across flats, smooth-shaded so it reads as a cylinder, with a navy cap
  band, a silver clip and a domed (smooth cone) cap end, leaning out of it.

Runtime anchors kept
--------------------
* The GLB sits in <group position={[0, -0.35, 0.0325]}> inside the holder, so
  the housing's back plane (z -0.0925) lands on the fallback box's back
  (holder z -0.06), as before. The runtime draws 'MANIFEST' at holder
  [0, 0.42, 0.07] = GLB y 0.77, above the housing top (0.70); nothing is built
  there. Nothing in src/ measures the GLB.

Contract (public/models/asset-manifest.json)
--------------------------------------------
bounds x +-0.250 (housing sides), y 0..0.700 (housing), z +-0.0925 (housing
back; clip crown), 1 mm tolerance, asserted before export. One node
`Yard-manifest-bodyBody` at identity (authoredCastShadow/ReceiveShadow false),
one material, two textures (base colour + normal), maxRenderVertices 318
counts index entries, so 106 triangles:

  housing: front, 4 chamfers, 4 sides, back          20
  tray: 6 profile faces + two 7-point caps            22
  clipboard: 6-point front + 5 bevelled edge faces    14
  paper: front                                         2
  clip: 4 profile faces + two 5-point caps             14
  pen cup: 2 bands x 3 faces + bottom + top            16
  pen: 6 sides + 6-face domed cap end                  18
                                                       106

Faces that can never be seen are not built: the backs of parts standing on
another surface, the clipboard's bottom edge (inside the lip), the paper's top
edge (under the clip), the paper's 0.8 mm edges and the pen's foot (inside the cup).

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-manifest-body.py -- <out.glb>

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

NODE_NAME = 'Yard-manifest-bodyBody'
MESH_NAME = 'yard-manifest-body-mesh'
MATERIAL_NAME = 'yard-manifest-body-surface'
SCENE_NAME = 'MillOS_World_Yard-manifest-body'
MAX_TRIANGLES = 106

# ---------------------------------------------------------------- dimensions (glTF / three.js metres)
HX, HY = 0.25, 0.70  # housing half-width, height
ZB, ZF = -0.0925, 0.0275  # housing back, front
CH = 0.012  # front chamfer
BACK_INSET = 0.006  # the back plate is drawn in this far: sides lean to it (a back-edge draft, no extra faces)

TX = 0.175  # tray half-width at the housing face
TRAY_DRAFT = 0.12  # sides lean in 0.12 m per metre of standoff: pressed-steel draft
TRAY_PROFILE = [  # (y, z): back-bottom, lip bottom front (drafted underside), lip top front,
    # lip chamfer, lip ledge back (concave), tray top front, top back (drafted top)
    (0.225, ZF), (0.229, 0.072), (0.257, 0.080), (0.265, 0.073), (0.267, 0.050), (0.669, 0.050), (0.675, ZF)]
TRAY_CONCAVE = 4  # profile index of the lip-ledge / tray-face junction
TZ = 0.050  # tray face


def tray_x(z):
    return TX - TRAY_DRAFT * (z - ZF)


BZ0, BZ1 = TZ, 0.063  # clipboard back, front
BOARD = [(-0.15, 0.255), (0.15, 0.255), (0.15, 0.633), (0.128, 0.655), (-0.128, 0.655), (-0.15, 0.633)]
BOARD_BEVEL = 0.004  # the front outline is drawn in this far: every visible board edge is one bevelled face


def inset_outline(poly, dists):
    """Offset a convex CCW outline inward, edge i by dists[i] (edge i runs poly[i] -> poly[i+1])."""
    n = len(poly)
    lines = []
    for i in range(n):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        L = math.hypot(ex, ey)
        nx, ny = -ey / L, ex / L  # inward for CCW
        lines.append((ax + nx * dists[i], ay + ny * dists[i], ex, ey))
    out = []
    for i in range(n):
        x1, y1, e1x, e1y = lines[i - 1]
        x2, y2, e2x, e2y = lines[i]
        den = e1x * e2y - e1y * e2x
        t = ((x2 - x1) * e2y - (y2 - y1) * e2x) / den
        out.append((x1 + t * e1x, y1 + t * e1y))
    return out


BOARD_FRONT = inset_outline(BOARD, [0.0] + [BOARD_BEVEL] * (len(BOARD) - 1))  # the foot (edge 0) stays in the lip

PX, PY0, PY1 = 0.125, 0.285, 0.625  # paper half-width, bottom, top
PAPER_LIFT = 0.0008  # the sheet lies this far proud of the board (a sheet; its 0.8 mm edge is not built)


def paper_z(y):
    return BZ1 + PAPER_LIFT


CLX = 0.085  # clip half-width
CLIP_PROFILE = [(0.648, 0.0628), (0.648, 0.083), (0.633, 0.0925), (0.608, 0.0805), (0.595, paper_z(0.595) - 0.00015)]
CLIP_JAW_Y = CLIP_PROFILE[-1][0]

# Pen cup: a half-hexagonal steel cup below the tray on the right, smooth-shaded round its front, with a
# lip that flares 8 mm out over the body so it reads as a rim from the dock floor.
CUP_X, CUP_Z = 0.203, ZF
CUP_RINGS = [(0.110, 0.0245), (0.200, 0.0270), (0.212, 0.0350)]  # (y, circumradius): foot, body top, lip
CUP_ANGLES = [0.0, math.pi / 3, 2 * math.pi / 3, math.pi]

PEN_CROSS = np.array([0.203, CUP_RINGS[-1][0], ZF + 0.0125])  # where the axis crosses the cup mouth
PEN_LEAN, PEN_TIP = 0.08, 0.08  # radians toward -x, toward +z
PEN_DOWN, PEN_UP = 0.060, 0.115  # axis length below / above the mouth
PEN_R = 0.0105  # hexagon circumradius (18 mm across flats: a marker pen that reads at 3 m)
PEN_CONE = 0.011  # domed cap end, axis length

# ---------------------------------------------------------------- texture settings
TEX_W = 512
GUTTER = 3
SUPERSAMPLE = 3
COLOUR_QUALITY = 84
NORMAL_QUALITY = 82
MAX_SLOPE = 2.0
NORMAL_STRENGTH = 1.0

BEVEL = {'housing': 0.0045, 'tray': 0.0035, 'board': 0.002, 'paper': 0.0008, 'clip': 0.002,
         'cup': 0.0018, 'cupcap': 0.0018, 'pen': 0.0012, 'pencap': 0.0010}


def c(hexstr):
    hexstr = hexstr.lstrip('#')
    return np.array([int(hexstr[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


HOUSING = c('#374151')
HOUSING_BACK = c('#323b49')
SCREW = c('#8b939e')
PLATE = c('#4b5563')
HOLE = c('#0c0f16')
TRAY = c('#1f2937')
BOARD_C = c('#92400e')
BOARD_EDGE = c('#7a360f')
PAPER = c('#e2dbc5')
PAPER_LOW = c('#d7cfb7')
PAPER_EDGE = c('#c9c0a7')
RULE = c('#9a9686')
HEADER = c('#40495a')
HEADER_TEXT = c('#d6d1c1')
INK = c('#2c427c')
STEEL = c('#a3abb6')
STEEL_LIGHT = c('#d3d9e0')
STEEL_DARK = c('#6f7782')
CUP = c('#7b8494')
CUP_RIM = c('#8e97a6')
CUP_MOUTH = c('#0e121a')
PEN = c('#2a4fc4')
PEN_CAP = c('#1e3a8a')
PEN_CLIP = c('#cbd5e1')
PEN_BUTTON = c('#3b5fd0')


# ---------------------------------------------------------------- vector helpers
def v3(*a):
    return np.array(a, np.float64)


def unit(a):
    a = np.asarray(a, np.float64)
    return a / np.linalg.norm(a)


# ---------------------------------------------------------------- face collection
class Face:
    def __init__(self, pts, outward, part, tag, round_edge=None, keys=None):
        self.pts = [np.asarray(p, np.float64) for p in pts]
        self.part = part
        self.tag = tag
        self.keys = keys or [None] * len(pts)
        n = np.zeros(3)
        for i in range(len(self.pts)):
            a, b = self.pts[i], self.pts[(i + 1) % len(self.pts)]
            n += np.cross(a, b)
        if np.dot(n, outward) < 0:
            self.pts.reverse()
            self.keys.reverse()
            n = -n
        self.n = unit(n)
        nn = len(self.pts)
        self.round = [True] * nn if round_edge is None else [
            bool(round_edge(self.pts[i], self.pts[(i + 1) % nn])) for i in range(nn)]
        # Planar basis: b = world up (or -z/+z on horizontal faces) in the plane; t = b x n.
        if abs(self.n[1]) < 0.9:
            ref = v3(0, 1, 0)
        else:
            ref = v3(0, 0, -1) if self.n[1] > 0 else v3(0, 0, 1)
        self.b = unit(ref - np.dot(ref, self.n) * self.n)
        self.t = np.cross(self.b, self.n)
        self.d0 = float(np.dot(self.pts[0], self.n))
        self.uv2 = [(float(np.dot(p, self.t)), float(np.dot(p, self.b))) for p in self.pts]
        us, vs = zip(*self.uv2)
        self.umin, self.umax, self.vmin, self.vmax = min(us), max(us), min(vs), max(vs)

    def triangles(self):
        return len(self.pts) - 2


FACES = []


def add(pts, outward, part, tag, round_edge=None, keys=None):
    f = Face(pts, outward, part, tag, round_edge, keys)
    FACES.append(f)
    return f


def not_behind(zc):
    """Round every edge except those lying on the contact plane z <= zc (the part's back)."""
    return lambda a, b: not (a[2] <= zc + 1e-6 and b[2] <= zc + 1e-6)


def build_housing():
    x0, x1 = -HX, HX
    zc = ZF - CH
    xi0, xi1, yi0, yi1 = x0 + CH, x1 - CH, CH, HY - CH
    add([(xi0, yi0, ZF), (xi1, yi0, ZF), (xi1, yi1, ZF), (xi0, yi1, ZF)], (0, 0, 1), 'housing', 'front')
    add([(x0, 0, zc), (x1, 0, zc), (xi1, yi0, ZF), (xi0, yi0, ZF)], (0, -1, 1), 'housing', 'chamfer')
    add([(x1, 0, zc), (x1, HY, zc), (xi1, yi1, ZF), (xi1, yi0, ZF)], (1, 0, 1), 'housing', 'chamfer')
    add([(x1, HY, zc), (x0, HY, zc), (xi0, yi1, ZF), (xi1, yi1, ZF)], (0, 1, 1), 'housing', 'chamfer')
    add([(x0, HY, zc), (x0, 0, zc), (xi0, yi0, ZF), (xi0, yi1, ZF)], (-1, 0, 1), 'housing', 'chamfer')
    b = BACK_INSET
    bx0, bx1, by0, by1 = x0 + b, x1 - b, b, HY - b
    add([(bx1, by0, ZB), (bx1, by1, ZB), (x1, HY, zc), (x1, 0, zc)], (1, 0, 0), 'housing', 'side')
    add([(bx0, by0, ZB), (bx0, by1, ZB), (x0, HY, zc), (x0, 0, zc)], (-1, 0, 0), 'housing', 'side')
    add([(bx0, by1, ZB), (bx1, by1, ZB), (x1, HY, zc), (x0, HY, zc)], (0, 1, 0), 'housing', 'top')
    add([(bx0, by0, ZB), (bx1, by0, ZB), (x1, 0, zc), (x0, 0, zc)], (0, -1, 0), 'housing', 'bottom')
    add([(bx0, by0, ZB), (bx1, by0, ZB), (bx1, by1, ZB), (bx0, by1, ZB)], (0, 0, -1), 'housing', 'back')


def build_tray():
    pc = TRAY_PROFILE[TRAY_CONCAVE]

    def rnd(a, b):
        if a[2] <= ZF + 1e-6 and b[2] <= ZF + 1e-6:
            return False
        onc = lambda p: abs(p[1] - pc[0]) < 1e-6 and abs(p[2] - pc[1]) < 1e-6
        return not (onc(a) and onc(b))  # concave lip-ledge / tray-face junction

    tags = ['tray-bottom', 'lip-front', 'lip-chamfer', 'lip-top', 'tray-face', 'tray-top']
    for i in range(len(TRAY_PROFILE) - 1):
        (ya, za), (yb, zb) = TRAY_PROFILE[i], TRAY_PROFILE[i + 1]
        out = (0, -(zb - za), yb - ya)  # profile runs back-bottom -> top-back; outward is (-dz, dy)
        xa, xb = tray_x(za), tray_x(zb)
        add([(-xa, ya, za), (xa, ya, za), (xb, yb, zb), (-xb, yb, zb)], out, 'tray', tags[i], rnd)
    for sx in (-1, 1):  # drafted side caps: x is linear in z, so each cap stays planar
        add([(sx * tray_x(z), y, z) for y, z in TRAY_PROFILE], (sx, 0, TRAY_DRAFT), 'tray', 'tray-cap', rnd)


def build_board():
    add([(x, y, BZ1) for x, y in BOARD_FRONT], (0, 0, 1), 'board', 'board-front')
    n = len(BOARD)
    for i in range(1, n):  # edge 0 (the foot) stands inside the lip
        (xa, ya), (xb, yb) = BOARD[i], BOARD[(i + 1) % n]
        (fa, ga), (fb, gb) = BOARD_FRONT[i], BOARD_FRONT[(i + 1) % n]
        out = (yb - ya, -(xb - xa), 0.3)
        add([(xa, ya, BZ0), (xb, yb, BZ0), (fb, gb, BZ1), (fa, ga, BZ1)], out, 'board', 'board-edge',
            not_behind(BZ0))


def build_paper():
    zb, zt = paper_z(PY0), paper_z(PY1)
    add([(-PX, PY0, zb), (PX, PY0, zb), (PX, PY1, zt), (-PX, PY1, zt)], (0, 0, 1), 'paper', 'paper-front')


def build_clip():
    q = CLIP_PROFILE
    zc = 0.0645

    def rnd(a, b):
        if a[2] <= zc and b[2] <= zc:
            return False
        # Smooth crown lines (Q2, Q3) are not edges.
        for k in (2, 3):
            if all(abs(p[1] - q[k][0]) < 1e-6 and abs(p[2] - q[k][1]) < 1e-6 for p in (a, b)):
                return False
        return True

    outs = [(0, 1, 0), (0, 0.5, 1), (0, -0.4, 1), (0, -1, 0.6)]
    tags = ['clip-rear', 'clip-crown', 'clip-crown', 'clip-jaw']
    for i in range(4):
        (ya, za), (yb, zb) = q[i], q[i + 1]
        keys = [None] * 4
        if i + 1 in (2, 3):
            keys[2], keys[3] = ('clip', 1, i + 1), ('clip', -1, i + 1)
        if i in (2, 3):
            keys[0], keys[1] = ('clip', -1, i), ('clip', 1, i)
        add([(-CLX, ya, za), (CLX, ya, za), (CLX, yb, zb), (-CLX, yb, zb)], outs[i], 'clip', tags[i], rnd, keys)
    for sx in (-CLX, CLX):
        add([(sx, y, z) for y, z in q], (np.sign(sx), 0, 0), 'clip', 'clip-cap', rnd)


def cup_pt(ring, k):
    y, r = CUP_RINGS[ring]
    a = CUP_ANGLES[k]
    return (CUP_X + r * math.cos(a), y, CUP_Z + r * math.sin(a))


def cup_angle(p):
    return math.atan2(p[2] - CUP_Z, p[0] - CUP_X)


def cup_round(a, b):
    """Round the band creases and the cup's open edges; not its back (on the housing) and not the
    generator lines between facets, which are smooth-shaded so the cup reads round."""
    if a[2] <= CUP_Z + 1e-6 and b[2] <= CUP_Z + 1e-6:
        return False
    if abs(cup_angle(a) - cup_angle(b)) < 1e-6:
        return False
    return True


def build_cup():
    for band in range(2):
        for k in range(3):
            mid = (CUP_ANGLES[k] + CUP_ANGLES[k + 1]) / 2
            dr = CUP_RINGS[band + 1][1] - CUP_RINGS[band][1]
            dy = CUP_RINGS[band + 1][0] - CUP_RINGS[band][0]
            out = (math.cos(mid), -dr / dy, math.sin(mid))
            keys = [('cup', band, 0, k), ('cup', band, 0, k + 1), ('cup', band, 1, k + 1), ('cup', band, 1, k)]
            add([cup_pt(band, k), cup_pt(band, k + 1), cup_pt(band + 1, k + 1), cup_pt(band + 1, k)], out, 'cup',
                'cup-rim' if band == 1 else 'cup-body', cup_round, keys)
    rnd = not_behind(CUP_Z)
    add([cup_pt(0, k) for k in range(4)], (0, -1, 0), 'cup', 'cup-bottom', rnd)
    add([cup_pt(2, k) for k in range(4)], (0, 1, 0), 'cupcap', 'cup-mouth', rnd)


PEN_AXIS = unit((-math.sin(PEN_LEAN), math.cos(PEN_LEAN), math.sin(PEN_TIP)))
PEN_TOP = PEN_CROSS + PEN_UP * PEN_AXIS
PEN_FOOT = PEN_CROSS - PEN_DOWN * PEN_AXIS


def build_pen():
    e1 = unit(np.cross(v3(0, 0, 1), PEN_AXIS))
    e2 = np.cross(PEN_AXIS, e1)
    ring = []
    for j in range(6):
        a = math.radians(60 * j)
        ring.append(PEN_R * (math.cos(a) * e1 + math.sin(a) * e2))
    def side_round(a, b):  # generator lines are smooth; only the ring edges are edges
        d = unit(np.asarray(b) - np.asarray(a))
        return abs(np.dot(d, PEN_AXIS)) < 0.99

    apex = PEN_TOP + PEN_CONE * PEN_AXIS

    def cone_round(a, b):
        return not any(np.linalg.norm(np.asarray(p) - apex) < 1e-9 for p in (a, b))

    for j in range(6):
        jn = (j + 1) % 6
        a, b = ring[j], ring[jn]
        out = (a + b) / 2
        add([PEN_FOOT + a, PEN_FOOT + b, PEN_TOP + b, PEN_TOP + a], out, 'pen', 'pen-side', side_round,
            [('pen', 0, j), ('pen', 0, jn), ('pen', 1, jn), ('pen', 1, j)])
    for j in range(6):  # the domed cap end: a smooth-shaded cone
        jn = (j + 1) % 6
        a, b = ring[j], ring[jn]
        out = unit((a + b) / 2) + PEN_AXIS * 0.8
        add([PEN_TOP + a, PEN_TOP + b, apex], out, 'pencap', 'pen-dome', cone_round,
            [('dome', j), ('dome', jn), ('dome', 'apex')])


def build_faces():
    FACES.clear()
    build_housing()
    build_tray()
    build_board()
    build_paper()
    build_clip()
    build_cup()
    build_pen()
    tris = sum(f.triangles() for f in FACES)
    assert tris <= MAX_TRIANGLES, f'{tris} triangles > {MAX_TRIANGLES}'
    pens = [f for f in FACES if f.tag == 'pen-side']
    max(pens, key=lambda f: f.n[2]).tag = 'pen-front'
    return tris


# ---------------------------------------------------------------- atlas packing
def pack(density):
    rects = []
    for i, f in enumerate(FACES):
        w = int(math.ceil((f.umax - f.umin) * density)) + 2 * GUTTER
        h = int(math.ceil((f.vmax - f.vmin) * density)) + 2 * GUTTER
        rects.append((h, w, i))
    rects.sort(key=lambda r: (-r[0], -r[1]))
    x = y = shelf = 0
    place = {}
    for h, w, i in rects:
        if w > TEX_W:
            return None
        if x + w > TEX_W:
            y += shelf
            x = shelf = 0
        place[i] = (x, y, w, h)
        x += w
        shelf = max(shelf, h)
    height = y + shelf
    height += (-height) % 4
    return place, height


def choose_density(max_h):
    d = 520.0
    while d > 100:
        res = pack(d)
        if res and res[1] <= max_h:
            return d, res[0], res[1]
        d -= 5
    raise SystemExit('atlas does not fit')


# ---------------------------------------------------------------- noise and helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


_GRIDS = {}


def value_noise(x, y, cell, seed):
    """Seeded smooth value noise over metres with the given cell size."""
    if seed not in _GRIDS:
        _GRIDS[seed] = np.random.default_rng(seed).random((256, 256)).astype(np.float32)
    grid = _GRIDS[seed]
    gx, gy = x / cell + 7.3, y / cell + 3.1
    ix, iy = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    fx, fy = gx - ix, gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x0, x1, y0, y1 = ix % 256, (ix + 1) % 256, iy % 256, (iy + 1) % 256
    a, b, cc, d = grid[y0, x0], grid[y0, x1], grid[y1, x0], grid[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy


def mix(rgb, colour, amount):
    a = np.clip(amount, 0.0, 1.0)[..., None]
    return rgb * (1 - a) + colour * a


def shade(rgb, amount):
    return rgb * (1.0 - np.clip(amount, 0.0, 1.0))[..., None]


def fill(colour, shape):
    return np.broadcast_to(colour, shape + (3,)).astype(np.float32).copy()


def block_mean(a):
    s = SUPERSAMPLE
    h, w = a.shape[0] // s, a.shape[1] // s
    return a.reshape(h, s, w, s, *a.shape[2:]).mean(axis=(1, 3))


def normals_from_height(h, du, dv):
    dh_du = np.gradient(h, du, axis=1)
    dh_dv = np.gradient(h, dv, axis=0)
    mag = np.sqrt(dh_du ** 2 + dh_dv ** 2)
    scale = np.where(mag > MAX_SLOPE, MAX_SLOPE / np.maximum(mag, 1e-6), 1.0)
    n = np.stack([-dh_du * scale, -dh_dv * scale, np.ones_like(h)], axis=-1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def rect_dist(x, y, x0, x1, y0, y1):
    """Signed distance to an axis rectangle, positive outside."""
    dx = np.maximum(x0 - x, x - x1)
    dy = np.maximum(y0 - y, y - y1)
    out = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2)
    return np.where((dx > 0) | (dy > 0), out, np.maximum(dx, dy))


def halo(dist, width, strength):
    """Contact shadow outside a shape (dist positive outside)."""
    return strength * np.exp(-np.maximum(dist, 0.0) / width) * (dist > -0.0005)


def dome(x, y, cx, cy, r, h):
    d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
    return h * np.sqrt(np.clip(1.0 - d2, 0.0, 1.0)), d2 < 1.0


def edge_distance(f, U, V):
    """Signed distance (positive inside) to the face's rounded edges in local metres."""
    poly = f.uv2
    n = len(poly)
    d_round = np.full(U.shape, np.inf)
    d_any = np.full(U.shape, np.inf)
    nearest_round = np.zeros(U.shape, bool)
    inside = np.zeros(U.shape, bool)
    for i in range(n):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        L2 = ex * ex + ey * ey
        t = np.clip(((U - ax) * ex + (V - ay) * ey) / max(L2, 1e-12), 0, 1)
        d = np.hypot(U - (ax + t * ex), V - (ay + t * ey))
        if f.round[i]:
            d_round = np.minimum(d_round, d)
        closer = d < d_any
        nearest_round = np.where(closer, f.round[i], nearest_round)
        d_any = np.minimum(d_any, d)
        crosses = ((ay > V) != (by > V)) & (U < (bx - ax) * (V - ay) / (by - ay + 1e-15) + ax)
        inside ^= crosses
    sd = np.where(inside, d_round, np.where(nearest_round, -d_any, d_round))
    return sd


def bevel_height(sd, r):
    t = np.clip(r - sd, 0.0, r)
    return -(r - np.sqrt(np.maximum(r * r - t * t, 0.0)))


# ---------------------------------------------------------------- painters (world coords X, Y, Z)
def paint_housing(f, X, Y, Z, U, V, h):
    shape = X.shape
    rgb = fill(HOUSING if f.tag != 'back' else HOUSING_BACK, shape)
    mottle = 1.0 + (value_noise(U, V, 0.06, 11) - 0.5) * 0.07 + (value_noise(U, V, 0.006, 12) - 0.5) * 0.04
    rgb *= mottle[..., None]
    if f.tag == 'chamfer':
        rgb = mix(rgb, c('#4a5568'), 0.25 + 0.2 * value_noise(U, V, 0.02, 13))
    if f.tag == 'front':
        # Contact shadows round the tray and the pen cup.
        rgb = shade(rgb, halo(rect_dist(X, Y, -TX, TX, 0.225, 0.675), 0.006, 0.45))
        rl = CUP_RINGS[-1][1]
        rgb = shade(rgb, halo(rect_dist(X, Y, CUP_X - rl, CUP_X + rl, CUP_RINGS[0][0], CUP_RINGS[-1][0]), 0.005, 0.4))
        for sx in (-1, 1):
            for sy in (0.032, HY - 0.032):
                hh, m = dome(X, Y, sx * (HX - 0.032), sy, 0.0055, 0.0012)
                h += hh
                rgb = mix(rgb, SCREW, m * 0.9)
                slot = m & (np.abs((X - sx * (HX - 0.032)) * 0.7 + (Y - sy) * 0.7) < 0.0007)
                rgb = mix(rgb, HOLE, slot * 0.8)
                h -= slot * 0.0006
        # Raised data plate under the tray.
        pd = rect_dist(X, Y, -0.085, 0.085, 0.085, 0.150)
        plate = smoothstep(0.0012, -0.0012, pd)
        h += 0.0008 * plate
        rgb = mix(rgb, PLATE, plate)
        for k in range(3):
            yy = 0.132 - k * 0.016
            ln = (np.abs(Y - yy) < 0.0028) & (X > -0.07) & (X < (0.05 if k else 0.07))
            rgb = mix(rgb, c('#9aa3af'), ln * 0.55)
            h += ln * 0.0003
        for sx in (-0.075, 0.075):
            hh, m = dome(X, Y, sx, 0.1175, 0.003, 0.0006)
            h += hh
            rgb = mix(rgb, SCREW, m * 0.8)
    if f.tag in ('side', 'top', 'bottom'):
        # Pressed seam 16 mm in from the back edge: the back flange line.
        g = np.exp(-((Z - (ZB + 0.016)) / 0.0011) ** 2)
        h -= 0.0008 * g
        rgb = shade(rgb, 0.35 * g)
        if f.tag == 'top':
            rgb = mix(rgb, c('#59606b'), 0.25 * value_noise(X, Z, 0.03, 14))
    if f.tag == 'back':
        pd = rect_dist(X, Y, -HX + 0.03, HX - 0.03, 0.03, HY - 0.03)
        panel = smoothstep(0.0015, -0.0015, pd)
        h += 0.0015 * panel
        rgb = mix(rgb, c('#2b3340'), 0.6 * (1 - panel))
        for sx in (-0.16, 0.16):
            # Keyhole slot: a round head hole with a slot running up from it.
            dk = np.minimum(np.hypot(X - sx, Y - 0.585) - 0.0065,
                            rect_dist(X, Y, sx - 0.0025, sx + 0.0025, 0.585, 0.607))
            hole = smoothstep(0.0008, -0.0008, dk)
            ring = np.exp(-(dk / 0.0012) ** 2)
            h -= 0.003 * hole
            rgb = mix(rgb, HOLE, hole)
            rgb = mix(rgb, c('#4b5563'), ring * 0.4 * (1 - hole))
            dh = np.hypot(X - sx, Y - 0.09) - 0.0045
            hole2 = smoothstep(0.0008, -0.0008, dh)
            h -= 0.002 * hole2
            rgb = mix(rgb, HOLE, hole2)
        lab = smoothstep(0.001, -0.001, rect_dist(X, Y, -0.07, 0.07, 0.30, 0.38))
        rgb = mix(rgb, c('#9ca3af'), lab * 0.55)
        for k in range(3):
            ln = lab * (np.abs(Y - (0.362 - k * 0.022)) < 0.003) * (X > -0.055) * (X < 0.04 - 0.02 * k)
            rgb = mix(rgb, c('#374151'), ln * 0.6)
    return rgb


def paint_tray(f, X, Y, Z, U, V, h):
    rgb = fill(TRAY, X.shape)
    rgb *= (1.0 + (value_noise(U, V, 0.05, 21) - 0.5) * 0.08 + (value_noise(U, V, 0.005, 22) - 0.5) * 0.05)[..., None]
    if f.tag in ('tray-face', 'lip-top'):
        rgb = shade(rgb, halo(rect_dist(X, Y, -0.15, 0.15, 0.255, 0.655), 0.006, 0.55))
    if f.tag == 'lip-front':
        # Scuffs where the clipboard is dropped in and lifted out.
        rgb = mix(rgb, c('#4b5563'), 0.35 * smoothstep(0.6, 0.85, value_noise(X, Y, 0.012, 23)) *
                  smoothstep(0.250, 0.262, Y))
    if f.tag == 'tray-top':
        rgb = mix(rgb, c('#3a4250'), 0.3 * value_noise(X, Z, 0.02, 24))
    return rgb


def paint_board(f, X, Y, Z, U, V, h):
    rgb = fill(BOARD_C if f.tag == 'board-front' else BOARD_EDGE, X.shape)
    fibre = (value_noise(X / 4.0, Y, 0.004, 31) - 0.5) * 0.10 + (value_noise(X, Y, 0.03, 32) - 0.5) * 0.08
    rgb *= (1.0 + fibre)[..., None]
    h += 0.00015 * value_noise(X, Y, 0.003, 33)
    if f.tag == 'board-front':
        rgb = shade(rgb, halo(rect_dist(X, Y, -PX, PX, PY0, PY1), 0.004, 0.5))
        rgb = shade(rgb, halo(rect_dist(X, Y, -CLX, CLX, CLIP_JAW_Y, CLIP_PROFILE[0][0]), 0.004, 0.45))
        # Worn lighter rim along the board edge.
        sd = edge_distance(f, U, V)
        rgb = mix(rgb, c('#b5652a'), 0.35 * smoothstep(0.004, 0.0, sd))
    return rgb


def paper_print(X, Y, rgb, h):
    shape = X.shape
    # Header band.
    hb = (Y > 0.556) & (Y < 0.584) & (np.abs(X) < PX - 0.010)
    rgb = mix(rgb, HEADER, hb * 0.92)
    title = hb & (np.abs(Y - 0.570) < 0.0042) & (X > -0.105) & (X < -0.020)
    rgb = mix(rgb, HEADER_TEXT, title * 0.85)
    sub = hb & (np.abs(Y - 0.570) < 0.0030) & (X > 0.010) & (X < 0.060)
    rgb = mix(rgb, HEADER_TEXT, sub * 0.55)
    logo = hb & (np.abs(X - 0.095) < 0.008) & (np.abs(Y - 0.570) < 0.008)
    rgb = mix(rgb, c('#c2410c'), logo * 0.9)
    # Field boxes under the header.
    for x0, x1 in ((-0.115, -0.045), (-0.040, 0.030), (0.035, 0.115)):
        d = rect_dist(X, Y, x0, x1, 0.528, 0.548)
        rgb = mix(rgb, RULE, np.exp(-(d / 0.0009) ** 2) * 0.75)
        lab = (Y > 0.541) & (Y < 0.545) & (X > x0 + 0.004) & (X < x0 + 0.022)
        rgb = mix(rgb, RULE, lab * 0.6)
    # Ruled table with handwritten entries.
    rows = np.linspace(0.318, 0.512, 12)
    in_tab = (np.abs(X) < PX - 0.010) & (Y > 0.316) & (Y < 0.514)
    for ry in rows:
        rgb = mix(rgb, RULE, in_tab * np.exp(-((Y - ry) / 0.0008) ** 2) * 0.7)
    for cx in (-0.085, 0.030, 0.075):
        rgb = mix(rgb, RULE, in_tab * np.exp(-((X - cx) / 0.0008) ** 2) * 0.6)
    rgb = mix(rgb, RULE, (np.abs(Y - 0.514) < 0.0011) * (np.abs(X) < PX - 0.010) * 0.8)
    rng = np.random.default_rng(7)
    ink = np.zeros(shape, np.float32)
    for k in range(len(rows) - 1):
        if k < 2:
            continue  # the last two rows are still blank
        yc = (rows[k] + rows[k + 1]) / 2
        for x0, x1 in ((-0.112, -0.090), (-0.080, 0.025), (0.035, 0.070), (0.080, 0.112)):
            ln = (x1 - x0) * rng.uniform(0.45, 0.95)
            xs = x0 + 0.002
            stroke = (X > xs) & (X < xs + ln) & (np.abs(Y - yc - 0.0012 * np.sin(X * 900 + k)) < 0.0019)
            ink = np.maximum(ink, stroke * smoothstep(0.3, 0.55, value_noise(X, Y, 0.0025, 40 + k)))
    sig = (X > 0.025) & (X < 0.11) & (np.abs(Y - 0.300 - 0.004 * np.sin((X - 0.025) * 140)) < 0.0013)
    ink = np.maximum(ink, sig * 0.9)
    rgb = mix(rgb, RULE, (np.abs(Y - 0.296) < 0.0007) * (X > 0.02) * (X < 0.115) * 0.8)
    lab = (np.abs(Y - 0.300) < 0.0022) & (X > -0.11) & (X < -0.06)
    rgb = mix(rgb, RULE, lab * 0.55)
    rgb = mix(rgb, INK, ink * 0.8)
    return rgb


def paint_paper(f, X, Y, Z, U, V, h):
    shape = X.shape
    if f.tag == 'paper-front':
        g = smoothstep(PY0, PY1, Y)
        rgb = fill(PAPER_LOW, shape) * (1 - g)[..., None] + fill(PAPER, shape) * g[..., None]
        rgb *= (1.0 + (value_noise(X, Y, 0.02, 41) - 0.5) * 0.03)[..., None]
        rgb = paper_print(X, Y, rgb, h)
        # Soft tonal edge and the clip's contact shadow on the top of the sheet.
        sd = edge_distance(f, U, V)
        rgb = shade(rgb, 0.10 * smoothstep(0.004, 0.0, sd))
        under = np.where(np.abs(X) < CLX, CLIP_JAW_Y - Y, np.hypot(np.abs(X) - CLX, np.maximum(CLIP_JAW_Y - Y, 0)))
        rgb = shade(rgb, 0.35 * np.exp(-np.maximum(under, 0) / 0.006))
        # A faint waviness of a handled sheet.
        h += 0.0003 * value_noise(X, Y, 0.05, 42)
    else:
        rgb = fill(PAPER_EDGE, shape)
        # Stacked sheets: faint lines along the thickness.
        rgb = shade(rgb, 0.12 * (np.sin((Z - BZ1) * 2 * math.pi / 0.0011) > 0.6))
    return rgb


def paint_clip(f, X, Y, Z, U, V, h):
    shape = X.shape
    rgb = fill(STEEL, shape)
    brushed = value_noise(X / 12.0, Y + Z, 0.0006, 51)
    rgb *= (1.0 + (brushed - 0.5) * 0.16)[..., None]
    if f.tag == 'clip-crown':
        crest = smoothstep(0.082, 0.0925, Z)
        rgb = mix(rgb, STEEL_LIGHT, 0.55 * crest)
    if f.tag == 'clip-jaw':
        rgb = mix(rgb, STEEL_DARK, 0.45 * smoothstep(0.072, 0.064, Z))
    if f.tag == 'clip-rear':
        for sx in (-0.05, 0.05):
            hh, m = dome(X, Z, sx, 0.0735, 0.0035, 0.0012)
            h += hh
            rgb = mix(rgb, STEEL_LIGHT, m * 0.6)
        rgb = shade(rgb, 0.25 * smoothstep(0.068, 0.063, Z))
    if f.tag == 'clip-cap':
        rgb = shade(rgb, 0.12)
    return rgb


def paint_cup(f, X, Y, Z, U, V, h):
    shape = X.shape
    rgb = fill(CUP_RIM if f.tag == 'cup-rim' else CUP, shape)
    rgb *= (1.0 + (value_noise(U * 6.0, V, 0.004, 61) - 0.5) * 0.08)[..., None]
    y0, y1, y2 = CUP_RINGS[0][0], CUP_RINGS[1][0], CUP_RINGS[2][0]
    if f.tag == 'cup-body':
        rgb = shade(rgb, 0.18 * smoothstep(y0 + 0.03, y0, Y))
        rgb = shade(rgb, 0.30 * smoothstep(y1 - 0.010, y1, Y))  # under the lip
        g = np.exp(-((Y - (y0 + 0.012)) / 0.0012) ** 2)  # rolled foot bead
        h -= 0.0004 * g
        rgb = shade(rgb, 0.25 * g)
    if f.tag == 'cup-rim':
        rgb = mix(rgb, c('#b8c0cc'), 0.45 * smoothstep(y2 - 0.005, y2, Y))
    if f.tag == 'cup-bottom':
        rgb = shade(rgb, 0.2)
    return rgb


def paint_cupcap(f, X, Y, Z, U, V, h):
    shape = X.shape
    sd = edge_distance(f, U, V)
    # The back edge lies on the housing: measure the rim from the round edges only.
    rgb = fill(CUP_RIM, shape)
    rgb = mix(rgb, c('#c3cad4'), 0.35)
    # The opening sits inside the body wall: the lip's outer edge is 8 mm out from the body.
    wall = (CUP_RINGS[-1][1] - CUP_RINGS[1][1]) * math.cos(math.pi / 6) + 0.0025
    mouth = smoothstep(wall - 0.0006, wall + 0.0006, sd) * smoothstep(0.0015, 0.003, Z - CUP_Z)
    h -= 0.003 * mouth
    rgb = mix(rgb, c('#e2e7ee'), 0.35 * np.exp(-((sd - wall + 0.0012) / 0.0008) ** 2))  # lit inner lip
    depth = np.clip((sd - wall) / 0.01, 0, 1)
    rgb = mix(rgb, CUP_MOUTH * (1.0 + 0.6 * (1 - depth))[..., None], mouth)
    return rgb


def paint_pen(f, X, Y, Z, U, V, h):
    shape = X.shape
    P = np.stack([X, Y, Z], axis=-1)
    s = (PEN_TOP[None, None, :] - P) @ PEN_AXIS  # distance below the top
    rgb = fill(PEN, shape)
    rgb *= (1.0 + (value_noise(U, V, 0.01, 71) - 0.5) * 0.06)[..., None]
    cap = smoothstep(0.026, 0.024, s)
    rgb = mix(rgb, PEN_CAP, cap)
    ring = np.exp(-((s - 0.025) / 0.0008) ** 2)
    h -= 0.0003 * ring
    rgb = shade(rgb, 0.3 * ring)
    if f.tag == 'pen-front':
        uc = (f.umin + f.umax) / 2
        clip = (np.abs(U - uc) < 0.0016) & (s > 0.004) & (s < 0.056)
        rgb = mix(rgb, PEN_CLIP, clip * 0.95)
        h += clip * 0.0005
    return rgb


def paint_pencap(f, X, Y, Z, U, V, h):
    rgb = fill(PEN_CAP, X.shape)
    apex = PEN_TOP + PEN_CONE * PEN_AXIS
    d = np.sqrt((X - apex[0]) ** 2 + (Y - apex[1]) ** 2 + (Z - apex[2]) ** 2)
    rgb = mix(rgb, PEN_BUTTON, 0.8 * smoothstep(0.006, 0.002, d))
    rgb = mix(rgb, c('#4f6fd8'), 0.5 * smoothstep(0.0025, 0.0, d))
    return rgb


PAINTERS = {'housing': paint_housing, 'tray': paint_tray, 'board': paint_board, 'paper': paint_paper,
            'clip': paint_clip, 'cup': paint_cup, 'cupcap': paint_cupcap, 'pen': paint_pen, 'pencap': paint_pencap}


def build_textures(density, place, tex_h):
    normal = np.zeros((tex_h, TEX_W, 3), np.float32)
    normal[..., 2] = 1.0
    colour = np.zeros((tex_h, TEX_W, 3), np.float32)
    colour[:] = HOUSING
    s = SUPERSAMPLE
    for i, f in enumerate(FACES):
        col0, row0, w, h_px = place[i]
        cols = (np.arange(w * s, dtype=np.float64) + 0.5) / s - GUTTER
        rows = (np.arange(h_px * s, dtype=np.float64) + 0.5) / s - GUTTER
        U, V = np.meshgrid(f.umin + cols / density, f.vmin + rows / density)
        P = U[..., None] * f.t + V[..., None] * f.b + f.d0 * f.n
        X, Y, Z = P[..., 0], P[..., 1], P[..., 2]
        h = bevel_height(edge_distance(f, U, V), BEVEL[f.part])
        rgb = PAINTERS[f.part](f, X, Y, Z, U, V, h)
        n = normals_from_height(h, 1.0 / (density * s), 1.0 / (density * s))
        n = block_mean(n)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        normal[row0:row0 + h_px, col0:col0 + w] = n
        colour[row0:row0 + h_px, col0:col0 + w] = block_mean(rgb)
    normal_px = np.clip(np.round((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    colour_px = np.clip(np.round(colour), 0, 255).astype(np.uint8)
    return colour_px, normal_px


def write_jpeg(path, rgb, quality, name):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as are ours
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


# ---------------------------------------------------------------- mesh
def g2b(p):
    """glTF / three.js (y up, +z front) -> Blender (z up); the exporter maps it back."""
    return (float(p[0]), float(-p[2]), float(p[1]))


def build_mesh(density, place, tex_h):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    shared = {}
    for i, f in enumerate(FACES):
        col0, row0, _, _ = place[i]
        verts = []
        for p, key in zip(f.pts, f.keys):
            if key is not None and key in shared:
                verts.append(shared[key])
                continue
            v = bm.verts.new(g2b(p))
            if key is not None:
                shared[key] = v
            verts.append(v)
        face = bm.faces.new(verts)
        for loop, (u, v) in zip(face.loops, f.uv2):
            col = col0 + GUTTER + (u - f.umin) * density
            row = row0 + GUTTER + (v - f.vmin) * density
            loop[uv_layer].uv = (col / TEX_W, row / tex_h)
        face.smooth = True
    bm.normal_update()
    # Winding check: every Blender face normal must agree with the authored outward normal.
    for f, face in zip(FACES, bm.faces):
        nb = face.normal
        ng = np.array([nb.x, nb.z, -nb.y])
        assert np.dot(ng, f.n) > 0.5, f'{f.part}/{f.tag} winding disagrees'
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed solid: export single-sided
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.58

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-manifest-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-manifest-body-normal'
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
    normal_map.inputs['Strength'].default_value = NORMAL_STRENGTH
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def check_bounds():
    pts = np.array([p for f in FACES for p in f.pts])
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    size = hi - lo
    assert abs(size[0] - 0.500) <= 0.001 and abs(size[1] - 0.700) <= 0.001 and abs(size[2] - 0.185) <= 0.001, size
    assert abs(lo[1]) <= 0.001 and abs((lo[0] + hi[0]) / 2) <= 0.001 and abs((lo[2] + hi[2]) / 2) <= 0.001, (lo, hi)
    return lo, hi


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-manifest-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    tris = build_faces()
    lo, hi = check_bounds()
    density, place, tex_h = choose_density(512)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='yard-manifest-body-')
    try:
        colour_px, normal_px = build_textures(density, place, tex_h)
        colour_path = os.path.join(stage, 'yard-manifest-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-manifest-body-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'yard-manifest-body-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'yard-manifest-body-normal-stage')

        mesh = build_mesh(density, place, tex_h)
        mesh.materials.append(build_material(colour_path, normal_path))
        obj = bpy.data.objects.new(NODE_NAME, mesh)
        obj['authoredCastShadow'] = False
        obj['authoredReceiveShadow'] = False
        scene.collection.objects.link(obj)

        props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
        kwargs = dict(
            filepath=out_path,
            export_format='GLB',
            export_image_format='AUTO',
            export_vertex_color='NONE',
            export_texcoords=True,
            export_normals=True,
            export_tangents=False,
            export_extras=True,
            export_yup=True,
            export_apply=False,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-manifest-body.py)',
        )
        bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_MANIFEST_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes tris {tris} '
          f'atlas {TEX_W}x{tex_h} at {density:.0f} px/m bounds {lo.round(4).tolist()} {hi.round(4).tolist()}')


main()
