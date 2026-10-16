#!/usr/bin/env python3
"""Bir karedeki kumun genis olcekli deger yapisini olcer.

Neden ayri bir arac: bu olcum birkac kez elle yazildi ve her seferinde farkli
bir sekilde bozuldu — hucre yazma sonrasi perspektif derinligi karisti, sonra
kabuk alintilari kirildi. Tek yerde durmasi, ayni hatayi bir kez yapmaktan iyi.

Iki mod var:
  --cells   her bir olcekte hucre ortalamalarinin standart sapmasi
  --depth   satir ortalamasi cikarilmis; yalnizca ayni derinlik icindeki
            yanal degisimi olcer (derinlige gore hucre ayak izi degistigi icin
            --cells tek basina perspektif yanilgisiyla buyuyor)

Kullanim:
  /usr/bin/python3 tools/ground_structure.py A.png [B.png] [--cells 200] [--depth]
"""
import sys

import numpy as np
from PIL import Image


def sand_mask(rgb):
    """
    Scak, doygun, aydinlik pikseller. Kum tek ton oldugu icin esikler genis
    tutuldu; daraltmak maskeyi veriye gore degil, kafaya gore ayarlamak olurdu.
    """
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
    mx = rgb.max(2).astype(np.float32)
    mn = rgb.min(2).astype(np.float32)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    d = mx - mn
    m = d > 1e-6
    hue = np.zeros_like(mx)
    i = (r == mx) & m
    hue[i] = ((g[i] - b[i]) / np.maximum(d[i], 1e-6)) % 6
    i = (g == mx) & m
    hue[i] = ((b[i] - r[i]) / np.maximum(d[i], 1e-6)) + 2
    i = (b == mx) & m
    hue[i] = ((r[i] - g[i]) / np.maximum(d[i], 1e-6)) + 4
    hue *= 60
    return (luma > 0.42) & (r > b) & (sat > 0.20) & (hue >= 25) & (hue <= 70)


def luma_of(rgb):
    return (
        0.2126 * rgb[:, :, 0].astype(np.float32)
        + 0.7152 * rgb[:, :, 1].astype(np.float32)
        + 0.0722 * rgb[:, :, 2].astype(np.float32)
    )


def cells(mask, luma, size):
    """(std, n) — hücre ortalamalarının göreli standart sapması."""
    h, w = luma.shape
    gh, gw = h // size, w // size
    if gh < 2 or gw < 2:
        return float("nan"), 0
    lm = luma[: gh * size, : gw * size].reshape(gh, size, gw, size).transpose(0, 2, 1, 3)
    sm = mask[: gh * size, : gw * size].reshape(gh, size, gw, size).transpose(0, 2, 1, 3)
    ok = sm.mean(axis=(2, 3)) > 0.8
    keep = ok.sum(axis=1) >= 4
    if ok[keep].sum() < 5:
        return float("nan"), 0
    lm = lm.mean(axis=(2, 3))[keep][ok[keep]]
    return float(lm.std() / lm.mean() * 100), int(ok[keep].sum())


def cells_depth_normalised(mask, luma, size):
    """
    Satır ortalaması çıkarılmış sürüm.

    Bir satır sabit derinlik demektir ve o derinlikteki hücreler kabaca aynı
    dünya alanını kaplar. Düz sürümde hücrelerin alt alta değişmesi, kumun
    yapısından değil alt satırın daha çok karo örneklemiş olmasından gelir.
    """
    h, w = luma.shape
    gh, gw = h // size, w // size
    if gh < 2 or gw < 2:
        return float("nan"), 0
    lm = luma[: gh * size, : gw * size].reshape(gh, size, gw, size).transpose(0, 2, 1, 3).mean(axis=(2, 3))
    sm = mask[: gh * size, : gw * size].reshape(gh, size, gw, size).transpose(0, 2, 1, 3).mean(axis=(2, 3))
    ok = sm > 0.8
    keep = ok.sum(axis=1) >= 4
    if ok[keep].sum() < 5:
        return float("nan"), 0
    resid = lm - lm.mean(axis=1, keepdims=True)
    return float(resid[keep][ok[keep]].std() / lm[keep][ok[keep]].mean() * 100), int(ok[keep].sum())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    cell = 200
    if "--cells" in flags:
        cell = int(flags[flags.index("--cells") + 1])

    for path in args:
        rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
        mask = sand_mask(rgb)
        luma = luma_of(rgb)
        print(f"\n{path}")
        print("  kum payi %.2f%%   luma ort %.1f/255" % (mask.mean() * 100, luma[mask].mean()))
        for size in (128, cell, 400):
            raw, n = cells(mask, luma, size)
            dep, _ = cells_depth_normalised(mask, luma, size)
            print(
                "  %4dpx  hücre std %5.2f%% (n=%3d)   derinlik normalize %5.2f%%"
                % (size, raw, n, dep)
            )
        p2, p98 = np.percentile(luma[mask], [2, 98])
        print("  kum p02..p98 = %.1f .. %.1f  (aralık %.1f luma seviyesi)" % (p2, p98, p98 - p2))


if __name__ == "__main__":
    main()