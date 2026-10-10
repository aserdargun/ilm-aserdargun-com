"""ILMEK asset build.

Run headless:
    Blender --background --factory-startup --python tools/blender/build_assets.py

Emits GLB files to public/models/. The game loads these through drei's useGLTF
and falls back to its procedural geometry if a file is missing, so a partial or
failed build never leaves the game unplayable.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "public", "models"))

import common  # noqa: E402
from common import build_materials, export_glb, reset_scene, set_collection  # noqa: E402
from common import bake_vertex_ao  # noqa: E402
import weaver as weaver_mod  # noqa: E402
import landmarks as landmarks_mod  # noqa: E402


def build_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    exported = []

    def emit(name, builder, collection):
        set_collection(collection)
        obj = builder()
        if obj is None:
            print(f"SKIPPED {name}")
            return
        # Bake before export: the glTF writer reads whatever colour layer is
        # on the mesh, so the bake has to exist first.
        bake_vertex_ao(obj)
        path = os.path.join(OUT_DIR, f"{name}.glb")
        export_glb(path, [obj])
        exported.append(name)
        # Remove the built object so the next asset starts clean.
        bpy.data.objects.remove(obj, do_unlink=True)

    # The player character is NOT built here: `weaver.glb` is the adopted CC0
    # model produced by `adopt_character.py`, and re-running this script must
    # not overwrite it. Build it with:
    #   git clone --depth 1 https://github.com/KayKit-Game-Assets/\
    #       KayKit-Character-Pack-Adventures-1.0.git /tmp/ilm-assets/...
    #   Blender --background --factory-startup --python tools/blender/adopt_character.py
    emit("spark", weaver_mod.build_spark, "Characters")

    # hub and puzzle furniture
    emit("synthesis_tree", landmarks_mod.build_synthesis_tree, "Hub")
    emit("tapestry", landmarks_mod.build_tapestry, "Hub")
    emit("console", landmarks_mod.build_console, "Furniture")

    # region landmarks
    for name, builder in (
        ("terrace_map", landmarks_mod.build_terrace_map),
        ("great_loom", landmarks_mod.build_great_loom),
        ("council_city", landmarks_mod.build_council_city),
        ("cloud_harbour", landmarks_mod.build_cloud_harbour),
        ("collective_gardens", landmarks_mod.build_collective_gardens),
        ("observer_mirrors", landmarks_mod.build_observer_mirrors),
        ("living_valley", landmarks_mod.build_living_valley),
    ):
        emit(name, builder, "Landmarks")

    print("BUILD_COMPLETE " + ",".join(exported))


def main():
    reset_scene()
    build_materials()
    build_all()


if __name__ == "__main__":
    main()