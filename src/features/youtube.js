// Downloader YouTube via yt-dlp (open source, gratis, tanpa API key).
// Wajib install: uv tool install yt-dlp  (atau: pipx install yt-dlp)
// yt-dlp jauh lebih awet daripada scraper manual — komunitas update terus.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { workDir, cleanup } from './tmpdir.js'

const execFileP = promisify(execFile)

// Cari binary yt-dlp: YTDLP_PATH > lokasi umum > PATH.
// pm2/systemd sering jalan dengan PATH minimal (ENOENT walau di shell ada),
// jadi kita resolve ke path absolut sendiri.
function resolveYtdlp() {
  const fromEnv = process.env.YTDLP_PATH
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'), // uv tool / pipx
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
  ]
  for (const c of candidates) {
    try { if (fs.existsSync(c) && (fs.statSync(c).mode & 0o111)) return c } catch { /* lanjut */ }
  }
  for (const dir of String(process.env.PATH || '').split(':')) {
    if (!dir) continue
    const p = path.join(dir, 'yt-dlp')
    try { if (fs.existsSync(p) && (fs.statSync(p).mode & 0o111)) return p } catch { /* lanjut */ }
  }
  return null
}
const YTDLP = resolveYtdlp()
const YTDLP_HINT = 'Tidak ketemu di server. Install: `uv tool install yt-dlp` (atau `pipx install yt-dlp`), '
  + 'cek dengan `which yt-dlp`. Kalau tetap ENOENT padahal ada (pm2 PATH minimal), isi .env: '
  + 'YTDLP_PATH=/home/USER/.local/bin/yt-dlp lalu restart bot. Butuh juga ffmpeg.'
const MAX_BYTES = 50 * 1024 * 1024 // batas aman upload WhatsApp

const clampTitle = (s = '') => String(s).replace(/[\\/:*?"<>|\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

class YoutubeService {
  async _run(args) {
    if (!YTDLP) throw new Error(`yt-dlp ${YTDLP_HINT}`)
    try {
      const { stdout } = await execFileP(YTDLP, args, { timeout: 300_000, maxBuffer: 1024 * 1024 })
      return stdout
    } catch (err) {
      if (err?.code === 'ENOENT') throw new Error(`yt-dlp ${YTDLP_HINT}`)
      const msg = err?.stderr || err?.message || ''
      // pesan error yt-dlp biasanya di baris paling akhir yang relevan
      const line = msg.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300)
      throw new Error(line
        ? this._friendlyError(line)
        : `Gagal menjalankan yt-dlp (${YTDLP}). ${YTDLP_HINT}`)
    }
  }

  // Arg bantu anti-blokir YouTube (khusus IP server/VPS):
  //   YT_COOKIES_PATH        = ./cookies/youtube.txt  (export cookies dari browser)
  //   YT_PROXY               = socks5://127.0.0.1:1080 atau http://user:pass@host:port
  //   YT_EXTRACTOR_ARGS      = youtube:player_client=tv,web_embedded  (coba client lain)
  _cookieArgs() {
    const args = []
    const p = process.env.YT_COOKIES_PATH
    if (p && fs.existsSync(p)) args.push('--cookies', p)
    const proxy = process.env.YT_PROXY
    if (proxy) args.push('--proxy', proxy)
    const xa = process.env.YT_EXTRACTOR_ARGS
    if (xa) args.push('--extractor-args', xa)
    const extra = process.env.YT_EXTRA_ARGS
    if (extra) args.push(...extra.split(/\s+/).filter(Boolean))
    return args
  }

  _friendlyError(raw = '') {
    const msg = String(raw)
    if (/Sign in to confirm|not a bot|cookies/i.test(msg)) {
      return 'YouTube minta verifikasi (IP server ini dicurigai bot). Solusi: '
        + '1) taruh cookies login di cookies/youtube.txt lalu set YT_COOKIES_PATH di .env '
        + '(pakai akun Google buangan, jangan akun utama), atau '
        + '2) set YT_PROXY ke proxy/VPN, atau '
        + '3) YT_EXTRACTOR_ARGS="youtube:player_client=tv,web_embedded". Restart bot setelah ubah .env.'
    }
    if (/Video unavailable|Private video|members-only|age[- ]?restricted|confirm your age/i.test(msg)) {
      return 'Video tidak bisa diakses tanpa login (private/age-restricted/members-only). Butuh cookies.'
    }
    return msg
  }

  async probe(url) {
    // Ambil judul dulu biar bisa ditampilkan sebelum download
    const out = await this._run([...this._cookieArgs(), '--no-playlist', '--skip-download', '--no-warnings', '--print', '%(title)s|%(duration_string)s', '--', url])
    const [title = '', duration = ''] = out.trim().split('|')
    return { title, duration }
  }

  // Download ke folder temp, balikin { buffer, ext, title }
  async download(url, { audioOnly = false } = {}) {
    const tmpDir = workDir('yt-')
    const outTmpl = path.join(tmpDir, '%(title).80B [%(id)s].%(ext)s')

    const args = [...this._cookieArgs(), '--no-playlist', '--no-warnings', '--newline', '-o', outTmpl, '--max-filesize', '50M']
    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '5')
    } else {
      // WAJIB h264 (avc1) + aac: kalau kena AV1/VP9 (format baru YouTube) hasilnya
      // .webm/.mkv, dan WhatsApp sering tolak / video hitam "codec tidak didukung".
      // Urutan fallback: mp4-avc1 → mp4 apa pun → apa saja (terakhir, jarang kepakai).
      args.push('-f', [
        'bv*[ext=mp4][vcodec^=avc1][height<=720]+ba[ext=m4a]',
        'bv*[vcodec^=avc1][height<=720]+ba',
        'b[ext=mp4][vcodec^=avc1][height<=720]',
        'bv*[ext=mp4][height<=720]+ba[ext=m4a]',
        'bv*[height<=720]+ba/b[height<=720]/b',
      ].join('/'))
      args.push('--merge-output-format', 'mp4')
    }
    args.push('--', url)

    try {
      await this._run(args)
    } catch (err) {
      cleanup(tmpDir)
      const isTooBig = /Files larger than 50M|File is larger than max-filesize/.test(err.message)
      throw new Error(isTooBig
        ? 'Video > 50MB (limit WhatsApp). Coba versi pendek atau pakai `!yt audio` buat MP3-nya.'
        : err.message)
    }

    const files = fs.readdirSync(tmpDir).filter((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'))
    if (!files.length) { cleanup(tmpDir); throw new Error('Download gagal — tidak ada file output.') }

    const file = files[0]
    const filePath = path.join(tmpDir, file)
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_BYTES) {
      cleanup(tmpDir)
      throw new Error('Hasil download > 50MB (limit WhatsApp). Coba video pendek atau mode `!yt audio`.')
    }

    const ext = path.extname(file).replace('.', '')
    const title = clampTitle(file.replace(/\s*\[[a-zA-Z0-9_-]{11}\]\.\w+$/, ''))
    const buffer = fs.readFileSync(filePath)
    cleanup(tmpDir)
    return { buffer, ext, title }
  }
}

export const youtubeService = new YoutubeService()
