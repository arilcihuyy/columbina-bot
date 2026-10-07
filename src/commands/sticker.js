// Command handler. Tiap file export default: { name, aliases, description, usage, execute }
// execute menerima hasil parseMessage() dari core/parser.js.
import { toStickerBuffer } from '../features/media.js'
import { CONFIG } from '../config.js'

export default {
  name: 'sticker',
  aliases: ['s', 'stiker', 'sgif'],
  description: 'Buat stiker dari gambar/video (reply medianya)',
  usage: '!sticker [nama pack]',

  async execute(ctx) {
    const target = ctx.quoted?.isMedia ? ctx.quoted : ctx.media
    if (!target) return ctx.reply('Reply gambar/video dengan `!sticker`, atau kirim medianya sekalian dengan caption `!sticker`')

    await ctx.react('⏳')
    await ctx.typing()
    try {
      const buffer = await target.download()
      if (!buffer) return ctx.reply('Gagal download media.')

      const meta = ctx.rawArgs?.trim()
        ? { packName: ctx.rawArgs.trim(), packPublish: ctx.pushName || CONFIG.botName, emojis: ['✨'] }
        : {}
      const sticker = await toStickerBuffer(buffer, meta)

      await ctx.send({
        sticker,
        mimetype: 'image/webp',
        ptt: false,
        contextInfo: { forwardingScore: 0, isForwarded: false },
      })
      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
