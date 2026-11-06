"""Station shop shelving (world-station-shelving), built from scratch in headless Blender.

What it builds
--------------
The wall-standing goods gondola at the back of the station shop, 0.65 m deep (X)
x 4.0 m tall (Y) x 6.0 m long (Z), origin at the ground centre, shelves facing
three.js +X (the aisle), exactly the envelope the delivered model and the
GasStationInstanced fallback occupy. The contract allows 180 render vertices,
counted as indices, i.e. 60 triangles. This build spends all 60.

Construction (round 3): the long members are LOFTED from traced cross-section
profiles instead of being stacked boxes, so their edges are modelled, not
shaded:

* the top rail is one loft of the profile back-top -> front-top -> 45 degree
  chamfer -> fascia, run the full 6 m over both gable ends (a cap moulding in
  silhouette from every end and oblique view);
* each shelf is a loft of a lipped profile: board top, a 25 mm upstand lip on
  the front edge (a fiddle rail, its back face never visible from the aisle),
  the board front, and an underside where a standing eye can see it;
* the plinth is a recessed charcoal kick plate (60 mm toe space) under a
  wooden deck nosing, notched into the foot of both gables so the plinth reads
  in the corner silhouettes;
* the gable ends are traced as one polygon (toe notch, front, chamfer, top,
  back), not a box;
* the shelves are carried by two slotted steel standards on the back board at
  z = +-0.98, splitting the run into three equal 1.96 m bays. Packets stand at
  x >= 0.105 and the standards' faces at x = -0.003, so no runtime packet
  meets them.

Colour (one material, one 512 x 256 JPEG; no normal map, so the whole byte
budget goes to the colour atlas). The board faces are laid on full-height atlas
columns that REPEAT in v, so the back boards get 8-12 mm texels with crisp
two-texel seams instead of one smeared texel:

* inner back: one 1.96 m bay repeated three times (four 0.49 m boards per bay,
  the standards and gables sit exactly on the period boundary);
* outer back: a 3.0 m run of six 0.5 m boards repeated twice, between a
  charcoal plinth band and a lighter capping rail.

Runtime anchors kept (src/components/scenery/StationRetailDetails.tsx, station
local = GLB local - 14.825 in X): the shelf front stays at x = 0.325 from the
underside to 25 mm above the top, so the shelf leading-edge strips (x
0.321-0.345, shelf centre +-0.0275) still sit on it and the price labels (x
0.348) in front of it; packets at x 0.105-0.245 stand on the shelf tops
(0.84 / 1.64 / 2.44 / 3.24); the two runtime end dividers (x -0.15..-0.08,
z +-2.72) stay inside the back board, whose face is still at x = -0.025.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/station-shelving.py -- <out.glb>

Re-runnable and deterministic (seeded noise). Writes only <out.glb>; the
texture is staged in a temporary directory that is removed afterwards. The
script lowers JPEG quality in fixed steps until the GLB is under MAX_BYTES.
"""

import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
import numpy as np

# ---------------------------------------------------------------- dimensions (three.js metres)
HX = 0.325           # half depth: back at -HX, front at +HX
HEIGHT = 4.0
HZ = 3.0             # half length
GABLE = 0.06
ZI = HZ - GABLE      # inner face of each gable
BACK_FRONT = -0.025  # front face of the back board (unchanged from the delivery)
PLINTH = 0.12        # kick plate height
TOE = 0.06           # kick plate set back from the front
DECK_TOP = 0.16
HEADER_BOTTOM = 3.78
CHAMFER = 0.07       # 45 degree cap chamfer on the top front edge
SHELF_Y = (0.8, 1.6, 2.4, 3.2)  # shelf centres; tops at +0.04
SHELF_T = 0.08
LIP = 0.025          # upstand lip on each shelf front
UNDERSIDE_MIN_Y = 1.8  # undersides only where a standing eye (1.6-1.7 m) sees them
BAY = 2 * ZI / 3     # 1.96 m: three equal bays
STANDARD_Z = (-BAY / 2, BAY / 2)
STANDARD_W = 0.08     # gondola upright face
STANDARD_X = BACK_FRONT + 0.022
BOARD_IN = BAY / 4   # 0.49 m boards on the inner back
BOARD_OUT = 0.5      # outer back boards
OUT_PERIOD = 3.0     # outer back repeat

NODE_NAME = 'Station-shelvingBody'
MESH_NAME = 'station-shelving-mesh'
MATERIAL_NAME = 'station-shelving-surface'
SCENE_NAME = 'MillOS_World_Station-shelving'
MAX_BYTES = 23500
QUALITIES = (90, 87, 84, 81, 78, 75, 72, 68, 64)

