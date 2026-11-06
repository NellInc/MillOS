"""Yard pallet stretch-wrapper body (world-yard-stretch-wrap-body), built from scratch in headless Blender.

What it builds
--------------
The static body of the pallet stretch wrapper that TruckBay.tsx `StretchWrapMachine`
places in both truck yards (shipping at (-28, 0, 74), receiving at (28, 0, -74)
turned pi). Modelled in the runtime group frame (the TruckBay fallback's
coordinates, metres, +Z front), then shifted by the runtime wrapper's offset so the
GLB is bbox-centred on x/z with y = 0 on the ground:

  GLB = runtime - (0.3625, 0, 0)      (TruckBay mounts the GLB at x +0.362499952)

Parts (runtime frame):

* base plate: a lathe of its traced side profile, radius 1.2 m, no underside: a
  flat top at y 0.10 (a 12-gon, circumradius 0.95) and one conic loading ramp from
  that crease ring down to a 36-gon ground ring at r 1.2 (corners on +-X and +-Z, so
  the envelope is exactly 2.4 m). No vertical rim. The ring counts are decoupled:
  the ground ring is the silhouette from every camera at or above 22 deg and the
  outline from above; the crease is hidden by normals that are straight up on both
  sides and by one planar x/z projection over every plate face (tread, scuffs, a
  dark joint ring at r 0.875, a bright wear band over the crease, a bolt ring and
  grime on the ramp apron, a dark contact line at the toe). The runtime turntable
  disc (r 1.0, y 0.10 .. 0.14) sits on the flat and overhangs 5 .. 8 cm of ramp.
* pallet: a 1.0 x 1.2 m deck (y 0.228 .. 0.25) on three stringers running along Z
  (outer |x| 0.395 .. 0.5, middle +-0.05; ends 3 mm inside the deck ends). The outer
  stringers' outer faces are the deck sides carried down to the stringer foot. The
  middle stringer is built as its two ends (its long faces stand inside the fork
  pockets). The stringers stand 2 mm into the plate (y 0.098).
* load: a kraft carton 0.8 x 0.8 x 0.9 m (y 0.248 .. 1.05, 2 mm into the deck): a
  cross strap, wrinkled tape over the flap seam, labels, print, scuffed and softened
  edges, water marks and a dirty foot.
* mast (`form:mast-bare-bar`): ONE loft through STATIONS traced from its front (x)
  and side (z) profiles: a hazard-striped plinth flaring from the shaft (y 0.42)
  down to a ground footprint x 1.06 .. 1.74, z +-0.17 whose -X end runs under the
  plate rim; the shaft tapering from 190 mm square to 130 mm at y 2.56; a shoulder
  growing the section out to the drive head (x 1.36 .. 1.60, z +-0.10) by y 2.66;
  the head to 3.0 and its lid. Paint: a galvanised cable-cover strip on the +X, +Z
  and -Z faces, the carriage track on the load (-X) face, section joints, bolts, an
  access cover, a vent and lid seam on the head.
* control box: the slate enclosure x 1.675 .. 1.925, y 1.0 .. 1.4, z 0.25 .. 0.35,
  exactly where the runtime places it (sheet-metal edge roll in the normal map),
  carried by a box-section console bracket lofted from a rectangle inside the mast
  (z 0.06) out through the mast's +Z face to one inside the box back (x 1.695 ..
  1.905, y 1.03 .. 1.37): it meets most of the box back.

Runtime anchors kept
--------------------
* Status lamp: runtime puck at [1.76, 1.3, 0.36] (Y-axis cylinder r 0.04, 0.02
  thick) half-buried in the box front at z 0.35: the box keeps x 1.675 .. 1.925,
  y 1.0 .. 1.4 and its front at z 0.35. The texture puts a dark bezel under it.
* Wrapping arm group pivots at [1.5, 1.5, 0] about Y: arm bar y 1.45 .. 1.55
  sweeping r 0 .. 1.5, carriage y 1.25 .. 1.75 at r ~1.3 .. 1.5. Nothing near the
  mast reaches y 1.4 except the mast itself (the console tops out at 1.37, the box
  top is 1.4).
* Turntable disc r 1.0, y 0.10 .. 0.14: no GLB surface in that band inside r 1.0
  except the pallet's own stringers.
* Node `Yard-stretch-wrap-bodyBody` keeps extras authoredCastShadow = false and
  authoredReceiveShadow = false (GeneratedModel reads them), as delivered.

Contract (public/models/asset-manifest.json)
--------------------------------------------
bounds width 3.125 (plate -X vertex at runtime -1.2, box +X face at 1.925),
height 3.0 (head lid), length 2.4 (plate +-Z corners), origin at ground
centre (asserted before export). One node, one material, two textures (base
colour JPEG + tangent-space normal PNG; no COLOR_0), single sided.
maxRenderVertices 432 counts index entries, so 144 triangles, all used:

  plate: ramp band 12 + 36, top 12-gon 10              58
  pallet: deck top/ends 6, sides 4, stringers 6+6+4      26
  load: 4 sides + top                                    10
  mast loft: plinth, shaft, shoulder, head 4 x 8, lid 2  34
  control box: front, 2 sides, top, back                 10
  console: top + 2 sides                                  6
                                                        144

Faces that are never seen are not built: the plate's underside, the stringer tops
and bottoms, the middle stringer's long faces, the deck's underside, the load's
bottom, the plinth's foot (on the ground), the control box's and the console's
undersides (facing down at 1.0 .. 1.08 m), and the console's ends (inside the mast
and the box).

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-stretch-wrap-body.py -- <out.glb>

Re-runnable and deterministic (hash noise, no RNG state). Writes only <out.glb>;
textures are staged in a temporary directory that is removed afterwards.
"""

import math
import os
import shutil
import struct
import sys
import tempfile
import zlib

import bpy
import numpy as np

INDEX_BUDGET = 432

# ---------------------------------------------------------------- envelope (runtime frame)
OFFSET_X = 0.3625
X_MIN, X_MAX = -1.2, 1.925
TOP = 3.0
Z_HALF = 1.2
BOUNDS_TOL = 0.0004

# Plate: a lathe of the traced side profile (flat top at y 0.10 out to the crease
# ring, then one conic ramp down to the ground ring at r 1.2). The ring counts are
# decoupled: the ground ring carries the silhouette, the crease ring only the top.
PLATE_R, PLATE_Y1 = 1.2, 0.10
GROUND_SIDES = 36  # a multiple of 4: corners on +-X, +-Z make the bounds exact
CREASE_SIDES, CREASE_R = 12, 0.95  # GROUND_SIDES a multiple of CREASE_SIDES (rings aligned)
RAMP_SLOPE = math.atan2(PLATE_Y1, PLATE_R - CREASE_R)  # 21.8 deg at the crease corners

DECK = dict(x=0.5, z=0.6, y0=0.228, y1=0.25)
STRINGER = dict(hx=0.05, z=0.597, y0=0.098, y1=0.232)
OUTER_STRINGER = (0.395, 0.5)  # |x| span; its outer face is the deck side carried down
PALLET_SIDE_H = DECK['y1'] - STRINGER['y0']  # 0.152: the merged deck + stringer side
LOAD = dict(x=0.4, z=0.45, y0=0.248, y1=1.05)
BOARDS, BOARD_W = 7, 0.12  # deck boards along Z (gaps are texture)

