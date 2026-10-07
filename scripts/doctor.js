#!/usr/bin/env node
/**
 * Doctor — periksa apakah bot siap jalan.
 *
 *   npm run doctor            # laporan manusiawi + exit code
 *   npm run doctor -- --json  # output JSON (buat otomatisasi)
 *
 * Exit code 0 = tidak ada masalah kritis, 1 = ada yang harus diperbaiki.
 * Tidak pernah mengubah apa pun — hanya membaca dan menjalankan `--version`.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MIN_NODE = 20
const JSON_MODE = process.argv.includes('--json')

const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && !JSON_MODE
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const bold = (s) => paint('1', s)
const dim = (s) => paint('2', s)
const green = (s) => paint('32', s)
const yellow = (s) => paint('33', s)
const red = (s) => paint('31', s)
const cyan = (s) => paint('36', s)

const checks = []
function add(level, title, detail = '', hint = '') {
  checks.push({ level, title, detail, hint })
}

const LEVELS = { ok: ['✔', green], warn: ['!', yellow], fail: ['✖', red], info: ['·', cyan] }

// ── util ───────────────────────────────────────────────────────────────────
function which(bin) {
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const p = path.join(dir, bin)
    try {
      fs.accessSync(p, fs.constants.X_OK)
      return p
    } catch {
      /* lanjut */
    }
  }
  return null
}

function tryRun(bin, args, timeout = 8000) {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] })
    return r.stdout?.trim() || ''
  } catch {
    return ''
  }
}

function parseEnv(text) {
  const out = {}
  for (const l of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const CORE_DEPS = [
  '@whiskeysockets/baileys',
  'sharp',
  '@napi-rs/canvas',
  'fluent-ffmpeg',
  'node-webpmux',
  'cheerio',
  'axios',
  'dotenv',
  'pino',
  'qrcode-terminal',
  'file-type',
]
const OPTIONAL_DEPS = ['playwright-core']

// ── pemeriksaan ────────────────────────────────────────────────────────────
function checkNode() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < MIN_NODE) add('fail', 'Node.js', `v${process.versions.node} (butuh >= ${MIN_NODE})`, 'pasang Node 20/22 LTS')
  else add('ok', 'Node.js', `v${process.versions.node}`)
}

function checkBinaries() {
  const ffmpeg = which(process.env.FFMPEG_PATH || 'ffmpeg')
  if (!ffmpeg) add('fail', 'ffmpeg', 'tidak ditemukan', 'sudo apt install ffmpeg')
  else add('ok', 'ffmpeg', tryRun(ffmpeg, ['-version']).split('\n')[0].slice(0, 48))

  const ytdlp = which(process.env.YTDLP_PATH || 'yt-dlp')
  if (!ytdlp) add('warn', 'yt-dlp', 'tidak ditemukan — !youtube / !ytmp3 mati', 'pipx install yt-dlp  |  uv tool install yt-dlp')
  else add('ok', 'yt-dlp', tryRun(ytdlp, ['--version']).slice(0, 40))

  const deno = which('deno')
  if (!deno) add('info', 'deno', 'tidak ada (opsional) — yt-dlp tanpa JS runtime, beberapa format bisa hilang', 'curl -fsSL https://deno.land/install.sh | sh')
  else add('ok', 'deno', tryRun(deno, ['--version']).split('\n')[0])

  const tor = which('tor')
  if (!tor) add('info', 'tor', 'tidak ada (opsional) — !cek pakai Tor kalau Cloudflare memblokir IP server', 'sudo apt install tor')
  else add('ok', 'tor', 'tersedia untuk !cek')
}

async function checkDeps() {
  const modulesDir = path.join(ROOT, 'node_modules')
  if (!fs.existsSync(modulesDir)) {
    add('fail', 'Dependensi', 'node_modules belum ada', 'npm install')
    return
  }
  const missing = []
  for (const dep of CORE_DEPS) {
    try {
      await import(dep)
    } catch {
      missing.push(dep)
    }
  }
  if (missing.length) add('fail', 'Dependensi', `tidak bisa dimuat: ${missing.join(', ')}`, 'npm install')
  else add('ok', 'Dependensi', `${CORE_DEPS.length} paket inti siap`)

  const missingOpt = []
  for (const dep of OPTIONAL_DEPS) {
    try {
      await import(dep)
    } catch {
      missingOpt.push(dep)
    }
  }
  if (missingOpt.length) add('info', 'Dependensi opsional', `belum ada: ${missingOpt.join(', ')} — hanya dipakai !arbg`, 'npm install')
}

function checkBaileysPatch() {
  const target = path.join(ROOT, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js')
  if (!fs.existsSync(target)) {
    add('info', 'Patch baileys', 'baileys belum terpasang', 'npm install')
    return
  }
  const src = fs.readFileSync(target, 'utf8')
  if (src.includes('normalizeMessageContent(message) || message')) add('ok', 'Patch baileys', 'mediatype pesan terbungkus (view once) sudah dipatch')
  else add('fail', 'Patch baileys', 'belum dipatch — pesan sekali-lihat tidak akan sampai', 'node scripts/patch-baileys.js')
}

function checkEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    add('fail', '.env', 'belum ada', 'npm run setup')
    return {}
  }
  const env = parseEnv(fs.readFileSync(envPath, 'utf8'))
  add('ok', '.env', 'terbaca')

  if (env.OWNER_NUMBER) add('ok', 'OWNER_NUMBER', `terisi (${env.OWNER_NUMBER.slice(0, 4)}…) — command dibatasi ke pemilik`)
  else add('warn', 'OWNER_NUMBER', 'kosong — siapa pun yang tahu nomor bot bisa memakai command', 'isi OWNER_NUMBER di .env')

  if (env.PAIRING_NUMBER) add('ok', 'Login', `mode pairing code (${env.PAIRING_NUMBER.slice(0, 4)}…)`)
  else add('info', 'Login', 'mode QR (PAIRING_NUMBER kosong)')

  const sessionPath = path.resolve(ROOT, env.SESSION_PATH || './sessions')
  const creds = path.join(sessionPath, 'creds.json')
  if (fs.existsSync(creds)) {
    let registered = false
    try {
      registered = Boolean(JSON.parse(fs.readFileSync(creds, 'utf8')).registered)
    } catch {
      /* rusak */
    }
    if (registered) add('ok', 'Session', 'sudah login (creds.json tersimpan)')
    else add('warn', 'Session', 'creds.json ada tapi belum terdaftar', 'hapus folder sessions/ lalu start ulang')
  } else {
    add('info', 'Session', 'belum login — jalankan npm start untuk pairing/QR')
  }
  return env
}

