"""Yard jockey / spotter tractor body (world-yard-jockey-body), built from scratch in headless Blender.

What it builds
--------------
The small cab-over tractor that TruckBay.tsx `YardJockey` shuttles round the
shipping and receiving yards, at delivered scale (three.js metres, origin at
ground centre, body facing +Z): 2.05 m wide (x) x 2.10 m tall (y) x 2.50 m long (z).

Parts (three.js frame). Round 6 rebuilt the wheels, the coupling and the fender ends by a different
method again (see each part); the cab and chassis are as round 5 built them:

* Cab: x +-1.0, y 1.00 .. 2.10, z -0.35 .. 1.25. It is the intersection of two traced outlines: the
  side elevation (plumb sides, flat roof, a sloped rear roof down to the cab back at y 1.90) and the
  plan, whose two front corners are 45-degree pillar chamfers 0.12 m deep. The flat front (x +-0.88,
  y 1.0 .. 2.05) backs the runtime windscreen; a visor bevel spans the pillars onto the roof, which the
  chamfers cut too. The sides are the plumb planes x +-1.0 (the "YARD" label wall). No floor: the
  full-length deck closes the cab underneath.
* Fenders: each side is one planar panel traced from the side elevation, leaning from the cab wall
  (x 1.0 at the deck line y 1.0) out to x 1.025 at the axle line y 0.40, with a six-segment
  semicircular arch (r 0.46, 6 cm clear of the tyre) round each wheel, stopping 9 cm short of each body
  end so the fender ends square instead of in a wedge; closed by front and rear faces (x 0.70 .. 1.025) and the
  full-width, full-length deck (dark under the cab: it is the ceiling of the front wells and of the
  grille recess).
* Chassis: x +-0.70. Its sides are full rectangles (z -1.25 .. 1.25, y 0.24 .. 1.0): the wheel-well
  walls behind every tyre and the cheeks of the grille recess, which closes the recess's ends. The front
  profile is the bumper face (y 0.24 .. 0.54), a horizontal step 0.12 m deep, and the recessed grille up
  to the deck; the headlamps sit on the fender fronts either side of it.
* Fifth-wheel coupling just behind the rear axle (z -0.80): a flat plate on a pedestal. The plate is a
  16-segment disc, r 0.44, 6 cm thick (top y 1.185, underside 1.125): a flat top fanned from the
  kingpin (1 cm lower, a shallow dish), a vertical smooth-shaded rim, and a 45-degree V throat (247.5 ..
  292.5 degrees, centred on the rear) cut from the rim to the kingpin, its walls running down through
  the plate to the deck. The rim drops up to 3.5 cm beside the throat (the horn ramps). Under it, 18 cm
  in from the rim, a pedestal block (x +-0.26) stands on the deck; its front faces the cab back unbuilt.
* Four wheels, radius 0.40, x 0.68 .. 0.93 each side, set 8-10 cm inside the fender flare so each sits
  in a well under its arch (the tyre's inner edge runs 2 cm into the well wall: one assembly), axles
  z +-0.70: a short cylinder. The tread is a true cylinder band to a 16-segment outer lip ring at
  x 0.93, built where it shows (k -3 .. 4 on the front wheels, k -4 .. 3 on the rear ones); the outer
  face is a concave 16-triangle fan from the lip back to a hub sunk 12 cm inside it, so the lip stands
  proud of a recessed wheel. Tread corners roll 25 degrees at the lip; the face carries the dish's own
  normal at the lip and the axis at the hub.

Every finish feature lives in the two allowed textures on one unmirrored atlas,
each face its own island in its own metric frame (a x b = outward normal), except
that the four outer wheel faces share one island, the two pillar chamfers another,
and the four treads share another:

* tangent-space normal map (PNG) derived from height fields in metres: eased
  edges, door and panel seams, recessed glazing with rubber seals, a belt line,
  bumper and deck tread plate, frame rail with bolt rows, the fuel tank's round
  section and straps, lamp housings, grille slats, tyre shoulders, sidewall
  bulge, tread lugs, rim dish, hub and wheel nuts, the coupling plate's rim,
  throat and ramps;
* base colour map (JPEG): #fbbf24 yellow paint with mottle, chipped edges and
  low grime; dark-grey (#374151) chassis, bumper and deck; black (#1f2937) tyres,
  rubber trim band and underbody; a grey roof panel with the beacon pad and amber
  clearance lamps; glazing; hazard striping on the bumper, deck edges and rear;
  head, tail and work lamps; air and electrical couplings on the cab back; light
  grey rims. Occlusion only in seams, under parts and round the wheels.

Runtime anchors kept (src/components/TruckBay.tsx, YardJockey), asserted in check_contract:
* windscreen plane 1.7 x 1.0 at (0, 1.55, 1.26): the cab front is flat at z 1.25, x +-0.88, from
  y 1.0 to 2.05, so the front cannot be raked (the pillar chamfers stay outside x +-0.85);
* beacon cylinder at (0, 2.2, 0), r 0.1: the roof is flat at y 2.1 for z -0.17 .. 1.19;
* "YARD" text at (1.01, 1.3, 0) facing +X, size 0.25 (about z +-0.32): the +X cab side is the plumb
  plane x 1.0 over z -0.35 .. 1.13, and the fender line (y 1.0) stays under the text;
* the inner group turns the body onto the travel axis; nothing measures the GLB.

The material is double-sided (as several delivered world vehicles are): the fender box is open toward
the wheels and the tyres are open above their exposed half, and both must read solid from inside.

Budget (public/models/asset-manifest.json row world-yard-jockey-body): one node
'Yard-jockey-bodyBody', one material, two textures, 77000 bytes, 756 render
vertices = index entries = 252 triangles. Built, in triangles:

  wheels   4 x (tread 7 x 2 + concave face fan 16)                          120
  coupling 14 segments x (top 1 + rim 2) + throat walls 2 x 2 + pedestal 3 x 2  52
  fenders  side panels 2 x 16 + front and rear faces 2 x 2 x 2 + deck 2     42
  cab      sides 2 x 3 + pillars 2 x 3 + front, visor, slope, back 4 x 2 + roof 4   24
  chassis  sides 2 x 2 + bumper, step, grille, rear 4 x 2                   12
  total                                                                    250

Not built, for want of triangles: window/door reveals, mirrors, a step, an arch return (lip depth), an
axle bar, a chassis underside (the body is open below y 0.24, seen only edge-on from the ground camera),
a separate sidewall ring and rim step on the wheels (the dish stands in for them; detail is in the maps).
Every face carries explicit corner normals (flat faces their face normal).

Texture sizes are set by the byte budget (about 16 KB of the 77000 is geometry):
colour 512 px JPEG q68, normal 320 px PNG with its bytes quantised to steps of 6 (76,432 bytes built).
The YJ_COLOUR_PX / YJ_NORMAL_PX / YJ_COLOUR_Q / YJ_NORMAL_STEP environment variables
override them for size experiments, and YJ_TEXTURE_DUMP=<dir> keeps a copy of the
staged textures; the defaults are the delivered build.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-jockey-body.py -- <out.glb>

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

NODE_NAME = 'Yard-jockey-bodyBody'
MESH_NAME = 'yard-jockey-body-mesh'
MATERIAL_NAME = 'yard-jockey-body-surface'
SCENE_NAME = 'MillOS_World_Yard-jockey-body'

TRIANGLES = 250
NORMAL_PX = int(os.environ.get('YJ_NORMAL_PX', 320))
COLOUR_PX = int(os.environ.get('YJ_COLOUR_PX', 512))
COLOUR_Q = int(os.environ.get('YJ_COLOUR_Q', 68))
NORMAL_STEP = int(os.environ.get('YJ_NORMAL_STEP', 6))   # quantisation step of the normal bytes (PNG size)
SUPERSAMPLE = 3
MAX_SLOPE = 3.0

# ---------------------------------------------------------------- dimensions (three.js frame)
CAB_X, CAB_Y0, CAB_Y1, CAB_Z0, CAB_Z1 = 1.0, 1.00, 2.10, -0.35, 1.25
# Cab side elevation (z, y), traced and extruded across x +-1.0: the plumb front (it backs the runtime
# windscreen up to y 2.05), a visor bevel onto the flat roof, the roof, a sloped rear roof down to the
# cab back, the back and the floor. The two sides are the plumb planes x +-1.0 (the runtime "YARD"
# label sits on +X).
CAB_FT = 2.05                   # front face top (the windscreen plane's top edge)
CAB_RF = 1.19                   # roof front edge, behind the visor bevel
CAB_RR = -0.17                  # roof rear edge, where the rear slope starts
CAB_BT = 1.90                   # cab back top, where the rear slope ends
CAB_CH = 0.12                   # 45-degree pillar chamfer on both front vertical corners (front flat to x +-0.88)
CAB_ZS = CAB_Z1 - CAB_CH        # where each plumb side starts behind its pillar chamfer
CAB_SIDE = [(CAB_ZS, CAB_Y0), (CAB_ZS, CAB_Y1), (CAB_RR, CAB_Y1), (CAB_Z0, CAB_BT), (CAB_Z0, CAB_Y0)]
CAB_FX = CAB_X - CAB_CH         # half width of the flat front (the windscreen plane is +-0.85)
PILLAR_W = CAB_CH * math.sqrt(2)
SIDE_H = CAB_Y1 - CAB_Y0
VISOR_W = math.hypot(CAB_Z1 - CAB_RF, CAB_Y1 - CAB_FT)
VISOR_HX = CAB_X + CAB_ZS - CAB_RF  # visor half width at the roof edge, where the pillar chamfers cut it
SLOPE_W = math.hypot(CAB_RR - CAB_Z0, CAB_Y1 - CAB_BT)
ROOF_LEN = CAB_RF - CAB_RR
CAB_LEN = CAB_Z1 - CAB_Z0
CAB_BELT = 1.46                 # painted belt moulding


def cab_top(z):
    """Height of the cab's side elevation at z (numpy-friendly)."""
    z = np.asarray(z, np.float64)
    front = CAB_FT + (CAB_Y1 - CAB_FT) * np.clip((CAB_Z1 - z) / (CAB_Z1 - CAB_RF), 0, 1)
    rear = CAB_BT + (CAB_Y1 - CAB_BT) * np.clip((z - CAB_Z0) / (CAB_RR - CAB_Z0), 0, 1)
    return np.minimum(front, rear)


BODY_X = 0.70                   # chassis half width: its sides are the wheel-well walls; each tyre's inner
                                # edge runs 2 cm into them, so wheel and body are one assembly
BODY_Y0 = 0.24                  # chassis underside
# Front profile (z, y) of the chassis: the bumper face, a horizontal step back onto the recessed grille,
# the grille up to the deck. The chassis sides are full rectangles out to z 1.25, so they are also the
# cheeks of the grille recess (closing the hole round its ends). The top is the full-length deck.
PROFILE = [(1.25, BODY_Y0), (1.25, 0.54), (1.13, 0.54), (1.13, 1.00), (-1.25, 1.00), (-1.25, BODY_Y0)]
DECK_Y = 1.00
GRILLE_Z = PROFILE[2][0]

# Fenders: the body below the cab is enclosed out to the full width. Each side is one planar panel
# leaning out from the cab wall (x 1.0 at the deck line, flush with the cab side above it) to x 1.025
# at the axle line y 0.40, a flared skirt, with a semicircular arch round each wheel; the box behind it
# is closed by a front face, a rear face, a bottom strip between the arches, the chassis side inboard,
# the cab floor above the front half and the full-width deck above the rear half.
FEN_X0, FEN_X1, FEN_XT, FEN_Y0, FEN_Y1 = BODY_X, 1.025, CAB_X, 0.40, DECK_Y
ARCH_R, ARCH_N = 0.46, 6        # 6 cm clear over the tyre, so the arch reads as an opening round it
ARCH_END = 0.09                 # square fender end between each arch and the body end (no wedge tab)


def fender_x(y):
    """Half width of the leaning fender panel at height y."""
    return FEN_X1 - (FEN_X1 - FEN_XT) * (y - FEN_Y0) / (FEN_Y1 - FEN_Y0)

# Bumper: the front of the chassis profile (x +-0.78), its top edge chamfered back into the grille.
BUMPER_X, BUMPER_Y0, BUMPER_Y1 = BODY_X, PROFILE[0][1], PROFILE[1][1]
BUMPER_D = math.hypot(PROFILE[1][0] - PROFILE[2][0], PROFILE[2][1] - PROFILE[1][1])  # chamfer width

# Wheels: a short cylinder (round 6; rounds 3-5 were a convex cone that shaded as a dome). The tread is
# a true cylinder band from the inner edge (in the well wall) to the outer lip ring (16 segments, the
# silhouette); the outer face is a CONCAVE fan from that lip back into a hub sunk 12 cm inside it, so the
# lip stands proud of a recessed wheel. Corner normals: tread radial at the inner edge, rolled 25 degrees
# at the lip (a softened shoulder); the face carries the dish's own normal at the lip, the axis at the hub.
WHEEL_R, WHEEL_N = 0.40, 16
WHEEL_XO, WHEEL_XI = 0.93, 0.68      # outer lip ring, inner tread edge: 8-10 cm inside the fender flare
WHEEL_XS = WHEEL_XO                  # (the lip ring is the shoulder)
WHEEL_XH = 0.81                      # hub, recessed 12 cm inside the lip
WHEEL_W = WHEEL_XO - WHEEL_XI
SHOULDER_TILT = math.radians(25)     # tread corners at the lip, from radial toward the axis
DISH_TILT = math.atan2(WHEEL_XO - WHEEL_XH, WHEEL_R)   # the dish's normal at the lip, from the axis inward
_WZ = 1.25 - ARCH_END - ARCH_R
WHEEL_Z = (_WZ, -_WZ)                # +-0.70: each arch stops ARCH_END short of the body end
WHEEL_YC = WHEEL_R              # a vertex points straight down, so the tyre touches y = 0
TREAD_SEG = 2 * WHEEL_R * math.sin(math.pi / WHEEL_N)
TREAD_K = list(range(-4, 5))        # tread island span (k -4 .. 4); each wheel builds 7 of its 8 quads
TREAD_KF = list(range(-3, 5))       # front wheels: the front (k 4) is open below the fender front, the rear is not
TREAD_KR = list(range(-4, 4))       # rear wheels: the mirror of that
TREAD_LEN = TREAD_SEG * (len(TREAD_K) - 1)
TREAD_SLANT = WHEEL_XS - WHEEL_XI   # tread band width

