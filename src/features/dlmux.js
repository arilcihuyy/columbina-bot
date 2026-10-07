// Helper bersama untuk downloader hasil port scrapr (lihat src/vendor/scrapr).
// Tugas: pilih URL media terbaik dari hasil scraper, unduh jadi Buffer, dan
// tebak jenis file dari magic bytes — supaya command tidak perlu tahu detail scraper.
import axios from 'axios'
import { createRequire } from 'node:module'

// Modul scraper yang dikopi masih CommonJS — di-require lewat createRequire.
const require = createRequire(import.meta.url)

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
export const MAX_BYTES = 64 * 1024 * 1024

// Tebak jenis media dari 12 byte pertama.
export function sniffKind(buf) {
  if (!buf || buf.length < 12) return 'unknown'
  const hex = buf.subarray(0, 12).toString('hex')
  const ascii = buf.subarray(0, 12).toString('latin1')
  if (ascii.includes('ftyp')) return 'm4a' // mp4 atau m4a — dibedakan dari mimetype kalau ada
  if (hex.startsWith('ffd8ff')) return 'jpg'
  if (hex.startsWith('89504e47')) return 'png'
  if (ascii.startsWith('RIFF')) return 'webp'
  if (hex.startsWith('fffb') || hex.startsWith('fff3') || ascii.startsWith('ID3')) return 'mp3'
  if (ascii.includes('OggS')) return 'ogg'
  return 'unknown'
}

export function kindToWa(kind) {
  if (kind === 'mp4') return { kind: 'video', mimetype: 'video/mp4' }
  if (kind === 'mp3' || kind === 'm4a' || kind === 'ogg') return { kind: 'audio', mimetype: kind === 'mp3' ? 'audio/mpeg' : 'audio/mp4' }
  if (kind === 'jpg') return { kind: 'image', mimetype: 'image/jpeg' }
  if (kind === 'png') return { kind: 'image', mimetype: 'image/png' }
  if (kind === 'webp') return { kind: 'image', mimetype: 'image/webp' }
  return { kind: 'document', mimetype: 'application/octet-stream' }
}

