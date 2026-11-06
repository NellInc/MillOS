"""Yard weighbridge body (world-yard-weight-scale-body), built from scratch in headless Blender.

What it builds
--------------
The truck weighbridge and its scale house at both truck-yard entrances
(TruckBay.tsx WeightScale, GLB mounted at (+1.299999952, -0.09950038, 0) inside
the component group, so the deck centre is the component origin and the ramp
toes dip just under the yard ground). Delivered at its final metric size,
6.80 W x 3.2745 H x 14.5075 D m, origin at the ground centre, three.js +Z =
front. Everything is authored in the component frame (the fallback primitives'
frame, TruckBay.tsx:1898-1935, where the yard ground is y 0) and shifted by
SHIFT on export. One node `Yard-weight-scale-bodyBody`, one material
(single-sided), one primitive.

* deck       cross profile lofted along z +-6: four raised tread plates (the outer two widened
             to x +-2.0) with sloped edges and three 40 mm channels between them, closed at each
             deck end by a riser that is also the plates' end cap.
* kerbs      each long side is a raised steel guide kerb lofted toe to toe from ONE side-elevation
             profile: its outer face is a single plane from the GLB ground (x +-2.1, the delivered
             extreme) up to a crest 0.15 m above the plates, and its ends climb out of each ramp at
             the ramp's own pitch, so the ramp-to-deck joint is framed by a continuous rail and the
             deck side is a light galvanised face, not a dark web over a slit.
* ramps      one wedge top at each end, the full kerb width (x +-2.1), flush with the plate tops at
             z +-6 and down to a knife toe on the ground at z +-7.25374.
* booth      a box on the fallback hut's plan (x 2.5-4.5, z +-1.25) standing on a projecting
             concrete plinth (out 0.12 m on three faces and 0.18 m under the door, where it is
             the landing; top y 0.22). The -X wall is exactly the fallback hut's west face
             (y 0-3, BoxGeometry diagonal), because scripts/weight-scale-face.test.mjs matches
             its two triangles in the loaded GLB; its foot is inside the plinth. So is the
             housing front (x 2.15, y 2.2-2.8, z +-0.6). The other walls' heads follow the fall.
             A dark square downpipe stands on the plinth at the +X/+Z corner, up into the eave.
* door       painted on the +X wall in a raised architrave under a galvanised drip strip, over
             the plinth landing.
* roof       a pent slab falling 1:6 from the deck side to the door side, traced from its end
             elevation: a deep 0.38 m canopy eave over the deck-facing wall (the window and the
             display sit under it), 0.37 m eaves on the sides, a 0.17 m fascia on every edge and one
             soffit parallel to the top.
* housing    the display cabinet with a depth return on the -X wall: front at x 2.15 (the
             runtime readout sits 10 mm in front of it), a visor hood that projects 120 mm past the
             face and climbs to the wall clear of the soffit, a corbel underside back to the wall
             just above the window head, and two cheeks.

Triangle budget (contract 276 render vertices = 92 triangles):

  plate tops, channel walls, floor, risers     26
  ramps                                         4
  guide kerbs (outer, inner, ramp ends)        12
  booth walls                                   8
  plinth                                       10
  roof top, fascia, soffit                     12
  display housing with visor                   14
  downpipe                                      6
  total                                        92

Faces nobody can see (undersides on the ground, the housing back inside the wall) are
not built. Finer detail lives in the two allowed textures, one atlas laid out per
face at a per-part texel density (identical faces share one rect):

* base colour (JPEG): light tread plates with ribbed anti-slip bars, bolted edges,
  load-cell covers and scuffed wheel tracks over a darker bolted edge frame;
  dark channels with drain slots; ribbed ramp steel; a galvanised bolted edge angle
  over a dark web darkening into grime at the ground; pale-grey profiled cladding
  with painted crests and shaded flanks, slate corner flashings, head flashing and
  kick band; the window frame, dark interior and a painted sill on the runtime glass
  rectangle; a steel door with vision panel, lever and kick plate in a raised
  galvanised architrave; a meter cabinet and a vent on the side walls; a board-marked
  concrete plinth with a steel-nosed landing; a dark membrane roof with laps and an
  outlet, a galvanised coping, a dark fascia with a drip edge, a perforated soffit;
  a dark cabinet with slate cheeks under a galvanised hood.
* tangent-space normal map (JPEG) from height fields in metres.

Runtime anchors kept (component frame): the window plane (x 2.49, y 1.2-2.4,
z +-0.9) has flat wall behind it; the readout plane and its text (x 2.14 and
2.12, y 2.25-2.75, z +-0.5) land on the housing face at x 2.15; the yellow ring
(y 0.06) lies under the deck top; the WEIGH STATION text (y 0.25, z -7) is above
the -Z ramp, whose surface there is y -0.04. Nothing enters the window box
(x 2.15-2.5, y 1.2-2.4, z +-0.9) except the housing front's foot, as in the
fallback primitives, or the readout box (y 2.25-2.75, z +-0.5).

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/yard-weight-scale-body.py -- <out.glb>

Re-runnable and deterministic (seeded noise). Writes only <out.glb>; textures
are staged in a temporary directory that is removed afterwards, unless
WSB_KEEP_TEXTURES=<dir> is set, which also copies the two atlases there.
"""

import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
import numpy as np

NODE_NAME = 'Yard-weight-scale-bodyBody'
MESH_NAME = 'yard-weight-scale-body-mesh'
MATERIAL_NAME = 'yard-weight-scale-body-surface'
SCENE_NAME = 'MillOS_World_Yard-weight-scale-body'

MAX_TRIANGLES = 92
MAX_BYTES = 46000
TEX = 512
SUPERSAMPLE = 2
GUTTER = 3
COLOUR_QUALITY = 58
NORMAL_QUALITY = 46   # the normal atlas is smooth relief; it tolerates the lower quality the byte contract needs
MAX_SLOPE = 1.2

# ---------------------------------------------------------------- dimensions (component frame)
G = -0.09950038              # GLB ground in the component frame
DECK_X, DECK_Z, DECK_Y = 2.0, 6.0, 0.20   # DECK_Y: tread-plate top, flush with the ramp back edges
REC_Y = 0.16                 # floor of the three lengthwise channels between the plates
CH_X = (-1.0, 0.0, 1.0)      # channel centres
CH_HW, CH_FW = 0.10, 0.075   # channel half-width at the plate tops and at the floor (sloped plate edges)
RAMP_X, RAMP_Z = 2.1, 7.25374
PLATE_X = (-1.5, -0.5, 0.5, 1.5)
PLATE_HW, PLATE_HL = 0.4, 5.5
# Raised guide kerb along each long side: inner face from the plate edge (x +-2.0, y 0.2) up to a crest on
# the outer face (x +-2.1, y KERB_Y); the crest climbs out of each ramp at the ramp's own pitch, so the
# outer face is one trapezoid whose sloped ends are collinear with the ramp's side edges.
KERB_Y = DECK_Y + 0.15
RAMP_PITCH = (DECK_Y - G) / (RAMP_Z - DECK_Z)
KERB_Z = DECK_Z - (KERB_Y - DECK_Y) / RAMP_PITCH
BCX, BHX, BHZ = 3.5, 1.0, 1.25   # booth centre x, half extents (the fallback hut's 2 x 2.5 m plan)
# Projecting concrete plinth (a real step): out 0.12 m on the deck and side faces, 0.18 m on the door
# face where it doubles as the door landing; its top is one quad under the whole booth.
PL_X0, PL_X1, PL_Z, PL_Y = 2.38, 4.68, 1.37, 0.22
PLINTH_Y = PL_Y
# Pent roof slab traced from its end elevation: falls 1:6 from the deck side (high) to the door side, with
# a deep canopy eave over the deck-facing wall and a soffit parallel to the top.
RX0, RX1, RHZ = 2.12, 4.70, 1.62  # x 4.70 is the GLB's +x extreme
RCX, RHX = (RX0 + RX1) / 2, (RX1 - RX0) / 2
ROOF_FALL = 1.0 / 6.0            # metres of fall per metre toward +x
ROOF_C = 0.0                     # no geometric coping: the coping is painted on the top's edge
FASCIA_D = 0.17                  # vertical slab thickness, top line to soffit
ROOF_PEAK = 3.175                # the high (deck-side) eave's top edge: the GLB's top extreme
DOOR_Z, DOOR_TOP, DOOR_Y0 = 0.45, 2.40, PL_Y
# Display cabinet, side profile (x, y): front bottom A, front top F, hood root T and corbel root W on the wall.
# V is the visor tip, 120 mm proud of the face; the hood root T stays clear of the soffit, so the cabinet
# reads as its own unit mounted on the wall rather than a tab growing out of the eave.
HOUSING = dict(x0=2.15, y0=2.20, y1=2.80, xw=2.50, yt=2.88, yw=2.48, z=0.60, vx=2.03, vy=2.83)
# Downpipe: a 90 mm square section on the +X wall by the +Z corner, standing on the plinth.
PIPE = dict(x0=4.50, x1=4.59, z0=1.00, z1=1.09)
GLASS_Z, GLASS_Y = 0.9, (1.2, 2.4)
FRAME_W = 0.04
KICK_Y = 0.50


def roof_top(x):
    """Roof top line (the membrane plane) at x."""
    return ROOF_PEAK - ROOF_FALL * (x - RX0)


