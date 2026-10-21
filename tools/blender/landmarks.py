"""Region landmarks — one hero structure per region.

Each is built to read as a strong silhouette from a distance, using the same
material vocabulary as the rest of the world: wind-carved stone, pale ceramic,
weathered copper, dark metal and translucent glass.
"""

import math

from common import box, join_objects, lathe, loft, new_mesh, ring, rippled_slab, shade_flat, torus, tube


def _boulder(name, centre, radius, height, mat, seed=0):
    """A wind-carved stone: an irregular, faceted lump."""
    cx, cy, cz = centre
    sections = []
    steps = 5
    for i in range(steps + 1):
        t = i / steps
        # Tapered top and bottom with a slight waist reads as eroded rock.
        scale = (1 - t) ** 0.6 * 0.9 + 0.1
        jitter = 0.82 + 0.28 * math.sin(seed * 1.7 + t * 5.3)
        r = radius * scale * jitter
        sections.append(
            ring(cx + 0.08 * math.sin(seed + t * 3), cy + 0.08 * math.cos(seed * 2 + t * 2),
                 cz + t * height, r, r * 0.82, 7, rotation=seed * 0.4)
        )
    verts, faces = loft(sections)
    return new_mesh(name, verts, faces, [mat])


def build_synthesis_tree():
    """The Synthesis Tree: living wood, copper circuitry and an unfinished loom."""
    parts = []

    # Trunk: stacked, tapering sections with a slight organic lean.
    # A mature trunk: sturdy, tapering gradually, and ending in a crown rather
    # than a point, so the silhouette reads as a tree and not a cone.
    trunk_profile = [
        (0.0, 2.40, 2.40),
        (2.5, 2.25, 2.25),
        (5.5, 2.05, 2.05),
        (8.5, 1.85, 1.85),
        (11.5, 1.68, 1.68),
        (14.0, 1.52, 1.52),
        (16.0, 1.38, 1.38),
        (17.4, 1.30, 1.30),
    ]
    verts, faces = tube(trunk_profile, 9)
    parts.append(new_mesh("trunk", verts, faces, ["copper_dark"]))

    # Buttress roots so the trunk meets the ground instead of intersecting it.
    for i in range(6):
        angle = (i / 6) * math.tau
        root_profile = [
            (0.0, 0.42, 0.42),
            (1.1, 0.36, 0.36),
            (2.6, 0.20, 0.20),
            (3.6, 0.07, 0.07),
        ]
        rv, rf = tube(root_profile, 7, centre=(math.cos(angle) * 2.2, math.sin(angle) * 2.2))
        root = new_mesh(f"root{i}", rv, rf, ["copper_dark"])
        parts.append(root)

    # Two tiers of branches forming a canopy silhouette, each thick enough to
    # read from across the region rather than as spikes.
    # Six heavy primary limbs, short and thick so they read as arms rather than
    # spikes. They rise, then flatten out toward the canopy.
    for i in range(6):
        angle = (i / 6) * math.tau + 0.2
        length = 6.4 + (i % 2) * 1.1
        sections = []
        for t in (0.0, 0.3, 0.65, 1.0):
            r = 0.92 * (1 - t * 0.55) + 0.14
            sections.append(ring(
                math.cos(angle) * length * t,
                math.sin(angle) * length * t,
                9.0 + 3.4 * t - 1.4 * t * t,
                r, r, 8,
            ))
        bv, bf = loft(sections)
        parts.append(new_mesh(f"limb{i}", bv, bf, ["copper"]))

        # a smaller fork off each limb
        fork_angle = angle + 0.55
        fork = []
        for t in (0.0, 0.5, 1.0):
            r = 0.40 * (1 - t * 0.6) + 0.08
            fork.append(ring(
                math.cos(angle) * length * 0.6 + math.cos(fork_angle) * 2.8 * t,
                math.sin(angle) * length * 0.6 + math.sin(fork_angle) * 2.8 * t,
                11.5 + 1.5 * t,
                r, r, 6,
            ))
        fv, ff = loft(fork)
        parts.append(new_mesh(f"fork{i}", fv, ff, ["copper"]))

    # The canopy is a woven crown: broad ceramic plates on copper arms, which is
    # the loom this tree was never finished on. Flat plates read as a canopy
    # mass from a distance where thin limbs would read as spikes.
    crown_z = 14.6
    for i in range(14):
        angle = (i / 14) * math.tau
        radius = 4.2 if i % 2 else 7.8
        plate = lathe(
            [(0.0, 2.30, 1.45), (0.22, 2.65, 1.65), (0.50, 2.10, 1.30)],
            6, rotation=i * 0.5,
        )
        pv, pf = plate
        obj = new_mesh(f"plate{i}", pv, pf, ["ceramic"])
        obj.location = (
            math.cos(angle) * radius,
            math.sin(angle) * radius,
            crown_z + 0.9 * math.sin(i * 1.7),
        )
        obj.rotation_euler = (0.34 * math.cos(angle), 0.34 * math.sin(angle), angle)
        parts.append(obj)

    # a denser inner ring so the canopy has mass at its centre
    for i in range(7):
        angle = (i / 7) * math.tau + 0.5
        plate = lathe([(0.0, 2.60, 1.65), (0.24, 2.95, 1.85), (0.5, 2.30, 1.45)], 6, rotation=i)
        pv, pf = plate
        obj = new_mesh(f"core{i}", pv, pf, ["ceramic"])
        obj.location = (math.cos(angle) * 2.4, math.sin(angle) * 2.4, crown_z + 1.6)
        obj.rotation_euler = (0.3 * math.cos(angle), 0.3 * math.sin(angle), angle)
        parts.append(obj)

    # copper thread wound around the crown
    cv, cf = torus(major=6.6, minor=0.13, z=crown_z - 0.4, major_segments=30, minor_segments=5)
    parts.append(new_mesh("crownring", cv, cf, ["copper"]))

    # Copper thread rings — the loom the tree was never finished on.
    for i, (z, r) in enumerate(((4.2, 2.55), (6.6, 2.35), (9.0, 2.15))):
        rv, rf = torus(major=r, minor=0.11, z=z, major_segments=28, minor_segments=6)
        parts.append(new_mesh(f"loomring{i}", rv, rf, ["copper"]))

    # No crossbeam here.
    #
    # It used to be here: a 52-unit bar at the canopy's height, 20.4 up. The
    # tapestry hangs from a beam of exactly that size and that position, and
    # the tapestry is drawn in code now — `UnfinishedTapestry` in
    # `World.tsx` puts its own beam at (0, 20.4, 0) with the same 52 × 0.7 ×
    # 0.7. So the bar was drawn twice, in the same place, and the two copies
    # z-fought.
    #
    # It was also the only thing here that still cast. The tapestry's
    # procedural copy was taken out of the shadow pass years ago, because it
    # dropped a hard, fifty-percent-dark band straight across the middle of
    # the hub. The copy in this model was never taken out, so the band never
    # went: measured at the hub, the band across the sand read 94.9 luma with
    # it and 132.6 without, at the same camera.
    #
    # And it was the only oversized box in this file, and it stretched the
    # tree's bounding box to three times the width of its canopy, so the
    # preview render framed the whole tree into a corner of the frame.
    #
    # (The coordinates read as `centre = (x, y, z)` with z as the height,
    # because this project uses a game-like convention inside Blender rather
    # than Blender's own Z-up one. The glTF exporter's rotation then puts
    # that height into glTF's y, which is where the game reads it.)

    tree = join_objects(parts, "synthesis_tree")
    shade_flat(tree)
    return tree


