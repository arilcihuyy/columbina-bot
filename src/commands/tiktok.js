// `!tiktok` — unduh video / foto / audio dari TikTok.
//
// Post FOTO (slideshow) TIDAK langsung diunduh semua: bot kirim daftar nomor dulu,
// lalu user memilih lewat perintah yang sama (`!tiktok 1 3`, `!tiktok 2-4`,
// `!tiktok semua`) — lihat src/features/tiktok-photo.js.
import { tiktokService } from '../features/tiktok.js'
import {
  parseSelection, isSelectionLike, setPending, getPending, clearPending,
  buildPhotoSelector, markSent, isComplete, MAX_PER_REQUEST,
} from '../features/tiktok-photo.js'
import { pickUrl } from './preview.js'
import { CONFIG } from '../config.js'

const AUDIO_WORDS = new Set(['audio', 'a', 'mp3', 'lagu', 'musik'])
const isTiktokUrl = (u = '') => /tiktok\.com|douyin\.com/i.test(u)
const P = () => CONFIG.prefix

function captionFor(data = {}) {
  return [data.title && `🎵 ${data.title}`, data.author && `👤 @${data.author}`].filter(Boolean).join('\n')
}

const usageText = () => [
  `Usage: \`${P()}tiktok <url>\``,
  `• video: \`${P()}tiktok <url>\``,
  `• audio: \`${P()}tiktok audio <url>\``,
  `• foto : pilih nomor setelah daftar muncul`,
].join('\n')

/** Kirim gambar yang dipilih user dari sesi yang tersimpan. */
async function pickPhotos(ctx, pending, text) {
  const sel = parseSelection(text, pending.total)

  if (sel.mode === 'cancel') {
    clearPending(ctx.jid)
    return ctx.reply('Oke, dibatalkan. Kalau mau pilih lagi, kirim link-nya sekali lagi ya.')
  }

  if (sel.mode !== 'indexes' && sel.mode !== 'all') {
    return ctx.reply(
      `❌ Pilihan tidak jelas. Ada ${pending.total} foto.\n` +
        `Contoh: \`${P()}tiktok 1\`, \`${P()}tiktok 1 3\`, \`${P()}tiktok 2-4\`, atau \`${P()}tiktok semua\`.`,
    )
  }

  const kirim = sel.indexes.slice(0, MAX_PER_REQUEST)
  const sisa = sel.indexes.slice(MAX_PER_REQUEST)

  await ctx.typing()
  await ctx.react('⏳')

  const capFirst = captionFor(pending)
  let terkirim = 0
  let gagal = 0
  const sukses = []
  for (const n of kirim) {
    const imgUrl = pending.images[n - 1]
    if (!imgUrl) { gagal++; continue }
    try {
      const buf = await tiktokService.toBuffer(imgUrl)
      const caption = terkirim === 0 && capFirst ? capFirst : `🖼️ ${n}/${pending.total}`
      await ctx.sendMedia('image', buf, caption)
      terkirim++
      sukses.push(n)
    } catch {
      gagal++
    }
  }

  if (!terkirim) {
    await ctx.react('❌')
    return ctx.reply('❌ Gambarnya gagal diunduh semua. Coba lagi sebentar ya.')
  }

  await ctx.react('✅')

  // catat yang sudah dikirim; kalau semua foto sudah terkirim, sesi ditutup
  const item = markSent(ctx.jid, sukses)
  const lengkap = isComplete(item)
  if (lengkap) clearPending(ctx.jid)

  const catatan = []
  if (sel.invalid?.length) catatan.push(`Nomor ${sel.invalid.join(', ')} diabaikan (di luar 1-${pending.total}).`)
  if (gagal) catatan.push(`${gagal} gambar gagal diunduh.`)
  if (sisa.length) catatan.push(`Sisa foto: \`${P()}tiktok ${sisa.join(' ')}\``)
  if (catatan.length) return ctx.reply(catatan.join('\n'))
  return null
}

export default {
  name: 'tiktok',
  aliases: ['tt', 'tiktokdl', 'ttdl'],
  description: 'Unduh video, foto, atau audio TikTok',
  usage: '!tiktok <url> | !tiktok audio <url> | !tiktok <nomor foto>',

  async execute(ctx) {
    const args = ctx.args ?? []
    const sub = (args[0] || '').toLowerCase()
    const audioOnly = AUDIO_WORDS.has(sub)
    const selectionText = (ctx.rawArgs || args.join(' ')).trim()
    const url = pickUrl(args, ctx.quoted?.text).replace(/[>,.)]+$/, '')
    const pending = getPending(ctx.jid)

    // ── jalur 1: user memilih nomor foto dari sesi yang tersimpan ──
    // Nomor yang diketik menang atas link di pesan yang dibalas — penting karena
    // user biasanya membalas pesan daftar foto (yang di dalamnya ada link).
    if (pending && !audioOnly && isSelectionLike(selectionText)) {
      return pickPhotos(ctx, pending, selectionText)
    }

    if (!url) {
      if (pending) {
        return ctx.reply(
          `Sesi pilih foto masih terbuka (${pending.total} foto).\n` +
            `Balas nomornya: \`${P()}tiktok 1\`, \`${P()}tiktok 1 3\`, \`${P()}tiktok semua\` — atau \`${P()}tiktok batal\`.`,
        )
      }
      if (isSelectionLike(selectionText) && selectionText) {
        return ctx.reply(`❌ Belum ada daftar foto yang terbuka. Kirim link TikTok-nya dulu: \`${P()}tiktok <url>\`.`)
      }
      return ctx.reply(usageText())
    }

    if (!isTiktokUrl(url)) return ctx.reply('❌ Cuma link TikTok yang bisa diunduh di sini.')

    await ctx.typing()
    await ctx.react('⏳')

    try {
      const result = await tiktokService.resolve(url, { audioOnly })
      const caption = captionFor(result)

      if (audioOnly) {
        const buf = await tiktokService.toBuffer(result.url, result._cookie, result._referer)
        await ctx.sendMedia('audio', buf, caption, { mimetype: 'audio/mpeg', ptt: false })
      } else if (result.type === 'video') {
        // tautan pilihan bisa kena 403 (mis. HD dari snaptik) — coba kandidat lain dulu
        const kandidat = [result.url, ...(result._alternatif ?? [])]
        let buf = null
        let errAkhir = null
        for (const u of kandidat) {
          try {
            buf = await tiktokService.toBuffer(u, result._cookie, result._referer)
            break
          } catch (e) {
            errAkhir = e
          }
        }
        if (!buf) throw new Error(errAkhir?.message || 'Gagal download video.')
        await ctx.sendMedia('video', buf, caption, { mimetype: 'video/mp4' })
      } else if (result.type === 'slideshow') {
        const images = result.images ?? []
        if (!images.length) {
          await ctx.react('❌')
          return ctx.reply('❌ Post ini tidak punya gambar yang bisa diunduh.')
        }

        if (images.length === 1) {
          const buf = await tiktokService.toBuffer(images[0])
          await ctx.sendMedia('image', buf, caption)
        } else {
          // JANGAN unduh semua — kirim daftar pilihan dulu
          setPending(ctx.jid, { images, title: result.title, author: result.author, url, total: images.length })
          await ctx.reply(buildPhotoSelector({
            total: images.length, title: result.title, author: result.author, url, prefix: P(),
          }))
        }
      } else {
        await ctx.react('❌')
        return ctx.reply(`❌ Tipe post tidak didukung: ${result.type}`)
      }

      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
