"""Wheel chock body (world-wheel-chock-body), built from scratch in headless Blender.

What it builds
--------------
A truck wheel chock at delivered scale (three.js metres, origin at ground centre):
0.3046 m wide (x) x 0.275 m tall (y) x 0.36 m long (z).

* Body: an amber-orange moulded wedge, one traced side profile extruded along x.
  The profile is ONE G1-continuous outline from the toe lip to the back-top corner:
    - a single circular ramp arc (the tyre seat), turning RAMP_TURN degrees, sampled at
      equal angle (= equal arclength) steps, flowing tangent-continuously into
    - a tight circular crest round (radius CREST_R) that ends level at the back-top corner.
  There is no step anywhere in it. Every vertex on the outline carries the arc's
  ANALYTIC normal as a custom split normal, and the script asserts that no segment's
  chord-to-arc gap (sagitta) exceeds MAX_SAGITTA, so the silhouette reads as a curve.
  Hard edges only at the toe lip, the back-top corner (rounded by the normal map) and
  the ground.
* Tread pad: an inset rubber insert in a pocket moulded into the ramp: orange rims along
  both long edges, a chamfered pocket wall, transverse ribs every 26 mm whose tops come
  up flush with the rim, and at the top an orange lip bead the pad's end tucks under.
  Its nose wraps over the toe lip, so its thickness shows on the toe face.
* Grab handle: a grey U-rod, square section 20 mm across the flats with its corners on
  the diagonals and radial normals (shades round; a bend shows a flat end side-on, not a
  diamond's arrowhead), mitred bends. Its legs run 12 mm into the +X side through a
  modelled square pyramidal steel boss at each end (4 flat-shaded triangles each, base
  sunk into the drafted wall, the rod leaving its slopes about 7 mm out).

Runtime anchors kept (src/components/TruckBay.tsx, WheelChock):
* The GLB sits inside <group position={[0.02229211, 0, 0]}>, which centres the
  delivered body (ground footprint x -0.1473..0.1027) on the slide axis. This body
  spans x -0.1523..0.1047 (centre -0.0238, 1.5 mm from the old one) and the
  handle fills the bounds to x +0.1523, on the same +X side the old part did.
* Pairs sit at z 10 (rotation 0) and z 11 (rotation pi) either side of one tyre,
  so the ramp faces +Z (glTF front), as both chocks then face the tyre.
* The chock slides 0.5 m along local x; nothing measures the GLB.

Contract (public/models/asset-manifest.json): one node 'Wheel-chock-bodyBody',
one material, two textures (base colour + normal), at most 204 render vertices
(the validator counts index entries, so 68 triangles), 38000 bytes. Built: body
36 triangles (profile of 10 points: 8 + 8 side, 18 wrap, 2 underneath), handle
24 + bosses 8, total 68.

Atlas (one layout, edge-replicated gutters, a texel density per region):
  wrap band   - toe lip, ramp and crest unrolled (450 px/m): u = x across the body,
                v = arclength round the profile from the toe's ground edge to T;
  back region - the back stop face, planar (520 px/m), with a recessed panel and raised
                WHEEL / CHOCK lettering;
  side region - ONE region shared by both side faces (600 px/m), planar (y along u,
                z along v); nothing on it is handed, so the mirrored read on -X is right;
  two flat patches - the handle's steel and the underside.
The orange finish is derived from the relief: dirt where the surface sits below its own
few-millimetre neighbourhood, light wear where it stands proud, chipped edge wear,
seeded fine scratches, a splash grime line and fixed boot scuffs.
The colour map is a progressive 4:4:4 JPEG written with OpenImageIO (Blender's own JPEG
writer subsamples chroma 4:2:0, which made the orange/rubber borders wavy); the normal
map is a PNG written here (R and G snapped to steps of 2 about 128). The glTF exporter re-encodes PNGs, so after export the two
image buffers in the GLB are replaced with exactly these files (repack_glb).

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/wheel-chock-body.py -- <out.glb>

Re-runnable and deterministic (seeded noise). Writes only <out.glb>; textures are
staged in a temporary directory that is removed afterwards (WHEEL_CHOCK_DUMP=<dir>
keeps copies).
"""

import json
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
import OpenImageIO as oiio

# ---------------------------------------------------------------- dimensions (glTF / three.js metres)
XL, XR = -0.1523, 0.1047  # body side faces AT THE GROUND; the handle reaches +0.1523
W = XR - XL
DRAFT = 0.006  # moulding draft: each side face leans in this much from ground to top
HALF_L = 0.18
TOP = 0.275

# Profile in (z, y), toe at +Z. Angles are the tangent's elevation while walking the
# profile from the toe toward the back (direction (-cos a, sin a)).
#
# ONE G1-continuous outline from the toe lip to the back-top corner: a single circular
# ramp arc (the tyre seat) flowing tangent-continuously into a tight circular crest round
# that ends level at T. The only hard corners are the toe lip (B), the back-top corner (T)
# and the ground. There is no step anywhere in the profile: the rubber pad is an inset in
# the ramp (colour + normal relief inside an orange rim), its nose showing on the toe face.
A = (HALF_L, 0.0)
B = (HALF_L, 0.026)  # top of the toe lip; the ramp arc starts here
T = (-0.168, TOP)  # back-top corner: the crest round ends here, level
G = (-HALF_L, 0.0)  # back face leans 12 mm in over its height
RAMP_TURN = 24.0  # degrees the ramp arc turns (concave)
RAMP_SEGMENTS = 5
CREST_R = 0.034  # crest round radius (m)
CREST_SEGMENTS = 2
MAX_SAGITTA = 0.0009  # self-gate: chord-to-arc gap of any curve segment (m), under 1 px in view 03

# Handle: U-rod in the horizontal plane y = HANDLE_Y.
ROD_R = 0.0142  # corner radius of the square section: 20 mm across its flats
ROD_SIDES = 4  # square section, corners on the diagonals, radial normals (shades round)
ROD_PHASE = math.pi / 4  # corners at 45 degrees, so a bend shows a flat end, not an arrowhead
HANDLE_Y = 0.108
HANDLE_Z = (-0.150, -0.030)
HANDLE_X_OUT = 0.1523  # outer surface of the grip
LEG_DEPTH = 0.012  # rod ends run this far into the body
BOSS_HALF = 0.017  # square pyramidal steel boss at each rod end: base half-width on the wall
BOSS_H = 0.017  # apex height off the wall (inside the rod); the rod leaves its slopes ~6.5 mm out
BOSS_SINK = 0.0006  # base sunk into the wall so no seam opens on the drafted face


def x_left(y):
    return XL + DRAFT * y / TOP


