"""Region landmarks — one hero structure per region.

Each is built to read as a strong silhouette from a distance, using the same
material vocabulary as the rest of the world: wind-carved stone, pale ceramic,
weathered copper, dark metal and translucent glass.
"""

import math

from common import box, join_objects, lathe, loft, new_mesh, ring, shade_flat, torus, tube


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

    # Crossbeam that the tapestry hangs from.
    parts.append(box("crossbeam", (0.0, 0.0, 20.4), (52.0, 0.7, 0.7), ["copper_dark"]))

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
    parts.append(new_mesh("terrace", tv, tf, ["stone"]))

    # Raised landmasses, deliberately irregular so it reads as a map.
    plates = [
        (-4.0, 2.0, 3.4, 0.9), (2.6, -1.2, 2.4, 0.7), (5.5, 3.8, 1.8, 1.1),
        (-6.8, -4.2, 2.0, 0.6), (0.8, 5.6, 2.6, 0.8), (-2.4, -6.0, 1.6, 1.3),
        (7.8, -2.4, 1.4, 0.5), (-8.5, 2.6, 1.5, 0.9),
    ]
    for i, (x, y, r, h) in enumerate(plates):
        plate = lathe([(1.15, r, r * 0.85), (1.15 + h * 0.5, r * 0.85, r * 0.72),
                       (1.15 + h, r * 0.5, r * 0.42)], 6, rotation=i * 0.6)
        pv, pf = plate
        obj = new_mesh(f"plate{i}", pv, pf, ["ceramic"])
        obj.location = (x, y, LIFT)
        parts.append(obj)

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

    # six arms, each weaving its own job
    for i in range(6):
        angle = (i / 6) * math.tau
        length = 7.0 + (i % 3) * 2.0
        sections = []
        for t in (0.0, 0.5, 1.0):
            sections.append(ring(
                math.cos(angle) * length * t,
                math.sin(angle) * length * t,
                8.0 - t * 2.2,
                0.55 - t * 0.18, 0.55 - t * 0.18, 6,
            ))
        av, af = loft(sections)
        parts.append(new_mesh(f"arm{i}", av, af, ["copper"]))

        # shuttle at the tip of each arm
        parts.append(
            box(f"shuttle{i}", (math.cos(angle) * length, math.sin(angle) * length, 5.8),
                (1.1, 0.7, 0.5), ["copper_dark"])
        )

    # the water channel running beneath the loom
    parts.append(box("channel", (0.0, 0.0, 0.35), (30.0, 3.2, 0.7), ["water"]))

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
    for i in range(8):
        angle = (i / 8) * math.tau
        height = 6.0 + (i % 3) * 2.2
        tower = lathe([
            (0.0, 1.9, 1.9), (height, 1.7, 1.7), (height + 0.4, 1.4, 1.4),
        ], 6)
        tv, tf = tower
        obj = new_mesh(f"tower{i}", tv, tf, ["stone"])
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
        terrace = lathe([
            (BASE + i * STEP, 15.0 - i * 2.6, 15.0 - i * 2.6),
            (BASE + (i + 1) * STEP, 15.0 - i * 2.6 - 1.3, 15.0 - i * 2.6 - 1.3),
        ], 20)
        tv, tf = terrace
        parts.append(new_mesh(f"terrace{i}", tv, tf, ["stone_dark"]))

    def bed_height(distance):
        """Height of the terrace surface at a given radius."""
        for i in range(4):
            r = 15.0 - i * 2.6
            if distance <= r:
                return BASE + (i + 1) * STEP
        return BASE + 4 * STEP

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

    # the test scene the lenses look at
    for i in range(7):
        x = (i % 4) * 1.9 - 2.8
        y = (i // 4) * 1.9 - 1.0
        height = 1.2 + (i % 3) * 0.7
        parts.append(box(f"scene{i}", (x, y - 7.0, 0.8 + height / 2),
                         (1.3, 1.3, height), ["stone_dark"]))

    # five standing mirrors on a ring
    for i in range(5):
        angle = (i / 5) * math.tau
        x = math.cos(angle) * 9.0
        y = math.sin(angle) * 9.0
        parts.append(box(f"frame{i}", (x, y, 3.4), (0.35, 3.6, 6.4), ["metal"]))
        parts.append(box(f"glass{i}", (x * 0.985, y * 0.985, 3.4), (0.12, 3.2, 6.0), ["glass"]))
        parts.append(box(f"foot{i}", (x, y, 0.3), (1.0, 3.9, 0.6), ["metal"]))

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