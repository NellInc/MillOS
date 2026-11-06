"""Yard fire-extinguisher station (world-yard-extinguisher-body), built from scratch in headless Blender.

What it builds
--------------
The wall-board fire-extinguisher station that stands at each truck dock
(src/components/TruckBay.tsx `FireExtinguisherStation`, four instances at
x +-5.5 on the dock lines, turned +-90 deg to face inward). Delivered scale,
three.js metres, origin at ground centre, +Z front: 0.500 W x 1.025 H x 0.275 D.

* Backboard (round 5, repainted round 6): a CLOSED solid sheet-steel case, not
  a tray. Signal red (#b91c1c) on every face, a value step below the header
  (#dc2626) and the body (#ea3a2c), so the three reds separate by paint value
  rather than by dark separator geometry (round 6's oxblood #741c1b read as
  maroon, off the red identity). Front edges chamfered
  16 mm, rear perimeter chamfered 20 mm: the back is one finished face with a
  rolled rim and nothing else on it (round 5's flat dark hanger plates read as
  frame geometry poking through, so they are gone); it owns z -0.1375.
* Header housing (round 5): the header is seated in a dark steel (#1f2937)
  surround rather than told apart by a tone shift: the plate's bevel frames it
  on four sides, its bottom bevel is drawn out into a 38 mm sloped band, and the
  board's front chamfers above y 0.83 and its top chamfer are the same dark
  steel. Canonical red (#dc2626) plate face, x +-0.226, y 0.868..0.994.
* Bracket: a dark (#1f2937) standoff block 2 cm deep on the board, from the
  floor to y 0.47, wider than the cylinder (x +-0.122); the cylinder's back
  rests on it. ONE omega clamp traced as a plan profile and extruded in y: two
  feet flat on the block face, legs forward to the cylinder's flanks, the strap
  round the front on the cylinder's facets (its normals roll over its top and
  bottom edges so it shades as a crowned strap).
* Extinguisher (round 5): ONE revolved silhouette from the foot to the valve
  cap. A 12-sided lathe (vertices at 0 and +-90 deg; the back 60 deg sits on the
  block): black rolled foot whose top rim stands 2.5 mm proud of the body as a
  base lip, bright signal-red body (#ea3a2c), two-band domed shoulder, a collar,
  then the valve head as the same lathe narrowing on hexagonal rings (a tapered
  forged body under a low pyramid cap), green gauge on its front flat. Cream
  label round the front 120 deg.
* Lever and carry handle (round 5): two STRAIGHT tapered bars lofted from a
  wide pivot section inside the valve to a narrow tip, with corner normals
  rolled so each shades as a rounded section: no kinks. The lever's vertical cut
  tip is the envelope's front.
* Hose (round 5): a 5-sided tube swept along a sampled arc (four rings, parallel
  transported frames, smooth normals) out of the valve's +60 deg flat, over the
  shoulder and down over the strap into a cone horn.

Runtime anchors kept
--------------------
* The GLB is placed at station [0, 0.75, 0.0975]; the runtime draws
  'FIRE EXTINGUISHER' at station [0, 1.7, 0.05] (fontSize 0.05, about 0.46 m
  wide), which is GLB y 0.95 and z -0.0475. The header face is at z -0.0575,
  1 cm behind the text, and spans x +-0.226, y 0.868..0.994.
* Nothing measures the GLB; the fallback primitives in TruckBay.tsx keep the
  same footprint.

Contract (public/models/asset-manifest.json)
--------------------------------------------
bounds x +-0.250, y 0..1.025, z +-0.1375 (1 mm tolerance; asserted before export):
the board's sides own +-X, the board owns y 0 and y 1.025 (the cylinder foot and
the block also stand on y 0), the back face owns z -0.1375 and the lever's
cut tip owns z +0.1375. One node `Yard-extinguisher-bodyBody` (unit mesh,
translation (0, 0.5125, 0), uniform scale 1.025: the transform the delivered
parent node carried), one material, no textures (COLOR_0 carries the paint, as
delivered; maxTextures is a ceiling), single sided. maxRenderVertices 660
counts index entries, so 220 triangles.

Faces that can never be seen are not built: the bottoms of the board and the
block (both stand on y 0 here and hang at 0.75 m, above no eye), the backs of
parts sitting on the board or the block (the lathe's back 60 deg, the clamp's
inside and edges), the bars' pivot ends inside the valve, the horn's mouth.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-extinguisher-body.py -- <out.glb>

Re-runnable and deterministic. Writes only <out.glb>.
"""

