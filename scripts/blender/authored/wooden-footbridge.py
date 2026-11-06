"""Wooden canal footbridge (world-wooden-footbridge), built from scratch in headless Blender.

What it builds
--------------
A 14.04 m timber pedestrian footbridge, 3.0 m wide overall, 2.05 m tall, ground
at y 0, centred on the origin in X and Z, spanning along Z (glTF +Z is the
front, as the delivered GLB). Every part is joined to the next by real overlap,
so the whole bridge is one grounded assembly:

* four portal bents at z = +-1.6 and +-4.75 m. Each is one solid lofted
  along z from its traced front profile: two battered legs 0.42 m wide at the
  foot and 0.40 m deep, haunched knees and a 0.275 m headstock, with a boarded
  sway panel recessed 0.15 m in the opening, a chamfered mud sill under the
  feet and a bearing block (corbel, raked ends) under each stringer. There are
  no diagonals;
* two edge stringers lofted along the full length from one traced
  cross-section with a 30 mm top-outer and a 40 mm bottom-outer chamfer. Their
  outer faces carry a registered fascia elevation: three boards butted over the
  inner bents, and coach bolts with square washers at every bent;
* two joists and a centre stringer bearing on the caps, and a nosing board
  across each deck end, 5 mm under the deck and inside the stringer ends;
* 35 cross boards laid as real boards: each has its own width (0.37-0.41 m)
  and joint (5-20 mm), a few millimetres out of square. Only their tops are
  drawn, at exactly y 1.335 m (the runtime walk-on datum); the joints look down
  onto a dark sub-deck plane under the boards;
* railings: nine 0.11 m posts per side at the painted stations and an end
  newel at each end, all at x +-1.4 m and mortised through the stringer; the
  0.12 x 0.12 m handrail runs between the newels, whose tops are flush with it
  at exactly 2.05 m.

Runtime anchors kept (src/components/scenery/WorldPublicRealm.tsx and its test):

* deck top at y 1.335 under x = 0 at z = -6.92, -0.02 and +6.92 (local);
* the first hit straight down at x = +-1.4, z = -6.5 + 1.5 i (i = 0..9) is the
  handrail top at y 2.05: the painted cream posts, caps and rails are placed on
  these stations, so the brown posts stand exactly there;
* the newels sit at z -7.01..-6.935 (where the runtime paints its first post)
  and 6.935..7.01 (the z 7.0 station lands on its top), 0.124 m square, so both
  stay inside the painted 0.13 m sleeves;
* the GLB rail cannot rise above 2.05 m (the manifest height bound and the
  station rays) nor the deck drop below 1.335 m (the walk-on collider), so the
  GLB rail stands 0.715 m above the deck; in game the painted joinery's top
  rail at deckY + 1.0 is the guard and the brown rail reads as its middle rail;
* every support stays within |z| < 5.4 m, clear of the canal walls
  (x +-5.5..6.5 about the canal centre, top y 1.05 in game).

Budget: maxRenderVertices 2340 counts indices, so at most 780 triangles. Faces
that can never be seen are left out: board sides, ends and undersides (the
sub-deck shows through the joints), post bottoms and tops, leg feet and the
headstock top (housed in the sill and under the deck), corbel tops, sill
bottoms, joist ends and tops, and the handrail ends (abutting the newels). The
script refuses to export more than 2340 indices.

Surface: one registered deck plan plus timber bands
---------------------------------------------------
One doubleSided material (as delivered), metallicFactor 0, constant roughness,
and two textures generated here from seeded fields, both laid out the same way:

* a 1024 x 512 sRGB albedo. The bottom half (in image rows) is a plan of the deck painted from the
  same plank list that builds the geometry, so every board edge, gap, nail and
  stain is registered to a real board. It is split into two 1024 x 128 strips
  (the two halves of the span), so the texels run 7 mm across the grain and
  21 mm along it. The plan carries each board's own grain (flat-sawn cathedral
  figure or tight quarter-sawn lines, some knots), its own independent grey,
  value, warmth and end-to-end ramp (so tone changes at every joint, never in
  patches), two newer replacement boards, darkened arrises, dirt in the joints, nail pairs over the joists and
  stringers with rust halos, a lighter foot-worn track down the middle and
  green-grey grime along both stringers. Then the 1024 x 64 fascia elevation
  (registered through fascia_uv), and three 64 px bands that tile along the
  grain: rail and post, structure, and end-grain tiles;
* a 512 x 256 tangent-space normal map from the same height field (rounded
  board arrises, sunken gaps and nails, latewood proud of earlywood).

Board tops map straight onto their place in the plan. Long members
run u along the grain in metres (2 m per tile) inside their band. Faces whose
normal follows the grain take an end-grain tile. COLOR_0 is near-white ambient
occlusion (tops 1.0, sides 0.88, undersides 0.68, structure darkening toward
the ground to 0.84) plus a per-board tone and end-to-end ramp on the deck.
Timber families are separated by value: silvered light deck, honey rails and
posts, mid-brown fascia, darker cooler structure.

Node convention matches the delivered GLB: a unit mesh under node
`Wooden-footbridgeBody` at translation (0, 1.025, 0), scale 14.04.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/wooden-footbridge.py -- <out.glb>

Re-runnable and deterministic. Writes only <out.glb> (and a temp dir it removes).
"""

import math
import os
import shutil
import sys
import tempfile

import bpy
import numpy as np

# ---------------------------------------------------------------- contract
HALF_W = 1.5
HALF_L = 7.02
HEIGHT = 2.05
DECK_Y = 1.335
INDEX_BUDGET = 2340

NODE_NAME = 'Wooden-footbridgeBody'
MESH_NAME = 'wooden-footbridge-mesh'
MATERIAL_NAME = 'wooden-footbridge-surface'
SCENE_NAME = 'MillOS_World_Wooden-footbridge'
NODE_Y = HEIGHT / 2
NODE_SCALE = 2 * HALF_L

