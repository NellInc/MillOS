"""Yard dumpster set (world-yard-dumpster-body), built from scratch in headless Blender.

What it builds
--------------
The receiving yard's waste and recycling station (`DumpsterArea` in
src/components/TruckBay.tsx) at delivered scale: three.js metres, origin at
ground centre, +Z front, envelope 8.36 W x 2.6073 H x 4.36 D.

Construction (round 6 rebuilt the casters, the front panel and the surface by other methods;
every feature is sized to read at the review views' ~1.6-2 cm/px):

* Dumpster body, centred at x -1.5: a loft of 12-point plan rings with 250 mm
  corner rounds, ends and back leaning in 150 mm toward the base, a proud base
  skirt with a ledge line, and a rolled top bead 100 mm proud. Hat-section ribs:
  two front, three back, two on each end wall.
* Casters (dumpster and bin alike) are SWIVEL CASTERS modelled about their kingpin:
  a square plate, a lathed swivel-housing frustum, a crown block, two slanted fork
  plates running down to an axle that TRAILS the kingpin, and a lathed tread band
  with side discs carrying the painted wheel face (UVs taken in the wheel's own
  frame). Each assembly is turned +/-22.5 deg about the kingpin, mirrored left and
  right, which sits midway between the review directions, so no camera sees a
  wheel edge-on. Dumpster: 520 mm wheels under two skid rails. Bin: 340 mm wheels,
  plates in the bin floor (y 0.42).
* Lids: each half one extruded side profile with a flat sloped top, a front lip
  and a forward grab flange, overhanging the side bead; four discrete hinges, each
  a dark barrel on the lid's rear edge carried by a body-green tab welded to the
  back wall.
* Front panel (WASTE / SERVICES carrier): a RAISED bevelled plate lofted from a
  seat on the wall, a plate edge and a 60 mm bevel up to the face (z 1.292), with
  an inset ring on the face so the vertex colour falls off from the lit edge to a
  darker centre, and four bolt heads in the corner margins.
* Recycling bin: tapered chamfered-plan loft with a belt band and heavy rim; a
  moulded tray lid; a dark 90 mm push bar held in two zinc end brackets; sign
  plate with the three-arrow triangle.
* Four yellow lathe-turned bollards at (+/-4, +/-2.0), YARD_BOLLARD's silhouette
  at 8 segments (the chord sag is under a pixel); the reflective band is painted
  into a bollard strip (u = height), so the shaft is one band of faces.

Surface (round 6 method): one 1024 px COLOUR ATLAS whose dirt is DERIVED FROM THE
BUILT GEOMETRY rather than painted from noise. The finished mesh (plus the
runtime's ground pad) goes into a BVH; every wall texel of the perimeter-unwrapped
dumpster and bin walls, and every texel of the lid tops (now given one unique UV
cell per half), is mapped back to its 3D point and a cosine hemisphere of rays is
cast from it. Grime (a warm colour shift, not a second shadow) goes where that
occlusion is: under the bead, beside every rib, round the plate, above and below
the pocket sleeves, by the seam cap and hinges; rain carries it down the face
below in streaks, and on the lids down the slope to the low rear edge. Wear is
on the arrises only; open faces stay clean paint (tone noise about 1%).
Regions: A green walls; W worn edges (each face stretched across the strip so
both arrises carry wear); LT lid tops; L lid plastic; C blue walls; E blue lid;
wheel and plate cells; bollard strip; D flat swatches.
Vertex colour is only a grey light term, multiplied in by the material.

Runtime anchors kept (src/components/TruckBay.tsx, DumpsterArea):
* WASTE / SERVICES captions at (-1.5, 1.26 / 1.0, 1.295): the panel face is at
  z 1.288 and every frame, bevel and bolt face that is proud of 1.2951 stays outside
  both caption envelopes, and the panel still occludes the captions' old buried
  positions (z 1.27 at y 1.5 and 1.15), as DumpsterLabelFixture.test.tsx requires.
* RECYCLING caption at (2.5, 1.1, 0.76): the bin front stays at z 0.75 there.
* One node 'Yard-dumpster-bodyBody', one mesh, one primitive, one material.

Contract (public/models/asset-manifest.json): at most 5382 render vertices
(index count, so 1794 triangles), 1 material, <= 2 textures, 437000 bytes, the
bounds above.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-dumpster-body.py -- <out.glb>

Deterministic and re-runnable; writes only <out.glb>.
"""

import math
import sys

import bpy
import numpy as np

NODE_NAME = 'Yard-dumpster-bodyBody'
MESH_NAME = 'yard-dumpster-body-mesh'
MATERIAL_NAME = 'yard-dumpster-body-surface'
IMAGE_NAME = 'yard-dumpster-body-atlas'
SCENE_NAME = 'MillOS_World_Yard-dumpster-body'
MAX_TRIANGLES = 1794
TEX = 1024
U_TILE = 2.4         # metres per horizontal repeat in the wrapping regions

# ------------------------------------------------------------------ dimensions (three.js metres)
APEX = 2.6073  # manifest height; the seam cap's front top
LID_SLOPE = math.tan(0.2)

D_CX = -1.5          # dumpster centre x
D_HX, D_HZ = 2.0, 1.25
D_CORNER = 0.25      # corner rounds
D_BOTTOM = 0.70
D_TAPER = 0.15       # end and back walls lean in this much at the base
D_TAPER_TOP = 2.30   # y where the lean reaches zero
SKIRT_OUT = 0.045
SKIRT_LO, SKIRT_HI, STEP_Y = 0.72, 0.80, 0.812
LID_T = 0.06
LIP = 0.16
FLANGE = 0.07
SEAM_H = 0.035
LID_Z0, LID_Z1 = -1.34, 1.40
LID_X_OUT = 2.12      # lids overhang the side bead (crown at 2.10)
PIN_Z = -1.385

CASTER_R = 0.26
CASTER_W = 0.17
CASTER_X = 1.35
CASTER_Z = (-0.72, 0.80)
# Swivel about the kingpin, mirrored left/right. 22.5 deg sits midway between the review
# directions (0, 45, 60, 90, 120, 135 mod 180), so no camera sees a wheel edge-on.
CASTER_SWIVEL = math.radians(22.5)
CASTER_TRAIL = 0.10                  # the axle trails the kingpin
CROWN_Y = (0.528, 0.558)
HOUSING_Y = (0.532, 0.612)   # starts 4 mm above the crown floor: seated in the crown
PLATE_Y0, PLATE_Y1 = 0.608, 0.638
RAIL_Y0, RAIL_Y1 = 0.634, 0.72

B_CX = 2.5           # bin centre x
B_HX_TOP, B_HX_BASE = 1.0, 0.84
B_ZF = 0.75
B_ZB_TOP, B_ZB_BASE = -0.75, -0.59
B_CHAMFER = 0.10
B_BOTTOM = 0.42
B_WALL_TOP = 1.50
B_TOP = 1.60
B_RIM_OUT = 0.08
B_WHEEL_R = 0.17
B_WHEEL_W = 0.09
B_SWIVEL = math.radians(22.5)
B_TRAIL = 0.06

BOLLARD_Z = 2.0      # the 8-gon's 0 and 90 deg vertices land the x and z extremes (4.18, 2.18)
BOLLARDS = [(-4.0, -BOLLARD_Z), (-4.0, BOLLARD_Z), (4.0, -BOLLARD_Z), (4.0, BOLLARD_Z)]
BOLLARD_SEGMENTS = 8
# (radius, y, smooth-group). The reflective band (y 0.35-0.462) is painted into the bollard strip
# of the atlas and reached through UVs (v = height), so the shaft is one band of faces.
BOLLARD_PROFILE = [
    (0.18, 0.0, 0),
    (0.15, 0.08, 1),     # grout skirt cone
    (0.15, 0.636, 2),    # pipe shaft
    (0.11, 0.75, 3),     # pressed dome
    (0.0, 0.8, 3),
]
BOLLARD_BAND = (0.35, 0.462)


def out_path():
    argv = sys.argv
    if '--' not in argv or argv.index('--') + 1 >= len(argv):
        raise SystemExit('usage: Blender -b --factory-startup -P yard-dumpster-body.py -- <out.glb>')
    return argv[argv.index('--') + 1]


# ------------------------------------------------------------------ vectors
def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    length = math.sqrt(dot(a, a))
    return (a[0] / length, a[1] / length, a[2] / length)


def centroid(points):
    return tuple(sum(p[i] for p in points) / len(points) for i in range(3))


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def clamp01(x):
    return min(1.0, max(0.0, x))


def vhash(p):
    """Deterministic 0..1 value per position (same corner -> same value in every face)."""
    s = math.sin(p[0] * 12.9898 + p[1] * 78.233 + p[2] * 37.719) * 43758.5453
    return s - math.floor(s)


def face_normal(poly):
    n = (0.0, 0.0, 0.0)
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        n = add(n, ((a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])))
    return norm(n)


def away_from(poly, ref):
    """Wind poly so its normal points away from ref."""
    return poly if dot(face_normal(poly), sub(centroid(poly), ref)) > 0 else list(reversed(poly))


def part_offset(part):
    h = 0
    for ch in part:
        h = (h * 131 + ord(ch)) % 1000003
    return (h % 997) / 997.0