def x_right(y):
    return XR - DRAFT * y / TOP


NODE_NAME = 'Wheel-chock-bodyBody'
MESH_NAME = 'wheel-chock-body-mesh'
MATERIAL_NAME = 'wheel-chock-body-surface'
SCENE_NAME = 'MillOS_World_Wheel-chock-body'
COLOUR_IMAGE = 'wheel-chock-body-colour'
NORMAL_IMAGE = 'wheel-chock-body-normal'

# ---------------------------------------------------------------- texture settings
# The layout is defined at the base scale (per-region densities below). Each image
# is rendered at an exact integer multiple of it, so both share one UV set exactly.
# Texel density per atlas region (px per metre at the base scale). The orange faces that
# carry the moulding and the wear (the two side faces, which share one region, and the back
# stop face, which has its own) are laid out denser than the wrap band, whose detail is the
# rubber tread's regular ribs.
D_WRAP = 450.0
D_SIDE = 600.0
D_BACK = 520.0
GUTTER = 3
SUPERSAMPLE = 3
COLOUR_SCALE = 1
NORMAL_SCALE = 1
COLOUR_QUALITY = 86
NORMAL_STEP = 2
COLOUR_SUBSAMPLING = '4:4:4'  # full-resolution chroma (Blender's writer forces 4:2:0)
EDGE_W = 0.009  # rounded-edge band width on the wrap faces
EDGE_DROP = 0.005  # depth the edge falls by across that band

ORANGE = np.array([236, 140, 30], np.float32)
ORANGE_LIGHT = np.array([250, 182, 96], np.float32)
RUBBER = np.array([36, 36, 39], np.float32)
RUBBER_WORN = np.array([70, 70, 73], np.float32)
DUST = np.array([112, 100, 82], np.float32)
GRIME = np.array([96, 76, 52], np.float32)
STEEL = np.array([138, 142, 148], np.float32)

RIB_PITCH = 0.026
RIB_H = 0.0028


# ---------------------------------------------------------------- traced profile
def tangent(a_deg):
    a = math.radians(a_deg)
    return (-math.cos(a), math.sin(a))


def outward(a_deg):
    """Outward (air-side) unit normal in (z, y) for a tangent of elevation a."""
    a = math.radians(a_deg)
    return (math.sin(a), math.cos(a))


def solve_outline():
    """Circular ramp arc from B to the crest start J, tangent-continuous at J with a circular
    crest round of radius CREST_R that ends level at T.

    For a circular arc the chord's elevation is the mean of its end tangents, so with the
    ramp turning RAMP_TURN degrees its top tangent a_top = chord + RAMP_TURN / 2. J itself
    depends on a_top (it is on the crest circle), so iterate to the fixed point.
    """
    cz, cy = T[0], T[1] - CREST_R  # crest circle centre (level tangent at T)
    a_top = 50.0
    for _ in range(200):
        n = outward(a_top)
        j = (cz + CREST_R * n[0], cy + CREST_R * n[1])
        chord = math.degrees(math.atan2(j[1] - B[1], B[0] - j[0]))
        a_new = chord + RAMP_TURN / 2.0
        if abs(a_new - a_top) < 1e-10:
            break
        a_top = a_new
    a_bot = a_top - RAMP_TURN
    ramp_r = math.dist(B, j) / (2.0 * math.sin(math.radians(RAMP_TURN) / 2.0))
    # Ramp centre: on the air side (concave scoop), along the outward normal at B.
    nb = outward(a_bot)
    rc = (B[0] + ramp_r * nb[0], B[1] + ramp_r * nb[1])
    ramp = []
    for k in range(RAMP_SEGMENTS + 1):
        a = a_bot + RAMP_TURN * k / RAMP_SEGMENTS
        n = outward(a)
        ramp.append(((rc[0] - ramp_r * n[0], rc[1] - ramp_r * n[1]), n))
    crest = []
    for k in range(CREST_SEGMENTS + 1):
        a = a_top * (1.0 - k / CREST_SEGMENTS)
        n = outward(a)
        crest.append(((cz + CREST_R * n[0], cy + CREST_R * n[1]), n))
    assert math.dist(ramp[0][0], B) < 1e-9 and math.dist(ramp[-1][0], crest[0][0]) < 1e-9
    assert math.dist(crest[-1][0], T) < 1e-9
    return ramp, crest, a_bot, a_top, ramp_r


RAMP, CREST, RAMP_A0, RAMP_A1, RAMP_R = solve_outline()
SAGITTA = {
    'ramp': RAMP_R * (1.0 - math.cos(math.radians(RAMP_TURN / RAMP_SEGMENTS) / 2.0)),
    'crest': CREST_R * (1.0 - math.cos(math.radians(RAMP_A1 / CREST_SEGMENTS) / 2.0)),
}
assert max(SAGITTA.values()) <= MAX_SAGITTA, f'silhouette segments too coarse: {SAGITTA}'

# A, B (= ramp start), ramp interior, J (= crest start), crest interior, T, G.
CURVE = RAMP + CREST[1:]
PROFILE = [A] + [p for p, _ in CURVE] + [G]
N_PTS = len(PROFILE)
I_B = 1
I_J = I_B + RAMP_SEGMENTS
I_T = I_J + CREST_SEGMENTS
I_G = I_T + 1
assert I_G == N_PTS - 1
# One smooth strip, B to T, every vertex on it carrying the outline's analytic normal.
STRIPS = [(I_B, [n for _, n in CURVE])]
STRIP_EDGES = set(range(I_B, I_T))
assert max(p[1] for p in PROFILE) == TOP and min(p[1] for p in PROFILE) == 0.0


def signed_area(poly):
    return 0.5 * sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                     for i in range(len(poly)))


ORIENT = 1.0 if signed_area(PROFILE) > 0 else -1.0


def inward_normal(p, q):
    dz, dy = q[0] - p[0], q[1] - p[1]
    length = math.hypot(dz, dy)
    return (-dy / length * ORIENT, dz / length * ORIENT)


ARC = [0.0]
for _i in range(N_PTS - 1):
    ARC.append(ARC[-1] + math.dist(PROFILE[_i], PROFILE[_i + 1]))
S_TOTAL = ARC[-1]
S_B, S_J, S_T, S_G = (ARC[i] for i in (I_B, I_J, I_T, I_G))
# The inset rubber pad (wrap-band coordinates): its nose covers the top of the toe lip,
# it runs up the ramp and tucks under an orange lip at the foot of the crest round.
PAD_RIM = 0.015  # orange rim along both long edges
PAD_S0 = S_B - 0.011  # nose: the upper 11 mm of the toe lip face
PAD_S1 = S_J - 0.006  # top end, just short of the crest round
PAD_RECESS = 0.0026  # pad surface below the rim
PAD_WALL = 0.0045  # chamfered wall from rim down to the pad


