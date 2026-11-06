"""Yard cardboard compactor body (world-yard-compactor-body), built from scratch in headless Blender.

What it builds
--------------
The vertical cardboard baler that TruckBay.tsx `CardboardCompactor` places at the
shipping and receiving yard edges. Modelled in the runtime group frame (the
TruckBay fallback's coordinates, metres, +Z front), then shifted by the runtime
wrapper's offset so the GLB is bbox-centred on x/z with y = 0 on the ground:

  GLB = runtime - (0.032500029, -4.8e-8, 0.029999971)

Parts (runtime frame):

* a bright green cabinet built as a STEPPED SIDE PROFILE: a main body whose roof
  is at y 2.30, and across its front a GATE HEAD (z 0.45 .. 1.06) rising to the
  full 2.65 m. The head is the housing the loading gate slides up into, and it
  carries the sign strip; it is the fallback's own silhouette made solid (the
  fallback body is 2.4 m tall and its sign plane rises to 2.65 m). The step's
  riser faces back and carries the power pack's louvred vent. The side walls are
  L-shaped polygons; the plinth is a painted, normal-mapped band;
* the dark loading gate x +-0.9, y 1.5 .. 2.5, its face at z 1.06. The face is
  EXACTLY the fallback panel's front face, split on the same diagonal
  (BoxGeometry: {TL, BL, TR}, {BL, BR, TR}), because
  scripts/compactor-label.test.mjs requires those two triangles and places the
  runtime "CARDBOARD ONLY" label 11 mm in front of them at y 2.435. Bounds and
  centring pin z 1.06 as the front-most plane, so the front wall lies flush with
  the gate; a 150 mm band of the head's front carries the sign plate above it;
* the LOADING CHAMBER under the gate (x +-0.9, y 0.85 .. 1.5): a floor 600 mm
  deep behind a square lip, a back face rising from the floor's back edge to the
  gate's bottom edge, and two cheeks;
* the darker green ejection door on -X: a leaf 80 mm thick standing proud of
  the -X wall (wall x -1.23, leaf face x -1.31, the bounds line), z +-0.78, from
  the plinth top (y 0.16) to y 1.55, with its top and both side edges modelled;
* the dark grey control box on +X: a straight housing with its face flat at
  x 1.375 (y 1.25 .. 1.70, z 0.64 .. 0.96), where the runtime's three indicator
  lamps (x 1.37 - 1.39, y 1.4 / 1.5 / 1.6, z 0.8) sit, closed by a 45-degree
  rain hood that runs back up to the wall at y 1.845 and overhangs the box's
  sides by 25 mm.

Budget: the contract allows 150 render vertices (= 150 indices = 50 triangles),
and compactor-label.test.mjs pins the whole compactor at 228 triangles, which
leaves the body exactly 50: front wall 10 (a ring round the gate and chamber,
hand-triangulated with no T-junctions), gate 2, chamber 6 (floor 2, back 2,
cheeks 1 + 1), back 2, side walls 4 + 4, riser 2, main roof 2, head top 2, door 8
(leaf, top, two edges), control box 8 (face, hood, two sides). Hidden faces are
omitted (no floor, no box or door underside), so no two faces overlap.

Texture layout: one atlas. The back wall and BOTH side walls share one island
(the sides are congruent; +X is mapped mirrored, which the derivative-based
normal mapping in three.js and Blender's MikkTSpace both handle), so the three
walls get one set of texels at a higher density and their ribs, posts, rails
and weathering are identical round every corner. The door leaf and the control
box face have islands of their own. The front is unique. The roofs are read
from above at a distance and get less density.

The frame members (corner posts, the rails under each roofline) are galvanised
steel, unpainted; the panels between them are green paint. Paint against metal
is told apart by value, hue and wear (chips at panel edges, rust tears under the
rail bolts), since one material allows no roughness map.

The 32 kB file budget decides the split between the two maps, so relief lives
where it is cheapest:

* a tangent-space normal map, its slopes snapped to a 15-step ladder so it is
  written as an INDEXED PNG (a few kB);
* a base-colour map (progressive JPEG) kept low in noise so it can be large.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-compactor-body.py -- <out.glb>

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

# ---------------------------------------------------------------- dimensions (runtime frame)
OFFSET = np.array([0.032500029, -4.8e-8, 0.029999971])  # TruckBay wrapper group position
XN = -1.23           # -X wall (the door leaf stands 80 mm proud of it, to the bounds line)
XP = 1.23            # +X wall (the control box stands 145 mm proud of it)
W = XP - XN          # 2.46: the cabinet is symmetric about x = 0, like the gate
ZB = -1.0            # back wall
ZF = 1.06            # front wall: the gate plane, the front-most line of the bounds
D = ZF - ZB          # 2.06
H = 2.65             # gate head roof
HR = 2.30            # main roof
ZR = 0.45            # the step's riser: the gate head spans z ZR .. ZF
HEAD_A0 = ZR - ZB    # 1.45: where the head starts along a side wall (from the back corner)
PL = 0.16            # painted plinth band
GATE_X, GATE_Y0, GATE_Y1, GATE_Z = 0.9, 1.5, 2.5, ZF
YS = 0.85            # loading chamber floor (square lip on the front)
MOUTH_D = 0.60       # chamber depth
ZM = ZF - MOUTH_D    # floor's back edge, where the back face starts
DOOR_X = -1.31       # door leaf face: the bounds line
DOOR_Z, DOOR_Y0, DOOR_Y1 = 0.78, PL, 1.55
BOX_X, BOX_Y0, BOX_Y1 = 1.375, 1.25, 1.70
BOX_Z0, BOX_Z1 = 0.64, 0.96       # the face (lamps at z 0.8)
HOOD_TOP = BOX_Y1 + (BOX_X - XP)  # 45-degree hood back to the wall
HOOD_OVER = 0.025                 # the hood overhangs the box's sides

# Clearances against the runtime ram (2.3 x 0.3 x 1.8 at the origin, y 1.05 .. 1.95).
assert XN < -1.15 - 0.07 and XP > 1.15 + 0.07 and ZB < -0.9 - 0.09 and HR > 1.95 + 0.3
assert GATE_Y1 < H and ZR < GATE_Z - MOUTH_D

NODE_NAME = 'Yard-compactor-bodyBody'
MESH_NAME = 'yard-compactor-body-mesh'
MATERIAL_NAME = 'yard-compactor-body-surface'
SCENE_NAME = 'MillOS_World_Yard-compactor-body'

NORMAL_PX = 384      # atlas width in pixels (multiples of 64: see ROWS_64)
COLOUR_PX = 576
COLOUR_Q = 54
SUPERSAMPLE = 2
MAX_SLOPE = 3.0

# Paint, sRGB 0-255.
GREEN = np.array([40, 182, 90], np.float32)        # #22c55e family, a touch less saturated
GREEN_DARK = np.array([22, 124, 60], np.float32)   # ejection door, #15803d / #16a34a family
SIGN = np.array([16, 82, 42], np.float32)
PALE = np.array([230, 234, 226], np.float32)
GATE = np.array([31, 41, 55], np.float32)          # #1f2937
GATE_SIGN = np.array([22, 29, 40], np.float32)
HOLE = np.array([8, 10, 13], np.float32)
STEEL = np.array([150, 156, 160], np.float32)
STEEL_DARK = np.array([88, 94, 100], np.float32)
GALV = np.array([128, 136, 134], np.float32)       # galvanised frame members, unpainted
GALV_LIT = np.array([168, 174, 170], np.float32)
PLINTH = np.array([34, 37, 40], np.float32)
CONTROL = np.array([55, 65, 81], np.float32)       # #374151
PRIMER = np.array([122, 138, 124], np.float32)     # worn paint: grey-green, so chroma stays near the body's
GRIME = np.array([72, 66, 50], np.float32)
RUST = np.array([118, 74, 44], np.float32)
YELLOW = np.array([232, 178, 18], np.float32)
BLACK = np.array([24, 24, 26], np.float32)
DUST = np.array([108, 112, 92], np.float32)
LID_FIT = np.array([30, 96, 58], np.float32)       # roof fittings: dark green, never grey on green
LID_FIT_LIT = np.array([62, 128, 86], np.float32)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def soft_box(v, centre, half, ramp):
    """1 inside |v - centre| < half, falling to 0 over `ramp` outside it."""
    return 1.0 - smoothstep(half, half + ramp, np.abs(v - centre))


def rect(x, y, x0, x1, y0, y1, ramp=0.004):
    return soft_box(x, (x0 + x1) / 2, (x1 - x0) / 2, ramp) * soft_box(y, (y0 + y1) / 2, (y1 - y0) / 2, ramp)


def value_noise(x, y, cells_x, cells_y, seed, wrap_x=False):
    """Seeded smooth value noise in [0,1] over x in [0,1], y in [0,1] (optionally periodic in x)."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells_y + 2, cells_x + 2)).astype(np.float32)
    if wrap_x:
        grid[:, cells_x:] = grid[:, :2]
        gx = (np.asarray(x) % 1.0) * cells_x
    else:
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


def quarter_round(d, r):
    """Height of an eased edge: 0 beyond r, falling to -r at the edge (d = 0)."""
    d = np.clip(d, 0.0, r)
    return np.sqrt(np.maximum(r * r - (r - d) ** 2, 0.0)) - r


def rect_distance(a, b, a0, a1, b0, b1):
    """Unsigned distance to the outline of the rectangle [a0,a1] x [b0,b1]."""
    inside = (a >= a0) & (a <= a1) & (b >= b0) & (b <= b1)
    da = np.maximum(np.maximum(a0 - a, a - a1), 0.0)
    db = np.maximum(np.maximum(b0 - b, b - b1), 0.0)
    outside = np.hypot(da, db)
    edge_in = np.minimum(np.minimum(a - a0, a1 - a), np.minimum(b - b0, b1 - b))
    return np.where(inside, edge_in, outside), inside


def groove(dist, half, ramp, depth):
    return -depth * (1.0 - smoothstep(half, half + ramp, dist))


def rib(v, centre, half, height):
    """Pressed rib: flat crown of half-width `half`, eased flanks of 25 mm."""
    return height * (1.0 - smoothstep(half, half + 0.025, np.abs(v - centre)))


def round_bar(v, centre, r):
    """Round section across v: 0 outside, up to +r on the centre line."""
    d = np.abs(v - centre)
    return np.where(d < r, np.sqrt(np.maximum(r * r - d * d, 0.0)), 0.0)


def disc(a, b, ca, cb, r, ramp=0.003):
    return 1.0 - smoothstep(r, r + ramp, np.hypot(a - ca, b - cb))


