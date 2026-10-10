"""Shared geometry helpers for ILMEK asset generation.

Everything is built from lofted cross-sections and lathed profiles so the result
is clean, predictable low-poly geometry rather than primitives stacked by eye.
Run through `build_assets.py`; this module is imported, not run directly.
"""

import math

import bpy
from mathutils import Matrix, Vector
from mathutils import noise as mnoise

# ---------------------------------------------------------------------------
# Scene / collection helpers
# ---------------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # The factory reset deletes every material, so the cache must be cleared or
    # later assets would hold freed StructRNA references.
    MATERIALS.clear()


def get_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def set_collection(name):
    coll = get_collection(name)
    layer = bpy.context.view_layer.layer_collection.children.get(name)
    if layer:
        bpy.context.view_layer.active_layer_collection = layer


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

# Palette from the game's art direction: midnight blue, turquoise, sandstone,
# copper and a restrained coral accent.
PALETTE = {
    "stone": (0.66, 0.58, 0.47),
    "stone_dark": (0.40, 0.35, 0.29),
    "ceramic": (0.88, 0.84, 0.76),
    "copper": (0.72, 0.42, 0.22),
    "copper_dark": (0.42, 0.24, 0.13),
    "metal": (0.14, 0.16, 0.21),
    "glass": (0.55, 0.80, 0.84),
    "turquoise": (0.24, 0.71, 0.70),
    "coral": (0.82, 0.36, 0.27),
    "moss": (0.42, 0.55, 0.32),
    "leaf": (0.48, 0.72, 0.34),
    "cloth": (0.14, 0.19, 0.29),
    "cloth_light": (0.21, 0.28, 0.40),
    "leather": (0.36, 0.25, 0.18),
    "skin": (0.80, 0.63, 0.49),
    "felt": (0.40, 0.27, 0.18),
    "water": (0.20, 0.62, 0.70),
}

MATERIALS = {}


def material(name, **kwargs):
    """Create (or reuse) a Principled material."""
    if name in MATERIALS:
        return MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    for key, value in kwargs.items():
        if key == "color":
            bsdf.inputs["Base Color"].default_value = (*value, 1.0)
        elif key == "emission":
            bsdf.inputs["Emission Color"].default_value = (*value, 1.0)
        elif key == "emission_strength":
            bsdf.inputs["Emission Strength"].default_value = value
        elif key in ("metallic", "roughness"):
            bsdf.inputs[key.capitalize()].default_value = value
        elif key == "alpha":
            bsdf.inputs["Alpha"].default_value = value
            mat.blend_method = "BLEND"
    MATERIALS[name] = mat
    return mat


def build_materials():
    """Every material used across the asset set."""
    material("stone", color=PALETTE["stone"], roughness=0.92, metallic=0.0)
    material("stone_dark", color=PALETTE["stone_dark"], roughness=0.95, metallic=0.0)
    material("ceramic", color=PALETTE["ceramic"], roughness=0.82, metallic=0.0)
    material("copper", color=PALETTE["copper"], roughness=0.38, metallic=0.8)
    material("copper_dark", color=PALETTE["copper_dark"], roughness=0.5, metallic=0.7)
    material("metal", color=PALETTE["metal"], roughness=0.42, metallic=0.7)
    material("glass", color=PALETTE["glass"], roughness=0.12, metallic=0.1, alpha=0.42)
    material("turquoise", color=PALETTE["turquoise"], roughness=0.3, metallic=0.2,
             emission=PALETTE["turquoise"], emission_strength=0.9)
    material("turquoise_soft", color=PALETTE["turquoise"], roughness=0.35, metallic=0.1,
             emission=PALETTE["turquoise"], emission_strength=0.45)
    material("coral", color=PALETTE["coral"], roughness=0.45, metallic=0.1,
             emission=(0.5, 0.14, 0.08), emission_strength=0.35)
    material("moss", color=PALETTE["moss"], roughness=0.95)
    material("leaf", color=PALETTE["leaf"], roughness=0.85,
             emission=(0.12, 0.24, 0.06), emission_strength=0.2)
    material("cloth", color=PALETTE["cloth"], roughness=0.88)
    material("cloth_light", color=PALETTE["cloth_light"], roughness=0.85)
    material("leather", color=PALETTE["leather"], roughness=0.78)
    material("skin", color=PALETTE["skin"], roughness=0.9)
    material("felt", color=PALETTE["felt"], roughness=0.96)
    material("water", color=PALETTE["water"], roughness=0.18, metallic=0.15,
             emission=PALETTE["water"], emission_strength=0.5)


# ---------------------------------------------------------------------------
# Mesh construction
# ---------------------------------------------------------------------------


