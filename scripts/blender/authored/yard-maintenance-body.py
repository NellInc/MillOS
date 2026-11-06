"""Yard maintenance garage body (world-yard-maintenance-body), built from scratch in headless Blender.

What it builds
--------------
The truck maintenance garage in the service yard (TruckBay.tsx MaintenanceBay,
GLB placed at [-0.182943583, -0.289999992, 0.519999981] inside the component
group). Delivered at its final metric size, 12.8141 W x 8.09 H x 12.04 D m,
origin at the ground centre, three.js +Z = front (the bay doors). Everything is
authored in the component frame (the fallback primitives' frame,
TruckBay.tsx:5491-5573) and shifted by -OFFSET on export, so every runtime
anchor can be read off directly. One node `Yard-maintenance-bodyBody`, one
material (single-sided), one primitive. Base colour is COLOR_0 (the identity
hexes per part, per-panel tone and baked occlusion) times a generated 1024 px
weathering multiplier (sRGB JPEG). The cladding and the roof sample full-width
bands that tile in u under REPEAT wrap: profiled cladding every 4 m (256 px/m:
worn panel edges at the ribs, two minor stiffeners per pan, rain streaks, a
ragged dirt band and splash rising from the plinth, cast-concrete plinth with
joints) and standing-seam slate every 5.4 m along the ridge (crisp seams with a
shadow side, sheet tone, a bleached ridge and a heavy eave margin, lichen,
run-off). Every band term is periodic in u. The door leaves have their own
region (per-leaf and per-section tone, reveal occlusion at the head and jambs).
Vertex colours of mapped regions are divided by the region's mean multiplier so
the identity hexes hold on average. A 256 px roughness/metal map shares the UV
set and the wrap. No normal map.

* shell      walls planar at x = +-6 and z = +-5. The back and both side walls
             are laid as one face per cladding panel between the ribs (35
             panels), each with its own flat tone and hue (zero-mean jitter, an
             occasional fresher replacement sheet) and occlusion baked toward its
             top (on the back gable it follows the roof's underside). The back
             panels and their ribs run up INTO the roof slab underside, so the back
             gable is the same clad wall as below it (no flashing line, no separate
             triangle); the front gable runs up into the slabs too. The front wall
             shows only above the facade, under the canopy.
* cladding   V-profile ribs at 1 m pitch on the back and both side walls,
             split round the runtime glazing, the louvre and the doors and
             cabinet, their crests worn pale; an eave flashing line on the sides
             and back and square corner trims at the four corners.
* plinth     a 0.15 m dark base course to y 0.76 (carried across the facade), cut
             at the bay doors and the personnel door (vehicles and people walk in at ground level), with a
             pale galvanised drip cap sloping out over its edge and turned down in
             a lip, mitred at the corners: a bright line over a shadow between
             cladding and plinth.
* roof       two slate slabs at MAINTENANCE_BAY_SHELL's section (eaves x +-6.2241
             at y 6.0823, slope 0.1 rad, back gable z -5.4) that run on unbroken to
             a front gable at z 6.48: the canopy IS the main roof, one profile from
             every side. Verge boards on both gables hang 0.06 m below the slabs; a
             hipped ridge cap runs z -5.5 (the -Z extreme) to 6.53.
* facade     the front wall is built thick (face z 5.55) and the two openings are
             cut through it, so the doors stand 44 cm back in the wall's own
             reveal: jamb returns and head soffit with occlusion baked across
             them, a pale mitred architrave on the arris, pale guide tracks in the
             reveal corners at the door plane, a galvanised lintel band over both
             heads, a sloped top ledge, and the plinth's base course run across
             the front. Yellow guards on the centre pier.
* doors      each door is a frame-and-panel leaf: a flat infill at z 5.11 (the
             runtime panes sit on it) cut per section with its own tone, rails 3 cm
             proud along the joints and four stiles 5.5 cm proud crossing them, so
             the leaf is a grid of panels (three glazed columns between two blank
             ones); a pale aluminium bottom bar over a black seal; pale guide
             channels 16 cm wide standing 26 cm out of the door plane up each jamb.
* canopy     the extended roof's front is carried by a deep beam (soffit y 5.12)
             whose face is the front gable: a pediment from the soffit up into the
             slab underside, so verge, pediment and sign read as one gable end.
             The runtime canopy lamps (+-5, 5.5, 5.3) sit on the facade's sloped
             top ledge under it.
* columns    two turned columns (8-sided lathe, a flat to the front) standing free
             at x +-5.35, 40 cm clear of the facade corner: a square concrete pier,
             yellow / black / yellow hazard bands, a pale galvanised shaft tapering
             0.60 -> 0.52 m, a conical capital flaring to 0.88 m, a cap plate wider
             than the beam is deep, and two gusset brackets along the beam soffit.
* sign       a dark board 15 cm proud of the pediment with the gold band 5 x 0.72 m
             flush in it, face z 6.54 (the +Z extreme; the runtime prints
             MAINTENANCE at z 6.55).
* +X wall    the personnel door with frame, step, kick plate and brass knob;
             dark frames and a sill round the runtime glazing pane (x 6.01,
             z -2.8..0.6, y 2.45..3.95); flat wall where the runtime louvre goes.
* -X wall    the tall service cabinet whose -X face is flat at x -6.59 (the -X
             extreme; the runtime screen and two lamps sit on it) with painted
             vent slots, a drip cap, a pad and a conduit into the wall; frames
             round the second glazing pane.
* vent       a lathe-turned stack (10 sides) on a broad flashing collar sheared to
             the 0.1 rad roof pitch and sunk into the slab; a rain hat (12 sides)
             more than twice the stack's width, with a dark underside, a
             turned-down lip whose inner face and bottom show from below, a pale
             lip band and lit chamfer, and a shallow cone (apex y 7.80, the +Y
             extreme). The stack rim sits inside the hat. No floating parts.
* interior   none: the four red tool cabinets stood behind the closed, opaque
             doors and showed in no view (build_tool_cabinets is kept, not called).

Everything that reaches the ground in the game is carried down to y -0.29,
the GLB's ground plane, so the delivered file sits on its own ground; in the
game that 0.29 m is below grade.

Budget (contract 4020 render vertices = 1340 triangles): asserted below.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-maintenance-body.py -- <out.glb>

Re-runnable and deterministic (seeded). Writes only <out.glb>; the two
textures are staged in a temporary directory that is removed afterwards.
"""

import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
import numpy as np

NODE_NAME = 'Yard-maintenance-bodyBody'
MESH_NAME = 'yard-maintenance-body-mesh'
MATERIAL_NAME = 'yard-maintenance-body-surface'
SCENE_NAME = 'MillOS_World_Yard-maintenance-body'
MAX_TRIANGLES = 1340
JPEG_QUALITY = 88

# Component frame -> GLB frame.
OFFSET = np.array([-0.182943583, -0.289999992, 0.519999981])
Y0 = OFFSET[1]                       # the GLB ground, in the component frame
# Contract (asset-manifest.json): width, height, length ranges; ground/centre 1 mm.
CONTRACT = {'width': (12.8131, 12.8151), 'height': (8.089, 8.091), 'length': (12.039, 12.041)}

# ---------------------------------------------------------------- dimensions (component frame)
WX, WZ = 6.0, 5.0                    # wall faces
EAVE_WALL, GABLE_PEAK = 5.95, 6.55   # wall tops, both inside the roof slabs
PLINTH_TOP, PLINTH_OUT = 0.76, 0.15
SLOPE = 0.1                          # roof pitch, rad (MAINTENANCE_BAY_SHELL.roofSlope)
ROOF_CX, ROOF_CY, ROOF_HX, ROOF_HY = 3.05, 6.25, 3.175, 0.15
# The main slabs run on unbroken over the canopy: back gable z -5.4 (as
# MAINTENANCE_BAY_SHELL records it), front gable z 6.48, so the canopy IS the roof.
ROOF_Z0, ROOF_Z1 = -5.4, 6.48
ROOF_ZC, ROOF_HZ = (ROOF_Z0 + ROOF_Z1) / 2, (ROOF_Z1 - ROOF_Z0) / 2
RIDGE_Z1 = 6.53                      # ridge cap front end, flush with the front verge
RIDGE_HZ = 5.5
TRIM_Y0, TRIM_Y1 = 5.52, 5.85        # eave flashing (top tucked into the slab)
RIB_W, RIB_D, RIB_PITCH = 0.08, 0.04, 1.0   # V-profile ribs: base width, height proud of the wall
CORNER = 0.12                        # corner trim reaches this far along each wall
DOOR_FACE, DOOR_BACK = 5.11, 4.91   # door face: the runtime 3 x 3 panes sit on it (z 5.11-5.13)
DOOR_TOP = 5.06                      # the leaf runs up behind the header
# Sectional joints at a 0.8 m pitch, centred in the gaps between the runtime pane rows
# (1.65-2.15, 2.45-2.95, 3.25-3.75); every joint (j-0.15 .. j+0.15) stays clear of them.
JOINTS = (0.7, 1.5, 2.3, 3.1, 3.9, 4.7)
# Frame-and-panel leaf: a flat infill at the pane plane, rails proud along the joints and
# stiles prouder still, so each door is a grid of panels. Stiles sit at these offsets from
# each door's centre (x +-3), in the gaps between the runtime pane columns (c-1.05..-0.55,
# -0.25..0.25, 0.55..1.05); rails sit on the joints, in the gaps between the pane rows.
STILES, STILE_HALF, STILE_Z = (-1.30, -0.40, 0.40, 1.30), 0.06, 5.165
RAIL_HALF, RAIL_Z = 0.05, 5.14
BAR_Y = (0.08, 0.30)                 # aluminium bottom bar over the rubber seal
HEADER_Y0 = 4.98                     # opening head
# Front facade: the front wall is thick, its face at z 5.55, and the two openings are cut
# through it, so the doors (face 5.11) stand 44 cm back in the wall's own reveal.
FACADE_Z, FACADE_X = 5.55, 6.06
TRIM_Z, TRIM_W = 5.575, 0.11         # architrave round each opening, 2.5 cm proud
LINTEL_Y1 = 5.375                    # lintel band to the top ledge; the runtime canopy lamps sit on the ledge
BASE_Z = FACADE_Z + 0.06             # front base course, continuing the plinth across the front
OPENINGS = ((-5.0, -1.0), (1.0, 5.0))
# Canopy: the extended roof is carried at its front by a deep beam whose face is a
# pediment filling up to the slab underside (the front gable), on two free-standing columns.
BEAM_Y0, BEAM_Z, BEAM_X = 5.12, (5.80, 6.40), 6.12   # soffit; back and face; half span
SIGN = (-2.5, 2.5, 5.19, 5.91, 6.39, 6.54)   # gold x0 x1 y0 y1, board back, face (the +Z extreme)
BOARD_X, BOARD_Y0, BOARD_Y1 = 2.62, 5.14, 5.95
# Turned columns (8-sided lathe, a flat to the front) standing free of the facade under
# the beam: a square concrete pier, hazard bands, a pale tapered shaft, a flared capital, a cap
# plate and two gusset brackets along the beam.
POST_X, POST_Z, POST_SEGS = 5.35, 6.08, 8
DRUM_R, DRUM_TOP = 0.42, 0.55          # square concrete pier: half size, top
CAP_PLATE = (0.44, 0.42, 4.98)       # half x, half z, bottom y (top tucks into the beam soffit)
VENT_X, VENT_Z, VENT_Y, CAP_Y = 2.8, -1.2, 7.05, 7.72
VENT_SEGS, HAT_SEGS = 10, 10
PANE_Z, PANE_Y = (-2.8, 0.6), (2.45, 3.95)
PDOOR_Z, PDOOR_TOP = (1.05, 3.35), 2.7
CAB = (-6.59, -5.99, 0.0, 3.3, 1.7, 3.5)     # x0 x1 y0 y1 z0 z1

