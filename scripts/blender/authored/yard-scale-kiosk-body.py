"""Truck-yard scale-ticket kiosk body (world-yard-scale-kiosk-body), built from scratch in headless Blender.

What it builds
--------------
The free-standing scale-ticket kiosk that stands beside each weighbridge
(src/components/TruckBay.tsx `ScaleTicketKiosk`, two instances; the GLB is
mounted at a (0, 0.6, 0.1) offset inside the kiosk group). Glb frame: metres,
y up, origin at ground centre, +Z front. Envelope 1.000 x 1.950 x 0.900 m, set
by the hood.

Construction (round 4: rebuilt by a different method, not patched)
------------------------------------------------------------------
76 triangles: maxRenderVertices 228 is the INDEX count.

* cabinet (16): an octagonal prism LOFTED between a bottom and a top section,
  tapering 12 mm per side and at the back (the front stays vertical for the
  runtime screen). The four vertical corners are 60 mm chamfers whose corner
  normals are the normals of the two faces they join, so each one shades as a
  rolled radius rather than a thin facet;
* hood (12): a frustum slab, not a box: bottom section 1.00 x 0.90 at y 1.85,
  top section inset 25 mm at y 1.95. Its sloped band rolls its normals from
  horizontal to 50 deg up, so the perimeter reads as a rounded pressed edge in
  geometry and in clay;
* base (10): a shallow 60 mm near-black steel frame, 25 mm proud all round;
* front fascia (24): ONE body traced from a side profile and extruded across
  x +-0.31: a 165 mm deep foot, the keypad slope rising to a ledge at y 1.00,
  two jambs up to y 1.40 and a brow sloping back into the face at y 1.47. The
  runtime screen (x +-0.25, y 1.025-1.375, z 0.21) sits in a real 75 mm deep
  pocket (x +-0.275) cut between ledge, jambs and brow, with its own inner
  walls and ceiling. The pentagon cheeks close both ends. This replaces the
  stacked console, visor and painted screen bezel of earlier rounds;
* card reader (6): a closed wedge seated on the keypad slope at its right
  end, so from the side it reads as part of the fascia profile; its top edge
  is 42 mm proud and its foot is sunk into the slope (no open edge);
* speaker disc (8): a shallow 8-sided dome, r 75 mm, at (0, 1.575), above the
  brow and below the "SCALE TICKET" text.

Keep-outs: nothing reaches z 0.21 inside x +-0.25, y 1.025-1.375 (the pocket
is empty there), and the face behind "SCALE TICKET" (y ~1.70-1.80) is flat.

Surface: one material, two 512 px maps generated here with numpy and planar
mapped per region at a fixed texel density: base colour (sRGB) and a glTF
metallic-roughness map (G roughness, B metal). The metallic-roughness map
replaces the earlier normal map, so door panels (satin), frame (matte), glass
(gloss), steel trim and keys (metal) differ in real material response, not in
paint only. Single-sided, no vertex colours.

Node: one mesh node `Yard-scale-kiosk-bodyBody` at the identity transform.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-scale-kiosk-body.py -- <out.glb>

Re-runnable and deterministic (seeded). Writes only <out.glb>.
"""

import math
import os
import sys

import bpy
import numpy as np

# ---------------------------------------------------------------- dimensions (metres, glTF y up, +Z front)
CAB_X = 0.40
CAB_ZF = 0.20
CAB_ZB = -0.40
CAB_Y0 = 0.05  # inside the base
CAB_Y1 = 1.87  # inside the hood
CAB_CH = 0.06
TAPER = 0.012  # inset of the sides and back at CAB_Y1

HOOD_X = 0.50
HOOD_Z = 0.45
HOOD_Y0 = 1.85
HOOD_Y1 = 1.95
HOOD_INSET = 0.025
HOOD_ROLL_DEG = 50.0

BASE_X = 0.425
BASE_ZF = 0.225
BASE_ZB = -0.425
BASE_Y1 = 0.06

SEAT = 0.195  # back plane of fittings: 5 mm into the cabinet face

# front fascia side profile
COL_X = 0.31
POCKET_X = 0.275
COL_Y_FOOT = 0.60
COL_Z_FOOT = 0.36
COL_Y_LEDGE = 1.00
COL_Z_FRONT = 0.27
COL_Y_BROW = 1.40
COL_Y_TOP = 1.47

# card reader on the keypad slope: x range, along-slope range from the foot, proud depth
READER_X0, READER_X1 = 0.215, 0.305  # at the fascia's right end, 5 mm in from its cheek
READER_S0, READER_S1 = 0.17, 0.35
READER_D = 0.042
READER_SINK = -0.004

DISC_Y = 1.575
DISC_R = 0.075

INDEX_BUDGET = 228
BYTE_BUDGET = 39000

NODE_NAME = 'Yard-scale-kiosk-bodyBody'
MESH_NAME = 'yard-scale-kiosk-body-mesh'
MATERIAL_NAME = 'yard-scale-kiosk-body-surface'
SCENE_NAME = 'MillOS_World_Yard-scale-kiosk-body'

TEX = 512
JPEG_QUALITY = 84
SEED = 20261106

# ---------------------------------------------------------------- atlas regions (pixels, v from the bottom)
# name: (u0, v0, w, h, mpp) where mpp is metres per px, or None = fit the face
# into the rect (flat-colour regions only).
FRONT_MPP = 0.0047
DISC_MPP = 0.0023
SLOPE_MPP = 0.0035
REGIONS = {
    'front': (0, 122, 146, 389, FRONT_MPP),
    'side': (148, 122, 104, 389, FRONT_MPP),
    'chamfer': (254, 122, 22, 389, FRONT_MPP),
    'back': (278, 122, 77, 204, 0.009),
    'hoodtop': (355, 122, 157, 141, 0.0061),
    'keypad': (0, 0, 178, 119, SLOPE_MPP),
    'reader': (181, 0, 38, 76, 0.0025),
    'disc': (222, 0, 64, 64, DISC_MPP),
    'column': (289, 0, 50, 56, None),
    'pocket': (289, 59, 50, 30, None),
    'darksteel': (289, 92, 50, 27, None),
    'hoodside': (342, 0, 60, 40, None),
    'hoodunder': (342, 43, 60, 35, None),
    'base': (342, 81, 60, 38, None),
    'underside': (405, 0, 50, 40, None),
}
INSET = 1.5  # px: fitted UVs land this far inside their rect, so filtering never reaches a neighbour


