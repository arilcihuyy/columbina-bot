// Tes fitur teks→stiker: gaya BRAT (default) + gaya lama (classic/rainbow).
//
//   node scripts/test-brat.js            → semua tes
//   node scripts/test-brat.js --offline  → lewati CDN emoji (uji fallback)
//
// Verifikasi pakai ISI FILE sungguhan: magic bytes, chunk WebP, piksel (warna
// background & tinta teks), dan susunan baris — bukan cuma "tidak error".
import 'dotenv/config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import {
  sanitizeText, splitEmoji, twemojiCandidates, pickPalette, hexColor,
  renderTextPng, renderAnimatedTextWebp,
  clearEmojiCache, STICKER_SIZE, MAX_TEXT_LEN, CANVAS_SIZE,
} from '../src/features/textsticker.js'
import {
  renderBratPng, renderBratFrame, renderBratAnimatedWebp, bratCase, toTokens,
  BRAT_FONT_PX, BRAT_FONT_RATIO,
} from '../src/features/brat.js'
import { createCanvas } from '@napi-rs/canvas'
import { toStickerBuffer, finalizeSticker } from '../src/features/media.js'
import { parseWebpInfo, sharpWebpInfo } from '../src/features/webp-info.js'
import bratCommand, { pickText } from '../src/commands/brat.js'
import animatedtextCommand from '../src/commands/animatedtext.js'

const offline = process.argv.includes('--offline')
if (offline) process.env.TWEMOJI_BASE = 'http://127.0.0.1:9/twemoji' // pasti gagal → uji fallback
clearEmojiCache()

let fail = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`)
  else { console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`); fail++ }
}

const FONT_DIR_FOR_TEST = () => path.resolve(process.cwd(), 'assets/fonts')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't2s-'))
const write = (name, buf) => { const p = path.join(tmp, name); fs.writeFileSync(p, buf); return p }
const isWebp = (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'

/** Piksel mentah dari PNG/webp: { data, width, height, channels } */
const rawPixels = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}
const px = (img, x, y) => {
  const i = (y * img.width + x) * img.channels
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}
const isWhite = ([r, g, b, a]) => r > 245 && g > 245 && b > 245 && a > 245
const isDark = ([r, g, b, a]) => r < 90 && g < 90 && b < 90 && a > 200

/** Persentase piksel gelap (tinta teks) pada gambar. */
const inkRatio = (img) => {
  let dark = 0
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) if (isDark(px(img, x, y))) dark++
  }
  return dark / (img.width * img.height)
}

/** Bounding box tinta dengan ambang longgar — untuk teks sangat kecil yang
 *  warnanya memudar karena anti-aliasing + blur (bukan berarti tidak tergambar). */
const inkBoxLoose = (img, ambang = 220) => {
  let minX = img.width, maxX = -1, minY = img.height, maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (px(img, x, y)[0] < ambang) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, maxX, minY, maxY, ok: maxX >= 0 }
}

/** Bounding box tinta (buat cek margin). */
const inkBox = (img) => {
  let minX = img.width, maxX = -1, minY = img.height, maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isDark(px(img, x, y))) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, maxX, minY, maxY, ok: maxX >= 0 }
}

// ── 1. helper murni ─────────────────────────────────────────────────────────
console.log('\n[1] helper teks & emoji')
ok(sanitizeText('  halo   dunia \n') === 'halo dunia', 'spasi berlebih dirapikan')
ok(sanitizeText('a\u0007b') === 'ab', 'karakter kontrol dibuang')
ok(sanitizeText('x'.repeat(MAX_TEXT_LEN + 50)).length === MAX_TEXT_LEN, `teks dipotong di ${MAX_TEXT_LEN} karakter`)
ok(bratCase('Halo Dunia') === 'halo dunia', 'gaya brat: huruf kecil semua')