# ---------------------------------------------------------------- atlas
TW, TH = 512, 256
SS = 2
# name: (x0, y0, x1, y1) in pixels, y bottom-first. The first five are
# full-height columns; 'back' and 'back_out' repeat in v (sampler wrap is the
# glTF default REPEAT).
REGIONS = {
    'back': (0, 0, 176, 256),        # u: y deck..header, v: z within one bay
    'back_out': (180, 0, 276, 256),  # u: y 0..4, v: one 3 m board run
    'gable_out': (280, 0, 320, 256),  # u: x, v: y 0..4
    'gable_in': (324, 0, 348, 256),  # u: x, v: y deck..header
    'standard': (352, 0, 362, 256),  # u: across 80 mm, v: y deck..header
    'shelf_top': (366, 0, 512, 28),   # u: z, v: x
    'shelf_front': (366, 32, 512, 50),  # u: z, v: y underside..lip top
    'shelf_bot': (366, 54, 512, 66),
    'cap': (366, 70, 512, 118),       # u: z, v: arc length along the cap profile
    'plinth': (366, 122, 512, 138),   # u: z, v: y 0..deck top
    'deck': (366, 142, 512, 156),
    'head_under': (366, 160, 512, 172),
    'post': (366, 176, 512, 186),     # gable fronts; u: y, v: across 60 mm
}
GUTTER = 2

# sRGB palette. FRAME (inner back) and SHELF keep the delivered hues.
FRAME = np.array([93, 66, 58], np.float32)
BACK_OUT = np.array([124, 91, 76], np.float32)
GABLE_C = np.array([116, 84, 71], np.float32)
SHELF = np.array([160, 126, 109], np.float32)
SHELF_UNDER = np.array([124, 97, 84], np.float32)
NOSING = np.array([180, 146, 126], np.float32)
CLEAT = np.array([126, 96, 82], np.float32)
FASCIA = np.array([98, 70, 60], np.float32)
CAP = np.array([138, 104, 87], np.float32)
KICK = np.array([44, 43, 43], np.float32)
DECK = np.array([132, 102, 88], np.float32)
STEEL = np.array([150, 154, 156], np.float32)
SLOT = np.array([36, 38, 41], np.float32)


