"""Dock door frame (world-dock-door-frame), built from scratch in headless Blender.

What it builds
--------------
The fabricated steel frame round a truck dock door opening, 9.70 m wide x
5.25 m tall x 0.285 m deep, origin at the bottom centre, +Z (three.js) the yard
face. The runtime places it at local z +0.0425 in RollUpDoor
(src/components/TruckBay.tsx), so GLB z = dock-local z - 0.0425.

The contract allows 252 render vertices (= 252 indices = 84 triangles), exactly
what seven closed boxes cost, so every triangle here is a visible one: faces on
the ground, inside a joint or lying on another face are not built.

* Two L-section jambs (x 4.55-4.85): a 0.30 x 0.20 m body plus a 0.13 m
  return flange at the opening edge carried forward to z +0.138. The body's
  hall face sits at z -0.138, 4.5 mm inside the hall plane. The reveal is one
  face, full height, out to the yard plane. 6 faces each. 24 triangles.
* Two jamb guards (y 0-1.2): a bent plate on the yard face and the outer face
  of each jamb foot out to the yard plane, flat top, in safety yellow with
  diagonal hazard bands. The same paint wraps the reveal, outer and hall faces
  below 1.2 m, so the guard reads from every side. 3 faces each. 12 triangles.
* One L-section header (y 4.95-5.25) with the same flange (y 4.95-5.12) across
  the full width, closed by two L-shaped end plates. 20 triangles.
* Two galvanised corner plates on the yard plane over the header/jamb joints,
  the lower-left corner cut on the diagonal into a 0.45 m gusset across the
  opening corner. 6 triangles.
* Two rear corner plates on the hall plane (z -0.1425), the front plates folded
  through: same gusset, 4.5 mm proud of the body back. 6 triangles.
* Four 70 mm flat bars across the opening at y 0.5 / 1.5 / 2.5 / 3.5, each one
  double-sided sheet at the yard plane. Bars 2-4 lap 0.10 m onto the jamb
  flanges and end there over a raised clip plate; the bottom bar butts into
  the guard's reveal. 8 triangles.
* Eight rear bar brackets: a tapered galvanised cleat on the reveal behind
  each bar end (0.22 m reach, 0.28 m on the jamb), at z +0.1335, bolted
  through the bar. 8 triangles.

The material is double-sided (glTF doubleSided): one sheet serves both faces
of each bar, and the front corner plate shows its gusset back to the hall.

Runtime clearances kept (GLB coordinates): the procedural sectional leaf fills
x +/-4.5, z -0.0175..0.1325, y 0-4 closed and 4.1-4.9 open; everything inside
x +/-4.5 sits at z >= 0.1335 (bars, brackets, front gussets) or at z -0.1425
(rear gussets, behind the leaf). The DockStatusLight housings (x 4.8-5.2,
y 3.7-4.3) meet only the jamb body, as the old frame did. The header soffit
stays at 4.95 and the head at 5.25 (facade board posts).

Surface: one material, two textures, no vertex colour.
* base colour JPEG 512 x 256 (the atlas baked at 1024 x 512, halved): slate paint with a
  value per plane (lighter yard flange, darker recessed body and reveal), broad
  chalking low on the jambs, lit and chipped arrises (most at the
  opening edge low down, where forklifts strike), corner occlusion, fillet weld
  beads at the header joints and gussets, anchor bolts with washers on the jamb
  and header faces, a bolt fixing each bar end to the flange, ground splash
  grime up the jamb feet, dust on the head, lighter galvanised grey-blue bars;
* tangent-space normal PNG 1024 x 512 from a height field in metres (rounded
  arrises, a 25 mm bevel on the hall-side arrises, weld beads, bolt heads and
  washers on the yard side, raised anchor plates, a seam groove where flush
  plates meet), slope-encoded (-dh/ds, -dh/dt, 1) with slopes clamped at 45
  degrees; three.js and Blender normalise the result.
The hall side carries the guard wrap, galvanised anchor plates up the jambs and
along the header, a lit bevel band, and a second, finer mottle.
Each built face owns one atlas rectangle (the two jambs, the two header end
plates, the two guards, the two corner plates and the two rear corner plates
share theirs by mirroring; bars 2-4 share one rectangle, the bottom bar has its
own, the eight brackets share one) and is baked from its own 3D position, so
grime follows height and features land where the geometry is.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/dock-door-frame.py -- <out.glb>

Re-runnable and deterministic (seeded noise). Writes only <out.glb>; textures
are staged in a temporary directory that is removed afterwards.
"""

import math
import os
import shutil
import struct
import sys
import tempfile
import zlib

import bmesh
import bpy
import numpy as np

# ---------------------------------------------------------------- dimensions (three.js metres)
NODE_NAME = 'Dock-door-frameBody'
MESH_NAME = 'dock-door-frame-mesh'
MATERIAL_NAME = 'dock-door-frame-surface'
SCENE_NAME = 'MillOS_World_Dock-door-frame'

