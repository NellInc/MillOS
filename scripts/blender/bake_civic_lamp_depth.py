"""Bake fixed civic lamp visibility from exported actual runtime triangles.

No receiver UVs, albedo, normals, GLBs or topology are changed. Rigid opaque
casters only; exporter excludes people, vehicles and alpha-tested/windy crowns.
Working if a blocked radial ray stores the actual first intersection and clear
rays store the finite source cutoff, with a custody hash for every input byte.
"""
import argparse
import hashlib
import json
import pathlib
import struct
import sys
import time
import zlib

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

p = argparse.ArgumentParser()
p.add_argument('--input', required=True)
p.add_argument('--output', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = pathlib.Path(a.input)
output = pathlib.Path(a.output)
data = json.loads(source.read_text())
size = data['faceSize']
width, height = data['atlasSize']
if 6 * size > width or len(data['sources']) * size > height:
    raise RuntimeError('Civic depth atlas capacity exceeded')
points = data['vertices']
indices = data['triangles']
vertices = [tuple(points[i:i+3]) for i in range(0, len(points), 3)]
faces = [tuple(indices[i:i+3]) for i in range(0, len(indices), 3)]
if not faces or not all(np.isfinite(points)):
    raise RuntimeError('Actual assembly contains no finite rigid caster triangles')
bvh = BVHTree.FromPolygons(vertices, faces, all_triangles=True)
pixels = np.full((height, width, 4), 255, dtype=np.uint8)
lookup = data['sourceLookup']
ox, oy = lookup['origin']
rows = (lookup['slots'] + lookup['width'] - 1) // lookup['width']
if ox < 6 * size or ox + lookup['width'] > width or oy < 0 or oy + rows > height:
    raise RuntimeError('Civic source lookup overlaps depth faces or exceeds atlas')
pixels[oy:oy+rows, ox:ox+lookup['width']] = (0, 0, 0, 255)
occupied = set()
for row, light in enumerate(data['sources']):
    slot = sum(int(np.floor(v * lookup['quantization'] + lookup['bias'])) * lookup['coefficients'][axis]
               for axis, v in enumerate(light['position'])) % lookup['slots']
    if slot in occupied or row >= 255:
        raise RuntimeError('Civic source lookup collision or row encoding overflow')
    occupied.add(slot)
    pixels[oy + slot // lookup['width'], ox + slot % lookup['width']] = (row+1, 0, 0, 255)
start = time.time()
receipts = []
for row, light in enumerate(data['sources']):
    origin = Vector(light['position'])
    far = light['distance']
    blocked = 0
    for face in range(6):
        for y in range(size):
            v = 2 * (y + .5) / size - 1
            for x in range(size):
                u = 2 * (x + .5) / size - 1
                normal, horizontal, vertical = data['faceBases'][face]
                direction = (Vector(normal) + u * Vector(horizontal) + v * Vector(vertical)).normalized()
                # Ignore only the emitter aperture's sub-centimetre skin.
                hit = bvh.ray_cast(origin + direction * .015, direction, far)
                distance = min(far, hit[3] + .015) if hit[0] is not None else far
                blocked += distance < far
                encoded = int(round(distance / far * 65535))
                pixels[row * size + y, face * size + x] = (encoded >> 8, encoded & 255, 0, 255)
    if blocked == 6 * size * size:
        raise RuntimeError(f"Civic emitter {light['id']} is fully enclosed; correct actual seating before enabling this bake")
    receipts.append({'id': light['id'], 'blockedRays': blocked, 'rays': 6 * size * size})
    print(f"{row + 1}/{len(data['sources'])} {light['id']}: {blocked} blocked rays", flush=True)

def chunk(kind, payload):
    return struct.pack('!I', len(payload)) + kind + payload + struct.pack('!I', zlib.crc32(kind + payload) & 0xffffffff)

raw = b''.join(b'\0' + row.tobytes() for row in pixels)
encoded = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(encoded)
metadata = {k: data[k] for k in ['convention', 'faceBases', 'sourceLookup', 'faceSize', 'atlasSize', 'sources', 'objects', 'exclusions', 'dynamicLocalShadows']}
metadata.update(inputSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                atlasSha256=hashlib.sha256(encoded).hexdigest(),
                bakerSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
                vertices=len(vertices), triangles=len(faces), elapsedSeconds=round(time.time()-start, 2),
                sourceReceipts=receipts)
output.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f"Baked {len(data['sources'])} sources, {len(faces)} rigid triangles, {len(encoded)} bytes", flush=True)
