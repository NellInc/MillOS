"""Yard crane bridge (world-yard-crane-body), built from scratch in headless Blender.

What it builds
--------------
The bridge of an overhead bridge crane at delivered scale (three.js metres, origin at
ground centre, +Z front): 10.80 m wide (x) x 0.95 m tall (y) x 1.30 m deep (z).

* Box girder, x -4.6..4.6 (ends on the truck inner faces): a welded box section, one
  profile extruded along x. Webs at z +-0.38 between y 0.20 and 0.91; the bottom flange
  (50 mm) steps out 120 mm to z +-0.50, the top flange (40 mm) lips 60 mm to z +-0.44,
  so the section reads as plate-built from every side. The girder runs y 0.15..0.95:
  its BOTTOM stays at 0.15, where the runtime trolley's top (GLB y 0.25) tucks into it,
  and its TOP is 0.95 so the runtime "5 TON CAPACITY" text sits on the web.
  Real geometry on both webs: four diaphragm ribs (x = +-1, +-3; triangular fins 90 mm
  wide, 55 mm proud) and a longitudinal stiffener bar at y 0.62..0.66 (50 mm proud),
  which makes y 0.66..0.91 the upper panel the plaque is centred in. The paint carries
  only their welds and contact shadows, plus butt-weld splices at x = 0, +-2, +-4 with
  bolted lap plates over them on the top flange. Near each truck a bolted end-connection
  plate and an enamel ID plate (the old yellow and dark end planes, as paint).
* Capacity plaque: a chamfered plate 1.66 x 0.18 m, 30 mm thick, on the web at
  y 0.705..0.885 (centre 0.795; the upper panel's centre is 0.785). Its dark face
  (y 0.74..0.85, z 0.41) is framed by 35 mm light-steel chamfers. It cannot move lower:
  the runtime draws the text at GLB (0, 0.80, 0.42), caps about y 0.76..0.84.
* End trucks, x +-4.6..+-5.4: dark-grey boxes 1.30 m long (z +-0.65, which sets the
  1.30 m depth) on y 0.354..0.95 (top flush with the girder), top edges chamfered 80 mm.
  Each face has its own tone (light dusty top with a bolted cover plate, worn
  chamfers, hazard-striped runway ends, dark underside) and 50 mm edge wear; the x faces
  carry an inset cover panel, bolt rows, and a bolted bearing flange over each wheel.
* Wheels: two per truck at z +-0.36, axis along x, 8-sided with apothem 0.25 (0.54 m
  across, flat bottom on y 0), 0.25 m wide. The truck underside sits on the wheel's
  upper vertex line, so 70 % of each wheel shows, axle included. Each face is a shallow
  cone rising 45 mm to the hub, painted with a machined rim, six lightening holes, six
  hub nuts and the axle end; flanged polished tread. Hidden parts are not built.

Runtime anchors kept (src/components/TruckBay.tsx, OverheadCrane):
* The GLB sits at group y -0.45. The trolley (grey box, GLB y -0.15..0.25, |x| <= 4.6,
  |z| <= 0.3) hangs under the girder bottom (0.15) and stops at the truck inner faces.
* The runtime text "5 TON CAPACITY" is drawn at group (0, 0.35, 0.42) = GLB
  (0, 0.80, 0.42), drei default anchors (centre/middle), fontSize 0.12: the plaque is
  centred on it and its face lies 10 mm behind. Nothing measures the GLB.

Contract (public/models/asset-manifest.json): node 'Yard-crane-bodyBody' (extras
authoredCastShadow / authoredReceiveShadow false, as delivered), one material, two
textures (base colour + normal), at most 702 render vertices (index entries, so 234
triangles), 88000 bytes. Built: girder 40, ribs 32, stiffener bars 12, plaque 10,
trucks 40, wheels 88 = 222 triangles.

Atlas: one 512 x 512 colour + normal pair, sampler REPEAT. The girder's long faces
use full-width bands that repeat along x every 2 m (u = (x - 1) / 2 + 0.5); every
other face maps into its own patch with edge-replicated gutters.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-crane-body.py -- <out.glb>

Re-runnable and deterministic (seeded noise). Writes only <out.glb>; textures are
staged in a temporary directory that is removed afterwards.
"""

import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
import numpy as np

# ---------------------------------------------------------------- dimensions (glTF / three.js metres)
TRUCK_X0, TRUCK_X1 = 4.6, 5.4
GIRDER_X = TRUCK_X0  # girder ends on the truck inner faces (no overlap, no buried caps)
G_Y0, G_Y1 = 0.15, 0.95
FL_T, FL_TT = 0.05, 0.04  # bottom and top flange plate thickness
Z_WEB = 0.38
Z_FL, Z_FT = 0.50, 0.44  # bottom flange steps out 120 mm, top flange lips 60 mm
WEB_Y0, WEB_Y1 = G_Y0 + FL_T, G_Y1 - FL_TT
WEB_H = WEB_Y1 - WEB_Y0
END_SPLIT = 3.6  # web faces split here: the end segments carry the end patch
END_LEN = GIRDER_X - END_SPLIT
PERIOD = 2.0  # girder band repeat along x
STIFF_X = 1.0  # diaphragm ribs at STIFF_X + k * PERIOD
RIB_XS = (-3.0, -1.0, 1.0, 3.0)
RIB_HALF = 0.045  # rib footprint half width on the web
RIB_D = 0.055  # rib ridge stands 55 mm proud of the web, under the top lip
RAIL_Y0, RAIL_Y1 = 0.62, 0.66  # longitudinal stiffener bar
RAIL_D = 0.05

# Profile (z, y), counter-clockwise; kind of each edge i (P[i] -> P[i+1]).
GIRDER_PROFILE = [
    (-Z_FL, G_Y0), (Z_FL, G_Y0), (Z_FL, WEB_Y0), (Z_WEB, WEB_Y0), (Z_WEB, WEB_Y1), (Z_FT, WEB_Y1),
    (Z_FT, G_Y1), (-Z_FT, G_Y1), (-Z_FT, WEB_Y1), (-Z_WEB, WEB_Y1), (-Z_WEB, WEB_Y0), (-Z_FL, WEB_Y0),
]
GIRDER_KINDS = ['under', 'edge', 'edge', 'web', 'edge', 'edge', 'top', 'edge', 'edge', 'web', 'edge', 'edge']

# Plaque: chamfered plate centred in the upper web panel (rail top 0.66 .. flange 0.91).
PLAQUE_HX, PLAQUE_Y0, PLAQUE_Y1 = 0.83, 0.705, 0.885
PLAQUE_IN = 0.035  # face inset: the light chamfer reads as a raised frame
PLAQUE_Z0, PLAQUE_Z1 = Z_WEB, Z_WEB + 0.030

