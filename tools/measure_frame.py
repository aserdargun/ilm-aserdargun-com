#!/usr/bin/env python3
"""Acilis karesi icin olcum bataryasini tek komutta calistirir.

Bu oturumda alti ayri olcum araci yazildi ve her biri bir kez yanlis cikti:
sicak kum penceresi soguk adalari yok sayiyordu, titreme dedektoru merkez pikseli
komsuluga katiyordu, hucre std'i perspektif derinligiyle karisiyordu. Hepsi
ayri ayri dogrulandi, ama alti ayri komut hatirlamak yerine burada toplanmislari
var.

Kullanim:
  /usr/bin/python3 tools/measure_frame.py kare.png [kare2.png ...]
"""
import subprocess
import sys
import os

HEDEF = "/usr/bin/python3"
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ARACLAR = [
    ("tools/ground_structure.py", ["Zeminin genis olcekli deger yapisi"]),
    ("tools/saliency.py", ["Gozun nereye gittigi: deger ve ton kanali"]),
    ("tools/dark_regions.py", ["Karanlik bolgeler ve kara delik denetimi"]),
]


def calistir(yol, args):
    tam = os.path.join(KOK, yol)
    if not os.path.exists(tam):
        return None
    r = subprocess.run([HEDEF, tam] + args, capture_output=True, text=True, cwd=KOK)
    if r.returncode != 0:
        return "HATA:\n" + (r.stderr or "")[-400:]
    return r.stdout.rstrip()


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    print("=" * 78)
    print("KARE OLCUM BATARYASI  --  kareler: %s" % ", ".join(args))
    print("=" * 78)

    for kare in args:
        print()
        print("#" * 78)
        print("# %s" % kare)
        print("#" * 78)
        for yol, baslik in ARACLAR:
            print()
            print("--- %s ---" % baslik[0])
            cikti = calistir(yol, [kare])
            print(cikti if cikti else "  (arac bulunamadi)")

    # Iki kare verildiyse titreme de bakilir: ardışık kareler gerekiyor.
    if len(args) >= 2:
        print()
        print("--- Titreme (ardışık kareler) ---")
        cikti = calistir("tools/shimmer.py", args)
        print(cikti if cikti else "  (arac bulunamadi)")


if __name__ == "__main__":
    main()