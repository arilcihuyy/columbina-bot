// ── GAYA BRAT (resep asli, dibaca dari kode bratgenerator.io) ───────────────
// CSS aslinya di situs itu:
//
//   .text-box { aspect-ratio: 1/1; background:#8ACE00; padding:20px;
//               display:flex; align-items:center; justify-content:center; overflow:hidden }
//   .stretched-text {
//       transform: scaleY(1.5);        ← INI kunci bentuk brat
//       font-size: 30px;               ← slider 10..100, default 30
//       color:#000; filter: blur(0.7px);
//       max-width: 90%; word-wrap: break-word;
//       text-align: justify;           ← bukan center!
//       font-family: 'CustomFont','Arial Narrow',Arial,sans-serif;
//   }
//
// Catatan penting hasil bedah:
// 1. 'CustomFont' (fonts/Brat.ttf) ternyata = **Arial Narrow Regular** (nama di
//    dalam fontnya persis "Arial Narrow", © Monotype). Jadi tidak ada font "brat"
//    khusus: brat = Arial Narrow + stretch vertikal 1.5×. Karena Arial Narrow itu
//    font komersial, di sini dipakai klon bebasnya: Nimbus Sans Narrow (URW).
// 2. Weight-nya NORMAL (400), bukan bold. Kesannya tebal datang dari stretch 1.5×.
// 3. text-align: justify → semua baris KECUALI baris terakhir direntangkan
//    mentok kiri-kanan (spasi antar kata yang melebar). Baris terakhir rata kiri.
// 4. Blok teks di tengah, lebar maksimum 90% dari area dalam padding.
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { CANVAS_SIZE, STICKER_SIZE, sanitizeText, splitEmoji, fetchEmoji, runDir, cleanup } from './textsticker.js'
import { fontStack, registeredFamilies } from './fonts.js'
// Urutan font: dari env BRAT_FONT, lalu font yang ada di assets/fonts/, lalu cadangan.
// Arial Narrow asli (font komersial Monotype) tidak boleh disebar di repo publik;
// pengganti terdekat yang legal = Archivo Narrow (OFL) — bentuk hurufnya paling mirip
// Arial ('t' miring, 'a' berekor). Lihat src/features/fonts.js.
export const BRAT_FONT = fontStack(process.env.BRAT_FONT, [
  'Arial',                     // opsional: taruh ARIAL.TTF di assets/fonts/ (font tidak bebas redistribusi)
  'Archivo Narrow',            // tersedia di assets/fonts (OFL) — paling mirip Arial Narrow
  'Arial Narrow',              // kalau ada di sistem (lisensi pengguna sendiri)
  'Liberation Sans Narrow',
  'Nimbus Sans Narrow',        // klon Helvetica (bawaan Linux)
  'Helvetica Neue', 'Helvetica', 'sans-serif',
])
export const BRAT_BG = process.env.BRAT_BG || '#ffffff'
export const BRAT_FG = process.env.BRAT_FG || '#000000'
export const BRAT_WEIGHT = Number(process.env.BRAT_WEIGHT ?? 400)
export const BRAT_STRETCH = Number(process.env.BRAT_STRETCH ?? 1.5) // scaleY
export const BRAT_LINE_HEIGHT = Number(process.env.BRAT_LINE_HEIGHT ?? 1.07) // Arial Narrow "normal"
export const BRAT_PAD_RATIO = Number(process.env.BRAT_PAD ?? 20 / 300) // padding 20px di kotak 300px
export const BRAT_MAX_TEXT_WIDTH = Number(process.env.BRAT_MAX_WIDTH ?? 0.9) // max-width 90%
export const BRAT_BLUR = Number(process.env.BRAT_BLUR ?? 0.7) // px pada skala kotak asli
export const BRAT_UPPERCASE = (process.env.BRAT_CASE || 'lower').toLowerCase() === 'upper'
/**
 * Mode ukuran font (env BRAT_FIT):
 *   'shrink' (default) = mulai dari ukuran situs (30/300), lalu DIKECILKAN kalau teks
 *                        tidak muat — jadi teks pendek tetap seperti situs, teks panjang
 *                        tidak meluber keluar kotak.
 *   'grow'             = font dicari otomatis supaya mengisi kotak (teks pendek jadi besar).
 *   'off'              = persis situs apa adanya (font tetap; teks panjang bisa terpotong).
 */
