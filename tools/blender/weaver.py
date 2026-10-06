"""The Weaver — the game's player character.

Built as one continuous silhouette: a flared travelling coat, a shoulder cape,
a wide felt hat and the weaving staff. Built from lofted cross-sections rather
than stacked primitives so the shape reads as a craftsperson from behind at any
distance, which is the only angle the player ever sees.
"""

import math

from common import (
    PALETTE,
    box,
    join_objects,
    lathe,
    loft,
    new_mesh,
    ring,
    shade_flat,
    tube,
)


def build_weaver_parts_rigid():
    """The Weaver as separate, unjoined parts, ready to be parented to bones."""
    parts = []
    sides = 10

    # --- coat: narrow at the chest, flaring to a hem ------------------------
    coat_profile = [
        (0.60, 0.26, 0.21),   # hem, tucked
        (0.70, 0.36, 0.27),   # flare
        (0.80, 0.37, 0.28),
        (1.02, 0.30, 0.23),   # waist, clearly narrower
        (1.24, 0.27, 0.21),   # chest
        (1.40, 0.25, 0.20),   # shoulders
        (1.48, 0.19, 0.16),
        (1.53, 0.09, 0.08),   # collar
    ]
    verts, faces = tube(coat_profile, sides)
    parts.append(new_mesh("coat", verts, faces, ["cloth"]))

    # --- hem band: the woven copper edge -----------------------------------
    band_verts, band_faces = lathe([(0.58, 0.27, 0.22), (0.70, 0.37, 0.28)], sides + 2)
    parts.append(new_mesh("hem", band_verts, band_faces, ["copper"]))

    # --- shoulder cape ------------------------------------------------------
    cape_profile = [
        (1.30, 0.27, 0.23),
        (1.38, 0.34, 0.28),
        (1.47, 0.37, 0.31),
        (1.53, 0.26, 0.22),
    ]
    cape_verts, cape_faces = lathe(cape_profile, sides + 2)
    cape = new_mesh("cape", cape_verts, cape_faces, ["ceramic"])
    parts.append(cape)

    # --- belt and buckle ----------------------------------------------------
    belt_verts, belt_faces = lathe([(1.00, 0.31, 0.24), (1.10, 0.31, 0.24)], sides)
    parts.append(new_mesh("belt", belt_verts, belt_faces, ["leather"]))
    parts.append(box("buckle", (0.0, -0.25, 1.05), (0.13, 0.06, 0.10), ["copper"]))

    # --- legs and boots -----------------------------------------------------
    for side, tag in ((1, "L"), (-1, "R")):
        x = 0.115 * side
        leg_profile = [
            (0.16, 0.085, 0.085),
            (0.62, 0.070, 0.070),
        ]
        lv, lf = tube(leg_profile, 7, centre=(x, 0.0))
        parts.append(new_mesh(f"leg{tag}", lv, lf, ["cloth"]))

        boot_profile = [
            (0.02, 0.095, 0.105),
            (0.14, 0.095, 0.105),
            (0.16, 0.085, 0.095),
        ]
        bv, bf = tube(boot_profile, 7, centre=(x, 0.0))
        boot = new_mesh(f"boot{tag}", bv, bf, ["leather"])
        # Nudge the toe forward so the boots are not square blocks.
        for v in boot.data.vertices:
            if v.co.z < 0.09:
                v.co.y -= 0.035
        parts.append(boot)

    # --- arms ---------------------------------------------------------------
    for side, tag in ((1, "L"), (-1, "R")):
        x = 0.27 * side
        sleeve_profile = [
            (0.86, 0.062, 0.062),
            (1.38, 0.070, 0.070),
        ]
        sv, sf = tube(sleeve_profile, 7, centre=(x, 0.0))
        parts.append(new_mesh(f"sleeve{tag}", sv, sf, ["cloth_light"]))

        hand_profile = [
            (0.76, 0.050, 0.050),
            (0.88, 0.058, 0.058),
        ]
        hv, hf = tube(hand_profile, 7, centre=(x, 0.0))
        parts.append(new_mesh(f"hand{tag}", hv, hf, ["skin"]))

    # --- neck and head ------------------------------------------------------
    neck_verts, neck_faces = lathe([(1.46, 0.065, 0.065), (1.58, 0.075, 0.075)], 8)
    parts.append(new_mesh("neck", neck_verts, neck_faces, ["skin"]))

    # A slightly egg-shaped head reads better than a sphere from behind.
    head_sections = []
    for z, rx, ry in [
        (1.60, 0.11, 0.11),
        (1.67, 0.175, 0.170),
        (1.75, 0.190, 0.182),
        (1.83, 0.180, 0.170),
        (1.89, 0.125, 0.118),
        (1.92, 0.07, 0.07),
    ]:
        head_sections.append(ring(0, 0, z, rx, ry, 10))
    hv, hf = loft(head_sections)
    parts.append(new_mesh("head", hv, hf, ["skin"]))

    # --- wide felt hat: the strongest part of the silhouette ---------------
    brim_sections = []
    for z, rx, ry in [
        (1.88, 0.48, 0.46),
        (1.92, 0.50, 0.48),
        (1.97, 0.47, 0.45),
    ]:
        brim_sections.append(ring(0, 0, z, rx, ry, 14))
    bv, bf = loft(brim_sections)
    parts.append(new_mesh("hat_brim", bv, bf, ["felt"]))

    crown_sections = []
    for z, rx, ry in [
        (1.95, 0.195, 0.190),
        (2.06, 0.205, 0.200),
        (2.14, 0.170, 0.165),
        (2.19, 0.085, 0.082),
    ]:
        crown_sections.append(ring(0, 0, z, rx, ry, 12))
    cv, cf = loft(crown_sections)
    parts.append(new_mesh("hat_crown", cv, cf, ["felt"]))

    # copper hat band
    band_verts2, band_faces2 = lathe([(1.98, 0.203, 0.198), (2.05, 0.206, 0.201)], 12)
    parts.append(new_mesh("hat_band", band_verts2, band_faces2, ["copper"]))

    # --- satchel ------------------------------------------------------------
    parts.append(
        box("satchel", (0.23, -0.06, 1.04), (0.18, 0.12, 0.22), ["leather"],
            rotation=(0.0, 0.0, -0.16))
    )

    # --- the weaving staff --------------------------------------------------
    staff_profile = [(0.02, 0.044, 0.044), (2.36, 0.034, 0.034)]
    stv, stf = tube(staff_profile, 7, centre=(0.40, 0.06))
    parts.append(new_mesh("staff", stv, stf, ["copper"]))

    # pommel
    pv, pf = tube([(0.02, 0.055, 0.055), (0.10, 0.05, 0.05)],
                  8, centre=(0.40, 0.06))
    parts.append(new_mesh("pommel", pv, pf, ["copper_dark"]))

    # the unwoven warp at the head of the staff
    for i, offset in enumerate((-0.07, 0.0, 0.07)):
        parts.append(
            box(f"warp{i}", (0.40 + offset, 0.06, 2.46), (0.014, 0.014, 0.28),
                ["turquoise"] if i == 1 else ["ceramic"])
        )

    # staff crystal
    crystal_sections = []
    for z, r in [(2.42, 0.055), (2.49, 0.105), (2.62, 0.055)]:
        crystal_sections.append(ring(0.40, 0.06, z, r, r, 6, rotation=math.pi / 6))
    cv2, cf2 = loft(crystal_sections)
    parts.append(new_mesh("crystal", cv2, cf2, ["turquoise"]))

    for part in parts:
        shade_flat(part)
    return parts