def height_at_s(s):
    return np.interp(s, ARC, [p[1] for p in PROFILE])


S_BACK = S_G - S_T  # slant length of the back stop face


# ---------------------------------------------------------------- atlas layout (base-scale pixels)
def rect(col0, row0, w, h):
    return {'col0': col0, 'row0': row0, 'w': w, 'h': h}


def px(metres, density):
    return int(math.ceil(metres * density))


# Row 1: ONE side region shared by both side faces (the mould is symmetric and nothing on
# it is handed, so the mirrored read on -X is correct), beside the wrap band (toe lip, ramp
# and crest, unrolled). Row 2: the back stop face, beside the two flat patches. Packed tight:
# every JPEG block costs bytes even where it is flat.
SIDE = rect(GUTTER, GUTTER, px(TOP, D_SIDE), px(2 * HALF_L, D_SIDE))
WRAP = rect(SIDE['col0'] + SIDE['w'] + 2 * GUTTER, GUTTER, px(W, D_WRAP), px(S_T, D_WRAP))
ROW_2 = max(SIDE['h'], WRAP['h']) + 3 * GUTTER
BACK = rect(GUTTER, ROW_2, px(W, D_BACK), px(S_BACK, D_BACK))
HANDLE_PATCH = rect(BACK['col0'] + BACK['w'] + 2 * GUTTER, ROW_2, 56, 12)
BOTTOM_PATCH = rect(HANDLE_PATCH['col0'], ROW_2 + 12 + 2 * GUTTER, 40, 12)
TEX_W = max(WRAP['col0'] + WRAP['w'], HANDLE_PATCH['col0'] + HANDLE_PATCH['w']) + GUTTER
TEX_W += (-TEX_W) % 8
TEX_H = BACK['row0'] + BACK['h'] + GUTTER
TEX_H += (-TEX_H) % 8


def uv_in(r, fu, fv):
    """fu, fv in [0, 1] across the rect -> atlas UV (identical at every image scale)."""
    return ((r['col0'] + fu * r['w']) / TEX_W, (r['row0'] + fv * r['h']) / TEX_H)


