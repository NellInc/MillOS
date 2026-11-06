"""Yard fuel island body (world-yard-fuel-island-body), built from scratch in headless Blender.

What it builds
--------------
The fleet diesel island in the receiving yard (TruckBay.tsx FuelIsland, the GLB
placed at the island group's origin). Delivered at its final metric size,
6.00 W x 6.25 H x 10.00 D m, origin at the ground centre, three.js +Z = front
(the sign board faces +Z). Everything is authored in the island group's frame,
which is also the GLB frame, so the runtime anchors can be read off directly:

* island curb   yellow, x +-1.5, z +-4, y 0-0.30. Its four plan corners are cut
                0.45 m at 45 degrees (bevelled noses); the noses carry painted
                black/yellow hazard stripes.
* 2 dispensers  at z +-2: a slate kick plinth that flares out onto the curb
                (sunk 2 cm into it), a white body x +-0.40, z +-0.30, y 0.42-1.79
                and a dark head x +-0.44, z +-0.34, y 1.78-2.00 that overhangs
                the body on all four sides (a stepped head).
* canopy        top y 4.60 at the full 6 x 10 m; fascia faces that lean in to
                a lower edge at y 4.20, a sloped return up to a recessed soffit
                at y 4.42 (x +-2.70, z +-4.70), so the underside has a visible
                fascia drop instead of a flat slab.
* 4 columns     slate, radius 0.10, pentagonal and smooth-shaded, at
                (+-2.5, +-4), from y 0 into the canopy slab (top y 4.47). Each
                stands on a 0.34 m square base plate, 3 cm thick.
* sign board    dark, x +-1.5, y 4.56-6.25, z +-0.10; its foot is sunk 4 cm
                into the canopy top, so it stands on the roof with no gap.

Runtime anchors kept (TruckBay.tsx FuelIsland): each dispenser's +x face is
flat at x 0.40 across y 0.42-1.79, carrying the emissive screen box (x 0.40-0.42,
y 1.2-1.6, z +-0.25 about the pump centre) inside a painted dark bezel; the sign
front face is flat at z 0.10 over x +-1.5, y 4.6-6.25 for the DIESEL (y 5.8) and
FLEET ONLY (y 5.3) text at z 0.11, with a painted steel frame kept outside the
text. Extreme faces stay full so the bounds hold: canopy top edges x +-3.0 and
z +-5.0, column feet and curb at y 0, sign top y 6.25.

The contract allows 564 render vertices (188 triangles); this mesh uses 188.
Faces nobody can see (undersides on the ground, the sign foot and column tops
inside the slab) are not built. Detail below that budget is carried by the two
allowed textures, which share one atlas UV layout laid out per face, painted
from part-local position so features run across faces. The two dispensers, the
four columns and the four base plates are identical by translation, so each set
shares one atlas region:

* base colour: chipped safety-yellow curb paint with oil stains by the pumps and
  hazard stripes on the noses; dispenser door seams, louvres, grade buttons,
  display bezels, nozzle holsters with a hanging hose and a lit band in the head;
  a membrane roof with ribs and streaks, a green fascia band and panel joints;
  a soffit with panel joints, recessed luminaires and steel fixing plates where
  the columns enter; galvanised collars at the column foot and head; bolted base
  plates; a steel frame and back stiffeners on the sign.
* tangent-space normal map from height fields in metres: softened edges on
  every face, grooves for seams and joints, domed bolts, the raised hose and
  the collar steps.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-fuel-island-body.py -- <out.glb>

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

NODE_NAME = 'Yard-fuel-island-bodyBody'
MESH_NAME = 'yard-fuel-island-body-mesh'
MATERIAL_NAME = 'yard-fuel-island-body-surface'
SCENE_NAME = 'MillOS_World_Yard-fuel-island-body'

MAX_TRIANGLES = 188
EXPECTED_BOUNDS = ((-3.0, 3.0), (0.0, 6.25), (-5.0, 5.0))  # GLB x, y, z

TEX = 512
SUPERSAMPLE = 2
GUTTER = 3
COLOUR_QUALITY = 78
NORMAL_QUALITY = 70
MAX_SLOPE = 1.0
EDGE_R = 0.025  # metres: softened edge radius painted into the normal map
EDGE_DROP = 0.004

# Paint, sRGB 0-255.
YELLOW = np.array([238, 180, 38], np.float32)     # #fbbf24, a touch down so sun does not clip it
WHITE = np.array([224, 230, 237], np.float32)     # #e2e8f0
ROOF = np.array([214, 219, 224], np.float32)
SOFFIT = np.array([206, 211, 218], np.float32)
SLATE = np.array([100, 116, 139], np.float32)     # #64748b
PLINTH = np.array([71, 85, 105], np.float32)
DARK = np.array([31, 41, 55], np.float32)         # #1f2937
HOUSING = np.array([55, 65, 81], np.float32)      # #374151
FRAME = np.array([82, 92, 106], np.float32)
GREEN = np.array([40, 150, 88], np.float32)
LENS = np.array([214, 232, 220], np.float32)
LAMP = np.array([244, 246, 248], np.float32)
BLACK = np.array([16, 18, 22], np.float32)
RUBBER = np.array([30, 31, 34], np.float32)
STEEL = np.array([160, 166, 172], np.float32)
ZINC = np.array([148, 152, 156], np.float32)
CONCRETE = np.array([150, 147, 140], np.float32)
GRIME = np.array([96, 90, 80], np.float32)
OIL = np.array([46, 42, 38], np.float32)

# Geometry (GLB frame, metres).
CURB = dict(x=1.5, z=4.0, h=0.30, cut=0.45)
PUMP_ZS = (-2.0, 2.0)
PLINTH_FOOT = dict(x=0.47, z=0.37, y=0.28)
BODY = dict(x=0.40, z=0.30, y0=0.42, y1=1.79)
HEAD = dict(x=0.44, z=0.34, y0=1.78, y1=2.00)
SCREEN = dict(y0=1.2, y1=1.6, z=0.25)  # runtime emissive screen on the +x face
CANOPY = dict(x=3.0, z=5.0, top=4.60, lip_y=4.20, lip_in=0.04, soffit_y=4.42, soffit_x=2.70, soffit_z=4.70)
COLUMNS = ((-2.5, -4.0), (-2.5, 4.0), (2.5, -4.0), (2.5, 4.0))
COLUMN_R = 0.10
COLUMN_SIDES = 5
COLUMN_TOP = 4.47
PLATE = dict(half=0.17, h=0.03)
SIGN = dict(x=1.5, y0=4.56, y1=6.25, z=0.10)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


_LATTICE = np.random.default_rng(20261106).random((64, 64, 64)).astype(np.float32)


def noise3(p, cell, offset=0):
    """Seeded trilinear value noise over metres (continuous across faces)."""
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


def shade(rgb, factor):
    return rgb * np.asarray(factor)[..., None]


def box_sdf(a, b, lo_a, hi_a, lo_b, hi_b, r=0.0):
    """Signed distance to a (rounded) rectangle in a 2D plane; negative inside."""
    ca, cb = (lo_a + hi_a) / 2, (lo_b + hi_b) / 2
    ha, hb = (hi_a - lo_a) / 2 - r, (hi_b - lo_b) / 2 - r
    qa, qb = np.abs(a - ca) - ha, np.abs(b - cb) - hb
    outside = np.sqrt(np.maximum(qa, 0) ** 2 + np.maximum(qb, 0) ** 2)
    return outside + np.minimum(np.maximum(qa, qb), 0) - r


def inside(d, soft=0.004):
    return smoothstep(soft, -soft, d)


def groove(d, width, depth):
    """Height of a groove centred on the zero line of distance field d."""
    return -depth * (1 - smoothstep(0, width / 2, np.abs(d)))


def dome(d, radius, height):
    t = np.clip(1 - (d / radius) ** 2, 0, 1)
    return height * np.sqrt(t)


def seg_dist(a, b, p0, p1):
    """Distance from points (a, b) to the segment p0-p1 in a 2D plane."""
    ea, eb = p1[0] - p0[0], p1[1] - p0[1]
    t = np.clip(((a - p0[0]) * ea + (b - p0[1]) * eb) / (ea * ea + eb * eb), 0, 1)
    return np.hypot(a - p0[0] - t * ea, b - p0[1] - t * eb)


# ---------------------------------------------------------------- geometry
FACES = []  # dicts: pts (k,3) GLB frame, part, tag, n, density, share, offset, smooth


def add_face(pts, part, tag, outward, density=1.0, share=None, offset=(0, 0, 0), smooth=False):
    pts = np.array(pts, dtype=np.float64)
    n = np.zeros(3)
    for i in range(len(pts)):  # Newell normal
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    if np.dot(n, outward) < 0:
        pts = pts[::-1]
        n = -n
    n /= np.linalg.norm(n)
    FACES.append({'pts': pts, 'part': part, 'tag': tag, 'n': n, 'density': density,
                  'share': share, 'offset': np.array(offset, np.float64), 'smooth': smooth})


def ring_faces(lower, upper, centre, part, tag, density, share_prefix=None, offset=(0, 0, 0), smooth=False):
    """Quads joining two closed rings of equal length; outward is away from centre (x, z)."""
    k = len(lower)
    for i in range(k):
        j = (i + 1) % k
        quad = [lower[i], lower[j], upper[j], upper[i]]
        mid = np.mean(np.array(quad), axis=0)
        outward = np.array([mid[0] - centre[0], 0.0, mid[2] - centre[2]])
        add_face(quad, part, f'{tag}{i}', outward, density,
                 share=None if share_prefix is None else f'{share_prefix}{i}', offset=offset, smooth=smooth)


def rect_ring(cx, cz, hx, hz, y):
    # Order: -x-z, +x-z, +x+z, -x+z (faces 0:-z, 1:+x, 2:+z, 3:-x).
    return [(cx - hx, y, cz - hz), (cx + hx, y, cz - hz), (cx + hx, y, cz + hz), (cx - hx, y, cz + hz)]


def build_curb():
    x, z, h, c = CURB['x'], CURB['z'], CURB['h'], CURB['cut']
    plan = [(x - c, -z), (x, -z + c), (x, z - c), (x - c, z), (-x + c, z), (-x, z - c), (-x, -z + c), (-x + c, -z)]
    add_face([(px, h, pz) for px, pz in plan], 'curb', 'top', (0, 1, 0))
    for i in range(8):
        a, b = plan[i], plan[(i + 1) % 8]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        add_face([(a[0], 0, a[1]), (b[0], 0, b[1]), (b[0], h, b[1]), (a[0], h, a[1])],
                 'curb', 'nose' if abs(mid[1]) > z - c - 1e-6 else 'side', (mid[0], 0, mid[1]))


def build_pump(cz, share):
    off = (0.0, 0.0, cz)
    foot = rect_ring(0, cz, PLINTH_FOOT['x'], PLINTH_FOOT['z'], PLINTH_FOOT['y'])
    base = rect_ring(0, cz, BODY['x'], BODY['z'], BODY['y0'])
    # The plinth flare is sunk 2 cm into the curb top; its slope runs 0.30 -> 0.42 visibly.
    ring_faces(foot, base, (0, 0, cz), 'plinth', 'side', 2.0, share and f'{share}-plinth', off)
    top = rect_ring(0, cz, BODY['x'], BODY['z'], BODY['y1'])
    ring_faces(base, top, (0, 0, cz), 'body', 'side', 2.2, share and f'{share}-body', off)
    hb = rect_ring(0, cz, HEAD['x'], HEAD['z'], HEAD['y0'])
    ht = rect_ring(0, cz, HEAD['x'], HEAD['z'], HEAD['y1'])
    ring_faces(hb, ht, (0, 0, cz), 'head', 'side', 2.2, share and f'{share}-head', off)
    add_face(ht, 'head', 'top', (0, 1, 0), 2.0, share and f'{share}-headtop', off)
    add_face(hb, 'head', 'bottom', (0, -1, 0), 1.0, share and f'{share}-headbot', off)


def build_canopy():
    C = CANOPY
    top = rect_ring(0, 0, C['x'], C['z'], C['top'])
    lip = rect_ring(0, 0, C['x'] - C['lip_in'], C['z'] - C['lip_in'], C['lip_y'])
    sof = rect_ring(0, 0, C['soffit_x'], C['soffit_z'], C['soffit_y'])
    add_face(top, 'canopy', 'top', (0, 1, 0), 0.42)
    ring_faces(lip, top, (0, 0, 0), 'canopy', 'fascia', 1.2)
    # The return runs from the fascia's lower edge up and in to the soffit: it faces down and in.
    for i in range(4):
        j = (i + 1) % 4
        quad = [lip[i], lip[j], sof[j], sof[i]]
        mid = np.mean(np.array(quad), axis=0)
        add_face(quad, 'canopy', f'return{i}', (-mid[0], -1.0, -mid[2]), 1.0)
    add_face(sof, 'canopy', 'soffit', (0, -1, 0), 0.75)


def build_column(cx, cz):
    off = (cx, 0.0, cz)
    angles = [2 * math.pi * k / COLUMN_SIDES + math.pi / 2 for k in range(COLUMN_SIDES)]
    lower = [(cx + COLUMN_R * math.cos(a), 0.0, cz + COLUMN_R * math.sin(a)) for a in angles]
    upper = [(cx + COLUMN_R * math.cos(a), COLUMN_TOP, cz + COLUMN_R * math.sin(a)) for a in angles]
    ring_faces(lower, upper, (cx, 0, cz), 'column', 'shaft', 1.6, 'column-shaft', off, smooth=True)
    p = PLATE['half']
    pl = rect_ring(cx, cz, p, p, 0.0)
    pt = rect_ring(cx, cz, p, p, PLATE['h'])
    ring_faces(pl, pt, (cx, 0, cz), 'plate', 'side', 1.6, 'plate-side', off)
    add_face(pt, 'plate', 'top', (0, 1, 0), 2.0, 'plate-top', off)


def build_sign():
    S = SIGN
    x0, x1, y0, y1, z0, z1 = -S['x'], S['x'], S['y0'], S['y1'], -S['z'], S['z']
    add_face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], 'sign', 'front', (0, 0, 1), 1.4)
    add_face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], 'sign', 'back', (0, 0, -1), 1.0)
    add_face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], 'sign', 'top', (0, 1, 0), 1.4)
    add_face([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], 'sign', 'end', (-1, 0, 0), 1.4)
    add_face([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], 'sign', 'end', (1, 0, 0), 1.4)


def build_geometry():
    build_curb()
    for i, cz in enumerate(PUMP_ZS):
        build_pump(cz, 'pump')
    build_canopy()
    for cx, cz in COLUMNS:
        build_column(cx, cz)
    build_sign()


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


def owners():
    """Faces that own an atlas region: the first of each share key, and every unshared face."""
    seen, out = set(), []
    for f in FACES:
        if f['share'] is None:
            out.append(f)
        elif f['share'] not in seen:
            seen.add(f['share'])
            out.append(f)
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
    density = 0.008
    while not pack(density):
        density *= 1.02
    # Shared faces reuse their owner's region; a pure translation keeps U, V and the mapping.
    first = {}
    for f in FACES:
        if f['share'] is None:
            continue
        if f['share'] not in first:
            first[f['share']] = f
            continue
        o = first[f['share']]
        assert np.allclose(o['U'], f['U']) and np.allclose(o['V'], f['V']), f['share']
        f['rect'], f['d'] = o['rect'], o['d']
        f['origin'] = o['origin'] + (f['offset'] - o['offset'])
    return density


# ---------------------------------------------------------------- painting
def edge_distance(f, lu, lv):
    """Distance (metres) from a texel to the face's polygon boundary, in the face plane."""
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


