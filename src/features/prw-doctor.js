// Diagnosa pengiriman PESAN SEKALI LIHAT (view once) — untuk mencari tahu kenapa
// `!prw` tidak dapat ACK, dengan bukti stanza nyata (bukan tebakan).
//
// Cara pakai:
//   - command:  !prwdoctor            (uji di chat tempat command diketik)
//   - otomatis: set PRW_DOCTOR=1 di .env, target dari PRW_DOCTOR_JID (opsional)
//
// Yang dicatat ke /tmp/prw-doctor.log:
//   1. stanza <message> yang benar-benar keluar (hook sock.sendNode)
//   2. node <ack class=message> & <receipt> yang masuk
//   3. per varian: server terima? sampai ke HP penerima (delivery receipt)?
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { generateWAMessageContent, generateWAMessageFromContent, jidNormalizedUser } from '@whiskeysockets/baileys'
import { sendViewOnce, waitAck, ACK_TIMEOUT_MS } from './viewonce.js'

const execFileP = promisify(execFile)
const LOG = '/tmp/prw-doctor.log'

const strip = (k, v) => {
  if (Buffer.isBuffer(v)) return `<buf ${v.length}>`
  if (v && v.type === 'Buffer' && Array.isArray(v.data)) return `<buf ${v.data.length}>`
  return v
}

function out(line) {
  const stamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
  console.log(`[prw-doctor] ${line}`)
  try { fs.appendFileSync(LOG, `[${stamp}] ${line}\n`) } catch {}
}

function summarize(node) {
  if (!node || typeof node !== 'object') return node
  const s = { tag: node.tag, attrs: node.attrs }
  if (Array.isArray(node.content)) s.children = node.content.map(summarize)
  return s
}

/** Ringkas hasil ack jadi satu kata yang jelas. */
function describe(ack) {
  if (!ack) return 'TIDAK ADA KABAR'
  if (!ack.ok) return `DITOLAK server (error ${ack.error})`
  return ack.delivered ? `SAMPAI ke HP (status ${ack.status})` : `DITERIMA server, belum ada receipt (status ${ack.status})`
}

export async function makeTestVideo(path = '/tmp/prw-test.mp4') {
  await execFileP('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=15:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-an', path,
  ], { timeout: 30_000 })
  return fs.readFileSync(path)
}