# ---------------------------------------------------------------- noise and helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def value_noise(x, y, cell, seed):
    """Seeded smooth value noise over metres with the given cell size."""
    rng = np.random.default_rng(seed)
    grid = rng.random((256, 256)).astype(np.float32)
    gx, gy = x / cell + 7.3, y / cell + 3.1
    ix, iy = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    fx, fy = gx - ix, gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x0, x1, y0, y1 = ix % 256, (ix + 1) % 256, iy % 256, (iy + 1) % 256
    a, b, c, d = grid[y0, x0], grid[y0, x1], grid[y1, x0], grid[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def edge_drop(d, width=EDGE_W, depth=EDGE_DROP):
    """Rounded edge: falls by `depth` over `width` toward the edge (d = distance in from it)."""
    t = np.clip(1.0 - d / width, 0.0, 1.0)
    return depth * t * t


def mix(rgb, colour, amount):
    a = np.clip(amount, 0.0, 1.0)[..., None]
    return rgb * (1 - a) + colour * a


def block_mean(a):
    s = SUPERSAMPLE
    h, w = a.shape[0] // s, a.shape[1] // s
    return a.reshape(h, s, w, s, *a.shape[2:]).mean(axis=(1, 3))


def grid_for(r, k, extent_u, extent_v):
    sw, sh = r['w'] * k * SUPERSAMPLE, r['h'] * k * SUPERSAMPLE
    u = (np.arange(sw, dtype=np.float32) + 0.5) / sw * extent_u
    v = (np.arange(sh, dtype=np.float32) + 0.5) / sh * extent_v
    return np.meshgrid(u, v)


MAX_SLOPE = 2.0


def normals_from_height(h, du, dv):
    dh_du = np.gradient(h, du, axis=1)
    dh_dv = np.gradient(h, dv, axis=0)
    mag = np.sqrt(dh_du ** 2 + dh_dv ** 2)
    scale = np.where(mag > MAX_SLOPE, MAX_SLOPE / np.maximum(mag, 1e-6), 1.0)
    n = np.stack([-dh_du * scale, -dh_dv * scale, np.ones_like(h)], axis=-1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def orange_base(a, b, seed):
    """Moulded polymer that has stood in the sun: one broad fade, +-8%."""
    drift = 1.0 + (value_noise(a, b, 0.08, seed) - 0.5) * 0.16
    return np.broadcast_to(ORANGE, a.shape + (3,)) * drift[..., None]


def sun_bleach(y):
    return (1.0 + 0.07 * smoothstep(0.08, 0.27, y) - 0.05 * smoothstep(0.12, 0.0, y))[..., None]


def splash_grime(a, y, seed):
    """Ground grime as a splash band: dense at the ground, its upper edge broken along the face."""
    top = 0.036 + 0.006 * (value_noise(a, np.zeros_like(a), 0.03, seed) * 2.0 - 1.0)
    # A defined splash line (8 mm transition) over a darker foot, not one long soft fade.
    return 0.22 * smoothstep(top, top - 0.008, y) + 0.22 * smoothstep(0.020, 0.0, y)


def box_blur(a, r):
    """Separable box blur of radius r pixels, edges replicated."""
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
        n = a.shape[axis]
        a = ((np.take(c, np.arange(k, k + n), axis=axis) - np.take(c, np.arange(n), axis=axis)) / k).astype(np.float32)
    return a


def soft_blur(a, r):
    for _ in range(3):  # three box passes: close to a Gaussian of sigma ~ r
        a = box_blur(a, r)
    return a


def scratch_field(a, b, seed, count, box, angle, spread):
    """Fine scratches: thin straight strokes at seeded places in box (a0, a1, b0, b1), metres."""
    rng = np.random.default_rng(seed)
    m = np.zeros_like(a)
    for _ in range(count):
        ca, cb = rng.uniform(box[0], box[1]), rng.uniform(box[2], box[3])
        ang = angle + rng.normal(0.0, spread)
        half = rng.uniform(0.006, 0.020)
        width = rng.uniform(0.0005, 0.0009)
        strength = rng.uniform(0.45, 1.0)
        c, s = math.cos(ang), math.sin(ang)
        da, db = a - ca, b - cb
        along, across = da * c + db * s, -da * s + db * c
        t = np.clip(along / half, -1.0, 1.0)
        m = np.maximum(m, strength * np.exp(-(across / width) ** 2) * (1.0 - t ** 4))
    return m


def chipped(edge, a, b, seed):
    """Edge wear broken into chips along the edge rather than one continuous painted line."""
    return edge * (0.3 + 0.7 * smoothstep(0.42, 0.68, value_noise(a, b, 0.010, seed)))


def weather(rgb, h, k, density, orange_w, edge_wear, grime, scratch):
    """Weathering derived from the relief rather than painted on: dirt settles wherever the
    surface sits below its own few-millimetre neighbourhood (pocket corners, letter feet, rib
    roots), and whatever stands proud of it (letters, rims, pocket shoulders) wears light."""
    r = max(1, int(round(0.0030 * density * k * SUPERSAMPLE)))
    hb = soft_blur(h, r)
    cav = np.clip((hb - h) / 0.0009, 0.0, 1.0)
    cvx = np.clip((h - hb) / 0.0009, 0.0, 1.0)
    rgb = mix(rgb, ORANGE_LIGHT, (cvx * 0.40 + edge_wear) * orange_w)
    rgb = mix(rgb, ORANGE_LIGHT * 1.03, scratch * 0.55 * orange_w)
    rgb = mix(rgb, GRIME * 0.85, cav * 0.55 * orange_w)
    return mix(rgb, GRIME, grime * orange_w)


def kick_scuffs(a, b, marks):
    """Soft dark elongated marks at fixed places: (a, b, half_len, angle, depth)."""
    scuff = np.zeros_like(a)
    for ac, bc, half_len, ang, depth in marks:
        ca, sa = math.cos(ang), math.sin(ang)
        da, db = a - ac, b - bc
        along, across = da * ca + db * sa, -da * sa + db * ca
        scuff = np.maximum(scuff, depth * np.exp(-(along / half_len) ** 4 - (across / 0.0035) ** 2))
    return scuff


# ---------------------------------------------------------------- bands
def wrap_band(k):
    """Toe lip, ramp and crest unrolled: u across the body, s round the profile from the ground."""
    u, s = grid_for(WRAP, k, W, S_T)
    h = np.zeros_like(u)
    y = height_at_s(s)

    # Inset rubber pad. It sits in a pocket moulded into the ramp: an orange rim along
    # both long edges, a chamfered wall down to the rubber, and at the top an orange lip
    # bead the pad's end tucks under. Its nose is open: the rubber covers the upper part
    # of the toe lip face, so the pad's thickness shows there in true profile.
    d_pad = np.minimum.reduce([u - PAD_RIM, (W - PAD_RIM) - u, s - PAD_S0, PAD_S1 - s])
    rubber = smoothstep(-0.0006, 0.0006, d_pad)
    # The nose edge (s = PAD_S0) is an open end, so no wall there: only the sides and top.
    d_wall = np.minimum.reduce([u - PAD_RIM, (W - PAD_RIM) - u, PAD_S1 - s])
    pocket = smoothstep(0.0, PAD_WALL, d_wall) * smoothstep(PAD_S0 - 0.003, PAD_S0, s)
    h -= PAD_RECESS * pocket
    lip = np.exp(-((s - (PAD_S1 + 0.0035)) / 0.0024) ** 2) * smoothstep(PAD_RIM - 0.006, PAD_RIM, np.minimum(u, W - u))
    h += 0.0012 * lip
    rs0, rs1 = S_B + 0.012, PAD_S1 - 0.008
    rib_field = smoothstep(0.004, 0.008, d_wall) * smoothstep(rs0, rs0 + 0.004, s) * smoothstep(rs1, rs1 - 0.004, s)
    phase = ((s - rs0) % RIB_PITCH) / RIB_PITCH
    rib = smoothstep(0.06, 0.14, phase) * (1.0 - smoothstep(0.52, 0.60, phase)) * rib_field
    h += (PAD_RECESS - 0.0002) * rib  # rib tops come up flush with the rim
    wall_ao = (1.0 - smoothstep(0.0, 0.006, d_wall)) * rubber

    # Rounded edges: both long edges (atlas columns) and the hard convex profile corners
    # (atlas rows). The curve vertices are smooth by geometry, so they get no rounding.
    d_long = np.minimum(u, W - u)
    d_corner = np.minimum(np.abs(s - S_B), np.abs(s - S_T))
    h -= np.maximum(edge_drop(d_long), edge_drop(d_corner, depth=EDGE_DROP * 0.7))
    # Tyre and boot scratches running along the rims and over the crest.
    scr = scratch_field(u, s, 23, 46, (0.0, W, S_B, S_T), math.pi / 2, 0.25)
    # scratches are colour only: a sub-texel groove would only add JPEG noise to the normal map

    rgb = orange_base(u, s, 11) * sun_bleach(y)
    edge = np.maximum(smoothstep(EDGE_W * 1.6, EDGE_W * 0.15, d_long), smoothstep(EDGE_W * 1.6, EDGE_W * 0.15, d_corner))
    rim_edge = np.exp(-(d_wall / 0.0022) ** 2) * (1.0 - rubber) * (s > PAD_S0)
    wear = chipped(edge, u + s, s - u, 13) * 0.55 + rim_edge * 0.30 + lip * 0.25
    # Boot scuffs across the crest round, where the chock is kicked into place.
    scuff = kick_scuffs(u, s, ((0.07, S_J + 0.010, 0.030, 0.30, 0.20), (0.16, S_J + 0.020, 0.022, -0.20, 0.16),
                               (0.22, S_J + 0.004, 0.026, 0.12, 0.14), (0.11, S_T - 0.010, 0.034, 0.05, 0.12)))
    rgb = mix(rgb, GRIME * 0.75, scuff)
    orange_w = 1.0 - rubber
    rgb = weather(rgb, h, k, D_WRAP, orange_w, wear, splash_grime(u, y, 17), scr)

    pad_rgb = np.broadcast_to(RUBBER, u.shape + (3,)) * \
        (1.0 + (value_noise(u, s, 0.05, 41) - 0.5) * 0.06)[..., None]
    pad_rgb = mix(pad_rgb, RUBBER_WORN, rib * 0.75)
    pad_rgb = mix(pad_rgb, DUST, rib_field * (1.0 - rib) * 0.12)
    pad_rgb *= (1.0 - 0.45 * wall_ao)[..., None]
    nose_wear = smoothstep(S_B - 0.004, S_B, s) * smoothstep(S_B + 0.006, S_B, s)  # worn over the toe corner
    pad_rgb = mix(pad_rgb, RUBBER_WORN, nose_wear * 0.6)
    return h, mix(rgb, pad_rgb, rubber)


# Stroke font for the moulded lettering: polylines in a unit cell (x right, y up).
FONT = {
    'W': [[(0.0, 1.0), (0.22, 0.0), (0.5, 0.62), (0.78, 0.0), (1.0, 1.0)]],
    'H': [[(0.0, 0.0), (0.0, 1.0)], [(1.0, 0.0), (1.0, 1.0)], [(0.0, 0.5), (1.0, 0.5)]],
    'E': [[(1.0, 1.0), (0.0, 1.0), (0.0, 0.0), (1.0, 0.0)], [(0.0, 0.5), (0.78, 0.5)]],
    'L': [[(0.0, 1.0), (0.0, 0.0), (1.0, 0.0)]],
    'C': [[(1.0, 0.82), (0.72, 1.0), (0.28, 1.0), (0.0, 0.72), (0.0, 0.28), (0.28, 0.0), (0.72, 0.0), (1.0, 0.18)]],
    'O': [[(0.28, 0.0), (0.72, 0.0), (1.0, 0.28), (1.0, 0.72), (0.72, 1.0), (0.28, 1.0), (0.0, 0.72), (0.0, 0.28),
           (0.28, 0.0)]],
    'K': [[(0.0, 0.0), (0.0, 1.0)], [(1.0, 1.0), (0.0, 0.42)], [(0.32, 0.62), (1.0, 0.0)]],
}


def lettering(a, b, text, b0, cap, advance, stroke):
    """Raised moulded letters, one line centred on a = 0 with its baseline at b0. a runs in
    reading direction and b up (metres); stroke is the half-width. Returns 0..1 coverage."""
    gap = cap * 0.28
    a0 = -(len(text) * advance + (len(text) - 1) * gap) / 2.0
    d = np.full(a.shape, np.inf, np.float32)
    for i, ch in enumerate(text):
        ox = a0 + i * (advance + gap)
        for line in FONT[ch]:
            for p, q in zip(line[:-1], line[1:]):
                pa, pb = ox + p[0] * advance, b0 + p[1] * cap
                ea, eb = (q[0] - p[0]) * advance, (q[1] - p[1]) * cap
                t = np.clip(((a - pa) * ea + (b - pb) * eb) / (ea * ea + eb * eb), 0.0, 1.0)
                d = np.minimum(d, np.hypot(a - (pa + t * ea), b - (pb + t * eb)))
    return smoothstep(stroke, stroke - 0.0009, d)


def back_band(k):
    """The back stop face, planar: u = x - XL across, t down the slant from the back-top corner."""
    u, t = grid_for(BACK, k, W, S_BACK)
    y = TOP * (1.0 - t / S_BACK)
    inset = DRAFT * y / TOP  # the face is drafted: work in the local width at each height
    ul = u - inset
    Wy = W - 2.0 * inset
    h = np.zeros_like(u)

    # Recessed moulded panel carrying raised lettering. Seen from behind, screen right is -x,
    # so the reading coordinate runs from the +x edge: a = Wy / 2 - ul, centred.
    db = np.minimum.reduce([ul - 0.034, (Wy - 0.034) - ul, t - 0.030, (S_BACK - 0.036) - t])
    panel = smoothstep(-0.0012, 0.0012, db)
    h -= 0.0030 * panel
    a = Wy / 2.0 - ul
    text = np.maximum(lettering(a, y, 'WHEEL', 0.148, 0.030, 0.022, 0.0026),
                      lettering(a, y, 'CHOCK', 0.094, 0.030, 0.022, 0.0026)) * panel
    h += 0.0024 * text

    d_long = np.minimum(ul, Wy - ul)
    h -= np.maximum(edge_drop(d_long), edge_drop(t, depth=EDGE_DROP * 0.7))
    scr = scratch_field(ul, y, 29, 22, (0.0, W, 0.02, 0.26), 0.0, 0.45)
    # scratches are colour only: a sub-texel groove would only add JPEG noise to the normal map

    rgb = orange_base(ul, y, 21) * sun_bleach(y)
    edge = np.maximum(smoothstep(EDGE_W * 1.6, EDGE_W * 0.15, d_long), smoothstep(EDGE_W * 1.6, EDGE_W * 0.15, t))
    wear = chipped(edge, ul + y, y - ul, 19) * 0.55
    # Boot kick marks low on the stop face, where the chock is pushed under the tyre.
    scuff = kick_scuffs(ul, y, ((0.11, 0.050, 0.028, 0.10, 0.22), (0.16, 0.068, 0.020, -0.15, 0.16),
                                (0.08, 0.080, 0.016, 0.25, 0.12)))
    rgb = mix(rgb, GRIME * 0.75, scuff)
    return h, weather(rgb, h, k, D_BACK, np.ones_like(u), wear, splash_grime(ul, y, 27), scr)


def polygon_sd(zz, yy, poly):
    """Signed distance to a closed (z, y) polygon, positive inside."""
    dist = np.full(yy.shape, np.inf, np.float32)
    inside = np.zeros(yy.shape, bool)
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        e = q - p
        t = np.clip(((zz - p[0]) * e[0] + (yy - p[1]) * e[1]) / float(e @ e), 0.0, 1.0)
        dz, dy = zz - (p[0] + t * e[0]), yy - (p[1] + t * e[1])
        dist = np.minimum(dist, np.sqrt(dz * dz + dy * dy))
        crosses = ((p[1] > yy) != (q[1] > yy)) & (zz < (q[0] - p[0]) * (yy - p[1]) / (q[1] - p[1] + 1e-12) + p[0])
        inside ^= crosses
    return np.where(inside, dist, -dist)


CLOCK = (-0.115, 0.155)  # moulded date clock on the side faces (z, y), above the grip, clear of grime
CLOCK_R = 0.015
_CLOCK_SD = float(polygon_sd(np.array([CLOCK[0]], np.float32), np.array([CLOCK[1]], np.float32),
                             np.array(PROFILE, np.float32))[0])
assert _CLOCK_SD > 0.032 + CLOCK_R + 0.002, f'date clock leaves the side pocket ({_CLOCK_SD:.4f} m in)'
assert CLOCK[1] - CLOCK_R > HANDLE_Y + BOSS_HALF + 0.004, 'date clock overlaps the handle bosses'


def side_band(k):
    """Both side faces share this region (the mould is symmetric and nothing on it is handed).
    Planar: y along u, z along v. The handle's bosses are geometry, so nothing here is +X only."""
    yy, zz = grid_for(SIDE, k, TOP, 2 * HALF_L)
    zz = zz - HALF_L
    sd = polygon_sd(zz, yy, np.array(PROFILE, np.float32))

    # The face stays flat right up to its outline (a rounding that follows a diagonal of the
    # texel grid aliases). Moulded pocket 30 mm in from the outline, with a crisp 4 mm wall.
    pocket = smoothstep(0.028, 0.032, sd)
    h = -0.0028 * pocket
    # Moulded date clock: a raised ring, twelve tick dimples and a centre arrow.
    zc, yc = CLOCK
    rr = np.sqrt((zz - zc) ** 2 + (yy - yc) ** 2)
    ang = np.arctan2(yy - yc, zz - zc)
    ring = np.exp(-((rr - CLOCK_R) / 0.0015) ** 2)
    ticks = np.exp(-((rr - 0.0105) / 0.0016) ** 2) * smoothstep(0.80, 0.95, np.cos(ang * 12))
    arrow = (np.abs(yy - yc) < 0.0015) * (zz > zc - 0.007) * (zz < zc + 0.007) * 1.0
    arrow = np.maximum(arrow, (1.0 - smoothstep(0.0, 0.0016, np.abs(np.abs(yy - yc) - (zc + 0.007 - zz) * 0.8)))
                       * (zz > zc + 0.002) * (zz < zc + 0.007))
    h += 0.0014 * ring - 0.0008 * ticks + 0.0010 * arrow
    scr = scratch_field(zz, yy, 31, 34, (-HALF_L, HALF_L, 0.01, 0.22), 0.0, 0.5)
    # scratches are colour only: a sub-texel groove would only add JPEG noise to the normal map

    rgb = orange_base(yy, zz, 61) * sun_bleach(yy)
    # Worn light band just inside the outline, broken into chips.
    outline = smoothstep(0.010, 0.0015, sd) * (sd > -0.002)
    wear = chipped(outline, zz + yy, zz - yy, 65) * 0.45
    rgb *= (1.0 - 0.04 * pocket)[..., None]
    return h, weather(rgb, h, k, D_SIDE, np.ones_like(yy), wear, splash_grime(zz, yy, 67), scr)


def flat_patch(r, k, colour, seed, var):
    sw, sh = r['w'] * k * SUPERSAMPLE, r['h'] * k * SUPERSAMPLE
    px_m = D_WRAP * k * SUPERSAMPLE
    a, b = np.meshgrid(np.arange(sw, dtype=np.float32) / px_m, np.arange(sh, dtype=np.float32) / px_m)
    rgb = np.broadcast_to(colour, a.shape + (3,)) * (1.0 + (value_noise(a, b, 0.03, seed) - 0.5) * var)[..., None]
    return np.zeros_like(a), rgb


def build_atlas(k, want):
    """Render the atlas at k times the base layout; want = 'colour' or 'normal'."""
    tw, th, g = TEX_W * k, TEX_H * k, GUTTER * k
    out = np.zeros((th, tw, 3), np.float32)
    if want == 'normal':
        out[..., 2] = 1.0
    else:
        out[:] = ORANGE * 0.9
    jobs = [
        (WRAP, lambda: wrap_band(k), W, S_T),
        (BACK, lambda: back_band(k), W, S_BACK),
        (SIDE, lambda: side_band(k), TOP, 2 * HALF_L),
        (HANDLE_PATCH, lambda: flat_patch(HANDLE_PATCH, k, STEEL, 91, 0.04), 1, 1),
        (BOTTOM_PATCH, lambda: flat_patch(BOTTOM_PATCH, k, (ORANGE * 0.55 + GRIME * 0.45), 95, 0.0), 1, 1),
    ]
    for r, make, eu, ev in jobs:
        h, rgb = make()
        if want == 'normal':
            sw, sh = h.shape[1], h.shape[0]
            a = normals_from_height(h, eu / sw, ev / sh)
            a = block_mean(a)
            a /= np.linalg.norm(a, axis=-1, keepdims=True)
        else:
            a = block_mean(rgb)
        a = np.pad(a, ((g, g), (g, g), (0, 0)), mode='edge')
        r0, c0 = r['row0'] * k - g, r['col0'] * k - g
        out[r0:r0 + a.shape[0], c0:c0 + a.shape[1]] = a
    if want == 'normal':
        return np.clip(np.round((out * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def write_jpeg(path, rgb, quality):
    """Baseline JPEG with full-resolution chroma (4:4:4) via OpenImageIO.

    Rows here are bottom-first (Blender's order); image files are top-first.
    """
    top_first = np.ascontiguousarray(rgb[::-1])
    h, w, _ = top_first.shape
    spec = oiio.ImageSpec(w, h, 3, 'uint8')
    spec.attribute('Compression', f'jpeg:{quality}')
    spec.attribute('jpeg:subsampling', COLOUR_SUBSAMPLING)
    spec.attribute('jpeg:progressive', 1)  # progressive scans: about 5% smaller here
    out = oiio.ImageOutput.create(path)
    if out is None or not out.open(path, spec):
        raise SystemExit(f'OpenImageIO could not open {path}: {oiio.geterror()}')
    if not out.write_image(top_first):
        raise SystemExit(f'OpenImageIO could not write {path}: {out.geterror()}')
    out.close()


def write_png(path, rgb, step=1):
    """8-bit RGB PNG with per-row adaptive filtering and zlib level 9 (rows bottom-first in).

    step > 1 snaps the normal's R and G to multiples of step about 128 (0.9 degree at 2),
    which halves the entropy of the soft gradients without moving the flat value.
    """
    if step > 1:
        rgb = rgb.astype(np.int32).copy()
        rgb[..., :2] = np.clip(np.round((rgb[..., :2] - 128) / step) * step + 128, 0, 255)
    raw = np.ascontiguousarray(rgb[::-1].astype(np.uint8))
    h, w, _ = raw.shape
    cur = raw.reshape(h, w * 3).astype(np.int16)
    up = np.vstack([np.zeros((1, w * 3), np.int16), cur[:-1]])
    left = np.hstack([np.zeros((h, 3), np.int16), cur[:, :-3]])
    upleft = np.hstack([np.zeros((h, 3), np.int16), up[:, :-3]])
    pa = np.abs(up - upleft)
    pb = np.abs(left - upleft)
    pc = np.abs(left + up - 2 * upleft)
    paeth = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, up, upleft))
    cands = [cur, cur - left, cur - up, cur - (left + up) // 2, cur - paeth]
    filtered = [(c % 256).astype(np.uint8) for c in cands]
    cost = np.stack([np.abs(f.astype(np.int8).astype(np.int16)).sum(axis=1) for f in filtered])
    choice = cost.argmin(axis=0)
    rows = bytearray()
    for y in range(h):
        rows.append(int(choice[y]))
        rows += filtered[choice[y]][y].tobytes()

    def chunk(tag, body):
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', zlib.crc32(tag + body) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + \
        chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


def repack_glb(path, replacements):
    """Swap named image buffers in a GLB for the given (bytes, mimeType), keeping every
    other buffer view byte-identical and 4-byte aligned."""
    data = open(path, 'rb').read()
    jlen = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack('<I', data[off:off + 4])[0]
    binc = data[off + 8:off + 8 + blen]
    by_view = {}
    for im in gltf.get('images', []):
        if im.get('name') in replacements:
            by_view[im['bufferView']] = im
    missing = set(replacements) - {im['name'] for im in by_view.values()}
    if missing:
        raise SystemExit(f'repack_glb: images not found in export: {sorted(missing)}')
    new_bin = bytearray()
    for i, view in enumerate(gltf['bufferViews']):
        start = view.get('byteOffset', 0)
        body = binc[start:start + view['byteLength']]
        if i in by_view:
            body, mime = replacements[by_view[i]['name']]
            by_view[i]['mimeType'] = mime
        new_bin += b'\0' * ((-len(new_bin)) % 4)
        view['byteOffset'] = len(new_bin)
        view['byteLength'] = len(body)
        new_bin += body
    new_bin += b'\0' * ((-len(new_bin)) % 4)
    gltf['buffers'][0]['byteLength'] = len(new_bin)
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(new_bin)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        fh.write(struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin))


# ---------------------------------------------------------------- mesh
def g2b(x, y, z):
    """glTF / three.js (y up, +z front) -> Blender (z up); the exporter maps it back."""
    return (x, -z, y)


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.verts = 0
        self.loop_normals = []  # per face, per loop: Blender-space normal or (0, 0, 0) = auto

    def vert(self, x, y, z):
        self.verts += 1
        return self.bm.verts.new(g2b(x, y, z))

    def face(self, verts, uvs, outward_dir, normals=None):
        """outward_dir: glTF-space direction the face must point along; winding is fixed
        to match. normals: glTF-space per-vertex custom normals (None = flat)."""
        pts = [v.co for v in verts]
        nx = ny = nz = 0.0
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            nx += (a.y - b.y) * (a.z + b.z)
            ny += (a.z - b.z) * (a.x + b.x)
            nz += (a.x - b.x) * (a.y + b.y)
        ob = g2b(*outward_dir)
        normals = [g2b(*n) for n in normals] if normals else [(0.0, 0.0, 0.0)] * len(verts)
        if nx * ob[0] + ny * ob[1] + nz * ob[2] < 0:
            verts, uvs, normals = list(reversed(verts)), list(reversed(uvs)), list(reversed(normals))
        f = self.bm.faces.new(verts)
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
        f.smooth = True
        self.loop_normals.append(normals)
        return f


def wrap_uv(u_m, s):
    return uv_in(WRAP, u_m / W, s / S_T)


def back_uv(x, y):
    """Planar on the drafted back face: u = x - XL, v = slant distance down from T."""
    return uv_in(BACK, (x - XL) / W, (TOP - y) / TOP)


def side_uv(z, y):
    return uv_in(SIDE, y / TOP, (z + HALF_L) / (2 * HALF_L))


def build_body(b):
    """Traced-profile extrusion: 10 + 10 side triangles, 2 per profile edge (22), 2 under.

    The two Bezier strips (ramp, crest) share vertices along the curve and carry the
    curve's analytic normal; every other profile face has its own vertices (hard edge).
    """
    edges = list(range(N_PTS - 1))  # every profile edge except the bottom (G -> A)

    def outward_of(i):
        n = inward_normal(PROFILE[i], PROFILE[i + 1])
        return (0.0, -n[1], -n[0])  # glTF (x, y, z)

    def uvs(i):
        if i != I_T:  # toe lip, ramp and crest: the unrolled wrap band
            return [wrap_uv(0.0, ARC[i]), wrap_uv(W, ARC[i]), wrap_uv(W, ARC[i + 1]), wrap_uv(0.0, ARC[i + 1])]
        (_, y0), (_, y1) = PROFILE[i], PROFILE[i + 1]  # back face: its own planar region
        return [back_uv(x_left(y0), y0), back_uv(x_right(y0), y0), back_uv(x_right(y1), y1), back_uv(x_left(y1), y1)]

    for i in edges:
        if i in STRIP_EDGES:
            continue
        (z0, y0), (z1, y1) = PROFILE[i], PROFILE[i + 1]
        v = [b.vert(x_left(y0), y0, z0), b.vert(x_right(y0), y0, z0), b.vert(x_right(y1), y1, z1),
             b.vert(x_left(y1), y1, z1)]
        b.face(v, uvs(i), outward_of(i))
    for first, normals in STRIPS:
        idx = list(range(first, first + len(normals)))
        left = {k: b.vert(x_left(PROFILE[k][1]), PROFILE[k][1], PROFILE[k][0]) for k in idx}
        right = {k: b.vert(x_right(PROFILE[k][1]), PROFILE[k][1], PROFILE[k][0]) for k in idx}
        nrm = {k: (0.0, normals[j][1], normals[j][0]) for j, k in enumerate(idx)}
        for i in idx[:-1]:
            b.face([left[i], right[i], right[i + 1], left[i + 1]], uvs(i), outward_of(i),
                   [nrm[i], nrm[i], nrm[i + 1], nrm[i + 1]])
    for side_x, sign in ((x_left, -1.0), (x_right, 1.0)):
        b.face([b.vert(side_x(p[1]), p[1], p[0]) for p in PROFILE], [side_uv(p[0], p[1]) for p in PROFILE],
               (sign, 0.0, 0.0))
    centre = uv_in(BOTTOM_PATCH, 0.5, 0.5)
    ring = [(XL, -HALF_L), (XL, HALF_L), (XR, HALF_L), (XR, -HALF_L)]
    b.face([b.vert(x, 0.0, z) for x, z in ring], [centre] * 4, (0.0, -1.0, 0.0))


def build_handle(b):
    """U-rod, square section with radial normals, three straight runs with mitred corners
    (6 * ROD_SIDES triangles), and a square pyramidal steel boss where each leg meets the wall
    (4 triangles each).

    The section's corners sit on the diagonals and carry radial normals, which are a round
    rod's normals at those points, so it shades as a cylinder; seen side-on a bend shows a
    flat end rather than the arrowhead a diamond's mitred tip made. Each boss is a modelled
    joint: its base is sunk into the drafted wall, its slopes rise to meet the rod's flats
    about 7 mm out, and its apex is hidden inside the rod.
    """
    z1, z2 = HANDLE_Z
    # The bosses must sit wholly on the side face, clear of the traced outline.
    corners_z = np.array([zc + dz * BOSS_HALF for zc in HANDLE_Z for dz in (-1, 1)], np.float32)
    corners_y = np.full_like(corners_z, HANDLE_Y + BOSS_HALF)
    clearance = polygon_sd(corners_z, corners_y, np.array(PROFILE, np.float32))
    assert clearance.min() > 0.005, f'handle boss crosses the outline: {clearance}'
    # At a 90-degree mitre the stretched corner reaches cos(phase) * ROD_R * sqrt(2) / sqrt(2).
    xg = HANDLE_X_OUT - ROD_R * math.cos(ROD_PHASE)
    x_wall = x_right(HANDLE_Y)
    x_in = x_wall - LEG_DEPTH  # legs run into the body through the bosses
    path = [
        ((x_in, z1), (1.0, 0.0), (1.0, 0.0)),
        ((xg, z1), (1.0, 0.0), (0.0, 1.0)),
        ((xg, z2), (0.0, 1.0), (-1.0, 0.0)),
        ((x_in, z2), (-1.0, 0.0), (-1.0, 0.0)),
    ]
    lengths = [0.0]
    for i in range(1, len(path)):
        lengths.append(lengths[-1] + math.dist(path[i - 1][0], path[i][0]))
    rings, dirs = [], []
    for (px_, pz), t_in, t_out in path:
        tx, tz = t_in[0] + t_out[0], t_in[1] + t_out[1]
        tl = math.hypot(tx, tz)
        tx, tz = tx / tl, tz / tl
        sx, sz = -tz, tx  # horizontal side vector of the mitre plane
        half_turn = math.acos(max(-1.0, min(1.0, t_in[0] * t_out[0] + t_in[1] * t_out[1]))) / 2
        stretch = 1.0 / math.cos(half_turn)
        ring, ring_dirs = [], []
        for k in range(ROD_SIDES):
            a = 2 * math.pi * k / ROD_SIDES + ROD_PHASE
            ring_dirs.append((math.cos(a) * sx, math.sin(a), math.cos(a) * sz))
            ring.append((px_ + ROD_R * stretch * math.cos(a) * sx, HANDLE_Y + ROD_R * math.sin(a),
                         pz + ROD_R * stretch * math.cos(a) * sz))
        rings.append(ring)
        dirs.append(ring_dirs)
    reach = max(p[0] for ring in rings for p in ring)
    assert abs(reach - HANDLE_X_OUT) < 1e-9, f'handle reach {reach} != {HANDLE_X_OUT}'
    clear = xg - ROD_R * math.cos(ROD_PHASE) - x_wall
    assert clear > 0.028, f'grip leaves only {clear * 1000:.1f} mm for a hand'
    verts = []
    for i, ring in enumerate(rings):
        uv = uv_in(HANDLE_PATCH, 0.1 + 0.8 * lengths[i] / lengths[-1], 0.5)
        verts.append([(b.vert(*p), uv) for p in ring])
    for i in range(len(rings) - 1):
        for k in range(ROD_SIDES):
            k2 = (k + 1) % ROD_SIDES
            quad = [verts[i][k], verts[i][k2], verts[i + 1][k2], verts[i + 1][k]]
            nq = [dirs[i][k], dirs[i][k2], dirs[i + 1][k2], dirs[i + 1][k]]
            d = tuple(sum(c) for c in zip(*nq))
            b.face([q[0] for q in quad], [q[1] for q in quad], d, nq)

    # Bosses: flat-shaded faces, so the four 45-degree slopes each catch the light differently
    # and the boss reads as a chunky square collar, not as a flat plate.
    uv = uv_in(HANDLE_PATCH, 0.5, 0.5)
    for zc in HANDLE_Z:
        apex = (x_wall + BOSS_H, HANDLE_Y, zc)
        base = []
        for dy, dz in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
            y = HANDLE_Y + dy * BOSS_HALF
            base.append((x_right(y) - BOSS_SINK, y, zc + dz * BOSS_HALF))
        bv = [b.vert(*p) for p in base]
        av = b.vert(*apex)
        for i in range(4):
            j = (i + 1) % 4
            p0, p1, p2 = (np.array(q) for q in (apex, base[i], base[j]))
            n = np.cross(p1 - p0, p2 - p0)
            n /= np.linalg.norm(n)
            mid = (np.array(base[i]) + np.array(base[j])) / 2.0
            if np.dot(n, mid - np.array((x_wall, HANDLE_Y, zc))) < 0:
                n = -n
            n = tuple(float(c) for c in n)
            b.face([av, bv[i], bv[j]], [uv, uv, uv], n, [n, n, n])


def build_mesh():
    b = Builder()
    build_body(b)
    build_handle(b)
    b.bm.normal_update()
    mesh = bpy.data.meshes.new(MESH_NAME)
    b.bm.to_mesh(mesh)
    count = b.verts
    loop_normals = [n for face in b.loop_normals for n in face]
    b.bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    assert len(loop_normals) == len(mesh.loops)
    mesh.normals_split_custom_set(loop_normals)
    return mesh, count


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed solid: export single-sided
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.62

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = COLOUR_IMAGE
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = NORMAL_IMAGE
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


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P wheel-chock-body.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    stage = tempfile.mkdtemp(prefix='wheel-chock-body-')
    try:
        colour_px = build_atlas(COLOUR_SCALE, 'colour')
        normal_px = build_atlas(NORMAL_SCALE, 'normal')
        colour_path = os.path.join(stage, COLOUR_IMAGE + '.jpg')
        normal_path = os.path.join(stage, NORMAL_IMAGE + '.png')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY)
        write_png(normal_path, normal_px, NORMAL_STEP)
        dump = os.environ.get('WHEEL_CHOCK_DUMP')
        if dump:  # optional: keep the atlas images for inspection
            os.makedirs(dump, exist_ok=True)
            shutil.copy(colour_path, dump)
            shutil.copy(normal_path, dump)

        mesh, count = build_mesh()
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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/wheel-chock-body.py)',
        )
        with open(colour_path, 'rb') as fh:
            colour_bytes = fh.read()
        with open(normal_path, 'rb') as fh:
            normal_bytes = fh.read()
        repack_glb(out_path, {COLOUR_IMAGE: (colour_bytes, 'image/jpeg'), NORMAL_IMAGE: (normal_bytes, 'image/png')})
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'WHEEL_CHOCK_BODY_WROTE {out_path} {os.path.getsize(out_path)} bytes '
          f'{TEX_W}x{TEX_H} colour {len(colour_bytes)} normal {len(normal_bytes)} authored verts {count}')
    print('WHEEL_CHOCK_PROFILE ' + ' '.join(f'({z:.4f},{y:.4f})' for z, y in PROFILE))


main()
