"""Cupid garden statue (world-cupid-authored-body), built from scratch in headless Blender.

What it builds
--------------
The pond centrepiece (src/components/FactoryExterior.tsx `CupidStatue`, one
instance, base 2 cm under the water): a three-tier grey stone pedestal carrying
a pale stone cherub with small feathered wings, curly hair and a tan bow held
out to his right (-X, viewer's left from the front). 1.400 m x 2.279 m x
1.400 m, origin at ground centre, +Z front, metric, no parent scale.

Construction (round 6: a new method for the body, the wings, the bow and the paint)
-----------------------------------------------------------------------------------
* The sculpt (a numpy signed-distance field of anatomical masses joined by
  smooth-min fillets and cut with creases) now has putto proportions: about 3.7
  heads, no visible neck, a pot belly forward of the chest, fat thighs and upper
  arms, and fat creases at the wrists, ankles, knee backs and above the ankles.
  The creases are placed on the surface the masses make (rays from inside), not
  at guessed coordinates. openvdb meshes it at 2.5 mm: that is the bake source.
* The exported body and head are no longer authored ring by ring. Each is a
  quadric edge collapse (Blender Decimate, collapse) of the sculpt's uncarved
  isosurface at 3.5 mm, to a fixed triangle budget: the simplifier puts its
  triangles where the form turns. The head's low hair is one smooth envelope
  over the curls, which live in the bake. Smart UV Project re-lays the UVs.
* Each wing is three stacked closed slabs (flight feathers, greater coverts,
  lesser coverts), each a constrained-Delaunay top and bottom with real
  thickness and step walls, cambered, with blunt two-point feather tips. The
  slabs are their own bake source.
* The bow is a six-sided loft in the frontal plane, held at the side; its two
  middle stations are the fist itself, traced off the sculpted hand, so the
  grip is modelled as one piece. The string is a 20 x 16 mm dark cord.
* The paint is clean marble: veins, mottling, the sculpt's own crevices and one
  short-reach occlusion pass, both capped. No long-reach occlusion, algae,
  lichen or streaks are baked into the figure's albedo.
* The pedestal is round 3's lathe, with the cap rings raised to 32 sides and one
  base-drum ring dropped to pay for it.

Nodes: `Cupid-authored-bodyBody` (the figure, required by the manifest; extras
authoredCastShadow true / authoredReceiveShadow false, as delivered) and
`Cupid-authored-bodyPedestal` (cast and receive true).

Budgets (public/models/asset-manifest.json): 4668 render vertices = indices,
so 1556 triangles in all; 1 material, 2 textures, 383000 bytes. The script
asserts every one of them, the envelope, grounding and centring before export.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/cupid-authored-body.py -- <out.glb>

Re-runnable and deterministic (seeded). Writes only <out.glb>.
"""

import json
import math
import os
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ---------------------------------------------------------------- contract
INDEX_BUDGET = 4668
FILE_BUDGET = 383000
TOP_Y = 2.2792
FOOTPRINT_R = 0.700
CAP_Y = 1.300
SOLE_Y = 1.298  # 2 mm into the cap

NODE_BODY = 'Cupid-authored-bodyBody'
NODE_PEDESTAL = 'Cupid-authored-bodyPedestal'
MESH_BODY = 'cupid-authored-body-mesh'
MESH_PEDESTAL = 'cupid-authored-body-pedestal-mesh'
MATERIAL_NAME = 'cupid-authored-body-surface'
SCENE_NAME = 'MillOS_World_Cupid-authored-body'

TEX_COLOUR = int(os.environ.get('CUPID_TEX_COLOUR', 1024))
TEX_NORMAL = int(os.environ.get('CUPID_TEX_NORMAL', 1024))
JPEG_QUALITY = int(os.environ.get('CUPID_JPEG', 86))
EXPORT_TANGENTS = os.environ.get('CUPID_TANGENTS', '1') == '1'
ROUGHNESS = 0.86
FIGURE_DENSITY = 2.4  # texel density of the figure relative to the pedestal
TOP_DENSITY = 0.55  # the cap's standing surface, seen only from above
PACK_MARGIN_PX = 6
BAKE_MARGIN_PX = 3
CAGE = 0.012
RAY = 0.036
SEED = 20261106

# Linear palette.
STONE = (0.50, 0.468, 0.405)
ALGAE = (0.27, 0.31, 0.22)
GRIME = (0.20, 0.19, 0.16)
BOW_TAN = (0.42, 0.28, 0.12)
BOW_WRAP = (0.15, 0.095, 0.05)
BOW_STRING = (0.62, 0.57, 0.48)
PED_BASE = (0.27, 0.285, 0.30)
PED_COLUMN = (0.345, 0.36, 0.375)
PED_CAP = (0.405, 0.42, 0.435)

PART_BODY, PART_HEAD, PART_HAIR, PART_WING, PART_BOW, PART_STRING, PART_PED = range(7)


def out_path():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: Blender -b --factory-startup -P cupid-authored-body.py -- <out.glb>')
    return os.path.abspath(argv[0])


# ---------------------------------------------------------------- vector helpers (glTF frame: y up, +Z front)

def v3(*a):
    return np.array(a, dtype=float)


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / (np.linalg.norm(v) + 1e-12)


def to_blender(p):
    return (float(p[0]), float(-p[2]), float(p[1]))


def from_blender(p):
    return v3(p[0], p[2], -p[1])