# ------------------------------------------------------------------ atlas layout (UV v is bottom-up)
A_V0, A_V1, A_Y0, A_Y1 = 0.505, 0.995, 0.55, 2.65     # green walls: u = perimeter, v = height
W_V0, W_V1, W_SPAN = 0.415, 0.485, 0.30               # green worn edges; faces <= 0.30 m across
L_V0, L_V1, L_SPAN = 386 / 1024, 414 / 1024, 2.85     # green lid plastic, generic (lid sides, seam)
LT_U = ((4 / 1024, 506 / 1024), (518 / 1024, 1020 / 1024))  # lid tops, one unique cell per half:
LT_V0, LT_V1 = 260 / 1024, 380 / 1024                        # u along z, v along x (baked occlusion)
C_U0, C_U1, C_SPAN = 0.005, 0.370, 2.30               # blue walls: u = perimeter, v = height
C_V0, C_V1, C_Y0, C_Y1 = 0.005, 0.235, 0.20, 1.80
E_U0, E_V0, E_SIZE, E_SPAN = 0.513, 0.005, 0.23, 2.40  # blue lid plastic
WHEEL_CELL = (384, 0, 128)      # painted wheel face: col0, row0, size (pixels)
PLATE_CELL = (384, 128, 128)    # painted front plate (#14532d) with its recess shadow
BOLLARD_COLS, BOLLARD_ROW, BOLLARD_YMAX = (770, 1022), 224, 0.8   # bollard strip: u = height
SWATCHES = {
    'yellow': '#fbbf24', 'reflect': '#eceae4', 'tyre': '#1b1d20', 'hub': '#b9bec5',
    'zinc': '#a9afb7', 'steel': '#6a7078', 'pin': '#2a2e33', 'handle': '#23272c',
    'white': '#eef2f6', 'symbol': '#16a34a', 'pocket': '#24302a', 'bar': '#c2c7ce',
}
SWATCH_INDEX = {name: i for i, name in enumerate(SWATCHES)}


def swatch_uv(name):
    i = SWATCH_INDEX[name]
    col, row = i % 4, i // 4
    return (0.75 + (col + 0.5) / 16.0, (row + 0.5) / 16.0)


def px_uv(col, row):
    """Atlas pixel position (columns from the left, rows from the bottom) -> UV."""
    return (col / TEX, row / TEX)


def ring_fracs(ring):
    """Cumulative plan arc-length fractions of a closed ring: n + 1 values, 0 .. 1."""
    cum = [0.0]
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[2] - a[2]))
    return [c / cum[-1] for c in cum], cum[-1]


def wall_uv(key, frac, y):
    """Perimeter-unwrapped wall UV: u = arc fraction round the body, v = world height."""
    if key == 'A':
        return (frac, A_V0 + clamp01((y - A_Y0) / (A_Y1 - A_Y0)) * (A_V1 - A_V0))
    return (C_U0 + frac * (C_U1 - C_U0), C_V0 + clamp01((y - C_Y0) / (C_Y1 - C_Y0)) * (C_V1 - C_V0))


# ------------------------------------------------------------------ light term (vertex colour)
def sh(key, base=1.0, top=1.0, side=0.92, under=0.55, hash_amp=0.04, ao=True):
    """Grey light multiplier for a face in atlas region `key` (A, W, L, C, E or D:<swatch>)."""
    def shade(p, n):
        k = base * (top if n[1] > 0.6 else (under if n[1] < -0.6 else side))
        k *= 1.0 - hash_amp + 2 * hash_amp * vhash(p)
        if ao:
            k *= 0.80 + 0.20 * smoothstep(0.0, 0.45, p[1])
        k = min(1.0, k)
        return (k, k, k)
    shade.key = key
    return shade


# ------------------------------------------------------------------ mesh builder
class Builder:
    def __init__(self):
        self.verts, self.faces, self.colours, self.uvs, self.smooth = [], [], [], [], []
        self.index = {}
        self.triangles = 0
        self.part_tris = {}

    def uv_for(self, key, part, poly, n):
        if key.startswith('D:'):
            return [swatch_uv(key[2:])] * len(poly)
        ax = max(range(3), key=lambda i: abs(n[i]))
        if ax == 1:
            st = [(p[0], p[2]) for p in poly]
        elif ax == 0:
            st = [(p[2], p[1]) for p in poly]
        else:
            st = [(p[0], p[1]) for p in poly]
        st0 = st
        ss, ts = [s for s, _ in st], [t for _, t in st]
        ext_s, ext_t = max(ss) - min(ss), max(ts) - min(ts)
        if key == 'A' and ax == 1:
            key = 'L'
        if key == 'C' and ax == 1:
            key = 'E'
        if key == 'W':
            if ext_s < ext_t:
                st = [(t, s) for s, t in st]
                ss, ts = ts, ss
                ext_s, ext_t = ext_t, ext_s
            if ext_t > W_SPAN:
                key = 'L' if ax == 1 else 'A'
                st = st0
        ou = part_offset(part)
        out = []
        for (s, t), p in zip(st, poly):
            if key == 'A':
                u, v = s / U_TILE + ou, A_V0 + clamp01((p[1] - A_Y0) / (A_Y1 - A_Y0)) * (A_V1 - A_V0)
            elif key == 'W':
                # Stretched across the strip: both long edges of every face land on the strip's
                # painted worn borders, so chipping follows the arrises.
                u, v = s / U_TILE + ou, W_V0 + (t - min(ts)) * (W_V1 - W_V0) / max(ext_t, 1e-6)
            elif key == 'L':
                tmin = min(q[1] for q in st)
                ext = max(q[1] for q in st) - tmin
                k = (L_V1 - L_V0) / max(L_SPAN, ext)
                u, v = s / U_TILE + ou, L_V0 + (t - tmin) * k
            elif key == 'C':
                k = (C_U1 - C_U0) / max(C_SPAN, ext_s)
                u, v = C_U0 + (s - min(ss)) * k, C_V0 + clamp01((p[1] - C_Y0) / (C_Y1 - C_Y0)) * (C_V1 - C_V0)
            elif key == 'E':
                k = E_SIZE / max(E_SPAN, ext_s, ext_t)
                u, v = E_U0 + (s - min(ss)) * k, E_V0 + (t - min(ts)) * k
            else:
                raise SystemExit(f'unknown atlas key {key}')
            out.append((u, v))
        return out

    def face(self, part, poly, shade, group=None, uv=None):
        """poly: points in three.js metres, already wound outward. shade(p, n) -> grey; shade.key -> region.

        uv: explicit per-point UVs (same order as poly), or a callable p -> (u, v).
        """
        n = face_normal(poly)
        idx = []
        for p in poly:
            if group is None:
                idx.append(len(self.verts))
                self.verts.append(p)
            else:
                key = (part, group, round(p[0], 6), round(p[1], 6), round(p[2], 6))
                if key not in self.index:
                    self.index[key] = len(self.verts)
                    self.verts.append(p)
                idx.append(self.index[key])
            self.colours.append(shade(p, n))
        if callable(uv):
            self.uvs.extend(uv(p) for p in poly)
        elif uv is not None:
            self.uvs.extend(uv)
        else:
            self.uvs.extend(self.uv_for(getattr(shade, 'key', 'A'), part, poly, n))
        self.faces.append(idx)
        self.smooth.append(group is not None)
        self.triangles += len(poly) - 2
        self.part_tris[part] = self.part_tris.get(part, 0) + len(poly) - 2

    def solid(self, part, polys, shade, skip=None):
        """Closed convex solid: wind every face against the solid's centroid."""
        ref = centroid([p for poly in polys for p in poly])
        for i, poly in enumerate(polys):
            if skip and i in skip:
                continue
            self.face(part, away_from(poly, ref), shade)


def box_polys(x0, x1, y0, y1, z0, z1):
    """Faces order: 0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z."""
    return [
        [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],
        [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)],
        [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
        [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)],
        [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)],
        [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
    ]


def hexa_polys(bottom, top):
    """Eight-corner solid; bottom/top are 4 corners in matching order. Faces: 0 bottom, 1 top, 2.. sides."""
    polys = [list(bottom), list(top)]
    for i in range(4):
        j = (i + 1) % 4
        polys.append([bottom[i], bottom[j], top[j], top[i]])
    return polys


def ring_bands(builder, part, rings, shades, caps=(True, True), groups=None, arc_ref=None):
    """Loft closed rings (same vertex count, same order) into an outward-wound solid.

    shades: one shade for everything, or a list with one per band plus [bottom cap, top cap].
    groups: optional smooth-group name per band (None = flat).
    arc_ref: a reference ring; bands shaded in wall regions A or C are then unwrapped round the
    perimeter (u = that ring's arc fraction at each ring index, so every arris lands on the same
    u at every height; v = world height) instead of being projected face by face.
    The winding of [a_i, a_j, b_j, b_i] is the same for every band, so it is decided once on
    the tallest band (whose outward direction is unambiguously radial) and applied to all,
    including horizontal ledge bands where a radial test cannot tell up from down.
    """
    if callable(shades):
        shades = [shades] * (len(rings) + 1)
    n = len(rings[0])
    tallest = max(range(len(rings) - 1),
                  key=lambda k: min(abs(rings[k + 1][i][1] - rings[k][i][1]) for i in range(n)))
    a, b = rings[tallest], rings[tallest + 1]
    ref = centroid(a + b)
    probe = [a[0], a[1], b[1], b[0]]
    c = centroid(probe)
    keep = dot(face_normal(probe), sub(c, (ref[0], c[1], ref[2]))) > 0
    fracs = ring_fracs(arc_ref)[0] if arc_ref else None
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        group = groups[k] if groups else None
        key = getattr(shades[k], 'key', None)
        for i in range(n):
            j = (i + 1) % n
            quad = [a[i], a[j], b[j], b[i]]
            uv = None
            if fracs and key in ('A', 'C'):
                fi, fj = fracs[i], fracs[i + 1]
                uv = [wall_uv(key, fi, a[i][1]), wall_uv(key, fj, a[j][1]),
                      wall_uv(key, fj, b[j][1]), wall_uv(key, fi, b[i][1])]
            if not keep:
                quad = list(reversed(quad))
                uv = list(reversed(uv)) if uv else None
            builder.face(part, quad, shades[k], group=group, uv=uv)
    if caps[0]:
        builder.face(part, away_from(list(rings[0]), add(centroid(rings[0]), (0, 1, 0))), shades[-2])
    if caps[1]:
        builder.face(part, away_from(list(rings[-1]), add(centroid(rings[-1]), (0, -1, 0))), shades[-1])


