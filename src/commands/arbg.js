// !arbg — hapus background via Adobe Express (Firefly).
// Kualitas jauh di atas rembg lokal, tapi butuh sesi login Adobe ±40-60 dtk/gambar.
// Kalau Adobe error, arahan ke !rmbg (mesin lokal) sebagai alternatif.
import { adobeRemoveBg, isArbgBusy, transparencyRatio } from '../features/arbg.js'

const COOLDOWN_MS = 30_000
const last = new Map()

function friendly(err) {
  const m = err?.message || String(err)
  if (m.includes('BUSY')) return 'Adobe lagi memproses gambar lain, coba ~1 menit lagi.'
  if (m.includes('SESSION_EXPIRED')) return 'Sesi login *Adobe Express* kedaluwarsa. Bilang ke pemilik bot untuk login ulang dulu ya.'
  if (m.includes('ADOBE_TIMEOUT')) return 'Adobe Express terlalu lama merespons (5 menit). Coba lagi nanti.'
  if (m.includes('NO_DOWNLOAD')) return 'Adobe tidak mengembalikan hasilnya. Coba gambar lain, atau coba lagi sebentar lagi.'
  if (m.includes('NO_INPUT') || m.includes('adobe exit')) return 'Mesin Adobe Express-nya bermasalah. Coba lagi nanti.'
  return m
}

export default {
  name: 'arbg',
  aliases: ['adobebg', 'bgadobe'],
  description: 'Hapus background via Adobe Express (kualitas tinggi)',
  usage: '!arbg — balas gambar, atau kirim gambar + caption !arbg',

  async execute(ctx) {
    const jid = ctx.sender
    const now = Date.now()
    if (now - (last.get(jid) || 0) < COOLDOWN_MS) {
      return ctx.reply('⏳ Sabar ya, cooldown sebentar.')
    }

    const target = ctx.quoted?.isMedia ? ctx.quoted : ctx.media
    if (!target) return ctx.reply('Reply gambar dengan `!arbg`, atau kirim gambarnya sekalian caption `!arbg`.')

    if (isArbgBusy()) {
      return ctx.reply('⏳ Adobe lagi memproses gambar lain, coba ~1 menit lagi ya.')
    }

    await ctx.react('⏳')
    await ctx.typing()
    // penjelasan: fitur ini lewat Adobe Express — sengaja dikasih tahu sejak awal
    await ctx.reply('🎨 Diproses lewat *Adobe Express* (Firefly)... ±40–60 detik, sabar ya.')

    try {
      const input = await target.download()
      if (!input) return ctx.reply('Gagal download media.')

      const { png, ms } = await adobeRemoveBg(input)
      const ratio = await transparencyRatio(png)
      if (ratio < 0.01) {
        await ctx.react('❌')
        return ctx.reply('Hasil dari Adobe tidak transparan — coba gambar lain, atau pakai `!rmbg`.')
      }

      // WAJIB dokumen: gambar biasa dikompres ulang WA jadi JPEG → transparansi hilang.
      await ctx.send({
        document: png,
        mimetype: 'image/png',
        fileName: `arbg-${Date.now()}.png`,
        caption: `Background dihapus via *Adobe Express* ✨ (${(ms / 1000).toFixed(1)}s) — simpan langsung, tetap PNG transparan`,
      })
      await ctx.react('✅')
      last.set(jid, now)
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${friendly(err)}\n\nAlternatif: coba *\`!rmbg\`* (mesin lokal, gratis, lebih cepat).`)
    }
  },
}