# Fifth-wheel coupling (round 6; round 5 was a lathe of a tapered profile that read as a dish): a flat
# plate on a pedestal. The plate is a 16-segment disc (22.5-degree steps from +x toward the front, +z),
# 6 cm thick: a flat top fanned from the kingpin, a vertical rim, and a 45-degree V throat (247.5 ..
# 292.5, centred on the rear) cut from the rim in to the kingpin. The rim points either side of the
# throat drop up to 3.5 cm, the loading ramps on the horns. The throat walls run down through the plate
# to the deck. Under the plate, set 18 cm in from its rim, a pedestal block on the deck carries it.
FW_Z = -0.80
FW_N = 16
FW_STEP = 360 / FW_N
FW_ANG = [FW_STEP * k for k in range(FW_N)]          # degrees
FW_THROAT = (247.5, 292.5)
FW_THROAT_HALF = math.radians((FW_THROAT[1] - FW_THROAT[0]) / 2)
FW_RR = 0.44                    # plate radius
FW_RT = 0.405                   # painted turned lip ring inside the rim
FW_YT = 1.185                   # plate top at the rim
FW_YA = 1.175                   # plate top at the kingpin (a 1 cm dish)
FW_YB = 1.125                   # plate underside (bottom of the rim)
FW_Y0 = 0.995                   # pedestal foot and throat walls, 5 mm into the deck
FW_RAMP = 0.035                 # horn ramp drop at the throat mouth
FW_R = FW_RR
FW_HALF = math.radians(FW_STEP / 2)
FW_CH_R = 2 * FW_RR * math.sin(FW_HALF)             # rim chord per segment
FW_SKIRT_H = FW_YT - FW_YB
FW_MOUTH = FW_RR * math.sin(FW_THROAT_HALF)         # throat half width at the rim
PED_HX, PED_Z0, PED_Z1 = 0.26, FW_Z - 0.14, FW_Z + 0.24   # pedestal block (its front is hidden by the cab)
PED_TOP = FW_YB + 0.01
PED_H = PED_TOP - FW_Y0
PED_L = PED_Z1 - PED_Z0


def fw_rim_y(deg):
    """Plate top at a rim point: flat, dropping toward the throat mouth (the horn ramps)."""
    d = min(abs(deg - FW_THROAT[0]), abs(deg - FW_THROAT[1]), abs(deg - FW_THROAT[0] + 360), abs(deg - FW_THROAT[1] - 360))
    return FW_YT - FW_RAMP * max(0.0, 1.0 - d / 50.0)

# Paint, sRGB 0-255.
YELLOW = np.array([251, 191, 36], np.float32)       # #fbbf24
YELLOW_DEEP = np.array([214, 150, 18], np.float32)
DARK = np.array([55, 65, 81], np.float32)           # #374151
BLACK = np.array([31, 41, 55], np.float32)          # #1f2937
UNDER = np.array([22, 25, 30], np.float32)
RUBBER = np.array([34, 36, 40], np.float32)
TYRE = np.array([36, 36, 38], np.float32)
TYRE_WORN = np.array([58, 57, 55], np.float32)
RIM = np.array([176, 178, 172], np.float32)
HUB = np.array([112, 116, 120], np.float32)
STEEL = np.array([150, 156, 160], np.float32)
STEEL_DARK = np.array([92, 98, 104], np.float32)
ALU = np.array([188, 192, 196], np.float32)
ROOF = np.array([150, 155, 160], np.float32)
GLASS = np.array([24, 38, 58], np.float32)
GLASS_SKY = np.array([96, 120, 146], np.float32)
LENS = np.array([236, 236, 222], np.float32)
RED = np.array([196, 28, 30], np.float32)
AMBER = np.array([246, 150, 24], np.float32)
BLUE = np.array([40, 92, 196], np.float32)
PRIMER = np.array([120, 120, 112], np.float32)
GRIME = np.array([82, 72, 56], np.float32)
GREASE = np.array([44, 40, 34], np.float32)
PLATE = np.array([124, 128, 132], np.float32)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def soft_box(v, centre, half, ramp):
    """1 inside |v - centre| < half, falling to 0 over `ramp` outside it."""
    return 1.0 - smoothstep(half, half + ramp, np.abs(v - centre))


def rect(x, y, x0, x1, y0, y1, ramp=0.004):
    return soft_box(x, (x0 + x1) / 2, (x1 - x0) / 2, ramp) * soft_box(y, (y0 + y1) / 2, (y1 - y0) / 2, ramp)