def extrude_profile(builder, part, profile, x0, x1, shade, side_shade=None, face_uv=None):
    """Extrude a closed (z, y) profile along x from x0 to x1; works for concave profiles.

    Side faces are wound by the profile's own orientation (outward = right of a clockwise
    walk), not by a centroid test, so the inner faces of an L-shaped lip stay outward.
    face_uv: optional {profile edge index: callable p -> (u, v)} for faces with their own UVs.
    """
    area = 0.0
    for i in range(len(profile)):
        (za, ya), (zb, yb) = profile[i], profile[(i + 1) % len(profile)]
        area += za * yb - zb * ya
    ccw = area > 0
    for i in range(len(profile)):
        (za, ya), (zb, yb) = profile[i], profile[(i + 1) % len(profile)]
        dz, dy = zb - za, yb - ya
        out2 = (dy, -dz) if ccw else (-dy, dz)   # outward normal in (z, y)
        quad = [(x0, ya, za), (x0, yb, zb), (x1, yb, zb), (x1, ya, za)]
        n = face_normal(quad)
        if n[2] * out2[0] + n[1] * out2[1] < 0:
            quad = list(reversed(quad))
        builder.face(part, quad, shade, uv=(face_uv or {}).get(i))
    cap_shade = side_shade or shade
    for x, sgn in ((x0, -1), (x1, 1)):
        cap = [(x, y, z) for z, y in profile]
        if face_normal(cap)[0] * sgn < 0:
            cap = list(reversed(cap))
        builder.face(part, cap, cap_shade)


def chamfer_rect(cx, cz, x0, x1, z0, z1, c, y_of):
    """8-corner chamfered rectangle (counter-clockwise seen from above), y from y_of(x, z)."""
    pts2 = [(x1 - c, z1), (x1, z1 - c), (x1, z0 + c), (x1 - c, z0),
            (x0 + c, z0), (x0, z0 + c), (x0, z1 - c), (x0 + c, z1)]
    return [(cx + x, y_of(cx + x, cz + z), cz + z) for x, z in pts2]


def rounded_quadrants(hx, hz, r):
    """12 points of a rounded rectangle centred on 0 (3 per corner), with each point's quadrant."""
    out = []
    for sx, sz, start in ((1, 1, 90.0), (1, -1, 0.0), (-1, -1, 270.0), (-1, 1, 180.0)):
        cxr, czr = sx * (hx - r), sz * (hz - r)
        for k in range(3):
            a = math.radians(start - 45.0 * k)
            out.append((cxr + r * math.cos(a), czr + r * math.sin(a), sx, sz))
    return out


def cylinder(builder, part, centre, axis, radius, length, sides, shade, cap_shade=None, start=0.0, caps=True):
    """Axis is 'x', 'y' or 'z'. Side faces smooth, caps flat n-gons."""
    def point(t, a):
        u, v = radius * math.cos(a), radius * math.sin(a)
        if axis == 'x':
            return (centre[0] + t, centre[1] + v, centre[2] + u)
        if axis == 'z':
            return (centre[0] + u, centre[1] + v, centre[2] + t)
        return (centre[0] + u, centre[1] + t, centre[2] + v)

    h = length / 2
    angles = [start + 2 * math.pi * i / sides for i in range(sides)]
    lo = [point(-h, a) for a in angles]
    hi = [point(h, a) for a in angles]
    for i in range(sides):
        j = (i + 1) % sides
        quad = [lo[i], lo[j], hi[j], hi[i]]
        c = centroid(quad)
        if axis == 'x':
            ref = (c[0], centre[1], centre[2])
        elif axis == 'z':
            ref = (centre[0], centre[1], c[2])
        else:
            ref = (centre[0], c[1], centre[2])
        builder.face(part, away_from(quad, ref), shade, group=('side', centre))
    if caps:
        builder.face(part, away_from(lo, centre), cap_shade or shade)
        builder.face(part, away_from(hi, centre), cap_shade or shade)


def oriented(poly, ref, uv):
    """Wind poly (and its UVs) so the normal points away from ref."""
    if dot(face_normal(poly), sub(centroid(poly), ref)) > 0:
        return poly, uv
    return list(reversed(poly)), list(reversed(uv))


def caster(builder, part, kx, kz, theta, R, W, sides, trail, leg_t, leg_top_hx, crown, housing, plate):
    """One swivel caster, modelled as the joint it is and turned about its kingpin.

    Built in the caster's own frame (x' = rolling direction, z' = axle, kingpin at the origin) and
    rotated by theta about the vertical kingpin at (kx, kz), so the wheel is seen at an angle from
    the front AND from the ends instead of edge-on as a thin black leg:
    * wheel: lathed tread band (smooth) and two side discs whose UVs, taken in the wheel's own
      frame, carry the painted wheel face; its axle TRAILS the kingpin by `trail`;
    * fork: two slanted side plates running from the crown over the kingpin down to the trailing
      axle (the caster silhouette), seated 4 mm into the wheel sides, joined by a crown block;
    * swivel housing: a lathed bearing frustum between the crown and the plate, about the kingpin;
    * plate: the square mounting plate, square to the chassis whatever the swivel.
    crown = (y0, y1); housing = (r_bottom, r_top, y0, y1); plate = (half x, half z, y0, y1).
    """
    c, s = math.cos(theta), math.sin(theta)

    def T(p):
        lx, ly, lz = p
        return (kx + lx * c - lz * s, ly, kz + lx * s + lz * c)

    ax = -trail
    axle = T((ax, R, 0.0))
    angles = [-math.pi / 2 + 2 * math.pi * i / sides for i in range(sides)]
    local = {side: [(ax + R * math.cos(a), R + R * math.sin(a), side * W / 2) for a in angles] for side in (-1, 1)}
    lo, hi = [T(p) for p in local[-1]], [T(p) for p in local[1]]
    rubber = sh('D:tyre', side=1.0, top=1.0, under=0.7, hash_amp=0.06)
    for i in range(sides):
        j = (i + 1) % sides
        builder.face(part, away_from([lo[i], lo[j], hi[j], hi[i]], axle), rubber, group=('tread', axle))
    disc = sh('D:hub', side=1.0, top=1.0, under=1.0, hash_amp=0.0, ao=False)
    c0, r0, size = WHEEL_CELL
    cu, cv, half = (c0 + size / 2) / TEX, (r0 + size / 2) / TEX, 0.48 * size / TEX
    for side in (-1, 1):
        pts = [T(p) for p in local[side]]
        uv = [(cu + half * (p[0] - ax) / R, cv + half * (p[1] - R) / R) for p in local[side]]
        poly, uv = oriented(pts, axle, uv)
        builder.face(part, poly, disc, uv=uv)

    zinc = sh('D:zinc', side=0.95, under=0.6)
    zin = W / 2 - 0.004
    zout = zin + leg_t
    prof = [(ax - 0.055, R - 0.06), (ax + 0.055, R - 0.06), (leg_top_hx, crown[0] + 0.006),
            (-leg_top_hx, crown[0] + 0.006)]
    for side in (-1, 1):
        inner = [T((x, y, side * zin)) for x, y in prof]
        outer = [T((x, y, side * zout)) for x, y in prof]
        builder.solid(part, hexa_polys(inner, outer), zinc, skip={4})   # 4: top edge, inside the crown
    crown_polys = [[T(p) for p in poly] for poly in
                   box_polys(-leg_top_hx - 0.012, leg_top_hx + 0.012, crown[0], crown[1], -zout, zout)]
    builder.solid(part, crown_polys, sh('D:zinc', base=0.92, side=0.95), skip={3})

    rb, rt, hy0, hy1 = housing
    hsides = 6
    ring_lo = [(kx + rb * math.cos(2 * math.pi * i / hsides), hy0, kz + rb * math.sin(2 * math.pi * i / hsides))
               for i in range(hsides)]
    ring_hi = [(kx + rt * math.cos(2 * math.pi * i / hsides), hy1, kz + rt * math.sin(2 * math.pi * i / hsides))
               for i in range(hsides)]
    bearing = sh('D:steel', side=1.0, ao=False)
    for i in range(hsides):
        j = (i + 1) % hsides
        quad = [ring_lo[i], ring_lo[j], ring_hi[j], ring_hi[i]]
        builder.face(part, away_from(quad, (kx, centroid(quad)[1], kz)), bearing, group=('housing', (kx, kz)))

    phx, phz, py0, py1 = plate
    builder.solid(part, box_polys(kx - phx, kx + phx, py0, py1, kz - phz, kz + phz), sh('D:steel', side=0.9),
                  skip={3})


# ------------------------------------------------------------------ dumpster
def lid_top(z):
    return APEX - SEAM_H - (LID_Z1 - z) * LID_SLOPE


def rim_top(z):
    return lid_top(z) - LID_T + 0.010  # lids sit 10 mm down into the bead


def wall_inset(y):
    return D_TAPER * min(1.0, max(0.0, (D_TAPER_TOP - y) / (D_TAPER_TOP - D_BOTTOM)))


def body_ring(y_of, out=0.0, extra=0.0):
    """Rounded 12-point ring of the dumpster body at a height y_of(z) (z at rim size).

    Ends and back lean in by wall_inset(y); the front is vertical. out grows the ring
    (skirt, bead); extra shrinks it on every side (the chamfer under the skirt).
    """
    pts = []
    for x, z, sx, sz in rounded_quadrants(D_HX + out, D_HZ + out, D_CORNER + max(out, 0.0)):
        y = y_of(z)
        ins = wall_inset(y) + extra
        px = x - sx * ins
        pz = z + ins if sz < 0 else z - extra
        pts.append((D_CX + px, y, pz))
    return pts


def wall_top(z):
    return rim_top(z) - 0.24


def dumpster_ref_ring():
    """The wall ring the A region is unwrapped against (and painted from)."""
    return body_ring(lambda z: 1.5)