def soffit_y(x):
    return roof_top(x) - FASCIA_D


def wall_top(x):
    """Wall heads of the +X and side walls: parallel to the soffit and 20 mm into the slab. The pinned -X
    wall keeps its 3.0 head, which must also land inside the slab."""
    return soffit_y(x) + 0.02


assert soffit_y(BCX - BHX) < 3.0 < roof_top(BCX - BHX) and wall_top(BCX - BHX) < roof_top(BCX - BHX)
assert soffit_y(BCX + BHX) > 2.40 + 0.115 + 0.06  # the door's drip strip clears the soffit
TRIM_W = 0.035
RIB_PITCH = 0.16
CLAD_PITCH = 0.3125

# Component frame -> GLB frame.
SHIFT = np.array([-1.299999952, 0.09950038, 0.0])
EXPECTED_BOUNDS = ((-3.399999952, 3.400000048), (0.0, 3.27450038), (-RAMP_Z, RAMP_Z))  # GLB x, y, z

# Paint, sRGB 0-255.
DECK = np.array([74, 87, 106], np.float32)      # #475569
DECK_EDGE = np.array([56, 66, 80], np.float32)
PLATE = np.array([132, 146, 164], np.float32)   # #64748b lifted: the plates read lighter than the deck frame
CH_FLOOR = np.array([40, 46, 54], np.float32)   # channel floor, in shade between the plates
RAMP = np.array([96, 110, 130], np.float32)
CHANNEL = np.array([62, 72, 86], np.float32)
WALL = np.array([206, 212, 220], np.float32)    # #e2e8f0 down so sun does not clip it
TRIM = np.array([186, 193, 203], np.float32)
KICK = np.array([84, 92, 104], np.float32)
FRAME = np.array([62, 70, 82], np.float32)
ALU = np.array([150, 157, 166], np.float32)     # anodised window frame
GLASS_LO = np.array([22, 30, 42], np.float32)
GLASS_HI = np.array([70, 86, 104], np.float32)
SILL_C = np.array([150, 156, 162], np.float32)
DOOR = np.array([55, 65, 81], np.float32)       # #374151
STEEL = np.array([168, 172, 176], np.float32)
PLINTH = np.array([98, 98, 96], np.float32)     # dark weathered concrete: the base separates from the walls
ROOF = np.array([84, 96, 114], np.float32)
COPING = np.array([150, 158, 168], np.float32)
FASCIA = np.array([70, 82, 100], np.float32)
SOFFIT = np.array([86, 96, 110], np.float32)
CABINET = np.array([36, 45, 58], np.float32)    # #1f2937 lifted
SCREEN = np.array([12, 18, 16], np.float32)
GRIME = np.array([96, 90, 80], np.float32)
FLASH = np.array([74, 84, 98], np.float32)      # dark slate corner and head flashing
EDGE_ANGLE = np.array([88, 100, 116], np.float32)
AC_CASE = np.array([204, 206, 202], np.float32)
FAN = np.array([28, 32, 36], np.float32)
RUBBER = np.array([44, 44, 46], np.float32)
BLACK = np.array([16, 18, 22], np.float32)
YELLOW = np.array([222, 178, 40], np.float32)

