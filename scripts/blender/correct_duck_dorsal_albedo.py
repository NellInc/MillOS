"""Explicit duck-only colour correction, separate from position/normal fairing.

Run after refine_creature_assets.py. Fixes the confirmed orange dorsal albedo
patch using neighbouring neutral plumage texels. Geometry, UVs, rig and all
other image payloads remain byte-identical. Working if preservation assertions
pass and root's separate runtime render shows white wings with orange bill/feet.
No renderer is invoked. Requires the existing numpy, Pillow and scipy runtime.

Second stage (asset loop round 2, lift_plumage): the whole plumage was a warm
beige (about 197,180,168) that the review sky's blue-grey shade turned pink-grey
on the back, with tan crease texels across it. Every plumage texel is moved
toward one near-neutral white, weighted by its interpolated 3D normal (full on
the upward-facing back, shoulders and wing tops, LIFT_FLOOR on breast and
belly) so the flanks blend rather than seam; the local feather mottle is kept at
reduced strength and clipped, which erases the crease lines. Weights come from
3D, so both sides of a UV seam agree, and the chart gutters beside a lifted
texel are filled from it so the delivered 512 mips do not bleed beige lines.
Bill and foot orange, eye darks and the leg faces are protected (dilated) and
asserted unchanged.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter

from refine_creature_assets import ROOT, _texels, accessor, load_glb

# The fairing output with the torso cap rebuilt as a body loft plus separately
# lofted wings and tail (refine_creature_assets.py DUCK_TORSO, asset loop round
# 5) and the feet lathed afresh about each ankle (DUCK_FEET, round 6); was
# eb153def... after round 5, ad97df69... after round 4's closed-form loft grid,
# 1ba87cd6... after round 3's ray-cast fill, 7a27abd5... after round 1's
# DUCK_REAR and b9d04834... before any.
EXPECTED = '33094603e26eac6b4e82cb325f029887c84645469e48e70e96a20f533949b3af'


# lift_plumage: one near-neutral white (sRGB bytes) for the whole plumage,
# capped below the sun's clipping in the review light; full strength where the
# interpolated normal faces up (y > .55), LIFT_FLOOR where it faces sideways or
# down, so the flank is a gradient and not a seam.
# (230,227,221) put 189 sunlit pixels of the top-down review view at 254 or
# more; this value puts 20 there, keeping the lit back off the clip.
PLUMAGE_WHITE = np.array([220., 217., 211.], dtype=np.float32)
LIFT_FLOOR = .5
# Feather mottle relative to a 32-texel local mean (four texels at the delivered
# 512), kept at half strength and clipped so dark creases cannot survive.
DETAIL_SIGMA, DETAIL_KEEP, DETAIL_CLIP = 32, .5, (-10., 6.)
# Every chart-gutter texel whose nearest covered texel was lifted copies it: the
# duck is a few dozen pixels on screen, so its low mips average whole gutters in.


def sha(data):
    return hashlib.sha256(data).hexdigest()


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def lift_plumage(image, positions, normals, uv, faces):
    """The plumage texels of image toward PLUMAGE_WHITE; returns (result, report)."""
    height, width = image.shape[:2]
    rows, cols, attrs = _texels(uv, faces, np.hstack([positions, normals]).astype(np.float64), width, height)
    up = attrs[:, 4] / np.maximum(np.linalg.norm(attrs[:, 3:], axis=1), 1e-9)
    # y is height in glTF; the leg and foot geometry sits below .2.
    texel_weight = (LIFT_FLOOR + (1 - LIFT_FLOOR) * smoothstep(-.35, .55, up)) * smoothstep(.18, .26, attrs[:, 1])
    rgb = image.astype(np.int16)
    corners_y = positions[faces][:, :, 1]

    def drawn(selected):
        canvas = Image.new('1', (width, height))
        draw = ImageDraw.Draw(canvas)
        for triangle in uv[faces[selected]]:
            draw.polygon([(float(u * width), float(v * height)) for u, v in triangle], fill=1)
        return np.asarray(canvas).astype(bool)

    # Orange is kept only on the head (bill) and leg (feet) charts; a stray
    # orange texel left on the back by the first stage is plumage and is lifted.
    orange = (rgb[:, :, 0] - rgb[:, :, 2] > 80) & (rgb[:, :, 0] > 150)
    bill_or_feet = drawn((corners_y > .66).any(axis=1) | (corners_y < .3).any(axis=1))
    keep = (orange & binary_dilation(bill_or_feet, iterations=2)) | (rgb.mean(axis=2) < 100)
    protected = binary_dilation(keep | drawn((corners_y < .2).all(axis=1)), iterations=4)
    cover = np.zeros((height, width), bool)
    cover[rows, cols] = True
    weight = np.zeros((height, width), np.float32)
    weight[rows, cols] = texel_weight
    weight[protected] = 0
    source = image.astype(np.float32)
    coverage = cover.astype(np.float32)
    mean = gaussian_filter(source * coverage[:, :, None], (DETAIL_SIGMA, DETAIL_SIGMA, 0))
    mean /= np.maximum(gaussian_filter(coverage, DETAIL_SIGMA), 1e-6)[:, :, None]
    detail = np.clip((source - mean).mean(axis=2), *DETAIL_CLIP)
    target = PLUMAGE_WHITE + DETAIL_KEEP * detail[:, :, None]
    lifted = weight > 0
    result = image.copy()
    result[lifted] = np.clip(np.rint(source + weight[:, :, None] * (target - source)), 0, 255).astype(np.uint8)[lifted]
    near_r, near_c = distance_transform_edt(~cover, return_distances=False, return_indices=True)
    gutter = ~cover & ~protected & lifted[near_r, near_c]
    result[gutter] = result[near_r[gutter], near_c[gutter]]
    changed = np.any(result != image, axis=2)
    assert not np.any(changed & protected), 'Plumage lift reaches bill, feet or eyes'
    assert not np.any(changed & ~lifted & ~gutter), 'Plumage lift changed an unweighted texel'
    upper = lifted & (weight > .9)
    report = {'liftedTexels': int(lifted.sum()), 'gutterTexels': int(gutter.sum()), 'changedTexels': int(changed.sum()),
              'protectedTexels': int(protected.sum()), 'target': PLUMAGE_WHITE.tolist(), 'floor': LIFT_FLOOR,
              'upperMeanBefore': image[upper].mean(axis=0).round(1).tolist(), 'upperMeanAfter': result[upper].mean(axis=0).round(1).tolist(),
              'upperLumStdBefore': round(float(image[upper].mean(axis=1).std()), 2),
              'upperLumStdAfter': round(float(result[upper].mean(axis=1).std()), 2)}
    return result, report


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
    normals = accessor(blob, doc, base, prim['attributes']['NORMAL'])[0]
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
    # Since the torso rebuild (refine_creature_assets.py DUCK_TORSO, asset loop
    # round 3) the dorsal faces sample a painted plumage square, so the orange
    # patch is no longer drawn by any face and this first stage finds nothing.
    assert neutral.any()
    distance, nearest = distance_transform_edt(~neutral, return_indices=True)
    donor = float(distance[mask].max()) if mask.any() else 0.
    assert donor < 200, 'No nearby plumage donor; needs review'
    after = pixels.copy()
    after[mask] = pixels[nearest[0][mask], nearest[1][mask]]
    assert np.array_equal(after[~mask], pixels[~mask])
    assert not np.any(mask & protected), 'Correction reaches non-dorsal UVs'
    after, plumage = lift_plumage(after, positions, normals, uv, faces)
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
    report = {'cause': 'Embedded albedo paints orange on the dorsal folded-wing region; geometry/UVs unchanged.', 'sourceSHA256': sha(blob), 'targetSHA256': sha(result), 'dorsalTriangles': int(dorsal_faces.sum()), 'changedTexels': int(np.any(after != pixels, axis=2).sum()), 'maskTexels': int(mask.sum()), 'untouchedTexelsExactOutsideOrangeMaskBeforeLift': True, 'protectedTriangleOverlap': 0, 'maximumDonorDistanceTexels': donor, 'plumageLift': plumage, 'allAccessorsExact': True, 'unchangedJSONStructures': ['accessors', 'meshes', 'skins', 'nodes', 'animations', 'materials', 'textures', 'samplers'], 'bufferViews': payload_checks, 'beforeBytes': len(blob), 'afterBytes': len(result), 'caveat': 'Prepared source only; delivery normalization, provenance and runtime render verification belong to root.'}
    (out / 'correction-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'bufferViews'}, indent=2))


if __name__ == '__main__':
    main()
