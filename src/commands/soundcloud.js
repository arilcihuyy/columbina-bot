// `!soundcloud` — unduh trek SoundCloud jadi MP3.
import { makeDownloadCommand } from './downloader-base.js'
import { soundcloudService } from '../features/soundcloud.js'

export default makeDownloadCommand({
  name: 'soundcloud',
  aliases: ['sc', 'scdl'],
  label: 'SoundCloud',
  description: 'Unduh lagu SoundCloud (MP3)',
  usage: 'Contoh: `!soundcloud https://soundcloud.com/artist/judul-lagu`',
  urlPattern: /soundcloud\.com|snd\.sc/i,
  service: soundcloudService,
})