TRUCK_Z = 0.65  # runway ends carry the 1.30 m length
TRUCK_Y0, TRUCK_Y1 = 0.25 * (1.0 + math.tan(math.pi / 8)), G_Y1  # = wheel clip line
TRUCK_CH = 0.08
TRUCK_PROFILE = [
    (TRUCK_Z, TRUCK_Y0), (TRUCK_Z, TRUCK_Y1 - TRUCK_CH), (TRUCK_Z - TRUCK_CH, TRUCK_Y1),
    (-TRUCK_Z + TRUCK_CH, TRUCK_Y1), (-TRUCK_Z, TRUCK_Y1 - TRUCK_CH), (-TRUCK_Z, TRUCK_Y0),
]

WHEEL_A = 0.25  # apothem: flat bottom face lands exactly on y 0
WHEEL_R = WHEEL_A / math.cos(math.pi / 8)
WHEEL_S = WHEEL_R * math.sin(math.pi / 8)
WHEEL_C = WHEEL_A  # axle height
WHEEL_HW = 0.125
WHEEL_X = 5.0
WHEEL_Z = 0.36
WHEEL_HUB = 0.045  # hub cone stands proud of each wheel face
assert abs(WHEEL_C + WHEEL_S - TRUCK_Y0) < 1e-9, 'wheel clip must meet the truck underside'

NODE_NAME = 'Yard-crane-bodyBody'
MESH_NAME = 'yard-crane-body-mesh'
MATERIAL_NAME = 'yard-crane-body-surface'
SCENE_NAME = 'MillOS_World_Yard-crane-body'
TRIANGLE_BUDGET = 234

# ---------------------------------------------------------------- texture settings
TEX_W = TEX_H = 512
GUTTER = 3
SUPERSAMPLE = 2
COLOUR_QUALITY = 82
NORMAL_QUALITY = 80
MAX_SLOPE = 2.0

YELLOW = np.array([246, 186, 38], np.float32)
YELLOW_LIGHT = np.array([255, 214, 110], np.float32)
GRIME = np.array([96, 82, 60], np.float32)
DUST = np.array([178, 170, 150], np.float32)
TRUCK = np.array([64, 73, 88], np.float32)
TRUCK_LIGHT = np.array([128, 134, 142], np.float32)
PLATE_DARK = np.array([34, 42, 54], np.float32)
PLATE_RIM = np.array([66, 74, 86], np.float32)
ENAMEL = np.array([226, 226, 216], np.float32)
BORDER = np.array([36, 40, 48], np.float32)
STEEL = np.array([150, 152, 156], np.float32)
STEEL_DARK = np.array([70, 72, 76], np.float32)
WHEEL_DARK = np.array([38, 44, 54], np.float32)
RUBBER = np.array([30, 30, 33], np.float32)
HAZARD_BLACK = np.array([28, 28, 30], np.float32)
HAZARD_YELLOW = np.array([236, 178, 34], np.float32)


# ---------------------------------------------------------------- atlas layout (pixels; row 0 = v 0)
def rect(col0, row0, w, h, repeat=False):
    return {'col0': col0, 'row0': row0, 'w': w, 'h': h, 'repeat': repeat}


WEB = rect(0, 3, TEX_W, 112, True)
TOP = rect(0, 121, TEX_W, 64, True)
UNDER = rect(0, 191, TEX_W, 32, True)
EDGE = rect(0, 229, TEX_W, 12, True)
END = rect(3, 247, 204, 128)
PLAQUE = rect(213, 247, 200, 30)
TRUCK_CAP = rect(213, 283, 200, 104)
WHEEL_CAP = rect(419, 247, 64, 64)
TREAD = rect(419, 317, 64, 32)
GIRDER_CAP = rect(489, 247, 20, 24)
RIM = rect(489, 277, 12, 12)
DARK = rect(489, 295, 12, 12)
TRUCK_WRAP = rect(3, 393, 504, 112)
RECTS = [WEB, TOP, UNDER, EDGE, END, PLAQUE, TRUCK_CAP, WHEEL_CAP, TREAD, GIRDER_CAP, RIM, DARK, TRUCK_WRAP]


def check_layout():
    boxes = []
    for r in RECTS:
        g = GUTTER
        c0 = r['col0'] - (0 if r['repeat'] else g)
        c1 = r['col0'] + r['w'] + (0 if r['repeat'] else g)
        r0, r1 = r['row0'] - g, r['row0'] + r['h'] + g
        assert c0 >= 0 and r0 >= 0 and c1 <= TEX_W and r1 <= TEX_H, f'rect out of atlas: {r}'
        for b in boxes:
            assert c1 <= b[0] or c0 >= b[1] or r1 <= b[2] or r0 >= b[3], f'rects overlap: {r} {b}'
        boxes.append((c0, c1, r0, r1))


def uv_in(r, fu, fv):
    """fu, fv in [0, 1] across the rect -> atlas UV."""
    return ((r['col0'] + fu * r['w']) / TEX_W, (r['row0'] + fv * r['h']) / TEX_H)


def band_uv(r, x, fv):
    """Repeating band: u follows x (period PERIOD, stiffener at the band centre)."""
    return ((x - STIFF_X) / PERIOD + 0.5, (r['row0'] + fv * r['h']) / TEX_H)


