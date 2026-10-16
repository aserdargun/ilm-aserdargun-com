"""Generate the tiling ground textures used by the terrain discs.

Run:
    Blender --background --factory-startup --python tools/blender/ground_texture.py

Why this is a Blender script and not a runtime effect: the terrain discs cover
most of the screen, and a flat untextured plane reads as painted cardboard no
matter how well it is lit. A normal map costs a few kilobytes and gives the
ground a surface under the same lighting that already works.

Everything here is **seamlessly tileable**. The discs repeat the texture many
times across their radius, so any seam would be visible as a grid of straight
lines running through the ground. Both maps are built from periodic noise: the
lattice wraps at its own period, so the image tiles without a discontinuity.
"""

import math
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "public", "textures"))

SIZE = 512

# The macro map is sampled across the whole world rather than tiled every couple
# of units, so it gets its own size and its own octave count. See
# `macro_variation()` for why its period has to outrun every island.
MACRO_SIZE = 512
MACRO_BASE_CELLS = 2
MACRO_OCTAVES = 4
# Gain above 1/sqrt(2) puts more energy in the long wavelengths than in the short
# ones, which is the whole point: a field with equal energy per octave measures
# flat — its cell standard deviation barely falls as the cell grows — and reads
# as noise rather than as form. At the usual 0.5 the energy leaned the other way
# and the ground stayed as flat as it started.
MACRO_GAIN = 0.8
# Smoothing length of the subtracted baseline, in pixels of `MACRO_SIZE`. The
# largest island spans 92 world units, which at a 180-unit period is 262px, so a
# 300px baseline is longer than any island and removes its overall level.
MACRO_BASELINE_PX = 300

# Peak tangent-space slope each map is normalised to reach. Reported back out by
# `main()` next to the tilt it actually measured, so the two can be compared.
SOIL_PEAK_SLOPE = 0.6
STONE_PEAK_SLOPE = 0.95
# Water is much flatter than either. Its highlight is the whole read, and a
# steep map turns a canal into crumpled foil.
WATER_PEAK_SLOPE = 0.22


def periodic_value_noise(period, cells, seed):
    """
    Value noise on a wrapping lattice, tileable on both axes.

    The lattice holds `cells` random values per axis. Output sample `x` reads
    lattice index `(x * cells / period) % cells`, so index 0 and index
    `period` land on the same lattice point and the image wraps.

    Both axes must be computed. Sampling one axis from a fixed column while
    indexing rows only by lattice row silently produces a field whose rows
    repeat every `cells` samples instead of every `period`, which looks fine
    in isolation and shows up as a hard seam the moment the texture tiles.
    """
    rng = np.random.default_rng(seed)
    lattice = rng.random((cells, cells))

    coords = np.arange(period) * (cells / period)
    base = np.floor(coords).astype(int) % cells
    nxt = (base + 1) % cells
    frac = coords - np.floor(coords)
    # Smoothstep: linear interpolation leaves visible creases along every cell
    # boundary, which then show up as a grid once the texture repeats.
    t = frac * frac * (3.0 - 2.0 * frac)

    # Gather both lattice axes and blend.
    top = lattice[np.ix_(base, base)] * (1 - t)[None, :] + lattice[np.ix_(base, nxt)] * t[None, :]
    bottom = (
        lattice[np.ix_(nxt, base)] * (1 - t)[None, :] + lattice[np.ix_(nxt, nxt)] * t[None, :]
    )
    return top * (1 - t)[:, None] + bottom * t[:, None]


def fbm(period, base_cells, octaves, seed, gain=0.5):
    """Fractal sum of periodic noise. Each octave doubles the cell count."""
    total = np.zeros((period, period), dtype=np.float64)
    amplitude = 1.0
    norm = 0.0
    for octave in range(octaves):
        cells = base_cells * (2**octave)
        total += periodic_value_noise(period, cells, seed + octave * 977) * amplitude
        norm += amplitude
        amplitude *= gain
    return total / norm