// Unduh media jadi Buffer. Referer penting: banyak CDN (Bilibili, Douyin, Klickaud) menolak tanpa itu.
export async function fetchBuffer(url, { referer, timeout = 150_000, maxBytes = MAX_BYTES } = {}) {
  try {
    const { data, headers } = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      headers: { 'User-Agent': UA, Accept: '*/*', ...(referer ? { Referer: referer } : {}) },
    })
    const buf = Buffer.from(data)
    const contentType = String(headers?.['content-type'] || '')
    // Magic bytes dulu; kalau tidak dikenali, percaya content-type dari server.
    let raw = sniffKind(buf)
    if (raw === 'm4a' && /video\//i.test(contentType)) raw = 'mp4'
    if (raw === 'unknown') {
      if (/^video\//i.test(contentType)) raw = 'mp4'
      else if (/^image\/jpe?g/i.test(contentType)) raw = 'jpg'
      else if (/^image\/png/i.test(contentType)) raw = 'png'
      else if (/^image\/webp/i.test(contentType)) raw = 'webp'
      else if (/^audio\//i.test(contentType)) raw = 'mp3'
    }
    const wa = kindToWa(raw)
    return { buf, contentType, rawKind: raw, ...wa }
  } catch (err) {
    const code = err.response?.status
    const tooBig = ['ERR_FR_MAX_BODY_LENGTH_EXCEEDED', 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED'].includes(err.code) || /maxContentLength|body length/i.test(String(err.message))
    if (tooBig) {
      throw new Error(`Ukuran media > ${Math.round(maxBytes / 1024 / 1024)}MB (limit WhatsApp).`)
    }
    throw new Error(`Gagal unduh media (${code || err.code || 'timeout'}).`)
  }
}

// Nama penulis bisa berupa string atau objek ({name, username, nickname, ...}).
export function authorName(author) {
  if (!author) return ''
  if (typeof author === 'string') return author
  const nama = author.name || author.nickname || author.username || author.tag || ''
  const uname = author.username && author.username !== nama ? ` (@${author.username})` : ''
  return `${nama}${uname}`.trim()
}

// Pilih download terbaik: utamakan jenis yang diminta, lalu kualitas tertinggi (kata "hd"/"original" menang).
export function pickDownload(downloads = [], prefer = []) {
  const rank = (d) => {
    const t = String(d.type || '').toLowerCase()
    const q = String(d.quality || '').toLowerCase()
    let s = 0
    const idx = prefer.findIndex((p) => t.includes(p))
    if (idx >= 0) s += 100 - idx * 10
    if (q.includes('hd') || q.includes('original') || q.includes('1080') || q.includes('320')) s += 5
    if (q.includes('sd') || q.includes('watermark') || q.includes('128')) s -= 3
    if (/cover|thumb|photo/.test(t) && !prefer.includes('cover')) s -= 20
    return s
  }
  return [...downloads].sort((a, b) => rank(b) - rank(a))[0] || null
}

// Jalankan beberapa scraper berurutan sampai ada yang berhasil (fallback chain).
export function loadScraper(file) {
  return require(`../vendor/scrapr/${file}.cjs`).scrape
}

// Service seragam: resolve(url) -> { title, type, url, thumbnail, author, items[] }
export class ScraprService {
  constructor({ label, chain, referer, prefer = ['video', 'image', 'audio'] }) {
    this.label = label
    this.chain = chain.map(([name, file, opts = {}]) => ({ name, scrape: loadScraper(file), referer: opts.referer || referer }))
    this.referer = referer
    this.prefer = prefer
    this.lastErrors = []
  }

  async resolve(url) {
    this.lastErrors = []
    for (const step of this.chain) {
      try {
        const res = await step.scrape(url)
        if (!res?.status || !res.result) {
          this.lastErrors.push(`${step.name}: ${String(res?.message || 'gagal').slice(0, 80)}`)
          continue
        }
        const out = this._normalize(res.result, step)
        if (out) return out
        this.lastErrors.push(`${step.name}: tidak ada link media`)
      } catch (err) {
        this.lastErrors.push(`${step.name}: ${String(err.message).slice(0, 80)}`)
      }
    }
    const detail = this.lastErrors.length ? ` (${this.lastErrors.join('; ')})` : ''
    throw new Error(`${this.label} gagal diambil${detail}.`)
  }

  _normalize(result, step) {
    const dls = (result.downloads || result.tracks || result.items || []).filter((d) => d?.url)
    const main = pickDownload(dls, this.prefer)
    if (!main?.url) return null

    const tipe = (d) => {
      const t = String(d.type || '').toLowerCase()
      if (/audio|mp3|m4a|sound/.test(t)) return 'audio'
      if (/video|mp4/.test(t)) return 'video'
      if (/image|photo|jpg|png|cover/.test(t)) return 'image'
      return d === main ? 'video' : ''
    }
    const mainType = tipe(main)
    // Unduhan sejenis bisa berarti dua hal:
    //  - varian kualitas dari SATU media (mis. "HD No Watermark" + "Standard") -> kirim salah satu
    //  - isi berbeda dalam satu post (mis. "Photo 1" + "Photo 2") -> kirim semuanya
    const sameKind = dls.filter((d) => tipe(d) === mainType)
    const labelOf = (d) => `${d.quality ?? ''} ${d.type ?? ''}`
    const isiBerbeda = sameKind.length > 1 && sameKind.every((d) => /(photo|image|picture|slide|gambar)\s*\d+/i.test(labelOf(d)))
    const daftar = isiBerbeda ? [main, ...sameKind.filter((d) => d.url !== main.url)] : [main]
    const alternatif = isiBerbeda ? [] : sameKind.filter((d) => d.url !== main.url)

    return {
      title: result.title || `${this.label} media`,
      // 'cover' bukan media utama — kalau cuma ada cover, jangan dianggap isi.
      kind: mainType,
      type: mainType,
      url: main.url,
      thumbnail: typeof result.thumbnail === 'string' ? result.thumbnail : null,
      author: authorName(result.author) || null,
      method: step.name,
      items: daftar.map((d) => ({ url: d.url, type: tipe(d) })),
      // Kandidat lain untuk media yang sama (mis. tautan HD kena 403, pakai yang Normal).
      alternatif: (alternatif.length && daftar[0]?.url === main.url ? alternatif : []).map((d) => ({ url: d.url, type: tipe(d) })),
      referer: step.referer,
      raw: result,
    }
  }

  async toBuffer(url, referer) {
    return fetchBuffer(url, { referer: referer || this.referer })
  }
}