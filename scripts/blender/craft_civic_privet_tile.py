"""Deterministic opaque privet albedo, authored locally at metre-correct leaf scale.

No scene, mesh, material, animation or external asset is read or modified.
Working if wrapped leaves remain seamless, every pixel is opaque, the neutral
soil sampling patch is exact and repeated runs produce identical PNG bytes.
"""
import argparse
import hashlib
import json
import pathlib
import struct
import sys
import zlib

import numpy as np

p = argparse.ArgumentParser()
p.add_argument('--output', required=True)
p.add_argument('--receipt', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
size, metres, seed = 512, 0.72, 20261026
rng = np.random.default_rng(seed)
yy, xx = np.mgrid[:size, :size]
base = 2.0 * np.sin(xx * np.pi * 12 / size) * np.cos(yy * np.pi * 10 / size)
pixels = np.empty((size, size, 3), dtype=np.float64)
pixels[:] = np.array([33, 48, 29]) + base[..., None]
palette = np.array([[72, 97, 48], [83, 107, 53], [91, 116, 57], [100, 124, 63], [113, 137, 73]])
for leaf in range(740):
    cx, cy = rng.uniform(0, size, 2)
    length = rng.uniform(0.038, 0.078) / metres * size
    width = length * rng.uniform(0.34, 0.46)
    angle = rng.uniform(0, np.pi * 2)
    cosine, sine = np.cos(angle), np.sin(angle)
    colour = palette[rng.integers(0, len(palette))] * rng.uniform(0.93, 1.05)
    radius = int(np.ceil(length / 2 + 5))
    for ox in [-size, 0, size]:
        for oy in [-size, 0, size]:
            x0, x1 = max(0, int(cx + ox) - radius), min(size, int(cx + ox) + radius + 1)
            y0, y1 = max(0, int(cy + oy) - radius), min(size, int(cy + oy) + radius + 1)
            if x0 >= x1 or y0 >= y1:
                continue
            y, x = np.mgrid[y0:y1, x0:x1]
            dx, dy = x - cx - ox, y - cy - oy
            u, v = dx * cosine + dy * sine, -dx * sine + dy * cosine
            # Pointed oval leaf, a curved midrib and restrained pigment veins.
            curve = 0.045 * length * (1 - (u / (length / 2)) ** 2)
            edge = width / 2 * np.maximum(0, 1 - (u / (length / 2)) ** 2) ** 0.7
            coverage = np.clip(edge - np.abs(v - curve) + 0.5, 0, 1)
            coverage *= np.clip(length / 2 - np.abs(u) + 0.5, 0, 1)
            midrib = np.exp(-((v - curve) / 0.65) ** 2)
            veins = np.exp(-((np.sin(u * 0.35 + np.abs(v - curve) * 0.65)) / 0.16) ** 2)
            value = 0.91 + 0.08 * (1 - np.minimum(1, np.abs(v - curve) / np.maximum(edge, 0.1)))
            paint = colour[None, None, :] * value[..., None] + (midrib * 9 + veins * 2)[..., None]
            area = pixels[y0:y1, x0:x1]
            area[:] = area * (1 - coverage[..., None]) + paint * coverage[..., None]
# Constant UVs on the retained soil select this ordinary green texel. The
# owning geometry compensates its tint, so the original soil albedo is exact.
pixels[124:133, 124:133] = [128, 154, 89]
rgba = np.concatenate([np.clip(pixels, 0, 255).astype(np.uint8), np.full((size, size, 1), 255, dtype=np.uint8)], axis=2)
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
raw = b''.join(b'\0' + row.tobytes() for row in rgba)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'sRGB', b'\0') + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
output = pathlib.Path(a.output)
output.parent.mkdir(parents=True, exist_ok=True)
if output.exists() and output.read_bytes() != png:
    raise RuntimeError('Refuse to overwrite different existing texture bytes')
output.write_bytes(png)
receipt = dict(seed=seed, size=[size, size], tileMetres=metres, leaves=740, leafLengthMetres=[0.038, 0.078], alpha=[int(rgba[..., 3].min()), int(rgba[..., 3].max())], soilSampleUV=[0.25, 0.75], soilSampleSRGB=[128,154,89], sha256=hashlib.sha256(png).hexdigest(), bytes=len(png), generatorSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest())
pathlib.Path(a.receipt).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
