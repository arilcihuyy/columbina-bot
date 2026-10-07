// Diagnosa cepat fitur YouTube di server/VPS:
//   node scripts/yt-doctor.js [url-untuk-tes]
// Cek: yt-dlp, ffmpeg, deno, file cookies, env anti-blokir, lalu (opsional) tes download asli.
import 'dotenv/config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileP = promisify(execFile)
const ok = (s) => `  ✅ ${s}`
const bad = (s) => `  ❌ ${s}`
const warn = (s) => `  ⚠️  ${s}`

async function which(cmd) {
  try { const { stdout } = await execFileP('bash', ['-lc', `command -v ${cmd}`]); return stdout.trim() || null } catch { return null }
}

console.log('\n=== YT DOCTOR ===')
console.log(`node      : ${process.version}`)
console.log(`cwd       : ${process.cwd()}`)
console.log(`HOME      : ${os.homedir()}`)

// 1. yt-dlp
const envPath = process.env.YTDLP_PATH
console.log('\n[1] yt-dlp')
if (envPath) console.log(fs.existsSync(envPath) ? ok(`YTDLP_PATH=${envPath}`) : bad(`YTDLP_PATH=${envPath} (file tidak ada!)`))
const cand = [path.join(os.homedir(), '.local/bin/yt-dlp'), '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', await which('yt-dlp')].filter(Boolean)
const found = cand.find((c) => { try { return fs.existsSync(c) } catch { return false } })
if (found) {
  try { const { stdout } = await execFileP(found, ['--version']); console.log(ok(`${found} → versi ${stdout.trim()}`)) }
  catch (e) { console.log(bad(`${found} ada tapi gagal dijalankan: ${e.message}`)) }
} else {
  console.log(bad('yt-dlp tidak ketemu. Install: uv tool install yt-dlp'))
}

// 2. ffmpeg
console.log('\n[2] ffmpeg (buat gabung video+audio / mp3)')
const ff = await which('ffmpeg')
console.log(ff ? ok(ff) : bad('ffmpeg tidak ada → sudo apt install -y ffmpeg'))

// 2b. deno — JS runtime yang dipakai yt-dlp untuk YouTube (2026)
console.log('\n[2b] deno (JS runtime yt-dlp; tanpa ini error "The page needs to be reloaded")')
const denoCand = await which('deno') || [path.join(os.homedir(), '.deno/bin/deno'), '/usr/local/bin/deno']
  .find((c) => { try { return fs.existsSync(c) } catch { return false } })
if (denoCand) console.log(ok(denoCand))
else console.log(warn('deno tidak ada → curl -fsSL https://deno.land/install.sh | sh, lalu symlink ke /usr/local/bin/deno'))

// 3. cookies
console.log('\n[3] cookies YouTube')
const cp = process.env.YT_COOKIES_PATH
console.log(cp ? `  YT_COOKIES_PATH=${cp}` : warn('YT_COOKIES_PATH tidak diset di .env'))
if (cp) {
  if (!fs.existsSync(cp)) {
    console.log(bad(`file tidak ada di ${path.resolve(cp)}`))
  } else {
    const txt = fs.readFileSync(cp, 'utf8')
    const lines = txt.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    const hasYt = /\.youtube\.com/.test(txt)
    const netscape = lines.some((l) => l.split('\t').length >= 6)
    console.log(fs.statSync(cp).size > 100 ? ok(`${path.resolve(cp)} — ${lines.length} entri cookie`) : bad('file terlalu kecil / kosong'))
    console.log(hasYt ? ok('ada entri .youtube.com') : bad('tidak ada entri .youtube.com — export ulang dari halaman youtube.com saat sudah login'))
    console.log(netscape ? ok('format Netscape (tab-separated) terdeteksi') : bad('format bukan Netscape → pakai extension "Get cookies.txt LOCALLY"'))
  }
}

// 4. env anti-blokir
console.log('\n[4] env anti-blokir')
console.log(process.env.YT_PROXY ? `  YT_PROXY=${process.env.YT_PROXY}` : '  YT_PROXY tidak diset')
console.log(process.env.YT_EXTRACTOR_ARGS ? `  YT_EXTRACTOR_ARGS=${process.env.YT_EXTRACTOR_ARGS}` : '  YT_EXTRACTOR_ARGS tidak diset')

// 5. tes asli
const url = process.argv[2]
if (url && found) {
  console.log('\n[5] tes download asli')
  const { youtubeService } = await import('../src/features/youtube.js')
  try {
    const info = await youtubeService.probe(url)
    console.log(ok(`probe: ${info.title} (${info.duration})`))
    const { buffer, ext } = await youtubeService.download(url)
    console.log(ok(`download: ${ext}, ${(buffer.length / 1048576).toFixed(2)} MB, magic ${buffer.subarray(0, 8).toString('hex')}`))
    console.log('\nHASIL: YouTube SIAP ✅')
  } catch (e) {
    console.log(bad(e.message))
    console.log('\nHASIL: belum bisa ❌')
    process.exitCode = 1
  }
} else if (!url) {
  console.log('\n(tambah URL untuk tes download: node scripts/yt-doctor.js "https://youtu.be/xxxx")')
}
console.log('')