# ---------------------------------------------------------------- palette (sRGB hex) and finishes
HEX = {
    'wall': '#536873', 'rib': '#5e7480', 'plinth': '#31444c', 'trim': '#718087',
    'roof': '#2d3d43', 'soffit': '#3a4b52', 'ridge': '#718087', 'canopy': '#33454d',
    'fascia': '#3b4e56', 'post': '#566c76', 'door': '#374151', 'joint': '#4a5566',
    'lintel': '#7d8a90', 'archi': '#93a0a6',
    'track': '#6a757d', 'seal': '#16191c', 'concrete': '#7f827d', 'jamb': '#4a5e67',
    'jambret': '#3a4b52', 'soffitret': '#2a383e', 'arris': '#8a989e', 'doorlit': '#5d6a7c',
    'doordark': '#1c2229', 'beam': '#3a4f57', 'rail': '#7b868d',
    'pier': '#4a5f69', 'guard': '#e0b030', 'gold': '#dca736', 'signframe': '#26343a',
    'pdoor': '#29383e', 'brass': '#d8b64c', 'kick': '#8c979c', 'glazframe': '#2a3a40',
    'sill': '#56656c', 'cabinet': '#68757a', 'cabcap': '#2d3d43', 'slot': '#2a3236',
    'conduit': '#4d5b61', 'red': '#dc2626', 'vent': '#617078', 'cap': '#38484f',
    'caprim': '#7c8b92', 'capdome': '#425359', 'steel': '#6f7c82',
    'drip': '#9aa5aa', 'trackface': '#8d989e', 'colpale': '#a2acb0', 'hazblack': '#22262a',
}
# finish -> (roughness, metalness); one flat tile each in the texture layout below.
FINISH = [
    ('shell', .76, .08), ('plinth', .86, .0), ('trim', .48, .58), ('roof', .60, .42),
    ('canopy', .58, .38), ('post', .50, .52), ('door', .50, .20), ('gold', .48, .16),
    ('brass', .35, .70), ('cabinet', .58, .28), ('rubber', .92, .0), ('paint', .55, .10),
    ('vent', .45, .62), ('cap', .52, .52), ('frame', .40, .50), ('concrete', .90, .0),
]
FIN = {name: (r, m) for name, r, m in FINISH}

# ---------------------------------------------------------------- texture layout (1024 px, v up)
# Two textures share one UV set: a weathering multiplier on the base colour
# (sRGB JPEG; glTF multiplies it by COLOR_0) and a roughness/metal map. Big
# surfaces get their own metric regions; everything else samples a flat tile
# (multiplier 1.0) whose roughness/metal is its finish.
TEX, ORM_SIZE = 1024, 256
# The cladding and the roof sample full-width bands that tile in u (REPEAT wrap):
# the cladding every 4 m along any wall (256 px/m), the roof every 5.4 m along the
# ridge (190 px/m). Every term in a band is periodic in u. Per-panel tone lives in
# the vertex colours, so the repeat does not show as a repeat.
R_CLAD = (0, 8, 1024, 400)                                       # all clad walls and the plinths
R_ROOF = (0, 424, 1024, 680)                                     # both slabs, canopy run included
R_DOOR = (400, 704, 1016, 1016)                                  # both bay door leaves, x -5.05..5.05
FLAT0, FLAT_TILE = (16, 712), 56
CLAD_PERIOD, ROOF_PERIOD = 4.0, 5.4
WALL_YR = (-0.32, 6.62)                           # band height range (m)
ROOF_DR = (-0.2, 6.4)                             # out from the ridge (m)
DOOR_TR, DOOR_YR = (-5.05, 5.05), (-0.32, 5.08)
TILE = {name: i for i, (name, _, _) in enumerate(FINISH)}