# Softened edges painted per part: (radius m, drop m).
EDGE = {
    'kerb': (0.012, 0.004), 'pipe': (0.012, 0.004), 'visor': (0.01, 0.003),
    'fascia': (0.02, 0.006), 'cab': (0.015, 0.005), 'hood': (0.01, 0.003), 'ramp': (0.02, 0.005),
    'plinth': (0.02, 0.006),
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


def inside(sd, soft=0.002):
    return smoothstep(soft, -soft, sd)


def groove(d, width, depth):
    """Height of a groove centred on the zero line of distance field d."""
    return -depth * (1 - smoothstep(0, width / 2, np.abs(d)))


def dome(d, radius, height):
    t = np.clip(1 - (d / radius) ** 2, 0, 1)
    return height * np.sqrt(t)


def quarter_round(d, r):
    """Height of an eased edge: 0 beyond r, falling to -r * 0.35 at the edge (d = 0)."""
    d = np.clip(d, 0.0, r)
    return (np.sqrt(np.maximum(r * r - (r - d) ** 2, 0.0)) - r) * 0.35


# ---------------------------------------------------------------- geometry
FACES = []  # dicts: pts (k,3) component frame, part, tag, n, density, share, flip


def add_face(pts, part, tag, outward, density=1.0, share=None, flip=False, diag=None):
    pts = np.array(pts, dtype=np.float64)
    n = np.zeros(3)
    for i in range(len(pts)):  # Newell normal
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    if np.dot(n, outward) < 0:
        pts = pts[::-1]
        n = -n
    n /= np.linalg.norm(n)
    FACES.append({'pts': pts, 'part': part, 'tag': tag, 'n': n, 'density': density, 'share': share,
                  'flip': flip, 'diag': diag})


UP = np.array([0.0, 1.0, 0.0])
# (outward n, a_dir) for the four sides; a_dir x up = n, so a runs left to right seen from outside.
SIDES = {
    'pz': (np.array([0.0, 0.0, 1.0]), np.array([1.0, 0.0, 0.0])),
    'nz': (np.array([0.0, 0.0, -1.0]), np.array([-1.0, 0.0, 0.0])),
    'px': (np.array([1.0, 0.0, 0.0]), np.array([0.0, 0.0, -1.0])),
    'nx': (np.array([-1.0, 0.0, 0.0]), np.array([0.0, 0.0, 1.0])),
}
for _n, _ad in SIDES.values():
    assert np.allclose(np.cross(_ad, UP), _n)


def halves(name, hx, hz):
    """(half extent along n, half extent along a) for a side of an x/z box."""
    return (hx, hz) if name in ('px', 'nx') else (hz, hx)


def side_quad(centre, n, ad, half_n, a0, a1, y0, y1):
    bl = centre + n * half_n + ad * a0 + UP * y0
    return [bl, centre + n * half_n + ad * a1 + UP * y0, centre + n * half_n + ad * a1 + UP * y1,
            centre + n * half_n + ad * a0 + UP * y1]


def build_deck():
    """The deck and ramps are lofted from two profiles instead of stacked as slabs.

    Side profile (traced toe to toe): ground at the -Z toe, up the ramp side to the deck, up the kerb
    end at the same pitch to the crest, along it, and down the far end. That profile is the outer
    face of each guide kerb, a single plane from the GLB ground to the crest.

    Cross profile (lofted along z): four raised tread plates (the outer two widened to carry the
    0.1 m edge frame) with sloped edges, and three channels between them 40 mm deep. The plates are
    flush with the ramp back edges; a riser at each deck end closes the channel ends and doubles as
    the plates' end caps.
    """
    T, R = DECK_Y, REC_Y
    edges = [-DECK_X]
    for cx in CH_X:
        edges += [cx - CH_HW, cx + CH_HW]
    edges.append(DECK_X)
    for i in range(0, len(edges), 2):
        x0, x1 = edges[i], edges[i + 1]
        outer = i in (0, len(edges) - 2)
        flip = x0 > 0
        add_face([(x0, T, -DECK_Z), (x1, T, -DECK_Z), (x1, T, DECK_Z), (x0, T, DECK_Z)],
                 'plate', 'outer' if outer else 'inner', (0, 1, 0), density=0.8,
                 share='plate-outer' if outer else 'plate-inner', flip=flip)
    for cx in CH_X:
        for sx in (-1, 1):  # sx -1: the wall on the channel's -x side, facing +x
            xt, xb = cx + sx * CH_HW, cx + sx * CH_FW
            add_face([(xt, T, -DECK_Z), (xt, T, DECK_Z), (xb, R, DECK_Z), (xb, R, -DECK_Z)],
                     'chwall', 'wall', (-sx, 0.6, 0), density=0.5, share='chwall')
    lo, hi = CH_X[0] - CH_FW, CH_X[-1] + CH_FW
    add_face([(lo, R, -DECK_Z), (hi, R, -DECK_Z), (hi, R, DECK_Z), (lo, R, DECK_Z)],
             'chfloor', 'floor', (0, 1, 0), density=0.35)
    for sz in (1, -1):
        z0 = sz * DECK_Z
        add_face([(CH_X[0] - CH_HW, T, z0), (CH_X[-1] + CH_HW, T, z0), (hi, R, z0), (lo, R, z0)],
                 'chend', 'end', (0, 0, -sz), density=1.0, share='chend')
        z1 = sz * RAMP_Z
        add_face([(-RAMP_X, T, z0), (RAMP_X, T, z0), (RAMP_X, G, z1), (-RAMP_X, G, z1)],
                 'ramp', 'top', (0, 1, sz * 0.24), density=0.9, share='ramp-top')
    # Each long side is a raised guide kerb lofted from one side-elevation profile, toe to toe. The outer
    # face is a single trapezoid from the ground to the crest; its sloped ends run straight up each ramp's
    # side edge and on to the crest, so the ramp, the kerb end and the deck share one modelled joint.
    for sx in (1, -1):
        add_face([(sx * RAMP_X, G, -RAMP_Z), (sx * RAMP_X, G, RAMP_Z), (sx * RAMP_X, KERB_Y, KERB_Z),
                  (sx * RAMP_X, KERB_Y, -KERB_Z)], 'kerb', 'outer', (sx, 0, 0), density=0.9, share='kerb-outer')
        add_face([(sx * DECK_X, T, -DECK_Z), (sx * DECK_X, T, DECK_Z), (sx * RAMP_X, KERB_Y, KERB_Z),
                  (sx * RAMP_X, KERB_Y, -KERB_Z)], 'kerb', 'inner', (-sx * (KERB_Y - T), RAMP_X - DECK_X, 0),
                 density=1.4, share='kerb-inner')
        for sz in (1, -1):
            add_face([(sx * DECK_X, T, sz * DECK_Z), (sx * RAMP_X, T, sz * DECK_Z), (sx * RAMP_X, KERB_Y, sz * KERB_Z)],
                     'kerb', 'end', (0, 1, sz * RAMP_PITCH), density=1.4)


def build_booth():
    """A box booth on the fallback hut's plan, standing on a projecting concrete plinth. The -X wall is
    exactly the fallback hut's west face (y 0-3, BoxGeometry diagonal), which
    scripts/weight-scale-face.test.mjs matches in the loaded GLB; its foot is hidden in the plinth. The
    other three walls stand on the plinth top and their heads follow the roof's fall."""
    x0, x1, z0, z1 = BCX - BHX, BCX + BHX, -BHZ, BHZ
    add_face([(x0, 0.0, z1), (x0, 0.0, z0), (x0, 3.0, z0), (x0, 3.0, z1)], 'wall', 'nx', (-1, 0, 0), 2.0,
             diag=((2.5, 0.0, -1.25), (2.5, 3.0, 1.25)))
    add_face([(x1, PL_Y, z0), (x1, PL_Y, z1), (x1, wall_top(x1), z1), (x1, wall_top(x1), z0)], 'wall', 'px',
             (1, 0, 0), 2.0)
    for sz in (1, -1):
        add_face([(x0, PL_Y, sz * BHZ), (x1, PL_Y, sz * BHZ), (x1, wall_top(x1), sz * BHZ), (x0, wall_top(x0), sz * BHZ)],
                 'wall', 'pz' if sz > 0 else 'nz', (0, 0, sz), 2.0)
    # Plinth: four faces down to the ground and one top quad under the whole booth (its middle is inside).
    add_face([(PL_X0, PL_Y, -PL_Z), (PL_X0, PL_Y, PL_Z), (PL_X1, PL_Y, PL_Z), (PL_X1, PL_Y, -PL_Z)],
             'plinth', 'top', (0, 1, 0), density=0.9)
    sides = [((PL_X0, -PL_Z), (PL_X0, PL_Z), (-1, 0, 0), 'x'), ((PL_X1, PL_Z), (PL_X1, -PL_Z), (1, 0, 0), 'x'),
             ((PL_X1, -PL_Z), (PL_X0, -PL_Z), (0, 0, -1), 'z'), ((PL_X0, PL_Z), (PL_X1, PL_Z), (0, 0, 1), 'z')]
    for (ax, az), (bx, bz), out, grp in sides:
        add_face([(ax, G, az), (bx, G, bz), (bx, PL_Y, bz), (ax, PL_Y, az)], 'plinth', 'side', out, density=1.0,
                 share='plinth-' + grp)


def build_roof():
    """A pent slab traced from its end elevation: the top falls 1:6 toward the door side, a fascia stands on
    every edge, one soffit parallel to the top closes it. The deck-side eave is a 0.38 m canopy over the
    window and the display; the side eaves are 0.37 m."""
    x0, x1, z0, z1 = RX0, RX1, -RHZ, RHZ
    add_face([(x0, roof_top(x0), z0), (x0, roof_top(x0), z1), (x1, roof_top(x1), z1), (x1, roof_top(x1), z0)],
             'rtop', 'top', (ROOF_FALL, 1, 0), density=1.0)
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    outward = [(0, 0, -1), (1, 0, 0), (0, 0, 1), (-1, 0, 0)]
    for k in range(4):
        (ax, az), (bx, bz) = corners[k], corners[(k + 1) % 4]
        add_face([(ax, soffit_y(ax), az), (bx, soffit_y(bx), bz), (bx, roof_top(bx), bz), (ax, roof_top(ax), az)],
                 'fascia', ('nz', 'px', 'pz', 'nx')[k], outward[k], density=1.6)
    add_face([(x0, soffit_y(x0), z0), (x1, soffit_y(x1), z0), (x1, soffit_y(x1), z1), (x0, soffit_y(x0), z1)],
             'soffit', 'soffit', (-ROOF_FALL, -1, 0), density=0.6)


def build_housing():
    """The display cabinet with a real depth return: the front is the fallback backing's west face; a visor
    hood runs from a tip 120 mm proud of the face up to the wall, clear of the soffit; a corbel underside runs
    from the face's foot back to the wall just above the window head; each cheek is a quad and the visor's
    triangle."""
    h = HOUSING
    z = h['z']
    A, F, T, W = (h['x0'], h['y0']), (h['x0'], h['y1']), (h['xw'], h['yt']), (h['xw'], h['yw'])
    V = (h['vx'], h['vy'])
    add_face([(A[0], A[1], -z), (A[0], A[1], z), (F[0], F[1], z), (F[0], F[1], -z)], 'cab', 'front', (-1, 0, 0),
             density=2.2, diag=((A[0], A[1], -z), (F[0], F[1], z)))  # the fallback backing's west face
    add_face([(A[0], A[1], -z), (W[0], W[1], -z), (W[0], W[1], z), (A[0], A[1], z)], 'cab', 'bottom', (0.6, -1, 0),
             density=2.0)
    add_face([(V[0], V[1], -z), (V[0], V[1], z), (T[0], T[1], z), (T[0], T[1], -z)], 'hood', 'top',
             (-(T[1] - V[1]), T[0] - V[0], 0), density=2.0)
    add_face([(F[0], F[1], -z), (F[0], F[1], z), (V[0], V[1], z), (V[0], V[1], -z)], 'visor', 'under',
             (-(V[1] - F[1]), -(F[0] - V[0]), 0), density=2.0)
    for sz in (1, -1):
        add_face([(A[0], A[1], sz * z), (F[0], F[1], sz * z), (T[0], T[1], sz * z), (W[0], W[1], sz * z)], 'cab',
                 'side', (0, 0, sz), density=2.2)
        add_face([(F[0], F[1], sz * z), (V[0], V[1], sz * z), (T[0], T[1], sz * z)], 'cab', 'side', (0, 0, sz),
                 density=2.2)


def build_pipe():
    """A square downpipe on the +X wall by the +Z corner: three faces from the plinth top up into the slab."""
    p = PIPE
    y0, y1 = PL_Y, soffit_y(p['x0']) + 0.02
    assert y1 < roof_top(p['x1'])
    add_face([(p['x1'], y0, p['z1']), (p['x1'], y0, p['z0']), (p['x1'], y1, p['z0']), (p['x1'], y1, p['z1'])],
             'pipe', 'px', (1, 0, 0), density=1.6)
    for sz, zz in ((1, p['z1']), (-1, p['z0'])):
        add_face([(p['x0'], y0, zz), (p['x1'], y0, zz), (p['x1'], y1, zz), (p['x0'], y1, zz)], 'pipe', 'side',
                 (0, 0, sz), density=1.6, share='pipe-side')


def build_geometry():
    build_deck()
    build_booth()
    build_roof()
    build_housing()
    build_pipe()


def triangle_count():
    return sum(len(f['pts']) - 2 for f in FACES)


# ---------------------------------------------------------------- atlas layout
def face_frame(f):
    n = f['n']
    v = UP - n * np.dot(UP, n)
    if np.linalg.norm(v) < 1e-6:  # horizontal face: v runs toward -z
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
    """Faces that own a rect: every unshared face and the first face of each share group."""
    seen, out = set(), []
    for f in FACES:
        if f['share'] is None or f['share'] not in seen:
            out.append(f)
            if f['share'] is not None:
                seen.add(f['share'])
    return out


def pack(density):
    """First-fit decreasing-height shelves; a short rect may stack under its shelf's earlier fill."""
    items = sorted(owners(), key=lambda f: -f['size'][1] / (density / f['density']))
    shelves = []  # [y, height, columns]: columns = list of [x, width, used_height]
    top = 0
    for f in items:
        d = density / f['density']
        w = int(math.ceil(f['size'][0] / d)) + 2 * GUTTER
        h = int(math.ceil(f['size'][1] / d)) + 2 * GUTTER
        if w > TEX:
            return False
        placed = None
        for shelf in shelves:
            sy, sh, cols = shelf
            if h > sh:
                continue
            for col in cols:  # stack into a column's free height below the shelf top
                cx, cw, used = col
                if w <= cw and used + h <= sh:
                    placed = (cx, sy + used)
                    col[2] += h
                    break
            if placed:
                break
            x_end = cols[-1][0] + cols[-1][1] if cols else 0
            if x_end + w <= TEX:
                placed = (x_end, sy)
                cols.append([x_end, w, h])
                break
        if placed is None:
            if top + h > TEX:
                return False
            shelves.append([top, h, [[0, w, h]]])
            placed = (0, top)
            top += h
        f['rect'] = (placed[0], placed[1], w, h)
        f['d'] = d
    return True


def layout():
    for f in FACES:
        face_frame(f)
    density = 0.008
    while not pack(density):
        density *= 1.02
    groups = {}
    for f in owners():
        if f['share'] is not None:
            groups[f['share']] = f
    for f in FACES:
        if f['share'] is not None and groups[f['share']] is not f:
            src = groups[f['share']]
            assert np.allclose(f['size'], src['size'], atol=1e-6), (f['share'], f['size'], src['size'])
            f['rect'], f['d'] = src['rect'], src['d']
            f['owner_size'] = src['size']
    return density


# ---------------------------------------------------------------- painting
def edge_distance(f, lu, lv):
    """Distance (metres) from a texel to the face's polygon boundary, positive inside."""
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


def paint_deck(P):
    x, z = P[..., 0], P[..., 2]
    ax, az = np.abs(x), np.abs(z)
    Q = np.stack([ax, P[..., 1], az], -1)  # symmetric noise: the two halves are 180-degree twins
    mottle = 1.0 + (noise3(Q, 0.6) - 0.5) * 0.10 + (noise3(Q, 0.09, 3) - 0.5) * 0.03
    h = np.zeros(x.shape)
    rgb = DECK * mottle[..., None]
    # Bolted perimeter angle along the long edges and the ends.
    edge = np.minimum(DECK_X - ax, DECK_Z - az)
    band = 1 - smoothstep(0.085, 0.092, edge)
    rgb = mix(rgb, DECK_EDGE * mottle[..., None], band)
    h += groove(edge - 0.09, 0.012, 0.004)
    h += quarter_round(edge, 0.02)
    for bz in np.arange(-5.75, 5.76, 0.5):
        d = np.hypot(DECK_X - 0.045 - ax, z - bz)
        rgb = mix(rgb, STEEL * 0.62, smoothstep(0.016, 0.012, d))
        h += dome(d, 0.016, 0.004)
    # Galvanised nosing plate across each deck end, the twin of the ramp's: the seam is framed.
    nose = 1 - smoothstep(0.115, 0.125, DECK_Z - az)
    rgb = mix(rgb, STEEL * 0.98 * mottle[..., None], nose)
    rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.010, np.abs(DECK_Z - az - 0.125))))[..., None]
    h += 0.004 * nose + groove(DECK_Z - az - 0.125, 0.012, 0.004)
    # Tread plates: raised 6 mm, bolted edges, transverse anti-slip bars.
    plate = np.zeros(x.shape)
    pd = np.full(x.shape, np.inf)
    for px in PLATE_X:
        sd = box_sdf(x, z, px - PLATE_HW, px + PLATE_HW, -PLATE_HL, PLATE_HL, 0.03)
        plate = np.maximum(plate, inside(sd, 0.006))
        pd = np.minimum(pd, sd)
    inner = np.clip(-pd, 0, None)
    rib_phase = np.abs(((az + RIB_PITCH / 2) % RIB_PITCH) - RIB_PITCH / 2)
    rib = (1 - smoothstep(0.022, 0.034, rib_phase)) * smoothstep(0.05, 0.07, inner)
    prgb = PLATE * (1.0 + (noise3(Q, 0.5, 21) - 0.5) * 0.10)[..., None]
    prgb = mix(prgb, PLATE * 1.10, rib * 0.6)
    prgb *= (1 - 0.18 * (1 - smoothstep(0.0, 0.02, inner)))[..., None]
    rgb = mix(rgb, prgb, plate)
    h += plate * 0.003 * rib
    # Countersunk plate bolts every metre along both plate edges.
    for px in PLATE_X:
        for ex in (px - PLATE_HW + 0.06, px + PLATE_HW - 0.06):
            for bz in np.arange(-5.0, 5.01, 1.0):
                d = np.hypot(x - ex, z - bz)
                rgb = mix(rgb, PLATE * 0.62, smoothstep(0.018, 0.013, d))
                h += groove(d, 0.03, 0.003)
    # Load-cell and lifting covers between the plate ends and the deck ends.
    for cx in PLATE_X:
        d = np.hypot(x - cx, az - 5.75)
        rgb = mix(rgb, DECK_EDGE * 0.85, smoothstep(0.105, 0.098, d))
        rgb *= (1 - 0.35 * (1 - smoothstep(0.003, 0.009, np.abs(d - 0.1))))[..., None]
        h += groove(d - 0.1, 0.012, 0.004)
        h += dome(np.hypot(x - cx, az - 5.75), 0.018, 0.003)
    # The plate's sloped edge rolls off at the face boundary along both long edges.
    h += quarter_round(np.minimum(np.abs(ax - 0.1), np.abs(ax - 0.9)) * (ax < 1.0)
                       + np.abs(ax - 1.1) * (ax >= 1.0), 0.012)
    # Wheel tracks: rubber scuff and grime on the outer plates where duals run.
    track = np.zeros(x.shape)
    for tx in (-1.45, -0.55, 0.55, 1.45):
        track = np.maximum(track, 1 - smoothstep(0.12, 0.30, np.abs(x - tx)))
    scuff = track * (0.10 + 0.14 * noise3(np.stack([x * 3.0, P[..., 1], az * 0.25], -1), 1.0, 23))
    rgb = mix(rgb, RUBBER, scuff)
    dirt = (1 - smoothstep(0.0, 0.5, DECK_Z - az)) * 0.10 + 0.08 * smoothstep(0.55, 0.8, noise3(Q, 0.8, 25))
    rgb = mix(rgb, GRIME * 0.7, dirt)
    return rgb, h