def srgb(*c):
    return np.array(c, dtype=np.float64) / 255.0


FRAME = srgb(62, 70, 82)      # cabinet frame: matte
PANEL = srgb(46, 53, 64)      # door and side panels: satin
SEAM = srgb(18, 21, 26)
HILITE = srgb(92, 101, 114)
HEADER = srgb(30, 35, 42)
GLASS = srgb(10, 13, 17)
HOOD = srgb(112, 118, 126)
HOOD_UNDER = srgb(50, 56, 64)
BASE = srgb(22, 24, 28)
COLUMN = srgb(84, 92, 104)    # fascia: mid graphite
POCKET = srgb(24, 28, 34)
KEYPAD_BOX = srgb(132, 139, 149)
STEEL = srgb(168, 174, 182)
KEY = srgb(196, 201, 207)
READER = srgb(18, 21, 25)
READER_RIM = srgb(84, 91, 100)
DISC_RIM = srgb(112, 120, 130)
DISC = srgb(26, 30, 36)
HOLE = srgb(8, 10, 13)
SLIT = srgb(5, 6, 8)

# roughness / metal per finish
R_FRAME, R_PANEL, R_GLASS, R_HOOD, R_COLUMN, R_STEEL, R_PLASTIC = 0.74, 0.42, 0.12, 0.52, 0.55, 0.34, 0.38
M_PAINT, M_STEEL = 0.0, 0.85


def out_path():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 1:
        raise SystemExit('usage: Blender -b --factory-startup -P yard-scale-kiosk-body.py -- <out.glb>')
    return os.path.abspath(argv[0])


# ---------------------------------------------------------------- 2D drawing helpers (metres)

def smooth_box(S, T, s0, t0, s1, t1, soft):
    """1 inside the rect, 0 outside, linear ramp of width `soft` metres at the edge."""
    d = np.maximum.reduce([s0 - S, S - s1, t0 - T, T - t1])
    return np.clip(0.5 - d / max(soft, 1e-6), 0.0, 1.0)


def rounded_box(S, T, cs, ct, hw, hh, r, soft):
    qs = np.abs(S - cs) - (hw - r)
    qt = np.abs(T - ct) - (hh - r)
    outside = np.hypot(np.maximum(qs, 0), np.maximum(qt, 0))
    inside = np.minimum(np.maximum(qs, qt), 0)
    d = outside + inside - r
    return np.clip(0.5 - d / max(soft, 1e-6), 0.0, 1.0), d


def outline(S, T, s0, t0, s1, t1, width, soft):
    return np.clip(smooth_box(S, T, s0, t0, s1, t1, soft) - smooth_box(S, T, s0 + width, t0 + width, s1 - width, t1 - width, soft), 0, 1)


def disc_mask(S, T, cs, ct, r, soft):
    d = np.hypot(S - cs, T - ct) - r
    return np.clip(0.5 - d / max(soft, 1e-6), 0.0, 1.0), d


def shadow_below(S, T, s0, s1, t_edge, reach, strength):
    """Soft contact shading under a fitting's lower edge, fading over `reach` metres."""
    across = smooth_box(S, T, s0 - 0.01, -1.0, s1 + 0.01, 1e9, 0.02)
    below = np.clip(1.0 - (t_edge - T) / reach, 0.0, 1.0) * (T <= t_edge)
    return across * below * strength


def halo(S, T, s0, t0, s1, t1, reach, strength):
    d = np.maximum.reduce([s0 - S, S - s1, t0 - T, T - t1])
    return np.clip(1.0 - d / reach, 0.0, 1.0) * (d > 0) * strength


def mix(colour, target, mask):
    return colour * (1 - mask[..., None]) + target[None, None, :] * mask[..., None]


def shade(colour, amount):
    return colour * (1 - amount[..., None])


# ---------------------------------------------------------------- region painters
# Each takes metre grids (S right, T up, from the face's lower-left corner) and an
# rng, and returns (colour HxWx3 in sRGB 0..1, height HxW in metres).

def coarse_noise(rng, shape, cell):
    """Smooth value noise: a coarse random grid, bilinearly upsampled (JPEG-friendly)."""
    gh, gw = shape[0] // cell + 2, shape[1] // cell + 2
    g = rng.normal(0.0, 1.0, (gh, gw))
    ys = (np.arange(shape[0]) + 0.5) / cell
    xs = (np.arange(shape[1]) + 0.5) / cell
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def paint_noise(rng, shape, amount, streak=True):
    # Low-frequency mottling only: per-pixel noise reads as nothing at game
    # distance and costs most of the JPEG budget.
    n = 0.7 * coarse_noise(rng, shape, 12) + 0.3 * coarse_noise(rng, shape, 5)
    if streak:  # faint vertical roller streaks in the paint
        n = 0.7 * n + 0.3 * np.repeat(coarse_noise(rng, (1, shape[1]), 3), shape[0], axis=0)
    return n * amount


# ---------------------------------------------------------------- region painters
# Each takes metre grids (S right, T up, from the face's lower-left corner) and an
# rng, and returns (colour HxWx3 in sRGB 0..1, roughness HxW, metalness HxW).
# Light is taken from above for the small amount of baked relief: a recess gets
# a dark upper lip and a pale lower one.

def fill(S, colour):
    return np.ones(S.shape + (3,)) * colour[None, None, :]


def put(c, r, m, mask, colour, rough, metal):
    c = mix(c, colour, mask)
    r = r * (1 - mask) + rough * mask
    m = m * (1 - mask) + metal * mask
    return c, r, m