import math
import os
import sys

import bpy

INDEX_BUDGET = 660

# ---------------------------------------------------------------- envelope (glTF metres)
HALF_W = 0.25
TOP = 1.025
Z_BACK = -0.1375
Z_FRONT_LIMIT = 0.1375
BOUNDS_TOL = 0.0004

# Board: a closed case. Front face, 16 mm front chamfer, sides, 20 mm rear
# chamfer, back face at Z_BACK.
Z_BOARD = -0.0675  # board front face
Z_FACE = -0.0575  # header plate front face (runtime text sits at -0.0475, 1 cm proud)
CHAMFER = 0.016
RCH = 0.020
Z_BACK_FACE = Z_BACK  # the back face owns the rear limit (round 6: no hanger plates)
# Header housing: plate face rectangle, bevel outer rectangle (bottom drawn out
# into the band), and where the board's front chamfers turn dark.
HEADER_FACE = (-0.226, 0.868, 0.226, 0.994)
HEADER_OUTER = (-0.236, 0.830, 0.236, 1.004)
HOUSING_Y = 0.830

# Bracket: a dark standoff block 2 cm proud of the board, floor to y 0.47, and
# ONE omega clamp traced in plan whose feet lie on the block face.
BLOCK = dict(x=0.122, y0=0.0, y1=0.470, inset=0.006, t=0.020)
Z_BLOCK = Z_BOARD + BLOCK['t']  # block front face

# Lathe rings: body rings step 30 deg from -150 to +150 (vertices at 0 and +-90),
# valve rings 60 deg (-150..150, flats front, +-60, +-120). The back 60 deg is
# open: it sits on the block.
RING = [math.radians(a) for a in range(-150, 151, 30)]
HEX = [math.radians(a) for a in (-150, -90, -30, 30, 90, 150)]
R_CYL = 0.080
APOTHEM_BACK = R_CYL * math.cos(math.radians(30))
ZC = Z_BLOCK + APOTHEM_BACK + 0.0005  # cylinder axis z

# The silhouette, (radius, y, normal elevation deg), foot to cap.
FOOT = ((0.070, 0.000, -50), (0.0825, 0.024, -8))  # top rim 2.5 mm proud: the base lip
BODY = ((R_CYL, 0.016, 0), (R_CYL, 0.385, 0))
SHOULDER = ((R_CYL, 0.385, 10), (0.058, 0.447, 40), (0.031, 0.474, 68))  # 12 -> 6 -> collar
VALVE = ((0.031, 0.474, 8), (0.0235, 0.530, 8))  # tapered forged body on hex rings
CAP_APEX_Y = 0.541
CAP_NORMAL_ELEV = 55
LABEL_Y0, LABEL_Y1 = 0.10, 0.27
LABEL_RING = [math.radians(a) for a in (-60, -30, 0, 30, 60)]
LABEL_OFFSET = 0.0012
GAUGE_R = 0.010
GAUGE_Y = 0.494

# Omega clamp: strap y range, strap radius, foot outer x; strap normals roll
# by STRAP_ROLL over its top and bottom edges.
CLAMP = dict(y0=0.310, y1=0.370, r=0.0835, foot_x=0.112, foot_lift=0.002)
ARC = [math.radians(a) for a in (90, 60, 30, 0, -30, -60, -90)]
STRAP_ROLL = 0.45