const em = splitEmoji('hai 🌙 apa kabar')
ok(em.some((p) => p.emoji && p.cps[0] === 0x1f319), 'emoji tunggal terdeteksi')
const fam = splitEmoji('👨‍👩‍👧')
ok(fam.length === 1 && fam[0].emoji && fam[0].cps.length >= 5, 'ZWJ sequence jadi satu emoji')
const skin = splitEmoji('👍🏽')
ok(skin.length === 1 && skin[0].cps.length === 2, 'emoji + warna kulit jadi satu', JSON.stringify(skin[0]?.cps?.map((c) => c.toString(16))))
const flag = splitEmoji('🇮🇩')
ok(flag.length === 1 && flag[0].cps.length === 2, 'bendera jadi satu emoji')
ok(twemojiCandidates([0x1f319])[0] === '1f319', 'nama file twemoji dari codepoint')
ok(pickPalette(() => 0) === pickPalette(() => 0) && Array.isArray(pickPalette()), 'palet konsisten & berupa array')
ok(hexColor('ff0000') === '#ff0000', 'hex warna dinormalkan')
ok(toTokens('halo dunia').length === 2, 'token teks dipisah per kata')

console.log('\n[2] sumber teks')
ok(pickText('halo', 'abaikan') === 'halo', 'argumen command dipakai')
ok(pickText('', 'teks dari balasan') === 'teks dari balasan', 'kalau kosong → pakai pesan yang dibalas')
ok(pickText('  ', '  ') === '', 'dua-duanya kosong → kosong')

// ── 3. GAYA BRAT (setelan PERSIS situs: font tetap, justify, stretch 1.5×) ──
console.log('\n[3] gaya brat (setelan situs): warna, ukuran font, stretch, justify')
{
  const { buffer, info } = await renderBratPng('halo dunia')
  const img = await rawPixels(buffer)
  ok(isWhite(px(img, 2, 2)) && isWhite(px(img, img.width - 3, 2)), 'background PUTIH (pojok atas kiri & kanan)')
  ok(isWhite(px(img, 2, img.height - 3)) && isWhite(px(img, img.width - 3, img.height - 3)), 'background putih juga di bawah')
  const ratio = inkRatio(img)
  ok(ratio > 0.005 && ratio < 0.6, 'ada tinta teks hitam dengan porsi wajar', `${(ratio * 100).toFixed(1)}% piksel gelap`)
  ok(info.lines.every((l) => l.every((t) => t.emoji || t.text === t.text.toLowerCase())), 'teks digambar huruf kecil', JSON.stringify(info.text))

  // ukuran font normal = BRAT_FONT_PX (105px di kanvas 512) untuk teks yang muat
  const harap = CANVAS_SIZE * BRAT_FONT_RATIO
  ok(Math.abs(info.fontSize - harap) <= 0.01, `font normal = ${harap.toFixed(1)}px (BRAT_FONT_PX ${BRAT_FONT_PX})`, `${info.fontSize}px`)
  ok(Math.abs(harap - BRAT_FONT_PX) <= 0.01, 'ukuran normal = BRAT_FONT_PX di kanvas render 512', `${harap.toFixed(1)}px`)

  const box = inkBox(img)
  const marginLeft = box.minX
  const marginRight = img.width - 1 - box.maxX
  ok(marginLeft > 5 && marginRight > 5, 'teks tidak menyentuh tepi', `kiri ${marginLeft}px, kanan ${marginRight}px`)
  ok(Math.abs(marginLeft - marginRight) <= 8, 'blok teks di tengah horizontal', `selisih ${Math.abs(marginLeft - marginRight)}px`)
  const marginTop = box.minY
  const marginBottom = img.height - 1 - box.maxY
  ok(Math.abs(marginTop - marginBottom) <= Math.max(8, img.height * 0.05), 'blok teks di tengah vertikal', `atas ${marginTop}px, bawah ${marginBottom}px`)
}

{
  // STRETCH vertikal 1.5× — kunci bentuk brat
  const a = inkBox(await rawPixels((await renderBratFrame('brat', { size: 1000, stretch: 1 })).buffer))
  const b = inkBox(await rawPixels((await renderBratFrame('brat', { size: 1000, stretch: 1.5 })).buffer))
  const tinggi = (b.maxY - b.minY + 1) / (a.maxY - a.minY + 1)
  const lebar = (b.maxX - b.minX + 1) / (a.maxX - a.minX + 1)
  ok(Math.abs(tinggi - 1.5) <= 0.08, 'tinggi huruf jadi 1.5× (scaleY 1.5)', `${tinggi.toFixed(3)}×`)
  ok(Math.abs(lebar - 1) <= 0.05, 'lebar huruf tidak berubah', `${lebar.toFixed(3)}×`)
}