def rot_y(p, pivot, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    q = np.asarray(p, dtype=float) - pivot
    return pivot + v3(c * q[0] + s * q[2], q[1], -s * q[0] + c * q[2])


def perp_basis(t):
    t = unit(t)
    helper = v3(0, 1, 0) if abs(t[1]) < 0.9 else v3(1, 0, 0)
    a = unit(np.cross(t, helper))
    b = np.cross(t, a)
    return a, b


class Part:
    """Plain vertex/face lists in the glTF frame with a part id per vertex."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.ids = []

    def add(self, verts, faces, pid):
        base = len(self.verts)
        self.verts.extend([np.asarray(v, dtype=float) for v in verts])
        self.faces.extend([[base + i for i in f] for f in faces])
        self.ids.extend([pid] * len(verts))

    def extend(self, other):
        base = len(self.verts)
        self.verts.extend(other.verts)
        self.faces.extend([[base + i for i in f] for f in other.faces])
        self.ids.extend(other.ids)


# ---------------------------------------------------------------- splines

def centripetal(p0, p1, p2, p3, t):
    def nxt(ti, a, b):
        return ti + max(float(np.linalg.norm(b - a)), 1e-9) ** 0.5
    t0 = 0.0
    t1 = nxt(t0, p0, p1)
    t2 = nxt(t1, p1, p2)
    t3 = nxt(t2, p2, p3)
    tt = t1 + (t2 - t1) * t
    a1 = (t1 - tt) / (t1 - t0) * p0 + (tt - t0) / (t1 - t0) * p1
    a2 = (t2 - tt) / (t2 - t1) * p1 + (tt - t1) / (t2 - t1) * p2
    a3 = (t3 - tt) / (t3 - t2) * p2 + (tt - t2) / (t3 - t2) * p3
    b1 = (t2 - tt) / (t2 - t0) * a1 + (tt - t0) / (t2 - t0) * a2
    b2 = (t3 - tt) / (t3 - t1) * a2 + (tt - t1) / (t3 - t1) * a3
    return (t2 - tt) / (t2 - t1) * b1 + (tt - t1) / (t2 - t1) * b2


def cr_resample(points, m, periodic):
    """Centripetal Catmull-Rom through every control point, m segments per span."""
    P = np.asarray(points, dtype=float)
    n = len(P)
    if m <= 1 or n < 2:
        return P.copy()
    out = []
    spans = n if periodic else n - 1
    for i in range(spans):
        p1, p2 = P[i], P[(i + 1) % n]
        if periodic:
            p0, p3 = P[(i - 1) % n], P[(i + 2) % n]
        else:
            p0 = P[i - 1] if i > 0 else 2 * P[0] - P[1]
            p3 = P[i + 2] if i + 2 < n else 2 * P[-1] - P[-2]
        for k in range(m):
            out.append(centripetal(p0, p1, p2, p3, k / m) if k else p1.copy())
    if not periodic:
        out.append(P[-1].copy())
    return np.array(out)


# ---------------------------------------------------------------- authored surfaces

class Surf:
    """A loft on a designed grid: rows run along the path, columns round the
    section (periodic) or across a blade. Optional poles close either end.
    The low mesh is exported; `high()` resamples the same grid by Catmull-Rom
    (or uses an authored override) for the bake source."""

    def __init__(self, rows, periodic, part, pole_start=None, pole_end=None, outward=None,
                 hi=(4, 4), high_override=None, density=FIGURE_DENSITY, name=''):
        self.rows = [np.array(r, dtype=float) for r in rows]
        self.periodic = periodic
        self.part = part
        self.pole_start = None if pole_start is None else np.asarray(pole_start, dtype=float)
        self.pole_end = None if pole_end is None else np.asarray(pole_end, dtype=float)
        self.hi = hi
        self.high_override = high_override
        self.density = density
        self.name = name
        R = len(self.rows)
        rm = min(R // 2, R - 2)
        A, B, D = self.rows[rm][0], self.rows[rm][1], self.rows[rm + 1][0]
        n = np.cross(B - A, D - A)
        ref = (A - self.rows[rm].mean(axis=0)) if periodic else np.asarray(outward, dtype=float)
        self.flip = float(np.dot(n, ref)) < 0

    def low(self):
        rows, R, C = self.rows, len(self.rows), len(self.rows[0])
        verts = [p for row in rows for p in row]
        us = []
        for row in rows:
            pts = list(row) + ([row[0]] if self.periodic else [])
            seg = [np.linalg.norm(pts[i + 1] - pts[i]) for i in range(len(pts) - 1)]
            us.append(np.concatenate([[0.0], np.cumsum(seg)]))
        W = max(u[-1] for u in us)
        us = [u / max(u[-1], 1e-9) * W for u in us]
        cents = [row.mean(axis=0) for row in rows]
        vs = np.concatenate([[0.0], np.cumsum([np.linalg.norm(cents[i + 1] - cents[i]) for i in range(R - 1)])])
        faces, uvs = [], []

        def vid(r, c):
            return r * C + (c % C)

        def emit(tri, tuv):
            if self.flip:
                tri, tuv = tri[::-1], tuv[::-1]
            faces.append(list(tri))
            uvs.append([tuple(t) for t in tuv])

        ncol = C if self.periodic else C - 1
        for r in range(R - 1):
            for c in range(ncol):
                A, B, Cc, D = vid(r, c), vid(r, c + 1), vid(r + 1, c + 1), vid(r + 1, c)
                ua, ub = (us[r][c], vs[r]), (us[r][c + 1], vs[r])
                uc, ud = (us[r + 1][c + 1], vs[r + 1]), (us[r + 1][c], vs[r + 1])
                if np.linalg.norm(verts[A] - verts[Cc]) <= np.linalg.norm(verts[B] - verts[D]):
                    emit([A, B, Cc], [ua, ub, uc])
                    emit([A, Cc, D], [ua, uc, ud])
                else:
                    emit([A, B, D], [ua, ub, ud])
                    emit([B, Cc, D], [ub, uc, ud])
        if self.pole_start is not None:
            P = len(verts)
            verts.append(self.pole_start)
            vp = vs[0] - np.linalg.norm(self.pole_start - cents[0])
            for c in range(ncol):
                emit([P, vid(0, c + 1), vid(0, c)],
                     [((us[0][c] + us[0][c + 1]) / 2, vp), (us[0][c + 1], vs[0]), (us[0][c], vs[0])])
        if self.pole_end is not None:
            P = len(verts)
            verts.append(self.pole_end)
            vp = vs[-1] + np.linalg.norm(self.pole_end - cents[-1])
            for c in range(ncol):
                emit([vid(R - 1, c), vid(R - 1, c + 1), P],
                     [(us[-1][c], vs[-1]), (us[-1][c + 1], vs[-1]), ((us[-1][c] + us[-1][c + 1]) / 2, vp)])
        return verts, faces, uvs

    def high(self):
        if self.high_override is not None:
            return self.high_override
        mc, mr = self.hi
        rows = [cr_resample(r, mc, self.periodic) for r in self.rows]
        arr = np.array(rows)
        cols = [cr_resample(arr[:, j], mr, False) for j in range(arr.shape[1])]
        dense = np.stack(cols, axis=1)
        R, C = dense.shape[0], dense.shape[1]
        verts = [p for row in dense for p in row]
        faces = []

        def vid(r, c):
            return r * C + (c % C)

        def emit(f):
            faces.append(f[::-1] if self.flip else f)

        ncol = C if self.periodic else C - 1
        for r in range(R - 1):
            for c in range(ncol):
                emit([vid(r, c), vid(r, c + 1), vid(r + 1, c + 1), vid(r + 1, c)])
        if self.pole_start is not None:
            P = len(verts)
            verts.append(self.pole_start)
            for c in range(ncol):
                emit([P, vid(0, c + 1), vid(0, c)])
        if self.pole_end is not None:
            P = len(verts)
            verts.append(self.pole_end)
            for c in range(ncol):
                emit([vid(R - 1, c), vid(R - 1, c + 1), P])
        p = Part()
        p.add(verts, faces, self.part)
        return p


def limb(stations, sides, lat_hint, part, pole_start=None, pole_end=None, phase=0.0, hi=(4, 4), name=''):
    """Loft along a joint path. Each station: (centre, radius across, radius
    deep[, centre offset]); `lat_hint` fixes the 'across' axis."""
    pts = [np.asarray(st[0], dtype=float) for st in stations]
    lat_hint = np.asarray(lat_hint, dtype=float)
    rows, n = [], len(pts)
    for i, st in enumerate(stations):
        c, rw, rd = pts[i], st[1], st[2]
        off = np.asarray(st[3], dtype=float) if len(st) > 3 else np.zeros(3)
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = unit(pts[i + 1] - pts[i]) + unit(pts[i] - pts[i - 1])
        t = unit(t)
        lat = unit(lat_hint - np.dot(lat_hint, t) * t)
        fwd = np.cross(t, lat)
        ring = []
        for j in range(sides):
            ph = phase + 2 * math.pi * j / sides
            ring.append(c + off + rw * math.cos(ph) * lat + rd * math.sin(ph) * fwd)
        rows.append(ring)
    return Surf(rows, True, part, pole_start, pole_end, hi=hi, name=name)


# ---------------------------------------------------------------- high-poly detail primitives (bake source only)

def ellipsoid(c, r, seg=16, rings=10, pid=PART_BODY):
    p = Part()
    verts = [v3(0, -1, 0)]
    for i in range(1, rings):
        phi = -math.pi / 2 + math.pi * i / rings
        for j in range(seg):
            th = 2 * math.pi * j / seg
            verts.append(v3(math.cos(phi) * math.sin(th), math.sin(phi), math.cos(phi) * math.cos(th)))
    verts.append(v3(0, 1, 0))
    out = [np.asarray(c, dtype=float) + q * np.asarray(r, dtype=float) for q in verts]
    faces = []
    top = len(verts) - 1
    for j in range(seg):
        faces.append([0, 1 + (j + 1) % seg, 1 + j])
    for i in range(rings - 2):
        a0, b0 = 1 + i * seg, 1 + (i + 1) * seg
        for j in range(seg):
            j1 = (j + 1) % seg
            faces.append([a0 + j, a0 + j1, b0 + j1, b0 + j])
    last = 1 + (rings - 2) * seg
    for j in range(seg):
        faces.append([last + j, last + (j + 1) % seg, top])
    p.add(out, faces, pid)
    return p


def sweep(points, radii, sides=8, pid=PART_BODY):
    """Closed tube along a polyline with end caps (outward winding)."""
    pts = [np.asarray(q, dtype=float) for q in points]
    n = len(pts)
    verts, faces = [], []
    prev_a = None
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = unit(pts[i + 1] - pts[i]) + unit(pts[i] - pts[i - 1])
        t = unit(t)
        if prev_a is None:
            a, _ = perp_basis(t)
        else:  # parallel transport, so spirals do not twist
            a = unit(prev_a - np.dot(prev_a, t) * t)
        prev_a = a
        b = np.cross(t, a)
        for j in range(sides):
            th = 2 * math.pi * j / sides
            verts.append(pts[i] + radii[i] * (math.cos(th) * a + math.sin(th) * b))
    for i in range(n - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            a0, b0 = i * sides, (i + 1) * sides
            faces.append([a0 + j, a0 + j1, b0 + j1, b0 + j])
    c0 = len(verts)
    verts.append(pts[0])
    c1 = len(verts)
    verts.append(pts[-1])
    last = (n - 1) * sides
    for j in range(sides):
        j1 = (j + 1) % sides
        faces.append([c0, j1, j])
        faces.append([c1, last + j, last + j1])
    p = Part()
    p.add(verts, faces, pid)
    # Orientation check on the first band: outward from the axis.
    A, B, D = p.verts[0], p.verts[1], p.verts[sides]
    nrm = np.cross(B - A, D - A)
    if np.dot(nrm, A - pts[0]) < 0:
        p.faces = [f[::-1] for f in p.faces]
    return p


# ---------------------------------------------------------------- pedestal

PED_PROFILE = [  # (y, r, sides) from the ground up; the top is closed by a fan
    (0.000, 0.700, 24),  # foot, exactly on the 1.400 m footprint
    (0.230, 0.634, 24),  # sloped base drum
    (0.300, 0.566, 24),  # rounded roll (smooth-shaded) to its top
    (0.300, 0.420, 16),  # flat annulus, stitched 24 -> 16
    (1.050, 0.356, 16),  # tapered column
    (1.096, 0.394, 16),  # necking flare
    (1.190, 0.466, 32),  # ogee cove, stitched 16 -> 32
    (1.236, 0.500, 32),  # ogee bead
    (1.300, 0.500, 32),  # cap lip to the standing surface: 32 sides, round against the sky
]
TIER_RADIUS = {0: 0.62, 1: 0.38, 2: 0.47}
# High profile: the same key points with filleted corners (radius per corner).
PED_FILLET = [0.0, 0.045, 0.014, 0.010, 0.02, 0.02, 0.03, 0.012, 0.008]


def ring(y, r, sides):
    out = []
    for j in range(sides):
        th = 2 * math.pi * j / sides
        s, c = math.sin(th), math.cos(th)
        if j % (sides // 4) == 0:
            s, c = round(s), round(c)
        out.append(v3(r * s, y, r * c))
    return out


def stitch(lo, n_lo, hi, n_hi):
    faces, i, k = [], 0, 0
    while i < n_lo or k < n_hi:
        a_lo = (i + 1) / n_lo if i < n_lo else 9.0
        a_hi = (k + 1) / n_hi if k < n_hi else 9.0
        if a_lo <= a_hi:
            faces.append([lo + i % n_lo, lo + (i + 1) % n_lo, hi + k % n_hi])
            i += 1
        else:
            faces.append([lo + i % n_lo, hi + (k + 1) % n_hi, hi + k % n_hi])
            k += 1
    return faces


def build_pedestal_low():
    """Triangles plus per-corner UVs in metres and an island key per face."""
    verts, vring, vth, faces, starts = [], [], [], [], []
    for ri, (y, r, n) in enumerate(PED_PROFILE):
        starts.append(len(verts))
        verts += ring(y, r, n)
        vring += [ri] * n
        vth += [2 * math.pi * j / n for j in range(n)]
    face_ring = []
    for i in range(len(PED_PROFILE) - 1):
        n0, n1 = PED_PROFILE[i][2], PED_PROFILE[i + 1][2]
        a0, b0 = starts[i], starts[i + 1]
        if n0 == n1:
            for j in range(n0):
                j1 = (j + 1) % n0
                faces += [[a0 + j, a0 + j1, b0 + j1], [a0 + j, b0 + j1, b0 + j]]
                face_ring += [i, i]
        else:
            st = stitch(a0, n0, b0, n1)
            faces += st
            face_ring += [i] * len(st)
    centre = len(verts)
    verts.append(v3(0, CAP_Y, 0))
    vring.append(-1)
    vth.append(0.0)
    last, n = starts[-1], PED_PROFILE[-1][2]
    for j in range(n):
        faces.append([last + j, last + (j + 1) % n, centre])
        face_ring.append(-1)
    # Profile arc length per ring (the v coordinate).
    s = [0.0]
    for i in range(1, len(PED_PROFILE)):
        s.append(s[-1] + math.hypot(PED_PROFILE[i][0] - PED_PROFILE[i - 1][0], PED_PROFILE[i][1] - PED_PROFILE[i - 1][1]))
    band_tier = {0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2}
    uvs, keys = [], []
    for f, br in zip(faces, face_ring):
        if br < 0:
            uvs.append([(verts[i][0] * TOP_DENSITY, verts[i][2] * TOP_DENSITY) for i in f])
            keys.append(('ped-top',))
            continue
        tier = band_tier[br]
        thc = math.atan2(sum(verts[i][0] for i in f) / 3, sum(verts[i][2] for i in f) / 3) % (2 * math.pi)
        q = int(thc // (math.pi / 2)) % 4
        corner = []
        for i in f:
            th = vth[i]
            d = (th - thc + math.pi) % (2 * math.pi) - math.pi
            corner.append(((thc + d - q * math.pi / 2) * TIER_RADIUS[tier], s[vring[i]]))
        uvs.append(corner)
        keys.append(('ped', tier, q))
    return verts, faces, uvs, keys


def fillet_profile(points, radii, samples=6):
    """Corner-cut a (y, r) polyline with quadratic Beziers."""
    out = [np.asarray(points[0], dtype=float)]
    P = [np.asarray(p, dtype=float) for p in points]
    for i in range(1, len(P) - 1):
        rr = radii[i]
        if rr <= 0:
            out.append(P[i])
            continue
        u1, u2 = unit(P[i] - P[i - 1]), unit(P[i + 1] - P[i])
        d = min(rr, 0.45 * np.linalg.norm(P[i] - P[i - 1]), 0.45 * np.linalg.norm(P[i + 1] - P[i]))
        a, b = P[i] - u1 * d, P[i] + u2 * d
        for k in range(samples + 1):
            t = k / samples
            out.append((1 - t) ** 2 * a + 2 * (1 - t) * t * P[i] + t * t * b)
    out.append(P[-1])
    # Densify long straight runs so occlusion has vertices to land on.
    dense = [out[0]]
    for a, b in zip(out[:-1], out[1:]):
        k = max(1, int(np.linalg.norm(b - a) / 0.02))
        for j in range(1, k + 1):
            dense.append(a + (b - a) * j / k)
    return dense


def build_pedestal_high(sides=128):
    prof = fillet_profile([(y, r) for (y, r, _) in PED_PROFILE], PED_FILLET)
    # Top: from the lip's rounded edge in to the centre.
    top = [np.array([CAP_Y, r]) for r in np.linspace(0.49, 0.02, 12)]
    prof = prof + top[1:]
    verts, faces = [], []
    for (y, r) in prof:
        for j in range(sides):
            th = 2 * math.pi * j / sides
            verts.append(v3(r * math.sin(th), y, r * math.cos(th)))
    for i in range(len(prof) - 1):
        a0, b0 = i * sides, (i + 1) * sides
        for j in range(sides):
            j1 = (j + 1) % sides
            faces.append([a0 + j, a0 + j1, b0 + j1, b0 + j])
    centre = len(verts)
    verts.append(v3(0, CAP_Y, 0))
    last = (len(prof) - 1) * sides
    for j in range(sides):
        faces.append([last + j, last + (j + 1) % sides, centre])
    p = Part()
    p.add(verts, faces, PART_PED)
    return p



# ---------------------------------------------------------------- figure: the sculpt (a signed-distance field)
#
# Round 5 method. The figure is no longer built from its export mesh. It is
# carved first as a signed-distance sculpt: anatomical masses joined by small
# smooth-min fillets (5-35 mm), then cut with subtractive creases where a body
# actually folds (groin, under the belly, gluteal fold and cleft, spine, back of
# the knee, ankle, wrist, elbow, jaw, eye sockets, drilled pupils, nostrils,
# mouth, finger and toe gaps, the grooves between hair locks and between wing
# feathers). openvdb meshes that field at 2.5 mm: that mesh is the bake source.
# The exported low mesh is retopology onto the sculpt: an authored cage per
# part (a skin-modifier quad cage with real hip and shoulder hubs for the body,
# a lat-long cage for the head, a constrained-Delaunay shell for each wing)
# whose every vertex is Newton-projected onto that part's own field.

GRID_H = float(os.environ.get('CUPID_GRID_H', 0.0025))
GRID_LO = np.array([-0.44, SOLE_Y - 0.004, -0.34])
GRID_HI = np.array([0.33, 2.34, 0.27])
FAR = 0.25



def G(x, h, z):
    """Design coordinates: h is the height above the soles."""
    return v3(x, SOLE_Y + h, z)


def rot_axis(axis, deg):
    a = unit(axis)
    t = math.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * (K @ K)


def frame_from(t_main, hint):
    """Orthonormal columns (lat, up-ish, main) for an ellipsoid whose third axis is t_main."""
    c = unit(t_main)
    a = unit(np.asarray(hint, dtype=float) - np.dot(hint, c) * c)
    b = np.cross(c, a)
    return np.stack([a, b, c], axis=1)


class RoundCone:
    def __init__(self, a, b, r1, r2):
        self.a, self.b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
        if np.linalg.norm(self.b - self.a) < 1e-6:
            self.b = self.a + v3(0, 1e-5, 0)
        self.r1, self.r2 = float(r1), float(r2)
        r = max(self.r1, self.r2)
        self.lo = np.minimum(self.a, self.b) - r
        self.hi = np.maximum(self.a, self.b) + r

    def sdf(self, P):
        ba = self.b - self.a
        l2 = float(ba @ ba)
        rr = self.r1 - self.r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2
        pa = P - self.a
        y = pa @ ba
        z = y - l2
        x2 = np.sum((pa * l2 - y[:, None] * ba) ** 2, axis=1)
        y2 = y * y * l2
        z2 = z * z * l2
        k = math.copysign(1.0, rr) * rr * rr * x2 if rr != 0 else np.zeros_like(x2)
        d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - self.r1
        d1 = np.sqrt(x2 + y2) * il2 - self.r1
        d2 = np.sqrt(x2 + z2) * il2 - self.r2
        return np.where(np.sign(z) * a2 * z2 > k, d2, np.where(np.sign(y) * a2 * y2 < k, d1, d3))


class Chain:
    """Tapered tube through points (hard union of round cones)."""

    def __init__(self, pts, radii):
        self.cones = [RoundCone(pts[i], pts[i + 1], radii[i], radii[i + 1]) for i in range(len(pts) - 1)]
        self.lo = np.min([c.lo for c in self.cones], axis=0)
        self.hi = np.max([c.hi for c in self.cones], axis=0)

    def sdf(self, P):
        d = np.full(len(P), FAR)
        for c in self.cones:
            m = np.all((P >= c.lo - 0.02) & (P <= c.hi + 0.02), axis=1)
            if m.any():
                d[m] = np.minimum(d[m], c.sdf(P[m]))
        return d


class Ellipsoid:
    """IQ's bound. R's columns are the local axes in the parent frame."""

    def __init__(self, c, r, R=None):
        self.c = np.asarray(c, dtype=float)
        self.r = np.asarray(r, dtype=float)
        self.R = np.eye(3) if R is None else np.asarray(R, dtype=float)
        ext = np.abs(self.R) @ self.r
        self.lo, self.hi = self.c - ext, self.c + ext

    def sdf(self, P):
        q = (P - self.c) @ self.R
        k0 = np.linalg.norm(q / self.r, axis=1)
        k1 = np.linalg.norm(q / (self.r * self.r), axis=1)
        return np.where(k1 > 1e-9, k0 * (k0 - 1.0) / np.maximum(k1, 1e-9), -float(self.r.min()))


class Torus:
    def __init__(self, c, axis, R, r):
        self.c, self.n = np.asarray(c, dtype=float), unit(axis)
        self.R, self.r = float(R), float(r)
        self.lo, self.hi = self.c - (R + r), self.c + (R + r)

    def sdf(self, P):
        q = P - self.c
        y = q @ self.n
        xz = np.linalg.norm(q - y[:, None] * self.n, axis=1)
        return np.sqrt((xz - self.R) ** 2 + y * y) - self.r


class Plane:
    """Half-space, inside where (p - o).n < 0, clipped to a box for culling."""

    def __init__(self, o, n, lo, hi):
        self.o, self.n = np.asarray(o, dtype=float), unit(n)
        self.lo, self.hi = np.asarray(lo, dtype=float), np.asarray(hi, dtype=float)

    def sdf(self, P):
        return (P - self.o) @ self.n


class Inter:
    def __init__(self, a, b, k):
        self.a, self.b, self.k = a, b, k
        self.lo, self.hi = a.lo, a.hi

    def sdf(self, P):
        return smax(self.a.sdf(P), self.b.sdf(P), self.k)


class Xf:
    """A child primitive authored in a local frame: world = O + R @ local."""

    def __init__(self, child, O, R, scale=1.0):
        self.child, self.O, self.R = child, np.asarray(O, dtype=float), np.asarray(R, dtype=float)
        self.s = float(scale)
        lo, hi = child.lo, child.hi
        corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        w = (corners * self.s) @ self.R.T + self.O
        self.lo, self.hi = w.min(axis=0), w.max(axis=0)

    def sdf(self, P):
        return self.s * self.child.sdf(((P - self.O) @ self.R) / self.s)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


class Sculpt:
    def __init__(self):
        self.ops = []
        self.use_cuts = True  # the low pieces are taken from the uncarved forms
        self.low_only = set()  # groups that exist only for the low pieces (never in the bake source)

    def add(self, prim, k, group):
        self.ops.append(('u', prim, k, group))

    def cut(self, prim, k, group):
        self.ops.append(('s', prim, k, group))

    def points(self, P, groups=None, labels=False):
        P = np.asarray(P, dtype=float)
        D = np.full(len(P), FAR)
        L = np.full(len(P), -1, dtype=int)
        for kind, prim, k, grp in self.ops:
            if groups is not None and grp not in groups:
                continue
            if groups is None and grp in self.low_only:
                continue
            if kind == 's' and not self.use_cuts:
                continue
            m = k + 0.012
            sel = np.nonzero(np.all((P >= prim.lo - m) & (P <= prim.hi + m), axis=1))[0]
            if not sel.size:
                continue
            d = prim.sdf(P[sel])
            if kind == 'u':
                if labels:
                    L[sel[d < D[sel]]] = grp_part(grp)
                D[sel] = smin(D[sel], d, k)
            else:
                D[sel] = smax(D[sel], -d, k)
        D = np.maximum(D, SOLE_Y - P[:, 1])
        return (D, L) if labels else D

    def grid(self, h=GRID_H, groups=None):
        n = np.ceil((GRID_HI - GRID_LO) / h).astype(int) + 1
        D = np.full(tuple(n), FAR, dtype=np.float32)
        axes = [GRID_LO[i] + h * np.arange(n[i]) for i in range(3)]
        for kind, prim, k, grp in self.ops:
            if groups is not None and grp not in groups:
                continue
            if groups is None and grp in self.low_only:
                continue
            if kind == 's' and not self.use_cuts:
                continue
            m = k + 0.012
            i0 = np.clip(np.floor((prim.lo - m - GRID_LO) / h).astype(int), 0, n - 1)
            i1 = np.clip(np.ceil((prim.hi + m - GRID_LO) / h).astype(int) + 1, 1, n)
            if np.any(i1 <= i0):
                continue
            X, Y, Z = np.meshgrid(axes[0][i0[0]:i1[0]], axes[1][i0[1]:i1[1]], axes[2][i0[2]:i1[2]], indexing='ij')
            P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
            sub = D[i0[0]:i1[0], i0[1]:i1[1], i0[2]:i1[2]]
            d = prim.sdf(P).reshape(sub.shape)
            if kind == 'u':
                sub[...] = smin(sub.astype(np.float64), d, k)
            else:
                sub[...] = smax(sub.astype(np.float64), -d, k)
        ys = axes[1][None, :, None]
        D = np.maximum(D, (SOLE_Y - ys).astype(np.float32))
        return D, n

    def project(self, P, groups, iters=8, eps=0.0006):
        """Newton steps to the zero set of the named groups' field."""
        P = np.asarray(P, dtype=float).copy()
        for _ in range(iters):
            d = self.points(P, groups)
            g = np.zeros_like(P)
            for ax in range(3):
                e = np.zeros(3)
                e[ax] = eps
                g[:, ax] = (self.points(P + e, groups) - self.points(P - e, groups)) / (2 * eps)
            gg = np.maximum(np.sum(g * g, axis=1), 1e-6)
            step = (d / gg)[:, None] * g
            sl = np.linalg.norm(step, axis=1)
            step *= np.minimum(1.0, 0.03 / np.maximum(sl, 1e-12))[:, None]
            P -= step
        return P

    def normals(self, P, groups=None, eps=0.0008):
        g = np.zeros_like(P)
        for ax in range(3):
            e = np.zeros(3)
            e[ax] = eps
            g[:, ax] = self.points(P + e, groups) - self.points(P - e, groups)
        return g / np.maximum(np.linalg.norm(g, axis=1), 1e-12)[:, None]



# ---- skeleton (round 6: putto proportions, about 3.7 heads; shared by the sculpt and the low pieces)
#
# Round 5's figure was 4.8 heads with a 10 cm neck and slim limbs, which read as
# a lanky doll. A putto is a toddler: the head is about a quarter of the height,
# there is no visible neck, the legs are short and fat, the belly sits forward of
# the chest, and the joints are fat creases rather than tapers.

HIP = {1: G(0.064, 0.392, -0.004), -1: G(-0.064, 0.384, 0.004)}
KNEE = {1: G(0.070, 0.222, 0.012), -1: G(-0.088, 0.226, 0.054)}
ANKLE = {1: G(0.074, 0.058, -0.004), -1: G(-0.098, 0.060, 0.036)}
FOOT_YAW = {1: 8.0, -1: 24.0}
SHOULDER = {1: G(0.126, 0.636, -0.014), -1: G(-0.126, 0.636, -0.014)}
NECK_PIVOT = G(0.0, 0.672, -0.008)
HEAD_C0 = G(0.0, 0.818, 0.004)
HEAD_S = 1.28  # head-local design units to metres
HEAD_TURN = -18.0  # toward the bow
HEAD_TILT = 6.0  # a little down, at the pond

# ---- the bow, held out at his right side (-X) in the frontal plane so its arc
# faces the front and back cameras. The convex back faces the body and the
# string lies outside it, so the forearm never crosses the string.
BOW_GRIP = G(-0.322, 0.548, 0.160)
BOW_UP = v3(0.0, 1.0, 0.0)
BOW_OUT = v3(1.0, 0.0, 0.0)  # the convex back
BOW_W = v3(0.0, 0.0, 1.0)  # limb width, across the bow's plane
BOW_HALF = 0.250
# Low loft rows (s, thickness in the plane, width across it). The two rows at
# |s| = 0.10 are not bow sections: they are the fist, traced off the sculpt.
BOW_ROWS = [(-0.93, 0.042, 0.042), (-0.76, 0.034, 0.036), (-0.50, 0.037, 0.039), (-0.27, 0.046, 0.046),
            (-0.10, None, None), (0.10, None, None), (0.27, 0.046, 0.046), (0.50, 0.037, 0.039),
            (0.76, 0.034, 0.036), (0.93, 0.042, 0.042)]
BOW_SIDES = 6
BOW_WRAP_S = 0.30  # leather wrap either side of the fist, as a fraction of the half length
STRING_W, STRING_D = 0.010, 0.008  # half sizes: 20 mm across the front view, 16 mm from the side

ELBOW = {1: G(0.206, 0.530, -0.050), -1: G(-0.222, 0.588, 0.062)}
FOREARM_BOW = unit(BOW_GRIP - ELBOW[-1])
WRIST = {1: G(0.170, 0.448, 0.004), -1: BOW_GRIP - FOREARM_BOW * 0.040}
HIP_HAND = G(0.142, 0.428, 0.024)


def bow_centre(s):
    off = 0.11 * s * s - 0.5 * max(0.0, abs(s) - 0.76) ** 2  # limbs bend toward the string, tips recurve
    return BOW_GRIP + BOW_UP * (BOW_HALF * s) - BOW_OUT * off


def head_frame():
    Rh = rot_axis((0, 1, 0), HEAD_TURN) @ rot_axis((1, 0, 0), HEAD_TILT)
    O = NECK_PIVOT + Rh @ (HEAD_C0 - NECK_PIVOT)
    return O, Rh


CRANIUM_C = v3(0.0, 0.012, -0.012)
CRANIUM_R = v3(0.079, 0.083, 0.088)


def scalp(az, el, lift):
    a, e = math.radians(az), math.radians(el)
    d = v3(math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a))
    return CRANIUM_C + d * CRANIUM_R * (1.0 + lift)