def height_field(size=SIZE):
    """
    Ground height, normalised to 0..1.

    Two scales on purpose: fine grain for close-up grit, plus a coarser
    component that gives the ground a readable sense of undulation rather than
    uniform sandpaper.
    """
    fine = fbm(size, 8, 5, seed=1337)
    coarse = fbm(size, 2, 3, seed=4242)
    height = 0.72 * fine + 0.28 * coarse
    height -= height.min()
    height /= max(height.max(), 1e-6)
    return height


def normal_map(height, peak_slope=0.6):
    """
    Tangent-space normal map derived from the height field.

    The difference is taken with explicit wrap-around indexing, so the normals
    at the image edge match the normals at the opposite edge — otherwise the
    tiling shows as a line of wrong lighting along every seam.

    `peak_slope` is the gradient at the steepest point on the map, in tangent
    units, and the field is rescaled to reach it.

    That rescaling is the point. Multiplying the raw finite difference by a
    fixed constant appears to work — the map is written, it is seamless, it
    tiles — and produces a blue channel pinned at 1.0, because fBm sampled over
    a 512-pixel lattice changes by roughly a thousandth of a unit between
    adjacent pixels. The "strength" then has to be in the hundreds to be
    visible at all, and it is really just an accident of the seed and the
    lattice size rather than a value anyone chose. Normalising by the measured
    peak keeps `peak_slope` meaning what it says.
    """
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)

    peak = np.hypot(dx, dy).max()
    scale = (peak_slope / peak) if peak > 1e-9 else 0.0

    nx = -dx * scale
    ny = -dy * scale
    nz = np.ones_like(height)

    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= length
    ny /= length
    nz /= length

    # Normal maps are stored in 0..1 with a green-up convention (OpenGL). The
    # canvas Y axis points down while the noise lattice points up, so the green
    # channel is flipped here rather than by flipping the field twice.
    out = np.stack([nx * 0.5 + 0.5, 1.0 - (ny * 0.5 + 0.5), nz * 0.5 + 0.5], axis=-1)
    return np.clip(out, 0.0, 1.0)


def stone_height_field(size=SIZE):
    """
    Dry-stone relief for the landmarks.

    Different character from the soil map on purpose. The ground wants fine
    granular grit, because it is walked on at close range. The landmarks are
    read at ten to thirty units, so a sandpaper-scale map is invisible on them
    while a broad, chipped pattern survives the distance and still breaks up a
    thirty-unit terrace top.

    The ridged term is what does the work: `1 - |n|` turns smooth noise into
    creases, which is what weathered stone actually looks like. Pure fBm here
    produced soft dunes that read as cloth.
    """
    coarse = fbm(size, 2, 3, seed=2081)
    mid = fbm(size, 5, 4, seed=6427)
    # Ridged: sharpens the mid-scale noise into seams and chips.
    ridged = 1.0 - np.abs(fbm(size, 5, 4, seed=6427) * 2.0 - 1.0)
    grain = fbm(size, 14, 3, seed=9001)

    height = 0.30 * coarse + 0.34 * mid + 0.26 * ridged + 0.10 * grain
    height -= height.min()
    height /= max(height.max(), 1e-6)
    return height