def paint_curb(f, P, ed):
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    tag = f['tag']
    mottle = 1.0 + (noise3(P, 0.5) - 0.5) * 0.06 + (noise3(P, 0.12, 3) - 0.5) * 0.03
    rgb = shade(YELLOW, mottle)
    h = np.zeros(x.shape)
    chip = noise3(P, 0.06, 7)
    if tag == 'top':
        # Diesel stains round each dispenser, scuffed paint along the long edges.
        for pz in PUMP_ZS:
            d = box_sdf(x, z, -PLINTH_FOOT['x'], PLINTH_FOOT['x'], pz - PLINTH_FOOT['z'], pz + PLINTH_FOOT['z'], 0.05)
            rough = d + (noise3(P, 0.22, 9) - 0.5) * 0.35
            stain = (1 - smoothstep(0.05, 0.40, rough))
            rgb = mix(rgb, OIL, stain * 0.35)
            rgb = shade(rgb, 1 - 0.30 * (1 - smoothstep(0.0, 0.06, d)))  # contact shadow at the plinth
        wear = (1 - smoothstep(0.0, 0.14, ed)) * smoothstep(0.55, 0.8, noise3(P, 0.12, 11))
        rgb = mix(rgb, CONCRETE, wear * 0.6)
        rgb = mix(rgb, GRIME, smoothstep(0.6, 0.9, noise3(P, 0.7, 13)) * 0.10)
        # Anchor bolts of the dispensers' frames, either side of each plinth.
        for pz in PUMP_ZS:
            for bx in (-0.62, 0.62):
                for bz in (pz - 0.25, pz + 0.25):
                    dd = np.hypot(x - bx, z - bz)
                    rgb = mix(rgb, ZINC * 0.8, smoothstep(0.035, 0.028, dd))
                    h += dome(dd, 0.032, 0.006)
    else:
        if tag == 'nose':
            # Black/yellow hazard stripes, 45 degrees, on the bevelled noses.
            s = (np.abs(x) + y * 1.0 + np.abs(z)) / 0.24
            stripe = smoothstep(0.42, 0.5, np.abs((s % 1.0) - 0.5))
            rgb = mix(rgb, BLACK * 1.6, stripe * 0.92)
        rgb = mix(rgb, GRIME, (1 - smoothstep(0.0, 0.16, y)) * (0.35 + 0.3 * noise3(P, 0.1, 5)))
    # Chipped arrises show the concrete under the paint.
    rgb = mix(rgb, CONCRETE, (1 - smoothstep(0.0, 0.03, ed)) * smoothstep(0.5, 0.7, chip) * 0.8)
    return rgb, h