# ---------------------------------------------------------------- noise and helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def noise(x, y, cell_x, cell_y, seed, period_x=None):
    """Seeded smooth value noise over metres; periodic in x when period_x is given."""
    rng = np.random.default_rng(seed)
    grid = rng.random((256, 256)).astype(np.float32)
    if period_x:
        nx = max(1, int(round(period_x / cell_x)))
        gx = x / (period_x / nx)
    else:
        nx = 256
        gx = x / cell_x + 7.3
    gy = y / cell_y + 3.1
    ix, iy = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    fx, fy = gx - ix, gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x0, x1 = ix % nx, (ix + 1) % nx
    y0, y1 = iy % 256, (iy + 1) % 256
    a, b, c, d = grid[y0, x0], grid[y0, x1], grid[y1, x0], grid[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def round_drop(d, radius):
    """Drop of a quarter-round edge of the given radius at distance d in from the edge."""
    t = np.clip(radius - d, 0.0, radius)
    return radius - np.sqrt(np.maximum(radius * radius - t * t, 0.0))


def dome(r, radius, height):
    return height * np.sqrt(np.clip(1.0 - (r / radius) ** 2, 0.0, 1.0))


def mix(rgb, colour, amount):
    a = np.clip(amount, 0.0, 1.0)[..., None]
    return rgb * (1 - a) + colour * a


def paint(colour, shape, a, b, seed, period=None, amp=0.03):
    """Even factory enamel: a broad 1 m gradient (no blotches) and a fine grain."""
    mottle = 1.0 + (noise(a, b, 1.0, 1.0, seed, period) - 0.5) * amp
    fine = 1.0 + (noise(a, b, 0.012, 0.012, seed + 1, period) - 0.5) * 0.025
    return np.broadcast_to(colour, shape + (3,)) * (mottle * fine)[..., None]


def grid_for(r, extent_u, extent_v):
    sw, sh = r['w'] * SUPERSAMPLE, r['h'] * SUPERSAMPLE
    u = (np.arange(sw, dtype=np.float32) + 0.5) / sw * extent_u
    v = (np.arange(sh, dtype=np.float32) + 0.5) / sh * extent_v
    return np.meshgrid(u, v)


def block_mean(a):
    s = SUPERSAMPLE
    h, w = a.shape[0] // s, a.shape[1] // s
    return a.reshape(h, s, w, s, *a.shape[2:]).mean(axis=(1, 3))


def normals_from_height(h, du, dv, periodic_u):
    if periodic_u:
        dh_du = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * du)
    else:
        dh_du = np.gradient(h, du, axis=1)
    dh_dv = np.gradient(h, dv, axis=0)
    mag = np.sqrt(dh_du ** 2 + dh_dv ** 2)
    scale = np.where(mag > MAX_SLOPE, MAX_SLOPE / np.maximum(mag, 1e-6), 1.0)
    n = np.stack([-dh_du * scale, -dh_dv * scale, np.ones_like(h)], axis=-1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def band_coord(x):
    """Girder x -> position inside the repeating band period (stiffener at PERIOD / 2)."""
    return np.mod(x - STIFF_X + PERIOD / 2, PERIOD)


# ---------------------------------------------------------------- girder surfaces
def web_surface(x, b):
    """Web paint and relief at girder x (metres) and height b above the bottom flange.

    The diaphragm ribs (x = +-1, +-3) and the longitudinal bar (y 0.62..0.66) are real
    geometry; the paint only carries their weld fillets and contact shadow, so the
    texture seams sit exactly on the geometry. Butt-weld splices at x = 0, +-2, +-4.
    """
    a = band_coord(x)
    d_rib = np.abs(a - PERIOD / 2)
    d_seam = np.minimum(a, PERIOD - a)
    y = b + WEB_Y0
    h = np.zeros_like(x)
    weld_rib = np.exp(-((d_rib - RIB_HALF - 0.004) / 0.005) ** 2)
    weld_seam = np.exp(-(d_seam / 0.004) ** 2)
    weld_fl = np.exp(-((b - 0.005) / 0.004) ** 2) + np.exp(-((WEB_H - b - 0.005) / 0.004) ** 2)
    weld_rail = np.exp(-((y - RAIL_Y1 - 0.004) / 0.004) ** 2) + np.exp(-((RAIL_Y0 - y - 0.004) / 0.004) ** 2)
    h += 0.003 * (weld_rib + weld_fl + weld_rail) + 0.002 * weld_seam
    rgb = paint(YELLOW, x.shape, a, b, 11, PERIOD)
    rgb *= (1.0 - 0.18 * (weld_rib + weld_seam + weld_rail))[..., None]
    # Contact shadow where the rib, bar and flanges meet the web.
    ao = (np.exp(-(np.maximum(d_rib - RIB_HALF, 0.0) / 0.03) ** 2)
          + np.exp(-((b) / 0.035) ** 2) + np.exp(-((WEB_H - b) / 0.05) ** 2)
          + 0.8 * np.exp(-(np.maximum(RAIL_Y0 - y, 0.0) / 0.03) ** 2) * (y < RAIL_Y0)
          + 0.5 * np.exp(-(np.maximum(y - RAIL_Y1, 0.0) / 0.02) ** 2) * (y > RAIL_Y1))
    rgb *= (1.0 - 0.20 * np.clip(ao, 0, 1))[..., None]
    # Clean painted steel: only a faint grime film toward the bottom flange.
    film = noise(a, b, 0.6, 0.3, 31, PERIOD)
    rgb = mix(rgb, GRIME, smoothstep(0.20, 0.0, b) * (0.04 + 0.05 * film))
    return h, rgb


def web_band():
    a, b = grid_for(WEB, PERIOD, WEB_H)
    x = a - PERIOD / 2 + STIFF_X
    return web_surface(x, b)


def end_patch():
    """Web near a truck: p = |x| - END_SPLIT. Bolted end connection and an enamel ID plate."""
    p, b = grid_for(END, END_LEN, WEB_H)
    x = END_SPLIT + p
    h, rgb = web_surface(x, b)
    # End-connection plate from x 4.40 into the truck, 12 mm proud, two bolt columns
    # (rows clear of the longitudinal bar at b 0.42..0.46).
    cp = smoothstep(4.396, 4.404, x)
    h += 0.012 * cp
    rgb = mix(rgb, YELLOW_LIGHT, np.exp(-((x - 4.404) / 0.005) ** 2) * 0.45)
    rgb *= (1.0 - 0.25 * np.exp(-((x - 4.390) / 0.006) ** 2))[..., None]
    bolts = np.zeros_like(x)
    for bx in (4.46, 4.54):
        for by in (0.07, 0.19, 0.31, 0.56, 0.65):
            r = np.hypot(x - bx, b - by)
            bolts = np.maximum(bolts, dome(r, 0.022, 0.010))
            rgb *= (1.0 - 0.40 * np.exp(-((r - 0.023) / 0.004) ** 2))[..., None]
    h += bolts
    rgb = mix(rgb, STEEL_DARK * 1.4, smoothstep(0.0, 0.004, bolts) * 0.7)
    # Enamel ID plate, dark border, four rivets.
    px, pb, hx, hb = 4.00, 0.20, 0.22, 0.12
    dp = np.minimum(hx - np.abs(x - px), hb - np.abs(b - pb))
    plate = smoothstep(-0.001, 0.001, dp)
    h += 0.003 * plate - round_drop(np.where(dp > 0, dp, 0.0), 0.003) * plate
    border = smoothstep(0.020, 0.016, dp) * plate
    rgb = mix(rgb, ENAMEL * (1.0 + (noise(x, b, 0.05, 0.05, 41) - 0.5) * 0.06)[..., None], plate)
    rgb = mix(rgb, BORDER, border)
    rgb *= (1.0 - 0.30 * np.exp(-((dp + 0.002) / 0.003) ** 2))[..., None]
    for sx in (-1, 1):
        for sb in (-1, 1):
            r = np.hypot(x - (px + sx * (hx - 0.035)), b - (pb + sb * (hb - 0.035)))
            rv = dome(r, 0.008, 0.003)
            h += rv
            rgb = mix(rgb, STEEL, smoothstep(0.0, 0.001, rv))
    # Two dark rule lines on the plate (data panel), clear of the border.
    for lb in (pb - 0.03, pb + 0.03):
        line = (np.abs(b - lb) < 0.007) & (np.abs(x - px) < hx - 0.06)
        rgb = mix(rgb, BORDER * 1.2, line.astype(np.float32) * 0.75)
    return h, rgb


def flange_top_band():
    """Top flange: bolted lap splice plates over the web splices (x = 0, +-2, +-4),
    weld beads along the web lines, rounded edges, light dust."""
    a, c = grid_for(TOP, PERIOD, 2 * Z_FT)
    d_edge = np.minimum(c, 2 * Z_FT - c)
    h = -round_drop(d_edge, 0.008)
    rgb = paint(YELLOW, a.shape, a, c, 51, PERIOD)
    d_seam = np.minimum(a, PERIOD - a)
    dlap = np.minimum(0.13 - d_seam, (Z_FT - 0.05) - np.abs(c - Z_FT))
    lap = smoothstep(-0.002, 0.002, dlap)
    h += 0.008 * lap - round_drop(np.where(dlap > 0, dlap, 0.0), 0.004) * lap
    rgb = mix(rgb, YELLOW * 0.93, lap)
    rgb *= (1.0 - 0.40 * np.exp(-((dlap + 0.003) / 0.005) ** 2))[..., None]
    rgb = mix(rgb, YELLOW_LIGHT, np.exp(-((dlap - 0.004) / 0.003) ** 2) * lap * 0.6)
    # Two bolt rows per lap plate, one either side of the splice (d_seam folds both sides).
    rgb, h = bolt_field(d_seam, c, [(0.07, cc) for cc in np.linspace(0.15, 2 * Z_FT - 0.15, 6)],
                        0.020, rgb, h, YELLOW * 0.75)
    # Fillet beads where the webs meet the flange (diaphragms show as faint lines).
    for cz in (Z_FT - Z_WEB, Z_FT + Z_WEB):
        bead = np.exp(-((c - cz) / 0.006) ** 2) * (1 - lap)
        h += 0.002 * bead
        rgb *= (1.0 - 0.10 * bead)[..., None]
    dust = noise(a, c, 0.6, 0.4, 61, PERIOD) * 0.75 + noise(a, c, 0.06, 0.06, 62, PERIOD) * 0.25
    rgb = mix(rgb, DUST, (0.08 + 0.10 * dust) * smoothstep(0.004, 0.06, d_edge))
    rgb = mix(rgb, YELLOW_LIGHT, smoothstep(0.012, 0.002, d_edge) * 0.5)
    return h, rgb


def flange_under_band():
    a, c = grid_for(UNDER, PERIOD, 2 * Z_FL)
    d_edge = np.minimum(c, 2 * Z_FL - c)
    h = -round_drop(d_edge, 0.006)
    rgb = paint(YELLOW * 0.9, a.shape, a, c, 71, PERIOD)
    rgb = mix(rgb, GRIME, 0.10 + 0.15 * noise(a, c, 0.08, 0.08, 72, PERIOD))
    rgb = mix(rgb, YELLOW_LIGHT, smoothstep(0.008, 0.002, d_edge) * 0.35)
    return h, rgb


def edge_band():
    a, e = grid_for(EDGE, PERIOD, FL_T)
    d_edge = np.minimum(e, FL_T - e)
    h = -round_drop(d_edge, 0.006)
    rgb = paint(YELLOW, a.shape, a, e, 81, PERIOD)
    rgb = mix(rgb, YELLOW_LIGHT, smoothstep(0.008, 0.002, d_edge) * 0.5)
    chip = smoothstep(0.80, 0.86, noise(a, e, 0.012, 0.012, 82, PERIOD)) * smoothstep(0.008, 0.002, d_edge)
    rgb = mix(rgb, STEEL_DARK, chip * 0.8)
    return h, rgb


def girder_cap_patch():
    a, b = grid_for(GIRDER_CAP, 2 * Z_FL, G_Y1 - G_Y0)
    return np.zeros_like(a), paint(YELLOW * 0.92, a.shape, a, b, 91)


# ---------------------------------------------------------------- plaque
PLAQUE_FW = 2 * (PLAQUE_HX - PLAQUE_IN)
PLAQUE_FH = (PLAQUE_Y1 - PLAQUE_Y0) - 2 * PLAQUE_IN


def plaque_patch():
    """Plaque face (inside the chamfer): dark enamel, a fine rule line and four screws."""
    q, r = grid_for(PLAQUE, PLAQUE_FW, PLAQUE_FH)
    d = np.minimum.reduce([q, PLAQUE_FW - q, r, PLAQUE_FH - r])
    rule = np.exp(-((d - 0.012) / 0.0025) ** 2)
    h = 0.0015 * rule
    rgb = paint(PLATE_DARK, q.shape, q, r, 101, amp=0.04)
    rgb = mix(rgb, PLATE_RIM * 1.3, rule * 0.8)
    for sq in (0.030, PLAQUE_FW - 0.030):
        for sr in (0.030, PLAQUE_FH - 0.030):
            rr = np.hypot(q - sq, r - sr)
            sc = dome(rr, 0.010, 0.004)
            h += sc
            rgb = mix(rgb, STEEL, smoothstep(0.0, 0.001, sc))
    return h, rgb


def rim_patch():
    a, b = grid_for(RIM, 0.03, 0.03)
    return np.zeros_like(a), np.broadcast_to(STEEL * 1.05, a.shape + (3,)).copy()


def dark_patch():
    a, b = grid_for(DARK, 0.03, 0.03)
    return np.zeros_like(a), np.broadcast_to(PLATE_DARK, a.shape + (3,)).copy()


# ---------------------------------------------------------------- trucks
def _arc(profile):
    arc = [0.0]
    for i in range(len(profile)):
        arc.append(arc[-1] + math.dist(profile[i], profile[(i + 1) % len(profile)]))
    return arc


TRUCK_ARC = _arc(TRUCK_PROFILE)
TRUCK_S = TRUCK_ARC[-1]
TRUCK_W = TRUCK_X1 - TRUCK_X0


def bolt_field(a, b, centres, radius, rgb, h, colour):
    """Raised hex-ish bolt heads with a dark seat ring, at the given (a, b) centres."""
    heads = np.zeros_like(a)
    for ca, cb in centres:
        r = np.hypot(a - ca, b - cb)
        heads = np.maximum(heads, dome(r, radius, radius * 0.45))
        rgb *= (1.0 - 0.40 * np.exp(-((r - radius * 1.05) / (radius * 0.2)) ** 2))[..., None]
    rgb = mix(rgb, colour, smoothstep(0.0, radius * 0.15, heads) * 0.85)
    return rgb, h + heads


def truck_wrap_patch():
    """Long faces of an end truck. Each face gets its own tone: dusty light top, worn
    chamfers, hazard-striped runway ends, dark grimy underside; 50 mm edge wear."""
    s, w = grid_for(TRUCK_WRAP, TRUCK_S, TRUCK_W)
    d_edge = np.minimum(w, TRUCK_W - w)
    for corner in TRUCK_ARC:
        d_edge = np.minimum(d_edge, np.abs(s - corner))
    h = -round_drop(d_edge, 0.012)
    face = np.zeros(s.shape, np.int64)
    for e in range(len(TRUCK_PROFILE)):
        face[(s >= TRUCK_ARC[e]) & (s < TRUCK_ARC[e + 1])] = e
    tone = np.array([1.0, 1.28, 1.20, 1.28, 1.0, 0.62], np.float32)[face]
    rgb = paint(TRUCK, s.shape, s, w, 111) * tone[..., None]
    wear = noise(s, w, 0.025, 0.025, 112)
    edge_wear = smoothstep(0.050, 0.008, d_edge) * (0.30 + 0.45 * wear)
    rgb = mix(rgb, TRUCK_LIGHT, edge_wear * (face != 5))
    # Hazard stripes on both runway-end faces (profile edges 0 and 4), 40 mm inside.
    for e in (0, 4):
        s0, s1 = TRUCK_ARC[e] + 0.04, TRUCK_ARC[e + 1] - 0.04
        dpanel = np.minimum.reduce([s - s0, s1 - s, w - 0.04, TRUCK_W - 0.04 - w])
        panel = smoothstep(-0.001, 0.001, dpanel)
        stripe = (np.mod((s - s0) + w, 0.20) < 0.10).astype(np.float32)
        hz = np.where(stripe[..., None] > 0.5, HAZARD_YELLOW, HAZARD_BLACK)
        hz = hz * (1.0 + (noise(s, w, 0.04, 0.04, 113) - 0.5) * 0.06)[..., None]
        rgb = mix(rgb, hz, panel)
        rgb *= (1.0 - 0.35 * np.exp(-((dpanel + 0.003) / 0.004) ** 2))[..., None]
        h += 0.0015 * panel
    # Top: bolted cover plate inset 60 mm, two bolt rows along it, light dust.
    top = face == 2
    t0, t1 = TRUCK_ARC[2], TRUCK_ARC[3]
    dcov = np.minimum.reduce([s - t0 - 0.06, t1 - 0.06 - s, w - 0.06, TRUCK_W - 0.06 - w])
    cover = smoothstep(-0.002, 0.002, dcov) * top
    h += 0.004 * cover
    rgb *= (1.0 - 0.35 * np.exp(-((dcov + 0.003) / 0.004) ** 2) * top)[..., None]
    rgb = mix(rgb, TRUCK_LIGHT, np.exp(-((dcov - 0.004) / 0.003) ** 2) * top * 0.5)
    n_b = 7
    centres = [(t0 + 0.11 + k * (t1 - t0 - 0.22) / (n_b - 1), wb) for k in range(n_b) for wb in (0.10, TRUCK_W - 0.10)]
    rgb, h = bolt_field(s, w, centres, 0.022, rgb, h, TRUCK_LIGHT * 1.15)
    rgb = mix(rgb, DUST, top * (0.08 + 0.12 * noise(s, w, 0.15, 0.15, 114)) * smoothstep(0.01, 0.06, d_edge))
    under = face == 5
    rgb = mix(rgb, GRIME * 0.6, under * 0.30)
    return h, rgb


def polygon_distance(zz, yy, poly):
    """Unsigned distance to the polygon outline and an inside mask."""
    dist = np.full(zz.shape, np.inf, np.float32)
    inside = np.zeros(zz.shape, bool)
    for i in range(len(poly)):
        p, q = np.array(poly[i], np.float32), np.array(poly[(i + 1) % len(poly)], np.float32)
        e = q - p
        t = np.clip(((zz - p[0]) * e[0] + (yy - p[1]) * e[1]) / float(e @ e), 0.0, 1.0)
        dz, dy = zz - (p[0] + t * e[0]), yy - (p[1] + t * e[1])
        dist = np.minimum(dist, np.sqrt(dz * dz + dy * dy))
        crosses = ((p[1] > yy) != (q[1] > yy)) & (zz < (q[0] - p[0]) * (yy - p[1]) / (q[1] - p[1] + 1e-12) + p[0])
        inside ^= crosses
    return dist, inside


def truck_cap_patch():
    """x faces of an end truck: inset cover panel, bolt rows, and a bolted bearing
    flange above each wheel axle."""
    zz, yy = grid_for(TRUCK_CAP, 2 * TRUCK_Z, TRUCK_Y1 - TRUCK_Y0)
    zz = zz - TRUCK_Z
    yy = yy + TRUCK_Y0
    dist, inside = polygon_distance(zz, yy, TRUCK_PROFILE)
    d = np.where(inside, dist, 0.0)
    h = -round_drop(d, 0.012)
    # Inset cover panel 80 mm in from the outline, recessed 5 mm.
    panel = smoothstep(0.077, 0.083, d)
    h -= 0.005 * panel
    rgb = paint(TRUCK, zz.shape, zz, yy, 121) * 1.08
    wear = noise(zz, yy, 0.025, 0.025, 122)
    rgb = mix(rgb, TRUCK_LIGHT, smoothstep(0.050, 0.008, d) * (0.30 + 0.45 * wear))
    rgb *= (1.0 - 0.35 * np.exp(-((d - 0.077) / 0.004) ** 2))[..., None]
    rgb = mix(rgb, TRUCK_LIGHT, np.exp(-((d - 0.085) / 0.003) ** 2) * 0.35)
    rgb *= (1.0 - 0.08 * panel)[..., None]
    centres = [(bz, by) for by in (TRUCK_Y0 + 0.04, TRUCK_Y1 - 0.04)
               for bz in (-0.50, -0.25, 0.0, 0.25, 0.50)]
    rgb, h = bolt_field(zz, yy, centres, 0.022, rgb, h, TRUCK_LIGHT * 1.15)
    # Bearing flange plates over the wheels, 12 mm proud, four bolts each.
    for wz in (-WHEEL_Z, WHEEL_Z):
        db = np.minimum(0.12 - np.abs(zz - wz), 0.075 - np.abs(yy - (TRUCK_Y0 + 0.13)))
        plate = smoothstep(-0.002, 0.002, db)
        h += 0.012 * plate - round_drop(np.where(db > 0, db, 0.0), 0.006) * plate
        rgb = mix(rgb, TRUCK * 1.35, plate)
        rgb *= (1.0 - 0.40 * np.exp(-((db + 0.003) / 0.004) ** 2))[..., None]
        rgb = mix(rgb, TRUCK_LIGHT * 1.1, np.exp(-((db - 0.004) / 0.003) ** 2) * plate * 0.6)
        pc = [(wz + sz * 0.08, TRUCK_Y0 + 0.13 + sy * 0.042) for sz in (-1, 1) for sy in (-1, 1)]
        rgb, h = bolt_field(zz, yy, pc, 0.018, rgb, h, STEEL)
    rgb = mix(rgb, GRIME * 0.6, smoothstep(TRUCK_Y0 + 0.10, TRUCK_Y0, yy) * 0.25)
    return h, rgb


# ---------------------------------------------------------------- wheels
def wheel_cap_patch():
    """Wheel face (a shallow cone to the hub): machined steel rim, dark web with six
    lightening holes, raised hub with six nuts round the axle end."""
    dz, dy = grid_for(WHEEL_CAP, 2 * WHEEL_R, 2 * WHEEL_R)
    dz, dy = dz - WHEEL_R, dy - WHEEL_R
    rr = np.hypot(dz, dy)
    hub = smoothstep(0.072, 0.066, rr)
    rim = smoothstep(0.185, 0.192, rr)
    h = 0.010 * hub + 0.006 * rim
    rgb = paint(WHEEL_DARK * 1.15, dz.shape, dz, dy, 131, amp=0.04)
    rgb = mix(rgb, STEEL * 0.95, rim)
    rgb *= (1.0 - 0.40 * np.exp(-((rr - 0.188) / 0.005) ** 2))[..., None]
    rgb = mix(rgb, STEEL * 0.75, hub)
    rgb *= (1.0 - 0.40 * np.exp(-((rr - 0.069) / 0.004) ** 2))[..., None]
    for k in range(6):
        ang = 2 * math.pi * (k + 0.5) / 6
        r = np.hypot(dz - 0.125 * math.cos(ang), dy - 0.125 * math.sin(ang))
        hole = smoothstep(0.034, 0.030, r)
        h -= 0.012 * hole
        rgb = mix(rgb, np.array([14, 16, 20], np.float32), hole * 0.9)
        rgb = mix(rgb, STEEL * 0.7, np.exp(-((r - 0.033) / 0.003) ** 2) * 0.6)
    nuts = []
    for k in range(6):
        ang = 2 * math.pi * k / 6
        nuts.append((0.047 * math.cos(ang), 0.047 * math.sin(ang)))
    rgb, h = bolt_field(dz, dy, nuts, 0.011, rgb, h, STEEL * 1.1)
    axle = dome(rr, 0.022, 0.010)
    h += axle
    rgb = mix(rgb, STEEL * 1.15, smoothstep(0.0, 0.002, axle))
    return h, rgb


TREAD_PTS = [
    (-WHEEL_A, WHEEL_C + WHEEL_S),
    (-WHEEL_A, WHEEL_C - WHEEL_S),
    (-WHEEL_S, 0.0),
    (WHEEL_S, 0.0),
    (WHEEL_A, WHEEL_C - WHEEL_S),
    (WHEEL_A, WHEEL_C + WHEEL_S),
]
TREAD_ARC = _arc(TREAD_PTS)[:len(TREAD_PTS)]
TREAD_S = TREAD_ARC[-1]


def tread_patch():
    """Rolling tread between two flanges; the tread is bright from the rail."""
    t, w = grid_for(TREAD, TREAD_S, 2 * WHEEL_HW)
    d = np.minimum(w, 2 * WHEEL_HW - w)
    flange = smoothstep(0.034, 0.028, d)
    h = 0.008 * flange - round_drop(d, 0.006)
    rgb = paint(STEEL * 1.1, t.shape, t, w, 141, amp=0.05)
    rgb = mix(rgb, STEEL_DARK, flange * 0.85)
    rgb *= (1.0 - 0.40 * np.exp(-((d - 0.031) / 0.004) ** 2))[..., None]
    return h, rgb


# ---------------------------------------------------------------- texture assembly
def build_textures():
    check_layout()
    normal = np.zeros((TEX_H, TEX_W, 3), np.float32)
    normal[..., 2] = 1.0
    colour = np.zeros((TEX_H, TEX_W, 3), np.float32)
    colour[:] = YELLOW * 0.9
    jobs = [
        (WEB, web_band(), PERIOD, WEB_H),
        (TOP, flange_top_band(), PERIOD, 2 * Z_FT),
        (UNDER, flange_under_band(), PERIOD, 2 * Z_FL),
        (EDGE, edge_band(), PERIOD, FL_T),
        (END, end_patch(), END_LEN, WEB_H),
        (PLAQUE, plaque_patch(), PLAQUE_FW, PLAQUE_FH),
        (TRUCK_CAP, truck_cap_patch(), 2 * TRUCK_Z, TRUCK_Y1 - TRUCK_Y0),
        (WHEEL_CAP, wheel_cap_patch(), 2 * WHEEL_R, 2 * WHEEL_R),
        (TREAD, tread_patch(), TREAD_S, 2 * WHEEL_HW),
        (GIRDER_CAP, girder_cap_patch(), 2 * Z_FL, G_Y1 - G_Y0),
        (RIM, rim_patch(), 0.03, 0.03),
        (DARK, dark_patch(), 0.03, 0.03),
        (TRUCK_WRAP, truck_wrap_patch(), TRUCK_S, TRUCK_W),
    ]
    for r, (h, rgb), eu, ev in jobs:
        sw, sh = h.shape[1], h.shape[0]
        n = normals_from_height(h, eu / sw, ev / sh, r['repeat'])
        n = block_mean(n)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        c = block_mean(rgb)
        g = GUTTER
        pad_cols = (0, 0) if r['repeat'] else (g, g)
        n = np.pad(n, ((g, g), pad_cols, (0, 0)), mode='edge')
        c = np.pad(c, ((g, g), pad_cols, (0, 0)), mode='edge')
        r0 = r['row0'] - g
        c0 = r['col0'] - pad_cols[0]
        normal[r0:r0 + n.shape[0], c0:c0 + n.shape[1]] = n
        colour[r0:r0 + c.shape[0], c0:c0 + c.shape[1]] = c
    assert np.isfinite(normal).all() and np.isfinite(colour).all(), 'non-finite texel'
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
def g2b(x, y, z):
    """glTF / three.js (y up, +z front) -> Blender (z up); the exporter maps it back."""
    return (x, -z, y)


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.verts = 0
        self.triangles = 0

    def vert(self, x, y, z):
        self.verts += 1
        return self.bm.verts.new(g2b(x, y, z))

    def face(self, verts, uvs, outward):
        """outward: glTF-space direction the face must point along; winding is fixed to match."""
        pts = [v.co for v in verts]
        nx = ny = nz = 0.0
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            nx += (a.y - b.y) * (a.z + b.z)
            ny += (a.z - b.z) * (a.x + b.x)
            nz += (a.x - b.x) * (a.y + b.y)
        ob = g2b(*outward)
        if nx * ob[0] + ny * ob[1] + nz * ob[2] < 0:
            verts = list(reversed(verts))
            uvs = list(reversed(uvs))
        f = self.bm.faces.new(verts)
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
        f.smooth = True
        self.triangles += len(verts) - 2
        return f


def signed_area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                     for i in range(len(poly)))


