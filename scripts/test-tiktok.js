// Tes live resolve TikTok (video / foto / audio). Pakai: node scripts/test-tiktok.js <url> [audio]
import { tiktokService } from '../src/features/tiktok.js'

const url = process.argv[2]
const audioOnly = process.argv[3] === 'audio'
if (!url) {
  console.log('Usage: node scripts/test-tiktok.js <url> [audio]')
  process.exit(1)
}

const magic = (buf) => buf.subarray(0, 4).toString('hex')
const isJpeg = (buf) => magic(buf).startsWith('ffd8')
const isMp4 = (buf) => buf.subarray(4, 8).toString() === 'ftyp'

try {
  const res = await tiktokService.resolve(url, { audioOnly })
  console.log('RESOLVE OK:', JSON.stringify({ type: res.type, title: res.title?.slice(0, 60), author: res.author, url: res.url?.slice(0, 80), images: res.images?.length }, null, 2))

  if (res.type === 'video') {
    const buf = await tiktokService.toBuffer(res.url, res._cookie)
    console.log(`DOWNLOAD OK: ${buf.length} bytes, magic: ${magic(buf)}, mp4: ${isMp4(buf)}`)
  } else if (res.type === 'slideshow') {
    // unduh semua gambar (mode tes) + cek benar-benar JPEG
    let okJpeg = 0
    for (const [i, imgUrl] of (res.images ?? []).entries()) {
      const buf = await tiktokService.toBuffer(imgUrl)
      const jpeg = isJpeg(buf)
      if (jpeg) okJpeg++
      console.log(`  gambar ${i + 1}: ${(buf.length / 1024).toFixed(0)} KB, magic ${magic(buf)}, jpeg: ${jpeg}`)
    }
    console.log(`DOWNLOAD OK: ${okJpeg}/${res.images?.length ?? 0} gambar valid JPEG`)
    if (res.audio) {
      const a = await tiktokService.toBuffer(res.audio, res._cookie)
      console.log(`  audio: ${(a.length / 1024).toFixed(0)} KB, magic ${magic(a)}`)
    } else {
      console.log('  audio: tidak ada')
    }
  } else if (res.type === 'audio') {
    const buf = await tiktokService.toBuffer(res.url, res._cookie)
    console.log(`DOWNLOAD OK: ${buf.length} bytes, magic: ${magic(buf)} (${res.filename})`)
  }
} catch (err) {
  console.log('FAIL:', err.message)
  process.exit(1)
}