export async function runPrwDoctor(sock, targetJid) {
  const jid = targetJid || process.env.PRW_DOCTOR_JID || sock.user?.lid || sock.user?.id
  out(`=== MULAI diagnosa view-once → ${jid} (me: ${sock.user?.id} lid: ${sock.user?.lid || '-'}) ===`)

  // ── hook 1: stanza <message> yang kita kirim ──
  const originalSendNode = sock.sendNode
  sock.sendNode = (node) => {
    try {
      if (node?.tag === 'message') out(`KELUAR <message> ${JSON.stringify(summarize(node), strip)}`)
    } catch {}
    return originalSendNode.call(sock, node)
  }

  // ── hook 2: ack & receipt yang masuk ──
  const onAck = (node) => out(`MASUK <ack class=message> ${JSON.stringify(summarize(node), strip)}`)
  const onReceipt = (node) => out(`MASUK <receipt> ${JSON.stringify(summarize(node), strip)}`)
  try {
    sock.ws?.on('CB:ack,class:message', onAck)
    sock.ws?.on('CB:receipt', onReceipt)
  } catch (err) {
    out(`hook ws gagal: ${err?.message}`)
  }

  const buf = await makeTestVideo()
  out(`video uji: ${buf.length} byte, h264`)

  // varian mana yang diuji (PRW_DOCTOR_ONLY=C,G) — hemat waktu saat iterasi
  const only = (process.env.PRW_DOCTOR_ONLY || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const want = (label) => !only.length || only.includes(label[0])

  const results = []
  const run = async (label, fn) => {
    if (!want(label)) return
    let res
    try {
      res = await fn()
    } catch (err) {
      res = `THROW ${err?.message}`
    }
    results.push(`${label}: ${res}`)
    out(`HASIL ${label}: ${res}`)
  }

  const waitLong = Math.max(ACK_TIMEOUT_MS(), 20_000)

  // A. kontrol — teks biasa (pasti jalan, dipakai sebagai pembanding)
  await run('A-teks', async () => {
    const m = await sock.sendMessage(jid, { text: 'PRWDOCTOR A (teks)' })
    return describe(await waitAck(sock, m.key.id, waitLong, { requireDelivery: true }))
  })

  // B. kontrol — video biasa (jalur yang sudah terbukti jalan di !tiktok)
  await run('B-video-biasa', async () => {
    const m = await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', seconds: 3, width: 320, height: 320 })
    return describe(await waitAck(sock, m.key.id, waitLong, { requireDelivery: true }))
  })

  // C. view once — implementasi sekarang (viewOnceMessageV2)
  await run('C-viewonce-v2', async () => {
    const m = await sendViewOnce(sock, jid, 'video', buf, { mimetype: 'video/mp4', seconds: 3, width: 320, height: 320 })
    return describe(await waitAck(sock, m.key.id, waitLong, { requireDelivery: true }))
  })

  // D. view once — messageContextInfo DI LUAR wrapper (seperti app WhatsApp asli)
  await run('D-viewonce-ctx-luar', async () => {
    const content = await generateWAMessageContent(
      { video: buf, mimetype: 'video/mp4', seconds: 3, width: 320, height: 320 },
      { upload: sock.waUploadToServer, logger: sock.logger, jid },
    )
    const ctx = content.messageContextInfo
    delete content.messageContextInfo
    content.videoMessage.viewOnce = true
    const message = { viewOnceMessageV2: { message: content }, ...(ctx ? { messageContextInfo: ctx } : {}) }
    const msg = generateWAMessageFromContent(jid, message, { userJid: sock.user?.id })
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
    return describe(await waitAck(sock, msg.key.id, waitLong, { requireDelivery: true }))
  })

  // E. view once — gambar (uji apakah masalahnya khusus video)
  await run('E-viewonce-gambar', async () => {
    await execFileP('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=1:duration=1', '-frames:v', '1', '-f', 'image2', '/tmp/prw-test.jpg'], { timeout: 20_000 })
    const jpg = fs.readFileSync('/tmp/prw-test.jpg')
    const m = await sendViewOnce(sock, jid, 'image', jpg, { mimetype: 'image/jpeg' })
    return describe(await waitAck(sock, m.key.id, waitLong, { requireDelivery: true }))
  })

  // F. view once — messageContextInfo diperkaya (deviceListMetadata + versi 2),
  //    seperti yang dipakai app WhatsApp asli
  await run('F-viewonce-ctx-lengkap', async () => {
    const content = await generateWAMessageContent(
      { video: buf, mimetype: 'video/mp4', seconds: 3, width: 320, height: 320 },
      { upload: sock.waUploadToServer, logger: sock.logger, jid },
    )
    const secret = content.messageContextInfo?.messageSecret
    content.messageContextInfo = {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      ...(secret ? { messageSecret: secret } : {}),
    }
    content.videoMessage.viewOnce = true
    const msg = generateWAMessageFromContent(jid, { viewOnceMessageV2: { message: content } }, { userJid: sock.user?.id })
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
    return describe(await waitAck(sock, msg.key.id, waitLong, { requireDelivery: true }))
  })

  // G. jalur lama: sendMessage({ viewOnce: true }) → Baileys membungkus viewOnceMessage v1
  await run('G-viewonce-v1-legacy', async () => {
    const m = await sock.sendMessage(jid, { video: buf, viewOnce: true, mimetype: 'video/mp4', seconds: 3, width: 320, height: 320 })
    return describe(await waitAck(sock, m.key.id, waitLong, { requireDelivery: true }))
  })

  sock.sendNode = originalSendNode
  sock.ws?.off?.('CB:ack,class:message', onAck)
  sock.ws?.off?.('CB:receipt', onReceipt)
  out('=== RINGKASAN ===')
  for (const r of results) out(r)
  out('=== SELESAI ===')
  return results
}

export const doctorTargetJid = (sock) => jidNormalizedUser(sock.user?.lid || sock.user?.id)