def build_dumpster(b):
    cx = D_CX
    wall = sh('A')
    under = sh('W', base=0.6, side=0.6)
    skirt_face = sh('W', base=0.95)
    ledge = sh('W', base=1.0, side=1.0)
    bead_under = sh('W', base=0.62, side=0.62)
    bead_face = sh('W', base=0.97)
    bead_top = sh('W', base=1.0, side=1.0)
    hidden = sh('A', base=0.35, top=1.0, under=1.0)
    rings = [
        body_ring(lambda z: D_BOTTOM, extra=0.05),
        body_ring(lambda z: SKIRT_LO, out=SKIRT_OUT),
        body_ring(lambda z: SKIRT_HI, out=SKIRT_OUT),
        body_ring(lambda z: STEP_Y),
        body_ring(wall_top),
        body_ring(lambda z: rim_top(z) - 0.17, out=0.05),   # rolled bead: underside
        body_ring(lambda z: rim_top(z) - 0.09, out=0.10),   # bead crown
        body_ring(rim_top, out=0.02),                        # bead turns in under the lids
    ]
    #       chamfer, skirt, ledge, wall, bead x3, bottom cap, top cap
    ring_bands(b, 'dumpster-body', rings,
               [under, skirt_face, ledge, wall, bead_under, bead_face, bead_top, hidden, hidden],
               groups=[None, None, None, None, 'bead', 'bead', 'bead'], arc_ref=dumpster_ref_ring())

    # Front panel (WASTE / SERVICES carrier), round 6: a RAISED bevelled plate bolted to the wall,
    # not a picture frame round a recess. Lofted as rings: a seat on the wall (z 1.24, 10 mm into
    # it), a vertical plate edge to z 1.272, a 60 mm bevel up to the face plane z 1.292 (below the
    # captions at 1.2951), and an inset ring on the face itself, so the face is a border band plus a
    # centre and its vertex colour can fall off from the lit, worn edge to a darker centre. Four
    # square bolt heads stand proud in the corner margins, outside both caption envelopes.
    px0, px1, py0, py1 = cx - 0.95, cx + 0.95, STEP_Y + 0.02, 1.66

    def rect(inset, z):
        return [(px0 + inset, py0 + inset, z), (px1 - inset, py0 + inset, z),
                (px1 - inset, py1 - inset, z), (px0 + inset, py1 - inset, z)]
    seat, edge, face_o, face_i = rect(0.0, 1.24), rect(0.0, 1.272), rect(0.06, 1.292), rect(0.17, 1.292)
    ref = (cx, (py0 + py1) / 2, -10.0)  # far behind: every plate face faces +z or out
    c0, r0, size = PLATE_CELL

    def plate_uv(p):
        m = 2.0
        return ((c0 + m + (p[0] - face_o[0][0]) / (face_o[1][0] - face_o[0][0]) * (size - 2 * m)) / TEX,
                (r0 + m + (p[1] - face_o[0][1]) / (face_o[2][1] - face_o[0][1]) * (size - 2 * m)) / TEX)

    def falloff(p, n):
        """Vertex light on the face: 1.0 at the bevel arris, 0.84 on the inner ring."""
        d = min(p[0] - px0, px1 - p[0], p[1] - py0, py1 - p[1])
        k = 1.0 if d < 0.1 else 0.84
        return (k, k, k)
    falloff.key = 'D:white'
    for ring_a, ring_b, shade in ((seat, edge, sh('W', base=0.82, top=1.0, side=0.9, under=0.6, ao=False)),
                                  (edge, face_o, sh('W', base=1.0, top=1.0, side=0.94, under=0.66, ao=False)),
                                  (face_o, face_i, falloff)):
        for i in range(4):
            j = (i + 1) % 4
            quad = [ring_a[i], ring_a[j], ring_b[j], ring_b[i]]
            uv = [plate_uv(p) for p in quad] if shade is falloff else None
            if dot(face_normal(quad), sub(centroid(quad), ref)) <= 0:
                quad, uv = list(reversed(quad)), (list(reversed(uv)) if uv else None)
            b.face('dumpster-panel', quad, shade, uv=uv)
    b.face('dumpster-panel', away_from(face_i, ref), falloff, uv=plate_uv)
    bolt = sh('D:steel', base=0.95, side=1.0, top=1.0, under=0.7, ao=False)
    for bx in (px0 + 0.09, px1 - 0.09):
        for by in (py0 + 0.09, py1 - 0.09):
            hb = 0.028
            apex = (bx, by, 1.292 + 0.022)
            base = [(bx - hb, by - hb, 1.290), (bx + hb, by - hb, 1.290), (bx + hb, by + hb, 1.290),
                    (bx - hb, by + hb, 1.290)]
            for k in range(4):
                tri = [base[k], base[(k + 1) % 4], apex]
                b.face('dumpster-panel', away_from(tri, (bx, by, 1.0)), bolt)

    # Hat-section ribs, 100 mm proud, each with its own paint tone: two front, three back.
    def rib_section(x, y, zwall, outward):
        return [(x - 0.08, y, zwall - outward * 0.03), (x + 0.08, y, zwall - outward * 0.03),
                (x + 0.04, y, zwall + outward * 0.10), (x - 0.04, y, zwall + outward * 0.10)]
    for idx, rx in enumerate((-1.5, 1.5)):
        x = cx + rx
        rib = sh('W', base=(0.88, 1.0)[idx])
        y0, y1 = STEP_Y + 0.01, wall_top(D_HZ) + 0.03
        b.solid(f'dumpster-rib-f{idx}', hexa_polys(rib_section(x, y0, D_HZ, 1), rib_section(x, y1, D_HZ, 1)), rib,
                skip={1, 2})
    for idx, rx in enumerate((-1.3, 0.0, 1.3)):
        x = cx + rx
        rib = sh('W', base=(0.95, 0.84, 1.0)[idx])
        y0, y1 = STEP_Y + 0.01, wall_top(-D_HZ) + 0.03
        b.solid(f'dumpster-rib-b{idx}', hexa_polys(rib_section(x, y0, -D_HZ + wall_inset(y0), -1),
                                                   rib_section(x, y1, -D_HZ + wall_inset(y1), -1)), rib,
                skip={1, 2})
    # End-wall ribs, two per end, leaning with the tapered wall (they pass behind the pocket sleeves).
    for side in (-1, 1):
        for idx, rz in enumerate((-0.48, 0.48)):
            def end_section(y, side=side, rz=rz):
                xw = cx + side * (D_HX - wall_inset(y))
                return [(xw - side * 0.03, y, rz - 0.08), (xw - side * 0.03, y, rz + 0.08),
                        (xw + side * 0.10, y, rz + 0.04), (xw + side * 0.10, y, rz - 0.04)]
            y0, y1 = STEP_Y + 0.01, wall_top(rz) + 0.03
            rib = sh('W', base=(0.9, 0.97)[idx])
            b.solid(f'dumpster-rib-e{side:+d}{idx}', hexa_polys(end_section(y0), end_section(y1)), rib, skip={1, 2})

    # Fork pockets: proud rectangular sleeves on the end walls, framed open mouth at the front.
    sleeve = sh('W', base=0.92)
    mouth = sh('D:pocket', base=1.0, side=1.0, top=1.0, under=1.0)
    fy0, fy1, fz0, fz1 = 1.02, 1.28, -0.92, 0.98
    lip = 0.032
    for side in (-1, 1):
        wall_x = D_HX - wall_inset(fy1)
        xin, xout = cx + side * (wall_x - 0.03), cx + side * (wall_x + 0.22)
        x0, x1 = min(xin, xout), max(xin, xout)
        polys = box_polys(x0, x1, fy0, fy1, fz0, fz1)
        pref = centroid([p for poly in polys for p in poly])
        inner_face = 1 if side < 0 else 0
        for i in (2, 3, 1 - inner_face):  # bottom, top, outer side
            b.face('dumpster-pockets', away_from(polys[i], pref), sleeve)
        b.face('dumpster-pockets', away_from(polys[4], pref), mouth)  # open rear: dark
        ox0, ox1 = x0 + lip, x1 - lip
        o = [(x0, fy0, fz1), (x1, fy0, fz1), (x1, fy1, fz1), (x0, fy1, fz1)]
        ii = [(ox0, fy0 + lip, fz1), (ox1, fy0 + lip, fz1), (ox1, fy1 - lip, fz1), (ox0, fy1 - lip, fz1)]
        rz = fz1 - 0.06
        rr = [(x, y, rz) for x, y, _ in ii]
        front_ref = (sum(p[0] for p in o) / 4, (fy0 + fy1) / 2, fz1 - 5.0)
        for i in range(4):
            j = (i + 1) % 4
            b.face('dumpster-pockets', away_from([o[i], o[j], ii[j], ii[i]], front_ref), sleeve)
            quad = [ii[i], ii[j], rr[j], rr[i]]
            axis_pt = ((ox0 + ox1) / 2, (fy0 + fy1) / 2, centroid(quad)[2])
            b.face('dumpster-pockets', list(reversed(away_from(quad, axis_pt))), mouth)
        b.face('dumpster-pockets', away_from(rr, (rr[0][0], rr[0][1], rz - 1.0)), mouth)

    # Lids: each half one extruded side profile in (z, y): flat sloped top, front lip, forward
    # grab flange, flat underside reaching back into the hinge knuckles.
    top0, top1 = lid_top(LID_Z0), lid_top(LID_Z1)
    zl = LID_Z1 - 0.035
    profile = [
        (LID_Z0, top0),
        (LID_Z1, top1),
        (LID_Z1, top1 - LIP + 0.032),
        (LID_Z1 + FLANGE, top1 - LIP + 0.032),
        (LID_Z1 + FLANGE, top1 - LIP),
        (zl, top1 - LIP),
        (zl, lid_top(zl) - LID_T),
        (LID_Z0, top0 - LID_T),
    ]
    halves = ((cx - LID_X_OUT, cx - 0.045, 0.96), (cx + 0.045, cx + LID_X_OUT, 1.0))
    for h, (x0, x1, tone) in enumerate(halves):
        def top_uv(p, x0=x0, x1=x1, h=h):
            u0, u1 = LT_U[h]
            return (u0 + (p[2] - LID_Z0) / (LID_Z1 - LID_Z0) * (u1 - u0),
                    LT_V0 + (p[0] - x0) / (x1 - x0) * (LT_V1 - LT_V0))
        extrude_profile(b, 'dumpster-lids', profile, x0, x1, sh('L', base=tone, side=0.86, under=0.5, ao=False),
                        side_shade=sh('L', base=tone * 0.84, ao=False), face_uv={0: top_uv})

    # Seam cap: raised strip over the joint, front to back, wrapping the lip front.
    seam = sh('L', base=0.9, side=0.82, ao=False)
    sw = 0.075
    zf = LID_Z1 + 0.012
    s_bot = [(cx - sw, lid_top(LID_Z0) - 0.03, LID_Z0), (cx + sw, lid_top(LID_Z0) - 0.03, LID_Z0),
             (cx + sw, lid_top(LID_Z1) - 0.03, zf), (cx - sw, lid_top(LID_Z1) - 0.03, zf)]
    s_top = [(x, y + 0.03 + SEAM_H, z) for x, y, z in s_bot]
    b.solid('dumpster-seam', hexa_polys(s_bot, s_top), seam, skip={0})
    b.solid('dumpster-seam', box_polys(cx - sw, cx + sw, top1 - LIP, top1 - 0.03, LID_Z1 - 0.03, zf), seam,
            skip={3, 4})

    # Hinge, round 6: four discrete hinges instead of a continuous pin. Each is a dark steel barrel
    # on the lid's rear edge (the pivot) carried by a crisp body-green tab welded to the back wall,
    # so the pivot reads against its mount by value.
    pin_y = top0 - LID_T / 2
    barrel = sh('D:pin', side=1.0, top=1.25, ao=False)
    tab = sh('W', base=0.95, side=1.0, ao=False)
    for s in (-1, 1):
        for off in (0.45, 1.50):
            hx = cx + s * off
            cylinder(b, 'dumpster-hinge', (hx, pin_y, PIN_Z), 'x', 0.045, 0.24, 6, barrel,
                     cap_shade=sh('D:pin', base=0.8, ao=False), start=math.pi / 6)
            prof = [(-1.17, 1.60), (-1.17, 1.84), (PIN_Z + 0.025, pin_y + 0.035), (PIN_Z + 0.025, pin_y - 0.06)]
            lo = [(hx - 0.06, y, z) for z, y in prof]
            hi = [(hx + 0.06, y, z) for z, y in prof]
            b.solid('dumpster-hinge', hexa_polys(lo, hi), tab, skip={2})

    # Support: two full-length skid rails under the floor; each caster bolts to a rail through a
    # square plate over a swivel housing, its fork turned about the kingpin with the axle trailing.
    rail = sh('D:steel', side=0.9, ao=False)
    for wz in CASTER_Z:
        b.solid('dumpster-rails', box_polys(cx - 1.88, cx + 1.88, RAIL_Y0, RAIL_Y1, wz - 0.08, wz + 0.08), rail,
                skip={3})
    for wx in (-CASTER_X, CASTER_X):
        for wz in CASTER_Z:
            caster(b, 'dumpster-casters', cx + wx, wz, CASTER_SWIVEL if wx < 0 else -CASTER_SWIVEL, CASTER_R, CASTER_W, 12, CASTER_TRAIL,
                   leg_t=0.03, leg_top_hx=0.075, crown=CROWN_Y,
                   housing=(0.088, 0.072, HOUSING_Y[0], HOUSING_Y[1]),
                   plate=(0.15, 0.13, PLATE_Y0, PLATE_Y1))


