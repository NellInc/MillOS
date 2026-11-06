"""Yard access node body (world-yard-access-node-body), built from scratch in headless Blender.

What it builds
--------------
The head unit of the yard "time clock" / access terminal the runtime labels
YARD LINK (TruckBay.tsx YardAccessNode, GLB placed at [0.1125, 0.8, 0.06] inside
the node group). Delivered at its final metric size, 1.025 W x 1.10 H x 0.22 D m,
origin at the ground centre, three.js +Z = front. Everything is authored in the
node group's frame (the fallback primitives' frame, TruckBay.tsx:1683-1709) and
shifted by GROUP_OFFSET on export, so the runtime anchors can be read off
directly:

* back panel   x +-0.40, y 0.80-1.90, z +-0.04, light grey; its top and side
               front edges are chamfered 16 mm. It reaches down to y 0.80, the
               card rack's foot, so panel and rack share one base line.
* housing      x +-0.25, y 0.95-1.75, z 0.035-0.155, dark grey, chamfered 30 mm
               on all four front edges. It is centred on the panel and tall
               enough to carry the whole keypad, so no key hangs below it.
* 3 x 3 keys   slate keycaps, 0.06 x 0.05 m, tapered sides, sunk 3 mm into the
               housing face (no gap), legends 1-9 on their faces. The keypad
               mount is painted (dark plate, normal-map step, contact shadows).
               Keys have no underside: it faces the ground from 1.04 m up.
* card slot    a dark wedge under the display bezel, slot across its top face.
* card rack    x 0.375-0.625, y 0.80-1.60, z +-0.05, taupe, with a 45 deg hood
               (50 mm chamfer) across its top; its inner side is sunk into the
               panel edge.
* card pockets five pressed-sheet lips (x 0.395-0.605), one in each 70 mm gap
               under an LED bar, rising from the rack face to z 0.074 at an open
               mouth with time cards standing in it. Real geometry, so the
               side view shows a sawtooth.

Runtime anchors kept (TruckBay.tsx:1715-1745): the green display plane
(0.35 x 0.2 m centred at y 1.6, z 0.16) sits on the flat housing face inside a
painted dark bezel; the five LED bars (x 0.40-0.60, y 1.02-1.50, back at z 0.05)
sit on the rack's flat front face at z 0.05; the YARD LINK title (y 1.95) is
above the panel. Extreme faces stay full so the bounds hold: panel left x -0.40,
rack right x 0.625, rack back z -0.05, key faces z 0.17, ground y 0.80, panel
top y 1.90. The pocket lips stay inside the 70 mm gaps between LED bars (9 mm
clear of the bar above each mouth), so the rack face under every bar is flat.

The contract allows 468 render vertices (156 triangles); this mesh uses all 156.
Faces nobody can see (backs buried in the panel or housing, undersides on the
ground) are not built. Detail below that budget is carried by the two allowed
textures, which share one atlas UV layout laid out per face at a constant
texel density, painted from world-space position so features run across faces:

* base colour: powder-coat paint with mottle (no splash grime: the unit hangs
  0.8 m up), corner screws on
  the panel, a pressed border, label plate, bolts and cable gland on the panel
  back, the housing door seam, lock, display bezel and side vents, key legends,
  the card slot, the keypad mount, and on the rack the pocket card windows,
  card tops in the pocket mouths, a label strip and fixing screws;
* tangent-space normal map from height fields in metres: softened (rounded)
  edges on every face, grooves for the seams, slots and vents, domed screw and
  bolt heads, slightly domed keycaps.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-access-node-body.py -- <out.glb>

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

NODE_NAME = 'Yard-access-node-bodyBody'
MESH_NAME = 'yard-access-node-body-mesh'
MATERIAL_NAME = 'yard-access-node-body-surface'
SCENE_NAME = 'MillOS_World_Yard-access-node-body'

# Node-group frame -> GLB frame (TruckBay.tsx:1712 places the GLB at this offset).
GROUP_OFFSET = np.array([0.1125, 0.8, 0.06])
MAX_TRIANGLES = 156
EXPECTED_BOUNDS = ((-0.5125, 0.5125), (0.0, 1.1), (-0.11, 0.11))  # GLB x, y, z

TEX = 512
SUPERSAMPLE = 2
GUTTER = 3
COLOUR_QUALITY = 80
NORMAL_QUALITY = 74
MAX_SLOPE = 1.2
EDGE_R = 0.004  # metres: softened edge radius painted into the normal map
EDGE_DROP = 0.0018

# Paint, sRGB 0-255.
PANEL = np.array([221, 227, 234], np.float32)   # #e2e8f0, a touch down so sun does not clip it
HOUSING = np.array([55, 65, 81], np.float32)    # #374151
SLOT = np.array([31, 41, 55], np.float32)       # #1f2937
KEY = np.array([100, 116, 139], np.float32)     # #64748b
RACK = np.array([120, 113, 108], np.float32)    # #78716c
BLACK = np.array([14, 16, 20], np.float32)
STEEL = np.array([168, 172, 176], np.float32)
ZINC = np.array([150, 154, 158], np.float32)
GRIME = np.array([96, 90, 80], np.float32)
CARD = np.array([226, 214, 186], np.float32)
LEGEND = np.array([226, 232, 240], np.float32)
LABEL = np.array([196, 200, 204], np.float32)

# Geometry (node-group frame, metres).
PANEL_BOX = (-0.40, 0.40, 0.80, 1.90, -0.04, 0.04)
PANEL_CH = 0.016
HOUSING_BOX = (-0.25, 0.25, 0.95, 1.75, 0.035, 0.155)
HOUSING_CH = 0.030
PLATE_BOX = (-0.155, 0.155, 1.005, 1.285)  # painted keypad recess on the housing face (no geometry)
KEY_COLS = (-0.10, 0.0, 0.10)
KEY_ROWS = (1.225, 1.145, 1.065)  # top row first: 1 2 3 / 4 5 6 / 7 8 9
KEY_W, KEY_H = 0.06, 0.05
KEY_BASE_Z, KEY_TOP_Z, KEY_TAPER = 0.152, 0.170, 0.004  # base sunk 3 mm into the housing
WEDGE_X = (-0.13, 0.13)
WEDGE_Y = (1.34, 1.42)
WEDGE_Z = (0.150, 0.170)
RACK_BOX = (0.375, 0.625, 0.80, 1.60, -0.05, 0.05)
RACK_CH = 0.050  # tapered top: a 45 deg hood across half the rack depth
LED_YS = (1.50, 1.38, 1.26, 1.14, 1.02)  # runtime LED bar centres, 0.05 tall, x 0.40-0.60
DISPLAY = (-0.175, 0.175, 1.50, 1.70)    # runtime display plane extent
BEZEL = (-0.192, 0.192, 1.484, 1.708)
DOOR = (-0.212, 0.212, 0.988, 1.714)
# Card pockets: one under each LED bar, in the 70 mm gap between bars. A pressed
# sheet lip rises from the rack face to POCKET_TIP_Z at the mouth.
POCKET_X = (0.395, 0.605)
POCKET_ROOT_Z, POCKET_TIP_Z = 0.047, 0.074  # root sunk 3 mm into the rack face (z 0.05)
POCKET_ROOT_DY, POCKET_MOUTH_DY = 0.006, 0.009  # above the lower bar's top / below the bar above


def pocket_span(ly):
    """y of the lip root and mouth for the pocket under the LED centred at ly."""
    return ly - 0.095 + POCKET_ROOT_DY, ly - 0.025 - POCKET_MOUTH_DY

GLYPHS = {
    1: ('.#.', '##.', '.#.', '.#.', '###'),
    2: ('##.', '..#', '.#.', '#..', '###'),
    3: ('##.', '..#', '.#.', '..#', '##.'),
    4: ('#.#', '#.#', '###', '..#', '..#'),
    5: ('###', '#..', '##.', '..#', '##.'),
    6: ('.##', '#..', '###', '#.#', '###'),
    7: ('###', '..#', '.#.', '.#.', '.#.'),
    8: ('###', '#.#', '###', '#.#', '###'),
    9: ('###', '#.#', '###', '..#', '##.'),
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


def groove(d, width, depth):
    """Height of a groove centred on the zero line of distance field d."""
    return -depth * (1 - smoothstep(0, width / 2, np.abs(d)))


def dome(d, radius, height):
    """Height of a dome inside radius (d = distance from centre)."""
    t = np.clip(1 - (d / radius) ** 2, 0, 1)
    return height * np.sqrt(t)


# ---------------------------------------------------------------- geometry
FACES = []  # dicts: pts (k,3) in group frame, part, tag, density scale


def add_face(pts, part, tag, outward, density=1.0):
    pts = np.array(pts, dtype=np.float64)
    n = np.zeros(3)
    for i in range(len(pts)):  # Newell normal
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    if np.dot(n, outward) < 0:
        pts = pts[::-1]
        n = -n
    n /= np.linalg.norm(n)
    FACES.append({'pts': pts, 'part': part, 'tag': tag, 'n': n, 'density': density})


def chamfer_box(part, box, c, chamfered, omit):
    """Box whose front (+z) perimeter edges in `chamfered` are cut at 45 deg by c.

    Sides are 'left' (x0), 'right' (x1), 'bottom' (y0), 'top' (y1); 'back' is z0.
    Faces named in `omit` are not built (buried or on the ground).
    """
    x0, x1, y0, y1, z0, z1 = box
    ch = {s: (c if s in chamfered else 0.0) for s in ('left', 'right', 'bottom', 'top')}
    xl, xr = x0 + ch['left'], x1 - ch['right']
    yb, yt = y0 + ch['bottom'], y1 - ch['top']
    add_face([(xl, yb, z1), (xr, yb, z1), (xr, yt, z1), (xl, yt, z1)], part, 'front', (0, 0, 1))
    if 'back' not in omit:
        add_face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], part, 'back', (0, 0, -1))
    # Chamfer strips: inner edge on the front face, outer edge on the side plane at z1 - c.
    if ch['top']:
        add_face([(xl, yt, z1), (xr, yt, z1), (x1, y1, z1 - c), (x0, y1, z1 - c)], part, 'chamfer', (0, 1, 1))
    if ch['bottom']:
        add_face([(xl, yb, z1), (xr, yb, z1), (x1, y0, z1 - c), (x0, y0, z1 - c)], part, 'chamfer', (0, -1, 1))
    if ch['left']:
        add_face([(xl, yb, z1), (xl, yt, z1), (x0, y1, z1 - c), (x0, y0, z1 - c)], part, 'chamfer', (-1, 0, 1))
    if ch['right']:
        add_face([(xr, yb, z1), (xr, yt, z1), (x1, y1, z1 - c), (x1, y0, z1 - c)], part, 'chamfer', (1, 0, 1))

    def front_corner(fixed, own, adj, adj_inward_axis_value, adj_plane_value, make):
        # Returns the front-edge corner points of side `own` where it meets side `adj`.
        if ch[own]:
            return [make(adj_plane_value, z1 - c)]
        if ch[adj]:
            return [make(adj_plane_value, z1 - ch[adj]), make(adj_inward_axis_value, z1)]
        return [make(adj_plane_value, z1)]

    # Top / bottom faces (y fixed), corners with left / right.
    for side, y in (('top', y1), ('bottom', y0)):
        if side in omit:
            continue
        mk = (lambda yy: (lambda x, z: (x, yy, z)))(y)
        left = front_corner(y, side, 'left', xl, x0, mk)
        right = front_corner(y, side, 'right', xr, x1, mk)
        pts = [(x0, y, z0)] + left + right[::-1] + [(x1, y, z0)]
        add_face(pts, part, side, (0, 1 if side == 'top' else -1, 0))
    for side, x in (('left', x0), ('right', x1)):
        if side in omit:
            continue
        mk = (lambda xx: (lambda y, z: (xx, y, z)))(x)
        bottom = front_corner(x, side, 'bottom', yb, y0, mk)
        top = front_corner(x, side, 'top', yt, y1, mk)
        pts = [(x, y0, z0)] + bottom + top[::-1] + [(x, y1, z0)]
        add_face(pts, part, side, (1 if side == 'right' else -1, 0, 0))


def frustum_key(part, cx, cy):
    # No underside: it faces the ground from 1.04 m up and is only ever seen edge-on
    # from below; its 18 triangles pay for the card pockets.
    bx0, bx1, by0, by1 = cx - KEY_W / 2, cx + KEY_W / 2, cy - KEY_H / 2, cy + KEY_H / 2
    t, zb, zt = KEY_TAPER, KEY_BASE_Z, KEY_TOP_Z
    tx0, tx1, ty0, ty1 = bx0 + t, bx1 - t, by0 + t, by1 - t
    add_face([(tx0, ty0, zt), (tx1, ty0, zt), (tx1, ty1, zt), (tx0, ty1, zt)], part, 'front', (0, 0, 1), density=4.0)
    add_face([(tx0, ty1, zt), (tx1, ty1, zt), (bx1, by1, zb), (bx0, by1, zb)], part, 'side', (0, 1, 0.3))
    add_face([(tx0, ty0, zt), (tx0, ty1, zt), (bx0, by1, zb), (bx0, by0, zb)], part, 'side', (-1, 0, 0.3))
    add_face([(tx1, ty0, zt), (tx1, ty1, zt), (bx1, by1, zb), (bx1, by0, zb)], part, 'side', (1, 0, 0.3))


def wedge():
    xa, xb = WEDGE_X
    ya, yb = WEDGE_Y
    za, zb = WEDGE_Z
    add_face([(xa, yb, za), (xb, yb, za), (xb, yb, zb), (xa, yb, zb)], 'wedge', 'top', (0, 1, 0), density=2.0)
    add_face([(xa, ya, za), (xb, ya, za), (xb, yb, zb), (xa, yb, zb)], 'wedge', 'slope', (0, -0.25, 1), density=2.0)
    add_face([(xa, ya, za), (xa, yb, za), (xa, yb, zb)], 'wedge', 'end', (-1, 0, 0), density=2.0)
    add_face([(xb, ya, za), (xb, yb, za), (xb, yb, zb)], 'wedge', 'end', (1, 0, 0), density=2.0)


def pocket_lip(i, ly):
    x0, x1 = POCKET_X
    yr, ym = pocket_span(ly)
    zr, zt = POCKET_ROOT_Z, POCKET_TIP_Z
    part = f'pocket{i}'
    add_face([(x0, yr, zr), (x1, yr, zr), (x1, ym, zt), (x0, ym, zt)], part, 'slant', (0, -(zt - zr), ym - yr))
    add_face([(x0, ym, zt), (x1, ym, zt), (x1, ym, zr), (x0, ym, zr)], part, 'mouth', (0, 1, 0))
    add_face([(x1, yr, zr), (x1, ym, zt), (x1, ym, zr)], part, 'cap', (1, 0, 0))
    add_face([(x0, yr, zr), (x0, ym, zt), (x0, ym, zr)], part, 'cap', (-1, 0, 0))


def build_geometry():
    chamfer_box('panel', PANEL_BOX, PANEL_CH, {'top', 'left', 'right'}, {'bottom'})
    chamfer_box('housing', HOUSING_BOX, HOUSING_CH, {'top', 'left', 'right', 'bottom'}, {'back'})
    for r, cy in enumerate(KEY_ROWS):
        for c, cx in enumerate(KEY_COLS):
            frustum_key(f'key{r * 3 + c + 1}', cx, cy)
    wedge()
    chamfer_box('rack', RACK_BOX, RACK_CH, {'top'}, {'bottom'})
    for i, ly in enumerate(LED_YS):
        pocket_lip(i, ly)


def triangle_count():
    return sum(len(f['pts']) - 2 for f in FACES)


# ---------------------------------------------------------------- atlas layout
def face_frame(f):
    n = f['n']
    up = np.array([0.0, 1.0, 0.0])
    v = up - n * np.dot(up, n)
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


def pack(density):
    # Tallest first: shelf packing wastes least that way. Gutters keep neighbours apart.
    items = sorted(FACES, key=lambda f: -f['size'][1] / (density / f['density']))
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
    density = 0.0030
    while not pack(density):
        density *= 1.03
    return density


# ---------------------------------------------------------------- painting
def edge_distance(f, lu, lv):
    """Distance (metres) from a texel to the face's polygon boundary, in the face plane."""
    pts = f['pts']
    pu = (pts - f['origin']) @ f['U']
    pv = (pts - f['origin']) @ f['V']
    d = np.full(lu.shape, np.inf)
    inside = np.zeros(lu.shape, bool)
    k = len(pts)
    for i in range(k):
        au, av, bu, bv = pu[i], pv[i], pu[(i + 1) % k], pv[(i + 1) % k]
        eu, ev = bu - au, bv - av
        t = np.clip(((lu - au) * eu + (lv - av) * ev) / (eu * eu + ev * ev), 0, 1)
        d = np.minimum(d, np.hypot(lu - au - t * eu, lv - av - t * ev))
        crosses = ((av > lv) != (bv > lv)) & (lu < au + (lv - av) * eu / np.where(ev == 0, 1e-12, ev))
        inside ^= crosses
    return np.where(inside, d, -d)


