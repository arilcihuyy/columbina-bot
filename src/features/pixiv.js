// Downloader Pixiv — port scrapr (metode ajax: pakai illust id, ambil gambar original).
import { ScraprService } from './dlmux.js'

export const pixivService = new ScraprService({
  label: 'Pixiv',
  referer: 'https://www.pixiv.net/',
  prefer: ['image', 'video'],
  chain: [['ajax', 'pixiv-ajax', { referer: 'https://www.pixiv.net/' }]],
})