def outward_zy(poly, i):
    """Outward unit normal (z, y) of edge i of a polygon in the (z, y) plane."""
    orient = 1.0 if signed_area(poly) > 0 else -1.0
    p, q = poly[i], poly[(i + 1) % len(poly)]
    dz, dy = q[0] - p[0], q[1] - p[1]
    length = math.hypot(dz, dy)
    return (dy / length * orient, -dz / length * orient)


def girder_uv(kind, x, y, z, s, length):
    if kind == 'mid':
        return band_uv(WEB, x, (y - WEB_Y0) / WEB_H)
    if kind == 'end':
        return uv_in(END, (abs(x) - END_SPLIT) / END_LEN, (y - WEB_Y0) / WEB_H)
    if kind == 'top':
        return band_uv(TOP, x, (z + Z_FT) / (2 * Z_FT))
    if kind == 'under':
        return band_uv(UNDER, x, (z + Z_FL) / (2 * Z_FL))
    return band_uv(EDGE, x, s / length)


def build_girder(b):
    """Profile extrusion: 16 long quads (webs split at the end patches) (32), and the two
    end faces below the truck underside, the only part of each end left in view (8)."""
    poly = GIRDER_PROFILE
    for i, kind in enumerate(GIRDER_KINDS):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        oz, oy = outward_zy(poly, i)
        length = math.dist(p, q)
        if kind == 'web':
            segs = [(-GIRDER_X, -END_SPLIT, 'end'), (-END_SPLIT, END_SPLIT, 'mid'), (END_SPLIT, GIRDER_X, 'end')]
        else:
            segs = [(-GIRDER_X, GIRDER_X, kind)]
        for xa, xb, k in segs:
            corners = [(xa, p, 0.0), (xb, p, 0.0), (xb, q, length), (xa, q, length)]
            verts = [b.vert(x, pt[1], pt[0]) for x, pt, _ in corners]
            uvs = [girder_uv(k, x, pt[1], pt[0], s, length) for x, pt, s in corners]
            b.face(verts, uvs, (0.0, oy, oz))
    cap_parts = [
        [(-Z_FL, G_Y0), (Z_FL, G_Y0), (Z_FL, WEB_Y0), (-Z_FL, WEB_Y0)],
        [(-Z_WEB, WEB_Y0), (Z_WEB, WEB_Y0), (Z_WEB, TRUCK_Y0), (-Z_WEB, TRUCK_Y0)],
    ]
    for sign in (-1.0, 1.0):
        x = sign * GIRDER_X
        for part in cap_parts:
            verts = [b.vert(x, y, z) for z, y in part]
            uvs = [uv_in(GIRDER_CAP, (z + Z_FL) / (2 * Z_FL), (y - G_Y0) / (G_Y1 - G_Y0)) for z, y in part]
            b.face(verts, uvs, (sign, 0.0, 0.0))


