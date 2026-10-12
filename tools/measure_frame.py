#!/usr/bin/env python3
"""Compare two rendered frames, and refuse to compare frames that are not comparable.

Rendering an A/B of a visual change is easy to get wrong in a way that produces
a confident, completely wrong number. Three of those ways showed up in one
session of this project and each of them looked like a clean measurement:

  1. The camera moved between the two shots (an HMR remount resets it), so the
     frames show different views and the "difference" is the camera.
  2. Something animated between the shots - a turning rock, an idle character -
     so the difference is motion, not the change under test.
  3. The state being compared was never the state under test, because a
     quality reload or a menu overlay quietly changed what was on screen.

A diff cannot detect any of these by itself: the pixels genuinely differ. So this
tool refuses the comparison instead, and the refusals are the feature.

    # the ordinary case, with camera metadata captured alongside each shot
    measure_frame.py a.png b.png --meta a.json b.json

    # to ignore whatever is animating, pass a third frame taken at one of the
    # two settings. Pixels that move between those two are excluded.
    measure_frame.py a.png b.png --meta a.json b.json --control b1.png

    # prove the tool can fail before trusting what it says
    measure_frame.py --selftest

The camera metadata is the small JSON object the browser probe writes:

    {"camera": [x, y, z], "direction": [x, y, z], "player": {"x": 0, "y": 0, "z": 0},
     "quality": "medium", "canvas": [2160, 1215], "note": "..."}

Only `camera` is required, and only to the precision you care about: two shots
whose cameras differ by more than `--camera-tol` (default 0.001 world units)
are reported as incomparable and no statistics are printed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# A silhouette step this large in luminance (0-255) is a real edge rather than
# texture. Used to report sharpness, not to decide comparability.
DEFAULT_EDGE_STEP = 60.0
# Two frames of the *same* state that still differ by more than this are assumed
# to contain something animating.
DEFAULT_MOTION_STEP = 6.0


def load_gray(path: str | Path) -> np.ndarray:
    """Load an image as float luminance in 0-255."""
    return np.asarray(Image.open(path).convert("L")).astype(np.float32)


def load_meta(path: str | Path) -> dict | None:
    p = Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def camera_of(meta: dict | None) -> np.ndarray | None:
    if not meta:
        return None
    cam = meta.get("camera")
    if cam is None:
        return None
    return np.asarray(cam, dtype=np.float64)


def dilation(mask: np.ndarray, rounds: int) -> np.ndarray:
    """Grow a boolean mask so a moving object's halo is excluded with it."""
    out = mask.copy()
    for _ in range(rounds):
        out = (
            out
            | np.roll(out, 1, axis=0)
            | np.roll(out, -1, axis=0)
            | np.roll(out, 1, axis=1)
            | np.roll(out, -1, axis=1)
        )
    return out


def motion_mask(a: np.ndarray, b: np.ndarray, step: float = DEFAULT_MOTION_STEP,
                rounds: int = 3) -> np.ndarray:
    """Pixels that move between two frames of the *same* state."""
    return dilation(np.abs(a - b) > step, rounds)


def diff_stats(a: np.ndarray, b: np.ndarray, mask: np.ndarray | None = None) -> dict:
    """Per-channel difference over the region `mask` selects."""
    d = np.abs(a.astype(np.float32) - b.astype(np.float32))
    region = np.ones(d.shape, bool) if mask is None else mask
    if region.sum() == 0:
        return {"pixels": 0}
    vals = d[region]
    return {
        "pixels": int(region.sum()),
        "fractionOfFrame": float(region.mean()),
        "mean": float(vals.mean()),
        "frac_gt_4": float((vals > 4).mean()),
        "frac_gt_12": float((vals > 12).mean()),
        "max": float(vals.max()),
    }


def sharpness(img: np.ndarray, edge_step: float = DEFAULT_EDGE_STEP) -> dict:
    """Fraction of adjacent-column pairs that jump hard: an aliased silhouette."""
    gx = np.abs(np.diff(img, axis=1))
    return {
        "adjacentStep_gt_edge": float((gx > edge_step).mean()),
        "meanAbsStep": float(gx.mean()),
    }


def camera_offset(meta_a: dict | None, meta_b: dict | None) -> float | None:
    ca, cb = camera_of(meta_a), camera_of(meta_b)
    if ca is None or cb is None:
        return None
    return float(np.abs(ca - cb).max())


def compare(path_a: str, path_b: str, meta_a: dict | None, meta_b: dict | None,
            control_path: str | None = None, camera_tol: float = 0.001,
            edge_step: float = DEFAULT_EDGE_STEP) -> tuple[dict, list[str]]:
    """Return (report, problems). `problems` non-empty means the A/B is not usable."""
    problems: list[str] = []
    a, b = load_gray(path_a), load_gray(path_b)

    if a.shape != b.shape:
        problems.append(
            f"frame sizes differ: {a.shape} vs {b.shape}; the viewport or the "
            "drawing buffer changed between shots"
        )

    # 1. Did the camera move?
    offset = camera_offset(meta_a, meta_b)
    if meta_a is None or meta_b is None:
        problems.append(
            "no camera metadata for at least one frame; without it a camera move "
            "between the shots is indistinguishable from a real change"
        )
    elif offset is not None and offset > camera_tol:
        problems.append(
            f"camera moved {offset:.4f} units between the shots (tolerance "
            f"{camera_tol}); these are two views, not two states"
        )

    # 2. Was a different quality/state on screen?
    if meta_a and meta_b:
        for key in ("quality", "canvas"):
            va, vb = meta_a.get(key), meta_b.get(key)
            if va is not None and vb is not None and va != vb:
                problems.append(f"{key} differs between shots: {va!r} vs {vb!r}")
        pa, pb = meta_a.get("player"), meta_b.get("player")
        if pa and pb:
            moved = max(abs(float(pa[k]) - float(pb[k])) for k in ("x", "y", "z"))
            if moved > camera_tol:
                problems.append(f"player moved {moved:.4f} units between shots")

    # 3. What is animating, if we were told?
    static_mask = None
    motion: dict | None = None
    if control_path:
        c = load_gray(control_path)
        if c.shape != b.shape:
            problems.append("control frame size does not match frame B")
        else:
            m = motion_mask(b, c)
            motion = {"pixels": int(m.sum()), "fractionOfFrame": float(m.mean())}
            static_mask = ~m

    report = {
        "A": path_a,
        "B": path_b,
        "wholeFrame": diff_stats(a, b),
        "wholeFrameSharpness": {"A": sharpness(a, edge_step), "B": sharpness(b, edge_step)},
        "cameraOffset": offset,
        "motion": motion,
    }
    if static_mask is not None:
        report["staticOnly"] = diff_stats(a, b, static_mask)
    report["verdict"] = "INCOMPARABLE" if problems else "comparable"
    return report, problems


