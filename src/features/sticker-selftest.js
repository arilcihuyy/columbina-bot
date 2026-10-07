// Uji kirim stiker ke WhatsApp (sekali jalan) — untuk membuktikan stiker benar-benar
// diterima server WA, bukan cuma "file-nya kelihatan valid".
//
// Cara pakai (di VPS, sementara saja):
//   STICKER_SELFTEST=1
//   STICKER_SELFTEST_JID=<nomor tujuan, mis. 6281234567890@s.whatsapp.net>
// lalu restart bot. Bot akan mengirim 2 stiker uji (statis + animasi) ke JID itu
// dan mencatat hasil ack-nya. HAPUS flag-nya setelah selesai.
import { CONFIG } from '../config.js'
import { renderBratPng, renderBratAnimatedWebp } from './brat.js'
import { toStickerBuffer, finalizeSticker } from './media.js'
import { parseWebpInfo, describeWebp } from './webp-info.js'
import { waitAck, ACK_TIMEOUT_MS } from './viewonce.js'
import { workDir, cleanup } from './tmpdir.js'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

export async function runStickerSelftest(sock, jid) {
  const target = jid || sock.user?.lid || sock.user?.id
  const log = (m) => console.log(`[selftest] ${m}`)

  log(`mulai → ${target}`)

  const hasil = []
  const kirim = async (label, sticker) => {
    const info = parseWebpInfo(sticker)
    try {
      const msg = await sock.sendMessage(target, { sticker, mimetype: 'image/webp' })
      const ack = await waitAck(sock, msg.key.id, Math.max(ACK_TIMEOUT_MS(), 12_000), { requireDelivery: true })
      const status = ack ? `ok=${ack.ok} status=${ack.status} delivered=${!!ack.delivered}${ack.error ? ` error=${ack.error}` : ''}` : 'TIDAK ADA KABAR'
      hasil.push(`${label} (${describeWebp(sticker)}) → ${status}`)
      log(`${label} ${describeWebp(sticker)} → ${status}`)
      return ack
    } catch (err) {
      hasil.push(`${label} → GAGAL kirim: ${err.message}`)
      log(`${label} → GAGAL kirim: ${err.message}`)
      return null
    }
  }

  try {
    const { buffer: png } = await renderBratPng('bot uji 🌙')
    const statis = await toStickerBuffer(png, { packName: 'Columbina', packPublish: CONFIG.botName, emojis: ['✍️'] })
    log(`statis brat siap: ${describeWebp(statis)} (${parseWebpInfo(statis).isAnimated ? 'ANIMASI?!' : 'statis'})`)
    await kirim('statis-brat', statis)
  } catch (err) {
    hasil.push(`statis brat → RENDER GAGAL: ${err.message}`)
    log(`statis brat render gagal: ${err.message}`)
  }

  try {
    const { buffer } = await renderBratAnimatedWebp('brat')
    const animasi = await finalizeSticker(buffer, { packName: 'Columbina', packPublish: CONFIG.botName, emojis: ['✍️'] })
    log(`animasi brat siap: ${describeWebp(animasi)}`)
    await kirim('animasi-brat', animasi)
  } catch (err) {
    hasil.push(`animasi brat → RENDER GAGAL: ${err.message}`)
    log(`animasi brat render gagal: ${err.message}`)
  }

  // FOTO → stiker: jalur yang dulu mati ENOENT (imageToWebp: tulis file → ffmpeg).
  // Wajib ada di selftest supaya "bot hidup tapi !sticker mati" ketahuan langsung.
  try {
    const dir = workDir('selftest-')
    let jpg
    try {
      const sample = path.join(dir, 'sample.jpg')
      execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=1', '-frames:v', '1', sample,
      ], { stdio: 'pipe' })
      jpg = fs.readFileSync(sample)
    } finally {
      cleanup(dir)
    }
    const dariFoto = await toStickerBuffer(jpg, { packName: 'Columbina', packPublish: CONFIG.botName, emojis: ['📷'] })
    log(`foto→stiker siap: ${describeWebp(dariFoto)}`)
    await kirim('foto-jpg', dariFoto)
  } catch (err) {
    hasil.push(`foto→stiker → GAGAL: ${err.message}`)
    log(`foto→stiker gagal: ${err.message}`)
  }

  log('=== RINGKASAN ===')
  for (const h of hasil) log(h)
  log('=== SELESAI ===')
  return hasil
}