{
  // JUSTIFY: baris kecuali terakhir direntangkan sampai lebar baris terpanjang
  const teks = 'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas'
  const { buffer, info } = await renderBratPng(teks)
  ok(info.lines.length >= 3, 'kalimat panjang dibungkus beberapa baris', `${info.lines.length} baris`)

  // kelompokkan baris piksel jadi pita (band) = satu baris teks
  const gambar = await rawPixels(buffer)
  const bands = []
  let cur = null
  for (let y = 0; y < gambar.height; y++) {
    let minX = gambar.width, maxX = -1
    for (let x = 0; x < gambar.width; x++) if (isDark(px(gambar, x, y))) { if (x < minX) minX = x; if (x > maxX) maxX = x }
    if (maxX >= 0) {
      if (!cur) cur = { minX, maxX, y0: y, y1: y }
      else { cur.minX = Math.min(cur.minX, minX); cur.maxX = Math.max(cur.maxX, maxX); cur.y1 = y }
    } else if (cur) { bands.push(cur); cur = null }
  }
  if (cur) bands.push(cur)
  ok(bands.length === info.lines.length, 'jumlah baris tinta = jumlah baris teks', `${bands.length} vs ${info.lines.length}`)

  const lebar = bands.map((b) => b.maxX - b.minX + 1)
  const terpanjang = Math.max(...lebar)
  // baris berisi 1 kata tidak bisa direntangkan (persis perilaku CSS text-align:justify)
  const bisaJadi = info.lines
    .map((l, i) => ({ i, n: l.length }))
    .filter((x) => x.i < info.lines.length - 1 && x.n >= 2)
    .map((x) => x.i)
  ok(bisaJadi.length >= 1, 'ada baris multi-kata untuk diuji justify', `${bisaJadi.length} baris`)
  ok(bisaJadi.every((i) => Math.abs(lebar[i] - terpanjang) <= 3), 'baris multi-kata direntangkan sampai lebar baris terpanjang (justify)', JSON.stringify(lebar))
  ok(lebar[lebar.length - 1] < terpanjang, 'baris terakhir TIDAK direntangkan (rata kiri seperti CSS)', `terakhir ${lebar[lebar.length - 1]}px vs terpanjang ${terpanjang}px`)
  ok(bands.every((b) => Math.abs(b.minX - bands[0].minX) <= 3), 'semua baris mulai dari titik kiri yang sama', JSON.stringify(bands.map((b) => b.minX)))
}

{
  // kata TIDAK dipenggal, kecuali satu kata sendirian memang lebih lebar dari kotak
  const teks = 'tugas tka matematika nomor 12 selesai'
  const { info } = await renderBratPng(teks)
  const hasil = info.lines.map((l) => l.map((t) => (t.emoji ? '🌙' : t.text)).join(' ')).join(' ')
  ok(hasil === teks, 'kata tetap utuh, tidak dipenggal di tengah', JSON.stringify(info.text))
}

{
  // kata panjang (28 huruf): font mengecil, kata TETAP UTUH, tidak meluber
  const { buffer, info } = await renderBratPng('antidisestablishmentarianism')
  const img = await rawPixels(buffer)
  const box = inkBox(img)
  ok(info.lines.length === 1 && info.lines[0][0].text === 'antidisestablishmentarianism', 'kata panjang tetap utuh (font mengecil)', `${info.fontSize.toFixed(1)}px`)
  ok(box.minX >= info.pad - 2 && img.width - 1 - box.maxX >= info.pad - 2, 'kata panjang tidak meluber keluar padding', `kiri ${box.minX}px (pad ${info.pad})`)
}

{
  // kata EKSTREM (200 huruf, batas maksimum input): dipecah seperti break-word CSS,
  // tapi tetap tidak boleh keluar frame
  const ekstrem = 'a'.repeat(MAX_TEXT_LEN)
  const { buffer, info } = await renderBratPng(ekstrem)
  const img = await rawPixels(buffer)
  const box = inkBoxLoose(img)
  ok(box.ok, 'kata ekstrem tetap tergambar (ada tinta)')
  ok(info.lines.length >= 2, 'kata ekstrem dipecah seperti break-word CSS', `${info.lines.length} potongan`)
  ok(box.minX > 0 && box.maxX < img.width - 1 && box.minY > 0 && box.maxY < img.height - 1, 'kata ekstrem tetap tidak keluar frame', `x ${box.minX}..${box.maxX}, y ${box.minY}..${box.maxY}`)
}

