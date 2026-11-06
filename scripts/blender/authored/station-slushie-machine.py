"""Slush machine base cabinet (world-station-slushie-machine), built from scratch in headless Blender.

What it builds
--------------
The Dead Dino orange base cabinet of the shop's slush dispenser: 0.7 m wide (X)
x 1.8 m tall (Y) x 0.5 m deep (Z), origin at the bottom centre, +Z (three.js)
front. The runtime draws it inside a [1, 0.5, 1] group (STATION_RETAIL.
slushBaseScale), so it shows 0.9 m tall, and adds the hoppers, slush, lids,
taps, drip tray and the orange ledge on top (StationRetailDetails.tsx,
GasStationInstanced.tsx). The taps and the drip tray sit on the upper front, so
that area is a recessed dispense alcove here.

The asset contract allows 36 render vertices (= 36 indices) and 12,000 bytes, so
the geometry is exactly one closed 12-triangle box and every cabinet feature is
painted, not modelled (the sectionalDoor.ts rule):

* a tangent-space normal map (palette PNG, 512 x 368, 200 px/m) derived from a
  height field in real metres:
  - a rolled sheet-metal edge on every vertical corner and the top rim: an arc of
    radius 45 mm that reaches exactly 45 degrees at the face border (about 6 px),
    so the two faces' normals meet on the box diagonal and the corner shades as
    one continuous roll, not a printed line. The floor contact stays square;
  - a recessed charcoal kick plate wrapping all four sides;
  - front: a service door seam, recessed finger pull, a pressed louvre grille, and
    the recessed dispense alcove (under the runtime taps and drip tray) with a
    slotted stainless drain plate;
  - sides (one region, mirrored so both run front->back): a removable panel seam,
    a lower intake and an upper exhaust louvre bank;
  - back: a service panel seam, exhaust slots, a plain rating plate and a cable
    gland;
  - top: a lid seam (hidden in-game under the ledge).
  Every feature is at least ~6 px across: round 1's screws, plate print and paint
  chips were sub-pixel and only smeared. X/Y are quantised to 4-level steps with
  a flat dead zone.
* a base-colour map (palette PNG, 512 x 368, 200 px/m, the same layout), noise-free
  fills: the brand orange (#e65100, the delivered palette), seam and slot
  occlusion, a charcoal kick plate, the shaded alcove and steel drain plate, a
  soft floor grime fade, a faint lift on the rolled edges and a silver rating plate.
* both PNGs are palette images: the commonest 64 values plus farthest-point picks
  up to 256, so the worst fold is about 1 byte of colour and under 3 degrees of
  normal (printed by the build). This is what pays for 200 px/m colour in 12 KB.

Roughness is a constant satin 0.45 (paint), metallic 0. No vertex colours.

Atlas layout (200 px/m, 4 px gutters replicated from each face's edge): front | side | back | top (rotated 90 degrees). The bottom
face samples the top region (never seen).

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/station-slushie-machine.py -- <out.glb>

Re-runnable and deterministic. Writes only <out.glb>; textures
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
WIDTH, HEIGHT, DEPTH = 0.7, 1.8, 0.5
NODE_NAME = 'Station-slushie-machineBody'
MESH_NAME = 'station-slushie-machine-mesh'
MATERIAL_NAME = 'station-slushie-machine-surface'
SCENE_NAME = 'MillOS_World_Station-slushie-machine'

# Both maps: 200 px/m with 4 px edge-replicated gutters (same atlas layout).
N_SCALE, N_GUTTER = 200, 4
C_SCALE, C_GUTTER = 200, 4
SUPERSAMPLE = 3
KICK_H = 0.12  # kick plate height (0.06 m in-game after the 0.5 Y scale)
EDGE_R = 0.045  # radius of the painted rolled edge
EDGE_W = EDGE_R * math.sin(math.radians(45.0))  # each face carries the roll from 0 to 45 degrees
MAX_SLOPE = 2.5
NORMAL_STEP = 4  # byte levels per stored normal X/Y step

# Paint and trim, sRGB 0-255.
ORANGE = np.array([230, 82, 0], np.float32)
CHARCOAL = np.array([40, 41, 44], np.float32)
SLOT = np.array([24, 24, 26], np.float32)
STEEL = np.array([150, 155, 160], np.float32)
PLATE = np.array([188, 190, 193], np.float32)
GRIME = np.array([92, 64, 40], np.float32)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def rrect(a, b, cx, cy, hw, hh, r):
    """Signed distance to a rounded rectangle (negative inside), metres."""
    qx = np.abs(a - cx) - hw + r
    qy = np.abs(b - cy) - hh + r
    outside = np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))
    inside = np.minimum(np.maximum(qx, qy), 0.0)
    return outside + inside - r


def inside(sdf, ramp):
    """1 inside the shape, 0 outside, soft over `ramp` metres."""
    return smoothstep(ramp * 0.5, -ramp * 0.5, sdf)


def groove(sdf, half, depth):
    """Rounded V seam along the sdf zero line; returns (height, 0-1 depth)."""
    t = np.clip(1.0 - np.abs(sdf) / half, 0.0, 1.0)
    t = 0.5 - 0.5 * np.cos(math.pi * t)
    return -depth * t, t


def edge_bevel(a, b, fa, fb, floor_edge=True):
    """Rolled sheet-metal edge: an arc of radius EDGE_R that reaches exactly 45 degrees
    at the face border. The neighbouring face carries the other 45 degrees, so the
    two normals meet on the box diagonal and the corner shades as one continuous
    roll instead of a crease. floor_edge=False leaves the floor contact square."""
    e = np.minimum(np.minimum(a, fa - a), fb - b)
    if floor_edge:
        e = np.minimum(e, b)
    s = np.clip(EDGE_W - e, 0.0, EDGE_W)
    return np.sqrt(EDGE_R ** 2 - s ** 2) - EDGE_R


def edge_roll(a, b, fa, fb, floor_edge=True):
    """0 on the flat, 1 at the face border (for a faint highlight in the colour map)."""
    e = np.minimum(np.minimum(a, fa - a), fb - b)
    if floor_edge:
        e = np.minimum(e, b)
    return np.clip(1.0 - e / EDGE_W, 0.0, 1.0)


def louvre_bank(a, b, cx, hw, centres, hh):
    """Pressed louvres: each vane slopes up toward its hood, with a dark slit below."""
    h = np.zeros_like(a)
    slit = np.zeros_like(a)
    across = 1.0 - smoothstep(hw - 0.006, hw, np.abs(a - cx))
    for cy in centres:
        y = b - cy
        t = np.clip((y + hh) / (2 * hh), 0.0, 1.0)
        band = (1.0 - smoothstep(hh - 0.0015, hh + 0.0015, np.abs(y))) * across
        h += band * (-0.004 + 0.0065 * t)
        slit = np.maximum(slit, band * (1.0 - smoothstep(0.2, 0.45, t)))
    return h, slit


def kick_plate(b):
    t = smoothstep(KICK_H + 0.002, KICK_H - 0.002, b)
    return -0.006 * t, t


# ---------------------------------------------------------------- faces
# Each returns (height metres, masks dict) for face-local metres a (left->right
# seen from outside), b (bottom->top).
def masks(a, **kw):
    z = np.zeros_like(a)
    out = {k: z for k in ('kick', 'ao', 'slit', 'bay', 'bay_shadow', 'drip', 'plate', 'gland', 'grille_plate')}
    out.update(kw)
    return out


# Every feature below is at least ~6 px across in the 200 px/m maps; screws, rivets,
# plate print and paint chips were sub-pixel and only smeared, so they are gone.
SEAM_HALF, SEAM_DEPTH = 0.005, 0.0035


def face_front(a, b):
    fa, fb = WIDTH, HEIGHT
    h = edge_bevel(a, b, fa, fb, floor_edge=False)
    kh, kick = kick_plate(b)
    h += kh
    door_h, door_ao = groove(rrect(a, b, 0.35, 0.655, 0.29, 0.50, 0.02), SEAM_HALF, SEAM_DEPTH)
    h += door_h
    pull = inside(rrect(a, b, 0.35, 1.075, 0.09, 0.018, 0.016), 0.005)
    h -= 0.006 * pull
    grille_plate = inside(rrect(a, b, 0.35, 0.33, 0.22, 0.12, 0.012), 0.004)
    h += 0.0015 * grille_plate
    slots = np.zeros_like(a)
    for k in range(5):
        slots = np.maximum(slots, inside(rrect(a, b, 0.35, 0.25 + 0.04 * k, 0.19, 0.010, 0.010), 0.004))
    h -= 0.005 * slots
    bay_sdf = rrect(a, b, 0.35, 1.475, 0.29, 0.245, 0.035)
    bay = inside(bay_sdf, 0.008)
    h -= 0.010 * bay
    # Stainless drain plate on the alcove floor, under the runtime drip tray.
    drip = inside(rrect(a, b, 0.35, 1.29, 0.26, 0.045, 0.008), 0.004) * bay
    h += 0.003 * drip
    drip_slot = np.zeros_like(a)
    for k in range(2):
        drip_slot = np.maximum(drip_slot, inside(rrect(a, b, 0.35, 1.272 + 0.036 * k, 0.23, 0.007, 0.007), 0.003))
    drip_slot *= drip
    h -= 0.003 * drip_slot
    # Shadow under the alcove's top wall, fading down its back.
    bay_shadow = bay * (1.0 - smoothstep(0.0, 0.09, 1.72 - b))
    return h, masks(
        a,
        kick=kick,
        ao=np.maximum(door_ao * 0.55, pull * 0.8),
        slit=np.maximum(slots, drip_slot),
        bay=bay,
        bay_shadow=bay_shadow,
        drip=drip,
        grille_plate=grille_plate,
    ), fa, fb


def face_side(a, b):
    """a runs from the front edge (0) to the back edge (0.5) on both sides."""
    fa, fb = DEPTH, HEIGHT
    h = edge_bevel(a, b, fa, fb, floor_edge=False)
    kh, kick = kick_plate(b)
    h += kh
    panel_h, panel_ao = groove(rrect(a, b, 0.25, 0.96, 0.195, 0.79, 0.018), SEAM_HALF, SEAM_DEPTH)
    h += panel_h
    low_h, low_slit = louvre_bank(a, b, 0.25, 0.14, [0.30 + 0.045 * k for k in range(7)], 0.011)
    up_h, up_slit = louvre_bank(a, b, 0.25, 0.14, [1.43 + 0.045 * k for k in range(5)], 0.011)
    h += low_h + up_h
    return h, masks(a, kick=kick, ao=panel_ao * 0.55, slit=np.maximum(low_slit, up_slit)), fa, fb


def face_back(a, b):
    fa, fb = WIDTH, HEIGHT
    h = edge_bevel(a, b, fa, fb, floor_edge=False)
    kh, kick = kick_plate(b)
    h += kh
    panel_h, panel_ao = groove(rrect(a, b, 0.35, 0.74, 0.28, 0.55, 0.018), SEAM_HALF, SEAM_DEPTH)
    h += panel_h
    slots = np.zeros_like(a)
    for k in range(5):
        slots = np.maximum(slots, inside(rrect(a, b, 0.35, 1.44 + 0.05 * k, 0.24, 0.011, 0.011), 0.004))
    h -= 0.005 * slots
    # Plain rating plate with a raised rim (no print: it was sub-pixel).
    plate_sdf = rrect(a, b, 0.20, 1.14, 0.075, 0.045, 0.006)
    plate = inside(plate_sdf, 0.003)
    h += 0.0012 * plate
    r = np.hypot(a - 0.56, b - 0.26)
    ring = 1.0 - smoothstep(0.020, 0.024, r)
    hole = 1.0 - smoothstep(0.011, 0.014, r)
    h += 0.003 * ring - 0.006 * hole
    return h, masks(
        a,
        kick=kick,
        ao=panel_ao * 0.55,
        slit=slots,
        plate=plate,
        gland=np.maximum(ring * 0.6, hole),
    ), fa, fb


def face_top(a, b):
    """a along +X, b from the front edge to the back edge (hidden in-game)."""
    fa, fb = WIDTH, DEPTH
    h = edge_bevel(a, b, fa, fb)
    lid_h, lid_ao = groove(rrect(a, b, 0.35, 0.25, 0.29, 0.19, 0.025), SEAM_HALF, 0.0025)
    h += lid_h
    return h, masks(a, ao=lid_ao * 0.45), fa, fb


# Regions, left to right in the atlas: (name, face fn, face width m, face height m, rotated)
REGIONS = [
    ('front', face_front, WIDTH, HEIGHT, False),
    ('side', face_side, DEPTH, HEIGHT, False),
    ('back', face_back, WIDTH, HEIGHT, False),
    ('top', face_top, WIDTH, DEPTH, True),  # stored rotated: atlas x = b, atlas y = a
]


def atlas_layout(scale, gutter):
    """Pixel origin (x0, y0) of each region's face area, plus atlas size."""
    x = 0
    layout = {}
    for name, _fn, fa, fb, rot in REGIONS:
        w = round((fb if rot else fa) * scale)
        hgt = round((fa if rot else fb) * scale)
        layout[name] = (x + gutter, gutter, w, hgt)
        x += w + 2 * gutter
    height = round(HEIGHT * scale) + 2 * gutter
    return layout, x, height


