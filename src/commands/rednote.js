// `!rednote` — unduh video/gambar RedNote (Xiaohongshu).
import { makeDownloadCommand } from './downloader-base.js'
import { rednoteService } from '../features/rednote.js'

export default makeDownloadCommand({
  name: 'rednote',
  aliases: ['xhs', 'xiaohongshu', 'rndl'],
  label: 'RedNote/Xiaohongshu',
  description: 'Unduh video/gambar RedNote',
  usage: 'Contoh: `!rednote https://www.rednote.com/discovery/item/xxxx`',
  urlPattern: /xiaohongshu\.com|rednote\.com|xhslink\.com/i,
  service: rednoteService,
})