def paint(f, P, lu, lv):
    part, tag = f['part'], f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    mottle = 1.0 + (noise3(P, 0.09) - 0.5) * 0.07 + (noise3(P, 0.017, 3) - 0.5) * 0.05
    grime_n = noise3(P, 0.05, 5)
    h = np.zeros(x.shape)

    if part == 'panel':
        rgb = PANEL * (1 + (mottle - 1) * 0.4)[..., None]  # powder coat: light mottle only
        # No splash grime: the unit hangs with its foot 0.8 m above the ground.
        if tag == 'front':
            # Corner fixing screws (domed, zinc) and the housing's contact shadow.
            for sx in (-0.355, 0.335):
                for sy in (0.855, 1.855):
                    d = np.hypot(x - sx, y - sy)
                    rgb = mix(rgb, ZINC * 0.9, smoothstep(0.0095, 0.0075, d))
                    rgb = mix(rgb, BLACK, smoothstep(0.0022, 0.0012, np.abs(x - sx)) * smoothstep(0.0075, 0.006, d) * 0.7)
                    h += dome(d, 0.0085, 0.0025)
            hd = box_sdf(x, y, HOUSING_BOX[0], HOUSING_BOX[1], HOUSING_BOX[2], HOUSING_BOX[3])
            rgb *= (1 - 0.12 * (1 - smoothstep(0.0, 0.015, hd)))[..., None]
            rd = x - RACK_BOX[0]
            rgb *= (1 - 0.10 * (1 - smoothstep(-0.015, 0.0, rd)) * (y < RACK_BOX[3] + 0.01))[..., None]
        if tag == 'back':
            # Pressed stiffening border, rating plate, mounting bolts, cable gland.
            border = box_sdf(x, y, -0.34, 0.34, 0.86, 1.84, 0.03)
            h += groove(border, 0.012, 0.0018)
            rgb *= (1 - 0.10 * (1 - smoothstep(0.0, 0.006, np.abs(border))))[..., None]
            plate = box_sdf(x, y, -0.27, -0.13, 1.66, 1.74, 0.004)
            rgb = mix(rgb, LABEL, smoothstep(0.001, -0.001, plate))
            h += 0.0008 * smoothstep(0.001, -0.002, plate)
            lines = (np.abs(((y - 1.672) % 0.014) - 0.007) < 0.0022) & (x > -0.262) & (x < -0.17) & (y < 1.73) & (y > 1.668)
            rgb = mix(rgb, BLACK * 2.5, lines * 0.8)
            for bx in (-0.2, 0.2):
                for by in (1.02, 1.68):
                    d = np.hypot(x - bx, y - by)
                    rgb = mix(rgb, ZINC, smoothstep(0.0135, 0.011, d))
                    h += dome(d, 0.012, 0.003)
            d = np.hypot(x - 0.0, y - 0.93)
            rgb = mix(rgb, BLACK * 1.8, smoothstep(0.024, 0.021, d))
            rgb = mix(rgb, BLACK, smoothstep(0.011, 0.009, d))
            h += dome(d, 0.024, 0.006) * (d > 0.010)
    elif part == 'housing':
        rgb = HOUSING * mottle[..., None]
        if tag == 'front':
            door = box_sdf(x, y, *DOOR, 0.01)
            h += groove(door, 0.004, 0.0015)
            rgb = mix(rgb, BLACK, (1 - smoothstep(0.0, 0.0018, np.abs(door))) * 0.75)
            bez = box_sdf(x, y, *BEZEL, 0.008)
            rgb = mix(rgb, SLOT * 0.85, smoothstep(0.001, -0.001, bez))
            h += 0.001 * smoothstep(0.002, -0.004, bez)
            inner = box_sdf(x, y, *DISPLAY, 0.002)
            rgb = mix(rgb, BLACK, smoothstep(0.001, -0.001, inner))
            h -= 0.0015 * smoothstep(0.002, -0.003, inner)
            d = np.hypot(x - 0.188, y - 1.31)  # door lock
            rgb = mix(rgb, STEEL, smoothstep(0.0115, 0.0095, d))
            rgb = mix(rgb, BLACK, (np.abs(x - 0.188) < 0.0015) * (d < 0.007))
            h += dome(d, 0.011, 0.002)
            # Keypad mount: a dark plate pressed 1.2 mm proud, a soft shadow off its edge,
            # and a contact shadow round each key.
            pd = box_sdf(x, y, *PLATE_BOX, 0.004)
            on_plate = smoothstep(0.0008, -0.0008, pd)
            rgb = mix(rgb, SLOT * 1.05 * mottle[..., None], on_plate)
            h += 0.0012 * smoothstep(0.0015, -0.0025, pd)
            rgb *= (1 - 0.22 * (pd > 0) * (1 - smoothstep(0.0, 0.010, pd)))[..., None]
            rgb = mix(rgb, SLOT * 1.6, (1 - smoothstep(0.0, 0.0015, np.abs(pd + 0.002))) * 0.5)
            for cy in KEY_ROWS:
                for cx in KEY_COLS:
                    kd = box_sdf(x, y, cx - KEY_W / 2, cx + KEY_W / 2, cy - KEY_H / 2, cy + KEY_H / 2)
                    rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.008, kd)))[..., None]
            wd = box_sdf(x, y, WEDGE_X[0], WEDGE_X[1], WEDGE_Y[0], WEDGE_Y[1])
            rgb *= (1 - 0.25 * (1 - smoothstep(0.0, 0.010, wd)))[..., None]
            for i, cx in enumerate((-0.17, -0.15)):  # power / network status pips
                d = np.hypot(x - cx, y - 1.38)
                rgb = mix(rgb, np.array([70, 190, 110], np.float32) if i == 0 else np.array([240, 180, 60], np.float32),
                          smoothstep(0.005, 0.0035, d))
        elif tag in ('left', 'right'):
            # Ventilation louvres high on each side.
            zc = 0.095
            for vy in np.arange(1.56, 1.71, 0.025):
                sd = box_sdf(z, y, zc - 0.035, zc + 0.035, vy - 0.004, vy + 0.004, 0.004)
                rgb = mix(rgb, BLACK, smoothstep(0.001, -0.001, sd))
                h += groove(sd + 0.004, 0.010, 0.002) * (sd < 0.004)
        elif tag == 'top':
            rgb = mix(rgb, GRIME * 0.7, 0.12 + 0.12 * grime_n)
    elif part.startswith('key'):
        num = int(part[3:])
        rgb = KEY * mottle[..., None]
        if tag == 'front':
            r, c = (num - 1) // 3, (num - 1) % 3
            cx, cy = KEY_COLS[c], KEY_ROWS[r]
            h += dome(np.hypot((x - cx) / 0.026, (y - cy) / 0.021), 1.0, 0.0012)
            gw, gh = 0.011, 0.018
            col = np.floor((x - (cx - gw / 2)) / (gw / 3)).astype(int)
            row = np.floor(((cy + gh / 2) - y) / (gh / 5)).astype(int)
            ok = (col >= 0) & (col < 3) & (row >= 0) & (row < 5)
            glyph = np.array([[ch == '#' for ch in line] for line in GLYPHS[num]])
            on = np.zeros(x.shape, bool)
            on[ok] = glyph[row[ok], col[ok]]
            rgb = mix(rgb, LEGEND, on * 0.92)
            rgb = mix(rgb, KEY * 1.25, smoothstep(0.004, 0.0, np.abs(edge_distance(f, lu, lv))) * 0.4)
        else:
            rgb *= 0.82
    elif part == 'wedge':
        rgb = SLOT * mottle[..., None]
        if tag == 'top':
            sd = box_sdf(x, z, -0.105, 0.105, 0.157, 0.163, 0.002)
            rgb = mix(rgb, BLACK * 0.5, smoothstep(0.0008, -0.0008, sd))
            h += groove(sd + 0.002, 0.008, 0.003) * (sd < 0.002)
        elif tag == 'slope':
            # Lip under the slot and a light "insert card" chevron.
            rgb = mix(rgb, SLOT * 1.6, smoothstep(1.405, 1.414, y) * 0.6)
            ch_d = np.abs(np.abs(x) * 0.9 - (y - 1.355))
            chevron = (ch_d < 0.003) & (np.abs(x) < 0.022)
            rgb = mix(rgb, LEGEND * 0.85, chevron * 0.9)
    elif part == 'rack':
        rgb = RACK * mottle[..., None]
        if tag == 'front':
            for ly in LED_YS:
                yr, ym = pocket_span(ly)
                # Contact shadow where each pocket lip meets the face, and a faint
                # shadow cast down from the mouth onto the strip under the LED bar.
                inx = (x > POCKET_X[0] - 0.004) & (x < POCKET_X[1] + 0.004)
                rgb *= (1 - 0.18 * inx * (1 - smoothstep(0.0, 0.006, np.abs(y - yr))))[..., None]
                rgb *= (1 - 0.10 * inx * (y > ym) * (1 - smoothstep(ym, ym + 0.006, y)))[..., None]
                ex = np.minimum(np.abs(x - POCKET_X[0]), np.abs(x - POCKET_X[1]))
                rgb *= (1 - 0.12 * ((y > yr) & (y < ym)) * (1 - smoothstep(0.0, 0.005, ex)))[..., None]
            strip = box_sdf(x, y, 0.42, 0.58, 0.845, 0.880, 0.002)
            rgb = mix(rgb, LABEL * 1.05, smoothstep(0.001, -0.001, strip))
            h += 0.0005 * smoothstep(0.001, -0.002, strip)
            ticks = (np.abs(((x - 0.43) % 0.012) - 0.006) < 0.003) & (np.abs(y - 0.8625) < 0.004) & (x < 0.54)
            rgb = mix(rgb, BLACK * 2.0, ticks * 0.8)
            for sx in (0.395, 0.605):  # fixing screws through the rack face
                for sy in (0.83, 1.535):
                    d = np.hypot(x - sx, y - sy)
                    rgb = mix(rgb, ZINC * 0.9, smoothstep(0.0065, 0.005, d))
                    h += dome(d, 0.006, 0.0018)
        elif tag == 'back':
            for bx in (0.43, 0.57):
                sd = box_sdf(x, y, bx - 0.015, bx + 0.015, 0.84, 1.50, 0.004)
                rgb = mix(rgb, ZINC * 0.85, smoothstep(0.001, -0.001, sd))
                h += 0.0025 * smoothstep(0.002, -0.004, sd)
                for by in (0.88, 1.46):
                    d = np.hypot(x - bx, y - by)
                    h += dome(d, 0.007, 0.002)
                    rgb = mix(rgb, STEEL, smoothstep(0.0075, 0.006, d))
        elif tag in ('top', 'chamfer'):
            rgb = mix(rgb, GRIME * 0.75, 0.06 + 0.06 * grime_n)
    elif part.startswith('pocket'):
        i = int(part[6:])
        yr, ym = pocket_span(LED_YS[i])
        rgb = RACK * 1.07 * mottle[..., None]  # pressed sheet, a touch lighter than the body
        if tag == 'slant':
            # Rolled top lip, and a card-holder window with a printed number strip.
            rgb = mix(rgb, RACK * 1.25, smoothstep(ym - 0.006, ym - 0.002, y) * 0.7)
            h -= 0.0012 * smoothstep(ym - 0.004, ym - 0.0005, y) * (1 - smoothstep(ym - 0.0015, ym, y))
            win = box_sdf(x, y, 0.47, 0.53, yr + 0.016, yr + 0.036, 0.002)
            rgb = mix(rgb, LABEL * 1.08, smoothstep(0.0008, -0.0008, win))
            rgb = mix(rgb, BLACK * 0.8, (1 - smoothstep(0.0, 0.0012, np.abs(win))) * 0.8)
            h += groove(win, 0.002, 0.0008)
            gx = np.abs(x - 0.5) < 0.004 + 0.003 * (i % 2)
            num = gx & (np.abs(y - (yr + 0.026)) < 0.005) & (np.abs(((x - 0.5) % 0.004) - 0.002) < 0.0012)
            rgb = mix(rgb, BLACK * 1.5, num * 0.85)
        elif tag == 'mouth':
            # Looking into the pocket: sheet edge at the front, cards standing inside.
            depth = POCKET_TIP_Z - z  # 0 at the lip, growing toward the rack face
            rgb = mix(rgb, BLACK * 1.2, smoothstep(0.0015, 0.003, depth))
            cards = (depth > 0.006) & (depth < 0.020) & (np.abs(x - 0.5) < 0.085 + 0.004 * (i % 2))
            rgb = mix(rgb, CARD * (0.92 + 0.04 * (i % 3)), cards * 0.95)
            lines = cards & (np.abs(((depth - 0.006) % 0.0035) - 0.00175) < 0.0004)
            rgb = mix(rgb, CARD * 0.7, lines * 0.8)
            h -= 0.002 * smoothstep(0.0015, 0.004, depth)
        else:
            rgb *= 0.9
    else:
        rgb = np.broadcast_to(np.array([255, 0, 255], np.float32), x.shape + (3,)).copy()

    # Softened edges on every face: a narrow rolled margin, a hair lighter where paint wears.
    ed = edge_distance(f, lu, lv)
    roll = 1 - smoothstep(0.0, EDGE_R, np.maximum(ed, 0))
    h -= EDGE_DROP * roll ** 2
    rgb = rgb * (1 + 0.07 * roll)[..., None]
    return np.clip(rgb, 0, 255), h


