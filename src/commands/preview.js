// Preview TikTok sebagai pesan SEKALI LIHAT (view once).
//
// Alurnya: resolve link → download → kirim lewat viewOnceMessageV2 (lihat
// src/features/viewonce.js) → tunggu konfirmasi server WhatsApp.
//
// Catatan penting soal ACK (temuan 2026-09-15): server selalu mengirim
// `<ack class="message">` untuk pesan yang kita kirim, tapi Baileys tidak
// meneruskan ack sukses ke `messages.update`. Karena itu konfirmasi dibaca dari
// event `CB:ack,class:message` (lihat waitAck). Kalau server MENOLAK, kita
// jatuhkan diri ke pengiriman video biasa supaya videonya tetap sampai.
import { tiktokService } from '../features/tiktok.js'
import { sendViewOnce, waitAck, ACK_TIMEOUT_MS } from '../features/viewonce.js'

const TT_URL_RE = /https?:\/\/(?:[\w-]+\.)*(?:tiktok\.com|douyin\.com)\/[^\s]+/i
const ANY_URL_RE = /https?:\/\/[^\s]+/i

// Sumber URL: argumen command dulu, kalau kosong ambil dari pesan yang di-quote.
// Dipisah jadi fungsi murni supaya bisa diuji tanpa jaringan.
export function pickUrl(args = [], quotedText = '') {
  const all = [...(args || []), String(quotedText || '')].join(' ').trim()
  if (!all) return ''
  const tt = all.match(TT_URL_RE)
  if (tt) return tt[0]
  const any = all.match(ANY_URL_RE)
  return any ? any[0] : ''
}

const isTiktok = (url = '') => /tiktok\.com|douyin\.com/i.test(url)

export default {
  name: 'preview',
  aliases: ['prw', 'pv'],
  description: 'Preview video TikTok sekali lihat',
  usage: '!prw <url tiktok> — atau balas pesan yang berisi link',

  async execute(ctx) {
    const url = pickUrl(ctx.args, ctx.quoted?.text).replace(/[>,.]$/, '')
    if (!url) {
      return ctx.reply('Usage: `!prw <url tiktok>`\natau balas pesan yang ada link TikTok-nya.')
    }
    if (!isTiktok(url)) return ctx.reply('❌ Cuma link TikTok yang bisa dipreview.')

    await ctx.typing()
    await ctx.react('⏳')

    try {
      const result = await tiktokService.resolve(url)

      // ── post foto: kirim tiap fotonya sekali lihat (maks 10) ──
      if (result.type === 'slideshow') {
        let last = null
        for (const imgUrl of result.images.slice(0, 10)) {
          const buf = await tiktokService.toBuffer(imgUrl)
          last = await sendViewOnce(ctx.sock, ctx.jid, 'image', buf, { mimetype: 'image/jpeg' })
        }
        const ack = last ? await waitAck(ctx.sock, last.key.id, ACK_TIMEOUT_MS()) : null
        if (ack && !ack.ok) {
          await ctx.react('⚠️')
          return ctx.reply('⚠️ WhatsApp nolak pesan sekali lihat-nya. Coba `!tiktok <url>` buat versi biasa.')
        }
        return ctx.react('✅')
      }

      if (result.type !== 'video') {
        await ctx.react('❌')
        return ctx.reply('❌ Post ini tidak punya video/foto. Pakai `!tiktok audio <url>` buat audionya.')
      }

      // ── video ──
      const buf = await tiktokService.toBuffer(result.url, result._cookie)
      const media = {
        mimetype: 'video/mp4',
        ...(result.duration ? { seconds: result.duration } : {}),
        ...(result.width ? { width: result.width } : {}),
        ...(result.height ? { height: result.height } : {}),
      }

      let ack = null
      let msg = null
      let gagal = null
      try {
        msg = await sendViewOnce(ctx.sock, ctx.jid, 'video', buf, media)
        ack = await waitAck(ctx.sock, msg.key.id, ACK_TIMEOUT_MS(), { requireDelivery: true })
        console.log(`[prw] viewOnceV2 id=${msg.key.id} → ${ack ? `ok=${ack.ok} status=${ack.status} delivered=${!!ack.delivered}${ack.error ? ` error=${ack.error}` : ''}` : 'TIDAK ADA KABAR'}`)
      } catch (err) {
        gagal = err
        console.error('[prw] viewOnceMessageV2 gagal:', err?.message)
      }

      // sukses: server terima (status 2). Receipt dari HP boleh datang belakangan.
      if (ack?.ok) {
        if (!ack.delivered) console.log(`[prw] id=${msg?.key?.id} diterima server, receipt HP belum turun`)
        return ctx.react('✅')
      }

      // gagal: jangan diam — kirim versi biasa supaya videonya tetap sampai
      console.error(`[prw] sekali lihat gagal (${gagal?.message || ack?.error || 'tanpa kabar'}) — fallback video biasa`)
      await ctx.send({ video: buf, ...media })
      await ctx.react('⚠️')
      return ctx.reply(
        '⚠️ Pesan sekali lihat ditolak WhatsApp, jadi kukirim sebagai video biasa ya.\n' +
          (ack?.error ? `(alasan server: ${ack.error})` : ''),
      )
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