def build_tapestry():
    """The enormous unfinished tapestry the Weaver wakes beneath."""
    parts = []
    panels = 14
    spacing = 3.4
    start = -((panels - 1) / 2) * spacing
    for i in range(panels):
        x = start + i * spacing
        # Slight sag between the crossbeam and the loom frame.
        sag = 0.5 * math.cos((i / (panels - 1)) * math.pi)
        parts.append(
            box(f"panel{i}", (x, sag * 0.6, 17.6), (3.05, 0.10, 4.6), ["ceramic"])
        )

    # loom frame at one end
    frame_sections = []
    for z, r in [(11.4, 0.42), (16.0, 0.42), (21.4, 0.42)]:
        frame_sections.append(ring(26.0, 0.0, z, r, r, 8))
    fv, ff = loft(frame_sections)
    parts.append(new_mesh("loom_frame", fv, ff, ["copper"]))

    tapestry = join_objects(parts, "tapestry")
    shade_flat(tapestry)
    return tapestry


def build_console():
    """The puzzle console: a plinth carrying a floating weave-ring."""
    parts = []

    base_profile = [
        (0.0, 1.9, 1.9),
        (0.35, 1.75, 1.75),
        (0.75, 1.5, 1.5),
        (1.05, 1.42, 1.42),
    ]
    verts, faces = tube(base_profile, 6)
    parts.append(new_mesh("base", verts, faces, ["stone"]))

    parts.append(box("plinth", (0.0, 0.0, 1.15), (1.5, 1.5, 0.25), ["ceramic"]))

    # the ring the puzzle mark floats inside
    rv, rf = torus(major=1.15, minor=0.07, z=2.1, major_segments=22, minor_segments=6)
    parts.append(new_mesh("ring", rv, rf, ["copper"]))

    # the mark itself — a crystal the player reads state from
    mark_sections = []
    for z, r in [(1.55, 0.18), (2.10, 0.62), (2.65, 0.18)]:
        mark_sections.append(ring(0, 0, z, r, r, 6, rotation=math.pi / 6))
    mv, mf = loft(mark_sections)
    parts.append(new_mesh("mark", mv, mf, ["coral"]))

    console = join_objects(parts, "console")
    shade_flat(console)
    return console


