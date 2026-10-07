// Tes end-to-end fitur YouTube bot WA (probe + download) tanpa connect WhatsApp.
// Pakai: node scripts/test-youtube.js <url> [audio]
// .env dimuat otomatis di sini supaya YT_COOKIES_PATH/YT_PROXY kebaca.
import 'dotenv/config'
import { youtubeService } from '../src/features/youtube.js'

const url = process.argv[2]
const audioOnly = process.argv[3] === 'audio'
if (!url) { console.error('Usage: node scripts/test-youtube.js <url> [audio]'); process.exit(1) }

const t0 = Date.now()
try {
  const info = await youtubeService.probe(url)
  console.log('PROBE OK:', info)

  const { buffer, ext, title } = await youtubeService.download(url, { audioOnly })
  const magic = buffer.subarray(0, 12).toString('hex')
  console.log('DOWNLOAD OK')
  console.log('  title :', title)
  console.log('  ext   :', ext)
  console.log('  bytes :', buffer.length, `(${(buffer.length / 1048576).toFixed(2)} MB)`)
  console.log('  magic :', magic)
  console.log('  waktu :', ((Date.now() - t0) / 1000).toFixed(1), 's')
  const ok = audioOnly
    ? /494433|fffb|fff3/.test(magic) || ext === 'mp3'
    : /66747970|1a45dfa3/.test(magic)   // ftyp (mp4) atau EBML (webm/mkv)
  console.log(ok ? 'RESULT: VALID ✅' : 'RESULT: MAGIC BYTES TIDAK DIKENAL ⚠️')
  process.exit(ok ? 0 : 2)
} catch (err) {
  console.error('GAGAL:', err.message)
  process.exit(1)
}