def recessed_panel(c, r, S, T, s0, t0, s1, t1):
    """A pressed door/side panel: satin and darker inside, matte frame outside,
    a dark seam all round, a shadow line under its top edge and a pale line on its sill."""
    inside = smooth_box(S, T, s0, t0, s1, t1, 0.002)
    c = mix(c, PANEL, inside)
    r = r * (1 - inside) + R_PANEL * inside
    seam = outline(S, T, s0 - 0.004, t0 - 0.004, s1 + 0.004, t1 + 0.004, 0.005, 0.0015)
    c = mix(c, SEAM, seam * 0.95)
    lip = smooth_box(S, T, s0, t1 - 0.010, s1, t1, 0.003) * inside
    c = shade(c, lip * 0.35)
    sill = smooth_box(S, T, s0, t0 - 0.010, s1, t0 - 0.004, 0.0015)
    c = mix(c, HILITE, sill * 0.6)
    return c, r


def louvres(c, S, T, s0, s1, t0, count, pitch, slot_h):
    """Pressed louvres: a dark slot under a pale lip, `count` of them going up from t0."""
    for i in range(count):
        tc = t0 + i * pitch
        slot = smooth_box(S, T, s0, tc - slot_h / 2, s1, tc + slot_h / 2, 0.0015)
        lip = smooth_box(S, T, s0 - 0.003, tc + slot_h / 2, s1 + 0.003, tc + slot_h / 2 + 0.005, 0.0015)
        c = mix(c, SEAM, slot * 0.92)
        c = mix(c, HILITE, lip * 0.55)
    return c


def cabinet_shading(c, y):
    c = shade(c, np.clip(1 - (1.85 - y) / 0.14, 0, 1) * 0.40)  # under the hood
    return shade(c, np.clip(1 - (y - 0.06) / 0.10, 0, 1) * 0.30)  # at the base frame


def paint_front(S, T, rng):
    x = S - (CAB_X - CAB_CH)
    y = T + CAB_Y0
    c = fill(S, FRAME) * (1 + paint_noise(rng, S.shape, 0.018)[..., None])
    r = np.full(S.shape, R_FRAME)
    m = np.full(S.shape, M_PAINT)
    # lower service door under the fascia foot, upper fascia panel above the brow
    c, r = recessed_panel(c, r, x, y, -0.30, 0.11, 0.30, 0.555)
    c, r = recessed_panel(c, r, x, y, -0.30, 1.515, 0.30, 1.825)
    for yc in (0.20, 0.47):  # hinge knuckles on the door's left edge
        k = smooth_box(x, y, -0.318, yc - 0.035, -0.306, yc + 0.035, 0.0015)
        c, r, m = put(c, r, m, k, STEEL * 0.75, R_STEEL, M_STEEL)
    pull = smooth_box(x, y, 0.24, 0.40, 0.27, 0.51, 0.002)
    c, r, m = put(c, r, m, pull, STEEL * 0.8, R_STEEL, M_STEEL)
    c = shade(c, smooth_box(x, y, 0.24, 0.392, 0.27, 0.40, 0.002) * 0.5)
    lock, _ = disc_mask(x, y, 0.255, 0.35, 0.011, 0.0015)
    c, r, m = put(c, r, m, lock, STEEL, R_STEEL, M_STEEL)
    c = louvres(c, x, y, -0.17, 0.17, 0.19, 4, 0.034, 0.011)
    # header plate behind the runtime "SCALE TICKET" text (y ~1.75)
    plate = smooth_box(x, y, -0.27, 1.685, 0.27, 1.805, 0.002)
    c, r, m = put(c, r, m, plate, HEADER, 0.6, M_PAINT)
    c = mix(c, HILITE, outline(x, y, -0.27, 1.685, 0.27, 1.805, 0.004, 0.0015) * 0.5)
    for sx in (-0.255, 0.255):
        sc, _ = disc_mask(x, y, sx, 1.745, 0.006, 0.0015)
        c, r, m = put(c, r, m, sc, STEEL, R_STEEL, M_STEEL)
    # pocket back: the screen bay is glass-dark and glossy behind the runtime screen
    bay = smooth_box(x, y, -POCKET_X - 0.005, COL_Y_LEDGE - 0.005, POCKET_X + 0.005, COL_Y_BROW + 0.005, 0.002)
    c, r, m = put(c, r, m, bay, GLASS, R_GLASS, M_PAINT)
    c = shade(c, np.clip(1 - (COL_Y_BROW - y) / 0.06, 0, 1) * bay * 0.5)  # brow shadow
    # contact shading round the fascia and under its foot
    c = shade(c, halo(x, y, -COL_X, COL_Y_FOOT, COL_X, COL_Y_TOP, 0.018, 0.45) * (1 - bay))
    c = shade(c, np.clip(1 - (COL_Y_FOOT - y) / 0.09, 0, 1) * (y < COL_Y_FOOT)
              * smooth_box(x, y, -COL_X - 0.01, -1, COL_X + 0.01, 9, 0.02) * 0.55)
    _, dd = disc_mask(x, y, 0.0, DISC_Y, DISC_R, 0.002)
    c = shade(c, np.clip(1 - dd / 0.016, 0, 1) * (dd > 0) * 0.45)
    return cabinet_shading(c, y), r, m


def paint_side(S, T, rng):
    y = T + CAB_Y0
    W = S.max() + 0.002
    c = fill(S, FRAME) * (1 + paint_noise(rng, S.shape, 0.018)[..., None])
    r = np.full(S.shape, R_FRAME)
    m = np.full(S.shape, M_PAINT)
    c, r = recessed_panel(c, r, S, y, 0.035, 0.11, W - 0.045, 1.79)
    c = louvres(c, S, y, 0.12, W - 0.13, 1.46, 7, 0.034, 0.010)
    c = louvres(c, S, y, 0.12, W - 0.13, 0.20, 5, 0.034, 0.010)
    for sc in (0.055, W - 0.065):
        for yc in (0.16, 1.74):
            sm, _ = disc_mask(S, y, sc, yc, 0.007, 0.0015)
            c, r, m = put(c, r, m, sm, STEEL, R_STEEL, M_STEEL)
    return cabinet_shading(c, y), r, m


