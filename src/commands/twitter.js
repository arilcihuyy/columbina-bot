// `!twitter` — unduh video/gambar dari Twitter/X.
import { makeDownloadCommand } from './downloader-base.js'
import { twitterService } from '../features/twitter.js'

export default makeDownloadCommand({
  name: 'twitter',
  aliases: ['tw', 'x', 'twdl', 'xdl'],
  label: 'Twitter/X',
  description: 'Unduh video/gambar Twitter/X',
  usage: 'Contoh: `!twitter https://x.com/user/status/12345`',
  urlPattern: /(?:twitter|x)\.com|t\.co/i,
  service: twitterService,
})