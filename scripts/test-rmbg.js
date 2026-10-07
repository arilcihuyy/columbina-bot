// Uji offline removeBackground: node scripts/test-rmbg.js [gambar.jpg]
import { rmSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { removeBg, transparencyRatio } from '../src/features/rmbg.js'

const arg = process.argv[2]
let input
if (arg && existsSync(arg)) {
  input = readFileSync(arg)
} else {
  // fallback: gambar uji sintetis (subjek jelas di atas background polos)
  const { default: sharp } = await import('sharp')
  const subject = Buffer.from(
    `<svg width="800" height="800">
       <rect width="800" height="800" fill="#88aa44"/>
       <circle cx="400" cy="380" r="200" fill="#e8b98a"/>
       <circle cx="330" cy="340" r="28" fill="#223"/>
       <circle cx="470" cy="340" r="28" fill="#223"/>
       <path d="M 320 460 Q 400 540 480 460" stroke="#7a3b2e" stroke-width="14" fill="none"/>
       <rect x="220" y="580" width="360" height="220" rx="40" fill="#3355aa"/>
     </svg>`)
  input = await sharp(subject).jpeg().toBuffer()
  console.log('[uji] pakai gambar sintetis (argumen file tidak diberi/ada)')
}

console.log('[uji] removeBg mulai...')
const { png, ms, width, height } = await removeBg(input)
console.log(`[uji] selesai ${ms}ms, ${width}x${height}, ${(png.length / 1024).toFixed(0)}KB`)

// magic bytes PNG
const magic = png.subarray(0, 8).toString('hex')
if (magic !== '89504e470d0a1a0a') { console.error('FAIL: bukan PNG,', magic); process.exit(1) }
console.log('[uji] magic bytes PNG OK')

const ratio = await transparencyRatio(png)
console.log(`[uji] rasio transparan: ${(ratio * 100).toFixed(1)}%`)
if (ratio < 0.05) { console.error('FAIL: hampir tidak ada transparansi (background tidak terhapus?)'); process.exit(1) }
if (ratio > 0.995) { console.error('FAIL: semua transparan (subjek ikut hilang?)'); process.exit(1) }

// tepi ATAS harus transparan (subjek sering wajar menyentuh tepi bawah)
const { default: sharp } = await import('sharp')
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
const at = (x, y) => { const i = (y * info.width + x) * info.channels; return data[i + 3] }
const topCorners = [at(2, 2), at(info.width - 3, 2)]
const midTop = [at(Math.floor(info.width / 4), 2), at(Math.floor(info.width * 3 / 4), 2)]
console.log('[uji] alpha tepi atas:', [...topCorners, ...midTop].join(','), '(harus rendah)')
if (Math.max(...topCorners, ...midTop) > 60) { console.error('FAIL: tepi atas tidak transparan'); process.exit(1) }

const out = process.argv[2] ? arg.replace(/\.[^.]+$/, '') + '.nobg.png' : '/tmp/rmbg-test.nobg.png'
rmSync(out, { force: true })
const { writeFileSync } = await import('node:fs')
writeFileSync(out, png)
console.log(`PASS — hasil: ${out}`)