def paint_ramp(P, lu, lv, f):
    # lv runs uphill from the toe; lu across.
    mottle = 1.0 + (noise3(P, 0.6) - 0.5) * 0.10 + (noise3(P, 0.09, 3) - 0.5) * 0.025
    rgb = RAMP * mottle[..., None]
    h = np.zeros(lu.shape)
    W, L = f['size']
    across = RAMP_X - np.abs(P[..., 0])
    rib_phase = np.abs(((lv + RIB_PITCH / 2) % RIB_PITCH) - RIB_PITCH / 2)
    rib = (1 - smoothstep(0.022, 0.034, rib_phase)) * smoothstep(0.07, 0.09, across) * smoothstep(0.08, 0.12, lv) \
        * smoothstep(0.06, 0.10, L - lv)
    rgb = mix(rgb, RAMP * 1.12, rib * 0.65)
    h += 0.004 * rib
    # Side edge bars and the joint at the deck end.
    bar = 1 - smoothstep(0.055, 0.062, across)
    rgb = mix(rgb, DECK_EDGE * mottle[..., None], bar)
    h += groove(across - 0.06, 0.012, 0.004)
    # Galvanised nosing plate at the deck end, matching the deck's: the seam is a framed, bolted joint.
    top = L - lv
    nose = 1 - smoothstep(0.115, 0.125, top)
    rgb = mix(rgb, STEEL * 0.98 * mottle[..., None], nose)
    rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.010, np.abs(top - 0.125))))[..., None]
    h += 0.004 * nose + groove(top - 0.125, 0.012, 0.004)
    for bx in np.arange(-1.8, 1.81, 0.6):
        d = np.hypot(P[..., 0] - bx, top - 0.06)
        rgb = mix(rgb, STEEL * 0.6, smoothstep(0.014, 0.010, d))
        h += dome(d, 0.014, 0.003)
    # Tyre dirt and toe grime.
    track = np.zeros(lu.shape)
    for tx in (-1.45, -0.55, 0.55, 1.45):
        track = np.maximum(track, 1 - smoothstep(0.12, 0.32, np.abs(P[..., 0] - tx)))
    rgb = mix(rgb, RUBBER, track * (0.10 + 0.12 * noise3(P, 0.3, 27)) * (1 - nose * 0.6))
    rgb = mix(rgb, GRIME * 0.8, (1 - smoothstep(0.0, 0.45, lv)) * (0.22 + 0.15 * noise3(P, 0.25, 29)))
    return rgb, h


