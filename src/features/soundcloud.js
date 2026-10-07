// Downloader SoundCloud — port scrapr (metode klickaud: hasil MP3 utuh, bukan potongan).
import { ScraprService } from './dlmux.js'

export const soundcloudService = new ScraprService({
  label: 'SoundCloud',
  referer: 'https://klickaud.org/',
  prefer: ['audio', 'mp3'],
  chain: [['klickaud', 'soundcloud-klickaud', { referer: 'https://klickaud.org/' }]],
})