# Bars: (pivot z, pivot y), (tip z, tip y), pivot half width/thickness, tip
# half width/thickness. Pivots sit inside the valve; tips are vertical cuts.
LEVER = dict(p0=(ZC - 0.012, 0.528), p1=(Z_FRONT_LIMIT, 0.584), hw0=0.014, ht0=0.0065, hw1=0.010, ht1=0.0045)
HANDLE = dict(p0=(ZC - 0.006, 0.512), p1=(0.124, 0.524), hw0=0.012, ht0=0.0045, hw1=0.009, ht1=0.004)
BAR_ROLL = 0.6

# Hose: sampled arc in the +60 deg vertical plane, (radius from axis, y).
HOSE_THETA = math.radians(60)
HOSE_R = 0.011
HOSE_SIDES = 5
HOSE_PATH = [(0.018, 0.500), (0.064, 0.493), (0.093, 0.452), (0.093, 0.278)]
NOZZLE = dict(rho0=0.093, y0=0.282, r0=0.012, rho1=0.102, y1=0.208, r1=0.020)

NODE_NAME = 'Yard-extinguisher-bodyBody'
MESH_NAME = 'yard-extinguisher-body-mesh'
MATERIAL_NAME = 'yard-extinguisher-body-surface'
SCENE_NAME = 'MillOS_World_Yard-extinguisher-body'
NODE_Y = TOP / 2
NODE_SCALE = TOP

ROUGHNESS = 0.5
METALNESS = 0.05

PALETTE = {
    'board': '#b91c1c',  # signal red, a value step below header and body (oxblood read as maroon)
    'header': '#dc2626',
    'steel': '#1f2937',
    'body': '#ea3a2c',
    'foot': '#16191f',
    'valve': '#2b3340',
    'lever': '#4b5563',
    'hose': '#111318',
    'nozzle': '#262c35',
    'gauge': '#22c55e',
    'label': '#ece6d8',
}


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def colour(name):
    h = PALETTE[name].lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16)) for i in (0, 2, 4)) + (1.0,)


def out_path():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: Blender -b --factory-startup -P yard-extinguisher-body.py -- <out.glb>')
    return os.path.abspath(argv[0])


# ---------------------------------------------------------------- vector helpers

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    length = math.sqrt(dot(a, a))
    return scale(a, 1.0 / length)


def newell(points):
    n = [0.0, 0.0, 0.0]
    for i, p in enumerate(points):
        q = points[(i + 1) % len(points)]
        n[0] += (p[1] - q[1]) * (p[2] + q[2])
        n[1] += (p[2] - q[2]) * (p[0] + q[0])
        n[2] += (p[0] - q[0]) * (p[1] + q[1])
    return tuple(n)


# ---------------------------------------------------------------- face collector

class Builder:
    """Faces in glTF metres. Each face: corner points, corner normals, one colour.

    The outward hint fixes winding: the polygon is reversed if its Newell normal
    disagrees with the hint, so a face can never be wound inward (the material
    is single sided, so an inward face would simply vanish)."""

    def __init__(self):
        self.faces = []

    def face(self, points, colour_name, normals=None, hint=None):
        points = list(points)
        if normals is None:
            n = norm(newell(points))
            if hint is not None and dot(n, hint) < 0:
                n = scale(n, -1)
            normals = [n] * len(points)
        else:
            normals = [norm(n) for n in normals]
        if hint is None:
            hint = norm(tuple(sum(n[i] for n in normals) for i in range(3)))
        if dot(newell(points), hint) < 0:
            points.reverse()
            normals.reverse()
        self.faces.append((points, normals, colour_name))

    def quad_flat(self, a, b, c, d, colour_name, hint):
        self.face([a, b, c, d], colour_name, hint=hint)

    def triangles(self):
        return sum(len(f[0]) - 2 for f in self.faces)


