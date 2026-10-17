#!/usr/bin/env python3
"""Paired 1:1 crops of two frames, stacked A-over-B, for side-by-side judging.

Motivation: comparing full frames by downscaling them into one sheet destroys
exactly the frequency band you are trying to evaluate. A 2596px frame squeezed
into a 407px panel is a 6.4x reduction -- octave content in the 2-11 world-unit
band disappears before the eye ever sees it. This tool never rescales the crops.

Usage:
  crop_ab.py A.png B.png --box x,y,w,h [--box ...] --out sheet.png [--label-a ..] [--label-b ..]

Each --box is a crop in FULL frame coordinates, identical for A and B, so the two
panels line up pixel-for-pixel. Boxes are evaluated in the order given, and the
sheet stacks each pair vertically. Report more than one box from non-adjacent
parts of the frame: a single "flattest" region inflates any ratio (see the
sky-cloud scan that reported a 2x gain at 0.065->0.130 when the real figure
across four regions was under 1%).
"""

import argparse
import sys

from PIL import Image, ImageDraw, ImageFont

PAD = 6
BAR = 22
SEPARATOR = 3


def load_font(size: int):
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def parse_box(text: str):
    parts = text.split(",")
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(f"box must be x,y,w,h -- got {text!r}")
    try:
        x, y, w, h = (int(p) for p in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"box must be integers -- got {text!r}") from exc
    if w <= 0 or h <= 0:
        raise argparse.ArgumentTypeError(f"box must have positive size -- got {text!r}")
    return (x, y, w, h)


def crop(img: Image.Image, box, name: str):
    x, y, w, h = box
    right, bottom = x + w, y + h
    if right > img.width or bottom > img.height:
        raise SystemExit(
            f"box {box} for {name} runs past the frame edge "
            f"({img.width}x{img.height})"
        )
    return img.crop((x, y, right, bottom))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--box", action="append", required=True, type=parse_box)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label-a", default=None)
    ap.add_argument("--label-b", default=None)
    args = ap.parse_args()

    img_a = Image.open(args.a).convert("RGB")
    img_b = Image.open(args.b).convert("RGB")
    if img_a.size != img_b.size:
        raise SystemExit(
            f"frame sizes differ: {args.a} is {img_a.size}, {args.b} is {img_b.size}. "
            "Refusing to crop frames that were not captured with the same camera."
        )

    label_a = args.label_a or args.a
    label_b = args.label_b or args.b
    font = load_font(15)
    draw_font = ImageDraw.Draw(Image.new("RGB", (1, 1)))

    panels = []
    for index, box in enumerate(args.box, start=1):
        top = crop(img_a, box, label_a)
        bottom = crop(img_b, box, label_b)
        caption_a = f"[{index}] A  {label_a}   box {box[0]},{box[1]} {box[2]}x{box[3]}  (1:1)"
        caption_b = f"[{index}] B  {label_b}   same box"
        width = box[2]
        sheet_h = BAR + top.height + PAD + BAR + bottom.height
        sheet = Image.new("RGB", (width, sheet_h), (18, 18, 20))
        d = ImageDraw.Draw(sheet)

        d.rectangle([0, 0, width, BAR], fill=(30, 60, 110))
        d.text((6, 3), caption_a, fill=(235, 240, 255), font=font)
        sheet.paste(top, (0, BAR))

        mid = BAR + top.height
        d.rectangle([0, mid, width, mid + PAD], fill=(60, 60, 66))
        d.rectangle([0, mid + PAD, width, mid + PAD + BAR], fill=(110, 50, 30))
        d.text((6, mid + PAD + 3), caption_b, fill=(255, 235, 220), font=font)
        sheet.paste(bottom, (0, mid + PAD + BAR))

        for text in (caption_a, caption_b):
            box_text = draw_font.textbbox((0, 0), text, font=font)
            if box_text[2] > width:
                print(
                    f"warning: caption wider than crop ({box_text[2]} > {width} px); "
                    "widen --box or accept truncation",
                    file=sys.stderr,
                )
        panels.append(sheet)

    total_h = sum(p.height for p in panels) + PAD * (len(panels) - 1)
    out = Image.new("RGB", (panels[0].width, total_h), (12, 12, 14))
    y = 0
    for panel in panels:
        out.paste(panel, (0, y))
        y += panel.height + PAD

    out.save(args.out)
    print(f"{args.out}  {out.width}x{out.height}  {len(args.box)} paired crop(s), 1:1, no rescale")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