def build_ribs(b):
    """Diaphragm ribs on both webs: a vertical triangular fin between the flanges (4 each)."""
    for zs in (-1.0, 1.0):
        zw, zr = zs * Z_WEB, zs * (Z_WEB + RIB_D)
        for xr in RIB_XS:
            for side in (-1.0, 1.0):
                xb = xr + side * RIB_HALF
                quad = [(xb, WEB_Y0, zw), (xr, WEB_Y0, zr), (xr, WEB_Y1, zr), (xb, WEB_Y1, zw)]
                uvs = [band_uv(WEB, 1.5 + side * 0.04 if k in (0, 3) else 1.5, (y - WEB_Y0) / WEB_H)
                       for k, (_, y, _) in enumerate(quad)]
                b.face([b.vert(*v) for v in quad], uvs, (side * RIB_D, 0.0, zs * RIB_HALF))


def build_rails(b):
    """Longitudinal stiffener bar on both webs: top, front and underside (6 each)."""
    xa, xb = -GIRDER_X, GIRDER_X
    for zs in (-1.0, 1.0):
        zw, zf = zs * Z_WEB, zs * (Z_WEB + RAIL_D)
        faces = [
            ([(xa, RAIL_Y1, zw), (xb, RAIL_Y1, zw), (xb, RAIL_Y1, zf), (xa, RAIL_Y1, zf)], (0.0, 1.0, 0.0)),
            ([(xa, RAIL_Y0, zf), (xb, RAIL_Y0, zf), (xb, RAIL_Y1, zf), (xa, RAIL_Y1, zf)], (0.0, 0.0, zs)),
            ([(xa, RAIL_Y0, zw), (xb, RAIL_Y0, zw), (xb, RAIL_Y0, zf), (xa, RAIL_Y0, zf)], (0.0, -1.0, 0.0)),
        ]
        for quad, out in faces:
            uvs = [band_uv(EDGE, x, 0.0 if k in (0, 1) else 1.0) for k, (x, _, _) in enumerate(quad)]
            b.face([b.vert(*v) for v in quad], uvs, out)