def water_height_field(size=SIZE):
    """
    Ripples for the canal surface.

    Water is not grit. The ground's fBm is isotropic at every octave, which is
    right for sand and wrong here: real ripples are organised — a train of
    crests crossing the surface, each a long ridge rather than a blob. So the
    field is a handful of crossed sine trains plus one octave of fine detail to
    break their edges.

    Every train uses **integer** wave numbers in both axes. That is what makes
    the result tile exactly: the field is a sum of sinusoids whose periods
    divide the image, so the left edge meets the right one with no seam. Random
    frequencies would look fine in isolation and break the moment the texture
    repeats, which on a canal is the one thing the eye is guaranteed to catch —
    the whole point of the surface is that it moves.

    The trains are biased towards the +V axis, which elongates the crests along
    U. The canal scrolls the map along V, so the crests travel down the channel
    rather than sliding sideways across it.
    """
    axis = np.arange(size) / float(size)
    X, Y = np.meshgrid(axis, axis, indexing="ij")
    tau = 2.0 * math.pi

    # (kx, ky, amplitude). Integer pairs only; see above.
    trains = (
        (1, 3, 1.00),
        (1, 5, 0.72),
        (2, 7, 0.46),
        (1, 9, 0.30),
        (3, 12, 0.22),
        (5, 16, 0.14),
    )
    height = np.zeros((size, size), dtype=np.float64)
    for kx, ky, amp in trains:
        # Phases are fixed constants, not noise: the map must be identical on
        # every machine that regenerates it.
        height += amp * np.sin(tau * (kx * X + ky * Y) + kx * 0.7 + ky * 0.3)

    # One octave of fine detail, kept low so it roughens the crest edges
    # without turning the whole surface into noise again.
    height += 0.9 * fbm(size, 6, 3, seed=3313)

    height -= height.mean()
    height /= max(np.abs(height).max(), 1e-9)
    return height * 0.5 + 0.5


def roughness_map(height, size=SIZE):
    """
    Roughness variation, from a *different* noise than the normals.

    Driving both from the same field would make every groove read as rougher
    than the flats around it, which looks like a material change rather than
    like surface texture. Independent fields read as dirt and polish.

    The band is deliberately narrow and high (0.88-1.0). An earlier pass used a
    much wider range and the low end proved far too glossy in practice: the
    scene's turquoise rim light is a grazing-angle light, so any drop below
    roughly 0.8 roughness produced a coloured sheen sweeping across the
    ground at the horizon — the exact "wet sand" highlight this game does not
    want. Dry stone should stay dry.
    """
    grain = fbm(size, 12, 4, seed=909)
    roughness = 0.94 + 0.06 * grain - 0.04 * height
    return np.clip(roughness, 0.0, 1.0)


def periodic_blur(field, length_px):
    """
    Gaussian blur on a wrapping lattice, via a Fourier mask.

    Wrapping matters as much here as the periodicity of the noise itself. A blur
    built from edge-clamped convolution would smear the seam shut, and the first
    thing that would break is the field's own average near the edge — which is
    exactly the number this function exists to remove.
    """
    h, w = field.shape
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.rfftfreq(w)[None, :]
    mask = np.exp(-0.5 * (np.hypot(ky, kx) * length_px) ** 2)
    return np.fft.irfft2(np.fft.rfft2(field) * mask, s=(h, w))


def macro_variation(size=MACRO_SIZE):
    """
    The ground's large-scale value structure, centred on 0.5 inside [0,1].

    The other two soil maps tile every two world units, which puts all their
    detail below the scale at which a surface reads as having form. Measured on
    the opening frame — the ground is 59% of that picture — the tiled maps left
    the whole foreground inside 41 luma levels of 255, and per-vertex colour,
    the only other lever, tops out at about plus or minus 4 because the HSL
    lightness it offsets cannot go much further without clamping.

    So this exists to carry that structure in world space. It is sampled with a
    period far larger than any island (`GROUND_MACRO_PERIOD` in `Atmosphere.tsx`),
    which is what keeps it honest: the largest island is 92 units across, so at a
    180-unit period no single island can contain enough of the field to repeat
    it, and the eight islands — which sit 100 to 340 units apart — each read a
    different part of the same field.

    The baseline subtraction is not a nicety. Normalising the field to a mean of
    0.5 says nothing about what any *one island* reads, and an island only ever
    samples about 38% of the width. The first version of this map was mean-centred
    globally and the hub landed on a low patch: every sand pixel came out 5.5 luma
    levels darker with a 98th percentile of 0.0, and the cell standard deviation
    *fell* from 4.74% to 4.15%. It was a global dimming wearing the costume of
    structure. Removing a baseline longer than any island makes the local level
    mathematically impossible rather than merely unlikely.
    """
    field = fbm(size, MACRO_BASE_CELLS, MACRO_OCTAVES, seed=20261016, gain=MACRO_GAIN)
    field = field - periodic_blur(field, MACRO_BASELINE_PX)

    # Centre on 0.5 and fit to [0,1] without clipping, so the shader can read
    # `(map - 0.5)` and get a symmetric modulation.
    field = field - field.mean()
    scale = 0.5 / max(np.abs(field).max(), 1e-6)
    field = 0.5 + field * scale
    return field