XI, XL, XO = 4.55, 4.68, 4.85  # jamb inner face, flange outer edge, jamb outer face
ZB, ZM, ZL, ZF = -0.1425, 0.0575, 0.138, 0.1425  # hall plane, body front, flange face, yard plane
ZBB = -0.138  # body back face: 4.5 mm inside the hall plane, where the rear corner plates sit
JT = 4.95  # jamb top = header soffit
HL = 5.12  # header flange top
HT = 5.25  # head
GH = 1.2  # jamb guard height
STRIP_YS = (0.5, 1.5, 2.5, 3.5)
STRIP_HALF_H = 0.035
STRIP_X = 4.65  # bars 2-4 lap onto the jamb flange and end on a clip plate
STRIP_Z0, STRIP_Z1 = 0.1335, ZF  # 1 mm clear of the leaf face (z 0.1325)
CLIP_HALF_S, CLIP_HALF_T = 0.10, 0.058  # clip plate on the flange behind each bar end
PX0, PY0 = 4.10, 4.50  # corner plate: left edge x, bottom edge y (gusset legs 0.45 m)
PRX, PRT = 4.78, 5.18  # rear corner plate: outer edge x, top edge y
BRK_L, BRK_H = 0.22, 0.28  # rear bar bracket: reach along the bar, height on the jamb
# Seeds pinned by face name, so adding or removing a face never re-rolls another.
SEEDS = {n: 1000 + 37 * i for i, n in enumerate([
    'jamb-back', 'jamb-outer', 'jamb-front', 'jamb-lip-side', 'jamb-lip-front', 'jamb-inner',
    'guard-front', 'guard-outer', 'guard-inner', 'guard-cap', 'header-back', 'header-top',
    'header-upper-front', 'header-step', 'header-lip-front', 'header-soffit', 'header-end',
    'plate-front', 'plate-back', 'bar-front', 'bar-front-low', 'bar-back', 'plate-rear', 'bracket'])}
# Hall-side faces: the guard paint wraps their feet, and they carry the wide lit
# arris, the anchor plates and the stronger weathering.
GUARD_WRAP = ('jamb-back', 'jamb-outer', 'jamb-inner')
HALL_FACES = ('jamb-back', 'jamb-outer', 'header-back', 'header-top', 'header-end')

TEX_W, TEX_H = 1024, 512
PAD = 4
SUPERSAMPLE = 2

# sRGB 0-255
PAINT = np.array([58, 67, 82], np.float32)
WORN = np.array([126, 130, 134], np.float32)
BARE = np.array([150, 152, 152], np.float32)
RUST = np.array([92, 60, 40], np.float32)
GRIME = np.array([60, 56, 50], np.float32)
DUST = np.array([108, 106, 100], np.float32)
WELD = np.array([46, 46, 48], np.float32)
HEAT = np.array([84, 70, 60], np.float32)
STRIP = np.array([106, 122, 144], np.float32)
BOLT = np.array([74, 80, 88], np.float32)
WASHER = np.array([122, 126, 130], np.float32)
FITTING = np.array([124, 132, 142], np.float32)  # galvanised clip and corner plates
YELLOW = np.array([206, 160, 34], np.float32)  # jamb guard safety paint
HAZARD = np.array([36, 36, 38], np.float32)
# Per-plane value, so the yard flange, the recessed body and the reveal read apart.
TONE = {
    'jamb-lip-front': 1.12, 'header-lip-front': 1.12,
    'jamb-front': 0.86, 'header-upper-front': 0.90,
    'jamb-lip-side': 0.84, 'jamb-inner': 0.80, 'header-soffit': 0.78,
    'guard-inner': 0.90, 'guard-outer': 0.92,
}
GUARD_TONE = {'jamb-inner': 0.90, 'jamb-back': 0.88, 'jamb-outer': 0.92}

