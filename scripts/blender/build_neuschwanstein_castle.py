"""Author MillOS's Neuschwanstein-inspired palace, independently of the retired Tripo mesh.

Blender --background --python-exit-code 1 --python scripts/blender/build_neuschwanstein_castle.py
Single material/mesh, deterministic authored atlas, metre coordinates, an open stepped court.
Working if the delivered rays see the court and gateway, the palas stays elongated,
and the 25,200 render-vertex / 621,000-byte resource limits remain unchanged.
"""
import hashlib
import json
import math
import pathlib
import struct
import zlib
import bpy
import bmesh
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/castle-white-blue-20260927'
DEST = ROOT / 'assets/source/models/village/castle-neuschwanstein-authored.glb'
OUT.mkdir(parents=True, exist_ok=True)
ORIGINAL = ROOT / 'assets/source/models/village/castle-tripo-original.glb'
original_hash = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)

# Atlas swatches are display-space RGB. The PNG is tagged sRGB at material load.
PALETTE = [
    ('plaster', (249, 247, 240)), ('limestone', (226, 225, 218)),
    ('roof', (48, 100, 150)), ('glass', (40, 65, 85)),
    ('shutter', (175, 135, 66)), ('timber', (84, 64, 46)),
    ('paving', (195, 198, 190)), ('rock', (150, 146, 136)),
    ('roof-small', (52, 109, 165)), ('dark-metal', (48, 61, 74)),
    ('stone-light', (230, 238, 242)), ('plaster-warm', (246, 244, 236)),
    ('water', (57, 78, 73)), ('gate-white', (248, 247, 241)),
    ('tile-ridge', (76, 128, 170)), ('masonry', (206, 218, 223)),
]
SLOTS = {name: i for i, (name, _) in enumerate(PALETTE)}
# Wall faces are mapped in metres, not one slot per face. One slot used to be
# stretched over the whole 26 m palas wall (about 10 px/m), so its 0.15 px
# mortar lines averaged into grey streaks. Each wall slot now holds one
# seamless period of coursed ashlar, (u metres, v metres); faces larger than a
# period are split on the period grid, and v is anchored to the 3.2 m court
# datum so courses run level from face to face.
# Field and dressing: one crisp 0.55 m ashlar on every wall read as small brick
# and hid the piers. Wall fields (plaster, gate-white, plaster-warm) now carry a
# near-plain render with faint 1.1 m courses; the crisp 0.55 m ashlar moved to
# the limestone dressing slot, which the palas loft assigns to its plinth, piers,
# pier returns and clasping corners by run class. Both share the 1.1 m step, so
# a face that moves by whole steps keeps both joint grids level.
COURSE = .55
STEP = 1.1
WALL_TILES = {'plaster': (13.2, 11.0), 'gate-white': (15.4, 8.8), 'plaster-warm': (22.0, 11.0), 'limestone': (13.2, 11.0)}
# (course, block length range, block tone, joint, bevel scale) per wall slot.
DRESSING = (COURSE, (.75, 1.55), .035, -.2, 1)
FIELD = (STEP, (1.8, 3.2), .025, -.05, .35)
WALL_DATUM = 3.2
# poly() samples .015-.985 of a slot; the pattern fills exactly that window and
# its wrapped margin, so a period repeats without a seam.
PATTERN, PAD = 248, 4
# Castle footprint (CASTLE_ROCK_OUTLINE under the runtime plinth) and the rock
# skirt's tile frame: u is footprint arc length over one of ROCK_PERIODS equal
# periods, v the bedding coordinate s = y - tilt from ROCK_S0 over ROCK_SPAN m.
outline=[(-19.35,-14.7),(-15.8,-18.35),(8.8,-19.17395),(17.9,-15.9),(19.35,-6),(18.6,12.4),(13.7,19.17395),(-11.5,18.3),(-18.9,12.7)]
ROCK_SEAT, ROCK_SAMPLES, ROCK_PERIODS = 15.8, 45, 14
ROCK_S0, ROCK_SPAN = -.4, 3.7
PERIM=sum(math.dist(outline[i],outline[(i+1)%len(outline)]) for i in range(len(outline)))
ROCK_U=PERIM/ROCK_PERIODS
# Modelled bedding: riser tops near 1.0 and 1.9 m of s, ledge backs 0.1 m above.
ROCK_LEDGES=(1.0,1.9)