def save_image(name, rgb):
    """Write an RGB float array to a PNG through Blender's image API."""
    height, width, _ = rgb.shape
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    # Blender images are bottom-up; the arrays above are row 0 = first row.
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb.astype(np.float32)
    image.pixels.foreach_set(rgba.reshape(-1))
    image.filepath_raw = os.path.join(OUT_DIR, f"{name}.png")
    image.file_format = "PNG"
    image.save()
    return image.filepath_raw


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    height = height_field()
    normal = normal_map(height, peak_slope=SOIL_PEAK_SLOPE)
    roughness = roughness_map(height)
    # Roughness is a scalar, written as a neutral grey image so it can be read
    # from any channel by the material's roughnessMap.
    rough_rgb = np.repeat(roughness[:, :, None], 3, axis=2)

    # The landmark map is normal-only. A roughness map needs UVs, and the
    # landmark meshes are exported without any (the detail map is projected
    # triplanar in the shader for exactly that reason), so there is nowhere for a
    # second map to be read from.
    #
    # Stone gets a steeper peak than soil: it is read at ten to thirty units,
    # where the ground's 0.6 has been averaged away by distance, and the shader
    # scales it back down again per material.
    stone = normal_map(stone_height_field(), peak_slope=STONE_PEAK_SLOPE)

    # The canal. Unlike the other two this one is never seen still, so its map
    # is scrolled across the surface at runtime; a seamless tile is not optional
    # here in the way it is everywhere else.
    water = normal_map(water_height_field(), peak_slope=WATER_PEAK_SLOPE)

    # Scalar, like the roughness map, and for the same reason: it modulates a
    # number rather than carrying a colour of its own.
    macro = macro_variation()
    macro_rgb = np.repeat(macro[:, :, None], 3, axis=2)

    for name, rgb, peak_slope in (
        ("ground_normal", normal, SOIL_PEAK_SLOPE),
        ("ground_rough", rough_rgb, None),
        ("ground_macro", macro_rgb, None),
        ("stone_normal", stone, STONE_PEAK_SLOPE),
        ("water_normal", water, WATER_PEAK_SLOPE),
    ):
        path = save_image(name, rgb)
        if peak_slope is None:
            # A roughness map has no normal in it; printing a tilt for it would
            # be exactly the kind of number that looks like a measurement.
            print(f"WROTE {path}")
            continue
        # Blue carries the tilt: 1.0 means every normal points straight at the
        # viewer, so a map that reports ~0.99 there is a map with no relief.
        #
        # The stored channel is `nz * 0.5 + 0.5`, though, so `|B - 1|` is
        # *half* the tilt and cannot be compared with the `peak_slope` that
        # produced it. Measured on the maps this script was already writing:
        # the soil reported 0.071 for a requested slope of 0.6, and the stone
        # 0.137 for 0.95 — every map was under-reporting its own relief by
        # exactly a factor of two, so halving `peak_slope` would have printed
        # a number that still looked healthy. Decode it back before printing.
        nz = rgb[:, :, 2] * 2.0 - 1.0
        tilt = float((1.0 - nz).max())
        print(f"WROTE {path}  peak_tilt={tilt:.3f}  requested_slope={peak_slope:.2f}")
    print("GROUND_TEXTURE_COMPLETE")


if __name__ == "__main__":
    main()