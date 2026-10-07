// Pencarian SoundCloud (metadata + URL trek) memakai client_id publik yang di-scrape
// dari bundle JS soundcloud.com, lalu di-cache. Dipakai fitur musik (Spotify/Apple Music)
// karena sumber resmi keduanya ber-DRM: kita cari padanan treknya di SoundCloud lalu
// unduh lewat klickaud (port scrapr).
import axios from 'axios'
import { UA, fetchBuffer } from './dlmux.js'
import { loadScraper } from './dlmux.js'

const klickaud = loadScraper('soundcloud-klickaud')

let cached = { id: null, at: 0 }
const CLIENT_ID_TTL = 60 * 60 * 1000

// Ambil client_id: baca halaman depan soundcloud.com, unduh beberapa bundle JS,
// cari pola client_id:"...". Cache 1 jam; kalau gagal, pakai yang terakhir diketahui.
async function getClientId() {
  if (cached.id && Date.now() - cached.at < CLIENT_ID_TTL) return cached.id
  try {
    const { data: html } = await axios.get('https://soundcloud.com/', { headers: { 'User-Agent': UA }, timeout: 20_000, responseType: 'text' })
    const bundles = [...String(html).matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[a-z0-9-]+\.js/g)].map((m) => m[0]).slice(0, 12)
    const results = await Promise.all(bundles.map((u) => axios.get(u, { headers: { 'User-Agent': UA }, timeout: 20_000, responseType: 'text', validateStatus: () => true }).then((r) => String(r.data)).catch(() => '')))
    for (const js of results) {
      const m = js.match(/client_id\s*[:=]\s*"([A-Za-z0-9]{20,40})"/)
      if (m) { cached = { id: m[1], at: Date.now() }; return m[1] }
    }
  } catch { /* pakai cache lama kalau ada */ }
  if (cached.id) return cached.id
  throw new Error('Tidak bisa dapat client_id SoundCloud.')
}

// Cari trek di SoundCloud. durationMs opsional untuk memilih hasil yang paling mirip.
export async function searchTrack(query, { durationMs = 0, limit = 5 } = {}) {
  const clientId = await getClientId()
  const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}`
  const { data } = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 25_000 })
  const list = (data?.collection || []).filter((t) => t?.permalink_url && t?.streamable !== false)
  if (!list.length) throw new Error(`Tidak ada hasil SoundCloud untuk "${query}".`)
  const scored = list
    .map((t) => ({ t, score: durationMs ? Math.abs((t.duration || 0) - durationMs) : 0 }))
    .sort((a, b) => a.score - b.score)
  return scored[0].t
}

// Ambil MP3 utuh dari sebuah URL trek SoundCloud (klickaud).
export async function fetchTrackMp3(trackUrl) {
  const res = await klickaud(trackUrl)
  if (!res?.status) throw new Error(String(res?.message || 'Klickaud gagal.'))
  const url = (res.result?.downloads || []).find((d) => d.url)?.url
  if (!url) throw new Error('Klickaud tidak memberi link MP3.')
  const { buf, contentType } = await fetchBuffer(url, { referer: 'https://klickaud.org/' })
  return { buf, contentType, title: res.result?.title || '' }
}

// --- iTunes/Apple Music API (gratis, tanpa key) — dipakai untuk metadata + cuplikan resmi ---
export async function itunesLookup(id) {
  const { data } = await axios.get(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`, { headers: { 'User-Agent': UA }, timeout: 20_000 })
  return data?.results?.[0] || null
}

export async function itunesSearch(term) {
  const { data } = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`, { headers: { 'User-Agent': UA }, timeout: 20_000 })
  return data?.results?.[0] || null
}

// Ubah artwork 100x100 -> resolusi besar.
export const bigArtwork = (u) => (u ? String(u).replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1000x1000bb.jpg') : null)

// Alur lagu: cari padanan di SoundCloud -> unduh MP3 utuh (klickaud, port scrapr).
// Kalau SoundCloud tidak ketemu, pakai cuplikan resmi iTunes (30 detik).
export async function downloadSong({ title, artist, durationMs = 0, previewUrl = null }) {
  const query = [artist, title].filter(Boolean).join(' - ')
  try {
    const track = await searchTrack(query || title, { durationMs })
    const { buf, contentType } = await fetchTrackMp3(track.permalink_url)
    return { buf, contentType, via: 'soundcloud', note: `SoundCloud: ${track.user?.username || '?'} — ${track.title}` }
  } catch (err) {
    if (previewUrl) {
      const { buf, contentType } = await fetchBuffer(previewUrl)
      return { buf, contentType, via: 'preview', note: `cuplikan resmi 30 detik (SoundCloud gagal: ${String(err.message).slice(0, 60)})` }
    }
    throw err
  }
}