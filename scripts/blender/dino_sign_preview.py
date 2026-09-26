"""Reproduce the authored Dead Dino eye occlusion, with one placement variable.

Head, snout, body and eye dimensions mirror GasStationInstanced.tsx. This is
a Blender geometry study, not an in-game lighting or performance receipt.
Run through the repository capture lock, using headless Blender:
  Blender --background --threads 2 --python-exit-code 1 --python \
    scripts/blender/dino_sign_preview.py -- --out /tmp/dino-eye-study.png
The source GLBs and any interactive Blender session are untouched.
"""
import bpy
import math
import pathlib
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out = pathlib.Path(args[args.index("--out") + 1]).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, hex_color):
    m = bpy.data.materials.new(name)
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
    m.diffuse_color = (*linear, 1)
    return m


green = material("Authored green", "4caf50")
black = material("Authored eye ink", "212121")
pink = material("Authored tongue", "f48fb1")
orange = material("Authored orange field", "f57c1f")
cream = material("Authored cream frame", "fff3e0")
spike_green = material("Authored spikes", "81c784")


def finish(ob, mat):
    ob.data.materials.append(mat)
    return ob


def sphere(pos, radius, mat, segments=16, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                       radius=radius, location=pos,
                                       rotation=(math.pi / 2, 0, 0))
    ob = finish(bpy.context.object, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def box(pos, size, mat, rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    ob = finish(bpy.context.object, mat)
    ob.scale = size
    ob.rotation_euler.z = rotation
    return ob


def cone(pos, radius, height, mat, segments, rotation=0):
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius, radius2=0,
                                  depth=height, location=pos,
                                  rotation=(-math.pi / 2, 0, rotation))
    return finish(bpy.context.object, mat)


def label(text, pos, size):
    curve = bpy.data.curves.new(text, "FONT")
    curve.body = text
    curve.size = size
    curve.align_x = "CENTER"
    ob = bpy.data.objects.new(text, curve)
    bpy.context.collection.objects.link(ob)
    ob.location = pos
    finish(ob, cream)


for offset, eye_z, caption in [(-2.4, 0.30, "BEFORE"), (2.4, 0.445, "PROPOSED")]:
    def point(x, y, z):
        return (offset + x, y + 0.6, z + 0.25)

    box((offset, 0, 0), (4, 5, .3), cream)
    box((offset, 0, .16), (3.7, 4.7, .02), orange)
    sphere(point(0, 0, 0), .7, green)
    sphere(point(.5, .5, 0), .45, green, 14, 12)
    sphere(point(.85, .4, 0), .25, green, 12, 10)
    for rotation in [math.pi / 4, -math.pi / 4]:
        box(point(.65, .6, eye_z), (.18, .04, .02), black, rotation)
        box(point(.55, .6, -.25), (.18, .04, .02), black, rotation)
    box(point(.95, .25, .1), (.15, .08, .06), pink, -.3)
    # Capsule limbs are reconstructed as the same cylinder and hemispheres.
    for x, y, z, radius, length in [(.25, .1, .5, .08, .2),
                                    (.25, .1, -.5, .08, .2),
                                    (-.2, -.6, .35, .12, .25),
                                    (-.2, -.6, -.35, .12, .25)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=length,
                                           location=point(x, y, z),
                                           rotation=(math.pi / 2, 0, 0))
        finish(bpy.context.object, green)
        sphere(point(x, y - length / 2, z), radius, green, 8, 8)
        sphere(point(x, y + length / 2, z), radius, green, 8, 8)
    cone(point(-.7, -.1, 0), .2, .8, green, 8, .4)
    for x in [-.3, -.1, .1, .3]:
        cone(point(x, .65 - abs(x) * .3, 0), .08, .18, spike_green, 6)
    label("DEAD", (offset, -1.3, .22), .5)
    label("DINO", (offset, -1.85, .22), .5)
    label(caption, (offset, 2.8, .25), .3)

scene = bpy.context.scene
cam_data = bpy.data.cameras.new("Matched frontal inspection")
cam = bpy.data.objects.new("Matched frontal inspection", cam_data)
scene.collection.objects.link(cam)
cam.location = (0, .1, 12)
cam.rotation_euler = (Vector((0, .1, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.type = "ORTHO"
cam_data.ortho_scale = 10
scene.camera = cam
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.light = "STUDIO"
scene.display.shading.show_cavity = False
scene.render.filepath = str(out)
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
observed = []
for offset in [-2.4, 2.4]:
    hit, _, _, _, obj, _ = scene.ray_cast(
        depsgraph, Vector((offset + .65, 1.2, 10)), Vector((0, 0, -1)))
    name = obj.data.materials[0].name if hit else "NO HIT"
    observed.append(name)
print("Eye-centre ray hits (before, proposed):", observed, flush=True)
if observed != [green.name, black.name]:
    raise RuntimeError("The claimed eye-occlusion reproduction did not hold.")
if "--probe-only" not in args:
    bpy.ops.render.render(write_still=True)
print("One variable: front eye centre z 0.300 -> 0.445; all other study geometry identical.")
