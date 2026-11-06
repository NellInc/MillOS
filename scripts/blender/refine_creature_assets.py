"""Conservative, rig-byte-preserving surface fairing of reviewed Tripo creatures.

Run with Python 3 + numpy (Blender's Python also works). Writes sibling *-crafted
sources, never delivery GLBs. No image, UV, topology, weight, joint, inverse-bind,
node, animation, or material data is changed. Only existing POSITION and NORMAL
accessor bytes are touched. Working if byte-diff checks prove this boundary and
paired rendered views retain animal identity while removing broad-surface noise.

Exception, REBUILDS (pig; the horse is described below): after fairing, the pig's torso is rebuilt as the
level set of a blurred body volume (vertices carried onto it, normals from its
gradient; the tail's root is a capsule in that volume, so the rump rises to
meet it), the ear blades are re-shaped onto a fitted quadric mid-surface and
faired, and each leg below a cut is deleted and lofted afresh from its traced
front and side profile with a cloven trotter (own UV islands); one rump region
is rebuilt - its faces deleted, the hole filled by a biharmonic surface that
closes onto the foot of a tail whose joint is the iso-curve of a blended
rump-and-tube union, traced as a side-profile curl - so the pig's topology,
vertex count and new-vertex UVs (two islands in empty atlas space) change. The
skin of the albedo, ORM and normal images is then painted from 3D position
through a UV rasterisation (Pillow, pig only), including the trotter horn as a
gradient and the face (eyes enlarged with a catchlight, lid and brow, snout disc
and rim); the chart gutters are filled by pull-push and roughness is matte
everywhere but the eyes and nostrils.
Retained vertices keep their UV, joint and weight bytes; inverse binds, nodes,
skins, materials and animations stay byte-identical, covered non-skin colour
stays within JPEG re-encode error, and the rebuild asserts each of those.
`--only=pig` (or farm-pig) regenerates one creature without touching others.

REBUILDS also holds the horse (HORSE_HINDQUARTERS, rebuild_hindquarters): its
generator tail plate is removed, the rump is moved onto the level set of a
blurred body volume and a lofted hanging tail is grafted on; new surfaces
sample solid squares of the existing atlas, so no image byte changes. A second
stage (HORSE_MANE, rebuild_mane) replaces the generator's crest strip and tuft
lobes with one closed lofted mane shell over a filled, eased neck crest. Since
round 3 (tail `locks`, _horse_tail_bundle) the lofted tail is only the dock,
capped inside the hair, and the hair is a bundle of separately lofted, tapered
locks of staggered length on offset centre lines inside a traced envelope.
A third stage (round 4, HORSE_HIND_LEGS, rebuild_hind_legs) deletes each hind
leg below a cut and lofts it afresh from an authored side and back profile
(hoof, pastern, fetlock, cannon, pointed hock, widening gaskin) on a bent
centre line, traced only at the top to land on the retained thigh, whose back
is filled rearward above the cut. Round 5 (HORSE_RUMP, HORSE_HINDQUARTERS['cap'],
_rump_field, _horse_tail_lobed) deletes the whole rear cap and refills it with
ray-placed rings on an authored solid traced from back-view, side-view and plan
silhouettes (median crease, crotch notch), and replaces the lock bundle with one
closed loft carved into twisting lock lobes, welded at the dock foot; the
hind-leg stage then leaves that tail out by its hair square (`excludeUV`).
Round 6 (HORSE_HAUNCH, rebuild_haunch) treats rump, thigh and hind leg as one
joint on the welded result: the hind limb is posed by its joints (drawn toward
the midline below the stifle, the hock under the point of buttock, the cannon
plumb), the stage seams are faired, tapered-capsule thigh masses are united
with the body along each vertex normal, the croup is drawn in behind the hip,
and the joint band's diagonals are re-laid by dihedral-reducing edge flips.

The duck's torso cap (back, wings, rump and tail) is deleted after fairing and
refilled by parts with modelled joints (DUCK_TORSO, rebuild_duck_torso): a body
loft from traced side and plan sections that closes on a rounded rump, two
folded wings lofted as their own closed lens shells laid on it (upper part
buried, lower lip standing proud as an undercut, pointed primaries), and an
upturned tail wedge lofted on a traced side profile and seated in the rump, each
with its own rectangle of a painted UV island, so its topology, UV, skin and
three images change (see the comment above it). A second duck stage (DUCK_FEET,
rebuild_duck_feet) deletes each leg below an ankle cut and lathes the foot
afresh about its ankle from a traced plan outline (three splayed toes, concave
web, heel pad) and side profile (tapered tarsus, ankle knuckle, thin web with
toe ridges, flat sole), with its own painted orange UV rectangles.

The dino mascot is rebuilt whole (DINO_MASCOT, build_dino_mascot): the
generator mesh is replaced by one implicit solid authored from traced side and
front profiles (head and torso lofts on bent centre lines joined at the neck
with a midline nape fill, a separate traced midline tail loft filleted into the
rump, cheeks, brows, thighs and flat-soled toed feet, elbowed arms with
three-fingered mitten hands, four graded lathed dorsal spikes in flared root
fillets, a smile groove and a tongue), contoured by surface nets, decimated by feature-weighted
quadric edge collapse and fitted to the source bounds. Its UVs are re-laid as
region charts (per part and facing axis, each eye disc on its own plane) and
every texel is painted from the surface point it maps to, so its mesh and all
three images change.

The separate correct_duck_dorsal_albedo.py stage may be run afterwards for the
reviewed duck-only colour correction. That opt-in stage has its own texture-only
preservation checks; this fairing stage retains its position/normal-only contract.
"""
import argparse
import hashlib
import json
import pathlib
import struct
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
# Iterations and mobility differ deliberately: fleece and feathers retain their
# authored relief; smooth-skinned creatures receive stronger low-frequency fairing.
PROFILES = {
    'cow': ('farm', 8, .70, 'Fair lumpy shoulder, flank and muzzle transitions; preserve horns and hooves'),
    'sheep': ('farm', 2, .24, 'Soften triangulation within fleece lobes, retain every wool clump'),
    'pig': ('farm', 10, .85, 'Fair broad flank and cheek while retaining ears, nostrils and curled tail'),
    'horse': ('farm', 8, .70, 'Fair neck, shoulders and flank; retain mane ridges and hooves'),
    'chicken': ('farm', 3, .32, 'Ease feather-lobe triangulation without flattening layered wings or comb'),
    'crow': ('farm', 3, .32, 'Ease breast and wing shading while retaining beak, claws and feather tips'),
    'duck': ('farm', 8, .65, 'Round broad breast and cheeks while retaining wing lobes, bill and webbed toes'),
    'cat': ('village', 6, .45, 'Ease cheek and shoulder noise while protecting whiskers, ears and tail'),
    'dino-mascot': ('world', 5, .50, 'Fair subtle sphere triangulation while retaining stitched eyes, tongue and spikes'),
}


def load_glb(path):
    blob = bytearray(path.read_bytes())
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    return blob, doc, 28 + length


def accessor(blob, doc, base, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    stride = v.get('byteStride', np.dtype(dtype).itemsize * width)
    offset = base + v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.ndarray((a['count'], width), dtype=dtype, buffer=blob, offset=offset,
                      strides=(stride, np.dtype(dtype).itemsize)), offset, stride


def fair(positions, faces, iterations, mobility):
    # Join UV-seam copies for geometric processing only, preserving all original
    # vertices and attribute arrays in the output.
    size = float(np.ptp(positions, axis=0).max())
    _, first, inverse = np.unique(np.round(positions / (size * 1e-7)).astype('i8'),
                                  axis=0, return_index=True, return_inverse=True)
    p = positions[first].astype('f8')
    f = inverse[faces]
    edges = np.unique(np.sort(np.concatenate((f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]])), axis=1), axis=0)
    degree = np.bincount(edges.ravel(), minlength=len(p))
    def laplace(q):
        total = np.zeros_like(q)
        np.add.at(total, edges[:, 0], q[edges[:, 1]])
        np.add.at(total, edges[:, 1], q[edges[:, 0]])
        return total / np.maximum(1, degree)[:, None] - q
    edge_lengths = np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)
    scale = np.zeros(len(p))
    np.add.at(scale, edges[:, 0], edge_lengths)
    np.add.at(scale, edges[:, 1], edge_lengths)
    scale /= np.maximum(1, degree)
    curvature = np.linalg.norm(laplace(p), axis=1) / np.maximum(scale, 1e-12)
    # High-curvature tips and narrow details have zero mobility. Bounds vertices
    # are pinned so downstream normalization yields the same size contract.
    weights = mobility * np.clip((.65 - curvature) / .4, 0, 1)
    lo, hi = p.min(axis=0), p.max(axis=0)
    boundary = np.any((p - lo < size * .002) | (hi - p < size * .002), axis=1)
    weights[boundary] = 0
    original = p.copy()
    for _ in range(iterations):
        p += .45 * weights[:, None] * laplace(p)
        p -= .47 * weights[:, None] * laplace(p)
    # Absolute displacement guard is 0.6% of extent. This prevents a local
    # reconstruction from changing silhouette identity or skin articulation.
    displacement = p - original
    dist = np.linalg.norm(displacement, axis=1)
    p = original + displacement * np.minimum(1, size * .006 / np.maximum(dist, 1e-12))[:, None]
    # Freeze vertices of any source sliver whose orientation would invert. This
    # is a geometric safeguard, never removal of the triangle or validation.
    old_cross = np.cross(original[f[:, 1]] - original[f[:, 0]], original[f[:, 2]] - original[f[:, 0]])
    for _ in range(20):
        new_cross = np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        pinned = np.unique(f[flipped])
        p[pinned] = original[pinned]
    return p[inverse], f, inverse


def normals(positions, faces, inverse, original):
    p = positions.astype('f8')
    corners = p[faces]
    cross = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    face_norm = cross / np.maximum(np.linalg.norm(cross, axis=1), 1e-20)[:, None]
    # Angle weighting avoids large skinny triangles biasing the smooth normal.
    summed = np.zeros((inverse.max() + 1, 3))
    for i in range(3):
        u = corners[:, (i + 1) % 3] - corners[:, i]
        v = corners[:, (i + 2) % 3] - corners[:, i]
        cosine = (u * v).sum(axis=1) / np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-20)
        angle = np.arccos(np.clip(cosine, -1, 1))
        np.add.at(summed, inverse[faces[:, i]], face_norm * angle[:, None])
    result = summed[inverse]
    result /= np.maximum(np.linalg.norm(result, axis=1), 1e-20)[:, None]
    # An intentionally split hard edge keeps its original shading normal.
    dot = (result * original).sum(axis=1)
    result[dot < .65] = original[dot < .65]
    return result


# Region rebuilds. Fairing moves existing vertices only, which cannot repair a
# relief the generator pressed into the surface. The pig's tail came out as a
# flat glyph lying on the rump, with a folded crease (a surface Z-fold whose
# faces overhang one another, plus dark baked shading in the albedo) running
# from its base. The rebuild deletes every face of that region and grafts a
# tail onto the rump as ONE surface: rings run from the hole's edge in to the
# foot of the tail, whose first ring lies on the rump.
#
# Construction (rounds 1-3 coiled a tube round a fixed axis and laid it on
# the rump face, which from behind read as a ring or rosette pressed on, with
# a clamped flare folding into a crease at its base; round 5 replaced round
# 4's quarter-circle fillet, which still read as a pinched crease, and reads
# the rump off the rebuilt body volume):
#   - The tail's centre line is traced as a side profile, a heading integral:
#     a stalk out along the rump's own normal, a bend up, then one loop that
#     curls forward over itself with a shrinking radius. The loop is turned
#     out of the sagittal plane and advances sideways, so it reads as an open
#     curl from behind and as a loop in silhouette from the side, standing
#     clear of the sloped upper rump instead of lying on it.
#   - The base is a modelled joint (_dock_profile): the iso-curve of a
#     blended union of the rump and the tube, three times the old fillet's
#     width, tangent to the rump at its foot and to the tube at its top.
#     The tube is thicker (17.5 to 11.5 mm) and the loop wider, so it stands
#     up over the rump line from behind.
#   - The fill between the hole's edge and the foot is solved as a
#     least-squares biharmonic surface over the retained ring outside the
#     hole, so it meets the rump with matching slope (the height-field fill
#     dented where the rump turns into the haunch).
#   - The fill and the tail get their own UV islands in empty atlas space,
#     and the skin of the whole hide is then painted from 3D position (see
#     bake_skin_maps), so a UV seam cannot show.
# Fill and tail blend their skin from the hole's edge to the root, so the
# tail moves with the rump it grows from. Every retained vertex keeps its UV,
# joint and weight bytes; inverse binds, nodes and skins are byte-identical.
# Source units, Tripo frame: +X head, -X rump, +Y up; (z, y) ellipses.
REBUILDS = {
    'pig': {
        'rearX': -.38,
        'region': ((-.02, .415), (.15, .13)),
        'fitScale': 1.5,
        # The glyph and the crease, left out of the height-field fit.
        'relief': (((-.073, .42), (.075, .098)), ((.03, .38), (.07, .06))),
        # Vertex counts of the fill rings between the hole's edge and the
        # tail's foot ring, outermost first.
        'fillCounts': (30, 25, 20, 16),
        # The torso as the level set of a blurred body volume (smooth_body),
        # replacing rounds 3-4's Taubin fairing. voxel and sigma are source
        # units; iso is the occupancy level the surface is placed at. Ramps
        # are (zero, full); the head lies past the x ramp, the ears inside
        # `keep` spheres (inner, outer radius) and the legs inside legFade
        # ((horizontal distance from the foot's axis), (height)), so they
        # keep their relief. `clip` takes the generator's tail glyph out of
        # the volume (it stood proud of the rump and would blur into a lump).
        'body': {'voxel': .006, 'sigma': .065, 'iso': .44, 'x': (.24, .12), 'y': (.15, .25),
                 'keep': (((.294, .585, .178), (.075, .12)), ((.294, .585, -.178), (.075, .12))),
                 'legFade': ((.06, .12), (.22, .32)),
                 'clip': (((-.073, .42), (.09, .115)), ((.03, .38), (.085, .075))), 'clipMargin': .002,
                 # x range of the rearward march that reads the rump off the volume.
                 'march': (-.30, -.58),
                 # The tail's root as a capsule in the body volume (see
                 # smooth_body): radius, length out along the rump normal
                 # and depth sunk into the rump, source units.
                 'boss': {'radius': .04, 'out': .02, 'sink': .03}},
        # Ears (fair_ears): Taubin fairing of the ear blades, weighted in by
        # |z|, height and an x window (zero, full); bound-holding tips pinned.
        'ears': {'z': (.095, .125), 'y': (.485, .515), 'x': ((.15, .19), (.40, .36)), 'iterations': 12,
                 'mobility': .9, 'pinFalloff': .03, 'offsetRelax': 25},
        # Legs (loft_legs): each leg's faces reaching below `cut` (front, hind) are
        # replaced by a lofted leg traced from the generator leg's own front
        # and side profiles, ring heights `rings`, `sides` round.
        'legs': {'cut': (.10, .12), 'reach': .1, 'sides': 12,
                 'rings': (0., .008, .018, .03, .042, .055, .068, .081, .094), 'topGap': .006,
                 # Profile features as fractional radius changes (height, half width, amount).
                 'sole': .82, 'flare': (.012, .011, .10), 'pinch': (.031, .008, .09),
                 'fetlock': (.045, .009, .06), 'hock': (.066, .012, .10), 'fade': .014,
                 'traceBlend': .02,
                 # Cloven trotter: a notch at the front of the hoof rings.
                 'cleft': {'depth': .38, 'width': .32, 'top': .03}},
        # Empty atlas squares (centre u, v; half side) for the new surfaces.
        'uvIslands': {'fill': ((.244, .729), .03), 'tail': ((.365, .732), .02),
                      'leg0': ((.055, .945), .05), 'leg1': ((.168, .824), .046),
                      'leg2': ((.285, .871), .04), 'leg3': ((.816, .957), .04)},
        'skin': {
            'roughness': .88, 'res': 1024, 'dilate': 10, 'feather': 8,
            # sRGB display targets mixed over the hide's median tone.
            'belly': ((226, 165, 160), .55), 'back': ((196, 116, 119), .35),
            'flush': ((200, 104, 114), .60), 'tail': (198, 110, 117),
            'shank': ((186, 116, 112), .30),
            # Trotter horn below the leg's hoof line, a soft gradient over
            # the heights (full, none).
            'hoof': ((84, 46, 40), (.02, .045)),
            # Face: eyes enlarged by `scale` about their own centre, with a
            # catchlight, a lid line over the top and a brow arc above; the
            # snout disc paler than its rim.
            'eye': {'scale': 1.25, 'colour': (34, 24, 26), 'roughness': .32, 'light': ((250, 246, 240), .0045),
                    'lid': ((132, 66, 74), .005), 'brow': ((172, 90, 100), .012, .45)},
            'snout': {'disc': (222, 136, 146), 'rim': (176, 88, 100)},
            # Value noise in source units, (period, amplitude) pairs. None:
            # the judge read round 4's grain as mottled sheen.
            'noise': (),
            # Below this source albedo channel maximum a texel is an eye or
            # nostril and keeps its own (glossier) roughness.
            'darkTexel': 70,
        },
        'tail': {
            'root': (0., .455),
            # The joint is the iso-curve of a blended union of rump and tube
            # (see _dock_profile): foot radius on the rump, rump falloff
            # (sigma) and tube falloff (blend), all source units.
            'dock': {'foot': .034, 'sigma': .011, 'blend': .008, 'rings': 5},
            'thickness': (.0215, .0135),
            'bend': .03,
            'loop': (.041, .029),
            'turns': 1.0,
            'tilt': 45.,
            'advance': .066,
            'clearance': .003,
            'sides': 10,
            'ringStep': .012,
        },
    },
}


def _weld(positions):
    size = float(np.ptp(positions, axis=0).max())
    _, first, inverse = np.unique(np.round(positions / (size * 1e-7)).astype('i8'),
                                  axis=0, return_index=True, return_inverse=True)
    return first, inverse.reshape(-1)


def _smooth_normals(p, faces):
    corners = p[faces]
    cross = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    face_norm = cross / np.maximum(np.linalg.norm(cross, axis=1), 1e-20)[:, None]
    summed = np.zeros((len(p), 3))
    for i in range(3):
        u = corners[:, (i + 1) % 3] - corners[:, i]
        v = corners[:, (i + 2) % 3] - corners[:, i]
        cosine = (u * v).sum(axis=1) / np.maximum(np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1), 1e-20)
        np.add.at(summed, faces[:, i], face_norm * np.arccos(np.clip(cosine, -1, 1))[:, None])
    return summed / np.maximum(np.linalg.norm(summed, axis=1), 1e-20)[:, None]


def _edges(faces):
    return np.unique(np.sort(np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]])), axis=1), axis=0)


def _relax(values, edges, held, iterations, step=.6):
    """Harmonic fill of `values` on a graph, `held` rows fixed."""
    deg = np.bincount(edges.ravel(), minlength=len(values))
    values = values.copy()
    for _ in range(iterations):
        total = np.zeros_like(values)
        np.add.at(total, edges[:, 0], values[edges[:, 1]])
        np.add.at(total, edges[:, 1], values[edges[:, 0]])
        values[~held] += step * (total / np.maximum(deg, 1)[:, None] - values)[~held]
    return values


def _dihedrals(p, faces, mask):
    """Angles between neighbouring face normals over edges inside mask."""
    cross = np.cross(p[faces[:, 1]] - p[faces[:, 0]], p[faces[:, 2]] - p[faces[:, 0]])
    n = cross / np.maximum(np.linalg.norm(cross, axis=1), 1e-20)[:, None]
    half = np.sort(np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]])), axis=1)
    owner = np.tile(np.arange(len(faces)), 3)
    order = np.lexsort((half[:, 1], half[:, 0]))
    half, owner = half[order], owner[order]
    pair = np.all(half[1:] == half[:-1], axis=1)
    a, b = owner[:-1][pair], owner[1:][pair]
    inside = mask[half[:-1][pair]].all(axis=1)
    angle = np.degrees(np.arccos(np.clip((n[a] * n[b]).sum(axis=1), -1, 1)))
    return angle[inside]


def _occupancy(P, F, lo, step, shape):
    """Inside/outside voxels of a closed mesh by crossing parity along x."""
    nx, ny, nz = shape
    tri = P[F]
    cols, xs = [], []
    for t in tri:
        (y0, y1), (z0, z1) = (t[:, 1].min(), t[:, 1].max()), (t[:, 2].min(), t[:, 2].max())
        j0, j1 = int(np.ceil((y0 - lo[1]) / step - .5)), int(np.floor((y1 - lo[1]) / step - .5))
        k0, k1 = int(np.ceil((z0 - lo[2]) / step - .5)), int(np.floor((z1 - lo[2]) / step - .5))
        if j1 < j0 or k1 < k0:
            continue
        J, K = np.meshgrid(np.arange(j0, j1 + 1), np.arange(k0, k1 + 1), indexing='ij')
        y, z = lo[1] + (J + .5) * step, lo[2] + (K + .5) * step
        a, b, c = t[:, 1:]
        det = (b[0] - c[0]) * (a[1] - c[1]) - (b[1] - c[1]) * (a[0] - c[0])
        if abs(det) < 1e-18:
            continue
        l1 = ((b[0] - c[0]) * (z - c[1]) - (b[1] - c[1]) * (y - c[0])) / det
        l2 = ((c[0] - a[0]) * (z - c[1]) - (c[1] - a[1]) * (y - c[0])) / det
        l3 = 1 - l1 - l2
        hit = (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
        if hit.any():
            cols.append(J[hit] * nz + K[hit])
            xs.append(l1[hit] * t[0, 0] + l2[hit] * t[1, 0] + l3[hit] * t[2, 0])
    cols, xs = np.concatenate(cols), np.concatenate(xs)
    first = np.clip(np.ceil((xs - lo[0]) / step - .5).astype(int), 0, nx)
    count = np.zeros((nx + 1, ny * nz), np.int32)
    np.add.at(count, (first, cols), 1)
    return (np.cumsum(count, axis=0)[:nx] % 2).reshape(nx, ny, nz).astype('f4')


def _blur3(volume, sigma):
    """Separable Gaussian blur (sigma in voxels) by FFT; the volume is padded."""
    out = volume
    for axis in range(3):
        n = out.shape[axis]
        k = np.fft.rfftfreq(n)
        shape = [1, 1, 1]
        shape[axis] = len(k)
        gain = np.exp(-2 * (np.pi * k * sigma) ** 2).reshape(shape)
        out = np.fft.irfft(np.fft.rfft(out, axis=axis) * gain, n=n, axis=axis)
    return out.astype('f4')


def _trilinear(volume, lo, step, q):
    g = (q - lo) / step - .5
    i = np.clip(np.floor(g).astype(int), 0, np.array(volume.shape[:3]) - 2)
    f = np.clip(g - i, 0, 1)
    out = 0.
    for corner in np.ndindex(2, 2, 2):
        w = np.prod([f[:, k] if corner[k] else 1 - f[:, k] for k in range(3)], axis=0)
        out = out + (w[:, None] if volume.ndim == 4 else w) * volume[i[:, 0] + corner[0], i[:, 1] + corner[1], i[:, 2] + corner[2]]
    return out


def _rump_coeff(P, spec):
    """Quadratic height field x(y, z) of the clean rump round the rebuilt region."""
    (cz, cy), (az, ay) = spec['region']
    region = ((P[:, 2] - cz) / az) ** 2 + ((P[:, 1] - cy) / ay) ** 2
    ring = (P[:, 0] < spec['rearX']) & (region < spec['fitScale'] ** 2)
    for (rz, ry), (sz, sy) in spec['relief']:
        ring &= ((P[:, 2] - rz) / sz) ** 2 + ((P[:, 1] - ry) / sy) ** 2 > 1.15 ** 2
    basis = lambda y, z: np.stack([np.ones_like(y), y, z, y * y, y * z, z * z], axis=-1)
    coeff, *_ = np.linalg.lstsq(basis(P[ring, 1], P[ring, 2]), P[ring, 0], rcond=None)
    return coeff, basis


def smooth_body(P, F, spec, rump):
    """Rebuild the torso as the level set of a blurred body volume.

    Rounds 3 and 4 Taubin-faired the generator's surface, which moves each
    vertex toward its neighbours and so keeps the broad planes and the
    creases where they meet: the hindquarters still read as a faceted box.
    Here the torso's shape is defined by a volume instead of by its
    triangles: the closed mesh is voxelised, the generator's tail glyph is
    clipped off the rump, the occupancy is blurred with a Gaussian (sigma in
    source units), and each torso vertex is carried along the field's
    gradient onto the blurred iso-surface. Corners round with a radius set by
    sigma, flats stay put, and the field's gradient gives every torso vertex
    a smooth normal regardless of how the generator triangulated it. Head,
    ears and legs are weighted out; the bounds are held by ears, snout and
    tail, none of which move. Returns positions, weights and field normals."""
    step, sigma, iso = spec['voxel'], spec['sigma'], spec['iso']
    pad = 4 * sigma + 2 * step
    lo = P.min(axis=0) - pad + step * np.array([.2371, .3119, .4127])  # off-lattice
    shape = tuple(int(np.ceil(s)) for s in (P.max(axis=0) + pad - lo) / step)
    occ = _occupancy(P, F, lo, step, shape)
    coeff, basis = rump
    gx, gy, gz = [lo[k] + (np.arange(shape[k]) + .5) * step for k in range(3)]
    Y, Z = np.meshgrid(gy, gz, indexing='ij')
    surface = basis(Y, Z) @ coeff
    for (rz, ry), (sz, sy) in spec['clip']:
        cols = ((Z - rz) / sz) ** 2 + ((Y - ry) / sy) ** 2 < 1
        behind = gx[:, None, None] < surface[None] - spec['clipMargin']
        occ[behind & cols[None]] = 0
    boss = spec.get('boss')
    if boss:
        # Round 6: the tail's root is put into the body volume as a capsule
        # along the rump normal, so the same Gaussian that rounds the torso
        # raises a broad boss there and the rump rises to meet the tail
        # instead of meeting it in a tight concave ring.
        bz, by = spec['tailRoot']
        bx = float(basis(np.array(by), np.array(bz)) @ coeff)
        nb = np.array([-1., coeff[1] + 2 * coeff[3] * by + coeff[4] * bz, 0.])
        nb /= np.linalg.norm(nb)
        a = np.array([bx, by, bz]) - boss['sink'] * nb
        b = np.array([bx, by, bz]) + boss['out'] * nb
        reach = boss['radius'] + step
        i0 = np.maximum(np.floor((np.minimum(a, b) - reach - lo) / step).astype(int), 0)
        i1 = np.minimum(np.ceil((np.maximum(a, b) + reach - lo) / step).astype(int), np.array(shape))
        sub = np.stack(np.meshgrid(*[lo[k] + (np.arange(i0[k], i1[k]) + .5) * step for k in range(3)], indexing='ij'), axis=-1)
        t = np.clip(((sub - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
        dist = np.linalg.norm(sub - (a + t[..., None] * (b - a)), axis=-1)
        block = occ[i0[0]:i1[0], i0[1]:i1[1], i0[2]:i1[2]]
        block[dist < boss['radius']] = 1
    field = _blur3(occ, sigma / step)
    grad = np.stack(np.gradient(field, step), axis=-1)
    # Weights: torso behind the head, above the legs; ears kept.
    ramp = lambda v, a, b: _smoothstep(a, b, v)
    (x0, x1), (y0, y1) = spec['x'], spec['y']
    w = ramp(P[:, 0], x0, x1) * ramp(P[:, 1], y0, y1)
    for centre, (inner, outer) in spec.get('keep', ()):
        w *= ramp(np.linalg.norm(P - np.array(centre), axis=1), inner, outer)
    feet = P[:, 1] < .03
    (d0, d1), (h0, h1) = spec['legFade']
    for sx in (1, -1):
        for sz in (1, -1):
            foot = feet & (np.sign(P[:, 0]) == sx) & (np.sign(P[:, 2]) == sz)
            c = P[foot][:, [0, 2]].mean(axis=0)
            d = np.hypot(P[:, 0] - c[0], P[:, 2] - c[1])
            w *= np.maximum(ramp(d, d0, d1), ramp(P[:, 1], h0, h1))
    q = P.copy()
    for _ in range(12):
        f = _trilinear(field, lo, step, q)
        g = _trilinear(grad, lo, step, q)
        delta = ((f - iso) / np.maximum((g * g).sum(axis=1), 1e-9))[:, None] * g
        length = np.linalg.norm(delta, axis=1)
        q -= delta * np.minimum(1, 2 * step / np.maximum(length, 1e-12))[:, None]
    residual = np.abs(_trilinear(field, lo, step, q) - iso)
    w[residual > .02] = 0  # a vertex the field cannot place stays where it was
    original = P.copy()
    p = P + w[:, None] * (q - P)
    old_cross = np.cross(original[F[:, 1]] - original[F[:, 0]], original[F[:, 2]] - original[F[:, 0]])
    for attempt in range(24):
        new_cross = np.cross(p[F[:, 1]] - p[F[:, 0]], p[F[:, 2]] - p[F[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        moved = np.unique(F[flipped])
        p[moved] = original[moved] + (.5 if attempt < 23 else 0) * (p[moved] - original[moved])
    g = _trilinear(grad, lo, step, p)
    normal = -g / np.maximum(np.linalg.norm(g, axis=1), 1e-12)[:, None]

    def rear_x(y, z):
        """x of the body surface seen from behind at (y, z): the last
        crossing of the iso-surface marching rearward from inside."""
        y, z = np.broadcast_arrays(np.asarray(y, 'f8'), np.asarray(z, 'f8'))
        flat_y, flat_z = y.ravel(), z.ravel()
        xs = np.arange(spec['march'][0], spec['march'][1], -step / 2)
        q = np.stack(np.broadcast_arrays(xs[None, :], flat_y[:, None], flat_z[:, None]), axis=-1)
        f = _trilinear(field, lo, step, q.reshape(-1, 3)).reshape(len(flat_y), len(xs))
        inside = f > iso
        assert inside[:, 0].all(), 'rear surface march starts outside the body'
        k = np.argmin(inside, axis=1)  # first sample outside
        assert (~inside[np.arange(len(k)), k]).all(), 'rear surface march never leaves the body'
        a, b = xs[k - 1], xs[k]
        for _ in range(30):
            m = .5 * (a + b)
            fm = _trilinear(field, lo, step, np.stack([m, flat_y, flat_z], axis=1))
            a, b = np.where(fm > iso, m, a), np.where(fm > iso, b, m)
        return (.5 * (a + b)).reshape(y.shape)

    def rear_normal(y, z):
        q = np.array([[float(rear_x(y, z)), y, z]])
        g = _trilinear(grad, lo, step, q)[0]
        return -g / np.linalg.norm(g)

    return p, w, normal, (rear_x, rear_normal)


def _bump(v, centre, width):
    return np.exp(-((np.asarray(v, 'f8') - centre) / width) ** 2)


def fair_ears(P, F, spec):
    """Taubin fairing of the ear blades, which no earlier pass moved.

    The generic fairing gives the ears zero mobility (they are thin, so read
    as high curvature) and the body volume keeps them out, so they still
    carried the generator's coarse, irregular triangulation: flat planes
    meeting at creases. Here they are faired with their own weight (|z|,
    height and an x window, each ramped), the vertices that hold a bound
    pinned, and any face that would invert has its vertices' moves halved."""
    (z0, z1), (y0, y1), ((xa0, xa1), (xb0, xb1)) = spec['z'], spec['y'], spec['x']
    P0 = P
    w = spec['mobility'] * _smoothstep(z0, z1, np.abs(P[:, 2])) * _smoothstep(y0, y1, P[:, 1]) \
        * _smoothstep(xa0, xa1, P[:, 0]) * _smoothstep(xb0, xb1, P[:, 0])
    lo, hi = P.min(axis=0), P.max(axis=0)
    pins = np.flatnonzero(np.any((P - lo < .002) | (hi - P < .002), axis=1) & (w > 0))
    if len(pins):
        # Bound-holding tips stay put, with a soft falloff round them.
        w *= _smoothstep(0, spec['pinFalloff'], np.linalg.norm(P[:, None] - P[pins][None], axis=-1).min(axis=1))
    edges = _edges(F)
    deg = np.bincount(edges.ravel(), minlength=len(P))
    # The blade's mid-surface is replaced by a quadric fitted to it in the
    # ear's own frame (long, wide, thin from its principal axes), so the
    # generator's fold down the blade becomes one smooth cup; each vertex's
    # thickness offset from that mid-surface is kept but relaxed over the
    # blade. Vertices move along the thin axis only, so the outline seen
    # face-on stays the generator's.
    for side in (1, -1):
        core = (w > .5) & (np.sign(P[:, 2]) == side)
        blade = (w > 0) & (np.sign(P[:, 2]) == side)
        centre = P[core].mean(axis=0)
        frame = np.linalg.svd(P[core] - centre)[2]
        loc = (P - centre) @ frame.T
        quad = lambda a, b: np.stack([np.ones_like(a), a, b, a * a, a * b, b * b], axis=-1)
        coeff = np.linalg.lstsq(quad(loc[core, 0], loc[core, 1]), loc[core, 2], rcond=None)[0]
        mid = quad(loc[:, 0], loc[:, 1]) @ coeff
        offset = (loc[:, 2] - mid)[:, None]
        relaxed = _relax(offset, edges, ~blade, spec['offsetRelax'])[:, 0]
        target = mid + relaxed
        P = P + (w * blade * (target - loc[:, 2]))[:, None] * frame[2]
    def laplace(q):
        total = np.zeros_like(q)
        np.add.at(total, edges[:, 0], q[edges[:, 1]])
        np.add.at(total, edges[:, 1], q[edges[:, 0]])
        return total / np.maximum(1, deg)[:, None] - q
    p = P.copy()
    for _ in range(spec['iterations']):
        p += .5 * w[:, None] * laplace(p)
        p -= .53 * w[:, None] * laplace(p)
    # Inside the envelope: a move that would carry a vertex past a bound is
    # shortened to end on it.
    d = p - P0
    f = np.ones(len(p))
    for k in range(3):
        for out in (p[:, k] > hi[k], p[:, k] < lo[k]):
            edge = np.where(d[out, k] > 0, hi[k], lo[k])
            f[out] = np.minimum(f[out], (edge - P0[out, k]) / d[out, k])
    p = P0 + np.clip(f, 0, 1)[:, None] * d
    old_cross = np.cross(P0[F[:, 1]] - P0[F[:, 0]], P0[F[:, 2]] - P0[F[:, 0]])
    for attempt in range(24):
        new_cross = np.cross(p[F[:, 1]] - p[F[:, 0]], p[F[:, 2]] - p[F[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        moved = np.unique(F[flipped])
        p[moved] = P0[moved] + (.5 if attempt < 23 else 0) * (p[moved] - P0[moved])
    assert np.allclose(p.min(axis=0), lo) and np.allclose(p.max(axis=0), hi), ('ear fairing moved a bound', p.min(axis=0) - lo, p.max(axis=0) - hi)
    return p, w


def _slice_points(W, tris, h):
    """Points of a mesh's section by the plane y = h."""
    a = W[tris]
    pts = []
    for i in range(3):
        p, q = a[:, i], a[:, (i + 1) % 3]
        cross = (p[:, 1] - h) * (q[:, 1] - h) < 0
        t = (h - p[cross, 1]) / (q[cross, 1] - p[cross, 1])
        pts.append(p[cross] + t[:, None] * (q[cross] - p[cross]))
    pts = np.vstack(pts)
    assert len(pts) >= 6, f'leg section at y {h:.3f} is empty'
    return pts


def _slice_extents(W, tris, h):
    """Extents in x and z of a mesh's section by the plane y = h."""
    pts = _slice_points(W, tris, h)
    return pts[:, 0].min(), pts[:, 0].max(), pts[:, 2].min(), pts[:, 2].max()


def _flip_folds(pos, tris, passes=8):
    """Flip any interior edge whose two triangles fold back over each other
    (normals more than 90 degrees apart) when the flip leaves them flatter."""
    tris = tris.copy()
    def unit(t):
        c = np.cross(pos[t[1]] - pos[t[0]], pos[t[2]] - pos[t[0]])
        return c / max(np.linalg.norm(c), 1e-30)
    flips = 0
    for _ in range(passes):
        edge = {}
        for fi, t in enumerate(tris.tolist()):
            for k in range(3):
                edge[(t[k], t[(k + 1) % 3])] = fi
        touched = set()
        for (a, b), f1 in list(edge.items()):
            f2 = edge.get((b, a))
            if f2 is None or f1 in touched or f2 in touched:
                continue
            c = next(v for v in tris[f1] if v not in (a, b))
            d = next(v for v in tris[f2] if v not in (a, b))
            before = unit(tris[f1]) @ unit(tris[f2])
            if before > 0 or (c, d) in edge or (d, c) in edge:
                continue
            n1, n2 = (c, a, d), (d, b, c)
            if unit(n1) @ unit(n2) > before:
                tris[f1], tris[f2] = n1, n2
                touched |= {f1, f2}
                flips += 1
        if not touched:
            break
    return tris, flips


def loft_legs(arr, faces, spec, n_joints, ground, islands):
    """Replace each leg below a cut with a lofted leg (strike rule, round 6).

    Rounds 4 and 5 scaled the generator's leg vertices radially about the
    leg's axis, which keeps its coarse tube: a hock, pinch or flare narrower
    than its 2.5 cm rings is not there to move. Here every face of a leg
    below `cut` is deleted and the leg is lofted afresh: its section is an
    ellipse whose centre and semi-axes are traced from the deleted leg's own
    front and side profiles (sliced at a column of heights and fitted), on
    which the profile is then modelled - a rounded sole, a trotter flare, a
    pastern pinch, a fetlock and, on the hind legs, a hock at the back - and
    the hoof rings carry a notch at the front so the trotter is cloven. A
    transition ring, blended toward the cut's edge, and a zipper join it to
    the retained leg. Each leg has its own polar UV island (painted from 3D
    position by the bake) and starts with a copy of the cut's edge that
    keeps that edge's skin, so the join cannot open in stride; the rest
    takes an inverse-distance blend of the deleted leg's skin."""
    pos = arr['POSITION'].astype('f8')
    first, inverse = _weld(pos)
    W, WF = pos[first], inverse[faces]
    rep = np.zeros(len(W), int)
    rep[inverse] = np.arange(len(pos))
    joints, weights = arr['JOINTS_0'], arr['WEIGHTS_0'].astype('f8')
    def dense(rows):
        out = np.zeros((len(rows), n_joints))
        for c in range(4):
            np.add.at(out, (np.arange(len(rows)), joints[rows, c].astype('i8')), weights[rows, c])
        return out
    S = spec['sides']
    drop = np.zeros(len(faces), bool)
    legs = []
    for sx in (1, -1):
        for sz in (1, -1):
            foot = (W[:, 1] < .03) & (np.sign(W[:, 0]) == sx) & (np.sign(W[:, 2]) == sz)
            assert foot.sum() >= 8, 'leg foot not found'
            c = W[foot][:, [0, 2]].mean(axis=0)
            cut = spec['cut'][0 if sx > 0 else 1]
            # Every face with a vertex below the cut goes, so the cut's edge
            # is the lower edge of the retained faces and stays above the cut.
            column = np.hypot(W[:, 0] - c[0], W[:, 2] - c[1]) < spec['reach']
            mine = (column & (W[:, 1] < cut))[WF].any(axis=1) & column[WF].all(axis=1)
            assert not (drop & mine).any()
            drop |= mine
            legs.append({'hind': sx < 0, 'c': c, 'tris': WF[mine], 'verts': np.unique(WF[mine])})
    kept = WF[~drop]
    directed = kept[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    present = set(map(tuple, directed.tolist()))
    border = [(a, b) for a, b in directed.tolist() if (b, a) not in present]
    following = dict(border)
    assert len(following) == len(border), 'leg cut edge is not a simple loop'
    cycles, seen = [], set()
    for a, _ in border:
        if a in seen:
            continue
        loop = [a]
        seen.add(a)
        while following[loop[-1]] != a:
            loop.append(following[loop[-1]])
            seen.add(loop[-1])
        cycles.append(np.array(loop))
    assert len(cycles) == 4, f'{len(cycles)} cut loops for four legs'
    for leg in legs:
        leg['loop'] = min(cycles, key=lambda l: np.linalg.norm(W[l][:, [0, 2]].mean(axis=0) - leg['c']))
    assert len({id(leg['loop']) for leg in legs}) == 4, 'two legs share a cut loop'
    island_list = [islands[f'leg{k}'] for k in range(4)]
    new_pos, new_uv, new_skin, new_faces = [], [], [], []
    base_index = len(pos)
    report = []
    bump = lambda y, f: f[2] * _bump(y, f[0], f[1])
    for k, leg in enumerate(legs):
        loop = leg['loop']
        L = W[loop]
        top = float(L[:, 1].min()) - spec['topGap']
        # Trace: slice the deleted leg at a column of heights; the section's
        # centre and semi-axes are fitted as smooth functions of height.
        hs = np.linspace(.006, top, 9)
        ext = np.array([_slice_extents(W, leg['tris'], h) for h in hs])
        cx = np.polyfit(hs, .5 * (ext[:, 0] + ext[:, 1]), 1)
        cz = np.polyfit(hs, .5 * (ext[:, 2] + ext[:, 3]), 1)
        ax = np.polyfit(hs, .5 * (ext[:, 1] - ext[:, 0]), 2)
        az = np.polyfit(hs, .5 * (ext[:, 3] - ext[:, 2]), 2)
        heights = np.array([h for h in spec['rings'] if h < top - .004] + [top])
        # The cut's edge is measured round its own centroid (the traced axis,
        # extrapolated up into the belly, skews it), the rings round their
        # traced centres, so the zipper pairs points facing the same way.
        ang_l = np.arctan2(L[:, 2] - L[:, 2].mean(), L[:, 0] - L[:, 0].mean())
        turn = np.angle(np.exp(1j * np.diff(np.r_[ang_l, ang_l[0]])))
        sense = np.sign(turn.sum())
        assert abs(abs(turn.sum()) - 2 * np.pi) < 1e-6 and (np.sign(turn) == sense).all(), 'leg cut loop is not star-shaped'
        theta = ang_l[0] + sense * 2 * np.pi * (np.arange(S) + .5) / S
        def section(y, th):
            # Features fade out toward the top ring, so the loft meets the
            # traced section (and through it the retained leg) without a lump.
            fade = _smoothstep(top, top - spec['fade'], y)
            m = 1 + fade * (bump(y, spec['flare']) - bump(y, spec['pinch']) + bump(y, spec['fetlock']))
            m = m * np.ones_like(th)
            if leg['hind']:
                m = m + fade * bump(y, spec['hock']) * np.clip(-np.cos(th), 0, 1) ** 2
            cl = spec['cleft']
            front = np.exp(-(np.angle(np.exp(1j * th)) / cl['width']) ** 2)
            m = m * (1 - cl['depth'] * front * _smoothstep(cl['top'], cl['top'] - .012, y))
            if y <= 0:
                m = m * spec['sole']
            # Base section in polar form about the traced centre: the fitted
            # ellipse low down, the deleted leg's own section (its polar
            # radius read off the slice) toward the top, so the loft meets
            # the retained leg on the leg's real section.
            ox, oz = np.polyval(cx, y), np.polyval(cz, y)
            rho = 1 / np.sqrt((np.cos(th) / np.polyval(ax, y)) ** 2 + (np.sin(th) / np.polyval(az, y)) ** 2)
            w_t = _smoothstep(top - spec['traceBlend'], top, y)
            if w_t > 0:
                q = _slice_points(W, leg['tris'], min(y, top))
                a_q = np.arctan2(q[:, 2] - oz, q[:, 0] - ox)
                rho = (1 - w_t) * rho + w_t * np.interp(th, a_q, np.hypot(q[:, 0] - ox, q[:, 2] - oz), period=2 * np.pi)
            x = ox + rho * m * np.cos(th)
            z = oz + rho * m * np.sin(th)
            return np.stack([x, np.full_like(th, max(y, ground)), z], axis=1)
        rings = [section(h, theta) for h in heights]
        n_r = len(rings)
        n_b = len(loop)
        # Transition ring: one vertex under each vertex of the cut's edge,
        # halfway to the top ring in the direction that edge vertex faces,
        # so the cut's zigzag is taken up by a quad strip of varying height
        # (a fan from an S-ring onto the zigzag folded where it dipped); the
        # zipper then joins two smooth rings.
        trans = .5 * (L + section(top, ang_l + 0.))
        centre = np.array([np.polyval(cx, 0.), ground, np.polyval(cz, 0.)])
        # Local indices: collar (copy of the cut edge), transition ring,
        # lathe rings bottom to top, sole centre.
        collar = np.arange(n_b)
        mid = n_b + np.arange(n_b)
        ring_idx = [2 * n_b + j * S + np.arange(S) for j in range(n_r)]
        sole = 2 * n_b + n_r * S
        local = np.vstack([L, trans, np.vstack(rings), centre[None]])
        frac = lambda a: ((sense * (a - ang_l[0])) % (2 * np.pi)) / (2 * np.pi)
        tris = []
        def flatness(t1_, t2_):
            n1 = np.cross(local[t1_[1]] - local[t1_[0]], local[t1_[2]] - local[t1_[0]])
            n2 = np.cross(local[t2_[1]] - local[t2_[0]], local[t2_[2]] - local[t2_[0]])
            return n1 @ n2 / max(np.linalg.norm(n1) * np.linalg.norm(n2), 1e-30)
        for j in range(n_b):
            o0, o1, t0, t1 = collar[j], collar[(j + 1) % n_b], mid[j], mid[(j + 1) % n_b]
            # Each quad of the strip is split along whichever diagonal
            # leaves its two triangles flatter, so none folds over.
            a_ = [(o1, o0, t0), (o1, t0, t1)]
            b_ = [(o1, o0, t1), (o0, t0, t1)]
            tris += a_ if flatness(*a_) >= flatness(*b_) else b_
        tris += _zipper(mid, frac(ang_l), ring_idx[-1], frac(theta))
        nz = len(tris)
        for j in range(n_r - 1):
            lo_r, up_r = ring_idx[j], ring_idx[j + 1]
            for i in range(S):
                a, b = lo_r[i], lo_r[(i + 1) % S]
                c_, d = up_r[i], up_r[(i + 1) % S]
                tris += [(a, b, c_), (b, d, c_)]
        bands = len(tris)
        for i in range(S):
            tris.append((sole, ring_idx[0][(i + 1) % S], ring_idx[0][i]))
        tris = np.array(tris)
        # The strip and zipper follow the retained surface's winding; the
        # lathe bands and sole are turned to match it if they were built the
        # other way (the welded winding check below proves the result).
        cross = np.cross(local[tris[:, 1]] - local[tris[:, 0]], local[tris[:, 2]] - local[tris[:, 0]])
        axis_pt = np.stack([np.polyval(cx, local[:, 1]), local[:, 1], np.polyval(cz, local[:, 1])], axis=1)
        outward = (local - axis_pt)[tris].mean(axis=1)
        zip_out = (cross[:nz] * outward[:nz]).sum(axis=1).mean()
        band_out = (cross[nz:bands] * outward[nz:bands]).sum(axis=1).mean()
        assert zip_out > 0, 'leg collar strip faces inward'
        if band_out < 0:
            tris[nz:] = tris[nz:, [0, 2, 1]]
        cross = np.cross(local[tris[:, 1]] - local[tris[:, 0]], local[tris[:, 2]] - local[tris[:, 0]])
        assert (cross[bands:, 1] < 0).all(), 'leg sole faces up'
        tris, flips = _flip_folds(local, tris)
        # Each transition vertex stays strictly under its own edge vertex
        # (no relaxation: averaging with higher neighbours lifted it over a
        # low edge vertex and folded the strip).
        assert (local[mid, 1] < local[collar, 1]).all() and (local[mid, 1] > top).all(), 'transition ring out of order'
        # UVs: a polar island, angle round the leg and radius by height.
        (cu, cv), half = island_list[k]
        rho_top = max(float(L[:, 1].max()), 1e-6)
        ang = np.r_[ang_l, ang_l, np.tile(theta, n_r), 0.]
        rho = .12 + .88 * np.clip(local[:, 1] / rho_top, 0, 1)
        rho[-1] = 0.
        uv = np.stack([cu + .9 * half * rho * np.cos(ang), cv + .9 * half * rho * np.sin(ang)], axis=1)
        # Skin: the collar keeps its edge vertices' own skin; the loft blends
        # the deleted leg's skin by inverse distance (nearest four).
        donors = np.r_[leg['verts'], loop]
        donor_skin = dense(rep[donors])
        d = np.linalg.norm(local[n_b:, None] - W[donors][None], axis=-1)
        near4 = np.argsort(d, axis=1)[:, :4]
        wgt = 1 / np.maximum(np.take_along_axis(d, near4, axis=1), 1e-5) ** 2
        loft_skin = (donor_skin[near4] * wgt[..., None]).sum(axis=1) / wgt.sum(axis=1)[:, None]
        skin = np.vstack([dense(rep[loop]), loft_skin])
        offset = base_index + sum(len(p) for p in new_pos)
        new_pos.append(local)
        new_uv.append(uv)
        new_skin.append(skin)
        new_faces.append(tris + offset)
        report.append({'hind': leg['hind'], 'removedTriangles': int(len(leg['tris'])), 'loftTriangles': int(len(tris)),
                       'rings': int(n_r), 'cutLoop': int(n_b), 'top': round(top, 4), 'foldFlips': flips,
                       'tracedSemiAxesAtGround': [round(float(np.polyval(ax, 0.)), 4), round(float(np.polyval(az, 0.)), 4)]})
    # Assemble: drop the legs' faces, append the lofts, compact.
    skin = np.vstack(new_skin)
    top4 = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top4, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top4[top_w == 0] = 0
    added = np.vstack(new_pos)
    out = {
        'POSITION': np.vstack([pos, added]),
        'NORMAL': np.vstack([arr['NORMAL'].astype('f8'), np.zeros((len(added), 3))]),
        'TEXCOORD_0': np.vstack([arr['TEXCOORD_0'].astype('f8'), np.vstack(new_uv)]),
        'JOINTS_0': np.vstack([joints, top4]).astype(joints.dtype),
        'WEIGHTS_0': np.vstack([arr['WEIGHTS_0'], top_w]).astype(arr['WEIGHTS_0'].dtype),
    }
    extra = {k: np.r_[v, np.zeros(len(added))] for k, v in arr.items() if k not in out}
    all_faces = np.vstack([faces[~drop], np.vstack(new_faces)])
    used = np.unique(all_faces)
    remap = np.full(len(out['POSITION']), -1)
    remap[used] = np.arange(len(used))
    out = {k: v[used] for k, v in {**out, **extra}.items()}
    all_faces = remap[all_faces]
    # Normals over the welded result: every loft vertex and the cut edge
    # (retained vertices and their collar copies share one normal). The
    # retained leg above keeps its own: smoothing it across the generator's
    # folds at the belly turned faces against their vertex normals.
    w_first, w_inverse = _weld(out['POSITION'])
    smooth = _smooth_normals(out['POSITION'][w_first], w_inverse[all_faces])[w_inverse]
    is_new = used >= base_index
    on_edge = np.isin(w_inverse, np.unique(w_inverse[is_new]))
    out['NORMAL'][on_edge] = smooth[on_edge]
    retained = np.flatnonzero(~is_new)
    return out, all_faces, used[retained], report


def _tail_centreline(spec, p0, n0, stalk, side):
    """The tail's centre line, traced as a side profile and then turned.

    In the sagittal plane through the root (b backward, u up), the heading
    starts along the rump normal: a straight run (the dock, then the
    stalk), a bend of radius `bend` up to vertical, then a loop that turns
    forward over the top and back under, its radius shrinking from loop[0]
    to loop[1]. From the start of the loop the curve is turned `tilt`
    degrees about the vertical through the loop's start and advances
    sideways, so the turns pass beside one another."""
    psi0 = np.arctan2(n0[1], -n0[0])
    straight = _dock_profile(spec['dock'], spec['thickness'][0])[0][-1] + stalk
    s_line = np.linspace(0, straight, 40)
    pts = [np.stack([s_line * np.cos(psi0), s_line * np.sin(psi0)], axis=1)]
    def arc(start, psi_a, psi_b, radius_of, n):
        psi = np.linspace(psi_a, psi_b, n)
        rad = radius_of(np.linspace(0, 1, n))
        step = np.diff(psi) * .5 * (rad[1:] + rad[:-1])
        d = np.stack([np.cos(.5 * (psi[1:] + psi[:-1])), np.sin(.5 * (psi[1:] + psi[:-1]))], axis=1) * step[:, None]
        return start + np.vstack([np.zeros(2), np.cumsum(d, axis=0)])
    bend = arc(pts[-1][-1], psi0, np.pi / 2, lambda t: np.full_like(t, spec['bend']), 60)
    r_a, r_b = spec['loop']
    loop = arc(bend[-1], np.pi / 2, np.pi / 2 + 2 * np.pi * spec['turns'], lambda t: r_a + (r_b - r_a) * t, 400)
    plane = np.vstack([pts[0], bend[1:], loop[1:]])
    n_pre = len(pts[0]) + len(bend) - 1
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(plane, axis=0), axis=1))]
    line = np.stack([p0[0] - plane[:, 0], p0[1] + plane[:, 1], np.full(len(plane), p0[2])], axis=1)
    # Turn and advance the loop: ramp both in over the bend.
    s_bend0, s_loop0 = seg[len(pts[0]) - 1], seg[n_pre - 1]
    ramp = np.clip((seg - s_bend0) / max(s_loop0 - s_bend0, 1e-9), 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    pivot = line[n_pre - 1].copy()
    angle = side * np.radians(spec['tilt']) * ramp
    dx, dz = line[:, 0] - pivot[0], line[:, 2] - pivot[2]
    line[:, 0] = pivot[0] + dx * np.cos(angle) - dz * np.sin(angle)
    line[:, 2] = pivot[2] + dx * np.sin(angle) + dz * np.cos(angle)
    progress = np.clip((seg - s_loop0) / (seg[-1] - s_loop0), 0, 1)
    line[:, 2] += side * spec['advance'] * progress
    return line, seg


def _dock_profile(dock, r0):
    """Ring stations (distance along the tail, radius) of the tail's joint.

    Rounds 1-4 ended the tube in a flare or a quarter-circle fillet one
    centimetre wide, whose concave ring the clay pass's cavity shading drew
    as a pinched crease. The joint is now modelled as an implicit blend: the
    rump as a half-space whose occupancy falls off as a logistic of height s
    (width `sigma`), the tube as a field 0.5 exp(-(d - r0) / blend) of the
    distance d from its axis. Their sum's 0.5 iso-curve is
        d(s) = r0 - blend * ln(tanh(s / (2 sigma))),
    which is tangent to the rump at its foot and to the tube at its top, so
    the turn is spread over the whole dock. Stations are spaced evenly in
    arc length along that curve, from the foot radius to within 0.3 mm of
    the tube."""
    sigma, blend = dock['sigma'], dock['blend']
    s_of = lambda d: 2 * sigma * np.arctanh(np.exp(-(d - r0) / blend))
    fine = np.linspace(s_of(dock['foot']), s_of(r0 + 3e-4), 4000)
    radius = r0 - blend * np.log(np.tanh(fine / (2 * sigma)))
    arc = np.r_[0, np.cumsum(np.hypot(np.diff(fine), np.diff(radius)))]
    s = np.interp(np.linspace(0, arc[-1], dock['rings'] + 1), arc, fine)
    radius = r0 - blend * np.log(np.tanh(s / (2 * sigma)))
    s[0] = 0.  # the foot ring is set on the rump itself (0.3 mm below the curve's start)
    return s, radius


def _tail(spec, rump_x, rump_n, target_x, hand=1., stalk=None):
    """Tail surface grown from the rump: rings (first on the rump), tip, tris."""
    z0, y0 = spec['root']
    p0 = np.array([float(rump_x(y0, z0)), y0, z0])
    n0 = rump_n(y0, z0)
    n0 = np.array([n0[0], n0[1], 0.]) / np.linalg.norm(n0[:2])
    thick0, thick1 = spec['thickness']
    s_fil, r_fil = _dock_profile(spec['dock'], thick0)
    dock_end = s_fil[-1]
    sides = spec['sides']
    theta = hand * 2 * np.pi * np.arange(sides) / sides
    def build(stalk):
        line, seg = _tail_centreline(spec, p0, n0, stalk, spec.get('side', 1.))
        # Ring stations: the blended dock (foot tangent to the rump, top
        # tangent to the tube), then even steps to the end.
        n_tube = max(2, int(np.ceil((seg[-1] - dock_end) / spec['ringStep'])))
        s_tube = np.linspace(dock_end, seg[-1], n_tube + 1)[1:]
        s_all = np.r_[s_fil, s_tube]
        radius = np.r_[r_fil, r_fil[-1] + (thick1 - r_fil[-1]) * (s_tube - dock_end) / (seg[-1] - dock_end)]
        centre = np.stack([np.interp(s_all, seg, line[:, k]) for k in range(3)], axis=1)
        tangent = np.stack([np.interp(s_all, seg, np.gradient(line[:, k], seg)) for k in range(3)], axis=1)
        tangent /= np.linalg.norm(tangent, axis=1)[:, None]
        # A rounded cap past the last station.
        end, end_t = centre[-1].copy(), tangent[-1].copy()
        for a in np.radians((35., 65.)):
            centre = np.vstack([centre, end + thick1 * np.sin(a) * end_t])
            tangent = np.vstack([tangent, tangent[-1]])
            radius = np.r_[radius, thick1 * np.cos(a)]
            s_all = np.r_[s_all, seg[-1] + thick1 * np.sin(a)]
        normal = np.cross(tangent[0], [0., 0., 1.])
        normal /= np.linalg.norm(normal)
        pos, param, ring_s = [], [], []
        for k in range(len(centre)):  # parallel transport
            normal = normal - tangent[k] * (normal @ tangent[k])
            normal /= np.linalg.norm(normal)
            binormal = np.cross(tangent[k], normal)
            pos.append(centre[k] + radius[k] * (np.outer(np.cos(theta), normal) + np.outer(np.sin(theta), binormal)))
            param.append(np.stack([np.full(sides, s_all[k] / s_all[-1]), (theta / (2 * np.pi)) % 1], axis=1))
            ring_s.append(np.full(sides, s_all[k]))
        tip = seg[-1] + thick1
        pos.append((end + thick1 * end_t)[None]); param.append([[1., .5]]); ring_s.append([tip])
        return (np.vstack(pos), np.vstack(param), np.concatenate(ring_s), centre, radius, s_all)
    # The stalk's length is solved so the tail's rearmost point lands on the
    # source's length extreme: the envelope is kept without stretching.
    if stalk is None:
        lo_s, hi_s = 0., .08
        assert build(lo_s)[0][:, 0].min() > target_x, 'tail reaches past the length extreme with no stalk'
        assert build(hi_s)[0][:, 0].min() < target_x, 'tail cannot reach the length extreme'
        for _ in range(48):
            mid = .5 * (lo_s + hi_s)
            lo_s, hi_s = (mid, hi_s) if build(mid)[0][:, 0].min() > target_x else (lo_s, mid)
        stalk = hi_s
    pos, param, ring_s, centre, radius, s_all = build(stalk)
    rings = (len(pos) - 1) // sides
    tris = []
    for k in range(rings - 1):
        for j in range(sides):
            a, b = k * sides + j, k * sides + (j + 1) % sides
            tris += [(a, a + sides, b), (b, a + sides, b + sides)]
    for j in range(sides):
        tris.append(((rings - 1) * sides + j, rings * sides, (rings - 1) * sides + (j + 1) % sides))
    tris = np.array(tris)
    outward = (pos[:-1].reshape(rings, sides, 3) - centre[:, None, :]).reshape(-1, 3)
    outward = np.vstack([outward, pos[-1:] - centre[-1:]])
    cross = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    if (cross * outward[tris].mean(axis=1)).sum(axis=1).mean() < 0:
        tris = tris[:, [0, 2, 1]]
    # The graft: the foot ring lies on the rump.
    pos[:sides, 0] = rump_x(pos[:sides, 1], pos[:sides, 2])
    rear = np.argmin(pos[:, 0])
    assert abs(pos[rear, 0] - target_x) < 1e-6
    pos[rear, 0] = target_x
    # Self-clearance: stations far apart along the tail keep their tubes apart.
    gap = np.linalg.norm(centre[:, None] - centre[None], axis=-1) - radius[:, None] - radius[None]
    far = np.abs(s_all[:, None] - s_all[None]) > 4 * thick0
    self_gap = float(gap[far].min())
    assert self_gap > spec['clearance'], f'tail turns touch: gap {self_gap:.4f}'
    return pos, param, tris, p0, {'stalk': round(float(stalk), 4), 'selfGap': round(self_gap, 4),
                                  'stations': int(rings), 'ringS': ring_s, 'filletEnd': dock_end,
                                  'dock': [round(float(dock_end), 4), round(float(r_fil[0]), 4)]}


def _image(blob, doc, base, slot):
    material = doc['materials'][0]
    ref = material['normalTexture'] if slot == 'normal' else material['pbrMetallicRoughness'][slot]
    view_index = doc['images'][doc['textures'][ref['index']]['source']]['bufferView']
    view = doc['bufferViews'][view_index]
    start = base + view.get('byteOffset', 0)
    return view_index, bytes(blob[start:start + view['byteLength']])


def _smoothstep(e0, e1, v):
    t = np.clip((np.asarray(v, 'f8') - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _value_noise(p, period, seed):
    """Smooth 3D value noise in [-1, 1]; a function of position only."""
    q = p / period
    i = np.floor(q)
    f = q - i
    f = f * f * (3 - 2 * f)
    out = 0.
    for corner in np.ndindex(2, 2, 2):
        c = i + corner
        h = np.sin(c @ np.array([127.1, 311.7, 74.7]) + seed) * 43758.5453
        h = h - np.floor(h)
        w = np.prod([f[..., k] if corner[k] else 1 - f[..., k] for k in range(3)], axis=0)
        out = out + w * h
    return 2 * out - 1


def _rasterize(uv, faces, values, res):
    """Interpolate per-vertex values over every face in UV space at texel centres."""
    width = values.shape[1]
    image = np.zeros((res, res, width))
    face_of = np.full((res, res), -1)
    px = uv * res - .5
    for index, face in enumerate(faces):
        a, b, c = px[face]
        lo = np.clip(np.floor(np.minimum(np.minimum(a, b), c)).astype(int), 0, res - 1)
        hi = np.clip(np.ceil(np.maximum(np.maximum(a, b), c)).astype(int), 0, res - 1)
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        X, Y = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not inside.any():
            continue
        lam = np.stack([l1[inside], l2[inside], l3[inside]], axis=1)
        image[Y[inside], X[inside]] = lam @ values[face]
        face_of[Y[inside], X[inside]] = index
    return image, face_of


def bake_skin_maps(blob, doc, base, spec, mesh):
    """Paint the hide from 3D position into albedo, ORM and normal.

    Rounds 2 and 3 filtered the generator's texels in UV space (a median tone
    plus kept detail), which keeps whatever differs between two charts that
    meet at a seam: the shoulder and neck still showed streaks. Here every
    skin texel's colour is a function of the surface point it maps to (found
    by rasterising the mesh in UV space), so both sides of a seam receive the
    same colour by construction: one hide tone, a paler belly, a slightly
    deeper back, a flush on ears, snout and tail and a darker shank above the
    trotters. The normal map is flat on skin. Eyes, nostrils, trotters and
    the dark ear lining keep their colour.

    Round 5: round 4 still read as streaky sheen. Two causes are fixed by
    construction rather than by dose. (1) The gutters between UV charts kept
    the generator's texels (roughness about 0.33): once the 512 px delivery
    is mip-mapped at viewing distance those gutters bleed glossy, off-colour
    lines along every seam. Every texel no face covers is now filled by a
    pull-push pyramid from the covered texels around it, in all three maps.
    (2) Roughness is one matte value over everything the mesh covers except
    eyes and nostrils, trotters and ear lining included. Returns
    {bufferView: bytes} and a report."""
    import io
    from PIL import Image, ImageFilter  # pig only; the fairing path stays numpy-only
    albedo_view, albedo_bytes = _image(blob, doc, base, 'baseColorTexture')
    orm_view, orm_bytes = _image(blob, doc, base, 'metallicRoughnessTexture')
    normal_view, normal_bytes = _image(blob, doc, base, 'normal')
    decode = lambda b: np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype('f4')
    albedo_src, orm_src, normal_src = decode(albedo_bytes), decode(orm_bytes), decode(normal_bytes)
    assert albedo_src.shape == orm_src.shape == normal_src.shape, 'maps must share one layout'
    h, w, _ = albedo_src.shape
    red, blue = albedo_src[..., 0], albedo_src[..., 2]
    # Pink hide: bright red channel well above blue. Trotters (90/36/27),
    # eyes and nostrils (near black) and the dark ear lining fall outside.
    skin = (red > 150) & (red - blue > 40)
    tone = np.median(albedo_src[skin], axis=0)
    pos, nor, uv, faces = mesh['position'], mesh['normal'], mesh['uv'], mesh['faces']
    # The new surfaces' islands are skin wherever they fall.
    for (cu, cv), half in mesh['islands']:
        skin[int((cv - half) * h):int(np.ceil((cv + half) * h)), int((cu - half) * w):int(np.ceil((cu + half) * w))] = True
    res = spec['res']
    attrs = np.hstack([pos, nor, mesh['tailWeight'][:, None]])
    image, face_of = _rasterize(uv, faces, attrs, res)
    covered = face_of >= 0
    p, n, tail = image[..., :3], image[..., 3:6], np.clip(image[..., 6], 0, 1)
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    mix = lambda c, target, weight: c + weight[..., None] * (np.array(target, 'f8') - c)
    colour = np.broadcast_to(tone.astype('f8'), p.shape).copy()
    belly, k_belly = spec['belly']
    colour = mix(colour, belly, k_belly * _smoothstep(-.25, -.8, n[..., 1]) * (1 - _smoothstep(.28, .36, p[..., 1])))
    back, k_back = spec['back']
    colour = mix(colour, back, k_back * _smoothstep(.35, .9, n[..., 1]) * _smoothstep(.44, .54, p[..., 1]))
    flush, k_flush = spec['flush']
    snout = _smoothstep(.40, .46, p[..., 0])
    ears = np.maximum(*[1 - _smoothstep(.06, .1, np.linalg.norm(p - np.array([.294, .585, side]), axis=-1))
                        for side in (.178, -.178)])
    colour = mix(colour, flush, k_flush * np.maximum(snout, ears))
    shank, k_shank = spec['shank']
    colour = mix(colour, shank, k_shank * _smoothstep(.12, .04, p[..., 1]))
    # Round 6: the trotters are lofted geometry in their own islands, so
    # their horn is painted here too, as a soft gradient up the hoof.
    if 'hoof' in spec:
        hoof, (full, none) = spec['hoof']
        colour = mix(colour, hoof, _smoothstep(none, full, p[..., 1]))
    if 'snout' in spec:
        # The snout disc (facing forward) paler, its rim deeper, so the
        # disc reads as a plate from above and in front.
        facing = n[..., 0]
        front = _smoothstep(.455, .475, p[..., 0])
        colour = mix(colour, spec['snout']['disc'], .7 * front * _smoothstep(.55, .75, facing))
        colour = mix(colour, spec['snout']['rim'], .6 * front * _smoothstep(.15, .4, facing) * (1 - _smoothstep(.5, .7, facing)))
    # The tail deepens from the hide's own tone at its foot, so the base
    # reads as skin growing out, not a coloured disc on the rump.
    colour = mix(colour, spec['tail'], tail)
    for k, (period, amp) in enumerate(spec['noise']):
        colour *= (1 + amp * _value_noise(p, period, 17. * (k + 1)))[..., None]
    # Pad every chart with its own edge colour so filtering never reaches
    # a neighbour; anything left uncovered takes the hide tone.
    filled = covered.copy()
    for _ in range(spec['dilate']):
        acc, cnt = np.zeros_like(colour), np.zeros(filled.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.zeros(filled.shape, bool)
            src = (slice(max(dy, 0), res + min(dy, 0)), slice(max(dx, 0), res + min(dx, 0)))
            dst = (slice(max(-dy, 0), res + min(-dy, 0)), slice(max(-dx, 0), res + min(-dx, 0)))
            shifted[dst] = filled[src]
            acc[dst] += np.where(filled[src][..., None], colour[src], 0)
            cnt[dst] += filled[src]
        grow = ~filled & (cnt > 0)
        colour[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    colour[~filled] = tone
    eye_alpha = np.zeros((res, res))
    eye_report = None
    if 'eye' in spec:
        # Round 6: the eyes, found from the generator's own near-black eye
        # texels (by the 3D point each maps to), are painted larger about
        # their own centre, with a catchlight, a lid line over the top and a
        # brow arc above, all as functions of 3D distance.
        es = spec['eye']
        dark_src = np.asarray(Image.fromarray((albedo_src.max(axis=-1) < spec['darkTexel']).astype('u1') * 255, 'L')
                              .resize((res, res), Image.BOX)) > 127
        on_head = dark_src & covered & (p[..., 0] > .36) & (p[..., 1] > .39) & (p[..., 1] < .47) & (np.abs(p[..., 2]) > .05)
        eye_report = []
        for side in (1, -1):
            sel = on_head & (np.sign(p[..., 2]) == side)
            assert sel.sum() > 20, 'eye texels not found'
            centre = p[sel].mean(axis=0)
            # For a filled disc the median distance from the centre is r / sqrt 2,
            # which stray dark texels round the eye cannot inflate.
            radius = float(np.sqrt(2) * np.median(np.linalg.norm(p[sel] - centre, axis=1))) * es['scale']
            d = np.linalg.norm(p - centre, axis=-1)
            local = covered & (d < radius + .03)
            up = p[..., 1] - centre[1]
            brow_c, brow_w, brow_k = es['brow']
            band = _smoothstep(radius + .002, radius + .006, d) * (1 - _smoothstep(radius + brow_w, radius + brow_w + .004, d))
            colour = mix(colour, brow_c, local * brow_k * band * _smoothstep(.2, .7, up / np.maximum(d, 1e-9)))
            lid_c, lid_w = es['lid']
            lid = _smoothstep(radius - .001, radius + .001, d) * (1 - _smoothstep(radius + lid_w - .001, radius + lid_w + .001, d))
            colour = mix(colour, lid_c, local * lid * _smoothstep(-.1, .4, up / np.maximum(d, 1e-9)))
            a = local * (1 - _smoothstep(radius - .0015, radius + .001, d))
            colour = mix(colour, es['colour'], a)
            light_c, light_r = es['light']
            outward = np.array([.55, .45, .7 * side])
            spot = centre + .45 * radius * outward / np.linalg.norm(outward)
            colour = mix(colour, light_c, local * (1 - _smoothstep(light_r * .6, light_r, np.linalg.norm(p - spot, axis=-1))))
            eye_alpha = np.maximum(eye_alpha, local * (1 - _smoothstep(radius + brow_w, radius + brow_w + .006, d)))
            eye_report.append({'centre': [round(float(x), 4) for x in centre], 'radius': round(radius, 4)})
    painted = np.stack([np.asarray(Image.fromarray(colour[..., c].astype('f4'), 'F').resize((w, h), Image.BILINEAR))
                        for c in range(3)], axis=-1)
    mask = np.asarray(Image.fromarray(skin.astype('u1') * 255, 'L').filter(
        ImageFilter.GaussianBlur(spec['feather']))).astype('f4') / 255
    # The face paint reaches over kept (non-skin) eye texels too.
    eye_mask = np.asarray(Image.fromarray(eye_alpha.astype('f4'), 'F').resize((w, h), Image.BILINEAR)).clip(0, 1)
    mask = np.maximum(mask, eye_mask)
    albedo = albedo_src + mask[..., None] * (painted - albedo_src)
    normal = normal_src + mask[..., None] * (np.array([128., 128., 255.]) - normal_src)
    feather = lambda m: np.asarray(Image.fromarray(m.astype('u1') * 255, 'L').filter(
        ImageFilter.GaussianBlur(spec['feather']))).astype('f4') / 255
    dark = albedo_src.max(axis=-1) < spec['darkTexel']
    matte = 1 - feather(dark)
    orm = orm_src.copy()
    orm[..., 1] += matte * (spec['roughness'] * 255 - orm[..., 1])
    if 'eye' in spec:
        # The painted eye is glossy, the lid and brow matte.
        eye_core = np.zeros((res, res))
        for e in eye_report:
            r_e = e['radius']
            eye_core = np.maximum(eye_core, covered * (1 - _smoothstep(r_e - .0015, r_e + .001, np.linalg.norm(p - np.array(e['centre']), axis=-1))))
        core_w = np.asarray(Image.fromarray(eye_core.astype('f4'), 'F').resize((w, h), Image.BILINEAR)).clip(0, 1)
        orm[..., 1] += core_w * (spec['eye']['roughness'] * 255 - orm[..., 1])
    # Gutters: texels no face reaches (with 2 px of the bake's own padding)
    # are rebuilt from their covered neighbours, so mips never mix in the
    # generator's off-colour, glossy background.
    reach = covered.copy()
    for _ in range(2):
        reach[1:] |= reach[:-1]; reach[:-1] |= reach[1:]; reach[:, 1:] |= reach[:, :-1]; reach[:, :-1] |= reach[:, 1:]
    known = np.asarray(Image.fromarray(reach.astype('u1') * 255, 'L').resize((w, h), Image.NEAREST)) > 127
    albedo, orm, normal = (_pull_push(a, known) for a in (albedo, orm, normal))
    def encode(a):
        out = io.BytesIO()
        Image.fromarray(np.clip(np.rint(a), 0, 255).astype('u1'), 'RGB').save(
            out, 'JPEG', quality=92, subsampling=0, optimize=True)
        return out.getvalue()
    albedo_out, orm_out, normal_out = encode(albedo), encode(orm), encode(normal)
    # Read back what a renderer will sample, not what was intended.
    albedo_chk, orm_chk, normal_chk = decode(albedo_out), decode(orm_out), decode(normal_out)
    face = eye_mask > .01
    core, outside = (mask > .99) & ~face, (mask < .01) & known & ~face
    assert np.abs(albedo_chk[outside] - albedo_src[outside]).mean() < 2.5, 'non-skin albedo moved'
    assert np.abs(normal_chk[outside] - normal_src[outside]).mean() < 2.5, 'non-skin normal moved'
    skin_rough = float(np.median(orm_chk[..., 1][core])) / 255
    assert abs(skin_rough - spec['roughness']) < .02, f'skin roughness median {skin_rough:.3f}'
    shiny = (matte < .01) & known & ~face
    assert np.abs(orm_chk[..., 1][shiny] - orm_src[..., 1][shiny]).mean() < 2, 'eye roughness moved'
    assert np.abs(orm_chk[..., [0, 2]][known] - orm_src[..., [0, 2]][known]).mean() < 2, 'occlusion or metalness moved'
    gutter = ~known
    gutter_rough = float(np.median(orm_chk[..., 1][gutter])) / 255
    assert gutter_rough > spec['roughness'] - .05, f'gutter roughness {gutter_rough:.3f}'
    # Seams: where one surface edge is cut into two UV edges, compare the
    # colour just inside each side. A 3D paint must agree across the cut.
    first, inverse = _weld(pos)
    welded = inverse[faces]
    edge_key, edge_face, edge_raw = [], [], []
    for i in range(3):
        a, b = welded[:, i], welded[:, (i + 1) % 3]
        edge_key.append(np.sort(np.stack([a, b], axis=1), axis=1))
        edge_face.append(np.stack([np.arange(len(faces)), np.full(len(faces), i)], axis=1))
    edge_key, edge_face = np.vstack(edge_key), np.vstack(edge_face)
    order = np.lexsort((edge_key[:, 1], edge_key[:, 0]))
    edge_key, edge_face = edge_key[order], edge_face[order]
    pair = np.flatnonzero(np.all(edge_key[1:] == edge_key[:-1], axis=1))
    def inner_uv(face, corner):
        f = faces[face]
        a, b, c = uv[f[:, 0]], uv[f[:, 1]], uv[f[:, 2]]
        corners = np.stack([a, b, c], axis=1)
        e0 = corners[np.arange(len(f)), corner]
        e1 = corners[np.arange(len(f)), (corner + 1) % 3]
        opp = corners[np.arange(len(f)), (corner + 2) % 3]
        return .5 * (e0 + e1) * .85 + .15 * opp
    fa, fb = edge_face[pair], edge_face[pair + 1]
    ua, ub = inner_uv(fa[:, 0], fa[:, 1]), inner_uv(fb[:, 0], fb[:, 1])
    cut = np.linalg.norm(ua - ub, axis=1) > 4 / w
    sample = lambda img, q: img[np.clip((q[:, 1] * h).astype(int), 0, h - 1), np.clip((q[:, 0] * w).astype(int), 0, w - 1)]
    on_skin = (sample(mask, ua) > .99) & (sample(mask, ub) > .99) & cut
    seam = [round(float(np.abs(sample(img, ua) - sample(img, ub))[on_skin].mean()), 2) for img in (albedo_src, albedo_chk)]
    assert on_skin.sum() > 50 and seam[1] < 4 and seam[1] < .6 * seam[0], f'seam colour step {seam}'
    return {albedo_view: albedo_out, orm_view: orm_out, normal_view: normal_out}, {
        'skinFraction': round(float(core.mean()), 4),
        'skinTone': [round(float(x)) for x in tone],
        **({'eyes': eye_report} if eye_report else {}),
        'seamEdges': int(on_skin.sum()),
        'seamColourStep': seam,
        'skinRoughnessMedian': [round(float(np.median(orm_src[..., 1][core])) / 255, 3), round(skin_rough, 3)],
        'bakeCoverage': round(float(covered.mean()), 4),
        'gutterFraction': round(float(gutter.mean()), 4),
        'roughness': {'gutterMedianBefore': round(float(np.median(orm_src[..., 1][gutter])) / 255, 3),
                      'gutterMedianAfter': round(gutter_rough, 3),
                      'coveredMedianAfter': round(float(np.median(orm_chk[..., 1][known])) / 255, 3)},
    }


def _pull_push(image, known):
    """Fill the texels outside `known` from the known ones (pull-push pyramid).

    Each coarser level averages the known texels under it; unknown texels
    take the nearest coarser level that has any, so a gutter carries the
    colour of the charts round it. Square power-of-two images."""
    img = image.astype('f4')
    levels = []
    total, weight = img * known[..., None], known.astype('f4')
    while total.shape[0] > 1:
        levels.append((total, weight))
        h2, w2 = total.shape[0] // 2, total.shape[1] // 2
        total = total.reshape(h2, 2, w2, 2, -1).sum(axis=(1, 3))
        weight = weight.reshape(h2, 2, w2, 2).sum(axis=(1, 3))
    average = total / np.maximum(weight, 1e-12)[..., None]
    for total, weight in reversed(levels):
        up = np.repeat(np.repeat(average, 2, axis=0), 2, axis=1)
        average = np.where(weight[..., None] > 0, total / np.maximum(weight, 1e-12)[..., None], up)
    return np.where(known[..., None], img, average)


def _zipper(outer, s_outer, inner, s_inner):
    """Triangle strip between two closed loops running the same way round.

    `s_*` is each vertex's fraction of a turn in the loop direction. Outer
    edges are used reversed, matching a hole whose retained faces run along
    the outer loop's order."""
    ro, ri = np.argmin(s_outer), np.argmin(s_inner)
    o, so = np.roll(outer, -ro), np.roll(s_outer, -ro)
    i, si = np.roll(inner, -ri), np.roll(s_inner, -ri)
    assert (np.diff(so) > 0).all() and (np.diff(si) > 0).all(), 'loop is not star-shaped about the root'
    o, so, i, si = np.r_[o, o[0]], np.r_[so, so[0] + 1], np.r_[i, i[0]], np.r_[si, si[0] + 1]
    n, m = len(o) - 1, len(i) - 1
    a = b = 0
    tris = []
    while a < n or b < m:
        if b == m or (a < n and so[a + 1] <= si[b + 1]):
            tris.append((o[a + 1], o[a], i[b])); a += 1
        else:
            tris.append((o[a], i[b], i[b + 1])); b += 1
    return tris


def _surface_samples(P, faces, n=6):
    """Points spread over each face on a barycentric grid, for clearance."""
    bc = np.array([(1 - i / n - j / n, i / n, j / n) for i in range(n + 1) for j in range(n + 1 - i)])
    return np.einsum('kj,fjd->fkd', bc, P[faces]).reshape(-1, 3)


def _nearest(points, cloud, chunk=96):
    best = np.full(len(points), np.inf)
    for i in range(0, len(points), chunk):
        best[i:i + chunk] = np.linalg.norm(points[i:i + chunk, None] - cloud[None], axis=-1).min(axis=1)
    return best


def rebuild_rear(blob, doc, base, spec):
    prims = [prim for mesh in doc['meshes'] for prim in mesh['primitives']]
    assert len(prims) == 1, 'rear rebuild expects one primitive'
    prim = prims[0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    assert set(prim['attributes']) == set(names)
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    # The length extreme the tail must hold, and the rebuilt region, are
    # both taken before anything moves.
    target_x = float(P[:, 0].min())
    P_source = P.copy()
    # Torso first, so the rump the tail is grafted onto is the rebuilt one.
    body_w = np.zeros(len(P))
    body_n = np.zeros((len(P), 3))
    body_report = body_surface = None
    if 'body' in spec:
        before = P.copy()
        P, body_w, body_n, body_surface = smooth_body(P, F, {**spec['body'], 'tailRoot': spec['tail']['root']}, _rump_coeff(P, spec))
        (cz, cy), (az, ay) = spec['region']
        clear = ~((before[:, 0] < spec['rearX'] + .08)
                  & (((before[:, 2] - cz) / az) ** 2 + ((before[:, 1] - cy) / ay) ** 2 < 1.3 ** 2))
        core = (body_w > .5) & clear
        dihedral = lambda q: np.percentile(_dihedrals(q, F, core), (90, 99)).round(1).tolist()
        body_report = {
            'movedVertices': int((np.linalg.norm(P - before, axis=1) > 1e-8).sum()),
            'maxDisplacement': round(float(np.linalg.norm(P - before, axis=1)[clear].max()), 4),
            'dihedralP90P99': [dihedral(before), dihedral(P)],
        }
    # The legs and the belly round them take smooth normals of the moved
    # surface (the body volume's weight fades out over them).
    leg_mask = np.zeros(len(P), bool)
    for sx in (1, -1):
        for sz in (1, -1):
            foot = (P[:, 1] < .03) & (np.sign(P[:, 0]) == sx) & (np.sign(P[:, 2]) == sz)
            c = P[foot][:, [0, 2]].mean(axis=0)
            leg_mask |= (P[:, 1] < .15) & (np.hypot(P[:, 0] - c[0], P[:, 2] - c[1]) < .1)
    ear_w = np.zeros(len(P))
    ear_report = None
    if 'ears' in spec:
        before = P.copy()
        P, ear_w = fair_ears(P, F, spec['ears'])
        ear_mask = np.zeros(len(P), bool)
        ear_mask[(ear_w > .5)] = True
        ear_report = {'movedVertices': int((np.linalg.norm(P - before, axis=1) > 1e-8).sum()),
                      'maxDisplacement': round(float(np.linalg.norm(P - before, axis=1).max()), 4),
                      'dihedralP90P99': [np.percentile(_dihedrals(q, F, ear_mask), (90, 99)).round(1).tolist() for q in (before, P)]}
    pos = P[inverse]
    (cz, cy), (az, ay) = spec['region']
    ell = lambda y, z: ((z - cz) / az) ** 2 + ((y - cy) / ay) ** 2
    inside = (P_source[:, 0] < spec['rearX']) & (ell(P_source[:, 1], P_source[:, 2]) < 1)
    drop = inside[F].all(axis=1)
    kept_faces, kept_welded = faces[~drop], F[~drop]
    # Hole loop, ordered along the retained faces' directed boundary edges.
    directed = kept_welded[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    present = set(map(tuple, directed.tolist()))
    border = [(a, b) for a, b in directed.tolist() if (b, a) not in present]
    following = dict(border)
    assert len(following) == len(border), 'hole boundary is not a simple loop'
    loop = [border[0][0]]
    while following[loop[-1]] != loop[0]:
        loop.append(following[loop[-1]])
    assert len(loop) == len(border), 'hole has more than one boundary loop'
    loop = np.array(loop)
    # Rump height field x(y, z), fitted to the clean rump in and around the hole.
    region = ell(P[:, 1], P[:, 2])
    ring = (P[:, 0] < spec['rearX']) & (region < spec['fitScale'] ** 2)
    for (rz, ry), (sz, sy) in spec['relief']:
        ring &= ((P[:, 2] - rz) / sz) ** 2 + ((P[:, 1] - ry) / sy) ** 2 > 1.15 ** 2
    basis = lambda y, z: np.stack([np.ones_like(y), y, z, y * y, y * z, z * z], axis=-1)
    coeff, *_ = np.linalg.lstsq(basis(P[ring, 1], P[ring, 2]), P[ring, 0], rcond=None)
    rump_x = lambda y, z: basis(np.asarray(y, 'f8'), np.asarray(z, 'f8')) @ coeff
    def rump_n(y, z):  # outward (rearward) unit normal of the height field
        v = np.array([-1., coeff[1] + 2 * coeff[3] * y + coeff[4] * z, coeff[2] + coeff[4] * y + 2 * coeff[5] * z])
        return v / np.linalg.norm(v)
    if body_surface is not None:
        # The rebuilt body's own surface, read off its volume, so the foot
        # and the dock are placed on the surface the fill must meet rather
        # than on a quadratic fitted round it.
        rump_x, rump_n = body_surface
    kept = np.unique(kept_faces)
    remap = np.full(len(pos), -1)
    remap[kept] = np.arange(len(kept))
    rep = np.full(len(P), -1)
    rep[F[~drop].ravel()] = faces[~drop].ravel()
    B = P[loop]
    n_b = len(loop)
    # Angles round the tail root in the (z, y) plane, measured the way the
    # hole loop runs.
    tspec = spec['tail']
    rz0, ry0 = tspec['root']
    polar = lambda q: (np.arctan2(q[:, 1] - ry0, q[:, 2] - rz0), np.hypot(q[:, 1] - ry0, q[:, 2] - rz0))
    ang_b, rad_b = polar(B)
    turn = np.angle(np.exp(1j * np.diff(np.r_[ang_b, ang_b[0]])))
    sense = np.sign(turn.sum())
    assert abs(abs(turn.sum()) - 2 * np.pi) < 1e-6 and (np.sign(turn) == sense).all(), 'hole is not star-shaped about the root'
    frac = lambda a: ((sense * (a - ang_b[0])) % (2 * np.pi)) / (2 * np.pi)
    # The tail's ring order must run the same way round as the hole.
    tail_pos, tail_param, tail_tris, root, tinfo = _tail(tspec, rump_x, rump_n, target_x)
    sides = tspec['sides']
    if np.sign(np.angle(np.exp(1j * np.diff(polar(tail_pos[:sides])[0]))).sum()) != sense:
        tail_pos, tail_param, tail_tris, root, tinfo = _tail(tspec, rump_x, rump_n, target_x, hand=-1.)
    ang_0, rad_0 = polar(tail_pos[:sides])
    # Fill rings between the hole's edge (t = 1) and the foot ring (t = 0);
    # the fill keeps its own copy of the foot ring, so fill and tail can sit
    # in separate UV islands.
    counts = spec['fillCounts']
    patch, s_rings = [B.copy()], [frac(ang_b)]
    for k, count in enumerate(counts):
        t = 1 - (k + 1) / (len(counts) + 1)
        phi = ang_b[0] + sense * 2 * np.pi * (np.arange(count) + .5) / count
        rad = (1 - t) * np.interp(phi, ang_0, rad_0, period=2 * np.pi) + t * np.interp(phi, ang_b, rad_b, period=2 * np.pi)
        z, y = rz0 + rad * np.cos(phi), ry0 + rad * np.sin(phi)
        patch.append(np.c_[rump_x(y, z), y, z])
        s_rings.append(frac(phi))
    patch.append(tail_pos[:sides].copy())
    s_rings.append(frac(ang_0))
    fill_pos = np.vstack(patch)
    n_fill = len(fill_pos)
    starts = np.cumsum([0] + [len(q) for q in patch])
    ring_idx = [np.arange(starts[k], starts[k + 1]) for k in range(len(patch))]
    fill_tris = []
    for k in range(len(ring_idx) - 1):
        fill_tris += _zipper(ring_idx[k], s_rings[k], ring_idx[k + 1], s_rings[k + 1])
    fill_tris = np.array(fill_tris)
    patch_pos = np.vstack([fill_pos, tail_pos])
    patch_tris = np.vstack([fill_tris, tail_tris + n_fill])
    foot = np.arange(n_fill - sides, n_fill)
    # UVs: each new surface in its own empty atlas square. Colour is painted
    # from 3D position afterwards, so the layout inside a square is free.
    (fill_c, fill_h), (tail_c, tail_h) = spec['uvIslands']['fill'], spec['uvIslands']['tail']
    q = fill_pos[:, [2, 1]]
    mid = .5 * (q.min(axis=0) + q.max(axis=0))
    span = np.abs(q - mid).max()
    patch_uv = np.vstack([np.array(fill_c) + .9 * fill_h * (q - mid) / span,
                          np.array(tail_c) + .9 * tail_h * np.c_[2 * tail_param[:, 0] - 1, np.cos(2 * np.pi * tail_param[:, 1])]])
    # Skin: the hole's edge keeps its own; the tail moves with the rump round
    # its root (an inverse-distance blend of the edge), and the fill rings
    # blend harmonically between the two, so the graft never tears in stride.
    joints_src, weights_src = attrs['JOINTS_0'], attrs['WEIGHTS_0'].astype('f8')
    n_joints = len(doc['skins'][0]['joints'])
    def dense(rows):
        out = np.zeros((len(rows), n_joints))
        for c in range(4):
            np.add.at(out, (np.arange(len(rows)), joints_src[rows, c].astype('i8')), weights_src[rows, c])
        return out
    edge_skin = dense(rep[loop])
    d = np.hypot(B[:, 1] - ry0, B[:, 2] - rz0)
    root_skin = (edge_skin / d[:, None] ** 2).sum(axis=0) / (1 / d ** 2).sum()
    held = np.zeros(len(patch_pos), bool)
    held[:n_b] = True
    held[foot[0]:] = True
    skin = np.zeros((len(patch_pos), n_joints))
    skin[:n_b] = edge_skin
    skin[foot[0]:] = root_skin
    skin = _relax(skin, _edges(fill_tris), held, 600)
    top = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top[top_w == 0] = 0
    n_kept = len(kept)
    all_pos = np.vstack([pos[kept], patch_pos])
    all_faces = np.vstack([remap[kept_faces], patch_tris + n_kept])
    w_first, w_inverse = _weld(all_pos)
    wf = w_inverse[all_faces]
    # The fill's shape: a least-squares biharmonic surface. The Laplacian is
    # driven to zero at every fill vertex and on both rings it meets (the
    # hole's edge, whose neighbours outside the hole set the rump's slope,
    # and the foot, whose neighbours up the fillet set the tail's), so the
    # fill meets both with matching slope.
    W = all_pos[w_first].copy()
    edges = _edges(wf)
    deg = np.bincount(edges.ravel(), minlength=len(W)).astype('f8')
    unknown = np.unique(w_inverse[n_kept + n_b:n_kept + foot[0]])
    rows = np.unique(np.r_[unknown, w_inverse[n_kept:n_kept + n_b], w_inverse[n_kept + foot]])
    row_of = np.full(len(W), -1)
    row_of[rows] = np.arange(len(rows))
    L = np.zeros((len(rows), len(W)))
    for a, b in ((edges[:, 0], edges[:, 1]), (edges[:, 1], edges[:, 0])):
        sel = row_of[a] >= 0
        np.add.at(L, (row_of[a[sel]], b[sel]), 1 / deg[a[sel]])
    L[np.arange(len(rows)), rows] -= 1
    known = W.copy()
    known[unknown] = 0
    W[unknown] = np.linalg.lstsq(L[:, unknown], -L @ known, rcond=None)[0]
    all_pos = W[w_inverse]
    patch_pos = all_pos[n_kept:]
    fill_pos = patch_pos[:n_fill]
    fc = np.cross(patch_pos[fill_tris[:, 1]] - patch_pos[fill_tris[:, 0]], patch_pos[fill_tris[:, 2]] - patch_pos[fill_tris[:, 0]])
    assert (fc[:, 0] < 0).all(), 'fill face does not face out of the rump'
    # Clearance: past the fillet, the tail stands off every other surface.
    body_faces = wf[:len(kept_faces) + len(fill_tris)]
    cloud = _surface_samples(W, body_faces[(W[body_faces][:, :, 0].max(axis=1) < -.25) & (W[body_faces][:, :, 1].max(axis=1) > .33)])
    standing = tinfo['ringS'] > tinfo['filletEnd'] + .012
    stand_off = _nearest(tail_pos[standing], cloud)
    assert stand_off.min() > tspec['clearance'], f'tail too near the body: {stand_off.min():.4f}'
    # The ears hold the height extreme; the tail must stay under it.
    ceiling = doc['accessors'][prim['attributes']['POSITION']]['max'][1] - .004
    assert tail_pos[:, 1].max() < ceiling, f'tail top {tail_pos[:, 1].max():.4f} reaches the height extreme'
    # Normals: recomputed across the welded result over the rebuilt body,
    # the legs, the fill and the tail; elsewhere the faired normals stay.
    # On the torso they come from the blurred volume's gradient, so its
    # shading is smooth however the generator triangulated it.
    smooth = _smooth_normals(W, wf)[w_inverse]
    kept_w = inverse[kept]
    near = np.r_[(body_w[kept_w] > 0) | (ear_w[kept_w] > 0) | leg_mask[kept_w] | ((P[kept_w, 0] < spec['rearX']) & (region[kept_w] < spec['fitScale'] ** 2)),
                 np.ones(len(patch_pos), bool)]
    all_nor = np.vstack([attrs['NORMAL'][kept].astype('f8'), np.zeros((len(patch_pos), 3))])
    all_nor[near] = smooth[near]
    wn = body_w[kept_w][:, None]
    blended = wn * body_n[kept_w] + (1 - wn) * all_nor[:n_kept]
    all_nor[:n_kept] = blended / np.maximum(np.linalg.norm(blended, axis=1), 1e-12)[:, None]
    # One closed, consistently wound surface once seams are welded.
    d = wf[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    _, use = np.unique(np.sort(d, axis=1), axis=0, return_counts=True)
    assert (use == 2).all(), 'rebuilt mesh is not closed'
    assert len(np.unique(d, axis=0)) == len(d), 'rebuilt mesh winding is inconsistent'
    # The foot ring lies on the rump; the fillet rings stand proud of it.
    dock_rings = tinfo['ringS'] <= tinfo['filletEnd'] + 1e-12
    tail_gap = rump_x(tail_pos[dock_rings, 1], tail_pos[dock_rings, 2]) - patch_pos[n_fill:][dock_rings, 0]
    assert np.abs(tail_gap[:sides]).max() < 1e-9, 'tail foot ring is off the rump'
    assert (tail_gap[sides:] > 0).all(), f'dock dips into the rump: min gap {tail_gap[sides:].min():.4f}'
    new = {
        'POSITION': all_pos.astype('<f4'),
        'NORMAL': all_nor.astype('<f4'),
        'TEXCOORD_0': np.vstack([attrs['TEXCOORD_0'][kept], patch_uv]).astype('<f4'),
        'JOINTS_0': np.vstack([joints_src[kept], top]).astype(joints_src.dtype),
        'WEIGHTS_0': np.vstack([attrs['WEIGHTS_0'][kept], top_w]).astype(attrs['WEIGHTS_0'].dtype),
    }
    for k in names[2:]:
        assert np.array_equal(new[k][:n_kept], attrs[k][kept]), f'retained {k} changed'
    tail_weight = np.r_[np.zeros(n_kept + n_fill),
                        _smoothstep(.5 * tinfo['filletEnd'], tinfo['filletEnd'] + .03, tinfo['ringS'])]
    leg_report = None
    if 'legs' in spec:
        before = {k: v.copy() for k, v in new.items()}
        new['TAIL'] = tail_weight
        new, all_faces, retained_rows, leg_report = loft_legs(
            new, all_faces, spec['legs'], n_joints, float(doc['accessors'][prim['attributes']['POSITION']]['min'][1]),
            spec['uvIslands'])
        tail_weight = new.pop('TAIL')
        kept_rows = retained_rows < n_kept  # rows that are source vertices
        for k in names[2:]:
            assert np.array_equal(new[k][:len(retained_rows)][kept_rows], before[k][retained_rows[kept_rows]]), f'retained {k} changed by the leg loft'
        new['POSITION'], new['NORMAL'] = new['POSITION'].astype('<f4'), new['NORMAL'].astype('<f4')
        new['TEXCOORD_0'] = new['TEXCOORD_0'].astype('<f4')
        all_pos = new['POSITION'].astype('f8')
        all_nor = new['NORMAL'].astype('f8')
        d = all_faces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
        w_first, w_inverse = _weld(all_pos)
        d = w_inverse[d]
        _, use = np.unique(np.sort(d, axis=1), axis=0, return_counts=True)
        assert (use == 2).all(), 'mesh is not closed after the leg loft'
        assert len(np.unique(d, axis=0)) == len(d), 'winding is inconsistent after the leg loft'
    indices = all_faces.astype('<u2' if len(all_pos) < 65535 else '<u4').ravel()
    lo, hi = new['POSITION'].min(axis=0), new['POSITION'].max(axis=0)
    src = doc['accessors'][prim['attributes']['POSITION']]
    assert np.allclose(lo, src['min'], atol=1e-7) and np.allclose(hi, src['max'], atol=1e-7), (lo, hi)
    # Re-pack the binary chunk: rewritten geometry views, every other view
    # copied byte for byte.
    out = json.loads(json.dumps(doc))
    payload = {prim['attributes'][k]: new[k].tobytes() for k in names}
    payload[prim['indices']] = indices.tobytes()
    by_view = {}
    for index, data in payload.items():
        acc = out['accessors'][index]
        assert acc.get('byteOffset', 0) == 0
        acc['count'] = len(indices) if index == prim['indices'] else len(all_pos)
        by_view[acc['bufferView']] = data
    acc = out['accessors'][prim['attributes']['POSITION']]
    acc['min'], acc['max'] = [float(x) for x in lo], [float(x) for x in hi]
    if len(all_pos) >= 65535:
        out['accessors'][prim['indices']]['componentType'] = 5125
    images, skin_report = ({}, None)
    if 'skin' in spec:
        islands = list(spec['uvIslands'].values())
        images, skin_report = bake_skin_maps(blob, doc, base, spec['skin'], {
            'position': all_pos, 'normal': all_nor, 'uv': new['TEXCOORD_0'].astype('f8'),
            'faces': all_faces, 'islands': islands, 'tailWeight': tail_weight})
    assert not set(images) & set(by_view)
    binary = bytearray()
    for vi, view in enumerate(out['bufferViews']):
        data = by_view.get(vi, images.get(vi))
        if data is None:
            start = base + doc['bufferViews'][vi].get('byteOffset', 0)
            data = bytes(blob[start:start + view['byteLength']])
        binary += b'\0' * (-len(binary) % 4)
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(data)
        view.pop('byteStride', None) if vi in by_view else None
        binary += data
    binary += b'\0' * (-len(binary) % 4)
    out['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(out, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    glb = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(binary))
           + struct.pack('<II', len(text), 0x4E4F534A) + text
           + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))
    for key in ('nodes', 'skins', 'materials', 'textures', 'images', 'samplers', 'scenes', 'animations'):
        assert out.get(key) == doc.get(key), key
    return glb, {
        'removedTriangles': int(drop.sum()), 'removedVertices': int(len(pos) - n_kept),
        'fillTriangles': int(len(fill_tris)), 'fillVertices': int(n_fill),
        'tailTriangles': int(len(tail_tris)), 'tailVertices': int(len(tail_pos)),
        'vertices': int(len(all_pos)), 'triangles': int(len(all_faces)),
        'holeLoop': int(n_b), 'tailRoot': [round(float(x), 4) for x in root],
        'tail': {k: v for k, v in tinfo.items() if k not in ('ringS', 'filletEnd')},
        'tailStandOff': round(float(stand_off.min()), 4),
        **({'body': body_report} if body_report else {}),
        **({'ears': ear_report} if ear_report else {}),
        **({'legs': leg_report} if leg_report else {}),
        **({'skin': skin_report} if skin_report else {}),
    }


# Horse hindquarters (round 1 of the 2026-11-04 asset loop). The generator
# built the horse's rump as a chamfered box with planar flanks and a hard step
# down to the barrel, and its tail as a wide, flat, dark plate hanging 1-2 cm
# behind the rump from a bridge at the croup's rear corner. Fairing moves
# vertices toward their neighbours and so keeps both. Here, in the horse's own
# frame (+Z rump, -Z head, X lateral, +Y up; source units, the Tripo unit box):
#   - The plate is found by connectivity, grown from its tip over vertices
#     past the cut plane (the hocks stop just short of it), and removed from
#     both the mesh and the body volume.
#   - The hindquarters are rebuilt as the level set of the blurred body volume
#     (the pig's method, see smooth_body): corners round with a radius set by
#     sigma, broad flanks stay put, and the step to the barrel blends.
#   - A round region at the tail's root on the midline is cut, filled by rings
#     carried onto the same level set, and a new tail is grown from it: a
#     modelled dock (the blended joint of _dock_profile), a short rise along
#     the croup's normal, a bend over into a hanging tail that bows rearward,
#     a hair swell and a tapered, rounded tip. Its rearmost point is solved
#     onto the source's length extreme so the envelope does not change.
#   - New surfaces take their UVs from solid squares of the existing atlas
#     (the deleted plate's dark hair chart, a flat coat chart on the rump), so
#     no image byte changes. Retained vertices keep UV, joint and weight
#     bytes; nodes, skins, materials, images and animations are identical.
HORSE_HINDQUARTERS = {
    'kind': 'hindquarters',
    'body': {'voxel': .005, 'sigma': .03, 'iso': .47,
             # Weight ramps (zero, full): rump behind the barrel's middle,
             # above the hind legs; the gaskins and hocks keep their shape.
             'z': (.06, .2), 'y': (.27, .36),
             # Clip: every voxel past the cut plane above this height is plate.
             'clipY': .12, 'clipMargin': .002},
    'tail': {
        'cut': .445, 'seed': (.45, .25),
        # Root search: from an inside point, march along a sagittal ray at
        # `elevation` degrees above rearward to the level set.
        'rootFrom': (0., .45, .32), 'elevation': 40.,
        # Faces wholly inside the ellipse ((lateral, along-croup) radii) about
        # the root, within the depth limit, are replaced by the fill.
        'hole': ((.105, .06), .08),
        'dock': {'foot': .036, 'sigma': .008, 'blend': .007, 'rings': 5},
        # Radius profile along the free tail as (fraction, lateral radius);
        # the sagittal radius is `flat` times the lateral one. The dock stays
        # slim through the bend (its radius under `bend`, so the inside of
        # the turn cannot fold), then the hair swells and tapers to the tip.
        'radius': ((0., .019), (.15, .021), (.5, .036), (.85, .032), (1., .019)), 'flat': .9,
        # Heading (degrees above rearward) over the free tail: leaves along
        # the croup normal but no steeper than `rise`, bends over (radius
        # `bend`), then hangs with a rearward bow from `hang[0]` to
        # `hang[1]`, down to the tip height.
        'rise': 5., 'stalk': 0., 'bend': .025, 'hang': (-55., -78.), 'tipY': .2,
        # Ring counts are held to the render-vertex budget (18,900 = 6,300
        # triangles; the source has 5,996).
        'sides': 10, 'tubeRings': 24, 'clearance': .004,
        'fillCounts': (30, 24, 18, 13),
        # Round 3 (2026-11-05), change of construction: the single swollen
        # loft above read as a smooth paddle from behind in three judged
        # rounds. With `locks` set, the tube is only the dock (its blended
        # foot, the bend, and a short taper capped inside the hair), and the
        # hair is a bundle of separately lofted locks (_horse_tail_bundle).
        # Each lock has its own centre line, offset from the tail line inside
        # an envelope traced from a back view (`spread`, lateral) and a side
        # view (`sagScale` of it), twisting and waving slightly, with its own
        # teardrop radius profile ending in a point. Lock lengths differ by
        # up to 20%, so the bottom edge is a ragged, splayed tuft and never a
        # common rounded end; below about half way the outer locks stand
        # apart, so the clay pass shades the gaps between them. A shorter
        # core lock fills the middle of the bundle. The hair chart of the
        # atlas is flat (sRGB std < 1 in every hair chart), so the strands
        # are carried by geometry, not by UVs.
        'locks': {
            # Hair starts this far before the bend's end (arc length); the
            # dock runs on `dockRun` past the bend, tapering to `dockEnd`
            # radius, and is closed by an apex `dockCap` beyond its last ring.
            'start': -.012, 'dockBend': 2, 'dockRun': .035, 'dockEnd': .013, 'dockCap': .006,
            'sides': 5, 'phase': 15., 'twist': 35.,
            # Lock-centre ring radius against hair fraction (back view); the
            # side view is `sagScale` of it.
            'spread': ((0., .007), (.35, .021), (.7, .031), (.9, .036), (1., .041)), 'sagScale': .75,
            # Outer locks: length (fraction of the hair) and radius scale.
            'length': (1., .83, .95, .8, .98, .88), 'scale': (1., .94, 1.04, .92, 1., .96),
            # Lock radius against the lock's own length fraction; the apex
            # closes it at 1.
            'radius': ((0., .012), (.25, .015), (.5, .014), (.72, .0105), (.88, .0066), (1., .0035)),
            'stations': (0., .16, .34, .52, .69, .83, .94),
            'core': {'length': .7, 'scale': 1.3, 'stations': (0., .2, .42, .64, .82, .94)},
            'wave': (.0022, 1.5),
        },
    },
    # Solid squares of the existing atlas (centre u, v; half side), found by
    # rasterising the source charts: the plate's hair chart (sRGB mean 95, 65,
    # 57) and the rump coat chart (188, 111, 74).
    'uvIslands': {'tail': ((.8213, .6611), .026), 'fill': ((.0732, .376), .026)},
    'preservation': 'Fairing changed POSITION and NORMAL only; the hindquarters rebuild then removed the generator tail plate, moved the rump onto the level set of the blurred body volume (normals from its gradient, each side widened back to the source width extreme), replaced the croup corner with a fill carried onto that level set and grafted a new hanging tail: a lofted dock with a blended foot, capped inside a bundle of separately lofted, tapered hair locks (closed shells of staggered length); fill and tail take UVs from solid squares of the existing atlas. Retained vertices keep UV, joint and weight bytes; images, inverse binds, nodes, skins, materials and animations byte-identical; topology changed in the rebuilt region only',
}
REBUILDS['horse'] = HORSE_HINDQUARTERS


def _iso_project(field, grad, lo, step, iso, q, iterations=12):
    """Carry points along the field's gradient onto its iso-surface."""
    q = q.copy()
    for _ in range(iterations):
        f = _trilinear(field, lo, step, q)
        g = _trilinear(grad, lo, step, q)
        delta = ((f - iso) / np.maximum((g * g).sum(axis=1), 1e-9))[:, None] * g
        length = np.linalg.norm(delta, axis=1)
        q -= delta * np.minimum(1, 2 * step / np.maximum(length, 1e-12))[:, None]
    return q, np.abs(_trilinear(field, lo, step, q) - iso)


def _horse_tail_line(spec, p0, n0, bow):
    """Sagittal centre line of the hanging tail: (points, arc length).

    `bow` in [0, 1] scales the hang's rearward lean from plumb (0) to the
    spec's headings (1); it is solved so the tail meets the length extreme."""
    # The dock leaves the croup no steeper than `rise`, so the tail falls
    # from the top of the buttocks rather than hooking up off the corner.
    psi0 = min(np.arctan2(n0[1], n0[2]), np.radians(spec.get('rise', 90.)))
    stalk = spec['stalk']
    h0, h1 = [np.radians(-90. + bow * (h + 90.)) for h in spec['hang']]
    dock_len = _dock_profile(spec['dock'], spec['radius'][0][1])[0][-1]
    # Heading as a function of arc length (continuous in bow): rise along
    # the croup normal, bend over at radius `bend`, then ease from the first
    # hang heading to the second over 0.25 units, until the tip height.
    s1 = dock_len + stalk
    s2 = s1 + max(psi0 - h0, 0.) * spec['bend']
    s = np.arange(0., 1., .0005)
    psi = np.where(s < s1, psi0, np.where(s < s2, psi0 - (s - s1) / spec['bend'],
                                          h0 + (h1 - h0) * np.clip((s - s2) / .25, 0, 1)))
    mid = .5 * (psi[1:] + psi[:-1])
    pts = p0 + np.vstack([np.zeros(3), np.cumsum(np.stack([np.zeros_like(mid), np.sin(mid), np.cos(mid)], axis=1) * .0005, axis=0)])
    end = int(np.argmax(pts[:, 1] <= spec['tipY']))
    assert end > 0, 'tail never reaches the tip height'
    pts = pts[:end + 1].copy()
    a, b = pts[-2], pts[-1]
    pts[-1] = a + (b - a) * (a[1] - spec['tipY']) / max(a[1] - b[1], 1e-12)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    return pts, seg, dock_len


def _horse_tail(spec, p0, n0, bow):
    """Rings of the tail from its dock foot (ring 0) to a rounded tip."""
    line, seg, dock_len = _horse_tail_line(spec, p0, n0, bow)
    sides = spec['sides']
    s_fil, r_fil = _dock_profile(spec['dock'], spec['radius'][0][1])
    n_tube = spec['tubeRings']  # fixed, so the rings vary continuously with bow
    s_tube = np.linspace(dock_len, seg[-1], n_tube + 1)[1:]
    frac, rad = np.array(spec['radius']).T
    r_tube = np.interp((s_tube - dock_len) / (seg[-1] - dock_len), frac, rad)
    s_all = np.r_[s_fil, s_tube]
    r_lat = np.r_[r_fil, r_tube]
    r_sag = np.r_[r_fil, r_tube * spec['flat']]
    centre = np.stack([np.interp(s_all, seg, line[:, k]) for k in range(3)], axis=1)
    tangent = np.stack([np.interp(s_all, seg, np.gradient(line[:, k], seg)) for k in range(3)], axis=1)
    tangent /= np.linalg.norm(tangent, axis=1)[:, None]
    end, end_t, r_end = centre[-1].copy(), tangent[-1].copy(), r_lat[-1]
    for a in np.radians((35., 65.)):
        centre = np.vstack([centre, end + r_end * np.sin(a) * end_t])
        tangent = np.vstack([tangent, end_t])
        r_lat = np.r_[r_lat, r_end * np.cos(a)]
        r_sag = np.r_[r_sag, r_end * spec['flat'] * np.cos(a)]
        s_all = np.r_[s_all, seg[-1] + r_end * np.sin(a)]
    theta = 2 * np.pi * np.arange(sides) / sides
    lateral = np.array([1., 0., 0.])
    pos, param = [], []
    for k in range(len(centre)):
        sag = np.cross(tangent[k], lateral)
        sag /= np.linalg.norm(sag)
        pos.append(centre[k] + np.outer(r_lat[k] * np.cos(theta), lateral) + np.outer(r_sag[k] * np.sin(theta), sag))
        param.append(np.stack([np.full(sides, s_all[k] / s_all[-1]), theta / (2 * np.pi)], axis=1))
    pos.append((end + r_end * end_t)[None])
    param.append([[1., .5]])
    pos, param = np.vstack(pos), np.vstack(param)
    rings = len(centre)
    tris = []
    for k in range(rings - 1):
        for j in range(sides):
            a, b = k * sides + j, k * sides + (j + 1) % sides
            tris += [(a, a + sides, b), (b, a + sides, b + sides)]
    for j in range(sides):
        tris.append(((rings - 1) * sides + j, rings * sides, (rings - 1) * sides + (j + 1) % sides))
    tris = np.array(tris)
    outward = np.vstack([(pos[:-1].reshape(rings, sides, 3) - centre[:, None]).reshape(-1, 3), pos[-1:] - centre[-1:]])
    cross = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    if (cross * outward[tris].mean(axis=1)).sum(axis=1).mean() < 0:
        tris = tris[:, [0, 2, 1]]
    return pos, param, tris, {'ringS': np.r_[np.repeat(s_all, sides), s_all[-1] + r_end], 'dockEnd': s_fil[-1],
                              'centre': centre, 'radius': np.maximum(r_lat, r_sag), 'stations': rings}


def _closed_loft(centre, frame_a, frame_b, r_a, r_b, sides, theta0, apex_start, apex_end):
    """A closed tube of `sides`-gon rings, each end closed by a fan to an apex.

    Returns (positions, ring parameter, triangles); vertex 0 is the start apex,
    the last vertex the end apex, rings run between them. Wound outwards."""
    theta = theta0 + 2 * np.pi * np.arange(sides) / sides
    rings = len(centre)
    ring_pos = (centre[:, None] + r_a[:, None, None] * np.cos(theta)[None, :, None] * frame_a[:, None]
                + r_b[:, None, None] * np.sin(theta)[None, :, None] * frame_b[:, None])
    pos = np.vstack([apex_start[None], ring_pos.reshape(-1, 3), apex_end[None]])
    tris = []
    for j in range(sides):
        tris.append((0, 1 + (j + 1) % sides, 1 + j))
    for k in range(rings - 1):
        for j in range(sides):
            a, b = 1 + k * sides + j, 1 + k * sides + (j + 1) % sides
            tris += [(a, b, a + sides), (b, b + sides, a + sides)]
    last = 1 + rings * sides
    for j in range(sides):
        tris.append((1 + (rings - 1) * sides + j, 1 + (rings - 1) * sides + (j + 1) % sides, last))
    tris = np.array(tris)
    mid = np.vstack([centre[:1], centre, centre[-1:]])
    owner = np.r_[0, 1 + np.repeat(np.arange(rings), sides), rings + 1]
    cross = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    outward = pos[tris].mean(axis=1) - mid[owner[tris]].mean(axis=1)
    if (cross * outward).sum(axis=1).mean() < 0:
        tris = tris[:, [0, 2, 1]]
    return pos, theta, tris


def _horse_tail_bundle(spec, p0, n0, bow):
    """The dock (ring 0 its foot, closed by an apex inside the hair) followed
    by the hair as separately lofted locks; same return shape as _horse_tail,
    with the dock's vertex count in info['dockVertices']."""
    line, seg, dock_len = _horse_tail_line(spec, p0, n0, bow)
    L = spec['locks']
    sides = spec['sides']
    lateral = np.array([1., 0., 0.])
    at = lambda s_: np.stack([np.interp(s_, seg, line[:, k]) for k in range(3)], axis=-1)
    grad = np.stack([np.gradient(line[:, k], seg) for k in range(3)], axis=1)
    def tangent_at(s_):
        t_ = np.stack([np.interp(s_, seg, grad[:, k]) for k in range(3)], axis=-1)
        return t_ / np.linalg.norm(t_, axis=-1, keepdims=True)
    # The bend's end along the line: where the heading first reaches the hang.
    psi0 = min(np.arctan2(n0[1], n0[2]), np.radians(spec.get('rise', 90.)))
    h0 = np.radians(-90. + bow * (spec['hang'][0] + 90.))
    s_bend0 = dock_len + spec['stalk']
    s_bend1 = s_bend0 + max(psi0 - h0, 0.) * spec['bend']
    # 1. The dock: the blended foot, rings through the bend, a short taper.
    s_fil, r_fil = _dock_profile(spec['dock'], spec['radius'][0][1])
    r0 = spec['radius'][0][1]
    nb = L['dockBend']
    s_bend = s_bend0 + (s_bend1 - s_bend0) * np.arange(1, nb + 1) / nb
    s_run = s_bend1 + L['dockRun']
    s_dock = np.r_[s_fil, s_bend, s_run]
    r_dock = np.r_[r_fil, np.full(nb, r0), L['dockEnd']]
    centre = at(s_dock)
    tangent = tangent_at(s_dock)
    theta = 2 * np.pi * np.arange(sides) / sides
    pos, param = [], []
    for k in range(len(centre)):
        sag = np.cross(tangent[k], lateral)
        sag /= np.linalg.norm(sag)
        pos.append(centre[k] + np.outer(r_dock[k] * np.cos(theta), lateral) + np.outer(r_dock[k] * np.sin(theta), sag))
        param.append(np.stack([np.full(sides, s_dock[k] / s_run), theta / (2 * np.pi)], axis=1))
    apex = centre[-1] + L['dockCap'] * tangent[-1]
    pos.append(apex[None])
    param.append([[1., .5]])
    pos, param = np.vstack(pos), np.vstack(param)
    rings = len(centre)
    tris = []
    for k in range(rings - 1):
        for j in range(sides):
            a, b = k * sides + j, k * sides + (j + 1) % sides
            tris += [(a, a + sides, b), (b, a + sides, b + sides)]
    for j in range(sides):
        tris.append(((rings - 1) * sides + j, rings * sides, (rings - 1) * sides + (j + 1) % sides))
    tris = np.array(tris)
    outward = np.vstack([(pos[:-1].reshape(rings, sides, 3) - centre[:, None]).reshape(-1, 3), pos[-1:] - centre[-1:]])
    cross = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    if (cross * outward[tris].mean(axis=1)).sum(axis=1).mean() < 0:
        tris = tris[:, [0, 2, 1]]
    ring_s = np.r_[np.repeat(s_dock, sides), s_run + L['dockCap']]
    n_dock = len(pos)
    # 2. The hair: locks over hair fraction u in [0, 1], from `start` before
    # the bend's end down to the tip height.
    s_h0, s_h1 = s_bend1 + L['start'], seg[-1]
    hair = s_h1 - s_h0
    spread_u, spread_r = np.array(L['spread']).T
    rad_v, rad_r = np.array(L['radius']).T
    wave_a, wave_f = L['wave']
    locks = [(np.radians(L['phase'] + 360. * i / len(L['length'])), L['length'][i], L['scale'][i], 1., L['stations'], i)
             for i in range(len(L['length']))]
    core = L['core']
    locks.append((0., core['length'], core['scale'], 0., core['stations'], len(locks)))
    lock_pos, lock_param, lock_tris, lock_s, lock_axes = [pos], [param], [tris], [ring_s], []
    count = n_dock
    for phi, length, scale, outer, stations, idx in locks:
        v = np.array(stations, float)
        u = v * length
        s_l = s_h0 + u * hair
        c_line, t_line = at(s_l), tangent_at(s_l)
        sag = np.cross(t_line, lateral)
        sag /= np.linalg.norm(sag, axis=1, keepdims=True)
        ang = phi + np.radians(L['twist']) * u
        rho = outer * np.interp(u, spread_u, spread_r)
        wave = outer * wave_a * u * np.sin(2 * np.pi * wave_f * u + 1.7 * idx)
        off_lat = rho * np.cos(ang) + wave * np.cos(ang + np.pi / 2)
        off_sag = L['sagScale'] * (rho * np.sin(ang) + wave * np.sin(ang + np.pi / 2))
        c = c_line + off_lat[:, None] * lateral + off_sag[:, None] * sag
        # The lock's own tangent, from its centre line; its frame is the
        # lateral axis made orthogonal to it.
        t_l = np.gradient(c, s_l, axis=0)
        t_l /= np.linalg.norm(t_l, axis=1, keepdims=True)
        fa = lateral - (t_l @ lateral)[:, None] * t_l
        fa /= np.linalg.norm(fa, axis=1, keepdims=True)
        fb = np.cross(t_l, fa)
        r = scale * np.interp(v, rad_v, rad_r)
        tip_v = 1.
        tip_c = at(np.array([s_h0 + tip_v * length * hair]))[0]
        # The apex continues the lock's last direction to its full length.
        end = c[-1] + t_l[-1] * np.linalg.norm(tip_c - c_line[-1])
        start = c[0] - t_l[0] * r[0] * .6
        lp, th, lt = _closed_loft(c, fa, fb, r, r, L['sides'], phi, start, end)
        lock_pos.append(lp)
        lock_param.append(np.c_[np.r_[u[0], np.repeat(u, L['sides']), length], np.r_[.5, np.tile(th / (2 * np.pi) % 1, len(u)), .5]])
        lock_tris.append(lt + count)
        lock_s.append(np.r_[s_l[0], np.repeat(s_l, L['sides']), s_h0 + length * hair])
        lock_axes.append((c, r))
        count += len(lp)
    pos, param = np.vstack(lock_pos), np.vstack(lock_param)
    tris = np.vstack(lock_tris)
    # The dock's taper and cap sit inside the hair: every dock vertex past the
    # hair's start lies within some lock.
    hidden = ring_s > s_run - 1e-9
    inside = np.zeros(int(hidden.sum()), bool)
    q = pos[:n_dock][hidden]
    for c, r in lock_axes:
        # Each lock's axis, densely resampled between its stations.
        f = np.linspace(0, len(c) - 1, 40 * len(c))
        cc = np.stack([np.interp(f, np.arange(len(c)), c[:, k]) for k in range(3)], axis=1)
        rr = np.interp(f, np.arange(len(c)), r) * np.cos(np.pi / L['sides'])
        d = np.linalg.norm(q[:, None] - cc[None], axis=2)
        inside |= (d < rr[None]).any(axis=1)
    radius = np.r_[np.full(n_dock, r0)]
    return pos, param, tris, {'ringS': np.concatenate(lock_s), 'dockEnd': s_fil[-1], 'centre': centre,
                              'radius': radius, 'stations': rings, 'dockVertices': n_dock,
                              'locks': len(locks), 'dockHidden': [int(inside.sum()), int(hidden.sum())]}


def rebuild_hindquarters(blob, doc, base, spec):
    prims = [prim for mesh in doc['meshes'] for prim in mesh['primitives']]
    assert len(prims) == 1, 'hindquarters rebuild expects one primitive'
    prim = prims[0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    assert set(prim['attributes']) == set(names)
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    src = doc['accessors'][prim['attributes']['POSITION']]
    tspec, bspec = spec['tail'], spec['body']
    # 1. The plate, grown from its tip over vertices past the cut plane.
    edges = _edges(F)
    past = P[:, 2] > tspec['cut']
    plate = (P[:, 2] > tspec['seed'][0]) & (P[:, 1] < tspec['seed'][1])
    while True:
        grow = np.zeros_like(plate)
        grow[edges[:, 1][plate[edges[:, 0]]]] = True
        grow[edges[:, 0][plate[edges[:, 1]]]] = True
        grow &= past
        if not (grow & ~plate).any():
            break
        plate |= grow
    assert 150 < plate.sum() < 260 and P[plate, 1].min() > .15, ('plate segmentation', int(plate.sum()))
    target_z = float(P[plate, 2].max())
    assert abs(target_z - src['max'][2]) < 1e-6, 'the plate no longer holds the length extreme'
    # 2. The body volume, plate clipped, blurred.
    step, sigma, iso = bspec['voxel'], bspec['sigma'], bspec['iso']
    pad = 4 * sigma + 2 * step
    lo = P.min(axis=0) - pad + step * np.array([.2371, .3119, .4127])  # off-lattice
    shape = tuple(int(np.ceil(s)) for s in (P.max(axis=0) + pad - lo) / step)
    occ = _occupancy(P, F, lo, step, shape)
    gx, gy, gz = [lo[k] + (np.arange(shape[k]) + .5) * step for k in range(3)]
    occ *= ~((gy[None, :, None] > bspec['clipY']) & (gz[None, None, :] > tspec['cut'] + bspec['clipMargin']))
    field = _blur3(occ, sigma / step)
    rump_report = None
    if spec.get('rump'):
        # Round 5: behind the barrel the field is the authored solid.
        field, rump_report = _rump_field(field, lo, step, iso, spec['rump'])
    grad = np.stack(np.gradient(field, step), axis=-1)
    # 3. Hindquarters onto the level set.
    ramp = lambda v, a, b: _smoothstep(a, b, v)
    w = ramp(P[:, 2], *bspec['z']) * ramp(P[:, 1], *bspec['y'])
    w[plate] = 0
    q, residual = _iso_project(field, grad, lo, step, iso, P)
    w[residual > .02] = 0
    original = P.copy()
    P = P + w[:, None] * (q - P)
    old_cross = np.cross(original[F[:, 1]] - original[F[:, 0]], original[F[:, 2]] - original[F[:, 0]])
    for attempt in range(24):
        new_cross = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
        flipped = ((old_cross * new_cross).sum(axis=1) < 0) & ~plate[F].all(axis=1)
        if not flipped.any():
            break
        moved = np.unique(F[flipped])
        P[moved] = original[moved] + (.5 if attempt < 23 else 0) * (P[moved] - original[moved])
    g = _trilinear(grad, lo, step, P)
    field_n = -g / np.maximum(np.linalg.norm(g, axis=1), 1e-12)[:, None]
    core = (w > .5) & ~plate
    body_report = {'movedVertices': int((np.linalg.norm(P - original, axis=1) > 1e-8).sum()),
                   'maxDisplacement': round(float(np.linalg.norm(P - original, axis=1).max()), 4),
                   'dihedralP90P99': [np.percentile(_dihedrals(q_, F, core), (90, 99)).round(1).tolist() for q_ in (original, P)]}
    # 4. The tail's root: a sagittal ray from inside the rump to the level set.
    a = np.radians(tspec['elevation'])
    ray = np.array([0., np.sin(a), np.cos(a)])
    t = np.arange(0, .3, step / 2)
    samples = np.array(tspec['rootFrom'])[None] + t[:, None] * ray
    inside = _trilinear(field, lo, step, samples) > iso
    assert inside[0] and not inside.all(), 'root ray does not cross the rump'
    k = int(np.argmin(inside))
    ta, tb = t[k - 1], t[k]
    for _ in range(40):
        m = .5 * (ta + tb)
        ta, tb = (m, tb) if _trilinear(field, lo, step, (np.array(tspec['rootFrom']) + m * ray)[None])[0] > iso else (ta, m)
    p0 = np.array(tspec['rootFrom']) + .5 * (ta + tb) * ray
    g0 = _trilinear(grad, lo, step, p0[None])[0]
    n0 = np.array([0., -g0[1], -g0[2]])
    n0 /= np.linalg.norm(n0)
    # 5. Cut: the plate and an elliptical region about the root in its
    # tangent plane, wide enough laterally to take in the plate's bridge.
    e1 = np.array([1., 0., 0.])
    e2 = np.cross(n0, e1)
    pos = P[inverse]
    rel = P - p0
    cap = spec.get('cap')
    if cap:
        # Round 5: the whole rear cap goes, the root's region with it.
        floor = np.interp(np.abs(P[:, 0]), *np.array(cap['y']).T)
        region = plate | ((P[:, 2] > cap['z']) & (P[:, 1] > floor))
    else:
        (ru, rv), rh = tspec['hole']
        region = plate | (((rel @ e1) / ru) ** 2 + ((rel @ e2) / rv) ** 2 < 1) & (np.abs(rel @ n0) < rh)
    # One ring wider, so the edge left by the plate's bridge is not ragged.
    for _ in range(tspec.get('holeDilate', 1)):
        grown = region.copy()
        grown[edges[:, 1][region[edges[:, 0]]]] = True
        grown[edges[:, 0][region[edges[:, 1]]]] = True
        region = grown
    drop = region[F].all(axis=1)
    kept_faces, kept_welded = faces[~drop], F[~drop]
    directed = kept_welded[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    present = set(map(tuple, directed.tolist()))
    border = [(a_, b_) for a_, b_ in directed.tolist() if (b_, a_) not in present]
    following = dict(border)
    assert len(following) == len(border), 'hole boundary is not a simple loop'
    loop = [border[0][0]]
    while following[loop[-1]] != loop[0]:
        loop.append(following[loop[-1]])
    if len(loop) != len(border):
        rest = sorted(set(a_ for a_, _ in border) - set(loop))
        raise AssertionError(f'hole has more than one boundary loop: root {p0.round(3)}, loop {P[loop].min(0).round(3)}..{P[loop].max(0).round(3)}, other {P[rest].min(0).round(3)}..{P[rest].max(0).round(3)}')
    loop = np.array(loop)
    kept = np.unique(kept_faces)
    remap = np.full(len(pos), -1)
    remap[kept] = np.arange(len(kept))
    rep = np.full(len(P), -1)
    rep[F[~drop].ravel()] = faces[~drop].ravel()
    if cap:
        # The cut edge of a hole this size zigzags where the generator's long
        # triangles cross the cut; a spike in it folds the fill's first strip.
        # The edge is smoothed along itself on the level set, and any vertex
        # whose retained faces would flip is eased back.
        # The retained croup in front of the edge (generator triangles carried
        # onto the solid) is evened the same way, by Laplacian steps over the
        # retained mesh, each carried back onto the level set.
        band_z, band_y, band_n = cap['fairBand']
        used_v = np.unique(kept_welded)
        band = np.zeros(len(P), bool)
        band[used_v] = (P[used_v, 2] > cap['z'] - band_z) & (P[used_v, 1] > band_y)
        band[loop] = False
        ring_faces = kept_welded[np.isin(kept_welded, np.r_[loop, np.flatnonzero(band)]).any(axis=1)]
        before = P.copy()
        c0 = np.cross(before[ring_faces[:, 1]] - before[ring_faces[:, 0]], before[ring_faces[:, 2]] - before[ring_faces[:, 0]])
        k_edges = _edges(kept_welded)
        k_deg = np.bincount(k_edges.ravel(), minlength=len(P))
        for _ in range(band_n):
            total = np.zeros_like(P)
            np.add.at(total, k_edges[:, 0], P[k_edges[:, 1]])
            np.add.at(total, k_edges[:, 1], P[k_edges[:, 0]])
            target = P[band] + .5 * (total[band] / np.maximum(k_deg[band], 1)[:, None] - P[band])
            P[band] = _iso_project(field, grad, lo, step, iso, target)[0]
        for _ in range(cap.get('edgeSmooth', 6)):
            E = P[loop]
            P[loop] = _iso_project(field, grad, lo, step, iso, E + .5 * (.5 * (np.roll(E, 1, axis=0) + np.roll(E, -1, axis=0)) - E))[0]
        loop_band = np.r_[loop, np.flatnonzero(band)]
        for attempt in range(24):
            c1 = np.cross(P[ring_faces[:, 1]] - P[ring_faces[:, 0]], P[ring_faces[:, 2]] - P[ring_faces[:, 0]])
            flipped = (c0 * c1).sum(axis=1) <= 0
            if not flipped.any():
                break
            moved = np.intersect1d(np.unique(ring_faces[flipped]), loop_band)
            P[moved] = before[moved] + (.5 if attempt < 23 else 0) * (P[moved] - before[moved])
        g_l = _trilinear(grad, lo, step, P[loop_band])
        field_n[loop_band] = -g_l / np.maximum(np.linalg.norm(g_l, axis=1), 1e-12)[:, None]
        pos = P[inverse]
    B = P[loop]
    n_b = len(loop)
    # Polar angle about the root in its tangent plane, the hole loop's way round.
    # The hole's edge is ragged where the plate's bridge was (not star-shaped
    # about the root), so the fill rings are placed by arc-length fraction
    # along it, the loop's own way round, and blended to the foot ring.
    if cap:
        # Directions from the cap centre, as angles about its axis to the root.
        c_cap = np.array(cap['centre'], 'f8')
        cap_axis = (p0 - c_cap) / np.linalg.norm(p0 - c_cap)
        f1 = np.array([1., 0., 0.])
        f2 = np.cross(cap_axis, f1)
        unit = lambda q_: (q_ - c_cap) / np.linalg.norm(q_ - c_cap, axis=1, keepdims=True)
        polar = lambda q_: np.arctan2(unit(q_) @ f2, unit(q_) @ f1)
        b2 = np.stack([unit(B) @ f1, unit(B) @ f2], axis=1)
    else:
        polar = lambda q_: np.arctan2((q_ - p0) @ e2, (q_ - p0) @ e1)
        b2 = np.stack([(B - p0) @ e1, (B - p0) @ e2], axis=1)
    sense = np.sign(np.sum(b2[:, 0] * np.roll(b2[:, 1], -1) - np.roll(b2[:, 0], -1) * b2[:, 1]))
    seglen = np.linalg.norm(np.diff(np.r_[B, B[:1]], axis=0), axis=1)
    s_b = np.r_[0, np.cumsum(seglen)[:-1]] / seglen.sum()
    ang_start = float(polar(B[:1])[0])
    frac = lambda a_: ((sense * (a_ - ang_start)) % (2 * np.pi)) / (2 * np.pi)
    if cap:
        # The edge's angle about the axis, unwrapped the loop's way round;
        # where the cut edge zigzags (a vertex a little behind its
        # predecessor in angle) the fraction is held monotone and mixed with
        # the arc-length fraction so it rises strictly.
        turn = sense * (np.unwrap(polar(B)) - ang_start) / (2 * np.pi)
        assert abs(sense * (np.unwrap(np.r_[polar(B), polar(B[:1])])[-1] - ang_start) / (2 * np.pi) - 1) < .02, 'cap edge does not turn once about the root axis'
        s_b = .85 * np.minimum(np.maximum.accumulate(turn), 1 - 1e-3) + .15 * s_b
        assert (np.diff(s_b) > 0).all() and s_b[-1] < 1, 'cap edge is not star-shaped about the root axis'
    # 6. The tail; its rearward bow is solved so its rearmost point lands on
    # the length extreme.
    def build(bow):
        maker = _horse_tail_lobed if tspec.get('lobed') else _horse_tail_bundle if tspec.get('locks') else _horse_tail
        out = maker(tspec, p0, n0, bow)
        return out, float(out[0][:, 2].max())
    lo_s, hi_s = 0., 1.
    assert build(lo_s)[1] < target_z, f'tail passes the length extreme hanging plumb ({build(lo_s)[1]:.4f})'
    assert build(hi_s)[1] > target_z, f'tail cannot reach the length extreme ({build(hi_s)[1]:.4f})'
    for _ in range(48):
        mid = .5 * (lo_s + hi_s)
        lo_s, hi_s = (mid, hi_s) if build(mid)[1] < target_z else (lo_s, mid)
    (tail_pos, tail_param, tail_tris, tinfo), _ = build(lo_s)
    assert not (cap and tspec.get('locks')), 'the cap fill expects a tail welded at its foot'
    if 'dockHidden' in tinfo:
        assert tinfo['dockHidden'][0] == tinfo['dockHidden'][1], f"dock cap shows through the hair: {tinfo['dockHidden']}"
    n_dock = tinfo.get('dockVertices', len(tail_pos))
    rear = int(np.argmax(tail_pos[:, 2]))
    # The heading is integrated in 1 mm steps, so the solve lands within a
    # fraction of a millimetre; the rearmost vertex is then set exactly.
    assert 0 <= target_z - tail_pos[rear, 2] < 3e-4, target_z - tail_pos[rear, 2]
    tail_pos[rear, 2] = target_z
    sides = tspec['sides']
    # The foot ring lies on the rebuilt rump.
    tail_pos[:sides], foot_res = _iso_project(field, grad, lo, step, iso, tail_pos[:sides])
    assert foot_res.max() < .02, 'tail foot ring is off the level set'
    ang_0 = polar(tail_pos[:sides])
    if np.sign(np.angle(np.exp(1j * np.diff(ang_0))).sum()) != sense:
        # Run the tail's rings the hole's way round: mirror theta.
        order = np.r_[0, np.arange(sides - 1, 0, -1)]
        perm = np.r_[(np.arange(n_dock - 1).reshape(-1, sides)[:, order]).ravel(), np.arange(n_dock - 1, len(tail_pos))]
        back = np.argsort(perm)
        tail_pos, tail_param = tail_pos[perm], tail_param[perm]
        tail_tris = back[tail_tris]
        ang_0 = polar(tail_pos[:sides])
    # 7. Fill rings between the hole's edge and the foot ring, on the level set.
    counts = tspec['fillCounts']
    if cap:
        counts = tuple(int(round(n_b + (sides - n_b) * (k + 1) / (cap['rings'] + 1))) for k in range(cap['rings']))
    s_0 = frac(ang_0)
    order0 = np.argsort(s_0)
    def along(s_, pts, f):  # a closed loop, interpolated at fractions f
        s_ext, p_ext = np.r_[s_ - 1, s_, s_ + 1], np.vstack([pts, pts, pts])
        return np.stack([np.interp(f, s_ext, p_ext[:, k]) for k in range(3)], axis=1)
    patch, s_rings = [B.copy()], [s_b]
    for k, count in enumerate(counts):
        tt = 1 - (k + 1) / (len(counts) + 1)
        f = (np.arange(count) + .5) / count
        if cap:
            d = tt * unit(along(s_b, B, f)) + (1 - tt) * unit(along(s_0[order0], tail_pos[:sides][order0], f))
            ring = _ray_iso(field, lo, step, iso, c_cap, d / np.linalg.norm(d, axis=1, keepdims=True))
        else:
            ring = tt * along(s_b, B, f) + (1 - tt) * along(s_0[order0], tail_pos[:sides][order0], f)
        ring, res = _iso_project(field, grad, lo, step, iso, ring)
        assert res.max() < .02, 'fill ring is off the level set'
        patch.append(ring)
        s_rings.append(f)
    patch.append(tail_pos[:sides].copy())
    s_rings.append(s_0)
    fill_pos = np.vstack(patch)
    n_fill = len(fill_pos)
    starts = np.cumsum([0] + [len(q_) for q_ in patch])
    ring_idx = [np.arange(starts[k], starts[k + 1]) for k in range(len(patch))]
    fill_tris = []
    for k in range(len(ring_idx) - 1):
        fill_tris += _zipper(ring_idx[k], s_rings[k], ring_idx[k + 1], s_rings[k + 1])
    fill_tris = np.array(fill_tris)
    # Rings interpolated across the croup's corner bunch where the chord cuts
    # inside it; relax the inner rings over the level set to even them out.
    inner = np.zeros(n_fill, bool)
    inner[n_b:n_fill - sides] = True
    fill_edges = _edges(fill_tris)
    for _ in range(tspec.get('fillRelax', 40)):
        fill_pos = _relax(fill_pos, fill_edges, ~inner, 1, step=.5)
        fill_pos[inner] = _iso_project(field, grad, lo, step, iso, fill_pos[inner])[0]
    assert _iso_project(field, grad, lo, step, iso, fill_pos[inner])[1].max() < .02
    patch_pos = np.vstack([fill_pos, tail_pos])
    patch_tris = np.vstack([fill_tris, tail_tris + n_fill])
    foot = np.arange(n_fill - sides, n_fill)
    fn = np.cross(fill_pos[fill_tris[:, 1]] - fill_pos[fill_tris[:, 0]], fill_pos[fill_tris[:, 2]] - fill_pos[fill_tris[:, 0]])
    fg = _trilinear(grad, lo, step, fill_pos[fill_tris].mean(axis=1))
    facing = (fn * -fg).sum(axis=1) / np.maximum(np.linalg.norm(fn, axis=1) * np.linalg.norm(fg, axis=1), 1e-20)
    assert (facing > 0).all(), f'fill face does not face out of the rump ({int((facing <= 0).sum())} of {len(facing)})'
    # UVs: the fill in a coat square, the tail in the plate's own hair chart.
    (fill_c, fill_h), (tail_c, tail_h) = spec['uvIslands']['fill'], spec['uvIslands']['tail']
    q2 = np.stack([(fill_pos - p0) @ e1, (fill_pos - p0) @ e2], axis=1)
    patch_uv = np.vstack([np.array(fill_c) + .9 * fill_h * q2 / np.abs(q2).max(),
                          np.array(tail_c) + .9 * tail_h * np.c_[np.cos(2 * np.pi * tail_param[:, 1]), 2 * tail_param[:, 0] - 1]])
    # Skin: the edge keeps its own; the tail moves with the croup round its
    # root; the fill blends harmonically between them.
    joints_src, weights_src = attrs['JOINTS_0'], attrs['WEIGHTS_0'].astype('f8')
    n_joints = len(doc['skins'][0]['joints'])
    dense = np.zeros((n_b, n_joints))
    rows = rep[loop]
    for c in range(4):
        np.add.at(dense, (np.arange(n_b), joints_src[rows, c].astype('i8')), weights_src[rows, c])
    d = np.linalg.norm(B - p0, axis=1)
    root_skin = (dense / d[:, None] ** 2).sum(axis=0) / (1 / d ** 2).sum()
    held = np.zeros(len(patch_pos), bool)
    held[:n_b] = True
    held[foot[0]:] = True
    skin = np.zeros((len(patch_pos), n_joints))
    skin[:n_b] = dense
    skin[foot[0]:] = root_skin
    skin = _relax(skin, _edges(fill_tris), held, 600)
    if cap:
        # The fill takes the deleted rump's own skin (inverse distance over
        # its nearest deleted vertices, plate excluded), the tail the skin
        # nearest its root; a short relaxation evens the blend.
        gone = np.zeros(len(P), bool)
        gone[F[drop].ravel()] = True
        gone[F[~drop].ravel()] = False
        gone &= ~plate
        G = np.flatnonzero(gone)
        dense_g = np.zeros((len(G), n_joints))
        for c in range(4):
            np.add.at(dense_g, (np.arange(len(G)), joints_src[first[G], c].astype('i8')), weights_src[first[G], c])
        def idw(q_, k_):
            d_ = np.linalg.norm(q_[:, None] - P[G][None], axis=2)
            nn = np.argsort(d_, axis=1)[:, :k_]
            wgt = 1 / np.maximum(np.take_along_axis(d_, nn, axis=1), 1e-4) ** 2
            return (dense_g[nn] * wgt[:, :, None]).sum(axis=1) / wgt.sum(axis=1, keepdims=True)
        skin[n_b:foot[0]] = idw(fill_pos[n_b:foot[0]], cap['skinNearest'])
        root_skin = idw(p0[None], 8)[0]
        skin[foot[0]:] = root_skin
        skin = _relax(skin, _edges(fill_tris), held, 30)
    top = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top[top_w == 0] = 0
    n_kept = len(kept)
    all_pos = np.vstack([pos[kept], patch_pos])
    all_faces = np.vstack([remap[kept_faces], patch_tris + n_kept])
    w_first, w_inverse = _weld(all_pos)
    W = all_pos[w_first]
    wf = w_inverse[all_faces]
    dd = wf[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    _, use = np.unique(np.sort(dd, axis=1), axis=0, return_counts=True)
    assert (use == 2).all(), 'rebuilt mesh is not closed'
    assert len(np.unique(dd, axis=0)) == len(dd), 'rebuilt mesh winding is inconsistent'
    # Clearance: past its dock the tail stands off the body.
    body_faces = wf[:len(kept_faces) + len(fill_tris)]
    near_rear = (W[body_faces][:, :, 2].max(axis=1) > .25)
    cloud = _surface_samples(W, body_faces[near_rear])
    standing = tinfo['ringS'] > tinfo['dockEnd'] + .03
    stand_off = _nearest(tail_pos[standing], cloud)
    assert stand_off.min() > tspec['clearance'], f'tail too near the body: {stand_off.min():.4f}'
    centre, radius = tinfo['centre'], tinfo['radius']
    # Normals: the level set's gradient on the rebuilt rump and fill; the
    # welded surface's own smooth normals on the tail; elsewhere faired.
    smooth = _smooth_normals(W, wf)[w_inverse]
    kept_w = inverse[kept]
    wn = w[kept_w][:, None]
    blended = wn * field_n[kept_w] + (1 - wn) * attrs['NORMAL'][kept].astype('f8')
    fill_g = _trilinear(grad, lo, step, fill_pos)
    all_nor = np.vstack([blended, -fill_g, smooth[n_kept + n_fill:]])
    all_nor[n_kept + n_fill:n_kept + n_fill + sides] = -fill_g[-sides:]
    if cap:
        # Where the authored solid is blended in, the field's gradient carries
        # the blend's own slope (shading dents the clay pass does not show):
        # the cap, the foot and the retained rump there take the welded
        # surface's smooth normals.
        bz, by = spec['rump']['blendZ'][0], spec['rump']['blendY'][0]
        zone = ((P[kept_w, 2] > bz) & (P[kept_w, 1] > by))[:, None] * wn
        all_nor[:n_kept] = zone * smooth[:n_kept] + (1 - zone) * all_nor[:n_kept]
        all_nor[n_kept:n_kept + n_fill + sides] = smooth[n_kept:n_kept + n_fill + sides]
    all_nor /= np.maximum(np.linalg.norm(all_nor, axis=1), 1e-12)[:, None]
    # Width: the haunches hold the lateral extremes and the level set rounds
    # them in by a few millimetres. Each side of the hindquarters is widened
    # by the factor that restores its extreme, faded by the same ramps, so
    # the envelope keeps its width (a smooth warp over fill and tail too).
    wq = ramp(all_pos[:, 2], *bspec['z']) * ramp(all_pos[:, 1], *bspec['y'])
    width_scale = []
    for side, bound in ((1, src['max'][0]), (-1, src['min'][0])):
        sel = np.sign(all_pos[:, 0]) == side
        reach = lambda k_: float(np.max(side * all_pos[sel, 0] * (1 + (k_ - 1) * wq[sel])))
        k_lo, k_hi = 1., 1.1
        if reach(k_lo) >= side * bound:
            k_hi = 1.
        else:
            assert reach(k_hi) > side * bound, 'hindquarters cannot be widened to the width extreme'
            for _ in range(60):
                k_mid = .5 * (k_lo + k_hi)
                k_lo, k_hi = (k_mid, k_hi) if reach(k_mid) < side * bound else (k_lo, k_mid)
            all_pos[sel, 0] *= 1 + (k_hi - 1) * wq[sel]
        width_scale.append(round(k_hi, 4))
    new = {
        'POSITION': all_pos.astype('<f4'),
        'NORMAL': all_nor.astype('<f4'),
        'TEXCOORD_0': np.vstack([attrs['TEXCOORD_0'][kept], patch_uv]).astype('<f4'),
        'JOINTS_0': np.vstack([joints_src[kept], top]).astype(joints_src.dtype),
        'WEIGHTS_0': np.vstack([attrs['WEIGHTS_0'][kept], top_w]).astype(attrs['WEIGHTS_0'].dtype),
    }
    for k in names[2:]:
        assert np.array_equal(new[k][:n_kept], attrs[k][kept]), f'retained {k} changed'
    lo_b, hi_b = new['POSITION'].min(axis=0), new['POSITION'].max(axis=0)
    # Length and height are exact (length sets the normalize scale); the
    # width may move inside the manifest's tolerance (+-2 mm of source).
    assert np.allclose(lo_b[1:], src['min'][1:], atol=1e-7) and np.allclose(hi_b[1:], src['max'][1:], atol=1e-7), (lo_b, hi_b)
    assert np.allclose(lo_b[0], src['min'][0], atol=2e-3) and np.allclose(hi_b[0], src['max'][0], atol=2e-3), (lo_b, hi_b)
    indices = all_faces.astype('<u2' if len(all_pos) < 65535 else '<u4').ravel()
    out = json.loads(json.dumps(doc))
    payload = {prim['attributes'][k]: new[k].tobytes() for k in names}
    payload[prim['indices']] = indices.tobytes()
    by_view = {}
    for index, data in payload.items():
        acc = out['accessors'][index]
        assert acc.get('byteOffset', 0) == 0
        acc['count'] = len(indices) if index == prim['indices'] else len(all_pos)
        by_view[acc['bufferView']] = data
    acc = out['accessors'][prim['attributes']['POSITION']]
    acc['min'], acc['max'] = [float(x) for x in lo_b], [float(x) for x in hi_b]
    if len(all_pos) >= 65535:
        out['accessors'][prim['indices']]['componentType'] = 5125
    binary = bytearray()
    for vi, view in enumerate(out['bufferViews']):
        data = by_view.get(vi)
        if data is None:
            start = base + doc['bufferViews'][vi].get('byteOffset', 0)
            data = bytes(blob[start:start + view['byteLength']])
        binary += b'\0' * (-len(binary) % 4)
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(data)
        view.pop('byteStride', None) if vi in by_view else None
        binary += data
    binary += b'\0' * (-len(binary) % 4)
    out['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(out, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    glb = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(binary))
           + struct.pack('<II', len(text), 0x4E4F534A) + text
           + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))
    for key in ('nodes', 'skins', 'materials', 'textures', 'images', 'samplers', 'scenes', 'animations'):
        assert out.get(key) == doc.get(key), key
    return glb, {
        'removedTriangles': int(drop.sum()), 'removedVertices': int(len(pos) - n_kept),
        'plateVertices': int(plate.sum()),
        'fillTriangles': int(len(fill_tris)), 'fillVertices': int(n_fill),
        'tailTriangles': int(len(tail_tris)), 'tailVertices': int(len(tail_pos)),
        'vertices': int(len(all_pos)), 'triangles': int(len(all_faces)),
        'holeLoop': int(n_b), 'tailRoot': [round(float(x), 4) for x in p0],
        'tail': {'bow': round(float(lo_s), 4), 'stations': int(tinfo['stations']),
                 **({'locks': tinfo['locks'], 'dockVertices': int(n_dock)} if 'locks' in tinfo else {})},
        'tailStandOff': round(float(stand_off.min()), 4),
        'widthChange': [round(float(lo_b[0] - src['min'][0]), 5), round(float(hi_b[0] - src['max'][0]), 5)],
        'widthScale': width_scale,
        'body': body_report,
        **({'cap': {'edge': int(n_b), 'rings': list(counts), 'rump': rump_report}} if cap else {}),
    }


# The horse's mane, rebuilt after the hindquarters (2026-11-05). The generator
# mane is a crest strip with five separate tuft lobes; from above they read as
# a stack of discs. Every face of the crest above a cut line (`cut`, held just
# under the lowest tuft vertex) between the poll and the withers is deleted,
# the hole is closed by rings carried onto a reference neck section, and one
# continuous lofted mane shell is laid over it: a ridge over the crest that
# falls to both sides as a hanging drape whose hem covers the cut, with a
# pointed, back-raked tuft scallop in the hem (the two sides out of phase so
# the tufts overlap). Reference sections are traced per station by rays from
# a point inside the neck; where a ray leaves through the hole the section is
# interpolated to the crest height `crest` less the ridge thickness.
HORSE_MANE = {
    # Deletion zone: front (behind the ears, which end at z -0.349) to back
    # (withers), and above the cut line (z, y).
    'front': -.322, 'back': -.022,
    'cut': ((-.33, .600), (-.29, .600), (-.25, .590), (-.21, .560), (-.17, .552), (-.13, .549),
            (-.10, .550), (-.07, .568), (-.045, .578), (-.02, .585), (0., .590)),
    # Mane outer top height along the crest (z, y), from the generator mane.
    'crest': ((-.36, .716), (-.31, .712), (-.25, .705), (-.19, .688), (-.13, .661), (-.07, .637),
              (-.04, .615), (-.01, .600), (.02, .590)),
    'centreDepth': .07,  # ray origin this far under the crest
    # Shell extent (z): it tapers in over `taperIn` behind its front and
    # thins out from `taperOut` to its back end over the withers.
    'shell': (-.346, .016), 'taperIn': .022, 'taperOut': -.085, 'stations': 26, 'outer': 11,
    'thickness': {'top': .023, 'hem': .008, 'end': .002},
    # Drape: the hem's depth below the crest (z, depth) before the tufts.
    'drop': ((-.35, .028), (-.3, .036), (-.2, .042), (-.1, .040), (-.03, .030), (.02, .02)),
    'gap': .003, 'sink': .008,
    # Tufts: hem depth below the base hem, pointed tips raked back.
    'tufts': {'period': .066, 'depth': .022, 'phase': (0., .5), 'rake': .015, 'bulge': .15},
    # Retained neck within `blend` of the hole's edge eases onto the traced section.
    'blend': .03,
    'fillRings': ((.35, .5), (.7, .3)), 'fillSink': (.003, .005),
}
HORSE_HINDQUARTERS['mane'] = HORSE_MANE
HORSE_HINDQUARTERS['preservation'] += '; the mane stage then deleted the crest strip and tuft lobes between poll and withers above a cut line, closed the hole with rings on a traced neck section and added one closed lofted mane shell (ridge, two-sided drape, scalloped tufts) seated into the neck, sampling the solid hair and coat squares of the atlas, skinned from the nearest original vertices'


def _rays_exit(origins, dirs, V, T):
    """First exit (t, triangle, barycentric) of each ray through triangles T."""
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    e1, e2 = b - a, c - a
    n = np.cross(e1, e2)
    h = np.cross(dirs[:, None], e2[None])
    det = (h * e1[None]).sum(-1)
    ok = np.abs(det) > 1e-14
    inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    s = origins[:, None] - a[None]
    u = (s * h).sum(-1) * inv
    q = np.cross(s, e1[None])
    v = (dirs[:, None] * q).sum(-1) * inv
    t = (e2[None] * q).sum(-1) * inv
    exiting = (dirs @ n.T) > 0
    hit = ok & exiting & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    t = np.where(hit, t, np.inf)
    k = np.argmin(t, axis=1)
    rows = np.arange(len(origins))
    return t[rows, k], k, u[rows, k], v[rows, k]


def _gauss1(values, sigma, axis):
    """Gaussian smoothing along one axis with edge padding (sigma in samples)."""
    if sigma <= 0:
        return values
    r = int(np.ceil(3 * sigma))
    kernel = np.exp(-.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    pad = [(0, 0)] * values.ndim
    pad[axis] = (r, r)
    padded = np.pad(values, pad, mode='edge')
    return np.apply_along_axis(lambda x: np.convolve(x, kernel, mode='valid'), axis, padded)


def _pack_glb(blob, doc, base, prim, names, new, indices):
    """The rebuilt primitive's accessors written into a copy of the document."""
    out = json.loads(json.dumps(doc))
    payload = {prim['attributes'][k]: new[k].tobytes() for k in names}
    payload[prim['indices']] = indices.tobytes()
    by_view = {}
    count = len(new['POSITION'])
    for index, data in payload.items():
        acc = out['accessors'][index]
        assert acc.get('byteOffset', 0) == 0
        acc['count'] = len(indices) if index == prim['indices'] else count
        by_view[acc['bufferView']] = data
    acc = out['accessors'][prim['attributes']['POSITION']]
    acc['min'] = [float(x) for x in new['POSITION'].min(axis=0)]
    acc['max'] = [float(x) for x in new['POSITION'].max(axis=0)]
    out['accessors'][prim['indices']]['componentType'] = 5123 if indices.dtype == np.dtype('<u2') else 5125
    binary = bytearray()
    for vi, view in enumerate(out['bufferViews']):
        data = by_view.get(vi)
        if data is None:
            start = base + doc['bufferViews'][vi].get('byteOffset', 0)
            data = bytes(blob[start:start + view['byteLength']])
        binary += b'\0' * (-len(binary) % 4)
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(data)
        view.pop('byteStride', None) if vi in by_view else None
        binary += data
    binary += b'\0' * (-len(binary) % 4)
    out['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(out, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    glb = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(binary))
           + struct.pack('<II', len(text), 0x4E4F534A) + text
           + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))
    for key in ('nodes', 'skins', 'materials', 'textures', 'images', 'samplers', 'scenes', 'animations'):
        assert out.get(key) == doc.get(key), key
    return glb


def rebuild_mane(data, spec, islands, max_triangles):
    blob = bytearray(data)
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    base = 28 + length
    prim = doc['meshes'][0]['primitives'][0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    src_lo, src_hi = pos.min(axis=0), pos.max(axis=0)
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    zf, zb = spec['front'], spec['back']
    cut_z, cut_y = np.array(spec['cut']).T
    ycut = lambda z: np.interp(z, cut_z, cut_y)
    crest_z, crest_y = np.array(spec['crest']).T
    crest = lambda z: np.interp(z, crest_z, crest_y)
    depth = spec['centreDepth']
    centre_y = lambda z: crest(z) - depth
    # 1. The zone, closed until its edge is one simple loop.
    zone = (P[:, 2] > zf) & (P[:, 2] < zb) & (P[:, 1] > ycut(P[:, 2]))
    assert P[zone, 1].max() < src_hi[1] - .02, 'zone reaches the ears'
    drop = zone[F].all(axis=1)
    for _ in range(12):
        kept_w = F[~drop]
        directed = kept_w[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
        present = set(map(tuple, directed.tolist()))
        border = [(a, b) for a, b in directed.tolist() if (b, a) not in present]
        starts = np.bincount([a for a, _ in border], minlength=len(P))
        following = dict(border)
        loop = [border[0][0]]
        while following[loop[-1]] != loop[0] and len(loop) <= len(border):
            loop.append(following[loop[-1]])
        if (starts <= 1).all() and len(loop) == len(border):
            break
        # Absorb every retained face touching a pinch, or a second loop.
        rest = set(a for a, _ in border) - set(loop) if len(loop) < len(border) else set()
        bad = set(np.nonzero(starts > 1)[0].tolist()) | rest
        touch = np.isin(F, list(bad)).any(axis=1) & zone[F].sum(axis=1).astype(bool)
        assert (touch & ~drop).any(), 'zone cannot be closed to one loop'
        drop |= touch
        zone[F[drop].ravel()] = True
    else:
        raise AssertionError('mane zone edge is not one simple loop')
    loop = np.array(loop)
    assert not np.isin(loop, np.nonzero(~zone)[0]).any()
    # 2. Reference sections: rays from inside the neck against the retained mesh.
    kept_faces, kept_w = faces[~drop], F[~drop]
    z0, z1 = spec['shell']
    zs = np.arange(min(z0, zf) - .01, max(z1, zb) + .0101, .005)
    phis = np.radians(np.arange(-140., 140.01, 2.))
    dirs2 = np.stack([np.sin(phis), np.cos(phis)], axis=1)
    radius = np.full((len(zs), len(phis)), np.nan)
    tz = P[kept_w][:, :, 2]
    for i, z in enumerate(zs):
        near = (tz.min(axis=1) <= z) & (tz.max(axis=1) >= z)
        origin = np.array([0., centre_y(z), z])
        d3 = np.c_[dirs2, np.zeros(len(phis))]
        t, _, _, _ = _rays_exit(np.repeat(origin[None], len(phis), 0), d3, P, kept_w[near])
        ok = t < .16
        radius[i, ok] = t[ok]
    # Inside the hole the section runs to the crest less the ridge thickness.
    env = lambda z: _smoothstep(z0, z0 + spec['taperIn'], z) * (1 - _smoothstep(spec['taperOut'], z1, z))
    top = depth - spec['thickness']['top'] * env(zs)
    filled = radius.copy()
    hole = np.isnan(radius)
    for i in range(len(zs)):
        miss = hole[i]
        if not miss.any():
            continue
        # Rays leaving through the hole (or too far, low on the chest) miss;
        # the section is interpolated across them.
        known = ~miss
        xs, ys = phis[known], radius[i, known]
        if miss[len(phis) // 2]:
            xs, ys = np.r_[xs, 0.], np.r_[ys, top[i]]
            order = np.argsort(xs)
            xs, ys = xs[order], ys[order]
        filled[i, miss] = np.interp(phis[miss], xs, ys)
    smooth = _gauss1(_gauss1(filled, 3., 1), 1.5, 0)
    # Keep traced sections where they are far from the hole; blend near it.
    near_hole = _gauss1(_gauss1(hole.astype('f8'), 4., 1), 2., 0)
    weight = np.clip(near_hole * 6, 0, 1)
    ref = weight * smooth + (1 - weight) * filled
    def ref_at(z, phi):
        gi = np.clip((z - zs[0]) / .005, 0, len(zs) - 1.001)
        gj = np.clip((phi - phis[0]) / np.radians(2.), 0, len(phis) - 1.001)
        i, j = gi.astype(int), gj.astype(int)
        fi, fj = gi - i, gj - j
        return ((1 - fi) * (1 - fj) * ref[i, j] + fi * (1 - fj) * ref[i + 1, j]
                + (1 - fi) * fj * ref[i, j + 1] + fi * fj * ref[i + 1, j + 1])
    def place(z, phi, dr):
        r = ref_at(z, phi) + dr
        return np.stack([r * np.sin(phi), centre_y(z) + r * np.cos(phi), z], axis=-1)
    # The retained neck about the hole's edge (where the tuft roots were cut)
    # eases onto the traced section, so the band the drape leaves bare is smooth.
    P_before = P.copy()
    kept_v = np.unique(kept_w)
    d_edge = _nearest(P[kept_v], P[loop])
    ease = np.zeros(len(P))
    ease[kept_v] = np.clip(1 - d_edge / spec['blend'], 0, 1) ** 2
    ease[(P[:, 2] < z0) | (P[:, 2] > z1)] = 0
    moving = ease > 0
    phi_v = np.arctan2(P[moving, 0], P[moving, 1] - centre_y(P[moving, 2]))
    P[moving] += ease[moving, None] * (place(P[moving, 2], phi_v, 0.) - P[moving])
    old_cross = np.cross(P_before[kept_w[:, 1]] - P_before[kept_w[:, 0]], P_before[kept_w[:, 2]] - P_before[kept_w[:, 0]])
    for attempt in range(12):
        new_cross = np.cross(P[kept_w[:, 1]] - P[kept_w[:, 0]], P[kept_w[:, 2]] - P[kept_w[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) <= 0
        if not flipped.any():
            break
        back = np.unique(kept_w[flipped])
        P[back] = P_before[back] + (.5 if attempt < 11 else 0) * (P[back] - P_before[back])
    moved_render = (np.linalg.norm(P - P_before, axis=1) > 0)[inverse]
    pos[moved_render] = P[inverse][moved_render]
    # 3. Fill: rings from the hole's edge toward the crest line, then sewn.
    B = P[loop]
    n_b = len(loop)
    phi_b = np.arctan2(B[:, 0], B[:, 1] - centre_y(B[:, 2]))
    seglen = np.linalg.norm(np.diff(np.r_[B, B[:1]], axis=0), axis=1)
    s_b = np.r_[0, np.cumsum(seglen)[:-1]] / seglen.sum()
    def along(f, values):
        s_ext = np.r_[s_b - 1, s_b, s_b + 1]
        v_ext = np.r_[values, values, values]
        return np.interp(f, s_ext, v_ext)
    rings_zp = [(B[:, 2], phi_b, s_b)]
    for (t, frac), sink in zip(spec['fillRings'], spec['fillSink']):
        count = max(8, int(round(n_b * frac)))
        f = (np.arange(count) + .5) / count
        zr, pr = along(f, B[:, 2]), along(f, phi_b)
        zr = (1 - t) * zr + t * np.clip(zr, zf + .015, zb - .015)
        rings_zp.append((zr, (1 - t) * pr, f, sink))
    fill_pos = [B.copy()]
    for zr, pr, f, sink in rings_zp[1:]:
        fill_pos.append(place(zr, pr, -sink))
    counts = [len(r) for r in fill_pos]
    starts_f = np.cumsum([0] + counts)
    ring_idx = [np.arange(starts_f[k], starts_f[k + 1]) for k in range(len(counts))]
    fill_tris = []
    for k in range(len(counts) - 1):
        fill_tris += _zipper(ring_idx[k], rings_zp[k][2], ring_idx[k + 1], rings_zp[k + 1][2])
    # Sew the innermost ring: split at its front- and rearmost points and
    # zip the two chains by arc fraction.
    inner_idx = ring_idx[-1]
    zi = rings_zp[-1][0]
    a_, b_ = int(np.argmin(zi)), int(np.argmax(zi))
    n_i = len(inner_idx)
    chain1 = [(a_ + k) % n_i for k in range((b_ - a_) % n_i + 1)]
    chain2 = [(a_ - k) % n_i for k in range((a_ - b_) % n_i + 1)]
    allp = np.vstack(fill_pos)
    def fractions(chain):
        q = allp[inner_idx[chain]]
        d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
        return d / d[-1]
    f1, f2 = fractions(chain1), fractions(chain2)
    sew = []
    i = j = 0
    while i < len(chain1) - 1 or j < len(chain2) - 1:
        if j == len(chain2) - 1 or (i < len(chain1) - 1 and f1[i + 1] <= f2[j + 1]):
            sew.append((inner_idx[chain1[i]], inner_idx[chain1[i + 1]], inner_idx[chain2[j]])); i += 1
        else:
            sew.append((inner_idx[chain1[i]], inner_idx[chain2[j + 1]], inner_idx[chain2[j]])); j += 1
    sew = np.array(sew)
    # The chains share their end points; the march's first and last steps
    # name one of them twice and are dropped (the rest still tile the strip).
    sew = sew[(sew[:, 0] != sew[:, 1]) & (sew[:, 1] != sew[:, 2]) & (sew[:, 0] != sew[:, 2])]
    ring_edges = set(map(tuple, np.array(fill_tris)[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2).tolist()))
    if ring_edges & set(map(tuple, sew[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2).tolist())):
        sew = sew[:, [0, 2, 1]]
    fill_tris = np.vstack([fill_tris, sew])
    fill_pos = allp
    n_fill = len(fill_pos)
    # Orient the fill with the hole: its edge must use the retained edges reversed.
    retained = set(map(tuple, kept_w[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2).tolist()))
    e0 = fill_tris[np.isin(fill_tris, np.arange(n_b)).sum(axis=1) >= 2][0]
    pairs = [(e0[k], e0[(k + 1) % 3]) for k in range(3) if e0[k] < n_b and e0[(k + 1) % 3] < n_b]
    if (loop[pairs[0][0]], loop[pairs[0][1]]) in retained:
        fill_tris = fill_tris[:, [0, 2, 1]]
    # 4. The shell: one closed loft of station sections.
    th, tf = spec['thickness'], spec['tufts']
    K = spec['stations']
    n_o = spec['outer']
    zk = np.linspace(z0, z1, K + 1)
    phi_grid = phis
    def phi_for_y(z, y_target, side):
        # First ray angle away from the crest whose traced point is below y_target.
        ph = phi_grid[phi_grid * side >= 0] if side > 0 else phi_grid[phi_grid <= 0][::-1]
        yy = centre_y(z) + ref_at(np.full(len(ph), z), ph) * np.cos(ph)
        below = np.nonzero(yy <= y_target)[0]
        k = below[0] if len(below) else len(ph) - 1
        if k == 0:
            return ph[0]
        y0_, y1_ = yy[k - 1], yy[k]
        w_ = np.clip((y0_ - y_target) / max(y0_ - y1_, 1e-9), 0, 1)
        return ph[k - 1] + w_ * (ph[k] - ph[k - 1])
    def tuft(z, side):
        u = (z - zf) / tf['period'] + tf['phase'][0 if side < 0 else 1]
        x = 2 * (u % 1.) - 1
        return (1 - np.abs(x)) ** 2
    sections, params = [], []
    for z in zk:
        e = float(env(z))
        loop_pts, loop_v = [], []
        hems = {}
        for side in (-1, 1):
            hem_y = crest(z) - np.interp(z, *np.array(spec['drop']).T) - tf['depth'] * tuft(z, side)
            ph = abs(phi_for_y(z, hem_y, side))
            hems[side] = max(e * ph, np.radians(4.))
        tl = lambda ph: (np.where(ph < 0, -ph / hems[-1], ph / hems[1]))
        bulge = 1 + tf['bulge'] * .5 * (tuft(z, -1) + tuft(z, 1))
        def thick(ph):
            x = np.clip(tl(ph), 0, 1)
            return e * bulge * (th['hem'] + (th['top'] - th['hem']) * (1 - x) ** 1.2) + (1 - e) * th['end']
        outer_phi = np.linspace(-hems[-1], hems[1], n_o)
        for ph in outer_phi:
            loop_pts.append(place(z, ph, thick(ph)))
        g = spec['gap'] * e + .0005
        sink = spec['sink']
        def drape(side):
            hem = hems[side]
            root = hem - min(np.radians(28.), .6 * hem)
            pts = [place(z, side * (hem + np.radians(2.) * e), g + .5 * thick(side * hem))]
            for fr in (1 / 3, 2 / 3):
                ph = hem + fr * (root - hem)
                pts.append(place(z, side * ph, g + fr * (-sink - g)))
            pts.append(place(z, side * root, -sink))
            return pts, root
        right, root_r = drape(1)
        left, root_l = drape(-1)
        loop_pts += right
        loop_pts.append(place(z, .5 * (root_r - root_l), -sink - .004))
        loop_pts += left[::-1]
        pts = np.array(loop_pts)
        # Rake: the hem and the drape below the ridge sweep back.
        for side, idx in ((1, [n_o - 1, n_o]), (-1, [0, len(pts) - 1])):
            pts[idx, 2] += tf['rake'] * e * tuft(z, side)
        sections.append(pts)
    sections = np.array(sections)
    M = sections.shape[1]
    shell_pos = sections.reshape(-1, 3)
    shell_tris = []
    for k in range(K):
        for j in range(M):
            a, b = k * M + j, k * M + (j + 1) % M
            shell_tris += [(a, b, a + M), (b, b + M, a + M)]
    caps = []
    for k, sign in ((0, -1), (K, 1)):
        c = sections[k].mean(axis=0)
        c[2] += sign * .002
        caps.append(c)
    n_ring = len(shell_pos)
    shell_pos = np.vstack([shell_pos, caps])
    for j in range(M):
        shell_tris.append((n_ring, (j + 1) % M, j))
        shell_tris.append((n_ring + 1, K * M + j, K * M + (j + 1) % M))
    shell_tris = np.array(shell_tris)
    # Outward: positive enclosed volume.
    tri = shell_pos[shell_tris]
    vol = np.einsum('ij,ij->i', tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6
    if vol < 0:
        shell_tris = shell_tris[:, [0, 2, 1]]
    # 5. Skin: inverse-distance over the nearest original vertices at each new
    # vertex's point on the reference neck.
    joints_src, weights_src = attrs['JOINTS_0'], attrs['WEIGHTS_0'].astype('f8')
    n_joints = len(doc['skins'][0]['joints'])
    rep = np.zeros(len(P), 'i8')
    rep[inverse] = np.arange(len(pos))
    dense_src = np.zeros((len(P), n_joints))
    for c in range(4):
        np.add.at(dense_src, (np.arange(len(P)), joints_src[rep, c].astype('i8')), weights_src[rep, c])
    def skin_at(q):
        d = np.linalg.norm(q[:, None] - P[None], axis=-1)
        near = np.argsort(d, axis=1)[:, :4]
        w_ = 1 / np.maximum(np.take_along_axis(d, near, axis=1), 1e-4) ** 2
        return (dense_src[near] * w_[..., None]).sum(axis=1) / w_.sum(axis=1)[:, None]
    shell_z = shell_pos[:, 2]
    shell_phi = np.arctan2(shell_pos[:, 0], shell_pos[:, 1] - centre_y(shell_z))
    shell_base = place(shell_z, shell_phi, 0.)
    skin = np.vstack([dense_src[loop], skin_at(fill_pos[n_b:]), skin_at(shell_base)])
    top4 = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top4, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top4[top_w == 0] = 0
    # 6. UVs: the fill in the coat square, the shell in the hair square.
    (fill_c, fill_h), (hair_c, hair_h) = islands['fill'], islands['tail']
    fz = (fill_pos[:, 2] - zf) / (zb - zf) * 2 - 1
    fphi = np.arctan2(fill_pos[:, 0], fill_pos[:, 1] - centre_y(fill_pos[:, 2]))
    fill_uv = np.array(fill_c) + .9 * fill_h * np.c_[np.clip(fz, -1, 1), np.clip(fphi / np.pi, -1, 1)]
    sv = np.r_[np.tile(np.arange(M) / M, K + 1), .5, .5] * 2 - 1
    su = np.r_[np.repeat(np.linspace(-1, 1, K + 1), M), -1, 1]
    shell_uv = np.array(hair_c) + .9 * hair_h * np.c_[su, sv]
    # 7. Assemble: retained render vertices, the fill (ring 0 copies the
    # hole's edge), the shell.
    kept = np.unique(kept_faces)
    remap = np.full(len(pos), -1)
    remap[kept] = np.arange(len(kept))
    n_kept = len(kept)
    all_pos = np.vstack([pos[kept], fill_pos, shell_pos])
    fill_off, shell_off = n_kept, n_kept + n_fill
    all_faces = np.vstack([remap[kept_faces], fill_tris + fill_off, shell_tris + shell_off])
    assert len(all_faces) <= max_triangles, f'mane rebuild needs {len(all_faces)} triangles (budget {max_triangles})'
    w_first, w_inverse = _weld(all_pos)
    Wp = all_pos[w_first]
    wf = w_inverse[all_faces]
    dd = wf[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    _, use = np.unique(np.sort(dd, axis=1), axis=0, return_counts=True)
    assert (use == 2).all(), 'rebuilt mesh is not closed'
    assert len(np.unique(dd, axis=0)) == len(dd), 'rebuilt mesh winding is inconsistent'
    area = np.linalg.norm(np.cross(Wp[wf[:, 1]] - Wp[wf[:, 0]], Wp[wf[:, 2]] - Wp[wf[:, 0]]), axis=1)
    assert area.min() > 1e-9, f'degenerate triangle ({area.min():.2e})'
    smooth_n = _smooth_normals(Wp, wf)[w_inverse]
    shell_n = _smooth_normals(shell_pos, shell_tris)
    all_nor = np.vstack([attrs['NORMAL'][kept].astype('f8'), smooth_n[fill_off:shell_off], shell_n])
    all_nor[fill_off:fill_off + n_b] = smooth_n[fill_off:fill_off + n_b]
    eased = ease[inverse[kept]][:, None]
    all_nor[:n_kept] = eased * smooth_n[:n_kept] + (1 - eased) * all_nor[:n_kept]
    all_nor /= np.maximum(np.linalg.norm(all_nor, axis=1), 1e-12)[:, None]
    n_new = n_fill + len(shell_pos)
    new = {
        'POSITION': all_pos.astype('<f4'),
        'NORMAL': all_nor.astype('<f4'),
        'TEXCOORD_0': np.vstack([attrs['TEXCOORD_0'][kept], fill_uv, shell_uv]).astype('<f4'),
        'JOINTS_0': np.vstack([joints_src[kept], top4]).astype(joints_src.dtype),
        'WEIGHTS_0': np.vstack([attrs['WEIGHTS_0'][kept], top_w]).astype(attrs['WEIGHTS_0'].dtype),
    }
    assert len(new['TEXCOORD_0']) == n_kept + n_new
    for k in names[2:]:
        assert np.array_equal(new[k][:n_kept], attrs[k][kept]), f'retained {k} changed'
    lo_b, hi_b = new['POSITION'].min(axis=0), new['POSITION'].max(axis=0)
    assert np.allclose(lo_b, src_lo, atol=1e-7) and np.allclose(hi_b, src_hi, atol=1e-7), (lo_b, hi_b, src_lo, src_hi)
    # Retained surface that would show through the mane's outer face.
    outer_ids = np.r_[[np.arange(k * M, k * M + n_o) for k in range(K + 1)]].ravel()
    kz = P[np.unique(kept_w), :]
    inside_shell = (kz[:, 2] > z0) & (kz[:, 2] < z1)
    kphi = np.arctan2(kz[:, 0], kz[:, 1] - centre_y(kz[:, 2]))
    kr = np.linalg.norm(kz[:, :2] - np.c_[np.zeros(len(kz)), centre_y(kz[:, 2])], axis=1)
    sec_phi = np.arctan2(shell_pos[outer_ids, 0], shell_pos[outer_ids, 1] - centre_y(shell_pos[outer_ids, 2])).reshape(K + 1, n_o)
    sec_r = np.linalg.norm(shell_pos[outer_ids, :2] - np.c_[np.zeros(len(outer_ids)), centre_y(shell_pos[outer_ids, 2])], axis=1).reshape(K + 1, n_o)
    poke = []
    for v_, (zz, ph, rr) in enumerate(zip(kz[:, 2], kphi, kr)):
        if not inside_shell[v_]:
            continue
        k = int(np.clip(np.searchsorted(zk, zz) - 1, 0, K - 1))
        if not (sec_phi[k, 0] < ph < sec_phi[k, -1]):
            continue
        poke.append(rr - np.interp(ph, sec_phi[k], sec_r[k]))
    poke = np.array(poke) if poke else np.zeros(1)
    assert poke.max() < 0, f'retained surface shows through the mane by {poke.max():.4f}'
    glb = _pack_glb(blob, doc, base, prim, names, new, all_faces.astype('<u2' if len(all_pos) < 65535 else '<u4').ravel())
    dominant = [doc['nodes'][doc['skins'][0]['joints'][int(np.argmax(skin[n_fill + k * M:n_fill + (k + 1) * M].sum(axis=0)))]]['name']
                for k in range(0, K + 1, 6)]
    return glb, {
        'removedTriangles': int(drop.sum()), 'removedVertices': int(len(pos) - n_kept),
        'holeLoop': int(n_b), 'fillTriangles': int(len(fill_tris)), 'fillVertices': int(n_fill),
        'shellTriangles': int(len(shell_tris)), 'shellVertices': int(len(shell_pos)),
        'shellStations': int(K + 1), 'sectionVertices': int(M),
        'vertices': int(len(all_pos)), 'triangles': int(len(all_faces)),
        'retainedClearance': round(float(-poke.max()), 4),
        'dominantJointAlongShell': dominant,
    }


# The horse's hind legs, rebuilt after the mane (round 4, 2026-11-05; strike
# rule). The generator hind leg is a 3.7 cm tube from fetlock to hock and a
# 6 cm one through the gaskin, with no hock point, and three judged rounds read
# it as a stick under the rump. Nothing earlier scaled or nudged it; it is not
# patched here either. Every body face of each hind leg below `cut` is deleted
# and the leg is lofted afresh from an AUTHORED profile: per height (source
# units, the leg's ground centre at the origin), the section centre (`dz` back
# of it, `dx` outward from it, on top of the traced lateral drift `drift`), the
# half depth `hd`, the half width `hw` and the superellipse exponent of the back
# quadrant `nb` (below 2 the back is pointed: the point of the hock). The table
# is drawn as a side and a back silhouette - hoof, coronet, pastern sloping up
# and back to a fetlock with an ergot swell, a cannon a little deeper than wide,
# a hock whose point stands behind the cannon line, and a gaskin that runs
# forward and up to the stifle, widening as it goes. The generator leg is only
# used to find the leg (its ground centre, the cut's edge) and, over the top
# `traceBlend`, to give the section the loft lands on. The thigh above the cut
# keeps its width (it holds the envelope's width extreme a little higher up);
# its back is filled rearward by `rearFill` (displacement at the cut, fading
# out by `cut + rearFill[1]`, gated to the back of the leg) so the hamstring
# line runs on down to the hock instead of tucking in above it.
HORSE_HIND_LEGS = {
    'cut': .31, 'reach': .1, 'sides': 12, 'topGap': .006, 'traceBlend': .025,
    'exponent': 2.3,
    # Lateral drift of the leg's centre (height, offset toward the midline),
    # traced from the generator leg: the hocks sit a little closer than the hooves.
    'drift': ((0., 0.), (.08, .001), (.14, .009), (.2, .0175), (.31, .017)),
    # (y, dz, hd, dx, hw, nb); the first three rows are the hoof.
    'profile': (
        (0.,   .0,    .036,  .0003, .0303, 2.),
        (.012, .0005, .0345, .0005, .0295, 2.),
        (.028, .003,  .029,  .0005, .0255, 2.),
        (.045, .011,  .023,  .0005, .0205, 2.2),
        (.068, .023,  .027,  .0005, .0245, 1.9),
        (.095, .024,  .024,  .0005, .0205, 2.2),
        (.13,  .030,  .022,  .0005, .0205, 2.2),
        (.16,  .033,  .023,  .0005, .0225, 2.),
        (.19,  .041,  .033,  .001,  .028,  1.5),
        (.215, .0395, .0355, .0015, .030,  1.6),
        (.245, .025,  .041,  -.001, .0345, 1.9),
        (.275, .0095, .0455, -.003, .037,  2.1),
    ),
    # Rings at these profile heights (the hoof's top ring is doubled: hoof
    # UVs below the coronet, coat above), then the traced top ring.
    'coronet': .028,
    'rearFill': (.016, .08), 'rearGate': (.0, .03), 'rearLateral': (.035, .065),
    # Inner thigh pull toward the midline at the cut (amount, fade-out span).
    'innerFill': (.014, .06),
    # Join fairing: Taubin passes (lambda, mu) weighted by distance from the
    # cut (band) and from each leg's cut centre (radius).
    'joinFair': {'band': .06, 'radius': .09, 'iterations': 24, 'lambda': .5, 'mu': -.53},
    'clearance': .004,
    # Solid squares of the existing atlas (centre u, v; half side), found by
    # sampling the leg's own charts: a coat square whose albedo (184, 104, 70),
    # roughness (151) and normal (flat) match the hind leg's mid-height coat,
    # and a hoof square (98, 70, 59; roughness 185).
    'uvIslands': {'coat': ((.9453, .4552), .006), 'hoof': ((.1281, .027), .006)},
}
HORSE_HINDQUARTERS['hindLegs'] = HORSE_HIND_LEGS
HORSE_HINDQUARTERS['preservation'] += '; the hind-leg stage then deleted each hind leg below a cut and lofted it afresh from an authored side and back profile (hoof, pastern, fetlock, cannon, pointed hock, widening gaskin), traced only at the top to meet the retained thigh, filled the back of the thigh rearward above the cut, and skinned the loft from the deleted leg by inverse distance; the loft samples solid coat and hoof squares of the atlas'


def rebuild_hind_legs(data, spec, max_triangles):
    blob = bytearray(data)
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    base = 28 + length
    prim = doc['meshes'][0]['primitives'][0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    src_lo, src_hi = pos.min(axis=0), pos.max(axis=0)
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    rep = np.zeros(len(P), 'i8')
    rep[inverse] = np.arange(len(pos))
    n_joints = len(doc['skins'][0]['joints'])
    joints_src, weights_src = attrs['JOINTS_0'], attrs['WEIGHTS_0'].astype('f8')
    def dense(rows):
        out = np.zeros((len(rows), n_joints))
        for c in range(4):
            np.add.at(out, (np.arange(len(rows)), joints_src[rows, c].astype('i8')), weights_src[rows, c])
        return out
    # Islands: the body is the largest; the tail locks and the mane shell are
    # their own closed shells and stay out of the cut.
    parent = np.arange(len(P))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for a, b in _edges(F):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    root = np.array([find(i) for i in range(len(P))])
    body = root == np.bincount(root).argmax()
    tail_excluded = 0
    if spec.get('excludeUV'):
        # A tail welded into the body (round 5) is not leg or thigh: it is
        # neither cut, filled nor faired, and is kept clear of like a shell.
        (ec, eh) = spec['excludeUV']
        in_square = (np.abs(attrs['TEXCOORD_0'][first].astype('f8') - ec) <= eh + 1e-6).all(axis=1)
        tail = body & in_square & (P[:, 2] > .3)
        body &= ~tail
        tail_excluded = int(tail.sum())
    S, cut = spec['sides'], spec['cut']
    prof = np.array(spec['profile'], 'f8')
    col = lambda k, y: np.interp(y, prof[:, 0], prof[:, k])
    drift_y, drift_v = np.array(spec['drift']).T
    # 1. Each hind leg's faces below the cut.
    drop = np.zeros(len(F), bool)
    legs = []
    for sx in (1, -1):
        foot = body & (P[:, 1] < .03) & (P[:, 2] > .2) & (np.sign(P[:, 0]) == sx)
        assert foot.sum() >= 8, 'hind foot not found'
        # The hoof's extents' middle (its vertices crowd the outer wall).
        c = .5 * (P[foot][:, [0, 2]].min(axis=0) + P[foot][:, [0, 2]].max(axis=0))
        column = body & (np.hypot(P[:, 0] - c[0], P[:, 2] - c[1]) < spec['reach'])
        mine = (column & (P[:, 1] < cut))[F].any(axis=1) & column[F].all(axis=1)
        assert not (drop & mine).any()
        drop |= mine
        legs.append({'side': sx, 'c': c, 'tris': F[mine], 'verts': np.unique(F[mine])})
    kept_w = F[~drop]
    directed = kept_w[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    present = set(map(tuple, directed.tolist()))
    border = [(a, b) for a, b in directed.tolist() if (b, a) not in present]
    following = dict(border)
    assert len(following) == len(border), 'hind leg cut edge is not a simple loop'
    cycles, seen = [], set()
    for a, _ in border:
        if a in seen:
            continue
        loop = [a]
        seen.add(a)
        while following[loop[-1]] != a:
            loop.append(following[loop[-1]])
            seen.add(loop[-1])
        cycles.append(np.array(loop))
    assert len(cycles) == 2, f'{len(cycles)} cut loops for two hind legs'
    for leg in legs:
        leg['loop'] = min(cycles, key=lambda l: np.linalg.norm(P[l][:, [0, 2]].mean(axis=0) - leg['c']))
    assert len({id(leg['loop']) for leg in legs}) == 2, 'two hind legs share a cut loop'
    # 2. The back of the thigh filled rearward: full at and below the cut,
    # gone by cut + span, gated to the back of the leg and to the leg's own
    # lateral column. The deleted leg moves with it, so the trace the loft
    # lands on is the filled thigh's.
    amount, span = spec['rearFill']
    original = P.copy()
    shift = np.zeros(len(P))
    for leg in legs:
        cx = leg['c'][0] - leg['side'] * np.interp(P[:, 1], drift_y, drift_v)
        cz = leg['c'][1] + col(1, np.minimum(P[:, 1], prof[-1, 0]))
        gate = _smoothstep(cz + spec['rearGate'][0], cz + spec['rearGate'][1], P[:, 2])
        lateral = 1 - _smoothstep(*spec['rearLateral'], np.abs(P[:, 0] - cx))
        shift = np.maximum(shift, amount * (1 - _smoothstep(cut, cut + span, P[:, 1])) * gate * lateral * body)
        # The inner thigh drawn toward the midline (never across it), so the
        # gap between the thighs closes into an arch over the gaskins.
        a_in, s_in = spec['innerFill']
        inner = _smoothstep(0., .02, leg['side'] * (cx - P[:, 0])) * _smoothstep(.008, .03, leg['side'] * P[:, 0])
        along = 1 - _smoothstep(.045, .075, np.abs(P[:, 2] - cz))
        pull = a_in * (1 - _smoothstep(cut, cut + s_in, P[:, 1])) * inner * along * body
        P[:, 0] -= leg['side'] * pull
    P[:, 2] += shift
    old_cross = np.cross(original[kept_w[:, 1]] - original[kept_w[:, 0]], original[kept_w[:, 2]] - original[kept_w[:, 0]])
    for attempt in range(24):
        new_cross = np.cross(P[kept_w[:, 1]] - P[kept_w[:, 0]], P[kept_w[:, 2]] - P[kept_w[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        moved = np.unique(kept_w[flipped])
        P[moved] = original[moved] + (.5 if attempt < 23 else 0) * (P[moved] - original[moved])
    shifted = np.linalg.norm(P - original, axis=1) > 1e-7
    # 3. The lofts.
    (coat_c, coat_h), (hoof_c, hoof_h) = spec['uvIslands']['coat'], spec['uvIslands']['hoof']
    new_pos, new_uv, new_skin, new_faces = [], [], [], []
    base_index = len(pos)
    report = []
    ground = float(src_lo[1])
    for leg in legs:
        sx, (x0, z0), loop = leg['side'], leg['c'], leg['loop']
        L = P[loop]
        top = float(L[:, 1].min()) - spec['topGap']
        assert top > prof[-1, 0] + .01, 'cut too low for the authored profile'
        ang_l = np.arctan2(L[:, 2] - L[:, 2].mean(), L[:, 0] - L[:, 0].mean())
        turn = np.angle(np.exp(1j * np.diff(np.r_[ang_l, ang_l[0]])))
        sense = np.sign(turn.sum())
        assert abs(abs(turn.sum()) - 2 * np.pi) < 1e-6 and (np.sign(turn) == sense).all(), 'hind leg cut loop is not star-shaped'
        theta = ang_l[0] + sense * 2 * np.pi * (np.arange(S) + .5) / S
        def design(y, th):
            yy = min(y, prof[-1, 0])
            cx = x0 - sx * np.interp(yy, drift_y, drift_v) + sx * col(3, yy)
            cz = z0 + col(1, yy)
            hd, hw, nb = col(2, yy), col(4, yy), col(5, yy)
            c_, s_ = np.cos(th), np.sin(th)
            n_z = np.where(s_ > 0, nb, spec['exponent'])
            x = cx + hw * np.sign(c_) * np.abs(c_) ** (2 / spec['exponent'])
            z = cz + hd * np.sign(s_) * np.abs(s_) ** (2 / n_z)
            return np.stack([x, np.full_like(th, max(y, ground)), z], axis=1)
        def traced(y, th):
            q = _slice_points(P, leg['tris'], y)
            ox, oz = .5 * (q[:, 0].min() + q[:, 0].max()), .5 * (q[:, 2].min() + q[:, 2].max())
            a_q = np.arctan2(q[:, 2] - oz, q[:, 0] - ox)
            r = np.interp(th, a_q[np.argsort(a_q)], np.hypot(q[:, 0] - ox, q[:, 2] - oz)[np.argsort(a_q)], period=2 * np.pi)
            return np.stack([ox + r * np.cos(th), np.full_like(th, y), oz + r * np.sin(th)], axis=1)
        def section(y, th):
            w_t = float(_smoothstep(top - spec['traceBlend'], top, y))
            d = design(y, th)
            return d if w_t <= 0 else (1 - w_t) * d + w_t * traced(min(y, top), th)
        heights = np.r_[prof[:, 0], top]
        rings = [section(max(h, ground), theta) for h in heights]
        k_cor = int(np.flatnonzero(np.isclose(heights, spec['coronet']))[0])
        n_b = len(loop)
        # Ring order bottom to top, with the coronet ring doubled: hoof rings
        # 0..k_cor (hoof UVs), then coat rings k_cor..top.
        ring_list = rings[:k_cor + 1] + rings[k_cor:]
        n_r = len(ring_list)
        hoof_rows = k_cor + 1
        trans = .5 * (L + section(top, ang_l + 0.))
        sole_c = np.array([x0 + sx * col(3, 0.), ground, z0 + col(1, 0.)])
        collar = np.arange(n_b)
        mid = n_b + np.arange(n_b)
        ring_idx = [2 * n_b + j * S + np.arange(S) for j in range(n_r)]
        sole = 2 * n_b + n_r * S
        local = np.vstack([L, trans, np.vstack(ring_list), sole_c[None]])
        frac = lambda a: ((sense * (a - ang_l[0])) % (2 * np.pi)) / (2 * np.pi)
        def flatness(t1_, t2_):
            n1 = np.cross(local[t1_[1]] - local[t1_[0]], local[t1_[2]] - local[t1_[0]])
            n2 = np.cross(local[t2_[1]] - local[t2_[0]], local[t2_[2]] - local[t2_[0]])
            return n1 @ n2 / max(np.linalg.norm(n1) * np.linalg.norm(n2), 1e-30)
        tris = []
        for j in range(n_b):
            o0, o1, t0, t1 = collar[j], collar[(j + 1) % n_b], mid[j], mid[(j + 1) % n_b]
            a_ = [(o1, o0, t0), (o1, t0, t1)]
            b_ = [(o1, o0, t1), (o0, t0, t1)]
            tris += a_ if flatness(*a_) >= flatness(*b_) else b_
        tris += _zipper(mid, frac(ang_l), ring_idx[-1], frac(theta))
        nz = len(tris)
        for j in range(n_r - 1):
            if j == hoof_rows - 1:
                continue  # the doubled coronet: no band between its copies
            lo_r, up_r = ring_idx[j], ring_idx[j + 1]
            for i in range(S):
                a, b = lo_r[i], lo_r[(i + 1) % S]
                c_, d = up_r[i], up_r[(i + 1) % S]
                tris += [(a, b, c_), (b, d, c_)]
        bands = len(tris)
        for i in range(S):
            tris.append((sole, ring_idx[0][(i + 1) % S], ring_idx[0][i]))
        tris = np.array(tris)
        cross = np.cross(local[tris[:, 1]] - local[tris[:, 0]], local[tris[:, 2]] - local[tris[:, 0]])
        centre_line = np.array([np.r_[L, trans][:, [0, 2]].mean(axis=0)] * len(local))
        for j, idx in enumerate(ring_idx):
            centre_line[idx] = local[idx][:, [0, 2]].mean(axis=0)
        centre_line[sole] = sole_c[[0, 2]]
        axis_pt = np.c_[centre_line[:, 0], local[:, 1], centre_line[:, 1]]
        outward = (local - axis_pt)[tris].mean(axis=1)
        zip_out = (cross[:nz] * outward[:nz]).sum(axis=1).mean()
        band_out = (cross[nz:bands] * outward[nz:bands]).sum(axis=1).mean()
        assert zip_out > 0, 'hind leg collar strip faces inward'
        if band_out < 0:
            tris[nz:] = tris[nz:, [0, 2, 1]]
        cross = np.cross(local[tris[:, 1]] - local[tris[:, 0]], local[tris[:, 2]] - local[tris[:, 0]])
        assert (cross[bands:, 1] < 0).all(), 'hind leg sole faces up'
        tris, flips = _flip_folds(local, tris)
        assert (local[mid, 1] < local[collar, 1]).all() and (local[mid, 1] > top).all(), 'transition ring out of order'
        # UVs: a polar map inside the coat square (collar, transition and coat
        # rings) or the hoof square (hoof rings and sole); both squares are
        # solid, so interpolation across the map stays on the colour.
        rho = .25 + .75 * np.clip((local[:, 1] - ground) / max(top - ground, 1e-6), 0, 1)
        ang = np.r_[ang_l, ang_l, np.tile(theta, n_r), 0.]
        rho[-1] = 0.
        uv = np.stack([coat_c[0] + .9 * coat_h * rho * np.cos(ang), coat_c[1] + .9 * coat_h * rho * np.sin(ang)], axis=1)
        hoof_v = np.r_[np.concatenate([ring_idx[j] for j in range(hoof_rows)]), sole]
        uv[hoof_v] = np.stack([hoof_c[0] + .9 * hoof_h * rho[hoof_v] / rho[ring_idx[hoof_rows - 1]].max() * np.cos(ang[hoof_v]),
                               hoof_c[1] + .9 * hoof_h * rho[hoof_v] / rho[ring_idx[hoof_rows - 1]].max() * np.sin(ang[hoof_v])], axis=1)
        # Skin: the collar keeps its edge vertices' own skin; the loft blends
        # the deleted leg's skin by inverse distance (nearest four).
        donors = np.r_[leg['verts'], loop]
        donor_skin = dense(rep[donors])
        d = np.linalg.norm(local[n_b:, None] - P[donors][None], axis=-1)
        near4 = np.argsort(d, axis=1)[:, :4]
        wgt = 1 / np.maximum(np.take_along_axis(d, near4, axis=1), 1e-5) ** 2
        loft_skin = (donor_skin[near4] * wgt[..., None]).sum(axis=1) / wgt.sum(axis=1)[:, None]
        skin = np.vstack([dense(rep[loop]), loft_skin])
        offset = base_index + sum(len(p) for p in new_pos)
        new_pos.append(local)
        new_uv.append(uv)
        new_skin.append(skin)
        new_faces.append(tris + offset)
        ext = lambda r: [round(float(np.ptp(r[:, 0])), 4), round(float(np.ptp(r[:, 2])), 4)]
        report.append({'side': int(sx), 'removedTriangles': int(len(leg['tris'])), 'loftTriangles': int(len(tris)),
                       'rings': int(n_r), 'cutLoop': int(n_b), 'top': round(top, 4), 'foldFlips': flips,
                       'widthDepth': {f'{h:.3f}': ext(r) for h, r in zip(heights, rings)},
                       'rearmost': round(float(np.vstack(rings)[:, 2].max()), 4)})
    # 4. Assemble: retained render vertices (thigh filled), the lofts.
    skin = np.vstack(new_skin)
    top4 = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top4, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top4[top_w == 0] = 0
    added = np.vstack(new_pos)
    all_pos = np.vstack([P[inverse], added])
    all_faces = np.vstack([faces[~drop], np.vstack(new_faces)])
    used = np.unique(all_faces)
    remap = np.full(len(all_pos), -1)
    remap[used] = np.arange(len(used))
    is_new = used >= base_index
    retained = used[~is_new]
    assert len(all_faces) <= max_triangles, f'hind leg rebuild needs {len(all_faces)} triangles (budget {max_triangles})'
    all_pos = all_pos[used]
    all_faces = remap[all_faces]
    w_first, w_inverse = _weld(all_pos)
    Wp = all_pos[w_first]
    wf = w_inverse[all_faces]
    dd = wf[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    _, use = np.unique(np.sort(dd, axis=1), axis=0, return_counts=True)
    assert (use == 2).all(), 'rebuilt mesh is not closed'
    assert len(np.unique(dd, axis=0)) == len(dd), 'rebuilt mesh winding is inconsistent'
    # 5. The thigh join faired: Taubin smoothing of the welded body surface in
    # a band about the cut, inside each hind leg's column, so the haunch runs
    # into the gaskin instead of ending in a hem over a tube.
    jspec = spec['joinFair']
    face_body = np.r_[body[F[~drop][:, 0]], np.ones(len(all_faces) - int((~drop).sum()), bool)]
    body_w = np.zeros(len(Wp), bool)
    body_w[wf[face_body].ravel()] = True
    weight = (1 - _smoothstep(0, jspec['band'], np.abs(Wp[:, 1] - cut))) * body_w
    near = np.zeros(len(Wp))
    for leg in legs:
        cxz = P[leg['loop']][:, [0, 2]].mean(axis=0)
        near = np.maximum(near, 1 - _smoothstep(.7 * jspec['radius'], jspec['radius'], np.hypot(Wp[:, 0] - cxz[0], Wp[:, 2] - cxz[1])))
    weight *= near
    edges_w = _edges(wf)
    deg = np.bincount(edges_w.ravel(), minlength=len(Wp))[:, None]
    before = Wp.copy()
    for _ in range(jspec['iterations']):
        for lam in (jspec['lambda'], jspec['mu']):
            total = np.zeros_like(Wp)
            np.add.at(total, edges_w[:, 0], Wp[edges_w[:, 1]])
            np.add.at(total, edges_w[:, 1], Wp[edges_w[:, 0]])
            Wp = Wp + lam * weight[:, None] * (total / np.maximum(deg, 1) - Wp)
    c0 = np.cross(before[wf[:, 1]] - before[wf[:, 0]], before[wf[:, 2]] - before[wf[:, 0]])
    c1 = np.cross(Wp[wf[:, 1]] - Wp[wf[:, 0]], Wp[wf[:, 2]] - Wp[wf[:, 0]])
    assert ((c0 * c1).sum(axis=1) > 0).all(), 'join fairing flipped a face'
    faired = np.linalg.norm(Wp - before, axis=1) > 1e-7
    all_pos = Wp[w_inverse]
    area = np.linalg.norm(np.cross(Wp[wf[:, 1]] - Wp[wf[:, 0]], Wp[wf[:, 2]] - Wp[wf[:, 0]]), axis=1)
    assert area.min() > 1e-9, f'degenerate triangle ({area.min():.2e})'
    # Normals: the welded surface's own on every loft vertex, the cut's edge,
    # the filled thigh and the faired join; elsewhere unchanged.
    smooth = _smooth_normals(Wp, wf)[w_inverse]
    nor = np.vstack([attrs['NORMAL'].astype('f8'), np.zeros((len(added), 3))])[used]
    moved = np.r_[shifted[inverse], np.ones(len(added), bool)][used] | faired[w_inverse]
    on_edge = np.isin(w_inverse, np.unique(w_inverse[is_new | moved]))
    nor[on_edge] = smooth[on_edge]
    nor /= np.maximum(np.linalg.norm(nor, axis=1), 1e-12)[:, None]
    n_kept = int((~is_new).sum())
    new = {
        'POSITION': all_pos.astype('<f4'),
        'NORMAL': nor.astype('<f4'),
        'TEXCOORD_0': np.vstack([attrs['TEXCOORD_0'][retained], np.vstack(new_uv)]).astype('<f4'),
        'JOINTS_0': np.vstack([joints_src[retained], top4]).astype(joints_src.dtype),
        'WEIGHTS_0': np.vstack([attrs['WEIGHTS_0'][retained], top_w]).astype(attrs['WEIGHTS_0'].dtype),
    }
    assert (np.diff(retained) > 0).all() and len(new['TEXCOORD_0']) == len(all_pos)
    for k in names[2:]:
        assert np.array_equal(new[k][:n_kept], attrs[k][retained]), f'retained {k} changed'
    lo_b, hi_b = new['POSITION'].min(axis=0), new['POSITION'].max(axis=0)
    assert np.allclose(lo_b, src_lo, atol=1e-7) and np.allclose(hi_b, src_hi, atol=1e-7), (lo_b, hi_b, src_lo, src_hi)
    # Clearance from the separate shells (tail locks): the new legs and the
    # filled thigh stay off them.
    other = ~body
    shells = [t for t in F if other[t[0]]]
    stand_off = None
    if shells:
        cloud = _surface_samples(P, np.array(shells), 4)
        fresh = np.unique(wf[np.isin(wf, np.unique(w_inverse[is_new | moved])).any(axis=1)])
        stand_off = float(_nearest(Wp[fresh], cloud).min())
        assert stand_off > spec['clearance'], f'hind leg too near a separate shell: {stand_off:.4f}'
    glb = _pack_glb(blob, doc, base, prim, names, new, all_faces.astype('<u2' if len(all_pos) < 65535 else '<u4').ravel())
    return glb, {
        'removedTriangles': int(drop.sum()), 'vertices': int(len(all_pos)), 'triangles': int(len(all_faces)),
        'thighFill': {'movedVertices': int(shifted.sum()), 'rear': round(float(shift.max()), 4),
                      'inner': round(float(np.abs(P[:, 0] - original[:, 0]).max()), 4)},
        'joinFaired': {'vertices': int(faired.sum()), 'max': round(float(np.linalg.norm(Wp - before, axis=1).max()), 4)},
        'shellStandOff': None if stand_off is None else round(stand_off, 4),
        'tailExcluded': tail_excluded,
        'legs': report,
    }


# Round 5 (2026-11-05), change of construction for the rump and the tail.
# The rump has been judged a flat-backed slab in four rounds. Its generator
# back is a vertical wall at z 0.415 from y 0.31 to 0.51 carried by a few
# long triangles (one or two vertices per 2 cm cell), so blurring it (rounds
# 1-4) could only round its corners. Now the rear cap (every face behind
# `cap.z` above `cap.y`, old fill and tail root included) is deleted and
# filled again with rings placed by rays from an inside centre onto an
# AUTHORED solid traced from three silhouettes (_rump_field): the back-view
# outline (half `width` against height: widest at the haunch, rounded over
# the croup), the side-view rear outline (`rear`: the point of buttock at
# mid-height, the croup rolling over to the tail head above and the thigh
# curving forward below) at each buttock's apex column (`apex`), a plan-view
# recession toward the sides (`plan`: amount at the outline, exponent) and a
# median crease between the buttocks (`crease`, half width `creaseHalf`). The
# side walls and the rear cap meet in a rounded edge (`round`). The solid
# replaces the blurred body field behind `blendZ` above `blendY`; the legs
# below keep the blurred field the hind-leg stage traces.
HORSE_RUMP = {
    'width': ((.2, .118), (.33, .118), (.36, .127), (.40, .1335), (.44, .1356), (.48, .1335),
              (.51, .125), (.535, .108), (.555, .083), (.568, .05), (.576, 0.)),
    'rear': ((.2, .36), (.27, .372), (.31, .394), (.35, .41), (.39, .42), (.43, .426), (.47, .426),
             (.505, .419), (.535, .403), (.555, .38), (.568, .35), (.576, .32)),
    # Each buttock's apex column and the plan recession at the outline, both
    # against height: low down the buttocks are the thighs, set wide and
    # carried square to the gaskins; high up they round in to the croup.
    'apex': ((.3, .078), (.38, .07), (.45, .055), (.52, .044)),
    'plan': (((.3, .03), (.38, .045), (.45, .08), (.52, .1)), 2.2),
    'crease': ((.2, .014), (.36, .017), (.44, .015), (.49, .008), (.52, 0.)), 'creaseHalf': .05,
    # The gap between the thighs seen from behind (half width against
    # height, up to the crotch at the midline), traced from the generator.
    'notch': ((.05, .2), (.045, .3), (.036, .35), (.022, .375), (0., .39)),
    'round': .02, 'blendZ': (.2, .3), 'blendY': (.36, .40),
}
HORSE_HINDQUARTERS['rump'] = HORSE_RUMP
# The cap: vertices behind z above y (over the crotch) are deleted (with the plate); the hole
# is filled by `rings` rings whose directions from `centre` blend from the
# hole's edge to the tail's foot, each carried by its ray onto the solid.
# Ring fractions are angles about the axis from the centre to the tail root,
# so the hole's edge and the foot ring are parametrised alike. The fill's
# skin is an inverse-distance blend of the deleted rump's own vertices.
HORSE_HINDQUARTERS['cap'] = {'z': .30, 'y': ((.04, .40), (.075, .36)), 'centre': (0., .44, .30), 'rings': 6, 'skinNearest': 4,
                             'fairBand': (.12, .42, 10)}
# The tail (rounds 1-4: one smooth tube, then a bundle of thin separate
# locks; both read as a flat plate) is one closed shell lofted from the
# blended dock foot to the tip, its section traced from the back view
# (lateral radius) and the side view (sagittal radius) and carved into
# `lobes` lock volumes: grooves between them deepen down the tail (`depth`
# against fraction), the locks twist (`twist` degrees) and each ends at its
# own length (`length`, after which it sinks into the others) with its own
# thickness (`scale`), so the hair is one mass with overlapping locks and a
# ragged, uneven tip. The hair starts at the foot, so no dock knob shows.
HORSE_HINDQUARTERS['tail'] = {k: v for k, v in HORSE_HINDQUARTERS['tail'].items() if k != 'locks'}
HORSE_HINDQUARTERS['tail'].update({
    'sides': 20, 'tubeRings': 10,
    'dock': {'foot': .036, 'sigma': .008, 'blend': .007, 'rings': 3},
    # The dock leaves the tail head already falling and turns over a wide
    # bend, so the root is an arch off the croup, not a hook.
    'rise': -25., 'bend': .035,
    # (fraction of the free tail, lateral radius, sagittal radius): the hair
    # fills out below the buttocks and stays full nearly to the end.
    'radius': ((0., .022, .022), (.12, .027, .025), (.3, .035, .029), (.55, .043, .033),
               (.78, .047, .034), (.92, .044, .031), (1., .034, .024)),
    'lobed': {'lobes': 5, 'phase': 20., 'twist': 55., 'tip': (40., 72.),
              'depth': ((0., 0.), (.1, .1), (.4, .3), (1., .42)), 'crease': 2.5,
              'length': (1., .9, .97, .86, .93), 'scale': (1., .93, 1.06, .95, 1.02)},
})
HORSE_HINDQUARTERS['preservation'] += '; round 5 deleted the rear cap (behind z 0.30, above the crotch and the thighs, the old fill and tail root with it) and filled it with rings carried by rays onto an authored solid traced from back-view, side-view and plan silhouettes with a median crease (no longer the blurred volume there), skinned from the deleted rump by inverse distance, and replaced the tail with one closed loft from the blended dock foot to the tip whose section is carved into five twisting lock lobes of staggered length'


def _rump_field(field, lo, step, iso, rspec):
    """The blurred body field with the rump replaced by the authored solid.

    The solid's signed distance is the rounded intersection of the back-view
    outline (a 2D distance, extruded along z) and the rear cap z <= Zr(x, y);
    it is turned into a field with the blurred one's gradient at its iso, and
    blended in behind blendZ above blendY."""
    nx, ny, nz = field.shape
    gx, gy, gz = [lo[k] + (np.arange(n) + .5) * step for k, n in enumerate((nx, ny, nz))]
    wy, wv = np.array(rspec['width']).T
    ry, rv = np.array(rspec['rear']).T
    cy, cv = np.array(rspec['crease']).T
    X, Y = np.meshgrid(gx, gy, indexing='ij')
    W = np.interp(Y, wy, wv)
    # 2D signed distance to the closed outline: up the right side of the
    # width profile, down the left, then up the left inner thigh to the
    # crotch and down the right inner thigh.
    side = np.stack([wv, wy], axis=1)
    notch = np.array(rspec['notch'], 'f8')
    poly = np.vstack([side, side[::-1] * [-1, 1], notch * [-1, 1], notch[::-1][1:]])
    poly = np.vstack([poly, poly[:1]])
    q = np.stack([X.ravel(), Y.ravel()], axis=1)
    best = np.full(len(q), np.inf)
    inside = np.zeros(len(q), bool)
    for a, b in zip(poly[:-1], poly[1:]):
        ab = b - a
        t = np.clip(((q - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        best = np.minimum(best, np.linalg.norm(q - (a + t[:, None] * ab), axis=1))
        if a[1] != b[1]:
            inside ^= ((a[1] > q[:, 1]) != (b[1] > q[:, 1])) & (q[:, 0] < a[0] + (b[0] - a[0]) * (q[:, 1] - a[1]) / (b[1] - a[1]))
    sd_o = np.where(inside, -best, best).reshape(X.shape)
    # The rear cap: side outline at the apex column, receding toward the
    # outline in plan, less the crease at the midline.
    ay, av = np.array(rspec['apex']).T
    (py, pv), power = np.array(rspec['plan'][0]).T, rspec['plan'][1]
    xh = np.interp(Y, ay, av)
    amount = np.interp(Y, py, pv)
    zr = np.interp(Y, ry, rv)
    lateral = np.clip(np.maximum(np.abs(X) - xh, 0) / np.maximum(W - xh, .02), 0, 1.6)
    crease = np.interp(Y, cy, cv) * np.maximum(1 - (X / rspec['creaseHalf']) ** 2, 0) ** 2
    Zr = zr - amount * lateral ** power - crease
    a3 = sd_o[:, :, None]
    b3 = gz[None, None, :] - Zr[:, :, None]
    r = rspec['round']
    h = np.clip(.5 + .5 * (a3 - b3) / r, 0, 1)
    sd = b3 * (1 - h) + a3 * h + r * h * (1 - h)
    g = np.stack(np.gradient(field, step), axis=-1)
    near = np.abs(field - iso) < .05
    gain = float(np.median(np.linalg.norm(g[near], axis=1)))
    solid = np.clip(iso - gain * sd, 0, 1)
    blend = (_smoothstep(*rspec['blendZ'], gz)[None, None, :] * _smoothstep(*rspec['blendY'], gy)[None, :, None])
    out = ((1 - blend) * field + blend * solid).astype('f4')
    return out, {'gain': round(gain, 3)}


def _ray_iso(field, lo, step, iso, origin, dirs, reach=.35):
    """Where each ray from an inside origin first leaves the field's iso."""
    t = np.arange(0., reach, step / 2)
    q = origin[None, None] + t[None, :, None] * dirs[:, None]
    inside = (_trilinear(field, lo, step, q.reshape(-1, 3)) > iso).reshape(len(dirs), len(t))
    assert inside[:, 0].all(), 'cap centre is not inside the rump'
    k = np.argmin(inside, axis=1)
    assert (k > 0).all(), 'a cap ray never leaves the rump'
    ta, tb = t[k - 1], t[k]
    for _ in range(30):
        m = .5 * (ta + tb)
        out = _trilinear(field, lo, step, origin[None] + m[:, None] * dirs) > iso
        ta, tb = np.where(out, ta, m), np.where(out, m, tb)
    return origin[None] + (.5 * (ta + tb))[:, None] * dirs


def _horse_tail_lobed(spec, p0, n0, bow):
    """One closed loft from the dock foot (ring 0) to an apex at the tip; the
    section is an ellipse of the traced lateral and sagittal radii carved
    into lock lobes. Same return shape as _horse_tail."""
    line, seg, dock_len = _horse_tail_line(spec, p0, n0, bow)
    Lb = spec['lobed']
    sides, lobes = spec['sides'], Lb['lobes']
    assert sides % lobes == 0
    s_fil, r_fil = _dock_profile(spec['dock'], spec['radius'][0][1])
    s_tube = np.linspace(dock_len, seg[-1], spec['tubeRings'] + 1)[1:]
    tab = np.array(spec['radius'])
    f_tube = (s_tube - dock_len) / (seg[-1] - dock_len)
    s_all = np.r_[s_fil, s_tube]
    frac = np.r_[np.zeros(len(s_fil)), f_tube]
    r_lat = np.r_[r_fil, np.interp(f_tube, tab[:, 0], tab[:, 1])]
    r_sag = np.r_[r_fil, np.interp(f_tube, tab[:, 0], tab[:, 2])]
    centre = np.stack([np.interp(s_all, seg, line[:, k]) for k in range(3)], axis=1)
    tangent = np.stack([np.interp(s_all, seg, np.gradient(line[:, k], seg)) for k in range(3)], axis=1)
    tangent /= np.linalg.norm(tangent, axis=1)[:, None]
    end, end_t = centre[-1].copy(), tangent[-1].copy()
    lat_end, sag_end = r_lat[-1], r_sag[-1]
    r_end = max(lat_end, sag_end)
    for a in np.radians(Lb['tip']):
        centre = np.vstack([centre, end + r_end * np.sin(a) * end_t])
        tangent = np.vstack([tangent, end_t])
        r_lat = np.r_[r_lat, lat_end * np.cos(a)]
        r_sag = np.r_[r_sag, sag_end * np.cos(a)]
        s_all = np.r_[s_all, seg[-1] + r_end * np.sin(a)]
        frac = np.r_[frac, 1.]
    du, dv = np.array(Lb['depth']).T
    depth = np.interp(frac, du, dv)
    twist = np.radians(Lb['phase'] + Lb['twist'] * frac)
    k = np.arange(sides)
    phase = 2 * np.pi * k / sides
    valley = (.5 * (1 - np.cos(lobes * phase))) ** Lb.get('crease', 1.)  # 0 on a lock's crest, 1 between locks
    lock = np.round(k * lobes / sides).astype(int) % lobes
    lengths, scales = np.array(Lb['length'])[lock], np.array(Lb['scale'])[lock]
    lateral = np.array([1., 0., 0.])
    pos, param = [], []
    for j in range(len(centre)):
        sag = np.cross(tangent[j], lateral)
        sag /= np.linalg.norm(sag)
        # A lock past its own length sinks to the groove level.
        alive = 1 - _smoothstep(lengths - .3, lengths, frac[j])
        carve = 1 - depth[j] * (valley + (1 - valley) * (1 - alive))
        swell = 1 + (scales - 1) * (1 - valley) * min(1., frac[j] / .2)
        m = carve * swell
        theta = twist[j] + phase
        pos.append(centre[j] + np.outer(r_lat[j] * m * np.cos(theta), lateral) + np.outer(r_sag[j] * m * np.sin(theta), sag))
        param.append(np.stack([np.full(sides, s_all[j] / s_all[-1]), (theta / (2 * np.pi)) % 1], axis=1))
    pos.append((end + r_end * end_t)[None])
    param.append([[1., .5]])
    pos, param = np.vstack(pos), np.vstack(param)
    rings = len(centre)
    tris = []
    for j in range(rings - 1):
        for i in range(sides):
            a, b = j * sides + i, j * sides + (i + 1) % sides
            tris += [(a, a + sides, b), (b, a + sides, b + sides)]
    for i in range(sides):
        tris.append(((rings - 1) * sides + i, rings * sides, (rings - 1) * sides + (i + 1) % sides))
    tris = np.array(tris)
    outward = np.vstack([(pos[:-1].reshape(rings, sides, 3) - centre[:, None]).reshape(-1, 3), pos[-1:] - centre[-1:]])
    cross = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    if (cross * outward[tris].mean(axis=1)).sum(axis=1).mean() < 0:
        tris = tris[:, [0, 2, 1]]
    cross = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    assert ((cross * outward[tris].mean(axis=1)).sum(axis=1) > 0).all(), 'tail loft folds'
    return pos, param, tris, {'ringS': np.r_[np.repeat(s_all, sides), s_all[-1] + r_end], 'dockEnd': s_fil[-1],
                              'centre': centre, 'radius': np.maximum(r_lat, r_sag), 'stations': rings}


# The hind-leg stage must leave the tail alone: since round 5 the tail is
# welded into the body (one island), so it is told apart by its hair square.
HORSE_HIND_LEGS['excludeUV'] = HORSE_HINDQUARTERS['uvIslands']['tail']


# Round 6 (2026-11-05), change of construction for the hindquarters as one
# joint: croup, buttock, thigh, stifle, gaskin and hock. Rounds 1-5 built the
# rump (blurred level set, then a silhouette-traced solid above y 0.36-0.40)
# and the hind leg (a profile loft below y 0.31) as two separate objects
# faired together at a seam, and five judged rounds read the result as a slab
# on two tubes. Two measurements say why. Seen from behind, the hind hooves
# stood 0.206 apart under a 0.272 haunch (0.76 of it; a horse's hooves stand
# under its points of buttock, about 0.4 of its hip width), and the outer edge
# of each leg ran plumb at x 0.12 from the stifle to the ground, so the legs
# read as table legs at the corners of a box. Seen from the side, the hind leg
# left the body at its back corner: nothing came forward to a stifle at the
# belly line. This stage no longer moves either part on its own: it models
# the limb by its joints and the thigh by its muscle masses, in one pass over
# the whole hindquarter, on the welded mesh the three stages left:
#   1. The limb is posed from behind by its joints (`pose`, lateral offset
#      toward the midline against height): the stifle stays out at the thigh,
#      the gaskin runs down and in, the hock stands under the point of buttock
#      and the cannon drops plumb from it to the hoof (hooves 0.14 apart).
#   2. The seams are faired out of the joint band (`fair`: Taubin passes over
#      the band, plain Laplacian passes over the hind leg's collar at its cut,
#      which is a step in the surface rather than noise).
#   3. The thigh's masses (`masses`, tapered capsules per side, mirrored: the
#      lateral thigh from the hip down to the stifle, front and back, so the
#      haunch runs on down to the stifle instead of ending in a ball; the
#      thigh's front edge from the stifle at the belly line down and back to
#      the gaskin; the gaskin's swell; the inner thigh over the gaskins; the
#      hamstring from the point of buttock down the back of the leg to the
#      point of hock; the cannon and its tendons) are united with the body by
#      a smooth union of blend radius `blend`: each vertex in the region goes
#      out along its normal to the union's surface, so where a mass stands
#      proud the surface is that mass and where it lies inside the surface
#      does not move. The displacements are evened over the mesh
#      (`evenings`) so the generator's long triangles carry a smooth shape,
#      and the haunch keeps the width extreme.
#   4. The croup is drawn in toward the tail head behind the hip (`taper`), so
#      in plan the widest point is the hip and the outline closes behind it.
#   5. The joint band's diagonals are re-laid (`flip`, _flip_smoother): an
#      edge is flipped where the flipped pair meets at a gentler crease.
# Vertex count, triangle count, UV, joint and weight bytes are unchanged; only
# POSITION, NORMAL and some triangles' diagonals (in the joint band, never
# across a UV seam) change. Source units, +z the rump, x lateral.
HORSE_HAUNCH = {
    # (y, offset toward the midline) for the hind limb behind `poseZ`, faded
    # out within `poseInner` of the midline.
    'pose': ((0., .034), (.12, .033), (.2, .027), (.25, .017), (.29, .008), (.32, .002), (.34, 0.)),
    'poseZ': (.24, .30), 'poseInner': .03,
    # Band weights (zero, full); y (rise, full, fall, zero). The collar is
    # (height, half width, passes).
    'fair': {'y': (.22, .26, .44, .48), 'z': (.14, .2), 'iterations': 24, 'lambda': .5, 'mu': -.53,
             'collar': (.315, .04, 6)},
    # Tapered capsules (a, ra, b, rb) on the right side (x > 0).
    'masses': (
        ((.100, .44, .27), .031, (.100, .315, .28), .030),     # lateral thigh, front
        ((.100, .44, .36), .031, (.094, .30, .37), .030),      # lateral thigh, back
        ((.098, .315, .285), .030, (.075, .25, .36), .030),    # stifle to gaskin, the thigh's front edge
        ((.075, .30, .385), .046, (.066, .215, .415), .030),   # gaskin
        ((.040, .33, .39), .028, (.052, .26, .405), .022),     # inner thigh
        ((.055, .42, .395), .032, (.062, .23, .425), .018),    # hamstring to the point of hock
        ((.0625, .17, .405), .024, (.0675, .07, .398), .0235),  # cannon and tendons
    ),
    # Union blend radius; the farthest a vertex may go out; the region
    # (zero, full) behind the barrel above the fetlocks.
    'blend': .03, 'reach': .05,
    'region': {'z': (.10, .18), 'y': (.04, .07)},
    'evenings': 12,
    'taper': {'amount': .12, 'z': (.32, .44), 'y': (.34, .46)},
    'flip': {'y': (.18, .5), 'z': .15, 'gain': 4.},
    'clearance': .004,
}

def _round_cone(q, a, ra, b, rb):
    """Distance-like field of a capsule whose radius runs from ra at a to rb at b."""
    a, b = np.asarray(a, 'f8'), np.asarray(b, 'f8')
    ab = b - a
    t = np.clip(((q - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(q - (a + t[:, None] * ab), axis=1) - (ra + t * (rb - ra))


def _smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k / 4


def _flip_smoother(W, wf, rf, allowed, gain, passes=12):
    """Re-lay the diagonals of a coarse surface: flip any interior edge whose
    two triangles meet at a sharper crease than the flipped pair would, on the
    same four vertices (so the point set and triangle count are unchanged).
    Edges across a UV seam (render corners differ) are never flipped."""
    wf, rf = wf.copy(), rf.copy()
    def unit(t):
        c = np.cross(W[t[1]] - W[t[0]], W[t[2]] - W[t[0]])
        return c / max(np.linalg.norm(c), 1e-30)
    def min_angle(t):
        a = W[list(t)]
        out = []
        for i in range(3):
            u, v = a[(i + 1) % 3] - a[i], a[(i + 2) % 3] - a[i]
            out.append(np.degrees(np.arccos(np.clip(u @ v / max(np.linalg.norm(u) * np.linalg.norm(v), 1e-30), -1, 1))))
        return min(out)
    flips = 0
    for _ in range(passes):
        edge = {}
        for fi, t in enumerate(wf.tolist()):
            for k in range(3):
                edge[(t[k], t[(k + 1) % 3])] = (fi, k)
        candidates = []
        for (a, b), (f1, k1) in edge.items():
            if (b, a) not in edge or not (allowed[f1] and allowed[edge[(b, a)][0]]) or a > b:
                continue
            f2, k2 = edge[(b, a)]
            c, d = wf[f1][(k1 + 2) % 3], wf[f2][(k2 + 2) % 3]
            if c == d or (c, d) in edge or (d, c) in edge:
                continue
            if rf[f1][k1] != rf[f2][(k2 + 1) % 3] or rf[f1][(k1 + 1) % 3] != rf[f2][k2]:
                continue
            u1, u2 = unit(wf[f1]), unit(wf[f2])
            n1, n2 = (c, a, d), (d, b, c)
            v1, v2 = unit(n1), unit(n2)
            old = np.degrees(np.arccos(np.clip(u1 @ u2, -1, 1)))
            new = np.degrees(np.arccos(np.clip(v1 @ v2, -1, 1)))
            avg = u1 + u2
            if new < old - gain and v1 @ avg > 0 and v2 @ avg > 0 and min(min_angle(n1), min_angle(n2)) >= min(12., min_angle(wf[f1]), min_angle(wf[f2])):
                candidates.append((old - new, f1, k1, f2, k2, a, b, c, d))
        touched, done = set(), 0
        for _gain, f1, k1, f2, k2, a, b, c, d in sorted(candidates, reverse=True):
            if f1 in touched or f2 in touched:
                continue
            ra, rb, rc, rd = rf[f1][k1], rf[f1][(k1 + 1) % 3], rf[f1][(k1 + 2) % 3], rf[f2][(k2 + 2) % 3]
            wf[f1], wf[f2] = (c, a, d), (d, b, c)
            rf[f1], rf[f2] = (rc, ra, rd), (rd, rb, rc)
            touched |= {f1, f2}
            done += 1
        flips += done
        if not done:
            break
    return wf, rf, flips


def rebuild_haunch(data, spec, tail_square):
    blob = bytearray(data)
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    base = 28 + length
    prim = doc['meshes'][0]['primitives'][0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    src_lo, src_hi = pos.min(axis=0), pos.max(axis=0)
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    original = P.copy()
    # The tail (welded at its dock foot, told apart by its hair square) and
    # the mane shell stay where they are.
    (tc, th) = tail_square
    hair = (np.abs(attrs['TEXCOORD_0'][first].astype('f8') - tc) <= th + 1e-6).all(axis=1)
    tail = hair & (P[:, 2] > .3)
    free = ~hair
    side = np.where(P[:, 0] >= 0, 1., -1.)
    # 1. The limb posed by its joints.
    py, pv = np.array(spec['pose']).T
    gate = _smoothstep(*spec['poseZ'], P[:, 2]) * _smoothstep(0., spec['poseInner'], np.abs(P[:, 0])) * free
    P[:, 0] -= side * np.interp(P[:, 1], py, pv) * gate
    posed = P.copy()
    # 2. The seams the earlier stages left where rump, thigh and leg met (the
    # leg's collar zipper at its cut, the cap's lower edge) are faired out
    # over the joint band by Taubin passes, so the joint is one surface.
    fs = spec['fair']
    band = (_smoothstep(fs['y'][0], fs['y'][1], P[:, 1]) * (1 - _smoothstep(fs['y'][2], fs['y'][3], P[:, 1]))
            * _smoothstep(*fs['z'], P[:, 2]) * free)
    band[_smoothstep(0., .01, np.abs(P[:, 0])) < 1] *= 0
    edges = _edges(F)
    deg = np.bincount(edges.ravel(), minlength=len(P))[:, None]
    for _ in range(fs['iterations']):
        for lam in (fs['lambda'], fs['mu']):
            total = np.zeros_like(P)
            np.add.at(total, edges[:, 0], P[edges[:, 1]])
            np.add.at(total, edges[:, 1], P[edges[:, 0]])
            P = P + lam * band[:, None] * (total / np.maximum(deg, 1) - P)
    # The hind leg's collar (its cut at y 0.31) is a step in the surface,
    # not noise: plain Laplacian passes in a narrow band take it out (the
    # masses below put the volume back).
    cy, cw, cn = fs['collar']
    ring = (1 - _smoothstep(cw * .5, cw, np.abs(P[:, 1] - cy))) * _smoothstep(*fs['z'], P[:, 2]) * free
    ring[_smoothstep(0., .01, np.abs(P[:, 0])) < 1] *= 0
    for _ in range(cn):
        total = np.zeros_like(P)
        np.add.at(total, edges[:, 0], P[edges[:, 1]])
        np.add.at(total, edges[:, 1], P[edges[:, 0]])
        P = P + .5 * ring[:, None] * (total / np.maximum(deg, 1) - P)
    # 3. The thigh's masses, united with the body along each vertex's normal.
    N = _smooth_normals(P, F)
    rz, ry = spec['region']['z'], spec['region']['y']
    w = _smoothstep(*rz, P[:, 2]) * _smoothstep(*ry, P[:, 1]) * free
    masses = spec['masses']
    def mass_field(q):
        mirrored = q.copy()
        mirrored[:, 0] = np.abs(q[:, 0])
        m = None
        for a, ra, b, rb in masses:
            f = _round_cone(mirrored, a, ra, b, rb)
            m = f if m is None else _smin(m, f, spec['blend'] * .5)
        return m
    disp = np.zeros(len(P))
    if masses:
        k, reach = spec['blend'], spec['reach']
        lo_t, hi_t = np.zeros(len(P)), np.full(len(P), reach)
        u = lambda t: _smin(t, mass_field(P + t[:, None] * N), k)
        grows = u(hi_t) > 0
        for _ in range(30):
            mid = .5 * (lo_t + hi_t)
            inside = u(mid) <= 0
            lo_t, hi_t = np.where(inside, mid, lo_t), np.where(inside, hi_t, mid)
        disp = np.where(grows, .5 * (lo_t + hi_t), reach) * w
    D = disp[:, None] * N
    held = w <= 1e-6
    D = _relax(D, edges, held, spec['evenings'], step=.5)
    P = P + D
    # The haunch holds the width extreme; a fillet may not pass it.
    P[:, 0] = np.clip(P[:, 0], src_lo[0], src_hi[0])
    # 4. The croup drawn in toward the tail head behind the hip.
    tp = spec['taper']
    P[:, 0] *= 1 - tp['amount'] * _smoothstep(*tp['z'], P[:, 2]) * _smoothstep(*tp['y'], P[:, 1]) * free
    # Any face that would turn over is eased back toward the stage's input.
    c0 = np.cross(original[F[:, 1]] - original[F[:, 0]], original[F[:, 2]] - original[F[:, 0]])
    target = P.copy()
    for attempt in range(24):
        c1 = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
        flipped = (c0 * c1).sum(axis=1) <= 0
        if not flipped.any():
            break
        moved = np.unique(F[flipped])
        P[moved] = original[moved] + (.5 if attempt < 23 else 0) * (P[moved] - original[moved])
    eased = int((np.linalg.norm(P - target, axis=1) > 1e-9).sum())
    # 5. The joint band's diagonals re-laid along the surface (see _flip_smoother).
    fl = spec['flip']
    mid = P[F].mean(axis=1)
    allowed = ((mid[:, 1] > fl['y'][0]) & (mid[:, 1] < fl['y'][1]) & (mid[:, 2] > fl['z'])
               & free[F].all(axis=1))
    F, faces, flips = _flip_smoother(P, F, faces, allowed, fl['gain'])
    edges = _edges(F)
    area = np.linalg.norm(np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]]), axis=1)
    assert area.min() > 1e-9, f'degenerate triangle ({area.min():.2e})'
    assert np.array_equal(P[hair], original[hair]), 'tail or mane moved'
    # The body keeps clear of the tail below its dock.
    tail_faces = F[tail[F].all(axis=1)]
    cloud = _surface_samples(P, tail_faces, 4)
    moved_v = np.flatnonzero((np.linalg.norm(P - original, axis=1) > 1e-7) & (P[:, 1] < .40))
    stand_off = float(_nearest(P[moved_v], cloud).min()) if len(moved_v) else None
    assert stand_off is None or stand_off > spec['clearance'], f'hindquarters too near the tail: {stand_off:.4f}'
    # Normals: the welded surface's own wherever a vertex or its neighbour moved.
    moved = np.linalg.norm(P - original, axis=1) > 1e-8
    touched = moved.copy()
    touched[F[allowed].ravel()] = True
    touched[edges[moved[edges[:, 0]], 1]] = True
    touched[edges[moved[edges[:, 1]], 0]] = True
    smooth = _smooth_normals(P, F)
    nor = attrs['NORMAL'].astype('f8')
    on = touched[inverse]
    nor[on] = smooth[inverse][on]
    new = dict(attrs)
    new['POSITION'] = P[inverse].astype('<f4')
    new['NORMAL'] = nor.astype('<f4')
    lo_b, hi_b = new['POSITION'].min(axis=0), new['POSITION'].max(axis=0)
    assert np.allclose(lo_b, src_lo, atol=1e-7) and np.allclose(hi_b, src_hi, atol=1e-7), (lo_b, hi_b, src_lo, src_hi)
    glb = _pack_glb(blob, doc, base, prim, names, new, faces.astype('<u2').ravel())
    return glb, {
        'posedVertices': int((np.abs(posed - original).max(axis=1) > 1e-9).sum()),
        'massVertices': int((disp > 1e-6).sum()), 'maxMass': round(float(disp.max()), 4),
        'movedVertices': int(moved.sum()), 'maxDisplacement': round(float(np.linalg.norm(P - original, axis=1).max()), 4),
        'flipEased': eased, 'edgeFlips': flips, 'tailStandOff': None if stand_off is None else round(stand_off, 4),
    }


# Cow hide (round 1 of the cow's 2026-11-04 asset loop). The generator's
# Holstein atlas is a patchwork of charts whose black patches were painted per
# chart: their edges are stair-stepped polygons, they disagree where two charts
# meet (a thin black stripe down the spine and a rear leg), the layout is
# mirrored left to right, eye-like glyphs (a pale dot in a ring) sit on the back
# and croup, the white is cream-pink (median sRGB 193/174/159), and the normal
# map embosses a ridge along every old patch outline and every glyph ring.
# repaint_hide paints the hide from 3D position instead, in the cow's own frame
# (+Z head, -Z rump, X lateral, +Y up; source units, the Tripo unit box):
#   - Every covered texel is rasterised to the surface point it maps to, and
#     the generator's own dark texels are splatted into a voxel grid and
#     blurred; the patch is that field's level set, so both sides of a UV seam
#     get one edge by construction, edges are smooth curves, and features
#     narrower than the blur (glyph rings, pale dots in black, stray specks)
#     close up while the patch layout - the cow's identity - is kept.
#   - The field is read through a smooth domain warp (3D value noise, not
#     mirror-symmetric), so the left and right patches no longer mirror.
#   - Patches and white are flat colours (a neutral white, a neutral black);
#     the udder is an authored 3D region (round 5, COW_HIDE['udder']) painted
#     one skin pink, so no generator pink reaches the thighs, rump or belly.
#   - Head (eyes, muzzle, ears, horns), hooves and tail keep their texels; the
#     head's and tail's cream white is only gained to the same neutral white
#     (horns spared), so no tone step shows at the neck.
#   - On the repainted hide the normal map is flat (the old embossed outlines
#     would otherwise ghost beside the new edges) and roughness is matte; the
#     chart gutters are filled by pull-push from the covered texels.
# Only the three image buffer views change: positions, normals, UVs, skin,
# nodes, materials and every other byte are identical (asserted).
COW_HIDE = {
    'kind': 'hide',
    'preservation': 'Fairing changed POSITION and NORMAL only; the hide repaint then rewrote the albedo, ORM and normal images only (patches as the level set of a 3D-blurred, domain-warped field of the generator\'s own dark texels; neutral white and black; udder pink from an authored 3D region below the belly line; head, hooves and tail texels kept with the white gained to the same neutral; flat normal and matte roughness on the repainted hide; gutters filled by pull-push). JSON, topology, positions, normals, UV, skin, weights, joints, inverse binds, nodes, materials and animations unchanged',
    # Bake resolution (texels per side) and voxel / blur (source units).
    'res': 1024, 'voxel': .004, 'sigma': .009,
    # Source luminance ramp (full dark, none) that marks a patch texel.
    'dark': (60., 140.),
    # Field level ramp -> patch (soft edge a few texels wide at 512 px).
    'edge': (.44, .56),
    # Domain warp: amplitude and period (source units); faded out toward the
    # head (z ramp full, none) and the hooves (y ramp none, full) so the warped
    # hide meets the kept texels where they agree.
    'warp': (.032, .17), 'warpZ': (.08, .17), 'warpY': (.07, .13),
    # Mirror break: the two flanks read the field shifted opposite ways
    # along the body (z amplitude, tanh width across the spine), on the barrel
    # only (y ramp none, full) so the legs keep their own patches. Warp and
    # shear are projected onto the surface's tangent plane.
    'shear': (.045, .05), 'shearY': (.27, .35),
    # Kept regions as ramps: head along z (hide, kept), hooves along y (kept,
    # hide), the tail behind the rump (z ramp hide, kept; x ramp from the
    # midline, which it hangs to the +X side of), horns above y (no gain).
    'head': (.17, .23), 'hoof': (.04, .065),
    'tail': {'z': (-.461, -.471), 'x': (.012, .024), 'y': (.12, .15)},
    'horn': (.655, .675),
    # Pink in a source texel (R - B ramp): spares the kept muzzle from the
    # white gain. It no longer places the udder.
    'pink': (45., 70.),
    # Udder (round 5): an authored 3D region, not the generator's pink
    # texels. Those ran 13 cm up the inner thighs and the rear attachment to
    # y 0.34 and, blurred, washed the belly warm; from behind and at 135
    # degrees they read as pink patches on the hip and rump. The mound below
    # the belly line (belly underside y 0.245, mound floor 0.206) is the
    # udder: pink below the `belly` y ramp (full, none) and inside the plan
    # ellipse (centre x, z; semi-axes x, z; soft edge as a fraction of the
    # radius), deepening toward the floor over `deepen` (y full, none).
    'udder': {'belly': (.246, .256), 'centre': (-.027, -.305), 'axes': (.062, .088), 'soft': (.82, 1.),
              'colour': (226., 168., 160.), 'deep': (210., 146., 140.), 'deepen': (.206, .232)},
    # Source whiteness: luminance ramp (none, full).
    'whiteLum': (110., 160.),
    # sRGB targets.
    'white': (224., 224., 222.), 'black': (31., 29., 30.),
    'roughness': .78, 'feather': 6, 'dilate': 8,
}


def _repack_images(blob, doc, base, images):
    """A copy of the GLB with some image buffer views' bytes replaced."""
    out = json.loads(json.dumps(doc))
    binary = bytearray()
    for vi, view in enumerate(out['bufferViews']):
        data = images.get(vi)
        if data is None:
            start = base + doc['bufferViews'][vi].get('byteOffset', 0)
            data = bytes(blob[start:start + view['byteLength']])
        binary += b'\0' * (-len(binary) % 4)
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(data)
        binary += data
    binary += b'\0' * (-len(binary) % 4)
    out['buffers'][0]['byteLength'] = len(binary)
    text = json.dumps(out, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    glb = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(binary))
           + struct.pack('<II', len(text), 0x4E4F534A) + text
           + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))
    for key in ('accessors', 'meshes', 'nodes', 'skins', 'materials', 'textures', 'images', 'samplers', 'scenes', 'animations'):
        assert out.get(key) == doc.get(key), key
    return glb


def repaint_hide(blob, doc, base, spec, tail=None, head=None):
    """The cow's hide painted from 3D position; see COW_HIDE. Returns (glb, report).

    `tail` (rebuild_tail's paint) replaces the position box with the exact
    tail vertices and paints the lofted tail from its own parameters. `head`
    (shape_horns's paint) adds the round-6 head paint (_paint_head): eyes,
    ear interiors and horns, at full atlas size over the kept head texels."""
    import io
    head_paint, head = head, None  # `head` is reused below for the head region weight
    from PIL import Image, ImageFilter  # cow and pig only; the fairing path stays numpy-only
    prim = doc['meshes'][0]['primitives'][0]
    get = lambda key: accessor(blob, doc, base, prim['attributes'][key])[0].astype('f8')
    pos, uv = get('POSITION'), get('TEXCOORD_0')
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    albedo_view, albedo_bytes = _image(blob, doc, base, 'baseColorTexture')
    orm_view, orm_bytes = _image(blob, doc, base, 'metallicRoughnessTexture')
    normal_view, normal_bytes = _image(blob, doc, base, 'normal')
    decode = lambda b: np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype('f4')
    albedo_src, orm_src, normal_src = decode(albedo_bytes), decode(orm_bytes), decode(normal_bytes)
    assert albedo_src.shape == orm_src.shape == normal_src.shape, 'maps must share one layout'
    h, w, _ = albedo_src.shape
    res = spec['res']
    to_res = lambda a: np.stack([np.asarray(Image.fromarray(a[..., c].astype('f4'), 'F').resize((res, res), Image.BOX))
                                 for c in range(a.shape[-1])], axis=-1)
    to_full = lambda a: np.asarray(Image.fromarray(a.astype('f4'), 'F').resize((w, h), Image.BILINEAR))
    src = to_res(albedo_src).astype('f8')
    extra = np.zeros((len(pos), 4))
    if tail is not None:
        extra[tail['index']] = tail['values']
    image, face_of = _rasterize(uv, faces, np.hstack([pos, get('NORMAL'), extra]), res)
    covered = face_of >= 0
    p = image[..., :3]
    lum = src.mean(axis=-1)
    pinkness = _smoothstep(spec['pink'][0], spec['pink'][1], src[..., 0] - src[..., 2])
    whiteness = _smoothstep(*spec['whiteLum'], lum) * (1 - pinkness)
    dark = _smoothstep(spec['dark'][1], spec['dark'][0], lum)
    # Region weights, all functions of 3D position.
    head = _smoothstep(*spec['head'], p[..., 2])
    hoof = _smoothstep(spec['hoof'][1], spec['hoof'][0], p[..., 1])
    ts = spec['tail']
    lofted = tail
    if lofted is None:
        tail = (_smoothstep(*ts['z'], p[..., 2]) * _smoothstep(*ts['x'], p[..., 0]) * _smoothstep(*ts['y'], p[..., 1]))
    else:
        tail = np.clip(image[..., 6], 0, 1) * covered
    hide = covered * (1 - head) * (1 - hoof) * (1 - tail)
    # The patch field: splat, blur, normalise by the blurred coverage.
    step = spec['voxel']
    lo = pos.min(axis=0) - 6 * spec['sigma']
    shape = tuple(int(np.ceil(x)) for x in (pos.max(axis=0) + 6 * spec['sigma'] - lo) / step)
    splat = covered & (tail < .5)
    cell = np.clip(((p[splat] - lo) / step).astype(int), 0, np.array(shape) - 1)
    flat = np.ravel_multi_index(cell.T, shape)
    volumes = []
    for values in (np.ones(int(splat.sum())), dark[splat]):
        vol = np.bincount(flat, weights=values, minlength=int(np.prod(shape))).reshape(shape).astype('f4')
        volumes.append(_blur3(vol, spec['sigma'] / step))
    count, dark_vol = volumes
    field = (dark_vol / np.maximum(count, 1e-6))[..., None]
    field[count < 1e-3] = 0
    q = p[covered]
    amp, period = spec['warp']
    fade = (1 - _smoothstep(*spec['warpZ'], q[:, 2])) * _smoothstep(*spec['warpY'], q[:, 1])
    warp = amp * fade[:, None] * np.stack([_value_noise(q, period, seed) for seed in (3.1, 7.7, 13.3)], axis=-1)
    # The barrel's lateral centre (the generator's body sits off x = 0).
    barrel = (pos[:, 2] > -.3) & (pos[:, 2] < .1) & (pos[:, 1] > .35)
    spine = .5 * (pos[barrel, 0].min() + pos[barrel, 0].max())
    shear_amp, shear_w = spec['shear']
    warp[:, 2] += (shear_amp * np.tanh((q[:, 0] - spine) / shear_w) * _smoothstep(*spec['shearY'], q[:, 1])
                   * (1 - _smoothstep(*spec['warpZ'], q[:, 2])))
    n_q = image[..., 3:6][covered]
    n_q /= np.maximum(np.linalg.norm(n_q, axis=1, keepdims=True), 1e-9)
    warp -= (warp * n_q).sum(axis=1, keepdims=True) * n_q
    patch_f = _trilinear(field[..., 0], lo, step, q + warp)
    patch = np.zeros((res, res))
    pink = np.zeros((res, res))
    patch[covered] = _smoothstep(*spec['edge'], patch_f)
    # The udder, from 3D position alone: below the belly line, inside the
    # plan ellipse (round 5; see COW_HIDE['udder']).
    ud = spec['udder']
    radial = np.hypot((q[:, 0] - ud['centre'][0]) / ud['axes'][0], (q[:, 2] - ud['centre'][1]) / ud['axes'][1])
    pink[covered] = _smoothstep(ud['belly'][1], ud['belly'][0], q[:, 1]) * _smoothstep(ud['soft'][1], ud['soft'][0], radial)
    # Kept texels: the cream white gained to the neutral white (horns spared).
    body_white = covered & (hide > .99) & (whiteness > .99)
    white_src = np.median(src[body_white], axis=0)
    white, black = np.array(spec['white']), np.array(spec['black'])
    gain_k = whiteness * (1 - _smoothstep(*spec['horn'], p[..., 1]) * head)
    gained = src * (1 + gain_k[..., None] * (white / white_src - 1))
    painted = white + patch[..., None] * (black - white)
    deepen = _smoothstep(ud['deepen'][1], ud['deepen'][0], p[..., 1])[..., None]
    udder = np.array(ud['colour']) + deepen * (np.array(ud['deep']) - np.array(ud['colour']))
    painted = painted + pink[..., None] * (udder - painted)
    colour = gained + hide[..., None] * (painted - gained)
    if lofted is not None:
        # The lofted tail: the dock continues the rump's hide, the cord is the
        # neutral white, the switch dark with a ragged hairline and a lighter
        # streak along each lock (periodic in the column, so the strips meet).
        tp = spec['tailPaint']
        s_len, t_sw, f_col = image[..., 7], image[..., 8], image[..., 9]
        dock = 1 - _smoothstep(*tp['dock'], s_len)
        cord = white + dock[..., None] * (painted - white)
        wave = np.cos(2 * np.pi * f_col)
        sw = _smoothstep(*tp['switch'], t_sw - tp['ragged'] * wave)
        streak = tp['streakDepth'] * (.5 + .5 * np.cos(4 * np.pi * f_col)) * _smoothstep(.15, .5, t_sw)
        dark = np.array(tp['black']) + streak[..., None] * (np.array(tp['streak']) - np.array(tp['black']))
        tail_colour = cord + sw[..., None] * (dark - cord)
        colour = colour + tail[..., None] * (tail_colour - colour)
        hide = np.maximum(hide, tail)
    # Pad each chart with its own edge colour before resampling.
    filled = covered.copy()
    for _ in range(spec['dilate']):
        acc, cnt = np.zeros_like(colour), np.zeros(filled.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.zeros(filled.shape, bool)
            s_ = (slice(max(dy, 0), res + min(dy, 0)), slice(max(dx, 0), res + min(dx, 0)))
            d_ = (slice(max(-dy, 0), res + min(-dy, 0)), slice(max(-dx, 0), res + min(-dx, 0)))
            sh[d_] = filled[s_]
            acc[d_] += np.where(filled[s_][..., None], colour[s_], 0)
            cnt[d_] += filled[s_]
        grow = ~filled & (cnt > 0)
        colour[grow] = acc[grow] / cnt[grow][:, None]
        hide[grow] = 1.
        filled |= grow
    # Change weights at full size. The hide weight replaces texels; the gain
    # weight (kept regions) is applied to the source at full resolution so the
    # eyes, muzzle and ears keep their own detail.
    hide_w = np.clip(to_full(hide * filled), 0, 1)
    hide_w = np.asarray(Image.fromarray((hide_w * 255).astype('u1'), 'L').filter(
        ImageFilter.GaussianBlur(spec['feather'] / 4))).astype('f4') / 255
    painted_full = np.stack([to_full(colour[..., c]) for c in range(3)], axis=-1)
    gain_full = np.clip(to_full(gain_k * covered), 0, 1)
    albedo_kept = albedo_src * (1 + gain_full[..., None] * (white / white_src - 1)).astype('f4')
    head_w = np.zeros((h, w), 'f4')
    head_report = None
    if head_paint is not None:
        hy, hx, h_col, h_wt, head_report = _paint_head(albedo_kept, albedo_src, uv, faces, pos, get('NORMAL'),
                                                       spec['headShape'], head_paint)
        albedo_kept[hy, hx] += (h_wt[:, None] * (h_col - albedo_kept[hy, hx])).astype('f4')
        head_w[hy, hx] = h_wt
    albedo = albedo_kept + hide_w[..., None] * (painted_full - albedo_kept)
    normal = normal_src + hide_w[..., None] * (np.array([128., 128., 255.]) - normal_src)
    orm = orm_src.copy()
    orm[..., 1] += hide_w * (spec['roughness'] * 255 - orm[..., 1])
    reach = covered.copy()
    for _ in range(2):
        reach[1:] |= reach[:-1]; reach[:-1] |= reach[1:]; reach[:, 1:] |= reach[:, :-1]; reach[:, :-1] |= reach[:, 1:]
    known = np.asarray(Image.fromarray(reach.astype('u1') * 255, 'L').resize((w, h), Image.NEAREST)) > 127
    albedo, orm, normal = (_pull_push(a, known) for a in (albedo, orm, normal))
    def encode(a):
        out = io.BytesIO()
        Image.fromarray(np.clip(np.rint(a), 0, 255).astype('u1'), 'RGB').save(
            out, 'JPEG', quality=92, subsampling=0, optimize=True)
        return out.getvalue()
    albedo_out, orm_out, normal_out = encode(albedo), encode(orm), encode(normal)
    # Read back what a renderer will sample, not what was intended.
    albedo_chk, orm_chk, normal_chk = decode(albedo_out), decode(orm_out), decode(normal_out)
    untouched = known & (hide_w < .01) & (gain_full < .01) & (head_w < .01)
    assert untouched.mean() > .05, 'no kept texels'
    assert np.abs(albedo_chk[untouched] - albedo_src[untouched]).mean() < 2.5, 'kept albedo moved'
    assert np.abs(normal_chk[known & (hide_w < .01)] - normal_src[known & (hide_w < .01)]).mean() < 2.5, 'kept normal moved'
    core = known & (hide_w > .99)
    hide_rough = float(np.median(orm_chk[..., 1][core])) / 255
    assert abs(hide_rough - spec['roughness']) < .02, f'hide roughness median {hide_rough:.3f}'
    assert np.abs(orm_chk[..., [0, 2]][known] - orm_src[..., [0, 2]][known]).mean() < 2, 'occlusion or metalness moved'
    # The white is neutral: hide texels that are white read with equal channels.
    white_chk = albedo_chk[core & (to_full(patch * covered) < .01) & (to_full(pink * covered) < .01)
                           & (to_full(tail * covered) < .01)]
    white_after = np.median(white_chk, axis=0)
    assert np.ptp(white_after) < 8, f'white not neutral {white_after}'
    # Seams: where one surface edge is cut into two UV edges, compare colour
    # just inside each side. A 3D paint must agree across the cut.
    first, inverse = _weld(pos)
    welded = inverse[faces]
    keys = np.vstack([np.sort(np.stack([welded[:, i], welded[:, (i + 1) % 3]], axis=1), axis=1) for i in range(3)])
    owner = np.vstack([np.stack([np.arange(len(faces)), np.full(len(faces), i)], axis=1) for i in range(3)])
    order = np.lexsort((keys[:, 1], keys[:, 0]))
    keys, owner = keys[order], owner[order]
    pair = np.flatnonzero(np.all(keys[1:] == keys[:-1], axis=1))
    def inner_uv(face, corner):
        c = uv[faces[face]]
        idx = np.arange(len(face))
        return .5 * (c[idx, corner] + c[idx, (corner + 1) % 3]) * .85 + .15 * c[idx, (corner + 2) % 3]
    fa, fb = owner[pair], owner[pair + 1]
    ua, ub = inner_uv(fa[:, 0], fa[:, 1]), inner_uv(fb[:, 0], fb[:, 1])
    cut = np.linalg.norm(ua - ub, axis=1) > 4 / w
    sample = lambda img, t: img[np.clip((t[:, 1] * h).astype(int), 0, h - 1), np.clip((t[:, 0] * w).astype(int), 0, w - 1)]
    on_hide = (sample(hide_w, ua) > .99) & (sample(hide_w, ub) > .99) & cut
    # The two samples are different surface points 15% into each face, so a
    # patch edge running beside the cut still differs legitimately (about 4%
    # of cut edges, source and repaint alike): require no worse than the
    # source on average and agreement on nine cut edges in ten.
    steps = [np.abs(sample(img, ua) - sample(img, ub)).mean(axis=-1)[on_hide] for img in (albedo_src, albedo_chk)]
    seam = [round(float(s.mean()), 2) for s in steps]
    seam_p90 = [round(float(np.percentile(s, 90)), 2) for s in steps]
    assert on_hide.sum() > 50 and seam[1] <= seam[0] and seam_p90[1] <= 2.5, f'seam colour step {seam} p90 {seam_p90}'
    glb = _repack_images(blob, doc, base, {albedo_view: albedo_out, orm_view: orm_out, normal_view: normal_out})
    # Everything but the three images is byte-identical.
    _, doc2, base2 = load_glb_bytes(glb)
    for vi in range(len(doc['bufferViews'])):
        if vi in (albedo_view, orm_view, normal_view):
            continue
        a0 = base + doc['bufferViews'][vi].get('byteOffset', 0)
        b0 = base2 + doc2['bufferViews'][vi]['byteOffset']
        n = doc['bufferViews'][vi]['byteLength']
        assert bytes(blob[a0:a0 + n]) == glb[b0:b0 + n], f'bufferView {vi} changed'
    return glb, {
        'bake': res, 'spineX': round(float(spine), 4), 'maxWarp': round(float(np.linalg.norm(warp, axis=1).max()), 4),
        'coverage': round(float(covered.mean()), 4),
        'hideFraction': round(float(core.mean()), 4),
        'patchFraction': round(float((patch[covered & (hide > .99)] > .5).mean()), 4),
        'whiteBefore': [round(float(x)) for x in white_src], 'whiteAfter': [round(float(x)) for x in white_after],
        'hideRoughnessMedian': [round(float(np.median(orm_src[..., 1][core])) / 255, 3), round(hide_rough, 3)],
        'seamEdges': int(on_hide.sum()), 'seamColourStep': seam, 'seamColourStepP90': seam_p90,
        'imageBytes': {'albedo': len(albedo_out), 'orm': len(orm_out), 'normal': len(normal_out)},
        **({'head': head_report} if head_report else {}),
    }


# Cow torso (round 2). The generator pressed shallow dents into the barrel,
# shoulder and hip and left a wavy topline; Taubin fairing (PROFILES 'cow')
# keeps them because it only averages neighbours. smooth_torso redefines the
# torso as the level set of a blurred body volume (the pig's method, see
# smooth_body, rewritten for the cow's frame: +Z head, -Z rump, X lateral,
# +Y up): the welded mesh is voxelised, the hanging tail is cleared out of
# the volume behind the rump, the occupancy is blurred with a Gaussian small
# enough (sigma) to keep the shoulder and hip masses, and each torso vertex is
# carried along the field's gradient onto the blurred iso-surface. Weights
# fade the stage out toward the head and neck, the tail root, the udder and
# the legs below the belly, so those keep their own form and bounds. Normals
# of moved vertices come from the field's gradient (blended by weight into
# the moved mesh's smooth normals). Only POSITION and NORMAL bytes change;
# topology, UV, skin and every other byte are untouched, and the repaint that
# follows paints the hide onto the moved surface.
COW_TORSO = {
    # Voxel and blur in source units (the Tripo unit box: 1.0 = body length).
    'voxel': .004, 'sigma': .03, 'iso': .385,
    # Weight ramps (full, zero): toward the head along z, toward the tail
    # root along -z; (zero, full) above the belly along y.
    'head': (.10, .21), 'rump': (-.40, -.46), 'y': (.20, .28),
    # Legs: zero within d0 of a foot's vertical axis below h0, full past d1
    # or above h1 (horizontal distance, height).
    'legFade': ((.05, .095), (.28, .37)),
    # Kept spheres (centre, (inner, outer)): the udder, and the crotch
    # between the hind legs above and behind it (a blur fills a concave gap,
    # which would web the inner thighs together).
    'keep': (((-.025, .235, -.315), (.06, .095)), ((-.025, .33, -.33), (.07, .11)),
             ((-.025, .35, -.43), (.06, .10))),
    # The tail behind the rump is cleared from the volume (z below, x
    # above) and its vertices are weighted out (COW_HIDE['tail'], set below).
    'tailClip': (-.468, .005),
    # Largest move of any vertex (source units) and the width window the
    # normalizer accepts at its fixed length scale (manifest 0.626-0.646 m at
    # 1.805 m / source length).
    'maxMove': .03, 'width': (.3470, .3570),
}


def smooth_torso(blob, doc, base, spec):
    """The cow's torso onto a blurred body volume, in place; see COW_TORSO."""
    prim = doc['meshes'][0]['primitives'][0]
    pos_a = accessor(blob, doc, base, prim['attributes']['POSITION'])[0]
    nor_a = accessor(blob, doc, base, prim['attributes']['NORMAL'])[0]
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = pos_a.astype('f8')
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    step, sigma, iso = spec['voxel'], spec['sigma'], spec['iso']
    pad = 4 * sigma + 2 * step
    lo = P.min(axis=0) - pad + step * np.array([.2371, .3119, .4127])  # off-lattice
    shape = tuple(int(np.ceil(s)) for s in (P.max(axis=0) + pad - lo) / step)
    occ = _occupancy(P, F, lo, step, shape)
    gx, gz = [lo[k] + (np.arange(shape[k]) + .5) * step for k in (0, 2)]
    tz, tx = spec['tailClip']
    occ[np.ix_(gx > tx, np.ones(shape[1], bool), gz < tz)] = 0
    field = _blur3(occ, sigma / step)
    grad = np.stack(np.gradient(field, step), axis=-1)
    # The field is a body: about 1 inside the barrel, 0 well outside.
    probe = _trilinear(field, lo, step, np.array([[P[:, 0].mean(), .42, -.12], [0., .9, 0.]]))
    assert probe[0] > .95 and probe[1] < .01, f'body field probe {probe}'
    ramp = _smoothstep
    w = (ramp(spec['head'][1], spec['head'][0], P[:, 2]) * ramp(spec['rump'][1], spec['rump'][0], P[:, 2])
         * ramp(*spec['y'], P[:, 1]))
    for centre, (inner, outer) in spec['keep']:
        w *= ramp(inner, outer, np.linalg.norm(P - np.array(centre), axis=1))
    ts = spec['tail']  # the hanging tail, as the hide repaint masks it
    w *= 1 - ramp(*ts['z'], P[:, 2]) * ramp(*ts['x'], P[:, 0]) * ramp(*ts['y'], P[:, 1])
    (d0, d1), (h0, h1) = spec['legFade']
    feet = P[:, 1] < .03
    mid_x, mid_z = np.median(P[feet, 0]), np.median(P[feet, 2])
    for sx in (1, -1):
        for sz in (1, -1):
            foot = feet & (np.sign(P[:, 0] - mid_x) == sx) & (np.sign(P[:, 2] - mid_z) == sz)
            c = P[foot][:, [0, 2]].mean(axis=0)
            d = np.hypot(P[:, 0] - c[0], P[:, 2] - c[1])
            w *= np.maximum(ramp(d0, d1, d), ramp(h0, h1, P[:, 1]))
    q = P.copy()
    for _ in range(12):
        f = _trilinear(field, lo, step, q)
        g = _trilinear(grad, lo, step, q)
        delta = ((f - iso) / np.maximum((g * g).sum(axis=1), 1e-9))[:, None] * g
        length = np.linalg.norm(delta, axis=1)
        q -= delta * np.minimum(1, 2 * step / np.maximum(length, 1e-12))[:, None]
    residual = np.abs(_trilinear(field, lo, step, q) - iso)
    w[residual > .02] = 0  # a vertex the field cannot place stays where it was
    move = np.linalg.norm(q - P, axis=1)
    w *= np.clip((2 * spec['maxMove'] - move) / spec['maxMove'], 0, 1)  # far moves fade out
    original = P.copy()
    p = P + w[:, None] * (q - P)
    old_cross = np.cross(original[F[:, 1]] - original[F[:, 0]], original[F[:, 2]] - original[F[:, 0]])
    eased = 0
    for attempt in range(24):
        new_cross = np.cross(p[F[:, 1]] - p[F[:, 0]], p[F[:, 2]] - p[F[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        moved = np.unique(F[flipped])
        eased += len(moved)
        p[moved] = original[moved] + (.5 if attempt < 23 else 0) * (p[moved] - original[moved])
    # Round 3: each side is widened back to its own source extreme, faded by
    # the stage weight (the horse's width rule). Round 2 let the -x flank
    # come in 2.7 mm of source; the normalizer centres on the bounds, so its
    # Pivot moved 2.4 mm, and cowRestMotion.ts's metre thresholds then found
    # 29 right-ear vertices instead of 27 and turned the herd's rest motion
    # off. Exact extremes keep the Pivot, the scale and those regions.
    width_scale = []
    for side, bound in ((1, original[:, 0].max()), (-1, original[:, 0].min())):
        sel = np.sign(p[:, 0]) == side
        reach = lambda k_: float(np.max(side * p[sel, 0] * (1 + (k_ - 1) * w[sel])))
        k_lo, k_hi = 1., 1.1
        if reach(k_lo) >= side * bound:
            width_scale.append(1.)
            continue
        assert reach(k_hi) > side * bound, 'torso cannot be widened back to the width extreme'
        for _ in range(80):
            k_mid = .5 * (k_lo + k_hi)
            k_lo, k_hi = (k_mid, k_hi) if reach(k_mid) < side * bound else (k_lo, k_mid)
        p[sel, 0] *= 1 + (k_hi - 1) * w[sel]
        width_scale.append(round(k_hi, 5))
    if (np.max(p[:, 0]) > original[:, 0].max()) or (np.min(p[:, 0]) < original[:, 0].min()):
        p[:, 0] = np.clip(p[:, 0], original[:, 0].min(), original[:, 0].max())
    width = float(np.ptp(p[:, 0]))
    assert np.allclose([p[:, 0].min(), p[:, 0].max()], [original[:, 0].min(), original[:, 0].max()], atol=1e-7), 'width extremes moved'
    assert spec['width'][0] <= width <= spec['width'][1], f'width {width:.4f} outside {spec["width"]}'
    assert np.allclose(p[:, 1:].min(axis=0), original[:, 1:].min(axis=0), atol=1e-7), 'height or length low end moved'
    assert np.allclose(p[:, 1:].max(axis=0), original[:, 1:].max(axis=0), atol=1e-7), 'height or length high end moved'
    disp = np.linalg.norm(p - original, axis=1)
    touched = disp > 1e-7
    # Normals: the field's gradient where the stage owns the surface, the
    # moved mesh's own smooth normal where it fades out; untouched vertices
    # whose one-ring did not move keep their bytes.
    g = _trilinear(grad, lo, step, p)
    field_n = -g / np.maximum(np.linalg.norm(g, axis=1), 1e-12)[:, None]
    mesh_n = _smooth_normals(p, F)
    ring = touched.copy()
    ring[F[touched[F].any(axis=1)].ravel()] = True
    blend = w[:, None] * field_n + (1 - w[:, None]) * mesh_n
    blend /= np.maximum(np.linalg.norm(blend, axis=1), 1e-12)[:, None]
    new_nor = nor_a.astype('f8')
    redo = ring[inverse]
    new_nor[redo] = blend[inverse][redo]
    core = w > .5
    dihedral = lambda x: np.percentile(_dihedrals(x, F, core), (90, 99)).round(1).tolist()
    report = {
        'movedVertices': int(touched.sum()), 'coreVertices': int(core.sum()),
        'maxDisplacement': round(float(disp.max()), 4), 'meanDisplacementCore': round(float(disp[core].mean()), 4),
        'flipEased': eased, 'width': [round(float(np.ptp(original[:, 0])), 4), round(width, 4)], 'widthScale': width_scale,
        'dihedralP90P99': [dihedral(original), dihedral(p)],
        'normalsRewritten': int(redo.sum()),
    }
    pos_a[:] = p[inverse].astype('<f4')
    nor_a[:] = new_nor.astype('<f4')
    assert np.isfinite(pos_a).all() and np.isfinite(nor_a).all()
    return report


# Cow lower legs (round 3, 2026-11-05). Three judged rounds read the lower
# legs as thin straight tubes with small hooves under a heavy barrel. No round
# had touched them. A loft (the pig's loft_legs) would delete and re-mesh each
# leg, but the cow's topology is a runtime contract: cowRestMotion.ts fits its
# ear, tail and breathing regions only on exactly 4,138 vertices and 17,958
# indices, with a 437-vertex tail component found by metre thresholds. So
# each leg is rebuilt in place, by its traced profile and its joints:
#   1. Each leg is segmented by surface flood from its sole band (the
#      runtime walk's own rule), held below `top`, off the udder and the
#      hanging tail (COW_HIDE['tail']).
#   2. Its front-view and side-view silhouettes are traced per height band:
#      the centre and the four half-extents (outer, inner, front, back),
#      smoothed along the leg.
#   3. A target profile is authored against those traces as joint
#      multipliers along the height (`front` and `hind` knots: hoof, coronet,
#      pastern pinch, fetlock knob, cannon, knee or hock, forearm or gaskin,
#      faded out up into the body by `fade`): every leg vertex is placed on
#      the target by its own fraction of the traced half-extent on its side,
#      so the cross-section keeps its shape while the profile changes.
#   4. The front knee is modelled as a joint (`knee`): a forward knob and a
#      small forward set of the centre line over the carpus, so the leg
#      breaks at the knee instead of running straight from elbow to hoof.
#   5. The hind legs hold their back line (`holdBack`): the hock's point and
#      the back of the cannon stay where they are, so the hock reads by the
#      cannon widening forward under it, and no vertex crosses the runtime
#      tail region's z threshold.
# The soles stay on the ground (heights never change); only POSITION and
# NORMAL bytes change. Normals of every vertex whose one-ring moved are the
# moved mesh's angle-weighted normals (split hard edges kept).
COW_LEGS = {
    # Flood and fade heights (source units; legs are about 0.33 tall).
    'top': .30, 'seed': .02,
    'fade': {'front': (.20, .27), 'hind': (.23, .30)},
    # Kept spheres (centre, radius): the udder.
    'udder': ((-.025, .235, -.315), .075),
    # Height bands for the trace (step, each reading the vertices within
    # `window` of its centre) and their smoothing (sigma, in bands).
    'band': .01, 'window': .016, 'sigma': 1.5,
    # Lateral gate (full, none): radial distance from the traced centre as a
    # fraction of the traced section (read no higher than `clean`, where the
    # leg is clean of the body); past it a flooded vertex is chest or belly.
    'clean': .19, 'gate': (1.5, 2.2),
    # Joint multipliers of the traced half-extent against height, per side
    # group: (y, lateral, front, back). Lateral covers outer and inner.
    # Round 3 measured the generator's front cannon at 0.046 wide under a
    # 0.35 barrel; these take it to about 0.056, the hoof 14% larger.
    'front': ((0., 1.14, 1.14, 1.12), (.035, 1.14, 1.14, 1.10), (.055, 1.10, 1.08, 1.08),
              (.075, 1.25, 1.22, 1.20), (.095, 1.22, 1.20, 1.16), (.125, 1.21, 1.20, 1.15),
              (.155, 1.22, 1.24, 1.12), (.185, 1.15, 1.14, 1.08), (.23, 1.06, 1.05, 1.03), (.28, 1., 1., 1.)),
    'hind': ((0., 1.14, 1.14, 1.), (.035, 1.14, 1.14, 1.), (.055, 1.10, 1.08, 1.), (.075, 1.25, 1.22, 1.),
             (.10, 1.22, 1.22, 1.), (.15, 1.21, 1.22, 1.), (.19, 1.16, 1.16, 1.), (.24, 1.07, 1.06, 1.),
             (.30, 1., 1., 1.)),
    'holdBack': True,
    # Front knee: forward set of the centre line (amplitude, height, width).
    'knee': (.005, .155, .022),
}


def shape_legs(blob, doc, base, spec):
    """The cow's lower legs reshaped by traced profile and joints, in place; see COW_LEGS."""
    prim = doc['meshes'][0]['primitives'][0]
    pos_a = accessor(blob, doc, base, prim['attributes']['POSITION'])[0]
    nor_a = accessor(blob, doc, base, prim['attributes']['NORMAL'])[0]
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = pos_a.astype('f8')
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    original = P.copy()
    ts = spec['tail']
    tail = _smoothstep(*ts['z'], P[:, 2]) * _smoothstep(*ts['x'], P[:, 0]) * _smoothstep(*ts['y'], P[:, 1]) > .02
    ucentre, uradius = spec['udder']
    allowed = (P[:, 1] < spec['top']) & ~tail & (np.linalg.norm(P - np.array(ucentre), axis=1) > uradius)
    # 1. Legs by multi-source flood (Dijkstra by edge length) from the soles.
    edges = _edges(F)
    edges = edges[allowed[edges].all(axis=1)]
    length = np.linalg.norm(P[edges[:, 0]] - P[edges[:, 1]], axis=1)
    import heapq
    adj = [[] for _ in range(len(P))]
    for (a, b), l in zip(edges, length):
        adj[a].append((b, l))
        adj[b].append((a, l))
    feet = allowed & (P[:, 1] < spec['seed'])
    # The middle of the four soles' extent (the generator's legs sit off
    # centre, so a median falls inside the left feet).
    mid_x, mid_z = .5 * (P[feet, 0].min() + P[feet, 0].max()), .5 * (P[feet, 2].min() + P[feet, 2].max())
    owner = np.full(len(P), -1)
    dist = np.full(len(P), np.inf)
    heap = []
    legs = []
    for sx in (1, -1):
        for sz in (1, -1):
            k = len(legs)
            seeds = np.flatnonzero(feet & (np.sign(P[:, 0] - mid_x) == sx) & (np.sign(P[:, 2] - mid_z) == sz))
            assert len(seeds) > 20, f'leg {k} sole band {len(seeds)}'
            legs.append({'front': sz > 0, 'side': sx})
            for v in seeds:
                dist[v], owner[v] = 0., k
                heapq.heappush(heap, (0., int(v), k))
    while heap:
        d, v, k = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for u, l in adj[v]:
            if d + l < dist[u]:
                dist[u], owner[u] = d + l, k
                heapq.heappush(heap, (d + l, u, k))
    p = P.copy()
    report = {}
    step, sigma = spec['band'], spec['sigma']
    for k, leg in enumerate(legs):
        mine = owner == k
        group = 'front' if leg['front'] else 'hind'
        knots = np.array(spec[group])
        fade_lo, fade_hi = spec['fade'][group]
        # 2. Trace: centre and half-extents per height band, smoothed.
        n_band = int(np.ceil(spec['top'] / step))
        centre = np.full((n_band, 2), np.nan)
        half = np.full((n_band, 4), np.nan)  # +x, -x, +z, -z from the centre
        for b in range(n_band):
            sel = mine & (np.abs(P[:, 1] - (b + .5) * step) < spec['window'])
            if sel.sum() < 4:
                continue
            q = P[sel][:, [0, 2]]
            lo_, hi_ = q.min(axis=0), q.max(axis=0)
            centre[b] = .5 * (lo_ + hi_)
            half[b] = [.5 * (hi_[0] - lo_[0])] * 2 + [.5 * (hi_[1] - lo_[1])] * 2
        good = ~np.isnan(centre[:, 0])
        assert good[:int(.2 / step)].all(), f'leg {k} trace has gaps below 0.2'
        ys = (np.arange(n_band) + .5) * step
        for arr in (centre, half):
            for c in range(arr.shape[1]):
                arr[:, c] = np.interp(ys, ys[good], arr[good, c])
                arr[:, c] = _gauss1(arr[:, c], sigma, 0)
        y = P[mine, 1]
        cx = np.interp(y, ys, centre[:, 0])
        cz = np.interp(y, ys, centre[:, 1])
        # 3. Joint multipliers by height and side, faded up into the body and
        # out sideways past the traced section (the chest and belly the flood
        # reaches above the legs keep their place).
        dx = P[mine, 0] - cx
        dz = P[mine, 2] - cz
        clean = np.minimum(y, spec['clean'])
        hx, hz = np.interp(clean, ys, half[:, 0]), np.interp(clean, ys, half[:, 2])
        reach = np.hypot(dx / hx, dz / hz)
        fade = (1 - _smoothstep(fade_lo, fade_hi, y)) * (1 - _smoothstep(*spec['gate'], reach))
        lat = 1 + fade * (np.interp(y, knots[:, 0], knots[:, 1]) - 1)
        fwd = 1 + fade * (np.interp(y, knots[:, 0], knots[:, 2]) - 1)
        back = 1 + fade * (np.interp(y, knots[:, 0], knots[:, 3]) - 1)
        new_x = cx + dx * lat
        new_z = cz + dz * np.where(dz > 0, fwd, back)
        # 4. The front knee: a forward set of the centre over the carpus.
        if leg['front']:
            amp, yk, wk = spec['knee']
            new_z += fade * amp * np.exp(-.5 * ((y - yk) / wk) ** 2)
        p[mine, 0], p[mine, 2] = new_x, new_z
        b_c = int(.11 / step)
        report[f'leg{k}'] = {'group': group, 'vertices': int(mine.sum()),
                             'cannonHalfWidth': [round(float(half[b_c, 0]), 4), round(float(half[b_c, 0] * np.interp(.11, knots[:, 0], knots[:, 1])), 4)],
                             'hoofHalfWidth': [round(float(half[1, 0]), 4), round(float(half[1, 0] * knots[0, 1]), 4)]}
    # Flip guard: ease any vertex whose face would invert back toward the source.
    old_cross = np.cross(original[F[:, 1]] - original[F[:, 0]], original[F[:, 2]] - original[F[:, 0]])
    eased = 0
    for attempt in range(24):
        new_cross = np.cross(p[F[:, 1]] - p[F[:, 0]], p[F[:, 2]] - p[F[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        moved = np.unique(F[flipped])
        eased += len(moved)
        p[moved] = original[moved] + (.5 if attempt < 23 else 0) * (p[moved] - original[moved])
    assert np.array_equal(p[:, 1], original[:, 1]), 'a leg height moved'
    assert np.allclose(p.min(axis=0), original.min(axis=0), atol=1e-7) and np.allclose(p.max(axis=0), original.max(axis=0), atol=1e-7), 'bounds moved'
    if spec['holdBack']:
        hind = np.isin(owner, [k for k, leg in enumerate(legs) if not leg['front']])
        assert (p[hind, 2] >= original[hind, 2] - 1e-9).all(), 'a hind leg grew backward'
    disp = np.linalg.norm(p - original, axis=1)
    touched = disp > 1e-9
    ring = touched.copy()
    ring[F[touched[F].any(axis=1)].ravel()] = True
    new_pos = p[inverse]
    new_nor = normals(new_pos, faces, inverse, nor_a.astype('f8'))
    redo = ring[inverse]
    out_nor = nor_a.astype('f8')
    out_nor[redo] = new_nor[redo]
    report.update({'movedVertices': int(touched.sum()), 'maxDisplacement': round(float(disp.max()), 4),
                   'flipEased': eased, 'normalsRewritten': int(redo.sum())})
    pos_a[:] = new_pos.astype('<f4')
    nor_a[:] = out_nor.astype('<f4')
    assert np.isfinite(pos_a).all() and np.isfinite(nor_a).all()
    return report


# Cow tail (round 4). The generator's tail is a cord about four vertices round
# running down the back of the left thigh into a crumpled knot behind the hock
# (190 of the tail's 252 welded nodes; tangled, Euler characteristic -9, with
# a hole), painted dark: from behind it read as a stripe on the leg and a stray
# black patch on the hock, and never as a switch. Moving those vertices cannot
# untangle them (re-placed onto any tuft, 75 of 508 faces stayed inverted, and
# the material is single sided), so rebuild_tail deletes the 508 tail-only
# faces and lofts a new tail into the same vertex and index slots:
#   - its first ring is the generator's own root loop (10 nodes; the 22 faces
#     joining it to the rump keep every byte), so the joint is unchanged;
#   - the centre line is an authored side and back profile: a dock leaving the
#     tailhead along the root loop's own normal, arcing clear of the pin bones
#     and hanging plumb, drawn in toward the midline so from behind it falls
#     along the inside of the left hock instead of down its middle;
#   - the cord is a tapered tube (12 round) on a rotation-minimising frame, the
#     switch a lofted teardrop (14 round) whose section is seven lobes (locks)
#     that deepen, twist and lengthen toward the end and close to one point;
#   - every new vertex gets a UV in one of two free atlas rectangles (a strip
#     per column: six cord columns, seven lock columns), and the hide stage
#     paints the tail from its own parameters (cord continuing the rump's hide
#     at the dock, then white; the switch dark with lock streaks).
# The runtime fingerprint is a contract and is held exactly: 4138 vertices and
# 17958 indices; the rest-motion regions read 41 / 27 / 437 (cowRestMotion.ts,
# simulated here in the normalized frame); every tail vertex stays inside the
# runtime's tail box and at or above 0.30 m (the rest test scores points below
# 0.29 m as flank); the rearmost point is pinned to the source's exact z, so
# the normalizer's scale and centre, and so its Pivot, cannot move. The ring
# and seam counts are chosen so the tail uses exactly the 424 freed vertex
# slots and 508 triangles with every vertex referenced and unique (the
# normalizer welds bitwise-identical vertices and drops unreferenced ones).
# Only POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0 and index bytes of
# the tail and its root change; JSON is identical.
COW_TAIL = {
    # Normalizer target length along z (normalize-model-assets.mjs farm-cow).
    'scale': 1.805,
    # cowRestMotion.ts regions in delivered metres: (lower, upper) bounds per
    # axis (None = open) and the seed each flood starts nearest to.
    'regions': {
        'leftEar': (((.19, None), (.98, None), (.43, None)), (.31, 1.09, .51)),
        'rightEar': (((None, -.19), (.98, None), (.43, None)), (-.26, 1.09, .66)),
        'tail': (((.04, .25), (None, .95), (None, -.8)), (.12, .34, -.87)),
    },
    'counts': {'vertices': 4138, 'indices': 17958, 'leftEar': 41, 'rightEar': 27, 'tail': 437},
    # Lowest tail point (delivered metres) and least clearance from the body
    # for vertices past the first two rings (source units).
    'floor': .30, 'clearance': .004,
    # Dock: distance along the root loop's normal before the profile takes over.
    'dock': .012,
    # Centre line after the dock (source units, Tripo frame: +Z head, +X the
    # cow's left, +Y up): clear of the pin bones, then plumb, drawn from x
    # 0.050 at the root toward the midline, the switch eased back out so its
    # widest lock clears the runtime box floor (x 0.0221) by 2 mm.
    'line': ((.0488, .478, -.4905), (.0470, .42, -.4905), (.0458, .35, -.4890),
             (.0458, .31, -.4870), (.0465, .245, -.4822), (.0468, .168, -.4815)),
    # Junction between cord and switch (y on the centre line).
    'switchTop': .31,
    # Cord: arc fraction of the seven rings below the root loop (the last is
    # the junction; the first clears the loop's lowest node, which hangs 2 cm
    # below its centre), and radius against arc fraction.
    'cordRings': (.12, .19, .28, .41, .58, .78, 1.),
    'cordRadius': ((0., .0105), (.06, .0094), (.16, .0082), (.45, .0074), (1., .0070)),
    # Ring 1 keeps this share of the root loop's own radial shape.
    'rootShape': .4,
    # Switch: arc fraction (junction 0, point 1) of ring 8 (11 round) and the
    # eleven lock rings (14 round); radius, lobe depth and twist (radians)
    # against that fraction; per-lock extra length (source units) faded in
    # over the end.
    'switchRings': (.05, .12, .21, .31, .41, .51, .61, .70, .79, .87, .925, .965),
    'switchRadius': ((0., .0074), (.15, .0095), (.35, .0125), (.55, .0142), (.70, .0140),
                     (.82, .0120), (.91, .0088), (.965, .0052), (1., 0.)),
    'lobe': ((0., 0.), (.12, .12), (.40, .28), (.70, .36), (1., .45)),
    'twist': .55,
    'lockLength': (.0022, .0006, .0030, .0014, .0026, .0004, .0018), 'lockFade': (.6, .92),
    # Column structure: segments per column. Root loop 10 into 6 columns, cord
    # rings 12 = 6 x 2; junction ring 12 into the 7 lock columns, ring 8 11,
    # lock rings 14 = 7 x 2; the point is split per segment.
    'rootColumns': (2, 2, 2, 2, 1, 1), 'cordColumns': (2,) * 6,
    'junctionColumns': (2, 2, 2, 2, 2, 1, 1), 'ring8Columns': (2, 2, 2, 2, 1, 1, 1), 'lockColumns': (2,) * 7,
    # Atlas rectangles in 512-texel units, found free of every other island
    # with a 3-texel margin (asserted): first column u, first row v, column
    # width, gutter, height.
    'atlas': 512,
    'cordRect': (493, 322, 2, 1, 94), 'switchRect': (189, 41, 4, 1, 64),
    # Paint (hide stage): the dock continues the rump's hide over this
    # overall-length fraction ramp, then the cord is the neutral white; the
    # switch darkens over this switch-fraction ramp, its hairline ragged by
    # lock, with lighter streaks along each lock.
    'paint': {'dock': (.05, .14), 'switch': (.03, .17), 'ragged': .05,
              'black': (24., 22., 23.), 'streak': (62., 58., 56.), 'streakDepth': .45},
}


def _cow_rest_regions(pos, faces, spec):
    """cowRestMotion.ts's three regions, in the normalized frame: render-vertex sets."""
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    k = spec['scale'] / (hi[2] - lo[2])
    m = (pos - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])) * k
    _, first, ids = np.unique(np.round(m * 1e5).astype('i8'), axis=0, return_index=True, return_inverse=True)
    ids = ids.reshape(-1)
    nodes = m[first]
    e = np.unique(np.sort(ids[np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))], axis=1), axis=0)
    adj = [[] for _ in nodes]
    for a, b in e:
        adj[a].append(b)
        adj[b].append(a)
    out = {}
    for name, (box, seed) in spec['regions'].items():
        ok = np.ones(len(nodes), bool)
        for axis, (lo_, hi_) in enumerate(box):
            if lo_ is not None:
                ok &= nodes[:, axis] > lo_
            if hi_ is not None:
                ok &= nodes[:, axis] < hi_
        d = ((nodes - np.array(seed)) ** 2).sum(axis=1)
        d[~ok] = np.inf
        start = int(np.argmin(d))
        found = np.zeros(len(nodes), bool)
        if np.isfinite(d[start]):
            found[start] = True
            queue = [start]
            for v in queue:
                for u in adj[v]:
                    if ok[u] and not found[u]:
                        found[u] = True
                        queue.append(u)
        out[name] = np.flatnonzero(found[ids])
    return out, k


def _catmull(points, per):
    pts = np.asarray(points, 'f8')
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = ext[i:i + 4]
        for t in np.linspace(0, 1, per, endpoint=False):
            out.append(.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                             + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return np.array(out)


def _band(up, su, dn, sd):
    """Triangles between two open polylines running the same way (params 0-1);
    upper edges are used reversed, as the root loop's hole requires."""
    a = b = 0
    tris = []
    while a < len(up) - 1 or b < len(dn) - 1:
        if b == len(dn) - 1 or (a < len(up) - 1 and su[a + 1] <= sd[b + 1]):
            tris.append((up[a + 1], up[a], dn[b])); a += 1
        else:
            tris.append((up[a], dn[b], dn[b + 1])); b += 1
    return tris


def rebuild_tail(blob, doc, base, spec):
    """The cow's tail deleted and lofted afresh in its own slots; see COW_TAIL.
    Edits POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0 and index bytes in
    place. Returns (report, paint): paint holds each new vertex's slot and its
    (tail, overall length fraction, switch fraction, column fraction) for the
    hide stage."""
    import heapq
    prim = doc['meshes'][0]['primitives'][0]
    view = lambda key: accessor(blob, doc, base, prim['attributes'][key])[0]
    pos_a, nor_a, uv_a, joints_a, weights_a = (view(k) for k in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'))
    idx_a = accessor(blob, doc, base, prim['indices'])[0]
    counts = spec['counts']
    assert len(pos_a) == counts['vertices'] and idx_a.size == counts['indices'], 'source fingerprint'
    pos = pos_a.astype('f8')
    faces = idx_a.reshape(-1, 3).astype('i8')
    lo0, hi0 = pos_a.min(axis=0).copy(), pos_a.max(axis=0).copy()
    regions, k_scale = _cow_rest_regions(pos, faces, spec)
    assert {n: len(v) for n, v in regions.items()} == {n: counts[n] for n in ('leftEar', 'rightEar', 'tail')}, 'source regions'
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    tail = np.zeros(len(P), bool)
    tail[inverse[regions['tail']]] = True
    assert np.array_equal(np.flatnonzero(tail[inverse]), regions['tail']), 'tail is not whole nodes'
    only = tail[F].all(axis=1)
    straddle = tail[F].any(axis=1) & ~only
    keep = np.unique(faces[straddle][tail[F[straddle]]])
    slots = np.setdiff1d(regions['tail'], keep)
    # The two atlas rectangles are free of every retained island by 3 texels.
    res = spec['atlas']
    _, owner = _rasterize(uv_a.astype('f8'), faces[~only], np.zeros((len(pos), 1)), res)
    used = owner >= 0
    for _ in range(3):
        grown = used.copy()
        grown[1:] |= used[:-1]; grown[:-1] |= used[1:]; grown[:, 1:] |= used[:, :-1]; grown[:, :-1] |= used[:, 1:]
        used = grown
    for name in ('cordRect', 'switchRect'):
        u0, v0, w, gap, h = spec[name]
        cols = len(spec['cordColumns'] if name == 'cordRect' else spec['lockColumns'])
        assert not used[v0:v0 + h + 1, u0:u0 + cols * (w + gap) - gap + 1].any(), f'{name} overlaps a retained island'
    # The root loop: the hole's edge once the tail-only faces are gone.
    half = {(int(t[i]), int(t[(i + 1) % 3])) for t in F[~only] for i in range(3)}
    nxt = {a: b for a, b in half if (b, a) not in half and tail[a] and tail[b]}
    loop = [next(iter(sorted(nxt)))]
    while nxt[loop[-1]] != loop[0]:
        loop.append(nxt[loop[-1]])
    assert len(loop) == len(nxt) == sum(spec['rootColumns']), f'root loop {len(loop)} of {len(nxt)}'
    loop = np.array(loop)
    # Old geodesic distance from the root, for the skin each new vertex copies.
    root_nodes = np.unique(F[straddle][tail[F[straddle]]])
    adj = [[] for _ in P]
    for a, b in _edges(F[only]):
        l = float(np.linalg.norm(P[a] - P[b]))
        adj[a].append((b, l))
        adj[b].append((a, l))
    g = np.full(len(P), np.inf)
    g[root_nodes] = 0.
    heap = [(0., int(v)) for v in root_nodes]
    while heap:
        d, v = heapq.heappop(heap)
        if d > g[v]:
            continue
        for u, l in adj[v]:
            if d + l < g[u]:
                g[u] = d + l
                heapq.heappush(heap, (d + l, u))
    old_g = g[inverse[regions['tail']]]
    assert np.isfinite(old_g).all()
    old_g = old_g / old_g.max()
    old_joints, old_weights = joints_a.copy(), weights_a.copy()
    nearest_old = lambda s: int(regions['tail'][np.argmin(np.abs(old_g - s))])
    # Centre line: the root loop's centre, out along its normal, then the profile.
    # The loop is far from planar (a saddle), so its heading is the
    # generator tail's own, read 2-5 cm down; about that axis the loop is
    # star-shaped (asserted below).
    c0 = P[loop].mean(axis=0)
    t0 = P[tail & (g > .02) & (g < .05)].mean(axis=0) - c0
    t0 /= np.linalg.norm(t0)
    C = _catmull([c0, c0 + spec['dock'] * t0, *spec['line']], 40)
    arc = np.r_[0., np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    N = np.zeros_like(C)
    n0 = np.cross(T[0], [0., 1., 0.])
    N[0] = n0 / np.linalg.norm(n0)
    for i in range(1, len(C)):  # rotation-minimising frame
        n = N[i - 1] - (N[i - 1] @ T[i]) * T[i]
        N[i] = n / np.linalg.norm(n)
    Bn = np.cross(T, N)
    off = P[loop] - c0
    off -= np.outer(off @ T[0], T[0])
    phi = np.arctan2(off @ Bn[0], off @ N[0])
    if np.angle(np.exp(1j * np.diff(np.r_[phi, phi[0]]))).sum() < 0:
        Bn, phi = -Bn, -phi  # angles increase along the loop's own order
    phi = phi[0] + np.r_[0., np.cumsum(np.mod(np.diff(phi), 2 * np.pi))]
    assert (np.diff(phi) > 0).all() and phi[-1] - phi[0] < 2 * np.pi, 'root loop is not star-shaped'
    r_root = np.linalg.norm(off, axis=1)
    junction = float(np.interp(-spec['switchTop'], -C[:, 1], arc))
    total = arc[-1]
    at = lambda X, s: np.array([np.interp(s, arc, X[:, c]) for c in range(3)])

    verts = []  # (position, uv in atlas texels, skin source vertex, paint parameters)
    def ring(points, angles, cols, rect, v_px, s, t, skin):
        """One ring's render vertices, column by column (columns share their
        boundary positions; each column is its own UV strip)."""
        u0, _, w, gap, _ = rect
        n = len(points)
        unwrapped = np.r_[angles, angles[0] + 2 * np.pi]
        bounds = np.r_[0, np.cumsum(cols)]
        assert bounds[-1] == n
        out = []
        for c in range(len(cols)):
            idx = np.arange(bounds[c], bounds[c + 1] + 1)
            frac = (unwrapped[idx] - unwrapped[idx[0]]) / (unwrapped[idx[-1]] - unwrapped[idx[0]])
            ids = []
            for i, f in zip(idx, frac):
                verts.append((points[i % n], (u0 + c * (w + gap) + f * w, v_px), skin(i % n), (1., s / total, t, f)))
                ids.append(len(verts) - 1)
            out.append((ids, frac))
        return out

    cu0, cv0, _, _, ch = spec['cordRect']
    su0, sv0, sw_w, sw_gap, sh = spec['switchRect']
    node_skin = [int(np.flatnonzero(inverse == v)[0]) for v in loop]
    rings = [ring(P[loop], phi, spec['rootColumns'], spec['cordRect'], cv0, 0., 0., lambda i: node_skin[i])]
    alpha = np.r_[phi[np.r_[0, np.cumsum(spec['rootColumns'])[:-1]]], phi[0] + 2 * np.pi]
    uniform = phi[0] + 2 * np.pi * np.arange(len(spec['cordColumns']) + 1) / len(spec['cordColumns'])
    r_root_of = lambda a: np.interp(np.mod(a - phi[0], 2 * np.pi), np.r_[phi - phi[0], 2 * np.pi], np.r_[r_root, r_root[0]])
    cord_r = np.array(spec['cordRadius'])
    for i, fr in enumerate(spec['cordRings'], start=1):
        s = fr * junction
        bnd = alpha + min(1., i / 3) * (uniform - alpha)
        angs = np.concatenate([np.linspace(bnd[c], bnd[c + 1], n + 1)[:-1] for c, n in enumerate(spec['cordColumns'])])
        share = spec['rootShape'] if i == 1 else 0.
        rad = float(np.interp(fr, *cord_r.T)) * (1 + share * (r_root_of(angs) / r_root.mean() - 1))
        pts = at(C, s) + rad[:, None] * (np.cos(angs)[:, None] * at(N, s) + np.sin(angs)[:, None] * at(Bn, s))
        rings.append(ring(pts, angs, spec['cordColumns'], spec['cordRect'], cv0 + fr * ch, s, 0.,
                          lambda _, s=s: nearest_old(s / total)))
    n_cord = len(rings) - 1
    # The junction: the last cord ring's own points in the lock columns.
    j_pts, j_angs = pts, angs
    gamma = np.r_[j_angs[np.r_[0, np.cumsum(spec['junctionColumns'])[:-1]]], j_angs[0] + 2 * np.pi]
    rings.append(ring(j_pts, j_angs, spec['junctionColumns'], spec['switchRect'], sv0, junction, 0.,
                      lambda _: nearest_old(junction / total)))
    n_locks = len(spec['lockColumns'])
    sw_len = total - junction
    lobe, sw_rad = np.array(spec['lobe']), np.array(spec['switchRadius'])
    for i, t in enumerate(spec['switchRings']):
        s = junction + t * sw_len
        cols = spec['ring8Columns'] if i == 0 else spec['lockColumns']
        target = gamma[0] + spec['twist'] * t + 2 * np.pi * np.arange(n_locks + 1) / n_locks
        bnd = gamma + (.5 if i == 0 else 1.) * (target - gamma)
        angs = np.concatenate([np.linspace(bnd[c], bnd[c + 1], n + 1)[:-1] for c, n in enumerate(cols)])
        col_of = np.repeat(np.arange(len(cols)), cols)
        frac = np.concatenate([np.arange(n) / n for n in cols])
        crest = np.where(np.repeat(cols, cols) == 2, -np.cos(2 * np.pi * frac), -1.)
        rad = float(np.interp(t, *sw_rad.T)) * (1 + float(np.interp(t, *lobe.T)) * crest)
        drop = np.array(spec['lockLength'])[col_of] * _smoothstep(*spec['lockFade'], t) * .5 * (1 + crest)
        pts = (at(C, s) + rad[:, None] * (np.cos(angs)[:, None] * at(N, s) + np.sin(angs)[:, None] * at(Bn, s))
               + drop[:, None] * at(T, s))
        rings.append(ring(pts, angs, cols, spec['switchRect'], sv0 + t * sh, s, t,
                          lambda _, s=s: nearest_old(s / total)))
    # Faces: a band per column between rings (the last cord ring and the
    # junction are one ring split by a UV seam), then the point, split per
    # segment so each lock column keeps its own strip.
    tris = []
    for r in range(len(rings) - 1):
        if r == n_cord:
            continue
        for (ui, uf), (di, df) in zip(rings[r], rings[r + 1]):
            tris += _band(ui, uf, di, df)
    tip = C[-1]
    for c, (ids, frac) in enumerate(rings[-1]):
        for j in range(len(ids) - 1):
            f = .5 * (frac[j] + frac[j + 1])
            verts.append((tip, (su0 + c * (sw_w + sw_gap) + f * sw_w, sv0 + sh), nearest_old(1.), (1., 1., 1., f)))
            tris.append((ids[j + 1], ids[j], len(verts) - 1))
    assert len(verts) == len(slots) and len(tris) == int(only.sum()), f'tail counts {len(verts)}/{len(slots)} vertices {len(tris)}/{int(only.sum())} faces'
    new_pos = np.array([v[0] for v in verts])
    s_all = np.array([v[3][1] for v in verts])
    # Pin the rearmost point to the source's exact z (normalizer scale and
    # centre), by a shift of the lower tail only.
    z_pin = float(lo0[2])
    lowest = int(np.argmin(new_pos[:, 2]))
    shift = z_pin - new_pos[lowest, 2]
    w_pin = _smoothstep(.45, .65, s_all)
    assert w_pin[lowest] == 1. and abs(shift) < .0025, f'rear pin shift {shift:.4f} at s {s_all[lowest]:.2f}'
    new_pos[:, 2] += w_pin * shift
    new_pos[lowest, 2] = z_pin
    # Write the slots: positions, UVs, skin; then the tail-only face rows.
    new_uv = np.array([v[1] for v in verts]) / spec['atlas']
    skin = np.array([v[2] for v in verts])
    pos_a[slots] = new_pos.astype('<f4')
    uv_a[slots] = new_uv.astype(uv_a.dtype)
    joints_a[slots] = old_joints[skin]
    weights_a[slots] = old_weights[skin]
    faces_new = faces.copy()
    faces_new[np.flatnonzero(only)] = slots[np.array(tris)]
    idx_a[:, 0] = faces_new.reshape(-1).astype(idx_a.dtype)
    pos = pos_a.astype('f8')
    # Normals: smooth over the welded result, written to the tail and to
    # every copy of its root nodes.
    first2, inverse2 = _weld(pos)
    nrm = _smooth_normals(pos[first2], inverse2[faces_new])[inverse2]
    redo = np.zeros(len(pos), bool)
    redo[slots] = True
    redo[np.isin(inverse, loop)] = True
    nor_a[redo] = nrm[redo].astype('<f4')
    # The contract, read back from the written bytes.
    assert np.array_equal(pos_a.min(axis=0), lo0) and np.array_equal(pos_a.max(axis=0), hi0), 'bounds moved'
    regions2, _ = _cow_rest_regions(pos, faces_new, spec)
    sizes = {n: len(v) for n, v in regions2.items()}
    assert sizes == {n: counts[n] for n in ('leftEar', 'rightEar', 'tail')}, f'rest regions {sizes}'
    assert np.array_equal(np.sort(regions2['tail']), np.sort(regions['tail'])), 'tail region slots changed'
    for name in ('leftEar', 'rightEar'):
        assert np.array_equal(regions2[name], regions[name]), name
    assert pos[regions['tail'], 1].min() * k_scale >= spec['floor'] - 1e-9, 'tail below the rest-test floor'
    referenced = np.zeros(len(pos), bool)
    referenced[faces_new.ravel()] = True
    assert referenced.all(), 'an unreferenced vertex'
    rows = np.hstack([np.ascontiguousarray(a).view('u1').reshape(len(pos), -1)
                      for a in (pos_a, nor_a, uv_a, joints_a, weights_a)])
    assert len(np.unique(rows, axis=0)) == len(pos), 'bitwise-identical vertices would weld'
    # Every new face faces out from the centre line (the material is single sided).
    tri_pos = pos[faces_new[np.flatnonzero(only)]]
    fn = np.cross(tri_pos[:, 1] - tri_pos[:, 0], tri_pos[:, 2] - tri_pos[:, 0])
    # Reference: the centre line at the face's own length, held a little
    # above the point so the cap faces read outward too.
    s_face = s_all[np.array(tris)].mean(axis=1) * total
    inner = np.array([at(C, min(s, total - .01)) for s in s_face])
    inverted = (fn * (tri_pos.mean(axis=1) - inner)).sum(axis=1) <= 0
    assert not inverted.any(), f'{int(inverted.sum())} new faces point inward at length fractions {np.round(s_face[inverted] / total, 3)}'
    body = ~tail
    far = slots[s_all > spec['cordRings'][1] * junction / total]
    clear = _nearest(pos[far], P[body]).min()
    assert clear > spec['clearance'], f'tail within {clear:.4f} of the body'
    # Sections that inform the paint and the record.
    report = {
        'deletedFaces': int(only.sum()), 'keptJoinFaces': int(straddle.sum()), 'rootLoop': int(len(loop)),
        'newVertices': len(verts), 'newFaces': len(tris), 'rings': len(rings), 'switchFrom': round(junction / total, 3),
        'length': round(float(total), 4), 'rearPinShift': round(float(shift), 5),
        'lowestDeliveredY': round(float(pos[regions['tail'], 1].min() * k_scale), 4),
        'xRange': [round(float(x), 4) for x in (new_pos[:, 0].min(), new_pos[:, 0].max())],
        'bodyClearance': round(float(clear), 4), 'restRegions': sizes,
        'switchMaxRadius': round(float(sw_rad[:, 1].max() * (1 + lobe[:, 1].max())), 4),
    }
    paint = {'index': slots, 'values': np.array([v[3] for v in verts])}
    return report, paint


# Cow head (round 6). The head had never been worked: the generator's horns
# are crescents about four vertices round, wide in the front view but only
# 4 cm deep fore and aft, so from the side and at eye level they read as thin
# pale cones; the ear interiors are a saturated orange-red (sRGB 181/78/28),
# the hottest note on the model; the painted eyes (a dark disc in a pale
# sclera ring, split over three atlas islands per eye) read as large glossy
# blobs. Construction, not a dose:
#   - Horns (shape_horns): each horn is lathed. Its centre line is traced from
#     its own vertices (a cubic in arc length from the pinned tip, refitted
#     three times against each vertex's projection), its front-view half
#     width is traced per arc band, and every horn vertex is re-placed at its
#     own angle about that line at a round section: the traced wide half
#     width or an authored taper (tip to base), whichever is larger. The
#     lathe fades out over the base into the poll and away from the line, so
#     the poll, ears and brow keep their places. POSITION and NORMAL only;
#     tips, bounds and the runtime ear regions are asserted unchanged.
#   - Paint (_paint_head, inside repaint_hide, at full atlas resolution from
#     3D position, so the several islands of each eye and ear agree): the eye
#     is shrunk about its own centre by a radial remap of the source texels in
#     its tangent plane (inside, the source eye scaled down; outside, the
#     surrounding hide pulled in), the ear interior's orange is re-keyed to a
#     soft skin pink with its shading kept, and the horns darken toward the
#     tip from a horn-length parameter the lathe hands over.
COW_HEAD = {
    # Head midline for telling the horns apart (source x), and the region
    # tips are searched in (y above, z above).
    'mid': .015, 'tipRegion': (.62, .28),
    # Horn length along its centre line from the tip (source units); the
    # lathe is full to `fade[0]` of it and gone by `fade[1]`, and gone
    # beyond `gate` (none-start, none) times the target radius from the line.
    'length': .105, 'fade': (.76, 1.06), 'gate': (1.7, 2.6),
    # Geodesic reach of the horn flood from the tip, as a multiple of length.
    'reach': 1.5,
    # No lathed vertex rises within this of its tip's height.
    'tipClear': .0004,
    # Authored taper: radius at the tip and base, and the exponent of the
    # arc fraction between them; the traced wide half width is smoothed over
    # `traceSigma` bands of `band` and scaled by `traceGain`.
    'radius': (.005, .031), 'power': .7, 'band': .01, 'traceSigma': 1.2, 'traceGain': 1.0,
    # Least clearance kept between a moved horn vertex and any ear vertex.
    'earClearance': .004,
    'paint': {
        # Eyes: seeds (source position), the sphere the sclera ring is read
        # in, sclera texel tests (luminance above, saturation below), the
        # scale of the new eye and the outer radius (x the sclera radius)
        # the remap blends back to the source by.
        'eyes': ((-.03, .575, .41), (.10, .565, .365)), 'eyeReach': .035,
        'sclera': (140., 20.), 'shrink': .74, 'outer': 1.45, 'cell': .00018,
        # Ear interior: orange as an R - G ramp and an R - B ramp, gated to
        # the ears by height (none, full); re-keyed to `pink` with the source
        # luminance kept relative to `lumRef`, clipped to `lumClip`.
        'ear': {'rg': (24., 60.), 'rb': (50., 110.), 'y': (.535, .56),
                'pink': (212., 156., 150.), 'lumRef': 96., 'lumClip': (.80, 1.12)},
        # Horns: ivory, darkening to `tip` toward the point over the length
        # fraction ramp (full tip, none), mixed over the source by `strength`.
        'horn': {'ivory': (226., 212., 184.), 'tip': (96., 84., 74.), 'ramp': (.06, .55), 'strength': .8},
    },
}


def _horn_frames(P, F, spec):
    """Per horn: welded node ids, centre line samples (arc length, points)."""
    import heapq
    edges = _edges(F)
    length = np.linalg.norm(P[edges[:, 0]] - P[edges[:, 1]], axis=1)
    adj = [[] for _ in range(len(P))]
    for (a, b), l in zip(edges, length):
        adj[a].append((b, l))
        adj[b].append((a, l))
    horns = []
    y0, z0 = spec['tipRegion']
    for side in (1, -1):
        cand = np.flatnonzero((P[:, 1] > y0) & (P[:, 2] > z0) & (np.sign(P[:, 0] - spec['mid']) == side))
        tip = int(cand[np.argmax(P[cand, 1])])
        reach = spec['reach'] * spec['length']
        dist = np.full(len(P), np.inf)
        dist[tip] = 0.
        heap = [(0., tip)]
        while heap:
            d, v = heapq.heappop(heap)
            if d > dist[v] or d > reach:
                continue
            for u, l in adj[v]:
                if d + l < dist[u]:
                    dist[u] = d + l
                    heapq.heappush(heap, (d + l, u))
        ids = np.flatnonzero(dist <= reach)
        q = P[ids] - P[tip]
        s = dist[ids].copy()
        # Centre line: c(s) = tip + b s + e s^2 + f s^3, refitted against
        # each node's projection on the previous fit (geodesic distance runs
        # long on the far side of the tube).
        samples = np.linspace(0, reach, 241)
        for _ in range(4):
            use = s < 1.1 * spec['length']
            A = np.stack([s[use], s[use] ** 2, s[use] ** 3], axis=1)
            coef, *_ = np.linalg.lstsq(A, q[use], rcond=None)
            line = np.stack([samples, samples ** 2, samples ** 3], axis=1) @ coef
            seg = np.linalg.norm(np.diff(line, axis=0), axis=1)
            arc = np.concatenate([[0.], np.cumsum(seg)])
            nearest = np.argmin(((q[:, None] - line[None]) ** 2).sum(-1), axis=1)
            s = arc[nearest]
        horns.append({'side': side, 'tip': tip, 'ids': ids, 'arc': arc, 'line': line + P[tip]})
    return horns


def shape_horns(blob, doc, base, spec):
    """The cow's horns lathed on traced centre lines, in place; see COW_HEAD.
    Returns (report, paint) where paint carries each render vertex's horn
    length fraction and weight for the hide stage."""
    prim = doc['meshes'][0]['primitives'][0]
    pos_a = accessor(blob, doc, base, prim['attributes']['POSITION'])[0]
    nor_a = accessor(blob, doc, base, prim['attributes']['NORMAL'])[0]
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = pos_a.astype('f8')
    regions, _ = _cow_rest_regions(pos, faces, COW_TAIL)
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    original = P.copy()
    p = P.copy()
    horn_s = np.full(len(P), np.nan)
    horn_w = np.zeros(len(P))
    ear_nodes = np.unique(inverse[np.concatenate([regions['leftEar'], regions['rightEar']])])
    report = {}
    L = spec['length']
    r_tip, r_base = spec['radius']
    for horn in _horn_frames(P, F, spec):
        ids, arc, line = horn['ids'], horn['arc'], horn['line']
        q = P[ids]
        k = np.argmin(((q[:, None] - line[None]) ** 2).sum(-1), axis=1)
        # Refine each projection on its segment.
        k = np.clip(k, 0, len(line) - 2)
        a, b = line[k], line[k + 1]
        t = np.clip(((q - a) * (b - a)).sum(1) / np.maximum(((b - a) ** 2).sum(1), 1e-18), 0, 1)
        foot = a + t[:, None] * (b - a)
        s = arc[k] + t * (arc[k + 1] - arc[k])
        u = q - foot
        r_old = np.linalg.norm(u, axis=1)
        # Traced wide half width per arc band (the front-view silhouette).
        n_band = int(np.ceil(L * spec['fade'][1] / spec['band'])) + 1
        bands = (np.arange(n_band) + .5) * spec['band']
        trace = np.array([r_old[np.abs(s - c) < spec['band']].max() if (np.abs(s - c) < spec['band']).any() else np.nan
                          for c in bands])
        good = ~np.isnan(trace)
        trace = _gauss1(np.interp(bands, bands[good], trace[good]), spec['traceSigma'], 0) * spec['traceGain']
        frac = np.clip(s / L, 0, 1)
        authored = r_tip + (r_base - r_tip) * frac ** spec['power']
        target = np.maximum(np.interp(s, bands, trace), authored)
        w = (1 - _smoothstep(spec['fade'][0] * L, spec['fade'][1] * L, s)) * \
            (1 - _smoothstep(spec['gate'][0], spec['gate'][1], r_old / target))
        w[ids == horn['tip']] = 0.
        w[np.isin(ids, ear_nodes)] = 0.
        r_new = r_old + w * (target - r_old)
        direction = u / np.maximum(r_old, 1e-12)[:, None]
        placed = np.where((r_old > 1e-9)[:, None], foot + direction * r_new[:, None], q)
        # The tip is the asset's highest point (the normalizer's height): no
        # thickened vertex may rise past it.
        cap = P[horn['tip'], 1] - spec['tipClear']
        placed[:, 1] = np.where((w > 0) & (placed[:, 1] > cap), np.maximum(cap, q[:, 1]), placed[:, 1])
        p[ids] = placed
        horn_s[ids] = np.where(np.isnan(horn_s[ids]), frac, np.minimum(horn_s[ids], frac))
        horn_w[ids] = np.maximum(horn_w[ids], 1 - _smoothstep(spec['fade'][0] * L, spec['fade'][1] * L, s))
        moved = w > 1e-6
        report['left' if horn['side'] > 0 else 'right'] = {
            'nodes': int(len(ids)), 'lathed': int(moved.sum()),
            'baseRadius': [round(float(np.median(r_old[(frac > .7) & (frac < .9)])), 4),
                           round(float(np.median(r_new[(frac > .7) & (frac < .9)])), 4)],
            'midRadius': [round(float(np.median(r_old[(frac > .35) & (frac < .55)])), 4),
                          round(float(np.median(r_new[(frac > .35) & (frac < .55)])), 4)],
            'tip': [round(float(x), 4) for x in P[horn['tip']]]}
    # Flip guard: ease any vertex whose face would invert back toward the source.
    old_cross = np.cross(original[F[:, 1]] - original[F[:, 0]], original[F[:, 2]] - original[F[:, 0]])
    eased = 0
    for attempt in range(24):
        new_cross = np.cross(p[F[:, 1]] - p[F[:, 0]], p[F[:, 2]] - p[F[:, 0]])
        flipped = (old_cross * new_cross).sum(axis=1) < 0
        if not flipped.any():
            break
        bad = np.unique(F[flipped])
        eased += len(bad)
        p[bad] = original[bad] + (.5 if attempt < 23 else 0) * (p[bad] - original[bad])
    assert np.array_equal(p.min(axis=0), original.min(axis=0)) and np.array_equal(p.max(axis=0), original.max(axis=0)), \
        f'bounds moved {p.min(axis=0) - original.min(axis=0)} {p.max(axis=0) - original.max(axis=0)}'
    disp = np.linalg.norm(p - original, axis=1)
    touched = disp > 1e-9
    assert not touched[ear_nodes].any(), 'an ear vertex moved'
    if touched.any():
        before = _nearest(original[touched], original[ear_nodes]).min()
        after = _nearest(p[touched], original[ear_nodes]).min()
        assert after >= min(before, spec['earClearance']) - 1e-9, f'horn within {after:.4f} of an ear'
        report['earClearance'] = [round(float(before), 4), round(float(after), 4)]
    ring = touched.copy()
    ring[F[touched[F].any(axis=1)].ravel()] = True
    new_pos = p[inverse]
    new_nor = normals(new_pos, faces, inverse, nor_a.astype('f8'))
    redo = ring[inverse]
    out_nor = nor_a.astype('f8')
    out_nor[redo] = new_nor[redo]
    regions2, _ = _cow_rest_regions(new_pos, faces, COW_TAIL)
    for name in regions:
        assert np.array_equal(regions2[name], regions[name]), f'rest region {name} changed'
    report.update({'movedVertices': int(touched.sum()), 'maxDisplacement': round(float(disp.max()), 4),
                   'flipEased': eased, 'normalsRewritten': int(redo.sum()),
                   'restRegions': {n: int(len(v)) for n, v in regions2.items()}})
    pos_a[:] = new_pos.astype('<f4')
    nor_a[:] = out_nor.astype('<f4')
    assert np.isfinite(pos_a).all() and np.isfinite(nor_a).all()
    paint = {'s': horn_s[inverse], 'w': horn_w[inverse]}
    return report, paint


def _texels(uv, faces, values, w, h):
    """Texel rows, columns and interpolated values of the given faces at full
    atlas size (a sparse _rasterize; the last face written wins)."""
    ys, xs, vals = [], [], []
    px = uv * np.array([w, h]) - .5
    for face in faces:
        a, b, c = px[face]
        lo = np.clip(np.floor(np.minimum(np.minimum(a, b), c)).astype(int), 0, [w - 1, h - 1])
        hi = np.clip(np.ceil(np.maximum(np.maximum(a, b), c)).astype(int), 0, [w - 1, h - 1])
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        X, Y = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not inside.any():
            continue
        ys.append(Y[inside])
        xs.append(X[inside])
        vals.append(np.stack([l1[inside], l2[inside], l3[inside]], axis=1) @ values[face])
    ys, xs, vals = np.concatenate(ys), np.concatenate(xs), np.concatenate(vals)
    flat = ys * w + xs
    _, last = np.unique(flat[::-1], return_index=True)
    keep = len(flat) - 1 - last
    return ys[keep], xs[keep], vals[keep]


def _paint_head(albedo, source, uv, faces, pos, nor, spec, horn):
    """Eyes, ear interiors and horn tips repainted from 3D position at full
    atlas size; see COW_HEAD. `albedo` is what is painted over (the head
    white already gained to neutral); `source` is the generator's own image,
    read to find the sclera (neutral) against the cream hide it was painted
    on. Returns (rows, cols, colour, weight, report)."""
    h, w, _ = albedo.shape
    ps = spec['paint']
    on_head = ((pos[:, 2] > .2) & (pos[:, 1] > .45))[faces].all(axis=1)
    values = np.hstack([pos, nor, horn['s'][:, None], horn['w'][:, None]])
    values[np.isnan(values)] = 1.
    ys, xs, val = _texels(uv, faces[on_head], values, w, h)
    P, N, hs, hw = val[:, :3], val[:, 3:6], val[:, 6], val[:, 7]
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    src = albedo[ys, xs].astype('f8')
    raw = source[ys, xs].astype('f8')
    lum, sat = raw.mean(axis=1), raw.max(axis=1) - raw.min(axis=1)
    colour, weight = src.copy(), np.zeros(len(src))
    report = {'texels': int(len(src)), 'eyes': []}
    # Eyes: a radial remap about the sclera ring's centre in its tangent plane.
    for seed in ps['eyes']:
        near = np.linalg.norm(P - np.array(seed), axis=1) < ps['eyeReach']
        sclera = near & (lum > ps['sclera'][0]) & (sat < ps['sclera'][1])
        assert sclera.sum() > 200, f'eye at {seed}: {int(sclera.sum())} sclera texels'
        c = P[sclera].mean(axis=0)
        n = N[sclera].mean(axis=0)
        n /= np.linalg.norm(n)
        R = float(np.percentile(np.linalg.norm(P[sclera] - c, axis=1), 92))
        e1 = np.cross(n, [0., 1., 0.])
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(n, e1)
        outer = ps['outer'] * R
        region = (np.linalg.norm(P - c, axis=1) < 1.6 * outer) & ((N @ n) > .25)
        ab = np.stack([(P[region] - c) @ e1, (P[region] - c) @ e2], axis=1)
        d = np.linalg.norm(ab, axis=1)
        inner, edge = ps['shrink'] * R, 1.08 * R
        s = np.where(d < inner, d / ps['shrink'], edge + (d - inner) * (outer - edge) / (outer - inner))
        moving = d < outer
        query = ab[moving] * (s[moving] / np.maximum(d[moving], 1e-12))[:, None]
        # The source disc as a regular tangent-plane grid (splatted, holes
        # filled from their neighbours), read at each remapped point.
        cell = ps['cell']
        half = int(np.ceil(1.6 * outer / cell))
        grid = np.zeros((2 * half + 1, 2 * half + 1, 3))
        have = np.zeros(grid.shape[:2], bool)
        gi = np.clip(np.rint(ab / cell).astype(int) + half, 0, 2 * half)
        grid[gi[:, 1], gi[:, 0]] = src[region]
        have[gi[:, 1], gi[:, 0]] = True
        for _ in range(10):
            acc, cnt = np.zeros_like(grid), np.zeros(have.shape)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                acc += np.roll(np.where(have[..., None], grid, 0), (dy, dx), axis=(0, 1))
                cnt += np.roll(have, (dy, dx), axis=(0, 1))
            grow = ~have & (cnt > 0)
            grid[grow] = acc[grow] / cnt[grow][:, None]
            have |= grow
        g = np.clip(query / cell + half, 0, 2 * half - 1e-6)
        g0 = np.floor(g).astype(int)
        g1 = np.minimum(g0 + 1, 2 * half)
        f = (g - g0)[..., None]
        target = np.flatnonzero(region)[moving]
        colour[target] = ((1 - f[:, 1]) * ((1 - f[:, 0]) * grid[g0[:, 1], g0[:, 0]] + f[:, 0] * grid[g0[:, 1], g1[:, 0]])
                          + f[:, 1] * ((1 - f[:, 0]) * grid[g1[:, 1], g0[:, 0]] + f[:, 0] * grid[g1[:, 1], g1[:, 0]]))
        weight[target] = 1.
        report['eyes'].append({'centre': [round(float(x), 4) for x in c], 'scleraRadius': round(R, 4),
                               'newRadius': round(ps['shrink'] * R, 4), 'texels': int(moving.sum())})
    # Ear interiors: orange re-keyed to skin pink, shading kept.
    ear = ps['ear']
    R_, G_, B_ = src[:, 0], src[:, 1], src[:, 2]
    orange = (_smoothstep(*ear['rg'], R_ - G_) * _smoothstep(*ear['rb'], R_ - B_)
              * _smoothstep(*ear['y'], P[:, 1]) * (weight < .5))
    pink = np.array(ear['pink'])[None] * np.clip(lum / ear['lumRef'], *ear['lumClip'])[:, None]
    colour = colour + orange[:, None] * (pink - colour)
    weight = np.maximum(weight, orange)
    report['earTexels'] = int((orange > .5).sum())
    # Horn tips: darker toward the point.
    hp = ps['horn']
    toward_tip = 1 - _smoothstep(*hp['ramp'], hs)
    horn_colour = np.array(hp['ivory'])[None] + toward_tip[:, None] * (np.array(hp['tip']) - np.array(hp['ivory']))[None]
    tip = hp['strength'] * hw * (weight < .5)
    colour = colour + tip[:, None] * (horn_colour - colour)
    weight = np.maximum(weight, tip)
    report['hornTexels'] = int((tip > .3).sum())
    keep = weight > 1e-4
    return ys[keep], xs[keep], colour[keep], weight[keep], report


# Duck torso (asset loop rounds 3-5, 2026-11-05). Round 1 moved the generator's
# own rear vertices onto the level set of the mesh's blurred volume. Round 3
# deleted the whole torso cap and refilled it with rings cast by rays onto a
# voxel field (a superellipse loft smooth-unioned with a round-cone tail) that
# closed on a pole at the tail tip. Round 4 filled the same hole with one
# structured grid evaluated in closed form on a section loft whose stations ran
# on past the rump into a flattened tail blade, each folded wing a raise of the
# section along its normal. Judged again, the rump and tail still read as a
# ragged, scalloped flare from behind and the wings as soft bulges with a weak
# seam: all three methods made the back, wings and tail one surface carrying
# bumps. So round 5 changes the construction to separate parts with modelled
# joints:
#   1. The same cap is deleted (`cut`, `paddle`); its edge is one loop
#      (asserted) and is faired as before.
#   2. The body is a plain loft (`body`, near-elliptic sections of `power`) that
#      carries no wing and no tail and closes on a rounded rump; its pole sits
#      high at the back, under the tail's root. Grid columns run at constant
#      section angle from the edge loop and the edge's offset from the loft fades
#      out along each column (`blend`), as in round 4.
#   3. Each folded wing is its own closed loft (`wing`): lens sections across the
#      chord, laid on the body surface by its normal, from a rounded shoulder to
#      a pointed primary tip. The upper part is buried in the back, so the
#      wing's upper outline is its intersection with the body; the lower lip
#      stands `lip` proud of the flank, so the wing-to-body joint is a real
#      undercut with its own shade line rather than a bump; the primaries taper
#      to a point over the rump beside the tail's root, lifted `tipLift` off it.
#   4. The tail is its own closed loft (`tail`) on a traced, upturned side
#      profile: a flattened wedge, wider than thick, tapering to a rounded tip
#      that is the rearmost point (pinned at the source's rear extreme); its root
#      is seated inside the rump over the body's pole.
#   5. UVs: the body grid and each part get their own rectangle (`rects`, rows of
#      the island) inside the 80 x 172 island at the delivered 512, all painted
#      one plumage white, the retained plumage's median roughness and a flat
#      normal.
DUCK_TORSO = {
    'cut': ((.20, -.40), (.27, -.24), (.33, 0.), (.36, .13)),
    'paddle': (.245, .33, .15),
    'widen': (0., .06), 'widenY': (.28, .36),
    # (z, half width, widest height, back line, belly line), rear to front; the
    # first station is the rump's pole.
    'body': ((-.452, .004, .55, .553, .547), (-.449, .028, .545, .556, .526), (-.442, .055, .535, .556, .495),
             (-.43, .082, .52, .552, .455), (-.415, .108, .50, .544, .415), (-.395, .135, .475, .54, .372),
             (-.37, .162, .455, .542, .337), (-.345, .186, .442, .546, .31), (-.315, .21, .425, .55, .282),
             (-.28, .232, .41, .553, .256), (-.24, .252, .395, .556, .232), (-.19, .27, .38, .558, .21),
             (-.14, .284, .372, .56, .195), (-.09, .293, .365, .562, .186), (-.04, .297, .36, .565, .18),
             (.02, .292, .356, .57, .178), (.08, .274, .352, .582, .18), (.12, .248, .35, .598, .184),
             (.14, .232, .35, .607, .186), (.16, .222, .35, .62, .19), (.22, .21, .35, .68, .2)),
    'power': 2.2,
    # Side angles (degrees above the horizontal through each section's widest
    # point) of the lip and of the upper outline by station z, the lens's
    # thickness above the body, and the shell's stations and chord samples.
    'wing': {'z': (.115, -.455),
             'lower': ((-.455, 74.), (-.44, 56.), (-.40, 30.), (-.34, 16.), (-.25, 9.), (-.12, 4.), (0., 5.), (.06, 14.), (.115, 32.)),
             'upper': ((-.455, 78.), (-.44, 82.), (-.38, 86.), (-.15, 86.), (0., 82.), (.06, 76.), (.115, 62.)),
             'thick': ((-.455, .007), (-.42, .016), (-.34, .026), (-.2, .032), (0., .032), (.115, .024)),
             'lip': ((-.455, .002), (-.42, -.004), (-.36, 0.), (-.26, .014), (-.02, .018), (.06, .008), (.115, -.006)), 'bury': .015, 'tipLift': (.62, 1., .008), 'extrude': -.415, 'round': .12,
             'stations': 14, 'chord': 7},
    # Tail centre line (z, y) from the seated root to the tip, and (fraction along
    # it, half width, half thickness); the last `round` of its length is rounded.
    'tail': {'line': ((-.37, .49), (-.41, .525), (-.445, .565), (-.475, .598), (-.5004, .615)),
             'section': ((0., .05, .03), (.25, .10, .032), (.55, .085, .022), (.88, .036, .011)),
             'round': .12, 'stations': 10, 'ring': 12},
    'fairBand': (.05, 10, 10),
    'columns': 48, 'rows': 18, 'rowWeight': (3., -.445, -.39), 'blend': (.08, 5.),
    'skinNearest': 4,
    'island': (51, 119, 80, 172),
    'rects': {'body': (0, 100), 'wingR': (100, 24), 'wingL': (124, 24), 'tail': (148, 24)},
    'plumage': (218, 213, 207),
    'jpegQuality': 95,
}
DUCK_TORSO_PRESERVATION = ('Fairing changed POSITION and NORMAL only; the torso stage then deleted the cap behind the cut '
    '(back, wings, rump and tail) and refilled it with a loft grid closing on a rounded rump, faded onto the cut edge '
    'along each column, plus three separate closed lofted parts with modelled joints (two folded wings laid on the '
    'body with an undercut lip and lifted primaries, and an upturned tail wedge seated in the rump), each with its '
    'own UV rectangle in a freed atlas island painted in albedo, ORM and normal (all three images re-encoded at JPEG '
    'quality 95, outside the island within re-encode error) and skin from the deleted region by inverse distance; '
    'retained UV, joint and weight bytes, nodes, skins, inverse binds, materials and animations unchanged; all six '
    'bounds exact; then each leg below an ankle cut was deleted and its foot lathed afresh about the ankle from a '
    'traced plan outline and side profile (tapered tarsus, splayed webbed toes, flat sole pinned at the source\'s '
    'lowest height), with skin from the deleted feet by inverse distance and two orange UV rectangles painted in '
    'all three images (re-encoded again at JPEG quality 95)')


def _duck_section(z, theta, spec):
    """Points of the authored body loft at stations z and normalised superellipse angles theta (radians)."""
    st = np.array(spec['body'], 'f8')
    zz = np.clip(z, st[0, 0], st[-1, 0])
    a, ym, yt, yb = (np.interp(zz, st[:, 0], st[:, k]) for k in range(1, 5))
    c, s = np.cos(theta), np.sin(theta)
    n = spec['power']
    rho = (np.abs(c) ** n + np.abs(s) ** n) ** (1 / n)
    h = np.where(s >= 0, yt - ym, ym - yb)
    return np.stack([a * c / rho, ym + h * s / rho, np.asarray(z, 'f8') + 0 * c], axis=1)


def _duck_section_angle(q, spec):
    """The normalised section angle of points q about their own station's section."""
    st = np.array(spec['body'], 'f8')
    zz = np.clip(q[:, 2], st[0, 0], st[-1, 0])
    a, ym, yt, yb = (np.interp(zz, st[:, 0], st[:, k]) for k in range(1, 5))
    dy = q[:, 1] - ym
    return np.arctan2(dy / np.where(dy >= 0, yt - ym, ym - yb), q[:, 0] / a)


def _closed_shell(rings, front, back):
    """A closed loft through rings (K x N, all running the same way round), capped
    by a fan to `front` before the first ring and to `back` after the last;
    faces wound outward. Returns (points, triangles, ring index per point, 0..K+1)."""
    K, N = rings.shape[:2]
    pts = np.vstack([rings.reshape(-1, 3), front[None], back[None]])
    f_i, b_i = K * N, K * N + 1
    tris = []
    for k in range(K - 1):
        for j in range(N):
            a, b, c, d = k * N + j, k * N + (j + 1) % N, (k + 1) * N + j, (k + 1) * N + (j + 1) % N
            tris += [(a, b, d), (a, d, c)]
    for j in range(N):
        tris += [(f_i, (j + 1) % N, j), (b_i, (K - 1) * N + j, (K - 1) * N + (j + 1) % N)]
    tris = np.array(tris)
    if np.einsum('ij,ij->', pts[tris[:, 0]], np.cross(pts[tris[:, 1]], pts[tris[:, 2]])) < 0:
        tris = tris[:, ::-1]
    k_of = np.r_[np.repeat(np.arange(1, K + 1), N), 0, K + 1]
    j_of = np.r_[np.tile(np.arange(N), K), -1, -1]
    return pts, tris, k_of, j_of


def rebuild_duck_torso(data, spec):
    """The duck's torso cap deleted and refilled by a body loft and separately lofted wings
    and tail; see DUCK_TORSO. Returns (glb bytes, report)."""
    import io
    from PIL import Image
    from scipy.ndimage import binary_dilation
    from scipy.spatial import cKDTree
    blob, doc, base = load_glb_bytes(data)
    prim = doc['meshes'][0]['primitives'][0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    assert set(prim['attributes']) == set(names)
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    lo0, hi0 = attrs['POSITION'].min(axis=0), attrs['POSITION'].max(axis=0)
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    # 1. The region behind the cut and both wing paddles, one ring wider.
    zc = np.interp(P[:, 1], *np.array(spec['cut']).T)
    px, py, pz = spec['paddle']
    region = (P[:, 2] < zc) | ((np.abs(P[:, 0]) > px) & (P[:, 1] > py) & (P[:, 2] < pz))
    E = _edges(F)
    grown = region.copy()
    grown[E[:, 1][region[E[:, 0]]]] = True
    grown[E[:, 0][region[E[:, 1]]]] = True
    region = grown
    drop = region[F].all(axis=1)
    kept_faces, kept_welded = faces[~drop], F[~drop]
    directed = kept_welded[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    present = set(map(tuple, directed.tolist()))
    border = [(a_, b_) for a_, b_ in directed.tolist() if (b_, a_) not in present]
    following = dict(border)
    assert len(following) == len(border), 'hole boundary is not a simple loop'
    loop = [border[0][0]]
    while following[loop[-1]] != loop[0]:
        loop.append(following[loop[-1]])
    assert len(loop) == len(border), 'hole has more than one boundary loop'
    loop = np.array(loop)
    # The cut runs along vertices, so its edge zigzags: the edge is smoothed along
    # itself and the retained band in front of it evened, any flip eased back.
    band_d, band_n, edge_n = spec['fairBand']
    used_v = np.unique(kept_welded)
    seg = np.r_[P[loop], P[loop][:1]]
    dense = np.vstack([seg[i] + np.linspace(0, 1, 8, endpoint=False)[:, None] * (seg[i + 1] - seg[i]) for i in range(len(loop))])
    d_edge = np.full(len(P), np.inf)
    d_edge[used_v] = cKDTree(dense).query(P[used_v])[0]
    band = d_edge < band_d
    band[loop] = False
    gain = (1 - d_edge / band_d)[band][:, None]
    ring_faces = kept_welded[np.isin(kept_welded, np.r_[loop, np.flatnonzero(band)]).any(axis=1)]
    before = P.copy()
    c0 = np.cross(before[ring_faces[:, 1]] - before[ring_faces[:, 0]], before[ring_faces[:, 2]] - before[ring_faces[:, 0]])
    for _ in range(edge_n):
        E_ = P[loop]
        P[loop] = E_ + .5 * (.5 * (np.roll(E_, 1, axis=0) + np.roll(E_, -1, axis=0)) - E_)
    k_edges = _edges(kept_welded)
    k_deg = np.bincount(k_edges.ravel(), minlength=len(P))
    for _ in range(band_n):
        total = np.zeros_like(P)
        np.add.at(total, k_edges[:, 0], P[k_edges[:, 1]])
        np.add.at(total, k_edges[:, 1], P[k_edges[:, 0]])
        P[band] = P[band] + .5 * gain * (total[band] / np.maximum(k_deg[band], 1)[:, None] - P[band])
    loop_band = np.r_[loop, np.flatnonzero(band)]
    for attempt in range(24):
        c1 = np.cross(P[ring_faces[:, 1]] - P[ring_faces[:, 0]], P[ring_faces[:, 2]] - P[ring_faces[:, 0]])
        flipped = (c0 * c1).sum(axis=1) <= 0
        if not flipped.any():
            break
        moved = np.intersect1d(np.unique(ring_faces[flipped]), loop_band)
        P[moved] = before[moved] + (.5 if attempt < 23 else 0) * (P[moved] - before[moved])
    pos = P[inverse]
    B = P[loop]
    n_b = len(loop)
    # 2. The edge's turn about the loft: each edge vertex's section angle at its own station.
    th = np.unwrap(_duck_section_angle(np.r_[B, B[:1]], spec))
    sense = np.sign(th[-1] - th[0])
    assert abs(abs(th[-1] - th[0]) / (2 * np.pi) - 1) < .02, 'edge does not turn once about the loft'
    turn = sense * (th[:-1] - th[0]) / (2 * np.pi)
    seglen = np.linalg.norm(np.diff(np.r_[B, B[:1]], axis=0), axis=1)
    s_arc = np.r_[0, np.cumsum(seglen)[:-1]] / seglen.sum()
    s_b = .85 * np.minimum(np.maximum.accumulate(turn), 1 - 1e-3) + .15 * s_arc
    assert (np.diff(s_b) > 0).all() and s_b[-1] < 1, 'edge is not star-shaped about the loft'
    def along(s_, pts, f):
        s_ext, p_ext = np.r_[s_ - 1, s_, s_ + 1], np.vstack([pts, pts, pts])
        return np.stack([np.interp(f, s_ext, p_ext[:, k]) for k in range(3)], axis=1)
    # 3. Columns at constant section angle from the edge to the rump's pole; the
    # edge's offset from the loft fades out along each column.
    M, R = spec['columns'], spec['rows']
    s_m = (np.arange(M) + .5) / M
    E_m = along(s_b, B, s_m)
    th_m = _duck_section_angle(E_m, spec)
    assert (np.diff(sense * np.unwrap(th_m)) > 0).all(), 'columns do not run once round the loft'
    offset = E_m - _duck_section(E_m[:, 2], th_m, spec)
    fade_len = np.maximum(spec['blend'][0], spec['blend'][1] * np.linalg.norm(offset, axis=1))
    ang = np.mod(th_m, 2 * np.pi)
    order = np.argsort(ang)
    ang_s = np.r_[ang[order][-1] - 2 * np.pi, ang[order], ang[order][0] + 2 * np.pi]
    col_s = np.r_[order[-1], order, order[0]]
    def body_at(z, theta):
        """The fill surface at stations z and section angles theta: the loft plus
        each column's faded edge offset, interpolated between columns by angle."""
        z = np.asarray(z, 'f8')
        q = np.mod(theta, 2 * np.pi)
        hi_ = np.searchsorted(ang_s, q, side='right').clip(1, len(ang_s) - 1)
        f = ((q - ang_s[hi_ - 1]) / (ang_s[hi_] - ang_s[hi_ - 1]))[:, None]
        def faded(c):
            return (1 - _smoothstep(0., fade_len[c], E_m[c, 2] - z))[:, None] * offset[c]
        return _duck_section(z, theta, spec) + (1 - f) * faded(col_s[hi_ - 1]) + f * faded(col_s[hi_])
    # Rows are spaced evenly in a measure that weights the rump `rowWeight` times.
    st = np.array(spec['body'], 'f8')
    z_end = float(st[0, 0])
    wt, w0, w1 = spec['rowWeight']
    zg = np.linspace(z_end, float(hi0[2]), 4000)
    wz = 1 + (wt - 1) * (1 - _smoothstep(w0, w1, zg))
    U = np.r_[0, np.cumsum(.5 * (wz[1:] + wz[:-1]) * np.diff(zg))]
    u0 = np.interp(E_m[:, 2], zg, U)
    rings = [B.copy()]
    for i in range(1, R + 1):
        rings.append(body_at(np.interp(u0 * (1 - i / R), U, zg), th_m))
    pole = np.array([0., st[0, 2], z_end - .003])
    body_pos = np.vstack(rings + [pole[None]])
    starts = np.cumsum([0] + [len(q_) for q_ in rings])
    ring_idx = [np.arange(starts[k], starts[k + 1]) for k in range(len(rings))]
    s_rings = [s_b] + [s_m] * R
    apex = len(body_pos) - 1
    # The edge is zipped to the first ring; each grid quad behind it takes the
    # diagonal that bends it least.
    tris = _zipper(ring_idx[0], s_rings[0], ring_idx[1], s_rings[1])
    for k in range(1, R):
        o, i_ = ring_idx[k], ring_idx[k + 1]
        for m in range(M):
            o0, o1, i0, i1 = o[m], o[(m + 1) % M], i_[m], i_[(m + 1) % M]
            options = (((o1, o0, i0), (o1, i0, i1)), ((o1, o0, i1), (o0, i0, i1)))
            bend = []
            for pair in options:
                n_ = [np.cross(body_pos[t_[1]] - body_pos[t_[0]], body_pos[t_[2]] - body_pos[t_[0]]) for t_ in pair]
                bend.append(-(n_[0] @ n_[1]) / max(np.linalg.norm(n_[0]) * np.linalg.norm(n_[1]), 1e-20))
            tris += options[int(np.argmin(bend))]
    lr = ring_idx[-1][np.argsort(s_rings[-1])]
    for j in range(len(lr)):
        tris.append((lr[(j + 1) % len(lr)], lr[j], apex))
    parts = [{'name': 'body', 'pos': body_pos, 'tris': np.array(tris),
              's': np.concatenate(s_rings + [[np.nan]]),
              't': np.concatenate([np.full(len(r_), k / R) for k, r_ in enumerate(rings)] + [[1.]])}]
    report = {'edge': n_b, 'columns': M, 'rows': R, 'removedTriangles': int(drop.sum()),
              'edgeOffsetMax': round(float(np.linalg.norm(offset, axis=1).max()), 4),
              'edgeOffsetMedian': round(float(np.median(np.linalg.norm(offset, axis=1))), 4)}
    # 4. The folded wings: closed lens lofts laid on the body by its normal.
    ws = spec['wing']
    K, NV = ws['stations'], ws['chord']
    u = np.arange(1, K + 1) / (K + 1)
    zw = ws['z'][0] + (ws['z'][1] - ws['z'][0]) * u
    lo_t, hi_t = np.interp(zw, *np.array(ws['lower']).T), np.interp(zw, *np.array(ws['upper']).T)
    rnd = np.sqrt(_smoothstep(0., ws['round'], u))
    v = (np.arange(NV + 1) / NV) ** 1.6
    thick = np.interp(zw, *np.array(ws['thick']).T)[:, None]
    lip, bury = np.interp(zw, *np.array(ws['lip']).T)[:, None], ws['bury']
    outer = (lip + (thick - lip) * np.sin(.5 * np.pi * np.clip(v / .25, 0, 1))[None]
             - (thick + bury) * _smoothstep(.35, 1., v)[None])
    inner = np.broadcast_to(lip - (lip + bury) * _smoothstep(0., .28, v), outer.shape)
    lift = ws['tipLift'][2] * _smoothstep(ws['tipLift'][0], ws['tipLift'][1], u)[:, None]
    lens_off = np.hstack([outer, inner[:, -2:0:-1]])
    lens_v = np.r_[v, v[-2:0:-1]]
    lens_off = -bury + rnd[:, None] * (lens_off + bury) + lift
    mid = .5 * (lo_t + hi_t)
    phi = mid[:, None] + rnd[:, None] * (lo_t[:, None] + (hi_t - lo_t)[:, None] * lens_v[None] - mid[:, None])
    def laid(z, theta, off):
        zc_ = np.maximum(z, ws['extrude'])
        p0 = body_at(zc_, theta)
        d_t = body_at(zc_, theta + 1e-3) - p0
        d_z = body_at(zc_ + 1e-3, theta) - p0
        n_ = np.cross(d_t, d_z)
        n_ /= np.linalg.norm(n_, axis=1, keepdims=True)
        centre = np.stack([0 * zc_, np.interp(np.clip(zc_, st[0, 0], st[-1, 0]), st[:, 0], st[:, 2]), zc_], axis=1)
        n_ *= np.sign(((p0 - centre) * n_).sum(axis=1))[:, None]
        p0[:, 2] = z
        return p0 + off[:, None] * n_
    tip_lift = ws['tipLift'][2]
    for name, side in (('wingR', 1), ('wingL', -1)):
        theta = np.radians(phi) if side > 0 else np.pi - np.radians(phi)
        ring_pts = laid(np.repeat(zw, lens_off.shape[1]), theta.ravel(), lens_off.ravel()).reshape(K, -1, 3)
        front = laid(np.array([ws['z'][0]]), np.array([theta[0].mean()]), np.array([-bury]))[0]
        end_phi = np.radians(np.interp(ws['z'][1], *np.array(ws['lower']).T))
        back = laid(np.array([ws['z'][1]]), np.array([end_phi if side > 0 else np.pi - end_phi]),
                    np.array([tip_lift + .5 * float(lip[-1, 0])]))[0]
        pts, ptris, k_of, j_of = _closed_shell(ring_pts, front, back)
        n_ring = ring_pts.shape[1]
        parts.append({'name': name, 'pos': pts, 'tris': ptris,
                      's': np.where(j_of >= 0, j_of / n_ring, np.nan), 't': k_of / (K + 1)})
    # 5. The tail: a closed loft on the traced, upturned centre line.
    ts = spec['tail']
    line = np.array(ts['line'], 'f8')
    dense_l = _catmull(line, 24)
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(dense_l, axis=0), axis=1))]
    arc /= arc[-1]
    KT, NT = ts['stations'], ts['ring']
    sk = np.arange(1, KT + 1) / (KT + 1)
    cz, cy = np.interp(sk, arc, dense_l[:, 0]), np.interp(sk, arc, dense_l[:, 1])
    dz_ = np.interp(sk + 1e-3, arc, dense_l[:, 0]) - np.interp(sk - 1e-3, arc, dense_l[:, 0])
    dy_ = np.interp(sk + 1e-3, arc, dense_l[:, 1]) - np.interp(sk - 1e-3, arc, dense_l[:, 1])
    tl = np.hypot(dz_, dy_)
    bz, by = -dy_ / tl, dz_ / tl
    flip_ = np.where(by < 0, -1., 1.)
    bz, by = bz * flip_, by * flip_
    sec = np.array(ts['section'], 'f8')
    s_cap = 1 - ts['round']
    cap = np.sqrt(np.clip(1 - ((sk - s_cap) / ts['round']) ** 2, 0, 1)) * (sk > s_cap) + (sk <= s_cap)
    w_t = np.interp(np.minimum(sk, s_cap), sec[:, 0], sec[:, 1]) * cap
    h_t = np.interp(np.minimum(sk, s_cap), sec[:, 0], sec[:, 2]) * cap
    psi = 2 * np.pi * np.arange(NT) / NT
    tail_rings = np.stack([w_t[:, None] * np.cos(psi)[None],
                           cy[:, None] + h_t[:, None] * np.sin(psi)[None] * by[:, None],
                           cz[:, None] + h_t[:, None] * np.sin(psi)[None] * bz[:, None]], axis=2)
    root = np.array([0., line[0, 1], line[0, 0]])
    tip = np.array([0., line[-1, 1], float(lo0[2])])
    pts, ptris, k_of, j_of = _closed_shell(tail_rings, root, tip)
    parts.append({'name': 'tail', 'pos': pts, 'tris': ptris,
                  's': np.where(j_of >= 0, j_of / NT, np.nan), 't': k_of / (KT + 1)})
    # Assemble the fill from its parts.
    fill_pos, tris_all, s_all, t_all, part_of = [], [], [], [], []
    off_ = 0
    for k_, part in enumerate(parts):
        fill_pos.append(part['pos'])
        tris_all.append(part['tris'] + off_)
        s_all.append(part['s'])
        t_all.append(part['t'])
        part_of.append(np.full(len(part['pos']), k_))
        off_ += len(part['pos'])
    fill_pos, tris = np.vstack(fill_pos), np.vstack(tris_all)
    s_all, t_all, part_of = np.concatenate(s_all), np.concatenate(t_all), np.concatenate(part_of)
    tip_i = len(fill_pos) - 1
    report['parts'] = {p['name']: {'vertices': len(p['pos']), 'triangles': len(p['tris'])} for p in parts}
    report['fillVertices'], report['fillTriangles'] = len(fill_pos), len(tris)
    others = np.ones(len(fill_pos), bool)
    others[tip_i] = False
    assert (fill_pos[others, 2] > fill_pos[tip_i, 2]).all(), 'the tail tip is not the rearmost point'
    # 6. Skin: the edge keeps its own; the fill takes the deleted region's by inverse distance.
    joints_src, weights_src = attrs['JOINTS_0'], attrs['WEIGHTS_0'].astype('f8')
    n_joints = len(doc['skins'][0]['joints'])
    rep = np.full(len(P), -1)
    rep[kept_welded.ravel()] = kept_faces.ravel()
    gone = np.zeros(len(P), bool)
    gone[F[drop].ravel()] = True
    gone[kept_welded.ravel()] = False
    G = np.flatnonzero(gone)
    dense_g = np.zeros((len(G), n_joints))
    for c in range(4):
        np.add.at(dense_g, (np.arange(len(G)), joints_src[first[G], c].astype('i8')), weights_src[first[G], c])
    skin = np.zeros((len(fill_pos), n_joints))
    rows_b = rep[loop]
    for c in range(4):
        np.add.at(skin, (np.arange(n_b), joints_src[rows_b, c].astype('i8')), weights_src[rows_b, c])
    dd, nn = cKDTree(P[G]).query(fill_pos[n_b:], k=spec['skinNearest'])
    wgt = 1 / np.maximum(dd, 1e-4) ** 2
    skin[n_b:] = (dense_g[nn] * wgt[:, :, None]).sum(axis=1) / wgt.sum(axis=1, keepdims=True)
    held = np.zeros(len(fill_pos), bool)
    held[:n_b] = True
    skin = _relax(skin, _edges(tris), held, 30)
    # Width: each side of the fill is widened, faded in from the edge, so the
    # wing lip restores the source's width extreme exactly.
    wq = _smoothstep(*spec['widen'], cKDTree(B).query(fill_pos)[0])
    wq *= _smoothstep(*spec['widenY'], fill_pos[:, 1])
    wq[:n_b] = 0
    scales = []
    for side, bound in ((1, float(hi0[0])), (-1, float(lo0[0]))):
        sel = np.sign(fill_pos[:, 0]) == side
        reach = lambda k_: float(np.max(side * fill_pos[sel, 0] * (1 + (k_ - 1) * wq[sel])))
        k_lo, k_hi = .85, 1.2
        assert reach(k_lo) < side * bound < reach(k_hi), 'the wing cannot be fitted to the width extreme'
        for _ in range(60):
            k_mid = .5 * (k_lo + k_hi)
            k_lo, k_hi = (k_mid, k_hi) if reach(k_mid) < side * bound else (k_lo, k_mid)
        fill_pos[sel, 0] *= 1 + (k_hi - 1) * wq[sel]
        i_ext = np.flatnonzero(sel)[np.argmax(side * fill_pos[sel, 0])]
        fill_pos[i_ext, 0] = bound
        scales.append(round(k_hi, 4))
    report['widthScale'] = scales
    # 7. UV: each part's grid in its own rectangle of the island. A face that
    # wraps round a loop takes copies of its low-angle corners one turn on; each
    # fan face takes its own copy of its apex.
    vid, s_out, src = {}, [], []
    def corner(v_, s_):
        key = (int(v_), round(float(s_), 9))
        if key not in vid:
            vid[key] = len(src)
            src.append(int(v_))
            s_out.append(float(s_))
        return vid[key]
    split = []
    for tri in tris:
        ss = s_all[tri]
        if np.isnan(ss).any():
            ss = np.where(np.isnan(ss), np.nanmean(ss), ss)
        if ss.max() - ss.min() > .5:
            ss = np.where(ss < .5, ss + 1, ss)
        split.append([corner(v_, s_) for v_, s_ in zip(tri, ss)])
    split, src, s_out = np.array(split), np.array(src), np.array(s_out)
    col, row, width, height = spec['island']
    fill_uv = np.zeros((len(src), 2))
    for k_, part in enumerate(parts):
        r0, rh = spec['rects'][part['name']]
        on = part_of[src] == k_
        fill_uv[on] = np.stack([(col + 1.5 + (width - 3) * t_all[src[on]]) / 512,
                                (row + r0 + 1.5 + (rh - 3) * s_out[on] / s_out[on].max()) / 512], axis=1)
    top = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top[top_w == 0] = 0
    # 8. Assemble.
    kept = np.unique(kept_faces)
    remap = np.full(len(pos), -1)
    remap[kept] = np.arange(len(kept))
    n_kept = len(kept)
    all_pos = np.vstack([pos[kept], fill_pos[src]])
    all_faces = np.vstack([remap[kept_faces], split + n_kept])
    w_first, w_inverse = _weld(all_pos)
    wf = w_inverse[all_faces]
    ddir = wf[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    _, use = np.unique(np.sort(ddir, axis=1), axis=0, return_counts=True)
    assert (use == 2).all(), 'rebuilt mesh is not closed'
    assert len(np.unique(ddir, axis=0)) == len(ddir), 'rebuilt mesh winding is inconsistent'
    W_ = all_pos[w_first]
    fn = np.cross(W_[wf[:, 1]] - W_[wf[:, 0]], W_[wf[:, 2]] - W_[wf[:, 0]])
    assert np.einsum('ij,ij->', W_[wf[:, 0]], fn) > 0, 'rebuilt mesh faces inward'
    for k_, part in enumerate(parts):
        on_f = np.r_[np.zeros(len(kept_faces), bool), part_of[src[split[:, 0]]] == k_]
        assert np.einsum('ij,ij->', W_[wf[on_f, 0]], fn[on_f]) > 0 or k_ == 0, f'{part["name"]} faces inward'
    # Folds: every fill face agrees with the angle-weighted normal at its corners.
    vn = _smooth_normals(W_, wf)
    agree = (fn * vn[wf].sum(axis=1)).sum(axis=1)[len(kept_faces):]
    report['foldedFillFaces'] = int((agree <= 0).sum())
    assert (agree > 0).all(), f'{int((agree <= 0).sum())} fill faces fold against their neighbours'
    smooth = _smooth_normals(all_pos[w_first], wf)[w_inverse]
    all_nor = np.vstack([attrs['NORMAL'][kept].astype('f8'), smooth[n_kept:]])
    loop_rows = np.flatnonzero(np.isin(inverse[kept], loop))
    all_nor[loop_rows] = smooth[loop_rows]
    new = {
        'POSITION': all_pos.astype('<f4'), 'NORMAL': all_nor.astype('<f4'),
        'TEXCOORD_0': np.vstack([attrs['TEXCOORD_0'][kept], fill_uv]).astype('<f4'),
        'JOINTS_0': np.vstack([joints_src[kept], top[src]]).astype(joints_src.dtype),
        'WEIGHTS_0': np.vstack([attrs['WEIGHTS_0'][kept], top_w[src]]).astype(attrs['WEIGHTS_0'].dtype),
    }
    for k in names[2:]:
        assert np.array_equal(new[k][:n_kept], attrs[k][kept]), f'retained {k} changed'
    assert np.allclose(new['WEIGHTS_0'].sum(axis=1), 1, atol=1e-5), 'skin weights do not sum to one'
    # All six extremes exactly as the source's (length sets the normalize scale).
    assert np.array_equal(new['POSITION'].min(axis=0), lo0) and np.array_equal(new['POSITION'].max(axis=0), hi0), 'bounds moved'
    fill_mask = np.zeros(len(all_pos), bool)
    fill_mask[n_kept:] = True
    cap_old = np.zeros(len(P), bool)
    cap_old[F[drop].ravel()] = True
    report['dihedralP90P99'] = [np.percentile(_dihedrals(P, F, cap_old), (90, 99)).round(1).tolist(),
                                np.percentile(_dihedrals(all_pos[w_first], wf, fill_mask[w_first]), (90, 99)).round(1).tolist()]
    report['vertices'], report['triangles'] = int(len(all_pos)), int(len(all_faces))
    indices = all_faces.astype('<u2').ravel()
    glb = _pack_glb(blob, doc, base, prim, names, new, indices)
    # 9. The island rectangle, free of every retained chart by 3 texels at the
    # delivered 512, is painted in all three maps: one plumage white, the
    # retained plumage's median roughness, and a flat normal.
    blob2, doc2, base2 = load_glb_bytes(glb)
    mat = doc2['materials'][0]
    upos, uuv = new['POSITION'].astype('f8'), new['TEXCOORD_0'].astype('f8')
    kf = remap[kept_faces]
    _, owner = _rasterize(uuv, kf, np.zeros((len(uuv), 1)), 512)
    used = binary_dilation(owner >= 0, iterations=3)
    assert not used[row:row + height, col:col + width].any(), 'island rectangle overlaps a retained chart'
    images = {}
    for key, tex in (('albedo', mat['pbrMetallicRoughness']['baseColorTexture']['index']),
                     ('orm', mat['pbrMetallicRoughness']['metallicRoughnessTexture']['index']),
                     ('normal', mat['normalTexture']['index'])):
        vi = doc2['images'][doc2['textures'][tex]['source']]['bufferView']
        v_ = doc2['bufferViews'][vi]
        start = base2 + v_.get('byteOffset', 0)
        assert doc2['images'][doc2['textures'][tex]['source']]['mimeType'] == 'image/jpeg'
        images[key] = (vi, np.asarray(Image.open(io.BytesIO(bytes(blob2[start:start + v_['byteLength']]))).convert('RGB')).copy())
    h_, w_ = images['albedo'][1].shape[:2]
    ky = upos[kf][:, :, 1]
    r_, c_, _ = _texels(uuv, kf[(ky.min(axis=1) > .26) & (ky.max(axis=1) < .62)], upos, w_, h_)
    alb = images['albedo'][1][r_, c_].astype(int)
    white = (alb[:, 0] - alb[:, 2] < 60) & (alb.mean(axis=1) > 120)
    paint = {'albedo': np.array(spec['plumage'], 'f8'), 'orm': np.median(images['orm'][1][r_, c_][white], axis=0),
             'normal': np.array([128., 128., 255.])}
    k_ = w_ // 512
    box = (slice(row * k_, (row + height) * k_), slice(col * k_, (col + width) * k_))
    fr, fc, _ = _texels(uuv, split + n_kept, np.zeros((len(uuv), 1)), w_, h_)
    in_box = (fr >= row * k_) & (fr < (row + height) * k_) & (fc >= col * k_) & (fc < (col + width) * k_)
    assert in_box.all(), 'fill texels fall outside the island rectangle'
    out_images = {}
    for key, (vi, img) in images.items():
        painted = img.copy()
        painted[box] = np.rint(paint[key]).astype('u1')
        buf = io.BytesIO()
        Image.fromarray(painted).save(buf, format='JPEG', quality=spec['jpegQuality'], subsampling=0)
        back = np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert('RGB')).astype(int)
        outside = np.ones(img.shape[:2], bool)
        outside[box] = False
        err = float(np.abs(back[outside] - img[outside].astype(int)).mean())
        assert err < 2, f'{key} re-encode error {err:.2f}'
        out_images[vi] = buf.getvalue()
        report.setdefault('paint', {})[key] = {'value': np.rint(paint[key]).astype(int).tolist(), 'reencodeMeanError': round(err, 3)}
    glb = _repack_images(blob2, doc2, base2, out_images)
    return glb, report


# Duck feet (asset loop round 6, 2026-11-05). The generator's feet were a thick
# slab per foot with three parallel toe bars and a square heel block under a
# plain cylinder, faired in place; judged as stacked blocky slabs with no web
# profile or taper. This stage deletes each leg below `cut` and builds the foot
# afresh from a traced plan outline and a side profile, lathed about the ankle:
#   1. Each foot is star-shaped about a vertical axis through its ankle (the
#      centre of its cut ring), its heading turned `splay` degrees outward from
#      +z. Every ring is sampled at the same angles round that axis, densest
#      across the toes, with one sample exactly on each toe tip.
#   2. Plan outline R(angle): three splayed toes (`toes`: angle outward, reach,
#      tip radius), each a capsule from the ankle with a rounded tip; between
#      them a concave web edge at `web` of the neighbouring reach; a small heel
#      pad (`heel`) behind; soft-maxed and smoothed so toe and web meet in a
#      fillet.
#   3. Side profile: the tarsus is a laterally flattened ellipse (`tarsus`)
#      tapering from the cut to a swollen ankle knuckle at `ankleY`. Below it
#      each foot ring sits a fraction `lam` of the way from the ankle ellipse to
#      the outline, at a height that falls from the instep to a thin edge:
#      `edge` thick under the toes, half that across the web, a rounded `heelEdge`
#      behind, raised `ridge` along each toe so the toes read as ridges on a thin
#      web. The rim is rounded (top edge, outer edge, bottom edge rings) and the
#      sole is flat on the ground, closed by a fan, one vertex pinned at the
#      source's lowest height.
#   4. The cut ring is zipped to the ankle ring; skin comes from the deleted
#      foot by inverse distance; UVs are one rectangle per foot in free atlas
#      space at the delivered 512, painted the deleted feet's median orange,
#      their median roughness and a flat normal.
DUCK_FEET = {
    'cut': .105,
    'splay': 9.,
    # half width (across the heading) and half depth (along it): half way down the tarsus, at the ankle knuckle
    'tarsus': ((.020, .026), (.021, .027)),
    'ankleY': .046,
    'toes': ((-30., .142, .017), (0., .168, .018), (30., .150, .017)),
    'web': .80,
    'heel': .030,
    'edge': .011, 'webEdge': .0055, 'heelEdge': .016, 'ridge': .006, 'ridgeWidth': 6.,
    'lam': (.16, .38, .62, .84),
    'rim': .975,
    'angles': 30,
    'skinNearest': 4,
    'rect': (34, 40),
    'jpegQuality': 95,
}


def _duck_foot_outline(phi_deg, spec):
    """Plan reach of the foot about its ankle at angles phi (degrees, outward positive)."""
    grid = np.linspace(-180, 180, 3601)[:-1]
    toes = np.array(spec['toes'], 'f8')
    parts = [spec['heel'] * (1 + .25 * np.cos(np.radians(grid)))]
    for ang, reach, tip in toes:
        d = np.radians(grid - ang)
        lateral = (reach - tip) * np.sin(d)
        inside = (np.abs(lateral) < tip) & (np.cos(d) > 0)
        parts.append(np.where(inside, (reach - tip) * np.cos(d) + np.sqrt(np.clip(tip ** 2 - lateral ** 2, 0, None)), 0.))
    web = np.zeros_like(grid)
    for (a0, r0, _), (a1, r1, _) in zip(toes[:-1], toes[1:]):
        t = (grid - a0) / (a1 - a0)
        on = (t >= 0) & (t <= 1)
        web[on] = spec['web'] * (r0 + (r1 - r0) * t[on]) * (1 - .06 * np.sin(np.pi * t[on]))
    parts.append(web)
    stack = np.stack(parts)
    k = 400.
    soft = np.log(np.exp(k * (stack - stack.max(axis=0))).sum(axis=0)) / k + stack.max(axis=0)
    # A small fillet: circular smoothing over about 2 degrees.
    ker = np.exp(-.5 * (np.arange(-40, 41) / 20.) ** 2)
    ker /= ker.sum()
    smooth = np.convolve(np.r_[soft[-40:], soft, soft[:40]], ker, mode='same')[40:-40]
    return np.interp(np.mod(np.asarray(phi_deg) + 180, 360) - 180, grid, smooth, period=360)


def _duck_foot_angles(spec):
    """Sample angles (degrees, outward positive, ascending), densest across the toes, one on each toe tip."""
    n = spec['angles']
    grid = np.linspace(-180, 180, 7201)
    dens = 1 + 3.2 * np.exp(-(np.abs(grid) / 52.) ** 4)
    cdf = np.r_[0, np.cumsum(.5 * (dens[1:] + dens[:-1]) * np.diff(grid))]
    cdf /= cdf[-1]
    ang = np.interp((np.arange(n) + .5) / n, cdf, grid)
    for t_ang, _, _ in spec['toes']:
        ang[np.argmin(np.abs(ang - t_ang))] = t_ang
    assert (np.diff(ang) > 0).all()
    return ang


def rebuild_duck_feet(data, spec):
    """Each duck leg below the cut deleted and refilled by a foot lathed about its
    ankle from a traced plan outline and side profile; see DUCK_FEET. Returns
    (glb bytes, report)."""
    import io
    from PIL import Image
    from scipy.ndimage import binary_dilation
    from scipy.spatial import cKDTree
    blob, doc, base = load_glb_bytes(data)
    prim = doc['meshes'][0]['primitives'][0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']
    assert set(prim['attributes']) == set(names)
    attrs = {k: accessor(blob, doc, base, prim['attributes'][k])[0].copy() for k in names}
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3).astype('i8')
    pos = attrs['POSITION'].astype('f8')
    lo0, hi0 = attrs['POSITION'].min(axis=0), attrs['POSITION'].max(axis=0)
    first, inverse = _weld(pos)
    P, F = pos[first], inverse[faces]
    # 1. Everything below the cut (both feet) goes; the hole is one loop per leg.
    region = P[:, 1] < spec['cut']
    drop = region[F].all(axis=1)
    kept_faces, kept_welded = faces[~drop], F[~drop]
    directed = kept_welded[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    present = set(map(tuple, directed.tolist()))
    border = [(a_, b_) for a_, b_ in directed.tolist() if (b_, a_) not in present]
    following = dict(border)
    assert len(following) == len(border), 'leg hole boundary is not simple'
    loops, seen = [], set()
    for a_, _ in border:
        if a_ in seen:
            continue
        loop = [a_]
        while following[loop[-1]] != loop[0]:
            loop.append(following[loop[-1]])
        seen.update(loop)
        loops.append(np.array(loop))
    assert len(loops) == 2, f'{len(loops)} leg holes, expected two'
    loops.sort(key=lambda l_: float(P[l_, 0].mean()))
    assert P[loops[0], 0].max() < 0 < P[loops[1], 0].min(), 'leg holes are not one per side'
    y0 = float(lo0[1])
    # Paint: the deleted feet's median orange and roughness, measured at full atlas size.
    images = {}
    mat = doc['materials'][0]
    for key, tex in (('albedo', mat['pbrMetallicRoughness']['baseColorTexture']['index']),
                     ('orm', mat['pbrMetallicRoughness']['metallicRoughnessTexture']['index']),
                     ('normal', mat['normalTexture']['index'])):
        vi = doc['images'][doc['textures'][tex]['source']]['bufferView']
        v_ = doc['bufferViews'][vi]
        start = base + v_.get('byteOffset', 0)
        assert doc['images'][doc['textures'][tex]['source']]['mimeType'] == 'image/jpeg'
        images[key] = (vi, np.asarray(Image.open(io.BytesIO(bytes(blob[start:start + v_['byteLength']]))).convert('RGB')).copy())
    h_, w_ = images['albedo'][1].shape[:2]
    uv0 = attrs['TEXCOORD_0'].astype('f8')
    r_, c_, _ = _texels(uv0, faces[drop], pos, w_, h_)
    alb = images['albedo'][1][r_, c_].astype(int)
    orange = (alb[:, 0] - alb[:, 2] > 80) & (alb[:, 0] > 150)
    assert orange.mean() > .5, 'the deleted feet are not mostly orange'
    paint = {'albedo': np.median(alb[orange], axis=0), 'orm': np.median(images['orm'][1][r_, c_][orange], axis=0),
             'normal': np.array([128., 128., 255.])}
    # 2. Each foot.
    ang = _duck_foot_angles(spec)
    N = len(ang)
    R_out = _duck_foot_outline(ang, spec)
    toes = np.array(spec['toes'], 'f8')
    ridge_m = np.exp(-.5 * ((ang[:, None] - toes[None, :, 0]) / spec['ridgeWidth']) ** 2).max(axis=1)
    # Edge thickness by angle: toe tips `edge`, the web half that, the heel rounded.
    front = np.clip((np.abs(ang) - toes[:, 0].max()) / 40., 0, 1)
    between = (np.abs(ang) < toes[:, 0].max())
    edge_t = np.where(between, spec['webEdge'] + (spec['edge'] - spec['webEdge']) * ridge_m,
                      spec['edge'] + (spec['heelEdge'] - spec['edge']) * _smoothstep(0., 1., front))
    (tw0, td0), (tw1, td1) = spec['tarsus']
    def ellipse(a_w, a_d):
        th = np.radians(ang)
        return 1 / np.sqrt((np.sin(th) / a_w) ** 2 + (np.cos(th) / a_d) ** 2)
    r_ank = ellipse(tw1, td1)
    fill_pos, tris, s_all, t_all, foot_of, loop_n = [], [], [], [], [], []
    report = {'cut': spec['cut'], 'angles': N, 'removedTriangles': int(drop.sum()), 'feet': {}}
    off = 0
    for side, loop in ((-1, loops[0]), (1, loops[1])):
        L = P[loop]
        cc = L.mean(axis=0)
        heading = np.radians(spec['splay']) * side
        fwd = np.array([np.sin(heading), 0., np.cos(heading)])
        out_ = np.array([np.cos(heading), 0., -np.sin(heading)]) * side   # outward, horizontal
        # Angles of the loop about the ankle axis, outward positive.
        rel = L - cc
        th_loop = np.degrees(np.arctan2(rel @ out_, rel @ fwd))
        un = np.unwrap(np.radians(np.r_[th_loop, th_loop[:1]]))
        sense = np.sign(un[-1] - un[0])
        assert abs(abs(un[-1] - un[0]) / (2 * np.pi) - 1) < .02, 'leg hole does not turn once about the ankle'
        def frac(deg):
            return np.mod(sense * np.radians(deg) / (2 * np.pi), 1.)
        s_loop = frac(th_loop)
        s_ring = frac(ang)
        order_r = np.argsort(s_ring)
        def ring(radius, y, centre):
            th = np.radians(ang)
            dirs = np.cos(th)[:, None] * fwd + np.sin(th)[:, None] * out_
            p_ = centre + radius[:, None] * dirs
            p_[:, 1] = y
            return p_[order_r]
        A = np.array([cc[0], y0, cc[2]])
        # The tarsus: one ring half way down from the cut (its own ellipse, on the
        # line from the cut's centre to the ankle), then the swollen ankle knuckle.
        y_mid = .5 * (float(L[:, 1].mean()) + spec['ankleY'])
        c_mid = .5 * (cc + A)
        rings = [ring(ellipse(tw0, td0), y_mid, c_mid), ring(r_ank * 1.06, spec['ankleY'], A)]
        H = spec['ankleY'] - y0
        for lam in spec['lam']:
            radius = (1 - lam) * r_ank + lam * R_out
            ridge = spec['ridge'] * ridge_m * np.sin(np.pi * min(1., lam / .9)) ** .5 * (lam > .3)
            thick = edge_t + (H - edge_t) * (1 - lam) ** np.where(np.abs(ang) < 60, 2.0, 1.1) + ridge
            rings.append(ring(radius, y0 + thick, A))
        rim = spec['rim']
        rad_rim = (1 - rim) * r_ank + rim * R_out
        rings.append(ring(rad_rim, y0 + .92 * edge_t, A))
        rings.append(ring(R_out, y0 + .5 * edge_t, A))
        rings.append(ring(rad_rim, np.full(N, y0), A))
        sole_c = A.copy()
        pts = np.vstack(rings + [sole_c[None]])
        n_loop = len(loop)
        # The loop itself is ring 0 (its own positions are kept).
        idx_rings = [np.arange(N) + k * N for k in range(len(rings))]
        apex = len(pts) - 1
        loop_ids = -1 - np.arange(n_loop)   # placeholders, resolved to the retained loop below
        ft = []
        ft += [tuple(t_) for t_ in _zipper(loop_ids, s_loop, idx_rings[0], s_ring[order_r])]
        for k in range(len(rings) - 1):
            o, i_ = idx_rings[k], idx_rings[k + 1]
            for m in range(N):
                o0, o1, i0, i1 = o[m], o[(m + 1) % N], i_[m], i_[(m + 1) % N]
                options = (((o1, o0, i0), (o1, i0, i1)), ((o1, o0, i1), (o0, i0, i1)))
                bend = []
                for pair in options:
                    n_ = [np.cross(pts[t_[1]] - pts[t_[0]], pts[t_[2]] - pts[t_[0]]) for t_ in pair]
                    bend.append(-(n_[0] @ n_[1]) / max(np.linalg.norm(n_[0]) * np.linalg.norm(n_[1]), 1e-20))
                ft += options[int(np.argmin(bend))]
        lr = idx_rings[-1]
        for j in range(N):
            ft.append((lr[(j + 1) % N], lr[j], apex))
        ft = np.array(ft)
        fill_pos.append(pts)
        loop_n.append((loop, off))
        tris.append(np.where(ft >= 0, ft + off, ft))
        s_all.append(np.r_[np.tile(s_ring[order_r], len(rings)), np.nan])
        t_all.append(np.r_[np.repeat(np.arange(1, len(rings) + 1) / (len(rings) + 1), N), 1.])
        foot_of.append(np.full(len(pts), 0 if side < 0 else 1))
        report['feet']['left' if side < 0 else 'right'] = {'loop': n_loop, 'ankle': A.round(4).tolist(),
                                                           'triangles': len(ft), 'vertices': len(pts)}
        off += len(pts)
    fill_pos = np.vstack(fill_pos)
    s_all, t_all, foot_of = np.concatenate(s_all), np.concatenate(t_all), np.concatenate(foot_of)
    # Resolve loop placeholders: fill vertex ids are offset past the loop vertices,
    # which are prepended (left loop then right loop) and keep their own positions.
    n_b = sum(len(l_) for l_, _ in loop_n)
    tri_list = []
    base_b = 0
    for (loop, _), ft in zip(loop_n, tris):
        ft = np.where(ft >= 0, ft + n_b, base_b + (-1 - ft))
        tri_list.append(ft)
        base_b += len(loop)
    tris = np.vstack(tri_list)
    loop_all = np.concatenate([l_ for l_, _ in loop_n])
    B = P[loop_all]
    all_fill = np.vstack([B, fill_pos])
    s_fill = np.r_[np.full(n_b, np.nan), s_all]
    t_fill = np.r_[np.zeros(n_b), t_all]
    foot_fill = np.r_[np.zeros(len(loop_n[0][0]), int), np.ones(len(loop_n[1][0]), int), foot_of]
    # 3. Skin: the loops keep theirs; the fill takes the deleted feet's by inverse distance.
    joints_src, weights_src = attrs['JOINTS_0'], attrs['WEIGHTS_0'].astype('f8')
    n_joints = len(doc['skins'][0]['joints'])
    rep = np.full(len(P), -1)
    rep[kept_welded.ravel()] = kept_faces.ravel()
    gone = np.zeros(len(P), bool)
    gone[F[drop].ravel()] = True
    gone[kept_welded.ravel()] = False
    G = np.flatnonzero(gone)
    dense_g = np.zeros((len(G), n_joints))
    for c in range(4):
        np.add.at(dense_g, (np.arange(len(G)), joints_src[first[G], c].astype('i8')), weights_src[first[G], c])
    skin = np.zeros((len(all_fill), n_joints))
    rows_b = rep[loop_all]
    for c in range(4):
        np.add.at(skin, (np.arange(n_b), joints_src[rows_b, c].astype('i8')), weights_src[rows_b, c])
    dd, nn = cKDTree(P[G]).query(all_fill[n_b:], k=spec['skinNearest'])
    wgt = 1 / np.maximum(dd, 1e-4) ** 2
    skin[n_b:] = (dense_g[nn] * wgt[:, :, None]).sum(axis=1) / wgt.sum(axis=1, keepdims=True)
    held = np.zeros(len(all_fill), bool)
    held[:n_b] = True
    skin = _relax(skin, _edges(tris), held, 30)
    # 4. UV: each foot's (angle, ring) grid in its own rectangle of free atlas space.
    kept_u = np.unique(kept_faces)
    remap = np.full(len(pos), -1)
    remap[kept_u] = np.arange(len(kept_u))
    n_kept = len(kept_u)
    _, owner = _rasterize(uv0[kept_u], remap[kept_faces], np.zeros((n_kept, 1)), 512)
    used = binary_dilation(owner >= 0, iterations=3)
    rw, rh = spec['rect']
    sat = np.pad(used.astype(int).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    def free(r0, c0):
        return sat[r0 + rh, c0 + rw] - sat[r0, c0 + rw] - sat[r0 + rh, c0] + sat[r0, c0] == 0
    rects = []
    for r0 in range(4, 508 - rh, 2):
        for c0 in range(4, 508 - rw, 2):
            if free(r0, c0) and all(abs(r0 - q[0]) >= rh or abs(c0 - q[1]) >= rw for q in rects):
                rects.append((r0, c0))
                if len(rects) == 2:
                    break
        if len(rects) == 2:
            break
    assert len(rects) == 2, 'no free atlas space for the feet'
    report['rects'] = [list(r) + [rw, rh] for r in rects]
    # Only the new faces (those touching a fill vertex) are split by UV.
    vid, s_out, src = {}, [], []
    def corner(v_, s_):
        key = (int(v_), round(float(s_), 9))
        if key not in vid:
            vid[key] = len(src)
            src.append(int(v_))
            s_out.append(float(s_))
        return vid[key]
    split = []
    for tri in tris:
        ss = s_fill[tri].copy()
        if np.isnan(ss).all():
            ss[:] = 0.
        ss = np.where(np.isnan(ss), np.nanmean(ss), ss)
        if ss.max() - ss.min() > .5:
            ss = np.where(ss < .5, ss + 1, ss)
        split.append([corner(v_, s_) for v_, s_ in zip(tri, ss)])
    split, src, s_out = np.array(split), np.array(src), np.array(s_out)
    fill_uv = np.zeros((len(src), 2))
    for k_, (r0, c0) in enumerate(rects):
        on = foot_fill[src] == k_
        fill_uv[on] = np.stack([(c0 + 1.5 + (rw - 3) * t_fill[src[on]]) / 512,
                                (r0 + 1.5 + (rh - 3) * s_out[on] / max(s_out[on].max(), 1e-9)) / 512], axis=1)
    top = np.argsort(-skin, axis=1)[:, :4]
    top_w = np.take_along_axis(skin, top, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)
    top[top_w == 0] = 0
    all_pos = np.vstack([pos[kept_u], all_fill[src]])
    all_faces = np.vstack([remap[kept_faces], split + n_kept])
    w_first, w_inverse = _weld(all_pos)
    wf = w_inverse[all_faces]
    ddir = wf[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    _, use = np.unique(np.sort(ddir, axis=1), axis=0, return_counts=True)
    assert (use == 2).all(), 'rebuilt mesh is not closed'
    assert len(np.unique(ddir, axis=0)) == len(ddir), 'rebuilt mesh winding is inconsistent'
    W_ = all_pos[w_first]
    fn = np.cross(W_[wf[:, 1]] - W_[wf[:, 0]], W_[wf[:, 2]] - W_[wf[:, 0]])
    assert np.einsum('ij,ij->', W_[wf[:, 0]], fn) > 0, 'rebuilt mesh faces inward'
    vn = _smooth_normals(W_, wf)
    agree = (fn * vn[wf].sum(axis=1)).sum(axis=1)[len(kept_faces):]
    report['foldedFillFaces'] = int((agree <= 0).sum())
    assert (agree > 0).all(), f'{int((agree <= 0).sum())} foot faces fold against their neighbours'
    smooth = vn[w_inverse]
    all_nor = np.vstack([attrs['NORMAL'][kept_u].astype('f8'), smooth[n_kept:]])
    loop_rows = np.flatnonzero(np.isin(inverse[kept_u], loop_all))
    all_nor[loop_rows] = smooth[loop_rows]
    new = {
        'POSITION': all_pos.astype('<f4'), 'NORMAL': all_nor.astype('<f4'),
        'TEXCOORD_0': np.vstack([attrs['TEXCOORD_0'][kept_u], fill_uv]).astype('<f4'),
        'JOINTS_0': np.vstack([joints_src[kept_u], top[src]]).astype(joints_src.dtype),
        'WEIGHTS_0': np.vstack([attrs['WEIGHTS_0'][kept_u], top_w[src]]).astype(attrs['WEIGHTS_0'].dtype),
    }
    for k in names[2:]:
        assert np.array_equal(new[k][:n_kept], attrs[k][kept_u]), f'retained {k} changed'
    assert np.allclose(new['WEIGHTS_0'].sum(axis=1), 1, atol=1e-5), 'skin weights do not sum to one'
    assert np.array_equal(new['POSITION'].min(axis=0), lo0) and np.array_equal(new['POSITION'].max(axis=0), hi0), 'bounds moved'
    report['vertices'], report['triangles'] = int(len(all_pos)), int(len(all_faces))
    report['fillTriangles'] = int(len(split))
    report['paint'] = {k: np.rint(v).astype(int).tolist() for k, v in paint.items()}
    indices = all_faces.astype('<u2').ravel()
    glb = _pack_glb(blob, doc, base, prim, names, new, indices)
    blob2, doc2, base2 = load_glb_bytes(glb)
    k_ = w_ // 512
    fr, fc, _ = _texels(new['TEXCOORD_0'].astype('f8'), split + n_kept, np.zeros((len(all_pos), 1)), w_, h_)
    box = np.zeros((h_, w_), bool)
    for r0, c0 in rects:
        box[r0 * k_:(r0 + rh) * k_, c0 * k_:(c0 + rw) * k_] = True
    assert box[fr, fc].all(), 'foot texels fall outside their rectangles'
    out_images = {}
    for key, (vi, img) in images.items():
        painted = img.copy()
        painted[box] = np.rint(paint[key]).astype('u1')
        buf = io.BytesIO()
        Image.fromarray(painted).save(buf, format='JPEG', quality=spec['jpegQuality'], subsampling=0)
        back = np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert('RGB')).astype(int)
        err = float(np.abs(back[~box] - img[~box].astype(int)).mean())
        assert err < 2, f'{key} re-encode error {err:.2f}'
        out_images[vi] = buf.getvalue()
        report.setdefault('reencodeMeanError', {})[key] = round(err, 3)
    glb = _repack_images(blob2, doc2, base2, out_images)
    return glb, report


def load_glb_bytes(data):
    length = struct.unpack_from('<I', data, 12)[0]
    return bytearray(data), json.loads(data[20:20 + length]), 28 + length


REBUILDS['cow'] = COW_HIDE
COW_HIDE['torso'] = COW_TORSO
COW_TORSO['tail'] = COW_HIDE['tail']
COW_HIDE['legShape'] = COW_LEGS
COW_LEGS['tail'] = COW_HIDE['tail']
COW_HIDE['tailShape'] = COW_TAIL
COW_HIDE['tailPaint'] = COW_TAIL['paint']
COW_HIDE['headShape'] = COW_HEAD
COW_HIDE['preservation'] = ('Fairing changed POSITION and NORMAL only; round 2 then moved the torso onto the level set of a blurred body volume (head, neck, tail root, udder and lower legs weighted out; normals from the field gradient blended into the moved mesh), POSITION and NORMAL only; ' + COW_HIDE['preservation'].split('; ', 1)[1].replace('JSON, topology, positions, normals, UV', 'JSON, topology, UV'))
COW_HIDE['preservation'] = COW_HIDE['preservation'].replace('POSITION and NORMAL only; the hide', 'POSITION and NORMAL only (each side widened back to its source x extreme, so the normalizer Pivot and the runtime rest-motion regions are unchanged); round 3 then reshaped the lower legs in place by their traced front and side profiles with modelled joints (hoof, fetlock, cannon, front knee set forward, hind back line held), POSITION and NORMAL only, vertex and index counts unchanged; the hide', 1)
COW_HIDE['preservation'] = (COW_HIDE['preservation']
    .replace('vertex and index counts unchanged; the hide', 'vertex and index counts unchanged; round 4 then deleted the 508 tail-only faces and lofted a new tail (authored dock, cord and seven-lock switch on the generator\'s own root loop, whose 22 join faces are kept) into the same 424 vertex slots and 508 index rows, with new UV strips in free atlas space and skin copied from the old tail by length, so POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0 and index bytes changed for the tail and its root only, 4138 vertices, 17958 indices and the runtime rest regions (41/27/437) unchanged and the rearmost point pinned; the hide', 1)
    .replace('head, hooves and tail texels kept', 'head and hooves kept; the lofted tail painted from its own parameters (dock continuing the rump, white cord, dark lock-streaked switch)', 1)
    .replace('JSON, topology, UV, skin, weights, joints,', 'JSON, topology outside the tail, UV and skin outside the tail, joints,', 1))


COW_HIDE['preservation'] += ('; round 6 then lathed each horn in place on its traced centre line (round section at the traced wide half width or an authored taper, faded into the poll; POSITION and NORMAL only, tips, bounds and the runtime ear and tail regions unchanged) and repainted the head at full atlas size from 3D position: eyes shrunk about their sclera centre by a tangent-plane radial remap of the source texels, ear interiors re-keyed from orange to skin pink with their shading kept, horns ivory darkening to the tip')


HORSE_HINDQUARTERS['haunch'] = HORSE_HAUNCH
HORSE_HINDQUARTERS['preservation'] += '; round 6 then posed the hind limb by its joints (each hind leg drawn toward the midline below the stifle, so the hock stands under the point of buttock and the cannon drops plumb to the hoof), faired the rump-thigh-leg seams, united tapered-capsule thigh masses (lateral thigh to the stifle, the thigh front edge, gaskin, inner thigh, hamstring, cannon) with the body along each vertex normal, drew the croup in behind the hip and re-laid the joint band diagonals by dihedral-reducing edge flips; vertex and triangle counts, UV, joint and weight bytes unchanged'


# The dino mascot, rebuilt whole (asset loop 2026-11-05, rounds 3 and 4). Rounds
# 1 and 2 grafted a tail and arms onto the generator's body sphere and the judge
# read the result as stacked primitives. So the figure is authored as one
# implicit solid traced from side and front profiles and meshed afresh: a torso
# loft (chest, pear belly, rump) and a head loft (chest, neck waist, round head,
# snout lobe) on bent centre lines, each with a traced half-height and
# width-ratio profile, joined at the neck by a smooth union with a nape fill
# behind the skull; cheeks, brows, thighs with flat-soled toed feet and elbowed
# arms with three-fingered mitten hands are smooth-unioned on; a smile groove is
# cut and a tongue laid in it. The solid is contoured by surface nets, decimated
# by quadric edge collapse (weighted toward the small features, kept fine round
# the eyes and the plate roots) inside the triangle budget, projected back onto
# the solid and fitted to the source bounds.
#
# Round 4 changed three constructions the judge struck for three rounds:
# - the tail is no longer the torso loft's last sections: it is its own loft on
#   a traced centre line (drooping from inside the rump, sweeping a little to
#   +x and flicking up at a round tip) joined to the rump by a fillet;
# - the dorsal plates are no longer squashed round cones: each is a traced fin
#   silhouette (a rounded triangle swept toward the tail) extruded across the
#   spine with a thickness that tapers to the apex, seated in a wide root fillet;
# - the skin is no longer a palette patch addressed per vertex (which smeared
#   every tone across 7 cm triangles and streaked the plate roots): the mesh is
#   cut into region charts (per part, per facing axis, split until no chart
#   overlaps itself), packed into the atlas, and every texel is painted from
#   the surface point it maps to (back, flank and lighter green underside bands,
#   crevice shade without the plates, X eyes, smile line, tongue, pale plates
#   and claw tips), so the albedo, ORM and normal images are repainted.
#
# Round 5: the tail loft's soft minimum is tightened (tailSoft) so the tail
# tapers to a rounded point instead of ending in an inflated ball; the fins are
# lower and longer, shortening their cast shadows down the lit flank; the skin
# bands follow a low-pass normal of the core so surface undulations no longer
# mottle the back, the back is lighter and the value noise one faint octave; the
# face's texel gain drops to 1.2 so the back gets more of the atlas; and the
# smile groove is shallower with a softer rim.
#
# Round 6 changed three constructions the judge kept faulting:
# - the dorsal fins (extruded traced silhouettes) are now lathed spikes: round
#   cones with a rounded apex leaning a little toward the tail, seated in a
#   flared fillet and meshed at half the fillet radius so the root is no longer
#   one crease-shaded triangle wide. The review sun sees a fin's whole length
#   along the spine but only a spike's base diameter, so at the same heights
#   the spikes' cast shadow on the lit back falls from .060 to .033 of it;
# - the mirrored nape-fill pair (two shoulder lobes and a transverse wobble
#   across the back) is one midline fill, so the back of the skull runs into
#   the back in one concave sweep;
# - the tail is re-traced on the midline (no side sweep, no up-flick), thicker
#   at the root and drooping a little further, tapering to a point;
# and the paint gives the back the tonal structure the front has: the lighter
#   lower band runs all round (not only where the skin faces down or forward),
#   a darker dorsal stripe carries the spikes from the nape to the tail tip, and
#   the crevice shade is halved on the back, where it read as mottling.
DINO_MASCOT = {
    # Lofts: (centre (x, y, z), half-height, width ratio), front to back. Source
    # frame: y up, the snout at -z, the tail at +z, the soles at the design ground.
    'head': [((0, .175, -.415), .092, 1.25), ((0, .2, -.345), .125, 1.2), ((0, .26, -.25), .19, 1.18),
             ((0, .25, -.165), .18, 1.15), ((0, .13, -.085), .16, 1.4), ((0, .0, -.04), .2, 1.3)],
    'torso': [((0, .03, -.06), .2, 1.25), ((0, -.04, -.02), .24, 1.22), ((0, -.07, .07), .265, 1.24),
              ((0, -.11, .165), .205, 1.25), ((0, -.15, .255), .125, 1.1)],
    # The tail's own traced centre line: root inside the rump, a steady droop on
    # the midline and a point. Round 5: the tail loft is joined with a tighter
    # soft minimum (tailSoft): at the default .01 the many near-equidistant short
    # segments of so thin a loft inflated every section by about .025, so the
    # authored .026 tip measured .07 and ended in a ball on a neck. Round 6: the
    # side sweep and the up-flick (read together as a knob curling to one side
    # from behind) are gone; the root is thicker and the droop a little longer.
    'tail': [((0, -.12, .19), .135, 1.18), ((0, -.2, .3), .1, 1.12), ((0, -.27, .39), .072, 1.06),
             ((0, -.31, .46), .045, 1.), ((0, -.32, .515), .016, 1.)],
    'tailSoft': .003,
    'tailBlend': .06,
    'neckBlend': .1,
    # Nape fill: fills the concave band where the back of the skull meets the
    # shoulders, leaving the neck waist under the jaw. Round 6: one fill on the
    # midline (its mirror is itself) instead of a pair at x .13, whose two lobes
    # and rear rims read as lumps across the back.
    'nape': ((0, .2, -.05), (.22, .14, .12), .08),
    'cheek': ((.14, .17, -.28), (.09, .08, .1), .05),  # centre (+x side), radii, blend
    'brow': ((.12, .37, -.3), (.075, .032, .055), .035),
    'ground': -.47,
    # Leg (hip inside the body, knee, ankle), radii; foot pad and three toes.
    'leg': ([(.165, -.18, .11), (.19, -.31, .075), (.195, -.4, .08)], [.125, .095, .078]),
    'foot': ((.195, -.44, .035), (.1, .055, .135)),
    'toes': [((-.0495, -.445, -.075), (.036, .03, .036)), ((0, -.445, -.087), (.036, .03, .036)),
             ((.0495, -.445, -.075), (.036, .03, .036))],  # offsets in x from the foot centre
    # Arm (shoulder in the chest, elbow, wrist): the forearm reaches forward off
    # the belly; a mitten hand with three finger tips and an inner thumb.
    'arm': ([(.2, .0, -.11), (.27, -.08, -.19), (.255, -.07, -.285)], [.076, .06, .05]),
    'hand': ((.25, -.068, -.325), (.056, .05, .05)),
    'fingers': [((-.026, -.012, -.04), (.019, .019, .026)), ((0, -.014, -.046), (.02, .02, .027)),
                ((.026, -.012, -.04), (.019, .019, .026))],  # offsets from the hand centre (x mirrored)
    'thumb': ((.205, -.05, -.315), (.022, .02, .024)),
    # Dorsal spikes, head to tail: (z of the root, height above the skin, radius
    # where the cone meets the skin); apex radius, apex lean toward the tail
    # (fraction of the height), root fillet. Round 6: lathed squat straight-sided
    # cones instead of extruded fins.
    # A slender cone casts a thin line of shadow down the back under a raking
    # sun, which reads as a streak; a squat one casts a short wedge at its foot.
    'plates': [(-.07, .05, .032), (.025, .049, .032), (.115, .043, .029), (.195, .036, .026)],
    'spikeTip': .011, 'plateSweep': .15, 'plateBlend': .035,
    'groove': .0055,             # smile cut radius (round 5: shallower)
    'grooveBlend': .01,          # and a softer rim
    'smile': (( 0, .14, -.3), 62., .028),  # arc centre, half-angle, corner lift
    'tongue': [(0, .125, -.46), (.014, .07, -.5)],
    'eyeDirection': (.7, .12, -.7),  # +x eye, from the head centre below
    'eyeFrom': (0, .26, -.25),
    'grid': .009,
    'maxTriangles': 4900,
    'importance': (30., .03),    # extra quadric weight at the small features and its reach
    'maxEdge': .07,
    'eyeZone': (.08, .022),      # radius about each eye centre and its edge limit
    'plateZone': (.065, .015),
    'tongueZone': (.05, .012),   # and about the tongue's root in the smile (round 6)    # the same about each spike root (round 6: half the fillet radius)
    # Charts: gutter in texels, texel density gain on charts near the face and
    # its reach, and how far (texels) painting extends past each chart.
    'atlas': {'gutter': 8, 'faceDensity': 1.2, 'faceReach': .12, 'dilate': 2.5},
    'bandStep': .04,             # gradient step of the low-pass normal that drives the skin bands
    # Round 6 paint: the lighter lower band all round (strength off the front),
    # its top and bottom heights; the dorsal stripe's widest half width, its z
    # span (it tapers to a point at both ends, stopping at the tail root), and
    # its edge softness.
    'lowerBand': (.6, .1, -.2),
    'stripe': (.05, (-.17, .29), .016),
    'imageSize': 1024,
    'jpegQuality': 92,
}
DINO_MASCOT['preservation'] = (
    'Rebuilt whole (rounds 3 to 6): the generator mesh is replaced by a solid authored from traced side and front '
    'profiles (head and torso lofts joined by a neck blend with a midline nape fill; a separate traced midline tail '
    'loft filleted into the rump; cheeks, brows, thighs with flat-soled toed feet, elbowed arms with three-fingered '
    'mitten hands, four graded lathed dorsal spikes in flared fillets, smile groove and tongue), contoured by surface nets, decimated by '
    'feature-weighted quadric collapse, projected onto the solid and fitted to the source bounds; UVs re-laid as '
    'region charts packed into the atlas and the albedo, ORM and normal images painted per texel from the surface; '
    'material, node, mesh and image structure, one primitive with POSITION, NORMAL and TEXCOORD_0, and every bound '
    'unchanged')


def _ellipsoid(q, c, r):
    r = np.asarray(r, 'f8')
    p = (q - np.asarray(c, 'f8')) / r
    k0 = np.linalg.norm(p, axis=1)
    k1 = np.linalg.norm(p / r, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-12)


def _smax(a, b, k):
    return -_smin(-a, -b, k)


def _loft_field(q, spec, per=8, soft=.01):
    """A sweep on a Catmull-Rom centre line: the section's half-height and width
    ratio are interpolated along each segment, and the segments are joined by
    an exponential smooth minimum, so joints carry no scallop and nearly equal
    distances do not pile up as a chain of pairwise blends would."""
    pts = [p for p, _, _ in spec]
    dense = _catmull(pts, per)
    s = np.linspace(0, len(pts) - 1, len(dense))
    r = np.interp(s, np.arange(len(pts)), [x for _, x, _ in spec])
    k = np.interp(s, np.arange(len(pts)), [x for _, _, x in spec])
    ds = []
    for i in range(len(dense) - 1):
        a, b = dense[i], dense[i + 1]
        ab = b - a
        t = np.clip(((q - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        d = q - (a + t[:, None] * ab)
        d[:, 0] /= k[i] + t * (k[i + 1] - k[i])
        ds.append(np.linalg.norm(d, axis=1) - (r[i] + t * (r[i + 1] - r[i])))
    ds = np.array(ds)
    low = ds.min(axis=0)
    return low - soft * np.log(np.exp(-(ds - low) / soft).sum(axis=0))


def _dino_plate_field(q, spec, geo):
    """The dorsal spikes (round 6): each lathed about its root normal, a
    straight-sided cone meeting the skin at the authored radius and rising to a
    rounded apex at the authored height, leaning toward the tail by `plateSweep`
    of that height. The cone's base sphere is sunk so its top is the root
    point: a shallower one bulges out of the skin as a dome under the cone.
    Frames (root, normal, along-spine, across) are in `geo`. (Rounds 4 and 5
    extruded a traced fin silhouette across the spine.)"""
    out = np.full(len(q), np.inf)
    tip, lean = spec['spikeTip'], spec['plateSweep']
    for (p, n, t, lat), (_, h, r0) in zip(geo['plates'], spec['plates']):
        rel = q - p
        loc = np.c_[rel @ t, rel @ n, rel @ lat]
        slope = (r0 - tip) / (h - tip)
        assert 0 < slope < 1, 'spike too squat for a sunk base sphere'
        ra = r0 / (1 - slope)
        out = np.minimum(out, _round_cone(loc, (0, -ra, 0), ra, (lean * h, h - tip, 0), tip))
    return out


def _dino_solid(q, spec, geo):
    """Every field of the mascot at q (negative inside), composed once: 'head',
    'torso', 'tail', 'core' (head, torso and tail), 'legs' and 'arms' (one per
    side), 'limbs', 'base' (all before the plates, groove and tongue), then, once
    `geo` holds the plate frames and the smile, 'plates', 'tongue', 'carved'
    (base with plates and groove) and 'full'."""
    head = _loft_field(q, spec['head'])
    for key in ('cheek', 'brow', 'nape'):
        c, r, k = spec[key]  # a mirrored pair, joined as one so the blend stays symmetric
        pair = np.minimum(_ellipsoid(q, c, r), _ellipsoid(q, (-c[0], c[1], c[2]), r))
        head = _smin(head, pair, k)
    torso = _loft_field(q, spec['torso'])
    tail = _loft_field(q, spec['tail'], per=6, soft=spec['tailSoft'])
    core = _smin(_smin(torso, tail, spec['tailBlend']), head, spec['neckBlend'])
    legs, arms = [], []
    for s in (-1, 1):
        mirror = lambda pts: [(s * x, y, z) for x, y, z in pts]
        pts, radii = spec['leg']
        leg = _loft_field(q, [(p, r, 1.) for p, r in zip(mirror(pts), radii)], per=4)
        fc, fr = spec['foot']
        foot = _ellipsoid(q, (s * fc[0], fc[1], fc[2]), fr)
        for (dx, y, z), r in spec['toes']:
            foot = _smin(foot, _ellipsoid(q, (s * (fc[0] + dx), y, z), r), .02)
        legs.append(_smin(leg, foot, .05))
        pts, radii = spec['arm']
        arm = _loft_field(q, [(p, r, 1.) for p, r in zip(mirror(pts), radii)], per=4)
        hc, hr = spec['hand']
        hand = _ellipsoid(q, (s * hc[0], hc[1], hc[2]), hr)
        for (dx, dy, dz), r in spec['fingers']:
            hand = _smin(hand, _ellipsoid(q, (s * (hc[0] + dx), hc[1] + dy, hc[2] + dz), r), .012)
        tc, tr = spec['thumb']
        hand = _smin(hand, _ellipsoid(q, (s * tc[0], tc[1], tc[2]), tr), .015)
        arms.append(_smin(arm, hand, .025))
    out = {'head': head, 'torso': torso, 'tail': tail, 'core': core, 'legs': legs, 'arms': arms}
    out['limbs'] = np.minimum(np.minimum(*legs), np.minimum(*arms))
    body = _smax(_smin(core, np.minimum(*legs), .07), spec['ground'] - q[:, 1], .012)
    body = _smin(body, np.minimum(*arms), .05)
    out['base'] = body
    if 'plates' not in geo:
        return out
    out['plates'] = _dino_plate_field(q, spec, geo)
    body = _smin(body, out['plates'], spec['plateBlend'])
    body = _smax(body, -_dino_groove(q, spec, geo), spec['grooveBlend'])
    t0, t1 = (np.asarray(p, 'f8') for p in spec['tongue'])
    tq = q.copy()
    tq[:, 2] = (q[:, 2] - t1[2]) / .55 + t1[2]
    a = t0.copy()
    a[2] = (a[2] - t1[2]) / .55 + t1[2]
    out['tongue'] = _round_cone(tq, a, .034, t1, .03)
    out['carved'] = body
    out['full'] = _smin(body, out['tongue'], .008)
    return out


def _dino_field(q, spec, geo, part='full'):
    """One field of the mascot's solid; see _dino_solid for the parts."""
    return _dino_solid(q, spec, geo)[part]


def _dino_groove(q, spec, geo):
    """Distance field of the smile cut (a capsule chain on the snout surface)."""
    g = np.full(len(q), np.inf)
    for a, b in zip(geo['smile'][:-1], geo['smile'][1:]):
        g = np.minimum(g, _round_cone(q, a, spec['groove'], b, spec['groove']))
    return g


def _field_grad(fn, q, h=1e-4):
    return np.stack([(fn(q + h * ax) - fn(q - h * ax)) / (2 * h) for ax in np.eye(3)], -1)


def _project_iso(fn, q, iterations=4):
    for _ in range(iterations):
        g = _field_grad(fn, q)
        q = q - (fn(q) / np.maximum((g * g).sum(axis=1), 1e-12))[:, None] * g
    return q


def _ray_surface(fn, origin, direction, reach=.6):
    t = np.arange(0, reach, .002)
    f = fn(origin[None] + t[:, None] * direction[None])
    k = int(np.argmax(f < 0))
    assert k > 0, 'ray starts inside the solid'
    lo, hi = t[k - 1], t[k]
    for _ in range(30):
        m = .5 * (lo + hi)
        lo, hi = (lo, m) if fn((origin + m * direction)[None])[0] < 0 else (m, hi)
    return origin + .5 * (lo + hi) * direction


def _dino_geometry(spec):
    """Placements read off the base solid: plate frames on the dorsal midline,
    the smile arc on the snout, the eye centres on the head."""
    geo = {}
    base = lambda q: _dino_field(q, spec, geo, 'base')
    plates = []
    for z, _, _ in spec['plates']:
        p = _ray_surface(base, np.array([0, .6, z]), np.array([0, -1., 0]))
        n = _field_grad(base, p[None])[0]
        n /= np.linalg.norm(n)
        # Mirrored blends applied in turn leave a trace of asymmetry; the frame
        # is held in the midline plane.
        assert abs(n[0]) < 1e-3, 'plate root off the midline'
        n[0] = 0
        n /= np.linalg.norm(n)
        t = np.array([0, 0, 1.]) - n[2] * n
        t /= np.linalg.norm(t)
        plates.append((p, n, t, np.cross(n, t)))
    centre, half, lift = spec['smile']
    smile = []
    for ang in np.linspace(-half, half, 13):
        d = np.array([np.sin(np.radians(ang)), 0, -np.cos(np.radians(ang))])
        o = np.asarray(centre, 'f8') + [0, lift * (abs(ang) / half) ** 2, 0]
        smile.append(_ray_surface(base, o + .5 * d, -d))
    geo['smile'] = np.array(smile)
    geo['plates'] = plates
    full = lambda q: _dino_field(q, spec, geo)
    geo['eyes'] = []
    for s in (-1, 1):
        d = np.array(spec['eyeDirection'], 'f8') * [s, 1, 1]
        d /= np.linalg.norm(d)
        o = np.asarray(spec['eyeFrom'], 'f8')
        e = _ray_surface(full, o + .5 * d, -d)
        n = _field_grad(full, e[None])[0]
        n /= np.linalg.norm(n)
        up = np.array([0, 1., 0]) - n[1] * n
        up /= np.linalg.norm(up)
        geo['eyes'].append((e, n, np.cross(up, n) * s, up))
    return geo


def _surface_nets(fn, lo, hi, h):
    """Naive surface nets: one vertex per sign-changing cell (the mean of its
    edge crossings), one quad per sign-changing grid edge, wound outward."""
    xs = [np.arange(lo[i], hi[i] + h, h) for i in range(3)]
    shape = tuple(len(x) for x in xs)
    grid = np.stack(np.meshgrid(*xs, indexing='ij'), -1).reshape(-1, 3)
    vals = np.concatenate([fn(grid[i:i + 300000]) for i in range(0, len(grid), 300000)]).reshape(shape)
    inside = vals < 0
    nx, ny, nz = shape
    count = sum(inside[i:nx - 1 + i, j:ny - 1 + j, k:nz - 1 + k].astype('i4') for i in (0, 1) for j in (0, 1) for k in (0, 1))
    active = (count > 0) & (count < 8)
    cells = np.argwhere(active)
    cell_id = -np.ones(active.shape, 'i8')
    cell_id[active] = np.arange(len(cells))
    acc, num = np.zeros((len(cells), 3)), np.zeros(len(cells))
    for ax in range(3):
        others = [a for a in range(3) if a != ax]
        for o1 in (0, 1):
            for o2 in (0, 1):
                off = np.zeros(3, 'i8')
                off[others[0]], off[others[1]] = o1, o2
                i0 = cells + off
                i1 = i0.copy()
                i1[:, ax] += 1
                v0, v1 = vals[tuple(i0.T)], vals[tuple(i1.T)]
                m = (v0 < 0) != (v1 < 0)
                t = np.where(m, v0 / np.where(m, v0 - v1, 1), 0)
                acc[m] += (lo + h * (i0 + t[:, None] * np.eye(3)[ax]))[m]
                num[m] += 1
    verts = acc / num[:, None]
    quads = []
    for ax in range(3):
        others = [a for a in range(3) if a != ax]
        s0 = [slice(1, n - 1) for n in shape]
        s0[ax] = slice(0, shape[ax] - 1)
        s1 = list(s0)
        s1[ax] = slice(1, shape[ax])
        a, b = inside[tuple(s0)], inside[tuple(s1)]
        m = a != b
        e = np.argwhere(m)
        e[:, others] += 1

        def cell(d1, d2):
            c = e.copy()
            c[:, others[0]] -= d1
            c[:, others[1]] -= d2
            return cell_id[tuple(c.T)]
        quad = np.stack([cell(1, 1), cell(0, 1), cell(0, 0), cell(1, 0)], 1)
        quad[~a[m]] = quad[~a[m]][:, ::-1]
        quads.append(quad[:, ::-1] if ax == 1 else quad)
    quads = np.vstack(quads)
    return verts, np.vstack([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])


def _edge_counts(faces):
    e = np.sort(np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    return np.unique(e, axis=0, return_counts=True)[1]


def _qem_decimate(P, F, target, weight, max_edge, zones=()):
    """Quadric edge collapse (Garland-Heckbert) to `target` faces with the
    per-face quadrics scaled by `weight`; a collapse is refused if it breaks the
    link condition (stays manifold), flips or slivers a face, or leaves an edge
    longer than `max_edge` (or a zone's own limit within its radius: zones are
    (centre, radius, limit), for regions that must stay finely meshed)."""
    import heapq
    P, F = P.astype('f8').copy(), F.astype('i8')
    n, m = len(P), len(F)
    cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    ar = np.linalg.norm(cr, axis=1)
    nn = cr / np.maximum(ar, 1e-20)[:, None]
    plane = np.c_[nn, -(nn * P[F[:, 0]]).sum(axis=1)]
    K = (.5 * ar * weight)[:, None, None] * plane[:, :, None] * plane[:, None, :]
    Q = np.zeros((n, 4, 4))
    for i in range(3):
        np.add.at(Q, F[:, i], K)
    vf = [set() for _ in range(n)]
    Fl = F.tolist()
    for fi, (a, b, c) in enumerate(Fl):
        vf[a].add(fi)
        vf[b].add(fi)
        vf[c].add(fi)
    face_alive, vert_alive = np.ones(m, bool), np.ones(n, bool)
    version = np.zeros(n, 'i8')
    faces_left = m

    def best(a, b):
        Qs = Q[a] + Q[b]
        pa, pb = P[a], P[b]
        cands = [pa, pb, .5 * (pa + pb)]
        if abs(np.linalg.det(Qs[:3, :3])) > 1e-14:
            v = -np.linalg.solve(Qs[:3, :3], Qs[:3, 3])
            if ((v - cands[2]) ** 2).sum() < ((pa - pb) ** 2).sum():
                cands.append(v)
        errs = [np.r_[c, 1] @ Qs @ np.r_[c, 1] for c in cands]
        j = int(np.argmin(errs))
        return errs[j], cands[j]

    def limit(p):
        out = max_edge
        for c, rad, lim in zones:
            if ((p - c) ** 2).sum() < rad * rad:
                out = min(out, lim)
        return out

    def ring(a):
        out = set()
        for f in vf[a]:
            out.update(Fl[f])
        out.discard(a)
        return out

    edges = np.unique(np.sort(np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
    heap = [(best(a, b)[0], a, b, 0, 0) for a, b in edges.tolist()]
    heapq.heapify(heap)
    while faces_left > target and heap:
        _, a, b, va, vb = heapq.heappop(heap)
        if not (vert_alive[a] and vert_alive[b]) or version[a] != va or version[b] != vb:
            continue
        shared = vf[a] & vf[b]
        if len(shared) != 2:
            continue
        opposite = {x for f in shared for x in Fl[f]} - {a, b}
        if ring(a) & ring(b) != opposite:
            continue
        _, v = best(a, b)
        lv = limit(v)
        ok = all(((v - P[x]) ** 2).sum() <= min(lv, limit(P[x])) ** 2 for x in ring(a) | ring(b) if x not in (a, b))
        for f in ((vf[a] | vf[b]) - shared) if ok else ():
            old = [P[x] for x in Fl[f]]
            new = [v if x in (a, b) else P[x] for x in Fl[f]]
            co = np.cross(old[1] - old[0], old[2] - old[0])
            cn = np.cross(new[1] - new[0], new[2] - new[0])
            ln, lo_ = np.linalg.norm(cn), np.linalg.norm(co)
            perim = sum(((new[i] - new[(i + 1) % 3]) ** 2).sum() for i in range(3))
            if ln < 1e-12 or co @ cn < .2 * ln * lo_ or 3.464 * ln / perim < .12:
                ok = False
                break
        if not ok:
            continue
        P[a], Q[a] = v, Q[a] + Q[b]
        for f in list(vf[b]):
            if f in shared:
                for x in Fl[f]:
                    vf[x].discard(f)
                face_alive[f] = False
                faces_left -= 1
            else:
                Fl[f] = [a if x == b else x for x in Fl[f]]
                vf[a].add(f)
        vf[b] = set()
        vert_alive[b] = False
        version[a] += 1
        for x in ring(a):
            lo_, hi_ = min(a, x), max(a, x)
            heapq.heappush(heap, (best(a, x)[0], lo_, hi_, version[lo_], version[hi_]))
    keep = np.flatnonzero(vert_alive)
    remap = -np.ones(n, 'i8')
    remap[keep] = np.arange(len(keep))
    return P[keep], remap[np.array([Fl[f] for f in np.flatnonzero(face_alive)])]


def _chart_overlaps(uv, faces, cell=.0012):
    """True if any two faces of a planar chart cover the same sample point."""
    pts = uv[faces]
    lo = pts.reshape(-1, 2).min(axis=0)
    px = (pts - lo) / cell
    size = np.ceil(px.reshape(-1, 2).max(axis=0)).astype(int) + 2
    count = np.zeros((size[1], size[0]), 'i4')
    for a, b, c in px:
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        lo_ = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
        hi_ = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        X, Y = np.meshgrid(np.arange(lo_[0], hi_[0] + 1) + .5, np.arange(lo_[1], hi_[1] + 1) + .5)
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det
        inside = (l1 > 1e-7) & (l2 > 1e-7) & (1 - l1 - l2 > 1e-7)
        ys, xs = (Y[inside] - .5).astype(int), (X[inside] - .5).astype(int)
        if (count[ys, xs] > 0).any():
            return True
        count[ys, xs] += 1
    return False


def _dino_atlas(P, F, part, focus, spec, res, planes=None):
    """Region charts: faces grouped by part and by the axis they face most
    (smoothed so a face follows its neighbours where that axis still faces it),
    projected on that axis (a part in `planes`, {part: (2, 3) basis}, is one
    group projected on its own plane, as each eye disc is), split until no chart overlaps itself, scaled to one
    texel density (more near `focus` points: the face) and shelf-packed with a
    gutter. Returns per-face chart ids, per-corner UVs and a summary."""
    lay = spec['atlas']
    cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    fn = cr / np.maximum(np.linalg.norm(cr, axis=1), 1e-20)[:, None]
    e = np.sort(np.stack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]], 1), axis=2)
    key = (e[..., 0] * len(P) + e[..., 1]).reshape(-1)
    order = np.argsort(key, kind='stable').reshape(-1, 2)
    assert (key[order[:, 0]] == key[order[:, 1]]).all(), 'atlas needs a closed manifold'
    nbr = [[] for _ in range(len(F))]
    for a, b in (order // 3).tolist():
        nbr[a].append(b)
        nbr[b].append(a)
    axes = np.vstack([np.eye(3), -np.eye(3)])
    lab = np.argmax(fn @ axes.T, axis=1)
    for _ in range(4):
        new = lab.copy()
        for f in range(len(F)):
            cand = [int(lab[g]) for g in nbr[f] if part[g] == part[f]]
            for c in sorted(set(cand)):
                if cand.count(c) >= 2 and c != lab[f] and fn[f] @ axes[c] > .3:
                    new[f] = c
        lab = new
    planes = planes or {}
    for pid in planes:
        lab[part == pid] = 6

    def components(members):
        inset = set(members.tolist())
        seen, out = set(), []
        for f0 in members.tolist():
            if f0 in seen:
                continue
            seen.add(f0)
            stack, group = [f0], []
            while stack:
                f = stack.pop()
                group.append(f)
                for g in nbr[f]:
                    if g in inset and g not in seen and part[g] == part[f0] and lab[g] == lab[f0]:
                        seen.add(g)
                        stack.append(g)
            out.append(np.array(sorted(group)))
        return out

    work = components(np.arange(len(F)))
    charts = []
    while work:
        m = work.pop()
        basis = planes[int(part[m[0]])] if lab[m[0]] == 6 else np.eye(3)[[i for i in range(3) if i != int(lab[m[0]]) % 3]]
        flat = P @ basis.T
        if len(m) > 1 and _chart_overlaps(flat, F[m]):
            cen = flat[F[m]].mean(axis=1)
            d = int(np.argmax(np.ptp(cen, axis=0)))
            cut = np.median(cen[:, d])
            for half in (m[cen[:, d] <= cut], m[cen[:, d] > cut]):
                work.extend(components(half) if len(half) else [])
            continue
        charts.append((m, basis))
    # Each chart's corner coordinates in metres (density applied), turned to lie
    # wider than tall, then shelf-packed at the largest scale that fits.
    rects = []
    for m, basis in charts:
        c = (P[F[m]] @ basis.T).reshape(-1, 2)
        near = np.min(np.linalg.norm(P[np.unique(F[m])][:, None] - focus[None], axis=2)) < lay['faceReach']
        c = (c - c.min(axis=0)) * (lay['faceDensity'] if near else 1.)
        if np.ptp(c[:, 1]) > np.ptp(c[:, 0]):
            c = c[:, ::-1]
        rects.append(c)
    g = lay['gutter'] / res
    order_ = sorted(range(len(rects)), key=lambda i: (-np.ptp(rects[i][:, 1]), i))

    def pack(s):
        x = y = row = 0.
        place = {}
        for i in order_:
            w, h = np.ptp(rects[i], axis=0) * s + g
            if x + w > 1:
                x, y, row = 0., y + row, 0.
            place[i] = (x + g / 2, y + g / 2)
            x, row = x + w, max(row, h)
        return y + row <= 1, place
    lo_s, hi_s = 0., 10.
    for _ in range(40):
        mid = .5 * (lo_s + hi_s)
        lo_s, hi_s = (mid, hi_s) if pack(mid)[0] else (lo_s, mid)
    ok, place = pack(lo_s)
    assert ok and lo_s > 0, 'atlas packing failed'
    chart = np.zeros(len(F), 'i8')
    uv = np.zeros((len(F), 3, 2))
    for i, (m, _) in enumerate(charts):
        chart[m] = i
        uv[m] = (rects[i] * lo_s + place[i]).reshape(-1, 3, 2)
    return chart, uv, {'charts': len(charts), 'scale': lo_s}


def _rasterize_dilated(uv, faces, values, res, pad):
    """Per-vertex values interpolated over each face at texel centres, and
    extrapolated up to `pad` texels past its edges where no face covers the
    texel (the nearest face wins), so bilinear and mip taps at a chart's rim
    read paint from the surface rather than a gutter fill."""
    width = values.shape[1]
    image = np.zeros((res, res, width))
    dist = np.full((res, res), np.inf)
    px = uv * res - .5
    for face in faces:
        a, b, c = px[face]
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        lo = np.clip(np.floor(np.minimum(np.minimum(a, b), c) - pad).astype(int), 0, res - 1)
        hi = np.clip(np.ceil(np.maximum(np.maximum(a, b), c) + pad).astype(int), 0, res - 1)
        X, Y = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / det
        l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / det
        l3 = 1 - l1 - l2
        alt = abs(det) / np.maximum([np.linalg.norm(b - c), np.linalg.norm(c - a), np.linalg.norm(a - b)], 1e-12)
        out = np.maximum(np.maximum(np.maximum(-l1 * alt[0], -l2 * alt[1]), -l3 * alt[2]), 0)
        take = (out <= pad) & (out < dist[Y, X])
        if not take.any():
            continue
        lam = np.stack([l1[take], l2[take], l3[take]], axis=1)
        image[Y[take], X[take]] = lam @ values[face]
        dist[Y[take], X[take]] = out[take]
    return image, dist


_DINO_SKIN = {'back': (72, 136, 58), 'flank': (86, 152, 68), 'light': (138, 194, 94), 'stripe': (58, 118, 48)}
_DINO_PALE = (np.array([170., 210, 130]), np.array([204., 232, 168]))  # plate root; plate apex and claws


def _dino_claws(spec):
    """Claw tip points: the front of each finger and toe."""
    tips = []
    hc, fc = spec['hand'][0], spec['foot'][0]
    for s in (-1, 1):
        for (dx, dy, dz), r in spec['fingers']:
            tips.append((s * (hc[0] + dx), hc[1] + dy, hc[2] + dz - .75 * r[2]))
        for (dx, y, z), r in spec['toes']:
            tips.append((s * (fc[0] + dx), y + .2 * r[1], z - .7 * r[2]))
    return np.array(tips, 'f8')


def _dino_paint(q, n, spec, geo, nb=None):
    """Albedo (RGB) and roughness at surface points q with unit normals n; `nb`,
    a low-pass normal of the core (head, torso, tail), drives the back, flank and
    underside bands on the body so small undulations of the surface do not turn
    into tonal blotches (round 5); limbs keep their own normal."""
    f = _dino_solid(q, spec, geo)
    limb = _smoothstep(.01, -.03, f['limbs'] - f['core'])
    if nb is not None:
        nb = nb * (1 - limb)[:, None] + n * limb[:, None]
        n = nb / np.maximum(np.linalg.norm(nb, axis=1), 1e-12)[:, None]
    ny = n[:, 1]
    back = _smoothstep(.12, .75, ny) * (1 - .5 * limb)
    chest = _smoothstep(.15, .7, -n[:, 2]) * _smoothstep(.13, 0., q[:, 1])
    # Round 6: the lighter lower band runs all round the body, so the back and
    # rump carry the same light-to-dark structure as the front.
    gain, top, bottom = spec['lowerBand']
    lower = gain * _smoothstep(top, bottom, q[:, 1]) * (1 - back)
    light = np.maximum(np.maximum(_smoothstep(-.1, -.6, ny), chest), lower) * (1 - limb)
    flank, dark, lite = (np.array(_DINO_SKIN[k], 'f8') for k in ('flank', 'back', 'light'))
    rgb = flank + back[:, None] * (dark - flank) + light[:, None] * (lite - flank)
    # Round 6: a darker dorsal stripe on the midline from the nape to the tail
    # root, a long leaf tapering to a point at each end; the spikes sit on it.
    w0, (z0, z1), soft = spec['stripe']
    u = np.clip((q[:, 2] - z0) / (z1 - z0), 0, 1)
    width = w0 * np.sqrt(np.clip(4 * u * (1 - u), 0, 1)) - soft
    stripe = _smoothstep(width + soft, width, np.abs(q[:, 0])) * _smoothstep(-.05, .25, ny) * (1 - limb)
    rgb += stripe[:, None] * (np.array(_DINO_SKIN['stripe'], 'f8') - rgb)
    # Crevice shade from the solid without plates, groove or tongue, so no plate
    # root, smile or tongue darkens the skin round it; halved on the back.
    occl = np.clip(_dino_solid(q + .03 * n, spec, geo)['base'] / .03, 0, 1)
    rgb *= (1 - .16 * (1 - .5 * back) * (1 - occl))[:, None]
    rgb *= (1 + .01 * _value_noise(q, .07, 3.1))[:, None]
    rough = np.full(len(q), 150.)
    # Plates pale, lighter toward the apex; claw tips the apex tone.
    on_plate = _smoothstep(.01, -.004, f['plates'] - f['base'])
    pale = _smoothstep(.002, .012, f['base']) * on_plate
    lift = _smoothstep(.012, .05, f['base'])[:, None]
    plate_rgb = _DINO_PALE[0] + lift * (_DINO_PALE[1] - _DINO_PALE[0])
    rgb += pale[:, None] * (plate_rgb - rgb)
    claw = _smoothstep(.021, .012, np.min(np.linalg.norm(q[:, None] - _dino_claws(spec)[None], axis=2), axis=1))
    rgb += claw[:, None] * (_DINO_PALE[1] - rgb)
    rough -= 12 * np.maximum(pale, claw)
    # Smile line.
    ink = _smoothstep(.017, .011, _dino_groove(q, spec, geo) + spec['groove'])
    rgb += ink[:, None] * (np.array([30., 44, 30]) - rgb)
    # Stitched X eyes in each eye's tangent plane.
    for e, en, side, up in geo['eyes']:
        rel = q - e
        a, b = rel @ side, rel @ up
        facing = _smoothstep(.1, .4, n @ en) * (np.linalg.norm(rel, axis=1) < .09)
        arm = .034
        d1 = np.abs(a - b) / np.sqrt(2) + np.maximum(np.abs(a + b) / np.sqrt(2) - arm * np.sqrt(2), 0)
        d2 = np.abs(a + b) / np.sqrt(2) + np.maximum(np.abs(a - b) / np.sqrt(2) - arm * np.sqrt(2), 0)
        x = _smoothstep(.0105, .0075, np.minimum(d1, d2)) * facing
        rgb += x[:, None] * (np.array([20., 22, 20]) - rgb)
        rough -= 30 * x
    # Tongue: pink, shaded toward its underside, glossier.
    tm = _smoothstep(.002, -.002, f['tongue'] - f['carved'])
    shade = np.clip(.55 + .35 * ny - .4 * (1 - occl), 0, 1)[:, None]
    pink = np.array([168., 66, 92]) + shade * np.array([70., 74, 70])
    rgb += tm[:, None] * (pink - rgb)
    rough += tm * (95 - rough)
    return rgb, rough


def build_dino_mascot(data, spec):
    """The mascot rebuilt whole from its authored solid; see DINO_MASCOT.
    Returns (glb bytes, report)."""
    from PIL import Image
    import io
    blob, doc, base_off = load_glb_bytes(data)
    prim = doc['meshes'][0]['primitives'][0]
    names = ['POSITION', 'NORMAL', 'TEXCOORD_0']
    assert set(prim['attributes']) == set(names) and len(doc['meshes']) == 1 and len(doc['meshes'][0]['primitives']) == 1
    src = accessor(blob, doc, base_off, prim['attributes']['POSITION'])[0].astype('f8')
    lo0, hi0 = src.min(axis=0), src.max(axis=0)
    geo = _dino_geometry(spec)
    full = lambda q: _dino_field(q, spec, geo)
    # 1. Contour, decimate with the small features weighted, project back.
    P, F = _surface_nets(full, np.array([-.4, -.5, -.55]), np.array([.4, .55, .55]), spec['grid'])
    counts = _edge_counts(F)
    assert (counts == 2).all(), 'contour is not a closed manifold'
    P = _project_iso(full, P, 3)
    apexes = [p + h * n + spec['plateSweep'] * h * t for (p, n, t, _), (_, h, _) in zip(geo['plates'], spec['plates'])]
    marks = [p for p, _, _, _ in geo['plates']] + apexes + list(geo['smile']) + list(spec['tongue'])
    fc = spec['foot'][0]
    hc = spec['hand'][0]
    for s in (-1, 1):
        marks += [np.array([s * (fc[0] + dx), y, z]) for (dx, y, z), _ in spec['toes']]
        marks += [np.array([s * (hc[0] + dx), hc[1] + dy, hc[2] + dz]) for (dx, dy, dz), _ in spec['fingers']]
        marks += [np.array([s * spec['thumb'][0][0]] + list(spec['thumb'][0][1:]))]
        marks += [np.array([s * spec['brow'][0][0]] + list(spec['brow'][0][1:]))]
    marks += [e for e, _, _, _ in geo['eyes']]
    marks = np.array(marks, 'f8')
    gain, reach = spec['importance']
    cen = P[F].mean(axis=1)
    near = np.min(np.linalg.norm(cen[:, None] - marks[None], axis=2), axis=1)
    contour = (len(P), len(F))
    zones = [(e, spec['eyeZone'][0], spec['eyeZone'][1]) for e, _, _, _ in geo['eyes']]
    zones += [(p, spec['plateZone'][0], spec['plateZone'][1]) for p, _, _, _ in geo['plates']]
    zones += [(np.asarray(spec['tongue'][0], 'f8'), spec['tongueZone'][0], spec['tongueZone'][1])]
    P, F = _qem_decimate(P, F, spec['maxTriangles'], 1 + gain * np.exp(-(near / reach) ** 2), spec['maxEdge'], zones)
    assert len(F) <= spec['maxTriangles'], f'decimation stopped at {len(F)} faces'
    assert (_edge_counts(F) == 2).all(), 'decimated mesh is not a closed manifold'
    P = _project_iso(full, P, 4)
    N = _field_grad(full, P)
    N /= np.linalg.norm(N, axis=1)[:, None]
    cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    agree = ((cr / np.linalg.norm(cr, axis=1)[:, None])[:, None] * N[F]).sum(axis=2).min(axis=1)
    assert agree.min() > -.2, f'folded face after projection ({agree.min():.2f})'
    # 2. Region charts: each face to the part nearest its centre, then by facing
    # axis, split until no chart overlaps itself, packed at one texel density.
    res = spec['imageSize']
    cen = P[F].mean(axis=1)
    sol = _dino_solid(cen, spec, geo)
    part = np.argmin(np.stack([sol['head'], sol['torso'], sol['tail'], *sol['legs'], *sol['arms'],
                               sol['plates'], sol['tongue']]), axis=0)
    planes = {}
    for i, (e, n, side, up) in enumerate(geo['eyes']):  # each eye disc one chart on its own plane
        rel = cen - e
        disc = (np.hypot(rel @ side, rel @ up) < .07) & ((N[F].mean(axis=1) @ n) > .3) & (np.abs(rel @ n) < .04)
        part[disc] = 9 + i
        planes[9 + i] = np.array([side, up])
    focus = np.array([e for e, _, _, _ in geo['eyes']] + list(geo['smile']) + list(spec['tongue']), 'f8')
    chart, corner_uv, atlas = _dino_atlas(P, F, part, focus, spec, res, planes)
    pairs = np.unique(np.c_[F.reshape(-1), np.repeat(chart, 3)], axis=0)
    key = {(int(v), int(c)): i for i, (v, c) in enumerate(pairs)}
    faces = np.array([[key[(int(v), int(chart[f]))] for v in F[f]] for f in range(len(F))], 'i8')
    vid = pairs[:, 0]
    pos, nor = P[vid], N[vid]
    uv = np.zeros((len(pairs), 2))
    uv[faces.reshape(-1)] = corner_uv.reshape(-1, 2)
    # 3. Paint every texel from the surface point it maps to (projected back onto
    # the solid from the flat face), then fill the gutters; flat normal; ORM.
    core = lambda q: _dino_field(q, spec, geo, 'core')
    band = _field_grad(core, pos, spec['bandStep'])
    band /= np.maximum(np.linalg.norm(band, axis=1), 1e-12)[:, None]
    image, dist = _rasterize_dilated(uv, faces, np.c_[pos, nor, band], res, spec['atlas']['dilate'])
    known = dist <= spec['atlas']['dilate']
    texels = np.argwhere(known)
    albedo = np.zeros((res, res, 3))
    rough = np.zeros((res, res))
    for i in range(0, len(texels), 120000):
        idx = tuple(texels[i:i + 120000].T)
        q = _project_iso(full, image[idx][:, :3], 2)
        nq = image[idx][:, 3:6]
        nq /= np.maximum(np.linalg.norm(nq, axis=1), 1e-12)[:, None]
        albedo[idx], rough[idx] = _dino_paint(q, nq, spec, geo, image[idx][:, 6:9])
    albedo = _pull_push(albedo, known)
    rough = _pull_push(rough[..., None], known)[..., 0]
    images = {}
    for slot, img in (('baseColorTexture', albedo), ('metallicRoughnessTexture',
                      np.stack([np.full((res, res), 255.), rough, np.zeros((res, res))], -1)),
                      ('normal', np.broadcast_to(np.array([128., 128, 255]), (res, res, 3)))):
        buf = io.BytesIO()
        Image.fromarray(np.clip(np.round(img), 0, 255).astype('u1')).save(buf, format='JPEG', quality=spec['jpegQuality'], subsampling=0)
        images[_image(blob, doc, base_off, slot)[0]] = buf.getvalue()
    # 4. Fit to the source bounds per axis (normals by the inverse transpose).
    lo1, hi1 = pos.min(axis=0), pos.max(axis=0)
    scale = (hi0 - lo0) / (hi1 - lo1)
    assert (np.abs(scale - 1) < .06).all(), f'authored solid is off the source envelope {scale}'
    pos_fit = lo0 + (pos - lo1) * scale
    nor = nor / scale
    nor /= np.linalg.norm(nor, axis=1)[:, None]
    new = {'POSITION': pos_fit.astype('<f4'), 'NORMAL': nor.astype('<f4'), 'TEXCOORD_0': uv.astype('<f4')}
    assert np.allclose(new['POSITION'].min(axis=0), lo0, atol=1e-6) and np.allclose(new['POSITION'].max(axis=0), hi0, atol=1e-6)
    indices = faces.reshape(-1).astype('<u2')
    glb = _pack_glb(blob, doc, base_off, prim, names, new, indices)
    blob2, doc2, base2 = load_glb_bytes(glb)
    glb = _repack_images(blob2, doc2, base2, images)
    sole = np.abs(pos_fit[:, 1] - lo0[1]) < 1e-5
    heights = []  # measured on the decimated mesh: rise above each plate root along its normal
    for (p, n, t, _), (_, h, r0) in zip(geo['plates'], spec['plates']):
        rel = pos - p
        m = (np.abs(pos[:, 0]) < .03) & (np.abs(rel @ t) < r0 + spec['plateSweep'] * h + .01) & (np.linalg.norm(rel, axis=1) < h + r0)
        heights.append(round(float((rel[m] @ n).max()), 4))
    # Tail section radii on the decimated mesh, root to tip along its centre line
    # (mean distance of the vertices in a thin slab across it), to show the taper.
    line = _catmull([p for p, _, _ in spec['tail']], 3)
    tail_radii = []
    for i in range(2, len(line) - 1):
        t = line[i + 1] - line[i - 1]
        t /= np.linalg.norm(t)
        rel = pos - line[i]
        along = rel @ t
        m = (np.abs(along) < .006) & (np.linalg.norm(rel, axis=1) < .15)
        tail_radii.append(round(float(np.linalg.norm(rel[m] - along[m][:, None] * t, axis=1).mean()), 3) if m.any() else None)
    report = {'contour': {'vertices': contour[0], 'triangles': contour[1]}, 'vertices': int(len(pos)),
              'triangles': int(len(faces)), 'renderVertices': int(3 * len(faces)),
              'atlas': {'charts': atlas['charts'], 'coverage': round(float(known.mean()), 3),
                        'texelMetres': round(float(1 / (atlas['scale'] * res)), 5)},
              'fitScale': [round(float(s), 4) for s in scale], 'soleVertices': int(sole.sum()),
              'plateHeights': heights, 'tailRadii': tail_radii, 'minFoldAgreement': round(float(agree.min()), 3)}
    return glb, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='output/asset-upgrade-20260926/creatures-result.json')
    # Restricts a run to named slugs (comma separated) so one asset can be
    # regenerated without rewriting every other creature's crafted source.
    parser.add_argument('--only', default='')
    args = parser.parse_args()
    only = {s.strip().split('-', 1)[-1] if s.strip().split('-', 1)[0] in ('farm', 'village', 'world') else s.strip()
            for s in args.only.split(',') if s.strip()}
    unknown = only - set(PROFILES)
    if unknown:
        raise SystemExit(f'unknown creature slug(s): {sorted(unknown)}')
    reports = []
    for slug, (area, iterations, mobility, purpose) in PROFILES.items():
        if only and slug not in only:
            continue
        source = ROOT / 'assets/source/models' / area / f'{slug}-tripo-original.glb'
        target = source.with_name(f'{slug}-crafted.glb')
        blob, doc, base = load_glb(source)
        original_blob = bytes(blob)
        allowed = np.zeros(len(blob), dtype=bool)
        primitive_reports = []
        for mesh in doc['meshes']:
            for prim in mesh['primitives']:
                pos, po, ps = accessor(blob, doc, base, prim['attributes']['POSITION'])
                nor, no, ns = accessor(blob, doc, base, prim['attributes']['NORMAL'])
                inds, _, _ = accessor(blob, doc, base, prim['indices'])
                faces = inds.reshape(-1, 3).astype('i8')
                old_pos, old_nor = pos.copy(), nor.copy()
                new_pos, _, inverse = fair(old_pos, faces, iterations, mobility)
                pos[:] = new_pos
                nor[:] = normals(pos, faces, inverse, old_nor)
                assert np.isfinite(pos).all() and np.isfinite(nor).all()
                assert np.allclose(pos.min(axis=0), old_pos.min(axis=0), atol=1e-7)
                assert np.allclose(pos.max(axis=0), old_pos.max(axis=0), atol=1e-7)
                old_cross = np.cross(old_pos[faces[:, 1]] - old_pos[faces[:, 0]], old_pos[faces[:, 2]] - old_pos[faces[:, 0]])
                new_cross = np.cross(pos[faces[:, 1]] - pos[faces[:, 0]], pos[faces[:, 2]] - pos[faces[:, 0]])
                assert np.all((old_cross * new_cross).sum(axis=1) >= 0), 'face flip'
                for offset, stride in [(po, ps), (no, ns)]:
                    for vertex in range(len(pos)):
                        allowed[offset + vertex * stride:offset + vertex * stride + 12] = True
                distance = np.linalg.norm(pos - old_pos, axis=1)
                primitive_reports.append({'vertices': len(pos), 'triangles': len(faces),
                    'movedVertices': int((distance > 1e-8).sum()), 'maxDisplacementFraction': float(distance.max() / np.ptp(old_pos, axis=0).max()),
                    'normalMeanAngleDegrees': float(np.degrees(np.arccos(np.clip((old_nor * nor).sum(axis=1), -1, 1))).mean())})
        # Cow: the torso onto a blurred body volume, in place (POSITION and
        # NORMAL bytes only, so the byte boundary below still holds).
        torso = smooth_torso(blob, doc, base, REBUILDS[slug]['torso']) if REBUILDS.get(slug, {}).get('torso') else None
        # Cow: the lower legs by traced profile and joints, in place (POSITION
        # and NORMAL bytes only).
        leg_shape = shape_legs(blob, doc, base, REBUILDS[slug]['legShape']) if REBUILDS.get(slug, {}).get('legShape') else None
        # Cow: the horns lathed on traced centre lines, in place (POSITION and
        # NORMAL bytes only); the hide stage paints the head from its paint.
        head_shape = head_paint = None
        if REBUILDS.get(slug, {}).get('headShape'):
            head_shape, head_paint = shape_horns(blob, doc, base, REBUILDS[slug]['headShape'])
        changed = np.frombuffer(original_blob, 'u1') != np.frombuffer(blob, 'u1')
        assert not (changed & ~allowed).any(), 'non-position/normal byte changed'
        # Cow: the tail deleted and lofted afresh in its own vertex and index
        # slots (position, normal, UV, skin and index bytes of the tail only),
        # after the byte boundary above, before the hide paints it.
        tail_shape = tail_paint = None
        if REBUILDS.get(slug, {}).get('tailShape'):
            tail_shape, tail_paint = rebuild_tail(blob, doc, base, REBUILDS[slug]['tailShape'])
        rebuild = None
        output_bytes = bytes(blob)
        # Duck: the torso cap deleted and refilled by a closed-form loft grid
        # (topology, UV, skin and the three images change; see DUCK_TORSO).
        # Keyed here, not in REBUILDS, whose entries dispatch other rebuilders.
        torso = None
        if slug == 'duck':
            output_bytes, torso = rebuild_duck_torso(output_bytes, DUCK_TORSO)
            # Then each leg below the ankle cut, lathed afresh (see DUCK_FEET).
            output_bytes, torso['feet'] = rebuild_duck_feet(output_bytes, DUCK_FEET)
        # Dino mascot: rebuilt whole from its authored solid (see DINO_MASCOT);
        # mesh, UVs and the three images change, the document structure does not.
        dino = None
        if slug == 'dino-mascot':
            output_bytes, dino = build_dino_mascot(output_bytes, DINO_MASCOT)
        if slug in REBUILDS:
            kind = REBUILDS[slug].get('kind')
            rebuilder = {'hindquarters': rebuild_hindquarters, 'hide': repaint_hide}.get(kind, rebuild_rear)
            output_bytes, rebuild = rebuilder(blob, doc, base, REBUILDS[slug], **({'tail': tail_paint} if tail_paint else {}),
                                              **({'head': head_paint} if head_paint else {}))
            if torso:
                rebuild['torso'] = torso
            if leg_shape:
                rebuild['legShape'] = leg_shape
            if tail_shape:
                rebuild['tailShape'] = tail_shape
            if head_shape:
                rebuild['headShape'] = head_shape
            if REBUILDS[slug].get('mane'):
                output_bytes, rebuild['mane'] = rebuild_mane(output_bytes, REBUILDS[slug]['mane'],
                                                             REBUILDS[slug]['uvIslands'], 6300)
            if REBUILDS[slug].get('hindLegs'):
                output_bytes, rebuild['hindLegs'] = rebuild_hind_legs(output_bytes, REBUILDS[slug]['hindLegs'], 6300)
            if REBUILDS[slug].get('haunch'):
                output_bytes, rebuild['haunch'] = rebuild_haunch(output_bytes, REBUILDS[slug]['haunch'],
                                                                 REBUILDS[slug]['uvIslands']['tail'])
        target.write_bytes(output_bytes)
        reports.append({'id': f'{area}-{slug}', 'source': str(source.relative_to(ROOT)),
            'derivative': str(target.relative_to(ROOT)), 'purpose': purpose, 'iterations': iterations, 'mobility': mobility,
            'sourceSHA256': hashlib.sha256(original_blob).hexdigest(), 'derivativeSHA256': hashlib.sha256(output_bytes).hexdigest(),
            'rigPreservation': DINO_MASCOT['preservation'] if dino else DUCK_TORSO_PRESERVATION if torso else
                'All bytes except existing POSITION and NORMAL components identical; JSON, topology, skin, weights, joints, UV, inverse bind, node transforms, images and animations unchanged'
                if rebuild is None else
                REBUILDS[slug].get('preservation') or
                'Fairing changed POSITION and NORMAL only; the rear rebuild then moved the torso onto the level set of a blurred body volume with the tail root as a capsule in it (normals from its gradient), re-shaped and faired the ear blades, deleted each leg below a cut and lofted it afresh with its own UV island and blended skin, replaced one rump region with a biharmonic fill grafted onto a new traced tail with a blended joint and its own UV islands (see rebuild), repainted the skin texels of the albedo, ORM and normal images from 3D position (with trotter horn, eyes, lids, brows and snout), filled the chart gutters by pull-push and set matte roughness on all but eyes and nostrils. Retained vertices keep UV, joint and weight bytes; inverse binds, nodes, skins, materials and animations byte-identical; topology changed in the rebuilt region only',
            **({'rebuild': rebuild} if rebuild else {}),
            **({'torso': torso} if torso else {}),
            **({'mascot': dino} if dino else {}),
            'skins': len(doc.get('skins', [])), 'animations': len(doc.get('animations', [])),
            'jsonBytesIdentical': bytes(blob[:base]) == original_blob[:base], 'unexpectedChangedBytes': int((changed & ~allowed).sum()),
            'proposedSpec': {'preparedSource': target.name}, 'primitives': primitive_reports})
    output = ROOT / args.out
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'assets': reports, 'caveats': 'Source refinement only. Workbench rendered acceptance and normalized runtime verification are separate gates.'}, indent=2) + '\n')
    print(json.dumps(reports, indent=2))

if __name__ == '__main__':
    main()
