// Downloader Bilibili — port scrapr (metode direct: playurl API resmi).
// Referer wajib: CDN Bilibili menolak unduhan tanpa referer bilibili.com.
import { ScraprService } from './dlmux.js'

export const bilibiliService = new ScraprService({
  label: 'Bilibili',
  referer: 'https://www.bilibili.com/',
  prefer: ['video', 'audio'],
  chain: [['direct', 'bilibili-direct', { referer: 'https://www.bilibili.com/' }]],
})