{
  // MODE SHRINK (default): teks panjang dikecilkan supaya SEMUA teks masuk frame
  const panjang = 'ini contoh teks yang panjang banget supaya kelihatan bagaimana brat membungkus kalimat panjang jadi banyak baris'
  const { buffer, info } = await renderBratPng(panjang)
  ok(info.muat === true, 'teks panjang: blok teks muat di kotak', `muat=${info.muat}`)
  ok(info.fontSize < info.fontSitus - 0.5, 'teks panjang: font DIKECILKAN dari ukuran situs', `${info.fontSize.toFixed(1)}px < ${info.fontSitus.toFixed(1)}px`)

  // bukti visual: tinta tidak menyentuh tepi frame (pad = 20/300 dari sisi kotak)
  const img = await rawPixels(buffer)
  const box = inkBox(img)
  ok(box.minX >= info.pad - 2 && img.width - 1 - box.maxX >= info.pad - 2, 'tidak meluber ke samping', `kiri ${box.minX}px, kanan ${img.width - 1 - box.maxX}px (pad ${info.pad})`)
  ok(box.minY >= info.pad - 2 && img.height - 1 - box.maxY >= info.pad - 2, 'tidak meluber ke atas/bawah', `atas ${box.minY}px, bawah ${img.height - 1 - box.maxY}px`)
  ok(box.maxY < img.height - 1 && box.minY > 0, 'teks tidak terpotong di tepi frame', `y ${box.minY}..${box.maxY} dari 0..${img.height - 1}`)

  // teks pendek TIDAK dikecilkan: tetap seukuran situs
  const pendek = await renderBratPng('halo dunia')
  ok(Math.abs(pendek.info.fontSize - pendek.info.fontSitus) < 0.01, 'teks pendek: pakai ukuran normal (tidak dikecilkan)', `${pendek.info.fontSize.toFixed(1)}px`)
}

{
  // keterbacaan: teks panjang yang realistis (115 huruf) tidak boleh jadi mini
  const realistis = 'tugas tka matematika fisika kimia biologi sejarah geografi ekonomi sosiologi bahasa indonesia bahasa inggris seni budaya pjok prakarya kewirausahaan'
  const { info } = await renderBratPng(realistis)
  const fontNormal = CANVAS_SIZE * BRAT_FONT_RATIO
  ok(info.fontSize >= fontNormal * 0.3, 'teks panjang realistis tetap terbaca (font ≥ 30% ukuran normal)', `${info.fontSize.toFixed(1)}px dari ${fontNormal.toFixed(1)}px`)
  ok(info.lines.length <= 10, 'jumlah baris wajar (≤10)', `${info.lines.length} baris`)
}

{
  // teks SANGAT panjang (200 karakter) tetap masuk frame
  const sangatPanjang = 'tugas tka matematika fisika kimia biologi sejarah geografi ekonomi sosiologi bahasa indonesia bahasa inggris seni budaya pjok prakarya kewirausahaan'
  const { buffer, info } = await renderBratPng(sangatPanjang)
  const img = await rawPixels(buffer)
  const box = inkBox(img)
  ok(info.muat === true, 'teks sangat panjang: tetap muat', `${info.lines.length} baris @ ${info.fontSize.toFixed(1)}px`)
  ok(box.minY > 0 && box.maxY < img.height - 1 && box.minX > 0 && box.maxX < img.width - 1, 'teks sangat panjang: tidak ada yang keluar frame', `x ${box.minX}..${box.maxX}, y ${box.minY}..${box.maxY}`)
}

{
  // mode 'off' (persis situs, tanpa pengecilan) memang meluber — pembanding bahwa fix ini nyata
  const panjang = 'ini contoh teks yang panjang banget supaya kelihatan bagaimana brat membungkus kalimat panjang jadi banyak baris'
  const { info } = await renderBratFrame(panjang, { fit: 'off' })
  ok(info.muat === false, "mode 'off' (persis situs): teks panjang memang TIDAK muat", `muat=${info.muat}, skalaAman ${info.skalaAman.toFixed(2)}`)
}

{
  // mode FIT (tambahan wa-bot, BRAT_FIT=1): font membesar mengisi kotak
  const { info } = await renderBratFrame('halo dunia', { fit: true })
  ok(info.fontSize > CANVAS_SIZE * 0.15, 'mode fit: font membesar mengisi kotak', `${info.fontSize.toFixed(0)}px`)
  const { info: situs } = await renderBratFrame('halo dunia', { fit: false })
  ok(info.fontSize > situs.fontSize, 'mode fit lebih besar daripada mode situs', `${info.fontSize.toFixed(0)} > ${situs.fontSize.toFixed(0)}`)
}

