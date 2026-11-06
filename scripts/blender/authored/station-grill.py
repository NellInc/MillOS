"""Hot-dog roller grill housing (world-station-grill), built from scratch.

What it builds
--------------
The grey (#9d9d9d) roller-grill housing that sits on the orange cupboard in the
station shop: 0.6 m (X) x 0.4 m (Y) x 0.5 m (Z), origin at the ground centre,
+Z (three.js) front. One node `Station-grillBody`, one mesh, one material,
two textures.

Why the geometry is a plain box
-------------------------------
The asset contract allows 36 render vertices, and the runtime replaces this
geometry at load: `createPosterStationGeometry` (src/components/scenery/
AuthoredPropTrim.tsx) forms the casing - rounded body, two roller-bearing cheeks,
a raised service panel - but ONLY when the source is exactly a 36-vertex
axis-aligned cuboid with one uniform VEC3 vertex colour and the 1.5 : 1 : 1.25
proportions. Anything else is rendered as-is and the in-game casing disappears.
The 412-triangle split it produces also depends on which diagonal each face
uses, so the 12 triangles below reproduce the delivered order, winding,
positions (float32) and node transform exactly. Only the UVs and textures are
authored here.

So every feature is PAINTED, NOT MODELLED, and aligned with the runtime casing
so the projection reinforces it in-game (the runtime re-projects each face's
chart onto the formed geometry along the face axis):

* base-colour map (indexed PNG 512x512, 64 colours, multiplied by the grey
  vertex colour; ~540 texels/m on the front and top, ~290 on sides and back,
  the two sides sharing one chart): three tonal families - charcoal plinth,
  drip tray, slots and knobs; a darker painted-enamel body; bare stainless for
  the top rim (y >= 0.34 m, the runtime cheek band, marked by seams only, no
  plates or fasteners), the service panel at the runtime panel's footprint
  (x +-0.27 m, y 0.05-0.33 m, recess seam and lit top edge) and the six
  rollers painted under the runtime rollers. Colour only on the controls: red
  knob pointers, an amber pilot lens, a yellow rating label;
* metallic-roughness map (indexed PNG 256x256, same UVs): enamel (rough 0.6,
  metal 0), stainless (rough 0.32, metal 0.35), rollers (0.4 / 0.5), tray and
  plinth matte. No normal map: the delivered normal atlas carried only noise
  on flat faces.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/station-grill.py -- <out.glb>

Re-runnable and deterministic. Writes only <out.glb> (set GRILL_DUMP_DIR to also
write the two PNGs there for inspection). It needs only numpy, so Blender's
bundled Python runs it headless; the GLB is written directly (struct) rather
than through Blender's exporter, which would emit COLOR_0 as VEC4 and fail the
runtime gate, and could reorder the vertices the 412-triangle split depends on.
"""

import json
import os
import struct
import sys
import zlib

import numpy as np

# ---------------------------------------------------------------- identity
NODE_NAME = 'Station-grillBody'
MESH_NAME = 'station-grill-mesh'
MATERIAL_NAME = 'station-grill-surface'
COLOUR_NAME = 'station-grill-colour'
ORM_NAME = 'station-grill-orm'

# World-space envelope (metres) and the runtime casing features it must match
# (AuthoredPropTrim.tsx createPosterStationGeometry, fractions of the envelope).
W, H, D = 0.6, 0.4, 0.5
CASING_TOP = 0.925 * H          # 0.37: top of the formed body
CHEEK_IN = 0.40 * W             # 0.24: inner face of each bearing cheek
CHEEK_Y0 = CASING_TOP - 0.075 * H  # 0.34: cheek underside
PANEL_HALF_X = 0.45 * W         # 0.27
PANEL_Y0, PANEL_Y1 = 0.125 * H, 0.825 * H  # 0.05 .. 0.33
KICK = 0.03                     # charcoal base strip height
ROLLER_Z = [-0.21 + k * 0.084 for k in range(6)]  # StationRetailDetails.tsx rollers
ROLLER_R = 0.022

# Vertex paint, linear: #9d9d9d. Must be uniform (runtime gate).
PAINT_LINEAR = np.float32(0.34191441535949707)