# ---------------------------------------------------------------- noise helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def value_noise(x, y, cells_x, cells_y, seed, wrap_y=False):
    """Seeded smooth value noise in [0,1] over x, y in [0,1]; optionally periodic in y."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells_y + 2, cells_x + 2)).astype(np.float32)
    if wrap_y:
        grid[cells_y] = grid[0]
        grid[cells_y + 1] = grid[1]
    gx = np.clip(x, 0.0, 1.0) * cells_x
    gy = np.clip(y, 0.0, 1.0) * cells_y
    ix = np.minimum(np.floor(gx).astype(np.int32), cells_x)
    iy = np.minimum(np.floor(gy).astype(np.int32), cells_y)
    fx = gx - ix
    fy = gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = grid[iy, ix]
    b = grid[iy, ix + 1]
    c = grid[iy + 1, ix]
    d = grid[iy + 1, ix + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def grain(along, across, n_along, n_across, seed, wrap_across=False):
    """Wood figure: long streaks (few cells along the grain, many across), about [-1, 1].
    `along` is the first noise axis, `across` the second (the one that may wrap)."""
    a = value_noise(along, across, n_along, n_across, seed, wrap_across)
    b = value_noise(along, across, n_along * 2, n_across * 2, seed + 2, wrap_across)
    return (a - 0.5) * 1.4 + (b - 0.5) * 0.6


def shade(base, factor):
    return base[None, None, :] * factor[..., None]


def seam_profile(d, half_px, mpp):
    """Groove darkening for distance d (metres) to a board joint: a hard core
    `half_px` texels either side, with a half-texel antialiased edge."""
    core = half_px * mpp
    return 1.0 - smoothstep(core, core + 0.6 * mpp, d)


class Atlas:
    """Colour canvas, supersampled, rows bottom-first."""

    def __init__(self):
        self.rgb = np.zeros((TH * SS, TW * SS, 3), np.float32)
        self.rgb[:] = FRAME
        cx = (np.arange(TW * SS, dtype=np.float32) + 0.5) / SS
        cy = (np.arange(TH * SS, dtype=np.float32) + 0.5) / SS
        self.px, self.py = np.meshgrid(cx, cy)

    def paint(self, name, fn):
        """fn(fu, fv) -> rgb[h,w,3]; fu/fv in [0,1] across the region, clamped in the gutter."""
        x0, y0, x1, y1 = REGIONS[name]
        sx0, sy0 = max(0, (x0 - GUTTER) * SS), max(0, (y0 - GUTTER) * SS)
        sx1, sy1 = min(TW * SS, (x1 + GUTTER) * SS), min(TH * SS, (y1 + GUTTER) * SS)
        px = self.px[sy0:sy1, sx0:sx1]
        py = self.py[sy0:sy1, sx0:sx1]
        fu = np.clip((px - x0) / (x1 - x0), 0.0, 1.0)
        fv = np.clip((py - y0) / (y1 - y0), 0.0, 1.0)
        self.rgb[sy0:sy1, sx0:sx1] = fn(fu, fv)

    def colour_bytes(self):
        s = SS
        a = self.rgb.reshape(TH, s, TW, s, 3).mean(axis=(1, 3))
        return np.clip(np.round(a), 0, 255).astype(np.uint8)


def uvr(name, fu, fv):
    x0, y0, x1, y1 = REGIONS[name]
    return ((x0 + fu * (x1 - x0)) / TW, (y0 + fv * (y1 - y0)) / TH)


def mpp(name, axis, metres):
    """Metres per texel along a region axis (0 = u, 1 = v) that spans `metres`."""
    x0, y0, x1, y1 = REGIONS[name]
    return metres / ((x1 - x0) if axis == 0 else (y1 - y0))


# ---------------------------------------------------------------- texture regions
def shelf_shadows(y, strength_below=0.40, strength_above=0.30):
    occ = np.zeros_like(y)
    for yc in SHELF_Y:
        lo, hi = yc - SHELF_T / 2, yc + SHELF_T / 2
        below = lo - y
        above = y - hi
        occ = np.maximum(occ, np.where(below > 0, strength_below * np.exp(-below / 0.12), 0.0))
        occ = np.maximum(occ, np.where(above > 0, strength_above * np.exp(-above / 0.05), 0.0))
    return occ


def paint_back(fu, fv):
    """Inner back, one bay: vertical tongue-and-groove boards, rear cleats, contact shadow."""
    y = DECK_TOP + fu * (HEADER_BOTTOM - DECK_TOP)
    zb = fv * BAY
    m = mpp('back', 1, BAY)
    board = np.floor(zb / BOARD_IN).astype(np.int32) % 4
    tint = np.array([1.0, 0.93, 1.05, 0.97], np.float32)[board]
    g = grain(fu, fv, 4, 48, 11, wrap_across=True)
    f = tint * (1.0 + 0.05 * g)
    local = zb % BOARD_IN
    d = np.minimum(local, BOARD_IN - local)
    f *= 1.0 - 0.55 * seam_profile(d, 1.0, m)
    # One-texel catch light on the right lip of each groove.
    f *= 1.0 + 0.14 * ((local > 1.0 * m) & (local < 2.2 * m))
    occ = shelf_shadows(y)
    occ = np.maximum(occ, 0.30 * np.exp(-(y - DECK_TOP) / 0.06))
    occ = np.maximum(occ, 0.40 * np.exp(-(HEADER_BOTTOM - y) / 0.14))
    # Gables and steel standards both sit on the bay boundary.
    edge = np.maximum(np.minimum(zb, BAY - zb) - STANDARD_W / 2, 0.0)
    occ = np.maximum(occ, 0.34 * np.exp(-edge / 0.06))
    rgb = shade(FRAME, f * (1.0 - occ))
    cleat = np.zeros(y.shape, bool)
    for yc in SHELF_Y:
        lo = yc - SHELF_T / 2
        cleat |= (y < lo) & (y > lo - 0.045)
    ccol = shade(CLEAT, (1.0 + 0.05 * g) * (1.0 - 0.5 * occ))
    return np.where(cleat[..., None], ccol, rgb)


def paint_back_out(fu, fv):
    """Outer back: six 0.5 m boards per 3 m run, crisp grooves, plinth band and capping rail."""
    y = fu * HEIGHT
    s = fv * OUT_PERIOD
    m = mpp('back_out', 1, OUT_PERIOD)
    board = np.floor(s / BOARD_OUT).astype(np.int32) % 6
    tint = np.array([1.0, 0.92, 1.06, 0.96, 1.03, 0.90], np.float32)[board]
    g = grain(fu, fv, 3, 60, 81, wrap_across=True)
    f = tint * (1.0 + 0.06 * g)
    local = s % BOARD_OUT
    d = np.minimum(local, BOARD_OUT - local)
    f *= 1.0 - 0.58 * seam_profile(d, 1.0, m)
    f *= 1.0 + 0.16 * ((local > 1.0 * m) & (local < 2.2 * m))
    f *= 1.0 - 0.12 * np.exp(-(y - PLINTH) / 0.05)  # floor splash above the plinth
    rgb = shade(BACK_OUT, f)
    kick = y < PLINTH
    rgb = np.where(kick[..., None], shade(KICK, 1.0 + 0.05 * g), rgb)
    rail = y > HEADER_BOTTOM
    rcol = shade(CAP, (1.0 + 0.04 * g) * (1.0 + 0.10 * smoothstep(HEIGHT - 0.03, HEIGHT, y)))
    rgb = np.where(rail[..., None], rcol, rgb)
    groove = np.abs(y - HEADER_BOTTOM) < 0.02
    return rgb * (1.0 - 0.45 * groove)[..., None]


def paint_gable_out(fu, fv):
    """Gable end: two vertical boards, plinth band, capping rail, worn front arris."""
    x = -HX + fu * 2 * HX
    y = fv * HEIGHT
    mu = mpp('gable_out', 0, 2 * HX)
    g = grain(fv, fu, 4, 10, 29)
    f = 1.0 + 0.06 * g
    f *= 1.0 - 0.55 * seam_profile(np.abs(x), 0.8, mu)
    f *= np.where(x > 0, 1.03, 0.97)
    f *= 1.0 + 0.16 * np.exp(-np.maximum(HX - x, 0.0) / 0.012)  # front arris
    f *= 1.0 + 0.10 * np.exp(-(x + HX) / 0.012)                  # back arris
    f *= 1.0 - 0.12 * np.exp(-(y - PLINTH) / 0.05)
    rgb = shade(GABLE_C, f)
    kick = y < PLINTH
    rgb = np.where(kick[..., None], shade(KICK, 1.0 + 0.05 * g), rgb)
    rail = y > HEADER_BOTTOM
    rgb = np.where(rail[..., None], shade(CAP, (1.0 + 0.04 * g) * (1.0 + 0.12 * np.exp(-np.maximum(HX - x, 0.0) / 0.02))), rgb)
    groove = np.abs(y - HEADER_BOTTOM) < 0.02
    return rgb * (1.0 - 0.45 * groove)[..., None]


def paint_gable_in(fu, fv):
    x = BACK_FRONT + fu * (HX - BACK_FRONT)
    y = DECK_TOP + fv * (HEADER_BOTTOM - DECK_TOP)
    g = grain(fv, fu, 4, 10, 23)
    f = (1.0 + 0.05 * g) * (1.0 + 0.14 * np.exp(-(HX - x) / 0.012))
    occ = shelf_shadows(y, 0.30, 0.22)
    occ = np.maximum(occ, 0.28 * np.exp(-(x - BACK_FRONT) / 0.06))
    occ = np.maximum(occ, 0.28 * np.exp(-(y - DECK_TOP) / 0.05))
    occ = np.maximum(occ, 0.32 * np.exp(-(HEADER_BOTTOM - y) / 0.10))
    return shade(GABLE_C * 0.94, f * (1.0 - occ))


def paint_standard(fu, fv):
    """Slotted steel standard: two rows of slots, rounded edges, a bracket under each shelf."""
    y = DECK_TOP + fv * (HEADER_BOTTOM - DECK_TOP)
    f = 1.0 - 0.30 * (np.abs(fu - 0.5) * 2) ** 3
    rgb = shade(STEEL, f)
    pitch = 0.075
    slot_y = (y - DECK_TOP) % pitch < 0.034
    slot_x = (np.abs(fu - 0.3) < 0.09) | (np.abs(fu - 0.7) < 0.09)
    rgb = np.where((slot_y & slot_x)[..., None], SLOT[None, None, :], rgb)
    bracket = np.zeros(y.shape, bool)
    for yc in SHELF_Y:
        lo = yc - SHELF_T / 2
        bracket |= (y < lo) & (y > lo - 0.11)
    rgb = np.where(bracket[..., None], shade(STEEL * 0.72, f), rgb)
    occ = shelf_shadows(y, 0.30, 0.25)
    return rgb * (1.0 - occ)[..., None]


def paint_shelf_top(fu, fv):
    z = -ZI + fu * 2 * ZI
    x = BACK_FRONT + fv * (HX - BACK_FRONT)
    g = grain(fu, fv, 6, 20, 41)
    f = 1.0 + 0.07 * g
    occ = 0.32 * np.exp(-(x - BACK_FRONT) / 0.045)
    occ = np.maximum(occ, 0.25 * np.exp(-(ZI - np.abs(z)) / 0.06))
    occ = np.maximum(occ, 0.22 * np.exp(-(HX - x) / 0.012))  # in the lip corner
    for zc in STANDARD_Z:
        d = np.maximum(np.abs(z - zc) - STANDARD_W / 2, 0.0)
        occ = np.maximum(occ, 0.22 * np.where(x < 0.06, np.exp(-d / 0.05), 0.0))
    wear = smoothstep(HX - 0.07, HX - 0.02, x) * (0.6 + 0.4 * value_noise(fu, fv, 40, 2, 43))
    rgb = shade(SHELF, f * (1.0 - occ))
    return rgb * (1 - 0.35 * wear[..., None]) + NOSING[None, None, :] * 0.35 * wear[..., None]


def paint_shelf_front(fu, fv):
    """Board edge below, the lighter lip strip fixed over its top, 25 mm proud."""
    y = (1.0 - fv) * (SHELF_T + LIP)  # the loft runs lip top (fv 0) -> underside arris (fv 1)
    strip_lo = SHELF_T - 0.022
    g = grain(fu, fv, 8, 3, 53)
    scuff = value_noise(fu, fv, 80, 3, 59)
    f = (1.0 + 0.05 * g) * (1.0 - 0.10 * smoothstep(0.62, 0.9, scuff))
    body = shade(SHELF * 0.92, f * (1.0 - 0.18 * np.exp(-y / 0.008)))
    lip = shade(NOSING, f * (1.0 + 0.14 * smoothstep(SHELF_T + LIP - 0.008, SHELF_T + LIP, y)))
    rgb = np.where((y > strip_lo)[..., None], lip, body)
    seam = np.abs(y - strip_lo) < 0.004
    return rgb * (1.0 - 0.40 * seam)[..., None]


def paint_shelf_bottom(fu, fv):
    x = HX - fv * (HX - BACK_FRONT)  # the loft runs front arris -> back
    g = grain(fu, fv, 6, 12, 47)
    occ = 0.25 * np.exp(-(x - BACK_FRONT) / 0.05)
    return shade(SHELF_UNDER, (1.0 + 0.05 * g) * (1.0 - occ))


CAP_TOP = 2 * HX - CHAMFER
CAP_CH = CHAMFER * math.sqrt(2)
CAP_FASCIA = HEIGHT - CHAMFER - HEADER_BOTTOM
CAP_LEN = CAP_TOP + CAP_CH + CAP_FASCIA


def paint_cap(fu, fv):
    """Top rail loft: top boards, a light 45 degree chamfer, a fascia with a routed line."""
    s = fv * CAP_LEN
    g = grain(fu, fv, 6, 10, 61)
    top = s < CAP_TOP
    ch = (s >= CAP_TOP) & (s < CAP_TOP + CAP_CH)
    fz = s - CAP_TOP - CAP_CH  # metres down the fascia from the chamfer
    top_c = shade(CAP * 0.95, (1.0 + 0.05 * g) * (1.0 + 0.10 * smoothstep(CAP_TOP - 0.04, CAP_TOP, s)))
    ch_c = shade(CAP, (1.0 + 0.04 * g) * 1.12)
    fas = shade(FASCIA, (1.0 + 0.05 * g) * (1.0 - 0.20 * smoothstep(CAP_FASCIA - 0.02, CAP_FASCIA, fz)))
    fas = fas * (1.0 - 0.35 * (np.abs(fz - 0.035) < 0.005))[..., None]
    rgb = np.where(top[..., None], top_c, np.where(ch[..., None], ch_c, fas))
    edge = (np.abs(s - CAP_TOP) < 0.004) | (np.abs(s - CAP_TOP - CAP_CH) < 0.004)
    return rgb * (1.0 + 0.10 * edge)[..., None]


def paint_plinth(fu, fv):
    y = fv * DECK_TOP
    g = grain(fu, fv, 8, 3, 67)
    scuff = value_noise(fu, fv, 120, 4, 68)
    kick = shade(KICK, (1.0 + 0.04 * g) * (1.0 + 0.30 * smoothstep(0.72, 0.95, scuff) * (y < 0.07)))
    kick = kick * (1.0 - 0.35 * smoothstep(PLINTH - 0.03, PLINTH, y))[..., None]  # under the nosing
    nose = shade(NOSING * 0.88, (1.0 + 0.04 * g) * (1.0 + 0.12 * smoothstep(DECK_TOP - 0.01, DECK_TOP, y)
                                                     - 0.15 * np.exp(-(y - PLINTH) / 0.006)))
    return np.where((y < PLINTH)[..., None], kick, nose)


def paint_deck(fu, fv):
    z = -ZI + fu * 2 * ZI
    x = BACK_FRONT + fv * (HX - BACK_FRONT)
    g = grain(fu, fv, 6, 16, 71)
    occ = 0.30 * np.exp(-(x - BACK_FRONT) / 0.05)
    occ = np.maximum(occ, 0.25 * np.exp(-(ZI - np.abs(z)) / 0.06))
    for zc in STANDARD_Z:
        d = np.maximum(np.abs(z - zc) - STANDARD_W / 2, 0.0)
        occ = np.maximum(occ, 0.25 * np.where(x < 0.06, np.exp(-d / 0.05), 0.0))
    return shade(DECK, (1.0 + 0.06 * g) * (1.0 - occ) * (1.0 + 0.10 * smoothstep(HX - 0.02, HX, x)))


def paint_head_under(fu, fv):
    x = BACK_FRONT + fv * (HX - BACK_FRONT)
    g = grain(fu, fv, 6, 8, 73)
    return shade(FASCIA * 0.82, (1.0 + 0.04 * g) * (1.0 - 0.25 * np.exp(-(x - BACK_FRONT) / 0.05)))


def paint_post(fu, fv):
    """Gable front edge, 60 mm: worn arrises either side."""
    g = grain(fu, fv, 3, 4, 77)
    s = fv * GABLE
    arris = np.exp(-s / 0.008) + np.exp(-(GABLE - s) / 0.008)
    return shade(GABLE_C, (1.0 + 0.05 * g) * (1.0 + 0.18 * arris))


def build_atlas():
    atlas = Atlas()
    atlas.paint('back', paint_back)
    atlas.paint('back_out', paint_back_out)
    atlas.paint('gable_out', paint_gable_out)
    atlas.paint('gable_in', paint_gable_in)
    atlas.paint('standard', paint_standard)
    atlas.paint('shelf_top', paint_shelf_top)
    atlas.paint('shelf_front', paint_shelf_front)
    atlas.paint('shelf_bot', paint_shelf_bottom)
    atlas.paint('cap', paint_cap)
    atlas.paint('plinth', paint_plinth)
    atlas.paint('deck', paint_deck)
    atlas.paint('head_under', paint_head_under)
    atlas.paint('post', paint_post)
    return atlas.colour_bytes()


# ---------------------------------------------------------------- geometry
def unit(v):
    length = math.sqrt(sum(c * c for c in v))
    return tuple(c / length for c in v)


def tilt(base, toward, degrees):
    """Unit vector rotated from axis `base` toward axis `toward` by `degrees`."""
    a = math.radians(degrees)
    return unit(tuple(math.cos(a) * b + math.sin(a) * t for b, t in zip(base, toward)))


class Builder:
    """Faces in three.js coordinates; Blender gets (x, -z, y), which export_yup maps back."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.cache = {}
        self.corner_normals = []  # per face, in creation order: {three-key: three normal} or None

    def vert(self, p):
        key = tuple(round(c, 6) for c in p)
        v = self.cache.get(key)
        if v is None:
            x, y, z = p
            v = self.bm.verts.new((x, -z, y))
            self.cache[key] = v
        return v

    def face(self, pts, uvs, normal, corner=None):
        """`corner(p)` optionally gives a shading normal per corner (three.js
        coordinates), so a modelled arris also reads as rounded in clay."""
        f = self.bm.faces.new([self.vert(p) for p in pts])
        f.normal_update()
        nx, ny, nz = normal
        if sum(a * b for a, b in zip(f.normal, (nx, -nz, ny))) < 0:
            f.normal_flip()
        lookup = {self.vert(p): t for p, t in zip(pts, uvs)}
        for loop in f.loops:
            loop[self.uv].uv = lookup[loop.vert]
        self.corner_normals.append(
            None if corner is None else {tuple(round(c, 6) for c in p): unit(corner(p)) for p in pts})
        return f

    def loft(self, profile, z0, z1, segments, corner_tilts=None):
        """Sweep a traced (x, y) cross-section along z from z0 to z1.

        The profile is walked with the outside on the LEFT, so each segment's
        outward normal is (-dy, dx). `segments[i]` names the atlas region for
        segment i, or None for a segment no viewer can see (it is not emitted).
        Each emitted segment maps u along z (z0..z1) and v along the profile's
        arc length within its region; a region may be given as (name, s0, s1)
        to map an arc range of several segments continuously (one region for
        the whole cap moulding). `corner_tilts[i]` = (deg_at_start, deg_at_end)
        rotates the corner normals toward the neighbouring segment, rounding
        the arris in shading as well as in silhouette."""
        arc = [0.0]
        for (xa, ya), (xb, yb) in zip(profile, profile[1:]):
            arc.append(arc[-1] + math.hypot(xb - xa, yb - ya))
        for i, region in enumerate(segments):
            if region is None:
                continue
            (xa, ya), (xb, yb) = profile[i], profile[i + 1]
            dx, dy = xb - xa, yb - ya
            n = unit((-dy, dx, 0.0))
            if isinstance(region, tuple):
                name, s0, s1 = region
            else:
                name, s0, s1 = region, arc[i], arc[i + 1]
            va = (arc[i] - s0) / (s1 - s0)
            vb = (arc[i + 1] - s0) / (s1 - s0)
            pts = [(xa, ya, z0), (xa, ya, z1), (xb, yb, z1), (xb, yb, z0)]
            uvs = [uvr(name, 0.0, va), uvr(name, 1.0, va), uvr(name, 1.0, vb), uvr(name, 0.0, vb)]
            corner = None
            if corner_tilts and corner_tilts[i]:
                ta, tb = corner_tilts[i]
                along = unit((dx, dy, 0.0))
                back = (-along[0], -along[1], 0.0)
                # Tilt toward the arris the corner sits on: backwards along the
                # profile at the start, forwards at the end.
                na = tilt(n, back, ta) if ta >= 0 else tilt(n, along, -ta)
                nb = tilt(n, along, tb) if tb >= 0 else tilt(n, back, -tb)
                corner = (lambda p, xa=xa, ya=ya, na=na, nb=nb:
                          na if abs(p[0] - xa) < 1e-6 and abs(p[1] - ya) < 1e-6 else nb)
            self.face(pts, uvs, n, corner)

    def to_mesh(self, name):
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = True
        loops = []
        for poly, corners in zip(mesh.polygons, self.corner_normals):
            flat = tuple(poly.normal)
            for li in poly.loop_indices:
                if corners is None:
                    loops.append(flat)
                    continue
                bx, by, bz = mesh.vertices[mesh.loops[li].vertex_index].co
                p = (bx, bz, -by)  # back to three.js
                key = min(corners, key=lambda k: sum((a - b) ** 2 for a, b in zip(k, p)))
                n = corners[key]
                loops.append((n[0], -n[2], n[1]))
        mesh.normals_split_custom_set(loops)
        return mesh


