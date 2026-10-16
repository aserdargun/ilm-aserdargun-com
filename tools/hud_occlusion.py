"""Gokyuzunun HUD panelinin arkasinda ne kadar okunur kaldigini olcer.

Referans, HUD gizlenerek cekilmis ayni kare; panel altindaki pikseller
oradaki ham gokyuzu ile karsilastirilir. Buzlu cam oldugu icin "kapsamak"
ile "gizlemek" ayni sey degil.
"""
import sys

import numpy as np
from PIL import Image


def yukle(yol):
    a = np.asarray(Image.open(yol).convert("RGB"), dtype=np.float32)
    return a


def luma(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def main():
    acik = yukle(sys.argv[1])
    kapali = yukle(sys.argv[2])

    fark = np.abs(acik - kapali).mean(2)
    hud = fark > 6

    R, G, B = kapali[:, :, 0], kapali[:, :, 1], kapali[:, :, 2]
    L = luma(kapali)
    gok = (B > R + 10) & (B > G + 3) & (L < 115)

    L2 = luma(acik)
    dis = gok & ~hud
    alt = gok & hud

    def yaz(etiket, mask, arr):
        if mask.sum() < 200:
            print("  %-26s yeterli piksel yok" % etiket)
            return None
        v = arr[mask]
        print(
            "  %-26s luma %6.1f  std %5.2f  p95-p05 %5.1f"
            % (etiket, v.mean(), v.std(), np.percentile(v, 95) - np.percentile(v, 5))
        )
        return v.std()

    print("=== Gokyuzunun HUD icinde ne kadar okunur kaldigi ===")
    print("gokyuzu kare payi (HUD'suz): %.2f%%" % (gok.mean() * 100))
    print("HUD etkiledigi piksel       : %.2f%%" % (hud.mean() * 100))
    print("gokyuzunun HUD altindaki payi: %.1f%%" % (alt.sum() / max(gok.sum(), 1) * 100))
    print()
    print("Ayni pikseller, HUD'suz karede:")
    s1 = yaz("panel disi (ham gokyuzu)", dis, L)
    s2 = yaz("panel alti (ham gokyuzu)", alt, L)
    print()
    print("HUD acik karede:")
    a1 = yaz("panel disi", dis, L2)
    a2 = yaz("panel alti", alt, L2)
    print()
    if s1 and a1 and a2:
        print("yapi korunmasi: dis std %.2f -> alt std %.2f  = %%%.0f" % (a1, a2, (1 - a2 / a1) * 100))


if __name__ == "__main__":
    main()