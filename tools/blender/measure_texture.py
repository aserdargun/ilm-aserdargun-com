"""Analyse the ground height fields without Blender.

`ground_texture.py` only needs bpy to write PNGs; every field is pure numpy. This
stubs bpy so the generators can be imported and measured directly, which is far
faster than regenerating through Blender for each experiment.

Usage:
    python3 tools/blender/measure_texture.py
"""

import importlib.util
import os
import sys
import types

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

# The generator imports bpy at module scope and only uses it inside save_image.
sys.modules.setdefault("bpy", types.ModuleType("bpy"))


def load():
    spec = importlib.util.spec_from_file_location(
        "ground_texture", os.path.join(HERE, "ground_texture.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def anisotropy(field):
    """
    Directional bias of a scalar field, via the structure tensor of its gradient.

    Returns (A, theta_deg) where A is 0 for a perfectly isotropic field and 1 for
    one whose gradient points a single way, and theta is that way.
    """
    gy, gx = np.gradient(field.astype(np.float64))
    Jxx = float((gx * gx).mean())
    Jyy = float((gy * gy).mean())
    Jxy = float((gx * gy).mean())
    disc = np.sqrt(max(0.0, 0.25 * (Jxx - Jyy) ** 2 + Jxy * Jxy))
    d1 = 0.5 * (Jxx + Jyy) + disc
    d2 = 0.5 * (Jxx + Jyy) - disc
    return (d1 - d2) / (d1 + d2 + 1e-12), 0.5 * np.degrees(np.arctan2(2 * Jxy, Jxx - Jyy))


def orientation_histogram(field, bins=12):
    """Share of gradient energy per orientation band, degrees folded to 0..180."""
    gy, gx = np.gradient(field.astype(np.float64))
    mag = np.hypot(gx, gy)
    ang = (np.degrees(np.arctan2(gy, gx)) + 180.0) % 180.0
    hist, _ = np.histogram(ang, bins=bins, range=(0, 180), weights=mag)
    return hist / hist.sum() * 100


def report(label, field):
    a, theta = anisotropy(field)
    hist = orientation_histogram(field)
    uniform = 100.0 / len(hist)
    print(f"=== {label}")
    print(f"    anisotropy {a:.4f}   dominant {theta:+.1f} deg")
    print("    gradient energy per band (%):", " ".join(f"{h:5.1f}" for h in hist))
    print(f"    uniform {uniform:.1f}   peak/mean {hist.max() / hist.mean():.2f}")
    return a, theta


if __name__ == "__main__":
    gt = load()
    report("height_field (soil)", gt.height_field())
    report("stone_height_field (landmarks)", gt.stone_height_field())
    report(
        "fbm(2,3) coarse only",
        gt.fbm(gt.SIZE, 2, 3, seed=2081),
    )
    report("fbm(5,4) mid only", gt.fbm(gt.SIZE, 5, 4, seed=6427))
    report("fbm(14,3) grain only", gt.fbm(gt.SIZE, 14, 3, seed=9001))
    report("fbm(8,5) fine only", gt.fbm(gt.SIZE, 8, 5, seed=1337))