def lin(hex_):
    c = np.array([int(hex_[i:i + 2], 16) for i in (1, 3, 5)], np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


COL = {k: lin(v) for k, v in HEX.items()}

FACES = []
PART = {'name': 'misc', 'map': None}
# texture-mean compensation per mapped region (set by build_textures before geometry)
COMP = {'wall': np.ones(3), 'plinth': np.ones(3), 'roof': np.ones(3), 'door': np.ones(3)}


def part(name, mapping=None):
    """Name the part being built and the texture region its faces sample (None: a flat tile)."""
    PART['name'] = name
    PART['map'] = mapping


def mapped(mapping):
    PART['map'] = mapping


def add_face(pts, colour, finish, outward, group=None, smooth=False):
    pts = np.array(pts, dtype=np.float64)
    n = np.zeros(3)
    for i in range(len(pts)):  # Newell normal
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    if np.linalg.norm(n) < 1e-12:
        return
    if np.dot(n, outward) < 0:
        pts = pts[::-1]
        n = -n
    n /= np.linalg.norm(n)
    if callable(colour):
        cols = [colour(p) for p in pts]
    else:
        cols = [np.asarray(colour)] * len(pts)
    FACES.append({'pts': pts, 'cols': cols, 'finish': finish, 'n': n, 'group': group,
                  'smooth': smooth, 'part': PART['name'], 'map': PART['map']})


AXES = {'+x': np.array([1., 0, 0]), '-x': np.array([-1., 0, 0]), '+y': np.array([0, 1., 0]),
        '-y': np.array([0, -1., 0]), '+z': np.array([0, 0, 1.]), '-z': np.array([0, 0, -1.])}


def box(x0, x1, y0, y1, z0, z1, colour, finish, faces='+x -x +y -y +z -z'):
    """Axis-aligned box; only the named faces are built (hidden faces are left out)."""
    lo, hi = np.array([x0, y0, z0]), np.array([x1, y1, z1])
    c = (lo + hi) / 2
    for key in faces.split():
        d = AXES[key]
        ax = int(np.argmax(np.abs(d)))
        o = [i for i in range(3) if i != ax]
        v = hi[ax] if d[ax] > 0 else lo[ax]
        quad = []
        for a, b in ((0, 0), (1, 0), (1, 1), (0, 1)):
            p = np.zeros(3)
            p[ax] = v
            p[o[0]] = (lo, hi)[a][o[0]]
            p[o[1]] = (lo, hi)[b][o[1]]
            quad.append(p)
        add_face(quad, colour, finish, d)


def obox(centre, ax, ay, az, h, colour, finish, faces='+x -x +y -y +z -z'):
    """Oriented box: unit axes ax, ay, az; half sizes h; faces named in local axes."""
    centre = np.asarray(centre, np.float64)
    A = [np.asarray(ax, np.float64), np.asarray(ay, np.float64), np.asarray(az, np.float64)]
    for key in faces.split():
        sgn = 1.0 if key[0] == '+' else -1.0
        i = 'xyz'.index(key[1])
        o = [j for j in range(3) if j != i]
        fc = centre + A[i] * h[i] * sgn
        quad = [fc + A[o[0]] * h[o[0]] * s0 + A[o[1]] * h[o[1]] * s1
                for s0, s1 in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        add_face(quad, colour, finish, A[i] * sgn)


LATHE_ID = [0]


def lathe(centre, axis, runs, segs, colour, finish, shear=None, phase=0.0):
    """Revolve profile runs of (r, h[, shear]) about axis through centre.

    Each run is smooth-shaded; runs meet at hard edges. Profiles go with the
    solid on the left of travel in the (r, h) plane, so the outward normal of a
    segment is (dh, -dr).
    """
    LATHE_ID[0] += 1
    centre = np.asarray(centre, np.float64)
    a = np.asarray(axis, np.float64)
    a = a / np.linalg.norm(a)
    u = np.cross(a, [0, 0, 1.0]) if abs(a[2]) < 0.9 else np.cross(a, [1.0, 0, 0])
    u /= np.linalg.norm(u)
    v = np.cross(a, u)

    def point(r, h, th, sh):
        p = centre + a * h + (u * math.cos(th) + v * math.sin(th)) * r
        if sh and shear is not None:
            p = shear(p)
        return p

    for ri, run in enumerate(runs):
        group = (LATHE_ID[0], ri)
        for i in range(len(run) - 1):
            p0, p1 = run[i], run[i + 1]
            r0, h0, s0 = p0[0], p0[1], (p0[2] if len(p0) > 2 else False)
            r1, h1, s1 = p1[0], p1[1], (p1[2] if len(p1) > 2 else False)
            nr, nh = (h1 - h0), -(r1 - r0)
            for j in range(segs):
                t0 = phase + 2 * math.pi * j / segs
                t1 = phase + 2 * math.pi * (j + 1) / segs
                tm = (t0 + t1) / 2
                out = (u * math.cos(tm) + v * math.sin(tm)) * nr + a * nh
                q = []
                if r0 > 1e-9:
                    q += [point(r0, h0, t0, s0), point(r0, h0, t1, s0)]
                else:
                    q += [point(0, h0, 0, s0)]
                if r1 > 1e-9:
                    q += [point(r1, h1, t1, s1), point(r1, h1, t0, s1)]
                else:
                    q += [point(0, h1, 0, s1)]
                add_face(q, colour, finish, out, group=group, smooth=True)


# ---------------------------------------------------------------- roof plane helpers
def slab_axes(side):
    th = -side * SLOPE
    return (np.array([math.cos(th), math.sin(th), 0.0]), np.array([-math.sin(th), math.cos(th), 0.0]),
            np.array([0.0, 0.0, 1.0]))


def roof_top_y(x):
    """y of the top face of the slab covering x (x >= 0 uses the +X slab)."""
    side = 1 if x >= 0 else -1
    ax, ay, _ = slab_axes(side)
    c = np.array([side * ROOF_CX, ROOF_CY, 0.0])
    p0 = c + ay * ROOF_HY
    # the top face is the plane through p0 with normal ay
    return p0[1] - (ay[0] * (x - p0[0])) / ay[1]


def roof_under_y(x):
    """y of the UNDERSIDE of the slab covering x."""
    side = 1 if x >= 0 else -1
    ax, ay, _ = slab_axes(side)
    c = np.array([side * ROOF_CX, ROOF_CY, 0.0])
    p0 = c - ay * ROOF_HY
    return p0[1] - (ay[0] * (x - p0[0])) / ay[1]


def eave_corner():
    ax, ay, _ = slab_axes(1)
    return np.array([ROOF_CX, ROOF_CY, 0.0]) + ax * ROOF_HX + ay * ROOF_HY


# ---------------------------------------------------------------- parts
def wall_shade(base, top_gain=1.02, base_gain=0.94, comp=None):
    """Gentle base-to-eave ramp; the weathering itself is in the multiplier texture."""
    k = np.ones(3) if comp is None else comp

    def f(p):
        t = min(max((p[1] - Y0) / (GABLE_PEAK - Y0), 0.0), 1.0)
        return base * k * (base_gain + (top_gain - base_gain) * t)
    return f


def ground_shade(base, y_top, low=0.80):
    """Darker toward the foot (splash and wheel dirt), full colour at y_top."""
    def f(p):
        t = min(max((p[1] - Y0) / (y_top - Y0), 0.0), 1.0)
        return base * (low + (1.0 - low) * t)
    return f


PAN_Y0, PAN_Y1 = PLINTH_TOP - 0.02, TRIM_Y0 + 0.02
GABLE_TUCK = 0.04                    # back panels and ribs end this far inside the slab underside


def pan_colour(v, hue, eave):
    """One cladding panel: its own flat value and hue (zero-mean jitter, so the
    identity hex holds), and occlusion baked toward its top: it darkens by `eave`
    up to the eave (on the back gable, up to the roof's underside, so the shade
    follows the pitch). The dirt band at the foot is in the clad texture."""
    base = COL['wall'] * COMP['wall'] * (1.0 + v) * np.array([1.0 + hue, 1.0, 1.0 - hue])

    def f(p):
        t = min(max((p[1] - PAN_Y0) / (PAN_Y1 - PAN_Y0), 0.0), 1.0)
        return base * ((1.0 + eave / 2) - eave * t)
    return f


def build_shell():
    """Clad walls (back, +X, -X) are laid as one face per panel between the
    ribs, each with its own tone; the front wall shows only beside the portal
    and above the canopy."""
    part('shell', 'wall')
    rng = np.random.default_rng(97)
    walls = {
        '+x': [-5.0] + [round(-4.5 + i * RIB_PITCH, 3) for i in range(10)] + [5.0],
        '-x': [-5.0] + [round(-4.5 + i * RIB_PITCH, 3) for i in range(10)] + [5.0],
        '-z': [-6.0] + [round(-5.5 + i * RIB_PITCH, 3) for i in range(12)] + [6.0],
    }
    for wall, cuts in walls.items():
        nrm, _ = WALL_FRAME[wall]
        for k in range(len(cuts) - 1):
            v = rng.uniform(-0.18, 0.18)
            hue = rng.uniform(-0.06, 0.06)
            if rng.random() < 0.15:          # a replacement sheet: fresher and bluer
                v, hue = 0.22, -0.07
            col = pan_colour(v, hue, rng.uniform(0.14, 0.22))
            a0, a1 = cuts[k], cuts[k + 1]
            if wall == '-z':
                # back wall: each panel runs up into the roof slab, so the gable is
                # the same clad wall as below it (no flashing line, no separate triangle)
                top = [wall_point(wall, 0.0, a1, roof_under_y(a1) + GABLE_TUCK)]
                if a0 < 0.0 < a1:
                    top.append(wall_point(wall, 0.0, 0.0, roof_under_y(0.0) + GABLE_TUCK))
                top.append(wall_point(wall, 0.0, a0, roof_under_y(a0) + GABLE_TUCK))
                add_face([wall_point(wall, 0.0, a0, PAN_Y0), wall_point(wall, 0.0, a1, PAN_Y0)] + top,
                         col, 'shell', nrm)
                continue
            add_face([wall_point(wall, 0.0, a0, PAN_Y0), wall_point(wall, 0.0, a1, PAN_Y0),
                      wall_point(wall, 0.0, a1, PAN_Y1), wall_point(wall, 0.0, a0, PAN_Y1)], col, 'shell', nrm)
    # front: above the facade's top ledge, under the porch and up into the main slabs
    shade = wall_shade(COL['wall'], 0.86, 0.80, comp=COMP['wall'])
    add_face([(-WX, LINTEL_Y1, WZ), (WX, LINTEL_Y1, WZ), (WX, EAVE_WALL, WZ), (0.0, GABLE_PEAK, WZ),
              (-WX, EAVE_WALL, WZ)], shade, 'shell', AXES['+z'])


def build_plinth():
    part('plinth', 'wall')
    c, f = COL['plinth'] * COMP['plinth'], 'plinth'
    o = PLINTH_OUT
    t = PLINTH_TOP
    box(-WX - o, WX + o, Y0, t, -WZ - o, -WZ + 0.05, c, f, '-z +y +x -x')
    box(-WX - o, -WX + 0.05, Y0, t, -WZ + 0.05, WZ, c, f, '-x +y')
    # +X side, cut at the personnel door
    box(WX - 0.05, WX + o, Y0, t, -WZ + 0.05, 0.93, c, f, '+x +y +z')
    box(WX - 0.05, WX + o, Y0, t, 3.47, WZ, c, f, '+x +y -z')
    # front base course: the plinth carried across the facade, cut at the two openings
    # (its sides there are part of the reveals, shaded deeper toward the doors)
    cuts = [(-WX - o, OPENINGS[0][0]), (OPENINGS[0][1], OPENINGS[1][0]), (OPENINGS[1][1], WX + o)]
    for x0, x1 in cuts:
        add_face([(x0, Y0, BASE_Z), (x1, Y0, BASE_Z), (x1, t, BASE_Z), (x0, t, BASE_Z)], c, f, AXES['+z'])
        add_face([(x0, t, WZ), (x1, t, WZ), (x1, t, BASE_Z), (x0, t, BASE_Z)], c, f, AXES['+y'])
    for sx in (-1, 1):
        x = sx * (WX + o)
        add_face([(x, Y0, WZ), (x, Y0, BASE_Z), (x, t, BASE_Z), (x, t, WZ)], c, f, AXES['+x'] * sx)
    part('plinth')
    for xa, xb in OPENINGS:
        for x, d in ((xa, '+x'), (xb, '-x')):
            add_face([(x, Y0, DOOR_FACE - 0.01), (x, Y0, BASE_Z), (x, t, BASE_Z), (x, t, DOOR_FACE - 0.01)],
                     reveal_shade(COL['plinth'], BASE_Z), f, AXES[d])
    build_drip_cap()


def reveal_shade(base, z_out, lo=0.40, hi=0.92):
    """Occlusion baked across a reveal: dark where it meets the door, light at the arris."""
    def f(p):
        t = min(max((p[2] - DOOR_FACE) / (z_out - DOOR_FACE), 0.0), 1.0)
        return base * (lo + (hi - lo) * t)
    return f


def drip_run(p0, p1, n, mitre0, mitre1):
    """One straight run of the plinth drip cap: a pale galvanised sill that
    slopes from inside the wall out over the plinth's edge and turns down in a
    lip, so a bright line with a shadow under it separates cladding from plinth.
    p0, p1: (x, z) on the wall line; n: outward (x, z); mitres at outer corners."""
    p0, p1, n = np.array(p0, float), np.array(p1, float), np.array(n, float)
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    r = PLINTH_OUT + 0.035
    i0, i1 = p0 - n * 0.01, p1 - n * 0.01
    o0 = p0 + n * r - (d * r if mitre0 else 0)
    o1 = p1 + n * r + (d * r if mitre1 else 0)
    y_in, y_out, y_lip = PLINTH_TOP + 0.05, PLINTH_TOP + 0.012, PLINTH_TOP - 0.055
    up = np.array([n[0] * 0.3, 1.0, n[1] * 0.3])
    add_face([(i0[0], y_in, i0[1]), (i1[0], y_in, i1[1]), (o1[0], y_out, o1[1]), (o0[0], y_out, o0[1])],
             COL['drip'], 'trim', up)
    add_face([(o0[0], y_out, o0[1]), (o1[0], y_out, o1[1]), (o1[0], y_lip, o1[1]), (o0[0], y_lip, o0[1])],
             COL['drip'] * 0.82, 'trim', np.array([n[0], 0.0, n[1]]))


def build_drip_cap():
    part('drip')
    drip_run((-WX, -WZ), (WX, -WZ), (0, -1), True, True)            # back
    drip_run((-WX, -WZ), (-WX, BASE_Z), (-1, 0), True, False)       # -X side, on to the base course
    drip_run((WX, -WZ), (WX, 0.93), (1, 0), True, False)            # +X side, to the personnel door
    drip_run((WX, 3.47), (WX, BASE_Z), (1, 0), False, False)


WALL_FRAME = {  # outward normal, along-wall axis; a point is wall_point(wall, n, t, y)
    '+x': (np.array([1., 0, 0]), np.array([0, 0, 1.])),
    '-x': (np.array([-1., 0, 0]), np.array([0, 0, 1.])),
    '-z': (np.array([0, 0, -1.]), np.array([1., 0, 0])),
}


def wall_point(wall, n, t, y):
    if wall == '+x':
        return (WX + n, y, t)
    if wall == '-x':
        return (-WX - n, y, t)
    return (t, y, -WZ - n)


def rib(wall, a, s0, s1, colour, caps):
    """One V-profile cladding rib: two lit flanks meeting at a crease RIB_D proud."""
    nrm, tdir = WALL_FRAME[wall]
    hw = RIB_W / 2
    sec = [(-0.01, a - hw), (RIB_D, a), (-0.01, a + hw)]   # (n, t)
    base_col = colour

    def colour(p):   # edge wear: the crest is worn pale, the root stays the rib colour
        n = (p[0] - WX) if wall == '+x' else ((-WX - p[0]) if wall == '-x' else (-WZ - p[2]))
        c = base_col(p) if callable(base_col) else base_col
        return c * (1.0 + 0.45 * max(n, 0.0) / RIB_D)
    for (n0, t0), (n1, t1), side in ((sec[0], sec[1], -1), (sec[1], sec[2], 1)):
        add_face([wall_point(wall, n0, t0, s0), wall_point(wall, n1, t1, s0),
                  wall_point(wall, n1, t1, s1), wall_point(wall, n0, t0, s1)],
                 colour, 'shell', nrm + tdir * side)
    for y, key in ((s0, '-y'), (s1, '+y')):
        if key in caps:
            add_face([wall_point(wall, n, t, y) for n, t in sec], colour, 'shell', AXES[key])


def wall_ribs():
    part('ribs', 'wall')
    rib_col = wall_shade(COL['rib'], 1.03, 0.92)
    m = 0.05
    obstacles = {
        '+x': [(-4.48 - m, -3.32 + m, 3.62 - m, 4.58 + m),      # runtime louvre
               (-2.92 - m, 0.72 + m, 2.33 - m, 4.05 + m),       # glazing frame
               (0.93 - m, 3.47 + m, Y0, 2.84 + m)],             # personnel door frame
        '-x': [(-2.92 - m, 0.72 + m, 2.33 - m, 4.05 + m),
               (CAB[4] - 0.04 - m, CAB[5] + 0.04 + m, Y0, 3.37 + m),  # cabinet and cap
               (2.9, 3.1, 3.3, 3.85)],                          # conduit
        '-z': [(4.62, 5.18, 2.17, 3.30)],                       # runtime cable entry
    }
    walls = {
        '+x': [round(-4.5 + i * RIB_PITCH, 3) for i in range(10)],
        '-x': [round(-4.5 + i * RIB_PITCH, 3) for i in range(10)],
        '-z': [round(-5.5 + i * RIB_PITCH, 3) for i in range(12)],
    }
    for wall, positions in walls.items():
        for a in positions:
            top = (roof_under_y(a) + GABLE_TUCK - 0.02) if wall == '-z' else TRIM_Y0
            segs = [(PLINTH_TOP, top)]
            for a0, a1, y0, y1 in obstacles[wall]:
                if a + RIB_W / 2 <= a0 or a - RIB_W / 2 >= a1:
                    continue
                nxt = []
                for s0, s1 in segs:
                    if y1 <= s0 or y0 >= s1:
                        nxt.append((s0, s1))
                        continue
                    if y0 > s0:
                        nxt.append((s0, y0))
                    if y1 < s1:
                        nxt.append((y1, s1))
                segs = nxt
            for s0, s1 in segs:
                if s1 - s0 < 0.3:
                    continue
                caps = ''
                if s0 > PLINTH_TOP + 1e-6:
                    caps += ' -y'
                if s1 < top - 1e-6:
                    caps += ' +y'
                rib(wall, a, s0, s1, rib_col, caps)


def build_trims():
    part('trims')
    c, f = COL['trim'], 'trim'
    d = 0.05
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * (WX - CORNER), sx * (WX + d)))
            z0, z1 = sorted((sz * (WZ - CORNER), sz * (WZ + d)))
            box(x0, x1, PLINTH_TOP, EAVE_WALL, z0, z1, c, f,
                ('+x' if sx > 0 else '-x') + ' ' + ('+z' if sz > 0 else '-z') + ' '
                + ('-x' if sx > 0 else '+x') + ' ' + ('-z' if sz > 0 else '+z'))
        # eave flashing between the corner trims
        x0, x1 = sorted((sx * (WX - 0.01), sx * (WX + 0.045)))
        box(x0, x1, TRIM_Y0, TRIM_Y1, -WZ + CORNER, WZ - CORNER, c, f, ('+x' if sx > 0 else '-x') + ' -y')