def mix(rgb, colour, w):
    w = np.clip(w, 0.0, 1.0)[..., None]
    return rgb * (1 - w) + colour * w


def shade(rgb, k):
    return rgb * np.clip(1.0 - k, 0.05, 2.0)[..., None]


def paint(shape, colour):
    return np.broadcast_to(colour, shape + (3,)).astype(np.float64).copy()


def mottle(rgb, u, v, seed, strength=0.06, cells=(5, 5)):
    """Low-frequency tone drift only: fine speckle costs atlas bytes and reads as blur."""
    n1 = value_noise(u, v, cells[0], cells[1], seed) - 0.5
    return rgb * (1.0 + strength * n1)[..., None]


def chips(rgb, d, u, v, seed, width=0.016, colour=PRIMER, amount=0.6, cells=36):
    """Chipped paint along an edge at distance d: sparse, never a clean stripe."""
    n = value_noise(u, v, cells, cells, seed)
    edge = (1.0 - smoothstep(0.0, width, d)) * smoothstep(0.55, 0.72, n)
    return mix(rgb, colour, amount * edge)


# ---------------------------------------------------------------- walls (back, -X, +X: one island)
# The back and both sides share one island in a frame a (along the wall, from
# its back corner for the sides and from the +X corner for the back), b = y.
# Its vertical arrises are at a = 0, D (a side's front corner) and W (the back's
# far corner), so the back carries a frame post at a = D too; the sides' head
# panel is the region a in [HEAD_A0, D], b in [HR, H].
POST = 0.075         # galvanised post band each side of every vertical arris
RAIL = 0.075         # galvanised rail band under each roofline
RIB_A = (0.205, 0.615, 1.025, 1.435, 1.845, 2.26)   # same distance from every corner
RIB_B = (PL + 0.14, HR - RAIL - 0.10)
BOLT_PITCH = 0.30


def wall_geom(a, b):
    d_end = np.where(a < D, np.minimum(a, D - a), np.minimum(a - D, W - a))
    head = (a >= HEAD_A0) & (a <= D)
    top = np.where(head, H, HR)
    upper = head & (b > HR)
    d_head = np.where(upper, a - HEAD_A0, 9.0)
    return d_end, top, upper, d_head


def frame_masks(d_end, b, upper, d_head):
    """Soft masks of the galvanised posts and rails."""
    post = np.maximum(1.0 - smoothstep(POST - 0.003, POST, d_end), 1.0 - smoothstep(POST - 0.003, POST, d_head))
    rail = (smoothstep(HR - RAIL - 0.003, HR - RAIL, b) * (1.0 - smoothstep(HR, HR + 0.003, b))
            + upper * smoothstep(H - RAIL - 0.003, H - RAIL, b))
    return post, np.clip(rail, 0.0, 1.0)


def bolt_rows(a, b, d_end, upper, d_head):
    """Bolt heads on the rails (pitch 0.30 m) and the plinth; returns height and a mask."""
    phase = np.abs(((a + 0.5 * BOLT_PITCH) % BOLT_PITCH) - 0.5 * BOLT_PITCH)
    ok = (d_end > POST + 0.03) & (d_head > POST + 0.03)
    r1 = np.hypot(phase, b - (HR - RAIL / 2))
    r2 = np.hypot(phase, b - (H - RAIL / 2))
    r3 = np.hypot(phase, b - PL * 0.5)
    h = 0.5 * round_bar(r1, 0.0, 0.011) * ok + 0.5 * round_bar(r2, 0.0, 0.011) * ok * upper
    h += 0.5 * round_bar(r3, 0.0, 0.011)
    m = (1.0 - smoothstep(0.009, 0.012, r1)) * ok + (1.0 - smoothstep(0.009, 0.012, r2)) * ok * upper
    return h, m, phase, ok


def wall_h(a, b):
    d_end, top, upper, d_head = wall_geom(a, b)
    h = quarter_round(d_end, 0.02)                                # eased vertical arris
    h += quarter_round(np.maximum(top - b, 0.0), 0.012)           # eased roof arris
    h += np.where(upper, quarter_round(np.minimum(d_head, 1.0), 0.02), 0.0)   # head's rear arris
    post, rail = frame_masks(d_end, b, upper, d_head)
    h += 0.003 * np.maximum(post, rail)                           # frame members stand 3 mm proud
    h += groove(np.abs(d_end - POST), 0.0015, 0.002, 0.003) * (b > PL) * (1 - rail)
    h += groove(np.abs(b - (HR - RAIL)), 0.0015, 0.002, 0.003) * (d_end > POST)
    h += upper * groove(np.abs(b - (H - RAIL)), 0.0015, 0.002, 0.003) * (d_end > POST) * (d_head > POST)
    h += 0.006 * (1.0 - smoothstep(PL - 0.004, PL, b))            # plinth angle stands 6 mm proud
    span = smoothstep(RIB_B[0], RIB_B[0] + 0.04, b) * (1.0 - smoothstep(RIB_B[1] - 0.04, RIB_B[1], b))
    for c in RIB_A:
        h += rib(a, c, 0.022, 0.018) * span
    # The head panel: a bolted cover over the gate's guide, 4 mm proud.
    cover = upper * rect(a, b, HEAD_A0 + 0.13, D - 0.13, HR + 0.05, H - RAIL - 0.04, 0.004)
    h += 0.004 * cover
    bh, _, _, _ = bolt_rows(a, b, d_end, upper, d_head)
    h = h + bh
    return np.where((b > HR + 0.02) & ~upper, 0.0, h)


def wall_c(a, b, seed=61):
    d_end, top, upper, d_head = wall_geom(a, b)
    rgb = paint(a.shape, GREEN)
    # Each sheet took its own coat: a few percent of tone between ribs.
    edges = (0.0,) + RIB_A[:5] + (D,) + (RIB_A[5], W)
    for k in range(len(edges) - 1):
        inside = (a >= edges[k]) & (a < edges[k + 1])
        tone = (0.96, 1.04, 0.99, 1.05, 0.95, 1.02, 0.97, 1.03)[k % 8]
        rgb = rgb * np.where(inside, tone, 1.0)[..., None]
    rgb *= (1.0 + 0.10 * (value_noise(a / W, b / H, 5, 3, seed) - 0.5))[..., None]       # broad value drift
    rgb *= (1.0 + 0.03 * (value_noise(a / W, b / H, 14, 7, seed + 1) - 0.5))[..., None]  # paint mottle
    # Ribs: occlusion in the fold at each foot.
    span = (b > RIB_B[0] + 0.02) & (b < RIB_B[1] - 0.02)
    for c in RIB_A:
        rgb = shade(rgb, 0.13 * span * soft_box(np.abs(a - c), 0.05, 0.006, 0.03))
        rgb = mix(rgb, GREEN * 1.18, 0.35 * span * soft_box(a - c, -0.012, 0.007, 0.004))  # lit crown
    cover = upper * rect(a, b, HEAD_A0 + 0.13, D - 0.13, HR + 0.05, H - RAIL - 0.04, 0.003)
    cd, cin = rect_distance(a, b, HEAD_A0 + 0.13, D - 0.13, HR + 0.05, H - RAIL - 0.04)
    rgb = shade(rgb, 0.35 * upper * (~cin) * (1.0 - smoothstep(0.0, 0.012, cd)))
    rgb = rgb * (1.0 + 0.05 * cover)[..., None]
    # Weathering: a soft wash under each rail.
    fall = np.clip(1.0 - (HR - RAIL - b) / 0.7, 0.0, 1.0) * (b < HR - RAIL)
    fall2 = upper * np.clip(1.0 - (H - RAIL - b) / 0.25, 0.0, 1.0) * (b < H - RAIL)
    rgb = mix(rgb, GRIME, 0.12 * (fall + fall2) * (0.6 + 0.4 * value_noise(a / W, b / H, 22, 1, 11)))
    # Forklift scrapes: a few crisp scores through the paint, low on the wall.
    rng = np.random.default_rng(seed + 900)
    for _ in range(5):
        sa = rng.uniform(0.25, W - 0.75)
        sb = rng.uniform(0.30, 0.80)
        sl = rng.uniform(0.18, 0.5)
        tilt = rng.uniform(-0.04, 0.04)
        line = soft_box(b - tilt * (a - sa), sb, 0.003, 0.002) * rect(a, b, sa, sa + sl, -1, 9, 0.03)
        rgb = mix(rgb, PRIMER * 1.1, 0.85 * line)
        rgb = shade(rgb, 0.25 * soft_box(b - tilt * (a - sa), sb - 0.006, 0.002, 0.002) * rect(a, b, sa, sa + sl, -1, 9, 0.03))
    # Paint chips along every panel edge where it meets the steel frame.
    post, rail = frame_masks(d_end, b, upper, d_head)
    d_frame = np.minimum(np.minimum(np.abs(d_end - POST), np.abs(d_head - POST)),
                         np.minimum(np.abs(b - (HR - RAIL)), np.where(upper, np.abs(b - (H - RAIL)), 9.0)))
    rgb = chips(rgb, d_frame, a / W, b / H, seed + 3, 0.028, PRIMER, 0.8, cells=120)
    # Galvanised frame members: grey, spangled, lit along the eased arris; a dark joint line.
    galv = paint(a.shape, GALV) * (1.0 + 0.06 * (value_noise(a / W, b / H, 24, 12, seed + 5) - 0.5))[..., None]
    galv = mix(galv, GALV_LIT, 0.6 * (1.0 - smoothstep(0.004, 0.014, np.minimum(d_end, d_head))))
    fm = np.maximum(post, rail)
    rgb = rgb * (1 - fm[..., None]) + galv * fm[..., None]
    rgb = shade(rgb, 0.45 * (1.0 - smoothstep(0.0015, 0.004, d_frame)))
    # Bolts, and short rust tears from some of them down the rail and panel.
    _, bm, phase, ok = bolt_rows(a, b, d_end, upper, d_head)
    rgb = mix(rgb, STEEL_DARK, 0.9 * bm)
    which = value_noise(np.round(a / BOLT_PITCH) * 0.11, 0.5, 40, 1, seed + 7) > 0.55
    tear = ok * which * soft_box(phase, 0.0, 0.002, 0.003) * (b < HR - RAIL / 2 - 0.012) * (b > HR - RAIL / 2 - 0.16)
    tear *= np.clip((b - (HR - RAIL / 2 - 0.16)) / 0.15, 0.0, 1.0)
    rgb = mix(rgb, RUST, 0.6 * tear)
    # Plinth: near-black rubber-coated steel, a lit lip.
    pl = 1.0 - smoothstep(PL - 0.002, PL + 0.002, b)
    skirt = paint(a.shape, PLINTH) * (1.0 + 0.10 * (value_noise(a / W, b / H, 30, 2, 13) - 0.5))[..., None]
    rgb = rgb * (1 - pl[..., None]) + skirt * pl[..., None]
    rgb = mix(rgb, GALV_LIT, 0.55 * soft_box(b, PL + 0.004, 0.003, 0.002))
    rgb = mix(rgb, STEEL, 0.9 * (1.0 - smoothstep(0.009, 0.012, np.hypot(phase, b - PL * 0.5))))
    # Grime toward the ground, streaky.
    g = (1.0 - smoothstep(PL, 0.75, b)) * (0.35 + 0.45 * value_noise(a / W, b / H, 34, 3, 17))
    rgb = mix(rgb, GRIME, 0.5 * g * (b > PL))
    # The very arris: dark steel edge.
    rgb = mix(rgb, STEEL_DARK, 0.5 * (1.0 - smoothstep(0.0, 0.005, np.minimum(np.minimum(d_end, d_head), top - b))))
    # Texels above the main roofline outside the head panel are never sampled: flat, so they cost no bytes.
    unused = (b > HR + 0.02) & ~upper
    rgb[unused] = GREEN
    return rgb


