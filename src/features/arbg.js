// Hapus background via Adobe Express (Firefly) — kualitas tinggi, ±40-60 dtk.
//
// Jalan sebagai child process:  nice -n 10 xvfb-run -a node scripts/adobe-rmbg.mjs
// - Sesi login Adobe ada di profil Chrome (ADOBE_PROFILE) → profil HANYA boleh
//   dibuka satu proses sekaligus → busy lock global di modul ini.
// - Chrome jalan di core yang sama dengan bot; nice 10 supaya heartbeat Baileys
//   tetap menang kalau CPU penuh (kasus putus koneksi di rmbg dulu).
// - Timeout pagar: ADOBE_TIMEOUT_MS (default 240 dtk).
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import { workDir, cleanup, writeTemp } from './tmpdir.js'
import { transparencyRatio } from './rmbg.js'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/adobe-rmbg.mjs')
const ADOBE_TIMEOUT_MS = Number(process.env.ADOBE_TIMEOUT_MS || 300_000)

let busy = false

export function isArbgBusy() {
  return busy
}

function extOf(input) {
  // tentukan ekstensi dari magic bytes (bukan mime — bisa 'image/webp' dll)
  if (input.length > 4) {
    const sig = input.subarray(0, 4).toString('hex')
    if (sig === '89504e47') return '.png'
    if (sig === 'ffd8ff') return '.jpg'
  }
  return '.jpg'
}

function runScript(inPath, outPath) {
  return new Promise((resolve, reject) => {
    const base = ['xvfb-run', '-a', process.execPath, SCRIPT, inPath, outPath]
    const useNice = fs.existsSync('/usr/bin/nice')
    const bin = useNice ? '/usr/bin/nice' : base[0]
    const full = useNice ? ['-n', '10', ...base] : base
    const child = spawn(bin, full, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('ADOBE_TIMEOUT: Adobe Express tidak selesai dalam 300 detik'))
    }, ADOBE_TIMEOUT_MS)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && fs.existsSync(outPath)) return resolve()
      const line = err.trim().split('\n').pop() || ''
      const known = line.match(/ADOBE_ERR:[A-Z_]+/)
      reject(new Error(known ? line.replace(/^ADOBE_ERR:/, '') : (line || `adobe exit ${code}`)))
    })
  })
}

/**
 * @param {Buffer} input gambar (jpg/png/webp)
 * @returns {Promise<{ png: Buffer, ms: number }>} PNG transparan hasil Adobe Express
 * @throws {Error} err.message diawali kode: BUSY / SESSION_EXPIRED / ADOBE_TIMEOUT / ...
 */
export async function adobeRemoveBg(input) {
  if (busy) {
    const err = new Error('BUSY: Adobe sedang memproses gambar lain')
    err.code = 'BUSY'
    throw err
  }
  busy = true
  const dir = workDir('arbg-')
  try {
    // ukuran asli — Adobe proses server-side, tidak perlu resize lokal
    const inPath = writeTemp(dir, `in${extOf(input)}`, input)
    const outPath = path.join(dir, 'out.png')
    const t0 = Date.now()
    await runScript(inPath, outPath)
    const png = fs.readFileSync(outPath)
    return { png, ms: Date.now() - t0 }
  } finally {
    busy = false
    cleanup(dir)
  }
}

export { transparencyRatio }