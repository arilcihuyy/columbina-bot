// Lihat ke mana sebuah link pergi TANPA membukanya di HP.
//
// Prinsip (disepakati 2026-09-18): TIDAK memakai layanan pihak ketiga. Link user
// tidak pernah diserahkan ke server orang lain — semua request keluar dari
// server ini sendiri. Kalau Cloudflare memblokir ASN server (error 1005), kita
// pindah ke Tor lokal (127.0.0.1:9050) yang jalan di mesin yang sama.
//
// Tingkat 1 — shortlink biasa (bit.ly, tinyurl, s.id, linktr.ee, ...):
//   cukup ikuti redirect HTTP + baca <meta refresh> dan redirect JavaScript.
//   Tidak ada halaman yang di-render, jadi popup/APK tidak pernah muncul.
//
// Tingkat 2 — gerbang iklan (safelinku/sfl.gl dan sejenisnya):
//   halaman gerbangnya (React) memanggil API-nya sendiri:
//     POST /api/session  -> { step }
//     POST /api/verify   -> { target }   (ronde 1, lanjut ke artikel berikutnya)
//     POST /api/go       -> { url }      (ronde 2, menuju halaman "ready")
//   Halaman "ready" itu masih memuat tujuan aslinya sebagai teks:
//     location.href = "https://safefileku.com/download/..."
//   Semua itu bisa diikuti dengan HTTP biasa — tidak perlu headless browser.
//
// ENV:
//   LINKCHECK_TOR        (default 127.0.0.1:9050) — set "" untuk matikan Tor
//   LINKCHECK_TIMEOUT    (default 40) detik per request
//   LINKCHECK_MAX_HOPS   (default 8) lompatan maksimum
//   LINKCHECK_MAX_PARALEL(default 2) resolve bersamaan
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const UA =
  process.env.LINKCHECK_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export const TOR_HOST = (process.env.LINKCHECK_TOR ?? '127.0.0.1:9050').trim()
const TIMEOUT_S = Number(process.env.LINKCHECK_TIMEOUT || 40)
const MAX_HOPS = Number(process.env.LINKCHECK_MAX_HOPS || 8)
const MAX_PARALEL = Number(process.env.LINKCHECK_MAX_PARALEL || 2)

const META = '__CURLMETA__'
// halaman yang tidak bisa dilewati tanpa browser (challenge JS / ASN diblokir)
const BLOCKED_RE =
  /error code:\s*(1005|1006|1007|1008|1010|1020)|cf-error-details|Attention Required!|Just a moment\.\.\.|Enable JavaScript and cookies to continue/i

// ── util kecil ───────────────────────────────────────────────
export function normalizeUrl(input = '') {
  let s = String(input).trim().replace(/[>,.)\]]+$/, '')
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return '' // skema aneh (magnet:, tg:, ...)
    s = 'https://' + s
  }
  try {
    const u = new URL(s)
    if (!u.hostname.includes('.')) return ''
    return u.toString()
  } catch {
    return ''
  }
}