def build_weaver():
    """The Weaver as one mesh, used when no animation rig is wanted."""
    parts = build_weaver_parts_rigid()
    weaver = join_objects(parts, "weaver")
    shade_flat(weaver)
    return weaver


def build_spark():
    """Kıvılcım / Spark — a small, curious mechanical companion."""
    parts = []

    shell_sections = []
    for z, r in [
        (-0.20, 0.10), (-0.10, 0.22), (0.0, 0.26),
        (0.10, 0.22), (0.20, 0.10),
    ]:
        shell_sections.append(ring(0, 0, z, r, r, 10))
    sv, sf = loft(shell_sections)
    parts.append(new_mesh("shell", sv, sf, ["coral"]))

    # equatorial copper band
    band_sections = []
    for z, r in [(-0.035, 0.275), (0.0, 0.285), (0.035, 0.275)]:
        band_sections.append(ring(0, 0, z, r, r, 12))
    bv, bf = loft(band_sections)
    parts.append(new_mesh("band", bv, bf, ["copper"]))

    # polar cap
    cap_sections = []
    for z, r in [(0.19, 0.13), (0.26, 0.09), (0.32, 0.02)]:
        cap_sections.append(ring(0, 0, z, r, r, 8))
    cv, cf = loft(cap_sections)
    parts.append(new_mesh("cap", cv, cf, ["copper_dark"]))

    # the eye — the part that makes it feel attentive
    eye_sections = []
    for z, r in [(0.16, 0.05), (0.21, 0.095), (0.25, 0.05)]:
        eye_sections.append(ring(0, -0.20, z, r, r, 8))
    ev, ef = loft(eye_sections)
    eye = new_mesh("eye", ev, ef, ["turquoise"])
    parts.append(eye)

    # folded fins
    for side in (1, -1):
        parts.append(
            box(f"fin{side}", (0.24 * side, 0.0, -0.04), (0.16, 0.20, 0.035),
                ["glass"], rotation=(0.0, 0.0, 0.42 * side))
        )

    spark = join_objects(parts, "spark")
    shade_flat(spark)
    return spark