def roof_grad(p):
    """Roof sheet tone: sun-bleached at the ridge, darker toward the eave where run-off collects."""
    t = min(abs(p[0]) / 6.22, 1.0)
    return COL['roof'] * COMP['roof'] * (1.10 - 0.22 * t)


def build_roof():
    part('roof')
    for side in (-1, 1):
        ax, ay, az = slab_axes(side)
        c = (side * ROOF_CX, ROOF_CY, ROOF_ZC)
        h = (ROOF_HX, ROOF_HY, ROOF_HZ)
        mapped('roof')     # the top samples the roof band; ridge-to-eave tone in vertex colour
        obox(c, ax, ay, az, h, roof_grad, 'roof', '+y')
        mapped(None)
        obox(c, ax, ay, az, h, COL['roof'], 'roof', '+z -z ' + ('+x' if side > 0 else '-x'))
        obox(c, ax, ay, az, h, COL['soffit'], 'roof', '-y')   # underside a touch lighter so the overhang reads
        # verge board on both gables: the slab end plus 0.06 m hanging below it
        part('verge')
        depth = 2 * ROOF_HY + 0.06
        for zv in (ROOF_Z0 - 0.025, ROOF_Z1 + 0.025):   # both gables
            vc = np.array(c, np.float64) + ay * (ROOF_HY - depth / 2) + np.array([0.0, 0.0, zv - ROOF_ZC])
            obox(vc, ax, ay, az, (ROOF_HX, depth / 2, 0.025), COL['trim'], 'trim',
                 '+z -z -y ' + ('+x' if side > 0 else '-x'))
        part('roof')
    part('ridge')
    prof = [(-0.24, 6.62), (-0.24, 6.68), (-0.08, 6.78), (0.08, 6.78), (0.24, 6.68), (0.24, 6.62)]
    for i in range(len(prof) - 1):
        (xa, ya), (xb, yb) = prof[i], prof[i + 1]
        out = np.array([-(yb - ya), (xb - xa), 0.0])  # profile runs left to right over the top
        add_face([(xa, ya, -RIDGE_HZ), (xb, yb, -RIDGE_HZ), (xb, yb, RIDGE_Z1), (xa, ya, RIDGE_Z1)],
                 COL['ridge'], 'trim', out)
    for z, sz in ((-RIDGE_HZ, -1), (RIDGE_Z1, 1)):
        add_face([(x, y, z) for x, y in prof], COL['ridge'], 'trim', AXES['+z'] * sz)


def build_vent():
    part('vent')
    t = math.tan(SLOPE)
    roof_y = roof_top_y(VENT_X)

    def shear(p):
        q = p.copy()
        q[1] -= (p[0] - VENT_X) * t
        return q

    base = roof_y - 0.025 - VENT_Y      # flashing 25 mm into the slab at every point
    # A broad flashing collar parallel to the roof (a cone flaring to r 0.62 on the
    # slab, a band and a step in to the stack), the stack, and a rolled rim bead.
    lathe((VENT_X, VENT_Y, VENT_Z), (0, 1, 0), [
        [(0.62, base, True), (0.40, base + 0.10, True)],           # flashing cone on the slab
        [(0.40, base + 0.10, True), (0.40, base + 0.24, True)],    # collar band
        [(0.40, base + 0.24, True), (0.35, base + 0.27, True)],    # step in to the stack
        [(0.35, base + 0.27, True), (0.35, 0.57)],
        [(0.35, 0.57), (0.362, 0.60), (0.342, 0.63)],              # rim bead
    ], VENT_SEGS, COL['vent'], 'vent', shear=shear)
    # Rain hat, relative to CAP_Y (apex 7.80, the +Y extreme), more than twice the
    # stack's width: a dark underside rising to the stack (the stack rim sits inside
    # it), a turned-down lip whose inner face and bottom show from below, a pale
    # lip band and lit chamfer, then a shallow cone. 12 sides for the silhouette.
    part('cap')
    lathe((VENT_X, CAP_Y, VENT_Z), (0, 1, 0), [
        [(0.33, -0.055), (0.70, -0.15)],         # underside
        [(0.70, -0.15), (0.70, -0.21)],          # inner face of the lip
        [(0.70, -0.21), (0.76, -0.21)],          # lip bottom
    ], HAT_SEGS, COL['cap'] * 0.75, 'cap')
    lathe((VENT_X, CAP_Y, VENT_Z), (0, 1, 0), [
        [(0.76, -0.21), (0.76, -0.12)],          # lip band
        [(0.76, -0.12), (0.60, -0.05)],          # chamfer, lit from above
    ], HAT_SEGS, COL['caprim'], 'vent')
    lathe((VENT_X, CAP_Y, VENT_Z), (0, 1, 0), [
        [(0.60, -0.05), (0.30, 0.035), (0.0, 0.08)],
    ], HAT_SEGS, COL['capdome'], 'cap')


def door_tone(rng):
    """Per door and per section: a flat tone (+-12 % value, a slight hue) so no two panels
    of the leaf read as one repeated slat. Zero-mean, so the identity hex holds."""
    v = rng.uniform(-0.12, 0.12)
    hue = rng.uniform(-0.04, 0.04)
    return COL['door'] * COMP['door'] * (1.0 + v) * np.array([1.0 - hue, 1.0, 1.0 + hue])


def build_doors():
    """Each bay door as a FRAME-AND-PANEL leaf, built per door rather than lofted.

    The infill is flat at z 5.11 (the runtime panes sit on it, 2 cm proud), cut per
    section so each section of each door carries its own tone. Over it, horizontal
    rails 3 cm proud run along the section joints and four vertical stiles 5.5 cm
    proud cross them, so the door reads as a grid of panels: three glazed columns
    between two blank ones. A pale aluminium bottom bar over a black rubber seal
    closes the foot. Every bar lies in a gap between the runtime pane rows/columns."""
    rng = np.random.default_rng(23)
    bounds = (BAR_Y[1],) + JOINTS + (DOOR_TOP,)
    xa, xb = OPENINGS[0][0], OPENINGS[1][1]   # one run across both openings: the pier hides the middle
    part('doors', 'door')
    for k in range(len(bounds) - 1):
        y0, y1 = bounds[k], bounds[k + 1]
        add_face([(xa, y0, DOOR_FACE), (xb, y0, DOOR_FACE), (xb, y1, DOOR_FACE), (xa, y1, DOOR_FACE)],
                 door_tone(rng), 'door', AXES['+z'])
    part('doorframe')
    for j in JOINTS:               # rails: a face, a lit top and a shadowed underside
        r0, r1 = j - RAIL_HALF, j + RAIL_HALF
        add_face([(xa, r0, RAIL_Z), (xb, r0, RAIL_Z), (xb, r1, RAIL_Z), (xa, r1, RAIL_Z)],
                 COL['door'] * 1.22, 'door', AXES['+z'])
        add_face([(xa, r1, DOOR_FACE), (xb, r1, DOOR_FACE), (xb, r1, RAIL_Z), (xa, r1, RAIL_Z)],
                 COL['doorlit'] * 1.15, 'door', AXES['+y'])
        add_face([(xa, r0, DOOR_FACE), (xb, r0, DOOR_FACE), (xb, r0, RAIL_Z), (xa, r0, RAIL_Z)],
                 COL['doordark'] * 0.8, 'door', AXES['-y'])
    for oa, ob in OPENINGS:
        c = (oa + ob) / 2
        for o in STILES:           # stiles: a face and both sides, over the rails
            x0, x1 = c + o - STILE_HALF, c + o + STILE_HALF
            add_face([(x0, BAR_Y[1], STILE_Z), (x1, BAR_Y[1], STILE_Z), (x1, HEADER_Y0, STILE_Z),
                      (x0, HEADER_Y0, STILE_Z)], COL['door'] * 1.30, 'door', AXES['+z'])
            for x, d, k in ((x0, '-x', 0.55), (x1, '+x', 0.85)):
                add_face([(x, BAR_Y[1], DOOR_FACE), (x, BAR_Y[1], STILE_Z), (x, HEADER_Y0, STILE_Z),
                          (x, HEADER_Y0, DOOR_FACE)], COL['door'] * k, 'door', AXES[d])
    # bottom bar and seal, across both openings (the stretch behind the pier is never seen)
    part('doorbar')
    xa, xb = OPENINGS[0][0], OPENINGS[1][1]
    zs, zb = 5.19, 5.16
    add_face([(xa, Y0, zs), (xb, Y0, zs), (xb, BAR_Y[0], zs), (xa, BAR_Y[0], zs)], COL['seal'], 'rubber',
             AXES['+z'])
    add_face([(xa, BAR_Y[0], DOOR_FACE), (xb, BAR_Y[0], DOOR_FACE), (xb, BAR_Y[0], zs), (xa, BAR_Y[0], zs)],
             COL['seal'] * 1.5, 'rubber', AXES['-y'])
    add_face([(xa, BAR_Y[0], zb), (xb, BAR_Y[0], zb), (xb, BAR_Y[1] - 0.03, zb), (xa, BAR_Y[1] - 0.03, zb)],
             COL['rail'] * 1.05, 'trim', AXES['+z'])
    add_face([(xa, BAR_Y[1] - 0.03, zb), (xb, BAR_Y[1] - 0.03, zb), (xb, BAR_Y[1], DOOR_FACE),
              (xa, BAR_Y[1], DOOR_FACE)], COL['rail'] * 1.3, 'trim', np.array([0.0, 1.0, 0.6]))