def hair_locks():
    """(points, radii) per lock in head-local coordinates: from the crown whorl
    over the scalp, then a snail curl at the hairline."""
    out = []
    locks = [(0, 30, 0.019), (36, 24, 0.019), (-36, 24, 0.019), (72, 14, 0.020), (-72, 14, 0.020),
             (106, 4, 0.020), (-106, 4, 0.020), (140, -6, 0.021), (-140, -6, 0.021), (170, -12, 0.021),
             (-170, -12, 0.021)]
    for (az1, el1, r) in locks:
        hand = 1 if az1 >= 0 else -1
        az0 = az1 - 30
        pts, rad = [], []
        K = 8
        for k in range(K + 1):
            t = k / K
            el = 76 + (el1 + 8 - 76) * t
            az = az0 + (az1 - az0) * t
            pts.append(scalp(az, el, 0.035 + 0.075 * math.sin(math.pi * t) ** 0.7))
            rad.append(r * (0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.2 + 0.9 * t)) ** 0.5))
        end = pts[-1]
        n = unit(end - CRANIUM_C)
        tdir = unit(pts[-1] - pts[-2])
        tdir = unit(tdir - np.dot(tdir, n) * n)
        side = unit(np.cross(n, tdir)) * hand
        rho0 = 0.018
        centre = end + side * rho0
        for k in range(1, 15):
            t = k / 14
            ang = t * 2 * math.pi * 1.2  # starts heading along tdir, winds in toward the centre
            rho = rho0 * (1 - 0.65 * t)
            pts.append(centre + rho * (-math.cos(ang) * side + math.sin(ang) * tdir) + n * (0.004 * (1 - t)))
            rad.append(r * (0.60 - 0.28 * t))
        out.append((pts, rad))
    return out


def grp_part(g):
    if g.startswith(('torso', 'leg', 'arm')):
        return PART_BODY
    return {'head': PART_HEAD, 'hair': PART_HAIR, 'wing': PART_WING}[g[:4]]


def surface_points(S, origins, dirs, groups, inset=0.0):
    """Where rays from inside first leave the named groups' solid, pulled back by `inset`."""
    hit = snap_rays(S, origins, dirs, groups, name='crease')
    return [h - unit(d) * inset for h, d in zip(hit, dirs)]