def build_mesh():
    b = Builder()
    F = lambda a, lo, hi: (a - lo) / (hi - lo)
    X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
    NZ = (0, 0, -1)

    # Outer back (faces the wall): boards repeat every OUT_PERIOD along z.
    pts = [(-HX, 0, -HZ), (-HX, 0, HZ), (-HX, HEIGHT, HZ), (-HX, HEIGHT, -HZ)]
    b.face(pts, [uvr('back_out', p[1] / HEIGHT, (HZ - p[2]) / OUT_PERIOD) for p in pts], (-1, 0, 0))

    # Gable ends, traced as one outline: toe notch, front, cap chamfer, top, back.
    outline = [(-HX, 0), (HX - TOE, 0), (HX - TOE, PLINTH), (HX, PLINTH),
               (HX, HEIGHT - CHAMFER), (HX - CHAMFER, HEIGHT), (-HX, HEIGHT)]
    for sz in (-1, 1):
        pts = [(x, y, sz * HZ) for x, y in outline]
        b.face(pts, [uvr('gable_out', F(p[0], -HX, HX), p[1] / HEIGHT) for p in pts], (0, 0, sz))

    # Cap moulding: one loft of top -> chamfer -> fascia over the full 6 m.
    cap = [(-HX, HEIGHT), (HX - CHAMFER, HEIGHT), (HX, HEIGHT - CHAMFER), (HX, HEADER_BOTTOM)]
    region = ('cap', 0.0, CAP_LEN)
    b.loft(cap, -HZ, HZ, [region, region, region],
           [(0, 22), (22, 22), (22, 25)])

    # Plinth: a recessed charcoal kick over the full length (it closes the toe
    # notch in both gables), a wooden deck nosing between the gables.
    pts = [(HX - TOE, 0, -HZ), (HX - TOE, 0, HZ), (HX - TOE, PLINTH, HZ), (HX - TOE, PLINTH, -HZ)]
    b.face(pts, [uvr('plinth', F(p[2], -HZ, HZ), p[1] / DECK_TOP) for p in pts], X)
    pts = [(HX, PLINTH, -ZI), (HX, PLINTH, ZI), (HX, DECK_TOP, ZI), (HX, DECK_TOP, -ZI)]
    b.face(pts, [uvr('plinth', F(p[2], -HZ, HZ), p[1] / DECK_TOP) for p in pts], X,
           lambda p: tilt(X, Y, 40) if p[1] > DECK_TOP - 1e-6 else tilt(X, (0, -1, 0), 20))

    # Gable front edges, plinth to header, both arrises rounded in shading.
    for sz in (-1, 1):
        pts = [(HX, PLINTH, sz * HZ), (HX, PLINTH, sz * ZI), (HX, HEADER_BOTTOM, sz * ZI), (HX, HEADER_BOTTOM, sz * HZ)]
        out = Z if sz > 0 else NZ
        inn = NZ if sz > 0 else Z
        b.face(pts, [uvr('post', F(p[1], PLINTH, HEADER_BOTTOM), F(abs(p[2]), HZ, ZI)) for p in pts], X,
               lambda p, out=out, inn=inn: tilt(X, out if abs(p[2]) > HZ - 1e-6 else inn, 35))

    # Bay interior: gable inner faces, back board, deck top, header underside.
    for sz in (-1, 1):
        z = sz * ZI
        pts = [(BACK_FRONT, DECK_TOP, z), (HX, DECK_TOP, z), (HX, HEADER_BOTTOM, z), (BACK_FRONT, HEADER_BOTTOM, z)]
        b.face(pts, [uvr('gable_in', F(p[0], BACK_FRONT, HX), F(p[1], DECK_TOP, HEADER_BOTTOM)) for p in pts],
               (0, 0, -sz))
    pts = [(BACK_FRONT, DECK_TOP, -ZI), (BACK_FRONT, DECK_TOP, ZI), (BACK_FRONT, HEADER_BOTTOM, ZI),
           (BACK_FRONT, HEADER_BOTTOM, -ZI)]
    b.face(pts, [uvr('back', F(p[1], DECK_TOP, HEADER_BOTTOM), (p[2] + ZI) / BAY) for p in pts], X)
    pts = [(BACK_FRONT, DECK_TOP, -ZI), (HX, DECK_TOP, -ZI), (HX, DECK_TOP, ZI), (BACK_FRONT, DECK_TOP, ZI)]
    b.face(pts, [uvr('deck', F(p[2], -ZI, ZI), F(p[0], BACK_FRONT, HX)) for p in pts], Y)
    pts = [(BACK_FRONT, HEADER_BOTTOM, -ZI), (HX, HEADER_BOTTOM, -ZI), (HX, HEADER_BOTTOM, ZI),
           (BACK_FRONT, HEADER_BOTTOM, ZI)]
    b.face(pts, [uvr('head_under', F(p[2], -ZI, ZI), F(p[0], BACK_FRONT, HX)) for p in pts], (0, -1, 0))

    # Shelves: one loft each of the lipped profile, walked board top -> lip
    # back (never visible from the aisle, not emitted) -> front from lip top
    # to underside arris -> underside (emitted only above standing eye height).
    for yc in SHELF_Y:
        lo, hi = yc - SHELF_T / 2, yc + SHELF_T / 2
        profile = [(BACK_FRONT, hi), (HX, hi), (HX, hi + LIP), (HX, lo), (BACK_FRONT, lo)]
        under = 'shelf_bot' if lo > UNDERSIDE_MIN_Y else None
        b.loft(profile, -ZI, ZI,
               ['shelf_top', None, 'shelf_front', under],
               [None, None, (55, 30), None])

    # Slotted steel standards on the back board, deck to header: one face
    # each, rounded hard in shading so they read as half-round uprights.
    for zc in STANDARD_Z:
        za, zb = zc - STANDARD_W / 2, zc + STANDARD_W / 2
        pts = [(STANDARD_X, DECK_TOP, za), (STANDARD_X, DECK_TOP, zb), (STANDARD_X, HEADER_BOTTOM, zb),
               (STANDARD_X, HEADER_BOTTOM, za)]
        b.face(pts, [uvr('standard', F(p[2], za, zb), F(p[1], DECK_TOP, HEADER_BOTTOM)) for p in pts], X,
               lambda p, zc=zc: tilt(X, Z if p[2] > zc else NZ, 55))

    return b.to_mesh(MESH_NAME)