def new_mesh(name, verts, faces, mat_names, collection=None):
    """Build a mesh object from raw vertex/face lists."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    target = collection or bpy.context.collection
    target.objects.link(obj)

    for mat_name in mat_names:
        obj.data.materials.append(MATERIALS[mat_name])
    return obj


def loft(sections, closed_ring=True, cap_start=True, cap_end=True):
    """Loft a sequence of cross-sections into a tube.

    Each section is a list of 3D points; all sections must share a point count.
    Returns (verts, faces).
    """
    verts = []
    for section in sections:
        verts.extend([tuple(p) for p in section])

    count = len(sections[0])
    faces = []
    for s in range(len(sections) - 1):
        base_a = s * count
        base_b = (s + 1) * count
        limit = count if closed_ring else count - 1
        for i in range(limit):
            j = (i + 1) % count
            faces.append([base_a + i, base_a + j, base_b + j, base_b + i])

    if cap_start:
        faces.append(list(range(count - 1, -1, -1)))
    if cap_end:
        base = (len(sections) - 1) * count
        faces.append([base + i for i in range(count)])
    return verts, faces


def ring(cx, cy, z, rx, ry, sides=8, rotation=0.0, squash=1.0):
    """One elliptical cross-section, ready to loft."""
    points = []
    for i in range(sides):
        angle = (i / sides) * math.tau + rotation
        points.append((cx + math.cos(angle) * rx, cy + math.sin(angle) * ry * squash, z))
    return points


def tube(profile, sides=10, rotation=0.0, centre=(0.0, 0.0)):
    """Loft a profile of (z, rx, ry) tuples into a tapered tube."""
    cx, cy = centre
    sections = []
    for z, rx, ry in profile:
        sections.append(ring(cx, cy, z, rx, ry, sides, rotation))
    return loft(sections)


def torus(major, minor, z=0.0, cx=0.0, cy=0.0, major_segments=24, minor_segments=6):
    """A real ring.

    Lofting a single cross-section produces no faces at all, so rings must be
    revolved from a small circular profile instead.
    """
    verts = []
    faces = []
    for i in range(major_segments):
        a = (i / major_segments) * math.tau
        ring_cx = cx + math.cos(a) * major
        ring_cy = cy + math.sin(a) * major
        for j in range(minor_segments):
            b = (j / minor_segments) * math.tau
            r = major + math.cos(b) * minor
            verts.append((
                ring_cx + math.cos(a) * math.cos(b) * minor,
                ring_cy + math.sin(a) * math.cos(b) * minor,
                z + math.sin(b) * minor,
            ))
    for i in range(major_segments):
        for j in range(minor_segments):
            i2 = (i + 1) % major_segments
            j2 = (j + 1) % minor_segments
            faces.append([
                i * minor_segments + j,
                i2 * minor_segments + j,
                i2 * minor_segments + j2,
                i * minor_segments + j2,
            ])
    return verts, faces


def lathe(profile, sides=12, rotation=0.0):
    """Alias of tube with a clearer name for rotational forms."""
    return tube(profile, sides, rotation)


def box(name, centre, size, mat_names, rotation=(0.0, 0.0, 0.0), collection=None):
    cx, cy, cz = centre
    sx, sy, sz = (s / 2 for s in size)
    verts = [
        (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
    ]
    faces = [
        [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
        [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
    ]
    obj = new_mesh(name, verts, faces, mat_names, collection)
    obj.rotation_euler = rotation
    return obj


def join_objects(objects, name):
    """Merge meshes into one object so the export stays tidy."""
    objects = [o for o in objects if o is not None]
    if not objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = name
    return merged


def shade_flat(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def shade_smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def transform_obj(obj, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    obj.location = location
    obj.rotation_euler = rotation
    obj.scale = scale
    return obj


def export_glb(filepath, objects):
    """Export the given objects as a single GLB."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj is not None:
            obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
        # Vertex AO rides along in COLOR_0 and multiplies the base colour at
        # runtime. ACTIVE exports only the mesh's active colour layer, which is
        # the one `prepare_vertex_ao` creates. "NAME" also emits a second,
        # all-white COLOR_0 alongside the real data in COLOR_1, and three.js
        # reads COLOR_0 — so the bake would arrive as a layer nothing renders.
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=True,
    )
    print(f"EXPORTED {filepath}")


# ---------------------------------------------------------------------------
# Baked ambient occlusion
# ---------------------------------------------------------------------------

AO_COLOR_LAYER = "Col"


def _clear_other_colour_layers(mesh):
    """Keep only the AO layer, so repeat bakes never stack their results."""
    for attr in list(mesh.color_attributes):
        if attr.name != AO_COLOR_LAYER:
            mesh.color_attributes.remove(attr)


