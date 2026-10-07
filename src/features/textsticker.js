// Teks → stiker (statis) dan teks → stiker animasi (warna berganti).
// Di-port dari ChisatoBOT (github.com/TobyG74/ChisatoBOT,
// src/utils/converter/sticker.ts → generateTextSticker / generateAnimatedText),
// dibersihkan dari framework-nya dan disesuaikan dengan pipeline stiker wa-bot.
//
// Beda dari sumbernya (sengaja):
// - Sumber pakai `img2webp` (binari libwebp) buat menyusun animasi; di sini pakai
//   ffmpeg (`libwebp_anim`) yang sudah tersedia, jadi tidak perlu binari tambahan.
// - Sumber pakai `twemoji-parser`; di sini deteksi emoji sendiri lalu ambil PNG
//   twemoji dari CDN (di VPS tidak ada font emoji, jadi ini yang bikin emoji tampil).
// - Teks dibungkus beberapa baris + ukuran font dicari otomatis, jadi teks panjang
//   tidak jadi kecil tak terbaca seperti rumus di sumbernya (width / panjang teks).
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import axios from 'axios'
import ffmpeg from 'fluent-ffmpeg'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { workDir, cleanup } from './tmpdir.js'

export const CANVAS_SIZE = 512
export const PADDING = 44
export const MAX_TEXT_LEN = Number(process.env.TEXTSTICKER_MAX_LEN || 200)
export const STICKER_SIZE = 320 // ukuran stiker akhir (samakan dengan pipeline bot)
export const FRAME_DELAY_MS = Number(process.env.ANIMTEXT_FRAME_MS || 100)

const FONT_FAMILY = process.env.TEXTSTICKER_FONT || 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif'
const TWEMOJI_BASE = process.env.TWEMOJI_BASE || 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72'

// Palet warna (diambil dari ChisatoBOT) — satu palet dipakai per stiker animasi,
// tiap warna jadi satu frame. Palet dipilih acak supaya tidak monoton.
export const COLOR_PALETTES = [
  ['047af6', '7401df', '202532', '32fa00', 'ff00d5'],
  ['4db1c3', '046084', '35b07e', 'f0a7aa', 'e74758'],
  ['ffffff', 'f7a9ef', 'f881ec', 'f751e6', 'c400b0'],
  ['ffaf39', 'ee7e1b', 'ef421b', 'cf214b', 'bf1679'],
  ['86ff5d', '34e361', '14d285', '0ebb9b', '0c9ea9'],
  ['e0f4ff', 'cbecff', 'afe2ff', 'afd5ff', 'afc8ff'],
  ['d2dbde', '8debff', '84b7ff', 'b8b8b8', '08e1ff'],
  ['ffef2b', '2f4af4', 'ee1c62', '33ee87', '6cfcff'],
  ['6500ff', 'ffe04e', '8b00ff', 'bd93ed', '7400ff'],
]

export const pickPalette = (rand = Math.random) => COLOR_PALETTES[Math.floor(rand() * COLOR_PALETTES.length)]
export const hexColor = (c = '') => (String(c).startsWith('#') ? String(c) : `#${c}`)

/** Bersihkan teks: rapatkan spasi, buang karakter kontrol, batasi panjang. */
export function sanitizeText(input = '') {
  const clean = String(input)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > MAX_TEXT_LEN ? clean.slice(0, MAX_TEXT_LEN) : clean
}

// ── deteksi emoji ───────────────────────────────────────────────────────────
const isEmojiCp = (cp) => (
  (cp >= 0x1f000 && cp <= 0x1faff) ||
  (cp >= 0x2600 && cp <= 0x27bf) ||
  (cp >= 0x2b00 && cp <= 0x2bff) ||
  (cp >= 0x2190 && cp <= 0x21ff) ||
  (cp >= 0x2900 && cp <= 0x297f) ||
  (cp >= 0x1f1e6 && cp <= 0x1f1ff) ||
  [0x00a9, 0x00ae, 0x203c, 0x2049, 0x2122, 0x3030, 0x303d].includes(cp)
)

