"""Rig and locomotion clips for the Weaver.

The Weaver is built from discrete parts, so it is rigged with rigid parenting:
each part is attached to a bone and animated by rotating that bone. For a faceted
low-poly character this reads as a jointed doll, which suits the art direction,
and it is far more robust than automatic skin weighting.

Four clips are authored on one rig, which is what keeps them consistent:

    idle  - breathing, weight shift, staff settle
    walk  - moderate stride with counter-swinging arms
    run   - longer stride, forward lean, deeper bob
    turn  - a weight-shift the game blends across while rotating

Every clip is a seamless loop authored on the same skeleton at the same
foot-plant positions, so blending between them never pops.
"""

import math

# Rig proportions, matching the mesh built in weaver.py.
HIP_Z = 0.95
SPINE_Z = 1.18
CHEST_Z = 1.36
NECK_Z = 1.52


def _bones():
    """(name, head, tail, parent) for the whole skeleton."""
    return [
        ("root", (0, 0, HIP_Z), (0, 0, SPINE_Z), None),
        ("spine", (0, 0, SPINE_Z), (0, 0, CHEST_Z), "root"),
        ("chest", (0, 0, CHEST_Z), (0, 0, NECK_Z), "spine"),
        ("head", (0, 0, NECK_Z), (0, 0, NECK_Z + 0.26), "chest"),
        # staff arm holds the prop, so it is kept slightly forward
        ("shoulder.L", (0.20, 0, CHEST_Z - 0.02), (0.40, 0, CHEST_Z - 0.06), "chest"),
        ("arm.L", (0.40, 0, CHEST_Z - 0.06), (0.42, 0, 1.10), "shoulder.L"),
        ("forearm.L", (0.42, 0, 1.10), (0.40, -0.06, 0.86), "arm.L"),
        ("shoulder.R", (-0.20, 0, CHEST_Z - 0.02), (-0.40, 0, CHEST_Z - 0.06), "chest"),
        ("arm.R", (-0.40, 0, CHEST_Z - 0.06), (-0.42, 0, 1.10), "shoulder.R"),
        ("forearm.R", (-0.42, 0, 1.10), (-0.40, -0.06, 0.86), "arm.R"),
        ("thigh.L", (0.11, 0, HIP_Z), (0.11, 0, 0.50), "root"),
        ("shin.L", (0.11, 0, 0.50), (0.11, 0, 0.16), "thigh.L"),
        ("foot.L", (0.11, 0, 0.16), (0.11, -0.24, 0.04), "shin.L"),
        ("thigh.R", (-0.11, 0, HIP_Z), (-0.11, 0, 0.50), "root"),
        ("shin.R", (-0.11, 0, 0.50), (-0.11, 0, 0.16), "thigh.R"),
        ("foot.R", (-0.11, 0, 0.16), (-0.11, -0.24, 0.04), "shin.R"),
    ]


# Which mesh part follows which bone.
PART_BONES = {
    "coat": "root",
    "hem": "root",
    "cape": "chest",
    "belt": "root",
    "buckle": "root",
    "satchel": "root",
    "neck": "chest",
    "head": "head",
    "hat_brim": "head",
    "hat_crown": "head",
    "hat_band": "head",
    "legL": "thigh.L",
    "legR": "thigh.R",
    "bootL": "foot.L",
    "bootR": "foot.R",
    "sleeveL": "arm.L",
    "sleeveR": "arm.R",
    "handL": "forearm.L",
    "handR": "forearm.R",
    "staff": "forearm.R",
    "pommel": "forearm.R",
    "warp0": "forearm.R",
    "warp1": "forearm.R",
    "warp2": "forearm.R",
    "crystal": "forearm.R",
}


def create_armature(name="weaver_rig"):
    import bpy

    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    edit_bones = arm_data.edit_bones
    made = {}
    for bone_name, head, tail, parent in _bones():
        bone = edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = made[parent]
        made[bone_name] = bone

    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def attach_to_bone(obj, arm_obj, bone_name):
    """Rigidly parent a mesh part to a bone."""
    import bpy
    from mathutils import Matrix

    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = arm_obj
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    bone = arm_obj.data.bones[bone_name]
    # Cancel the bone's rest transform so the part keeps its authored position.
    obj.matrix_parent_inverse = bone.matrix_local.inverted()
    obj.matrix_world = world
    bpy.context.view_layer.update()