def value_noise(x, y, cells_x, cells_y, seed):
    """Seeded smooth value noise in [0,1] over x in [0,1], y in [0,1]."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells_y + 2, cells_x + 2)).astype(np.float32)
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


def rib(v, centre, half, height, flank=0.02):
    return height * (1.0 - smoothstep(half, half + flank, np.abs(v - centre)))


def round_bar(v, centre, r):
    """Round section across v: 0 outside, up to +r on the centre line."""
    d = np.abs(v - centre)
    return np.where(d < r, np.sqrt(np.maximum(r * r - d * d, 0.0)), 0.0)


def seg_distance(px, py, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy), 0.0, 1.0)
    return np.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def mix(rgb, colour, w):
    w = np.clip(w, 0.0, 1.0)[..., None]
    return rgb * (1 - w) + colour * w


def shade(rgb, k):
    return rgb * np.clip(1.0 - k, 0.05, 2.0)[..., None]


def paint(shape, colour):
    return np.broadcast_to(colour, shape + (3,)).astype(np.float64).copy()


def mottle(rgb, u, v, seed, strength=0.06, cells=(7, 7)):
    """Low-frequency paint variation (kept soft: high-frequency noise costs JPEG bytes, not looks)."""
    strength = strength * 0.7
    n1 = value_noise(u, v, cells[0], cells[1], seed) - 0.5
    n2 = value_noise(u, v, cells[0] * 3, cells[1] * 3, seed + 1) - 0.5
    return rgb * (1.0 + strength * n1 + 0.3 * strength * n2)[..., None]


def wear(rgb, d, u, v, seed, width=0.018, colour=PRIMER, amount=0.55):
    """Chipped paint along an edge at distance d: noisy, never a clean stripe."""
    n = value_noise(u, v, 36, 36, seed)
    edge = (1.0 - smoothstep(0.0, width, d)) * smoothstep(0.5, 0.75, n)
    return mix(rgb, colour, amount * edge)


def grime_low(rgb, y, u, v, seed, top=0.45, amount=0.35):
    n = value_noise(u, v, 30, 8, seed)
    g = (1.0 - smoothstep(0.0, top, y)) * (0.25 + 0.4 * n) * amount / 0.35
    return mix(rgb, GRIME, g)


def hazard(u, v, period=0.14):
    """Diagonal yellow / black stripes, True where yellow."""
    return (((u + v) / period) % 1.0) < 0.5


def lamp_h(x, y, x0, x1, y0, y1, proud=0.014, bezel=0.012):
    """A lamp: housing proud of its face, lens set 4 mm inside a bezel."""
    d, inside = rect_distance(x, y, x0, x1, y0, y1)
    h = np.where(inside, proud + quarter_round(d, 0.006), 0.0)
    h -= 0.004 * rect(x, y, x0 + bezel, x1 - bezel, y0 + bezel, y1 - bezel, 0.002)
    return h


def lamp_c(rgb, x, y, x0, x1, y0, y1, lens, bezel=0.012, housing=BLACK):
    rgb = shade(rgb, 0.35 * (1.0 - smoothstep(0.0, 0.02, rect_distance(x, y, x0, x1, y0, y1)[0])) *
                (~rect_distance(x, y, x0, x1, y0, y1)[1]))
    rgb = mix(rgb, housing, rect(x, y, x0, x1, y0, y1, 0.002))
    inner = rect(x, y, x0 + bezel, x1 - bezel, y0 + bezel, y1 - bezel, 0.003)
    rgb = mix(rgb, lens, inner)
    # A soft highlight on the upper lens, so it reads as moulded plastic, not paint.
    hi = inner * smoothstep(y0 + (y1 - y0) * 0.45, y1, y)
    return mix(rgb, np.minimum(lens * 1.25, 255), 0.35 * hi)


def glazing_h(x, y, x0, x1, y0, y1, seal=0.028, depth=0.012):
    d, inside = rect_distance(x, y, x0, x1, y0, y1)
    h = np.where(inside, -depth * smoothstep(0.0, seal, d), 0.0)
    h += np.where(inside, 0.004 * np.sin(np.clip(d / seal, 0, 1) * math.pi), 0.0)  # rounded seal
    return h


def glazing_c(rgb, x, y, x0, x1, y0, y1, seed, seal=0.028):
    d, inside = rect_distance(x, y, x0, x1, y0, y1)
    pane = inside & (d > seal)
    t = np.clip((y - y0) / (y1 - y0), 0, 1)
    glass = GLASS[None, :] * (1 - t[:, None] * 0.5) + GLASS_SKY[None, :] * (t[:, None] * 0.5)
    streak = np.abs(((x - x0) - (y - y0) * 0.8) % 0.9 - 0.45) < 0.05
    glass = glass * (1.0 + 0.18 * streak[:, None])
    rgb = np.where(inside[:, None], RUBBER[None, :], rgb)
    rgb = np.where(pane[:, None], glass, rgb)
    return rgb


# ---------------------------------------------------------------- cab sides
DOOR = (0.34, 1.06, 1.03, 1.94)       # z0, z1, y0, y1 on both sides (over the front arch)
DOOR_WIN = (0.43, 0.98, 1.50, 1.87)
QUARTER_WIN = (-0.24, 0.30, 1.52, 1.87)


def cab_side_h(z, y):
    """Cab side in (z, y): the plumb wall from the fender top (y 1.0) to the roof chamfer (y 1.97)."""
    h = quarter_round(np.minimum(CAB_ZS - z, z - CAB_Z0), 0.012)
    h += quarter_round(y - CAB_Y0, 0.012) + quarter_round(cab_top(z) - y, 0.012)
    # Rubber rubbing strip along the cab base, just above the fender flare, and the belt moulding.
    h += 0.007 * rect(z, y, CAB_Z0, CAB_Z1, 1.005, 1.075, 0.006)
    h += rib(y, CAB_BELT, 0.008, 0.004, 0.004)
    # Door on the front half: seam, window, handle, hinges.
    dd, _ = rect_distance(z, y, *DOOR)
    h += groove(dd, 0.002, 0.003, 0.005)
    h += glazing_h(z, y, *DOOR_WIN)
    h += 0.014 * rect(z, y, 0.41, 0.52, 1.385, 1.415, 0.004)
    h += -0.008 * rect(z, y, 0.415, 0.515, 1.37, 1.43, 0.006) * (1 - rect(z, y, 0.41, 0.52, 1.385, 1.415, 0.004))
    for hy in (1.22, 1.78):
        h += 0.01 * rect(z, y, 1.045, 1.075, hy - 0.05, hy + 0.05, 0.003)
    # Rear quarter window.
    h += glazing_h(z, y, *QUARTER_WIN)
    return h


def cab_side_c(z, y, seed):
    u, v = (z - CAB_Z0) / CAB_LEN, (y - CAB_Y0) / SIDE_H
    rgb = paint(z.shape, YELLOW)
    rgb = mottle(rgb, u, v, seed, 0.05)
    rgb = grime_low(rgb, y - CAB_Y0, u, v, seed + 2, top=0.3)
    rgb = mix(rgb, RUBBER, rect(z, y, CAB_Z0, CAB_Z1, 1.005, 1.075, 0.003))
    # Belt moulding: lit crest, shaded underside.
    rgb = shade(rgb, -0.12 * soft_box(y, CAB_BELT + 0.003, 0.004, 0.003))
    rgb = shade(rgb, 0.22 * soft_box(y, CAB_BELT - 0.009, 0.004, 0.004))
    dd, _ = rect_distance(z, y, *DOOR)
    rgb = shade(rgb, 0.55 * (1.0 - smoothstep(0.002, 0.007, dd)) * (y > 1.075))
    rgb = wear(rgb, dd, u, v, seed + 4, 0.012)
    rgb = glazing_c(rgb, z, y, *DOOR_WIN, seed)
    rgb = glazing_c(rgb, z, y, *QUARTER_WIN, seed + 1)
    rgb = shade(rgb, 0.45 * rect(z, y, 0.415, 0.515, 1.37, 1.43, 0.004))
    rgb = mix(rgb, STEEL_DARK, rect(z, y, 0.41, 0.52, 1.385, 1.415, 0.002))
    for hy in (1.22, 1.78):
        rgb = mix(rgb, DARK, rect(z, y, 1.045, 1.075, hy - 0.05, hy + 0.05, 0.002))
    d = np.minimum(np.minimum(CAB_ZS - z, z - CAB_Z0), np.minimum(y - CAB_Y0, cab_top(z) - y))
    rgb = wear(rgb, d, u, v, seed + 6)
    return rgb


def side_px_h(a, b):
    return cab_side_h(CAB_Z1 - a, CAB_Y0 + b)


def side_px_c(a, b):
    return cab_side_c(CAB_Z1 - a, CAB_Y0 + b, 11)


def side_nx_h(a, b):
    return cab_side_h(CAB_Z0 + a, CAB_Y0 + b)


def side_nx_c(a, b):
    return cab_side_c(CAB_Z0 + a, CAB_Y0 + b, 21)


# Visor bevel at the front of the roof: a = x + 1.0, b up the bevel from the front face. Amber
# clearance lamps sit on it.
def visor_hw(b):
    return CAB_FX + (VISOR_HX - CAB_FX) * np.clip(b / VISOR_W, 0, 1)


def visor_h(a, b):
    x = a - CAB_X
    h = quarter_round(visor_hw(b) - np.abs(x), 0.012) + quarter_round(np.minimum(b, VISOR_W - b), 0.01)
    for lx in (-0.3, 0.0, 0.3):
        h += lamp_h(x, b, lx - 0.045, lx + 0.045, 0.012, VISOR_W - 0.012, 0.012, 0.006)
    return h


def visor_c(a, b):
    x = a - CAB_X
    rgb = paint(a.shape, YELLOW)
    rgb = mottle(rgb, a / 2.0, b / VISOR_W, 201, 0.05)
    for lx in (-0.3, 0.0, 0.3):
        rgb = lamp_c(rgb, x, b, lx - 0.045, lx + 0.045, 0.012, VISOR_W - 0.012, AMBER, 0.006)
    rgb = wear(rgb, np.minimum(visor_hw(b) - np.abs(x), np.minimum(b, VISOR_W - b)), a / 2.0, b / VISOR_W, 202)
    return rgb


# Rear roof slope: a = x + 1.0, b down the slope from the roof's rear edge. Two work lamps and a rain
# gutter along the top.
def slope_h(a, b):
    x = a - CAB_X
    h = quarter_round(CAB_X - np.abs(x), 0.02) + quarter_round(np.minimum(b, SLOPE_W - b), 0.012)
    h += groove(np.abs(b - 0.03), 0.003, 0.004, 0.004)
    for wx in (-0.62, 0.62):
        h += lamp_h(x, b, wx - 0.08, wx + 0.08, 0.08, 0.17, 0.03, 0.012)
    return h


def slope_c(a, b):
    x = a - CAB_X
    rgb = paint(a.shape, YELLOW)
    rgb = mottle(rgb, a / 2.0, b / SLOPE_W, 211, 0.05)
    rgb = shade(rgb, 0.35 * (1 - smoothstep(0.003, 0.008, np.abs(b - 0.03))))
    for wx in (-0.62, 0.62):
        rgb = lamp_c(rgb, x, b, wx - 0.08, wx + 0.08, 0.08, 0.17, LENS, 0.012)
    rgb = wear(rgb, np.minimum(CAB_X - np.abs(x), np.minimum(b, SLOPE_W - b)), a / 2.0, b / SLOPE_W, 212)
    return rgb


# Roof: a = x + 1.0, b = CAB_RF - z.
def roof_h(a, b):
    x, z = a - CAB_X, CAB_RF - b
    h = quarter_round(np.minimum(CAB_RF - z, z - CAB_RR), 0.015) + quarter_round(CAB_X - np.abs(x), 0.02)
    pd, pin = rect_distance(x, z, -0.80, 0.80, -0.10, 1.12)
    h += np.where(pin, 0.008 + quarter_round(pd, 0.012), 0.0)
    span = rect(x, z, -2, 2, -0.03, 1.05, 0.01)
    for rx in (-0.57, -0.29, 0.29, 0.57):
        h += rib(x, rx, 0.02, 0.008, 0.012) * span
    # Cross seams between the roof panel sheets.
    for sz in (0.20, 0.66):
        h += groove(np.abs(z - sz), 0.002, 0.003, 0.004) * rect(x, z, -0.76, 0.76, -9, 9, 0.004)
    r = np.hypot(x, z)
    h += 0.012 * (1 - smoothstep(0.125, 0.135, r))
    return h


def roof_c(a, b):
    x, z = a - CAB_X, CAB_RF - b
    u, v = a / (2 * CAB_X), b / ROOF_LEN
    rgb = paint(a.shape, YELLOW)
    rgb = mottle(rgb, u, v, 31, 0.05)
    pd, pin = rect_distance(x, z, -0.80, 0.80, -0.10, 1.12)
    rgb = shade(rgb, 0.35 * (~pin) * (1 - smoothstep(0.0, 0.01, pd)))
    rgb = mix(rgb, ROOF, pin * 1.0)
    rgb = mottle(rgb, u, v, 33, 0.025 * pin, cells=(5, 5))
    span = rect(x, z, -2, 2, -0.03, 1.05, 0.004)
    for rx in (-0.57, -0.29, 0.29, 0.57):
        # Crisp rib: lit crest, shaded flanks.
        rgb = shade(rgb, -0.10 * (1 - smoothstep(0.004, 0.007, np.abs(x - rx))) * span * pin)
        rgb = shade(rgb, 0.16 * (1 - smoothstep(0.012, 0.016, np.abs(np.abs(x - rx) - 0.013))) * span * pin)
    for sz in (0.20, 0.66):
        rgb = shade(rgb, 0.35 * (1 - smoothstep(0.002, 0.004, np.abs(z - sz))) * pin)
    # Fine grit, sharp-edged specks rather than a soft wash, a little heavier toward the back.
    grit = value_noise(u, v, 70, 70, 35)
    rgb = mix(rgb, GRIME * 1.3, 0.22 * pin * smoothstep(0.78, 0.84, grit) * smoothstep(1.3, -0.4, z))
    r = np.hypot(x, z)
    rgb = shade(rgb, 0.4 * (1 - smoothstep(0.13, 0.15, r)) * (r > 0.13))
    rgb = mix(rgb, BLACK, 1 - smoothstep(0.125, 0.128, r))
    rgb = wear(rgb, np.minimum(np.minimum(CAB_RF - z, z - CAB_RR), CAB_X - np.abs(x)), u, v, 37)
    return rgb


# Front: a = x + 1.0, b = y - 1.0.  Back: a = 1.0 - x, b = y - 1.0. The outline is the traced profile.
def cab_end_common_h(x, y, top, half=CAB_X):
    h = quarter_round(half - np.abs(x), 0.012)
    h += quarter_round(y - CAB_Y0, 0.02) + quarter_round(top - y, 0.01)
    h += 0.006 * rect(x, y, -2, 2, 1.005, 1.075, 0.006)
    return h


def cab_end_common_c(x, y, seed, top, half=CAB_X):
    u, v = (x + 1) / 2, (y - CAB_Y0)  / 1.1
    rgb = paint(x.shape, YELLOW)
    rgb = mottle(rgb, u, v, seed, 0.05)
    rgb = grime_low(rgb, y - CAB_Y0, u, v, seed + 2, top=0.3)
    rgb = mix(rgb, RUBBER, rect(x, y, -2, 2, 1.005, 1.075, 0.003))
    d = np.minimum(half - np.abs(x), np.minimum(y - CAB_Y0, top - y))
    rgb = wear(rgb, d, u, v, seed + 4)
    return rgb


def front_h(a, b):
    x, y = a - CAB_X, b + CAB_Y0
    h = cab_end_common_h(x, y, CAB_FT, CAB_FX)
    h += glazing_h(x, y, -0.85, 0.85, 1.07, 2.03, 0.03, 0.012)
    for x0, x1 in ((-0.78, -0.08), (0.06, 0.76)):
        d = seg_distance(x, y, x0, 1.115, x1, 1.13)
        h += 0.006 * (1 - smoothstep(0.006, 0.01, d))
    return h


def front_c(a, b):
    x, y = a - CAB_X, b + CAB_Y0
    rgb = cab_end_common_c(x, y, 41, CAB_FT, CAB_FX)
    rgb = glazing_c(rgb, x, y, -0.85, 0.85, 1.07, 2.03, 43, 0.03)
    for x0, x1 in ((-0.78, -0.08), (0.06, 0.76)):
        d = seg_distance(x, y, x0, 1.115, x1, 1.13)
        rgb = mix(rgb, BLACK * 0.7, 1 - smoothstep(0.005, 0.009, d))
    return rgb


# Pillar chamfers (both front corners, one island): a across the chamfer from the windscreen edge to
# the side, b = y - 1.0. Corner glazing wraps the windscreen round; an amber marker sits low.
def pillar_h(a, b):
    y = b + CAB_Y0
    h = quarter_round(np.minimum(a, PILLAR_W - a), 0.01) + quarter_round(y - CAB_Y0, 0.02) + quarter_round(CAB_FT - y, 0.01)
    h += 0.006 * rect(a, y, -1, 1, 1.005, 1.075, 0.006)
    h += glazing_h(a, y, 0.035, PILLAR_W - 0.035, 1.30, 2.03, 0.02, 0.012)
    h += lamp_h(a, y, 0.05, PILLAR_W - 0.05, 1.12, 1.18, 0.012, 0.008)
    return h


def pillar_c(a, b):
    y = b + CAB_Y0
    u, v = a / PILLAR_W, b / 1.05
    rgb = paint(a.shape, YELLOW)
    rgb = mottle(rgb, u, v, 45, 0.05)
    rgb = grime_low(rgb, y - CAB_Y0, u, v, 46, top=0.3)
    rgb = mix(rgb, RUBBER, rect(a, y, -1, 1, 1.005, 1.075, 0.003))
    rgb = glazing_c(rgb, a, y, 0.035, PILLAR_W - 0.035, 1.30, 2.03, 47, 0.02)
    rgb = lamp_c(rgb, a, y, 0.05, PILLAR_W - 0.05, 1.12, 1.18, AMBER, 0.008)
    rgb = wear(rgb, np.minimum(np.minimum(a, PILLAR_W - a), np.minimum(y - CAB_Y0, CAB_FT - y)), u, v, 48)
    return rgb


def back_h(a, b):
    x, y = CAB_X - a, b + CAB_Y0
    h = cab_end_common_h(x, y, CAB_BT)
    dd, _ = rect_distance(x, y, -0.05, 0.65, 1.07, 1.86)
    h += groove(dd, 0.002, 0.003, 0.005)
    h += glazing_h(x, y, 0.06, 0.54, 1.44, 1.86)
    h += 0.014 * rect(x, y, 0.0, 0.1, 1.355, 1.385, 0.004)
    for hy in (1.22, 1.78):
        h += 0.01 * rect(x, y, 0.635, 0.665, hy - 0.05, hy + 0.05, 0.003)
    h += glazing_h(x, y, -0.80, -0.16, 1.46, 1.86)
    # Air and electrical coupling panel with its coiled lines hanging below.
    h += 0.012 * rect(x, y, -0.84, -0.40, 1.24, 1.38, 0.004)
    for cx in (-0.78, -0.62, -0.47):
        h += 0.01 * (1 - smoothstep(0.022, 0.028, np.hypot(x - cx, y - 1.31)))
    for cx, cy in ((-0.74, 1.13), (-0.53, 1.13)):
        r = np.hypot((x - cx) / 1.0, (y - cy) / 0.55)
        ring = round_bar((r % 0.03), 0.015, 0.012) * (r < 0.15)
        h += 0.8 * ring
    return h


def back_c(a, b):
    x, y = CAB_X - a, b + CAB_Y0
    u, v = (x + 1) / 2, (y - CAB_Y0) / 1.15
    rgb = cab_end_common_c(x, y, 51, CAB_BT)
    dd, _ = rect_distance(x, y, -0.05, 0.65, 1.07, 1.86)
    rgb = shade(rgb, 0.55 * (1.0 - smoothstep(0.002, 0.007, dd)))
    rgb = wear(rgb, dd, u, v, 53, 0.012)
    rgb = glazing_c(rgb, x, y, 0.06, 0.54, 1.44, 1.86, 55)
    rgb = glazing_c(rgb, x, y, -0.80, -0.16, 1.46, 1.86, 57)
    rgb = mix(rgb, STEEL_DARK, rect(x, y, 0.0, 0.1, 1.355, 1.385, 0.002))
    for hy in (1.22, 1.78):
        rgb = mix(rgb, DARK, rect(x, y, 0.635, 0.665, hy - 0.05, hy + 0.05, 0.002))
    rgb = shade(rgb, 0.3 * (1 - smoothstep(0.0, 0.02, rect_distance(x, y, -0.84, -0.40, 1.24, 1.38)[0])))
    rgb = mix(rgb, DARK, rect(x, y, -0.84, -0.40, 1.24, 1.38, 0.002))
    for cx, col in ((-0.78, RED), (-0.62, BLUE), (-0.47, BLACK)):
        r = np.hypot(x - cx, y - 1.31)
        rgb = mix(rgb, col, 1 - smoothstep(0.02, 0.025, r))
        rgb = shade(rgb, 0.5 * (1 - smoothstep(0.006, 0.01, r)))
    for (cx, cy), col in (((-0.74, 1.13), RED), ((-0.53, 1.13), BLUE)):
        r = np.hypot(x - cx, (y - cy) / 0.55)
        inside = r < 0.15
        ring = np.abs((r % 0.03) - 0.015) < 0.011
        rgb = mix(rgb, col * 0.9, (inside & ring) * 1.0)
        rgb = shade(rgb, 0.4 * (inside & ~ring))
    return rgb


def flat_h(a, b):
    return np.zeros_like(a)


# ---------------------------------------------------------------- chassis
# The chassis sides now show only below the fenders (y 0.24 .. 0.40, between and beside the wheels)
# and, inside the arches, as the dark wheel-well wall behind each tyre.
def body_side_h(z, y):
    h = quarter_round(np.minimum(PROFILE[0][0] - z, z + 1.25), 0.02) + quarter_round(y - BODY_Y0, 0.01)
    # Frame rail with flanges and bolt rows, under the fender line.
    rail = rect(z, y, -1.25, 1.25, 0.265, 0.395, 0.006)
    h += 0.01 * rail
    h += rib(y, 0.275, 0.006, 0.005, 0.004) * rail + rib(y, 0.385, 0.006, 0.005, 0.004) * rail
    bz = ((z + 1.25) % 0.12) - 0.06
    h += 0.008 * (1 - smoothstep(0.008, 0.012, np.hypot(bz, y - 0.33))) * rail
    # Fuel tank strap and drain between the wheels on the frame.
    h += 0.006 * rect(z, y, -0.30, -0.26, 0.24, 0.40, 0.003) + 0.006 * rect(z, y, 0.26, 0.30, 0.24, 0.40, 0.003)
    return h


def body_side_c(z, y, seed):
    u, v = (z + 1.25) / 2.5, (y - BODY_Y0) / (DECK_Y - BODY_Y0)
    rgb = paint(z.shape, UNDER)
    rail = rect(z, y, -1.25, 1.25, 0.265, 0.395, 0.003)
    rgb = mix(rgb, DARK, rail)
    rgb = mottle(rgb, u, v, seed, 0.08)
    rgb = shade(rgb, -0.18 * soft_box(y, 0.275, 0.004, 0.003) * rail)
    rgb = shade(rgb, 0.25 * soft_box(y, 0.29, 0.006, 0.004) * rail)
    bz = ((z + 1.25) % 0.12) - 0.06
    rgb = mix(rgb, STEEL_DARK, (1 - smoothstep(0.008, 0.011, np.hypot(bz, y - 0.33))) * rail)
    for sz in (-0.28, 0.28):
        rgb = mix(rgb, BLACK, rect(z, y, sz - 0.02, sz + 0.02, 0.24, 0.40, 0.002))
    # Above the fender line the side is the wheel-well wall: dark, and darker up under the fender.
    rgb = mix(rgb, UNDER * 0.8, smoothstep(0.40, 0.44, y))
    rgb = shade(rgb, 0.35 * smoothstep(0.45, 0.95, y))
    # Occlusion round each tyre.
    for wz in WHEEL_Z:
        d = np.hypot(z - wz, y - WHEEL_YC)
        rgb = shade(rgb, 0.5 * (1 - smoothstep(WHEEL_R - 0.01, WHEEL_R + 0.12, d)))
    rgb = grime_low(rgb, y - BODY_Y0, u, v, seed + 3, top=0.2, amount=0.25)
    return rgb


def body_px_h(a, b):
    return body_side_h(1.25 - a, b + BODY_Y0)


def body_px_c(a, b):
    return body_side_c(1.25 - a, b + BODY_Y0, 71)


def body_nx_h(a, b):
    return body_side_h(a - 1.25, b + BODY_Y0)


def body_nx_c(a, b):
    return body_side_c(a - 1.25, b + BODY_Y0, 81)


# ---------------------------------------------------------------- fenders
def arch_distance(z, y):
    """Distance outside the nearer wheel arch (negative inside it), and that arch's polar angle."""
    best = None
    ang = None
    for wz in WHEEL_Z:
        r = np.hypot(z - wz, y - FEN_Y0)
        d = np.where(y >= FEN_Y0, r - ARCH_R, np.abs(z - wz) - ARCH_R)
        t = np.arctan2(y - FEN_Y0, z - wz)
        if best is None:
            best, ang = d, t
        else:
            closer = d < best
            best = np.where(closer, d, best)
            ang = np.where(closer, t, ang)
    return best, ang