def raised_plate(bld, outer, inner, z_base, z_face, face_col, bevel_col, skip=()):
    """A pressed plate on a surface: front face `inner` (x0, y0, x1, y1) at
    z_face plus four bevelled sides down to `outer` at z_base. The bevels are
    k = 0 bottom, 1 right, 2 top, 3 left; those in `skip` are not built. No back."""
    o = [(outer[0], outer[1]), (outer[2], outer[1]), (outer[2], outer[3]), (outer[0], outer[3])]
    i = [(inner[0], inner[1]), (inner[2], inner[1]), (inner[2], inner[3]), (inner[0], inner[3])]
    bld.face([(px, py, z_face) for px, py in i], face_col, hint=(0, 0, 1))
    hints = [(0, -1, 1), (1, 0, 1), (0, 1, 1), (-1, 0, 1)]
    for k in range(4):
        if k in skip:
            continue
        k1 = (k + 1) % 4
        bld.face([(o[k][0], o[k][1], z_base), (o[k1][0], o[k1][1], z_base),
                  (i[k1][0], i[k1][1], z_face), (i[k][0], i[k][1], z_face)],
                 bevel_col, hint=norm(hints[k]))


# ---------------------------------------------------------------- lathe parts

def radial(th, nr=1.0, ny=0.0):
    return (nr * math.sin(th), ny, nr * math.cos(th))


def polar(rho, th, y):
    """Point at radius rho from the cylinder axis, angle th (0 = front, +X at 90 deg)."""
    return (rho * math.sin(th), y, ZC + rho * math.cos(th))


def ring(angles, r, y, n):
    """Ring vertices from -150 to +150 deg: (theta, point, normal). The back
    60 deg between the last vertex and the first is left open (it sits on the block)."""
    return [(t, polar(r, t, y), radial(t, *n)) for t in angles]


def elev(deg):
    a = math.radians(deg)
    return (math.cos(a), math.sin(a))


def lathe_band(bld, angles, r0, y0, r1, y1, col, n0, n1):
    """One band of the revolved silhouette, open across the back 60 deg."""
    lo, hi = ring(angles, r0, y0, n0), ring(angles, r1, y1, n1)
    for k in range(len(angles) - 1):
        bld.face([lo[k][1], lo[k + 1][1], hi[k + 1][1], hi[k][1]], col,
                 normals=[lo[k][2], lo[k + 1][2], hi[k + 1][2], hi[k][2]])


def lathe_strip(bld, angles_lo, r0, y0, angles_hi, r1, y1, col, n0, n1):
    """Band between rings of different vertex counts (both span -150..150):
    walk both by angle, one triangle per step. Open across the back."""
    lo, hi = ring(angles_lo, r0, y0, n0), ring(angles_hi, r1, y1, n1)
    i = j = 0
    while i < len(lo) - 1 or j < len(hi) - 1:
        advance_lo = j == len(hi) - 1 or (i < len(lo) - 1 and lo[i + 1][0] <= hi[j + 1][0] + 1e-9)
        if advance_lo:
            tri = [lo[i], lo[i + 1], hi[j]]
            i += 1
        else:
            tri = [lo[i], hi[j + 1], hi[j]]
            j += 1
        bld.face([v[1] for v in tri], col, normals=[v[2] for v in tri])


def tapered_bar(bld, bar, col):
    """A straight bar lofted from a pivot section (inside the valve, not capped)
    to a narrower tip cut vertically at the tip z. Corner normals roll toward
    the neighbouring face, so the four flat sides shade as a rounded section."""
    (za, ya), (zb, yb) = bar['p0'], bar['p1']
    t = norm((0.0, yb - ya, zb - za))
    up = (0.0, t[2], -t[1])
    xa = (1.0, 0.0, 0.0)
    cos_a = t[2]

    def s(sx, sy):
        return (sx * bar['hw0'], ya + sy * bar['ht0'] * up[1], za + sy * bar['ht0'] * up[2])

    def e(sx, sy):
        return (sx * bar['hw1'], yb + sy * bar['ht1'] / cos_a, zb)

    def rolled(base, side):
        return norm(add(base, scale(side, BAR_ROLL)))

    for sy in (1, -1):  # top and bottom
        base = scale(up, sy)
        bld.face([s(-1, sy), s(1, sy), e(1, sy), e(-1, sy)], col,
                 normals=[rolled(base, scale(xa, -1)), rolled(base, xa), rolled(base, xa), rolled(base, scale(xa, -1))])
    for sx in (1, -1):  # sides
        base = scale(xa, sx)
        bld.face([s(sx, -1), s(sx, 1), e(sx, 1), e(sx, -1)], col,
                 normals=[rolled(base, scale(up, -1)), rolled(base, up), rolled(base, up), rolled(base, scale(up, -1))])
    bld.face([e(-1, -1), e(1, -1), e(1, 1), e(-1, 1)], col, hint=(0, 0, 1))