def build_front():
    build_doors()
    part('facade')
    build_facade()
    part('canopy')
    build_canopy()
    part('posts')
    for sx in (-1, 1):
        build_column(sx)


def facade_shade(y_lo, y_hi, k_lo, k_hi):
    def f(p):
        t = min(max((p[1] - y_lo) / (y_hi - y_lo), 0.0), 1.0)
        return COL['jamb'] * (k_lo + (k_hi - k_lo) * t)
    return f


def build_facade():
    """The front wall built thick, with the two openings cut through it.

    Its face is at z 5.55 and the doors' at 5.11, so each door stands 44 cm back
    in the wall's own reveal: jamb returns and a head soffit with occlusion baked
    across them (dark where they meet the door), a pale mitred architrave on the
    arris, pale guide tracks standing in the reveal corners at the door plane, a
    galvanised lintel band over both heads and a sloped top ledge. Below 0.76 m
    the plinth's base course runs across the front (build_plinth)."""
    zf, ya, yb = FACADE_Z, HEADER_Y0, LINTEL_Y1
    X = FACADE_X
    y0 = PLINTH_TOP - 0.02
    strips = [(-X, OPENINGS[0][0]), (OPENINGS[0][1], OPENINGS[1][0]), (OPENINGS[1][1], X)]
    for x0, x1 in strips:
        for ylo, yhi, klo, khi in ((y0, 2.0, 0.80, 1.0), (2.0, ya, 1.0, 0.90)):
            add_face([(x0, ylo, zf), (x1, ylo, zf), (x1, yhi, zf), (x0, yhi, zf)],
                     facade_shade(ylo, yhi, klo, khi), 'shell', AXES['+z'])
    add_face([(-X, ya, zf), (X, ya, zf), (X, yb, zf), (-X, yb, zf)], COL['lintel'], 'trim', AXES['+z'])
    for sx in (-1, 1):   # the facade's ends, where it stands proud of the side walls
        x = sx * X
        add_face([(x, y0, WZ - 0.01), (x, y0, zf), (x, ya, zf), (x, ya, WZ - 0.01)],
                 facade_shade(y0, ya, 0.80, 0.92), 'shell', AXES['+x'] * sx)
        add_face([(x, ya, WZ - 0.01), (x, ya, zf), (x, yb, zf), (x, yb, WZ - 0.01)],
                 COL['lintel'] * 0.85, 'trim', AXES['+x'] * sx)
    # top ledge: a flashing sloping out over the lintel and turned down in a lip
    add_face([(-X, yb + 0.06, WZ - 0.01), (X, yb + 0.06, WZ - 0.01), (X, yb, zf + 0.04), (-X, yb, zf + 0.04)],
             COL['drip'], 'trim', np.array([0.0, 1.0, 0.1]))
    add_face([(-X, yb - 0.05, zf + 0.04), (X, yb - 0.05, zf + 0.04), (X, yb, zf + 0.04), (-X, yb, zf + 0.04)],
             COL['drip'] * 0.82, 'trim', AXES['+z'])
    w = TRIM_W
    for xa, xb in OPENINGS:
        # reveals (above the base course, whose own sides carry them to the ground)
        for x, d in ((xa, '+x'), (xb, '-x')):
            add_face([(x, PLINTH_TOP, DOOR_FACE - 0.01), (x, PLINTH_TOP, TRIM_Z), (x, ya, TRIM_Z),
                      (x, ya, DOOR_FACE - 0.01)], reveal_shade(COL['jamb'], TRIM_Z), 'shell', AXES[d])
        add_face([(xa, ya, DOOR_FACE - 0.01), (xb, ya, DOOR_FACE - 0.01), (xb, ya, TRIM_Z), (xa, ya, TRIM_Z)],
                 reveal_shade(COL['jamb'], TRIM_Z, 0.30, 0.70), 'shell', AXES['-y'])
        # architrave on the arris, mitred at the head corners, with its outer edges
        ta, tb = PLINTH_TOP - 0.02, ya + w
        part('archi')
        quads = [([(xa - w, ta), (xa, ta), (xa, ya), (xa - w, tb)], '-x'),
                 ([(xa - w, tb), (xa, ya), (xb, ya), (xb + w, tb)], '+y'),
                 ([(xb, ta), (xb + w, ta), (xb + w, tb), (xb, ya)], '+x')]
        for quad, edge in quads:
            add_face([(x, y, TRIM_Z) for x, y in quad], COL['archi'], 'trim', AXES['+z'])
        for x, d in ((xa - w, '-x'), (xb + w, '+x')):
            add_face([(x, ta, zf - 0.01), (x, ta, TRIM_Z), (x, tb, TRIM_Z), (x, tb, zf - 0.01)],
                     COL['archi'] * 0.75, 'trim', AXES[d])
        add_face([(xa - w, tb, zf - 0.01), (xb + w, tb, zf - 0.01), (xb + w, tb, TRIM_Z), (xa - w, tb, TRIM_Z)],
                 COL['archi'] * 1.05, 'trim', AXES['+y'])
        # guide tracks standing in the reveal corners at the door plane
        part('tracks')
        # guide tracks: pale channels 16 cm wide standing 26 cm out of the door plane up
        # each jamb, their slot (dark) on the door side
        tz = DOOR_FACE + 0.26
        for xe, inner in ((xa, '+x'), (xb, '-x')):
            sg = 1.0 if inner == '+x' else -1.0
            xs, xm, xi = xe, xe + sg * 0.115, xe + sg * 0.16
            add_face([(xs, Y0, tz), (xm, Y0, tz), (xm, ya + 0.01, tz), (xs, ya + 0.01, tz)], COL['trackface'] * 1.12,
                     'trim', AXES['+z'])
            add_face([(xm, Y0, tz), (xi, Y0, tz), (xi, ya + 0.01, tz), (xm, ya + 0.01, tz)], COL['seal'] * 1.6,
                     'trim', AXES['+z'])
            box(min(xs, xi), max(xs, xi), Y0, ya + 0.01, DOOR_FACE, tz, COL['track'], 'trim', inner)
        box(xa, xb, Y0, 0.02, DOOR_BACK, BASE_Z + 0.04, COL['concrete'], 'concrete', '+z +y')
        part('facade')
    for sx in (-1, 1):   # yellow guards on the centre pier's face
        g0, g1 = sorted((sx * 0.60, sx * 0.85))
        box(g0, g1, Y0, 1.1, zf - 0.005, zf + 0.10, COL['guard'], 'paint', '+z +y +x -x')


def build_canopy():
    """The canopy is the main roof itself, run on to z 6.48 (build_roof). Its front is
    carried by a deep beam whose face is the front gable: a pediment from the beam
    soffit up into the slab underside, so roof edge, verge, pediment and sign read as
    one gable end. The beam's ends close the sides under the eave; its back faces the
    doors. The sign is a dark board standing 15 cm proud of the pediment with the gold
    band flush in it."""
    X, (bz0, bz1) = BEAM_X, BEAM_Z
    top = [(X, roof_under_y(X) + 0.02), (0.0, roof_under_y(0.0) + 0.02), (-X, roof_under_y(-X) + 0.02)]
    fas = COL['fascia']
    add_face([(-X, BEAM_Y0, bz1), (X, BEAM_Y0, bz1)] + [(x, y, bz1) for x, y in top], fas, 'canopy', AXES['+z'])
    add_face([(-X, BEAM_Y0, bz0), (X, BEAM_Y0, bz0)] + [(x, y, bz0) for x, y in top], fas * 0.62, 'canopy',
             AXES['-z'])
    add_face([(-X, BEAM_Y0, bz0), (X, BEAM_Y0, bz0), (X, BEAM_Y0, bz1), (-X, BEAM_Y0, bz1)],
             COL['soffit'] * 0.62, 'canopy', AXES['-y'])
    for sx in (-1, 1):
        x, yt = sx * X, roof_under_y(X) + 0.02
        add_face([(x, BEAM_Y0, bz0), (x, BEAM_Y0, bz1), (x, yt, bz1), (x, yt, bz0)], fas * 0.85, 'canopy',
                 AXES['+x'] * sx)
    part('sign')
    zs = SIGN[5]
    bx, by0, by1 = BOARD_X, BOARD_Y0, BOARD_Y1
    gx0, gx1, gy0, gy1 = SIGN[0], SIGN[1], SIGN[2], SIGN[3]
    cells = [((-bx, gx0, by0, by1), COL['signframe'], 'frame'), ((gx1, bx, by0, by1), COL['signframe'], 'frame'),
             ((gx0, gx1, by0, gy0), COL['signframe'], 'frame'), ((gx0, gx1, gy1, by1), COL['signframe'], 'frame'),
             ((gx0, gx1, gy0, gy1), COL['gold'], 'gold')]
    for (x0, x1, y0, y1), colour, finish in cells:
        add_face([(x0, y0, zs), (x1, y0, zs), (x1, y1, zs), (x0, y1, zs)], colour, finish, AXES['+z'])
    box(-bx, bx, by0, by1, SIGN[4], zs, COL['signframe'], 'frame', '+y -y +x -x')


