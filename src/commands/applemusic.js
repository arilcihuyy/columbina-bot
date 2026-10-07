// `!applemusic` — ambil lagu dari link Apple Music.
//
// Metadata + cuplikan resmi diambil dari iTunes API; versi utuhnya dicari padanannya
// di SoundCloud lalu diunduh jadi MP3 (port scrapr: klickaud).
import { makeDownloadCommand } from './downloader-base.js'
import { applemusicService } from '../features/applemusic.js'

export default makeDownloadCommand({
  name: 'applemusic',
  aliases: ['am', 'itunes'],
  label: 'Apple Music',
  description: 'Ambil lagu dari link Apple Music',
  usage: 'Contoh: `!applemusic https://music.apple.com/us/album/judul/1559523357?i=1559523359`',
  urlPattern: /music\.apple\.com|itunes\.apple\.com/i,
  kind: 'music',
  service: applemusicService,
})