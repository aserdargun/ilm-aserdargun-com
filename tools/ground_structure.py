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
  /usr/bin/python3 tools/ground_structure.py A.png [B.png] [--cells 200] [--depth] [--box x,y,w,h]

--box tek bir bolgeyi kirpar. Neden var: tek bir bolge olculdugunde oranlar
sisiriyor. En duz bolgeyi secmek, payda (taban varyans) en kucuk oldugu icin
kucuk bir degisimi en cok buyutur. Gok taramasinda en duz 420x150 dikdortgeni
secmistim; bulut genligi 4,4 kat orada cikti, dort bolgeye yayinca gercek tablo
"%1'in altinda" idi. Ayni sebepten tek bir bolgeden karar verme.
"""
import sys

import numpy as np
from PIL import Image


def sand_mask(rgb):
    """
    The ground, found from the frame rather than assumed.

    The first version hard-coded a warm sand window — hue 25..70, saturation over
    0.20 — and reported that four of the eight islands had between 3% and 19% sand.
    They did not. Those islands are cool: the palette set runs from `#a89677` to
    `#98abac`, and the blue-greys fall straight out of a warm window. A measurement
    tool that quietly measures a fifth of the world is worse than no tool, because
    it still prints a number.

    So the ground is located the way a person would: find the hue the lower part
    of the frame is mostly made of, then take everything near it. That works for
    the olive islands and the ice-blue ones without being told which is which.
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

    h, w = luma.shape
    # The ground is the bottom of the frame, and in a third-person view the very
    # bottom is the ground under the player — always. Weighting by depth means a
    # wide sky or a canal near the horizon cannot outvote the ground that fills
    # the rows below, which is what left three islands reporting 4-15% sand.
    yy = (np.arange(h, dtype=np.float32) / h)[:, None]
    weight = np.clip((yy - 0.45) / 0.35, 0.0, 1.0) ** 2

    cand = (luma > 0.30) & (sat > 0.12)
    if cand.sum() < 500:
        return cand
    bins = np.clip((hue / 10).astype(int), 0, 35)
    counts = np.bincount(bins[cand], weights=(weight * sat)[cand], minlength=36)
    # Smooth circularly: a mode split across a bin edge is one hue, not two.
    counts = counts + np.roll(counts, 1) + np.roll(counts, -1)
    peak = int(counts.argmax())
    centre = peak * 10.0

    delta = np.abs(((hue - centre + 180.0) % 360.0) - 180.0)
    return (delta < 35) & (luma > 0.35) & (sat > 0.12)


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


def parse_args(argv):
    """
    `--cells` and `--box` take the next argv element as their value.

    Splitting on the leading `--` alone put the box coordinates in the file list,
    where the tool then tried to open "300,820,820,600" as an image. Anything with
    a value has to consume it explicitly.
    """
    paths = []
    cell = 200
    box = None
    depth_only = False
    i = 0
    while i < len(argv):
        token = argv[i]
        if token == "--cells":
            i += 1
            if i >= len(argv):
                raise SystemExit("--cells needs a value")
            cell = int(argv[i])
        elif token == "--box":
            i += 1
            if i >= len(argv):
                raise SystemExit("--box needs a value: x,y,w,h")
            parts = argv[i].split(",")
            if len(parts) != 4:
                raise SystemExit("--box must be x,y,w,h -- got %r" % argv[i])
            try:
                bx, by, bw, bh = (int(p) for p in parts)
            except ValueError:
                raise SystemExit("--box must be integers -- got %r" % argv[i])
            if bw <= 0 or bh <= 0:
                raise SystemExit("--box must have a positive size -- got %r" % argv[i])
            box = (bx, by, bw, bh)
        elif token == "--depth":
            depth_only = True
        elif token.startswith("--"):
            raise SystemExit("unknown flag %r" % token)
        else:
            paths.append(token)
        i += 1
    if not paths:
        raise SystemExit("usage: ground_structure.py A.png [B.png] [--cells 200] [--box x,y,w,h]")
    return paths, cell, box, depth_only


def main():
    args, cell, box, depth_only = parse_args(sys.argv[1:])
    sizes = (cell,) if depth_only else (128, cell, 400)

    for path in args:
        rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
        if box is not None:
            x, y, w, h = box
            if x + w > rgb.shape[1] or y + h > rgb.shape[0]:
                raise SystemExit(
                    "--box %s runs past the frame edge (%dx%d)"
                    % (box, rgb.shape[1], rgb.shape[0])
                )
            rgb = rgb[y : y + h, x : x + w]
        mask = sand_mask(rgb)
        luma = luma_of(rgb)
        share = mask.mean() * 100
        print(f"\n{path}" + (f"  [box {box[0]},{box[1]} {box[2]}x{box[3]}]" if box else ""))
        if share < 25.0:
            # Not an error, but it means the numbers below describe a fragment.
            # Three of the eight islands land here: their frames are dominated by
            # a landmark plinth or a canal, so the dominant hue is not the
            # ground's. Read the figures below as unknown rather than as small,
            # and go and look at the frame.
            print(
                "  UYARI: zemin maskesi yalnizca %.1f%% kareyi kapsiyor; "
                "asagidaki rakamlar parcayi olcer." % share
            )
        print("  kum payi %.2f%%   luma ort %.1f/255" % (share, luma[mask].mean() if mask.any() else 0))
        for size in sizes:
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