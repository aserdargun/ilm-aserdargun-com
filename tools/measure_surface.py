"""
The flatness of a surface, measured the way the eye reads it.

A global standard deviation over a region says how much the *scene* varies
there; it does not say whether the *surface* has any texture, because a single
bright edge in the middle of the region can carry the whole number. What the
eye reads as "this surface has grain" is the variation from one small patch to
the next, so that is what is measured: a grid of small windows over the
surface, and the median and the top decile of their standard deviations.

The median is the surface; the top decile is the best-lit patch of it; and
the ground beside it is the control, because a number means nothing without
the surface it is standing next to.
"""

import sys


def luma_rows(path):
    """Raw 8-bit luma planes, one per file, as flat lists of ints."""
    out = []
    for p in path:
        with open(p, "rb") as fh:
            out.append(fh.read())
    return out


def local_stds(buf, width, x0, y0, x1, y1, window):
    """The standard deviation inside every `window`-sized patch of a region."""
    stds = []
    for y in range(y0, y1 - window + 1, max(1, window // 2)):
        for x in range(x0, x1 - window + 1, max(1, window // 2)):
            vals = [buf[(y + j) * width + (x + i)]
                    for j in range(window) for i in range(window)]
            m = sum(vals) / len(vals)
            stds.append((sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5)
    return stds


def report(name, buf, width, x0, y0, x1, y1, window=30):
    stds = sorted(local_stds(buf, width, x0, y0, x1, y1, window))
    if not stds:
        print(f"  {name:34} (no samples)")
        return
    n = len(stds)
    med = stds[n // 2]
    top = stds[int(n * 0.9)]
    print(f"  {name:34} median={med:5.2f}  top decile={top:5.2f}  "
          f"min={stds[0]:5.2f}  max={stds[-1]:5.2f}  ({n} patches)")


if __name__ == "__main__":
    W = 1600
    for path in sys.argv[1:]:
        with open(path, "rb") as fh:
            buf = fh.read()
        print(path)
        report("whole frame", buf, W, 0, 0, W, 1000)
