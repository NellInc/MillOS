"""Explicit duck-only colour correction, separate from position/normal fairing.

Run after refine_creature_assets.py. Fixes the confirmed orange dorsal albedo
patch using neighbouring neutral plumage texels. Geometry, UVs, rig and all
other image payloads remain byte-identical. Working if preservation assertions
pass and root's separate runtime render shows white wings with orange bill/feet.
No renderer is invoked. Requires the existing numpy, Pillow and scipy runtime.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt

from refine_creature_assets import ROOT, accessor, load_glb

EXPECTED = 'b9d04834a764780ba0d29a5a838538f757c373b558e357de73fc9aa684bfa5b8'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='assets/source/models/farm/duck-crafted.glb')
    parser.add_argument('--target', default='assets/source/models/farm/duck-crafted.glb')
    parser.add_argument('--out', default='output/world-lighting-20260927/duck')
    args = parser.parse_args()
    source, target, out = (ROOT / p for p in (args.source, args.target, args.out))
    blob, doc, base = load_glb(source)
    assert sha(blob) == EXPECTED, 'Unreviewed source; do not apply a spatial correction blindly'
    out.mkdir(parents=True, exist_ok=True)
    before = out / 'duck-crafted-before.glb'
    if before.exists():
        assert before.read_bytes() == blob, 'Immutable snapshot mismatch'
    else:
        before.write_bytes(blob)
    old_doc = json.loads(json.dumps(doc))
    prim = doc['meshes'][0]['primitives'][0]
    positions = accessor(blob, doc, base, prim['attributes']['POSITION'])[0]
    uv = accessor(blob, doc, base, prim['attributes']['TEXCOORD_0'])[0]
    faces = accessor(blob, doc, base, prim['indices'])[0].reshape(-1, 3)
    texture = doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
    image_index = doc['textures'][texture]['source']
    view_index = doc['images'][image_index]['bufferView']
    view = doc['bufferViews'][view_index]
    start = view.get('byteOffset', 0)
    old_image = bytes(blob[base + start:base + start + view['byteLength']])
    image = Image.open(io.BytesIO(old_image)).convert('RGB')
    pixels = np.asarray(image).copy()
    height, width = pixels.shape[:2]
    # In glTF coordinates y is height; this reviewed patch lies between the
    # folded wings, behind the neck. Bill (y>.7) and feet (y<.2) are excluded.
    corners = positions[faces]
    dorsal_vertex = ((np.abs(corners[:, :, 0]) < .15) &
                     (corners[:, :, 1] > .48) & (corners[:, :, 1] < .62) &
                     (corners[:, :, 2] > -.28) & (corners[:, :, 2] < .04))
    dorsal_faces = dorsal_vertex.all(axis=1)
    masks = []
    for selected in [dorsal_faces, ~dorsal_faces]:
        canvas = Image.new('1', (width, height))
        draw = ImageDraw.Draw(canvas)
        for triangle in uv[faces[selected]]:
            draw.polygon([(float(u * width), float(v * height)) for u, v in triangle], fill=1)
        masks.append(np.asarray(canvas).astype(bool))
    dorsal, protected = masks
    rgb = pixels.astype(np.int16)
    orange = (rgb[:, :, 0] - rgb[:, :, 1] > 25) & (rgb[:, :, 1] - rgb[:, :, 2] > 15)
    # Three texels of safety padding stay inside the same reviewed UV region;
    # protected triangles always win at shared edges and overlapping islands.
    mask = binary_dilation(orange & dorsal & ~protected, iterations=3) & dorsal & ~protected
    neutral = (dorsal | protected) & ~mask & (np.abs(rgb[:, :, 0] - rgb[:, :, 1]) < 20) & (np.abs(rgb[:, :, 1] - rgb[:, :, 2]) < 20)
    assert mask.any() and neutral.any()
    distance, nearest = distance_transform_edt(~neutral, return_indices=True)
    assert distance[mask].max() < 200, 'No nearby plumage donor; needs review'
    after = pixels.copy()
    after[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    assert np.array_equal(after[~mask], pixels[~mask])
    assert not np.any(mask & protected), 'Correction reaches non-dorsal UVs'
    encoded = io.BytesIO()
    Image.fromarray(after).save(encoded, format='PNG', compress_level=9)
    new_image = encoded.getvalue()
    # Lossless re-encoding is essential: JPEG would alter bill/feet and every
    # untouched decoded texel even when only a local mask was painted.
    assert np.array_equal(np.asarray(Image.open(io.BytesIO(new_image))), after)
    binary = bytes(blob[base:base + old_doc['buffers'][0]['byteLength']])
    new_binary = bytearray()
    payload_checks = []
    for index, entry in enumerate(doc['bufferViews']):
        old = old_doc['bufferViews'][index]
        payload = binary[old.get('byteOffset', 0):old.get('byteOffset', 0) + old['byteLength']]
        replacement = new_image if index == view_index else payload
        new_binary.extend(b'\0' * (-len(new_binary) % 4))
        entry['byteOffset'] = len(new_binary)
        entry['byteLength'] = len(replacement)
        new_binary.extend(replacement)
        payload_checks.append({'bufferView': index, 'beforeSHA256': sha(payload), 'afterSHA256': sha(replacement), 'identical': payload == replacement})
    doc['images'][image_index]['mimeType'] = 'image/png'
    doc['buffers'][0]['byteLength'] = len(new_binary)
    new_binary.extend(b'\0' * (-len(new_binary) % 4))
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    result = struct.pack('<III', 0x46546c67, 2, 28 + len(js) + len(new_binary)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(new_binary), b'BIN\0') + new_binary
    assert all(c['identical'] for c in payload_checks if c['bufferView'] != view_index)
    for key in ['accessors', 'meshes', 'skins', 'nodes', 'animations', 'materials', 'textures', 'samplers']:
        assert doc.get(key) == old_doc.get(key), key
    target.write_bytes(result)
    # Read back through the shared GLB accessor reader, not just pre-write data.
    written, wd, wb = load_glb(target)
    for index in range(len(doc['accessors'])):
        assert np.array_equal(accessor(blob, old_doc, base, index)[0], accessor(written, wd, wb, index)[0]), f'accessor {index}'
    (out / 'albedo-before.jpg').write_bytes(old_image)
    (out / 'albedo-after.png').write_bytes(new_image)
    Image.fromarray((mask * 255).astype('uint8')).save(out / 'correction-mask.png')
    report = {'cause': 'Embedded albedo paints orange on the dorsal folded-wing region; geometry/UVs unchanged.', 'sourceSHA256': sha(blob), 'targetSHA256': sha(result), 'dorsalTriangles': int(dorsal_faces.sum()), 'changedTexels': int(np.any(after != pixels, axis=2).sum()), 'maskTexels': int(mask.sum()), 'untouchedTexelsExact': True, 'protectedTriangleOverlap': 0, 'maximumDonorDistanceTexels': float(distance[mask].max()), 'allAccessorsExact': True, 'unchangedJSONStructures': ['accessors', 'meshes', 'skins', 'nodes', 'animations', 'materials', 'textures', 'samplers'], 'bufferViews': payload_checks, 'beforeBytes': len(blob), 'afterBytes': len(result), 'caveat': 'Prepared source only; delivery normalization, provenance and runtime render verification belong to root.'}
    (out / 'correction-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'bufferViews'}, indent=2))


if __name__ == '__main__':
    main()