def paint_pump(f, P, ed):
    """P is pump-local: x across the island, z along it, y up."""
    part, tag = f['part'], f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    mottle = 1.0 + (noise3(P, 0.12) - 0.5) * 0.06 + (noise3(P, 0.03, 3) - 0.5) * 0.04
    h = np.zeros(x.shape)
    n = f['n']
    on_x = abs(n[0]) > 0.7
    across = z if on_x else x  # horizontal coordinate on the face
    half = BODY['z'] if on_x else BODY['x']
    if part == 'plinth':
        rgb = shade(PLINTH, mottle)
        rgb = mix(rgb, GRIME, (1 - smoothstep(0.30, 0.40, y)) * (0.4 + 0.3 * noise3(P, 0.05, 5)))
        scuff = smoothstep(0.6, 0.8, noise3(P, 0.04, 8))
        rgb = mix(rgb, STEEL * 0.8, scuff * 0.4)
        return rgb, h
    if part == 'head':
        rgb = shade(HOUSING, mottle)
        if tag == 'top':
            rgb = mix(rgb, GRIME * 0.7, 0.15 + 0.15 * noise3(P, 0.08, 4))
        elif tag == 'bottom':
            rgb = shade(rgb, 0.8)
        else:
            # Lit brand band round the head with a green rule under it.
            band = inside(np.abs(y - 1.895) - 0.04, 0.003)
            rgb = mix(rgb, LENS, band)
            h += 0.0015 * band
            rgb = mix(rgb, GREEN, inside(np.abs(y - 1.835) - 0.012, 0.003))
        return rgb, h

    rgb = shade(WHITE, mottle)
    # Splash grime at the foot, a slate kick band, and the green diesel band under the head.
    rgb = mix(rgb, GRIME, (1 - smoothstep(0.42, 0.62, y)) * (0.22 + 0.2 * noise3(P, 0.06, 6)))
    rgb = mix(rgb, GREEN, inside(np.abs(y - 1.715) - 0.022, 0.003))
    if on_x:
        # Lower service door: seam, louvres and a lock.
        door = box_sdf(across, y, -0.25, 0.25, 0.52, 1.00, 0.015)
        h += groove(door, 0.02, 0.004)
        rgb = shade(rgb, 1 - 0.45 * (1 - smoothstep(0.0, 0.008, np.abs(door))))
        for ly in (0.62, 0.68, 0.74):
            sd = box_sdf(across, y, -0.16, 0.16, ly - 0.012, ly + 0.012, 0.008)
            rgb = mix(rgb, DARK, inside(sd, 0.003) * 0.85)
            h += groove(sd + 0.01, 0.03, 0.004) * (sd < 0.01)
        d = np.hypot(across - 0.19, y - 0.90)
        rgb = mix(rgb, STEEL, smoothstep(0.022, 0.016, d))
        h += dome(d, 0.02, 0.003)
        # Display bezel round the runtime screen (+x) or a dark second display (-x).
        bez = box_sdf(across, y, -SCREEN['z'] - 0.035, SCREEN['z'] + 0.035, SCREEN['y0'] - 0.04, SCREEN['y1'] + 0.04, 0.02)
        rgb = mix(rgb, DARK, inside(bez, 0.003))
        h += 0.002 * inside(bez, 0.004)
        if n[0] < 0:
            disp = box_sdf(across, y, -0.22, 0.22, 1.24, 1.58, 0.01)
            rgb = mix(rgb, np.array([38, 58, 50], np.float32), inside(disp, 0.003))
            for row, ry in enumerate((1.50, 1.41, 1.32)):
                seg = inside(box_sdf(across, y, -0.17, 0.05 + 0.04 * row, ry - 0.018, ry + 0.018, 0.004), 0.002)
                rgb = mix(rgb, np.array([70, 120, 92], np.float32), seg * 0.8)
        # Grade buttons under the display.
        for k, bz in enumerate((-0.14, 0.0, 0.14)):
            bd = box_sdf(across, y, bz - 0.045, bz + 0.045, 1.065, 1.115, 0.012)
            col = GREEN if k == 0 else HOUSING
            rgb = mix(rgb, col, inside(bd, 0.003))
            h += 0.003 * inside(bd + 0.004, 0.004)
    else:
        # Nozzle holster with the hose hanging in a loop from its outlet under the head.
        hol = box_sdf(across, y, -0.13, 0.07, 1.18, 1.46, 0.02)
        rgb = shade(rgb, 1 - 0.35 * (1 - smoothstep(0.0, 0.025, hol)))
        rgb = mix(rgb, DARK, inside(hol, 0.003))
        h += 0.006 * inside(hol + 0.006, 0.006)
        noz = box_sdf(across, y, -0.07, 0.01, 1.22, 1.42, 0.02)
        rgb = mix(rgb, BLACK, inside(noz, 0.003))
        h += 0.004 * inside(noz, 0.006)
        rgb = mix(rgb, GREEN, inside(box_sdf(across, y, -0.13, 0.07, 1.50, 1.56, 0.01), 0.003))
        d1 = seg_dist(across, y, (0.28, 0.80), (0.28, 1.70))
        d2 = seg_dist(across, y, (-0.03, 0.80), (-0.03, 1.18))
        arc = np.where(y < 0.80, np.abs(np.hypot(across - 0.125, y - 0.80) - 0.155), np.inf)
        dh = np.minimum(np.minimum(d1, d2), arc)
        hose = dh < 0.019
        rgb = shade(rgb, 1 - 0.30 * (1 - smoothstep(0.019, 0.05, dh)))
        rgb = mix(rgb, RUBBER, smoothstep(0.021, 0.017, dh))
        rgb = mix(rgb, RUBBER * 2.2, smoothstep(0.009, 0.0, np.abs(dh - 0.006)) * hose * 0.5)
        h += dome(dh, 0.019, 0.010)
        d = np.hypot(across - 0.28, y - 1.70)  # hose outlet swivel
        rgb = mix(rgb, STEEL, smoothstep(0.03, 0.024, d))
        h += dome(d, 0.028, 0.006)
    # Side seams where the body panels meet the corner posts.
    for s in (-1, 1):
        sd = across - s * (half - 0.03)
        h += groove(sd, 0.012, 0.0025)
        rgb = shade(rgb, 1 - 0.18 * (1 - smoothstep(0.0, 0.006, np.abs(sd))))
    return rgb, h


