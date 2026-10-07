// `!spotify` — ambil lagu dari link Spotify.
//
// Catatan: Spotify tidak memberi file audio ke publik (DRM). Bot mengambil metadata
// resmi dari Spotify, lalu mencari padanan lagunya di SoundCloud dan mengunduh MP3 utuh.
// Kalau tidak ketemu, yang dikirim adalah cuplikan resmi iTunes 30 detik.
import { makeDownloadCommand } from './downloader-base.js'
import { spotifyService } from '../features/spotify.js'

export default makeDownloadCommand({
  name: 'spotify',
  aliases: ['sp', 'spot'],
  label: 'Spotify',
  description: 'Ambil lagu dari link Spotify',
  usage: 'Contoh: `!spotify https://open.spotify.com/track/2FZIabCRMEWAYfN69Ijn1U`',
  urlPattern: /open\.spotify\.com|spotify\.link/i,
  kind: 'music',
  service: spotifyService,
})