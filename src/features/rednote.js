// Downloader RedNote / Xiaohongshu — port scrapr (metode direct).
import { ScraprService } from './dlmux.js'

export const rednoteService = new ScraprService({
  label: 'RedNote',
  referer: 'https://www.rednote.com/',
  prefer: ['video', 'image'],
  chain: [['direct', 'rednote-direct', { referer: 'https://www.rednote.com/' }]],
})