def region_coords(fa, fb, rot, scale):
    """Supersampled face-local metre coords over the region's pixel grid (row 0 = bottom)."""
    w = round((fb if rot else fa) * scale)
    hgt = round((fa if rot else fb) * scale)
    sw, sh = w * SUPERSAMPLE, hgt * SUPERSAMPLE
    px = (np.arange(sw, dtype=np.float64) + 0.5) / (scale * SUPERSAMPLE)
    py = (np.arange(sh, dtype=np.float64) + 0.5) / (scale * SUPERSAMPLE)
    gx, gy = np.meshgrid(px, py)
    if rot:
        return gy, gx  # a runs up the atlas, b across it
    return gx, gy


def block_mean(arr):
    s = SUPERSAMPLE
    h, w = arr.shape[0] // s, arr.shape[1] // s
    return arr.reshape(h, s, w, s, *arr.shape[2:]).mean(axis=(1, 3))


def build_normal_pixels():
    layout, aw, ah = atlas_layout(N_SCALE, N_GUTTER)
    atlas = np.zeros((ah, aw, 3), np.float64)
    atlas[...] = (0.0, 0.0, 1.0)
    for name, fn, fa, fb, rot in REGIONS:
        a, b = region_coords(fa, fb, rot, N_SCALE)
        h, _m, _, _ = fn(a, b)
        step = 1.0 / (N_SCALE * SUPERSAMPLE)
        dh_dy, dh_dx = np.gradient(h, step, step)
        dh_dx = np.clip(dh_dx, -MAX_SLOPE, MAX_SLOPE)
        dh_dy = np.clip(dh_dy, -MAX_SLOPE, MAX_SLOPE)
        n = np.stack([-dh_dx, -dh_dy, np.ones_like(h)], axis=-1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        n = block_mean(n)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        x0, y0, w, hgt = layout[name]
        g = N_GUTTER
        atlas[y0 - g:y0 + hgt + g, x0 - g:x0 + w + g] = np.pad(n, ((g, g), (g, g), (0, 0)), mode='edge')
    # Quantise X/Y to NORMAL_STEP byte levels around 128 (under 1 degree of
    # error) with a flat dead zone, then rebuild Z: the PNG then stores runs
    # instead of anti-aliasing jitter, which is what the 12 KB budget needs.
    xy = (atlas[..., :2] * 127.5) / NORMAL_STEP
    xy = np.where(np.abs(xy) < 0.75, 0.0, np.round(xy)) * NORMAL_STEP / 127.5
    z = np.sqrt(np.clip(1.0 - (xy ** 2).sum(axis=-1), 0.0, 1.0))
    q = np.concatenate([xy, z[..., None]], axis=-1)
    return np.clip(np.round(q * 127.5 + 127.5), 0, 255).astype(np.uint8), (aw, ah)


def face_colour(name, fn, fa, fb, rot, a, b):
    """Noise-free fills (the colour map is a PNG and the budget is 12 KB)."""
    _h, m, _, _ = fn(a, b)
    rgb = np.broadcast_to(ORANGE, a.shape + (3,)).copy()
    if name != 'top':
        # Floor grime above the kick plate: a smooth vertical fade.
        grime = (1.0 - smoothstep(KICK_H, KICK_H + 0.16, b)) * (b > KICK_H) * 0.16
        rgb = rgb * (1 - grime[..., None]) + GRIME * grime[..., None]
    # Raised grille plate a touch lighter (fresh press), seams and pulls occluded.
    rgb *= (1.0 + 0.04 * m['grille_plate'])[..., None]
    rgb *= (1.0 - m['ao'])[..., None]
    # Rolled edge: the paint thins a touch where the sheet turns the corner.
    roll = edge_roll(a, b, fa, fb, floor_edge=(name == 'top'))
    rgb = rgb * (1.0 + 0.05 * roll ** 2)[..., None]
    # Kick plate.
    rgb = rgb * (1 - m['kick'][..., None]) + CHARCOAL * m['kick'][..., None]
    # Dispense alcove: orange in shade, darker under its top wall; steel drain plate.
    bay = m['bay']
    alcove = ORANGE * (0.80 * (1.0 - 0.40 * m['bay_shadow']))[..., None]
    rgb = rgb * (1 - bay[..., None]) + alcove * bay[..., None]
    drip = m['drip']
    rgb = rgb * (1 - drip[..., None]) + STEEL * drip[..., None]
    # Slots and slits.
    rgb = rgb * (1 - m['slit'][..., None]) + SLOT * m['slit'][..., None]
    # Rating plate, cable gland.
    rgb = rgb * (1 - m['plate'][..., None]) + PLATE * m['plate'][..., None]
    rgb = rgb * (1 - m['gland'][..., None]) + SLOT * m['gland'][..., None]
    return rgb


def build_colour_pixels():
    layout, aw, ah = atlas_layout(C_SCALE, C_GUTTER)
    atlas = np.broadcast_to(ORANGE, (ah, aw, 3)).copy().astype(np.float64)
    for name, fn, fa, fb, rot in REGIONS:
        a, b = region_coords(fa, fb, rot, C_SCALE)
        rgb = block_mean(face_colour(name, fn, fa, fb, rot, a, b))
        x0, y0, w, hgt = layout[name]
        g = C_GUTTER
        atlas[y0 - g:y0 + hgt + g, x0 - g:x0 + w + g] = np.pad(rgb, ((g, g), (g, g), (0, 0)), mode='edge')
    return np.clip(np.round(atlas), 0, 255).astype(np.uint8), (aw, ah)


def write_png(path, rgb):
    """Minimal RGB8 PNG writer (array row 0 = bottom), per-row filter choice."""
    rows = rgb[::-1].astype(np.int16)
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
        sub = line - left
        up = line - prev
        avg = line - (left + prev) // 2
        p = left + prev - upleft
        pa, pb, pc = np.abs(p - left), np.abs(p - prev), np.abs(p - upleft)
        pred = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, prev, upleft))
        paeth = line - pred
        candidates = [(0, line), (1, sub), (2, up), (3, avg), (4, paeth)]
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


