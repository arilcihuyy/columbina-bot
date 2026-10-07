// Downloader Spotify. Catatan penting: Spotify tidak menyediakan file audio ke publik
// (DRM), dan semua "downloader Spotify" gratis akhirnya mengambil audio dari sumber lain.
// Jadi alurnya: metadata resmi dari Spotify (oEmbed + halaman embed) -> cari padanan trek
// di SoundCloud -> unduh MP3 utuh via klickaud (port scrapr). Kalau tidak ketemu,
// dipakai cuplikan resmi iTunes 30 detik sebagai jaring pengaman.
import axios from 'axios'
import { UA, fetchBuffer } from './dlmux.js'
import { itunesSearch, downloadSong, bigArtwork } from './musicsearch.js'

class SpotifyService {
  // Dukung link track. Album/playlist: ambil daftar treknya dari halaman embed lalu
  // unduh trek pertama? Tidak — lebih jujur minta link track.
  parse(url) {
    const m = String(url).match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)/)
    if (!m) return null
    return { kind: m[1], id: m[2] }
  }

  async resolve(url) {
    const p = this.parse(url)
    if (!p) throw new Error('Link Spotify tidak dikenali. Contoh: https://open.spotify.com/track/xxxx')
    if (p.kind !== 'track') {
      throw new Error(`Link ${p.kind} belum didukung — kirim link trek (open.spotify.com/track/...).`)
    }

    // 1. Judul + cover dari oEmbed resmi
    let title = 'Spotify Track'
    let cover = null
    try {
      const { data } = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { headers: { 'User-Agent': UA }, timeout: 20_000 })
      title = data?.title || title
      cover = data?.thumbnail_url || null
    } catch { /* lanjut, metadata bisa dilengkapi iTunes */ }

    // 2. Artis dari halaman embed
    let artist = ''
    try {
      const { data: html } = await axios.get(`https://open.spotify.com/embed/track/${p.id}`, { headers: { 'User-Agent': UA }, timeout: 20_000, responseType: 'text' })
      artist = String(html).match(/"artists":\[\{"name":"([^"]{1,80})"/)?.[1] || ''
      if (!cover) cover = String(html).match(/"coverArt":\{"sources":\[\{"url":"([^"]+)"/)?.[1] || cover
    } catch { /* opsional */ }

    // 3. Durasi + cuplikan resmi dari iTunes (dipakai untuk memilih padanan yang tepat)
    let durationMs = 0
    let previewUrl = null
    try {
      const hit = await itunesSearch([artist, title].filter(Boolean).join(' '))
      if (hit) {
        durationMs = hit.trackTimeMillis || 0
        previewUrl = hit.previewUrl || null
        if (!cover) cover = bigArtwork(hit.artworkUrl100)
        if (!artist && hit.artistName) artist = hit.artistName
      }
    } catch { /* opsional */ }

    return { title, artist, cover, durationMs, previewUrl, source: 'Spotify', id: p.id }
  }

  async download(meta) {
    return downloadSong(meta)
  }

  // Dipakai command untuk mengambil gambar cover.
  async toBuffer(url) {
    return fetchBuffer(url)
  }
}

export const spotifyService = new SpotifyService()