def build_plaque(b):
    """Chamfered capacity plate: face and four light chamfers (10); its back lies on the web."""
    x0, x1, y0, y1 = -PLAQUE_HX, PLAQUE_HX, PLAQUE_Y0, PLAQUE_Y1
    i = PLAQUE_IN
    za, zb = PLAQUE_Z0, PLAQUE_Z1
    front = [(x0 + i, y0 + i), (x1 - i, y0 + i), (x1 - i, y1 - i), (x0 + i, y1 - i)]
    b.face([b.vert(x, y, zb) for x, y in front],
           [uv_in(PLAQUE, (x - x0 - i) / PLAQUE_FW, (y - y0 - i) / PLAQUE_FH) for x, y in front], (0.0, 0.0, 1.0))
    rim = [uv_in(RIM, 0.2, 0.2), uv_in(RIM, 0.8, 0.2), uv_in(RIM, 0.8, 0.8), uv_in(RIM, 0.2, 0.8)]
    edges = [
        ([(x0, y1, za), (x1, y1, za), (x1 - i, y1 - i, zb), (x0 + i, y1 - i, zb)], (0.0, 1.0, 1.0)),
        ([(x0, y0, za), (x1, y0, za), (x1 - i, y0 + i, zb), (x0 + i, y0 + i, zb)], (0.0, -1.0, 1.0)),
        ([(x0, y0, za), (x0, y1, za), (x0 + i, y1 - i, zb), (x0 + i, y0 + i, zb)], (-1.0, 0.0, 1.0)),
        ([(x1, y0, za), (x1, y1, za), (x1 - i, y1 - i, zb), (x1 - i, y0 + i, zb)], (1.0, 0.0, 1.0)),
    ]
    for quad, out in edges:
        b.face([b.vert(*v) for v in quad], rim, out)