# ---------------------------------------------------------------- front
# Front: x = XN + a, y = b.  Gate and chamber regions carry their own faces.
BALE = (-1.05, 1.05, 0.22, 0.68)              # bale door on the lower front
BALE_HINGES = (0.31, 0.59)
BALE_LATCHES = (0.36, 0.54)
GUIDE = (0.905, 0.985)                        # gate guide channels, |x| span, up from the lip
HAZ = (YS - 0.105, YS - 0.018)                # hazard band under the lip
SIGN_HALF = 0.64
SIGN_B = (GATE_Y1 + 0.017, H - 0.017)         # the sign plate on the head's front band


def in_gate(x, y):
    return (np.abs(x) <= GATE_X) & (y >= GATE_Y0) & (y <= GATE_Y1)


def in_mouth(x, y):
    return (np.abs(x) <= GATE_X) & (y >= YS) & (y < GATE_Y0)


def gate_h(gx, gy):
    """Gate face, gx 0..1.8 from its -x edge, gy 0..1 from its bottom."""
    h = quarter_round(np.minimum(np.minimum(gx, 1.8 - gx), np.minimum(gy, 1.0 - gy)), 0.012)
    dist, inside = rect_distance(gx, gy, 0.06, 1.74, 0.06, 0.84)
    h += np.where(inside, -0.005 * smoothstep(0.0, 0.008, dist), 0.0)
    h += groove(np.abs(gy - 0.855), 0.003, 0.003, 0.004) * (gx > 0.03) * (gx < 1.77)
    win = rect(gx, gy, 0.22, 1.58, 0.42, 0.76, 0.006)
    h += -0.006 * win
    hx = np.abs(((gx - 0.22) % 0.068) - 0.034)
    holes = soft_box(hx, 0.0, 0.017, 0.004) * rect(gx, gy, 0.24, 1.56, 0.445, 0.735, 0.004)
    h += -0.008 * holes
    span = rect(gx, gy, 0.10, 1.70, -1, 2, 0.01)
    h += (rib(gy, 0.17, 0.012, 0.007) + rib(gy, 0.31, 0.012, 0.007)) * span
    h += 0.022 * smoothstep(0.0, 1.0, round_bar(gy, 0.075, 0.017) / 0.017) * rect(gx, gy, 0.62, 1.18, -1, 2, 0.008)
    for sx in (0.66, 1.14):
        h += 0.022 * rect(gx, gy, sx - 0.02, sx + 0.02, 0.05, 0.10, 0.005)
    return h, holes, win


def gate_c(gx, gy, seed=41):
    _, holes, win = gate_h(gx, gy)
    rgb = paint(gx.shape, GATE)
    rgb = mottle(rgb, gx / 1.8, gy, seed, 0.08)
    rgb = mix(rgb, GATE_SIGN, rect(gx, gy, 0.03, 1.77, 0.862, 0.985, 0.004))
    rgb = shade(rgb, 0.35 * (1.0 - smoothstep(0.003, 0.007, np.abs(gy - 0.855))))
    rgb = shade(rgb, 0.25 * win)
    rgb = mix(rgb, HOLE, 0.92 * holes)
    rgb = mix(rgb, STEEL, 0.85 * rect(gx, gy, 0.62, 1.18, 0.058, 0.092, 0.003))
    for sx in (0.66, 1.14):
        rgb = mix(rgb, STEEL_DARK, rect(gx, gy, sx - 0.02, sx + 0.02, 0.05, 0.10, 0.003))
    rub = value_noise(gx / 1.8, gy, 24, 12, seed + 2)
    rgb = mix(rgb, STEEL_DARK, 0.4 * rect(gx, gy, 0.5, 1.3, 0.03, 0.16, 0.05) * smoothstep(0.5, 0.8, rub))
    d = np.minimum(np.minimum(gx, 1.8 - gx), np.minimum(gy, 1.0 - gy))
    rgb = chips(rgb, d, gx / 1.8, gy, seed + 4, 0.014, STEEL_DARK, 0.7)
    return rgb


def mouth_h(x, y):
    """The chamber's back face (projected): a liner with vertical wear strips, the
    gate's bottom edge rolled over at the top."""
    h = quarter_round(np.minimum(GATE_X - np.abs(x), 1.0), 0.01)
    for sx in (-0.6, -0.2, 0.2, 0.6):
        h += rib(x, sx, 0.012, 0.004)
    h += -0.006 * (1.0 - smoothstep(0.0, 0.03, GATE_Y0 - y))
    return h


def mouth_c(x, y):
    t = np.clip((y - YS) / (GATE_Y0 - YS), 0.0, 1.0)   # 0 at the floor, 1 under the gate
    rgb = paint(x.shape, STEEL_DARK * 0.62)
    rgb = mottle(rgb, (x + 1) / 2, t, 141, 0.10, (6, 2))
    rgb = shade(rgb, 0.6 * smoothstep(0.2, 1.0, t))
    rgb = shade(rgb, 0.35 * (1.0 - smoothstep(0.0, 0.12, t)))
    for sx in (-0.6, -0.2, 0.2, 0.6):
        rgb = mix(rgb, STEEL * 0.66, 0.55 * soft_box(x, sx, 0.005, 0.003) * (1 - t))
    rgb = shade(rgb, 0.4 * (1.0 - smoothstep(0.0, 0.09, GATE_X - np.abs(x))))
    rgb = shade(rgb, 0.5 * (1.0 - smoothstep(0.0, 0.05, GATE_Y0 - y)))
    return rgb


def front_h(a, b):
    x, y = a + XN, b
    ax = np.abs(x)
    d_end = np.minimum(a, W - a)
    h = quarter_round(d_end, 0.02) + quarter_round(np.maximum(H - b, 0.0), 0.012)
    post = 1.0 - smoothstep(POST - 0.003, POST, d_end)
    h += 0.003 * post + groove(np.abs(d_end - POST), 0.0015, 0.002, 0.003) * (b > PL)
    h += 0.006 * (1.0 - smoothstep(PL - 0.004, PL, b))
    phase = np.abs(((a + 0.15) % 0.30) - 0.15)
    h += 0.5 * round_bar(np.hypot(phase, b - PL * 0.5), 0.0, 0.011)
    # Sign plate on the head band, 3 mm proud, with its four fixings.
    sd, sin_ = rect_distance(x, y, -SIGN_HALF, SIGN_HALF, *SIGN_B)
    h += np.where(sin_, 0.003 * smoothstep(0.0, 0.004, sd), 0.0)
    # Gate guide channels: a folded steel channel 6 mm proud with a slot down its middle.
    span = smoothstep(YS - 0.01, YS + 0.01, y) * (1.0 - smoothstep(GATE_Y1 - 0.01, GATE_Y1 + 0.01, y))
    guide = soft_box(ax, 0.5 * (GUIDE[0] + GUIDE[1]), 0.5 * (GUIDE[1] - GUIDE[0]), 0.004)
    h += span * (0.006 * guide + groove(np.abs(ax - 0.5 * (GUIDE[0] + GUIDE[1])), 0.004, 0.003, 0.004) * guide)
    for gy in (YS + 0.12, 1.30, 1.75, 2.20):  # channel bolts
        h += 0.5 * round_bar(np.hypot(ax - 0.945, y - gy), 0.0, 0.011) * (ax > 0.9)
    # Lip: an eased steel angle along the top of the lower front.
    lip = (ax < GATE_X + 0.02) & (y < YS)
    h += np.where(lip, quarter_round(YS - y, 0.012) + 0.004 * (1.0 - smoothstep(0.035, 0.04, YS - y)), 0.0)
    # Bale-chamber door: seam, rib, hinges left, latches right.
    bd, _ = rect_distance(x, y, *BALE)
    h += groove(bd, 0.003, 0.004, 0.007)
    span = rect(x, y, BALE[0] + 0.1, BALE[1] - 0.1, -1, 9, 0.02)
    h += rib(y, 0.445, 0.02, 0.008) * span
    for hy in BALE_HINGES:
        h += round_bar(x, BALE[0] + 0.005, 0.024) * rect(x, y, -2, 2, hy - 0.06, hy + 0.06, 0.004)
    for ly in BALE_LATCHES:
        h += 0.02 * smoothstep(0.0, 1.0, round_bar(y, ly, 0.018) / 0.018) * rect(x, y, 0.70, 0.94, -1, 9, 0.006)
        h += 0.026 * rect(x, y, 0.94, 1.0, ly - 0.035, ly + 0.035, 0.004)
    m = in_mouth(x, y)
    if m.any():
        h = h.copy()
        h[m] = mouth_h(x[m], y[m])
    g = in_gate(x, y)
    if g.any():
        gh, _, _ = gate_h(x[g] + GATE_X, y[g] - GATE_Y0)
        h = h.copy()
        h[g] = gh
    return h