def fender_side_h(z, y):
    """Fender panel at x +-1.025 in (z, y): y 0.40 .. 1.00, two arches."""
    d, _ = arch_distance(z, y)
    h = quarter_round(np.minimum(1.25 - z, z + 1.25), 0.02) + quarter_round(FEN_Y1 - y, 0.012)
    h += quarter_round(y - FEN_Y0, 0.012)
    # Rubber arch flare: a raised rolled lip round each arch, bolted on.
    lip = 1 - smoothstep(0.045, 0.055, d)
    h += lip * (0.012 + quarter_round(d, 0.01) * 0.6)
    _, ang = arch_distance(z, y)
    bolt = (np.abs(((ang / math.pi * 7) % 1.0) - 0.5) < 0.06) * (np.abs(d - 0.028) < 0.007)
    h += 0.004 * bolt * lip
    # Lower rubbing strip between the arches, and a step plate under the door.
    h += 0.006 * rect(z, y, -0.20, 0.20, 0.41, 0.47, 0.004)
    h += -0.012 * rect(z, y, 0.0, 0.20, 0.58, 0.66, 0.004) * (d > 0.06)
    # Panel seam under the cab back, and the access hatch on the rear fender.
    h += groove(np.abs(z - CAB_Z0), 0.002, 0.003, 0.004) * (d > 0.06)
    hd, _ = rect_distance(z, y, -0.20, -0.02, 0.62, 0.90)
    h += groove(hd, 0.002, 0.003, 0.004)
    # Side marker lamps at the front and rear corners.
    h += lamp_h(z, y, 1.12, 1.20, 0.90, 0.95, 0.012, 0.008)
    h += lamp_h(z, y, -1.20, -1.12, 0.90, 0.95, 0.012, 0.008)
    return h


def fender_side_c(z, y, seed):
    u, v = (z + 1.25) / 2.5, (y - FEN_Y0) / (FEN_Y1 - FEN_Y0)
    d, _ = arch_distance(z, y)
    rgb = paint(z.shape, YELLOW)
    rgb = mottle(rgb, u, v, seed, 0.05)
    # Road grime, heavier low and round the arches.
    rgb = grime_low(rgb, y - FEN_Y0, u, v, seed + 2, top=0.35, amount=0.4)
    n = value_noise(u, v, 40, 10, seed + 5)
    rgb = mix(rgb, GRIME, (0.15 + 0.25 * n) * (1 - smoothstep(0.05, 0.16, d)) * (d > 0.04))
    # Black rubber arch flare with its bolts.
    lip = 1 - smoothstep(0.048, 0.052, d)
    rgb = mix(rgb, RUBBER, lip)
    rgb = shade(rgb, -0.15 * lip * soft_box(d, 0.012, 0.004, 0.006))
    _, ang = arch_distance(z, y)
    bolt = (np.abs(((ang / math.pi * 7) % 1.0) - 0.5) < 0.06) * (np.abs(d - 0.028) < 0.007)
    rgb = mix(rgb, STEEL_DARK, bolt * lip)
    # Rubbing strip and the step plate.
    rgb = mix(rgb, RUBBER, rect(z, y, -0.20, 0.20, 0.41, 0.47, 0.002))
    step = rect(z, y, 0.0, 0.20, 0.58, 0.66, 0.002) * (d > 0.06)
    rgb = mix(rgb, STEEL_DARK, step)
    sp = ((z * 18) % 1.0 < 0.5) ^ ((y * 18) % 1.0 < 0.5)
    rgb = shade(rgb, 0.18 * step * sp)
    rgb = shade(rgb, 0.4 * (1 - step) * (1 - smoothstep(0.0, 0.02, rect_distance(z, y, 0.0, 0.20, 0.58, 0.66)[0])) *
                (d > 0.06) * (y < 0.58))
    # Seams.
    rgb = shade(rgb, 0.4 * (1 - smoothstep(0.002, 0.005, np.abs(z - CAB_Z0))) * (d > 0.06))
    hd, _ = rect_distance(z, y, -0.20, -0.02, 0.62, 0.90)
    rgb = shade(rgb, 0.45 * (1 - smoothstep(0.002, 0.005, hd)))
    # Hazard chevrons on the rear corner.
    rear = rect(z, y, -1.25, -1.10, 0.62, 1.0, 0.002) * (d > 0.055)
    rgb = mix(rgb, np.where(hazard(z, y, 0.12)[..., None], YELLOW_DEEP, BLACK), rear)
    rgb = lamp_c(rgb, z, y, 1.12, 1.20, 0.90, 0.95, AMBER, 0.008)
    rgb = lamp_c(rgb, z, y, -1.20, -1.12, 0.90, 0.95, RED, 0.008)
    # Edge wear and the shadow line under the cab's base.
    rgb = wear(rgb, np.minimum(np.minimum(1.25 - z, z + 1.25), np.minimum(FEN_Y1 - y, np.maximum(d, 0))), u, v, seed + 7)
    rgb = shade(rgb, 0.2 * (1 - smoothstep(0.0, 0.012, FEN_Y1 - y)) * (z > CAB_Z0))
    return rgb


def fender_px_h(a, b):
    return fender_side_h(1.25 - a, b + FEN_Y0)


def fender_px_c(a, b):
    return fender_side_c(1.25 - a, b + FEN_Y0, 191)


def fender_nx_h(a, b):
    return fender_side_h(a - 1.25, b + FEN_Y0)


def fender_nx_c(a, b):
    return fender_side_c(a - 1.25, b + FEN_Y0, 197)


FEN_W = FEN_X1 - FEN_X0


# Fender front (shared by both sides): a across from inboard to outboard, b = y - 0.40.
FEN_LAMP = (FEN_W / 2 - 0.12, FEN_W / 2 + 0.12)


def fen_front_h(a, b):
    h = quarter_round(np.minimum(a, FEN_W - a), 0.015) + quarter_round(np.minimum(b, FEN_Y1 - FEN_Y0 - b), 0.015)
    h += lamp_h(a, b, *FEN_LAMP, 0.22, 0.37, 0.018, 0.016)
    h += lamp_h(a, b, FEN_W / 2 - 0.05, FEN_W / 2 + 0.05, 0.43, 0.49, 0.012, 0.008)
    return h


def fen_front_c(a, b):
    rgb = paint(a.shape, YELLOW)
    rgb = mottle(rgb, a / FEN_W, b / 0.6, 201, 0.05)
    band = rect(a, b, -1, 1, 0.0, 0.15, 0.002)
    rgb = mix(rgb, np.where(hazard(a, b, 0.12)[..., None], YELLOW_DEEP, BLACK), band)
    rgb = lamp_c(rgb, a, b, *FEN_LAMP, 0.22, 0.37, LENS, 0.016, STEEL_DARK)
    rgb = lamp_c(rgb, a, b, FEN_W / 2 - 0.05, FEN_W / 2 + 0.05, 0.43, 0.49, AMBER, 0.008)
    rgb = grime_low(rgb, b, a / FEN_W, b / 0.6, 203, top=0.2)
    rgb = wear(rgb, np.minimum(np.minimum(a, FEN_W - a), np.minimum(b, 0.6 - b)), a / FEN_W, b / 0.6, 205)
    return rgb


def fen_rear_h(a, b):
    h = quarter_round(np.minimum(a, FEN_W - a), 0.015) + quarter_round(np.minimum(b, FEN_Y1 - FEN_Y0 - b), 0.015)
    h += lamp_h(a, b, *FEN_LAMP, 0.24, 0.36, 0.016, 0.012)
    h += lamp_h(a, b, FEN_W / 2 - 0.05, FEN_W / 2 + 0.05, 0.41, 0.47, 0.012, 0.008)
    return h


def fen_rear_c(a, b):
    rgb = paint(a.shape, YELLOW)
    rgb = mottle(rgb, a / FEN_W, b / 0.6, 211, 0.05)
    band = rect(a, b, -1, 1, 0.0, 0.15, 0.002)
    rgb = mix(rgb, np.where(hazard(a, b, 0.12)[..., None], YELLOW_DEEP, BLACK), band)
    rgb = lamp_c(rgb, a, b, *FEN_LAMP, 0.24, 0.36, RED, 0.012)
    rgb = lamp_c(rgb, a, b, FEN_W / 2 - 0.05, FEN_W / 2 + 0.05, 0.41, 0.47, AMBER, 0.008)
    rgb = grime_low(rgb, b, a / FEN_W, b / 0.6, 213, top=0.3)
    rgb = wear(rgb, np.minimum(np.minimum(a, FEN_W - a), np.minimum(b, 0.6 - b)), a / FEN_W, b / 0.6, 215)
    return rgb


# Bumper front: a = x + 0.78, b = y - BODY_Y0.
def bumper_h(a, b):
    x, y = a - BUMPER_X, b + BUMPER_Y0
    h = quarter_round(BUMPER_X - np.abs(x), 0.025) + quarter_round(y - BUMPER_Y0, 0.015) + quarter_round(BUMPER_Y1 - y, 0.015)
    h += -0.006 * rect(x, y, -0.16, 0.16, 0.30, 0.48, 0.006)
    h += -0.03 * rect(x, y, -0.035, 0.035, 0.34, 0.44, 0.004)
    for sx in (-1, 1):
        h += 0.012 * rect(x * sx, y, 0.40, 0.60, 0.29, 0.35, 0.004)  # rubber dock pads
    return h


def bumper_c(a, b):
    x, y = a - BUMPER_X, b + BUMPER_Y0
    u, v = a / (2 * BUMPER_X), b / (BUMPER_Y1 - BUMPER_Y0)
    rgb = paint(a.shape, DARK)
    band = rect(np.abs(x), y, 0.18, 0.62, 0.38, 0.50, 0.002)
    stripes = hazard(x * np.sign(x + 1e-6), y, 0.12)
    rgb = mix(rgb, np.where(stripes[..., None], YELLOW_DEEP, BLACK), band)
    rgb = mottle(rgb, u, v, 91, 0.08)
    rgb = mix(rgb, BLACK, rect(x, y, -0.16, 0.16, 0.30, 0.48, 0.003))
    rgb = mix(rgb, UNDER * 0.6, rect(x, y, -0.035, 0.035, 0.34, 0.44, 0.003))
    for sx in (-1, 1):
        rgb = mix(rgb, RUBBER, rect(x * sx, y, 0.40, 0.60, 0.29, 0.35, 0.002))
    d = np.minimum(BUMPER_X - np.abs(x), np.minimum(y - BUMPER_Y0, BUMPER_Y1 - y))
    rgb = wear(rgb, d, u, v, 93, 0.02, STEEL, 0.6)
    rgb = grime_low(rgb, y - BUMPER_Y0, u, v, 95, top=0.15, amount=0.3)
    return rgb


# Bumper chamfer: a = x + 0.78, b = distance up the chamfer from the bumper face.
def bumper_top_h(a, b):
    x = a - BUMPER_X
    h = quarter_round(BUMPER_X - np.abs(x), 0.025) + quarter_round(b, 0.015)
    # Diamond step plate in the middle, where the driver climbs to the deck hoses.
    p = 0.06
    du = ((x + b) / p) % 1.0 - 0.5
    dv = ((x - b) / p) % 1.0 - 0.5
    h += 0.0015 * (1 - smoothstep(0.1, 0.22, np.abs(du))) * (1 - smoothstep(0.2, 0.4, np.abs(dv))) * \
        rect(x, b, -0.5, 0.5, 0.02, BUMPER_D - 0.02, 0.01)
    return h