def sweep_tube(bld, path, radius, sides, col):
    """A tube swept along `path` with parallel-transported ring frames and
    smooth normals. No caps (both ends are buried in other parts)."""
    rings = []
    prev_u = None
    for k, p in enumerate(path):
        if k == 0:
            t = norm(sub(path[1], p))
        elif k == len(path) - 1:
            t = norm(sub(p, path[k - 1]))
        else:
            t = norm(add(norm(sub(p, path[k - 1])), norm(sub(path[k + 1], p))))
        if prev_u is None:
            u = norm(cross(t, (0, 1, 0)))
        else:
            u = norm(sub(prev_u, scale(t, dot(prev_u, t))))
        w = cross(t, u)
        prev_u = u
        rings.append([(add(p, scale(add(scale(u, math.cos(a)), scale(w, math.sin(a))), radius)),
                       add(scale(u, math.cos(a)), scale(w, math.sin(a))))
                      for a in (2 * math.pi * m / sides for m in range(sides))])
    for k in range(len(rings) - 1):
        for m in range(sides):
            m1 = (m + 1) % sides
            a, b, c, d = rings[k][m], rings[k][m1], rings[k + 1][m1], rings[k + 1][m]
            bld.face([a[0], b[0], c[0], d[0]], col, normals=[a[1], b[1], c[1], d[1]])


# ---------------------------------------------------------------- parts

def build_board(bld):
    """A closed sheet-steel case: red front with 16 mm chamfers, red sides, a
    20 mm rear chamfer and a plain back face. The header sits in a dark steel housing: the plate's bevel, its
    drawn-out bottom band, the front chamfers above HOUSING_Y and the top
    chamfer. Open at the bottom (stands on y 0)."""
    x0, x1, y1 = -HALF_W, HALF_W, TOP
    z1, zr = Z_BOARD, Z_BOARD - CHAMFER
    zb, zrb = Z_BACK_FACE, Z_BACK_FACE + RCH
    ch, rc, yh = CHAMFER, RCH, HOUSING_Y
    # Front face
    bld.face([(x0 + ch, 0.0, z1), (x1 - ch, 0.0, z1), (x1 - ch, y1 - ch, z1), (x0 + ch, y1 - ch, z1)],
             'board', hint=(0, 0, 1))
    # Front chamfers: sides split at the housing (red below, dark above), top dark
    for sx, xo, xi in ((-1, x0, x0 + ch), (1, x1, x1 - ch)):
        hint = norm((sx, 0, 1))
        bld.face([(xo, 0.0, zr), (xo, yh, zr), (xi, yh, z1), (xi, 0.0, z1)], 'board', hint=hint)
        bld.face([(xo, yh, zr), (xo, y1, zr), (xi, y1 - ch, z1), (xi, yh, z1)], 'steel', hint=hint)
    bld.face([(x0, y1, zr), (x1, y1, zr), (x1 - ch, y1 - ch, z1), (x0 + ch, y1 - ch, z1)],
             'steel', hint=norm((0, 1, 1)))
    # Sides and top
    bld.face([(x0, 0.0, zrb), (x0, y1, zrb), (x0, y1, zr), (x0, 0.0, zr)], 'board', hint=(-1, 0, 0))
    bld.face([(x1, 0.0, zrb), (x1, y1, zrb), (x1, y1, zr), (x1, 0.0, zr)], 'board', hint=(1, 0, 0))
    bld.face([(x0, y1, zrb), (x1, y1, zrb), (x1, y1, zr), (x0, y1, zr)], 'board', hint=(0, 1, 0))
    # Rear chamfers (mitred at the top corners) and the back face
    bld.face([(x0, 0.0, zrb), (x0, y1, zrb), (x0 + rc, y1 - rc, zb), (x0 + rc, 0.0, zb)],
             'board', hint=norm((-1, 0, -1)))
    bld.face([(x1, 0.0, zrb), (x1, y1, zrb), (x1 - rc, y1 - rc, zb), (x1 - rc, 0.0, zb)],
             'board', hint=norm((1, 0, -1)))
    bld.face([(x0, y1, zrb), (x1, y1, zrb), (x1 - rc, y1 - rc, zb), (x0 + rc, y1 - rc, zb)],
             'board', hint=norm((0, 1, -1)))
    bld.face([(x0 + rc, 0.0, zb), (x1 - rc, 0.0, zb), (x1 - rc, y1 - rc, zb), (x0 + rc, y1 - rc, zb)],
             'board', hint=(0, 0, -1))
    # Header plate in its dark housing
    raised_plate(bld, HEADER_OUTER, HEADER_FACE, Z_BOARD - 0.001, Z_FACE, 'header', 'steel')


