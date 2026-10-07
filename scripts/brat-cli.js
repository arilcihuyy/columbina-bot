#!/usr/bin/env node
// Brat Text Generator (CLI) — meniru bratgenerator.io.
//
// Default-nya PERSIS seperti situsnya: kotak 1:1, font 30px (slider 10-100),
// stretch vertikal 1.5×, blur 0.7px, rata justify, lebar teks maks 90%,
// blok teks di tengah. Warnanya bisa diganti (situsnya juga punya pilihan warna).
//
// Pakai:
//   node scripts/brat-cli.js "teks kamu"
//   node scripts/brat-cli.js "teks" --bg "#8ACE00" --font-size 40 --size 1000 --out hasil.png
//   node scripts/brat-cli.js "teks panjang" --fit        (font otomatis mengecil agar muat)
//   node scripts/brat-cli.js --list                       (lihat semua opsi)
import fs from 'fs'
import path from 'path'
import {
  renderBratFrame, BRAT_STRETCH, BRAT_BLUR, BRAT_LINE_HEIGHT,
} from '../src/features/brat.js'

const SITE = { size: 300, font: 30, blur: 0.7, stretch: 1.5, pad: 20, maxWidth: 0.9, bg: '#8ACE00', fg: '#000000' }

function parseArgs(argv) {
  const opts = {
    text: '',
    size: 1000,          // resolusi keluaran (situs: 300; kita perbesar supaya tajam)
    fontSize: SITE.font, // nilai slider situs
    blur: SITE.blur,
    stretch: SITE.stretch,
    pad: SITE.pad,
    maxWidth: SITE.maxWidth,
    bg: SITE.bg,
    fg: SITE.fg,
    fit: 'shrink',
    justifyMax: Infinity,
    out: '',
    caseMode: 'lower',
  }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--size') opts.size = Number(next())
    else if (a === '--font-size' || a === '--font') opts.fontSize = Number(next())
    else if (a === '--blur') opts.blur = Number(next())
    else if (a === '--stretch') opts.stretch = Number(next())
    else if (a === '--pad') opts.pad = Number(next())
    else if (a === '--max-width') opts.maxWidth = Number(next())
    else if (a === '--bg') opts.bg = next()
    else if (a === '--fg') opts.fg = next()
    else if (a === '--out' || a === '-o') opts.out = next()
    else if (a === '--upper') opts.caseMode = 'upper'
    else if (a === '--case') opts.caseMode = next()
    else if (a === '--fit') opts.fit = 'grow'
    else if (a === '--fit-shrink') opts.fit = 'shrink'
    else if (a === '--no-fit') opts.fit = 'off'
    else if (a === '--justify-max') opts.justifyMax = Number(next())
    else if (a === '--white') { opts.bg = '#ffffff'; opts.fg = '#000000' }
    else if (a === '--green') { opts.bg = '#8ACE00'; opts.fg = '#000000' }
    else if (a === '--site') { opts.size = SITE.size }
    else if (a === '--list' || a === '-h' || a === '--help') { opts.help = true }
    else rest.push(a)
  }
  if (rest.length) opts.text = rest.join(' ')
  return opts
}

const HELP = `Brat Text Generator (meniru bratgenerator.io)

  node scripts/brat-cli.js "teks" [opsi]

Opsi (default = sama seperti situs):
  --bg <warna>        warna latar            (default #8ACE00 hijau brat; --white = putih)
  --fg <warna>        warna teks             (default #000000)
  --font-size <n>     ukuran font 10..100    (default 30, seperti slider situs)
  --stretch <n>       peregangan vertikal    (default 1.5, kunci bentuk brat)
  --blur <n>          blur tipis             (default 0.7; 0 = tajam)
  --pad <n>           padding kotak          (default 20 dari 300)
  --max-width <n>     lebar maks teks 0..1   (default 0.9)
  --size <px>         resolusi keluaran      (default 1000; --site = 300)
  --fit-shrink        font mengecil hanya kalau teks kepanjangan (default)
  --fit               font membesar supaya mengisi kotak
  --no-fit            font tetap seperti situs (teks panjang bisa terpotong)
  --justify-max <n>   batas pelebaran spasi justify (mis. 0.4; default tanpa batas seperti situs)
  --upper             huruf besar semua      (default huruf kecil)
  --out <file>        simpan ke file (default /tmp/brat-<waktu>.png)
  --list              tampilkan bantuan ini
`

const opts = parseArgs(process.argv.slice(2))
if (opts.help) { console.log(HELP); process.exit(0) }
if (!opts.text) { console.log(HELP); process.exit(1) }

const scale = opts.size / SITE.size // semua ukuran situs diskalakan ke resolusi keluaran
const text = opts.caseMode === 'upper' ? opts.text.toUpperCase() : opts.text.toLowerCase()

const { buffer, info } = await renderBratFrame(text, {
  size: opts.size,
  bg: opts.bg,
  fg: opts.fg,
  blur: opts.blur,
  stretch: opts.stretch,
  fontSize: opts.fontSize * scale,
  pad: opts.pad * scale,
  maxWidth: opts.maxWidth,
  fit: opts.fit,
  justifyMax: opts.justifyMax,
  lineHeight: opts.lineHeight ?? BRAT_LINE_HEIGHT,
})

const out = opts.out || `/tmp/brat-${Date.now()}.png`
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
fs.writeFileSync(out, buffer)

console.log(`✅ ${out}`)
console.log(`   ${info.lines.length} baris | font ${(info.fontSize / scale).toFixed(1)}px (skala situs) → ${info.fontSize.toFixed(0)}px di kanvas ${opts.size}px`)
console.log(`   stretch ${opts.stretch}× | blur ${info.blur.toFixed(2)}px | justify: ${info.justified ? 'ya' : 'tidak (1 baris)'}`)
console.log(`   teks: ${info.text}`)
console.log(`   ukuran file: ${(buffer.length / 1024).toFixed(1)} KB`)