# ---------------------------------------------------------------- layout (metres, glTF frame)
# Edge stringers are lofted from one cross-section traced in the x-y plane:
# inner face, top, a 30 mm top-outer chamfer, the outer (fascia) face, a 40 mm
# bottom-outer chamfer and the bottom. +X side; the -X side mirrors it.
STRINGER_PROFILE = ((1.25, 0.90), (1.46, 0.90), (1.50, 0.94), (1.50, 1.33), (1.47, 1.36), (1.25, 1.36))
STRINGER_FASCIA_EDGES = (1, 2, 3)  # profile edges (i -> i+1) on the outer side, mapped to the fascia elevation
FASCIA_S = (0.4890, 0.4324, 0.0424, 0.0)  # developed distance from the top-chamfer arris, per outer profile point 1..4
FASCIA_DEPTH = 0.4890
FASCIA_JOINTS = (-1.6, 1.6)  # butt joints in the fascia boards, over the inner bents
KERB_X = (1.25, 1.50)
PLANK_COUNT = 35
PLANK_HALF_X = 1.26  # 10 mm into each stringer
PLANK_END_EDGE = 6.97  # outer edges of the end planks, 5 mm short of the end boards
PLANK_WIDTHS = (0.37, 0.41)
PLANK_GAPS = (0.008, 0.015)
PLANK_SKEW = 0.003  # each board edge is up to 3 mm out of square at each end
MIN_GAP = 0.005
SUBDECK_Y = 1.284  # the dark sub-deck under the boards, seen through the joints
JOIST_XS = (-0.70, 0.0, 0.70)  # two joists and a centre stringer
JOIST_HALF = 0.06
JOIST_Y = (0.885, 1.288)  # 10 mm into the caps, 4 mm through the sub-deck
JOIST_END = 6.985  # inside the end boards
END_BOARD_Z = (6.975, 7.015)  # deck-end nosing board, 5 mm inside the stringer ends
END_BOARD_Y = (0.93, 1.33)  # top 5 mm under the deck, never coplanar
# Four portal bents. Each is ONE solid lofted along z from its traced front
# profile (two battered legs, haunched knees and a deep headstock), with a
# boarded sway panel recessed in the opening, a mud sill under the feet and a
# bearing block (corbel) under each stringer. No diagonals.
BENT_ZS = (-4.75, -1.6, 1.6, 4.75)  # corbel ends stay 0.1 m clear of the canal walls
SUPPORT_Z_LIMIT = 5.4
SILL_HALF_X = 1.49
SILL_HALF_Z = 0.26
SILL_TOP = 0.14
SILL_CHAMFER = 0.045
BENT_HALF_Z = 0.20  # legs 0.40 m deep along the bridge
# Front profile, +X half (x, y); the -X half mirrors it.
LEG_FOOT = ((1.04, SILL_TOP - 0.01), (1.46, SILL_TOP - 0.01))  # inner, outer: 10 mm into the sill
LEG_TOP_OUTER = (1.40, 0.895)  # battered outer face up to the headstock top
HAUNCH = ((1.08, 0.44), (0.72, 0.62))  # inner leg top -> headstock underside
HEAD_TOP = 0.895  # 5 mm under the stringers; the joists sink 10 mm into it
PANEL_HALF_Z = 0.05  # boarded sway panel, recessed 0.15 m behind the bent faces
PANEL_X = 1.10  # its edges are housed in the legs, knees, headstock and sill
PANEL_Y = (SILL_TOP - 0.01, 0.63)
PANEL_BOARDS = 3
CORBEL_X = (1.235, 1.48)
CORBEL_Y = (0.78, 0.91)  # sits into the headstock, 10 mm into the stringer underside
CORBEL_HALF_Z = 0.55
CORBEL_FOOT_HALF_Z = 0.40
POST_X = 1.4
POST_HALF = 0.055
POST_Y = (1.10, 1.94)  # bottom inside the stringer, top inside the handrail
POST_STATIONS = [-6.5 + 1.5 * i for i in range(10)]
NEWELS = ((-7.01, -6.935), (6.935, 7.01))  # end newels to the full 2.05; the z 7.0 station lands on one
NEWEL_HALF = 0.062  # 3 mm inside the painted 0.13 m sleeves
RAIL_HALF_X = 0.06  # 5 mm inside the painted 0.13 m sleeves, never flush
RAIL_Y = (1.93, HEIGHT)

# Atlas layout (array row r is v = r / TEX_H; Blender image rows run bottom-up).
TEX_W, TEX_H = 1024, 512
PLAN_ROWS = 128  # each half of the deck plan
PLAN_ROW_MARGIN = 3
PLAN_COL_MARGIN = 4
PLAN_X = 1.27  # plan covers x -1.27..1.27 (planks span +-1.26)
PLAN_Z_END = 6.99
BAND_PX = 64
B_FASCIA, B_RAIL, B_STRUCT, B_END = 0, 1, 2, 3  # B_FASCIA is the registered fascia elevation
BAND_ROW0 = {b: 2 * PLAN_ROWS + b * BAND_PX for b in range(4)}
FASCIA_ROW_MARGIN = 3
FASCIA_COL_MARGIN = 4
END_TILES = TEX_W // BAND_PX
BAND_METRES = 0.40  # face width that fills the usable 0.84 of a band
T_USE = (0.08, 0.92)
TIMBER_TILE = 2.0  # metres per tile along the grain for long members

# Ambient occlusion carried in COLOR_0 (linear multipliers, near white).
AO_TOP, AO_SIDE, AO_BOTTOM = 1.0, 0.88, 0.68
AO_UNDER_DECK = 0.9
AO_SUBDECK = 0.42

ROUGHNESS = 0.8
ALBEDO_QUALITY = 66
NORMAL_QUALITY = 68

RNG = np.random.default_rng(20261106)


def out_path():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: Blender -b --factory-startup -P wooden-footbridge.py -- <out.glb>')
    return os.path.abspath(argv[0])


# ---------------------------------------------------------------- vectors
def v_add(*vs):
    return tuple(sum(c) for c in zip(*vs))


def v_sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def v_scale(v, s):
    return tuple(c * s for c in v)


def v_dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def v_norm(v):
    length = math.sqrt(v_dot(v, v))
    return tuple(c / length for c in v)


def v_mean(vs):
    return tuple(sum(c) / len(vs) for c in zip(*vs))


# ---------------------------------------------------------------- deck layout
def lay_planks():
    """Board edges (z at x = -1.26 and x = +1.26) for 35 planks laid as real
    boards: varied widths and gaps, each edge a few mm out of square. Returns
    a list of (zl_lo, zl_hi, zr_lo, zr_hi) where lo/hi are the -X/+X ends."""
    rng = np.random.default_rng(3507)
    span = 2 * PLANK_END_EDGE
    for _ in range(400):
        widths = rng.uniform(*PLANK_WIDTHS, PLANK_COUNT)
        gaps = rng.uniform(*PLANK_GAPS, PLANK_COUNT - 1)
        f = span / (widths.sum() + gaps.sum())
        widths, gaps = widths * f, gaps * f
        edges = []  # centreline edges
        z = -PLANK_END_EDGE
        for k in range(PLANK_COUNT):
            edges.append([z, z + widths[k]])
            z += widths[k] + (gaps[k] if k < PLANK_COUNT - 1 else 0.0)
        edges[-1][1] = PLANK_END_EDGE
        planks = []
        for k, (a, b) in enumerate(edges):
            da = 0.0 if k == 0 else float(rng.uniform(-PLANK_SKEW, PLANK_SKEW))
            db = 0.0 if k == PLANK_COUNT - 1 else float(rng.uniform(-PLANK_SKEW, PLANK_SKEW))
            planks.append((a - da, a + da, b - db, b + db))
        ok = all(min(planks[k + 1][0] - planks[k][2], planks[k + 1][1] - planks[k][3]) >= MIN_GAP
                 for k in range(PLANK_COUNT - 1))
        ok = ok and all(min(p[2] - p[0], p[3] - p[1]) >= 0.28 for p in planks)
        mids = [((p[0] + p[1]) / 2, (p[2] + p[3]) / 2) for p in planks]
        for probe in (-6.92, -0.02, 6.92):
            ok = ok and any(lo + 0.03 < probe < hi - 0.03 for lo, hi in mids)
        if ok:
            return planks
    raise SystemExit('could not lay the planks within the probe and gap constraints')