# ---------------------------------------------------------------- noise helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def value_noise(x, y, cell, seed):
    """Seeded smooth value noise in [0,1] over metre coordinates, cell size in metres."""
    rng = np.random.default_rng(seed)
    gx = x / cell
    gy = y / cell
    ox, oy = np.floor(gx.min()) - 1, np.floor(gy.min()) - 1
    gx, gy = gx - ox, gy - oy
    nx, ny = int(np.ceil(gx.max())) + 3, int(np.ceil(gy.max())) + 3
    grid = rng.random((ny, nx)).astype(np.float32)
    ix = np.floor(gx).astype(np.int64)
    iy = np.floor(gy).astype(np.int64)
    fx = gx - ix
    fy = gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = grid[iy, ix]
    b = grid[iy, ix + 1]
    c = grid[iy + 1, ix]
    d = grid[iy + 1, ix + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(x, y, cell, seed, octaves=3):
    total = np.zeros_like(x)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        total += amp * value_noise(x, y, cell / (2 ** o), seed + 17 * o)
        norm += amp
        amp *= 0.5
    return total / norm


def segment_distance(s, t, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    ll = dx * dx + dy * dy
    k = np.clip(((s - ax) * dx + (t - ay) * dy) / ll, 0.0, 1.0)
    return np.hypot(s - (ax + k * dx), t - (ay + k * dy))


# ---------------------------------------------------------------- faces
V3 = lambda *c: np.array(c, np.float64)  # noqa: E731
EX, EY, EZ = V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)


def quad(L, W):
    return [(0.0, 0.0), (L, 0.0), (L, W), (0.0, W)]


class Face:
    """A planar face: P(s,t) = origin + s*U + t*V, polygon CCW in (s,t), U x V outward.

    edges: one type per polygon edge (edge k runs polygon[k] -> polygon[k+1]):
    'convex' arris, 'concave' inside corner, 'weld' fillet weld in an inside
    corner, 'seam' flush plates meeting, 'ground', 'buried' (enters a flange).
    """

    def __init__(self, name, kind, origin, U, V, poly, edges, mirror=True, instances=None, bolts=(), plates=()):
        self.name = name
        self.kind = kind
        self.origin = np.asarray(origin, np.float64)
        self.U = np.asarray(U, np.float64)
        self.V = np.asarray(V, np.float64)
        self.poly = poly
        self.edges = edges
        self.mirror = mirror
        self.instances = instances  # list of origin offsets (three.js) for shared copies
        self.bolts = bolts  # (s, t, kind) kind in {'anchor', 'fixing'}
        self.plates = plates  # (s, t, half_s, half_t, [(ds, dt) bolt offsets]) raised galvanised plates
        n = np.cross(self.U, self.V)
        self.normal = n / np.linalg.norm(n)
        ss = [p[0] for p in poly]
        tt = [p[1] for p in poly]
        self.L, self.W = max(ss), max(tt)
        assert min(ss) == 0 and min(tt) == 0
        area = 0.0
        for k in range(len(poly)):
            x0, y0 = poly[k]
            x1, y1 = poly[(k + 1) % len(poly)]
            area += x0 * y1 - x1 * y0
        assert area > 0, f'{name}: polygon not CCW'
        assert len(edges) == len(poly), name


def build_faces():
    faces = []
    lj = JT - GH  # jamb length above the guard
    # Right jamb; the left jamb is its mirror (x -> -x). Above the guard the
    # L-section: body (x XI-XO, z ZB-ZM) and the yard flange (x XI-XL, to ZL).
    faces.append(Face('jamb-back', 'jamb', (XI, 0, ZBB), EY, EX, quad(JT, XO - XI),
                      ['convex', 'seam', 'convex', 'ground'],
                      bolts=[(0.06, 0.07, 'anchor'), (0.06, 0.23, 'anchor')],
                      plates=[(y, (XO - XI) / 2, 0.09, 0.12, [(0, -0.07), (0, 0.07)]) for y in (1.9, 3.0, 4.1)]))
    faces.append(Face('jamb-outer', 'jamb', (XO, 0, ZBB), EY, EZ, quad(JT, ZM - ZBB),
                      ['convex', 'seam', 'convex', 'ground'],
                      bolts=[(0.06, 0.06, 'anchor'), (0.06, 0.14, 'anchor')]))
    faces.append(Face('jamb-front', 'jamb', (XO, GH, ZM), EY, -EX, quad(lj, XO - XL),
                      ['convex', 'weld', 'concave', 'concave'],
                      bolts=[(y - GH, (XO - XL) / 2, 'anchor') for y in (1.6, 2.4, 3.2, 4.6)]))
    faces.append(Face('jamb-lip-side', 'jamb', (XL, GH, ZM), EY, EZ, quad(lj, ZL - ZM),
                      ['concave', 'weld', 'convex', 'concave']))
    faces.append(Face('jamb-lip-front', 'jamb', (XL, GH, ZL), EY, -EX, quad(lj, XL - XI),
                      ['convex', 'seam', 'wear', 'seam'],
                      bolts=[(y - GH, (XL - XI) / 2, 'clip') for y in STRIP_YS if y > GH]))
    # The reveal, full height: the guard's reveal plate and the jamb's are one
    # plane (out to the yard plane), painted as the guard below GH.
    faces.append(Face('jamb-inner', 'jamb', (XI, 0, ZF), EY, -EZ, quad(JT, ZF - ZBB),
                      ['wear', 'weld', 'convex', 'ground']))
    # Jamb guard: a bent plate wrapping the yard face, the outer face and the
    # reveal of the jamb foot, out to the yard plane, with a flat top.
    faces.append(Face('guard-front', 'guard', (XO, 0, ZF), EY, -EX, quad(GH, XO - XI),
                      ['convex', 'convex', 'wear', 'ground'],
                      bolts=[(0.05, 0.07, 'anchor'), (0.05, 0.23, 'anchor'),
                             (0.75, 0.07, 'fixing'), (0.75, 0.23, 'fixing')]))
    faces.append(Face('guard-outer', 'guard', (XO, 0, ZM), EY, EZ, quad(GH, ZF - ZM),
                      ['seam', 'convex', 'convex', 'ground']))
    faces.append(Face('guard-cap', 'guard', (XL, GH, ZM), EZ, EX, quad(ZF - ZM, XO - XL),
                      ['concave', 'convex', 'convex', 'concave']))
    # Header, one instance spanning both sides.
    hw = 2 * XO
    header_bolts = [(x + XO, (HT - HL) / 2, 'anchor') for x in (-3.6, -2.8, -2.0, -1.2, -0.4, 0.4, 1.2, 2.0, 2.8, 3.6)]
    faces.append(Face('header-back', 'header', (XO, JT, ZBB), -EX, EY, quad(hw, HT - JT),
                      ['convex', 'convex', 'convex', 'convex'], mirror=False,
                      plates=[(XO - x, (HT - JT) / 2, 0.12, 0.09, [(-0.07, 0), (0.07, 0)]) for x in (-3.2, -1.1, 1.1, 3.2)]))
    faces.append(Face('header-top', 'header', (-XO, HT, ZM), EX, -EZ, quad(hw, ZM - ZBB),
                      ['convex', 'convex', 'convex', 'convex'], mirror=False))
    faces.append(Face('header-upper-front', 'header', (-XO, HL, ZM), EX, EY, quad(hw, HT - HL),
                      ['concave', 'convex', 'convex', 'convex'], mirror=False, bolts=header_bolts))
    faces.append(Face('header-step', 'header', (-XO, HL, ZL), EX, -EZ, quad(hw, ZL - ZM),
                      ['convex', 'convex', 'concave', 'convex'], mirror=False))
    faces.append(Face('header-lip-front', 'header', (-XO, JT, ZL), EX, EY, quad(hw, HL - JT),
                      ['convex', 'convex', 'convex', 'convex'], mirror=False))
    faces.append(Face('header-soffit', 'header', (-XO, JT, ZBB), EX, EZ, quad(hw, ZL - ZBB),
                      ['convex', 'convex', 'convex', 'convex'], mirror=False))
    # Header end plate (right, +x); the left one is its mirror. s along y, t along z.
    a, b = HL - JT, HT - JT
    c, d = ZM - ZBB, ZL - ZBB
    faces.append(Face('header-end', 'header', (XO, JT, ZBB), EY, EZ,
                      [(0, 0), (b, 0), (b, c), (a, c), (a, d), (0, d)],
                      ['convex', 'convex', 'convex', 'convex', 'convex', 'seam']))
    # Corner plate (right; left is its mirror): one galvanised plate on the yard
    # plane over the header/jamb joint, its lower-left corner cut on the diagonal
    # into a 0.45 m gusset across the opening corner. Its back is built only
    # where it stands free of the frame (the gusset triangle).
    pw, ph = XL - PX0, HL - PY0
    gl = XI - PX0
    plate_bolts = [(s, JT - PY0 + (HL - JT) / 2, 'fixing') for s in (0.08, 0.22, 0.36)]
    plate_bolts += [((XI - PX0) + (XL - XI) / 2, t, 'fixing') for t in (0.08, 0.22, 0.36, JT - PY0 + (HL - JT) / 2)]
    faces.append(Face('plate-front', 'plate', (PX0, PY0, ZF), EX, EY,
                      [(pw, 0), (pw, ph), (0, ph), (0, JT - PY0), (gl, 0)],
                      ['convex', 'convex', 'convex', 'convex', 'convex'], bolts=plate_bolts))
    # Rear corner plate (right; left is its mirror): the front plate folded
    # through to the hall plane, 4.5 mm proud of the body back, with the same
    # 0.45 m gusset across the opening corner.
    rb, rh = PRX - XI, PRT - PY0
    rw = PRX - PX0
    rear_bolts = [(s, (JT + HT) / 2 - PY0, 'fixing') for s in (0.10, 0.24, 0.38, 0.52)]
    rear_bolts += [(PRX - (XI + XO) / 2, t, 'fixing') for t in (0.08, 0.22, 0.36)]
    faces.append(Face('plate-rear', 'plate', (PRX, PY0, ZB), -EX, EY,
                      [(0, 0), (rb, 0), (rw, JT - PY0), (rw, rh), (0, rh)],
                      ['convex', 'convex', 'convex', 'convex', 'convex'], bolts=rear_bolts))
    # Bars across the opening. Bars 2-4 lap onto the jamb flanges (4.5 mm proud
    # of them) and end there over a clip plate; the bottom bar butts into the
    # guard's reveal plate. The back faces span the opening only.
    sh = 2 * STRIP_HALF_H
    faces.append(Face('bar-front', 'bar', (-STRIP_X, -STRIP_HALF_H, STRIP_Z1), EX, EY, quad(2 * STRIP_X, sh),
                      ['convex', 'end', 'convex', 'end'], mirror=False,
                      instances=[V3(0, y, 0) for y in STRIP_YS if y > GH],
                      bolts=[(0.05, STRIP_HALF_H, 'fixing'), (2 * STRIP_X - 0.05, STRIP_HALF_H, 'fixing')]))
    faces.append(Face('bar-front-low', 'bar', (-XI, -STRIP_HALF_H, STRIP_Z1), EX, EY, quad(2 * XI, sh),
                      ['convex', 'buried', 'convex', 'buried'], mirror=False,
                      instances=[V3(0, y, 0) for y in STRIP_YS if y < GH]))
    # Rear bar brackets: a tapered galvanised cleat welded to the reveal behind
    # each bar end, bolted through the bar (z >= 0.1335, clear of the leaf).
    faces.append(Face('bracket', 'plate', (XI, -BRK_H / 2, STRIP_Z0), -EX, EY,
                      [(0, 0), (BRK_L, BRK_H / 2), (0, BRK_H)], ['convex', 'convex', 'weld'],
                      instances=[V3(0, y, 0) for y in STRIP_YS],
                      bolts=[(0.06, BRK_H / 2, 'fixing')]))
    return faces


# ---------------------------------------------------------------- atlas
ROWS = [
    ([('jamb-back', 1)], 36),
    ([('jamb-outer', 1)], 26),
    ([('jamb-front', JT - GH), ('guard-front', GH)], 40),
    ([('jamb-lip-side', JT - GH), ('guard-outer', GH)], 13),
    ([('jamb-lip-front', 1)], 20),
    ([('jamb-inner', 1)], 42),
    ([('header-back', 1)], 24),
    ([('header-top', 1)], 18),
    ([('header-upper-front', 1)], 14),
    ([('header-step', 1)], 9),
    ([('header-lip-front', 1)], 17),
    ([('header-soffit', 1)], 24),
    ([('bar-front', 1)], 12),
    ([('bar-front-low', 1)], 10),
    ([], 6),  # spare (was the bar backs); kept so the rows above keep their rects
]


def layout(faces):
    """Pixel rectangles (x0, y0, w, h) of content, rows bottom-up, PAD gutters round each."""
    by = {f.name: f for f in faces}
    rects = {}
    y = 0
    for items, h in ROWS:
        total = sum(wt for _, wt in items) or 1
        x = 0
        for i, (n, wt) in enumerate(items):
            slot = TEX_W - x if i == len(items) - 1 else int(round(TEX_W * wt / total))
            rects[n] = (x + PAD, y + PAD, slot - 2 * PAD, h)
            x += slot
        y += h + 2 * PAD
    small_h = TEX_H - y - 2 * PAD
    assert small_h >= 64, small_h
    x = 0
    # Front rects keep the column parity they had before the rear parts were
    # added, so the half-resolution colour map averages the same texel pairs.
    parity = {'plate-front': 0, 'guard-cap': 1}
    for n in ['header-end', 'plate-front', 'guard-cap', 'plate-rear', 'bracket']:
        f = by[n]
        h = small_h // 3 if n == 'bracket' else small_h  # a 0.2 m cleat needs few texels
        w = int(round(h * f.L / f.W))
        if n in parity and (x + PAD) % 2 != parity[n]:
            x += 1
        rects[n] = (x + PAD, y + PAD, w, h)
        x += w + 2 * PAD
    assert x < TEX_W
    assert set(rects) == set(by), set(by) ^ set(rects)
    return rects


# ---------------------------------------------------------------- bake
def face_samples(face, rect, ss=1):
    """Supersampled (s, t) over the rect plus gutters, clamped onto the face."""
    x0, y0, w, h = rect
    nx, ny = (w + 2 * PAD) * ss, (h + 2 * PAD) * ss
    px = (np.arange(nx) + 0.5) / ss - PAD
    py = (np.arange(ny) + 0.5) / ss - PAD
    s = np.clip(px / w, 0, 1) * face.L
    t = np.clip(py / h, 0, 1) * face.W
    S, T = np.meshgrid(s, t)
    return S, T


def edge_fields(face, S, T):
    out = {}
    for k, kind in enumerate(face.edges):
        a = face.poly[k]
        b = face.poly[(k + 1) % len(face.poly)]
        d = segment_distance(S, T, a, b)
        out[kind] = np.minimum(out[kind], d) if kind in out else d
    big = np.full_like(S, 9.0)
    return {k: out.get(k, big) for k in ('convex', 'wear', 'concave', 'weld', 'seam', 'ground', 'buried')}


def bake_face(face, rect, seed):
    S, T = face_samples(face, rect, SUPERSAMPLE)
    P = face.origin[None, None, :] + S[..., None] * face.U + T[..., None] * face.V
    Y = P[..., 1]
    e = edge_fields(face, S, T)
    convex = np.minimum(e['convex'], e['wear'])
    up = face.normal[1] > 0.5
    hall = face.name in HALL_FACES
    # Guard paint wrapping the jamb foot on the reveal, outer and hall faces.
    gz = (1 - smoothstep(GH - 0.003, GH + 0.003, Y)) if face.name in GUARD_WRAP else np.zeros_like(S)

    # ---------------- height field (metres)
    h = np.zeros_like(S)
    h += -0.006 * (1 - np.clip(convex / 0.014, 0, 1)) ** 2  # rounded arris
    if hall:
        # A 25 mm chamfer on the hall-side arrises, wide enough to catch light at range.
        h += -0.009 * (1 - np.clip(convex / 0.025, 0, 1))  # flat bevel: one slope, one normal
    h += 0.003 * gz  # the guard plate's top edge
    seam = 1 - smoothstep(0.0, 0.004, e['seam'])
    h += -0.002 * seam
    along = S if face.L >= face.W else T
    ripple = 0.5 + 0.5 * np.sin(along * 2 * math.pi / 0.007)
    bead = np.clip(1 - (e['weld'] / 0.011) ** 2, 0, 1)
    h += (0.0028 + 0.0010 * ripple) * np.sqrt(bead)
    # Clip plates: a raised galvanised plate behind each bar end, two bolts.
    clip = np.zeros_like(S)
    clip_dist = np.full_like(S, 9.0)
    bolts = []
    for bs, bt, kind in face.bolts:
        if kind == 'clip':
            dx = CLIP_HALF_S - np.abs(S - bs)
            dy = CLIP_HALF_T - np.abs(T - bt)
            clip = np.maximum(clip, smoothstep(0.0, 0.004, np.minimum(dx, dy)))
            clip_dist = np.minimum(clip_dist, -np.minimum(dx, dy))
            bolts += [(bs - 0.072, bt, 'fixing'), (bs + 0.072, bt, 'fixing')]
        else:
            bolts.append((bs, bt, kind))
    for ps, pt, hs, ht, offs in face.plates:
        dx = hs - np.abs(S - ps)
        dy = ht - np.abs(T - pt)
        clip = np.maximum(clip, smoothstep(0.0, 0.004, np.minimum(dx, dy)))
        clip_dist = np.minimum(clip_dist, -np.minimum(dx, dy))
        bolts += [(ps + ds, pt + dt, 'anchor') for ds, dt in offs]
    h += 0.004 * clip
    washer = np.zeros_like(S)
    head = np.zeros_like(S)
    for bs, bt, kind in bolts:
        r = np.hypot(S - bs, T - bt)
        rw, rh = (0.030, 0.020) if kind == 'anchor' else (0.022, 0.015)
        washer = np.maximum(washer, 1 - smoothstep(rw - 0.002, rw, r))
        hex_r = rh * (1 - 0.13 * np.cos(6 * np.arctan2(T - bt, S - bs)))
        head = np.maximum(head, (1 - smoothstep(hex_r - 0.002, hex_r, r)) * (1 - 0.35 * (r / rh) ** 2))
    if face.name not in HALL_FACES + ('plate-rear', 'bracket'):
        # Bolt relief costs ~250 PNG bytes a head; on the hall-side parts the
        # bolts are paint only (sub-pixel in relief beyond a few metres).
        h += 0.002 * washer + 0.008 * head

    # ---------------- colour
    painted = face.kind in ('jamb', 'header', 'guard')
    base = {'bar': STRIP, 'plate': FITTING, 'guard': YELLOW}.get(face.kind, PAINT)
    rgb = np.broadcast_to(base, S.shape + (3,)).astype(np.float32).copy()
    rgb *= TONE.get(face.name, 1.0)
    if face.name in GUARD_WRAP:
        guard_rgb = YELLOW * GUARD_TONE[face.name]
        rgb = rgb * (1 - gz[..., None]) + guard_rgb * gz[..., None]
    u_coord = P[..., 0] + 0.37 * P[..., 2]
    mottle = fbm(u_coord, Y, 0.9, seed + 11, 3)
    rgb *= (1.0 + (mottle - 0.5) * (0.18 if painted else 0.12))[..., None]
    if hall:
        # Broader value variation on the hall side: a second, finer mottle and
        # a slow darkening toward the head where it is out of the light.
        mottle2 = fbm(u_coord * 1.0 + 3.0, Y, 0.35, seed + 13, 2)
        rgb *= (1.0 + (mottle2 - 0.5) * 0.16)[..., None]
        rgb *= (1.0 - 0.06 * smoothstep(1.5, 5.2, Y))[..., None]
    if (face.kind == 'guard' and face.name != 'guard-cap') or face.name in GUARD_WRAP:
        # Diagonal hazard bands, 0.25 m pitch, slightly soft-edged.
        c = (Y + T) / 0.25
        frac = c - np.floor(c)
        band = smoothstep(0.0, 0.03, frac) * (1 - smoothstep(0.44, 0.47, frac))
        if face.name in GUARD_WRAP:
            band = band * gz
        rgb = rgb * (1 - band[..., None]) + HAZARD * band[..., None]
    if face.name in GUARD_WRAP:
        # The guard's top edge: a lit arris under it and a shadow line over it.
        lit = (1 - smoothstep(0.0, 0.018, GH - Y)) * gz
        shade = (1 - smoothstep(0.0, 0.025, Y - GH)) * (1 - gz)
        rgb *= (1.0 + 0.30 * lit - 0.40 * shade)[..., None]
    if painted:
        # A broad lighter zone low on the jambs where the paint has chalked.
        if face.kind == 'jamb':
            chalk = (1 - smoothstep(0.3, 2.2, Y)) * 0.10 * (1 - gz)
            rgb *= (1.0 + chalk)[..., None]
        # Faint vertical weathering runs on upright faces.
        if abs(face.normal[1]) < 0.5:
            runs = smoothstep(0.6, 0.85, value_noise(u_coord * 1.0, Y * 0.02, 0.03, seed + 29))
            rgb *= (1.0 - (0.13 if hall else 0.06) * runs)[..., None]
        # Top surfaces collect dust.
        if up:
            dust = 0.30 + 0.25 * fbm(u_coord, P[..., 2], 0.2, seed + 5, 2)
            rgb = rgb * (1 - dust[..., None]) + DUST * dust[..., None]
        # Corner occlusion.
        occ = 1 - smoothstep(0.0, 0.035, np.minimum(e['concave'], e['weld']))
        rgb *= (1.0 - 0.38 * occ)[..., None]
        # Edge highlight on every arris, chips where it is worn.
        rim = 1 - smoothstep(0.004, 0.014, convex)
        rgb *= (1.0 + 0.32 * rim)[..., None]
        if hall:
            # The chamfer reads as a lit band, worn lighter along its length.
            band = 1 - smoothstep(0.010, 0.026, convex)
            wear = 0.5 + 0.5 * fbm(u_coord + 2.0, Y, 0.25, seed + 47, 2)
            rgb *= (1.0 + 0.30 * band * wear)[..., None]
        low = 1 - smoothstep(0.6, 1.8, Y)
        chip_noise = fbm(u_coord + 7.0, Y, 0.07, seed + 41, 3)
        reach = 0.004 + 0.018 * low
        worn_edge = (1 - smoothstep(reach * 0.6, reach, convex)) * smoothstep(0.60, 0.70, chip_noise)
        opening = (1 - smoothstep(0.0, 0.025, e['wear'])) * smoothstep(0.50, 0.62, chip_noise) * low
        chip = np.clip(worn_edge * 0.7 + opening, 0, 1)
        bare = chip * smoothstep(0.66, 0.78, chip_noise)
        rgb = rgb * (1 - chip[..., None]) + WORN * chip[..., None]
        rgb = rgb * (1 - bare[..., None]) + BARE * bare[..., None]
        rust = bare * low * smoothstep(0.55, 0.8, fbm(u_coord * 5 + 3, Y * 5, 0.05, seed + 43, 2))
        rgb = rgb * (1 - 0.7 * rust[..., None]) + RUST * (0.7 * rust[..., None])
        # Forklift scrapes on the opening faces, two height bands.
        if face.name in ('guard-front', 'jamb-inner'):
            srng = np.random.default_rng(seed + 61)
            for band in ((0.12, 0.42), (0.95, 1.30)):
                for _ in range(5):
                    cy = srng.uniform(*band)
                    half = srng.uniform(0.002, 0.006)
                    span_t = srng.uniform(0.25, 0.9) * face.W
                    mark = (1 - smoothstep(half, half + 0.002, np.abs(Y - cy))) * (T < span_t + 0.01)
                    mark *= smoothstep(0.3, 0.5, value_noise(T, Y, 0.02, seed + int(cy * 1000)))
                    rgb = rgb * (1 - 0.55 * mark[..., None]) + BARE * (0.55 * mark[..., None])
        # Ground splash on the jamb feet, ragged top edge.
        if face.kind in ('jamb', 'guard'):
            top = 0.32 + 0.38 * fbm(u_coord * 4 + 1, Y * 0.0, 0.05, seed + 23, 2)
            g = (1 - smoothstep(0.02, top, Y)) * (0.45 + 0.30 * fbm(u_coord, Y, 0.06, seed + 31, 2))
            rgb = rgb * (1 - g[..., None]) + GRIME * g[..., None]
        # Weld beads: dark with a heat-tint halo.
        halo = (1 - smoothstep(0.009, 0.03, e['weld'])) * (e['weld'] > 0.008)
        rgb = rgb * (1 - 0.45 * halo[..., None]) + HEAT * (0.45 * halo[..., None])
        bead_m = (e['weld'] < 0.009).astype(np.float32)
        weld_rgb = WELD[None, None, :] * (0.85 + 0.3 * ripple)[..., None]
        rgb = rgb * (1 - bead_m[..., None]) + weld_rgb * bead_m[..., None]
        rgb *= (1.0 - 0.45 * seam)[..., None]
        # Clip plates: galvanised, lit rim, a shadow line under each.
        if clip.any():
            shadow = (1 - clip) * (1 - smoothstep(0.0, 0.015, clip_dist))
            rgb *= (1.0 - 0.40 * shadow)[..., None]
            plate_rgb = FITTING[None, None, :] * (1.0 + (mottle - 0.5) * 0.10)[..., None]
            prim = 1 - smoothstep(0.0, 0.010, -clip_dist)
            plate_rgb = plate_rgb * (1.0 + 0.25 * prim)[..., None]
            rgb = rgb * (1 - clip[..., None]) + plate_rgb * clip[..., None]
    elif face.kind == 'plate':
        spangle = value_noise(S, T, 0.03, seed + 71)
        rgb *= (1.0 + (spangle - 0.5) * 0.10)[..., None]
        rim = 1 - smoothstep(0.004, 0.014, e['convex'])
        rgb *= (1.0 + 0.28 * rim)[..., None]
        occ = 1 - smoothstep(0.0, 0.03, e['weld'])
        rgb *= (1.0 - 0.35 * occ)[..., None]
        streak = smoothstep(0.62, 0.8, value_noise(P[..., 0] * 1.0, Y * 0.05, 0.02, seed + 73))
        rgb *= (1.0 - 0.08 * streak)[..., None]
    else:
        # Galvanised flat bar: spangle, a lit top arris and a shaded lower one so
        # the 9 mm bar reads as a flat bar, not a wire.
        spangle = value_noise(S * 1.0, T * 1.0, 0.02, seed + 71)
        rgb *= (1.0 + (spangle - 0.5) * 0.08)[..., None]
        if face.normal[2] > 0:
            frac_t = T / face.W
            rgb *= (1.0 + 0.22 * smoothstep(0.70, 0.85, frac_t) - 0.34 * (1 - smoothstep(0.15, 0.30, frac_t)))[..., None]
        enter = 1 - smoothstep(0.0, 0.05, e['buried'])
        rgb *= (1.0 - 0.45 * enter)[..., None]
    # Bolts last.
    rgb = rgb * (1 - washer[..., None]) + WASHER * washer[..., None]
    head_m = np.clip(head * 2.0, 0, 1)
    rgb = rgb * (1 - head_m[..., None]) + BOLT * head_m[..., None]

    # ---------------- downsample to texels
    k = SUPERSAMPLE

    def down(a):
        hh, ww = a.shape[0] // k, a.shape[1] // k
        return a.reshape(hh, k, ww, k, *a.shape[2:]).mean(axis=(1, 3))

    # Normal from the supersampled height, metres per sample along s and t.
    x0, y0, w, hpx = rect
    ds = face.L / (w * k)
    dt = face.W / (hpx * k)
    dh_dt, dh_ds = np.gradient(h, dt, ds)
    # Slope-space encoding: (-dh/ds, -dh/dt, 1), slopes clamped to 45 degrees.
    # three.js and Blender both normalise the perturbed normal, so the direction
    # is the same as a unit vector's, and the constant blue channel costs the
    # PNG almost nothing.
    slope = np.clip(np.stack([-dh_ds, -dh_dt], axis=-1), -1.0, 1.0)
    slope = down(slope)
    n = np.concatenate([slope, np.ones(slope.shape[:2] + (1,))], axis=-1)
    return down(rgb), n


def bake_atlas(faces, rects):
    colour = np.zeros((TEX_H, TEX_W, 3), np.float32)
    colour[:] = PAINT
    normal = np.zeros((TEX_H, TEX_W, 3), np.float32)
    normal[:] = (0, 0, 1)
    for i, f in enumerate(faces):
        rect = rects[f.name]
        rgb, nrm = bake_face(f, rect, SEEDS[f.name])
        x0, y0, w, h = rect
        ys, xs = y0 - PAD, x0 - PAD
        colour[ys:ys + h + 2 * PAD, xs:xs + w + 2 * PAD] = rgb
        normal[ys:ys + h + 2 * PAD, xs:xs + w + 2 * PAD] = nrm
    # The colour map ships at half the atlas resolution (file budget); the normal
    # map keeps the full one, so arrises, welds and bolts stay crisp in light.
    colour = colour.reshape(TEX_H // 2, 2, TEX_W // 2, 2, 3).mean(axis=(1, 3))
    c8 = np.clip(np.round(colour), 0, 255).astype(np.uint8)
    n8 = np.clip(np.round((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    return c8, n8


def write_png(path, rgb):
    """Minimal RGB8 PNG writer; `rgb` row 0 is the bottom of the image (UV v = 0)."""
    rows = rgb[::-1].astype(np.int16)
    h, w, _ = rows.shape
    flat = rows.reshape(h, w * 3)
    out = bytearray()
    prev = np.zeros(w * 3, np.int16)
    for r in range(h):
        line = flat[r]
        left = np.zeros_like(line)
        left[3:] = line[:-3]
        upleft = np.zeros_like(line)
        upleft[3:] = prev[:-3]
        sub = line - left
        up = line - prev
        avg = line - (left + prev) // 2
        p = left + prev - upleft
        pa, pb, pc = np.abs(p - left), np.abs(p - prev), np.abs(p - upleft)
        pred = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, prev, upleft))
        paeth = line - pred
        candidates = [(0, line), (1, sub), (2, up), (3, avg), (4, paeth)]
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
    with open(path, 'wb') as fh:
        fh.write(png)


def write_jpeg(path, rgb, quality):
    h, w, _ = rgb.shape
    img = bpy.data.images.new('dock-door-frame-colour-stage', w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as is `rgb`
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


# ---------------------------------------------------------------- mesh
def to_blender(p):
    """three.js (x, y, z) -> Blender Z-up (x, -z, y); a proper rotation, winding kept."""
    return (float(p[0]), float(-p[2]), float(p[1]))


def build_mesh(faces, rects):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    mirror = np.array([-1.0, 1.0, 1.0])
    built = 0
    for f in faces:
        x0, y0, w, h = rects[f.name]
        offsets = f.instances or [np.zeros(3)]
        copies = [(o, False) for o in offsets]
        if f.mirror:
            copies += [(o, True) for o in offsets]
        for off, mirrored in copies:
            pts, uvs = [], []
            for s, t in f.poly:
                p = f.origin + s * f.U + t * f.V + off
                if mirrored:
                    p = p * mirror
                pts.append(p)
                uvs.append(((x0 + s / f.L * w) / TEX_W, (y0 + t / f.W * h) / TEX_H))
            if mirrored:
                pts, uvs = pts[::-1], uvs[::-1]
            verts = [bm.verts.new(to_blender(p)) for p in pts]
            bf = bm.faces.new(verts)
            for loop, uv in zip(bf.loops, uvs):
                loop[uv_layer].uv = uv
            # Check the winding against the intended outward normal.
            n3 = f.normal * (mirror if mirrored else 1)
            bf.normal_update()
            nb = bf.normal
            want = to_blender(n3)
            dot = nb[0] * want[0] + nb[1] * want[1] + nb[2] * want[2]
            assert dot > 0.99, f'{f.name} mirrored={mirrored} winding {dot}'
            built += len(f.poly) - 2
    assert built <= 84, f'{built} triangles, contract is 84'
    print(f'DOCK_DOOR_FRAME_TRIANGLES {built}')
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    # Double-sided: each bar is one sheet seen from both faces, and the front
    # corner plate's gusset shows its back to the hall. Exports doubleSided.
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.58

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'dock-door-frame-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'dock-door-frame-normal'
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


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P dock-door-frame.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    faces = build_faces()
    rects = layout(faces)
    stage = tempfile.mkdtemp(prefix='dock-door-frame-')
    try:
        colour, normal = bake_atlas(faces, rects)
        colour_path = os.path.join(stage, 'dock-door-frame-colour.jpg')
        normal_path = os.path.join(stage, 'dock-door-frame-normal.png')
        write_jpeg(colour_path, colour, quality=int(os.environ.get('DOCK_FRAME_JPEG_Q', '75')))
        write_png(normal_path, normal)
        print(f'DOCK_DOOR_FRAME_TEXTURES colour {os.path.getsize(colour_path)} normal {os.path.getsize(normal_path)}')

        mesh = build_mesh(faces, rects)
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/dock-door-frame.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'DOCK_DOOR_FRAME_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
