"""Dock leveler lip (world-dock-leveler-lip), built from scratch in headless Blender.

What it builds
--------------
The hinged steel lip that swings out from the dock leveler deck onto the trailer
bed: 8 m wide x 0.1 m thick x 0.3 m deep as delivered (the game scales it to
2.38 x 0.05 x 0.15 m, see DOCK_LEVELER_LIP in src/components/truckbay/
dockApronLayout.ts), origin at the underside centre, three.js -Z = hinge edge,
+Z = free (leading) edge. TruckBay.tsx places the GLB at +depth/2 inside the
lip group whose origin is the hinge axis, so GLB z = -0.15 sits on the hinge.

The contract allows 36 render vertices, so the geometry is one 12-triangle
hexahedron. Its cross-section is not a rectangle: the top face tapers from the
full 0.10 m at the hinge to 0.045 m at the leading edge, so the lip reads as a
tapered plate in the end and three-quarter views (clay included). The underside
stays flat on y = 0. Everything else is carried by the two allowed textures,
which tile once per metre along the width (sampler REPEAT, 8 tiles):

* a tangent-space normal map derived from height fields in real metres
  (normalTexture.scale = 1): a rounded hinge barrel along the whole rear edge
  (top, back and underside), broken into knuckles every 0.5 m with the pin
  showing in each gap; a weld seam where the barrel meets the plate; a
  diamond-plate tread field (staggered lugs whose pitch, 0.1 x 0.055 m, becomes
  near-square diamond plate at the installed scale); a toe bevel and rounded
  nose along the leading edge; and on the end caps, the plate section with a
  chamfered border and the barrel end with its pin cap;
* a base-colour map: slate paint (lifted well off the delivered near-black),
  lug tops and the toe worn to bare steel, worn knuckle crests, grease and
  shadow in the knuckle gaps, a scuffed bare-steel nose, light grime.

Atlas rows (bottom to top): end caps, underside, nose face, hinge face, top.
Each band has edge-replicated gutters so mip filtering does not mix faces.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/dock-leveler-lip.py -- <out.glb>

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
WIDTH, HEIGHT, DEPTH = 8.0, 0.10, 0.30
TOE_HEIGHT = 0.045  # top face tapers from HEIGHT at the hinge to this at the nose
NODE_NAME = 'Dock-leveler-lipBody'
MESH_NAME = 'dock-leveler-lip-mesh'
MATERIAL_NAME = 'dock-leveler-lip-surface'
SCENE_NAME = 'MillOS_World_Dock-leveler-lip'

# One texture tile spans TILE metres of width; the lip carries WIDTH / TILE tiles.
TILE = 1.0
TEX_W = 256
SUPERSAMPLE = 3
GUTTER = 3
COLOUR_QUALITY = 80
NORMAL_QUALITY = 76

# Hinge: barrel radius (full thickness at the hinge), knuckles every 0.5 m,
# centred on the tile edge so each end of the lip finishes on a half knuckle.
BARREL_R = HEIGHT / 2
KNUCKLE_PITCH = 0.5
KNUCKLE_HALF = 0.16
PIN_R = 0.016
END_U0 = 0.05  # where the end-cap section starts inside its band (metres = U)

# Tread: staggered lugs, alternating orientation.
TREAD_PX, TREAD_PZ = 0.1, 0.055
LUG_HALF, LUG_R, LUG_H = 0.030, 0.0095, 0.0045
TOE_BEVEL = 0.05

# Paint and metal, sRGB 0-255.
PAINT = np.array([100, 110, 124], np.float32)
STEEL = np.array([170, 172, 174], np.float32)
DARK = np.array([38, 39, 42], np.float32)
GRIME = np.array([74, 70, 64], np.float32)
RUST = np.array([128, 98, 78], np.float32)

MAX_SLOPE = 2.6


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def periodic_noise(x, y, cells_x, cells_y, seed):
    """Seeded smooth value noise, periodic in x over one tile (x in metres, [0, TILE))."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells_y + 2, cells_x)).astype(np.float32)
    gx = (x / TILE) * cells_x
    gy = np.clip(y, 0.0, 1.0) * cells_y
    ix = np.floor(gx).astype(np.int32)
    iy = np.floor(gy).astype(np.int32)
    fx = gx - ix
    fy = gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x0 = ix % cells_x
    x1 = (ix + 1) % cells_x
    a = grid[iy, x0]
    b = grid[iy, x1]
    c = grid[iy + 1, x0]
    d = grid[iy + 1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def block_mean(a):
    s = SUPERSAMPLE
    h, w = a.shape[0] // s, a.shape[1] // s
    return a.reshape(h, s, w, s, *a.shape[2:]).mean(axis=(1, 3))


def knuckle_mask(x):
    """1 on a hinge knuckle, 0 in the gap between knuckles, soft 8 mm ends."""
    d = np.abs(((x + KNUCKLE_PITCH / 2) % KNUCKLE_PITCH) - KNUCKLE_PITCH / 2)
    return 1.0 - smoothstep(KNUCKLE_HALF - 0.008, KNUCKLE_HALF + 0.004, d)


def barrel_drop(dist):
    """How far a cylinder of BARREL_R falls below its crest at `dist` from the crest line."""
    t = np.clip(dist / BARREL_R, 0.0, 0.985)
    return BARREL_R * (1.0 - np.sqrt(1.0 - t * t))


def top_y(q):
    """Top surface height at Blender y = q (q = -0.15 nose, +0.15 hinge)."""
    return TOE_HEIGHT + (HEIGHT - TOE_HEIGHT) * (q + DEPTH / 2) / DEPTH


# ---------------------------------------------------------------- bands
# Each band function takes metre grids (x along the width inside one tile, s
# along the face's V direction) and returns (height, layers) where layers are
# masks the colour pass reads. s directions (Blender axes; glTF z = -Blender y):
#   top, bottom: s = Blender y + 0.15, 0 at the nose, 0.30 at the hinge
#   back (hinge face), front (nose face): s = height above the underside
#   ends: x = U inside the tile (section from END_U0), s = height


def hinge_strip(x, dist_from_edge):
    """Barrel rounding seen on the top or underside, dist measured from the rear edge."""
    k = knuckle_mask(x)
    # On a knuckle: the barrel's quarter-round falling away to the rear edge.
    on = -barrel_drop(np.clip(BARREL_R - dist_from_edge, 0.0, None))
    # Weld seam where the barrel meets the plate.
    seam = -0.004 * np.exp(-((dist_from_edge - (BARREL_R + 0.006)) / 0.004) ** 2)
    # In a gap: the plate stops short, the pin shows in the recess.
    in_recess = 1.0 - smoothstep(BARREL_R - 0.004, BARREL_R + 0.002, dist_from_edge)
    pin = np.sqrt(np.clip(1.0 - ((dist_from_edge - BARREL_R * 0.5) / PIN_R) ** 2, 0.0, 1.0))
    gap = in_recess * (-0.035 + 0.02 * pin)
    h = k * (on + seam) + (1 - k) * (gap + seam * (1 - in_recess))
    crest = k * np.exp(-((dist_from_edge - BARREL_R) / 0.012) ** 2)
    gap_mask = (1 - k) * in_recess
    pin_mask = gap_mask * (pin > 0.2)
    seam_mask = np.exp(-((dist_from_edge - (BARREL_R + 0.006)) / 0.004) ** 2)
    return h, {'crest': crest, 'gap': gap_mask, 'pin': pin_mask, 'seam': seam_mask}


def band_top(x, s):
    dist_hinge = DEPTH - s
    h, hl = hinge_strip(x, dist_hinge)
    # Toe bevel: a 50 mm ramp down to the nose, rounded at the very edge.
    bevel_t = np.clip((TOE_BEVEL - s) / TOE_BEVEL, 0.0, 1.0)
    bevel = -0.016 * bevel_t ** 1.3 - 0.006 * smoothstep(0.012, 0.0, s)
    h = h + bevel
    # Tread field between the toe bevel and the weld seam.
    field = smoothstep(TOE_BEVEL + 0.002, TOE_BEVEL + 0.012, s) * (
        1 - smoothstep(DEPTH - BARREL_R - 0.03, DEPTH - BARREL_R - 0.018, s)
    )
    s0 = TOE_BEVEL + 0.008
    i = np.floor(x / TREAD_PX)
    j = np.floor((s - s0) / TREAD_PZ)
    lx = (x % TREAD_PX) - TREAD_PX / 2
    lz = ((s - s0) % TREAD_PZ) - TREAD_PZ / 2
    sign = np.where(((i + j) % 2) == 0, 1.0, -1.0)
    diag = math.hypot(TREAD_PX, TREAD_PZ)
    dx, dz = TREAD_PX / diag, TREAD_PZ / diag
    a = lx * dx + lz * dz * sign
    b = -lx * dz * sign + lz * dx
    r_eff = LUG_R * np.sqrt(np.clip(1.0 - (a / (LUG_HALF + LUG_R)) ** 2, 0.0, 1.0))
    lug = np.sqrt(np.clip(1.0 - (b / np.maximum(r_eff, 1e-5)) ** 2, 0.0, 1.0)) * (r_eff > 1e-4)
    h = h + LUG_H * lug * field
    layers = dict(hl)
    layers['lug'] = lug * field
    layers['bevel'] = smoothstep(TOE_BEVEL + 0.004, TOE_BEVEL - 0.006, s)
    layers['nose'] = smoothstep(0.012, 0.0, s)
    return h, layers


def band_bottom(x, s):
    dist_hinge = DEPTH - s
    h, hl = hinge_strip(x, dist_hinge)
    h = h - 0.005 * smoothstep(0.010, 0.0, s)  # nose underside edge
    layers = dict(hl)
    layers['nose'] = smoothstep(0.010, 0.0, s)
    return h, layers


def band_back(x, s):
    """Hinge face: the barrel across the full thickness, broken into knuckles."""
    k = knuckle_mask(x)
    off = np.abs(s - BARREL_R)
    barrel = -barrel_drop(off)
    pin = np.sqrt(np.clip(1.0 - (off / PIN_R) ** 2, 0.0, 1.0))
    gap = -0.04 + 0.03 * pin
    h = k * barrel + (1 - k) * gap
    crest = k * np.exp(-(off / 0.018) ** 2)
    gap_mask = 1 - k
    return h, {'crest': crest, 'gap': gap_mask, 'pin': gap_mask * (pin > 0.2), 'edge': smoothstep(0.03, 0.05, off) * k}


def band_front(x, s):
    """Nose face, TOE_HEIGHT tall: rounded top and bottom edges."""
    top = smoothstep(TOE_HEIGHT - 0.012, TOE_HEIGHT, s)
    bot = smoothstep(0.008, 0.0, s)
    h = -0.008 * top ** 1.5 - 0.004 * bot ** 1.5
    return h, {'top': top, 'bot': bot}


def band_ends(x, s):
    """End caps: the plate section (tapered), chamfered border, barrel end and pin cap."""
    q = np.clip(x - END_U0, 0.0, DEPTH) - DEPTH / 2  # Blender y
    yt = top_y(q)
    # Distance inside the section outline (nose face, underside, sloped top, hinge face).
    d_nose = q + DEPTH / 2
    d_hinge = DEPTH / 2 - q
    slope = (HEIGHT - TOE_HEIGHT) / DEPTH
    d_top = (yt - s) / math.sqrt(1 + slope * slope)
    d_edge = np.minimum.reduce([d_nose, d_hinge, s, d_top])
    border = -0.006 * smoothstep(0.009, 0.0, d_edge)
    # Barrel end: centred BARREL_R in from the hinge face, at mid thickness.
    rr = np.sqrt((d_hinge - BARREL_R) ** 2 + (s - BARREL_R) ** 2)
    ring = -0.004 * np.exp(-((rr - (BARREL_R - 0.004)) / 0.003) ** 2)
    dome = 0.004 * np.sqrt(np.clip(1.0 - (rr / (BARREL_R - 0.006)) ** 2, 0.0, 1.0))
    cap = 0.003 * np.sqrt(np.clip(1.0 - (rr / (PIN_R + 0.004)) ** 2, 0.0, 1.0))
    h = border + ring + dome + cap
    return h, {
        'barrel': (rr < BARREL_R - 0.004).astype(np.float32),
        'cap': (rr < PIN_R + 0.004).astype(np.float32),
        'border': smoothstep(0.009, 0.0, d_edge),
    }


# Band name, face extent along V (metres), rows in the atlas, function.
BANDS = [
    ('ends', HEIGHT, 26, band_ends),
    ('bottom', DEPTH, 40, band_bottom),
    ('front', TOE_HEIGHT, 16, band_front),
    ('back', HEIGHT, 30, band_back),
    ('top', DEPTH, 62, band_top),
]


def band_layout():
    """Row offset of each band's content, with GUTTER rows either side."""
    layout, row = {}, 0
    for name, extent, rows, fn in BANDS:
        row += GUTTER
        layout[name] = (row, rows, extent, fn)
        row += rows + GUTTER
    return layout, row


LAYOUT, TEX_H = band_layout()


def band_grid(rows, extent):
    sw, sh = TEX_W * SUPERSAMPLE, rows * SUPERSAMPLE
    x = (np.arange(sw, dtype=np.float32) + 0.5) / sw * TILE
    s = (np.arange(sh, dtype=np.float32) + 0.5) / sh * extent
    return np.meshgrid(x, s)


def band_normals(h, rows, extent):
    dx = TILE / h.shape[1]
    ds = extent / h.shape[0]
    dh_dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * dx)  # periodic along the width
    dh_ds = np.gradient(h, ds, axis=0)
    mag = np.sqrt(dh_dx ** 2 + dh_ds ** 2)
    scale = np.where(mag > MAX_SLOPE, MAX_SLOPE / np.maximum(mag, 1e-6), 1.0)
    n = np.stack([-dh_dx * scale, -dh_ds * scale, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def mix(rgb, colour, amount):
    a = np.clip(amount, 0.0, 1.0)[..., None]
    return rgb * (1 - a) + colour * a


def band_colour(name, x, s, layers):
    u01 = x / TILE
    mottle = 1.0 + (periodic_noise(x, s / 0.3, 16, 3, 7) - 0.5) * 0.10
    fine = 1.0 + (periodic_noise(x, s / 0.3, 96, 12, 13) - 0.5) * 0.06
    rgb = np.broadcast_to(PAINT, x.shape + (3,)).copy() * (mottle * fine)[..., None]
    wear_noise = periodic_noise(x, s / 0.3, 40, 8, 21)
    grime_noise = periodic_noise(x, s / 0.3, 24, 4, 31)

    if name == 'top':
        # Lug tops scuffed to bare metal, harder toward the nose where wheels land.
        toward_nose = 1.0 - np.clip(s / DEPTH, 0.0, 1.0)
        lug_wear = layers['lug'] ** 2 * (0.35 + 0.45 * toward_nose) * (0.6 + 0.6 * wear_noise)
        rgb = mix(rgb, STEEL, lug_wear)
        rgb *= (1.0 - 0.12 * (1 - layers['lug']) * smoothstep(0.06, 0.25, s))[..., None]  # valley dirt
        # Toe bevel worn bright, paint surviving in patches; rust bloom on the nose.
        rgb = mix(rgb, STEEL * 0.95, layers['bevel'] * (0.55 + 0.4 * wear_noise))
        rgb = mix(rgb, RUST, layers['nose'] * 0.25 * grime_noise)
        rgb = mix(rgb, STEEL * 1.05, layers['nose'] * 0.5)
    if name in ('top', 'bottom'):
        rgb = mix(rgb, STEEL * 0.92, layers['crest'] * (0.45 + 0.35 * wear_noise))
        rgb *= (1.0 - 0.35 * layers['seam'])[..., None]
        rgb = mix(rgb, DARK, layers['gap'] * 0.92)
        rgb = mix(rgb, STEEL * 0.62, layers['pin'])
    if name == 'bottom':
        rgb = mix(rgb, GRIME, 0.25 + 0.2 * grime_noise)
        rgb = mix(rgb, STEEL * 0.85, layers['nose'] * 0.5)
    if name == 'back':
        rgb = mix(rgb, STEEL * 0.92, layers['crest'] * (0.5 + 0.35 * wear_noise))
        rgb *= (1.0 - 0.18 * layers['edge'])[..., None]
        rgb = mix(rgb, DARK, layers['gap'] * 0.92)
        rgb = mix(rgb, STEEL * 0.62, layers['pin'])
    if name == 'front':
        # The nose rides on trailer beds: bare scuffed steel with long scratches.
        scratch = periodic_noise(x, s / TOE_HEIGHT, 128, 3, 41)
        rgb = mix(rgb, STEEL, 0.75 + 0.15 * wear_noise)
        rgb *= (0.88 + 0.16 * scratch)[..., None]
        rgb = mix(rgb, RUST, 0.18 * grime_noise * layers['bot'])
        rgb *= (1.0 - 0.18 * layers['bot'])[..., None]
        rgb = mix(rgb, STEEL * 1.08, layers['top'] * 0.6)
    if name == 'ends':
        rgb *= 0.92
        rgb = mix(rgb, STEEL * 0.9, layers['border'] * 0.55)
        rgb = mix(rgb, STEEL * 0.70, layers['barrel'])
        rgb = mix(rgb, STEEL * 1.0, layers['cap'])
    del u01
    return rgb


def build_textures():
    normal = np.zeros((TEX_H, TEX_W, 3), np.float32)
    colour = np.zeros((TEX_H, TEX_W, 3), np.float32)
    normal[..., 2] = 1.0
    for name, (row, rows, extent, fn) in LAYOUT.items():
        x, s = band_grid(rows, extent)
        h, layers = fn(x, s)
        n = block_mean(band_normals(h, rows, extent))
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        c = block_mean(band_colour(name, x, s, layers))
        if name == 'ends':
            # Outside the section's U span, repeat its edge columns (bleed guard).
            u = (np.arange(TEX_W) + 0.5) / TEX_W * TILE
            lo = int(np.searchsorted(u, END_U0))
            hi = int(np.searchsorted(u, END_U0 + DEPTH))
            for arr in (n, c):
                arr[:, :lo] = arr[:, lo:lo + 1]
                arr[:, hi:] = arr[:, hi - 1:hi]
        normal[row:row + rows] = n
        colour[row:row + rows] = c
        for g in range(1, GUTTER + 1):
            normal[row - g] = n[0]
            colour[row - g] = c[0]
            normal[row + rows - 1 + g] = n[-1]
            colour[row + rows - 1 + g] = c[-1]
    normal_px = np.clip(np.round((normal * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    colour_px = np.clip(np.round(colour), 0, 255).astype(np.uint8)
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
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    return scene


def band_v(name, s):
    row, rows, extent, _ = LAYOUT[name]
    return (row + rows * np.clip(s / extent, 0.0, 1.0)) / TEX_H


def build_mesh():
    """One 12-triangle hexahedron, tapered section. Blender Z-up: glTF +Z (nose) = Blender -Y."""
    hx, hq = WIDTH / 2, DEPTH / 2
    bm = bmesh.new()
    corners = {}
    for sx in (-1, 1):
        for sq in (-1, 1):  # -1 nose, +1 hinge
            corners[(sx, sq, 0)] = bm.verts.new((sx * hx, sq * hq, 0.0))
            corners[(sx, sq, 1)] = bm.verts.new((sx * hx, sq * hq, HEIGHT if sq > 0 else TOE_HEIGHT))

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

    for name, f in faces.items():
        for loop in f.loops:
            x, q, z = loop.vert.co
            u = (x + hx) / TILE
            if name == 'top':
                uv = (u, band_v('top', q + hq))
            elif name == 'bottom':
                uv = (u, band_v('bottom', q + hq))
            elif name == 'back':
                uv = (u, band_v('back', z))
            elif name == 'front':
                uv = (u, band_v('front', z))
            else:  # end caps: the section, nose at END_U0, hinge at END_U0 + DEPTH
                uv = ((END_U0 + q + hq) / TILE, band_v('ends', z))
            loop[uv_layer].uv = (float(uv[0]), float(uv[1]))

    mesh = bpy.data.meshes.new(MESH_NAME)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    return mesh


def build_material(colour_path, normal_path):
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # closed solid: export single-sided
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.55

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'dock-leveler-lip-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'dock-leveler-lip-normal'
    normal_img.colorspace_settings.is_data = True

    colour_node = nodes.new('ShaderNodeTexImage')
    colour_node.image = colour_img
    colour_node.extension = 'REPEAT'
    colour_node.interpolation = 'Linear'
    links.new(colour_node.outputs['Color'], bsdf.inputs['Base Color'])

    normal_tex = nodes.new('ShaderNodeTexImage')
    normal_tex.image = normal_img
    normal_tex.extension = 'REPEAT'
    normal_tex.interpolation = 'Linear'
    normal_map = nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value = 1.0
    links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender -b --factory-startup -P dock-leveler-lip.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    scene = reset_scene()
    stage = tempfile.mkdtemp(prefix='dock-leveler-lip-')
    try:
        colour_px, normal_px = build_textures()
        colour_path = os.path.join(stage, 'dock-leveler-lip-colour.jpg')
        normal_path = os.path.join(stage, 'dock-leveler-lip-normal.jpg')
        write_jpeg(colour_path, colour_px, COLOUR_QUALITY, 'dock-leveler-lip-colour-stage')
        write_jpeg(normal_path, normal_px, NORMAL_QUALITY, 'dock-leveler-lip-normal-stage')

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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/dock-leveler-lip.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'DOCK_LEVELER_LIP_WROTE {out_path} {os.path.getsize(out_path)} bytes {TEX_W}x{TEX_H}')


main()