def build_column(sx):
    """A turned column (8-sided lathe, a flat to the front) standing free under the beam,
    40 cm clear of the facade corner: a square concrete pier, three hazard
    bands (yellow, black, yellow), a pale galvanised shaft tapering 0.60 -> 0.52 m, a
    conical capital flaring to 0.88 m, a cap plate wider than the beam is deep, and two gusset brackets
    running out along the beam soffit."""
    cx, cz = sx * POST_X, POST_Z
    ph = math.pi / POST_SEGS
    H = lambda y: y - Y0   # lathe heights are measured from the GLB ground
    box(cx - DRUM_R, cx + DRUM_R, Y0, DRUM_TOP, cz - DRUM_R, cz + DRUM_R,
        ground_shade(COL['concrete'], DRUM_TOP, 0.78), 'concrete', '+x -x +z -z +y')
    bands = [(DRUM_TOP, 0.95, COL['guard']), (0.95, 1.30, COL['hazblack']), (1.30, 1.65, COL['guard'])]
    r = lambda y: 0.30 - 0.04 * (y - 0.6) / (4.55 - 0.6)
    for i, (y0, y1, col) in enumerate(bands):   # the first band flares out at the foot
        lathe((cx, Y0, cz), (0, 1, 0), [[(0.34 if i == 0 else r(y0), H(y0)), (r(y1), H(y1))]], POST_SEGS,
              col, 'paint', phase=ph)
    lathe((cx, Y0, cz), (0, 1, 0), [
        [(r(1.65), H(1.65)), (r(4.55), H(4.55))],
        [(r(4.55), H(4.55)), (0.44, H(CAP_PLATE[2]))],
    ], POST_SEGS, COL['colpale'], 'post', phase=ph)
    hx, hz, yb = CAP_PLATE
    box(cx - hx, cx + hx, yb, BEAM_Y0 + 0.01, cz - hz, cz + hz, COL['colpale'] * 0.85, 'post', '+x -x +z -z -y')
    # gusset brackets: steel plates from the shaft out along the beam soffit
    t = 0.045
    for d in (-1, 1):
        xs, xe = cx + d * 0.24, cx + d * 0.70   # the outer one ends inside the beam end (6.12)
        y0, y1 = 4.10, BEAM_Y0 + 0.01
        for z, n in ((cz - t, '-z'), (cz + t, '+z')):
            add_face([(xs, y0, z), (xs, y1, z), (xe, y1, z)], COL['colpale'] * 0.9, 'post', AXES[n])
        edge = np.array([d * (y1 - y0), -abs(xe - xs), 0.0])
        add_face([(xs, y0, cz - t), (xs, y0, cz + t), (xe, y1, cz + t), (xe, y1, cz - t)],
                 COL['colpale'] * 0.7, 'post', edge)


def build_personnel_door():
    part('pdoor')
    z0, z1 = PDOOR_Z
    add_face([(6.08, Y0, z0), (6.08, Y0, z1), (6.08, PDOOR_TOP, z1), (6.08, PDOOR_TOP, z0)], COL['pdoor'], 'door',
             AXES['+x'])
    box(6.07, 6.088, 0.06, 0.34, z0 + 0.08, z1 - 0.08, COL['kick'], 'trim', '+x +y')
    box(5.98, 6.20, Y0, 0.06, 0.93, 3.47, COL['concrete'], 'concrete', '+x +y +z -z')
    for za, zb, inner in ((0.93, z0, '+z'), (z1, 3.47, '-z')):
        box(5.98, 6.13, 0.06, PDOOR_TOP, za, zb, COL['jamb'], 'frame', '+x ' + inner + (' -z' if inner == '+z' else ' +z'))
    box(5.98, 6.13, PDOOR_TOP, 2.84, 0.93, 3.47, COL['jamb'], 'frame', '+x +y -y +z -z')
    part('knob')
    lathe((6.075, 1.35, 1.48), (1, 0, 0), [
        [(0.055, 0.0), (0.055, 0.06), (0.0, 0.098)],
    ], 6, COL['brass'], 'brass')


def build_glazing_frames():
    part('glazing')
    za, zb = PANE_Z
    ya, yb = PANE_Y
    for sx in (-1, 1):
        def bx(x0, x1, *rest):
            lo, hi = sorted((sx * x0, sx * x1))
            box(lo, hi, *rest)
        o = '+x' if sx > 0 else '-x'
        bx(WX - 0.01, WX + 0.05, yb, yb + 0.10, za - 0.08, zb + 0.08, COL['glazframe'], 'frame', o + ' +y -y +z -z')
        bx(WX - 0.01, WX + 0.10, ya - 0.12, ya, za - 0.12, zb + 0.12, COL['sill'], 'frame', o + ' +y -y +z -z')
        bx(WX - 0.01, WX + 0.05, ya, yb, za - 0.08, za, COL['glazframe'], 'frame', o + ' +z -z')
        bx(WX - 0.01, WX + 0.05, ya, yb, zb, zb + 0.08, COL['glazframe'], 'frame', o + ' +z -z')


def build_cabinet():
    part('cabinet')
    x0, x1, y0, y1, z0, z1 = CAB
    # front face split into bands: painted vent slots low on the door, clear of the runtime screen
    bands = [0.0, 0.30, 0.36, 0.42, 0.48, 0.54, 0.60, y1]
    for i in range(len(bands) - 1):
        c = COL['slot'] if i % 2 == 1 else COL['cabinet']
        za, zb = (z0 + 0.25, z1 - 0.25) if i % 2 == 1 else (z0, z1)
        if i % 2 == 1:
            add_face([(x0, bands[i], z0), (x0, bands[i], za), (x0, bands[i + 1], za), (x0, bands[i + 1], z0)],
                     COL['cabinet'], 'cabinet', AXES['-x'])
            add_face([(x0, bands[i], zb), (x0, bands[i], z1), (x0, bands[i + 1], z1), (x0, bands[i + 1], zb)],
                     COL['cabinet'], 'cabinet', AXES['-x'])
        add_face([(x0, bands[i], za), (x0, bands[i], zb), (x0, bands[i + 1], zb), (x0, bands[i + 1], za)],
                 c, 'cabinet', AXES['-x'])
    box(x0, x1, y0, y1, z0, z1, COL['cabinet'], 'cabinet', '+z -z')
    box(x0 + 0.02, x1, Y0, y0 + 0.005, z0 + 0.02, z1 - 0.02, COL['concrete'], 'concrete', '-x +z -z')
    box(x0, x1, y1, y1 + 0.07, z0 - 0.04, z1 + 0.04, COL['cabcap'], 'trim', '-x +y -y +z -z')
    part('conduit')
    lathe((-6.25, y1 + 0.03, 3.0), (0, 1, 0), [[(0.05, 0.0), (0.05, 0.42)]], 4, COL['conduit'], 'trim')
    lathe((-6.30, 3.75, 3.0), (1, 0, 0), [[(0.0, 0.0), (0.05, 0.0)], [(0.05, 0.0), (0.05, 0.36)]], 4,
          COL['conduit'], 'trim')


def build_tool_cabinets():
    part('toolcabs')   # behind the closed doors: only the faces toward them
    for x in (-5.0, -4.0, 4.0, 5.0):
        box(x - 0.4, x + 0.4, Y0, 2.0, 4.25, 4.75, COL['red'], 'paint', '+y +z')


def build_geometry():
    FACES.clear()
    build_shell()
    build_plinth()
    wall_ribs()
    build_trims()
    build_roof()
    build_vent()
    build_front()
    build_personnel_door()
    build_glazing_frames()
    build_cabinet()
    # build_tool_cabinets() is not called: the four red cabinets stand behind the closed,
    # opaque doors and show in no view; their 16 triangles pay for the columns.


def check_anchors():
    """Runtime anchors (TruckBay.tsx MaintenanceBay), in the component frame."""
    # canopy lamps: boxes at (+-5, 5.5, 5.3), 0.3 x 0.2 x 0.15. They sit on the facade's
    # sloped top ledge (bottom y 5.40), under the extended roof and behind the beam.
    lamp = (np.array([4.85, 5.4, 5.225]), np.array([5.15, 5.6, 5.375]))
    for f in FACES:
        for p in f['pts']:
            q = np.array([abs(p[0]), p[1], p[2]])
            inside = np.all(q > lamp[0] + 0.02) and np.all(q < lamp[1] - 0.02)
            assert not inside, ('vertex inside a lamp box', f['part'], p)
    for z in (5.225, 5.375):
        ledge = LINTEL_Y1 + 0.06 * (FACADE_Z + 0.04 - z) / (FACADE_Z + 0.04 - (WZ - 0.01))
        assert 5.39 <= ledge <= 5.415, ('lamp seat on the facade ledge', z, ledge)
    assert BEAM_Z[0] > lamp[1][2] + 0.3 and POST_Z - CAP_PLATE[1] > lamp[1][2] + 0.2
    # the +Z extreme is the sign face alone; roof verge and ridge end stand 1 cm behind it
    zmax = max(p[2] for f in FACES for p in f['pts'])
    assert abs(zmax - SIGN[5]) < 1e-9, zmax
    assert all(f['part'] == 'sign' for f in FACES for p in f['pts'] if p[2] > RIDGE_Z1 + 1e-9)
    assert BOARD_Y1 < roof_under_y(BOARD_X) - 0.1, ('sign board under the roof', roof_under_y(BOARD_X))
    # columns: inside the eave, clear of the runtime apron (x +-4, z >= 6.5)
    for f in FACES:
        if f['part'] == 'posts':
            for p in f['pts']:
                assert p[2] <= RIDGE_Z1 and abs(p[0]) <= 6.22 and (abs(p[0]) >= 4.0 or p[2] < 6.5), ('post', p)
    # door bars clear of the runtime panes (0.5 m squares at x +-3 + {-0.8, 0, 0.8}, y {1.9, 2.7, 3.5})
    for c in (-3.0, 3.0):
        cols = [(c + o - 0.25, c + o + 0.25) for o in (-0.8, 0.0, 0.8)]
        for o in STILES:
            s0, s1 = c + o - STILE_HALF, c + o + STILE_HALF
            assert all(s1 < a0 or s0 > a1 for a0, a1 in cols), ('stile over a pane', c + o)
    rows = [(y - 0.25, y + 0.25) for y in (1.9, 2.7, 3.5)]
    for j in JOINTS:
        assert all(j + RAIL_HALF < a0 or j - RAIL_HALF > a1 for a0, a1 in rows), ('rail over a pane', j)
    # the runtime door panes (z 5.11-5.13) stay in front of every door joint and track
    assert TRIM_Z < SIGN[5]


def triangle_count():
    return sum(len(f['pts']) - 2 for f in FACES)