def front_c(a, b):
    x, y = a + XN, b
    ax = np.abs(x)
    d_end = np.minimum(a, W - a)
    rgb = paint(a.shape, GREEN)
    rgb *= (1.0 + 0.10 * (value_noise(a / W, b / H, 5, 3, 51) - 0.5))[..., None]
    rgb *= (1.0 + 0.03 * (value_noise(a / W, b / H, 14, 7, 52) - 0.5))[..., None]
    # Weathering under the head's top arris and toward the ground.
    fall = np.clip(1.0 - (H - b) / 0.5, 0.0, 1.0)
    rgb = mix(rgb, GRIME, 0.08 * fall * (y < SIGN_B[0]))
    rgb = chips(rgb, np.abs(d_end - POST), a / W, b / H, 53, 0.028, PRIMER, 0.8, cells=120)
    post = 1.0 - smoothstep(POST - 0.003, POST, d_end)
    galv = paint(a.shape, GALV) * (1.0 + 0.06 * (value_noise(a / W, b / H, 24, 12, 54) - 0.5))[..., None]
    galv = mix(galv, GALV_LIT, 0.6 * (1.0 - smoothstep(0.004, 0.014, d_end)))
    rgb = rgb * (1 - post[..., None]) + galv * post[..., None]
    rgb = shade(rgb, 0.45 * (1.0 - smoothstep(0.0015, 0.004, np.abs(d_end - POST))) * (b > PL))
    span = (y > YS) & (y < GATE_Y1 + 0.005)
    guide = span * soft_box(ax, 0.5 * (GUIDE[0] + GUIDE[1]), 0.5 * (GUIDE[1] - GUIDE[0]), 0.003)
    rgb = mix(rgb, GALV * 0.9, guide)
    rgb = mix(rgb, GALV_LIT, 0.55 * guide * soft_box(ax, GUIDE[0] + 0.012, 0.006, 0.004))
    rgb = shade(rgb, 0.55 * guide * (1.0 - smoothstep(0.004, 0.007, np.abs(ax - 0.5 * (GUIDE[0] + GUIDE[1])))))
    rgb = shade(rgb, 0.3 * span * (ax > GUIDE[1]) * (1.0 - smoothstep(0.0, 0.02, ax - GUIDE[1])))
    for gy in (YS + 0.12, 1.30, 1.75, 2.20):
        rgb = mix(rgb, STEEL_DARK, (1.0 - smoothstep(0.009, 0.012, np.hypot(ax - 0.945, y - gy))) * (ax > 0.9))
    # Lip: bare steel angle, then the hazard band.
    lip = (ax < GATE_X + 0.02) & (y < YS)
    rgb = mix(rgb, STEEL_DARK, lip * (1.0 - smoothstep(0.036, 0.04, YS - y)))
    rgb = mix(rgb, STEEL, 0.6 * lip * (1.0 - smoothstep(0.004, 0.008, YS - y)))
    rgb = chips(rgb, YS - y, a / W, b / H, 55, 0.02, STEEL, 0.7 * lip)
    hz = rect(x, y, -GATE_X, GATE_X, HAZ[0], HAZ[1], 0.002)
    stripes = (((x + y) / 0.11) % 1.0) < 0.5
    rgb = mix(rgb, np.where(stripes[..., None], YELLOW, BLACK), hz)
    rgb = chips(rgb, np.minimum(np.abs(y - HAZ[0]), np.abs(y - HAZ[1])), a / W, b / H, 57, 0.012, STEEL_DARK, 0.6 * hz)
    # Bale door.
    bd, bin_ = rect_distance(x, y, *BALE)
    rgb = shade(rgb, 0.6 * (1.0 - smoothstep(0.003, 0.009, bd)))
    rgb = mix(rgb, GREEN_DARK * 1.15, 0.30 * bin_ * smoothstep(0.009, 0.02, bd))
    span = (x > BALE[0] + 0.1) & (x < BALE[1] - 0.1)
    rgb = shade(rgb, 0.18 * span * soft_box(np.abs(y - 0.445), 0.032, 0.005, 0.005))
    for hy in BALE_HINGES:
        rgb = mix(rgb, STEEL_DARK, rect(x, y, BALE[0] - 0.02, BALE[0] + 0.03, hy - 0.06, hy + 0.06, 0.003))
    for ly in BALE_LATCHES:
        rgb = mix(rgb, STEEL, rect(x, y, 0.70, 0.94, ly - 0.018, ly + 0.018, 0.003))
        rgb = mix(rgb, STEEL_DARK, rect(x, y, 0.94, 1.0, ly - 0.035, ly + 0.035, 0.003))
    lab = rect(x, y, -0.62, -0.42, 0.47, 0.63, 0.002)
    rgb = mix(rgb, YELLOW, lab)
    ld, _ = rect_distance(x, y, -0.62, -0.42, 0.47, 0.63)
    rgb = mix(rgb, BLACK, lab * (1.0 - smoothstep(0.007, 0.011, ld)))
    tri = lab * (np.abs(x + 0.52) < (0.60 - y) * 0.55) * (y > 0.50) * (y < 0.60)
    rgb = mix(rgb, BLACK, 0.85 * tri)
    # Plinth and grime.
    pl = 1.0 - smoothstep(PL - 0.002, PL + 0.002, b)
    rgb = rgb * (1 - pl[..., None]) + paint(a.shape, PLINTH)[...] * pl[..., None]
    rgb = mix(rgb, GALV_LIT, 0.55 * soft_box(b, PL + 0.004, 0.003, 0.002))
    phase = np.abs(((a + 0.15) % 0.30) - 0.15)
    rgb = mix(rgb, STEEL, 0.9 * (1.0 - smoothstep(0.009, 0.012, np.hypot(phase, b - PL * 0.5))))
    g = (1.0 - smoothstep(PL, 0.6, b)) * (0.35 + 0.45 * value_noise(a / W, b / H, 34, 3, 58))
    rgb = mix(rgb, GRIME, 0.45 * g * (b > PL))
    # Sign plate on the head band: deep green, white border, black keyline, white flow arrows.
    sd, sin_ = rect_distance(x, y, -SIGN_HALF, SIGN_HALF, *SIGN_B)
    rgb = mix(rgb, SIGN, sin_ * 1.0)
    rgb = mix(rgb, PALE, sin_ * soft_box(sd, 0.010, 0.005, 0.002))
    rgb = mix(rgb, BLACK, (~sin_) * (1.0 - smoothstep(0.003, 0.006, sd)))
    cy = 0.5 * (SIGN_B[0] + SIGN_B[1])
    for k in range(3):
        cx = -0.38 + k * 0.38
        ar = (np.abs(y - cy) < 0.032 - 0.6 * np.abs(x - cx)) & (x > cx - 0.053)
        rgb = mix(rgb, PALE, sin_ * ar * 0.95)
        rgb = mix(rgb, PALE, sin_ * rect(x, y, cx - 0.19, cx - 0.045, cy - 0.009, cy + 0.009, 0.002) * 0.95)
    for rx in (-SIGN_HALF + 0.03, SIGN_HALF - 0.03):
        rgb = mix(rgb, STEEL, disc(x, y, rx, cy, 0.008))
    rgb = mix(rgb, STEEL_DARK, 0.5 * (1.0 - smoothstep(0.0, 0.005, np.minimum(d_end, H - b))))
    m = in_mouth(x, y)
    if m.any():
        rgb[m] = mouth_c(x[m], y[m])
    g = in_gate(x, y)
    if g.any():
        rgb[g] = gate_c(x[g] + GATE_X, y[g] - GATE_Y0)
    return rgb


# Chamber floor: a = along +x from x -0.9, b = back from the lip.
def sill_h(a, b):
    h = quarter_round(np.minimum(b, 1.0), 0.012)
    for k in range(9):  # raised tread bars, 200 mm pitch, running into the chamber
        h += rib(a, 0.1 + 0.2 * k, 0.012, 0.003) * (b > 0.04) * (b < MOUTH_D - 0.05)
    return h


def sill_c(a, b):
    rgb = paint(a.shape, STEEL_DARK * 0.85)
    rgb = mottle(rgb, a / 1.8, b / MOUTH_D, 151, 0.10, (6, 2))
    rgb = shade(rgb, 0.55 * smoothstep(0.05, MOUTH_D, b))
    rgb = shade(rgb, 0.35 * (1.0 - smoothstep(0.0, 0.08, np.minimum(a, 1.8 - a))))
    for k in range(9):
        rgb = mix(rgb, STEEL, 0.4 * soft_box(a, 0.1 + 0.2 * k, 0.008, 0.003) * (b > 0.04) * (1 - b / MOUTH_D))
    rgb = mix(rgb, STEEL * 1.05, 0.75 * (1.0 - smoothstep(0.012, 0.022, b)))
    return rgb


# ---------------------------------------------------------------- the step: riser and roofs
RISER_H = H - HR      # 0.35
VENT = (0.40, W - 0.40, 0.05, 0.245)
LOUVRE = 0.058


def riser_h(a, b):
    """Riser (faces back): a from the +X end, b up from the main roof."""
    d_end = np.minimum(a, W - a)
    h = quarter_round(d_end, 0.02) + quarter_round(np.maximum(RISER_H - b, 0.0), 0.012)
    post = 1.0 - smoothstep(POST - 0.003, POST, d_end)
    rail = smoothstep(RISER_H - RAIL - 0.003, RISER_H - RAIL, b)
    h += 0.003 * np.maximum(post, rail)
    vd, vin = rect_distance(a, b, *VENT)
    h += np.where(vin, -0.006 * smoothstep(0.0, 0.01, vd), 0.0)
    h += 0.004 * soft_box(vd, 0.012, 0.012, 0.003) * (~vin)
    slat = ((b - VENT[2]) % LOUVRE) / LOUVRE
    louvre = np.where(slat < 0.7, -0.008 * slat / 0.7, -0.008 + 0.008 * (slat - 0.7) / 0.3)
    h += louvre * rect(a, b, VENT[0] + 0.04, VENT[1] - 0.04, VENT[2] + 0.025, VENT[3] - 0.02, 0.004)
    return h