# ------------------------------------------------------------------ bin
def bin_section(y):
    t = min(1.0, max(0.0, (y - B_BOTTOM) / (B_WALL_TOP - B_BOTTOM)))
    return B_HX_BASE + (B_HX_TOP - B_HX_BASE) * t, B_ZB_BASE + (B_ZB_TOP - B_ZB_BASE) * t


def bin_ring(y, out=0.0, inset=0.0, c=B_CHAMFER, y_size=None):
    hx, zb = bin_section(y if y_size is None else y_size)
    return chamfer_rect(B_CX, 0, -hx - out + inset, hx + out - inset, zb - out + inset, B_ZF + out - inset, c,
                        lambda x, z: y)


def build_bin(b):
    cx = B_CX

    section, ring = bin_section, bin_ring

    paint = sh('C')
    under = sh('C', base=0.5, side=0.5)
    belt = sh('C', base=1.0, side=0.97)
    rim_face = sh('C', base=1.0, side=1.0)
    rim_under = sh('C', base=0.55, side=0.55)
    rings = [
        ring(B_BOTTOM, inset=0.05, c=B_CHAMFER - 0.02),
        ring(B_BOTTOM + 0.06),
        ring(0.88),
        ring(0.935, out=0.032, y_size=0.935),     # moulded belt band
        ring(0.99),
        ring(B_WALL_TOP),
        ring(B_WALL_TOP, out=B_RIM_OUT, c=B_CHAMFER + 0.03),   # heavy box rim: underside ledge
        ring(B_TOP, out=B_RIM_OUT, c=B_CHAMFER + 0.03, y_size=B_WALL_TOP),
    ]
    ring_bands(b, 'bin-body', rings, [under, paint, belt, belt, paint, rim_under, rim_face, under, rim_face],
               arc_ref=bin_ring(1.0))

    # Lid as a moulded tray: skirt flaring from the rim to a 120 mm overhang, chamfer up to a
    # raised flat-topped perimeter rim 70 mm wide, inner wall down to a recessed top.
    lid_y0 = B_TOP - 0.06
    lid_rings = [
        ring(lid_y0, out=B_RIM_OUT + 0.003, c=B_CHAMFER + 0.04, y_size=B_WALL_TOP),
        ring(lid_y0 + 0.11, out=0.12, c=B_CHAMFER + 0.06, y_size=B_WALL_TOP),
        ring(lid_y0 + 0.17, out=0.09, c=B_CHAMFER + 0.05, y_size=B_WALL_TOP),
        ring(lid_y0 + 0.17, out=0.02, c=B_CHAMFER + 0.01, y_size=B_WALL_TOP),
        ring(lid_y0 + 0.13, out=-0.005, c=B_CHAMFER, y_size=B_WALL_TOP),
    ]
    ring_bands(b, 'bin-lid', lid_rings,
               [sh('E', base=0.95, side=0.85, under=0.55, ao=False), sh('E', base=1.0, side=1.0, ao=False),
                sh('E', base=1.0, top=1.0, ao=False), sh('E', base=0.78, side=0.78, ao=False),
                None, sh('E', base=0.9, ao=False)],
               caps=(False, True))
    zf = B_ZF + 0.12
    b.solid('bin-lid', box_polys(cx - 0.45, cx + 0.45, lid_y0 - 0.05, lid_y0 + 0.07, zf - 0.03, zf + 0.04),
            sh('D:handle', side=1.0, top=1.4, ao=False), skip={4})

    # Push bar on the +X end: a dark rubber-gripped 90 mm round bar whose ends sit inside two pale
    # zinc end brackets (contrast shows the bar's roundness and where it is held).
    bar_y = 1.30
    hx_at, _ = section(bar_y)
    x_wall = cx + hx_at
    for bz in (-0.40, 0.42):
        b.solid('bin-bar', box_polys(x_wall - 0.03, x_wall + 0.21, bar_y - 0.06, bar_y + 0.06, bz - 0.05,
                                     bz + 0.05), sh('D:bar', base=0.9, side=1.0, ao=False), skip={0})
    cylinder(b, 'bin-bar', (x_wall + 0.15, bar_y, 0.01), 'z', 0.045, 0.82, 8,
             sh('D:handle', side=1.0, top=1.6, under=0.8, ao=False), start=math.pi / 8, caps=False)

    # Sign plate and the three-arrow recycling triangle on it.
    sx0, sx1, sy0, sy1 = cx - 0.24, cx + 0.24, 0.50, 0.86
    b.solid('bin-sign', box_polys(sx0, sx1, sy0, sy1, B_ZF - 0.02, B_ZF + 0.012),
            sh('D:white', side=1.0, top=1.0, ao=False), skip={4})
    zs = B_ZF + 0.0145
    ccx, ccy, R = cx, (sy0 + sy1) / 2 - 0.01, 0.16
    corners = [(ccx + R * math.cos(math.radians(90 + 120 * k)), ccy + R * math.sin(math.radians(90 + 120 * k)))
               for k in range(3)]
    width = 0.055
    symbol = sh('D:symbol', side=1.0, ao=False)
    for k in range(3):
        a, c2 = corners[k], corners[(k + 1) % 3]
        d = (c2[0] - a[0], c2[1] - a[1])
        length = math.hypot(*d)
        u = (d[0] / length, d[1] / length)
        nrm = (u[1], -u[0])
        cen = (sum(p[0] for p in corners) / 3, sum(p[1] for p in corners) / 3)
        mid = ((a[0] + c2[0]) / 2, (a[1] + c2[1]) / 2)
        if (mid[0] - cen[0]) * nrm[0] + (mid[1] - cen[1]) * nrm[1] < 0:
            nrm = (-nrm[0], -nrm[1])

        def at(t, o):
            return (a[0] + u[0] * length * t - nrm[0] * o, a[1] + u[1] * length * t - nrm[1] * o, zs)

        shaft = [at(0.08, 0.0), at(0.62, 0.0), at(0.62, width), at(0.08, width)]
        head = [at(0.62, -0.03), at(0.86, width / 2), at(0.62, width + 0.03)]
        b.face('bin-symbol', away_from(shaft, (ccx, ccy, zs - 1.0)), symbol)
        b.face('bin-symbol', away_from(head, (ccx, ccy, zs - 1.0)), symbol)

    # Four swivel casters, the same assembly as the dumpster's (trailing fork turned about the
    # kingpin, swivel housing, plate), 340 mm wheels, plates bolted into the bin floor.
    for wx in (-0.62, 0.62):
        for wz in (-0.38, 0.50):
            caster(b, 'bin-casters', cx + wx, wz, B_SWIVEL if wz < 0 else -B_SWIVEL, B_WHEEL_R, B_WHEEL_W, 10, B_TRAIL,
                   leg_t=0.022, leg_top_hx=0.05, crown=(0.346, 0.368),
                   housing=(0.055, 0.045, 0.350, B_BOTTOM - 0.016),
                   plate=(0.09, 0.08, B_BOTTOM - 0.02, B_BOTTOM + 0.01))


