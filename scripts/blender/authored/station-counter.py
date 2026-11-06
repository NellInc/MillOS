"""Filling-station shop counter (world-station-counter), built from scratch in headless Blender.

What it builds
--------------
The checkout counter inside the filling-station kiosk, origin at the ground
centre, +Z (three.js) front, long axis along Z, in metres with an identity node
transform. The asset contract allows 72 render vertices (= 72 indices = 24
triangles), so every triangle has to be one the eye can see:

* the base carcass is an OPEN box (no hidden top or bottom face), 1.5 (X) x
  1.0 (Y) x 2.5 (Z) m. The customer (+X) front is one plane at x = 0.75, as the
  runtime counter-front hardware needs. The two end panels are full rectangles
  that run to the floor. The operator (-X) side is modelled as a stepped
  front: a drawer band at x = -0.75 from DRAWER_B to the top, a soffit under it
  and the cupboard-door plane set back DOOR_SET below it, down to the floor.
  The end panels stand proud of the doors on both sides as continuous stiles,
  so the doors sit in a real frame (12 triangles). There is no toe kick;
* the slab is a built-up apron edge over a raised underside: a four-sided
  apron band from APRON_Y0 at the outer edge up to the top face at exactly
  y = 1.045 (inset SLAB_INSET), and an underside at SLAB_Y0, set up inside the
  apron, so the apron hangs below it as a drip lip (12 triangles). The
  underside edges run 0.5 mm into the apron. The apron's vertex normals roll
  from NOSE_LOW at the lip to NOSE_HIGH at the top; the normal map flattens the
  lower apron and puts the bullnose in its top ROLL.

The top surface is exactly y = 1.045, the height every counter-top dressing in
GasStationInstanced and StationSouvenirs sits on (StationSouvenirs.test raycasts
it); the inset top is 1.576 x 2.576 m, clear of the tray, register and reader.
The slab's +X top edge is at x = 0.788, inside the runtime metal working edge
(StationRetailDetails, counter-local x 0.7795-0.8045, y 1.003-1.047). The base
walls rise 5 mm through the underside, so no two faces of different colour are
coplanar. The material is double-sided: the end panels' inner faces show
beside the set-back doors and the apron's back face shows behind the lip.

Finish lives in the two allowed textures, laid out on one unmirrored atlas with
a texel budget per region (the walls get the density, the slab top less, hidden
faces none), each face its own island with its height field authored in that
face's own metric frame:

* a tangent-space normal map (PNG, lossless and small because it is flat
  almost everywhere): eased vertical base corners; a shadow reveal under the
  slab over a fascia rail closed by a groove; raised fields with wide bevels
  and V-grooved frames on the customer front (one per runtime counter-front
  bay) and on both ends; handleless drawer and cupboard-door seams on the
  operator side (the drawer band's lower edge is the finger pull); the flat
  apron and top bullnose of the slab edge;
* a base-colour map (progressive JPEG): dark brown laminate with a vertical
  streak grain (horizontal on the fascia rail), a fine speckled slate-quartz
  top, occlusion under the lip, in the door recess, seams and grooves only (no
  baked sun), and a few scuffs.

Roughness is one factor for the whole surface.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/station-counter.py -- <out.glb>

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
BASE_W, BASE_H, BASE_L = 1.5, 1.0, 2.5
TOP_W, TOP_T, TOP_L = 1.6, 0.05, 2.6
TOP_Y = 1.045
SLAB_Y0 = TOP_Y - TOP_T  # 0.995, slab underside
NODE_NAME = 'Station-counterBody'
MESH_NAME = 'station-counter-mesh'
MATERIAL_NAME = 'station-counter-surface'
SCENE_NAME = 'MillOS_World_Station-counter'

# Slab apron. The +X top edge must stay under the runtime metal working edge
# (inner face at counter-local x 0.7795), so the inset is at most 20.5 mm.
SLAB_INSET = 0.012
APRON_Y0 = 0.978                  # lip bottom; the underside sits at SLAB_Y0 above it
APRON_H = TOP_Y - APRON_Y0
BAND_LEN = math.hypot(APRON_H, SLAB_INSET)  # slope length of each apron face
APRON_TILT = math.atan2(SLAB_INSET, APRON_H)  # geometric tilt of the apron face
NOSE_LOW = math.radians(-15.0)   # apron vertex normal at the lip, below horizontal
NOSE_HIGH = math.radians(74.0)   # apron vertex normal at the top edge
ROLL = 0.026                     # bullnose at the top of the apron (normal map)
UNDER_INTO = 0.0005              # underside runs this far into the apron

# Operator (-X) front: proud drawer band over set-back cupboard doors.
DRAWER_B = 0.80
DOOR_SET = 0.035
DOOR_X = -BASE_W / 2 + DOOR_SET  # -0.715, the door plane
PLINTH_H = 0.085

# Finish dimensions (metres).
CORNER_R = 0.018      # vertical base corners
REVEAL = 0.006        # contact line under the apron lip
FASCIA_H = 0.040      # fascia rail under the lip, closed by a groove
FASCIA_B = APRON_Y0 - REVEAL - FASCIA_H  # 0.932, the groove line
TOP_ROUND_W = 0.012   # top border that rounds onto the nosing
MAX_SLOPE = 3.2

# Atlas, in atlas metres (the UV square is ATLAS x ATLAS).
ATLAS = 3.04
NORMAL_PX = 512
COLOUR_PX = 256
COLOUR_Q = 82
SUPERSAMPLE = 3
TOP_DENSITY = 0.557   # atlas metres per top metre (walls are 1.0)
STRIP_K = 4.0         # nosing strip is drawn 4x taller than it is
STRIP_LEN = 1.9       # every nosing side maps its length onto this
SOFFIT_DENSITY = 0.75
NX_DENSITY_V = 0.9    # the operator island is squeezed vertically to fit the atlas

# Paint, sRGB 0-255.
LAMINATE = np.array([93, 66, 58], np.float32)    # #5d423a, the delivered base
SLATE = np.array([58, 73, 80], np.float32)       # #3a4950, the delivered top
SCUFF = np.array([128, 112, 102], np.float32)
FLECK_LIGHT = np.array([150, 158, 160], np.float32)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def soft_box(v, centre, half, ramp):
    """1 inside |v - centre| < half, falling to 0 over `ramp` outside it."""
    return 1.0 - smoothstep(half, half + ramp, np.abs(v - centre))


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


# ---------------------------------------------------------------- base walls
# Bays on the customer front mirror the runtime's three counter-front bays
# (StationRetailDetails: rails 0.72 m long centred at z -0.79, 0, 0.79).
BAY_HALF = 0.36
BAY_CENTRES_Z = (-0.79, 0.0, 0.79)
PANEL_B0, PANEL_B1 = 0.20, 0.87
FIELD_RISE = 0.006    # raised field above the frame
FIELD_BEVEL = (0.010, 0.034)  # bevel runs between these distances inside the outline


def base_common(face, a, b, length):
    """Corner ease and fascia groove, shared by all four walls.

    On the operator side the corner ease belongs to the drawer band only: the
    door plane is set back between the end panels, so its ends are inside
    corners. The door plane sits at the band's eased-edge depth so the height
    field is continuous across the step line.
    """
    ease = quarter_round(np.minimum(a, length - a), CORNER_R)
    h = groove(np.abs(b - FASCIA_B), 0.002, 0.004, 0.004)
    if face == 'nx':
        band = b >= DRAWER_B
        h += np.where(band, ease + quarter_round(b - DRAWER_B, 0.008), -0.008)
    else:
        h += ease
    return h


def base_common_colour(face, a, b, length, rgb, seed):
    # Laminate grain: vertical streaks two to three colour texels wide, so they
    # survive the texel size instead of averaging to mush.
    u = a / length
    streak = value_noise(u, b, int(length / 0.03), 3, seed) - 0.5
    fine = value_noise(u, b, int(length / 0.018), 6, seed + 2) - 0.5
    broad = value_noise(u, b, int(length * 3), 2, seed + 1) - 0.5
    grain = 0.11 * streak + 0.02 * fine + 0.05 * broad
    # Fascia rail under the lip: grain runs along it, a shade lighter.
    rail = soft_box(b, FASCIA_B + FASCIA_H * 0.5, FASCIA_H * 0.5, 0.002)
    rail_grain = 0.07 + 0.06 * (value_noise(u, (b - FASCIA_B) / FASCIA_H, int(length * 3), 3, seed + 5) - 0.5)
    rgb = rgb * (1.0 + grain * (1.0 - rail) + rail_grain * rail)[..., None]
    # Contact shadow under the apron lip (the wall above it is hidden by the lip).
    dt = APRON_Y0 - b
    occl = 0.55 * (1.0 - smoothstep(0.0, REVEAL + 0.004, dt)) + 0.12 * (1.0 - smoothstep(REVEAL, REVEAL + 0.03, dt))
    occl += 0.50 * (1.0 - smoothstep(0.002, 0.006, np.abs(b - FASCIA_B)))
    occl += 0.30 * (1.0 - smoothstep(0.0, 0.03, b))  # floor contact
    if face == 'nx':
        doors = b < DRAWER_B
        # The doors are set back under the drawer band and between the end panels.
        recess = 0.40 * (1.0 - smoothstep(0.0, 0.05, DRAWER_B - b))
        recess += 0.30 * (1.0 - smoothstep(0.0, 0.04, np.minimum(a, length - a)))
        occl += np.where(doors, recess, 0.0)
    rgb = rgb * (1.0 - np.clip(occl, 0, 0.85))[..., None]
    return rgb


def raised_panels(a, b, rects):
    """V-grooved frame around each rectangle with a raised field on a wide bevel."""
    h = np.zeros_like(a)
    seam = np.zeros_like(a)
    field = np.zeros_like(a)
    for a0, a1 in rects:
        dist, inside = rect_distance(a, b, a0, a1, PANEL_B0, PANEL_B1)
        h += groove(dist, 0.002, 0.006, 0.004)
        lift = np.where(inside, smoothstep(FIELD_BEVEL[0], FIELD_BEVEL[1], dist), 0.0)
        h += FIELD_RISE * lift
        seam = np.maximum(seam, 1.0 - smoothstep(0.002, 0.007, dist))
        field = np.maximum(field, lift)
    return h, seam, field


def panel_rects(face, length):
    if face == 'px':
        rects = []
        for zc in BAY_CENTRES_Z:
            a_lo, a_hi = sorted((BASE_L / 2 - (zc - BAY_HALF), BASE_L / 2 - (zc + BAY_HALF)))
            rects.append((a_lo, a_hi))
        return rects
    return [(0.10, length - 0.10)]


def operator_side(a, b, length):
    """Handleless fronts: drawers on the proud band, paired cupboard doors below.

    No pulls are painted: the drawer band's lower edge is a real finger pull
    (the doors are set back DOOR_SET under it), and the door fronts are push
    latch. Only the seams are drawn.
    """
    h = np.zeros_like(a)
    seam = np.zeros_like(a)
    f_a0, f_a1 = 0.03, length - 0.03
    bay = (f_a1 - f_a0) / 3.0
    door_top = DRAWER_B - 0.010
    lines = []
    for k in range(4):
        lines.append(('v', f_a0 + k * bay, DRAWER_B, FASCIA_B))  # drawer joints
    for k in (1, 2):
        lines.append(('v', f_a0 + k * bay, PLINTH_H, door_top))  # cupboard joints
    for k in range(3):
        lines.append(('v', f_a0 + (k + 0.5) * bay, PLINTH_H, door_top))  # meeting stiles
    for at in (0.010, length - 0.010):
        lines.append(('v', at, PLINTH_H, door_top))  # door edges against the end panels
    lines.append(('h', door_top, 0.0, length))
    lines.append(('h', PLINTH_H, 0.0, length))
    for kind, at, lo, hi in lines:
        if kind == 'v':
            d = np.where((b >= lo) & (b <= hi), np.abs(a - at), np.inf)
        else:
            d = np.where((a >= lo) & (a <= hi), np.abs(b - at), np.inf)
        h += groove(d, 0.003, 0.005, 0.006)
        seam = np.maximum(seam, 1.0 - smoothstep(0.003, 0.008, d))
    return h, seam


def wall_height(face, a, b):
    length = BASE_L if face in ('px', 'nx') else BASE_W
    h = base_common(face, a, b, length)
    if face == 'nx':
        oh, _ = operator_side(a, b, length)
        h += oh
    else:
        ph, _, _ = raised_panels(a, b, panel_rects(face, length))
        h += ph
    return h


def wall_colour(face, a, b):
    length = BASE_L if face in ('px', 'nx') else BASE_W
    rgb = np.broadcast_to(LAMINATE, a.shape + (3,)).copy()
    seed = {'px': 11, 'nx': 13, 'ends': 17}[face]
    rgb = base_common_colour(face, a, b, length, rgb, seed)
    if face == 'nx':
        _, seam = operator_side(a, b, length)
        rgb = rgb * (1.0 - 0.60 * seam)[..., None]
        # Plinth strip at the foot of the doors, a shade darker.
        rgb = rgb * (1.0 - 0.22 * (1.0 - smoothstep(PLINTH_H - 0.003, PLINTH_H + 0.003, b)))[..., None]
    else:
        _, seam, field = raised_panels(a, b, panel_rects(face, length))
        # Field grain is offset from the frame's, so the field reads as a separate piece.
        f_grain = value_noise(a / length, b, int(length / 0.03), 3, seed + 40) - 0.5
        rgb = rgb * (1.0 + field * (0.03 + 0.06 * f_grain))[..., None]
        rgb = rgb * (1.0 - 0.62 * seam)[..., None]
    if face == 'px':
        # Shoe scuffs low on the customer side.
        rng = np.random.default_rng(71)
        for _ in range(6):
            cx = rng.uniform(0.15, length - 0.15)
            cy = rng.uniform(0.04, 0.16)
            half = rng.uniform(0.03, 0.12)
            mark = soft_box(a, cx, half, 0.03) * soft_box(b, cy, 0.005, 0.005)
            s = rng.uniform(0.12, 0.22)
            rgb = rgb * (1 - s * mark[..., None]) + SCUFF * (s * mark[..., None])
    return rgb


# ---------------------------------------------------------------- drawer soffit
# Underside of the proud drawer band (a along the counter, b from the door plane out).
def soffit_colour(a, b):
    rgb = np.broadcast_to(LAMINATE * 0.62, a.shape + (3,)).copy()
    grain = value_noise(a / BASE_L, b / DOOR_SET, 80, 2, 51) - 0.5
    rgb *= (1.0 + 0.06 * grain)[..., None]
    rgb *= (1.0 - 0.30 * (1.0 - smoothstep(0.0, 0.012, b)))[..., None]  # inside corner
    return rgb


# ---------------------------------------------------------------- slab
# The top island spans the slab's full 2.6 x 1.6 m footprint; the inset top face
# maps onto its inner rectangle, the gutter beyond that is dilation only.
def top_edge_distance(a, b):
    d = SLAB_INSET
    return np.maximum(np.minimum(np.minimum(a - d, TOP_L - d - a), np.minimum(b - d, TOP_W - d - b)), 0.0)


# The border rounds from flat to the nosing's top normal, so the top meets the
# band with no crease.
_TOP_END = math.pi / 2 - NOSE_HIGH
_TOP_R = TOP_ROUND_W / math.sin(_TOP_END)


def top_height(a, b):
    x = np.clip(TOP_ROUND_W - top_edge_distance(a, b), 0.0, TOP_ROUND_W)
    return np.sqrt(np.maximum(_TOP_R * _TOP_R - x * x, 0.0)) - _TOP_R


def top_colour(a, b):
    """Fine slate-grey quartz composite: an even fleck at about one texel."""
    rgb = np.broadcast_to(SLATE, a.shape + (3,)).copy()
    u, v = a / TOP_L, b / TOP_W
    broad = value_noise(u, v, 5, 3, 21) - 0.5
    speck = value_noise(u, v, int(TOP_L / 0.021), int(TOP_W / 0.021), 23) - 0.5
    rgb *= (1.0 + 0.03 * broad + 0.07 * speck)[..., None]
    light = smoothstep(0.84, 0.92, value_noise(u, v, int(TOP_L / 0.022), int(TOP_W / 0.022), 29))
    dark = smoothstep(0.84, 0.93, value_noise(u, v, int(TOP_L / 0.023), int(TOP_W / 0.023), 31))
    rgb = rgb * (1 - 0.40 * light[..., None]) + FLECK_LIGHT * (0.40 * light[..., None])
    rgb = rgb * (1.0 - 0.30 * dark)[..., None]
    return rgb


def _apron_profile():
    """Height table for the apron's normal map, t from 0 (lip) to BAND_LEN (top).

    Target outward normal angle (above horizontal): a small arris at the lip, a
    flat apron at the face's own tilt, then a circular bullnose (angle linear in
    arc length) over the top ROLL up to NOSE_HIGH. The vertex normals already
    interpolate from NOSE_LOW to NOSE_HIGH, so the map carries the difference:
    dh/dt = -tan(target - interpolated).
    """
    t = np.linspace(0.0, BAND_LEN, 2049)
    t0 = BAND_LEN - ROLL
    target = np.where(t < t0, APRON_TILT, APRON_TILT + (NOSE_HIGH - APRON_TILT) * (t - t0) / ROLL)
    target = target - math.radians(40.0) * (1.0 - smoothstep(0.0, 0.004, t))
    s = t / BAND_LEN
    nx = (1 - s) * math.cos(NOSE_LOW) + s * math.cos(NOSE_HIGH)
    ny = (1 - s) * math.sin(NOSE_LOW) + s * math.sin(NOSE_HIGH)
    interp = np.arctan2(ny, nx)
    slope = -np.tan(np.clip(target - interp, -1.2, 1.2))
    h = np.concatenate([[0.0], np.cumsum(0.5 * (slope[1:] + slope[:-1]) * np.diff(t))])
    return t, h


_APRON_T, _APRON_H = _apron_profile()


def strip_height(s, t):
    """Apron band, t from 0 (lip) to BAND_LEN (top edge)."""
    return np.interp(t, _APRON_T, _APRON_H)


def strip_colour(s, t):
    rgb = np.broadcast_to(SLATE, s.shape + (3,)).copy()
    speck = value_noise(s, t / BAND_LEN, 90, 2, 37) - 0.5
    rgb *= (1.0 + 0.06 + 0.06 * speck)[..., None]
    rgb *= (1.0 - 0.40 * (1.0 - smoothstep(0.0, 0.006, t)))[..., None]
    return rgb


def flat_height(a, b):
    return np.zeros_like(a)


def under_colour(a, b):
    return np.broadcast_to(SLATE * 0.55, a.shape + (3,)).copy()


# ---------------------------------------------------------------- atlas
# Each island maps face coordinates (a, b), a in [lo_a, lo_a + extent_a] and b in
# [lo_b, lo_b + extent_b], to atlas metres: origin + M @ (a - lo_a, b - lo_b).
# Every M has a positive determinant (rotations and scales, never a mirror).
class Island:
    def __init__(self, name, origin, matrix, lo, extent, height, colour):
        self.name = name
        self.origin = np.array(origin, np.float64)
        self.m = np.array(matrix, np.float64)
        assert np.linalg.det(self.m) > 0, name
        self.inv = np.linalg.inv(self.m)
        self.lo = np.array(lo, np.float64)
        self.extent = extent
        self.height = height
        self.colour = colour
        corners = [self.to_atlas(lo[0] + a, lo[1] + b) for a in (0, extent[0]) for b in (0, extent[1])]
        us = [c[0] for c in corners]
        vs = [c[1] for c in corners]
        self.rect = (min(us), max(us), min(vs), max(vs))

    def to_atlas(self, a, b):
        return self.origin + self.m @ np.array([a - self.lo[0], b - self.lo[1]], np.float64)

    def clamp(self, a, b):
        return (np.clip(a, self.lo[0], self.lo[0] + self.extent[0]),
                np.clip(b, self.lo[1], self.lo[1] + self.extent[1]))

    def to_face(self, u, v):
        du, dv = u - self.origin[0], v - self.origin[1]
        a = self.inv[0, 0] * du + self.inv[0, 1] * dv + self.lo[0]
        b = self.inv[1, 0] * du + self.inv[1, 1] * dv + self.lo[1]
        return self.clamp(a, b)


GAP = 0.03
DILATE = 0.015  # gutter fill around each island, atlas metres (2-3 normal texels)
_R = 2 * GAP + BASE_L  # 2.56, left edge of the narrow right-hand column
ISLANDS = {
    'px': Island('px', (GAP, GAP), [[1, 0], [0, 1]], (0, 0), (BASE_L, BASE_H),
                 lambda a, b: wall_height('px', a, b), lambda a, b: wall_colour('px', a, b)),
    'nx': Island('nx', (GAP, 2 * GAP + BASE_H), [[1, 0], [0, NX_DENSITY_V]], (0, 0), (BASE_L, BASE_H),
                 lambda a, b: wall_height('nx', a, b), lambda a, b: wall_colour('nx', a, b)),
    'ends': Island('ends', (GAP, 2.0), [[1, 0], [0, 1]], (0, 0), (BASE_W, BASE_H),
                   lambda a, b: wall_height('ends', a, b), lambda a, b: wall_colour('ends', a, b)),
    'top': Island('top', (2 * GAP + BASE_W, 2.0), [[TOP_DENSITY, 0], [0, TOP_DENSITY]], (0, 0), (TOP_L, TOP_W),
                  top_height, top_colour),
    # Quarter-turned strips in the right-hand column.
    'strip': Island('strip', (_R + STRIP_K * BAND_LEN, GAP), [[0, -STRIP_K], [STRIP_LEN, 0]], (0, 0),
                    (1.0, BAND_LEN), strip_height, strip_colour),
    'soffit': Island('soffit', (_R + STRIP_K * BAND_LEN + GAP + SOFFIT_DENSITY * DOOR_SET, GAP),
                     [[0, -SOFFIT_DENSITY], [SOFFIT_DENSITY, 0]], (0, 0), (BASE_L, DOOR_SET),
                     flat_height, soffit_colour),
    'under': Island('under', (2.96, GAP), [[0.05, 0], [0, 0.05]], (0, 0), (1.0, 1.0), flat_height, under_colour),
}


def _check_atlas():
    names = list(ISLANDS)
    for name in names:
        u0, u1, v0, v1 = ISLANDS[name].rect
        assert u0 >= DILATE and v0 >= DILATE and u1 <= ATLAS - DILATE and v1 <= ATLAS - DILATE, (name, ISLANDS[name].rect)
    for i, p in enumerate(names):
        for q in names[i + 1:]:
            a, b = ISLANDS[p].rect, ISLANDS[q].rect
            sep = max(b[0] - a[1], a[0] - b[1], b[2] - a[3], a[2] - b[3])
            assert sep >= 2 * DILATE - 1e-9, (p, q, sep)


_check_atlas()


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
    eps = 0.25 * ATLAS / (NORMAL_PX * SUPERSAMPLE)
    for idx, name in enumerate(names):
        isl = ISLANDS[name]
        mask = owner == idx
        if not mask.any():
            continue
        a, b = isl.to_face(uu[mask], vv[mask])
        # Face directions of increasing atlas u and v, unit length in face metres.
        tu = isl.inv @ np.array([1.0, 0.0])
        tv = isl.inv @ np.array([0.0, 1.0])
        tu /= np.linalg.norm(tu)
        tv /= np.linalg.norm(tv)

        def h_at(da, db):
            return isl.height(*isl.clamp(a + da, b + db))

        dh_du = (h_at(tu[0] * eps, tu[1] * eps) - h_at(-tu[0] * eps, -tu[1] * eps)) / (2 * eps)
        dh_dv = (h_at(tv[0] * eps, tv[1] * eps) - h_at(-tv[0] * eps, -tv[1] * eps)) / (2 * eps)
        dh_du = np.clip(dh_du, -MAX_SLOPE, MAX_SLOPE)
        dh_dv = np.clip(dh_dv, -MAX_SLOPE, MAX_SLOPE)
        n[mask, 0] = -dh_du
        n[mask, 1] = -dh_dv
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = block_mean(n)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def build_colour_pixels():
    uu, vv = atlas_grid(COLOUR_PX)
    names, owner, gap = nearest_island(uu, vv)
    owner = np.where(gap <= DILATE, owner, -1)
    rgb = np.broadcast_to(LAMINATE * 0.8, uu.shape + (3,)).astype(np.float64).copy()
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
    """Progressive JPEG through Blender's bundled OpenImageIO (rows top-first)."""
    import OpenImageIO as oiio
    h, w, _ = rgb.shape
    spec = oiio.ImageSpec(w, h, 3, oiio.UINT8)
    spec.attribute('Compression', f'jpeg:{quality}')
    spec.attribute('jpeg:subsampling', '4:2:0')
    spec.attribute('jpeg:progressive', 1)
    out = oiio.ImageOutput.create(path)
    if out is None or not out.open(path, spec):
        raise SystemExit(f'cannot write {path}: {oiio.geterror()}')
    out.write_image(np.ascontiguousarray(rgb[::-1]))  # row 0 of `rgb` is v = 0, the bottom
    out.close()


