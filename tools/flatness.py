#!/usr/bin/env python3
"""Bir karedeki "ölü düz" bölgeleri bulur ve buyuklugune gore siralar.

Neden ayri bir arac: hata avini ayri bir mercekle yapmak yetmiyor; ayni resim
Icinde hangi yuzeyin gercekten okunabilir oldugunu soyleyen bir alet gerekiyor.
Bu alet o soruyu sorar ve "bilmiyorum" demekten cok, olcumle cevap verir.

Yontem: 40x40 bloklara bol, her blogun yerel luma standart sapmasini hesapla,
std'in altinda kalan bloklari 4-komsuluk ile birlestir, bagli bilesenleri kare
payina gore sırala. Gokyuzu ayrica isaretlenir ve kirpma disinda birakilir.

Evet, gokyuzu de duz bir yuzeydir. Ama gokyuzunun duz olmasi onun isi, ve onu
raporun en ustune koymak, gercekten duz olan diger seyleri gormeyi engelliyor.
Bir kez sunu yapti: kanal on yuzu 72000 piksel boyunca std 0,035 okuyordu ve
karedeki en duz buyuk yuzeydi; gokyuzu 8,8 payla ve std 4,63 ile onun onundeydi
ve onu gormeyi engelliyordu.

Kullanim:
  /usr/bin/python3 tools/flatness.py kare.png [kare2.png ...] [--block 40] [--std 2.0]
"""

import argparse
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from dark_regions import label_components  # noqa: E402

# Gokyuzu bu araliktadir ve bu esikte neredeyse hicbir sey yassidir. Ust kenara
# degen bir bolge bu araliktaysa gokyuzu sayilir ve kirpma disinda birakilir.
#
# Dikkat: ufka yakin gokyuzu parcalari ust kenara degmedigi icin "incelenecek"
# olarak cikar. Bu kasintidir ve bilerek birakilmistir. Otomatik eleyebilmek
# icin ya ufkun yerini bulmak gerekir - ki o kareye ozgudur - ya da koyuluğa
# bakmak, ki bu da bir seyi koyu ve duz yapisal nesne olan seyle karistirir.
# Gozlemcilerin Aynalari'nin panelleri luma 15-18 okuyordu: tam da bu araliktaydi.
# Bir aletin gizleyebilecegi sey bulmaktan daha kotu, yanlis eleyecegi seyi
# bulmamaktir.
SKY_MAX_LUMA = 34.0


def audit(path, block, std_limit, min_blocks):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    luma = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    h, w = luma.shape
    gh, gw = h // block, w // block
    if gh < 2 or gw < 2:
        return None

    tiles = luma[: gh * block, : gw * block]
    tiles = tiles.reshape(gh, block, gw, block).transpose(0, 2, 1, 3)
    std = tiles.reshape(gh, gw, -1).std(axis=2)
    mean = tiles.reshape(gh, gw, -1).mean(axis=2)

    labels, n = label_components(std < std_limit)
    regions = []
    for i in range(1, n + 1):
        ys, xs = np.where(labels == i)
        if len(ys) < min_blocks:
            continue
        y0, y1 = int(ys.min()), int(ys.max())
        share = len(ys) * block * block / float(h * w) * 100.0
        luma_mean = float(mean[ys, xs].mean())
        std_mean = float(std[ys, xs].mean())
        touches_top = y0 <= 1
        is_sky = luma_mean <= SKY_MAX_LUMA and touches_top
        regions.append(
            {
                "share": share,
                "std": std_mean,
                "luma": luma_mean,
                "box": (int(xs.min()) * block, (x1 := int(xs.max()) + 1) * block, y0 * block, (y1 + 1) * block),
                "sky": is_sky,
            }
        )
    # En kotu once: buyuk ve duz olan. Ortalamak yerine carpim, cunku %1 pay ile
    # 0,1 std, %10 pay ile 2,0 std ayni seye gelmemeli.
    regions.sort(key=lambda r: -(r["share"] * max(r["std"], 0.4)))
    return {"regions": regions, "flat_share": float((std < std_limit).mean() * 100.0)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", nargs="+")
    ap.add_argument("--block", type=int, default=40)
    ap.add_argument("--std", type=float, default=2.0)
    ap.add_argument("--min-blocks", type=int, default=20)
    args = ap.parse_args()

    for path in args.frames:
        result = audit(path, args.block, args.std, args.min_blocks)
        if result is None:
            print("%s: kare bloklara bolunemiyor" % path)
            continue
        print(
            "\n%s   std<%.1f olan bloklar: %.1f%% kare"
            % (path, args.std, result["flat_share"])
        )
        print("%8s %8s %8s  %-22s %s" % ("pay%", "std", "luma", "konum", "not"))
        for r in result["regions"][:6]:
            x0, x1, y0, y1 = r["box"]
            note = "gokyuzu - duz olmasi dogru" if r["sky"] else "incelenecek"
            print(
                "%8.2f %8.2f %8.1f  x%-6d-%-6d y%-5d-%-5d %s"
                % (r["share"], r["std"], r["luma"], x0, x1, y0, y1, note)
            )


if __name__ == "__main__":
    main()