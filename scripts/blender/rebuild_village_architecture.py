"""Author the village architecture and traditional canal narrowboat.

No provider geometry is imported. Original GLBs remain reference/provenance only.
One mesh, one padded atlas and opaque front-face-culling material per delivery.
Working if delivery tests find planar walls, closed roofs, grounded thresholds,
reference-led envelopes, and fewer vertices than the existing asset ceilings.
"""
import argparse
import hashlib
import json
import math
import pathlib
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('--only')
p.add_argument('--report', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
REPORT = ROOT / a.report
REPORT.parent.mkdir(parents=True, exist_ok=True)
ENVELOPES = {
    'cottage': (4.619, 4.332, 5), 'shop': (6, 5.874, 5.407),
    'church': (11.24, 20.155, 13.65), 'townhall': (13.94, 18.32, 14.61),
    'pub': (9.24, 8.18, 8.54), 'school': (11.24, 12.83, 8.44),
    'canal-boat': (2.709, 3.39, 12.95),
    'forge': (4.715, 5.679, 7),
}
PALETTE = {
    'plaster': ('d8cfb7', .87), 'stone': ('aaa69b', .9),
    'brick': ('9c6650', .87), 'slate': ('4c606c', .78),
    'tile': ('8b5142', .8), 'thatch': ('9d854f', .92),
    'oak': ('8f6b45', .8), 'timber': ('514337', .86),
    'cream': ('e4d9bd', .7), 'green': ('476454', .68),
    'glass': ('4c6b75', .3), 'amber': ('bc965b', .4),
    'brass': ('ad8b46', .4), 'iron': ('354043', .65),
    'ink': ('202e32', .9), 'rose': ('bd8580', .8),
}
KEYS = list(PALETTE)
VERTS, FACES, UVS, PARTS = [], [], [], []


def atlas():
    size, tile = 1024, 256
    pixels = np.ones((size, size, 4), dtype=np.float32)
    rough = np.ones_like(pixels)
    yy, xx = np.mgrid[0:tile, 0:tile]
    for i, (key, (colour, r)) in enumerate(PALETTE.items()):
        rgb = np.array([int(colour[k:k + 2], 16) / 255 for k in (0, 2, 4)])
        # Deterministic restrained variation, no baked directional shading.
        noise = ((xx * 13 + yy * 29 + xx * yy) % 11 - 5) / 1400
        value = noise + .012 * np.sin(xx / 33) * np.cos(yy / 47)
        if key in ('brick', 'stone'):
            course = 12 if key == 'brick' else 28
            offset = ((yy // course) % 2) * 16
            mortar = (yy % course < 1.2) | ((xx + offset) % (32 if key == 'brick' else 48) < 1.4)
            value = np.where(mortar, -.065, value)
        if key in ('oak', 'timber', 'thatch'):
            value += .025 * np.sin(xx / 6 + np.sin(yy / 63))
        if key in ('slate', 'tile'):
            value += .016 * np.sin(xx / 13) * np.cos(yy / 11)
        y, x = (i // 4) * tile, (i % 4) * tile
        pixels[y:y + tile, x:x + tile, :3] = np.clip(rgb + value[..., None], 0, 1)
        rough[y:y + tile, x:x + tile, :3] = r
    mat = bpy.data.materials.new('Authored village mineral and joinery atlas')
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 0
    for label, data, colourspace in [('albedo', pixels, 'sRGB'), ('roughness', rough, 'Non-Color')]:
        image = bpy.data.images.new('Village ' + label, width=size, height=size, alpha=True)
        image.colorspace_settings.name = colourspace
        image.pixels.foreach_set(data.ravel())
        image.filepath_raw = str(REPORT.parent / ('village-' + label + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color' if label == 'albedo' else 'Roughness'])
    return mat


def solid(name, points, faces, key):
    start = len(VERTS)
    # Inputs use the game's Y-up coordinates; Blender exports Z-up to Y-up.
    VERTS.extend((x, -z, y) for x, y, z in points)
    tile = KEYS.index(key)
    for face in faces:
        FACES.append(tuple(start + n for n in face))
        vertices = [points[n] for n in face]
        spans = [max(v[k] for v in vertices) - min(v[k] for v in vertices) for k in range(3)]
        axes = sorted(range(3), key=lambda k: spans[k], reverse=True)[:2]
        if 1 in axes:
            axes = [k for k in axes if k != 1] + [1]
        lows = [min(v[k] for v in vertices) for k in axes]
        UVS.append([((tile % 4 + .03 + .94 * (v[axes[0]] - lows[0]) / max(spans[axes[0]], 1e-8)) / 4,
                     (tile // 4 + .03 + .94 * (v[axes[1]] - lows[1]) / max(spans[axes[1]], 1e-8)) / 4) for v in vertices])
    PARTS.append({'name': name, 'key': key, 'firstVertex': start, 'vertexCount': len(points),
                  'bounds': [[min(v[k] for v in points) for k in range(3)],
                             [max(v[k] for v in points) for k in range(3)]]})


CUBE_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def box(name, c, d, key='plaster', yaw=0):
    x, y, z = c
    dx, dy, dz = [v / 2 for v in d]
    points = []
    for i, j, k in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                    (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]:
        u, v = i * dx, k * dz
        points.append((x + u * math.cos(yaw) + v * math.sin(yaw), y + j * dy,
                       z - u * math.sin(yaw) + v * math.cos(yaw)))
    solid(name, points, CUBE_FACES, key)


def beam(name, p, q, width, key='timber'):
    p, q = Vector(p), Vector(q)
    direction = (q - p).normalized()
    side = direction.cross(Vector((0, 0, 1)))
    if side.length < .01:
        side = direction.cross(Vector((0, 1, 0)))
    side.normalize()
    up = direction.cross(side).normalized()
    points = [tuple(c + side * i * width / 2 + up * j * width / 2)
              for c in (p, q) for i, j in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    solid(name, points, CUBE_FACES, key)


def prism(name, outline, front, back, key):
    n = len(outline)
    points = [(x, y, z) for z in (back, front) for x, y in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    solid(name, points, faces, key)


def lathe(name, x, z, profile, key='iron', segments=16):
    points = [(x + r * math.cos(i * 2 * math.pi / segments), y,
               z + r * math.sin(i * 2 * math.pi / segments)) for r, y in profile for i in range(segments)]
    faces = [(row * segments + i, row * segments + (i + 1) % segments,
              (row + 1) * segments + (i + 1) % segments, (row + 1) * segments + i)
             for row in range(len(profile) - 1) for i in range(segments)]
    solid(name, points, faces, key)


def roof(name, x, z, width, depth, eave, ridge, key='slate', rows=6):
    for side in (-1, 1):
        for row in range(rows):
            t0, t1 = row / rows, (row + 1) / rows
            x0, x1 = x + side * width * t0 / 2, x + side * width * t1 / 2
            y0, y1 = ridge + (eave - ridge) * t0, ridge + (eave - ridge) * t1
            top = [(x0, y0, z - depth / 2), (x1, y1 + .028, z - depth / 2),
                   (x1, y1 + .028, z + depth / 2), (x0, y0, z + depth / 2)]
            solid(name + ' closed course', [(px, py - .08, pz) for px, py, pz in top] + top,
                  CUBE_FACES, key)
            # Short staggered joints break long ruler-like strips into tiles or
            # tied thatch bundles. They sit on the real slope, not on a decal.
            columns = max(4, round(depth / .72))
            for col in range(1, columns):
                zz = z - depth / 2 + (col + (row % 2) * .5) * depth / columns
                beam(name + ' staggered joint', (x0, y0 + .012, zz),
                     (x1, y1 + .037, zz), .012, 'timber' if key == 'thatch' else key)
        for end in (-1, 1):
            beam(name + ' verge', (x, ridge + .03, z + end * depth / 2),
                 (x + side * width / 2, eave + .03, z + end * depth / 2), .1, 'timber')
        box(name + ' eaves', (x + side * (width / 2 - .045), eave - .04, z), (.1, .16, depth), 'timber')
    beam(name + ' ridge cap', (x, ridge + .035, z - depth / 2),
         (x, ridge + .035, z + depth / 2), .13, key)
    for end in (-1, 1):
        prism(name + ' planar gable', [(x - width / 2 + .2, eave - .1),
              (x + width / 2 - .2, eave - .1), (x, ridge - .1)],
              z + end * (depth / 2 - .12), z + end * (depth / 2 - .24), 'plaster')


def frame(name, x, y, z, width=1, height=1.3, yaw=0, trim='cream', glass='glass', door=False):
    def part(label, u, v, w, dims, key):
        box(name + ' ' + label, (x + u * math.cos(yaw) + w * math.sin(yaw), y + v,
            z - u * math.sin(yaw) + w * math.cos(yaw)), dims, key, yaw)
    part('recess', 0, 0, 0, (width + .12, height + .12, .08), 'ink')
    part('inset', 0, 0, .046, (width - .09, height - .09, .025), 'oak' if door else glass)
    for side in (-1, 1):
        part('jamb', side * width / 2, 0, .075, (.085, height + .18, .15), trim)
        part('rail', 0, side * height / 2, .075, (width + .16, .085, .15), trim)
    part('sill', 0, -height / 2 - .065, .09, (width + .32, .12, .26), 'stone')
    if door:
        for side in (-1, 1):
            part('door stile', side * width * .25, -.03, .066, (.035, height - .2, .022), 'timber')
        part('latch', width * .3, -.06, .088, (.065, .14, .025), 'brass')
    else:
        part('mullion', 0, 0, .076, (.045, height, .04), trim)
        part('transom', 0, .09, .076, (width, .045, .04), trim)


def shell(name, width, depth, height, key='plaster', x=0, z=0):
    box(name + ' planar walls', (x, height / 2, z), (width, height, depth), key)
    box(name + ' plinth', (x, .16, z), (width + .13, .32, depth + .13), 'stone')
    box(name + ' cornice', (x, height - .07, z), (width + .18, .16, depth + .18), 'cream')


def chimney(x, z, bottom, top, width=.48):
    box('Chimney shaft', (x, (bottom + top) / 2, z), (width, top - bottom, width), 'stone')
    box('Chimney cap', (x, top - .12, z), (width + .13, .12, width + .13), 'cream')
    box('Chimney open flue', (x, top - .051, z), (width * .61, .014, width * .61), 'ink')


def arch(name, x, y, z, width, height, key='cream'):
    """A pointed lancet head, with a real extruded reveal and radial tracery."""
    outline = [(x - width / 2, y), (x - width / 2, y + height * .36),
               (x - width * .33, y + height * .72), (x, y + height),
               (x + width * .33, y + height * .72), (x + width / 2, y + height * .36),
               (x + width / 2, y)]
    prism(name + ' stained glass', outline, z + .016, z - .035, 'glass')
    for aa, bb in zip(outline[:-1], outline[1:]):
        beam(name + ' stone arch', (*aa, z + .08), (*bb, z + .08), .09, key)
    beam(name + ' lancet mullion', (x, y, z + .065), (x, y + height - .06, z + .065), .035, key)


def planting(x, z, height=.64):
    lathe('Clipped garden evergreen', x, z, [(.22, .36), (.34, .47), (.35, height), (.22, height + .17), (0, height + .22)], 'green', 9)


def cottage():
    shell('Cottage', 4.08, 4.55, 2.45)
    roof('Cottage thatch', 0, 0, 4.52, 4.9, 2.54, 4.06, 'thatch', 7)
    chimney(1.2, 0, 3.15, 4.332)
    frame('Front door', 0, 1.06, 2.295, .87, 1.87, trim='timber', door=True)
    for side in (-1, 1):
        frame('Front window', side * 1.3, 1.36, 2.295, .68, .9, trim='timber')
        frame('Rear window', side * 1.15, 1.37, -2.295, .8, 1, math.pi, 'timber')
        for z in (-1.25, 1.25):
            frame('Side window', side * 2.06, 1.36, z, .85, 1.02, side * math.pi / 2, 'timber')
        for z in (-2.23, 2.23):
            box('Corner oak', (side * 2.025, 1.28, z), (.16, 2.38, .17), 'timber')
        for shutter in (-1, 1):
            box('Cottage painted shutter', (side * 1.3 + shutter * .47, 1.36, 2.33), (.21, .94, .08), 'green')
        box('Window herb box', (side * 1.3, .73, 2.40), (.9, .19, .23), 'oak')
        for i in (-1, 0, 1):
            lathe('Window herb planting', side * 1.3 + i * .24, 2.4, [(.09, .81), (.115, .98), (0, 1.05)], 'green', 8)
    frame('Gable casement', 0, 3.08, 2.325, .56, .57, trim='timber')
    box('Threshold', (0, .08, 2.4), (1.12, .16, .4), 'stone')


def shop():
    shell('Shop', 5.48, 4.63, 3.64)
    roof('Shop tile', 0, -.08, 5.9, 5.15, 3.69, 5.77, 'tile', 8)
    frame('Shop door', -1.7, 1.18, 2.34, .86, 2.15, trim='green', door=True)
    frame('Shop display', .73, 1.53, 2.34, 2.98, 1.95, trim='green')
    box('Shop fascia board', (0, 3.15, 2.40), (5.22, .55, .13), 'green')
    for i in range(12):
        x = -2.53 + (i + .5) * 5.06 / 12
        top = [(x - .21, 2.95, 2.29), (x + .21, 2.95, 2.29),
               (x + .21, 2.73, 2.70), (x - .21, 2.73, 2.70)]
        solid('Striped canvas awning', [(px, py - .04, pz) for px, py, pz in top] + top,
              CUBE_FACES, 'cream' if i % 2 else 'green')
        box('Awning valance', (x, 2.69, 2.70), (.42, .13, .035), 'cream' if i % 2 else 'green')
    for side in (-1, 1):
        frame('Upper rear casement', side * 1.5, 2, -2.34, 1.05, 1.4, math.pi)
        frame('Side casement', side * 2.76, 1.85, 0, 1.15, 1.45, side * math.pi / 2)
    box('Shop threshold', (-1.7, .065, 2.43), (1.15, .13, .46), 'stone')


def hip_roof(name, width, depth, eave, peak, key='slate', rows=7):
    # Four closed hip slopes retain the v0.30 silhouette, with actual lap edges.
    def ring(t):
        w, d = width * (1 - t) / 2, depth * (1 - t) / 2
        y = eave + (peak - eave) * (t if key != 'thatch' else math.sin(t * math.pi / 2))
        return [(-w, y, -d), (w, y, -d), (w, y, d), (-w, y, d)]
    for row in range(rows):
        lower, upper = ring(row / rows), ring((row + 1) / rows * .995)
        for side in range(4):
            nxt = (side + 1) % 4
            top = [lower[side], lower[nxt], upper[nxt], upper[side]]
            solid(name + ' closed hipped course', [(x, y - .075, z) for x, y, z in top] + top, CUBE_FACES, key)
            beam(name + ' lapped edge', lower[side], lower[nxt], .035, key)
    for side in (-1, 1):
        box(name + ' eaves fascia', (0, eave - .085, side * depth / 2), (width, .17, .14), 'timber')
        box(name + ' eaves fascia', (side * width / 2, eave - .085, 0), (.14, .17, depth), 'timber')
        for end in (-1, 1):
            if key != 'thatch':
                beam(name + ' diagonal hip capping', (side * width / 2, eave + .02, end * depth / 2), (0, peak + .02, 0), .075, key)


def rotate_parts(start, yaw, centre=(0, 0, 0)):
    cx, cy, cz = centre
    for i in range(start, len(VERTS)):
        x, nz, y = VERTS[i]
        u, v = x - cx, -nz - cz
        VERTS[i] = (cx + u * math.cos(yaw) + v * math.sin(yaw),
                    -(cz - u * math.sin(yaw) + v * math.cos(yaw)), y)


def roundel(name, x, y, z, radius, key, yaw=0, segments=32):
    start = len(VERTS)
    outline = [(x + radius * math.cos(i * 2 * math.pi / segments), y + radius * math.sin(i * 2 * math.pi / segments)) for i in range(segments)]
    prism(name, outline, z + .035, z, key)
    if yaw:
        rotate_parts(start, yaw, (x, y, z))


def ring_frame(name, x, y, z, radius, thickness, key='cream', yaw=0, segments=32):
    start = len(VERTS)
    points = [(x + r * math.cos(i * math.tau / segments), y + r * math.sin(i * math.tau / segments), zz)
              for zz in (z - thickness / 2, z + thickness / 2)
              for r in (radius - thickness / 2, radius + thickness / 2) for i in range(segments)]
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces += [(i,j,segments+j,segments+i),
                  (2*segments+i,3*segments+i,3*segments+j,2*segments+j),
                  (i,2*segments+i,2*segments+j,j),
                  (segments+i,segments+j,3*segments+j,3*segments+i)]
    solid(name, points, faces, key)
    if yaw:
        rotate_parts(start, yaw, (x, y, z))


def quoins(name, width, depth, height, key='cream'):
    for x in (-width / 2, width / 2):
        for z in (-depth / 2, depth / 2):
            for row in range(int(height / .62)):
                box(name + ' dressed corner block', (x, .54 + row * .62, z),
                    (.42 if row % 2 else .62, .30, .62 if row % 2 else .42), key)


def church():
    # Reference: preserved v0.30 VillageArea, nave 10x8x12, rear tower, rose facade.
    shell('V030 stone nave', 10, 12, 8, 'stone')
    hip_roof('Nave blue slate', 11.1, 13.4, 8.09, 11.9, rows=8)
    quoins('Nave', 10.02, 12.02, 7.8)
    shell('Rear bell tower', 4, 4.2, 13.05, 'stone', z=-4.7)
    for y, width in [(8.3, 4.2), (10.1, 4.25), (13.02, 4.5)]:
        box('Tower ashlar stringcourse', (0, y, -4.7), (width, .18, width), 'cream')
    # Eight-sided broach base and a slender point rather than a toy cone.
    lathe('Church octagonal spire', 0, -4.7, [(2.55, 13.12), (2.15, 13.48), (1.35, 15.65), (.62, 17.61), (.14, 18.86), (0, 19.05)], 'slate', 16)
    for i in range(8):
        a = i * math.pi / 4
        beam('Spire raised rib', (2.12 * math.cos(a), 13.5, -4.7 + 2.12 * math.sin(a)), (.12 * math.cos(a), 18.86, -4.7 + .12 * math.sin(a)), .025, 'iron')
    beam('Church gilt cross stem', (0, 18.94, -4.7), (0, 20.1, -4.7), .11, 'brass')
    beam('Church gilt cross arms', (-.40, 19.7, -4.7), (.40, 19.7, -4.7), .11, 'brass')
    for side in (-1, 1):
        for z in (-3, 0, 3):
            start = len(VERTS)
            arch('Stone lancet', side * 5.025, 2.7, z, 1.4, 3.2)
            rotate_parts(start, side * math.pi / 2, (side * 5.025, 0, z))
        for z in (-4.5, -1.5, 1.5, 4.5):
            box('Nave buttress plinth', (side * 5.11, .3, z), (.72, .6, .66), 'stone')
            box('Nave stepped buttress', (side * 5.1, 2.36, z), (.46, 4.15, .43), 'stone')
            box('Buttress weathered cap', (side * 5.1, 4.48, z), (.58, .15, .54), 'cream')
        for axis in ('front', 'side'):
            start = len(VERTS)
            frame('Belfry louvres', 0, 11.82, -4.7 + side * 2.14, 1.5, 1.78, 0 if side == 1 else math.pi, 'cream', 'ink')
            for y in (11.2, 11.46, 11.72, 11.98, 12.24, 12.5):
                box('Bell louvre blade', (0, y, -4.7 + side * 2.22), (1.32, .075, .14), 'timber')
            if axis == 'side':
                rotate_parts(start, math.pi / 2, (0, 0, -4.7))
    frame('Church oak portal', 0, 1.92, 6.035, 2.0, 3.55, trim='cream', door=True)
    arch('Portal archivolt', 0, 3.64, 6.04, 2.1, 1.1)
    # Colour is contained inside the stone tracery, with no luminous masonry.
    roundel('Rose stone surround', 0, 6.12, 6.05, 1.43, 'cream')
    roundel('Rose dark reveal', 0, 6.12, 6.10, 1.27, 'ink')
    for i in range(12):
        a, b = i * math.tau / 12, (i + 1) * math.tau / 12
        outline = [(0, 6.12)] + [(1.2 * math.cos(t), 6.12 + 1.2 * math.sin(t)) for t in (a, (a+b)/2, b)]
        prism('Rose stained glass petal', outline, 6.16, 6.14, ('glass','amber','rose','green')[i % 4])
        beam('Rose radial tracery', (0, 6.12, 6.19), (1.23 * math.cos(a), 6.12 + 1.23 * math.sin(a), 6.19), .047, 'brass')
    ring_frame('Rose outer tracery', 0, 6.12, 6.21, 1.25, .055, 'brass')
    ring_frame('Rose inner tracery', 0, 6.12, 6.22, .55, .047, 'brass', segments=24)
    roundel('Rose central medallion', 0, 6.12, 6.22, .23, 'amber', segments=20)
    box('Church accessible threshold', (0, .065, 6.36), (2.55, .13, .66), 'stone')


def townhall():
    # The broad cream civic hall and centred clock tower are the v0.30 anchors.
    shell('V030 civic hall', 12, 10, 7, 'plaster')
    quoins('Civic hall', 12.02, 10.02, 6.8)
    hip_roof('Civic hipped slate', 13.8, 12, 7.1, 10.85, rows=8)
    for side in (-1, 1):
        for x in (-4.3, 4.3):
            frame('Tall civic sash', x, 3.35, side * 5.04, 1.65, 3.08, 0 if side == 1 else math.pi)
            box('Window cornice', (x, 5.12, side * 5.1), (2.1, .16, .32), 'cream')
        for z in (-3.2, 0, 3.2):
            frame('Civic side sash', side * 6.035, 3.35, z, 1.65, 3.08, side * math.pi / 2)
        for x in (-3.82, 3.82):
            box('Civic stringcourse clear of door', (x, 1.15, side * 5.055), (4.46, .14, .16), 'cream')
        # Grounded solid treads. Rear entrance balances the bounds and affords egress.
        for i in range(5):
            top = (i + 1) * .16
            box('Civic ascending stair', (0, top / 2, side * (6.92 - i * .36)), (5.7 - i * .15, top, .77), 'stone')
        frame('Civic oak double door', 0, 2.55, side * 5.04, 2.6, 3.5, 0 if side == 1 else math.pi, 'cream', door=True)
        for x in (-2.6, 2.6):
            lathe('Civic turned column', x, side * 5.62, [(.40,.80),(.40,.98),(.30,1.1),(.25,4.05),(.36,4.17),(.40,4.27)], 'cream', 20)
        box('Portico entablature', (0, 4.40, side * 5.60), (5.92, .32, .98), 'cream')
        prism('Portico pediment', [(-3,4.58),(3,4.58),(0,5.47)], side * 6.10, side * 5.3, 'cream')
        for x in (-1,1):
            beam('Pediment moulding', (x*3,4.62,side*6.13), (0,5.5,side*6.13), .095, 'stone')
    box('Civic clock tower', (0, 11.13, 0), (4, 5.74, 4), 'plaster')
    for x in (-1.95,1.95):
        for z in (-1.95,1.95):
            box('Tower pilaster', (x,11.77,z), (.24,4.25,.24), 'cream')
    for y in (10.15,13.85,14.08):
        box('Tower moulded cornice', (0,y,0), (4.5,.17,4.5), 'cream')
    for side in (-1,1):
        for yaw in (0,math.pi/2):
            start=len(VERTS)
            roundel('Clock gilt bezel',0,12.08,side*2.06,1.13,'brass')
            roundel('Clock enamel dial',0,12.08,side*2.11,1.015,'cream')
            for i in range(12):
                a=i*math.pi/6
                beam('Clock hour index',(.82*math.sin(a),12.08+.82*math.cos(a),side*2.17),(.93*math.sin(a),12.08+.93*math.cos(a),side*2.17),.045,'ink')
            beam('Clock hour hand',(0,12.08,side*2.19),(side*.44,12.34,side*2.19),.075,'ink')
            beam('Clock minute hand',(0,12.08,side*2.20),(0,12.89,side*2.20),.05,'ink')
            if yaw:rotate_parts(start,yaw)
    lathe('Civic curving ogee cupola',0,0,[(2.7,14.18),(2.72,14.27),(2.35,14.42),(2.12,14.7),(1.94,15.03),(1.65,15.36),(1.25,15.69),(.81,16.07),(.48,16.4),(.37,16.72),(.51,16.79),(.51,17.15),(.58,17.22),(.32,17.5),(.10,17.78),(0,17.89)],'slate',32)
    lathe('Civic gilt finial',0,0,[(.07,17.76),(.16,17.97),(.07,18.13),(0,18.32)],'brass',16)


def pub():
    shell('V030 Flour and Barrel',8,6,5)
    hip_roof('Rounded hipped thatch',9.1,8.4,5.09,7.91,'thatch',9)
    chimney(3,0,5.5,8.18,.74)
    for side in (-1,1):
        for x in (-3.77,-1.2,1.2,3.77):
            box('Pub pegged upright',(x,2.6,side*3.04),(.20,4.75,.18),'timber')
        for y in (.49,3.1,4.87):
            if y < 1:
                for x in (-2.45,2.45): box('Pub sill rail clear of door',(x,y,side*3.05),(3.1,.20,.20),'timber')
            else:
                box('Pub oak rail',(0,y,side*3.05),(8,.20,.20),'timber')
        for x in (-2.5,2.5):
            frame('Pub leaded window',x,1.97,side*3.06,1.48,1.64,0 if side==1 else math.pi,'timber','amber')
            frame('Pub upper casement',x,3.91,side*3.06,1.1,1.05,0 if side==1 else math.pi,'timber','amber')
            beam('Pub upper wind brace',(x-.85,3.26,side*3.07),(x-.3,4.7,side*3.07),.12)
        for z in (-1.7,1.7):
            frame('Pub side casement',side*4.04,2.03,z,1.16,1.7,side*math.pi/2,'timber','amber')
        frame('Pub oak entry',0,1.32,side*3.07,1.48,2.43,0 if side==1 else math.pi,'timber',door=True)
        box('Pub threshold',(0,.07,side*3.29),(1.86,.14,.60),'stone')
    for side in (-1,1):
        box('Pub lantern bracket',(side*.98,2.68,3.15),(.06,.38,.36),'iron')
        box('Pub lantern housing',(side*.98,2.62,3.33),(.24,.39,.23),'iron')
        box('Pub lantern glass',(side*.98,2.62,3.454),(.15,.28,.019),'amber')


def school():
    shell('V030 cream schoolhouse',10,7,6,'plaster')
    quoins('Schoolhouse',10.02,7.02,5.8)
    hip_roof('School hipped slate',11.1,8.3,6.10,9.03,rows=7)
    for side in (-1,1):
        for x in (-3.7,-1.75,1.75,3.7):
            frame('School tall sash',x,3.22,side*3.54,1.13,2.22,0 if side==1 else math.pi)
        for z in (-1.9,1.9):
            frame('Classroom side sash',side*5.035,3.2,z,1.35,2.8,side*math.pi/2)
        frame('School oak door',0,1.46,side*3.55,1.39,2.69,0 if side==1 else math.pi,'cream',door=True)
        box('School accessible threshold',(0,.07,side*3.78),(1.89,.14,.63),'stone')
        for x in (-2.93,2.93):
            box('School sill course clear of door',(x,1.74,side*3.55),(4.05,.12,.15),'cream')
    box('Open belfry base',(0,8.88,0),(2.25,.19,2.25),'cream')
    for x in (-.85,.85):
        for z in (-.85,.85):
            box('Open belfry turned post',(x,9.75,z),(.21,1.69,.21),'cream')
            box('Belfry post capital',(x,10.57,z),(.32,.15,.32),'cream')
    box('Belfry crown',(0,10.75,0),(2.3,.23,2.3),'cream')
    beam('Bell oak yoke',(-.75,10.38,0),(.75,10.38,0),.16,'timber')
    lathe('School open bronze bell',0,0,[(.51,9.46),(.60,9.5),(.60,9.59),(.49,9.66),(.36,9.86),(.27,10.17),(.15,10.33),(.04,10.33)],'brass',28)
    beam('Bell clapper',(0,9.43,0),(0,9.97,0),.055,'iron')
    lathe('Bell clapper ball',0,0,[(0,9.36),(.1,9.43),(0,9.5)],'iron',12)
    lathe('School swept bell cap',0,0,[(1.6,10.90),(1.56,11.0),(1.22,11.14),(.94,11.38),(.71,11.67),(.48,11.98),(.27,12.28),(.07,12.55),(0,12.63)],'slate',24)
    lathe('Belfry gilt finial',0,0,[(.035,12.5),(.1,12.65),(0,12.83)],'brass',12)


def canal_boat():
    # Metre-authored hull: keel y=0, waterline=.6, no provider triangles retained.
    stations=[(-6.475,.10),(-6.18,.73),(-5.7,1.10),(-4.9,1.27),(-3.8,1.31),(3.8,1.31),(4.65,1.19),(5.4,.86),(6.04,.44),(6.475,.055)]
    points=[]
    for z,w in stations:
        points += [(-w*.77,0,z*.96),(w*.77,0,z*.96),(w,.98+.17*(abs(z)/6.475)**3,z),(-w,.98+.17*(abs(z)/6.475)**3,z)]
    faces=[]
    for row in range(len(stations)-1):
        for k in range(4): faces.append((row*4+k,row*4+(k+1)%4,(row+1)*4+(k+1)%4,(row+1)*4+k))
    faces += [(3,2,1,0),tuple(range((len(stations)-1)*4,len(stations)*4))]
    solid('Fair tapered narrowboat hull',points,faces,'slate')
    for side in (-1,1):
        for y,width,key in [(.24,.065,'iron'),(.69,.065,'iron'),(.94,.035,'brass')]:
            for (za,wa),(zb,wb) in zip(stations[:-1],stations[1:]):
                def rail(z, w):
                    fraction = y / (.98 + .17 * (abs(z) / 6.475) ** 3)
                    return (side * (w * (.77 + .23 * fraction) + .012), y, z * (.96 + .04 * fraction))
                beam('Continuous rubbing strake',rail(za,wa),rail(zb,wb),width,key)
    for z0,z1 in [(-5.66,-4.03),(3.61,5.03)]:
        for x in range(-5,6):
            box('Teak well deck plank',(x*.19,1.12,(z0+z1)/2),(.176,.065,z1-z0),'oak')
    box('Cabin coachwork',(0,1.83,-.28),(2.10,1.42,7.36),'brick')
    for side in (-1,1):
        for y in (1.22,2.40):
            box('Cabin cream coachline',(side*1.061,y,-.28),(.025,.033,7.29),'cream')
        for z in (-2.8,-1.2,.4,2.0):
            roundel('Porthole brass flange',side*1.074,2.03,z,.257,'brass',side*math.pi/2,24)
            roundel('Recessed porthole glazing',side*1.12,2.03,z,.205,'glass',side*math.pi/2,24)
            ring_frame('Porthole raised rim',side*1.17,2.03,z,.225,.027,'brass',side*math.pi/2,20)
        for z in (-3.60,2.84):
            box('Cabin recessed painted panel',(side*1.072,1.81,z),(.022,.74,.60),'green')
    # Continuous barrel-cambered roof, sealed at its ends and underneath.
    roof_pts=[]
    for z in (-4.08,3.56):
        for i in range(13):
            x=-1.17+i*2.34/12
            roof_pts.append((x,2.57+.20*(1-(x/1.17)**2),z))
        for i in range(12,-1,-1):
            x=-1.17+i*2.34/12
            roof_pts.append((x,2.50+.20*(1-(x/1.17)**2),z))
    n=26
    solid('Sealed cambered cabin roof',roof_pts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],'cream')
    for z,yaw in [(-3.97,math.pi),(3.43,0)]:
        frame('Cabin glazed doors',0,1.83,z,1.13,1.22,yaw,'oak',door=True)
        for x in (-.29,.29):
            frame('Door upper pane',x,2.1,z+(.095 if yaw==0 else -.095),.33,.43,yaw,'oak')
    for z in (-2.7,-.4,1.9):
        lathe('Mushroom brass roof vent',0,z,[(.10,2.76),(.10,2.84),(.23,2.87),(.23,2.91),(.10,3.01),(0,3.03)],'brass',16)
    lathe('Black stove chimney',-.63,-2.0,[(.11,2.72),(.11,3.25),(.19,3.27),(.19,3.34),(0,3.39)],'iron',20)
    box('Roof timber storage locker',(.44,2.87,.55),(.72,.28,1.23),'green')
    for z in (.03,1.07): box('Locker brass strap',(.44,3.017,z),(.74,.014,.037),'brass')
    for side in (-1,1):
        beam('Roof grab rail',(side*1.0,2.78,-3.65),(side*1.0,2.78,3.18),.032,'brass')
        for z in (-5.26,-4.4): beam('Stern guard stanchion',(side*1.1,1.12,z),(side*1.1,1.82,z),.034,'iron')
        beam('Stern guard rail',(side*1.1,1.82,-5.26),(side*1.1,1.82,-4.4),.042,'brass')
    beam('Tiller rudder stock',(0,1.10,-5.38),(0,1.69,-5.38),.065,'iron')
    beam('Swan neck tiller',(0,1.69,-5.38),(.3,1.94,-4.94),.054,'brass')
    beam('Tiller oak handgrip',(.3,1.94,-4.94),(.3,1.94,-4.35),.075,'oak')
    for z in (-5.9,5.86):
        for side in (-1,1):
            lathe('Mooring bollard',side*.29,z,[(.09,1.12),(.09,1.36),(.13,1.39),(.13,1.44)],'iron',12)
    # A genuine continuous rope spiral, laid onto the bow deck.
    prev=None
    for i in range(97):
        a=i*math.tau/24;r=.14+.26*i/96
        p=(r*math.cos(a),1.195,4.77+r*math.sin(a))
        if prev:beam('Bow coiled rope',prev,p,.025,'thatch')
        prev=p
    # Small traditional rose clusters, raised paint on the cabin end panels.
    for side in (-1,1):
        for z in (-3.60,2.84):
            for yy,zz in [(1.69,z-.13),(1.88,z+.1)]:
                roundel('Painted rose leaf',side*1.089,yy-.075,zz+.06,.09,'cream',side*math.pi/2,8)
                roundel('Painted rose bloom',side*1.112,yy,zz,.095,'rose',side*math.pi/2,10)
                roundel('Painted rose centre',side*1.15,yy,zz,.037,'brass',side*math.pi/2,8)


def forge():
    shell('Forge rear workshop', 4.04, 3.85, 3.2, 'stone', z=-1.30)
    roof('Forge tile', 0, -.06, 4.57, 6.86, 3.24, 4.64, 'tile', 7)
    for side in (-1, 1):
        box('Forge porch post', (side * 1.89, 1.62, 2.95), (.22, 3.24, .22), 'timber')
        beam('Forge knee brace', (side * 1.89, 2.56, 2.95), (side * 1.22, 3.14, 2.95), .13)
        frame('Forge side shutter', side * 2.04, 1.77, -1.18, 1.12, 1.23, side * math.pi / 2, 'timber', 'ink')
    frame('Forge door', .62, 1.22, .645, 1.02, 2.23, trim='timber', door=True)
    chimney(-.4, 1.75, 1.17, 5.679, .8)
    box('Forge hood', (-.4, 1.47, 1.83), (1.42, 1.26, 1.15), 'stone')
    box('Forge firebox', (-.4, 1.08, 2.414), (.98, .56, .018), 'ink')
    box('Forge hearth', (-.4, .7, 2.12), (1.5, .18, 1.36), 'stone')
    lathe('Anvil oak stump', 1.20, 2.16, [(.38, 0), (.4, .08), (.34, .79)], 'oak', 12)
    box('Anvil foot', (1.2, .84, 2.16), (.67, .13, .37), 'iron')
    box('Anvil waist', (1.2, .99, 2.16), (.36, .2, .25), 'iron')
    box('Anvil face', (1.2, 1.145, 2.16), (.69, .13, .32), 'iron')
    prism('Anvil horn', [(1.49, 1.2), (1.95, 1.12), (1.48, 1.06)], 2.24, 2.08, 'iron')
    box('Forge lintel sign', (0, 2.95, 3.06), (3.3, .35, .13), 'timber')
    box('Forge paving', (0, .035, 1.94), (4.715, .07, 3.12), 'stone')


BUILDERS = dict(cottage=cottage, shop=shop, church=church, townhall=townhall, pub=pub, school=school, forge=forge, **{'canal-boat': canal_boat})
report = []
for slug, builder in BUILDERS.items():
    if a.only and slug not in a.only.split(','):
        continue
    area = 'world' if slug == 'canal-boat' else 'village'
    original = ROOT / 'assets/source/models' / area / (slug + '-tripo-original.glb')
    before = hashlib.sha256(original.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    VERTS, FACES, UVS, PARTS = [], [], [], []
    if slug == 'canal-boat':
        PALETTE.update(slate=('203c50', .42), brick=('772f32', .48), green=('284c42', .55), cream=('e8dbb5', .52), rose=('b55754', .5), glass=('345b69', .2))
    mat = atlas()
    builder()
    mesh = bpy.data.meshes.new(slug + ' planar architecture')
    mesh.from_pydata(VERTS, [], FACES)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name='UVMap')
    for face, coords in zip(mesh.polygons, UVS):
        for loop, value in zip(face.loop_indices, coords):
            uv.data[loop].uv = value
    # Correct every closed component's winding independently. Every surface has
    # a physical underside rather than relying on a two-sided preview material.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for part in PARTS:
        if part['name'] in ('Civic curving ogee cupola', 'School swept bell cap', 'School open bronze bell', 'Mushroom brass roof vent'):
            lo, hi = part['firstVertex'], part['firstVertex'] + part['vertexCount']
            for polygon in mesh.polygons:
                if all(lo <= v < hi for v in polygon.vertices):
                    polygon.use_smooth = True
    obj = bpy.data.objects.new(slug + ' authored architecture', mesh)
    bpy.context.collection.objects.link(obj)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    lo = [min(v.co[k] for v in mesh.vertices) for k in range(3)]
    hi = [max(v.co[k] for v in mesh.vertices) for k in range(3)]
    width, height, length = ENVELOPES[slug]
    dims = (width, length, height)
    ratios = [dims[k] / (hi[k] - lo[k]) for k in range(3)]
    if any(abs(r - 1) > .12 for r in ratios):
        raise RuntimeError(slug + ' needs explicit envelope design: ' + str(ratios))
    for v in mesh.vertices:
        for k in range(3):
            v.co[k] = (v.co[k] - lo[k]) * ratios[k] - (dims[k] / 2 if k < 2 else 0)
    mesh.update()
    # The component inventory is source proof, not a replacement for delivery rays.
    obj['construction'] = 'authored-planar-village-v1'
    obj['providerVerticesRetained'] = 0
    out = ROOT / 'assets/source/models' / area / (slug + '-crafted.glb')
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                             export_yup=True, export_animations=False, export_extras=True)
    assert hashlib.sha256(original.read_bytes()).hexdigest() == before
    mesh.calc_loop_triangles()
    report.append({'id': area + '-' + slug, 'sourceSha256': before,
                   'outputSha256': hashlib.sha256(out.read_bytes()).hexdigest(),
                   'output': str(out.relative_to(ROOT)), 'triangles': len(mesh.loop_triangles),
                   'extent': ENVELOPES[slug], 'fitRatiosBlender': ratios, 'parts': PARTS,
                   'providerVerticesRetained': 0})
    REPORT.write_text(json.dumps(report, indent=2) + '\n')
    print('AUTHORED', slug, len(mesh.loop_triangles), 'triangles', flush=True)