const isRegional = (cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff

/**
 * Pecah teks jadi potongan: { text } untuk teks biasa, { emoji: true, cps } untuk
 * emoji — termasuk ZWJ sequence (👨‍👩‍👧), variation selector (❤️), warna kulit
 * (👍🏽) dan bendera (dua regional indicator).
 */
export function splitEmoji(text = '') {
  const parts = []
  let buf = ''
  const pushBuf = () => { if (buf) { parts.push({ text: buf }); buf = '' } }
  const appendToEmoji = (cp) => {
    const l = parts[parts.length - 1]
    if (l?.emoji) { l.cps.push(cp); return true }
    return false
  }

  const chars = [...String(text)]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const cp = ch.codePointAt(0)
    const prevCp = i > 0 ? chars[i - 1].codePointAt(0) : 0

    // penyambung emoji: ZWJ, variation selector, warna kulit — dicek DULU karena
    // rentang codepoint-nya bertumpuk dengan emoji biasa (mis. 🏽 U+1F3FD)
    if ((cp === 0x200d || cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff)) && appendToEmoji(cp)) continue

    if (isEmojiCp(cp)) {
      // lanjutan ZWJ sequence, atau regional kedua untuk bendera
      const last = parts[parts.length - 1]
      const isContinuation = prevCp === 0x200d || (isRegional(cp) && last?.emoji && last.cps.length === 1 && isRegional(last.cps[0]))
      if (isContinuation && appendToEmoji(cp)) continue
      pushBuf()
      parts.push({ emoji: true, cps: [cp] })
      continue
    }
    buf += ch
  }
  pushBuf()
  return parts
}

/** Nama file twemoji dari daftar codepoint (coba beberapa varian). */
export function twemojiCandidates(cps = []) {
  const base = cps.map((cp) => cp.toString(16))
  const list = [base.join('-')]
  const noVs = base.filter((h) => h !== 'fe0f')
  if (noVs.length && noVs.join('-') !== list[0]) list.push(noVs.join('-'))
  if (!base.includes('fe0f') && base.length === 1) list.push(`${base[0]}-fe0f`)
  return list
}

const emojiCache = new Map()

/** Ambil PNG twemoji (di-cache). null = tidak dapat diunduh (nanti digambar sebagai teks). */
export async function fetchEmoji(cps = [], { timeout = 8000 } = {}) {
  const key = cps.join('-')
  if (emojiCache.has(key)) return emojiCache.get(key)
  for (const name of twemojiCandidates(cps)) {
    const url = `${TWEMOJI_BASE}/${name}.png`
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout })
      const buf = Buffer.from(res.data)
      if (buf.length) { emojiCache.set(key, buf); return buf }
    } catch { /* coba varian berikutnya */ }
  }
  emojiCache.set(key, null)
  return null
}

export const clearEmojiCache = () => emojiCache.clear()

// ── tata letak teks ─────────────────────────────────────────────────────────

/** Bungkus potongan teks jadi baris. Emoji dihitung selebar font size-nya. */
export function wrapParts(ctx, parts, maxWidth, fontSize) {
  const lines = []
  let line = []
  let width = 0
  const spaceW = ctx.measureText(' ').width
  const widthOf = (p) => (p.emoji ? fontSize : ctx.measureText(p.text).width)

  for (const part of parts) {
    const tokens = part.emoji
      ? [part]
      : part.text.split(' ').filter((w) => w.length).map((w) => ({ text: w }))
    for (const token of tokens) {
      const w = widthOf(token)
      if (line.length && width + spaceW + w > maxWidth) {
        lines.push({ parts: line, width })
        line = []
        width = 0
      }
      if (!line.length) { line.push(token); width = w; continue }
      line.push(token)
      width += spaceW + w
    }
  }
  if (line.length) lines.push({ parts: line, width })
  return lines.length ? lines : [{ parts: [], width: 0 }]
}

/** Cari ukuran font terbesar yang masih muat di kotak (lebar × tinggi). */
export function fitText(ctx, parts, { boxWidth, boxHeight, maxFont = 150, minFont = 16 }) {
  for (let size = maxFont; size >= minFont; size -= 2) {
    ctx.font = `bold ${size}px ${FONT_FAMILY}`
    const lines = wrapParts(ctx, parts, boxWidth, size)
    const lineHeight = size * 1.18
    if (lines.length * lineHeight <= boxHeight) return { size, lines, lineHeight }
  }
  ctx.font = `bold ${minFont}px ${FONT_FAMILY}`
  const lines = wrapParts(ctx, parts, boxWidth, minFont)
  return { size: minFont, lines, lineHeight: minFont * 1.18 }
}