def build_textures():
    colour = np.zeros((TEX, TEX, 3), np.float32)
    normal = np.zeros((TEX, TEX, 3), np.float32)
    colour[...] = 128
    normal[..., 2] = 1.0
    s = SUPERSAMPLE
    for f in FACES:
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
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    return scene


def to_blender(p):
    q = np.asarray(p) - GROUP_OFFSET  # GLB frame (three.js axes)
    return (float(q[0]), float(-q[2]), float(q[1]))


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
    # Every face was wound outward in three.js space; the axis swap is a rotation, so it holds.
    for face, f in zip(bm.faces, FACES):
        expect = to_blender(f['n'] + GROUP_OFFSET)
        assert np.dot(np.array(face.normal), np.array(expect)) > 0.99, (f['part'], f['tag'])
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.58

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-access-node-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-access-node-body-normal'
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
    pts = np.concatenate([f['pts'] for f in FACES]) - GROUP_OFFSET
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    for axis, (elo, ehi) in enumerate(EXPECTED_BOUNDS):
        assert abs(lo[axis] - elo) < 1e-6 and abs(hi[axis] - ehi) < 1e-6, (axis, lo[axis], hi[axis])
    tris = triangle_count()
    assert tris <= MAX_TRIANGLES, tris
    return tris


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-access-node-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    build_geometry()
    tris = check_bounds()
    density = layout()

    scene = reset_scene()
    stage = tempfile.mkdtemp(prefix='yard-access-node-body-')
    try:
        colour_px, normal_px = build_textures()
        colour_path = os.path.join(stage, 'yard-access-node-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-access-node-body-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'yard-access-node-body-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'yard-access-node-body-normal-stage')

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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-access-node-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_ACCESS_NODE_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes '
          f'{tris} triangles, {len(FACES)} faces, {density * 1000:.2f} mm/texel')


main()