def write_png(path, rgb):
    """Minimal RGB8 PNG writer (rows top-first).

    The normal map is flat almost everywhere, so lossless PNG is several times
    smaller than JPEG at any quality that keeps the flat faces flat. It tries a
    few whole-image filter policies (None, Sub, Up, per-row choice) and keeps
    whichever compresses smallest.
    """
    rows = rgb[::-1].astype(np.int16)  # row 0 of the array is v = 0, the bottom
    h, w, _ = rows.shape
    flat = rows.reshape(h, w * 3)

    def filtered(policy):
        out = bytearray()
        prev = np.zeros(w * 3, np.int16)
        for r in range(h):
            line = flat[r]
            sub = line.copy()
            sub[3:] = line[3:] - line[:-3]
            candidates = [(0, line), (1, sub), (2, line - prev)]
            if policy == 'adaptive':
                cost = [np.abs(((c + 128) % 256) - 128).sum() for _, c in candidates]
                ftype, data = candidates[int(np.argmin(cost))]
            else:
                ftype, data = candidates[policy]
            out.append(ftype)
            out += (data % 256).astype(np.uint8).tobytes()
            prev = line
        return zlib.compress(bytes(out), 9)

    idat = min((filtered(p) for p in (0, 1, 2, 'adaptive')), key=len)

    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


