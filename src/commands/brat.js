// `!brat` — ubah teks jadi stiker gaya BRAT (background putih, teks hitam, huruf
// kecil, ditarik 1.5× ke atas). Resepnya dibedah dari bratgenerator.io.
//
// Env:
//   TEXTSTICKER_STYLE=brat|classic  (default brat; classic = teks putih transparan)
//   BRAT_BG / BRAT_FG / BRAT_BLUR / BRAT_STRETCH / BRAT_PAD / BRAT_CASE / BRAT_FONT / BRAT_FIT
import { renderBratPng } from '../features/brat.js'
import { renderTextPng } from '../features/textsticker.js'
import { toStickerBuffer } from '../features/media.js'
import { CONFIG } from '../config.js'

const STYLE = (process.env.TEXTSTICKER_STYLE || 'brat').toLowerCase()

/** Sumber teks: argumen command, kalau kosong ambil dari pesan yang dibalas. */
export function pickText(rawArgs = '', quotedText = '') {
  const own = String(rawArgs || '').trim()
  if (own) return own
  return String(quotedText || '').trim()
}

export default {
  name: 'brat',
  aliases: ['textsticker', 'texttosticker', 'ttp', 't2s', 'bratsticker'],
  description: 'Ubah teks jadi stiker brat',
  usage: '!brat <teks>',

  async execute(ctx) {
    const text = pickText(ctx.rawArgs, ctx.quoted?.text)
    if (!text) return ctx.reply(`Usage: \`${CONFIG.prefix}brat <teks>\`\natau balas pesan yang mau dijadikan stiker.`)

    await ctx.react('⏳')
    await ctx.typing()
    try {
      const { buffer: png, info } = STYLE === 'classic'
        ? { buffer: await renderTextPng(text), info: null }
        : await renderBratPng(text)
      if (info) console.log(`[brat] "${info.text}" font ${info.fontSize.toFixed(1)}px ${info.lines.length} baris`)

      const sticker = await toStickerBuffer(png, {
        packName: CONFIG.botName,
        packPublish: ctx.pushName || CONFIG.botName,
        emojis: ['✍️'],
      })
      await ctx.send({ sticker, mimetype: 'image/webp' })
      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
