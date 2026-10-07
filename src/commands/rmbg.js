import { removeBg, transparencyRatio } from '../features/rmbg.js'

const COOLDOWN_MS = 15_000
const last = new Map()

export default {
  name: 'rmbg',
  aliases: ['removebg', 'nobg', 'bgremove'],
  description: 'Hapus background gambar jadi PNG transparan',
  usage: '!rmbg (reply gambar, atau kirim gambar + caption)',

  async execute(ctx) {
    const jid = ctx.sender
    const now = Date.now()
    if (now - (last.get(jid) || 0) < COOLDOWN_MS) {
      return ctx.reply('⏳ Sabar ya, proses ini berat. Coba lagi beberapa detik.')
    }

    const target = ctx.quoted?.isMedia ? ctx.quoted : ctx.media
    if (!target) return ctx.reply('Reply gambar dengan `!rmbg`, atau kirim gambarnya sekalian dengan caption `!rmbg`')

    await ctx.react('⏳')
    await ctx.typing()
    try {
      const input = await target.download()
      if (!input) return ctx.reply('Gagal download media.')

      const { png, ms } = await removeBg(input)
      const ratio = await transparencyRatio(png)
      if (ratio < 0.01) {
        await ctx.react('❌')
        return ctx.reply('Gagal menghapus background — coba gambar lain.')
      }

      // WAJIB dokumen: gambar biasa dikompres ulang WA jadi JPEG → transparansi hilang.
      // Dokumen lewat tanpa diolah → file .png utuh, background benar-benar hilang saat disimpan.
      await ctx.send({
        document: png,
        mimetype: 'image/png',
        fileName: `rmbg-${Date.now()}.png`,
        caption: `Background dihapus ✨ (${(ms / 1000).toFixed(1)}s) — simpan langsung, tetap PNG transparan`,
      })
      await ctx.react('✅')
      last.set(jid, now)
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