# The mast is ONE loft through these stations, traced from its front (x) and side (z)
# profiles: (y, x0, x1, half z). Plinth foot (its -X end runs under the plate rim),
# shaft foot, shaft top, the shoulder that grows into the drive head, and the head top.
MAST_CX = 1.5
STATIONS = [
    (0.00, 1.06, 1.74, 0.170),
    (0.42, 1.405, 1.595, 0.095),
    (2.56, 1.435, 1.565, 0.065),
    (2.66, 1.36, 1.60, 0.100),
    (3.00, 1.36, 1.60, 0.100),
]
SHAFT_Y0, SHAFT_Y1 = STATIONS[1][0], STATIONS[2][0]
HEAD_Y0 = STATIONS[2][0]  # the head region's paint starts at the shoulder's foot
BOX = dict(x0=1.675, x1=1.925, y0=1.0, y1=1.4, z0=0.25, z1=0.35)
# Console bracket: a box-section loft from a rectangle inside the mast (z = zm) to
# one inside the box back (z = zb); it leaves through the mast's +Z face.
CONSOLE = dict(zm=0.06, xm=(1.43, 1.53), ym=(1.08, 1.34), zb=0.262, xb=(1.695, 1.905), yb=(1.03, 1.37))
LAMP = (1.76, 1.3)  # runtime status lamp centre on the box front (x, y)


def mast_h(y):
    """Shaft half-width at height y (SHAFT_Y0 .. SHAFT_Y1)."""
    (ya, xa0, xa1, _), (yb, xb0, xb1, _) = STATIONS[1], STATIONS[2]
    ha, hb = (xa1 - xa0) / 2, (xb1 - xb0) / 2
    return ha + (hb - ha) * (y - ya) / (yb - ya)

NODE_NAME = 'Yard-stretch-wrap-bodyBody'
MESH_NAME = 'yard-stretch-wrap-body-mesh'
MATERIAL_NAME = 'yard-stretch-wrap-body-surface'
SCENE_NAME = 'MillOS_World_Yard-stretch-wrap-body'

ROUGHNESS = 0.68
METALNESS = 0.0

# ---------------------------------------------------------------- atlas layout
# Regions in a 256-unit grid (u right, v UP: Blender/bottom-first), with the
# canonical metric size (s metres, t metres) each region's pattern is drawn at.
GRID = 256.0
PAD = 2.0
COLOUR_PX = 384
NORMAL_PX = 256
SUPERSAMPLE = 2
COLOUR_Q = 72
MAX_SLOPE = 0.9

REGIONS = {
    'plate_top': ((0, 0, 128, 128), (2.4, 2.4)),
    'deck': ((128, 0, 224, 96), (1.0, 1.2)),
    'stringer': ((128, 96, 224, 112), (1.2, PALLET_SIDE_H)),
    'plinth': ((128, 112, 224, 144), (0.7, 0.56)),
    'card_side': ((0, 144, 96, 240), (0.9, 0.8)),
    'card_top': ((96, 144, 176, 224), (0.8, 0.9)),
    'box_front': ((176, 144, 224, 208), (0.25, 0.4)),
    'box_side': ((176, 208, 224, 256), (0.25, 0.4)),
    'fitting': ((96, 224, 122, 256), (0.4, 0.4)),
    'head': ((122, 224, 176, 256), (0.24, 0.46)),
    'mast': ((224, 0, 240, 256), (0.15, 3.0)),
    'mast_track': ((240, 0, 256, 256), (0.15, 3.0)),
}

# Paint and materials, sRGB 0-255.
STEEL = np.array([86, 94, 104], np.float64)
STEEL_RIM = np.array([68, 75, 84], np.float64)
WOOD = np.array([150, 98, 56], np.float64)
WOOD_DARK = np.array([132, 84, 47], np.float64)
GAP = np.array([36, 25, 16], np.float64)
CARD = np.array([206, 160, 112], np.float64)
TAPE = np.array([176, 128, 66], np.float64)
STRAP = np.array([30, 31, 35], np.float64)
INK = np.array([70, 48, 30], np.float64)
MAST_PAINT = np.array([40, 47, 58], np.float64)
TRACK = np.array([18, 21, 26], np.float64)
SLATE = np.array([58, 72, 92], np.float64)
SEAM = np.array([20, 24, 30], np.float64)
LABEL = np.array([222, 222, 214], np.float64)
RED = np.array([196, 34, 30], np.float64)
YELLOW = np.array([226, 174, 30], np.float64)
BLACK = np.array([26, 26, 28], np.float64)
FITTING = np.array([50, 58, 70], np.float64)


def out_path():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: Blender -b --factory-startup -P yard-stretch-wrap-body.py -- <out.glb>')
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


Y_AXIS = (0.0, 1.0, 0.0)


# ---------------------------------------------------------------- face collector

class Builder:
    """Faces in runtime metres. Each face: corner points, corner normals, UVs.

    The outward hint fixes winding (single-sided material: an inward face would
    vanish). UVs: a = p.T, b = p.B with B = N x T, so a x b = N (no mirrored
    island, the normal map stays correct). a/b ranges map onto the region's
    (s, t) sub-rectangle, inset by PAD units."""

    def __init__(self):
        self.faces = []

    def face(self, points, region, hint, T=None, sr=(0.0, 1.0), tr=(0.0, 1.0),
             normals=None, ar=None, br=None, st=None, metric=False):
        """`st` gives each corner's (s, t) in the region directly (tapered faces),
        ordered with `points`; s must run along T = Y x N and t along N x T.
        `metric` lays the face at true size from the region's low corner, so a
        pattern keeps one scale across faces of different sizes."""
        points = list(points)
        hint = norm(hint)
        n_flat = norm(newell(points))
        if dot(n_flat, hint) < 0:
            points.reverse()
            if normals is not None:
                normals = list(reversed(normals))
            if st is not None:
                st = list(reversed(st))
            n_flat = scale(n_flat, -1)
        if normals is None:
            normals = [n_flat] * len(points)
        else:
            normals = [norm(n) for n in normals]
        if T is None:
            T = (1.0, 0.0, 0.0) if abs(n_flat[1]) > 0.9 else norm(cross(Y_AXIS, n_flat))
        T = norm(sub(T, scale(n_flat, dot(T, n_flat))))
        B = cross(n_flat, T)
        a = [dot(p, T) for p in points]
        b = [dot(p, B) for p in points]
        if metric:
            ms, mt = REGIONS[region][1]
            assert max(a) - min(a) <= ms + 1e-9 and max(b) - min(b) <= mt + 1e-9, (region, 'face too big')
            ar, br = (min(a), min(a) + ms), (min(b), min(b) + mt)
        ar = ar or (min(a), max(a))
        br = br or (min(b), max(b))
        (u0, v0, u1, v1), _ = REGIONS[region]
        iu0, iu1, iv0, iv1 = u0 + PAD, u1 - PAD, v0 + PAD, v1 - PAD
        uvs = []
        for k, (ai, bi) in enumerate(zip(a, b)):
            if st is not None:
                s, t = st[k]
            else:
                s = sr[0] + (sr[1] - sr[0]) * (ai - ar[0]) / (ar[1] - ar[0])
                t = tr[0] + (tr[1] - tr[0]) * (bi - br[0]) / (br[1] - br[0])
            uvs.append(((iu0 + s * (iu1 - iu0)) / GRID, (iv0 + t * (iv1 - iv0)) / GRID))
        self.faces.append((points, normals, uvs))

    def triangles(self):
        return sum(len(f[0]) - 2 for f in self.faces)