def prepare_vertex_ao(obj):
    """Add an all-white AO colour layer to a mesh, ready to be baked into."""
    if obj.type != "MESH" or obj.data is None:
        return None
    mesh = obj.data
    layer = mesh.color_attributes.get(AO_COLOR_LAYER)
    if layer is None:
        # FLOAT_COLOR, not BYTE_COLOR: AO is a shading multiplier and needs
        # headroom above 1.0 for the same reason an HDR probe does.
        layer = mesh.color_attributes.new(
            name=AO_COLOR_LAYER, type="FLOAT_COLOR", domain="CORNER"
        )
    _clear_other_colour_layers(mesh)
    # The exporter is configured to write the *active* colour layer, so the AO
    # layer has to be the active one or it is exported as nothing at all.
    mesh.color_attributes.active_color = layer
    mesh.color_attributes.render_color_index = 0

    # White = fully open. The bake only ever darkens.
    for element in layer.data:
        element.color = (1.0, 1.0, 1.0, 1.0)
    mesh.update()
    return layer


def bake_vertex_ao(obj, distance=1.6):
    """
    Ray-traced occlusion, written into a vertex colour layer.

    Why bake this when the scene has real lights and a shadow map:

    * It survives the **low quality tier**, which turns shadows off entirely.
      Without it, a low-tier player looks at landmarks that are lit but not
      touching their own geometry.
    * It darkens the *inside* of a form — under a roof, between two arms, in
      the crook of the tree. A shadow map does not do this: it only records
      where a light is blocked, not how enclosed a point is.
    * It costs nothing at runtime. The result is four floats per corner.

    Cycles is used rather than EEVEE because this is a ray-traced bake, not a
    screen-space effect, and EEVEE's approximation of it is not worth the
    inconsistency.
    """
    if prepare_vertex_ao(obj) is None:
        return False

    scene = bpy.context.scene
    engine = scene.render.engine
    # Baked occlusion must not depend on a light rig that is not in the file.
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    try:
        bpy.ops.object.bake(
            type="AO",
            # Blender 5.x renamed the AO reach from `ao_distance` and requires
            # `target` to name the vertex colour layer explicitly; the default
            # writes an image texture instead.
            target="VERTEX_COLORS",
            max_ray_distance=distance,
            # Typed as an int; a float raises before the bake starts.
            margin=1,
            use_clear=True,
        )
    except RuntimeError as exc:
        # A mesh with no UVs or a degenerate layout cannot be baked. That is
        # not fatal: the asset simply ships without AO, exactly as before.
        print(f"AO_BAKE_SKIPPED {obj.name}: {exc}")
        scene.render.engine = engine
        return False

    scene.render.engine = engine
    obj.data.update()
    return True


def mottle_vertex_tint(obj, scale=0.2, amount=0.12):
    """
    Multiply the baked AO layer by low-frequency noise, sampled in world space.

    Occlusion is the wrong tool for a large flat face. A thirty-unit terrace top
    is uniformly lit and uniformly unoccluded, so AO leaves it a single flat
    colour across metres of screen — which is exactly how it read before the
    detail map existed. The detail map gives such a face relief; it cannot vary
    the *tone*, and tone is what makes a surface look poured rather than cut.

    Two octaves, keyed to world position rather than object space, so adjacent
    pieces of the same material never line up into a shared pattern.

    The samples are normalised by the largest one that was actually produced, so
    `amount` means what it says: the swing is exactly +/-amount whatever range
    Blender's Perlin happens to return for a given seed. Relying on the raw
    range instead is how this silently becomes a no-op after a version bump.
    """
    if obj.type != "MESH" or obj.data is None:
        return False
    mesh = obj.data
    layer = mesh.color_attributes.get(AO_COLOR_LAYER)
    if layer is None:
        return False

    matrix = obj.matrix_world
    raw = []
    for vertex in mesh.vertices:
        p = matrix @ vertex.co
        coarse = mnoise.noise(Vector((p.x * scale, p.y * scale, p.z * scale)))
        fine = mnoise.noise(
            Vector((p.x * scale * 2.9 + 31.7, p.y * scale * 2.9, p.z * scale * 2.9 - 17.3))
        )
        raw.append(coarse * 0.72 + fine * 0.28)

    peak = max((abs(v) for v in raw), default=0.0)
    if peak <= 1e-6:
        return False
    tint = [1.0 + amount * (v / peak) for v in raw]

    for loop in mesh.loops:
        value = tint[loop.vertex_index]
        colour = layer.data[loop.index].color
        layer.data[loop.index].color = (
            colour[0] * value,
            colour[1] * value,
            colour[2] * value,
            colour[3],
        )
    mesh.update()
    print(f"MOTTLED {obj.name} tint={min(tint):.3f}..{max(tint):.3f}")
    return True