#!/usr/bin/env node
/**
 * Setup wizard — dari clone sampai bot bisa dipakai.
 *
 *   npm run setup                 # interaktif
 *   npm run setup -- --yes        # pakai default / nilai .env yang sudah ada
 *   npm run setup -- --pairing 628123456789 --owner 628123456789 --start
 *
 * Yang dilakukan:
 *   1. cek prasyarat (Node, ffmpeg, yt-dlp opsional)
 *   2. pasang dependensi (npm install) kalau node_modules belum ada
 *   3. tanya identitas bot + cara login → tulis .env (comment di .env.example tetap utuh)
 *   4. jalankan doctor (scripts/doctor.js) sebagai verifikasi
 *   5. tawarkan langsung `npm start` supaya kode pairing / QR muncul
 *
 * Tidak pernah menimpa .env tanpa backup: file lama disimpan sebagai
 * .env.bak.<timestamp>.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import readline from 'node:readline/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(ROOT, '.env')
const EXAMPLE_PATH = path.join(ROOT, '.env.example')
const MIN_NODE = 20

// ── warna (mati otomatis kalau bukan TTY / NO_COLOR) ────────────────────────
const COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const bold = (s) => paint('1', s)
const dim = (s) => paint('2', s)
const green = (s) => paint('32', s)
const yellow = (s) => paint('33', s)
const red = (s) => paint('31', s)
const cyan = (s) => paint('36', s)
const magenta = (s) => paint('35', s)

const say = (...a) => console.log(...a)
const line = () => say(dim('─'.repeat(58)))

// ── argumen ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = {}
  const bools = new Set(['yes', 'no-install', 'no-start', 'qr', 'help', 'skip-doctor', 'force'])
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]
    if (!raw.startsWith('-')) continue
    let name = raw.replace(/^--?/, '')
    if (name === 'y') name = 'yes'
    if (name === 'n') name = 'no-install'
    if (name === 'h') name = 'help'
    if (bools.has(name)) {
      flags[name] = true
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('-')) {
      flags[name] = true
    } else {
      flags[name] = next
      i++
    }
  }
  return flags
}

const HELP = `
${bold('npm run setup')} — wizard setup bot WhatsApp

Opsi:
  -y, --yes                 jangan tanya apa-apa, pakai default / isi .env lama
      --name "Nama Bot"     nama bot
      --prefix "!"          prefix command (boleh beberapa, mis. "!.")
      --owner 62812xxx      nomor pemilik (proteksi command, format 62xxx tanpa +)
      --pairing 62812xxx    nomor HP yang diloginkan → kode pairing
      --qr                  login lewat QR di terminal (bukan pairing code)
      --no-install          lewati npm install
      --skip-doctor         lewati pemeriksaan akhir
      --no-start            jangan tawarkan / jalankan bot di akhir
  -h, --help                tampilkan bantuan ini
`

const flags = parseArgs(process.argv.slice(2))
if (flags.help) {
  say(HELP.trim())
  process.exit(0)
}

const INTERACTIVE = Boolean(process.stdin.isTTY) && !flags.yes

// ── helper tanya-jawab ─────────────────────────────────────────────────────
let rl = null
function getRl() {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return rl
}

async function ask(question, { def = '', validate = null, hint = '' } = {}) {
  if (!INTERACTIVE) return def
  const suffix = def ? dim(` [${def || 'kosong'}]`) : ''
  for (;;) {
    const answer = (await getRl().question(`  ${question}${suffix} ${cyan('›')} `)).trim()
    const value = answer === '' ? def : answer
    const problem = validate ? validate(value) : null
    if (!problem) return value
    say(`  ${yellow('!')} ${problem}${hint ? dim(` — ${hint}`) : ''}`)
  }
}

async function askChoice(question, choices, defIndex = 0) {
  if (!INTERACTIVE) return choices[defIndex].value
  say(`  ${question}`)
  choices.forEach((ch, i) => say(`    ${cyan(String(i + 1))}) ${ch.label}${ch.note ? dim(`  ${ch.note}`) : ''}`))
  for (;;) {
    const answer = (await getRl().question(`  Pilihan ${dim(`[${defIndex + 1}]`)} ${cyan('›')} `)).trim()
    if (answer === '') return choices[defIndex].value
    const n = Number(answer)
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value
    const byValue = choices.find((c) => c.value === answer)
    if (byValue) return byValue.value
    say(`  ${yellow('!')} masukkan angka 1-${choices.length}`)
  }
}

async function askYesNo(question, def = true) {
  if (!INTERACTIVE) return def
  const answer = (await getRl().question(`  ${question} ${dim(def ? '[Y/n]' : '[y/N]')} ${cyan('›')} `)).trim().toLowerCase()
  if (answer === '') return def
  return answer === 'y' || answer === 'ya' || answer === 'yes'
}

// ── util ───────────────────────────────────────────────────────────────────
const digits = (s = '') => String(s).replace(/[^0-9]/g, '')

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

function tryRun(bin, args, timeout = 10000) {
  try {
    return spawnSync(bin, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).stdout?.trim() || ''
  } catch {
    return ''
  }
}

function parseEnvFile(text) {
  const out = {}
  for (const l of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** Set/ubah satu baris KEY=value tanpa menghapus komentar di sekitarnya. */