# ---------------------------------------------------------------------------
# Region landmarks
# ---------------------------------------------------------------------------


def _landmass(name, cx, cy, z, rx, ry, height, sides, seed, mat):
    """A coastline: an irregular, flat-topped plateau of raised land.

    A landmass was a six-sided cone, and eight cones on a table read as
    bread rolls rather than as continents. A map wants a coastline — an
    irregular outline — and a flat top, so that the raised land catches the
    light and reads as a plateau the sun is on.

    The outline is two sine frequencies on the radius, so no two landmasses
    share a shape and none of them is a regular polygon.
    """
    def outline(scale, phase, height_here):
        points = []
        for i in range(sides):
            a = (i / sides) * math.tau + phase
            r = (1.0
                 + 0.20 * math.sin(a * 2.0 + seed)
                 + 0.13 * math.sin(a * 3.0 - seed * 1.7)
                 + 0.07 * math.sin(a * 5.0 + seed * 0.6))
            points.append((
                cx + math.cos(a) * rx * r * scale,
                cy + math.sin(a) * ry * r * scale,
                z + height_here,
            ))
        return points

    sections = [
        outline(1.0, seed, 0.0),
        outline(0.96, seed + 0.05, height * 0.42),
        outline(0.84, seed + 0.13, height),
    ]
    verts, faces = loft(sections)
    return new_mesh(name, verts, faces, [mat])


def build_terrace_map():
    """The Cartographer's Terrace: a vast carved world map."""
    parts = []

    # Lifted off y = 0 for the same reason as the Gardens terraces: the ground
    # disc's top face is at y = 0, so a table whose underside sits exactly
    # there z-fights with the terrain and reads as a stain rather than a
    # raised surface. 0.5 clears it and leaves a shadow line underneath.
    LIFT = 0.5
    terrace = lathe([
        (LIFT + 0.0, 15.0, 15.0),
        (LIFT + 0.8, 15.2, 15.2),
        (LIFT + 1.2, 14.8, 14.8),
    ], 24)
    tv, tf = terrace
    # The table is the dark half of the map and the land is the pale half.
    #
    # Both were `stone` and `ceramic`, which are close enough in value that
    # the continents did not separate from the sea at all — the whole table
    # read as one cream disc with a few pale lumps on it. A darker sea and
    # pale land is the map convention, and it is the difference between a
    # table with rocks on it and a chart.
    parts.append(new_mesh("terrace", tv, tf, ["stone_dark"]))

    # Raised landmasses, deliberately irregular so it reads as a map.
    #
    # (x, y, radius, height, sides)
    #
    # The old list was eight cones between 1.4 and 3.4 units across on a
    # thirty-unit table — a fifth of the surface, in pale shapes on a pale
    # table, and they read as rocks. These are larger, flat-topped, and
    # spread across the whole table: two big masses, a chain between them,
    # and islands out at the edges. A map that leaves a third of its sea
    # empty does not read as a map.
    plates = [
        (-5.4, 3.6, 5.0, 1.5, 9),
        (4.6, -4.4, 4.4, 1.2, 8),
        (-1.2, 0.4, 3.0, 1.0, 8),
        (-9.8, -3.2, 2.6, 0.9, 7),
        (8.8, 5.4, 2.8, 1.0, 8),
        (2.2, 8.8, 2.2, 0.8, 7),
        (-2.6, -9.0, 2.0, 0.8, 7),
        (10.2, -1.2, 1.8, 0.6, 6),
        (-10.4, 2.6, 1.7, 0.7, 6),
        (5.4, 9.6, 1.6, 0.6, 6),
        (-6.6, 9.2, 1.5, 0.6, 6),
        (7.2, -9.4, 1.4, 0.6, 6),
        (0.6, -1.0, 1.3, 0.5, 6),
    ]
    for i, (x, y, r, h, sides) in enumerate(plates):
        part = _landmass(
            f"plate{i}", x, y, LIFT + 1.2, r, r * 0.78, h, sides,
            seed=0.7 + i * 1.31, mat="ceramic",
        )
        parts.append(part)

    map_model = join_objects(parts, "terrace_map")
    shade_flat(map_model)
    return map_model