def animate(arm_obj, fps=24):
    """Author the four locomotion clips as four separate named actions.

    Each clip gets its own action, keyed on frames that start at zero for that
    action, which is what lets the glTF exporter emit one animation per clip and
    lets three.js address them by name.
    """
    import bpy

    scene = bpy.context.scene
    bones = arm_obj.pose.bones
    for pb in bones:
        pb.rotation_mode = "XYZ"

    def reset():
        for pb in bones:
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.location = (0.0, 0.0, 0.0)

    def put(name, rx=0.0, ry=0.0, rz=0.0, loc=(0.0, 0.0, 0.0)):
        pb = bones[name]
        pb.rotation_euler = (rx, ry, rz)
        pb.location = loc

    def pose_idle(t):
        breath = math.sin(t * math.tau)
        shift = math.sin(t * math.pi)
        put("chest", rx=-0.03 * breath)
        put("spine", rx=0.02 * breath)
        put("root", rz=0.02 * shift, loc=(0.012 * shift, 0, 0))
        put("head", ry=0.05 * shift)
        put("shoulder.L", rx=0.03 * breath)
        put("shoulder.R", rx=0.03 * breath)
        put("arm.L", rx=-0.04 * breath)
        put("forearm.R", rx=-0.10 + 0.03 * breath)
        put("forearm.L", rx=-0.16 + 0.03 * breath)

    def pose_walk(t):
        swing = math.sin(t * math.tau)
        bob = abs(math.cos(t * math.tau))
        put("root", loc=(0, 0, -0.035 * bob))
        put("spine", rx=0.06)
        put("chest", ry=0.05 * swing)
        put("thigh.L", rx=0.62 * swing)
        put("shin.L", rx=-0.85 * max(0.0, math.sin(t * math.tau + 1.1)))
        put("foot.L", rx=0.28 * math.sin(t * math.tau + 0.4))
        put("thigh.R", rx=-0.62 * swing)
        put("shin.R", rx=-0.85 * max(0.0, math.sin(t * math.tau + 1.1 + math.pi)))
        put("foot.R", rx=0.28 * math.sin(t * math.tau + 0.4 + math.pi))
        put("arm.L", rx=-0.42 * swing)
        put("shoulder.L", ry=0.10)
        put("arm.R", rx=0.34 * swing)
        put("forearm.R", rx=-0.28)
        put("forearm.L", rx=-0.22)
        put("head", ry=-0.04 * swing)

    def pose_run(t):
        swing = math.sin(t * math.tau)
        bob = abs(math.cos(t * math.tau))
        put("root", rx=0.12, loc=(0, 0, -0.07 * bob))
        put("spine", rx=0.10)
        put("chest", ry=0.08 * swing)
        put("thigh.L", rx=1.05 * swing)
        put("shin.L", rx=-1.35 * max(0.0, math.sin(t * math.tau + 1.0)))
        put("foot.L", rx=0.42 * math.sin(t * math.tau + 0.35))
        put("thigh.R", rx=-1.05 * swing)
        put("shin.R", rx=-1.35 * max(0.0, math.sin(t * math.tau + 1.0 + math.pi)))
        put("foot.R", rx=0.42 * math.sin(t * math.tau + 0.35 + math.pi))
        put("arm.L", rx=-0.85 * swing)
        put("shoulder.L", ry=0.18)
        put("arm.R", rx=0.62 * swing)
        put("forearm.R", rx=-0.95)
        put("forearm.L", rx=-0.85)
        put("head", rx=-0.10, ry=-0.06 * swing)

    def pose_turn(t):
        shift = math.sin(t * math.tau)
        put("root", rz=0.07 * shift, loc=(0.02 * shift, 0, -0.02))
        put("spine", rz=0.05 * shift)
        put("chest", ry=0.10 * shift)
        put("head", ry=-0.12 * shift)
        put("thigh.L", rx=0.16 * shift)
        put("thigh.R", rx=-0.10 * shift)
        put("arm.L", rx=-0.14 * shift)
        put("arm.R", rx=0.10 * shift)
        put("forearm.R", rx=-0.30)

    clips = [("idle", 72, pose_idle), ("walk", 24, pose_walk),
             ("run", 16, pose_run), ("turn", 20, pose_turn)]

    for clip_name, frames, pose in clips:
        action = bpy.data.actions.new(clip_name)
        arm_obj.animation_data_create()
        arm_obj.animation_data.action = action
        for index in range(frames):
            scene.frame_set(index + 1)
            reset()
            pose(index / frames)
            for pb in bones:
                pb.keyframe_insert(data_path="rotation_euler", frame=index + 1)
                pb.keyframe_insert(data_path="location", frame=index + 1)
        print(f"ANIM {clip_name} frames={frames}")

    # Leave the rig in the idle pose.
    scene.frame_set(1)
    reset()
    return [name for name, _, _ in clips]


def export_weaver_animated(filepath, fps=24):
    """Rig, animate and export the Weaver as a single animated GLB."""
    import bpy

    from weaver import build_weaver_parts_rigid

    parts = build_weaver_parts_rigid()
    arm_obj = create_armature()

    for part in parts:
        attach_to_bone(part, arm_obj, PART_BONES.get(part.name, "root"))

    animate(arm_obj, fps=fps)

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"EXPORTED {filepath}")
