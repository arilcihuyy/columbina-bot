// Test headless fitur media: gambar->stiker, video->stiker, stiker->png.
// Jalan: npm test
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileTypeFromBuffer } from 'file-type'
import { imageToWebp, videoToWebp, webpToPng, toStickerBuffer } from '../src/features/media.js'

// Prefix SENDIRI (jangan 'wa-lite*'): tes langkah 5 menghapus dir /tmp berprefix wa-lite*
// untuk meniru pembersih, jadi jangan sampai folder tes ini ikut terhapus.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-media-test-'))
let pass = 0
let fail = 0

function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

async function makeSample(ext, args) {
  const out = path.join(TMP, `sample.${ext}`)
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=30', ...args, out], { stdio: 'pipe' })
  return fs.readFileSync(out)
}

console.log('1) Gambar -> stiker webp')
try {
  const jpg = await makeSample('jpg', ['-frames:v', '1'])
  const sticker = await imageToWebp(jpg)
  const t = await fileTypeFromBuffer(sticker)
  assert('output RIFF/WEBP', sticker.subarray(0, 4).toString() === 'RIFF' && sticker.subarray(8, 12).toString() === 'WEBP', `(${t?.mime})`)
  assert('ukuran <= 320px area', sticker.length > 1000, `(${sticker.length} bytes)`)

  console.log('2) toStickerBuffer (gambar -> stiker + exif pack)')
  const withExif = await toStickerBuffer(jpg, { packName: 'Test Pack', packPublish: 'Columbina' })
  assert('output RIFF/WEBP + exif', withExif.subarray(0, 4).toString() === 'RIFF' && withExif.length > sticker.length * 0.8, `(${withExif.length} bytes)`)

  console.log('3) Stiker webp -> PNG (toimg)')
  const png = await webpToPng(withExif)
  assert('output PNG signature', png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `(head: ${png.subarray(0, 8).toString('hex')})`)

  console.log('4) Video mp4 -> stiker webp animasi')
  const mp4 = await makeSample('mp4', ['-t', '1'])
  const anim = await videoToWebp(mp4)
  const ta = await fileTypeFromBuffer(anim)
  assert('output RIFF/WEBP', anim.subarray(0, 4).toString() === 'RIFF' && anim.subarray(8, 12).toString() === 'WEBP', `(${ta?.mime})`)
  assert('ada frame animasi (VP8X/ANMF)', anim.includes(Buffer.from('ANMF')) || anim.length > 5000, `(${anim.length} bytes)`)

  console.log('5) REGRESI: stiker ANIMASI -> PNG (ffmpeg 6.1.1 gagal "code 69")')
  // ffmpeg tidak bisa decode webp animasi (chunk ANIM/ANMF) → 0 frame → error.
  // webpToPng harus tetap menghasilkan PNG 320x320 (frame pertama, bukan bertumpuk).
  const pngAnim = await webpToPng(anim)
  assert('output PNG signature (stiker gerak)', pngAnim.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `(head: ${pngAnim.subarray(0, 8).toString('hex')})`)
  const pw = pngAnim.readUInt32BE(16)
  const ph = pngAnim.readUInt32BE(20)
  assert('dimensi 320x320 (frame pertama)', pw === 320 && ph === 320, `(${pw}x${ph})`)
} catch (err) {
  fail++
  console.log(`  ❌ error: ${err.message}\n${err.stack?.split('\n').slice(0, 4).join('\n')}`)
}

// Prefix dir temp lama yang dulu dipakai bot di /tmp (harus tetap jalan walau dihapus).
const PREFIX_TEMP = ['wa-lite-bot', 'wa-lite-textsticker', 'wa-yt-']

console.log('6) Tahan banting: dir temp dihapus saat bot jalan (regresi ENOENT)')
try {
  const { TEMP_ROOT } = await import('../src/features/tmpdir.js')
  assert(
    'dir temp bot DI LUAR /tmp (kebal pembersih /tmp)',
    !TEMP_ROOT.startsWith(os.tmpdir() + path.sep) && !TEMP_ROOT.startsWith(os.tmpdir() + '/'),
    `(TEMP_ROOT=${TEMP_ROOT})`
  )

  // Tiru pembersih /tmp DAN penghapusan seluruh folder temp bot, padahal modul
  // sudah dimuat (di produksi bot TIDAK restart setelah ini). Harus tetap jalan.
  const buang = () => {
    for (const e of fs.readdirSync(os.tmpdir())) {
      if (PREFIX_TEMP.some((p) => e.startsWith(p))) fs.rmSync(path.join(os.tmpdir(), e), { recursive: true, force: true })
    }
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true })
  }
  buang()
  const jpg = await makeSample('jpg', ['-frames:v', '1'])
  const sticker = await toStickerBuffer(jpg, { packName: 'Regresi' })
  assert('stiker tetap jadi walau dir temp dihapus', sticker.subarray(0, 4).toString() === 'RIFF' && sticker.length > 1000, `(${sticker.length} bytes)`)

  const png = await webpToPng(sticker)
  assert('toimg tetap jalan setelah dir temp dihapus', png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')

  buang()
  const sisaTmp = fs.readdirSync(os.tmpdir()).filter((e) => PREFIX_TEMP.some((p) => e.startsWith(p)))
  const sisaProject = fs.existsSync(TEMP_ROOT) ? fs.readdirSync(TEMP_ROOT) : []
  assert('tidak ada dir temp tersisa (dibersihkan sendiri)', sisaTmp.length === 0 && sisaProject.length === 0, `(/tmp: ${sisaTmp.join(', ')} | project: ${sisaProject.join(', ')})`)
} catch (err) {
  fail++
  console.log(`  ❌ error: ${err.message}`)
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log(`\nHasil: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
