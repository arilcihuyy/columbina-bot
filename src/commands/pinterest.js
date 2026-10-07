// `!pinterest` — unduh gambar/video Pinterest.
import { makeDownloadCommand } from './downloader-base.js'
import { pinterestService } from '../features/pinterest.js'

export default makeDownloadCommand({
  name: 'pinterest',
  aliases: ['pin', 'pindl'],
  label: 'Pinterest',
  description: 'Unduh gambar/video Pinterest',
  usage: 'Contoh: `!pinterest https://www.pinterest.com/pin/1234567890/`',
  urlPattern: /pinterest\.[a-z.]+|pin\.it/i,
  service: pinterestService,
})