def build_sculpt():
    S = Sculpt()
    T = 'torso'
    # ---- torso: pelvis, a pot belly forward of the chest, ribcage, chest pads,
    # shoulder girdle, buttocks, shoulder blades and a short fat neck
    tilt_p = rot_axis((0, 0, 1), 4.0)  # contrapposto: the standing (+X) hip high
    tilt_c = rot_axis((0, 0, 1), -3.0)  # shoulders counter-tilted
    S.add(Ellipsoid(G(0.0, 0.425, -0.012), (0.120, 0.082, 0.094), tilt_p), 0.0, T)
    S.add(Ellipsoid(G(0.0, 0.498, 0.020), (0.112, 0.092, 0.104), tilt_p), 0.035, T)
    S.add(Ellipsoid(G(0.0, 0.578, -0.010), (0.110, 0.084, 0.086), tilt_c), 0.035, T)
    for sx in (1, -1):
        S.add(Ellipsoid(G(0.048 * sx, 0.598, 0.046), (0.046, 0.034, 0.030), tilt_c), 0.022, T)  # chest pad
        S.add(Ellipsoid(G(0.056 * sx, 0.405, -0.054), (0.068, 0.074, 0.062)), 0.020, T)  # buttock
        S.add(Ellipsoid(G(0.054 * sx, 0.595, -0.066), (0.044, 0.050, 0.024),
                        rot_axis((0, 0, 1), -14 * sx)), 0.020, T)  # shoulder blade
    S.add(Ellipsoid(G(0.0, 0.632, -0.018), (0.128, 0.038, 0.064), tilt_c), 0.030, T)  # shoulder girdle
    S.add(RoundCone(G(0.0, 0.630, -0.016), G(0.0, 0.725, -0.006), 0.066, 0.060), 0.030, T)  # neck
    S.add(Ellipsoid(G(0.0, 0.668, -0.040), (0.092, 0.046, 0.050)), 0.030, T)  # fat nape and trapezius
    # ---- legs: fat thighs, a kneecap between fat pads, a round calf, a fat roll above the ankle
    for sx in (1, -1):
        L = f'leg{sx:+d}'
        H, K, A = HIP[sx], KNEE[sx], ANKLE[sx]
        S.add(Chain([H, H + 0.45 * (K - H), H + 0.85 * (K - H), K], [0.080, 0.074, 0.057, 0.048]), 0.030, L)
        kn = unit(np.cross(K - H, v3(1, 0, 0)))
        kn = -kn if kn[2] < 0 else kn
        S.add(Ellipsoid(K + kn * 0.034 + v3(0, 0.004, 0), (0.024, 0.026, 0.014), frame_from(kn, (1, 0, 0))),
              0.010, L)  # kneecap
        S.add(Chain([K, K + 0.33 * (A - K), A], [0.048, 0.050, 0.031]), 0.012, L)
        S.add(Ellipsoid(K + 0.32 * (A - K) - kn * 0.016, (0.042, 0.058, 0.038)), 0.018, L)  # calf
        S.add(Ellipsoid(A + 0.22 * (K - A), (0.040, 0.020, 0.040)), 0.012, L)  # fat roll above the ankle
        yaw = math.radians(FOOT_YAW[sx])
        f = v3(sx * math.sin(yaw), 0, math.cos(yaw))
        lat = v3(sx * math.cos(yaw), 0, -math.sin(yaw))  # outward
        base = v3(A[0], SOLE_Y, A[2])
        Rf = np.stack([lat, v3(0, 1, 0), f], axis=1)
        S.add(Ellipsoid(base + f * -0.012 + v3(0, 0.030, 0), (0.031, 0.032, 0.034), Rf), 0.010, L)  # heel
        S.add(Ellipsoid(base + f * 0.042 + v3(0, 0.026, 0) - lat * 0.003, (0.037, 0.028, 0.068), Rf), 0.016, L)
        S.add(RoundCone(A, base + f * 0.052 + v3(0, 0.034, 0), 0.030, 0.025), 0.014, L)  # instep
        for k, (ac, r) in enumerate(((-0.021, 0.0138), (-0.005, 0.0108), (0.009, 0.0099), (0.021, 0.0090),
                                     (0.032, 0.0081))):
            along = 0.116 if k == 0 else 0.110 - 0.006 * k
            S.add(Ellipsoid(base + f * along + lat * ac + v3(0, r * 0.95, 0), (r, r * 0.95, r * 1.25), Rf), 0.003, L)
    # ---- arms: plump upper arms and forearms
    for sx in (1, -1):
        A_ = f'arm{sx:+d}'
        Sh, E, W = SHOULDER[sx], ELBOW[sx], WRIST[sx]
        S.add(Ellipsoid(Sh + v3(0.006 * sx, 0.004, 0.0), (0.054, 0.050, 0.054)), 0.032, A_)  # deltoid
        S.add(Chain([Sh, Sh + 0.45 * (E - Sh), E], [0.050, 0.048, 0.036]), 0.020, A_)
        S.add(Chain([E, E + 0.32 * (W - E), W], [0.036, 0.041, 0.028]), 0.012, A_)
    # hip hand: palm on the side of the hip, fingers forward and down, thumb back
    A_ = 'arm+1'
    hp = HIP_HAND
    S.add(RoundCone(WRIST[1], hp, 0.028, 0.026), 0.010, A_)
    S.add(Ellipsoid(hp, (0.018, 0.038, 0.034)), 0.010, A_)
    fdir = unit(v3(-0.20, -0.42, 0.88))
    for k, dy in enumerate((0.020, 0.007, -0.007, -0.019)):
        root = hp + v3(-0.002, dy, 0.025)
        Lf = 0.042 - 0.003 * abs(k - 1.2)
        S.add(Chain([root, root + fdir * Lf * 0.55 + v3(-0.004, 0, 0), root + fdir * Lf + v3(-0.010, 0, 0)],
                    [0.0104, 0.0098, 0.0082]), 0.003, A_)
    S.add(Chain([hp + v3(0.0, 0.014, -0.022), hp + v3(-0.006, 0.009, -0.044), hp + v3(-0.012, 0.004, -0.057)],
                [0.0118, 0.0106, 0.009]), 0.005, A_)
    # bow fist ('armfist': the bake source only; the low fist is two rows of the bow loft)
    A_ = 'armfist'
    g = BOW_GRIP
    fa = unit(FOREARM_BOW - np.dot(FOREARM_BOW, BOW_UP) * BOW_UP)
    palm_side = unit(np.cross(BOW_UP, fa))
    S.add(RoundCone(WRIST[-1], g - fa * 0.012, 0.028, 0.032), 0.012, A_)
    S.add(Ellipsoid(g - fa * 0.012 + palm_side * 0.012, (0.034, 0.039, 0.028),
                    np.stack([palm_side, BOW_UP, fa], axis=1)), 0.010, A_)
    for k, du in enumerate((0.030, 0.010, -0.009, -0.028)):
        rt = 0.0118 - 0.0008 * k
        pts = [g + BOW_UP * du + 0.044 * (math.cos(math.radians(a)) * palm_side + math.sin(math.radians(a)) * fa)
               for a in (-10, 40, 90, 140, 190, 235)]
        S.add(Chain(pts, [rt] * len(pts)), 0.004, A_)
    S.add(Chain([g - fa * 0.022 - palm_side * 0.030 + BOW_UP * 0.034, g - palm_side * 0.039 + BOW_UP * 0.046,
                 g + fa * 0.020 - palm_side * 0.034 + BOW_UP * 0.041], [0.0135, 0.0125, 0.011]), 0.006, A_)  # thumb
    # ---- head, authored in its own turned and tilted frame at HEAD_S scale
    O, Rh = head_frame()

    def hadd(prim, k, grp='head'):
        S.add(Xf(prim, O, Rh, HEAD_S), k * HEAD_S, grp)

    def hcut(prim, k, grp='head'):
        S.cut(Xf(prim, O, Rh, HEAD_S), k * HEAD_S, grp)
    hadd(Ellipsoid(CRANIUM_C, CRANIUM_R), 0.0)
    hadd(Ellipsoid(v3(0, -0.034, 0.028), (0.062, 0.054, 0.060)), 0.030)  # lower face
    for sx in (1, -1):
        hadd(Ellipsoid(v3(0.042 * sx, -0.038, 0.054), (0.037, 0.033, 0.031)), 0.020)  # chubby cheek
        hadd(Ellipsoid(v3(0.077 * sx, -0.006, -0.010), (0.012, 0.024, 0.017),
                       rot_axis((0, 1, 0), 18 * sx)), 0.006)  # ear
    hadd(Ellipsoid(v3(0, -0.071, 0.058), (0.025, 0.020, 0.022)), 0.014)  # chin
    hadd(Ellipsoid(v3(0, -0.084, 0.034), (0.040, 0.020, 0.030)), 0.016)  # double chin
    hadd(Ellipsoid(v3(0, 0.014, 0.072), (0.056, 0.013, 0.020)), 0.016)  # brow
    hadd(RoundCone(v3(0, -0.002, 0.086), v3(0, -0.024, 0.097), 0.0075, 0.0105), 0.006)  # nose
    hadd(Ellipsoid(v3(0, -0.0435, 0.0875), (0.0155, 0.0058, 0.0085)), 0.004)  # upper lip
    hadd(Ellipsoid(v3(0, -0.0535, 0.0850), (0.0125, 0.0062, 0.0085)), 0.004)  # lower lip
    for sx in (1, -1):
        hcut(Ellipsoid(v3(0.086 * sx, -0.008, -0.006), (0.006, 0.013, 0.009)), 0.003)  # ear bowl
        hcut(Ellipsoid(v3(0.029 * sx, -0.003, 0.083), (0.019, 0.0125, 0.015)), 0.006)  # eye socket
    for sx in (1, -1):
        hadd(Ellipsoid(v3(0.029 * sx, -0.004, 0.071), (0.0128, 0.0128, 0.0128)), 0.002)  # eyeball
        hadd(Ellipsoid(v3(0.029 * sx, 0.004, 0.078), (0.016, 0.0055, 0.0095)), 0.003)  # upper lid
        hcut(Ellipsoid(v3(0.026 * sx, -0.006, 0.0838), (0.0034, 0.0034, 0.0030)), 0.001)  # drilled pupil
        hcut(Ellipsoid(v3(0.0062 * sx, -0.029, 0.0965), (0.0032, 0.0028, 0.0034)), 0.001)  # nostril
        hcut(Chain([v3(0.012 * sx, -0.048, 0.087), v3(0.021 * sx, -0.043, 0.080)], [0.0016, 0.0022]), 0.003)
    hcut(Ellipsoid(v3(0, -0.0488, 0.0905), (0.0140, 0.0013, 0.0080)), 0.002)  # mouth line
    hcut(Ellipsoid(v3(0, -0.0640, 0.0790), (0.016, 0.0025, 0.008)), 0.004)  # under the lower lip
    # hair: a cap behind the hairline plane, eleven swept locks ending in snail curls, a crown whorl
    cap = Inter(Ellipsoid(CRANIUM_C + v3(0, 0.002, -0.002), CRANIUM_R + 0.007),
                Plane(v3(0, -0.003, 0.0), v3(0, -1.0, 0.47), (-0.2, -0.2, -0.2), (0.2, 0.2, 0.2)), 0.012)
    hadd(cap, 0.006, 'hair')
    # the low head's hair: one smooth envelope over the locks (they live in the bake, not the silhouette)
    env = Inter(Ellipsoid(CRANIUM_C + v3(0, 0.006, -0.004), CRANIUM_R + 0.019),
                Plane(v3(0, -0.006, 0.0), v3(0, -1.0, 0.47), (-0.25, -0.25, -0.25), (0.25, 0.25, 0.25)), 0.016)
    hadd(env, 0.008, 'hairlow')
    S.low_only.add('hairlow')
    for pts, rad in hair_locks():
        hadd(Chain(pts, rad), 0.0035, 'hair')
    wh = []
    for k in range(22):
        t = k / 21
        a = t * 2 * math.pi * 1.6
        rho = 0.036 * (1 - 0.8 * t)
        wh.append(scalp(0, 90, 0.0) + v3(rho * math.cos(a), 0.010 + 0.006 * t - 0.12 * rho * rho / 0.036,
                                          rho * math.sin(a) - 0.026))
    hadd(Chain(wh, list(np.linspace(0.016, 0.008, len(wh)))), 0.003, 'hair')

    # ---- creases, placed on the surface the masses above actually make (rays from inside)
    BG = ['torso', 'leg+1', 'leg-1']
    xs = [-0.088, -0.044, 0.0, 0.044, 0.088]
    fold = surface_points(S, [G(x, 0.444, 0.0) for x in xs], [unit(v3(x * 2.0, -0.25, 1.0)) for x in xs], ['torso'],
                          0.001)
    S.cut(Chain(fold, [0.0035, 0.0050, 0.0055, 0.0050, 0.0035]), 0.006, T)  # the fat fold under the belly
    spine = surface_points(S, [G(0.0, y, -0.02) for y in (0.50, 0.56, 0.62)], [v3(0, 0, -1)] * 3, ['torso'], 0.001)
    S.cut(Chain(spine, [0.002, 0.0035, 0.002]), 0.010, T)
    cleft = surface_points(S, [G(0.0, y, -0.02) for y in (0.352, 0.400, 0.448)], [v3(0, 0, -1)] * 3, BG, 0.002)
    S.cut(Chain(cleft, [0.004, 0.005, 0.002]), 0.006, T)
    navel = surface_points(S, [G(0.002, 0.506, 0.0)], [v3(0, 0, 1)], ['torso'], 0.002)[0]
    S.cut(Ellipsoid(navel, (0.0075, 0.0085, 0.010)), 0.004, T)
    for sx in (1, -1):
        groin = surface_points(S, [G(0.100 * sx, 0.452, 0.0), G(0.058 * sx, 0.412, 0.0), G(0.018 * sx, 0.376, 0.0)],
                               [v3(0.3 * sx, 0, 1)] * 3, BG, 0.001)
        S.cut(Chain(groin, [0.004, 0.0045, 0.004]), 0.005, T)
        glut = surface_points(S, [G(0.016 * sx, 0.352, -0.02), G(0.058 * sx, 0.348, -0.02), G(0.100 * sx, 0.362, -0.02)],
                              [v3(0.2 * sx, -0.2, -1)] * 3, BG, 0.001)
        S.cut(Chain(glut, [0.0035, 0.0045, 0.0035]), 0.005, T)
        chest = surface_points(S, [G(0.020 * sx, 0.566, 0.0), G(0.050 * sx, 0.562, 0.0), G(0.080 * sx, 0.570, 0.0)],
                               [v3(0.2 * sx, -0.2, 1)] * 3, ['torso'], 0.001)
        S.cut(Chain(chest, [0.0016, 0.002, 0.0016]), 0.006, T)
        L = f'leg{sx:+d}'
        H, K, A = HIP[sx], KNEE[sx], ANKLE[sx]
        kn = unit(np.cross(K - H, v3(1, 0, 0)))
        kn = -kn if kn[2] < 0 else kn
        S.cut(Ellipsoid(K - kn * 0.046 + v3(0, 0.004, 0), (0.030, 0.005, 0.013), frame_from(kn, (1, 0, 0))),
              0.004, L)  # back of the knee
        ank = A + 0.10 * (K - A)
        ra = snap_rays(S, [ank], [unit(np.cross(K - A, v3(1, 0, 0)))], [L], name='ankle')[0]
        S.cut(Torus(ank, K - A, float(np.linalg.norm(ra - ank)) - 0.001, 0.0028), 0.004, L)  # ankle crease
        abv = A + 0.36 * (K - A)
        ra = snap_rays(S, [abv], [unit(np.cross(K - A, v3(1, 0, 0)))], [L], name='calf')[0]
        S.cut(Torus(abv, K - A, float(np.linalg.norm(ra - abv)) - 0.001, 0.0022), 0.005, L)  # fat roll crease
    for sx in (1, -1):
        A_ = f'arm{sx:+d}'
        E, W = ELBOW[sx], WRIST[sx]
        wc = W + 0.16 * (E - W)
        rw = snap_rays(S, [wc], [unit(np.cross(E - W, v3(0, 1, 0.3)))], [A_], name='wrist')[0]
        S.cut(Torus(wc, E - W, float(np.linalg.norm(rw - wc)) - 0.001, 0.0028), 0.004, A_)  # wrist crease
        ec = E + 0.18 * (W - E)
        re = snap_rays(S, [ec], [unit(np.cross(W - E, v3(0, 1, 0.3)))], [A_], name='elbow')[0]
        S.cut(Torus(ec, W - E, float(np.linalg.norm(re - ec)) - 0.001, 0.0018), 0.004, A_)  # forearm roll
    return S


# ---- wings (round 6): three stacked tiers of carved feathers per wing, each a
# closed slab with real thickness, not a shell traced off the sculpt. Seen from
# behind, the lesser coverts (thick, the wing's shoulder) sit on the greater
# coverts, which sit on the flight feathers; each tier's free edge is a row of
# rounded feather tips with a step down to the tier below.

WING_SPAN = 0.32
WING_CENTRE = np.array([0.040, 0.020])  # where the feathers fan from, in the wing plane
WING_TIERS = [  # lead: root to tip along the leading edge; lobes: feather tips (blunt, two points each)
    dict(lead=[(-0.016, -0.022), (0.100, -0.020), (0.200, -0.006), (0.272, 0.016)],
         lobes=[(0.316, 0.070), (0.272, 0.140), (0.196, 0.182), (0.110, 0.188)],
         root=(-0.020, 0.124), notch=0.016, th=(0.020, 0.011), base=None),  # flight feathers, underneath
    dict(lead=[(-0.016, -0.018), (0.100, -0.016), (0.190, -0.002)],
         lobes=[(0.226, 0.058), (0.170, 0.112), (0.096, 0.130)],
         root=(-0.020, 0.090), notch=0.014, th=(0.024, 0.015), base=0.006),  # greater coverts
    dict(lead=[(-0.016, -0.014), (0.090, -0.012)],
         lobes=[(0.146, 0.026), (0.112, 0.068), (0.052, 0.080)],
         root=(-0.020, 0.056), notch=0.012, th=(0.030, 0.020), base=0.020),  # lesser coverts, on top
]
LOBE_HALF = 0.017  # half width of a feather's blunt tip


def wing_basis(sx):
    R0 = G(0.048 * sx, 0.604, -0.058)  # sunk so every tier's root wall is inside the back
    a = unit(v3(sx * 0.66, 0.50, -0.56))
    d0 = v3(sx * 0.22, -1.0, -0.30)
    d = unit(d0 - np.dot(d0, a) * a)
    n = unit(np.cross(a, d))
    if n[2] > 0:
        n = -n
    return R0, a, d, n


