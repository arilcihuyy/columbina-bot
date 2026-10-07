// Tes !arbg: jalankan mesin Adobe Express beneran lewat feature (sama seperti bot).
//   node scripts/test-arbg.js [gambar]        (default: /tmp/test-photo.jpg)
// Menguji: CLI sukses, output PNG ada, punya piksel transparan (guard yang sama
// dengan command), durasi, dan error path kalau gambar tidak valid.
import { adobeRemoveBg, transparencyRatio } from '../src/features/arbg.js'
import fs from 'node:fs'

const img = process.argv[2] || '/tmp/test-photo.jpg'
if (!fs.existsSync(img)) {
  console.error(`gambar tidak ada: ${img}`)
  process.exit(1)
}

console.log('input:', img, (fs.statSync(img).size / 1024).toFixed(0) + 'KB')
const t0 = Date.now()
try {
  const { png, ms } = await adobeRemoveBg(fs.readFileSync(img))
  console.log(`mesin OK — ${(ms / 1000).toFixed(1)}s, ${(png.length / 1024).toFixed(0)}KB`)

  const ratio = await transparencyRatio(png)
  console.log(`transparansi: ${(ratio * 100).toFixed(1)}%`)
  if (ratio < 0.01) {
    console.error('FAIL: hasil tidak transparan (guard bot akan menolak)')
    process.exit(1)
  }

  const out = `/tmp/arbg-test-${Date.now()}.png`
  fs.writeFileSync(out, png)
  console.log('PASS — hasil disimpan di', out)
} catch (err) {
  console.error('FAIL:', err?.message || err)
  process.exit(1)
}