// reproduksi bug !toimg
import { imageToWebp, webpToPng, videoToWebp } from '../src/features/media.js'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const dir = '/home/ubuntu/wa-bot/tmp/repro-toimg'
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })

function tf(name, buf) { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p }

async function tryIt(label, input) {
  try {
    const png = await webpToPng(input)
    const hex = png.subarray(0, 8).toString('hex')
    console.log(`OK   ${label.padEnd(34)} bytes=${png.length} magic=${hex}`)
  } catch (e) {
    console.log(`FAIL ${label.padEnd(34)} ${e.message}`)
  }
}

// 1. static sticker dari jpg
const jpg = path.join(dir, 'in.jpg')
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=600x400:rate=1', '-frames:v', '1', jpg])
const staticWebp = await imageToWebp(fs.readFileSync(jpg))
tf('static.webp', staticWebp)
await tryIt('static sticker (dari bot)', staticWebp)

// 2. animated webp via libwebp_anim (seperti stiker animasi WA)
const animWebp = path.join(dir, 'anim.webp')
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=15', '-t', '1', '-vcodec', 'libwebp_anim', '-loop', '0', '-an', animWebp])
await tryIt('animated webp (libwebp_anim)', fs.readFileSync(animWebp))

// 3. raw ffmpeg langsung ke png dari webp statis
try {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-i', tf('static.webp', staticWebp), '-frames:v', '1', path.join(dir, 'direct.png')])
  console.log('OK   raw ffmpeg static->png')
} catch (e) { console.log('FAIL raw ffmpeg static->png:', e.message.split('\n').slice(-4).join(' | ')) }

// 4. raw ffmpeg langsung dari webp animasi
try {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-i', animWebp, '-frames:v', '1', path.join(dir, 'direct_anim.png')])
  console.log('OK   raw ffmpeg anim->png')
} catch (e) { console.log('FAIL raw ffmpeg anim->png:', e.message.split('\n').slice(-4).join(' | ')) }

// 5. video -> sticker animasi (pipeline bot), lalu toimg
const vid = path.join(dir, 'in.mp4')
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=15', '-t', '2', '-pix_fmt', 'yuv420p', vid])
const vidWebp = await videoToWebp(fs.readFileSync(vid))
await tryIt('video sticker (pipeline bot)', vidWebp)

// 6. webp statis tanpa metadata, hanya 1 frame lossless (VP8L)
const lossless = path.join(dir, 'lossless.webp')
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=1', '-frames:v', '1', '-vcodec', 'libwebp', '-lossless', '1', '-an', lossless])
await tryIt('webp lossless VP8L', fs.readFileSync(lossless))