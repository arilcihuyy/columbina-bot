// Kirim media sebagai pesan SEKALI LIHAT (view once) — versi yang benar untuk Baileys 7.
//
// Kenapa TIDAK pakai `{ viewOnce: true }` biasa?
// Baileys 7.0.0-rc13/rc14 masih bug (WhiskeySockets/Baileys#2678): flag itu dibungkus
// jadi `viewOnceMessage` versi LAMA — `sendMessage()` sukses, tapi pesannya TIDAK PERNAH
// sampai ke penerima dan ACK tidak turun. Jadi: bikin konten media TANPA flag itu, lalu
// bungkus sendiri pakai `viewOnceMessageV2` (wrapper yang dipakai app WhatsApp sekarang)
// dan kirim lewat relayMessage.
//
// PENTING soal ACK (temuan 2026-09-15, dari diagnosa stanza nyata):
// - Server WhatsApp mengirim `<ack class="message" id="…">` untuk SETIAP pesan yang kita
//   kirim — termasuk yang sukses. Tapi Baileys TIDAK meneruskan ack sukses itu ke event
//   `messages.update` (hanya ack BERISI ERROR yang diteruskan). Jadi menunggu
//   `messages.update` saja = selalu "tidak ada ACK" walau pesan terkirim.
// - Yang benar: dengar `ws.on('CB:ack,class:message')` = server terima (status 2),
//   lalu opsional tunggu receipt dari HP penerima (status 3 = sampai).
import { generateWAMessageContent, generateWAMessageFromContent } from '@whiskeysockets/baileys'

// proto.WebMessageInfo.Status
const STATUS = { ERROR: 0, PENDING: 1, SERVER_ACK: 2, DELIVERY_ACK: 3 }
const MEDIA_KEY = { image: 'imageMessage', video: 'videoMessage', audio: 'audioMessage' }

export const wrapViewOnceV2 = (content) => ({ viewOnceMessageV2: { message: content } })

/**
 * Kirim media sebagai pesan sekali lihat.
 * @returns {Promise<object>} WAMessage yang dikirim (punya .key.id untuk dilacak ACK-nya)
 */
export async function sendViewOnce(sock, jid, kind, media, opts = {}) {
  if (!sock?.relayMessage) throw new Error('Socket tidak mendukung relayMessage')
  if (typeof sock.waUploadToServer !== 'function') throw new Error('Socket tidak punya waUploadToServer')

  const content = await generateWAMessageContent(
    { [kind]: media, ...opts },
    { upload: sock.waUploadToServer, logger: sock.logger, jid },
  )

  const key = MEDIA_KEY[kind] || Object.keys(content || {})[0]
  if (!content?.[key]) throw new Error(`Gagal menyiapkan media sekali lihat (${kind})`)

  // app WhatsApp mengirim viewOnce: true DI DALAM media, bukan cuma di wrapper
  content[key].viewOnce = true

  const msg = generateWAMessageFromContent(jid, wrapViewOnceV2(content), { userJid: sock.user?.id })
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
  return msg
}

/**
 * Tunggu konfirmasi WhatsApp untuk pesan yang kita kirim.
 *
 * @param {object} opts
 * @param {boolean} opts.requireDelivery true = tunggu receipt dari HP penerima (status 3);
 *   kalau yang datang cuma ack server, hasilnya tetap {ok:true, status:2, delivered:false}
 * @returns {Promise<null|{ok:boolean,status:number,server?:boolean,delivered?:boolean,error?:string,from?:string}>}
 *   status 2 = diterima server, 3 = sampai ke penerima, 0 = DITOLAK server,
 *   null = tidak ada kabar sama sekali (paling parah: pesan tidak terkirim)
 */
export function waitAck(sock, id, timeoutMs = 15_000, { requireDelivery = false } = {}) {
  return new Promise((resolve) => {
    let timer
    let best = null // ack terbaik yang sudah didapat (biar tidak hilang saat timeout)

    const cleanup = () => {
      clearTimeout(timer)
      sock.ev.off('messages.update', onUpdate)
      sock.ev.off('message-receipt.update', onReceipt)
      sock.ws?.off?.('CB:ack,class:message', onServerAck)
    }
    const finish = (val) => {
      cleanup()
      resolve(val)
    }

    // ack langsung dari server: sukses (tanpa error) atau ditolak (attrs.error)
    const onServerAck = (node) => {
      const attrs = node?.attrs
      if (!attrs || attrs.id !== id) return
      if (attrs.error) return finish({ ok: false, status: STATUS.ERROR, error: attrs.error, server: true })
      best = { ok: true, status: STATUS.SERVER_ACK, server: true, delivered: false, t: attrs.t }
      if (!requireDelivery) return finish(best)
    }

    const onUpdate = (updates = []) => {
      const hit = (updates || []).find((u) => u?.key?.id === id)
      if (!hit) return
      const status = hit.update?.status
      if (status === STATUS.ERROR) {
        return finish({ ok: false, status: STATUS.ERROR, error: hit.update?.messageStubParameters?.[0] ?? 'unknown' })
      }
      if (typeof status === 'number' && status >= STATUS.DELIVERY_ACK) {
        return finish({ ok: true, status, delivered: true })
      }
      if (typeof status === 'number' && status >= STATUS.SERVER_ACK) {
        best = best || { ok: true, status, server: true, delivered: false }
        if (!requireDelivery) return finish(best)
      }
    }

    // grup: receipt penerima datang lewat message-receipt.update
    const onReceipt = (receipts = []) => {
      const hit = (receipts || []).find((r) => r?.key?.id === id)
      if (hit) return finish({ ok: true, status: STATUS.DELIVERY_ACK, delivered: true, from: hit.receipt?.userJid })
    }

    timer = setTimeout(() => finish(best), timeoutMs)
    sock.ev.on('messages.update', onUpdate)
    sock.ev.on('message-receipt.update', onReceipt)
    sock.ws?.on?.('CB:ack,class:message', onServerAck)
  })
}

// batas tunggu ACK. Kalau pesan sampai ke HP, receipt datang ~1 detik jadi tidak
// menunggu lama; angka ini cuma batas atas saat HP penerima sedang offline.
export const ACK_TIMEOUT_MS = () => Number(process.env.PRW_ACK_TIMEOUT_MS || 10_000)
