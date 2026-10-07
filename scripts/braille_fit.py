#!/usr/bin/env python3
"""Perkecil "dot art" Braille (U+2800–U+28FF) supaya muat dikirim sebagai teks
di WhatsApp, tanpa kehilangan bentuk.

Ide: 1 karakter Braille = grid 2x4 titik. Jadi art-nya di-unpack dulu jadi
bitmap titik, di-resize (box filter) ke ukuran target, lalu di-pack lagi jadi
karakter Braille. Karena titik Braille nyaris persegi saat dirender monospace,
resize bitmap = resize tampilan — proporsi tetap benar (tidak memanjang).

Pakai:
  python3 scripts/braille_fit.py <in.txt> --width 28 [--preview out.png] [--out out.txt]
"""
import argparse

# posisi dot -> bit (braille U+2800)
DOTS = [(0, 0, 0), (0, 1, 1), (0, 2, 2), (1, 0, 3), (1, 1, 4), (1, 2, 5), (0, 3, 6), (1, 3, 7)]


def load(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = [l.rstrip("\n") for l in fh.read().splitlines()]
    while lines and not lines[-1].strip("\u2800 "):
        lines.pop()
    if not lines:
        raise SystemExit("art kosong")
    w = max(len(l) for l in lines)
    return [l.ljust(w) for l in lines]


def to_bitmap(lines):
    rows, cols = len(lines), len(lines[0])
    bmp = [[0] * (cols * 2) for _ in range(rows * 4)]
    for y, line in enumerate(lines):
        for x, ch in enumerate(line):
            cp = ord(ch)
            if cp < 0x2800 or cp > 0x28FF:
                continue
            bits = cp - 0x2800
            for dx, dy, bit in DOTS:
                if bits & (1 << bit):
                    bmp[y * 4 + dy][x * 2 + dx] = 1
    return bmp


def resize(bmp, tw, th):
    sh, sw = len(bmp), len(bmp[0])
    out = [[0] * tw for _ in range(th)]
    for y in range(th):
        y0, y1 = int(y * sh / th), max(int((y + 1) * sh / th), int(y * sh / th) + 1)
        for x in range(tw):
            x0, x1 = int(x * sw / tw), max(int((x + 1) * sw / tw), int(x * sw / tw) + 1)
            tot = cnt = 0
            for yy in range(y0, min(y1, sh)):
                for xx in range(x0, min(x1, sw)):
                    tot += bmp[yy][xx]
                    cnt += 1
            out[y][x] = 1 if cnt and tot / cnt >= 0.42 else 0
    return out


def pack(bmp):
    th, tw = len(bmp), len(bmp[0])
    lines = []
    for cy in range(0, th, 4):
        row = []
        for cx in range(0, tw, 2):
            bits = 0
            for dx, dy, bit in DOTS:
                y, x = cy + dy, cx + dx
                if y < th and x < tw and bmp[y][x]:
                    bits |= 1 << bit
            row.append(chr(0x2800 + bits))
        lines.append("".join(row).rstrip("\u2800"))
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def fit(path, width):
    lines = load(path)
    bmp = to_bitmap(lines)
    sh, sw = len(bmp), len(bmp[0])
    tw = width * 2
    th = max(4, round(sh * tw / sw / 4) * 4)  # kelipatan 4 baris titik
    return pack(resize(bmp, tw, th)), (sh, sw, th, tw)


def render_preview(lines, out_png, font_size=18, color=(190, 170, 255), bg=(10, 9, 16)):
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", font_size)
    cw, lh = font.getlength("M"), int(font_size * 1.05)
    w = max(len(l) for l in lines)
    img = Image.new("RGB", (int(w * cw) + 40, len(lines) * lh + 40), bg)
    d = ImageDraw.Draw(img)
    for y, line in enumerate(lines):
        d.text((20, 20 + y * lh), line, font=font, fill=color)
    img.save(out_png)
    print(f"preview: {out_png} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--width", type=int, default=28)
    ap.add_argument("--out")
    ap.add_argument("--preview")
    a = ap.parse_args()

    out, (sh, sw, th, tw) = fit(a.input, a.width)
    print(f"{a.input}: bitmap {sw}x{sh} -> {tw}x{th} titik -> {max(len(l) for l in out)} kolom x {len(out)} baris teks")
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out) + "\n")
        print(f"ditulis: {a.out}")
    if a.preview:
        render_preview(out, a.preview)
    if not a.out and not a.preview:
        print("\n".join(out))
