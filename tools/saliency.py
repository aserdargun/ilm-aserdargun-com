#!/usr/bin/env python3
"""Acilis karesinde gozun ilk nereye gittigini olcer.

Oyunun ilk isi "karanlik kanali isiga bagla" ve hedef, tepedeki isik feneri.
Ama "en parlak olan" ile "ilk bakilan" ayni sey degil: goz, arka plandan
ayrilan yerlere gider. Buradaki vekil olcum, kaba olcekte yerel kontrasttir -
bir bolgenin kendi cevresinden ne kadar koptugu.

Iki olcu birlikte:
  - yerel kontrast: bolge vs cevresi
  - renk doygunlugu ayrikligi: bolgenin cevresinden renkte ne kadar farkli
    oldugu (fener cyan; kum sicak)

Kullanim:
  /usr/bin/python3 tools/saliency.py kare.png [hucre_px]
"""
import sys

import numpy as np
from PIL import Image


def luma(rgb):
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def bloklar(a, c):
    h, w = a.shape[:2]
    gh, gw = h // c, w // c
    if gh < 3 or gw < 3:
        return None
    def kucuk(x):
        return x[: gh * c, : gw * c].reshape(gh, c, gw, c).transpose(0, 2, 1, 3).reshape(gh, gw, -1).mean(2)
    return kucuk(luma(a)), kucuk(a[:, :, 0]), kucuk(a[:, :, 1]), kucuk(a[:, :, 2])


def main():
    yol = sys.argv[1]
    c = int(sys.argv[2]) if len(sys.argv) > 2 else 130
    a = np.asarray(Image.open(yol).convert("RGB"), dtype=np.float32)
    L, R, G, B = bloklar(a, c)
    if L is None:
        print("kare cok kucuk, hucre %d px" % c)
        return
    gh, gw = L.shape
    Lm = L - L.mean()

    # Komsularin farki (kenar), sonra 5x5 ile buyutulmus yerel kontrast.
    komsu = np.zeros_like(Lm)
    say = 0
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            komsu += np.abs(np.roll(np.roll(Lm, dy, axis=0), dx, axis=1))
            say += 1
    komsu /= say

    # Kutu ile esleme: blok, kendi cevresindeki bloklardan ne kadar ayri?
    #
    # Once "global ortalamadan sapma" denendi ve sonucu bozdu: en karanlik
    # bloklari odullendiriyor, yani gozun gittigi yeri degil, ortalamadan en
    # uzak olan yeri olcuyordu. Gozun gittigi yer, kendi CEVRESINDEN ayridir.
    box = 5
    halka = np.zeros_like(Lm)
    halka_sayi = 0
    for dy in range(-box // 2, box // 2 + 1):
        for dx in range(-box // 2, box // 2 + 1):
            if dy == 0 and dx == 0:
                continue
            halka += np.roll(np.roll(Lm, dy, axis=0), dx, axis=1)
            halka_sayi += 1
    halka /= halka_sayi

    # Cyan ayrikligi: R ve B farki, yine kendi cevresine gore
    br = B - R
    br_halka = np.zeros_like(br)
    for dy in range(-box // 2, box // 2 + 1):
        for dx in range(-box // 2, box // 2 + 1):
            if dy or dx:
                br_halka += np.roll(np.roll(br, dy, axis=0), dx, axis=1)
    br_halka /= halka_sayi
    renk_ayri = np.abs(br - br_halka)

    skor = np.abs(Lm - halka)

    print("=== %s (%d px hucre, %dx%d izgara) ===" % (yol, c, gh, gw))
    print("konum: y -> resmin tepeden, x -> soldan")
    print()
    print("--- en ayirt edici bloklar (kendi cevresinden kacan) ---")
    s = skor.ravel()
    idx = np.argsort(s)[::-1][:8]
    for i in idx:
        y, x = divmod(int(i), gw)
        print("  y%4d-%4d x%4d-%4d  ayirt edicilik %+6.2f  luma %6.1f  RGB %s" % (
            y * c, (y + 1) * c, x * c, (x + 1) * c, Lm[y, x] - halka[y, x], L[y, x],
            np.array([R[y, x], G[y, x], B[y, x]]).round(0)))
    print()
    print("--- en cyan bloklar (hedefin rengi) ---")
    s2 = renk_ayri.ravel()
    idx2 = np.argsort(s2)[::-1][:5]
    for i in idx2:
        y, x = divmod(int(i), gw)
        print("  y%4d-%4d x%4d-%4d  B-R cevre farki %+6.1f  luma %6.1f  RGB %s" % (
            y * c, (y + 1) * c, x * c, (x + 1) * c, renk_ayri[y, x], L[y, x],
            np.array([R[y, x], G[y, x], B[y, x]]).round(0)))
    print()
    en_iyi = int(np.argmax(skor))
    y, x = divmod(en_iyi, gw)
    print("en ayirt edici blok: y%d x%d  -> tepeden %%%d, soldan %%%d" % (y, x, 100 * y // gh, 100 * x // gw))


if __name__ == "__main__":
    main()