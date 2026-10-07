#!/usr/bin/env python3
"""Perkecil ASCII art supaya muat dikirim sebagai TEKS di WhatsApp.

ASCII lebar (mis. 101 kolom) selalu wrap di chat, jadi harus diperkecil.
Teknik: setiap blok sumber dirata-ratakan "kepadatan tinta"-nya lalu dipetakan
ke satu karakter dari ramp.

PENTING: ASCII art -> ASCII art TIDAK butuh kompensasi aspek. Grid sumber dan
grid hasil sama-sama karakter monospace, jadi pengecilan geometris murni sudah
mempertahankan proporsi. Memberi faktor 2 (karena "karakter lebih tinggi dari
lebar") justru bikin hasilnya MEMANJANG vertikal — itu bug yang pernah kejadian.

Pakai: python3 scripts/ascii_fit.py <in.txt> [--width 34] [--preview out.png]
"""
import argparse
import os
import sys

RAMP = " .:-=+*#%@"
DENSITY = {c: i / (len(RAMP) - 1) for i, c in enumerate(RAMP)}


def crop(lines, spec):
    r0, r1, c0, c1 = [int(v) for v in spec.split(",")]
    out = [l[c0:c1].rstrip() for l in lines[r0:r1]]
    out = [l for l in out if l.strip()] or out
    w = max(len(l) for l in out)
    return [l.ljust(w) for l in out]  # fit() butuh baris sama panjang


def load(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().replace("\t", "  ").splitlines()
    lines = [l.rstrip() for l in lines if l.strip()]
    w = max(len(l) for l in lines)
    return [l.ljust(w) for l in lines]


def ink(ch):
    if ch == " ":
        return 0.0
    return DENSITY.get(ch, 0.55)


def fit(lines, target_w, aspect=1.0):
    src_h, src_w = len(lines), len(lines[0])
    scale = target_w / src_w
    target_h = max(1, round(src_h * scale * aspect))
    grid = []
    for y in range(target_h):
        row = []
        y0, y1 = int(y * src_h / target_h), max(int((y + 1) * src_h / target_h), int(y * src_h / target_h) + 1)
        for x in range(target_w):
            x0, x1 = int(x * src_w / target_w), max(int((x + 1) * src_w / target_w), int(x * src_w / target_w) + 1)
            tot = cnt = 0
            for yy in range(y0, min(y1, src_h)):
                for xx in range(x0, min(x1, src_w)):
                    tot += ink(lines[yy][xx])
                    cnt += 1
            avg = tot / cnt if cnt else 0.0
            idx = min(len(RAMP) - 1, int(round(avg * (len(RAMP) - 1) * 1.35)))
            row.append(RAMP[idx])
        grid.append("".join(row).rstrip())
    return grid


def render_preview(grid, out_png, font_size=16):
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", font_size)
    cw, lh = font.getlength("M"), int(font_size * 1.1)
    w = max(len(l) for l in grid)
    img = Image.new("RGB", (int(w * cw) + 40, len(grid) * lh + 40), (10, 9, 16))
    d = ImageDraw.Draw(img)
    for y, line in enumerate(grid):
        for x, ch in enumerate(line):
            if ch == " ":
                continue
            i = RAMP.index(ch) / (len(RAMP) - 1)
            col = tuple(min(255, int(c)) for c in (120 + 110 * i, 90 + 60 * i, 220 - 20 * i))
            d.text((20 + x * cw, 20 + y * lh), ch, font=font, fill=col)
    img.save(out_png)
    print(f"preview: {out_png} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--width", type=int, default=34)
    ap.add_argument("--aspect", type=float, default=1.0)
    ap.add_argument("--crop", help="r0,r1,c0,c1 (baris0,baris1,kolom0,kolom1)")
    ap.add_argument("--preview")
    ap.add_argument("--out")
    a = ap.parse_args()

    src = load(a.input)
    if a.crop:
        src = crop(src, a.crop)
    grid = fit(src, a.width, a.aspect)
    text = "\n".join(grid)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"{a.out}: {len(grid)} baris x {max(len(l) for l in grid)} kolom")
    if a.preview:
        render_preview(grid, a.preview)
    if not a.out and not a.preview:
        print(text)