export const BRAT_FIT = (() => {
  const v = String(process.env.BRAT_FIT || 'shrink').toLowerCase()
  if (['0', 'off', 'false', 'none'].includes(v)) return 'off'
  if (['1', 'grow', 'fill', 'true'].includes(v)) return 'grow'
  return 'shrink'
})()
/** Batas pelebaran spasi justify (kelipatan font size).
 *  Infinity (default) = persis situs: baris dijustify sampai mentok kanan, berapa pun
 *  lebar spasinya. Isi angka (mis. 0.4) kalau mau spasi dibatasi. */
export const BRAT_JUSTIFY_MAX = process.env.BRAT_JUSTIFY_MAX ? Number(process.env.BRAT_JUSTIFY_MAX) : Infinity
/** Ukuran font NORMAL (px) pada kanvas render (512) — dipakai untuk teks yang muat.
 *  Situs memakai 30/300 dari kotak (≈51px); di sini digedein jadi 85px. */
export const BRAT_FONT_PX = Number(process.env.BRAT_FONT_PX ?? 85)
/** Rasio font terhadap sisi kotak. Default = BRAT_FONT_PX / 512. */
export const BRAT_FONT_RATIO = process.env.BRAT_FONT_RATIO
  ? Number(process.env.BRAT_FONT_RATIO)
  : BRAT_FONT_PX / CANVAS_SIZE

/** Huruf kecil semua (gaya brat). Bisa dimatikan dengan BRAT_CASE=upper. */
export const bratCase = (text = '') => (BRAT_UPPERCASE ? String(text).toUpperCase() : String(text).toLowerCase())

/** Pecah teks jadi token: { text: 'kata' } atau { emoji: true, cps: [...] }. */
export function toTokens(text = '') {
  const tokens = []
  for (const part of splitEmoji(text)) {
    if (part.emoji) tokens.push({ emoji: true, cps: part.cps })
    else for (const word of part.text.split(' ').filter(Boolean)) tokens.push({ text: word })
  }
  return tokens
}

/**
 * Bungkus token jadi baris. Kata TIDAK dipenggal, kecuali satu kata sendirian sudah
 * lebih lebar dari kotak — itu perilaku CSS `overflow-wrap: break-word` di situsnya.
 */
export function wrapTokens(ctx, tokens, maxWidth, fontSize, { breakWords = true } = {}) {
  const lines = []
  let line = []
  let width = 0
  const spaceW = ctx.measureText(' ').width
  const widthOf = (t) => (t.emoji ? fontSize : ctx.measureText(t.text).width)

  const pushLine = () => { if (line.length) { lines.push(line); line = []; width = 0 } }

  for (const token of tokens) {
    const w = widthOf(token)
    // hanya pecah kalau kata ini SENDIRI sudah tidak muat (persis break-word CSS)
    if (!token.emoji && w > maxWidth && breakWords) {
      pushLine()
      let piece = ''
      for (const ch of token.text) {
        const test = piece + ch
        if (piece && ctx.measureText(test).width > maxWidth) { lines.push([{ text: piece }]); piece = ch }
        else piece = test
      }
      if (piece) { line = [{ text: piece }]; width = ctx.measureText(piece).width }
      continue
    }
    if (line.length && width + spaceW + w > maxWidth) {
      lines.push(line)
      line = [token]
      width = w
      continue
    }
    line.push(token)
    width += (line.length > 1 ? spaceW : 0) + w
  }
  pushLine()
  return lines.length ? lines : [[]]
}

/** Lebar satu baris token (tanpa menggambar). */
export function lineWidth(ctx, line, fontSize) {
  const spaceW = ctx.measureText(' ').width
  let w = 0
  line.forEach((t, i) => { w += (i ? spaceW : 0) + (t.emoji ? fontSize : ctx.measureText(t.text).width) })
  return w
}

/** Tinggi blok teks pakai metrik huruf asli. */
function measureBlock(ctx, lines, lineStep, fontSize) {
  let ascent = 0
  let descent = 0
  for (const line of lines) {
    for (const t of line) {
      const m = t.emoji ? { actualBoundingBoxAscent: fontSize * 0.86, actualBoundingBoxDescent: fontSize * 0.14 } : ctx.measureText(t.text)
      ascent = Math.max(ascent, m.actualBoundingBoxAscent || 0)
      descent = Math.max(descent, m.actualBoundingBoxDescent || 0)
    }
  }
  return { ascent, descent, height: lineStep * (lines.length - 1) + ascent + descent }
}

/**
 * Susun tata letak brat.
 *
 * `fit`:
 *   'shrink' (default) → ukuran situs (30/300) sebagai batas ATAS, dikecilkan hanya
 *                        kalau teks tidak muat. Teks pendek = seperti situs; teks
 *                        panjang = tetap masuk kotak (tidak meluber).
 *   'grow'             → font dicari otomatis supaya mengisi kotak.
 *   'off'              → persis situs: font tetap, teks panjang bisa terpotong.
 */