def write_png_indexed(path, rgb, normal=False):
    """Palette PNG (colour type 3, array row 0 = bottom). Both maps are flat fills or
    quantised normals, so they hold a few hundred distinct values. The palette keeps
    the 64 commonest, then adds farthest-point picks (k-centre) up to 256, so no value
    is folded far: the worst fold error is returned (byte distance for colour,
    degrees for a normal map) and printed with the build."""
    flat = rgb[::-1].reshape(-1, 3)
    uniq, inv, cnt = np.unique(flat, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    vec = uniq.astype(np.float64)
    if normal:
        vec = (vec - 127.5) / 127.5
        vec /= np.linalg.norm(vec, axis=1, keepdims=True)

        def dist(p, q):
            return np.degrees(np.arccos(np.clip(p @ q.T, -1.0, 1.0)))
    else:
        def dist(p, q):
            return np.sqrt(((p[:, None, :] - q[None, :, :]) ** 2).sum(-1))

    order = np.lexsort((uniq[:, 2], uniq[:, 1], uniq[:, 0], -cnt))  # deterministic: count, then value
    keep = [int(i) for i in order[:min(64, len(uniq))]]
    dmin = dist(vec, vec[keep]).min(1)
    while len(keep) < min(256, len(uniq)):
        i = int(dmin.argmax())
        keep.append(i)
        dmin = np.minimum(dmin, dist(vec, vec[[i]])[:, 0])
    d = dist(vec, vec[keep])
    nearest = d.argmin(1)
    err = float(d.min(1).max())
    palette = uniq[keep].astype(np.uint8)
    idx = nearest[inv].astype(np.uint8).reshape(rgb.shape[0], rgb.shape[1])
    raw = b''.join(b'\x00' + idx[r].tobytes() for r in range(idx.shape[0]))

    def chunk(tag, payload):
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)

    h, w = idx.shape
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0))
    png += chunk(b'PLTE', palette.tobytes())
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    return len(uniq), err


