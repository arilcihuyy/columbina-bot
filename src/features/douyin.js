// Downloader Douyin — port scrapr (metode direct: resolve share link lalu ambil play API).
import { ScraprService } from './dlmux.js'

export const douyinService = new ScraprService({
  label: 'Douyin',
  referer: 'https://www.douyin.com/',
  prefer: ['video', 'audio'],
  chain: [['direct', 'douyin-direct', { referer: 'https://www.douyin.com/' }]],
})