def box(bld, x0, x1, y0, y1, z0, z1, regions, skip=(), uv=None):
    """Axis box. `regions` maps face name -> region (or one region for all);
    `uv` maps face name -> dict of extra Builder.face kwargs."""
    faces = {
        'left': ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
        'right': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
        'bottom': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
        'top': ([(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)], (0, 1, 0)),
        'back': ([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], (0, 0, -1)),
        'front': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
    }
    for name, (pts, n) in faces.items():
        if name in skip:
            continue
        region = regions if isinstance(regions, str) else regions[name]
        extra = (uv or {}).get(name, {})
        bld.face(pts, region, n, **extra)


# ---------------------------------------------------------------- parts

def build_plate(bld):
    """The plate as a lathe of its side profile: a flat top (a CREASE_SIDES-gon at
    y 0.10, circumradius CREASE_R) and one conic ramp from that crease ring down to
    a GROUND_SIDES-gon at r 1.2 on the ground. No vertical rim and no lip edge.

    A band between an m-ring and an n-ring costs m + n triangles (each triangle
    uses one edge of one ring; the merge advances whichever ring's next edge
    midpoint comes first), so the plate costs (m - 2) + (m + n) and the count sits
    on the ground ring, which is the silhouette from every camera at or above
    atan(0.10 / 0.25) = 22 deg and the outline from above. The crease never reads
    as a polygon: its normals are straight up on both sides (no shading step), and
    every plate face takes its UVs from world x/z in one planar projection, so the
    tread and paint run on down the ramp without a seam."""
    m, n = CREASE_SIDES, GROUND_SIDES
    assert n % 4 == 0 and n % m == 0
    # the stringer feet (y 0.098) rest inside the flat top's inscribed circle
    assert CREASE_R * math.cos(math.pi / m) > math.hypot(OUTER_STRINGER[1], STRINGER['z']) + 0.1

    def uv(p):  # the top face's own convention: s along +x, t along -z
        return ((p[0] + PLATE_R) / (2 * PLATE_R), (PLATE_R - p[2]) / (2 * PLATE_R))

    up = (0.0, 1.0, 0.0)
    crease = [(CREASE_R * math.cos(2 * math.pi * i / m), PLATE_Y1, CREASE_R * math.sin(2 * math.pi * i / m))
              for i in range(m)]
    ground = [(PLATE_R * math.cos(2 * math.pi * j / n), 0.0, PLATE_R * math.sin(2 * math.pi * j / n))
              for j in range(n)]
    sb, cb = math.sin(RAMP_SLOPE), math.cos(RAMP_SLOPE)
    ground_n = [(sb * math.cos(2 * math.pi * j / n), cb, sb * math.sin(2 * math.pi * j / n)) for j in range(n)]

    bld.face(crease, 'plate_top', up, st=[uv(p) for p in crease], normals=[up] * m)

    i = j = 0
    while i < m or j < n:
        mid_m = 2 * math.pi * (i + 0.5) / m
        mid_n = 2 * math.pi * (j + 0.5) / n
        if j < n and (i >= m or mid_n < mid_m):
            pts = [crease[i % m], ground[j % n], ground[(j + 1) % n]]
            nr = [up, ground_n[j % n], ground_n[(j + 1) % n]]
            th = mid_n
            j += 1
        else:
            pts = [crease[i % m], crease[(i + 1) % m], ground[j % n]]
            nr = [up, up, ground_n[j % n]]
            th = mid_m
            i += 1
        hint = (sb * math.cos(th), cb, sb * math.sin(th))
        bld.face(pts, 'plate_top', hint, st=[uv(p) for p in pts], normals=nr)


def build_pallet(bld):
    d = DECK
    s = STRINGER
    first_board = (0.02, BOARD_W / d['z'] / 2 - 0.02)  # t band inside the end board
    # Deck: top, ends and sides. The sides run down to the stringer foot: the outer
    # stringers' outer faces ARE the deck sides (one quad each; the 'stringer'
    # region paints the board ends above the stringer grain). No underside: it is
    # only reachable through the fork openings from below the deck.
    box(bld, -d['x'], d['x'], d['y0'], d['y1'], -d['z'], d['z'], 'deck', skip=('bottom', 'left', 'right'), uv={
        'front': dict(tr=first_board),
        'back': dict(tr=first_board),
    })
    for x, n in ((-d['x'], (-1, 0, 0)), (d['x'], (1, 0, 0))):
        bld.face([(x, s['y0'], -d['z']), (x, s['y0'], d['z']), (x, d['y1'], d['z']), (x, d['y1'], -d['z'])],
                 'stringer', n)
    t_top = (s['y1'] - s['y0']) / PALLET_SIDE_H
    ends = {'front': dict(sr=(0.4, 0.5), tr=(0.0, t_top)), 'back': dict(sr=(0.5, 0.6), tr=(0.0, t_top))}
    sides = dict(tr=(0.0, t_top))
    o0, o1 = OUTER_STRINGER
    # outer stringers: inner face and both ends (the outer face is the deck side)
    box(bld, -o1, -o0, s['y0'], s['y1'], -s['z'], s['z'], 'stringer',
        skip=('top', 'bottom', 'left'), uv={**ends, 'right': sides})
    box(bld, o0, o1, s['y0'], s['y1'], -s['z'], s['z'], 'stringer',
        skip=('top', 'bottom', 'right'), uv={**ends, 'left': sides})
    # middle stringer: its two ends only (its long faces stand inside the fork pockets)
    box(bld, -s['hx'], s['hx'], s['y0'], s['y1'], -s['z'], s['z'], 'stringer',
        skip=('top', 'bottom', 'left', 'right'), uv=ends)


def build_load(bld):
    L = LOAD
    regions = {k: 'card_side' for k in ('left', 'right', 'front', 'back')}
    regions['top'] = 'card_top'
    box(bld, -L['x'], L['x'], L['y0'], L['y1'], -L['z'], L['z'], regions, skip=('bottom',))


def ring(station):
    """A station's corners, counter-clockwise seen from above: -X-Z, -X+Z, +X+Z, +X-Z."""
    y, x0, x1, hz = station
    return [(x0, y, -hz), (x0, y, hz), (x1, y, hz), (x1, y, -hz)]


# Loft sides between consecutive corners of ring(): (corner i, corner i+1, outward hint).
LOFT_SIDES = ((0, 1, (-1, 0, 0)), (1, 2, (0, 0, 1)), (2, 3, (1, 0, 0)), (3, 0, (0, 0, -1)))


def loft_band(bld, sa, sb, regions, t_of_y=None, metric=False):
    """One band of the loft between stations sa and sb: four planar trapezoids
    (both rings are axis-aligned rectangles). With `t_of_y`, each corner gets s = 0/1
    at the low/high end of its own ring's edge (so paint follows the taper) and
    t = t_of_y(y); otherwise the face is laid at true size (`metric`)."""
    ra, rb = ring(sa), ring(sb)
    for i, j, hint in LOFT_SIDES:
        pts = [ra[i], ra[j], rb[j], rb[i]]
        region = regions[hint]
        if metric:
            bld.face(pts, region, hint, metric=True)
            continue
        n = norm(newell(pts))
        if dot(n, hint) < 0:
            n = scale(n, -1)
        T = norm(cross(Y_AXIS, n))
        aa = [dot(p, T) for p in pts]
        st = [(0.0 if aa[0] < aa[1] else 1.0, t_of_y(pts[0][1])),
              (0.0 if aa[1] < aa[0] else 1.0, t_of_y(pts[1][1])),
              (0.0 if aa[2] < aa[3] else 1.0, t_of_y(pts[2][1])),
              (0.0 if aa[3] < aa[2] else 1.0, t_of_y(pts[3][1]))]
        bld.face(pts, region, hint, st=st)