def bumper_top_c(a, b):
    x = a - BUMPER_X
    u, v = a / (2 * BUMPER_X), b / BUMPER_D
    rgb = paint(a.shape, DARK)
    rgb = mottle(rgb, u, v, 97, 0.08)
    step = rect(x, b, -0.5, 0.5, 0.02, BUMPER_D - 0.02, 0.004)
    rgb = mix(rgb, STEEL_DARK, 0.6 * step)
    sc = value_noise(u, v, 20, 4, 99)
    rgb = mix(rgb, STEEL, 0.35 * smoothstep(0.65, 0.9, sc) * step)
    rgb = wear(rgb, np.minimum(BUMPER_X - np.abs(x), b), u, v, 98, 0.02, STEEL, 0.6)
    # The back strip runs under the grille: in its shade.
    rgb = shade(rgb, 0.4 * smoothstep(BUMPER_D - 0.05, BUMPER_D, b))
    return rgb


# Grille: a = x + 0.78, b = distance up the slope from the bumper top.
GRILLE_LEN = PROFILE[3][1] - PROFILE[2][1]


def grille_h(a, b):
    x = a - BODY_X
    h = quarter_round(BODY_X - np.abs(x), 0.03) + quarter_round(b, 0.012)
    slat = ((b - 0.04) % 0.035) / 0.035
    louvre = np.where(slat < 0.65, -0.008 * slat / 0.65, -0.008 + 0.008 * (slat - 0.65) / 0.35)
    h += louvre * rect(x, b, -0.44, 0.44, 0.05, 0.36, 0.004)
    h += -0.004 * rect(x, b, -0.46, 0.46, 0.035, 0.375, 0.004)
    for sx in (-1, 1):
        h += lamp_h(x * sx, b, 0.52, 0.61, 0.08, 0.17, 0.012, 0.008)
    return h


def grille_c(a, b):
    x = a - BODY_X
    rgb = paint(a.shape, DARK)
    rgb = mottle(rgb, a / (2 * BODY_X), b / GRILLE_LEN, 101, 0.08)
    g = rect(x, b, -0.46, 0.46, 0.035, 0.375, 0.002)
    rgb = mix(rgb, UNDER, g)
    slat = ((b - 0.04) % 0.035) / 0.035
    rgb = mix(rgb, BLACK * 1.2, g * (slat > 0.62) * rect(x, b, -0.44, 0.44, 0.05, 0.36, 0.002))
    for sx in (-1, 1):
        rgb = lamp_c(rgb, x * sx, b, 0.52, 0.61, 0.08, 0.17, AMBER, 0.008)
    # The part under the cab overhang is in shadow.
    rgb = shade(rgb, 0.55 * smoothstep(0.26, CAB_Y0 - PROFILE[2][1], b))
    return rgb


# Deck, full width and full length: a = x + 1.0, b = DECK_Z0 - z. Behind the cab the middle is the
# chassis deck and the outer strips the fender tops; under the cab it is the floor, the ceiling of the
# front wheel wells and of the grille recess (dark), except the two small ledges outside the pillar
# chamfers (yellow).
DECK_Z0 = 1.25
DECK_LEN = 2.5


def fw_footprint(x, z):
    """Distance outside the coupling plate's plan outline (0 under it)."""
    return np.maximum(np.hypot(x, z - FW_Z) - FW_RR, 0.0)


def deck_h(a, b):
    x, z = a - FEN_XT, DECK_Z0 - b
    h = quarter_round(FEN_XT - np.abs(x), 0.015) + quarter_round(z + 1.25, 0.015)
    # Diamond tread plate on the chassis deck.
    open_deck = rect(x, z, -0.62, 0.62, -1.21, CAB_Z0 - 0.03, 0.01)
    p = 0.1
    du = ((x + z) / p) % 1.0 - 0.5
    dv = ((x - z) / p) % 1.0 - 0.5
    h += 0.002 * (1 - smoothstep(0.1, 0.22, np.abs(du))) * (1 - smoothstep(0.2, 0.4, np.abs(dv))) * open_deck
    # The fender tops: a seam where they meet the deck, and an anti-slip strip on each.
    h += groove(np.abs(np.abs(x) - FEN_X0), 0.002, 0.003, 0.004)
    h += 0.003 * rect(np.abs(x), z, 0.86, 0.96, -1.18, CAB_Z0 - 0.06, 0.004)
    # Mounting plate under the coupling.
    h += 0.008 * rect(x, z, -0.48, 0.48, FW_Z - 0.40, FW_Z + 0.40, 0.01) * (fw_footprint(x, z) > 0)
    return h * (z < CAB_Z0)


def deck_c(a, b):
    x, z = a - FEN_XT, DECK_Z0 - b
    u, v = a / (2 * FEN_XT), b / DECK_LEN
    rgb = paint(a.shape, DARK)
    fen = smoothstep(FEN_X0 - 0.002, FEN_X0 + 0.002, np.abs(x))
    rgb = mix(rgb, YELLOW, fen)
    rgb = mottle(rgb, u, v, 111, 0.06)
    p = 0.1
    du = ((x + z) / p) % 1.0 - 0.5
    dv = ((x - z) / p) % 1.0 - 0.5
    bump = (1 - smoothstep(0.1, 0.22, np.abs(du))) * (1 - smoothstep(0.2, 0.4, np.abs(dv)))
    open_deck = rect(x, z, -0.62, 0.62, -1.21, CAB_Z0 - 0.03, 0.01)
    rgb = shade(rgb, -0.12 * bump * open_deck)
    # Fender seam and anti-slip strips.
    rgb = shade(rgb, 0.45 * (1 - smoothstep(0.002, 0.005, np.abs(np.abs(x) - FEN_X0))))
    grip = rect(np.abs(x), z, 0.86, 0.96, -1.18, CAB_Z0 - 0.06, 0.002)
    rgb = mix(rgb, RUBBER * 1.1, grip)
    gn = value_noise(u, v, 60, 30, 115)
    rgb = shade(rgb, -0.25 * grip * smoothstep(0.6, 0.8, gn))
    # Hazard border along the rear edge of the chassis deck.
    stripes = hazard(x, z, 0.12)
    rgb = mix(rgb, np.where(stripes[..., None], YELLOW_DEEP, BLACK), rect(x, z, -0.66, 0.66, -1.25, -1.17, 0.002))
    # Coupling mounting plate, occlusion round the plate and in front of the cab back.
    rgb = mix(rgb, BLACK, rect(x, z, -0.48, 0.48, FW_Z - 0.40, FW_Z + 0.40, 0.004) * (1 - fen))
    rgb = shade(rgb, 0.5 * (1 - smoothstep(0.0, 0.07, fw_footprint(x, z))))
    rgb = shade(rgb, 0.4 * (1 - smoothstep(0.0, 0.07, CAB_Z0 - z)))
    # Scuffs, and grime on the fender tops.
    sc = value_noise(u, v, 16, 24, 113)
    rgb = mix(rgb, STEEL_DARK, 0.35 * smoothstep(0.7, 0.9, sc) * open_deck)
    rgb = mix(rgb, GRIME, 0.25 * fen * smoothstep(0.55, 0.85, sc))
    rgb = wear(rgb, np.minimum(FEN_XT - np.abs(x), z + 1.25), u, v, 117)
    # Under the cab: dark floor, but yellow on the ledges beside the pillar chamfers.
    under = smoothstep(CAB_Z0 - 0.004, CAB_Z0 + 0.004, z)
    ledge = smoothstep(-0.004, 0.004, np.abs(x) + z - (CAB_X + CAB_ZS))
    floor = mottle(paint(a.shape, UNDER), u, v, 61, 0.1)
    floor = mix(floor, YELLOW, ledge)
    return mix(rgb, floor, under)


# Rear end: a = 0.78 - x, b = y - BODY_Y0.
def rear_h(a, b):
    x, y = BODY_X - a, b + BODY_Y0
    h = quarter_round(BODY_X - np.abs(x), 0.02) + quarter_round(y - BODY_Y0, 0.01) + quarter_round(DECK_Y - y, 0.015)
    h += 0.01 * rect(x, y, -0.66, 0.66, 0.86, 1.0, 0.004)
    for sx in (-1, 1):
        h += lamp_h(x * sx, y, 0.42, 0.58, 0.68, 0.80, 0.016, 0.012)
        h += lamp_h(x * sx, y, 0.26, 0.36, 0.70, 0.78, 0.012, 0.008)
    h += 0.01 * rect(x, y, -0.18, 0.18, 0.34, 0.64, 0.005)
    r = np.hypot(x, y - 0.49)
    h += 0.8 * round_bar(r, 0.07, 0.025)
    return h


def rear_c(a, b):
    x, y = BODY_X - a, b + BODY_Y0
    u, v = a / (2 * BODY_X), b / (DECK_Y - BODY_Y0)
    rgb = paint(a.shape, DARK)
    rgb = mix(rgb, UNDER, 1 - smoothstep(0.30, 0.42, y))
    rgb = mottle(rgb, u, v, 121, 0.08)
    stripes = hazard(x, y, 0.12)
    rgb = mix(rgb, np.where(stripes[..., None], YELLOW_DEEP, BLACK), rect(x, y, -0.66, 0.66, 0.86, 1.0, 0.002))
    for sx in (-1, 1):
        rgb = lamp_c(rgb, x * sx, y, 0.42, 0.58, 0.68, 0.80, RED, 0.012)
        rgb = lamp_c(rgb, x * sx, y, 0.26, 0.36, 0.70, 0.78, LENS, 0.008)
        rgb = mix(rgb, RED * 0.85, 1 - smoothstep(0.025, 0.03, np.hypot(x * sx - 0.52, y - 0.44)))
    rgb = mix(rgb, BLACK, rect(x, y, -0.18, 0.18, 0.34, 0.64, 0.003))
    r = np.hypot(x, y - 0.49)
    rgb = mix(rgb, STEEL_DARK, 1 - smoothstep(0.022, 0.028, np.abs(r - 0.07)))
    rgb = mix(rgb, UNDER * 0.5, 1 - smoothstep(0.04, 0.045, r))
    d = np.minimum(BODY_X - np.abs(x), DECK_Y - y)
    rgb = wear(rgb, d, u, v, 123, 0.02, STEEL, 0.5)
    rgb = grime_low(rgb, y - BODY_Y0, u, v, 125, top=0.3, amount=0.3)
    return rgb


# ---------------------------------------------------------------- wheels
CAP_EXTENT = 2 * WHEEL_R
CAP_C = WHEEL_R


def cap_h(a, b):
    """The outer face: the geometry carries the rounded shoulder; this adds the sidewall, rim dish and hub."""
    r = np.hypot(a - CAP_C, b - CAP_C)
    ri = WHEEL_R * math.cos(math.pi / WHEEL_N)
    h = quarter_round(ri - r, 0.012)                                  # crown lip into the tread
    side = smoothstep(0.262, 0.28, r) * (1 - smoothstep(0.31, ri, r))
    h += 0.008 * np.sin(np.clip((r - 0.258) / (ri - 0.258), 0, 1) * math.pi) * 1.0
    h += rib(r, 0.31, 0.003, 0.003, 0.003) * side
    h += 0.008 * (1 - smoothstep(0.250, 0.258, r)) * smoothstep(0.238, 0.246, r)   # rim flange
    dish = 1 - smoothstep(0.236, 0.244, r)
    h += -0.02 * dish * smoothstep(0.12, 0.16, r)
    holes = 0.0
    for k in range(6):
        t = k * math.pi / 3 + math.pi / 6
        holes += 1 - smoothstep(0.024, 0.03, np.hypot(a - CAP_C - 0.19 * math.cos(t), b - CAP_C - 0.19 * math.sin(t)))
    h += -0.012 * holes
    hub = 1 - smoothstep(0.112, 0.12, r)
    h += 0.015 * hub
    for k in range(8):
        t = k * math.pi / 4
        h += 0.012 * (1 - smoothstep(0.012, 0.016, np.hypot(a - CAP_C - 0.085 * math.cos(t), b - CAP_C - 0.085 * math.sin(t))))
    h += 0.02 * (1 - smoothstep(0.045, 0.052, r))
    return h


def cap_c(a, b):
    r = np.hypot(a - CAP_C, b - CAP_C)
    rgb = paint(a.shape, TYRE)
    n = value_noise(a / CAP_EXTENT, b / CAP_EXTENT, 12, 12, 141)
    rgb = rgb * (0.96 + 0.08 * n)[..., None]
    rgb = shade(rgb, -0.25 * soft_box(r, 0.31, 0.003, 0.003))
    # Dust on the lower sidewall.
    rgb = mix(rgb, GRIME * 1.3, 0.25 * smoothstep(0.30, 0.38, r) * smoothstep(0.1, -0.3, (b - CAP_C) / CAP_C))
    rim = 1 - smoothstep(0.252, 0.258, r)
    rgb = mix(rgb, RIM, rim)
    rgb = shade(rgb, 0.45 * soft_box(r, 0.25, 0.004, 0.004))
    rgb = shade(rgb, 0.25 * (1 - smoothstep(0.12, 0.17, r)) * (r > 0.118) * rim)
    for k in range(6):
        t = k * math.pi / 3 + math.pi / 6
        hole = 1 - smoothstep(0.024, 0.029, np.hypot(a - CAP_C - 0.19 * math.cos(t), b - CAP_C - 0.19 * math.sin(t)))
        rgb = mix(rgb, UNDER * 0.6, hole)
    rgb = mix(rgb, HUB, 1 - smoothstep(0.112, 0.118, r))
    for k in range(8):
        t = k * math.pi / 4
        nut = 1 - smoothstep(0.012, 0.015, np.hypot(a - CAP_C - 0.085 * math.cos(t), b - CAP_C - 0.085 * math.sin(t)))
        rgb = mix(rgb, STEEL, nut)
    rgb = mix(rgb, GREASE, 1 - smoothstep(0.045, 0.05, r))
    rgb = mix(rgb, GRIME, 0.2 * rim * smoothstep(0.5, 0.8, n))
    return rgb