def riser_c(a, b):
    d_end = np.minimum(a, W - a)
    rgb = paint(a.shape, GREEN)
    rgb *= (1.0 + 0.08 * (value_noise(a / W, b / RISER_H, 6, 1, 171) - 0.5))[..., None]
    post = 1.0 - smoothstep(POST - 0.003, POST, d_end)
    rail = smoothstep(RISER_H - RAIL - 0.003, RISER_H - RAIL, b)
    fm = np.maximum(post, rail)
    galv = paint(a.shape, GALV) * (1.0 + 0.06 * (value_noise(a / W, b / RISER_H, 24, 3, 172) - 0.5))[..., None]
    galv = mix(galv, GALV_LIT, 0.6 * (1.0 - smoothstep(0.004, 0.014, np.minimum(d_end, RISER_H - b))))
    rgb = rgb * (1 - fm[..., None]) + galv * fm[..., None]
    vd, vin = rect_distance(a, b, *VENT)
    rgb = mix(rgb, STEEL_DARK * 0.9, vin * 1.0)
    rgb = mix(rgb, GALV * 0.85, soft_box(vd, 0.012, 0.012, 0.002) * (~vin))
    slat = ((b - VENT[2]) % LOUVRE) / LOUVRE
    inner = rect(a, b, VENT[0] + 0.04, VENT[1] - 0.04, VENT[2] + 0.025, VENT[3] - 0.02, 0.004)
    rgb = shade(rgb, inner * (0.6 * (slat > 0.7) + 0.2 * (1 - slat)))
    rgb = mix(rgb, STEEL, 0.35 * inner * soft_box(slat, 0.06, 0.04, 0.02))
    rgb = shade(rgb, 0.4 * vin * (1.0 - smoothstep(0.0, 0.012, vd)))
    for ra in (VENT[0] + 0.05, VENT[1] - 0.05, 0.5 * W):   # rust runs from the louvre frame
        run = soft_box(a, ra, 0.004, 0.004) * (b < VENT[2]) * (b > VENT[2] - 0.045)
        rgb = mix(rgb, RUST, 0.5 * run)
    rgb = shade(rgb, 0.40 * (1.0 - smoothstep(0.0, 0.06, b)))           # occlusion in the step's corner
    rgb = mix(rgb, STEEL_DARK, 0.5 * (1.0 - smoothstep(0.0, 0.005, np.minimum(d_end, RISER_H - b))))
    return rgb


LOW_L = ZR - ZB       # main roof depth, 1.45
CAP = (0.5 * W, ZR - (-0.05))   # cylinder cap over the chamber centre, x 0, z -0.05


def roof_low_h(a, b):
    """Main roof: a = x - XN, b back from the riser's foot."""
    h = quarter_round(np.minimum(np.minimum(a, W - a), LOW_L - b), 0.012)
    r = np.hypot(a - CAP[0], b - CAP[1])
    h += 0.015 * (1.0 - smoothstep(0.22, 0.235, r))
    h += 0.004 * (1.0 - smoothstep(0.12, 0.13, r))
    for k in range(8):
        t = k * math.pi / 4
        h += 0.5 * round_bar(np.hypot(a - CAP[0] - 0.18 * math.cos(t), b - CAP[1] - 0.18 * math.sin(t)), 0.0, 0.014)
    for lx in (0.30, W - 0.30):
        h += 0.02 * rect(a, b, lx - 0.05, lx + 0.05, CAP[1] - 0.02, CAP[1] + 0.02, 0.004)
    for sb in (CAP[1] + 0.40,):
        h += groove(np.abs(b - sb), 0.002, 0.003, 0.004)
    return h


def roof_low_c(a, b):
    rgb = paint(a.shape, GREEN)
    rgb = mottle(rgb, a / W, b / LOW_L, 121, 0.08, (5, 4))
    dust = value_noise(a / W, b / LOW_L, 9, 7, 123)
    rgb = mix(rgb, DUST, 0.12 + 0.12 * dust)
    rgb = shade(rgb, 0.12)
    rgb = shade(rgb, 0.38 * (1.0 - smoothstep(0.0, 0.12, b)))          # occlusion at the riser's foot
    r = np.hypot(a - CAP[0], b - CAP[1])
    rgb = mix(rgb, LID_FIT, 1.0 - smoothstep(0.22, 0.235, r))
    rgb = mix(rgb, LID_FIT_LIT, 0.8 * (1.0 - smoothstep(0.12, 0.13, r)))
    rgb = shade(rgb, 0.35 * soft_box(r, 0.24, 0.004, 0.012))
    for k in range(8):
        t = k * math.pi / 4
        rgb = mix(rgb, LID_FIT_LIT, disc(a, b, CAP[0] + 0.18 * math.cos(t), CAP[1] + 0.18 * math.sin(t), 0.011))
    for lx in (0.30, W - 0.30):
        rgb = mix(rgb, LID_FIT, rect(a, b, lx - 0.05, lx + 0.05, CAP[1] - 0.02, CAP[1] + 0.02, 0.003))
        rgb = shade(rgb, 0.3 * rect(a, b, lx - 0.05, lx + 0.05, CAP[1] + 0.02, CAP[1] + 0.045, 0.006))
    for sb in (CAP[1] + 0.40,):
        rgb = shade(rgb, 0.4 * (1.0 - smoothstep(0.002, 0.005, np.abs(b - sb))))
    d = np.minimum(np.minimum(a, W - a), LOW_L - b)
    rgb = chips(rgb, d, a / W, b / LOW_L, 125, 0.02, PRIMER, 0.6, cells=80)
    rgb = mix(rgb, STEEL_DARK, 0.4 * (1.0 - smoothstep(0.0, 0.006, d)))
    return rgb


HEAD_L = ZF - ZR      # head roof depth, 0.61
HEAD_COVERS = ((0.30, 1.13), (1.33, W - 0.30))


def roof_head_h(a, b):
    """Head roof: a = x - XN, b back from the front edge."""
    h = quarter_round(np.minimum(np.minimum(a, W - a), np.minimum(b, HEAD_L - b)), 0.012)
    for c0, c1 in HEAD_COVERS:
        cd, cin = rect_distance(a, b, c0, c1, 0.12, HEAD_L - 0.12)
        h += np.where(cin, 0.004 * smoothstep(0.0, 0.004, cd), 0.0)
        for ca in (c0 + 0.04, c1 - 0.04):
            for cb in (0.16, HEAD_L - 0.16):
                h += 0.5 * round_bar(np.hypot(a - ca, b - cb), 0.0, 0.011)
    return h


def roof_head_c(a, b):
    rgb = paint(a.shape, GREEN)
    rgb = mottle(rgb, a / W, b / HEAD_L, 131, 0.08, (5, 2))
    rgb = mix(rgb, DUST, 0.12 + 0.12 * value_noise(a / W, b / HEAD_L, 9, 3, 132))
    rgb = shade(rgb, 0.12)
    for c0, c1 in HEAD_COVERS:
        cd, cin = rect_distance(a, b, c0, c1, 0.12, HEAD_L - 0.12)
        rgb = rgb * np.where(cin, 1.05, 1.0)[..., None]
        rgb = shade(rgb, 0.4 * (~cin) * (1.0 - smoothstep(0.0, 0.01, cd)))
        for ca in (c0 + 0.04, c1 - 0.04):
            for cb in (0.16, HEAD_L - 0.16):
                rgb = mix(rgb, LID_FIT_LIT, disc(a, b, ca, cb, 0.011))
    d = np.minimum(np.minimum(a, W - a), np.minimum(b, HEAD_L - b))
    rgb = chips(rgb, d, a / W, b / HEAD_L, 133, 0.02, PRIMER, 0.6, cells=80)
    rgb = mix(rgb, STEEL_DARK, 0.4 * (1.0 - smoothstep(0.0, 0.006, d)))
    return rgb


# ---------------------------------------------------------------- ejection door
DOOR_W, DOOR_H = 2 * DOOR_Z, DOOR_Y1 - DOOR_Y0           # 1.56 x 1.39
DOOR_HINGES = (0.20, 1.12)                               # hinge straps (db)


def door_h(da, db):
    """Ejection door leaf, da 0..DOOR_W from its rear (-z, hinge) edge, db 0..DOOR_H up."""
    Wd, Hd = DOOR_W, DOOR_H
    edge = np.minimum(np.minimum(da, Wd - da), np.minimum(db, Hd - db))
    h = quarter_round(edge, 0.012)
    dist, inside = rect_distance(da, db, 0.075, Wd - 0.075, 0.075, Hd - 0.075)
    h += np.where(inside, -0.010 * smoothstep(0.0, 0.016, dist), 0.0)       # panel sunk inside a 75 mm frame
    h += rib(db, 0.70, 0.02, 0.007) * rect(da, db, 0.12, Wd - 0.12, -1, 9, 0.02)
    for hb in DOOR_HINGES:                                                   # hinge straps from the knuckles
        h += 0.006 * rect(da, db, -0.1, 0.30, hb - 0.04, hb + 0.04, 0.005) * (1.0 - smoothstep(0.24, 0.30, da))
        for bx in (0.08, 0.18):
            h += 0.5 * round_bar(np.hypot(da - bx, db - hb), 0.0, 0.012)
    h += 0.024 * smoothstep(0.0, 1.0, round_bar(da, Wd - 0.13, 0.017) / 0.017) * rect(da, db, -1, 9, 0.42, 0.90, 0.006)
    h += 0.012 * rect(da, db, Wd - 0.17, Wd - 0.08, 0.61, 0.71, 0.004)      # latch keeper
    return h


def door_c(da, db, seed=101):
    Wd, Hd = DOOR_W, DOOR_H
    rgb = paint(da.shape, GREEN_DARK)
    rgb *= (1.0 + 0.10 * (value_noise(da / Wd, db / Hd, 4, 3, seed) - 0.5))[..., None]
    rgb *= (1.0 + 0.04 * (value_noise(da / Wd, db / Hd, 20, 18, seed + 1) - 0.5))[..., None]
    dist, inside = rect_distance(da, db, 0.075, Wd - 0.075, 0.075, Hd - 0.075)
    rgb = rgb * np.where(inside, 1.07, 0.90)[..., None]
    # The frame's inner bevel: lit along the bottom rail (it faces up), in shadow under the top rail.
    bevel = inside * (1.0 - smoothstep(0.0, 0.018, dist))
    rgb = shade(rgb, 0.45 * bevel * (db > Hd - 0.075 - 0.02))
    rgb = shade(rgb, 0.28 * bevel * ((da < 0.095) | (da > Wd - 0.095)))
    rgb = mix(rgb, GREEN_DARK * 1.4, 0.5 * bevel * (db < 0.095))
    rgb = chips(rgb, np.abs(dist), da / Wd, db / Hd, seed + 3, 0.012, PRIMER, 0.5 * (~inside), cells=70)
    rgb = shade(rgb, 0.15 * soft_box(np.abs(db - 0.70), 0.03, 0.006, 0.005) * (da > 0.12) * (da < Wd - 0.12))
    for hb in DOOR_HINGES:
        strap = rect(da, db, -0.1, 0.30, hb - 0.04, hb + 0.04, 0.003) * (1.0 - smoothstep(0.24, 0.30, da))
        rgb = mix(rgb, GALV, strap)
        rgb = mix(rgb, GALV_LIT, 0.5 * strap * soft_box(db, hb + 0.03, 0.006, 0.004))
        for bx in (0.08, 0.18):
            rgb = mix(rgb, STEEL_DARK, disc(da, db, bx, hb, 0.01))
        rgb = shade(rgb, 0.3 * soft_box(db, hb - 0.048, 0.006, 0.004) * (da < 0.3))
        rgb = mix(rgb, RUST, 0.5 * soft_box(da, 0.08, 0.003, 0.003) * (db < hb - 0.05) * (db > hb - 0.17) * np.clip((db - hb + 0.17) / 0.12, 0, 1))
    rgb = mix(rgb, STEEL, rect(da, db, Wd - 0.147, Wd - 0.113, 0.42, 0.90, 0.003))
    rgb = shade(rgb, 0.3 * rect(da, db, Wd - 0.11, Wd - 0.095, 0.42, 0.90, 0.003))
    rgb = mix(rgb, STEEL_DARK, rect(da, db, Wd - 0.17, Wd - 0.08, 0.61, 0.71, 0.003))
    lab = rect(da, db, 0.62, 0.94, 1.00, 1.16, 0.002)                        # "eject" warning plate
    rgb = mix(rgb, YELLOW, lab)
    ld, _ = rect_distance(da, db, 0.62, 0.94, 1.00, 1.16)
    rgb = mix(rgb, BLACK, lab * (1.0 - smoothstep(0.008, 0.012, ld)))
    rgb = mix(rgb, BLACK, 0.85 * lab * rect(da, db, 0.68, 0.88, 1.065, 1.095, 0.002))
    edge = np.minimum(np.minimum(da, Wd - da), np.minimum(db, Hd - db))
    rgb = chips(rgb, edge, da / Wd, db / Hd, seed + 2, 0.022, PRIMER, 0.7, cells=60)
    rgb = mix(rgb, STEEL_DARK, 0.45 * (1.0 - smoothstep(0.0, 0.006, edge)))
    g = (1.0 - smoothstep(0.0, 0.4, db)) * (0.35 + 0.4 * value_noise(da / Wd, db / Hd, 20, 3, seed + 4))
    rgb = mix(rgb, GRIME, 0.5 * g)
    return rgb


