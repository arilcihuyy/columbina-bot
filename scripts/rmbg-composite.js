// Komposit hasil di atas background papan catur + magenta untuk verifikasi visual alpha
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const src = process.argv[2]
const png = readFileSync(src)

async function checker(w, h, size = 24) {
  const tiles = []
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      tiles.push({ input: { create: { width: Math.min(size, w - x), height: Math.min(size, h - y), channels: 3, background: ((x / size + y / size) % 2) ? '#ffffff' : '#cccccc' } }, left: x, top: y })
    }
  }
  return sharp({ create: { width: w, height: h, channels: 3, background: '#fff' } }).composite(tiles).png().toBuffer()
}

const meta = await sharp(png).metadata()
const bg = await checker(meta.width, meta.height)
const onChecker = await sharp(bg).composite([{ input: png }]).png().toBuffer()
const onMagenta = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: '#ff00ff' } }).composite([{ input: png }]).png().toBuffer()

writeFileSync(src.replace(/\.nobg\.png$/, '') + '.checker.png', onChecker)
writeFileSync(src.replace(/\.nobg\.png$/, '') + '.magenta.png', onMagenta)

// statistik alpha: halo = banyak piksel semi-transparan
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
let hard0 = 0, hard255 = 0, mid = 0
const total = info.width * info.height
for (let i = 3; i < data.length; i += info.channels) {
  const a = data[i]
  if (a < 8) hard0++
  else if (a > 247) hard255++
  else mid++
}
console.log(`alpha: transparan=${(hard0 / total * 100).toFixed(1)}% pekat=${(hard255 / total * 100).toFixed(1)}% semi=${(mid / total * 100).toFixed(1)}%`)
console.log('output:', src.replace(/\.nobg\.png$/, '') + '.checker.png')