def paint_kerb(P, tag):
    """The guide kerbs: light galvanised steel so the deck side reads as a framed rail, not a dark slit.
    Bolted panel joints every 1.5 m on the outer face, yellow and black hazard bands where each kerb climbs
    out of the ramp, a little splash grime at the foot (kept light: no dark band at the ground)."""
    y, z = P[..., 1], P[..., 2]
    az = np.abs(z)
    mottle = 1.0 + (noise3(P, 0.4, 61) - 0.5) * 0.08 + (noise3(P, 0.08, 62) - 0.5) * 0.03
    h = np.zeros(z.shape)
    rgb = STEEL * 1.04 * mottle[..., None]
    # Hazard bands on the kerb ends: diagonal yellow/black stripes from the ramp seam out to the crest start.
    end_zone = smoothstep(KERB_Z - 0.55, KERB_Z - 0.53, az) * (az < DECK_Z + 0.02)
    stripe = ((az + y * 1.2) % 0.24) < 0.12
    hazard = np.where(stripe, 1.0, 0.0)
    hrgb = YELLOW * (1 - hazard[..., None]) + BLACK * 1.6 * hazard[..., None]
    if tag == 'end':
        rgb = hrgb * mottle[..., None]
    else:
        rgb = mix(rgb, hrgb * mottle[..., None], end_zone * 0.92)
    if tag == 'outer':
        for bz in np.arange(-4.5, 4.51, 1.5):
            seam = 1 - smoothstep(0.004, 0.010, np.abs(z - bz))
            rgb *= (1 - 0.30 * seam)[..., None]
            h += groove(z - bz, 0.012, 0.004)
            for by in (0.05, 0.26):
                for off in (-0.05, 0.05):
                    d = np.hypot(z - bz - off, y - by)
                    rgb = mix(rgb, STEEL * 0.62, smoothstep(0.014, 0.010, d))
                    h += dome(d, 0.014, 0.004)
        # A pressed stiffening rib along the face, catching the light just under the crest.
        rib = 1 - smoothstep(0.012, 0.022, np.abs(y - (KERB_Y - 0.045)))
        rgb *= (1 + 0.10 * rib * (az < KERB_Z - 0.55))[..., None]
        h += 0.006 * rib * (az < KERB_Z - 0.55)
        # Crest arris highlight and light splash grime at the foot.
        rgb *= (1 + 0.08 * (1 - smoothstep(0.0, 0.02, KERB_Y - y)))[..., None]
        foot = 1 - smoothstep(G, G + 0.10, y)
        rgb = mix(rgb, GRIME * 1.05, foot * (0.30 + 0.15 * noise3(P, 0.2, 31)))
    elif tag == 'inner':
        for bz in np.arange(-5.0, 5.01, 1.0):
            d = np.hypot(z - bz, y - (DECK_Y + KERB_Y) / 2)
            rgb = mix(rgb, STEEL * 0.62, smoothstep(0.014, 0.010, d))
            h += dome(d, 0.014, 0.004)
        rgb *= (1 - 0.25 * (1 - smoothstep(DECK_Y, DECK_Y + 0.03, y)))[..., None]  # contact shade at the plate
    rgb = mix(rgb, GRIME * 0.85, 0.10 * smoothstep(0.55, 0.85, noise3(P, 0.3, 63)))
    return rgb, h


def paint_channel(part, P, lu, lv):
    """The channels between the plates: dark steel walls, a grimy floor with drain slots."""
    mottle = 1.0 + (noise3(P, 0.3, 41) - 0.5) * 0.12
    h = np.zeros(lu.shape)
    if part == 'chfloor':
        rgb = CH_FLOOR * mottle[..., None]
        z = P[..., 2]
        slot = (1 - smoothstep(0.03, 0.04, np.abs(((z + 0.5) % 1.0) - 0.5))) \
            * (np.min(np.abs(P[..., 0][..., None] - np.array(CH_X)), axis=-1) < 0.04)
        rgb = mix(rgb, BLACK, slot * 0.8)
        h += -0.004 * slot
        rgb = mix(rgb, GRIME * 0.55, 0.25 * smoothstep(0.4, 0.8, noise3(P, 0.35, 45)))
    else:
        rgb = DECK_EDGE * 0.75 * mottle[..., None]
        rgb *= (0.85 + 0.15 * np.clip(lv / max(lv.max(), 1e-6), 0, 1))[..., None]
    return rgb, h


def wall_coords(tag, P):
    x, z = P[..., 0], P[..., 2]
    if tag == 'nx':
        return z + BHZ, 2 * BHZ
    if tag == 'px':
        return BHZ - z, 2 * BHZ
    if tag == 'pz':
        return x - (BCX - BHX), 2 * BHX
    return (BCX + BHX) - x, 2 * BHX