# ---------------------------------------------------------------- geometry
UP = np.array([0.0, 1.0, 0.0])


def to_blender(p):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return (float(p[0]), float(-p[2]), float(p[1]))


def atlas_uv(island, fa, fb):
    uv = ISLANDS[island].to_atlas(fa, fb) / ATLAS
    return (float(uv[0]), float(uv[1]))


def flat_quad(origin, a_dir, b_dir, extent, island, face_lo=(0.0, 0.0), normalise=False):
    """A flat quad, counter-clockwise outward (a_dir x b_dir is the outward normal).

    Corners map to island face coordinates face_lo + (a, b), or to the island's
    unit square when `normalise` is set.
    """
    o, ad, bd = np.array(origin, float), np.array(a_dir, float), np.array(b_dir, float)
    n = np.cross(ad, bd)
    corners = []
    for a, b in [(0, 0), (extent[0], 0), (extent[0], extent[1]), (0, extent[1])]:
        fa, fb = (a / extent[0], b / extent[1]) if normalise else (face_lo[0] + a, face_lo[1] + b)
        corners.append((o + ad * a + bd * b, atlas_uv(island, fa, fb), n))
    return corners


def base_quads():
    """Open carcass: customer front, stepped operator front, two full end panels."""
    hx, hz = BASE_W / 2, BASE_L / 2
    return [
        flat_quad((hx, 0, hz), (0, 0, -1), (0, 1, 0), (BASE_L, BASE_H), 'px'),
        # Operator front: proud drawer band, its soffit, then the set-back door plane.
        flat_quad((-hx, DRAWER_B, -hz), (0, 0, 1), (0, 1, 0), (BASE_L, BASE_H - DRAWER_B), 'nx', (0.0, DRAWER_B)),
        flat_quad((DOOR_X, DRAWER_B, -hz), (0, 0, 1), (-1, 0, 0), (BASE_L, DOOR_SET), 'soffit'),
        flat_quad((DOOR_X, 0, -hz), (0, 0, 1), (0, 1, 0), (BASE_L, DRAWER_B), 'nx'),
        flat_quad((-hx, 0, hz), (1, 0, 0), (0, 1, 0), (BASE_W, BASE_H), 'ends'),
        flat_quad((hx, 0, -hz), (-1, 0, 0), (0, 1, 0), (BASE_W, BASE_H), 'ends'),
    ]