def build_mast(bld):
    """The mast as one loft through STATIONS: a hazard-painted plinth that flares
    from the shaft out to a ground footprint reaching under the plate rim, the
    tapered shaft (190 mm square at the foot, 130 mm at the top), a shoulder that
    grows the section out into the drive head, the head, and its lid. No foot or
    top faces: the plinth stands on the ground and the lid closes the top."""
    s = STATIONS
    assert all(s[i][0] < s[i + 1][0] for i in range(len(s) - 1)) and abs(s[-1][0] - TOP) < 1e-9
    every = lambda r: {(-1, 0, 0): r, (0, 0, 1): r, (1, 0, 0): r, (0, 0, -1): r}  # noqa: E731
    loft_band(bld, s[0], s[1], every('plinth'), metric=True)
    shaft = {(-1, 0, 0): 'mast_track', (0, 0, 1): 'mast', (1, 0, 0): 'mast', (0, 0, -1): 'mast'}
    loft_band(bld, s[1], s[2], shaft, t_of_y=lambda y: y / TOP)  # painted heights = true heights
    head_t = lambda y: (y - HEAD_Y0) / (TOP - HEAD_Y0)  # noqa: E731
    loft_band(bld, s[2], s[3], every('head'), t_of_y=head_t)
    loft_band(bld, s[3], s[4], every('head'), t_of_y=head_t)
    bld.face(ring(s[4]), 'head', (0, 1, 0), tr=(0.0, 0.2))  # lid, painted as the plain shoulder band
    # The plinth's -X end is under the plate (inside its rim) at ground level.
    y0, x0, _, hz0 = s[0]
    assert math.hypot(x0, hz0) < PLATE_R - 0.05


def build_control(bld):
    """Control box (front face where the runtime lamp sits) on a box-section console
    bracket lofted from inside the mast to inside the box back, so the box is carried
    across most of its back rather than on a stub."""
    b = BOX
    x0, x1, y0, y1, z0, z1 = b['x0'], b['x1'], b['y0'], b['y1'], b['z0'], b['z1']
    regions = {k: 'box_side' for k in ('left', 'right', 'top', 'back')}
    regions['front'] = 'box_front'
    # (no underside: it is only visible from below 1.0 m, and the ground camera sees it edge-on)
    box(bld, x0, x1, y0, y1, z0, z1, regions, skip=('bottom',))

    c = CONSOLE
    zm, zb = c['zm'], c['zb']
    (xm0, xm1), (ym0, ym1) = c['xm'], c['ym']
    (xb0, xb1), (yb0, yb1) = c['xb'], c['yb']
    for y in (ym0, ym1):  # the mast end is inside the shaft
        h = mast_h(y)
        assert abs(xm0 - MAST_CX) < h - 0.005 and abs(xm1 - MAST_CX) < h - 0.005 and zm < h - 0.005
    # the box end is inside the box, below the arm sweep (y 1.45 .. 1.55)
    assert x0 < xb0 < xb1 < x1 and y0 < yb0 < yb1 < y1 and z0 < zb < z1 and max(ym1, yb1) < 1.4
    for xa, xc in ((xm0, xb0), (xm1, xb1)):  # both sides leave through the +Z face
        for y in (ym0, ym1):
            h = mast_h(y)
            xs = xa + (xc - xa) * (h - zm) / (zb - zm)
            assert abs(xs - MAST_CX) < h - 0.005, ('console side leaves the mast off its +Z face', xs)
    inner = (-(zb - zm), 0.0, xb0 - xm0)  # outward normals of the slanted sides (horizontal)
    outer = (zb - zm, 0.0, -(xb1 - xm1))
    bld.face([(xm0, ym1, zm), (xm1, ym1, zm), (xb1, yb1, zb), (xb0, yb1, zb)], 'fitting', (0, 1, 0))
    bld.face([(xm0, ym0, zm), (xm0, ym1, zm), (xb0, yb1, zb), (xb0, yb0, zb)], 'fitting', inner)
    bld.face([(xm1, ym0, zm), (xm1, ym1, zm), (xb1, yb1, zb), (xb1, yb0, zb)], 'fitting', outer)
    # (no underside: it faces down at 1.03 .. 1.08 m, like the box's)


# ---------------------------------------------------------------- textures

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def band(v, centre, half, ramp):
    return 1.0 - smoothstep(half, half + ramp, np.abs(v - centre))


def rect(x, y, x0, x1, y0, y1, ramp):
    return band(x, (x0 + x1) / 2, (x1 - x0) / 2, ramp) * band(y, (y0 + y1) / 2, (y1 - y0) / 2, ramp)


def hash2(i, j, seed):
    h = np.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
    return h - np.floor(h)


def vnoise(x, y, cx, cy, seed):
    """Value noise in [0, 1] with cell size (cx, cy) metres (anisotropic)."""
    xi, yi = x / cx, y / cy
    i0, j0 = np.floor(xi), np.floor(yi)
    fx, fy = xi - i0, yi - j0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = hash2(i0, j0, seed)
    b = hash2(i0 + 1, j0, seed)
    c = hash2(i0, j0 + 1, seed)
    d = hash2(i0 + 1, j0 + 1, seed)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(x, y, cx, cy, seed, octaves=3):
    total, amp, norm_ = 0.0, 1.0, 0.0
    for k in range(octaves):
        total = total + amp * vnoise(x, y, cx / 2 ** k, cy / 2 ** k, seed + 13 * k)
        norm_ += amp
        amp *= 0.5
    return total / norm_


def mix(base, other, w):
    return base * (1 - w[..., None]) + other * w[..., None]


def tone(colour, factor):
    return colour[None, None, :] * factor[..., None]


def edge_light(S, T, ms, mt, width, amount):
    """Lighten within `width` metres of the face edges: the corner catching light."""
    d = np.minimum(np.minimum(S * ms, (1 - S) * ms), np.minimum(T * mt, (1 - T) * mt))
    return 1.0 + amount * (1 - smoothstep(0.0, width, d))


