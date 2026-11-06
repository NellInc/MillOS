"""Metal mooring bollard (world-metal-bollard), built from scratch in headless Blender.

What it builds
--------------
A squat painted-steel mooring bollard for the canal's east coping
(src/components/FactoryExterior.tsx `Bollard type="metal"`, two instances):
0.300 m x 0.800 m x 0.300 m, origin at ground centre, +Z front. The runtime only
places it and turns receiveShadow off; nothing is drawn around it and nothing
measures the GLB.

Delivered build (default): tier Q (round 6, strike-rule rebuild)
----------------------------------------------------------------
Bands 24+12, 12+20, 20+10 and a 10-fan = 108 triangles: ground 24 (r 0.132) -> neck 12
-> rim 20 -> dome ring 10 (3 mm outside the sphere) -> pole. Ring counts chosen by a
phase-averaged silhouette measure (table in the tier Q section): the foot, the
cheapest ring, gets 24 sides. Tier P's builders and normal map, re-laid UVs (the
shaft gets 142 rows), and a repaint in which every wear feature carries a luma
step, because the shipped JPEGs are 4:2:0 (q_colour_map). --tier=P rebuilds round 5.

Tier P (round 5, strike-rule rebuild)
-------------------------------------
12 + 2 x (12 + 24 + 12) = 108 triangles: ground 12 (r 0.132) -> neck 12 (r 0.096,
y 0.655) -> rim 24 (r 0.150, y 0.754) -> dome ring 12 on one sphere arc -> pole.
The mesh carries the silhouette only; flange, neck bead and fillet, the lip's
thickness and rolled top and the true dome are a tangent-space normal map
computed analytically against the mesh's own interpolated normals (see the
tier P section). Textures: base colour + normal; roughness and metalness are
constants. --tier=N rebuilds the round-4 delivery below.

Tier N (round 4, strike-rule rebuild)
-------------------------------------
A re-traced mushroom bollard, 104 triangles = 312 indices (budget 324):
  ground 16 (r 0.138) -> neck 8 (r 0.098, y 0.640) -> lip 24 (r 0.150, y 0.722,
  vertices on +-X and +-Z) -> shoulder 12 (r 0.114, y 0.786) -> pole (y 0.800).
What changed in method, against the three struck defects:
* No irregular merge walk. Every band joins rings of 1:k counts at coincident
  angles (16:8, 8:24, 24:12; main() refuses anything else); the 10->8 shaft band
  of tier L drew vertical bands in clay.
* One crease only, the lip's underside edge. The chamfer ring is GONE: its crease
  drew a 10-gon on the foot in every orbit view (identity deviation from D-036's
  foot chamfer; the grime skirt marks the foot instead).
* The rim is the whole top-down outline, so it carries 24 sides; the foot 16.
* The neck sits high, so the underside is a short steep mushroom flare (not a
  13 cm trumpet cone), and the head rolls from the crisp lip (normal straight out
  above it) up a 61 deg side onto one smooth shoulder ring and a 7 deg crown.
* Paint: nothing under ~5 texels; the collar is one darker rope-polished value
  step; the foot is grime with two small rust patches; chips vary in size and
  place (three rusted); touch-up patches break the shaft. The head above the lip
  is one paint, so no colour or sheen step traces the 12-sided shoulder.
Tier M (12/12/24/12, 108 triangles) is the same profile with a 12-sided foot,
whose facets showed at the base.

Tier L (round 3, strike-rule rebuild)
-------------------------------------
Same 108-triangle lathe budget, re-traced head: the lip's thickness now hangs
BELOW the rim (an undercut lip band) instead of rising above it as a bull-nose
shoulder. Rings: ground 16 (r 0.146) -> chamfer top 10 (r 0.127, y 0.044) ->
waist 8 (r 0.093, y 0.620) -> lip-under 12 (r 0.146, y 0.745) -> rim 16 (r 0.150,
y 0.778, vertices on +-X and +-Z) -> crown fan to the pole (y 0.800).
16 + 2 x (10 + 8 + 12 + 16) = 108 triangles = 324 indices.
Why: the 20 deg orbit cameras see the back edge of the topmost wide ring as the
head's top outline, and the top-down camera sees the widest ring. In tier H that
was a 10-sided shoulder with its own crease. Now the rim (16) is both, nothing
above it is a ring, and the crown is one smooth-normal fan. The allocation was
chosen by rasterising each candidate against its 256-sided true surface from the
turntable's own cameras (scratch tool, silhouette_error.py): every 108-triangle
allocation sits at ~2 px worst outline error at 640 px; only dropping the foot
chamfer buys a 20-24-sided rim (1.4 / 0.7 px top-down).
UVs are re-laid (lip_maps): the body is one strip, foot to rim (u = angle,
v = arc length); the crown is its own planar island seen from above, so no fan
triangle shears the texture toward the pole. Weathering is hard-edged (1-texel
edges in luma), rust streaks are propagated DOWN the post from their sources,
and the metallicRoughness map is a PNG so the metal/paint split is not smeared
by JPEG chroma subsampling.

Tier H (round 2)
----------------
D-036 raised maxRenderVertices to 324 (it counts indices): 108 triangles. One
traced side profile is lathed round the axis, and each ring carries its own side
count, joined to its neighbours by a merge walk (a band between rings of n and m
sides costs n + m triangles, so only the ground ring is cheap):
  ground 16 (r 0.146) -> flange top 12 (r 0.127, y 0.044) -> waist 8 (r 0.093,
  y 0.615) -> rim 16 (r 0.150, y 0.742, vertices on +-X and +-Z so the footprint
  is exactly 0.300 m) -> shoulder 10 (r 0.122, y 0.786) -> pole (y 0.800).
16 + 2 x (12 + 8 + 16 + 10) = 108 triangles = 324 indices. The turntable's orbit
cameras see the head within ~4 deg of edge-on, so its silhouette is its profile:
a shoulder ring is what makes the cap read round (without one the cap is a
pointed hat, tier E, or a knife-edged trumpet, tier D). The rim, the top-down
outline and the ground contact carry 16 sides; the waist, narrow and shaded by
the head, carries 8. Normals are smooth round the axis. The flange top is a
crisp cast edge; the waist is ONE averaged normal (a filleted join, not a hard
angle); the rim is crisp underneath and rounds over a bull-nose shoulder onto a
near-flat crowned top disc. Other tiers stay for evidence: C (round 1, 12 sides
throughout), D (all-16, no shoulder), E (cone cap), F (8-sided shoulder, read as
an octagonal nut). A curved-bell ring, a neck collar or a rim band would each
cost another ring at 2 x its side count.
Maps (lathe_maps): thin rubbed line on the rim's crown and a broader one under
it, wear on the flange edge and chamfer, a rope-burnished waist with fine
concentric scores, vertical wash streaks and darker run-off down the post, kick
scuffs, dirt in the neck, a grimy/rusted foot skirt, chips with primer haloes and
a sun-faded cap.

  --tier=A|B|C --sides=N   other lathe tiers (evidence for budget decisions)
  --tier=octagon           the retired 32-triangle octagonal build described below

Retired octagon build (--tier=octagon, 96 indices)
--------------------------------------------------
Under the old maxRenderVertices 96 the whole bollard was 32 triangles:

* triangles = (foot ring + neck ring)  for the post band
            + 2 x lip ring             for the head (hipped cap fan + flared underside fan)
* the LIP ring sets the bounds, so it carries vertices on +-X and +-Z: 8;
* the NECK ring (top of the post, buried in the head) must match and align with
  the lip ring: a 6-ring there was tried and its corners sawtoothed through the
  flare. So the post is 8 + 8 = 16 and the head 8 + 8 = 16, total 32.
A round mushroom bollard (12-16-sided shaft, dome, neck ring, base flange)
needs roughly 60 triangles; 32 cannot fake one, and smooth normals on an
octagon only read as a low-poly cylinder. So this is authored as what 32
triangles can be honestly: an OCTAGONAL cast bollard. A flat-faced post with
crisp arrises, a wide base tapering to a narrow neck (r 0.135 -> 0.093 m at
y 0.605) under a heavy head that is a quarter of the height: ~12.5 cm of flare
out to the lip (r 0.150 at y 0.730) and a 7 cm dome. The head carries authored
smooth normals so it shades as a rounded cast bell; the post stays flat. The band builder is a general merge walk round two
rings, so the ring counts stay a single constant each.

Head: one lip ring (r 0.150 m, y LIP); above it a low hipped cap fans to the
pole at y 0.80 m; below it a flared underside fans in to an apex hidden inside
the post. The head intersects the post (the turntable probe joins the two
islands by BVH overlap), so nothing floats. The post has no bottom face: it
stands on the coping and no camera sees it.

Surface: two authored 256 px maps, base colour (sRGB) and metallicRoughness
(G roughness, B metalness, R 1), so paint, worn paint, bare steel, primer and
rust differ in sheen as well as colour. No normal map. UVs are three islands:
the post as a cylindrical strip (arrises at u = j/8), the flared underside as
its own strip, and the cap as a planar disc seen from above (no pole pinch, its
own lighter worn value). Atlas area no face samples is flat-filled to keep the
JPEGs inside maxFileBytes. Wear is authored in TEXELS against the exact
face mapping (at ~4 mm per texel anything under ~5 px is speckle after JPEG):
rubbed-through bands 3-7 px wide on the arrises, heavy in the kick zone and
broken above it; a worn lip on both faces; a foot skirt of grime and rust with
a ragged top that creeps up the arrises; a few large chips on the arrises and
lip corners; horizontal rope polish round the flare; dirt in the neck.

Node convention matches the delivered GLB: a unit mesh (y -0.5..0.5) under node
`Metal-bollardBody` at translation (0, 0.4, 0), uniform scale 0.8.
One material, two textures, no vertex colours.

Run
---
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    -P scripts/blender/authored/metal-bollard.py -- <out.glb> [--tier=C --sides=12]

Re-runnable and deterministic (seeded). Writes only <out.glb>.
"""

import math
import os
import sys

import bpy
import numpy as np

# ---------------------------------------------------------------- dimensions (metres, glTF y up)
FOOT_SIDES = 8
NECK_SIDES = 8  # must match and align with the lip: a 6-ring here sawtooths through the flare
LIP_SIDES = 8  # vertices on +-X and +-Z: both footprint extents are exactly the lip radius
R_FOOT = 0.135  # wide cast base ...
R_POST_TOP = 0.088  # ... tapering to a narrow neck under a heavy flared head
Y_POST_TOP = 0.680  # buried inside the head
R_LIP = 0.150
Y_LIP = 0.730  # the head is about a quarter of the height: ~12.5 cm of flare, 7 cm of dome
Y_TOP = 0.800
Y_APEX = 0.400  # underside apex, hidden inside the post; sets the neck near y 0.60
# Head normals (degrees from straight up). The head is shaded as a rounded cast
# bell: dome near-horizontal at the lip, underside just past horizontal there,
# turning down toward the neck. The post stays flat-faced (cast octagon).
DOME_LIP_TILT = 72.0
UNDER_LIP_TILT = 100.0
UNDER_APEX_TILT = 165.0
INDEX_BUDGET = 324  # D-036 (was 96)
DEFAULT_TIER, DEFAULT_SIDES = 'Q', 12

NODE_NAME = 'Metal-bollardBody'
MESH_NAME = 'metal-bollard-mesh'
MATERIAL_NAME = 'metal-bollard-surface'
SCENE_NAME = 'MillOS_World_Metal-bollard'
NODE_Y = Y_TOP / 2
NODE_SCALE = Y_TOP

TEX = 256
JPEG_QUALITY = 78
SEED = 20261106


def _post_r(y):
    return R_FOOT + (R_POST_TOP - R_FOOT) * (y / Y_POST_TOP)


def _under_r(y):
    return R_LIP * (y - Y_APEX) / (Y_LIP - Y_APEX)


# Where the flared underside meets the (nominal, round) post: the neck.
_lo, _hi = Y_APEX, Y_LIP
for _ in range(60):
    _mid = (_lo + _hi) / 2
    if _under_r(_mid) < _post_r(_mid):
        _lo = _mid
    else:
        _hi = _mid
Y_NECK = (_lo + _hi) / 2
R_NECK = _post_r(Y_NECK)
NECK_T = R_NECK / R_LIP  # apex -> lip parameter at the neck
FLARE_LEN = math.hypot(R_LIP - R_NECK, Y_LIP - Y_NECK)
CAP_RISE = Y_TOP - Y_LIP
DOME_LEN = math.hypot(R_LIP, CAP_RISE)

# ---------------------------------------------------------------- UV islands (Blender v, 0 = bottom row)
PX = 1.0 / TEX
V_POST0, V_POST1 = 0 * PX, 152 * PX  # post strip, y 0 .. Y_POST_TOP (~4.5 mm/px)
V_FLARE0, V_FLARE1 = 156 * PX, 188 * PX  # flare strip, neck .. lip (~4 mm/px)
DOME_CU, DOME_CV = 36 * PX, 223 * PX  # dome disc centre
DOME_RUV = 31 * PX  # disc radius in UV for R_LIP (the island square keeps a gutter)
DOME_S = DOME_RUV / R_LIP  # UV per metre
V_APEX_UV = (V_FLARE0 - NECK_T * V_FLARE1) / (1 - NECK_T)  # buried apex, extrapolated
FACET_PX = TEX / LIP_SIDES  # one post facet is 32 px wide in u

# ---------------------------------------------------------------- palette (sRGB 0-255) and sheen
PAINT = np.array([57, 65, 78], dtype=np.float64)  # dark slate grey-blue, the identity colour
CAP_PAINT = np.array([72, 80, 93], dtype=np.float64)  # the cap, a shade sun-faded
PRIMER = np.array([128, 70, 48], dtype=np.float64)
STEEL = np.array([136, 137, 134], dtype=np.float64)  # paint rubbed through to the casting
POLISH = np.array([158, 158, 152], dtype=np.float64)  # rope-polished steel
RUST = np.array([122, 66, 34], dtype=np.float64)
RUST_DARK = np.array([78, 44, 26], dtype=np.float64)
GRIME = np.array([48, 44, 38], dtype=np.float64)
# roughness, metalness
SHEEN = {
    'paint': (0.62, 0.0),
    'cap': (0.58, 0.0),
    'steel': (0.30, 0.75),
    'polish': (0.24, 0.9),
    'primer': (0.76, 0.0),
    'rust': (0.92, 0.0),
    'grime': (0.86, 0.0),
}


