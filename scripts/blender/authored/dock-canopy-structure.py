"""Dock canopy structure (world-dock-canopy-structure), authored from scratch.

What it builds
--------------
The flat-roofed steel truck canopy that stands over each yard dock approach
(`LoadingDockCanopy` in src/components/FactoryExterior.tsx). Envelope 20.5 m wide
x 6.2 m tall x 5.2 m deep, origin at ground centre, +Z toward the yard, the same
frame, node and scale convention as the delivered GLB:

  * the roof as ONE lofted solid: its (z, y) end section is traced (front gutter
    with a V channel and chamfered bottom, deck sheet at 6.0, two trapezoidal
    roof ribs to 6.2 that are the raised roof-panel strips, a sloped back
    upstand to 6.14, soffit at 5.9) and extruded the full 20.5 m, so the
    section itself shows at each gable as the end treatment;
  * four plain 0.5 m square steel columns at x +/-9, z +/-1.5, each standing on
    a grouted base plinth (a low square pyramid whose visible part is an 11 cm
    sloped foot around the column);
  * a 0.52 m deep header beam over each column pair (front pair and back pair),
    with a 1.4 m knee gusset at the inside of every column head;
  * a galvanised lamp trunking (triangular section, flat bottom at 5.78) under
    the roof centreline, with three lamp housings at x -6.667, 0, +6.667
    hanging from it: a bezel face 0.8 x 0.44 at y 5.6 rising on four sloped
    faces into the trunking. The runtime draws the lens faces (0.6 x 0.08 x
    0.3 m at y 5.6) under them; the bezel covers that footprint.

Every part is a closed solid (the runtime forces FrontSide on this asset and
closedDoubleFacedAssets.test.ts requires every directed edge paired), and parts
meet by embedding into their neighbour, never by sharing a plane. Triangles:
roof 68, header beams 24, columns 48, plinths 24, gussets 16, trunking 8,
housings 24 = 212, the manifest's maxRenderVertices of 636 indices.

Surface: authored vertex colours (chosen as sRGB, stored linear) per part and
face (slate deck dirtier toward the gutter, lighter galvanised rib crowns,
gutter face and trunking, a dark wet channel, a soffit darker toward the dock,
columns grimed at the foot), times a procedural 256 px base-colour atlas (a
deck tile longer than the roof with weathering patches and run-off streaks,
worn arrises and rain streaks on the members) and a 256 px tangent-space normal
atlas (pan ribs on the deck, weld bead on the members). One material, constant
roughness. No provider (Tripo) mesh or texture is used.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python scripts/blender/authored/dock-canopy-structure.py -- <out.glb>

Deterministic: the textures use a fixed seed.
"""

import math
import sys

import bpy
import numpy as np

# ------------------------------------------------------------------ constants

NODE_NAME = 'Dock-canopy-structureBody'
MESH_NAME = 'dock-canopy-structure-mesh'
MATERIAL_NAME = 'dock-canopy-structure-surface'
SCENE_NAME = 'MillOS_World_Dock-canopy-structure'
# Delivered convention: unit-space mesh, node translation [0, 3.1, 0], scale 20.5.
NODE_SCALE = 20.5
NODE_Y = 3.1
# Authoring frame is the transcribed runtime frame (gutter overhang makes z run
# -2.5..2.7); the delivered GLB is recentred, so every point shifts by this.
Z_SHIFT = -0.1
TEX = 256
SEED = 20261106
TRI_BUDGET = 212
ROUGHNESS = 0.62

# Atlas bands across u, in pixels [start, end). Each tiles in v (metres / 4).
BANDS = {
    'deck': (0, 92),      # slab top and soffit: profiled roof sheet
    'member': (92, 164),  # columns and beams: u spans the full face width
    'strip': (164, 210),  # roof strips, gutter, slab edges
    'small': (210, 256),  # gussets, plinths, lamp housings, short faces
}
MARGIN_PX = 3
V_TILE_M = 4.0
# The deck tile spans more than the whole 20.5 m roof, so the sheet never
# repeats across it (a 4 m repeat read as floor tiles from above).
V_TILE = {'deck': 22.0}
# Mean of each band's base-colour multiplier (linear); vertex colours are divided
# by it so the authored sRGB targets are what the eye gets on average.
BAND_FIELD = {'deck': 0.872, 'member': 0.725, 'strip': 0.840, 'small': 0.88}