def paint_wall(tag, P, lu, mottle, grime_n):
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    a, L = wall_coords(tag, P)
    h = np.zeros(a.shape)
    rgb = WALL * (1 + (mottle - 1) * 0.5)[..., None]
    edge = np.minimum(a, L - a)
    hd = soffit_y(x)  # visible wall head: the soffit over this point
    flat = np.zeros(a.shape)  # 1 where a fitting replaces the profiled sheet
    if tag == 'nx':
        g0, g1 = BHZ - GLASS_Z, BHZ + GLASS_Z
        flat = np.maximum(flat, inside(box_sdf(a, y, g0 - 0.10, g1 + 0.10, GLASS_Y[0] - 0.14, GLASS_Y[1] + 0.08), 0.004))
        flat = np.maximum(flat, inside(box_sdf(a, y, BHZ - HOUSING['z'] - 0.06, BHZ + HOUSING['z'] + 0.06,
                                               GLASS_Y[1], 3.0), 0.004))
    elif tag == 'px':
        flat = np.maximum(flat, inside(box_sdf(a, y, BHZ - DOOR_Z - 0.12, BHZ + DOOR_Z + 0.12, G, DOOR_TOP + 0.10), 0.004))
        flat = np.maximum(flat, inside(box_sdf(a, y, 1.84, 2.18, 1.36, 1.66), 0.004))
    elif tag == 'nz':
        flat = np.maximum(flat, inside(box_sdf(a, y, L / 2 - 0.29, L / 2 + 0.29, 2.26, 2.66), 0.004))
    else:
        flat = np.maximum(flat, inside(box_sdf(a, y, L / 2 - 0.26, L / 2 + 0.26, 0.86, 1.62), 0.004))
    # Profiled steel cladding: vertical trapezoidal ribs at 250 mm between the kick band and the head.
    zone = smoothstep(KICK_Y + 0.005, KICK_Y + 0.02, y) * smoothstep(hd - 0.10, hd - 0.115, y) \
        * smoothstep(TRIM_W + 0.01, TRIM_W + 0.03, edge) * (1 - flat)
    off = ((a - L / 2 + CLAD_PITCH / 2) % CLAD_PITCH) - CLAD_PITCH / 2
    t = smoothstep(0.030, 0.075, np.abs(off))  # 0 on the crest, 1 in the pan
    crest = (1 - t) * zone
    flank = (smoothstep(0.022, 0.034, np.abs(off)) * smoothstep(0.085, 0.072, np.abs(off))) * zone
    h += 0.018 * crest
    # The ribs are painted as well as relieved, so the sheet reads as profiled steel at yard distance:
    # bright crests, shaded flanks, and faint run-off streaks down the pans.
    streak = noise3(np.stack([a * 7.0, y * 0.35, a * 0.0], -1), 1.0, 71)
    rgb *= (1 + 0.07 * crest - 0.16 * flank - 0.06 * streak * t * zone)[..., None]
    # Dark slate corner flashing: a folded angle up every corner, raised over the sheet.
    trim = 1 - smoothstep(TRIM_W - 0.003, TRIM_W + 0.003, edge)
    rgb = mix(rgb, FLASH * (1 + (mottle - 1) * 0.8)[..., None], trim)
    rgb *= (1 + 0.10 * (1 - smoothstep(0.0, 0.02, np.abs(edge - TRIM_W * 0.55))) * trim)[..., None]
    h += 0.010 * trim + quarter_round(edge, 0.025)
    h += groove(edge - TRIM_W - 0.004, 0.008, 0.004)
    rgb *= (1 - 0.30 * (1 - smoothstep(0.0, 0.012, np.abs(edge - TRIM_W - 0.004))))[..., None]
    infill = edge > TRIM_W
    # Head flashing under the soffit.
    head = smoothstep(hd - 0.102, hd - 0.098, y) * infill
    rgb = mix(rgb, FLASH * 1.15, head)
    h += 0.010 * head
    rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.015, np.abs(y - (hd - 0.104)))) * infill)[..., None]
    # Concrete plinth, slate kick band, splash grime above.
    plinth = 1 - smoothstep(PLINTH_Y - 0.003, PLINTH_Y + 0.003, y)
    kick = (1 - smoothstep(KICK_Y - 0.004, KICK_Y + 0.004, y)) * (1 - plinth)
    rgb = mix(rgb, KICK * (1 + (mottle - 1) * 0.8)[..., None], kick * infill)
    conc = PLINTH * (1 + (noise3(P, 0.16, 33) - 0.5) * 0.12)[..., None]
    rgb = mix(rgb, mix(conc, GRIME * 0.7, (1 - smoothstep(G, 0.06, y)) * (0.3 + 0.2 * grime_n)), plinth)
    h += groove(y - PLINTH_Y, 0.012, 0.005) + groove(np.where(infill, y - KICK_Y, np.inf), 0.010, 0.004)
    rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.01, np.abs(y - PLINTH_Y - 0.004))))[..., None]
    rgb = mix(rgb, GRIME, (1 - smoothstep(KICK_Y, KICK_Y + 0.5, y)) * (y > KICK_Y) * (0.10 + 0.12 * grime_n))
    # Soffit occlusion at the head, contact shade where the wall meets the plinth top.
    rgb *= (1 - 0.25 * smoothstep(hd - 0.30, hd, y))[..., None]
    rgb *= (1 - 0.30 * (1 - smoothstep(PL_Y, PL_Y + 0.07, y)))[..., None]
    if tag == 'nx':
        g0, g1 = BHZ - GLASS_Z, BHZ + GLASS_Z
        y0, y1 = GLASS_Y
        frame = inside(box_sdf(a, y, g0 - FRAME_W, g1 + FRAME_W, y0 - FRAME_W, y1 + FRAME_W), 0.003)
        glass = inside(box_sdf(a, y, g0, g1, y0, y1), 0.003)
        frame = np.clip(frame - glass, 0, 1)
        mullion = inside(box_sdf(a, y, BHZ - 0.02, BHZ + 0.02, y0, y1), 0.003) * glass
        # Drip streaks and a shadow line under the painted pressed-metal sill.
        sy = y0 - FRAME_W - 0.05
        sill = inside(box_sdf(a, y, g0 - 0.08, g1 + 0.08, sy, y0 - FRAME_W), 0.002)
        below = (y < sy) * smoothstep(sy - 0.8, sy, y)
        for sx in (g0 - 0.03, g1 + 0.03):
            rgb = mix(rgb, GRIME, np.clip(1 - np.abs(a - sx) / 0.06, 0, 1) * below * 0.12)
        rgb *= (1 - 0.30 * (1 - smoothstep(0.0, 0.04, sy - y)) * (y < sy) * (np.abs(a - BHZ) < GLASS_Z + 0.08))[..., None]
        rgb = mix(rgb, SILL_C * mottle[..., None], sill)
        h += 0.012 * sill
        rgb = mix(rgb, ALU * mottle[..., None], frame)
        gv = np.clip((y - y0) / (y1 - y0), 0, 1)
        sheen = 0.20 * (noise3(P, 0.6, 7) - 0.5)
        glass_rgb = GLASS_LO + (GLASS_HI - GLASS_LO) * np.clip(gv ** 1.5 + sheen, 0, 1)[..., None]
        desk = inside(box_sdf(a, y, g0, g1, y0, y0 + 0.10), 0.004) * 0.5
        glass_rgb = mix(glass_rgb, GLASS_LO * 0.6, desk)
        rgb = mix(rgb, glass_rgb, glass)
        rgb = mix(rgb, ALU * 0.9, mullion)
        h += 0.014 * frame - 0.015 * glass + 0.02 * mullion
        # The cabinet's cheeks, hood and corbel meet the wall: a contact shadow round that outline, a
        # galvanised mounting flange just outside it, and shade under the corbel down to the window head.
        hq = HOUSING
        hz = hq['z']
        cab = box_sdf(a, y, BHZ - hz, BHZ + hz, hq['yw'], hq['yt'])
        flange = inside(cab - 0.06, 0.002) * (cab > 0)
        rgb = mix(rgb, STEEL * 0.88 * mottle[..., None], flange)
        h += 0.006 * flange
        rgb *= (1 - 0.40 * (1 - smoothstep(0.0, 0.012, np.abs(cab))))[..., None]
        rgb *= (1 - 0.30 * (1 - smoothstep(0.0, 0.10, np.maximum(cab, 0))) * (y < hq['yw']))[..., None]
    elif tag == 'px':
        # The door: a steel leaf in a raised galvanised architrave, over the plinth landing.
        l0, l1 = BHZ - DOOR_Z, BHZ + DOOR_Z
        o = box_sdf(a, y, l0 - 0.07, l1 + 0.07, G - 1, DOOR_TOP + 0.07)
        arch = inside(o, 0.002) * (1 - inside(box_sdf(a, y, l0, l1, G - 1, DOOR_TOP), 0.001))
        rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.04, np.maximum(o, 0))) * (o > 0))[..., None]
        rgb = mix(rgb, STEEL * 0.86 * mottle[..., None], arch)
        h += 0.020 * arch
        leaf = inside(box_sdf(a, y, l0, l1, G - 1, DOOR_TOP), 0.001)
        lrgb, lh = paint_leaf(a, y, mottle)
        rgb = mix(rgb, lrgb, leaf)
        h += lh * leaf - 0.012 * leaf
        rgb *= (1 - 0.45 * (1 - smoothstep(0.0, 0.010, np.abs(box_sdf(a, y, l0, l1, G - 1, DOOR_TOP)))))[..., None]
        # A galvanised drip hood strip over the architrave head.
        drip = inside(box_sdf(a, y, l0 - 0.12, l1 + 0.12, DOOR_TOP + 0.075, DOOR_TOP + 0.115), 0.002)
        rgb = mix(rgb, STEEL * 0.90 * mottle[..., None], drip)
        h += 0.018 * drip
        rgb *= (1 - 0.40 * (1 - smoothstep(0.0, 0.03, DOOR_TOP + 0.075 - y)) * (y < DOOR_TOP + 0.075)
                * (np.abs(a - BHZ) < DOOR_Z + 0.12) * (y > DOOR_TOP))[..., None]
        # Contact shadow on the cladding behind the downpipe.
        pa0, pa1 = BHZ - PIPE['z1'], BHZ - PIPE['z0']
        pd = np.maximum(pa0 - a, a - pa1)
        rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.05, np.maximum(pd, 0))) * (y < hd))[..., None]
        # Small mounted site plate beside the door.
        plate = inside(box_sdf(a, y, 1.86, 2.16, 1.40, 1.62, 0.01), 0.002)
        rgb = mix(rgb, np.array([226, 230, 236], np.float32), plate)
        rgb = mix(rgb, np.array([30, 64, 175], np.float32), inside(box_sdf(a, y, 1.88, 2.14, 1.56, 1.60), 0.0015))
        for ly in (1.50, 1.465):
            rgb = mix(rgb, KICK, inside(box_sdf(a, y, 1.89, 2.08 - (1.50 - ly) * 2, ly - 0.007, ly + 0.007), 0.0015))
        h += 0.004 * plate
        for bx in (1.88, 2.14):
            for by in (1.42, 1.60):
                h += dome(np.hypot(a - bx, y - by), 0.008, 0.002)
    elif tag == 'nz':
        # Wall-mounted louvred vent high on the wall.
        vent = box_sdf(a, y, L / 2 - 0.25, L / 2 + 0.25, 2.30, 2.62, 0.015)
        rgb = mix(rgb, TRIM * 0.92, inside(vent, 0.003))
        h += 0.010 * inside(vent, 0.004)
        rgb *= (1 - 0.3 * (1 - smoothstep(0.0, 0.03, np.maximum(vent, 0))) * (vent > 0))[..., None]
        for vy in np.arange(2.35, 2.59, 0.04):
            sd = box_sdf(a, y, L / 2 - 0.21, L / 2 + 0.21, vy - 0.008, vy + 0.008, 0.006)
            rgb = mix(rgb, KICK * 0.7, inside(sd, 0.0015) * 0.85)
            h += groove(sd + 0.008, 0.016, 0.004) * (sd < 0.008)
        rgb = mix(rgb, GRIME, np.clip(1 - np.abs(a - L / 2) / 0.25, 0, 1) * (y < 2.30) * smoothstep(1.7, 2.3, y) * 0.07)
    else:
        # Electricity meter cabinet with its conduit down into the ground.
        mc = box_sdf(a, y, L / 2 - 0.22, L / 2 + 0.22, 0.90, 1.58, 0.012)
        m = inside(mc, 0.002)
        rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.035, np.maximum(mc, 0))) * (mc > 0) * (y < 1.3))[..., None]
        rgb = mix(rgb, np.array([196, 200, 196], np.float32) * mottle[..., None], m)
        h += 0.016 * m
        rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.006, np.abs(mc + 0.02))) * m)[..., None]
        rgb = mix(rgb, np.array([235, 236, 238], np.float32), inside(box_sdf(a, y, L / 2 - 0.08, L / 2 + 0.08, 1.38, 1.46), 0.0015))
        rgb = mix(rgb, YELLOW, inside(box_sdf(a, y, L / 2 - 0.05, L / 2 + 0.05, 1.20, 1.28, 0.004), 0.0015))
        cd = box_sdf(a, y, L / 2 - 0.03, L / 2 + 0.03, G - 1, 0.90)
        rgb = mix(rgb, TRIM * 0.95, inside(cd, 0.002))
        h += 0.02 * inside(cd, 0.002) * (1 - smoothstep(0.015, 0.03, np.abs(a - L / 2)))
    return rgb, h


def paint_leaf(a, y, mottle):
    """The steel door leaf in wall coordinates (a along the +X wall, y up)."""
    l0, l1 = BHZ - DOOR_Z, BHZ + DOOR_Z
    h = np.zeros(a.shape)
    rgb = DOOR * (1 + (mottle - 1) * 0.8)[..., None]
    panel = box_sdf(a, y, l0 + 0.10, l1 - 0.10, 0.45, 1.25, 0.01)
    h += groove(panel, 0.010, 0.003)
    rgb *= (1 - 0.25 * (1 - smoothstep(0.0, 0.006, np.abs(panel))))[..., None]
    vis_frame = inside(box_sdf(a, y, BHZ - 0.21, BHZ + 0.21, 1.45, 1.99, 0.01), 0.002)
    vis = inside(box_sdf(a, y, BHZ - 0.18, BHZ + 0.18, 1.48, 1.96, 0.006), 0.002)
    gv = np.clip((y - 1.48) / 0.48, 0, 1)
    rgb = mix(rgb, STEEL * 0.75, np.clip(vis_frame - vis, 0, 1))
    rgb = mix(rgb, GLASS_LO + (GLASS_HI - GLASS_LO) * (gv ** 1.4)[..., None], vis)
    h += 0.004 * np.clip(vis_frame - vis, 0, 1) - 0.006 * vis
    lx = l1 - 0.09
    back_plate = inside(box_sdf(a, y, lx - 0.022, lx + 0.022, 0.95, 1.20, 0.008), 0.002)
    lever = inside(box_sdf(a, y, lx - 0.13, lx + 0.012, 1.075, 1.105, 0.012), 0.002)
    rgb = mix(rgb, STEEL, np.maximum(back_plate, lever))
    h += 0.004 * back_plate + 0.03 * lever
    rgb *= (1 - 0.3 * inside(box_sdf(a, y + 0.03, lx - 0.13, lx + 0.012, 1.075, 1.105, 0.012), 0.006)
            * (1 - lever))[..., None]
    kp = inside(box_sdf(a, y, l0 + 0.03, l1 - 0.03, G - 1, DOOR_Y0 + 0.30), 0.002)
    rgb = mix(rgb, STEEL * 0.92 * (1 + (mottle - 1) * 2)[..., None], kp)
    h += 0.002 * kp
    for hy in (0.50, 1.25, 1.95):
        k = inside(box_sdf(a, y, l0, l0 + 0.02, hy - 0.06, hy + 0.06, 0.005), 0.002)
        rgb = mix(rgb, STEEL * 0.8, k)
        h += 0.004 * k
    return rgb, h