def build_bracket(bld):
    # Standoff block: dark, 2 cm proud, floor to y 0.47, steep bevelled sides
    # and top; it stands on y 0, so no bottom bevel.
    b = BLOCK
    raised_plate(bld, (-b['x'], b['y0'], b['x'], b['y1']),
                 (-b['x'] + b['inset'], b['y0'], b['x'] - b['inset'], b['y1'] - b['inset']),
                 Z_BOARD - 0.001, Z_BLOCK, 'steel', 'steel', skip=(0,))

    # Omega clamp: ONE plan profile (x, z), extruded over y0..y1. Feet flat on
    # the block face, legs forward to the cylinder's flanks (theta +-90), strap
    # round the front on the cylinder's facets. Outer faces only; every normal
    # rolls down at the bottom edge and up at the top edge (a crowned strap).
    c = CLAMP
    zf = Z_BLOCK + c['foot_lift']
    r = c['r']
    prof = ([(c['foot_x'], zf, None), (r, zf, None)]
            + [(r * math.sin(t), ZC + r * math.cos(t), t) for t in ARC]
            + [(-r, zf, None), (-c['foot_x'], zf, None)])
    y0, y1 = c['y0'], c['y1']
    down, up = (0.0, -STRAP_ROLL, 0.0), (0.0, STRAP_ROLL, 0.0)
    for k in range(len(prof) - 1):
        (xa, za, ta), (xb, zb, tb) = prof[k], prof[k + 1]
        pts = [(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)]
        if ta is not None and tb is not None:
            na, nb = radial(ta), radial(tb)
        else:
            mid = ((xa + xb) / 2, (za + zb) / 2)
            perp = (-(zb - za), xb - xa)
            # outward: away from the axis for the legs, +Z for the feet
            if abs(za - zf) < 1e-9 and abs(zb - zf) < 1e-9:
                ref = (0.0, 1.0)
            else:
                ref = (mid[0], mid[1] - ZC)
            if perp[0] * ref[0] + perp[1] * ref[1] < 0:
                perp = (-perp[0], -perp[1])
            na = nb = norm((perp[0], 0.0, perp[1]))
        bld.face(pts, 'lever', normals=[add(na, down), add(nb, down), add(nb, up), add(na, up)])