def paint_canopy(f, P, ed):
    tag = f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    h = np.zeros(x.shape)
    mottle = 1.0 + (noise3(P, 0.6) - 0.5) * 0.06 + (noise3(P, 0.15, 3) - 0.5) * 0.04
    if tag == 'top':
        rgb = shade(ROOF, 1.0 + (noise3(P, 1.2) - 0.5) * 0.05)
        # Standing-seam ribs along the length; a light, even film of dirt toward the edges.
        rib = np.abs(((x + 3.0) % 1.0) - 0.5) - 0.44
        rgb = shade(rgb, 1 + 0.05 * inside(rib, 0.03))
        h += 0.008 * inside(rib, 0.04)
        edge_band = 1 - smoothstep(0.0, 0.9, ed)
        rgb = mix(rgb, GRIME, (0.04 + 0.12 * edge_band) * (0.6 + 0.4 * noise3(P, 0.9, 2)))
        return rgb, h
    if tag.startswith('fascia'):
        rgb = shade(WHITE, mottle)
        along = x if abs(f['n'][2]) > 0.7 else z
        rgb = mix(rgb, GREEN, inside(np.abs(y - 4.30) - 0.035, 0.004))
        rgb = mix(rgb, SLATE, inside(np.abs(y - 4.545) - 0.012, 0.004) * 0.8)
        joint = np.abs(((along + 0.625) % 1.25) - 0.625)
        h += groove(joint, 0.025, 0.004)
        rgb = shade(rgb, 1 - 0.20 * (1 - smoothstep(0.0, 0.012, joint)))
        rgb = mix(rgb, GRIME, (1 - smoothstep(4.20, 4.32, y)) * 0.18 * (0.5 + noise3(P, 0.3, 4)))
        return rgb, h
    if tag.startswith('return'):
        rgb = shade(SOFFIT * 0.94, mottle)
        rgb = shade(rgb, 1 - 0.12 * smoothstep(4.25, 4.42, y))  # darker into the recess
        return rgb, h
    # Soffit.
    rgb = shade(SOFFIT, mottle)
    joint = np.abs(((z + 0.5) % 1.0) - 0.5)
    h += groove(joint, 0.03, 0.004)
    rgb = shade(rgb, 1 - 0.14 * (1 - smoothstep(0.0, 0.014, joint)))
    rim = box_sdf(x, z, -CANOPY['soffit_x'], CANOPY['soffit_x'], -CANOPY['soffit_z'], CANOPY['soffit_z'])
    rgb = shade(rgb, 1 - 0.18 * (1 - smoothstep(-0.35, 0.0, rim)))  # recess occlusion at the edges
    for lx in (-1.25, 1.25):
        for lz in (-3.0, -1.0, 1.0, 3.0):
            fd = box_sdf(x, z, lx - 0.24, lx + 0.24, lz - 0.48, lz + 0.48, 0.03)
            rgb = mix(rgb, FRAME, inside(fd, 0.004))
            h -= 0.004 * inside(fd, 0.006)
            ld = box_sdf(x, z, lx - 0.19, lx + 0.19, lz - 0.43, lz + 0.43, 0.02)
            rgb = mix(rgb, LAMP, inside(ld, 0.004))
            h += 0.002 * inside(ld, 0.004)
    for cx, cz in COLUMNS:
        # Steel fixing plate where each column enters the slab, bolted, with a contact shadow.
        pd = box_sdf(x, z, cx - 0.17, cx + 0.17, cz - 0.17, cz + 0.17, 0.01)
        rgb = shade(rgb, 1 - 0.25 * (1 - smoothstep(0.0, 0.08, pd)))
        rgb = mix(rgb, ZINC, inside(pd, 0.004))
        h += 0.008 * inside(pd, 0.006)
        for bx in (-0.12, 0.12):
            for bz in (-0.12, 0.12):
                d = np.hypot(x - cx - bx, z - cz - bz)
                rgb = mix(rgb, STEEL * 0.9, smoothstep(0.024, 0.018, d))
                h += dome(d, 0.022, 0.005)
        cd = np.hypot(x - cx, z - cz)
        rgb = shade(rgb, 1 - 0.35 * (1 - smoothstep(0.10, 0.16, cd)))
    return rgb, h


