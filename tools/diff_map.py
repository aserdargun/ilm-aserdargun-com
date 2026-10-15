#!/usr/bin/env python3
"""Where did the change land?

Blobs an amplified |A-B| heat map so a small effect can be located on screen
instead of only summed. Prints the bounding box of the strongest connected
region and writes a side-by-side + map PNG for visual review.

Usage:
    /usr/bin/python3 tools/diff_map.py A.png B.png --out .shots/x-map.png
                                    [--crop x0 y0 x1 y1] [--gain 8] [--thresh 2]
"""

import argparse
import json
import os
import sys

from PIL import Image
import numpy as np


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--out", required=True)
    ap.add_argument("--gain", type=float, default=8.0, help="amplification of |A-B|")
    ap.add_argument("--thresh", type=float, default=2.0, help="luma level counted as changed")
    ap.add_argument("--crop", nargs=4, type=int, metavar=("X0", "Y0", "X1", "Y1"))
    return ap.parse_args()


def luma(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def main():
    args = parse_args()
    ia = np.asarray(Image.open(args.a).convert("RGB")).astype(np.float32)
    ib = np.asarray(Image.open(args.b).convert("RGB")).astype(np.float32)
    if ia.shape != ib.shape:
        sys.exit(f"size mismatch: {ia.shape} vs {ib.shape}")

    la, lb = luma(ia), luma(ib)
    d = np.abs(ia - ib).max(axis=2)
    dl = np.abs(la - lb)

    changed = dl > args.thresh
    total = changed.sum()
    print(f"changed(>{args.thresh:g} luma) = {total} px = {100.0*total/dl.size:.3f}%")
    print(f"sum|dLuma| = {dl.sum():.1f}  max|dLuma| = {dl.max():.2f}  mean over changed = "
          f"{dl[changed].mean() if total else 0:.2f}")

    if total:
        # Row/column occupancy to locate the change without a labelling pass.
        rows = changed.sum(axis=1)
        cols = changed.sum(axis=0)
        ry = np.nonzero(rows > 0)[0]
        cx = np.nonzero(cols > 0)[0]
        print(f"bbox changed region: x {cx.min()}..{cx.max()}  y {ry.min()}..{ry.max()}")
        # Strongest 5% band by row occupancy -> the actual hot spot.
        hot = np.argsort(rows)[-max(1, len(rows)//20):]
        print(f"hottest 5% of rows: y {hot.min()}..{hot.max()}")

        # Fraction of the change inside a given crop window.
        if args.crop:
            x0, y0, x1, y1 = args.crop
            inside = changed[y0:y1, x0:x1].sum()
            print(f"inside crop {args.crop}: {inside} px = {100.0*inside/max(1,total):.1f}% of change")

    heat = np.clip(dl * args.gain, 0, 255).astype(np.uint8)
    heat_rgb = np.stack([heat, np.zeros_like(heat), 255 - heat], axis=2)

    out = np.concatenate([ia.astype(np.uint8), ib.astype(np.uint8), heat_rgb], axis=1)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    Image.fromarray(out).save(args.out)
    print(f"wrote {args.out} (A | B | |A-B| gain={args.gain:g})")

    meta = {
        "changedPx": int(total),
        "changedPct": round(100.0 * total / dl.size, 4),
        "sumAbsLuma": round(float(dl.sum()), 2),
        "maxAbsLuma": round(float(dl.max()), 2),
        "gain": args.gain,
        "thresh": args.thresh,
    }
    with open(os.path.splitext(args.out)[0] + ".json", "w") as fh:
        json.dump(meta, fh, indent=2)


if __name__ == "__main__":
    main()
