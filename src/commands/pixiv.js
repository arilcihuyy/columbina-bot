// `!pixiv` — unduh ilustrasi Pixiv (resolusi original).
import { makeDownloadCommand } from './downloader-base.js'
import { pixivService } from '../features/pixiv.js'

export default makeDownloadCommand({
  name: 'pixiv',
  aliases: ['px'],
  label: 'Pixiv',
  description: 'Unduh ilustrasi Pixiv',
  usage: 'Contoh: `!pixiv https://www.pixiv.net/en/artworks/150068059`',
  urlPattern: /pixiv\.net/i,
  service: pixivService,
})