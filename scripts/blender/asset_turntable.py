"""Fixed-camera asset review turntable for the asset loop (2026-11-04).

Read-only. Imports a delivered or candidate GLB, renders the same twelve cameras
twice - colour (EEVEE, the asset's own materials) and clay (Workbench, one matte
colour, so geometry and assembly defects cannot hide behind a texture) - composes
two 4x3 contact sheets and writes an objective probe report. It never exports or
saves a model, so it cannot disturb pipeline GLB order (PROMPTS.md rule 1).

Blender is Z-up; glTF/three.js is Y-up. The importer maps three.js +Z (the
conventional front) to Blender -Y; view labels and report bounds use three.js
axes so a judge's finding can be located in the runtime.

Run through scripts/asset-turntable.mjs, which holds .capture.lock:
  Blender -b --factory-startup -P scripts/blender/asset_turntable.py -- --jobs jobs.json
jobs.json: [{"id", "input", "outdir"}]. Working if every job directory gets
12 colour views, 12 clay views, sheet-colour.jpg, sheet-clay.jpg and report.json,
and a planted floating part shows up under report.floating.
"""
import argparse
import json
import math
import pathlib
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# id, label, kind, azimuth (degrees from three.js +Z toward +X), elevation
VIEWS = [
    ('01', 'az000 front(+Z)', 'orbit', 0, 20),
    ('02', 'az045', 'orbit', 45, 20),
    ('03', 'az090 side(+X)', 'orbit', 90, 20),
    ('04', 'az135', 'orbit', 135, 20),
    ('05', 'az180 back(-Z)', 'orbit', 180, 20),
    ('06', 'az225', 'orbit', 225, 20),
    ('07', 'az270 side(-X)', 'orbit', 270, 20),
    ('08', 'az315', 'orbit', 315, 20),
    ('09', 'eye 1.6m az030, 1.75m capsule', 'eye', 30, None),
    ('10', 'eye 1.6m az210, 1.75m capsule', 'eye', 210, None),
    ('11', 'top-down', 'orbit', 0, 88),
    ('12', 'ground contact az330', 'ground', 330, None),
]
LENS_MM = 50.0
SENSOR_MM = 36.0
HALF_FOV = math.atan((SENSOR_MM / 2) / LENS_MM)
CAPSULE_RADIUS = 0.22
CAPSULE_HEIGHT = 1.75
EYE_HEIGHT = 1.6
GROUND_TOLERANCE = 0.01  # metres: an island this close to y=0 is grounded
CONTACT_RADIUS = 0.005  # metres: a vertex this close to another island touches it
GAP_STEPS = (0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--jobs', required=True)
    parser.add_argument('--size', type=int, default=640)
    parser.add_argument('--tile', type=int, default=384)
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--skip-render', action='store_true', help='Probe only (CPU), no GPU use')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def blender_to_three(v):
    return [v[0], v[2], -v[1]]


def three_dir_to_blender(azimuth_deg):
    a = math.radians(azimuth_deg)
    return Vector((math.sin(a), -math.cos(a), 0.0))


def try_set(obj, attr, value):
    try:
        setattr(obj, attr, value)
        return True
    except (AttributeError, TypeError, ValueError):
        return False


# ---------------------------------------------------------------- probes

def gather_triangles(meshes):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    verts, tris, offset = [], [], 0
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        n = len(mesh.vertices)
        co = np.empty(n * 3, dtype=np.float32)
        mesh.vertices.foreach_get('co', co)
        matrix = np.array(evaluated.matrix_world, dtype=np.float64)
        co = co.reshape(-1, 3).astype(np.float64) @ matrix[:3, :3].T + matrix[:3, 3]
        tri = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int64)
        mesh.loop_triangles.foreach_get('vertices', tri)
        verts.append(co)
        tris.append(tri.reshape(-1, 3) + offset)
        offset += n
        evaluated.to_mesh_clear()
    if not verts:
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    return np.concatenate(verts), np.concatenate(tris)


def union_find(count, pairs):
    labels = np.arange(count, dtype=np.int64)
    if len(pairs) == 0:
        return labels
    a, b = pairs[:, 0], pairs[:, 1]
    while True:
        before = labels.copy()
        m = np.minimum(labels[a], labels[b])
        np.minimum.at(labels, a, m)
        np.minimum.at(labels, b, m)
        labels = labels[labels]
        labels = labels[labels]
        if np.array_equal(labels, before):
            return labels