def out_path():
    argv = sys.argv
    if '--' not in argv or argv.index('--') + 1 >= len(argv):
        raise SystemExit('usage: Blender --background --factory-startup --python dock-canopy-structure.py -- <out.glb>')
    return argv[argv.index('--') + 1]


# ------------------------------------------------------------------ vector helpers

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    length = math.sqrt(dot(a, a))
    return (a[0] / length, a[1] / length, a[2] / length)


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    """sRGB 0-255 triple -> linear triple."""
    return tuple(srgb_to_linear(c) for c in rgb)


def mix_srgb(a, b, t):
    t = min(1.0, max(0.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# ------------------------------------------------------------------ solids
# A solid is a list of convex polygons (lists of 3D points, glTF metres, authoring
# frame). Winding is fixed outward against the solid's centroid, so every
# builder below may list corners in any order around the face.

def oriented(polys):
    pts = [p for poly in polys for p in poly]
    centre = tuple(sum(p[i] for p in pts) / len(pts) for i in range(3))
    out = []
    for poly in polys:
        n = cross(sub(poly[1], poly[0]), sub(poly[2], poly[0]))
        face_centre = tuple(sum(p[i] for p in poly) / len(poly) for i in range(3))
        out.append(poly if dot(n, sub(face_centre, centre)) > 0 else list(reversed(poly)))
    return out


def hexahedron(bottom, top):
    """Eight-corner convex solid: bottom and top are 4 corners in matching order."""
    b, t = bottom, top
    polys = [list(b), list(t)]
    for i in range(4):
        j = (i + 1) % 4
        polys.append([b[i], b[j], t[j], t[i]])
    return oriented(polys)


def box(x0, x1, y0, y1, z0, z1):
    return hexahedron(
        [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
        [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)],
    )


def frustum(cx, cz, y0, y1, w0, d0, w1, d1):
    """Tapered body: w0 x d0 footprint at y0 changing to w1 x d1 at y1."""
    def ring(y, w, d):
        return [(cx - w / 2, y, cz - d / 2), (cx + w / 2, y, cz - d / 2),
                (cx + w / 2, y, cz + d / 2), (cx - w / 2, y, cz + d / 2)]
    return hexahedron(ring(y0, w0, d0), ring(y1, w1, d1))


def pyramid(cx, cz, y0, size, apex_y):
    """Square pyramid, size x size base at y0, apex at apex_y (6 triangles)."""
    h = size / 2
    base = [(cx - h, y0, cz - h), (cx + h, y0, cz - h), (cx + h, y0, cz + h), (cx - h, y0, cz + h)]
    apex = (cx, apex_y, cz)
    polys = [base] + [[base[i], base[(i + 1) % 4], apex] for i in range(4)]
    return oriented(polys)


def tetra(a, b, c, d):
    return oriented([[a, b, c], [a, b, d], [a, c, d], [b, c, d]])


def prism_x_hipped(profile_zy, x0, x1, y_base, hip):
    """Convex (z, y) profile extruded along x whose end caps lean inward:
    a vertex at height y sits hip * (y - y_base) inboard of the strip end, so
    each end cap stays planar."""
    a = [(x0 + hip * (y - y_base), y, z) for z, y in profile_zy]
    b = [(x1 - hip * (y - y_base), y, z) for z, y in profile_zy]
    polys = [a, b]
    n = len(profile_zy)
    for i in range(n):
        j = (i + 1) % n
        polys.append([a[i], a[j], b[j], b[i]])
    return oriented(polys)


def prism_x(profile_zy, x0, x1):
    return prism_x_hipped(profile_zy, x0, x1, 0.0, 0.0)


def newell_normal(poly):
    """Unit normal of a planar polygon, valid for concave polygons too (a
    three-point cross product flips at a reflex corner)."""
    nx = ny = nz = 0.0
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    return norm((nx, ny, nz))


def signed_volume(polys):
    """Divergence-theorem volume with a fan per face: positive when every face
    winds outward. A fan gives the right signed area for any simple polygon."""
    v = 0.0
    for poly in polys:
        for i in range(1, len(poly) - 1):
            v += dot(poly[0], cross(poly[i], poly[i + 1])) / 6.0
    return v


def loft_x(profile_zy, x0, x1):
    """Extrude ONE traced (z, y) section, convex or not, along x from x0 to x1.

    Winding comes from the section's own signed area, not from a centroid test
    (which is only valid for convex solids). Seen from -x with z to the right
    and y up, a counter-clockwise section has its normal toward -x, so the x0
    cap keeps the section order, the x1 cap reverses it, and each side quad
    runs a_i, b_i, b_j, a_j. The concave end cap is passed as one n-gon;
    Blender's exporter triangulates it from the same boundary vertices, so its
    edges pair with the side quads'."""
    area = 0.0
    for i in range(len(profile_zy)):
        z0, y0 = profile_zy[i]
        z1, y1 = profile_zy[(i + 1) % len(profile_zy)]
        area += z0 * y1 - z1 * y0
    prof = profile_zy if area > 0 else list(reversed(profile_zy))
    a = [(x0, y, z) for z, y in prof]
    b = [(x1, y, z) for z, y in prof]
    polys = [a, list(reversed(b))]
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        polys.append([a[i], b[i], b[j], a[j]])
    return polys


def hip_housing(cx, cz, y0, y1, half_w, half_d, ridge_half):
    """Lamp housing traced from its two elevations: a rectangular bezel face
    (2*half_w x 2*half_d) at y0 rising on four sloped faces to a ridge of
    2*ridge_half along x at y1 (8 triangles). The sloped faces look down-out
    and catch the sky, so the body reads from below where a box's vertical
    sides are seen edge-on."""
    b = [(cx - half_w, y0, cz - half_d), (cx + half_w, y0, cz - half_d),
         (cx + half_w, y0, cz + half_d), (cx - half_w, y0, cz + half_d)]
    r0 = (cx - ridge_half, y1, cz)
    r1 = (cx + ridge_half, y1, cz)
    return oriented([b, [b[0], b[1], r1, r0], [b[2], b[3], r0, r1],
                     [b[1], b[2], r1], [b[3], b[0], r0]])


# ------------------------------------------------------------------ the canopy
# Colours below are sRGB 0-255 targets for what the eye should see on average.

def build_parts():
    """Returns (name, polygons, shade, band) where shade(normal, point, centre)
    -> sRGB; `centre` is the face centre, so one solid can colour each face."""
    parts = []

    def by_facing(top, side, under):
        def shade(normal, point, centre):
            if normal[1] > 0.5:
                return top
            if normal[1] < -0.5:
                return under
            return side
        return shade

    # ---- Roof: ONE lofted solid. Its (z, y) end section is traced as the
    # canopy is built: the front gutter with a V channel and a chamfered
    # bottom, the deck sheet at 6.0, two trapezoidal roof ribs rising to 6.2
    # (the raised roof-panel strips, now a real 20 cm sheet profile that shows
    # at both verges), and a sloped back upstand to 6.14 over a 0.24 m back
    # edge. Soffit at 5.9. It runs the full 20.5 m, so the section itself is
    # the end treatment at each gable. Nothing rises above 6.2, and every rib
    # sits inside its old strip footprint (base 0.5 m at the deck, 0.24 m top).
    section = [
        (2.30, 5.65), (2.58, 5.65), (2.70, 5.77), (2.70, 6.04),   # gutter body, lip
        (2.48, 5.86), (2.34, 6.00),                               # V channel, deck edge
        (0.75, 6.00), (0.62, 6.20), (0.38, 6.20), (0.25, 6.00),   # rib A (z 0.5)
        (-1.25, 6.00), (-1.38, 6.20), (-1.62, 6.20), (-1.75, 6.00),  # rib B (z -1.5)
        (-2.40, 6.00), (-2.50, 6.14), (-2.50, 5.90),              # back upstand and edge
        (2.30, 5.90),                                             # soffit meets gutter
    ]

    def roof_shade(normal, point, c):
        z, y = c[2], c[1]
        if abs(normal[0]) > 0.9:                       # gable end section
            return (88, 100, 118)
        if normal[1] < -0.9:
            if z > 2.29:                               # gutter underside
                return (82, 88, 96)
            # soffit: darker toward the dock side and toward the gable ends
            front = smoothstep(-2.5, 2.3, point[2])
            base = mix_srgb((44, 52, 66), (78, 88, 104), front)
            return mix_srgb(base, (38, 44, 56), 0.35 * smoothstep(8.0, 10.25, abs(point[0])))
        if z > 2.29:                                   # gutter
            if normal[2] > 0.9:                        # galvanised front face
                return mix_srgb((112, 118, 126), (150, 156, 162), smoothstep(5.77, 6.04, point[1]))
            if normal[2] > 0.3 and normal[1] < 0:      # bottom chamfer
                return (96, 102, 110)
            if normal[2] < -0.9:                       # inner face under the soffit
                return (70, 76, 86)
            return (40, 44, 50)                        # V channel, wet and dark
        if y > 6.19:                                   # rib crowns
            return (134, 148, 168)
        if y > 6.01 and z > -2.3:                      # rib flanks
            return (100, 114, 134) if normal[2] < 0 else (88, 102, 122)
        if z < -2.35:                                  # back upstand and edge
            if normal[1] > 0.3:                        # sloped inner face, lit
                return (118, 130, 148)
            return mix_srgb((70, 80, 96), (96, 108, 126), smoothstep(5.9, 6.14, point[1]))
        # deck sheet: slate, dirtier toward the gutter where the run-off goes
        return mix_srgb((76, 88, 104), (60, 68, 80), smoothstep(0.5, 2.34, point[2]))

    parts.append(('roof', loft_x(section, -10.25, 10.25), roof_shade, 'roof'))

    # ---- Columns 0.5 m square, 0.02 (inside the plinth) to 5.5 (inside the
    # header beam). Grime at the foot from tyre spray, lightening to the head.
    def column_shade(normal, point, c):
        return mix_srgb((46, 48, 50), (100, 114, 136), smoothstep(0.0, 5.5, point[1]))

    # Grouted base plinths: 0.8 m square at the ground, apex buried in the
    # column, so 11 cm of sloped foot shows around each column.
    plinth = by_facing((124, 122, 116), (124, 122, 116), (90, 88, 84))

    for xc in (-9.0, 9.0):
        for zc in (-1.5, 1.5):
            parts.append((f'column-{xc}-{zc}',
                          box(xc - 0.25, xc + 0.25, 0.02, 5.5, zc - 0.25, zc + 0.25),
                          column_shade, 'member'))
            parts.append((f'plinth-{xc}-{zc}', pyramid(xc, zc, 0.0, 0.8, 0.3),
                          plinth, 'small'))

    # ---- Header beams over each column pair: 0.36 wide, 0.52 deep (5.42 to
    # 5.94, top inside the 5.9-6.0 roof sheet), 15 cm inboard of the gables.
    # Lighter than the soffit so they read as the member carrying it.
    for zc in (-1.5, 1.5):
        parts.append((f'header-beam-{zc}',
                      box(-10.1, 10.1, 5.42, 5.94, zc - 0.18, zc + 0.18),
                      by_facing((112, 126, 148), (114, 128, 150), (86, 98, 118)), 'member'))

    # ---- Knee gussets at the inside of each column head, in the plane of the
    # header beam: 1.4 m legs, 14 cm thick at the root (buried in the column
    # and beam), tapering to the free hypotenuse edge.
    for xc in (-9.0, 9.0):
        inward = 1.0 if xc < 0 else -1.0
        face = xc + inward * 0.22  # 3 cm inside the column's inner face
        top = 5.47                 # inside the header beam (bottom 5.42)
        for zc in (-1.5, 1.5):
            a = (face, top, zc - 0.07)
            b = (face, top, zc + 0.07)
            c = (face, top - 1.4, zc)
            d = (face + inward * 1.4, top, zc)
            parts.append((f'gusset-{xc}-{zc}', tetra(a, b, c, d),
                          by_facing((108, 122, 144), (108, 122, 144), (90, 102, 122)), 'small'))

    # ---- Lighting: the lamps no longer grow out of the soffit. A continuous
    # galvanised trunking runs under the roof centreline (a triangular section,
    # flat 0.28 m bottom at 5.78, apex buried in the roof sheet) and each of
    # the three housings hangs from its flat bottom: a bezel face 0.8 x 0.44 at
    # y 5.6 (covering the runtime's 0.6 x 0.3 lens at the same height and
    # centre) rising on four sloped faces into the trunking.
    def rail_shade(normal, point, c):
        if normal[1] < -0.5:
            return (112, 118, 124)
        return (146, 152, 158)

    parts.append(('lamp-trunking', loft_x([(-0.14, 5.78), (0.14, 5.78), (0.0, 5.96)], -7.2, 7.2),
                  rail_shade, 'small'))

    def lamp_shade(normal, point, c):
        if normal[1] < -0.5:
            return (150, 146, 136)          # bezel round the runtime lens
        return mix_srgb((58, 64, 74), (84, 92, 104), smoothstep(5.6, 5.8, point[1]))

    for xc in (-20.0 / 3.0, 0.0, 20.0 / 3.0):
        parts.append((f'lamp-housing-{xc:.3f}',
                      hip_housing(xc, 0.0, 5.6, 5.84, 0.4, 0.22, 0.25),
                      lamp_shade, 'small'))

    for name, polys, _, _ in parts:
        vol = signed_volume(polys)
        if vol <= 0:
            raise SystemExit(f'{name}: faces wind inward (signed volume {vol:.4f})')
    return parts


# ------------------------------------------------------------------ textures

def periodic_noise(rng, sigma_u, sigma_v, shape=(TEX, TEX)):
    """Gaussian-filtered white noise, periodic in both axes, scaled to [-1, 1]."""
    rows, cols = shape
    white = rng.standard_normal((rows, cols))
    fu = np.fft.fftfreq(cols)[None, :]
    fv = np.fft.fftfreq(rows)[:, None]
    kernel = np.exp(-2 * (math.pi ** 2) * ((fu * sigma_u) ** 2 + (fv * sigma_v) ** 2))
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * kernel))
    field -= field.mean()
    return field / (np.abs(field).max() + 1e-9)