def paint_back(S, T, rng):
    """9 mm/px: features kept at 4 px or wider."""
    x = S - (CAB_X - CAB_CH)
    y = T + CAB_Y0
    c = fill(S, FRAME) * (1 + paint_noise(rng, S.shape, 0.018)[..., None])
    r = np.full(S.shape, R_FRAME)
    m = np.full(S.shape, M_PAINT)
    inside = smooth_box(x, y, -0.29, 0.17, 0.29, 1.73, 0.004)
    c = mix(c, PANEL, inside)
    r = r * (1 - inside) + R_PANEL * inside
    c = mix(c, SEAM, outline(x, y, -0.30, 0.16, 0.30, 1.74, 0.009, 0.004) * 0.9)
    for sx in (-0.27, 0.27):
        for sy in (0.21, 0.95, 1.69):
            sm, _ = disc_mask(x, y, sx, sy, 0.012, 0.004)
            c, r, m = put(c, r, m, sm, STEEL, R_STEEL, M_STEEL)
    for i in range(5):
        tc = 1.40 + i * 0.055
        slot = smooth_box(x, y, -0.20, tc - 0.009, 0.20, tc + 0.009, 0.004)
        c = mix(c, SEAM, slot * 0.88)
        c = mix(c, HILITE, smooth_box(x, y, -0.20, tc + 0.009, 0.20, tc + 0.02, 0.004) * 0.45)
    gland, _ = disc_mask(x, y, 0.0, 0.12, 0.03, 0.004)
    c = mix(c, BASE, gland)
    return cabinet_shading(c, y), r, m


def paint_chamfer(S, T, rng):
    y = T + CAB_Y0
    c = fill(S, FRAME * 1.06) * (1 + paint_noise(rng, S.shape, 0.015)[..., None])
    return cabinet_shading(c, y), np.full(S.shape, R_FRAME), np.full(S.shape, M_PAINT)


def paint_keypad(S, T, rng):
    """Fascia slope: S 0..0.62 across (x from -0.31), T 0..0.41 up the slope from the foot."""
    L = math.hypot(COL_Y_LEDGE - COL_Y_FOOT, COL_Z_FOOT - COL_Z_FRONT)
    x = S - COL_X
    c = fill(S, COLUMN) * (1 + paint_noise(rng, S.shape, 0.015, streak=False)[..., None])
    r = np.full(S.shape, R_COLUMN)
    m = np.full(S.shape, M_PAINT)
    kx = -0.045  # keypad box centre, left of the reader
    # contact shade round the keypad box, then the box itself (raised, light grey)
    box, bd = rounded_box(x, T, kx, 0.165, 0.135, 0.125, 0.012, 0.0015)
    c = shade(c, np.clip(1 - bd / 0.012, 0, 1) * (bd > 0) * 0.45)
    c, r, m = put(c, r, m, box, KEYPAD_BOX, 0.5, 0.1)
    c = mix(c, HILITE * 1.4, outline(x, T, kx - 0.135, 0.285, kx + 0.135, 0.29, 0.005, 0.0015) * box * 0.4)
    disp, _ = rounded_box(x, T, kx, 0.255, 0.09, 0.018, 0.004, 0.0015)
    c, r, m = put(c, r, m, disp, GLASS, R_GLASS, M_PAINT)
    for col in range(3):
        for row in range(4):
            cs = kx - 0.03 + (col - 1) * 0.055
            ct = 0.07 + row * 0.042
            key, d = rounded_box(x, T, cs, ct, 0.022, 0.015, 0.005, 0.0012)
            c = shade(c, np.clip(1 - d / 0.004, 0, 1) * (d > 0) * 0.55)
            c, r, m = put(c, r, m, key, KEY, 0.3, 0.7)
            c = mix(c, KEY * 1.15, smooth_box(x, T, cs - 0.02, ct + 0.009, cs + 0.02, ct + 0.015, 0.001) * key * 0.5)
    for ct, colr in ((0.175, srgb(170, 58, 48)), (0.10, srgb(58, 150, 80))):  # cancel / enter
        key, d = rounded_box(x, T, kx + 0.095, ct, 0.022, 0.028, 0.005, 0.0012)
        c = shade(c, np.clip(1 - d / 0.004, 0, 1) * (d > 0) * 0.5)
        c, r, m = put(c, r, m, key, colr, 0.35, 0.0)
    # ticket slot across the head of the slope, in a brushed steel trim
    trim, td = rounded_box(x, T, kx, 0.358, 0.15, 0.022, 0.006, 0.0012)
    c = shade(c, np.clip(1 - td / 0.006, 0, 1) * (td > 0) * 0.4)
    brushed = 1 + np.repeat(coarse_noise(rng, (S.shape[0], 1), 2), S.shape[1], axis=1) * 0.03
    c, r, m = put(c, r, m, trim, STEEL, R_STEEL, M_STEEL)
    c = c * np.where(trim[..., None] > 0.5, brushed[..., None], 1.0)
    slit, _ = rounded_box(x, T, kx, 0.356, 0.13, 0.0065, 0.003, 0.001)
    c = mix(c, SHADOW_LIP, smooth_box(x, T, kx - 0.13, 0.3625, kx + 0.13, 0.368, 0.001) * trim * 0.8)
    c, r, m = put(c, r, m, slit, SLIT, 0.6, 0.0)
    led, _ = disc_mask(x, T, kx + 0.165, 0.358, 0.005, 0.001)
    c = mix(c, srgb(60, 175, 95), led)
    # reader contact shade
    c = shade(c, halo(x, T, READER_X0, READER_S0, READER_X1, READER_S1, 0.012, 0.4))
    c = shade(c, np.clip(1 - (READER_S0 - T) / 0.05, 0, 1) * (T < READER_S0)
              * smooth_box(x, T, READER_X0 - 0.005, -1, READER_X1 + 0.005, 9, 0.01) * 0.45)
    # rolled foot and head edges catch the light
    edge = np.clip(1 - np.minimum(T, L - T) / 0.008, 0, 1)
    c = c * (1 + edge[..., None] * 0.2)
    return c, r, m


SHADOW_LIP = srgb(40, 44, 50)