const absolutize = (href, base) => {
  try {
    return new URL(String(href).replace(/\\\//g, '/').replace(/&amp;/g, '&'), base).toString()
  } catch {
    return ''
  }
}

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

const hostOf = (url) => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// Host yang sudah terbukti memblokir IP server -> langsung pakai Tor,
// supaya tidak membuang waktu mencoba jalur langsung lagi.
const torHosts = new Set()

// ── HTTP lewat curl (dukung cookie jar + SOCKS5 Tor) ─────────
function runCurl(args) {
  return new Promise((resolve) => {
    execFile(
      'curl',
      args,
      { maxBuffer: 16 * 1024 * 1024, timeout: (TIMEOUT_S + 20) * 1000 },
      (err, stdout = '', stderr = '') => resolve({ err, stdout: String(stdout), stderr: String(stderr) }),
    )
  })
}

export class Fetcher {
  constructor({ tor = !!TOR_HOST, timeout = TIMEOUT_S } = {}) {
    this.torAllowed = tor
    this.useTor = false
    this.timeout = timeout
    this.id = crypto.randomBytes(6).toString('hex')
    this.jar = path.join(os.tmpdir(), `lc-${this.id}.jar`)
    this.bodyFile = path.join(os.tmpdir(), `lc-${this.id}.body`)
  }

  async #raw({ url, method = 'GET', body = null, headers = {}, tor }) {
    const args = [
      '-sS',
      '-A', UA,
      '-c', this.jar,
      '-b', this.jar,
      '--max-time', String(this.timeout),
      '--compressed',
      '-o', this.bodyFile,
      '-w', `${META}%{http_code}|%{url_effective}|%{size_download}`,
      '-H', 'Accept-Language: id-ID,id;q=0.9,en;q=0.8',
    ]
    if (tor && TOR_HOST) args.push('--socks5-hostname', TOR_HOST.replace(/^socks5h?:\/\//, ''))
    if (method === 'POST') args.push('-X', 'POST')
    if (body != null) args.push('-H', 'Content-Type: application/json', '--data-binary', body)
    for (const [k, v] of Object.entries(headers)) if (v) args.push('-H', `${k}: ${v}`)
    if (method === 'GET') args.push('-L', '--max-redirs', '10')
    args.push(url)

    const { err, stdout, stderr } = await runCurl(args)
    let text = ''
    try {
      text = await fs.readFile(this.bodyFile, 'utf8')
    } catch {
      /* kosong */
    }
    const m = stdout.lastIndexOf(META)
    let status = 0
    let eff = url
    if (m >= 0) {
      const [code, urlEff] = stdout.slice(m + META.length).split('|')
      status = Number(code) || 0
      eff = urlEff || url
    }
    if (err && !status) {
      const msg = String(err.message || '')
      const why = /timed? ?out|ETIMEDOUT/i.test(msg + stderr) ? 'timeout' : 'gagal konek'
      return { ok: false, status: 0, url: eff, body: text, error: why, viaTor: !!tor }
    }
    return { ok: true, status, url: eff, body: text, viaTor: !!tor, headers: stdout.slice(0, m) }
  }

  /** GET, otomatis pindah ke Tor kalau Cloudflare memblokir IP server. */
  async get(url, opts = {}) {
    if (!this.useTor && this.torAllowed && torHosts.has(hostOf(url))) this.useTor = true
    let res = await this.#raw({ url, tor: this.useTor, ...opts })
    if (!res.ok) return res
    if (this.torAllowed && !this.useTor && BLOCKED_RE.test(res.body || '')) {
      this.useTor = true
      torHosts.add(hostOf(url))
      res = await this.#raw({ url, tor: true, ...opts })
    }
    return res
  }

  /** POST JSON (tanpa follow redirect — 302 di sini justru informatif). */
  async postJson(url, body, { referer, origin } = {}) {
    return this.#raw({
      url,
      method: 'POST',
      body: JSON.stringify(body ?? {}),
      headers: { Referer: referer, Origin: origin },
      tor: this.useTor,
    })
  }

  async cookie(name) {
    try {
      const txt = await fs.readFile(this.jar, 'utf8')
      const hits = txt
        .split('\n')
        .filter((l) => l && !l.startsWith('#') || l.startsWith('#HttpOnly_'))
        .map((l) => l.split('\t'))
        .filter((p) => p.length >= 7 && p[5] === name)
      return hits.length ? hits[hits.length - 1][6] : ''
    } catch {
      return ''
    }
  }

  async cleanup() {
    await Promise.allSettled([fs.unlink(this.jar), fs.unlink(this.bodyFile)])
  }
}

// ── pengenalan pola halaman ──────────────────────────────────
/** Form yang mengirim dirinya sendiri (pintu masuk safelinku dsb).
 *  Halaman pintunya selalu mungil dan formnya cuma berisi input hidden —
 *  kalau ada kolom yang harus diketik user, itu form biasa, bukan pintu gerbang. */
export function extractAutoForm(html = '', base = '') {
  if (!html || html.length > 20000) return ''
  if (!/\.submit\s*\(/i.test(html)) return ''
  const m = html.match(/<form[^>]*action\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i)
  if (!m) return ''
  const isi = m[2]
  if (/<input[^>]*type\s*=\s*["']?(?!hidden)[a-z]+/i.test(isi)) return ''
  if (/<(textarea|select)\b/i.test(isi)) return ''
  const inputs = [...isi.matchAll(/<input[^>]*name\s*=\s*["']([^"']+)["'][^>]*value\s*=\s*["']([^"']*)["']/gi)]
  if (!inputs.length) return ''
  const q = inputs.map(([, k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const target = absolutize(m[1], base)
  if (!target) return ''
  return target + (target.includes('?') ? '&' : '?') + q
}

/** Halaman gerbang iklan safelinku: aset React /c/assets/*.js + wadah gerbangnya.
 *  Catatan: tombol .slbtn baru ada setelah React jalan, jadi jangan dicek dari HTML mentah. */
export function isGatePage(html = '') {
  const hasAssets = /\/c\/assets\/[\w.-]+\.js/i.test(html)
  const hasGate = /slwrap|slbtn|id\s*=\s*["']verify["']/i.test(html)
  return hasAssets && hasGate
}

export function gateHostOf(html = '', pageUrl = '') {
  const m =
    html.match(/<script[^>]*src\s*=\s*["'](https?:\/\/[^"']+)\/c\/assets\//i) ||
    html.match(/<script[^>]*src\s*=\s*["'](\/?[^"']*)\/c\/assets\//i)
  if (m) {
    if (/^https?:/i.test(m[1])) return m[1].replace(/\/$/, '')
    try {
      return new URL(pageUrl).origin
    } catch {
      return ''
    }
  }
  try {
    return new URL(pageUrl).origin
  } catch {
    return ''
  }
}

/** Redirect lewat JavaScript atau <meta refresh>. */
export function extractRedirect(html = '', base = '') {
  const patterns = [
    /(?:window\.)?location\.(?:href|assign)\s*=\s*["']([^"']+)["']/i,
    /(?:window\.)?location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
    /(?:window\.)?location\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (!m) continue
    const abs = absolutize(m[1], base)
    if (abs && abs !== base) return abs
  }
  return ''
}

/**
 * Jalankan satu ronde gerbang iklan. Mengembalikan URL berikutnya, atau ''.
 * Ronde 1 (step 1) -> /api/verify -> lanjut ke artikel berikutnya.
 * Ronde 2 (step 2) -> /api/go     -> halaman "ready" yang masih memuat tujuan asli.
 */
async function walkGate(f, articleUrl, html, log = () => {}) {
  const host = gateHostOf(html, articleUrl)
  if (!host) return ''

  // Token yang diminta gerbang: nilai cookie XSRF + "#" + base64 sidik jari.
  const xsrf = await f.cookie('XSRF-TOKEN')
  const fp = crypto.randomBytes(4).toString('hex') // 8 heksadesimal
  const token = `${xsrf}#${Buffer.from(fp).toString('base64')}`

  const sess = await f.postJson(`${host}/api/session`, { _token: token }, { referer: articleUrl, origin: host })
  let step = null
  try {
    step = JSON.parse(sess.body).step
  } catch {
    /* bukan JSON */
  }
  log(`gerbang ${host} step=${step}`)
  if (step == null) return ''

  if (step === 1) {
    const v = await f.postJson(`${host}/api/verify`, { _a: 0 }, { referer: articleUrl, origin: host })
    let target = ''
    try {
      target = JSON.parse(v.body).target || ''
    } catch {
      /* bukan JSON */
    }
    return target ? absolutize(target, articleUrl) : ''
  }

  // step 2: minta tautan lanjutannya
  const w = randInt(1280, 1440)
  const h = randInt(768, 900)
  const g = await f.postJson(
    `${host}/api/go`,
    { key: randInt(1, 999), size: `${w * 2}.${h * 2}`, ado: null },
    { referer: articleUrl, origin: host },
  )
  let next = ''
  try {
    next = JSON.parse(g.body).url || ''
  } catch {
    /* bukan JSON */
  }
  return next ? absolutize(next, articleUrl) : ''
}

// ── analisa tujuan ───────────────────────────────────────────
const FILE_TYPES = {
  apk: 'APK — aplikasi Android',
  xapk: 'XAPK — paket aplikasi Android',
  exe: 'EXE — program Windows',
  msi: 'MSI — installer Windows',
  dmg: 'DMG — aplikasi macOS',
  ipa: 'IPA — aplikasi iOS',
  zip: 'ZIP — arsip',
  rar: 'RAR — arsip',
  '7z': '7Z — arsip',
  pdf: 'PDF — dokumen',
  mp4: 'MP4 — video',
  mkv: 'MKV — video',
  mp3: 'MP3 — audio',
}

const FILE_HOSTS = [
  'safefileku.com', 'mediafire.com', 'mega.nz', 'drive.google.com', 'dropbox.com',
  'pixeldrain.com', 'workupload.com', 'zippyshare.com', 'uploadhaven.com', 'ouo.io',
]

const AD_GATE_HOSTS = [
  'sfl.gl', 'safelinku.com', 'sflink.', 'adf.ly', 'ouo.io', 'shrinkme.', 'shrink.pe',
  'shorte.st', 'linkvertise.', 'exe.io', 'fc.lc', 'za.gl', 'cuty.io',
]

export function analyze(finalUrl, { gates = 0, chain = [] } = {}) {
  const out = { host: '', file: null, warnings: [], note: '' }
  let u
  try {
    u = new URL(finalUrl)
  } catch {
    return out
  }
  out.host = u.hostname

  const seg = decodeURIComponent(u.pathname).split('/').filter(Boolean).pop() || ''
  const ext = (seg.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase()
  if (FILE_TYPES[ext]) out.file = { ext, label: FILE_TYPES[ext] }
  else if (FILE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) {
    out.file = { ext: '', label: 'halaman unduhan berkas' }
  }

  if (gates > 0) {
    out.warnings.push(
      `Lewat ${gates} gerbang iklan. Tombol Open / Next / Scroll Down di halaman itu semuanya iklan — tidak ada satu pun yang menuju berkasnya.`,
    )
  }
  if (out.file?.ext === 'apk' || out.file?.ext === 'xapk' || out.file?.ext === 'ipa') {
    out.warnings.push(`${out.file.label}: dipasang di luar toko resmi, jadi tidak ada yang memeriksa isinya.`)
  } else if (['exe', 'msi', 'dmg'].includes(out.file?.ext)) {
    out.warnings.push(`${out.file.label}: program yang dijalankan langsung di komputer.`)
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) {
    out.warnings.push('Tujuannya alamat IP mentah, bukan nama domain.')
  }
  if (u.hostname.startsWith('xn--') || u.hostname.includes('.xn--')) {
    out.warnings.push('Nama domainnya disamarkan (punycode) — sering dipakai buat meniru situs lain.')
  }
  if (u.protocol !== 'https:') out.warnings.push('Tujuannya bukan HTTPS, jadi lalu lintasnya tidak terenkripsi.')

  const uniq = []
  for (const c of chain) {
    try {
      const h = new URL(c.url).hostname.replace(/^www\./, '')
      if (uniq[uniq.length - 1] !== h) uniq.push(h)
    } catch {
      /* lewati */
    }
  }
  out.route = uniq
  return out
}

export function isAdGateHost(url = '') {
  try {
    const h = new URL(url).hostname
    return AD_GATE_HOSTS.some((d) => h === d || h.endsWith('.' + d) || h.includes(d))
  } catch {
    return false
  }
}

// ── masukannya ───────────────────────────────────────────────
let aktif = 0

/**
 * Selesaikan sebuah link sampai tujuan akhirnya.
 * @returns {Promise<{input:string, finalUrl:string, hops:number, gates:number,
 *                    viaTor:boolean, route:string[], file:object|null,
 *                    warnings:string[], ms:number, html:string}>}
 */
export async function resolveLink(input, { log = () => {} } = {}) {
  const url0 = normalizeUrl(input)
  if (!url0) throw new Error('Itu bukan link yang bisa kubaca.')

  if (aktif >= MAX_PARALEL) throw new Error('Masih ada link lain yang sedang kucek. Coba lagi sebentar.')
  aktif++
  const t0 = Date.now()
  const f = new Fetcher()
  const chain = []
  let gates = 0
  let url = url0
  let finalUrl = url0
  let html = ''
  const extra = []
  const seen = new Set()

  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (seen.has(url)) break
      seen.add(url)
      const res = await f.get(url)
      chain.push({ url: res.url, status: res.status, viaTor: res.viaTor })
      finalUrl = res.url || url
      html = res.body || ''

      if (!res.ok) throw new Error(`Tidak bisa membuka ${new URL(url).hostname} (${res.error}).`)
      if (res.status >= 400) {
        // 403/404 dari situs unduhan itu biasa (mereka memang menolak bot).
        // Yang perlu dilaporkan cuma kalau servernya sendiri yang bermasalah.
        if (res.status >= 500) extra.push(`Server tujuannya membalas ${res.status}.`)
        break
      }

      const form = extractAutoForm(html, res.url)
      if (form) {
        log(`form → ${form}`)
        url = form
        continue
      }

      if (isGatePage(html)) {
        gates++
        const next = await walkGate(f, res.url, html, log)
        if (!next) {
          extra.push('Gerbang iklannya minta captcha / klik manual, jadi tujuan aslinya tidak bisa kubuka dari sini.')
          break
        }
        log(`gerbang → ${next}`)
        url = next
        continue
      }

      const jump = extractRedirect(html, res.url)
      if (jump) {
        log(`redirect → ${jump}`)
        url = jump
        continue
      }
      break
    }
  } finally {
    await f.cleanup()
    aktif--
  }

  const info = analyze(finalUrl, { gates, chain })
  info.warnings.push(...extra)
  return {
    input: url0,
    finalUrl,
    hops: chain.length,
    gates,
    viaTor: chain.some((c) => c.viaTor),
    route: info.route || [],
    file: info.file,
    warnings: info.warnings,
    ms: Date.now() - t0,
    html,
  }
}

export const linkcheckService = { resolveLink, normalizeUrl, analyze, isAdGateHost }
export default linkcheckService
