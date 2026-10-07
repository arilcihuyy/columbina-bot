// Tes live platform: node scripts/test-social.js <youtube|instagram|facebook> <url> [audio]
import fs from 'fs'
import { youtubeService } from '../src/features/youtube.js'
import { instagramService } from '../src/features/instagram.js'
import { facebookService } from '../src/features/facebook.js'

const [platform, url, mode] = process.argv.slice(2)
if (!platform || !url) {
  console.log('Usage: node scripts/test-social.js <youtube|instagram|facebook> <url> [audio]')
  process.exit(1)
}

try {
  if (platform === 'youtube') {
    const audioOnly = mode === 'audio'
    console.log('probe...')
    const info = await youtubeService.probe(url)
    console.log('PROBE OK:', JSON.stringify(info))
    console.log(`download ${audioOnly ? 'audio' : 'video'}...`)
    const r = await youtubeService.download(url, { audioOnly })
    console.log(`DOWNLOAD OK: ${r.buffer.length} bytes (${r.ext}), title="${r.title}"`)
  } else if (platform === 'instagram') {
    const res = await instagramService.resolve(url)
    console.log('RESOLVE OK:', JSON.stringify({ type: res.type, items: res.items?.length, url: (res.url || res.items?.[0]?.url || '').slice(0, 90) }, null, 2))
    const first = res.items?.[0]?.url || res.url
    if (first) {
      const buf = await instagramService.toBuffer(first)
      console.log(`DOWNLOAD OK: ${buf.length} bytes`)
    }
  } else if (platform === 'facebook') {
    const res = await facebookService.resolve(url)
    console.log('RESOLVE OK:', JSON.stringify({ type: res.type, hasHd: res.hasHd, url: res.url?.slice(0, 90), title: res.title }, null, 2))
    const buf = await facebookService.toBuffer(res.url)
    console.log(`DOWNLOAD OK: ${buf.length} bytes`)
  }
} catch (err) {
  console.log('FAIL:', err.message)
  process.exit(1)
}
