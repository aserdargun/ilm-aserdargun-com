"""Render a contact sheet of the built assets for visual review.

    Blender --background --factory-startup --python tools/blender/render_preview.py

Writes one PNG per asset to tools/blender/preview/. Used to judge the models
without having to walk the game.
"""

import os
import sys

import bpy
import mathutils
import math

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

OUT_DIR = os.path.join(HERE, "preview")

from common import build_materials, reset_scene  # noqa: E402
import weaver as weaver_mod  # noqa: E402
import landmarks as landmarks_mod  # noqa: E402

BUILDERS = {
    "weaver": weaver_mod.build_weaver,
    "spark": weaver_mod.build_spark,
    "synthesis_tree": landmarks_mod.build_synthesis_tree,
    "console": landmarks_mod.build_console,
    "terrace_map": landmarks_mod.build_terrace_map,
    "great_loom": landmarks_mod.build_great_loom,
    "council_city": landmarks_mod.build_council_city,
    "cloud_harbour": landmarks_mod.build_cloud_harbour,
    "collective_gardens": landmarks_mod.build_collective_gardens,
    "observer_mirrors": landmarks_mod.build_observer_mirrors,
    "living_valley": landmarks_mod.build_living_valley,
}


def render(name, builder, distance_scale=1.0, height_scale=0.45):
    reset_scene()
    build_materials()

    obj = builder()
    if obj is None:
        return

    # Frame the object by its bounding box.
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    lows = [min(p[i] for p in points) for i in range(3)]
    highs = [max(p[i] for p in points) for i in range(3)]
    centre = [(lows[i] + highs[i]) / 2 for i in range(3)]
    extent = max(highs[i] - lows[i] for i in range(3)) * distance_scale

    bpy.ops.object.camera_add(location=(centre[0], -extent * 1.5, centre[2] + extent * height_scale))
    cam = bpy.context.object
    cam.rotation_euler = (math.radians(78), 0, 0)
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type="SUN", location=(centre[0] - extent, centre[1], centre[2] + extent * 2))
    sun = bpy.context.object
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(50), math.radians(20), math.radians(40))

    bpy.ops.object.light_add(type="AREA", location=(centre[0] + extent, centre[1] - extent, centre[2]))
    fill = bpy.context.object
    fill.data.energy = 600
    fill.data.size = extent

    world = bpy.data.worlds.new("preview")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.07, 0.09, 0.16, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.1
    bpy.context.scene.world = world

    scene = bpy.context.scene
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"

    path = os.path.join(OUT_DIR, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {path}")


if __name__ == "__main__":
    import mathutils  # noqa: F401  (needed before use inside render())
    os.makedirs(OUT_DIR, exist_ok=True)
    for asset_name, asset_builder in BUILDERS.items():
        try:
            render(asset_name, asset_builder)
        except Exception as exc:  # keep going; one bad model must not stop review
            print(f"FAILED {asset_name}: {exc}")
    print("PREVIEW_COMPLETE")