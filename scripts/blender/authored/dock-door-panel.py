"""Dock door leaf (world-dock-door-panel), built from scratch in headless Blender.

What it builds
--------------
One sectional dock door leaf, 9 m wide x 4 m tall x 0.15 m thick, origin at the
bottom centre, +Z (three.js) front. The asset contract allows 36 render
vertices (= 36 indices), so the geometry is one closed 12-triangle hexahedron.
It is spent on the edges rather than a plain box: the back face holds the full
9 x 4 extents and the front face is inset by EDGE_INSET on the two ends and the
top, so the ends and the top are bevelled faces that run the full depth and
mitre at the top corners (every face stays planar: each has a parallel front
and back edge). The bottom stays square and flush with the ground, where the
seal sits. Panel features are carried by the two allowed textures, the way the
runtime's procedural leaf does it (src/components/truckbay/sectionalDoor.ts:
"PAINTED, NOT MODELLED" - modelled 6-30 mm joints break into rows of dots at
yard distance):

* a tangent-space normal map (PNG, NORMAL_W x NORMAL_H) of a height field in
  real metres (normalTexture.scale = 1). Everything in it varies only with
  height, so it is a narrow column: seven 0.571 m sections joined by recessed
  rounded hinge joints with a lit lip under each, two pressed bands per section,
  a rubber bulb bottom seal and an aluminium bottom rail. The extreme top and
  bottom rows are flat because the top and bottom faces sample them. The end
  bevels sample the same rows, so the joint profile wraps round the end stile
  as it does on a real door.
* a base-colour map (JPEG, COLOUR_W x COLOUR_H): slate paint with crisp joint
  shadow and lit lip lines, a stepped tint per section, galvanised end-stile
  strips with rivets, an aluminium bottom rail over a black rubber seal, an
  aluminium top cap (which the top bevel shows), two black lift handles, streaky
  road-film splash with spatter, thin drips under the joints and sharp pallet
  scrapes. The outer SIDE_BAND texels on each side
  are the end stiles' own strip (galvanised, joint ticks the full height,
  rubber foot, aluminium cap); the bevelled end faces sample its centre and the
  front face's u range skips it, so the band is a full JPEG block wide and
  survives mipmapping.

Constants mirror sectionalDoor.ts (7 sections, 0.11 m bands) so the asset and
the in-game leaf describe the same door.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/dock-door-panel.py -- <out.glb>

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
WIDTH, HEIGHT, DEPTH = 9.0, 4.0, 0.15
SECTIONS = 7
PITCH = HEIGHT / SECTIONS
NODE_NAME = 'Dock-door-panelBody'
MESH_NAME = 'dock-door-panel-mesh'
MATERIAL_NAME = 'dock-door-panel-surface'
SCENE_NAME = 'MillOS_World_Dock-door-panel'

# Front face inset on the two ends and the top: the bevel the end stiles and
# the top cap show. The back face keeps the full envelope (the bounds).
EDGE_INSET = 0.07
FRONT_HALF_W = WIDTH / 2 - EDGE_INSET
FRONT_TOP = HEIGHT - EDGE_INSET

# Texture sizes. The normal map is a column (it only varies with height).
NORMAL_W, NORMAL_H = 4, 1024
COLOUR_W, COLOUR_H = 1024, 512
SIDE_BAND = 16  # colour texels on each side reserved for the bevelled end faces
SUPERSAMPLE = 3
JPEG_QUALITY = 70

# Paint and trim, sRGB 0-255.
PAINT = np.array([104, 121, 140], np.float32)  # slate, the delivered hue
GRIME = np.array([78, 72, 62], np.float32)
RUBBER = np.array([30, 31, 34], np.float32)
RAIL = np.array([168, 172, 175], np.float32)  # extruded aluminium bottom rail
GALV = np.array([146, 151, 153], np.float32)  # galvanised end stile
HANDLE = np.array([36, 38, 41], np.float32)
SCRAPE = np.array([178, 182, 184], np.float32)

SEAL_TOP = 0.05  # rubber seal, ground to here
RAIL_TOP = 0.115  # aluminium rail above the seal
CAP_H = 0.035  # top cap band on the front face
STILE_W = 0.075  # galvanised end-stile strip on the front face
HANDLE_CENTRES = (-1.25, 1.25)
HANDLE_Y = PITCH * 0.55
FLAT_BOTTOM = 0.016  # normal rows the bottom face samples
FLAT_TOP = 0.03  # normal rows the top face samples (inside the cap)


# ---------------------------------------------------------------- helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def soft_box(v, centre, half, ramp):
    """1 inside |v - centre| < half, falling to 0 over `ramp` outside it."""
    return 1.0 - smoothstep(half, half + ramp, np.abs(v - centre))


def hard_box(v, centre, half):
    """Crisp box; antialiasing comes from the supersample."""
    return (np.abs(v - centre) < half).astype(np.float32)


def value_noise(x, y, cells_x, cells_y, seed):
    """Seeded smooth value noise in [0,1] over x in [0,1], y in [0,1]."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells_y + 2, cells_x + 2)).astype(np.float32)
    gx = np.clip(x, 0.0, 1.0) * cells_x
    gy = np.clip(y, 0.0, 1.0) * cells_y
    ix = np.floor(gx).astype(np.int32)
    iy = np.floor(gy).astype(np.int32)
    fx = gx - ix
    fy = gy - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = grid[iy, ix]
    b = grid[iy, ix + 1]
    c = grid[iy + 1, ix]
    d = grid[iy + 1, ix + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def block_mean(a):
    s = SUPERSAMPLE
    h, w = a.shape[0] // s, a.shape[1] // s
    return a.reshape(h, s, w, s, *a.shape[2:]).mean(axis=(1, 3))


def joint_heights():
    return [PITCH * k for k in range(1, SECTIONS)]


# ---------------------------------------------------------------- height (normal map)
def height_profile(y):
    """Relief in metres as a function of height only."""
    h = np.zeros_like(y)
    gap, round_r, lip_w = 0.006, 0.016, 0.012
    for yk in joint_heights():
        d = y - yk
        a = np.abs(d)
        groove = np.where(
            a < gap,
            -0.010,
            np.where(a < gap + round_r, -0.010 * (0.5 + 0.5 * np.cos(math.pi * (a - gap) / round_r)), 0.0),
        )
        lip_t = (a - gap - round_r) / lip_w
        lip = np.where((d < 0) & (lip_t > 0) & (lip_t < 1), 0.0015 * np.sin(math.pi * lip_t), 0.0)
        h += groove + lip
    # Two pressed bands per section (0.11 m tall, 3 mm proud) at 1/4 and 3/4 pitch.
    for k in range(SECTIONS):
        for f in (0.25, 0.75):
            h += 0.003 * soft_box(y, PITCH * (k + f), 0.049, 0.010)
    # Rubber bulb from the flat bottom rows to the seal top.
    bulb_t = np.clip((y - FLAT_BOTTOM) / (SEAL_TOP - FLAT_BOTTOM), 0, 1)
    bulb = np.where((y > FLAT_BOTTOM) & (y < SEAL_TOP), 0.008 * np.sqrt(np.clip(np.sin(math.pi * bulb_t), 0.0, 1.0)), 0.0)
    # Aluminium rail: 4 mm proud with rounded top and bottom lips.
    rail = 0.004 * soft_box(y, (SEAL_TOP + RAIL_TOP) / 2, (RAIL_TOP - SEAL_TOP) / 2 - 0.006, 0.006)
    # Top cap: a 2 mm step down below the cap, flat where the top face samples.
    cap = np.where(y > HEIGHT - CAP_H, 0.002, 0.0) * (y < HEIGHT - FLAT_TOP)
    return h + bulb + rail + cap


def build_normal_pixels():
    sh = NORMAL_H * SUPERSAMPLE
    y = (np.arange(sh, dtype=np.float64) + 0.5) / sh * HEIGHT
    h = height_profile(y)
    dh_dy = np.gradient(h, HEIGHT / sh)
    flat = (y < FLAT_BOTTOM) | (y > HEIGHT - FLAT_TOP)
    dh_dy = np.where(flat, 0.0, dh_dy)
    n = np.stack([np.zeros_like(h), -dh_dy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = n.reshape(NORMAL_H, SUPERSAMPLE, 3).mean(axis=1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    col = np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    return np.repeat(col[:, None, :], NORMAL_W, axis=1)


# ---------------------------------------------------------------- colour
def colour_grid():
    """Supersampled texel centres. Returns u, v in [0,1] and front-face metres."""
    sw, sh = COLOUR_W * SUPERSAMPLE, COLOUR_H * SUPERSAMPLE
    u = (np.arange(sw, dtype=np.float32) + 0.5) / sw
    v = (np.arange(sh, dtype=np.float32) + 0.5) / sh
    uu, vv = np.meshgrid(u, v)
    u0, u1 = SIDE_BAND / COLOUR_W, 1 - SIDE_BAND / COLOUR_W
    x = ((uu - u0) / (u1 - u0) - 0.5) * 2 * FRONT_HALF_W
    y = vv * HEIGHT
    return uu, vv, x, y


def joint_tone(y):
    """Multiplier for the joint gaps. The lips and the pressed bands are left to
    the normal map (256 px/m there): every horizontal line in the colour map
    costs a row of JPEG blocks across the whole width."""
    m = np.ones_like(y)
    for yk in joint_heights():
        m = np.where(np.abs(y - yk) < 0.007, 0.30, m)
    return m


def build_colour_pixels():
    uu, vv, x, y = colour_grid()
    shape = x.shape
    rgb = np.broadcast_to(PAINT, shape + (3,)).copy()

    # Stepped tint per section (sections are replaced individually), gentle
    # sun fade toward the top.
    rng = np.random.default_rng(41)
    section = np.clip(np.floor(y / PITCH), 0, SECTIONS - 1).astype(np.int32)
    tint = 1.0 + (rng.random(SECTIONS).astype(np.float32) - 0.5) * 0.07
    fade = 1.0 + 0.04 * (y / HEIGHT)
    broad = 1.0 + (value_noise(uu, vv, 6, 3, 7) - 0.5) * 0.035
    rgb *= (tint[section] * fade * broad)[..., None]

    # Drips: thin dark runs under the joints, a few per joint.
    drng = np.random.default_rng(13)
    for yk in joint_heights():
        for _ in range(drng.integers(3, 7)):
            cx = drng.uniform(-4.2, 4.2)
            length = drng.uniform(0.08, 0.35)
            w = drng.uniform(0.006, 0.012)
            run = (np.abs(x - cx) < w) & (y < yk - 0.02) & (y > yk - 0.02 - length)
            taper = np.clip((y - (yk - 0.02 - length)) / length, 0, 1)
            rgb *= (1.0 - 0.16 * run * taper)[..., None]

    # Ground splash from wheels and boots: vertical streaks of road film that
    # reach 0.15-0.45 m, heavier toward the ground, with spatter above them.
    streak = value_noise(uu, vv * 0.0, 240, 1, 23)
    reach = 0.16 + 0.18 * value_noise(uu, vv * 0.0, 36, 1, 24) + 0.10 * streak
    splash = (1 - smoothstep(0.45 * reach, reach, y)) * (0.18 + 0.34 * streak)
    spatter = (value_noise(uu, vv, 520, 120, 29) > 0.80 + 0.17 * np.clip(y / 0.7, 0, 1)) & (y < 0.7)
    splash = np.maximum(splash, 0.40 * spatter)
    rgb = rgb * (1 - splash[..., None]) + GRIME * splash[..., None]

    # Pallet and forklift scrapes: sharp bright lines 0.15-0.65 m up.
    srng = np.random.default_rng(97)
    for _ in range(18):
        cx = srng.uniform(-4.0, 4.0)
        cy = srng.uniform(0.15, 0.65)
        half = srng.uniform(0.06, 0.40)
        thick = srng.uniform(0.004, 0.009)
        mark = hard_box(x, cx, half) * hard_box(y, cy + 0.01 * (x - cx), thick)
        s = srng.uniform(0.45, 0.8)
        rgb = rgb * (1 - s * mark[..., None]) + SCRAPE * (s * mark[..., None])

    # Joint lines over the paint.
    rgb *= joint_tone(y)[..., None]

    # Galvanised end stiles on the front face, rivets two per section.
    e = FRONT_HALF_W - np.abs(x)
    stile = (e < STILE_W).astype(np.float32)
    galv = GALV * (1.0 + (value_noise(uu, vv, 4, 40, 31) - 0.5) * 0.06)[..., None]
    galv = galv * joint_tone(y)[..., None]
    rgb = rgb * (1 - stile[..., None]) + galv * stile[..., None]
    rgb *= np.where((e > STILE_W) & (e < STILE_W + 0.006), 0.62, 1.0)[..., None]  # stile seam
    rivet = np.zeros_like(x)
    for k in range(SECTIONS):
        for f in (0.22, 0.78):
            rivet = np.maximum(rivet, ((e - STILE_W / 2) ** 2 + (y - PITCH * (k + f)) ** 2 < 0.009**2).astype(np.float32))
    rgb *= (1.0 - 0.45 * rivet)[..., None]

    # Lift handles: black plate with a lighter slot rim.
    for cx in HANDLE_CENTRES:
        plate = hard_box(x, cx, 0.10) * hard_box(y, HANDLE_Y, 0.035)
        slot = hard_box(x, cx, 0.065) * hard_box(y, HANDLE_Y - 0.004, 0.011)
        rim = hard_box(x, cx, 0.072) * hard_box(y, HANDLE_Y - 0.004, 0.017) * (1 - slot)
        rgb = rgb * (1 - plate[..., None]) + HANDLE * plate[..., None]
        rgb = rgb * (1 - rim[..., None]) + (HANDLE * 1.9) * rim[..., None]
        rgb *= (1.0 - 0.6 * slot)[..., None]

    # Aluminium bottom rail over the rubber seal (road film on its lower
    # half), aluminium top cap with dust along it. The top bevel samples the
    # cap's top rows, so the top edge reads as the cap, not a dark band.
    rail = ((y >= SEAL_TOP) & (y < RAIL_TOP)).astype(np.float32)
    rail_tone = np.where(y > RAIL_TOP - 0.007, 0.62, np.where(y > RAIL_TOP - 0.016, 1.12, np.where(y < SEAL_TOP + 0.006, 0.78, 1.0)))
    rail_dirt = 1.0 - 0.22 * (1 - smoothstep(SEAL_TOP, RAIL_TOP, y)) * (0.5 + streak)
    rail_rgb = RAIL * (rail_tone * rail_dirt)[..., None]
    rgb = rgb * (1 - rail[..., None]) + rail_rgb * rail[..., None]
    seal = (y < SEAL_TOP).astype(np.float32)
    rgb = rgb * (1 - seal[..., None]) + RUBBER * seal[..., None]
    cap = (y > HEIGHT - CAP_H).astype(np.float32)
    dust = 1.0 - 0.10 * value_noise(uu, vv * 0.0, 90, 1, 43)
    cap_rgb = RAIL * 0.92 * (np.where(y < HEIGHT - CAP_H + 0.006, 0.62, 1.0) * dust)[..., None]
    rgb = rgb * (1 - cap[..., None]) + cap_rgb * cap[..., None]

    # Side bands: what the bevelled end faces show. Galvanised stile edge with
    # joint ticks the full height, rubber foot, aluminium cap at the top.
    side = (uu < SIDE_BAND / COLOUR_W) | (uu > 1 - SIDE_BAND / COLOUR_W)
    side_rgb = GALV * 0.86 * joint_tone(y)[..., None]
    side_rgb = np.where((y < SEAL_TOP)[..., None], RUBBER, side_rgb)
    side_rgb = np.where(((y >= SEAL_TOP) & (y < RAIL_TOP))[..., None], RAIL * 0.85, side_rgb)
    side_rgb = np.where((y > HEIGHT - CAP_H)[..., None], RAIL * 0.8, side_rgb)
    rgb = np.where(side[..., None], side_rgb, rgb)

    rgb = block_mean(rgb)
    return np.clip(np.round(rgb), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- encoders
def write_png(path, rgb):
    """Minimal RGB8 PNG writer (rows top-first), per-row None/Sub/Up filter choice."""
    rows = rgb[::-1].astype(np.int16)  # row 0 of the array is the bottom of the door
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


SHARP_ENCODE = r"""
const [root, rawPath, outPath, w, h, q] = process.argv.slice(1);
const sharp = require(require('path').join(root, 'node_modules', 'sharp'));
sharp(require('fs').readFileSync(rawPath), { raw: { width: +w, height: +h, channels: 3 } })
  .jpeg({ quality: +q, mozjpeg: true, chromaSubsampling: '4:2:0' })
  .toFile(outPath)
  .catch((e) => { console.error(e); process.exit(1); });
"""


def write_jpeg(path, rgb, quality):
    """Encode with the repo's sharp (mozjpeg, optimised Huffman, 4:2:0).

    Blender's own JPEG writer needs ~1.6x the bytes for the same quality, and
    the asset's whole file budget is 21000 bytes. The glTF exporter embeds the
    staged file's bytes unchanged.
    """
    import subprocess

    h, w, _ = rgb.shape
    raw_path = path + '.rgb'
    with open(raw_path, 'wb') as f:
        f.write(np.ascontiguousarray(rgb[::-1]).tobytes())  # sharp wants rows top-first
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
    subprocess.run(['node', '-e', SHARP_ENCODE, root, raw_path, path, str(w), str(h), str(quality)], check=True)


# ---------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    return scene


def build_mesh():
    """One 12-triangle hexahedron. Blender Z-up: glTF +Z front = Blender -Y.

    Back face: full 9 x 4. Front face: inset EDGE_INSET at both ends and the
    top, flush with the ground at the bottom.
    """
    hy = DEPTH / 2
    bm = bmesh.new()
    corners = {}
    for sx in (-1, 1):
        for sy in (-1, 1):  # -1 = front (Blender -Y)
            for sz in (0, 1):
                front = sy < 0
                x = sx * (FRONT_HALF_W if front else WIDTH / 2)
                z = 0.0 if sz == 0 else (FRONT_TOP if front else HEIGHT)
                corners[(sx, sy, sz)] = bm.verts.new((x, sy * hy, z))

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
    u0, u1 = SIDE_BAND / COLOUR_W, 1 - SIDE_BAND / COLOUR_W
    band = SIDE_BAND / COLOUR_W
    texel_v = 1.0 / COLOUR_H

    def u_front(x, half):
        return u0 + (x / half * 0.5 + 0.5) * (u1 - u0)

    def depth_t(y):
        return (y + hy) / DEPTH  # 0 front, 1 back

    for name, f in faces.items():
        for loop in f.loops:
            x, y, z = loop.vert.co
            front = y < 0
            half = FRONT_HALF_W if front else WIDTH / 2
            v = z / HEIGHT
            t = depth_t(y)
            if name == 'front':
                uv = (u_front(x, half), v)
            elif name == 'back':
                uv = (u_front(-x, half), v)
            elif name == 'right':
                uv = (1 - band * (0.75 - 0.5 * t), v)
            elif name == 'left':
                uv = (band * (0.75 - 0.5 * t), v)
            elif name == 'top':
                uv = (u_front(x, half), 1 - texel_v * (1.0 + t))
            else:
                uv = (u_front(x, half), texel_v * (1.0 + t))
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
    mat.use_backface_culling = True  # closed hull: export single-sided
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.55

    colour_img = bpy.data.images.load(colour_path)
    colour_img.name = 'dock-door-panel-colour'
    colour_img.colorspace_settings.name = 'sRGB'
    normal_img = bpy.data.images.load(normal_path)
    normal_img.name = 'dock-door-panel-normal'
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
        raise SystemExit('usage: blender -b --factory-startup -P dock-door-panel.py -- <out.glb>')
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    scene = reset_scene()
    stage = tempfile.mkdtemp(prefix='dock-door-panel-')
    try:
        colour_path = os.path.join(stage, 'dock-door-panel-colour.jpg')
        normal_path = os.path.join(stage, 'dock-door-panel-normal.png')
        write_jpeg(colour_path, build_colour_pixels(), quality=JPEG_QUALITY)
        write_png(normal_path, build_normal_pixels())
        print(f'DOCK_DOOR_PANEL_STAGED colour {os.path.getsize(colour_path)} normal {os.path.getsize(normal_path)} bytes')

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
            export_copyright='MillOS authored geometry and textures (scripts/blender/authored/dock-door-panel.py)',
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f'DOCK_DOOR_PANEL_WROTE {out_path} {os.path.getsize(out_path)} bytes')


main()