def build_truck(b, sign):
    """One end truck: 6 long quads round the top-chamfered profile and two hexagon caps (20)."""
    poly = TRUCK_PROFILE
    xa, xb = sorted((sign * TRUCK_X0, sign * TRUCK_X1))
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        oz, oy = outward_zy(poly, i)
        corners = [(xa, p, TRUCK_ARC[i]), (xb, p, TRUCK_ARC[i]), (xb, q, TRUCK_ARC[i + 1]), (xa, q, TRUCK_ARC[i + 1])]
        verts = [b.vert(x, pt[1], pt[0]) for x, pt, _ in corners]
        uvs = [uv_in(TRUCK_WRAP, s / TRUCK_S, (abs(x) - TRUCK_X0) / TRUCK_W) for x, _, s in corners]
        b.face(verts, uvs, (0.0, oy, oz))
    for x, out in ((sign * TRUCK_X1, sign), (sign * TRUCK_X0, -sign)):
        verts = [b.vert(x, y, z) for z, y in poly]
        uvs = [uv_in(TRUCK_CAP, (z + TRUCK_Z) / (2 * TRUCK_Z), (y - TRUCK_Y0) / (TRUCK_Y1 - TRUCK_Y0)) for z, y in poly]
        b.face(verts, uvs, (out, 0.0, 0.0))