def check_bounds():
    pts = np.concatenate([f['pts'] for f in FACES]) - OFFSET
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    size = hi - lo
    assert CONTRACT['width'][0] <= size[0] <= CONTRACT['width'][1], ('width', size[0])
    assert CONTRACT['height'][0] <= size[1] <= CONTRACT['height'][1], ('height', size[1])
    assert CONTRACT['length'][0] <= size[2] <= CONTRACT['length'][1], ('length', size[2])
    assert abs(lo[1]) < 2e-4, ('ground', lo[1])
    assert abs((lo[0] + hi[0]) / 2) < 5e-4 and abs((lo[2] + hi[2]) / 2) < 5e-4, ('centre', lo, hi)
    tris = triangle_count()
    if tris > MAX_TRIANGLES:
        per = {}
        for f in FACES:
            per[f['part']] = per.get(f['part'], 0) + len(f['pts']) - 2
        print('YARD_MAINTENANCE_OVER', per)
    assert tris <= MAX_TRIANGLES, tris
    return tris, lo, hi


# ---------------------------------------------------------------- textures (numpy; seeded, deterministic)
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def value_noise(rng, h, w, cy, cx, periodic=False):
    """Smooth value noise in [0, 1] over an h x w grid with cy x cx cells; periodic in x if asked."""
    g = rng.random((cy + 2, cx + 2))
    ys = np.linspace(0, cy, h)
    xs = (np.arange(w) + 0.5) / w * cx if periodic else np.linspace(0, cx, w)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = (fy * fy * (3 - 2 * fy))[:, None], (fx * fx * (3 - 2 * fx))[None, :]
    xa, xb = (x0 % cx, (x0 + 1) % cx) if periodic else (x0, x0 + 1)
    a, b = g[y0][:, xa], g[y0][:, xb]
    c, d = g[y0 + 1][:, xa], g[y0 + 1][:, xb]
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def fbm(rng, h, w, cy, cx, octaves=4, periodic=False):
    out, amp, total = np.zeros((h, w)), 1.0, 0.0
    for o in range(octaves):
        out += amp * value_noise(rng, h, w, cy * 2 ** o, cx * 2 ** o, periodic)
        total += amp
        amp *= 0.5
    return out / total


def region_grid(rect, arange, brange):
    """Metric (a, b) at every pixel centre of rect; rows run up the image (v)."""
    x0, y0, x1, y1 = rect
    a = arange[0] + (np.arange(x1 - x0) + 0.5) / (x1 - x0) * (arange[1] - arange[0])
    b = brange[0] + (np.arange(y1 - y0) + 0.5) / (y1 - y0) * (brange[1] - brange[0])
    return np.meshgrid(a, b)


def region_uv(rect, a, b, arange, brange):
    x0, y0, x1, y1 = rect
    u = (x0 + (a - arange[0]) / (arange[1] - arange[0]) * (x1 - x0)) / TEX
    v = (y0 + (b - brange[0]) / (brange[1] - brange[0]) * (y1 - y0)) / TEX
    return u, v


def band_v(rect, b, brange):
    _, y0, _, y1 = rect
    return (y0 + (b - brange[0]) / (brange[1] - brange[0]) * (y1 - y0)) / TEX


def wrap(d, period):
    """Signed periodic distance."""
    return np.mod(d + period / 2, period) - period / 2


def clad_mult(seed):
    """Profiled steel cladding over a 4 m repeat (256 px/m), periodic in u.

    Major ribs at s = 0.5 + k (the modelled V ribs) with worn pale panel edges
    beside them; two minor stiffeners per pan, each a lit line over a shadow
    line; mottle; rain streaks from the eave and from mid-wall; a ragged olive
    dirt band and a splash band rising from the plinth. Plinth: cast concrete
    speckle, a pale arris, splash dirt at the foot and joints every 2 m.
    """
    rng = np.random.default_rng(seed)
    P = CLAD_PERIOD
    s, y = region_grid(R_CLAD, (0.0, P), WALL_YR)
    h, w = s.shape
    frac = s - np.floor(s)
    d_rib = np.abs(frac - 0.5)
    m = np.ones((h, w, 3)) * 0.92
    m += (0.995 - m) * (0.55 * np.exp(-(d_rib / 0.055) ** 2))[..., None]
    for c in (0.17, 0.83):               # minor stiffeners: lit edge, then its shadow
        m *= (1.0 + 0.10 * np.exp(-((frac - c + 0.006) / 0.007) ** 2)
              - 0.16 * np.exp(-((frac - c - 0.012) / 0.008) ** 2))[..., None]
    m *= (0.95 + 0.08 * fbm(rng, h, w, 3, 8, 4, True))[..., None]
    streak = np.zeros_like(s)
    for i in range(64):
        s0 = rng.uniform(0.0, P)
        top = rng.uniform(5.3, 6.5) if i < 44 else rng.uniform(3.2, 5.2)
        wdt = rng.uniform(0.02, 0.07)
        length = rng.uniform(0.8, 3.4) if i < 44 else rng.uniform(0.5, 1.6)
        k = rng.uniform(0.10, 0.28) if i < 44 else rng.uniform(0.06, 0.14)
        col = np.exp(-(wrap(s - s0, P) / wdt) ** 2)
        along = np.clip(1.0 - (top - y) / length, 0.0, 1.0) * (y < top)
        streak = np.maximum(streak, k * col * along ** 1.4)
    m *= (1.0 - streak)[..., None]
    rag = fbm(rng, h, w, 4, 32, 3, True)
    g = smoothstep(2.4 + 0.8 * rag, PLINTH_TOP, y) * (0.55 + 0.45 * rag)
    m *= (1.0 - 0.40 * g[..., None] * np.array([0.75, 0.95, 1.2]))
    m *= (1.0 - 0.16 * smoothstep(1.2, PLINTH_TOP, y) * (0.5 + 0.5 * rag))[..., None]
    speck = rng.random((h, w))
    speck = (speck + np.roll(speck, 1, 0) + np.roll(speck, 1, 1)) / 3.0
    pm = 0.90 * (0.90 + 0.18 * speck) * (0.92 + 0.12 * fbm(rng, h, w, 2, 24, 3, True))
    pm = np.where(y > PLINTH_TOP - 0.06, 0.99, pm)              # pale arris
    pm *= 1.0 - 0.42 * smoothstep(0.45, Y0, y) * (0.6 + 0.4 * rag)  # splash dirt
    joint = np.exp(-((wrap(s - 0.3, 2.0)) / 0.012) ** 2)
    pm *= 1.0 - 0.40 * joint
    plinth = y < PLINTH_TOP
    m = np.where(plinth[..., None], (pm[..., None] * np.array([1.0, 0.99, 0.97])), m)
    return np.clip(m, 0.0, 1.0), plinth, y


def roof_band(seed):
    """Slate standing-seam sheet over a 5.4 m repeat along the ridge (190 px/m):
    crisp seams with a shadow side, sheet-to-sheet tone, a bleached ridge margin,
    a heavy dirt margin at the eave, lichen and run-off streaks; periodic in u."""
    rng = np.random.default_rng(seed)
    P = ROOF_PERIOD
    z, d = region_grid(R_ROOF, (0.0, P), ROOF_DR)
    h, w = z.shape
    sheet = np.floor(z / 0.6).astype(int).clip(0, 8)
    sj = rng.uniform(-0.06, 0.06, 9)
    m = np.ones((h, w, 3)) * 0.88
    m *= (1.0 + sj[sheet])[..., None]
    rel = np.mod(z, 0.6)
    dz = np.minimum(rel, 0.6 - rel)
    m += (0.99 - m) * (0.85 * np.exp(-(dz / 0.013) ** 2))[..., None]
    m *= (1.0 - 0.30 * np.exp(-((rel - 0.034) / 0.014) ** 2))[..., None]
    m *= (0.94 + 0.10 * fbm(rng, h, w, 6, 6, 4, True))[..., None]
    rag = fbm(rng, h, w, 6, 10, 3, True)
    eave = smoothstep(4.4, 6.3, d) * (0.6 + 0.4 * rag)
    m *= (1.0 - 0.32 * eave[..., None] * np.array([0.8, 0.95, 1.2]))
    m += (0.99 - m) * (0.4 * smoothstep(0.6, 0.0, d))[..., None]
    lichen = smoothstep(0.58, 0.72, fbm(rng, h, w, 5, 9, 4, True)) * (0.4 + 0.6 * smoothstep(2.0, 5.5, d))
    m *= 1.0 - lichen[..., None] * np.array([0.12, 0.02, 0.26])
    streak = np.zeros_like(z)
    for _ in range(40):
        z0 = rng.uniform(0.0, P)
        d0 = rng.uniform(0.5, 4.0)
        length = rng.uniform(1.0, 2.6)
        col = np.exp(-(wrap(z - z0, P) / rng.uniform(0.03, 0.07)) ** 2)
        along = np.clip((d - d0) / length, 0.0, 1.0) * (d < d0 + length) * (d > d0)
        streak = np.maximum(streak, rng.uniform(0.05, 0.11) * col * np.sin(np.pi * along))
    m *= (1.0 - streak)[..., None]
    return np.clip(m, 0.0, 1.0)


def door_mult(seed):
    """Both door leaves on one strip (x -5.05..5.05): per-leaf, per-section tone,
    dark edges at the jambs, pier and header, rain streaks
    from the header and road dirt at the foot. Joints are geometry, not paint."""
    rng = np.random.default_rng(seed)
    x, y = region_grid(R_DOOR, DOOR_TR, DOOR_YR)
    m = np.ones(x.shape) * 0.93
    bounds = np.array((-1.0,) + JOINTS + (9.0,))
    sec = (np.searchsorted(bounds, y) - 1).clip(0, len(bounds) - 2)
    leaf = (x > 0).astype(int)
    jit = rng.uniform(-0.05, 0.05, (2, len(bounds)))
    m *= 1.0 + jit[leaf, sec]
    # no pressed horizontal ribs: the panel grid is geometry (rails and stiles), and
    # repeated horizontal lines are what read as louvres
    # occlusion from the 44 cm reveal: the jambs and the head soffit shade the leaf's edges
    d_edge = np.minimum(np.abs(np.abs(x) - 1.0), np.abs(np.abs(x) - 5.0))
    m *= 1.0 - 0.40 * smoothstep(0.34, 0.0, d_edge)
    m *= 1.0 - 0.48 * smoothstep(4.20, HEADER_Y0, y)
    streak = np.zeros_like(x)
    for _ in range(26):
        x0 = rng.uniform(-4.9, 4.9)
        length = rng.uniform(0.8, 2.6)
        col = np.exp(-((x - x0) / rng.uniform(0.03, 0.08)) ** 2)
        along = np.clip(1.0 - (HEADER_Y0 - y) / length, 0.0, 1.0)
        streak = np.maximum(streak, rng.uniform(0.05, 0.12) * col * along ** 1.4)
    m *= 1.0 - streak
    m *= 1.0 - 0.26 * smoothstep(1.0, 0.0, y) * (0.6 + 0.4 * fbm(rng, *x.shape, 3, 30, 3))
    m *= 0.96 + 0.05 * fbm(rng, *x.shape, 4, 16)
    return np.clip(np.stack([m, m, m * 1.0], axis=-1), 0.0, 1.0)


