// Downloader Pinterest — port scrapr (metode direct, ambil gambar resolusi asli).
import { ScraprService } from './dlmux.js'

export const pinterestService = new ScraprService({
  label: 'Pinterest',
  referer: 'https://www.pinterest.com/',
  prefer: ['video', 'image'],
  chain: [['direct', 'pinterest-direct', { referer: 'https://www.pinterest.com/' }]],
})