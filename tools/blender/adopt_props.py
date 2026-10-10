"""Adopt CC0 props from KayKit Prototype Bits and merge them for the web.

Source: Kay Lousberg, "KayKit - Prototype Bits 1.0"
        https://github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0
License: CC0 1.0 Universal — commercial use permitted, no attribution required.

Every prop in this pack shares one gradient atlas and each model is only a few
dozen triangles, so a whole curated set costs almost nothing. The props are
imported, given predictable names, and exported as a single GLB holding one
mesh per prop. At runtime the game builds an instanced mesh per child, so a
handful of files become hundreds of placed objects with one draw call each.

Run:
    Blender --background --factory-startup --python tools/blender/adopt_props.py
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from common import bake_vertex_ao  # noqa: E402

OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "public", "models"))

SOURCE_DIR = (
    "/tmp/ilm-assets/KayKit-Prototype-Bits-1.0/addons/kaykit_prototype_bits/Assets/gltf"
)

# Curated set, grouped by the region each group dresses. The runtime reads these
# names to decide where a prop is allowed to appear.
PROPS = [
    # ruins and architecture
    "Pillar_A", "Pillar_B", "Wall_Half", "Wall_Window_Open", "Primitive_Stairs",
    # storage, for the harbour and the valley workshop
    "Barrel_A", "Barrel_C", "Box_A", "Box_B", "Pallet_Large", "Can_A",
    # workshop fittings
    "table_medium", "Primitive_Beam", "Box_C",
]

ATLAS_SIZE = 512


def import_props():
    if not os.path.isdir(SOURCE_DIR):
        raise SystemExit(
            f"Source not found: {SOURCE_DIR}\n"
            "Clone it first:\n"
            "  git clone --depth 1 https://github.com/KayKit-Game-Assets/"
            "KayKit-Prototype-Bits-1.0.git /tmp/ilm-assets/KayKit-Prototype-Bits-1.0"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    missing = []
    for name in PROPS:
        path = os.path.join(SOURCE_DIR, f"{name}.gltf")
        if not os.path.exists(path):
            missing.append(name)
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        # Give every imported mesh a stable, predictable name.
        mesh_objects = [o for o in new if o.type == "MESH"]
        if mesh_objects:
            mesh_objects[0].name = name
            for extra in mesh_objects[1:]:
                extra.name = f"{name}__{extra.name}"
        for obj in new:
            if obj.type != "MESH":
                bpy.data.objects.remove(obj, do_unlink=True)
        print(f"IMPORTED {name}")

    if missing:
        print(f"MISSING {missing}")
    return len(PROPS) - len(missing)


def shrink_atlas(size=ATLAS_SIZE):
    for image in bpy.data.images:
        if image.size[0] == 0:
            continue
        image.scale(size, size)
        print(f"ATLAS {image.name} -> {size}px")


def note_grounding():
    """
    The glTF exporter writes the source mesh data verbatim and does not carry
    an offset through to the node transform, so grounding is done at load time
    in `src/world/Props.tsx`, where the result can actually be checked.
    """
    print("GROUND deferred to runtime (see src/world/Props.tsx)")


def bake_ao_per_prop():
    """
    Bake each prop on its own, in an otherwise empty scene.

    This isolation is the whole point. `Props.tsx` turns each of these meshes
    into an InstancedMesh and scatters it, so one barrel geometry is drawn a
    dozen times across six regions. Anything occluding its neighbours at bake
    time — a crate against a pallet, a pillar beside a wall — would be frozen
    into the vertices and then repeated at every placement, including the ones
    standing in open ground. Baking alone keeps the stored value a property of
    the prop itself: its own corners, its own overhangs.
    """
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    baked = 0
    for obj in meshes:
        # Moved aside rather than hidden: `hide_viewport` takes an object out
        # of the dependency graph, and an AO bake that cannot see the object it
        # is baking writes nothing.
        obj.location.z = 500.0

    for obj in meshes:
        obj.location.z = 0.0
        if bake_vertex_ao(obj, distance=1.2):
            baked += 1
        obj.location.z = 500.0

    for obj in meshes:
        obj.location.z = 0.0
    print(f"AO baked on {baked}/{len(meshes)} props")


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_materials="EXPORT",
        export_yup=True,
        # Same reason as the landmarks: "NAME" would emit an all-white COLOR_0
        # that three.js reads instead of the baked data in COLOR_1.
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=True,
    )
    size = os.path.getsize(path) // 1024
    print(f"EXPORTED {path} ({size} KB)")


def main():
    count = import_props()
    shrink_atlas(ATLAS_SIZE)
    note_grounding()
    bake_ao_per_prop()

    tris = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            for poly in obj.data.polygons:
                tris += len(poly.vertices) - 2

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "props.glb")
    export(out)
    print(f"RESULT props={count} triangles={tris}")
    print("PROPS_COMPLETE")


if __name__ == "__main__":
    main()