def build_wheel(b, xc, zc):
    """Visible part of an 8-sided flanged wheel below the truck: 5 tread quads (10) and a
    six-triangle cone on each face rising to the hub (12)."""
    xl, xr = xc - WHEEL_HW, xc + WHEEL_HW
    left = [b.vert(xl, y, zc + dz) for dz, y in TREAD_PTS]
    right = [b.vert(xr, y, zc + dz) for dz, y in TREAD_PTS]
    for k in range(len(TREAD_PTS) - 1):
        (z0, y0), (z1, y1) = TREAD_PTS[k], TREAD_PTS[k + 1]
        mz, my = (z0 + z1) / 2, (y0 + y1) / 2 - WHEEL_C
        uvs = [uv_in(TREAD, TREAD_ARC[k] / TREAD_S, 0.0), uv_in(TREAD, TREAD_ARC[k] / TREAD_S, 1.0),
               uv_in(TREAD, TREAD_ARC[k + 1] / TREAD_S, 1.0), uv_in(TREAD, TREAD_ARC[k + 1] / TREAD_S, 0.0)]
        b.face([left[k], right[k], right[k + 1], left[k + 1]], uvs, (0.0, my, mz))

    def cap_uv(dz, y):
        return uv_in(WHEEL_CAP, dz / (2 * WHEEL_R) + 0.5, (y - WHEEL_C) / (2 * WHEEL_R) + 0.5)

    n = len(TREAD_PTS)
    for x, out in ((xl, -1.0), (xr, 1.0)):
        for k in range(n):
            (z0, y0), (z1, y1) = TREAD_PTS[k], TREAD_PTS[(k + 1) % n]
            tri = [b.vert(x + out * WHEEL_HUB, WHEEL_C, zc), b.vert(x, y0, zc + z0), b.vert(x, y1, zc + z1)]
            b.face(tri, [cap_uv(0.0, WHEEL_C), cap_uv(z0, y0), cap_uv(z1, y1)], (out, 0.0, 0.0))


def build_mesh():
    b = Builder()
    build_girder(b)
    build_ribs(b)
    build_rails(b)
    build_plaque(b)
    for sx in (-1.0, 1.0):
        build_truck(b, sx)
        for sz in (-1.0, 1.0):
            build_wheel(b, sx * WHEEL_X, sz * WHEEL_Z)
    assert b.triangles <= TRIANGLE_BUDGET, f'{b.triangles} triangles > {TRIANGLE_BUDGET}'
    b.bm.normal_update()
    mesh = bpy.data.meshes.new(MESH_NAME)
    b.bm.to_mesh(mesh)
    count, tris = b.verts, b.triangles
    b.bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return mesh, count, tris


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
    colour_img.name = 'yard-crane-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-crane-body-normal'
    normal_img.colorspace_settings.is_data = True

    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    colour_node.extension = 'REPEAT'  # the girder bands repeat along x
    colour_node.interpolation = 'Linear'
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])

    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_tex.extension = 'REPEAT'
    normal_tex.interpolation = 'Linear'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-crane-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='yard-crane-body-')
    try:
        colour_px, normal_px = build_textures()
        colour_path = os.path.join(stage, 'yard-crane-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-crane-body-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'yard-crane-body-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'yard-crane-body-normal-stage')

        mesh, count, tris = build_mesh()
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-crane-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_CRANE_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes '
          f'{TEX_W}x{TEX_H} authored verts {count} triangles {tris}')


main()