def build_extinguisher(bld):
    # ONE revolved silhouette, foot to cap.
    (fr0, fy0, fe0), (fr1, fy1, fe1) = FOOT
    lathe_band(bld, RING, fr0, fy0, fr1, fy1, 'foot', elev(fe0), elev(fe1))
    (br0, by0, be0), (br1, by1, be1) = BODY
    lathe_band(bld, RING, br0, by0, br1, by1, 'body', elev(be0), elev(be1))
    (s0r, s0y, s0e), (s1r, s1y, s1e), (s2r, s2y, s2e) = SHOULDER
    lathe_strip(bld, RING, s0r, s0y, HEX, s1r, s1y, 'body', elev(s0e), elev(s1e))
    lathe_band(bld, HEX, s1r, s1y, s2r, s2y, 'body', elev(s1e), elev(s2e))
    # Valve head: the lathe continues on hex rings from the collar, tapering.
    (v0r, v0y, v0e), (v1r, v1y, v1e) = VALVE
    lathe_band(bld, HEX, v0r, v0y, v1r, v1y, 'valve', elev(v0e), elev(v1e))
    # Low pyramid cap over the valve, closed across the back too.
    top = ring(HEX, v1r, v1y, elev(CAP_NORMAL_ELEV))
    apex = (0.0, CAP_APEX_Y, ZC)
    for k in range(len(top)):
        a, b = top[k], top[(k + 1) % len(top)]
        bld.face([a[1], b[1], apex], 'valve', normals=[a[2], b[2], (0.0, 1.0, 0.0)])
    # Label: the body's own facets offset outward, front 120 deg.
    rl = R_CYL + LABEL_OFFSET
    lathe_band(bld, LABEL_RING, rl, LABEL_Y0, rl, LABEL_Y1, 'label', (1, 0), (1, 0))
    # Gauge: a diamond on the valve's tapered front flat, 1 mm proud.
    apo0, apo1 = v0r * math.cos(math.pi / 6), v1r * math.cos(math.pi / 6)

    def front_z(y):
        return ZC + apo0 + (apo1 - apo0) * (y - v0y) / (v1y - v0y) + 0.001

    g = GAUGE_R
    bld.face([(0.0, GAUGE_Y - g, front_z(GAUGE_Y - g)), (g, GAUGE_Y, front_z(GAUGE_Y)),
              (0.0, GAUGE_Y + g, front_z(GAUGE_Y + g)), (-g, GAUGE_Y, front_z(GAUGE_Y))],
             'gauge', hint=(0, 0, 1))

    # Operating lever over a carry handle: two straight tapered bars.
    tapered_bar(bld, LEVER, 'lever')
    tapered_bar(bld, HANDLE, 'lever')

    # Hose along a sampled arc, then the horn below the strap.
    sweep_tube(bld, [polar(rho, HOSE_THETA, y) for rho, y in HOSE_PATH], HOSE_R, HOSE_SIDES, 'hose')
    n = NOZZLE
    c0 = polar(n['rho0'], HOSE_THETA, n['y0'])
    c1 = polar(n['rho1'], HOSE_THETA, n['y1'])
    slope = (n['r1'] - n['r0']) / (n['y0'] - n['y1'])
    for m in range(5):
        a0, a1 = 2 * math.pi * m / 5, 2 * math.pi * (m + 1) / 5
        r0 = lambda a: (c0[0] + n['r0'] * math.sin(a), n['y0'], c0[2] + n['r0'] * math.cos(a))
        r1 = lambda a: (c1[0] + n['r1'] * math.sin(a), n['y1'], c1[2] + n['r1'] * math.cos(a))
        nr = lambda a: (math.sin(a), -slope, math.cos(a))
        bld.face([r0(a0), r0(a1), r1(a1), r1(a0)], 'nozzle', normals=[nr(a0), nr(a1), nr(a1), nr(a0)])


# ---------------------------------------------------------------- mesh

def to_blender_unit(p):
    x, y, z = p[0], p[1] - NODE_Y, p[2]
    return (x / NODE_SCALE, -z / NODE_SCALE, y / NODE_SCALE)


def dir_to_blender(n):
    return (n[0], -n[2], n[1])