{
  // urutan kata tidak berubah untuk kalimat panjang
  const teks = 'ini contoh teks yang panjang banget supaya kelihatan bagaimana brat membungkus kalimat panjang jadi banyak baris'
  const { info } = await renderBratPng(teks)
  const hasil = info.lines.map((l) => l.map((t) => t.text).join(' ')).join(' ')
  ok(hasil === teks, 'semua kata muncul berurutan, tidak ada yang hilang', `${info.lines.length} baris`)
}

{
  // background bisa diganti (mis. hijau brat) lewat parameter
  const { buffer } = await renderBratFrame('brat', { bg: '#8ace00' })
  const img = await rawPixels(buffer)
  const [r, g, b] = px(img, 2, 2)
  ok(g > 180 && r < 180 && b < 80, 'BRAT_BG lain dihormati (hijau #8ace00)', `rgb(${r},${g},${b})`)
}

{
  // blur tipis: tepi huruf harus lebih lembut daripada tanpa blur
  const sharp1 = (await rawPixels((await renderBratFrame('brat', { blur: 0 })).buffer))
  const blur1 = (await rawPixels((await renderBratFrame('brat', { blur: 2 })).buffer))
  const countMid = (img) => {
    let mid = 0
    for (let i = 0; i < img.data.length; i += img.channels) {
      const v = img.data[i]
      if (v > 60 && v < 200) mid++
    }
    return mid
  }
  ok(countMid(blur1) > countMid(sharp1) * 1.3, 'blur menambah piksel abu-abu (tepi lembut)', `${countMid(sharp1)} → ${countMid(blur1)}`)
}