def paint(f, P, lu, lv):
    part, tag = f['part'], f['tag']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    mottle = 1.0 + (noise3(P, 0.35) - 0.5) * 0.06 + (noise3(P, 0.05, 3) - 0.5) * 0.015
    grime_n = noise3(P, 0.2, 5)
    h = np.zeros(x.shape)

    if part == 'plate':
        rgb, h = paint_deck(P)
    elif part in ('chwall', 'chfloor', 'chend'):
        rgb, h = paint_channel(part, P, lu, lv)
    elif part == 'ramp':
        rgb, h = paint_ramp(P, lu, lv, f)
    elif part == 'kerb':
        rgb, h = paint_kerb(P, tag)
    elif part == 'wall':
        rgb, h = paint_wall(tag, P, lu, mottle, grime_n)
    elif part == 'plinth':
        # Cast concrete plinth: board-marked sides with a pencil-rounded arris, splash grime at the
        # ground; the top carries a steel-nosed landing in front of the door.
        rgb = PLINTH * (1 + (noise3(P, 0.16, 33) - 0.5) * 0.14 + (noise3(P, 0.04, 35) - 0.5) * 0.05)[..., None]
        if tag == 'side':
            board = np.abs(((y - G + 0.055) % 0.11) - 0.055)
            rgb *= (1 - 0.08 * (1 - smoothstep(0.002, 0.006, board)))[..., None]
            h += groove(board, 0.006, 0.0015)
            rgb = mix(rgb, GRIME * 0.6, (1 - smoothstep(G, G + 0.16, y)) * (0.35 + 0.25 * grime_n))
            rgb *= (1 + 0.08 * smoothstep(PL_Y - 0.03, PL_Y, y))[..., None]
        else:
            # Shadow line where the walls stand on it, a drip of grime under each wall.
            dw = np.minimum.reduce([np.abs(x - (BCX - BHX)) + 99 * (np.abs(z) > BHZ),
                                    np.abs(x - (BCX + BHX)) + 99 * (np.abs(z) > BHZ),
                                    np.abs(np.abs(z) - BHZ) + 99 * ((x < BCX - BHX) | (x > BCX + BHX))])
            rgb *= (1 - 0.40 * (1 - smoothstep(0.0, 0.05, dw)))[..., None]
            land = (x > BCX + BHX) * (np.abs(z) < 0.75)
            nose = smoothstep(PL_X1 - 0.05, PL_X1 - 0.045, x) * land
            grooves = (1 - smoothstep(0.004, 0.008, np.abs(((x + 0.025) % 0.05) - 0.025))) * land * (1 - nose)
            rgb *= (1 - 0.16 * grooves)[..., None]
            h += -0.002 * grooves
            rgb = mix(rgb, STEEL * 0.78 * mottle[..., None], nose)
            h += 0.003 * nose
            rgb = mix(rgb, GRIME * 0.7, 0.20 * grime_n * (1 - smoothstep(0.0, 0.08, dw)))
    elif part == 'rtop':
        # Dark single-ply membrane with welded laps across the fall and an outlet at the low edge.
        rgb = ROOF * 0.86 * (1 + (mottle - 1) * 1.6)[..., None]
        lap = np.abs(((z + 0.25) % 1.0) - 0.5)
        lapm = 1 - smoothstep(0.47, 0.49, lap)
        rgb *= (1 + 0.10 * lapm)[..., None]
        h += 0.003 * lapm
        d = np.minimum(RHX - ROOF_C - np.abs(x - RCX), RHZ - ROOF_C - np.abs(z))
        rgb *= (1 - 0.25 * (1 - smoothstep(0.06, 0.16, d)))[..., None]
        cop = 1 - smoothstep(0.055, 0.06, d)
        rgb = mix(rgb, COPING * 1.12 * mottle[..., None], cop)
        h += 0.006 * cop + quarter_round(d, 0.03)
        ponding = smoothstep(0.5, 0.0, (RCX + RHX - ROOF_C) - x) * (0.10 + 0.10 * grime_n)
        rgb = mix(rgb, GRIME * 0.6, ponding)
        outlet = box_sdf(x, z, RCX + RHX - ROOF_C - 0.14, RCX + RHX - ROOF_C + 0.1, -0.12, 0.12, 0.02)
        rgb = mix(rgb, BLACK * 1.6, inside(outlet, 0.004))
        h += -0.006 * inside(outlet, 0.004)
    elif part == 'fascia':
        # Dark slate fascia: a galvanised coping along its top, a galvanised drip edge along its foot,
        # joint covers, run-off streaks; on the low +X edge a galvanised half-round gutter.
        rgb = FASCIA * 0.80 * mottle[..., None]
        # Height above the soffit line, so the bands stay parallel on the sloped side fascias.
        lv = y - soffit_y(x)
        Hf = FASCIA_D
        streak = noise3(np.stack([lu * 9.0, lv * 0.3, lu * 0.0], -1), 1.0, 13)
        rgb *= (1 - 0.12 * streak)[..., None]
        drip = 1 - smoothstep(0.026, 0.03, lv)
        rgb = mix(rgb, STEEL * 0.92 * mottle[..., None], drip)
        h += 0.010 * drip
        rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.008, np.abs(lv - 0.032))))[..., None]
        rgb *= (1 - 0.30 * (1 - smoothstep(0.0, 0.01, Hf - lv)))[..., None]
        along = z if tag in ('px', 'nx') else x
        joint = np.abs(((along + 0.6) % 1.2) - 0.6)
        jc = (1 - smoothstep(0.035, 0.04, joint)) * (1 - drip)
        rgb = mix(rgb, FASCIA * 1.10, jc)
        h += 0.004 * jc
        coping = smoothstep(Hf - 0.036, Hf - 0.032, lv)
        rgb = mix(rgb, COPING * 1.12 * mottle[..., None], coping)
        h += 0.008 * coping
        if tag == 'px':
            gut = smoothstep(0.03, 0.035, lv) * (1 - smoothstep(0.125, 0.13, lv))
            gv = np.clip((lv - 0.035) / 0.09, 0, 1)
            rgb = mix(rgb, STEEL * (0.80 + 0.30 * np.sin(gv * np.pi))[..., None] * mottle[..., None], gut)
            h += 0.02 * np.sin(gv * np.pi) * gut
    elif part == 'soffit':
        # Flat soffit under the slab: perforated vent strip along the drip, shaded toward the walls.
        rgb = SOFFIT * mottle[..., None]
        d = np.minimum(RHX - np.abs(x - RCX), RHZ - np.abs(z))
        vent = smoothstep(0.035, 0.04, d) * (1 - smoothstep(0.085, 0.09, d))
        holes = 1 - smoothstep(0.005, 0.008, np.hypot(((x + 0.015) % 0.03) - 0.015, ((z + 0.015) % 0.03) - 0.015))
        rgb = mix(rgb, SOFFIT * 0.55, vent * (0.35 + 0.5 * holes))
        h += -0.003 * vent * holes
        rgb *= (1 - 0.40 * smoothstep(0.10, 0.36, d))[..., None]
    elif part == 'cab':
        # Front bezel stays near-black round the readout; the cheeks and corbel are dark slate enclosure
        # steel, lighter than the window glass below so the cabinet reads as its own box.
        rgb = (CABINET if tag == 'front' else FASCIA * 0.95) * (1 + (mottle - 1) * 1.2)[..., None]
        if tag == 'front':
            # Bezel, four screws and the dark screen glass behind the runtime readout.
            # Galvanised bezel round the dark cabinet face, so the housing reads as a framed steel unit.
            rim = 1 - inside(box_sdf(z, y, -0.57, 0.57, 2.23, 2.77, 0.01), 0.002)
            rgb = mix(rgb, STEEL * 0.85 * mottle[..., None], rim)
            h += 0.004 * rim
            scr = box_sdf(z, y, -0.52, 0.52, 2.235, 2.765, 0.01)
            rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.008, np.abs(scr + 0.004))))[..., None]
            gv = np.clip((y - 2.235) / 0.53, 0, 1)
            glass = SCREEN + (np.array([40, 52, 50], np.float32) - SCREEN) * (gv ** 2)[..., None]
            rgb = mix(rgb, glass, inside(scr, 0.002))
            h += -0.006 * inside(scr, 0.003)
            for sz in (-0.56, 0.56):
                for sy in (2.24, 2.76):
                    d = np.hypot(z - sz, y - sy)
                    rgb = mix(rgb, STEEL * 0.7, smoothstep(0.011, 0.008, d))
                    h += dome(d, 0.010, 0.003)
        elif tag == 'side':
            # Cheek: a galvanised hood band along the top line, a steel bracket along the underside,
            # ventilation slots between.
            hq = HOUSING
            dx = x - hq['x0']
            top_line = hq['vy'] + (x - hq['vx']) * (hq['yt'] - hq['vy']) / (hq['xw'] - hq['vx'])
            bot_line = hq['y0'] + dx * (hq['yw'] - hq['y0']) / (hq['xw'] - hq['x0'])
            hood = smoothstep(top_line - 0.062, top_line - 0.058, y)
            brk = 1 - smoothstep(0.06, 0.065, (y - bot_line) * np.cos(np.arctan2(hq['yw'] - hq['y0'], hq['xw'] - hq['x0'])))
            # Folded return flange where the cheek meets the wall.
            ret = smoothstep(hq['xw'] - 0.06, hq['xw'] - 0.055, x)
            rgb = mix(rgb, STEEL * 0.62 * mottle[..., None], ret)
            h += 0.004 * ret
            for vy in np.arange(2.40, 2.76, 0.05):
                sd = box_sdf(x, y, 2.19, 2.25, vy - 0.008, vy + 0.008, 0.006)
                inside_tri = (y < top_line - 0.08) * (y > bot_line + 0.08)
                rgb = mix(rgb, BLACK, inside(sd, 0.0015) * 0.8 * inside_tri)
                h += groove(sd + 0.008, 0.016, 0.003) * (sd < 0.008) * inside_tri
            rgb = mix(rgb, STEEL * 0.70 * mottle[..., None], brk)
            h += 0.006 * brk
            rgb = mix(rgb, STEEL * 0.82 * mottle[..., None], hood)
            rgb *= (1 - 0.35 * (1 - smoothstep(0.0, 0.006, np.abs(y - (top_line - 0.06)))))[..., None]
            h += 0.004 * hood
        else:
            # Underside: cable gland and a drip of grime toward the front edge.
            d = np.hypot(lu - f['size'][0] / 2, lv - 0.25)
            rgb = mix(rgb, BLACK * 1.4, smoothstep(0.022, 0.018, d))
            h += dome(d, 0.022, 0.008)
            rgb = mix(rgb, GRIME * 0.6, 0.12 + 0.1 * grime_n)
    elif part == 'hood':
        # Galvanised hood top: standing seams up the slope, grime at the eave.
        rgb = STEEL * 0.86 * mottle[..., None]
        seam = np.abs(((z + 0.6 + 0.15) % 0.3) - 0.15)
        sm = 1 - smoothstep(0.005, 0.012, seam)
        rgb *= (1 + 0.08 * sm)[..., None]
        h += 0.005 * sm
        rgb = mix(rgb, GRIME * 0.8, (0.08 + 0.10 * grime_n) * smoothstep(0.55, 0.85, noise3(P, 0.15, 45)))
        rgb *= (1 - 0.30 * smoothstep(HOUSING['yt'] - 0.08, HOUSING['yt'], y))[..., None]
    elif part == 'visor':
        # Visor underside: dark steel in its own shade, a lighter folded drip along the tip.
        rgb = FASCIA * 0.62 * mottle[..., None]
        tip = 1 - smoothstep(0.012, 0.018, x - HOUSING['vx'])
        rgb = mix(rgb, STEEL * 0.80 * mottle[..., None], tip)
        h += 0.004 * tip
    elif part == 'pipe':
        # Dark slate square downpipe: clip brackets every 0.8 m, a kicked shoe at the foot, splash grime.
        rgb = FLASH * 0.92 * (1 + (mottle - 1) * 1.4)[..., None]
        for by in np.arange(PL_Y + 0.55, 2.6, 0.8):
            k = 1 - smoothstep(0.022, 0.028, np.abs(y - by))
            rgb = mix(rgb, STEEL * 0.78 * mottle[..., None], k)
            h += 0.006 * k
        shoe = 1 - smoothstep(PL_Y + 0.14, PL_Y + 0.15, y)
        rgb *= (1 - 0.18 * shoe)[..., None]
        rgb = mix(rgb, GRIME * 0.7, (1 - smoothstep(PL_Y, PL_Y + 0.3, y)) * 0.3)
        rgb *= (1 - 0.25 * smoothstep(soffit_y(PIPE['x0']) - 0.25, soffit_y(PIPE['x0']), y))[..., None]
    else:
        rgb = np.broadcast_to(np.array([255, 0, 255], np.float32), x.shape + (3,)).copy()

    if part in EDGE:
        er, drop = EDGE[part]
        ed = edge_distance(f, lu, lv)
        roll = 1 - smoothstep(0.0, er, np.maximum(ed, 0))
        h -= drop * roll ** 2
        rgb = rgb * (1 + 0.06 * roll)[..., None]
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
def to_blender(p):
    """Component frame (three.js axes) -> GLB frame -> Blender (x, -z, y); a rotation, winding kept."""
    q = np.asarray(p, dtype=np.float64) + SHIFT
    return (float(q[0]), float(-q[2]), float(q[1]))