def paint_reader(S, T, rng):
    """Reader face: S 0..0.09, T 0..0.186 up the face."""
    W, H = READER_X1 - READER_X0, math.hypot(READER_S1 - READER_S0, READER_D - READER_SINK)
    c = fill(S, READER) * (1 + paint_noise(rng, S.shape, 0.03, streak=False)[..., None])
    r = np.full(S.shape, R_PLASTIC)
    m = np.full(S.shape, M_PAINT)
    rim, _ = rounded_box(S, T, W / 2, 0.128, 0.013, 0.042, 0.006, 0.0012)
    slit, _ = rounded_box(S, T, W / 2, 0.128, 0.0035, 0.036, 0.003, 0.001)
    c, r, m = put(c, r, m, rim, READER_RIM, R_STEEL, 0.6)
    c, r, m = put(c, r, m, slit, SLIT, 0.6, 0.0)
    pad, _ = rounded_box(S, T, W / 2, 0.045, 0.030, 0.028, 0.006, 0.0012)
    ring = np.clip(pad - rounded_box(S, T, W / 2, 0.045, 0.025, 0.023, 0.005, 0.0012)[0], 0, 1)
    c = mix(c, READER_RIM, ring * 0.8)
    c, r, m = put(c, r, m, np.clip(pad - ring, 0, 1), srgb(28, 34, 40), R_GLASS, 0.0)
    c = mix(c, READER_RIM, outline(S, T, 0.0, 0.0, W, H, 0.003, 0.0015) * 0.5)
    return c, r, m


def paint_disc(S, T, rng):
    """Planar projection, centre at the region centre, dome radius DISC_R."""
    cc = REGIONS['disc'][2] * DISC_MPP / 2
    c = fill(S, DISC)
    r = np.full(S.shape, 0.6)
    m = np.zeros(S.shape)
    rr = np.hypot(S - cc, T - cc)
    rim = np.clip((rr - (DISC_R - 0.011)) / 0.002, 0, 1)
    c, r, m = put(c, r, m, rim, DISC_RIM, R_STEEL, M_STEEL)
    pitch = 0.0095
    rows = np.round((T - cc) / (pitch * 0.866))
    ss = (S - cc) / pitch - 0.5 * (rows % 2)
    ds = (ss - np.round(ss)) * pitch
    dt = (T - cc) - rows * pitch * 0.866
    hole = np.clip(0.5 - (np.hypot(ds, dt) - 0.0026) / 0.0012, 0, 1) * (rr < DISC_R - 0.02)
    c = mix(c, HOLE, hole)
    return c, r, m


def paint_hoodtop(S, T, rng):
    """Hood top: S 0..0.95 (x from -0.475), T 0..0.85 back from the front edge.
    One even powder-coat value: no blotches, a very small noise range."""
    W, D = 2 * (HOOD_X - HOOD_INSET), 2 * (HOOD_Z - HOOD_INSET)
    c = fill(S, HOOD) * (1 + (0.6 * coarse_noise(rng, S.shape, 20) + 0.4 * coarse_noise(rng, S.shape, 7))[..., None] * 0.010)
    r = np.full(S.shape, R_HOOD)
    m = np.full(S.shape, M_PAINT)
    d_edge = np.minimum.reduce([S, W - S, T, D - T])
    c = shade(c, np.clip(1 - d_edge / 0.03, 0, 1) * 0.06)  # light grime where water runs off
    for sx in (0.09, W - 0.09):  # lifting-eye caps
        for tz in (0.09, D - 0.09):
            cap, cd = disc_mask(S, T, sx, tz, 0.016, 0.003)
            c = shade(c, np.clip(1 - cd / 0.006, 0, 1) * (cd > 0) * 0.3)
            c, r, m = put(c, r, m, cap, HOOD * 0.8, R_STEEL, 0.3)
    return c, r, m


def paint_hoodside(S, T, rng):
    """Fitted: T 0..1 up the band. Darker drip edge at the bottom."""
    t = T / max(T.max(), 1e-6)
    c = fill(S, HOOD * 0.96)
    c = shade(c, np.clip(1 - t / 0.12, 0, 1) * 0.35)
    return c, np.full(S.shape, R_HOOD), np.full(S.shape, M_PAINT)


def paint_flat(colour, noise, rough, metal):
    def painter(S, T, rng):
        c = fill(S, colour) * (1 + paint_noise(rng, S.shape, noise, streak=False)[..., None])
        return c, np.full(S.shape, rough), np.full(S.shape, metal)
    return painter


PAINTERS = {
    'front': paint_front,
    'side': paint_side,
    'chamfer': paint_chamfer,
    'back': paint_back,
    'hoodtop': paint_hoodtop,
    'keypad': paint_keypad,
    'reader': paint_reader,
    'disc': paint_disc,
    'column': paint_flat(COLUMN, 0.015, R_COLUMN, M_PAINT),
    'pocket': paint_flat(POCKET, 0.02, 0.5, M_PAINT),
    'darksteel': paint_flat(READER * 1.5, 0.03, R_PLASTIC, M_PAINT),
    'hoodside': paint_hoodside,
    'hoodunder': paint_flat(HOOD_UNDER, 0.02, 0.7, M_PAINT),
    'base': paint_flat(BASE, 0.03, 0.6, 0.3),
    'underside': paint_flat(COLUMN * 0.6, 0.02, R_COLUMN, M_PAINT),
}


def region_mpp(mpp):
    if mpp is None:
        return 0.004, 0.004
    if isinstance(mpp, tuple):
        return mpp
    return mpp, mpp