def build_great_loom():
    """The Flow Foundry: a many-armed loom, a workshop scaled like a machine."""
    parts = []

    # frame
    parts.append(box("beam_low", (0.0, 0.0, 3.0), (16.0, 2.4, 1.6), ["metal"]))
    for side in (1, -1):
        parts.append(box(f"post{side}", (7.6 * side, 0.0, 6.0), (1.4, 1.4, 8.0), ["metal"]))

    # The crown the six arms hang from, and the column that carries it.
    #
    # Every arm converges on the axis at eight units, and there was nothing
    # there: no crown, no column, nothing. The arms hung from the air, and the
    # region that promises "a many-armed machine where each arm weaves its own
    # job" read as a post with six sticks on it. The column stands on the
    # weaving beam and the crown sits on the column, so the machine has a
    # spine: a thing that carries the arms has to be carried by something.
    parts.append(
        wavy_lathe("column", [(2.6, 1.75), (7.0, 1.45)], sides=10, phase=2.2, amp=0.05, mat="metal")
    )
    parts.append(
        wavy_lathe("crown", [(6.9, 2.15), (8.1, 2.85), (9.0, 2.30)], sides=12, phase=0.4, amp=0.06, mat="metal")
    )
    # A copper collar where the crown meets the column, so the joint reads as
    # a joint rather than as two shapes that happen to touch.
    collar = lathe([(6.85, 1.85, 1.85), (7.15, 1.85, 1.85)], 12)
    cv, cf = collar
    parts.append(new_mesh("collar", cv, cf, ["copper"]))

    # Six arms, each weaving its own job.
    #
    # They used to radiate from the crown like a star, which put their tips
    # seven to nine units out in six directions — where there is no thread to
    # weave and nothing to land on. A loom's arms arch over the warp and come
    # down on it, each at its own place along it, and that is what "each arm
    # weaves its own job" means.
    for i in range(6):
        span = 6.4 - abs(i - 2.5) * 1.15
        side = 1 if i % 2 == 0 else -1
        # Where this arm's shuttle lands on the warp.
        tip = (span * (-1 if i < 3 else 1), side * 0.82, 4.35)
        sections = []
        for t in (0.0, 0.35, 0.72, 1.0):
            # Out slowly, down faster: the shape of an arm reaching over.
            reach = t ** 1.6
            z = 8.0 + (tip[2] - 8.0) * (t ** 0.75)
            r = 0.62 - t * 0.36
            sections.append(ring(tip[0] * reach, tip[1] * reach, z, r, r, 6))
        av, af = loft(sections)
        parts.append(new_mesh(f"arm{i}", av, af, ["copper"]))

        # the shuttle at the tip of each arm
        parts.append(box(f"shuttle{i}", tip, (1.0, 0.62, 0.46), ["copper_dark"]))

    # The threads: what the loom is for.
    #
    # The region promises "thread beams" and the model had none — there was
    # nothing between an arm and the beam below it. A warp of copper strands
    # now runs the length of the weaving beam, and the six shuttles ride over
    # it, which is the whole of what the region says the machine does.
    for j in range(15):
        y = -0.90 + j * 0.1285
        parts.append(box(f"thread{j}", (0.0, y, 3.85), (15.2, 0.055, 0.055), ["copper"]))

    # The water channel running beneath the loom.
    #
    # It was a box: a flat turquoise slab lying on the sand, thirty units long,
    # and the README measured its top face's local standard deviation at under
    # one luma. Four different mechanisms could not move it — the triplanar
    # stone patch at its own strength and at eight times it, the same patch
    # with the surface turned into a rough dielectric, and an ordinary UV
    # normal map — because a flat horizontal surface under a low sun gives a
    # tangent-space normal map almost nothing to modulate. The relief is in
    # the geometry now, which is the one of the three conditions the README
    # names that a model can actually supply.
    def water_surface(x, y):
        """The height of the water's surface, in the block's local space."""
        return (
            0.062 * math.sin(x * 1.15 + 0.4)
            + 0.034 * math.sin(x * 2.05 - 1.1)
            + 0.018 * math.sin(y * 0.9 + 0.7 + x * 0.33)
        )

    parts.append(
        rippled_slab(
            # 29.4, not 30: the end walls stand at 14.6 and the water runs a
            # little past them, so the wall's inner face is *inside* the water
            # rather than in the same plane as the water's own end. Coplanar
            # faces z-fight, and the end of the channel was the one place the
            # water showed its cross-section.
            "channel", (0.0, 0.0, 0.2), (29.4, 3.2, 0.7), ["water"],
            water_surface, segments=(40, 4),
        )
    )
    # The stone banks the water runs between. The channel used to end in a
    # cut edge on the sand, which is what a painted slab looks like; a lip of
    # stone says the water is *in* something.
    for side in (1, -1):
        parts.append(
            box(f"bank{side}", (0.0, 1.78 * side, 0.39), (30.0, 0.36, 0.78), ["stone_dark"])
        )
    # And the trough is closed at both ends, so the water does not end in a
    # cut face of turquoise. The walls sit *inside* the channel's length, so
    # the landmark's footprint does not grow and the collider that keeps the
    # player out of it stays the number it was measured to be.
    for side in (1, -1):
        parts.append(
            box(f"endwall{side}", (14.8 * side, 0.0, 0.39), (0.4, 3.2, 0.78), ["stone_dark"])
        )

    loom = join_objects(parts, "great_loom")
    shade_flat(loom)
    return loom