def door_edge(kind, seed):
    """The leaf's exposed thickness. a runs along the edge; b across the 80 mm."""
    def h(a, b):
        bm = max(float(b.max()), 1e-3)
        h = quarter_round(np.minimum(b, bm - b), 0.008)
        if kind == 'rear':  # hinge knuckles, 170 mm long, round across the edge
            for hb in DOOR_HINGES:
                h += round_bar(b, 0.5 * bm, 0.022) * 0.8 * rect(a, b, hb - 0.085, hb + 0.085, -1, 9, 0.004)
        return h

    def c(a, b):
        bm = max(float(b.max()), 1e-3)
        am = max(float(a.max()), 1e-3)
        rgb = paint(a.shape, GREEN_DARK * 0.92)
        rgb = mottle(rgb, a / am, b / bm, seed, 0.06, (6, 1))
        if kind == 'top':
            rgb = mix(rgb, DUST, 0.18)
        if kind == 'rear':
            for hb in DOOR_HINGES:
                k = rect(a, b, hb - 0.085, hb + 0.085, -1, 9, 0.003)
                cyl = 1.0 - 0.5 * np.abs(b / bm - 0.35) * 2
                rgb = mix(rgb, GALV * np.clip(cyl, 0.5, 1.2)[..., None], k)
                rgb = shade(rgb, 0.5 * soft_box(a, hb, 0.003, 0.002) * k)   # knuckle joint
        if kind in ('rear', 'front'):
            rgb = mix(rgb, GRIME, 0.4 * (1.0 - smoothstep(0.0, 0.4, a)))
        rgb = chips(rgb, np.minimum(b, bm - b), a / am, b / bm, seed + 1, 0.008, PRIMER, 0.55, cells=40)
        rgb = mix(rgb, STEEL_DARK, 0.4 * (1.0 - smoothstep(0.0, 0.005, np.minimum(b, bm - b))))
        return rgb
    return h, c


# ---------------------------------------------------------------- control box
BOX_FW, BOX_FH = BOX_Z1 - BOX_Z0, BOX_Y1 - BOX_Y0   # 0.32 x 0.45; a = BOX_Z1 - z, b = y - BOX_Y0
LAMPS = ((BOX_Z1 - 0.8, 0.35), (BOX_Z1 - 0.8, 0.25), (BOX_Z1 - 0.8, 0.15))
KEY = (0.26, 0.07)


def box_face_h(a, b):
    h = quarter_round(np.minimum(np.minimum(a, BOX_FW - a), np.minimum(b, BOX_FH - b)), 0.012)
    dist, inside = rect_distance(a, b, 0.03, BOX_FW - 0.03, 0.03, BOX_FH - 0.03)   # door seam of the enclosure
    h += groove(dist, 0.0015, 0.002, 0.003)
    for la, lb in LAMPS:
        r = np.hypot(a - la, b - lb)
        h += 0.004 * soft_box(r, 0.042, 0.006, 0.004) * (r > 0.03)
    h += 0.008 * (1.0 - smoothstep(0.014, 0.018, np.hypot(a - KEY[0], b - KEY[1])))
    return h


def box_face_c(a, b):
    rgb = paint(a.shape, CONTROL)
    rgb = mottle(rgb, a / BOX_FW, b / BOX_FH, 81, 0.06)
    dist, inside = rect_distance(a, b, 0.03, BOX_FW - 0.03, 0.03, BOX_FH - 0.03)
    rgb = shade(rgb, 0.45 * (1.0 - smoothstep(0.001, 0.003, dist)))
    for la, lb in LAMPS:
        r = np.hypot(a - la, b - lb)
        rgb = mix(rgb, BLACK, 1.0 - smoothstep(0.046, 0.05, r))
    rgb = mix(rgb, STEEL, 1.0 - smoothstep(0.014, 0.018, np.hypot(a - KEY[0], b - KEY[1])))
    rgb = mix(rgb, PALE, 0.8 * rect(a, b, 0.04, 0.11, 0.385, 0.405, 0.002))
    d = np.minimum(np.minimum(a, BOX_FW - a), np.minimum(b, BOX_FH - b))
    rgb = chips(rgb, d, a / BOX_FW, b / BOX_FH, 83, 0.01, STEEL_DARK, 0.6)
    rgb = mix(rgb, STEEL_DARK * 1.2, 0.5 * (1.0 - smoothstep(0.0, 0.005, d)))
    return rgb


# Chamber cheeks: dark steel; their texel frames run from the lip inward.
def cheek():
    def h(a, b):
        return quarter_round(np.minimum(a, 1.0), 0.008)

    def c(a, b):
        am = max(float(a.max()), 1e-3)
        rgb = paint(a.shape, STEEL_DARK * 0.55)
        rgb = shade(rgb, 0.5 * np.clip(a / am, 0.0, 1.0))
        rgb = mix(rgb, STEEL * 0.9, 0.6 * (1.0 - smoothstep(0.006, 0.014, a)))
        return rgb
    return h, c


# Small strips (control box sides and hood): plain, with a worn arris.
def strip(colour, seed):
    def h(a, b):
        return quarter_round(np.minimum(np.minimum(a, float(a.max()) - a), np.minimum(b, float(b.max()) - b)), 0.006)

    def c(a, b):
        am, bm = max(float(a.max()), 1e-3), max(float(b.max()), 1e-3)
        rgb = paint(a.shape, colour)
        rgb = mottle(rgb, a / am, b / bm, seed, 0.06, (4, 2))
        d = np.minimum(np.minimum(a, am - a), np.minimum(b, bm - b))
        rgb = mix(rgb, STEEL_DARK * 1.1, 0.5 * (1.0 - smoothstep(0.0, 0.006, d)))
        return rgb
    return h, c


# ---------------------------------------------------------------- faces
# Each face: name, island, polygon (runtime frame), outward hint. Hand frames
# (origin, a_dir, b_dir) are the coordinates the fields are written in; the rest
# get a frame from their own polygon (a along the first edge). a_dir x b_dir is
# the outward normal, except for faces in MIRRORED, whose UVs are mirrored.
def v3(*p):
    return np.array(p, np.float64)


EX, EY, EZ = v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)
FRAMES = {
    'front': (v3(XN, 0, ZF), EX, EY),
    'back': (v3(XP, 0, ZB), -EX, EY),
    'nx': (v3(XN, 0, ZB), EZ, EY),
    'px': (v3(XP, 0, ZB), EZ, EY),            # mirrored: the same (a, b) as -X
    'riser': (v3(XP, HR, ZR), -EX, EY),
    'roof_low': (v3(XN, HR, ZR), EX, -EZ),
    'roof_head': (v3(XN, H, ZF), EX, -EZ),
    'door_leaf': (v3(DOOR_X, DOOR_Y0, -DOOR_Z), EZ, EY),
    'box_face': (v3(BOX_X, BOX_Y0, BOX_Z1), -EZ, EY),
}
MIRRORED = {'px'}

FA, FB, FC, FD = v3(XN, 0, ZF), v3(XP, 0, ZF), v3(XP, H, ZF), v3(XN, H, ZF)
BA, BB = v3(XP, 0, ZB), v3(XN, 0, ZB)                     # back wall foot, +x then -x
BCN, BCP = v3(XN, HR, ZB), v3(XP, HR, ZB)                 # main roof's back edge
RN0, RP0 = v3(XN, HR, ZR), v3(XP, HR, ZR)                 # riser foot
RN1, RP1 = v3(XN, H, ZR), v3(XP, H, ZR)                   # riser top, the head's back edge
GTL, GBL, GTR, GBR = (v3(-GATE_X, GATE_Y1, GATE_Z), v3(-GATE_X, GATE_Y0, GATE_Z),
                      v3(GATE_X, GATE_Y1, GATE_Z), v3(GATE_X, GATE_Y0, GATE_Z))
