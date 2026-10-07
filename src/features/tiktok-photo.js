// Sesi pilih-foto untuk post TikTok tipe slideshow (gambar).
//
// Kenapa ada sesi? Karena `!tiktok <url>` pada post foto TIDAK langsung mengunduh
// semua gambar (bisa belasan → chat kebanjiran). Bot mengirim daftar nomor dulu,
// lalu user memilih: `!tiktok 2`, `!tiktok 1 3`, `!tiktok 2-4`, atau `!tiktok semua`.
//
// Semua logika di file ini murni (tanpa jaringan/WhatsApp) supaya bisa diuji:
//   node scripts/test-tiktok-photo.js

const PENDING_TTL_MS = () => Number(process.env.TIKTOK_PENDING_TTL_MS || 10 * 60 * 1000)

// maksimal gambar yang dikirim per satu perintah (sisanya bisa diminta lagi)
export const MAX_PER_REQUEST = Number(process.env.TIKTOK_PHOTO_MAX || 10)

const ALL_WORDS = new Set(['semua', 'semuanya', 'all', '*', 'full', 'smuanya'])
const CANCEL_WORDS = new Set(['batal', 'cancel', 'gajadi', 'ga jadi', 'x', 'no', 'n'])

/** Buang koma/plus/titik-koma/tanda hubung-beda → spasi, biar gampang di-parse. */
function normalize(input = '') {
  return String(input)
    .toLowerCase()
    .replace(/[,;+&]/g, ' ')
    .replace(/[–—~]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Baca pilihan user.
 * @returns {{mode:'indexes'|'all'|'cancel'|'invalid'|'empty', indexes:number[], reason?:string, invalid?:string[]}}
 *   indexes selalu 1-based, sudah diurutkan & bebas duplikat.
 */
export function parseSelection(input, total = 0) {
  const text = normalize(input)
  if (!text) return { mode: 'empty', indexes: [], reason: 'kosong' }

  const tokens = text.split(' ').filter(Boolean)

  if (tokens.some((t) => CANCEL_WORDS.has(t))) return { mode: 'cancel', indexes: [] }
  if (tokens.some((t) => ALL_WORDS.has(t))) {
    return { mode: 'all', indexes: Array.from({ length: total }, (_, i) => i + 1) }
  }

  const picked = new Set()
  const invalid = []
  for (const token of tokens) {
    const range = token.match(/^(\d+)-(\d+)$/)
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y)
      for (let n = a; n <= b; n++) {
        if (n >= 1 && n <= total) picked.add(n)
        else invalid.push(String(n))
      }
      continue
    }
    if (/^\d+$/.test(token)) {
      const n = Number(token)
      if (n >= 1 && n <= total) picked.add(n)
      else invalid.push(token)
      continue
    }
    invalid.push(token)
  }

  const indexes = [...picked].sort((a, b) => a - b)
  if (!indexes.length) {
    return { mode: 'invalid', indexes: [], invalid, reason: invalid.length ? `nomor di luar jangkauan: ${invalid.join(', ')}` : 'tidak ada nomor' }
  }
  return { mode: 'indexes', indexes, invalid }
}

/** True kalau argumen kelihatan seperti pilihan nomor (bukan URL/perintah lain). */
export function isSelectionLike(input = '') {
  const text = normalize(input)
  if (!text) return false
  const tokens = text.split(' ').filter(Boolean)
  return tokens.every((t) => /^\d+(-\d+)?$/.test(t) || ALL_WORDS.has(t) || CANCEL_WORDS.has(t))
}

// ── penyimpanan sesi (in-memory, per chat, kedaluwarsa otomatis) ──
const pending = new Map()

export function setPending(jid, data) {
  pending.set(jid, { ...data, at: Date.now() })
  return pending.get(jid)
}

export function getPending(jid) {
  const item = pending.get(jid)
  if (!item) return null
  if (Date.now() - item.at > PENDING_TTL_MS()) {
    pending.delete(jid)
    return null
  }
  return item
}

export function clearPending(jid) {
  return pending.delete(jid)
}

/** Catat nomor foto yang sudah terkirim (dipakai untuk tahu sesi sudah selesai). */
export function markSent(jid, numbers = []) {
  const item = pending.get(jid)
  if (!item) return null
  item.sent = item.sent ?? new Set()
  for (const n of numbers) item.sent.add(n)
  return item
}

/** True kalau semua foto (1..total) sudah pernah dikirim. */
export const isComplete = (item) => !!item && item.sent instanceof Set && item.sent.size >= item.total

export function clearAllPending() {
  pending.clear()
}

export const pendingCount = () => pending.size

/** Grid nomor, maks 10 per baris biar tidak melebar di HP. */
export function numberGrid(total, perRow = 10) {
  const rows = []
  for (let i = 1; i <= total; i += perRow) {
    rows.push(Array.from({ length: Math.min(perRow, total - i + 1) }, (_, k) => String(i + k)).join(' '))
  }
  return rows.join('\n')
}

const truncate = (s = '', n = 40) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s))

/**
 * Teks daftar pilihan. Sengaja pendek & rapi (maks ~34 kolom) supaya tidak
 * berantakan di layar HP.
 */
export function buildPhotoSelector({ total = 0, title = '', author = '', url = '', prefix = '!', maxPerRequest = MAX_PER_REQUEST } = {}) {
  const out = []
  out.push(`🖼️ Ada ${total} foto di post ini`)
  if (title) out.push(`🎵 ${truncate(title)}`)
  if (author) out.push(`👤 @${author}`)
  out.push('')
  out.push('Mau yang mana?')
  out.push(numberGrid(total))
  out.push('')
  out.push('Balas angkanya, contoh:')
  out.push(`› ${prefix}tiktok 3`)
  out.push(`› ${prefix}tiktok 1 3 5`)
  out.push(`› ${prefix}tiktok 2-4`)
  out.push(`› ${prefix}tiktok semua`)
  if (total > maxPerRequest) out.push(`(maks ${maxPerRequest} gambar sekali kirim)`)
  if (url) {
    out.push('')
    out.push('Lihat dulu semua:')
    out.push(`${prefix}prw ${url}`)
  }
  return out.join('\n')
}