def plan_frame(planks):
    """Split the deck plan at the gap nearest z = 0 into two halves, each mapped
    at the same scale into a 1024 x 128 strip."""
    mids = [((p[0] + p[1]) / 2, (p[2] + p[3]) / 2) for p in planks]
    best = min(range(PLANK_COUNT - 1), key=lambda k: abs((mids[k][1] + mids[k + 1][0]) / 2))
    split = (max(planks[best][2], planks[best][3]) + min(planks[best + 1][0], planks[best + 1][1])) / 2
    scale = (TEX_W - 2 * PLAN_COL_MARGIN) / max(split + PLAN_Z_END, PLAN_Z_END - split)
    halves = ({'z0': -PLAN_Z_END, 'row0': 0}, {'z0': split, 'row0': PLAN_ROWS})
    return {'split': split, 'scale': scale, 'halves': halves, 'best': best}


def plan_uv(frame, half, x, z):
    h = frame['halves'][half]
    col = PLAN_COL_MARGIN + (z - h['z0']) * frame['scale']
    row = h['row0'] + PLAN_ROW_MARGIN + (x + PLAN_X) / (2 * PLAN_X) * (PLAN_ROWS - 2 * PLAN_ROW_MARGIN)
    return (col / TEX_W, row / TEX_H)


# ---------------------------------------------------------------- geometry store
class Store:
    def __init__(self):
        self.verts = []  # glTF metres
        self.faces = []
        self.uvs = []
        self.cols = []  # per corner
        self.normals = []  # nominal outward direction per face (glTF), for the winding check
        self.centres = []
        self.groups = []  # part name per face
        self.group = 'misc'

    def face(self, corners, outward, colours, uvs):
        """A planar polygon (3+ corners) wound counter-clockwise seen from outside."""
        base = len(self.verts)
        self.verts.extend(corners)
        self.faces.append(list(range(base, base + len(corners))))
        self.uvs.append(uvs)
        self.cols.append(colours)
        self.normals.append(outward)
        self.centres.append(v_mean(corners))
        self.groups.append(self.group)

    @property
    def triangles(self):
        return sum(len(f) - 2 for f in self.faces)


def poly_normal(pts):
    """Newell normal of a planar polygon."""
    n = [0.0, 0.0, 0.0]
    for a in range(len(pts)):
        p, q = pts[a], pts[(a + 1) % len(pts)]
        n[0] += (p[1] - q[1]) * (p[2] + q[2])
        n[1] += (p[2] - q[2]) * (p[0] + q[0])
        n[2] += (p[0] - q[0]) * (p[1] + q[1])
    return v_norm(tuple(n))


def face_t_start(width, slack_pick):
    """Where a face of `width` metres starts across its band (in band t)."""
    span = (T_USE[1] - T_USE[0]) * min(1.0, width / BAND_METRES)
    slack = (T_USE[1] - T_USE[0]) - span
    return T_USE[0] + slack * slack_pick, span


def band_v(band, t):
    return (BAND_ROW0[band] + t * BAND_PX) / TEX_H


def facing_ao(fn):
    if fn[1] > 0.7:
        return AO_TOP
    if fn[1] < -0.7:
        return AO_BOTTOM
    return AO_SIDE


def emit(store, pts, outward, grain, uvspec, shade=None, face_ao=None):
    """Emit one planar face of a timber member. The corners are reordered to
    wind counter-clockwise seen from `outward`. `uvspec` ('timber', band,
    u_offset) runs a tiling band along `grain` in metres; a face whose normal
    follows the grain takes an end-grain tile. COLOR_0 is ambient occlusion."""
    fn = poly_normal(pts)
    if v_dot(fn, outward) < 0:
        pts = list(reversed(pts))
        fn = v_scale(fn, -1)
    uvs = []
    if abs(v_dot(fn, grain)) > 0.7:  # end grain: one ring tile
        t1 = v_norm(v_cross(fn, (0.0, 1.0, 0.0) if abs(fn[1]) < 0.9 else (1.0, 0.0, 0.0)))
        t2 = v_cross(fn, t1)
        a = [v_dot(pt, t1) for pt in pts]
        b = [v_dot(pt, t2) for pt in pts]
        tile = int(RNG.integers(0, END_TILES))
        sa, _ = face_t_start(max(a) - min(a), float(RNG.uniform()))
        sb, _ = face_t_start(max(b) - min(b), float(RNG.uniform()))
        scale = (T_USE[1] - T_USE[0]) / BAND_METRES
        for ai, bi in zip(a, b):
            uvs.append(((tile + sa + (ai - min(a)) * scale) / END_TILES,
                        band_v(B_END, sb + (bi - min(b)) * scale)))
    else:
        perp = v_norm(v_cross(fn, grain))
        across = [v_dot(pt, perp) for pt in pts]
        a0 = min(across)
        width = max(across) - a0
        _, band, u_off = uvspec
        t0, span = face_t_start(width, float(RNG.uniform()))
        for pt, ac in zip(pts, across):
            u = v_dot(pt, grain) / TIMBER_TILE + u_off
            t = t0 + span * ((ac - a0) / width if width > 1e-9 else 0.0)
            uvs.append((u, band_v(band, t)))
    base_ao = facing_ao(fn) if face_ao is None else face_ao
    cols = []
    for pt in pts:
        a = min(1.0, base_ao * (shade(pt) if shade else 1.0))
        cols.append((a, a, a))
    store.face(pts, outward, cols, uvs)


def hexa(store, corners, axes, grain, uvspec, skip=(), shade=None):
    """A six-face solid from eight corners `corners[(i, j, k)]`, i/j/k in {0, 1}.
    `axes` are the nominal directions of i, j and k; the corners may be sheared
    (chamfers, plumb cuts, raked ends) as long as each face stays planar.
    `skip` lists faces never seen, as (axis index, side 0/1)."""
    centre = v_mean(list(corners.values()))
    for k in range(3):
        for side in (1, 0):
            if (k, side) in skip:
                continue
            p_i, q_i = [j for j in range(3) if j != k]
            pts = []
            for bp, bq in ((0, 0), (1, 0), (1, 1), (0, 1)):
                bits = [0, 0, 0]
                bits[k], bits[p_i], bits[q_i] = side, bp, bq
                pts.append(corners[tuple(bits)])
            emit(store, pts, v_sub(v_mean(pts), centre), grain, uvspec, shade)


AX = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def box_corners(lo, hi):
    return {(i, j, k): (hi[0] if i else lo[0], hi[1] if j else lo[1], hi[2] if k else lo[2])
            for i in (0, 1) for j in (0, 1) for k in (0, 1)}


def timber(band):
    return ('timber', band, float(RNG.uniform(0, 1)))


def aabb(store, lo, hi, uvspec, grain_axis, skip=(), shade=None):
    hexa(store, box_corners(lo, hi), AX, AX[grain_axis], uvspec, skip, shade)


def ground_shade(top, floor=0.84):
    """Darker toward the ground: wet and dirty at the foot, clean under the deck."""
    return lambda p: floor + (1.0 - floor) * min(1.0, max(0.0, p[1] / top))


def under_deck(p):
    return AO_UNDER_DECK


