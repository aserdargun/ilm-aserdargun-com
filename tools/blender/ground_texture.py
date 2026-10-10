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
    normal = normal_map(height)
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
    stone = normal_map(stone_height_field(), peak_slope=0.95)

    for name, rgb in (
        ("ground_normal", normal),
        ("ground_rough", rough_rgb),
        ("stone_normal", stone),
    ):
        path = save_image(name, rgb)
        # Blue carries the tilt: 1.0 means every normal points straight at the
        # viewer, so a map that reports ~0.99 there is a map with no relief.
        tilt = float(np.abs(rgb[:, :, 2] - 1.0).max())
        print(f"WROTE {path}  peak_tilt={tilt:.3f}")
    print("GROUND_TEXTURE_COMPLETE")


if __name__ == "__main__":
    main()