def build_council_city():
    """The City of Memory and Council: a dome ringed by archive towers."""
    parts = []

    podium = lathe([(0.0, 10.0, 10.0), (1.2, 10.2, 10.2), (4.0, 9.2, 9.2)], 16)
    pv, pf = podium
    parts.append(new_mesh("podium", pv, pf, ["ceramic"]))

    # dome
    dome_sections = []
    for i in range(7):
        t = i / 6
        angle = t * (math.pi / 2)
        r = math.cos(angle) * 7.4
        z = 4.0 + math.sin(angle) * 7.4
        dome_sections.append(ring(0, 0, z, r, r, 16))
    dv, df = loft(dome_sections, cap_start=False)
    parts.append(new_mesh("dome", dv, df, ["glass"]))

    # archive towers
    #
    # They were six-sided lathes: a hexagonal prism, so each of its six faces
    # was one flat quad taking one tone, and the towers were the flattest big
    # surfaces in the world — a **median local standard deviation of 3.9**
    # against the ground's 9.1, measured with a grid of small windows over
    # each surface. They are ten-sided and their rings vary in radius now, so
    # the faces have a surface and the silhouettes are not machined.
    for i in range(8):
        angle = (i / 8) * math.tau
        height = 6.0 + (i % 3) * 2.2
        obj = wavy_lathe(
            f"tower{i}",
            [(0.0, 1.9), (height, 1.7), (height + 0.4, 1.4)],
            sides=10, phase=0.7 + i * 1.31, amp=0.09, mat="stone",
        )
        obj.location = (math.cos(angle) * 13.0, math.sin(angle) * 13.0, 0)
        parts.append(obj)

        # a lit archive case on each tower
        parts.append(
            box(f"case{i}", (math.cos(angle) * 13.0, math.sin(angle) * 13.0, height * 0.55),
                (2.4, 2.4, 0.8), ["turquoise_soft"])
        )

    city = join_objects(parts, "council_city")
    shade_flat(city)
    return city


def build_cloud_harbour():
    """The Adaptation Workshop and Cloud Harbor: a bench and a sky frame."""
    parts = []

    # workshop
    parts.append(box("workshop", (-6.0, 0.0, 2.5), (9.0, 9.0, 5.0), ["copper"]))
    parts.append(box("workshop_roof", (-6.0, 0.0, 5.3), (10.0, 10.0, 0.6), ["copper_dark"]))
    parts.append(box("door", (-6.0, -4.6, 1.6), (2.2, 0.3, 3.2), ["ceramic"]))

    # masts and the crane arm
    for i in range(3):
        parts.append(box(f"mast{i}", (7.0, (i - 1) * 3.0, 9.0 + i * 4.0), (0.6, 0.6, 18.0), ["metal"]))
    parts.append(box("crane", (3.0, 0.0, 17.0), (16.0, 0.6, 0.6), ["copper"]))

    # payloads hanging from the crane
    for i in range(4):
        parts.append(
            box(f"payload{i}", (0.5 + i * 2.2, 0.0, 15.4 - (i % 2) * 1.2), (1.3, 1.3, 1.3), ["ceramic"])
        )

    harbour = join_objects(parts, "cloud_harbour")
    shade_flat(harbour)
    return harbour