def loft_stringer(store, side):
    """An edge stringer lofted along z from its traced cross-section. The three
    outer edges (bottom chamfer, fascia face, top chamfer) map onto the
    registered fascia elevation, so the board joints and bolts painted there sit
    over the bents; the other faces run the structure band."""
    prof = [(side * x, y) for x, y in STRINGER_PROFILE]
    cx = v_mean([(x, y, 0.0) for x, y in prof])
    shade = lambda p: 0.93 + 0.07 * (p[1] - 0.90) / 0.46
    u_off = float(RNG.uniform(0, 1))
    n = len(prof)
    for e in range(n):
        (xa, ya), (xb, yb) = prof[e], prof[(e + 1) % n]
        pts = [(xa, ya, -HALF_L), (xb, yb, -HALF_L), (xb, yb, HALF_L), (xa, ya, HALF_L)]
        mid = ((xa + xb) / 2, (ya + yb) / 2, 0.0)
        outward = v_sub(mid, cx)
        if e in STRINGER_FASCIA_EDGES:
            fn = poly_normal(pts)
            if v_dot(fn, outward) < 0:
                pts = list(reversed(pts))
            uvs, cols = [], []
            for pt in pts:
                k = next(i for i, (x, y) in enumerate(prof) if abs(x - pt[0]) < 1e-9 and abs(y - pt[1]) < 1e-9)
                uvs.append(fascia_uv(pt[2], FASCIA_S[k - 1]))
                a = min(1.0, AO_SIDE * shade(pt))
                cols.append((a, a, a))
            store.face(pts, outward, cols, uvs)
        else:
            emit(store, pts, outward, AX[2], ('timber', B_STRUCT, u_off), shade)
    for zend in (-HALF_L, HALF_L):
        pts = [(x, y, zend) for x, y in prof]
        emit(store, pts, (0.0, 0.0, zend), AX[2], ('timber', B_STRUCT, 0.0), shade)


def fascia_uv(z, s):
    col = FASCIA_COL_MARGIN + (z + HALF_L) / (2 * HALF_L) * (TEX_W - 2 * FASCIA_COL_MARGIN)
    row = BAND_ROW0[B_FASCIA] + FASCIA_ROW_MARGIN + s / FASCIA_DEPTH * (BAND_PX - 2 * FASCIA_ROW_MARGIN)
    return (col / TEX_W, row / TEX_H)


def portal_bent(store, zb):
    """One bent as a single solid lofted along z from its traced front profile:
    two battered legs, haunched knees and a deep headstock. The front and back
    faces are split into convex pieces along the timber joints (leg, knee,
    headstock), so each piece runs its own grain; the side walls follow the
    profile. Feet (in the sill) and the headstock top (under the deck) are not
    drawn."""
    (cx, cy), (ax, ay) = LEG_FOOT
    bx, by = LEG_TOP_OUTER
    (dx, dy), (fx, fy) = HAUNCH
    t = (dy - ay) / (by - ay)
    ax2 = ax + (bx - ax) * t  # outer face at the haunch height
    shade = ground_shade(HEAD_TOP)
    for zs in (-1, 1):
        z = zb + zs * BENT_HALF_Z
        out = (0.0, 0.0, float(zs))
        for side in (-1, 1):
            P = lambda x, y: (side * x, y, z)
            leg_axis = v_norm((side * ((bx + dx) / 2 - (ax + cx) / 2), by - ay, 0.0))
            emit(store, [P(cx, cy), P(ax, ay), P(ax2, dy), P(dx, dy)], out, leg_axis, timber(B_STRUCT), shade)
            knee_axis = v_norm((side * (dx - fx), dy - fy, 0.0))
            emit(store, [P(dx, dy), P(ax2, dy), P(bx, by), P(fx, HEAD_TOP), P(fx, fy)], out, knee_axis,
                 timber(B_STRUCT), shade)
        emit(store, [(-fx, fy, z), (fx, fy, z), (fx, HEAD_TOP, z), (-fx, HEAD_TOP, z)], out, AX[0],
             timber(B_STRUCT), shade)
    z0, z1 = zb - BENT_HALF_Z, zb + BENT_HALF_Z
    for side in (-1, 1):
        edges = (((ax, ay), (bx, by), (1.0, 0.0)),  # outer leg face
                 ((cx, cy), (dx, dy), (-1.0, 0.0)),  # inner leg face
                 ((dx, dy), (fx, fy), (-1.0, -1.0)))  # haunch
        for (xa, ya), (xb, yb), (ox, oy) in edges:
            pts = [(side * xa, ya, z0), (side * xb, yb, z0), (side * xb, yb, z1), (side * xa, ya, z1)]
            grain = v_norm((side * (xb - xa), yb - ya, 0.0))
            emit(store, pts, (side * ox, oy, 0.0), grain, timber(B_STRUCT), shade)
    emit(store, [(-fx, fy, z0), (fx, fy, z0), (fx, fy, z1), (-fx, fy, z1)], (0.0, -1.0, 0.0), AX[0],
         timber(B_STRUCT), shade)
    # Boarded sway panel in the opening: horizontal boards, both faces.
    y0, y1 = PANEL_Y
    for zs in (-1, 1):
        z = zb + zs * PANEL_HALF_Z
        for k in range(PANEL_BOARDS):
            ya = y0 + (y1 - y0) * k / PANEL_BOARDS
            yb = y0 + (y1 - y0) * (k + 1) / PANEL_BOARDS
            emit(store, [(-PANEL_X, ya, z), (PANEL_X, ya, z), (PANEL_X, yb, z), (-PANEL_X, yb, z)],
                 (0.0, 0.0, float(zs)), AX[0], timber(B_STRUCT), lambda p: 0.86 * shade(p))


def plank_top(store, frame, half, plank, jitter):
    """A deck board's top face, mapped onto its registered place in the deck
    plan. Its sides and underside are never drawn: the joints between boards
    are 5-20 mm and look down onto the dark sub-deck."""
    zl_lo, zl_hi, zr_lo, zr_hi = plank
    pts = [(-PLANK_HALF_X, DECK_Y, zl_lo), (-PLANK_HALF_X, DECK_Y, zr_lo),
           (PLANK_HALF_X, DECK_Y, zr_hi), (PLANK_HALF_X, DECK_Y, zl_hi)]
    if v_dot(poly_normal(pts), (0.0, 1.0, 0.0)) < 0:
        pts = list(reversed(pts))
    uvs = [plan_uv(frame, half, p[0], p[2]) for p in pts]
    # Per-board vertex tone with a ramp from one end to the other (judge lever).
    m, ramp = jitter
    cols = [(min(1.0, m + ramp * p[0] / PLANK_HALF_X),) * 3 for p in pts]
    store.face(pts, (0.0, 1.0, 0.0), cols, uvs)