def tread_h(a, b):
    w = TREAD_SLANT
    h = quarter_round(np.minimum(b, w - b), 0.015)
    lug = TREAD_SEG * WHEEL_N / 24
    half = b < w / 2
    phase = np.where(half, (a + (w / 2 - b) * 0.6) / lug, (a + (b - w / 2) * 0.6) / lug + 0.5)
    g = np.abs((phase % 1.0) - 0.5) * lug
    groove_mask = (1 - smoothstep(0.012, 0.016, g)) * smoothstep(0.012, 0.03, np.abs(b - w / 2))
    h += -0.008 * groove_mask
    h += -0.005 * (1 - smoothstep(0.004, 0.007, np.abs(b - w / 2)))
    return h


def tread_c(a, b):
    w = TREAD_SLANT
    rgb = paint(a.shape, TYRE_WORN)
    n = value_noise(a / TREAD_LEN, b / w, 24, 3, 151)
    rgb = rgb * (0.94 + 0.12 * n)[..., None]
    lug = TREAD_SEG * WHEEL_N / 24
    half = b < w / 2
    phase = np.where(half, (a + (w / 2 - b) * 0.6) / lug, (a + (b - w / 2) * 0.6) / lug + 0.5)
    g = np.abs((phase % 1.0) - 0.5) * lug
    groove_mask = (1 - smoothstep(0.012, 0.016, g)) * smoothstep(0.012, 0.03, np.abs(b - w / 2))
    rgb = mix(rgb, TYRE * 0.6, groove_mask)
    rgb = mix(rgb, TYRE * 0.6, 1 - smoothstep(0.004, 0.007, np.abs(b - w / 2)))
    rgb = mix(rgb, TYRE, 1 - smoothstep(0.0, 0.05, np.minimum(b, w - b)))
    return rgb


# ---------------------------------------------------------------- coupling
def fw_throat_dist(lx, lz):
    """Plan distance outside the V throat (negative inside it); lz > 0 toward the rear."""
    t = math.tan(FW_THROAT_HALF)
    return np.where(lz > 0, (np.abs(lx) - lz * t) * math.cos(FW_THROAT_HALF), np.hypot(lx, lz))


# Top and chamfer, projected from above: a = x + FW_RR, b = FW_Z + FW_RR - z (lz = b - FW_RR, toward the rear).
def fw_top_h(a, b):
    lx, lz = a - FW_RR, b - FW_RR
    r = np.hypot(lx, lz)
    dt = fw_throat_dist(lx, lz)
    # Eased crease where the flat face meets the chamfer, a fine turned groove inside it.
    h = quarter_round(FW_RT - r, 0.012) * (r < FW_RT)
    h += groove(np.abs(r - (FW_RT - 0.035)), 0.002, 0.003, 0.003)
    # Rolled lip along the throat and the kingpin lock pocket at the axis.
    h += quarter_round(np.clip(dt, 0, None), 0.012) * (lz > -0.02)
    h += -0.03 * (1 - smoothstep(0.045, 0.055, r))
    # Grease grooves.
    for t in (0.6, 2.55):
        for sgn in (-1, 1):
            d = seg_distance(lx, lz, 0.0, 0.0, sgn * 0.30 * math.cos(t), -0.30 * math.sin(t))
            h += -0.003 * (1 - smoothstep(0.004, 0.007, d)) * smoothstep(0.08, 0.12, r)
    # Lock handle on the right horn.
    h += 0.01 * rect(lx, lz, 0.20, 0.28, 0.12, 0.15, 0.004)
    return h


def fw_top_c(a, b):
    lx, lz = a - FW_RR, b - FW_RR
    r = np.hypot(lx, lz)
    u, v = a / (2 * FW_RR), b / (2 * FW_RR)
    rgb = paint(a.shape, PLATE)
    gn = value_noise(u, v, 12, 12, 161)
    rgb = mix(rgb, GREASE, (0.45 + 0.4 * gn) * smoothstep(0.06, 0.12, r) * (1 - smoothstep(0.24, 0.29, r)))
    rgb = mottle(rgb, u, v, 163, 0.1)
    # The chamfer: bright turned steel, scuffed where trailer skids land, a dark line at the crease.
    ch = smoothstep(FW_RT - 0.003, FW_RT + 0.003, r)
    sc = value_noise(u, v, 40, 40, 165)
    rgb = mix(rgb, STEEL, ch * (0.45 + 0.25 * smoothstep(0.4, 0.8, sc)))
    rgb = shade(rgb, 0.35 * (1 - smoothstep(0.0, 0.006, np.abs(r - FW_RT))))
    rgb = shade(rgb, 0.25 * (1 - smoothstep(0.0, 0.004, np.abs(r - (FW_RT - 0.035)))))
    rgb = shade(rgb, -0.10 * smoothstep(FW_RR - 0.012, FW_RR, r))
    # Throat edge: worn bright where the kingpin rides in, dark beyond it.
    dt = fw_throat_dist(lx, lz)
    rgb = mix(rgb, STEEL * 1.1, 0.55 * (1 - smoothstep(0.0, 0.012, dt)) * (lz > 0.02))
    rgb = shade(rgb, 0.3 * (1 - smoothstep(0.012, 0.035, dt)) * smoothstep(0.012, 0.02, dt) * (lz > 0.02))
    # Kingpin lock pocket.
    rgb = mix(rgb, UNDER * 0.4, 1 - smoothstep(0.045, 0.051, r))
    rgb = mix(rgb, STEEL_DARK, 1 - smoothstep(0.004, 0.008, np.abs(r - 0.056)))
    for t in (0.6, 2.55):
        for sgn in (-1, 1):
            d = seg_distance(lx, lz, 0.0, 0.0, sgn * 0.30 * math.cos(t), -0.30 * math.sin(t))
            rgb = mix(rgb, GREASE * 0.6, (1 - smoothstep(0.004, 0.007, d)) * smoothstep(0.08, 0.12, r))
    rgb = mix(rgb, RED, rect(lx, lz, 0.20, 0.28, 0.12, 0.15, 0.002))
    return rgb


def _p3(x, y, z):
    return np.array([x, y, z], np.float64)


def fw_point(deg, r, y):
    t = math.radians(deg)
    return _p3(r * math.cos(t), y, FW_Z + r * math.sin(t))


def fw_radial(deg):
    t = math.radians(deg)
    return np.array([math.cos(t), 0.0, math.sin(t)])


def fw_segments():
    """(deg0, deg1) for every built segment, in order of decreasing angle from the throat's 247.5-degree wall."""
    segs = []
    for k in range(FW_N):
        d0, d1 = FW_ANG[k], FW_ANG[k] + FW_STEP
        if d0 >= FW_THROAT[0] and d1 <= FW_THROAT[1]:
            continue
        segs.append((d0, d1))
    lo = FW_THROAT[0]
    return sorted(segs, key=lambda s: (lo - s[1]) % 360)


FW_SKIRT = fw_segments()
FW_SIDE_LEN = FW_CH_R * len(FW_SKIRT)


# Rim, unrolled: a along the rim chords (segment i spans i * chord .. (i + 1) * chord), b = y - FW_YB (the
# rim is lower on the ramped segments beside the throat, so their tops stop short of the island's top).
def fw_side_h(a, b):
    h = quarter_round(b, 0.006)
    bx = (a % FW_CH_R) - FW_CH_R / 2
    h += 0.004 * (1 - smoothstep(0.008, 0.011, np.hypot(bx, b - 0.026)))
    h += -0.003 * (1 - smoothstep(0.002, 0.004, np.abs(b - 0.045)))
    return h


def fw_side_c(a, b):
    u, v = a / FW_SIDE_LEN, b / FW_SKIRT_H
    rgb = paint(a.shape, PLATE * 0.9)
    rgb = mix(rgb, STEEL, 0.5 * smoothstep(0.045, 0.06, b))
    rgb = shade(rgb, 0.35 * (1 - smoothstep(0.0, 0.015, b)))
    rgb = shade(rgb, 0.3 * (1 - smoothstep(0.002, 0.004, np.abs(b - 0.045))))
    rgb = mottle(rgb, u, v, 171, 0.08)
    gn = value_noise(u, v, 18, 2, 173)
    rgb = mix(rgb, GREASE, 0.35 * smoothstep(0.6, 0.85, gn))
    bx = (a % FW_CH_R) - FW_CH_R / 2
    rgb = mix(rgb, STEEL_DARK, 1 - smoothstep(0.008, 0.011, np.hypot(bx, b - 0.026)))
    return rgb


# Throat walls, in their meridian planes, from the deck to the plate top: the 247.5-degree wall at a = r,
# the 292.5-degree wall mirrored into the second half at a = FW_TW - r; b = y - FW_Y0.
FW_TW = 2 * FW_RR + 0.03         # the two walls side by side, 3 cm apart


def _fw_throat_r(a):
    return np.where(a <= FW_RR + 0.015, a, FW_TW - a)


def fw_wall_top(r):
    """Height of a throat wall's top edge at radius r: the kingpin dish out to the ramped mouth."""
    r = np.asarray(r, np.float64)
    return FW_YA + (fw_rim_y(FW_THROAT[0]) - FW_YA) * np.clip(r / FW_RR, 0, 1)


def fw_throat_h(a, b):
    r = np.clip(_fw_throat_r(a), 0.0, FW_RR)
    y = b + FW_Y0
    top = fw_wall_top(r)
    h = quarter_round(top - y, 0.008)
    # The plate's own thickness above, the pedestal casting below it.
    h += -0.008 * (1 - smoothstep(FW_YB - 0.004, FW_YB, y)) * smoothstep(FW_Y0 + 0.004, FW_Y0 + 0.012, y)
    # The jaw at the kingpin end.
    h += 0.012 * rect(r, y, 0.0, 0.07, FW_Y0 + 0.03, FW_YB - 0.01, 0.006)
    return h


def fw_throat_c(a, b):
    r = np.clip(_fw_throat_r(a), 0.0, FW_RR)
    y = b + FW_Y0
    top = fw_wall_top(r)
    plate = smoothstep(FW_YB - 0.003, FW_YB, y)
    rgb = paint(a.shape, DARK * 0.7)
    rgb = mix(rgb, PLATE * 0.85, plate)
    rgb = mix(rgb, STEEL * 1.05, 0.5 * smoothstep(top - 0.012, top, y))
    rgb = shade(rgb, 0.45 * (1 - plate) * smoothstep(FW_YB - 0.05, FW_YB, y))
    rgb = shade(rgb, 0.35 * (1 - smoothstep(0.0, 0.03, y - FW_Y0)))
    rgb = mix(rgb, STEEL_DARK, rect(r, y, 0.0, 0.07, FW_Y0 + 0.03, FW_YB - 0.01, 0.003))
    rgb = mottle(rgb, a / FW_TW, b / 0.2, 177, 0.08)
    gn = value_noise(a / FW_TW, b / 0.2, 14, 3, 179)
    rgb = mix(rgb, GREASE, 0.4 * smoothstep(0.55, 0.85, gn))
    return rgb


# Pedestal block, unrolled round its three visible sides: the +x side (front to rear) at a 0 .. PED_L, the
# rear (+x to -x) at PED_L .. PED_L + 2 PED_HX, the -x side (rear to front) after it; b = y - FW_Y0.
PED_SIDES = ((0.0, PED_L), (PED_L + 2 * PED_HX, 2 * PED_L + 2 * PED_HX))
PED_LEN = 2 * PED_L + 2 * PED_HX


def fw_ped_h(a, b):
    h = quarter_round(b, 0.006)
    for a0, a1 in ((0.0, PED_L), (PED_L, PED_L + 2 * PED_HX), PED_SIDES[1]):
        h += quarter_round(np.clip(np.minimum(a - a0, a1 - a), 0, None), 0.01) * (a >= a0) * (a <= a1)
    # Foot flange with bolts, and the trunnion boss on each side.
    h += 0.008 * (1 - smoothstep(0.022, 0.026, b))
    bx = (a % 0.09) - 0.045
    h += 0.004 * (1 - smoothstep(0.007, 0.01, np.hypot(bx, b - 0.012)))
    for a0, a1 in PED_SIDES:
        h += 0.014 * (1 - smoothstep(0.035, 0.04, np.hypot(a - (a0 + a1) / 2, b - 0.07)))
    return h


def fw_ped_c(a, b):
    u, v = a / PED_LEN, b / PED_H
    rgb = paint(a.shape, DARK * 0.8)
    rgb = mottle(rgb, u, v, 181, 0.08)
    rgb = mix(rgb, STEEL_DARK, 1 - smoothstep(0.022, 0.026, b))
    bx = (a % 0.09) - 0.045
    rgb = mix(rgb, STEEL, 0.7 * (1 - smoothstep(0.007, 0.01, np.hypot(bx, b - 0.012))))
    for a0, a1 in PED_SIDES:
        r = np.hypot(a - (a0 + a1) / 2, b - 0.07)
        rgb = mix(rgb, STEEL_DARK, 1 - smoothstep(0.035, 0.039, r))
        rgb = mix(rgb, GREASE, 1 - smoothstep(0.012, 0.015, r))
    # In the plate's shadow at the top, contact shadow at the foot.
    rgb = shade(rgb, 0.5 * smoothstep(PED_H - 0.07, PED_H - 0.01, b))
    rgb = shade(rgb, 0.25 * (1 - smoothstep(0.0, 0.015, b)))
    gn = value_noise(u, v, 20, 3, 183)
    rgb = mix(rgb, GREASE, 0.3 * smoothstep(0.6, 0.85, gn))
    return rgb