def wing_point(sx, u, v, o=0.0):
    R0, a, d, n = wing_basis(sx)
    bend = -0.075 * (max(u, 0.0) / WING_SPAN) ** 2 - 0.030 * (max(v, 0.0) / 0.2) ** 2  # dorsal side convex
    return R0 + a * u + d * v + n * (o + bend)


class Piece:
    """Export geometry: verts (glTF frame), triangles, per-corner UVs in metres,
    a part id per vertex, UV islands (face index lists) and a tag per face."""

    def __init__(self, name, verts, faces, uvs, parts, islands, tags=None):
        self.name, self.verts, self.faces, self.uvs = name, list(verts), list(faces), list(uvs)
        self.parts = list(parts)
        self.islands = islands
        self.tags = list(tags) if tags is not None else [-1.0] * len(faces)


def surf_piece(s):
    v, f, uv = s.low()
    return Piece(s.name, v, f, uv, [s.part] * len(v), [list(range(len(f)))])


def wing_slab(sx, tier):
    from mathutils.geometry import delaunay_2d_cdt
    spec = WING_TIERS[tier]
    outline, th = [], []
    for q in spec['lead']:
        outline.append(np.array(q, dtype=float))
        th.append(spec['th'][0])
    lobes = [np.array(q, dtype=float) for q in spec['lobes']]
    for i, lb in enumerate(lobes):
        radial = unit(lb - WING_CENTRE)
        across = np.array([-radial[1], radial[0]])  # toward the leading edge when walking tip -> root
        pair = [lb + across * LOBE_HALF * side - radial * 0.004 for side in (1, -1)]
        if np.linalg.norm(pair[1] - outline[-1]) < np.linalg.norm(pair[0] - outline[-1]):
            pair = pair[::-1]  # walk the tip from the side nearer the previous point
        for p_ in pair:
            outline.append(p_)
            th.append(spec['th'][1])
        if i + 1 < len(lobes):
            m = (lb + lobes[i + 1]) / 2
            outline.append(m + unit(WING_CENTRE - m) * spec['notch'])
            th.append(spec['th'][1])
    outline.append(np.array(spec['root'], dtype=float))
    th.append(spec['th'][0])
    N = len(outline)
    res = delaunay_2d_cdt([Vector((float(q[0]), float(q[1]))) for q in outline],
                          [(i, (i + 1) % N) for i in range(N)], [list(range(N))], 1, 1e-7)
    if len(res[0]) != N:
        raise SystemExit(f'wing tier {tier}: the triangulation added vertices')
    omap = [min(o) for o in res[3]]
    tris = [[omap[i] for i in f] for f in res[2]]
    base = [(-t / 2 if spec['base'] is None else spec['base']) for t in th]
    top = [wing_point(sx, q[0], q[1], base[i] + th[i]) for i, q in enumerate(outline)]
    bot = [wing_point(sx, q[0], q[1], base[i]) for i, q in enumerate(outline)]
    _, _, _, n = wing_basis(sx)
    verts = top + bot
    faces, uvs, tags = [], [], []
    isl_top, isl_bot, walls = [], [], [[]]
    for t in tris:
        A, B, C = (verts[i] for i in t)
        if np.dot(np.cross(B - A, C - A), n) < 0:
            t = t[::-1]
        isl_top.append(len(faces))
        faces.append(list(t))
        uvs.append([tuple(outline[i]) for i in t])
        tags.append(tier + 0.0)
        isl_bot.append(len(faces))
        faces.append([N + i for i in t[::-1]])
        uvs.append([(outline[i][0], -outline[i][1]) for i in t[::-1]])
        tags.append(tier + 0.2)
    area = sum((outline[i][0] * outline[(i + 1) % N][1] - outline[(i + 1) % N][0] * outline[i][1]) for i in range(N))
    s_acc = 0.0
    for i in range(N):
        j = (i + 1) % N
        e = outline[j] - outline[i]
        out2 = np.array([e[1], -e[0]]) if area > 0 else np.array([-e[1], e[0]])
        mid = (outline[i] + outline[j]) / 2
        out3 = wing_point(sx, *(mid + unit(out2) * 0.003)) - wing_point(sx, *mid)
        q = [i, j, N + j, N + i]
        A, B, C = (verts[k] for k in q[:3])
        if np.dot(np.cross(B - A, C - A), out3) < 0:
            q = q[::-1]
        L = float(np.linalg.norm(e))
        uvq = {i: (s_acc, 0.0), j: (s_acc + L, 0.0), N + j: (s_acc + L, th[j]), N + i: (s_acc, th[i])}
        if len(walls[-1]) >= 10:  # short strips, so no one island sets the atlas width
            walls.append([])
            s_acc = 0.0
        for tri in ([q[0], q[1], q[2]], [q[0], q[2], q[3]]):
            walls[-1].append(len(faces))
            faces.append(tri)
            uvs.append([uvq[k] for k in tri])
            tags.append(tier + 0.5)
        s_acc += L + 0.004
    return Piece(f'wing{sx:+d}-{tier}', verts, faces, uvs, [PART_WING] * len(verts), [isl_top, isl_bot] + walls,
                 tags)


# ---------------------------------------------------------------- figure: low pieces

def snap_rays(S, origins, dirs, groups, tmax=0.24, dt=0.002, name=''):
    """First exit of each ray from the named groups' solid."""
    O = np.asarray(origins, dtype=float)
    D = np.array([unit(d) for d in dirs])
    n = len(O)
    ts = np.arange(dt, tmax, dt)
    f = S.points((O[:, None, :] + ts[None, :, None] * D[:, None, :]).reshape(-1, 3), groups).reshape(n, len(ts))
    f0 = S.points(O, groups)
    lo, hi = np.zeros(n), np.zeros(n)
    for i in range(n):
        inside = f0[i] <= 0
        j0 = 0
        if not inside:
            neg = np.nonzero(f[i] <= 0)[0]
            if not neg.size:
                raise SystemExit(f'{name}: ray {i} from {O[i].round(3)} never enters the sculpt')
            j0 = neg[0]
        pos = np.nonzero(f[i, j0:] > 0)[0]
        if not pos.size:
            raise SystemExit(f'{name}: ray {i} never leaves the sculpt')
        j = j0 + pos[0]
        lo[i] = ts[j - 1] if j > 0 else 0.0
        hi[i] = ts[j]
    for _ in range(14):
        mid = (lo + hi) / 2
        fm = S.points(O + mid[:, None] * D, groups)
        lo = np.where(fm <= 0, mid, lo)
        hi = np.where(fm > 0, mid, hi)
    return O + ((lo + hi) / 2)[:, None] * D


def bow_section(s, th, w):
    c = bow_centre(s)
    tan = unit(bow_centre(s + 0.01) - bow_centre(s - 0.01))
    back = unit(BOW_OUT - np.dot(BOW_OUT, tan) * tan)
    across = unit(np.cross(tan, back))
    return [c + back * (th / 2 * math.cos(2 * math.pi * k / BOW_SIDES)) +
            across * (w / 2 * math.sin(2 * math.pi * k / BOW_SIDES)) for k in range(BOW_SIDES)]


def bow_pieces(S):
    """The bow loft. Its two middle rows are the fist: rays from the riser axis,
    in the same six directions as the bow's own sections, snapped onto the
    sculpted fist, so the hand is a station of the bow rather than a part beside it."""
    rows = []
    for (s, th, w) in BOW_ROWS:
        if th is not None:
            rows.append(bow_section(s, th, w))
            continue
        c = bow_centre(s)
        dirs = [BOW_OUT * math.cos(2 * math.pi * k / BOW_SIDES) + BOW_W * math.sin(2 * math.pi * k / BOW_SIDES)
                for k in range(BOW_SIDES)]
        rows.append(list(snap_rays(S, [c] * BOW_SIDES, dirs, ['armfist'], tmax=0.12, dt=0.001, name='fist')))
    bow = Surf(rows, True, PART_BOW, pole_start=bow_centre(-1.0), pole_end=bow_centre(1.0), name='bow')
    a, b = string_ends()
    tdir = unit(b - a)
    string = limb([(a, STRING_W, STRING_D), (b, STRING_W, STRING_D)], 4, v3(1, 0, 0), PART_STRING,
                  pole_start=a - tdir * 0.004, pole_end=b + tdir * 0.004, phase=math.pi / 4, name='string')
    return [surf_piece(bow), surf_piece(string)]


def string_ends():
    out = []
    for s in (-0.955, 0.955):
        c = bow_centre(s)
        out.append(c - BOW_OUT * 0.012)  # seated in the nock, on the string side
    return out


def bow_high():
    """Bake source for the bow: the plain limb (a riser through the fist), the
    nock knobs and the raised turns of the leather wrap either side of the fist."""
    out = Part()
    plain = [bow_section(s, 0.046 if abs(s) < 0.4 else (0.034 if abs(s) < 0.8 else 0.042),
                         0.046 if abs(s) < 0.4 else (0.036 if abs(s) < 0.8 else 0.042))
             for s in np.linspace(-0.93, 0.93, 25)]
    out.extend(Surf(plain, True, PART_BOW, pole_start=bow_centre(-1.0), pole_end=bow_centre(1.0), hi=(2, 1),
                    name='bow-high').high())
    for s in (-1.0, 1.0):  # nock knobs
        out.extend(ellipsoid(bow_centre(s * 0.95), (0.024, 0.024, 0.024), 12, 8, PART_BOW))
    for s in np.arange(-BOW_WRAP_S, BOW_WRAP_S, 0.028):
        if abs(s) < 0.16:
            continue
        c = bow_centre(s)
        tan = unit(bow_centre(s + 0.01) - bow_centre(s - 0.01))
        back = unit(BOW_OUT - np.dot(BOW_OUT, tan) * tan)
        across = np.cross(tan, back)
        ring_pts = [c + 0.024 * math.cos(2 * math.pi * k / 16) * back + 0.024 * math.sin(2 * math.pi * k / 16) * across
                    for k in range(17)]
        out.extend(sweep(ring_pts, [0.0026] * 17, 6, PART_BOW))
    return out


LOW_GRID_H = float(os.environ.get('CUPID_LOW_GRID_H', 0.0035))
BODY_GROUPS = ['torso', 'leg+1', 'leg-1', 'arm+1', 'arm-1']
HEAD_GROUPS = ['head', 'hairlow']
BUDGET_BODY = int(os.environ.get('CUPID_BUDGET_BODY', 516))
BUDGET_HEAD = int(os.environ.get('CUPID_BUDGET_HEAD', 204))
PART_DENSITY = {PART_BODY: 2.4, PART_HEAD: 4.0, PART_HAIR: 3.0, PART_WING: 2.0, PART_BOW: 2.0, PART_STRING: 1.4}


def iso_quads(S, groups, h, cuts):
    import openvdb
    S.use_cuts = cuts
    D, n = S.grid(h, groups)
    S.use_cuts = True
    grid = openvdb.FloatGrid()
    grid.background = FAR
    grid.copyFromArray(D)
    pts, quads = grid.convertToQuads(isovalue=0.0)
    verts = GRID_LO + np.asarray(pts, dtype=float) * h
    return verts, np.asarray(quads, dtype=np.int64)


def signed_volume(P, F):
    P = np.asarray(P)
    F = np.asarray(F)
    return float(np.sum(np.einsum('ij,ij->i', P[F[:, 0]], np.cross(P[F[:, 1]], P[F[:, 2]])))) / 6.0


