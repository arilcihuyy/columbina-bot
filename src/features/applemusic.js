// Downloader Apple Music. Sama seperti Spotify: file audionya ber-DRM, jadi metadata
// diambil resmi lewat iTunes Lookup API (plus cuplikan resmi 30 detik sebagai cadangan),
// sedangkan versi utuhnya dicari padanannya di SoundCloud lalu diunduh via klickaud
// (port scrapr).
import { itunesLookup, itunesSearch, downloadSong, bigArtwork } from './musicsearch.js'
import { fetchBuffer } from './dlmux.js'

class AppleMusicService {
  // Ambil id lagu: link track Apple Music memakai ?i=<id lagu>, kalau album pakai id album.
  parse(url) {
    const s = String(url)
    const song = s.match(/[?&]i=(\d{5,})/)
    const album = s.match(/music\.apple\.com\/[a-z]{2}\/(?:album|song)\/[^/]+\/(\d{5,})/)
    if (song) return { id: song[1], isSong: true }
    if (album) return { id: album[1], isSong: false }
    return null
  }

  async resolve(url) {
    const p = this.parse(url)
    if (!p) throw new Error('Link Apple Music tidak dikenali. Contoh: https://music.apple.com/us/album/judul/123456789?i=123456790')

    let hit = await itunesLookup(p.id)
    // Kalau yang dikirim id album, lookup mengembalikan album — ambil trek pertamanya.
    if (hit && hit.wrapperType !== 'track' && hit.collectionId) {
      const first = await itunesLookup(hit.collectionId)
      hit = first?.wrapperType === 'track' ? first : hit
    }
    if (hit && hit.wrapperType !== 'track') {
      // jaring pengaman: cari lagu lewat nama album
      const alt = await itunesSearch(`${hit.artistName || ''} ${hit.collectionName || hit.collectionName || ''}`.trim())
      if (alt) hit = alt
    }
    if (!hit?.trackName) throw new Error('Data lagu Apple Music tidak ditemukan di iTunes.')

    return {
      title: hit.trackName,
      artist: hit.artistName || '',
      cover: bigArtwork(hit.artworkUrl100 || hit.artworkUrl60),
      durationMs: hit.trackTimeMillis || 0,
      previewUrl: hit.previewUrl || null,
      source: 'Apple Music',
      id: String(hit.trackId || p.id),
    }
  }

  async download(meta) {
    return downloadSong(meta)
  }

  // Dipakai command untuk mengambil gambar cover.
  async toBuffer(url) {
    return fetchBuffer(url)
  }
}

export const applemusicService = new AppleMusicService()