def build_maps():
    rng = np.random.default_rng(SEED)
    colour = np.zeros((TEX, TEX, 3))
    mr = np.zeros((TEX, TEX, 3))
    owned = np.zeros((TEX, TEX), dtype=bool)
    for name, (u0, v0, w, h, mpp) in REGIONS.items():
        ms, mt = region_mpp(mpp)
        S, T = np.meshgrid((np.arange(w) + 0.5) * ms, (np.arange(h) + 0.5) * mt)
        c, rough, metal = PAINTERS[name](S, T, rng)
        if owned[v0:v0 + h, u0:u0 + w].any():
            raise SystemExit(f'atlas region {name} overlaps another')
        colour[v0:v0 + h, u0:u0 + w] = np.clip(c, 0, 1)
        # glTF metallicRoughness: G roughness, B metalness (R unused, kept at 1)
        mr[v0:v0 + h, u0:u0 + w] = np.stack([np.ones_like(rough), np.clip(rough, 0.04, 1), np.clip(metal, 0, 1)], axis=-1)
        owned[v0:v0 + h, u0:u0 + w] = True
    # dilate region content into the gutters so mip filtering never pulls black in
    for _ in range(4):
        for axis, step in ((0, 1), (0, -1), (1, 1), (1, -1)):
            src = np.roll(owned, step, axis=axis)
            take = src & ~owned
            colour[take] = np.roll(colour, step, axis=axis)[take]
            mr[take] = np.roll(mr, step, axis=axis)[take]
            owned |= take
    print(f'KIOSK_MAPS unmapped px filled {int((~owned).sum())}')
    colour[~owned] = FRAME
    mr[~owned] = (1.0, R_FRAME, 0.0)
    return colour, mr


def make_image(name, rgb, non_color):
    size = rgb.shape[0]
    img = bpy.data.images.new(name, size, size, alpha=False, is_data=non_color)
    # Colour space and format BEFORE the pixels: changing either on a generated
    # image resets its buffer.
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.file_format = 'JPEG'
    rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], axis=-1).astype(np.float32)
    img.pixels.foreach_set(rgba.reshape(-1))  # Blender rows are bottom-first, as are ours
    img.update()
    back = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(back)
    if np.abs(back - rgba.reshape(-1)).max() > 3e-3:
        raise SystemExit(f'{name}: pixel buffer did not take the authored values')
    img.pack()
    return img