# ---------------------------------------------------------------------------
# Self-test: every failure mode above has to actually fail, or the tool is a
# decoration. Run this before trusting a number it produces.
# ---------------------------------------------------------------------------

def selftest() -> int:
    rng = np.random.default_rng(7)
    h, w = 240, 320
    base = np.full((h, w), 100.0, np.float32)
    base[100:140, 40:280] = 200.0          # a bright slab with hard edges

    def write(name: str, img: np.ndarray) -> str:
        Image.fromarray(img.astype(np.uint8)).save(name)
        return name

    here = Path("/tmp/ilm-frame-selftest")
    here.mkdir(parents=True, exist_ok=True)
    a = write(str(here / "a.png"), base)
    b_same = write(str(here / "b_same.png"), base)
    b_shift = write(str(here / "b_shift.png"), np.roll(base, 12, axis=1))
    anim = base.copy()
    anim[180:210, 100:160] += 60            # something moving between shots
    b_anim = write(str(here / "b_anim.png"), anim)
    b_ctrl = write(str(here / "b_ctrl.png"), base)
    b_tint = write(str(here / "b_tint.png"), base + 20)   # a change over the whole frame

    meta = lambda cam, q="medium": {"camera": cam, "quality": q, "canvas": [w, h],
                                    "player": {"x": 0, "y": 0, "z": 0}}
    m_here, m_far = meta([0.0, 4.7, 27.6]), meta([0.0, 4.7, 40.0])

    checks: list[tuple[str, bool]] = []

    _, p = compare(a, b_same, m_here, m_here)
    checks.append(("identical frames compare cleanly", not p))

    _, p = compare(a, b_shift, m_here, m_here)
    checks.append(("a real change is NOT refused", not p))

    _, p = compare(a, b_shift, m_here, m_far)
    checks.append(("a camera move IS refused", any("camera moved" in x for x in p)))

    _, p = compare(a, b_shift, m_here, None)
    checks.append(("missing metadata IS refused", any("no camera metadata" in x for x in p)))

    _, p = compare(a, b_anim, m_here, meta([0.0, 4.7, 27.6], "high"))
    checks.append(("a different quality IS refused", any("quality differs" in x for x in p)))

    rep, p = compare(a, b_anim, m_here, m_here, control_path=b_ctrl)
    checks.append(("motion is measurable", rep["motion"] is not None and rep["motion"]["pixels"] > 0))
    checks.append(("motion is excluded from staticOnly",
                   rep["staticOnly"]["max"] < rep["wholeFrame"]["max"]))

    rep, _ = compare(a, b_shift, m_here, m_here)
    # A 12px slide of a slab moves its full 100-unit contrast, but only the
    # slab's *edges* land on different pixels - the interior is 200 either way.
    # Asserting on the area covered here was the first version of this test and
    # it failed: the tool was right and the expected area was not a property of
    # displacement at all. Contrast reached is the number that means something.
    checks.append(("a shift moves the full contrast", rep["wholeFrame"]["max"] >= 100.0))

    rep, _ = compare(a, b_tint, m_here, m_here)
    checks.append(("a whole-frame change is detected as broad coverage",
                   rep["wholeFrame"]["frac_gt_12"] > 0.9))

    rep, _ = compare(a, b_same, m_here, m_here)
    checks.append(("identical frames measure zero", rep["wholeFrame"]["max"] == 0.0))

    ok = True
    for name, passed in checks:
        print(f"  {'PASS' if passed else 'FAIL'}  {name}")
        ok = ok and passed
    print(f"\n{sum(1 for _, p in checks if p)}/{len(checks)} checks passed")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("a", nargs="?", help="frame A (before)")
    ap.add_argument("b", nargs="?", help="frame B (after)")
    ap.add_argument("--meta", nargs=2, metavar=("A.json", "B.json"))
    ap.add_argument("--control", help="a third frame at one of the two states, for masking animation")
    ap.add_argument("--camera-tol", type=float, default=0.001)
    ap.add_argument("--edge-step", type=float, default=DEFAULT_EDGE_STEP)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        print("measure_frame self-test:")
        return selftest()
    if not args.a or not args.b:
        ap.error("give two frames, or --selftest")

    meta_a = load_meta(args.meta[0]) if args.meta else None
    meta_b = load_meta(args.meta[1]) if args.meta else None
    report, problems = compare(args.a, args.b, meta_a, meta_b, args.control,
                               args.camera_tol, args.edge_step)
    print(json.dumps(report, indent=2))
    if problems:
        print("\nINCOMPARABLE - do not quote these numbers:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 2
    print("\ncomparable: both frames are the same view and the same state.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())