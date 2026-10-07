// Downloader Twitter/X — port scrapr: fxtwitter (direct) lalu tweeload sebagai cadangan.
// Dukung foto (banyak gambar dalam satu tweet) dan video.
import { ScraprService } from './dlmux.js'

export const twitterService = new ScraprService({
  label: 'Twitter/X',
  referer: 'https://x.com/',
  prefer: ['video', 'image', 'photo'],
  chain: [
    ['direct', 'twitter-direct', { referer: 'https://x.com/' }],
    ['tweeload', 'twitter-tweeload', { referer: 'https://tweeload.com/' }],
  ],
})