def build_parts():
    s = Store()
    planks = lay_planks()
    frame = plan_frame(planks)

    s.group = 'stringer'
    for side in (-1, 1):
        loft_stringer(s, side)

    s.group = 'deck'
    jrng = np.random.default_rng(3511)
    for k, plank in enumerate(planks):
        jitter = (float(jrng.uniform(0.92, 0.99)), float(jrng.uniform(-0.035, 0.035)))
        plank_top(s, frame, 0 if k <= frame['best'] else 1, plank, jitter)
    # Dark sub-deck under the boards: 10 mm into each stringer and 5 mm into the end boards.
    sub = [(-PLANK_HALF_X, SUBDECK_Y, -END_BOARD_Z[0] - 0.005), (-PLANK_HALF_X, SUBDECK_Y, END_BOARD_Z[0] + 0.005),
           (PLANK_HALF_X, SUBDECK_Y, END_BOARD_Z[0] + 0.005), (PLANK_HALF_X, SUBDECK_Y, -END_BOARD_Z[0] - 0.005)]
    emit(s, sub, (0.0, 1.0, 0.0), AX[0], timber(B_STRUCT), face_ao=AO_SUBDECK)

    s.group = 'joist'
    for x in JOIST_XS:
        aabb(s, (x - JOIST_HALF, JOIST_Y[0], -JOIST_END), (x + JOIST_HALF, JOIST_Y[1], JOIST_END),
             timber(B_STRUCT), 2, skip=((2, 1), (2, 0), (1, 1)), shade=under_deck)
    for side in (-1, 1):
        z0, z1 = sorted((side * END_BOARD_Z[0], side * END_BOARD_Z[1]))
        aabb(s, (-PLANK_HALF_X, END_BOARD_Y[0], z0), (PLANK_HALF_X, END_BOARD_Y[1], z1),
             timber(B_RAIL), 0, skip=((0, 1), (0, 0)))

    s.group = 'bent'
    for zb in BENT_ZS:
        sill = box_corners((-SILL_HALF_X, 0.0, zb - SILL_HALF_Z), (SILL_HALF_X, SILL_TOP, zb + SILL_HALF_Z))
        for ii in (0, 1):
            x = sill[(ii, 1, 0)][0]
            sill[(ii, 1, 0)] = (x, SILL_TOP, zb - SILL_HALF_Z + SILL_CHAMFER)
            sill[(ii, 1, 1)] = (x, SILL_TOP, zb + SILL_HALF_Z - SILL_CHAMFER)
        hexa(s, sill, AX, AX[0], timber(B_STRUCT), skip=((1, 0),), shade=lambda p: 0.84)
        portal_bent(s, zb)
        for side in (-1, 1):
            x0, x1 = sorted((side * CORBEL_X[0], side * CORBEL_X[1]))
            cor = box_corners((x0, CORBEL_Y[0], zb - CORBEL_HALF_Z), (x1, CORBEL_Y[1], zb + CORBEL_HALF_Z))
            for ii in (0, 1):
                cor[(ii, 0, 0)] = (cor[(ii, 0, 0)][0], CORBEL_Y[0], zb - CORBEL_FOOT_HALF_Z)
                cor[(ii, 0, 1)] = (cor[(ii, 0, 1)][0], CORBEL_Y[0], zb + CORBEL_FOOT_HALF_Z)
            hexa(s, cor, AX, AX[2], timber(B_STRUCT), skip=((1, 1),), shade=under_deck)

    s.group = 'rail'
    post_spans = [(z - POST_HALF, z + POST_HALF) for z in POST_STATIONS[:-1]]
    for side in (-1, 1):
        for z0, z1 in post_spans:
            aabb(s, (side * POST_X - POST_HALF, POST_Y[0], z0), (side * POST_X + POST_HALF, POST_Y[1], z1),
                 timber(B_RAIL), 1, skip=((1, 1), (1, 0)))
        for z0, z1 in NEWELS:
            aabb(s, (side * POST_X - NEWEL_HALF, POST_Y[0], z0), (side * POST_X + NEWEL_HALF, HEIGHT, z1),
                 timber(B_RAIL), 1, skip=((1, 0),))
        # The handrail is tenoned into the newels: its ends abut their inner faces.
        aabb(s, (side * POST_X - RAIL_HALF_X, RAIL_Y[0], NEWELS[0][1]), (side * POST_X + RAIL_HALF_X, RAIL_Y[1], NEWELS[1][0]),
             timber(B_RAIL), 2, skip=((2, 0), (2, 1)))
    return s, planks, frame, post_spans + list(NEWELS)


def check_layout(store, planks, post_spans):
    # Deck probes the runtime test fires at x = 0.
    mids = [((p[0] + p[1]) / 2, (p[2] + p[3]) / 2) for p in planks]
    for z in (-6.92, -0.02, 6.92):
        if not any(z0 + 0.01 < z < z1 - 0.01 for z0, z1 in mids):
            raise SystemExit(f'deck probe z={z} misses every plank')
    # Every painted station has a brown post or newel under the handrail top.
    for z in POST_STATIONS:
        if not any(z0 < z < z1 for z0, z1 in post_spans):
            raise SystemExit(f'post station z={z} has no post')
    # Supports stay clear of the canal walls: every vertex of every bent member.
    reach = max(abs(store.verts[i][2]) for f, g in zip(store.faces, store.groups) if g == 'bent' for i in f)
    if reach > SUPPORT_Z_LIMIT:
        raise SystemExit(f'a trestle reaches the canal wall (|z| {reach:.3f})')
    xs = [v[0] for v in store.verts]
    ys = [v[1] for v in store.verts]
    zs = [v[2] for v in store.verts]
    bounds = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
    want = (-HALF_W, HALF_W, 0.0, HEIGHT, -HALF_L, HALF_L)
    if any(abs(a - b) > 1e-9 for a, b in zip(bounds, want)):
        raise SystemExit(f'bounds {bounds} != {want}')
    for n, c, f in zip(store.normals, store.centres, store.faces):
        corners = [store.verts[i] for i in f]
        fn = poly_normal(corners)
        if v_dot(fn, n) <= 0:
            raise SystemExit(f'face at {c} wound against its outward direction')
        for p in corners[3:]:
            if abs(v_dot(v_sub(p, corners[0]), fn)) > 1e-9:
                raise SystemExit(f'face at {c} is not planar')
    for uvs in store.uvs:
        area = 0.0
        for a in range(len(uvs)):
            u0, v0 = uvs[a]
            u1, v1 = uvs[(a + 1) % len(uvs)]
            area += u0 * v1 - u1 * v0
        if abs(area) < 1e-9:
            raise SystemExit('a face has degenerate UVs (the normal map would break on it)')
    if store.triangles * 3 > INDEX_BUDGET:
        raise SystemExit(f'{store.triangles * 3} indices exceeds the {INDEX_BUDGET}-index budget')
    by_group = {}
    for f, g in zip(store.faces, store.groups):
        by_group[g] = by_group.get(g, 0) + len(f) - 2
    print('TRIANGLES', store.triangles, by_group)


# ---------------------------------------------------------------- textures
def periodic_noise(shape, cutoff, rng):
    """Tileable band-limited noise in [-1, 1] by FFT low-pass of white noise."""
    white = rng.standard_normal(shape)
    spec = np.fft.fftn(white)
    freqs = np.meshgrid(*[np.fft.fftfreq(n) * n for n in shape], indexing='ij')
    radius = np.sqrt(sum((f / c) ** 2 for f, c in zip(freqs, cutoff)))
    spec *= np.exp(-radius ** 2)
    out = np.real(np.fft.ifftn(spec))
    return out / np.abs(out).max()


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


TIMBER = np.array((0.645, 0.525, 0.395))  # the deck timber, sRGB: the lightest family
DECK_GREYED = np.array((0.64, 0.62, 0.58))  # silvered deck boards
GREYED = np.array((0.57, 0.55, 0.51))  # silver weathering
GAP_DIRT = np.array((0.15, 0.12, 0.095))
ALGAE = np.array((0.30, 0.33, 0.21))
RUST = np.array((0.42, 0.26, 0.16))
NAIL = np.array((0.17, 0.15, 0.14))