def probe(meshes):
    raw_v, raw_t = gather_triangles(meshes)
    report = {'rawVertices': int(len(raw_v)), 'triangles': int(len(raw_t))}
    if len(raw_t) == 0:
        report['empty'] = True
        return report
    quantised = np.round(raw_v / 1e-5).astype(np.int64)
    _, first, inverse = np.unique(quantised, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    verts = raw_v[first]
    tris = inverse[raw_t]
    degenerate = (tris[:, 0] == tris[:, 1]) | (tris[:, 1] == tris[:, 2]) | (tris[:, 0] == tris[:, 2])
    e1 = verts[tris[:, 1]] - verts[tris[:, 0]]
    e2 = verts[tris[:, 2]] - verts[tris[:, 0]]
    area = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1)
    degenerate |= area < 1e-12
    report['degenerateTriangles'] = int(degenerate.sum())
    tris = tris[~degenerate]
    n = len(verts)
    report['weldedVertices'] = int(n)

    directed = tris[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    lo = np.minimum(directed[:, 0], directed[:, 1])
    hi = np.maximum(directed[:, 0], directed[:, 1])
    undirected_key = lo * n + hi
    _, counts = np.unique(undirected_key, return_counts=True)
    report['boundaryEdges'] = int((counts == 1).sum())
    report['nonManifoldEdges'] = int((counts > 2).sum())
    directed_key = directed[:, 0] * n + directed[:, 1]
    dkeys, dcounts = np.unique(directed_key, return_counts=True)
    repeated = dkeys[dcounts > 1]
    flipped = np.unique(np.minimum(repeated // n, repeated % n) * n + np.maximum(repeated // n, repeated % n))
    report['inconsistentWindingEdges'] = int(len(flipped))

    vertex_island = union_find(n, directed)
    tri_island_raw = vertex_island[tris[:, 0]]
    island_ids, tri_island = np.unique(tri_island_raw, return_inverse=True)
    tri_island = tri_island.reshape(-1)
    island_count = len(island_ids)
    report['islands'] = int(island_count)

    vlist = [tuple(v) for v in verts.tolist()]
    tlist = [tuple(t) for t in tris.tolist()]
    world = BVHTree.FromPolygons(vlist, tlist, all_triangles=True)
    tri_order = np.argsort(tri_island, kind='stable')
    bounds = np.searchsorted(tri_island[tri_order], np.arange(island_count + 1))
    island_min_z = np.full(island_count, np.inf)
    edges = set()
    for i in range(island_count):
        own = tri_order[bounds[i]:bounds[i + 1]]
        own_tris = tris[own]
        own_verts = np.unique(own_tris)
        island_min_z[i] = verts[own_verts, 2].min()
        if island_count == 1:
            break
        local_index = {g: k for k, g in enumerate(own_verts.tolist())}
        local_tris = [tuple(local_index[g] for g in t) for t in own_tris.tolist()]
        local = BVHTree.FromPolygons([tuple(v) for v in verts[own_verts].tolist()], local_tris, all_triangles=True)
        for _, other in local.overlap(world):
            j = int(tri_island[other])
            if j != i:
                edges.add((min(i, j), max(i, j)))
        sample = own_verts if len(own_verts) <= 256 else own_verts[np.linspace(0, len(own_verts) - 1, 256).astype(np.int64)]
        for v in verts[sample]:
            for hit in world.find_nearest_range(Vector(v), CONTACT_RADIUS):
                j = int(tri_island[hit[2]])
                if j != i:
                    edges.add((min(i, j), max(i, j)))
    edge_array = np.array(sorted(edges), dtype=np.int64).reshape(-1, 2)
    component = union_find(island_count, edge_array)
    comp_ids, comp_of_island = np.unique(component, return_inverse=True)
    comp_of_island = comp_of_island.reshape(-1)
    grounded_island = island_min_z <= GROUND_TOLERANCE
    floating = []
    for c in range(len(comp_ids)):
        members = np.nonzero(comp_of_island == c)[0]
        if grounded_island[members].any():
            continue
        member_tris = np.concatenate([tri_order[bounds[i]:bounds[i + 1]] for i in members])
        member_verts = np.unique(tris[member_tris])
        pts = verts[member_verts]
        lo_b, hi_b = pts.min(axis=0), pts.max(axis=0)
        sample = member_verts if len(member_verts) <= 128 else member_verts[np.linspace(0, len(member_verts) - 1, 128).astype(np.int64)]
        gap = None
        for radius in GAP_STEPS:
            for v in verts[sample]:
                for hit in world.find_nearest_range(Vector(v), radius):
                    if comp_of_island[tri_island[hit[2]]] != c:
                        gap = radius if gap is None else min(gap, radius)
                        break
            if gap is not None:
                break
        floating.append({
            'islands': int(len(members)),
            'triangles': int(len(member_tris)),
            'size': round(float(np.linalg.norm(hi_b - lo_b)), 4),
            'minHeight': round(float(lo_b[2]), 4),
            'centreThree': [round(x, 3) for x in blender_to_three(((lo_b + hi_b) / 2).tolist())],
            'gapToOtherGeometryAtMost': gap,
            'heightAboveGround': round(float(lo_b[2]), 4),
        })
    floating.sort(key=lambda f: -f['size'])
    report['components'] = int(len(comp_ids))
    report['floatingComponents'] = len(floating)
    report['floating'] = floating[:24]
    report['globalMinHeight'] = round(float(verts[:, 2].min()), 4)
    return report


# ---------------------------------------------------------------- scene

def clear_and_import(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    return scene, [o for o in scene.objects if o.type == 'MESH']


def world_bounds(meshes):
    points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    return lo, hi


def nice_grid(size):
    target = max(size / 8.0, 0.05)
    for step in (0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0):
        if step >= target:
            return step
    return 50.0


def node_tree_of(owner):
    try_set(owner, 'use_nodes', True)
    return owner.node_tree


def add_ground(scene, extent, square):
    mesh = bpy.data.meshes.new('Review ground')
    h = extent
    mesh.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new('Review ground', mesh)
    scene.collection.objects.link(obj)
    mat = bpy.data.materials.new('Review ground')
    nt = node_tree_of(mat)
    nodes, links = nt.nodes, nt.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.9
    coords = nodes.new('ShaderNodeTexCoord')
    split = nodes.new('ShaderNodeSeparateXYZ')
    join = nodes.new('ShaderNodeCombineXYZ')
    join.inputs[2].default_value = 0.5
    checker = nodes.new('ShaderNodeTexChecker')
    checker.inputs['Scale'].default_value = 1.0 / square
    checker.inputs['Color1'].default_value = (0.40, 0.40, 0.39, 1)
    checker.inputs['Color2'].default_value = (0.46, 0.46, 0.45, 1)
    links.new(coords.outputs['Object'], split.inputs[0])
    links.new(split.outputs[0], join.inputs[0])
    links.new(split.outputs[1], join.inputs[1])
    links.new(join.outputs[0], checker.inputs['Vector'])
    links.new(checker.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.materials.append(mat)
    return obj


def add_capsule(scene, x, y):
    bm = bmesh.new()
    r = CAPSULE_RADIUS
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r, depth=CAPSULE_HEIGHT - 2 * r,
                          matrix=Matrix.Translation((0, 0, CAPSULE_HEIGHT / 2)))
    for z in (r, CAPSULE_HEIGHT - r):
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r,
                                  matrix=Matrix.Translation((0, 0, z)))
    mesh = bpy.data.meshes.new('Scale capsule 1.75m')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('Scale capsule 1.75m', mesh)
    obj.location = (x, y, 0)
    scene.collection.objects.link(obj)
    mat = bpy.data.materials.new('Scale capsule')
    nt = node_tree_of(mat)
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.75, 0.32, 0.08, 1)
    bsdf.inputs['Roughness'].default_value = 0.6
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def setup_lighting(scene, centre, radius):
    scene.world = bpy.data.worlds.new('Review sky')
    nt = node_tree_of(scene.world)
    background = next((n for n in nt.nodes if n.type == 'BACKGROUND'), None)
    if background is not None:
        background.inputs[0].default_value = (0.58, 0.60, 0.64, 1)
        background.inputs[1].default_value = 0.85
    try_set(scene.world, 'color', (0.58, 0.60, 0.64))
    sun_data = bpy.data.lights.new('Review sun', 'SUN')
    sun_data.energy = 3.2
    try_set(sun_data, 'angle', math.radians(3.0))
    sun = bpy.data.objects.new('Review sun', sun_data)
    scene.collection.objects.link(sun)
    toward_sun = three_dir_to_blender(35) * math.cos(math.radians(50))
    toward_sun.z = math.sin(math.radians(50))
    sun.rotation_euler = toward_sun.to_track_quat('Z', 'Y').to_euler()
    sun.location = centre + toward_sun * radius * 3


def configure_colour(scene, args):
    scene.render.engine = 'BLENDER_EEVEE'
    try_set(scene.eevee, 'taa_render_samples', args.samples)
    try_set(scene.view_settings, 'view_transform', 'Standard')
    try_set(scene.view_settings, 'look', 'None')
    scene.view_settings.exposure = 0.0


def configure_clay(scene):
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    # Object colour keeps asset, ground and scale capsule apart. Workbench shadow
    # volumes threw large false wedges across the ground plane, so contact is
    # judged from the colour pass's real shadows instead.
    shading.color_type = 'OBJECT'
    try_set(shading, 'show_cavity', True)
    try_set(shading, 'cavity_type', 'BOTH')
    try_set(shading, 'show_shadows', False)
    try_set(shading, 'show_object_outline', True)
    try_set(shading, 'background_type', 'WORLD')
    try_set(scene.display, 'render_aa', '8')
    try_set(scene.view_settings, 'view_transform', 'Standard')


def configure_output(scene, size):
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 92
    scene.render.use_stamp = True
    for flag in ('date', 'time', 'render_time', 'frame', 'frame_range', 'memory', 'hostname', 'camera',
                 'lens', 'scene', 'marker', 'filename', 'sequencer_strip', 'note'):
        try_set(scene.render, 'use_stamp_' + flag, flag == 'note')
    try_set(scene.render, 'stamp_font_size', max(14, size // 32))


def place_camera(cam, kind, azimuth, elevation, lo, hi, capsule_lo, capsule_hi):
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.05)
    data = cam.data
    data.lens = LENS_MM
    data.sensor_width = SENSOR_MM
    horizontal = three_dir_to_blender(azimuth)
    if kind == 'orbit':
        distance = radius / math.sin(HALF_FOV) * 1.06
        el = math.radians(elevation)
        position = centre + (horizontal * math.cos(el) + Vector((0, 0, math.sin(el)))) * distance
        target = centre
    elif kind == 'eye':
        both_lo = Vector([min(lo[i], capsule_lo[i]) for i in range(3)])
        both_hi = Vector([max(hi[i], capsule_hi[i]) for i in range(3)])
        target = (both_lo + both_hi) / 2
        both_radius = (both_hi - both_lo).length / 2
        distance = max(2.5, both_radius / math.sin(HALF_FOV) * 1.1)
        position = Vector((target.x, target.y, 0)) + horizontal * distance
        position.z = EYE_HEIGHT
    else:  # ground contact
        distance = radius / math.sin(HALF_FOV) * 1.0
        height = max(0.04, min(0.12, (hi.z - lo.z) * 0.08))
        position = Vector((centre.x, centre.y, 0)) + horizontal * distance
        position.z = height
        target = Vector((centre.x, centre.y, min((hi.z - lo.z) * 0.18, 0.5)))
    cam.location = position
    cam.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()
    span = (position - target).length + radius * 4
    data.clip_start = max(0.002, (position - target).length * 0.002)
    data.clip_end = span + 100


def compose_sheet(paths, out_path, tile):
    cols, rows = 4, 3
    width, height = cols * tile, rows * tile
    sheet = np.zeros((height, width, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    for index, path in enumerate(paths):
        image = bpy.data.images.load(str(path))
        image.scale(tile, tile)
        pixels = np.empty(tile * tile * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(tile, tile, 4)
        r, c = divmod(index, cols)
        y0 = height - (r + 1) * tile
        sheet[y0:y0 + tile, c * tile:(c + 1) * tile] = pixels
        bpy.data.images.remove(image)
    out = bpy.data.images.new(out_path.stem, width, height, alpha=False, float_buffer=False)
    out.pixels.foreach_set(sheet.reshape(-1))
    out.filepath_raw = str(out_path)
    out.file_format = 'JPEG'
    try:
        out.save(filepath=str(out_path), quality=90)
    except TypeError:
        out.save()
    bpy.data.images.remove(out)


def run_job(job, args):
    started = time.time()
    outdir = pathlib.Path(job['outdir']).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    scene, meshes = clear_and_import(pathlib.Path(job['input']).resolve())
    lo, hi = world_bounds(meshes)
    report = {
        'id': job.get('id'),
        'input': str(pathlib.Path(job['input']).resolve()),
        'blenderVersion': bpy.app.version_string,
        'meshes': [],
        'boundsThree': {
            'min': blender_to_three(list(lo)),
            'max': blender_to_three(list(hi)),
            'size': {'width': hi.x - lo.x, 'height': hi.z - lo.z, 'length': hi.y - lo.y},
        },
        'images': [{'name': im.name, 'size': list(im.size)} for im in bpy.data.images],
    }
    for obj in meshes:
        report['meshes'].append({'name': obj.name, 'vertices': len(obj.data.vertices),
                                 'materials': [m.name for m in obj.data.materials if m]})
    report['probe'] = probe(meshes)
    if args.skip_render:
        report['timeSeconds'] = round(time.time() - started, 2)
        (outdir / 'report.json').write_text(json.dumps(report, indent=2))
        return report

    size = max(hi - lo)
    square = nice_grid(size)
    report['gridSquareMetres'] = square
    centre = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.05)
    add_ground(scene, max(60.0, radius * 12), square)
    capsule_x = hi.x + 0.6 + CAPSULE_RADIUS
    capsule = add_capsule(scene, capsule_x, centre.y)
    for obj in meshes:
        obj.color = (0.80, 0.78, 0.74, 1.0)
    capsule.color = (0.75, 0.32, 0.08, 1.0)
    scene.objects['Review ground'].color = (0.33, 0.34, 0.36, 1.0)
    capsule_lo = Vector((capsule_x - CAPSULE_RADIUS, centre.y - CAPSULE_RADIUS, 0))
    capsule_hi = Vector((capsule_x + CAPSULE_RADIUS, centre.y + CAPSULE_RADIUS, CAPSULE_HEIGHT))
    setup_lighting(scene, centre, radius)
    cam = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    configure_output(scene, args.size)
    views = []
    for mode in ('colour', 'clay'):
        configure_colour(scene, args) if mode == 'colour' else configure_clay(scene)
        for vid, label, kind, azimuth, elevation in VIEWS:
            capsule.hide_render = kind != 'eye'
            place_camera(cam, kind, azimuth, elevation, lo, hi, capsule_lo, capsule_hi)
            scene.render.stamp_note_text = f"{vid} {mode} | {label} | grid {square:g} m"
            path = outdir / f"{mode}-{vid}.jpg"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            if mode == 'colour':
                views.append({'id': vid, 'label': label, 'kind': kind, 'colour': path.name, 'clay': f"clay-{vid}.jpg"})
    compose_sheet([outdir / f"colour-{v[0]}.jpg" for v in VIEWS], outdir / 'sheet-colour.jpg', args.tile)
    compose_sheet([outdir / f"clay-{v[0]}.jpg" for v in VIEWS], outdir / 'sheet-clay.jpg', args.tile)
    report['views'] = views
    report['timeSeconds'] = round(time.time() - started, 2)
    (outdir / 'report.json').write_text(json.dumps(report, indent=2))
    return report


def main():
    args = parse_args()
    jobs = json.loads(pathlib.Path(args.jobs).read_text())
    failures = 0
    for job in jobs:
        try:
            report = run_job(job, args)
            print('ASSET_TURNTABLE_OK', job.get('id'), report.get('timeSeconds'), flush=True)
        except Exception as error:  # report and continue: one bad asset must not hide the rest
            failures += 1
            outdir = pathlib.Path(job['outdir'])
            outdir.mkdir(parents=True, exist_ok=True)
            (outdir / 'error.txt').write_text(repr(error))
            print('ASSET_TURNTABLE_FAIL', job.get('id'), repr(error), flush=True)
    sys.exit(1 if failures else 0)


main()
