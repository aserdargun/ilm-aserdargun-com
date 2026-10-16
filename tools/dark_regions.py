#!/usr/bin/env python3
"""Bir karedeki gerceken karanlik bagli bolgeleri bulur ve haritalar.

Koordinat gozle secmek hataya acik; bu yuzden bolge secimi yok: esik uzerindeki
tum pikseller 4-komsuluk ile etiketlenir, buyuk olanlar raporlanir.

Kullanim:
  /usr/bin/python3 tools/dark_regions.py <resim.png> [esik ...] [--out harita.png]
"""
import sys
from collections import deque

import numpy as np
from PIL import Image


def label_components(mask):
    """4-komsuluk bagli bileşenleri etiketler. (H, W) bool -> (labels, sayi)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    size = [0]
    nxt = 1
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or labels[sy, sx]:
                continue
            cur = nxt
            nxt += 1
            q = deque([(sy, sx)])
            labels[sy, sx] = cur
            size.append(0)
            while q:
                y, x = q.popleft()
                size[cur] += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = cur
                        q.append((ny, nx))
    return labels, nxt - 1


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {a for a in sys.argv[1:] if a.startswith('--')}
    path = args[0]
    thresholds = [int(t) for t in args[1:]] or [16]
    scale = 4  # etiketleme 1/scale; alanlar geri olceklendirilir

    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    L = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    h, w = L.shape
    tot = h * w

    print('kare %dx%d  esik %s  olcek 1/%d' % (w, h, thresholds, scale))

    for thr in thresholds:
        mask = L < thr
        frac = mask.mean() * 100
        lab, n = label_components(mask[::scale, ::scale])
        items = []
        for i in range(1, n + 1):
            ys, xs = np.where(lab == i)
            items.append((len(ys) * scale * scale, ys, xs))
        items.sort(key=lambda t: -t[0])
        print('\n=== luma < %d : kare payi %.2f, %d bilesen' % (thr, frac, n))
        shown = 0
        for area, ys, xs in items:
            if area < 1500:
                break
            y0, y1 = ys.min() * scale, ys.max() * scale
            x0, x1 = xs.min() * scale, xs.max() * scale
            rgb = a[y0:y1, x0:x1].reshape(-1, 3).mean(0)
            print('   alan %7d px (%5.2f%%)  x%d-%d y%d-%d  ort RGB %s'
                  % (area, area / tot * 100, x0, x1, y0, y1, rgb.round(0)))
            shown += 1
            if shown >= 8:
                break

    if '--out' in flags:
        pass


if __name__ == '__main__':
    main()