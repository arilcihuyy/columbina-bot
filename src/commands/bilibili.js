// `!bilibili` — unduh video Bilibili.
import { makeDownloadCommand } from './downloader-base.js'
import { bilibiliService } from '../features/bilibili.js'

export default makeDownloadCommand({
  name: 'bilibili',
  aliases: ['bili', 'bldl'],
  label: 'Bilibili',
  description: 'Unduh video Bilibili',
  usage: 'Contoh: `!bilibili https://www.bilibili.com/video/BV1Vkag6TExf`',
  urlPattern: /bilibili\.com|b23\.tv/i,
  service: bilibiliService,
})