def strata(seed, ss=3):
    """One seamless period of bedded limestone in (u metres, s metres): beds of
    uneven thickness with their own tone, offset joints and a macro term. Beds
    break at the modelled ledges, so texture and geometry agree."""
    srng = np.random.default_rng(seed)
    n = PATTERN * ss
    vm, um = (np.mgrid[0:n, 0:n] + .5) / n
    uu, sm = um * ROCK_U, ROCK_S0 + vm * ROCK_SPAN
    beds = [ROCK_S0 - .1, -.08, .34, .7, ROCK_LEDGES[0], ROCK_LEDGES[0] + .1, 1.47, ROCK_LEDGES[1], ROCK_LEDGES[1] + .1, 2.42, 2.8, 3.12, ROCK_S0 + ROCK_SPAN + .1]
    # Bed boundaries wander a few centimetres, periodically in u.
    wob = lambda k: .022 * np.sin(2 * math.pi * (k % 3 + 1) * um + k * 1.7) + .012 * np.sin(2 * math.pi * (k % 4 + 2) * um + k)
    bed = np.zeros(um.shape, int)
    for k, b in enumerate(beds[1:-1], 1):
        bed[sm > b + wob(k)] = k
    signal = np.zeros_like(um)
    warm = np.zeros_like(um)
    ledges = {beds.index(ROCK_LEDGES[0]), beds.index(ROCK_LEDGES[1])}
    for k in range(len(beds) - 1):
        sel = bed == k
        tread = k in ledges
        signal[sel] = srng.uniform(-.05, .04) - (.07 if tread else 0)
        warm[sel] = srng.uniform(-.5, .5)
        if tread:
            continue
        # Joints: sparse (1.6-4.8 m), ragged, off vertical, offset bed to bed;
        # one bed in four is unjointed, so the face never reads as coursing.
        if srng.uniform() < .25:
            continue
        gaps = []
        while sum(gaps) < ROCK_U:
            gaps.append(srng.uniform(1.6, 4.8))
        joints = (np.cumsum([0] + gaps[:-1]) * ROCK_U / sum(gaps) + srng.uniform(0, ROCK_U)) % ROCK_U
        mid = (beds[k] + beds[k + 1]) / 2
        slant = srng.uniform(-.22, .22, len(joints))
        rag = .06 * np.sin(sm[sel] * 17 + k) + .03 * np.sin(sm[sel] * 41 + 2 * k)
        d = (uu[sel][:, None] + rag[:, None] - joints[None, :] - slant[None, :] * (sm[sel][:, None] - mid)) % ROCK_U
        block = np.argmin(np.where(d < 0, 9e9, d), axis=1)
        dist = np.minimum(d, ROCK_U - d).min(axis=1)
        signal[sel] += srng.uniform(-.05, .05, len(joints))[block]
        signal[sel] -= .13 * (dist < .03) + .04 * ((dist >= .03) & (dist < .08))
    # Shadowed crease under each bed boundary and a faint lip on top of it. Ledge
    # treads are darker (soil and lichen), since the sun already lights them.
    for k, b in enumerate(beds[1:-1], 1):
        e = sm - (b + wob(k))
        signal -= .17 * ((e < 0) & (e > -.035)) + .05 * ((e <= -.035) & (e > -.09))
        signal += .03 * ((e >= 0) & (e < .05))
    # Macro tone and fine lamination, both periodic in u.
    p = srng.uniform(0, 2 * math.pi, 6)
    signal += .05 * np.sin(2 * math.pi * 2 * um + p[0]) * np.cos(2 * math.pi * sm / 1.7 + p[1]) + .035 * np.sin(2 * math.pi * 3 * um + p[2] + 1.3 * np.sin(sm * 2.1))
    signal += .025 * np.sin(sm * 41 + 1.5 * np.sin(2 * math.pi * 5 * um + p[3]) + p[4])
    # Weathering mottle: a few octaves of periodic noise, blotchy rather than banded.
    for octave in range(5):
        fu = 3 * 2 ** octave
        q = srng.uniform(0, 2 * math.pi, 4)
        f = (fu / ROCK_U) * srng.uniform(.8, 1.3)
        signal += .075 / 1.6 ** octave * np.sin(2 * math.pi * fu * um + q[0] + 1.4 * np.sin(2 * math.pi * f * sm + q[1])) * np.sin(2 * math.pi * f * sm * 1.3 + q[2] + 1.2 * np.sin(2 * math.pi * (fu // 3 + 1) * um + q[3]))
    # Buff and grey patches cross the beds instead of following them.
    warm += .7 * np.sin(2 * math.pi * 2 * um + p[5]) * np.sin(2 * math.pi * sm / 2.3 + 2 * np.sin(2 * math.pi * um + p[1]))
    signal = signal.reshape(PATTERN, ss, PATTERN, ss).mean(axis=(1, 3))
    warm = warm.reshape(PATTERN, ss, PATTERN, ss).mean(axis=(1, 3))
    signal += srng.normal(0, .01, signal.shape)
    pad = lambda a: np.pad(np.pad(a, ((0, 0), (PAD, PAD)), mode='wrap'), ((PAD, PAD), (0, 0)), mode='edge')
    return pad(signal), pad(warm)

def ashlar(span_u, span_v, seed, style=DRESSING, ss=4):
    course, (blo, bhi), tone_amp, joint_tone, bevel = style
    arng = np.random.default_rng(seed)
    n = PATTERN * ss
    vm, um = (np.mgrid[0:n, 0:n] + .5) / n
    um, vm = um * span_u, vm * span_v
    rows = round(span_v / course)
    row = np.minimum(np.floor(vm / course).astype(int), rows - 1)
    tone = np.zeros_like(um)
    joint_u = np.full_like(um, 9.0)
    for r in range(rows):
        lengths = []
        while sum(lengths) < span_u:
            lengths.append(arng.uniform(blo, bhi))
        breaks = np.cumsum([0] + lengths[:-1]) * span_u / sum(lengths)
        breaks = (breaks + arng.uniform(0, span_u)) % span_u
        breaks.sort()
        sel = row == r
        d = np.abs(um[sel][:, None] - breaks[None, :])
        d = np.minimum(d, span_u - d)
        joint_u[sel] = d.min(axis=1)
        block = np.searchsorted(breaks, um[sel]) % len(breaks)
        tone[sel] = arng.uniform(-tone_amp, tone_amp, len(breaks))[block]
    within = vm - row * course
    joint_v = np.minimum(within, course - within)
    jw = .035
    joint = (joint_u < jw) | (joint_v < jw)
    signal = tone.copy()
    signal += bevel * (.03 * ((course - within) < .09) - .05 * ((within > jw) & (within < .1)))
    signal += .012 * np.sin(um * 7.1 + 2 * np.sin(vm * 3.3)) * np.cos(vm * 5.7)
    signal[joint] = joint_tone
    signal = signal.reshape(PATTERN, ss, PATTERN, ss).mean(axis=(1, 3))
    signal += arng.normal(0, .012, signal.shape)
    return np.pad(signal, PAD, mode='wrap')

rng = np.random.default_rng(270927)
tile = 256
atlas = np.zeros((1024, 1024, 4), dtype=np.uint8)
yy, xx = np.mgrid[0:tile, 0:tile] / tile
for i, (name, color) in enumerate(PALETTE):
    grain = rng.normal(0, 0.007, (tile, tile))
    macro = .017 * np.sin(xx * 17 + yy * 3) * np.cos(yy * 13 - xx * 4)
    rgb = np.broadcast_to(np.array(color, dtype=float), (tile, tile, 3)).copy()
    signal = grain + macro
    if name in WALL_TILES:
        signal = ashlar(*WALL_TILES[name], 5300 + i, DRESSING if name == 'limestone' else FIELD)
    elif name in ['roof', 'roof-small']:
        cols, rows = (38, 19) if name == 'roof' else (12, 15)
        row = np.floor(yy * rows).astype(int)
        col = np.floor(xx * cols + (row % 2) * .5).astype(int)
        phase = (xx * cols + (row % 2) * .5) % 1
        horizontal = (yy * rows) % 1
        wear = rng.uniform(-.075, .075, (rows + 1, cols + 2))[row, col]
        signal += wear + .07 * np.sin(phase * math.pi)
        signal -= .14 * ((phase < .065) | (horizontal < .095))
        signal += .08 * ((horizontal > .82) & (horizontal < .94))
    elif name in ['plaster', 'gate-white', 'limestone', 'stone-light', 'paving', 'masonry']:
        rows, cols = (44, 20) if name in ['plaster','gate-white'] else ((3, 24) if name == 'masonry' else ((8, 5) if name != 'paving' else (22, 18)))
        row = np.floor(yy * rows)
        mortar = ((yy * rows) % 1 < .025) | ((xx * cols + row % 2 * .5) % 1 < .018)
        signal -= mortar * (.055 if name in ['plaster','gate-white'] else .09)
    elif name == 'shutter':
        red = ((xx * 2.5 + yy * 2.5) % 1) < .46
        rgb[red] = (139, 55, 37)
        signal -= (((xx * 8) % 1) < .055) * .1
    elif name == 'timber':
        signal += .045 * np.sin(xx * 78 + np.sin(yy * 8))
    elif name == 'glass':
        signal += .12 * xx + .07 * np.sin(xx * 18 + yy * 5)
    elif name == 'rock':
        # Bedded limestone in the skirt's own (arc metres, bedding metres) frame;
        # its own generator leaves every other tile's noise byte-identical. Beds
        # vary between grey and buff, as weathered alpine limestone does.
        signal, warm = strata(71107)
        rgb *= (1 + warm[..., None] * np.array([.035, .012, -.04]))
    x, y = i % 4 * tile, i // 4 * tile
    atlas[y:y+tile, x:x+tile, :3] = np.clip(rgb * (1 + signal[..., None]), 0, 255)
    atlas[y:y+tile, x:x+tile, 3] = 255

def png(path, data):
    def chunk(name, payload):
        return struct.pack('>I', len(payload)) + name + payload + struct.pack('>I', zlib.crc32(name + payload) & 0xffffffff)
    h, w, _ = data.shape
    raw = b''.join(b'\0' + row.tobytes() for row in data)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

png(OUT / 'authored-atlas.png', atlas[::-1])
mat = bpy.data.materials.new('Neuschwanstein authored plaster stone and tile')
mat.use_nodes = True
shader = mat.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .88
shader.inputs['Metallic'].default_value = 0
image = bpy.data.images.load(str(OUT / 'authored-atlas.png'))
image.name = 'neuschwanstein-albedo'
image.colorspace_settings.name = 'sRGB'
image.pack()
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
verts, faces, uvs, smooth_faces = [], [], [], []
features = []
# Radius/half-span and rise fractions: flared eaves soften the v0.30 blue caps.
# Working if intermediate rings sit inside a straight cone while apex/eave stay fixed.
ROOF_PROFILE = [(1, 0), (.74, .15), (.39, .5), (0, 1)]

# Helpers take glTF-style x, height, depth; conversion to Blender is only here.
def fit_courses(g, span_v):
    """Place heights g (in wall periods above the datum) inside one period.
    A face that fits moves by whole courses, so its joints stay at world heights;
    one a little too tall is compressed. Larger faces are split before this."""
    lo, hi = min(g), max(g)
    if hi - lo > 1 + 1e-9:
        return [(x - lo) / (hi - lo) for x in g]
    s = lo - math.floor(lo + 1e-9)
    if s + hi - lo > 1 + 1e-9:
        step = STEP / span_v
        s -= math.ceil((s + hi - lo - 1) / step - 1e-9) * step
    s = max(0, s)
    return [x - lo + s for x in g]

def wall_uv(points, material):
    """Metre-scale UV for a wall face that is not split: planar along its normal."""
    span_u, span_v = WALL_TILES[material]
    n = [0, 0, 0]
    for k in range(len(points)):
        a, b = points[k], points[(k + 1) % len(points)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    length = math.sqrt(sum(c * c for c in n)) or 1
    if abs(n[1]) / length < .7:
        t = (n[2], -n[0]); tl = math.hypot(*t) or 1
        us = [(p[0] * t[0] + p[2] * t[1]) / tl for p in points]
        vs = fit_courses([(p[1] - WALL_DATUM) / span_v for p in points], span_v)
    else:
        us = [p[0] for p in points]
        zs = [p[2] for p in points]
        vs = [(z - min(zs)) / max(span_v, max(zs) - min(zs)) for z in zs]
    lo = min(us)
    return [((u - lo) / max(span_u, max(us) - lo), v) for u, v in zip(us, vs)]

def poly(points, material='plaster', coords=None, smooth=False, fitted=False):
    start = len(verts)
    verts.extend((x, -z, y) for x, y, z in points)
    faces.append(tuple(range(start, start + len(points))))
    smooth_faces.append(smooth)
    idx = SLOTS[material]
    if material in WALL_TILES and not fitted:
        coords = wall_uv(points, material)
    if coords is None:
        coords = [(0, 0), (1, 0), (1, 1), (0, 1)][:len(points)]
    uvs.append([((idx % 4 + .015 + u * .97) / 4, (idx // 4 + .015 + v * .97) / 4) for u, v in coords])

# Metres one full atlas tile covers on the parts new articulation must match:
# the palas long wall for plaster, ashlar courses for limestone, cone slates.
UV_REF = {'plaster': (26, 21.8), 'limestone': (4, 4), 'stone-light': (4, 4), 'roof-small': (8.4, 6.75)}
def uv_span(material, fu, fv, uv_ref):
    ru, rv = UV_REF[material] if uv_ref is True else uv_ref
    su, sv = min(1, fu / ru), min(1, fv / rv)
    return [(0, 0), (su, 0), (su, sv), (0, sv)]

def period_cuts(lo, hi, tolerance=1.03):
    """Cut [lo, hi] (in periods) on whole periods; a sliver end joins its neighbour
    when the joined piece is within tolerance, so no cell is a few centimetres tall."""
    if hi - lo <= tolerance:
        return [lo, hi]
    cuts = [lo] + [k for k in range(math.floor(lo) + 1, math.ceil(hi)) if lo + 1e-6 < k < hi - 1e-6] + [hi]
    if len(cuts) > 2 and cuts[2] - cuts[0] <= tolerance:
        cuts.pop(1)
    if len(cuts) > 2 and cuts[-1] - cuts[-3] <= tolerance:
        cuts.pop(-2)
    return cuts

def wall_grid(a, b, d, material, smooth=False):
    """A vertical rectangle a (bottom-left), b (bottom-right), d (top-left) laid on
    the wall period grid: split where it is larger than one period, so each cell
    samples one seamless period at metre scale and courses stay level."""
    span_u, span_v = WALL_TILES[material]
    width = math.dist((a[0], a[2]), (b[0], b[2]))
    rows = period_cuts((a[1] - WALL_DATUM) / span_v, (d[1] - WALL_DATUM) / span_v)
    cols = period_cuts(0, width / span_u, 1.06)
    for r0, r1 in zip(rows, rows[1:]):
        v0, v1 = fit_courses([r0, r1], span_v)
        for c0, c1 in zip(cols, cols[1:]):
            u0, u1 = 0, (c1 - c0) / max(1, c1 - c0)
            pts = []
            for cu, gv in [(c0, r0), (c1, r0), (c1, r1), (c0, r1)]:
                f = cu * span_u / max(width, 1e-9)
                pts.append((a[0] + (b[0] - a[0]) * f, WALL_DATUM + gv * span_v, a[2] + (b[2] - a[2]) * f))
            poly(pts, material, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], smooth, fitted=True)

def box(x, y, z, w, h, d, material='plaster', uv_ref=None, skip=()):
    v = [(x+dx*w/2, y+dy*h/2, z+dz*d/2) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    # Face extents along each face's first and second edge, for uv_ref scaling.
    dims = [(d,w),(w,d),(w,h),(d,h),(w,h),(d,h)]
    for k,(f,(fu,fv)) in enumerate(zip([(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],dims)):
        if k < 2 and ('bottom','top')[k] in skip:continue
        if material in WALL_TILES and k >= 2:
            # Side faces run bottom-left, bottom-right, top-right, top-left.
            wall_grid(v[f[0]], v[f[1]], v[f[3]], material)
            continue
        poly([v[i] for i in f], material, uv_span(material, fu, fv, uv_ref) if uv_ref else None)

def transform(p, x, z, yaw=0):
    a, h, b = p
    return (x + a*math.cos(yaw) + b*math.sin(yaw), h, z - a*math.sin(yaw) + b*math.cos(yaw))

def prism(profile, depth, material, x=0, z=0, yaw=0, uv_bounds=None, side_materials=None, uv_ref=None, skip=()):
    # skip: side faces (profile edge i -> i+1) left open because a neighbouring
    # part closes the same rectangle; the two parts then share edges, not faces.
    # profile is x,height, with its outward face at positive depth.
    sides = [[transform((a, h, b), x, z, yaw) for a,h in profile] for b in [-depth/2, depth/2]]
    lo,hi,bottom,top = uv_bounds or (min(a for a,h in profile),max(a for a,h in profile),min(h for a,h in profile),max(h for a,h in profile))
    coords=[((a-lo)/max(.01,hi-lo),(h-bottom)/max(.01,top-bottom)) for a,h in profile]
    if uv_ref:
        (_,_),(su,_),(_,sv),_ = uv_span(material, hi-lo, top-bottom, uv_ref)
        coords=[(u*su,v*sv) for u,v in coords]
    poly(list(reversed(sides[0])), material, list(reversed(coords)))
    poly(sides[1], material, coords)
    for i in range(len(profile)):
        j=(i+1)%len(profile)
        if i in skip:continue
        m = side_materials[i] if side_materials else material
        c = None
        if uv_ref:
            # u runs along the extrusion, v along the profile edge, so mortar stays level.
            (_,_),(su,_),(_,sv),_ = uv_span(m, depth, math.dist(profile[i],profile[j]), uv_ref)
            c = [(0,0),(0,sv),(su,sv),(su,0)]
        poly([sides[0][i],sides[0][j],sides[1][j],sides[1][i]], m, c)

def roof(x, z, w, d, eave, ridge, yaw=0, hip=True):
    material = 'roof' if max(w,d)>8 else 'roof-small'
    v=[(-w/2,eave,-d/2),(w/2,eave,-d/2),(w/2,eave,d/2),(-w/2,eave,d/2)]
    pyramid = hip and max(w,d) < 5.5
    if pyramid:
        apex = transform((0,ridge,0),x,z,yaw)
        for (r0,t0),(r1,t1) in zip(ROOF_PROFILE,ROOF_PROFILE[1:]):
            lower=[transform((a*r0,eave+(ridge-eave)*t0,b*r0),x,z,yaw) for a,_,b in v]
            upper=[transform((a*r1,eave+(ridge-eave)*t1,b*r1),x,z,yaw) for a,_,b in v]
            for i in range(4):
                j=(i+1)%4
                poly([lower[i],lower[j],apex] if r1==0 else [lower[i],lower[j],upper[j],upper[i]],material,[(0,t0),(1,t0),(.5,t1)] if r1==0 else [(0,t0),(1,t0),(1,t1),(0,t1)])
        poly(list(reversed([transform(p,x,z,yaw) for p in v])), 'timber')
        features.append({'kind':'curved-pyramid-roof','centre':[x,z],'eave':eave,'ridge':ridge})
        return
    if not hip:
        section=[(-d*.5*r,eave+(ridge-eave)*t) for r,t in ROOF_PROFILE]
        section += [(d*.5*r,eave+(ridge-eave)*t) for r,t in reversed(ROOF_PROFILE[:-1])]
        ends=[[transform((a,h,b),x,z,yaw) for b,h in section] for a in [-w/2,w/2]]
        for i in range(len(section)-1):
            j=i+1
            poly([ends[0][i],ends[1][i],ends[1][j],ends[0][j]],material,[(0,ROOF_PROFILE[min(i,6-i)][1]),(1,ROOF_PROFILE[min(i,6-i)][1]),(1,(section[j][1]-eave)/(ridge-eave)),(0,(section[j][1]-eave)/(ridge-eave))])
        coords=[(b/d+.5,(h-eave)/(ridge-eave)) for b,h in section]
        poly(ends[0],'plaster',coords)
        poly(list(reversed(ends[1])),'plaster',list(reversed(coords)))
        poly([ends[0][0],ends[0][-1],ends[1][-1],ends[1][0]],'timber')
        # Ridge tiles overhang each gable by 2 cm: ending flush, their ends lay
        # in the plaster gable's plane, blue and white fighting at the apex.
        if yaw==0:box(x,ridge+.04,z,w+.04,.15,.18,'tile-ridge')
        else:box(x,ridge+.04,z,.18,.15,w+.04,'tile-ridge')
        features.append({'kind':'curved-gable-roof','centre':[x,z],'eave':eave,'ridge':ridge})
        return
    inset = min(d*.7, w*.25) if hip else 0
    v += [(-w/2+inset,ridge,0),(w/2-inset,ridge,0)]
    fs=[(0,1,5,4),(3,4,5,2),(0,4,3),(1,2,5)]
    local=v.copy()
    v=[transform(p,x,z,yaw) for p in v]
    for f in fs:
        pts=[v[i] for i in f]
        gable=not hip and len(f)==3
        coords=[((local[i][2]/d+.5) if gable else (local[i][0]/w+.5),(local[i][1]-eave)/(ridge-eave)) for i in f]
        poly(pts,'plaster' if gable else material,coords)
    poly([v[i] for i in [3,2,1,0]], 'timber')
    # Modest continuous ridge and fascia, no finials.
    a=transform((-w/2+inset,ridge+.04,0),x,z,yaw)
    b=transform((w/2-inset,ridge+.04,0),x,z,yaw)
    if yaw==0:box((a[0]+b[0])/2,ridge+.04,z,max(.12,w-2*inset),.15,.18,'tile-ridge')
    else:box(x,ridge+.04,(a[2]+b[2])/2,.18,.15,max(.12,w-2*inset),'tile-ridge')
    features.append({'kind':'roof','centre':[x,z],'eave':eave,'ridge':ridge,'hip':hip})

def arch_wall(x,z,width,depth,base,spring,top,opening,material='plaster',yaw=0,open_ends=()):
 # One closed profile per arched wall: piers, spandrel and arch soffit share
 # their edges instead of meeting as three prisms with coincident faces.
 # open_ends ('left' at -width/2, 'right' at +width/2) leaves an end to the
 # neighbouring bay of an arcade, so bays join on shared edges.
 r=opening/2
 arc=[(math.cos(math.pi-math.pi*i/10)*r,spring+math.sin(math.pi-math.pi*i/10)*r) for i in range(11)]
 profile=[(-width/2,base),(-r,base)]+arc+[(r,base),(width/2,base),(width/2,top),(-width/2,top)]
 skip={'right':len(profile)-3,'left':len(profile)-1}
 prism(profile,depth,material,x,z,yaw,(-width/2,width/2,base,top),skip=[skip[e] for e in open_ends])
 features.append({'kind':'opening','centre':[x,z],'base':base,'spring':spring,'radius':r,'depth':depth,'yaw':yaw})


BASE=3.2
# Castle plan: elongated palas at west, lower eastern knights' wing, an open
# court and a white gateway. The footprint stays at the existing site size.
# Rock skirt, built as a bedded crag rather than scaled rings. Every column runs
# from a footprint point F (y=0, on CASTLE_ROCK_OUTLINE, under the runtime
# plinth) inward to a seat S just inside the masonry face, at a height that
# varies 2.7-2.9 m, so the rock meets the footing unevenly instead of ending in
# a level slab edge. Between them two risers and two ledges follow bedding
# planes that dip across the plan, s = y - tilt(x, z), so ledges run obliquely
# around the hill. UVs come from the same field: u is footprint arc length in
# metres, cut on whole tile periods at sample points, and v is s, so the bedding
# in the rock tile coincides with the modelled ledges.
# Displacement is inward only (every vertex lies on its F-S segment), so the
# footprint, bounds and plinth hold. Both caps were inside the masonry or on
# the ground and are not built: the skirt is an open crag face.
edges=[(outline[i],outline[(i+1)%len(outline)]) for i in range(len(outline))]
lengths=[math.dist(a,b) for a,b in edges]
PERIM=sum(lengths); ROCK_U=PERIM/ROCK_PERIODS
starts=np.cumsum([0]+lengths[:-1])
def along(a):
 a%=PERIM
 k=max(i for i in range(len(edges)) if starts[i]<=a+1e-9)
 (x0,z0),(x1,z1)=edges[k];f=(a-starts[k])/lengths[k]
 return x0+(x1-x0)*f,z0+(z1-z0)*f
# Fixed samples: the outline corners and the four plan diagonals (where the seat
# turns the masonry corner); period cuts are phased to keep clear of both.
fixed=list(starts)
for k,((x0,z0),(x1,z1)) in enumerate(edges):
 for sg in (1,-1):
  den=(x1-x0)-sg*(z1-z0)
  if abs(den)>1e-9:
   f=(sg*z0-x0)/den
   if 1e-6<f<1-1e-6:fixed.append(starts[k]+f*lengths[k])
def clearance(o):
 return min(min(abs(c-f),PERIM-abs(c-f)) for c in [o+k*ROCK_U for k in range(ROCK_PERIODS)] for f in fixed)
ROCK_PHASE=max(np.linspace(0,ROCK_U,200,endpoint=False),key=clearance)
arcs=sorted(fixed+[ROCK_PHASE+k*ROCK_U for k in range(ROCK_PERIODS)])
while len(arcs)<ROCK_SAMPLES:
 gaps=[((arcs[(i+1)%len(arcs)]-arcs[i])%PERIM,i) for i in range(len(arcs))]
 g,i=max(gaps);arcs.insert(i+1,arcs[i]+g/2)
arcs=[a%PERIM for a in arcs];arcs.sort()
N=len(arcs)
def pnoise(seed,harmonics=(2,3,5,8,13,21,34)):
 # Periodic around the hill, down to about 4 m, plus a per-sample break.
 r=np.random.default_rng(seed);amp=[h**-.45 for h in harmonics];ph=r.uniform(0,2*math.pi,len(harmonics))
 smooth=np.array([sum(A*math.sin(2*math.pi*h*a/PERIM+p) for A,h,p in zip(amp,harmonics,ph))/sum(amp) for a in arcs])*1.8
 return np.clip(smooth+r.uniform(-.35,.35,len(arcs)),-1,1)
n=[pnoise(1104+k) for k in range(9)]
columns=[]
for i,a in enumerate(arcs):
 fx,fz=along(a);m=max(abs(fx),abs(fz))
 k=min(ROCK_SEAT/m,1-.3/math.hypot(fx,fz))
 tilt=.3*(fx*math.cos(.6)+fz*math.sin(.6))/26+.05*n[0][i]
 # The seat stays high (2.69-2.91 m), so only a thin, uneven edge of the pale
 # footing shows; s at the seat stays under 3.25, inside the rock slot.
 seat=min(2.8+.11*n[1][i],3.25+tilt)
 l1=1.0+.15*n[2][i];l3=1.9+.07*n[3][i];r2=.1+.04*n[8][i];r4=.1-.04*n[8][i]
 # Ledge depths swing from a few centimetres to about 0.9 m, so ledges die out and return.
 t1=.22+.08*n[4][i];t2=t1+.15+.11*n[5][i];t3=t2+.15+.06*n[6][i];t4=t3+.17+.1*n[7][i]
 # (t along F->S, s); y = s + tilt. The ledge backs sit 0.1 m above the riser tops.
 rows=[(0,-tilt),(t1,l1),(t2,l1+r2),(t3,l3),(min(t4,.9),l3+r4),(1,seat-tilt)]
 col=[]
 for t,s in rows:
  y=0 if t==0 else min(max(s+tilt,.45),seat)
  col.append(((fx+(fx*k-fx)*t,y,fz+(fz*k-fz)*t),y-tilt))
 assert all(p[1]<q[1] for (p,_),(q,_) in zip(col,col[1:])),(i,col)
 columns.append(col)
# The runtime CastleSteps climb this face along x=7.2; the rock stays under every tread.
for col in columns:
 for (x,y,z),_ in col:
  if abs(x-7.2)<5 and z>15.75:assert y<min(3.2,1.7+.4167*(20.2-z))-.1,(x,y,z)
for i in range(N):
 j=(i+1)%N
 aj=arcs[j]+(PERIM if j==0 else 0)
 base=math.floor((arcs[i]-ROCK_PHASE)/ROCK_U+1e-6)
 ui,uj=(arcs[i]-ROCK_PHASE)/ROCK_U-base,(aj-ROCK_PHASE)/ROCK_U-base
 assert -1e-6<=ui and uj<=1+1e-6,(i,ui,uj)
 for r in range(len(columns[i])-1):
  (li,si),(ui_,sui)=columns[i][r],columns[i][r+1]
  (lj,sj),(uj_,suj)=columns[j][r],columns[j][r+1]
  c=lambda u,s:(u,(s-ROCK_S0)/ROCK_SPAN)
  # Diagonals alternate so the facets read as broken stone, not a ribbed band.
  if (i+r)%2:
   poly([li,lj,uj_],'rock',[c(ui,si),c(uj,sj),c(uj,suj)]);poly([li,uj_,ui_],'rock',[c(ui,si),c(uj,suj),c(ui,sui)])
  else:
   poly([li,lj,ui_],'rock',[c(ui,si),c(uj,sj),c(ui,sui)]);poly([lj,uj_,ui_],'rock',[c(uj,sj),c(uj,suj),c(ui,sui)])
# Supporting masonry ends at the paving underside, leaving one exposed court.
# Working if the court has no coplanar foundation skin at its 3.2 m datum.
box(0,2.63,0,31.7,.86,31.7,'masonry')
box(0,3.13,0,31.85,.14,31.85,'paving')

# Arched windows use their own sloping stone reveal, dark inset and sill.
# They are surface recess illusions, while gates and gallery are true openings.
def window(x,z,y,w=.76,h=1.85,yaw=0):
 r=w/2; spring=y+h/2-r
 # Three arch segments (four samples): 16 triangles a window instead of 19,
 # which over ~215 windows pays for the lofted palas shell below.
 profile=[(-r,y-h/2),(r,y-h/2)]+[(math.cos(a)*r,spring+math.sin(a)*r) for a in np.linspace(0,math.pi,4)]
 outer=[(-r-.10,y-h/2-.10),(r+.10,y-h/2-.10)]+[(math.cos(a)*(r+.10),spring+math.sin(a)*(r+.10)) for a in np.linspace(0,math.pi,4)]
 # UVs span the glass swatch instead of a constant texel.
 poly([transform((a,hh,.022),x,z,yaw) for a,hh in profile],'glass',[(a/w+.5,(hh-y)/h+.5) for a,hh in profile])
 for i in range(len(profile)):
  j=(i+1)%len(profile)
  poly([transform((a,hh,b),x,z,yaw) for a,hh,b in [(outer[i][0],outer[i][1],.11),(outer[j][0],outer[j][1],.11),(profile[j][0],profile[j][1],.024),(profile[i][0],profile[i][1],.024)]],'stone-light')
 features.append({'kind':'arched-window','position':[x,y,z],'yaw':yaw})

def pair(x,z,y,yaw=0,w=.64,h=1.7):
 for a in [-w*.68,w*.68]:
  p=transform((a,y,0),x,z,yaw)
  window(p[0],p[2],y,w,h,yaw)

def group(x,z,y,yaw,n,w,h):
 # n=2 matches pair(); triples spread a little wider so reveals never overlap.
 s=w*(1.36 if n<3 else 1.45)
 for k in range(n):
  p=transform(((k-(n-1)/2)*s,y,0),x,z,yaw)
  window(p[0],p[2],y,w,h,yaw)

def drum(x,z,r,low,high,material='plaster',n=16):
 lowring=[(x+r*math.cos(i*2*math.pi/n),low,z+r*math.sin(i*2*math.pi/n)) for i in range(n)]
 highring=[(a,high,b) for a,_,b in lowring]
 if material in WALL_TILES:
  # Wall drums: u is arc length, rows cut on the wall period grid like flat walls.
  span_u,span_v=WALL_TILES[material]
  # A free-standing drum may compress its courses 15% rather than pay a ring.
  rows=period_cuts((low-WALL_DATUM)/span_v,(high-WALL_DATUM)/span_v,1.15)
  around=max(span_u,2*math.pi*r)
  for r0,r1 in zip(rows,rows[1:]):
   v0,v1=fit_courses([r0,r1],span_v);y0,y1=[WALL_DATUM+g*span_v for g in (r0,r1)]
   for i in range(n):
    j=(i+1)%n;u0,u1=2*math.pi*r*i/n/around,2*math.pi*r*(i+1)/n/around
    poly([(lowring[i][0],y0,lowring[i][2]),(lowring[j][0],y0,lowring[j][2]),(lowring[j][0],y1,lowring[j][2]),(lowring[i][0],y1,lowring[i][2])],material,[(u0,v0),(u1,v0),(u1,v1),(u0,v1)],smooth=True,fitted=True)
 else:
  for i in range(n):
   j=(i+1)%n;poly([lowring[i],lowring[j],highring[j],highring[i]],material,[(i/n,0),((i+1)/n,0),((i+1)/n,1),(i/n,1)],smooth=True)
 poly(list(reversed(lowring)),material,[(0,0)]*n)
 poly(highring,material,[(0,0)]*n)

def cone(x,z,r,eave,apex,n=20):
 ring=[(x+r*math.cos(i*2*math.pi/n),eave,z+r*math.sin(i*2*math.pi/n)) for i in range(n)]
 for (r0,t0),(r1,t1) in zip(ROOF_PROFILE,ROOF_PROFILE[1:]):
  lower=[(x+r*r0*math.cos(i*2*math.pi/n),eave+(apex-eave)*t0,z+r*r0*math.sin(i*2*math.pi/n)) for i in range(n)]
  upper=[(x+r*r1*math.cos(i*2*math.pi/n),eave+(apex-eave)*t1,z+r*r1*math.sin(i*2*math.pi/n)) for i in range(n)]
  for i in range(n):
   j=(i+1)%n
   poly([lower[i],lower[j],(x,apex,z)] if r1==0 else [lower[i],lower[j],upper[j],upper[i]],'roof-small',[(i/n,t0),((i+1)/n,t0),((i+.5)/n,t1)] if r1==0 else [(i/n,t0),((i+1)/n,t0),((i+1)/n,t1),(i/n,t1)],smooth=True)
 poly(list(reversed(ring)),'dark-metal',[(0,0)]*n)
 features.append({'kind':'curved-spire','centre':[x,z],'eave':eave,'apex':apex,'radius':r})

def round_tower(x,z,r,base,eave,apex,levels=None):
 drum(x,z,r,base,eave)
 drum(x,z,r+.16,eave-1.5,eave-1.25,'stone-light')
 drum(x,z,r+.27,eave-.18,eave,'stone-light')
 # The lower portal turrets have a clean circular cornice, rather than teeth.
 for i in range(12 if levels is None else 0):
  a=i*math.pi/6
  # Small attached stone consoles support the overhanging watch stage.
  box(x+(r+.04)*math.sin(a),eave-1.05,z+(r+.04)*math.cos(a),.18,.6,.18,'limestone')
 cone(x,z,r+.29,eave,apex)
 for a in [0,math.pi/2,math.pi,3*math.pi/2]:
  for y in levels if levels is not None else [eave-2.7,eave-7.5]:
   px,pz=x+r*math.sin(a),z+r*math.cos(a)
   # A window inside the palas volume and below its 25 m eave is never seen.
   if -11.5<px<1.5 and -17<pz<9 and y+.6<25:continue
   if y>base+1:window(px,pz,y,.5,1.2,a)

# The high palas reads as one long residential volume under a steep slate gable.
# Its shell is lofted, not boxed: one closed plan section per height, with the
# piers, the clasping corner piers, the centre risalit and the downpipe chase in
# the section itself, so the battered plinth, the coved cornice and every
# projection are faces of one surface rather than prisms glued to a slab. Each
# face takes metre UVs on the wall period grid (u along its own plan direction,
# v from the 3.2 m datum, cut at the 14.2 m period line), so no stone tile is
# stretched up the wall: the old limestone buttresses and stone-light shafts,
# a 4 m tile over 16-21.6 m, read as pale vertical smears and are gone.
# The runtime rainwater set fixes the clearances: downpipes and clips at
# z=-6.5 on both walls run in a chase (z -6.85..-6.0) that never projects;
# gutters hang 0.4 m outboard with their underside at 24.885 m, and every face
# outboard of x -11.795 / 1.795 stays below 24.84 m; on the court side the
# drain channel at x 1.97-2.13 keeps the east plinth within 0.42 m.
PALAS_Y=[3.2,5.95,14.2,23.85,24.15,24.55,25.0]
PALAS_DEPTH={
 # plinth foot, plinth top, period line, cornice foot, cove, cornice top, eave
 'west':{'bay':[.45,0,0,0,.28,.28,0],'pier':[.65,.45,.45,.45,.55,.55,0],'chase':[0]*7,'risalit':[.85,.6,.6,.6,.8,.8,.6]},
 'east':{'bay':[.3,0,0,0,.28,.28,0],'pier':[.42,.35,.35,.35,.45,.45,0],'chase':[0]*7,'risalit':[.42,.35,.35,.35,.55,.55,0]},
 # The end walls corbel out to carry the gable, which stands 0.4 m proud at the eave.
 'end':{'bay':[.45,0,0,0,.28,.3,.4],'pier':[.65,.45,.45,.45,.55,.55,.4]},
}
PALAS_EDGES=[
 # start, end, outward normal, depth set, runs (u0, u1, class) from the start
 ((-11.5,-17),(-11.5,9),(-1,0),'west',[(0,.9,'pier'),(.9,4.95,'bay'),(4.95,5.85,'pier'),(5.85,10.15,'bay'),(10.15,11,'chase'),(11,14.2,'risalit'),(14.2,19.35,'bay'),(19.35,20.25,'pier'),(20.25,25.1,'bay'),(25.1,26,'pier')]),
 ((-11.5,9),(1.5,9),(0,1),'end',[(0,.9,'pier'),(.9,4.15,'bay'),(4.15,5.05,'pier'),(5.05,7.95,'bay'),(7.95,8.85,'pier'),(8.85,12.1,'bay'),(12.1,13,'pier')]),
 # The east wall's z<-12 run lies in the main tower, so it carries no pier there.
 ((1.5,9),(1.5,-17),(1,0),'east',[(0,.9,'pier'),(.9,5.75,'bay'),(5.75,6.65,'pier'),(6.65,11.8,'bay'),(11.8,15,'risalit'),(15,15.85,'chase'),(15.85,25.1,'bay'),(25.1,26,'pier')]),
 ((1.5,-17),(-11.5,-17),(0,-1),'end',[(0,.9,'pier'),(.9,4.15,'bay'),(4.15,5.05,'pier'),(5.05,7.95,'bay'),(7.95,8.85,'pier'),(8.85,12.1,'bay'),(12.1,13,'pier')]),
]
def palas_ring(j):
 ring=[]
 for e,(p0,p1,n,kind,runs) in enumerate(PALAS_EDGES):
  L=math.dist(p0,p1);t=((p1[0]-p0[0])/L,(p1[1]-p0[1])/L)
  for u0,u1,cls in runs:
   d=PALAS_DEPTH[kind][cls][j]
   ring+=[(p0[0]+t[0]*u+n[0]*d,p0[1]+t[1]*u+n[1]*d) for u in (u0,u1)]
  # Clasping corner: offset by both walls' depths, so a corner pier turns square.
  _,_,n2,kind2,runs2=PALAS_EDGES[(e+1)%len(PALAS_EDGES)]
  a=PALAS_DEPTH[kind][runs[-1][2]][j];b=PALAS_DEPTH[kind2][runs2[0][2]][j]
  ring.append((p1[0]+n[0]*a+n2[0]*b,p1[1]+n[1]*a+n2[1]*b))
 return ring
# Each ring point's (run, class), in palas_ring's order: two per run, one per corner.
tags=[]
for e,(_,_,_,_,runs) in enumerate(PALAS_EDGES):
 for r,(_,_,cls) in enumerate(runs):tags+=[((e,r),cls)]*2
 tags.append(((e,'corner'),'corner'))
def palas_material(j,i,k):
 # The plinth band is dressed all round; above it a segment inside one run takes
 # that run's role, and a step or corner touching a pier is the pier's return.
 (ri,ci),(rk,ck)=tags[i],tags[k]
 if j==0:return 'limestone'
 if ri==rk:return 'limestone' if ci=='pier' else 'plaster'
 return 'limestone' if {'pier','corner'}&{ci,ck} else 'plaster'
rings=[palas_ring(j) for j in range(len(PALAS_Y))]
assert all(len(r)==len(tags) for r in rings)
span_u,span_v=WALL_TILES['plaster']
for j in range(len(PALAS_Y)-1):
 y0,y1=PALAS_Y[j],PALAS_Y[j+1]
 row=0 if y1<=WALL_DATUM+span_v+1e-6 else 1
 for i in range(len(rings[j])):
  k=(i+1)%len(rings[j])
  pts=[]
  for (x,z),y in [(rings[j][i],y0),(rings[j][k],y0),(rings[j+1][k],y1),(rings[j+1][i],y1)]:
   if not pts or math.dist((x,y,z),pts[-1])>1e-6:pts.append((x,y,z))
  if len(pts)>1 and math.dist(pts[0],pts[-1])<=1e-6:pts.pop()
  if len(pts)<3:continue
  # Newell area: a step with no depth at either level is a line, not a face.
  nx=ny=nz=0
  for m in range(len(pts)):
   a,b=pts[m],pts[(m+1)%len(pts)]
   nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1])
  if math.sqrt(nx*nx+ny*ny+nz*nz)<1e-6:continue
  # u in metres along the face's own plan direction; v from the datum.
  s=max([(rings[j][i],rings[j][k]),(rings[j+1][i],rings[j+1][k])],key=lambda ab:math.dist(*ab))
  sl=math.dist(*s);sd=((s[1][0]-s[0][0])/sl,(s[1][1]-s[0][1])/sl)
  us=[p[0]*sd[0]+p[2]*sd[1] for p in pts]
  base=math.floor(min(us)/span_u+1e-9)*span_u
  if max(us)-base>span_u+1e-6:base=min(us)
  poly(pts,palas_material(j,i,k),[((u-base)/span_u,(p[1]-WALL_DATUM)/span_v-row) for u,p in zip(us,pts)],fitted=True)
features.append({'kind':'lofted-palas-shell','levels':PALAS_Y,'sections':len(rings[0])})
roof(-5,-4,26.8,13.8,25,34.8,math.pi/2,False)
# String courses run between the piers; the piers, corners and risalit carry them inside.
for y in [6.0,10.8,15.5,20.2]:
 box(-5,y,-4,13.23,.16,26.2,'stone-light')
# Long walls: the window rhythm changes by floor; the risalit has its own.
PALAS_FLOORS=[(8,1,.7,1.5),(12.7,2,.64,1.7),(17.4,2,.64,1.9),(22.1,2,.66,2.3)]
RISALIT_FLOORS=[(8,1,.9,2.2),(12.7,2,.64,1.8),(17.4,3,.58,1.9),(22.1,3,.6,2.4)]
RZ,RD=-4.4,3.2
for side,wall,yaw,out in [(-1,-11.5,-math.pi/2,.6),(1,1.5,math.pi/2,.35)]:
 face=wall+side*out
 # The east wall's z=-14 bay lies inside the main round tower, so it has no windows.
 bays=[-14,-9.2,.4,5.2] if side<0 else [-9.2,.4,5.2]
 for y,n,w,h in PALAS_FLOORS:
  for z in bays:
   if side>0 and z==.4 and y==17.4:continue
   group(wall,z,y,yaw,n,w,h)
 for y,n,w,h in RISALIT_FLOORS:group(face,RZ,y,yaw,n,w,h)
 # Bay string courses butt the main ones at a 1 cm taller section.
 for y in [6.0,10.8,15.5]+([20.2] if side>0 else []):
  box(face+side*(.115-.2)/2,y,RZ,.315,.17,RD+.23,'stone-light',(26.2,.16))
# The west risalit rises through the eave as a cross gable under its own slate
# roof, breaking the long eave line; its ridge stays under 27 m at x=-11, below
# the main roof's shoulder. The gutter (top 24.99) runs into its sides under the
# roof edge at 25.0 and is housed inside it.
GX,GZ0,GZ1,CG_EAVE,CG_RIDGE=-12.1,RZ-RD/2,RZ+RD/2,25.0,26.9
cg_slope=(CG_RIDGE-CG_EAVE)/(RD/2+.1)
poly([(GX,25,GZ1),(GX,25,GZ0),(GX,25+.1*cg_slope,GZ0),(GX,CG_RIDGE,RZ),(GX,25+.1*cg_slope,GZ1)],'plaster')
for zz in (GZ0-.1,GZ1+.1):
 poly([(-12.4,CG_EAVE,zz),(-9.6,CG_EAVE,zz),(-9.6,CG_RIDGE,RZ),(-12.4,CG_RIDGE,RZ)],'roof-small',uv_span('roof-small',2.8,math.hypot(RD/2+.1,CG_RIDGE-CG_EAVE),True))
box(-11.0,CG_RIDGE+.04,RZ,2.8,.15,.18,'tile-ridge')
window(GX,RZ,25.6,.5,.8,-math.pi/2)
features.append({'kind':'cross-gable','centre':[GX,RZ],'eave':CG_EAVE,'ridge':CG_RIDGE})
# West: the hall balcony on two corbels in place of the 20.2 m course.
box(-12.425,20.2,RZ,.85,.24,RD+.3,'stone-light',(4,4))
box(-12.74,20.75,RZ,.16,.9,RD+.2,'limestone',True)
# Side returns start inside the front parapet and stop 4 cm lower, so no faces coincide.
for s in [-1,1]:box(-12.39,20.73,RZ+s*1.61,.62,.86,.16,'limestone',True)
for z in [RZ-1.1,RZ+1.1]:
 prism([(-.1,19.4),(.12,19.4),(.68,20.12),(-.1,20.12)],.3,'limestone',-12.1,z,math.pi,uv_ref=True)
# Court-side oriel over bay z=0.4: corbel, glazed front and a slate lean-to.
prism([(-.1,14.6),(.8,15.9),(.8,19.2),(-.1,20.08)],2.0,'plaster',1.5,.4,0,side_materials=['stone-light','plaster','roof-small','plaster'],uv_ref=True)
group(2.3,.4,17.55,math.pi/2,2,.58,1.9)
for z,yaw in [(9,0),(-17,math.pi)]:
 for y in [8,12.7,17.4,22.1]:
  for x in [-8.8,-5,-1.2]:
   if z>0:pair(x,z,y,yaw)
   else:window(x,z,y,.8,1.7,yaw)
 # Front/rear gable windows are physically on the vertical triangular face.
 for x in [-7.2,-2.8]:pair(x,z+(.4 if z>0 else -.4),27.5,yaw,w=.65,h=2)
 window(-5,z+(.4 if z>0 else -.4),30.7,.9,1.9,yaw)
# A single dominant round tower and subordinate, attached stair turrets.
round_tower(2.05,-14.0,1.85,BASE,35.5,41.9)
round_tower(-11.5,8.0,1.03,17.0,29.3,33.8)
round_tower(1.5,8.0,.88,18.0,28.9,32.8)
# Sparse slate dormers and actual roof-seated stone chimneys.
for z in [-11.8,-5,1.8]:
 for side in [-1,1]:
  x=-5+side*4.25
  # The body runs down to 26.7 m, under the flared roof at its outer face
  # (26.83 m at |dx| 4.85), so it rises out of the slates instead of standing
  # on them with a gap under its front; its bottom is inside the roof.
  box(x,27.85,z,1.2,2.3,1.35,skip=('bottom',))
  roof(x,z,1.65,1.7,29,30.1,math.pi/2,False)
  window(x+side*.61,z,28.25,.52,.85,side*math.pi/2)
for z in [-10,1]:
 box(-5,34,z,.68,3.4,.9,'plaster-warm')
 box(-5,35.65,z,.92,.2,1.1,'stone-light')
 box(-5,35.77,z,.59,.04,.77,'dark-metal')

# The lower eastern wing leaves a usable asymmetrical court beside the palas.
box(13,8.1,.7,4.8,9.8,22.0,'plaster-warm')
roof(13,.7,22.8,5.6,13,17.3,math.pi/2,False)
for y in [4.0,8.4,12.8]:box(13,y,.7,5.04,.16,22.2,'stone-light')
for z in [-6.8,-2.8,1.2,5.2,9.2]:
 for y in [6.1,10.4]:
  pair(15.4,z,y,math.pi/2,w=.55,h=1.5)
  pair(10.6,z,y,-math.pi/2,w=.55,h=1.5)
# Square watchtower, deliberately separate from the tall conical palas tower.
box(12.65,14.2,-10.6,4.4,22.0,4.4)
box(12.65,24.3,-10.6,5.5,1.5,5.5,'stone-light')
box(12.65,26.1,-10.6,4.8,2.1,4.8)
roof(12.65,-10.6,5.35,5.35,27.15,29.6)
for side in [-1,1]:
 for a in [-1.7,-.85,0,.85,1.7]:
  box(12.65+a,23.25,-10.6+side*2.27,.32,1.2,.42,'stone-light')
  box(12.65+side*2.27,23.25,-10.6+a,.42,1.2,.32,'stone-light')
 for y in [9,15,20.5,26.1]:
  window(12.65,-10.6+side*(2.4 if y>25 else 2.2),y,.65,1.25,0 if side>0 else math.pi)
  window(12.65+side*(2.4 if y>25 else 2.2),-10.6,y,.65,1.25,side*math.pi/2)

# A lower west court wing and a colonnade articulate the human-scale approach.
box(-9.5,7.3,12.35,10,8.2,5.9)
roof(-9.5,12.35,10.7,6.6,11.4,16,0,False)
for x in [-12.5,-9.5,-6.5]:pair(x,15.3,8.2,w=.64,h=1.6)
# Open covered gallery on the courtyard-facing east wing.
box(9.45,8.35,2,2.3,.18,15.8,'stone-light')
for z in [-4,-1,2,5,8]:
 arch_wall(8.65,z,3,.38,8.45,10.25,12.1,2.24,'stone-light',math.pi/2,[e for e,inner in [('left',z<8),('right',z>-4)] if inner])
roof(9.6,2,16,2.65,12.1,13.2,math.pi/2)

# The white gatehouse retains its real vaulted passage and walking datum.
arch_wall(7.2,13.65,15.0,3.6,BASE,6.0,11.4,3.7,'gate-white')
roof(7.2,13.65,15.6,4.2,11.4,13.3)
# String courses run 2 cm past the gate wall's ends instead of ending in its planes.
box(7.2,10.8,15.48,15.04,.18,.18,'stone-light')
for x in [2.64,11.76]:box(x,4.1,15.48,5.92,.18,.18,'stone-light')
for x in [1.6,4,10.4,12.8]:window(x,15.45,9.2,.66,1.3)
# Archivolt voussoirs keep their own stone mapping but share their radial joints,
# and stand on the jambs: the jamb tops and springer beds are the same
# rectangles, so neither is a face and the arch reads as one coursed ring.
for i in range(10):
 a=i*math.pi/10;b=(i+1)*math.pi/10
 profile=[(math.cos(a)*1.85,6+math.sin(a)*1.85),(math.cos(b)*1.85,6+math.sin(b)*1.85),(math.cos(b)*2.25,6+math.sin(b)*2.25),(math.cos(a)*2.25,6+math.sin(a)*2.25)]
 # Back at the gate wall's face (15.45, the passage's 3.6 m depth), front at
 # 15.57: an intrados reaching 4 cm into the passage lay on its soffit.
 prism(profile,.12,'stone-light',7.2,15.51,skip=(1,3))
for x in [5.15,9.25]:box(x,4.6,15.51,.4,2.8,.12,'stone-light',skip=('top',))
# Rounded blue-capped portal turrets recall v0.30 without changing the gate gap.
for x in [-.5,14.9]:
 round_tower(x,14.1,1.18,BASE,13.1,17.2,levels=[10.4])
# The approach is the shared runtime CastleSteps assembly. Keeping it separate
# preserves the palace pivot and scale when its ground-level approach extends
# beyond the rock envelope. No old ramp may occlude the authored treads.
# Parapets close exposed terrace edges, keeping the principal court open to sky.
for x in [-15.65,15.65]:box(x,3.77,0,.42,1.15,31.2,'masonry')
box(-8.8,3.77,15.7,13.4,1.15,.42,'masonry')

mesh=bpy.data.meshes.new('Neuschwanstein palace authored mesh')
mesh.from_pydata(verts,[],faces)
mesh.update()
uv=mesh.uv_layers.new(name='AuthoredAtlas')
for face, coords, smooth in zip(mesh.polygons,uvs,smooth_faces):
 face.use_smooth = smooth
 for loop, coord in zip(face.loop_indices,coords):uv.data[loop].uv=coord
# Each closed architectural part has explicit surfaces; welding only identical
# points makes outward normals deterministic without changing silhouettes.
bm=bmesh.new();bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001)
bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
bm.to_mesh(mesh);bm.free()
mesh.materials.append(mat)
obj=bpy.data.objects.new('CastleBody',mesh)
bpy.context.collection.objects.link(obj)
obj.select_set(True);bpy.context.view_layer.objects.active=obj
mesh.calc_loop_triangles()
triangles=len(mesh.loop_triangles)
assert triangles*3<=25200, triangles*3
bpy.ops.export_scene.gltf(filepath=str(DEST),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False)
assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==original_hash
report={'source':'fully authored geometry and atlas; retired provider mesh retained separately','originalSha256':original_hash,'preparedFile':str(DEST.relative_to(ROOT)),'triangles':triangles,'renderVertices':triangles*3,'materials':1,'features':features}
(OUT/'source-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('NEUSCHWANSTEIN_AUTHORING',triangles,'triangles',triangles*3,'render vertices')
