"""Author the village architecture and traditional canal narrowboat.

No provider geometry is imported. Original GLBs remain reference/provenance only.
One mesh, one padded atlas and opaque front-face-culling material per delivery.
Working if delivery tests find planar walls, closed roofs, grounded thresholds,
reference-led envelopes, and fewer vertices than the existing asset ceilings.
"""
import argparse
import hashlib
import json
import math
import pathlib
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('--only')
p.add_argument('--report', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
REPORT = ROOT / a.report
REPORT.parent.mkdir(parents=True, exist_ok=True)
ENVELOPES = {
    'cottage': (4.619, 4.332, 5), 'shop': (6, 5.874, 5.407),
    'church': (11.24, 20.155, 13.65), 'townhall': (13.94, 18.32, 14.61),
    'pub': (9.24, 8.18, 8.54), 'school': (11.24, 12.83, 8.44),
    'canal-boat': (2.709, 3.39, 12.95),
    'forge': (4.715, 5.679, 7),
}
PALETTE = {
    'plaster': ('d8cfb7', .87), 'stone': ('aaa69b', .9),
    'brick': ('9c6650', .87), 'slate': ('4c606c', .78),
    'tile': ('8b5142', .8), 'thatch': ('9d854f', .92),
    'oak': ('8f6b45', .8), 'timber': ('514337', .86),
    'cream': ('e4d9bd', .7), 'green': ('476454', .68),
    'glass': ('4c6b75', .3), 'amber': ('bc965b', .4),
    'brass': ('ad8b46', .4), 'iron': ('354043', .65),
    'ink': ('202e32', .9), 'rose': ('bd8580', .8),
}
BASE_PALETTE = PALETTE.copy()
KEYS = list(PALETTE)
VERTS, FACES, UVS, PARTS = [], [], [], []
# Per-corner normals the canal boat computes from its own lines plan, keyed
# {face index: {vertex index: game-axis normal}}. The export loop writes them
# as free corner normals over Blender's angle-derived ones; corners not listed
# keep exactly the normals they had.
BOAT_CORNER_NORMALS = {}
# (doorway centre in game axes, metres per swatch) while door_frame() lays its
# joinery; None everywhere else, so every other part keeps solid()'s mapping.
DOOR_UV = None


# Forge masonry grid (metres, game axes). Faces of forge stone are cut on these
# planes and mapped one period per swatch, so texel density is constant from a
# 5 cm hood chamfer to the 4 m rear wall. Y cell 0 (below 1.62) is the damp
# footing band; no plane sits at Y0 itself.
FORGE_GRID = dict(P=1.6, X0=-1.0, Y0=.02, Z0=-2.3)
FORGE_MASONRY_TILES = {'stone': 'coursed', 'brick': 'footing', 'slate': 'flagcells', 'thatch': 'ashlar',
                       'green': 'kerb'}
# Porch flag layout (metres in a FORGE_GRID period): rows along z, then the
# flag widths and the running-bond shift along x in each row. forge() models a
# flag between these lines. Each flag's own UV island maps its top onto one
# whole painted stone (FORGE_FLAG_TONES, one 4 x 4 cell of the slate swatch),
# so every flag carries its own tone and a dark worn arris at its real edge.
FORGE_FLAGS = dict(rows=[.56, .46, .58], widths=[[.62, .48, .50], [.44, .70, .46], [.58, .52, .50]],
                   shifts=[0, .27, .13])
# York buff, Pennant blue-grey, iron-stained brown and warm grey, all darker
# than the ground they sit on (sRGB display values).
FORGE_FLAG_TONES = [(.58, .52, .42), (.45, .46, .46), (.52, .44, .36), (.53, .50, .45)]
# Own UV islands, laid by forge() itself: forge_metric_masonry leaves them be.
FORGE_OWN_UV_PARTS = ('Forge lathed bell hood', 'Forge porch flag')
# Smooth-shaded forge parts and the dihedral (degrees) above which an edge
# stays sharp, so the bell sweeps while its lip arrises stay crisp.
FORGE_SMOOTH_PARTS = {'Forge lathed bell hood': 40}
# Dressed freestone for the forge's dressings (hood, arch, quoins, door head,
# rear vent and string course): warmer and lighter than the grey rubble so the
# dressed work separates from the walls in colour, not only in clay. It rides
# the thatch slot, which the forge never uses and no runtime shader gates.
FORGE_ASHLAR_RGB = 'bcaa88'
FORGE_ASHLAR_COURSE = .32  # Courses at Y0 + k * .32; dressed parts are cut to them.
FORGE_DRESSED_KEYS = ('stone', 'thatch', 'green')  # Re-laid in metres by forge_metric_masonry.
# Keys whose parts take their own swatch on every face, whatever the normal:
# the dressed ashlar, and the darker joint-free kerb stone (green slot, unused
# by the forge and ungated at runtime) whose joints are modelled, not painted.
FORGE_FORCED_TILES = ('thatch', 'green')
# The town hall's dressed stone (quoins and plinth) rides the thatch slot, which
# townhall() never uses and no runtime shader gates (glazing is slot 10). A
# cream-grey limestone half a step below the plaster: a different material, not
# a tan stripe. The swatch is laid in metres (civic_ashlar_swatch): the lower
# CIVIC_QUOIN_V of it is the quoin courses, one painted row per modelled
# course, u = CIVIC_QUOIN_U metres from the corner; the top band is the plinth
# run, u = CIVIC_PLINTH_U metres along the wall, its blocks painted in metres.
CIVIC_ASHLAR_KEY = 'thatch'
CIVIC_ASHLAR = ('c6bea6', .88)
CIVIC_QUOIN = dict(half_w=6.0, half_d=5.0, bottom=.30, top=6.87, courses=12, long=.60, short=.38,
                   proud=.03, bury=.05)
CIVIC_QUOIN_U, CIVIC_QUOIN_V, CIVIC_PLINTH_V, CIVIC_PLINTH_U = .72, .78, .80, 13.0
# The hall's plaster (plaster slot, townhall only) is laid in metres too:
# u = (x + 7) / 14 m; front and rear walls and the tower take v in [0, .5),
# the side walls v in [.5, 1), each at y / 14 m, so the swatch knows where the
# base, the sills and the windows are on every elevation.
CIVIC_PLASTER_P = 14.0
CIVIC_SILL_Y, CIVIC_WINDOWS = 1.75, ((-4.3, 4.3), (-3.2, 0.0, 3.2))
# The town hall's coursed slate is a two-slot strip on the brick + slate slots
# (2, 3), which townhall() leaves unused once its cupola reads the tile slot
# (recoloured slate under civic_slate); no runtime shader gates either. Round 5
# changed the method: one swatch spans the WHOLE CIVIC_SLATE_SPAN m eave, laid
# u = metres along each plane, no mirror at the centre line; every modelled
# course owns CIVIC_SLATE_COURSES of the CIVIC_SLATE_ROWS painted rows, so no
# row is reused on a plane (each plane's rows are shifted, not cycled). Round 6:
# 16 modelled courses (lofted rings), one painted row each.
CIVIC_SLATE_KEY = 'brick'  # The strip's left slot; solid_uv addresses the strip from it.
CIVIC_SLATE_SLOT = KEYS.index(CIVIC_SLATE_KEY)
CIVIC_SLATE_SPAN, CIVIC_SLATE_ROWS, CIVIC_SLATE_COLS, CIVIC_SLATE_COURSES = 13.8, 16, 32, 1
# Lead (hip rolls and the tower collar) repaints the iron slot, which
# townhall() otherwise leaves unused.
CIVIC_LEAD = ('7d8585', .62)


def forge_masonry_swatch(kind, xx, yy, tile):
    P = FORGE_GRID['P']
    # Pixel centre -> metres inside the period; padding continues the pattern.
    mu = ((xx + .5) / tile - .03) / .94 * P
    mv = ((yy + .5) / tile - .03) / .94 * P
    u, v = np.mod(mu, P), np.mod(mv, P)
    if kind == 'flagcells':
        # Sixteen whole flag faces, one per 4 x 4 cell. forge() maps each
        # flag's top onto one cell (and its sides onto that cell's rim), so
        # the worn arris lands on the modelled edge whatever the flag's size.
        lx = np.clip(((xx + .5) / tile - .03) / .94, 0, .9999) * 4
        ly = np.clip(((yy + .5) / tile - .03) / .94, 0, .9999) * 4
        col, row = np.floor(lx), np.floor(ly)
        fu, fv = lx - col, ly - row
        cell = (row * 4 + col).astype(np.int64)
        h = (cell * 2654435761 % 4294967296) / 4294967296.0
        d = np.minimum(np.minimum(fu, 1 - fu), np.minimum(fv, 1 - fv))
        rim = np.clip(1 - d / .11, 0, 1) ** 1.6
        wear = np.clip(1 - np.hypot(fu - .5, fv - .5) / .45, 0, 1)
        value = .05 * (h - .5) - .13 * rim + .028 * wear \
            + .018 * np.sin(fu * 7.3 + cell) * np.cos(fv * 5.9 + 2.1 * cell) \
            + ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 900
        stone = np.array([int(PALETTE['stone'][0][k:k + 2], 16) / 255 for k in (0, 2, 4)])
        tones = np.array(FORGE_FLAG_TONES) - stone
        tint = tones[(cell * 7 + 3) % len(FORGE_FLAG_TONES)]
        return value, tint
    if kind == 'kerb':
        # Tooled kerb stone with no painted joints: forge() models every kerb
        # joint. A cool dark grey border against the lighter ground, so the
        # paving's edge reads at eye level. Only whole periods of P, so the
        # swatch tiles seamlessly.
        w = 2 * math.pi / P
        value = -.17 + .016 * np.sin(u * w * 3 + 1.1) * np.cos(v * w * 2) \
            + .011 * np.sin(u * w * 7 + np.cos(v * w * 5))
        value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1100
        return value, np.zeros(u.shape + (3,)) + np.array([-.012, -.002, .012])
    if kind == 'ashlar':
        # Five equal dressed courses per period, long blocks in running bond,
        # thin joints (3.2 px at 1024, so they survive the 512 resample).
        rows, joint = [FORGE_ASHLAR_COURSE] * 5, .02
        widths = [[.58, .46, .56], [.40, .62, .58], [.52, .54, .54],
                  [.66, .44, .50], [.48, .60, .52]]
        shifts = [0, .29, .13, .41, .21]
        base = 0.0
    else:
        rows, joint = [.30, .36, .27, .34, .33], .024
        widths = [[.52, .38, .44, .26], [.46, .60, .54], [.34, .42, .30, .54],
                  [.58, .40, .62], [.36, .50, .28, .46]]
        shifts = [0, .21, .47, .09, .33]
        base = -.02
    edges = np.cumsum([0] + rows)
    row = np.clip(np.searchsorted(edges, v, side='right') - 1, 0, len(rows) - 1)
    dv = np.minimum(v - edges[row], edges[row + 1] - v)
    du = np.full_like(u, 9.0)
    stone = np.zeros_like(u, dtype=np.int64)
    for c, (ws, s) in enumerate(zip(widths, shifts)):
        mask = row == c
        su = np.mod(u - s, P)
        cuts = np.cumsum([0] + ws)
        idx = np.clip(np.searchsorted(cuts, su, side='right') - 1, 0, len(ws) - 1)
        d = np.minimum(su - cuts[idx], cuts[idx + 1] - su)
        du = np.where(mask, d, du)
        stone = np.where(mask, c * 16 + idx, stone)
    d = np.minimum(du, dv)
    # Deterministic per-stone tone and a little warm/cool drift, no lighting.
    h = (stone * 2654435761 % 4294967296) / 4294967296.0
    h2 = (stone * 40503 % 65536) / 65536.0
    value = base + .095 * (h - .5) + .006 * np.sin(mu * 23 + np.cos(mv * 17))
    value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1100
    if kind == 'ashlar':
        # Tooled face: quieter per-block tone, a drafted margin, dark joints.
        value = base + .06 * (h - .5) + ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1500
        value -= .025 * np.clip(1 - d / .035, 0, 1)
        value = np.where(d < joint / 2, -.11, value)
        drift = (h2 - .5)[..., None] * np.array([.02, .01, -.015])
        return value, np.zeros(u.shape + (3,)) + drift
    value -= .035 * np.clip(1 - d / .05, 0, 1)
    value = np.where(d < joint / 2, -.12, value)
    tint = np.zeros(u.shape + (3,))
    drift = (h2 - .5)[..., None] * np.array([.03, .012, -.022])
    tint += drift
    if kind == 'footing':
        # Rising damp: darker and faintly green toward the ground (Y cell 0
        # starts at Y0, so height above ground is mv + Y0).
        damp = np.clip((.62 - (mv + FORGE_GRID['Y0'])) / .62, 0, 1) ** 1.4
        value -= .085 * damp
        tint += damp[..., None] * np.array([-.018, .004, -.02])
    return value, tint


CHURCH_SLATE_P, CHURCH_SLATE_ROWS, CHURCH_SLATE_COLS = 6.8, 14, 16


def church_slate_swatch(xx, yy, tile):
    """Metric slate courses for the church (the tile slot, which it never uses).

    One swatch is CHURCH_SLATE_P metres wide and CHURCH_SLATE_ROWS courses
    tall: 16 slates of .425 m per course, alternate courses broken by half a
    slate, so it tiles seamlessly along the eave. Each roof or spire band maps
    exactly one course, so the modelled butt lands on the painted butt shadow.
    Every slate carries its own tone and drift; no directional shading.
    """
    R, C = CHURCH_SLATE_ROWS, CHURCH_SLATE_COLS
    lu = ((xx + .5) / tile - .03) / .94
    lv = ((yy + .5) / tile - .03) / .94
    rv = np.clip(lv, 0, .99999) * R
    row = np.floor(rv).astype(np.int64)
    fv = rv - row
    cu = np.mod(lu, 1.0) * C + (row % 2) * .5
    fu = cu - np.floor(cu)
    idx = row * C + np.mod(np.floor(cu), C).astype(np.int64)
    h = (idx * 2654435761 % 4294967296) / 4294967296.0
    h2 = ((idx * 40503 + 977) % 65536) / 65536.0
    h3 = ((idx * 69069 + 1013904223) % 4294967296) / 4294967296.0
    value = .085 * (h - .5) - .06 * (h2 < .08) + .045 * (h2 > .94)
    value -= .15 * np.clip(1 - fv / .11, 0, 1) ** 1.4  # Shadow under the lapped butt.
    joint = np.minimum(fu, 1 - fu) * tile * .94 / C
    value = np.where((joint < 1.5) & (fv > .06), -.12, value)
    value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 2600
    tint = (h3 - .5)[..., None] * np.array([-.018, .008, .03])
    tint += ((h2 > .5) & (h2 < .56))[..., None] * np.array([.006, .016, -.012])
    return value, tint


def church_slate_uv(u, v, key='tile'):
    tile = KEYS.index(key)
    return ((tile % 4 + .03 + .94 * u) / 4, (tile // 4 + .03 + .94 * v) / 4)


def civic_ashlar_swatch(xx, yy, tile):
    """Town hall dressed stone, laid in metres: quoin courses below, plinth run above.

    Quoins: one painted row per modelled course (townhall_corner_quoins maps
    course k onto row k on both elevations of a corner, so the stone wraps
    the corner in one tone), a 1 px bed joint with a soft chamfer shade either
    side, and a calm tone per course. No vertical joint is painted: each
    block's end is the modelled tooth of the traced outline.
    Plinth: blocks 0.8-1.15 m long along CIVIC_PLINTH_U metres, a step darker
    than the quoins, with a damp shade toward the ground.
    """
    span = tile * .94
    lu = ((xx + .5) / tile - .03) / .94
    lv = ((yy + .5) / tile - .03) / .94
    grain = ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 2400
    grain += .005 * np.sin(xx / 6.1 + np.sin(yy / 4.7)) * np.cos(yy / 5.3)
    n = CIVIC_QUOIN['courses']
    rv = np.clip(lv, 0, CIVIC_QUOIN_V - 1e-6) / CIVIC_QUOIN_V * n
    row = np.floor(rv).astype(np.int64)
    fr = rv - row
    to_joint = np.minimum(fr, 1 - fr) * CIVIC_QUOIN_V * span / n  # Pixels to the nearest bed joint.
    tones = np.array([((k * 5) % 7 / 6 - .5) * .028 for k in range(n)])
    quoin = tones[row] + grain - .022 * np.clip((2.6 - to_joint) / 1.6, 0, 1)
    quoin = np.where(to_joint < .8, -.075, quoin)
    edges = [0.0]
    while edges[-1] < CIVIC_PLINTH_U:
        edges.append(edges[-1] + .8 + .35 * ((len(edges) * 37) % 11) / 10)
    edges = np.array(edges)
    m = np.clip(lu, 0, 1) * CIVIC_PLINTH_U
    block = np.clip(np.searchsorted(edges, m, side='right') - 1, 0, len(edges) - 2)
    to_end = np.minimum(m - edges[block], edges[block + 1] - m) * span / CIVIC_PLINTH_U
    pv = np.clip((lv - CIVIC_PLINTH_V) / (1 - CIVIC_PLINTH_V), 0, 1)  # 0 at the ground, 1 at the ledge.
    plinth = -.07 + ((block * 3) % 5 / 4 - .5) * .03 + grain - .035 * (1 - pv) ** 2
    plinth = np.where(to_end < .9, -.13, plinth - .02 * np.clip((2.5 - to_end) / 1.5, 0, 1))
    return np.where(lv >= CIVIC_PLINTH_V, plinth, np.where(lv >= CIVIC_QUOIN_V, -.075, quoin))


def civic_plaster_swatch(xx, yy, tile):
    """Town hall lime render, laid in metres (see CIVIC_PLASTER_P).

    Broad low-frequency patches of limewash (periods 1-4 m, about 3% in
    value), a fine trowel grain, a damp shade over the first metre above the
    plinth and a faint run of weathering under every sill. Colour only: no
    directional light is painted.
    """
    lu = ((xx + .5) / tile - .03) / .94
    lv = ((yy + .5) / tile - .03) / .94
    side = lv >= .5
    X = np.clip(lu, 0, 1) * CIVIC_PLASTER_P - CIVIC_PLASTER_P / 2
    Y = (np.clip(lv, 0, 1) - .5 * side) * CIVIC_PLASTER_P
    value = .016 * np.sin(X / 1.7 + 1.3 * np.sin(Y / 2.3)) * np.cos(Y / 1.9 + .7 * np.sin(X / 3.1))
    value += .011 * np.sin(X / .73 + .4 * Y) * np.sin(Y / .61 - .2 * X)
    value += .008 * np.sin(X / 3.7 - Y / 4.3)
    value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1800
    value -= .05 * np.clip((1.3 - Y) / 1.0, 0, 1) ** 1.6  # Damp and splash over the plinth.
    for windows, on_side in zip(CIVIC_WINDOWS, (False, True)):
        for wx in windows:
            across = np.clip(1 - ((X - wx) / .9) ** 2, 0, 1) * (.6 + .4 * np.sin((X - wx) * 23) ** 2)
            down = np.clip((Y - .55) / (CIVIC_SILL_Y - .55), 0, 1) * (Y < CIVIC_SILL_Y)
            value -= .026 * across * down * (side == on_side)
    tint = value[..., None] * np.array([.25, .1, -.35])  # Lighter patches a touch warmer.
    return value, tint


def civic_hash(i, salt):
    """Uniform [0, 1) per integer cell: a splitmix64 finaliser, so neighbouring
    cells are uncorrelated. Round 4's multiplicative hashes of the linear index
    were quasi-periodic (idx * golden ratio), which painted the woven bands."""
    x = (np.asarray(i, dtype=np.int64).astype(np.uint64) + np.uint64(salt)) * np.uint64(0x9E3779B97F4A7C15)
    x = (x ^ (x >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
    x = (x ^ (x >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
    x = x ^ (x >> np.uint64(31))
    return (x >> np.uint64(11)).astype(np.float64) / float(1 << 53)


def civic_slate_strip(w, h):
    """Town hall slate on a two-slot strip: (value, tint), each (h, w).

    u spans the whole CIVIC_SLATE_SPAN m eave (townhall_hip_roof lays it in
    metres along each plane, not mirrored); CIVIC_SLATE_ROWS painted courses,
    each modelled course owning CIVIC_SLATE_COURSES of them. Courses read
    first: a 3 px butt line and a firm 7 px shadow cast down the slope by
    every lapped butt.
    Then the slates: 2 px joints and a calm uncorrelated tone per slate
    (about +-1.5%). Round 6 sized every line to survive the ~1.8x minification
    of the eye-level views (37 px/m in the strip, ~21 px/m on screen) and
    dropped the whole-slate scatter, which survived where the 1 px lines
    did not and read as mottle. Then the roof: weathering in
    metres at incommensurate periods (1.7 m, 4.3 m) and faint downslope rain
    streaks, periodic over the 16 rows so the strip has no seam. No painted
    highlights.
    """
    R, C = CIVIC_SLATE_ROWS, CIVIC_SLATE_COLS
    yy, xx = np.mgrid[0:h, 0:w]
    lu = ((xx + .5) / w * 2 - .03) / 1.94
    lv = ((yy + .5) / h - .03) / .94
    rv = np.mod(lv, 1) * R
    row = np.floor(rv).astype(np.int64)
    fv = rv - row
    cu = lu * C + (row % 2) * .5
    col = np.floor(cu).astype(np.int64)
    fu = cu - col
    idx = row * 4096 + col + 1024
    h1, h2, h3 = civic_hash(idx, 11), civic_hash(idx, 23), civic_hash(idx, 37)
    m = lu * CIVIC_SLATE_SPAN  # Metres along the eave.
    phase = 2 * math.pi * rv / R  # Up the plane, periodic over the strip.
    value = .03 * (h1 - .5)
    value += .028 * np.sin(2 * math.pi * m / 4.3 + 1.4 * np.sin(phase) + .6)
    value += .02 * np.sin(2 * math.pi * m / 1.7 + 3 * phase + 2.1) * np.cos(phase - m / 3.1)
    value -= .016 * np.clip(np.sin(2 * math.pi * m / .61 + 1.9 * np.sin(m / .9)), 0, 1) ** 3  # Rain streaks.
    rise = fv * h * .94 / R  # Pixels above this course's butt.
    below = h * .94 / R - rise  # Pixels below the next course's butt, which laps over this row's top.
    value -= .13 * np.clip(1 - below / 7.0, 0, 1) ** .7  # The shadow that butt casts down the slope.
    value = np.where(rise < 3.0, -.22, value)  # The butt line itself.
    joint = np.minimum(fu, 1 - fu) * w * .97 / C  # Pixels to the nearest vertical joint.
    value = np.where((joint < 1.0) & (rise >= 3.0), value - .1, value)
    value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 2600
    tint = (h3 - .5)[..., None] * np.array([.01, -.006, .03])  # Blue to purple-grey slates.
    tint += ((h2 > .5) & (h2 < .55))[..., None] * np.array([.008, .014, -.01])  # A few greener.
    return value, tint


def atlas(bread_display=False, forge_masonry=False, church_slate=False, boat_hull=False,
          shop_pantile=False, civic_ashlar=False, civic_slate=False, civic_plaster=False, pub_thatch=False,
          pub_plaster=False):
    size, tile = 1024, 256
    pixels = np.ones((size, size, 4), dtype=np.float32)
    rough = np.ones_like(pixels)
    yy, xx = np.mgrid[0:tile, 0:tile]
    for i, (key, (colour, r)) in enumerate(PALETTE.items()):
        if (church_slate or civic_slate) and key == 'tile':
            colour, r = PALETTE['slate']
        rgb =np.array([int(colour[k:k + 2], 16) / 255 for k in (0, 2, 4)])
        # Deterministic restrained variation, no baked directional shading.
        noise = ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1400
        value = noise + .012 * np.sin(xx / 33) * np.cos(yy / 47)
        if key in ('brick', 'stone'):
            course = 12 if key == 'brick' else 28
            offset = ((yy // course) % 2) * 16
            mortar = (yy % course < 1.2) | ((xx + offset) % (32 if key == 'brick' else 48) < 1.4)
            value = np.where(mortar, -.065, value)
        if key in ('oak', 'timber', 'thatch'):
            value += .025 * np.sin(xx / 6 + np.sin(yy / 63))
        if key in ('slate', 'tile'):
            value += .016 * np.sin(xx / 13) * np.cos(yy / 11)
            # Gentle mineral variation belongs to individual lapped pieces,
            # without painted highlights that would contradict the night rig.
            value += .012 * (((xx // 22 + 3 * (yy // 30)) % 5) - 2)
        if key == 'cream':
            value += .006 * np.sin(xx * math.pi / 3)  # Woven linen and painted joinery.
        if boat_hull and key == 'slate':
            # The narrowboat hull's own UV island (canal_boat) lays this swatch
            # once: u along the whole 12.95 m, v up the girth from the bottom
            # edge to the gunwale. Round 5: one even coat of navy. The drift
            # that used to sit here (2.6 m and 1 m cells, about 10% of this
            # dark value) read as dirty patches at eye level; the runtime
            # paint finish already lays the brush and drift in metres on this
            # slot, so the baked swatch carries none.
            value = np.zeros((tile, tile))
        if bread_display and key == 'amber':
            # Crust, flour and three diagonal cuts, colour only. The shallow
            # loaf itself provides the lighting, rather than painted shadows.
            u, v = (xx / (tile - 1) - .5) * 2, (yy / (tile - 1) - .5) * 2
            value += .022 * np.sin(xx / 7 + np.cos(yy / 17))
            flour = np.maximum(0, np.sin(xx / 19) * np.cos(yy / 23) - .3)
            value += .09 * flour
            for cut in (-.43, 0, .43):
                score = np.exp(-((u - cut - v * .21) / .035) ** 2)
                score *= np.clip((.68 - np.abs(v)) / .12, 0, 1)
                value += .14 * score

        tint = np.zeros((tile, tile, 3))
        if forge_masonry and key in FORGE_MASONRY_TILES:
            # World-metric masonry for forge() (its UVs are laid in metres on
            # a FORGE_GRID period, so these swatches tile seamlessly). Brick
            # and slate are unused by the forge: they carry the damp footing
            # band and the porch flags. Joints >= 3 px here survive the 512 px
            # delivery resample.
            stone = FORGE_ASHLAR_RGB if key == 'thatch' else PALETTE['stone'][0]
            rgb = np.array([int(stone[k:k + 2], 16) / 255 for k in (0, 2, 4)])
            r = PALETTE['stone'][1]
            value, tint = forge_masonry_swatch(FORGE_MASONRY_TILES[key], xx, yy, tile)
        if church_slate and key == 'tile':
            value, tint = church_slate_swatch(xx, yy, tile)
        if shop_pantile and key == 'tile':
            value, tint = shop_pantile_swatch(xx, yy, tile)
        if civic_ashlar and key == CIVIC_ASHLAR_KEY:
            value = civic_ashlar_swatch(xx, yy, tile)
        if civic_plaster and key == 'plaster':
            value, tint = civic_plaster_swatch(xx, yy, tile)
        if pub_plaster and key == 'plaster':
            value, tint = pub_plaster_swatch(xx, yy, tile)
        y, x = (i // 4) * tile, (i % 4) * tile
        pixels[y:y + tile, x:x + tile, :3] = np.clip(rgb + value[..., None] + tint, 0, 1)
        rough[y:y + tile, x:x + tile, :3] = r
    if pub_thatch:
        # The pub's lofted thatch (pub_thatch_roof) shares the cottage's straw painting, on
        # slots the pub leaves unused and no runtime shader gates: two two-slot straw strips
        # (tile+thatch, brick+slate) and the cut end grain on the green slot. Iron (lanterns),
        # amber (glazing) and glass/rose (runtime-gated) are left alone.
        rgb = np.array([int(PALETTE['thatch'][0][k:k + 2], 16) / 255 for k in (0, 2, 4)])
        straw = PALETTE['thatch'][1]
        swatches = [(slot, 2, rgb, straw) + cottage_coat_swatch(2 * tile, tile, variant)
                    for variant, slot in enumerate(PUB_STRIPS)]
        swatches.append((PUB_BUTT_SLOT, 1, rgb, straw) + cottage_butt_swatch(tile))
        for slot, span, base, r, value, tint in swatches:
            band = (slice(slot // 4 * tile, (slot // 4 + 1) * tile), slice(slot % 4 * tile, (slot % 4 + span) * tile))
            pixels[band[0], band[1], :3] = np.clip(base + value[..., None] + tint, 0, 1)
            rough[band[0], band[1], :3] = r
    if civic_slate:
        # The town hall's full-eave slate strip over the brick and slate slots
        # (see CIVIC_SLATE_SLOT); its cupola reads the tile slot, which the
        # palette loop recolours as plain slate under civic_slate.
        colour, r = PALETTE['slate']
        base = np.array([int(colour[k:k + 2], 16) / 255 for k in (0, 2, 4)])
        value, tint = civic_slate_strip(2 * tile, tile)
        y, x = CIVIC_SLATE_SLOT // 4 * tile, CIVIC_SLATE_SLOT % 4 * tile
        pixels[y:y + tile, x:x + 2 * tile, :3] = np.clip(base + value[..., None] + tint, 0, 1)
        rough[y:y + tile, x:x + 2 * tile, :3] = r
    mat = bpy.data.materials.new('Authored village mineral and joinery atlas')
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 0
    for label, data, colourspace in [('albedo', pixels, 'sRGB'), ('roughness', rough, 'Non-Color')]:
        image = bpy.data.images.new('Village ' + label, width=size, height=size, alpha=True)
        image.colorspace_settings.name = colourspace
        image.pixels.foreach_set(data.ravel())
        image.filepath_raw = str(REPORT.parent / ('village-' + label + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color' if label == 'albedo' else 'Roughness'])
    return mat


def solid(name, points, faces, key):
    start = len(VERTS)
    # Inputs use the game's Y-up coordinates; Blender exports Z-up to Y-up.
    VERTS.extend((x, -z, y) for x, y, z in points)
    tile = KEYS.index(key)
    for face in faces:
        FACES.append(tuple(start + n for n in face))
        vertices = [points[n] for n in face]
        spans = [max(v[k] for v in vertices) - min(v[k] for v in vertices) for k in range(3)]
        axes = sorted(range(3), key=lambda k: spans[k], reverse=True)[:2]
        if 1 in axes:
            axes = [k for k in axes if k != 1] + [1]
        if DOOR_UV is not None:
            # Door joinery is laid in metres about the doorway centre (see
            # door_frame), so a 1.3 m leaf and a 9 cm stile read the swatch at
            # one density instead of each stretching the whole oak grain.
            ref, P = DOOR_UV
            UVS.append([((tile % 4 + .03 + .94 * min(1, max(0, .5 + (v[axes[0]] - ref[axes[0]]) / P))) / 4,
                         (tile // 4 + .03 + .94 * min(1, max(0, .5 + (v[axes[1]] - ref[axes[1]]) / P))) / 4)
                        for v in vertices])
            continue
        lows = [min(v[k] for v in vertices) for k in axes]
        UVS.append([((tile % 4 + .03 + .94 * (v[axes[0]] - lows[0]) / max(spans[axes[0]], 1e-8)) / 4,
                     (tile // 4 + .03 + .94 * (v[axes[1]] - lows[1]) / max(spans[axes[1]], 1e-8)) / 4) for v in vertices])
    PARTS.append({'name': name, 'key': key, 'firstVertex': start, 'vertexCount': len(points),
                  'bounds': [[min(v[k] for v in points) for k in range(3)],
                             [max(v[k] for v in points) for k in range(3)]]})


def solid_uv(name, points, faces, face_uvs, key):
    """solid() with the caller's own UV island: (a, b) fractions of the key's slot per face corner."""
    start = len(VERTS)
    VERTS.extend((x, -z, y) for x, y, z in points)
    tile = KEYS.index(key)
    for face, coords in zip(faces, face_uvs):
        FACES.append(tuple(start + n for n in face))
        UVS.append([((tile % 4 + .03 + .94 * a) / 4, (tile // 4 + .03 + .94 * b) / 4) for a, b in coords])
    PARTS.append({'name': name, 'key': key, 'firstVertex': start, 'vertexCount': len(points),
                  'bounds': [[min(v[k] for v in points) for k in range(3)],
                             [max(v[k] for v in points) for k in range(3)]]})


CUBE_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def box(name, c, d, key='plaster', yaw=0):
    x, y, z = c
    dx, dy, dz = [v / 2 for v in d]
    points = []
    for i, j, k in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                    (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]:
        u, v = i * dx, k * dz
        points.append((x + u * math.cos(yaw) + v * math.sin(yaw), y + j * dy,
                       z - u * math.sin(yaw) + v * math.cos(yaw)))
    solid(name, points, CUBE_FACES, key)


def display_loaf(name, centre, dims, yaw):
    # Closed oval relief entirely inside the old display-block envelope.
    # Working if front-face delivery rays see a rounded outline and crown,
    # with one unchanged atlas/material and no new window/shadow silhouette.
    x, y, z = centre
    rx, ry, rz = [d / 2 for d in dims]
    segments, rings = 12, 6
    local = [(0, ry, 0)]
    for ring in range(1, rings):
        theta = math.pi * ring / rings
        for i in range(segments):
            phi = math.tau * i / segments
            local.append((rx * math.sin(theta) * math.cos(phi),
                          ry * math.cos(theta),
                          rz * math.sin(theta) * math.sin(phi)))
    local.append((0, -ry, 0))
    bottom = len(local) - 1
    faces = [(0, 1 + i, 1 + (i + 1) % segments) for i in range(segments)]
    for row in range(rings - 2):
        for i in range(segments):
            a, b = 1 + row * segments + i, 1 + row * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    faces += [(bottom, bottom - segments + (i + 1) % segments,
               bottom - segments + i) for i in range(segments)]
    points = [(x + u * math.cos(yaw) + w * math.sin(yaw), y + v,
               z - u * math.sin(yaw) + w * math.cos(yaw)) for u, v, w in local]
    solid(name, points, faces, 'amber')
    tile = KEYS.index('amber')
    # A continuous face projection keeps crust cuts joined over the crown.
    for offset, face in enumerate(faces):
        UVS[-len(faces) + offset] = [
            ((tile % 4 + .03 + .94 * (local[n][0] / (2 * rx) + .5)) / 4,
             (tile // 4 + .03 + .94 * (local[n][1] / (2 * ry) + .5)) / 4)
            for n in face]


def beam(name, p, q, width, key='timber'):
    p, q = Vector(p), Vector(q)
    direction = (q - p).normalized()
    side = direction.cross(Vector((0, 0, 1)))
    if side.length < .01:
        side = direction.cross(Vector((0, 1, 0)))
    side.normalize()
    up = direction.cross(side).normalized()
    points = [tuple(c + side * i * width / 2 + up * j * width / 2)
              for c in (p, q) for i, j in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    solid(name, points, CUBE_FACES, key)


def prism(name, outline, front, back, key):
    n = len(outline)
    points = [(x, y, z) for z in (back, front) for x, y in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    solid(name, points, faces, key)


def lathe(name, x, z, profile, key='iron', segments=16, close_poles=False):
    if close_poles:
        # Opt-in: an r=0 profile row is one apex vertex closed by a triangle
        # fan, not a ring of coincident vertices whose quads each leave a
        # zero-area triangle. Same silhouette, `segments` fewer triangles.
        points, rows = [], []
        for r, y in profile:
            start = len(points)
            if r == 0:
                points.append((x, y, z))
                rows.append([start] * segments)
            else:
                points += [(x + r * math.cos(i * 2 * math.pi / segments), y,
                            z + r * math.sin(i * 2 * math.pi / segments)) for i in range(segments)]
                rows.append([start + i for i in range(segments)])
        faces = []
        for a, b in zip(rows, rows[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                face = (a[i], a[j], b[j], b[i])
                face = tuple(v for k, v in enumerate(face) if v not in face[:k])
                if len(face) >= 3:
                    faces.append(face)
        solid(name, points, faces, key)
        return
    points = [(x + r * math.cos(i * 2 * math.pi / segments), y,
               z + r * math.sin(i * 2 * math.pi / segments)) for r, y in profile for i in range(segments)]
    faces = [(row * segments + i, row * segments + (i + 1) % segments,
              (row + 1) * segments + (i + 1) % segments, (row + 1) * segments + i)
             for row in range(len(profile) - 1) for i in range(segments)]
    solid(name, points, faces, key)


def roof(name, x, z, width, depth, eave, ridge, key='slate', rows=6):
    for side in (-1, 1):
        for row in range(rows):
            t0, t1 = row / rows, (row + 1) / rows
            x0, x1 = x + side * width * t0 / 2, x + side * width * t1 / 2
            y0, y1 = ridge + (eave - ridge) * t0, ridge + (eave - ridge) * t1
            top = [(x0, y0, z - depth / 2), (x1, y1 + .028, z - depth / 2),
                   (x1, y1 + .028, z + depth / 2), (x0, y0, z + depth / 2)]
            solid(name + ' closed course', [(px, py - .08, pz) for px, py, pz in top] + top,
                  CUBE_FACES, key)
            # Short staggered joints break long ruler-like strips into tiles or
            # tied thatch bundles. They sit on the real slope, not on a decal.
            columns = max(4, round(depth / .72))
            for col in range(1, columns):
                zz = z - depth / 2 + (col + (row % 2) * .5) * depth / columns
                beam(name + ' staggered joint', (x0, y0 + .012, zz),
                     (x1, y1 + .037, zz), .012, 'timber' if key == 'thatch' else key)
        for end in (-1, 1):
            beam(name + ' verge', (x, ridge + .03, z + end * depth / 2),
                 (x + side * width / 2, eave + .03, z + end * depth / 2), .1, 'timber')
        # Eaves end 5 mm inside the verge face rather than in the courses' end plane.
        box(name + ' eaves', (x + side * (width / 2 - .045), eave - .04, z), (.1, .16, depth + .09), 'timber')
    beam(name + ' ridge cap', (x, ridge + .035, z - depth / 2),
         (x, ridge + .035, z + depth / 2), .13, key)
    for end in (-1, 1):
        prism(name + ' planar gable', [(x - width / 2 + .2, eave - .1),
              (x + width / 2 - .2, eave - .1), (x, ridge - .1)],
              z + end * (depth / 2 - .12), z + end * (depth / 2 - .24), 'plaster')


# Doorways at least this wide (frame width, m) hang a pair of leaves meeting on
# a centre joint: the town hall, church, school and pub. Narrower ones hang one.
DOOR_PAIR_MIN = 1.3
# Joinery depths in the frame's outward w (m). Leaves stand inside the
# architrave, 8 cm back from its face. A pair's centre line is the open joint
# over the back plate (w 0), which the town hall delivery ray checks.
# Panels sit in a 4 cm sunk channel and rise to a field 2.2 cm behind the
# members: deep enough for the portico's shade to read them (2026-11-07).
DOOR_MEMBER_W = (.012, .068)   # stiles, rails and muntins
DOOR_PANEL_W = (.026, .046)    # raised panel: back buried in the members' depth
DOOR_MEETING_GAP = .006        # dark joint between a pair of leaves
DOOR_UV_METRES = 12.0          # metres per atlas swatch for door joinery


def door_leaves(name, local, part, hu, hv):
    """Hang the leaves in an opening u in [-hu, hu], v in [-hv, hv].

    Each leaf is framed joinery: two stiles running full height, top, lock and
    bottom rails between them (and a frieze rail on tall leaves), a centre
    muntin on a single leaf, and one raised and fielded panel centred in every
    bay those members leave. A pair of leaves meets on a 6 mm joint at u=0, each
    with its own meeting stile and pull handle; a single leaf carries its handle
    on the lock stile. Members share one front plane, so nothing overlaps a
    panel and no two faces of the door lie within a millimetre of each other.
    """
    pair = hu * 2 + .085 >= DOOR_PAIR_MIN
    gap = DOOR_MEETING_GAP / 2
    leaves = [(-hu, -gap, 1), (gap, hu, -1)] if pair else [(-hu, hu, 1)]
    m0, m1 = DOOR_MEMBER_W
    mw, md = (m0 + m1) / 2, m1 - m0
    p0, p1 = DOOR_PANEL_W
    v0, v1 = -hv, hv
    lh = v1 - v0
    for u0, u1, lock in leaves:
        lw = u1 - u0
        sw = min(.16, max(.085, lw * .13))
        tr, br, lr = sw, min(sw * 1.7, lh * .09), sw * 1.3
        v_lock = v0 + lh * .36
        rails = [(v0, v0 + br), (v_lock - lr / 2, v_lock + lr / 2)]
        if lh > 2.9:
            v_frieze = v0 + lh * .74
            rails.append((v_frieze - sw / 2, v_frieze + sw / 2))
        rails.append((v1 - tr, v1))
        for su in (u0 + sw / 2, u1 - sw / 2):
            part('door stile', su, 0, mw, (sw, lh, md), 'oak')
        a, b = u0 + sw, u1 - sw
        for r0, r1 in rails:
            part('door rail', (a + b) / 2, (r0 + r1) / 2, mw, (b - a, r1 - r0, md), 'oak')
        if pair:
            columns = [(a, b)]
        else:
            mu = sw * .75
            columns = [(a, (a + b) / 2 - mu / 2), ((a + b) / 2 + mu / 2, b)]
        for (_, r_top), (r_bottom, _) in zip(rails, rails[1:]):
            if not pair:
                part('door muntin', (a + b) / 2, (r_top + r_bottom) / 2, mw, (mu, r_bottom - r_top, md), 'oak')
            for c0, c1 in columns:
                bevel = min(.045, .18 * min(c1 - c0, r_bottom - r_top))
                back = [(c0, r_top), (c1, r_top), (c1, r_bottom), (c0, r_bottom)]
                field = [(c0 + bevel, r_top + bevel), (c1 - bevel, r_top + bevel),
                         (c1 - bevel, r_bottom - bevel), (c0 + bevel, r_bottom - bevel)]
                # The bevel is a darker oak (timber) so the panels read in the
                # portico's shade, where uniform sky light flattens a 25 degree
                # slope to the field's own tone; the field is an oak board 2 mm
                # proud of the bevel's top, which it buries.
                solid(name + ' panel bevel',
                      [local(u, v, p0) for u, v in back] + [local(u, v, p1 - .002) for u, v in field],
                      CUBE_FACES, 'timber')
                (f0, g0), (f1, g1) = field[0], field[2]
                part('raised panel field', (f0 + f1) / 2, (g0 + g1) / 2, p1 - .003,
                     (f1 - f0, g1 - g0, .006), 'oak')
        # Pull handle on the meeting stile (pair) or the lock stile (single):
        # a brass back plate, two standoffs and a bar, clear of the panels.
        hu_ = u0 + sw / 2 if lock < 0 else u1 - sw / 2
        length = .34 if lh > 2.9 else .2
        part('handle plate', hu_, v_lock, .070, (.05, length + .07, .012), 'brass')
        for end in (-1, 1):
            part('handle standoff', hu_, v_lock + end * (length / 2 - .02), .0925, (.016, .016, .037), 'brass')
        part('handle bar', hu_, v_lock, .118, (.022, length, .022), 'brass')


def door_frame(name, x, y, z, width, height, yaw, trim, sill):
    """A doorway: architrave, dark back plate, threshold rail, sill and leaves.

    The architrave (jambs and a head that oversails them) runs back 8 cm into
    the wall so no gap opens behind it, and stands 15 cm (head 17 cm) proud of
    the frame plane; the leaves hang 8 cm back inside it. The ink back plate
    fills only the opening, behind the leaves, and shows only through the
    meeting joint. Joinery UVs are metric (DOOR_UV) so the oak grain keeps one
    density on every member instead of stretching across a 1.3 m panel.
    """
    global DOOR_UV

    def local(u, v, w):
        return (x + u * math.cos(yaw) + w * math.sin(yaw), y + v, z - u * math.sin(yaw) + w * math.cos(yaw))

    def part(label, u, v, w, dims, key):
        box(name + ' ' + label, local(u, v, w), dims, key, yaw)
    DOOR_UV = (local(0, 0, 0), DOOR_UV_METRES)
    try:
        hu, hv = width / 2 - .0425, height / 2 - .0425
        aw = .085 if width < 1.8 else .15
        back, front = -.08, .15
        part('back plate', 0, 0, (back + 0) / 2, (2 * hu + .01, 2 * hv + .01, -back), 'ink')
        jamb_bottom, jamb_top = -height / 2 - .09, hv + aw
        for side in (-1, 1):
            part('jamb', side * (hu + aw / 2), (jamb_bottom + jamb_top) / 2, (back + front) / 2,
                 (aw, jamb_top - jamb_bottom, front - back), trim)
        part('head', 0, hv + (aw + .03) / 2, (back + front + .02) / 2,
             (2 * (hu + aw + .03), aw + .03, front + .02 - back), trim)
        part('threshold rail', 0, -height / 2, (back + front) / 2, (2 * hu, .085, front - back), trim)
        if sill:
            part('sill', 0, -height / 2 - .065, .09, (width + .32, .12, .26), 'stone')
        door_leaves(name, local, part, hu, hv)
    finally:
        DOOR_UV = None


def frame(name, x, y, z, width=1, height=1.3, yaw=0, trim='cream', glass='glass', door=False, sill=True):
    if door and name != 'Cabin glazed doors':
        # The narrowboat's glazed cabin doors keep their own joinery below.
        door_frame(name, x, y, z, width, height, yaw, trim, sill)
        return

    def part(label, u, v, w, dims, key):
        box(name + ' ' + label, (x + u * math.cos(yaw) + w * math.sin(yaw), y + v,
            z - u * math.sin(yaw) + w * math.cos(yaw)), dims, key, yaw)
    part('recess', 0, 0, 0, (width + .12, height + .12, .08), 'ink')
    part('inset', 0, 0, .046, (width - .09, height - .09, .025), 'oak' if door else glass)
    for side in (-1, 1):
        part('jamb', side * width / 2, 0, .075, (.085, height + .18, .15), trim)
        part('rail', 0, side * height / 2, .075, (width + .16, .085, .15), trim)
    if sill:  # Opt-out for the narrowboat, which models its own oak threshold.
        part('sill', 0, -height / 2 - .065, .09, (width + .32, .12, .26), 'stone')
    if door:
        for side in (-1, 1):
            part('door stile', side * width * .25, -.03, .066, (.035, height - .2, .022), 'timber')
        # Traditional fielded panels sit inside the retained stile/latch depth.
        # Broad portals retain their clear centre and existing entry projection.
        for side in (() if name == 'Cabin glazed doors' else (-1, 1)):
            for row in (-1, 1):
                u, v = side * width * .23, row * height * .235
                pw, ph = width * .34, height * .34
                part('panel shadow', u, v, .061, (pw, ph, .012), 'timber')
                part('fielded oak panel', u, v, .069,
                     (max(.055, pw - .055), max(.09, ph - .055), .012), 'oak')
        part('latch', width * .3, -.06, .088, (.065, .14, .025), 'brass')
    else:
        part('mullion', 0, 0, .076, (.045, height, .04), trim)
        part('transom', 0, .09, .076, (width, .045, .04), trim)
        # Shallow opaque room layers preserve the atlas glazing mask and the
        # existing runtime virtual-room shader. No wall openings, translucent
        # material, external silhouette or lamp occluder is changed.
        if glass != 'ink' and name != 'Door upper pane':
            part('upper reveal shadow', 0, height * .43, .063,
                 (width - .15, .055, .014), 'ink')
            part('interior sill shelf', 0, -height * .39, .064,
                 (width - .15, .04, .022), 'oak')
            if name == 'Shop display':
                for i in range(5):
                    u, v, w = (i - 2) * width * .15, -height * .34, .066
                    display_loaf(name + ' display loaf',
                                 (x + u * math.cos(yaw) + w * math.sin(yaw), y + v,
                                  z - u * math.sin(yaw) + w * math.cos(yaw)),
                                 (width * .09, .12, .018), yaw)
            else:
                # Two short folds per side; the blue centre stays clear. Keep
                # every fold behind the existing projecting mullions and jambs.
                for side in (-1, 1):
                    for fold in range(2):
                        u = side * width * (.335 + fold * .055)
                        part('drawn linen fold', u, -.015, .064 + fold * .005,
                             (width * .058, height - .22, .014), 'cream')


def shell(name, width, depth, height, key='plaster', x=0, z=0):
    box(name + ' planar walls', (x, height / 2, z), (width, height, depth), key)
    box(name + ' plinth', (x, .16, z), (width + .13, .32, depth + .13), 'stone')
    box(name + ' cornice', (x, height - .07, z), (width + .18, .16, depth + .18), 'cream')


def chimney(x, z, bottom, top, width=.48):
    # A scaled closed casting replaces the dark patch hidden by the solid shaft.
    # Working if every caller keeps its old top/envelope and has a recessed throat.
    shaft_top, cap_bottom, cap_top = top - width * .65, top - width * .70, top - width * .49
    if shaft_top <= bottom:
        raise RuntimeError('Chimney shaft is too short for its retained flue')
    box('Chimney shaft', (x, (bottom + shaft_top) / 2, z), (width, shaft_top - bottom, width), 'stone')
    outer, inner = width + .13, width * .61
    thick, centre = (outer - inner) / 2, (outer + inner) / 4
    for side in (-1, 1):
        box('Open chimney cap front', (x, (cap_bottom + cap_top) / 2, z + side * centre),
            (outer, cap_top - cap_bottom, thick), 'cream')
        box('Open chimney cap side', (x + side * centre, (cap_bottom + cap_top) / 2, z),
            (thick, cap_top - cap_bottom, inner), 'cream')
    for sx in (-1, 1):
        for sz in (-1, 1):
            corner = [(x + sx * u, y, z + sz * v) for y in (cap_bottom, cap_top)
                      for u, v in ((inner / 2, inner / 2), (inner / 2, width * .12),
                                   (width * .12, inner / 2))]
            solid('Sealed chimney cap corner', corner,
                  [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], 'cream')
    lathe('Hollow village chimney pot', x, z,
          [(r * width, top - h * width) for r, h in
           [(.23, .54), (.34, .54), (.34, .46), (.30, .42),
            (.30, .12), (.34, .08), (.34, .03), (.30, 0),
            (.23, 0), (.22, .05), (.23, .54)]], 'stone', 24)


def arch(name, x, y, z, width, height, key='cream'):
    """A pointed lancet head, with a real extruded reveal and radial tracery."""
    outline = [(x - width / 2, y), (x - width / 2, y + height * .36),
               (x - width * .33, y + height * .72), (x, y + height),
               (x + width * .33, y + height * .72), (x + width / 2, y + height * .36),
               (x + width / 2, y)]
    prism(name + ' stained glass', outline, z + .016, z - .035, 'glass')
    for aa, bb in zip(outline[:-1], outline[1:]):
        beam(name + ' stone arch', (*aa, z + .08), (*bb, z + .08), .09, key)
    beam(name + ' lancet mullion', (x, y, z + .065), (x, y + height - .06, z + .065), .035, key)


def planting(x, z, height=.64):
    lathe('Clipped garden evergreen', x, z, [(.22, .36), (.34, .47), (.35, height), (.22, height + .17), (0, height + .22)], 'green', 9)


# Straw painting (game metres), now used only by the pub's lofted thatch: staggered
# bundles with ragged butts on one near-isotropic window, straw down the fall line.
COTTAGE_WU, COTTAGE_WV = 1.5, .75  # Straw window: along the ridge, down the slope.
COTTAGE_COURSE = COTTAGE_WV / 2  # Bundle length down the slope.
COTTAGE_COLUMNS = 36  # Bundles across one window: 4.2 cm each.
# Boat hull sweeps across its lofted stations, round bilge and flared ends
# while the gunwale (side to deck, ~90-100 degrees) and end caps stay sharp;
# the swept triangular strakes shade round over their apex (~104 degrees) but
# keep the buried back face's edges (~128 degrees) sharp; the square-section
# rope tube shades round.
BOAT_SMOOTH_PARTS = {'Fair tapered narrowboat hull': 62, 'Continuous rubbing strake': 112,
                     'Bow coiled rope': 95, 'Porthole brass collar': 50, 'Stern guard bent rail': 70}


def cottage_noise(fu, fv, nu, nv, seed):
    """Smooth value noise in [-.5, .5], periodic over the window: nu cells in u, nv in v."""
    gu, gv = fu * nu, fv * nv
    iu, iv = np.floor(gu), np.floor(gv)
    tu, tv = gu - iu, gv - iv
    tu, tv = tu * tu * (3 - 2 * tu), tv * tv * (3 - 2 * tv)

    def h(i, j):
        i, j = np.mod(i, nu), np.mod(j, nv)
        return np.modf(np.abs(np.sin(i * 12.9898 + j * 78.233 + seed * 37.719) * 43758.5453))[0]
    lo = h(iu, iv) + (h(iu + 1, iv) - h(iu, iv)) * tu
    hi = h(iu, iv + 1) + (h(iu + 1, iv + 1) - h(iu, iv + 1)) * tu
    return lo + (hi - lo) * tv - .5


def cottage_window(w, h, slots):
    """Window fractions (fu, fv) of each source pixel of a strip `slots` wide (padding wraps)."""
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx + .5) / 256 - .03) / (slots - .06), ((yy + .5) / 256 - .03) / .94


def cottage_hash(i, j, seed):
    """Deterministic [0, 1) hash of integer lattice cells."""
    return np.modf(np.abs(np.sin(i * 12.9898 + j * 78.233 + seed * 37.719) * 43758.5453))[0]


def cottage_coat_swatch(w, h, variant):
    """One 1.5 x 0.75 m straw window, periodic both ways, shared by the coat and the ridge roll.

    Built from bundles, not courses: 18 columns of straw across the window, each
    wandering slightly, cut into 37.5 cm bundles whose butts sit at a height
    drawn per column, so no two neighbouring butts line up and no ruled course
    line runs across the roof. Each bundle has its own tone and hue; inside it
    straw streaks run down the fall line at 1.5-3 cm, and its ragged butt end is
    lit above the soft shade it casts on the bundle below. Periods stay at or
    above 4 delivered pixels (about 160 px/m), and contrast is roughly twice the
    old lapped swatch's.
    """
    fu, fv = cottage_window(w, h, 2)
    common = 900  # Shared by both strips: column phases, ragged butts, and the bundle that straddles the window edge.
    seed = 100 * variant
    n = lambda nu, nv, s, du=0, sd=seed: cottage_noise(fu + du, fv, nu, nv, sd + s)
    cu = np.mod(fu + .010 * n(5, 3, 1, sd=common), 1) * COTTAGE_COLUMNS  # Columns wander, never ruled.
    col = np.floor(cu)
    bundles = COTTAGE_WV / COTTAGE_COURSE
    cv = np.mod(fv + cottage_hash(col, 1, common) / bundles, 1) * bundles + .10 * n(72, 1, 2, sd=common)
    seg = np.floor(cv)
    t = cv - seg  # 0 at a bundle's covered upper end, 1 at its cut butt.
    seg = np.mod(seg, bundles)
    # The bundle crossing the window's top and bottom edge (seg 0) is the same in both strips, so the
    # strips meet row to row at real butts, never on a ruled seam; the rest of each column is the strip's own.
    own = seg > 0
    sd = np.where(own, seed, common)
    tone = cottage_hash(col, seg + 7, sd) - .5
    hue = cottage_hash(col, seg + 17, sd) - .5
    du = col * .137  # Each bundle's streaks are its own.
    value = .05 * tone * (.4 + .6 * t)  # A bundle's own tone, strongest at its butt.
    streak = lambda sd_: .15 * n(60, 3, 3, du, sd_) + .07 * n(120, 6, 4, du, sd_)  # Straw down the fall line.
    value += np.where(own, streak(seed), streak(common))
    butt = np.clip((t - .86) / .14, 0, 1) ** 2
    value += .05 * butt  # Cut butt ends catch the light.
    value -= .075 * np.exp(-t / .05)  # Shade under the ragged butts of the bundle above.
    value += .035 * n(3, 2, 9, sd=common)  # Faint weathering, metres across.
    tint = np.zeros((h, w, 3))
    tint[..., 0] += .018 * hue + .010 * butt
    tint[..., 2] -= .014 * hue + .006 * butt
    return value, tint


def cottage_butt_swatch(tile):
    """End grain of cut straw (step riser, eave nose, verge ends, soffit): darker, stippled, periodic."""
    fu, fv = cottage_window(tile, tile, 1)
    n = lambda nu, nv, s: cottage_noise(fu, fv, nu, nv, 400 + s)
    value = -.075 + .080 * n(32, 32, 1) + .060 * n(16, 16, 2) + .030 * n(8, 8, 3)
    tint = np.zeros((tile, tile, 3))
    tint[..., 0] -= .006
    tint[..., 1] -= .010
    tint[..., 2] -= .010
    return value, tint


def cottage_slot_uv(slot, span, fu, fv):
    return ((slot % 4 + .03 + (span - .06) * fu) / 4, (slot // 4 + .03 + .94 * fv) / 4)


def cottage():
    shell('Cottage', 4.08, 4.55, 2.45)
    # Original delivery: a blind A/B preferred this roof to a modelled tiered thatch (asset loop, 2026-11-05).
    roof('Cottage thatch', 0, 0, 4.52, 4.9, 2.54, 4.06, 'thatch', 7)
    chimney(1.2, 0, 3.15, 4.332)
    frame('Front door', 0, 1.06, 2.295, .87, 1.87, trim='timber', door=True)
    for side in (-1, 1):
        frame('Front window', side * 1.3, 1.36, 2.295, .68, .9, trim='timber')
        frame('Rear window', side * 1.15, 1.37, -2.295, .8, 1, math.pi, 'timber')
        for z in (-1.25, 1.25):
            frame('Side window', side * 2.06, 1.36, z, .85, 1.02, side * math.pi / 2, 'timber')
        for z in (-2.23, 2.23):
            # Seated on the plinth: from the ground its outer face lay flush on the
            # plinth's, oak and stone fighting in one plane.
            box('Corner oak', (side * 2.025, 1.395, z), (.16, 2.15, .17), 'timber')
        for shutter in (-1, 1):
            box('Cottage painted shutter', (side * 1.3 + shutter * .47, 1.36, 2.33), (.21, .94, .08), 'green')
        # 2 cm proud of the stone sill, whose front face it used to share.
        box('Window herb box', (side * 1.3, .73, 2.42), (.9, .19, .23), 'oak')
        for i in (-1, 0, 1):
            lathe('Window herb planting', side * 1.3 + i * .24, 2.42, [(.09, .81), (.115, .98), (0, 1.05)], 'green', 8)
    frame('Gable casement', 0, 3.08, 2.325, .56, .57, trim='timber')
    box('Threshold', (0, .08, 2.4), (1.12, .16, .4), 'stone')


# Shop clay pantile roof (shop_roof). Each course is one closed solid whose top
# rolls as a pantile wave across the slope: SHOP_TILE_PERIODS tiles over the
# 5.15 m run (0.32 m cover width), sampled at SHOP_TILE_STATIONS (fractions of
# a tile), pan (trough) at the tile joints and roll (crown) between. Uneven
# stations keep no three profile points collinear (no zero-area triangles).
# Alternate courses are laid half a tile across (SHOP_COURSE_SHIFT), so the
# rolls break joint course to course and every tile reads on its own instead of
# as a continuous rib running up the slope. Every tile maps one cell of a 4 x 4
# grid of painted tiles in the tile slot (shop_pantile_swatch): both the cell's
# weathering band (row) and its detail variant (column) are hashed per tile, so
# tone varies tile by tile with no multi-tile drift (the old smooth band field
# read as a large lighter patch on one plane).
SHOP_TILE_PERIODS, SHOP_TILE_STATIONS, SHOP_TILE_RISE = 16, (0, .3, .5, .7), .03
SHOP_COURSE_SHIFT = .5  # Fraction of a tile by which odd courses are laid across.
SHOP_SMOOTH_PARTS = {'Shop pantile course': 40, 'Striped canvas awning': 40}
SHOP_CELL_INSET = .06  # Each tile's UVs sit this far inside its 64 px cell (mip bleed margin).


def shop_cell_uv(cell, t):
    """Slot fraction (solid_uv's a or b) of position t in [0, 1] across swatch
    cell `cell`. solid_uv pads the slot (.03 + .94 * a), so the cell's pixels
    are addressed through that pad rather than at a raw quarter of the slot."""
    return ((cell + SHOP_CELL_INSET + (1 - 2 * SHOP_CELL_INSET) * t) / 4 - .03) / .94


def shop_pantile_swatch(xx, yy, tile):
    """Sixteen fired-clay pantiles, one per 64 px cell: a across a tile (pans at
    0 and 1, roll at .5), b down it (0 at the butt, 1 under the course above),
    both measured inside the SHOP_CELL_INSET margin the course UVs keep.
    Row r is a weathering band, dark to light; column c a detail variant."""
    cell = tile // 4
    c, r = xx // cell, yy // cell
    span = 1 - 2 * SHOP_CELL_INSET
    a = ((xx % cell + .5) / cell - SHOP_CELL_INSET) / span
    b = ((yy % cell + .5) / cell - SHOP_CELL_INSET) / span
    value = (r - 1.5) / 1.5 * .04 + (((c * 7 + r * 5) % 4) / 3 - .5) * .016
    # The barrel itself: a broad dark pan in each channel and a broad lighter
    # crown, both from concavity rather than a light direction. No joint line:
    # the channel is the joint.
    pan = ((1 + np.cos(2 * np.pi * a)) / 2) ** 2
    value -= .11 * pan
    value += .03 * np.sin(np.pi * a) ** 2
    # Rounded tile end: the visible edge arches over each roll and sets back
    # into the pans, so every course line scallops instead of running straight.
    nose = .04 + .1 * np.cos(np.pi * a) ** 2
    value -= .07 * np.clip((nose - b) / .025, 0, 1)
    # A narrow lap shadow just under the step of the course above.
    value -= (.025 + .025 * pan) * np.clip((b - .94) / .06, 0, 1)
    # Firing mottle, decorrelated per cell, at periods of 6 px or more.
    value += .014 * np.sin(xx / 6.1 + 1.3 * r + 2.7 * c) * np.cos(yy / 7.3 + 2.1 * c)
    value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 900
    # Darker bands weather browner, lighter ones stay warmer.
    warmth = (r - 1.5) / 1.5 * .5 + (((c * 5 + r * 3 + c * r) % 7) / 6 - .5) * .4
    tint = np.stack([.03 * warmth, -.004 * warmth, -.02 * warmth], -1)
    return value, tint


def shop_tile_cell(side, row, p):
    """(column, band) of the swatch cell for tile p of course `row`, both from
    one integer hash of the tile, so neighbours differ and nothing drifts."""
    k = ((p + 7) * 2654435761 + (row + 3) * 40503 + (9973 if side > 0 else 0)) & 0xffffffff
    k = ((k ^ (k >> 13)) * 1274126177) & 0xffffffff
    k ^= k >> 16
    return k % 4, (k >> 2) % 4


def shop_line(x_abs, width, eave, ridge):
    """Nominal top line of the shop's courses at |x| from the ridge."""
    return ridge + (eave - ridge) * x_abs / (width / 2)


def shop_flat_uv(count, a, b, key):
    # Collapse the last `count` faces' UVs onto one texel of the key's slot.
    tile = KEYS.index(key)
    point = ((tile % 4 + .03 + .94 * a) / 4, (tile // 4 + .03 + .94 * b) / 4)
    for k in range(len(UVS) - count, len(UVS)):
        UVS[k] = [point] * len(UVS[k])


def shop_pantile_course(side, row, rows, z, width, depth, eave, ridge):
    t0, t1 = row / rows, (row + 1) / rows
    x0, x1 = side * width * t0 / 2, side * width * t1 / 2
    # The two top courses stop 1 cm short of the ridge line inside the ridge
    # cap, so their upper faces never coincide (a shared face welds non-manifold).
    x0 = x0 or side * .01
    y0, y1 = ridge + (eave - ridge) * t0, ridge + (eave - ridge) * t1 + .028
    # Odd courses break joint: the wave and the tiles' UV cells shift half a
    # tile across, and the course is clipped back to the same two end planes.
    phase = SHOP_COURSE_SHIFT * (row % 2)
    f = sorted({0.0, float(SHOP_TILE_PERIODS)} | {round(p + s + phase, 6) for p in range(-1, SHOP_TILE_PERIODS + 1)
                                                  for s in SHOP_TILE_STATIONS if 0 < p + s + phase < SHOP_TILE_PERIODS})
    n = len(f) - 1
    zs = [z - depth / 2 + depth * k / SHOP_TILE_PERIODS for k in f]
    wave = [-SHOP_TILE_RISE * math.cos(2 * math.pi * (k - phase)) for k in f]
    points = [(x0, y0 + w, zz) for zz, w in zip(zs, wave)] + [(x1, y1 + w, zz) for zz, w in zip(zs, wave)]
    U, L = list(range(n + 1)), list(range(n + 1, 2 * n + 2))
    ub0, ub1, lb0, lb1 = range(2 * n + 2, 2 * n + 6)
    points += [(x0, y0 - .08, zs[0]), (x0, y0 - .08, zs[-1]), (x1, y1 - .08, zs[0]), (x1, y1 - .08, zs[-1])]
    faces, uvs = [], []
    for j in range(n):
        p = math.floor((f[j] + f[j + 1]) / 2 - phase)
        c, r = shop_tile_cell(side, row, p)
        a0, a1 = shop_cell_uv(c, f[j] - phase - p), shop_cell_uv(c, f[j + 1] - phase - p)
        top, butt = shop_cell_uv(r, 1), shop_cell_uv(r, 0)
        faces.append((U[j], U[j + 1], L[j + 1], L[j]))
        uvs.append([(a0, top), (a1, top), (a1, butt), (a0, butt)])
    flat = (shop_cell_uv(0, .5), shop_cell_uv(0, .4))  # Course edges: the darkest band's crown.
    rest = [L + [lb1, lb0], U + [ub1, ub0], (ub0, ub1, lb1, lb0),
            (U[0], L[0], lb0, ub0), (U[n], L[n], lb1, ub1)]
    faces += [tuple(f) for f in rest]
    uvs += [[flat] * len(f) for f in rest]
    solid_uv('Shop pantile course', points, faces, uvs, 'tile')


def shop_roof(z=-.08, width=5.9, depth=5.15, eave=3.69, ridge=5.77, rows=11):
    """The shop's own seated pantile roof (roof() still builds cottage and forge).

    Plaster gables and eave wall plates rise from inside the cornice into the
    course slabs, so the roof rests on the walls; timber bargeboards and cream
    soffits close the gable overhangs. Everything stays inside the raw bounds
    the old roof() call set, so the envelope fit and every anchor are unchanged.
    """
    def line(x):
        return shop_line(abs(x), width, eave, ridge)
    for side in (-1, 1):
        for row in range(rows):
            shop_pantile_course(side, row, rows, z, width, depth, eave, ridge)
        for end in (-1, 1):
            beam('Shop tile verge', (0, ridge + .03, z + end * depth / 2),
                 (side * width / 2, eave + .03, z + end * depth / 2), .1, 'timber')
        # Eaves fascia set below the course butts, so the pantile ends show.
        box('Shop tile eaves fascia', (side * 2.875, 3.5875, z), (.11, .175, depth + .09), 'timber')
        # Wall plate: from inside the cornice up into the course slab.
        prism('Shop eave wall plate', [(side * 2.55, 3.55), (side * 2.86, 3.55),
              (side * 2.86, line(2.86) - .04), (side * 2.55, line(2.55) - .04)], 2.37, -2.37, 'plaster')
    # Gable wall heads: shoulders and apex 4 cm up inside the courses.
    gable = [(-2.75, 3.55), (2.75, 3.55), (2.75, line(2.75) - .04), (0, ridge - .04), (-2.75, line(2.75) - .04)]
    for front, back in ((2.38, 2.25), (-2.25, -2.38)):
        prism('Shop planar gable', gable, front, back, 'plaster')
    for end, (inner, outer) in ((1, (2.37, 2.49)), (-1, (-2.37, -2.64))):
        e = z + end * depth / 2
        board = [(-2.93, line(2.93) - .13), (0, ridge - .13), (2.93, line(2.93) - .13),
                 (2.93, line(2.93)), (0, ridge), (-2.93, line(2.93))]
        prism('Shop bargeboard', board, e + end * .03, e - end * .02, 'timber')
        soffit = [(-2.9, line(2.9) - .105), (0, ridge - .105), (2.9, line(2.9) - .105),
                  (2.9, line(2.9) - .075), (0, ridge - .075), (-2.9, line(2.9) - .075)]
        prism('Shop verge soffit', soffit, max(inner, outer), min(inner, outer), 'cream')
    ridge_cap = [(.065, ridge - .03), (.065, ridge + .035), (.046, ridge + .081), (0, ridge + .1),
                 (-.046, ridge + .081), (-.065, ridge + .035), (-.065, ridge - .03)]
    start = len(FACES)
    prism('Shop half-round ridge', ridge_cap, z + depth / 2, z - depth / 2, 'tile')
    shop_flat_uv(len(FACES) - start, shop_cell_uv(2, .5), shop_cell_uv(1, .5), 'tile')


def shop_casement(name, x, y, z, width, height, yaw, wall, trim='cream', door=False):
    """Every shop opening: side and rear casements, the display window and the
    door (frame() still builds every other building's windows).

    The joint is modelled rather than padded: one closed architrave ring lofted
    from a cross-section around the opening, with mitred corners. Its back face
    is buried 1 cm inside the wall face (`wall`: the wall plane in the frame's
    outward w, negative), its inner reveal returns past the glass and laps the
    glass edge by 6 mm, and its outer face stops at the old jamb's outer edge.
    No ink recess box stands beside the jambs any more, so nothing dark can show
    between frame and plaster. Glass inset, glazing bars, linen folds and the
    stone sill keep frame()'s exact dimensions, so the glazing anchor the night
    shader reads and the raw extents (the sill sets the x envelope) are unchanged.
    The display keeps its shelf, upper shadow and five loaves at frame()'s exact
    positions (runtime anchors). The door hangs door_leaves()'s framed leaf in
    the reveal (2026-11-07: the old stiles crossed the middle of each panel).
    """
    def local(u, v, w):
        return (x + u * math.cos(yaw) + w * math.sin(yaw), y + v, z - u * math.sin(yaw) + w * math.cos(yaw))

    def part(label, u, v, w, dims, key):
        box(name + ' ' + label, local(u, v, w), dims, key, yaw)
    back = wall - .01
    # Cross-section (d out from the reveal line, w outward): reveal face, 45
    # degree architrave chamfer, front face, small outer arris, outer face.
    profile = [(0, back), (0, .118), (.032, .15), (.08, .15), (.0935, .1365), (.0935, back)]
    U0, V0 = width / 2 - .051, height / 2 - .051
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    n = len(profile)
    points = [local(su * (U0 + d), sv * (V0 + d), w) for su, sv in corners for d, w in profile]
    faces = [(c * n + i, c * n + (i + 1) % n, (c + 1) % 4 * n + (i + 1) % n, (c + 1) % 4 * n + i)
             for c in range(4) for i in range(n)]
    solid(name + ' lofted architrave', points, faces, trim)
    if not door:
        part('inset', 0, 0, .046, (width - .09, height - .09, .025), 'glass')
    part('sill', 0, -height / 2 - .065, .09, (width + .32, .12, .26), 'stone')
    if door:
        # The leaf fills the architrave's reveal (door_leaves), laid in metres.
        global DOOR_UV
        DOOR_UV = (local(0, 0, 0), DOOR_UV_METRES)
        try:
            door_leaves(name, local, part, U0, V0)
        finally:
            DOOR_UV = None
        return
    part('mullion', 0, 0, .076, (.045, height, .04), trim)
    part('transom', 0, .09, .076, (width, .045, .04), trim)
    if name == 'Shop display':
        part('upper reveal shadow', 0, height * .43, .063, (width - .15, .055, .014), 'ink')
        part('interior sill shelf', 0, -height * .39, .064, (width - .15, .04, .022), 'oak')
        for i in range(5):
            display_loaf(name + ' display loaf', local((i - 2) * width * .15, -height * .34, .066),
                         (width * .09, .12, .018), yaw)
        return
    for side in (-1, 1):
        for fold in range(2):
            u = side * width * (.335 + fold * .055)
            part('drawn linen fold', u, -.015, .064 + fold * .005, (width * .058, height - .22, .014), 'cream')


SHOP_AWNING = dict(x0=-2.53, x1=2.53, strips=12, stations=5, bow=.03, cloth=.04, drop=.035,
                   wall=(2.29, 2.95), front=(2.70 + .035 / 2, 2.755), hem=2.625)


def shop_awning_top(z):
    """Top line of the canopy's traced side profile at depth z, as y: a straight
    run from inside the wall under the fascia to the front rail, bowed up by
    `bow` at mid-depth like canvas pulled over a curved arm."""
    A = SHOP_AWNING
    (z0, y0), (z1, y1) = A['wall'], A['front']
    s = (z - z0) / (z1 - z0)
    return y0 + s * (y1 - y0) + A['bow'] * math.sin(math.pi * s)


def shop_awning():
    """The striped canopy, lofted from one traced side profile with closed ends.

    Each of the 12 stripes is one closed solid swept along x from a single
    section: the bowed top from inside the wall to the front rail, the front
    drop that IS the valance (no separate valance box is stacked on the edge),
    the drop's inner face, and the canvas underside back into the wall. The
    frontmost face sits on the old valance's front plane (z 2.70 + .035 / 2),
    which owns the raw max z, so the envelope fit and every anchor are unchanged.

    The ends are closed returns, not open sheet edges: a cheek panel on each
    side fills the triangle between wall, canvas and hem, in the end stripe's
    own key. Its top edge follows the same profile 1.5 cm under the canvas top
    and its front edge stands inside the drop, so both joints are buried; its
    rear edge is buried 2.5 cm in the wall; its outer face stands 8 mm inboard
    of the stripe's end face and its hem 5 mm above the drop's, so no two faces
    of different shading lie flush.
    """
    A = SHOP_AWNING
    (z0, _), (zf, _) = A['wall'], A['front']
    n, t, cloth, hem = A['stations'], A['drop'], A['cloth'], A['hem']
    zs = [z0 + k * (zf - z0) / (n - 1) for k in range(n)]
    zi = zf - t
    section = [(z, shop_awning_top(z)) for z in zs]
    section += [(zf, hem), (zi, hem), (zi, shop_awning_top(zi) - cloth)]
    section += [(z, shop_awning_top(z) - cloth) for z in reversed(zs[:-1])]
    m = len(section)
    ring = [(k, (k + 1) % m, (k + 1) % m + m, k + m) for k in range(m)]
    caps = [tuple(reversed(range(m))), tuple(range(m, 2 * m))]
    width = (A['x1'] - A['x0']) / A['strips']
    for i in range(A['strips']):
        # A .8 mm seam each side, as the old strips' 1.7 mm spacing: with flush
        # end caps the delivered GLB probed 165 winding/non-manifold edges.
        xa, xb = A['x0'] + i * width + .0008, A['x0'] + (i + 1) * width - .0008
        solid('Striped canvas awning', [(x, y, z) for x in (xa, xb) for z, y in section],
              caps + ring, 'cream' if i % 2 else 'green')
    zc = zf - .012
    cheek = [(z0, hem + .005)] + [(z, shop_awning_top(z) - .015) for z in zs[:-1]]
    cheek += [(zc, shop_awning_top(zc) - .015), (zc, hem + .005)]
    c = len(cheek)
    for sd, key in ((-1, 'green'), (1, 'cream' if (A['strips'] - 1) % 2 else 'green')):
        X = A['x1'] if sd > 0 else A['x0']
        points = [(X - sd * inset, y, z) for inset in (.028, .008) for z, y in cheek]
        faces = [tuple(reversed(range(c))), tuple(range(c, 2 * c))]
        faces += [(k, (k + 1) % c, (k + 1) % c + c, k + c) for k in range(c)]
        solid('Awning closed side cheek', points, faces, key)


def shop():
    shell('Shop', 5.48, 4.63, 3.64)
    shop_roof()
    shop_casement('Shop door', -1.7, 1.18, 2.34, .86, 2.15, 0, -.025, trim='green', door=True)
    shop_casement('Shop display', .73, 1.53, 2.34, 2.98, 1.95, 0, -.025, trim='green')
    box('Shop fascia board', (0, 3.15, 2.40), (5.22, .55, .13), 'green')
    shop_awning()
    for side in (-1, 1):
        shop_casement('Upper rear casement', side * 1.5, 2, -2.34, 1.05, 1.4, math.pi, -.025)
        shop_casement('Side casement', side * 2.76, 1.85, 0, 1.15, 1.45, side * math.pi / 2, -.02)
    box('Shop threshold', (-1.7, .065, 2.43), (1.15, .13, .46), 'stone')


def hip_roof(name, width, depth, eave, peak, key='slate', rows=7):
    # Four closed hip slopes retain the v0.30 silhouette, with actual lap edges.
    def ring(t):
        w, d = width * (1 - t) / 2, depth * (1 - t) / 2
        y = eave + (peak - eave) * (t if key != 'thatch' else math.sin(t * math.pi / 2))
        return [(-w, y, -d), (w, y, -d), (w, y, d), (-w, y, d)]
    for row in range(rows):
        lower, upper = ring(row / rows), ring((row + 1) / rows * .995)
        for side in range(4):
            nxt = (side + 1) % 4
            top = [lower[side], lower[nxt], upper[nxt], upper[side]]
            solid(name + ' closed hipped course', [(x, y - .075, z) for x, y, z in top] + top, CUBE_FACES, key)
            beam(name + ' lapped edge', lower[side], lower[nxt], .035, key)
    for side in (-1, 1):
        box(name + ' eaves fascia', (0, eave - .085, side * depth / 2), (width, .17, .14), 'timber')
        # Side fascias run on to 5 mm inside the front fascia's face, so neither
        # fascia ends in the plane of a course face (timber over slate).
        box(name + ' eaves fascia', (side * width / 2, eave - .085, 0), (.14, .17, depth + .13), 'timber')
        for end in (-1, 1):
            if key != 'thatch':
                beam(name + ' diagonal hip capping', (side * width / 2, eave + .02, end * depth / 2), (0, peak + .02, 0), .075, key)


def rotate_parts(start, yaw, centre=(0, 0, 0)):
    cx, cy, cz = centre
    for i in range(start, len(VERTS)):
        x, nz, y = VERTS[i]
        u, v = x - cx, -nz - cz
        VERTS[i] = (cx + u * math.cos(yaw) + v * math.sin(yaw),
                    -(cz - u * math.sin(yaw) + v * math.cos(yaw)), y)


def roundel(name, x, y, z, radius, key, yaw=0, segments=32):
    start = len(VERTS)
    outline = [(x + radius * math.cos(i * 2 * math.pi / segments), y + radius * math.sin(i * 2 * math.pi / segments)) for i in range(segments)]
    prism(name, outline, z + .035, z, key)
    if yaw:
        rotate_parts(start, yaw, (x, y, z))


def ring_frame(name, x, y, z, radius, thickness, key='cream', yaw=0, segments=32):
    start = len(VERTS)
    points = [(x + r * math.cos(i * math.tau / segments), y + r * math.sin(i * math.tau / segments), zz)
              for zz in (z - thickness / 2, z + thickness / 2)
              for r in (radius - thickness / 2, radius + thickness / 2) for i in range(segments)]
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces += [(i,j,segments+j,segments+i),
                  (2*segments+i,3*segments+i,3*segments+j,2*segments+j),
                  (i,2*segments+i,2*segments+j,j),
                  (segments+i,segments+j,3*segments+j,3*segments+i)]
    solid(name, points, faces, key)
    if yaw:
        rotate_parts(start, yaw, (x, y, z))


def quoins(name, width, depth, height, key='cream'):
    for x in (-width / 2, width / 2):
        for z in (-depth / 2, depth / 2):
            for row in range(int(height / .62)):
                box(name + ' dressed corner block', (x, .54 + row * .62, z),
                    (.42 if row % 2 else .62, .30, .62 if row % 2 else .42), key)


def church_spire_planar_uvs(points, faces, y0=13.0, rise=6.3):
    """Slate laid flat on each traced face: level courses round the whole spire.

    u runs in metres along the face's horizontal from its own edge; v is height
    above y0 over `rise` (14 painted courses of .45 m), so every face, broach
    and flat alike, carries courses at the same levels and they meet at the
    arrises. Both are linear in position, so the mapping is exact on any planar
    face of any shape. Horizontal faces take the butt-shadow row.
    """
    P = CHURCH_SLATE_P
    uvs = []
    for face in faces:
        pts = [points[n] for n in face]
        normal = [0.0, 0.0, 0.0]
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            normal[0] += (p[1] - q[1]) * (p[2] + q[2])
            normal[1] += (p[2] - q[2]) * (p[0] + q[0])
            normal[2] += (p[0] - q[0]) * (p[1] + q[1])
        across = math.hypot(normal[0], normal[2])
        if across < .3 * abs(normal[1]):
            x0 = min(p[0] for p in pts)
            uvs.append([church_slate_uv(min(1, (p[0] - x0) / P), .03 / CHURCH_SLATE_ROWS) for p in pts])
            continue
        tx, tz = -normal[2] / across, normal[0] / across
        s = [p[0] * tx + p[2] * tz for p in pts]
        if max(s) - min(s) > P or max(p[1] for p in pts) - y0 > rise:
            raise RuntimeError('Spire slate face exceeds one slate swatch')
        uvs.append([church_slate_uv((si - min(s)) / P, (p[1] - y0) / rise) for si, p in zip(s, pts)])
    UVS[-len(faces):] = uvs


def church_broach_spire(cz=-4.7):
    """Octagonal broach spire traced as its true planes, on a bell-cast eave.

    Rounds before this lofted 21 stacked course rings with an entasis: the
    flats ran down to the full tower side, so each "broach" was only a sheared
    corner of the flat plane and the profile bowed like a cone. Here the spire
    is the geometry a carpenter sets out, every face a single flat plane:
    - a regular octagonal pyramid whose eaves octagon stands on the tower's
      wall lines (half-width s), straight arrises from its eight vertices to
      the apex;
    - at each tower corner a broach: two steep triangles rising from the corner
      along a hip ridge to a point M on the diagonal face's centre line, a
      third of the way up, so each diagonal face ends downward in a V;
    - below it, a separate square bell-cast eave whose pitch eases from the
      2.55 m lip (which sets the rear extent, as before) up into the spire.
    Iron ribs stand 12 cm proud on the eight arrises, die out on the broaches
    at the foot and into the closed gilt knop at the top.
    Working if eye-level views show the octagon's arrises running down to the
    eaves, four corner broaches with their hip ridges, and a flared eave.
    """
    s, ye, apex, u = 2.2, 13.5, 19.05, .33
    t8, c8 = math.tan(math.pi / 8), math.cos(math.pi / 8)

    # Bell-cast eave: square stations (height, half-width), lip seated 7 cm in
    # the top string course, its top tucked 1 cm inside the spire's planes.
    eave = [(13.04, 2.55), (13.14, 2.55), (13.24, 2.43), (13.37, 2.31), (13.5, 2.205), (13.53, 2.17)]
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    points = [(x * w, y, cz + z * w) for y, w in eave for x, z in corners]
    faces = [(3, 2, 1, 0)]
    for k in range(len(eave) - 1):
        a, b = 4 * k, 4 * k + 4
        faces += [(a + i, a + (i + 1) % 4, b + (i + 1) % 4, b + i) for i in range(4)]
    top = 4 * (len(eave) - 1)
    faces.append((top, top + 1, top + 2, top + 3))
    solid('Spire bell-cast slate eave', points, faces, 'tile')
    church_spire_planar_uvs(points, faces)

    # Spire body. A[2c], A[2c+1] bound flat c; K[c] is the tower corner between
    # flats c and c+1; M[c] is the broach point on that corner's diagonal face.
    A = []
    for c in range(4):
        cs, sn = round(math.cos(c * math.pi / 2)), round(math.sin(c * math.pi / 2))
        for tt in (-s * t8, s * t8):
            A.append((s * cs - tt * sn, ye, s * sn + tt * cs))
    K = [(s * (round(math.cos(c * math.pi / 2)) + round(math.cos((c + 1) * math.pi / 2))), ye,
          s * (round(math.sin(c * math.pi / 2)) + round(math.sin((c + 1) * math.pi / 2)))) for c in range(4)]
    M = []
    for c in range(4):
        a1, a2 = A[2 * c + 1], A[(2 * c + 2) % 8]
        d = ((a1[0] + a2[0]) / 2, ye, (a1[2] + a2[2]) / 2)
        M.append((d[0] * (1 - u), ye + u * (apex - ye), d[2] * (1 - u)))
    points = [(p[0], p[1], cz + p[2]) for p in A + K + M] + [(0, apex, cz)]
    k0, m0, ap = 8, 12, 16
    faces = [tuple(reversed(range(8)))]  # Eaves octagon underside, inside the bell-cast.
    for c in range(4):
        a0, a1, a2 = 2 * c, 2 * c + 1, (2 * c + 2) % 8
        faces += [(a0, a1, ap),                                # flat
                  (a1, k0 + c, m0 + c), (k0 + c, a2, m0 + c),  # broach
                  (a1, m0 + c, ap), (m0 + c, a2, ap),          # diagonal, V-ended
                  (a2, k0 + c, a1)]                            # corner underside
    solid('Church octagonal broach spire', points, faces, 'tile')
    church_spire_planar_uvs(points, faces)

    # Iron ribs: a triangular section on each arris, scaled about the arris so
    # every face stays planar; tapered stops at the broach and in the knop.
    R0 = s / c8
    for j in range(8):
        phi = math.pi / 8 + j * math.pi / 4
        rho, tau = (math.cos(phi), math.sin(phi)), (-math.sin(phi), math.cos(phi))
        rib = []
        for y, k in ((13.62, .3), (14.1, 1.0), (18.25, 1.0), (18.6, .45)):
            r = R0 * (apex - y) / (apex - ye)
            for depth, side in ((-.04, -.065), (-.04, .065), (.12, 0)):
                rib.append((rho[0] * (r + k * depth) + tau[0] * k * side, y,
                            cz + rho[1] * (r + k * depth) + tau[1] * k * side))
        rib_faces = [(2, 1, 0), (9, 10, 11)]
        for row in range(3):
            rib_faces += [(3 * row + i, 3 * row + (i + 1) % 3, 3 * row + 3 + (i + 1) % 3, 3 * row + 3 + i)
                          for i in range(3)]
        solid('Spire raised iron rib', rib, rib_faces, 'iron')

    # A closed gilt knop seats the cross stem and gathers the ribs at the apex.
    profile, n = [(.06, 18.5), (.27, 18.57), (.29, 18.68), (.2, 18.86), (.045, 19.02)], 12
    knop = [(r * math.cos(i * math.tau / n), y, cz + r * math.sin(i * math.tau / n)) for r, y in profile for i in range(n)]
    knop_faces = [tuple(reversed(range(n))), tuple(range(n * (len(profile) - 1), n * len(profile)))]
    knop_faces += [(row * n + i, row * n + (i + 1) % n, (row + 1) * n + (i + 1) % n, (row + 1) * n + i)
                   for row in range(len(profile) - 1) for i in range(n)]
    solid('Spire gilt knop', knop, knop_faces, 'brass')


CHURCH_ASHLAR_PERIOD = 4.4  # Metres of wall per stone swatch: ~.51 m courses, ~.88 m blocks.


def church_metric_ashlar(name, c, d, key='stone'):
    """A box whose every face maps the swatch in metres, not stretched to fit.

    solid() fits each face to the whole swatch, so a 13 m tower face drew 1.4 m
    courses and the 10 m nave face 1.9 m blocks. Here a face uses only its own
    share of one CHURCH_ASHLAR_PERIOD, so stacked stages and rear facings keep
    one coursing scale. Every face must fit inside one period.
    """
    box(name, c, d, key)
    tile, P = KEYS.index(key), CHURCH_ASHLAR_PERIOD
    for k in range(len(FACES) - 6, len(FACES)):
        pts = [(VERTS[i][0], VERTS[i][2], -VERTS[i][1]) for i in FACES[k]]  # Back to game axes.
        spans = [max(p[a] for p in pts) - min(p[a] for p in pts) for a in range(3)]
        flat = spans.index(min(spans))
        ua, va = {0: (2, 1), 1: (0, 2), 2: (0, 1)}[flat]
        if spans[ua] > P + 1e-6 or spans[va] > P + 1e-6:
            raise RuntimeError(name + ' face exceeds one ashlar period: ' + str(spans))
        u0, v0 = min(p[ua] for p in pts), min(p[va] for p in pts)
        UVS[k] = [((tile % 4 + .03 + .94 * (p[ua] - u0) / P) / 4,
                   (tile // 4 + .03 + .94 * (p[va] - v0) / P) / 4) for p in pts]


def church_tower_weathering():
    """Chamfered dressed weathering over the tower's battered plinth.

    Outer drip ring 4 cm past the stone plinth below, sloping back into the
    tower walls; its front end is buried in the nave. One closed solid.
    """
    x_out, z_out, x_in, z_in, front = 2.22, -7.02, 1.97, -6.77, -5.9
    rings = [(x_out, z_out, .87), (x_out, z_out, .96), (x_in, z_in, 1.15)]
    points = []
    for x, z, y in rings:
        points += [(-x, y, z), (x, y, z), (x, y, front), (-x, y, front)]
    faces = [(3, 2, 1, 0)]
    for r in range(2):
        lo, hi = 4 * r, 4 * r + 4
        faces += [(lo + i, lo + (i + 1) % 4, hi + (i + 1) % 4, hi + i) for i in range(4)]
    faces.append((8, 9, 10, 11))
    solid('Tower chamfered weathering', points, faces, 'cream')


def church_rear_elevation():
    """The rear (-z) elevation: battered plinths, a set-off course, three lancets.

    The nave's rear flanks (|x| 2-5) and the tower foot were one flat slab.
    A stone plinth with a chamfered cream water-table now runs across the
    flanks and steps out round the tower; a string course at 4.6 m ties the
    tower's ground stage to the nave; and each flank carries a glazed lancet
    sitting on its own metric ashlar facing, 2.5 cm proud of the old face.
    Working if the back view shows a plinth line, a mid course and three
    windows, with one coursing scale on the tower and the flanks.
    """
    church_metric_ashlar('Tower battered stone plinth', (0, .46, -6.44), (4.36, .92, 1.08))
    church_tower_weathering()
    for side in (-1, 1):
        mid = side * (1.95 + 4.62) / 2
        church_metric_ashlar('Nave rear stone plinth', (mid, .45, -6.065), (2.67, .9, .19))
        # Chamfered water-table: 4 cm drip over the plinth, sloping back into the wall.
        # It sits on the plinth top (.9): set 2 cm lower, its ends shared the
        # plinth's end planes at x 1.95 and 4.62 and fought them for depth.
        profile = [(-5.97, .9), (-6.2, .9), (-6.2, .96), (-5.97, 1.15)]
        x0, x1 = sorted((side * 1.95, side * 4.62))
        points = [(x, y, z) for x in (x0, x1) for z, y in profile]
        solid('Nave rear chamfered water-table', points,
              [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], 'cream')
        # Facings end inside the tower and inside the quoins, under the cornice.
        fx = side * (1.95 + 4.85) / 2
        church_metric_ashlar('Nave rear ashlar facing', (fx, (1.08 + 4.62) / 2, -5.9875), (2.9, 3.54, .075))
        church_metric_ashlar('Nave rear ashlar facing', (fx, (4.58 + 7.92) / 2, -5.9875), (2.9, 3.34, .075))
        # Lowered and shortened so the hood clears the 4.6 m set-off course
        # (bottom 4.51) and the sill the water-table (top 1.15).
        church_lancet('Rear stone lancet', (side * 3.4, 1.5, -6.025), (1, 0), (0, -1), 1.1, 2.4)
    # Set-off course at 4.6 m: across both flanks, and 1 cm taller round the tower.
    box('Rear flank string course', (0, 4.6, -6.015), (9.24, .18, .13), 'cream')
    box('Tower ground-stage string course', (0, 4.6, -6.415), (4.16, .2, .93), 'cream')


def church_pavilion_roof(name='Nave blue slate', W=5.55, D=6.7, eave=8.09, peak=11.9, skin=.075, butt=.025):
    """The nave roof as one closed, stepped slate shell (the spire's method).

    Replaces hip_roof's 32 overlapping course boxes and 32 lap beams. The four
    hips keep the v0.30 pavilion silhouette. Each of CHURCH_SLATE_ROWS courses
    is a planar band round all four slopes, its lower edge raised by a 2.5 cm
    lapped butt; an inner skin 7.5 cm below closes the shell to one solid.
    Every ring is cut at x 0 and z 0, so no face spans more than one slate
    period: u runs in metres along the eave, v maps one painted course per
    band. Working if each slope shows square slates in courses whose butts
    are modelled, and the roof probe still finds a 2-15 cm skin.
    """
    R, P, H, N = CHURCH_SLATE_ROWS, CHURCH_SLATE_P, peak - eave, CHURCH_SLATE_ROWS

    def ring(t, dy=0.0):
        a, d, y = W * (1 - t), D * (1 - t), eave + H * t + dy
        return [(a, y, d), (0, y, d), (-a, y, d), (-a, y, 0), (-a, y, -d), (0, y, -d), (a, y, -d), (a, y, 0)]

    def u_at(p, seg):  # Segments 0-1 front, 2-3 left, 4-5 rear, 6-7 right.
        c = p[0] if seg in (0, 1, 4, 5) else p[2]
        return c / P if seg in (0, 2, 5, 7) else 1 + c / P

    rings, kinds = [ring(0, -skin), ring(0)], [('butt', 0)]
    for n in range(1, N):
        rings.append(ring(n / N))
        kinds.append(('band', n - 1))
        rings.append(ring(n / N, butt))
        kinds.append(('butt', n))
    points = [(0, peak - skin, 0)] + [p for r in rings for p in r] + [(0, peak, 0)]
    apex = len(points) - 1
    faces, uvs = [], []
    for i in range(8):  # Soffit: the inner skin, boarded timber under the eaves.
        j = (i + 1) % 8
        faces.append((0, 1 + j, 1 + i))
        uvs.append([church_slate_uv(min(1, abs(points[n][0] + points[n][2]) / 12.25), points[n][1] - 8.0, 'timber')
                    if n else church_slate_uv(0, 1, 'timber') for n in faces[-1]])
    for k, (kind, n) in enumerate(kinds):
        lo, hi = (n / R, (n + 1) / R) if kind == 'band' else ((n + .005) / R, (n + .06) / R)
        a, b = 1 + 8 * k, 9 + 8 * k
        for i in range(8):
            j = (i + 1) % 8
            faces.append((a + i, a + j, b + j, b + i))
            uvs.append([church_slate_uv(u_at(points[m], i), v)
                        for m, v in zip(faces[-1], (lo, lo, hi, hi))])
    last = 1 + 8 * (len(rings) - 1)
    for i in range(8):
        j = (i + 1) % 8
        faces.append((last + i, last + j, apex))
        uvs.append([church_slate_uv(u_at(points[m], i), v)
                    for m, v in zip(faces[-1], ((N - 1) / R, (N - 1) / R, 1))])
    solid(name + ' stepped slate shell', points, faces, 'tile')
    UVS[-len(faces):] = uvs
    for side in (-1, 1):  # Unchanged: the side fascias' outer faces set the width envelope.
        box(name + ' eaves fascia', (0, eave - .085, side * D), (2 * W, .17, .14), 'timber')
        box(name + ' eaves fascia', (side * W, eave - .085, 0), (.14, .17, 2 * D + .13), 'timber')
    # Lead hip rolls: a ridged section seated on both slopes along each hip.
    L = math.hypot(W, D)
    for sx in (-1, 1):
        for sz in (-1, 1):
            px, pz = sz * D / L, -sx * W / L
            offsets = []
            for sgn in (-1, 1):
                ox, oz = px * sgn * .085, pz * sgn * .085
                offsets.append((ox, -max(H * sx * ox / W, H * sz * oz / D) - .035, oz))
            offsets.insert(1, (0, .075, 0))
            ends = [(sx * W, eave, sz * D), (0, peak, 0)]
            solid(name + ' lead hip roll', [(e[0] + o[0], e[1] + o[1], e[2] + o[2]) for e in ends for o in offsets],
                  [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], 'iron')
    church_tower_flashing(W, D, eave, peak)


def church_tower_flashing(W, D, eave, peak):
    """Lead where the nave roof meets the tower: the joint, modelled.

    The tower (x +-2, front face z -2.6) stands wholly in the rear slope, so
    the roof meets its front face level at 10.41 m and its sides along the
    slope. A front apron and two side flashings each turn 20 cm up the wall
    (buried 4 cm in it) and lap 17-20 cm down over the slates, above every
    butt. Each is a straight extrusion, so all of its faces are planar.
    """
    H = peak - eave

    def slope(z):
        return eave + H * (1 - abs(z) / D)

    zf, n = -2.6, 6
    profile = [(zf - .04, slope(zf - .04) - .06), (zf - .04, slope(zf) + .2), (zf + .015, slope(zf) + .2),
               (zf + .015, slope(zf + .015) + .045), (zf + .2, slope(zf + .2) + .04),
               (zf + .2, slope(zf + .2) - .04)]
    ends = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    sides = [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)]
    solid('Tower lead flashing apron', [(x, y, z) for x in (-2.015, 2.015) for z, y in profile], ends + sides, 'iron')
    section = [(-.04, -.06), (-.04, .2), (.015, .2), (.015, .045), (.17, .04), (.17, -.04)]
    for side in (-1, 1):
        solid('Tower lead side flashing', [(side * (2 + dx), slope(z) + dy, z) for z in (-2.62, -6.72)
                                            for dx, dy in section], ends + sides, 'iron')


# Traced side elevation of a nave buttress, foot to cap: (height, projection
# past the 5.0 m wall face, half-width along the wall). A battered plinth whose
# top (.34) clears the nave plinth's (.32), then three stages, each set back
# under a sloped weathering. The cap slopes back into the wall and ends 2 cm
# inside its face. Every projection stays under the 5.62 m eaves fascia, which
# sets the width envelope.
CHURCH_BUTTRESS_PROFILE = [(0, .58, .40), (.34, .58, .40), (.50, .47, .35), (2.25, .47, .35),
                           (2.60, .32, .30), (4.30, .32, .30), (4.62, .18, .26), (5.70, .18, .26),
                           (6.25, -.02, .26)]


def church_lofted_buttress(side, z, wall=5.0, buried=.1):
    """One nave buttress lofted through CHURCH_BUTTRESS_PROFILE as a closed solid.

    Replaces the plinth, shaft and cap boxes, which stacked into a 33 cm flat
    strip. Each station is a rectangle from inside the wall to the projection;
    consecutive rectangles share their x-running and z-running edges' directions,
    so every face is planar however the width steps. Stone faces are laid in
    metres (one coursing scale with the tower); sloped set-offs take the dressed
    cream. Working if the end view shows a plinth and three stages stepping back
    under weatherings, and the side view a buttress narrowing at each set-off.
    """
    prof, P = CHURCH_BUTTRESS_PROFILE, CHURCH_ASHLAR_PERIOD
    points = []
    for y, proj, hw in prof:
        xi, xo = side * (wall - buried), side * (wall + proj)
        points += [(xi, y, z - hw), (xo, y, z - hw), (xo, y, z + hw), (xi, y, z + hw)]
    faces, sloped = [(3, 2, 1, 0)], [False]
    for k in range(len(prof) - 1):
        a, b = 4 * k, 4 * k + 4
        faces += [(a + i, a + (i + 1) % 4, b + (i + 1) % 4, b + i) for i in range(4)]
        sloped += [prof[k][1] != prof[k + 1][1]] * 4
    top = 4 * (len(prof) - 1)
    faces.append((top, top + 1, top + 2, top + 3))
    sloped.append(True)
    solid('Nave lofted stepped buttress', points, faces, 'stone')
    uvs = []
    for face, dressed in zip(faces, sloped):
        pts = [points[n] for n in face]
        spans = [max(p[a] for p in pts) - min(p[a] for p in pts) for a in range(3)]
        flat = spans.index(min(spans))
        ua, va = {0: (2, 1), 1: (0, 2), 2: (0, 1)}[flat]
        u0, v0 = min(p[ua] for p in pts), min(p[va] for p in pts)
        uvs.append([church_slate_uv((p[ua] - u0) / P, (p[va] - v0) / P, 'cream' if dressed else 'stone')
                    for p in pts])
    UVS[-len(faces):] = uvs


# Lancet sections, lofted round the traced glass outline: (offset out from the
# glass edge, projection past the wall face), both in metres. The surround runs
# from the glass edge out to a 16 cm deep splayed reveal, then falls back as a
# chamfer to 3 cm inside the wall; the hood's inner edge sits 1 cm inside that
# chamfer, its drip nose 2 cm past the reveal arris, and its weathered top runs
# back into the wall. The sill's (projection, height) section takes the
# surround's lower band inside it: its sloped top passes 4 cm under the inner
# sill's arris and projects 7 cm past it, so only that arris stands on it.
CHURCH_LANCET_SURROUND = [(0, .02), (.05, .18), (.18, -.03)]
CHURCH_LANCET_HOOD = [(.09, .10), (.17, .20), (.26, -.03)]
CHURCH_LANCET_SILL = [(-.03, -.026), (.25, -.11), (.25, -.20), (-.03, -.20)]


def church_lancet(name, origin, along, out, width, height, mullion=True):
    """One lancet built as a moulded opening, not traced in beams.

    The old window was a glass prism with six 9 cm beams laid on its outline,
    2 cm off the wall: a drawn outline with no reveal. Here the glass outline is
    traced as a true two-centred pointed arch (springing at .36 of the height,
    centres on the springing line), and CHURCH_LANCET_SURROUND is lofted round
    it as one closed solid whose front cap IS the pane. So the glass sits 16 cm
    back in a splayed reveal, the inner sill weathers outward, and the surround's
    chamfered back is buried in the wall. CHURCH_LANCET_HOOD is lofted over the
    arch alone and ends level at the springing; a sloped sill projects below.
    `origin` is the wall-face point under the glass centre (game axes); `along`
    and `out` are unit xz vectors along and out of the wall.
    Working if the clay side view shows each light set back in a deep splayed
    reveal under a projecting hood, standing on a sloped sill, and the probe no
    longer lists the lancets as floating.
    """
    ox, oy, oz = origin
    s, ys, H = width, .36 * height, .64 * height
    c = (H * H - s * s / 4) / s  # Each arc's centre sits c past the window axis.
    r, alpha = c + s / 2, math.atan2(H, c)
    arc = []  # (point, unit offset scaled for mitres) along the left arc, springing to apex.
    for k in range(4):
        phi = math.pi - k * alpha / 3
        arc.append(((c + r * math.cos(phi), ys + r * math.sin(phi)), (math.cos(phi), math.sin(phi))))
    arc[-1] = ((0.0, ys + H), (0.0, 1 / math.sin(alpha)))
    left = [((-s / 2, 0.0), (-1.0, -1.0))] + arc[:-1]
    right = [((-p[0], p[1]), (-m[0], m[1])) for p, m in reversed(left)]
    stations = left + [arc[-1]] + right  # Closed: bottom corners, jambs, arcs, apex.
    hood_stations = stations[1:-1]
    P = CHURCH_ASHLAR_PERIOD

    def world(u, v, d):
        return (ox + along[0] * u + out[0] * d, oy + v, oz + along[1] * u + out[1] * d)

    def rings(path, section):
        return [[world(p[0] + n * m[0], p[1] + n * m[1], d) for p, m in path] for n, d in section]

    def dressed_uvs(points, faces, key):
        uvs = []
        for face in faces:
            pts = [points[i] for i in face]
            spans = [max(p[a] for p in pts) - min(p[a] for p in pts) for a in range(3)]
            flat = spans.index(min(spans))
            ua, va = {0: (2, 1), 1: (0, 2), 2: (0, 1)}[flat]
            u0, v0 = min(p[ua] for p in pts), min(p[va] for p in pts)
            uvs.append([church_slate_uv((p[ua] - u0) / P, (p[va] - v0) / P, key) for p in pts])
        return uvs

    # Surround and pane: one closed loft, pane cap in front, buried cap behind.
    loops = rings(stations, CHURCH_LANCET_SURROUND)
    n, m = len(stations), len(loops)
    points = [p for loop in loops for p in loop]
    faces = [tuple(range(n)), tuple(range(n * m - 1, n * (m - 1) - 1, -1))]
    for j in range(m - 1):
        faces += [(j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i)
                  for i in range(n)]
    solid(name + ' lofted reveal and pane', points, faces, 'cream')
    uvs = dressed_uvs(points, faces, 'cream')
    pane = [(along[0] * (q[0] - ox) + along[1] * (q[2] - oz), q[1] - oy) for q in loops[0]]
    u0, u1 = min(q[0] for q in pane), max(q[0] for q in pane)
    uvs[0] = [church_slate_uv((q[0] - u0) / (u1 - u0), q[1] / (ys + H), 'glass') for q in pane]
    UVS[-len(faces):] = uvs

    # Hood mould over the arch: an open loft, capped level at both springings.
    loops = rings(hood_stations, CHURCH_LANCET_HOOD)
    n, m = len(hood_stations), len(loops)
    points = [p for loop in loops for p in loop]
    faces = [tuple(j * n for j in range(m)), tuple(j * n + n - 1 for j in reversed(range(m)))]
    for j in range(m):
        k = (j + 1) % m
        faces += [(j * n + i, j * n + i + 1, k * n + i + 1, k * n + i) for i in range(n - 1)]
    solid(name + ' lofted hood mould', points, faces, 'cream')
    UVS[-len(faces):] = dressed_uvs(points, faces, 'cream')

    # Sloped sill, wider than the surround, its back buried in the wall.
    half = s / 2 + .24
    points = [world(u, v, d) for u in (-half, half) for d, v in CHURCH_LANCET_SILL]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    solid(name + ' sloped sill', points, faces, 'cream')
    UVS[-len(faces):] = dressed_uvs(points, faces, 'cream')

    if mullion:  # Seated 2.5 mm into the pane, running into the reveal at both ends.
        beam(name + ' lancet mullion', world(0, -.01, .035), world(0, height - .02, .035), .035, 'cream')


def church():
    # Reference: preserved v0.30 VillageArea, nave 10x8x12, rear tower, rose facade.
    shell('V030 stone nave', 10, 12, 8, 'stone')
    church_pavilion_roof()
    quoins('Nave', 10.02, 12.02, 7.8)
    # The tower walls rise in stages that end inside their string courses, so
    # each face keeps the metric coursing; the plinth is the battered one below.
    for y0, y1 in [(.8, 4.62), (4.58, 8.32), (8.28, 10.12), (10.08, 13.05)]:
        church_metric_ashlar('Rear bell tower stage walls', (0, (y0 + y1) / 2, -4.7), (4, y1 - y0, 4.2))
    box('Rear bell tower cornice', (0, 13.05 - .07, -4.7), (4.18, .16, 4.38), 'cream')
    church_rear_elevation()
    # The lowest course was exactly as deep as the 4.2 m tower, so its front and
    # back faces lay in the walls' planes. It now stands 5 cm proud like its sides.
    for y, width, depth in [(8.3, 4.2, 4.3), (10.1, 4.25, 4.25), (13.02, 4.5, 4.5)]:
        box('Tower ashlar stringcourse', (0, y, -4.7), (width, .18, depth), 'cream')
    church_broach_spire()
    beam('Church gilt cross stem', (0, 18.94, -4.7), (0, 20.1, -4.7), .11, 'brass')
    beam('Church gilt cross arms', (-.40, 19.7, -4.7), (.40, 19.7, -4.7), .11, 'brass')
    for side in (-1, 1):
        for z in (-3, 0, 3):
            church_lancet('Stone lancet', (side * 5.0, 2.7, z), (0, 1), (side, 0), 1.4, 3.2)
        for z in (-4.5, -1.5, 1.5, 4.5):
            church_lofted_buttress(side, z)
        for axis in ('front', 'side'):
            start = len(VERTS)
            frame('Belfry louvres', 0, 11.82, -4.7 + side * 2.14, 1.5, 1.78, 0 if side == 1 else math.pi, 'cream', 'ink')
            for y in (11.2, 11.46, 11.72, 11.98, 12.24, 12.5):
                box('Bell louvre blade', (0, y, -4.7 + side * 2.22), (1.32, .075, .14), 'timber')
            if axis == 'side':
                rotate_parts(start, math.pi / 2, (0, 0, -4.7))
    frame('Church oak portal', 0, 1.92, 6.035, 2.0, 3.55, trim='cream', door=True)
    arch('Portal archivolt', 0, 3.64, 6.04, 2.1, 1.1)
    # Colour is contained inside the stone tracery, with no luminous masonry.
    roundel('Rose stone surround', 0, 6.12, 6.05, 1.43, 'cream')
    roundel('Rose dark reveal', 0, 6.12, 6.10, 1.27, 'ink')
    for i in range(12):
        a, b = i * math.tau / 12, (i + 1) * math.tau / 12
        outline = [(0, 6.12)] + [(1.2 * math.cos(t), 6.12 + 1.2 * math.sin(t)) for t in (a, (a+b)/2, b)]
        prism('Rose stained glass petal', outline, 6.16, 6.14, ('glass','amber','rose','green')[i % 4])
        beam('Rose radial tracery', (0, 6.12, 6.19), (1.23 * math.cos(a), 6.12 + 1.23 * math.sin(a), 6.19), .047, 'brass')
    ring_frame('Rose outer tracery', 0, 6.12, 6.21, 1.25, .055, 'brass')
    ring_frame('Rose inner tracery', 0, 6.12, 6.22, .55, .047, 'brass', segments=24)
    roundel('Rose central medallion', 0, 6.12, 6.22, .23, 'amber', segments=20)
    box('Church accessible threshold', (0, .065, 6.36), (2.55, .13, .66), 'stone')


def townhall_corner_quoins(q=CIVIC_QUOIN):
    """Long-and-short quoins traced as one closed toothed solid per corner.

    Rounds 1-3 stacked a box per course with recessed joints between them,
    which read in clay as notched log ends. Here each corner is one closed
    solid traced from its two elevations: on each face the outline runs up
    the corner arris, then steps long/short down the inner edge at every
    course, and the two faces share the arris. Behind them an inner L of the
    same trace sits `proud + bury` deep (5 cm into the wall), with tooth ends,
    bed ledges and an L-shaped cap at the top (in the cornice) and the bottom
    (in the plinth). The faces are continuous: only the tooth steps are
    modelled, 3 cm proud. The bed joints are painted on re-laid metric UVs
    (civic_ashlar_swatch), one row per course on both elevations, so a course
    wraps the corner in one tone. Long arms stay 8 cm clear of the front sash
    sills (x <= 5.37).
    """
    n = q['courses']
    rise = (q['top'] - q['bottom']) / n
    ys = [q['bottom'] + k * rise for k in range(n + 1)]
    X0, Z0 = q['half_w'] + q['proud'], q['half_d'] + q['proud']
    t = q['proud'] + q['bury']
    U = CIVIC_QUOIN_U

    def v_at(y):
        return CIVIC_QUOIN_V * (y - q['bottom']) / (q['top'] - q['bottom'])

    for sx in (-1, 1):
        for sz in (-1, 1):
            points, index, faces, uvs = [], {}, [], []

            def vid(p):
                key = tuple(round(c, 6) for c in p)
                if key not in index:
                    index[key] = len(points)
                    points.append(p)
                return index[key]

            def at(face, s, y, d):
                # s: metres from the corner arris along this elevation; d: depth behind its face.
                if face == 'front':
                    return (sx * (X0 - s), y, sz * (Z0 - d))
                return (sx * (X0 - d), y, sz * (Z0 - s))

            def add(corners, coords):
                faces.append(tuple(vid(c) for c in corners))
                uvs.append(coords)

            for face in ('front', 'side'):
                arms = [q['long'] if (k % 2 == 0) == (face == 'front') else q['short'] for k in range(n)]
                for d, s0 in ((0.0, 0.0), (t, t)):  # The exposed face, then the buried inner face.
                    outline = [(s0, ys[0]), (s0, ys[n])]
                    for k in range(n - 1, -1, -1):
                        outline += [(arms[k], ys[k + 1]), (arms[k], ys[k])]
                    add([at(face, s, y, d) for s, y in outline], [(s / U, v_at(y)) for s, y in outline])
                for k in range(n):  # Tooth end: u runs on round the arris.
                    a, y0, y1 = arms[k], ys[k], ys[k + 1]
                    add([at(face, a, y0, 0), at(face, a, y1, 0), at(face, a, y1, t), at(face, a, y0, t)],
                        [((a + d) / U, v_at(y)) for y, d in ((y0, 0), (y1, 0), (y1, t), (y0, t))])
                for k in range(1, n):  # Bed ledge where the arm changes: painted as the longer course.
                    y, sa, sb = ys[k], arms[k - 1], arms[k]
                    vc = CIVIC_QUOIN_V * ((k - 1 if sa > sb else k) + .5) / n
                    add([at(face, sa, y, 0), at(face, sb, y, 0), at(face, sb, y, t), at(face, sa, y, t)],
                        [(s / U, vc + .1 * d) for s, d in ((sa, 0), (sb, 0), (sb, t), (sa, t))])
            for y, k in ((ys[0], 0), (ys[n], n - 1)):  # L caps, in the plinth and under the cornice.
                a = q['long'] if k % 2 == 0 else q['short']
                b = q['short'] if k % 2 == 0 else q['long']
                ring = [at('front', 0, y, 0), at('front', a, y, 0), at('front', a, y, t),
                        at('front', t, y, t), at('side', b, y, t), at('side', b, y, 0)]
                plan = [(0, 0), (a, 0), (a, t), (t, t), (t, b), (0, b)]
                add(ring, [((u + w) / (2 * U), v_at(y) + .02 * (w - u)) for u, w in plan])
            solid_uv('Civic hall traced long-and-short quoin', points, faces, uvs, CIVIC_ASHLAR_KEY)


def civic_plaster_box(name, c, d, datum, side_v):
    """A plaster block whose faces are laid in metres on civic_plaster_swatch."""
    x, y, z = c
    dx, dy, dz = [v / 2 for v in d]
    points = [(x + i * dx, y + j * dy, z + k * dz) for i, j, k in
              [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
               (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
    P = CIVIC_PLASTER_P
    uvs = []
    for f, face in enumerate(CUBE_FACES):
        if f in (0, 1):
            uvs.append([((px + P / 2) / P, (py - datum) / P) for px, py, pz in (points[n] for n in face)])
        elif f in (3, 5):
            uvs.append([((pz + P / 2) / P, side_v + (py - datum) / P) for px, py, pz in (points[n] for n in face)])
        else:  # Top and bottom, buried under the cornice and in the ground.
            uvs.append([((px + P / 2) / P, .25 + pz / (2 * P)) for px, py, pz in (points[n] for n in face)])
    solid_uv(name, points, CUBE_FACES, uvs, 'plaster')


def civic_plinth(name='V030 civic hall plinth', width=12.13, depth=10.13, height=.32):
    """The hall's plinth in the quoin stone, its blocks laid in metres along each wall."""
    dx, dy, dz = width / 2, height / 2, depth / 2
    points = [(i * dx, dy + j * dy, k * dz) for i, j, k in
              [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
               (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
    U, V = CIVIC_PLINTH_U, CIVIC_PLINTH_V

    def up(py):
        return V + .005 + (.99 - V) * py / height
    uvs = []
    for f, face in enumerate(CUBE_FACES):
        corners = [points[n] for n in face]
        if f in (0, 1):
            uvs.append([((px + U / 2) / U, up(py)) for px, py, pz in corners])
        elif f in (3, 5):
            uvs.append([((pz + U / 2) / U, up(py)) for px, py, pz in corners])
        else:  # The 6.5 cm ledge (and the buried underside): the top of the run.
            uvs.append([((px + U / 2) / U, .985 + .01 * pz / depth) for px, py, pz in corners])
    solid_uv(name, points, CUBE_FACES, uvs, CIVIC_ASHLAR_KEY)


def civic_slate_surface(x, z, width=13.8, depth=12, eave=7.1, peak=10.85):
    """Height of the town hall's hipped roof plane (before any course tilt)."""
    return eave + (peak - eave) * (1 - max(abs(x) / (width / 2), abs(z) / (depth / 2)))


def townhall_hip_roof(name='Civic hipped slate', width=13.8, depth=12, eave=7.1, peak=10.85, rows=16,
                      skin=.075, butt=.03, lap=.01):
    """The town hall's own hipped roof (hip_roof() is shared and untouched).

    Courses are laid as real laps rather than coplanar strips with a beam on
    each line: every course's butt stands `butt` above the roof plane and its
    head runs `lap` (in t) under the next course, so each butt is a modelled
    step. Lead hip rolls replace the slate cappings.

    Round 6 (the strike rule) lofts each course as ONE closed ring round all
    four planes instead of four slabs. Rounds 3-5 built a slab per plane whose
    hip ends were the same four points as the neighbouring slab's, in reverse
    order: 128 non-manifold, mis-wound edges (8 courses x 4 hips x 4 edges).
    The ring's adjacent top faces share the hip edge itself, so the hips are
    joined, not butted, and there is no hidden end face at all. The ring costs
    16 quads a course instead of 40, which pays for twice the courses: a
    modelled 3 cm lap step every ~0.45 m of slope, so course definition comes
    from geometry (its own shadow line) rather than a painted line that mips
    away at 20-30 m. Each modelled course owns one painted row of the
    full-eave strip (civic_slate_strip): course `row` on plane `side` reads row
    row + 4 * side (mod 16), u = metres along the plane, no mirror.
    """
    def ring(t, dy=0.0):
        w, d = width * (1 - t) / 2, depth * (1 - t) / 2
        y = eave + (peak - eave) * t + dy
        return [(-w, y, -d), (w, y, -d), (w, y, d), (-w, y, d)]

    per = CIVIC_SLATE_COURSES / CIVIC_SLATE_ROWS  # Strip height of one modelled course.
    strip = 1.94 / .94  # solid_uv's one-slot span, stretched over the two-slot strip.
    for row in range(rows):
        t0, t1 = row / rows, min((row + 1) / rows + lap, .995)
        top = ring(t0, butt) + ring(t1)  # Lower ring 0-3, upper ring 4-7.
        points = top + [(x, y - skin, z) for x, y, z in top]  # Underside: +8.
        faces, face_uvs = [], []
        for side in range(4):
            nxt = (side + 1) % 4
            along = 0 if side % 2 == 0 else 2
            b0 = ((CIVIC_SLATE_COURSES * row + 4 * side) % CIVIC_SLATE_ROWS) * per / CIVIC_SLATE_COURSES
            b1 = b0 + (t1 - t0) * rows * per
            ls, ln, us, un = side, nxt, 4 + side, 4 + nxt
            for quad, band in (((ls, ln, un, us), True),  # Top.
                               ((us + 8, un + 8, ln + 8, ls + 8), False),  # Underside.
                               ((ls, ls + 8, ln + 8, ln), False),  # Butt.
                               ((un, un + 8, us + 8, us), False)):  # Head, under the next course.
                faces.append(quad)
                face_uvs.append([((points[n][along] + CIVIC_SLATE_SPAN / 2) / CIVIC_SLATE_SPAN * strip,
                                  ((b0 if n % 8 < 4 else b1) if band else b0 + .004)) for n in quad])
        solid_uv(name + ' lapped course ring', points, faces, face_uvs, CIVIC_SLATE_KEY)
    for side in (-1, 1):
        box(name + ' eaves fascia', (0, eave - .085, side * depth / 2), (width, .17, .14), 'timber')
        box(name + ' eaves fascia', (side * width / 2, eave - .085, 0), (.14, .17, depth + .13), 'timber')
        for end in (-1, 1):
            # Seated on the raised butts (bottom 1 cm into the course tops).
            beam(name + ' lead hip roll', (side * width / 2, eave + .06, end * depth / 2), (0, peak + .06, 0), .08, 'iron')


def townhall_tower_flashing(half=2.0, butt=.03):
    """Lead collar where the hipped roof meets the clock tower: the joint, modelled.

    One closed sweep round the tower's four faces. Its section turns 20 cm up
    the wall (buried 4 cm in it) and laps 20 cm down over the slates, its
    underside inside the course slabs. Heights follow the real roof surface at
    every station; stations sit on the hip kinks, so each panel is planar.
    """
    kinks = (half * 12 / 13.8, (half + .2) * 12 / 13.8)
    loop = [(-half, half, -1, 1), (half, half, 1, 1)]
    loop += [(half, z, 1, 0) for z in (kinks[1], kinks[0], -kinks[0], -kinks[1])]
    loop += [(half, -half, 1, -1), (-half, -half, -1, -1)]
    loop += [(-half, z, -1, 0) for z in (-kinks[1], -kinks[0], kinks[0], kinks[1])]
    section = [(-.04, False, -.06), (-.04, False, .2), (.015, False, .2),
               (.015, True, .045 + butt), (.2, True, .035 + butt), (.2, True, -.01)]
    points = []
    for x, z, nx, nz in loop:
        wall = civic_slate_surface(x, z)
        for d, on_roof, dy in section:
            px, pz = x + nx * d, z + nz * d
            points.append((px, (civic_slate_surface(px, pz) if on_roof else wall) + dy, pz))
    n, m = len(loop), len(section)
    faces = [(i * m + j, i * m + (j + 1) % m, (i + 1) % n * m + (j + 1) % m, (i + 1) % n * m + j)
             for i in range(n) for j in range(m)]
    solid('Clock tower lead collar', points, faces, 'iron')


def townhall():
    # The broad cream civic hall and centred clock tower are the v0.30 anchors.
    # The wall block is the hall's own (shell() is shared): metric plaster UVs,
    # a plinth in the quoin stone, the same cornice.
    civic_plaster_box('V030 civic hall planar walls', (0, 3.5, 0), (12, 7, 10), 0, .5)
    civic_plinth()
    box('V030 civic hall cornice', (0, 6.93, 0), (12.18, .16, 10.18), 'cream')
    townhall_corner_quoins()
    townhall_hip_roof()
    # Boxed eave soffit seats the hipped roof on the wall head. The lowest
    # courses clear the cornice by ~0.45 m at its edge, so a plate bridges the
    # cornice (top 7.01) and runs 2 cm into both fascias' inner faces. Its
    # 6.95 / 7.05 faces share no plane with cornice, fascia or lapped edges.
    box('Civic boxed eave soffit', (0, 7.0, 0), (13.70, .10, 11.90), 'cream')
    for side in (-1, 1):
        for x in (-4.3, 4.3):
            frame('Tall civic sash', x, 3.35, side * 5.04, 1.65, 3.08, 0 if side == 1 else math.pi)
            box('Window cornice', (x, 5.12, side * 5.1), (2.1, .16, .32), 'cream')
        for z in (-3.2, 0, 3.2):
            frame('Civic side sash', side * 6.035, 3.35, z, 1.65, 3.08, side * math.pi / 2)
        for x in (-3.82, 3.82):
            # Ends at x 6.0, 3 cm inside the quoins' outer face (6.03), which it crosses.
            box('Civic stringcourse clear of door', (x / 3.82 * 3.795, 1.15, side * 5.055), (4.41, .14, .16), 'cream')
        # Grounded solid treads. Rear entrance balances the bounds and affords egress.
        for i in range(5):
            top = (i + 1) * .16
            box('Civic ascending stair', (0, top / 2, side * (6.92 - i * .36)), (5.7 - i * .15, top, .77), 'stone')
        frame('Civic oak double door', 0, 2.55, side * 5.04, 2.6, 3.5, 0 if side == 1 else math.pi, 'cream', door=True)
        for x in (-2.6, 2.6):
            lathe('Civic turned column', x, side * 5.62, [(.40,.80),(.40,.98),(.30,1.1),(.25,4.05),(.36,4.17),(.40,4.27)], 'cream', 20)
        box('Portico entablature', (0, 4.40, side * 5.60), (5.92, .32, .98), 'cream')
        # The tympanum stands on a 4 cm bed let 2 cm into the entablature top
        # (4.56), so the pediment is seated; the raking line is unchanged.
        prism('Portico pediment', [(-3,4.54),(3,4.54),(3,4.58),(0,5.47),(-3,4.58)], side * 6.10, side * 5.3, 'cream')
        for x in (-1,1):
            beam('Pediment moulding', (x*3,4.62,side*6.13), (0,5.5,side*6.13), .095, 'stone')
    civic_plaster_box('Civic clock tower', (0, 11.13, 0), (4, 5.74, 4), 7.5, 0)
    townhall_tower_flashing()
    for x in (-1.95,1.95):
        for z in (-1.95,1.95):
            # Pilasters run down through the lead collar and bear on the roof
            # (foot 9.45, ~10 cm under the slates at their outer corner).
            box('Tower pilaster', (x,11.6725,z), (.24,4.445,.24), 'cream')
    for y in (10.15,13.85,14.08):
        box('Tower moulded cornice', (0,y,0), (4.5,.17,4.5), 'cream')
    circle = lambda r: [(r * math.cos(i * math.tau / 32), 12.08 + r * math.sin(i * math.tau / 32)) for i in range(32)]
    for side in (-1,1):
        for yaw in (0,math.pi/2):
            start=len(VERTS)
            # One seated dial case: the bezel drum is let 2 cm into the tower
            # face, the enamel 2 cm into the bezel, the indices 7.5 mm into the
            # enamel. The enamel face stays at 2.145, behind the runtime hands.
            prism('Clock gilt bezel', circle(1.13), side*2.095, side*1.98, 'brass')
            prism('Clock enamel dial', circle(1.015), side*2.145, side*2.075, 'cream')
            for i in range(12):
                a=i*math.pi/6
                beam('Clock hour index',(.82*math.sin(a),12.08+.82*math.cos(a),side*2.16),(.93*math.sin(a),12.08+.93*math.cos(a),side*2.16),.045,'ink')
            # Game-time hands are runtime geometry; the static dial keeps its indices.
            if yaw:rotate_parts(start,yaw)
    # The cupola's bed ring (r 2.0 at 14.12) is let 4.5 cm into the top cornice
    # (top 14.165), so the bell is seated rather than hovering 1.5 cm above it.
    # Apex and finial close on one vertex: no zero-area pole triangles.
    # The bell reads the tile slot, painted plain slate for the town hall (the
    # slate slot carries half of the roof strip); its look is unchanged.
    lathe('Civic curving ogee cupola',0,0,[(2.0,14.12),(2.7,14.18),(2.72,14.27),(2.35,14.42),(2.12,14.7),(1.94,15.03),(1.65,15.36),(1.25,15.69),(.81,16.07),(.48,16.4),(.37,16.72),(.51,16.79),(.51,17.15),(.58,17.22),(.32,17.5),(.10,17.78),(0,17.89)],'tile',32,close_poles=True)
    lathe('Civic gilt finial',0,0,[(.07,17.76),(.16,17.97),(.07,18.13),(0,18.32)],'brass',16,close_poles=True)


# Pub thatch (game metres). One closed solid on superellipse rings
# |x/hx|^n + |z/hz|^n = 1 inset s from the 9.24 x 8.54 m eave, the exponent
# easing from 6 at the eave (corners carried well past the wall corners) to 2.5
# at the crown. A superellipse has continuous curvature, so no straight-to-arc
# junction exists to crease the shading. The section runs from a straw soffit
# buried 4 cm in the wall head, round a 25 cm rolled eave nose, up a domed coat
# whose foot is tangent to the nose and whose crown arrives level (zero slope,
# so the crown has no crease), with no ridge band or plate.
# The coat is a heightfield over a plan grid split on four straight hips
# (pub_thatch_mesh); the nose and soffit are a loft on the coat foot ring.
# Straw is the cottage's periodic straw painting, laid in metres per hip
# island: u is the plan coordinate along that island's eave, so the straw runs
# straight down the fall and never converges on the crown (the old eave-arc u
# carried 22 windows up to a 1.8 m crown ring: the radial pinch), and the hips
# read as hips. v runs down the section from the crown (the swatch's butts face
# down-slope). Faces are cut on window lines.
PUB_HX, PUB_HZ = 4.62, 4.27  # The old fascia faces: the envelope fit stays exactly 1.
PUB_N_EAVE, PUB_N_CROWN = 6.0, 2.5  # Superellipse exponent at the eave and at the crown.
PUB_CROWN_S = PUB_HZ - .05  # Crown ring: 0.8 x 0.1 m, level.
PUB_STRIPS = (4, 2)  # Two-slot straw strips: tile+thatch and brick+slate, unused by the pub.
PUB_BUTT_SLOT = 9  # Cut end grain (eave nose) on the green slot, unused by the pub.
PUB_WU, PUB_WV = COTTAGE_WU, COTTAGE_WV  # The shared straw window; the end grain uses PUB_WU / 2 square.
PUB_GRID = .75  # Plan grid of the coat heightfield: whole end-grain windows, half straw windows.
PUB_FINE_BAND = 2.0  # Outer band (metres in from the foot ring) where the grid is halved, for the eave corners.
PUB_HIP_C = .375  # The hips are the plan lines |x| - |z| = PUB_HIP_C, eave corners to crown ends.
PUB_F_TURN = 8.0  # Most degrees the coat foot ring turns between two of its vertices.
PUB_SOFFIT = ((1.45, 4.955), (.25, 5.0))  # Straw underside: buried inner edge, then the nose underside.
PUB_NOSE = (.25, .25, 5.25)  # Rolled eave nose r, centre inset, centre height: underside at 5.00, clear of the sign lamps (top 4.75).
PUB_COAT_FOOT = math.radians(50)  # Nose angle where the domed coat takes over.
PUB_SMOOTH_PARTS = {'Pub rounded thatch coat': 45, 'Pub thatch chimney fillet': 50}


def pub_ring(s):
    # Eased (quadratic) so the corners round off early.
    t = min(max(s / PUB_CROWN_S, 0.0), 1.0)
    return PUB_HX - s, PUB_HZ - s, PUB_N_CROWN + (PUB_N_EAVE - PUB_N_CROWN) * (1 - t) ** 2


def pub_ring_point(s, th):
    """Plan (x, z) on the inset-s superellipse at generalised angle th."""
    hx, hz, n = pub_ring(s)
    c, sn, e = math.cos(th), math.sin(th), 2 / n
    return hx * math.copysign(abs(c) ** e, c), hz * math.copysign(abs(sn) ** e, sn)


def pub_ring_theta(s, x, z):
    """Generalised angle of plan (x, z) on ring s, in [0, 2 pi)."""
    hx, hz, n = pub_ring(s)
    return math.atan2(math.copysign(abs(z / hz) ** (n / 2), z), math.copysign(abs(x / hx) ** (n / 2), x)) % (2 * math.pi)


def pub_inset_of(x, z):
    """Inset s of the ring through plan (x, z), clamped to [0, crown]; rings shrink as s grows."""
    def f(s):
        hx, hz, n = pub_ring(s)
        return abs(x / hx) ** n + abs(z / hz) ** n - 1
    lo, hi = 0.0, PUB_CROWN_S
    if f(hi) <= 0:
        return hi
    if f(lo) >= 0:
        return lo
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return (lo + hi) / 2


def pub_island_across(q, x, z):
    """Island q's across coordinate (0 +X, 1 +Z, 2 -X, 3 -Z); straw u = -across."""
    return (z, -x, -z, x)[q]


def pub_island_of(x, z):
    """Hip island of a plan point (the hips are |x| - |z| = PUB_HIP_C; the ridge is z = 0)."""
    if abs(x) - abs(z) > PUB_HIP_C:
        return 0 if x > 0 else 2
    return 1 if z > 0 else 3


def pub_coat():
    """(s_e, y_e, s_c, y_c, m0) of the domed coat, a cubic Hermite in u = (s - s_e) / (s_c - s_e):
    its foot slope m0 equals the nose tangent (cot of the foot angle), so the roll runs into the
    coat without a shoulder, and its crown slope is zero, so the crown closes without a crease."""
    r, cs, cy = PUB_NOSE
    s_e, y_e = cs - r * math.cos(PUB_COAT_FOOT), cy + r * math.sin(PUB_COAT_FOOT)
    s_c, y_c = PUB_CROWN_S, 7.88
    return s_e, y_e, s_c, y_c, (s_c - s_e) / (y_c - y_e) / math.tan(PUB_COAT_FOOT)


def pub_coat_y(s, slope=False):
    """Coat height at inset s (level at and inside the crown ring), or dy/ds with slope=True."""
    s_e, y_e, s_c, y_c, m0 = pub_coat()
    u = min(max((s - s_e) / (s_c - s_e), 0.0), 1.0)
    if slope:
        return (y_c - y_e) / (s_c - s_e) * ((6 * u - 6 * u * u) + m0 * (3 * u * u - 4 * u + 1))
    return y_e + (y_c - y_e) * ((3 * u * u - 2 * u ** 3) + m0 * (u ** 3 - 2 * u * u + u))


def pub_coat_table():
    """Fine (inset, height, metres down from the crown) table of the coat, foot to crown."""
    s_e, _, s_c, _, _ = pub_coat()
    ss = np.linspace(s_e, s_c, 801)
    ys = np.array([pub_coat_y(s) for s in ss])
    seg = np.hypot(np.diff(ss), np.diff(ys))
    return ss, ys, np.concatenate([np.cumsum(seg[::-1])[::-1], [0.0]])


def pub_thatch_section():
    """(inset, height, region of the face above it), from the buried soffit to the coat foot."""
    sec = [PUB_SOFFIT[0] + ('strip',)]  # Straw underside, read as thatch rather than a dark end-grain gap.
    r, cs, cy = PUB_NOSE
    for deg in (-90, -60, -30, 0, 25):  # 0 degrees is the outermost point: the envelope extremes.
        a = math.radians(deg)
        sec.append((cs - r * math.cos(a), cy + r * math.sin(a), 'butt'))
    s_e, y_e = pub_coat()[:2]
    sec.append((s_e, y_e, None))
    return sec


def pub_thatch_normal(s, x, y, z):
    """Analytic outward normal of the thatch at a point on ring s, written in place of the
    angle-weighted face normals so the cut cells at the hips and the foot print nothing on the
    smooth dome. N = g * ty + up * (alpha * ts): g the ring's outward plan normal, (ts, ty) the
    section's tangent in its direction of travel (soffit, nose, coat, crown) and alpha how fast
    the ring moves in along g per unit inset."""
    s_e, y_e, s_c = pub_coat()[:3]
    if s >= s_c - 1e-9:
        return 0.0, 1.0, 0.0  # Level at and inside the crown ring.
    hx, hz, n = pub_ring(s)
    gx = n * abs(x / hx) ** (n - 1) * math.copysign(1, x) / hx
    gz = n * abs(z / hz) ** (n - 1) * math.copysign(1, z) / hz
    gl = math.hypot(gx, gz)
    gx, gz = gx / gl, gz / gl
    th = pub_ring_theta(s, x, z)
    e = 1e-4
    (x0, z0), (x1, z1) = pub_ring_point(max(s - e, 0.0), th), pub_ring_point(s + e, th)
    alpha = -(gx * (x1 - x0) + gz * (z1 - z0)) / (s + e - max(s - e, 0.0))
    r, cs, cy = PUB_NOSE
    if y < PUB_SOFFIT[1][1] - 1e-9:
        (sa, ya), (sb, yb) = PUB_SOFFIT
        ts, ty = sb - sa, yb - ya
    elif s < s_e - 1e-9 or y < y_e - 1e-9:
        a = math.atan2(y - cy, cs - s)
        ts, ty = math.sin(a), math.cos(a)
    else:
        ts, ty = 1.0, pub_coat_y(s, slope=True)
    nx, ny, nz = gx * ty, alpha * ts, gz * ty
    nl = math.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / nl, ny / nl, nz / nl


def pub_thatch_mesh(rings):
    """The thatch as two conforming parts. The domed coat is a heightfield over a plan grid
    (PUB_GRID, plus every straw window line), clipped by the coat foot ring and split on four
    straight hips, so its faces are regular grid quads and cut quads: no fans, no slivers. Each
    hip island lays its straw straight down its fall: u is the plan coordinate along its eave
    and v the section distance from the crown at the matching inset on the axis, so window
    lines are grid lines and the courses nearly meet across each hip. The rolled nose and the
    soffit below the foot ring are a loft on the foot ring's own vertices.
    Returns points, faces, uvs (per face corner, in atlas space) and each point's inset."""
    s_e, y_e, s_c, y_c, _ = pub_coat()
    ss, ys, dd = pub_coat_table()
    hxf, hzf, nf = pub_ring(s_e)

    def down_axis(s):  # Metres down from the crown at inset s, on the coat (clamped to it).
        return float(np.interp(min(max(s, s_e), s_c), ss, dd))

    def v_of(q, x, z):
        return down_axis((PUB_HX - abs(x)) if q % 2 == 0 else (PUB_HZ - abs(z)))

    def u_of(q, x, z):
        return -pub_island_across(q, x, z)

    def window_lines(h, extent):
        """Plan lines on one axis: the grid, straw window lines and the v window lines of the
        islands that run along this axis (inset h - |c| on the axis section)."""
        need = set()
        k = 0
        while k * PUB_GRID < extent:
            need.update((k * PUB_GRID, -k * PUB_GRID))
            k += 1
        for m in range(1, int(dd[0] / PUB_WV) + 1):
            s = float(np.interp(m * PUB_WV, dd[::-1], ss[::-1]))
            if h - s < extent:
                need.update((h - s, s - h))
        lines = set(round(c, 9) for c in need if abs(c) < extent)
        k = 0
        while (k + .5) * PUB_GRID < extent:
            for c in ((k + .5) * PUB_GRID, -(k + .5) * PUB_GRID):
                if extent - abs(c) < PUB_FINE_BAND and min(abs(c - d) for d in lines) > .06:
                    lines.add(c)
            k += 1
        return [-extent - .05] + sorted(lines) + [extent + .05]  # Outer lines bound the foot ring.

    xs = window_lines(PUB_HX, hxf)
    zs = window_lines(PUB_HZ, hzf)

    points, index = [], {}

    def vertex(key, x, z, s=None, y=None, v=None):
        if key not in index:
            if s is None:
                s = pub_inset_of(x, z)
                y = pub_coat_y(s)
            index[key] = len(points)
            points.append((x, y, z, s, v))
        return index[key]

    def inside(x, z):
        return abs(x / hxf) ** nf + abs(z / hzf) ** nf < 1

    def foot_z(x):
        return hzf * max(0.0, 1 - abs(x / hxf) ** nf) ** (1 / nf)

    def foot_x(z):
        return hxf * max(0.0, 1 - abs(z / hzf) ** nf) ** (1 / nf)

    # The coat foot ring: every grid line crossing, the four hip ends, and extra points where it turns.
    foot = {}
    for i, x in enumerate(xs):
        if abs(x) < hxf:
            for sz in (1, -1):
                foot[('Fx', i, sz)] = (x, sz * foot_z(x))
    for j, z in enumerate(zs):
        if abs(z) < hzf:
            for sx in (1, -1):
                foot[('Fz', j, sx)] = (sx * foot_x(z), z)
    for sx in (1, -1):
        for sz in (1, -1):
            lo, hi = 0.0, math.pi / 2
            for _ in range(60):
                mid = (lo + hi) / 2
                px, pz = pub_ring_point(s_e, mid)
                if px - pz > PUB_HIP_C:
                    lo = mid
                else:
                    hi = mid
            px, pz = pub_ring_point(s_e, (lo + hi) / 2)
            foot[('FH', sx, sz)] = (sx * px, sz * pz)
    order = sorted(foot, key=lambda key: pub_ring_theta(s_e, *foot[key]))
    extra = {}
    for a, b in zip(order, order[1:] + order[:1]):
        ta, tb = pub_ring_theta(s_e, *foot[a]), pub_ring_theta(s_e, *foot[b])
        tb += 2 * math.pi if tb < ta else 0
        pa, pb = foot[a], foot[b]
        # Turn between the chords either side, judged on the ring's own heading.
        e = 1e-4
        ha = pub_ring_point(s_e, ta + e)
        hb = pub_ring_point(s_e, tb + e)
        h0 = math.atan2(ha[1] - pa[1], ha[0] - pa[0])
        h1 = math.atan2(hb[1] - pb[1], hb[0] - pb[0])
        turn = abs((h1 - h0 + math.pi) % (2 * math.pi) - math.pi)
        m = math.ceil(math.degrees(turn) / PUB_F_TURN)
        for r in range(1, m):
            extra[('Fe', a, r)] = pub_ring_point(s_e, ta + (tb - ta) * r / m)
    foot.update(extra)
    order = sorted(foot, key=lambda key: pub_ring_theta(s_e, *foot[key]))
    for key in order:
        x, z = foot[key]
        vertex(key, x, z, s_e, y_e, None)

    faces, uvs, regions = [], [], []

    def emit(cell, q, strip, row=None):
        """Triangulate one convex cell (vertex indices in order) on island q and map it."""
        if len(set(cell)) < 3:
            return
        if strip == 'coat':
            us = [u_of(q, points[k][0], points[k][2]) for k in cell]
            vs = [v_of(q, points[k][0], points[k][2]) for k in cell]
            wu = PUB_WU
        else:
            us, vs = [u_of(q, *row[k]) for k in cell], [points[k][4] for k in cell]
            wu = PUB_WU if strip == 'strip' else PUB_WU / 2
        col = math.floor(sum(us) / len(us) / wu)
        rv = math.floor(sum(vs) / len(vs) / PUB_WV)
        if strip == 'butt':
            slot, span = PUB_BUTT_SLOT, 1
        else:
            slot, span = PUB_STRIPS[rv % 2], 2
        fu = [u / wu - col for u in us]
        fv = [v / PUB_WV - rv for v in vs]
        if min(fu + fv) < -1e-6 or max(fu + fv) > 1 + 1e-6:
            raise RuntimeError('Pub thatch face straddles a straw window')
        # Fan from the corner whose thinnest triangle is fattest; a quad prefers the diagonal that
        # runs parallel to its quadrant's hips, so the grid folds the same way across each face.
        m = len(cell)
        pts = [np.array(points[k][:3]) for k in cell]
        area = lambda a, b, c: np.linalg.norm(np.cross(pts[b] - pts[a], pts[c] - pts[a]))
        cx, cz = sum(p[0] for p in pts) / m, sum(p[2] for p in pts) / m

        def score(r):
            fat = min(area(r, (r + t) % m, (r + t + 1) % m) for t in range(1, m - 1))
            if m == 4:
                d = pts[(r + 2) % 4] - pts[r]
                fat *= 1.25 if d[0] * d[2] * cx * cz > 0 else 1.0
            return fat
        apex = max(range(m), key=score)
        for t in range(1, m - 1):
            tri = (apex, (apex + t) % m, (apex + t + 1) % m)
            faces.append(tuple(cell[i] for i in tri))
            uvs.append([cottage_slot_uv(slot, span, fu[i], fv[i]) for i in tri])

    def ordered(keys_pts):
        cx = sum(p[0] for _, p in keys_pts) / len(keys_pts)
        cz = sum(p[1] for _, p in keys_pts) / len(keys_pts)
        return sorted(keys_pts, key=lambda kp: math.atan2(kp[1][1] - cz, kp[1][0] - cx))

    # Coat cells.
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[j], zs[j + 1]
            cand = []
            for (a, xa), (b, zb) in (((i, x0), (j, z0)), ((i + 1, x1), (j, z0)), ((i + 1, x1), (j + 1, z1)), ((i, x0), (j + 1, z1))):
                if inside(xa, zb):
                    cand.append((('g', a, b), (xa, zb)))
            for key, (fx, fz) in foot.items():
                if x0 - 1e-9 <= fx <= x1 + 1e-9 and z0 - 1e-9 <= fz <= z1 + 1e-9:
                    cand.append((key, (fx, fz)))
            if len(cand) < 3:
                continue
            poly = ordered(cand)
            sx, sz = (1 if x0 + x1 > 0 else -1), (1 if z0 + z1 > 0 else -1)
            f = [abs(p[0]) - abs(p[1]) - PUB_HIP_C for _, p in poly]
            parts = {0: [], 1: []}  # 0: the X island side, 1: the Z island side.
            for r in range(len(poly)):
                (ka, pa), fa = poly[r], f[r]
                if fa >= -1e-9:
                    parts[0].append((ka, pa))
                if fa <= 1e-9:
                    parts[1].append((ka, pa))
                (kb, pb), fb = poly[(r + 1) % len(poly)], f[(r + 1) % len(poly)]
                if (fa > 1e-9 and fb < -1e-9) or (fa < -1e-9 and fb > 1e-9):
                    if abs(pa[0] - pb[0]) < 1e-9:  # Along an x line: |z| = |x| - c.
                        line = ('x', i if abs(pa[0] - x0) < 1e-9 else i + 1)
                        cp = (pa[0], sz * (abs(pa[0]) - PUB_HIP_C))
                    elif abs(pa[1] - pb[1]) < 1e-9:  # Along a z line: |x| = |z| + c.
                        line = ('z', j if abs(pa[1] - z0) < 1e-9 else j + 1)
                        cp = (sx * (abs(pa[1]) + PUB_HIP_C), pa[1])
                    else:
                        raise RuntimeError('Pub hip crosses the coat foot away from its end')
                    key = ('H', sx, sz if cp[1] else 0) + line  # Both sides of the ridge share its hip end.
                    parts[0].append((key, cp))
                    parts[1].append((key, cp))
            for side, part in parts.items():
                if len(part) < 3:
                    continue
                part = ordered(part)
                cell = [vertex(k, *p) for k, p in part]
                cx = sum(p[0] for _, p in part) / len(part)
                cz = sum(p[1] for _, p in part) / len(part)
                q = (0 if sx > 0 else 2) if side == 0 else (1 if sz > 0 else 3)
                if pub_island_of(cx, cz) != q:
                    raise RuntimeError('Pub thatch cell on the wrong hip island')
                emit(cell, q, 'coat')

    # Nose and soffit: a loft (rings run soffit -> foot) on the foot ring's window, hip and turn
    # vertices; the band under the foot ring gathers the foot's other vertices (the coat's own
    # v-window crossings) onto those columns, so the loft carries no column the nose does not need.
    foot_idx = [index[key] for key in order]
    plan = {k: foot[key] for k, key in zip(foot_idx, order)}  # u of every column vertex, read on the foot.
    cols = [a for a, key in enumerate(order) if key[0] in ('FH', 'Fe')
            or (key[0] == 'Fx' and abs(xs[key[1]] / PUB_GRID - round(xs[key[1]] / PUB_GRID)) < 1e-9)
            or (key[0] == 'Fz' and abs(zs[key[1]] / PUB_GRID - round(zs[key[1]] / PUB_GRID)) < 1e-9)]
    for k in foot_idx:
        points[k] = points[k][:4] + (rings[-1][3],)
    ring_idx = []
    for j, (s, y, region, v) in enumerate(rings[:-1]):
        row = []
        for a in cols:
            x, z = pub_ring_point(s, pub_ring_theta(s_e, *foot[order[a]]))
            k = vertex(('N', j, a), x, z, s, y, v)
            plan[k] = foot[order[a]]
            row.append(k)
        ring_idx.append(row)
    n, last = len(cols), len(rings) - 2
    for j in range(len(rings) - 1):
        region = rings[j][2]
        for c in range(n):
            a, b = cols[c], cols[(c + 1) % n]
            top = [foot_idx[t % len(order)] for t in range(a, b + (len(order) if b <= a else 0) + 1)]
            cell = [ring_idx[j][c], ring_idx[j][(c + 1) % n]]
            cell += top[::-1] if j == last else [ring_idx[j + 1][(c + 1) % n], ring_idx[j + 1][c]]
            pa, pb = foot[order[a]], foot[order[b]]
            emit(cell, pub_island_of((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2), region, plan)
    # The soffit's inner ring lies inside the wall head: close it level.
    ring = ring_idx[0][::-1]
    faces.append(tuple(ring))
    uvs.append([cottage_slot_uv(PUB_BUTT_SLOT, 1, .5 + points[k][0] / 7, .5 + points[k][2] / 7) for k in ring])
    return [p[:3] for p in points], faces, uvs, [p[3] for p in points]


def pub_thatch_roof():
    sec = pub_thatch_section()
    down = [pub_coat_table()[2][0]]  # Metres down from the crown: the coat's foot, then down the nose.
    for p, q in zip(sec[:0:-1], sec[-2::-1]):
        down.append(down[-1] + math.dist(p[:2], q[:2]))
    down = down[::-1]
    rings = []
    for j in range(len(sec) - 1):
        (s0, y0, region), (s1, y1, _), v0, v1 = sec[j], sec[j + 1], down[j], down[j + 1]
        rings.append((s0, y0, region, v0))
        for m in range(math.floor(v0 / PUB_WV), math.floor(v1 / PUB_WV), -1):
            c = m * PUB_WV
            if v1 + 1e-3 < c < v0 - 1e-3:
                t = (v0 - c) / (v0 - v1)
                rings.append((s0 + t * (s1 - s0), y0 + t * (y1 - y0), region, c))
    rings.append((sec[-1][0], sec[-1][1], None, down[-1]))
    points, faces, uvs, insets = pub_thatch_mesh(rings)
    v0, f0 = len(VERTS), len(FACES)
    solid('Pub rounded thatch coat', points, faces, 'thatch')
    UVS[-len(faces):] = uvs
    # Written through the corner-normal hook the boat's lines plan uses (cleared per asset).
    normals = [pub_thatch_normal(s, *p) for s, p in zip(insets, points)]
    for i, face in enumerate(faces):
        BOAT_CORNER_NORMALS[f0 + i] = {v0 + k: normals[k] for k in face}
    return points, faces


# Pub chimney (game metres). The stack meets the thatch through modelled joints,
# not stacked boxes: the thatch itself is dressed up to the stack, a straw
# fillet swept as ONE closed concave section round it (pub_chimney_fillet), its
# heights read off the built thatch mesh (pub_roof_y) so its outer edge lies
# tangent to the dome on every side and it reads as the same straw as the roof
# (the dark lead apron that stood there read as a slab laid on the thatch,
# three judged rounds running), and a dressed stone capping
# lathed as ONE closed chamfered-square ring (outer drip, weathered top, open
# flue) in place of the four cap boxes and four corner wedges whose shared
# edges were the pub's eight non-manifold edges. The cap's
# faces are mapped into one mortar-free block of the stone swatch, so it reads
# as dressed stone, not squashed coursing.
PUB_STACK = (3.0, 0.0, .37)  # Stack centre x, z and half-width (the shaft box, 0.74 m square).
PUB_DRESSED_PATCH = ((60 / 256 - .03) / .94, (84 / 256 - .03) / .94, (62 / 256 - .03) / .94, (78 / 256 - .03) / .94)


def pub_roof_y(roof, queries):
    """Top of the built thatch mesh straight above each plan point (x, z): fan-triangulated faces, max hit."""
    points, faces = roof
    pts = np.array(points)
    tris = np.array([(f[0], f[k], f[k + 1]) for f in faces for k in range(1, len(f) - 1)])
    a, b, c = pts[tris[:, 0]], pts[tris[:, 1]], pts[tris[:, 2]]
    out = []
    for qx, qz in queries:
        v0x, v0z = b[:, 0] - a[:, 0], b[:, 2] - a[:, 2]
        v1x, v1z = c[:, 0] - a[:, 0], c[:, 2] - a[:, 2]
        v2x, v2z = qx - a[:, 0], qz - a[:, 2]
        den = v0x * v1z - v1x * v0z
        ok = np.abs(den) > 1e-12
        den = np.where(ok, den, 1)
        u = (v2x * v1z - v1x * v2z) / den
        v = (v0x * v2z - v2x * v0z) / den
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9)
        if not hit.any():
            raise RuntimeError('Pub chimney sample misses the thatch: ' + str((qx, qz)))
        y = a[:, 1] + u * (b[:, 1] - a[:, 1]) + v * (c[:, 1] - a[:, 1])
        out.append(float(y[hit].max()))
    return out


def pub_dressed_stone(name, points, faces):
    """solid() on the stone key, each face projected into one mortar-free block of the swatch."""
    a0, a1, b0, b1 = PUB_DRESSED_PATCH
    uvs = []
    for face in faces:
        vs = [points[n] for n in face]
        spans = [max(v[k] for v in vs) - min(v[k] for v in vs) for k in range(3)]
        axes = sorted(range(3), key=lambda k: spans[k], reverse=True)[:2]
        if 1 in axes:
            axes = [k for k in axes if k != 1] + [1]
        lows = [min(v[k] for v in vs) for k in axes]
        uvs.append([(a0 + (a1 - a0) * (v[axes[0]] - lows[0]) / max(spans[axes[0]], 1e-8),
                     b0 + (b1 - b0) * (v[axes[1]] - lows[1]) / max(spans[axes[1]], 1e-8)) for v in vs])
    solid_uv(name, points, faces, uvs, 'stone')


def pub_square_ring(r, c):
    """Chamfered square of half-size r (corners cut by c), eight plan offsets in loop order."""
    return [(r, -r + c), (r, r - c), (r - c, r), (-r + c, r), (-r, r - c), (-r, -r + c), (-r + c, -r), (r - c, -r)]


def pub_square_lathe(name, x, z, profile):
    """Sweep a closed (half-size, y, chamfer) profile loop round a chamfered square: one closed ring solid."""
    points = [(x + u, y, z + w) for r, y, c in profile for u, w in pub_square_ring(r, c)]
    m = len(profile)
    faces = [(j * 8 + i, j * 8 + (i + 1) % 8, (j + 1) % m * 8 + (i + 1) % 8, (j + 1) % m * 8 + i)
             for j in range(m) for i in range(8)]
    pub_dressed_stone(name, points, faces)


def pub_chimney_fillet(roof):
    """Straw fillet: the thatch dressed up round the stack, one closed concave section swept round it.
    Outer edge buried 1 cm and tangent to the dome, rising to a lip 10 cm up the stack face; the
    inner edge is sunk 3 cm into the stack. Straw runs down the fillet, away from the stack, inside
    one straw window: u along the perimeter (the loop is two windows, cut at opposite corners)."""
    cx, cz, w = PUB_STACK
    samples = []  # (x, z on the stack face, outward offset vector), 24 evenly round the perimeter.
    edge = [w - 2 * w * k / 6 for k in range(1, 6)]
    for (sx, sz) in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
        samples.append((cx + sx * w, cz + sz * w, (sx, sz)))  # Mitred: the corner offset is diagonal.
        if (sx, sz) == (1, 1):
            samples += [(cx + w, cz + t, (1, 0)) for t in edge]
        elif (sx, sz) == (1, -1):
            samples += [(cx + t, cz - w, (0, -1)) for t in edge]
        elif (sx, sz) == (-1, -1):
            samples += [(cx - w, cz - t, (-1, 0)) for t in edge]
        else:
            samples += [(cx - t, cz + w, (0, 1)) for t in edge]
    reach, lip = .22, .10
    # Section loop: (offset out from the stack face, height over the thatch there or 'lip', v in metres).
    section = [(-.03, -.06), (reach, -.01), (reach * .6, .006), (reach * .32, .024), (reach * .12, .052),
               (.004, 'lip'), (-.03, 'lip')]
    face_y = pub_roof_y(roof, [(px, pz) for px, pz, _ in samples])
    queries = [(px + d * nx, pz + d * nz) for px, pz, (nx, nz) in samples for d, _ in section]
    ys = iter(pub_roof_y(roof, queries))
    points = []
    for (px, pz, (nx, nz)), fy in zip(samples, face_y):
        for d, h in section:
            y = next(ys)
            points.append((px + d * nx, fy + lip if h == 'lip' else y + h, pz + d * nz))
    n, s = len(samples), len(section)
    # v down the visible profile from the lip (index 5) to the buried outer edge (index 1); the
    # buried faces take a sliver of the same window.
    prof = {5: 0.0}
    for i in (4, 3, 2, 1):
        (d0, h0), (d1, h1) = section[i + 1], section[i]
        h0 = lip if h0 == 'lip' else h0
        prof[i] = prof[i + 1] + math.hypot(d1 - d0, h1 - h0)
    prof[0], prof[6] = prof[1] + .02, .02
    faces, uvs = [], []
    for k in range(n):
        u0, u1 = 3.0 * k / n, 3.0 * (k + 1) / n
        col = math.floor((u0 + u1) / 2 / PUB_WU)
        for i in range(s):
            i1 = (i + 1) % s
            faces.append((k * s + i, (k + 1) % n * s + i, (k + 1) % n * s + i1, k * s + i1))
            fv = [.1 + prof[i] / PUB_WV, .1 + prof[i1] / PUB_WV]
            uvs.append([cottage_slot_uv(PUB_STRIPS[0], 2, u0 / PUB_WU - col, fv[0]),
                        cottage_slot_uv(PUB_STRIPS[0], 2, u1 / PUB_WU - col, fv[0]),
                        cottage_slot_uv(PUB_STRIPS[0], 2, u1 / PUB_WU - col, fv[1]),
                        cottage_slot_uv(PUB_STRIPS[0], 2, u0 / PUB_WU - col, fv[1])])
    solid('Pub thatch chimney fillet', points, faces, 'thatch')
    UVS[-len(faces):] = uvs


def pub_chimney(roof):
    cx, cz, w = PUB_STACK
    box('Pub dressed chimney shaft', (cx, 6.6, cz), (2 * w, 2.2, 2 * w), 'stone')
    pub_chimney_fillet(roof)
    # Capping: drip underside, plumb face, weathered top up to the pot, open octagonal flue.
    # The flue's corners (0.238 m out) stay inside the pot's foot (0.25 m), so no daylight shows.
    pub_square_lathe('Pub dressed chimney capping', cx, cz,
                     [(.205, 7.62, .085), (.44, 7.62, .05), (.44, 7.70, .05), (.41, 7.745, .045),
                      (.27, 7.80, .03), (.205, 7.80, .085)])


# Pub corner and end-wall framing (game metres). The corners are modelled as
# joints, not stacked sticks: each is ONE L-section post (pub_corner_post) that
# wraps the wall corner, stands on a stone padstone instead of hanging short of
# the plinth, and runs up into the thatch soffit. Every rail on both elevations
# stops inside a post leg, so the rails read as tenoned into it and no rail end
# shares an edge with another. Faces step back from the post (4.17) to the rails
# (4.15), the studs (4.13) and the braces (4.115), so no two framing faces are
# coplanar. The end walls carry the long walls' three rails, a centre stud,
# window posts below the mid rail, studs over the casements and a brace in each
# outer upper bay, both brace ends buried in the post and the wall plate. The
# hanging-sign bracket at (4.02, 4.52, 1.2) lands on plaster between the centre
# stud and the stud at z 1.7.
PUB_POST_PLAN = [(3.80, 2.97), (3.80, 3.14), (3.83, 3.17), (4.13, 3.17), (4.17, 3.13), (4.17, 2.83),
                 (4.14, 2.80), (3.97, 2.80), (3.97, 2.97)]  # +x +z corner; outer arrises chamfered 3-4 cm.
PUB_POST_FOOT, PUB_POST_HEAD = .35, 5.04  # Foot 1 cm into the padstone; head buried in the soffit.
PUB_RAILS = (.49, 3.1, 4.87)  # Sill rail, mid rail and wall plate: the long walls' heights.


def pub_corner_post(sx, sz):
    box('Pub corner padstone', (sx * 3.99, .18, sz * 2.99), (.42, .36, .42), 'stone')
    ring = [(sx * x, sz * z) for x, z in PUB_POST_PLAN]
    n = len(ring)
    points = [(x, y, z) for y in (PUB_POST_FOOT, PUB_POST_HEAD) for x, z in ring]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    solid('Pub L-section corner post', points, faces, 'timber')


def pub_end_wall(sx):
    for y in PUB_RAILS:  # Ends 2 cm into the corner posts' end legs (z 2.80).
        box('Pub end oak rail', (sx * 4.05, y, 0), (.20, .20, 5.64), 'timber')
    box('Pub end centre stud', (sx * 4.045, 2.685, 0), (.17, 4.27, .20), 'timber')
    for sz in (-1, 1):
        box('Pub end window post', (sx * 4.045, 1.80, sz * .75), (.17, 2.50, .18), 'timber')
        box('Pub end upper stud', (sx * 4.045, 3.985, sz * 1.7), (.17, 1.67, .18), 'timber')
        beam('Pub end wind brace', (sx * 4.045, 3.15, sz * 2.85), (sx * 4.045, 4.82, sz * 1.75), .14)


# The pub's lime render (round 6 of the asset loop). The walls were one box
# whose every face stretched the whole plaster slot, so the infill read as one
# flat cream value. Now pub_shell lays the wall faces in metres and the plaster
# slot (pub-only flag; each building bakes its own atlas) is painted for THIS
# frame: the long walls take v in [0, .5) at u = (x + 4) / 8, the end walls v in
# [.5, 1) at u = (z + 3) / 6, both at y / PUB_PLASTER_P. Each infill panel
# between the timbers carries its own limewash tone, dirt gathers in a band
# along every timber and opening edge, the first metre over the plinth is
# damp-stained, and a weathering run hangs under every sill. Colour only: no
# directional light is painted. Front and back (and both ends) share a layout,
# so they share their painting.
PUB_PLASTER_P = 10.0
PUB_UPPER_BRACES = (((3.76, 3.16), (3.18, 4.81)),)  # Outer bays: foot in the corner post, clear of the casement.
PUB_WALL_FRAMING = {
    # (vertical member x per storey [under the sill rail, ground, upper], timber rectangles,
    #  openings (x, y, w, h), braces, brace half-width)
    'long': ([[-3.8, 3.8], [-3.8, -1.2, 1.2, 3.8], [-3.8, -1.2, 1.2, 3.8]],
             [(3.8, 9, -9, 9), (-9, -3.8, -9, 9), (1.1, 1.3, .35, 4.98), (-1.3, -1.1, .35, 4.98),
              (.9, 4.04, .39, .59), (-4.04, -.9, .39, .59)],
             [(0, 1.32, 1.48, 2.43), (-2.5, 1.97, 1.48, 1.64), (2.5, 1.97, 1.48, 1.64),
              (-2.5, 3.91, 1.1, 1.05), (2.5, 3.91, 1.1, 1.05)],
             [(a, b) for a, b in PUB_UPPER_BRACES] + [((-a[0], a[1]), (-b[0], b[1])) for a, b in PUB_UPPER_BRACES],
             .06),
    'end': ([[-2.8, 2.8], [-2.8, -.75, 0, .75, 2.8], [-2.8, -1.7, 0, 1.7, 2.8]],
            [(2.8, 9, -9, 9), (-9, -2.8, -9, 9), (-.1, .1, .55, 4.82), (.66, .84, .55, 3.05),
             (-.84, -.66, .55, 3.05), (1.61, 1.79, 3.15, 4.82), (-1.79, -1.61, 3.15, 4.82)],
            [(-1.7, 2.03, 1.16, 1.7), (1.7, 2.03, 1.16, 1.7)],
            [((2.85, 3.15), (1.75, 4.82)), ((-2.85, 3.15), (-1.75, 4.82))],
            .07),
}


def pub_wall_paint(kind, X, Y):
    """(value, grime, panel hash pair) for one elevation, in metres."""
    divs, rects, openings, braces, brace_hw = PUB_WALL_FRAMING[kind]
    rects = rects + [(-9, 9, -9, .32), (-9, 9, 3.0, 3.2), (-9, 9, 4.77, 9)]  # Plinth, mid rail, plate.
    sills = []
    for x, y, w, h in openings:
        rects.append((x - w / 2 - .08, x + w / 2 + .08, y - h / 2 - .06, y + h / 2 + .06))
        sills.append((x, w, y - h / 2 - .125))
        rects.append((x - w / 2 - .16, x + w / 2 + .16, y - h / 2 - .125, y - h / 2 - .005))
    d = np.full(X.shape, 9.0)
    for x0, x1, y0, y1 in rects:
        d = np.minimum(d, np.hypot(np.maximum(np.maximum(x0 - X, X - x1), 0),
                                   np.maximum(np.maximum(y0 - Y, Y - y1), 0)))
    for (ax, ay), (bx, by) in braces:
        ex, ey = bx - ax, by - ay
        t = np.clip(((X - ax) * ex + (Y - ay) * ey) / (ex * ex + ey * ey), 0, 1)
        d = np.minimum(d, np.maximum(np.hypot(X - ax - t * ex, Y - ay - t * ey) - brace_hw, 0))
    # One limewash coat per infill panel: storey by the rails, bay by the uprights.
    storey = np.searchsorted(np.array([.59, 3.1]), Y)
    bay = np.choose(storey, [np.searchsorted(np.array(row), X) for row in divs])
    pid = (storey * 8 + bay + (1 if kind == 'end' else 0) * 64).astype(np.int64)
    h1 = ((pid * 2654435761 + 977) % 4294967296) / 4294967296.0
    h2 = ((pid * 40503 * 2654435761 + 31337) % 4294967296) / 4294967296.0
    grime = np.clip(1 - d / .22, 0, 1) ** 1.5
    runs = np.zeros(X.shape)
    for x, w, sb in sills:
        across = np.clip(1 - ((X - x) / (w / 2 + .12)) ** 2, 0, 1) * (.55 + .45 * np.sin((X - x) * 17) ** 2)
        runs = np.maximum(runs, across * np.clip(1 - (sb - Y) / .75, 0, 1) * (Y < sb))
    damp = np.clip((1.25 - Y) / .9, 0, 1) ** 1.4
    return d, grime, runs, damp, h1, h2


def pub_plaster_swatch(xx, yy, tile):
    """The pub's lime render, laid in metres by pub_shell (see PUB_PLASTER_P)."""
    lu = np.clip(((xx + .5) / tile - .03) / .94, 0, 1)
    lv = np.clip(((yy + .5) / tile - .03) / .94, 0, 1)
    end = lv >= .5
    Y = (lv - .5 * end) * PUB_PLASTER_P
    parts = [pub_wall_paint(kind, lu * span - span / 2, Y) for kind, span in (('long', 8.0), ('end', 6.0))]
    d, grime, runs, damp, h1, h2 = [np.where(end, e, l) for l, e in zip(*parts)]
    X = np.where(end, lu * 6 - 3, lu * 8 - 4)
    patch = .035 * np.sin(X / 1.3 + 1.1 * np.sin(Y / 1.7)) * np.cos(Y / 1.1 + .8 * np.sin(X / 2.3))
    patch += .018 * np.sin(X / .47 + .6 * Y) * np.sin(Y / .39 - .3 * X)
    patch += .012 * np.sin(X / 3.1 - Y / 2.6)
    dirt = .13 * grime + .09 * damp + .07 * runs
    value = .045 + (h1 - .5) * .10 + patch - dirt  # +.045 keeps the dirtied wall's mean on the old cream.
    value += ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1800
    tint = patch[..., None] * np.array([.25, .1, -.35])  # Lighter patches a touch warmer.
    tint += (h2 - .5)[..., None] * np.array([.036, .014, -.04])  # Each panel's limewash batch.
    tint += dirt[..., None] * np.array([.12, .02, -.22])  # Dirt is warm brown, never blue.
    return value, tint


def pub_shell():
    """shell() for the pub, with the wall faces laid in metres on pub_plaster_swatch."""
    points = [(i * 4, 2.5 + j * 2.5, k * 3) for i, j, k in
              [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
               (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
    P = PUB_PLASTER_P
    uvs = []
    for f, face in enumerate(CUBE_FACES):
        corners = [points[n] for n in face]
        if f in (0, 1):
            uvs.append([((px + 4) / 8, py / P) for px, py, pz in corners])
        elif f in (3, 5):
            uvs.append([((pz + 3) / 6, .5 + py / P) for px, py, pz in corners])
        else:  # Top and bottom, buried under the cornice and in the ground: one panel's tone.
            uvs.append([(.45 + .1 * (px + 4) / 8, .3 + .1 * (pz + 3) / 6) for px, py, pz in corners])
    solid_uv('V030 Flour and Barrel planar walls', points, CUBE_FACES, uvs, 'plaster')
    box('V030 Flour and Barrel plinth', (0, .16, 0), (8.13, .32, 6.13), 'stone')
    box('V030 Flour and Barrel cornice', (0, 5 - .07, 0), (8.18, .16, 6.18), 'cream')


def pub():
    pub_shell()
    for sx in (-1, 1):
        pub_end_wall(sx)
        for sz in (-1, 1):
            pub_corner_post(sx, sz)
    roof = pub_thatch_roof()
    # A real flue: the shaft, its lead apron and an open dressed capping
    # (pub_chimney). Keep the original 8.18 m roofline.
    # Working if delivery rays see the recessed shaft and inward-facing pot wall.
    pub_chimney(roof)
    lathe('Pub hollow rolled flue pot', 3, 0,
          [(.17, 7.78), (.25, 7.78), (.25, 7.84), (.22, 7.87),
           (.22, 8.09), (.25, 8.12), (.25, 8.16), (.22, 8.18),
           (.17, 8.18), (.16, 8.14), (.17, 7.78)], 'stone', 24)
    for side in (-1,1):
        # The corner uprights (x +-3.77) are now the L-section corner posts.
        for x in (-1.2,1.2):
            box('Pub pegged upright',(x,2.6,side*3.04),(.20,4.75,.18),'timber')
        for y in (.49,3.1,4.87):
            if y < 1:
                # Rails run 2 cm past the corner: ending flush, their end faces
                # lay in the side walls' plane.
                for x in (-2.47,2.47): box('Pub sill rail clear of door',(x,y,side*3.05),(3.14,.20,.20),'timber')
            else:
                box('Pub oak rail',(0,y,side*3.05),(8.04,.20,.20),'timber')
        for x in (-2.5,2.5):
            frame('Pub leaded window',x,1.97,side*3.06,1.48,1.64,0 if side==1 else math.pi,'timber','amber')
            frame('Pub upper casement',x,3.91,side*3.06,1.1,1.05,0 if side==1 else math.pi,'timber','amber')
        # Wind braces in the outer bays, clear of the casements (round 6: the
        # old (x-.85, 3.26)->(x-.3, 4.7) brace crossed the casement head). Foot
        # 4 cm into the mid rail and buried in the corner post, head 4 cm into
        # the wall plate; >= 9 cm clear of the casement rail at its head.
        for (fx, fy), (hx, hy) in PUB_UPPER_BRACES:
            for sx in (-1, 1):
                beam('Pub upper wind brace',(sx*fx,fy,side*3.08),(sx*hx,hy,side*3.08),.12)
        for z in (-1.7,1.7):
            frame('Pub side casement',side*4.04,2.03,z,1.16,1.7,side*math.pi/2,'timber','amber')
        frame('Pub oak entry',0,1.32,side*3.07,1.48,2.43,0 if side==1 else math.pi,'timber',door=True)
        box('Pub threshold',(0,.07,side*3.29),(1.86,.14,.60),'stone')
    for side in (-1,1):
        box('Pub lantern bracket',(side*.98,2.68,3.15),(.06,.38,.36),'iron')
        box('Pub lantern housing',(side*.98,2.62,3.33),(.24,.39,.23),'iron')
        box('Pub lantern glass',(side*.98,2.62,3.454),(.15,.28,.019),'amber')


def school():
    shell('V030 cream schoolhouse',10,7,6,'plaster')
    quoins('Schoolhouse',10.02,7.02,5.8)
    hip_roof('School hipped slate',11.1,8.3,6.10,9.03,rows=7)
    for side in (-1,1):
        for x in (-3.7,-1.75,1.75,3.7):
            frame('School tall sash',x,3.22,side*3.54,1.13,2.22,0 if side==1 else math.pi)
        for z in (-1.9,1.9):
            frame('Classroom side sash',side*5.035,3.2,z,1.35,2.8,side*math.pi/2)
        frame('School oak door',0,1.46,side*3.55,1.39,2.69,0 if side==1 else math.pi,'cream',door=True)
        box('School accessible threshold',(0,.07,side*3.78),(1.89,.14,.63),'stone')
        for x in (-2.93,2.93):
            box('School sill course clear of door',(x,1.74,side*3.55),(4.05,.12,.15),'cream')
    box('Open belfry base',(0,8.88,0),(2.25,.19,2.25),'cream')
    for x in (-.85,.85):
        for z in (-.85,.85):
            box('Open belfry turned post',(x,9.75,z),(.21,1.69,.21),'cream')
            box('Belfry post capital',(x,10.57,z),(.32,.15,.32),'cream')
    box('Belfry crown',(0,10.75,0),(2.3,.23,2.3),'cream')
    # The bell, its oak headstock, straps, crown bolt and clapper swing, so they
    # are no longer baked here: the runtime SchoolBell (src/components/scenery/
    # schoolBellGeometry.ts) hangs them on this yoke line, x along the axis at
    # y 10.38, turning in the two iron bearings below. Its lathe profile is
    # the one this function used to cast (2026-11-07, Nell: the bell rings).
    # Hung iron bearings connect the swinging yoke's gudgeons to the crown overhead.
    for side in (-1,1):
        box('Bell crown hanger',(side*.64,10.55,0),(.075,.23,.14),'iron')
        box('Bell yoke bearing',(side*.64,10.39,0),(.14,.15,.24),'iron')
    lathe('School swept bell cap',0,0,[(1.6,10.90),(1.56,11.0),(1.22,11.14),(.94,11.38),(.71,11.67),(.48,11.98),(.27,12.28),(.07,12.55),(0,12.63)],'slate',24)
    lathe('Belfry gilt finial',0,0,[(.035,12.5),(.1,12.65),(0,12.83)],'brass',12)


def canal_boat():
    # Metre-authored hull: keel y=0, waterline=.6, no provider triangles retained.
    # Plan half-widths at the traced control stations. The ends are resampled
    # through a monotone cubic (no overshoot, so the blunt counter and the
    # pointed stem keep their shape and nothing seated on the old hull pokes
    # out) at stations clustered towards each tip, where the curvature is.
    control=[(-6.475,.10),(-6.18,.73),(-5.7,1.10),(-4.9,1.27),(-3.8,1.31),(3.8,1.31),(4.65,1.19),(5.4,.86),(6.04,.44),(6.475,.055)]

    def half_width(z):
        zs=[c[0] for c in control];ws=[c[1] for c in control]
        h=[zs[i+1]-zs[i] for i in range(len(zs)-1)];d=[(ws[i+1]-ws[i])/h[i] for i in range(len(h))]
        m=[d[0]]+[0 if d[i-1]*d[i]<=0 else (3*(h[i-1]+h[i]))/((2*h[i]+h[i-1])/d[i-1]+(h[i]+2*h[i-1])/d[i]) for i in range(1,len(d))]+[d[-1]]
        i=max(k for k in range(len(h)) if zs[k]<=z+1e-9) if z<zs[-1] else len(h)-1
        t=(z-zs[i])/h[i]
        return ((2*t**3-3*t**2+1)*ws[i]+(t**3-2*t**2+t)*h[i]*m[i]
                +(-2*t**3+3*t**2)*ws[i+1]+(t**3-t**2)*h[i]*m[i+1])


    def deck(z):
        return .98+.17*(abs(z)/6.475)**3

    # Lines plan, not one scaled section (round 3: the old hull scaled a
    # single six-point section by the deck half-width, so the bow and the
    # counter were the midship slab section shrunk, faceting between strakes).
    # Each section point now carries a midship (s, f) and a fine-ended (s, f)
    # position, s a fraction of the deck half-width and f of the deck height,
    # blended by how far the station sits into the entrance or the run.
    # Midship keeps the old straight side (s = .77 + .23 f, so the strakes and
    # the beam stand where they did) over a three-point round bilge; towards
    # the stem and the counter the lower waterlines pull in first (the swims),
    # so the side flares up into the gunwale as one curve. The bilge is a
    # quadratic Bezier whose control sits where the side line meets the
    # bottom, so it leaves the bottom flat and joins the side tangent.
    def bilge(p0, c, p1):
        return [p0] + [tuple((1-t)**2*p0[k]+2*t*(1-t)*c[k]+t*t*p1[k] for k in range(2))
                       for t in (.25, .5, .75)] + [p1]
    mid_bilge,fine_bilge=((.68,0),(.77,0),(.7999,.13)),((.34,0),(.436,0),(.60,.20))
    mid=bilge(*mid_bilge)+[(.8574,.38),(.9218,.66),(1,1)]
    fine=bilge(*fine_bilge)+[(.78,.42),(.915,.68),(1,1)]

    def blend(z):
        t=min(max((abs(z)-3.8)/2.675,0),1)
        return t*t*(3-2*t)

    def section(z):
        e=blend(z)
        return [(a[0]+(b[0]-a[0])*e,a[1]+(b[1]-a[1])*e) for a,b in zip(mid,fine)]

    def side_at(z,w,y):
        # The hull surface at height y on station z: (half-width, raked z).
        f=y/deck(z);sec=section(z)
        for (s0,f0),(s1,f1) in zip(sec,sec[1:]):
            if f<=f1 or f1==sec[-1][1]:
                return w*(s0+(s1-s0)*(f-f0)/(f1-f0)),z*(.96+.04*f)

    # One closed loft: per station a 16-point ring, starboard bottom edge up
    # to the starboard gunwale, across the deck, down the port side and back
    # across the flat bottom. Its UVs are its own island, laid in metres:
    # u runs the whole 12.95 m length and v the girth from the bottom edge to
    # the gunwale, so the hull swatch (atlas boat_hull) is laid once over the
    # hull instead of once per panel. Every UV stays inside the slate slot,
    # which the runtime paint finish identifies as the navy hull.
    K=len(mid)
    def ring_point(z,k):
        z=min(max(z,-6.475),6.475)
        s,f=section(z)[k]
        return (half_width(z)*s,f*deck(z),z*(.96+.04*f))

    def unit(v):
        ln=math.sqrt(sum(c*c for c in v)) or 1.0
        return tuple(c/ln for c in v)

    def cross3(a,b):
        return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

    def hull_normal(z,k):
        z0,z1=max(z-1e-4,-6.475),min(z+1e-4,6.475)
        p0,p1=ring_point(z0,k),ring_point(z1,k)
        tl=tuple((b-a)/(z1-z0) for a,b in zip(p0,p1))
        w,h,e,sec=half_width(z),deck(z),blend(z),section(z)
        if k<=4:
            p0_,c_,p1_=[tuple(m_[q]+(f_[q]-m_[q])*e for q in range(2)) for m_,f_ in zip(mid_bilge,fine_bilge)]
            t=k/4
            ds,df=(2*(1-t)*(c_[q]-p0_[q])+2*t*(p1_[q]-c_[q]) for q in range(2))
        else:
            a_,b_=sec[k-1],sec[min(k+1,K-1)]
            ds,df=b_[0]-a_[0],b_[1]-a_[1]
        tg=(w*ds,h*df,z*.04*df)
        return unit(cross3(tg,tl))

    # Round 5: stations are placed by the lines' own curvature, not by a
    # hand list. Every waterline (each section point run fore and aft) is
    # walked in 1 cm steps and its turning (of its direction and of the
    # surface normal on it) summed; ten stations per end sit
    # at equal steps of that sum (plus 2 degrees per metre, so the flat run
    # into midship is not left as one span). Rounds 2-4 clustered a fixed
    # list at the tips, which left 17-19 degrees of turn between the counter
    # stations at -6.36, -6.22 and -6.02 and read as creases there.
    def end_stations(z0,z1,count):
        def tangent(z,k):
            a=min(max(z-.005,-6.475),6.475);b=min(max(z+.005,-6.475),6.475)
            sa,sb=section(a)[k],section(b)[k]
            pa=(half_width(a)*sa[0],sa[1]*deck(a),a*(.96+.04*sa[1]))
            pb=(half_width(b)*sb[0],sb[1]*deck(b),b*(.96+.04*sb[1]))
            d=[q-p_ for p_,q in zip(pa,pb)];ln=math.sqrt(sum(c*c for c in d))
            return [c/ln for c in d]
        steps=max(int(abs(z1-z0)/.01),1);zs=[z0+(z1-z0)*i/steps for i in range(steps+1)]
        acc=[0.0]
        for za,zb in zip(zs,zs[1:]):
            turn=max(max(math.acos(max(-1,min(1,sum(x*y for x,y in zip(tangent(za,k),tangent(zb,k)))))),
                         math.acos(max(-1,min(1,sum(x*y for x,y in zip(hull_normal(za,k),hull_normal(zb,k)))))))
                     for k in range(K))
            acc.append(acc[-1]+turn+math.radians(2)*abs(zb-za))
        out=[z0]
        for i in range(1,count-1):
            goal=acc[-1]*i/(count-1)
            j=next(q for q in range(len(acc)) if acc[q]>=goal)
            f=(goal-acc[j-1])/max(acc[j]-acc[j-1],1e-12)
            out.append(round(zs[j-1]+(zs[j]-zs[j-1])*f,4))
        return out+[z1]
    stern=end_stations(-6.475,-3.8,10)
    bow=end_stations(3.8,6.475,10)
    stations=[(z,half_width(z)) for z in stern+bow]
    K=len(mid)
    points,uv_at,girth=[],[],[]
    for z,w in stations:
        h=deck(z);sec=section(z)
        ring=[(w*s,f*h,z*(.96+.04*f)) for s,f in sec]
        g=[0.0]
        for a_,b_ in zip(ring,ring[1:]):
            g.append(g[-1]+math.hypot(b_[0]-a_[0],b_[1]-a_[1]))
        girth.append(g)
        for k in list(range(K))+list(range(K-1,-1,-1)):
            x,y,zz=ring[k]
            points.append((x if len(points)%(2*K)<K else -x,y,zz))
    G=max(g[-1] for g in girth)
    n=2*K
    faces,face_uvs=[],[]
    clamp=lambda v:min(max(v,0.0),1.0)
    for row in range(len(stations)-1):
        for j in range(n):
            ids=(row*n+j,row*n+(j+1)%n,(row+1)*n+(j+1)%n,(row+1)*n+j)
            uvs=[]
            for idx in ids:
                x,y,zz=points[idx];r,c=divmod(idx,n)
                k=c if c<K else n-1-c
                u=(zz+6.475)/12.95
                if j in (K-1,n-1):  # Deck and flat bottom: planar across the beam.
                    uvs.append((clamp(u),clamp((x+1.4)/2.8)))
                else:
                    uvs.append((clamp(u),clamp(girth[r][k]/G)))
            faces.append(ids);face_uvs.append(uvs)
    for row,cap in ((0,tuple(reversed(range(n)))),(len(stations)-1,tuple(range((len(stations)-1)*n,len(stations)*n)))):
        faces.append(cap)
        face_uvs.append([(clamp((points[i][2]+6.475)/12.95),clamp((points[i][0]+1.4)/2.8)) for i in cap])
    # Round 5 (strike rule): the hull's shading comes from the lines plan,
    # not from Blender averaging face angles. Rounds 2-4 smoothed by a
    # dihedral limit, so each vertex took the mean of the faces round it:
    # the 7.6 m midship panel's end vertices at +-3.8 averaged in the taper
    # faces (8-15 degrees of turn), tilting the whole panel's normals fore
    # and aft into a light-to-dark smear along the navy side, and the
    # coarse stern stations (17-19 degrees apart) shaded as creases. Here
    # every corner takes the exact surface normal: the station tangent
    # (d/dz of the plan, sheer, section blend and rake) crossed with the
    # girth tangent (the bilge Bezier's derivative, then the side line).
    # Both vanish fore-and-aft at +-3.8 (PCHIP slope 0, smoothstep), so the
    # parallel midbody is one even value. Deck and bottom corners carry
    # their own plane normals, so the gunwale and the bottom edge stay
    # crisp without any angle threshold.
    hull_start,hull_face0=len(VERTS),len(FACES)
    for fi,face in enumerate(faces):
        # The two end caps (last two faces) take the side's own normals at
        # every corner, so the stem and the counter shade round into the
        # sides instead of standing as a flat strip with a hybrid edge.
        row,j=divmod(fi,n) if fi<len(faces)-2 else (None,-1)
        corners={}
        for idx in face:
            r,c=divmod(idx,n)
            z=stations[r][0]
            if j==K-1:  # Deck: the sheer plane across the beam.
                dz=(deck(min(z+1e-4,6.475))-deck(max(z-1e-4,-6.475)))/(min(z+1e-4,6.475)-max(z-1e-4,-6.475))
                corners[hull_start+idx]=unit((0,1,-dz))
            elif j==n-1:  # Flat bottom.
                corners[hull_start+idx]=(0,-1,0)
            else:
                k=c if c<K else n-1-c
                nx,ny,nz=hull_normal(z,k)
                corners[hull_start+idx]=(nx if c<K else -nx,ny,nz)
        BOAT_CORNER_NORMALS[hull_face0+fi]=corners
    solid_uv('Fair tapered narrowboat hull',points,faces,face_uvs,'slate')
    # Rubbing strakes: one swept bar each along every station. Triangular
    # section whose joint with the hull is modelled: each back vertex is the
    # hull surface at its own height (side_at), sunk 12 mm along the plan
    # normal, so the bar hugs the flare at the ends; the apex stands as far
    # out as before at midship (beam unchanged).
    for side in (-1,1):
        for y,width,key in [(.24,.065,'iron'),(.69,.065,'iron'),(.94,.035,'brass')]:
            surface=[side_at(z,w,y) for z,w in stations]
            pts=[]
            for i,(sx,sz) in enumerate(surface):
                ax,az=surface[max(i-1,0)];bx,bz=surface[min(i+1,len(surface)-1)]
                tx,tz=bx-ax,bz-az;ln=math.hypot(tx,tz)
                nx,nz=tz/ln,-tx/ln
                if nx<0: nx,nz=-nx,-nz
                out,back=.012+width/2,-.012
                z,w=stations[i]
                (ux,uz),(lx,lz)=side_at(z,w,y+width/2),side_at(z,w,y-width/2)
                pts += [(side*(ux+nx*back),y+width/2,uz+nz*back),(side*(lx+nx*back),y-width/2,lz+nz*back),
                        (side*(sx+nx*out),y,sz+nz*out)]
            m=len(surface)
            sf=[(r*3+k,r*3+(k+1)%3,(r+1)*3+(k+1)%3,(r+1)*3+k) for r in range(m-1) for k in range(3)]
            sf += [(2,1,0),((m-1)*3,(m-1)*3+1,(m-1)*3+2)]
            # Round 5: the bar's UVs are re-laid as one point at the middle of
            # its slot. solid() stretched the whole iron or brass swatch, hash
            # speckle and all, over each 13 m face, which drew long light and
            # dark streaks down the bar; a painted steel strake is one colour.
            # Its normals are traced from its own section at each station:
            # the upper and lower faces' normals in the plane across the bar,
            # their mean at the apex, so it shades as a half-round with no
            # station-to-station averaging; the buried back keeps its own.
            start,face0=len(VERTS),len(FACES)
            for fi,face in enumerate(sf[:-2]):
                r,k=divmod(fi,3)
                if k==0:
                    continue  # Back face, buried 12 mm in the hull side.
                corners={}
                for idx in face:
                    i,q=divmod(idx,3)
                    U,L,A=pts[i*3],pts[i*3+1],pts[i*3+2]
                    A0,A1=pts[max(i-1,0)*3+2],pts[min(i+1,m-1)*3+2]
                    t=tuple(b-a for a,b in zip(A0,A1))
                    nu=unit(cross3(tuple(b-a for a,b in zip(U,A)),t))
                    nl=unit(cross3(tuple(b-a for a,b in zip(L,A)),t))
                    nu=nu if nu[1]>0 else tuple(-c for c in nu)
                    nl=nl if nl[1]<0 else tuple(-c for c in nl)
                    corners[start+idx]=unit(tuple(a+b for a,b in zip(nu,nl))) if q==2 else (nu if q==0 else nl)
                BOAT_CORNER_NORMALS[face0+fi]=corners
            solid_uv('Continuous rubbing strake',pts,sf,[[(.5,.5)]*len(f) for f in sf],key)
    # Round 4 (strike rule): the fittings below are built round their joints
    # instead of being nudged. Each one is traced as a section and lathed or
    # swept from inside the surface it stands on, so the joint is modelled
    # geometry, never a gap closed by moving the part.
    def lathe_x(name,side,y,z,profile,key,segments=16,closed=False):
        # A surface of revolution about an axis normal to the cabin side:
        # profile rows are (|x|, radius), r=0 rows close to one pole vertex.
        points,rows=[],[]
        for ax,r in profile:
            start=len(points)
            if r==0:
                points.append((side*ax,y,z));rows.append([start]*segments)
            else:
                points += [(side*ax,y+r*math.cos(i*math.tau/segments),z+r*math.sin(i*math.tau/segments)) for i in range(segments)]
                rows.append([start+i for i in range(segments)])
        faces=[]
        for a,b in zip(rows,rows[1:]+(rows[:1] if closed else [])):
            for i in range(segments):
                j=(i+1)%segments
                face=(a[i],a[j],b[j],b[i])
                face=tuple(v for k,v in enumerate(face) if v not in face[:k])
                if len(face)>=3: faces.append(face)
        solid(name,points,faces,key)

    def disc_x(name,side,x0,x1,y,z,outline,key):
        # A flat relief piece standing out of a cabin-side surface along x.
        n=len(outline)
        points=[(side*ax,y+v,z+u) for ax in (x0,x1) for u,v in outline]
        solid(name,points,[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],key)

    # Well deck planks are laid on the hull deck, not 5 cm over it: each one is
    # a closed board whose underside follows the deck sheer 1 cm inside the
    # hull top and whose outer edge follows the hull plan at both ends.
    for z0,z1 in [(-5.66,-4.03),(3.61,5.03)]:
        for x in range(-5,6):
            ends=[]
            for z in (z0,z1):
                lim=half_width(z)-.02
                lo,hi=max(x*.19-.088,-lim),min(x*.19+.088,lim)
                ends.append((z,lo,hi,deck(z)-.01))
            pts=[(xx,yy,z) for z,lo,hi,base in ends for xx,yy in ((lo,base),(hi,base),(hi,1.1525),(lo,1.1525))]
            solid('Teak well deck plank',pts,CUBE_FACES,'oak')
    box('Cabin coachwork',(0,1.83,-.28),(2.10,1.42,7.36),'brick')
    for side in (-1,1):
        for y in (1.22,2.40):
            box('Cabin cream coachline',(side*1.061,y,-.28),(.025,.033,7.29),'cream')
        for z in (-2.8,-1.2,.4,2.0):
            # Porthole: one brass collar lathed from its section, not three
            # stacked discs. Its foot is buried 2.5 cm in the cabin side
            # (1.05); a flat flange, a barrel, a chamfered lip and a straight
            # .205 bore that runs back into the wall. The glass is a closed
            # disc 2 mm wider than the bore, so its edge is set into the bore
            # wall; its face stays at 1.155 (the runtime glazing band) and now
            # reads 4 cm down inside the lip.
            lathe_x('Porthole brass collar',side,2.03,z,
                    [(1.025,.262),(1.068,.262),(1.068,.226),(1.170,.226),(1.196,.205),(1.025,.205)],
                    'brass',16,closed=True)
            lathe_x('Recessed porthole glazing',side,2.03,z,
                    [(1.13,0),(1.13,.207),(1.155,.207),(1.155,0)],'glass',16)
        for z in (-3.60,2.84):
            # Raised fielded panel grown out of the cabin side: its back is
            # 2 cm inside the wall, its edges are a 2 cm bevel to the field.
            outline=lambda hw,hh:[(-hw,-hh),(hw,-hh),(hw,hh),(-hw,hh)]
            pts=[(side*ax,1.81+v,z+u) for ax,hw,hh in ((1.03,.30,.37),(1.064,.30,.37),(1.076,.28,.35))
                 for u,v in outline(hw,hh)]
            faces=[(3,2,1,0),(8,9,10,11)]+[(r*4+i,r*4+(i+1)%4,(r+1)*4+(i+1)%4,(r+1)*4+i) for r in range(2) for i in range(4)]
            solid('Cabin fielded painted panel',pts,faces,'green')
    # Continuous barrel-cambered roof, sealed at its ends and underneath.
    roof_pts=[]
    for z in (-4.08,3.56):
        for i in range(13):
            x=-1.17+i*2.34/12
            roof_pts.append((x,2.57+.20*(1-(x/1.17)**2),z))
        for i in range(12,-1,-1):
            x=-1.17+i*2.34/12
            roof_pts.append((x,2.50+.20*(1-(x/1.17)**2),z))
    n=26
    solid('Sealed cambered cabin roof',roof_pts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],'cream')
    for z,yaw in [(-3.97,math.pi),(3.43,0)]:
        frame('Cabin glazed doors',0,1.83,z,1.13,1.22,yaw,'oak',door=True,sill=False)
        # Oak threshold step instead of a stone sill: traced from its side
        # section (bed, riser, rounded nosing), its back 3 cm inside the cabin
        # end and its bed 1.25 cm down in the well deck planks, so it is
        # visibly the step the doors close onto.
        e=1 if z>0 else -1
        face=3.40 if z>0 else 3.96
        sec=[(face-.03,1.14),(face+.235,1.14),(face+.235,1.182),(face+.222,1.199),(face+.20,1.205),(face-.03,1.205)]
        n=len(sec)
        pts=[(xx,yy,e*zz) for xx in (-.665,.665) for zz,yy in sec]
        solid('Cabin door oak threshold',pts,[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],'oak')
        for x in (-.29,.29):
            # No stone sill: it read as a grey ledge stuck across the doors.
            frame('Door upper pane',x,2.1,z+(.095 if yaw==0 else -.095),.33,.43,yaw,'oak',sill=False)
    for z in (-2.7,-.4,1.9):
        # Closed at its foot (1 cm inside the roof crown) instead of an open rim.
        lathe('Mushroom brass roof vent',0,z,[(0,2.76),(.10,2.76),(.10,2.84),(.23,2.87),(.23,2.91),(.10,3.01),(0,3.03)],'brass',16,close_poles=True)
    # An actual open flue under a supported rain hood, within the original
    # roof/chimney envelope. Working if the delivery ray crosses the outlet
    # gap at y3.27, the pipe stays closed-sided and the hood still tops at3.39.
    lathe('Boat recessed stove pipe',-.63,-2.0,
          [(.11,2.72),(.11,3.24),(.083,3.24),(.083,2.72),
           (.11,2.72)],'iron',12)
    lathe('Boat stove rain hood',-.63,-2.0,
          [(0,3.31),(.19,3.31),(.19,3.34),(0,3.39)],'iron',10,close_poles=True)
    for i in range(2):
        a = i * math.pi
        beam('Stove hood support',
             (-.63 + .11 * math.cos(a),3.20,-2.0 + .11 * math.sin(a)),
             (-.63 + .15 * math.cos(a),3.315,-2.0 + .15 * math.sin(a)),
             .018,'iron')
    # Locker traced from its end elevation: its base follows the roof camber
    # 1 cm inside the roof skin instead of a flat box bottom 5 cm over it.
    camber=lambda x:2.57+.20*(1-(x/1.17)**2)-.01
    prism('Roof timber storage locker',[(.08,camber(.08)),(.44,camber(.44)),(.80,camber(.80)),(.80,3.01),(.08,3.01)],1.165,-.065,'green')
    for z in (.03,1.07): box('Locker brass strap',(.44,3.017,z),(.74,.014,.037),'brass')
    for side in (-1,1):
        # Grab rail seated on the roof camber, not hovering over it. Roof top at
        # |x| 1.0 is 2.624 (2.617 at the rail's outer edge); a .044 bar centred
        # at 2.635 sinks its whole underside into the roof and stands 3 cm proud.
        # Working if the floating probe finds no 6.8 m rail assembly.
        beam('Roof grab rail',(side*1.0,2.635,-3.65),(side*1.0,2.635,3.18),.044,'brass')
        # Stern guard: one bent brass tube swept along its centreline (foot,
        # upright, radiused bend, top rail, bend, upright, foot) instead of
        # three beams meeting at points, standing in lathed deck flanges
        # whose bases are 1 cm inside the hull deck.
        x=side*1.1
        path=[(deck(-5.26)-.008,-5.26)]
        path += [(1.74+.08*math.sin(math.radians(a)),-5.18-.08*math.cos(math.radians(a))) for a in (0,30,60,90)]
        path += [(1.74+.08*math.cos(math.radians(a)),-4.48+.08*math.sin(math.radians(a))) for a in (0,30,60,90)]
        path += [(deck(-4.4)-.008,-4.40)]
        rad,ring=.024,6
        pts=[]
        for i,(py,pz) in enumerate(path):
            ay,az=path[max(i-1,0)];by,bz=path[min(i+1,len(path)-1)]
            ty,tz=by-ay,bz-az;ln=math.hypot(ty,tz);ty,tz=ty/ln,tz/ln
            for k in range(ring):
                c,s_=math.cos(k*math.tau/ring),math.sin(k*math.tau/ring)
                pts.append((x+rad*c,py+rad*s_*tz,pz-rad*s_*ty))
        m=len(path)
        rf=[(r*ring+k,r*ring+(k+1)%ring,(r+1)*ring+(k+1)%ring,(r+1)*ring+k) for r in range(m-1) for k in range(ring)]
        rf += [tuple(reversed(range(ring))),tuple(range((m-1)*ring,m*ring))]
        solid('Stern guard bent rail',pts,rf,'brass')
        for z in (-5.26,-4.40):
            d=deck(z)
            lathe('Stern guard deck flange',x,z,[(0,d-.01),(.045,d-.01),(.045,d+.01),(0,d+.024)],'brass',8,close_poles=True)
    beam('Tiller rudder stock',(0,1.10,-5.38),(0,1.69,-5.38),.065,'iron')
    beam('Swan neck tiller',(0,1.69,-5.38),(.3,1.94,-4.94),.054,'brass')
    beam('Tiller oak handgrip',(.3,1.94,-4.94),(.3,1.94,-4.35),.075,'oak')
    for z in (-5.9,5.86):
        for side in (-1,1):
            # Closed post standing 1 cm into the deck it is bolted to.
            lathe('Mooring bollard',side*.29,z,[(0,deck(z)-.01),(.09,deck(z)-.01),(.09,1.36),(.13,1.39),(.13,1.44),(0,1.44)],'iron',12,close_poles=True)
    # The rope coil is one swept tube along the old spiral (round 3), not 96
    # separate boxes: one shell, two thirds of the triangles, and it lies on
    # the plank tops (1.1525) instead of 3 cm above them.
    path=[(r*math.cos(a),1.162,4.77+r*math.sin(a)) for a,r in
          ((i*math.tau/24,.14+.26*i/96) for i in range(97))]
    hw=.0125
    pts=[]
    for i,p in enumerate(path):
        a_,b_=path[max(i-1,0)],path[min(i+1,len(path)-1)]
        tx,tz=b_[0]-a_[0],b_[2]-a_[2];ln=math.hypot(tx,tz)
        sx,sz=-tz/ln,tx/ln
        pts += [(p[0]+sx*i_*hw,p[1]+j_*hw,p[2]+sz*i_*hw) for i_,j_ in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    m=len(path)
    rf=[(r*4+k,r*4+(k+1)%4,(r+1)*4+(k+1)%4,(r+1)*4+k) for r in range(m-1) for k in range(4)]
    rf += [(3,2,1,0),((m-1)*4,(m-1)*4+1,(m-1)*4+2,(m-1)*4+3)]
    solid('Bow coiled rope',pts,rf,'thatch')
    # Rope fenders are tied at the tapered wells, inside the unchanged maximum
    # beam. The restrained ochre cord reads as rope rather than black car tyres.
    for side in (-1, 1):
        for z in (-5.15, 5.10):
            x = side * 1.035
            beam('Fender suspension rope', (side * .88, 1.15, z),
                 (x, .94, z), .023, 'thatch')
            lathe('Woven rope fender', x, z,
                  [(0, .56), (.065, .59), (.087, .67), (.087, .88),
                   (.062, .96), (0, .98)], 'thatch', 8, close_poles=True)
    # Small traditional rose clusters, raised paint on the cabin end panels.
    # Each rose is built from the panel field outwards, every layer's back
    # inside the one beneath (panel field at 1.076): leaf, a five-petal
    # scalloped bloom, a brass boss.
    for side in (-1,1):
        for z in (-3.60,2.84):
            for yy,zz in [(1.69,z-.13),(1.88,z+.1)]:
                ring=lambda r,n:[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n)) for i in range(n)]
                disc_x('Painted rose leaf',side,1.068,1.088,yy-.075,zz+.06,ring(.09,8),'cream')
                petals=[((.095 if i%2==0 else .072)*math.cos(i*math.tau/10+math.pi/2),(.095 if i%2==0 else .072)*math.sin(i*math.tau/10+math.pi/2)) for i in range(10)]
                disc_x('Painted rose bloom',side,1.068,1.104,yy,zz,petals,'rose')
                disc_x('Painted rose centre',side,1.098,1.122,yy,zz,ring(.037,8),'brass')


def forge():
    shell('Forge rear workshop', 4.04, 3.85, 3.2, 'stone', z=-1.30)
    roof('Forge tile', 0, -.06, 4.57, 6.86, 3.24, 4.64, 'tile', 7)
    for side in (-1, 1):
        box('Forge porch post', (side * 1.89, 1.62, 2.95), (.22, 3.24, .22), 'timber')
        beam('Forge knee brace', (side * 1.89, 2.56, 2.95), (side * 1.22, 3.14, 2.95), .13)
        frame('Forge side shutter', side * 2.04, 1.77, -1.18, 1.12, 1.23, side * math.pi / 2, 'timber', 'ink')
    frame('Forge door', .62, 1.22, .645, 1.02, 2.23, trim='timber', door=True)
    # The roof bears on its supports instead of hovering 6-16 cm above them.
    # Underside of the tile courses ('Forge tile' above): ridge 4.64, eave 3.24,
    # half-span 2.285, slab .08; each course steps up .028 at its outer edge,
    # so bearing faces sit .025-.03 above the base line, never through the top.
    def under(x, lift=.03):
        return 4.64 + (3.24 - 4.64) * abs(x) / 2.285 - .08 + lift

    # Stone gable infill on the workshop's front wall, sat in the cornice.
    prism('Forge front stone gable', [(-2.02, 3.18), (2.02, 3.18), (2.02, under(2.02)),
          (0, under(0)), (-2.02, under(2.02))], .70, .43, 'stone')
    # Rear elevation traced as one stone gable-end wall, ground to the tile
    # underside: it buries the rear wall face, the plinth and cornice ends and
    # roof()'s cream gable, so the back reads as one built masonry end.
    prism('Forge rear stone gable end', [(-2.13, 0), (2.13, 0), (2.13, under(2.13, .025)),
          (0, under(0, .025)), (-2.13, under(2.13, .025))], -3.215, -3.40, 'stone')
    # Battered footing course along it, traced from its side profile.
    footing = [(z, y) for z, y in ((-3.38, 0), (-3.50, 0), (-3.50, .12), (-3.43, .34), (-3.38, .34))]
    solid('Forge rear battered footing', [(x, y, z) for x in (-2.17, 2.17) for z, y in footing],
          [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5)] + [(i, i + 5, (i + 1) % 5 + 5, (i + 1) % 5) for i in range(5)],
          'stone')
    def along_x(name, x0, x1, profile, key):
        # A (z, y) side profile extruded along x: a moulding, not a box.
        n = len(profile)
        solid(name, [(x, y, z) for x in (x0, x1) for z, y in profile],
              [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
              + [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)], key)

    # Dressed freestone (the thatch slot carries the forge ashlar swatch). The
    # rear elevation is broken up by built masonry rather than by texture:
    # quoins at every workshop corner, a weathered string course at eave level
    # and a framed louvred vent. Block joints sit on the ashlar course lines
    # (Y0 + k * .32), so the modelled quoin joints and the painted ones agree.
    def quoin_rows(first_row, last_row, floor):
        # Course k spans Y0 + .32k to Y0 + .32(k + 1); each block leaves an
        # 8 mm joint at both beds, and the lowest one drops to its seat.
        for row in range(first_row, last_row + 1):
            lo = FORGE_GRID['Y0'] + row * FORGE_ASHLAR_COURSE + .008
            hi = FORGE_GRID['Y0'] + (row + 1) * FORGE_ASHLAR_COURSE - .008
            yield row, (floor if row == first_row else lo), hi

    for side in (-1, 1):
        # Rear corners stand on the ground beside the battered footing.
        for row, lo, hi in quoin_rows(0, 9, 0.0):
            run = .56 if row % 2 == 0 else .34
            box('Forge rear dressed quoin', (side * (2.15 - run / 2), (lo + hi) / 2, -3.3125),
                (run, hi - lo, .215), 'thatch')
        # Front corners rise off the plinth and stop under the cornice.
        for row, lo, hi in quoin_rows(1, 8, .315):
            run = .56 if row % 2 == 0 else .34
            box('Forge front dressed quoin', (side * (2.04 - run / 2), (lo + hi) / 2, .525),
                (run, hi - lo, .24), 'thatch')
    along_x('Forge rear string course', -2.155, 2.155,
            [(-3.395, 3.03), (-3.395, 3.15), (-3.425, 3.15), (-3.455, 3.11), (-3.455, 3.03)], 'thatch')
    # Gable vent: a framed opening, sill, jambs and head in dressed stone round
    # a dark louvred slot. Buried faces are staggered so none is coplanar.
    box('Forge gable vent opening', (0, 3.80, -3.405), (.27, .54, .014), 'ink')
    box('Forge gable vent sill', (0, 3.505, -3.431), (.46, .07, .074), 'thatch')
    for side in (-1, 1):
        box('Forge gable vent jamb', (side * .175, 3.805, -3.4225), (.09, .55, .055), 'thatch')
    box('Forge gable vent head', (0, 4.11, -3.426), (.50, .10, .068), 'thatch')
    for y in (3.64, 3.78, 3.92):
        along_x('Forge gable vent louvre', -.14, .14,
                [(-3.396, y + .05), (-3.396, y + .03), (-3.44, y - .02), (-3.44, y)], 'timber')
    for side in (-1, 1):
        # Timber wall plate along each eave: on the cornice, over the post heads.
        prism('Forge wall plate', [(side * 1.80, 3.17), (side * 2.04, 3.17),
              (side * 2.04, under(2.04, .025)), (side * 1.80, under(1.80, .025))], 3.04, -3.20, 'timber')
    # Porch tie beam on the post heads and lintel board; its face stays behind
    # the board plane, and it carries the front plaster gable's foot.
    box('Forge porch tie beam', (0, 3.185, 3.024), (3.8, .13, .208), 'timber')

    def lofted(name, rings, key, cx=-.4):
        # One closed solid lofted through chamfered rectangular rings, each
        # (y, half-width, front z, back z, chamfer): a traced profile with real
        # edge loops, not stacked boxes whose caps meet face to face.
        points = []
        for y, hx, zf, zb, c in rings:
            points += [(cx + u, y, z) for u, z in (
                (-hx + c, zb), (hx - c, zb), (hx, zb + c), (hx, zf - c),
                (hx - c, zf), (-hx + c, zf), (-hx, zf - c), (-hx, zb + c))]
        faces = [tuple(reversed(range(8))), tuple(range(8 * (len(rings) - 1), 8 * len(rings)))]
        faces += [(r * 8 + i, r * 8 + (i + 1) % 8, (r + 1) * 8 + (i + 1) % 8, (r + 1) * 8 + i)
                  for r in range(len(rings) - 1) for i in range(8)]
        solid(name, points, faces, key)

    chimney(-.4, 1.75, 1.17, 5.679, .8)
    # Forge hearth: a stone base on the paving, a projecting capstone, a back
    # mass carrying the fireback, cheeks and a corbelled lintel framing a real
    # recess, then a hood tapering to the flue under a weathering course.
    # The fireback face stays at its delivered plane: the runtime ember shader
    # reads exactly that face (applyForgeWindows).
    # Hearth body: one loft traced from its side profile (not a slab on a
    # box): footing, chamfered batter, plain body, corbel, capstone nosing.
    # Its footing is a plinth course 4 cm proud of the body, seated below the
    # flag tops with a weathered top, so the hearth stands on the paving
    # through a built step instead of meeting it in a hard line.
    lofted('Forge lofted hearth body', [
        (0, .80, 2.84, 1.29, .03), (.115, .80, 2.84, 1.29, .03), (.15, .76, 2.80, 1.29, .025),
        (.165, .70, 2.74, 1.29, .03),
        (.55, .70, 2.74, 1.29, .03), (.62, .75, 2.79, 1.29, .02), (.65, .77, 2.81, 1.29, .02),
        (.76, .77, 2.81, 1.29, .02), (.79, .745, 2.785, 1.29, .02)], 'stone')
    box('Forge hearth back mass', (-.4, 1.09, 1.8525), (1.42, .62, 1.105), 'stone')
    # Chimney breast: the joint between the hearth block and the workshop
    # wall is built, not open air, from the paving to the tile underside.
    # Left of the door it runs back into the wall face; beside the door it
    # stops in front of the door frame and sill (z .865).
    prism('Forge chimney breast', [(-1.11, 0), (0, 0), (0, under(0, .02)), (-1.11, under(1.11, .02))],
          1.31, .62, 'stone')
    prism('Forge chimney breast return', [(-.005, 0), (.31, 0), (.31, under(.31, .02)),
          (-.005, under(.005, .02))], 1.31, .875, 'stone')
    box('Forge firebox', (-.4, 1.08, 2.414), (.98, .56, .018), 'ink')
    # Firebox surround: one solid traced from the front elevation, jambs and a
    # segmental arched head; the jambs still bury the firebox side faces.
    half, rise, spring = .48, .13, 1.15
    radius = (half * half + rise * rise) / (2 * rise)
    sweep = math.asin(half / radius)
    arc = [(-.4 + radius * math.sin(-sweep + 2 * sweep * i / 8),
            spring + rise - radius + radius * math.cos(-sweep + 2 * sweep * i / 8)) for i in range(1, 8)]
    prism('Forge arched firebox surround', [(-1.12, .78), (-.88, .78), (-.88, spring)] + arc
          + [(.08, spring), (.08, .78), (.32, .78), (.32, 1.36), (-1.12, 1.36)], 2.70, 2.395, 'thatch')
    prism('Forge arch keystone', [(-.46, 1.25), (-.34, 1.25), (-.325, 1.37), (-.475, 1.37)],
          2.716, 2.69, 'thatch')
    # Hood (round 6): lathed, not built from stacked or lofted rectangles.
    # Rounds 2-5 lofted chamfered rectangular rings or stacked coursed
    # blocks, and every one still read as a box. This one is a surface of
    # revolution swept through 180 degrees round the flue axis: each ring is
    # a half superellipse in plan (rounded corners, n 4.5 at the lip, squarer
    # n 6 at the throat so it necks onto the square shaft), traced through a
    # side profile of a bed band sunk into the arch surround, a flat soffit
    # running into a rolled ovolo lip, a weathered arris, a concave bell
    # sweeping from about 35 degrees to plumb, a throat round the chimney shaft and
    # a collar weathered onto it. Its back is the plane z 1.28, buried in the
    # chimney breast. It is smooth-shaded with edges above 40 degrees kept
    # sharp (FORGE_SMOOTH_PARTS), and its UVs are its own: courses follow
    # the rings (v = meridian length), joints run round them (u = share of
    # the ring's perimeter), one ashlar period per 1.6 m of either.
    cx, zb, segments, around = -.4, 1.28, 24, 4.8
    a0, b0, lip, roll, n0 = .88, 1.60, .035, .065, 4.5
    # Bed band: front 5 mm behind the arch surround's face (never coplanar
    # with it) and 5 mm into the consoles' backs.
    profile = [(1.35, .70, 1.415, n0), (1.45, .70, 1.415, n0)]
    for phi in (-90, -60, -30, 0, 30, 60, 90):  # ovolo lip, a quarter-round each way
        d = lip + roll * math.cos(math.radians(phi))
        profile.append((1.53 + roll * math.sin(math.radians(phi)), a0 + d, b0 + d, n0))
    top_y, throat = 2.80, (.47, .96, 6.0)
    profile.append((1.64, a0, b0, n0))  # weathered arris above the roll
    for step in range(1, 9):
        t = step / 8
        f = (1 - t) ** 2.4  # concave bell: flared at the lip, plumb at the throat
        profile.append((1.64 + (top_y - 1.64) * t, throat[0] + (a0 - throat[0]) * f,
                        throat[1] + (b0 - throat[1]) * f, n0 + (throat[2] - n0) * t))
    profile += [(2.90, .47, .96, 6.0), (2.905, .52, 1.01, 6.0), (2.975, .52, 1.01, 6.0),
                (3.03, .455, .945, 8.0)]
    # Meridian length at the front centre; a ring sits exactly on each 1.6 m
    # course period so no face straddles a swatch edge.
    P = FORGE_GRID['P']
    lengths = [0.0]
    for (y0, _, b0_, _), (y1, _, b1, _) in zip(profile, profile[1:]):
        lengths.append(lengths[-1] + math.hypot(y1 - y0, b1 - b0_))
    k = 1
    while k * P < lengths[-1]:
        i = next(j for j in range(1, len(lengths)) if lengths[j] > k * P)
        if abs(lengths[i - 1] - k * P) > 1e-6:
            t = (k * P - lengths[i - 1]) / (lengths[i] - lengths[i - 1])
            profile.insert(i, tuple(p + t * (q - p) for p, q in zip(profile[i - 1], profile[i])))
            lengths.insert(i, k * P)
        k += 1

    def hood_ring(y, a, b, n):
        # Half superellipse from the back plane at +x round the front to -x,
        # resampled to equal arc length so the loft has no twist and u is fair.
        dense = []
        for i in range(721):
            th = math.pi * i / 720
            c, s = (0.0 if i == 360 else math.cos(th)), (0.0 if i in (0, 720) else math.sin(th))
            dense.append((cx + a * math.copysign(abs(c) ** (2 / n), c), zb + b * abs(s) ** (2 / n)))
        run = [0.0]
        for p, q in zip(dense, dense[1:]):
            run.append(run[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
        ring, j = [], 0
        for i in range(segments + 1):
            target = run[-1] * i / segments
            while j < len(run) - 2 and run[j + 1] < target:
                j += 1
            t = (target - run[j]) / max(run[j + 1] - run[j], 1e-12)
            ring.append((dense[j][0] + t * (dense[j + 1][0] - dense[j][0]), y,
                         dense[j][1] + t * (dense[j + 1][1] - dense[j][1])))
        ring[0], ring[-1] = (cx + a, y, zb), (cx - a, y, zb)
        return ring

    def inside(ring, x, z):
        # Point in the half ring closed by its back edge (even-odd rule).
        poly, hit = [(p[0], p[2]) for p in ring], False
        for (x0, z0), (x1, z1) in zip(poly, poly[1:] + poly[:1]):
            if (z0 > z) != (z1 > z) and x < x0 + (z - z0) * (x1 - x0) / (z1 - z0):
                hit = not hit
        return hit

    rings = [hood_ring(*p) for p in profile]
    # The square chimney shaft (x -.8..0, z 1.35..2.15) rises inside every
    # ring, and the lip's soffit covers the consoles' tops: checked, not hoped.
    for ring in rings:
        for x, z in ((-.795, 1.355), (-.005, 1.355), (-.005, 2.145), (-.795, 2.145)):
            if not inside(ring, x, z):
                raise RuntimeError('Forge hood ring at y %.3f lets the shaft through' % ring[0][1])
    m = segments + 1
    points = [p for ring in rings for p in ring]
    faces = [tuple(range(m)), tuple(range(len(points) - 1, len(points) - m - 1, -1))]
    sides, backs = [], []
    for r in range(len(rings) - 1):
        for i in range(segments):
            sides.append((r, i, (r * m + i, r * m + i + 1, (r + 1) * m + i + 1, (r + 1) * m + i)))
        backs.append((r * m + segments, r * m, (r + 1) * m, (r + 1) * m + segments))
    faces += [f for _, _, f in sides] + backs
    solid('Forge lathed bell hood', points, faces, 'thatch')
    tile = KEYS.index('thatch')

    def cell_uv(u, v, u0, v0):
        return ((tile % 4 + .03 + .94 * (u - u0) / P) / 4, (tile // 4 + .03 + .94 * (v - v0) / P) / 4)

    def planar(face, axes):
        # Metric, one period at most; the back strips (wider than a period,
        # and buried in the breast) are squeezed into one rather than wrapped.
        lows = [min(points[n][k] for n in face) for k in axes]
        fit = [min(1, P / max(max(points[n][k] for n in face) - lo, 1e-9)) for k, lo in zip(axes, lows)]
        return [cell_uv(lows[0] + (points[n][axes[0]] - lows[0]) * fit[0],
                        lows[1] + (points[n][axes[1]] - lows[1]) * fit[1], *lows) for n in face]

    uvs = [planar(faces[0], (0, 2)), planar(faces[1], (0, 2))]
    for r, i, face in sides:
        u = [around * i / segments, around * (i + 1) / segments]
        u0 = P * math.floor((u[0] + u[1]) / 2 / P)
        v0 = P * math.floor((lengths[r] + lengths[r + 1]) / 2 / P)
        uvs.append([cell_uv(u[0], lengths[r], u0, v0), cell_uv(u[1], lengths[r], u0, v0),
                    cell_uv(u[1], lengths[r + 1], u0, v0), cell_uv(u[0], lengths[r + 1], u0, v0)])
    uvs += [planar(f, (0, 1)) for f in backs]
    UVS[-len(faces):] = uvs
    # Consoles traced from a side profile (a quarter-ellipse under a flat
    # top), backs buried 1 cm in the surround face, tops 1 cm up inside the
    # hood's soffit; they project 8 cm, which the rounded lip still covers.
    console = [(2.69, 1.47), (2.69, 1.12)] + [
        (2.69 + .08 * math.sin(math.radians(t)), 1.47 - .35 * math.cos(math.radians(t))) for t in range(15, 91, 15)]
    soffit = rings[2]
    for x0, x1 in ((-1.09, -.93), (.11, .27)):
        for x in (x0, x1):
            if not inside(soffit, x, 2.77):
                raise RuntimeError('Forge hood console top-front corner at x %.2f is outside the lip' % x)
        along_x('Forge hood console', x0, x1, console, 'thatch')
    # Dressed stone door head: a lintel with a chamfered drip seated on the
    # door jambs, buried 5 mm in the wall and in the chimney breast return.
    along_x('Forge dressed door head', 0.0, 1.24,
            [(.62, 2.42), (.62, 2.57), (.88, 2.57), (.88, 2.455), (.85, 2.42)], 'thatch')
    lathe('Anvil oak stump', 1.20, 2.16, [(.38, 0), (.4, .08), (.34, .79)], 'oak', 12)
    box('Anvil foot', (1.2, .84, 2.16), (.67, .13, .37), 'iron')
    box('Anvil waist', (1.2, .99, 2.16), (.36, .2, .25), 'iron')
    box('Anvil face', (1.2, 1.145, 2.16), (.69, .13, .32), 'iron')
    prism('Anvil horn', [(1.49, 1.2), (1.95, 1.12), (1.48, 1.06)], 2.24, 2.08, 'iron')
    box('Forge lintel sign', (0, 2.95, 3.06), (3.3, .35, .13), 'timber')
    # Porch paving, modelled flag by flag instead of one slab with a painted
    # pattern: each flag is a closed stone standing on the ground through a
    # dark mortar bed, its sides battered so the joint opens from 3 cm at the
    # bed to 4 cm at the worn top. Round 6 re-lays the flags' UVs: instead of
    # sampling one metric joint grid (which painted the same grey on flag and
    # joint alike), each flag's top is its own island on one whole painted
    # stone (FORGE_FLAG_TONES), and its sides take that stone's dark arris,
    # so tone changes flag by flag and every joint reads dark. Flags are laid
    # +-6 mm proud of each other. A moulded kerb of dark dressed stones with
    # their own modelled joints holds the field. Flags hidden whole under the
    # hearth, the breast or the workshop plinth are left out. (Bytes, not
    # vertices, bind here: every unique vertex costs 32 B of a 417 kB file.)
    XA, XB, ZA, ZB, gap = -2.1575, 2.1575, .39, 3.30, .006
    # Flags and kerbs stand 3 mm, the bed 6 mm, off the datum (inside the
    # probe's 1 cm grounding tolerance), not coplanar with each other or with
    # the ground beds of the older solids. The bed is iron-dark mortar: it is
    # only ever seen at the bottom of a joint.
    box('Forge paving mortar bed', (0, .0255, (.385 + 3.31) / 2), (4.335, .039, 2.925), 'iron')

    def covered(x, z):
        return ((-1.20 <= x <= .40 and 1.29 <= z <= 2.84) or (-1.11 <= x <= .31 and .62 <= z <= 1.31)
                or (abs(x) <= 2.085 and z <= .69))

    slate = KEYS.index('slate')

    def flag(x0, x1, z0, z1, top, cell, batter=.014):
        points = []
        for y, inset in ((.003, 0), (top, batter)):
            points += [(x0 + inset, y, z0 + inset), (x1 - inset, y, z0 + inset),
                       (x1 - inset, y, z1 - inset), (x0 + inset, y, z1 - inset)]
        faces = [(3, 2, 1, 0), (4, 5, 6, 7)] + [(i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4)]
        solid('Forge porch flag', points, faces, 'stone')

        def at(fu, fv):
            # One painted stone: cell `cell` of the slate swatch's 4 x 4 grid.
            lu = (cell % 4 + .02 + .96 * fu) / 4
            lv = (cell // 4 + .02 + .96 * fv) / 4
            return ((slate % 4 + .03 + .94 * lu) / 4, (slate // 4 + .03 + .94 * lv) / 4)

        tx0, tx1, tz0, tz1 = x0 + batter, x1 - batter, z0 + batter, z1 - batter

        def fit(n):
            return (min(1, max(0, (points[n][0] - tx0) / (tx1 - tx0))),
                    min(1, max(0, (points[n][2] - tz0) / (tz1 - tz0))))

        uvs = [[at(*fit(n + 4)) for n in faces[0]], [at(*fit(n)) for n in faces[1]]]
        # Sides (edges at z0, x1, z1, x0 in turn): along the edge as on the
        # top, across it inside that stone's outer 5 %, its dark arris.
        for i, face in enumerate(faces[2:]):
            edge = (0, 1, 1, 0)[i]
            uv = []
            for n in face:
                fu, fv = fit(n)
                depth = 0 if n < 4 else .05
                if i % 2 == 0:
                    fv = depth if edge == 0 else 1 - depth
                else:
                    fu = depth if edge == 0 else 1 - depth
                uv.append(at(fu, fv))
            uvs.append(uv)
        UVS[-len(faces):] = uvs

    G, P = FORGE_GRID, FORGE_GRID['P']
    for k in range(-1, 4):
        z = G['Z0'] + k * P
        for r, depth in enumerate(FORGE_FLAGS['rows']):
            z0, z1, z = max(z, ZA), min(z + depth, ZB), z + depth
            if z1 - z0 < .1:
                continue
            cuts = sorted(G['X0'] + m * P + FORGE_FLAGS['shifts'][r] + sum(FORGE_FLAGS['widths'][r][:i])
                          for m in range(-3, 3) for i in range(3))
            cuts = [x for x in cuts if XA + .07 < x < XB - .07]
            edges = [XA] + cuts + [XB]
            for i, (x0, x1) in enumerate(zip(edges, edges[1:])):
                samples = [(x0 + (x1 - x0) * a / 4, z0 + (z1 - z0) * b / 4) for a in range(5) for b in range(5)]
                if all(covered(*q) for q in samples):
                    continue
                lift = ((k * 5 + r * 7 + i * 13) % 9 / 8 - .5) * .012  # +-6 mm, worn and relaid.
                flag(x0 + gap, x1 - gap, z0 + gap, z1 - gap, .075 + lift, (k * 11 + r * 5 + i * 7) % 16)

    def along_z(name, z0, z1, profile, key):
        n = len(profile)
        solid(name, [(x, y, z) for z in (z0, z1) for x, y in profile],
              [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
              + [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)], key)

    # Kerb: flat worn top 2.5 cm above the flags, outer chamfer.
    front = [(3.30, .003), (3.30, .10), (3.472, .10), (3.50, .072), (3.50, .003)]
    joints = [-2.3575 + 4.715 * i / 5 for i in range(6)]
    for i, (x0, x1) in enumerate(zip(joints, joints[1:])):
        along_x('Forge porch kerb', x0 + (.004 if i else 0), x1 - (.004 if i < 4 else 0), front, 'green')
    stops = [.39, 1.46, 2.50, 3.294]
    for side in (-1, 1):
        profile = [(side * x, y) for x, y in ((2.1575, .003), (2.1575, .10), (2.3295, .10),
                                              (2.3575, .072), (2.3575, .003))]
        for i, (z0, z1) in enumerate(zip(stops, stops[1:])):
            along_z('Forge porch kerb', z0 + (.006 if i else 0), z1 - (.006 if i < 2 else 0), profile, 'green')
    forge_metric_masonry()


def forge_metric_masonry():
    # Re-lay every forge stone face in world metres. solid() spreads each face
    # over a whole swatch whatever its size, which smeared courses across the
    # hood's narrow facets and blew one block pattern up over the rear wall.
    # Here faces are cut on the FORGE_GRID planes and each piece samples one
    # period: horizontal faces near the ground take the flag swatch, cell 0
    # walls the damp footing swatch, the rest the coursed swatch; dressed
    # (thatch-key) parts take the ashlar swatch on every face. Each part's
    # vertices stay contiguous (name-based smoothing reads those ranges), and
    # shared edges are split identically so solids stay closed.
    g = FORGE_GRID
    P = g['P']
    planes = [(0, g['X0'] + k * P) for k in range(-3, 4)] + \
             [(1, g['Y0'] + k * P) for k in range(1, 5)] + \
             [(2, g['Z0'] + k * P) for k in range(-1, 5)]
    game = [(x, z, -y) for x, y, z in VERTS]
    for k, c in planes:
        near = [v for part in PARTS if part['key'] in FORGE_DRESSED_KEYS
                and part['name'] not in FORGE_OWN_UV_PARTS
                for v in game[part['firstVertex']:part['firstVertex'] + part['vertexCount']]
                if abs(v[k] - c) < .004]
        if near:
            raise RuntimeError('Forge masonry plane %s=%s grazes vertices %s' % ('xyz'[k], c, near[:3]))
    owner, face_parts = 0, []
    for face in FACES:
        while not (PARTS[owner]['firstVertex'] <= face[0] < PARTS[owner]['firstVertex'] + PARTS[owner]['vertexCount']):
            owner += 1
        face_parts.append(owner)

    def cut(poly, k, c):
        lo, hi = [], []
        for i, p in enumerate(poly):
            q = poly[(i + 1) % len(poly)]
            (lo if p[k] < c else hi).append(p)
            if (p[k] < c) != (q[k] < c):
                a, b = sorted((p, q))  # Canonical order: neighbours agree exactly.
                t = (c - a[k]) / (b[k] - a[k])
                r = tuple(a[j] + t * (b[j] - a[j]) for j in range(3))
                lo.append(r)
                hi.append(r)
        return [s for s in (lo, hi) if len(s) >= 3]

    verts, faces, uvs, parts = [], [], [], []
    for index, part in enumerate(PARTS):
        start = len(verts)
        lookup = {}
        own = [(f, uv) for f, uv, o in zip(FACES, UVS, face_parts) if o == index]
        if part['key'] not in FORGE_DRESSED_KEYS or part['name'] in FORGE_OWN_UV_PARTS:
            # Untouched: same vertices, faces and UVs, re-indexed only.
            first = part['firstVertex']
            verts.extend(VERTS[first:first + part['vertexCount']])
            faces.extend(tuple(n - first + start for n in f) for f, _ in own)
            uvs.extend(uv for _, uv in own)
            parts.append(dict(part, firstVertex=start))
            continue
        for face, uv in own:
            polys = [[game[n] for n in face]]
            # Ground-bed faces are never seen, and several solids' beds are
            # coplanar at y 0: cut identically they would weld into shared,
            # non-manifold edges. They keep one piece each.
            if max(v[1] for v in polys[0]) > .001:
                for k, c in planes:
                    polys = [s for poly in polys for s in
                             (cut(poly, k, c) if min(v[k] for v in poly) < c < max(v[k] for v in poly) else [poly])]
            for poly in polys:
                indices = []
                for v in poly:
                    key = tuple(round(x, 6) for x in v)
                    if key not in lookup:
                        lookup[key] = len(verts)
                        verts.append((v[0], -v[2], v[1]))
                    if not indices or indices[-1] != lookup[key]:
                        indices.append(lookup[key])
                if len(indices) > 1 and indices[0] == indices[-1]:
                    indices.pop()
                if len(set(indices)) < 3:
                    continue
                faces.append(tuple(indices))
                normal = [0.0, 0.0, 0.0]
                for i, p in enumerate(poly):
                    q = poly[(i + 1) % len(poly)]
                    normal[0] += (p[1] - q[1]) * (p[2] + q[2])
                    normal[1] += (p[2] - q[2]) * (p[0] + q[0])
                    normal[2] += (p[0] - q[0]) * (p[1] + q[1])
                centre = [sum(v[k] for v in poly) / len(poly) for k in range(3)]
                cell = lambda k, origin: origin + P * math.floor((centre[k] - origin) / P)
                n = [abs(c) for c in normal]
                if n[1] >= max(n[0], n[2]):
                    axes = (0, 2)
                    tile = 'stone'  # The slate swatch now holds whole flags, not a metric field.
                else:
                    axes = (2 if n[0] > n[2] else 0, 1)
                    tile = 'brick' if centre[1] < g['Y0'] + P else 'stone'
                if part['key'] in FORGE_FORCED_TILES:
                    tile = part['key']  # Dressed work and kerbs keep one swatch on every face.
                origins = [cell(k, g['XYZ'[k] + '0']) for k in axes]
                if axes[1] == 1:
                    origins[1] = max(g['Y0'], origins[1])  # No plane at Y0: ground is cell 0.
                t = KEYS.index(tile)
                uvs.append([uv_at(verts[i], axes, origins, t, P) for i in indices])
        points = verts[start:]
        parts.append(dict(part, firstVertex=start, vertexCount=len(points),
                          bounds=[[min(p[k] for p in [(x, z, -y) for x, y, z in points]) for k in range(3)],
                                  [max(p[k] for p in [(x, z, -y) for x, y, z in points]) for k in range(3)]]))
    VERTS[:], FACES[:], UVS[:], PARTS[:] = verts, faces, uvs, parts


def uv_at(blender_vertex, axes, origins, tile, P):
    x, y, z = blender_vertex
    v = (x, z, -y)  # Back to game axes.
    return ((tile % 4 + .03 + .94 * (v[axes[0]] - origins[0]) / P) / 4,
            (tile // 4 + .03 + .94 * (v[axes[1]] - origins[1]) / P) / 4)


BUILDERS = dict(cottage=cottage, shop=shop, church=church, townhall=townhall, pub=pub, school=school, forge=forge, **{'canal-boat': canal_boat})
report = []
for slug, builder in BUILDERS.items():
    if a.only and slug not in a.only.split(','):
        continue
    area = 'world' if slug == 'canal-boat' else 'village'
    original = ROOT / 'assets/source/models' / area / (slug + '-tripo-original.glb')
    before = hashlib.sha256(original.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    VERTS, FACES, UVS, PARTS = [], [], [], []
    BOAT_CORNER_NORMALS.clear()
    # Per-asset state keeps coachwork variants isolated from masonry palettes.
    PALETTE = BASE_PALETTE.copy()
    if slug == 'canal-boat':
        PALETTE.update(slate=('24435c', .42), brick=('772f32', .48), green=('284c42', .55), cream=('e8dbb5', .52), rose=('b55754', .5), glass=('345b69', .2))
    if slug == 'shop':
        PALETTE['amber'] = ('bc965b', .84)
    if slug == 'townhall':
        PALETTE[CIVIC_ASHLAR_KEY] = CIVIC_ASHLAR
        PALETTE['iron'] = CIVIC_LEAD
    mat = atlas(bread_display=slug == 'shop', forge_masonry=slug == 'forge', church_slate=slug == 'church',
                boat_hull=slug == 'canal-boat', shop_pantile=slug == 'shop', civic_ashlar=slug == 'townhall',
                civic_slate=slug == 'townhall', civic_plaster=slug == 'townhall', pub_thatch=slug == 'pub',
                pub_plaster=slug == 'pub')
    builder()
    mesh = bpy.data.meshes.new(slug + ' planar architecture')
    mesh.from_pydata(VERTS, [], FACES)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name='UVMap')
    for face, coords in zip(mesh.polygons, UVS):
        for loop, value in zip(face.loop_indices, coords):
            uv.data[loop].uv = value
    # Correct every closed component's winding independently. Every surface has
    # a physical underside rather than relying on a two-sided preview material.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for part in PARTS:
        if part['name'] in ('Civic curving ogee cupola', 'School swept bell cap', 'School open bronze bell', 'Bell clapper ball', 'Pub hollow rolled flue pot', 'Hollow village chimney pot', 'Mushroom brass roof vent', 'Boat recessed stove pipe', 'Boat stove rain hood', 'Shop display display loaf'):
            lo, hi = part['firstVertex'], part['firstVertex'] + part['vertexCount']
            for polygon in mesh.polygons:
                if all(lo <= v < hi for v in polygon.vertices):
                    polygon.use_smooth = True
        limit = FORGE_SMOOTH_PARTS.get(part['name'])
        if limit is None and slug == 'shop':
            limit = SHOP_SMOOTH_PARTS.get(part['name'])
        if limit is None and slug == 'canal-boat':
            limit = BOAT_SMOOTH_PARTS.get(part['name'])
        if limit is None and slug == 'pub':
            limit = PUB_SMOOTH_PARTS.get(part['name'])
        if limit is not None:
            # Smooth the part, but keep every edge sharper than `limit`
            # degrees sharp: the exporter splits normals along sharp edges.
            lo, hi = part['firstVertex'], part['firstVertex'] + part['vertexCount']
            normals = {}
            for polygon in mesh.polygons:
                if all(lo <= v < hi for v in polygon.vertices):
                    polygon.use_smooth = True
                    for key in polygon.edge_keys:
                        normals.setdefault(key, []).append(polygon.normal.copy())
            sharp = mesh.attributes.get('sharp_edge') or mesh.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
            for edge in mesh.edges:
                pair = normals.get(tuple(sorted(edge.vertices)))
                if pair and (len(pair) != 2 or pair[0].angle(pair[1]) > math.radians(limit)):
                    sharp.data[edge.index].value = True
    obj = bpy.data.objects.new(slug + ' authored architecture', mesh)
    bpy.context.collection.objects.link(obj)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    lo = [min(v.co[k] for v in mesh.vertices) for k in range(3)]
    hi = [max(v.co[k] for v in mesh.vertices) for k in range(3)]
    width, height, length = ENVELOPES[slug]
    dims = (width, length, height)
    ratios = [dims[k] / (hi[k] - lo[k]) for k in range(3)]
    if any(abs(r - 1) > .12 for r in ratios):
        raise RuntimeError(slug + ' needs explicit envelope design: ' + str(ratios))
    for v in mesh.vertices:
        for k in range(3):
            v.co[k] = (v.co[k] - lo[k]) * ratios[k] - (dims[k] / 2 if k < 2 else 0)
    mesh.update()
    if BOAT_CORNER_NORMALS:
        # The boat's lines-plan normals, written as free corner normals after
        # the envelope fit (inverse-transpose of the per-axis ratios), over the
        # angle-derived ones. Every corner not listed keeps its float exactly.
        normals = [tuple(c.vector) for c in mesh.corner_normals]
        opposed = written = 0
        for polygon in mesh.polygons:
            own = BOAT_CORNER_NORMALS.get(polygon.index)
            if not own:
                continue
            for li in polygon.loop_indices:
                game = own.get(mesh.loops[li].vertex_index)
                if game is None:
                    continue
                nb = Vector((game[0] / ratios[0], -game[2] / ratios[1], game[1] / ratios[2])).normalized()
                opposed += nb.dot(polygon.normal) < -.01
                normals[li] = tuple(nb)
                written += 1
        if opposed:
            raise RuntimeError(slug + ' lines-plan normals oppose ' + str(opposed) + ' face windings')
        custom = mesh.attributes.new('custom_normal', 'FLOAT_VECTOR', 'CORNER')
        custom.data.foreach_set('vector', [c for n in normals for c in n])
        mesh.update()
        print('LINES-PLAN NORMALS', slug, written, 'corners', flush=True)
    # The component inventory is source proof, not a replacement for delivery rays.
    obj['construction'] = 'authored-planar-village-v1'
    obj['providerVerticesRetained'] = 0
    out = ROOT / 'assets/source/models' / area / (slug + '-crafted.glb')
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                             export_yup=True, export_animations=False, export_extras=True)
    assert hashlib.sha256(original.read_bytes()).hexdigest() == before
    mesh.calc_loop_triangles()
    report.append({'id': area + '-' + slug, 'sourceSha256': before,
                   'outputSha256': hashlib.sha256(out.read_bytes()).hexdigest(),
                   'output': str(out.relative_to(ROOT)), 'triangles': len(mesh.loop_triangles),
                   'extent': ENVELOPES[slug], 'fitRatiosBlender': ratios, 'parts': PARTS,
                   'providerVerticesRetained': 0})
    REPORT.write_text(json.dumps(report, indent=2) + '\n')
    print('AUTHORED', slug, len(mesh.loop_triangles), 'triangles', flush=True)