def paint_column(f, P, ed):
    """P is column-local (axis at x = z = 0)."""
    part, tag = f['part'], f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    h = np.zeros(x.shape)
    if part == 'plate':
        rgb = shade(ZINC, 1.0 + (noise3(P, 0.05) - 0.5) * 0.12)
        rgb = mix(rgb, GRIME, 0.25 + 0.25 * noise3(P, 0.04, 3))
        if tag == 'top':
            for bx in (-0.12, 0.12):
                for bz in (-0.12, 0.12):
                    d = np.hypot(x - bx, z - bz)
                    rgb = mix(rgb, STEEL, smoothstep(0.024, 0.018, d))
                    h += dome(d, 0.022, 0.006)
            cd = np.hypot(x, z)
            rgb = shade(rgb, 1 - 0.4 * (1 - smoothstep(0.10, 0.14, cd)))
        else:
            rgb = shade(rgb, 0.85)
        return rgb, h
    rgb = shade(SLATE, 1.0 + (noise3(P, 0.25) - 0.5) * 0.08 + (noise3(P, 0.05, 3) - 0.5) * 0.04)
    # Galvanised collars at the foot and the head, each with a small step.
    foot = y < 0.26
    head = y > 4.24
    rgb = mix(rgb, ZINC * 0.85, foot | head)
    h += 0.004 * (smoothstep(0.27, 0.25, y) + smoothstep(4.23, 4.25, y))
    rgb = shade(rgb, 1 - 0.22 * (smoothstep(0.03, 0.0, np.abs(y - 0.26)) + smoothstep(0.03, 0.0, np.abs(y - 4.24))))
    rgb = mix(rgb, GRIME, (1 - smoothstep(0.03, 0.55, y)) * (0.35 + 0.3 * noise3(P, 0.05, 5)))
    rgb = shade(rgb, 1 - 0.30 * smoothstep(4.30, 4.42, y))  # into the soffit's shade
    return rgb, h