function checkRuntime() {
  const tmp = process.env.BOT_TEMP_DIR || path.join(ROOT, 'tmp')
  try {
    fs.mkdirSync(tmp, { recursive: true })
    const probe = path.join(tmp, `.doctor-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    add('ok', 'Folder kerja', tmp)
  } catch (err) {
    add('fail', 'Folder kerja', `tidak bisa ditulis: ${err.message}`)
  }

  const osTmp = os.tmpdir()
  if (path.resolve(tmp).startsWith(path.resolve(osTmp))) {
    add('warn', 'Folder kerja', `berada di dalam ${osTmp} — bisa dibersihkan sistem saat bot jalan`, 'set BOT_TEMP_DIR ke folder project')
  }
}

async function checkAssets() {
  try {
    const fonts = await import(pathToFileURL(path.join(ROOT, 'src', 'features', 'fonts.js')).href)
    const registered = fonts.registeredFamilies ?? []
    const families = typeof fonts.availableFamilies === 'function' ? fonts.availableFamilies() : []
    if (registered.length) add('ok', 'Font stiker teks', `dari assets/fonts: ${registered.join(', ')}`)
    else if (families.length) add('ok', 'Font stiker teks', `pakai font sistem (${families.slice(0, 3).join(', ')}…)`)
    else add('warn', 'Font stiker teks', 'tidak ada font terdaftar', 'taruh .ttf/.otf di assets/fonts/')
  } catch (err) {
    add('info', 'Font stiker teks', `tidak bisa diperiksa (${err.message.split('\n')[0]})`)
  }

  const banner = process.env.MENU_BANNER_IMAGE_FILE || path.join(ROOT, 'assets', 'columbina', 'banner.jpg')
  if (fs.existsSync(banner)) add('ok', 'Banner menu', path.relative(ROOT, banner))
  else add('info', 'Banner menu', 'tidak ada — !menu pakai teks saja', 'taruh gambar di assets/columbina/banner.jpg')
}

function checkOptionalFeatures() {
  const py = process.env.RMBG_PYTHON || path.join(os.homedir(), 'rembg-venv', 'bin', 'python')
  if (fs.existsSync(py)) add('ok', 'rembg (!rmbg)', 'venv siap')
  else add('info', 'rembg (!rmbg)', 'venv tidak ada — hapus background lokal nonaktif', 'python3 -m venv ~/rembg-venv && ~/rembg-venv/bin/pip install rembg onnxruntime')

  const profile = path.join(os.homedir(), 'adobe-rmbg-profile')
  if (fs.existsSync(profile)) add('ok', 'Adobe (!arbg)', 'profil Chrome siap')
  else add('info', 'Adobe (!arbg)', 'profil Chrome belum ada — perlu login Adobe sekali (lihat README)', 'lihat README bagian "Hapus background via Adobe Express"')
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  checkNode()
  checkBinaries()
  await checkDeps()
  checkBaileysPatch()
  checkEnv()
  checkRuntime()
  await checkAssets()
  checkOptionalFeatures()

  if (JSON_MODE) {
    const count = (l) => checks.filter((c) => c.level === l).length
    console.log(JSON.stringify({ ok: count('ok'), warn: count('warn'), fail: count('fail'), info: count('info'), checks }, null, 2))
    process.exit(checks.some((c) => c.level === 'fail') ? 1 : 0)
  }

  console.log('')
  console.log(bold('  🩺  Doctor — pemeriksaan kesiapan bot'))
  console.log(dim('  ' + '─'.repeat(56)))
  console.log('')
  for (const c of checks) {
    const [icon, color] = LEVELS[c.level]
    console.log(`  ${color(icon)} ${c.title.padEnd(20)} ${c.detail ? dim(c.detail) : ''}`)
    if (c.hint && c.level !== 'ok') console.log(`    ${dim('↳ ' + c.hint)}`)
  }

  const fails = checks.filter((c) => c.level === 'fail')
  const warns = checks.filter((c) => c.level === 'warn')
  console.log('')
  console.log(dim('  ' + '─'.repeat(56)))
  if (fails.length) {
    console.log(`  ${red(bold('Perlu diperbaiki:'))} ${fails.length} masalah kritis, ${warns.length} peringatan`)
    console.log(`  ${dim('Jalankan perintah di baris ↳ di atas, lalu ulangi: npm run doctor')}`)
  } else if (warns.length) {
    console.log(`  ${yellow(bold('Siap jalan'))} dengan ${warns.length} peringatan. ${dim('npm start')}`)
  } else {
    console.log(`  ${green(bold('Semua siap.'))} ${dim('npm start')}`)
  }
  console.log('')
  process.exit(fails.length ? 1 : 0)
}

main().catch((err) => {
  console.error(`doctor gagal: ${err?.message || err}`)
  process.exit(1)
})