# Deck boards weather one by one: each board draws its own grey mix, value,
# warmth and end-to-end ramp independently, so tone changes at every joint and
# never in patches spanning several boards. Two newer replacement boards.
BOARD_GREY = (0.18, 0.40)
BOARD_VALUE = (0.88, 1.08)
BOARD_RAMP = 0.06  # value change from one end of a board to the other
REPLACEMENTS = 2


def board_props(rng, count):
    newer = set(int(i) for i in rng.choice(np.arange(3, count - 3), REPLACEMENTS, replace=False))
    props = []
    for k in range(count):
        flat = bool(rng.uniform() < 0.55)
        new = k in newer
        props.append({
            'state': 'new' if new else 'weathered',
            'grey': 0.14 if new else float(rng.uniform(*BOARD_GREY)),
            'value': 0.97 if new else float(rng.uniform(*BOARD_VALUE)),
            'hue': np.array((1.02, 0.98, 0.95)) if new else np.array((1.0, 1.0, 1.0)) + float(rng.uniform(-0.025, 0.025)) * np.array((1.0, 0.0, -1.0)),
            'ramp': float(rng.uniform(-BOARD_RAMP, BOARD_RAMP)),
            'flat': flat,
            # growth lines across the board width: flat-sawn wide figure, quarter-sawn tight lines
            'lines': float(rng.uniform(5.0, 8.0) if flat else rng.uniform(10.0, 15.0)),
            'contrast': float(rng.uniform(0.13, 0.19) if flat else rng.uniform(0.08, 0.13)),
            'arch': float(rng.uniform(1.5, 3.0)) if flat else 0.0,
            'x0': float(rng.uniform(-0.6, 0.6)),
            'knots': int(rng.choice(3, p=(0.62, 0.28, 0.10))),
            'phase': float(rng.uniform(0, 1)),
        })
    return props


def plan_half(rng, planks, props, frame, half, members):
    """One 1024 x 128 strip of the deck plan: colour and height, registered to
    the plank geometry through the same mapping as plan_uv."""
    rows, cols = PLAN_ROWS, TEX_W
    h = frame['halves'][half]
    r = np.arange(rows)[:, None] + 0.5
    c = np.arange(cols)[None, :] + 0.5
    x = -PLAN_X + (r - PLAN_ROW_MARGIN) / (rows - 2 * PLAN_ROW_MARGIN) * (2 * PLAN_X)
    z = h['z0'] + (c - PLAN_COL_MARGIN) / frame['scale']
    X = np.broadcast_to(x, (rows, cols))
    Z = np.broadcast_to(z, (rows, cols))
    col = np.empty((rows, cols, 3))
    col[...] = GAP_DIRT
    gap_noise = periodic_noise((rows, cols), (3.0, 30.0), rng)
    col *= (1.0 + 0.25 * gap_noise)[..., None]
    height = np.full((rows, cols), -1.6)
    warp = periodic_noise((rows, cols), (2.0, 40.0), rng)
    fibre = periodic_noise((rows, cols), (40.0, 300.0), rng)
    tone = periodic_noise((rows, cols), (2.0, 25.0), rng)
    t_x = np.clip((X + PLANK_HALF_X) / (2 * PLANK_HALF_X), 0.0, 1.0)
    for k in members:
        zl_lo, zl_hi, zr_lo, zr_hi = planks[k]
        p = props[k]
        zl = zl_lo + (zl_hi - zl_lo) * t_x
        zr = zr_lo + (zr_hi - zr_lo) * t_x
        inside = (Z >= zl) & (Z <= zr)
        if not inside.any():
            continue
        wdt = zr - zl
        w = (Z - zl) / wdt
        edge = np.minimum(Z - zl, zr - Z)  # metres to the nearer board edge
        phase = p['lines'] * (w + 0.06 * warp) + p['phase'] + p['arch'] * ((X - p['x0']) / 1.26) ** 2
        knot_mask = np.zeros((rows, cols))
        for _ in range(p['knots']):
            kx = float(rng.uniform(-1.0, 1.0))
            kw = float(rng.uniform(0.25, 0.75))
            kz = zl_lo + (zl_hi - zl_lo) * (kx + 1.26) / 2.52
            kz = kz + kw * ((zr_lo + (zr_hi - zr_lo) * (kx + 1.26) / 2.52) - kz)
            d = np.sqrt(((X - kx) / 2.0) ** 2 + (Z - kz) ** 2)
            phase = phase + 2.0 * np.exp(-(d / 0.03) ** 2)
            knot_mask = np.maximum(knot_mask, smoothstep(0.014, 0.007, d))
        f = phase % 1.0
        late = smoothstep(0.58, 0.80, f) * (1.0 - smoothstep(0.90, 0.99, f))
        value = p['value'] * (1.0 + p['ramp'] * X / PLANK_HALF_X) \
            * (1.0 - p['contrast'] * late + 0.03 * tone + 0.03 * fibre)
        grey = np.full(X.shape + (1,), p['grey'])
        base = TIMBER * p['hue']
        board = base[None, None, :] * value[..., None]
        board = board * (1 - grey) + DECK_GREYED[None, None, :] * value[..., None] * grey
        bh = 0.5 * late + 0.2 * fibre
        # Arrises: rounded and dirty, about one texel each side.
        arris = np.exp(-edge / 0.007)
        board = board * (1.0 - 0.38 * arris)[..., None]
        bh = bh - 1.3 * smoothstep(0.014, 0.0, edge)
        # Nail pairs over the joists and near the stringers, with rust halos.
        nails = np.zeros((rows, cols))
        halo = np.zeros((rows, cols))
        for nx in (-1.19,) + JOIST_XS + (1.19,):
            tz = (nx + PLANK_HALF_X) / (2 * PLANK_HALF_X)
            z_lo = zl_lo + (zl_hi - zl_lo) * tz
            z_hi = zr_lo + (zr_hi - zr_lo) * tz
            for nw in (0.27, 0.73):
                nz = z_lo + nw * (z_hi - z_lo)
                d = np.sqrt(((X - nx) * 0.7) ** 2 + (Z - nz) ** 2)
                nails = np.maximum(nails, smoothstep(0.010, 0.005, d))
                halo = np.maximum(halo, np.exp(-(d / 0.024) ** 2))
        board = board * (1.0 - 0.20 * halo)[..., None] + RUST * (0.10 * halo)[..., None]
        board = board * (1 - nails[..., None]) + NAIL * nails[..., None]
        bh = bh - 0.8 * nails
        board = board * (1.0 - 0.5 * knot_mask)[..., None]
        bh = bh + 0.4 * knot_mask
        col[inside] = board[inside]
        height[inside] = bh[inside]
    # Registered wear: a foot-worn track down the middle (lighter, greyer, less
    # grain), and grime along both stringers where water stands.
    ax = np.abs(X)
    wear = smoothstep(0.80, 0.35, ax) * (0.85 + 0.15 * tone)
    lum = col.mean(axis=-1, keepdims=True)
    col = col * (1 - 0.22 * wear[..., None]) + lum * 1.05 * (0.22 * wear[..., None])
    col = col * (1.0 + 0.07 * wear)[..., None]
    grime = smoothstep(0.90, 1.25, ax) * (0.8 + 0.2 * gap_noise)
    col = col * (1.0 - 0.28 * grime)[..., None]
    col = col * (1 - 0.18 * grime[..., None]) + ALGAE * 0.8 * (0.18 * grime[..., None])
    height = height - 0.15 * grime
    return np.clip(col, 0, 1), height