def band_coords(name):
    """(t, v): t in [0,1] across the band's inner region (clamped in the margin),
    v in [0,1) down the tile; both shaped (TEX, width)."""
    start, end = BANDS[name]
    width = end - start
    px = np.arange(width) + 0.5
    t = np.clip((px - MARGIN_PX) / (width - 2 * MARGIN_PX), 0.0, 1.0)
    v = (np.arange(TEX) + 0.5) / TEX
    return np.broadcast_to(t[None, :], (TEX, width)), np.broadcast_to(v[:, None], (TEX, width))


def normals_from_height(h, strength):
    dh_du = np.gradient(h, axis=1)
    dh_dv = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    return -dh_du * strength, -dh_dv * strength


def build_textures():
    rng = np.random.default_rng(SEED)
    colour = np.zeros((TEX, TEX))
    nx_all = np.zeros((TEX, TEX))
    ny_all = np.zeros((TEX, TEX))

    # ---- deck: the roof sheet. u runs across the deck (z, down the fall to the
    # gutter), v along the canopy over a 22 m tile, so nothing repeats across
    # the 20.5 m roof. Fine pan ribs parallel to the roof ribs (0.4 m pitch),
    # large weathering patches, and run-off streaks drawn down the fall. No
    # sheet-lap grid: at 640 px a 1 m lap grid read as floor tiles.
    s, e = BANDS['deck']
    t, v = band_coords('deck')
    w = e - s
    metres_u = t * 5.2
    pan = (0.5 + 0.5 * np.cos(2 * math.pi * metres_u / 0.4)) ** 2
    height = 0.45 * pan + 0.12 * periodic_noise(rng, 4, 4, (TEX, w))
    nx, ny = normals_from_height(height, 1.6)
    nx_all[:, s:e], ny_all[:, s:e] = nx, ny
    patches = periodic_noise(rng, 14, 22, (TEX, w))      # metre-scale weathering
    streak = periodic_noise(rng, 12, 0.9, (TEX, w))      # long along u, thin along v
    fine = periodic_noise(rng, 1.2, 1.2, (TEX, w))
    deck_c = 0.88 + 0.12 * patches - 0.16 * np.clip(streak, 0, 1) \
        + 0.05 * np.clip(-streak, 0, 1) + 0.03 * fine + 0.05 * (pan - 0.375)
    colour[:, s:e] = deck_c

    # ---- member: worn light arris at both long edges (u spans the full face
    # width, so the band edges are the member's edges), a bevel in the normal
    # map there, a weld bead at 30 % across, rain streaks down v, chips.
    s, e = BANDS['member']
    t, v = band_coords('member')
    w = e - s
    edge_px = (w - 2 * MARGIN_PX) * 0.03                    # a 1.5 cm worn arris on a 0.5 m face
    d_lo = t * (w - 2 * MARGIN_PX)                          # px from the lo edge
    d_hi = (1 - t) * (w - 2 * MARGIN_PX)
    bevel_lo = np.clip(1 - d_lo / edge_px, 0, 1)
    bevel_hi = np.clip(1 - d_hi / edge_px, 0, 1)
    weld = np.exp(-((t - 0.3) * (w - 2 * MARGIN_PX)) ** 2 / 1.2)
    height = 0.35 * weld + 0.12 * periodic_noise(rng, 1.5, 1.5, (TEX, w)) \
        + 0.18 * periodic_noise(rng, 3, 12, (TEX, w))
    # No bevel tilt at the arrises: tilted normals across 7 % of each face
    # shaded the square columns as if they were rounded.
    nx, ny = normals_from_height(height, 1.4)
    nx_all[:, s:e], ny_all[:, s:e] = nx, ny
    streak = periodic_noise(rng, 0.8, 30, (TEX, w))   # vertical runs (along v)
    mottle = periodic_noise(rng, 4, 8, (TEX, w))
    chips = periodic_noise(rng, 0.7, 0.7, (TEX, w))
    arris = np.maximum(bevel_lo, bevel_hi)
    member_c = 0.72 - 0.12 * np.clip(streak, 0, 1) + 0.06 * np.clip(-streak, 0, 1) \
        + 0.05 * mottle + 0.2 * (chips > 0.75) - 0.12 * weld
    member_c = member_c * (1 - 0.6 * arris) + 0.95 * 0.6 * arris
    colour[:, s:e] = member_c

    # ---- strip: rib flanks and crowns, gutter, upstand. Long faces, so only a
    # faint relief joint every 4 m (no colour step) and lengthwise mottling;
    # transverse ribs or dark joints here drew a grid over the roof from above.
    s, e = BANDS['strip']
    t, v = band_coords('strip')
    w = e - s
    lap_phase = v % 1.0
    lap = np.exp(-((np.minimum(lap_phase, 1 - lap_phase) * 256) ** 2) / 2.0)
    height = 0.25 * lap + 0.08 * periodic_noise(rng, 2, 2, (TEX, w))
    nx, ny = normals_from_height(height, 1.6)
    nx_all[:, s:e], ny_all[:, s:e] = nx, ny
    mottle = periodic_noise(rng, 3, 16, (TEX, w))
    colour[:, s:e] = 0.84 + 0.07 * mottle

    # ---- small: mottled paint, faint relief.
    s, e = BANDS['small']
    t, v = band_coords('small')
    w = e - s
    height = 0.15 * periodic_noise(rng, 2, 2, (TEX, w))
    nx, ny = normals_from_height(height, 1.2)
    nx_all[:, s:e], ny_all[:, s:e] = nx, ny
    colour[:, s:e] = 0.88 + 0.06 * periodic_noise(rng, 3, 3, (TEX, w))

    nz = np.ones_like(nx_all)
    length = np.sqrt(nx_all ** 2 + ny_all ** 2 + nz ** 2)
    normal = np.stack([nx_all / length, ny_all / length, nz / length], axis=-1) * 0.5 + 0.5

    lin_c = np.clip(colour, 0.0, 1.0)
    srgb = np.where(lin_c <= 0.0031308, lin_c * 12.92, 1.055 * np.power(lin_c, 1 / 2.4) - 0.055)
    base = np.stack([srgb, srgb, srgb], axis=-1)
    for name in BANDS:
        s, e = BANDS[name]
        print(f'band {name}: mean linear multiplier {lin_c[:, s:e].mean():.3f}')
    return base, normal