function setEnvLine(text, key, value) {
  const active = new RegExp(`^${key}=.*$`, 'm')
  if (active.test(text)) return text.replace(active, () => `${key}=${value}`)
  const commented = new RegExp(`^#\\s*${key}=.*$`, 'm')
  if (commented.test(text)) return text.replace(commented, () => `${key}=${value}`)
  return `${text.replace(/\s*$/, '')}\n${key}=${value}\n`
}

// ── langkah 1: prasyarat ───────────────────────────────────────────────────
function checkPrerequisites() {
  const problems = []
  const major = Number(process.versions.node.split('.')[0])
  if (major < MIN_NODE) problems.push(`Node ${process.versions.node} terlalu tua — butuh >= ${MIN_NODE}`)
  if (!fs.existsSync(path.join(ROOT, 'package.json'))) problems.push('package.json tidak ditemukan — jalankan dari folder project')
  return problems
}

function reportBinary(label, bin, { args = ['--version'], required = false, hint = '' } = {}) {
  const found = which(process.env[`${bin.toUpperCase().replace(/-/g, '_')}_PATH`] || bin)
  if (!found) {
    say(`  ${required ? red('✖') : yellow('•')} ${label.padEnd(22)} ${dim(required ? 'TIDAK ADA' : 'tidak ada (opsional)')}${hint ? dim(` — ${hint}`) : ''}`)
    return false
  }
  const version = tryRun(found, args).split('\n')[0].slice(0, 60)
  say(`  ${green('✔')} ${label.padEnd(22)} ${dim(version || found)}`)
  return true
}