export function layoutBrat(ctx, text, {
  size = CANVAS_SIZE,
  stretch = BRAT_STRETCH,
  fontSize = null,
  pad = null,
  maxWidth = BRAT_MAX_TEXT_WIDTH,
  fit = BRAT_FIT,
  lineHeight = BRAT_LINE_HEIGHT,
  maxFont = 400,
  minFont = null,
} = {}) {
  const padPx = pad ?? Math.round(size * BRAT_PAD_RATIO)
  const content = size - padPx * 2
  const boxWidth = content * maxWidth
  const tokens = toTokens(text)
  const fontSitus = fontSize ?? size * BRAT_FONT_RATIO
  const min = minFont ?? Math.max(6, size * 0.018)

  const build = (f) => {
    ctx.font = `${BRAT_WEIGHT} ${f}px ${BRAT_FONT}`
    const lines = wrapTokens(ctx, tokens, boxWidth, f)
    const lineStep = f * lineHeight
    const block = measureBlock(ctx, lines, lineStep, f)
    const blockWidth = Math.max(...lines.map((l) => lineWidth(ctx, l, f)), 0)
    const widestToken = Math.max(...tokens.map((t) => (t.emoji ? f : ctx.measureText(t.text).width)), 0)
    return { fontSize: f, lines, lineStep, block, blockWidth, widestToken, pad: padPx, content, boxWidth, fontSitus }
  }

  // teks muat? cek lebar DAN tinggi blok SETELAH distretch (1.5×)
  const muat = (L) => L.widestToken <= boxWidth && L.blockWidth <= boxWidth && L.block.height * stretch <= content

  if (fit === 'off' || fit === false) return build(fontSitus)

  if (fit === 'grow' || fit === true) {
    for (let f = maxFont; f >= min; f -= 1) {
      const L = build(f)
      if (muat(L)) return L
    }
    return build(min)
  }

  // 'shrink': hormati ukuran situs selama masih muat, kecilkan hanya kalau perlu
  const awal = build(fontSitus)
  if (muat(awal)) return awal
  for (let f = Math.floor(fontSitus); f >= min; f -= 1) {
    const L = build(f)
    if (muat(L)) return L
  }
  return build(min)
}

/** Gambar satu baris token; kalau extraSpace > 0, spasi antar kata dilebarkan (justify). */
async function drawJustifiedLine(ctx, line, startX, y, fontSize, fg, extraSpace = 0) {
  const spaceW = ctx.measureText(' ').width + extraSpace
  let x = startX

  for (const [i, token] of line.entries()) {
    if (i) x += spaceW
    if (token.emoji) {
      const png = await fetchEmoji(token.cps)
      let drawn = false
      if (png) {
        try {
          const img = await loadImage(png)
          ctx.drawImage(img, x, y - fontSize * 0.86, fontSize, fontSize)
          drawn = true
        } catch { drawn = false }
      }
      if (!drawn) { ctx.fillStyle = fg; ctx.fillText(String.fromCodePoint(...token.cps), x, y) }
      x += fontSize
    } else {
      ctx.fillStyle = fg
      ctx.fillText(token.text, x, y)
      x += ctx.measureText(token.text).width
    }
  }
}

/**
 * Gambar satu frame gaya brat:
 * background penuh → blok teks di tengah, baris di-justify, lalu distretch
 * vertikal (scaleY) dan diberi blur tipis — persis perilaku CSS situs aslinya.
 */