def wood_band(rng, base, *, lines=8.0, grey=0.0):
    """One 64 px band of long timber that tiles along u (rows t across the
    grain, columns u along it): sRGB colour and a height field."""
    rows, cols = BAND_PX, TEX_W
    t = (np.arange(rows)[:, None] + 0.5) / rows
    warp = periodic_noise((rows, cols), (1.2, 3.0), rng) * 0.05
    phase = lines * (t + warp)
    f = phase % 1.0
    late = smoothstep(0.58, 0.84, f) * (1.0 - smoothstep(0.92, 1.0, f))
    fibre = periodic_noise((rows, cols), (14.0, 6.0), rng)
    tone = periodic_noise((rows, cols), (1.0, 2.0), rng)
    value = 1.0 - 0.28 * late + 0.05 * tone + 0.045 * fibre
    height = 0.55 * late + 0.25 * fibre
    col = np.empty((rows, cols, 3))
    base = np.array(base)
    lw_tint = np.array((0.86, 0.80, 0.76))  # latewood a touch redder
    for ch in range(3):
        col[..., ch] = base[ch] * value * (1.0 - late * (1.0 - lw_tint[ch]) * 0.6)
    if grey:
        col = col * (1 - grey) + GREYED[None, None, :] * value[..., None] * grey
    arris = smoothstep(0.15, 0.06, t) + smoothstep(0.85, 0.94, t)
    col = col * (1.0 - 0.18 * arris)[..., None]
    height = height - 1.4 * arris
    return np.clip(col, 0, 1), height


def end_grain_band(rng, base):
    rows, cols = BAND_PX, TEX_W
    col = np.empty((rows, cols, 3))
    height = np.empty((rows, cols))
    yy = (np.arange(rows)[:, None] + 0.5) / rows
    for tile in range(END_TILES):
        x0 = tile * rows
        xx = (np.arange(rows)[None, :] + 0.5) / rows
        pith = (float(rng.uniform(-0.6, 1.6)), float(rng.uniform(-0.8, -0.2)))  # off the piece: sawn timber
        r = np.sqrt((xx - pith[0]) ** 2 + (yy - pith[1]) ** 2)
        wob = periodic_noise((rows, rows), (2.0, 2.0), rng) * 0.025
        ring = ((r + wob) * 11.0) % 1.0
        late = smoothstep(0.6, 0.9, ring) * (1.0 - smoothstep(0.94, 1.0, ring))
        ang = np.arctan2(yy - pith[1], xx - pith[0])
        check = np.exp(-((ang - float(rng.uniform(0.6, 2.5))) * r * rows / 0.8) ** 2) * (r > 0.6)
        v = 1.0 - 0.3 * late - 0.45 * check
        for ch in range(3):
            col[:, x0:x0 + rows, ch] = base[ch] * v
        height[:, x0:x0 + rows] = 0.5 * late - 1.5 * check
    return np.clip(col, 0, 1), height


def fascia_strip(rng):
    """The fascia elevation, 1024 x 64, registered to the stringers' outer
    faces through fascia_uv: columns run z along the whole bridge, rows run down
    the developed profile from the top-chamfer arris to the bottom-chamfer
    arris. Three boards butt over the inner bents; coach bolts with
    square washers fix them at every bent, each with a short rust run below."""
    rows, cols = BAND_PX, TEX_W
    r = np.arange(rows)[:, None] + 0.5
    c = np.arange(cols)[None, :] + 0.5
    S = np.broadcast_to(np.clip((r - FASCIA_ROW_MARGIN) / (rows - 2 * FASCIA_ROW_MARGIN), 0, 1) * FASCIA_DEPTH,
                        (rows, cols))
    Z = np.broadcast_to(-HALF_L + (c - FASCIA_COL_MARGIN) / (cols - 2 * FASCIA_COL_MARGIN) * (2 * HALF_L),
                        (rows, cols))
    warp = periodic_noise((rows, cols), (1.5, 12.0), rng)
    fibre = periodic_noise((rows, cols), (14.0, 120.0), rng)
    tone = periodic_noise((rows, cols), (1.0, 6.0), rng)
    joints = (-HALF_L,) + FASCIA_JOINTS + (HALF_L,)
    board = np.digitize(Z, FASCIA_JOINTS)
    values = (0.97, 1.0, 0.95)
    phases = rng.uniform(0, 1, 3)
    lines = rng.uniform(5.0, 7.0, 3)
    sweep = rng.uniform(0.3, 0.7, 3)
    v_board = np.choose(board, values)
    ph = np.choose(board, phases) + np.choose(board, lines) * (S / FASCIA_DEPTH + 0.05 * warp) \
        + np.choose(board, sweep) * np.sin(Z * 0.45 + np.choose(board, phases) * 6.0)
    f = ph % 1.0
    late = smoothstep(0.58, 0.84, f) * (1.0 - smoothstep(0.92, 1.0, f))
    value = v_board * (1.0 - 0.26 * late + 0.05 * tone + 0.04 * fibre)
    value = value * (1.0 - 0.08 * smoothstep(0.22, FASCIA_DEPTH, S))  # wetter toward the drip edge
    base = np.array((0.50, 0.37, 0.26))  # mid warm brown, between the deck and the structure
    grey = 0.10
    col = base[None, None, :] * value[..., None]
    col = col * (1 - grey) + GREYED[None, None, :] * value[..., None] * grey
    height = 0.55 * late + 0.25 * fibre
    # Board ends: darker end grain run-in either side of each butt joint, and the joint itself.
    dz = np.min(np.stack([np.abs(Z - j) for j in joints]), axis=0)
    col = col * (1.0 - 0.18 * np.exp(-dz / 0.06))[..., None]
    seam = smoothstep(0.016, 0.008, dz)
    col = col * (1 - seam[..., None]) + GAP_DIRT * seam[..., None]
    height = height - 1.5 * seam
    # Chamfer arrises.
    for s_edge in (FASCIA_S[1], FASCIA_S[2]):
        arr = np.exp(-np.abs(S - s_edge) / 0.008)
        col = col * (1.0 - 0.12 * arr)[..., None]
        height = height - 0.6 * arr
    # Coach bolts at every bent: square washer, round head, rust run below.
    IRON = np.array((0.21, 0.19, 0.18))
    HEAD = np.array((0.13, 0.12, 0.11))
    for zb in BENT_ZS:
        for zo in (-0.11, 0.11):
            for so in (0.15, 0.33):
                bz, bs = zb + zo, so
                du, ds = np.abs(Z - bz), S - bs
                washer = smoothstep(0.029, 0.024, np.maximum(du, np.abs(ds)))
                head = smoothstep(0.016, 0.011, np.sqrt(du ** 2 + ds ** 2))
                run = np.exp(-(du / 0.012) ** 2) * smoothstep(0.02, 0.04, ds) * np.exp(-np.maximum(ds, 0) / 0.10)
                col = col * (1 - 0.30 * run[..., None]) + RUST * (0.30 * run[..., None])
                col = col * (1 - washer[..., None]) + IRON * washer[..., None]
                col = col * (1 - head[..., None]) + HEAD * head[..., None]
                height = height + 0.6 * washer + 0.6 * head
    return np.clip(col, 0, 1), height


