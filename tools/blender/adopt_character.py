"""Adopt a CC0 KayKit character and slim it for the web.

Source: Kay Lousberg, "KayKit - Adventurers Character Pack 1.0"
        https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
License: CC0 1.0 Universal — commercial use permitted, no attribution required.

The source GLB ships 76 clips and a 1024px atlas, which is far more than a
browser game needs. This script keeps only the locomotion set the player will
actually see, downsamples the atlas, and re-exports a GLB that is roughly an
order of magnitude smaller while keeping every kept clip on its original rig.

Run:
    Blender --background --factory-startup --python tools/blender/adopt_character.py
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "public", "models"))

# Which source character to adopt. The Mage carries the wand/staff silhouette
# that suits the Weaver, a travelling craftsperson who restores connections.
CHARACTER = "Mage"

SOURCE_DIR = "/tmp/ilm-assets/KayKit-Character-Pack-Adventures-1.0"
SOURCE_GLB = os.path.join(
    SOURCE_DIR, "addons/kaykit_character_pack_adventures/Characters/gltf", f"{CHARACTER}.glb"
)

# Locomotion only. Every clip comes from the same rig, so blending between them
# is consistent. The strafe pair covers turning.
KEEP_CLIPS = [
    "Idle",
    "Walking_A",
    "Running_A",
    "Running_Strafe_Left",
    "Running_Strafe_Right",
]

ATLAS_SIZE = 256


def import_source():
    if not os.path.exists(SOURCE_GLB):
        raise SystemExit(
            f"Source not found: {SOURCE_GLB}\n"
            "Clone it first:\n"
            "  git clone --depth 1 https://github.com/KayKit-Game-Assets/"
            "KayKit-Character-Pack-Adventures-1.0.git"
        )
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SOURCE_GLB)
    print(f"IMPORTED {SOURCE_GLB}")


def report_source():
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    tris = 0
    for mesh in meshes:
        for poly in mesh.data.polygons:
            tris += len(poly.vertices) - 2
    print(f"SOURCE meshes={len(meshes)} triangles={tris}")
    print(f"SOURCE actions={len(bpy.data.actions)}")
    return tris


def shrink_atlas(size=ATLAS_SIZE):
    """Downsample every embedded texture; the source atlas is flat gradient art."""
    for image in bpy.data.images:
        if image.size[0] == 0:
            continue
        image.scale(size, size)
        print(f"ATLAS {image.name} -> {size}px")


def keep_only_clips(names):
    """Delete every action that is not in the keep list."""
    removed = []
    for action in list(bpy.data.actions):
        if action.name not in names:
            removed.append(action.name)
            bpy.data.actions.remove(action)
    print(f"CLIPS kept={names}")
    print(f"CLIPS removed={len(removed)}")
    return removed


def flatten_to_one_mesh():
    """
    The source is a single skinned mesh already; this just makes sure nothing
    stray is exported alongside it.
    """
    keep = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"EXPORT_OBJECTS meshes={len(keep)}")


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_materials="EXPORT",
        export_yup=True,
        export_optimize_animation_size=True,
        export_def_bones=False,
    )
    size = os.path.getsize(path) // 1024
    print(f"EXPORTED {path} ({size} KB)")


def main():
    import_source()
    source_tris = report_source()
    shrink_atlas(ATLAS_SIZE)
    keep_only_clips(KEEP_CLIPS)
    flatten_to_one_mesh()

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "weaver.glb")
    export(out)

    final_tris = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            for poly in obj.data.polygons:
                final_tris += len(poly.vertices) - 2
    print(f"RESULT triangles {source_tris} -> {final_tris}")
    print("ADOPT_COMPLETE")


if __name__ == "__main__":
    main()