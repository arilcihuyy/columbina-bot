// Remove background via rembg (Python, model u2net ONNX) — pengganti imgly.
//
// Kenapa child process + nice:
// - Inferensi makan 1 vCPU penuh; tanpa `nice` heartbeat Baileys kelewat dan
//   koneksi WA putus (kasus nyata 2026-10-05: "Connection Closed" + no respon).
//   nice 19 = proses AI selalu mengalah ke event loop bot.
// - Timeout 180 dtk sebagai pagar (VPS 1 vCPU: ±20-30 dtk per foto).
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import sharp from 'sharp'
import { workDir, cleanup, writeTemp } from './tmpdir.js'

const BRIDGE = path.join(path.dirname(new URL(import.meta.url).pathname), '../../scripts/rmbg-bridge.py')

function pythonBin() {
  if (process.env.RMBG_PYTHON) return process.env.RMBG_PYTHON
  for (const p of [path.join(os.homedir(), 'rembg-venv/bin/python'), '/usr/bin/python3']) {
    if (fs.existsSync(p)) return p
  }
  return 'python3'
}

function runBridge(inPath, outPath, timeoutMs = 180_000) {
  const py = pythonBin()
  const args = (py.endsWith('/nice') ? [] : ['-n', '19']) // dipakai saat lewat /usr/bin/nice
  const bin = fs.existsSync('/usr/bin/nice') ? '/usr/bin/nice' : py
  const full = bin === py ? [] : args
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...full, py, BRIDGE, inPath, outPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('timeout: proses remove background lebih dari 180 detik'))
    }, timeoutMs)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      let parsed = null
      try { parsed = JSON.parse(out.trim().split('\n').pop()) } catch { /* fallthrough */ }
      if (parsed?.ok) return resolve(parsed)
      reject(new Error(parsed?.error || err.trim().split('\n').pop() || `bridge exit ${code}`))
    })
  })
}

/**
 * @param {Buffer} input gambar (jpg/png/webp; stiker animasi → frame 1)
 * @returns {Promise<{ png: Buffer, ms: number, width: number, height: number }>}
 */
export async function removeBg(input) {
  const dir = workDir('rmbg-')
  try {
    // foto HP bisa 12MP+: kecilkan sebelum inferensi (u2net input 320px, hasil matte upscaling —
    // di atas 2000px hanya memperlambat tanpa tambah kualitas)
    const pre = await sharp(input, { pages: 1 })
      .rotate()
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    const inPath = writeTemp(dir, 'in.png', pre)
    const outPath = path.join(dir, 'out.png')
    const info = await runBridge(inPath, outPath)
    const png = fs.readFileSync(outPath)
    return { png, ms: (info.import_s + info.load_s) * 1000 + info.ms, width: info.width, height: info.height }
  } finally {
    cleanup(dir)
  }
}

/** Cek ada cukup piksel transparan → guard hasil gagal (mis. model mengembalikan gambar penuh) */
export async function transparencyRatio(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  let transparent = 0
  const total = info.width * info.height
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] < 16) transparent++
  }
  return transparent / total
}
