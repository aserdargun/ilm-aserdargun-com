#!/usr/bin/env python3
"""Kamera hareketi sirasinda titreme (shimmer) var mi?

Tek kare bunu gostermez; suregen kareler gerekir. Ama kameranin hareketi de
her pikseli degistirir, dolayisiyla "kareler farkli" demek bir sey anlatmaz.

Iki ayirt edici var ve ikisi de tek basina yaniltir, bu yuzden birlikte okunur:

1. **Farkin standart sapmasinin ortalamasi orani.** Yumusak, uzamsal olarak
   duz bir kayma dusuk oran verir; titreme yuksek verir. Ama pürüzsüz bir
   gökyüzünde tek bir kule silueti ya da panel kenari orani yuksege cikarar,
   titreme olmadan da. Yaniltici.

2. **Tek basina ziplayan pikseller.** Titremenin imzasi tam olarak budur: bir
   piksel kendi dokuz komsusundan belirgin sekilde farkli. Bu, sert kenarlar
   icin sessiz kalir, cunku sert kenarin komsusu da farklidir.

Kullanim:
  /usr/bin/python3 tools/shimmer.py kare0.png kare1.png [kare2.png ...]
"""
import sys

import numpy as np
from PIL import Image

BOLGELER = {
    "gokyuzu (ust)": (0.00, 0.22),
    "ufuk bandi": (0.22, 0.36),
    "uzak zemin": (0.36, 0.52),
    "yakin zemin": (0.62, 1.00),
}

ESIK_YUKSEK = 30.0   # bir pikselin "ziplamasi" icin gereken fark
ESIK_KOMSU = 6.0     # komsusunun "ziplamamis" sayilmasi icin ust sinir


def yukle(yol):
    return np.asarray(Image.open(yol).convert("RGB"), dtype=np.float32)


def tek_piksel_firla(fark2d):
    """Komsularindan ayrilan tek piksellerin orani (yuzde)."""
    yuksek = np.abs(fark2d) > ESIK_YUKSEK
    if not yuksek.any():
        return 0.0
    toplam = np.zeros_like(fark2d, dtype=np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue  # merkez kendi komsusu degildir
            toplam += np.abs(np.roll(np.roll(fark2d, dy, axis=0), dx, axis=1))
    komsu_ort = toplam / 8.0
    tek = yuksek & (komsu_ort < ESIK_KOMSU)
    return float(tek.sum()) / fark2d.size * 100.0


def main():
    yollar = sys.argv[1:]
    if len(yollar) < 2:
        print(__doc__)
        return
    kareler = [yukle(p) for p in yollar]
    H = kareler[0].shape[0]
    print("kare sayisi: %d  (%s -> %s)" % (len(kareler), yollar[0], yollar[-1]))
    print()
    print("%-18s %12s %10s %14s" % ("bolge", "ort fark", "std/ort", "tek pikselli firla"))
    for ad, (a0, a1) in BOLGELER.items():
        y0, y1 = int(H * a0), int(H * a1)
        farklar, firlamalar = [], []
        for k, l in zip(kareler, kareler[1:]):
            f2 = np.abs(k[y0:y1] - l[y0:y1]).mean(2)
            farklar.append(f2.reshape(-1))
            firlamalar.append(tek_piksel_firla(f2))
        f = np.stack(farklar)
        ort = f.mean()
        print(
            "%-18s %12.3f %10.2f %13.4f%%"
            % (ad, ort, f.std() / max(ort, 1e-6), float(np.mean(firlamalar)))
        )


if __name__ == "__main__":
    main()