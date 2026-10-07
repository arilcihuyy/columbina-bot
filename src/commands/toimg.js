import { webpToPng } from '../features/media.js'

export default {
  name: 'toimg',
  aliases: ['toimage', 'img', 'jpg', 'png'],
  description: 'Ubah stiker jadi foto PNG',
  usage: '!toimg (reply stiker)',

  async execute(ctx) {
    const quoted = ctx.quoted
    if (!quoted?.isMedia || quoted.type !== 'stickerMessage') {
      return ctx.reply('Reply stiker dengan `!toimg`')
    }

    await ctx.react('⏳')
    await ctx.typing()
    try {
      const buffer = await quoted.download()
      if (!buffer) return ctx.reply('Gagal download stiker.')

      const png = await webpToPng(buffer)
      await ctx.sendMedia('image', png, '', { mimetype: 'image/png' })
      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
