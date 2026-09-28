"""Conservative, rig-byte-preserving surface fairing of reviewed Tripo creatures.

Run with Python 3 + numpy (Blender's Python also works). Writes sibling *-crafted
sources, never delivery GLBs. No image, UV, topology, weight, joint, inverse-bind,
node, animation, or material data is changed. Only existing POSITION and NORMAL
accessor bytes are touched. Working if byte-diff checks prove this boundary and
paired rendered views retain animal identity while removing broad-surface noise.

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='output/asset-upgrade-20260926/creatures-result.json')
    args = parser.parse_args()
    reports = []
    for slug, (area, iterations, mobility, purpose) in PROFILES.items():
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
        changed = np.frombuffer(original_blob, 'u1') != np.frombuffer(blob, 'u1')
        assert not (changed & ~allowed).any(), 'non-position/normal byte changed'
        target.write_bytes(blob)
        reports.append({'id': f'{area}-{slug}', 'source': str(source.relative_to(ROOT)),
            'derivative': str(target.relative_to(ROOT)), 'purpose': purpose, 'iterations': iterations, 'mobility': mobility,
            'sourceSHA256': hashlib.sha256(original_blob).hexdigest(), 'derivativeSHA256': hashlib.sha256(blob).hexdigest(),
            'rigPreservation': 'All bytes except existing POSITION and NORMAL components identical; JSON, topology, skin, weights, joints, UV, inverse bind, node transforms, images and animations unchanged',
            'skins': len(doc.get('skins', [])), 'animations': len(doc.get('animations', [])),
            'jsonBytesIdentical': bytes(blob[:base]) == original_blob[:base], 'unexpectedChangedBytes': int((changed & ~allowed).sum()),
            'proposedSpec': {'preparedSource': target.name}, 'primitives': primitive_reports})
    output = ROOT / args.out
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'assets': reports, 'caveats': 'Source refinement only. Workbench rendered acceptance and normalized runtime verification are separate gates.'}, indent=2) + '\n')
    print(json.dumps(reports, indent=2))

if __name__ == '__main__':
    main()