def r_plate_top(X, Y, S, T):
    """Every plate face, top and ramp, in one planar projection. Radii follow the
    lathe profile: tread field and rotation scuffs on the flat, a dark joint ring
    at r 0.875, a bright wear band over the crease (r 0.90 .. 0.97, the lugs worn
    down where pallet trucks ride on), then the ramp apron: a bolt ring at r 1.06,
    grime gathering toward the toe and a dark contact line where it meets the
    ground. All of it is round in the texture, so nothing shows the crease polygon."""
    cx, cy = X - 1.2, Y - 1.2
    r = np.hypot(cx, cy)
    f = 0.9 + 0.18 * fbm(X, Y, 0.35, 0.35, 1)
    p = 0.12
    lx, ly = X / p - np.floor(X / p) - 0.5, Y / p - np.floor(Y / p) - 0.5
    even = (np.floor(X / p) + np.floor(Y / p)) % 2 == 0
    a, b = (lx + ly) / math.sqrt(2), (lx - ly) / math.sqrt(2)
    along, across = np.where(even, a, b), np.where(even, b, a)
    lug = band(across, 0.0, 0.07, 0.06) * band(along, 0.0, 0.26, 0.08)
    wear = band(r, 0.935, 0.035, 0.02)  # the crease band
    lug = lug * (1 - 0.6 * wear)
    # Lugs catch light and wear bright on their crowns; the field between them holds dirt.
    crown = lug * (0.6 + 0.4 * fbm(X, Y, 0.25, 0.25, 5))
    col = tone(STEEL, f * (0.84 + 0.36 * crown))
    # Rotation scuffs: arcs of polish and dirt concentric with the turntable.
    rings = fbm(r, 0.0 * r, 0.06, 1.0, 7)  # a function of radius alone: concentric
    breaks = smoothstep(0.35, 0.65, fbm(X, Y, 0.45, 0.45, 8))  # broken into arcs
    window = smoothstep(0.25, 0.4, r) * (1 - smoothstep(0.80, 0.85, r))
    scuff = smoothstep(0.5, 0.75, rings) * breaks * window
    dirt = (1 - smoothstep(0.25, 0.45, rings)) * window
    col = col * (1 + 0.2 * scuff - 0.12 * dirt)[..., None]
    seam = band(r, 0.875, 0.006, 0.006)
    col = mix(col, STEEL * 0.4, seam * 0.9)
    worn = wear * (0.75 + 0.25 * fbm(X, Y, 0.08, 0.08, 4))
    col = col * (1 + 0.24 * worn)[..., None]
    # Ramp apron: slightly darker paint, a bolt ring, grime gathering toward the toe.
    apron = smoothstep(0.96, 1.0, r)
    col = col * (1 - 0.1 * apron)[..., None]
    bolts = np.zeros_like(X)
    for k in range(12):
        ang = 2 * math.pi * (k + 0.5) / 12
        bolts = np.maximum(bolts, band(np.hypot(cx - 1.06 * math.cos(ang), cy - 1.06 * math.sin(ang)), 0.0, 0.02, 0.006))
    col = mix(col, STEEL * 1.35, bolts * 0.85)
    grime = smoothstep(1.08, 1.17, r) * (0.55 + 0.45 * fbm(X, Y, 0.12, 0.12, 9))
    col = col * (1 - 0.22 * grime)[..., None]
    toe = band(r, 1.2, 0.012, 0.012)  # contact line at the ground
    col = mix(col, STEEL_RIM * 0.55, toe * 0.8)
    h = 0.0016 * lug - 0.0025 * seam + 0.0012 * bolts
    return col, h


def boards(Y):
    period = (1.2 - BOARD_W) / (BOARDS - 1)
    k = np.clip(np.floor(Y / period), 0, BOARDS - 1)
    local = Y - k * period
    inside = (local >= 0) & (local <= BOARD_W)
    edge = np.minimum(local, BOARD_W - local)
    return k, inside, edge


def wood(X, Y, base, seed, grain_y):
    """Grain lines run along X (the board length)."""
    warp = 1.4 * fbm(X, Y, 0.35, 0.05, seed)
    rings = 0.5 + 0.5 * np.sin(2 * math.pi * (grain_y / 0.045 + warp))
    f = 0.86 + 0.1 * fbm(X, Y, 0.5, 0.02, seed + 5) + 0.08 * rings
    return tone(base, f), 0.0006 * rings


def r_deck(X, Y, S, T):
    k, inside, edge = boards(Y)
    col, h = wood(X, Y, WOOD, 3, Y)
    tint = 0.9 + 0.2 * hash2(k, k * 3.0, 9)
    col = col * tint[..., None]
    bevel = smoothstep(0.0, 0.01, edge)
    col = col * (0.82 + 0.18 * bevel)[..., None]
    gap = np.where(inside, 0.0, 1.0)
    col = mix(col, GAP, gap)
    h = h + 0.004 * bevel - 0.012 * gap
    # nails over the stringers
    for xs in (0.055, 0.5, 0.945):
        for off in (0.03, 0.09):
            nail = band(X, xs, 0.006, 0.004) * band(np.where(inside, Y - k * ((1.2 - BOARD_W) / (BOARDS - 1)), 9.0), off, 0.006, 0.004)
            col = mix(col, np.array([60, 58, 56], np.float64), nail * 0.8)
    return col, h


def r_stringer(X, Y, S, T):
    """Y = height above the stringer foot (0 .. 0.152). Below the deck: stringer long
    grain; above Y 0.130 (the deck, seen only on the merged pallet sides): the deck
    boards' end grain with the slat gaps at the same z as the top's."""
    col, h = wood(X, Y, WOOD_DARK, 7, Y * 3.0)
    col = col * (1 - 0.18 * (1 - smoothstep(0.0, 0.04, Y)))[..., None]  # grime at the foot
    deck_y = DECK['y0'] - STRINGER['y0']  # 0.130
    k, inside, edge = boards(X)
    end = tone(WOOD, (0.82 + 0.12 * fbm(X, Y, 0.02, 0.01, 53)) * (0.9 + 0.2 * hash2(k, k * 3.0, 9)))
    end = end * (0.8 + 0.2 * smoothstep(0.0, 0.008, edge))[..., None]
    end = mix(end, GAP, np.where(inside, 0.0, 1.0))
    top = smoothstep(deck_y - 0.001, deck_y + 0.001, Y)
    col = mix(col, end, top)
    seam = band(Y, deck_y, 0.0015, 0.0015)
    col = mix(col, GAP, seam * 0.8)
    h = h * (1 - top) - 0.002 * seam - 0.006 * np.where(inside, 0.0, 1.0) * top
    return col, h


CARD_LIGHT = np.array([226, 190, 146], np.float64)  # scuffed, fibrous edges
CARD_DIRT = np.array([120, 92, 64], np.float64)
LABEL_WHITE = np.array([236, 234, 226], np.float64)


def card_body(X, Y, ms, mt, S, T, seed):
    """Shared kraft board: panel mottling, vertical board streaks (>= 3 cm, no
    flutes: they would alias), water marks, scuffed corners and a dirty foot."""
    f = 0.88 + 0.16 * fbm(X, Y, 0.24, 0.24, seed) + 0.07 * (fbm(X, Y, 0.035, 0.4, seed + 1) - 0.5)
    stain = smoothstep(0.6, 0.72, fbm(X + 3.1, Y + 1.7, 0.22, 0.18, seed + 2))
    f = f * (1 - 0.12 * stain) * edge_light(S, T, ms, mt, 0.018, 0.1)
    col = tone(CARD, f)
    d_edge = np.minimum(np.minimum(X, ms - X), np.minimum(Y, mt - Y))
    fray = (1 - smoothstep(0.0, 0.035, d_edge)) * smoothstep(0.35, 0.7, fbm(X, Y, 0.03, 0.03, seed + 3))
    col = mix(col, CARD_LIGHT, fray * 0.7)
    ring = band(fbm(X, Y, 0.2, 0.2, seed + 2), 0.6, 0.006, 0.006)  # the stain's dried edge
    col = mix(col, CARD_DIRT, ring * 0.35)
    crush = 1 - smoothstep(0.0, 0.022, d_edge)  # rounded, softened board edges
    h = -0.003 * crush  # (no dent noise: the colour carries it; PNG bytes are the budget)
    return col, h, d_edge