def planar_uv(p, n):
    """Box projection on the normal's dominant axis, normalised by the envelope
    (no texture uses it; it is a layout for a later atlas pass)."""
    ax = max(range(3), key=lambda i: abs(n[i]))
    lo = (-HALF_W, 0.0, Z_BACK)
    span = (2 * HALF_W, TOP, Z_FRONT_LIMIT - Z_BACK)
    a, b = {0: (2, 1), 1: (0, 2), 2: (0, 1)}[ax]
    return ((p[a] - lo[a]) / span[a], (p[b] - lo[b]) / span[b])


def check_bounds(bld):
    pts = [p for f in bld.faces for p in f[0]]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    want_lo = (-HALF_W, 0.0, Z_BACK)
    want_hi = (HALF_W, TOP, Z_FRONT_LIMIT)
    for i, axis in enumerate('xyz'):
        if abs(lo[i] - want_lo[i]) > BOUNDS_TOL or abs(hi[i] - want_hi[i]) > BOUNDS_TOL:
            raise SystemExit(f'bounds {axis}: {lo[i]:.4f}..{hi[i]:.4f}, want {want_lo[i]}..{want_hi[i]}')
    print(f'EXTINGUISHER_BOUNDS x {lo[0]:.4f}..{hi[0]:.4f} y {lo[1]:.4f}..{hi[1]:.4f} z {lo[2]:.4f}..{hi[2]:.4f}')


def build_mesh(bld, mat):
    tris = bld.triangles()
    if tris * 3 > INDEX_BUDGET:
        raise SystemExit(f'{tris * 3} indices exceeds the {INDEX_BUDGET}-index budget')
    check_bounds(bld)

    verts, index = [], {}
    faces = []
    for pts, _n, _c in bld.faces:
        f = []
        for p in pts:
            key = tuple(round(c, 6) for c in p)
            if key not in index:
                index[key] = len(verts)
                verts.append(to_blender_unit(p))
            f.append(index[key])
        faces.append(f)
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if len(mesh.polygons) != len(faces):
        raise SystemExit('Blender dropped faces on import')

    flipped = 0
    for poly in mesh.polygons:
        pts, nrm, _c = bld.faces[poly.index]
        hint = norm(tuple(sum(n[i] for n in nrm) for i in range(3)))
        if poly.normal.dot(dir_to_blender(hint)) <= 0:
            flipped += 1
    if flipped:
        raise SystemExit(f'{flipped} faces wound inward')

    uv_layer = mesh.uv_layers.new(name='UVMap')
    col = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    loop_normals = [None] * len(mesh.loops)
    for poly in mesh.polygons:
        pts, nrm, cname = bld.faces[poly.index]
        poly.use_smooth = True
        c = colour(cname)
        for k, li in enumerate(poly.loop_indices):
            uv_layer.data[li].uv = planar_uv(pts[k], nrm[k])
            col.data[li].color = c
            loop_normals[li] = dir_to_blender(nrm[k])
    mesh.color_attributes.active_color = col
    mesh.normals_split_custom_set(loop_normals)
    mesh.materials.append(mat)
    return mesh, tris


def make_material():
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # glTF doubleSided: false, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Metallic'].default_value = METALNESS
    bsdf.inputs['Roughness'].default_value = ROUGHNESS
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def export(path):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_copyright='MillOS authored geometry',
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})


def main():
    path = out_path()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    bld = Builder()
    build_board(bld)
    build_bracket(bld)
    build_extinguisher(bld)
    mat = make_material()
    mesh, tris = build_mesh(bld, mat)
    obj = bpy.data.objects.new(NODE_NAME, mesh)
    scene.collection.objects.link(obj)
    obj.location = (0.0, 0.0, NODE_Y)
    obj.scale = (NODE_SCALE, NODE_SCALE, NODE_SCALE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    export(path)
    print(f'EXTINGUISHER_BUILT {path} triangles={tris} indices={tris * 3} bytes={os.path.getsize(path)}')


main()