def flat_tile_px(name):
    i = TILE[name]
    return FLAT0[0] + (i % 4) * FLAT_TILE, FLAT0[1] + (i // 4) * FLAT_TILE


def build_textures():
    """Albedo multiplier (sRGB bytes) and roughness/metal map; sets COMP so the
    mean of each mapped region times the vertex colour keeps the identity hex."""
    alb = np.ones((TEX, TEX, 3)) * 0.93
    rough = np.full((TEX, TEX), FIN['shell'][0])
    metal = np.full((TEX, TEX), FIN['shell'][1])

    def put(rect, arr):
        x0, y0, x1, y1 = rect
        alb[y0:y1, x0:x1] = arr

    m, plinth, y = clad_mult(11)
    put(R_CLAD, m)
    x0, y0, x1, y1 = R_CLAD
    dirt = 1.0 - m.mean(axis=-1) / 0.92
    rough[y0:y1, x0:x1] = np.where(plinth, FIN['plinth'][0], FIN['shell'][0] + 0.5 * np.clip(dirt, 0, 0.3))
    metal[y0:y1, x0:x1] = np.where(plinth, FIN['plinth'][1], FIN['shell'][1])
    wall_mean = m[(y > PLINTH_TOP + 0.1) & (y < 5.4)].mean(axis=0)
    plinth_mean = m[plinth & (y > -0.05)].mean(axis=0)
    m = roof_band(37)
    put(R_ROOF, m)
    x0, y0, x1, y1 = R_ROOF
    rough[y0:y1, x0:x1] = FIN['roof'][0] + 0.4 * np.clip(1.0 - m.mean(axis=-1) / 0.88, 0, 0.3)
    metal[y0:y1, x0:x1] = FIN['roof'][1]
    roof_mean = m.mean(axis=(0, 1))
    # pad the bands' edge rows (bilinear and mip filtering, and v wrap under REPEAT)
    for (x0, y0, x1, y1), pad in ((R_CLAD, 8), (R_ROOF, 8)):
        for arr in (alb, rough, metal):
            arr[max(y0 - pad, 0):y0] = arr[y0]
            arr[y1:y1 + pad] = arr[y1 - 1]
    m = door_mult(53)
    put(R_DOOR, m)
    x0, y0, x1, y1 = R_DOOR
    rough[y0:y1, x0:x1] = FIN['door'][0]
    metal[y0:y1, x0:x1] = FIN['door'][1]
    xd, yd = region_grid(R_DOOR, DOOR_TR, DOOR_YR)
    leaves = (yd > 0.3) & (yd < 4.8) & (np.abs(xd) > 1.0) & (np.abs(xd) < 5.0)
    means = {'wall': wall_mean, 'plinth': plinth_mean, 'roof': roof_mean, 'door': m[leaves].mean(axis=0)}
    for name, r, mt in FINISH:
        px, py = flat_tile_px(name)
        alb[py:py + FLAT_TILE, px:px + FLAT_TILE] = 1.0
        rough[py:py + FLAT_TILE, px:px + FLAT_TILE] = r
        metal[py:py + FLAT_TILE, px:px + FLAT_TILE] = mt
    for k in COMP:
        COMP[k] = 1.0 / means[k]
    srgb = np.where(alb <= 0.0031308, alb * 12.92, 1.055 * np.power(alb, 1 / 2.4) - 0.055)
    alb_px = np.clip(np.round(srgb * 255), 0, 255).astype(np.uint8)
    k = TEX // ORM_SIZE
    orm = np.ones((ORM_SIZE, ORM_SIZE, 3), np.float32)
    orm[..., 1] = rough.reshape(ORM_SIZE, k, ORM_SIZE, k).mean(axis=(1, 3))
    orm[..., 2] = metal.reshape(ORM_SIZE, k, ORM_SIZE, k).mean(axis=(1, 3))
    return alb_px, np.clip(orm, 0, 1), means


# ---------------------------------------------------------------- scene
def write_image(path, px, name, fmt, data):
    """px rows bottom-first (as UV v), values 0-1 (already encoded for sRGB images)."""
    h, w, _ = px.shape
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    if data:
        img.colorspace_settings.is_data = True
    rgba = np.concatenate([px.astype(np.float32), np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = fmt
    if fmt == 'JPEG':
        img.save(filepath=path, quality=JPEG_QUALITY)
    else:
        img.filepath_raw = path
        img.save()
    bpy.data.images.remove(img)


def to_blender(p):
    """Component frame (three.js axes) -> GLB frame -> Blender (x, -z, y); a rotation, winding kept."""
    q = p - OFFSET
    return (float(q[0]), float(-q[2]), float(q[1]))


def wall_of(c):
    dx, dz = abs(c[0]) - WX, abs(c[2]) - WZ
    if dx >= dz:
        return '+x' if c[0] > 0 else '-x'
    return '+z' if c[2] > 0 else '-z'


def wall_s(p, wall):
    if wall == '+z':
        return p[0] + 6.0
    if wall == '+x':
        return 12.0 + (5.0 - p[2])
    if wall == '-z':
        return 6.0 - p[0]
    return 12.0 + (p[2] + 5.0)


def face_uvs(f):
    pts, mode = f['pts'], f['map']
    c = pts.mean(axis=0)
    if mode == 'wall':     # the clad band tiles in u (REPEAT); faces may span several repeats
        wall = wall_of(c)
        return [(wall_s(p, wall) / CLAD_PERIOD, band_v(R_CLAD, p[1], WALL_YR)) for p in pts]
    if mode == 'roof':
        side = 1 if c[0] > 0 else -1
        return [((p[2] + 5.4) / ROOF_PERIOD, band_v(R_ROOF, side * p[0], ROOF_DR)) for p in pts]
    if mode == 'door':
        return [region_uv(R_DOOR, p[0], p[1], DOOR_TR, DOOR_YR) for p in pts]
    # flat tile: sample the middle half of the finish's tile
    px, py = flat_tile_px(f['finish'])
    n = f['n']
    t1 = pts[1] - pts[0]
    t1 /= np.linalg.norm(t1)
    t2 = np.cross(n, t1)
    a = np.array([[np.dot(p - pts[0], t1), np.dot(p - pts[0], t2)] for p in pts])
    lo, hi = a.min(axis=0), a.max(axis=0)
    a = (a - lo) / np.maximum(hi - lo, 1e-9)
    q = FLAT_TILE / 4
    return [((px + q + 2 * q * s) / TEX, (py + q + 2 * q * t) / TEX) for s, t in a]


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    col_layer = bm.loops.layers.float_color.new('Col')
    cache = {}
    for f in FACES:
        verts = []
        for p in f['pts']:
            bp = to_blender(p)
            if f['group'] is None:
                verts.append(bm.verts.new(bp))
            else:
                key = (f['group'], tuple(round(c, 6) for c in bp))
                if key not in cache:
                    cache[key] = bm.verts.new(bp)
                verts.append(cache[key])
        face = bm.faces.new(verts)
        face.smooth = f['smooth']
        for loop, uv, c in zip(face.loops, face_uvs(f), f['cols']):
            loop[uv_layer].uv = uv
            loop[col_layer] = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    bm.normal_update()
    for face, f in zip(bm.faces, FACES):
        n = f['n']
        expect = np.array([n[0], -n[2], n[1]])
        assert np.dot(np.array(face.normal), expect) > 0.98, (f['part'], f['finish'])
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    mesh.color_attributes.active_color = mesh.color_attributes['Col']
    mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    return mesh


def build_material(albedo_path, orm_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    # Base colour = weathering multiplier x COLOR_0: the pattern the glTF
    # exporter writes as baseColorTexture plus a vertex colour attribute.
    alb = bpy.data.images.load(albedo_path)
    alb.name = 'yard-maintenance-body-weathering'
    atex = nodes.new('ShaderNodeTexImage')
    atex.image = alb
    atex.extension = 'REPEAT'   # the clad and roof bands tile in u
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mul = nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs[0].default_value = 1.0
    col_in = [sock for sock in mul.inputs if sock.type == 'RGBA']
    col_out = next(sock for sock in mul.outputs if sock.type == 'RGBA')
    links.new(atex.outputs['Color'], col_in[0])
    links.new(attr.outputs['Color'], col_in[1])
    links.new(col_out, bsdf.inputs['Base Color'])
    img = bpy.data.images.load(orm_path)
    img.name = 'yard-maintenance-body-orm'
    img.colorspace_settings.is_data = True
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'REPEAT'
    tex.interpolation = 'Linear'
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(tex.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-maintenance-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    alb_px, orm_px, means = build_textures()
    build_geometry()
    check_anchors()
    tris, lo, hi = check_bounds()
    per_part = {}
    for f in FACES:
        per_part[f['part']] = per_part.get(f['part'], 0) + len(f['pts']) - 2

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='yard-maintenance-body-')
    try:
        albedo_path = os.path.join(stage, 'yard-maintenance-body-weathering.jpg')
        orm_path = os.path.join(stage, 'yard-maintenance-body-orm.png')
        write_image(albedo_path, alb_px / 255.0, 'yard-maintenance-body-weathering-stage', 'JPEG', False)
        write_image(orm_path, orm_px, 'yard-maintenance-body-orm-stage', 'PNG', True)
        mesh = build_mesh()
        mesh.materials.append(build_material(albedo_path, orm_path))
        obj = bpy.data.objects.new(NODE_NAME, mesh)
        obj['authoredCastShadow'] = True
        obj['authoredReceiveShadow'] = True
        scene.collection.objects.link(obj)
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            export_image_format='AUTO',
            export_vertex_color='ACTIVE',
            export_all_vertex_colors=False,
            export_normals=True,
            export_tangents=False,
            export_extras=True,
            export_yup=True,
            export_apply=False,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_copyright='MillOS authored geometry (scripts/blender/authored/yard-maintenance-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print('YARD_MAINTENANCE_TEXMEANS ' + ' '.join(f'{k}:{np.round(v, 3).tolist()}' for k, v in means.items()))
    print('YARD_MAINTENANCE_PARTS ' + ' '.join(f'{k}:{v}' for k, v in per_part.items()))
    print(f'YARD_MAINTENANCE_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes {tris} triangles, '
          f'{len(FACES)} faces, GLB bounds {np.round(lo, 4).tolist()} {np.round(hi, 4).tolist()}')


main()