def _wavy_ring(radius, z, sides, phase, amp):
    """One ring whose radius is modulated, so a face built from it is not flat.

    A lathe's rings are perfect circles, and a face lofted between two of them
    is a smooth cone: every point on it has the same normal within a facet, so
    the whole face takes one tone. Measured with a grid of small windows over
    the surface, the Collective Gardens' terrace face came out at a **median
    local standard deviation of 3.5** against the sand's 9.1 — a wall with no
    surface on it — and the Council's archive towers at **3.9**.

    The radius here varies with the angle, and each ring carries its own
    phase, so the wall undulates around its circumference as well as up it.
    That is what a face needs to break a tone: not a texture, which a low sun
    barely modulates, but normals that are not all the same.

    `amp` is in world units, not a fraction: a tenth of a unit is a tenth of
    a unit on a two-unit tower and on a fifteen-unit terrace alike, and a
    fraction of the radius would give the tower nothing at all.
    """
    points = []
    for i in range(sides):
        a = (i / sides) * math.tau
        r = radius + amp * (0.62 * math.sin(a * 3.0 + phase) + 0.38 * math.sin(a * 5.0 - phase * 1.7))
        points.append((math.cos(a) * r, math.sin(a) * r, z))
    return points


def wavy_lathe(name, profile, sides=10, phase=0.0, amp=0.08, mat="stone"):
    """A lathe whose rings vary in radius, so the faces between them are not flat.

    `profile` is a sequence of (z, radius) pairs, the same shape `lathe` takes.
    """
    sections = [
        _wavy_ring(r, z, sides, phase + i * 1.9, amp)
        for i, (z, r) in enumerate(profile)
    ]
    verts, faces = loft(sections)
    return new_mesh(name, verts, faces, [mat])


def build_garden_terrace(name, z0, z1, r0, r1, sides=28, seed=0.0, mat="stone_dark"):
    """One terraced bed's retaining wall: three rings, and none of them flat."""
    sections = [
        _wavy_ring(r0, z0, sides, seed, 0.18),
        _wavy_ring(r0 - (r0 - r1) * 0.55, z0 + (z1 - z0) * 0.55, sides, seed + 1.7, 0.26),
        _wavy_ring(r1, z1, sides, seed + 3.1, 0.15),
    ]
    verts, faces = loft(sections)
    return new_mesh(name, verts, faces, [mat])