def make_material():
    colour, mr = build_maps()
    col_img = make_image('yard-scale-kiosk-body-colour', colour, non_color=False)
    # Roughness and metal change only at part boundaries, so half resolution
    # (2x2 mean) holds them and keeps the byte budget for the colour map.
    mr_half = mr.reshape(TEX // 2, 2, TEX // 2, 2, 3).mean(axis=(1, 3))
    mr_img = make_image('yard-scale-kiosk-body-metalrough', mr_half, non_color=True)
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # glTF doubleSided: false, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col_node = nodes.new('ShaderNodeTexImage')
    col_node.image = col_img
    links.new(col_node.outputs['Color'], bsdf.inputs['Base Color'])
    mr_node = nodes.new('ShaderNodeTexImage')
    mr_node.image = mr_img
    try:
        sep = nodes.new('ShaderNodeSeparateColor')
        g_out, b_out = sep.outputs['Green'], sep.outputs['Blue']
    except RuntimeError:
        sep = nodes.new('ShaderNodeSeparateRGB')
        g_out, b_out = sep.outputs['G'], sep.outputs['B']
    links.new(mr_node.outputs['Color'], sep.inputs[0])
    links.new(g_out, bsdf.inputs['Roughness'])
    links.new(b_out, bsdf.inputs['Metallic'])
    return mat


# ---------------------------------------------------------------- geometry

def v3(*a):
    return np.array(a, dtype=np.float64)


UP = v3(0, 1, 0)


def unit(a):
    return a / np.linalg.norm(a)


def face_frame(n):
    """Viewer's right (s) and up (t) on a face with outward normal n."""
    if abs(n[1]) > 0.999:
        s = v3(1, 0, 0)
    else:
        s = unit(np.cross(UP, n))
    t = np.cross(n, s)
    return s, t


class Builder:
    def __init__(self):
        self.verts = []    # glTF positions
        self.faces = []    # vertex index lists
        self.uvs = []      # per face, per corner
        self.normals = []  # per face, per corner (glTF)
        self.parts = {}
        self.face_normals = []  # geometric, per face (glTF)

    def face(self, pts, region, outward, part, normals=None, frame_normal=None, st_origin=None):
        pts = [v3(*p) for p in pts]
        outward = unit(v3(*outward))
        geo_n = unit(np.cross(pts[1] - pts[0], pts[2] - pts[0]))
        if geo_n.dot(outward) < 0:
            pts = pts[::-1]
            if normals is not None:
                normals = normals[::-1]
            geo_n = -geo_n
        if geo_n.dot(outward) < 0.5:
            raise SystemExit(f'{part}: face normal {geo_n} disagrees with intended {outward}')
        s_ax, t_ax = face_frame(frame_normal if frame_normal is not None else geo_n)
        S = [p.dot(s_ax) for p in pts]
        T = [p.dot(t_ax) for p in pts]
        u0, v0, w, h, mpp = REGIONS[region]
        if st_origin is not None:
            s0, t0 = st_origin
        else:
            s0, t0 = min(S), min(T)
        if mpp is None:
            scale_s = (max(S) - s0) / (w - 2 * INSET)
            scale_t = (max(T) - t0) / (h - 2 * INSET)
            off = INSET
        else:
            scale_s, scale_t = region_mpp(mpp)
            off = 0.0
        uv = []
        for s, t in zip(S, T):
            pu = off + (s - s0) / scale_s
            pv = off + (t - t0) / scale_t
            if mpp is not None and not (-0.01 <= pu <= w + 0.01 and -0.01 <= pv <= h + 0.01):
                raise SystemExit(f'{part}: UV ({pu:.1f}, {pv:.1f}) px leaves region {region} ({w}x{h})')
            uv.append(((u0 + pu) / TEX, (v0 + pv) / TEX))
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(list(range(base, base + len(pts))))
        self.face_normals.append(geo_n)
        self.uvs.append(uv)
        self.normals.append([unit(v3(*nn)) for nn in normals] if normals is not None else [geo_n] * len(pts))
        self.parts[part] = self.parts.get(part, 0) + len(pts) - 2

    def fan(self, pts, region, outward, part):
        """A (possibly concave) planar polygon as explicit fan triangles from pts[0],
        sharing one texture origin so the map runs unbroken across them."""
        pts = [v3(*p) for p in pts]
        n = unit(v3(*outward))
        s_ax, t_ax = face_frame(n)
        origin = (min(p.dot(s_ax) for p in pts), min(p.dot(t_ax) for p in pts))
        for i in range(1, len(pts) - 1):
            self.face([pts[0], pts[i], pts[i + 1]], region, outward, part, frame_normal=n, st_origin=origin)

    def triangles(self):
        return sum(len(f) - 2 for f in self.faces)


def outward_normal(pts, mid_hint):
    """Geometric normal of a planar quad, flipped to point away from mid_hint."""
    n = unit(np.cross(pts[1] - pts[0], pts[3] - pts[0]))
    centre = sum(pts) / len(pts)
    return n if n.dot(centre - mid_hint) > 0 else -n


def cab_ring(y):
    t = (y - CAB_Y0) / (CAB_Y1 - CAB_Y0)
    X = CAB_X - TAPER * t
    ZB = CAB_ZB + TAPER * t
    ZF, C = CAB_ZF, CAB_CH
    return [(-X + C, ZF), (X - C, ZF), (X, ZF - C), (X, ZB + C), (X - C, ZB), (-X + C, ZB), (-X, ZB + C), (-X, ZF - C)]


def build_cabinet(b):
    """Octagonal section lofted between two stations; chamfer corners carry the
    normals of the faces they join, so each shades as a rolled radius."""
    lo, hi = cab_ring(CAB_Y0), cab_ring(CAB_Y1)
    regions = ['front', 'chamfer', 'side', 'chamfer', 'back', 'chamfer', 'side', 'chamfer']
    axis = v3(0, (CAB_Y0 + CAB_Y1) / 2, (CAB_ZF + CAB_ZB) / 2)
    quads, normals = [], []
    for i in range(8):
        j = (i + 1) % 8
        q = [v3(lo[i][0], CAB_Y0, lo[i][1]), v3(lo[j][0], CAB_Y0, lo[j][1]),
             v3(hi[j][0], CAB_Y1, hi[j][1]), v3(hi[i][0], CAB_Y1, hi[i][1])]
        quads.append(q)
        normals.append(outward_normal(q, axis))
    for i in range(8):
        n = normals[i]
        if i % 2 == 0:
            ns = [n] * 4
        else:
            prev_n, next_n = normals[i - 1], normals[(i + 1) % 8]
            ns = [prev_n, next_n, next_n, prev_n]
        b.face(quads[i], regions[i], n, 'cabinet', normals=ns)


def build_hood(b):
    """Frustum slab: sloped band rolling its normals from horizontal to HOOD_ROLL_DEG up."""
    X, Z, I = HOOD_X, HOOD_Z, HOOD_INSET
    lo = [(-X, -Z), (X, -Z), (X, Z), (-X, Z)]
    hi = [(-X + I, -Z + I), (X - I, -Z + I), (X - I, Z - I), (-X + I, Z - I)]
    a = math.radians(HOOD_ROLL_DEG)
    for i in range(4):
        j = (i + 1) % 4
        nh = [v3(0, 0, -1), v3(1, 0, 0), v3(0, 0, 1), v3(-1, 0, 0)][i]
        nt = unit(nh * math.cos(a) + UP * math.sin(a))
        q = [(lo[i][0], HOOD_Y0, lo[i][1]), (lo[j][0], HOOD_Y0, lo[j][1]),
             (hi[j][0], HOOD_Y1, hi[j][1]), (hi[i][0], HOOD_Y1, hi[i][1])]
        b.face(q, 'hoodside', nh + UP * 0.25, 'hood', normals=[nh, nh, nt, nt])
    b.face([(x, HOOD_Y1, z) for x, z in hi], 'hoodtop', UP, 'hood')
    b.face([(x, HOOD_Y0, z) for x, z in lo], 'hoodunder', -UP, 'hood')


def build_base(b):
    X, ZF, ZB, Y1 = BASE_X, BASE_ZF, BASE_ZB, BASE_Y1
    lo = [(-X, ZB), (X, ZB), (X, ZF), (-X, ZF)]
    for i in range(4):
        (ax, az), (bx, bz) = lo[i], lo[(i + 1) % 4]
        n = [v3(0, 0, -1), v3(1, 0, 0), v3(0, 0, 1), v3(-1, 0, 0)][i]
        b.face([(ax, 0.0, az), (bx, 0.0, bz), (bx, Y1, bz), (ax, Y1, az)], 'base', n, 'base')
    b.face([(x, Y1, z) for x, z in lo], 'base', UP, 'base')


def build_fascia(b):
    """The front fascia, traced as one side profile (y, z) and extruded across
    x +-COL_X, with the screen pocket cut between ledge, jambs and brow:

        E (1.47, seat)  brow top meets the face
        D (1.40, 0.27)  jamb head / brow front edge
        C (1.00, 0.27)  ledge front edge / head of the keypad slope
        B (0.60, 0.36)  foot front
        A (0.60, seat)  foot back
    """
    X, P = COL_X, POCKET_X
    A = (COL_Y_FOOT, SEAT)
    B = (COL_Y_FOOT, COL_Z_FOOT)
    C = (COL_Y_LEDGE, COL_Z_FRONT)
    D = (COL_Y_BROW, COL_Z_FRONT)
    E = (COL_Y_TOP, SEAT)

    def strip(p, q, x0, x1, region, outward):
        b.face([(x0, p[0], p[1]), (x1, p[0], p[1]), (x1, q[0], q[1]), (x0, q[0], q[1])], region, outward, 'fascia')

    strip(A, B, -X, X, 'underside', (0, -1, 0))
    strip(B, C, -X, X, 'keypad', (0, B[1] - C[1], C[0] - B[0]))
    strip(C, (COL_Y_LEDGE, SEAT), -P, P, 'column', (0, 1, 0))          # pocket floor (ledge)
    strip(C, D, P, X, 'column', (0, 0, 1))                              # right jamb front
    strip(C, D, -X, -P, 'column', (0, 0, 1))                            # left jamb front
    strip(D, (COL_Y_BROW, SEAT), -P, P, 'pocket', (0, -1, 0))          # pocket ceiling
    strip(D, E, -X, X, 'column', (0, D[1] - E[1], E[0] - D[0]))        # brow top
    for x, n in ((P, (-1, 0, 0)), (-P, (1, 0, 0))):                     # pocket inner walls
        b.face([(x, COL_Y_LEDGE, SEAT), (x, COL_Y_LEDGE, COL_Z_FRONT),
                (x, COL_Y_BROW, COL_Z_FRONT), (x, COL_Y_BROW, SEAT)], 'pocket', n, 'fascia')
    for x, n in ((X, (1, 0, 0)), (-X, (-1, 0, 0))):                     # end cheeks
        b.fan([(x, y, z) for y, z in (A, B, C, D, E)], 'column', n, 'fascia')


def slope_point(x, s, d):
    """A point on the keypad slope: s metres up the slope from the foot edge, d proud of it."""
    by, bz = COL_Y_FOOT, COL_Z_FOOT
    L = math.hypot(COL_Y_LEDGE - by, bz - COL_Z_FRONT)
    uy, uz = (COL_Y_LEDGE - by) / L, (COL_Z_FRONT - bz) / L
    ny, nz = -uz, uy
    return (x, by + uy * s + ny * d, bz + uz * s + nz * d)


def build_reader(b):
    """Closed wedge on the slope: tipped face, a top, two cheeks; the slope is its back."""
    x0, x1, s0, s1, d, k = READER_X0, READER_X1, READER_S0, READER_S1, READER_D, READER_SINK
    f0, f1 = slope_point(x0, s0, k), slope_point(x1, s0, k)
    t0, t1 = slope_point(x0, s1, d), slope_point(x1, s1, d)
    h0, h1 = slope_point(x0, s1, k), slope_point(x1, s1, k)
    up_slope = unit(v3(0, *slope_point(0, 1, 0)[1:]) - v3(0, *slope_point(0, 0, 0)[1:]))
    face_n = unit(np.cross(v3(*f1) - v3(*f0), v3(*t0) - v3(*f0)))
    if face_n[2] < 0:
        face_n = -face_n
    b.face([f0, f1, t1, t0], 'reader', face_n, 'reader')
    b.face([t0, t1, h1, h0], 'darksteel', up_slope, 'reader')
    b.face([f1, t1, h1], 'darksteel', (1, 0, 0), 'reader')
    b.face([f0, t0, h0], 'darksteel', (-1, 0, 0), 'reader')


def build_disc(b, cx=0.0, cy=DISC_Y, r=DISC_R, z_rim=0.199, z_apex=0.213, sides=8):
    h = z_apex - z_rim
    R = (r * r + h * h) / (2 * h)  # sphere through rim and apex
    centre = v3(cx, cy, z_apex - R)
    apex = v3(cx, cy, z_apex)
    cc = REGIONS['disc'][2] * DISC_MPP / 2
    rim = []
    for i in range(sides):
        a = 2 * math.pi * (i + 0.5) / sides
        rim.append(v3(cx + r * math.cos(a), cy + r * math.sin(a), z_rim))
    for i in range(sides):
        p0, p1 = rim[i], rim[(i + 1) % sides]
        ns = [unit(p - centre) for p in (p0, p1, apex)]
        b.face([p0, p1, apex], 'disc', (0, 0, 1), 'disc', normals=ns, frame_normal=v3(0, 0, 1),
               st_origin=(cx - cc, cy - cc))


def build_mesh(mat):
    b = Builder()
    build_cabinet(b)
    build_hood(b)
    build_base(b)
    build_fascia(b)
    build_reader(b)
    build_disc(b)
    tris = b.triangles()
    print(f'KIOSK_PARTS {b.parts}')
    if tris * 3 > INDEX_BUDGET:
        raise SystemExit(f'{tris * 3} indices exceeds the {INDEX_BUDGET}-index budget')

    def to_blender(p):
        return (float(p[0]), float(-p[2]), float(p[1]))

    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata([to_blender(p) for p in b.verts], [], b.faces)
    mesh.update()
    flipped = 0
    for poly in mesh.polygons:
        geo = b.face_normals[poly.index]
        if poly.normal.dot(to_blender(geo)) <= 0:
            flipped += 1
    if flipped:
        raise SystemExit(f'{flipped} faces wound inward')
    uv_layer = mesh.uv_layers.new(name='UVMap')
    loop_normals = [None] * len(mesh.loops)
    for poly in mesh.polygons:
        poly.use_smooth = True
        corner = {v: k for k, v in enumerate(b.faces[poly.index])}
        for li in poly.loop_indices:
            k = corner[mesh.loops[li].vertex_index]
            uv_layer.data[li].uv = b.uvs[poly.index][k]
            loop_normals[li] = to_blender(b.normals[poly.index][k])
    mesh.normals_split_custom_set(loop_normals)
    mesh.materials.append(mat)
    pts = np.array(b.verts)
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    print(f'KIOSK_BOUNDS min {lo.round(4).tolist()} max {hi.round(4).tolist()}')
    # keep-out: nothing in front of z 0.205 inside the runtime screen rect
    for p in pts:
        if abs(p[0]) < 0.25 and 1.025 < p[1] < 1.375 and p[2] > 0.205:
            raise SystemExit(f'vertex {p} intrudes on the runtime screen')
    return mesh, tris


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
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_image_format='JPEG',
        export_jpeg_quality=JPEG_QUALITY,
        export_image_quality=JPEG_QUALITY,
        export_vertex_color='NONE',
        export_colors=False,
        export_copyright='MillOS authored geometry',
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})


def main():
    path = out_path()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    mat = make_material()
    mesh, tris = build_mesh(mat)
    obj = bpy.data.objects.new(NODE_NAME, mesh)
    scene.collection.objects.link(obj)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    export(path)
    size = os.path.getsize(path)
    print(f'KIOSK_BUILT {path} triangles={tris} indices={tris * 3} bytes={size}')
    if size > BYTE_BUDGET:
        raise SystemExit(f'{size} bytes exceeds the {BYTE_BUDGET}-byte budget')


main()