ML, MR = v3(-GATE_X, YS, ZF), v3(GATE_X, YS, ZF)
SL, SR = v3(-GATE_X, YS, ZM), v3(GATE_X, YS, ZM)
# Front wall: a ring round the gate + chamber notch (x +-0.9, y YS .. 2.5),
# hand-triangulated with every notch corner a shared vertex.
FRONT_TRIS = [
    (FA, FB, MR), (FA, MR, ML),                       # under the lip
    (FA, ML, GBL), (FA, GBL, GTL), (FA, GTL, FD),     # -X post
    (FD, GTL, GTR), (FD, GTR, FC),                    # the head band over the gate (sign)
    (MR, FB, GBR), (GBR, FB, FC), (GBR, FC, GTR),     # +X post
]
# Ejection door leaf, proud of the -X wall, its foot at the plinth top.
DL = [v3(DOOR_X, DOOR_Y0, -DOOR_Z), v3(DOOR_X, DOOR_Y1, -DOOR_Z), v3(DOOR_X, DOOR_Y1, DOOR_Z), v3(DOOR_X, DOOR_Y0, DOOR_Z)]
DW = [v3(XN, DOOR_Y0, -DOOR_Z), v3(XN, DOOR_Y1, -DOOR_Z), v3(XN, DOOR_Y1, DOOR_Z), v3(XN, DOOR_Y0, DOOR_Z)]
# Control box: straight housing, 45-degree hood overhanging its sides.
BOX_FACE = [v3(BOX_X, BOX_Y1, BOX_Z1), v3(BOX_X, BOX_Y0, BOX_Z1), v3(BOX_X, BOX_Y0, BOX_Z0), v3(BOX_X, BOX_Y1, BOX_Z0)]
HZ0, HZ1 = BOX_Z0 - HOOD_OVER, BOX_Z1 + HOOD_OVER

FACES = (
    [('front_%d' % k, 'front', list(t), None) for k, t in enumerate(FRONT_TRIS)] + [
        # loading gate: its front is the fallback's exact two triangles (label contract)
        ('gate_front_a', 'front', [GTL, GBL, GTR], None),
        ('gate_front_b', 'front', [GBL, GBR, GTR], None),
        # loading chamber: floor behind the lip, back face up to the gate's bottom edge, cheeks
        ('sill', 'sill', [ML, MR, SR, SL], EY),
        ('mouth_back', 'front', [SL, SR, GBR, GBL], None),
        ('cheek_nx', 'cheek_nx', [ML, SL, GBL], EX),
        ('cheek_px', 'cheek_px', [MR, GBR, SR], -EX),
        # the stepped shell: back, L-shaped sides, main roof, riser, head roof
        ('back', 'wall', [BA, BB, BCN, BCP], None),
        ('nx', 'wall', [BB, FA, FD, RN1, RN0, BCN], None),
        ('px', 'wall', [FB, BA, BCP, RP0, RP1, FC], None),
        ('roof_low', 'roof_low', [BCN, BCP, RP0, RN0], None),
        ('riser', 'riser', [RP0, RN0, RN1, RP1], None),
        ('roof_head', 'roof_head', [RN1, FD, FC, RP1], None),
        # ejection door: proud leaf, top and the two side edges (each listed from the foot / hinge)
        ('door_leaf', 'door_leaf', DL, None),
        ('door_top', 'door_top', [DW[1], DW[2], DL[2], DL[1]], EY),
        ('door_rear', 'door_rear', [DL[0], DL[1], DW[1], DW[0]], -EZ),
        ('door_front', 'door_front', [DL[3], DL[2], DW[2], DW[3]], EZ),
        # control box: face flat at x 1.375 for the runtime lamps, hood, sides
        ('box_out', 'box_face', BOX_FACE, None),
        ('box_hood', 'box_hood', [v3(XP, HOOD_TOP, HZ1), v3(XP, HOOD_TOP, HZ0), v3(BOX_X, BOX_Y1, HZ0), v3(BOX_X, BOX_Y1, HZ1)],
         v3(1, 1, 0)),
        ('box_side_f', 'box_side_f', [v3(XP, BOX_Y0, BOX_Z1), v3(XP, HOOD_TOP, BOX_Z1), v3(BOX_X, BOX_Y1, BOX_Z1), v3(BOX_X, BOX_Y0, BOX_Z1)],
         EZ),
        ('box_side_b', 'box_side_b', [v3(XP, HOOD_TOP, BOX_Z0), v3(XP, BOX_Y0, BOX_Z0), v3(BOX_X, BOX_Y0, BOX_Z0), v3(BOX_X, BOX_Y1, BOX_Z0)],
         -EZ),
    ])
FRAMES['box_out'] = FRAMES['box_face']


def polygon_normal(poly):
    n = np.zeros(3)
    for i in range(len(poly)):
        n += np.cross(poly[i], poly[(i + 1) % len(poly)])
    return n / np.linalg.norm(n)


def auto_frame(poly, hint):
    n = polygon_normal(poly)
    if n @ hint < 0:
        n = -n
    ad = poly[1] - poly[0]
    ad = ad - (ad @ n) * n
    ad /= np.linalg.norm(ad)
    bd = np.cross(n, ad)
    a = [(p - poly[0]) @ ad for p in poly]
    b = [(p - poly[0]) @ bd for p in poly]
    return (poly[0] + min(a) * ad + min(b) * bd, ad, bd)


for _name, _island, _poly, _hint in FACES:
    if _hint is not None:
        FRAMES[_name] = auto_frame(_poly, _hint)


def face_frame(name, island):
    return name if name in FRAMES else island


def face_ab(frame_name, p):
    o, ad, bd = FRAMES[frame_name]
    d = p - o
    return float(d @ ad), float(d @ bd)


def island_extent(name):
    pts = [face_ab(face_frame(fname, isl), p) for fname, isl, poly, _ in FACES if isl == name for p in poly]
    a = [q[0] for q in pts]
    b = [q[1] for q in pts]
    assert min(a) > -1e-9 and min(b) > -1e-9, (name, min(a), min(b))
    return (max(a), max(b))


# The two sides share the wall island: check they really are congruent in it.
_POLY = {f[0]: f[2] for f in FACES}
assert np.allclose(sorted(face_ab('px', p) for p in _POLY['px']),
                   sorted(face_ab('nx', p) for p in _POLY['nx']))

# ---------------------------------------------------------------- atlas
FIELDS = {
    'front': (front_h, front_c),
    'wall': (wall_h, wall_c),
    'riser': (riser_h, riser_c),
    'roof_low': (roof_low_h, roof_low_c),
    'roof_head': (roof_head_h, roof_head_c),
    'door_leaf': (lambda a, b: door_h(a, b), lambda a, b: door_c(a, b)),
    'box_face': (box_face_h, box_face_c),
    'sill': (sill_h, sill_c),
    'cheek_nx': cheek(),
    'cheek_px': cheek(),
    'door_top': door_edge('top', 151),
    'door_rear': door_edge('rear', 153),
    'door_front': door_edge('front', 155),
    'box_hood': strip(CONTROL * 1.08, 161),
    'box_side_f': strip(CONTROL * 0.95, 163),
    'box_side_b': strip(CONTROL * 0.88, 165),
}
# Texel density (atlas metres per face metre): one density for the walls, the
# front, the riser and the door leaf; the roofs, read from above at a distance,
# less; the chamber's floor and cheeks, in shadow, less.
DENSITY = {'roof_low': 0.6, 'roof_head': 0.8, 'sill': 0.6, 'cheek_nx': 0.6, 'cheek_px': 0.6}
MIN_STRIP = 0.035  # thin strips are stretched across to at least this many atlas metres


class Island:
    """A face's rectangle in the atlas, optionally turned a quarter (never mirrored)."""

    def __init__(self, name, extent):
        self.name = name
        self.extent = extent
        s = DENSITY.get(name, 1.0)
        self.sa = s
        self.sb = max(s, MIN_STRIP / extent[1]) if extent[1] < MIN_STRIP else s
        self.flat = (extent[0] * self.sa, extent[1] * self.sb)
        self.rot = False
        self.origin = None
        self.height, self.colour = FIELDS[name]

    @property
    def size(self):
        return self.flat[::-1] if self.rot else self.flat

    def to_atlas(self, a, b):
        if self.rot:  # +90 degrees: face +a runs up atlas v, face +b runs toward -u
            return (self.origin[0] + (self.extent[1] - b) * self.sb, self.origin[1] + a * self.sa)
        return (self.origin[0] + a * self.sa, self.origin[1] + b * self.sb)

    def to_face(self, u, v):
        if self.rot:
            a = (v - self.origin[1]) / self.sa
            b = self.extent[1] - (u - self.origin[0]) / self.sb
        else:
            a = (u - self.origin[0]) / self.sa
            b = (v - self.origin[1]) / self.sb
        return np.clip(a, 0.0, self.extent[0]), np.clip(b, 0.0, self.extent[1])

    def steps(self):
        """Face (da, db) for one atlas metre along +u and along +v."""
        if self.rot:
            return (0.0, -1.0 / self.sb), (1.0 / self.sa, 0.0)
        return (1.0 / self.sa, 0.0), (0.0, 1.0 / self.sb)

    @property
    def rect(self):
        w, h = self.size
        return (self.origin[0], self.origin[0] + w, self.origin[1], self.origin[1] + h)


GAP = 0.03
DILATE = 0.015


def pack(islands):
    """Deterministic bottom-left packing (with quarter turns) into the smallest square found."""
    order = sorted(islands, key=lambda i: (-max(i.flat) * min(i.flat), i.name))
    total = sum((i.flat[0] + GAP) * (i.flat[1] + GAP) for i in islands)
    side = math.sqrt(total)

    def overlaps(r, placed):
        return any(r[0] < q[1] + GAP and q[0] < r[1] + GAP and r[2] < q[3] + GAP and q[2] < r[3] + GAP
                   for q in placed)

    while True:
        placed, choice, ok = [], {}, True
        for isl in order:
            best = None
            xs = sorted({GAP} | {q[1] + GAP for q in placed})
            ys = sorted({GAP} | {q[3] + GAP for q in placed})
            for rot in (False, True):
                w, h = isl.flat[::-1] if rot else isl.flat
                for y in ys:
                    if best is not None and y > best[0]:
                        break
                    for x in xs:
                        r = (x, x + w, y, y + h)
                        if r[1] + GAP > side or r[3] + GAP > side or overlaps(r, placed):
                            continue
                        if best is None or (y, x) < best[:2]:
                            best = (y, x, rot, r)
                        break
            if best is None:
                ok = False
                break
            placed.append(best[3])
            choice[isl.name] = (best[1], best[0], best[2])
        if ok:
            for isl in islands:
                x, y, rot = choice[isl.name]
                isl.origin, isl.rot = (x, y), rot
            return side
        side += 0.02


ISLANDS = {name: Island(name, island_extent(name)) for name in FIELDS}
ATLAS = pack(list(ISLANDS.values()))
# The packing leaves the top of the square empty: crop the atlas to what is used,
# in 1/64 steps of its width so both textures keep whole pixels at one texel size.
ROWS_64 = math.ceil((max(i.rect[3] for i in ISLANDS.values()) + GAP) / ATLAS * 64)
ATLAS_V = ATLAS * ROWS_64 / 64
assert COLOUR_PX % 64 == 0 and NORMAL_PX % 64 == 0