/** Gambar satu baris (teks + emoji), rata tengah pada y. */
async function drawLine(ctx, line, startX, y, fontSize, { fill, stroke, strokeWidth = 0 }) {
  const spaceW = ctx.measureText(' ').width

  // 1) garis tepi (outline) untuk bagian teks saja
  if (strokeWidth > 0) {
    ctx.save()
    ctx.lineWidth = strokeWidth
    ctx.strokeStyle = stroke
    ctx.lineJoin = 'round'
    let sx = startX
    for (const [i, token] of line.parts.entries()) {
      if (i > 0) sx += spaceW
      if (token.emoji) { sx += fontSize; continue }
      ctx.strokeText(token.text, sx, y)
      sx += ctx.measureText(token.text).width
    }
    ctx.restore()
  }

  // 2) isi teks + gambar emoji
  let x = startX
  for (const [i, token] of line.parts.entries()) {
    if (i > 0) x += spaceW
    if (token.emoji) {
      const png = await fetchEmoji(token.cps)
      let drawn = false
      if (png) {
        try {
          const img = await loadImage(png)
          ctx.drawImage(img, x, y - fontSize * 0.5, fontSize, fontSize)
          drawn = true
        } catch { drawn = false }
      }
      if (!drawn) {
        ctx.fillStyle = fill
        ctx.fillText(String.fromCodePoint(...token.cps), x, y)
      }
      x += fontSize
    } else {
      ctx.fillStyle = fill
      ctx.fillText(token.text, x, y)
      x += ctx.measureText(token.text).width
    }
  }
}

/** Render satu frame PNG (untuk stiker statis maupun tiap frame animasi). */
export async function renderFrame(text, { size = CANVAS_SIZE, color = '#ffffff', outline = null, glow = null } = {}) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  const parts = splitEmoji(text)
  const box = { boxWidth: size - PADDING * 2, boxHeight: size - PADDING * 2 }
  const { size: fontSize, lines, lineHeight } = fitText(ctx, parts, box)

  if (glow) {
    ctx.shadowColor = glow.color ?? color
    ctx.shadowBlur = glow.blur ?? 2
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
  }

  const totalHeight = lines.length * lineHeight
  let y = size / 2 - totalHeight / 2 + lineHeight / 2
  for (const line of lines) {
    await drawLine(ctx, line, (size - line.width) / 2, y, fontSize, {
      fill: color,
      stroke: outline,
      strokeWidth: outline ? Math.max(1, Math.floor(fontSize / 20)) : 0,
    })
    y += lineHeight
  }

  ctx.shadowBlur = 0
  return canvas.encode('png')
}

// ── gaya lama: teks putih transparan (classic) & rainbow — dipakai lewat env ──

// ── perakitan stiker ────────────────────────────────────────────────────────
// Dir kerja (dan `cleanup`) dipakai bersama semua fitur — lihat features/tmpdir.js.
// JANGAN balik ke os.tmpdir(): /tmp bisa dibersihkan saat bot jalan dan bikin
// semua konversi ENOENT sampai bot di-restart.
export const runDir = () => workDir('textsticker-')
export { cleanup }

/** Statis: teks → PNG 512 (putih + garis tepi hitam), siap masuk pipeline stiker. */
export async function renderTextPng(text) {
  const clean = sanitizeText(text)
  if (!clean) throw new Error('Teksnya kosong.')
  return renderFrame(clean, { color: '#ffffff', outline: '#000000' })
}

/**
 * Animasi: teks → webp ANIMASI (warna berganti tiap frame, seperti ChisatoBOT).
 * Frame dirender 512 lalu ffmpeg mengecilkan ke 320×320 sambil menyusun animasinya.
 */
export async function renderAnimatedTextWebp(text, { palette = pickPalette(), size = CANVAS_SIZE } = {}) {
  const clean = sanitizeText(text)
  if (!clean) throw new Error('Teksnya kosong.')

  const dir = runDir()
  try {
    for (const [i, raw] of palette.entries()) {
      const color = hexColor(raw)
      const png = await renderFrame(clean, { size, color, glow: { color, blur: 2 } })
      fs.writeFileSync(path.join(dir, `frame-${i}.png`), png)
    }

    const out = path.join(dir, 'out.webp')
    const framerate = Math.max(1, Math.round(1000 / FRAME_DELAY_MS))
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(dir, 'frame-%d.png'))
        .inputOptions(['-framerate', String(framerate)])
        .outputOptions([
          '-c:v', 'libwebp_anim',
          '-loop', '0',
          '-q:v', String(process.env.ANIMTEXT_QUALITY || 60),
          '-pix_fmt', 'yuva420p',
          '-vf', `scale=${STICKER_SIZE}:${STICKER_SIZE}`,
          '-an',
        ])
        .on('error', reject)
        .on('end', resolve)
        .save(out)
    })
    return { buffer: fs.readFileSync(out), palette: palette.map(hexColor), frames: palette.length }
  } finally {
    cleanup(dir)
  }
}