# ---------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    return scene


def build_mesh():
    """One closed 12-triangle box. Blender Z-up: glTF +Z front = Blender -Y."""
    hx, hy = WIDTH / 2, DEPTH / 2
    bm = bmesh.new()
    corners = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (0, 1):
                corners[(sx, sy, sz)] = bm.verts.new((sx * hx, sy * hy, sz * HEIGHT))

    def face(keys):
        return bm.faces.new([corners[k] for k in keys])

    faces = {
        'front': face([(-1, -1, 0), (1, -1, 0), (1, -1, 1), (-1, -1, 1)]),
        'back': face([(1, 1, 0), (-1, 1, 0), (-1, 1, 1), (1, 1, 1)]),
        'right': face([(1, -1, 0), (1, 1, 0), (1, 1, 1), (1, -1, 1)]),
        'left': face([(-1, 1, 0), (-1, -1, 0), (-1, -1, 1), (-1, 1, 1)]),
        'top': face([(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
        'bottom': face([(-1, 1, 0), (1, 1, 0), (1, -1, 0), (-1, -1, 0)]),
    }
    bm.normal_update()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    layout, aw, ah = atlas_layout(N_SCALE, N_GUTTER)

    def uv_of(region, a, b):
        x0, y0, _w, _h = layout[region]
        rot = region == 'top'
        px, py = (b, a) if rot else (a, b)
        return ((x0 + px * N_SCALE) / aw, (y0 + py * N_SCALE) / ah)

    for name, f in faces.items():
        for loop in f.loops:
            x, y, z = loop.vert.co
            front_t = y + hy  # 0 at the front face, DEPTH at the back
            if name == 'front':
                uv = uv_of('front', x + hx, z)
            elif name == 'back':
                uv = uv_of('back', hx - x, z)
            elif name in ('right', 'left'):
                uv = uv_of('side', front_t, z)  # left is mirrored so both run front->back
            elif name == 'top':
                uv = uv_of('top', x + hx, front_t)
            else:
                uv = uv_of('top', x + hx, DEPTH - front_t)
            loop[uv_layer].uv = uv

    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed box: export single-sided
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.45

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'station-slushie-machine-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'station-slushie-machine-normal'
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
        raise SystemExit('usage: blender -b --factory-startup -P station-slushie-machine.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    scene = reset_scene()
    stage = tempfile.mkdtemp(prefix='station-slushie-machine-')
    try:
        colour_path = os.path.join(stage, 'station-slushie-machine-colour.png')
        normal_path = os.path.join(stage, 'station-slushie-machine-normal.png')
        colour, csize = build_colour_pixels()
        normal, nsize = build_normal_pixels()
        c_uniq, c_err = write_png_indexed(colour_path, colour)
        n_uniq, n_err = write_png_indexed(normal_path, normal, normal=True)
        print(f'SLUSH_TEXTURES colour {csize} {os.path.getsize(colour_path)} B ({c_uniq} values, fold {c_err:.1f}), '
              f'normal {nsize} {os.path.getsize(normal_path)} B ({n_uniq} values, fold {n_err:.2f} deg)')

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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/station-slushie-machine.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'STATION_SLUSHIE_MACHINE_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