def nose_normal(outward, angle):
    return math.cos(angle) * outward + math.sin(angle) * UP


def slab_quads():
    """Slab: inset top, four apron faces with bullnose vertex normals, raised underside."""
    d = SLAB_INSET
    hx, hz = TOP_W / 2, TOP_L / 2
    y0, y1 = APRON_Y0, TOP_Y
    quads = []
    sides = [
        ((hx, y0, hz), (0, 0, -1), TOP_L),
        ((-hx, y0, -hz), (0, 0, 1), TOP_L),
        ((-hx, y0, hz), (1, 0, 0), TOP_W),
        ((hx, y0, -hz), (-1, 0, 0), TOP_W),
    ]
    for origin, a_dir, length in sides:
        o, ad = np.array(origin, float), np.array(a_dir, float)
        outward = np.cross(ad, UP)
        top_shift = np.array([0.0, APRON_H, 0.0]) - outward * d
        corners = []
        for a, t in [(0.0, 0.0), (length, 0.0), (length - d, 1.0), (d, 1.0)]:
            p = o + ad * a + top_shift * t
            n = nose_normal(outward, NOSE_HIGH if t else NOSE_LOW)
            corners.append((p, atlas_uv('strip', a / length, t * BAND_LEN), n))
        quads.append(corners)
    # Top: face (a along +Z, b along +X), inset d on every side.
    o = np.array([-hx + d, y1, -hz + d])
    ext = (TOP_L - 2 * d, TOP_W - 2 * d)
    quads.append([(o + np.array([0, 0, 1.0]) * a + np.array([1.0, 0, 0]) * b, atlas_uv('top', a + d, b + d), UP)
                  for a, b in [(0, 0), (ext[0], 0), (ext[0], ext[1]), (0, ext[1])]])
    # Underside, set up inside the apron so the apron hangs below it as a drip
    # lip; its edges run UNDER_INTO past the apron face so the two meet.
    k = d * (SLAB_Y0 - APRON_Y0) / APRON_H - UNDER_INTO
    ux, uz = hx - k, hz - k
    quads.append(flat_quad((-ux, SLAB_Y0, -uz), (1, 0, 0), (0, 0, 1), (2 * ux, 2 * uz), 'under', normalise=True))
    return quads