# ------------------------------------------------------------------ bollards
def build_bollards(b):
    for bx, bz in BOLLARDS:
        rings = []
        for r, y, _ in BOLLARD_PROFILE:
            rings.append([(bx + r * math.cos(2 * math.pi * i / BOLLARD_SEGMENTS), y,
                           bz + r * math.sin(2 * math.pi * i / BOLLARD_SEGMENTS)) for i in range(BOLLARD_SEGMENTS)])
        part = f'bollard-{bx:+.0f}{bz:+.0f}'
        n = BOLLARD_SEGMENTS
        u0, u1 = BOLLARD_COLS
        strip_uv = lambda p: ((u0 + (u1 - u0) * p[1] / BOLLARD_YMAX) / TEX, BOLLARD_ROW / TEX)
        for k in range(len(rings) - 1):
            shade = sh('D:yellow', base=1.0 if k > 0 else 0.82, side=1.0, top=1.0, hash_amp=0.04)
            group = BOLLARD_PROFILE[k + 1][2]
            lo, hi = rings[k], rings[k + 1]
            apex = BOLLARD_PROFILE[k + 1][0] == 0.0
            for i in range(n):
                j = (i + 1) % n
                poly = [lo[i], lo[j], hi[j]] if apex else [lo[i], lo[j], hi[j], hi[i]]
                c = centroid(poly)
                b.face(part, away_from(poly, (bx, c[1], bz)), shade, group=group, uv=strip_uv)


# ------------------------------------------------------------------ geometry-derived occlusion (round 6)
def hemisphere_dirs(k=20):
    """Cosine-weighted hemisphere directions (t1, t2, n) on a Fibonacci spiral (deterministic)."""
    out = []
    for i in range(k):
        u = (i + 0.5) / k
        r, phi = math.sqrt(u), i * 2.399963229728653
        out.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1.0 - u))))
    return out


class Occluder:
    """The FINISHED MESH (plus the runtime's ground pad) as a BVH. Grime is placed from this, not
    painted from noise: occlusion() casts a hemisphere of rays from a surface point and returns
    how open it is (1 = open, 0 = buried). A point that starts inside another part (wall under a
    rib, a sleeve or the plate, all hidden) returns None."""

    def __init__(self, b):
        from mathutils.bvhtree import BVHTree
        n = len(b.verts)
        verts = list(b.verts) + [(-14.0, 0.0, -14.0), (14.0, 0.0, -14.0), (14.0, 0.0, 14.0), (-14.0, 0.0, 14.0)]
        faces = [list(f) for f in b.faces] + [[n, n + 3, n + 2, n + 1]]   # ground quad, normal +y
        self.bvh = BVHTree.FromPolygons(verts, faces)
        self.dirs = hemisphere_dirs()

    def occlusion(self, p, nrm, reach=0.6):
        from mathutils import Vector
        n = Vector(nrm).normalized()
        t1 = n.orthogonal().normalized()
        t2 = n.cross(t1)
        o = Vector(p) + n * 0.004
        hit = self.bvh.ray_cast(o, n, 0.05)
        if hit[0] is not None and hit[1].dot(n) > 0:
            return None
        blocked = 0.0
        for a, c, d in self.dirs:
            hit = self.bvh.ray_cast(o, t1 * a + t2 * c + n * d, reach)
            if hit[0] is not None:
                blocked += 1.0 - hit[3] / reach
        return 1.0 - blocked / len(self.dirs)


HIDDEN_OPEN = 0.35   # occlusion given to texels buried under another part (only their rims show)


def wall_occlusion(occ, ring_at, ref, gu, gy, in_band, centre):
    """Occlusion over a perimeter-unwrapped wall: gu = arc fractions, gy = heights. The texel at
    (f, y) is the point at fraction f round the ring at height y, exactly as the band's UVs place it."""
    fr = ring_fracs(ref)[0]
    n = len(ref)
    grid = np.ones((len(gy), len(gu)))
    for iy, y in enumerate(gy):
        ring = ring_at(y)
        for iu, f in enumerate(gu):
            seg = min(n - 1, max(0, int(np.searchsorted(fr, f, side='right')) - 1))
            t = (f - fr[seg]) / max(fr[seg + 1] - fr[seg], 1e-9)
            a, b2 = ring[seg], ring[(seg + 1) % n]
            p = (a[0] + (b2[0] - a[0]) * t, y, a[2] + (b2[2] - a[2]) * t)
            if not in_band(y, p):
                continue
            nx, nz = b2[2] - a[2], -(b2[0] - a[0])
            if nx * (p[0] - centre[0]) + nz * (p[2] - centre[2]) < 0:
                nx, nz = -nx, -nz
            o = occ.occlusion(p, (nx, 0.0, nz))
            grid[iy, iu] = HIDDEN_OPEN if o is None else o
    return grid


def resample(grid, gu, gv, tu, tv, wrap_u=False):
    """Bilinear resample of grid[v, u] (sample positions gu, gv) onto texel positions tu, tv."""
    if wrap_u:
        gu = np.concatenate([[gu[-1] - 1.0], gu, [gu[0] + 1.0]])
        grid = np.concatenate([grid[:, -1:], grid, grid[:, :1]], axis=1)
    rows = np.array([np.interp(tu, gu, grid[k]) for k in range(grid.shape[0])])
    return np.array([np.interp(tv, gv, rows[:, k]) for k in range(rows.shape[1])]).T


def downward_run(m, metres_per_row, length):
    """Carry a mask down the wall (rows bottom-up), fading over `length`: where dirt gathers under a
    proud part, rain runs it down the face below."""
    out = m.copy()
    decay = math.exp(-metres_per_row / length)
    for r in range(out.shape[0] - 2, -1, -1):
        out[r] = np.maximum(out[r], out[r + 1] * decay)
    return out