def paint_sign(f, P, ed):
    tag = f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    h = np.zeros(x.shape)
    rgb = shade(DARK, 1.0 + (noise3(P, 0.3) - 0.5) * 0.10 + (noise3(P, 0.05, 3) - 0.5) * 0.05)
    y_lo = CANOPY['top']
    if tag in ('front', 'back'):
        inner = box_sdf(x, y, -SIGN['x'] + 0.07, SIGN['x'] - 0.07, y_lo + 0.07, SIGN['y1'] - 0.07)
        frame = inner > 0
        rgb = mix(rgb, FRAME, frame)
        h += groove(inner, 0.02, 0.003)
        rgb = shade(rgb, 1 - 0.3 * (1 - smoothstep(0.0, 0.012, np.abs(inner))))
        for bx in (-SIGN['x'] + 0.035, SIGN['x'] - 0.035):
            for by in (y_lo + 0.035, SIGN['y1'] - 0.035, (y_lo + SIGN['y1']) / 2):
                d = np.hypot(x - bx, y - by)
                rgb = mix(rgb, STEEL * 0.8, smoothstep(0.016, 0.012, d))
                h += dome(d, 0.015, 0.004)
        if tag == 'back':
            for sy in (4.95, 5.85):
                sd = np.abs(y - sy) - 0.05
                rgb = mix(rgb, FRAME * 0.95, inside(sd, 0.004) * (np.abs(x) < SIGN['x'] - 0.07))
                h += 0.006 * inside(sd, 0.006)
            for bx in (-1.0, 0.0, 1.0):
                for sy in (4.95, 5.85):
                    d = np.hypot(x - bx, y - sy)
                    rgb = mix(rgb, STEEL * 0.8, smoothstep(0.018, 0.013, d))
                    h += dome(d, 0.016, 0.004)
            rgb = mix(rgb, GRIME * 0.6, (1 - smoothstep(y_lo, y_lo + 0.4, y)) * 0.3)
    else:
        rgb = mix(rgb, FRAME, 1.0)
        rgb = mix(rgb, GRIME * 0.7, 0.15 * noise3(P, 0.1, 3))
    rgb = shade(rgb, 1 - 0.30 * (1 - smoothstep(y_lo, y_lo + 0.06, y)))  # roof contact shadow
    return rgb, h