def r_card_side(X, Y, S, T):
    ms, mt = REGIONS['card_side'][1]
    col, h, _ = card_body(X, Y, ms, mt, S, T, 11)
    foot = (1 - smoothstep(0.0, 0.07, Y)) * (0.6 + 0.4 * fbm(X, Y, 0.05, 0.03, 15))
    col = mix(col, CARD_DIRT, foot * 0.45)
    joint = band(X, ms - 0.04, 0.014, 0.002)  # the glued manufacturer's joint
    col = col * (1 - 0.08 * joint)[..., None]
    # printed handling arrows, upper left
    for ax in (0.10, 0.17):
        shaft = rect(X, Y, ax - 0.007, ax + 0.007, 0.60, 0.68, 0.003)
        head = (Y > 0.67) & (Y < 0.72) & (np.abs(X - ax) < (0.72 - Y) * 0.7)
        col = mix(col, INK, np.maximum(shaft, head.astype(np.float64)) * 0.85)
    # printed content block under the arrows
    for k, w in enumerate((0.16, 0.11, 0.13)):
        col = mix(col, INK, rect(X, Y, 0.07, 0.07 + w, 0.50 - 0.035 * k, 0.515 - 0.035 * k, 0.002) * 0.75)
    # shipping label, lower right of the strap: white, a barcode block and text lines
    label = rect(X, Y, 0.53, 0.75, 0.14, 0.30, 0.002)
    col = mix(col, LABEL_WHITE * (0.96 + 0.06 * fbm(X, Y, 0.05, 0.05, 16))[..., None], label)
    bars = 0.55 + 0.45 * (np.floor((X - 0.55) / 0.02) % 2 == 0)  # >= 3 px bands, no aliasing
    col = mix(col, STRAP, rect(X, Y, 0.55, 0.73, 0.165, 0.205, 0.0015) * bars * 0.9)
    for ty in (0.235, 0.262):
        col = mix(col, INK * 0.6, rect(X, Y, 0.56, 0.71, ty - 0.004, ty + 0.004, 0.0015))
    strap = band(X, ms / 2, 0.016, 0.003)
    col = mix(col, STRAP, strap)
    return col, h + 0.002 * strap + 0.0006 * label


def r_card_top(X, Y, S, T):
    ms, mt = REGIONS['card_top'][1]
    col, h, d_edge = card_body(X, Y, ms, mt, S, T, 17)
    col = col * 1.04
    seam = band(Y, mt / 2, 0.003, 0.002)  # the flaps' meeting line, under the tape
    col = mix(col, CARD * 0.55, seam)
    # Tape: wobbling edges, wrinkles across it, lighter where it lifts at the edges,
    # and a second, overlapping length from the far end.
    wob = 0.004 * (fbm(X, Y, 0.12, 1.0, 21) - 0.5)
    tape = band(Y + wob, mt / 2, 0.03, 0.002) * band(X, ms / 2, ms / 2 - 0.004, 0.002)
    wrinkle = fbm(X, Y, 0.03, 0.25, 19)
    tcol = TAPE * (0.9 + 0.18 * wrinkle)[..., None]
    lift = band(Y + wob, mt / 2, 0.03, 0.002) - band(Y + wob, mt / 2, 0.024, 0.002)
    tcol = mix(tcol, CARD * 1.05, np.clip(lift, 0, 1) * 0.35)
    col = mix(col, tcol, tape * 0.92)
    over = band(Y + wob, mt / 2, 0.03, 0.002) * rect(X, Y, 0.52, ms, 0.0, mt, 0.002)
    col = col * (1 - 0.08 * over * (1 - smoothstep(0.0, 0.01, np.abs(X - 0.52))))[..., None]
    # a small dispatch label near one corner
    label = rect(X, Y, 0.08, 0.22, 0.66, 0.76, 0.002)
    col = mix(col, LABEL_WHITE, label)
    for ty in (0.69, 0.715, 0.74):
        col = mix(col, INK * 0.6, rect(X, Y, 0.10, 0.20, ty - 0.004, ty + 0.004, 0.0015))
    strap = np.maximum(band(X, ms / 2, 0.016, 0.003), band(Y, mt / 2, 0.016, 0.003))
    col = mix(col, STRAP, strap)
    return col, h + 0.001 * tape + 0.0012 * (wrinkle - 0.5) * tape + 0.002 * strap + 0.0006 * label


def r_box_front(X, Y, S, T):
    ms, mt = REGIONS['box_front'][1]
    f = (0.94 + 0.08 * fbm(X, Y, 0.12, 0.12, 23)) * edge_light(S, T, ms, mt, 0.008, 0.25)
    col = tone(SLATE, f)
    inset = 0.03  # inside the 18 mm front chamfer
    door = rect(X, Y, inset, ms - inset, inset, mt - inset, 0.002)
    door_in = rect(X, Y, inset + 0.004, ms - inset - 0.004, inset + 0.004, mt - inset - 0.004, 0.002)
    seam = door - door_in
    col = mix(col, SEAM, seam)
    lx, ly = LAMP[0] - BOX['x0'], LAMP[1] - BOX['y0']
    bezel = band(np.hypot(X - lx, Y - ly), 0.0, 0.05, 0.004)
    col = mix(col, SEAM * 1.3, bezel)
    ex, ey = 0.19, ly
    rr = np.hypot(X - ex, Y - ey)
    ring = band(rr, 0.0, 0.034, 0.003)
    col = mix(col, YELLOW, ring)
    button = band(rr, 0.0, 0.022, 0.003)
    col = mix(col, RED * (1 + 0.25 * (1 - smoothstep(0.0, 0.02, rr)))[..., None], button)
    label = rect(X, Y, 0.05, 0.20, 0.06, 0.13, 0.002)
    col = mix(col, LABEL, label)
    for ty in (0.085, 0.105):
        col = mix(col, SEAM, rect(X, Y, 0.065, 0.18, ty - 0.003, ty + 0.003, 0.001) * label)
    h = -0.0025 * seam + 0.004 * button + 0.0015 * ring + 0.0015 * bezel + edge_roll(X, Y, ms, mt)
    return col, h


def edge_roll(X, Y, ms, mt, width=0.012, depth=0.004):
    """Height falling off toward every edge: a folded sheet-metal edge in the normal map."""
    d = np.minimum(np.minimum(X, ms - X), np.minimum(Y, mt - Y))
    return -depth * (1 - smoothstep(0.0, width, d)) ** 2


def r_box_side(X, Y, S, T):
    ms, mt = REGIONS['box_side'][1]
    f = (0.94 + 0.08 * fbm(X, Y, 0.12, 0.12, 29)) * edge_light(S, T, ms, mt, 0.01, 0.22)
    return tone(SLATE * 0.95, f), edge_roll(X, Y, ms, mt)


def r_fitting(X, Y, S, T):
    """Console bracket: mast paint, light-catching edges, a weld line at each end."""
    ms, mt = REGIONS['fitting'][1]
    f = (0.92 + 0.12 * fbm(X, Y, 0.1, 0.1, 31)) * edge_light(S, T, ms, mt, 0.01, 0.3)
    col = tone(MAST_PAINT * 1.1, f)
    return col, edge_roll(X, Y, ms, mt, 0.01, 0.003)


def r_plinth(X, Y, S, T):
    """Hazard-striped plinth flare, laid at true size on every face (metric UVs):
    worn stripe paint, chipped edges and grime at the ground."""
    stripe = (np.floor((X + Y) / 0.1) % 2 == 0).astype(np.float64)
    f = 0.88 + 0.16 * fbm(X, Y, 0.18, 0.12, 37)
    col = mix(tone(YELLOW, f), tone(BLACK, f), stripe)
    chips = smoothstep(0.7, 0.8, fbm(X, Y, 0.04, 0.04, 38)) * (1 - stripe)
    col = mix(col, MAST_PAINT * 0.9, chips * 0.8)  # yellow chipped down to primer
    col = col * (1 - 0.3 * (1 - smoothstep(0.0, 0.06, Y)))[..., None]
    return col, -0.0012 * chips