export async function renderBratFrame(text, {
  size = CANVAS_SIZE,
  bg = BRAT_BG,
  fg = BRAT_FG,
  blur = BRAT_BLUR,
  stretch = BRAT_STRETCH,
  zoom = 1, // untuk animasi
  fontSize = null,
  pad = null,
  maxWidth = BRAT_MAX_TEXT_WIDTH,
  fit = BRAT_FIT,
  lineHeight = BRAT_LINE_HEIGHT,
  justifyMax = BRAT_JUSTIFY_MAX,
} = {}) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  const L = layoutBrat(ctx, text, { size, stretch, fontSize, pad, maxWidth, fit, lineHeight })
  const { fontSize: fs2, lines, lineStep, block, blockWidth } = L

  ctx.font = `${BRAT_WEIGHT} ${fs2}px ${BRAT_FONT}`
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  // blur diskalakan dari kotak asli situs (300px) ke kanvas kita, tapi dibatasi
  // supaya teks kecil (hasil pengecilan otomatis) tidak jadi lembek tak terbaca
  const blurPx = Math.min(blur * (size / 300), fs2 * 0.08)
  if (blurPx > 0) ctx.filter = `blur(${blurPx.toFixed(2)}px)`

  // transform: stretch vertikal (dan zoom untuk animasi) terhadap titik tengah.
  // plus "jaring pengaman": kalau blok teks masih lebih besar dari kotak (teks
  // ekstrem), seluruh gambar dikecilkan sedikit supaya TIDAK ADA yang keluar frame.
  const skalaAman = Math.min(
    1,
    (L.content - 2) / Math.max(1, L.block.height * stretch),
    (L.boxWidth) / Math.max(1, L.blockWidth),
  )
  ctx.translate(size / 2, size / 2)
  ctx.scale(zoom * skalaAman, stretch * zoom * skalaAman)
  ctx.translate(-size / 2, -size / 2)

  const startX = (size - blockWidth) / 2
  let y = (size - block.height) / 2 + block.ascent

  for (const [i, line] of lines.entries()) {
    const isLast = i === lines.length - 1
    const w = lineWidth(ctx, line, fs2)
    const gaps = Math.max(1, line.length - 1)
    // justify: semua baris kecuali baris terakhir direntangkan sampai blockWidth.
    // justifyMax membatasi pelebaran spasi (kalau tidak, baris berisi 2 kata bisa
    // punya celah raksasa — perilaku asli situs, tapi jelek untuk stiker).
    let extra = !isLast && w < blockWidth ? (blockWidth - w) / gaps : 0
    if (Number.isFinite(justifyMax)) extra = Math.min(extra, justifyMax * fs2)
    await drawJustifiedLine(ctx, line, startX, y, fs2, fg, extra)
    y += lineStep
  }
  ctx.filter = 'none'
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  return {
    buffer: await canvas.encode('png'),
    info: {
      ...L,
      bg, fg, blur: blurPx, stretch, skalaAman,
      text: lines.map((l) => l.map((t) => (t.emoji ? String.fromCodePoint(...t.cps) : t.text)).join(' ')).join(' / '),
      justified: lines.length > 1,
      muat: block.height * stretch <= L.content + 1 && blockWidth <= L.boxWidth + 1,
    },
  }
}

/** Stiker brat statis (PNG) — siap masuk pipeline stiker. */
export async function renderBratPng(text, opts = {}) {
  const clean = bratCase(sanitizeText(text))
  if (!clean) throw new Error('Teksnya kosong.')
  const { buffer, info } = await renderBratFrame(clean, { fit: BRAT_FIT, ...opts })
  return { buffer, info }
}

/**
 * Stiker brat ANIMASI: teks membesar-mengecil halus (zoom) di atas background putih.
 * Dipakai kalau ANIMTEXT_STYLE=brat (default).
 */
export async function renderBratAnimatedWebp(text, { frames = Number(process.env.BRAT_ANIM_FRAMES || 6), size = CANVAS_SIZE } = {}) {
  const clean = bratCase(sanitizeText(text))
  if (!clean) throw new Error('Teksnya kosong.')

  const dir = runDir()
  try {
    // Pola zoom: mengecil bertahap lalu kembali penuh saat animasi berulang
    // (efek "denyut"). Tiap frame WAJIB beda — kalau ada dua frame yang identik,
    // muxer libwebp_anim menggabungkannya dan jumlah frame jadi berkurang.
    const amplitude = Number(process.env.BRAT_ANIM_ZOOM || 0.06)
    const zooms = []
    for (let i = 0; i < frames; i++) {
      zooms.push(Number((1 - amplitude * (i / frames)).toFixed(4)))
    }
    for (const [i, zoom] of zooms.entries()) {
      const { buffer } = await renderBratFrame(clean, { size, zoom, fit: BRAT_FIT })
      fs.writeFileSync(path.join(dir, `frame-${i}.png`), buffer)
    }

    const out = path.join(dir, 'out.webp')
    const framerate = Math.max(1, Math.round(1000 / Number(process.env.BRAT_ANIM_FRAME_MS || 120)))
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(dir, 'frame-%d.png'))
        .inputOptions(['-framerate', String(framerate)])
        .outputOptions([
          '-c:v', 'libwebp_anim',
          '-loop', '0',
          '-q:v', String(process.env.ANIMTEXT_QUALITY || 70),
          '-pix_fmt', 'yuva420p',
          '-vf', `scale=${STICKER_SIZE}:${STICKER_SIZE}`,
          '-an',
        ])
        .on('error', reject)
        .on('end', resolve)
        .save(out)
    })
    return { buffer: fs.readFileSync(out), frames, zooms }
  } finally {
    cleanup(dir)
  }
}