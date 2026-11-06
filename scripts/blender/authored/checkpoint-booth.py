"""Truck-yard checkpoint booth (world-checkpoint-booth), built from scratch in headless Blender.

What it builds
--------------
The gatehouse booth that CheckpointBarrier (src/components/FactoryExterior.tsx)
stands on its 0.3 m concrete platform at both truck-bay entrances. Origin at the
ground centre, +Z (three.js) front, metres, identity node transform, one node
`Checkpoint-boothBody`, one material, one primitive:

* the booth body: a box on the 3.5 (X) x 3.0 (Z) m plan. Walls stay plumb and
  planar at x = +-1.75 and z = +-1.5 from y 0.02 up into the roof slab (top at
  y 3.575, 25 mm inside the slab, so the walls pierce the slab underside and
  body and roof are one touching assembly);
* a recessed door in the -X wall (away from the road), cut into the body itself:
  an opening z 0.35 .. 1.35, y 0.25 .. 2.25 (head at 2.25, a raised threshold at
  0.25) with a head, two jambs and a sill reveal 120 mm deep, and the door leaf on
  the recess back;
* a plinth step round the foot: a square pyramid homothetic to the body plan,
  its base at y 0 standing 100 mm (X walls) / 86 mm (Z walls) outside the wall
  planes and its apex buried at y 1.85 in the body, so only a 45 degree chamfered
  base course 100 mm high shows, mitred at every corner (the hips pass through
  the body corners). Inside the recess its face is at y 0.22, under the 0.25 sill;
* a flat charcoal roof slab 4.3 x 0.3 x 3.8 m, y 3.55 - 3.85, overhanging the
  walls by 0.4 m on every side. Its top stays flat at y 3.85, where the runtime
  sign uprights stand (x = +-1.2).

The asset contract allows 140 render vertices (D-036; = indices = at most 46
triangles), and every part must be closed (every directed edge paired). A
closed triangulated shell with V vertices costs 2V - 4 triangles: the body with
its door recess has 16 vertices (28), the roof 8 (12) and the plinth pyramid 5
(6): 46 triangles, 138 render vertices. A plinth ring of 8 vertices (12) does
not fit, nor do window reveals. Every other finish feature lives in three
textures on one unmirrored atlas, each face its own island (front and back
share one: their layouts are identical) with its height field authored in that
face's own metric frame:

* a tangent-space normal map (PNG) from height fields in real metres: eased
  vertical corners with a corner-post groove, a kick-band joint, panel seams
  under the windows, a raised 50 mm aluminium frame and a projecting sill round
  each runtime window opening, a centre mullion, a 50 mm casing round the door
  opening with an eased arris, the door leaf set in its stop with a vision
  panel, hinges and lever, eased roof edges, a coping strip on the roof top and a
  drip groove in the soffit;
* a base-colour map (JPEG): satin off-white walls (sRGB ~210, not the
  near-white that clipped in sun), charcoal kick band, a grey plinth course, dark
  aluminium frames, casing and reveals, dark interior glazing behind each
  opening, a charcoal steel door with a steel kick plate and threshold, a
  charcoal roof with weathering, a darker soffit with occlusion where the walls
  meet it, and faint grime only;
* a metallic-roughness map (PNG): glazing glossy, frames and door satin,
  walls semi-matt, roof and plinth matt, steel fittings metallic.

The plinth pyramid's four faces are mapped, whole triangle, into one small
swatch, so their hidden interiors sample nothing but plinth paint.

Runtime anchors kept: the window panes the runtime adds sit 10 mm outside the
wall planes (front/back 2.9 x 1.5 m centred, sides 2.6 x 1.5 m, centre
y 2.25 in this frame); the painted glazing and frames are drawn on exactly
those rectangles so the runtime glass reads as glazing set in a frame. The -X
(west) pane must end at the door: painted glass on that wall runs z -1.3 .. 0.30
(a 1.6 m pane centred at z -0.5), its 50 mm frame closing at the jamb arris
z 0.35, and nothing is painted over the door head. The
material is doubleSided and every part is a closed solid, as
closedDoubleFacedAssets.ts requires for this asset.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/checkpoint-booth.py -- <out.glb>

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

# ---------------------------------------------------------------- dimensions
BODY_HX, BODY_HZ = 1.75, 1.5          # wall planes (runtime boothWidth 3.5, boothDepth 3)
WALL_Y0 = 0.02                        # body bottom, inside the plinth (no cap coplanar with its base)
BODY_TOP = 3.575                      # 25 mm inside the slab
ROOF_HX, ROOF_HZ = 2.15, 1.9
ROOF_Y0, ROOF_Y1 = 3.55, 3.85
WALL_H = BODY_TOP - WALL_Y0
FASCIA_T = ROOF_Y1 - ROOF_Y0
# Plan of the body, three.js (x, z), in WALL order: wall k runs PLAN[k] -> PLAN[k+1],
# and (direction x up) is that wall's outward normal, so each wall quad is CCW seen
# from outside. A plain 3.5 x 3.0 m rectangle.
PLAN = [
    (-BODY_HX, BODY_HZ),     # front wall
    (BODY_HX, BODY_HZ),      # +X wall
    (BODY_HX, -BODY_HZ),     # back wall
    (-BODY_HX, -BODY_HZ),    # -X wall (window and door)
]
# Front and back carry the same layout and share one atlas island.
WALL_ISLANDS = ['fb', 'px', 'fb', 'nx']
# The door: an opening cut into the -X wall over z DOOR_Z0 .. DOOR_Z1, y DOOR_SILL ..
# DOOR_TOP, recessed DOOR_DEPTH to the leaf (the plane x = -DOOR_BACK).
DOOR_Z0, DOOR_Z1 = 0.35, 1.35
DOOR_SILL, DOOR_TOP = 0.25, 2.25
DOOR_DEPTH = 0.12
DOOR_BACK = BODY_HX - DOOR_DEPTH
DOOR_H = DOOR_TOP - DOOR_SILL
# The plinth: a square pyramid homothetic to the body plan about the plan centre.
# Its base stands SKIRT_X outside the X walls at y 0; at every wall plane its faces
# are SKIRT_H high; its apex is buried at SKIRT_APEX.
SKIRT_H = 0.10
SKIRT_X = 0.10
_k = (BODY_HX + SKIRT_X) / BODY_HX
SKIRT_Z = BODY_HZ * (_k - 1.0)
SKIRT_APEX = SKIRT_H * _k / (_k - 1.0)
# Height of the plinth's -X face at the recess back: it must stay under the sill.
SKIRT_IN_RECESS = SKIRT_APEX * (1.0 - DOOR_BACK / (BODY_HX + SKIRT_X))
assert SKIRT_IN_RECESS < DOOR_SILL - 0.02, ('plinth pokes into the door recess', SKIRT_IN_RECESS)
assert SKIRT_APEX < BODY_TOP - 0.5 and SKIRT_H > WALL_Y0 + 0.05

NODE_NAME = 'Checkpoint-boothBody'
MESH_NAME = 'checkpoint-booth-mesh'
MATERIAL_NAME = 'checkpoint-booth-surface'
SCENE_NAME = 'MillOS_World_Checkpoint-booth'

# Runtime glazing (FactoryExterior CheckpointBarrier), in this asset's frame.
GLASS_Y0, GLASS_Y1 = 1.5, 3.0
FB_GLASS = (0.30, 3.20)               # along the 3.5 m walls: x = +-1.45
SIDE_GLASS = (0.20, 2.80)             # along the 3.0 m walls: z = +-1.3
FRAME_W = 0.05
SILL_H = 0.06
SILL_OUT = 0.08                       # sill runs past the frame each side
KICK_Y = DOOR_SILL                    # top of the charcoal kick band, level with the threshold
POST = 0.08                           # corner-post groove inset
CORNER_R = 0.05
# Door leaf on the recess back, a = z - DOOR_Z0 across it (left to right seen from
# outside, -X), b = y - DOOR_SILL up it: a 35 mm stop round a 0.93 m leaf.
DOOR_FACE_W = DOOR_Z1 - DOOR_Z0
STOP_W = 0.035
DOOR_A0, DOOR_A1 = STOP_W, DOOR_FACE_W - STOP_W
LEAF_TOP = DOOR_H - STOP_W
CASING_W = 0.05                       # aluminium casing round the opening on the wall face
# The -X wall, a = z + BODY_HZ along it. The runtime -X pane ends at the door: painted
# glass runs z -1.3 .. DOOR_Z0 - FRAME_W, its frame closing at the jamb arris.
NX_DOOR_A0 = DOOR_Z0 + BODY_HZ
NX_DOOR_A1 = DOOR_Z1 + BODY_HZ
NX_GLASS = (SIDE_GLASS[0], NX_DOOR_A0 - FRAME_W)
MAX_SLOPE = 2.5

# Atlas, in atlas metres (the UV square is ATLAS x ATLAS).
ATLAS = 7.75
NORMAL_PX = 512
COLOUR_PX = 512
MR_PX = 256
COLOUR_Q = 82
SUPERSAMPLE = 3

# Paint, sRGB 0-255.
WALL = np.array([210, 206, 196], np.float32)
FRAME = np.array([74, 80, 88], np.float32)
SILL = np.array([150, 154, 156], np.float32)
GLASS_LO = np.array([30, 40, 50], np.float32)
GLASS_HI = np.array([82, 100, 116], np.float32)
KICK = np.array([72, 76, 82], np.float32)
PLINTH = np.array([116, 118, 120], np.float32)
DOOR = np.array([80, 88, 98], np.float32)
STEEL = np.array([160, 164, 166], np.float32)
ROOF = np.array([42, 49, 60], np.float32)
FASCIA = np.array([40, 47, 58], np.float32)
SOFFIT = np.array([60, 66, 74], np.float32)
GRIME = np.array([120, 112, 100], np.float32)
POST_TONE = WALL * np.array([0.97, 0.985, 1.0], np.float32)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def soft_box(v, centre, half, ramp):
    """1 inside |v - centre| < half, falling to 0 over `ramp` outside it."""
    return 1.0 - smoothstep(half, half + ramp, np.abs(v - centre))


def soft_rect(a, b, a0, a1, b0, b1, ramp):
    return soft_box(a, (a0 + a1) / 2, (a1 - a0) / 2, ramp) * soft_box(b, (b0 + b1) / 2, (b1 - b0) / 2, ramp)


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


def groove(dist, half, ramp, depth):
    return -depth * (1.0 - smoothstep(half, half + ramp, dist))


def line_dist_v(a, b, at, lo, hi):
    return np.where((b >= lo) & (b <= hi), np.abs(a - at), np.inf)


def line_dist_h(a, b, at, lo, hi):
    return np.where((a >= lo) & (a <= hi), np.abs(b - at), np.inf)


def mix(rgb, colour, w):
    return rgb * (1 - w[..., None]) + colour * w[..., None]


# ---------------------------------------------------------------- walls
# A wall field takes (a, y): a along the face (left to right seen from outside,
# 0 at the face's start corner), y the height in the asset frame. Every end of a
# face is a convex arris (50 mm ease and a corner-post groove).
CONVEX, INNER = 'convex', 'inner'


class WallLayout:
    def __init__(self, length, glass, end0=CONVEX, end1=CONVEX, mullion=True, seams=(),
                 panes=None, sill_hi=None, door=None):
        self.length = length
        self.ends = (end0, end1)
        self.seams = list(seams)
        self.door = door      # (a0, a1, sill, top) of the door opening cut into this wall
        g0, g1 = glass
        if panes is not None:
            self.panes = list(panes)
        elif mullion:
            mid = (g0 + g1) / 2
            self.panes = [(g0, mid - FRAME_W / 2, GLASS_Y0, GLASS_Y1),
                          (mid + FRAME_W / 2, g1, GLASS_Y0, GLASS_Y1)]
        else:
            self.panes = [(g0, g1, GLASS_Y0, GLASS_Y1)]
        # A sill runs past the frame each side, stopping 30 mm short of an arris,
        # or butting into the door casing.
        lo = max(g0 - SILL_OUT, 0.03)
        hi = min(g1 + SILL_OUT, length - 0.03) if sill_hi is None else sill_hi
        self.sill = (lo, hi)
        self.frame_outer = (g0 - FRAME_W, g1 + FRAME_W, GLASS_Y0 - FRAME_W, GLASS_Y1 + FRAME_W)
        assert self.frame_outer[0] >= 0.025 and self.frame_outer[1] <= length - 0.025, 'frame off the face'

    def end_terms(self, a):
        """Distances to each end, and the ease radius and corner-post width there."""
        d0, d1 = a, self.length - a
        r0 = CORNER_R if self.ends[0] == CONVEX else 0.0
        r1 = CORNER_R if self.ends[1] == CONVEX else 0.0
        p0 = POST if self.ends[0] == CONVEX else 0.0
        p1 = POST if self.ends[1] == CONVEX else 0.0
        return d0, d1, r0, r1, p0, p1

    def ease(self, a):
        d0, d1, r0, r1, _, _ = self.end_terms(a)
        h = np.zeros_like(a)
        if r0 > 0:
            h += quarter_round(d0, r0)
        if r1 > 0:
            h += quarter_round(d1, r1)
        return h

    def post_dist(self, a):
        """Distance to the nearer corner-post groove line (inf where there is none)."""
        d0, d1, _, _, p0, p1 = self.end_terms(a)
        out = np.full(a.shape, np.inf)
        if p0 > 0:
            out = np.minimum(out, np.abs(d0 - p0))
        if p1 > 0:
            out = np.minimum(out, np.abs(d1 - p1))
        return out

    def post_band(self, a):
        """1 on the corner posts (between an arris and its groove), else 0."""
        d0, d1, _, _, p0, p1 = self.end_terms(a)
        band = np.zeros_like(a)
        if p0 > 0:
            band = np.maximum(band, 1.0 - smoothstep(p0 - 0.004, p0 + 0.004, d0))
        if p1 > 0:
            band = np.maximum(band, 1.0 - smoothstep(p1 - 0.004, p1 + 0.004, d1))
        return band

    def infill(self, a):
        d0, d1, _, _, p0, p1 = self.end_terms(a)
        return (d0 > p0) & (d1 > p1)


def _centre_seams(glass):
    mid = (glass[0] + glass[1]) / 2
    return [mid - 0.83, mid, mid + 0.83]


def _third_seams(glass):
    return [glass[0] + (glass[1] - glass[0]) * k / 3 for k in (1, 2)]


# Faces in wall order. front runs -X -> +X; +X runs +Z -> -Z; back +X -> -X;
# nx -Z -> +Z. Front and back are the same layout on one shared island.
LAYOUTS = {
    'fb': WallLayout(2 * BODY_HX, FB_GLASS, seams=_centre_seams(FB_GLASS)),
    'px': WallLayout(2 * BODY_HZ, SIDE_GLASS, seams=_third_seams(SIDE_GLASS)),
    'nx': WallLayout(2 * BODY_HZ, NX_GLASS, sill_hi=NX_DOOR_A0 - CASING_W,
                     door=(NX_DOOR_A0, NX_DOOR_A1, DOOR_SILL, DOOR_TOP),
                     seams=_third_seams(NX_GLASS)),
}


def wall_masks(lay, a, y):
    """Soft masks for each finish region of one wall."""
    L = lay.length
    a0, a1, b0, b1 = lay.frame_outer
    frame = soft_rect(a, y, a0, a1, b0, b1, 0.006)
    glass = np.zeros_like(a)
    for p in lay.panes:
        glass = np.maximum(glass, soft_rect(a, y, *p, 0.005))
    door_zone = np.zeros_like(a)     # the opening and its casing: no wall joints here
    casing = np.zeros_like(a)        # the casing band and the (unsampled) opening behind it
    if lay.door is not None:
        d0, d1, sl, top = lay.door
        door_zone = soft_rect(a, y, d0 - CASING_W, d1 + CASING_W, sl - 0.012, top + CASING_W, 0.003)
        casing = soft_rect(a, y, d0 - CASING_W, d1 + CASING_W, sl, top + CASING_W, 0.004)
    s0, s1 = lay.sill
    sill = soft_rect(a, y, s0, s1, GLASS_Y0 - FRAME_W - SILL_H, GLASS_Y0 - FRAME_W, 0.006)
    frame = np.clip(frame - glass - casing, 0.0, 1.0)
    return dict(frame=frame, glass=glass, sill=sill, door_zone=door_zone, casing=casing, length=L)


def opening_dist(lay, a, y):
    """Distance outside the door opening (0 inside it; inf on walls without one)."""
    if lay.door is None:
        return np.full(a.shape, np.inf)
    d0, d1, sl, top = lay.door
    dx = np.maximum(np.maximum(d0 - a, a - d1), 0.0)
    dy = np.maximum(np.maximum(sl - y, y - top), 0.0)
    return np.hypot(dx, dy)


def wall_height(name, a, b):
    lay = LAYOUTS[name]
    y = b + WALL_Y0
    L = lay.length
    m = wall_masks(lay, a, y)
    h = lay.ease(a)
    h += groove(lay.post_dist(a), 0.005, 0.004, 0.006)
    infill = lay.infill(a)
    h += groove(np.where(infill, np.abs(y - KICK_Y), np.inf), 0.005, 0.004, 0.006) * (1.0 - m['door_zone'])
    # Door casing: 12 mm proud, its arris at the opening eased 12 mm.
    if lay.door is not None:
        od = opening_dist(lay, a, y)
        h += m['casing'] * (0.012 + quarter_round(od, 0.012))
    sill_y0 = GLASS_Y0 - FRAME_W - SILL_H
    for s in lay.seams:
        h += groove(line_dist_v(a, y, s, KICK_Y, sill_y0), 0.004, 0.004, 0.005)
    h += groove(np.where(infill, np.abs(y - 3.30), np.inf), 0.004, 0.004, 0.005)
    # Frame stands 12 mm proud; glazing sits 15 mm back.
    h += 0.012 * m['frame'] - 0.015 * m['glass']
    # Sill: 30 mm proud with an eased top so its top face catches the sky.
    sill_top = GLASS_Y0 - FRAME_W
    h += m['sill'] * (0.03 + quarter_round(np.clip(sill_top - y, 0, None), 0.025))
    return h


def wall_paint(name, a, b):
    lay = LAYOUTS[name]
    y = b + WALL_Y0
    L = lay.length
    m = wall_masks(lay, a, y)
    seed = {'fb': 11, 'px': 13, 'nx': 17}[name]
    u = a / L
    v = b / WALL_H
    broad = value_noise(u, v, 5, 5, seed) - 0.5
    fine = value_noise(u, v, int(L * 12), 40, seed + 1) - 0.5
    rgb = np.broadcast_to(WALL, a.shape + (3,)).astype(np.float64).copy()
    rgb *= (1.0 + 0.045 * broad + 0.015 * fine)[..., None]
    rough = np.full(a.shape, 0.55)
    metal = np.zeros(a.shape)
    # Corner posts a shade cooler than the infill (convex arrises only).
    rgb = mix(rgb, POST_TONE, lay.post_band(a) * 0.8)
    # Grooves read as thin shadow lines.
    lines = lay.post_dist(a)
    infill = lay.infill(a)
    lines = np.minimum(lines, np.where(infill, np.abs(y - KICK_Y), np.inf))
    lines = np.minimum(lines, np.where(infill, np.abs(y - 3.30), np.inf))
    for s in lay.seams:
        lines = np.minimum(lines, line_dist_v(a, y, s, KICK_Y, GLASS_Y0 - FRAME_W - SILL_H))
    rgb *= (1.0 - 0.35 * (1.0 - smoothstep(0.004, 0.009, lines)))[..., None]
    # Kick band and grime splash above it.
    kick = 1.0 - smoothstep(KICK_Y - 0.004, KICK_Y + 0.004, y)
    rgb = mix(rgb, KICK * (1.0 + 0.05 * broad)[..., None], kick)
    rough = rough * (1 - kick) + 0.72 * kick
    # Occlusion where the wall meets the plinth's chamfer.
    rgb *= (1.0 - 0.30 * (1.0 - smoothstep(SKIRT_H, SKIRT_H + 0.05, y)))[..., None]
    splash = (1.0 - smoothstep(KICK_Y, KICK_Y + 0.35, y)) * (1 - kick) * 0.16
    rgb = mix(rgb, GRIME, splash * (0.6 + 0.8 * (value_noise(u, v, int(L * 6), 8, seed + 3))))
    # Faint run-off streaks under the sill ends.
    if lay.sill is not None:
        s0, s1 = lay.sill
        sill_y0 = GLASS_Y0 - FRAME_W - SILL_H
        below = (y < sill_y0) * smoothstep(sill_y0 - 0.9, sill_y0, y)
        for sx in (s0 + 0.04, s1 - 0.04):
            streak = soft_box(a, sx, 0.02, 0.05) * below * 0.12
            rgb = mix(rgb, GRIME, streak)
    # Frames, sill, glazing.
    rgb = mix(rgb, FRAME, m['frame'])
    rough = rough * (1 - m['frame']) + 0.42 * m['frame']
    rgb = mix(rgb, SILL, m['sill'])
    rough = rough * (1 - m['sill']) + 0.38 * m['sill']
    metal = metal * (1 - m['sill']) + 0.6 * m['sill']
    g = np.clip((y - GLASS_Y0) / (GLASS_Y1 - GLASS_Y0), 0, 1)
    sheen = 0.18 * (value_noise(u, v, 3, 3, seed + 5) - 0.5)
    glass_rgb = GLASS_LO + (GLASS_HI - GLASS_LO) * np.clip(g ** 1.4 + sheen, 0, 1)[..., None]
    rgb = mix(rgb, glass_rgb, m['glass'])
    rough = rough * (1 - m['glass']) + 0.08 * m['glass']
    # Door casing, the frame aluminium (the unsampled opening behind it too, so the
    # arris texels bleed casing, not wall).
    rgb = mix(rgb, FRAME * 1.04, m['casing'])
    rough = rough * (1 - m['casing']) + 0.42 * m['casing']
    metal = metal * (1 - m['casing']) + 0.35 * m['casing']
    return rgb, rough, metal


# ---------------------------------------------------------------- roof
def rtop_height(a, b):
    # a along z (0..3.8), b along x (0..4.3).
    d = np.minimum(np.minimum(a, 2 * ROOF_HZ - a), np.minimum(b, 2 * ROOF_HX - b))
    h = quarter_round(d, 0.03)
    coping = 1.0 - smoothstep(0.10, 0.11, d)
    h += 0.012 * coping
    return h


def rtop_paint(a, b):
    u, v = a / (2 * ROOF_HZ), b / (2 * ROOF_HX)
    mottle = value_noise(u, v, 8, 9, 41) - 0.5
    fine = value_noise(u, v, 40, 45, 43) - 0.5
    rgb = np.broadcast_to(ROOF, a.shape + (3,)).astype(np.float64).copy()
    rgb *= (1.0 + 0.14 * mottle + 0.05 * fine)[..., None]
    d = np.minimum(np.minimum(a, 2 * ROOF_HZ - a), np.minimum(b, 2 * ROOF_HX - b))
    coping = 1.0 - smoothstep(0.10, 0.11, d)
    rgb = mix(rgb, FASCIA * 1.12, coping)
    # Membrane laps every 1.1 m along the slab, faint.
    lap = np.abs(((b + 0.3) % 1.1) - 0.55)
    rgb *= (1.0 - 0.10 * (1.0 - smoothstep(0.52, 0.545, lap)) * (1 - coping))[..., None]
    # Weathering: lighter dust toward the middle, a ring of wet staining inside the coping.
    stain = (1.0 - smoothstep(0.11, 0.35, d)) * (1 - coping) * 0.15
    rgb *= (1.0 - stain)[..., None]
    rough = np.full(a.shape, 0.85) - 0.2 * coping
    return rgb, rough, np.zeros(a.shape)


def fascia_height(s, b):
    return quarter_round(FASCIA_T - b, 0.03) + quarter_round(b, 0.02)


def fascia_paint(s, b):
    rgb = np.broadcast_to(FASCIA, s.shape + (3,)).astype(np.float64).copy()
    mottle = value_noise(s / FASCIA_LEN, b / FASCIA_T, 14, 2, 47) - 0.5
    rgb *= (1.0 + 0.08 * mottle)[..., None]
    # Weather streaking down from the coping.
    streak = value_noise(s / FASCIA_LEN, b / FASCIA_T, 60, 1, 49)
    rgb *= (1.0 - 0.08 * streak * smoothstep(0.0, FASCIA_T, b))[..., None]
    return rgb, np.full(s.shape, 0.55), np.zeros(s.shape)


def soffit_height(a, b):
    # a along x (0..4.3), b along z (0..3.8).
    d = np.minimum(np.minimum(a, 2 * ROOF_HX - a), np.minimum(b, 2 * ROOF_HZ - b))
    return quarter_round(d, 0.02) + groove(np.abs(d - 0.07), 0.006, 0.004, 0.006)


def soffit_paint(a, b):
    u, v = a / (2 * ROOF_HX), b / (2 * ROOF_HZ)
    rgb = np.broadcast_to(SOFFIT, a.shape + (3,)).astype(np.float64).copy()
    rgb *= (1.0 + 0.06 * (value_noise(u, v, 6, 6, 53) - 0.5))[..., None]
    d = np.minimum(np.minimum(a, 2 * ROOF_HX - a), np.minimum(b, 2 * ROOF_HZ - b))
    rgb *= (1.0 - 0.4 * (1.0 - smoothstep(0.065, 0.075, d)) * smoothstep(0.055, 0.065, d))[..., None]
    # Occlusion where the walls meet the soffit.
    x, z = a - ROOF_HX, b - ROOF_HZ
    dx = np.maximum(np.abs(x) - BODY_HX, 0.0)
    dz = np.maximum(np.abs(z) - BODY_HZ, 0.0)
    dist = np.hypot(dx, dz)
    occl = 0.35 * (1.0 - smoothstep(0.0, 0.25, dist))
    rgb *= (1.0 - occl)[..., None]
    return rgb, np.full(a.shape, 0.75), np.zeros(a.shape)


# ---------------------------------------------------------------- door
# The recess back: a = z - DOOR_Z0 across it (left to right seen from outside, -X),
# b = y - DOOR_SILL up it. A 35 mm stop on the head and both jambs; the leaf runs
# down to the threshold.
def door_masks(a, b):
    leaf = soft_rect(a, b, DOOR_A0, DOOR_A1, -0.1, LEAF_TOP, 0.003)
    vision = soft_rect(a, b, DOOR_A0 + 0.17, DOOR_A1 - 0.17, 1.35 - DOOR_SILL, 2.00 - DOOR_SILL, 0.004)
    kickplate = soft_rect(a, b, DOOR_A0 + 0.04, DOOR_A1 - 0.04, 0.02, 0.27, 0.003)
    lx = DOOR_A1 - 0.10
    ly = 1.05 - DOOR_SILL
    lever = np.maximum(soft_rect(a, b, lx - 0.10, lx + 0.012, ly, ly + 0.024, 0.003),
                       soft_rect(a, b, lx - 0.03, lx + 0.03, ly - 0.06, ly + 0.08, 0.003))
    hinge = np.zeros_like(a)
    for hy in (0.20, 0.95, 1.75):
        hinge = np.maximum(hinge, soft_rect(a, b, DOOR_A0, DOOR_A0 + 0.02, hy, hy + 0.10, 0.002))
    return leaf, vision, kickplate, lever, hinge


def door_height(a, b):
    leaf, vision, kickplate, lever, hinge = door_masks(a, b)
    # The stop stands proud of the leaf: the leaf sits 12 mm back, its glass 8 mm more.
    return -0.012 * leaf - 0.008 * vision + 0.002 * kickplate + 0.03 * lever + 0.006 * hinge


def recess_occlusion(d):
    """Darkening at a distance d from an inside corner of the recess."""
    return 1.0 - smoothstep(0.0, 0.14, d)


def door_paint(a, b):
    u, v = a / DOOR_FACE_W, b / DOOR_H
    broad = value_noise(u, v, 2, 5, 71) - 0.5
    rgb = np.broadcast_to(FRAME * 1.0, a.shape + (3,)).astype(np.float64).copy()
    rgb *= (1.0 + 0.04 * broad)[..., None]
    rough = np.full(a.shape, 0.42)
    metal = np.full(a.shape, 0.35)
    leaf, vision, kickplate, lever, hinge = door_masks(a, b)
    rgb = mix(rgb, DOOR * (1.0 + 0.05 * broad)[..., None], leaf)
    rough = rough * (1 - leaf) + 0.45 * leaf
    metal = metal * (1 - leaf) + 0.2 * leaf
    # Shadow line where the leaf meets its stop.
    gap = leaf * (1.0 - soft_rect(a, b, DOOR_A0 + 0.012, DOOR_A1 - 0.012, -0.1, LEAF_TOP - 0.012, 0.004))
    rgb *= (1.0 - 0.45 * gap)[..., None]
    gv = np.clip((b - (1.35 - DOOR_SILL)) / 0.65, 0, 1)
    vis_rgb = GLASS_LO + (GLASS_HI - GLASS_LO) * (gv ** 1.4)[..., None]
    rgb = mix(rgb, vis_rgb, vision)
    rough = rough * (1 - vision) + 0.08 * vision
    for mk in (kickplate, lever, hinge):
        rgb = mix(rgb, STEEL, mk)
        rough = rough * (1 - mk) + 0.32 * mk
        metal = metal * (1 - mk) + 0.85 * mk
    # Scuffing at the foot of the leaf.
    splash = (1.0 - smoothstep(0.25, 0.55, b)) * (1.0 - kickplate) * 0.12
    rgb = mix(rgb, GRIME, splash * (0.6 + 0.8 * value_noise(u, v, 6, 8, 73)))
    # Occlusion in the recess's inside corners (jambs, head, threshold).
    d = np.minimum(np.minimum(a, DOOR_FACE_W - a), np.minimum(DOOR_H - b, b + 0.06))
    rgb *= (1.0 - 0.28 * recess_occlusion(d))[..., None]
    return rgb, rough, metal


# The reveals, each in its own metric frame: c = depth in from the wall plane
# (0 at the arris, DOOR_DEPTH at the leaf), s = distance along the reveal.
def reveal_height(c, s):
    # The casing's eased arris wraps onto the reveal; the leaf stop at the back.
    return quarter_round(c, 0.012) + 0.0 * s


def reveal_paint(c, s, steel=False):
    base = STEEL * 0.92 if steel else FRAME * 1.04
    rgb = np.broadcast_to(base, c.shape + (3,)).astype(np.float64).copy()
    rgb *= (1.0 + 0.04 * (value_noise(s / 2.0, c / DOOR_DEPTH, 8, 2, 77) - 0.5))[..., None]
    # Deeper is darker; the inside corner at the leaf darkest.
    rgb *= (1.0 - 0.22 * smoothstep(0.0, DOOR_DEPTH, c) - 0.18 * recess_occlusion(DOOR_DEPTH - c))[..., None]
    if steel:
        # Threshold plate: ribs across it, scuffed in the middle.
        rib = np.abs(((s + 0.01) % 0.04) - 0.02)
        rgb *= (1.0 - 0.18 * (1.0 - smoothstep(0.004, 0.008, rib)))[..., None]
        rgb = mix(rgb, GRIME, 0.25 * soft_box(s, DOOR_FACE_W / 2, 0.25, 0.2))
        return rgb, np.full(c.shape, 0.45), np.full(c.shape, 0.8)
    return rgb, np.full(c.shape, 0.42), np.full(c.shape, 0.35)


def sill_height(s, c):
    rib = np.abs(((s + 0.01) % 0.04) - 0.02)
    return quarter_round(c, 0.012) + 0.002 * (1.0 - smoothstep(0.004, 0.008, rib))


# ---------------------------------------------------------------- plinth
def skirt_paint(a, b):
    u = a / (2 * (BODY_HX + SKIRT_X))
    mottle = value_noise(u, np.zeros_like(u) + 0.5, 30, 1, 81) - 0.5
    rgb = np.broadcast_to(PLINTH, a.shape + (3,)).astype(np.float64).copy()
    rgb *= (1.0 + 0.10 * mottle)[..., None]
    return rgb, np.full(a.shape, 0.8), np.zeros(a.shape)


def flat_height(a, b):
    return np.zeros_like(a)


def hidden_paint(a, b):
    return (np.broadcast_to(WALL * 0.6, a.shape + (3,)).astype(np.float64).copy(),
            np.full(a.shape, 0.7), np.zeros(a.shape))


# ---------------------------------------------------------------- atlas
class Island:
    """Origin (atlas metres of face point (0,0)), matrix mapping face (a, b) to an
    atlas offset, the face extent, and its height and paint fields."""

    def __init__(self, name, origin, matrix, extent, height, paint):
        self.name = name
        self.origin = np.array(origin, np.float64)
        self.m = np.array(matrix, np.float64)
        self.inv = np.linalg.inv(self.m)
        self.extent = extent
        self.height = height
        self.paint = paint
        corners = [self.to_atlas(a, b) for a in (0, extent[0]) for b in (0, extent[1])]
        us = [c[0] for c in corners]
        vs = [c[1] for c in corners]
        self.rect = (min(us), max(us), min(vs), max(vs))

    def to_atlas(self, a, b):
        return self.origin + self.m @ np.array([a, b], np.float64)

    def to_face(self, u, v):
        du, dv = u - self.origin[0], v - self.origin[1]
        a = self.inv[0, 0] * du + self.inv[0, 1] * dv
        b = self.inv[1, 0] * du + self.inv[1, 1] * dv
        return np.clip(a, 0.0, self.extent[0]), np.clip(b, 0.0, self.extent[1])


GAP = 0.03
DILATE = 0.025
SEP = 0.04            # island spacing (the overlap assert needs > GAP)
ROOF_K = 0.85         # roof top drawn at 0.85 scale, near the walls' texel density
SOFFIT_K = 0.32
REVEAL_K = 0.7       # door reveals, near the walls' texel density
SKIRT_KU, SKIRT_KV = 0.19, 0.12   # plinth triangles shrunk whole into one swatch
SKIRT_L = 2 * (BODY_HX + SKIRT_X)  # the longer base edge (front and back)
FASCIA_LEN = 1.7      # every fascia maps its length onto this
FASCIA_K = 1.0


def _wall_island(name, origin):
    lay = LAYOUTS[name]
    return Island(name, origin, [[1, 0], [0, 1]], (lay.length, WALL_H),
                  lambda a, b: wall_height(name, a, b), lambda a, b: wall_paint(name, a, b))


# Row 1: front/back (shared), +X, door leaf; above the leaf the reveals and the
# plinth swatch. Row 2: -X, roof top, soffit. Strip under -X: fascia, hidden caps.
_row2 = GAP + WALL_H + SEP
_fb_w = LAYOUTS['fb'].length
_px_w = LAYOUTS['px'].length
_nx_w = LAYOUTS['nx'].length
_rtop_u = GAP + _nx_w + SEP
_rtop_w = ROOF_K * 2 * ROOF_HZ
_strip = _row2 + WALL_H + SEP
_door_u = GAP + _fb_w + SEP + _px_w + SEP
_rv_v = GAP + DOOR_H + SEP
_rv_w = REVEAL_K * DOOR_DEPTH
ISLANDS = {
    'fb': _wall_island('fb', (GAP, GAP)),
    'px': _wall_island('px', (GAP + _fb_w + SEP, GAP)),
    'door': Island('door', (_door_u, GAP), [[1, 0], [0, 1]], (DOOR_FACE_W, DOOR_H),
                   door_height, door_paint),
    'jamb_l': Island('jamb_l', (_door_u, _rv_v), [[REVEAL_K, 0], [0, REVEAL_K]], (DOOR_DEPTH, DOOR_H),
                     reveal_height, reveal_paint),
    # The +Z-side jamb faces -Z: its atlas u runs back from the leaf to the arris so the
    # island stays unmirrored seen from outside.
    'jamb_r': Island('jamb_r', (_door_u + 2 * _rv_w + SEP, _rv_v), [[-REVEAL_K, 0], [0, REVEAL_K]],
                     (DOOR_DEPTH, DOOR_H), reveal_height, reveal_paint),
    'head': Island('head', (_door_u + 2 * (_rv_w + SEP), _rv_v), [[REVEAL_K, 0], [0, REVEAL_K]],
                   (DOOR_DEPTH, DOOR_FACE_W), reveal_height, reveal_paint),
    'sill': Island('sill', (_door_u + 3 * (_rv_w + SEP), _rv_v), [[REVEAL_K, 0], [0, REVEAL_K]],
                   (DOOR_FACE_W, DOOR_DEPTH), sill_height, lambda s_, c_: reveal_paint(c_, s_, steel=True)),
    'skirt': Island('skirt', (_door_u + 3 * (_rv_w + SEP), _rv_v + REVEAL_K * DOOR_DEPTH + SEP),
                    [[SKIRT_KU, 0], [0, SKIRT_KV]], (SKIRT_L, SKIRT_APEX * math.sqrt(2) + 0.1),
                    flat_height, skirt_paint),
    'nx': _wall_island('nx', (GAP, _row2)),
    'rtop': Island('rtop', (_rtop_u, _row2), [[ROOF_K, 0], [0, ROOF_K]], (2 * ROOF_HZ, 2 * ROOF_HX),
                   rtop_height, rtop_paint),
    'soffit': Island('soffit', (_rtop_u + _rtop_w + SEP, _row2), [[SOFFIT_K, 0], [0, SOFFIT_K]],
                     (2 * ROOF_HX, 2 * ROOF_HZ), soffit_height, soffit_paint),
    'fascia': Island('fascia', (GAP, _strip), [[1, 0], [0, FASCIA_K]],
                     (FASCIA_LEN, FASCIA_T), fascia_height, fascia_paint),
    'hidden': Island('hidden', (GAP + FASCIA_LEN + SEP, _strip),
                     [[0.2, 0], [0, 0.2]], (1.0, 1.0), flat_height, hidden_paint),
}
_names = list(ISLANDS)
for _i, _n in enumerate(_names):
    _r = ISLANDS[_n].rect
    assert _r[0] >= 0 and _r[2] >= 0 and _r[1] <= ATLAS and _r[3] <= ATLAS, (_n, _r)
    for _m in _names[_i + 1:]:
        _s = ISLANDS[_m].rect
        overlap = _r[0] < _s[1] + GAP and _s[0] < _r[1] + GAP and _r[2] < _s[3] + GAP and _s[2] < _r[3] + GAP
        assert not overlap, (_n, _m, _r, _s)


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
    owner = np.where(gap <= DILATE, owner, -1)
    n = np.zeros(uu.shape + (3,), np.float64)
    n[..., 2] = 1.0
    eps = 0.25 * ATLAS / (NORMAL_PX * SUPERSAMPLE)
    for idx, name in enumerate(names):
        isl = ISLANDS[name]
        mask = owner == idx
        if not mask.any():
            continue
        a, b = isl.to_face(uu[mask], vv[mask])
        tu = isl.inv @ np.array([1.0, 0.0])
        tv = isl.inv @ np.array([0.0, 1.0])
        tu /= np.linalg.norm(tu)
        tv /= np.linalg.norm(tv)

        def h_at(da, db):
            return isl.height(np.clip(a + da, 0, isl.extent[0]), np.clip(b + db, 0, isl.extent[1]))

        dh_du = (h_at(tu[0] * eps, tu[1] * eps) - h_at(-tu[0] * eps, -tu[1] * eps)) / (2 * eps)
        dh_dv = (h_at(tv[0] * eps, tv[1] * eps) - h_at(-tv[0] * eps, -tv[1] * eps)) / (2 * eps)
        n[mask, 0] = -np.clip(dh_du, -MAX_SLOPE, MAX_SLOPE)
        n[mask, 1] = -np.clip(dh_dv, -MAX_SLOPE, MAX_SLOPE)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = block_mean(n)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def build_paint_pixels(px):
    uu, vv = atlas_grid(px)
    names, owner, gap = nearest_island(uu, vv)
    owner = np.where(gap <= DILATE, owner, -1)
    rgb = np.broadcast_to(WALL * 0.7, uu.shape + (3,)).astype(np.float64).copy()
    rough = np.full(uu.shape, 0.6)
    metal = np.zeros(uu.shape)
    for idx, name in enumerate(names):
        isl = ISLANDS[name]
        mask = owner == idx
        if not mask.any():
            continue
        a, b = isl.to_face(uu[mask], vv[mask])
        c, r, m = isl.paint(a, b)
        rgb[mask] = c
        rough[mask] = r
        metal[mask] = m
    rgb = np.clip(np.round(block_mean(rgb)), 0, 255).astype(np.uint8)
    rough, metal = block_mean(rough), block_mean(metal)
    mr = np.stack([np.ones_like(rough), rough, metal], axis=-1)
    mr = np.clip(np.round(mr * 255), 0, 255).astype(np.uint8)
    return rgb, mr


def write_jpeg(path, rgb, quality):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    rgba = np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((h, w, 1), np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())  # Blender rows are bottom-first, as is `rgb`
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


def write_png(path, rgb):
    """Minimal RGB8 PNG writer (rows top-first), per-row None/Sub/Up filter choice."""
    rows = rgb[::-1].astype(np.int16)  # row 0 of the array is v = 0, the bottom
    h, w, _ = rows.shape
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

    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(out), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


# ---------------------------------------------------------------- geometry
def to_blender(p):
    """three.js (x, y, z) -> Blender (x, -z, y), a proper rotation (winding kept)."""
    return (p[0], -p[2], p[1])


def uv_of(isl_name, a, b):
    uv = ISLANDS[isl_name].to_atlas(a, b) / ATLAS
    return (float(uv[0]), float(uv[1]))


def oriented(corners, uvs, normal):
    """Order a planar face CCW seen from outside its expected outward normal."""
    pts = [np.asarray(c, np.float64) for c in corners]
    n = np.zeros(3)
    for k in range(len(pts)):
        p, q = pts[k], pts[(k + 1) % len(pts)]
        n += np.cross(p, q)
    if np.dot(n, normal) < 0:
        pts, uvs = pts[::-1], uvs[::-1]
    return (pts, list(uvs)), tuple(float(c) for c in normal)


def build_mesh():
    """Faces as (three.js corners CCW seen from outside, matching UVs).

    Three closed parts, each pairing every directed edge on its own, driven into
    one another: the body (four walls on the PLAN rectangle with the door recess
    cut into the -X wall, a bottom cap inside the plinth and a top cap 25 mm inside
    the roof slab), the plinth pyramid and the roof slab. A closed triangulated
    shell costs 2V - 4 triangles: body 16 vertices (28), plinth 5 (6), roof 8 (12)."""
    quads = []
    normals = []

    def add(corners, uvs, normal):
        face, n = oriented(corners, uvs, np.array(normal, np.float64))
        quads.append(face)
        normals.append(n)

    up = np.array([0.0, 1.0, 0.0])
    n_plan = len(PLAN)
    # The plan must wind so that (wall direction x up) points outward: positive
    # signed area in the (z, x) plane, i.e. anticlockwise seen from above +Y.
    area = 0.5 * sum(PLAN[k][1] * PLAN[(k + 1) % n_plan][0] - PLAN[(k + 1) % n_plan][1] * PLAN[k][0]
                     for k in range(n_plan))
    assert area > 0, ('plan winds clockwise', area)
    for k, isl in enumerate(WALL_ISLANDS):
        p0, p1 = PLAN[k], PLAN[(k + 1) % n_plan]
        b0 = np.array([p0[0], WALL_Y0, p0[1]])
        b1 = np.array([p1[0], WALL_Y0, p1[1]])
        L = float(np.linalg.norm(b1 - b0))
        extent = ISLANDS[isl].extent[0]
        assert abs(L - extent) < 1e-9, (isl, L, extent)
        d = (b1 - b0) / L
        n_out = np.cross(d, up)
        lay = LAYOUTS[isl]
        if lay.door is None:
            add([b0, b1, b1 + up * WALL_H, b0 + up * WALL_H],
                [uv_of(isl, 0, 0), uv_of(isl, L, 0), uv_of(isl, L, WALL_H), uv_of(isl, 0, WALL_H)], n_out)
            continue
        # The -X wall: four convex trapezoids round the door opening.
        a0, a1, sl, top = lay.door

        def wp(a, y):
            return b0 + d * a + up * (y - WALL_Y0)

        def wuv(a, y):
            return uv_of(isl, a, y - WALL_Y0)

        ob0, ob1 = (0.0, WALL_Y0), (L, WALL_Y0)
        ot1, ot0 = (L, BODY_TOP), (0.0, BODY_TOP)
        h00, h10, h11, h01 = (a0, sl), (a1, sl), (a1, top), (a0, top)
        for ring in ((ob0, ob1, h10, h00), (ob1, ot1, h11, h10), (ot1, ot0, h01, h11), (ot0, ob0, h00, h01)):
            add([wp(*q) for q in ring], [wuv(*q) for q in ring], n_out)
        # The recess: reveals and the leaf, DOOR_DEPTH in (along -n_out).
        inward = -n_out
        def rp(a, y, c):
            return wp(a, y) + inward * c
        w = a1 - a0
        # Leaf on the recess back, a = z - DOOR_Z0, b = y - sill.
        add([rp(a0, sl, DOOR_DEPTH), rp(a1, sl, DOOR_DEPTH), rp(a1, top, DOOR_DEPTH), rp(a0, top, DOOR_DEPTH)],
            [uv_of('door', 0, 0), uv_of('door', w, 0), uv_of('door', w, DOOR_H), uv_of('door', 0, DOOR_H)], n_out)
        # Head (faces down): c = depth, s = along the wall.
        add([rp(a0, top, 0), rp(a1, top, 0), rp(a1, top, DOOR_DEPTH), rp(a0, top, DOOR_DEPTH)],
            [uv_of('head', 0, 0), uv_of('head', 0, w), uv_of('head', DOOR_DEPTH, w), uv_of('head', DOOR_DEPTH, 0)],
            -up)
        # Threshold (faces up): s = along the wall, c = depth.
        add([rp(a0, sl, 0), rp(a1, sl, 0), rp(a1, sl, DOOR_DEPTH), rp(a0, sl, DOOR_DEPTH)],
            [uv_of('sill', 0, 0), uv_of('sill', w, 0), uv_of('sill', w, DOOR_DEPTH), uv_of('sill', 0, DOOR_DEPTH)],
            up)
        # Jambs: c = depth, b = y - sill. The a0 jamb faces +d, the a1 jamb faces -d.
        for a_j, isl_j, n_j in ((a0, 'jamb_l', d), (a1, 'jamb_r', -d)):
            add([rp(a_j, sl, 0), rp(a_j, sl, DOOR_DEPTH), rp(a_j, top, DOOR_DEPTH), rp(a_j, top, 0)],
                [uv_of(isl_j, 0, 0), uv_of(isl_j, DOOR_DEPTH, 0), uv_of(isl_j, DOOR_DEPTH, DOOR_H),
                 uv_of(isl_j, 0, DOOR_H)], n_j)
    # Caps on the PLAN vertices, mapped planar onto the hidden patch.
    def cap_uv(p):
        return uv_of('hidden', (p[0] + BODY_HX) / (2 * BODY_HX), (p[1] + BODY_HZ) / (2 * BODY_HZ))
    for y, n in ((WALL_Y0, -up), (BODY_TOP, up)):
        add([np.array([PLAN[k][0], y, PLAN[k][1]]) for k in range(n_plan)], [cap_uv(PLAN[k]) for k in range(n_plan)], n)
    # Plinth pyramid: base PLAN scaled by _k about the centre at y 0, apex buried.
    apex = np.array([0.0, SKIRT_APEX, 0.0])
    base = [np.array([p[0] * _k, 0.0, p[1] * _k]) for p in PLAN]
    for k in range(n_plan):
        q0, q1 = base[k], base[(k + 1) % n_plan]
        L = float(np.linalg.norm(q1 - q0))
        mid = (q0 + q1) / 2
        slant = float(np.linalg.norm(apex - mid))
        n_out = np.cross(apex - q0, q1 - q0)
        n_out = -n_out if np.dot(n_out, mid) < 0 else n_out
        # a along the base edge (left to right seen from outside), b up the slope.
        add([q0, q1, apex], [uv_of('skirt', 0, 0), uv_of('skirt', L, 0), uv_of('skirt', L / 2, slant)],
            n_out / np.linalg.norm(n_out))
    add(list(base), [uv_of('hidden', (p[0] / _k + BODY_HX) / (2 * BODY_HX), (p[2] / _k + BODY_HZ) / (2 * BODY_HZ))
                     for p in base], -up)
    # Roof slab.
    rx, rz, y0, y1 = ROOF_HX, ROOF_HZ, ROOF_Y0, ROOF_Y1
    # Top: a along z, b along x (a x b = +y).
    top = [(-rx, y1, -rz), (-rx, y1, rz), (rx, y1, rz), (rx, y1, -rz)]
    add([np.array(p) for p in top],
        [uv_of('rtop', 0, 0), uv_of('rtop', 2 * rz, 0), uv_of('rtop', 2 * rz, 2 * rx), uv_of('rtop', 0, 2 * rx)], up)
    # Soffit: a along x, b along z (a x b = -y).
    bot = [(-rx, y0, -rz), (rx, y0, -rz), (rx, y0, rz), (-rx, y0, rz)]
    add([np.array(p) for p in bot],
        [uv_of('soffit', 0, 0), uv_of('soffit', 2 * rx, 0), uv_of('soffit', 2 * rx, 2 * rz), uv_of('soffit', 0, 2 * rz)],
        -up)
    fascias = [((0, 0, 1), (1, 0, 0), rz, rx), ((0, 0, -1), (-1, 0, 0), rz, rx),
               ((1, 0, 0), (0, 0, -1), rx, rz), ((-1, 0, 0), (0, 0, 1), rx, rz)]
    for n, ad, hn, ha in fascias:
        n, ad = np.array(n, float), np.array(ad, float)
        bl = n * hn - ad * ha + up * y0
        L = 2 * ha
        add([bl, bl + ad * L, bl + ad * L + up * FASCIA_T, bl + up * FASCIA_T],
            [uv_of('fascia', 0, 0), uv_of('fascia', FASCIA_LEN, 0),
             uv_of('fascia', FASCIA_LEN, FASCIA_T), uv_of('fascia', 0, FASCIA_T)], n)

    # Every UV of a visible face lands inside its island (the plinth triangles are
    # shrunk whole into their swatch, so their hidden interiors sample nothing else).
    for corners, uvs in quads:
        for uv in uvs:
            assert 0.0 <= uv[0] <= 1.0 and 0.0 <= uv[1] <= 1.0, ('uv off the atlas', uv)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    for corners, uvs in quads:
        verts = [bm.verts.new(to_blender(tuple(float(c) for c in p))) for p in corners]
        f = bm.faces.new(verts)
        for loop, uv in zip(f.loops, uvs):
            loop[uv_layer].uv = uv
    bm.normal_update()
    # Contract: maxRenderVertices 140 (D-036) = indices = at most 46 triangles.
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    assert tris * 3 <= 140, ('render vertices', tris * 3)
    # closedDoubleFacedAssets: every directed edge A->B has a B->A.
    directed = {}
    for f in bm.faces:
        keys = [tuple(round(c * 1e4) for c in v.co) for v in f.verts]
        for k in range(len(keys)):
            e = (keys[k], keys[(k + 1) % len(keys)])
            directed[e] = directed.get(e, 0) + 1
    unpaired = sum(max(0, n - directed.get((e[1], e[0]), 0)) for e, n in directed.items())
    assert unpaired == 0, ('unpaired directed edges', unpaired)
    # Orientation: every face's Blender normal equals its expected outward normal.
    faces = list(bm.faces)
    assert len(faces) == len(normals)
    for f, n3 in zip(faces, normals):
        nb = to_blender(n3)
        fn = f.normal
        assert fn.x * nb[0] + fn.y * nb[1] + fn.z * nb[2] > 0.999, ('face normal', tuple(fn), n3)
    # The opening sits inside the -X wall with a pier each side and wall over the head.
    assert DOOR_Z0 > -BODY_HZ + 0.1 and DOOR_Z1 < BODY_HZ - 0.1 and DOOR_TOP < BODY_TOP - 0.5
    assert DOOR_SILL > SKIRT_H + 0.05 and DOOR_DEPTH < BODY_HX
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def build_material(colour_path, normal_path, mr_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    # closedDoubleFacedAssets.ts lists this asset: the material must export doubleSided.
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'checkpoint-booth-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'checkpoint-booth-normal'
    normal_img.colorspace_settings.is_data = True
    mr_img = bpy.data.images.load(mr_path)
    mr_img.name = 'checkpoint-booth-mr'
    mr_img.colorspace_settings.is_data = True

    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])

    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])

    mr_tex = nodes.new('ShaderNodeTexImage')
    mr_tex.image = mr_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(mr_tex.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P checkpoint-booth.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='checkpoint-booth-')
    try:
        colour_path = os.path.join(stage, 'checkpoint-booth-colour.jpg')
        normal_path = os.path.join(stage, 'checkpoint-booth-normal.png')
        mr_path = os.path.join(stage, 'checkpoint-booth-mr.png')
        rgb, _ = build_paint_pixels(COLOUR_PX)
        write_jpeg(colour_path, rgb, quality=COLOUR_Q)
        _, mr = build_paint_pixels(MR_PX)
        write_png(mr_path, mr)
        write_png(normal_path, build_normal_pixels())

        mesh = build_mesh()
        mesh.materials.append(build_material(colour_path, normal_path, mr_path))
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/checkpoint-booth.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'CHECKPOINT_BOOTH_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