def face_uv(f, p):
    lu = np.dot(p - f['origin'], f['U'])
    lv = np.dot(p - f['origin'], f['V'])
    if f['flip']:  # 180-degree twin of the share owner
        su, sv = f['owner_size']
        lu, lv = su - lu, sv - lv
    rx, ry, _, _ = f['rect']
    return (rx + GUTTER + lu / f['d']) / TEX, (ry + GUTTER + lv / f['d']) / TEX


def polygons(f):
    """Index tuples into f['pts']: the face itself, or two triangles split on its pinned diagonal."""
    k = len(f['pts'])
    if f['diag'] is None:
        return [tuple(range(k))]
    ia, ib = (int(np.argmin(np.linalg.norm(f['pts'] - np.array(q), axis=1))) for q in f['diag'])
    assert k == 4 and (ia - ib) % 4 == 2, f['tag']
    return [(ia, (ia + 1) % 4, ib), (ib, (ib + 1) % 4, ia)]


def check_face_contract():
    """The runtime-face test (scripts/weight-scale-face.test.mjs) finds, in the loaded GLB, exactly one
    triangle per BoxGeometry west-face triangle of the fallback hut and display backing."""
    tris = [frozenset(tuple(np.round(f['pts'][i], 6)) for i in poly) for f in FACES for poly in polygons(f)
            if len(poly) == 3]
    required = [
        [(2.5, 3, -1.25), (2.5, 0, -1.25), (2.5, 3, 1.25)], [(2.5, 0, -1.25), (2.5, 0, 1.25), (2.5, 3, 1.25)],
        [(2.15, 2.8, -0.6), (2.15, 2.2, -0.6), (2.15, 2.8, 0.6)], [(2.15, 2.2, -0.6), (2.15, 2.2, 0.6), (2.15, 2.8, 0.6)],
    ]
    for t in required:
        assert tris.count(frozenset(tuple(np.round(np.array(p, float), 6)) for p in t)) == 1, t


def build_mesh():
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    owner = []
    for f in FACES:
        for poly in polygons(f):
            pts = [f['pts'][i] for i in poly]
            face = bm.faces.new([bm.verts.new(to_blender(p)) for p in pts])
            for loop, p in zip(face.loops, pts):
                u, v = face_uv(f, p)
                loop[uv_layer].uv = (float(u), float(v))
            owner.append(f)
    bm.normal_update()
    for face, f in zip(bm.faces, owner):
        n = f['n']
        expect = np.array([n[0], -n[2], n[1]])
        assert np.dot(np.array(face.normal), expect) > 0.99, (f['part'], f['tag'])
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
    bsdf.inputs['Roughness'].default_value = 0.62

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'yard-weight-scale-body-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'yard-weight-scale-body-normal'
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
    pts = np.concatenate([f['pts'] for f in FACES]) + SHIFT
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    for axis, (elo, ehi) in enumerate(EXPECTED_BOUNDS):
        assert abs(lo[axis] - elo) < 2e-6 and abs(hi[axis] - ehi) < 2e-6, (axis, lo[axis], hi[axis])
    tris = triangle_count()
    assert tris <= MAX_TRIANGLES, tris
    return tris


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P yard-weight-scale-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    build_geometry()
    tris = check_bounds()
    check_face_contract()
    density = layout()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='yard-weight-scale-body-')
    try:
        colour_px, normal_px = build_textures()
        colour_path = os.path.join(stage, 'yard-weight-scale-body-colour.jpg')
        normal_path = os.path.join(stage, 'yard-weight-scale-body-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'yard-weight-scale-body-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'yard-weight-scale-body-normal-stage')
        keep = os.environ.get('WSB_KEEP_TEXTURES')  # optional: a directory to copy the two atlases into
        if keep:
            for src in (colour_path, normal_path):
                shutil.copy(src, os.path.join(keep, os.path.basename(src)))
            print('YARD_WEIGHT_SCALE_BODY_TEXTURES', os.path.getsize(colour_path), os.path.getsize(normal_path))

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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/yard-weight-scale-body.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    size = os.path.getsize(out_path)
    print(f'YARD_WEIGHT_SCALE_BODY_WROTE {out_path} {size} bytes '
          f'{tris} triangles, {len(FACES)} faces, {density * 1000:.2f} mm/texel')
    assert size <= MAX_BYTES, f'{size} bytes over the {MAX_BYTES} byte contract'


main()