def build_mesh():
    quads = base_quads() + slab_quads()
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    loop_normals = []
    for corners in quads:
        verts = [bm.verts.new(to_blender(p)) for p, _, _ in corners]
        f = bm.faces.new(verts)
        for loop, (_, uv, n) in zip(f.loops, corners):
            loop[uv_layer].uv = uv
        geo = np.array(to_blender(np.cross(corners[1][0] - corners[0][0], corners[3][0] - corners[0][0])))
        nb = [np.array(to_blender(n)) / np.linalg.norm(n) for _, _, n in corners]
        assert all(np.dot(v, geo) > 0 for v in nb), 'vertex normal points into its face'
        loop_normals.extend(tuple(v) for v in nb)
    bm.normal_update()
    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.normals_split_custom_set(loop_normals)
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False  # end panels beside the doors, apron behind the lip
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.5

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'station-counter-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'station-counter-normal'
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
        raise SystemExit('usage: blender -b --factory-startup -P station-counter.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='station-counter-')
    try:
        colour_path = os.path.join(stage, 'station-counter-colour.jpg')
        normal_path = os.path.join(stage, 'station-counter-normal.png')
        write_jpeg(colour_path, build_colour_pixels(), quality=COLOUR_Q)
        write_png(normal_path, build_normal_pixels())
        print(f'STATION_COUNTER_TEXTURES colour {os.path.getsize(colour_path)} normal {os.path.getsize(normal_path)}')

        mesh = build_mesh()
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/station-counter.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'STATION_COUNTER_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