def parse_args():
    """<out.glb> [--tier=Q|P|A..N|octagon] [--sides=N]. No --tier: the delivered tier Q."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    paths = [a for a in argv if not a.startswith('--')]
    opts = dict(a[2:].split('=', 1) for a in argv if a.startswith('--') and '=' in a)
    if len(paths) != 1 or set(opts) - {'tier', 'sides'}:
        raise SystemExit('usage: Blender -b --factory-startup -P metal-bollard.py -- <out.glb> '
                         '[--tier=Q|P|A..N|octagon --sides=12|16 (A-C only)]')
    tier = opts.get('tier', DEFAULT_TIER)
    sides = int(opts.get('sides', DEFAULT_SIDES))
    if tier == 'octagon':
        return os.path.abspath(paths[0]), None, sides
    if tier in ('P', 'Q'):
        return os.path.abspath(paths[0]), tier, sides
    if tier not in LATHE_TIERS:
        raise SystemExit(f'--tier must be one of Q, P, {", ".join(LATHE_TIERS)} or octagon')
    lip_sides = next(q[3] for q in LATHE_TIERS[tier] if q[2] == 'lip') or sides
    if lip_sides % 4:
        raise SystemExit('the lip ring needs a multiple of 4 sides (vertices on +-X and +-Z)')
    return os.path.abspath(paths[0]), tier, sides


# ---------------------------------------------------------------- frames

def to_blender_unit(p):
    x, y, z = p[0], p[1] - NODE_Y, p[2]
    return (x / NODE_SCALE, -z / NODE_SCALE, y / NODE_SCALE)


def dir_to_blender(n):
    length = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
    return (n[0] / length, -n[2] / length, n[1] / length)


def ring_point(r, y, theta):
    return (r * math.sin(theta), y, r * math.cos(theta))


def radial_normal(theta, radial, axial):
    return (radial * math.sin(theta), axial, radial * math.cos(theta))


# ---------------------------------------------------------------- procedural fields

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


_M = np.uint64(0xFFFFFFFF)


def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.uint64) * np.uint64(73856093)) ^ (iy.astype(np.uint64) * np.uint64(19349663)) \
        ^ (iz.astype(np.uint64) * np.uint64(83492791)) ^ np.uint64(seed * 2654435761 & 0xFFFFFFFF)
    h &= _M
    h ^= h >> np.uint64(13)
    h = (h * np.uint64(1274126177)) & _M
    h ^= h >> np.uint64(16)
    return (h & np.uint64(0xFFFFFF)).astype(np.float64) / float(0xFFFFFF)


def value_noise(p, freq, seed):
    """Trilinear value noise on world position p (..., 3) in metres, range ~[-1, 1]."""
    q = p * freq + 1000.0
    i0 = np.floor(q).astype(np.int64)
    f = q - i0
    f = f * f * (3 - 2 * f)
    out = 0.0
    for dx in (0, 1):
        wx = f[..., 0] if dx else 1 - f[..., 0]
        for dy in (0, 1):
            wy = f[..., 1] if dy else 1 - f[..., 1]
            for dz in (0, 1):
                wz = f[..., 2] if dz else 1 - f[..., 2]
                out = out + wx * wy * wz * _hash(i0[..., 0] + dx, i0[..., 1] + dy, i0[..., 2] + dz, seed)
    return out * 2 - 1


def fbm(p, freq, seed, octaves=4, gain=0.5):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + amp * value_noise(p, freq * 2 ** o, seed + 101 * o)
        norm += amp
        amp *= gain
    return total / norm


# ---------------------------------------------------------------- textures

def texel_fields():
    """Per texel: island, world position, and distances in TEXELS to the features wear follows.

    The UVs are re-laid so each island maps exactly onto its faces: post facets
    are u = j/8 .. (j+1)/8, the flare fan is inverted through its buried apex
    (u is compressed toward each facet's centre line on the way in), the cap is
    a planar disc. Wear is authored in texel units, because at ~4 mm per texel
    anything under ~5 px is speckle once JPEG has had it.
    """
    H = W = TEX
    v = (np.arange(H) + 0.5) / H  # row 0 = bottom (Blender image origin)
    u = (np.arange(W) + 0.5) / W
    V, U = np.meshgrid(v, u, indexing='ij')

    split_pf = (V_POST1 + V_FLARE0) / 2
    split_fd = (V_FLARE1 + (DOME_CV - DOME_RUV)) / 2
    on_post = V < split_pf
    on_flare = (V >= split_pf) & (V < split_fd)
    on_dome = V >= split_fd

    corners = np.array([2 * math.pi * j / LIP_SIDES for j in range(LIP_SIDES + 1)])
    sin_c, cos_c = np.sin(corners), np.cos(corners)

    # ---- post: flat facets, chord interpolation
    j = np.floor(U * LIP_SIDES).astype(np.int64) % LIP_SIDES
    s = U * LIP_SIDES - np.floor(U * LIP_SIDES)
    post_y = np.clip((V - V_POST0) / (V_POST1 - V_POST0), 0, 1) * Y_POST_TOP
    post_r = _post_r(post_y)
    px_ = post_r * ((1 - s) * sin_c[j] + s * sin_c[j + 1])
    pz_ = post_r * ((1 - s) * cos_c[j] + s * cos_c[j + 1])
    post_arris = np.minimum(s, 1 - s) * FACET_PX

    # ---- flare: fan through the buried apex; t = apex->lip parameter
    t = np.clip((V - V_APEX_UV) / (V_FLARE1 - V_APEX_UV), 1e-3, 1.0)
    mid = (j + 0.5) / LIP_SIDES
    u_lip = np.clip(mid + (U - mid) / t, j / LIP_SIDES, (j + 1) / LIP_SIDES)
    s_f = u_lip * LIP_SIDES - j
    fx = t * R_LIP * ((1 - s_f) * sin_c[j] + s_f * sin_c[j + 1])
    fz = t * R_LIP * ((1 - s_f) * cos_c[j] + s_f * cos_c[j + 1])
    fy = Y_APEX + t * (Y_LIP - Y_APEX)
    flare_f = np.clip((t - NECK_T) / (1 - NECK_T), 0, 1)  # 0 at the neck, 1 at the lip
    flare_lip_px = np.maximum(V_FLARE1 - V, 0) * TEX
    flare_rib = np.minimum(s_f, 1 - s_f) * FACET_PX * t

    # ---- cap: planar disc seen from above, on the hipped fan facets
    dx = (U - DOME_CU) / DOME_S
    dz = (V - DOME_CV) / DOME_S
    rho = np.hypot(dx, dz)
    ang = np.arctan2(dx, dz) % (2 * math.pi)
    jd = np.floor(ang / (2 * math.pi) * LIP_SIDES).astype(np.int64) % LIP_SIDES
    mid_th = (jd + 0.5) * 2 * math.pi / LIP_SIDES
    apothem = R_LIP * math.cos(math.pi / LIP_SIDES)
    q = np.clip((dx * np.sin(mid_th) + dz * np.cos(mid_th)) / apothem, 0, 1)  # 1 at the lip edge
    unused = on_dome & (q > 1.0 - 1e-6) & (rho > R_LIP * 1.10)
    dome_y = Y_LIP + CAP_RISE * (1 - q)
    dome_lip_px = (1 - q) * apothem * DOME_S * TEX
    off = np.abs((ang - jd * 2 * math.pi / LIP_SIDES) - math.pi / LIP_SIDES)
    dome_hip = (math.pi / LIP_SIDES - off) * rho * DOME_S * TEX  # px to the nearest hip line

    x = np.where(on_dome, dx, np.where(on_flare, fx, px_))
    z = np.where(on_dome, dz, np.where(on_flare, fz, pz_))
    y = np.where(on_dome, dome_y, np.where(on_flare, fy, post_y))
    return dict(on_post=on_post, on_flare=on_flare, on_dome=on_dome, unused=unused,
                P=np.stack([x, y, z], axis=-1), y=y, U=U, V=V, j=j, s=s,
                post_arris=post_arris, flare_f=flare_f, flare_lip_px=flare_lip_px, flare_rib=flare_rib,
                dome_lip_px=dome_lip_px, dome_hip=dome_hip, q=q, jd=jd, ang=ang, rho=rho)


def build_maps():
    F = texel_fields()
    on_post, on_flare, on_dome = F['on_post'], F['on_flare'], F['on_dome']
    P, y = F['P'], F['y']
    H = W = TEX
    U_px, V_px = F['U'] * TEX, F['V'] * TEX

    mottle = fbm(P, 7.0, SEED + 3, 3)  # ~14 cm paint cloud
    breakup = 0.5 + 0.5 * fbm(P, 11.0, SEED + 7, 3)  # ~9 cm: where an edge is rubbed through
    nudge = fbm(P, 38.0, SEED + 2, 2)  # ~2.6 cm: ragged edges of the wear shapes (in px below)

    # ---------------- arris wear: continuous rubbed bands on the eight cast edges,
    # heavy in the kick zone (lowest 30 cm) and under the head, lighter between
    w_post = 0.36 + 0.64 * (1 - smoothstep(0.06, 0.30, y)) + 0.22 * smoothstep(Y_NECK - 0.12, Y_NECK - 0.02, y)
    w_post = np.clip(w_post, 0, 1)
    width = 1.0 + 2.0 * w_post * breakup + 0.7 * nudge  # half-width in px: ~1.5-3.5 px
    arris_band = smoothstep(width + 1.0, width - 0.6, F['post_arris'])
    gate = np.clip((breakup - (1.02 - 0.78 * w_post)) * 5.0 + 0.5, 0, 1)
    arris = on_post * arris_band * gate

    # ---------------- lip: the rim is the most-knocked edge; worn on both faces
    lip_w = 2.2 + 1.8 * breakup + 1.0 * nudge
    lip_top = on_dome * smoothstep(lip_w + 1.0, lip_w - 0.8, F['dome_lip_px']) * np.clip(breakup * 1.6 - 0.15, 0, 1)
    lip_under = on_flare * smoothstep(lip_w * 0.8 + 1.0, lip_w * 0.8 - 0.8, F['flare_lip_px']) \
        * np.clip(breakup * 1.6 - 0.25, 0, 1)
    hips = on_dome * smoothstep(2.6, 0.8, F['dome_hip']) * smoothstep(0.25, 0.6, F['q']) \
        * np.clip(breakup * 1.4 - 0.35, 0, 1) * 0.7
    ribs = on_flare * smoothstep(2.4, 0.8, F['flare_rib']) * np.clip(breakup * 1.4 - 0.4, 0, 1) * 0.6
    wear = np.clip(np.maximum.reduce([arris, lip_top, lip_under, hips, ribs]), 0, 1)

    # ---------------- rope polish: a mooring line rides in the neck, so the flare and the
    # top of the post under it are polished bright, in horizontal strands
    strands = 0.5 + 0.5 * fbm(P * np.array([0.12, 1.0, 0.12]), 55.0, SEED + 5, 3)
    rope = on_flare * smoothstep(0.0, 0.18, F['flare_f']) * (1 - smoothstep(0.62, 0.86, F['flare_f']))
    rope = rope + on_post * smoothstep(Y_NECK - 0.045, Y_NECK - 0.012, y)
    rope = rope * (0.55 + 0.45 * (0.5 + 0.5 * mottle))
    polish = np.clip(rope * smoothstep(0.42, 0.72, strands), 0, 1) * 0.65

    # ---------------- neck: dirt packed into the concave join, both sides of it
    neck_dirt = np.clip(on_post * np.exp(-((Y_NECK - y) / 0.010) ** 2)
                        + on_flare * np.exp(-(F['flare_f'] / 0.10) ** 2), 0, 1)

    # ---------------- foot skirt: grime and rust with a ragged top, creeping up the arrises
    ring_noise = fbm(P * np.array([1.0, 0.0, 1.0]), 16.0, SEED + 11, 3)
    edge_h = 0.085 + 0.028 * ring_noise + 0.07 * on_post * smoothstep(5.0, 1.0, F['post_arris'])
    skirt = on_post * (1 - smoothstep(edge_h - 0.012, edge_h + 0.008, y))
    rust_patch = smoothstep(0.42, 0.62, 0.5 + 0.5 * fbm(P, 18.0, SEED + 12, 3))
    foot_rust = skirt * np.clip(rust_patch + 0.6 * smoothstep(5.0, 1.0, F['post_arris']), 0, 1)
    foot_grime = skirt * (1 - foot_rust)

    # ---------------- chips: a few large knocks where knocks happen (arrises, lip corners)
    primer = np.zeros((H, W))
    chip_core = np.zeros((H, W))
    chip_rust = np.zeros((H, W))
    weep = np.zeros((H, W))
    post_chips = [  # (arris index, height m, radius px, rusted, weep length px)
        (1, 0.17, 7.0, True, 26.0),
        (6, 0.11, 8.0, True, 0.0),
        (3, 0.30, 5.0, True, 18.0),
    ]
    for arris_j, cy, rad, rusted, weep_len in post_chips:
        cu = arris_j * FACET_PX
        cv = (V_POST0 + (V_POST1 - V_POST0) * cy / Y_POST_TOP) * TEX
        du = (U_px - cu + TEX / 2) % TEX - TEX / 2
        dv = V_px - cv
        dist = np.sqrt((du / rad) ** 2 + (dv / (rad * 1.7)) ** 2) + 0.55 * nudge
        core = on_post * smoothstep(1.0, 0.85, dist)
        ring = on_post * smoothstep(1.0 + 1.6 / rad, 1.0 + 0.5 / rad, dist)
        primer = np.maximum(primer, 0.6 * ring)
        chip_core = np.maximum(chip_core, core)
        if rusted:
            chip_rust = np.maximum(chip_rust, core * 0.8)
        if weep_len > 0:
            below = np.clip(-dv / weep_len, 0, 1)
            streak = on_post * (dv < 0) * (below < 1) * np.exp(-(du / (2.2 * (1 - 0.5 * below))) ** 2)
            weep = np.maximum(weep, streak * (1 - below) ** 1.2 * 0.8)
    for corner_j, rad in ((3, 4.5), (7, 5.0), (0, 3.5)):
        th = 2 * math.pi * corner_j / LIP_SIDES
        cu = (DOME_CU + DOME_S * (R_LIP - 0.006) * math.sin(th)) * TEX
        cv = (DOME_CV + DOME_S * (R_LIP - 0.006) * math.cos(th)) * TEX
        dist = np.hypot(U_px - cu, V_px - cv) / rad + 0.4 * nudge
        core = on_dome * smoothstep(1.0, 0.85, dist)
        ring = on_dome * smoothstep(1.0 + 1.6 / rad, 1.0 + 0.5 / rad, dist)
        primer = np.maximum(primer, ring)
        chip_core = np.maximum(chip_core, core)
        chip_rust = np.maximum(chip_rust, core * 0.5)
    primer = np.clip(primer - chip_core, 0, 1)

    # ---------------- cap: a shade sun-faded, a little more at the crown
    cap = on_dome * (0.8 + 0.2 * smoothstep(0.2, 0.9, 1 - F['q']))

    # ---------------- colour
    def mix(base, target, amount):
        a = np.clip(amount, 0, 1)[..., None]
        return base * (1 - a) + target * a

    value = 1.0 + 0.06 * mottle
    value = value * (1.0 - 0.08 * on_post * (1 - smoothstep(0.0, 0.4, y)))  # splash-dulled low down
    value = value * (1.0 - 0.10 * on_flare)  # the underside faces down
    value = value * (1.0 - 0.38 * neck_dirt)
    colour = PAINT[None, None, :] * value[..., None]
    colour = mix(colour, CAP_PAINT * value[..., None], cap)
    rust_tone = mix(RUST[None, None, :] * np.ones((H, W, 1)), RUST_DARK, 0.5 + 0.5 * nudge)
    colour = mix(colour, GRIME * (0.9 + 0.1 * value[..., None]), 0.85 * foot_grime)
    colour = mix(colour, rust_tone, 0.85 * foot_rust)
    colour = mix(colour, STEEL * (0.94 + 0.08 * breakup[..., None]), 0.72 * wear)
    colour = mix(colour, POLISH * (0.94 + 0.08 * strands[..., None]), polish)
    colour = mix(colour, PRIMER, 0.9 * primer)
    colour = mix(colour, STEEL, chip_core)
    colour = mix(colour, rust_tone, chip_rust)
    colour = mix(colour, rust_tone, 0.7 * weep)
    colour[F['unused']] = PAINT
    colour = np.clip(colour, 0, 255) / 255.0

    # ---------------- metallic-roughness (G roughness, B metalness): paint and bare metal differ
    rough = np.full((H, W), SHEEN['paint'][0]) + 0.03 * mottle
    metal = np.zeros((H, W))

    def layer(name, amount):
        nonlocal rough, metal
        a = np.clip(amount, 0, 1)
        r, m = SHEEN[name]
        rough = rough * (1 - a) + r * a
        metal = metal * (1 - a) + m * a

    layer('cap', cap)
    layer('grime', foot_grime)
    layer('rust', foot_rust)
    layer('steel', wear)
    layer('polish', polish)
    layer('primer', primer)
    layer('steel', chip_core)
    layer('rust', np.maximum(chip_rust, weep))
    rough = np.clip(rough, 0.05, 1)
    rough[F['unused']] = SHEEN['paint'][0]
    metal[F['unused']] = 0.0
    mr = np.stack([np.ones_like(rough), rough, np.clip(metal, 0, 1)], axis=-1)  # R unused (no occlusion)
    print(f'BOLLARD_MAPS neck y {Y_NECK:.4f} r {R_NECK:.4f}; roughness {rough.min():.2f}..{rough.max():.2f}; '
          f'wear texels>0.5: {(wear > 0.5).sum()}; polish>0.5: {(polish > 0.5).sum()}')
    return colour, mr


def make_image(name, rgb, non_color, fmt='JPEG'):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False, is_data=non_color)
    # Colour space and format BEFORE the pixels: changing either on a generated
    # image resets its buffer (an all-black map, a round-1 bug).
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    img.file_format = fmt  # the exporter's AUTO mode keeps it
    rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], axis=-1).astype(np.float32)
    img.pixels.foreach_set(rgba.reshape(-1))
    img.update()
    back = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(back)
    if np.abs(back - rgba.reshape(-1)).max() > 3e-3:  # byte quantisation is 0.002
        raise SystemExit(f'{name}: pixel buffer did not take the authored values')
    img.pack()
    return img


def make_material():
    colour, mr = build_maps()
    col_img = make_image('metal-bollard-colour', colour, non_color=False)
    mr_img = make_image('metal-bollard-metal-rough', mr, non_color=True)
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False  # glTF doubleSided: true, as delivered
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col_node = nodes.new('ShaderNodeTexImage')
    col_node.image = col_img
    links.new(col_node.outputs['Color'], bsdf.inputs['Base Color'])
    mr_node = nodes.new('ShaderNodeTexImage')
    mr_node.image = mr_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(mr_node.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


# ---------------------------------------------------------------- mesh

def build_mesh(mat):
    verts, faces, face_uvs, face_normals, face_smooth = [], [], [], [], []

    def ring(n, r, y):
        idx = []
        for j in range(n):
            idx.append(len(verts))
            verts.append(to_blender_unit(ring_point(r, y, 2 * math.pi * j / n)))
        return idx

    foot = ring(FOOT_SIDES, R_FOOT, 0.0)
    neck = ring(NECK_SIDES, R_POST_TOP, Y_POST_TOP)
    lip = ring(LIP_SIDES, R_LIP, Y_LIP)
    pole = len(verts)
    verts.append(to_blender_unit((0.0, Y_TOP, 0.0)))
    apex = len(verts)
    verts.append(to_blender_unit((0.0, Y_APEX, 0.0)))

    taper = (R_POST_TOP - R_FOOT) / Y_POST_TOP
    post_n = (1.0 / math.hypot(1, taper), -taper / math.hypot(1, taper))

    def tilted(deg):
        return (math.sin(math.radians(deg)), math.cos(math.radians(deg)))

    dome_n = tilted(DOME_LIP_TILT)
    under_lip_n = tilted(UNDER_LIP_TILT)
    under_apex_n = tilted(UNDER_APEX_TILT)
    up = dir_to_blender((0.0, 1.0, 0.0))

    def n_at(th, prof):
        return dir_to_blender(radial_normal(th, *prof))

    def add(corners, smooth=False):
        """corners: [(vertex, uv, normal)]; wound so the face points along its normals.

        smooth=False: the face is shaded flat (its own geometric normal on every
        corner), so the post keeps crisp cast arrises. smooth=True: the authored
        corner normals are exported, so the head shades as a rounded bell.
        """
        a, b, c = (np.array(verts[k[0]]) for k in corners)
        geo = np.cross(b - a, c - a)
        mean = np.sum([np.array(k[2]) for k in corners], axis=0)
        if geo.dot(mean) < 0:
            corners = corners[::-1]
        faces.append([k[0] for k in corners])
        face_uvs.append([k[1] for k in corners])
        face_normals.append([k[2] for k in corners])
        face_smooth.append(smooth)

    # Post band: merge walk round two rings of different counts.
    def v_post(y):
        return V_POST0 + (V_POST1 - V_POST0) * y / Y_POST_TOP

    i = k = 0
    nA, nB = FOOT_SIDES, NECK_SIDES
    while i < nA or k < nB:
        ta_next = 2 * math.pi * (i + 1) / nA
        tb_next = 2 * math.pi * (k + 1) / nB
        if i < nA and (k >= nB or ta_next <= tb_next + 1e-12):
            t0, t1, tb = 2 * math.pi * i / nA, ta_next, 2 * math.pi * k / nB
            add([(foot[i % nA], (t0 / (2 * math.pi), v_post(0)), n_at(t0, post_n)),
                 (foot[(i + 1) % nA], (t1 / (2 * math.pi), v_post(0)), n_at(t1, post_n)),
                 (neck[k % nB], (tb / (2 * math.pi), v_post(Y_POST_TOP)), n_at(tb, post_n))])
            i += 1
        else:
            ta, t0, t1 = 2 * math.pi * i / nA, 2 * math.pi * k / nB, tb_next
            add([(foot[i % nA], (ta / (2 * math.pi), v_post(0)), n_at(ta, post_n)),
                 (neck[(k + 1) % nB], (t1 / (2 * math.pi), v_post(Y_POST_TOP)), n_at(t1, post_n)),
                 (neck[k % nB], (t0 / (2 * math.pi), v_post(Y_POST_TOP)), n_at(t0, post_n))])
            k += 1

    def dome_uv(j):
        th = 2 * math.pi * j / LIP_SIDES
        return (DOME_CU + DOME_S * R_LIP * math.sin(th), DOME_CV + DOME_S * R_LIP * math.cos(th))

    for j in range(LIP_SIDES):
        j1 = (j + 1) % LIP_SIDES
        th0, th1 = 2 * math.pi * j / LIP_SIDES, 2 * math.pi * (j + 1) / LIP_SIDES
        u0, u1 = j / LIP_SIDES, (j + 1) / LIP_SIDES
        # Dome fan, planar-mapped disc.
        add([(lip[j], dome_uv(j), n_at(th0, dome_n)),
             (lip[j1], dome_uv(j + 1), n_at(th1, dome_n)),
             (pole, (DOME_CU, DOME_CV), up)], smooth=True)
        # Flared underside fan, its own strip.
        add([(lip[j1], (u1, V_FLARE1), n_at(th1, under_lip_n)),
             (lip[j], (u0, V_FLARE1), n_at(th0, under_lip_n)),
             (apex, ((u0 + u1) / 2, V_APEX_UV), n_at((th0 + th1) / 2, under_apex_n))], smooth=True)

    tris = len(faces)
    if tris * 3 > INDEX_BUDGET:
        raise SystemExit(f'{tris * 3} indices exceeds the {INDEX_BUDGET}-index budget')

    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        ns = face_normals[poly.index]
        mean = [sum(c[q] for c in ns) for q in range(3)]
        if poly.normal.dot(mean) <= 0:
            raise SystemExit(f'face {poly.index} wound inward')

    uv_layer = mesh.uv_layers.new(name='UVMap')
    loop_normals = [None] * len(mesh.loops)
    for poly in mesh.polygons:
        poly.use_smooth = True  # every corner carries an explicit normal (below)
        corner = {vv: c for c, vv in enumerate(faces[poly.index])}
        for li in poly.loop_indices:
            c = corner[mesh.loops[li].vertex_index]
            uv_layer.data[li].uv = face_uvs[poly.index][c]
            loop_normals[li] = tuple(face_normals[poly.index][c]) if face_smooth[poly.index] \
                else tuple(poly.normal)
    mesh.normals_split_custom_set(loop_normals)
    mesh.materials.append(mat)
    return mesh, tris


def export(path, image_format='JPEG'):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_image_format=image_format,
        export_jpeg_quality=JPEG_QUALITY,
        export_image_quality=JPEG_QUALITY,
        export_vertex_color='NONE',
        export_colors=False,
        export_copyright='MillOS authored geometry',
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})


# ---------------------------------------------------------------- lathe tiers
#
# Tier C at 12 sides is the delivered build under D-036 (324 indices). The other
# tiers and side counts stay as evidence for budget decisions. Every
# tier is a true lathe of one traced side profile with an open foot, S sides,
# smooth normals around the axis and creases only where the profile turns:
#   A: foot -> neck -> lip, dome fan to the pole          2S + 2S + S = 5S triangles
#   B: A plus a cast base chamfer ring                    7S
#   C: B plus a mid ring on the dome sphere               9S
# Indices are 3 x triangles: S=12 gives 180 / 252 / 324, S=16 gives 240 / 336 / 432.
_DOME_YC = (Y_TOP ** 2 - 0.725 ** 2 - R_LIP ** 2) / (2 * (Y_TOP - 0.725))
_DOME_R = Y_TOP - _DOME_YC
_MID_ANG = 0.5 * math.atan2(R_LIP, 0.725 - _DOME_YC)
_DOME_MID = (_DOME_R * math.sin(_MID_ANG), _DOME_YC + _DOME_R * math.cos(_MID_ANG))
# (r, y, role, sides, normal mode). sides None = the --sides value. Normal modes:
#   crease      the ring splits its normals between the segment below and above
#   smooth      one normal, the average of both segments (a filleted join)
#   lip_sphere  crisp underside, sphere normal above (tier C's dome)
#   rim         crisp underside, a rounded rim above: halfway between straight
#               out and the cap segment, so a shallow cap shades as a bull-nose
#   sphere      the dome sphere normal; the last ring is the pole.
# The merge walk joins rings of different side counts, so each ring's count is
# spent where its outline shows. Triangles = ring0 + 2 x every ring above it.
Y_DOME_LIP = 0.722
HEAD_SHOULDER = (0.114, 0.786)
LATHE_TIERS = {
    'A': [(0.138, 0.0, 'foot', None, 'crease'), (0.094, 0.600, 'neck', None, 'crease'),
          (R_LIP, 0.725, 'lip', None, 'lip_sphere'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    'B': [(0.146, 0.0, 'foot', None, 'crease'), (0.126, 0.045, 'chamfer', None, 'crease'),
          (0.094, 0.600, 'neck', None, 'crease'),
          (R_LIP, 0.725, 'lip', None, 'lip_sphere'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    'C': [(0.146, 0.0, 'foot', None, 'crease'), (0.126, 0.045, 'chamfer', None, 'crease'),
          (0.094, 0.600, 'neck', None, 'crease'), (R_LIP, 0.725, 'lip', None, 'lip_sphere'),
          (_DOME_MID[0], _DOME_MID[1], 'dome', None, 'sphere'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    # Tier D, the all-16 alternative: 16 + 2(16 + 14 + 16) = 108 triangles. Every
    # outline is a 16-gon, but no ring is left for a shoulder, so the head is a
    # knife-edged trumpet with a flat 9 deg crown (rounding only in the normals).
    'D': [(0.146, 0.0, 'foot', 16, 'crease'), (0.127, 0.044, 'chamfer', 16, 'crease'),
          (0.093, 0.648, 'neck', 14, 'smooth'), (R_LIP, 0.776, 'lip', 16, 'rim'),
          (0.0, Y_TOP, 'pole', 1, 'pole')],
    # Tier F, rejected in review: a true bull-nose shoulder ring, paid for with
    # 14/14/8/16/8. The 8-sided shoulder read as an octagonal nut in every orbit
    # view and as an octagon inside the rim from above.
    'G': [(0.146, 0.0, 'foot', 12, 'crease'), (0.127, 0.044, 'chamfer', 12, 'crease'),
          (0.093, 0.615, 'neck', 8, 'smooth'), (R_LIP, 0.742, 'lip', 16, 'rim'),
          (0.122, 0.786, 'shoulder', 12, 'smooth'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    # D-036 delivered build (tier H). The orbit cameras sit about 0.9 m up, within
    # ~4 deg of edge-on to the cap, so the cap's silhouette is its profile, and a
    # ring shows its sides wherever its ellipse opens: the ground and flange from
    # above, the rim from above (it is the whole top-down outline), and every ring
    # at its left and right extents. The head needs a shoulder ring to read as a
    # rounded cap rather than a pointed hat (tier E) or a trumpet (tier D), and
    # 108 triangles cannot put 16 on five rings. So the rim and the ground contact
    # carry 16, the flange 12, the bull-nose shoulder 10 and the waist 8:
    # 16 + 2(12 + 8 + 16 + 10) = 108 triangles = 324 indices.
    'H': [(0.146, 0.0, 'foot', 16, 'crease'), (0.127, 0.044, 'chamfer', 12, 'crease'),
          (0.093, 0.615, 'neck', 8, 'smooth'), (R_LIP, 0.742, 'lip', 16, 'rim'),
          (0.122, 0.786, 'shoulder', 10, 'smooth'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    # Round 3 delivered build (tier L): undercut lip band, rim on top, crown fan.
    'L': [(0.146, 0.0, 'foot', 16, 'crease'), (0.127, 0.044, 'chamfer', 10, 'crease'),
          (0.093, 0.620, 'neck', 8, 'smooth'), (0.146, 0.752, 'lipunder', 12, 'crease'),
          (R_LIP, 0.792, 'lip', 16, 'dome_rim'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    # Round 4 strike-rule rebuild (tiers M and N): a re-traced mushroom profile.
    # Every band joins rings of 1:1 or 1:2/1:3 counts at coincident angles (no
    # irregular merge walk: the 10->8 shaft band drew vertical bands in clay),
    # the only creased ring is the lip's underside edge, and the chamfer ring is
    # gone (its crease drew a 10-gon). The rim is the whole top-down outline, so
    # it carries 24. The neck sits high (y 0.650), so the underside is a short
    # steep mushroom flare, not a 13 cm trumpet cone; the head rolls over a
    # bull-nose rim onto ONE smooth shoulder ring and a low crown.
    #   M: 12 + 12 | 12 + 24 | 24 + 12 | fan 12 = 108 triangles = 324 indices
    #   N: 16 + 8  | 8 + 24  | 24 + 12 | fan 12 = 104 triangles = 312 indices
    # The head: a crisp overhanging lip (the widest ring, normal straight out
    # above it) rolls up a 61 deg side onto ONE smooth shoulder ring and a 7 deg
    # crown. A 68 deg wall under a flat top read as a hex nut; a 13 deg crown
    # (two chords of a quarter-ellipse) peaked at the pole like a turret.
    'M': [(0.138, 0.0, 'foot', 12, 'crease'), (0.098, 0.640, 'neck', 12, 'smooth'),
          (R_LIP, Y_DOME_LIP, 'lip', 24, 'ellipse_rim'), (*HEAD_SHOULDER, 'shoulder', 12, 'smooth'),
          (0.0, Y_TOP, 'pole', 1, 'pole')],
    'N': [(0.138, 0.0, 'foot', 16, 'crease'), (0.098, 0.640, 'neck', 8, 'smooth'),
          (R_LIP, Y_DOME_LIP, 'lip', 24, 'ellipse_rim'), (*HEAD_SHOULDER, 'shoulder', 12, 'smooth'),
          (0.0, Y_TOP, 'pole', 1, 'pole')],
    'F': [(0.146, 0.0, 'foot', 14, 'crease'), (0.127, 0.044, 'chamfer', 14, 'crease'),
          (0.093, 0.615, 'neck', 8, 'smooth'), (R_LIP, 0.742, 'lip', 16, 'rim'),
          (0.120, 0.786, 'shoulder', 8, 'smooth'), (0.0, Y_TOP, 'pole', 1, 'pole')],
    'E': [(0.146, 0.0, 'foot', 16, 'crease'), (0.127, 0.044, 'chamfer', 16, 'crease'),
          (0.093, 0.625, 'neck', 14, 'smooth'), (R_LIP, 0.758, 'lip', 16, 'rim'),
          (0.0, Y_TOP, 'pole', 1, 'pole')],
}
LATHE_V_TOP = 250 * PX  # the strip runs foot (v 0) to pole; the rest of the atlas is gutter


def _lathe_arcs(prof):
    arcs = [0.0]
    for (r0, y0, *_), (r1, y1, *_) in zip(prof, prof[1:]):
        arcs.append(arcs[-1] + math.hypot(r1 - r0, y1 - y0))
    return arcs


def _sphere_normal(r, y):
    return (r / _DOME_R, (y - _DOME_YC) / _DOME_R)


def _seg_normal(prof, k):
    """Outward (radial, axial) normal of profile segment k -> k+1."""
    (r0, y0, *_), (r1, y1, *_) = prof[k], prof[k + 1]
    dr, dy = r1 - r0, y1 - y0
    n = math.hypot(dr, dy)
    return (dy / n, -dr / n)


def lathe_maps(prof):
    arcs = _lathe_arcs(prof)
    total = arcs[-1]
    px_per_m = LATHE_V_TOP * TEX / total
    H = W = TEX
    v = (np.arange(H) + 0.5) / H
    u = (np.arange(W) + 0.5) / W
    V, U = np.meshgrid(v, u, indexing='ij')
    unused = V > LATHE_V_TOP
    a = np.clip(V / LATHE_V_TOP, 0, 1) * total
    seg = np.clip(np.searchsorted(np.array(arcs), a, side='right') - 1, 0, len(prof) - 2)
    r0 = np.array([q[0] for q in prof])[seg]
    y0 = np.array([q[1] for q in prof])[seg]
    r1 = np.array([q[0] for q in prof])[seg + 1]
    y1 = np.array([q[1] for q in prof])[seg + 1]
    a0 = np.array(arcs)[seg]
    a1 = np.array(arcs)[seg + 1]
    t = (a - a0) / (a1 - a0)
    r = r0 + (r1 - r0) * t
    y = y0 + (y1 - y0) * t
    th = U * 2 * math.pi
    P = np.stack([r * np.sin(th), y, r * np.cos(th)], axis=-1)
    roles = [q[2] for q in prof]

    def px_to(role):
        if role not in roles:
            return np.full((H, W), 1e9)
        return np.abs(a - arcs[roles.index(role)]) * px_per_m

    lip_a = arcs[roles.index('lip')]
    neck_a = arcs[roles.index('neck')]
    on_dome = a > lip_a
    on_flare = (a > neck_a) & ~on_dome
    on_post = a <= neck_a
    flare_f = np.clip((a - neck_a) / (lip_a - neck_a), 0, 1)

    mottle = fbm(P, 7.0, SEED + 3, 3)
    breakup = 0.5 + 0.5 * fbm(P, 11.0, SEED + 7, 3)
    nudge = fbm(P, 38.0, SEED + 2, 2)

    # Wear follows the profile's edges, which run AROUND the post: the lip (most
    # knocked, both faces) and the chamfer's top edge. Nothing runs vertically.
    # The rim's crown is the knocked edge: a thin rubbed line on top (a wide one
    # reads as the rim of a cup from above), a broader one round the underside.
    lip_w = np.where(on_dome, 1.3 + 1.0 * breakup + 0.5 * nudge, 2.4 + 2.2 * breakup + 1.0 * nudge)
    lip = smoothstep(lip_w + 1.0, lip_w - 0.8, px_to('lip')) * np.clip(breakup * 1.7 - 0.2, 0, 1)
    ch_w = 1.6 + 1.6 * breakup + 0.8 * nudge
    chamfer_edge = smoothstep(ch_w + 1.0, ch_w - 0.6, px_to('chamfer')) * np.clip(breakup * 1.6 - 0.3, 0, 1)
    chamfer_face = 0.0
    if 'chamfer' in roles:
        chamfer_face = (a < arcs[roles.index('chamfer')]) * np.clip(breakup * 1.3 - 0.55, 0, 1) * 0.8
    # No wear line on the shoulder ring: it is 8-sided, and a line there traces an
    # octagon in the top-down view.
    wear = np.clip(np.maximum.reduce([lip, chamfer_edge, np.broadcast_to(chamfer_face, (H, W))]), 0, 1)

    # Rope polish. A mooring line rides in the waist and burnishes the paint thin
    # there: one rubbed zone with a ragged, isotropic edge, crossed by a few fine
    # concentric rope scores. The scores are driven by arc position (so they run
    # exactly round the casting) at a 6 px period; the round-1 stretched 3D field
    # here smeared into wavy streaks.
    y_neck = prof[roles.index('neck')][1]
    rope = on_flare * (1 - smoothstep(0.30, 0.55, flare_f))
    rope = rope + on_post * smoothstep(y_neck - 0.050, y_neck - 0.012, y)
    rope = rope * np.clip((0.5 + 0.5 * fbm(P, 24.0, SEED + 5, 3)) * 1.8 - 0.45, 0, 1)
    scores = 0.5 + 0.5 * np.cos(2 * math.pi * a * px_per_m / 6.0 + 0.8 * nudge)
    strands = 0.85 + 0.15 * scores  # shared with the colour mix below
    polish = np.clip(rope * (0.6 + 0.12 * smoothstep(0.6, 0.95, scores)), 0, 1) * 0.55

    # Weathering on the post: vertical wash streaks (rain off the head runs down
    # the casting), a little darker under the flare, plus scuffs at kick height.
    wash = fbm(P * np.array([1.0, 0.10, 1.0]), 34.0, SEED + 21, 3)
    run_off = on_post * smoothstep(0.10, y_neck - 0.04, y) * (0.5 + 0.5 * wash)

    neck_dirt = np.clip(np.exp(-(px_to('neck') / 3.5) ** 2), 0, 1)

    ring_noise = fbm(P * np.array([1.0, 0.0, 1.0]), 16.0, SEED + 11, 3)
    edge_h = 0.085 + 0.028 * ring_noise
    skirt = on_post * (1 - smoothstep(edge_h - 0.012, edge_h + 0.008, y))
    rust_patch = smoothstep(0.42, 0.62, 0.5 + 0.5 * fbm(P, 18.0, SEED + 12, 3))
    foot_rust = skirt * rust_patch
    foot_grime = skirt * (1 - foot_rust)

    U_px, V_px = U * TEX, V * TEX
    primer = np.zeros((H, W))
    chip_core = np.zeros((H, W))
    chip_rust = np.zeros((H, W))
    chips = [(0.10, 'lip', 5.0, -1.5), (0.43, 'lip', 6.0, 1.5), (0.71, 'lip', 4.0, -1.0),
             (0.27, 'chamfer', 5.0, 0.0), (0.84, 'chamfer', 4.5, 0.0)]
    for cu, role, rad, dv_off in chips:
        if role not in roles:
            continue
        cv = arcs[roles.index(role)] * px_per_m + dv_off
        du = (U_px - cu * TEX + TEX / 2) % TEX - TEX / 2
        dist = np.hypot(du / (rad * 1.5), (V_px - cv) / rad) + 0.45 * nudge
        core = smoothstep(1.0, 0.85, dist)
        ring = smoothstep(1.0 + 1.6 / rad, 1.0 + 0.5 / rad, dist)
        primer = np.maximum(primer, 0.8 * ring)
        chip_core = np.maximum(chip_core, core)
        chip_rust = np.maximum(chip_rust, core * 0.6)
    # Kick scuffs: short horizontal rubs through the paint on the post, low down.
    ch_i = roles.index('chamfer') if 'chamfer' in roles else 0
    y_lo, y_hi = prof[ch_i][1], y_neck
    for cu, sy, rad in ((0.06, 0.21, 3.2), (0.38, 0.33, 2.6), (0.58, 0.17, 3.6), (0.89, 0.42, 2.4)):
        if not y_lo < sy < y_hi:
            continue
        cv = (arcs[ch_i] + (sy - y_lo) / (y_hi - y_lo) * (arcs[roles.index('neck')] - arcs[ch_i])) * px_per_m
        du = (U_px - cu * TEX + TEX / 2) % TEX - TEX / 2
        dist = np.hypot(du / (rad * 3.2), (V_px - cv) / rad) + 0.35 * nudge
        core = on_post * smoothstep(1.0, 0.8, dist)
        ring = on_post * smoothstep(1.0 + 1.6 / rad, 1.0 + 0.5 / rad, dist)
        primer = np.maximum(primer, 0.75 * np.maximum(ring, core))  # rubbed to primer,
        chip_core = np.maximum(chip_core, 0.3 * core)  # only just to the metal
    primer = np.clip(primer - chip_core, 0, 1)

    cap = on_dome * (0.8 + 0.2 * smoothstep(lip_a, total, a))
    facing_down = np.zeros((H, W))
    for k in range(len(prof) - 1):
        facing_down = np.where(seg == k, max(0.0, -_seg_normal(prof, k)[1]), facing_down)

    def mix(base, target, amount):
        am = np.clip(amount, 0, 1)[..., None]
        return base * (1 - am) + target * am

    value = 1.0 + 0.06 * mottle
    value = value * (1.0 - 0.08 * on_post * (1 - smoothstep(0.0, 0.4, y)))
    value = value * (1.0 - 0.14 * facing_down)
    value = value * (1.0 + 0.055 * on_post * wash - 0.07 * run_off)
    value = value * (1.0 - 0.38 * neck_dirt)
    colour = PAINT[None, None, :] * value[..., None]
    colour = mix(colour, CAP_PAINT * value[..., None], cap)
    rust_tone = mix(RUST[None, None, :] * np.ones((H, W, 1)), RUST_DARK, 0.5 + 0.5 * nudge)
    colour = mix(colour, GRIME * (0.9 + 0.1 * value[..., None]), 0.85 * foot_grime)
    colour = mix(colour, rust_tone, 0.85 * foot_rust)
    colour = mix(colour, STEEL * (0.94 + 0.08 * breakup[..., None]), 0.72 * wear)
    colour = mix(colour, POLISH * (0.94 + 0.08 * strands[..., None]), polish)
    colour = mix(colour, PRIMER, 0.9 * primer)
    colour = mix(colour, STEEL, chip_core)
    colour = mix(colour, rust_tone, chip_rust)
    colour[unused] = PAINT
    colour = np.clip(colour, 0, 255) / 255.0

    rough = np.full((H, W), SHEEN['paint'][0]) + 0.03 * mottle + 0.05 * run_off
    metal = np.zeros((H, W))

    def layer(name, amount):
        nonlocal rough, metal
        am = np.clip(amount, 0, 1)
        rr, mm = SHEEN[name]
        rough = rough * (1 - am) + rr * am
        metal = metal * (1 - am) + mm * am

    layer('cap', cap)
    layer('grime', foot_grime)
    layer('rust', foot_rust)
    layer('steel', wear)
    layer('polish', polish)
    layer('primer', primer)
    layer('steel', chip_core)
    layer('rust', chip_rust)
    rough = np.clip(rough, 0.05, 1)
    rough[unused] = SHEEN['paint'][0]
    metal[unused] = 0.0
    mr = np.stack([np.ones_like(rough), rough, np.clip(metal, 0, 1)], axis=-1)
    return colour, mr


def lathe_material(prof):
    colour, mr = lathe_maps(prof)
    col_img = make_image('metal-bollard-colour', colour, non_color=False)
    mr_img = make_image('metal-bollard-metal-rough', mr, non_color=True)
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col_node = nodes.new('ShaderNodeTexImage')
    col_node.image = col_img
    links.new(col_node.outputs['Color'], bsdf.inputs['Base Color'])
    mr_node = nodes.new('ShaderNodeTexImage')
    mr_node.image = mr_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(mr_node.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


# ---------------------------------------------------------------- tier L maps: re-laid UVs, hard-edged weathering
L_STRIP_TOP = 186 * PX  # body strip: foot (v 0) .. rim (v 186 px), u = angle
L_BAND_V = 190 * PX  # rows from here up belong to the crown island band
L_CROWN_CU, L_CROWN_CV = 32 * PX, 224 * PX
L_CROWN_RUV = 30 * PX  # the rim's radius on the planar crown island
L_CROWN_S = L_CROWN_RUV / R_LIP  # UV per metre
COLLAR = np.array([112, 114, 113], dtype=np.float64)  # rope-burnished casting (150 read as a white bandage)
CROWN_TILT_GAIN = 1.3  # crown normal at the rim: 1.3 x the shallow sphere's tilt (~8 deg)
# The orbit cameras see the head ~4 deg from edge-on, so the crown's own rise is its top
# outline: a 22 mm rise read as a pointed hat. 8 mm sits inside the rim's back edge.
LIP_ROUND_DEG = 20.0  # the lip band's normal at the rim tilts this far up: its top edge reads rounded
# (roughness, metalness). The turntable world is a flat grey, so a mirror metal
# would read as flat grey: the collar is carried on colour, score lines and a
# roughness step, with metalness held moderate.
L_SHEEN = {
    'paint': (0.56, 0.0), 'crown': (0.66, 0.0), 'grime': (0.88, 0.0), 'rust': (0.94, 0.0),
    'pit': (1.0, 0.0), 'steel': (0.34, 0.5), 'collar': (0.28, 0.35), 'primer': (0.74, 0.0),
    'streak': (0.76, 0.0),
}


def lip_maps(prof):
    """Maps for tier L. Every edge is authored in metres against a one-texel ramp."""
    roles = [q[2] for q in prof]
    arcs = _lathe_arcs(prof)
    strip_total = arcs[-2]  # foot .. rim; the crown is its own island
    px_per_m = L_STRIP_TOP * TEX / strip_total
    H = W = TEX
    v = (np.arange(H) + 0.5) / H
    u = (np.arange(W) + 0.5) / W
    V, U = np.meshgrid(v, u, indexing='ij')
    crown = V >= L_BAND_V
    strip = ~crown

    # strip: arc position a (m) along the profile, foot to rim
    a = np.clip(V / L_STRIP_TOP, 0, 1) * strip_total
    A0 = np.array(arcs)
    R0 = np.array([q[0] for q in prof])
    Y0 = np.array([q[1] for q in prof])
    seg = np.clip(np.searchsorted(A0, a, side='right') - 1, 0, len(prof) - 3)
    t = (a - A0[seg]) / (A0[seg + 1] - A0[seg])
    r = R0[seg] + (R0[seg + 1] - R0[seg]) * t
    ys = Y0[seg] + (Y0[seg + 1] - Y0[seg]) * t
    th = U * 2 * math.pi
    # crown island: planar, seen from above
    dx = (U - L_CROWN_CU) / L_CROWN_S
    dz = (V - L_CROWN_CV) / L_CROWN_S
    rho = np.hypot(dx, dz)
    y_rim, y_top = prof[-2][1], prof[-1][1]
    yc = y_rim + (y_top - y_rim) * (1 - np.clip(rho / R_LIP, 0, 1))
    x = np.where(crown, dx, r * np.sin(th))
    z = np.where(crown, dz, r * np.cos(th))
    y = np.where(crown, yc, ys)
    P = np.stack([x, y, z], axis=-1)
    horiz = P * np.array([1.0, 0.0, 1.0])
    tex_m = np.where(crown, 1 / (L_CROWN_S * TEX), np.maximum(1 / px_per_m, 2 * math.pi * r / TEX))

    def hard(sd):
        """sd > 0 inside, in metres: a one-texel edge, not an airbrush ramp."""
        return smoothstep(-0.6 * tex_m, 0.6 * tex_m, sd)

    A = {q: arcs[roles.index(q)] for q in ('chamfer', 'neck', 'lipunder', 'lip')}
    on_post = strip & (a < A['neck'])
    on_flare = strip & (a >= A['neck']) & (a < A['lipunder'])
    on_band = strip & (a >= A['lipunder'])
    y_ch, y_neck = prof[roles.index('chamfer')][1], prof[roles.index('neck')][1]

    mottle = fbm(P, 7.0, SEED + 3, 3)
    breakup = 0.5 + 0.5 * fbm(P, 11.0, SEED + 7, 3)
    nudge = fbm(P, 70.0, SEED + 2, 2)  # ~1.4 cm: ragged edges
    grit = fbm(P, 120.0, SEED + 4, 2)  # ~8 mm: chip outlines
    iy, ix = np.meshgrid(np.arange(H), np.arange(W), indexing='ij')
    speck = _hash(ix, iy, np.zeros_like(ix), SEED + 51)

    # ---- collar: one crisply bounded rope-burnished band across the neck, scored
    e_lo = A['neck'] - 0.030 + 0.0025 * fbm(horiz, 30.0, SEED + 31, 2)
    e_hi = A['neck'] + 0.032 + 0.0025 * fbm(horiz, 26.0, SEED + 32, 2)
    collar = strip * hard(np.minimum(a - e_lo, e_hi - a))
    scores = 0.5 + 0.5 * np.cos(2 * math.pi * a * px_per_m / 5.0 + 1.2 * nudge)
    score_lines = smoothstep(0.72, 0.95, scores)
    # bare steel at the paint boundary: a thin rust line creeping under the paint
    rust_line = strip * hard(0.0035 - np.abs(a - (e_lo - 0.0035))) * hard((breakup - 0.30) * 0.02)

    # ---- edge wear: thin rubbed lines, broken, on the knocked edges
    gate = hard((breakup - 0.42) * 0.03)
    rim_top = crown * hard(rho - (R_LIP - 0.005 + 0.002 * nudge)) * gate
    band_top = strip * hard(a - (A['lip'] - 0.004 + 0.0015 * nudge)) * gate
    under_edge = strip * hard(0.003 + 0.0015 * nudge - np.abs(a - A['lipunder'])) \
        * hard((breakup - 0.36) * 0.03)
    ch_edge = strip * hard(0.0028 + 0.0012 * nudge - np.abs(a - A['chamfer'])) * hard((breakup - 0.40) * 0.03)
    wear = np.maximum.reduce([rim_top, band_top, under_edge, ch_edge])

    # ---- chips: hard-edged knocks with a thin primer halo, rusted at the core
    def post_arc(yy):
        return A['chamfer'] + (yy - y_ch) / (y_neck - y_ch) * (A['neck'] - A['chamfer'])

    chips = [  # (u, arc centre m, radius m, rusted)
        (0.07, A['lip'] - 0.013, 0.011, True), (0.31, A['lip'] - 0.020, 0.008, False),
        (0.58, A['lip'] - 0.011, 0.013, True), (0.83, A['lip'] - 0.018, 0.008, False),
        (0.19, A['lipunder'] + 0.002, 0.010, True), (0.66, A['lipunder'] - 0.003, 0.008, False),
        (0.44, A['chamfer'], 0.012, True), (0.92, A['chamfer'] - 0.004, 0.009, True),
        (0.12, post_arc(0.30), 0.008, True), (0.52, post_arc(0.21), 0.010, True),
        (0.74, post_arc(0.38), 0.007, False), (0.36, post_arc(0.12), 0.009, True),
    ]
    chip = np.zeros((H, W))
    halo = np.zeros((H, W))
    chip_rust = np.zeros((H, W))
    for cu, ca, rad, rusted in chips:
        dth = ((U - cu + 0.5) % 1.0 - 0.5) * 2 * math.pi
        dist = np.hypot(r * dth / 1.4, a - ca) / rad + 0.45 * grit
        sd = (1 - dist) * rad
        core = strip * hard(sd)
        chip = np.maximum(chip, core)
        halo = np.maximum(halo, strip * hard(sd + 1.3 * tex_m) - core)
        if rusted:
            chip_rust = np.maximum(chip_rust, strip * hard(sd - 0.4 * rad))
    for ang, frac, rad in ((0.6, 0.93, 0.010), (2.4, 0.88, 0.008), (4.1, 0.95, 0.012), (5.3, 0.62, 0.006)):
        cx, cz = R_LIP * frac * math.sin(ang), R_LIP * frac * math.cos(ang)
        sd = (1 - (np.hypot(dx - cx, dz - cz) / rad + 0.45 * grit)) * rad
        core = crown * hard(sd)
        chip = np.maximum(chip, core)
        halo = np.maximum(halo, crown * hard(sd + 1.3 * tex_m) - core)
        chip_rust = np.maximum(chip_rust, crown * hard(sd - 0.5 * rad))

    # ---- foot: a grime skirt with a crisp ragged top, crisp rust patches, pitted
    e_f = 0.072 + 0.016 * fbm(horiz, 14.0, SEED + 11, 3) + 0.006 * nudge
    foot = on_post * hard(e_f - y)
    foot_rust = foot * hard((fbm(P, 24.0, SEED + 12, 3) + 0.10) * 0.03)
    rusty = np.maximum.reduce([foot_rust, chip_rust, rust_line])
    pits = rusty * (speck < 0.22)

    # ---- streaks: rust runs DOWN the post from its sources (rusted chips, the
    # collar's lower edge in chosen columns); the flare hangs, so it stops there
    col = np.arange(W) // 2
    zero = np.zeros_like(col)
    pick = _hash(col, zero, zero + 1, SEED + 42) > 0.84  # about one column pair in six
    length_px = 8.0 + 46.0 * _hash(col, zero, zero, SEED + 41) ** 1.5
    decay = np.exp(-1.0 / length_px)
    src = np.maximum(chip_rust * 0.9, rust_line * pick[None, :])
    runs = (on_post | on_band).astype(np.float64)
    streak = np.zeros((H, W))
    carry = np.zeros(W)
    for row in range(H - 1, -1, -1):
        carry = np.maximum(src[row], carry * decay) * runs[row]
        streak[row] = carry
    streak = streak * (1 - chip) * (0.55 + 0.45 * (0.5 + 0.5 * fbm(P * np.array([0.3, 1.0, 0.3]), 30.0, SEED + 43, 2)))

    # ---- paint: mottle, splash-dulled low down, vertical wash, run-off under the head
    wash = fbm(P * np.array([1.0, 0.10, 1.0]), 34.0, SEED + 21, 3)
    run_off = on_post * smoothstep(0.10, y_neck - 0.04, y) * (0.5 + 0.5 * wash)

    def mix(base, target, amount):
        am = np.clip(amount, 0, 1)[..., None]
        return base * (1 - am) + target * am

    value = 1.0 + 0.05 * mottle
    value = value * (1.0 - 0.07 * on_post * (1 - smoothstep(0.0, 0.4, y)))
    value = value * (1.0 - 0.12 * on_flare)
    value = value * (1.0 + 0.04 * on_post * wash - 0.06 * run_off)
    colour = PAINT[None, None, :] * value[..., None]
    colour = mix(colour, CAP_PAINT * (value[..., None] + 0.03 * crown[..., None] * (1 - rho[..., None] / R_LIP)),
                 crown)
    rust_tone = mix(RUST[None, None, :] * np.ones((H, W, 1)), RUST_DARK, 0.45 + 0.45 * nudge)
    colour = mix(colour, GRIME * (0.9 + 0.1 * value[..., None]), 0.9 * foot)
    colour = mix(colour, rust_tone, foot_rust)
    colour = mix(colour, RUST_DARK * 1.05, 0.62 * streak)
    colour = mix(colour, STEEL * (0.94 + 0.08 * breakup[..., None]), 0.85 * wear)
    colour = mix(colour, COLLAR * (0.92 + 0.10 * breakup[..., None]) * (1 - 0.24 * score_lines[..., None]), collar)
    colour = mix(colour, rust_tone, rust_line)
    colour = mix(colour, PRIMER, 0.9 * halo)
    colour = mix(colour, STEEL * 0.82, chip)
    colour = mix(colour, rust_tone, chip_rust)
    colour = mix(colour, RUST_DARK * 0.6, pits)
    beyond = crown & (rho > R_LIP + 2 / (L_CROWN_S * TEX))  # the island's gutter: crown paint for the mips
    colour[beyond] = CAP_PAINT
    colour = np.clip(colour, 0, 255) / 255.0

    # The MR map is a JPEG (a PNG did not fit the file budget), so it carries only
    # the region split, with metal changing exactly where roughness does: no
    # texel noise and no pits here (those live in the colour map's luma).
    rough = np.full((H, W), L_SHEEN['paint'][0]) + 0.05 * run_off
    metal = np.zeros((H, W))

    def layer(name, amount):
        nonlocal rough, metal
        am = np.clip(amount, 0, 1)
        rr, mm = L_SHEEN[name]
        rough = rough * (1 - am) + rr * am
        metal = metal * (1 - am) + mm * am

    layer('crown', crown)
    layer('grime', foot)
    layer('rust', foot_rust)
    layer('streak', 0.8 * streak)
    layer('steel', wear)
    layer('collar', collar)
    layer('rust', rust_line)
    layer('primer', halo)
    layer('steel', chip)
    layer('rust', chip_rust)
    rough[beyond], metal[beyond] = L_SHEEN['crown']
    rough = np.clip(rough, 0.05, 1)
    metal = np.clip(metal, 0, 1)
    if L_MR_FORMAT == 'PNG':  # quantised so deflate has runs to find
        rough = np.round(rough * 16) / 16
        metal = np.round(metal * 8) / 8
    mr = np.stack([np.ones_like(rough), rough, metal], axis=-1)
    used = ~beyond
    print(f'BOLLARD_MAPS L: strip {px_per_m:.0f} px/m; roughness <0.35: {(rough[used] < 0.35).mean():.3f}, '
          f'>0.5: {(rough[used] > 0.5).mean():.3f}; metal >0.3: {(metal[used] > 0.3).mean():.3f}; '
          f'collar {(collar > 0.5).sum()} px, streak {(streak > 0.3).sum()} px, chips {(chip > 0.5).sum()} px, '
          f'pits {(pits > 0.5).sum()} px')
    return colour, mr


def lip_material(prof):
    colour, mr = lip_maps(prof)
    col_img = make_image('metal-bollard-colour', colour, non_color=False)
    # The MR map ships at half resolution (2x2 box filter): the region split
    # survives at 8 mm per texel and the file stays inside maxFileBytes, while
    # the hard edges ride the full-resolution colour map.
    half = TEX // L_MR_DOWNSAMPLE
    mr = mr.reshape(half, L_MR_DOWNSAMPLE, half, L_MR_DOWNSAMPLE, 3).mean(axis=(1, 3))
    mr_img = make_image('metal-bollard-metal-rough', mr, non_color=True, fmt=L_MR_FORMAT)
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col_node = nodes.new('ShaderNodeTexImage')
    col_node.image = col_img
    links.new(col_node.outputs['Color'], bsdf.inputs['Base Color'])
    mr_node = nodes.new('ShaderNodeTexImage')
    mr_node.image = mr_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(mr_node.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


L_MR_FORMAT = 'JPEG'  # a 256 px PNG measured 10,290 B, a 256 px JPEG 6,872 B: both over the file budget
L_MR_DOWNSAMPLE = 2


# ---------------------------------------------------------------- tier M/N maps (round 4)
# Same island layout as tier L (body strip foot -> shoulder, planar crown seen
# from above), different painting rule: at 256 px the strip is ~2.4 mm per texel
# round and ~4.3 mm along, so nothing is authored under ~5 texels. The collar is
# one value step (rope-polished slate, darker and glossier, not pale) over the
# neck fillet, and the geometry's own shading carries the band. The post is
# painted slate first: the foot is grime with two small rust patches, a few
# chips of varied size (three rusted), and repainted touch-up patches break the
# flat shaft without more rust.
M_CROWN_RUV = 30 * PX  # the shoulder ring's radius on the planar crown island
TOUCH_UP = np.array([47, 57, 76], dtype=np.float64)  # newer slate over old knocks: a shade bluer, glossier
POLISHED = np.array([46, 52, 62], dtype=np.float64)  # rope-polished paint in the neck
M_SHEEN = {
    'paint': (0.58, 0.0), 'crown': (0.64, 0.0), 'touch': (0.42, 0.0), 'polished': (0.34, 0.05),
    'grime': (0.88, 0.0), 'rust': (0.94, 0.0), 'steel': (0.34, 0.55), 'primer': (0.74, 0.0),
    'streak': (0.74, 0.0),
}


def m_crown_scale(prof):
    return M_CROWN_RUV / prof[-2][0]


def m_maps(prof):
    roles = [q[2] for q in prof]
    arcs = _lathe_arcs(prof)
    strip_total = arcs[-2]  # foot .. shoulder; the crown fan is its own island
    px_per_m = L_STRIP_TOP * TEX / strip_total
    H = W = TEX
    v = (np.arange(H) + 0.5) / H
    u = (np.arange(W) + 0.5) / W
    V, U = np.meshgrid(v, u, indexing='ij')
    crown = V >= L_BAND_V
    strip = ~crown

    a = np.clip(V / L_STRIP_TOP, 0, 1) * strip_total
    A0 = np.array(arcs)
    R0 = np.array([q[0] for q in prof])
    Y0 = np.array([q[1] for q in prof])
    seg = np.clip(np.searchsorted(A0, a, side='right') - 1, 0, len(prof) - 3)
    t = (a - A0[seg]) / (A0[seg + 1] - A0[seg])
    r = R0[seg] + (R0[seg + 1] - R0[seg]) * t
    ys = Y0[seg] + (Y0[seg + 1] - Y0[seg]) * t
    th = U * 2 * math.pi
    s_crown = m_crown_scale(prof)
    r_sh = prof[-2][0]
    dx = (U - L_CROWN_CU) / s_crown
    dz = (V - L_CROWN_CV) / s_crown
    rho = np.hypot(dx, dz)
    y_sh, y_top = prof[-2][1], prof[-1][1]
    yc = y_sh + (y_top - y_sh) * (1 - np.clip(rho / r_sh, 0, 1))
    x = np.where(crown, dx, r * np.sin(th))
    z = np.where(crown, dz, r * np.cos(th))
    y = np.where(crown, yc, ys)
    P = np.stack([x, y, z], axis=-1)
    horiz = P * np.array([1.0, 0.0, 1.0])
    tex_m = np.where(crown, 1 / (s_crown * TEX), np.maximum(1 / px_per_m, 2 * math.pi * r / TEX))

    def hard(sd):
        return smoothstep(-0.6 * tex_m, 0.6 * tex_m, sd)

    A = {q: arcs[roles.index(q)] for q in ('neck', 'lip', 'shoulder')}
    on_post = strip & (a < A['neck'])
    on_under = strip & (a >= A['neck']) & (a < A['lip'])
    y_neck = prof[roles.index('neck')][1]

    mottle = fbm(P, 7.0, SEED + 3, 3)
    breakup = 0.5 + 0.5 * fbm(P, 11.0, SEED + 7, 3)
    nudge = fbm(P, 70.0, SEED + 2, 2)
    grit = fbm(P, 120.0, SEED + 4, 2)

    # ---- collar: rope-polished paint over the neck fillet, one crisp ragged band
    e_lo = A['neck'] - 0.034 + 0.004 * fbm(horiz, 30.0, SEED + 31, 2)
    e_hi = A['neck'] + 0.022 + 0.003 * fbm(horiz, 26.0, SEED + 32, 2)
    collar = strip * hard(np.minimum(a - e_lo, e_hi - a))
    # where the rope has worn right through: a few long horizontal rubs, 6+ texels tall
    rubs = np.zeros((H, W))
    for cu, da, half_w, half_h in ((0.08, -0.010, 0.040, 0.010), (0.69, -0.014, 0.046, 0.011)):
        dth = ((U - cu + 0.5) % 1.0 - 0.5) * 2 * math.pi
        d = np.hypot(r * dth / half_w, (a - (A['neck'] + da)) / half_h) + 0.35 * grit
        rubs = np.maximum(rubs, collar * hard((1 - d) * half_h))

    # ---- lip edge: the rim is the knocked edge; a broken rubbed line round it
    gate = hard((breakup - 0.40) * 0.03)
    lip_line = strip * hard(0.0065 + 0.0025 * nudge - np.abs(a - A['lip'])) * gate
    # No line on the shoulder ring: it is 12-sided and a line there traces a 12-gon from above.
    wear = lip_line

    # ---- chips: varied sizes and places, primer haloes, only three rusted
    def post_arc(yy):
        return A['neck'] * yy / y_neck

    chips = [  # (u, arc centre m, radius m, rusted)
        (0.05, A['lip'] + 0.012, 0.013, True), (0.29, A['lip'] - 0.006, 0.007, False),
        (0.53, A['lip'] + 0.024, 0.009, False), (0.77, A['lip'] + 0.004, 0.016, False),
        (0.90, A['lip'] - 0.004, 0.006, False),
        (0.17, post_arc(0.31), 0.011, True), (0.61, post_arc(0.18), 0.007, False),
        (0.83, post_arc(0.47), 0.009, False), (0.40, post_arc(0.12), 0.014, True),
    ]
    chip = np.zeros((H, W))
    halo = np.zeros((H, W))
    chip_rust = np.zeros((H, W))
    for k, (cu, ca, rad, rusted) in enumerate(chips):
        dth = ((U - cu + 0.5) % 1.0 - 0.5) * 2 * math.pi
        stretch = 1.0 + 0.6 * _hash(np.array([k]), np.array([0]), np.array([0]), SEED + 61)[0]
        dist = np.hypot(r * dth / stretch, a - ca) / rad + 0.5 * grit
        sd = (1 - dist) * rad
        core = strip * hard(sd)
        chip = np.maximum(chip, core)
        halo = np.maximum(halo, strip * hard(sd + 1.6 * tex_m) - core)
        if rusted:
            chip_rust = np.maximum(chip_rust, strip * hard(sd - 0.45 * rad))
    for ang, frac, rad in ((0.9, 0.72, 0.011), (3.7, 0.48, 0.007)):
        cx, cz = r_sh * frac * math.sin(ang), r_sh * frac * math.cos(ang)
        sd = (1 - (np.hypot(dx - cx, dz - cz) / rad + 0.45 * grit)) * rad
        core = crown * hard(sd)
        chip = np.maximum(chip, core)
        halo = np.maximum(halo, crown * hard(sd + 1.3 * tex_m) - core)

    # ---- touch-up: repainted patches over old knocks, crisp brushed edges
    touch = np.zeros((H, W))
    for cu, yy, ra, rr in ((0.24, 0.42, 0.030, 0.045), (0.66, 0.27, 0.024, 0.032),
                           (0.95, 0.55, 0.020, 0.040), (0.47, 0.60, 0.022, 0.028)):
        dth = ((U - cu + 0.5) % 1.0 - 0.5) * 2 * math.pi
        d = np.hypot(r * dth / rr, (a - post_arc(yy)) / ra) + 0.30 * fbm(P, 45.0, SEED + 71, 2)
        touch = np.maximum(touch, on_post * hard((1 - d) * ra))
    touch = touch * (1 - chip)

    # ---- foot: a grime skirt with a ragged top; rust only in two small patches at the ground
    e_f = 0.060 + 0.014 * fbm(horiz, 14.0, SEED + 11, 3) + 0.005 * nudge
    foot = on_post * hard(e_f - y)
    foot_rust = np.zeros((H, W))
    for cu, half_w, top in ((0.33, 0.035, 0.030), (0.79, 0.024, 0.022)):
        dth = ((U - cu + 0.5) % 1.0 - 0.5) * 2 * math.pi
        d = np.hypot(r * dth / half_w, y / top) + 0.4 * grit
        foot_rust = np.maximum(foot_rust, on_post * hard((1 - d) * top))
    rusty = np.maximum(foot_rust, chip_rust)

    # ---- streaks: short runs DOWN from the rusted chips only, faint
    src = chip_rust * 0.8
    runs = (on_post | (strip & (a >= A['lip']))).astype(np.float64)
    streak = np.zeros((H, W))
    carry = np.zeros(W)
    decay = np.exp(-1.0 / 22.0)
    for row in range(H - 1, -1, -1):
        carry = np.maximum(src[row], carry * decay) * runs[row]
        streak[row] = carry
    streak = streak * (1 - chip) * (0.6 + 0.4 * (0.5 + 0.5 * fbm(P * np.array([0.3, 1.0, 0.3]), 30.0, SEED + 43, 2)))

    wash = fbm(P * np.array([1.0, 0.10, 1.0]), 34.0, SEED + 21, 3)
    run_off = on_post * smoothstep(0.15, y_neck - 0.06, y) * (0.5 + 0.5 * wash)

    def mix(base, target, amount):
        am = np.clip(amount, 0, 1)[..., None]
        return base * (1 - am) + target * am

    value = 1.0 + 0.05 * mottle
    value = value * (1.0 - 0.06 * on_post * (1 - smoothstep(0.0, 0.35, y)))
    value = value * (1.0 - 0.10 * on_under)
    value = value * (1.0 + 0.065 * on_post * wash - 0.07 * run_off)
    colour = PAINT[None, None, :] * value[..., None]
    # The head above the lip is one paint (sun-faded cap): a crown-only colour or
    # sheen step would trace the 12-sided shoulder ring; the lip is a real edge.
    head = crown | (strip & (a >= A['lip']))
    colour = mix(colour, CAP_PAINT * (value[..., None] + 0.04 * crown[..., None] * (1 - np.clip(rho, 0, r_sh)[..., None] / r_sh)),
                 head)
    colour = mix(colour, TOUCH_UP * value[..., None], touch)
    colour = mix(colour, POLISHED * (0.96 + 0.06 * breakup[..., None]), collar)
    colour = mix(colour, STEEL * (0.72 + 0.08 * breakup[..., None]), 0.45 * rubs)
    rust_tone = mix(RUST[None, None, :] * np.ones((H, W, 1)), RUST_DARK, 0.45 + 0.45 * nudge)
    colour = mix(colour, GRIME * (0.9 + 0.1 * value[..., None]), 0.85 * foot)
    colour = mix(colour, rust_tone, 0.75 * foot_rust)
    colour = mix(colour, RUST_DARK * 1.05, 0.40 * streak)
    colour = mix(colour, STEEL * (0.86 + 0.08 * breakup[..., None]), 0.70 * wear)
    colour = mix(colour, PRIMER * 0.85, 0.55 * halo)
    colour = mix(colour, STEEL * 0.78, chip)
    colour = mix(colour, RUST_DARK * (1.0 + 0.25 * nudge[..., None]), chip_rust)
    beyond = crown & (rho > r_sh + 2 / (s_crown * TEX))
    colour[beyond] = CAP_PAINT
    colour = np.clip(colour, 0, 255) / 255.0

    rough = np.full((H, W), M_SHEEN['paint'][0]) + 0.05 * run_off
    metal = np.zeros((H, W))

    def layer(name, amount):
        nonlocal rough, metal
        am = np.clip(amount, 0, 1)
        rr_, mm_ = M_SHEEN[name]
        rough = rough * (1 - am) + rr_ * am
        metal = metal * (1 - am) + mm_ * am

    layer('crown', head)
    layer('touch', touch)
    layer('polished', collar)
    layer('steel', 0.45 * rubs)
    layer('grime', foot)
    layer('rust', foot_rust)
    layer('streak', 0.6 * streak)
    layer('steel', wear)
    layer('primer', halo)
    layer('steel', chip)
    layer('rust', chip_rust)
    rough[beyond], metal[beyond] = M_SHEEN['crown']
    rough = np.clip(rough, 0.05, 1)
    metal = np.clip(metal, 0, 1)
    mr = np.stack([np.ones_like(rough), rough, metal], axis=-1)
    used = ~beyond
    print(f'BOLLARD_MAPS M: strip {px_per_m:.0f} px/m; roughness <0.40: {(rough[used] < 0.40).mean():.3f}; '
          f'metal >0.3: {(metal[used] > 0.3).mean():.3f}; collar {(collar > 0.5).sum()} px, '
          f'rust {(rusty > 0.5).sum()} px, touch {(touch > 0.5).sum()} px, chips {(chip > 0.5).sum()} px')
    return colour, mr


def m_material(prof):
    colour, mr = m_maps(prof)
    col_img = make_image('metal-bollard-colour', colour, non_color=False)
    half = TEX // L_MR_DOWNSAMPLE
    mr = mr.reshape(half, L_MR_DOWNSAMPLE, half, L_MR_DOWNSAMPLE, 3).mean(axis=(1, 3))
    mr_img = make_image('metal-bollard-metal-rough', mr, non_color=True, fmt=L_MR_FORMAT)
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col_node = nodes.new('ShaderNodeTexImage')
    col_node.image = col_img
    links.new(col_node.outputs['Color'], bsdf.inputs['Base Color'])
    mr_node = nodes.new('ShaderNodeTexImage')
    mr_node.image = mr_img
    sep = nodes.new('ShaderNodeSeparateColor')
    links.new(mr_node.outputs['Color'], sep.inputs[0])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return mat


def _ring_normals(prof):
    """Per ring: ((radial, axial) normal for the segment below, ... for the segment above)."""
    out = []
    last = len(prof) - 1
    for k, (r, y, role, _n, mode) in enumerate(prof):
        below = _seg_normal(prof, k - 1) if k > 0 else None
        above = _seg_normal(prof, k) if k < last else None
        if mode == 'pole':
            out.append(((0.0, 1.0), (0.0, 1.0)))
        elif mode == 'sphere':
            sn = _sphere_normal(r, y)
            out.append((sn, sn))
        elif mode == 'lip_sphere':
            out.append((below, _sphere_normal(r, y)))
        elif mode == 'rim':
            rr, aa = 1.0 + above[0], above[1]
            n = math.hypot(rr, aa)
            out.append((below, (rr / n, aa / n)))
        elif mode == 'dome_rim':
            # Crisp lip edge; the crown above shades as the shallow sphere through
            # this ring and the pole (a 49 deg 'rim' tilt here read as a pyramid).
            rise = prof[-1][1] - y
            sphere_r = (r * r + rise * rise) / (2 * rise)
            tilt = math.asin(min(1.0, r / sphere_r)) * CROWN_TILT_GAIN
            lean = math.atan2(below[1], below[0]) + math.radians(LIP_ROUND_DEG)
            out.append(((math.cos(lean), math.sin(lean)), (math.sin(tilt), math.cos(tilt))))
        elif mode in ('ellipse_rim', 'ellipse'):
            # the dome is a quarter-ellipse from the lip ring (a = its radius,
            # b = the rise to the pole); its normal is (r / a^2, (y - y_lip) / b^2)
            lip = next(q for q in prof if q[2] == 'lip')
            ea, eb = lip[0], prof[-1][1] - lip[1]
            rr, aa = r / ea ** 2, (y - lip[1]) / eb ** 2
            n = math.hypot(rr, aa)
            out.append((below if mode == 'ellipse_rim' else (rr / n, aa / n), (rr / n, aa / n)))
        elif mode == 'smooth':
            rr, aa = below[0] + above[0], below[1] + above[1]
            n = math.hypot(rr, aa)
            out.append(((rr / n, aa / n), (rr / n, aa / n)))
        elif mode == 'crease':
            out.append((below or above, above or below))
        else:
            raise SystemExit(f'unknown normal mode {mode}')
    return out


def lathe_mesh(prof, sides, mat, v_top=None, crown=None):
    """Lathe one traced profile; each ring has its own side count, joined by a merge walk.

    A band between rings of n and m sides costs n + m triangles; the last ring
    fans to the pole (n triangles). Normals are radial at each vertex's own
    angle, so they do not depend on the counts; u = angle / 2 pi, v = arc length.
    crown=(cu, cv, s): the pole fan gets a planar island seen from above
    (uv = (cu + s x, cv + s z)) and the strip runs only to the last ring, over
    v 0 .. v_top. Without it the strip runs to the pole over LATHE_V_TOP.
    """
    v_top = LATHE_V_TOP if v_top is None else v_top
    arcs = _lathe_arcs(prof)
    total = arcs[-2] if crown else arcs[-1]
    counts = [1 if q[4] == 'pole' else (q[3] or sides) for q in prof]
    normals = _ring_normals(prof)
    verts, faces, face_uvs, face_normals = [], [], [], []
    rings = []
    for (r, y, _role, _n, mode), n in zip(prof, counts):
        if mode == 'pole':
            rings.append([len(verts)])
            verts.append(to_blender_unit((0.0, y, 0.0)))
            continue
        idx = []
        for j in range(n):
            idx.append(len(verts))
            verts.append(to_blender_unit(ring_point(r, y, 2 * math.pi * j / n)))
        rings.append(idx)

    def v_of(k):
        return arcs[k] / total * v_top

    def add(corners):
        a, b, c = (np.array(verts[q[0]]) for q in corners)
        geo = np.cross(b - a, c - a)
        mean = np.sum([np.array(q[2]) for q in corners], axis=0)
        if geo.dot(mean) < 0:
            corners = corners[::-1]
        faces.append([q[0] for q in corners])
        face_uvs.append([q[1] for q in corners])
        face_normals.append([q[2] for q in corners])

    def corner(k, j, side):
        """Ring k, step j (j == count wraps to vertex 0 at u = 1), normal for `side` 0 below / 1 above."""
        n = counts[k]
        th = 2 * math.pi * j / n
        nrm = normals[k][side]
        if prof[k][4] == 'pole':
            return (rings[k][0], (None, v_of(k)), dir_to_blender((0.0, 1.0, 0.0)))
        return (rings[k][j % n], (j / n, v_of(k)), dir_to_blender(radial_normal(th, *nrm)))

    for k in range(len(prof) - 1):
        nA, nB = counts[k], counts[k + 1]
        if prof[k + 1][4] == 'pole':
            for j in range(nA):
                a0, a1 = corner(k, j, 1), corner(k, j + 1, 1)
                p = corner(k + 1, 0, 0)
                if crown:
                    cu, cv, s = crown
                    r = prof[k][0]

                    def planar(c, jj):
                        th = 2 * math.pi * jj / nA
                        return (c[0], (cu + s * r * math.sin(th), cv + s * r * math.cos(th)), c[2])
                    a0, a1 = planar(a0, j), planar(a1, j + 1)
                    p = (p[0], (cu, cv), p[2])
                else:
                    p = (p[0], ((a0[1][0] + a1[1][0]) / 2, p[1][1]), p[2])
                add([a0, a1, p])
            continue
        i = m = 0
        while i < nA or m < nB:
            ta_next, tb_next = (i + 1) / nA, (m + 1) / nB
            if i < nA and (m >= nB or ta_next <= tb_next + 1e-12):
                add([corner(k, i, 1), corner(k, i + 1, 1), corner(k + 1, m, 0)])
                i += 1
            else:
                add([corner(k, i, 1), corner(k + 1, m + 1, 0), corner(k + 1, m, 0)])
                m += 1

    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        ns = face_normals[poly.index]
        mean = [sum(c[q] for c in ns) for q in range(3)]
        if poly.normal.dot(mean) <= 0:
            raise SystemExit(f'face {poly.index} wound inward')
    uv_layer = mesh.uv_layers.new(name='UVMap')
    loop_normals = [None] * len(mesh.loops)
    for poly in mesh.polygons:
        poly.use_smooth = True
        corner_of = {vv: c for c, vv in enumerate(faces[poly.index])}
        for li in poly.loop_indices:
            c = corner_of[mesh.loops[li].vertex_index]
            uv_layer.data[li].uv = face_uvs[poly.index][c]
            loop_normals[li] = tuple(face_normals[poly.index][c])
    mesh.normals_split_custom_set(loop_normals)
    mesh.materials.append(mat)
    print(f'BOLLARD_RINGS {counts}')
    return mesh, len(faces)


# ---------------------------------------------------------------- tier P (round 5, strike-rule rebuild)
# Method change: the low mesh carries only the silhouette; every feature smaller
# than a ring (base flange, neck bead and fillet, the lip's thickness and its
# rolled top, the true dome) is a tangent-space NORMAL MAP computed analytically
# from a dense traced profile against the low mesh's own interpolated normals.
# maxTextures is 2, so the textures are base colour + normal, and roughness and
# metalness are material constants (the metallicRoughness map is gone).
#   ground 12 -> neck 12 -> rim 24 -> dome ring 12 -> pole
#   12 + 2 x (12 + 24 + 12) = 108 triangles = 324 indices, every band 1:1 or 1:2.
# The head is one continuous sphere arc from the rim to the pole, the dome ring
# at 0.40 of its angle, so no ring sits on a fold (tier N's 12-ring shoulder was
# a 61 -> 7 deg fold, and that fold drew the nut).
P_Y_NECK, P_Y_RIM, P_RISE = 0.655, 0.754, Y_TOP - 0.754
P_R_FOOT, P_R_NECK = 0.132, 0.096
P_SPHERE_R = (R_LIP ** 2 + P_RISE ** 2) / (2 * P_RISE)
P_SPHERE_YC = Y_TOP - P_SPHERE_R
P_RIM_TILT = math.degrees(math.asin(R_LIP / P_SPHERE_R))
P_DOME_TILT = 0.40 * P_RIM_TILT  # top chord slope is half this (~6.8 deg): a lower ring peaks the crown
P_DOME = (P_SPHERE_R * math.sin(math.radians(P_DOME_TILT)),
          P_SPHERE_YC + P_SPHERE_R * math.cos(math.radians(P_DOME_TILT)))
P_SHAFT_TILT = 90.0 - math.degrees(math.atan2(P_R_FOOT - P_R_NECK, P_Y_NECK))
P_FLARE_TILT = 90.0 + math.degrees(math.atan2(R_LIP - P_R_NECK, P_Y_RIM - P_Y_NECK))
# Vertex normals (tilt in degrees from straight up), chosen for the clay pass,
# which has no normal map: neck averaged (a fillet), the rim crisp but rolled a
# little either side, the dome ring on the sphere.
P_NECK_TILT = 0.5 * (P_SHAFT_TILT + P_FLARE_TILT)
P_RIM_BELOW_TILT, P_RIM_ABOVE_TILT = 106.0, 60.0
P_PROFILE = [  # (r, y, role, sides, tilt below, tilt above)
    (P_R_FOOT, 0.0, 'foot', 12, P_SHAFT_TILT, P_SHAFT_TILT),
    (P_R_NECK, P_Y_NECK, 'neck', 12, P_NECK_TILT, P_NECK_TILT),
    (R_LIP, P_Y_RIM, 'lip', 24, P_RIM_BELOW_TILT, P_RIM_ABOVE_TILT),
    (P_DOME[0], P_DOME[1], 'dome', 12, P_DOME_TILT, P_DOME_TILT),
    (0.0, Y_TOP, 'pole', 1, 0.0, 0.0),
]
P_RING_V = [0 * PX, 116 * PX, 156 * PX, 186 * PX]  # strip v per ring: the head gets ~3 mm/px, the shaft ~5.4
P_CROWN = (32 * PX, 224 * PX, 30 * PX / P_DOME[0])  # planar island for the dome-ring -> pole fan
P_ROUGHNESS, P_METALNESS = 0.55, 0.06
# The export is JPEG for both maps (export_image_format applies to all). Measured: PNG normal
# 11,974 B, and under AUTO the colour also went PNG (37,622 B; GLB 55,228 B, cap 18,000).
# JPEG Q78 normal 4,777 B; error vs PNG mean 1.9/255, p99 21 at the feature lines.
P_NORMAL_FORMAT = 'PNG'  # the in-Blender image format only; the exporter re-encodes it as JPEG
P_DOME_RADIAL = False  # tier Q sets it: dome normals from the sphere centre, not from height
P_IRREGULAR_OK = ()  # tier Q allows its one non-1:k band, the flare (neck 12 -> rim 20)


def _p_true_table():
    """The dense traced profile as (y, tilt) knots per band: 0 shaft, 1 flare, 2 dome."""
    s, f = P_SHAFT_TILT, P_FLARE_TILT
    bead = P_Y_NECK - 0.036
    shaft = [(0.0, 90.0), (0.015, 90.0), (0.019, 45.0), (0.030, 45.0), (0.037, 72.0), (0.046, s),
             (bead - 0.013, s), (bead - 0.009, 148.0), (bead - 0.003, 108.0), (bead + 0.003, 72.0),
             (bead + 0.009, 32.0), (bead + 0.013, s), (P_Y_NECK - 0.016, s), (P_Y_NECK, 0.5 * (s + f))]
    flare = [(P_Y_NECK, 0.5 * (s + f)), (P_Y_NECK + 0.016, f), (P_Y_RIM - 0.031, f),
             (P_Y_RIM - 0.027, 168.0), (P_Y_RIM - 0.021, 168.0), (P_Y_RIM - 0.017, 97.0), (P_Y_RIM, 84.0)]
    y_roll = P_Y_RIM + 0.014
    dome = [(P_Y_RIM, 84.0), (y_roll, _p_sphere_tilt(y_roll))]
    return shaft, flare, dome


def _p_sphere_tilt(y):
    rr = np.sqrt(np.clip(P_SPHERE_R ** 2 - (np.asarray(y) - P_SPHERE_YC) ** 2, 0, None))
    return np.degrees(np.arcsin(np.clip(rr / P_SPHERE_R, 0, 1)))


def p_true_tilt(band, y):
    shaft, flare, dome = _p_true_table()
    out = np.zeros_like(y)
    for b, table in ((0, shaft), (1, flare)):
        sel = band == b
        ky, kt = zip(*table)
        out[sel] = np.interp(y[sel], ky, kt)
    sel = band >= 2
    ky, kt = zip(*dome)
    roll = np.interp(y[sel], ky, kt)
    out[sel] = np.where(y[sel] < dome[-1][0], roll, _p_sphere_tilt(y[sel]))
    return out


def p_geometry():
    """Lathe P_PROFILE: glTF-space vertices, triangles (vertex ids), per-corner uv and normal, band."""
    prof = P_PROFILE
    verts, faces, face_uvs, face_normals, face_band = [], [], [], [], []
    rings = []
    for r, y, role, n, _tb, _ta in prof:
        if role == 'pole':
            rings.append([len(verts)])
            verts.append((0.0, y, 0.0))
            continue
        rings.append(list(range(len(verts), len(verts) + n)))
        verts.extend(ring_point(r, y, 2 * math.pi * j / n) for j in range(n))
    cu, cv, cs = P_CROWN

    def corner(k, j, side, crown=False):
        r, y, role, n, tb, ta = prof[k]
        if role == 'pole':
            return (rings[k][0], (cu, cv), (0.0, 1.0, 0.0))
        th = 2 * math.pi * j / n
        tilt = math.radians(ta if side else tb)
        nrm = radial_normal(th, math.sin(tilt), math.cos(tilt))
        uv = (cu + cs * r * math.sin(th), cv + cs * r * math.cos(th)) if crown else (j / n, P_RING_V[k])
        return (rings[k][j % n], uv, nrm)

    def add(corners, band):
        a, b, c = (np.array(verts[q[0]]) for q in corners)
        mean = np.sum([np.array(q[2]) for q in corners], axis=0)
        if np.cross(b - a, c - a).dot(mean) < 0:
            corners = corners[::-1]
        faces.append([q[0] for q in corners])
        face_uvs.append([q[1] for q in corners])
        face_normals.append([q[2] for q in corners])
        face_band.append(band)

    for k in range(len(prof) - 1):
        nA, nB = prof[k][3], prof[k + 1][3]
        if prof[k + 1][2] == 'pole':
            for j in range(nA):
                add([corner(k, j, 1, True), corner(k, j + 1, 1, True), corner(k + 1, 0, 0)], 3)
            continue
        if max(nA, nB) % min(nA, nB) and (nA, nB) not in P_IRREGULAR_OK:
            raise SystemExit(f'tier P: rings {nA} and {nB} do not align (1:k only)')
        i = m = 0
        while i < nA or m < nB:
            if i < nA and (m >= nB or (i + 1) / nA <= (m + 1) / nB + 1e-12):
                add([corner(k, i, 1), corner(k, i + 1, 1), corner(k + 1, m, 0)], k)
                i += 1
            else:
                add([corner(k, i, 1), corner(k + 1, m + 1, 0), corner(k + 1, m, 0)], k)
                m += 1
    return verts, faces, face_uvs, face_normals, face_band


def p_raster(geo):
    """Rasterise every triangle in uv. Per texel: position, interpolated normal, band, crown flag.

    Texels within 2 px outside an island take the nearest triangle's attributes
    extrapolated (a gutter, so mips and bilinear filtering never read unset texels).
    """
    verts, faces, face_uvs, face_normals, face_band = geo
    H = W = TEX
    best = np.full((H, W), -1e9)
    P = np.zeros((H, W, 3))
    N = np.zeros((H, W, 3))
    band = np.full((H, W), -1, dtype=np.int64)
    jj, ii = np.meshgrid(np.arange(H) + 0.5, np.arange(W) + 0.5, indexing='ij')
    for f, (tri, uvs, nrms, b) in enumerate(zip(faces, face_uvs, face_normals, face_band)):
        q = np.array(uvs) * TEX  # (3, 2) in px
        x0, y0 = np.floor(q.min(axis=0) - 2.5).astype(int)
        x1, y1 = np.ceil(q.max(axis=0) + 2.5).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        px, py = ii[y0:y1, x0:x1], jj[y0:y1, x0:x1]
        (ax, ay), (bx, by), (cx, cy) = q
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
        w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
        w2 = 1 - w0 - w1
        sd = np.full(px.shape, 1e9)  # signed distance to the triangle in px, + inside
        for (ex, ey), (fx, fy), w in (((bx, by), (cx, cy), w0), ((cx, cy), (ax, ay), w1), ((ax, ay), (bx, by), w2)):
            length = math.hypot(fx - ex, fy - ey)
            h = abs(den) / length  # the opposite vertex's height above this edge, px
            sd = np.minimum(sd, w * h)
        take = (sd > best[y0:y1, x0:x1]) & (sd > -2.0)
        if not take.any():
            continue
        V = np.array([verts[t] for t in tri])
        Nn = np.array(nrms)
        pos = w0[..., None] * V[0] + w1[..., None] * V[1] + w2[..., None] * V[2]
        nn = w0[..., None] * Nn[0] + w1[..., None] * Nn[1] + w2[..., None] * Nn[2]
        sub = (slice(y0, y1), slice(x0, x1))
        best[sub] = np.where(take, sd, best[sub])
        P[sub] = np.where(take[..., None], pos, P[sub])
        N[sub] = np.where(take[..., None], nn, N[sub])
        band[sub] = np.where(take, b, band[sub])
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-9)
    return P, N, band, band >= 0


def p_normal_map(P, N, band, used):
    """Tangent-space normal map (OpenGL, +Y = increasing v) of the dense profile against the low mesh."""
    H = W = TEX
    th = np.arctan2(P[..., 0], P[..., 2])
    crown = band == 3
    # Box-filter the dense profile over each texel's height (5 taps): a 5 mm texel
    # point-sampling a 4 mm bead edge would alias.
    v_mm = np.where(band == 0, P_Y_NECK / (P_RING_V[1] - P_RING_V[0]),
                    np.where(band == 1, (P_Y_RIM - P_Y_NECK) / (P_RING_V[2] - P_RING_V[1]),
                             (P_DOME[1] - P_Y_RIM) / (P_RING_V[3] - P_RING_V[2]))) / TEX
    v_mm = np.where(crown, 0.0, v_mm)
    Nt = np.zeros((H, W, 3))
    for o in (-0.4, -0.2, 0.0, 0.2, 0.4):
        y = P[..., 1] + o * v_mm
        lo = np.where(band == 1, P_Y_NECK, np.where(band >= 2, P_Y_RIM, 0.0))
        hi = np.where(band == 0, P_Y_NECK, np.where(band == 1, P_Y_RIM, Y_TOP))
        tilt = np.radians(p_true_tilt(np.maximum(band, 0), np.clip(y, lo, hi)))
        if P_DOME_RADIAL:  # tier Q: the dome ring sits off the sphere, so take the normal from its centre
            radial = np.arctan2(np.hypot(P[..., 0], P[..., 2]), np.maximum(y - P_SPHERE_YC, 1e-6))
            tilt = np.where((band >= 2) & (y >= P_Y_RIM + 0.014), radial, tilt)
        Nt += np.stack([np.sin(tilt) * np.sin(th), np.cos(tilt), np.sin(tilt) * np.cos(th)], axis=-1)
    Nt /= np.maximum(np.linalg.norm(Nt, axis=-1, keepdims=True), 1e-9)
    T0 = np.where(crown[..., None], np.array([1.0, 0.0, 0.0]),
                  np.stack([np.cos(th), np.zeros_like(th), -np.sin(th)], axis=-1))
    B0 = np.where(crown[..., None], np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
    T = T0 - np.sum(T0 * N, axis=-1, keepdims=True) * N
    T /= np.maximum(np.linalg.norm(T, axis=-1, keepdims=True), 1e-9)
    B = np.cross(N, T)
    B = np.where((np.sum(B * B0, axis=-1) < 0)[..., None], -B, B)
    ts = np.stack([np.sum(Nt * T, -1), np.sum(Nt * B, -1), np.sum(Nt * N, -1)], axis=-1)
    ts[~used] = (0.0, 0.0, 1.0)
    dev = np.degrees(np.arccos(np.clip(ts[..., 2], -1, 1)))
    print(f'BOLLARD_NORMAL max deviation {dev[used].max():.1f} deg, mean {dev[used].mean():.2f} deg, '
          f'z min {ts[used][:, 2].min():.3f}')
    return np.clip((ts + 1) * 0.5, 0, 1)


P_RUST_STREAK = np.array([104, 58, 32], dtype=np.float64)
P_POLISH = np.array([112, 116, 118], dtype=np.float64)  # rope-polished casting, desaturated
P_RUBBED = np.array([84, 90, 98], dtype=np.float64)  # paint rubbed thin, not yet through
P_SPLASH = np.array([66, 60, 52], dtype=np.float64)


def p_colour_map(P, band, used):
    """Base colour from world-space fields; every distance in metres on the surface."""
    H = W = TEX
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    r = np.hypot(x, z)
    th = np.arctan2(x, z)
    horiz = P * np.array([1.0, 0.0, 1.0])
    rng = np.random.default_rng(SEED)
    crown = band == 3
    on_shaft, on_flare, on_head = band == 0, band == 1, band >= 2
    tex_m = 3.5e-3

    def hard(sd, soft=1.0):
        return smoothstep(-0.6 * tex_m * soft, 0.6 * tex_m * soft, sd)

    def dtheta(c):
        return (th - c + math.pi) % (2 * math.pi) - math.pi

    mottle = fbm(P, 7.0, SEED + 3, 3)
    breakup = 0.5 + 0.5 * fbm(P, 11.0, SEED + 7, 3)
    grit = fbm(P, 120.0, SEED + 4, 2)
    wash = fbm(P * np.array([1.0, 0.08, 1.0]), 30.0, SEED + 21, 3)
    rope_n = fbm(np.stack([th * 0.02, y * 3.0, np.zeros_like(y)], -1), 60.0, SEED + 33, 3)  # striated round the axis

    # ---- rope wear: three arcs where lines are thrown over the head; polish on the rim
    # roll and the lip face, rubbed paint where the rope sits in the neck
    rope_arc = np.zeros((H, W))
    for c, half in ((0.55, 0.85), (2.55, 0.65), (4.35, 0.75)):
        rope_arc = np.maximum(rope_arc, smoothstep(half, half * 0.55, np.abs(dtheta(c)) + 0.25 * fbm(horiz, 9.0, SEED + 35, 2)))
    # the lip's outer face and rolled top only, striated round the axis as a rope rubs
    lip_zone = smoothstep(P_Y_RIM - 0.020, P_Y_RIM - 0.015, y) * (1 - smoothstep(P_Y_RIM + 0.003, P_Y_RIM + 0.009, y))
    polish = np.clip(rope_arc * lip_zone * (0.75 + 0.9 * rope_n), 0, 1)
    polish = hard((polish - 0.38) * 0.012)
    neck_zone = smoothstep(P_Y_NECK - 0.050, P_Y_NECK - 0.030, y) * (1 - smoothstep(P_Y_NECK + 0.020, P_Y_NECK + 0.040, y))
    rubbed = np.clip(rope_arc * neck_zone * (0.6 + 0.8 * rope_n), 0, 1)
    bead_top = P_Y_NECK - 0.036 + 0.006
    neck_steel = hard(0.0045 - np.abs(y - bead_top)) * rope_arc * hard((breakup - 0.45) * 0.03)

    # ---- edge wear: broken steel lines on the plinth chamfer edge and the lip's rolled top
    edge = (hard(0.0035 - np.abs(y - 0.019)) * hard((breakup - 0.55) * 0.03)
            + hard(0.0035 - np.abs(y - (P_Y_RIM + 0.004))) * hard((breakup - 0.50) * 0.03) * (1 - polish))
    edge = np.clip(edge, 0, 1)

    # ---- chips: log-uniform sizes, stretched, noisy edges; about a third rusted
    chip = np.zeros((H, W))
    halo = np.zeros((H, W))
    chip_rust = np.zeros((H, W))
    chip_tone = np.zeros((H, W))
    src = np.zeros((H, W))
    for k in range(17):  # 10 on the post, 5 lip knocks (kept off the dome, where y-distance made spokes), 2 crown pits
        c = rng.uniform(-math.pi, math.pi)
        yy = (rng.uniform(0.06, 0.58) if k < 10 else rng.uniform(P_Y_RIM - 0.022, P_Y_RIM + 0.004)) if k < 15 \
            else rng.uniform(P_DOME[1] - 0.004, Y_TOP - 0.006)
        rad = math.exp(rng.uniform(math.log(0.003), math.log(0.016)))
        stretch = rng.uniform(0.7, 1.8)
        rusted = rng.uniform() < 0.38
        if k >= 15:  # crown pits: placed and measured in plan, never by height
            rr = R_LIP * 0.35 * rng.uniform(0.2, 1.0)
            rad = min(rad, 0.006)  # crown pits: the planar island is seen whole from above
            dist = np.hypot(x - rr * math.sin(c), z - rr * math.cos(c)) / rad
        else:
            dist = np.hypot(r * dtheta(c) / stretch, (y - yy)) / rad
        dist = dist + 0.55 * grit
        sd = (1 - dist) * rad
        core = used * hard(sd)
        chip_tone = np.where(core > chip, rng.uniform(0.55, 0.85), chip_tone)  # bright steel to dull oxide
        chip = np.maximum(chip, core)
        halo = np.maximum(halo, used * hard(sd + 1.4 * tex_m) - core)
        if rusted:
            chip_rust = np.maximum(chip_rust, used * hard(sd - 0.35 * rad))
            src = np.maximum(src, on_shaft * hard(sd - 0.35 * rad) * rng.uniform(0.5, 0.9))

    # ---- rust streaks: from the neck bead (water off the head runs down under the
    # flare and gathers there) and from rusted chips, DOWN the post, varied
    bead_lo = P_Y_NECK - 0.050
    for k in range(13):
        c = rng.uniform(-math.pi, math.pi)
        width = rng.uniform(0.0025, 0.0075)
        strength = rng.uniform(0.35, 0.95)
        start = bead_lo + rng.uniform(-0.01, 0.02)
        src = np.maximum(src, on_shaft * strength * hard(width - np.abs(r * dtheta(c)), 1.5)
                         * hard(0.006 - np.abs(y - start)))
    streak = np.zeros((H, W))
    carry = np.zeros(W)
    row_hi = int(P_RING_V[1] * TEX)
    lengths = 0.5 + 0.5 * (0.5 + 0.5 * fbm(np.stack([np.cos(np.arange(W) / W * 2 * math.pi),
                                                     np.zeros(W), np.sin(np.arange(W) / W * 2 * math.pi)], -1),
                                            5.0, SEED + 41, 2))
    for row in range(row_hi, -1, -1):
        decay = np.exp(-1.0 / (14.0 + 30.0 * lengths))
        carry = np.maximum(src[row], carry * decay) * on_shaft[row]
        streak[row] = carry
    streak *= (0.55 + 0.45 * (0.5 + 0.5 * fbm(P * np.array([0.25, 1.0, 0.25]), 40.0, SEED + 43, 2))) * (1 - chip)

    # ---- foot: a soft grime and splash gradient with a ragged top, rust only at the ground
    top = 0.10 + 0.035 * fbm(horiz, 9.0, SEED + 11, 3)
    grime = on_shaft * (1 - smoothstep(0.015, top, y)) ** 1.4
    splash = on_shaft * hard((0.55 - (0.5 + 0.5 * fbm(P, 90.0, SEED + 13, 2))) * 0.02) * (1 - smoothstep(0.05, 0.20, y))
    foot_rust = on_shaft * (1 - smoothstep(0.0, 0.028 + 0.02 * (0.5 + 0.5 * fbm(horiz, 16.0, SEED + 15, 2)), y)) \
        * hard((breakup - 0.35) * 0.03)

    def mix(base, target, amount):
        am = np.clip(amount, 0, 1)[..., None]
        return base * (1 - am) + target * am

    value = 1.0 + 0.05 * mottle + 0.06 * on_shaft * wash
    value = value * (1.0 - 0.07 * on_shaft * smoothstep(P_Y_NECK - 0.25, P_Y_NECK - 0.02, y) * (0.5 + 0.5 * wash))
    value = value * (1.0 - 0.06 * on_flare)
    colour = PAINT[None, None, :] * value[..., None]
    sun = on_head * smoothstep(P_Y_RIM, Y_TOP, y)
    colour = mix(colour, CAP_PAINT * (value[..., None] + 0.06 * sun[..., None]), on_head * (0.6 + 0.4 * sun))
    colour = mix(colour, P_RUBBED * (0.94 + 0.1 * breakup[..., None]), 0.75 * rubbed)
    colour = mix(colour, GRIME * (0.92 + 0.1 * value[..., None]), 0.80 * grime)
    colour = mix(colour, P_SPLASH, 0.35 * splash)
    colour = mix(colour, RUST_DARK * (1.0 + 0.3 * breakup[..., None]), 0.7 * foot_rust)
    colour = mix(colour, P_RUST_STREAK * (0.9 + 0.2 * breakup[..., None]), 0.75 * np.clip(streak, 0, 1))
    colour = mix(colour, STEEL * (0.82 + 0.1 * breakup[..., None]), 0.75 * edge)
    colour = mix(colour, P_POLISH * (0.92 + 0.12 * breakup[..., None]), 0.85 * polish)
    colour = mix(colour, P_POLISH * 0.95, 0.7 * neck_steel)
    colour = mix(colour, PRIMER * 0.85, 0.6 * halo)
    colour = mix(colour, STEEL * chip_tone[..., None], chip)
    colour = mix(colour, RUST * (0.75 + 0.4 * breakup[..., None]), chip_rust)
    colour[~used] = PAINT
    print(f'BOLLARD_MAPS P: polish {(polish > 0.5).sum()} px, rubbed {(rubbed > 0.5).sum()} px, '
          f'chips {(chip > 0.5).sum()} px ({(chip_rust > 0.5).sum()} rusted), streak {(streak > 0.25).sum()} px, '
          f'grime {(grime > 0.5).sum()} px')
    return np.clip(colour, 0, 255) / 255.0


def p_material(geo):
    P, N, band, used = p_raster(geo)
    colour = (q_colour_map if P_PROFILE is Q_PROFILE else p_colour_map)(P, band, used)
    normal = p_normal_map(P, N, band, used)
    col_img = make_image('metal-bollard-colour', colour, non_color=False)
    nrm_img = make_image('metal-bollard-normal', normal, non_color=True, fmt=P_NORMAL_FORMAT)
    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    col_node = nodes.new('ShaderNodeTexImage')
    col_node.image = col_img
    links.new(col_node.outputs['Color'], bsdf.inputs['Base Color'])
    nrm_node = nodes.new('ShaderNodeTexImage')
    nrm_node.image = nrm_img
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.space = 'TANGENT'
    nmap.uv_map = 'UVMap'
    links.new(nrm_node.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = P_ROUGHNESS
    bsdf.inputs['Metallic'].default_value = P_METALNESS
    return mat


def p_mesh(geo, mat):
    verts, faces, face_uvs, face_normals, _band = geo
    mesh = bpy.data.meshes.new(MESH_NAME)
    mesh.from_pydata([to_blender_unit(p) for p in verts], [], faces)
    mesh.update()
    if len(mesh.polygons) != len(faces):
        raise SystemExit('tier P: Blender merged or dropped a face')
    bl_normals = [[dir_to_blender(n) for n in ns] for ns in face_normals]
    for poly in mesh.polygons:
        mean = [sum(c[q] for c in bl_normals[poly.index]) for q in range(3)]
        if poly.normal.dot(mean) <= 0:
            raise SystemExit(f'face {poly.index} wound inward')
    uv_layer = mesh.uv_layers.new(name='UVMap')
    loop_normals = [None] * len(mesh.loops)
    for poly in mesh.polygons:
        poly.use_smooth = True
        corner_of = {vv: c for c, vv in enumerate(faces[poly.index])}
        for li in poly.loop_indices:
            c = corner_of[mesh.loops[li].vertex_index]
            uv_layer.data[li].uv = face_uvs[poly.index][c]
            loop_normals[li] = tuple(bl_normals[poly.index][c])
    mesh.normals_split_custom_set(loop_normals)
    mesh.materials.append(mat)
    print(f'BOLLARD_RINGS {[q[3] for q in P_PROFILE]} dome ring r {P_DOME[0]:.4f} y {P_DOME[1]:.4f}, '
          f'sphere R {P_SPHERE_R:.4f}, rim tilt {P_RIM_TILT:.1f} deg')
    return mesh, len(faces)


# ---------------------------------------------------------------- tier Q (round 6, strike-rule rebuild)
# Geometry: the ring counts are chosen from a phase-averaged silhouette measure,
# not from the fixed turntable azimuths (those are multiples of 45 deg, and an
# 8-fold ring happens to show its exact width at every one of them). Scratch tool:
# each lathe rasterised at 1280 px against the 256-sided true surface (sphere
# dome) from eight orbit azimuths 0..52.5 deg in 7.5 deg steps at 20 deg; worst
# outline error in px at 640, and differing px summed over the eight views:
#                                 crown  neck  shaft  foot   summed
#   P   12/12/24/12 (round 5)      2.9   1.1   1.0    2.1    40,362
#   P   same, dome ring +2 mm      1.8   1.1   1.0    2.1    35,682
#   T20 20/10/20/10 +3 mm          2.1   2.1   2.0    0.7    32,709  (100 triangles)
#   N16 16/8/24/12                 2.9   3.5   3.5    1.1    45,425
#   A8  24/8/24/8                  3.8   3.5   3.5    0.5    40,481
#   6R  24/12/24/6 +4 mm           2.7   1.1   1.0    0.5    24,252  (rendered: j-f23efe5268;
#                                  the 6-ring is a flat hexagonal plateau on the crown)
#   Q   24/12/20/10 +3 mm          2.1   1.1   1.0    0.5    24,227  <- delivered
#   ref 24/12/24/12               2.9   1.1   1.0    0.5    28,724  (120 triangles: over budget)
# The foot ring is the cheapest ring there is (the base is open, so it sits in one
# band: 1 triangle per vertex). 24 sides there, and the 24 -> 12 shaft band, are
# paid for by a 20-sided rim and a 10-sided dome ring. The rim keeps vertices on
# +-X and +-Z (20 is a multiple of 4). The dome ring sits 3 mm OUT along the
# sphere normal at half the arc, so its two chords straddle the true dome rather
# than sag inside it; the normal map still shades the true sphere (P_DOME_RADIAL).
# The one join that is not 1:k is the flare underside, neck 12 -> rim 20 (3:5),
# a short band; the long shaft band stays aligned (tier L's irregular 10 -> 8
# shaft band drew vertical bands in clay).
#   ground 24 -> neck 12 -> rim 20 -> dome ring 10 -> pole
#   bands 24+12, 12+20, 20+10 and a 10-fan: 36 + 32 + 30 + 10 = 108 triangles = 324 indices.
Q_DOME_F, Q_DOME_PUSH = 0.50, 0.003
_q_t = math.radians(Q_DOME_F * P_RIM_TILT)
Q_DOME = ((P_SPHERE_R + Q_DOME_PUSH) * math.sin(_q_t), P_SPHERE_YC + (P_SPHERE_R + Q_DOME_PUSH) * math.cos(_q_t))
Q_DOME_TILT = Q_DOME_F * P_RIM_TILT
Q_PROFILE = [  # (r, y, role, sides, tilt below, tilt above)
    (P_R_FOOT, 0.0, 'foot', 24, P_SHAFT_TILT, P_SHAFT_TILT),
    (P_R_NECK, P_Y_NECK, 'neck', 12, P_NECK_TILT, P_NECK_TILT),
    (R_LIP, P_Y_RIM, 'lip', 20, P_RIM_BELOW_TILT, P_RIM_ABOVE_TILT),
    (Q_DOME[0], Q_DOME[1], 'dome', 10, Q_DOME_TILT, Q_DOME_TILT),
    (0.0, Y_TOP, 'pole', 1, 0.0, 0.0),
]
# UVs re-laid for the shaft: 142 rows (4.6 mm/px, was 116 at 5.6) out of the head
# bands, which carry one paint; the crown island (the 10-ring fan) keeps ~2.9 mm/px.
Q_RING_V = [0 * PX, 142 * PX, 174 * PX, 196 * PX]
Q_CROWN = (30 * PX, 227 * PX, 27 * PX / Q_DOME[0])
Q_JPEG_QUALITY = 80  # less ringing on the luma edges below; the byte cap is checked at build
# Surface: every wear feature carries a LUMA step against the paint. Measured on
# the round-5 GLB: both JPEGs are 4:2:0 (PIL get_sampling 2), and Blender's
# writer stays 4:2:0 at quality 78, 85, 90 and 95, so chroma is stored at half
# the texel pitch (about 5.6 x 11 mm on the shaft). Slate paint is luma 64 and
# round 5's rust 66-80: nearly pure chroma, which is why it read soft and smeared.
Q_SCALE = np.array([46, 34, 27], dtype=np.float64)  # black-brown scale and old rust, luma ~37
Q_BLOOM = np.array([118, 66, 36], dtype=np.float64)  # fresh orange bloom, luma ~76
Q_STAIN = np.array([60, 40, 29], dtype=np.float64)  # a wet rust run on slate, luma ~44
Q_LIFT = np.array([88, 96, 108], dtype=np.float64)  # the lifted paint edge catching light, luma ~94


def q_colour_map(P, band, used):
    """Round 6 base colour: world-space fields, distances in metres, wear carried in luma."""
    H = W = TEX
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    r = np.hypot(x, z)
    th = np.arctan2(x, z)
    horiz = P * np.array([1.0, 0.0, 1.0])
    unit = np.stack([np.cos(th), np.zeros_like(th), np.sin(th)], -1)  # angle only
    rng = np.random.default_rng(SEED + 6)
    crown = band == 3
    on_shaft, on_flare, on_head = band == 0, band == 1, band >= 2
    tex_m = 2.8e-3  # the shaft's texel pitch round the post

    def hard(sd, soft=1.0):
        return smoothstep(-0.5 * tex_m * soft, 0.5 * tex_m * soft, sd)

    def dtheta(c):
        return (th - c + math.pi) % (2 * math.pi) - math.pi

    def mix(base, target, amount):
        am = np.clip(amount, 0, 1)[..., None]
        return base * (1 - am) + target * am

    mottle = fbm(P, 7.0, SEED + 3, 3)
    breakup = 0.5 + 0.5 * fbm(P, 11.0, SEED + 7, 3)
    wash = fbm(P * np.array([1.0, 0.08, 1.0]), 30.0, SEED + 21, 3)
    rope_n = fbm(np.stack([th * 0.02, y * 3.0, np.zeros_like(y)], -1), 60.0, SEED + 33, 3)

    # ---- foot: the paint ends in a ragged, chipped edge 20-80 mm up, varying round the
    # post (never a level band), with rust tongues climbing higher at a few knocks
    lift_n = 0.5 + 0.5 * fbm(unit, 1.7, SEED + 61, 3)
    h = 0.012 + 0.072 * smoothstep(0.36, 0.64, lift_n)
    for _k in range(5):
        c, w, top = rng.uniform(-math.pi, math.pi), rng.uniform(0.008, 0.020), rng.uniform(0.075, 0.115)
        h = np.maximum(h, top * np.clip(1 - (np.abs(r * dtheta(c)) / w) ** 1.5, 0, None))
    h = h + 0.006 * fbm(P, 80.0, SEED + 63, 2) + 0.003 * fbm(P, 240.0, SEED + 64, 1)
    exposed = on_shaft * hard(h - y)
    lift = on_shaft * hard(y - h) * hard(h + 0.0045 - y)  # ~1.5 texels of lifted paint over the edge
    blister = on_shaft * hard(y - h - 0.0045) * (1 - smoothstep(h + 0.004, h + 0.022, y)) \
        * hard((breakup - 0.48) * 0.03)
    scale_n = 0.5 + 0.5 * fbm(P, 45.0, SEED + 65, 3)
    bloom = exposed * hard((scale_n - 0.60) * 0.02)
    scraped = exposed * hard((0.5 + 0.5 * fbm(P, 140.0, SEED + 66, 2) - 0.74) * 0.02) * hard(y - 0.006)
    grime_top = 0.16 + 0.05 * fbm(horiz, 9.0, SEED + 11, 3)
    grime = on_shaft * (1 - smoothstep(0.02, grime_top, y))
    speck_n = 0.5 + 0.5 * fbm(P, 210.0, SEED + 13, 2)
    specks = on_shaft * (1 - exposed) * hard((speck_n - (0.70 + 0.5 * smoothstep(0.0, 0.30, y))) * 0.02)

    # ---- rope wear (as round 5): polish on the lip face and rolled top in three arcs,
    # paint rubbed thin in the neck, steel showing on the bead
    rope_arc = np.zeros((H, W))
    for c, half in ((0.55, 0.85), (2.55, 0.65), (4.35, 0.75)):
        rope_arc = np.maximum(rope_arc, smoothstep(half, half * 0.55, np.abs(dtheta(c)) + 0.25 * fbm(horiz, 9.0, SEED + 35, 2)))
    lip_zone = smoothstep(P_Y_RIM - 0.020, P_Y_RIM - 0.015, y) * (1 - smoothstep(P_Y_RIM + 0.003, P_Y_RIM + 0.009, y))
    polish = hard((np.clip(rope_arc * lip_zone * (0.75 + 0.9 * rope_n), 0, 1) - 0.38) * 0.012)
    neck_zone = smoothstep(P_Y_NECK - 0.050, P_Y_NECK - 0.030, y) * (1 - smoothstep(P_Y_NECK + 0.020, P_Y_NECK + 0.040, y))
    rubbed = np.clip(rope_arc * neck_zone * (0.6 + 0.8 * rope_n), 0, 1)
    bead_top = P_Y_NECK - 0.036 + 0.006
    neck_steel = hard(0.0045 - np.abs(y - bead_top)) * rope_arc * hard((breakup - 0.45) * 0.03)
    edge = np.clip(hard(0.0035 - np.abs(y - (P_Y_RIM + 0.004))) * hard((breakup - 0.50) * 0.03) * (1 - polish), 0, 1)

    # ---- chips: four populations, each a dark or bright CORE inside a one-texel ring of the
    # other polarity, so the edge survives 4:2:0 and reads crisp
    chip = np.zeros((H, W))
    ring_b = np.zeros((H, W))  # bright steel ring round a rusted core
    halo = np.zeros((H, W))  # primer halo round a fresh chip
    rusty = np.zeros((H, W))
    tone = np.zeros((H, W))
    src = np.zeros((H, W))
    groups = [  # count, y range, radius range (m), rusted share
        (16, (0.03, 0.17), (0.0022, 0.007), 0.7),  # foot flakes, just above the chipped edge
        (26, (0.17, 0.60), (0.0020, 0.010), 0.4),  # knocks up the post
        (6, (P_Y_RIM - 0.022, P_Y_RIM + 0.004), (0.003, 0.010), 0.3),  # lip knocks
        (3, None, (0.003, 0.006), 1.0),  # crown pits, placed in plan
    ]
    def off_seam():  # the strip's u wrap is at theta 0 (+Z): a chip straddling it shows the seam
        while True:
            c = rng.uniform(-math.pi, math.pi)
            if abs(c) > 0.12:
                return c

    for count, yr, (ra, rb), rust_share in groups:
        for _k in range(count):
            c = off_seam()
            rad = math.exp(rng.uniform(math.log(ra), math.log(rb)))
            stretch = rng.uniform(0.9, 2.2)
            rusted = rng.uniform() < rust_share
            if yr is None:
                rr = Q_DOME[0] * 0.8 * rng.uniform(0.15, 1.0)
                dist = np.hypot(x - rr * math.sin(c), z - rr * math.cos(c)) / rad
                region = crown
            else:
                yy = rng.uniform(*yr)
                dist = np.hypot(r * dtheta(c) / stretch, y - yy) / rad
                region = used
            dist = dist + 0.35 * fbm(P, 160.0, SEED + 70 + _k, 2)
            sd = (1 - dist) * rad
            core = region * hard(sd)
            outer = region * hard(sd + 0.8 * tex_m) - core
            tone = np.where(core > chip, rng.uniform(0.75, 0.95), tone)
            chip = np.maximum(chip, core)
            broken = hard((0.5 + 0.5 * fbm(P, 220.0, SEED + 90 + _k, 1) - 0.42) * 0.02)  # the ring is never whole
            if rusted:
                rusty = np.maximum(rusty, core)
                ring_b = np.maximum(ring_b, outer * broken)
                if rng.uniform() < 0.55:  # about half of the rusted knocks bleed
                    src = np.maximum(src, on_shaft * core * rng.uniform(0.5, 0.9))
            else:
                halo = np.maximum(halo, outer * broken)

    # ---- rust runs: from rusted chips and from under the neck bead, DOWN the post, as
    # dark wet stain (luma ~50 on paint 64), widths 1-3 texels, lengths varied per column
    bead_lo = P_Y_NECK - 0.050
    for _k in range(14):
        c = off_seam()
        width = rng.uniform(0.0020, 0.0050)
        start = bead_lo + rng.uniform(-0.012, 0.015)
        src = np.maximum(src, on_shaft * rng.uniform(0.45, 0.95) * hard(width - np.abs(r * dtheta(c)), 0.8)
                         * hard(0.006 - np.abs(y - start)))
    streak = np.zeros((H, W))
    carry = np.zeros(W)
    row_hi = int(P_RING_V[1] * TEX)
    col = np.arange(W) / W * 2 * math.pi
    lengths = 0.5 + 0.5 * fbm(np.stack([np.cos(col), np.zeros(W), np.sin(col)], -1), 5.0, SEED + 41, 2)
    decay = np.exp(-1.0 / (6.0 + 26.0 * lengths ** 2))  # e-folding 3-15 cm: short runs, a few long
    for row in range(row_hi, -1, -1):
        carry = np.maximum(src[row], carry * decay) * on_shaft[row]
        streak[row] = carry
    streak *= (0.6 + 0.4 * (0.5 + 0.5 * fbm(P * np.array([0.25, 1.0, 0.25]), 40.0, SEED + 43, 2))) * (1 - chip)
    streak *= 1 - exposed

    value = 1.0 + 0.05 * mottle + 0.07 * on_shaft * wash
    value = value * (1.0 - 0.07 * on_shaft * smoothstep(P_Y_NECK - 0.25, P_Y_NECK - 0.02, y) * (0.5 + 0.5 * wash))
    value = value * (1.0 - 0.06 * on_flare) * (1.0 - 0.12 * grime)
    colour = PAINT[None, None, :] * value[..., None]
    sun = on_head * smoothstep(P_Y_RIM, Y_TOP, y)
    colour = mix(colour, CAP_PAINT * (value[..., None] + 0.06 * sun[..., None]), on_head * (0.6 + 0.4 * sun))
    colour = mix(colour, P_RUBBED * (0.94 + 0.1 * breakup[..., None]), 0.75 * rubbed)
    colour = mix(colour, GRIME * 0.9, 0.8 * specks)
    colour = mix(colour, PAINT * 0.80, 0.85 * blister)
    colour = mix(colour, Q_LIFT, 0.9 * lift)
    foot = mix(Q_SCALE * (0.85 + 0.35 * scale_n[..., None]), RUST_DARK, 0.35 * breakup)
    foot = mix(foot, Q_BLOOM * (0.85 + 0.25 * breakup[..., None]), 0.8 * bloom)
    foot = mix(foot, STEEL * 0.8, 0.85 * scraped)
    colour = mix(colour, foot, exposed)
    colour = mix(colour, Q_STAIN * (0.88 + 0.2 * breakup[..., None]), 0.9 * np.clip(streak, 0, 1))
    colour = mix(colour, STEEL * (0.82 + 0.1 * breakup[..., None]), 0.75 * edge)
    colour = mix(colour, P_POLISH * (0.92 + 0.12 * breakup[..., None]), 0.85 * polish)
    colour = mix(colour, P_POLISH * 0.95, 0.7 * neck_steel)
    colour = mix(colour, PRIMER * 0.95, 0.75 * halo)
    colour = mix(colour, STEEL * 0.9, 0.9 * ring_b)
    colour = mix(colour, STEEL * tone[..., None], chip)
    colour = mix(colour, mix(Q_SCALE, RUST_DARK, breakup) * (0.9 + 0.3 * scale_n[..., None]), rusty)
    colour[~used] = PAINT
    luma = colour @ np.array([0.2126, 0.7152, 0.0722])
    print(f'BOLLARD_MAPS Q: exposed foot {(exposed > 0.5).sum()} px (edge height {h[on_shaft].min():.3f}-'
          f'{np.percentile(h[on_shaft], 99):.3f} m), chips {(chip > 0.5).sum()} px ({(rusty > 0.5).sum()} rusted), '
          f'streak {(streak > 0.3).sum()} px, specks {(specks > 0.5).sum()} px, '
          f'paint luma {np.median(luma[on_shaft & (chip < 0.1) & (streak < 0.1) & (exposed < 0.1)]):.0f}, '
          f'stain luma {np.median(luma[streak > 0.6]) if (streak > 0.6).any() else 0:.0f}')
    return np.clip(colour, 0, 255) / 255.0


def main():
    path, tier, sides = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = SCENE_NAME
    image_format = 'JPEG'
    if tier in ('P', 'Q'):
        if tier == 'Q':  # tier Q runs tier P's builders on its own profile, layout and paint
            globals().update(P_PROFILE=Q_PROFILE, P_RING_V=Q_RING_V, P_CROWN=Q_CROWN, P_DOME=Q_DOME,
                             P_DOME_RADIAL=True, P_IRREGULAR_OK=((12, 20),), JPEG_QUALITY=Q_JPEG_QUALITY)
        geo = p_geometry()
        mesh, tris = p_mesh(geo, p_material(geo))
        image_format = 'JPEG'
        print(f'BOLLARD_TIER {tier}: {"OVER" if tris * 3 > INDEX_BUDGET else "within"} the {INDEX_BUDGET}-index contract')
    elif tier is None:
        mat = make_material()
        mesh, tris = build_mesh(mat)
    else:
        prof = LATHE_TIERS[tier]
        if tier in ('M', 'N'):
            counts = [q[3] for q in prof if q[4] != 'pole']
            for n0, n1 in zip(counts, counts[1:]):
                if max(n0, n1) % min(n0, n1):
                    raise SystemExit(f'tier {tier}: rings {n0} and {n1} do not align (1:k only)')
            mesh, tris = lathe_mesh(prof, sides, m_material(prof), v_top=L_STRIP_TOP,
                                    crown=(L_CROWN_CU, L_CROWN_CV, m_crown_scale(prof)))
        elif tier == 'L':
            mesh, tris = lathe_mesh(prof, sides, lip_material(prof), v_top=L_STRIP_TOP,
                                    crown=(L_CROWN_CU, L_CROWN_CV, L_CROWN_S))
        else:
            mesh, tris = lathe_mesh(prof, sides, lathe_material(prof))
        over = 'OVER' if tris * 3 > INDEX_BUDGET else 'within'
        print(f'BOLLARD_TIER {tier}: {over} the {INDEX_BUDGET}-index contract')
    obj = bpy.data.objects.new(NODE_NAME, mesh)
    scene.collection.objects.link(obj)
    obj.location = (0.0, 0.0, NODE_Y)
    obj.scale = (NODE_SCALE, NODE_SCALE, NODE_SCALE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    export(path, image_format)
    print(f'BOLLARD_BUILT {path} triangles={tris} indices={tris * 3} bytes={os.path.getsize(path)}')


main()
