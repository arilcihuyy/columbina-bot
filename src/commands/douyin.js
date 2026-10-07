// `!douyin` — unduh video Douyin (TikTok Tiongkok).
import { makeDownloadCommand } from './downloader-base.js'
import { douyinService } from '../features/douyin.js'

export default makeDownloadCommand({
  name: 'douyin',
  aliases: ['dy', 'dydl'],
  label: 'Douyin',
  description: 'Unduh video Douyin',
  usage: 'Contoh: `!douyin https://v.douyin.com/xxxxxxx/`',
  urlPattern: /douyin\.com|iesdouyin\.com/i,
  service: douyinService,
})