// ── langkah 2: dependensi ──────────────────────────────────────────────────
function installDeps() {
  const hasModules = fs.existsSync(path.join(ROOT, 'node_modules'))
  if (hasModules && !flags.force) {
    say(`  ${green('✔')} node_modules sudah ada ${dim('(lewati npm install — pakai --force kalau mau pasang ulang)')}`)
    return true
  }
  if (flags['no-install']) {
    say(`  ${yellow('•')} npm install dilewati (--no-install)`)
    return hasModules
  }
  say(`  ${cyan('…')} menjalankan ${bold('npm install')} (bisa 1-3 menit, butuh internet)`)
  const res = spawnSync('npm', ['install'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) {
    say(`  ${red('✖')} npm install gagal — jalankan manual: ${bold('npm install')}`)
    return false
  }
  say(`  ${green('✔')} dependensi terpasang ${dim('(patch baileys otomatis via postinstall)')}`)
  return true
}

// ── langkah 3: identitas + login ───────────────────────────────────────────
async function collectAnswers() {
  const base = fs.existsSync(ENV_PATH) ? parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8')) : {}

  const name = flags.name ?? (await ask('Nama bot (boleh emoji)', {
    def: base.BOT_NAME || 'Columbina Bot',
  }))

  const prefix = flags.prefix ?? (await ask('Prefix command', {
    def: base.PREFIX || '!',
    validate: (v) => (v.trim() ? (/\s/.test(v) ? 'prefix tidak boleh ada spasi' : null) : 'prefix tidak boleh kosong'),
    hint: 'contoh: "!" atau "!." (dua prefix)',
  }))

  const method = flags.qr
    ? 'qr'
    : flags.pairing
      ? 'pairing'
      : await askChoice('Cara login perangkat', [
          { value: 'pairing', label: 'Kode pairing', note: '(disarankan — masukkan nomor HP)' },
          { value: 'qr', label: 'Scan QR di terminal' },
        ])

  let pairing = ''
  if (method === 'pairing') {
    pairing = digits(flags.pairing ?? (await ask('Nomor HP yang mau di-link (format 62xxx, tanpa +)', {
      def: digits(base.PAIRING_NUMBER || ''),
      validate: (v) => (!v ? 'nomor wajib diisi untuk mode pairing' : !/^62\d{8,14}$/.test(digits(v)) ? 'harus format 62 diikuti 8-14 angka' : null),
      hint: 'contoh: 6281234567890',
    })))
  }

  const owner = digits(
    flags.owner ??
      (await ask('Nomor pemilik bot (hanya nomor ini yang bisa pakai command)', {
        def: digits(base.OWNER_NUMBER || pairing || ''),
        validate: (v) => (!v ? null : !/^\d{8,15}$/.test(digits(v)) ? 'harus 8-15 angka' : null),
        hint: 'kosongkan = semua orang bisa pakai (tidak disarankan)',
      })),
  )

  return { name, prefix, method, pairing, owner }
}

function writeEnv({ name, prefix, method, pairing, owner }) {
  const template = fs.existsSync(EXAMPLE_PATH)
    ? fs.readFileSync(EXAMPLE_PATH, 'utf8')
    : 'BOT_NAME=\nPREFIX=!\nOWNER_NUMBER=\nPAIRING_NUMBER=\n'

  let text = template
  text = setEnvLine(text, 'BOT_NAME', name)
  text = setEnvLine(text, 'PREFIX', prefix)
  text = setEnvLine(text, 'OWNER_NUMBER', owner)
  text = setEnvLine(text, 'PAIRING_NUMBER', method === 'pairing' ? pairing : '')
  if (!/^SESSION_PATH=/m.test(text)) text = setEnvLine(text, 'SESSION_PATH', './sessions')

  if (fs.existsSync(ENV_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${ENV_PATH}.bak.${stamp}`
    fs.copyFileSync(ENV_PATH, backup)
    say(`  ${dim('(backup .env lama → ' + path.basename(backup) + ')')}`)
  }
  fs.writeFileSync(ENV_PATH, text)

  for (const dir of ['sessions', 'tmp', 'cookies']) {
    fs.mkdirSync(path.join(ROOT, dir), { recursive: true })
  }
  say(`  ${green('✔')} .env ditulis`)
}

// ── langkah 4: verifikasi ──────────────────────────────────────────────────
function runDoctor() {
  if (flags['skip-doctor']) {
    say(`  ${yellow('•')} doctor dilewati (--skip-doctor)`)
    return 0
  }
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'doctor.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  return res.status ?? 1
}

// ── langkah 5: jalankan ────────────────────────────────────────────────────
async function offerStart() {
  if (flags['no-start']) return
  const start = flags.start ? true : await askYesNo('Jalankan bot sekarang?', true)
  if (!start) {
    say('')
    say(`  ${bold('Jalankan nanti:')} npm start        ${dim('# atau: npm run dev (auto-restart)')}`)
    return
  }
  say('')
  say(`  ${cyan('…')} mulai bot. Kode pairing / QR muncul di bawah.`)
  say(`  ${dim('Tekan Ctrl+C untuk berhenti (session tersimpan di sessions/).')}`)
  say('')
  rl?.close()
  const res = spawnSync('npm', ['start'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  process.exitCode = res.status ?? 0
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  say('')
  say(magenta('  🌙  ') + bold('Columbina Bot — Setup Wizard'))
  say(dim('  dari clone sampai bot bisa dipakai'))
  line()

  say(bold('\n① Prasyarat'))
  const problems = checkPrerequisites()
  reportBinary('Node.js', 'node', { args: ['--version'], required: true })
  reportBinary('npm', 'npm', { args: ['--version'], required: true })
  const hasFfmpeg = reportBinary('ffmpeg', 'ffmpeg', { args: ['-version'], required: true, hint: 'sudo apt install ffmpeg' })
  reportBinary('yt-dlp', 'yt-dlp', { args: ['--version'], hint: 'fitur YouTube nonaktif tanpa ini' })
  if (problems.length) {
    say('')
    for (const p of problems) say(`  ${red('✖')} ${p}`)
    say(`\n  ${red('Setup dihentikan.')} Perbaiki prasyarat di atas dulu.`)
    process.exit(1)
  }
  if (!hasFfmpeg) say(`  ${yellow('!')} ffmpeg belum ada — sticker & hapus background tidak akan jalan.`)

  say(bold('\n② Dependensi'))
  const depsOk = installDeps()

  say(bold('\n③ Identitas & login'))
  const answers = await collectAnswers()
  writeEnv(answers)

  say(bold('\n④ Pemeriksaan akhir'))
  runDoctor()

  if (depsOk) await offerStart()
  else say(`\n  ${yellow('Selesaikan npm install dulu, baru jalankan:')} npm start`)

  rl?.close()
  line()
  say(`  ${green('Selesai.')} Butuh bantuan? ${bold('npm run doctor')} atau lihat README.md\n`)
}

main().catch((err) => {
  rl?.close()
  say(`\n${red('✖')} Setup gagal: ${err?.message || err}`)
  process.exit(1)
})