# ---------------------------------------------------------------- material and IO
def write_jpeg(path, rgb, quality, name):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name + '-stage', w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as is `rgb`
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


def build_material(colour_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # every visible face points out: export single-sided
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.72
    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'station-shelving-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    colour_node.interpolation = 'Linear'
    colour_node.extension = 'REPEAT'  # the board columns wrap in v
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    return scene


def export(out_path, colour, quality, stage):
    scene = reset_scene()
    colour_path = os.path.join(stage, f'station-shelving-colour-{quality}.jpg')
    write_jpeg(colour_path, colour, quality, 'station-shelving-colour')
    mesh = build_mesh()
    mesh.materials.append(build_material(colour_path))
    obj = bpy.data.objects.new(NODE_NAME, mesh)
    scene.collection.objects.link(obj)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_image_format='AUTO',
        export_vertex_color='NONE',
        export_normals=True,
        export_tangents=False,
        export_extras=False,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_copyright='MillOS authored geometry and textures (scripts/blender/authored/station-shelving.py)',
    )
    return os.path.getsize(out_path)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P station-shelving.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    colour = build_atlas()
    stage = tempfile.mkdtemp(prefix='station-shelving-')
    try:
        for quality in QUALITIES:
            size = export(out_path, colour, quality, stage)
            print(f'STATION_SHELVING quality {quality}: {size} bytes')
            if size <= MAX_BYTES:
                break
        else:
            raise SystemExit(f'station-shelving: {size} bytes exceeds {MAX_BYTES} at the lowest quality')
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'STATION_SHELVING_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