def make_image(name, rgb, colourspace):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False)
    img.colorspace_settings.name = colourspace
    rgba = np.concatenate([rgb, np.ones((TEX, TEX, 1))], axis=-1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'JPEG'
    img.pack()
    return img


def make_material():
    base_px, normal_px = build_textures()
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False  # glTF doubleSided: true (the runtime sets FrontSide)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = ROUGHNESS

    base_node = nodes.new('ShaderNodeTexImage')
    base_node.image = make_image('dock-canopy-structure-basecolor', base_px, 'sRGB')
    links.new(base_node.outputs['Color'], bsdf.inputs['Base Color'])

    nrm_node = nodes.new('ShaderNodeTexImage')
    nrm_node.image = make_image('dock-canopy-structure-normal', normal_px, 'Non-Color')
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.inputs['Strength'].default_value = 1.0
    links.new(nrm_node.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


# ------------------------------------------------------------------ mesh

def band_u(name, t):
    start, end = BANDS[name]
    lo = (start + MARGIN_PX) / TEX
    hi = (end - MARGIN_PX) / TEX
    return lo + (hi - lo) * t


def face_band(normal, kind, longest, span):
    if kind == 'roof':
        if abs(normal[0]) > 0.9:
            return ('small', 1.0)                      # gable end section
        if abs(normal[1]) > 0.9 and span > 1.0:
            return ('deck', 5.2)                       # deck sheet and soffit
        return ('strip', 1.0)                          # ribs, gutter, upstand
    if kind == 'member':
        return ('member', None) if longest >= 1.0 else ('small', 1.0)
    if kind == 'strip':
        return ('strip', 1.0) if longest >= 1.0 else ('small', 1.0)
    return ('small', 1.0)


def face_uv(poly, normal, kind):
    """(band, uvs). Long axis = longest edge; v runs along it in metres over
    the band's tile length, u across."""
    best, e_long = -1.0, None
    for i in range(len(poly)):
        e = sub(poly[(i + 1) % len(poly)], poly[i])
        length = math.sqrt(dot(e, e))
        if length > best:
            best, e_long = length, norm(e)
    e_short = norm(cross(normal, e_long))
    s = [dot(p, e_short) for p in poly]
    span_s = max(s) - min(s)
    band, ref = face_band(normal, kind, best, span_s)
    denom = span_s if ref is None else max(ref, span_s)
    tile = V_TILE.get(band, V_TILE_M)
    uvs = []
    for p, sv in zip(poly, s):
        t = (sv - min(s)) / denom if denom > 0 else 0.0
        uvs.append((band_u(band, min(1.0, t)), dot(p, e_long) / tile))
    return band, uvs


def to_blender_unit(p):
    # glTF metres (authoring frame) -> recentred -> unit space -> Blender Z-up.
    x, y, z = p[0], p[1] - NODE_Y, p[2] + Z_SHIFT
    x, y, z = x / NODE_SCALE, y / NODE_SCALE, z / NODE_SCALE
    return (x, -z, y)


def build_mesh(mat):
    verts, faces, uvs, colours = [], [], [], []
    tri_count = 0
    for name, polys, shade, kind in build_parts():
        for poly in polys:
            n = newell_normal(poly)
            centre = tuple(sum(p[i] for p in poly) / len(poly) for i in range(3))
            band, face_uvs = face_uv(poly, n, kind)
            field = BAND_FIELD[band]
            idx = []
            for p, uv in zip(poly, face_uvs):
                idx.append(len(verts))
                verts.append(to_blender_unit(p))
                uvs.append(uv)
                c = lin(shade(n, p, centre))
                colours.append(tuple(min(1.0, ch / field) for ch in c))
            faces.append(idx)
            tri_count += len(poly) - 2
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = False
    uv_layer = mesh.uv_layers.new(name='UVMap')
    col = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
        c = colours[loop.vertex_index]
        col.data[loop.index].color = (c[0], c[1], c[2], 1.0)
    mesh.color_attributes.active_color = col
    mesh.materials.append(mat)
    return mesh, tri_count


def main():
    path = out_path()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    mat = make_material()
    mesh, tris = build_mesh(mat)
    if tris > TRI_BUDGET:
        raise SystemExit(f'{tris} triangles exceeds the {TRI_BUDGET}-triangle budget (636 indices)')
    obj = bpy.data.objects.new(NODE_NAME, mesh)
    scene.collection.objects.link(obj)
    obj.location = (0.0, 0.0, NODE_Y)
    obj.scale = (NODE_SCALE, NODE_SCALE, NODE_SCALE)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_image_format='JPEG',
        export_jpeg_quality=86,
        export_image_quality=86,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_copyright='MillOS authored geometry and procedural textures',
    )
    print(f'DOCK_CANOPY_BUILT {path} triangles={tris}')


main()