def build_collective_gardens():
    """The Collective Gardens: terraced beds and mechanical flowers."""
    parts = []

    # The terraces start at z = 0.6, not 0. The ground disc's top face is also
    # at y = 0, so a terrace whose base ring sits exactly there is coplanar
    # with the terrain: it z-fights, and from a standing camera the whole
    # landmark reads as a flat brown patch with no steps at all. Lifting it
    # clears the ground and leaves a visible lip beneath the lowest bed.
    BASE = 0.6
    STEP = 1.9
    for i in range(4):
        terrace = build_garden_terrace(
            f"terrace{i}",
            BASE + i * STEP,
            BASE + (i + 1) * STEP,
            15.0 - i * 2.6,
            15.0 - i * 2.6 - 1.3,
            seed=1.3 + i * 2.7,
        )
        parts.append(terrace)

    def bed_height(distance):
        """Height of the terrace surface at a given radius.

        The terraces are four nested frusta, and each one leaves an annular
        bed behind: the frustum's *top disc* sits at BASE + (i+1)*STEP with a
        radius of 15.0 - 1.3 - i*2.6, and the next frustum stands on it. So
        the surface at a radius is the height of the **highest** frustum whose
        top disc covers that radius — the last match, not the first.

        It was the first match, and it put everything at the height of the
        lowest bed. Measured against the stack: the flowers at radii 5.0, 7.6
        and 10.2 were placed 5.70, 3.80 and 1.90 units **under** the surface
        they were meant to stand on, and only the four on the outer bed were
        ever visible. The gardens' restoration effect is the flowers opening,
        and three quarters of them were in the ground.
        """
        height = BASE
        for i in range(4):
            r = 15.0 - 1.3 - i * 2.6
            if distance <= r:
                height = BASE + (i + 1) * STEP
        return height

    # The beds themselves: a band of soil on each terrace's top ring, so the
    # mound is a garden and not one pale mass with a few flowers on it. The
    # ring a terrace leaves exposed is exactly 1.3 wide, because the next
    # frustum stands on it.
    for i in range(4):
        r_outer = 15.0 - 1.3 - i * 2.6 - 0.25
        z = BASE + (i + 1) * STEP
        if i == 3:
            # The innermost bed is a disc, not a ring.
            soil = lathe([(z + 0.02, r_outer, r_outer), (z + 0.16, 0.5, 0.5)], 20)
        else:
            soil = lathe([(z + 0.02, r_outer, r_outer), (z + 0.16, r_outer - 1.3, r_outer - 1.3)], 20)
        sv, sf = soil
        parts.append(new_mesh(f"bed{i}", sv, sf, ["moss"]))

    # Pots and a pipe run, which is what the region says it has: "mossy
    # turbines, pale ceramic pots, copper pipes". Only the turbines were in the
    # model, so the description was a promise the island did not keep.
    pot_spots = [
        (12.4, 0.0), (12.4, 2.1), (9.8, 1.3), (9.8, 4.4),
        (7.2, 2.8), (7.2, 5.5), (3.0, 0.9), (3.0, 3.7),
    ]
    for i, (distance, angle) in enumerate(pot_spots):
        x = math.cos(angle) * distance
        y = math.sin(angle) * distance
        z = bed_height(distance) + 0.16
        pot = lathe([
            (z, 0.42, 0.42), (z + 0.55, 0.60, 0.60), (z + 0.78, 0.66, 0.66), (z + 0.92, 0.58, 0.58),
        ], 8)
        pv, pf = pot
        p_obj = new_mesh(f"pot{i}", pv, pf, ["ceramic"])
        p_obj.location = (x, y, 0)
        parts.append(p_obj)

    # A copper pipe following the outer bed, and one following the second.
    for i in (0, 1):
        r = 15.0 - 1.3 - i * 2.6 - 0.65
        z = BASE + (i + 1) * STEP + 0.3
        pipe = torus(major=r, minor=0.13, z=z, major_segments=28, minor_segments=5)
        tv, tf = pipe
        parts.append(new_mesh(f"pipe{i}", tv, tf, ["copper"]))

    # flowers: stem, bud, petals
    for i in range(16):
        angle = (i / 16) * math.tau
        distance = 5.0 + (i % 4) * 2.6
        x = math.cos(angle) * distance
        y = math.sin(angle) * distance
        z = bed_height(distance)

        stem = lathe([(z, 0.09, 0.09), (z + 1.1, 0.07, 0.07)], 5)
        sv, sf = stem
        s_obj = new_mesh(f"stem{i}", sv, sf, ["moss"])
        s_obj.location = (x, y, 0)
        parts.append(s_obj)

        petals = lathe([(z + 1.1, 0.1, 0.1), (z + 1.35, 0.44, 0.44), (z + 1.5, 0.14, 0.14)], 6)
        pv, pf = petals
        p_obj = new_mesh(f"bloom{i}", pv, pf, ["leaf"] if i % 3 else ["coral"])
        p_obj.location = (x, y, 0)
        parts.append(p_obj)

    # moss-covered turbines at the terrace edges
    for i in range(4):
        angle = (i / 4) * math.tau + 0.4
        distance = 13.0
        x = math.cos(angle) * distance
        y = math.sin(angle) * distance
        turbine = lathe([(0.0, 0.9, 0.9), (2.2, 0.7, 0.7), (2.8, 1.1, 1.1)], 8)
        tv, tf = turbine
        t_obj = new_mesh(f"turbine{i}", tv, tf, ["moss"])
        # Seated on the bed they stand on, so none of them float.
        t_obj.location = (x, y, bed_height(distance))
        parts.append(t_obj)

    gardens = join_objects(parts, "collective_gardens")
    shade_flat(gardens)
    return gardens