def paint(f, P, lu, lv):
    part = f['part']
    ed = edge_distance(f, lu, lv)
    Pl = P - f['offset']
    if part == 'curb':
        rgb, h = paint_curb(f, Pl, ed)
    elif part in ('plinth', 'body', 'head'):
        rgb, h = paint_pump(f, Pl, ed)
    elif part == 'canopy':
        rgb, h = paint_canopy(f, Pl, ed)
    elif part in ('column', 'plate'):
        rgb, h = paint_column(f, Pl, ed)
    elif part == 'sign':
        rgb, h = paint_sign(f, Pl, ed)
    else:
        rgb, h = np.broadcast_to(np.array([255, 0, 255], np.float32), P.shape).copy(), np.zeros(P.shape[:-1])
    # Softened edges on every face: a rolled margin, a hair lighter where paint wears.
    if not f['smooth']:
        roll = 1 - smoothstep(0.0, EDGE_R, np.maximum(ed, 0))
        h = h - EDGE_DROP * roll ** 2
        rgb = shade(rgb, 1 + 0.08 * roll)
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
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    return scene


def to_blender(p):
    return (float(p[0]), float(-p[2]), float(p[1]))


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    shared = {}  # smooth faces weld their vertices so the shading runs round the column
    faces = []
    for f in FACES:
        verts = []
        for p in f['pts']:
            if f['smooth']:
                key = (f['part'], tuple(np.round(p, 6)))
                if key not in shared:
                    shared[key] = bm.verts.new(to_blender(p))
                verts.append(shared[key])
            else:
                verts.append(bm.verts.new(to_blender(p)))
        face = bm.faces.new(verts)
        face.smooth = f['smooth']
        rx, ry, _, _ = f['rect']
        for loop, p in zip(face.loops, f['pts']):
            lu = np.dot(p - f['origin'], f['U'])
            lv = np.dot(p - f['origin'], f['V'])
            u = (rx + GUTTER + lu / f['d']) / TEX
            v = (ry + GUTTER + lv / f['d']) / TEX
            loop[uv_layer].uv = (float(u), float(v))
        faces.append(face)
    bm.normal_update()
    for face, f in zip(faces, FACES):
        expect = to_blender(f['n'])
        assert np.dot(np.array(face.normal), np.array(expect)) > 0.99, (f['part'], f['tag'])
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
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
    colour_img.name = 'yard-fuel-island-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-fuel-island-body-normal'
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
    pts = np.concatenate([f['pts'] for f in FACES])
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    for axis, (elo, ehi) in enumerate(EXPECTED_BOUNDS):
        assert abs(lo[axis] - elo) < 1e-6 and abs(hi[axis] - ehi) < 1e-6, (axis, lo[axis], hi[axis])
    tris = triangle_count()
    assert tris <= MAX_TRIANGLES, tris
    return tris


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-fuel-island-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    build_geometry()
    tris = check_bounds()
    density = layout()

    scene = reset_scene()
    stage = tempfile.mkdtemp(prefix='yard-fuel-island-body-')
    try:
        colour_px, normal_px = build_textures()
        colour_path = os.path.join(stage, 'yard-fuel-island-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-fuel-island-body-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'yard-fuel-island-body-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'yard-fuel-island-body-normal-stage')

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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-fuel-island-body.py)',
        )
        sizes = (os.path.getsize(colour_path), os.path.getsize(normal_path))
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_FUEL_ISLAND_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes '
          f'(colour {sizes[0]}, normal {sizes[1]}), {tris} triangles, {len(FACES)} faces, '
          f'{density * 1000:.1f} mm/texel at density 1')


main()
