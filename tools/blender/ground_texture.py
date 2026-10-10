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


def normal_map(height, strength=2.4):
    """
    Tangent-space normal map derived from the height field.

    The difference is taken with explicit wrap-around indexing, so the normals
    at the image edge match the normals at the opposite edge — otherwise the
    tiling shows as a line of wrong lighting along every seam.
    """
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)

    nx = -dx * strength
    ny = -dy * strength
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
    for path in (save_image("ground_normal", normal), save_image("ground_rough", rough_rgb)):
        print(f"WROTE {path}")
    print("GROUND_TEXTURE_COMPLETE")


if __name__ == "__main__":
    main()