def build_textures(planks, frame):
    """The 1024 x 512 albedo (two deck-plan strips, then four timber bands) and
    its 512 x 256 normal map."""
    rng = np.random.default_rng(1104)
    albedo = np.zeros((TEX_H, TEX_W, 3))
    height = np.zeros((TEX_H, TEX_W))
    props = board_props(rng, PLANK_COUNT)
    best = frame['best']
    for half, members in ((0, range(0, best + 1)), (1, range(best + 1, PLANK_COUNT))):
        c, h = plan_half(rng, planks, props, frame, half, members)
        r0 = frame['halves'][half]['row0']
        albedo[r0:r0 + PLAN_ROWS] = c
        height[r0:r0 + PLAN_ROWS] = h
    c, h = fascia_strip(rng)
    albedo[BAND_ROW0[B_FASCIA]:BAND_ROW0[B_FASCIA] + BAND_PX] = c
    height[BAND_ROW0[B_FASCIA]:BAND_ROW0[B_FASCIA] + BAND_PX] = h
    for b, base, grey in ((B_RAIL, (0.62, 0.45, 0.30), 0.03),  # honey rails and posts
                          (B_STRUCT, (0.43, 0.345, 0.27), 0.18)):  # darker, cooler structure
        c, h = wood_band(rng, base, lines=8.0, grey=grey)
        albedo[BAND_ROW0[b]:BAND_ROW0[b] + BAND_PX] = c
        height[BAND_ROW0[b]:BAND_ROW0[b] + BAND_PX] = h
    c, h = end_grain_band(rng, (0.47, 0.36, 0.26))
    albedo[BAND_ROW0[B_END]:] = c
    height[BAND_ROW0[B_END]:] = h
    albedo_px = np.clip(np.round(albedo * 255), 0, 255).astype(np.uint8)

    hs = height.reshape(TEX_H // 2, 2, TEX_W // 2, 2).mean(axis=(1, 3))
    dh_du = (np.roll(hs, -1, axis=1) - np.roll(hs, 1, axis=1)) * 0.5
    dh_dv = (np.roll(hs, -1, axis=0) - np.roll(hs, 1, axis=0)) * 0.5
    strength = 0.9
    nx, ny, nz = -dh_du * strength, -dh_dv * strength, np.ones_like(hs)
    length = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    normal = np.stack([nx / length, ny / length, nz / length], axis=-1)
    normal_px = np.clip(np.round((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    return albedo_px, normal_px


def write_jpeg(path, rgb, name, quality):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    # Blender image rows run bottom-up, so array row r is v = r / h (the
    # normal map's dh/dv is computed in that sense).
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


# ---------------------------------------------------------------- Blender assembly
def to_blender_unit(p):
    x, y, z = p[0], p[1] - NODE_Y, p[2]
    return (x / NODE_SCALE, -z / NODE_SCALE, y / NODE_SCALE)


def build_mesh(store, mat):
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata([to_blender_unit(v) for v in store.verts], [], store.faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name='UVMap')
    col = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for poly in mesh.polygons:
        poly.use_smooth = False
        uvs = store.uvs[poly.index]
        cols = store.cols[poly.index]
        face = store.faces[poly.index]
        for li in poly.loop_indices:
            corner = face.index(mesh.loops[li].vertex_index)
            uv_layer.data[li].uv = uvs[corner]
            c = cols[corner]
            col.data[li].color = (c[0], c[1], c[2], 1.0)
    mesh.color_attributes.active_color = col
    # from_pydata keeps loop order; confirm Blender agrees with the authored winding.
    flipped = 0
    for poly, n in zip(mesh.polygons, store.normals):
        bn = (n[0], -n[2], n[1])
        if poly.normal.dot(bn) <= 0:
            flipped += 1
    if flipped:
        raise SystemExit(f'{flipped} faces wound inward')
    mesh.materials.append(mat)
    return mesh


def make_material(albedo_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False  # glTF doubleSided: true, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')

    albedo_img = bpy.data.images.load(albedo_path)
    albedo_img.name = 'wooden-footbridge-wood'
    albedo_tex = nodes.new('ShaderNodeTexImage')
    albedo_tex.image = albedo_img
    albedo_tex.extension = 'REPEAT'
    # Base colour = wood atlas x COLOR_0 (ambient occlusion), the pattern the glTF
    # exporter reads as baseColorTexture plus a material-used float COLOR_0 (as delivered).
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    mul = nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs[0].default_value = 1.0  # Factor
    # Mix repeats A/B/Result per data type; take the colour sockets by type.
    col_in = [sock for sock in mul.inputs if sock.type == 'RGBA']
    col_out = next(sock for sock in mul.outputs if sock.type == 'RGBA')
    links.new(albedo_tex.outputs['Color'], col_in[0])
    links.new(attr.outputs['Color'], col_in[1])
    links.new(col_out, bsdf.inputs['Base Color'])

    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'wooden-footbridge-normal'
    normal_img.colorspace_settings.is_data = True
    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_tex.extension = 'REPEAT'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])

    bsdf.inputs['Roughness'].default_value = ROUGHNESS
    bsdf.inputs['Metallic'].default_value = 0.0
    return mat


def main():
    path = out_path()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    store, planks, frame, post_spans = build_parts()
    check_layout(store, planks, post_spans)
    stage = tempfile.mkdtemp(prefix='wooden-footbridge-')
    try:
        albedo_px, normal_px = build_textures(planks, frame)
        albedo_path = os.path.join(stage, 'wooden-footbridge-wood.jpg')
        normal_path = os.path.join(stage, 'wooden-footbridge-normal.jpg')
        write_jpeg(albedo_path, albedo_px, 'wooden-footbridge-wood-stage', ALBEDO_QUALITY)
        write_jpeg(normal_path, normal_px, 'wooden-footbridge-normal-stage', NORMAL_QUALITY)
        if os.environ.get('FOOTBRIDGE_DUMP_TEX'):
            dump = os.environ['FOOTBRIDGE_DUMP_TEX']
            os.makedirs(dump, exist_ok=True)
            shutil.copy(albedo_path, dump)
            shutil.copy(normal_path, dump)
        mat = make_material(albedo_path, normal_path)
        mesh = build_mesh(store, mat)
        obj = bpy.data.objects.new(NODE_NAME, mesh)
        scene.collection.objects.link(obj)
        obj.location = (0.0, 0.0, NODE_Y)
        obj.scale = (NODE_SCALE, NODE_SCALE, NODE_SCALE)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            export_image_format='AUTO',
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/wooden-footbridge.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'WOODEN_FOOTBRIDGE_BUILT {path} triangles={store.triangles} indices={store.triangles * 3} '
          f'bytes={os.path.getsize(path)} split={frame["split"]:.4f} scale={frame["scale"]:.2f}')


main()
