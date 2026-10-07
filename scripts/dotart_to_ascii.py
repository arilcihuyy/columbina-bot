#!/usr/bin/env python3
"""Ubah dot-art Braille jadi ASCII karakter biasa (.,:;-=+*#%@).

Kenapa: font WhatsApp di HP tidak selalu punya glyph Braille (U+2800–U+28FF) —
di HP pengguna hasilnya jadi kotak/kosong, "ga jelas gambar apaan". Karakter ASCII
biasa pasti ada di semua font.

Alur: braille -> bitmap titik -> perkecil ke ukuran teks (dengan koreksi aspek
karena sel karakter ~2:1 tinggi:lebar) -> petakan kerapatan tiap sel ke ramp
karakter.

Pakai:
  python3 scripts/dotart_to_ascii.py <in.txt> --width 28 [--contrast 1.0] [--out x.txt] [--preview x.png]
"""
import argparse
import sys

sys.path.insert(0, "/home/ubuntu/wa-bot/scripts")
from braille_fit import load, to_bitmap  # noqa: E402

RAMP = " .:-=+*#%@"
# tinggi : lebar sel karakter monospace ≈ 1.16 : 0.6  -> ~1.93
CELL_ASPECT = 1.93


def to_ascii(lines, cols, contrast=1.0, gamma=1.0, rows=None):
    bmp = to_bitmap(lines)
    sh, sw = len(bmp), len(bmp[0])
    if not rows:
        rows = max(1, round(cols * sh / (CELL_ASPECT * sw)))

    # kerapatan tiap sel
    grid = []
    for r in range(rows):
        y0, y1 = int(r * sh / rows), max(int((r + 1) * sh / rows), int(r * sh / rows) + 1)
        row = []
        for c in range(cols):
            x0, x1 = int(c * sw / cols), max(int((c + 1) * sw / cols), int(c * sw / cols) + 1)
            tot = cnt = 0
            for yy in range(y0, min(y1, sh)):
                for xx in range(x0, min(x1, sw)):
                    tot += bmp[yy][xx]
                    cnt += 1
            row.append(tot / cnt if cnt else 0.0)
        grid.append(row)

    # normalisasi kontras: regangkan rentang kerapatan ke 0..1 supaya gambar jelas
    flat = [v for row in grid for v in row]
    lo, hi = min(flat), max(flat)
    span = (hi - lo) or 1.0
    out = []
    for row in grid:
        line = []
        for v in row:
            n = (v - lo) / span if contrast else v
            n = min(1.0, max(0.0, n)) ** gamma
            line.append(RAMP[min(len(RAMP) - 1, int(round(n * (len(RAMP) - 1) + 0.001)))])
        out.append("".join(line).rstrip())
    return out


def render_preview(lines, out_png, font_size=22):
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", font_size)
    cw, lh = font.getlength("M"), int(font_size * 1.15)
    w = max(len(l) for l in lines)
    img = Image.new("RGB", (int(w * cw) + 40, len(lines) * lh + 40), (10, 9, 16))
    d = ImageDraw.Draw(img)
    for y, line in enumerate(lines):
        d.text((20, 20 + y * lh), line, font=font, fill=(215, 195, 255))
    img.save(out_png)
    print(f"preview: {out_png} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--width", type=int, default=28)
    ap.add_argument("--rows", type=int, help="paksa tinggi baris (kalau tidak, dihitung dari aspek)")
    ap.add_argument("--contrast", type=float, default=1.0)
    ap.add_argument("--gamma", type=float, default=1.0)
    ap.add_argument("--out")
    ap.add_argument("--preview")
    a = ap.parse_args()

    lines = load(a.input)
    out = to_ascii(lines, a.width, a.contrast, a.gamma, a.rows)
    ascii_only = all(ord(ch) < 128 or ch == " " for l in out for ch in l)
    print(f"{a.input}: {max(len(l) for l in out)} kolom x {len(out)} baris | semua ASCII: {ascii_only}")
    if not ascii_only:
        raise SystemExit("masih ada karakter non-ASCII — akan jadi kotak di WhatsApp")
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out) + "\n")
        print(f"ditulis: {a.out}")
    if a.preview:
        render_preview(out, a.preview)
    if not a.out and not a.preview:
        print("\n".join(out))