# ------------------------------------------------------------------ colour atlas
def rgb(hex_code):
    hex_code = hex_code.lstrip('#')
    return np.array([int(hex_code[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def field(rng, h, w, su, sv):
    """Gaussian-filtered noise (periodic), unit std; su/sv are blur sigmas in pixels along u / v."""
    white = rng.standard_normal((h, w))
    fv = np.fft.fftfreq(h)[:, None]
    fu = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * math.pi ** 2 * ((su * fu) ** 2 + (sv * fv) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * kernel))
    return out / (out.std() + 1e-9)


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def blend(col, target, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return col + (np.asarray(target) - col) * t


METAL = rgb('#5d6267')       # bare steel where paint is chipped through (dark, not a white fleck)
RUST_DARK = rgb('#4b3526')
RUST_STREAK = rgb('#5e4630')
GRIME_GREEN = rgb('#3a3a25')  # warm olive dirt: a colour shift, not a second shadow
GRIME_PLASTIC = rgb('#55565c')


def chips(col, c, thr, ring_w=0.30):
    core = c > thr
    ring = (c > thr - ring_w) & ~core
    col = np.where(ring[..., None], blend(col, RUST_DARK, 0.5), col)
    return np.where(core[..., None], METAL, col)


def perimeter_map(ring, f):
    """Per atlas column (arc fraction f): plan x, z, the ring segment it lies on, and its distance in
    metres to the nearest ring vertex (an arris: every ring vertex is a flat-shaded edge)."""
    fr, total = ring_fracs(ring)
    fr = np.array(fr)
    n = len(ring)
    pts = np.array([(p[0], p[2]) for p in ring])
    seg = np.clip(np.searchsorted(fr, f, side='right') - 1, 0, n - 1)
    t = np.clip((f - fr[seg]) / (fr[seg + 1] - fr[seg]), 0.0, 1.0)
    p0, p1 = pts[seg], pts[(seg + 1) % n]
    xz = p0 + (p1 - p0) * t[:, None]
    d_edge = np.minimum(t, 1 - t) * (fr[seg + 1] - fr[seg]) * total
    return xz[:, 0], xz[:, 1], seg, d_edge, total, fr * total


def arc_distance(s, pos, total):
    d = np.abs(s - pos) % total
    return np.minimum(d, total - d)


def region_green_walls(rng, rows, w, occ):
    """A, unwrapped once round the body (u = perimeter, v = height). The faces are clean paint; dirt
    sits where the BUILT GEOMETRY occludes the wall (under the bead, beside every rib, round the
    plate, above and below the pocket sleeves, over the skirt), and rain carries it down from
    there in streaks. Wear sits on the arrises only."""
    h = len(rows)
    v = (rows + 0.5) / TEX
    yv = A_Y0 + np.clip((v - A_V0) / (A_V1 - A_V0), 0, 1) * (A_Y1 - A_Y0)
    y = yv[:, None]
    f = (np.arange(w) + 0.5) / w
    ref = dumpster_ref_ring()
    x, z, seg, dedge, total, s_pts = perimeter_map(ref, f)
    pu, pv = w / total, (A_V1 - A_V0) * TEX / (A_Y1 - A_Y0)

    def F(su, sv=None):
        return field(rng, h, w, su * pu, (su if sv is None else sv) * pv)

    gu = (np.arange(480) + 0.5) / 480
    gy = np.linspace(STEP_Y - 0.03, A_Y1 - 0.30, 84)
    grid = wall_occlusion(occ, lambda yy: body_ring(lambda zz: yy), ref, gu, gy,
                          lambda yy, p: STEP_Y - 0.03 <= yy <= wall_top(p[2]) + 0.03, (D_CX, 0.0, 0.0))
    ao = resample(grid, gu, gy, f, yv, wrap_u=True)
    occl = np.clip((0.97 - ao) / 0.42, 0, 1)

    col = np.broadcast_to(rgb('#166534'), (h, w, 3)).copy()
    tone = 1 + rng.uniform(-0.025, 0.025, len(ref))[seg]
    col *= (tone[None, :] * (1 + 0.012 * F(0.60)))[..., None]
    col = blend(col, rgb('#3f8257'), 0.10 * sstep(1.6, 2.5, y) * np.ones((1, w)))

    col = blend(col, GRIME_GREEN, 0.60 * occl ** 1.2)
    streak = np.clip(0.45 + 0.55 * F(0.010, 0.35), 0, 1)
    run = downward_run(occl, (A_Y1 - A_Y0) / ((A_V1 - A_V0) * TEX), 0.40)
    col = blend(col, RUST_STREAK, 0.34 * np.clip(run - occl, 0, 1) * streak)

    # Dust tide over the skirt, climbing near the corners where the casters throw it.
    corners = [s_pts[k] for k in (1, 4, 7, 10)]
    dc = np.min([arc_distance(f * total, c, total) for c in corners], axis=0)
    tide = (STEP_Y + 0.16 + 0.03 * field(rng, 1, w, 0.3 * pu, 1.0)[0] + 0.14 * np.exp(-(dc / 0.6) ** 2))[None, :]
    col = blend(col, rgb('#857b68'), 0.26 * sstep(tide + 0.02, tide - 0.14, y))

    # Wear on the arrises only: polished-through paint, chips down to steel; the faces stay clean.
    ytop = np.array([wall_top(zz) for zz in z])[None, :]
    e = np.exp(-(dedge / 0.045) ** 2)[None, :] * (0.55 + 0.45 * sstep(2.2, 0.9, y))
    e = e + 0.7 * np.exp(-((y - STEP_Y) / 0.035) ** 2) + 0.6 * np.exp(-((y - ytop) / 0.04) ** 2)
    e = np.clip(e, 0, 1)
    col = blend(col, rgb('#2c7a48'), 0.30 * e)
    return chips(col, F(0.016), np.where(e > 0.3, 3.0 - 1.6 * e, 99.0))


def region_lid_tops(rng, occ):
    """LT: one unique cell per lid half (u along z, v along x), so occlusion baked from the mesh
    lands where it belongs: round the seam cap and the hinge barrels, plus the dirt that rain
    carries down the slope to the low rear edge. Wear on the lid's own edges; the field is clean."""
    rows = np.arange(256, 384)
    img = np.broadcast_to(rgb('#15803d'), (len(rows), TEX, 3)).copy()
    nrm = (0.0, 1.0, -LID_SLOPE)
    halves = ((D_CX - LID_X_OUT, D_CX - 0.045), (D_CX + 0.045, D_CX + LID_X_OUT))
    for h, (x0, x1) in enumerate(halves):
        u0, u1 = LT_U[h]
        c0, c1 = int(round(u0 * TEX)) - 4, int(round(u1 * TEX)) + 4
        cols = np.arange(c0, c1)
        zc = LID_Z0 + np.clip(((cols + 0.5) / TEX - u0) / (u1 - u0), 0, 1) * (LID_Z1 - LID_Z0)
        xr = x0 + np.clip(((rows + 0.5) / TEX - LT_V0) / (LT_V1 - LT_V0), 0, 1) * (x1 - x0)
        gz = np.linspace(LID_Z0 + 0.01, LID_Z1 - 0.01, 72)
        gx = np.linspace(x0 + 0.01, x1 - 0.01, 30)
        grid = np.ones((len(gx), len(gz)))
        for ix, xx in enumerate(gx):
            for iz, zz in enumerate(gz):
                o = occ.occlusion((xx, lid_top(zz), zz), nrm)
                grid[ix, iz] = HIDDEN_OPEN if o is None else o
        ao = resample(grid, gz, gx, zc, xr)
        occl = np.clip((0.97 - ao) / 0.42, 0, 1)
        hh, ww = len(rows), len(cols)
        pz, px = ww / (LID_Z1 - LID_Z0), hh / (x1 - x0)

        def F(sz, sx=None):
            return field(rng, hh, ww, sz * pz, (sz if sx is None else sx) * px)
        col = np.broadcast_to(rgb('#15803d'), (hh, ww, 3)).copy()
        col *= (1 + 0.012 * F(0.6) + (0.02 if h else -0.02))[..., None]
        col = blend(col, rgb('#5f9d70'), 0.07)
        col = blend(col, GRIME_GREEN, 0.55 * occl ** 1.2)
        zz2, xx2 = zc[None, :], xr[:, None]
        drain = sstep(0.45, 0.0, zz2 - LID_Z0) * np.clip(0.5 + 0.5 * F(0.5, 0.03), 0, 1)
        col = blend(col, GRIME_GREEN, 0.22 * drain)
        d = np.minimum(np.minimum(zz2 - LID_Z0, LID_Z1 - zz2), np.minimum(xx2 - x0, x1 - xx2))
        e = np.exp(-(d / 0.035) ** 2)
        col = blend(col, rgb('#4fa36a'), 0.32 * e)
        col = chips(col, F(0.02), np.where(e > 0.3, 3.0 - 1.4 * e, 99.0))
        img[:, c0:c1] = col
    return img


def region_green_edges(rng, rows, w):
    """W: every face stretched across the strip, so wear sits on both long edges (the arrises)."""
    h = len(rows)
    vn = np.clip(((rows + 0.5) / TEX - W_V0) / (W_V1 - W_V0), 0, 1)[:, None]
    pu, pv = TEX / U_TILE, (W_V1 - W_V0) * TEX / 0.12

    def F(sm):
        return field(rng, h, w, sm * pu, sm * pv)
    col = np.broadcast_to(rgb('#1b6e3a'), (h, w, 3)).copy()
    col *= (1 + 0.025 * F(0.30))[..., None]
    e = np.exp(-(vn / 0.16) ** 2) + np.exp(-((1 - vn) / 0.16) ** 2)
    col = blend(col, rgb('#2f8150'), 0.28 * e * np.ones((1, w)))
    return chips(col, F(0.015), np.where(e > 0.3, 3.1 - 1.6 * e, 99.0))


def region_green_lid(rng, rows, w):
    """L (generic): lid plastic for the lid sides, lips and seam cap: clean, worn at the strip edges."""
    h = len(rows)
    pu = TEX / U_TILE
    col = np.broadcast_to(rgb('#15803d'), (h, w, 3)).copy()
    col *= (1 + 0.015 * field(rng, h, w, 0.4 * pu, 4.0))[..., None]
    col = blend(col, rgb('#5f9d70'), 0.07)
    vn = np.clip(((rows + 0.5) / TEX - L_V0) / (L_V1 - L_V0), 0, 1)[:, None]
    e = np.exp(-(vn / 0.15) ** 2) + np.exp(-((1 - vn) / 0.15) ** 2)
    return blend(col, rgb('#4fa36a'), 0.25 * e * np.ones((1, w)))


def region_blue_walls(rng, rows, cols, occ):
    """C, unwrapped round the bin (u = perimeter, v = height): clean moulded plastic, grey dirt where
    the built geometry occludes it (under the rim, either side of the belt, over the casters), pale
    scuffs at the chamfer arrises and a light dust tide at the foot."""
    h, w = len(rows), len(cols)
    v = (rows + 0.5) / TEX
    yv = C_Y0 + np.clip((v - C_V0) / (C_V1 - C_V0), 0, 1) * (C_Y1 - C_Y0)
    y = yv[:, None]
    f = np.clip(((cols + 0.5) / TEX - C_U0) / (C_U1 - C_U0), 0, 1)
    ref = bin_ring(1.0)
    x, z, seg, dedge, total, s_pts = perimeter_map(ref, f)
    pu, pv = (C_U1 - C_U0) * TEX / total, (C_V1 - C_V0) * TEX / (C_Y1 - C_Y0)

    def F(su, sv=None):
        return field(rng, h, w, su * pu, (su if sv is None else sv) * pv)

    def belt(yy):
        return 0.032 * float(np.interp(yy, [0.88, 0.935, 0.99], [0.0, 1.0, 0.0]))
    gu = (np.arange(200) + 0.5) / 200
    gy = np.linspace(B_BOTTOM + 0.01, B_WALL_TOP, 60)
    grid = wall_occlusion(occ, lambda yy: bin_ring(yy, out=belt(yy)), ref, gu, gy,
                          lambda yy, p: True, (B_CX, 0.0, 0.0))
    ao = resample(grid, gu, gy, f, yv, wrap_u=True)
    occl = np.clip((0.97 - ao) / 0.45, 0, 1)

    col = np.broadcast_to(rgb('#2563eb'), (h, w, 3)).copy()
    col *= (1 + 0.012 * F(0.5))[..., None]
    col = blend(col, rgb('#6a8fe0'), 0.10 * sstep(1.0, 1.7, y) * np.ones((1, w)))
    col = blend(col, GRIME_PLASTIC, 0.42 * occl ** 1.2)
    e = np.exp(-(dedge / 0.04) ** 2)[None, :] * (0.5 + 0.5 * sstep(1.4, 0.5, y))
    e = np.clip(e + 0.5 * np.exp(-((y - B_BOTTOM - 0.06) / 0.04) ** 2), 0, 1)
    col = blend(col, rgb('#9db3ea'), 0.40 * e * np.clip(0.4 + 0.6 * F(0.02), 0, 1))
    corners = [s_pts[k] for k in range(len(ref))]
    dc = np.min([arc_distance(f * total, c, total) for c in corners], axis=0)
    tide = (B_BOTTOM + 0.16 + 0.03 * field(rng, 1, w, 0.3 * pu, 1.0)[0] + 0.06 * np.exp(-(dc / 0.3) ** 2))[None, :]
    return blend(col, rgb('#7d7a73'), 0.22 * sstep(tide + 0.02, tide - 0.10, y))


def region_blue_lid(rng, rows, cols):
    """E: blue lid plastic: sun bleach and a few soft scuffs."""
    h, w = len(rows), len(cols)
    p = E_SIZE * TEX / E_SPAN

    def F(sm, sv=None):
        return field(rng, h, w, sm * p, (sm if sv is None else sv) * p)
    col = np.broadcast_to(rgb('#1d4ed8'), (h, w, 3)).copy()
    col *= (1 + 0.04 * F(0.30) + 0.012 * F(0.05))[..., None]
    col = blend(col, rgb('#5b7fe0'), np.clip(0.12 + 0.04 * F(0.4), 0, 0.2))
    return blend(col, rgb('#b3c3ee'), 0.25 * np.clip((F(0.10, 0.02) - 2.4) / 0.5, 0, 1))


def cell_wheel():
    """Wheel face: sidewall, steel rim lip, zinc dish with a dark ring and five bolts, hub cap, nut."""
    size = WHEEL_CELL[2]
    yy, xx = np.mgrid[0:size, 0:size] + 0.5
    dx, dy = xx - size / 2, yy - size / 2
    rn = np.hypot(dx, dy) / (0.48 * size)
    ang = np.arctan2(dy, dx)
    col = np.broadcast_to(rgb('#1c1e21'), (size, size, 3)).copy()
    col = np.where((np.abs(rn - 0.88) < 0.02)[..., None], rgb('#2c2f33'), col)
    light = (1 + 0.12 * (dy - dx) / (0.48 * size * np.maximum(rn, 0.05)))[..., None]
    col = np.where(((rn >= 0.69) & (rn < 0.75))[..., None], rgb('#80868d') * light, col)
    col = np.where(((rn >= 0.35) & (rn < 0.69))[..., None], rgb('#a9afb7') * light, col)
    col = np.where(((rn >= 0.60) & (rn < 0.645))[..., None], rgb('#6d737a'), col)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        d = np.hypot(dx / (0.48 * size) - 0.48 * math.cos(a), dy / (0.48 * size) - 0.48 * math.sin(a))
        col = np.where((d < 0.07)[..., None], rgb('#4c5157'), col)
        col = np.where((d < 0.035)[..., None], rgb('#9aa0a7'), col)
    col = np.where(((rn >= 0.33) & (rn < 0.35))[..., None], rgb('#5d6369'), col)
    col = np.where((rn < 0.33)[..., None], rgb('#c6cbd1') * light, col)
    col = np.where((rn < 0.13)[..., None], rgb('#3b3f44'), col)
    del ang
    return col


def cell_plate(rng):
    """Raised front plate (#14532d): clean face, paint worn pale along its own arrises with chips to
    steel there, a contact ring round each bolt and a short rust run under the two top bolts."""
    size, m = PLATE_CELL[2], 2.0
    yy, xx = np.mgrid[0:size, 0:size] + 0.5
    uu = np.clip((xx - m) / (size - 2 * m), 0, 1)
    vv = np.clip((yy - m) / (size - 2 * m), 0, 1)
    pw, ph = 1.90 - 0.12, (1.66 - (STEP_Y + 0.02)) - 0.12
    px, py = uu * pw, vv * ph
    d = np.minimum(np.minimum(px, pw - px), np.minimum(py, ph - py))
    col = np.broadcast_to(rgb('#14532d'), (size, size, 3)).copy()
    col *= (1 + 0.012 * field(rng, size, size, 8.0, 8.0))[..., None]
    e = np.exp(-(d / 0.03) ** 2)
    col = blend(col, rgb('#2b7a49'), 0.42 * e)
    col = chips(col, field(rng, size, size, 0.6, 1.4), np.where(e > 0.3, 2.9 - 1.4 * e, 99.0))
    for bx in (0.03, pw - 0.03):
        for by in (0.03, ph - 0.03):
            db = np.hypot(px - bx, py - by)
            col = blend(col, rgb('#0f2b19'), 0.55 * np.exp(-((db - 0.032) / 0.008) ** 2))
            if by > ph / 2:
                lat = np.exp(-((px - bx) / 0.008) ** 2)
                col = blend(col, RUST_STREAK, 0.45 * lat * sstep(by - 0.20, by - 0.04, py) * (py < by))
    return col


def strip_bollard():
    """Bollard strip, u = height: yellow, the reflective band, grime at the foot."""
    c0, c1 = BOLLARD_COLS
    cols = np.arange(768, 1024) + 0.5
    y = np.clip((cols - c0) / (c1 - c0), 0, 1) * BOLLARD_YMAX
    col = np.broadcast_to(rgb('#fbbf24'), (len(cols), 3)).copy()
    band = (y >= BOLLARD_BAND[0]) & (y < BOLLARD_BAND[1])
    col = np.where(band[:, None], rgb('#eceae4'), col)
    col = np.where((band & ((np.abs(y - BOLLARD_BAND[0]) < 0.006) | (np.abs(y - BOLLARD_BAND[1]) < 0.006)))[:, None],
                   rgb('#b9b6ad'), col)
    return blend(col, rgb('#6b5a3a'), 0.38 * sstep(0.10, 0.0, y))


def atlas(b):
    """1024 px sRGB colour atlas; rows bottom-up (Blender pixel order, v = row / 1024)."""
    rng = np.random.default_rng(20261106)
    occ = Occluder(b)
    img = np.zeros((TEX, TEX, 3))
    img[:, :] = rgb('#15803d')  # unused cells blend into the lid regions, not black
    img[512:1024, :] = region_green_walls(rng, np.arange(512, 1024), TEX, occ)
    img[416:512, :] = region_green_edges(rng, np.arange(416, 512), TEX)
    img[384:416, :] = region_green_lid(rng, np.arange(384, 416), TEX)
    img[256:384, :] = region_lid_tops(rng, occ)
    img[0:256, 0:384] = region_blue_walls(rng, np.arange(0, 256), np.arange(0, 384), occ)
    img[0:256, 512:768] = region_blue_lid(rng, np.arange(0, 256), np.arange(512, 768))
    c0, r0, size = WHEEL_CELL
    img[r0:r0 + size, c0:c0 + size] = cell_wheel()
    c0, r0, size = PLATE_CELL
    img[r0:r0 + size, c0:c0 + size] = cell_plate(rng)
    for name, hx in SWATCHES.items():
        i = SWATCH_INDEX[name]
        col, row = i % 4, i // 4
        img[row * 64:(row + 1) * 64, 768 + col * 64:768 + (col + 1) * 64] = rgb(hx)
    img[192:256, 768:1024] = strip_bollard()[None, :, :]
    img = np.clip(img, 0, 1)
    rgba = np.concatenate([img, np.ones((TEX, TEX, 1))], axis=-1)
    return rgba.astype(np.float32)


# ------------------------------------------------------------------ checks
def check_captions(b):
    """Mirror DumpsterLabelFixture: nothing in front of the captions; the panel covers the old spots."""
    tris = []
    for f in b.faces:
        for k in range(1, len(f) - 1):
            tris.append((b.verts[f[0]], b.verts[f[k]], b.verts[f[k + 1]]))

    def overlaps(t, x0, x1, y0, y1, zmin):
        xs, ys, zs = [p[0] for p in t], [p[1] for p in t], [p[2] for p in t]
        return max(zs) > zmin and max(xs) > x0 and min(xs) < x1 and max(ys) > y0 and min(ys) < y1

    # Conservative caption envelopes (wider than the Troika glyph bounds).
    for name, (x0, x1, y0, y1, zmin) in {
        'WASTE': (-2.1, -0.9, 1.10, 1.42, 1.2951),
        'SERVICES': (-2.1, -0.9, 0.88, 1.12, 1.2951),
        'RECYCLING': (2.0, 3.0, 1.01, 1.19, 0.7601),
    }.items():
        bad = [t for t in tris if overlaps(t, x0, x1, y0, y1, zmin)]
        if bad:
            raise SystemExit(f'{len(bad)} triangles in front of the {name} caption, e.g. {bad[0]}')

    def covered(px, py, zmin):
        for t in tris:
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
            d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(d) < 1e-12:
                continue
            l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
            l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
            l3 = 1 - l1 - l2
            if min(l1, l2, l3) >= 0 and l1 * az + l2 * bz + l3 * cz > zmin:
                return True
        return False

    for py in (1.5, 1.15):
        if not covered(-1.5, py, 1.27):
            raise SystemExit(f'panel no longer covers the old caption position y={py}')


def check_bounds(b):
    xs = [p[0] for p in b.verts]
    ys = [p[1] for p in b.verts]
    zs = [p[2] for p in b.verts]
    w, h, l = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
    print(f'BOUNDS w={w:.4f} h={h:.4f} l={l:.4f} miny={min(ys):.5f} cx={(max(xs) + min(xs)) / 2:.5f} '
          f'cz={(max(zs) + min(zs)) / 2:.5f}')
    assert 8.359 <= w <= 8.361, w
    assert 2.6063 <= h <= 2.6083, h
    assert 4.359 <= l <= 4.361, l
    assert abs(min(ys)) <= 0.0005
    assert abs((max(xs) + min(xs)) / 2) <= 0.0005 and abs((max(zs) + min(zs)) / 2) <= 0.0005


def check_uvs(b):
    """Every non-wrapping region's UVs stay inside it (the wrapping ones only constrain v)."""
    for u, v in b.uvs:
        if v < 0.0 or v > 1.0:
            raise SystemExit(f'uv v out of range: {(u, v)}')
        if v < 0.25 and not (0.0 <= u <= 1.0):
            raise SystemExit(f'uv in the blue/swatch band out of range: {(u, v)}')


# ------------------------------------------------------------------ blender
def make_material(b):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # glTF doubleSided: false, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    img = bpy.data.images.new(IMAGE_NAME, TEX, TEX, alpha=False)
    img.pixels.foreach_set(atlas(b).ravel())
    img.pack()
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'REPEAT'
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    mix_node = nodes.new('ShaderNodeMix')
    mix_node.data_type = 'RGBA'
    mix_node.blend_type = 'MULTIPLY'
    mix_node.inputs[0].default_value = 1.0
    links.new(tex.outputs['Color'], mix_node.inputs[6])
    links.new(attr.outputs['Color'], mix_node.inputs[7])
    links.new(mix_node.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.72
    return mat


def to_blender(p):
    return (p[0], -p[2], p[1])


def build_mesh(b, mat):
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata([to_blender(p) for p in b.verts], [], b.faces)
    mesh.update()
    for poly, smooth in zip(mesh.polygons, b.smooth):
        poly.use_smooth = smooth
    uv = mesh.uv_layers.new(name='UVMap')
    for loop_index, (u, v) in enumerate(b.uvs):
        uv.data[loop_index].uv = (u, v)
    col = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for loop_index, c in enumerate(b.colours):
        col.data[loop_index].color = (c[0], c[1], c[2], 1.0)
    mesh.color_attributes.active_color = col
    mesh.materials.append(mat)
    return mesh


def main():
    path = out_path()
    b = Builder()
    build_dumpster(b)
    build_bin(b)
    build_bollards(b)
    for part, n in sorted(b.part_tris.items()):
        print(f'PART {part}: {n}')
    print(f'TRIANGLES {b.triangles} / {MAX_TRIANGLES}')
    if b.triangles > MAX_TRIANGLES:
        raise SystemExit(f'{b.triangles} triangles exceeds the {MAX_TRIANGLES}-triangle budget')
    check_bounds(b)
    check_captions(b)
    check_uvs(b)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    mat = make_material(b)
    mesh = build_mesh(b, mat)
    obj = bpy.data.objects.new(NODE_NAME, mesh)
    scene.collection.objects.link(obj)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_image_format='JPEG',
        export_jpeg_quality=82,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_copyright='MillOS authored geometry',
    )
    print(f'YARD_DUMPSTER_BUILT {path} triangles={b.triangles}')


main()