// ── 3b. font custom (assets/fonts) ─────────────────────────────────────────
console.log('\n[3b] font custom')
{
  const { registeredFamilies, availableFamilies, fontStack, FONT_DIR } = await import('../src/features/fonts.js')
  const { BRAT_FONT } = await import('../src/features/brat.js')

  ok(fs.existsSync(FONT_DIR), 'folder font ada', FONT_DIR)
  ok(registeredFamilies.length >= 1, 'ada font custom terdaftar dari assets/fonts', JSON.stringify(registeredFamilies))

  const ada = new Set(availableFamilies())
  ok(ada.has('Archivo Narrow'), 'Archivo Narrow terdaftar di canvas (pengganti Arial Narrow)')
  ok(ada.has('Nimbus Sans Narrow'), 'Nimbus Sans Narrow (bawaan Linux) juga terdeteksi')

  // daftar font harus memuat Archivo dulu, dan tidak memuat font yang tidak ada
  const pertama = BRAT_FONT.split(',')[0].trim().replace(/"/g, '')
  ok(['Arial', 'Archivo Narrow'].includes(pertama), 'font utama = Arial (kalau disediakan) atau Archivo Narrow', BRAT_FONT)
  const disebut = BRAT_FONT.split(',').map((f) => f.trim().replace(/"/g, ''))
  const karangan = disebut.filter((f) => !['sans-serif', 'serif', 'monospace'].includes(f) && !ada.has(f))
  ok(!karangan.length, 'tidak ada font yang tidak terpasang di daftar', karangan.length ? `karangan: ${karangan}` : BRAT_FONT)

  // fontStack: env menang, generik di akhir
  const st = fontStack('Nimbus Sans Narrow', ['Archivo Narrow', 'sans-serif'])
  ok(st.startsWith('"Nimbus Sans Narrow"'), 'env BRAT_FONT diprioritaskan', st)
  ok(st.trim().endsWith('sans-serif'), 'penutup generik sans-serif di akhir', st)
}

{
  // Archivo Narrow vs Nimbus: lebar mirip (metrik cocok) tapi bentuk huruf beda
  const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')
  GlobalFonts.registerFromPath(path.join(FONT_DIR_FOR_TEST(), 'ArchivoNarrow.ttf'), 'ArchivoNarrow')
  const c = createCanvas(100, 100)
  const ctx = c.getContext('2d')
  const ukur = (font) => { ctx.font = `400 100px "${font}"`; return ctx.measureText('brat aku cinta kamu').width }
  const wa = ukur('Archivo Narrow')
  const wn = ukur('Nimbus Sans Narrow')
  const wl = ukur('Nimbus Sans')
  ok(Math.abs(wa - wn) / wn < 0.05, 'lebar Archivo ≈ Nimbus (metrik cocok, ±5%)', `${wa.toFixed(0)} vs ${wn.toFixed(0)}px`)
  ok(wa < wl * 0.9, 'keduanya lebih sempit dari font normal (narrow)', `narrow ${wa.toFixed(0)}px vs normal ${wl.toFixed(0)}px`)
}

// ── 4. stiker brat lewat pipeline stiker ────────────────────────────────────
console.log('\n[4] pipeline stiker (brat)')
{
  const { buffer: png } = await renderBratPng('Halo Dunia')
  const sticker = await toStickerBuffer(png, { packName: 'Columbina Test', packPublish: 'Test', emojis: ['✍️'] })
  write('brat.webp', sticker)
  ok(isWebp(sticker), 'hasil = WebP (magic RIFF/WEBP)')
  const info = parseWebpInfo(sticker)
  const meta = await sharpWebpInfo(sticker)
  ok(meta.width === STICKER_SIZE && meta.height === STICKER_SIZE, `ukuran ${STICKER_SIZE}×${STICKER_SIZE}`, `${meta.width}×${meta.height}`)
  ok(!info.isAnimated && meta.pages <= 1, 'statis: 1 frame')
  ok(sticker.length < 200 * 1024, 'ukuran wajar untuk WhatsApp', `${(sticker.length / 1024).toFixed(1)} KB`)
  ok(sticker.includes('Columbina Test'), 'metadata pack tertanam')
  const img = await rawPixels(sticker)
  ok(isWhite(px(img, 1, 1)), 'background putih ikut terbawa ke stiker')
}

// ── 5. gaya brat ANIMASI (zoom) ─────────────────────────────────────────────
console.log('\n[5] gaya brat animasi (zoom)')
{
  const { buffer, frames, zooms } = await renderBratAnimatedWebp('Halo Dunia', { frames: 6 })
  write('brat-anim.webp', buffer)
  const info = parseWebpInfo(buffer)
  const meta = await sharpWebpInfo(buffer)
  ok(isWebp(buffer), 'hasil = WebP')
  ok(new Set(zooms).size === frames, 'tidak ada frame kembar (kalau kembar, muxer menggabungkannya)', JSON.stringify(zooms))
  // muxer libwebp_anim boleh menggabungkan frame identik, jadi toleransi 1 frame
  ok(info.isAnimated && info.frames > 1 && info.frames >= frames - 1, 'BENAR-BENAR animasi (chunk ANIM/ANMF)', `${info.frames} frame dari ${frames} diminta`)
  ok(meta.pages === info.frames, 'jumlah frame cocok (chunk vs libvips)', `${meta.pages} vs ${info.frames}`)
  ok(info.width === STICKER_SIZE && info.height === STICKER_SIZE, `ukuran ${STICKER_SIZE}×${STICKER_SIZE}`, `${info.width}×${info.height}`)
  ok(buffer.length < 500 * 1024, 'di bawah batas aman stiker animasi WhatsApp', `${(buffer.length / 1024).toFixed(1)} KB`)
  ok(zooms.every((z) => z <= 1 && z >= 0.9), 'zoom halus (tidak menyentuh tepi)', JSON.stringify(zooms))
  const img = await rawPixels(buffer)
  ok(isWhite(px(img, 2, 2)), 'background putih di frame animasi')
  const final = await finalizeSticker(buffer, { packName: 'Columbina Test', packPublish: 'Test', emojis: ['✍️'] })
  const finfo = parseWebpInfo(final)
  ok(finfo.isAnimated && finfo.frames === info.frames, 'metadata tidak merusak animasi', `${finfo.frames} frame`)
}

// ── 6. gaya lama masih hidup (classic & rainbow) ────────────────────────────
console.log('\n[6] gaya lama (classic / rainbow)')
{
  const png = await renderTextPng('Halo Dunia')
  const img = await rawPixels(png)
  ok(px(img, 1, 1)[3] === 0, 'classic: background transparan (bukan putih)')
  const { buffer } = await renderAnimatedTextWebp('Halo Dunia', { palette: pickPalette(() => 0) })
  const info = parseWebpInfo(buffer)
  ok(info.isAnimated && info.frames > 1, 'rainbow: masih animasi', `${info.frames} frame`)
  const meta = await sharpWebpInfo(buffer)
  ok(meta.width === STICKER_SIZE, 'rainbow: ukuran tetap', `${meta.width}×${meta.height}`)
}

// ── 7. command-level (ctx tiruan) ───────────────────────────────────────────
console.log('\n[7] alur command')
const makeCtx = ({ rawArgs = '', quoted = null } = {}) => {
  const sent = []
  return {
    sent,
    ctx: {
      sock: {}, jid: '6281234567890@s.whatsapp.net', rawArgs, args: rawArgs ? rawArgs.split(' ') : [], quoted, pushName: 'Pengguna',
      reply: async (t) => { sent.push({ type: 'reply', text: String(t) }); return { key: { id: 'r' } } },
      send: async (o) => { sent.push({ type: 'raw', keys: Object.keys(o ?? {}), sticker: o?.sticker }); return { key: { id: 's' } } },
      sendMedia: async () => { sent.push({ type: 'media' }) },
      react: async (e) => { sent.push({ type: 'emoji', emoji: e }) },
      typing: async () => {},
    },
  }
}
const replies = (sent) => sent.filter((s) => s.type === 'reply').map((s) => s.text).join('\n')
const stickers = (sent) => sent.filter((s) => s.type === 'raw' && Buffer.isBuffer(s.sticker))

{
  const { ctx, sent } = makeCtx({ rawArgs: 'Halo dari command' })
  await bratCommand.execute(ctx)
  const st = stickers(sent)
  ok(st.length === 1, '!brat mengirim 1 stiker')
  ok(isWebp(st[0].sticker), 'yang dikirim webp')
  const img = await rawPixels(st[0].sticker)
  ok(isWhite(px(img, 1, 1)), 'stiker dari command bergaya brat (background putih)')
  ok(sent.some((s) => s.emoji === '✅'), 'react ✅')
}
{
  const { ctx, sent } = makeCtx({ rawArgs: '' })
  await bratCommand.execute(ctx)
  ok(stickers(sent).length === 0 && replies(sent).includes('Usage'), 'tanpa teks → usage, tidak kirim apa-apa')
}
{
  const { ctx, sent } = makeCtx({ rawArgs: '', quoted: { text: 'teks dari balasan 🌙' } })
  await bratCommand.execute(ctx)
  ok(stickers(sent).length === 1, 'teks dari pesan yang dibalas dipakai')
}
{
  const { ctx, sent } = makeCtx({ rawArgs: 'Halo animasi' })
  await animatedtextCommand.execute(ctx)
  const st = stickers(sent)
  ok(st.length === 1, '!animatedtext mengirim 1 stiker')
  const info = parseWebpInfo(st[0].sticker)
  ok(info.isAnimated && info.frames > 1, 'stiker dari command animasi', `${info.frames} frame`)
  const img = await rawPixels(st[0].sticker)
  ok(isWhite(px(img, 2, 2)), 'animasi bergaya brat (background putih)')
  ok(sent.some((s) => s.emoji === '✅'), 'react ✅')
}
{
  const { ctx, sent } = makeCtx({ rawArgs: '' })
  await animatedtextCommand.execute(ctx)
  ok(stickers(sent).length === 0 && replies(sent).includes('Usage'), '!animatedtext tanpa teks → usage')
}

// ── 8. registrasi command ───────────────────────────────────────────────────
console.log('\n[8] registrasi command')
const { commands, findCommand } = await import('../src/commands/index.js')
const names = ['brat', 'textsticker', 'texttosticker', 'ttp', 't2s', 'bratsticker', 'animatedtext', 'atts', 'attp', 'animatedtextsticker', 'bratanim']
const missing = names.filter((n) => !findCommand(n))
ok(!missing.length, 'semua nama & alias terdaftar', missing.length ? `hilang: ${missing}` : names.join(', '))
const { buildMenu } = await import('../src/commands/help.js')
const menu = buildMenu(commands, { banner: '' })
ok(menu.includes('!brat') && menu.includes('!animatedtext'), 'keduanya tampil di menu')
ok(/brat/i.test(menu), 'menu menyebut gaya brat')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `\n❌ ${fail} tes GAGAL\n` : '\n✅ semua tes teks→stiker lulus\n')
process.exit(fail ? 1 : 0)