def atlas_grid(px):
    nu = px * SUPERSAMPLE
    nv = px * ROWS_64 // 64 * SUPERSAMPLE
    cu = (np.arange(nu, dtype=np.float64) + 0.5) / nu * ATLAS
    cv = (np.arange(nv, dtype=np.float64) + 0.5) / nv * ATLAS_V
    uu, vv = np.meshgrid(cu, cv)  # row 0 = v 0 (bottom)
    return uu, vv


def nearest_island(uu, vv):
    names = list(ISLANDS)
    dists = []
    for name in names:
        u0, u1, v0, v1 = ISLANDS[name].rect
        du = np.maximum(np.maximum(u0 - uu, uu - u1), 0.0)
        dv = np.maximum(np.maximum(v0 - vv, vv - v1), 0.0)
        dists.append(np.hypot(du, dv))
    stack = np.stack(dists)
    return names, np.argmin(stack, axis=0), stack.min(axis=0)


def block_mean(arr):
    s = SUPERSAMPLE
    h, w = arr.shape[0] // s, arr.shape[1] // s
    return arr.reshape(h, s, w, s, *arr.shape[2:]).mean(axis=(1, 3))


def build_normal_pixels():
    uu, vv = atlas_grid(NORMAL_PX)
    names, owner, gap = nearest_island(uu, vv)
    owner = np.where(gap <= DILATE, owner, -1)  # unused atlas stays flat
    n = np.zeros(uu.shape + (3,), np.float64)
    n[..., 2] = 1.0
    eps = 0.25 * ATLAS / (NORMAL_PX * SUPERSAMPLE)
    for idx, name in enumerate(names):
        isl = ISLANDS[name]
        mask = owner == idx
        if not mask.any():
            continue
        a, b = isl.to_face(uu[mask], vv[mask])
        su, sv = (np.array(d) / np.linalg.norm(d) for d in isl.steps())  # unit face steps

        def h_at(da, db):
            return isl.height(np.clip(a + da, 0, isl.extent[0]), np.clip(b + db, 0, isl.extent[1]))

        dh_du = (h_at(su[0] * eps, su[1] * eps) - h_at(-su[0] * eps, -su[1] * eps)) / (2 * eps)
        dh_dv = (h_at(sv[0] * eps, sv[1] * eps) - h_at(-sv[0] * eps, -sv[1] * eps)) / (2 * eps)
        n[mask, 0] = -np.clip(dh_du, -MAX_SLOPE, MAX_SLOPE)
        n[mask, 1] = -np.clip(dh_dv, -MAX_SLOPE, MAX_SLOPE)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = block_mean(n)
    # Snap the slopes to a fixed ladder (fine near flat, coarse on steep flanks) so the
    # map holds at most 15 x 15 normals and is written as an indexed PNG.
    ladder = np.array(NORMAL_LADDER)
    for k in (0, 1):
        n[..., k] = ladder[np.abs(n[..., k, None] - ladder).argmin(-1)]
    n[..., 2] = np.sqrt(np.clip(1.0 - n[..., 0] ** 2 - n[..., 1] ** 2, 0.02, 1.0))
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


_STEPS = (0.0, 0.04, 0.10, 0.18, 0.30, 0.45, 0.65, 0.85)
NORMAL_LADDER = tuple(sorted({-x for x in _STEPS} | set(_STEPS)))


def build_colour_pixels():
    uu, vv = atlas_grid(COLOUR_PX)
    names, owner, gap = nearest_island(uu, vv)
    owner = np.where(gap <= DILATE, owner, -1)
    rgb = np.broadcast_to(GREEN * 0.8, uu.shape + (3,)).astype(np.float64).copy()
    for idx, name in enumerate(names):
        isl = ISLANDS[name]
        mask = owner == idx
        if not mask.any():
            continue
        a, b = isl.to_face(uu[mask], vv[mask])
        rgb[mask] = isl.colour(a, b)
    rgb = block_mean(rgb)
    return np.clip(np.round(rgb), 0, 255).astype(np.uint8)


def write_jpeg(path, rgb, quality):
    """Progressive JPEG through Blender's bundled OpenImageIO."""
    import OpenImageIO as oiio
    h, w, _ = rgb.shape
    spec = oiio.ImageSpec(w, h, 3, 'uint8')
    spec.attribute('Compression', f'jpeg:{quality}')
    spec.attribute('jpeg:progressive', 1)
    out = oiio.ImageOutput.create(path)
    assert out is not None and out.open(path, spec), oiio.geterror()
    out.write_image(np.ascontiguousarray(rgb[::-1]))  # rows top-first; `rgb` row 0 is v = 0
    out.close()


def png_chunk(tag, payload):
    return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)


def write_png(path, rgb):
    """RGB8 PNG (rows top-first). If the image holds at most 256 distinct colours it
    is written losslessly as an indexed PNG, which a mostly flat normal map is."""
    rows = rgb[::-1]
    h, w, _ = rows.shape
    flat = rows.reshape(-1, 3)
    colours, index = np.unique(flat, axis=0, return_inverse=True)
    if len(colours) <= 256:
        idx = index.reshape(h, w).astype(np.int16)
        raw = bytearray()
        prev = np.zeros(w, np.int16)
        for r in range(h):
            line = idx[r]
            sub = line.copy()
            sub[1:] = line[1:] - line[:-1]
            up = line - prev
            cands = [(0, line), (1, sub), (2, up)]
            cost = [np.abs(((c + 128) % 256) - 128).sum() for _, c in cands]
            ftype, data = cands[int(np.argmin(cost))]
            raw.append(ftype)
            raw += (data % 256).astype(np.uint8).tobytes()
            prev = line
        png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0))
        png += png_chunk(b'PLTE', colours.astype(np.uint8).tobytes())
        png += png_chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + png_chunk(b'IEND', b'')
        with open(path, 'wb') as f:
            f.write(png)
        return len(colours)
    rows = rows.astype(np.int16)
    flat = rows.reshape(h, w * 3)
    out = bytearray()
    prev = np.zeros(w * 3, np.int16)
    for r in range(h):
        line = flat[r]
        sub = line.copy()
        sub[3:] = line[3:] - line[:-3]
        up = line - prev
        candidates = [(0, line), (1, sub), (2, up)]
        cost = [np.abs(((c + 128) % 256) - 128).sum() for _, c in candidates]
        ftype, data = candidates[int(np.argmin(cost))]
        out.append(ftype)
        out += (data % 256).astype(np.uint8).tobytes()
        prev = line
    png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += png_chunk(b'IDAT', zlib.compress(bytes(out), 9)) + png_chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    return len(colours)


# ---------------------------------------------------------------- geometry
def to_blender(p):
    """three.js (x, y, z) -> Blender (x, -z, y), after the runtime offset."""
    q = p - OFFSET
    return (float(q[0]), float(-q[2]), float(q[1]))


def oriented(poly, normal):
    n = np.zeros(3)
    for i in range(len(poly)):
        n += np.cross(poly[i], poly[(i + 1) % len(poly)])
    if n @ normal < 0:
        poly = poly[::-1]
    return poly


def triangulate(name, poly):
    """Ear clipping in the polygon's own plane."""
    if len(poly) == 3:
        return [poly]
    n = polygon_normal(poly)
    ax = poly[1] - poly[0]
    ax = ax - (ax @ n) * n
    ax /= np.linalg.norm(ax)
    ay = np.cross(n, ax)
    pts = [np.array([p @ ax, p @ ay]) for p in poly]

    def cross2(o, p, q):
        return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])

    idx = list(range(len(poly)))
    tris = []
    while len(idx) > 3:
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if cross2(a, b, c) <= 1e-9:
                continue
            inside = any(cross2(a, b, pts[j]) >= -1e-12 and cross2(b, c, pts[j]) >= -1e-12 and cross2(c, a, pts[j]) >= -1e-12
                         for j in idx if j not in (i0, i1, i2))
            if inside:
                continue
            tris.append([poly[i0], poly[i1], poly[i2]])
            idx.pop(k)
            break
        else:
            raise AssertionError(f'{name}: no ear')
    tris.append([poly[i] for i in idx])
    return tris


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    verts = {}

    def vert(p):
        key = tuple(np.round(p, 6))
        if key not in verts:
            verts[key] = bm.verts.new(to_blender(p))
        return verts[key]

    tri_count = 0
    for name, island, poly, _ in FACES:
        frame = face_frame(name, island)
        o, ad, bd = FRAMES[frame]
        normal = np.cross(ad, bd) * (-1.0 if name in MIRRORED else 1.0)
        poly = oriented(list(poly), normal)
        isl = ISLANDS[island]
        for tri in triangulate(name, poly):
            f = bm.faces.new([vert(p) for p in tri])
            tri_count += 1
            for loop, p in zip(f.loops, tri):
                a, b = face_ab(frame, p)
                u, v = isl.to_atlas(a, b)
                loop[uv_layer].uv = (u / ATLAS, v / ATLAS_V)
    assert tri_count == 50, tri_count
    bm.normal_update()
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def check_contract(mesh):
    co = np.array([v.co[:] for v in mesh.vertices])  # Blender axes
    three = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    lo, hi = three.min(axis=0), three.max(axis=0)
    size = hi - lo
    centre = (lo + hi) / 2
    assert abs(lo[1]) < 1e-6, lo
    assert abs(centre[0]) < 0.001 and abs(centre[2]) < 0.001, centre
    assert 2.684 <= size[0] <= 2.686, size
    assert 2.649 <= size[1] <= 2.651, size
    assert 2.059 <= size[2] <= 2.061, size
    print('YARD_COMPACTOR_BOUNDS', [round(x, 5) for x in size], 'centre', [round(x, 6) for x in centre])


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.52

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-compactor-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-compactor-body-normal'
    normal_img.colorspace_settings.is_data = True

    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    colour_node.interpolation = 'Linear'
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])

    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_tex.interpolation = 'Linear'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-compactor-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='yard-compactor-body-')
    try:
        colour_path = os.path.join(stage, 'yard-compactor-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-compactor-body-normal.png')
        write_jpeg(colour_path, build_colour_pixels(), quality=COLOUR_Q)
        ncol = write_png(normal_path, build_normal_pixels())
        print('YARD_COMPACTOR_TEXTURES colour', os.path.getsize(colour_path), 'normal', os.path.getsize(normal_path),
              'normal colours', ncol, 'atlas', round(ATLAS, 3), 'm',
              'px/m', round(COLOUR_PX / ATLAS, 1), round(NORMAL_PX / ATLAS, 1))

        mesh = build_mesh()
        check_contract(mesh)
        mesh.materials.append(build_material(colour_path, normal_path))
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-compactor-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_COMPACTOR_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