def collapse_piece(S, groups, budget, name):
    """Round 6 body method: quadric edge collapse of the sculpt's uncarved
    isosurface. The low mesh is no longer authored ring by ring; the
    simplifier keeps triangles where the form turns (the fat creases, the
    kneecaps, the hands and feet, the face) and spends few on the broad belly
    and back. Then Smart UV Project re-lays the UVs on the result."""
    verts, quads = iso_quads(S, groups, LOW_GRID_H, False)
    me = mesh_from(name, list(verts), [list(map(int, q)) for q in quads])
    obj = link(name, me)
    mod = obj.modifiers.new('collapse', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.use_collapse_triangulate = True
    start = 2 * len(quads)
    ratio = budget / start
    best = None
    for _ in range(12):
        mod.ratio = min(1.0, ratio)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        tm = ev.to_mesh()
        ntri = sum(len(p.vertices) - 2 for p in tm.polygons)
        ev.to_mesh_clear()
        if ntri <= budget and (best is None or ntri > best[1]):
            best = (mod.ratio, ntri)
        if budget - 6 <= ntri <= budget:
            break
        ratio *= (budget - 2) / max(ntri, 1)
    if best is None:
        raise SystemExit(f'{name}: decimation never reached {budget} triangles')
    mod.ratio = best[0]
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.remove(mod)
    old = obj.data
    obj.data = new
    bpy.data.meshes.remove(old)
    print(f'CUPID_COLLAPSE {name}: {start} -> {sum(len(p.vertices) - 2 for p in new.polygons)} triangles '
          f'(ratio {best[0]:.5f}) from {len(quads)} quads at {LOW_GRID_H * 1000:.1f} mm')
    # Smart UV Project
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    new.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    uvl = new.uv_layers.active.data
    P = [from_blender(v.co) for v in new.vertices]
    for q_ in P:  # the soles: flat on the seat, 2 mm into the cap, whatever the voxel wobble at the clip plane
        q_[1] = max(q_[1], SOLE_Y)
    faces, uvs = [], []
    for p in new.polygons:
        if len(p.vertices) != 3:
            raise SystemExit(f'{name}: a non-triangle survived the collapse')
        faces.append(list(p.vertices))
        uvs.append([tuple(uvl[li].uv) for li in p.loop_indices])
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(new)
    bpy.context.view_layer.update()
    if signed_volume(P, faces) < 0:
        faces = [f[::-1] for f in faces]
        uvs = [u[::-1] for u in uvs]
    # islands: faces joined across edges whose two UV ends agree
    parent = list(range(len(faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    seen = {}
    for fi, (f, uv) in enumerate(zip(faces, uvs)):
        for k in range(3):
            a, b = f[k], f[(k + 1) % 3]
            ua, ub = uv[k], uv[(k + 1) % 3]
            key = (min(a, b), max(a, b))
            val = (ua, ub) if a < b else (ub, ua)
            if key in seen:
                fj, vj = seen[key]
                if np.allclose(val[0], vj[0], atol=1e-6) and np.allclose(val[1], vj[1], atol=1e-6):
                    parent[find(fi)] = find(fj)
            else:
                seen[key] = (fi, val)
    groups_ = {}
    for fi in range(len(faces)):
        groups_.setdefault(find(fi), []).append(fi)
    islands = sorted(groups_.values(), key=lambda g: g[0])
    # UVs to metres, island by island
    PA = np.asarray(P)
    for isl in islands:
        a3 = au = 0.0
        for fi in isl:
            A, B, C = (PA[i] for i in faces[fi])
            a3 += 0.5 * np.linalg.norm(np.cross(B - A, C - A))
            (ua, va), (ub, vb), (uc, vc) = uvs[fi]
            au += 0.5 * abs((ub - ua) * (vc - va) - (uc - ua) * (vb - va))
        k = math.sqrt(a3 / max(au, 1e-12))
        for fi in isl:
            uvs[fi] = [(u * k, v * k) for (u, v) in uvs[fi]]
    _, lab = S.points(PA, groups, labels=True)
    parts = [PART_BODY if (l < 0 or l == PART_BODY) else int(l) for l in lab]
    print(f'CUPID_UV_ISLANDS {name}: {len(islands)}')
    return Piece(name, P, faces, uvs, parts, islands)


def build_figure(S):
    """All exported figure pieces: the collapsed body and head, the six wing
    slabs, and the bow loft (with the fist) and its string."""
    pieces = [collapse_piece(S, BODY_GROUPS, BUDGET_BODY, 'body'), collapse_piece(S, HEAD_GROUPS, BUDGET_HEAD, 'head')]
    for sx in (1, -1):
        for tier in range(len(WING_TIERS)):
            pieces.append(wing_slab(sx, tier))
    pieces += bow_pieces(S)
    return pieces


def sculpt_mesh(S):
    """openvdb level set of the sculpt -> (verts, quads) in the glTF frame."""
    verts, quads = iso_quads(S, None, GRID_H, True)
    print(f'CUPID_SCULPT {GRID_H * 1000:.1f} mm -> {len(verts)} verts, {len(quads)} quads')
    return verts, quads


def raster_attr(tris_uv, tris_val, size):
    """Barycentric interpolation of per-corner values over UV triangles."""
    K = len(tris_val[0][0])
    img = np.zeros((size, size, K))
    mask = np.zeros((size, size), dtype=bool)
    for tri, val in zip(tris_uv, tris_val):
        t = np.asarray(tri) * size
        V = np.asarray(val, dtype=float)
        x0, y0 = np.floor(t.min(axis=0)).astype(int)
        x1, y1 = np.ceil(t.max(axis=0)).astype(int)
        x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0)
        x1, y1 = min(x1 + 1, size - 1), min(y1 + 1, size - 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l3 = 1 - l1 - l2
        e = 0.6 / max(abs(den) ** 0.5, 1e-6)
        inside = (l1 >= -e) & (l2 >= -e) & (l3 >= -e)
        if not inside.any():
            continue
        vals = l1[..., None] * V[0] + l2[..., None] * V[1] + l3[..., None] * V[2]
        sub = img[y0:y1 + 1, x0:x1 + 1]
        sub[inside] = vals[inside]
        mask[y0:y1 + 1, x0:x1 + 1] |= inside
    return img, mask


# ---------------------------------------------------------------- UV packing and rasterising

def pack_islands(islands, tex):
    """islands: list of dicts {corners: list of (mesh_key, face_index), uv: dict mesh->list, density}.
    Shelf-packs bounding boxes into the unit square and rewrites the corner UVs."""
    boxes = []
    for isl in islands:
        pts = np.array([uv for (m, fi) in isl['faces'] for uv in isl['src'][m][fi]])
        mn, mx = pts.min(axis=0), pts.max(axis=0)
        w, h = (mx - mn) * isl['density']
        rot = h > w
        boxes.append((mn, w, h, rot))
    bw = np.array([b[2] if b[3] else b[1] for b in boxes])
    bh = np.array([b[1] if b[3] else b[2] for b in boxes])
    order = sorted(range(len(boxes)), key=lambda i: (-bh[i], -bw[i], i))
    S = math.sqrt(float(np.sum((bw + 0.01) * (bh + 0.01))) / 0.80)
    while True:
        m = PACK_MARGIN_PX / tex * S
        x = y = shelf = 0.0
        place, ok = {}, True
        for i in order:
            w, h = bw[i] + m, bh[i] + m
            if w > S:
                ok = False
                break
            if x + w > S:
                y += shelf
                x, shelf = 0.0, 0.0
            place[i] = (x + m / 2, y + m / 2)
            x += w
            shelf = max(shelf, h)
        if ok and y + shelf <= S:
            break
        S *= 1.02
    out = {}
    for i, isl in enumerate(islands):
        mn, w, h, rot = boxes[i]
        x0, y0 = place[i]
        for (mkey, fi) in isl['faces']:
            new = []
            for uv in isl['src'][mkey][fi]:
                lu, lv = (np.asarray(uv) - mn) * isl['density']
                if rot:
                    lu, lv = lv, w - lu
                new.append(((x0 + lu) / S, (y0 + lv) / S))
            out[(mkey, fi)] = new
    fill = float(np.sum(bw * bh)) / (S * S)
    print(f'CUPID_UV islands {len(islands)} atlas {S:.3f} m-equivalent, fill {fill:.2f}, '
          f'pedestal {tex / S:.0f} px/m, figure {tex / S * FIGURE_DENSITY:.0f} px/m at {tex} px')
    return out


def raster_mask(tris_uv, size):
    mask = np.zeros((size, size), dtype=bool)
    for tri in tris_uv:
        t = np.asarray(tri) * size
        x0, y0 = np.floor(t.min(axis=0)).astype(int)
        x1, y1 = np.ceil(t.max(axis=0)).astype(int)
        x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0)
        x1, y1 = min(x1 + 1, size - 1), min(y1 + 1, size - 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l3 = 1 - l1 - l2
        e = 0.6 / max(abs(den) ** 0.5, 1e-6)
        inside = (l1 >= -e) & (l2 >= -e) & (l3 >= -e)
        mask[y0:y1 + 1, x0:x1 + 1] |= inside
    return mask


def dilate(mask, k):
    m = mask.copy()
    for _ in range(k):
        n = m.copy()
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = n
    return m


def fill_holes(img, valid, iters=96):
    img = img.copy()
    valid = valid.copy()
    for _ in range(iters):
        if valid.all():
            break
        acc = np.zeros_like(img)
        cnt = np.zeros(valid.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sv = np.roll(np.roll(valid, dy, axis=0), dx, axis=1)
            si = np.roll(np.roll(img, dy, axis=0), dx, axis=1)
            acc += si * sv[..., None]
            cnt += sv
        new = (~valid) & (cnt > 0)
        img[new] = acc[new] / cnt[new][:, None]
        valid |= new
    if not valid.all():
        img[~valid] = img[valid].mean(axis=0)
    return img


# ---------------------------------------------------------------- blender plumbing

def mesh_from(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(q) for q in verts], [], faces)
    mesh.update()
    return mesh


def finish_low(name, verts, faces, uvs, vid_part, sharp):
    mesh = mesh_from(name, verts, faces)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        thr = sharp.get(vid_part[e.verts[0].index])
        if thr is not None and e.calc_face_angle(0.0) > math.radians(thr):
            e.smooth = False
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    flat = [c for f in uvs for corner in f for c in corner]
    uv.data.foreach_set('uv', flat)
    return mesh


def link(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------- noise and painting

def hash3v(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h &= 0xFFFFFFFF
    h = (((h >> 13) ^ h) * 1274126177) & 0xFFFFFFFF
    return ((h >> 8) & 0xFFFF) / 65535.0


def vnoise(P, freq, seed):
    X = P * freq
    I = np.floor(X).astype(np.int64)
    F = X - I
    F = F * F * (3 - 2 * F)
    acc = np.zeros(len(P))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (np.where(dx, F[:, 0], 1 - F[:, 0]) * np.where(dy, F[:, 1], 1 - F[:, 1])
                     * np.where(dz, F[:, 2], 1 - F[:, 2]))
                acc += w * hash3v(I[:, 0] + dx, I[:, 1] + dy, I[:, 2] + dz, seed)
    return acc * 2 - 1


def fib_dirs(n):
    golden = math.pi * (3 - math.sqrt(5))
    out = []
    for i in range(n):
        y = 1 - 2 * (i + 0.5) / n
        r = math.sqrt(1 - y * y)
        out.append(Vector((r * math.cos(golden * i), r * math.sin(golden * i), y)))
    return out


def occlusion_all(bvh, co_b, nb_b, reach, dirs):
    out = np.empty(len(co_b))
    for k in range(len(co_b)):
        nb = nb_b[k]
        origin = co_b[k] + nb * 0.0015
        hits = total = 0.0
        for d in dirs:
            w = d.dot(nb)
            if w <= 0.08:
                continue
            total += w
            if bvh.ray_cast(origin, d, reach)[0] is not None:
                hits += w
        out[k] = 1.0 - hits / max(total, 1e-6)
    return out


def mean_curvature(co, nrm, faces):
    """Mean of 2 n.(p-q)/|p-q|^2 over each vertex's edge neighbours (1/m, + convex)."""
    edges = set()
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            edges.add((min(a, b), max(a, b)))
    e = np.array(sorted(edges))
    d = co[e[:, 0]] - co[e[:, 1]]
    l2 = np.maximum(np.sum(d * d, axis=1), 1e-12)
    ka = 2 * np.sum(nrm[e[:, 0]] * d, axis=1) / l2
    kb = 2 * np.sum(nrm[e[:, 1]] * -d, axis=1) / l2
    acc = np.zeros(len(co))
    cnt = np.zeros(len(co))
    np.add.at(acc, e[:, 0], ka)
    np.add.at(acc, e[:, 1], kb)
    np.add.at(cnt, e[:, 0], 1)
    np.add.at(cnt, e[:, 1], 1)
    return acc / np.maximum(cnt, 1)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def paint_high(objs, parts, fig_floor, paints, only=None):
    """Per-vertex linear colour for each high object (glTF-frame maths). Round 4
    uses it for the pedestal only (`only`); the figure is painted per texel."""
    allv, polys, off = [], [], 0
    for o in objs:
        allv += [v.co.copy() for v in o.data.vertices]
        polys += [[i + off for i in pg.vertices] for pg in o.data.polygons]
        off += len(o.data.vertices)
    bvh = BVHTree.FromPolygons(allv, polys)
    dirs_long, dirs_short = fib_dirs(36), fib_dirs(20)
    for o, part in zip(objs, parts):
        if only is not None and o.name not in only:
            continue
        me = o.data
        co_b = [v.co.copy() for v in me.vertices]
        nb_b = [v.normal.copy() for v in me.vertices]
        P = np.array([from_blender(v) for v in co_b])
        N = np.array([from_blender(v) for v in nb_b])
        ids = np.array(part.ids)
        ao = occlusion_all(bvh, co_b, nb_b, 0.30, dirs_long)
        cav = occlusion_all(bvh, co_b, nb_b, 0.028, dirs_short)
        H = mean_curvature(P, N, [list(pg.vertices) for pg in me.polygons])
        edge = smoothstep(26.0, 75.0, H)
        crease = smoothstep(-20.0, -70.0, H)
        col = np.zeros((len(P), 3))
        y, ny = P[:, 1], N[:, 1]
        broad = vnoise(P, 3.5, 7)
        fine = vnoise(P, 22.0, 13)
        ped = ids == PART_PED
        fig = ~ped
        # ---- figure stone
        base = np.tile(np.array(STONE), (len(P), 1))
        base[:, 0] *= 1 + 0.045 * broad
        base[:, 2] *= 1 - 0.045 * broad
        base *= (1 + 0.06 * broad + 0.04 * fine)[:, None]
        bow = ids == PART_BOW
        string = ids == PART_STRING
        wrap = bow & (np.abs(y - BOW_GRIP[1]) < 0.075)
        base[bow] = BOW_TAN
        base[wrap] = BOW_WRAP
        base[string] = BOW_STRING
        dirt = np.clip(1.5 * (1 - cav) + 0.35 * (1 - ao) + 0.5 * crease, 0, 0.62)
        wingm = ids == PART_WING
        dirt[bow | string] *= 0.4
        dirt[wingm] *= 0.45
        rgb = base * (1 - dirt[:, None]) + np.array(GRIME) * dirt[:, None]
        k = (0.42 + 0.58 * ao ** 1.4) * (0.42 + 0.58 * cav ** 1.6) * (1 + 0.24 * edge)
        k[wingm] = ((0.58 + 0.42 * ao ** 1.2) * (0.62 + 0.38 * cav ** 1.3) * (1 + 0.24 * edge))[wingm]
        k *= np.where(ny > 0.55, 1.05, 1.0) * np.where(ny < -0.35, 0.86, 1.0)
        low = np.clip(1 - (y - fig_floor) / 0.20, 0, 1)
        lichen = 0.5 + 0.5 * vnoise(P, 14.0, 59)
        g = np.clip(0.48 * low + 0.18 * low * lichen, 0, 0.62)
        g = np.where(ny > 0.45, np.maximum(g, 0.20 * np.clip(vnoise(P, 19.0, 61), 0, 1)), g)
        g[bow | string] = 0.0
        rgb = (rgb * (1 - g[:, None]) + np.array(ALGAE) * g[:, None]) * k[:, None]
        for (pt, rad, fac) in paints:
            dist = np.linalg.norm(P - pt, axis=1)
            w = np.clip(1 - dist / rad, 0, 1) ** 0.7
            rgb *= (1 - (1 - fac) * w)[:, None]
        col[fig] = rgb[fig]
        # ---- pedestal stone
        if ped.any():
            on_base = (y < 0.2995) | ((y < 0.301) & (np.hypot(P[:, 0], P[:, 2]) > 0.43))
            pbase = np.where(on_base[:, None], PED_BASE, np.where((y < 1.099)[:, None], PED_COLUMN, PED_CAP))
            pbase = pbase * (1 + 0.07 * broad + 0.03 * fine)[:, None]
            pk = (0.55 + 0.45 * ao ** 1.3) * (0.55 + 0.45 * cav ** 1.4) * (1 + 0.20 * edge)
            pk *= np.where(ny > 0.6, 1.05, 1.0)
            prgb = pbase * pk[:, None]
            stain = np.clip(1 - y / 0.13, 0, 1)
            prgb *= np.stack([1 - 0.32 * stain, 1 - 0.20 * stain, 1 - 0.30 * stain], axis=1)
            moss = np.clip(1.4 * (1 - cav) * (ny > 0.3), 0, 0.5) * (0.6 + 0.4 * lichen)
            prgb = prgb * (1 - moss[:, None]) + np.array(ALGAE) * 0.8 * moss[:, None]
            col[ped] = prgb[ped]
        col = np.clip(col, 0, 1)
        attr = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        attr.data.foreach_set('color', np.concatenate([col, np.ones((len(col), 1))], axis=1).ravel().tolist())
        lum = col @ np.array([0.2126, 0.7152, 0.0722])
        if fig.any():
            fl = lum[fig & ~bow & ~string]
            print(f'CUPID_PAINT {o.name}: ao mean {ao[fig].mean():.2f}, cav mean {cav[fig].mean():.2f}, '
                  f'edge>0.5 {np.mean(edge[fig] > 0.5):.2f}; stone lum p5 {np.percentile(fl, 5):.3f} '
                  f'mean {fl.mean():.3f} p95 {np.percentile(fl, 95):.3f}')
        if ped.any():
            pl = lum[ped]
            print(f'CUPID_PAINT {o.name}: pedestal lum p5 {np.percentile(pl, 5):.3f} mean {pl.mean():.3f} '
                  f'p95 {np.percentile(pl, 95):.3f}')


def bake_source_material(name, mottle_scale, mottle_amp, bump_scale, bump_strength, streaks):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for nd in list(nodes):
        nodes.remove(nd)
    out = nodes.new('ShaderNodeOutputMaterial')
    attr = nodes.new('ShaderNodeAttribute')
    attr.attribute_type = 'GEOMETRY'
    attr.attribute_name = 'Col'
    coord = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = mottle_scale
    noise.inputs['Detail'].default_value = 4.0
    links.new(coord.outputs['Object'], noise.inputs['Vector'])
    # factor = 1 + amp * (2 * fac - 1)
    m1 = nodes.new('ShaderNodeMath')
    m1.operation = 'MULTIPLY_ADD'
    m1.inputs[1].default_value = 2 * mottle_amp
    m1.inputs[2].default_value = 1 - mottle_amp
    links.new(noise.outputs['Fac'], m1.inputs[0])
    mix = nodes.new('ShaderNodeVectorMath')
    mix.operation = 'SCALE'
    links.new(attr.outputs['Color'], mix.inputs[0])
    links.new(m1.outputs['Value'], mix.inputs['Scale'])
    colour_out = mix.outputs['Vector']
    if streaks:
        mp = nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (26.0, 26.0, 1.4)  # Blender z is up: vertical streaks
        links.new(coord.outputs['Object'], mp.inputs['Vector'])
        sn = nodes.new('ShaderNodeTexNoise')
        sn.inputs['Scale'].default_value = 1.0
        sn.inputs['Detail'].default_value = 2.0
        links.new(mp.outputs['Vector'], sn.inputs['Vector'])
        ramp = nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = 0.52
        ramp.inputs['From Max'].default_value = 0.70
        ramp.inputs['To Min'].default_value = 1.0
        ramp.inputs['To Max'].default_value = 0.90
        links.new(sn.outputs['Fac'], ramp.inputs['Value'])
        mix2 = nodes.new('ShaderNodeVectorMath')
        mix2.operation = 'SCALE'
        links.new(colour_out, mix2.inputs[0])
        links.new(ramp.outputs['Result'], mix2.inputs['Scale'])
        colour_out = mix2.outputs['Vector']
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Strength'].default_value = 1.0
    links.new(colour_out, emit.inputs['Color'])
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bn = nodes.new('ShaderNodeTexNoise')
    bn.inputs['Scale'].default_value = bump_scale
    bn.inputs['Detail'].default_value = 3.0
    links.new(coord.outputs['Object'], bn.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = 0.002
    links.new(bn.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    add = nodes.new('ShaderNodeAddShader')
    links.new(bsdf.outputs['BSDF'], add.inputs[0])
    links.new(emit.outputs['Emission'], add.inputs[1])
    links.new(add.outputs['Shader'], out.inputs['Surface'])
    return mat


def bake_target_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.name = 'BakeTarget'
    return mat


def bake(low, high, size, kind, cage=CAGE, ray=RAY):
    img = bpy.data.images.new(f'bake-{low.name}-{kind}', size, size, alpha=True, float_buffer=True)
    img.pixels.foreach_set(np.full(size * size * 4, -1.0, dtype=np.float32))
    mat = low.data.materials[0]
    tex = mat.node_tree.nodes['BakeTarget']
    tex.image = img
    mat.node_tree.nodes.active = tex
    for o in bpy.context.scene.objects:
        o.select_set(False)
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    kw = dict(type=kind, use_selected_to_active=True, cage_extrusion=cage, max_ray_distance=ray,
              margin=BAKE_MARGIN_PX, use_clear=False, target='IMAGE_TEXTURES')
    if kind == 'NORMAL':
        kw.update(normal_space='TANGENT', normal_r='POS_X', normal_g='POS_Y', normal_b='POS_Z')
    bpy.ops.object.bake(**kw)
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(size, size, 4)


def composite(bakes, masks, default):
    size = masks[0].shape[0]
    img = np.tile(np.array(default, dtype=np.float64), (size, size, 1))
    valid = np.zeros((size, size), dtype=bool)
    island = np.zeros((size, size), dtype=bool)
    for px, m in zip(bakes, masks):
        ok = m & (px[..., 0] > -0.5)
        img[ok] = px[..., :3][ok]
        valid |= ok
        island |= m
    holes = int(np.sum(island & ~valid))
    img = fill_holes(img, valid)
    return img, holes, island


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def make_image(name, rgb, colour):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    img.file_format = 'JPEG'
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=-1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.update()
    back = np.empty(h * w * 4, dtype=np.float32)
    img.pixels.foreach_get(back)
    if np.abs(back - rgba.ravel()).max() > 3e-3:
        raise SystemExit(f'{name}: pixel buffer did not take the authored values')
    img.pack()
    return img


def export_material(col_img, nor_img):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False  # glTF doubleSided: true, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(nd for nd in nodes if nd.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = ROUGHNESS
    ct = nodes.new('ShaderNodeTexImage')
    ct.image = col_img
    links.new(ct.outputs['Color'], bsdf.inputs['Base Color'])
    nt = nodes.new('ShaderNodeTexImage')
    nt.image = nor_img
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.inputs['Strength'].default_value = 1.0
    links.new(nt.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


# ---------------------------------------------------------------- export and post-check

def export(path):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=EXPORT_TANGENTS,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
        export_image_format='JPEG',
        export_jpeg_quality=JPEG_QUALITY,
        export_image_quality=JPEG_QUALITY,
        export_copyright='MillOS authored geometry',
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})


def read_glb_json(path):
    b = open(path, 'rb').read()
    length = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + length]), len(b)


def emit_pass_material(name, kind):
    """Bake-only emission passes on the figure's high mesh: 'pos' (position),
    'nrm' (shading normal) and 'part' (part id), each encoded into 0..1."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for nd in list(nodes):
        nodes.remove(nd)
    out = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Strength'].default_value = 1.0
    if kind == 'part':
        attr = nodes.new('ShaderNodeAttribute')
        attr.attribute_type = 'GEOMETRY'
        attr.attribute_name = 'Part'
        links.new(attr.outputs['Color'], emit.inputs['Color'])
    else:
        geo = nodes.new('ShaderNodeNewGeometry')
        ma = nodes.new('ShaderNodeVectorMath')
        ma.operation = 'MULTIPLY_ADD'
        ma.inputs[1].default_value = (0.25, 0.25, 0.25) if kind == 'pos' else (0.5, 0.5, 0.5)
        ma.inputs[2].default_value = (0.5, 0.5, 0.5)
        links.new(geo.outputs['Position' if kind == 'pos' else 'Normal'], ma.inputs[0])
        links.new(ma.outputs['Vector'], emit.inputs['Color'])
    links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat


def b2g(a):
    return np.stack([a[..., 0], a[..., 2], -a[..., 1]], axis=-1)



# Weathered statuary marble, warmer than the pedestal's grey.
MARBLE = (0.455, 0.440, 0.405)
VEIN = (0.25, 0.255, 0.265)
CREVICE = (0.15, 0.145, 0.135)
STRING_DARK = (0.075, 0.055, 0.035)


def sculpt_cavity(S, P, N, unfit, kfit):
    """Concavity read straight off the sculpt's field at each texel: how far
    the field falls short of a free offset along the normal, at three reaches."""
    Q = unfit(P)
    acc = np.zeros(len(P))
    wsum = 0.0
    for delta, w in ((0.0035, 1.0), (0.008, 0.6), (0.018, 0.15)):
        dd = delta / kfit
        f = S.points(Q + N * dd)
        acc += w * np.clip((dd - f) / dd, 0, 1)
        wsum += w
    return acc / wsum


def paint_figure_texels(S, unfit, kfit, pos, nrm, part, ao_s, mask, tag):
    """Round 6 paint: clean statuary marble. Colour per texel from the position
    and normal (baked for the body, head, fist and bow; interpolated straight
    off the slabs for the wings), the sculpt's own concavity and one
    short-reach occlusion pass, both capped so a crevice reads as carving and
    never as dirt. No long-reach occlusion is baked into the albedo any more
    (under the wings it painted grey smudges down the back), and no algae,
    lichen or rain streaks on the figure (they read as dirt on the legs)."""
    ok = mask & (pos[..., 0] > -0.5) & (part[..., 0] > -0.5)
    P = b2g((pos[ok, :3] - 0.5) * 4.0)
    N = b2g(nrm[ok, :3] * 2.0 - 1.0)
    N = N / np.maximum(np.linalg.norm(N, axis=1), 1e-9)[:, None]
    pid = np.rint(part[ok, 0] * 8.0).astype(int)
    tg = tag[ok]
    aos = np.where(ao_s[ok, 0] >= 0, np.clip(ao_s[ok, 0], 0, 1), 1.0)
    stone = (pid != PART_BOW) & (pid != PART_STRING)
    carved = stone & (pid != PART_WING)
    cav = np.zeros(len(P))
    cav[carved] = sculpt_cavity(S, P[carved], N[carved], unfit, kfit)
    ny = N[:, 1]
    broad = vnoise(P, 3.0, 7)
    mid = vnoise(P, 9.0, 11)
    fine = vnoise(P, 34.0, 13)
    rgb = np.tile(np.array(MARBLE), (len(P), 1))
    rgb[:, 0] *= 1 + 0.03 * broad
    rgb[:, 2] *= 1 - 0.05 * broad
    rgb *= (1 + 0.07 * broad + 0.04 * mid + 0.025 * fine)[:, None]
    # veins: a few warped bands several centimetres apart, soft and pale-grey
    warp = 0.9 * vnoise(P, 5.0, 21) + 0.4 * vnoise(P, 13.0, 23)
    band = np.abs(np.sin((P @ unit(v3(0.55, 0.78, 0.30))) * 22.0 + 3.0 * warp))
    vein = (1 - smoothstep(0.0, 0.10, band)) * smoothstep(0.05, 0.50, 0.5 + 0.5 * vnoise(P, 2.2, 29))
    band2 = np.abs(np.sin((P @ unit(v3(-0.40, 0.70, 0.55))) * 47.0 + 4.0 * warp))
    vein2 = (1 - smoothstep(0.0, 0.05, band2)) * smoothstep(0.30, 0.70, 0.5 + 0.5 * vnoise(P, 3.1, 31))
    v_all = np.clip(0.22 * vein + 0.16 * vein2, 0, 1)
    rgb = rgb * (1 - v_all[:, None]) + np.array(VEIN) * v_all[:, None]
    # carving: the sculpt's crevices (eyes, mouth, curls, creases, finger gaps), capped
    head = (pid == PART_HEAD) | (pid == PART_HAIR)
    cap_c = np.where(head, 0.42, 0.26)
    cv = smoothstep(0.18, 0.65, np.clip(1.1 * cav, 0, 1)) * cap_c
    rgb = rgb * (1 - cv[:, None]) + np.array(CREVICE) * cv[:, None]
    rgb *= (1 - 0.12 * smoothstep(0.95, 0.45, aos))[:, None]
    rgb *= (1 + 0.05 * smoothstep(0.5, 0.9, ny))[:, None]  # washed tops
    # wings: each lower tier a shade deeper, the step walls deeper still
    wing = (pid == PART_WING) & (tg >= 0)
    if wing.any():
        tier = np.floor(tg[wing] + 1e-6)
        kind = tg[wing] - tier
        k = 1 - 0.05 * (2 - tier)
        k = np.where(kind > 0.35, k * 0.95, k)
        rgb[wing] *= k[:, None]
    # the bow: tan wood with grain, a dark leather wrap either side of the fist; dark string
    bow = pid == PART_BOW
    if bow.any():
        s = ((P[bow] - unfit_inv_grip(kfit)) @ BOW_UP) / (BOW_HALF * kfit)
        grain = 1 + 0.10 * np.sin(s * 90.0 + 5.0 * vnoise(P[bow], 30.0, 71))
        wood = np.array(BOW_TAN) * grain[:, None]
        wrap = np.abs(s) < BOW_WRAP_S
        turns = 0.80 + 0.20 * (np.sin(s * BOW_HALF * 2 * math.pi / 0.012) > -0.4)
        wood[wrap] = np.array(BOW_WRAP) * turns[wrap, None]
        rgb[bow] = wood * (0.85 + 0.15 * aos[bow])[:, None]
    string = pid == PART_STRING
    rgb[string] = np.array(STRING_DARK)
    out = np.zeros(pos.shape[:2] + (3,))
    out[ok] = np.clip(rgb, 0, 1)
    lum = rgb[stone] @ np.array([0.2126, 0.7152, 0.0722])
    print(f'CUPID_TEXEL figure stone lum p5 {np.percentile(lum, 5):.3f} p50 {np.median(lum):.3f} '
          f'p95 {np.percentile(lum, 95):.3f}; crevice>0.15 {np.mean(cv > 0.15):.3f}')
    return out, ok


_GRIP_FIT = {}


def unfit_inv_grip(kfit):
    return _GRIP_FIT['grip']


def preview(dirpath, tag=''):
    """Workbench clay views of what is linked, for iterating on silhouette."""
    os.makedirs(dirpath, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'SINGLE'
    for k, v in (('show_cavity', False), ('show_object_outline', False)):
        try:
            setattr(sh, k, v)
        except (AttributeError, TypeError):
            pass
    scene.render.resolution_x = scene.render.resolution_y = 640
    cd = bpy.data.cameras.new('preview-cam')
    cam = bpy.data.objects.new('preview-cam', cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cd.lens = 50
    target = v3(0, 1.80, 0)
    for name, az, el, dist in (('a-front', 0, 8, 2.2), ('b-sidepx', 90, 8, 2.2), ('c-sidemx', 270, 8, 2.2),
                               ('d-back', 180, 8, 2.2), ('e-az30', 30, 4, 2.2), ('f-az135', 135, 10, 2.2),
                               ('g-top', 0, 89, 2.0), ('h-face', -20, 4, 0.9)):
        a, e = math.radians(az), math.radians(el)
        tg = target if name != 'h-face' else v3(-0.03, 2.17, 0.0)
        pos = tg + v3(dist * math.cos(e) * math.sin(a), dist * math.sin(e), dist * math.cos(e) * math.cos(a))
        cam.location = to_blender(pos)
        cam.rotation_euler = (Vector(to_blender(tg)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(dirpath, f'{tag}{name}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


def main():
    path = out_path()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME

    # ---- the sculpt, then the low pieces
    sculpt = build_sculpt()
    pieces = build_figure(sculpt)
    fig_v, fig_f, fig_uv, fig_vp, fig_tag, fig_isl, isl_density = [], [], [], [], [], [], []
    ledger = {}
    for pc in pieces:
        base = len(fig_v)
        first = len(fig_f)
        fig_v += [np.asarray(q, dtype=float) for q in pc.verts]
        fig_vp += pc.parts
        fig_f += [[base + i for i in f] for f in pc.faces]
        fig_uv += pc.uvs
        fig_tag += pc.tags
        for isl in pc.islands:
            fig_isl.append([first + fi for fi in isl])
            dens = PART_DENSITY[max(set(pc.parts[i] for f in isl for i in pc.faces[f]),
                                    key=lambda p: PART_DENSITY[p])]
            isl_density.append(dens)
        key = pc.name.rsplit('-', 1)[0] if pc.name.startswith('wing') else pc.name
        ledger[key] = ledger.get(key, 0) + len(pc.faces)
    ped_v, ped_f, ped_uv, ped_keys = build_pedestal_low()

    # The head (or the hair) must own the apex, or the fit below shrinks the cherub.
    ys = np.array([q[1] for q in fig_v])
    apex_part = fig_vp[int(np.argmax(ys))]
    if apex_part not in (PART_HEAD, PART_HAIR):
        raise SystemExit(f'apex owned by part {apex_part}, not the head')
    top = float(ys.max())
    kfit = (TOP_Y - CAP_Y) / (top - CAP_Y)
    pivot = v3(0, CAP_Y, 0)

    def fit(q):
        return pivot + (np.asarray(q) - pivot) * kfit

    def unfit(q):
        return pivot + (np.asarray(q) - pivot) / kfit
    fig_v = [fit(q) for q in fig_v]
    _GRIP_FIT['grip'] = fit(BOW_GRIP)
    print(f'CUPID_FIT apex {top:.4f} (part {apex_part}) -> {TOP_Y} (k={kfit:.4f})')

    ledger['pedestal'] = len(ped_f)
    total_tris = len(fig_f) + len(ped_f)
    print(f'CUPID_TRIS {ledger} total={total_tris} indices={total_tris * 3}')
    if total_tris * 3 > INDEX_BUDGET:
        raise SystemExit(f'{total_tris * 3} indices exceeds the {INDEX_BUDGET}-index budget')

    # ---- UV atlas: every figure island at its part's density, the pedestal in tier quarters
    src = {'fig': fig_uv, 'ped': ped_uv}
    islands = [{'faces': [('fig', fi) for fi in isl], 'src': src, 'density': dn}
               for isl, dn in zip(fig_isl, isl_density)]
    groups = {}
    for fi, key in enumerate(ped_keys):
        groups.setdefault(key, []).append(fi)
    for key in sorted(groups, key=str):
        islands.append({'faces': [('ped', fi) for fi in groups[key]], 'src': src, 'density': 1.0})
    packed = pack_islands(islands, TEX_COLOUR)
    fig_uv = [packed[('fig', i)] for i in range(len(fig_f))]
    ped_uv = [packed[('ped', i)] for i in range(len(ped_f))]

    fig_mesh = finish_low(MESH_BODY, fig_v, fig_f, fig_uv, fig_vp, {PART_WING: 179.0, PART_STRING: 70.0,
                                                                    PART_BOW: 70.0})
    ped_mesh = finish_low(MESH_PEDESTAL, ped_v, ped_f, ped_uv, [PART_PED] * len(ped_v), {PART_PED: 40.0})
    fig_low = link(NODE_BODY, fig_mesh)
    ped_low = link(NODE_PEDESTAL, ped_mesh)

    # ---- the bake source: the sculpt's level set (body, head, hair, fist), plus the bow. The wings
    # are their own source: their passes are interpolated straight off the slabs below.
    sv, sq = sculpt_mesh(sculpt)
    _, labels = sculpt.points(sv, labels=True)
    labels[labels < 0] = PART_BODY
    fig_high = Part()
    fig_high.add([q for q in sv], [list(map(int, f)) for f in sq], PART_BODY)
    fig_high.ids = [int(x) for x in labels]
    fig_high.extend(bow_high())
    for pc in pieces:
        if pc.name == 'string':
            p = Part()
            p.add(pc.verts, pc.faces, PART_STRING)
            fig_high.extend(p)
    fig_high.verts = [fit(q) for q in fig_high.verts]
    fh = link('cupid-high-figure', mesh_from('cupid-high-figure', fig_high.verts, fig_high.faces))
    fh.data.shade_smooth()

    if os.environ.get('CUPID_PREVIEW'):
        fh.hide_render = True
        preview(os.environ['CUPID_PREVIEW'], 'low-')
        fh.hide_render = False
        if os.environ.get('CUPID_SKIP_BAKE') == '1':
            print('CUPID_PREVIEW only; no bake, no export')
            return

    ped_high = build_pedestal_high()
    print(f'CUPID_HIGH figure {len(fig_high.verts)} verts / {len(fig_high.faces)} faces, '
          f'pedestal {len(ped_high.verts)} verts')
    ph = link('cupid-high-pedestal', mesh_from('cupid-high-pedestal', ped_high.verts, ped_high.faces))
    pattr = fh.data.color_attributes.new(name='Part', type='FLOAT_COLOR', domain='POINT')
    pid = np.array(fig_high.ids, dtype=float) / 8.0
    pattr.data.foreach_set('color', np.stack([pid, pid, pid, np.ones_like(pid)], axis=1).ravel().tolist())
    fig_floor = min(q[1] for q in fig_v)
    paint_high([fh, ph], [fig_high, ped_high], fig_floor, [], only=('cupid-high-pedestal',))
    src_fig = bake_source_material('bake-src-figure', 46.0, 0.0, 60.0, 0.012, False)
    fh.data.materials.append(src_fig)
    ph.data.materials.append(bake_source_material('bake-src-pedestal', 18.0, 0.07, 55.0, 0.06, True))
    fig_low.data.materials.append(bake_target_material('bake-target-figure'))
    ped_low.data.materials.append(bake_target_material('bake-target-pedestal'))

    # ---- bake
    try:
        scene.render.engine = 'CYCLES'
    except TypeError as e:
        raise SystemExit(f'Cycles unavailable: {e}')
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 6
    scene.cycles.seed = 0
    world = bpy.data.worlds.new('bake-world')
    scene.world = world
    masks_c = [raster_mask(fig_uv, TEX_COLOUR), raster_mask(ped_uv, TEX_COLOUR)]
    masks_n = [raster_mask(fig_uv, TEX_NORMAL), raster_mask(ped_uv, TEX_NORMAL)]
    ped_col = bake(ped_low, ph, TEX_COLOUR, 'EMIT')
    nor_bakes = [bake(fig_low, fh, TEX_NORMAL, 'NORMAL'), bake(ped_low, ph, TEX_NORMAL, 'NORMAL')]
    passes = {}
    for kind in ('pos', 'nrm', 'part'):
        fh.data.materials[0] = emit_pass_material(f'pass-{kind}', kind)
        passes[kind] = bake(fig_low, fh, TEX_COLOUR, 'EMIT')
    fh.data.materials[0] = src_fig
    for o in (fig_low, ped_low):  # the cages must not occlude the occlusion bake
        for k in ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission',
                  'visible_volume_scatter', 'visible_shadow'):
            setattr(o, k, False)
    scene.cycles.samples = int(os.environ.get('CUPID_AO_SAMPLES', 24))
    world.light_settings.distance = 0.020
    passes['ao_s'] = bake(fig_low, fh, TEX_COLOUR, 'AO')
    for o in (fig_low, ped_low):
        for k in ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission',
                  'visible_volume_scatter', 'visible_shadow'):
            setattr(o, k, True)

    # ---- the wing slabs are their own bake source: position, normal and part straight off them
    wing_faces = [fi for fi in range(len(fig_f)) if fig_vp[fig_f[fi][0]] == PART_WING]
    PV = np.array(fig_v)
    fn = {}
    for fi in wing_faces:
        A, B, C = (PV[i] for i in fig_f[fi])
        fn[fi] = unit(np.cross(B - A, C - A))
    vals = [[list(PV[i]) + list(fn[fi]) + [fig_tag[fi]] for i in fig_f[fi]] for fi in wing_faces]
    wimg, wmask_c = raster_attr([fig_uv[fi] for fi in wing_faces], vals, TEX_COLOUR)
    wposb = np.stack([wimg[..., 0], -wimg[..., 2], wimg[..., 1]], axis=-1)  # glTF -> Blender, as the passes are
    wnrmb = np.stack([wimg[..., 3], -wimg[..., 5], wimg[..., 4]], axis=-1)
    passes['pos'][wmask_c, :3] = wposb[wmask_c] / 4.0 + 0.5
    passes['nrm'][wmask_c, :3] = wnrmb[wmask_c] * 0.5 + 0.5
    passes['part'][wmask_c, :3] = PART_WING / 8.0
    passes['ao_s'][wmask_c, :3] = 1.0
    tag = np.full((TEX_COLOUR, TEX_COLOUR), -1.0)
    tag[wmask_c] = wimg[wmask_c, 6]
    _, wmask_n = raster_attr([fig_uv[fi] for fi in wing_faces], [[[0.0]] * 3 for _ in wing_faces], TEX_NORMAL)
    nor_bakes[0][wmask_n, :3] = (0.5, 0.5, 1.0)  # the slabs carry their own form: a flat normal

    fig_mask = dilate(masks_c[0], 2)
    fig_rgb, fig_ok = paint_figure_texels(sculpt, unfit, kfit, passes['pos'], passes['nrm'], passes['part'],
                                          passes['ao_s'], fig_mask, tag)
    size = TEX_COLOUR
    colour = np.tile(np.array((0.3, 0.3, 0.3)), (size, size, 1))
    ped_mask = dilate(masks_c[1], 2)
    ped_ok = ped_mask & (ped_col[..., 0] > -0.5)
    colour[ped_ok] = ped_col[ped_ok, :3]
    colour[fig_ok] = fig_rgb[fig_ok]
    valid = ped_ok | fig_ok
    holes_c = int(np.sum((ped_mask | fig_mask) & ~valid))
    colour = fill_holes(colour, valid)
    normal, holes_n, _ = composite(nor_bakes, [dilate(m, 2) for m in masks_n], (0.5, 0.5, 1.0))
    print(f'CUPID_BAKE colour holes {holes_c} of {int((ped_mask | fig_mask).sum())} island px; normal holes {holes_n}')

    # ---- drop the bake scaffolding, build the export material
    for o in (fh, ph):
        me = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(me)
    col_img = make_image('cupid-authored-body-colour', srgb(colour), True)
    nor_img = make_image('cupid-authored-body-normal', np.clip(normal, 0, 1), False)
    mat = export_material(col_img, nor_img)
    for o in (fig_low, ped_low):
        o.data.materials.clear()
        o.data.materials.append(mat)
    for m in list(bpy.data.materials):
        if m != mat:
            bpy.data.materials.remove(m)
    for im in list(bpy.data.images):
        if im not in (col_img, nor_img):
            bpy.data.images.remove(im)
    if scene.world is not None:
        bpy.data.worlds.remove(scene.world)

    # ---- envelope checks on the exported vertices (glTF frame)
    pts = np.array(list(fig_v) + list(ped_v))
    mn, mx = pts.min(axis=0), pts.max(axis=0)
    size = mx - mn
    centre = (mn + mx) / 2
    print(f'CUPID_BOUNDS min {mn.round(4).tolist()} max {mx.round(4).tolist()} size {size.round(4).tolist()}')
    assert 1.399 <= size[0] <= 1.401 and 1.399 <= size[2] <= 1.401, size
    assert 2.278 <= size[1] <= 2.280, size
    assert abs(mn[1]) <= 0.001 and abs(centre[0]) <= 0.001 and abs(centre[2]) <= 0.001, (mn, centre)
    fig_pts = np.array(fig_v)
    assert np.max(np.hypot(fig_pts[:, 0], fig_pts[:, 2])) < FOOTPRINT_R - 0.05
    assert fig_pts[:, 1].min() >= CAP_Y - 0.004, fig_pts[:, 1].min()

    fig_low['authoredCastShadow'] = True
    fig_low['authoredReceiveShadow'] = False
    ped_low['authoredCastShadow'] = True
    ped_low['authoredReceiveShadow'] = True

    os.makedirs(os.path.dirname(path), exist_ok=True)
    export(path)

    j, nbytes = read_glb_json(path)
    names = {nd.get('name'): nd for nd in j['nodes']}
    assert NODE_BODY in names and NODE_PEDESTAL in names, list(names)
    for nm, recv in ((NODE_BODY, False), (NODE_PEDESTAL, True)):
        ex = names[nm].get('extras', {})
        assert ex.get('authoredCastShadow') is True and ex.get('authoredReceiveShadow') is recv, (nm, ex)
    assert len(j['materials']) == 1 and len(j.get('textures', [])) == 2, (j['materials'], j.get('textures'))
    indices = sum(j['accessors'][pr['indices']]['count'] for m in j['meshes'] for pr in m['primitives'])
    assert indices <= INDEX_BUDGET, indices
    img_bytes = [j['bufferViews'][im['bufferView']]['byteLength'] for im in j.get('images', [])]
    print(f'CUPID_BUILT {path} indices={indices} bytes={nbytes} images={img_bytes}')
    assert nbytes <= FILE_BUDGET, nbytes


main()