# ---------------------------------------------------------------- islands
EXTENTS = {
    'side_px': (CAB_LEN, SIDE_H),
    'side_nx': (CAB_LEN, SIDE_H),
    'visor': (2 * CAB_X, VISOR_W),
    'slope': (2 * CAB_X, SLOPE_W),
    'roof': (2 * CAB_X, ROOF_LEN),
    'front': (2 * CAB_X, CAB_FT - CAB_Y0),
    'back': (2 * CAB_X, CAB_BT - CAB_Y0),
    'pillar': (PILLAR_W, CAB_Y1 - CAB_Y0),
    'body_px': (2.5, DECK_Y - BODY_Y0),
    'body_nx': (2.5, DECK_Y - BODY_Y0),
    'fender_px': (2.5, FEN_Y1 - FEN_Y0),
    'fender_nx': (2.5, FEN_Y1 - FEN_Y0),
    'fen_front': (FEN_W, FEN_Y1 - FEN_Y0),
    'fen_rear': (FEN_W, FEN_Y1 - FEN_Y0),
    'bumper': (2 * BUMPER_X, BUMPER_Y1 - BUMPER_Y0),
    'bumper_top': (2 * BUMPER_X, BUMPER_D),
    'grille': (2 * BODY_X, GRILLE_LEN),
    'deck': (2 * FEN_XT, DECK_LEN),
    'rear': (2 * BODY_X, DECK_Y - BODY_Y0),
    'cap': (CAP_EXTENT, CAP_EXTENT),
    'tread': (TREAD_LEN, TREAD_SLANT),
    'fw_top': (2 * FW_RR, 2 * FW_RR),
    'fw_side': (FW_SIDE_LEN, FW_SKIRT_H),
    'fw_throat': (FW_TW, FW_YT - FW_Y0),
    'fw_ped': (PED_LEN, PED_H),
}

FIELDS = {
    'side_px': (side_px_h, side_px_c),
    'side_nx': (side_nx_h, side_nx_c),
    'visor': (visor_h, visor_c),
    'slope': (slope_h, slope_c),
    'roof': (roof_h, roof_c),
    'front': (front_h, front_c),
    'back': (back_h, back_c),
    'pillar': (pillar_h, pillar_c),
    'body_px': (body_px_h, body_px_c),
    'body_nx': (body_nx_h, body_nx_c),
    'fender_px': (fender_px_h, fender_px_c),
    'fender_nx': (fender_nx_h, fender_nx_c),
    'fen_front': (fen_front_h, fen_front_c),
    'fen_rear': (fen_rear_h, fen_rear_c),
    'bumper': (bumper_h, bumper_c),
    'bumper_top': (bumper_top_h, bumper_top_c),
    'grille': (grille_h, grille_c),
    'deck': (deck_h, deck_c),
    'rear': (rear_h, rear_c),
    'cap': (cap_h, cap_c),
    'tread': (tread_h, tread_c),
    'fw_top': (fw_top_h, fw_top_c),
    'fw_side': (fw_side_h, fw_side_c),
    'fw_throat': (fw_throat_h, fw_throat_c),
    'fw_ped': (fw_ped_h, fw_ped_c),
}

# Texel density relative to the rest: shared and close-up parts get more,
# never-seen undersides and the chassis behind the fenders get less.
DENSITY = {
    'deck': 0.75, 'body_px': 0.45, 'body_nx': 0.45,
    'cap': 1.3, 'tread': 1.2, 'fw_top': 1.5, 'fw_side': 1.4, 'fw_throat': 1.2, 'fw_ped': 1.0, 'grille': 1.1, 'bumper': 1.1,
    'rear': 1.0, 'roof': 1.1, 'bumper_top': 1.0,
}
MIN_STRIP = 0.035


class Island:
    """A face's rectangle in the atlas, optionally turned a quarter (never mirrored)."""

    def __init__(self, name, extent):
        self.name = name
        self.extent = extent
        s = DENSITY.get(name, 1.0)
        self.sa = s
        self.sb = max(s, MIN_STRIP / extent[1]) if extent[1] * s < MIN_STRIP else s
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

    @property
    def rect(self):
        w, h = self.size
        return (self.origin[0], self.origin[0] + w, self.origin[1], self.origin[1] + h)


GAP = 0.03
DILATE = 0.02


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


ISLANDS = {name: Island(name, EXTENTS[name]) for name in FIELDS}
ATLAS = pack(list(ISLANDS.values()))


def atlas_grid(px):
    n = px * SUPERSAMPLE
    c = (np.arange(n, dtype=np.float64) + 0.5) / n * ATLAS
    uu, vv = np.meshgrid(c, c)  # row 0 = v 0 (bottom)
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
    eps = 0.002
    for idx, name in enumerate(names):
        isl = ISLANDS[name]
        mask = owner == idx
        if not mask.any():
            continue
        a, b = isl.to_face(uu[mask], vv[mask])

        def h_at(da, db):
            return isl.height(np.clip(a + da, 0, isl.extent[0]), np.clip(b + db, 0, isl.extent[1]))

        dh_da = (h_at(eps, 0) - h_at(-eps, 0)) / (2 * eps)
        dh_db = (h_at(0, eps) - h_at(0, -eps)) / (2 * eps)
        # Slopes per surface metre along atlas +u and +v (unit directions, any density).
        su, sv = (-dh_db, dh_da) if isl.rot else (dh_da, dh_db)
        n[mask, 0] = -np.clip(su, -MAX_SLOPE, MAX_SLOPE)
        n[mask, 1] = -np.clip(sv, -MAX_SLOPE, MAX_SLOPE)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = block_mean(n)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    q = np.round((n * 0.5 + 0.5) * 255 / NORMAL_STEP) * NORMAL_STEP
    return np.clip(q, 0, 255).astype(np.uint8)


def build_colour_pixels():
    uu, vv = atlas_grid(COLOUR_PX)
    names, owner, gap = nearest_island(uu, vv)
    owner = np.where(gap <= DILATE, owner, -1)
    rgb = np.broadcast_to(DARK, uu.shape + (3,)).astype(np.float64).copy()
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
    h, w, _ = rgb.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as is `rgb`
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