def build_observer_mirrors():
    """The Observer's Mirrors: great lenses facing an engraved test scene."""
    parts = []

    plinth = lathe([(0.0, 13.0, 13.0), (0.8, 13.2, 13.2)], 24)
    pv, pf = plinth
    parts.append(new_mesh("plinth", pv, pf, ["stone"]))

    # The test scene the lenses look at, in the middle of the plinth.
    #
    # It was built seven units south of the centre, which put it right up
    # against the two lenses on that side — the nearest one 1.5 units away,
    # inside its own base. A scene a lens is standing on is not a scene it
    # can look at.
    scene_centre = [0.0, 0.0]
    for i in range(7):
        x = (i % 4) * 1.9 - 2.8
        y = (i // 4) * 1.9 - 1.0
        height = 1.2 + (i % 3) * 0.7
        scene_centre[0] += x
        scene_centre[1] += y
        parts.append(box(f"scene{i}", (x, y, 0.8 + height / 2),
                         (1.3, 1.3, height), ["stone_dark"]))
    scene_centre[0] /= 7
    scene_centre[1] /= 7

    # Five standing lenses on a ring, each turned to look at the scene.
    #
    # They were not turned at all. Every lens stood square to the world
    # axes, so from any viewpoint some were face-on and some edge-on, and
    # none of them looked at anything: a ring of five was five slabs
    # scattered around a plinth, and a mirror facing the wrong way is not a
    # mirror. A lens is a slab whose thickness runs along its local x, so
    # the face normal is local +x and a turn about z aims it.
    for i in range(5):
        angle = (i / 5) * math.tau
        x = math.cos(angle) * 9.0
        y = math.sin(angle) * 9.0
        turn = math.atan2(scene_centre[1] - y, scene_centre[0] - x)
        normal = (math.cos(turn), math.sin(turn))
        parts.append(box(f"frame{i}", (x, y, 3.4), (0.35, 3.6, 6.4), ["metal"],
                         rotation=(0.0, 0.0, turn)))
        # The lens itself, a plate on each face of its frame.
        #
        # It used to be placed 1.5% towards the origin, which put it *inside*
        # the 0.35-unit frame: 658 pixels of a five-million-pixel frame showed
        # it at all. A lens buried in its own frame is a frame.
        #
        # Both faces, because a lens the player can only see from behind is
        # no use — and a ring of lenses is meant to be walked around.
        for side in (-1, 1):
            offset = side * (0.35 / 2 + 0.12 / 2 - 0.01)
            parts.append(box(f"glass{i}_{side}", (x + normal[0] * offset,
                                                 y + normal[1] * offset, 3.4),
                             (0.12, 3.2, 6.0), ["glass"],
                             rotation=(0.0, 0.0, turn)))
        # And a pedestal to stand on. The size tuple's height and depth were
        # the wrong way round, so the "foot" was a 3.9-unit bar lying across
        # the plinth instead of a block under the lens, and the lens stood
        # 1.6 units in the air above it.
        parts.append(box(f"foot{i}", (x, y, 0.8), (1.2, 1.6, 6.4), ["stone_dark"],
                         rotation=(0.0, 0.0, turn)))

    mirrors = join_objects(parts, "observer_mirrors")
    shade_flat(mirrors)
    return mirrors


def build_living_valley():
    """The Valley of Living Machines: a pump workshop cut into the cliff."""
    parts = []

    # pump body
    body = lathe([
        (0.0, 4.0, 4.0), (1.0, 3.6, 3.6), (2.6, 3.2, 3.2),
        (3.4, 2.6, 2.6), (4.4, 1.8, 1.8), (5.6, 1.6, 1.6),
    ], 12)
    bv, bf = body
    parts.append(new_mesh("pump", bv, bf, ["copper"]))

    # motor housing
    motor = lathe([(5.6, 2.2, 2.2), (7.0, 2.2, 2.2), (7.4, 1.6, 1.6)], 10)
    mv, mf = motor
    parts.append(new_mesh("motor", mv, mf, ["metal"]))

    # pipework: the sensors this valley is read through
    for i in range(6):
        z = 1.6 + (i % 2) * 1.6
        y = -3.0 - (i // 2) * 1.4
        pipe = lathe([(0.0, 0.45, 0.45), (7.0, 0.45, 0.45)], 8)
        pv, pf = pipe
        obj = new_mesh(f"pipe{i}", pv, pf, ["copper"])
        obj.rotation_euler = (math.pi / 2, 0, 0)
        obj.location = (0.0, y, z)
        parts.append(obj)

        # the sensor head on each run
        parts.append(box(f"sensor{i}", (2.4, y, z), (0.7, 0.9, 0.9), ["turquoise_soft"]))

    # basin the water rises into
    basin = lathe([(0.0, 7.0, 5.0), (1.2, 6.6, 4.6)], 16)
    sv, sf = basin
    b_obj = new_mesh("basin", sv, sf, ["stone_dark"])
    b_obj.location = (0.0, 8.0, 0.0)
    parts.append(b_obj)

    valley = join_objects(parts, "living_valley")
    shade_flat(valley)
    return valley