# ---------------------------------------------------------------- geometry
# Exact float32 extremes and node transform of the delivered box (local units;
# the node scales by 0.6 and lifts by 0.2 m so the base sits on y = 0).
_X = np.float32('0.49999997019767761')
_YP = np.float32('0.33333313465118408')
_YN = np.float32('-0.33333316445350647')
_Z = np.float32('0.41666638851165771')
NODE_TRANSLATION = [0.0, 0.2000000268220959, 0.0]
NODE_SCALE = [0.6000003844501708] * 3

# Corner sign pattern per vertex, in the delivered triangle order and winding
# (two triangles per face, faces -Z, +X, -X, +Y, -Y, +Z).
CORNERS = (
    '++- +-- -+- +-- --- -+- '
    '+++ +-+ ++- +-+ +-- ++- '
    '-+- --- -++ --- --+ -++ '
    '-+- -++ ++- -++ +++ ++- '
    '--+ --- +-+ --- +-- +-+ '
    '-++ --+ +++ --+ +-+ +++'
).split()
FACE_NORMALS = [(0, 0, -1), (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1)]


def build_geometry():
    pos = np.zeros((36, 3), np.float32)
    nor = np.zeros((36, 3), np.float32)
    for i, signs in enumerate(CORNERS):
        sx, sy, sz = (1 if c == '+' else -1 for c in signs)
        pos[i] = (_X * sx, _YP if sy > 0 else _YN, _Z * sz)
        nor[i] = FACE_NORMALS[i // 6]
    return pos, nor


# ---------------------------------------------------------------- UV layout
# Texel density goes where the eye goes. The front (+Z, the service panel) and
# the top (+Y, the roller bay) get ~2x the density of the sides and back; the
# two sides share ONE chart (they are painted identically and symmetric in z);
# the bottom, which sits on the cupboard and is culled in-game (FrontSide), is
# a tiny solid chart. Each face stays one rectangular two-triangle chart, so
# the runtime's per-face re-projection (splitGrillAtlas) keeps every formed
# triangle inside one source UV triangle.
TEX = 512
PAD = 4.0
HI = 540.0   # texels per metre, front and top
LO = 290.0   # texels per metre, sides and back
_COL2 = 2 * PAD + W * HI
# face key -> ((x0, y0) of its chart in texels, row 0 = top of image),
#             (metric size: a = image right, b = image up), texels per metre
CHARTS = {
    '+Y': ((PAD, PAD), (W, D), HI),
    '+Z': ((PAD, 2 * PAD + D * HI), (W, H), HI),
    '+X': ((_COL2, PAD), (D, H), LO),
    '-X': ((_COL2, PAD), (D, H), LO),          # shares the +X chart
    '-Z': ((_COL2, 2 * PAD + H * LO), (W, H), LO),
    '-Y': ((_COL2, 3 * PAD + 2 * H * LO), (W, D), 16.0),
}
SHARED = {'-X': '+X'}


def face_key(n):
    axis = int(np.argmax(np.abs(n)))
    return ('+' if n[axis] > 0 else '-') + 'XYZ'[axis]


def world_to_ab(key, x, y, z):
    """World metres (x +-0.3, y 0..0.4, z +-0.25) -> chart metres (a right, b up)."""
    if key == '+Z':
        return x + W / 2, y
    if key == '-Z':
        return W / 2 - x, y
    if key == '+X':
        return D / 2 - z, y
    if key == '-X':
        return z + D / 2, y
    if key == '+Y':
        return x + W / 2, D / 2 - z
    return x + W / 2, z + D / 2  # -Y


def ab_to_world(key, a, b):
    if key == '+Z':
        return a - W / 2, b, np.full_like(a, D / 2)
    if key == '-Z':
        return W / 2 - a, b, np.full_like(a, -D / 2)
    if key == '+X':
        return np.full_like(a, W / 2), b, D / 2 - a
    if key == '-X':
        return np.full_like(a, -W / 2), b, a - D / 2
    if key == '+Y':
        return a - W / 2, np.full_like(a, H), D / 2 - b
    return a - W / 2, np.zeros_like(a), b - D / 2  # -Y


def build_uvs(pos, nor):
    uv = np.zeros((36, 2), np.float32)
    for i in range(36):
        key = face_key(nor[i])
        x = float(np.sign(pos[i, 0])) * W / 2
        y = H if pos[i, 1] > 0 else 0.0
        z = float(np.sign(pos[i, 2])) * D / 2
        if key in SHARED:  # paint is symmetric in z: map this face onto its twin
            x, z = -x, -z
            a, b = world_to_ab(SHARED[key], x, y, z)
        else:
            a, b = world_to_ab(key, x, y, z)
        (x0, y0), (_, bh), scale = CHARTS[key]
        uv[i] = ((x0 + a * scale) / TEX, (y0 + (bh - b) * scale) / TEX)
    return uv


# ---------------------------------------------------------------- painting
# Material slots: sRGB multiplier on the grey vertex paint (white = the
# identity grey #9d9d9d), roughness, metalness. Three tonal families, so the
# parts separate at 7-13 m: dark (kick, tray, slots, knobs), mid painted body,
# light bare stainless (service panel, top rim, rollers). Colour accents only on
# the controls (red pointers, amber pilot lens, yellow rating label).
BODY = (np.array([186, 186, 183], np.float32), 0.6, 0.0)     # painted enamel
STEEL = (np.array([255, 255, 255], np.float32), 0.32, 0.35)  # bare stainless
KICKC = (np.array([52, 52, 54], np.float32), 0.85, 0.0)      # charcoal plinth
TRAY = (np.array([46, 46, 48], np.float32), 0.7, 0.0)        # drip tray / bay
SLOT = (np.array([28, 28, 30], np.float32), 0.85, 0.0)       # vent / slot void
KNOB = (np.array([34, 34, 36], np.float32), 0.45, 0.0)       # black bakelite
POINTER = (np.array([255, 70, 52], np.float32), 0.45, 0.0)
LAMP = (np.array([255, 168, 40], np.float32), 0.15, 0.0)
LABEL = (np.array([255, 214, 84], np.float32), 0.5, 0.0)
INK = (np.array([40, 40, 42], np.float32), 0.6, 0.0)
ROLLER = (np.array([255, 255, 255], np.float32), 0.4, 0.5)

SS = 4  # supersampling per texel


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def step(e, x):
    return (x >= e).astype(np.float32)


def box_mask(u, v, u0, u1, v0, v1):
    """Hard-edged rectangle; anti-aliasing comes from the supersampling."""
    return ((u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)).astype(np.float32)


def disc_mask(u, v, cu, cv, r):
    return (np.hypot(u - cu, v - cv) <= r).astype(np.float32)


def slot_mask(u, v, u0, u1, cv, half_h):
    """Horizontal slot with rounded ends."""
    cu = np.clip(u, u0 + half_h, u1 - half_h)
    return (np.hypot(u - cu, v - cv) <= half_h).astype(np.float32)


class Layer:
    """Accumulates colour / roughness / metal with alpha-over compositing."""

    def __init__(self, shape, base):
        self.rgb = np.broadcast_to(base[0], shape + (3,)).astype(np.float32).copy()
        self.rough = np.full(shape, base[1], np.float32)
        self.metal = np.full(shape, base[2], np.float32)

    def over(self, mask, slot):
        m = mask.astype(np.float32)
        self.rgb = self.rgb * (1 - m[..., None]) + slot[0] * m[..., None]
        self.rough = self.rough * (1 - m) + slot[1] * m
        self.metal = self.metal * (1 - m) + slot[2] * m

    def shade(self, factor):
        self.rgb = self.rgb * factor[..., None]


def edge_band(a, b, aw, bh, width=0.004, depth=0.14):
    """A narrow darker band at the face edges: a closed, folded sheet edge."""
    d = np.minimum(np.minimum(a, aw - a), np.minimum(b, bh - b))
    return 1.0 - depth * (d < width)


def seam(u, v, u0, u1, v0, v1, dark=0.45):
    return 1.0 - dark * box_mask(u, v, u0, u1, v0, v1)


def paint_vertical(key, x, y, z, a, b, aw, bh):
    """+-Z and +-X faces. `u` runs along the face (world x or z), `v` = height."""
    front_back = key in ('+Z', '-Z')
    u = x if front_back else z
    v = y
    span = W / 2 if front_back else D / 2
    L = Layer(a.shape, BODY)
    # Bare stainless rim around the whole top edge (the top of the casing and
    # the cheek blocks), with a dark fold line below it.
    rim = step(CHEEK_Y0, v)
    L.over(rim, STEEL)
    L.shade(seam(u, v, -span - 0.01, span + 0.01, CHEEK_Y0 - 0.003, CHEEK_Y0))
    # Charcoal plinth with a lit bevel line above it.
    L.over(1 - step(KICK, v), KICKC)
    L.shade(1 + 0.12 * box_mask(u, v, -span - 0.01, span + 0.01, KICK, KICK + 0.0025))

    if front_back:
        # Roller bay between the cheeks: the dark recess the rollers sit in,
        # with a lit lip edge. Cheek ends keep the stainless rim, separated
        # from the bay by a seam only (no plates or fasteners).
        L.over(box_mask(u, v, -CHEEK_IN, CHEEK_IN, CASING_TOP, H + 0.01), TRAY)
        L.shade(1 + 0.1 * box_mask(u, v, -CHEEK_IN, CHEEK_IN, CASING_TOP - 0.003, CASING_TOP))
        L.shade(seam(np.abs(u), v, CHEEK_IN, CHEEK_IN + 0.003, CHEEK_Y0, H + 0.01, 0.5))

    if key == '+Z':
        # Stainless service panel at the runtime panel footprint, with a dark
        # recess seam below/beside it and a lit top edge.
        ring = box_mask(u, v, -PANEL_HALF_X - 0.005, PANEL_HALF_X + 0.005,
                        PANEL_Y0 - 0.006, PANEL_Y1 + 0.003)
        L.shade(1 - 0.5 * ring)
        panel = box_mask(u, v, -PANEL_HALF_X, PANEL_HALF_X, PANEL_Y0, PANEL_Y1)
        L.over(panel, STEEL)
        L.shade(1 + 0.08 * box_mask(u, v, -PANEL_HALF_X, PANEL_HALF_X, PANEL_Y1 - 0.003, PANEL_Y1))
        L.shade(1 - 0.12 * box_mask(u, v, -PANEL_HALF_X, PANEL_HALF_X, PANEL_Y0, PANEL_Y0 + 0.003))
        # Louvred vent on the left: dark slots with a lit lower lip each.
        for k in range(5):
            cv = 0.12 + k * 0.034
            L.over(slot_mask(u, v, -0.235, -0.06, cv, 0.0065), SLOT)
            L.shade(1 + 0.1 * box_mask(u, v, -0.228, -0.067, cv - 0.0095, cv - 0.0065))
        # Two black control knobs, each on a printed dial ring, with a red
        # pointer; an amber pilot lens in a dark bezel between them and below.
        for cu in (0.12, 0.205):
            L.shade(1 - 0.35 * disc_mask(u, v, cu + 0.0015, 0.2135, 0.028))
            L.over(disc_mask(u, v, cu, 0.215, 0.0275) - disc_mask(u, v, cu, 0.215, 0.0245), INK)
            L.over(disc_mask(u, v, cu, 0.215, 0.02), KNOB)
            L.shade(1 + 0.25 * (disc_mask(u, v, cu - 0.004, 0.219, 0.009) * disc_mask(u, v, cu, 0.215, 0.02)))
            L.over(box_mask(u, v, cu - 0.002, cu + 0.002, 0.217, 0.233), POINTER)
            for t in (-0.8, 0.0, 0.8):  # three printed scale ticks
                tu, tv = cu + 0.032 * np.sin(t), 0.215 + 0.032 * np.cos(t)
                L.over(disc_mask(u, v, tu, tv, 0.0022), INK)
        L.over(disc_mask(u, v, 0.1625, 0.11, 0.012), KNOB)
        L.over(disc_mask(u, v, 0.1625, 0.11, 0.0085), LAMP)
        L.shade(1 + 0.3 * disc_mask(u, v, 0.1595, 0.113, 0.003))
        # Yellow rating label with two ink lines, above the knobs.
        L.over(box_mask(u, v, 0.09, 0.24, 0.268, 0.298), LABEL)
        L.over(box_mask(u, v, 0.1, 0.2, 0.284, 0.289), INK)
        L.over(box_mask(u, v, 0.1, 0.165, 0.275, 0.279), INK)

    if key == '-Z':
        # Rating plate, cord grommet and a rear vent row.
        L.shade(1 - 0.4 * box_mask(u, v, 0.067, 0.193, 0.187, 0.263))
        L.over(box_mask(u, v, 0.07, 0.19, 0.19, 0.26), STEEL)
        for k in range(3):
            L.over(box_mask(u, v, 0.085, 0.175, 0.205 + k * 0.016, 0.209 + k * 0.016), INK)
        L.over(disc_mask(u, v, -0.2, 0.085, 0.016), KNOB)
        L.over(disc_mask(u, v, -0.2, 0.085, 0.008), SLOT)
        for k in range(4):
            L.over(slot_mask(u, v, -0.12, 0.02, 0.15 + k * 0.03, 0.006), SLOT)

    if not front_back:
        # Side: the rim runs the full depth; a recessed carry-handle slot.
        L.shade(1 - 0.35 * box_mask(u, v, -0.095, 0.095, 0.216, 0.226))
        L.over(slot_mask(u, v, -0.09, 0.09, 0.24, 0.012), SLOT)
        L.shade(1 + 0.12 * box_mask(u, v, -0.085, 0.085, 0.253, 0.257))

    L.shade(edge_band(a, b, aw, bh))
    return L


def paint_top(x, z, a, b, aw, bh):
    """Top: stainless rim and cheek tops around a dark drip tray carrying six
    shaded rollers (under the runtime's real rollers)."""
    L = Layer(a.shape, STEEL)
    inner = box_mask(x, z, -CHEEK_IN, CHEEK_IN, -D / 2 + 0.014, D / 2 - 0.014)
    L.over(inner, TRAY)
    for rz in ROLLER_Z:
        t = np.clip(np.abs(z - rz) / ROLLER_R, 0, 1)
        along = box_mask(x, z, -CHEEK_IN + 0.004, CHEEK_IN - 0.004, rz - ROLLER_R, rz + ROLLER_R)
        cyl = np.sqrt(np.clip(1 - t * t, 0, 1))
        L.over(along, ROLLER)
        # Cylinder shading lit from the front edge (+z), a crisp highlight
        # line and a contact shadow on the tray behind each roller.
        L.shade(1 - along * (0.55 * (1 - cyl)))
        L.shade(1 + 0.18 * along * box_mask(x, z, -1, 1, rz + 0.004, rz + 0.009))
        L.shade(1 - 0.5 * inner * box_mask(x, z, -CHEEK_IN, CHEEK_IN, rz - ROLLER_R - 0.006, rz - ROLLER_R))
    # Seams where the cheeks and the front/back lips meet the tray.
    L.shade(seam(np.abs(x), z, CHEEK_IN, CHEEK_IN + 0.003, -D / 2, D / 2, 0.5))
    L.shade(seam(x, np.abs(z), -CHEEK_IN, CHEEK_IN, D / 2 - 0.017, D / 2 - 0.014, 0.4))
    L.shade(edge_band(a, b, aw, bh, width=0.003, depth=0.12))
    return L


def paint_bottom(a, b, aw, bh):
    return Layer(a.shape, KICKC)


def build_textures():
    """Returns (colour uint8 HxWx3, orm uint8 HxWx3), row 0 = top of image."""
    colour = np.zeros((TEX, TEX, 3), np.float32)
    orm = np.zeros((TEX, TEX, 3), np.float32)
    colour[...] = BODY[0]
    orm[..., 0] = 255.0  # occlusion channel unused
    orm[..., 1] = BODY[1] * 255
    grow = 2  # texels of edge padding against mip bleed
    painted = set()
    for key, ((x0, y0), (aw, bh), scale) in CHARTS.items():
        if (x0, y0) in painted:
            continue
        painted.add((x0, y0))
        c0, c1 = int(np.floor(x0)) - grow, int(np.ceil(x0 + aw * scale)) + grow
        r0, r1 = int(np.floor(y0)) - grow, int(np.ceil(y0 + bh * scale)) + grow
        cols = c0 + (np.arange((c1 - c0) * SS, dtype=np.float32) + 0.5) / SS
        rows = r0 + (np.arange((r1 - r0) * SS, dtype=np.float32) + 0.5) / SS
        cc, rr = np.meshgrid(cols, rows)
        a = np.clip((cc - x0) / scale, 0.0, aw)
        b = np.clip(bh - (rr - y0) / scale, 0.0, bh)
        x, y, z = ab_to_world(key, a, b)
        if key == '+Y':
            L = paint_top(x, z, a, b, aw, bh)
        elif key == '-Y':
            L = paint_bottom(a, b, aw, bh)
        else:
            L = paint_vertical(key, x, y, z, a, b, aw, bh)
        hh, ww = r1 - r0, c1 - c0

        def down(img):
            return img.reshape(hh, SS, ww, SS, -1).mean(axis=(1, 3))

        colour[r0:r1, c0:c1] = down(L.rgb)
        orm[r0:r1, c0:c1, 1] = down(L.rough[..., None])[..., 0] * 255
        orm[r0:r1, c0:c1, 2] = down(L.metal[..., None])[..., 0] * 255
    to8 = lambda img: np.clip(np.rint(img), 0, 255).astype(np.uint8)
    return to8(colour), to8(orm)


def quantise(img, k, iters=16):
    """Deterministic k-means palette (no dithering: flat paint stays flat and
    compresses to almost nothing). Returns (indices HxW uint8, palette kx3)."""
    px = img.reshape(-1, 3).astype(np.float32)
    uniq, inv, counts = np.unique(px, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    if len(uniq) <= k:
        return inv.astype(np.uint8).reshape(img.shape[:2]), uniq.astype(np.uint8)
    # Seed with the most common colours (the flat paint regions), then refine
    # on the unique colours weighted by their pixel counts.
    centres = uniq[np.argsort(-counts, kind='stable')[:k]].copy()
    w = counts.astype(np.float64)
    for _ in range(iters):
        lab = ((uniq[:, None, :] - centres[None, :, :]) ** 2).sum(-1).argmin(1)
        for c in range(k):
            m = lab == c
            if m.any():
                centres[c] = (uniq[m] * w[m, None]).sum(0) / w[m].sum()
    centres = np.clip(np.rint(centres), 0, 255)
    lab = ((uniq[:, None, :] - centres[None, :, :]) ** 2).sum(-1).argmin(1)
    return lab[inv].astype(np.uint8).reshape(img.shape[:2]), centres.astype(np.uint8)


# ---------------------------------------------------------------- encoders
def encode_png(img, palette=None):
    """Minimal 8-bit PNG writer: greyscale (HxW), RGB (HxWx3) or, with
    `palette` (kx3 uint8), indexed (HxW indices, filter 0 as the PNG spec
    advises for palette images). Rows top-first; other types pick the filter
    per row by minimum absolute residual."""
    grey = img.ndim == 2
    rows = img.astype(np.int16).reshape(img.shape[0], -1)
    bpp = 1 if grey else 3
    h, n = rows.shape
    out = bytearray()
    prev = np.zeros(n, np.int16)
    for r in range(h):
        line = rows[r]
        left = np.concatenate([np.zeros(bpp, np.int16), line[:-bpp]])
        upleft = np.concatenate([np.zeros(bpp, np.int16), prev[:-bpp]])
        pa = np.abs(prev - upleft)
        pb = np.abs(left - upleft)
        pc = np.abs(left + prev - 2 * upleft)
        paeth = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, prev, upleft))
        candidates = [line, line - left, line - prev, line - (left + prev) // 2, line - paeth]
        cost = [np.abs(((c + 128) % 256) - 128).sum() for c in candidates]
        ftype = 0 if palette is not None else int(np.argmin(cost))
        out.append(ftype)
        out += (candidates[ftype] % 256).astype(np.uint8).tobytes()
        prev = line

    def chunk(tag, payload):
        return (struct.pack('>I', len(payload)) + tag + payload
                + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF))

    width = n // bpp
    png = b'\x89PNG\r\n\x1a\n'
    ctype = 3 if palette is not None else (0 if grey else 2)
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, h, 8, ctype, 0, 0, 0))
    if palette is not None:
        png += chunk(b'PLTE', np.asarray(palette, np.uint8).reshape(-1, 3).tobytes())
    png += chunk(b'IDAT', zlib.compress(bytes(out), 9))
    png += chunk(b'IEND', b'')
    return png