def r_mast(X, Y, S, T):
    ms, mt = REGIONS['mast'][1]
    f = (0.92 + 0.12 * fbm(X, Y, 0.08, 0.6, 43)) * edge_light(S, 0.5 + 0 * T, ms, mt, 0.012, 0.35)
    col = tone(MAST_PAINT, f)
    # bolt pairs every 0.75 m (frame joints)
    bolts = np.zeros_like(X)
    for yb in (0.75, 1.5, 2.25):
        for xb in (0.04, 0.11):
            bolts = np.maximum(bolts, band(np.hypot(X - xb, Y - yb), 0.0, 0.009, 0.004))
    col = mix(col, MAST_PAINT * 1.8, bolts)
    # Section joints: a recessed seam with a lighter lip every 0.9 m.
    joint = np.zeros_like(X)
    for yj in (0.95, 1.85):
        joint = np.maximum(joint, band(Y, yj, 0.003, 0.002))
    col = mix(col, SEAM, joint * 0.9)
    lip = band(Y, 0.95 + 0.007, 0.002, 0.002) + band(Y, 1.85 + 0.007, 0.002, 0.002)
    col = col * (1 + 0.35 * lip)[..., None]
    # Access cover above the plinth: seam outline and four screws.
    cx0, cx1, cy0, cy1 = 0.03, ms - 0.03, 0.50, 0.86
    outer = rect(X, Y, cx0, cx1, cy0, cy1, 0.0015)
    inner_ = rect(X, Y, cx0 + 0.004, cx1 - 0.004, cy0 + 0.004, cy1 - 0.004, 0.0015)
    cover_seam = outer - inner_
    col = mix(col, SEAM, cover_seam * 0.9)
    col = col * (1 + 0.06 * inner_)[..., None]
    screws = np.zeros_like(X)
    for sx in (cx0 + 0.012, cx1 - 0.012):
        for sy in (cy0 + 0.014, cy1 - 0.014):
            screws = np.maximum(screws, band(np.hypot(X - sx, Y - sy), 0.0, 0.005, 0.002))
    col = mix(col, MAST_PAINT * 1.9, screws)
    # Shadow band under the shoulder, and the weld where the shaft leaves the plinth.
    under = smoothstep(HEAD_Y0 - 0.12, HEAD_Y0, Y)
    col = col * (1 - 0.25 * under)[..., None]
    foot = 1 - smoothstep(SHAFT_Y0, SHAFT_Y0 + 0.2, Y)
    col = col * (1 - 0.15 * foot)[..., None]
    weld = band(Y, SHAFT_Y0 + 0.006, 0.004, 0.003)
    col = mix(col, MAST_PAINT * 1.5, weld * 0.8)
    h = 0.002 * bolts - 0.003 * joint + 0.001 * lip - 0.002 * cover_seam + 0.0015 * screws + 0.0015 * weld
    return col, h


COVER_STEEL = np.array([124, 132, 142], np.float64)


def r_mast_cover(X, Y, S, T):
    """The +X, +Z and -Z faces: mast paint plus a galvanised cable-cover strip down
    the centre, screwed every 0.3 m and broken at the section joints."""
    ms, mt = REGIONS['mast'][1]
    col, h = r_mast(X, Y, S, T)
    run = (Y > SHAFT_Y0 + 0.05) & (Y < HEAD_Y0 - 0.06)
    strip = band(X, ms / 2, 0.021, 0.003) * run
    scol = COVER_STEEL * (0.86 + 0.18 * fbm(X, Y, 0.01, 0.5, 63))[..., None]
    scol = scol * (1 + 0.15 * band(X, ms / 2 - 0.016, 0.003, 0.002))[..., None]  # lit edge
    col = mix(col, scol, strip)
    shadow = band(X, ms / 2 + 0.025, 0.003, 0.002) * run  # the strip's cast edge
    col = col * (1 - 0.35 * shadow)[..., None]
    screws = np.zeros_like(X)
    for ys in np.arange(SHAFT_Y0 + 0.2, HEAD_Y0 - 0.1, 0.3):
        screws = np.maximum(screws, band(np.hypot(X - ms / 2, Y - ys), 0.0, 0.006, 0.002))
    col = mix(col, COVER_STEEL * 0.55, screws * strip)
    return col, h * (1 - strip) + 0.003 * strip - 0.001 * screws * strip


def r_mast_track(X, Y, S, T):
    ms, mt = REGIONS['mast_track'][1]
    col, _ = r_mast(X, Y, S, T)
    inner = (Y > SHAFT_Y0) & (Y < HEAD_Y0 + 0.01)
    channel = band(X, ms / 2, 0.032, 0.004) * inner
    lips = (band(X, ms / 2 - 0.038, 0.005, 0.003) + band(X, ms / 2 + 0.038, 0.005, 0.003)) * inner
    col = mix(col, TRACK * (0.9 + 0.2 * fbm(X, Y, 0.05, 0.3, 47))[..., None], channel)
    col = mix(col, MAST_PAINT * 1.6, lips)
    return col, -0.006 * channel + 0.0015 * lips


def r_head(X, Y, S, T):
    """Drive head: the shoulder (Y < 0.10, the sloped underside), then the housing
    with a vertical-slot vent, a lid seam with four bolts and a weld at the shaft."""
    ms, mt = REGIONS['head'][1]
    f = (0.94 + 0.08 * fbm(X, Y, 0.1, 0.1, 67)) * edge_light(S, 0.5 + 0 * T, ms, mt, 0.008, 0.25)
    col = tone(SLATE, f)
    shoulder = 1 - smoothstep(0.098, 0.104, Y)
    col = col * (1 - 0.12 * shoulder)[..., None]
    crease = band(Y, 0.101, 0.0025, 0.002)  # the bend line from shoulder to wall
    col = col * (1 + 0.3 * crease)[..., None]
    weld = band(Y, 0.006, 0.004, 0.003)
    col = mix(col, MAST_PAINT * 1.4, weld)
    vent = rect(X, Y, 0.05, ms - 0.05, 0.17, 0.31, 0.003)
    slots = band(np.mod(X - 0.05, 0.028), 0.014, 0.006, 0.002) * vent
    col = mix(col, SEAM, slots * 0.9)
    lid = band(Y, 0.40, 0.003, 0.002)
    col = mix(col, SEAM, lid)
    bolts = np.zeros_like(X)
    for bx in (0.025, ms - 0.025):
        bolts = np.maximum(bolts, band(np.hypot(X - bx, Y - 0.425), 0.0, 0.007, 0.003))
    col = mix(col, SLATE * 1.6, bolts)
    h = -0.004 * slots - 0.002 * lid + 0.0015 * bolts + 0.001 * weld
    return col, h


RENDERERS = {
    'plate_top': r_plate_top, 'deck': r_deck, 'stringer': r_stringer,
    'plinth': r_plinth, 'card_side': r_card_side, 'card_top': r_card_top, 'box_front': r_box_front,
    'box_side': r_box_side, 'fitting': r_fitting, 'head': r_head, 'mast': r_mast_cover,
    'mast_track': r_mast_track,
}


