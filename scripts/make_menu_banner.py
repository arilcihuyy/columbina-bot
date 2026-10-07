#!/usr/bin/env python3
"""Render ASCII art jadi banner PNG buat menu bot WA.

Kenapa PNG: ASCII art lebar (114 kolom) PASTI wrap di WhatsApp (APK HP / bubble
grup lebih sempit), jadi harus dikirim sebagai gambar, bukan teks.

Pakai: python3 scripts/make_menu_banner.py [input.txt] [output.png]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets", "menu-art.txt")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "assets", "menu-banner.png")

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_SIZE = 20
LINE_H = int(FONT_SIZE * 1.08)
PAD = 36
BG = (11, 10, 18)
# gradasi ungu → pink (dari karakter tipis ke tebal)
GRAD = [(96, 78, 200), (140, 92, 230), (188, 106, 232), (232, 122, 200), (255, 150, 190)]
DENSITY = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"


def load_art(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().replace("\t", "    ").splitlines()
    lines = [l.rstrip() for l in lines if l.strip()]
    if not lines:
        raise SystemExit("art kosong")
    width = max(len(l) for l in lines)
    return [l.ljust(width) for l in lines], width


def color_for(ch, intensity):
    if ch == " ":
        return None
    base = GRAD[min(len(GRAD) - 1, int(intensity * len(GRAD)))]
    # makin padat karakternya, makin terang
    boost = 0.55 + 0.45 * intensity
    return tuple(min(255, int(c * boost + 20)) for c in base)


def render(lines, width, out_path):
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    cw = font.getlength("M")  # lebar 1 karakter monospace
    img_w = int(width * cw) + PAD * 2
    img_h = len(lines) * LINE_H + PAD * 2

    base = Image.new("RGB", (img_w, img_h), BG)
    glow = Image.new("RGB", (img_w, img_h), (0, 0, 0))
    d_base = ImageDraw.Draw(base)
    d_glow = ImageDraw.Draw(glow)

    for y, row in enumerate(lines):
        y_pos = PAD + y * LINE_H
        for x, ch in enumerate(row):
            if ch == " ":
                continue
            idx = DENSITY.find(ch)
            intensity = (idx / (len(DENSITY) - 1)) if idx >= 0 else 0.45
            col = color_for(ch, intensity)
            x_pos = PAD + x * cw
            d_glow.text((x_pos, y_pos), ch, font=font, fill=tuple(int(c * 0.85) for c in col))
            d_base.text((x_pos, y_pos), ch, font=font, fill=col)

    # glow lembut saja — kalau terlalu kuat, detail karakter jadi kabur
    glow = glow.filter(ImageFilter.GaussianBlur(FONT_SIZE * 0.12))
    glow_mask = glow.convert("L").point(lambda v: min(255, int(v * 3.2)))
    out = Image.composite(glow, base, glow_mask.point(lambda v: min(255, int(v * 0.3))))

    out.save(out_path, "PNG", optimize=True)
    print(f"{out_path}  {out.size[0]}x{out.size[1]}px  {os.path.getsize(out_path)//1024} KB")


if __name__ == "__main__":
    art, w = load_art(SRC)
    print(f"art: {len(art)} baris x {w} kolom")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    render(art, w, OUT)
