// `!animatedtext` — teks jadi stiker ANIMASI.
//   ANIMTEXT_STYLE=brat    (default) background putih, teks hitam, zoom halus
//   ANIMTEXT_STYLE=rainbow warna berganti-ganti (gaya ChisatoBOT, versi lama)
import { renderBratAnimatedWebp } from '../features/brat.js'
import { renderAnimatedTextWebp } from '../features/textsticker.js'
import { finalizeSticker } from '../features/media.js'
import { pickText } from './brat.js'
import { CONFIG } from '../config.js'

const STYLE = (process.env.ANIMTEXT_STYLE || 'brat').toLowerCase()

export default {
  name: 'animatedtext',
  aliases: ['atts', 'attp', 'animatedtextsticker', 'bratanim'],
  description: 'Ubah teks jadi stiker animasi',
  usage: '!animatedtext <teks>',

  async execute(ctx) {
    const text = pickText(ctx.rawArgs, ctx.quoted?.text)
    if (!text) return ctx.reply(`Usage: \`${CONFIG.prefix}animatedtext <teks>\`\natau balas pesan yang mau dijadikan stiker animasi.`)

    await ctx.react('⏳')
    await ctx.typing()
    try {
      const { buffer, frames } = STYLE === 'rainbow'
        ? await renderAnimatedTextWebp(text)
        : await renderBratAnimatedWebp(text)

      const sticker = await finalizeSticker(buffer, {
        packName: CONFIG.botName,
        packPublish: ctx.pushName || CONFIG.botName,
        emojis: STYLE === 'rainbow' ? ['🌈'] : ['✍️'],
      })
      console.log(`[atts] ${STYLE} "${text.slice(0, 40)}" → ${frames} frame, ${(sticker.length / 1024).toFixed(1)} KB`)
      await ctx.send({ sticker, mimetype: 'image/webp' })
      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
