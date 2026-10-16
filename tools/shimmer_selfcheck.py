"""Shimmer dedektorunu sentetik titreme ile sinar.

Sifir cikan bir olcumun degerli olmasi icin dedektorun gercekten bir sey
yakaladigini once gostermek gerekir. Ayni tuzak: bir seyin "olcmedigim" kismi
"olcmedigim" cunku arac bozuk.
"""
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

TOOL = "tools/shimmer.py"


def main():
    a = sys.argv[1]
    b = sys.argv[2]
    rng = np.random.default_rng(7)

    # Gercek kare ciftini kopyala ve ikincisine izole pikseller serp.
    sa = np.asarray(Image.open(a).convert("RGB"), dtype=np.float32)
    sb = np.asarray(Image.open(b).convert("RGB"), dtype=np.float32).copy()

    H, W = sb.shape[:2]
    n = max(1, (H * W) // 4000)
    ys = rng.integers(2, H - 2, n)
    xs = rng.integers(2, W - 2, n)
    sb[ys, xs] = np.clip(sb[ys, xs] + 90.0, 0, 255)

    sa_p = "/tmp/shim-a.png"
    sb_p = "/tmp/shim-b.png"
    Image.fromarray(sa.astype(np.uint8)).save(sa_p)
    Image.fromarray(sb.astype(np.uint8)).save(sb_p)

    print("=== TEMEL (titreme yok) ===")
    subprocess.run(["/usr/bin/python3", TOOL, sa_p, sb_p], stdout=subprocess.DEVNULL)
    print("=== SENTETIK: %d izole piksel +90/255 eklendi ===" % n)
    out = subprocess.run(["/usr/bin/python3", TOOL, sa_p, sb_p], capture_output=True, text=True)
    print(out.stdout)
    print(
        "Yukarida tek-pikselli firla sutunu sifirdan cikarsa dedektor calisiyor; "
        "sifir kalirsa arac titremeyi goremiyor demektir."
    )


if __name__ == "__main__":
    main()