# ---------------------------------------------------------------- GLB writer
def write_glb(path, pos, nor, uv, colour_png, orm_png):
    col = np.full((36, 3), PAINT_LINEAR, np.float32)
    idx = np.arange(36, dtype=np.uint16)
    blobs, views, accessors = bytearray(), [], []

    def add_view(data, target=None):
        while len(blobs) % 4:
            blobs.append(0)
        view = {'buffer': 0, 'byteOffset': len(blobs), 'byteLength': len(data)}
        if target:
            view['target'] = target
        blobs.extend(data)
        views.append(view)
        return len(views) - 1

    def add_accessor(arr, comp, kind, target, minmax=False):
        acc = {'bufferView': add_view(arr.tobytes(), target), 'componentType': comp,
               'count': int(arr.shape[0]), 'type': kind}
        if minmax:
            acc['min'] = [float(v) for v in arr.min(axis=0)]
            acc['max'] = [float(v) for v in arr.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    a_pos = add_accessor(pos, 5126, 'VEC3', 34962, minmax=True)
    a_nor = add_accessor(nor, 5126, 'VEC3', 34962)
    a_uv = add_accessor(uv, 5126, 'VEC2', 34962)
    a_col = add_accessor(col, 5126, 'VEC3', 34962)
    a_idx = add_accessor(idx, 5123, 'SCALAR', 34963)
    v_colour = add_view(colour_png)
    v_orm = add_view(orm_png)
    while len(blobs) % 4:
        blobs.append(0)

    gltf = {
        'asset': {
            'version': '2.0',
            'generator': 'MillOS scripts/blender/authored/station-grill.py',
            'copyright': 'MillOS authored geometry and textures (scripts/blender/authored/station-grill.py)',
        },
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': NODE_NAME, 'mesh': 0,
                   'translation': NODE_TRANSLATION, 'scale': NODE_SCALE}],
        'meshes': [{'name': MESH_NAME, 'primitives': [{
            'attributes': {'POSITION': a_pos, 'NORMAL': a_nor,
                           'TEXCOORD_0': a_uv, 'COLOR_0': a_col},
            'indices': a_idx, 'material': 0, 'mode': 4}]}],
        'materials': [{
            'name': MATERIAL_NAME,
            'doubleSided': True,
            'pbrMetallicRoughness': {
                'baseColorFactor': [1, 1, 1, 1],
                'baseColorTexture': {'index': 0},
                'metallicFactor': 1,
                'roughnessFactor': 1,
                'metallicRoughnessTexture': {'index': 1},
            },
        }],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'textures': [{'name': COLOUR_NAME, 'source': 0, 'sampler': 0},
                     {'name': ORM_NAME, 'source': 1, 'sampler': 0}],
        'images': [{'name': COLOUR_NAME, 'bufferView': v_colour, 'mimeType': 'image/png'},
                   {'name': ORM_NAME, 'bufferView': v_orm, 'mimeType': 'image/png'}],
        'accessors': accessors,
        'bufferViews': views,
        'buffers': [{'byteLength': len(blobs)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blobs)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(blobs), 0x004E4942) + bytes(blobs))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P station-grill.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    pos, nor = build_geometry()
    uv = build_uvs(pos, nor)
    colour, orm = build_textures()
    # Both maps are flat paint, so they are stored as indexed PNGs: 512 px
    # colour on a 64-entry palette, and the roughness/metal map box-filtered to
    # 256 px on 16 entries. UVs are shared.
    c_idx, c_pal = quantise(colour, int(os.environ.get('GRILL_COLOURS', 64)))
    colour_png = encode_png(c_idx, c_pal)
    half = orm.astype(np.float32).reshape(TEX // 2, 2, TEX // 2, 2, 3).mean(axis=(1, 3))
    o_idx, o_pal = quantise(np.clip(np.rint(half), 0, 255).astype(np.uint8), 16)
    orm_png = encode_png(o_idx, o_pal)
    dump = os.environ.get('GRILL_DUMP_DIR')
    if dump:
        for name, data in (('colour.png', colour_png), ('orm.png', orm_png)):
            with open(os.path.join(dump, name), 'wb') as f:
                f.write(data)
    write_glb(out_path, pos, nor, uv, colour_png, orm_png)
    print(f'STATION_GRILL_WROTE {out_path} {os.path.getsize(out_path)} bytes '
          f'(colour {len(colour_png)} B, orm {len(orm_png)} B)')


main()