def write_png(path, rgb):
    """Minimal RGB8 PNG writer (rows top-first) choosing the cheapest of the five PNG filters per row."""
    rows = rgb[::-1].astype(np.int16)  # row 0 of the array is v = 0, the bottom
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
        p = left + prev - upleft
        pa, pb, pc = np.abs(p - left), np.abs(p - prev), np.abs(p - upleft)
        paeth = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, prev, upleft))
        candidates = [(0, line), (1, line - left), (2, line - prev), (3, line - (left + prev) // 2), (4, line - paeth)]
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
    with open(path, 'wb') as f:
        f.write(png)


# ---------------------------------------------------------------- geometry
def P(x, y, z):
    return np.array([x, y, z], np.float64)


def to_blender(p):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return (float(p[0]), float(-p[2]), float(p[1]))


def planar_uv(origin, adir, bdir):
    adir, bdir = np.asarray(adir, float), np.asarray(bdir, float)

    def f(p):
        d = p - origin
        return float(d @ adir), float(d @ bdir)
    return f, np.cross(adir, bdir)


FACES = []   # (part, island, [points], [(a, b)], smooth, outward normal)


def add_face(part, island, pts, uv, smooth, normal, corner_normals=None):
    """Append a face wound counter-clockwise seen from outside (along `normal`).

    `corner_normals` (three.js frame, one per point) sets the shading normals; without them the face
    is flat-shaded with `normal`.
    """
    area = np.zeros(3)
    for i in range(len(pts)):
        area += np.cross(pts[i], pts[(i + 1) % len(pts)])
    if corner_normals is None:
        corner_normals = [np.asarray(normal, float)] * len(pts)
    if area @ normal < 0:
        pts, uv, corner_normals = pts[::-1], uv[::-1], corner_normals[::-1]
    FACES.append((part, island, pts, uv, smooth, normal, [n / np.linalg.norm(n) for n in corner_normals]))


def add_planar(part, island, pts, origin, adir, bdir):
    f, normal = planar_uv(np.asarray(origin, float), adir, bdir)
    add_face(part, island, pts, [f(p) for p in pts], False, normal)


def unit(*v):
    v = np.array(v, np.float64)
    return tuple(v / np.linalg.norm(v))


def add_auto(part, island, pts, uv, normal, corner_normals=None, smooth=False):
    """add_face for a face whose (a, b) frame may come out mirrored: flips a about its mean if so."""
    p = [np.asarray(q, float) for q in pts]
    area = np.zeros(3)
    for i in range(len(p)):
        area += np.cross(p[i], p[(i + 1) % len(p)])
    order = list(range(len(p))) if area @ normal > 0 else list(range(len(p)))[::-1]
    q = [uv[i] for i in order]
    sgn = sum(q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1] for i in range(len(q)))
    if sgn < 0:
        ma = sum(t[0] for t in uv) / len(uv)
        uv = [(2 * ma - t[0], t[1]) for t in uv]
    add_face(part, island, p, uv, smooth, normal, corner_normals)


def build_faces():
    # ---- cab: the side elevation (z, y) traced and the plan outline (front corners chamfered 45 degrees)
    # traced, and the cab is their intersection: the plumb sides start behind the pillar chamfers, the
    # chamfers rise to the roof, the visor bevel spans between them and the roof is cut by them too.
    rgt = [P(CAB_X, y, z) for z, y in CAB_SIDE]
    lft = [P(-CAB_X, y, z) for z, y in CAB_SIDE]
    add_planar('cab', 'side_px', rgt, P(CAB_X, CAB_Y0, CAB_Z1), (0, 0, -1), (0, 1, 0))
    add_planar('cab', 'side_nx', lft, P(-CAB_X, CAB_Y0, CAB_Z0), (0, 0, 1), (0, 1, 0))
    fx, vx = CAB_FX, VISOR_HX
    add_planar('cab', 'front', [P(-fx, CAB_Y0, CAB_Z1), P(fx, CAB_Y0, CAB_Z1), P(fx, CAB_FT, CAB_Z1), P(-fx, CAB_FT, CAB_Z1)],
               P(-CAB_X, CAB_Y0, CAB_Z1), (1, 0, 0), (0, 1, 0))
    add_planar('cab', 'visor', [P(-fx, CAB_FT, CAB_Z1), P(fx, CAB_FT, CAB_Z1), P(vx, CAB_Y1, CAB_RF), P(-vx, CAB_Y1, CAB_RF)],
               P(-CAB_X, CAB_FT, CAB_Z1), (1, 0, 0), unit(0, CAB_Y1 - CAB_FT, CAB_RF - CAB_Z1))
    add_planar('cab', 'roof', [P(-CAB_X, CAB_Y1, CAB_RR), P(CAB_X, CAB_Y1, CAB_RR), P(CAB_X, CAB_Y1, CAB_ZS),
                               P(vx, CAB_Y1, CAB_RF), P(-vx, CAB_Y1, CAB_RF), P(-CAB_X, CAB_Y1, CAB_ZS)],
               P(-CAB_X, CAB_Y1, CAB_RF), (1, 0, 0), (0, 0, -1))
    (_, _), (_, _), (zd, yd), (ze, ye), (zf, yf) = CAB_SIDE
    add_planar('cab', 'slope', [lft[2], rgt[2], rgt[3], lft[3]], P(-CAB_X, yd, zd), (1, 0, 0), unit(0, ye - yd, ze - zd))
    add_planar('cab', 'back', [lft[3], rgt[3], rgt[4], lft[4]], P(CAB_X, yf, ze), (-1, 0, 0), (0, 1, 0))
    for sx in (1, -1):
        pts = [P(sx * fx, CAB_Y0, CAB_Z1), P(sx * CAB_X, CAB_Y0, CAB_ZS), P(sx * CAB_X, CAB_Y1, CAB_ZS),
               P(sx * vx, CAB_Y1, CAB_RF), P(sx * fx, CAB_FT, CAB_Z1)]
        normal = np.array([sx, 0.0, 1.0]) / math.sqrt(2)
        adir = np.cross((0.0, 1.0, 0.0), normal)          # a x b = normal with b up
        origin = P(fx, CAB_Y0, CAB_Z1) if sx > 0 else P(-CAB_X, CAB_Y0, CAB_ZS)
        f, _ = planar_uv(origin, adir, (0, 1, 0))
        add_face('cab', 'pillar', pts, [f(p) for p in pts], False, normal)

    # ---- chassis: x +-0.66, its sides full rectangles (the wheel-well walls, and the cheeks of the grille
    # recess); the front profile is the bumper face, a horizontal step and the recessed grille.
    add_planar('body', 'body_px', [P(BODY_X, BODY_Y0, 1.25), P(BODY_X, BODY_Y0, -1.25), P(BODY_X, DECK_Y, -1.25),
                                   P(BODY_X, DECK_Y, 1.25)], P(BODY_X, BODY_Y0, 1.25), (0, 0, -1), (0, 1, 0))
    add_planar('body', 'body_nx', [P(-BODY_X, BODY_Y0, -1.25), P(-BODY_X, BODY_Y0, 1.25), P(-BODY_X, DECK_Y, 1.25),
                                   P(-BODY_X, DECK_Y, -1.25)], P(-BODY_X, BODY_Y0, -1.25), (0, 0, 1), (0, 1, 0))
    rgt = [P(BODY_X, y, z) for z, y in PROFILE]
    lft = [P(-BODY_X, y, z) for z, y in PROFILE]
    (za, ya), (zb, yb), (zc, yc), (zd, yd), (ze, ye), (zf, yf) = PROFILE
    strips = [
        (0, 'bumper', P(-BODY_X, ya, za), (1, 0, 0), (0, 1, 0)),
        (1, 'bumper_top', P(-BODY_X, yb, zb), (1, 0, 0), unit(0, yc - yb, zc - zb)),
        (2, 'grille', P(-BODY_X, yc, zc), (1, 0, 0), (0, 1, 0)),
        (4, 'rear', P(BODY_X, yf, ze), (-1, 0, 0), (0, 1, 0)),
    ]
    for i, island, origin, adir, bdir in strips:
        j = (i + 1) % len(PROFILE)
        add_planar('body', island, [lft[i], rgt[i], rgt[j], lft[j]], origin, adir, bdir)

    # ---- fenders: one side panel per side traced from the side elevation (body line, deck line and
    # two semicircular arches), closed by front and rear faces; the full-length deck is the top.
    def arch(wz):
        pts = []
        for i in range(ARCH_N + 1):
            t = math.pi * (1 - i / ARCH_N)                  # rear end (180) over the top to the front end (0)
            pts.append((wz + ARCH_R * math.cos(t), FEN_Y0 + ARCH_R * math.sin(t)))
        pts[0] = (wz - ARCH_R, FEN_Y0)
        pts[-1] = (wz + ARCH_R, FEN_Y0)
        return pts
    outline = ([(1.25, FEN_Y1), (-1.25, FEN_Y1), (-1.25, FEN_Y0)] + arch(WHEEL_Z[1]) + arch(WHEEL_Z[0]) +
               [(1.25, FEN_Y0)])
    lean = np.array([FEN_Y1 - FEN_Y0, -(FEN_X1 - FEN_XT), 0.0])
    lean /= np.linalg.norm(lean)                            # +x panel's outward normal, tipped down by the flare
    for side in (1, -1):
        pts = [P(side * fender_x(y), y, z) for z, y in outline]
        normal = lean * np.array([side, 1.0, 1.0])
        uv = [((1.25 - p[2]) if side > 0 else (p[2] + 1.25), p[1] - FEN_Y0) for p in pts]
        add_face('fender', 'fender_px' if side > 0 else 'fender_nx', pts, uv, False, normal)
        xo0, xo1, xi = side * FEN_X1, side * FEN_XT, side * FEN_X0     # outer edge at the bottom / top, inboard edge
        if side > 0:
            front = [P(xi, FEN_Y0, 1.25), P(xo0, FEN_Y0, 1.25), P(xo1, FEN_Y1, 1.25), P(xi, FEN_Y1, 1.25)]
            rear = [P(xo0, FEN_Y0, -1.25), P(xi, FEN_Y0, -1.25), P(xi, FEN_Y1, -1.25), P(xo1, FEN_Y1, -1.25)]
        else:
            front = [P(xo0, FEN_Y0, 1.25), P(xi, FEN_Y0, 1.25), P(xi, FEN_Y1, 1.25), P(xo1, FEN_Y1, 1.25)]
            rear = [P(xi, FEN_Y0, -1.25), P(xo0, FEN_Y0, -1.25), P(xo1, FEN_Y1, -1.25), P(xi, FEN_Y1, -1.25)]
        xl = min(xi, xo0)
        add_planar('fender', 'fen_front', front, P(xl, FEN_Y0, 1.25), (1, 0, 0), (0, 1, 0))
        add_planar('fender', 'fen_rear', rear, P(max(xi, xo0), FEN_Y0, -1.25), (-1, 0, 0), (0, 1, 0))
    add_planar('fender', 'deck', [P(-FEN_XT, DECK_Y, 1.25), P(FEN_XT, DECK_Y, 1.25), P(FEN_XT, DECK_Y, -1.25),
                                  P(-FEN_XT, DECK_Y, -1.25)], P(-FEN_XT, DECK_Y, DECK_Z0), (1, 0, 0), (0, 0, -1))

    # ---- wheels, each in its well 8-10 cm inside the fender flare: the full 16-segment sidewall fan, and
    # the tread wherever it shows (the lower half, less the quarter-segment facing the other axle).
    for side in (1, -1):
        sgn = float(side)
        axis = np.array([sgn, 0.0, 0.0])
        xs, xi, xo = side * WHEEL_XS, side * WHEEL_XI, side * WHEEL_XO
        for wz in WHEEL_Z:
            part = f'wheel{side:+d}{wz:+.2f}'
            th = [-math.pi / 2 + 2 * math.pi * k / WHEEL_N for k in range(WHEEL_N + 1)]
            radial = [np.array([0.0, math.sin(t), math.cos(t)]) for t in th]
            outer = [P(xs, WHEEL_YC + WHEEL_R * r[1], wz + WHEEL_R * r[2]) for r in radial]
            inner = [P(xi, WHEEL_YC + WHEEL_R * r[1], wz + WHEEL_R * r[2]) for r in radial]
            roll = [r * math.cos(SHOULDER_TILT) + axis * math.sin(SHOULDER_TILT) for r in radial]
            dish = [axis * math.cos(DISH_TILT) - r * math.sin(DISH_TILT) for r in radial]
            b_in, b_out = (TREAD_SLANT, 0.0) if side > 0 else (0.0, TREAD_SLANT)
            ks = TREAD_KF if wz > 0 else TREAD_KR
            for m in range(len(ks) - 1):
                ka, kb = ks[m] % WHEEL_N, ks[m + 1] % WHEEL_N
                a0 = (ks[m] - TREAD_K[0]) * TREAD_SEG
                a1 = a0 + TREAD_SEG
                pts = [inner[ka], outer[ka], outer[kb], inner[kb]]
                uv = [(a0, b_in), (a0, b_out), (a1, b_out), (a1, b_in)]
                cn = [radial[ka], roll[ka], roll[kb], radial[kb]]
                c = sum(pts) / 4
                normal = np.array([0.0, c[1] - WHEEL_YC, c[2] - wz])
                add_face(part, 'tread', pts, uv, True, normal / np.linalg.norm(normal), cn)
            hub = P(side * WHEEL_XH, WHEEL_YC, wz)     # sunk inside the lip: the face is a concave dish
            for k in range(WHEEL_N):
                pts = [hub, outer[k], outer[k + 1]]
                uv = [((wz - p[2]) * sgn + CAP_C, p[1] - WHEEL_YC + CAP_C) for p in pts]
                normal = np.cross(pts[1] - pts[0], pts[2] - pts[0])
                normal *= np.sign(normal @ axis)
                add_face(part, 'cap', pts, uv, True, normal / np.linalg.norm(normal), [axis, dish[k], dish[k + 1]])

    # ---- fifth-wheel coupling: a flat 16-segment plate (top fanned from the kingpin, a vertical rim, the
    # V throat cut through it to the deck) standing on a pedestal block set well in from its rim.
    up = np.array([0.0, 1.0, 0.0])

    def fw_uv(p):
        return (float(p[0] + FW_RR), float(FW_Z + FW_RR - p[2]))
    apex_t = _p3(0.0, FW_YA, FW_Z)
    for i, (d0, d1) in enumerate(FW_SKIRT):
        t0, t1 = fw_point(d0, FW_RR, fw_rim_y(d0)), fw_point(d1, FW_RR, fw_rim_y(d1))
        b0, b1 = fw_point(d0, FW_RR, FW_YB), fw_point(d1, FW_RR, FW_YB)
        pts = [apex_t, t0, t1]
        add_face('fw', 'fw_top', pts, [fw_uv(p) for p in pts], False, up)
        ac = (i + 0.5) * FW_CH_R
        pts = [t0, t1, b1, b0]
        uv = [(ac + FW_CH_R / 2, t0[1] - FW_YB), (ac - FW_CH_R / 2, t1[1] - FW_YB),
              (ac - FW_CH_R / 2, 0.0), (ac + FW_CH_R / 2, 0.0)]
        n = fw_radial((d0 + d1) / 2)
        add_face('fw', 'fw_side', pts, uv, True, n, [fw_radial(d0), fw_radial(d1), fw_radial(d1), fw_radial(d0)])
    for deg in FW_THROAT:
        prof = [(0.0, FW_YA), (FW_RR, fw_rim_y(deg)), (FW_RR, FW_Y0), (0.0, FW_Y0)]
        pts = [fw_point(deg, r, y) for r, y in prof]
        t = math.radians(deg)
        tangent = np.array([-math.sin(t), 0.0, math.cos(t)])
        normal = tangent if deg == FW_THROAT[0] else -tangent      # each wall faces into the V
        uv = [((r if deg == FW_THROAT[0] else FW_TW - r), y - FW_Y0) for r, y in prof]
        add_face('fw', 'fw_throat', pts, uv, False, normal)
    # Pedestal: its +x side, rear and -x side (the front faces the cab back and its top is inside the plate).
    y0, y1, hx = FW_Y0, PED_TOP, PED_HX
    add_planar('fw_ped', 'fw_ped', [P(hx, y0, PED_Z1), P(hx, y0, PED_Z0), P(hx, y1, PED_Z0), P(hx, y1, PED_Z1)],
               P(hx, y0, PED_Z1), (0, 0, -1), (0, 1, 0))
    add_planar('fw_ped', 'fw_ped', [P(hx, y0, PED_Z0), P(-hx, y0, PED_Z0), P(-hx, y1, PED_Z0), P(hx, y1, PED_Z0)],
               P(hx + PED_L, y0, PED_Z0), (-1, 0, 0), (0, 1, 0))
    add_planar('fw_ped', 'fw_ped', [P(-hx, y0, PED_Z0), P(-hx, y0, PED_Z1), P(-hx, y1, PED_Z1), P(-hx, y1, PED_Z0)],
               P(-hx, y0, PED_Z0 - (PED_L + 2 * hx)), (0, 0, 1), (0, 1, 0))


def check_frames():
    """Every face's (a, b) frame must be right-handed about its outward normal (no mirrored UVs)."""
    for part, island, pts, uv, smooth, normal, _corner in FACES:
        p = np.array(pts)
        q = np.array(uv)
        e1, e2 = p[1] - p[0], p[2] - p[0]
        n = np.cross(e1, e2)
        # Polygon orientation vs outward normal.
        area = np.zeros(3)
        for i in range(len(p)):
            area += np.cross(p[i], p[(i + 1) % len(p)])
        assert area @ normal > 0, (part, island, 'winding')
        # UV handedness: signed area in (a, b) must be positive for CCW-from-outside polygons.
        s = 0.0
        for i in range(len(q)):
            s += q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1]
        assert s > 0, (part, island, 'mirrored uv', s)
        del n


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    verts = {}

    def vert(part, p):
        key = (part, tuple(np.round(p, 6)))
        if key not in verts:
            verts[key] = bm.verts.new(to_blender(p))
        return verts[key]

    tri_count = 0
    corner_normals = []
    for part, island, pts, uv, smooth, normal, corner in FACES:
        isl = ISLANDS[island]
        f = bm.faces.new([vert(part, p) for p in pts])
        f.smooth = True        # every corner gets an explicit normal below; flat faces carry their face normal
        tri_count += len(pts) - 2
        for loop, (a, b) in zip(f.loops, uv):
            u, v = isl.to_atlas(a, b)
            loop[uv_layer].uv = (u / ATLAS, v / ATLAS)
        corner_normals.extend(to_blender(n) for n in corner)
    assert tri_count == TRIANGLES, tri_count
    for e in bm.edges:
        e.smooth = True
    bm.normal_update()
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    # bmesh keeps face and loop order, so FACES' corners line up with the mesh's corners.
    assert len(corner_normals) == len(mesh.loops), (len(corner_normals), len(mesh.loops))
    mesh.normals_split_custom_set(corner_normals)
    got = np.array([c.vector[:] for c in mesh.corner_normals])
    want = np.array(corner_normals)
    err = float(np.abs(got - want).max())
    assert err < 0.02, ('custom normals did not stick', err)   # Blender stores them quantised
    return mesh, tri_count


def check_contract(mesh):
    co = np.array([v.co[:] for v in mesh.vertices])  # Blender axes
    three = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    lo, hi = three.min(axis=0), three.max(axis=0)
    size = hi - lo
    centre = (lo + hi) / 2
    assert abs(lo[1]) < 1e-6, lo
    assert abs(centre[0]) < 0.001 and abs(centre[2]) < 0.001, centre
    assert 2.049 <= size[0] <= 2.051, size
    assert 2.099 <= size[1] <= 2.101, size
    assert 2.499 <= size[2] <= 2.501, size
    # Runtime anchors (TruckBay.tsx YardJockey): YARD text at x 1.01, y 1.175 .. 1.425, z about +-0.35 sits
    # on the plumb lower wall; the 1.7 x 1.0 windscreen plane at z 1.26, y 1.05 .. 2.05 is backed by the
    # front cap; the beacon (r 0.1) stands on the flat roof.
    # "YARD" at fontSize 0.25 is about 0.63 m long (four capitals at ~0.63 em): z +-0.32, so the plumb
    # wall must run at least +-0.33 and the fender line stay under the text's lower edge (y 1.175).
    assert float(cab_top(0.32)) >= 1.43 and float(cab_top(-0.32)) >= 1.43 and FEN_Y1 <= 1.17, 'YARD label wall'
    assert CAB_Z0 <= -0.33 and CAB_ZS >= 0.33, 'YARD label wall length'
    assert FEN_X1 <= 1.0255 and WHEEL_XO < FEN_X1, 'width is set by the fender flare, wheels inboard of it'
    assert CAB_FT >= 2.05 and CAB_Y0 <= 1.05 and CAB_FX >= 0.85, 'windscreen plane'
    assert CAB_RR <= -0.10 and CAB_RF >= 0.10 and CAB_X >= 0.10, 'beacon pad'
    assert 3 * TRIANGLES <= 756, 'render vertex budget'
    assert FW_Z + FW_RR < CAB_Z0 and FW_Z - FW_RR > -1.25, 'coupling clear of the cab back and the deck end'
    print('YARD_JOCKEY_BOUNDS', [round(x, 5) for x in size], 'centre', [round(x, 6) for x in centre])


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False   # doubleSided: the fender and tyre interiors are open toward the body
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.55

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-jockey-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-jockey-body-normal'
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
        raise SystemExit('usage: blender -b --factory-startup -P yard-jockey-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    build_faces()
    check_frames()
    stage = tempfile.mkdtemp(prefix='yard-jockey-body-')
    try:
        colour_path = os.path.join(stage, 'yard-jockey-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-jockey-body-normal.png')
        colour_pixels = build_colour_pixels()
        write_jpeg(colour_path, colour_pixels, quality=COLOUR_Q)
        write_png(normal_path, build_normal_pixels())
        dump = os.environ.get('YJ_TEXTURE_DUMP')  # debugging only: keep a copy of the staged textures
        if dump:
            os.makedirs(dump, exist_ok=True)
            shutil.copy(colour_path, dump)
            shutil.copy(normal_path, dump)
            write_png(os.path.join(dump, 'colour-raw.png'), colour_pixels)
        print('YARD_JOCKEY_TEXTURES colour', os.path.getsize(colour_path), 'normal', os.path.getsize(normal_path),
              'atlas', round(ATLAS, 3), 'm', round(COLOUR_PX / ATLAS), 'px/m')

        mesh, tris = build_mesh()
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-jockey-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'YARD_JOCKEY_WROTE {out_path} {os.path.getsize(out_path)} bytes, {tris} triangles')


main()