def render_atlas(px):
    """Returns (rgb uint8 [px, px, 3], normal uint8 [px, px, 3]); row 0 is v = 0."""
    ss = SUPERSAMPLE
    n = px * ss
    unit = n / GRID
    rgb = np.zeros((n, n, 3), np.float64)
    rgb[...] = 90.0
    nrm = np.zeros((n, n, 3), np.float64)
    nrm[..., 2] = 1.0
    for name, ((u0, v0, u1, v1), (ms, mt)) in REGIONS.items():
        c0, c1 = int(round(u0 * unit)), int(round(u1 * unit))
        r0, r1 = int(round(v0 * unit)), int(round(v1 * unit))
        cols = (np.arange(c0, c1) + 0.5) / unit
        rows = (np.arange(r0, r1) + 0.5) / unit
        S = (cols[None, :] - (u0 + PAD)) / (u1 - u0 - 2 * PAD)
        T = (rows[:, None] - (v0 + PAD)) / (v1 - v0 - 2 * PAD)
        S, T = np.broadcast_to(S, (len(rows), len(cols))), np.broadcast_to(T, (len(rows), len(cols)))
        X, Y = S * ms, T * mt
        col, h = RENDERERS[name](X, Y, S, T)
        rgb[r0:r1, c0:c1] = col
        h = np.broadcast_to(h, X.shape)
        dx = ms / ((u1 - u0 - 2 * PAD) * unit)
        dy = mt / ((v1 - v0 - 2 * PAD) * unit)
        if h.shape[0] > 1 and h.shape[1] > 1:
            gy, gx = np.gradient(h, dy, dx)
            nrm[r0:r1, c0:c1, 0] = -np.clip(gx, -MAX_SLOPE, MAX_SLOPE)
            nrm[r0:r1, c0:c1, 1] = -np.clip(gy, -MAX_SLOPE, MAX_SLOPE)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

    def down(a):
        return a.reshape(px, ss, px, ss, 3).mean(axis=(1, 3))

    rgb = np.clip(np.round(down(rgb)), 0, 255).astype(np.uint8)
    nm = down(nrm)
    nm /= np.linalg.norm(nm, axis=-1, keepdims=True)
    nm = np.clip(np.round((nm * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    return rgb, nm


def write_jpeg(path, rgb, quality):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as is `rgb`
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


def write_png(path, rgb):
    """Minimal RGB8 PNG writer (rows top-first), per-row None/Sub/Up filter choice."""
    rows = rgb[::-1].astype(np.int16)  # row 0 of the array is v = 0, the bottom
    h, w, _ = rows.shape
    flat = rows.reshape(h, w * 3)
    out = bytearray()
    prev = np.zeros(w * 3, np.int16)
    for r in range(h):
        line = flat[r]
        subf = line.copy()
        subf[3:] = line[3:] - line[:-3]
        up = line - prev
        candidates = [(0, line), (1, subf), (2, up)]
        cost = [np.abs(((c + 128) % 256) - 128).sum() for _, c in candidates]
        ftype, data = candidates[int(np.argmin(cost))]
        out.append(ftype)
        out += (data % 256).astype(np.uint8).tobytes()
        prev = line

    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(out), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


# ---------------------------------------------------------------- mesh

def to_blender(p):
    """runtime three.js (x, y, z) -> Blender (x, -z, y), after the runtime offset."""
    return (p[0] - OFFSET_X, -p[2], p[1])


def dir_to_blender(n):
    return (n[0], -n[2], n[1])


def check_bounds(bld):
    pts = [p for f in bld.faces for p in f[0]]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    want_lo = (X_MIN, 0.0, -Z_HALF)
    want_hi = (X_MAX, TOP, Z_HALF)
    for i, axis in enumerate('xyz'):
        if abs(lo[i] - want_lo[i]) > BOUNDS_TOL or abs(hi[i] - want_hi[i]) > BOUNDS_TOL:
            raise SystemExit(f'bounds {axis}: {lo[i]:.4f}..{hi[i]:.4f}, want {want_lo[i]}..{want_hi[i]}')
    centre_x = (lo[0] + hi[0]) / 2 - OFFSET_X
    if abs(centre_x) > 0.0005:
        raise SystemExit(f'GLB x centre {centre_x:.5f} is not 0')
    print(f'STRETCH_WRAP_BOUNDS runtime x {lo[0]:.4f}..{hi[0]:.4f} y {lo[1]:.4f}..{hi[1]:.4f} '
          f'z {lo[2]:.4f}..{hi[2]:.4f}; GLB width {hi[0] - lo[0]:.4f} height {hi[1]:.4f} length {hi[2] - lo[2]:.4f}')


def build_mesh(bld):
    tris = bld.triangles()
    if tris * 3 > INDEX_BUDGET:
        raise SystemExit(f'{tris * 3} indices exceeds the {INDEX_BUDGET}-index budget')
    check_bounds(bld)
    verts, index, faces = [], {}, []
    for pts, _n, _uv in bld.faces:
        f = []
        for p in pts:
            key = tuple(round(c, 6) for c in p)
            if key not in index:
                index[key] = len(verts)
                verts.append(to_blender(p))
            f.append(index[key])
        faces.append(f)
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if len(mesh.polygons) != len(faces):
        raise SystemExit('Blender dropped faces on import')
    flipped = 0
    for poly in mesh.polygons:
        _pts, nrm, _uv = bld.faces[poly.index]
        hint = norm(tuple(sum(n[i] for n in nrm) for i in range(3)))
        if poly.normal.dot(dir_to_blender(hint)) <= 0:
            flipped += 1
    if flipped:
        raise SystemExit(f'{flipped} faces wound inward')
    uv_layer = mesh.uv_layers.new(name='UVMap')
    loop_normals = [None] * len(mesh.loops)
    for poly in mesh.polygons:
        _pts, nrm, uvs = bld.faces[poly.index]
        poly.use_smooth = True
        for k, li in enumerate(poly.loop_indices):
            uv_layer.data[li].uv = uvs[k]
            loop_normals[li] = dir_to_blender(nrm[k])
    mesh.normals_split_custom_set(loop_normals)
    return mesh, tris


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # glTF doubleSided: false, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = METALNESS
    bsdf.inputs['Roughness'].default_value = ROUGHNESS
    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-stretch-wrap-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-stretch-wrap-body-normal'
    normal_img.colorspace_settings.is_data = True
    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    colour_node.interpolation = 'Linear'
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])
    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_tex.interpolation = 'Linear'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def export(path):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        export_image_format='AUTO',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='NONE',
        export_all_vertex_colors=False,
        export_colors=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-stretch-wrap-body.py)',
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})


def main():
    path = out_path()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    bld = Builder()
    build_plate(bld)
    build_pallet(bld)
    build_load(bld)
    build_mast(bld)
    build_control(bld)
    stage = tempfile.mkdtemp(prefix='yard-stretch-wrap-body-')
    try:
        colour_path = os.path.join(stage, 'yard-stretch-wrap-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-stretch-wrap-body-normal.png')
        rgb, _ = render_atlas(COLOUR_PX)
        _, nm = render_atlas(NORMAL_PX)
        write_jpeg(colour_path, rgb, COLOUR_Q)
        write_png(normal_path, nm)
        print('STRETCH_WRAP_TEXTURES colour', os.path.getsize(colour_path), 'normal', os.path.getsize(normal_path))
        mesh, tris = build_mesh(bld)
        mesh.materials.append(build_material(colour_path, normal_path))
        obj = bpy.data.objects.new(NODE_NAME, mesh)
        obj['authoredCastShadow'] = False
        obj['authoredReceiveShadow'] = False
        scene.collection.objects.link(obj)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        export(path)
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'STRETCH_WRAP_BUILT {path} triangles={tris} indices={tris * 3} bytes={os.path.getsize(path)}')


main()
